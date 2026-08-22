-- T-001 · Verificación de los criterios 3 a 14.
-- Ejecutar con:
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t001-esquema.sql
--
-- Todo va en transacciones con `rollback`: el guion no deja ni una fila detrás.
-- Los perfiles de prueba exigen crear antes sus filas en auth.users dentro de la
-- misma transacción, porque perfiles.id referencia auth.users(id).
--
-- UUID de la siembra (supabase/seed.sql):
--   A = ana@psicogestion.test   = 11111111-1111-4111-8111-111111111111
--   B = bruno@psicogestion.test = 22222222-2222-4222-8222-222222222222
--
-- Convención de este guion, heredada de scripts/t000-rls.sql: la sentencia que DEBE
-- fallar va siempre la última antes del `rollback`, porque tras un error psql
-- rechaza el resto de la transacción.


-- =========================================================================
-- Criterio 3 — la organización es de fila única
-- =========================================================================

\echo '--- Criterio 3: el primer insert en organizacion pasa ---'
begin;
insert into public.organizacion (razon_social, nif)
values ('Consulta Uno SL', 'B12345678')
returning id, razon_social, zona_horaria, minutos_desbloqueo_historia;
rollback;

\echo '--- Criterio 3: el SEGUNDO insert en organizacion falla (unique de fila_unica, 23505) ---'
begin;
insert into public.organizacion (razon_social, nif) values ('Consulta Uno SL', 'B12345678');
insert into public.organizacion (razon_social, nif) values ('Consulta Dos SL', 'B87654321');
rollback;


-- =========================================================================
-- Criterio 4 — zona horaria: solo identificadores IANA de región (ADR-034)
-- =========================================================================

\echo '--- Criterio 4 (control): Atlantic/Canary PASA ---'
begin;
insert into public.centros (nombre, zona_horaria) values ('Centro Canarias', 'Atlantic/Canary')
returning nombre, zona_horaria;
rollback;

\echo '--- Criterio 4 (control): zona_horaria nula PASA (nulo = hereda) ---'
begin;
insert into public.centros (nombre) values ('Centro Sin Zona')
returning nombre, zona_horaria, public.zona_horaria_centro(id) as resuelta;
rollback;

\echo '--- Criterio 4: CEST falla (22023) ---'
begin;
insert into public.centros (nombre, zona_horaria) values ('Centro Malo', 'CEST');
rollback;

\echo '--- Criterio 4: +02:00 falla (22023) ---'
begin;
insert into public.centros (nombre, zona_horaria) values ('Centro Malo', '+02:00');
rollback;

\echo '--- Criterio 4 (extra ADR-034): CET falla aunque SÍ está en pg_timezone_names (22023) ---'
begin;
insert into public.centros (nombre, zona_horaria) values ('Centro Malo', 'CET');
rollback;

\echo '--- Criterio 4 (extra ADR-034): Etc/GMT+2 falla aunque SÍ está en pg_timezone_names (22023) ---'
begin;
insert into public.centros (nombre, zona_horaria) values ('Centro Malo', 'Etc/GMT+2');
rollback;

\echo '--- Criterio 4 (extra): los tres valores prohibidos SÍ existen en el catálogo ---'
select name from pg_timezone_names where name in ('CET', 'UTC', 'Etc/GMT+2') order by name;


-- =========================================================================
-- Criterio 5 — la retención se hereda y la función nunca devuelve nulo
-- =========================================================================

\echo '--- Criterio 5: centro SIN política propia resuelve a la de la organización ---'
begin;
insert into public.centros (id, nombre)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Centro Sin Politica');
select * from public.retencion_efectiva('aaaaaaaa-0000-4000-8000-000000000001');
rollback;

\echo '--- Criterio 5: uuid de centro INEXISTENTE: una fila, sin nulos, origen organizacion ---'
select * from public.retencion_efectiva('ffffffff-ffff-4fff-8fff-ffffffffffff');

\echo '--- Criterio 5: argumento NULL: una fila, sin nulos, origen organizacion ---'
select * from public.retencion_efectiva(null);

\echo '--- Criterio 5: recuento de filas y de nulos en los tres casos (esperado: 1 fila, 0 nulos) ---'
select
  count(*) as filas,
  count(*) filter (
    where anios_historia_clinica is null or anios_minimo_legal is null or origen is null
  ) as con_nulos
from public.retencion_efectiva(null);

\echo '--- Criterio 5: centro CON política propia resuelve a la suya (origen = centro) ---'
begin;
insert into public.centros (id, nombre)
values ('aaaaaaaa-0000-4000-8000-000000000002', 'Centro Con Politica');
insert into public.politicas_retencion (centro_id, anios_historia_clinica, anios_minimo_legal)
values ('aaaaaaaa-0000-4000-8000-000000000002', 30, 10);
select * from public.retencion_efectiva('aaaaaaaa-0000-4000-8000-000000000002');
rollback;

\echo '--- Criterio 5 (extra): la fila de la organización NO se puede borrar (42501) ---'
begin;
delete from public.politicas_retencion where centro_id is null;
rollback;


-- =========================================================================
-- Criterio 6 — no se puede bajar la retención por debajo del mínimo legal
-- =========================================================================

\echo '--- Criterio 6 (control): bajar a 5 con mínimo 5 PASA ---'
begin;
update public.politicas_retencion set anios_historia_clinica = 5 where centro_id is null;
select anios_historia_clinica, anios_minimo_legal from public.politicas_retencion where centro_id is null;
rollback;

\echo '--- Criterio 6: bajar a 3 con mínimo legal 5 FALLA (check, 23514) ---'
begin;
update public.politicas_retencion set anios_historia_clinica = 3 where centro_id is null;
rollback;


-- =========================================================================
-- Criterio 7 — centro obligatorio SOLO para tecnico_administrativo
-- =========================================================================

\echo '--- Criterio 7 (control): profesional_sanitario SIN centro PASA ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('cccccccc-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'prof@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('cccccccc-0000-4000-8000-000000000001', 'Profesional Sin Centro', 'profesional_sanitario')
returning id, rol, centro_id, estado;
rollback;

\echo '--- Criterio 7 (control): tecnico_administrativo CON centro PASA ---'
begin;
insert into public.centros (id, nombre) values ('aaaaaaaa-0000-4000-8000-000000000003', 'Centro Tecnico');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('cccccccc-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'tec@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol, centro_id)
values ('cccccccc-0000-4000-8000-000000000002', 'Tecnico Con Centro', 'tecnico_administrativo',
        'aaaaaaaa-0000-4000-8000-000000000003')
returning id, rol, centro_id;
rollback;

\echo '--- Criterio 7: tecnico_administrativo SIN centro FALLA (23514) ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('cccccccc-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'tec2@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('cccccccc-0000-4000-8000-000000000003', 'Tecnico Sin Centro', 'tecnico_administrativo');
rollback;


-- =========================================================================
-- Criterio 8 — no se puede dar de baja al ÚLTIMO administrador activo
-- =========================================================================

\echo '--- Criterio 8 (control): con DOS administradores activos, dar de baja a uno PASA ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin1@test.local', 'x', now(), now()),
       ('dddddddd-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin2@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol) values
  ('dddddddd-0000-4000-8000-000000000001', 'Admin Uno', 'administrador'),
  ('dddddddd-0000-4000-8000-000000000002', 'Admin Dos', 'administrador');
update public.perfiles set estado = 'baja'
where id = 'dddddddd-0000-4000-8000-000000000001';
select id, estado from public.perfiles where rol = 'administrador' order by id;
rollback;

\echo '--- Criterio 8: dar de baja al ÚLTIMO administrador activo FALLA (23514) ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin3@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('dddddddd-0000-4000-8000-000000000003', 'Admin Unico', 'administrador');
update public.perfiles set estado = 'baja' where id = 'dddddddd-0000-4000-8000-000000000003';
rollback;

-- OJO al leer la salida de este bloque: el DELETE falla, que es lo que pide el
-- criterio, pero NO lo para el disparador del último administrador. Lo para antes la
-- comprobación de integridad referencial contra notas_clinicas_versiones, que se
-- ejecuta como propietario y necesita bloquear filas con FOR KEY SHARE sobre una
-- tabla a la que la capa 1 del cerrojo le ha revocado UPDATE y DELETE a postgres.
-- Consecuencia general de T-001, anotada en docs/state.md: BORRAR UNA FILA DE
-- perfiles O DE pacientes ES IMPOSIBLE PARA CUALQUIER ROL. Coherente con el
-- proyecto («la baja no borra»), pero es un hecho nuevo y conviene saberlo.
-- Por eso este bloque se parte en dos. El primero NO prueba el candado: prueba el
-- hecho nuevo, y así etiquetado, porque una prueba verde por el motivo equivocado
-- seguiría verde aunque el candado no existiera — que es justo lo que este proyecto
-- prohíbe («una política que lo deniega todo también pasa una prueba negativa»).
\echo '--- Criterio 8 (extra): DELETE sobre perfiles es HOY IMPOSIBLE para cualquier rol; falla en la FK, NO en el candado (42501) ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin4@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('dddddddd-0000-4000-8000-000000000004', 'Admin Unico', 'administrador');
delete from public.perfiles where id = 'dddddddd-0000-4000-8000-000000000004';
rollback;

-- Y este es el que sí prueba el candado sobre DELETE: se devuelven a la fuerza y solo
-- dentro de la transacción los privilegios que la capa 1 revoca, para que la
-- comprobación referencial pueda correr y el DELETE llegue de verdad al disparador.
-- Mismo patrón que el criterio 12 usa para demostrar que el cerrojo no es solo el revoke.
\echo '--- Criterio 8 (extra): con la FK desbloqueada, el DELETE del último administrador lo para EL CANDADO (23514) ---'
begin;
grant update, delete on table public.notas_clinicas_versiones to postgres;
grant update, delete on table public.accesos_historia            to postgres;
grant update, delete on table public.accesos_historia_vistas     to postgres;
grant update, delete on table public.auditoria                   to postgres;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin8@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('dddddddd-0000-4000-8000-000000000008', 'Admin Unico Ocho', 'administrador');
delete from public.perfiles where id = 'dddddddd-0000-4000-8000-000000000008';
rollback;

-- Control positivo del bloque anterior: con la FK igualmente desbloqueada y DOS
-- administradores activos, el DELETE de uno de ellos SÍ pasa. Sin este control, el
-- bloque de arriba no distingue «el candado funciona» de «el DELETE nunca pasa».
\echo '--- Criterio 8 (control): con la FK desbloqueada y DOS admins, el DELETE de uno PASA ---'
begin;
grant update, delete on table public.notas_clinicas_versiones to postgres;
grant update, delete on table public.accesos_historia            to postgres;
grant update, delete on table public.accesos_historia_vistas     to postgres;
grant update, delete on table public.auditoria                   to postgres;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin9@test.local', 'x', now(), now()),
       ('dddddddd-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin10@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('dddddddd-0000-4000-8000-000000000009', 'Admin Nueve', 'administrador'),
       ('dddddddd-0000-4000-8000-00000000000a', 'Admin Diez',  'administrador');
delete from public.perfiles where id = 'dddddddd-0000-4000-8000-000000000009';
select count(*) as administradores_activos_restantes
  from public.perfiles where rol = 'administrador' and estado = 'activo';
rollback;

\echo '--- Criterio 8 (extra): CAMBIAR EL ROL del último administrador activo también FALLA (23514) ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin5@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol)
values ('dddddddd-0000-4000-8000-000000000005', 'Admin Unico', 'administrador');
update public.perfiles set rol = 'profesional_sanitario'
where id = 'dddddddd-0000-4000-8000-000000000005';
rollback;

\echo '--- Criterio 8 (extra): el RELEVO en dos sentencias dentro de una transacción PASA ---'
begin;
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('dddddddd-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin6@test.local', 'x', now(), now()),
       ('dddddddd-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'admin7@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol) values
  ('dddddddd-0000-4000-8000-000000000006', 'Admin Saliente', 'administrador'),
  ('dddddddd-0000-4000-8000-000000000007', 'Futuro Admin', 'profesional_sanitario');
set constraints all deferred;
update public.perfiles set estado = 'baja' where id = 'dddddddd-0000-4000-8000-000000000006';
update public.perfiles set rol = 'administrador' where id = 'dddddddd-0000-4000-8000-000000000007';
set constraints all immediate;
select id, rol, estado from public.perfiles
where id in ('dddddddd-0000-4000-8000-000000000006', 'dddddddd-0000-4000-8000-000000000007')
order by id;
rollback;


-- =========================================================================
-- Criterio 9 — dni_indice es único (ADR-029)
-- =========================================================================

\echo '--- Criterio 9: dos identificaciones con el MISMO dni_indice violan el único (23505) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'Uno', 'Duplicado', '11111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'Dos', 'Duplicado', '11111111-1111-4111-8111-111111111111');

insert into public.pacientes_identificacion (
  paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice
) values (
  'eeeeeeee-0000-4000-8000-000000000001', 'dni',
  '\x00'::bytea, repeat('a', 12)::bytea, repeat('b', 16)::bytea, repeat('c', 32)::bytea
);

insert into public.pacientes_identificacion (
  paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice
) values (
  'eeeeeeee-0000-4000-8000-000000000002', 'dni',
  '\x01'::bytea, repeat('d', 12)::bytea, repeat('e', 16)::bytea, repeat('c', 32)::bytea
);
rollback;


-- =========================================================================
-- Criterio 10 — la capacidad de consentir se CALCULA (ADR-028)
-- =========================================================================

\echo '--- Criterio 10: MISMA fila de representante — a los 15 consiente el representante ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id, fecha_nacimiento)
values ('eeeeeeee-0000-4000-8000-000000000010', 'Menor', 'Prueba',
        '11111111-1111-4111-8111-111111111111', '2010-06-15');
insert into public.representantes_paciente (
  id, paciente_id, nombre, apellidos, tipo, alcance, vigente_desde
) values (
  'eeeeeeee-0000-4000-8000-000000000011', 'eeeeeeee-0000-4000-8000-000000000010',
  'Madre', 'Prueba', 'progenitor', 'patria_potestad', '2010-06-15'
);

\echo '  · a fecha 2026-01-01 (15 años):'
select * from public.capacidad_consentimiento('eeeeeeee-0000-4000-8000-000000000010', date '2026-01-01');

\echo '  · a fecha 2026-07-01 (16 años), SIN tocar la fila del representante:'
select * from public.capacidad_consentimiento('eeeeeeee-0000-4000-8000-000000000010', date '2026-07-01');

\echo '  · a fecha 2021-06-16 (11 años): representante y todavía sin audiencia del menor:'
select * from public.capacidad_consentimiento('eeeeeeee-0000-4000-8000-000000000010', date '2021-06-16');

\echo '  · el representante sigue siendo UNA sola fila, intacta:'
select count(*) as filas_representante, min(vigente_desde) as vigente_desde, bool_and(vigente_hasta is null) as sin_caducidad
from public.representantes_paciente
where paciente_id = 'eeeeeeee-0000-4000-8000-000000000010';
rollback;

\echo '--- Criterio 10: paciente sin fecha de nacimiento devuelve «desconocida» (nunca cero filas) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id)
values ('eeeeeeee-0000-4000-8000-000000000012', 'Sin', 'Fecha',
        '11111111-1111-4111-8111-111111111111');
select * from public.capacidad_consentimiento('eeeeeeee-0000-4000-8000-000000000012', date '2026-01-01');
rollback;

\echo '--- Criterio 10: NINGUNA columna booleana de minoría de edad en el esquema (esperado 0) ---'
-- El filtro exige data_type = boolean a propósito: consentimientos.menor_oido_en
-- existe, es legítima y es DATE. Un like '%menor%' a secas daría un falso positivo.
select count(*) as columnas_booleanas_de_minoria
from information_schema.columns
where table_schema = 'public'
  and data_type = 'boolean'
  and (
    column_name ilike '%menor%'
    or column_name ilike '%minor%'
    or column_name ilike '%edad%'
    or column_name ilike '%tutel%'
  );

\echo '--- Criterio 10 (control): menor_oido_en existe y es date, no boolean ---'
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public' and column_name ilike '%menor%';


-- =========================================================================
-- Criterio 11a — la fusión no encadena (ADR-031)
-- =========================================================================

\echo '--- Criterio 11a: A→B, luego C→A (se normaliza a B), luego B→D (se repunta todo a D) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('eeeeeeee-0000-4000-8000-0000000000a1', 'A', 'Fusion', '11111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-0000-4000-8000-0000000000b1', 'B', 'Fusion', '11111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-0000-4000-8000-0000000000c1', 'C', 'Fusion', '11111111-1111-4111-8111-111111111111'),
  ('eeeeeeee-0000-4000-8000-0000000000d1', 'D', 'Fusion', '11111111-1111-4111-8111-111111111111');

\echo '  · paso 1: A→B'
update public.pacientes
set fusionado_en = 'eeeeeeee-0000-4000-8000-0000000000b1', fusionado_el = now()
where id = 'eeeeeeee-0000-4000-8000-0000000000a1';

\echo '  · paso 2: C→A, que debe quedar normalizado a B'
update public.pacientes
set fusionado_en = 'eeeeeeee-0000-4000-8000-0000000000a1', fusionado_el = now()
where id = 'eeeeeeee-0000-4000-8000-0000000000c1';
select nombre, fusionado_en from public.pacientes
where id = 'eeeeeeee-0000-4000-8000-0000000000c1';

\echo '  · paso 3: B→D, que debe repuntar A y C a D'
update public.pacientes
set fusionado_en = 'eeeeeeee-0000-4000-8000-0000000000d1', fusionado_el = now()
where id = 'eeeeeeee-0000-4000-8000-0000000000b1';
select nombre, fusionado_en from public.pacientes
where id in ('eeeeeeee-0000-4000-8000-0000000000a1',
             'eeeeeeee-0000-4000-8000-0000000000b1',
             'eeeeeeee-0000-4000-8000-0000000000c1')
order by nombre;

\echo '  · INVARIANTE: cero filas cuyo superviviente esté a su vez fusionado (esperado 0)'
select count(*) as cadenas_de_dos_saltos
from public.pacientes p
join public.pacientes s on s.id = p.fusionado_en
where p.fusionado_en is not null and s.fusionado_en is not null;
rollback;

\echo '--- Criterio 11a (extra): fusionarse consigo mismo FALLA (23514) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id)
values ('eeeeeeee-0000-4000-8000-0000000000e1', 'E', 'Fusion',
        '11111111-1111-4111-8111-111111111111');
update public.pacientes
set fusionado_en = 'eeeeeeee-0000-4000-8000-0000000000e1', fusionado_el = now()
where id = 'eeeeeeee-0000-4000-8000-0000000000e1';
rollback;


-- =========================================================================
-- Criterio 11b — solo adición donde toca, mutable donde toca
-- =========================================================================

\echo '--- Criterio 11b (mutable): UPDATE sobre notas_clinicas (cabecera) PASA ---'
begin;
insert into public.notas_clinicas (id, paciente_id, autor_id)
select 'eeeeeeee-0000-4000-8000-0000000000f1', p.id, '11111111-1111-4111-8111-111111111111'
from public.pacientes p where p.profesional_id = '11111111-1111-4111-8111-111111111111' order by p.creado_en, p.id limit 1;
update public.notas_clinicas
set borrador_contenido = '{"tipo":"doc"}'::jsonb,
    borrador_autor_id = '11111111-1111-4111-8111-111111111111'
where id = 'eeeeeeee-0000-4000-8000-0000000000f1';
select (borrador_actualizado_en is not null) as testigo_fijado_por_el_disparador
from public.notas_clinicas where id = 'eeeeeeee-0000-4000-8000-0000000000f1';
rollback;

\echo '--- Criterio 11b (mutable): UPDATE sobre desbloqueos_historia PASA ---'
begin;
insert into public.desbloqueos_historia (id, perfil_id, caduca_en)
values ('eeeeeeee-0000-4000-8000-0000000000f2', '11111111-1111-4111-8111-111111111111',
        now() + interval '15 minutes');
update public.desbloqueos_historia set revocado_en = now()
where id = 'eeeeeeee-0000-4000-8000-0000000000f2';
rollback;

\echo '--- Criterio 11b: UPDATE sobre notas_clinicas_versiones falla por permission denied (42501) ---'
begin;
update public.notas_clinicas_versiones set motivo_cambio = 'x';
rollback;

\echo '--- Criterio 11b: DELETE sobre notas_clinicas_versiones falla por permission denied (42501) ---'
begin;
delete from public.notas_clinicas_versiones;
rollback;

\echo '--- Criterio 11b: con el privilegio recuperado a la fuerza, el DISPARADOR sigue bloqueando el UPDATE (42501) ---'
begin;
grant update, delete on table public.notas_clinicas_versiones to postgres;
insert into public.notas_clinicas (id, paciente_id, autor_id)
select 'eeeeeeee-0000-4000-8000-0000000000f3', p.id, '11111111-1111-4111-8111-111111111111'
from public.pacientes p where p.profesional_id = '11111111-1111-4111-8111-111111111111' order by p.creado_en, p.id limit 1;
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id
) values (
  'eeeeeeee-0000-4000-8000-0000000000f3', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('1', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111'
);
update public.notas_clinicas_versiones set motivo_cambio = 'x';
rollback;

\echo '--- Criterio 11b: con el privilegio recuperado, el DISPARADOR sigue bloqueando el DELETE (42501) ---'
begin;
grant update, delete on table public.notas_clinicas_versiones to postgres;
insert into public.notas_clinicas (id, paciente_id, autor_id)
select 'eeeeeeee-0000-4000-8000-0000000000f4', p.id, '11111111-1111-4111-8111-111111111111'
from public.pacientes p where p.profesional_id = '11111111-1111-4111-8111-111111111111' order by p.creado_en, p.id limit 1;
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id
) values (
  'eeeeeeee-0000-4000-8000-0000000000f4', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('2', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111'
);
delete from public.notas_clinicas_versiones;
rollback;

\echo '--- Criterio 11b: TRUNCATE de notas_clinicas_versiones como postgres — bloqueado por disparador (42501) ---'
begin;
truncate table public.notas_clinicas_versiones;
rollback;

\echo '--- Criterio 11b: UPDATE sobre accesos_historia falla por permission denied (42501) ---'
begin;
update public.accesos_historia set agente = 'x';
rollback;

\echo '--- Criterio 11b: DELETE sobre accesos_historia falla por permission denied (42501) ---'
begin;
delete from public.accesos_historia;
rollback;

\echo '--- Criterio 11b: con el privilegio recuperado, el DISPARADOR sigue bloqueando accesos_historia (42501) ---'
begin;
grant update, delete on table public.accesos_historia to postgres;
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana)
select '11111111-1111-4111-8111-111111111111', p.id, 'apertura', 'notas_clinicas'
from public.pacientes p where p.profesional_id = '11111111-1111-4111-8111-111111111111' order by p.creado_en, p.id limit 1;
update public.accesos_historia set agente = 'x';
rollback;

\echo '--- Criterio 11b: TRUNCATE de accesos_historia como postgres — bloqueado por disparador (42501) ---'
begin;
truncate table public.accesos_historia;
rollback;

\echo '--- Criterio 11b: UPDATE sobre accesos_historia_vistas falla por permission denied (42501) ---'
begin;
update public.accesos_historia_vistas set ocurrido_en = now();
rollback;

\echo '--- Criterio 11b: DELETE sobre accesos_historia_vistas falla por permission denied (42501) ---'
begin;
delete from public.accesos_historia_vistas;
rollback;

-- LA NOVENA PIEZA de «tres capas x tres tablas». Sin este bloque, el disparador
-- impedir_modificacion_accesos_historia_vistas podria estar colgado de la tabla
-- equivocada y el guion entero seguiria verde: los dos bloques de arriba solo
-- demuestran la capa 1 (el revoke), que tapa al cliente pero no al propietario.
\echo '--- Criterio 11b: con el privilegio recuperado a la fuerza, el DISPARADOR sigue bloqueando el UPDATE de accesos_historia_vistas (42501) ---'
begin;
grant update, delete on table public.accesos_historia_vistas to postgres;
-- `accesos_historia.id` es `generated always as identity`: no admite id explicito,
-- asi que la vista se cuelga del id recien generado con un CTE.
with a as (
  insert into public.accesos_historia (perfil_id, paciente_id, tipo)
  values ('11111111-1111-4111-8111-111111111111',
          (select id from public.pacientes order by creado_en, id limit 1), 'apertura')
  returning id
)
insert into public.accesos_historia_vistas (acceso_id) select id from a;
update public.accesos_historia_vistas set ocurrido_en = now();
rollback;

\echo '--- Criterio 11b: con el privilegio recuperado, el DISPARADOR sigue bloqueando el DELETE de accesos_historia_vistas (42501) ---'
begin;
grant update, delete on table public.accesos_historia_vistas to postgres;
with a as (
  insert into public.accesos_historia (perfil_id, paciente_id, tipo)
  values ('11111111-1111-4111-8111-111111111111',
          (select id from public.pacientes order by creado_en, id limit 1), 'apertura')
  returning id
)
insert into public.accesos_historia_vistas (acceso_id) select id from a;
delete from public.accesos_historia_vistas;
rollback;

\echo '--- Criterio 11b (control): el disparador esta colgado de ESTA tabla, no de otra ---'
select c.relname as tabla, t.tgname as disparador
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relname = 'accesos_historia_vistas'
order by t.tgname;

\echo '--- Criterio 11b: TRUNCATE de accesos_historia_vistas como postgres — bloqueado por disparador (42501) ---'
begin;
truncate table public.accesos_historia_vistas;
rollback;

\echo '--- Criterio 11b (extra): el contador de vistas se LEE, no se escribe ---'
begin;
insert into public.accesos_historia (id, perfil_id, paciente_id, tipo, pestana)
overriding system value
select 900001, '11111111-1111-4111-8111-111111111111', p.id, 'apertura', 'notas_clinicas'
from public.pacientes p where p.profesional_id = '11111111-1111-4111-8111-111111111111' order by p.creado_en, p.id limit 1;
insert into public.accesos_historia_vistas (acceso_id) values (900001), (900001);
select id, tipo, vistas from public.accesos_historia_resumen where id = 900001;
rollback;

\echo '--- Criterio 11b (extra): el acceso de EMERGENCIA sin justificación FALLA (23514, decisión 5) ---'
begin;
insert into public.accesos_historia (perfil_id, paciente_id, tipo)
select '11111111-1111-4111-8111-111111111111', p.id, 'emergencia'
from public.pacientes p where p.profesional_id = '11111111-1111-4111-8111-111111111111' order by p.creado_en, p.id limit 1;
rollback;


-- =========================================================================
-- Criterio 12 (numeración del ticket: 13) — pines_historia no se lee
-- =========================================================================

\echo '--- Criterio 13: SELECT sobre pines_historia como authenticated falla (42501) ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select * from public.pines_historia;
rollback;

\echo '--- Criterio 13 (extra): tampoco lo lee anon ni service_role ---'
begin;
set local role anon;
select * from public.pines_historia;
rollback;

begin;
set local role service_role;
select * from public.pines_historia;
rollback;

\echo '--- Criterio 13 (extra): ninguna concesión sobre pines_historia salvo el propietario ---'
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'pines_historia'
order by grantee, privilege_type;

\echo '--- Criterio 13 (extra): el técnico administrativo no puede tener PIN (23514) ---'
begin;
insert into public.centros (id, nombre) values ('aaaaaaaa-0000-4000-8000-000000000009', 'Centro PIN');
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('cccccccc-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'tec9@test.local', 'x', now(), now());
insert into public.perfiles (id, nombre_completo, rol, centro_id)
values ('cccccccc-0000-4000-8000-000000000009', 'Tecnico', 'tecnico_administrativo',
        'aaaaaaaa-0000-4000-8000-000000000009');
insert into public.pines_historia (perfil_id, hash)
values ('cccccccc-0000-4000-8000-000000000009', 'x');
rollback;


-- =========================================================================
-- Criterio 14 — RLS activo en TODAS las tablas de public
-- =========================================================================

\echo '--- Criterio 14: tablas de public SIN row level security (esperado 0) ---'
select count(*) as tablas_sin_rls
from pg_tables
where schemaname = 'public' and not rowsecurity;

\echo '--- Criterio 14 (extra): ninguna tabla nueva concede nada a anon ni a service_role (esperado 0) ---'
select count(*) as concesiones_a_anon_o_service_role
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'service_role');

\echo '--- Criterio 14 (extra): ningún grant de DELETE en todo el esquema public (esperado 0) ---'
select count(*) as grants_de_delete
from information_schema.role_table_grants
where table_schema = 'public'
  and privilege_type = 'DELETE'
  and grantee in ('anon', 'authenticated', 'service_role');

\echo '--- Criterio 14 (extra): ninguna política RLS creada en T-001 (solo quedan las 4 de T-000) ---'
select tablename, policyname from pg_policies where schemaname = 'public' order by tablename, policyname;

\echo '--- Criterio 14 (extra): perfiles NO lleva force row level security ---'
select relname, relrowsecurity, relforcerowsecurity
from pg_class where relname = 'perfiles';

\echo '--- Criterio 14 (extra): ninguna secuencia de public concede nada a anon/authenticated/service_role (esperado 0) ---'
select count(*) as concesiones_en_secuencias
from information_schema.role_usage_grants
where object_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role');


-- #########################################################################
-- Correcciones de la revisión de T-001
--
-- Una prueba por arreglo, cada una con su gemela positiva: una prueba negativa
-- sin control positivo no distingue «la guarda funciona» de «esto no pasa nunca».
-- #########################################################################


-- =========================================================================
-- R1 · Carrera de fusión: el destino se bloquea (`for no key update`)
--
-- ÚNICO bloque del guion que escribe de verdad y hace commit: la concurrencia no
-- se puede simular dentro de una sola transacción. Abre una segunda conexión con
-- la orden `\!` de psql, y limpia detrás. Deja filas en `auditoria`, que es de solo
-- adición y por diseño no se limpia.
-- =========================================================================

\echo '--- R1: preparacion (tres pacientes, con commit para que los vea la segunda conexion) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('0a000000-0000-4000-8000-00000000000a', 'RaceA', 'Fusion', '11111111-1111-4111-8111-111111111111'),
  ('0b000000-0000-4000-8000-00000000000b', 'RaceB', 'Fusion', '11111111-1111-4111-8111-111111111111'),
  ('0d000000-0000-4000-8000-00000000000d', 'RaceD', 'Fusion', '11111111-1111-4111-8111-111111111111');
commit;

\echo '--- R1 (CONTROL POSITIVO): sin nadie bloqueando, la segunda conexion fusiona A->B sin esperar ---'
\! psql -U postgres -d postgres -c "set lock_timeout='3s'; update public.pacientes set fusionado_en='0b000000-0000-4000-8000-00000000000b', fusionado_el=now() where id='0a000000-0000-4000-8000-00000000000a';"
select nombre, fusionado_en from public.pacientes
where id = '0a000000-0000-4000-8000-00000000000a';

\echo '--- R1: se deshace la fusion para montar la carrera ---'
begin;
update public.pacientes set fusionado_en = null, fusionado_el = null
where id = '0a000000-0000-4000-8000-00000000000a';
commit;

\echo '--- R1 (NEGATIVO): con B fusionandose a D en esta transaccion, la fusion A->B de la otra conexion NO se cuela: espera el bloqueo y expira (55P03) ---'
begin;
update public.pacientes
set fusionado_en = '0d000000-0000-4000-8000-00000000000d', fusionado_el = now()
where id = '0b000000-0000-4000-8000-00000000000b';
\! psql -U postgres -d postgres -c "set lock_timeout='3s'; update public.pacientes set fusionado_en='0b000000-0000-4000-8000-00000000000b', fusionado_el=now() where id='0a000000-0000-4000-8000-00000000000a';"
\echo '  (sin el for no key update esta linea decia UPDATE 1 y dejaba A->B, B->D: cadena de dos saltos)'
-- COMMIT, no rollback. Con rollback, B->D nunca llegaba a existir, la fusion A->B
-- posterior caia sobre una B sin fusionar y la asercion global de mas abajo daba cero
-- TAMBIEN CON LA MIGRACION ANTERIOR: verde por el motivo equivocado. Al commitear,
-- B->D es real y la unica forma de que A no acabe en una cadena es que el disparador
-- normalice de verdad.
commit;

\echo '--- R1 (DESENLACE, lo que de verdad prueba el arreglo): con B->D ya commiteado, la fusion A->B se normaliza a D ---'
\! psql -U postgres -d postgres -c "set lock_timeout='3s'; update public.pacientes set fusionado_en='0b000000-0000-4000-8000-00000000000b', fusionado_el=now() where id='0a000000-0000-4000-8000-00000000000a';"
select
  nombre,
  fusionado_en,
  fusionado_en = '0d000000-0000-4000-8000-00000000000d' as apunta_a_D_no_a_B
from public.pacientes
where id = '0a000000-0000-4000-8000-00000000000a';

\echo '--- R1: INVARIANTE global tras la carrera: cero cadenas de dos saltos (esperado 0) ---'
select count(*) as cadenas_de_dos_saltos
from public.pacientes p
join public.pacientes s on s.id = p.fusionado_en
where p.fusionado_en is not null and s.fusionado_en is not null;

\echo '--- R1: limpieza ---'
begin;
grant update, delete on table public.accesos_historia to postgres;
delete from public.pacientes where id in (
  '0a000000-0000-4000-8000-00000000000a',
  '0b000000-0000-4000-8000-00000000000b',
  '0d000000-0000-4000-8000-00000000000d'
);
revoke update, delete on table public.accesos_historia from postgres;
commit;
select count(*) as pacientes_de_prueba_restantes from public.pacientes
where apellidos = 'Fusion';


-- =========================================================================
-- R2 · El minimo legal tiene suelo duro, no una comparacion entre columnas
-- =========================================================================

\echo '--- R2 (NEGATIVO): bajar LAS DOS columnas a 1 anio FALLA (politicas_retencion_suelo_legal, 23514) ---'
begin;
update public.politicas_retencion
set anios_historia_clinica = 1, anios_minimo_legal = 1
where centro_id is null;
rollback;

-- OJO al leer la salida: hoy `authenticated` devuelve UPDATE 0, y eso NO prueba la
-- guarda. No la prueba porque `politicas_retencion` tiene RLS activo y ninguna
-- política hasta T-002: la fila ni se ve, así que el `update` no llega nunca a la
-- restricción. Lo que hace que la guarda valga también para `authenticated` no es
-- esta prueba, es que sea una RESTRICCIÓN DE TABLA, que por construcción no depende
-- del rol; se prueba de verdad con `postgres` en el bloque de arriba y se lista
-- abajo. Cuando T-002 abra la escritura, este bloque pasará a dar 23514 y entonces
-- sí será una prueba.
\echo '--- R2 (contexto, NO es prueba): hoy authenticated ni llega a la fila por RLS: UPDATE 0, no error ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.politicas_retencion
set anios_historia_clinica = 1, anios_minimo_legal = 1
where centro_id is null;
rollback;

\echo '--- R2: las dos guardas son restricciones de TABLA, no privilegios de rol: valen para cualquiera que escriba ---'
select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.politicas_retencion'::regclass and contype = 'c'
order by conname;

\echo '--- R2 (CONTROL POSITIVO): bajar hasta el suelo exacto (5/5) PASA ---'
begin;
update public.politicas_retencion
set anios_historia_clinica = 5, anios_minimo_legal = 5
where centro_id is null;
select anios_historia_clinica, anios_minimo_legal from public.politicas_retencion
where centro_id is null;
rollback;

\echo '--- R2 (CONTROL POSITIVO): SUBIR el minimo por encima del suelo estatal PASA (una CCAA puede exigir mas) ---'
begin;
update public.politicas_retencion
set anios_minimo_legal = 15, anios_historia_clinica = 25
where centro_id is null;
select anios_historia_clinica, anios_minimo_legal from public.politicas_retencion
where centro_id is null;
rollback;


-- =========================================================================
-- R3 · La fila de retencion de la organizacion tampoco se puede MOVER
-- =========================================================================

\echo '--- R3 (NEGATIVO): reasignar la fila de la organizacion a un centro FALLA (42501) ---'
begin;
insert into public.centros (id, nombre) values ('aaaaaaaa-0000-4000-8000-00000000000b', 'Centro R3');
update public.politicas_retencion
set centro_id = 'aaaaaaaa-0000-4000-8000-00000000000b'
where centro_id is null;
rollback;

-- Mismo matiz que en R2: hoy `authenticated` da UPDATE 0 por la RLS sin política y
-- eso no prueba nada. Lo que protege la fila para cualquier rol es el disparador,
-- que es de tabla; se prueba con `postgres` arriba y se lista abajo.
\echo '--- R3 (contexto, NO es prueba): hoy authenticated ni llega a la fila por RLS: UPDATE 0, no error ---'
begin;
insert into public.centros (id, nombre) values ('aaaaaaaa-0000-4000-8000-00000000000c', 'Centro R3 bis');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.politicas_retencion
set centro_id = 'aaaaaaaa-0000-4000-8000-00000000000c'
where centro_id is null;
rollback;

\echo '--- R3: el disparador cubre DELETE y UPDATE OF centro_id, y es de tabla: vale para cualquier rol ---'
select tgname,
       pg_get_triggerdef(oid) as definicion
from pg_trigger
where tgrelid = 'public.politicas_retencion'::regclass and not tgisinternal;

\echo '--- R3 (CONTROL POSITIVO): la fila de la organizacion SI deja cambiar sus anios ---'
begin;
update public.politicas_retencion set anios_historia_clinica = 30 where centro_id is null;
select anios_historia_clinica, anios_minimo_legal, centro_id from public.politicas_retencion
where centro_id is null;
rollback;

\echo '--- R3 (CONTROL POSITIVO): la politica de un CENTRO si se puede mover a otro centro ---'
begin;
insert into public.centros (id, nombre) values
  ('aaaaaaaa-0000-4000-8000-00000000000d', 'Centro R3 origen'),
  ('aaaaaaaa-0000-4000-8000-00000000000e', 'Centro R3 destino');
insert into public.politicas_retencion (centro_id, anios_historia_clinica, anios_minimo_legal)
values ('aaaaaaaa-0000-4000-8000-00000000000d', 30, 10);
update public.politicas_retencion
set centro_id = 'aaaaaaaa-0000-4000-8000-00000000000e'
where centro_id = 'aaaaaaaa-0000-4000-8000-00000000000d';
select centro_id, anios_historia_clinica from public.politicas_retencion
where centro_id = 'aaaaaaaa-0000-4000-8000-00000000000e';
rollback;

\echo '--- R3: la herencia sigue teniendo suelo, retencion_efectiva nunca se queda sin fila ---'
select * from public.retencion_efectiva(null);


-- =========================================================================
-- R4 · Una version sellada no se puede reasignar a otro paciente
-- =========================================================================

\echo '--- R4 (CONTROL POSITIVO): mientras NO hay version sellada, la cabecera es corregible ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000001', 'R4Uno', 'Nota', '11111111-1111-4111-8111-111111111111'),
  ('04000000-0000-4000-8000-000000000002', 'R4Dos', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.notas_clinicas (id, paciente_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f1', '04000000-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-111111111111', date '2026-03-01');
update public.notas_clinicas
set paciente_id = '04000000-0000-4000-8000-000000000002', fecha_sesion = date '2026-03-02'
where id = '04000000-0000-4000-8000-0000000000f1';
select paciente_id, fecha_sesion from public.notas_clinicas
where id = '04000000-0000-4000-8000-0000000000f1';
rollback;

\echo '--- R4 (CONTROL POSITIVO): con version sellada, el BORRADOR sigue siendo editable ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000003', 'R4Tres', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.notas_clinicas (id, paciente_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f2', '04000000-0000-4000-8000-000000000003',
        '11111111-1111-4111-8111-111111111111', date '2026-03-01');
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id
) values (
  '04000000-0000-4000-8000-0000000000f2', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('7', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111'
);
update public.notas_clinicas
set borrador_contenido = '{"tipo":"doc","v":2}'::jsonb,
    borrador_autor_id = '11111111-1111-4111-8111-111111111111'
where id = '04000000-0000-4000-8000-0000000000f2';
select (borrador_actualizado_en is not null) as borrador_editable_tras_sellar
from public.notas_clinicas where id = '04000000-0000-4000-8000-0000000000f2';
rollback;

\echo '--- R4 (NEGATIVO): con version sellada, cambiar paciente_id FALLA (42501) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000004', 'R4Cuatro', 'Nota', '11111111-1111-4111-8111-111111111111'),
  ('04000000-0000-4000-8000-000000000005', 'R4Cinco', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.notas_clinicas (id, paciente_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f3', '04000000-0000-4000-8000-000000000004',
        '11111111-1111-4111-8111-111111111111', date '2026-03-01');
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id
) values (
  '04000000-0000-4000-8000-0000000000f3', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('8', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111'
);
update public.notas_clinicas
set paciente_id = '04000000-0000-4000-8000-000000000005'
where id = '04000000-0000-4000-8000-0000000000f3';
rollback;

\echo '--- R4 (NEGATIVO): con version sellada, cambiar fecha_sesion FALLA (42501) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000006', 'R4Seis', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.notas_clinicas (id, paciente_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f4', '04000000-0000-4000-8000-000000000006',
        '11111111-1111-4111-8111-111111111111', date '2026-03-01');
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id
) values (
  '04000000-0000-4000-8000-0000000000f4', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('9', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111'
);
update public.notas_clinicas set fecha_sesion = date '2020-01-01'
where id = '04000000-0000-4000-8000-0000000000f4';
rollback;

-- Las dos columnas que faltaban, y son las que peor fallan si no estan:
-- autor_id decide QUIEN PUEDE LEER la nota, y episodio_id a nulo deja una version
-- conjunta sin episodio, que es el estado que fn_exigir_episodio_en_nota_conjunta()
-- impide crear al insertar.
\echo '--- R4 (NEGATIVO): con version sellada, cambiar autor_id FALLA — cambiarlo reasignaria quien puede leerla (42501) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000007', 'R4Siete', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.notas_clinicas (id, paciente_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f5', '04000000-0000-4000-8000-000000000007',
        '11111111-1111-4111-8111-111111111111', date '2026-03-01');
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id
) values (
  '04000000-0000-4000-8000-0000000000f5', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('a', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111'
);
update public.notas_clinicas set autor_id = '22222222-2222-4222-8222-222222222222'
where id = '04000000-0000-4000-8000-0000000000f5';
rollback;

\echo '--- R4 (NEGATIVO): con version sellada CONJUNTA, poner episodio_id a nulo FALLA (42501) ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000008', 'R4Ocho', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.episodios_asistenciales (id, paciente_id, profesional_id, modalidad_relacional)
values ('04000000-0000-4000-8000-0000000000e8', '04000000-0000-4000-8000-000000000008',
        '11111111-1111-4111-8111-111111111111', 'pareja');
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f6', '04000000-0000-4000-8000-000000000008',
        '04000000-0000-4000-8000-0000000000e8', '11111111-1111-4111-8111-111111111111',
        date '2026-03-01');
insert into public.notas_clinicas_versiones (
  nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, autor_id, alcance
) values (
  '04000000-0000-4000-8000-0000000000f6', 1, '{"tipo":"doc"}', '{"tipo":"doc"}',
  repeat('b', 32)::bytea, repeat('0', 32)::bytea, '11111111-1111-4111-8111-111111111111', 'conjunta'
);
update public.notas_clinicas set episodio_id = null
where id = '04000000-0000-4000-8000-0000000000f6';
rollback;

\echo '--- R4 (CONTROL POSITIVO): SIN version sellada, autor_id y episodio_id siguen siendo corregibles ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  ('04000000-0000-4000-8000-000000000009', 'R4Nueve', 'Nota', '11111111-1111-4111-8111-111111111111');
insert into public.episodios_asistenciales (id, paciente_id, profesional_id)
values ('04000000-0000-4000-8000-0000000000e9', '04000000-0000-4000-8000-000000000009',
        '11111111-1111-4111-8111-111111111111');
insert into public.notas_clinicas (id, paciente_id, autor_id, fecha_sesion)
values ('04000000-0000-4000-8000-0000000000f7', '04000000-0000-4000-8000-000000000009',
        '11111111-1111-4111-8111-111111111111', date '2026-03-01');
update public.notas_clinicas
set autor_id = '22222222-2222-4222-8222-222222222222',
    episodio_id = '04000000-0000-4000-8000-0000000000e9'
where id = '04000000-0000-4000-8000-0000000000f7';
select autor_id, episodio_id is not null as episodio_asignado
from public.notas_clinicas where id = '04000000-0000-4000-8000-0000000000f7';
rollback;

\echo '--- R4 (CONTROL): el disparador cubre las CUATRO columnas, no dos ---'
select
  count(*) filter (where d ~ 'paciente_id')  as cubre_paciente_id,
  count(*) filter (where d ~ 'fecha_sesion') as cubre_fecha_sesion,
  count(*) filter (where d ~ 'autor_id')     as cubre_autor_id,
  count(*) filter (where d ~ 'episodio_id')  as cubre_episodio_id
from (
  select substring(pg_get_triggerdef(t.oid) from 'UPDATE OF (.*?) ON') as d
  from pg_trigger t where t.tgname = 'congelar_cabecera_sellada'
) x;


-- =========================================================================
-- R5 · `nulls not distinct` en la ventana de acceso
-- =========================================================================

\echo '--- R5 (NEGATIVO): dos aperturas con pestana NULA y el mismo desbloqueo son UNA sola fila ---'
begin;
insert into public.desbloqueos_historia (id, perfil_id, caduca_en)
values ('05000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
        now() + interval '15 minutes');
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
select '11111111-1111-4111-8111-111111111111', p.id, 'exportacion', null,
       '05000000-0000-4000-8000-000000000001'
from public.pacientes p order by p.creado_en, p.id limit 1
on conflict do nothing;
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
select '11111111-1111-4111-8111-111111111111', p.id, 'exportacion', null,
       '05000000-0000-4000-8000-000000000001'
from public.pacientes p order by p.creado_en, p.id limit 1
on conflict do nothing;
select count(*) as filas_con_pestana_nula
from public.accesos_historia
where desbloqueo_id = '05000000-0000-4000-8000-000000000001';
rollback;

\echo '--- R5 (CONTROL POSITIVO): dos pestanas DISTINTAS en el mismo desbloqueo si son dos aperturas ---'
begin;
insert into public.desbloqueos_historia (id, perfil_id, caduca_en)
values ('05000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
        now() + interval '15 minutes');
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
select '11111111-1111-4111-8111-111111111111', p.id, 'apertura', 'notas_clinicas',
       '05000000-0000-4000-8000-000000000002'
from public.pacientes p order by p.creado_en, p.id limit 1
on conflict do nothing;
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
select '11111111-1111-4111-8111-111111111111', p.id, 'apertura', 'evaluaciones',
       '05000000-0000-4000-8000-000000000002'
from public.pacientes p order by p.creado_en, p.id limit 1
on conflict do nothing;
select count(*) as filas_con_pestanas_distintas
from public.accesos_historia
where desbloqueo_id = '05000000-0000-4000-8000-000000000002';
rollback;

\echo '--- R5 (CONTROL POSITIVO): sin desbloqueo el indice parcial no aplica y no hay deduplicacion, que es lo correcto ---'
begin;
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
select '11111111-1111-4111-8111-111111111111', p.id, 'apertura', null, null
from public.pacientes p limit 1;
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
select '11111111-1111-4111-8111-111111111111', p.id, 'apertura', null, null
from public.pacientes p limit 1;
select count(*) as filas_sin_desbloqueo from public.accesos_historia where desbloqueo_id is null;
rollback;


-- =========================================================================
-- R6 · Un consentimiento otorgado guarda siempre el texto firmado
-- =========================================================================

\echo '--- R6 (NEGATIVO): otorgar sin texto_firmado ni texto_version FALLA (23514) ---'
begin;
insert into public.consentimientos (paciente_id, tipo, otorgado_en)
select p.id, 'asistencial', now() from public.pacientes p limit 1;
rollback;

\echo '--- R6 (NEGATIVO): otorgar con texto pero SIN version tambien FALLA (23514) ---'
begin;
insert into public.consentimientos (paciente_id, tipo, otorgado_en, texto_firmado)
select p.id, 'asistencial', now(), 'Texto del consentimiento' from public.pacientes p limit 1;
rollback;

\echo '--- R6 (CONTROL POSITIVO): otorgar CON texto y version PASA ---'
begin;
insert into public.consentimientos (paciente_id, tipo, otorgado_en, texto_firmado, texto_version)
select p.id, 'asistencial', now(), 'Texto del consentimiento', 'v3'
from public.pacientes p order by p.creado_en, p.id limit 1
returning tipo, texto_version, (otorgado_en is not null) as otorgado;
rollback;

\echo '--- R6 (CONTROL POSITIVO): un consentimiento PREPARADO y sin otorgar no exige texto ---'
begin;
insert into public.consentimientos (paciente_id, tipo)
select p.id, 'asistencial' from public.pacientes p limit 1
returning tipo, (otorgado_en is null) as sin_otorgar;
rollback;


-- =========================================================================
-- R7 · es_zona_iana() ejecutable por authenticated
-- =========================================================================

\echo '--- R7 (CONTROL POSITIVO): authenticated puede ejecutar es_zona_iana() ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.es_zona_iana('Europe/Madrid') as madrid_es_iana,
       public.es_zona_iana('CET') as cet_es_iana;
rollback;

\echo '--- R7 (CONTRASTE): las funciones de disparador siguen SIN execute para authenticated ---'
select
  has_function_privilege('authenticated', 'public.es_zona_iana(text)', 'execute') as es_zona_iana,
  has_function_privilege('authenticated', 'public.fn_tocar_borrador()', 'execute') as fn_tocar_borrador,
  has_function_privilege('authenticated', 'public.fn_congelar_cabecera_sellada()', 'execute') as fn_congelar,
  has_function_privilege('authenticated', 'public.zona_horaria_centro(uuid)', 'execute') as zona_horaria_centro;

\echo '--- R7: el disparador de zona sigue rechazando lo que debe, tambien desde authenticated ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.centros (nombre, zona_horaria) values ('Centro R7', 'CET');
rollback;


-- =========================================================================
-- Hallazgos dejados por escrito, reproducidos aqui
-- =========================================================================

\echo '--- Hallazgo: borrar un paciente RECIEN CREADO y SIN nada clinico tambien falla (42501). No es "si tiene datos": es SIEMPRE ---'
begin;
insert into public.pacientes (id, nombre, apellidos, profesional_id)
values ('11111111-2222-4333-8444-555555555555', 'Recien', 'Creado',
        '11111111-1111-4111-8111-111111111111');
select
  (select count(*) from public.notas_clinicas_versiones) as versiones_en_toda_la_base,
  (select count(*) from public.accesos_historia)         as accesos_en_toda_la_base;
delete from public.pacientes where id = '11111111-2222-4333-8444-555555555555';
rollback;

\echo '--- Hallazgo: indices creados para las claves ajenas que muerden en T-002 ---'
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in (
    'episodios_asistenciales_profesional_idx',
    'episodio_participantes_paciente_idx',
    'notas_clinicas_autor_idx',
    'notas_clinicas_episodio_idx',
    'pacientes_fusionado_en_idx',
    'pacientes_centro_id_idx',
    'perfiles_centro_id_idx'
  )
order by indexname;

\echo '--- Hallazgo: pacientes.centro_id nace nulo, T-002 necesitara relleno (esperado: con_centro = 0) ---'
select count(*) as pacientes_totales, count(centro_id) as con_centro from public.pacientes;
