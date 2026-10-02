-- T-012 · Nota clínica: borrador, firma y versión sellada (corte A, solo base de datos).
--
-- Diseño: tickets/T-012/diseno.md §1.2. ADR-036 (borrador y bloqueo optimista), ADR-046
-- (`abierta_en` no es una casilla; el margen de sesión se sella con la nota), D2 del
-- propietario del 01-10-2026 (firmar resuelve la alerta `nota_sin_firmar`).
--
-- Orden de los pasos = parte del diseño:
--   1-3  `borrador_abierta_en`, su relleno y su check (el relleno va ANTES del check).
--   4    `fn_tocar_borrador()` endurecido: el llamante no elige ni `abierta_en` ni el testigo.
--   6    margen de sesión: organización (15 min) y centro (hereda).
--   8    un solo borrador por cita y autor.
--   9    `fn_resolver_alerta_nota_sin_firmar()`: el único `security definer` nuevo.
-- `fn_vaciar_borrador_al_firmar()` ya existe (T-005): no se crea otra. Con el paso 4, vaciar
-- `borrador_contenido` vacía también `borrador_abierta_en`, en la misma transacción que la firma.

-- 1 · `abierta_en` en una columna propia, escrita SOLO por disparador. Dentro de
--     `borrador_contenido` la escribiría el cliente por PostgREST (grant update de tabla entera).
alter table public.notas_clinicas
  add column borrador_abierta_en timestamptz;

comment on column public.notas_clinicas.borrador_abierta_en is
  'Instante en que se abrió el editor para este borrador (ADR-046). Lo fija fn_tocar_borrador() '
  'la primera vez que hay borrador y lo conserva mientras dure; lo que mande el cliente se ignora. '
  'Firmar o descartar el borrador lo vacía junto con las otras dos columnas del borrador.';

-- 2 · Relleno de lo existente, antes del check y del disparador nuevo.
update public.notas_clinicas
   set borrador_abierta_en = borrador_actualizado_en
 where borrador_contenido is not null;

-- 3 · Todo o nada con el contenido (comparación de nulidad, no num_nonnulls mezclado).
alter table public.notas_clinicas
  add constraint notas_clinicas_borrador_abierta_ck
  check ((borrador_abierta_en is null) = (borrador_contenido is null));

-- 4 · El disparador del borrador. Misma firma, mismo disparador, sigue siendo invoker.
create or replace function public.fn_tocar_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.borrador_contenido is null then
    -- Descartar o firmar limpia las cuatro columnas a la vez (checks todo-o-nada).
    new.borrador_actualizado_en := null;
    new.borrador_autor_id := null;
    new.borrador_abierta_en := null;
  else
    -- abierta_en: la primera vez now(), después la que ya había. Lo que mande el llamante se
    -- ignora SIEMPRE (ADR-046: no es una casilla).
    new.borrador_abierta_en := coalesce(
      case when TG_OP = 'UPDATE' then old.borrador_abierta_en end, now());
    if TG_OP = 'INSERT' or new.borrador_contenido is distinct from old.borrador_contenido then
      new.borrador_actualizado_en := now();
    else
      -- Sin cambio de contenido el testigo tampoco cambia: antes sobrevivía el que mandara el
      -- cliente y el bloqueo optimista se podía falsear.
      new.borrador_actualizado_en := old.borrador_actualizado_en;
    end if;
  end if;
  return new;
end;
$$;

-- 6 · Margen de sesión (ADR-046). Nulo en el centro = hereda de la organización, igual que
--     `zona_horaria`. Los 15 minutos los confirmó el propietario el 15-09-2026.
alter table public.organizacion
  add column margen_sesion_minutos smallint not null default 15
  check (margen_sesion_minutos between 0 and 120);

alter table public.centros
  add column margen_sesion_minutos smallint
  check (margen_sesion_minutos between 0 and 120);

comment on column public.organizacion.margen_sesion_minutos is
  'Margen en minutos a cada lado de la cita para considerar una nota «escrita durante la sesión» '
  '(ADR-046). Se sella dentro de cada nota al firmar: cambiarlo no reescribe el pasado.';
comment on column public.centros.margen_sesion_minutos is
  'Margen de sesión propio del centro (ADR-046); nulo = hereda el de la organización.';

-- 8 · Un borrador por cita y autor: dos aperturas simultáneas de la misma cita (StrictMode, dos
--     dispositivos) no crean dos cabeceras con dos `abierta_en`; la segunda recibe 23505 y relee.
create unique index notas_clinicas_cita_autor_uidx
  on public.notas_clinicas (cita_id, autor_id)
  where cita_id is not null;

-- 9 · Firmar resuelve la alerta `nota_sin_firmar` de SU cita (D2). Gemela de
--     `fn_alertar_nota_sin_firmar()`, que también es definer: resolver no puede depender de que
--     la política de alertas deje ver la fila a quien firma.
create function public.fn_resolver_alerta_nota_sin_firmar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita uuid;
begin
  -- La cita cuenta solo si es DE ESTA NOTA: mismo paciente y su profesional es el autor.
  -- notas_clinicas.cita_id no está atado a la cita por ninguna otra regla y esta función es
  -- definer: sin estas dos condiciones, firmar una nota propia con el cita_id de una cita ajena
  -- cerraría una alerta que quien firma no puede ni ver.
  select c.id into v_cita
    from public.notas_clinicas n
    join public.citas c on c.id = n.cita_id
   where n.id = new.nota_id
     and c.paciente_id    = n.paciente_id
     and c.profesional_id = n.autor_id;

  if v_cita is null then             -- nota sin cita, o cita que no es de esta nota
    return null;
  end if;

  update public.alertas_documentacion
     set estado = 'resuelta', resuelta_en = now()
   where origen_tabla = 'citas'
     and origen_id    = v_cita
     and tipo         = 'nota_sin_firmar'
     and estado       = 'abierta';     -- la v2 no mueve el resuelta_en que dejó la v1
  return null;
end;
$$;

comment on function public.fn_resolver_alerta_nota_sin_firmar() is
  'Al insertarse una versión de nota, da por resuelta la alerta nota_sin_firmar de la cita de esa '
  'nota (misma paciente y mismo profesional). No lee ni escribe nada clínico: de notas_clinicas '
  'solo cita_id, paciente_id y autor_id; de la alerta solo estado y resuelta_en. Nunca lanza.';

revoke execute on function public.fn_resolver_alerta_nota_sin_firmar() from public;

create trigger resolver_alerta_nota_sin_firmar
  after insert on public.notas_clinicas_versiones
  for each row execute function public.fn_resolver_alerta_nota_sin_firmar();
