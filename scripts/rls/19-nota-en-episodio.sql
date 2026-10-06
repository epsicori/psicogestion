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

-- T-049 · Año propio del 19: Y+8, primer lunes de enero (README, punto 10).
select (extract(year from now())::int + 8) as anio_19 \gset
select (make_date(:anio_19, 1, 1) + ((8 - extract(isodow from make_date(:anio_19, 1, 1))::int) % 7))::text as lunes_19 \gset

-- Cita de PD con PRO1 en CA, fuera de cualquier otro rango.
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:CITA, :PD, :PRO1, :CA,
   (:'lunes_19'::date + time '10:00') at time zone 'Europe/Madrid', (:'lunes_19'::date + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid');

-- ---------------------------------------------------------------------------
-- 19.1 · Una nota sin episodio muere con 23502 (NOT NULL), incluso como postgres
-- ---------------------------------------------------------------------------
select pg_temp.assert_lanza_codigo(
  format('insert into public.notas_clinicas (paciente_id, autor_id) values (%L, %L)', :PA, :PRO1),
  '23502', '19.1 Una nota sin episodio_id no entra (NOT NULL)');

-- ---------------------------------------------------------------------------
-- episodio_para_nota(): abrir o elegir (D1) bajo la sesión de PRO1
-- ---------------------------------------------------------------------------
-- El módulo 13 dejó a PRO1 con el PIN 424242 y a PRO2 con 999999: este banco fija los suyos.
call pg_temp.como_con_2fa(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:PRO2); select public.fijar_pin_historia('222222'); call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
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
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('222222')),
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
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
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
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
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
   pg_temp.sobre_prueba(:NCO, :PRO1, timestamptz '2026-08-29 09:30:00+00', '{"t":"coterapia"}'::jsonb,
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
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('222222')),
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
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
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

-- ===========================================================================
-- Ronda de correcciones tras las revisiones (tickets/T-034/revision-sql.md y
-- revision-banco.md). Numeración a continuación de la 19.47, sin renumerar.
-- ===========================================================================
\set ESC      '\'e0340001-0000-4000-8000-00000000000c\''
\set CKI      '\'c0340001-0000-4000-8000-0000000000e1\''
\set CPP      '\'c0340001-0000-4000-8000-0000000000e2\''
\set PZ1      '\'d0340001-0000-4000-8000-0000000000e1\''
\set PZ2      '\'d0340001-0000-4000-8000-0000000000e2\''
\set PADM     '\'d0340001-0000-4000-8000-0000000000e3\''
\set CITA2    '\'a0340001-0000-4000-8000-000000000002\''
\set NCOB     '\'f0340001-0000-4000-8000-000000000005\''

-- Fijación de la ronda (como postgres).
-- ESC: episodio CERRADO de PRO2 sobre PS (paciente de PRO1): el caso de H1 del banco.
insert into public.episodios_asistenciales
  (id, paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en, cerrado_en) values
  (:ESC, :PS, :PRO2, :CB, 'individual', current_date - 40, current_date - 10);
-- Dos centros en zonas que, juntas, nunca coinciden a la vez con la fecha UTC (H5 del banco):
-- Kiritimati (UTC+14) cambia de día a las 10:00 UTC; Pago Pago (UTC-11), a las 11:00 UTC.
insert into public.centros (id, nombre, zona_horaria) values
  (:CKI, 'Centro Kiritimati (T-034)', 'Pacific/Kiritimati'),
  (:CPP, 'Centro Pago Pago (T-034)',  'Pacific/Pago_Pago');
insert into public.perfiles_centros (perfil_id, centro_id, principal) values
  (:PRO1, :CKI, false),
  (:PRO1, :CPP, false);
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:PZ1,  'Zoe',   'T034 Z1',  :PRO1, :CA),
  (:PZ2,  'Zacarías', 'T034 Z2', :PRO1, :CA),
  -- PADM: paciente del ADMINISTRADOR (es_profesional_asignado es rol-agnóstica).
  (:PADM, 'Adela', 'T034 ADM', :ADM,  :CA);
-- CITA2: cita de PADM con PRO2 en CB. El administrador la LEE (citas_lectura), pero no es suya.
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:CITA2, :PADM, :PRO2, :CB,
   ((:'lunes_19'::date + 7) + time '10:00') at time zone 'Europe/Madrid', ((:'lunes_19'::date + 7) + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid');

-- ---------------------------------------------------------------------------
-- 19.48 · (revision-sql H1) El disparador lee el episodio (paso 3) y el participante
-- (paso 5) con `for share`: una puerta concurrente (update del episodio, cierre, update o
-- delete del participante) espera a que la nota confirme, y entonces su `exists` la ve.
-- El banco corre en una sola sesión: lo fija el texto de la función.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  pg_get_functiondef('public.fn_exigir_episodio_coherente_en_nota()'::regprocedure)
    ~* 'from\s+public\.episodios_asistenciales\s+ea\s+where\s+ea\.id\s*=\s*new\.episodio_id\s+for\s+share',
  '19.48 El paso 3 lee el episodio con for share');
select pg_temp.assert(
  pg_get_functiondef('public.fn_exigir_episodio_coherente_en_nota()'::regprocedure)
    ~* 'from\s+public\.episodio_participantes\s+ep\s+where[^;]*for\s+share',
  '19.48 El paso 5 bloquea la fila del participante con for share');

-- ---------------------------------------------------------------------------
-- 19.49 · (revision-sql H5, revision-banco H2) Salida anti-oráculo del paso 2: una sesión
-- que escribe como OTRO autor la rechaza la RLS (42501), no el disparador. Cada fila está
-- construida para que el disparador, si corriera, diera un 23514 que revelaría algo ajeno.
-- ---------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (ronda)');
-- Sin el paso 2: autor PRO2 = dueño de ES pasa el paso 4, y PA no es de ES → 23514
-- «no son del mismo paciente» (revela de qué paciente es ES).
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA, :ES, :PRO2),
  '42501', 'row-level security',
  '19.49 PRO1 escribiendo como PRO2 en ES con otro paciente: 42501 de la RLS, no 23514');
-- Sin el paso 2: PS es de ES, y el coprofesional TEC1 → 23514 «profesional sanitario»
-- (revela el rol de un perfil).
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PS, :ES, :PRO2, :TEC1),
  '42501', 'row-level security',
  '19.49 PRO1 escribiendo como PRO2 en ES con coprofesional TEC1: 42501 de la RLS, no 23514');
-- Sin el paso 2: ESC es de PRO2 y de PS, y está cerrado → 23514 «episodio cerrado».
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PS, :ESC, :PRO2),
  '42501', 'row-level security',
  '19.49 PRO1 escribiendo como PRO2 en el cerrado ESC: 42501 de la RLS, no «episodio cerrado»');

-- ---------------------------------------------------------------------------
-- 19.50 · (revision-banco H1) Orden de guardas del disparador frente a un episodio AJENO:
-- el autor (paso 4) habla antes que el paciente (paso 5) y que el cerrado (paso 6). Si no,
-- PRO1 averigua de qué paciente es el episodio de un compañero, o si está cerrado.
-- ---------------------------------------------------------------------------
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA, :ES, :PRO1),
  '23514', 'episodio de otro profesional',
  '19.50 Episodio abierto de PRO2 con OTRO paciente (PA): «episodio de otro profesional», no «no son del mismo paciente»');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PS, :ESC, :PRO1),
  '23514', 'episodio de otro profesional',
  '19.50 Episodio CERRADO de PRO2 con su paciente (PS): «episodio de otro profesional», no «episodio cerrado»');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L)', :PA, :ESC, :PRO1),
  '23514', 'episodio de otro profesional',
  '19.50 Episodio CERRADO de PRO2 con otro paciente (PA): «episodio de otro profesional»');

-- ---------------------------------------------------------------------------
-- 19.51 · (revision-banco H1) Orden de guardas de episodio_para_nota(): la propiedad antes
-- que el cerrado. Gemela: la 19.15 (EA0, cerrado PROPIO) da 22023 «está cerrado».
-- ---------------------------------------------------------------------------
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, %L)', :PS, :ESC),
  '42501', 'no vale para esta nota',
  '19.51 Elegir el episodio CERRADO de un compañero: 42501 «no vale», no 22023 «está cerrado»');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- 19.52 · (revision-banco H3) La otra columna de cada puerta congelada, como postgres.
-- ---------------------------------------------------------------------------
-- Episodio con notas (vA, nota de 19.3): tampoco cambia de PROFESIONAL.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set profesional_id = %L where id = %L', :PRO2, :'va'),
  '42501', 'tiene notas',
  '19.52 vA tiene nota: no cambia de profesional (42501 «tiene notas»)');
-- Gemela: el episodio de 19.10 (sin notas) sí cambia de profesional.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where episodio_id = %L', :'r10')) = 0,
  '19.52 Antes: el episodio de 19.10 no tiene notas');
update public.episodios_asistenciales set profesional_id = :PRO2 where id = :'r10';
select pg_temp.assert(
  (select profesional_id from public.episodios_asistenciales where id = :'r10') = :PRO2,
  '19.52 Gemela: un episodio SIN notas sí cambia de profesional');
-- Participante con notas (PJ2 en EJ, 19.24): tampoco se mueve de EPISODIO.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodio_participantes set episodio_id = %L where episodio_id = %L and paciente_id = %L', :EB1, :EJ, :PJ2),
  '42501', 'El participante tiene notas',
  '19.52 Un participante con notas no se mueve a otro episodio (42501)');
-- Gemela: un participante SIN notas (PJ5 en EJ) sí se mueve de episodio.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where episodio_id = %L and paciente_id = %L', :EJ, :PJ5)) = 0,
  '19.52 Antes: PJ5 no tiene notas en EJ');
update public.episodio_participantes set episodio_id = :EB1 where episodio_id = :EJ and paciente_id = :PJ5;
select pg_temp.assert(
  pg_temp.contar(format('select * from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EB1, :PJ5)) = 1,
  '19.52 Gemela: un participante sin notas sí se mueve de episodio');

-- ---------------------------------------------------------------------------
-- 19.53 · (revision-banco H5) abierto_en es la fecha en la zona del centro, no current_date.
-- Kiritimati y Pago Pago no coinciden a la vez con la fecha de la sesión en ninguna hora:
-- con `current_date` en la función, al menos una de las dos aserciones cae siempre.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (now() at time zone 'Pacific/Kiritimati')::date <> current_date
  or (now() at time zone 'Pacific/Pago_Pago')::date <> current_date,
  '19.53 Control: al menos una de las dos zonas está hoy en otra fecha que la sesión (la prueba discrimina)');
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (19.53)');
select public.episodio_para_nota(:PZ1, null, null, :CKI) as vz1 \gset
select public.episodio_para_nota(:PZ2, null, null, :CPP) as vz2 \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select abierto_en from public.episodios_asistenciales where id = :'vz1' and centro_id = :CKI)
    = (now() at time zone 'Pacific/Kiritimati')::date,
  '19.53 Episodio en Kiritimati: abierto_en = la fecha de Kiritimati');
select pg_temp.assert(
  (select abierto_en from public.episodios_asistenciales where id = :'vz2' and centro_id = :CPP)
    = (now() at time zone 'Pacific/Pago_Pago')::date,
  '19.53 Episodio en Pago Pago: abierto_en = la fecha de Pago Pago');

-- ---------------------------------------------------------------------------
-- 19.54 · (revision-banco H6) La cita tiene que ser DEL LLAMANTE, no solo del paciente.
-- El administrador lee todas las citas y es asignado de PADM: sin el filtro
-- `c.profesional_id = v_uid` abriría un episodio en CB (el centro de la cita de PRO2) sin
-- pasar por centros_actuales().
-- ---------------------------------------------------------------------------
call pg_temp.como_con_2fa(:ADM); select public.fijar_pin_historia('333333'); call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('333333')),
  'El PIN de ADM desbloquea la historia (19.54)');
select pg_temp.assert(public.es_profesional_asignado(:PADM),
  '19.54 Control: ADM es el profesional asignado de PADM');
select pg_temp.assert(pg_temp.contar(format('select * from public.citas where id = %L', :CITA2)) = 1,
  '19.54 Control: ADM LEE la cita de PRO2 (el rechazo de abajo no es la RLS de citas)');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, null, %L, null)', :PADM, :CITA2),
  '42501', 'La cita no es de este paciente con este profesional',
  '19.54 La cita de PADM con PRO2 no vale para ADM: 42501, no un episodio en CB');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.episodios_asistenciales where paciente_id = :PADM) = 0,
  '19.54 ...y no se abrió ningún episodio para PADM');

-- ---------------------------------------------------------------------------
-- 19.55 · (revision-banco H4) El coprofesional necesita alta VIGENTE (hasta is null) en el
-- centro del episodio; y una edición que no toca ni el coprofesional ni el episodio no lo
-- revalida. Va la última: cierra el alta de PRO2 en CA.
-- ---------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (19.55)');
-- Con el alta abierta, la nota de PJ1 en EJ (CA) con coprofesional PRO2 entra.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id)
  values (:NCOB, :PJ1, :EJ, :PRO1, :PRO2);
call pg_temp.reset_sesion();
update public.perfiles_centros set hasta = current_date
 where perfil_id = :PRO2 and centro_id = :CA and hasta is null;
select pg_temp.assert(
  (select count(*) from public.perfiles_centros
    where perfil_id = :PRO2 and centro_id = :CA and hasta is not null) = 1
  and (select count(*) from public.perfiles_centros
        where perfil_id = :PRO2 and centro_id = :CA and hasta is null) = 0,
  '19.55 Control: PRO2 tiene fila en CA, pero cerrada (no es «sin fila», como en 19.36-19.38)');
call pg_temp.como(:PRO1);
-- Gemela: la 19.32, la misma fila con el alta abierta.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :PK, :ECO, :PRO1, :PRO2),
  '23514', 'no tiene alta en el centro del episodio',
  '19.55 Coprofesional con el alta en CA cerrada: 23514 «no tiene alta en el centro del episodio»');
-- Paso 7 solo si cambia el coprofesional o el episodio: cambiar el paciente a otro
-- participante de EJ no revalida el alta perdida después.
update public.notas_clinicas set paciente_id = :PJ2 where id = :NCOB;
select pg_temp.assert(
  (select paciente_id from public.notas_clinicas where id = :NCOB) = :PJ2
  and (select coprofesional_id from public.notas_clinicas where id = :NCOB) = :PRO2,
  '19.55 Cambiar el paciente (a otro participante) de una nota cuyo coprofesional perdió el alta pasa');
-- ...pero quitarlo y volver a ponerlo sí lo revalida.
update public.notas_clinicas set coprofesional_id = null where id = :NCOB;
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set coprofesional_id = %L where id = %L', :PRO2, :NCOB),
  '23514', 'no tiene alta en el centro del episodio',
  '19.55 Volver a poner a PRO2 (alta cerrada) como coprofesional: 23514');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- T-035 · ADR-073: el centro del episodio se congela con notas (19.60-19.61b) y el director
-- sanitario puede ser coprofesional (19.56-19.59, 19.57b-c, 19.62-19.63). Fijación propia:
-- centros, altas, pacientes y PIN de ADM; no se supone nada de la 19.54 ni de la 19.55.
-- ---------------------------------------------------------------------------
\set C35E '\'c0350001-0000-4000-8000-00000000000e\''
\set C35F '\'c0350001-0000-4000-8000-00000000000f\''
\set P35A '\'d0350001-0000-4000-8000-000000000001\''
\set P35B '\'d0350001-0000-4000-8000-000000000002\''
\set P35C '\'d0350001-0000-4000-8000-000000000003\''
\set P35D '\'d0350001-0000-4000-8000-000000000004\''
\set N35A '\'f0350001-0000-4000-8000-000000000001\''
\set N35B '\'f0350001-0000-4000-8000-000000000002\''

insert into public.centros (id, nombre) values
  (:C35E, 'Centro E (T-035)'),
  (:C35F, 'Centro F (T-035)');
insert into public.perfiles_centros (perfil_id, centro_id, principal) values
  (:PRO1,    :C35E, false),
  (:ADM,     :C35E, false),
  (:TEC1,    :C35E, false),
  (:PROBAJA, :C35E, false),
  (:PRO1,    :C35F, false);
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P35A, 'Ana',   'T035 A', :PRO1, :C35E),
  (:P35B, 'Berta', 'T035 B', :ADM,  :C35E),
  (:P35C, 'Clara', 'T035 C', :PRO1, :C35F),
  (:P35D, 'Dora',  'T035 D', :PRO1, :C35E);
-- PROBAJA ya está de baja si corrió el módulo 04; se asegura aquí (mismo update que el 04).
update public.perfiles set estado = 'baja', estado_desde = now()
 where id = :PROBAJA and estado <> 'baja';

-- Controles: se fijan, no se suponen.
select pg_temp.assert(
  (select count(*) from public.perfiles_centros where perfil_id = :ADM and centro_id = :C35E and hasta is null) = 1
  and (select count(*) from public.perfiles_centros where perfil_id = :TEC1 and centro_id = :C35E and hasta is null) = 1
  and (select count(*) from public.perfiles_centros where perfil_id = :PROBAJA and centro_id = :C35E and hasta is null) = 1,
  '19.56 Control: ADM, TEC1 y PROBAJA tienen alta vigente en C35E');
select pg_temp.assert(
  (select count(*) from public.perfiles_centros where perfil_id = :ADM and centro_id = :C35F and hasta is null) = 0,
  '19.56 Control: ADM no tiene alta en C35F');
select pg_temp.assert(
  (select rol::text from public.perfiles where id = :ADM) = 'administrador'
  and (select rol::text from public.perfiles where id = :TEC1) = 'tecnico_administrativo'
  and (select rol::text from public.perfiles where id = :PROBAJA) = 'profesional_sanitario'
  and (select estado::text from public.perfiles where id = :PROBAJA) = 'baja'
  and (select estado::text from public.perfiles where id = :ADM) = 'activo',
  '19.56 Control: roles de ADM, TEC1 y PROBAJA, y PROBAJA de baja');

call pg_temp.como_con_2fa(:ADM); select public.fijar_pin_historia('333333'); call pg_temp.reset_sesion();

-- Episodios por el camino de la aplicación (episodio_para_nota).
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'El PIN de PRO1 desbloquea la historia (T-035)');
select public.episodio_para_nota(:P35A, null, null, :C35E) as e35a \gset
select public.episodio_para_nota(:P35C, null, null, :C35F) as e35c \gset
select public.episodio_para_nota(:P35D, null, null, :C35E) as e35d \gset
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('333333')),
  'El PIN de ADM desbloquea la historia (T-035)');
select public.episodio_para_nota(:P35B, null, null, :C35E) as e35b \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select centro_id from public.episodios_asistenciales where id = :'e35a') = :C35E
  and (select centro_id from public.episodios_asistenciales where id = :'e35b') = :C35E
  and (select centro_id from public.episodios_asistenciales where id = :'e35c') = :C35F
  and (select centro_id from public.episodios_asistenciales where id = :'e35d') = :C35E,
  '19.56 Control: los cuatro episodios tienen el centro pedido');

-- 19.56 · Coterapia (criterio 3a): PRO1 autor, ADM coprofesional, los dos con alta en C35E.
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L, %L)',
         :N35A, :P35A, :'e35a', :PRO1, :ADM),
  '19.56 La nota de PRO1 con ADM (administrador, alta en C35E) como coprofesional entra');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select coprofesional_id from public.notas_clinicas where id = :N35A) = :ADM,
  '19.56 ...y la cabecera guarda a ADM como coprofesional');

-- 19.57 · Coterapia simétrica (criterio 3b): ADM autor, PRO1 coprofesional; por insert y por update.
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L, %L)',
         :N35B, :P35B, :'e35b', :ADM, :PRO1),
  '19.57 La nota de ADM con PRO1 como coprofesional entra');
update public.notas_clinicas set coprofesional_id = null where id = :N35B;
select pg_temp.assert_no_lanza(
  format('update public.notas_clinicas set coprofesional_id = %L where id = %L', :PRO1, :N35B),
  '19.57 ...y quitarlo y volver a ponerlo (el camino de fijarCoprofesional) pasa');
-- 19.57b · Con un administrador como AUTOR, el rol del coprofesional también se valida.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set coprofesional_id = %L where id = %L', :TEC1, :N35B),
  '23514', 'quien puede ser autor de notas',
  '19.57b ADM autor, TEC1 (alta en C35E) coprofesional: 23514 por el rol (gemela: 19.57)');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select autor_id from public.notas_clinicas where id = :N35B) = :ADM
  and (select coprofesional_id from public.notas_clinicas where id = :N35B) = :PRO1,
  '19.57 Control: la nota de ADM queda con autor ADM y coprofesional PRO1');

-- 19.57c · El coprofesional tiene que estar activo (decisión del propietario, 02-10-2026).
--          PROBAJA es profesional sanitario con alta vigente en C35E: solo falla el estado.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P35A, :'e35a', :PRO1, :PROBAJA),
  '23514', 'está de baja',
  '19.57c Coprofesional de baja (profesional sanitario con alta vigente en C35E): 23514 (gemela: 19.56, activo)');

-- 19.58 · El técnico (con alta en C35E, mismo episodio que 19.56) sigue fuera: solo cambia el rol.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P35A, :'e35a', :PRO1, :TEC1),
  '23514', 'quien puede ser autor de notas',
  '19.58 Coprofesional técnico administrativo con alta en C35E: 23514 por el rol (gemela: 19.56)');

-- 19.59 · ADM sin alta en el centro del episodio (C35F) sigue fuera: pasa el rol, falla 7c.
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, coprofesional_id) values (%L, %L, %L, %L)',
         :P35C, :'e35c', :PRO1, :ADM),
  '23514', 'no tiene alta en el centro del episodio',
  '19.59 Coprofesional administrador sin alta en C35F: 23514 por el centro (gemela: 19.56, ADM en C35E)');

-- 19.60a · Control: la RLS deja a PRO1 escribir la fila; después, el centro no cambia con notas.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :'e35a')) = 1,
  '19.60a Control: PRO1 ve el episodio e35a');
update public.episodios_asistenciales set motivo_consulta = 't035' where id = :'e35a';
select pg_temp.assert(
  (select motivo_consulta from public.episodios_asistenciales where id = :'e35a') = 't035',
  '19.60a Control: la RLS deja a PRO1 actualizar la fila (el 42501 de abajo es del disparador)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set centro_id = %L where id = %L', :C35F, :'e35a'),
  '42501', 'y su centro no cambian',
  '19.60a Un episodio con notas no cambia de centro (valor a otro valor)');
-- 19.60b · Valor a nulo.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set centro_id = null where id = %L', :'e35a'),
  '42501', 'y su centro no cambian',
  '19.60b Un episodio con notas no pierde su centro (valor a nulo)');

-- 19.61 · Gemela: el episodio sin notas sí cambia de centro (PRO1 tiene alta en C35F).
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where episodio_id = %L', :'e35d')) = 0,
  '19.61 Antes: el episodio e35d no tiene notas');
update public.episodios_asistenciales set centro_id = :C35F where id = :'e35d';
-- 19.61b · No-op sobre el episodio con notas: el centro no cambia, el resto sí se edita.
update public.episodios_asistenciales set centro_id = centro_id, motivo_consulta = 't035b' where id = :'e35a';
select pg_temp.assert(
  (select motivo_consulta from public.episodios_asistenciales where id = :'e35a') = 't035b',
  '19.61b Reescribir el mismo centro en un episodio con notas pasa (no es un cambio)');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select centro_id from public.episodios_asistenciales where id = :'e35d') = :C35F,
  '19.61 Gemela: un episodio SIN notas sí cambia de centro');

-- 19.60c · Como postgres (criterio 4: «también como postgres»), episodio de ADM con nota.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set centro_id = %L where id = %L', :C35F, :'e35b'),
  '42501', 'y su centro no cambian',
  '19.60c Como postgres, un episodio con notas tampoco cambia de centro');
-- 19.60d · Nulo a valor: ECN no tiene centro y tiene nota desde la 19.37.
select pg_temp.assert(
  (select centro_id from public.episodios_asistenciales where id = :ECN) is null
  and pg_temp.contar(format('select * from public.notas_clinicas where episodio_id = %L', :ECN)) > 0,
  '19.60d Control: ECN no tiene centro y tiene notas');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set centro_id = %L where id = %L', :CA, :ECN),
  '42501', 'y su centro no cambian',
  '19.60d Un episodio con notas y sin centro tampoco lo recibe (nulo a valor)');

-- 19.62 · La lista de roles del coprofesional es CERRADA (catálogo): ningún mutante de
--         comportamiento distingue «lista cerrada» de «todo salvo el técnico» con tres roles.
select pg_temp.assert(
  pg_get_functiondef('public.fn_exigir_episodio_coherente_en_nota()'::regprocedure)
    ~* 'v_rol\s+not\s+in\s*\(\s*''profesional_sanitario''::public\.rol_usuario\s*,\s*''administrador''::public\.rol_usuario\s*\)',
  '19.62 (i) 7b es una lista cerrada: v_rol not in (profesional_sanitario, administrador)');
select pg_temp.assert(
  pg_get_functiondef('public.fn_exigir_episodio_coherente_en_nota()'::regprocedure)
    !~* 'tecnico_administrativo',
  '19.62 (ii) 7b no nombra al técnico: no es una lista negativa');
select pg_temp.assert(
  pg_get_functiondef('public.fn_exigir_episodio_coherente_en_nota()'::regprocedure)
    ~* 'from\s+public\.episodios_asistenciales\s+ea\s+where\s+ea\.id\s*=\s*new\.episodio_id\s+for\s+share',
  '19.62 (iii) La re-emisión conserva el for share del paso 3 (19.48)');

-- 19.63 · Alarma: un rol nuevo (ADR-065) obliga a decidir si puede ser autor de notas.
select pg_temp.assert(
  enum_range(null::public.rol_usuario)::text[] = array['administrador','profesional_sanitario','tecnico_administrativo'],
  '19.63 ALARMA: hay un rol nuevo (ADR-065). Decide si puede ser autor de notas y revisa el paso 7b de fn_exigir_episodio_coherente_en_nota');

call pg_temp.reset_sesion();

\echo '19-nota-en-episodio: completa (19.1-19.63).'
