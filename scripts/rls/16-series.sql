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
-- M · T-011b (ADR-068, ADR-069): ancla (H8), día y duración de la propuesta
--     (H9), guardas de confirmación, previsualización, ordinal mensual fijo,
--     y UPDATE/INSERT directos sobre series_cita retirados.
-- =========================================================================

\set M6CITA 'a1100006-0000-4000-8000-000000000001'

select (:'domingo_marzo'::date + 500) as desde_m \gset

-- --- M.1 · H8: «esta y las siguientes» desde la 3ª cita NO toca la 1ª ni la 2ª ---

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT3, 'semanal',
  (extract(isodow from :'desde_m'::date))::smallint,
  time '09:00', 50::smallint, :'desde_m'::date, 5::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset m1_
call pg_temp.reset_sesion();

select array_agg(id order by inicio) as citas from public.citas where serie_id = (:'m1_serie_id')::uuid \gset m1_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m1_citas'::uuid[])[3], 'esta_y_siguientes', p_duracion_minutos => 60::smallint
) as r \gset m1e_
call pg_temp.reset_sesion();

select pg_temp.assert(
  not exists (
    select 1 from public.propuestas_cita
     where cita_id in ((:'m1_citas'::uuid[])[1], (:'m1_citas'::uuid[])[2])
  ),
  'M.1 · H8: editar «esta y las siguientes» desde la 3ª cita NO genera propuesta para la 1ª ni la 2ª'
);

select pg_temp.assert(
  (select count(*) from public.propuestas_cita
    where cita_id in ((:'m1_citas'::uuid[])[3], (:'m1_citas'::uuid[])[4], (:'m1_citas'::uuid[])[5])
      and motivo = 'regla_cambiada' and estado = 'pendiente') = 3,
  'M.1 · H8: desde la 3ª cita en adelante (3ª, 4ª, 5ª) SÍ hay propuesta, una por cita'
);

select pg_temp.assert(
  (select duracion_minutos from public.series_cita where id = (:'m1_serie_id')::uuid) = 60,
  'GEMELA: la regla de la serie sí cambió a 60 minutos aunque las primeras dos citas no se propongan'
);

-- Confirmar la propuesta de la 3ª: la cita resultante dura 60 minutos (la
-- regla nueva), no los 50 de la cita original.
select id from public.propuestas_cita where cita_id = (:'m1_citas'::uuid[])[3] \gset m1p_

call pg_temp.como(:PRO1);
select public.agenda_confirmar_propuesta((:'m1p_id')::uuid) as cita_resultante_id \gset m1c_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select extract(epoch from (fin - inicio)) / 60 from public.citas where id = (:'m1c_cita_resultante_id')::uuid) = 60
  and (select desviada from public.citas where id = (:'m1c_cita_resultante_id')::uuid) = false,
  'M.1: la cita confirmada dura 60 minutos (la regla nueva) y no queda desviada (horario normal, sin anomalía)'
);

-- --- M.2 · H9: cambiar el día de la semana MUEVE la fecha, y usa la duración de la regla nueva ---

-- +63 (múltiplo de 7): mismo día de la semana que desde_m (miércoles), para que
-- el ancla de esta prueba no caiga por casualidad en domingo — el envoltorio
-- ISO de fin de semana (domingo -> lunes) cambiaría de semana relativa y
-- rompería la aserción de "misma semana" sin que sea un fallo del código.
select (:'desde_m'::date + 63) as desde_m2 \gset
select (extract(isodow from :'desde_m2'::date))::smallint as dia_origen_m2 \gset
select (((:dia_origen_m2 + 1 - 1) % 7) + 1)::smallint as dia_destino_m2 \gset
select (:'desde_m2'::date + ((:dia_destino_m2 - :dia_origen_m2 + 7) % 7)) as fecha_destino_m2 \gset

call pg_temp.como(:PRO1);
select (public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT3, 'semanal', :dia_origen_m2::smallint,
  time '09:00', 50::smallint, :'desde_m2'::date, 3::smallint, null
) ->> 'serie_id')::uuid as serie_id \gset m2_
call pg_temp.reset_sesion();

select array_agg(id order by inicio) as citas from public.citas where serie_id = (:'m2_serie_id')::uuid \gset m2_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m2_citas'::uuid[])[1], 'esta_y_siguientes',
  p_dia_semana => :dia_destino_m2::smallint, p_fecha => (:'fecha_destino_m2')::date, p_duracion_minutos => 30::smallint
) as r \gset m2e_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select extract(isodow from p.fecha_prevista) from public.propuestas_cita p
    where p.cita_id = (:'m2_citas'::uuid[])[2]) = :dia_destino_m2::smallint,
  'M.2 · H9: la propuesta de la 2ª cita cae en el día de la semana NUEVO, no conserva el de la cita original'
);

select pg_temp.assert(
  date_trunc('week', (select p.fecha_prevista from public.propuestas_cita p
    where p.cita_id = (:'m2_citas'::uuid[])[2])::timestamp)
  = date_trunc('week', (select (c.inicio at time zone c.zona_horaria)::date
    from public.citas c where c.id = (:'m2_citas'::uuid[])[2])::timestamp),
  'M.2: la propuesta se queda en LA MISMA semana relativa que la cita original, solo cambia el día dentro de ella'
);

select pg_temp.assert(
  (select extract(epoch from (p.fin_propuesto - p.inicio_propuesto)) / 60 from public.propuestas_cita p
    where p.cita_id = (:'m2_citas'::uuid[])[2]) = 30,
  'M.2 · H9: la propuesta dura 30 minutos — la duración de la regla NUEVA, no los 50 de la cita original'
);

-- --- M.3 · ADR-069: el ordinal mensual se fija en la primera ocurrencia ---

-- enesimo_dia_del_mes() SIEMPRE cae dentro del mes pedido (recorta al último
-- de ese día si el mes no llega al ordinal) — por diseño, así que comparar su
-- resultado contra el mes de entrada nunca distingue "tiene 5º" de "recortó al
-- 4º". Aquí se calcula el candidato SIN recortar (primer lunes + 4 semanas) y
-- se comprueba si ese candidato crudo se sale del mes.
with meses as (
  select gs::date as mes,
         (extract(month from
            (gs::date + ((1 - extract(isodow from gs::date)::int + 7) % 7) + 28)
          ) = extract(month from gs::date)) as tiene_5
    from generate_series(date_trunc('month', now()), date_trunc('month', now()) + interval '36 months', interval '1 month') gs
),
candidatos as (
  select mes, tiene_5,
         lead(tiene_5)    over (order by mes) as tiene_5_sig,
         lead(tiene_5, 2) over (order by mes) as tiene_5_sig2
    from meses
)
select mes from candidatos where tiene_5 and not tiene_5_sig and tiene_5_sig2 limit 1 \gset m3mes_

select pg_temp.assert(
  :'m3mes_mes' is not null,
  'M.3 · precondición: existe (en los próximos 36 meses) un mes con 5 lunes, seguido de uno con 4, seguido de uno con 5'
);

select (public.enesimo_dia_del_mes((:'m3mes_mes')::date, 1::smallint, 5::smallint)) as desde_m3 \gset

select array_agg(o order by o) as ocurrencias
  from public.ocurrencias_serie('mensual', 1::smallint, (:'desde_m3')::date, 3::smallint, null) o \gset m3_

select pg_temp.assert(
  (:'m3_ocurrencias'::date[])[3] = public.enesimo_dia_del_mes(((:'m3mes_mes')::date + interval '2 months')::date, 1::smallint, 5::smallint),
  'M.3 · ADR-069: el 3er mes usa el ORDINAL 5 (el de la primera ocurrencia), aunque el 2º mes solo tuviera 4 lunes'
);

select pg_temp.assert(
  (:'m3_ocurrencias'::date[])[3] <> public.enesimo_dia_del_mes(((:'m3mes_mes')::date + interval '2 months')::date, 1::smallint, 4::smallint),
  'GEMELA: y por tanto NO coincide con el ordinal 4 — antes del arreglo, un mes corto degradaba el ordinal para siempre'
);

-- --- M.4 · agenda_previsualizar_edicion_serie(): enseña sin escribir nada ---

select (select count(*) from public.eventos_salientes) as eventos_antes \gset m4_
select (select count(*) from public.propuestas_cita) as propuestas_antes \gset m4_
select (select hora_local from public.series_cita where id = (:'m1_serie_id')::uuid) as hora_antes \gset m4_

call pg_temp.como(:PRO1);
select public.agenda_previsualizar_edicion_serie(
  (:'m1_citas'::uuid[])[4], p_hora_local => time '10:00'
) as p \gset m4p_
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.eventos_salientes) = :m4_eventos_antes
  and (select count(*) from public.propuestas_cita) = :m4_propuestas_antes
  and (select hora_local from public.series_cita where id = (:'m1_serie_id')::uuid) = :'m4_hora_antes'::time,
  'M.4: previsualizar NO crea eventos, NO crea propuestas y NO toca la regla de la serie'
);

select pg_temp.assert(
  ((:'m4p_p')::jsonb -> 'citas') @> jsonb_build_array(jsonb_build_object('cita_id', (:'m1_citas'::uuid[])[4]::text))::jsonb
    is not null
  and not (
    (:'m4p_p')::jsonb -> 'citas' @> jsonb_build_array(jsonb_build_object('cita_id', (:'m1_citas'::uuid[])[1]::text))
  ),
  'M.4 · H8 también en la previsualización: enseña la 4ª y la 5ª (desde el ancla), no la 1ª'
);

-- --- M.5 · Guardas de agenda_confirmar_propuesta() (ADR-068) ---

-- (a) La regla cambió de nuevo desde que se creó la propuesta de la 5ª cita
-- (M.1 dejó una propuesta pendiente para la 5ª; ahora se vuelve a editar).
select id from public.propuestas_cita where cita_id = (:'m1_citas'::uuid[])[5] and estado = 'pendiente' \gset m5stale_

call pg_temp.como(:PRO1);
select public.agenda_editar_serie(
  (:'m1_citas'::uuid[])[4], 'esta_y_siguientes', p_duracion_minutos => 45::smallint
) as r \gset m5e_
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_confirmar_propuesta(%L::uuid)', :'m5stale_id'),
  '22023', 'otra regla',
  'M.5a: confirmar una propuesta cuya serie ya tiene OTRA regla se rechaza con 22023 y mensaje legible'
);
call pg_temp.reset_sesion();

-- (b) La cita de la propuesta se canceló entre tanto.
select id from public.propuestas_cita where cita_id = (:'m1_citas'::uuid[])[4] and estado = 'pendiente'
  order by creada_en desc limit 1 \gset m5canc_

call pg_temp.como(:PRO1);
select public.agenda_cancelar_cita((:'m1_citas'::uuid[])[4], 'esta');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_confirmar_propuesta(%L::uuid)', :'m5canc_id'),
  '22023', 'cancelada',
  'M.5b: confirmar la propuesta de una cita YA CANCELADA se rechaza con 22023 y mensaje legible'
);
call pg_temp.reset_sesion();

-- (c) El horario propuesto ya quedó en el pasado (propuesta fabricada a mano:
-- el tiempo real no permite esperar a que una propuesta real "caduque").
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:'M6CITA', :P1, :PRO1, :CA, :TT3, now() + interval '15 minutes', now() + interval '65 minutes', 'Europe/Madrid');

-- propuestas_cita_cuelga_ck exige serie_id o evento_id no nulo; esta cita no
-- pertenece a ninguna serie, así que se fabrica también el evento del que
-- "cuelga" la propuesta (su contenido no importa: no se vuelve a leer).
insert into public.eventos_salientes (tipo, carga, estado)
values ('agenda.zona_centro_cambiada', jsonb_build_object('centro_id', :CA, 'zona_horaria_nueva', 'Europe/Madrid'), 'entregado')
returning id \gset m5pasadoev_

insert into public.propuestas_cita
  (evento_id, cita_id, paciente_id, profesional_id, centro_id, motivo,
   fecha_prevista, hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
values
  ((:'m5pasadoev_id')::uuid, :'M6CITA', :P1, :PRO1, :CA, 'ausencia',
   (now() - interval '1 day')::date, '09:00', now() - interval '1 day', now() - interval '1 day' + interval '50 minutes',
   'Europe/Madrid', :PRO1)
returning id \gset m5pasado_

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_confirmar_propuesta(%L::uuid)', :'m5pasado_id'),
  '22023', 'pasado',
  'M.5c: confirmar un horario propuesto que ya quedó en el pasado se rechaza con 22023'
);
call pg_temp.reset_sesion();

-- --- M.6 · zona nueva empuja el instante al pasado: propuesta sin horario ---
-- (la propuesta de M.5c queda pendiente y sin resolver: no estorba — M.6 fabrica
-- su propia cita y su propio evento.)

insert into public.eventos_salientes (tipo, carga, estado)
values (
  'agenda.zona_centro_cambiada',
  jsonb_build_object(
    'centro_id', :CA, 'zona_horaria_nueva', 'Pacific/Kiritimati',
    'citas_afectadas', jsonb_build_array(:'M6CITA')
  ),
  'pendiente'
)
returning id \gset m6ev_

call pg_temp.como(:PRO1);
select public.agenda_propuestas_de_evento((:'m6ev_id')::uuid) as r \gset m6r_
call pg_temp.reset_sesion();

select (((:'m6r_r')::jsonb -> 'propuestas') ->> 0)::uuid as propuesta_id \gset m6_

select pg_temp.assert(
  (select inicio_propuesto from public.propuestas_cita where id = (:'m6_propuesta_id')::uuid) is null
  and (select fin_propuesto from public.propuestas_cita where id = (:'m6_propuesta_id')::uuid) is null,
  'M.6: un cambio de zona tan drástico que el instante recalculado cae en el pasado deja la propuesta SIN horario'
);

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_confirmar_propuesta(%L::uuid)', :'m6_propuesta_id'),
  '22023', 'horario',
  'M.6: y esa propuesta sin horario no se puede confirmar (misma guarda que "no tiene horario")'
);
call pg_temp.reset_sesion();

-- --- M.7 · ADR-069/ADR-068: UPDATE e INSERT directos sobre series_cita, retirados ---

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format($sql$update public.series_cita set hora_local = time '08:00' where id = %L$sql$, :'m1_serie_id'),
  '42501', 'permission denied for table series_cita',
  'M.7a: PRO1 no puede hacer UPDATE directo sobre su PROPIA serie — solo agenda_editar_serie()'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.series_cita
           (paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
            dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, creada_por)
         values (%L, %L, %L, %L, 'semanal', 3::smallint, time '10:00', 'Europe/Madrid', 50::smallint, 4::smallint, %L)$sql$,
    :P1, :PRO1, :CA, :TT3, :PRO1),
  '42501', 'permission denied for table series_cita',
  'M.7b: PRO1 no puede hacer INSERT directo en series_cita ni para su propio paciente — solo agenda_crear_serie()'
);
call pg_temp.reset_sesion();

\echo '16-series: completa.'
