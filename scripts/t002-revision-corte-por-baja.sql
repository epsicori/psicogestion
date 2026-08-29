-- Revisión con Opus de T-002 · comprobación del corte por baja (ADR-032).
-- Ejecutar con:
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t002-revision-corte-por-baja.sql
--
-- Fijación propia, todo en una transacción con `rollback`.
-- REGLA DEL PROYECTO: toda prueba negativa lleva su gemela positiva sobre la MISMA fila.
-- Aquí eso significa: se comprueba primero que estando ACTIVO sí lo ve. Si no, el cero de
-- después sería cero porque no hay nada, no porque el corte funcione.

\set PRO '\'a9000000-0000-4000-8000-000000000001\''
\set PAC '\'d9000000-0000-4000-8000-000000000001\''

begin;

insert into public.organizacion (razon_social, nif) values ('Revision SL', 'B00000099');
insert into public.centros (id, nombre) values ('c9000000-0000-4000-8000-00000000000a', 'Centro Revision');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', :PRO, 'authenticated', 'authenticated',
        'baja@revision.test', now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"rol":"profesional_sanitario","nombre_completo":"Profesional De Baja"}'::jsonb,
        '', '', '', '');

-- Estando ACTIVO da de alta un paciente (deja auditoría) y entra en su historia (deja acceso).
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.pacientes (id, nombre, apellidos, profesional_id)
values (:PAC, 'Elena', 'Secreto', :PRO);
reset request.jwt.claims;

--  es bigint generado: se toma el que salga, no se inventa.
with acceso as (
  insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana)
  values (:PRO, :PAC, 'apertura', 'notas_clinicas')
  returning id
)
insert into public.accesos_historia_vistas (acceso_id)
select id from acceso;


\echo ''
\echo '=== GEMELA POSITIVA · estando ACTIVO lo ve todo ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';

select (count(*) > 0) as ve_su_paciente         from public.pacientes;
select (count(*) > 0) as ve_su_auditoria        from public.auditoria;
select (count(*) > 0) as ve_sus_accesos         from public.accesos_historia;
select (count(*) > 0) as ve_el_detalle_de_vista from public.accesos_historia_vistas;

reset role;
reset request.jwt.claims;


\echo ''
\echo '=== Se le da de BAJA (ADR-032: el acceso se corta ENTERO) ==='
update public.perfiles set estado = 'baja', estado_desde = now() where id = :PRO;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-000000000001","role":"authenticated"}';

\echo '--- Pacientes: ya lo cortaba T-002 ---'
select (count(*) = 0) as no_ve_pacientes from public.pacientes;

\echo '--- Auditoria: es lo que esta revision cierra ---'
select (count(*) = 0) as no_ve_su_auditoria from public.auditoria;

\echo '--- Y por tanto tampoco el nombre del paciente que iba dentro ---'
select (count(*) = 0) as no_hay_nombre_de_paciente
from public.auditoria where estado_posterior::text like '%Secreto%';

\echo '--- Accesos a historia: delataban a que paciente entro ---'
select (count(*) = 0) as no_ve_sus_accesos from public.accesos_historia;

\echo '--- Y el detalle por pestana, que HEREDA el corte del padre y no se toco ---'
select (count(*) = 0) as no_ve_el_detalle from public.accesos_historia_vistas;

reset role;
reset request.jwt.claims;


\echo ''
\echo '=== Control · el administrador SI sigue viendo los accesos ==='
\echo '    Sin esto, los ceros de arriba podrian ser «nadie ve nada», que no es lo buscado.'
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', 'a9000000-0000-4000-8000-0000000000ad',
        'authenticated', 'authenticated', 'adm@revision.test', now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        '{"rol":"administrador","nombre_completo":"Admin Revision"}'::jsonb, '', '', '', '');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a9000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
select (count(*) > 0) as el_administrador_si_los_ve from public.accesos_historia;
reset role;
reset request.jwt.claims;

rollback;

\echo ''
\echo '=== Fin. Todas las aserciones deben ser ciertas. ==='
