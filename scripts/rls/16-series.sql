-- T-011a · Series de citas: materialización y desviaciones.
--
-- Va al FINAL, como manda el README (siguiente número tras 15-agenda). Las
-- aserciones de marzo/octubre están ANCLADAS a now(): nunca un año fijo a mano
-- (§10 del «Diseño aprobado» de T-011). Reutiliza los fixtures de
-- 01-fijación.sql (P1, P2, PRO1, PRO2, ADM, TEC1, CA, CB) y crea los propios
-- para no acoplarse a lo que 15-agenda.sql pueda cambiar.

\echo ''
\echo '=== 16-series ==='

\set TT2    '\'a1100001-0000-4000-8000-000000000001\''
\set DISP1  '\'a1100002-0000-4000-8000-000000000001\''
\set S5     '\'a1100003-0000-4000-8000-000000000001\''
\set C5P1   '\'a1100004-0000-4000-8000-000000000001\''
\set C5P2   '\'a1100004-0000-4000-8000-000000000002\''
\set C5P3   '\'a1100004-0000-4000-8000-000000000003\''
\set C5F1   '\'a1100004-0000-4000-8000-000000000004\''
\set C5F2   '\'a1100004-0000-4000-8000-000000000005\''
\set C6FUT  '\'a1100004-0000-4000-8000-000000000006\''
\set COCUP  '\'a1100004-0000-4000-8000-000000000007\''

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen)
values (:TT2, 'Terapia individual T-011', 50, 'exento_sanitario');

-- =========================================================================
-- A · Los cuatro enums nuevos
-- =========================================================================

select pg_temp.assert(
  (select array_agg(v::text order by v::text) from unnest(enum_range(null::public.alcance_cambio_serie)) v)
  = array['esta', 'esta_y_siguientes'],
  'alcance_cambio_serie tiene EXACTAMENTE dos valores: esta, esta_y_siguientes. NUNCA «todas»'
);

select pg_temp.assert(
  (select count(*) from unnest(enum_range(null::public.estado_evento_saliente))) = 3,
  'estado_evento_saliente tiene tres valores (pendiente/entregado/fallido)'
);

select pg_temp.assert(
  (select count(*) from unnest(enum_range(null::public.motivo_propuesta_cita))) = 5,
  'motivo_propuesta_cita tiene cinco valores'
);

-- =========================================================================
-- B · Anclas dinámicas: año que viene, últimos domingos de marzo y octubre
-- =========================================================================

select (extract(year from now())::int + 1) as anio_test \gset

select (make_date(:anio_test, 3, 31) - (extract(isodow from make_date(:anio_test, 3, 31))::int % 7))::text
  as domingo_marzo \gset

select (make_date(:anio_test, 10, 31) - (extract(isodow from make_date(:anio_test, 10, 31))::int % 7))::text
  as domingo_octubre \gset

-- «Los ocho martes que empiezan tres semanas antes del último domingo de
-- marzo del año que viene» (§12.1 del diseño: corrige el ejemplo de fecha del
-- criterio 1, no la propiedad verificada — «1 de febrero» no cruza marzo).
select (:'domingo_marzo'::date - 21)::text as desde_8_martes \gset

\echo 'Anclas: domingo_marzo=':domingo_marzo' domingo_octubre=':domingo_octubre

-- =========================================================================
-- C · Criterio 1 — ocho martes que cruzan el cambio de marzo
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 2::smallint, time '12:00', 50::smallint, :'desde_8_martes'::date, 8::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset c1_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = :'c1_serie_id') = 8,
  'Criterio 1: la serie de ocho martes materializa EXACTAMENTE ocho citas'
);

select pg_temp.assert(
  (select count(distinct (inicio at time zone 'Europe/Madrid')::time)
     from public.citas where serie_id = :'c1_serie_id') = 1,
  'Criterio 1: las ocho citas tienen la MISMA hora local (12:00 Europe/Madrid)'
);

select pg_temp.assert(
  (select count(distinct extract(hour from inicio at time zone 'UTC'))
     from public.citas where serie_id = :'c1_serie_id') = 2,
  'Criterio 1: las ocho citas tienen DOS inicio distintos en UTC, a un lado y otro del cambio de marzo'
);

-- =========================================================================
-- D · Criterio 2 — el hueco de marzo (02:30, no existe)
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 7::smallint, time '02:30', 50::smallint, :'domingo_marzo'::date, 1::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset d1_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = :'d1_serie_id') = 1,
  'Criterio 2: la cita del hueco de marzo SÍ existe (no se descarta)'
);

select pg_temp.assert(
  (select desviada and motivo_desviacion = 'anomalia_horaria'
     from public.citas where serie_id = :'d1_serie_id'),
  'Criterio 2: queda marcada desviada con motivo_desviacion = anomalia_horaria'
);

select pg_temp.assert(
  (select to_char((inicio - interval '1 second') at time zone 'Europe/Madrid', 'HH24:MI:SS')
     from public.citas where serie_id = :'d1_serie_id') = '01:59:59',
  'Criterio 2: un segundo ANTES del instante elegido, la hora de pared es 01:59:59 (el salto, no las 03:30)'
);

select pg_temp.assert(
  (select to_char(inicio at time zone 'Europe/Madrid', 'HH24:MI')
     from public.citas where serie_id = :'d1_serie_id') = '03:00',
  'Criterio 2: el instante elegido es el primero válido POSTERIOR (03:00 local, el salto en sí)'
);

-- =========================================================================
-- E · Criterio 3 — el solape de octubre (02:30, ocurre dos veces)
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 7::smallint, time '02:30', 50::smallint, :'domingo_octubre'::date, 1::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset e1_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select desviada and motivo_desviacion = 'anomalia_horaria'
     from public.citas where serie_id = :'e1_serie_id'),
  'Criterio 3: la cita del solape de octubre existe y queda marcada anomalia_horaria'
);

select pg_temp.assert(
  (select to_char(inicio at time zone 'Europe/Madrid', 'HH24:MI:SS')
     from public.citas where serie_id = :'e1_serie_id') = '02:30:00',
  'Criterio 3: el instante elegido lee 02:30:00 en hora local'
);

select pg_temp.assert(
  (select to_char((inicio + interval '1 hour') at time zone 'Europe/Madrid', 'HH24:MI:SS')
     from public.citas where serie_id = :'e1_serie_id') = '02:30:00',
  'GEMELA (discrimina de verdad): una hora UTC más tarde TAMBIÉN lee 02:30:00 — confirma que la hora era ambigua de verdad y no una elección arbitraria'
);

-- =========================================================================
-- F · Criterio 7 — un festivo dentro de la serie no se materializa encima
-- =========================================================================

-- Festivo de un solo día para PRO1, un mes después del ancla (fuera de las
-- ventanas de marzo/octubre ya usadas).
select (:'domingo_marzo'::date + 60) as fecha_festivo \gset

insert into public.disponibilidad (id, perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
values (:DISP1, :PRO1, :CA, 'festivo', :'fecha_festivo'::date, :'fecha_festivo'::date, 'Europe/Madrid', 'Festivo de prueba T-011');

-- Serie de 3 sesiones semanales que empieza justo el día del festivo.
call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal',
  (extract(isodow from :'fecha_festivo'::date))::smallint,
  time '09:00', 50::smallint, :'fecha_festivo'::date, 3::smallint, null
) as resultado \gset f1_
call pg_temp.reset_sesion();

select (:'f1_resultado')::jsonb ->> 'serie_id' as serie_id \gset f1_

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = (:'f1_serie_id')::uuid) = 2,
  'Criterio 7: 3 sesiones con un festivo dentro son DOS citas materializadas, no tres'
);

select pg_temp.assert(
  (select count(*) from public.propuestas_cita
     where serie_id = (:'f1_serie_id')::uuid and motivo = 'festivo' and estado = 'pendiente') = 1,
  'Criterio 7: la sesión del festivo queda como UNA propuesta pendiente, no se salta en silencio'
);

select pg_temp.assert(
  not exists (
    select 1 from public.citas
    where serie_id = (:'f1_serie_id')::uuid
      and (inicio at time zone 'Europe/Madrid')::date = :'fecha_festivo'::date
  ),
  'GEMELA: ninguna cita se materializó ENCIMA del festivo'
);

-- agenda_confirmar_propuesta(): con desplazamiento encontrado, crea la cita
-- DESVIADA con el motivo mapeado.
select id from public.propuestas_cita
  where serie_id = (:'f1_serie_id')::uuid and motivo = 'festivo' \gset f2_

select pg_temp.assert(
  (select inicio_propuesto is not null from public.propuestas_cita where id = (:'f2_id')::uuid),
  'La propuesta del festivo SÍ trae un desplazamiento (el día siguiente estaba libre)'
);

call pg_temp.como(:PRO1);
select public.agenda_confirmar_propuesta((:'f2_id')::uuid) as cita_id \gset f3_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select desviada and motivo_desviacion = 'festivo' and estado <> 'cancelada'
     from public.citas where id = (:'f3_cita_id')::uuid),
  'agenda_confirmar_propuesta(): la cita creada desde una propuesta de festivo queda DESVIADA con motivo festivo'
);

select pg_temp.assert(
  (select estado = 'confirmada' and cita_resultante_id = (:'f3_cita_id')::uuid
     from public.propuestas_cita where id = (:'f2_id')::uuid),
  'GEMELA: la propuesta queda confirmada y apunta a la cita resultante'
);

-- NEGATIVA: confirmar la MISMA propuesta otra vez falla (ya no está pendiente).
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.agenda_confirmar_propuesta(%L::uuid)', :'f2_id'),
  '22023',
  'agenda_confirmar_propuesta() sobre una propuesta ya resuelta lanza 22023'
);
call pg_temp.reset_sesion();

-- agenda_descartar_propuesta(): sobre la propuesta de 'ocupada' que sale de
-- chocar con una cita ya reservada del mismo profesional.
select (:'domingo_marzo'::date + 90) as fecha_ocupada \gset

insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:COCUP, :P2, :PRO1, :CA, :TT2,
        (:'fecha_ocupada'::date + time '09:00') at time zone 'Europe/Madrid',
        (:'fecha_ocupada'::date + time '09:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal',
  (extract(isodow from :'fecha_ocupada'::date))::smallint,
  time '09:00', 50::smallint, :'fecha_ocupada'::date, 1::smallint, null
) as resultado \gset g1_
call pg_temp.reset_sesion();

select (:'g1_resultado')::jsonb ->> 'serie_id' as serie_id \gset g1_

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = (:'g1_serie_id')::uuid) = 0,
  'Chocar con citas_sin_solape_profesional (23P01) NO materializa la cita'
);

select id from public.propuestas_cita
  where serie_id = (:'g1_serie_id')::uuid and motivo = 'ocupada' \gset g2_

select pg_temp.assert(
  (select estado from public.propuestas_cita where id = (:'g2_id')::uuid) = 'pendiente',
  'GEMELA: en su lugar queda una propuesta pendiente con motivo ocupada'
);

call pg_temp.como(:PRO1);
select public.agenda_descartar_propuesta((:'g2_id')::uuid);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select estado = 'descartada' and resuelta_por is not null
     from public.propuestas_cita where id = (:'g2_id')::uuid),
  'agenda_descartar_propuesta() marca la propuesta descartada sin crear ni mover ninguna cita'
);

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = (:'g1_serie_id')::uuid) = 0,
  'GEMELA: descartar no crea ninguna cita — la sesión queda sin materializar'
);

-- =========================================================================
-- G · Criterio 4 — desplazar a mano y editar «esta y las siguientes»
-- =========================================================================

select (:'domingo_marzo'::date + 120) as desde_c4 \gset

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal',
  (extract(isodow from :'desde_c4'::date))::smallint,
  time '15:00', 50::smallint, :'desde_c4'::date, 4::smallint, null
) as resultado \gset h1_
call pg_temp.reset_sesion();

select (:'h1_resultado')::jsonb ->> 'serie_id' as serie_id \gset h1_

select id, inicio from public.citas
  where serie_id = (:'h1_serie_id')::uuid order by inicio offset 1 limit 1 \gset h2_
select id from public.citas
  where serie_id = (:'h1_serie_id')::uuid order by inicio limit 1 \gset h3_

-- Desplaza a mano la SEGUNDA cita (agenda_actualizar_cita, T-010, sin marca de
-- origen): queda desviada. Se mueve DOS horas (17:00), no una: la regla nueva
-- de abajo pone hora_local=16:00, así que si el código reasignara la
-- desviada a la hora de la serie por error, la prueba lo detectaría (1h
-- coincidiría con 16:00 por casualidad; 2h no).
call pg_temp.como(:PRO1);
select public.agenda_actualizar_cita(
  (:'h2_id')::uuid, p_inicio => (:'h2_inicio')::timestamptz + interval '2 hours',
  p_fin => (:'h2_inicio')::timestamptz + interval '2 hours 50 minutes'
);
call pg_temp.reset_sesion();

select inicio, desviada from public.citas where id = (:'h2_id')::uuid \gset h4_

select pg_temp.assert(
  (:'h4_desviada')::boolean,
  'Desplazar a mano marca la cita DESVIADA'
);

-- Edita la serie con «esta y las siguientes»: cambia la hora local de la regla.
call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'h3_id')::uuid, 'esta_y_siguientes', p_hora_local => time '16:00'
) as resultado \gset h5_
call pg_temp.reset_sesion();

select inicio from public.citas where id = (:'h2_id')::uuid \gset h6_

select pg_temp.assert(
  (:'h6_inicio')::timestamptz = (:'h4_inicio')::timestamptz,
  'Criterio 4: la cita desviada CONSERVA su hora tras editar la serie con esta_y_siguientes'
);

select pg_temp.assert(
  not exists (select 1 from public.propuestas_cita where cita_id = (:'h2_id')::uuid),
  'GEMELA: la serie NO genera propuesta para la cita desviada — no la gobierna más'
);

select pg_temp.assert(
  exists (
    select 1 from public.eventos_salientes e
     where e.tipo = 'agenda.regla_serie_cambiada'
       and e.carga ->> 'serie_id' = :'h1_serie_id'
       and e.carga -> 'citas_afectadas' ? (:'h3_id')
  ),
  'GEMELA: la cita NO desviada de la serie SÍ entra en citas_afectadas del evento'
);

-- =========================================================================
-- H · Criterio 5 — «esta y las siguientes» sobre citas pasadas
-- =========================================================================

insert into public.series_cita
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
   dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
values
  (:S5, :P1, :PRO1, :CA, :TT2, 'semanal', 3, time '09:00', 'Europe/Madrid', 50, 5, :PRO1);

insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id, inicio, fin, zona_horaria) values
  (:C5P1, :P1, :PRO1, :CA, :TT2, :S5, now() - interval '10 days', now() - interval '10 days' + interval '50 minutes', 'Europe/Madrid'),
  (:C5P2, :P1, :PRO1, :CA, :TT2, :S5, now() - interval '3 days',  now() - interval '3 days'  + interval '50 minutes', 'Europe/Madrid'),
  (:C5P3, :P1, :PRO1, :CA, :TT2, :S5, now() - interval '1 days',  now() - interval '1 days'  + interval '50 minutes', 'Europe/Madrid'),
  (:C5F1, :P1, :PRO1, :CA, :TT2, :S5, now() + interval '3 days',  now() + interval '3 days'  + interval '50 minutes', 'Europe/Madrid'),
  (:C5F2, :P1, :PRO1, :CA, :TT2, :S5, now() + interval '10 days', now() + interval '10 days' + interval '50 minutes', 'Europe/Madrid');

create temp table t16_pasadas_antes as
  select id, inicio, fin, zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion,
         serie_id, paciente_id, profesional_id, centro_id, tipo_terapia_id, creada_en, creada_por
    from public.citas where id in (:C5P1, :C5P2, :C5P3) order by id;

call pg_temp.como(:PRO1);
select public.agenda_cancelar_cita(:C5F1, 'esta_y_siguientes') as resultado \gset i1_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where id in (:C5P1, :C5P2, :C5P3)) = 3,
  'Sanidad: las tres pasadas siguen existiendo (no se borró ninguna)'
);

select pg_temp.assert(
  not exists (
    select id, inicio, fin, zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion,
           serie_id, paciente_id, profesional_id, centro_id, tipo_terapia_id, creada_en, creada_por
      from t16_pasadas_antes
    except
    select id, inicio, fin, zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion,
           serie_id, paciente_id, profesional_id, centro_id, tipo_terapia_id, creada_en, creada_por
      from public.citas where id in (:C5P1, :C5P2, :C5P3)
  ),
  'Criterio 5: las TRES citas pasadas quedan BYTE A BYTE iguales tras esta_y_siguientes (antes ⊆ después, y siguen siendo tres)'
);

select pg_temp.assert(
  (select estado from public.citas where id = :C5F1) = 'cancelada'
  and (select estado from public.citas where id = :C5F2) = 'cancelada',
  'GEMELA: las DOS futuras de la misma serie SÍ se cancelan — el filtro no es «no hace nada»'
);

-- NEGATIVA: SQL directo sobre una pasada falla por el disparador.
select pg_temp.assert_lanza_codigo(
  format('update public.citas set inicio = inicio + interval ''1 hour'' where id = %L', :C5P1),
  '42501',
  'Criterio 5: tocar inicio de una cita pasada por SQL directo FALLA por disparador (fn_proteger_cita_pasada)'
);

select pg_temp.assert_lanza_codigo(
  format('delete from public.citas where id = %L', :C5P2),
  '42501',
  'Un DELETE sobre una cita pasada también falla por el mismo disparador'
);

-- GEMELA POSITIVA: una columna PERMITIDA (estado) sí se puede cambiar en una
-- cita pasada por SQL directo — el disparador no bloquea todo, solo lo que
-- reescribe el acuerdo.
update public.citas set estado = 'realizada' where id = :C5P3;

select pg_temp.assert(
  (select estado from public.citas where id = :C5P3) = 'realizada',
  'GEMELA POSITIVA: cambiar `estado` de una cita pasada SÍ está permitido (marcar realizada una sesión de ayer)'
);

drop table t16_pasadas_antes;

-- =========================================================================
-- I · Criterio 6 — cambiar centros.zona_horaria no mueve ninguna cita
-- =========================================================================

insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C6FUT, :P2, :PRO2, :CB, :TT2, now() + interval '20 days', now() + interval '20 days' + interval '50 minutes', 'Europe/Madrid');

create temp table t16_cb_antes as
  select id, inicio, fin from public.citas where centro_id = :CB order by id;

select (select count(*) from public.eventos_salientes) as eventos_antes \gset j1_

update public.centros set zona_horaria = 'Atlantic/Canary' where id = :CB;

select pg_temp.assert(
  not exists (
    select id, inicio, fin from public.citas where centro_id = :CB
    except
    select * from t16_cb_antes
  )
  -- El EXCEPT en un solo sentido vería un cambio, pero NO un borrado: el conjunto de
  -- después sería un subconjunto del de antes y saldría verde igual. El recuento cierra
  -- ese lado, como ya hacía el criterio 5 (hallazgo 2 de la revisión con Opus).
  and (select count(*) from public.citas where centro_id = :CB)
      = (select count(*) from t16_cb_antes),
  'Criterio 6: cambiar centros.zona_horaria NO cambia NI UNA fila de citas de ese centro, ni se lleva ninguna por delante'
);

select pg_temp.assert(
  (select count(*) from public.eventos_salientes) = (:j1_eventos_antes)::bigint + 1,
  'Criterio 6: aparece EXACTAMENTE una fila nueva de outbox'
);

select pg_temp.assert(
  exists (
    select 1 from public.eventos_salientes
     where tipo = 'agenda.zona_centro_cambiada' and carga ->> 'centro_id' = :CB
  ),
  'La fila nueva es de tipo agenda.zona_centro_cambiada para el centro B'
);

select pg_temp.assert(
  exists (
    select 1 from public.eventos_salientes
     where tipo = 'agenda.zona_centro_cambiada' and carga ->> 'centro_id' = :CB
       and carga -> 'citas_afectadas' ? :C6FUT
  ),
  'GEMELA: la cita futura de centro B SÍ aparece en citas_afectadas'
);

drop table t16_cb_antes;

-- eventos_salientes: RLS activada, CERO políticas Y CERO grant (§4 del
-- diseño). Con cero grant, ni siquiera se llega a evaluar RLS: el SELECT
-- falla por permiso de tabla, más fuerte que "cero filas".
call pg_temp.como(:ADM);
select pg_temp.assert_lanza(
  'select * from public.eventos_salientes',
  'eventos_salientes: NINGÚN rol de sesión (ni el administrador) puede ni siquiera consultarla — cero grant, cero políticas'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.eventos_salientes) > 0,
  'GEMELA: el cero de arriba es de RLS, no de que la tabla esté vacía — hay filas de verdad'
);

-- =========================================================================
-- J · propuestas_cita: quién ve qué
-- =========================================================================

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar('select * from public.propuestas_cita where profesional_id = ' || quote_literal((:PRO1)::text)) > 0,
  'PRO1 ve sus propias propuestas'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar('select * from public.propuestas_cita where profesional_id = ' || quote_literal((:PRO1)::text)) = 0,
  'PRO2 NO ve las propuestas de PRO1'
);
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar('select * from public.propuestas_cita where centro_id = ' || quote_literal((:CA)::text)) > 0,
  'GEMELA: el técnico de centro A SÍ ve las propuestas de su centro'
);
select pg_temp.assert(
  pg_temp.contar('select * from public.propuestas_cita where centro_id = ' || quote_literal((:CB)::text)) = 0,
  'El técnico de centro A NO ve las propuestas de centro B'
);
call pg_temp.reset_sesion();

-- Ninguna política de insert/update: solo escriben las funciones agenda_*.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza(
  format($sql$insert into public.propuestas_cita
           (serie_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista,
            hora_local_prevista, zona_horaria, creada_por)
         values (%L, %L, %L, %L, 'ocupada', current_date, time '09:00', 'Europe/Madrid', %L)$sql$,
    :S5, :P1, :PRO1, :CA, :PRO1),
  'INSERT directo en propuestas_cita rechazado: sin política de insert, solo las funciones agenda_* escriben'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K · Autorización de agenda_crear_serie()
-- =========================================================================

select (:'domingo_marzo'::date + 150) as desde_auth \gset

-- NEGATIVA: PRO2 no puede crear una serie a nombre de PRO1.
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo(
  format($sql$select public.agenda_crear_serie(%L, %L, %L, %L, 'semanal', 3::smallint, time '10:00', 50::smallint, %L::date, 1::smallint, null)$sql$,
    :P1, :PRO1, :CA, :TT2, :'desde_auth'),
  '42501',
  'PRO2 NO puede crear una serie con profesional_id = PRO1'
);
call pg_temp.reset_sesion();

-- GEMELA POSITIVA: PRO1 sí puede crear su propia serie.
call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 3::smallint, time '10:00', 50::smallint, :'desde_auth'::date, 1::smallint, null
) ->> 'serie_id') is not null as ok \gset k1_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (:'k1_ok')::boolean,
  'GEMELA POSITIVA: PRO1 SÍ puede crear una serie propia'
);

-- =========================================================================
-- L · Los dos hallazgos de la REVISIÓN CON OPUS (11-09-2026)
--
-- Los dos se reprodujeron antes de arreglarlos, contra la base de verdad, y
-- las dos aserciones de aquí se ponen ROJAS si se quita el arreglo.
-- =========================================================================

\set TT3   '\'a1100005-0000-4000-8000-000000000001\''
\set DISP2 '\'a1100005-0000-4000-8000-000000000002\''

insert into public.tipos_terapia (id, nombre, duracion_minutos, tarifa_base, regimen)
values (:TT3, 'Terapia revisión T-011', 50, 60.00, 'exento_sanitario');

-- --- L.1 · La cita que nace de una propuesta conserva el tipo de terapia ---
-- Sin el arreglo, agenda_confirmar_propuesta() creaba la cita SIN
-- tipo_terapia_id (propuestas_cita no lo lleva): la sesión desplazada por un
-- festivo perdía tarifa_base y régimen de IVA. Y como fn_proteger_cita_pasada()
-- prohíbe cambiar tipo_terapia_id en una cita pasada, la pérdida era definitiva
-- en cuanto la sesión ocurría.

select (:'domingo_marzo'::date + 200) as fecha_festivo_l \gset

insert into public.disponibilidad (id, perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
values (:DISP2, :PRO1, :CA, 'festivo', :'fecha_festivo_l'::date, :'fecha_festivo_l'::date,
        'Europe/Madrid', 'Festivo de la revisión T-011');

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT3, 'semanal',
  (extract(isodow from :'fecha_festivo_l'::date))::smallint,
  time '09:00', 50::smallint, :'fecha_festivo_l'::date, 1::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset l1_
call pg_temp.reset_sesion();

select id from public.propuestas_cita
  where serie_id = (:'l1_serie_id')::uuid and motivo = 'festivo' \gset l2_

call pg_temp.como(:PRO1);
select public.agenda_confirmar_propuesta((:'l2_id')::uuid) as cita_id \gset l3_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select tipo_terapia_id from public.citas where id = (:'l3_cita_id')::uuid) = (:TT3)::uuid,
  'REVISIÓN: la cita creada al confirmar una propuesta CONSERVA el tipo_terapia_id de su serie (sin el arreglo quedaba NULL, y con él se iban tarifa_base y régimen de IVA)'
);

select pg_temp.assert(
  (select tipo_terapia_id from public.series_cita where id = (:'l1_serie_id')::uuid) = (:TT3)::uuid
  and (select tarifa_base from public.tipos_terapia where id = :TT3) is not null,
  'GEMELA: el valor comprobado es el de la SERIE, y ese tipo de terapia tiene tarifa — lo que se perdía tenía consecuencia económica'
);

-- --- L.2 · Cada edición resuelve contra SU evento, no contra el último ---
-- Sin el arreglo, agenda_editar_serie() buscaba su evento con «el más reciente
-- de esta serie», y creado_en es now(), que NO avanza dentro de una
-- transacción: la segunda edición resolvía contra el evento de la primera, no
-- proponía nada (idempotencia por evento_id + cita_id) y dejaba la regla
-- cambiada sin una sola propuesta que la reconciliara. En silencio.

select (:'domingo_marzo'::date + 230) as desde_l2 \gset

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT3, 'semanal',
  (extract(isodow from :'desde_l2'::date))::smallint,
  time '11:00', 50::smallint, :'desde_l2'::date, 3::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset l4_
call pg_temp.reset_sesion();

select id from public.citas where serie_id = (:'l4_serie_id')::uuid order by inicio limit 1 \gset l5_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie((:'l5_id')::uuid, 'esta_y_siguientes', p_hora_local => time '16:00') as r \gset l6_
select public.agenda_editar_serie((:'l5_id')::uuid, 'esta_y_siguientes', p_hora_local => time '17:00') as r \gset l7_
call pg_temp.reset_sesion();

select pg_temp.assert(
  ((:'l6_r')::jsonb ->> 'evento_id') is distinct from ((:'l7_r')::jsonb ->> 'evento_id'),
  'REVISIÓN: dos ediciones en la MISMA transacción resuelven contra eventos DISTINTOS'
);

select pg_temp.assert(
  exists (
    select 1 from public.propuestas_cita p
      join public.citas c on c.id = p.cita_id
     where c.serie_id = (:'l4_serie_id')::uuid and p.hora_local_prevista = time '17:00'
  ),
  'REVISIÓN: la SEGUNDA edición deja propuestas a las 17:00 — sin el arreglo la serie quedaba a las 17:00 y no se proponía ni una'
);

select pg_temp.assert(
  (select hora_local from public.series_cita where id = (:'l4_serie_id')::uuid) = time '17:00',
  'GEMELA: la regla de la serie sí quedó a las 17:00 — el fallo era que nadie lo proponía, no que no se guardara'
);

-- Hallazgo 4 de la revisión: la propuesta nacida de un evento guarda también la SERIE,
-- no solo la cita y el evento. Sin esto, «las propuestas de esta serie» daba cero.
select pg_temp.assert(
  (select count(*) from public.propuestas_cita
    where serie_id = (:'l4_serie_id')::uuid and motivo = 'regla_cambiada')
  = (select count(*) from public.propuestas_cita p
       join public.citas c on c.id = p.cita_id
      where c.serie_id = (:'l4_serie_id')::uuid and p.motivo = 'regla_cambiada')
  and (select count(*) from public.propuestas_cita
        where serie_id = (:'l4_serie_id')::uuid and motivo = 'regla_cambiada') > 0,
  'REVISIÓN: buscar las propuestas del cambio de regla POR SERIE da lo mismo que buscarlas por cita, y no es cero'
);

select pg_temp.assert(
  not exists (
    select 1 from public.propuestas_cita p
      join public.citas c on c.id = p.cita_id
     where p.motivo = 'regla_cambiada' and p.serie_id is distinct from c.serie_id
  ),
  'GEMELA: el serie_id de la propuesta es EL DE SU CITA, no uno inventado ni el de otra serie'
);

-- GEMELA: una edición que NO cambia la regla no resuelve ningún evento (antes
-- reprocesaba el último de la serie).
call pg_temp.como(:PRO1);
select public.agenda_editar_serie((:'l5_id')::uuid, 'esta_y_siguientes', p_hora_local => time '17:00') as r \gset l8_
call pg_temp.reset_sesion();

select pg_temp.assert(
  ((:'l8_r')::jsonb -> 'evento_id') is null
  and ((:'l8_r')::jsonb -> 'propuestas') = '[]'::jsonb,
  'GEMELA: una edición que no cambia la regla no resuelve NINGÚN evento ni crea propuestas'
);

-- =========================================================================
-- M · T-011b — editar la serie desde la cita (ADR-068, ADR-069)
-- =========================================================================
--
-- Detalle por criterio: §3 de tickets/T-011b/diseno.md. Cada bloque lleva el
-- prefijo «M.x · Criterio N» en sus mensajes, para que un fallo diga qué
-- criterio rompe. Toda guarda nueva lanza 22023 y se comprueba con
-- assert_lanza_codigo_msg y el FRAGMENTO del mensaje (lección de T-012a): el
-- código solo no demuestra qué comprobación mordió. Toda negativa tiene su
-- gemela positiva.
--
-- Fijaciones:
--   · base_m = domingo_marzo + 400 (siempre lunes): las series semanales de
--     PRO1 de M.1-M.4, M.8, M.10, M.11 y M.15 cuelgan de base_m + 70·k, lejos
--     de A-L (que viven entre domingo_marzo - 21 y domingo_marzo + 240) y de
--     17-vinculo-agenda (current_date + 300).
--   · M.5 y M.6 son de PRO2/P2 en CA (Europe/Madrid): §C, §D y §E ya tienen
--     citas de PRO1 en esas semanas de marzo y octubre (F17) y confirmar
--     chocaría con 23P01. El vínculo lo permite (P2 es de PRO2) y
--     agenda_crear_serie no ata el centro al profesional.
--   · M.7 y M.9 insertan como postgres, igual que §H: el tiempo no deja
--     fabricar de otro modo una cita pasada, una en curso o una desviada.
--     M.9 usa un centro, un profesional y un paciente propios (CT, PRO9, P9)
--     para que el cambio de zona no arrastre las citas de CA o CB.
--   · Lo que prueba el producto va por la función que llamaría la Server
--     Action (agenda_editar_serie, agenda_propuestas_de_evento,
--     agenda_confirmar_propuesta, agenda_previsualizar_edicion_serie) y COMO
--     el profesional (pg_temp.como).

\echo ''
\echo '--- M · T-011b: editar la serie desde la cita ---'

\set CT     '\'a1100006-0000-4000-8000-000000000001\''
\set PRO9   '\'a1100006-0000-4000-8000-000000000002\''
\set P9     '\'a1100006-0000-4000-8000-000000000003\''
\set S9     '\'a1100006-0000-4000-8000-000000000004\''
\set C9A    '\'a1100006-0000-4000-8000-000000000010\''
\set C9B    '\'a1100006-0000-4000-8000-000000000011\''
\set C9C    '\'a1100006-0000-4000-8000-000000000012\''
\set C9D    '\'a1100006-0000-4000-8000-000000000013\''
\set S15    '\'a1100006-0000-4000-8000-000000000015\''
\set S7     '\'a1100006-0000-4000-8000-000000000071\''
\set C7PAS  '\'a1100006-0000-4000-8000-000000000072\''
\set C7CUR  '\'a1100006-0000-4000-8000-000000000073\''
\set C7N1   '\'a1100006-0000-4000-8000-000000000074\''
\set C7DES  '\'a1100006-0000-4000-8000-000000000075\''
\set C7N2   '\'a1100006-0000-4000-8000-000000000076\''
\set C7CAN  '\'a1100006-0000-4000-8000-000000000077\''
\set C7N3   '\'a1100006-0000-4000-8000-000000000078\''

-- Calendario de referencia, escrito aparte del de la migración para no
-- comprobar una fórmula contra sí misma. m_enesimo NO recorta (se usa solo
-- con ordinales que existen); m_ultimo sale del último día del mes hacia
-- atrás, que es otra cuenta distinta de la de enesimo_dia_del_mes.
create or replace function pg_temp.m_lunes(p date) returns date
language sql immutable as $$
  select p - (extract(isodow from p)::int - 1)
$$;

create or replace function pg_temp.m_enesimo(p date, dow int, n int) returns date
language sql immutable as $$
  select date_trunc('month', p::timestamp)::date
         + ((dow - extract(isodow from date_trunc('month', p::timestamp))::int + 7) % 7)
         + 7 * (n - 1)
$$;

create or replace function pg_temp.m_ultimo(p date, dow int) returns date
language sql immutable as $$
  select (date_trunc('month', p::timestamp) + interval '1 month - 1 day')::date
         - ((extract(isodow from (date_trunc('month', p::timestamp) + interval '1 month - 1 day'))::int - dow + 7) % 7)
$$;

select (:'domingo_marzo'::date + 400)::text as base_m \gset

select pg_temp.assert(
  extract(isodow from :'base_m'::date) = 1,
  'M · fijación: base_m (domingo_marzo + 400) es lunes'
);

-- =========================================================================
-- M.1 · Criterio 4 — «esta y las siguientes» empieza en la cita elegida
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, :'base_m'::date, 6::smallint, null
) ->> 'serie_id') as serie_id \gset m1_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m1_serie_id'::uuid \gset m1_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m1_citas'::uuid[])[3], 'esta_y_siguientes', p_hora_local => time '10:00'
)::text as r \gset m1_
call pg_temp.reset_sesion();

select id as ev from public.eventos_salientes
 where tipo = 'agenda.regla_serie_cambiada' and carga ->> 'serie_id' = :'m1_serie_id' \gset m1_

select pg_temp.assert(
  (select carga -> 'citas_afectadas' from public.eventos_salientes where id = :'m1_ev'::uuid)
  = jsonb_build_array((:'m1_citas'::uuid[])[3], (:'m1_citas'::uuid[])[4],
                      (:'m1_citas'::uuid[])[5], (:'m1_citas'::uuid[])[6]),
  'M.1 · Criterio 4: citas_afectadas es EXACTAMENTE [c3, c4, c5, c6], en orden — c1 y c2, anteriores a la cita elegida, NO entran'
);

select pg_temp.assert(
  not exists (
    select 1 from public.propuestas_cita
     where evento_id = :'m1_ev'::uuid
       and cita_id in ((:'m1_citas'::uuid[])[1], (:'m1_citas'::uuid[])[2])
  ),
  'M.1 · Criterio 4: ninguna propuesta para c1 ni c2'
);

select pg_temp.assert(
  (select array_agg(cita_id order by fecha_prevista) from public.propuestas_cita where evento_id = :'m1_ev'::uuid)
  = (:'m1_citas'::uuid[])[3:6],
  'M.1 · Criterio 4 (GEMELA): c3, c4, c5 y c6 SÍ tienen su propuesta, una cada una'
);

select pg_temp.assert(
  (select carga ->> 'desde_cita_id' from public.eventos_salientes where id = :'m1_ev'::uuid)
  = ((:'m1_citas'::uuid[])[3])::text
  and ((:'m1_r')::jsonb ->> 'evento_id') = :'m1_ev',
  'M.1 · Criterio 4: la carga lleva desde_cita_id = c3, y agenda_editar_serie devuelve ESE evento'
);

-- =========================================================================
-- M.2 · Criterio 5 — la ancla cambia de día: el resto conserva su semana
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, (:'base_m'::date + 70), 6::smallint, null
) ->> 'serie_id') as serie_id \gset m2_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m2_serie_id'::uuid \gset m2_
select ((inicio at time zone zona_horaria)::date)::text as f3
  from public.citas where id = (:'m2_citas'::uuid[])[3] \gset m2_

-- NEGATIVAS primero (dentro de un sub-bloque: no dejan rastro).
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_editar_serie(%L::uuid, 'esta', p_fecha => %L::date)$q$,
         (:'m2_citas'::uuid[])[3], :'m2_f3'::date + 2),
  '22023', 'Con "esta"',
  'M.2 · Criterio 5: con alcance «esta», p_fecha se rechaza — mover solo una cita no cambia la fecha de la serie'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_editar_serie(%L::uuid, 'esta_y_siguientes', p_fecha => %L::date, p_hora_local => time '10:00')$q$,
         (:'m2_citas'::uuid[])[3], current_date - 1),
  '22023', 'nuevo horario de esta cita ya ha pasado',
  'M.2 · Criterio 5: una fecha nueva en el pasado para la ancla se rechaza por su guarda'
);

-- GEMELA: la ancla c3 (lunes) pasa al miércoles de SU semana, a las 10:00.
select public.agenda_editar_serie(
  (:'m2_citas'::uuid[])[3], 'esta_y_siguientes',
  p_fecha => :'m2_f3'::date + 2, p_hora_local => time '10:00'
)::text as r \gset m2_
call pg_temp.reset_sesion();

select ((:'m2_r')::jsonb ->> 'evento_id') as ev \gset m2_

select pg_temp.assert(
  (select array_agg(cita_id order by fecha_prevista) from public.propuestas_cita where evento_id = :'m2_ev'::uuid)
  = (:'m2_citas'::uuid[])[3:6],
  'M.2 · Criterio 5: una propuesta por cita, de c3 a c6'
);

select pg_temp.assert(
  not exists (
    select 1
      from public.propuestas_cita p
      join public.citas c on c.id = p.cita_id
     where p.evento_id = :'m2_ev'::uuid
       and not (
         extract(isodow from p.fecha_prevista) = extract(isodow from :'m2_f3'::date + 2)
         and pg_temp.m_lunes(p.fecha_prevista) = pg_temp.m_lunes((c.inicio at time zone c.zona_horaria)::date)
         and to_char(p.inicio_propuesto at time zone p.zona_horaria, 'HH24:MI') = '10:00'
       )
  ),
  'M.2 · Criterio 5: TODAS caen en miércoles de SU propia semana, a las 10:00 locales'
);

select pg_temp.assert(
  (select fecha_prevista from public.propuestas_cita
    where evento_id = :'m2_ev'::uuid and cita_id = (:'m2_citas'::uuid[])[3])
  = :'m2_f3'::date + 2,
  'M.2 · Criterio 5: la propuesta de la ancla c3 es exactamente p_fecha'
);

-- =========================================================================
-- M.3 · Criterio 5 — la ancla salta una semana: el resto salta con ella
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, (:'base_m'::date + 140), 6::smallint, null
) ->> 'serie_id') as serie_id \gset m3_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m3_serie_id'::uuid \gset m3_
select ((inicio at time zone zona_horaria)::date)::text as f3
  from public.citas where id = (:'m3_citas'::uuid[])[3] \gset m3_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m3_citas'::uuid[])[3], 'esta_y_siguientes', p_fecha => :'m3_f3'::date + 7
)::text as r \gset m3_
call pg_temp.reset_sesion();

select ((:'m3_r')::jsonb ->> 'evento_id') as ev \gset m3_

select pg_temp.assert(
  (select count(*) from public.propuestas_cita where evento_id = :'m3_ev'::uuid) = 4
  and not exists (
    select 1
      from public.propuestas_cita p
      join public.citas c on c.id = p.cita_id
     where p.evento_id = :'m3_ev'::uuid
       and p.fecha_prevista <> (c.inicio at time zone c.zona_horaria)::date + 7
  ),
  'M.3 · Criterio 5: con p_fecha = fecha(c3) + 7, las CUATRO propuestas son fecha(cita) + 7'
);

-- =========================================================================
-- M.4 · Criterio 6 — la duración de la propuesta es la de la regla nueva
-- =========================================================================

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, (:'base_m'::date + 210), 4::smallint, null
) ->> 'serie_id') as serie_id \gset m4_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m4_serie_id'::uuid \gset m4_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m4_citas'::uuid[])[1], 'esta_y_siguientes', p_duracion_minutos => 80::smallint
)::text as r \gset m4_
call pg_temp.reset_sesion();

select ((:'m4_r')::jsonb ->> 'evento_id') as ev \gset m4_

select pg_temp.assert(
  (select count(*) from public.propuestas_cita where evento_id = :'m4_ev'::uuid) = 4
  and not exists (
    select 1 from public.propuestas_cita
     where evento_id = :'m4_ev'::uuid
       and fin_propuesto - inicio_propuesto <> interval '80 minutes'
  ),
  'M.4 · Criterio 6: las cuatro propuestas duran 80 minutos (la regla nueva), no 50 (la cita)'
);

select id as p1 from public.propuestas_cita
 where evento_id = :'m4_ev'::uuid and cita_id = (:'m4_citas'::uuid[])[1] \gset m4_

call pg_temp.como(:PRO1);
select public.agenda_confirmar_propuesta(:'m4_p1'::uuid) as cita \gset m4_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select fin - inicio = interval '80 minutes' and desviada = false
     from public.citas where id = (:'m4_citas'::uuid[])[1])
  and :'m4_cita'::uuid = (:'m4_citas'::uuid[])[1],
  'M.4 · Criterio 6: confirmada, la ancla dura 80 minutos y NO queda desviada (la mueve la serie)'
);

-- =========================================================================
-- M.5 · Criterio 7a — la hora local se mantiene al cruzar el cambio de hora
-- =========================================================================

-- Octubre.
call pg_temp.como(:PRO2);
select (public.agenda_crear_serie(
  :P2, :PRO2, :CA, :TT2, 'semanal', 2::smallint, time '12:00', 50::smallint,
  (:'domingo_octubre'::date - 12), 4::smallint, null
) ->> 'serie_id') as serie_id \gset m5o_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m5o_serie_id'::uuid \gset m5o_

select pg_temp.assert(
  array_length(:'m5o_citas'::uuid[], 1) = 4,
  'M.5 · fijación: la serie de martes de octubre materializa sus cuatro citas'
);

call pg_temp.como(:PRO2);
select public.agenda_editar_serie(
  (:'m5o_citas'::uuid[])[1], 'esta_y_siguientes',
  p_fecha => (:'domingo_octubre'::date - 10), p_hora_local => time '12:00', p_duracion_minutos => 60::smallint
)::text as r \gset m5o_
call pg_temp.reset_sesion();

select ((:'m5o_r')::jsonb ->> 'evento_id') as ev \gset m5o_

select pg_temp.assert(
  (select count(*) from public.propuestas_cita where evento_id = :'m5o_ev'::uuid) = 4
  and not exists (
    select 1 from public.propuestas_cita
     where evento_id = :'m5o_ev'::uuid
       and (extract(isodow from fecha_prevista) <> 4 or fin_propuesto - inicio_propuesto <> interval '60 minutes')
  ),
  'M.5 · Criterio 7a (octubre): las cuatro propuestas caen en jueves y duran 60 minutos'
);

select pg_temp.assert(
  (select count(distinct to_char(inicio_propuesto at time zone zona_horaria, 'HH24:MI'))
     from public.propuestas_cita where evento_id = :'m5o_ev'::uuid) = 1
  and (select min(to_char(inicio_propuesto at time zone zona_horaria, 'HH24:MI'))
     from public.propuestas_cita where evento_id = :'m5o_ev'::uuid) = '12:00',
  'M.5 · Criterio 7a (octubre): UNA sola hora local, las 12:00'
);

select pg_temp.assert(
  (select count(distinct extract(hour from inicio_propuesto at time zone 'UTC'))
     from public.propuestas_cita where evento_id = :'m5o_ev'::uuid) = 2,
  'M.5 · Criterio 7a (octubre): DOS horas UTC distintas, a un lado y otro del cambio'
);

-- Marzo.
call pg_temp.como(:PRO2);
select (public.agenda_crear_serie(
  :P2, :PRO2, :CA, :TT2, 'semanal', 2::smallint, time '12:00', 50::smallint,
  (:'domingo_marzo'::date - 12), 4::smallint, null
) ->> 'serie_id') as serie_id \gset m5m_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m5m_serie_id'::uuid \gset m5m_

select pg_temp.assert(
  array_length(:'m5m_citas'::uuid[], 1) = 4,
  'M.5 · fijación: la serie de martes de marzo materializa sus cuatro citas'
);

call pg_temp.como(:PRO2);
select public.agenda_editar_serie(
  (:'m5m_citas'::uuid[])[1], 'esta_y_siguientes',
  p_fecha => (:'domingo_marzo'::date - 10), p_hora_local => time '12:00', p_duracion_minutos => 60::smallint
)::text as r \gset m5m_
call pg_temp.reset_sesion();

select ((:'m5m_r')::jsonb ->> 'evento_id') as ev \gset m5m_

select pg_temp.assert(
  (select count(*) from public.propuestas_cita where evento_id = :'m5m_ev'::uuid) = 4
  and not exists (
    select 1 from public.propuestas_cita
     where evento_id = :'m5m_ev'::uuid
       and (extract(isodow from fecha_prevista) <> 4 or fin_propuesto - inicio_propuesto <> interval '60 minutes')
  ),
  'M.5 · Criterio 7a (marzo): las cuatro propuestas caen en jueves y duran 60 minutos'
);

select pg_temp.assert(
  (select count(distinct to_char(inicio_propuesto at time zone zona_horaria, 'HH24:MI'))
     from public.propuestas_cita where evento_id = :'m5m_ev'::uuid) = 1
  and (select min(to_char(inicio_propuesto at time zone zona_horaria, 'HH24:MI'))
     from public.propuestas_cita where evento_id = :'m5m_ev'::uuid) = '12:00',
  'M.5 · Criterio 7a (marzo): UNA sola hora local, las 12:00'
);

select pg_temp.assert(
  (select count(distinct extract(hour from inicio_propuesto at time zone 'UTC'))
     from public.propuestas_cita where evento_id = :'m5m_ev'::uuid) = 2,
  'M.5 · Criterio 7a (marzo): DOS horas UTC distintas, a un lado y otro del cambio'
);

-- =========================================================================
-- M.6 · Criterios 7b y 7c — hueco y solape al confirmar: anomalía horaria
-- =========================================================================

-- 7b · Marzo: las 02:30 del domingo del cambio no existen.
call pg_temp.como(:PRO2);
select (public.agenda_crear_serie(
  :P2, :PRO2, :CA, :TT2, 'semanal', 7::smallint, time '11:00', 50::smallint,
  (:'domingo_marzo'::date - 7), 3::smallint, null
) ->> 'serie_id') as serie_id \gset m6m_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m6m_serie_id'::uuid \gset m6m_

select pg_temp.assert(
  array_length(:'m6m_citas'::uuid[], 1) = 3,
  'M.6 · fijación: los tres domingos de marzo a las 11:00 se materializan'
);

call pg_temp.como(:PRO2);
select public.agenda_editar_serie(
  (:'m6m_citas'::uuid[])[1], 'esta_y_siguientes', p_hora_local => time '02:30'
)::text as r \gset m6m_
call pg_temp.reset_sesion();

select ((:'m6m_r')::jsonb ->> 'evento_id') as ev \gset m6m_

select id as hueco, inicio_propuesto as inicio from public.propuestas_cita
 where evento_id = :'m6m_ev'::uuid and cita_id = (:'m6m_citas'::uuid[])[2] \gset m6m_
select id as sig from public.propuestas_cita
 where evento_id = :'m6m_ev'::uuid and cita_id = (:'m6m_citas'::uuid[])[3] \gset m6m_

select pg_temp.assert(
  to_char(:'m6m_inicio'::timestamptz at time zone 'Europe/Madrid', 'HH24:MI') = '03:00'
  and (:'m6m_inicio'::timestamptz at time zone 'Europe/Madrid')::date = :'domingo_marzo'::date,
  'M.6 · Criterio 7b: la propuesta del domingo de marzo a las 02:30 cae a las 03:00 locales (el hueco se salta hacia delante)'
);

select pg_temp.assert(
  to_char((:'m6m_inicio'::timestamptz - interval '1 second') at time zone 'Europe/Madrid', 'HH24:MI:SS') = '01:59:59',
  'M.6 · Criterio 7b: un segundo antes se lee 01:59:59 — es el instante del salto'
);

call pg_temp.como(:PRO2);
select public.agenda_confirmar_propuesta(:'m6m_hueco'::uuid) as c \gset m6m_conf_
select public.agenda_confirmar_propuesta(:'m6m_sig'::uuid) as c \gset m6m_conf2_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select desviada and motivo_desviacion = 'anomalia_horaria'
     from public.citas where id = (:'m6m_citas'::uuid[])[2]),
  'M.6 · Criterio 7b: confirmada la del hueco, la cita queda desviada con motivo anomalia_horaria'
);

select pg_temp.assert(
  (select desviada = false and to_char(inicio at time zone zona_horaria, 'HH24:MI') = '02:30'
     from public.citas where id = (:'m6m_citas'::uuid[])[3]),
  'M.6 · Criterio 7b (GEMELA): la del domingo siguiente, sin hueco, se confirma a las 02:30 y NO queda desviada'
);

-- 7c · Octubre: las 02:30 del domingo del cambio ocurren dos veces.
call pg_temp.como(:PRO2);
select (public.agenda_crear_serie(
  :P2, :PRO2, :CA, :TT2, 'semanal', 7::smallint, time '11:00', 50::smallint,
  (:'domingo_octubre'::date - 7), 3::smallint, null
) ->> 'serie_id') as serie_id \gset m6o_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m6o_serie_id'::uuid \gset m6o_

select pg_temp.assert(
  array_length(:'m6o_citas'::uuid[], 1) = 3,
  'M.6 · fijación: los tres domingos de octubre a las 11:00 se materializan'
);

call pg_temp.como(:PRO2);
select public.agenda_editar_serie(
  (:'m6o_citas'::uuid[])[1], 'esta_y_siguientes', p_hora_local => time '02:30'
)::text as r \gset m6o_
call pg_temp.reset_sesion();

select ((:'m6o_r')::jsonb ->> 'evento_id') as ev \gset m6o_

select id as solape, inicio_propuesto as inicio from public.propuestas_cita
 where evento_id = :'m6o_ev'::uuid and cita_id = (:'m6o_citas'::uuid[])[2] \gset m6o_
select id as sig from public.propuestas_cita
 where evento_id = :'m6o_ev'::uuid and cita_id = (:'m6o_citas'::uuid[])[3] \gset m6o_

select pg_temp.assert(
  to_char(:'m6o_inicio'::timestamptz at time zone 'Europe/Madrid', 'HH24:MI') = '02:30'
  and to_char((:'m6o_inicio'::timestamptz + interval '1 hour') at time zone 'Europe/Madrid', 'HH24:MI') = '02:30',
  'M.6 · Criterio 7c: la propuesta del domingo de octubre lee 02:30 y una hora después TAMBIÉN — es la primera de las dos'
);

call pg_temp.como(:PRO2);
select public.agenda_confirmar_propuesta(:'m6o_solape'::uuid) as c \gset m6o_conf_
select public.agenda_confirmar_propuesta(:'m6o_sig'::uuid) as c \gset m6o_conf2_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select desviada and motivo_desviacion = 'anomalia_horaria'
     from public.citas where id = (:'m6o_citas'::uuid[])[2]),
  'M.6 · Criterio 7c: confirmada la del solape, la cita queda desviada con motivo anomalia_horaria'
);

select pg_temp.assert(
  (select desviada = false and to_char(inicio at time zone zona_horaria, 'HH24:MI') = '02:30'
     from public.citas where id = (:'m6o_citas'::uuid[])[3]),
  'M.6 · Criterio 7c (GEMELA): la del domingo siguiente, sin solape, se confirma a las 02:30 y NO queda desviada'
);

-- =========================================================================
-- M.7 · Criterio 8 — la ancla y las citas pasadas, en curso o tocadas
-- =========================================================================

-- S7 se inserta como postgres: es la única forma de tener, en la MISMA
-- serie, una cita pasada, una en curso, una desviada y una cancelada.
select extract(isodow from ((now() + interval '40 days') at time zone 'Europe/Madrid'))::int as dia \gset m7_

insert into public.series_cita
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
   dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
values
  (:S7, :P1, :PRO1, :CA, :TT2, 'semanal', :m7_dia, time '09:00', 'Europe/Madrid', 50, 7, :PRO1);

insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id, inicio, fin, zona_horaria,
   estado, desviada, motivo_desviacion)
values
  (:C7PAS, :P1, :PRO1, :CA, :TT2, :S7, now() - interval '7 days',    now() - interval '7 days' + interval '50 minutes', 'Europe/Madrid', 'programada', false, null),
  (:C7CUR, :P1, :PRO1, :CA, :TT2, :S7, now() - interval '10 minutes', now() + interval '40 minutes',                    'Europe/Madrid', 'programada', false, null),
  (:C7N1,  :P1, :PRO1, :CA, :TT2, :S7, now() + interval '40 days',   now() + interval '40 days' + interval '50 minutes', 'Europe/Madrid', 'programada', false, null),
  (:C7DES, :P1, :PRO1, :CA, :TT2, :S7, now() + interval '47 days',   now() + interval '47 days' + interval '50 minutes', 'Europe/Madrid', 'programada', true, 'reprogramada'),
  (:C7N2,  :P1, :PRO1, :CA, :TT2, :S7, now() + interval '54 days',   now() + interval '54 days' + interval '50 minutes', 'Europe/Madrid', 'programada', false, null),
  (:C7CAN, :P1, :PRO1, :CA, :TT2, :S7, now() + interval '61 days',   now() + interval '61 days' + interval '50 minutes', 'Europe/Madrid', 'cancelada',  false, null),
  (:C7N3,  :P1, :PRO1, :CA, :TT2, :S7, now() + interval '68 days',   now() + interval '68 days' + interval '50 minutes', 'Europe/Madrid', 'programada', false, null);

-- 8a · NEGATIVAS: ninguna de las cuatro vale como ancla.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_editar_serie(%L::uuid, 'esta_y_siguientes', p_hora_local => time '18:00')$q$, :C7PAS),
  '22023', 'ya ha empezado o ha pasado',
  'M.7 · Criterio 8a: una cita PASADA no vale como ancla'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_editar_serie(%L::uuid, 'esta_y_siguientes', p_hora_local => time '18:00')$q$, :C7CUR),
  '22023', 'ya ha empezado o ha pasado',
  'M.7 · Criterio 8a: una cita EN CURSO no vale como ancla'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_editar_serie(%L::uuid, 'esta_y_siguientes', p_hora_local => time '18:00')$q$, :C7DES),
  '22023', 'se movió a mano',
  'M.7 · Criterio 8a: una cita DESVIADA no vale como ancla — la serie ya no la gobierna'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_editar_serie(%L::uuid, 'esta_y_siguientes', p_hora_local => time '18:00')$q$, :C7CAN),
  '22023', 'cancelada o cerrada',
  'M.7 · Criterio 8a: una cita CANCELADA no vale como ancla'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.eventos_salientes where carga ->> 'serie_id' = :S7) = 0
  and (select count(*) from public.propuestas_cita where serie_id = :S7) = 0
  and (select dia_semana = :m7_dia and hora_local = time '09:00' from public.series_cita where id = :S7),
  'M.7 · Criterio 8a: tras las cuatro negativas, S7 no tiene eventos ni propuestas y su regla sigue igual'
);

-- 8b · GEMELA: la primera futura normal SÍ vale; pasadas y en curso no se tocan.
create temp table m7_antes as
  select id, inicio, fin, zona_horaria, estado, desviada, motivo_desviacion, serie_id
    from public.citas where id in (:C7PAS, :C7CUR);

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(:C7N1, 'esta_y_siguientes', p_hora_local => time '18:00')::text as r \gset m7_
call pg_temp.reset_sesion();

select ((:'m7_r')::jsonb ->> 'evento_id') as ev \gset m7_

select pg_temp.assert(
  (select carga -> 'citas_afectadas' from public.eventos_salientes where id = :'m7_ev'::uuid)
  = jsonb_build_array((:C7N1)::uuid, (:C7N2)::uuid, (:C7N3)::uuid),
  'M.7 · Criterio 8b: citas_afectadas son EXACTAMENTE las tres futuras normales — ni la pasada, ni la en curso, ni la desviada, ni la cancelada'
);

select pg_temp.assert(
  not exists (
    select * from m7_antes
    except
    select id, inicio, fin, zona_horaria, estado, desviada, motivo_desviacion, serie_id
      from public.citas where id in (:C7PAS, :C7CUR)
  )
  and not exists (
    select id, inicio, fin, zona_horaria, estado, desviada, motivo_desviacion, serie_id
      from public.citas where id in (:C7PAS, :C7CUR)
    except
    select * from m7_antes
  )
  and (select count(*) from m7_antes) = 2
  and not exists (select 1 from public.propuestas_cita where cita_id in (:C7PAS, :C7CUR)),
  'M.7 · Criterio 8b: la pasada y la en curso siguen idénticas y sin propuesta'
);

select id as pn1 from public.propuestas_cita where evento_id = :'m7_ev'::uuid and cita_id = :C7N1 \gset m7_
select id as pn2 from public.propuestas_cita where evento_id = :'m7_ev'::uuid and cita_id = :C7N2 \gset m7_
select id as pn3 from public.propuestas_cita where evento_id = :'m7_ev'::uuid and cita_id = :C7N3 \gset m7_

-- 8c · Lo que cambia ENTRE la propuesta y la confirmación.
-- La cita en curso se cancela antes: libera su rango para (iii), que coloca
-- N3 encima de ese mismo tramo («empezó entre medias»).
update public.citas set estado = 'cancelada' where id = :C7CUR;

-- (i) N1 se desplaza a mano, por la función de la agenda, como PRO1.
call pg_temp.como(:PRO1);
select public.agenda_actualizar_cita(
  :C7N1,
  p_inicio => (select inicio + interval '1 hour' from public.citas where id = :C7N1),
  p_fin    => (select fin    + interval '1 hour' from public.citas where id = :C7N1)
) as ok \gset m7_i_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select desviada and motivo_desviacion = 'reprogramada' from public.citas where id = :C7N1),
  'M.7 · Criterio 8c (i): desplazada a mano, N1 queda desviada'
);

-- (ii) N2 se cancela; (iii) N3 pasa a estar en curso. Como postgres: el
-- tiempo no deja fabricarlo de otra forma.
update public.citas set estado = 'cancelada' where id = :C7N2;
update public.citas set inicio = now() - interval '5 minutes', fin = now() + interval '45 minutes' where id = :C7N3;

create temp table m7_c8 as
  select id, inicio, fin, zona_horaria, estado from public.citas where id in (:C7N1, :C7N2, :C7N3);

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m7_pn1'),
  '22023', 'se movió a mano',
  'M.7 · Criterio 8c (i): la propuesta de una cita desviada después de proponerla no se confirma'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m7_pn2'),
  '22023', 'cancelada o cerrada',
  'M.7 · Criterio 8c (ii): la propuesta de una cita cancelada después de proponerla no se confirma'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m7_pn3'),
  '22023', 'ya ha empezado o ha pasado',
  'M.7 · Criterio 8c (iii): la propuesta de una cita que empezó entre medias no se confirma'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  not exists (
    select * from m7_c8
    except
    select id, inicio, fin, zona_horaria, estado from public.citas where id in (:C7N1, :C7N2, :C7N3)
  )
  and not exists (
    select id, inicio, fin, zona_horaria, estado from public.citas where id in (:C7N1, :C7N2, :C7N3)
    except
    select * from m7_c8
  )
  and (select count(*) from m7_c8) = 3
  and (select count(*) from public.propuestas_cita
        where id in (:'m7_pn1'::uuid, :'m7_pn2'::uuid, :'m7_pn3'::uuid) and estado = 'pendiente') = 3,
  'M.7 · Criterio 8c: las tres citas siguen idénticas (inicio, fin, zona, estado) y sus propuestas, pendientes'
);

-- =========================================================================
-- M.8 · Criterio 9 — propuestas viejas: otra regla, frescura, pasado, sin evento
-- =========================================================================

-- 9a · Dos ediciones seguidas desde la misma ancla (16:00 y luego 17:00).
call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, (:'base_m'::date + 280), 3::smallint, null
) ->> 'serie_id') as serie_id \gset m8_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m8_serie_id'::uuid \gset m8_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie((:'m8_citas'::uuid[])[1], 'esta_y_siguientes', p_hora_local => time '16:00')::text as r1 \gset m8_
select public.agenda_editar_serie((:'m8_citas'::uuid[])[1], 'esta_y_siguientes', p_hora_local => time '17:00')::text as r2 \gset m8_
call pg_temp.reset_sesion();

select id as e1c1 from public.propuestas_cita
 where evento_id = ((:'m8_r1')::jsonb ->> 'evento_id')::uuid and cita_id = (:'m8_citas'::uuid[])[1] \gset m8_
select id as e2c1 from public.propuestas_cita
 where evento_id = ((:'m8_r2')::jsonb ->> 'evento_id')::uuid and cita_id = (:'m8_citas'::uuid[])[1] \gset m8_
select id as e2c2 from public.propuestas_cita
 where evento_id = ((:'m8_r2')::jsonb ->> 'evento_id')::uuid and cita_id = (:'m8_citas'::uuid[])[2] \gset m8_

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m8_e1c1'),
  '22023', 'otra regla',
  'M.8 · Criterio 9a: la propuesta de las 16:00 no se confirma con la serie ya a las 17:00'
);
select public.agenda_confirmar_propuesta(:'m8_e2c1'::uuid) as c \gset m8_conf_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select to_char(inicio at time zone zona_horaria, 'HH24:MI') = '17:00' and desviada = false
     from public.citas where id = (:'m8_citas'::uuid[])[1]),
  'M.8 · Criterio 9a (GEMELA): la del segundo evento SÍ se confirma y la cita queda a las 17:00'
);

-- Guarda de horario pasado: el tiempo no deja fabricar una propuesta que
-- caduque entre medias, así que se envejece a mano como postgres.
update public.propuestas_cita set inicio_propuesto = now() - interval '1 minute' where id = :'m8_e2c2'::uuid;

-- Guarda de «sin evento»: una propuesta con cita y sin evento no la crea
-- ninguna función; se inserta como postgres (propuestas_cita_cuelga_ck la
-- admite porque cuelga de la serie).
insert into public.propuestas_cita
  (serie_id, cita_id, evento_id, paciente_id, profesional_id, centro_id, motivo,
   fecha_prevista, hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
select c.serie_id, c.id, null, c.paciente_id, c.profesional_id, c.centro_id, 'regla_cambiada',
       (c.inicio at time zone c.zona_horaria)::date, time '17:00',
       c.inicio + interval '8 hours', c.fin + interval '8 hours', c.zona_horaria, :PRO1
  from public.citas c where c.id = (:'m8_citas'::uuid[])[3]
returning id as sinev \gset m8_

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m8_e2c2'),
  '22023', 'quedado en el pasado',
  'M.8 · Criterio 9: una propuesta cuyo horario ya pasó no se confirma'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m8_sinev'),
  '22023', 'sin evento',
  'M.8 · Criterio 9: una propuesta con cita y sin evento no se confirma'
);
call pg_temp.reset_sesion();

-- 9b · Frescura: dos desplazamientos puros desde la misma ancla. Serie de
-- UNA sesión: con más, la ancla movida a +14 chocaría con la tercera.
call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, (:'base_m'::date + 350), 1::smallint, null
) ->> 'serie_id') as serie_id \gset m8b_
call pg_temp.reset_sesion();

select id as c1, ((inicio at time zone zona_horaria)::date)::text as d
  from public.citas where serie_id = :'m8b_serie_id'::uuid \gset m8b_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(:'m8b_c1'::uuid, 'esta_y_siguientes', p_fecha => :'m8b_d'::date + 7)::text as ra \gset m8b_
select public.agenda_editar_serie(:'m8b_c1'::uuid, 'esta_y_siguientes', p_fecha => :'m8b_d'::date + 14)::text as rb \gset m8b_
call pg_temp.reset_sesion();

select id as pa from public.propuestas_cita
 where evento_id = ((:'m8b_ra')::jsonb ->> 'evento_id')::uuid and cita_id = :'m8b_c1'::uuid \gset m8b_
select id as pb from public.propuestas_cita
 where evento_id = ((:'m8b_rb')::jsonb ->> 'evento_id')::uuid and cita_id = :'m8b_c1'::uuid \gset m8b_

call pg_temp.como(:PRO1);
select public.agenda_confirmar_propuesta(:'m8b_pb'::uuid) as c \gset m8b_conf_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select (inicio at time zone zona_horaria)::date = :'m8b_d'::date + 14 and desviada = false
     from public.citas where id = :'m8b_c1'::uuid),
  'M.8 · Criterio 9b (GEMELA): la propuesta de B se confirma y la cita queda a +14, sin desviar'
);

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m8b_pa'),
  '22023', 'La cita cambió',
  'M.8 · Criterio 9b: la de A, recalculada desde la cita ya movida (caería en +21, no en +7), se rechaza por frescura'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- M.9 · Criterio 10 — cambio de zona del centro
-- =========================================================================

insert into public.centros (id, nombre, zona_horaria) values (:CT, 'Centro T-011b', 'Europe/Madrid');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :PRO9, 'authenticated', 'authenticated', 'pro9@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional Nueve","centro_id":"' || :CT || '"}')::jsonb,
   '', '', '', '');

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id)
values (:P9, 'Nora', 'Nueve', :PRO9, :CT);

-- 10a · Madrid → Tokio: el instante recalculado cae en el pasado.
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C9A, :P9, :PRO9, :CT, :TT2, now() + interval '30 minutes', now() + interval '80 minutes', 'Europe/Madrid');

update public.centros set zona_horaria = 'Asia/Tokyo' where id = :CT;

select id as ev from public.eventos_salientes
 where tipo = 'agenda.zona_centro_cambiada' and carga ->> 'centro_id' = :CT
   and carga ->> 'zona_horaria_nueva' = 'Asia/Tokyo' \gset m9a_

call pg_temp.como(:PRO9);
select public.agenda_propuestas_de_evento(:'m9a_ev'::uuid)::text as r \gset m9a_
call pg_temp.reset_sesion();

select id as p, inicio_propuesto is null as sin_hora from public.propuestas_cita
 where evento_id = :'m9a_ev'::uuid and cita_id = :C9A \gset m9a_

select pg_temp.assert(
  :'m9a_sin_hora'::boolean,
  'M.9 · Criterio 10a: con Tokio, la hora de pared de la cita ya pasó: la propuesta queda SIN horario, no se omite'
);

call pg_temp.como(:PRO9);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m9a_p'),
  '22023', 'no tiene horario',
  'M.9 · Criterio 10a: una propuesta sin horario no se confirma'
);
call pg_temp.reset_sesion();

update public.centros set zona_horaria = 'Europe/Madrid' where id = :CT;

-- 10b · Madrid → Canarias y la cita se mueve antes de confirmar: frescura.
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C9B, :P9, :PRO9, :CT, :TT2, now() + interval '5 days', now() + interval '5 days' + interval '50 minutes', 'Europe/Madrid');

update public.centros set zona_horaria = 'Atlantic/Canary' where id = :CT;

select id as ev from public.eventos_salientes
 where tipo = 'agenda.zona_centro_cambiada' and carga ->> 'centro_id' = :CT
   and carga ->> 'zona_horaria_nueva' = 'Atlantic/Canary' \gset m9b_

call pg_temp.como(:PRO9);
select public.agenda_propuestas_de_evento(:'m9b_ev'::uuid)::text as r \gset m9b_
select public.agenda_actualizar_cita(
  :C9B,
  p_inicio => (select inicio + interval '1 hour' from public.citas where id = :C9B),
  p_fin    => (select fin    + interval '1 hour' from public.citas where id = :C9B)
) as ok \gset m9b_
call pg_temp.reset_sesion();

select id as p from public.propuestas_cita where evento_id = :'m9b_ev'::uuid and cita_id = :C9B \gset m9b_
select inicio, zona_horaria from public.citas where id = :C9B \gset m9b_antes_

call pg_temp.como(:PRO9);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m9b_p'),
  '22023', 'La cita cambió',
  'M.9 · Criterio 10b: la cita se movió después de proponer el cambio de zona: se rechaza por frescura'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select inicio = :'m9b_antes_inicio'::timestamptz and zona_horaria = :'m9b_antes_zona_horaria'
     from public.citas where id = :C9B),
  'M.9 · Criterio 10b: la cita sigue donde la dejó el desplazamiento a mano'
);

update public.centros set zona_horaria = 'Europe/Madrid' where id = :CT;

-- 10c · Madrid → Canarias (P1) y luego → Lisboa (P2): P1 quedó obsoleta.
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:C9C, :P9, :PRO9, :CT, :TT2, now() + interval '6 days', now() + interval '6 days' + interval '50 minutes', 'Europe/Madrid');

insert into public.series_cita
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
   dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
values
  (:S9, :P9, :PRO9, :CT, :TT2, 'semanal',
   extract(isodow from ((now() + interval '8 days') at time zone 'Europe/Madrid'))::smallint,
   time '10:00', 'Europe/Madrid', 50, 1, :PRO9);

insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id, inicio, fin, zona_horaria, desviada, motivo_desviacion)
values
  (:C9D, :P9, :PRO9, :CT, :TT2, :S9, now() + interval '8 days', now() + interval '8 days' + interval '50 minutes',
   'Europe/Madrid', true, 'reprogramada');

update public.centros set zona_horaria = 'Atlantic/Canary' where id = :CT;

select id as ev1 from public.eventos_salientes
 where tipo = 'agenda.zona_centro_cambiada' and carga ->> 'centro_id' = :CT
   and carga ->> 'zona_horaria_nueva' = 'Atlantic/Canary'
   and carga -> 'citas_afectadas' ? :C9C \gset m9c_

call pg_temp.como(:PRO9);
select public.agenda_propuestas_de_evento(:'m9c_ev1'::uuid)::text as r1 \gset m9c_
call pg_temp.reset_sesion();

update public.centros set zona_horaria = 'Europe/Lisbon' where id = :CT;

select id as ev2 from public.eventos_salientes
 where tipo = 'agenda.zona_centro_cambiada' and carga ->> 'centro_id' = :CT
   and carga ->> 'zona_horaria_nueva' = 'Europe/Lisbon' \gset m9c_

call pg_temp.como(:PRO9);
select public.agenda_propuestas_de_evento(:'m9c_ev2'::uuid)::text as r2 \gset m9c_
call pg_temp.reset_sesion();

select id as p1 from public.propuestas_cita where evento_id = :'m9c_ev1'::uuid and cita_id = :C9C \gset m9c_
select id as p2 from public.propuestas_cita where evento_id = :'m9c_ev2'::uuid and cita_id = :C9C \gset m9c_
select id as pd from public.propuestas_cita where evento_id = :'m9c_ev2'::uuid and cita_id = :C9D \gset m9c_
select to_char(inicio at time zone zona_horaria, 'YYYY-MM-DD HH24:MI') as pared from public.citas where id = :C9C \gset m9c_

call pg_temp.como(:PRO9);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_confirmar_propuesta(%L::uuid)$q$, :'m9c_p1'),
  '22023', 'otra zona',
  'M.9 · Criterio 10c: la propuesta a Canarias no se confirma con el centro ya en Lisboa'
);

-- 10d · GEMELAS.
select public.agenda_confirmar_propuesta(:'m9c_p2'::uuid) as c \gset m9d_
select public.agenda_confirmar_propuesta(:'m9c_pd'::uuid) as c \gset m9d_d_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select zona_horaria = 'Europe/Lisbon'
          and to_char(inicio at time zone zona_horaria, 'YYYY-MM-DD HH24:MI') = :'m9c_pared'
     from public.citas where id = :C9C),
  'M.9 · Criterio 10d (GEMELA): la propuesta a Lisboa SÍ se confirma: la cita pasa a Lisboa con su misma hora de pared'
);

select pg_temp.assert(
  (select zona_horaria = 'Europe/Lisbon' and desviada and motivo_desviacion = 'reprogramada'
     from public.citas where id = :C9D),
  'M.9 · Criterio 10d: la cita de serie DESVIADA se confirma al cambio de zona y conserva desviada y su motivo'
);

-- =========================================================================
-- M.10 · Criterio 11 — el UPDATE directo sobre series_cita ya no entra
-- =========================================================================

-- (a) Como el profesional: 42501 por el privilegio.
call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 3::smallint, time '09:00', 50::smallint, (:'base_m'::date + 420), 3::smallint, null
) ->> 'serie_id') as serie_id \gset m10a_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m10a_serie_id'::uuid \gset m10a_
select to_jsonb(s)::text as fila from public.series_cita s where id = :'m10a_serie_id'::uuid \gset m10a_

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$update public.series_cita set dia_semana = 5 where id = %L$q$, :'m10a_serie_id'),
  '42501', 'permission denied for table series_cita',
  'M.10 · Criterio 11a: el profesional NO puede cambiar la regla con un UPDATE directo'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select to_jsonb(s) from public.series_cita s where id = :'m10a_serie_id'::uuid) = (:'m10a_fila')::jsonb
  and (select dia_semana from public.series_cita where id = :'m10a_serie_id'::uuid) = 3
  and (select count(*) from public.eventos_salientes where carga ->> 'serie_id' = :'m10a_serie_id') = 0,
  'M.10 · Criterio 11a: la fila sigue idéntica (dia_semana = 3) y la serie no tiene eventos'
);

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m10a_citas'::uuid[])[1], 'esta_y_siguientes', p_dia_semana => 5::smallint
)::text as r \gset m10a_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select dia_semana from public.series_cita where id = :'m10a_serie_id'::uuid) = 5
  and (select count(*) from public.eventos_salientes where carga ->> 'serie_id' = :'m10a_serie_id') = 1
  and (select count(*) from public.propuestas_cita
        where evento_id = ((:'m10a_r')::jsonb ->> 'evento_id')::uuid) = 3,
  'M.10 · Criterio 11a (GEMELA): el mismo cambio por agenda_editar_serie SÍ entra: un evento y una propuesta por cita'
);

select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.series_cita', 'update')
  and not has_table_privilege('authenticated', 'public.series_cita', 'insert')
  and has_table_privilege('authenticated', 'public.series_cita', 'select'),
  'M.10 · Criterio 11a: authenticated no tiene UPDATE ni INSERT sobre series_cita, y SÍ SELECT'
);

-- (b) El camino sin ancla (UPDATE del dueño de la tabla) sigue igual.
call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 3::smallint, time '09:00', 50::smallint, (:'base_m'::date + 490), 3::smallint, null
) ->> 'serie_id') as serie_id \gset m10b_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m10b_serie_id'::uuid \gset m10b_

update public.series_cita set dia_semana = 5 where id = :'m10b_serie_id'::uuid;

select id as ev from public.eventos_salientes
 where tipo = 'agenda.regla_serie_cambiada' and carga ->> 'serie_id' = :'m10b_serie_id' \gset m10b_

select pg_temp.assert(
  (select carga -> 'citas_afectadas' from public.eventos_salientes where id = :'m10b_ev'::uuid)
  = to_jsonb(:'m10b_citas'::uuid[])
  and (select carga -> 'fecha_origen' = 'null'::jsonb and carga -> 'desde_cita_id' = 'null'::jsonb
         from public.eventos_salientes where id = :'m10b_ev'::uuid),
  'M.10 · Criterio 11b: sin ancla, el evento lleva TODAS las futuras no desviadas y fecha_origen nula'
);

call pg_temp.como(:PRO1);
select public.agenda_propuestas_de_evento(:'m10b_ev'::uuid)::text as r \gset m10b_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.propuestas_cita where evento_id = :'m10b_ev'::uuid) = 3
  and not exists (
    select 1
      from public.propuestas_cita p
      join public.citas c on c.id = p.cita_id
     where p.evento_id = :'m10b_ev'::uuid
       and p.fecha_prevista <> (c.inicio at time zone c.zona_horaria)::date + 2
  ),
  'M.10 · Criterio 11b: cada propuesta cae en el viernes de SU semana'
);

-- =========================================================================
-- M.11 · Criterio 12 — mensual: la ancla fija mes y ordinal; función pura
-- =========================================================================

select pg_temp.m_enesimo(:'base_m'::date + 560, 2, 2)::text as desde \gset m11_

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'mensual', 2::smallint, time '09:00', 50::smallint, :'m11_desde'::date, 4::smallint, null
) ->> 'serie_id') as serie_id \gset m11_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m11_serie_id'::uuid \gset m11_
select ((inicio at time zone zona_horaria)::date)::text as f2
  from public.citas where id = (:'m11_citas'::uuid[])[2] \gset m11_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m11_citas'::uuid[])[2], 'esta_y_siguientes', p_fecha => pg_temp.m_enesimo(:'m11_f2'::date, 4, 3)
)::text as r \gset m11_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select array_agg(cita_id order by fecha_prevista) from public.propuestas_cita
    where evento_id = ((:'m11_r')::jsonb ->> 'evento_id')::uuid)
  = (:'m11_citas'::uuid[])[2:4]
  and not exists (
    select 1
      from public.propuestas_cita p
      join public.citas c on c.id = p.cita_id
     where p.evento_id = ((:'m11_r')::jsonb ->> 'evento_id')::uuid
       and p.fecha_prevista <> pg_temp.m_enesimo((c.inicio at time zone c.zona_horaria)::date, 4, 3)
  ),
  'M.11 · Criterio 12: de la 2.ª a la 4.ª, cada propuesta es el 3.er jueves de SU mes'
);

-- Un 5.º martes de un mes SIN 5.º jueves: así el jueves es un recorte de verdad.
select d::date::text as martes5
  from generate_series(:'base_m'::date::timestamp, (:'base_m'::date + 800)::timestamp, interval '1 day') d
 where extract(isodow from d) = 2 and extract(day from d) >= 29
   and extract(day from pg_temp.m_ultimo(d::date, 4)) < 29
 order by d limit 1 \gset m11_

select pg_temp.assert(
  public.fecha_en_regla_nueva('mensual', :'m11_martes5'::date, 4::smallint)
  = pg_temp.m_ultimo(:'m11_martes5'::date, 4),
  'M.11 · Criterio 12: fecha_en_regla_nueva(mensual, 5.º martes, jueves) es el ÚLTIMO jueves de ese mes (recorte)'
);

select pg_temp.assert(
  public.fecha_en_regla_nueva('semanal', :'base_m'::date, 3::smallint, :'base_m'::date, :'base_m'::date + 9)
  = pg_temp.m_lunes(:'base_m'::date) + 7 + 2,
  'M.11 · Criterio 12: fecha_en_regla_nueva(semanal, d, miércoles, d, d + 9) = lunes(d) + 7 + 2'
);

-- =========================================================================
-- M.12 · Criterio 13 — firmas y permisos de las funciones
-- =========================================================================

select pg_temp.assert(
  has_function_privilege('authenticated',
    'public.agenda_editar_serie(uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz, smallint, time, smallint, text, date)',
    'execute')
  and not has_function_privilege('anon',
    'public.agenda_editar_serie(uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz, smallint, time, smallint, text, date)',
    'execute'),
  'M.12 · Criterio 13: agenda_editar_serie de 11 argumentos: authenticated SÍ, anon NO'
);

select pg_temp.assert(
  to_regprocedure('public.agenda_editar_serie(uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz, smallint, time, smallint, text)') is null,
  'M.12 · Criterio 13: la firma de 10 argumentos ya no existe (sin sobrecarga ambigua)'
);

select pg_temp.assert(
  not has_function_privilege('anon', 'public.calcular_propuesta_de_evento(text, jsonb, public.citas)', 'execute')
  and not has_function_privilege('authenticated', 'public.calcular_propuesta_de_evento(text, jsonb, public.citas)', 'execute')
  and not has_function_privilege('anon', 'public.citas_afectadas_por_regla(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.citas_afectadas_por_regla(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.plan_edicion_serie(public.citas, public.series_cita, date, smallint, time, smallint, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.plan_edicion_serie(public.citas, public.series_cita, date, smallint, time, smallint, text)', 'execute'),
  'M.12 · Criterio 13: los tres ayudantes internos no se ejecutan ni como anon ni como authenticated'
);

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text)', 'execute')
  and not has_function_privilege('anon', 'public.agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text)', 'execute'),
  'M.12 · Criterio 13: agenda_previsualizar_edicion_serie: authenticated SÍ, anon NO'
);

-- =========================================================================
-- M.13 · Criterio 16 — la previsualización
-- =========================================================================

-- mes5: el primer mes de febrero a diciembre del año que viene con cinco
-- jueves (el anterior es futuro, y dos meses seguidos nunca tienen cinco).
select min(m)::date::text as mes5
  from generate_series(make_date(:anio_test, 2, 1)::timestamp, make_date(:anio_test, 12, 1)::timestamp, interval '1 month') m
 where extract(day from pg_temp.m_ultimo(m::date, 4)) >= 29 \gset m13_

-- Desde el 2.º martes del mes anterior (el diseño dice «desde el día 1»,
-- que daría el 1.er martes y contradice «serie del 2.º martes»: se sigue lo
-- segundo, que es la propiedad que se prueba).
select pg_temp.m_enesimo((:'m13_mes5'::date - interval '1 month')::date, 2, 2)::text as desde,
       pg_temp.m_enesimo(:'m13_mes5'::date, 4, 5)::text as jueves5 \gset m13_

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'mensual', 2::smallint, time '07:15', 50::smallint, :'m13_desde'::date, 4::smallint, null
) ->> 'serie_id') as serie_id \gset m13_
call pg_temp.reset_sesion();

select array_agg(id order by inicio)::text as citas
  from public.citas where serie_id = :'m13_serie_id'::uuid \gset m13_
select (:'m13_citas'::uuid[])[2]::text as cmes5 \gset m13_

select pg_temp.assert(
  array_length(:'m13_citas'::uuid[], 1) = 4
  and (select date_trunc('month', (inicio at time zone zona_horaria))::date
         from public.citas where id = :'m13_cmes5'::uuid) = :'m13_mes5'::date,
  'M.13 · fijación: cuatro citas mensuales y la 2.ª cae en mes5'
);

-- (c) Solo lectura: foto ANTES.
create temp table m13_antes as
select (select count(*) from public.eventos_salientes) as eventos,
       (select count(*) from public.propuestas_cita) as propuestas,
       (select to_jsonb(s) from public.series_cita s where id = :'m13_serie_id'::uuid) as serie,
       current_setting('app.agenda_regla_ancla', true) as ancla,
       current_setting('app.agenda_evento_regla', true) as evento;

-- (a) Mensual con recorte.
call pg_temp.como(:PRO1);
select public.agenda_previsualizar_edicion_serie(:'m13_cmes5'::uuid, p_fecha => :'m13_jueves5'::date)::text as pv \gset m13_
call pg_temp.reset_sesion();

-- (c) Solo lectura: foto DESPUÉS.
select pg_temp.assert(
  (select eventos from m13_antes) = (select count(*) from public.eventos_salientes)
  and (select propuestas from m13_antes) = (select count(*) from public.propuestas_cita)
  and (select serie from m13_antes) = (select to_jsonb(s) from public.series_cita s where id = :'m13_serie_id'::uuid)
  and (select ancla from m13_antes) is not distinct from current_setting('app.agenda_regla_ancla', true)
  and (select evento from m13_antes) is not distinct from current_setting('app.agenda_evento_regla', true),
  'M.13 · Criterio 16c: previsualizar no escribe nada — ni eventos, ni propuestas, ni la serie, ni los GUC del ancla'
);

select pg_temp.assert(
  (:'m13_pv')::jsonb -> 'regla' ->> 'ordinal' = '5'
  and ((:'m13_pv')::jsonb -> 'regla' ->> 'ultimo')::boolean
  and ((:'m13_pv')::jsonb -> 'regla' ->> 'recorte')::boolean
  and ((:'m13_pv')::jsonb ->> 'cambia')::boolean
  and (:'m13_pv')::jsonb -> 'regla' ->> 'dia_semana' = '4',
  'M.13 · Criterio 16a: regla con ordinal 5, «último», con recorte, cambia, y en jueves'
);

select pg_temp.assert(
  (select array_agg((e ->> 'cita_id')::uuid order by n)
     from jsonb_array_elements((:'m13_pv')::jsonb -> 'citas') with ordinality as t(e, n))
  = (:'m13_citas'::uuid[])[2:4],
  'M.13 · Criterio 16a: citas son la de mes5 y las dos siguientes, en orden'
);

select pg_temp.assert(
  not exists (
    select 1
      from jsonb_array_elements((:'m13_pv')::jsonb -> 'citas') e
      join public.citas c on c.id = (e ->> 'cita_id')::uuid
     where (e ->> 'fecha_actual')::date <> (c.inicio at time zone c.zona_horaria)::date
        or (e ->> 'fecha_nueva')::date <> pg_temp.m_ultimo((e ->> 'fecha_actual')::date, 4)
  ),
  'M.13 · Criterio 16a: cada fecha_nueva es el ÚLTIMO jueves de su mes'
);

select pg_temp.assert(
  ((:'m13_pv')::jsonb -> 'citas' -> 0 ->> 'fecha_nueva')::date = :'m13_jueves5'::date
  and not ((:'m13_pv')::jsonb -> 'citas' -> 0 ->> 'recortada')::boolean,
  'M.13 · Criterio 16a: la de mes5 es p_fecha y NO está recortada'
);

select pg_temp.assert(
  ((:'m13_pv')::jsonb -> 'citas' -> 1 ->> 'recortada')::boolean
  and ((:'m13_pv')::jsonb -> 'citas' -> 1 ->> 'fecha_nueva')::date
      = pg_temp.m_enesimo(((:'m13_pv')::jsonb -> 'citas' -> 1 ->> 'fecha_actual')::date, 4, 4),
  'M.13 · Criterio 16a: la de mes5 + 1 está recortada y cae en su 4.º jueves'
);

select pg_temp.assert(
  ((:'m13_pv')::jsonb -> 'citas' -> 2 ->> 'recortada')::boolean
  = (extract(day from pg_temp.m_ultimo(((:'m13_pv')::jsonb -> 'citas' -> 2 ->> 'fecha_actual')::date, 4)) < 29),
  'M.13 · Criterio 16a: la de mes5 + 2 está recortada si y solo si su mes no tiene quinto jueves'
);

-- (b) Semanal, sobre la serie de M.1.
select ((inicio at time zone zona_horaria)::date)::text as f3
  from public.citas where id = (:'m1_citas'::uuid[])[3] \gset m13b_

call pg_temp.como(:PRO1);
select public.agenda_previsualizar_edicion_serie((:'m1_citas'::uuid[])[3], p_fecha => :'m13b_f3'::date + 2)::text as pv \gset m13b_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (:'m13b_pv')::jsonb -> 'regla' -> 'ordinal' = 'null'::jsonb
  and not ((:'m13b_pv')::jsonb -> 'regla' ->> 'ultimo')::boolean
  and not ((:'m13b_pv')::jsonb -> 'regla' ->> 'recorte')::boolean
  and jsonb_array_length((:'m13b_pv')::jsonb -> 'citas') = 4
  and not exists (
    select 1 from jsonb_array_elements((:'m13b_pv')::jsonb -> 'citas') e
     where (e ->> 'recortada')::boolean
  ),
  'M.13 · Criterio 16b: semanal: sin ordinal, ni «último» ni recorte, y ninguna cita recortada'
);

-- (e) Sin cambio.
call pg_temp.como(:PRO1);
select public.agenda_previsualizar_edicion_serie(:'m13_cmes5'::uuid)::text as pv \gset m13e_
call pg_temp.reset_sesion();

select pg_temp.assert(
  not ((:'m13e_pv')::jsonb ->> 'cambia')::boolean
  and (:'m13e_pv')::jsonb -> 'citas' = '[]'::jsonb,
  'M.13 · Criterio 16e: sin argumentos de regla, cambia = false y citas vacía'
);

-- (f) Negativas.
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_previsualizar_edicion_serie(%L::uuid, p_fecha => %L::date)$q$, :'m13_cmes5', :'m13_jueves5'),
  '42501', 'no es tuya',
  'M.13 · Criterio 16f: PRO2 no previsualiza una cita de PRO1'
);
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_previsualizar_edicion_serie(%L::uuid, p_hora_local => time '18:00')$q$, :C7DES),
  '22023', 'se movió a mano',
  'M.13 · Criterio 16f: sobre una cita desviada, la previsualización se niega igual que la edición'
);
select pg_temp.assert_lanza_codigo_msg(
  format($q$select public.agenda_previsualizar_edicion_serie(%L::uuid, p_fecha => %L::date, p_dia_semana => 2::smallint)$q$,
         :'m13_cmes5', :'m13_jueves5'),
  '22023', 'no coinciden',
  'M.13 · Criterio 16f: p_fecha en jueves con p_dia_semana martes se rechaza'
);
call pg_temp.reset_sesion();

-- (d) Una sola fuente: lo que enseña es lo que produce la edición.
create temp table m13_prev as
select (e ->> 'cita_id')::uuid as cita_id,
       (e ->> 'fecha_nueva')::date as fecha,
       (e ->> 'inicio')::timestamptz as inicio,
       (e ->> 'fin')::timestamptz as fin
  from jsonb_array_elements((:'m13_pv')::jsonb -> 'citas') e;

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(:'m13_cmes5'::uuid, 'esta_y_siguientes', p_fecha => :'m13_jueves5'::date)::text as r \gset m13d_
call pg_temp.reset_sesion();

select ((:'m13d_r')::jsonb ->> 'evento_id') as ev \gset m13d_

select pg_temp.assert(
  not exists (
    select cita_id, fecha, inicio, fin from m13_prev
    except
    select cita_id, fecha_prevista, inicio_propuesto, fin_propuesto
      from public.propuestas_cita where evento_id = :'m13d_ev'::uuid
  )
  and not exists (
    select cita_id, fecha_prevista, inicio_propuesto, fin_propuesto
      from public.propuestas_cita where evento_id = :'m13d_ev'::uuid
    except
    select cita_id, fecha, inicio, fin from m13_prev
  )
  and (select count(*) from m13_prev) = 3
  and (select count(*) from public.propuestas_cita where evento_id = :'m13d_ev'::uuid) = 3,
  'M.13 · Criterio 16d: (cita, fecha, inicio, fin) de la previsualización = los de las propuestas de la edición'
);

-- =========================================================================
-- M.14 · Criterio 17 — el ordinal mensual se fija al crear (ADR-069)
-- =========================================================================

select min(m)::date::text as m5b
  from generate_series((:'m13_mes5'::date + interval '1 month')::timestamp,
                       (:'m13_mes5'::date + interval '6 months')::timestamp, interval '1 month') m
 where extract(day from pg_temp.m_ultimo(m::date, 4)) >= 29 \gset m14_

select ((extract(year from :'m14_m5b'::date) * 12 + extract(month from :'m14_m5b'::date))
      - (extract(year from :'m13_mes5'::date) * 12 + extract(month from :'m13_mes5'::date)) + 1)::int as n \gset m14_

create temp table m14_esperadas as
select g as k, pg_temp.m_ultimo((:'m13_mes5'::date + make_interval(months => g - 1))::date, 4) as fecha
  from generate_series(1, :m14_n) g;

-- (a) Función pura.
select pg_temp.assert(
  (select array_agg(o order by n)
     from public.ocurrencias_serie('mensual', 4::smallint, :'m13_jueves5'::date, (:m14_n)::smallint, null)
          with ordinality as t(o, n))
  = (select array_agg(fecha order by k) from m14_esperadas),
  'M.14 · Criterio 17a: ocurrencias_serie mensual desde un 5.º jueves da el ÚLTIMO jueves de cada mes, de m5 a m5b'
);

select pg_temp.assert(
  (select fecha from m14_esperadas where k = 2) = pg_temp.m_enesimo((:'m13_mes5'::date + interval '1 month')::date, 4, 4)
  and (select fecha from m14_esperadas where k = :m14_n) = pg_temp.m_enesimo(:'m14_m5b'::date, 4, 5)
  and :m14_n >= 3,
  'M.14 · Criterio 17a: la de m5 + 1 es su 4.º jueves y la última es el 5.º jueves de m5b (el ordinal no derivó)'
);

-- (b) Creación. PRO2 en CB, no PRO1: PRO1 tiene un festivo en CA en
-- domingo_marzo + 60 (§F), que es el último jueves de mayo, y la serie
-- produciría una propuesta de festivo en vez de la cita.
call pg_temp.como(:PRO2);
select public.agenda_crear_serie(
  :P2, :PRO2, :CB, :TT2, 'mensual', 4::smallint, time '21:00', 50::smallint,
  :'m13_jueves5'::date, (:m14_n)::smallint, null
)::text as r \gset m14b_
call pg_temp.reset_sesion();

select pg_temp.assert(
  ((:'m14b_r')::jsonb -> 'propuestas') = '[]'::jsonb
  and (select array_agg((inicio at time zone zona_horaria)::date order by inicio)
         from public.citas where serie_id = ((:'m14b_r')::jsonb ->> 'serie_id')::uuid)
      = (select array_agg(fecha order by k) from m14_esperadas),
  'M.14 · Criterio 17b: agenda_crear_serie materializa exactamente esas fechas, la última en el 5.º jueves de m5b'
);

-- (c) Crear = editar.
select pg_temp.assert(
  (select array_agg(fecha_prevista order by fecha_prevista)
     from public.propuestas_cita where evento_id = :'m13d_ev'::uuid)
  = (select array_agg(o order by o)
       from public.ocurrencias_serie('mensual', 4::smallint, :'m13_jueves5'::date, 3::smallint, null) o),
  'M.14 · Criterio 17c: las fechas de la edición de M.13d son las mismas que daría crear la serie desde ese 5.º jueves'
);

-- (d) La consulta de detección de §1.11 va en la evidencia, no aquí.

-- =========================================================================
-- M.15 · Criterio 18 — el INSERT directo sobre series_cita ya no entra
-- =========================================================================

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($q$insert into public.series_cita
              (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
               dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
            values (%L, %L, %L, %L, %L, 'semanal', 1, time '09:00', 'Europe/Madrid', 50, 2, %L)$q$,
         :S15, :P1, :PRO1, :CA, :TT2, :PRO1),
  '42501', 'permission denied for table series_cita',
  'M.15 · Criterio 18: el profesional NO puede crear una serie con un INSERT directo, ni para su propio paciente'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  not exists (select 1 from public.series_cita where id = :S15),
  'M.15 · Criterio 18: la fila no existe'
);

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT2, 'semanal', 1::smallint, time '09:00', 50::smallint, (:'base_m'::date + 630), 2::smallint, null
) ->> 'serie_id') as serie_id \gset m15_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = :'m15_serie_id'::uuid) = 2,
  'M.15 · Criterio 18 (GEMELA): la misma serie por agenda_crear_serie SÍ entra y materializa sus dos citas'
);

call pg_temp.reset_sesion();

\echo '16-series: completa.'
