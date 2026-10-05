-- T-041 · Altas de centro para quien atiende (diseño §1 P1, §3).
--
-- Prueba la base por la MISMA llamada que hace la aplicación: `public.dar_alta_centro()` y
-- `public.retirar_alta_centro()` son las que llama `lib/cuentas/altas.ts` (y `invitar.ts`
-- para los centros que no son el principal). Ninguna alta de lo que se prueba se inserta
-- como `postgres`: eso es justo lo que el criterio 1 pide no hacer (el módulo 19 lo hace
-- para la fijación de T-035, y aquí no se usa).
--
-- Corre el último. Usa ADM, PRO1, PRO2 y TEC1 de 01-fijacion.sql, y crea sus propios
-- centros, paciente, episodios y perfiles invitados. Fija los PIN que necesita (los mismos
-- valores que 19 y 20, para no estorbar a nadie).
--
-- Secciones (diseño §3): A criterio 1 · B criterio 2 · C criterio 3 · D criterio 4 ·
-- E disparador «solo cierre» · F resto de casos de las RPC · G alarma ADR-065.

\echo ''
\echo '=== 28-altas-de-centro ==='

\set C41A  '\'c0410001-0000-4000-8000-00000000000a\''
\set C41B  '\'c0410001-0000-4000-8000-00000000000b\''
\set C41Z  '\'c0410001-0000-4000-8000-00000000000f\''
\set CNADA '\'c0410001-0000-4000-8000-0000000000ee\''
\set P41   '\'d0410001-0000-4000-8000-000000000001\''
\set P41M  '\'d0410001-0000-4000-8000-000000000002\''
\set E41A  '\'e0410001-0000-4000-8000-00000000000a\''
\set E41B  '\'e0410001-0000-4000-8000-00000000000b\''
\set E41M  '\'e0410001-0000-4000-8000-00000000000c\''
\set N41A  '\'f0410001-0000-4000-8000-00000000000a\''
\set N41M  '\'f0410001-0000-4000-8000-00000000000c\''
\set INV   '\'b0410001-0000-4000-8000-000000000001\''
\set INV2  '\'b0410001-0000-4000-8000-000000000002\''
\set PNADA '\'b0410001-0000-4000-8000-0000000000ee\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres: es el escenario, no lo que se prueba)
-- ---------------------------------------------------------------------------
insert into public.centros (id, nombre) values
  (:C41A, 'Centro A (T-041)'),
  (:C41B, 'Centro B (T-041)');
insert into public.centros (id, nombre, activo) values
  (:C41Z, 'Centro Z cerrado (T-041)', false);
-- PRO1 atiende en los dos centros: es el autor de las notas de coterapia.
insert into public.perfiles_centros (perfil_id, centro_id, principal) values
  (:PRO1, :C41A, false),
  (:PRO1, :C41B, false);
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P41,  'Paula', 'T041', :PRO1, :C41A),
  (:P41M, 'Marta', 'T041 ADM', :ADM, :C41A);
insert into public.episodios_asistenciales
  (id, paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en) values
  (:E41A, :P41,  :PRO1, :C41A, 'individual', current_date - 10),
  (:E41B, :P41,  :PRO1, :C41B, 'individual', current_date - 10),
  (:E41M, :P41M, :ADM,  :C41A, 'individual', current_date - 10);

-- Controles: se fijan, no se suponen. Si un módulo anterior diera a ADM un alta en C41A o
-- C41B, la gemela «sin alta» dejaría de serlo.
select pg_temp.assert(
  (select count(*) from public.perfiles_centros
    where perfil_id = :ADM and centro_id in (:C41A, :C41B) and hasta is null) = 0,
  '28.0 Control: ADM no tiene alta vigente en C41A ni en C41B');
select pg_temp.assert(
  (select rol::text from public.perfiles where id = :ADM) = 'administrador'
  and (select estado::text from public.perfiles where id = :ADM) = 'activo'
  and (select rol::text from public.perfiles where id = :PRO1) = 'profesional_sanitario'
  and (select estado::text from public.perfiles where id = :PRO1) = 'activo'
  and (select rol::text from public.perfiles where id = :PRO2) = 'profesional_sanitario'
  and (select estado::text from public.perfiles where id = :PRO2) = 'activo'
  and (select rol::text from public.perfiles where id = :TEC1) = 'tecnico_administrativo'
  and (select estado::text from public.perfiles where id = :TEC1) = 'activo',
  '28.0 Control: roles y estado activo de ADM, PRO1, PRO2 y TEC1');

call pg_temp.como_con_2fa(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:ADM);  select public.fijar_pin_historia('333333'); call pg_temp.reset_sesion();

-- D (antes del alta) · Lo que ADM, desbloqueado, ve de notas ajenas ANTES de tener ningún
-- alta en C41A. Se guarda para compararlo después (criterio 4).
call pg_temp.como(:ADM);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('333333')),
  '28.D0 El PIN de ADM desbloquea la historia');
select pg_temp.contar(format(
  'select 1 from public.notas_clinicas_versiones where autor_id <> %L', :ADM)) as d_ajenas_antes \gset
select public.bloquear_historia();
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- A · Criterio 1: el administrador con alta en el centro del episodio es coprofesional;
--     sin alta, 23514 con el texto de 7c. El alta va por la RPC de la aplicación.
-- ---------------------------------------------------------------------------
call pg_temp.como(:ADM);
select public.dar_alta_centro(:ADM, :C41A) as a_alta_adm \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.perfiles_centros
    where id = :'a_alta_adm' and perfil_id = :ADM and centro_id = :C41A
      and hasta is null and desde = current_date) = 1,
  '28.A1 dar_alta_centro(ADM, C41A) como ADM deja una fila vigente desde hoy y devuelve su id');

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  '28.A2 El PIN de PRO1 desbloquea la historia');
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L, %L)',
         :N41A, :P41, :E41A, :PRO1, :ADM),
  '28.A2 Nota de PRO1 en E41A (C41A) con ADM de coprofesional: pasa, ADM tiene alta en C41A');
-- Gemela: el mismo par en el episodio de C41B, donde ADM no tiene alta.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P41, :E41B, :PRO1, :ADM),
  '23514', 'no tiene alta en el centro del episodio',
  '28.A3 La misma nota en E41B (C41B, sin alta de ADM): 23514 «no tiene alta en el centro del episodio»');
select public.bloquear_historia();
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- B · Criterio 2: un profesional invitado con un centro es coprofesional allí, no en otro;
--     y tras retirarle el alta, no en una nota nueva.
-- ---------------------------------------------------------------------------
-- La invitación, como la emula 13-cuentas.sql: preparar, crear el usuario con sus
-- metadatos (el disparador crea perfil y alta principal) y registrar.
call pg_temp.como(:ADM);
select public.preparar_invitacion('profesional_sanitario'::public.rol_usuario, :C41A);
call pg_temp.reset_sesion();
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :INV, 'authenticated', 'authenticated', 'inv41@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Invitada T041","centro_id":"' || :C41A || '"}')::jsonb, '', '', '', '');
call pg_temp.como(:ADM);
select public.registrar_invitacion(:INV);
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.perfiles_centros where perfil_id = :INV) = 1
  and (select count(*) from public.perfiles_centros
        where perfil_id = :INV and centro_id = :C41A and principal and hasta is null) = 1,
  '28.B1 La invitación con C41A deja UNA pertenencia, principal y vigente, en C41A');

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  '28.B2 El PIN de PRO1 desbloquea la historia');
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P41, :E41A, :PRO1, :INV),
  '28.B2 Nota de PRO1 en E41A (C41A) con la invitada de coprofesional: pasa');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P41, :E41B, :PRO1, :INV),
  '23514', 'no tiene alta en el centro del episodio',
  '28.B3 La misma con E41B (C41B): 23514 «no tiene alta en el centro del episodio»');
select public.bloquear_historia();
call pg_temp.reset_sesion();

-- Se le retira el alta por la RPC; una nota NUEVA en E41A ya no la admite (guion manual 3).
call pg_temp.como(:ADM);
select public.retirar_alta_centro(:INV, :C41A);
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.perfiles_centros
    where perfil_id = :INV and centro_id = :C41A and hasta = current_date) = 1
  and (select count(*) from public.perfiles_centros
        where perfil_id = :INV and centro_id = :C41A and hasta is null) = 0,
  '28.B4 retirar_alta_centro(INV, C41A) cierra la pertenencia con hasta = hoy (no la borra)');
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  '28.B5 El PIN de PRO1 desbloquea la historia');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P41, :E41A, :PRO1, :INV),
  '23514', 'no tiene alta en el centro del episodio',
  '28.B5 Tras retirar el alta, una nota nueva en E41A con la invitada: 23514');
select public.bloquear_historia();
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- C · Criterio 3: solo el administrador da o retira; profesional y técnico reciben 42501
--     de la base, y la tabla no cambia.
-- ---------------------------------------------------------------------------
select count(*) as c_filas_antes from public.perfiles_centros \gset
select count(*) as c_pro2_b_antes from public.perfiles_centros
  where perfil_id = :PRO2 and centro_id = :C41B \gset

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41B), '42501',
  '28.C1 PRO1 no da altas: 42501');
select pg_temp.assert_lanza_codigo(
  format('select public.retirar_alta_centro(%L, %L)', :ADM, :C41A), '42501',
  '28.C2 PRO1 no retira altas: 42501');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41B), '42501',
  '28.C3 TEC1 no da altas: 42501');
select pg_temp.assert_lanza_codigo(
  format('select public.retirar_alta_centro(%L, %L)', :ADM, :C41A), '42501',
  '28.C4 TEC1 no retira altas: 42501');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.perfiles_centros) = :c_filas_antes
  and (select count(*) from public.perfiles_centros
        where perfil_id = :ADM and centro_id = :C41A and hasta is null) = 1,
  '28.C5 Tras los cuatro rechazos la tabla no cambió: mismas filas y el alta de ADM en C41A sigue vigente');

-- Un perfil no activo con JWT vivo: rol_actual() es nulo, y `null <> 'administrador'` no
-- es verdadero. Con `is distinct from` da 42501; con `<>` pasaría la guarda y daría el alta.
savepoint s28_c6;
update public.perfiles set estado = 'suspendido', estado_desde = now() where id = :PRO2;
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo(
  format('select public.dar_alta_centro(%L, %L)', :PRO1, :C41Z), '42501',
  '28.C6 Un perfil suspendido con JWT vivo no da altas: 42501 (is distinct from, no <>)');
select pg_temp.assert_lanza_codigo(
  format('select public.retirar_alta_centro(%L, %L)', :PRO1, :C41A), '42501',
  '28.C6 Un perfil suspendido con JWT vivo no retira altas: 42501');
call pg_temp.reset_sesion();
rollback to savepoint s28_c6;

-- Gemela: las mismas dos llamadas como ADM no lanzan (en un savepoint para no mover el
-- escenario de las secciones siguientes).
savepoint s28_c7;
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41B),
  '28.C7 (gemela) ADM da el alta de PRO2 en C41B');
select pg_temp.assert_no_lanza(
  format('select public.retirar_alta_centro(%L, %L)', :PRO2, :C41B),
  '28.C7 (gemela) ADM la retira');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.perfiles_centros where perfil_id = :PRO2 and centro_id = :C41B)
    = :c_pro2_b_antes + 1,
  '28.C7 (gemela) La fila de PRO2 en C41B existe, cerrada: las RPC sí escriben para ADM');
rollback to savepoint s28_c7;

-- ---------------------------------------------------------------------------
-- D · Criterio 4: el alta no le da a ADM ninguna versión de nota ajena.
-- ---------------------------------------------------------------------------
-- Se firma la nota de coterapia de PRO1 (E41A, ADM coprofesional) como postgres (exento del
-- paso 0 y de 6.17-6.24: es fijación; lo que se prueba es lo que ADM lee).
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:N41A, '{"texto":"coterapia t041"}',
   pg_temp.sobre_prueba(:N41A, :PRO1, timestamptz '2026-10-05 10:41:00+00', '{"texto":"coterapia t041"}'::jsonb),
   'individual', :PRO1, timestamptz '2026-10-05 10:41:00+00');
select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where nota_id = :N41A) = 1
  and (select coprofesional_id from public.notas_clinicas where id = :N41A) = :ADM,
  '28.D1 (preparación) la nota de coterapia de PRO1 con ADM de coprofesional está firmada');
-- Y una nota de ADM sobre su propia paciente, para la gemela «ADM sí lee lo suyo».
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id)
  values (:N41M, :P41M, :E41M, :ADM);
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:N41M, '{"texto":"propia t041"}',
   pg_temp.sobre_prueba(:N41M, :ADM, timestamptz '2026-10-05 10:42:00+00', '{"texto":"propia t041"}'::jsonb),
   'individual', :ADM, timestamptz '2026-10-05 10:42:00+00');

call pg_temp.como(:ADM);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('333333')),
  '28.D2 El PIN de ADM desbloquea la historia');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.notas_clinicas_versiones where autor_id <> %L', :ADM))
    = :d_ajenas_antes,
  '28.D2 ADM, con alta en C41A y coprofesional de una nota firmada allí, ve las MISMAS versiones ajenas que antes del alta');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.notas_clinicas_versiones where paciente_id = %L', :P41)) = 0,
  '28.D3 ADM ve 0 versiones de P41 (paciente de PRO1), la de coterapia incluida');
-- Gemela de que la sesión de ADM lee: su propia nota sí sale.
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.notas_clinicas_versiones where paciente_id = %L', :P41M)) = 1,
  '28.D4 (gemela) ADM desbloqueado ve la versión de su propia paciente');
select public.bloquear_historia();
call pg_temp.reset_sesion();
-- Gemela de que la consulta muerde: PRO1, desbloqueado, ve la versión de P41.
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  '28.D5 El PIN de PRO1 desbloquea la historia');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.notas_clinicas_versiones where paciente_id = %L', :P41)) = 1,
  '28.D5 (gemela) PRO1 desbloqueado ve 1 versión de P41: la consulta no da 0 por estar mal escrita');
select public.bloquear_historia();
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- E · Disparador perfiles_centros_solo_cierre: una pertenencia cerrada no se reabre ni se
--     reescribe; de una vigente solo cambian el cierre y la marca de principal.
-- ---------------------------------------------------------------------------
select id as e_cerrada from public.perfiles_centros
 where perfil_id = :INV and centro_id = :C41A and hasta is not null \gset
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set hasta = null where id = %L', :'e_cerrada'),
  '42501', 'cerrada no se modifica',
  '28.E1 ADM por PostgREST no reabre una pertenencia cerrada: 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set principal = false where id = %L', :'e_cerrada'),
  '42501', 'cerrada no se modifica',
  '28.E1 Ni le cambia la marca de principal: 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set centro_id = %L where id = %L', :C41B, :'a_alta_adm'),
  '42501', 'solo cambian el cierre y la marca de principal',
  '28.E2 ADM no cambia el centro de una pertenencia vigente: 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set desde = desde - 1 where id = %L', :'a_alta_adm'),
  '42501', 'solo cambian el cierre y la marca de principal',
  '28.E3 ADM no cambia el desde de una pertenencia vigente: 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set perfil_id = %L where id = %L', :PRO2, :'a_alta_adm'),
  '42501', 'solo cambian el cierre y la marca de principal',
  '28.E3 ADM no cambia el perfil de una pertenencia vigente: 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set creado_en = creado_en - interval ''1 day'' where id = %L', :'a_alta_adm'),
  '42501', 'solo cambian el cierre y la marca de principal',
  '28.E3 ADM no cambia el creado_en de una pertenencia vigente: 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set id = gen_random_uuid() where id = %L', :'a_alta_adm'),
  '42501', 'solo cambian el cierre y la marca de principal',
  '28.E3 ADM no cambia el id de una pertenencia vigente: 42501 (el rastro de auditoría apunta a él)');
-- Cierre fechado en el pasado: un alta vigente desde hace cinco días (escenario como postgres,
-- en un savepoint) no se cierra con una fecha anterior a hoy ni posterior.
call pg_temp.reset_sesion();
savepoint s28_e9;
insert into public.perfiles_centros (id, perfil_id, centro_id, principal, desde)
values ('c0410001-0000-4000-8000-0000000000a1', :PRO2, :C41A, false, current_date - 5);
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  $q$update public.perfiles_centros set hasta = current_date - 1 where id = 'c0410001-0000-4000-8000-0000000000a1'$q$,
  '42501', 'se cierra con la fecha de hoy',
  '28.E9 ADM no cierra una pertenencia con una fecha pasada: 42501');
select pg_temp.assert_lanza_codigo_msg(
  $q$update public.perfiles_centros set hasta = current_date + 1 where id = 'c0410001-0000-4000-8000-0000000000a1'$q$,
  '42501', 'se cierra con la fecha de hoy',
  '28.E9 Ni con una fecha futura: 42501');
select pg_temp.assert_no_lanza(
  $q$update public.perfiles_centros set hasta = current_date where id = 'c0410001-0000-4000-8000-0000000000a1'$q$,
  '28.E9 (gemela) Cerrarla con hasta = hoy pasa');
call pg_temp.reset_sesion();
rollback to savepoint s28_e9;
call pg_temp.como(:ADM);
-- Gemela: la marca de principal de una vigente sí cambia.
savepoint s28_e4;
select pg_temp.assert_no_lanza(
  format('update public.perfiles_centros set principal = not principal where id = %L', :'a_alta_adm'),
  '28.E4 (gemela) Cambiar la marca de principal de una pertenencia vigente pasa');
rollback to savepoint s28_e4;
select pg_temp.assert_lanza_codigo(
  format('delete from public.perfiles_centros where id = %L', :'e_cerrada'), '42501',
  '28.E5 ADM no borra pertenencias: 42501 (no hay grant delete)');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select hasta = current_date from public.perfiles_centros where id = :'e_cerrada'),
  '28.E6 La pertenencia cerrada sigue cerrada con hasta = hoy');
-- El disparador vale también para postgres (todos los roles).
select pg_temp.assert_lanza_codigo_msg(
  format('update public.perfiles_centros set hasta = null where id = %L', :'e_cerrada'),
  '42501', 'cerrada no se modifica',
  '28.E7 Tampoco postgres reabre una pertenencia cerrada');
-- El cierre por la RPC queda auditado con el administrador como actor.
select pg_temp.assert(
  (select count(*) from public.perfiles_centros
    where perfil_id = :INV and centro_id = :C41A) = 1
  and exists (select 1 from public.auditoria
               where tabla = 'perfiles_centros' and operacion = 'UPDATE'
                 and registro_id = :'e_cerrada' and actor_id = :ADM
                 and estado_anterior ->> 'hasta' is null
                 and estado_posterior ->> 'hasta' = current_date::text),
  '28.E8 Tras retirar hay UNA fila del par, y auditoria tiene su UPDATE (hasta null → hoy) con actor ADM');

-- ---------------------------------------------------------------------------
-- F · Resto de casos de las RPC
-- ---------------------------------------------------------------------------
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  format('select public.dar_alta_centro(%L, %L)', :TEC1, :C41B), '22023',
  '28.F1 Destino técnico administrativo: dar_alta_centro da 22023');
select pg_temp.assert_lanza_codigo(
  format('select public.retirar_alta_centro(%L, %L)', :TEC1, :CA), '22023',
  '28.F1 Destino técnico administrativo: retirar_alta_centro da 22023 (no le cierra su centro)');
select pg_temp.assert_lanza_codigo(
  format('select public.dar_alta_centro(%L, %L)', :PNADA, :C41A), '23503',
  '28.F2 Perfil inexistente: 23503');
select pg_temp.assert_lanza_codigo(
  format('select public.retirar_alta_centro(%L, %L)', :PNADA, :C41A), '23503',
  '28.F2 Perfil inexistente al retirar: 23503');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :CNADA), '23503', 'El centro no existe',
  '28.F3 Centro inexistente: 23503');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.dar_alta_centro(%L, null)', :PRO2), '23503', 'El centro no existe',
  '28.F3 Centro nulo: 23503, sin insertar un centro_id nulo');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41Z), '23514', 'El centro está cerrado',
  '28.F4 Centro inactivo (C41Z): 23514');
select pg_temp.assert_lanza_codigo(
  format('select public.retirar_alta_centro(%L, %L)', :PRO2, :C41B), 'P0002',
  '28.F5 Retirar sin alta vigente: P0002');
call pg_temp.reset_sesion();

-- Destino suspendido: 23514. Gemela: el mismo par con el perfil activo pasa.
savepoint s28_f6;
update public.perfiles set estado = 'suspendido', estado_desde = now() where id = :PRO2;
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41B), '23514', 'El perfil no está activo',
  '28.F6 Destino suspendido: 23514');
call pg_temp.reset_sesion();
rollback to savepoint s28_f6;
-- Destino de baja: también 23514 (con `= 'suspendido'` se colaría).
savepoint s28_f6c;
update public.perfiles set estado = 'baja', estado_desde = now() where id = :PRO2;
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41B), '23514', 'El perfil no está activo',
  '28.F6 Destino de baja: 23514');
call pg_temp.reset_sesion();
rollback to savepoint s28_f6c;
savepoint s28_f6b;
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format('select public.dar_alta_centro(%L, %L)', :PRO2, :C41B),
  '28.F6 (gemela) El mismo par con PRO2 activo pasa');
call pg_temp.reset_sesion();
rollback to savepoint s28_f6b;

-- Idempotencia: dar dos veces devuelve el mismo id y deja una sola fila vigente.
call pg_temp.como(:ADM);
select public.dar_alta_centro(:ADM, :C41A) as f_otra_vez \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  :'f_otra_vez' = :'a_alta_adm'
  and (select count(*) from public.perfiles_centros
        where perfil_id = :ADM and centro_id = :C41A and hasta is null) = 1,
  '28.F7 Dar dos veces el mismo alta devuelve el mismo id y deja una sola fila vigente');

-- Principal: un perfil invitado sin centro (profesional, centro nulo).
call pg_temp.como(:ADM);
select public.preparar_invitacion('profesional_sanitario'::public.rol_usuario, null);
call pg_temp.reset_sesion();
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :INV2, 'authenticated', 'authenticated', 'inv41b@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"profesional_sanitario","nombre_completo":"Invitado T041 sin centro"}'::jsonb, '', '', '', '');
select pg_temp.assert(
  (select count(*) from public.perfiles_centros where perfil_id = :INV2) = 0
  and (select centro_id from public.perfiles where id = :INV2) is null,
  '28.F8 (preparación) INV2 no tiene pertenencias ni centro');
call pg_temp.como(:ADM);
select public.dar_alta_centro(:INV2, :C41A) as f_inv2_a \gset
select public.dar_alta_centro(:INV2, :C41B) as f_inv2_b \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select principal from public.perfiles_centros where id = :'f_inv2_a')
  and (select centro_id from public.perfiles where id = :INV2) = :C41A,
  '28.F8 La primera alta de quien no tiene principal es principal, y perfiles.centro_id la refleja');
select pg_temp.assert(
  (select not principal from public.perfiles_centros where id = :'f_inv2_b'),
  '28.F9 La segunda alta no es principal');
call pg_temp.como(:ADM);
select public.retirar_alta_centro(:INV2, :C41A);
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select centro_id from public.perfiles where id = :INV2) is null
  and (select hasta is null and not principal from public.perfiles_centros where id = :'f_inv2_b'),
  '28.F10 Retirar el principal deja perfiles.centro_id nulo; la otra alta sigue vigente y NO pasa a principal (D5)');
-- Ciclo sobre el MISMO par: INV2 sin principal y con C41B vigente. Se le vuelve a dar C41A,
-- cuya fila anterior está cerrada: la idempotencia no puede devolver la cerrada, el cálculo
-- del principal no puede contarla, y el segundo retirar no puede tocarla.
call pg_temp.como(:ADM);
select public.dar_alta_centro(:INV2, :C41A) as f_inv2_a2 \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  :'f_inv2_a2' <> :'f_inv2_a'
  and (select count(*) from public.perfiles_centros where perfil_id = :INV2 and centro_id = :C41A) = 2
  and (select count(*) from public.perfiles_centros
        where perfil_id = :INV2 and centro_id = :C41A and hasta is null and id = :'f_inv2_a2') = 1,
  '28.F11 Volver a dar un alta ya retirada inserta una fila nueva (id distinto): el par tiene dos, una cerrada y una vigente');
select pg_temp.assert(
  (select principal from public.perfiles_centros where id = :'f_inv2_a2')
  and (select centro_id from public.perfiles where id = :INV2) = :C41A,
  '28.F12 Sin principal vigente (una cerrada no cuenta), la alta nueva es principal y el espejo la refleja');
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format('select public.retirar_alta_centro(%L, %L)', :INV2, :C41A),
  '28.F13 Retirar de nuevo el mismo par pasa: el update no toca la fila cerrada');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.perfiles_centros
    where perfil_id = :INV2 and centro_id = :C41A and hasta = current_date) = 2
  and (select centro_id from public.perfiles where id = :INV2) is null,
  '28.F13 Las dos filas del par quedan cerradas y el perfil sin principal');

-- La primera alta de ADM (sección A) fue también su principal si no tenía otro: lo mismo
-- que F8, sobre el administrador. No se fija: depende de lo que dejen los módulos previos.

-- ---------------------------------------------------------------------------
-- G · Alarma ADR-065 y lista cerrada de roles (catálogo)
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select string_agg(column_name::text, ',' order by ordinal_position)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'perfiles')
  = 'id,nombre_completo,rol,creado_en,estado,estado_desde,motivo_estado,centro_id,descanso_activo,descanso_minutos',
  '28.G1 ADR-065: si añades una marca de función a perfiles (director administrativo), exclúyela en 7b de fn_exigir_episodio_coherente_en_nota y en dar_alta_centro antes de tocar este assert');
select pg_temp.assert(
  pg_get_functiondef('public.dar_alta_centro(uuid,uuid)'::regprocedure)
    ~ 'v_rol\s+not\s+in\s*\(\s*''profesional_sanitario''::public\.rol_usuario\s*,\s*''administrador''::public\.rol_usuario\s*\)',
  '28.G2 dar_alta_centro usa la lista cerrada de 7b (profesional_sanitario, administrador), no <> tecnico_administrativo');
select pg_temp.assert(
  pg_get_functiondef('public.retirar_alta_centro(uuid,uuid)'::regprocedure)
    ~ 'v_rol\s+not\s+in\s*\(\s*''profesional_sanitario''::public\.rol_usuario\s*,\s*''administrador''::public\.rol_usuario\s*\)',
  '28.G3 retirar_alta_centro usa la misma lista cerrada');
select pg_temp.assert(
  pg_get_functiondef('public.dar_alta_centro(uuid,uuid)'::regprocedure)
    ~ 'is\s+distinct\s+from\s+''administrador''::public\.rol_usuario'
  and pg_get_functiondef('public.retirar_alta_centro(uuid,uuid)'::regprocedure)
    ~ 'is\s+distinct\s+from\s+''administrador''::public\.rol_usuario',
  '28.G4 Las dos RPC comprueban al llamante con is distinct from (seguro con rol_actual() nulo)');
select pg_temp.assert(
  pg_get_functiondef('public.dar_alta_centro(uuid,uuid)'::regprocedure) ~* 'for\s+update'
  and pg_get_functiondef('public.retirar_alta_centro(uuid,uuid)'::regprocedure) ~* 'for\s+update',
  '28.G4b Las dos RPC bloquean la fila de perfiles con for update (dos altas simultáneas se serializan, D7)');
-- Firmas y permisos: no hay parámetro de principal; authenticated ejecuta, anon no.
select pg_temp.assert(
  pg_get_function_identity_arguments('public.dar_alta_centro(uuid,uuid)'::regprocedure)
    = 'p_perfil_id uuid, p_centro_id uuid'
  and pg_get_function_identity_arguments('public.retirar_alta_centro(uuid,uuid)'::regprocedure)
    = 'p_perfil_id uuid, p_centro_id uuid',
  '28.G5 Las RPC solo reciben perfil y centro: el principal lo decide la función');
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.dar_alta_centro(uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.retirar_alta_centro(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.dar_alta_centro(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.retirar_alta_centro(uuid,uuid)', 'execute'),
  '28.G6 authenticated ejecuta las dos RPC; anon no');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.perfiles_centros', 'delete')
  and not has_table_privilege('authenticated', 'public.perfiles_centros', 'truncate'),
  '28.G7 authenticated no tiene delete ni truncate sobre perfiles_centros');

\echo '28-altas-de-centro: completo.'
