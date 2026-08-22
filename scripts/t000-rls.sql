-- T-000 · Verificación de los criterios 3 a 6.
-- Ejecutar con:
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t000-rls.sql
--
-- UUID de la siembra (supabase/seed.sql):
--   A = ana@psicogestion.test   = 11111111-1111-4111-8111-111111111111
--   B = bruno@psicogestion.test = 22222222-2222-4222-8222-222222222222

-- =========================================================================
-- Criterio 3 — un profesional solo ve sus propias filas
-- =========================================================================

\echo '--- Criterio 3: A ve solo su fila ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select count(*), min(nombre) from public.pacientes;
rollback;

\echo '--- Criterio 3: B ve solo su fila ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select count(*), min(nombre) from public.pacientes;
rollback;

-- =========================================================================
-- Criterio 4 — insert con profesional_id ajeno es rechazado; el legítimo pasa
-- =========================================================================

\echo '--- Criterio 4: insert de A con profesional_id de B (debe fallar, 42501) ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.pacientes (nombre, apellidos, profesional_id)
values ('Intento', 'Ajeno', '22222222-2222-4222-8222-222222222222');
rollback;

\echo '--- Criterio 4 (control): insert legítimo de A sí pasa ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.pacientes (nombre, apellidos, profesional_id)
values ('Prueba', 'Legítima', '11111111-1111-4111-8111-111111111111')
returning id;
rollback;

-- =========================================================================
-- Criterio 5 — el insert legítimo deja exactamente una fila en auditoria
-- =========================================================================

\echo '--- Criterio 5: una fila de auditoría por el insert legítimo ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Insert y select por separado, no en la misma sentencia: una CTE que escribe y
-- lee comparte una única snapshot para todo el statement y no vería su propio
-- efecto lateral (la fila que el trigger inserta en auditoria).
insert into public.pacientes (nombre, apellidos, profesional_id)
values ('Prueba', 'Auditada', '11111111-1111-4111-8111-111111111111')
returning id as paciente_id \gset

select count(*), actor_id, tabla, operacion
from public.auditoria
where registro_id = :'paciente_id'
group by actor_id, tabla, operacion;

rollback;

-- =========================================================================
-- Criterio 6 — auditoria es de solo adición, incluso para postgres
-- =========================================================================

\echo '--- Criterio 6: postgres sin privilegio, update falla por permission denied ---'
begin;
update public.auditoria set tabla = 'x';
rollback;

\echo '--- Criterio 6: postgres sin privilegio, delete falla por permission denied ---'
begin;
delete from public.auditoria;
rollback;

\echo '--- Criterio 6: tras recuperar el privilegio, el trigger sigue bloqueando update (42501) ---'
begin;
grant update, delete on table public.auditoria to postgres;
update public.auditoria set tabla = 'x';
rollback;

\echo '--- Criterio 6: tras recuperar el privilegio, el trigger sigue bloqueando delete (42501) ---'
begin;
grant update, delete on table public.auditoria to postgres;
delete from public.auditoria;
rollback;

\echo '--- Criterio 6: delete como authenticated, sin privilegio (permission denied) ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
delete from public.auditoria;
rollback;

-- =========================================================================
-- Criterio 6 (ampliado) — TRUNCATE es un tercer camino de borrado, también cerrado
-- =========================================================================

\echo '--- Criterio 6: TRUNCATE como authenticated, sin privilegio (permission denied) ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
truncate table public.auditoria;
rollback;

\echo '--- Criterio 6: TRUNCATE como postgres (propietario, el REVOKE no le afecta) — el trigger bloquea (42501) ---'
begin;
truncate table public.auditoria;
rollback;

\echo '--- Criterio 6: TRUNCATE como authenticated sobre pacientes, sin privilegio (permission denied) ---'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
truncate table public.pacientes;
rollback;

\echo '--- Criterio 6: TRUNCATE como anon sobre auditoria, sin privilegio (permission denied) ---'
begin;
set local role anon;
truncate table public.auditoria;
rollback;

\echo '--- Criterio 6: TRUNCATE como service_role sobre auditoria, sin privilegio (permission denied) ---'
begin;
set local role service_role;
truncate table public.auditoria;
rollback;
