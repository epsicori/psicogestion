-- T-043 · El hueco raro: `agenda_bloques_profesional` devuelve, por cada tramo libre, cuántos
-- minutos quedarían entre el fin de la cita propuesta y la siguiente del profesional cuando no
-- cabe otra sesión con sus descansos (tickets/T-043/diseno.md, definiciones y §1.2).
--
-- Reutiliza los actores de 01-fijacion.sql (ADM, PRO1 con alta en CA y CB, PRO2, TEC1 de CA,
-- TEC2 de CB, P1, P2). ANCLA: primer lunes de febrero de año + 10. Los años de los demás bancos
-- están en la tabla de `scripts/rls/README.md` (T-049, D5.2): ninguno pasa de año + 8 y el 29 es el
-- único en año + 10. Ninguna `disponibilidad` sembrada antes del 29 queda abierta, y la que abre el
-- 29 (K12) se borra al acabar su sección. Un banco nuevo que siembre agenda de PRO1 en año + 10 tiene
-- que mirar esto. Cada sección tiene su propio lunes (offsets sobre `lunes_29`) porque las
-- citas de una ocupan el lunes de PRO1 para el resto.
--
-- Cada aserción compara el ARRAY COMPLETO `hora/estado/hueco` de un día: fija a la vez que los
-- tramos no se movieron (el arreglo no mueve ningún hueco) y el valor nuevo. Un fallo dice qué
-- tramo se movió. Sesión de 50 minutos y descanso de 10; el raro es 10 < g < 70.
--
-- Los mutantes M1-M9 y N1-N13 están al final, anotados.

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

select (extract(year from now())::int + 10) as anio_29 \gset

-- Primer lunes de febrero del año + 10.
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
       (:'lunes_29'::date + 70)::text as l070,
       (:'lunes_29'::date + 77)::text as l077,
       (:'lunes_29'::date + 84)::text as l084,
       (:'lunes_29'::date + 91)::text as l091,
       (:'lunes_29'::date + 98)::text as l098,
       (:'lunes_29'::date + 105)::text as l105,
       (:'lunes_29'::date + 106)::text as l106,
       (:'lunes_29'::date + 112)::text as l112,
       (:'lunes_29'::date + 119)::text as l119,
       (:'lunes_29'::date + 126)::text as l126,
       (:'lunes_29'::date + 133)::text as l133,
       (:'lunes_29'::date + 140)::text as l140,
       (:'lunes_29'::date + 147)::text as l147,
       (:'lunes_29'::date + 154)::text as l154 \gset

-- Una franja de PRO1: lunes de 09:00 a 14:00 en CA, veintidós semanas.
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, dia_semana, hora_inicio, hora_fin, desde, hasta, zona_horaria, motivo)
values
  (:PRO1, :CA, 'franja', 1, time '09:00', time '14:00', :'lunes_29'::date, (:'lunes_29'::date + 154),
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
-- K1 · Una cita de OTRO profesional no cuenta (mata N3, sin filtro de profesional)
-- =========================================================================

select pg_temp.cita29(12, :CB, :'l077'::date, time '10:30', time '11:20', :P2, :PRO2, :TT29);

call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l077'::date)
    = array['09:00:00/libre/-', '10:00:00/libre/-', '11:00:00/libre/-', '12:00:00/libre/-', '13:00:00/libre/-'],
  'K1 · el técnico de CA ve la agenda de PRO1 y la única cita del día es de PRO2: todo libre y null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K2 · Una cita anterior al tramo no cuenta (mata N2b, sin `c.inicio >= v_f_ini`)
-- =========================================================================

select pg_temp.cita29(13, :CA, :'l084'::date, time '09:00', time '09:50', :P1, :PRO1, :TT29);
select pg_temp.cita29(14, :CA, :'l084'::date, time '11:30', time '12:20', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l084'::date)
    = array['09:00:00/ocupado/-', '10:00:00/libre/40', '11:00:00/ocupado/-', '12:30:00/libre/-'],
  'K2 · citas 09:00 y 11:30: el 10:00 mide contra la de 11:30 (40) y el 11:00 ocupado no mira la de 09:00 hacia atrás: null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K3 · Adyacente más una segunda dentro del umbral (mata N1, `c.inicio > v_tras`)
-- =========================================================================

select pg_temp.cita29(15, :CA, :'l091'::date, time '10:00', time '10:20', :P1, :PRO1, :TT29);
select pg_temp.cita29(16, :CA, :'l091'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l091'::date)
    = array['09:00:00/libre/-', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K3 · una cita adyacente (10:00) y otra a 40 minutos: la adyacente manda y da null, la segunda no rescata el hueco'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K4 · Cita exactamente en el fin de la franja (mata N4, `c.inicio <= v_f_fin`)
-- =========================================================================

select pg_temp.cita29(17, :CA, :'l098'::date, time '09:00', time '09:20', :P1, :PRO1, :TT29);
select pg_temp.cita29(18, :CB, :'l098'::date, time '14:00', time '14:50', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l098'::date)
    = array['09:00:00/ocupado/-', '09:30:00/libre/-', '10:30:00/libre/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K4 · cita de PRO1 en CB a las 14:00, justo en el fin de la franja: el 12:30 no la cuenta y da null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K5 · Una ausencia de OTRO día no corta el hueco (mata N5)
-- =========================================================================

select pg_temp.cita29(19, :CA, :'l105'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO1, null, 'ausencia', :'l106'::date, :'l106'::date, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 K5');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l105'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K5 · ausencia de PRO1 el martes siguiente: el lunes no la ve y el hueco del 09:00 sigue siendo 40'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K6 · Una ausencia en OTRO centro no corta el hueco (mata N6)
-- =========================================================================

select pg_temp.cita29(20, :CA, :'l112'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO1, :CB, 'ausencia', :'l112'::date, :'l112'::date, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 K6');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l112'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K6 · ausencia de PRO1 en CB: la agenda de CA no la ve y el hueco del 09:00 sigue siendo 40'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K7 · Una ausencia de OTRO profesional no corta el hueco (mata N7)
-- =========================================================================

select pg_temp.cita29(21, :CA, :'l119'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO2, null, 'ausencia', :'l119'::date, :'l119'::date, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 K7');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l119'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K7 · ausencia de PRO2: no es de PRO1 y el hueco del 09:00 sigue siendo 40'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K8 · Una ausencia dentro del descanso no corta el hueco... pero sí uno que la solapa (mata N10)
-- =========================================================================

select pg_temp.cita29(22, :CA, :'l126'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO1, null, 'ausencia', :'l126'::date, :'l126'::date, time '09:52', time '09:58', 'Europe/Madrid', 'T-043 K8');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l126'::date)
    = array['09:00:00/libre/-', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K8 · ausencia 09:52-09:58 (no toca la sesión de 09:00 a 09:50): el 09:00 es libre y el hueco lo corta la ausencia, null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K9 · Segundos: el hueco se redondea hacia arriba (mata N8, `floor`)
-- =========================================================================

select pg_temp.cita29(23, :CA, :'l133'::date, time '10:30:20', time '11:20:20', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l133'::date)
    = array['09:00:00/libre/41', '10:00:00/ocupado/-', '11:30:20/libre/-', '12:30:20/libre/-'],
  'K9 · cita a las 10:30:20: 40 minutos y 20 segundos de hueco son 41 (ceil), no 40'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K10 · Una cita CONFIRMADA cuenta (mata N11, `in ('programada')`)
-- =========================================================================

select pg_temp.cita29(24, :CA, :'l140'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);
update public.citas set estado = 'confirmada' where id = 'a2900004-0000-4000-8000-000000000024';
select pg_temp.assert(
  (select estado::text from public.citas where id = 'a2900004-0000-4000-8000-000000000024') = 'confirmada',
  'K10 · fijación: la cita de las 10:30 está confirmada'
);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l140'::date)
    = array['09:00:00/libre/40', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K10 · cita de las 10:30 confirmada: el 09:00 da 40, como con una programada'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K11 · Un festivo parcial corta el hueco (mata N12, `tipo in ('ausencia')`)
-- =========================================================================

insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO1, null, 'festivo', :'l147'::date, :'l147'::date, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 K11');
select pg_temp.cita29(25, :CA, :'l147'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l147'::date)
    = array['09:00:00/libre/-', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K11 · festivo parcial de 10:00 a 10:20 y cita a las 10:30: el hueco del 09:00 lo corta el festivo, null'
);
call pg_temp.reset_sesion();

-- =========================================================================
-- K12 · Una ausencia abierta (hasta null) corta el hueco (mata N13, `d.hasta >= v_dia`)
-- =========================================================================

insert into public.disponibilidad
  (perfil_id, centro_id, tipo, desde, hasta, hora_inicio, hora_fin, zona_horaria, motivo)
values
  (:PRO1, null, 'ausencia', :'l154'::date, null, time '10:00', time '10:20', 'Europe/Madrid', 'T-043 K12');
select pg_temp.cita29(26, :CA, :'l154'::date, time '10:30', time '11:20', :P1, :PRO1, :TT29);

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.dia29(:PRO1, :CA, :'l154'::date)
    = array['09:00:00/libre/-', '10:00:00/ocupado/-', '11:30:00/libre/-', '12:30:00/libre/-'],
  'K12 · ausencia de 10:00 a 10:20 sin fin (hasta null) y cita a las 10:30: el hueco del 09:00 lo corta, null'
);
call pg_temp.reset_sesion();

with borrada as (
  delete from public.disponibilidad
   where perfil_id = :PRO1 and motivo = 'T-043 K12' and hasta is null
  returning 1
)
select pg_temp.assert(
  (select count(*) from borrada) = 1,
  'K12 · la ausencia abierta se retira al acabar: ningún banco posterior la hereda'
);

-- =========================================================================
-- Mutantes M1-M9 y N1-N13 (medidos a mano sobre la función en la base, uno por uno; ver la evidencia)
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
-- N1  `c.inicio >= v_tras` -> `>` (la cita adyacente deja de contar)   cae en K3
-- N2b `c.inicio >= v_tras` -> `>= v_f_ini` (cuenta también lo anterior al tramo)   cae en K2
-- N3  sin `c.profesional_id = p_profesional_id`            cae en K1
-- N4  `c.inicio < v_f_fin` -> `<=`                         cae en K4
-- N5  ausencia del `not exists` sin `d.desde/d.hasta`      cae en K5
-- N6  ausencia del `not exists` sin el filtro de centro    cae en K6
-- N7  ausencia del `not exists` sin `d.perfil_id`          cae en K7
-- N8  `ceil` -> `floor`                                    cae en K9
-- N9  sin `hueco_raro_minutos := null` al empezar el tramo            cae en B1
-- N10 rango de la ausencia desde `v_tras` en vez de `v_cursor + v_dur`   cae en K8
-- N11 `c.estado in (...)` del hueco -> `in ('programada')`              cae en K10
-- N12 `d.tipo in ('festivo', 'ausencia')` del not exists -> `in ('ausencia')`   cae en K11
-- N13 `(d.hasta is null or d.hasta >= v_dia)` del not exists -> `d.hasta >= v_dia`   cae en K12
-- Sobrevive: quitar 'realizada' del filtro de estado del hueco (haría falta una cita realizada en el futuro).

\echo '29-hueco-raro: OK'
