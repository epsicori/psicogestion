-- T-034 · Batería de «toda nota cuelga de un episodio» (ADR-071) y de la coterapia (ADR-072).
-- Prueba la base, no la aplicación: la coherencia nota-episodio (disparador), las dos puertas
-- de congelación (episodio y participante), el coprofesional y episodio_para_nota().
--
-- Datos propios, con pacientes propios: no depende de los episodios que dejen otros módulos.
-- Las negativas que dependen de la coherencia se ejercen como postgres (sin sesión el
-- disparador comprueba todo); las de la función, bajo la sesión del profesional que la llamaría.

\echo ''
\echo '=== 19-nota-en-episodio ==='

\set C19    '\'c0340001-0000-4000-8000-000000000001\''
\set PROCO  '\'b0340001-0000-4000-8000-000000000001\''
\set PA19   '\'d0340001-0000-4000-8000-00000000000a\''
\set PB19   '\'d0340001-0000-4000-8000-00000000000b\''
\set PC19   '\'d0340001-0000-4000-8000-00000000000c\''
\set PD19   '\'d0340001-0000-4000-8000-00000000000d\''
\set PE19   '\'d0340001-0000-4000-8000-00000000000e\''
\set PW19   '\'d0340001-0000-4000-8000-00000000000f\''
\set PY19   '\'d0340001-0000-4000-8000-000000000010\''
\set PZ19   '\'d0340001-0000-4000-8000-000000000011\''
\set PJ19   '\'d0340001-0000-4000-8000-000000000012\''
\set EB1'\'e0340001-0000-4000-8000-00000000000b\''
\set EB2    '\'e0340001-0000-4000-8000-00000000000c\''
\set EC1    '\'e0340001-0000-4000-8000-00000000000d\''
\set ECC    '\'e0340001-0000-4000-8000-00000000000e\''
\set EJ     '\'e0340001-0000-4000-8000-00000000000f\''
\set EZ     '\'e0340001-0000-4000-8000-000000000010\''
\set CITA19 '\'a0340001-0000-4000-8000-000000000001\''
\set CITAP1 '\'a0340001-0000-4000-8000-000000000002\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------
insert into public.centros (id, nombre) values (:C19, 'Centro 19 (ajeno a PRO1)');

-- Un segundo profesional sanitario con alta en CA, para el coprofesional válido.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :PROCO, 'authenticated', 'authenticated', 'proco@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional Coterapeuta","centro_id":"' || :CA || '"}')::jsonb,
   '', '', '', '');

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:PA19, 'Alba',  'Sin episodio',    :PRO1, :CA),
  (:PB19, 'Bruno', 'Dos abiertos',    :PRO1, :CA),
  (:PC19, 'Clara', 'Uno y uno cerrado', :PRO1, :CA),
  (:PD19, 'Dario', 'De PRO2',         :PRO2, :CB),
  (:PE19, 'Elena', 'Participante',    :PRO1, :CA),
  (:PW19, 'Wanda', 'Con cita',        :PRO1, :CA),
  (:PY19, 'Yago',  'Centro ajeno',    :PRO1, :CA),
  (:PZ19, 'Zoe',   'Episodio libre',  :PRO1, :CA),
  (:PJ19, 'Juan',  'Titular conjunto', :PRO1, :CA);

insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id, abierto_en, cerrado_en) values
  (:EB1, :PB19, :PRO1, :CA, current_date, null),
  (:EB2, :PB19, :PRO1, :CA, current_date, null),
  (:EC1, :PC19, :PRO1, :CA, current_date, null),
  (:ECC, :PC19, :PRO1, :CA, current_date - 30, current_date - 1),
  (:EJ,  :PJ19, :PRO1, :CA, current_date, null),
  (:EZ,  :PZ19, :PRO1, :CA, current_date, null);
insert into public.episodio_participantes (episodio_id, paciente_id, papel) values
  (:EJ, :PJ19, 'miembro'),
  (:EJ, :PE19, 'miembro');

-- ---------------------------------------------------------------------------
-- A · La base: coherencia nota-episodio (D2, D4, D6)
-- ---------------------------------------------------------------------------
-- Gemela positiva: nota de PRO1 en un episodio de PRO1 con su paciente.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  ('f0340001-0000-4000-8000-000000000001', :PB19, :EB1, :PRO1);
select pg_temp.assert(true, '19.1 Una nota del autor en un episodio suyo del mismo paciente entra');

select pg_temp.assert_lanza_codigo(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, null, %L)', :PB19, :PRO1),
  '23502', '19.2 Una nota sin episodio muere con 23502 (NOT NULL)');

select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PD19, :EB1, :PRO2),
  '23514', 'de su autor',
  '19.3 D2: la nota de PRO2 no cuelga de un episodio de PRO1 (aunque el paciente sea suyo)');

select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA19, :EB1, :PRO1),
  '23514', 'mismo paciente',
  '19.4 D4: un paciente que no es del episodio ni participante no cuelga de él');

-- Participante (ADR-030): PE19 cuelga de EJ, que es de PJ19.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  ('f0340001-0000-4000-8000-000000000002', :PE19, :EJ, :PRO1);
select pg_temp.assert(true, '19.5 Un participante del episodio conjunto sí cuelga de él');

select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PC19, :ECC, :PRO1),
  '23514', 'cerrado',
  '19.6 D6: una nota nueva no cuelga de un episodio cerrado');

-- ---------------------------------------------------------------------------
-- B · El coprofesional (D5)
-- ---------------------------------------------------------------------------
select pg_temp.assert_lanza_codigo(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PB19, :EB1, :PRO1, :PRO1),
  '23514', '19.7 El coprofesional no puede ser el autor (check de tabla)');

select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PB19, :EB1, :PRO1, :TEC1),
  '23514', 'profesional sanitario',
  '19.8 El coprofesional no puede ser un técnico administrativo');

select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PB19, :EB1, :PRO1, :PRO2),
  '23514', 'alta en el centro',
  '19.9 El coprofesional necesita alta vigente en el centro del episodio (PRO2 solo está en el centro B)');

select pg_temp.assert_lanza_codigo(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PB19, :EB1, :PRO1, 'aaaaaaaa-0000-4000-8000-00000000dead'),
  '23503', '19.10 Un coprofesional sin perfil muere en la clave ajena (23503)');

insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id) values
  ('f0340001-0000-4000-8000-000000000003', :PB19, :EB1, :PRO1, :PROCO);
select pg_temp.assert(
  (select coprofesional_id from public.notas_clinicas where id = 'f0340001-0000-4000-8000-000000000003') = :PROCO,
  '19.11 Un profesional sanitario con alta en el centro del episodio sí es coprofesional');

-- Ninguna política lee coprofesional_id: PROCO no ve la nota.
call pg_temp.como(:PROCO);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where id = %L', 'f0340001-0000-4000-8000-000000000003')) = 0,
  '19.12 El coprofesional no gana acceso a la nota por serlo');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- C · Congelación con la primera versión y puertas del episodio y el participante
-- ---------------------------------------------------------------------------
-- Gemela: la cabecera sin firmar SÍ se puede editar.
update public.notas_clinicas set coprofesional_id = null where id = 'f0340001-0000-4000-8000-000000000003';
select pg_temp.assert(
  (select coprofesional_id from public.notas_clinicas where id = 'f0340001-0000-4000-8000-000000000003') is null,
  '19.13 Sin versión firmada, el coprofesional de la nota se puede cambiar');

-- Firmada: NCONJ tiene versiones.
select pg_temp.assert_lanza_codigo(
  format('update public.notas_clinicas set coprofesional_id = %L where id = %L', :PROCO, :NCONJ),
  '42501', '19.14 Con la primera versión, el coprofesional se congela (fn_congelar_cabecera_sellada)');
select pg_temp.assert_lanza_codigo(
  format('update public.notas_clinicas set episodio_id = %L where id = %L', :EPI2, :NCONJ),
  '42501', '19.15 Reatribuir el episodio de una nota firmada sigue dando 42501, no 23514');

-- Puerta del episodio: EB1 tiene una nota.
select pg_temp.assert_lanza_codigo(
  format('update public.episodios_asistenciales set profesional_id = %L where id = %L', :PRO2, :EB1),
  '42501', '19.16 Un episodio con notas no cambia de profesional');
select pg_temp.assert_lanza_codigo(
  format('update public.episodios_asistenciales set paciente_id = %L where id = %L', :PA19, :EB1),
  '42501', '19.17 Un episodio con notas no cambia de paciente');
update public.episodios_asistenciales set motivo_consulta = 'Motivo editado' where id = :EB1;
select pg_temp.assert(
  (select motivo_consulta from public.episodios_asistenciales where id = :EB1) = 'Motivo editado',
  '19.18 Gemela: el resto de columnas del episodio con notas sí se editan');
update public.episodios_asistenciales set paciente_id = :PA19 where id = :EZ;
select pg_temp.assert(
  (select paciente_id from public.episodios_asistenciales where id = :EZ) = :PA19,
  '19.19 Gemela: un episodio SIN notas sí puede cambiar de paciente');
update public.episodios_asistenciales set paciente_id = :PZ19 where id = :EZ;

-- Puerta del participante: PE19 tiene una nota en EJ.
select pg_temp.assert_lanza_codigo(
  format('delete from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EJ, :PE19),
  '42501', '19.20 Un participante con notas en el episodio no se borra');
select pg_temp.assert_lanza_codigo(
  format('update public.episodio_participantes set paciente_id = %L where episodio_id = %L and paciente_id = %L',
         :PA19, :EJ, :PE19),
  '42501', '19.21 Un participante con notas en el episodio no se mueve');

-- ---------------------------------------------------------------------------
-- D · episodio_para_nota(): abrir o elegir (D1), bajo la sesión de PRO1
-- ---------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 debe desbloquear la historia');

-- Sin episodio, sin centro ni cita: no hay dónde abrirlo.
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L)', :PA19),
  '22023', '19.22 Sin episodio abierto ni centro, no se abre nada (22023)');
select pg_temp.assert(
  pg_temp.contar(format('select * from public.episodios_asistenciales where paciente_id = %L', :PA19)) = 0,
  '19.23 ...y no dejó ningún episodio a medias');

-- Abre uno individual con el centro pasado.
select public.episodio_para_nota(:PA19, null, null, :CA) as epa19 \gset
select pg_temp.assert(
  (select count(*) from public.episodios_asistenciales
    where id = :'epa19' and paciente_id = :PA19 and profesional_id = :PRO1 and centro_id = :CA
      and modalidad_relacional = 'individual' and cerrado_en is null) = 1,
  '19.24 Sin episodio abierto, abre uno individual del llamante, con su paciente y el centro pasado');

-- Idempotente: la segunda llamada devuelve el mismo, no abre otro.
select public.episodio_para_nota(:PA19, null, null, :CA) as epa19b \gset
select pg_temp.assert(:'epa19b' = :'epa19'
  and pg_temp.contar(format('select * from public.episodios_asistenciales where paciente_id = %L', :PA19)) = 1,
  '19.25 Con uno abierto, lo devuelve y no abre otro');

-- Uno abierto y uno cerrado: devuelve el abierto.
select public.episodio_para_nota(:PC19) as epc19 \gset
select pg_temp.assert(:'epc19' = 'e0340001-0000-4000-8000-00000000000d',
  '19.26 Ignora el episodio cerrado al elegir el único abierto');

-- Varios abiertos: EP001.
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L)', :PB19),
  'EP001', '19.27 Con dos abiertos y sin elección, EP001 «elige episodio»');
select public.episodio_para_nota(:PB19, :EB2) as eb2 \gset
select pg_temp.assert(:'eb2' = 'e0340001-0000-4000-8000-00000000000c',
  '19.28 Con elección explícita de uno de los dos abiertos, lo devuelve');

-- Elección explícita inválida: siempre el mismo error.
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, %L)', :PC19, :ECC),
  '22023', '19.29 Elegir un episodio cerrado: 22023');
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, %L)', :PY19, :EB1),
  '42501', '19.30 Elegir un episodio de otro paciente que no lo tiene de participante: 42501');
select public.episodio_para_nota(:PE19, :EJ) as ej \gset
select pg_temp.assert(:'ej' = 'e0340001-0000-4000-8000-00000000000f',
  '19.31 Elegir el episodio conjunto donde el paciente es participante vale');
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, %L)', :PA19, 'aaaaaaaa-0000-4000-8000-00000000dead'),
  '42501', '19.32 Elegir un episodio inexistente: 42501 (no es un oráculo)');

-- Paciente que no es suyo.
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, null, null, %L)', :PD19, :CA),
  '42501', '19.33 Un paciente asignado a otro profesional: 42501');

-- Centro que no es suyo.
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, null, null, %L)', :PY19, :C19),
  '42501', '19.34 Un centro en el que el llamante no tiene alta: 42501');

-- Cita: el centro sale de la cita.
call pg_temp.reset_sesion();
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:CITA19, :PW19, :PRO1, :CA, timestamptz '2027-03-02 10:00:00+01', timestamptz '2027-03-02 10:50:00+01', 'Europe/Madrid'),
  (:CITAP1, :P1,   :PRO1, :CA, timestamptz '2027-03-02 12:00:00+01', timestamptz '2027-03-02 12:50:00+01', 'Europe/Madrid');
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, null, %L)', :PW19, :CITAP1),
  '42501', '19.35 Una cita de otro paciente no vale para abrir el episodio');
select public.episodio_para_nota(:PW19, null, :CITA19) as epw19 \gset
select pg_temp.assert(
  (select centro_id from public.episodios_asistenciales where id = :'epw19') = :CA,
  '19.36 Con cita, el centro del episodio nuevo es el de la cita');

-- El técnico no abre ni elige episodios.
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L, null, null, %L)', :PZ19, :CA),
  '42501', '19.37 El técnico administrativo no abre ni elige episodios clínicos');
call pg_temp.reset_sesion();

-- Sin sesión.
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L)', :PZ19),
  '42501', '19.38 Sin sesión no hay episodio');

-- Historia bloqueada.
call pg_temp.como(:PRO1);
select public.bloquear_historia();
select pg_temp.assert_lanza_codigo(
  format('select public.episodio_para_nota(%L)', :PZ19),
  '42501', '19.39 Con la historia bloqueada no se abre ni se elige episodio');
call pg_temp.reset_sesion();

-- El permiso de ejecución: anon no la llama.
select pg_temp.assert(
  not has_function_privilege('anon', 'public.episodio_para_nota(uuid, uuid, uuid, uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.episodio_para_nota(uuid, uuid, uuid, uuid)', 'execute'),
  '19.40 episodio_para_nota: execute para authenticated y no para anon');

\echo '19-nota-en-episodio: completa.'
