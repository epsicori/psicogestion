-- T-034 · Batería de «toda nota cuelga de un episodio» (ADR-071) con la enmienda del ADR-072
-- (coprofesional opcional en la nota, D5; ninguna nota nueva en un episodio cerrado, D6).
--
-- Prueba la base, no la aplicación: la coherencia nota-episodio (disparador), las dos puertas
-- de congelación (episodio y participante), episodio_para_nota(), el coprofesional y el
-- episodio cerrado. Corre el último (hereda estado de 01-17) y crea SUS PROPIOS pacientes y
-- episodios para no depender de lo que dejaron otros módulos.
--
-- Numeración = tickets/T-034/diseno.md §1.6 (19.1-19.31) y §E.3 (19.32-19.47). Por diseño la
-- 19.41 corre ANTES que la 19.40 (así la 19.40 tiene una versión que no leer).
-- Erratas del diseño aplicadas (§E.7): 19.9, 19.10 y 19.13 pasan `null, null, CA`.

\echo ''
\echo '=== 19-nota-en-episodio ==='

-- Centros nuevos: CC (PRO1 tiene alta, no principal) y CD (nadie).
\set CC       '\'c0340001-0000-4000-8000-00000000000c\''
\set CD       '\'c0340001-0000-4000-8000-00000000000d\''
-- Pacientes (PRO1, CA) salvo PC (PRO2, CB).
\set PA       '\'d0340001-0000-4000-8000-000000000001\''
\set PB       '\'d0340001-0000-4000-8000-000000000002\''
\set PS       '\'d0340001-0000-4000-8000-000000000003\''
\set PJ1      '\'d0340001-0000-4000-8000-000000000004\''
\set PJ2      '\'d0340001-0000-4000-8000-000000000005\''
\set PJ4      '\'d0340001-0000-4000-8000-000000000006\''
\set PJ5      '\'d0340001-0000-4000-8000-000000000007\''
\set PD       '\'d0340001-0000-4000-8000-000000000008\''
\set PC       '\'d0340001-0000-4000-8000-000000000009\''
\set PE       '\'d0340001-0000-4000-8000-00000000000a\''
\set PK       '\'d0340001-0000-4000-8000-00000000000b\''
-- Episodios.
\set EA0      '\'e0340001-0000-4000-8000-000000000001\''
\set EB1      '\'e0340001-0000-4000-8000-000000000002\''
\set EB2      '\'e0340001-0000-4000-8000-000000000003\''
\set ES       '\'e0340001-0000-4000-8000-000000000004\''
\set EJ       '\'e0340001-0000-4000-8000-000000000005\''
\set EJX      '\'e0340001-0000-4000-8000-000000000006\''
\set EC       '\'e0340001-0000-4000-8000-000000000007\''
\set ECO      '\'e0340001-0000-4000-8000-000000000008\''
\set ECN      '\'e0340001-0000-4000-8000-000000000009\''
\set EK0      '\'e0340001-0000-4000-8000-00000000000a\''
\set EKC      '\'e0340001-0000-4000-8000-00000000000b\''
-- Cita y notas que crean las pruebas.
\set CITA     '\'a0340001-0000-4000-8000-000000000001\''
\set NCO      '\'f0340001-0000-4000-8000-000000000001\''
\set NKC      '\'f0340001-0000-4000-8000-000000000002\''
\set NPC      '\'f0340001-0000-4000-8000-000000000003\''
\set N27      '\'f0340001-0000-4000-8000-000000000004\''
\set NOEXISTE '\'b0340001-0000-4000-8000-0000000000ff\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres, antes del primer `como`)
-- ---------------------------------------------------------------------------
insert into public.centros (id, nombre) values
  (:CC, 'Centro C (T-034)'),
  (:CD, 'Centro D (T-034, de nadie)');
insert into public.perfiles_centros (perfil_id, centro_id, principal) values
  (:PRO1, :CC, false),
  -- PRO2 con alta en CA (y NO en CC): el coprofesional válido de 19.32.
  (:PRO2, :CA, false);

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:PA,  'Alba',   'T034 A',  :PRO1, :CA),
  (:PB,  'Bruno',  'T034 B',  :PRO1, :CA),
  (:PS,  'Sara',   'T034 S',  :PRO1, :CA),
  (:PJ1, 'Juan',   'T034 J1', :PRO1, :CA),
  (:PJ2, 'Julia',  'T034 J2', :PRO1, :CA),
  (:PJ4, 'Jorge',  'T034 J4', :PRO1, :CA),
  (:PJ5, 'Jaime',  'T034 J5', :PRO1, :CA),
  (:PD,  'Diana',  'T034 D',  :PRO1, :CA),
  (:PC,  'Carla',  'T034 C',  :PRO2, :CB),
  (:PE,  'Elena',  'T034 E',  :PRO1, :CA),
  (:PK,  'Kira',   'T034 K',  :PRO1, :CA);

insert into public.episodios_asistenciales
  (id, paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en, cerrado_en) values
  (:EA0, :PA,  :PRO1, :CA, 'individual', current_date - 40, current_date - 10),
  (:EB1, :PB,  :PRO1, :CA, 'individual', current_date, null),
  (:EB2, :PB,  :PRO1, :CA, 'individual', current_date, null),
  (:ES,  :PS,  :PRO2, :CB, 'individual', current_date, null),
  (:EJ,  :PJ1, :PRO1, :CA, 'pareja',     current_date, null),
  (:EJX, :PC,  :PRO2, :CB, 'pareja',     current_date, null),
  (:EC,  :PC,  :PRO2, :CB, 'individual', current_date, null),
  (:ECO, :PK,  :PRO1, :CA, 'individual', current_date, null),
  (:ECN, :PK,  :PRO1, null, 'individual', current_date, null),
  (:EK0, :PK,  :PRO1, :CA, 'individual', current_date - 40, current_date - 10),
  (:EKC, :PK,  :PRO1, :CA, 'individual', current_date - 40, null);

insert into public.episodio_participantes (episodio_id, paciente_id, papel, alta_en, baja_en) values
  (:EJ,  :PJ1, 'miembro', current_date - 30, null),
  (:EJ,  :PJ2, 'miembro', current_date - 30, null),
  (:EJ,  :PJ5, 'miembro', current_date - 30, current_date - 1),
  (:EJX, :PC,  'miembro', current_date - 30, null),
  (:EJX, :PJ4, 'miembro', current_date - 30, null);

-- Cita de PD con PRO1 en CA, fuera de cualquier otro rango.
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:CITA, :PD, :PRO1, :CA,
   timestamptz '2030-01-07 10:00:00+01', timestamptz '2030-01-07 10:50:00+01', 'Europe/Madrid');

-- ---------------------------------------------------------------------------
-- 19.1 · Una nota sin episodio muere con 23502 (NOT NULL), incluso como postgres
-- ---------------------------------------------------------------------------
select pg_temp.assert_lanza_codigo(
  format('insert into public.notas_clinicas (paciente_id, autor_id) values (%L, %L)', :PA, :PRO1),
  '23502', '19.1 Una nota sin episodio_id no entra (NOT NULL)');

-- ---------------------------------------------------------------------------
-- episodio_para_nota(): abrir o elegir (D1) bajo la sesión de PRO1
-- ---------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia');

-- 19.2 · Sin episodio abierto propio: abre uno individual a nombre del llamante, en el centro pasado.
select public.episodio_para_nota(:PA, null, null, :CC) as va \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  :'va' <> :EA0
  and (select count(*) from public.episodios_asistenciales where paciente_id = :PA and id <> :EA0) = 1
  and (select count(*) from public.episodios_asistenciales
        where id = :'va' and paciente_id = :PA and cerrado_en is null and profesional_id = :PRO1
          and modalidad_relacional = 'individual' and centro_id = :CC
          and abierto_en = (now() at time zone public.zona_horaria_centro(:CC))::date) = 1,
  '19.2 Abre un episodio individual nuevo (no el cerrado EA0), del llamante, con el centro pasado y la fecha en su zona');
select pg_temp.assert(
  (select count(*) from public.auditoria
    where tabla = 'episodios_asistenciales' and operacion = 'INSERT'
      and registro_id::text = :'va' and actor_id = :PRO1) = 1,
  '19.2 La apertura queda auditada una vez, con el llamante como actor');

-- 19.3 · La nota del autor en ese episodio entra (gemela positiva del disparador).
call pg_temp.como(:PRO1);
insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (:PA, :'va', :PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where paciente_id = %L and episodio_id = %L', :PA, :'va')) = 1,
  '19.3 La nota (PA, vA, PRO1) entra');

-- 19.4 · Idempotente: con uno abierto, lo devuelve y no abre otro.
select public.episodio_para_nota(:PA, null, null, :CC) as va2 \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  :'va2' = :'va'
  and (select count(*) from public.episodios_asistenciales where paciente_id = :PA) = 2
  and (select count(*) from public.auditoria
        where tabla = 'episodios_asistenciales' and operacion = 'INSERT' and registro_id::text = :'va') = 1,
  '19.4 Otra llamada devuelve vA; PA sigue con 2 episodios (EA0 + vA) y la auditoría de vA en 1');

call pg_temp.como(:PRO1);

-- 19.5 · Varios abiertos y sin elección: EP001.
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L)', :PB),
  'EP001', 'elige episodio',
  '19.5 Con dos episodios abiertos y sin elección: EP001 «elige episodio»');

-- 19.6 · Elección explícita válida.
select public.episodio_para_nota(:PB, :EB2) as r6 \gset
select pg_temp.assert(:'r6' = :EB2
  and pg_temp.contar(format('select * from public.episodios_asistenciales where paciente_id = %L', :PB)) = 2,
  '19.6 Con elección explícita devuelve EB2 y no abre otro (PB sigue en 2)');

-- 19.7 · Un episodio propio de OTRO paciente no vale (gemela 19.6).
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, %L)', :PB, :'va'),
  '42501', 'no vale para esta nota',
  '19.7 Elegir un episodio propio pero de otro paciente: 42501 «no vale para esta nota»');

-- 19.8 · Episodio de PRO2 sobre un paciente de PRO1.
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, %L)', :PS, :ES),
  '42501', 'no vale para esta nota',
  '19.8 Elegir el episodio de un compañero: 42501 «no vale para esta nota»');

-- 19.9 · D2: el episodio de PRO2 no se reutiliza; se abre uno propio (§E.7: con centro CA).
select public.episodio_para_nota(:PS, null, null, :CA) as r9 \gset
select pg_temp.assert(:'r9' <> :ES
  and pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L and profesional_id = %L', :'r9', :PRO1)) = 1,
  '19.9 Sin elección, el episodio del compañero no se reutiliza: abre uno nuevo de PRO1');

-- 19.10 · D2, discriminante: PRO1 es es_profesional_del_episodio(EJX) pero EJX es de PRO2.
select public.episodio_para_nota(:PJ4, null, null, :CA) as r10 \gset
select pg_temp.assert(:'r10' <> :EJX
  and pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L and profesional_id = %L', :'r10', :PRO1)) = 1,
  '19.10 Un participante de un episodio AJENO abre uno propio, no reutiliza EJX');

-- 19.11
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, %L)', :PJ4, :EJX),
  '42501', 'no vale para esta nota',
  '19.11 Elegir EJX (de PRO2) para PJ4: 42501 «no vale para esta nota»');

-- 19.12 · Participante activo de una conjunta: devuelve la conjunta.
select public.episodio_para_nota(:PJ2) as r12 \gset
select pg_temp.assert(:'r12' = :EJ, '19.12 Un participante activo reutiliza el episodio conjunto EJ');

-- 19.13 · Participante dado de baja: no cuenta en el lookup (§E.7: con centro CA).
select public.episodio_para_nota(:PJ5, null, null, :CA) as r13 \gset
select pg_temp.assert(:'r13' <> :EJ, '19.13 Un participante dado de baja no reutiliza EJ: abre uno nuevo');

-- 19.14 · ...pero por elección explícita sí vale (estructural).
select public.episodio_para_nota(:PJ5, :EJ) as r14 \gset
select pg_temp.assert(:'r14' = :EJ, '19.14 Elegir EJ explícitamente para PJ5 vale (participante, aunque de baja)');

-- 19.15 · Cerrado.
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, %L)', :PA, :EA0),
  '22023', 'está cerrado',
  '19.15 Elegir un episodio cerrado: 22023 «está cerrado»');

-- 19.16 · Paciente que no es suyo.
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L)', :PC),
  '42501', 'No atiendes a este paciente',
  '19.16 Un paciente de otro profesional: 42501 «No atiendes a este paciente»');
call pg_temp.reset_sesion();

-- 19.17 · Gemela: el profesional de PC sí (PRO2). PC tiene dos episodios abiertos de PRO2
-- (EJX y EC), así que sin elección daría EP001; se elige EC explícitamente (ver informe).
call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')),
  'El PIN de PRO2 desbloquea la historia');
select public.episodio_para_nota(:PC, :EC) as r17 \gset
select pg_temp.assert(:'r17' = :EC, '19.17 PRO2 sí atiende a PC: elige EC');
call pg_temp.reset_sesion();

-- 19.18 · El técnico administrativo no abre ni elige (y no por la historia bloqueada).
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, null, null, %L)', :PA, :CA),
  '42501', 'técnico administrativo',
  '19.18 El técnico administrativo: 42501 «técnico administrativo», no «bloqueada»');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (segunda vez)');

-- 19.19 · La cita manda sobre el parámetro.
select public.episodio_para_nota(:PD, null, :CITA, :CC) as r19 \gset
select pg_temp.assert(
  (select centro_id from public.episodios_asistenciales where id = :'r19') = :CA,
  '19.19 Con cita, el episodio nuevo lleva el centro de la cita (CA), no el parámetro (CC)');

-- 19.20 · Un centro que no es de los suyos (gemela: 19.2 con CC).
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, null, null, %L)', :PE, :CD),
  '42501', 'no es uno de los tuyos',
  '19.20 Un centro sin alta de PRO1: 42501 «no es uno de los tuyos»');

-- 19.21
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, null, null, null)', :PE),
  '22023', 'Falta el centro',
  '19.21 Sin cita ni centro no hay dónde abrir: 22023 «Falta el centro»');

-- 19.22 · Cita de otro paciente.
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, null, %L, %L)', :PE, :CITA, :CC),
  '42501', 'La cita no es de este paciente',
  '19.22 La cita de PD no vale para PE: 42501 «La cita no es de este paciente»');

-- ---------------------------------------------------------------------------
-- D4 · Coherencia nota-episodio en la base
-- ---------------------------------------------------------------------------
-- 19.23 · Un paciente que no es del episodio ni participante (gemela 19.3).
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA, :EB1, :PRO1),
  '23514', 'no son del mismo paciente',
  '19.23 Nota de PA en el episodio de PB: 23514 «no son del mismo paciente»');

-- 19.24 · Conjunta: el participante entra, quien no lo es no.
insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (:PJ2, :EJ, :PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where paciente_id = %L and episodio_id = %L', :PJ2, :EJ)) = 1,
  '19.24 La nota de un participante (PJ2) entra en el episodio conjunto EJ');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA, :EJ, :PRO1),
  '23514', 'no son del mismo paciente',
  '19.24 Una nota de PA (no participante) en EJ: 23514 «no son del mismo paciente»');

-- 19.25 · D2 en la base: el episodio de otro profesional. Gemela: el episodio propio de 19.9.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PS, :ES, :PRO1),
  '23514', 'episodio de otro profesional',
  '19.25 Nota de PRO1 en el episodio de PRO2: 23514 «episodio de otro profesional»');
insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (:PS, :'r9', :PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where paciente_id = %L and episodio_id = %L', :PS, :'r9')) = 1,
  '19.25 Gemela: la nota de PS en el episodio propio de 19.9 entra');
call pg_temp.reset_sesion();

-- 19.26 · Lo impone la base, no la RLS: como postgres también.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA, :EB1, :PRO1),
  '23514', 'no son del mismo paciente',
  '19.26 Como postgres, la misma incoherencia se rechaza (23514)');

-- 19.27 · Por update, sobre una nota sin firmar.
call pg_temp.como(:PRO1);
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values (:N27, :PB, :EB1, :PRO1);
update public.notas_clinicas set episodio_id = :EB2 where id = :N27;
select pg_temp.assert(
  (select episodio_id from public.notas_clinicas where id = :N27) = :EB2,
  '19.27 Mover una nota sin firmar a otro episodio propio del mismo paciente pasa');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set episodio_id = %L where id = %L', :'va', :N27),
  '23514', 'no son del mismo paciente',
  '19.27 Mover la nota de PB al episodio de PA: 23514');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set paciente_id = %L where id = %L', :PA, :N27),
  '23514', 'no son del mismo paciente',
  '19.27 Cambiar el paciente de la nota a PA (el episodio es de PB): 23514');

-- 19.28 · Puerta del episodio: un episodio con notas no cambia de paciente.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set paciente_id = %L where id = %L', :PB, :'va'),
  '42501', 'tiene notas',
  '19.28 vA tiene una nota: no cambia de paciente (42501 «tiene notas»)');
update public.episodios_asistenciales set motivo_consulta = 'x' where id = :'va';
select pg_temp.assert(
  (select motivo_consulta from public.episodios_asistenciales where id = :'va') = 'x',
  '19.28 Gemela: el resto de columnas del episodio con notas sí se editan');
update public.episodios_asistenciales set paciente_id = :PB where id = :'r13';
select pg_temp.assert(
  (select paciente_id from public.episodios_asistenciales where id = :'r13') = :PB,
  '19.28 Gemela: un episodio SIN notas (el de 19.13) sí cambia de paciente');

-- 19.29 · Puerta del participante (PJ2 tiene nota por 19.24).
select pg_temp.assert(
  pg_temp.contar(format('select * from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EJ, :PJ2)) = 1,
  '19.29 Antes: PRO1 ve la fila del participante (si no, el update daría 0 filas y no probaría nada)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodio_participantes set paciente_id = %L where episodio_id = %L and paciente_id = %L', :PA, :EJ, :PJ2),
  '42501', 'El participante tiene notas',
  '19.29 Un participante con notas no se mueve (42501)');
update public.episodio_participantes set baja_en = current_date where episodio_id = :EJ and paciente_id = :PJ2;
select pg_temp.assert(
  (select baja_en from public.episodio_participantes where episodio_id = :EJ and paciente_id = :PJ2) = current_date,
  '19.29 Gemela: darlo de baja (otra columna) sí pasa');
call pg_temp.reset_sesion();

-- 19.30 · ...ni se borra, ni como postgres.
select pg_temp.assert_lanza_codigo_msg(
  format('delete from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EJ, :PJ2),
  '42501', 'El participante tiene notas',
  '19.30 Como postgres, un participante con notas no se borra (42501)');

-- 19.31 · Permisos.
select pg_temp.assert(
  not has_function_privilege('anon', 'public.episodio_para_nota(uuid,uuid,uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.episodio_para_nota(uuid,uuid,uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_exigir_episodio_coherente_en_nota()', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_congelar_episodio_con_notas()', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_congelar_participante_con_notas()', 'execute'),
  '19.31 episodio_para_nota: execute para authenticated y no para anon; las tres fn_* de disparador cerradas');

-- ---------------------------------------------------------------------------
-- ADR-072 · D5 · El coprofesional
-- ---------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (tercera vez)');

-- 19.32 · Positiva: un profesional sanitario distinto del autor con alta en el centro del episodio.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id)
  values (:NCO, :PK, :ECO, :PRO1, :PRO2);
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select coprofesional_id from public.notas_clinicas where id = :NCO) = :PRO2,
  '19.32 La nota (NCO, PK, ECO, PRO1) con coprofesional PRO2 entra y lo guarda');
call pg_temp.como(:PRO1);

-- 19.33 · El check: el coprofesional no es el autor.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PK, :ECO, :PRO1, :PRO1),
  '23514', 'notas_clinicas_coprofesional_no_es_autor',
  '19.33 Coprofesional = autor: 23514 por el check notas_clinicas_coprofesional_no_es_autor');

-- 19.34 · Sin perfil: lo dice la clave ajena, no el disparador.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PK, :ECO, :PRO1, :NOEXISTE),
  '23503', 'notas_clinicas_coprofesional_id_fkey',
  '19.34 Coprofesional sin perfil: 23503 por la clave ajena notas_clinicas_coprofesional_id_fkey');

-- 19.35 · TEC1 sí tiene alta en CA: aísla el rol.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PK, :ECO, :PRO1, :TEC1),
  '23514', 'tiene que ser un profesional sanitario',
  '19.35 Un técnico administrativo (con alta en CA) no es coprofesional: 23514');

-- 19.36 · Discriminante: vA está en CC; PA y PRO1 tienen CA; PRO2 tiene CA y no CC.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PA, :'va', :PRO1, :PRO2),
  '23514', 'no tiene alta en el centro del episodio',
  '19.36 Mira el centro del EPISODIO (CC), no el del paciente ni el del autor: 23514');

-- 19.37 · Episodio sin centro: ningún coprofesional; sin coprofesional pasa.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PK, :ECN, :PRO1, :PRO2),
  '23514', 'no tiene alta en el centro del episodio',
  '19.37 Episodio sin centro con coprofesional: 23514');
insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (:PK, :ECN, :PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where paciente_id = %L and episodio_id = %L', :PK, :ECN)) = 1,
  '19.37 Gemela: el mismo episodio sin coprofesional pasa');
call pg_temp.reset_sesion();

-- 19.38 · Lo impone la base: sin sesión.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PA, :'va', :PRO1, :PRO2),
  '23514', 'no tiene alta en el centro del episodio',
  '19.38 Como postgres, sin sesión, la misma comprobación del centro del episodio');

-- 19.39 · Por update, sobre NCO sin firmar.
call pg_temp.como(:PRO1);
update public.notas_clinicas set coprofesional_id = null where id = :NCO;
select pg_temp.assert((select coprofesional_id from public.notas_clinicas where id = :NCO) is null,
  '19.39 Sin firmar, el coprofesional se puede quitar');
update public.notas_clinicas set coprofesional_id = :PRO2 where id = :NCO;
select pg_temp.assert((select coprofesional_id from public.notas_clinicas where id = :NCO) = :PRO2,
  '19.39 ...y volver a poner');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set coprofesional_id = %L where id = %L', :TEC1, :NCO),
  '23514', 'profesional sanitario',
  '19.39 ...pero no un técnico administrativo (23514)');
call pg_temp.reset_sesion();

-- 19.41 · (Corre antes que la 19.40.) Con la primera versión, el coprofesional se congela.
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:NCO, '{"t":"coterapia"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:00+00', '{"t":"coterapia"}'::jsonb,
                         p_alcance => 'individual'),
   'individual', :PRO1, timestamptz '2026-08-29 09:30:00+00');
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set coprofesional_id = null where id = %L', :NCO),
  '42501', 'no se puede reatribuir',
  '19.41 Con versión, quitar el coprofesional: 42501 «no se puede reatribuir» (gemela: 19.39, antes de la versión)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set fecha_sesion = fecha_sesion - 1 where id = %L', :NCO),
  '42501', 'no se puede reatribuir',
  '19.41 Paridad con un campo ya congelado (fecha_sesion): el mismo 42501');
call pg_temp.reset_sesion();

-- 19.40 · El coprofesional no lee: ninguna política mira coprofesional_id.
call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')),
  'El PIN de PRO2 desbloquea la historia (19.40)');
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values (:NPC, :PC, :EC, :PRO2);
select pg_temp.assert(public.historia_desbloqueada(), '19.40 La historia de PRO2 está desbloqueada (el 0 de abajo no es el candado)');
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NPC)) = 1,
  '19.40 Gemela: PRO2 ve su propia nota NPC (la consulta y el candado funcionan)');
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NCO)) = 0,
  '19.40 PRO2, coprofesional de NCO, no ve la nota');
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas_versiones where nota_id = %L', :NCO)) = 0,
  '19.40 ...ni sus versiones');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- ADR-072 · D6 · Episodio cerrado
-- ---------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (cuarta vez)');

-- 19.42 · Gemela: 19.32 (ECO, abierto).
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PK, :EK0, :PRO1),
  '23514', 'episodio cerrado',
  '19.42 Nota nueva en un episodio cerrado: 23514 «episodio cerrado»');
call pg_temp.reset_sesion();

-- 19.43 · La base, sin RLS.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PK, :EK0, :PRO1),
  '23514', 'episodio cerrado',
  '19.43 Como postgres también: 23514 «episodio cerrado»');
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values (:NKC, :PK, :EKC, :PRO1);
select pg_temp.assert((select count(*) from public.notas_clinicas where id = :NKC) = 1,
  '19.43 Gemela: en EKC (abierto) la nota entra');

-- 19.44 · Por update: mover a un cerrado falla; a un abierto pasa.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set episodio_id = %L where id = %L', :EK0, :NKC),
  '23514', 'episodio cerrado',
  '19.44 Mover NKC a un episodio cerrado: 23514');
update public.notas_clinicas set episodio_id = :ECO where id = :NKC;
select pg_temp.assert((select episodio_id from public.notas_clinicas where id = :NKC) = :ECO,
  '19.44 Mover NKC a ECO (abierto) pasa');
update public.notas_clinicas set episodio_id = :EKC where id = :NKC;
select pg_temp.assert((select episodio_id from public.notas_clinicas where id = :NKC) = :EKC,
  '19.44 ...y de vuelta a EKC pasa');
call pg_temp.reset_sesion();

-- 19.45 · Una nota existente cuyo episodio se cierra después se puede editar sin moverla.
update public.episodios_asistenciales set cerrado_en = current_date where id = :EKC;
call pg_temp.como(:PRO1);
update public.notas_clinicas set coprofesional_id = :PRO2 where id = :NKC;
select pg_temp.assert((select coprofesional_id from public.notas_clinicas where id = :NKC) = :PRO2,
  '19.45 En un episodio cerrado después, la nota existente admite cambiar de coprofesional (no se mueve)');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PK, :EKC, :PRO1),
  '23514', 'episodio cerrado',
  '19.45 ...pero una nota NUEVA en EKC ya cerrado: 23514');
call pg_temp.reset_sesion();

-- 19.46 · Orden de disparadores y congelación del coprofesional.
select pg_temp.assert(
  (select array_position(a, 'congelar_cabecera_sellada') < array_position(a, 'exigir_episodio_coherente_en_nota')
      and array_position(a, 'exigir_episodio_coherente_en_nota') < array_position(a, 'tocar_borrador')
     from (select array_agg(tgname::text order by tgname) as a
             from pg_trigger
            where tgrelid = 'public.notas_clinicas'::regclass and not tgisinternal) t),
  '19.46 Orden alfabético: congelar_cabecera_sellada < exigir_episodio_coherente_en_nota < tocar_borrador');
select pg_temp.assert(
  (select pg_get_triggerdef(oid) from pg_trigger
    where tgrelid = 'public.notas_clinicas'::regclass and tgname = 'congelar_cabecera_sellada') like '%coprofesional_id%',
  '19.46 congelar_cabecera_sellada vigila coprofesional_id');

-- 19.47 · Ninguna política lo lee; nulable.
select pg_temp.assert(
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ilike '%coprofesional%' or coalesce(with_check, '') ilike '%coprofesional%')) = 0,
  '19.47 Ninguna política RLS lee coprofesional_id');
select pg_temp.assert(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'notas_clinicas' and column_name = 'coprofesional_id') = 'YES',
  '19.47 coprofesional_id es nulable');

\echo '19-nota-en-episodio: completa (19.1-19.47).'
