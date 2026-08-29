-- T-002 · Enmienda del ADR-051 — verificación de los siete criterios.
-- Ejecutar con:
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t002-enmienda-multicentro.sql
--
-- FIJACIÓN PROPIA: no depende de supabase/seed.sql ni del seed de T-008. Todo va dentro de
-- UNA transacción que acaba en `rollback`: no deja ni una fila detrás. Las sentencias que
-- DEBEN fallar van en `savepoint` / `rollback to savepoint`, porque tras un error psql
-- rechaza el resto de la transacción.
--
-- REGLA DE ESTE PROYECTO (docs/state.md, tras T-001): toda prueba negativa lleva su GEMELA
-- POSITIVA SOBRE LA MISMA FILA. Ante cada aserción: ¿seguiría verde si quito el arreglo?
--
-- Reparto de personajes:
--   ADM  administrador, sin centro
--   PRO  profesional sanitario, principal CA — se le añaden CB y CC
--   TEC  técnico administrativo, principal CA — se le añade CB
--   PA   paciente de PRO en CA      PB  paciente de PRO en CB      PC  paciente de ADM en CC

\set ON_ERROR_STOP off

\set ADM '\'a0000002-0000-4000-8000-000000000001\''
\set PRO '\'a0000002-0000-4000-8000-000000000002\''
\set TEC '\'a0000002-0000-4000-8000-000000000003\''
\set NUE '\'a0000002-0000-4000-8000-000000000004\''

\set CA  '\'c0000002-0000-4000-8000-00000000000a\''
\set CB  '\'c0000002-0000-4000-8000-00000000000b\''
\set CC  '\'c0000002-0000-4000-8000-00000000000c\''

\set PA  '\'d0000002-0000-4000-8000-000000000001\''
\set PB  '\'d0000002-0000-4000-8000-000000000002\''
\set PC  '\'d0000002-0000-4000-8000-000000000003\''

begin;

-- =========================================================================
-- FIJACIÓN
-- =========================================================================

\echo ''
\echo '=== Fijación ==='

insert into public.organizacion (razon_social, nif) values ('Consulta Enmienda SL', 'B00000051');

insert into public.centros (id, nombre) values
  (:CA, 'Centro A'), (:CB, 'Centro B'), (:CC, 'Centro C');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :ADM, 'authenticated', 'authenticated', 'adm@enm.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"administrador","nombre_completo":"Admin"}'::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO, 'authenticated', 'authenticated', 'pro@enm.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Pro","centro_id":"' || :CA || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :TEC, 'authenticated', 'authenticated', 'tec@enm.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"tecnico_administrativo","nombre_completo":"Tec","centro_id":"' || :CA || '"}')::jsonb, '', '', '', '');

\echo '--- 0 · El alta de usuario crea la PERTENENCIA, no solo el espejo (sección 3 bis) ---'
\echo '    Sin esto centros_actuales() daría cero y un técnico recién creado no vería nada.'
select p.nombre_completo,
       (p.centro_id = :CA)                     as espejo_es_ca,
       (public.centro_principal(p.id) = :CA)   as principal_es_ca,
       (select count(*) from public.perfiles_centros pc
         where pc.perfil_id = p.id and pc.hasta is null) as pertenencias_vigentes
from public.perfiles p
where p.id in (:PRO, :TEC)
order by p.nombre_completo;

\echo '--- 0 bis (control) · el administrador no trae centro: cero pertenencias ---'
select (public.centro_principal(:ADM) is null)  as principal_nulo,
       (select count(*) from public.perfiles_centros where perfil_id = :ADM) as filas;

-- Pacientes. PA lo coloca el relleno (principal de PRO = CA); PB y PC se fijan a mano.
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  (:PA, 'Ana', 'Ache', :PRO);
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:PB, 'Berta', 'Be', :PRO, :CB),
  (:PC, 'Cesar', 'Ce',  :ADM, :CC);


-- =========================================================================
-- CRITERIO 6 · el paciente recibe el PRINCIPAL, no uno al azar
-- =========================================================================
-- Va aquí arriba porque PA ya se ha dado de alta y aún no hemos tocado las pertenencias.

\echo ''
\echo '=== 6 · Alta de paciente: recibe el centro PRINCIPAL del profesional ==='

insert into public.perfiles_centros (perfil_id, centro_id, principal) values
  (:PRO, :CB, false),
  (:PRO, :CC, false);

\echo '--- PRO tiene ahora TRES centros vigentes; el principal sigue siendo CA ---'
select (select count(*) from public.perfiles_centros where perfil_id = :PRO and hasta is null) as vigentes,
       (public.centro_principal(:PRO) = :CA) as principal_es_ca;

insert into public.pacientes (nombre, apellidos, profesional_id)
values ('Nuevo', 'Conjuntos', :PRO);

\echo '--- El paciente nuevo cae en CA (principal), ni CB ni CC ---'
select (centro_id = :CA) as centro_es_el_principal
from public.pacientes where nombre = 'Nuevo' and apellidos = 'Conjuntos';


-- =========================================================================
-- CRITERIO 3 · un solo principal vigente por perfil
-- =========================================================================

\echo ''
\echo '=== 3 · Un segundo principal vigente DEBE fallar ==='

\echo '--- Negativa: segundo principal vigente para PRO ---'
savepoint sp_dos_principales;
insert into public.perfiles_centros (perfil_id, centro_id, principal)
values (:PRO, :CB, true);
rollback to savepoint sp_dos_principales;

\echo '--- Gemela positiva 1: el MISMO centro como NO principal ya existe y no estorba ---'
select (count(*) = 1) as cb_vigente_no_principal
from public.perfiles_centros where perfil_id = :PRO and centro_id = :CB and hasta is null and not principal;

\echo '--- Gemela positiva 2: un principal para OTRO perfil sí entra ---'
savepoint sp_principal_ajeno;
insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:ADM, :CC, true);
select (public.centro_principal(:ADM) = :CC) as admin_tiene_principal;
rollback to savepoint sp_principal_ajeno;

\echo '--- Gemela positiva 3: cerrado el principal, otro puede ascender ---'
\echo '    Asciende la fila de CB que YA existe: insertar una segunda vigente para el'
\echo '    mismo par perfil-centro es justo lo que el otro índice prohíbe.'
savepoint sp_relevo;
update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and principal and hasta is null;
update public.perfiles_centros set principal = true where perfil_id = :PRO and centro_id = :CB and hasta is null;
select (public.centro_principal(:PRO) = :CB) as relevo_de_principal_ok;
rollback to savepoint sp_relevo;

\echo '--- Negativa 2: cerrar en el FUTURO (rompería la igualdad índice = tiempo de ejecución) ---'
savepoint sp_futuro;
update public.perfiles_centros set hasta = current_date + 30 where perfil_id = :PRO and centro_id = :CB;
rollback to savepoint sp_futuro;

\echo '--- Gemela positiva: cerrar HOY sí se admite ---'
savepoint sp_hoy;
update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and centro_id = :CB;
select (count(*) = 1) as cierre_hoy_ok
from public.perfiles_centros where perfil_id = :PRO and centro_id = :CB and hasta = current_date;
rollback to savepoint sp_hoy;


-- =========================================================================
-- CRITERIO 4 · perfiles.centro_id es siempre el espejo del principal vigente
-- =========================================================================

\echo ''
\echo '=== 4 · El espejo sigue al principal: insertar, relevar, cerrar ==='

savepoint sp_espejo;

\echo '--- Tras insertar dos no-principales, el espejo NO se mueve ---'
select (centro_id = :CA) as espejo_sigue_en_ca from public.perfiles where id = :PRO;

\echo '--- Relevo de principal: CA se cierra, CC pasa a principal ---'
update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and centro_id = :CA;
update public.perfiles_centros set principal = true where perfil_id = :PRO and centro_id = :CC and hasta is null;
select (centro_id = :CC) as espejo_sigue_al_relevo from public.perfiles where id = :PRO;

\echo '--- Cerradas TODAS las de PRO, el espejo queda nulo (es profesional, no técnico) ---'
update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and hasta is null;
select (centro_id is null) as espejo_nulo, (public.centro_principal(:PRO) is null) as sin_principal
from public.perfiles where id = :PRO;

rollback to savepoint sp_espejo;

\echo '--- El rollback devuelve el espejo a CA (control de que la prueba de arriba movía algo) ---'
select (centro_id = :CA) as espejo_restaurado from public.perfiles where id = :PRO;

\echo '--- Negativa: cerrar la ÚLTIMA pertenencia de un TÉCNICO debe fallar ---'
\echo '    Sin centro no hay recorte, y sin recorte vería la organización entera.'
savepoint sp_tecnico_sin_centro;
update public.perfiles_centros set hasta = current_date where perfil_id = :TEC and hasta is null;
rollback to savepoint sp_tecnico_sin_centro;

\echo '--- Gemela positiva: al técnico con DOS, cerrarle una sí se admite ---'
savepoint sp_tecnico_dos;
insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:TEC, :CB, false);
update public.perfiles_centros set hasta = current_date where perfil_id = :TEC and centro_id = :CB;
select (count(*) = 1) as cierre_admitido
from public.perfiles_centros where perfil_id = :TEC and centro_id = :CB and hasta is not null;
rollback to savepoint sp_tecnico_dos;


-- =========================================================================
-- CRITERIO 1 · el técnico lee los centros donde está vigente
-- =========================================================================

\echo ''
\echo '=== 1 · Técnico con dos pertenencias lee de los dos; al cerrar una, deja de leer ==='

insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:TEC, :CB, false);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000003","role":"authenticated"}';

\echo '--- Con CA y CB vigentes: ve PA (CA) y PB (CB), y NO ve PC (CC) ---'
select (count(*) filter (where id = :PA) = 1) as ve_pa_de_ca,
       (count(*) filter (where id = :PB) = 1) as ve_pb_de_cb,
       (count(*) filter (where id = :PC) = 0) as no_ve_pc_de_cc
from public.pacientes;

reset role;
reset request.jwt.claims;

update public.perfiles_centros set hasta = current_date where perfil_id = :TEC and centro_id = :CB;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000003","role":"authenticated"}';

\echo '--- Cerrada CB EN LA MISMA SESIÓN: sigue viendo PA y ya NO ve PB ---'
select (count(*) filter (where id = :PA) = 1) as sigue_viendo_pa,
       (count(*) filter (where id = :PB) = 0) as ya_no_ve_pb
from public.pacientes;

reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 2 · al profesional, los centros NO le cambian ni una fila
-- =========================================================================
-- Es la prueba que demuestra que el corte por centro es SOLO del técnico.

\echo ''
\echo '=== 2 · El profesional lee lo mismo con dos centros, con tres o con ninguno ==='

create temporary table conteo_pro (etiqueta text, filas bigint) on commit drop;
-- El recuento se toma DENTRO de la sesión del profesional, para que lo cuente la RLS y no
-- `postgres`. Eso obliga a que `authenticated` pueda escribir aquí: sin este grant, el
-- insert da «permission denied» y aborta la transacción entera.
grant insert on table conteo_pro to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000002","role":"authenticated"}';
insert into conteo_pro select 'con tres centros', count(*) from public.pacientes;
reset role;
reset request.jwt.claims;

update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and not principal and hasta is null;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000002","role":"authenticated"}';
insert into conteo_pro select 'con uno', count(*) from public.pacientes;
reset role;
reset request.jwt.claims;

update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and hasta is null;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000002","role":"authenticated"}';
insert into conteo_pro select 'con ninguno', count(*) from public.pacientes;
reset role;
reset request.jwt.claims;

\echo '--- Las tres cifras tienen que ser LA MISMA, y distinta de cero ---'
select (select count(distinct filas) from conteo_pro) = 1 as identicas,
       (select min(filas) from conteo_pro) > 0            as y_no_son_cero;
select * from conteo_pro order by 1;

-- Se le devuelve el principal para lo que queda.
insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:PRO, :CA, true);


-- =========================================================================
-- CRITERIO 5 · quién puede escribir en perfiles_centros
-- =========================================================================

\echo ''
\echo '=== 5 · El profesional no se asigna centros a sí mismo; el administrador sí ==='

\echo '--- Negativa: PRO intenta darse CC ---'
savepoint sp_pro_escribe;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:PRO, :CC, false);
reset role;
reset request.jwt.claims;
rollback to savepoint sp_pro_escribe;

\echo '--- Negativa 2: PRO intenta CERRAR una pertenencia (update) ---'
savepoint sp_pro_cierra;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000002","role":"authenticated"}';
update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and hasta is null;
-- El `UPDATE 0` de arriba ya es la prueba: la política no le deja ni una fila. Se asevera
-- sobre lo que importa —que su pertenencia sigue ABIERTA— y no sobre «no hay filas
-- cerradas de PRO», que sería falso por las que cerró el criterio 2 legítimamente.
select (count(*) = 1) as pertenencia_sigue_vigente_pese_al_intento
from public.perfiles_centros where perfil_id = :PRO and hasta is null and principal;
reset role;
reset request.jwt.claims;
rollback to savepoint sp_pro_cierra;

\echo '--- Gemela positiva: el ADMINISTRADOR sí puede, la MISMA fila y el MISMO insert ---'
savepoint sp_adm_escribe;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000001","role":"authenticated"}';
insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:PRO, :CC, false);
select (count(*) = 1) as admin_pudo_insertar
from public.perfiles_centros where perfil_id = :PRO and centro_id = :CC and hasta is null;
reset role;
reset request.jwt.claims;
rollback to savepoint sp_adm_escribe;

\echo '--- Los tres roles LEEN el directorio (es directorio, no secreto) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000002","role":"authenticated"}';
select count(*) > 0 as pro_lee from public.perfiles_centros;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000003","role":"authenticated"}';
select count(*) > 0 as tec_lee from public.perfiles_centros;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000001","role":"authenticated"}';
select count(*) > 0 as adm_lee from public.perfiles_centros;
reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 7 · se cierra, no se borra
-- =========================================================================

\echo ''
\echo '=== 7 · DELETE no está en ningún camino: el cierre es siempre hasta ==='

\echo '--- Negativa: el administrador tampoco tiene privilegio de DELETE ---'
savepoint sp_delete;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000001","role":"authenticated"}';
delete from public.perfiles_centros where perfil_id = :PRO;
reset role;
reset request.jwt.claims;
rollback to savepoint sp_delete;

\echo '--- Gemela positiva: la MISMA fila se cierra con update, y sigue ahí ---'
savepoint sp_cierre;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000002-0000-4000-8000-000000000001","role":"authenticated"}';
update public.perfiles_centros set hasta = current_date where perfil_id = :PRO and centro_id = :CA and hasta is null;
reset role;
reset request.jwt.claims;
-- Independiente del historial: el criterio 2 ya cerró y reabrió esta pertenencia, así que
-- aquí hay más de una fila CA y aseverar «count = 1» sería aseverar sobre el pasado.
-- Lo que se comprueba es lo que el criterio dice: no queda ninguna vigente, y la fila
-- sigue en la tabla — cerrada, no borrada.
select (count(*) filter (where hasta is null)     = 0) as ya_no_hay_vigente,
       (count(*) filter (where hasta is not null) > 0) as la_fila_sigue_ahi_cerrada
from public.perfiles_centros where perfil_id = :PRO and centro_id = :CA;
rollback to savepoint sp_cierre;

\echo '--- La auditoría ha registrado los cambios de pertenencia ---'
select count(*) > 0 as hay_auditoria_de_perfiles_centros
from public.auditoria where tabla = 'perfiles_centros';

\echo '--- Y con registro_id no nulo: fn_auditar lo saca de la columna id ---'
select (count(*) filter (where registro_id is null) = 0) as todos_con_registro_id
from public.auditoria where tabla = 'perfiles_centros';


rollback;

\echo ''
\echo '=== Fin. Los errores de la salida son las aserciones negativas buscadas. ==='
