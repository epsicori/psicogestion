-- T-043 · El hueco raro: `agenda_bloques_profesional` devuelve, por cada tramo libre, cuántos
-- minutos quedarían entre el fin de la cita propuesta y la siguiente del profesional cuando no
-- cabe otra sesión con sus descansos (tickets/T-043/diseno.md, definiciones y §1.2).
--
-- Reutiliza los actores de 01-fijacion.sql (ADM, PRO1 con alta en CA y CB, PRO2, TEC1 de CA,
-- TEC2 de CB, P1). ANCLAS EN EL AÑO + 4, en el primer lunes de febrero: 21 usa año + 3, y
-- 26 y 28 no siembran franjas ni citas de PRO1 en esas fechas. Cada sección tiene su propio
-- lunes (offsets sobre `lunes_29`) porque las citas de una ocupan el lunes de PRO1 para el resto.
--
-- Cada aserción compara el ARRAY COMPLETO `hora/estado/hueco` de un día: fija a la vez que los
-- tramos no se movieron (el arreglo no mueve ningún hueco) y el valor nuevo. Un fallo dice qué
-- tramo se movió. Sesión de 50 minutos y descanso de 10; el raro es 10 < g < 70.
--
-- Los mutantes M1-M9 están al final, anotados.

\echo ''
\echo '=== 29-hueco-raro ==='

\set TT29 '\'a2900001-0000-4000-8000-000000000001\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen, activo) values
  (:TT29, 'Terapia T-043 50', 50, 'exento_sanitario', true);

-- Descanso explícito: lo que el banco mide depende de él.
update public.perfiles set descanso_activo = true, descanso_minutos = 10 where id = :PRO1;

select (extract(year from now())::int + 4) as anio_29 \gset

-- Primer lunes de febrero del año + 4.
select (make_date(:anio_29, 2, 1) + ((8 - extract(isodow from make_date(:anio_29, 2, 1))::int) % 7))::text
  as lunes_29 \gset

select (:'lunes_29'::date +  7)::text as l007,
       (:'lunes_29'::date + 14)::text as l014,
       (:'lunes_29'::date + 21)::text as l021,
       (:'lunes_29'::date + 28)::text as l028,
       (:'lunes_29'::date + 35)::text as l035,
       (:'lunes_29'::date + 42)::text as l042,
       (:'lunes_29'::date + 49)::text as l049,
       (:'lunes_29'::date + 56)::text as l056,
       (:'lunes_29'::date + 63)::text as l063,
       (:'lunes_29'::date + 70)::text as l070 \gset

-- Una franja de PRO1: lunes de 09:00 a 14:00 en CA, doce semanas.
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, dia_semana, hora_inicio, hora_fin, desde, hasta, zona_horaria, motivo)
values
  (:PRO1, :CA, 'franja', 1, time '09:00', time '14:00', :'lunes_29'::date, (:'lunes_29'::date + 84),
   'Europe/Madrid', 'T-043');

-- Una cita de PRO1 (ids a2900004-…): `p_n` es el sufijo del id.
create function pg_temp.cita29(p_n int, p_centro uuid, p_dia date, p_ini time, p_fin time,
  p_pac uuid default null, p_pro uuid default null, p_tipo uuid default null)
returns void
language sql
as $$
  insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
  values (('a2900004-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid,
          p_pac, p_pro, p_centro, p_tipo,
          (p_dia + p_ini) at time zone 'Europe/Madrid',
          (p_dia + p_fin) at time zone 'Europe/Madrid',
          'Europe/Madrid');
$$;

-- El día entero como texto: «hora/estado/hueco» por tramo, en orden.
create function pg_temp.dia29(p_pro uuid, p_centro uuid, p_dia date)
returns text[]
language sql
as $$
  select array_agg(b.hora_local::text || '/' || b.estado || '/' || coalesce(b.hueco_raro_minutos::text, '-')
                   order by b.inicio)
    from public.agenda_bloques_profesional(p_pro, p_centro, p_dia, p_dia, 50::smallint) b;
$$;

-- =========================================================================
-- A · Forma y permisos
-- =========================================================================

select pg_temp.assert(
  pg_get_function_result('public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure)
    = 'TABLE(fecha date, hora_local time without time zone, inicio timestamp with time zone, fin timestamp with time zone, estado text, hueco_raro_minutos integer)',
  'A · agenda_bloques_profesional devuelve (fecha, hora_local, inicio, fin, estado, hueco_raro_minutos)'
);

select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'agenda_bloques_profesional') = 1,
  'A · existe UNA sola agenda_bloques_profesional (el drop de la firma antigua, sin sobrecarga)'
);

select pg_temp.assert(
  (select p.prosecdef from pg_proc p
    where p.oid = 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure),
  'A · agenda_bloques_profesional sigue siendo security definer'
);

select pg_temp.assert(
  (select array_to_string(p.proconfig, ',') = 'search_path=""' from pg_proc p
    where p.oid = 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure),
  'A · agenda_bloques_profesional sigue con search_path vacío'
);

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure, 'execute'),
  'A · authenticated ejecuta agenda_bloques_profesional y anon no'
);

select pg_temp.assert(
  not exists (
    select 1 from pg_proc p, aclexplode(p.proacl) a
     where p.oid = 'public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure
       and a.grantee = 0),
  'A · agenda_bloques_profesional no tiene grant a public (grantee 0): el drop se llevó los grants y se repusieron bien'
);

-- =========================================================================
-- B · Línea base y dos citas candidatas
-- =========================================================================

call pg_temp.como(:PRO1);

select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'lunes_29'::date)
    = array['09:00:00/libre/-', '10:00:00/libre/-', '11:00:00/libre/-', '12:00:00/libre/-', '13:00:00/libre/-'],
  'B0 · sin citas: cinco tramos libres a las 09, 10, 11, 12 y 13, todos con hueco null (línea base)'
);
call pg_temp.reset_sesion();

-- Citas 10:30-11:20 (rango hasta 11:30) y 11:40-12:30 (rango hasta 12:40).
select pg_temp.cita29(1, :CA, :'l007'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
select pg_temp.cita29(2, :CA, :'l007'::date, time '11:40', time '12:30', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l007'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/ocupado/-', '12:40:00/libre/-'],
  'B1 · dos citas candidatas (10:30 y 11:40): el 09:00 acaba a las 09:50 y manda la MENOR, la de 10:30: 40 minutos; los ocupados y el 12:40 dan null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- C · Adyacente (g = descanso): no es raro
-- =========================================================================

select pg_temp.cita29(3, :CA, :'l014'::date, time '10:00', time '10:50', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l014'::date)
    = array['09:00:00/libre/-', '10:00:00/ocupado/-', '11:00:00/libre/-', '12:00:00/libre/-', '13:00:00/libre/-'],
  'C · cita a las 10:00: el 09:00 acaba a las 09:50 y quedan 10 minutos, justo el descanso (g = d): null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- D · Borde inferior (g = d + 1)
-- =========================================================================

select pg_temp.cita29(4, :CA, :'l021'::date, time '10:01', time '10:51', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l021'::date)
    = array['09:00:00/libre/11', '10:00:00/ocupado/-', '11:01:00/libre/-', '12:01:00/libre/-', '13:01:00/libre/-'],
  'D · cita a las 10:01: quedan 11 minutos (g = d + 1), ya es raro'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- E · Borde superior (g = D + 2d - 1 sí, g = D + 2d no)
-- =========================================================================

select pg_temp.cita29(5, :CA, :'l028'::date, time '10:59', time '11:49', :P1, :PRO1, :TT29);
select pg_temp.cita29(6, :CA, :'l035'::date, time '11:00', time '11:50', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l028'::date)
    = array['09:00:00/libre/69', '10:00:00/ocupado/-', '11:59:00/libre/-', '12:59:00/libre/-'],
  'E1 · cita a las 10:59: quedan 69 minutos (g = 69 < 70), raro'
);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l035'::date)
    = array['09:00:00/libre/-', '10:00:00/libre/-', '11:00:00/ocupado/-', '12:00:00/libre/-', '13:00:00/libre/-'],
  'E2 · cita a las 11:00: quedan 70 minutos (g = D + 2d), cabe otra sesión con sus descansos: null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- F · Descanso 0
-- =========================================================================

update public.perfiles set descanso_activo = false where id = :PRO1;
select pg_temp.cita29(7, :CA, :'l042'::date, time '09:55', time '10:45', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l042'::date)
    = array['09:00:00/libre/5', '09:50:00/ocupado/-', '10:45:00/libre/-', '11:35:00/libre/-', '12:25:00/libre/-'],
  'F · descanso apagado (d = 0) y cita a las 09:55: el 09:00 acaba a las 09:50 y quedan 5 minutos (0 < 5 < 50)'
);
call pg_temp.reset_sesion();

-- El descanso vuelve a lo que el resto del banco espera.
update public.perfiles set descanso_activo = true, descanso_minutos = 10 where id = :PRO1;

-- =========================================================================
-- G · La cita está en otro centro; permisos intactos
-- =========================================================================

select pg_temp.cita29(8, :CB, :'l049'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);

call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l049'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'G · el técnico de CA ve el valor calculado con una cita de PRO1 en CB: 40 minutos (P4)'
);
call pg_temp.reset_sesion();

call pg_temp.como(:TEC2);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'l049', :'l049'),
  '42501', 'No autorizado para ver esta agenda',
  'G · el técnico de CB pidiendo CA: 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(
  format('select * from public.agenda_bloques_profesional(%L, %L, %L::date, %L::date, 50::smallint)',
         :PRO1, :CA, :'l049', :'l049'),
  '42501', 'No autorizado para ver esta agenda',
  'G · un profesional ajeno (PRO2 pidiendo a PRO1): 42501'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l049'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'G · GEMELA: el administrador ve el mismo array'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l049'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'G · GEMELA: el propio profesional ve el mismo array'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- H · Ausencia parcial en medio: el hueco lo corta la ausencia, no la cita
-- =========================================================================

insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO1, null, 'ausencia', :'l056'::date, :'l056'::date, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 H');
select pg_temp.cita29(9, :CA, :'l056'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l056'::date)
    = array['09:00:00/libre/-', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'H · ausencia de 10:00 a 10:20 y cita a las 10:30: el hueco del 09:00 lo corta la ausencia, null (gemela: G, el mismo hueco sin ausencia da 40)'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- I · Fin de franja: una cita a partir del fin no cuenta
-- =========================================================================

select pg_temp.cita29(10, :CB, :'l063'::date, time '14:10', time '15:00', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l063'::date)
    = array['09:00:00/libre/-', '10:00:00/libre/-', '11:00:00/libre/-', '12:00:00/libre/-', '13:00:00/libre/-'],
  'I · cita a las 14:10, pasado el fin de la franja (14:00): el 13:00 no la ve y da null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- J · Una cita cancelada no cuenta
-- =========================================================================

select pg_temp.cita29(11, :CA, :'l070'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
update public.citas set estado = 'cancelada' where id = 'a2900004-0000-4000-8000-000000000011';

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l070'::date)
    = array['09:00:00/libre/-', '10:00:00/libre/-', '11:00:00/libre/-', '12:00:00/libre/-', '13:00:00/libre/-'],
  'J · una cita cancelada no cuenta: todo libre y null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- Mutantes M1-M9 (medidos a mano sobre la función en la base, uno por uno; ver la evidencia)
-- =========================================================================
-- M1  `v_sig < v_tras + v_dur + v_desc`  -> `<=`            cae en E2
-- M2  `v_sig > v_tras`                   -> `>=`            cae en C
-- M3  `v_tras := v_cursor + v_dur` (sin descanso)           cae en C
-- M4  sin `c.inicio < v_f_fin`                              cae en I
-- M5  `min(c.inicio)` -> `max(c.inicio)`                    cae en B1
-- M6  sin el `not exists` de la ausencia                    cae en H
-- M7  sin el filtro de `estado`                             cae en J
-- M8  minutos `v_sig - v_tras` en vez de `v_sig - (v_cursor + v_dur)`   cae en B1 y D
-- M9  calcular también en tramos ocupados (sin `if v_limite is null`)   cae en B1

\echo '29-hueco-raro: OK'
