-- T-039 · La cita apunta a su episodio y lleva si es presencial u online (ADR-075).
--
-- Va al final (23), con el siguiente número (README, punto 7). El 21 es de T-028a y el 22 de T-015.
-- Reutiliza los actores de 01-fijacion.sql (ADM, PRO1 con alta en CA, PRO2 en CB, TEC1 de CA, TEC2
-- de CB) y define los suyos: pacientes P39, Q39, R39, S39, V39, W39, Z39 y los episodios E39, EP39,
-- F39, EC39, EB39, ES39 y EZ39.
--
-- LA PRIMERA ASERCIÓN ES LA 23.A1 y nada del banco la precede: sin la migración, el banco muere
-- ahí y por ese motivo (que la columna no existe), no por un import roto ni por una fijación ajena.
--
-- ANCLAS. Las citas por las funciones de alta caen en el año + 4 (los bancos 16 y 21 usan hasta el
-- año + 3). Las citas «antiguas» o de fecha relativa a hoy se insertan directamente, como
-- `postgres`, a horas distintas entre sí (PRO1 tiene descanso de diez minutos desde el 21).
--
-- Una negativa sin su gemela positiva no distingue una regla de una puerta cerrada para todos.
-- Las negativas llevan fragmento (`assert_lanza_codigo_msg`) para demostrar POR DÓNDE fallan.

\echo ''
\echo '=== 23-cita-en-episodio ==='

-- ---------------------------------------------------------------------------
-- A · Forma (criterios 2 y 3). Nada antes de A1 nombra el enum ni las columnas.
-- ---------------------------------------------------------------------------

select pg_temp.assert(
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'citas'        and column_name in ('modalidad_asistencia', 'episodio_id'))
        or (table_name = 'series_cita'  and column_name in ('modalidad_asistencia', 'episodio_id')))) = 4,
  '23.A1 citas y series_cita tienen modalidad_asistencia y episodio_id'
);

select pg_temp.assert(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('citas', 'series_cita')
      and column_name = 'modalidad_asistencia' and is_nullable = 'NO'
      and column_default like '''presencial''%') = 2
  and (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name in ('citas', 'series_cita')
          and column_name = 'episodio_id' and is_nullable = 'YES') = 2,
  '23.A2 modalidad_asistencia es not null con valor por defecto presencial; episodio_id admite nulo'
);

select pg_temp.assert(
  (select count(*) from pg_constraint k
     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any (k.conkey)
    where k.contype = 'f' and a.attname = 'episodio_id'
      and k.conrelid in ('public.citas'::regclass, 'public.series_cita'::regclass)
      and k.confrelid = 'public.episodios_asistenciales'::regclass) = 2,
  '23.A3 las dos columnas episodio_id son clave ajena a episodios_asistenciales'
);

select pg_temp.assert(
  enum_range(null::public.modalidad_asistencia)::text = '{presencial,online}',
  '23.A4 el enum modalidad_asistencia es exactamente presencial y online (Q3-A: ni telepsicología ni otro valor)'
);

-- Criterio 3: la modalidad RELACIONAL y los participantes están bajo el candado; ni la cita, ni la
-- serie, ni la vista del técnico, ni la lectura de la agenda los enseñan.
select pg_temp.assert(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name in ('citas', 'series_cita', 'citas_agenda')
      and (column_name like '%relacional%' or column_name like '%participante%')) = 0
  and position('relacional' in (select pg_get_function_result(p.oid) from pg_proc p
                                 where p.proname = 'agenda_citas_rango' and p.pronamespace = 'public'::regnamespace)) = 0
  and position('participante' in (select pg_get_function_result(p.oid) from pg_proc p
                                   where p.proname = 'agenda_citas_rango' and p.pronamespace = 'public'::regnamespace)) = 0,
  '23.A5 ninguna cita, serie, vista ni lectura de agenda lleva columnas de modalidad relacional ni de participantes'
);

-- Criterio 8 (forma): el cierre de las dos columnas es de PRIVILEGIO, igual para los tres roles.
select pg_temp.assert(
  not has_column_privilege('authenticated', 'public.citas', 'episodio_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.citas', 'episodio_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.citas', 'modalidad_asistencia', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.citas', 'modalidad_asistencia', 'INSERT')
  and has_column_privilege('authenticated', 'public.citas', 'sala', 'UPDATE')
  and has_column_privilege('authenticated', 'public.citas', 'sala', 'INSERT')
  and not has_table_privilege('authenticated', 'public.series_cita', 'INSERT')
  and not has_table_privilege('authenticated', 'public.series_cita', 'UPDATE')
  and not has_table_privilege('service_role', 'public.citas', 'UPDATE'),
  '23.A6 authenticated no escribe episodio_id ni modalidad_asistencia de citas (la gemela, sala, sí), y series_cita sigue cerrada'
);

select pg_temp.assert(
  (select reloptions from pg_class where oid = 'public.citas_agenda'::regclass) @> array['security_barrier=true', 'security_invoker=false'],
  '23.A7 citas_agenda conserva security_barrier=true y security_invoker=false (el with(...) se repitió)'
);

select pg_temp.assert(
  (select count(*) from pg_proc where proname = 'agenda_crear_cita'  and pronamespace = 'public'::regnamespace) = 1
  and (select count(*) from pg_proc where proname = 'agenda_crear_serie' and pronamespace = 'public'::regnamespace) = 1
  and (select count(*) from pg_proc where proname = 'agenda_citas_rango' and pronamespace = 'public'::regnamespace) = 1
  and has_function_privilege('authenticated', 'public.agenda_crear_cita(uuid,uuid,uuid,uuid,date,time,smallint,text,text,public.modalidad_asistencia,uuid)'::regprocedure, 'execute')
  and has_function_privilege('authenticated', 'public.agenda_crear_serie(uuid,uuid,uuid,uuid,public.periodicidad_serie,smallint,time,smallint,date,smallint,date,date[],text,text,boolean,public.modalidad_asistencia,uuid)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.agenda_crear_cita(uuid,uuid,uuid,uuid,date,time,smallint,text,text,public.modalidad_asistencia,uuid)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.agenda_crear_serie(uuid,uuid,uuid,uuid,public.periodicidad_serie,smallint,time,smallint,date,smallint,date,date[],text,text,boolean,public.modalidad_asistencia,uuid)'::regprocedure, 'execute'),
  '23.A8 una sola agenda_crear_cita y una sola agenda_crear_serie (drop + create, sin sobrecarga), con grant a authenticated y no a anon'
);

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.agenda_cambiar_asistencia(uuid,public.modalidad_asistencia)'::regprocedure, 'execute')
  and has_function_privilege('authenticated', 'public.agenda_cambiar_episodio_cita(uuid,uuid)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.agenda_cambiar_asistencia(uuid,public.modalidad_asistencia)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.agenda_cambiar_episodio_cita(uuid,uuid)'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.rellenar_episodio_de_citas()'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.rellenar_episodio_de_citas()'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.cita_episodio_coherente(uuid,uuid,uuid,date)'::regprocedure, 'execute')
  and not has_function_privilege('authenticated', 'public.cita_episodio_unico(uuid,uuid,date)'::regprocedure, 'execute'),
  '23.A9 las dos funciones nuevas las ejecuta authenticated; el relleno y los dos predicados son internos'
);

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.agenda_citas_rango(timestamptz,timestamptz)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.agenda_citas_rango(timestamptz,timestamptz)'::regprocedure, 'execute')
  and not has_function_privilege('service_role', 'public.agenda_citas_rango(timestamptz,timestamptz)'::regprocedure, 'execute')
  and has_table_privilege('authenticated', 'public.citas_agenda', 'SELECT')
  and not has_table_privilege('anon', 'public.citas_agenda', 'SELECT'),
  '23.A10 el drop + create de agenda_citas_rango y la vista conservan sus permisos (authenticated sí; anon y service_role no)'
);

select pg_temp.assert(
  (select count(*) from pg_trigger t
    where not t.tgisinternal
      and t.tgname in ('velar_episodio_de_cita', 'velar_episodio_de_serie', 'congelar_episodio_por_citas',
                       'congelar_participante_por_citas', 'exigir_nota_en_episodio_de_su_cita')) = 5,
  '23.A11 existen los cinco disparadores nuevos'
);

-- ---------------------------------------------------------------------------
-- Fijación (como postgres, después de la sección A)
-- ---------------------------------------------------------------------------

\set TT39 '\'a3900001-0000-4000-8000-000000000001\''

\set P39 '\'d0390001-0000-4000-8000-000000000001\''
\set Q39 '\'d0390001-0000-4000-8000-000000000002\''
\set R39 '\'d0390001-0000-4000-8000-000000000003\''
\set S39 '\'d0390001-0000-4000-8000-000000000004\''
\set V39 '\'d0390001-0000-4000-8000-000000000005\''
\set W39 '\'d0390001-0000-4000-8000-000000000006\''
\set Z39 '\'d0390001-0000-4000-8000-000000000007\''
\set H39 '\'d0390001-0000-4000-8000-000000000008\''

\set E39  '\'e0390001-0000-4000-8000-000000000001\''
\set EP39 '\'e0390001-0000-4000-8000-000000000002\''
\set F39  '\'e0390001-0000-4000-8000-000000000003\''
\set EC39 '\'e0390001-0000-4000-8000-000000000004\''
\set EB39 '\'e0390001-0000-4000-8000-000000000005\''
\set ES39 '\'e0390001-0000-4000-8000-000000000006\''
\set EZ39 '\'e0390001-0000-4000-8000-000000000007\''
\set EK39 '\'e0390001-0000-4000-8000-000000000008\''

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen, activo) values
  (:TT39, 'Terapia T-039 50', 50, 'exento_sanitario', true);

-- P39: titular de E39 y de EP39 (dos abiertos con PRO1: la resolución automática da nulo).
-- Q39: participante activo de EP39 y de nada más (la resolución da EP39).
-- R39: titular de EC39, cerrado: ningún abierto (la resolución da nulo).
-- S39: titular de ES39 y de nada más (la resolución da ES39).
-- V39: participante de EB39 con baja el día de hoy. W39: titular de EB39.
-- Z39: solo tiene un episodio abierto de PRO2 (la resolución de PRO1 da nulo).
-- H39: de PRO2 en el centro B; entrará en EP39 en la sección J.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P39, 'Paula',  'Titular39',  :PRO1, :CA),
  (:Q39, 'Quique', 'Pareja39',   :PRO1, :CA),
  (:R39, 'Rosa',   'Ajena39',    :PRO1, :CA),
  (:S39, 'Sergio', 'Unico39',    :PRO1, :CA),
  (:V39, 'Vera',   'DeBaja39',   :PRO1, :CA),
  (:W39, 'Wanda',  'Titular39',  :PRO1, :CA),
  (:Z39, 'Zaira',  'DeOtro39',   :PRO1, :CA),
  (:H39, 'Hugo',   'Coterapia39', :PRO2, :CB);

insert into public.episodios_asistenciales
  (id, paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en, cerrado_en) values
  (:E39,  :P39, :PRO1, :CA, 'individual', current_date - 60, null),
  (:EP39, :P39, :PRO1, :CA, 'pareja',     current_date - 60, null),
  (:F39,  :P39, :PRO2, :CB, 'individual', current_date - 60, null),
  (:EC39, :R39, :PRO1, :CA, 'individual', current_date - 60, current_date + 5),
  (:EB39, :W39, :PRO1, :CA, 'pareja',     current_date - 60, null),
  (:ES39, :S39, :PRO1, :CA, 'individual', current_date - 60, null),
  (:EZ39, :Z39, :PRO2, :CB, 'individual', current_date - 60, null),
  (:EK39, :R39, :PRO1, :CA, 'individual', current_date - 60, null);

insert into public.episodio_participantes (episodio_id, paciente_id, papel, alta_en, baja_en) values
  (:EP39, :P39, 'miembro', current_date - 30, null),
  (:EP39, :Q39, 'miembro', current_date - 30, null),
  (:EB39, :W39, 'miembro', current_date - 40, null),
  (:EB39, :V39, 'miembro', current_date - 40, current_date);

-- Año + 4 y su primer lunes de mayo: las citas por las funciones de alta.
select (extract(year from now())::int + 4) as anio_39 \gset
select (make_date(:anio_39, 5, 1) + ((8 - extract(isodow from make_date(:anio_39, 5, 1))::int) % 7))::text as lunes_39 \gset

create function pg_temp.dia39(p_n int) returns date
language sql immutable as $$ select (:'lunes_39'::date + p_n) $$;

-- Un instante a una hora local de Madrid, relativo a hoy.
create function pg_temp.ts39(p_dias int, p_hora time) returns timestamptz
language sql stable as $$ select ((current_date + p_dias) + p_hora) at time zone 'Europe/Madrid' $$;

-- Texto de un insert directo de una cita (como postgres), de 20 minutos, con episodio opcional.
create function pg_temp.sql_ins39(p_pac uuid, p_pro uuid, p_dias int, p_hora time, p_epi uuid)
returns text language sql stable as $$
  select format($f$insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, episodio_id)
                   values (%L, %L, %L, %L, %L, 'Europe/Madrid', %L)$f$,
                p_pac, p_pro, (select centro_id from public.pacientes where id = p_pac),
                pg_temp.ts39(p_dias, p_hora), pg_temp.ts39(p_dias, p_hora) + interval '20 minutes', p_epi)
$$;

create function pg_temp.sql_serie39(p_pac uuid, p_pro uuid, p_epi uuid)
returns text language sql stable as $$
  select format($f$insert into public.series_cita
                     (paciente_id, profesional_id, centro_id, periodicidad, dia_semana, hora_local, zona_horaria,
                      duracion_minutos, sesiones_totales, creada_por, episodio_id)
                   values (%L, %L, %L, 'semanal', 3, time '09:00', 'Europe/Madrid', 50, 5, %L, %L)$f$,
                p_pac, p_pro, (select centro_id from public.pacientes where id = p_pac), p_pro, p_epi)
$$;

-- El mensaje de un error (o 'sin error'), para comparar mensajes entre llamadas.
create function pg_temp.sqlerrm39(p_consulta text) returns text
language plpgsql as $$
begin
  execute p_consulta;
  return 'sin error';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;

-- Franja con un festivo para PRO1 en la tercera semana: la serie de M lo cruza y deja una propuesta.
insert into public.disponibilidad (perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
values (:PRO1, :CA, 'festivo', pg_temp.dia39(21), pg_temp.dia39(21), 'Europe/Madrid', 'Festivo de prueba T-039');

-- El PIN de PRO1 es 111111 desde 01. Lo que sigue lo da por sabido.

-- ---------------------------------------------------------------------------
-- R · Relleno (criterios 4 y 5). Cada caso es un dato de ANTES de T-039.
-- ---------------------------------------------------------------------------

-- Citas antiguas, como postgres. Las notas de (a) y (b) se insertan con el disparador de la nota
-- apagado y se vuelve a encender justo después: son datos de antes de T-039 y es la única forma de
-- que existan.
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, -20, time '05:00', null), 'R · fijación de la cita Ra');
select id as c_ra from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(-20, time '05:00') \gset
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, -20, time '07:00', null), 'R · fijación de la cita Rb');
select id as c_rb from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(-20, time '07:00') \gset
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:S39, :PRO1, -20, time '09:00', null), 'R · fijación de la cita Rc');
select id as c_rc from public.citas where paciente_id = :S39 and inicio = pg_temp.ts39(-20, time '09:00') \gset
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, -20, time '11:00', null), 'R · fijación de la cita Rd');
select id as c_rd from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(-20, time '11:00') \gset
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:V39, :PRO1, 3, time '05:00', null), 'R · fijación de la cita Re (participante de baja)');
select id as c_re from public.citas where paciente_id = :V39 and inicio = pg_temp.ts39(3, time '05:00') \gset
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, -20, time '13:00', :E39), 'R · fijación de la cita Rf (ya con episodio)');
select id as c_rf from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(-20, time '13:00') \gset

alter table public.notas_clinicas disable trigger exigir_nota_en_episodio_de_su_cita;
insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values
  (:P39, :E39, :PRO1, :'c_ra'),
  (:P39, :E39, :PRO1, :'c_rb'),
  (:P39, :F39, :PRO2, :'c_rb');
alter table public.notas_clinicas enable trigger exigir_nota_en_episodio_de_su_cita;

-- Una serie sin episodio, de un paciente con un solo abierto (S39), y otra con dos (P39).
select pg_temp.assert_no_lanza(pg_temp.sql_serie39(:S39, :PRO1, null), 'R · fijación de la serie Rs1');
select id as s_rs1 from public.series_cita where paciente_id = :S39 and episodio_id is null order by creada_en desc limit 1 \gset
select pg_temp.assert_no_lanza(pg_temp.sql_serie39(:P39, :PRO1, null), 'R · fijación de la serie Rs2');
select id as s_rs2 from public.series_cita where paciente_id = :P39 and episodio_id is null order by creada_en desc limit 1 \gset

create temp table antes_r39 as select id, to_jsonb(c) - 'episodio_id' as j from public.citas c;
select count(*) as n_citas_antes from public.citas \gset
select count(*) as n_citas_sin_epi_antes from public.citas where episodio_id is null \gset
select count(*) as n_audit_antes from public.auditoria where tabla = 'citas' \gset

select public.rellenar_episodio_de_citas()::text as relleno_1 \gset
select public.rellenar_episodio_de_citas()::text as relleno_2 \gset

select pg_temp.assert(
  (select episodio_id from public.citas where id = :'c_ra') = :E39,
  '23.R(a) una cita con una nota en E39 recibe E39 (por nota)'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'c_rb') is null,
  '23.R(b) una cita con dos notas en dos episodios distintos se queda nula (de cualquier autor)'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'c_rc') = :ES39,
  '23.R(c) una cita sin notas cuyo paciente tiene un solo candidato coherente recibe ese'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'c_rd') is null,
  '23.R(d) una cita sin notas con dos candidatos se queda nula'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'c_re') is null,
  '23.R(e) la cita de un participante dado de baja antes de su fecha se queda nula'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'c_rf') = :E39,
  '23.R(f) una cita que ya traía episodio no se toca'
);
select pg_temp.assert(
  (select episodio_id from public.series_cita where id = :'s_rs1') = :ES39
  and (select episodio_id from public.series_cita where id = :'s_rs2') is null,
  '23.R(s) una serie recibe su único abierto; con dos abiertos se queda nula'
);
select pg_temp.assert(
  (select count(*) from public.citas) = :n_citas_antes
  and not exists (
    select 1 from antes_r39 a join public.citas c on c.id = a.id
     where a.j is distinct from (to_jsonb(c) - 'episodio_id')),
  '23.R el relleno solo escribe episodio_id: ninguna otra columna de ninguna cita cambia y no hay altas ni bajas'
);
select pg_temp.assert(
  (select count(*) from public.citas where episodio_id is null) <= :n_citas_sin_epi_antes
  and ((:'relleno_1'::jsonb)->>'por_nota')::int + ((:'relleno_1'::jsonb)->>'por_candidato')::int
        + ((:'relleno_1'::jsonb)->>'nulas')::int = :n_citas_sin_epi_antes,
  '23.R los recuentos del relleno (por nota + por candidato + nulas) suman las citas que estaban sin episodio'
);
select pg_temp.assert(
  ((:'relleno_2'::jsonb)->>'por_nota')::int + ((:'relleno_2'::jsonb)->>'por_candidato')::int
    + ((:'relleno_2'::jsonb)->>'series')::int = 0,
  '23.R el relleno es idempotente: la segunda llamada no rellena nada'
);

-- Criterio 5: la función es interna.
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg('select public.rellenar_episodio_de_citas()', '42501', 'permission denied',
  '23.R5 ADM no ejecuta el relleno');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg('select public.rellenar_episodio_de_citas()', '42501', 'permission denied',
  '23.R5 PRO1 no ejecuta el relleno');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg('select public.rellenar_episodio_de_citas()', '42501', 'permission denied',
  '23.R5 TEC1 no ejecuta el relleno');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- C · Coherencia de la cita y de la serie con su episodio (criterio 6), como postgres
-- ---------------------------------------------------------------------------

select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_ins39(:P39, :PRO1, 3, time '07:00', :F39), '23514',
  'no son del mismo profesional', '23.C1 V1 · el episodio de OTRO profesional no vale');
select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_ins39(:R39, :PRO1, 3, time '09:00', :EP39), '23514',
  'no es titular ni participante del episodio', '23.C2 V2 · un paciente ajeno al episodio no vale');
select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_ins39(:V39, :PRO1, 3, time '11:00', :EB39), '23514',
  'no estaba de alta en el episodio', '23.C3 V3 · un participante dado de baja antes del día de la cita no vale');
select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_ins39(:R39, :PRO1, 6, time '05:00', :EC39), '23514',
  'se cerró antes del día de la cita', '23.C4 V4 · un episodio cerrado antes del día de la cita no vale');

select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, 4, time '05:00', :EP39), '23.C1b gemela · el titular entra');
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:Q39, :PRO1, 4, time '07:00', :EP39), '23.C2b gemela · el participante activo entra');
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:V39, :PRO1, 0, time '03:00', :EB39),
  '23.C3b gemela · el participante cuya baja es el mismo día de la cita entra (baja_en >= fecha)');
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:R39, :PRO1, 5, time '05:00', :EC39),
  '23.C4b gemela · el episodio cerrado el mismo día de la cita entra (cerrado_en >= fecha)');

-- Un UPDATE tampoco se salta la regla: el cambio de episodio y el de paciente se vigilan.
select id as c_cu from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(4, time '05:00') \gset
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set episodio_id = %L where id = %L', :F39, :'c_cu'), '23514',
  'no son del mismo profesional', '23.C5 un UPDATE de episodio_id incoherente también lanza');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set paciente_id = %L where id = %L', :R39, :'c_cu'), '23514',
  'no es titular ni participante del episodio', '23.C6 un UPDATE de paciente_id que descoloca el episodio también lanza');

-- Series: S1, S2 y S3 con sus gemelas.
select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_serie39(:P39, :PRO1, :F39), '23514',
  'no son del mismo profesional de la serie', '23.C7 S1 · la serie con el episodio de otro profesional no vale');
select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_serie39(:R39, :PRO1, :EP39), '23514',
  'no es titular ni participante activo', '23.C8 S2 · la serie de un paciente ajeno al episodio no vale');
select pg_temp.assert_lanza_codigo_msg(pg_temp.sql_serie39(:R39, :PRO1, :EC39), '23514',
  'apunta a un episodio cerrado', '23.C9 S3 · la serie sobre un episodio cerrado no vale');
select pg_temp.assert_no_lanza(pg_temp.sql_serie39(:P39, :PRO1, :EP39), '23.C7b gemela · la serie del titular entra');
select pg_temp.assert_no_lanza(pg_temp.sql_serie39(:Q39, :PRO1, :EP39), '23.C8b gemela · la serie del participante activo entra');

-- ---------------------------------------------------------------------------
-- K · Los congelados de episodio y participante (criterio 7), como postgres
-- ---------------------------------------------------------------------------

select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set profesional_id = %L where id = %L', :PRO2, :EP39), '42501',
  'tiene citas: su paciente y su profesional no cambian', '23.K1 un episodio con citas no cambia de profesional');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodios_asistenciales set paciente_id = %L where id = %L', :Q39, :EP39), '42501',
  'tiene citas: su paciente y su profesional no cambian', '23.K2 un episodio con citas no cambia de paciente');
select pg_temp.assert_lanza_codigo_msg(
  format('delete from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EP39, :Q39), '42501',
  'tiene citas en este episodio', '23.K3 un participante con citas en el episodio no se borra');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.episodio_participantes set paciente_id = %L where episodio_id = %L and paciente_id = %L', :R39, :EP39, :Q39), '42501',
  'tiene citas en este episodio', '23.K4 un participante con citas en el episodio no cambia de paciente');

-- Gemelas: un episodio y un participante SIN citas se mueven; y un episodio con citas admite un cambio
-- que no toca a su paciente ni a su profesional.
select pg_temp.assert_no_lanza(
  format('update public.episodios_asistenciales set profesional_id = %L where id = %L', :PRO2, :EK39),
  '23.K1b gemela · un episodio sin citas cambia de profesional');
select pg_temp.assert_no_lanza(
  format('update public.episodios_asistenciales set motivo_consulta = %L where id = %L', 'Revisado', :EP39),
  '23.K2b gemela · un episodio con citas admite un cambio que no toca ni su paciente ni su profesional');
insert into public.episodio_participantes (episodio_id, paciente_id, papel) values (:EK39, :Q39, 'miembro');
select pg_temp.assert_no_lanza(
  format('delete from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EK39, :Q39),
  '23.K3b gemela · un participante sin citas en el episodio se borra');

-- ---------------------------------------------------------------------------
-- W · Quién escribe episodio_id y modalidad_asistencia a mano (criterio 8): nadie
-- ---------------------------------------------------------------------------

select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, 7, time '05:00', null), 'W · fijación de la cita CW');
select id as c_w from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(7, time '05:00') \gset

create temp table w0_citas as select id, episodio_id, modalidad_asistencia from public.citas;
create temp table w0_series as select id, episodio_id, modalidad_asistencia from public.series_cita;

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set episodio_id = %L where id = %L', :EP39, :'c_w'), '42501',
  'permission denied', '23.W1 ADM no escribe episodio_id (UPDATE con WHERE)');
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set episodio_id = %L', :EP39), '42501',
  'permission denied', '23.W2 ADM no escribe episodio_id (UPDATE sin WHERE)');
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set modalidad_asistencia = %L where id = %L', 'online', :'c_w'), '42501',
  'permission denied', '23.W3 ADM no escribe modalidad_asistencia');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, episodio_id) values (%L, %L, %L, %L, %L, %L, %L)',
         :P39, :PRO1, :CA, pg_temp.ts39(9, time '05:00'), pg_temp.ts39(9, time '05:20'), 'Europe/Madrid', :EP39), '42501',
  'permission denied', '23.W4 ADM no inserta con episodio_id');
select pg_temp.assert_lanza_codigo_msg(format('update public.series_cita set episodio_id = %L', :EP39), '42501',
  'permission denied', '23.W5 ADM no escribe en series_cita');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set episodio_id = %L where id = %L', :EP39, :'c_w'), '42501',
  'permission denied', '23.W6 PRO1 no escribe episodio_id de su propia cita');
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set episodio_id = %L', :EP39), '42501',
  'permission denied', '23.W7 PRO1 no escribe episodio_id sin WHERE');
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set modalidad_asistencia = %L where id = %L', 'online', :'c_w'), '42501',
  'permission denied', '23.W8 PRO1 no escribe modalidad_asistencia');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, modalidad_asistencia) values (%L, %L, %L, %L, %L, %L, %L)',
         :P39, :PRO1, :CA, pg_temp.ts39(9, time '05:00'), pg_temp.ts39(9, time '05:20'), 'Europe/Madrid', 'online'), '42501',
  'permission denied', '23.W9 PRO1 no inserta con modalidad_asistencia');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.series_cita (paciente_id, profesional_id, centro_id, periodicidad, dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales, episodio_id) values (%L, %L, %L, %L, 1, %L, %L, 50, 3, %L)',
         :P39, :PRO1, :CA, 'semanal', '09:00', 'Europe/Madrid', :EP39), '42501',
  'permission denied', '23.W10 PRO1 no inserta en series_cita');
select pg_temp.assert_no_lanza(format('update public.citas set sala = %L where id = %L', 'Sala W', :'c_w'),
  '23.W11 gemela · PRO1 sí escribe una columna abierta (sala) de su propia cita');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set episodio_id = %L where id = %L', :EP39, :'c_w'), '42501',
  'permission denied', '23.W12 TEC1 no escribe episodio_id');
select pg_temp.assert_lanza_codigo_msg(format('update public.citas set modalidad_asistencia = %L where id = %L', 'online', :'c_w'), '42501',
  'permission denied', '23.W13 TEC1 no escribe modalidad_asistencia a mano (solo por la función)');
select pg_temp.assert_lanza_codigo_msg(format('update public.series_cita set modalidad_asistencia = %L', 'online'), '42501',
  'permission denied', '23.W14 TEC1 no escribe en series_cita');
call pg_temp.reset_sesion();

select pg_temp.assert(
  not exists (select 1 from w0_citas w join public.citas c on c.id = w.id
               where c.episodio_id is distinct from w.episodio_id or c.modalidad_asistencia is distinct from w.modalidad_asistencia)
  and (select count(*) from w0_citas) = (select count(*) from public.citas)
  and not exists (select 1 from w0_series w join public.series_cita s on s.id = w.id
                   where s.episodio_id is distinct from w.episodio_id or s.modalidad_asistencia is distinct from w.modalidad_asistencia)
  and (select count(*) from w0_series) = (select count(*) from public.series_cita),
  '23.W15 tras todos los intentos, la diferencia con el estado de antes es de 0 filas en citas y en series_cita'
);

-- ---------------------------------------------------------------------------
-- M · Alta con modalidad y herencia de la serie (criterio 9)
-- ---------------------------------------------------------------------------

-- Sin el parámetro, presencial. Con él, online (el técnico lo puede dar: es logística).
call pg_temp.como(:TEC1);
select public.agenda_crear_cita(:Q39, :PRO1, :CA, :TT39, pg_temp.dia39(0), time '09:00',
                                p_modalidad_asistencia => 'online')::text as cm1 \gset
select public.agenda_crear_cita(:S39, :PRO1, :CA, :TT39, pg_temp.dia39(1), time '09:00')::text as cm2 \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select modalidad_asistencia = 'online' from public.citas where id = :'cm1')
  and (select modalidad_asistencia = 'presencial' from public.citas where id = :'cm2'),
  '23.M1 la cita del técnico con el parámetro es online; sin el parámetro, presencial'
);

-- Una serie online de Q39 con PRO1: el único abierto de PRO1 con Q39 es EP39, así que la serie lo
-- resuelve. La tercera sesión cae en un festivo y queda como propuesta.
call pg_temp.como(:TEC1);
select public.agenda_crear_serie(:Q39, :PRO1, :CA, :TT39, 'semanal', 1::smallint, time '11:00', 50::smallint,
                                 pg_temp.dia39(14), 4::smallint, null,
                                 p_modalidad_asistencia => 'online')::text as ser_m \gset
call pg_temp.reset_sesion();

select ((:'ser_m'::jsonb)->>'serie_id')::uuid as id_ser_m \gset
select pg_temp.assert(
  (select modalidad_asistencia = 'online' and episodio_id = :EP39 from public.series_cita where id = :'id_ser_m')
  and (select count(*) = 3 and bool_and(modalidad_asistencia = 'online' and episodio_id = :EP39)
         from public.citas where serie_id = :'id_ser_m')
  and (select count(*) = 1 from public.propuestas_cita where serie_id = :'id_ser_m' and motivo = 'festivo'),
  '23.M2 la serie online y todas sus citas llevan online y el episodio de la serie (EP39); hay una propuesta por el festivo'
);

-- La propuesta confirmada nace online y con el episodio de la serie (la herencia es del disparador).
select id as id_prop_m from public.propuestas_cita where serie_id = :'id_ser_m' and motivo = 'festivo' \gset
call pg_temp.como(:PRO1);
select public.agenda_confirmar_propuesta(:'id_prop_m'::uuid)::text as cita_prop_m \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select modalidad_asistencia = 'online' and episodio_id = :EP39 from public.citas where id = :'cita_prop_m'),
  '23.M3 la cita de una propuesta confirmada hereda online y el episodio de la serie'
);

-- Editar «esta y las siguientes» no parte la serie: la MISMA fila conserva los dos valores, y las citas
-- también (enmienda de redacción del diseño, D15).
select count(*) as n_series_m from public.series_cita \gset
call pg_temp.como(:PRO1);
select public.agenda_editar_serie(((:'ser_m'::jsonb)->'citas'->0->>'cita_id')::uuid, 'esta_y_siguientes',
                                  p_hora_local => time '16:00') as _edit_m \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.series_cita) = :n_series_m
  and (select modalidad_asistencia = 'online' and episodio_id = :EP39 from public.series_cita where id = :'id_ser_m')
  and (select bool_and(modalidad_asistencia = 'online' and episodio_id = :EP39)
         from public.citas where serie_id = :'id_ser_m'),
  '23.M4 tras «esta y las siguientes», la MISMA serie conserva online y EP39, y no nace otra; sus citas también'
);

-- Un nulo explícito no llega a la restricción not null: da 22023 antes (M0).
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_modalidad_asistencia => null)',
         :S39, :PRO1, :CA, :TT39, pg_temp.dia39(2), '09:00'), '22023',
  'no puede ser nula', '23.M5 un nulo explícito en la modalidad da 22023 (no un 23502 de la restricción)');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_serie(%L, %L, %L, %L, %L, 1::smallint, time %L, 50::smallint, %L::date, 3::smallint, null, p_modalidad_asistencia => null)',
         :S39, :PRO1, :CA, :TT39, 'semanal', '09:00', pg_temp.dia39(2)), '22023',
  'no puede ser nula', '23.M6 lo mismo en la serie');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- N · Resolución automática del episodio (criterio 10): como PRO1 y como TEC1
-- ---------------------------------------------------------------------------

select count(*) as n_epi_antes from public.episodios_asistenciales \gset
select count(*) as n_par_antes from public.episodio_participantes \gset

call pg_temp.como(:PRO1);
select public.agenda_crear_cita(:S39, :PRO1, :CA, :TT39, pg_temp.dia39(3), time '09:00')::text as cn1 \gset
select public.agenda_crear_cita(:Q39, :PRO1, :CA, :TT39, pg_temp.dia39(3), time '11:00')::text as cn2 \gset
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(3), time '13:00')::text as cn3 \gset
select public.agenda_crear_cita(:R39, :PRO1, :CA, :TT39, pg_temp.dia39(3), time '15:00')::text as cn4 \gset
select public.agenda_crear_cita(:Z39, :PRO1, :CA, :TT39, pg_temp.dia39(3), time '17:00')::text as cn5 \gset
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select public.agenda_crear_cita(:Q39, :PRO1, :CA, :TT39, pg_temp.dia39(4), time '09:00')::text as cn6 \gset
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(4), time '11:00')::text as cn7 \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select episodio_id from public.citas where id = :'cn1') = :ES39,
  '23.N1 el titular con un solo abierto de PRO1: ese episodio'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'cn2') = :EP39
  and (select episodio_id from public.citas where id = :'cn6') = :EP39
  and (select episodio_id from public.citas where id = :'cm1') = :EP39,
  '23.N2 el participante activo del único abierto de PRO1 con él: EP39 (como PRO1 y como TEC1)'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'cn3') is null
  and (select episodio_id from public.citas where id = :'cn7') is null,
  '23.N3 con dos abiertos (E39 y EP39) la cita nace sin episodio (como PRO1 y como TEC1)'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'cn4') is null,
  '23.N4 con el único episodio cerrado: nulo'
);
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'cn5') is null,
  '23.N5 con un abierto de OTRO profesional y ninguno de PRO1: nulo'
);
select pg_temp.assert(
  (select count(*) from public.episodios_asistenciales) = :n_epi_antes
  and (select count(*) from public.episodio_participantes) = :n_par_antes,
  '23.N6 dar una cita nunca abre un episodio ni un participante (el recuento es el mismo antes y después)'
);

-- ---------------------------------------------------------------------------
-- X · El episodio por parámetro (criterio 11)
-- ---------------------------------------------------------------------------

-- Se retira cualquier desbloqueo vivo de PRO1: elegir episodio al dar la cita no pide PIN (ADR-026).
update public.desbloqueos_historia set revocado_en = now() where perfil_id = :PRO1 and revocado_en is null;

call pg_temp.como(:PRO1);
select pg_temp.assert(
  not (select desbloqueada from (select public.historia_desbloqueada() as desbloqueada) t),
  '23.X0 PRO1 no tiene la historia desbloqueada'
);
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(5), time '09:00', p_episodio_id => :EP39)::text as cx1 \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select episodio_id from public.citas where id = :'cx1') = :EP39,
  '23.X1 el dueño del episodio lo elige sin desbloquear el PIN: entra con EP39'
);

call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :P39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', gen_random_uuid()), '42501',
  'no elige episodio para una cita', '23.X2 el técnico no elige episodio (ni uno inexistente)');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :P39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', :EP39), '42501',
  'no elige episodio para una cita', '23.X3 el técnico no elige episodio ni siendo uno real');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_serie(%L, %L, %L, %L, %L, 1::smallint, time %L, 50::smallint, %L::date, 3::smallint, null, p_episodio_id => %L)',
         :P39, :PRO1, :CA, :TT39, 'semanal', '09:00', pg_temp.dia39(6), :EP39), '42501',
  'no elige episodio para una cita', '23.X4 lo mismo en la serie');
call pg_temp.reset_sesion();

-- Los cuatro rechazos «no vale» llevan el MISMO mensaje: no sirven de oráculo del episodio.
select pg_temp.sqlerrm39(format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :P39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', :EP39)) as e_adm_pre \gset
call pg_temp.como(:ADM);
select pg_temp.sqlerrm39(format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :P39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', :EP39)) as e_adm \gset
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.sqlerrm39(format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :H39, :PRO2, :CB, :TT39, pg_temp.dia39(6), '09:00', :EP39)) as e_pro2 \gset
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.sqlerrm39(format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :P39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', gen_random_uuid())) as e_inex \gset
select pg_temp.sqlerrm39(format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :R39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', :E39)) as e_otropac \gset
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_crear_cita(%L, %L, %L, %L, %L::date, time %L, p_episodio_id => %L)',
         :R39, :PRO1, :CA, :TT39, pg_temp.dia39(6), '09:00', :EC39), '22023',
  'está cerrado', '23.X5 al dueño sí se le dice que su episodio está cerrado (22023)');
call pg_temp.reset_sesion();

select pg_temp.assert(
  :'e_adm' like '42501%no vale para esta cita%'
  and :'e_adm' = :'e_pro2' and :'e_adm' = :'e_inex' and :'e_adm' = :'e_otropac',
  '23.X6 administrador, otro profesional, episodio inexistente y episodio de otro paciente dan el MISMO 42501 «no vale para esta cita»'
);

-- ---------------------------------------------------------------------------
-- T · Ninguna ruta del técnico devuelve el episodio (criterio 12)
-- ---------------------------------------------------------------------------

call pg_temp.como(:TEC1);
select public.agenda_crear_cita(:Q39, :PRO1, :CA, :TT39, pg_temp.dia39(7), time '09:00')::text as t_cita \gset
select public.agenda_crear_serie(:Q39, :PRO1, :CA, :TT39, 'semanal', 1::smallint, time '13:00', 50::smallint,
                                 pg_temp.dia39(35), 2::smallint, null)::text as t_serie \gset
select public.agenda_previsualizar_alta(:Q39, :PRO1, :CA, 'semanal', 1::smallint, time '13:00', 50::smallint,
                                        pg_temp.dia39(70), 2::smallint)::text as t_prev \gset
select public.agenda_cambiar_asistencia(:'t_cita'::uuid, 'online')::text as t_asis \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  position(lower(:EP39) in lower(:'t_cita' || :'t_serie' || :'t_prev' || :'t_asis')) = 0
  and position('e0390001' in :'t_cita' || :'t_serie' || :'t_prev' || :'t_asis') = 0
  and (select episodio_id from public.citas where id = :'t_cita') = :EP39,
  '23.T1 como TEC1, ni crear_cita, ni crear_serie, ni previsualizar_alta ni cambiar_asistencia devuelven el episodio (que sí está puesto)'
);

call pg_temp.como(:PRO1);
select public.agenda_crear_cita(:Q39, :PRO1, :CA, :TT39, pg_temp.dia39(8), time '09:00', p_episodio_id => :EP39)::text as t_cita2 \gset
call pg_temp.reset_sesion();
select pg_temp.assert(position('e0390001' in :'t_cita2') = 0,
  '23.T2 tampoco como PRO1 con p_episodio_id: la función devuelve solo el id de la cita');

-- ---------------------------------------------------------------------------
-- L · La lectura del técnico (criterios 13, 14 y 15)
-- ---------------------------------------------------------------------------

call pg_temp.como(:TEC1);
select pg_temp.assert(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'citas_agenda' and column_name = 'modalidad_asistencia') = 1
  and (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'citas_agenda' and column_name = 'episodio_id') = 0
  and (select modalidad_asistencia from public.citas_agenda where id = :'cm1') = 'online',
  '23.L1 citas_agenda trae modalidad_asistencia (online en la cita online) y no trae episodio_id'
);
select pg_temp.assert(
  (select count(*) from public.episodios_asistenciales) = 0
  and (select count(*) from public.episodio_participantes) = 0,
  '23.L2 el técnico sigue sin ver ni un episodio ni un participante, con EP39 y citas que lo apuntan ya existentes'
);
select pg_temp.assert(
  (select modalidad_asistencia from public.agenda_citas_rango(pg_temp.ts39(-1, time '00:00') + interval '4 years',
                                                              pg_temp.ts39(1, time '00:00') + interval '5 years') where id = :'cm1') = 'online',
  '23.L3 como TEC1, agenda_citas_rango trae modalidad_asistencia online en la cita online'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select modalidad_asistencia from public.agenda_citas_rango(pg_temp.ts39(-1, time '00:00') + interval '4 years',
                                                              pg_temp.ts39(1, time '00:00') + interval '5 years') where id = :'cm1') = 'online',
  '23.L4 como PRO1, agenda_citas_rango trae modalidad_asistencia online en la cita online'
);
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select modalidad_asistencia from public.agenda_citas_rango(pg_temp.ts39(-1, time '00:00') + interval '4 years',
                                                              pg_temp.ts39(1, time '00:00') + interval '5 years') where id = :'cm1') = 'online',
  '23.L5 como ADM, agenda_citas_rango trae modalidad_asistencia online en la cita online'
);
call pg_temp.reset_sesion();
select pg_temp.assert(
  position('episodio_id' in (select pg_get_function_result(p.oid) from pg_proc p
                              where p.proname = 'agenda_citas_rango' and p.pronamespace = 'public'::regnamespace)) = 0,
  '23.L6 agenda_citas_rango no devuelve episodio_id'
);

-- ---------------------------------------------------------------------------
-- S · Cambiar la asistencia (criterio 16)
-- ---------------------------------------------------------------------------

call pg_temp.como(:TEC1);
select pg_temp.assert(public.agenda_cambiar_asistencia(:'cm2'::uuid, 'online') = :'cm2'::uuid,
  '23.S1 TEC1 (centro A) cambia a online una cita futura de CA y recibe el id');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_asistencia(%L, null)', :'cm2'), '22023',
  'no puede ser nula', '23.S1b un nulo en el cambio de asistencia da 22023');
call pg_temp.reset_sesion();
select pg_temp.assert((select modalidad_asistencia = 'online' from public.citas where id = :'cm2'),
  '23.S1c la cita quedó online');

call pg_temp.como(:TEC2);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_asistencia(%L, %L)', :'cm2', 'presencial'), '42501',
  'cambiar la asistencia de esa cita', '23.S2 TEC2 (centro B) no cambia la asistencia de una cita del centro A');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_asistencia(%L, %L)', :'cm2', 'presencial'), '42501',
  'cambiar la asistencia de esa cita', '23.S3 PRO2 no cambia la asistencia de la cita de PRO1 (mismo mensaje que TEC2)');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(public.agenda_cambiar_asistencia(:'cm2'::uuid, 'presencial') = :'cm2'::uuid,
  '23.S4 PRO1 cambia la asistencia de su cita');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert(public.agenda_cambiar_asistencia(:'cm2'::uuid, 'online') = :'cm2'::uuid,
  '23.S5 el administrador también puede');
call pg_temp.reset_sesion();
select pg_temp.assert((select modalidad_asistencia = 'online' from public.citas where id = :'cm2'),
  '23.S5b la cita quedó online tras PRO1 y ADM');

-- Una cita pasada no cambia de presencial a online ni al revés.
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, -10, time '05:00', null), 'S · fijación de la cita pasada');
select id as c_pasada from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(-10, time '05:00') \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_asistencia(%L, %L)', :'c_pasada', 'online'), '42501',
  'no cambia de presencial a online', '23.S6 una cita pasada no cambia de modalidad (constitución, regla 6)');
select pg_temp.assert(public.agenda_cambiar_asistencia(:'c_pasada'::uuid, 'presencial') = :'c_pasada'::uuid,
  '23.S6b gemela · poner el valor que ya tiene no lanza ni escribe, ni siquiera en una cita pasada');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- E · Corregir el episodio de una cita (criterio 17)
-- ---------------------------------------------------------------------------

call pg_temp.como(:PRO1);
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(9), time '09:00', p_episodio_id => :E39)::text as c_e1 \gset
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(9), time '11:00', p_episodio_id => :E39)::text as c_e2 \gset
call pg_temp.reset_sesion();

update public.desbloqueos_historia set revocado_en = now() where perfil_id = :PRO1 and revocado_en is null;

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', :'c_e1', :EP39), '42501',
  'desbloquéala con el PIN para cambiar el episodio', '23.E1 sin el PIN desbloqueado, el profesional no cambia el episodio de una cita');
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')), '23.E1b PRO1 desbloquea la historia');
select pg_temp.assert(public.agenda_cambiar_episodio_cita(:'c_e1'::uuid, :EP39) = :'c_e1'::uuid,
  '23.E2 con el PIN, PRO1 cambia E39 a EP39 en una cita sin notas de P39');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, null)', :'c_e1'), '22023',
  'Falta el episodio', '23.E3 P3 · un nulo no quita el episodio: da 22023');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', :'c_ra', :EP39), '42501',
  'ya tiene nota: su episodio no cambia', '23.E4 una cita con nota (Ra, de PRO1 en E39) no cambia de episodio');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', :'c_e2', :EC39), '23514',
  'no es titular ni participante del episodio', '23.E5 un episodio suyo de OTRO paciente (EC39, de R39) no vale: lo dice la coherencia');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', :'c_e2', :F39), '42501',
  'Solo puedes poner a la cita un episodio tuyo', '23.E6 un episodio de OTRO profesional (F39) no vale');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', gen_random_uuid(), :EP39), '42501',
  'No hay una cita tuya', '23.E7 una cita que no existe (o no es tuya) no se corrige');
call pg_temp.reset_sesion();
select pg_temp.assert((select episodio_id = :EP39 from public.citas where id = :'c_e1')
                      and (select episodio_id = :E39 from public.citas where id = :'c_e2'),
  '23.E8 solo cambió la cita que debía (c_e1 a EP39); la otra sigue en E39');

call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', :'c_e2', :EP39), '42501',
  'corrige su episodio', '23.E9 el técnico no corrige el episodio de una cita');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('select public.agenda_cambiar_episodio_cita(%L, %L)', :'c_e2', :EP39), '42501',
  'corrige su episodio', '23.E10 el administrador tampoco');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- P · La cita pasada (criterio 18), como postgres
-- ---------------------------------------------------------------------------

select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, -8, time '05:00', null), 'P · fijación de la cita pasada Pp');
select id as c_pp from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(-8, time '05:00') \gset
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, 8, time '05:00', null), 'P · fijación de la cita futura Pf');
select id as c_pf from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(8, time '05:00') \gset

select pg_temp.assert_no_lanza(format('update public.citas set episodio_id = %L where id = %L', :E39, :'c_pp'),
  '23.P1 una cita pasada sin episodio admite uno (de nulo a valor)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set episodio_id = %L where id = %L', :EP39, :'c_pp'), '42501',
  'no cambia de episodio una vez asignado', '23.P2 una cita pasada con episodio no cambia a otro');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set episodio_id = null where id = %L', :'c_pp'), '42501',
  'no cambia de episodio una vez asignado', '23.P3 ni se lo quitan');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set episodio_id = %L where id = %L', :F39, :'c_pp'), '42501',
  'no cambia de episodio una vez asignado', '23.P4 el 42501 de la cita pasada sale ANTES que el 23514 de la coherencia (orden de disparadores)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set modalidad_asistencia = %L where id = %L', 'online', :'c_pp'), '42501',
  'no cambia de presencial a online', '23.P5 una cita pasada no cambia de modalidad');

select pg_temp.assert_no_lanza(format('update public.citas set episodio_id = %L where id = %L', :E39, :'c_pf'),
  '23.P1b gemela futura · de nulo a E39');
select pg_temp.assert_no_lanza(format('update public.citas set episodio_id = %L where id = %L', :EP39, :'c_pf'),
  '23.P2b gemela futura · de E39 a EP39');
select pg_temp.assert_no_lanza(format('update public.citas set episodio_id = null where id = %L', :'c_pf'),
  '23.P3b gemela futura · a nulo');
select pg_temp.assert_no_lanza(format('update public.citas set modalidad_asistencia = %L where id = %L', 'online', :'c_pf'),
  '23.P5b gemela futura · modalidad');

-- ---------------------------------------------------------------------------
-- Y · La nota va en el episodio de su cita (criterios 19, 20 y 21)
-- ---------------------------------------------------------------------------

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')), '23.Y0 PRO1 desbloquea la historia');
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(10), time '09:00', p_episodio_id => :E39)::text as c_y1 \gset
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(10), time '11:00', p_episodio_id => :E39)::text as c_y2 \gset
select public.agenda_crear_cita(:P39, :PRO1, :CA, :TT39, pg_temp.dia39(10), time '13:00')::text as c_y3 \gset
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L)',
         :P39, :EP39, :PRO1, :'c_y1'), '23514',
  'va en el episodio de la cita', '23.Y1 la nota de PRO1 sobre una cita en E39 no cuelga de EP39');
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L)',
         :P39, :E39, :PRO1, :'c_y2'),
  '23.Y1b gemela · la nota de PRO1 en E39 sobre una cita en E39 entra');
-- Criterio 20: la cita sin episodio lo toma de la nota.
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L)',
         :P39, :E39, :PRO1, :'c_y3'),
  '23.Y2 la nota de PRO1 en E39 sobre una cita sin episodio entra');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select c.episodio_id = n.episodio_id and c.episodio_id = :E39
     from public.citas c join public.notas_clinicas n on n.cita_id = c.id where c.id = :'c_y3'),
  '23.Y3 la cita sin episodio queda con el episodio de la nota que la documenta');

-- P2: la nota entra aunque el episodio no encaje con la fecha de la cita; la cita se queda nula.
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:Q39, :PRO1, -40, time '05:00', null), 'Y · fijación de la cita anterior al alta de Q39');
select id as c_y4 from public.citas where paciente_id = :Q39 and inicio = pg_temp.ts39(-40, time '05:00') \gset
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L)',
         :Q39, :EP39, :PRO1, :'c_y4'),
  '23.Y4 P2 · la nota de Q39 en EP39 entra aunque la cita sea de antes de su alta');
select pg_temp.assert((select episodio_id is null from public.citas where id = :'c_y4'),
  '23.Y5 P2 · y la cita se queda sin episodio');

-- P1: la regla solo alcanza a la nota del profesional de la cita sobre el paciente de la cita. La nota
-- propia de un coterapeuta sobre la cita del titular cuelga de SU episodio (T-034 D2) y entra.
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L)',
         :P39, :F39, :PRO2, :'c_y2'),
  '23.Y6 P1 · la nota de PRO2 en F39 sobre la cita de PRO1 (en E39) entra: la regla no es suya');

-- Criterio 21: episodio_para_nota.
call pg_temp.como(:PRO1);
select pg_temp.assert(public.episodio_para_nota(:P39, p_cita_id => :'c_y1'::uuid) = :E39,
  '23.Y7 episodio_para_nota con la cita de E39 y sin episodio explícito devuelve E39 (sin EP001)');
select pg_temp.assert_lanza_codigo(format('select public.episodio_para_nota(%L)', :P39), 'EP001',
  '23.Y8 gemela · sin cita y con dos abiertos sigue dando EP001');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.episodio_para_nota(%L, %L, %L)', :P39, :EP39, :'c_y1'), '42501',
  'El episodio elegido no vale para esta nota.', '23.Y9 un episodio explícito válido pero distinto del de la cita no vale');
select pg_temp.assert(public.episodio_para_nota(:P39, :E39, :'c_y1'::uuid) = :E39,
  '23.Y10 gemela · el episodio explícito igual al de la cita sí');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------
-- J · La cadena de huellas y la lectura conjunta siguen intactas (criterio 22)
-- ---------------------------------------------------------------------------

-- H39 (de PRO2) es participante de EP39. La nota conjunta de PRO1 sobre P39 con cita en EP39 se sella
-- con la comprobación 6.21 intacta y la lee PRO2 desde el lado de su paciente.
insert into public.episodio_participantes (episodio_id, paciente_id, papel, alta_en) values (:EP39, :H39, 'miembro', current_date - 30);
select pg_temp.assert_no_lanza(pg_temp.sql_ins39(:P39, :PRO1, 11, time '05:00', :EP39), 'J · fijación de la cita CJ');
select id as c_j from public.citas where paciente_id = :P39 and inicio = pg_temp.ts39(11, time '05:00') \gset
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, cita_id)
values ('f0390001-0000-4000-8000-000000000001', :P39, :EP39, :PRO1, :'c_j');
select pg_temp.assert_no_lanza(format($f$
  insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
    (%L, '{"t":"conjunta39"}', %L, 'conjunta', %L, timestamptz '2026-10-03 09:00:00+00')$f$,
  'f0390001-0000-4000-8000-000000000001',
  pg_temp.sobre_prueba('f0390001-0000-4000-8000-000000000001'::uuid, :PRO1, timestamptz '2026-10-03 09:00:00+00',
                       '{"t":"conjunta39"}'::jsonb, p_cita_id => :'c_j'::uuid, p_alcance => 'conjunta'),
  :PRO1),
  '23.J1 la v1 de una nota conjunta con cita en EP39 se sella (6.21 y la cadena de huellas, intactas)');

call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')), '23.J2 PRO2 desbloquea la historia');
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas where id = %L', 'f0390001-0000-4000-8000-000000000001')) = 1,
  '23.J3 PRO2 lee la nota conjunta desde el lado de su paciente (H39), con la cita puesta en el episodio');
call pg_temp.reset_sesion();
