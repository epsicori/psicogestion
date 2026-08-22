-- T-000 · Paseo vertical
-- Extensión → enum → tablas → funciones → RLS y políticas → grants → triggers.

-- =========================================================================
-- Extensión
-- =========================================================================

-- pgcrypto: la siembra la necesita para crypt()/gen_salt() al crear los usuarios
-- de prueba con contraseña ya cifrada.
create extension if not exists pgcrypto with schema extensions;

-- =========================================================================
-- Enum
-- =========================================================================

-- Los tres roles del dominio, aunque T-000 solo use profesional_sanitario: el enum
-- es lo más caro de migrar después, se define completo desde el principio.
create type public.rol_usuario as enum (
  'administrador',
  'profesional_sanitario',
  'tecnico_administrativo'
);

-- =========================================================================
-- Tablas
-- =========================================================================

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre_completo text not null,
  rol public.rol_usuario not null,
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is
  'Extiende auth.users. Nunca lleva FORCE ROW LEVEL SECURITY: rol_actual() depende '
  'de que su propietario (postgres), definer de la función, esté exento de RLS al '
  'leerla. Añadir FORCE reintroduce la recursión infinita clásica.';

create table public.pacientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  apellidos text not null check (length(trim(apellidos)) > 0),
  profesional_id uuid not null references public.perfiles (id),
  creado_en timestamptz not null default now()
);

create index pacientes_profesional_id_idx on public.pacientes (profesional_id);

-- Genérica desde el minuto uno (T-004 la cuelga de todas las tablas sin reescribirla).
create table public.auditoria (
  id bigint generated always as identity primary key,
  ocurrido_en timestamptz not null default now(),
  -- Nullable y sin FK: la siembra escribe sin JWT (actor_id null) y un registro de
  -- auditoría debe sobrevivir al borrado del usuario que lo generó.
  actor_id uuid,
  tabla text not null,
  operacion text not null check (operacion in ('INSERT', 'UPDATE', 'DELETE')),
  -- text, no uuid: el mismo trigger genérico vale para tablas con pk no-uuid en T-004.
  registro_id text not null,
  estado_anterior jsonb,
  estado_posterior jsonb
);

create index auditoria_actor_id_ocurrido_en_idx
  on public.auditoria (actor_id, ocurrido_en desc);

comment on table public.auditoria is
  'Solo adición (invariante 2). UPDATE y DELETE revocados a todos los roles, incluido '
  'postgres, y bloqueados además por trigger — doble cerrojo, ver más abajo.';

-- =========================================================================
-- Funciones auxiliares
-- =========================================================================

-- rol_actual(): security definer + search_path fijo son la solución a la recursión
-- infinita clásica (perfiles con política que llama a rol_actual(), que consulta
-- perfiles...). Al ejecutarse como el propietario de la tabla (postgres, exento de
-- RLS mientras perfiles no lleve FORCE), la lectura interna no dispara RLS y no hay
-- ciclo. Ninguna política sobre perfiles invoca esta función: usan solo auth.uid().
create function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.perfiles
  where id = (select auth.uid());
$$;

revoke execute on function public.rol_actual() from public;
grant execute on function public.rol_actual() to authenticated;

-- fn_auditar(): trigger genérico (TG_TABLE_NAME, to_jsonb) para reutilizar sin
-- reescribir en T-004. security definer + search_path fijo por la misma razón que
-- rol_actual(): al ser security definer con propietario exento de RLS, auditoria no
-- necesita política de insert para authenticated, y así un cliente no puede fabricar
-- registros de auditoría directamente.
--
-- La función no se invoca nunca directamente (solo vía trigger), pero por coherencia
-- con rol_actual() se le revoca EXECUTE a public igualmente: ver más abajo.
create function public.fn_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
    values (auth.uid(), TG_TABLE_NAME, TG_OP, (to_jsonb(new) ->> 'id'), to_jsonb(new));
    return new;
  elsif TG_OP = 'UPDATE' then
    insert into public.auditoria (
      actor_id, tabla, operacion, registro_id, estado_anterior, estado_posterior
    )
    values (
      auth.uid(), TG_TABLE_NAME, TG_OP, (to_jsonb(new) ->> 'id'), to_jsonb(old), to_jsonb(new)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_anterior)
    values (auth.uid(), TG_TABLE_NAME, TG_OP, (to_jsonb(old) ->> 'id'), to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_auditar() from public;

-- fn_impedir_modificacion(): doble cerrojo del invariante "solo adición" junto con
-- el REVOKE de más abajo. El REVOKE da el permission denied que pide el criterio 6
-- pero no frena a un superusuario (el propietario de la tabla conserva privilegios
-- implícitos que ningún REVOKE quita, TRUNCATE incluido); este trigger sí, con el
-- mismo SQLSTATE (42501). Genérica vía TG_TABLE_NAME: se reutiliza tal cual para
-- UPDATE/DELETE (trigger FOR EACH ROW) y para TRUNCATE (trigger FOR EACH STATEMENT,
-- más abajo) porque no referencia NEW/OLD.
create function public.fn_impedir_modificacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'La tabla % es de solo adición', TG_TABLE_NAME
    using errcode = '42501';
end;
$$;

revoke execute on function public.fn_impedir_modificacion() from public;

-- =========================================================================
-- RLS y políticas
-- =========================================================================

alter table public.perfiles enable row level security;
alter table public.pacientes enable row level security;
alter table public.auditoria enable row level security;

-- perfiles: sin FORCE (ver comentario de tabla) y sin llamar a rol_actual() en su
-- propia política — es lo que hace la recursión imposible por construcción.
create policy perfiles_lectura_propia
  on public.perfiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- pacientes: (select auth.uid()) y (select rol_actual()) entre paréntesis, evaluados
-- como InitPlan una vez por sentencia en lugar de una vez por fila. Patrón que se
-- repite en el resto del proyecto.
create policy pacientes_lectura_profesional_propio
  on public.pacientes
  for select
  to authenticated
  using (
    (select public.rol_actual()) = 'profesional_sanitario'
    and profesional_id = (select auth.uid())
  );

create policy pacientes_alta_profesional_propio
  on public.pacientes
  for insert
  to authenticated
  with check (
    (select public.rol_actual()) = 'profesional_sanitario'
    and profesional_id = (select auth.uid())
  );

-- auditoria: solo lectura de los propios registros. Sin política de insert: las
-- filas solo llegan vía fn_auditar() (security definer), un cliente no puede
-- fabricarlas directamente.
create policy auditoria_lectura_propia
  on public.auditoria
  for select
  to authenticated
  using (actor_id = (select auth.uid()));

-- Nota: en T-000 un administrador no ve ningún paciente (solo hay política para
-- profesional_sanitario). Es fallo cerrado, deliberado; T-001 añade su rama.

-- =========================================================================
-- Grants
-- =========================================================================

-- auto_expose_new_tables está desactivado en supabase/config.toml (comportamiento
-- por defecto desde Postgres 17 / CLI reciente): las tablas nuevas NO se exponen a
-- los roles de la API sin GRANT explícito, aunque el RLS sea perfecto. Sin estos
-- grants, todo devuelve "permission denied" y el error engaña: parece un problema
-- de políticas y es un problema de permisos de tabla.
--
-- OJO, esto NO significa que una tabla nueva llegue sin ningún privilegio hasta que
-- esta migración se lo dé: la plantilla de inicialización de Supabase fija, para el
-- esquema public, "alter default privileges ... grant all on tables to anon,
-- authenticated, service_role". Verificado: antes del REVOKE de abajo,
-- `set local role authenticated; truncate table public.auditoria;` y lo mismo como
-- `anon` y `service_role` funcionaban sin que esta migración les concediera nada,
-- porque TRUNCATE, TRIGGER y REFERENCES llegan por esos default privileges, no por
-- GRANT explícito. "Sin GRANT no hay acceso" es cierto para lo que SÍ hace falta
-- pedir (select/insert); es falso para lo que sobra. Por eso primero se revoca todo
-- y luego se concede solo lo pactado: así "ni un grant a anon" es un hecho
-- verificable, no una intención.
revoke all on table public.perfiles, public.pacientes, public.auditoria
  from public, anon, authenticated, service_role;

grant usage on schema public to authenticated;
grant select on table public.perfiles to authenticated;
grant select, insert on table public.pacientes to authenticated;
grant select on table public.auditoria to authenticated;

-- Ningún grant a anon ni a service_role sobre estas tablas: sin sesión de
-- `authenticated`, no hay ni un privilegio de tabla concedido (RLS aparte).

-- El REVOKE de arriba es puntual: solo alcanza a las tres tablas que esta migración
-- ya conoce. La plantilla de Supabase (ver comentario más arriba) sigue concediendo
-- default privileges a anon/authenticated/service_role, TRUNCATE incluido, sobre
-- CUALQUIER tabla que se cree después en el esquema public — auditoria nace sin
-- TRUNCATE por el REVOKE explícito de abajo, pero notas_clinicas_versiones (T-004) o
-- cualquier otra tabla futura nacería otra vez con TRUNCATE concedido si nadie repite
-- este bloque a mano. Esto NO es un detalle de esta migración: es una regla del
-- proyecto (invariante 2, "solo adición") que debe valer para todo el esquema desde
-- ahora, así que se fija aquí una sola vez a nivel de default privileges.
alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;

-- =========================================================================
-- Triggers
-- =========================================================================

create trigger auditar_pacientes
  after insert or update or delete on public.pacientes
  for each row
  execute function public.fn_auditar();

create trigger impedir_modificacion_auditoria
  before update or delete on public.auditoria
  for each row
  execute function public.fn_impedir_modificacion();

-- TRUNCATE es un tercer camino de borrado que ni RLS intercepta ni un trigger
-- FOR EACH ROW dispara (TRUNCATE no genera eventos por fila). Necesita su propio
-- trigger, a nivel de sentencia, reutilizando la misma función porque no referencia
-- NEW/OLD. Es el cerrojo que de verdad frena al propietario de la tabla: el REVOKE
-- de más abajo no lo hace, porque el propietario conserva privilegios implícitos
-- (incluido TRUNCATE) pase lo que pase con el REVOKE.
create trigger impedir_truncado_auditoria
  before truncate on public.auditoria
  for each statement
  execute function public.fn_impedir_modificacion();

-- Cerrojo adicional: revoca update/delete a todos, incluido postgres. El trigger de
-- arriba cubre el caso en que alguien recupere esos privilegios (ver criterio 6);
-- este revoke es la primera línea de defensa. TRUNCATE ya se revocó a todos salvo
-- postgres en el bloque de grants (postgres es propietario y ese REVOKE no le
-- afectaría de todos modos); el trigger de arriba es lo único que de verdad lo
-- frena a él.
revoke update, delete on table public.auditoria
  from public, anon, authenticated, service_role, postgres;
