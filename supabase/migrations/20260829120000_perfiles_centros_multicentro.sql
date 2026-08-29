-- =========================================================================
-- T-002 · Enmienda del ADR-051 — un profesional pasa consulta en varios centros
-- =========================================================================
--
-- La pertenencia a centro deja de ser una columna y pasa a ser una relación con
-- vigencia. Entra ANTES de la revisión con Opus: revisar un juego de políticas que
-- vamos a cambiar es trabajo tirado, y hoy no hay una sola fila real dentro.
--
-- LO QUE ESTA ENMIENDA NO CAMBIA, Y CONVIENE DECIRLO ALTO
-- ------------------------------------------------------
-- El centro NO decide qué pacientes lee un profesional, y nunca lo ha decidido. El
-- profesional lee los suyos vía es_profesional_asignado(), que mira
-- pacientes.profesional_id y NO consulta el centro. centros_actuales() acota al
-- técnico administrativo y a nadie más. Por tanto cerrar la pertenencia de un
-- profesional a un centro no le quita ni un paciente: lo que le retira el acceso es la
-- baja del perfil (ADR-032) o que el administrador desasigne.
--
-- DECISIÓN DE DISEÑO · «vigente» es exactamente `hasta is null`
-- ------------------------------------------------------------
-- Un índice único parcial no puede usar current_date en su predicado —no es inmutable—,
-- así que si «vigente» se definiera por rango de fechas, el índice y el tiempo de
-- ejecución dirían cosas distintas y habría una ventana con dos principales.
-- Se cierra la grieta igualando las dos definiciones: vigente ES `hasta is null`, y un
-- `check` impide fechar el cierre en el futuro. Consecuencias buscadas:
--   · cerrar una pertenencia surte efecto EN LA MISMA SESIÓN, que es el criterio;
--   · `desde` queda como dato histórico, no gobierna la vigencia.
--
-- Referencias: ADR-051 (multi-centro), ADR-033 (el centro del paciente decide su
-- retención durante veinticinco años), ADR-032 (baja del profesional).


-- =========================================================================
-- 1 · La tabla
-- =========================================================================

-- `id` no es decorativo: fn_auditar() escribe registro_id con `to_jsonb(new) ->> 'id'`,
-- así que una tabla auditada sin columna `id` deja el registro de auditoría sin a qué
-- fila apuntar.
create table if not exists public.perfiles_centros (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  centro_id  uuid not null references public.centros (id),
  principal  boolean not null default false,
  desde      date not null default current_date,
  hasta      date,
  creado_en  timestamptz not null default now(),

  constraint perfiles_centros_vigencia_coherente
    check (hasta is null or hasta >= desde),

  -- El cierre no se fecha en el futuro: si se pudiera, una fila cerrada «para dentro de
  -- un mes» seguiría siendo vigente hoy y el índice único de abajo no la vería. Es la
  -- mitad de la decisión de diseño del encabezado. La condición es monótona —una vez
  -- cierta, lo sigue siendo—, así que no rompe una restauración.
  constraint perfiles_centros_cierre_no_futuro
    check (hasta is null or hasta <= current_date)
);

comment on table public.perfiles_centros is
  'Pertenencia de un perfil a un centro, con vigencia (ADR-051). Vigente ES hasta is null. '
  'Se cierra poniendo hasta; NUNCA se borra.';

comment on column public.perfiles_centros.principal is
  'El centro principal decide el centro_id de los pacientes que da de alta ese profesional, '
  'y con él su política de retención (ADR-033). Uno solo vigente por perfil.';

-- Un solo principal vigente por perfil.
create unique index if not exists perfiles_centros_un_principal_vigente
  on public.perfiles_centros (perfil_id)
  where principal and hasta is null;

-- Una sola pertenencia vigente por par perfil-centro.
create unique index if not exists perfiles_centros_una_vigente_por_par
  on public.perfiles_centros (perfil_id, centro_id)
  where hasta is null;

-- Índices de clave ajena: los recorren centros_actuales() y el disparador de espejo.
create index if not exists perfiles_centros_perfil_id_idx
  on public.perfiles_centros (perfil_id);
create index if not exists perfiles_centros_centro_id_idx
  on public.perfiles_centros (centro_id);


-- =========================================================================
-- 2 · Relleno desde la columna que ya existía
-- =========================================================================
--
-- Migración hacia delante y no destructiva: perfiles.centro_id NO se borra, pasa a ser
-- espejo del principal. Todo lo que hoy lee esa columna sigue funcionando el primer día.
-- Va ANTES de crear el disparador de espejo, para que el relleno no dispare una escritura
-- de vuelta sobre perfiles por cada fila.
insert into public.perfiles_centros (perfil_id, centro_id, principal)
select p.id, p.centro_id, true
from public.perfiles p
where p.centro_id is not null
on conflict do nothing;


-- =========================================================================
-- 3 · El espejo: perfiles.centro_id sigue al principal vigente
-- =========================================================================

create or replace function public.fn_espejar_centro_principal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil     uuid;
  v_principal  uuid;
begin
  -- En DELETE `new` es nulo y en INSERT lo es `old`; el coalesce cubre los tres casos.
  v_perfil := coalesce(new.perfil_id, old.perfil_id);

  select pc.centro_id into v_principal
  from public.perfiles_centros pc
  where pc.perfil_id = v_perfil
    and pc.principal
    and pc.hasta is null;

  -- Si el perfil se queda sin principal vigente, el espejo se pone a nulo. Para un
  -- técnico administrativo eso VIOLA `perfiles_tecnico_exige_centro` y el cierre falla:
  -- es exactamente la tarea «el técnico exige al menos una pertenencia vigente». Sin
  -- centro no hay recorte, y sin recorte vería la organización entera.
  update public.perfiles p
     set centro_id = v_principal
   where p.id = v_perfil
     and p.centro_id is distinct from v_principal;

  return null;
end;
$$;

comment on function public.fn_espejar_centro_principal() is
  'Mantiene perfiles.centro_id como espejo del centro principal vigente (ADR-051).';

drop trigger if exists espejar_centro_principal on public.perfiles_centros;
create trigger espejar_centro_principal
  after insert or update or delete on public.perfiles_centros
  for each row execute function public.fn_espejar_centro_principal();


-- =========================================================================
-- 3 bis · El alta de usuario tiene que crear la PERTENENCIA, no solo el espejo
-- =========================================================================
--
-- fn_crear_perfil_de_usuario() escribía `perfiles.centro_id` a partir de
-- `raw_user_meta_data ->> 'centro_id'`. Con la enmienda esa columna es el espejo, así que
-- tal cual quedaba el espejo relleno y la fuente de verdad VACÍA: centros_actuales()
-- devolvería cero filas y un técnico recién creado no vería nada — o, peor, el invariante
-- «espejo = principal vigente» nacería roto y nadie lo notaría hasta la primera consulta.
--
-- El relleno del punto 2 no cubre esto: solo corre una vez, al migrar.
--
-- Orden importante: primero `perfiles` CON centro_id —el check
-- `perfiles_tecnico_exige_centro` se evalúa en ese insert y un técnico sin centro no
-- pasaría— y después la pertenencia. El disparador de espejo no hace nada, porque el
-- valor ya coincide.
create or replace function public.fn_crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_texto text := new.raw_user_meta_data ->> 'rol';
  v_rol       public.rol_usuario;
  v_centro    uuid := nullif(new.raw_user_meta_data ->> 'centro_id', '')::uuid;
  v_nombre    text := nullif(trim(new.raw_user_meta_data ->> 'nombre_completo'), '');
begin
  if v_rol_texto is null or trim(v_rol_texto) = '' then
    raise exception
      'Alta rechazada: falta "rol" en raw_user_meta_data del usuario %.', new.email
      using errcode = '22023';
  end if;

  begin
    v_rol := v_rol_texto::public.rol_usuario;
  exception when invalid_text_representation then
    raise exception
      'Alta rechazada: rol "%" desconocido para el usuario %.', v_rol_texto, new.email
      using errcode = '22023';
  end;

  insert into public.perfiles (id, nombre_completo, rol, centro_id)
  values (new.id, coalesce(v_nombre, new.email, 'Sin nombre'), v_rol, v_centro)
  on conflict (id) do nothing;

  -- El centro de los metadatos es el PRINCIPAL. Los demás los añade el administrador
  -- desde Ajustes; aquí solo nace el primero (ADR-051).
  if v_centro is not null then
    insert into public.perfiles_centros (perfil_id, centro_id, principal)
    values (new.id, v_centro, true)
    on conflict do nothing;
  end if;

  return new;
end;
$$;


-- =========================================================================
-- 4 · Las funciones de centro
-- =========================================================================

-- Todos los centros vigentes del usuario actual. Es la que acota al técnico.
create or replace function public.centros_actuales()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.centro_id
  from public.perfiles_centros pc
  join public.perfiles p on p.id = pc.perfil_id
  where pc.perfil_id = (select auth.uid())
    and pc.hasta is null
    and p.estado = 'activo'::public.estado_perfil;
$$;

comment on function public.centros_actuales() is
  'Centros vigentes del perfil activo (ADR-051). Acota al técnico administrativo y a nadie más.';


-- El principal de UN perfil cualquiera, no del que mira. La usa el relleno de
-- pacientes.centro_id, que necesita el centro del profesional asignado.
--
-- NO filtra por estado del perfil, a propósito y por paridad con lo que había: dar de
-- alta un paciente a nombre de un profesional recién puesto de baja debe seguir
-- decidiendo su retención igual. Quién puede hacer esa alta lo gobierna la política, no
-- esta función.
create or replace function public.centro_principal(p_perfil_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.centro_id
  from public.perfiles_centros pc
  where pc.perfil_id = p_perfil_id
    and pc.principal
    and pc.hasta is null;
$$;

comment on function public.centro_principal(uuid) is
  'Centro principal vigente de un perfil (ADR-051). Decide la retención del paciente que da de alta (ADR-033).';


-- Se CONSERVA, devolviendo el principal. Lee de perfiles_centros y no del espejo:
-- el espejo es una comodidad para lo que ya existía, no la fuente de verdad.
create or replace function public.centro_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.centro_id
  from public.perfiles_centros pc
  join public.perfiles p on p.id = pc.perfil_id
  where pc.perfil_id = (select auth.uid())
    and pc.principal
    and pc.hasta is null
    and p.estado = 'activo'::public.estado_perfil;
$$;

comment on function public.centro_actual() is
  'Centro PRINCIPAL vigente del perfil activo (ADR-051). Para acotar al técnico usa centros_actuales().';


revoke execute on function public.centros_actuales()          from public;
revoke execute on function public.centro_principal(uuid)      from public;
revoke execute on function public.centro_actual()             from public;
grant  execute on function public.centros_actuales()          to authenticated;
grant  execute on function public.centro_principal(uuid)      to authenticated;
grant  execute on function public.centro_actual()             to authenticated;


-- =========================================================================
-- 5 · Los cuatro sitios que usaban centro_actual()
-- =========================================================================
--
-- Tres pasan a centros_actuales() con el patrón `centro_id in (select ...)`. El cuarto
-- —el relleno— se queda con el PRINCIPAL, porque el centro del paciente decide su
-- retención durante veinticinco años y eso no puede depender de en cuál de sus centros
-- estaba el profesional aquel martes (ADR-033).

drop policy if exists pacientes_lectura_tecnico_de_su_centro on public.pacientes;
create policy pacientes_lectura_tecnico_de_su_centro on public.pacientes
  for select to authenticated
  using (
    (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
    and centro_id in (select public.centros_actuales())
  );


-- El `rol_actual() is not null` que abre la política NO es redundante y no se toca:
-- alertas_documentacion está fuera del candado, así que no hereda de él el corte por
-- baja, y su rama `profesional_id = U` no mira el estado de nadie (ADR-032).
drop policy if exists alertas_documentacion_lectura on public.alertas_documentacion;
create policy alertas_documentacion_lectura on public.alertas_documentacion
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or public.es_profesional_asignado(paciente_id)
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );


-- `nivel`, `descripcion` y `plan_seguridad` siguen sin aparecer en el texto de la vista.
-- No es que se filtren: es que no están.
create or replace view public.pacientes_indicador_riesgo
  with (security_invoker = false, security_barrier = true)
  as
select v.paciente_id,
       v.indicador,
       v.valorado_en
from public.valoraciones_riesgo v
join public.pacientes p on p.id = v.paciente_id
where (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
  and p.centro_id in (select public.centros_actuales());

comment on view public.pacientes_indicador_riesgo is
  'Indicador binario de riesgo para el técnico administrativo, en sus centros vigentes. Sin nivel, sin descripción y sin plan de seguridad: no están en el texto de la vista.';

revoke all on table public.pacientes_indicador_riesgo from public, anon, service_role;
grant select on table public.pacientes_indicador_riesgo to authenticated;


-- Nunca inventa un centro: un centro_id equivocado acota mal al técnico administrativo,
-- que es exactamente el rol que esta columna gobierna.
create or replace function public.fn_rellenar_centro_paciente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if new.centro_id is not null then
    return new;
  end if;

  -- 1 · El centro PRINCIPAL del profesional asignado (ADR-051). No «uno de los suyos»:
  --     el principal, porque de aquí sale la retención del paciente (ADR-033).
  new.centro_id := public.centro_principal(new.profesional_id);

  if new.centro_id is not null then
    return new;
  end if;

  -- 2 · Si solo hay un centro activo, ese. (No hay agregado min() para uuid, así que se
  --     cuenta primero y se lee después.)
  select count(*) into v_n from public.centros c where c.activo;

  if v_n = 1 then
    select c.id into new.centro_id from public.centros c where c.activo;
  end if;

  -- 3 · Si hay varios y no se puede decidir, queda nulo. Y nulo es FALLO CERRADO: la
  --     política del técnico es una pertenencia a lista, y con nulo no casa, o sea, no
  --     visible. Un paciente sin centro es invisible para recepción hasta que el
  --     administrador se lo asigne — visible y arreglable.
  return new;
end;
$$;

comment on function public.fn_rellenar_centro_paciente() is
  'Rellena pacientes.centro_id por defecto: centro principal del profesional, o el único centro activo. Nunca inventa uno.';


-- =========================================================================
-- 6 · RLS de perfiles_centros
-- =========================================================================
--
-- Lectura para los tres roles: es un directorio, y la agenda necesita saber quién pasa
-- consulta dónde. Escritura solo administrador: un profesional NO se asigna centros a sí
-- mismo, porque asignarse un centro es asignarse el recorte de otro rol.
--
-- No hay política de DELETE, y es deliberado: se cierra con `hasta`, no se borra. Sin
-- política, `authenticated` no puede borrar aunque tenga el privilegio.

alter table public.perfiles_centros enable row level security;

drop policy if exists perfiles_centros_lectura on public.perfiles_centros;
create policy perfiles_centros_lectura on public.perfiles_centros
  for select to authenticated
  using ((select public.rol_actual()) is not null);

drop policy if exists perfiles_centros_alta_administrador on public.perfiles_centros;
create policy perfiles_centros_alta_administrador on public.perfiles_centros
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

drop policy if exists perfiles_centros_cierre_administrador on public.perfiles_centros;
create policy perfiles_centros_cierre_administrador on public.perfiles_centros
  for update to authenticated
  using ((select public.rol_actual()) = 'administrador'::public.rol_usuario)
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

revoke all on table public.perfiles_centros from public, anon, service_role;
grant select, insert, update on table public.perfiles_centros to authenticated;


-- =========================================================================
-- 7 · Auditoría
-- =========================================================================
--
-- Con la convención de nombre que fija T-004, `auditar_<tabla>`. Quién pasa consulta
-- dónde y desde cuándo es un cambio de titularidad en la práctica: se audita entero.

drop trigger if exists auditar_perfiles_centros on public.perfiles_centros;
create trigger auditar_perfiles_centros
  after insert or update or delete on public.perfiles_centros
  for each row execute function public.fn_auditar();
