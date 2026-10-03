-- T-028a · La base del alta de cita: lo que la base de datos impone antes de que exista pantalla.
--
-- Va al final (21), con el siguiente número (README, punto 7). Reutiliza los actores de
-- 01-fijacion.sql (ADM, PRO1 con alta en CA y CB, PRO2, TEC1 de CA, TEC2 de CB, PROBAJA ya en
-- baja desde 04) y los pacientes P1 (de PRO1) y P2 (de PRO2).
--
-- ANCLAS EN EL AÑO + 3. Ningún banco anterior siembra disponibilidad de tipo `franja`, y los
-- bancos 15-20 usan fechas de ahora o del año que viene (16 usa año + 1, y sus series llegan a
-- mayo del año + 2: medido, PRO1 tenía una cita el primer lunes de mayo de ese año). Todo lo de
-- aquí cae en el año + 3, así que no se pisa con nada. Cada sección usa sus propios lunes (offsets
-- sobre `lunes_21`) porque las series que crea una sección ocupan el lunes a las 10:00 de
-- PRO1 para las demás.
--
-- Una negativa sin su gemela positiva no distingue una regla de una puerta cerrada para todos.
-- Las negativas con fragmento (`assert_lanza_codigo_msg`) demuestran POR DÓNDE fallan, no solo
-- que fallan: varias comprobaciones de las funciones de alta lanzan el mismo código.

\echo ''
\echo '=== 21-alta-de-cita ==='

\set TT21A '\'a2100001-0000-4000-8000-000000000001\''
\set TT21B '\'a2100001-0000-4000-8000-000000000002\''
\set TT21X '\'a2100001-0000-4000-8000-000000000003\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen, activo) values
  (:TT21A, 'Terapia T-028a 50',          50, 'exento_sanitario', true),
  (:TT21B, 'Terapia T-028a 90',          90, 'exento_sanitario', true),
  (:TT21X, 'Terapia T-028a dada de baja', 50, 'exento_sanitario', false);

-- Descanso explícito: lo que el banco mide depende de él (diez minutos por detrás).
update public.perfiles set descanso_activo = true, descanso_minutos = 10 where id = :PRO1;

select (extract(year from now())::int + 3) as anio_21 \gset

select (make_date(:anio_21, 3, 31) - (extract(isodow from make_date(:anio_21, 3, 31))::int % 7))::text
  as domingo_marzo_21 \gset
select (make_date(:anio_21, 10, 31) - (extract(isodow from make_date(:anio_21, 10, 31))::int % 7))::text
  as domingo_octubre_21 \gset

-- Primer lunes de mayo del año + 3.
select (make_date(:anio_21, 5, 1) + ((8 - extract(isodow from make_date(:anio_21, 5, 1))::int) % 7))::text
  as lunes_21 \gset

select (:'lunes_21'::date +   7)::text as l007,
       (:'lunes_21'::date +  14)::text as l014,
       (:'lunes_21'::date +  21)::text as l021,
       (:'lunes_21'::date +  28)::text as l028,
       (:'lunes_21'::date +  35)::text as l035,
       (:'lunes_21'::date +  42)::text as l042,
       (:'lunes_21'::date +  43)::text as l043,
       (:'lunes_21'::date +  49)::text as l049,
       (:'lunes_21'::date +  56)::text as l056,
       (:'lunes_21'::date +  61)::text as l061,
       (:'lunes_21'::date +  62)::text as l062,
       (:'lunes_21'::date +  91)::text as l091,
       (:'lunes_21'::date +  98)::text as l098,
       (:'lunes_21'::date + 105)::text as l105,
       (:'lunes_21'::date + 119)::text as l119,
       (:'lunes_21'::date + 154)::text as l154,
       (:'lunes_21'::date + 168)::text as l168,
       (:'lunes_21'::date + 175)::text as l175,
       (:'lunes_21'::date + 182)::text as l182,
       (:'lunes_21'::date + 196)::text as l196,
       (:'lunes_21'::date + 197)::text as l197,
       (:'lunes_21'::date + 198)::text as l198,
       (:'lunes_21'::date + 210)::text as l210,
       (:'lunes_21'::date + 224)::text as l224,
       (:'lunes_21'::date + 231)::text as l231,
       (:'lunes_21'::date + 238)::text as l238,
       (:'lunes_21'::date + 245)::text as l245,
       (:'lunes_21'::date + 260)::text as l260,
       (:'lunes_21'::date + 261)::text as l261,
       (:'lunes_21'::date + 270)::text as l270,
       (:'lunes_21'::date + 271)::text as l271,
       (:'lunes_21'::date + 272)::text as l272,
       (:'lunes_21'::date + 273)::text as l273,
       (:'lunes_21'::date + 280)::text as l280,
       (:'lunes_21'::date + 281)::text as l281,
       (:'lunes_21'::date + 286)::text as l286,
       (:'lunes_21'::date + 287)::text as l287,
       (:'lunes_21'::date + 294)::text as l294,
       (:'lunes_21'::date + 295)::text as l295,
       (:'lunes_21'::date + 300)::text as l300,
       (:'lunes_21'::date + 301)::text as l301,
       (:'lunes_21'::date + 308)::text as l308,
       (:'lunes_21'::date + 315)::text as l315,
       (:'lunes_21'::date + 322)::text as l322,
       (:'lunes_21'::date + 330)::text as l330,
       (:'lunes_21'::date + 335)::text as l335,
       (:'lunes_21'::date + 343)::text as l343 \gset

-- Una franja de PRO1: lunes de 09:00 a 14:00 en CA, durante diez semanas.
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, dia_semana, hora_inicio, hora_fin, desde, hasta, zona_horaria)
values
  (:PRO1, :CA, 'franja', 1, time '09:00', time '14:00', :'lunes_21'::date, (:'lunes_21'::date + 70), 'Europe/Madrid');

-- Recuento de las tres tablas que una previsualización o un rechazo NO pueden tocar.
create function pg_temp.n21() returns text
language sql
as $$
  select (select count(*) from public.citas) || '-'
      || (select count(*) from public.series_cita) || '-'
      || (select count(*) from public.propuestas_cita);
$$;

-- Moldes de las llamadas que se repiten en las negativas (texto para execute).
create function pg_temp.sql_serie(
  p_pac uuid, p_pro uuid, p_cen uuid, p_tipo uuid, p_desde date, p_n int,
  p_dur int default 50, p_extra text default ''
) returns text
language sql
as $$
  select format($f$select public.agenda_crear_serie(%L, %L, %L, %L, 'semanal', 1::smallint,
                    time '10:00', %L::smallint, %L::date, %s::smallint, null%s)$f$,
                p_pac, p_pro, p_cen, p_tipo, p_dur, p_desde, p_n, p_extra);
$$;

create function pg_temp.sql_cita(
  p_pac uuid, p_pro uuid, p_cen uuid, p_tipo uuid, p_fecha date, p_hora time,
  p_extra text default ''
) returns text
language sql
as $$
  select format($f$select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, %L::time%s)$f$,
                p_pac, p_pro, p_cen, p_tipo, p_fecha, p_hora, p_extra);
$$;

create function pg_temp.sql_prev(
  p_pac uuid, p_pro uuid, p_cen uuid, p_per text, p_dia int, p_hora time, p_dur int,
  p_desde date, p_n int
) returns text
language sql
as $$
  select format($f$select public.agenda_previsualizar_alta(%L, %L, %L, %L::public.periodicidad_serie,
                    %L::smallint, %L::time, %L::smallint, %L::date, %L::smallint)$f$,
                p_pac, p_pro, p_cen, p_per, p_dia, p_hora, p_dur, p_desde, p_n);
$$;

-- =========================================================================
-- A · Forma y permisos (criterio 4)
-- =========================================================================

select pg_temp.assert(
  pg_get_function_result('public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure)
    = 'TABLE(fecha date, hora_local time without time zone, inicio timestamp with time zone, fin timestamp with time zone, estado text)',
  'A · agenda_bloques_profesional devuelve exactamente (fecha, hora_local, inicio, fin, estado)'
);

select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agenda_crear_serie') = 1,
  'A · existe UNA sola agenda_crear_serie (el drop function de la firma antigua, sin sobrecarga)'
);

select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agenda_crear_cita') = 1,
  'A · existe UNA sola agenda_crear_cita'
);

-- T-039: crear_cita y crear_serie se localizan por NOMBRE (sin firma literal): T-039 añade parámetros y esta
-- aserción no debe ser la primera en morir sin su migración (la primera es 23.A1).
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure, 'execute')
  and has_function_privilege('authenticated', 'public.agenda_previsualizar_alta(uuid,uuid,uuid,public.periodicidad_serie,smallint,time,smallint,date,smallint)'::regprocedure, 'execute')
  and has_function_privilege('authenticated', (select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'agenda_crear_serie'), 'execute')
  and has_function_privilege('authenticated', (select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'agenda_crear_cita'), 'execute'),
  'A · las cuatro funciones públicas de alta las ejecuta authenticated'
);

select pg_temp.assert(
  not (has_function_privilege('anon', 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.agenda_previsualizar_alta(uuid,uuid,uuid,public.periodicidad_serie,smallint,time,smallint,date,smallint)'::regprocedure, 'execute')
    or has_function_privilege('anon', (select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'agenda_crear_serie'), 'execute')
    or has_function_privilege('anon', (select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'agenda_crear_cita'), 'execute')),
  'A · anon no ejecuta ninguna de las cuatro funciones públicas'
);

select pg_temp.assert(
  not (has_function_privilege('authenticated', 'public.plan_alta_serie(uuid,uuid,text,date[],time,smallint)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.plan_alta_serie(uuid,uuid,text,date[],time,smallint)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'public.alta_descanso(uuid)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.alta_descanso(uuid)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'public.alta_bloqueo_disponibilidad(uuid,uuid,date,timestamptz,timestamptz)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.alta_bloqueo_disponibilidad(uuid,uuid,date,timestamptz,timestamptz)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'public.alta_hueco_ocupado(uuid,timestamptz,timestamptz)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.alta_hueco_ocupado(uuid,timestamptz,timestamptz)'::regprocedure, 'execute')),
  'A · plan_alta_serie y los tres ayudantes son internos: ni authenticated ni anon los ejecutan'
);

-- R2-H4 · Los otros dos ayudantes internos. Una recreación (T-039 prevé drop + create) que
-- olvide el revoke los deja ejecutables por PostgREST: esto lo caza.
select pg_temp.assert(
  not (has_function_privilege('authenticated', 'public.alta_exigir_profesional(uuid)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.alta_exigir_profesional(uuid)'::regprocedure, 'execute')
    or has_function_privilege('authenticated', 'public.alta_resolver_tipo(uuid,smallint)'::regprocedure, 'execute')
    or has_function_privilege('anon', 'public.alta_resolver_tipo(uuid,smallint)'::regprocedure, 'execute')),
  'A · alta_exigir_profesional y alta_resolver_tipo son internas: ni authenticated ni anon las ejecutan'
);

-- R1-H5 · D5: el tipo se lee `for share`, para que nadie lo dé de baja entre la comprobación y
-- el insert. Una carrera no se reproduce en una sola conexión: se guarda el texto.
select pg_temp.assert(
  pg_get_functiondef('public.alta_resolver_tipo(uuid,smallint)'::regprocedure) ~* 'for\s+share',
  'A · alta_resolver_tipo lee la fila del tipo con for share (D5)'
);

-- =========================================================================
-- B · Bloques: el descanso se cuenta (criterio 3)
-- =========================================================================

call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select count(*) = 5
      and array_agg(b.hora_local order by b.inicio) = array[time '09:00', time '10:00', time '11:00', time '12:00', time '13:00']
      and bool_and(b.estado = 'libre')
     from public.agenda_bloques_profesional(:PRO1, :CA, :'lunes_21'::date, :'lunes_21'::date, 50::smallint) b),
  'B · franja 09-14, sesión de 50 y descanso de 10: cinco bloques libres a las 09, 10, 11, 12 y 13 (ninguno a las 14:00, ni a las 09:50)'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- C · El salto va al final del bloqueo, no al paso normal (criterio 4)
-- =========================================================================

-- Una cita de PRO1 en OTRO centro (CB), de 10:00 a 11:05: su rango bloqueante es [10:00, 11:15).
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values ('a2100004-0000-4000-8000-000000000001', :P1, :PRO1, :CB, :TT21A,
        (:'l007'::date + time '10:00') at time zone 'Europe/Madrid',
        (:'l007'::date + time '11:05') at time zone 'Europe/Madrid',
        'Europe/Madrid');

call pg_temp.como(:TEC1);
select pg_temp.assert(
  (select array_agg(b.hora_local::text || '/' || b.estado order by b.inicio)
     from public.agenda_bloques_profesional(:PRO1, :CA, :'l007'::date, :'l007'::date, 50::smallint) b)
  = array['09:00:00/libre', '10:00:00/ocupado', '11:15:00/libre', '12:15:00/libre'],
  'C · una cita de PRO1 en CB (10:00-11:05, rango hasta 11:15) bloquea el 10:00 de CA y el siguiente libre es a las 11:15, no a las 11:00'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- D · Festivo, tope de rango y centro ajeno (criterio 5)
-- =========================================================================

insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
values (:PRO1, null, 'festivo', :'l014'::date, :'l014'::date, 'Europe/Madrid', 'Festivo T-028a');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select count(*) from public.agenda_bloques_profesional(:PRO1, :CA, :'l014'::date, :'l014'::date, 50::smallint)) = 0,
  'D · un día de festivo de día entero no da ningún bloque'
);
select pg_temp.assert(
  (select count(*) from public.agenda_bloques_profesional(:PRO1, :CA, :'l021'::date, :'l021'::date, 50::smallint)) > 0,
  'D · GEMELA: el lunes siguiente, sin festivo, sí da bloques'
);

select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'lunes_21', :'l062'),
  '22023', 'como mucho 62 días',
  'D · 63 días de rango: 22023 con «como mucho 62 días»'
);
select pg_temp.assert(
  (select count(*) from public.agenda_bloques_profesional(:PRO1, :CA, :'lunes_21'::date, :'l061'::date, 50::smallint)) > 0,
  'D · GEMELA: 62 días de rango exactos sí entran'
);

select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'l007', :'lunes_21'),
  '22023', 'hasta es anterior a desde',
  'D · hasta anterior a desde: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 4::smallint)',
         :PRO1, :CA, :'lunes_21', :'lunes_21'),
  '22023', 'duración entre 5 y 480',
  'D · duración de 4 minutos: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, null::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'lunes_21'),
  '22023', 'faltan parámetros',
  'D · una fecha nula: 22023'
);
call pg_temp.reset_sesion();

-- Otro centro: TEC2 no es de CA.
call pg_temp.como(:TEC2);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'lunes_21', :'lunes_21'),
  '42501', 'No autorizado para ver esta agenda',
  'D · el técnico de CB no ve los bloques de CA: 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(
  (select count(*) from public.agenda_bloques_profesional(:PRO1, :CA, :'lunes_21'::date, :'lunes_21'::date, 50::smallint)) = 5,
  'D · GEMELA: el técnico de CA sí ve los bloques de CA'
);
call pg_temp.reset_sesion();

-- Sin perfil (A1) y la decisión D del propietario sobre quién puede ser «el profesional».
call pg_temp.como(gen_random_uuid());
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'lunes_21', :'lunes_21'),
  '42501', 'No hay sesión activa con perfil',
  'D · sin perfil: 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PROBAJA, :CA, :'lunes_21', :'lunes_21'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · los bloques de un profesional en baja: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :TEC1, :CA, :'lunes_21', :'lunes_21'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · los bloques de un técnico administrativo como «profesional»: 22023'
);
select pg_temp.assert(
  (select count(*) from public.agenda_bloques_profesional(:PRO1, :CA, :'lunes_21'::date, :'lunes_21'::date, 50::smallint)) = 5,
  'D (propietario) · GEMELA: el administrador sí ve los bloques de un profesional activo'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- E · La previsualización no escribe, y es lo que luego se crea (criterio 6)
-- =========================================================================

-- Preparación (como postgres), serie semanal de lunes a las 10:00, 8 sesiones desde +28:
--   · festivo en la 3.ª sesión (+42);
--   · una cita de PRO1 en la 5.ª (+56) de 10:55 a 11:45: solo choca POR EL DESCANSO de la
--     cita nueva (10:00-10:50 + 10 = hasta 11:00), no por solape directo.
insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
values (:PRO1, null, 'festivo', :'l042'::date, :'l042'::date, 'Europe/Madrid', 'Festivo en la 3.ª sesión');

insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values ('a2100004-0000-4000-8000-000000000002', :P1, :PRO1, :CA, :TT21A,
        (:'l056'::date + time '10:55') at time zone 'Europe/Madrid',
        (:'l056'::date + time '11:45') at time zone 'Europe/Madrid',
        'Europe/Madrid');

select pg_temp.n21() as n_antes_e \gset

call pg_temp.como(:PRO1);
select public.agenda_previsualizar_alta(
  :P1, :PRO1, :CA, 'semanal'::public.periodicidad_serie, 1::smallint, time '10:00', 50::smallint,
  :'l028'::date, 8::smallint)::text as prev_21 \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  pg_temp.n21() = :'n_antes_e',
  'E · previsualizar no escribe: citas, series_cita y propuestas_cita iguales antes y después'
);

select pg_temp.assert(
  (select count(*) = 8 from jsonb_array_elements((:'prev_21'::jsonb)->'sesiones'))
  and (select array_agg(s->>'bloqueo' order by s->>'fecha') = array[null, null, 'festivo', null, 'ocupada', null, null, null]::text[]
         from jsonb_array_elements((:'prev_21'::jsonb)->'sesiones') s),
  'E · el plan ve el festivo de la 3.ª sesión y la ocupada de la 5.ª (choque solo por el descanso)'
);

-- La misma entrada, creada de verdad por PRO1 (sin estricta).
call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, :'l028'::date, 8::smallint, null
)::text as ser_21 \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select array_agg(x->>'fecha' order by x->>'fecha') from jsonb_array_elements((:'ser_21'::jsonb)->'citas') x)
  = (select array_agg(s->>'fecha' order by s->>'fecha')
       from jsonb_array_elements((:'prev_21'::jsonb)->'sesiones') s where s->>'bloqueo' is null),
  'E · COHERENCIA: las fechas de las citas creadas son las sesiones del plan sin bloqueo'
);

select pg_temp.assert(
  (select array_agg((x->>'fecha') || '/' || (x->>'motivo') order by x->>'fecha')
     from jsonb_array_elements((:'ser_21'::jsonb)->'propuestas') x)
  = (select array_agg((s->>'fecha') || '/' || (s->>'bloqueo') order by s->>'fecha')
       from jsonb_array_elements((:'prev_21'::jsonb)->'sesiones') s where s->>'bloqueo' is not null),
  'E · COHERENCIA: las propuestas creadas tienen la fecha y el motivo del bloqueo del plan (festivo y ocupada por el descanso)'
);

select pg_temp.assert(
  (select count(*) = 2
      and count(*) filter (
            where pc.inicio_propuesto is not distinct from (s->'alternativa'->>'inicio')::timestamptz
              and pc.fin_propuesto    is not distinct from (s->'alternativa'->>'fin')::timestamptz) = 2
      and count(*) filter (where s->'alternativa' <> 'null'::jsonb) = 2
     from jsonb_array_elements((:'ser_21'::jsonb)->'propuestas') x
     join public.propuestas_cita pc on pc.id = (x->>'propuesta_id')::uuid
     join jsonb_array_elements((:'prev_21'::jsonb)->'sesiones') s on s->>'fecha' = x->>'fecha'),
  'E · COHERENCIA: inicio y fin propuestos de cada propuesta son la alternativa del plan, y las dos tienen alternativa'
);

select pg_temp.assert(
  (select count(*) = 6
      and bool_and(c.inicio = (s->>'inicio')::timestamptz and c.fin = (s->>'fin')::timestamptz)
     from jsonb_array_elements((:'ser_21'::jsonb)->'citas') x
     join public.citas c on c.id = (x->>'cita_id')::uuid
     join jsonb_array_elements((:'prev_21'::jsonb)->'sesiones') s on s->>'fecha' = x->>'fecha'),
  'E · COHERENCIA: el inicio y el fin de cada cita creada son los del plan'
);

-- Sin permiso, la previsualización también rechaza (A1-A3), con su gemela positiva en E.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P2, :PRO1, :CA, 'semanal', 1, time '10:00', 50, :'l028'::date, 2),
  '42501', 'citar no crea el vínculo',
  'E · previsualizar con un paciente ajeno: 42501 (el vínculo, ADR-055)'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P1, :PRO1, :CA, 'semanal', 1, time '10:00', 50, current_date - 1, 2),
  '22023', 'anterior a hoy',
  'E · previsualizar con fecha pasada: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P1, :PRO1, :CA, 'semanal', 1, time '10:00', 50, :'l028'::date, null),
  '22023', 'sesiones',
  'E · previsualizar una serie sin número de sesiones: 22023'
);
call pg_temp.reset_sesion();

call pg_temp.como(:TEC2);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P1, :PRO1, :CA, 'semanal', 1, time '10:00', 50, :'l028'::date, 2),
  '42501', 'No autorizado para previsualizar esta serie',
  'E · el técnico de CB no previsualiza en CA: 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P1, :PROBAJA, :CA, 'semanal', 1, time '10:00', 50, :'l028'::date, 2),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · previsualizar con un profesional en baja: 22023, igual que crear'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- F · Hora local, anomalías horarias y alternativas (criterio 7)
-- =========================================================================

call pg_temp.como(:PRO1);

-- Cuatro martes a las 12:00 que cruzan el cambio de marzo: la misma hora local.
select pg_temp.assert(
  (select count(*) = 4
      and bool_and(((s->>'inicio')::timestamptz at time zone 'Europe/Madrid')::time = time '12:00'
                   and s->>'clasificacion' = 'normal')
      and count(distinct ((s->>'inicio')::timestamptz at time zone 'UTC')::time) = 2
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, 'semanal', 2::smallint, time '12:00', 50::smallint,
                                             (:'domingo_marzo_21'::date - 12), 4::smallint) -> 'sesiones') s),
  'F · cuatro martes a las 12:00 a los dos lados del cambio de marzo: siempre 12:00 locales, normales, con dos horas UTC distintas'
);

select pg_temp.assert(
  (select s->>'clasificacion'
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, null, null, time '02:30', 50::smallint,
                                             :'domingo_marzo_21'::date, null) -> 'sesiones') s) = 'inexistente',
  'F · una suelta a las 02:30 del domingo de marzo es «inexistente»'
);

select pg_temp.assert(
  (select s->>'clasificacion'
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, null, null, time '02:30', 50::smallint,
                                             :'domingo_octubre_21'::date, null) -> 'sesiones') s) = 'ambigua',
  'F · una suelta a las 02:30 del domingo de octubre es «ambigua»'
);

-- Festivo con alternativa (el festivo de E, +42): la alternativa cae a menos de ocho días.
select pg_temp.assert(
  (select s->>'bloqueo' = 'festivo'
      and (s->'alternativa'->>'fecha')::date - :'l042'::date between 1 and 7
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, null, null, time '10:00', 50::smallint,
                                             :'l042'::date, null) -> 'sesiones') s),
  'F · festivo con alternativa: bloqueo «festivo» y alternativa a entre 1 y 7 días'
);
call pg_temp.reset_sesion();

-- Festivo sin alternativa: festivo el +91 y una ausencia de +91 a +98 que cubre los siete días.
-- R1-H6 · La ausencia se inserta ANTES, en otra sentencia: sin el `order by` que da prioridad al
-- festivo, el orden físico devolvería la ausencia y la aserción de abajo caería.
-- RD2-H1 · Ids FIJOS, el de la ausencia MENOR que el del festivo: con ids de gen_random_uuid()
-- el mutante `order by d.id` (sin la prioridad del festivo) sobrevivía la mitad de las veces.
-- Así el desempate por id elige siempre la ausencia, y solo la prioridad del festivo da verde.
insert into public.disponibilidad (id, perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo) values
  ('21f00000-0000-4000-8000-000000000001', :PRO1, null, 'ausencia', :'l091'::date, :'l098'::date,
   'Europe/Madrid', 'Ausencia de una semana');
insert into public.disponibilidad (id, perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo) values
  ('21f00000-0000-4000-8000-000000000002', :PRO1, null, 'festivo',  :'l091'::date, :'l091'::date,
   'Europe/Madrid', 'Festivo sin alternativa');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select s->>'bloqueo' = 'festivo' and s->'alternativa' = 'null'::jsonb
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, null, null, time '10:00', 50::smallint,
                                             :'l091'::date, null) -> 'sesiones') s),
  'F · festivo y ausencia el mismo día: gana el festivo (determinista) y, con la semana entera ausente, la alternativa es nula'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- G · Excluir fechas: las excluidas consumen su ordinal (criterio 8)
-- =========================================================================

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, :'l105'::date, 8::smallint, null,
  p_excluir => array[:'l119'::date]
)::text as ser_g \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 7 and max((c.inicio at time zone 'Europe/Madrid')::date) = (:'l105'::date + 49)
      and not bool_or((c.inicio at time zone 'Europe/Madrid')::date = :'l119'::date)
     from public.citas c where c.serie_id = ((:'ser_g'::jsonb)->>'serie_id')::uuid),
  'G · ocho sesiones con la 3.ª excluida: siete citas, sin la excluida, y la última es el 8.º ordinal (desde + 49)'
);
select pg_temp.assert(
  (select count(*) from public.propuestas_cita where serie_id = ((:'ser_g'::jsonb)->>'serie_id')::uuid) = 0,
  'G · excluir no crea propuestas'
);

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l105'::date, 4, 50, ', p_excluir => array[date ''' || (:'l105'::date + 1) || ''']'),
  '22023', 'no es de la serie',
  'G · excluir una fecha que no es de la serie: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l105'::date, 4, 50, ', p_excluir => array[null::date]'),
  '22023', 'no es de la serie',
  'G · un nulo dentro de p_excluir: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l105'::date, 2, 50,
                    ', p_excluir => array[date ''' || :'l105' || ''', date ''' || :'l105'::date + 7 || ''']'),
  '22023', 'sin sesiones',
  'G · excluir todas las fechas: 22023'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- H · Estricta: la primera sesión (criterio 9)
-- =========================================================================

insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values ('a2100004-0000-4000-8000-000000000003', :P1, :PRO1, :CA, :TT21A,
        (:'l168'::date + time '10:00') at time zone 'Europe/Madrid',
        (:'l168'::date + time '10:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
values (:PRO1, null, 'festivo', :'l175'::date, :'l175'::date, 'Europe/Madrid', 'Festivo en la 1.ª sesión estricta');

select pg_temp.n21() as n_antes_h \gset

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l168'::date, 2, 50, ', p_estricta_primera => true'),
  '23P01', 'La primera sesión choca',
  'H · estricta con la 1.ª sesión ocupada: 23P01 con «La primera sesión choca»'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l175'::date, 2, 50, ', p_estricta_primera => true'),
  '22023', 'primera sesión cae en festivo',
  'H · estricta con la 1.ª sesión en festivo: 22023 con «primera sesión cae en festivo»'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  pg_temp.n21() = :'n_antes_h',
  'H · los dos rechazos estrictos no dejan NADA: ni citas, ni series, ni propuestas'
);

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, :'l182'::date, 2::smallint, null,
  p_estricta_primera => true
)::text as ser_h \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.citas where serie_id = ((:'ser_h'::jsonb)->>'serie_id')::uuid) = 2,
  'H · GEMELA: la misma serie estricta con la 1.ª sesión libre entra, con sus dos citas'
);

-- =========================================================================
-- I · Sala y nota operativa (criterio 10)
-- =========================================================================

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, :'l196'::date, 2::smallint, null,
  p_sala => 'Sala 3', p_nota_operativa => 'Traer informe'
)::text as ser_i \gset
select public.agenda_crear_cita(
  :P1, :PRO1, :CA, :TT21A, :'l197'::date, time '11:00', p_sala => 'Sala 3', p_nota_operativa => 'Traer informe'
)::text as cita_i \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 2 and bool_and(c.sala = 'Sala 3' and c.nota_operativa = 'Traer informe')
     from public.citas c where c.serie_id = ((:'ser_i'::jsonb)->>'serie_id')::uuid),
  'I · las dos citas de la serie llevan la sala y la nota operativa que se pasó'
);
select pg_temp.assert(
  (select c.sala = 'Sala 3' and c.nota_operativa = 'Traer informe' and c.serie_id is null
     from public.citas c where c.id = (:'cita_i')::uuid),
  'I · la cita suelta lleva la sala y la nota operativa que se pasó'
);

call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, :'l198'::date, time '11:00', ', p_nota_operativa => ''Traer informe'''),
  '42501', 'no escribe la nota operativa',
  'I · el técnico con nota en crear_cita: 42501 (choque 4)'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, :'l198'::date, time '11:00', ', p_nota_operativa => '''''),
  '42501', 'no escribe la nota operativa',
  'I · el técnico con la nota VACÍA en crear_cita: 42501 igual (la señal es «viene», no «tiene texto»)'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l196'::date + 14, 2, 50, ', p_nota_operativa => ''Traer informe'''),
  '42501', 'no escribe la nota operativa',
  'I · el técnico con nota en crear_serie: 42501 (choque 4)'
);
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21A, :'l198'::date, time '11:00', p_sala => 'Sala del técnico')::text as cita_i_tec \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select c.sala = 'Sala del técnico' and c.nota_operativa is null from public.citas c where c.id = (:'cita_i_tec')::uuid),
  'I · GEMELA: el técnico sin nota sí cita, con sala, y la nota queda nula'
);

-- =========================================================================
-- J · crear_cita (criterio 11)
-- =========================================================================

call pg_temp.como(:PRO1);
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21A, :'l210'::date, time '09:00')::text as cita_j \gset
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21A, :'domingo_marzo_21'::date, time '02:30')::text as cita_j_marzo \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select c.serie_id is null and not c.desviada and c.motivo_desviacion is null
      and (c.inicio at time zone 'Europe/Madrid') = (:'l210'::date + time '09:00')
      and c.fin - c.inicio = interval '50 minutes'
     from public.citas c where c.id = (:'cita_j')::uuid),
  'J · hora normal: sin serie, sin desviar, a la hora local pedida y de 50 minutos (la del tipo)'
);
select pg_temp.assert(
  (select c.desviada and c.motivo_desviacion = 'anomalia_horaria'
      and (c.inicio at time zone 'Europe/Madrid')::time = time '03:00'
     from public.citas c where c.id = (:'cita_j_marzo')::uuid),
  'J · 02:30 del domingo de marzo: la cita queda desviada por anomalia_horaria, a las 03:00 locales'
);

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, :'l042'::date, time '11:00'),
  '22023', 'tiene festivo o ausencia',
  'J · en un día de festivo: 22023'
);
select pg_temp.assert(
  public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21A, :'l043'::date, time '11:00') is not null,
  'J · GEMELA: el día siguiente, sin festivo, la misma cita entra'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, current_date - 1, time '10:00'),
  '22023', 'anterior a hoy',
  'J · ayer: 22023 con «anterior a hoy»'
);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_cita(%L, %L, %L, %L, (now() at time zone %L)::date, time %L)',
         :P1, :PRO1, :CA, :TT21A, 'Europe/Madrid', '00:01'),
  '22023', 'anterior a ahora',
  'J · hoy a las 00:01: 22023 con «anterior a ahora»'
);
select pg_temp.assert_lanza_codigo(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, :'l056'::date, time '11:00'),
  '23P01',
  'J · encima de otra cita del profesional (10:55-11:45): 23P01, la restricción de exclusión'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P2, :PRO1, :CA, :TT21A, :'l210'::date, time '12:00'),
  '42501', 'citar no crea el vínculo',
  'J · PRO1 con un paciente de PRO2: 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(:TEC2);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, :'l210'::date, time '12:00'),
  '42501', 'No autorizado para dar esta cita',
  'J · el técnico de CB en CA: 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(gen_random_uuid());
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21A, :'l210'::date, time '12:00'),
  '42501', 'No hay sesión activa con perfil',
  'J · sin perfil: 42501'
);
call pg_temp.reset_sesion();

-- La decisión D del propietario: quién puede figurar como profesional de una cita.
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PROBAJA, :CA, :TT21A, :'l270'::date, time '09:00'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · crear_cita para un profesional EN BAJA: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :TEC1, :CA, :TT21A, :'l270'::date, time '09:00'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · crear_cita con un técnico administrativo como profesional: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, gen_random_uuid(), :CA, :TT21A, :'l270'::date, time '09:00'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · crear_cita con un profesional que no existe: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PROBAJA, :CA, :TT21A, :'l270'::date, 2),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · crear_serie para un profesional EN BAJA: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :TEC1, :CA, :TT21A, :'l270'::date, 2),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · crear_serie con un técnico administrativo como profesional: 22023'
);
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21A, :'l270'::date, time '09:00')::text as cita_j_adm \gset
select public.agenda_crear_cita(:P1, :ADM, :CA, :TT21A, :'l271'::date, time '09:00')::text as cita_j_admpro \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 2 from public.citas c where c.id in ((:'cita_j_adm')::uuid, (:'cita_j_admpro')::uuid)),
  'D (propietario) · GEMELA: el administrador cita con un profesional activo, y también con un administrador activo como profesional'
);

-- El técnico se pone a sí mismo de profesional: A2 lo deja pasar (p_profesional_id = uid), D no.
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :TEC1, :CA, :TT21A, :'l272'::date, time '09:00'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'D (propietario) · un técnico que se pone a sí mismo de profesional (A2 le deja pasar): 22023'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K · Tipo de terapia y duración (criterios 12 y 13)
-- =========================================================================

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, null, :'l224'::date, time '09:00'),
  '22023', 'Falta el tipo de terapia',
  'K · crear_cita sin tipo: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, null, :'l224'::date, 2, 50, ', p_estricta_primera => true'),
  '22023', 'Falta el tipo de terapia',
  'K · crear_serie estricta sin tipo: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, gen_random_uuid(), :'l224'::date, time '09:00'),
  '22023', 'no existe en el catálogo',
  'K · crear_cita con un tipo que no existe: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, gen_random_uuid(), :'l224'::date, 2),
  '22023', 'no existe en el catálogo',
  'K · crear_serie con un tipo que no existe (no estricta: si viene, se valida siempre): 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21X, :'l224'::date, time '09:00'),
  '22023', 'dado de baja en el catálogo',
  'K · crear_cita con un tipo dado de baja: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21X, :'l224'::date, 2, 50, ', p_estricta_primera => true'),
  '22023', 'dado de baja en el catálogo',
  'K · crear_serie con un tipo dado de baja: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P1, :PRO1, :CA, :TT21B, :'l224'::date, time '09:00', ', 50::smallint'),
  '22023', 'no es la del tipo de terapia',
  'K · crear_cita de 50 minutos con un tipo de 90: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21B, :'l224'::date, 2, 50),
  '22023', 'no es la del tipo de terapia',
  'K · crear_serie de 50 minutos con un tipo de 90: 22023'
);

-- Gemelas: el tipo activo entra; el de 90 con duración nula toma los 90; la serie sin tipo
-- (no estricta, decisión C del propietario) se admite como hasta ahora.
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21B, :'l224'::date, time '14:00', null)::text as cita_k90 \gset
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21B, :'l224'::date, time '16:00', 90::smallint)::text as cita_k90b \gset
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21B, 'semanal', 1::smallint, time '10:00', null, :'l231'::date, 2::smallint, null
)::text as ser_k90 \gset
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, null, 'semanal', 1::smallint, time '12:00', 50::smallint, :'l238'::date, 2::smallint, null
)::text as ser_ksin \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 2 and bool_and(c.fin - c.inicio = interval '90 minutes')
     from public.citas c where c.id in ((:'cita_k90')::uuid, (:'cita_k90b')::uuid)),
  'K · GEMELA: un tipo de 90 con duración nula (o con 90) crea citas de 90 minutos'
);
select pg_temp.assert(
  (select count(*) = 2 and bool_and(c.fin - c.inicio = interval '90 minutes' and c.tipo_terapia_id = :TT21B)
     from public.citas c where c.serie_id = ((:'ser_k90'::jsonb)->>'serie_id')::uuid),
  'K · GEMELA: la serie de un tipo de 90 con duración nula crea citas de 90 minutos'
);
select pg_temp.assert(
  (select count(*) = 2 and bool_and(c.tipo_terapia_id is null)
     from public.citas c where c.serie_id = ((:'ser_ksin'::jsonb)->>'serie_id')::uuid),
  'K · decisión C: la serie NO estricta sin tipo se admite (el banco 16 y sus llamadas siguen igual)'
);

-- Criterio 13: no existe ninguna cita de un tipo de 90 que dure otra cosa.
select pg_temp.assert(
  (select count(*) filter (where c.fin - c.inicio <> interval '90 minutes') = 0 and count(*) >= 4
     from public.citas c where c.tipo_terapia_id = :TT21B),
  'K · criterio 13: ninguna cita del tipo de 90 minutos dura otra cosa que 90 (y hay al menos cuatro, para que no sea vacío)'
);

-- =========================================================================
-- L · El técnico agenda por las funciones, y no ve el tipo (criterios 14 y 15)
-- =========================================================================

call pg_temp.como(:TEC1);
select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT21A, :'l245'::date, time '09:00')::text as cita_l \gset
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, (:'l245'::date + 7), 2::smallint, null
)::text as ser_l \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select c.tipo_terapia_id = :TT21A from public.citas c where c.id = (:'cita_l')::uuid),
  'L · la cita del técnico queda con el tipo elegido (visto como postgres)'
);
select pg_temp.assert(
  (select count(*) = 2 and bool_and(c.tipo_terapia_id = :TT21A)
     from public.citas c where c.serie_id = ((:'ser_l'::jsonb)->>'serie_id')::uuid),
  'L · las citas de la serie del técnico quedan con el tipo elegido (visto como postgres)'
);
select pg_temp.assert(
  position((:TT21A)::text in :'cita_l') = 0 and position((:TT21A)::text in :'ser_l') = 0,
  'L · lo que las funciones DEVUELVEN al técnico no contiene el tipo de terapia (ADR-074)'
);

-- H16: el insert directo del técnico por la tabla.
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.citas
           (paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
         values (%L, %L, %L, %L, %L::timestamptz, %L::timestamptz, 'Europe/Madrid')$sql$,
    :P1, :PRO1, :CA, :TT21A,
    (:'l245'::date + time '12:00') at time zone 'Europe/Madrid',
    (:'l245'::date + time '12:50') at time zone 'Europe/Madrid'),
  '42501', 'row-level security',
  'H16 (T-028a): el técnico NO inserta citas por la tabla (fijaría el tipo): 42501 de RLS, la gemela es crear_cita'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- M · H23: el UPDATE del técnico, sin where, y el residuo C18TEC (criterio 16)
--
-- C18TEC (banco 18) es una cita FUTURA de CA con profesional_id = TEC1. Sin la exigencia
-- de rol en la rama del profesional, TEC1 la modifica por esa rama aunque la del técnico
-- haya desaparecido. Por eso la huella cubre TODAS las citas, la suya incluida.
-- =========================================================================

select md5(string_agg(id::text || coalesce(nota_operativa, '') || coalesce(tipo_terapia_id::text, ''),
                      ',' order by id)) as h_m_antes from public.citas \gset

call pg_temp.como(:TEC1);
do $$
declare v_n integer;
begin
  update public.citas set nota_operativa = 'm21-nota';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ASERCIÓN FALLIDA: M · el técnico cambió la nota de % citas con UPDATE sin WHERE', v_n;
  end if;
  raise notice 'OK: M · UPDATE sin WHERE del técnico sobre la nota: 0 filas';
end;
$$;
do $$
declare v_n integer;
begin
  update public.citas set tipo_terapia_id = 'a2100001-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'ASERCIÓN FALLIDA: M · el técnico cambió el tipo de % citas con UPDATE sin WHERE', v_n;
  end if;
  raise notice 'OK: M · UPDATE sin WHERE del técnico sobre el tipo: 0 filas';
end;
$$;
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select md5(string_agg(id::text || coalesce(nota_operativa, '') || coalesce(tipo_terapia_id::text, ''),
                         ',' order by id)) from public.citas) = :'h_m_antes',
  'M · la huella de nota y tipo de TODAS las citas (C18TEC incluida) es la misma tras los dos UPDATE del técnico'
);
select pg_temp.assert(
  (select nota_operativa is distinct from 'm21-nota' from public.citas where id = 'a1800004-0000-4000-8000-000000000008'),
  'M · C18TEC (cita de CA con el técnico como profesional_id) no cambió: la rama del profesional exige ser profesional'
);

-- GEMELAS de rol (criterio 18): el profesional y el administrador siguen escribiendo lo suyo.
call pg_temp.como(:PRO1);
do $$
declare v_n integer;
begin
  update public.citas set sala = 'M21 sala' where id = (select id from public.citas where profesional_id = 'b0030001-0000-4000-8000-000000000002' and inicio > now() order by id limit 1);
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'ASERCIÓN FALLIDA: M · GEMELA: PRO1 debía modificar una cita suya por UPDATE directo, y modificó %', v_n;
  end if;
  raise notice 'OK: M · GEMELA: el profesional modifica su cita por UPDATE directo';
end;
$$;
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values ('a2100004-0000-4000-8000-000000000010', :P1, :PRO1, :CA, :TT21A,
        (:'l260'::date + time '09:00') at time zone 'Europe/Madrid',
        (:'l260'::date + time '09:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
do $$
declare v_n integer;
begin
  update public.citas set sala = 'M21 sala admin' where id = 'a2100004-0000-4000-8000-000000000010';
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'ASERCIÓN FALLIDA: M · GEMELA: ADM debía modificar una cita por UPDATE directo, y modificó %', v_n;
  end if;
  raise notice 'OK: M · GEMELA: el administrador modifica por UPDATE directo';
end;
$$;
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values ('a2100004-0000-4000-8000-000000000011', :P2, :PRO2, :CB, :TT21A,
        (:'l261'::date + time '09:00') at time zone 'Europe/Madrid',
        (:'l261'::date + time '09:50') at time zone 'Europe/Madrid',
        'Europe/Madrid');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 2 from public.citas where id in ('a2100004-0000-4000-8000-000000000010', 'a2100004-0000-4000-8000-000000000011')),
  'M · GEMELAS: el profesional (con su paciente) y el administrador SIGUEN insertando citas por la tabla'
);

-- =========================================================================
-- N · H24: el técnico no lee series_cita (criterio 17)
-- =========================================================================

call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar('select tipo_terapia_id from public.series_cita') = 0,
  'N · el técnico lee CERO filas de series_cita (no ve el tipo por la tabla de series)'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select tipo_terapia_id from public.series_cita where id = %L',
                        ((:'ser_l'::jsonb)->>'serie_id'))) = 1,
  'N · GEMELA: el administrador sí lee la serie que creó el técnico'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select tipo_terapia_id from public.series_cita where id = %L',
                        ((:'ser_l'::jsonb)->>'serie_id'))) = 1,
  'N · GEMELA: el profesional dueño sí lee la serie'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- O · Lo que la revisión de T-028a encontró sin prueba que muerda
--
-- Anclas a partir de +280 (pueden pasar al año + 4: ningún banco llega ahí).
-- =========================================================================

-- O1 · R1-H2 · D10: la alternativa nunca es otra sesión de la misma serie. Festivo en el lunes
-- de la 1.ª sesión y ausencia de martes a domingo: el único día libre de los siete siguientes
-- es el lunes de la 2.ª sesión. Sin D10, el plan lo propondría.
insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo) values
  (:PRO1, null, 'festivo',  :'l280'::date, :'l280'::date, 'Europe/Madrid', 'R1-H2 festivo'),
  (:PRO1, null, 'ausencia', :'l281'::date, :'l286'::date, 'Europe/Madrid', 'R1-H2 ausencia mar-dom');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select s->>'bloqueo' = 'festivo' and s->'alternativa' = 'null'::jsonb
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, 'semanal', 1::smallint, time '10:00', 50::smallint,
                                             :'l280'::date, 2::smallint) -> 'sesiones') s
    where (s->>'fecha')::date = :'l280'::date),
  'O1 (R1-H2) · D10: con la semana ocupada salvo el lunes de la 2.ª sesión, la 1.ª no propone la 2.ª: alternativa nula'
);
select pg_temp.assert(
  (select s->>'bloqueo' is null
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, null, null, time '10:00', 50::smallint,
                                             :'l287'::date, null) -> 'sesiones') s),
  'O1 (R1-H2) · GEMELA: ese lunes de la 2.ª sesión está libre: lo único que lo descarta como alternativa es D10'
);
call pg_temp.reset_sesion();

-- O2 · R1-H1 · La alternativa tampoco es una fecha EXCLUIDA. Mismo dibujo, y la 2.ª sesión
-- excluida (vacaciones del paciente): la propuesta de la 1.ª no puede caer en ella.
insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo) values
  (:PRO1, null, 'festivo',  :'l294'::date, :'l294'::date, 'Europe/Madrid', 'R1-H1 festivo'),
  (:PRO1, null, 'ausencia', :'l295'::date, :'l300'::date, 'Europe/Madrid', 'R1-H1 ausencia mar-dom');

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, :'l294'::date, 3::smallint, null,
  p_excluir => array[:'l301'::date]
)::text as ser_o2 \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 1 and bool_and(pc.fecha_prevista = :'l294'::date and pc.inicio_propuesto is null
                                    and pc.fin_propuesto is null and pc.motivo = 'festivo')
     from public.propuestas_cita pc where pc.serie_id = ((:'ser_o2'::jsonb)->>'serie_id')::uuid),
  'O2 (R1-H1) · la propuesta del festivo NO cae en el lunes excluido: sin alternativa, fecha prevista la suya'
);
select pg_temp.assert(
  (select count(*) = 1 and bool_and((c.inicio at time zone 'Europe/Madrid')::date = :'l308'::date)
     from public.citas c where c.serie_id = ((:'ser_o2'::jsonb)->>'serie_id')::uuid),
  'O2 (R1-H1) · la serie deja una sola cita, la de la 3.ª sesión; nada en la excluida'
);
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select s->>'bloqueo' is null
     from jsonb_array_elements(
            public.agenda_previsualizar_alta(:P1, :PRO1, :CA, null, null, time '10:00', 50::smallint,
                                             :'l301'::date, null) -> 'sesiones') s),
  'O2 (R1-H1) · GEMELA: el lunes excluido está libre: lo único que lo descarta como alternativa es la exclusión'
);
call pg_temp.reset_sesion();

-- O3 · R1-H3 · M9: la 1.ª sesión estricta va SIN bloque de excepción. La carrera entre el plan
-- y el insert se simula con un disparador que rechaza con 23P01 una sala marcada: el plan la ve
-- libre, así que el 23P01 solo puede venir del insert (el fragmento lo demuestra).
create function public.t028a_banco_carrera() returns trigger
language plpgsql
as $$
begin
  if new.sala = 'R1-H3 carrera' then
    raise exception 'carrera simulada (banco 21, R1-H3)' using errcode = '23P01';
  end if;
  return new;
end;
$$;
create trigger t028a_banco_carrera before insert on public.citas
  for each row execute function public.t028a_banco_carrera();

select pg_temp.n21() as n_antes_o3 \gset

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l315'::date, 2, 50,
                    ', p_sala => ''R1-H3 carrera'', p_estricta_primera => true'),
  '23P01', 'carrera simulada',
  'O3 (R1-H3) · estricta y la 1.ª sesión pierde la carrera en el insert: 23P01 del insert, no propuesta'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  pg_temp.n21() = :'n_antes_o3',
  'O3 (R1-H3) · el 23P01 de la carrera deshace TODO: ni serie, ni citas, ni propuestas'
);

call pg_temp.como(:PRO1);
select public.agenda_crear_serie(
  :P1, :PRO1, :CA, :TT21A, 'semanal', 1::smallint, time '10:00', 50::smallint, :'l315'::date, 2::smallint, null,
  p_sala => 'R1-H3 carrera'
)::text as ser_o3 \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) = 2 and bool_and(pc.motivo = 'ocupada' and pc.inicio_propuesto is null)
     from public.propuestas_cita pc where pc.serie_id = ((:'ser_o3'::jsonb)->>'serie_id')::uuid)
  and (select count(*) = 0 from public.citas c where c.serie_id = ((:'ser_o3'::jsonb)->>'serie_id')::uuid),
  'O3 (R1-H3) · GEMELA: sin estricta, la misma carrera vuelve cada sesión una propuesta ocupada sin hora'
);

drop trigger t028a_banco_carrera on public.citas;
drop function public.t028a_banco_carrera();

-- O4 · R1-H4 · Decisión D con el TERCER estado: un profesional suspendido tampoco puede ser el
-- profesional de una cita. PRO2 se suspende como postgres y se restaura al final.
update public.perfiles set estado = 'suspendido' where id = :PRO2;

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO2, :CB, :'l343', :'l343'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'O4 (R1-H4) · los bloques de un profesional SUSPENDIDO: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P2, :PRO2, :CB, 'semanal', 1, time '10:00', 50, :'l343'::date, 2),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'O4 (R1-H4) · previsualizar con un profesional SUSPENDIDO: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_cita(:P2, :PRO2, :CB, :TT21A, :'l343'::date, time '09:00'),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'O4 (R1-H4) · crear_cita para un profesional SUSPENDIDO: 22023'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P2, :PRO2, :CB, :TT21A, :'l343'::date, 2),
  '22023', 'no es un profesional sanitario ni un administrador activo',
  'O4 (R1-H4) · crear_serie para un profesional SUSPENDIDO: 22023'
);
call pg_temp.reset_sesion();

update public.perfiles set estado = 'activo' where id = :PRO2;

call pg_temp.como(:ADM);
select public.agenda_crear_cita(:P2, :PRO2, :CB, :TT21A, :'l343'::date, time '09:00')::text as cita_o4 \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) = 1 from public.citas c where c.id = (:'cita_o4')::uuid),
  'O4 (R1-H4) · GEMELA: el mismo profesional, otra vez activo, sí recibe la cita'
);

-- O5 · R1-H7 · Cero ocurrencias sin excluir nada no es «excluir todas». Ni por número de
-- sesiones (0) ni por un final anterior a la primera fecha.
select pg_temp.n21() as n_antes_o5 \gset

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l330'::date, 0),
  '22023', 'no tiene ninguna sesión',
  'O5 (R1-H7) · cero sesiones: 22023 con «no tiene ninguna sesión», no «Excluir todas»'
);
select pg_temp.assert_lanza_codigo_msg(
  format($f$select public.agenda_crear_serie(%L, %L, %L, %L, 'semanal', 1::smallint, time '10:00',
                50::smallint, %L::date, null, %L::date)$f$,
         :P1, :PRO1, :CA, :TT21A, :'l330', :'l335'),
  '22023', 'no tiene ninguna sesión',
  'O5 (R1-H7) · un final (domingo) anterior al primer lunes: 22023 con «no tiene ninguna sesión»'
);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_serie(:P1, :PRO1, :CA, :TT21A, :'l330'::date, 1, 50,
                    ', p_excluir => array[date ''' || (:'l330'::date + 6) || ''']'),
  '22023', 'sin sesiones',
  'O5 (R1-H7) · GEMELA: excluir la única sesión sigue diciendo «sin sesiones»'
);
-- RD2-H2 · Previsualizar con la misma entrada dice lo mismo que crear, en vez de un plan vacío.
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_prev(:P1, :PRO1, :CA, 'semanal', 1, time '10:00', 50, :'l330'::date, 0),
  '22023', 'no tiene ninguna sesión',
  'O5 (RD2-H2) · previsualizar con cero sesiones: 22023 con «no tiene ninguna sesión», no {"sesiones": []}'
);
select pg_temp.assert(
  jsonb_array_length(
    public.agenda_previsualizar_alta(:P1, :PRO1, :CA, 'semanal', 1::smallint, time '10:00', 50::smallint,
                                     :'l330'::date, 1::smallint) -> 'sesiones') = 1,
  'O5 (RD2-H2) · GEMELA: previsualizar la misma serie con una sesión enseña esa sesión'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  pg_temp.n21() = :'n_antes_o5',
  'O5 (R1-H7) · ninguno de los tres rechazos deja nada'
);

\echo '21-alta-de-cita: completa.'
