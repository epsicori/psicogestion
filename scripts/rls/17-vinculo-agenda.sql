-- T-029 · El vínculo con el paciente, exigido también al crear agenda (ADR-055).
--
-- Va al FINAL (17), como manda el README: reutiliza los fixtures de 01-fijación.sql
-- (P1 es de PRO1; P2 es de PRO2 y está en el centro B) y no cambia nada que los módulos
-- anteriores necesiten.
--
-- Lo que se prueba, y por qué en dos capas: la política cubre el INSERT directo, y el
-- disparador cubre las funciones agenda_* —que son security definer, así que RLS no las
-- mira—. Una prueba que solo mirara la política saldría verde con la puerta de la
-- función abierta, que es exactamente como nació el hallazgo 7 de T-011a.

\echo ''
\echo '=== 17-vinculo-agenda ==='

\set TT4 '\'a1200001-0000-4000-8000-000000000001\''
\set C29OK  '\'a1200002-0000-4000-8000-000000000001\''
\set C29TEC  '\'a1200002-0000-4000-8000-000000000002\''
\set C29ADM  '\'a1200002-0000-4000-8000-000000000003\''
\set C29PRO2  '\'a1200002-0000-4000-8000-000000000004\''
\set S29  '\'a1200003-0000-4000-8000-000000000001\''
\set PR29  '\'a1200003-0000-4000-8000-000000000002\''

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen)
values (:TT4, 'Terapia T-029', 50, 'exento_sanitario');

select (current_date + 300) as f29 \gset

-- =========================================================================
-- A · INSERT directo: la política
-- =========================================================================

-- NEGATIVA: PRO1 sobre P2, que es de PRO2. Con el código exacto, no con cualquier fallo.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.citas
           (paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
         values (%L, %L, %L, %L, %L::timestamptz, %L::timestamptz, 'Europe/Madrid')$sql$,
    :P2, :PRO1, :CA, :TT4,
    (:'f29'::date + time '09:00') at time zone 'Europe/Madrid',
    (:'f29'::date + time '09:50') at time zone 'Europe/Madrid'),
  '42501',
  'T-029: PRO1 NO puede crear una cita para P2, que es paciente de PRO2'
);
call pg_temp.reset_sesion();

-- GEMELA POSITIVA, sobre la misma tabla y la misma hora: con SU paciente, entra.
call pg_temp.como(:PRO1);
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C29OK, :P1, :PRO1, :CA, :TT4,
        (:'f29'::date + time '09:00') at time zone 'Europe/Madrid',
        (:'f29'::date + time '09:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where id = :C29OK) = 1,
  'GEMELA POSITIVA: PRO1 SÍ crea la cita cuando el paciente es suyo (P1) — la negativa de arriba no es «no puede insertar nunca»'
);

-- NEGATIVA: lo mismo con una serie.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.series_cita
           (paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
            dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
         values (%L, %L, %L, %L, 'semanal', 3::smallint, time '10:00', 'Europe/Madrid', 50::smallint, 4::smallint, %L)$sql$,
    :P2, :PRO1, :CA, :TT4, :PRO1),
  '42501',
  'T-029: PRO1 NO puede crear una SERIE para P2 — ocho citas de golpe con más razón'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- B · Las funciones de dominio: lo que RLS no cubre
-- =========================================================================

-- NEGATIVA: agenda_crear_serie() es security definer. Sin el disparador entraría aunque
-- la política dijera que no, que es el hallazgo 7 de T-011a en una línea.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format($sql$select public.agenda_crear_serie(%L, %L, %L, %L, 'semanal', 3::smallint, time '11:00', 50::smallint, %L::date, 2::smallint, null)$sql$,
    :P2, :PRO1, :CA, :TT4, (:'f29'::date + 7)),
  '42501',
  'T-029: agenda_crear_serie() TAMBIÉN rechaza el paciente ajeno, aunque sea security definer y RLS no la mire'
);
call pg_temp.reset_sesion();

-- GEMELA POSITIVA: la misma llamada con SU paciente materializa.
call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT4, 'semanal', 3::smallint, time '11:00', 50::smallint, (:'f29'::date + 7)::date, 2::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset b29_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = (:'b29_serie_id')::uuid) = 2,
  'GEMELA POSITIVA: agenda_crear_serie() con el paciente propio materializa sus dos citas'
);

-- =========================================================================
-- C · A quién NO acota la decisión (ADR-055)
-- =========================================================================

-- El técnico administrativo SÍ cita a cualquier paciente de su centro. P1 es de PRO1 y
-- TEC1 no lo tiene asignado —no tiene pacientes: no es profesional—, y aun así puede.
call pg_temp.como(:TEC1);
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C29TEC, :P1, :PRO1, :CA, :TT4,
        (:'f29'::date + time '13:00') at time zone 'Europe/Madrid',
        (:'f29'::date + time '13:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where id = :C29TEC) = 1,
  'ADR-055: el técnico administrativo SIGUE citando a cualquier paciente de su centro — es su trabajo y no ve la historia'
);

-- Y el administrador, para cualquiera.
call pg_temp.como(:ADM);
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C29ADM, :P2, :PRO2, :CB, :TT4,
        (:'f29'::date + time '15:00') at time zone 'Europe/Madrid',
        (:'f29'::date + time '15:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where id = :C29ADM) = 1,
  'ADR-055: el administrador sigue agendando para cualquiera'
);

-- =========================================================================
-- D · Que la negativa no sea verde por el motivo equivocado
-- =========================================================================

-- La prueba que discrimina de verdad: PRO1 sobre P2 falla POR EL VÍNCULO, no porque no
-- vea la fila ni por una clave ajena. Se comprueba pidiéndole a la base la misma
-- pregunta que hace el disparador, en sesión de PRO1 y en sesión de PRO2.
call pg_temp.como(:PRO1);
select public.es_profesional_asignado(:P2) as asignado \gset d29_pro1_
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select public.es_profesional_asignado(:P2) as asignado \gset d29_pro2_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (:'d29_pro1_asignado')::boolean = false and (:'d29_pro2_asignado')::boolean = true,
  'DISCRIMINA: P2 no está asignado a PRO1 y SÍ a PRO2 — el 42501 de arriba es por el vínculo, no por otra cosa'
);

-- Y la vuelta: PRO2, que sí tiene a P2, crea su cita sin problema.
call pg_temp.como(:PRO2);
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C29PRO2, :P2, :PRO2, :CB, :TT4,
        (:'f29'::date + time '17:00') at time zone 'Europe/Madrid',
        (:'f29'::date + time '17:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where id = :C29PRO2) = 1,
  'GEMELA: PRO2, que SÍ tiene a P2, crea la misma cita que a PRO1 se le negó'
);

-- =========================================================================
-- E · La otra puerta `definer`: agenda_confirmar_propuesta()
-- =========================================================================

-- La propuesta se fija COMO postgres a propósito: con el disparador puesto, PRO1 ya no
-- puede crear una serie para P2, así que la única forma de tener una propuesta ajena
-- sobre la mesa es fabricarla por fuera — que es justo el escenario que hay que cubrir:
-- una fila creada antes de esta migración, o por otro camino.
insert into public.series_cita
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
   dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
values
  (:S29, :P2, :PRO1, :CA, :TT4, 'semanal', 3, time '12:00', 'Europe/Madrid', 50, 2, :PRO1);

insert into public.propuestas_cita
  (id, serie_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista,
   hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
values
  (:PR29, :S29, :P2, :PRO1, :CA, 'festivo', (:'f29'::date + 30),
   time '12:00',
   ((:'f29'::date + 30) + time '12:00') at time zone 'Europe/Madrid',
   ((:'f29'::date + 30) + time '12:50') at time zone 'Europe/Madrid',
   'Europe/Madrid', :PRO1);

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.agenda_confirmar_propuesta(%L::uuid)', :PR29),
  '42501',
  'T-029: agenda_confirmar_propuesta() tampoco crea la cita de un paciente ajeno — el disparador cubre las DOS puertas definer, no solo agenda_crear_serie()'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select estado from public.propuestas_cita where id = :PR29) = 'pendiente'
  and not exists (select 1 from public.citas where serie_id = :S29),
  'GEMELA: el rechazo no deja rastro — la propuesta sigue pendiente y no se creó ninguna cita a medias'
);


\echo '17-vinculo-agenda: completa.'
