-- =========================================================================
-- T-004 · Auditoría por triggers y protección de solo adición en tres capas
-- =========================================================================
--
-- T-000 dejó fn_auditar() escrita genérica a propósito y colgada de UNA tabla. Aquí se
-- cuelga de todas y se cierra el invariante 2 con las tres capas, no con una.
--
-- LO QUE T-001 YA HABÍA DEJADO HECHO, y por tanto aquí no se repite:
-- las capas 2 y 3 —fn_impedir_modificacion() por fila y por sentencia— ya cuelgan de
-- auditoria, notas_clinicas_versiones, accesos_historia y accesos_historia_vistas. Se
-- comprueban, no se reescriben. Lo que faltaba era la auditoría en sí, la capa 1
-- completa, el privilegio por defecto y el comprobador de cobertura.
--
-- Referencias: architecture.md §Solo adición, §Registro de accesos. ADR-026 (candado),
-- ADR-032 (baja y titularidad). Constitución, regla 6.


-- =========================================================================
-- 1 · fn_auditar() deja de dar por hecho que la clave se llama `id`
-- =========================================================================
--
-- Tres tablas del esquema no tienen columna `id`: pacientes_identificacion
-- (paciente_id), pines_historia y preferencias_usuario (perfil_id). Como
-- auditoria.registro_id es NOT NULL, colgar la versión vieja de ellas no habría dado un
-- registro pobre: habría REVENTADO la escritura en la tabla auditada. La clave pasa a
-- ser argumento del disparador, con `id` por defecto.
-- Y deja de copiar lo que no le toca. **`auditoria` registra qué pasó y quién, nunca qué
-- decía.** Colgar la auditoría de todas las tablas sin recortar nada mete en `auditoria`
-- —que NO está bajo el candado del ADR-026 y que el propio actor puede leer— tres cosas
-- que no deben estar ahí:
--   · el **hash del PIN** (`pines_historia.hash`): una credencial de seis dígitos en una
--     tabla con protección distinta a la suya;
--   · el **material cifrado y su índice** (ADR-029): tener el criptograma y el nonce en
--     dos sitios dobla el alcance de una fuga de clave, y `dni_indice` es un hash con
--     clave que confirma una conjetura. Las columnas `*_clave_version` SÍ se quedan:
--     saber con qué versión de clave se escribió algo es justo para lo que sirve una
--     auditoría;
--   · el **contenido clínico** que el candado protege. Su cadena de custodia es
--     `notas_clinicas_versiones`, que es de solo adición y va encadenada por huella; la
--     auditoría solo necesita saber que se escribió una versión, quién y cuándo. Copiar
--     el cuerpo aquí abre una segunda puerta a la historia que el PIN no cubre.
--
-- Las columnas a recortar son argumentos del disparador, del segundo en adelante, y no
-- un catálogo: así se ven en `pg_get_triggerdef` y no cuestan una consulta por fila.
create or replace function public.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave    text := coalesce(TG_ARGV[0], 'id');
  v_anterior jsonb;
  v_posterior jsonb;
  i          integer;
begin
  if TG_OP <> 'DELETE' then v_posterior := to_jsonb(new); end if;
  if TG_OP <> 'INSERT' then v_anterior  := to_jsonb(old); end if;

  for i in 1 .. TG_NARGS - 1 loop
    v_posterior := v_posterior - TG_ARGV[i];
    v_anterior  := v_anterior  - TG_ARGV[i];
  end loop;

  if TG_OP = 'INSERT' then
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
    values (auth.uid(), TG_TABLE_NAME, TG_OP, (to_jsonb(new) ->> v_clave), v_posterior);
    return new;
  elsif TG_OP = 'UPDATE' then
    insert into public.auditoria (
      actor_id, tabla, operacion, registro_id, estado_anterior, estado_posterior
    )
    values (
      auth.uid(), TG_TABLE_NAME, TG_OP, (to_jsonb(new) ->> v_clave), v_anterior, v_posterior
    );
    return new;
  elsif TG_OP = 'DELETE' then
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_anterior)
    values (auth.uid(), TG_TABLE_NAME, TG_OP, (to_jsonb(old) ->> v_clave), v_anterior);
    return old;
  end if;
  return null;
end;
$$;

comment on function public.fn_auditar() is
  'Auditoría genérica por disparador. Argumento 1: columna clave (por defecto «id»). '
  'Argumentos siguientes: columnas que NO se copian a auditoria (credenciales, cifrado, '
  'contenido bajo candado).';


-- =========================================================================
-- 2 · auditoria admite hechos que no son cambios de fila
-- =========================================================================
--
-- Iniciar sesión, buscar y que salgan pacientes, o fallar el PIN no son un UPDATE de
-- nada, y hasta ahora había que disfrazarlos de UPDATE para que pasaran el check. Se
-- ensancha el check —hacia delante y sin tocar una sola fila— con los verbos que el
-- ticket nombra. `registro_id` sigue siendo NOT NULL: un hecho sin sujeto no se audita.
alter table public.auditoria drop constraint if exists auditoria_operacion_check;
alter table public.auditoria add constraint auditoria_operacion_check
  check (operacion in (
    'INSERT', 'UPDATE', 'DELETE',
    'SESION',          -- inicio de sesión (T-006)
    'BUSQUEDA',        -- búsqueda que devuelve pacientes (interfaz.md, choque 8)
    'PIN_FALLIDO',     -- intento de PIN incorrecto (ADR-026)
    'PIN_BLOQUEADO',   -- bloqueo por intentos (ADR-026)
    'TITULARIDAD'      -- cambio de titularidad o de asignación (ADR-032)
  ));

-- Índice de consulta para la pantalla de auditoría de fase 1: «qué le ha pasado a este
-- registro». El de actor y fecha ya existía desde T-001.
create index if not exists auditoria_tabla_registro_idx
  on public.auditoria (tabla, registro_id, ocurrido_en desc);


-- =========================================================================
-- 3 · El hecho auditable que no viene de un disparador
-- =========================================================================
--
-- Lo llama la aplicación. Es `security definer` y FUERZA actor_id = auth.uid(): un
-- cliente no puede firmar un registro con el nombre de otro. Y no admite INSERT, UPDATE
-- ni DELETE, para que tampoco pueda fabricar un cambio de fila que nunca ocurrió — esos
-- solo los escribe un disparador.
create or replace function public.registrar_evento_auditable(
  p_operacion   text,
  p_tabla       text,
  p_registro_id text,
  p_detalle     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if p_operacion not in ('SESION', 'BUSQUEDA', 'TITULARIDAD') then
    raise exception
      'Operación % no es un hecho auditable de aplicación. Los cambios de fila los escribe el disparador.',
      p_operacion using errcode = '22023';
  end if;

  if p_registro_id is null or trim(p_registro_id) = '' then
    raise exception 'Un hecho auditable sin sujeto no se registra.' using errcode = '22023';
  end if;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  values (v_uid, p_tabla, p_operacion, p_registro_id, p_detalle);
end;
$$;

comment on function public.registrar_evento_auditable(text, text, text, jsonb) is
  'Registra un hecho auditable que no es un cambio de fila: sesión, búsqueda, titularidad. '
  'Fuerza actor_id = auth.uid() y rechaza INSERT/UPDATE/DELETE.';

revoke execute on function public.registrar_evento_auditable(text, text, text, jsonb) from public;
grant  execute on function public.registrar_evento_auditable(text, text, text, jsonb) to authenticated;


-- =========================================================================
-- 4 · El PIN deja constancia del fallo, no solo del bloqueo
-- =========================================================================
--
-- La función es la de T-002 con DOS cambios y ni uno más: cada intento fallido deja
-- ahora su registro con PIN_FALLIDO, y el bloqueo pasa de disfrazarse de UPDATE a
-- decirse con su verbo, PIN_BLOQUEADO. **Nunca el hash ni el PIN en el jsonb.**
create or replace function public.desbloquear_historia(p_pin text)
returns table(desbloqueado boolean, motivo text, caduca_en timestamptz, bloqueado_hasta timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_pin      public.pines_historia%rowtype;
  v_intentos smallint;
  v_bloqueo  timestamptz;
  v_minutos  smallint;
  v_caduca   timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- 1 · Serializa los intentos concurrentes: sin esto, cinco conexiones a la vez
  --     gastarían un solo intento entre todas.
  select * into v_pin
  from public.pines_historia
  where perfil_id = v_uid
  for update;

  if not found then
    return query select false, 'sin_pin'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 2 · Bloqueado: se responde SIN comprobar el PIN. Esto es exactamente lo que hace
  --     fallar el sexto intento aunque el PIN sea el correcto.
  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return query select false, 'bloqueado'::text, null::timestamptz, v_pin.bloqueado_hasta;
    return;
  end if;

  -- 3 · Comparación. p_pin es parámetro ligado; extensions.crypt porque search_path = ''.
  if extensions.crypt(p_pin, v_pin.hash) <> v_pin.hash then
    -- 4 · Fallo: incrementa, y al quinto bloquea quince minutos.
    v_intentos := v_pin.intentos_fallidos + 1;
    v_bloqueo  := case when v_intentos >= 5 then now() + interval '15 minutes' end;

    update public.pines_historia
       set intentos_fallidos = v_intentos,
           bloqueado_hasta   = v_bloqueo,
           actualizado_en    = now()
     where perfil_id = v_uid;

    -- Todo intento fallido deja constancia (ADR-026). Cinco entradas seguidas del mismo
    -- actor son la señal que la pantalla de auditoría tiene que poder enseñar; si solo
    -- se registrara el bloqueo, cuatro intentos a ciegas serían invisibles.
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
    values (v_uid, 'pines_historia', 'PIN_FALLIDO', v_uid::text,
            jsonb_build_object('intentos_fallidos', v_intentos));

    if v_bloqueo is not null then
      insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
      values (v_uid, 'pines_historia', 'PIN_BLOQUEADO', v_uid::text,
              jsonb_build_object('intentos_fallidos', v_intentos,
                                 'bloqueado_hasta',   v_bloqueo));
    end if;

    return query select false,
                        case when v_bloqueo is not null then 'bloqueado' else 'pin_incorrecto' end::text,
                        null::timestamptz,
                        v_bloqueo;
    return;
  end if;

  -- 5 · Acierto: resetea el contador, revoca los desbloqueos vigentes y abre uno nuevo.
  update public.pines_historia
     set intentos_fallidos = 0,
         bloqueado_hasta   = null,
         actualizado_en    = now()
   where perfil_id = v_uid;

  select coalesce(o.minutos_desbloqueo_historia, 15) into v_minutos
  from public.organizacion o
  limit 1;

  v_caduca := now() + make_interval(mins => coalesce(v_minutos, 15)::integer);

  -- Las columnas van cualificadas con alias: `caduca_en` y `bloqueado_hasta` son también
  -- parámetros de salida de esta función, y sin el alias Postgres no sabe cuál es cuál
  -- («column reference "caduca_en" is ambiguous»).
  update public.desbloqueos_historia d
     set revocado_en = now()
   where d.perfil_id = v_uid
     and d.revocado_en is null
     and d.caduca_en > now();

  insert into public.desbloqueos_historia (perfil_id, caduca_en)
  values (v_uid, v_caduca);

  return query select true, 'ok'::text, v_caduca, null::timestamptz;
end;
$$;


-- =========================================================================
-- 5 · fn_auditar() colgada de TODAS las tablas
-- =========================================================================
--
-- Se recorre el catálogo en vez de escribir veinticinco bloques a mano: así la lista no
-- puede desviarse de las tablas que existen de verdad, que es justo el fallo que el
-- comprobador de cobertura del punto 8 persigue.
--
-- Dos exclusiones, las dos con motivo:
--   · `auditoria` — auditarla es recursión infinita: cada registro escribiría otro.
--     Está protegida por las tres capas, que es lo que le toca.
--   · `tablas_solo_adicion` — catálogo de configuración que solo escriben las
--     migraciones; no hay actor que auditar.
--
-- El recorte por tabla vive aquí, junto al bucle que lo aplica, y no repartido por el
-- fichero: si mañana nace una columna con un secreto dentro, este es el único sitio donde
-- hay que acordarse. La regla para decidir si una columna entra en esta lista es la del
-- punto 1: ¿es una credencial, es criptograma, o es contenido que el candado protege?
do $$
declare
  r        record;
  v_clave  text;
  v_n      integer;
  v_omitir text[];
  v_col    text;

  -- tabla -> columnas que NO se copian a auditoria
  c_recorte constant jsonb := jsonb_build_object(
    'pines_historia',           jsonb_build_array('hash'),
    'pacientes_identificacion', jsonb_build_array('dni_cifrado', 'dni_nonce', 'dni_indice',
                                                  'domicilio_cifrado', 'domicilio_nonce'),
    'representantes_paciente',  jsonb_build_array('documento_cifrado', 'documento_nonce'),
    'notas_clinicas_versiones', jsonb_build_array('cuerpo', 'anotaciones_reservadas',
                                                  'contenido_canonico'),
    -- El borrador es contenido clínico en una cabecera mutable (ADR-036): se audita que
    -- alguien lo tocó y cuándo, no lo que escribió.
    'notas_clinicas',           jsonb_build_array('borrador_contenido'),
    'valoraciones_riesgo',      jsonb_build_array('descripcion', 'plan_seguridad'),
    'episodios_asistenciales',  jsonb_build_array('motivo_consulta')
  );
begin
  for r in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in ('auditoria', 'tablas_solo_adicion')
    order by c.relname
  loop
    select count(*), min(a.attname)
      into v_n, v_clave
    from pg_constraint con
    join lateral unnest(con.conkey) k(att) on true
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.att
    where con.conrelid = r.oid and con.contype = 'p';

    -- Una clave compuesta rompería el `->> clave` de fn_auditar() en silencio: el
    -- registro_id saldría de una sola de sus columnas. Hoy no hay ninguna; si mañana la
    -- hay, que falle la migración y no la auditoría.
    if v_n is null or v_n = 0 then
      raise exception 'La tabla public.% no tiene clave primaria: no se puede auditar.', r.relname;
    elsif v_n > 1 then
      raise exception 'La tabla public.% tiene clave primaria compuesta; fn_auditar() aún no la cubre.', r.relname;
    end if;

    -- La clave va siempre; detrás, las columnas recortadas de esta tabla, si las hay.
    select coalesce(array_agg(x.valor), '{}')
      into v_omitir
    from jsonb_array_elements_text(coalesce(c_recorte -> r.relname, '[]'::jsonb)) as x(valor);

    -- Una columna recortada mal escrita sería un recorte que no recorta nada, y no se
    -- notaría hasta leer la auditoría y encontrarse el secreto dentro. Que falle aquí,
    -- que es donde se puede arreglar.
    foreach v_col in array v_omitir loop
      if not exists (
        select 1 from pg_attribute a
        where a.attrelid = r.oid and a.attname = v_col and a.attnum > 0 and not a.attisdropped
      ) then
        raise exception 'Recorte de auditoría mal escrito: la columna public.%.% no existe.',
          r.relname, v_col;
      end if;
    end loop;

    execute format('drop trigger if exists auditar_%1$I on public.%1$I', r.relname);
    execute format(
      'create trigger auditar_%1$I after insert or update or delete on public.%1$I '
      'for each row execute function public.fn_auditar(%2$s)',
      r.relname,
      concat_ws(', ', quote_literal(v_clave),
                nullif((select string_agg(quote_literal(o), ', ') from unnest(v_omitir) o), '')));
  end loop;
end $$;


-- El desbloqueo del candado es la excepción de volumen que el ticket manda decidir.
-- Prolongar la ventana es un UPDATE de `caduca_en` que ocurre cada pocos minutos mientras
-- alguien tiene la historia abierta: auditarlo inunda la tabla y no añade nada, porque
-- QUIÉN abrió el candado y CUÁNDO ya está en el INSERT. Lo que sí se audita de un update
-- es la REVOCACIÓN, que es un hecho de seguridad y ocurre una vez.
drop trigger if exists auditar_desbloqueos_historia on public.desbloqueos_historia;

create trigger auditar_desbloqueos_historia
  after insert or delete on public.desbloqueos_historia
  for each row execute function public.fn_auditar('id');

create trigger auditar_desbloqueos_historia_revocacion
  after update on public.desbloqueos_historia
  for each row
  when (old.revocado_en is distinct from new.revocado_en)
  execute function public.fn_auditar('id');


-- =========================================================================
-- 6 · Capa 1 · Revoke sobre las tablas de solo adición
-- =========================================================================
--
-- El revoke da el «permission denied» limpio pero NO frena a un superusuario; el
-- disparador de la capa 2 sí. Los dos, siempre: tapan agujeros distintos.
-- `facturas` no existe todavía (ADR-053 la dejó fuera del producto); cuando exista, entra
-- aquí y en el catálogo del punto 8, y hasta entonces el comprobador no la echa de menos.
revoke update, delete on table public.auditoria                from public, anon, authenticated, service_role, postgres;
revoke update, delete on table public.notas_clinicas_versiones from public, anon, authenticated, service_role, postgres;
revoke update, delete on table public.accesos_historia         from public, anon, authenticated, service_role, postgres;
revoke update, delete on table public.accesos_historia_vistas  from public, anon, authenticated, service_role, postgres;


-- =========================================================================
-- 7 · El regalo de privilegios de Supabase, cortado por defecto
-- =========================================================================
--
-- Supabase concede TRUNCATE, TRIGGER y REFERENCES sobre las tablas NUEVAS sin pedirlo.
-- Sin esto, una tabla creada mañana nace con TRUNCATE concedido a `authenticated` y la
-- capa 3 pasa a ser la única defensa. Afecta a lo que se cree DESPUÉS, así que el punto 6
-- sigue siendo necesario para lo que ya existe.
alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;

-- Y lo mismo para lo ya creado: TRUNCATE fuera de los tres roles del cliente, en todas.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format('revoke truncate on table public.%I from anon, authenticated, service_role', r.relname);
  end loop;
end $$;


-- =========================================================================
-- 8 · El catálogo de tablas de solo adición y su comprobador de cobertura
-- =========================================================================
--
-- La lista vive en una TABLA y no dentro de una función a propósito: CI (T-009) tiene que
-- poder leerla, y una lista escondida en el cuerpo de una función se desvía de la realidad
-- sin que nadie lo note. Añadir una tabla de solo adición es añadir una fila aquí, y esa
-- fila es lo que hace fallar el comprobador hasta que la tabla tenga sus tres capas.
create table if not exists public.tablas_solo_adicion (
  tabla text primary key,
  motivo text not null
);

comment on table public.tablas_solo_adicion is
  'Catálogo de las tablas que solo admiten adición (constitución, regla 6). Lo leen el '
  'comprobador de cobertura y CI. Lo escriben las migraciones, nadie más.';

insert into public.tablas_solo_adicion (tabla, motivo) values
  ('auditoria',                'El registro de lo que pasó no se reescribe.'),
  ('notas_clinicas_versiones', 'Una versión sellada entra en la cadena de huellas (invariante 1).'),
  ('accesos_historia',         'Quién miró una historia y cuándo (art. 23 LOPDGDD).'),
  ('accesos_historia_vistas',  'El detalle por pestaña del acceso anterior (ADR-037).')
on conflict (tabla) do nothing;

alter table public.tablas_solo_adicion enable row level security;

drop policy if exists tablas_solo_adicion_lectura on public.tablas_solo_adicion;
create policy tablas_solo_adicion_lectura on public.tablas_solo_adicion
  for select to authenticated
  using (true);

revoke all on table public.tablas_solo_adicion from public, anon, service_role;
grant select on table public.tablas_solo_adicion to authenticated;


-- Devuelve UNA FILA POR TABLA DESPROTEGIDA. Cero filas es el estado correcto, y por eso
-- CI puede limitarse a contar.
create or replace function public.cobertura_solo_adicion()
returns table(tabla text, existe boolean, capa1_revoke boolean, capa2_fila boolean, capa3_sentencia boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with objetivo as (
    select t.tabla, to_regclass('public.' || quote_ident(t.tabla)) as oid
    from public.tablas_solo_adicion t
  ),
  medido as (
    select o.tabla,
           (o.oid is not null) as existe,
           -- Capa 1: ni update ni delete concedidos a NADIE, postgres incluido.
           coalesce(not exists (
             select 1
             from information_schema.table_privileges p
             where p.table_schema = 'public'
               and p.table_name = o.tabla
               and p.privilege_type in ('UPDATE', 'DELETE')
           ), false) as capa1_revoke,
           -- Capa 2: disparador BEFORE UPDATE OR DELETE por fila.
           coalesce(exists (
             select 1 from pg_trigger g
             where g.tgrelid = o.oid and not g.tgisinternal
               and (g.tgtype & 1) = 1       -- FOR EACH ROW
               and (g.tgtype & 2) = 2       -- BEFORE
               and (g.tgtype & 8) = 8       -- DELETE
               and (g.tgtype & 16) = 16     -- UPDATE
           ), false) as capa2_fila,
           -- Capa 3: disparador BEFORE TRUNCATE por sentencia. Es la que casi nadie
           -- escribe y la que tapa el agujero real: TRUNCATE no dispara los de fila y
           -- RLS no lo intercepta.
           coalesce(exists (
             select 1 from pg_trigger g
             where g.tgrelid = o.oid and not g.tgisinternal
               and (g.tgtype & 1) = 0       -- FOR EACH STATEMENT
               and (g.tgtype & 2) = 2       -- BEFORE
               and (g.tgtype & 32) = 32     -- TRUNCATE
           ), false) as capa3_sentencia
    from objetivo o
  )
  select m.tabla, m.existe, m.capa1_revoke, m.capa2_fila, m.capa3_sentencia
  from medido m
  where not (m.existe and m.capa1_revoke and m.capa2_fila and m.capa3_sentencia);
$$;

comment on function public.cobertura_solo_adicion() is
  'Tablas del catálogo de solo adición a las que les falta alguna de las tres capas. '
  'Cero filas es el estado correcto; CI (T-009) cuenta y rompe el build si no lo es.';

revoke execute on function public.cobertura_solo_adicion() from public;
grant  execute on function public.cobertura_solo_adicion() to authenticated;
