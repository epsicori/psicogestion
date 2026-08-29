-- T-002 · Verificación de los criterios 2 a 12 (el 1 son db reset, lint y build).
-- Ejecutar con:
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t002-rls.sql
--
-- FIJACIÓN PROPIA, como pide el diseño: este guion NO depende de supabase/seed.sql ni del
-- seed de T-008. Todo va dentro de UNA transacción que acaba en `rollback`: no deja ni una
-- fila detrás. Las sentencias que DEBEN fallar van envueltas en `savepoint` /
-- `rollback to savepoint`, porque tras un error psql rechaza el resto de la transacción.
--
-- REGLA DE ESTE PROYECTO, escrita en docs/state.md tras T-001: toda prueba negativa lleva
-- su GEMELA POSITIVA SOBRE LA MISMA FILA. Una política que lo deniega todo también pasa una
-- prueba negativa. Ante cada aserción: ¿seguiría verde si quito el arreglo?
--
-- Reparto de personajes:
--   ADM  administrador, sin centro
--   PRO1 profesional sanitario, centro A
--   PRO2 profesional sanitario, centro B
--   TEC  técnico administrativo, centro A
--   P1   paciente de PRO1, centro A          P2  paciente de PRO2, centro B
--   P3   paciente de ADM, SIN centro         PABS paciente de PRO1 fusionado en P2

\set ON_ERROR_STOP off

\set ADM  '\'a0000001-0000-4000-8000-000000000001\''
\set PRO1 '\'a0000001-0000-4000-8000-000000000002\''
\set PRO2 '\'a0000001-0000-4000-8000-000000000003\''
\set TEC  '\'a0000001-0000-4000-8000-000000000004\''

\set CA   '\'c0000001-0000-4000-8000-00000000000a\''
\set CB   '\'c0000001-0000-4000-8000-00000000000b\''

\set P1   '\'d0000001-0000-4000-8000-000000000001\''
\set P2   '\'d0000001-0000-4000-8000-000000000002\''
\set P3   '\'d0000001-0000-4000-8000-000000000003\''
\set PABS '\'d0000001-0000-4000-8000-000000000004\''
\set PCAD '\'d0000001-0000-4000-8000-000000000005\''

\set EPI  '\'e0000001-0000-4000-8000-000000000001\''
\set NCJ  '\'f0000001-0000-4000-8000-000000000001\''
\set NCI  '\'f0000001-0000-4000-8000-000000000002\''
\set NCA  '\'f0000001-0000-4000-8000-000000000003\''
\set EVA  '\'f0000001-0000-4000-8000-000000000004\''

begin;


-- =========================================================================
-- FIJACIÓN
-- =========================================================================

\echo '=== Fijación de datos ==='

insert into public.organizacion (razon_social, nif) values ('Consulta T002 SL', 'B00000002');

insert into public.centros (id, nombre) values
  (:CA, 'Centro A'),
  (:CB, 'Centro B');

-- Los perfiles los crea el disparador `crear_perfil_de_usuario` a partir de los metadatos.
-- Que estas cuatro filas existan después es, ya de por sí, la prueba de que el disparador
-- funciona (y con él, el criterio 1: `db reset` no habría pasado sin él).
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :ADM,  'authenticated', 'authenticated', 'adm@t002.test',  now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"administrador","nombre_completo":"Admin T002"}'::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO1, 'authenticated', 'authenticated', 'pro1@t002.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Pro Uno","centro_id":"' || :CA || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO2, 'authenticated', 'authenticated', 'pro2@t002.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Pro Dos","centro_id":"' || :CB || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :TEC,  'authenticated', 'authenticated', 'tec@t002.test',  now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"tecnico_administrativo","nombre_completo":"Tec Uno","centro_id":"' || :CA || '"}')::jsonb, '', '', '', '');

\echo '--- Fijación: los cuatro perfiles los ha creado el disparador de auth.users ---'
select nombre_completo, rol, estado, centro_id
from public.perfiles
where id in (:ADM, :PRO1, :PRO2, :TEC)
order by rol, nombre_completo;

-- Pacientes. centro_id se deja al disparador de relleno salvo donde se comprueba el nulo.
insert into public.pacientes (id, nombre, apellidos, profesional_id) values
  (:P1, 'Lucia', 'Uno', :PRO1),
  (:P2, 'Diego', 'Dos', :PRO2),
  (:P3, 'Sin',   'Centro', :ADM);   -- ADM no tiene centro y hay DOS activos: queda nulo

-- PABS: paciente de PRO1 fusionado en P2 (cuyo profesional es PRO2). La fusión se fija en
-- el propio insert porque el disparador de columnas reservadas prohíbe cambiar
-- `fusionado_en` a quien no es administrador, y aquí no hay sesión.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id, fusionado_en, fusionado_el)
values (:PABS, 'Lucia', 'Duplicada', :PRO1, :CA, :P2, now());

\echo '--- Fijación: el relleno de centro_id ha hecho su trabajo (P3 queda NULO a propósito) ---'
select nombre || ' ' || apellidos as paciente, centro_id
from public.pacientes where id in (:P1, :P2, :P3, :PABS) order by 1;

-- Episodio conjunto de PRO1 sobre P1, con P1 y P2 como participantes.
insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id, modalidad_relacional, motivo_consulta)
values (:EPI, :P1, :PRO1, :CA, 'pareja', 'Terapia de pareja');

insert into public.episodio_participantes (episodio_id, paciente_id, papel) values
  (:EPI, :P1, 'miembro'),
  (:EPI, :P2, 'miembro');

-- Dos notas de PRO1 en el MISMO episodio: una firmada como conjunta y otra como
-- individual. La segunda es el control negativo del criterio 9.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  (:NCJ, :P1, :EPI, :PRO1),
  (:NCI, :P1, :EPI, :PRO1);

-- Nota propia del ADMINISTRADOR, sobre su propio paciente P3. Es el gemelo positivo del
-- criterio 4: sin ella, «el administrador ve cero notas» sería verde por no ver ninguna.
insert into public.notas_clinicas (id, paciente_id, autor_id) values (:NCA, :P3, :ADM);

insert into public.notas_clinicas_versiones
  (nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, alcance, autor_id)
values
  (:NCJ, 1, '{"t":"conjunta"}',   '{"t":"conjunta"}',   sha256('ncj'::bytea), sha256(''::bytea), 'conjunta',   :PRO1),
  (:NCI, 1, '{"t":"individual"}', '{"t":"individual"}', sha256('nci'::bytea), sha256(''::bytea), 'individual', :PRO1),
  (:NCA, 1, '{"t":"admin"}',      '{"t":"admin"}',      sha256('nca'::bytea), sha256(''::bytea), 'individual', :ADM);

-- El resto del contenido clínico de P1, para que los ceros del técnico no sean ceros
-- porque no haya filas.
insert into public.pacientes_identificacion
  (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice)
values (:P1, 'dni',
        '\x01',                                   -- dni_cifrado, longitud libre
        decode(repeat('00', 12), 'hex'),          -- dni_nonce, exactamente 12 bytes
        decode(repeat('00', 16), 'hex'),          -- dni_etiqueta, exactamente 16 bytes
        sha256('dni-p1'::bytea));                 -- dni_indice, exactamente 32 bytes

insert into public.diagnosticos (episodio_id, paciente_id, cie10es_codigo, diagnosticado_por)
values (:EPI, :P1, 'F41.1', :PRO1);

insert into public.valoraciones_riesgo (paciente_id, episodio_id, nivel, valorado_por)
values (:P1, :EPI, 'alto', :PRO1);

insert into public.evaluaciones (id, paciente_id, episodio_id, instrumento, aplicado_por)
values (:EVA, :P1, :EPI, 'BDI-II', :PRO1);

insert into public.evaluacion_archivos (evaluacion_id, ruta, nombre_original, mime, tamano_bytes, subido_por)
values (:EVA, 't002/bdi.pdf', 'bdi.pdf', 'application/pdf', 1024, :PRO1);

insert into public.informes (paciente_id, episodio_id, tipo, autor_id, contenido)
values (:P1, :EPI, 'seguimiento', :PRO1, 'Informe de seguimiento');

insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'nota_sin_firmar', 'notas_clinicas', :NCI);

-- PIN de los tres perfiles con acceso clínico. Se fija con la función real, que es la
-- única forma de escribir en pines_historia.
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000001","role":"authenticated"}';
select public.fijar_pin_historia('111111');
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select public.fijar_pin_historia('222222');
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000003","role":"authenticated"}';
select public.fijar_pin_historia('333333');
reset request.jwt.claims;

\echo '--- Fijación (control): el técnico NO puede tener PIN (disparador de T-001) ---'
savepoint sp_pin_tecnico;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000004","role":"authenticated"}';
select public.fijar_pin_historia('444444');
rollback to savepoint sp_pin_tecnico;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 2 — el técnico administrativo obtiene CERO filas de las nueve tablas
--              clínicas, y el profesional asignado con desbloqueo las obtiene TODAS
-- =========================================================================

\echo ''
\echo '=== Criterio 2 (negativo): TÉCNICO, nueve ceros ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000004","role":"authenticated"}';

select public.rol_actual() as rol, public.historia_desbloqueada() as candado;

select
  (select count(*) from public.pacientes_identificacion) as identificacion,
  (select count(*) from public.notas_clinicas)           as notas,
  (select count(*) from public.notas_clinicas_versiones) as versiones,
  (select count(*) from public.episodios_asistenciales)  as episodios,
  (select count(*) from public.diagnosticos)             as diagnosticos,
  (select count(*) from public.valoraciones_riesgo)      as riesgo,
  (select count(*) from public.evaluaciones)             as evaluaciones,
  (select count(*) from public.evaluacion_archivos)      as archivos,
  (select count(*) from public.informes)                 as informes;

\echo '--- Criterio 2 (gemelo positivo): el técnico SÍ ve la ficha básica de su centro ---'
select count(*) as pacientes_visibles from public.pacientes;

reset role;
reset request.jwt.claims;

\echo ''
\echo '=== Criterio 2 (gemelo positivo): PRO1 con desbloqueo, nueve recuentos > 0 ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select desbloqueado, motivo from public.desbloquear_historia('222222');
select public.historia_desbloqueada() as candado;

select
  (select count(*) from public.pacientes_identificacion) as identificacion,
  (select count(*) from public.notas_clinicas)           as notas,
  (select count(*) from public.notas_clinicas_versiones) as versiones,
  (select count(*) from public.episodios_asistenciales)  as episodios,
  (select count(*) from public.diagnosticos)             as diagnosticos,
  (select count(*) from public.valoraciones_riesgo)      as riesgo,
  (select count(*) from public.evaluaciones)             as evaluaciones,
  (select count(*) from public.evaluacion_archivos)      as archivos,
  (select count(*) from public.informes)                 as informes;

reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 3 — el técnico está acotado a su centro; el profesional no
-- =========================================================================

\echo ''
\echo '=== Criterio 3: TÉCNICO de centro A — ve P1 (su centro), NO ve P2 (centro B) ni P3 (sin centro) ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000004","role":"authenticated"}';
select nombre || ' ' || apellidos as paciente, centro_id from public.pacientes order by 1;
select
  (select count(*) from public.pacientes where id = :P1) as ve_p1_su_centro,
  (select count(*) from public.pacientes where id = :P2) as ve_p2_otro_centro,
  (select count(*) from public.pacientes where id = :P3) as ve_p3_sin_centro;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 3 (gemelo): PRO2 SÍ ve a su paciente P2 aunque esté en el centro B ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000003","role":"authenticated"}';
select
  (select count(*) from public.pacientes where id = :P2) as pro2_ve_su_p2,
  (select count(*) from public.pacientes where id = :P1) as pro2_ve_p1_ajeno;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 3 (extra): la vista de riesgo sirve al TÉCNICO y no al profesional ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000004","role":"authenticated"}';
select count(*) as filas_para_el_tecnico from public.pacientes_indicador_riesgo;
select paciente_id, indicador from public.pacientes_indicador_riesgo;
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select count(*) as filas_para_el_profesional from public.pacientes_indicador_riesgo;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 3 (extra): el texto de la vista NO contiene la columna nivel ---'
select position('nivel' in pg_get_viewdef('public.pacientes_indicador_riesgo'::regclass)) = 0
       as sin_nivel_en_el_texto,
       position('indicador' in pg_get_viewdef('public.pacientes_indicador_riesgo'::regclass)) > 0
       as con_indicador_control_positivo;


-- =========================================================================
-- CRITERIO 4 — el administrador NO ve notas ajenas, ni con desbloqueo vigente
-- =========================================================================

\echo ''
\echo '=== Criterio 4: ADMIN con desbloqueo VIGENTE ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000001","role":"authenticated"}';
select desbloqueado, motivo from public.desbloquear_historia('111111');
select public.historia_desbloqueada() as candado_abierto;

select
  (select count(*) from public.notas_clinicas where id in (:NCJ, :NCI)) as notas_ajenas_de_pro1,
  (select count(*) from public.notas_clinicas where id = :NCA)          as nota_propia_gemelo_positivo,
  (select count(*) from public.notas_clinicas)                          as total_visible;

\echo '--- Criterio 4 (gemelo): el administrador SÍ ve la ficha básica de TODOS los pacientes ---'
select count(*) as pacientes_visibles_para_admin from public.pacientes;

reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 5 — el candado: cero, sus notas, cero otra vez
-- CRITERIO 6 — alertas_documentacion se lee SIN desbloqueo
-- =========================================================================

\echo ''
\echo '=== Criterio 5, paso 1: PRO1 SIN desbloqueo ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
-- El bloque del criterio 2 dejó una ventana abierta. Se cierra ANTES de medir, o «sin
-- desbloqueo» sería mentira y el paso 1 daría verde por el motivo equivocado.
select public.bloquear_historia() as ventanas_que_venian_abiertas;
select public.historia_desbloqueada() as candado, count(*) as notas from public.notas_clinicas;

\echo '--- Criterio 5, paso 2: PRO1 TRAS desbloquear ---'
select desbloqueado, motivo, caduca_en is not null as hay_ventana from public.desbloquear_historia('222222');
select public.historia_desbloqueada() as candado, count(*) as notas from public.notas_clinicas;

\echo '--- Criterio 5, paso 3: PRO1 TRAS bloquear_historia() ---'
select public.bloquear_historia() as desbloqueos_revocados;
select public.historia_desbloqueada() as candado, count(*) as notas from public.notas_clinicas;

\echo ''
\echo '=== Criterio 6: encadenado al paso 3 — el candado está CERRADO y las alertas se leen igual ==='
select public.historia_desbloqueada() as candado,
       (select count(*) from public.alertas_documentacion) as alertas_visibles,
       (select count(*) from public.notas_clinicas)        as notas_visibles_control_negativo;

reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 7 — la fusión se resuelve en un salto, y no hay cadenas de dos
-- =========================================================================

\echo ''
\echo '=== Criterio 7: PRO2 (profesional del SUPERVIVIENTE P2) lee el registro absorbido PABS ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000003","role":"authenticated"}';
select
  (select count(*) from public.pacientes where id = :PABS) as pro2_lee_el_absorbido,
  (select count(*) from public.pacientes where id = :P1)   as pro2_lee_p1_control_negativo;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 7 (control negativo): TEC del centro A no alcanza PABS por la fusión ---'
\echo '--- (PABS está en el centro A, así que si lo ve es por centro, no por vínculo) ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000004","role":"authenticated"}';
select count(*) as tecnico_ve_pabs_por_su_centro from public.pacientes where id = :PABS;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 7: una cadena de DOS saltos es imposible (el disparador la normaliza) ---'
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id, fusionado_en, fusionado_el)
values (:PCAD, 'Lucia', 'Triplicada', :PRO1, :CA, :PABS, now());
select nombre || ' ' || apellidos as paciente,
       fusionado_en = :PABS as apunta_al_absorbido_mal,
       fusionado_en = :P2   as normalizado_al_superviviente_bien
from public.pacientes where id = :PCAD;

\echo '--- Criterio 7 (gemelo): PRO2 también lee PCAD, en un solo salto ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000003","role":"authenticated"}';
select count(*) as pro2_lee_pcad from public.pacientes where id = :PCAD;
reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 8 — un profesional de baja pierde el acceso, incluido lo suyo
-- =========================================================================

\echo ''
\echo '=== Criterio 8 (gemelo positivo PRIMERO, con estado activo) ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select desbloqueado from public.desbloquear_historia('222222');
select (select estado::text from public.perfiles where id = :PRO1) as estado,
       public.rol_actual() is not null as rol_no_nulo,
       public.es_profesional_asignado(:P1) as asignado,
       (select count(*) from public.pacientes where id = :P1) as ve_su_paciente,
       (select count(*) from public.notas_clinicas)           as ve_sus_notas;
reset role;
reset request.jwt.claims;

update public.perfiles set estado = 'baja', estado_desde = now() where id = :PRO1;

\echo '--- Criterio 8: el MISMO profesional, misma fila, ahora de baja ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select (select estado::text from public.perfiles where id = :PRO1) as estado,
       public.rol_actual() is null as rol_nulo,
       public.es_profesional_asignado(:P1) as asignado,
       (select count(*) from public.pacientes where id = :P1) as ve_su_paciente,
       (select count(*) from public.notas_clinicas)           as ve_sus_notas,
       (select count(*) from public.alertas_documentacion)    as ve_sus_alertas;
reset role;
reset request.jwt.claims;

update public.perfiles set estado = 'activo', estado_desde = now() where id = :PRO1;


-- =========================================================================
-- CRITERIO 9 — la nota conjunta se ve por participación; la individual, no
-- =========================================================================

\echo ''
\echo '=== Criterio 9: PRO2 participa en el episodio por su paciente P2 ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000003","role":"authenticated"}';
select public.es_profesional_del_episodio(:EPI) as participa;
select desbloqueado from public.desbloquear_historia('333333');

select
  (select count(*) from public.notas_clinicas where id = :NCJ) as lee_la_conjunta,
  (select count(*) from public.notas_clinicas where id = :NCI) as lee_la_individual_control_negativo,
  (select count(*) from public.notas_clinicas_versiones v where v.nota_id = :NCJ) as lee_version_conjunta,
  (select count(*) from public.notas_clinicas_versiones v where v.nota_id = :NCI) as lee_version_individual,
  (select count(*) from public.episodios_asistenciales where id = :EPI) as lee_el_episodio,
  (select count(*) from public.diagnosticos where paciente_id = :P1) as lee_diagnosticos_de_p1_no,
  (select count(*) from public.valoraciones_riesgo where paciente_id = :P1) as lee_riesgo_de_p1_no;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 9: el ADMINISTRADOR es ajeno al episodio: cero, ni la conjunta ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000001","role":"authenticated"}';
select public.historia_desbloqueada() as candado,
       public.es_profesional_del_episodio(:EPI) as participa,
       (select count(*) from public.notas_clinicas where id = :NCJ) as lee_la_conjunta,
       (select count(*) from public.notas_clinicas where id = :NCA) as lee_la_suya_gemelo_positivo;
reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 10 — cinco fallos bloquean, se auditan, y el sexto no abre
-- =========================================================================

\echo ''
\echo '=== Criterio 10 (gemelo positivo PRIMERO): el PIN correcto abre ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select desbloqueado, motivo from public.desbloquear_historia('222222');
select public.bloquear_historia() as cerrado;

\echo '--- Criterio 10: cinco intentos fallidos ---'
select 1 as intento, desbloqueado, motivo, bloqueado_hasta is not null as bloqueado from public.desbloquear_historia('000000');
select 2 as intento, desbloqueado, motivo, bloqueado_hasta is not null as bloqueado from public.desbloquear_historia('000000');
select 3 as intento, desbloqueado, motivo, bloqueado_hasta is not null as bloqueado from public.desbloquear_historia('000000');
select 4 as intento, desbloqueado, motivo, bloqueado_hasta is not null as bloqueado from public.desbloquear_historia('000000');
select 5 as intento, desbloqueado, motivo, bloqueado_hasta is not null as bloqueado from public.desbloquear_historia('000000');

\echo '--- Criterio 10: el SEXTO intento, con el PIN CORRECTO, NO abre ---'
select 6 as intento, desbloqueado, motivo from public.desbloquear_historia('222222');
select public.historia_desbloqueada() as candado_sigue_cerrado;
reset role;
reset request.jwt.claims;

\echo '--- Criterio 10: la entrada en auditoria existe, y no lleva ni PIN ni hash ---'
select tabla, operacion, registro_id = :PRO1 as registro_es_el_perfil,
       estado_posterior ->> 'evento' as evento,
       estado_posterior ->> 'intentos_fallidos' as intentos,
       estado_posterior::text not like '%222222%' as sin_pin_en_claro,
       estado_posterior ? 'hash' as lleva_hash
from public.auditoria
where tabla = 'pines_historia';

\echo '--- Criterio 10 (control positivo): adelantando bloqueado_hasta, el PIN correcto SÍ abre ---'
update public.pines_historia set bloqueado_hasta = now() - interval '1 minute' where perfil_id = :PRO1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select desbloqueado, motivo, caduca_en is not null as hay_ventana from public.desbloquear_historia('222222');
select public.historia_desbloqueada() as candado_abierto;
reset role;
reset request.jwt.claims;
\echo '--- ...y el acierto ha reseteado el contador y el bloqueo ---'
select intentos_fallidos, bloqueado_hasta from public.pines_historia where perfil_id = :PRO1;


-- =========================================================================
-- CRITERIO 11 — pines_historia y desbloqueos_historia no se leen desde authenticated
-- =========================================================================

\echo ''
\echo '=== Criterio 11: PRO1 tiene desbloqueo VIGENTE (gemelo positivo del acceso) ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select public.historia_desbloqueada() as candado,
       public.desbloqueo_vigente() is not null as sabe_cuando_caduca;

\echo '--- Criterio 11 CON desbloqueo vigente: select sobre pines_historia DENEGADO ---'
savepoint sp_pines_con;
select count(*) from public.pines_historia;
rollback to savepoint sp_pines_con;

\echo '--- Criterio 11 CON desbloqueo vigente: select sobre desbloqueos_historia DENEGADO ---'
savepoint sp_desb_con;
select count(*) from public.desbloqueos_historia;
rollback to savepoint sp_desb_con;

\echo '--- Criterio 11: se cierra el candado y se repite SIN desbloqueo ---'
select public.bloquear_historia() as cerrado;
select public.historia_desbloqueada() as candado;

savepoint sp_pines_sin;
select count(*) from public.pines_historia;
rollback to savepoint sp_pines_sin;

savepoint sp_desb_sin;
select count(*) from public.desbloqueos_historia;
rollback to savepoint sp_desb_sin;

reset role;
reset request.jwt.claims;


-- =========================================================================
-- CRITERIO 12 — sin recursión por construcción
-- =========================================================================

\echo ''
\echo '=== Criterio 12: ninguna política sobre perfiles, pines_historia ni desbloqueos_historia ==='
\echo '=== menciona rol_actual() ni historia_desbloqueada() ==='
select count(*) as menciones_prohibidas
from pg_policies
where schemaname = 'public'
  and tablename in ('perfiles', 'pines_historia', 'desbloqueos_historia')
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(rol_actual|historia_desbloqueada)';

\echo '--- Criterio 12 (control positivo): la misma consulta SÍ encuentra menciones fuera de esas tres tablas ---'
select count(*) as politicas_que_si_mencionan_rol_actual
from pg_policies
where schemaname = 'public'
  and tablename not in ('perfiles', 'pines_historia', 'desbloqueos_historia')
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'rol_actual';

select count(*) as politicas_que_si_mencionan_el_candado
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'historia_desbloqueada';

\echo '--- Criterio 12: cero políticas sobre las dos tablas del candado, y cero grants ---'
select count(*) as politicas_en_tablas_del_candado
from pg_policies where schemaname = 'public' and tablename in ('pines_historia', 'desbloqueos_historia');

select c.relname,
       coalesce(array_to_string(c.relacl, ' '), '(sin acl)') as privilegios,
       c.relrowsecurity as rls_activo
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('pines_historia', 'desbloqueos_historia')
order by 1;

\echo '--- Criterio 12: las políticas de T-000 sobre pacientes YA NO EXISTEN ---'
select count(*) as politicas_viejas_de_t000
from pg_policies
where schemaname = 'public'
  and policyname in ('pacientes_lectura_profesional_propio', 'pacientes_alta_profesional_propio');

select count(*) as politicas_totales from pg_policies where schemaname = 'public';


-- =========================================================================
-- EXTRAS que el ticket no pide y el diseño exige
-- =========================================================================

\echo ''
\echo '=== Extra 1: la FK de accesos_historia.desbloqueo_id sobrevive al revoke select ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
select desbloqueado from public.desbloquear_historia('222222');
reset role;
reset request.jwt.claims;

-- Los identificadores se leen como `postgres` y viajan en variables de psql: como
-- `authenticated` ya NO se puede leer esa tabla, que es justo lo que prueba el criterio 11.
select d.id as dbl_pro1 from public.desbloqueos_historia d
where d.perfil_id = :PRO1 and d.revocado_en is null and d.caduca_en > now() limit 1
\gset
select d.id as dbl_adm from public.desbloqueos_historia d
where d.perfil_id = :ADM and d.revocado_en is null and d.caduca_en > now() limit 1
\gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana, desbloqueo_id)
values (:PRO1, :P1, 'apertura', 'notas_clinicas', :'dbl_pro1');
select count(*) as accesos_insertados, count(desbloqueo_id) as con_desbloqueo from public.accesos_historia;

\echo '--- Extra 2: un desbloqueo AJENO (el del administrador) en accesos_historia es rechazado ---'
savepoint sp_desb_ajeno;
insert into public.accesos_historia (perfil_id, paciente_id, tipo, desbloqueo_id)
values (:PRO1, :P1, 'apertura', :'dbl_adm');
rollback to savepoint sp_desb_ajeno;

\echo '--- Extra 3: accesos_historia_vistas con acceso PROPIO pasa (gemelo positivo) ---'
insert into public.accesos_historia_vistas (acceso_id)
select a.id from public.accesos_historia a where a.perfil_id = :PRO1 limit 1;
select count(*) as vistas from public.accesos_historia_vistas;

\echo '--- Extra 3: accesos_historia_vistas con acceso INEXISTENTE falla ---'
savepoint sp_vista_huerfana;
insert into public.accesos_historia_vistas (acceso_id) values (999999999);
rollback to savepoint sp_vista_huerfana;

\echo '--- Extra 4 (gemelo positivo): PRO1 SÍ puede editar el nombre de su paciente ---'
update public.pacientes set nombre = 'Lucia Maria' where id = :P1;
select nombre from public.pacientes where id = :P1;

\echo '--- Extra 4: PRO1 NO puede reasignarse un paciente AJENO: UPDATE 0, la RLS ni le enseña la fila ---'
savepoint sp_robar;
update public.pacientes set profesional_id = :PRO1 where id = :P2;
rollback to savepoint sp_robar;

\echo '--- Extra 4: y sobre una fila que SÍ puede tocar, el disparador salta (42501) ---'
\echo '--- (sin esta prueba, la de arriba estaría verde por la RLS y no por el candado de columnas) ---'
savepoint sp_regalar;
update public.pacientes set profesional_id = :PRO2 where id = :P1;
rollback to savepoint sp_regalar;

\echo '--- Extra 4: PRO1 NO puede marcarse SU PROPIO paciente como de titularidad profesional (42501) ---'
savepoint sp_titularidad;
update public.pacientes set titularidad = 'profesional' where id = :P1;
rollback to savepoint sp_titularidad;

\echo '--- Extra 4: PRO1 NO puede cambiar el centro de su propio paciente (42501) ---'
savepoint sp_centro;
update public.pacientes set centro_id = :CB where id = :P1;
rollback to savepoint sp_centro;

reset role;
reset request.jwt.claims;

\echo '--- Extra 4 (gemelo positivo): el ADMINISTRADOR sí puede reasignar ---'
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000001","role":"authenticated"}';
update public.pacientes set profesional_id = :PRO2, centro_id = :CB where id = :P1;
select profesional_id = :PRO2 as reasignado, centro_id = :CB as recentrado
from public.pacientes where id = :P1;
reset role;
reset request.jwt.claims;

\echo ''
\echo '=== Extra 5: el técnico no puede escribir donde no debe ==='
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000001-0000-4000-8000-000000000004","role":"authenticated"}';
\echo '--- (gemelo positivo) el técnico SÍ lee el directorio de compañeros ---'
select count(*) as compañeros from public.directorio_perfiles;
\echo '--- pero el directorio NO expone motivo_estado ---'
select count(*) as columnas_motivo_estado
from information_schema.columns
where table_schema = 'public' and table_name = 'directorio_perfiles' and column_name = 'motivo_estado';
\echo '--- y el técnico NO puede dar de alta un paciente ---'
savepoint sp_tec_alta;
insert into public.pacientes (nombre, apellidos, profesional_id) values ('No', 'Debe', :PRO1);
rollback to savepoint sp_tec_alta;
reset role;
reset request.jwt.claims;


rollback;

\echo ''
\echo '=== Fin. La transacción se ha deshecho entera: la base queda como estaba. ==='
select count(*) as pacientes_en_la_base from public.pacientes;
