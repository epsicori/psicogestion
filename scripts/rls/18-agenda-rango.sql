-- T-014 · La lectura de la agenda por rango: agenda_citas_rango() y la regla de «en curso»
-- escrita una sola vez (cita_en_curso, ADR-045).
--
-- Va al final, con el siguiente número (README, punto 7). Usa un profesional y un paciente
-- PROPIOS en el centro A (PRO18, P18): 15 y 16 ya dejan citas de PRO1 y PRO2 pegadas a
-- now(), y la restricción de exclusión no dejaría poner al lado las dos del borde de R6.
-- El técnico TEC1 es del centro A, así que ve las de PRO18 por su vista.
--
-- Todo el banco corre en una sola transacción: now() es la MISMA marca en todo el módulo,
-- y por eso «now() = fin» y «now() = inicio» se pueden fijar exactamente.

\echo ''
\echo '=== 18-agenda-rango ==='

\set PRO18   '\'a1800001-0000-4000-8000-000000000001\''
\set P18     '\'a1800002-0000-4000-8000-000000000001\''
\set TT18    '\'a1800003-0000-4000-8000-000000000001\''
\set C18INI  '\'a1800004-0000-4000-8000-000000000001\''
\set C18FIN  '\'a1800004-0000-4000-8000-000000000002\''
\set C18CAN  '\'a1800004-0000-4000-8000-000000000003\''
\set C18FUT  '\'a1800004-0000-4000-8000-000000000004\''
\set C18LEJ  '\'a1800004-0000-4000-8000-000000000005\''
\set C18FCA  '\'a1800004-0000-4000-8000-000000000006\''
\set C18NAS  '\'a1800004-0000-4000-8000-000000000007\''
\set C18TEC  '\'a1800004-0000-4000-8000-000000000008\''

-- =========================================================================
-- Fijación
-- =========================================================================

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :PRO18, 'authenticated', 'authenticated', 'pro18@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional Dieciocho","centro_id":"' || :CA || '"}')::jsonb,
   '', '', '', '');

-- Sin descanso: [now-50, now) y [now, now+50) son contiguas y la exclusión las admite.
update public.perfiles set descanso_activo = false where id = :PRO18;

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id)
values (:P18, 'Olga', 'Dieciocho', :PRO18, :CA);

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen)
values (:TT18, 'Terapia T-014', 50, 'exento_sanitario');

insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, estado, nota_operativa)
values
  -- empieza EXACTAMENTE ahora: en curso (el borde cerrado del intervalo)
  (:C18INI, :P18, :PRO18, :CA, :TT18, now(), now() + interval '50 minutes', 'Europe/Madrid', 'programada', 'Traer el informe'),
  -- acaba EXACTAMENTE ahora: ya no está en curso (el borde abierto)
  (:C18FIN, :P18, :PRO18, :CA, :TT18, now() - interval '50 minutes', now(), 'Europe/Madrid', 'realizada', null),
  -- abarca ahora, pero cancelada: el estado manda sobre el reloj
  (:C18CAN, :P18, :PRO18, :CA, :TT18, now() - interval '20 minutes', now() + interval '30 minutes', 'Europe/Madrid', 'cancelada', null),
  -- mañana, programada: reprogramable
  (:C18FUT, :P18, :PRO18, :CA, :TT18, now() + interval '1 day', now() + interval '1 day 50 minutes', 'Europe/Madrid', 'programada', null),
  -- fuera del rango de un día que usan las lecturas
  (:C18LEJ, :P18, :PRO18, :CA, :TT18, now() + interval '5 days', now() + interval '5 days 50 minutes', 'Europe/Madrid', 'programada', null),
  -- pasado mañana, pero cancelada: futura y aun así NO reprogramable (revisión SQL H7)
  (:C18FCA, :P18, :PRO18, :CA, :TT18, now() + interval '2 days', now() + interval '2 days 50 minutes', 'Europe/Madrid', 'cancelada', null),
  -- abarca ahora, pero no_asistida: tampoco está en curso (revisión SQL H8). La exclusión
  -- solo mira programada/confirmada/realizada, así que convive con C18INI y C18CAN.
  (:C18NAS, :P18, :PRO18, :CA, :TT18, now() - interval '10 minutes', now() + interval '40 minutes', 'Europe/Madrid', 'no_asistida', null);

-- Una cita cuyo profesional_id es el TÉCNICO TEC1 (revisión SQL H1). Nada en la base lo
-- impide: un alta por error desde recepción, o un profesional que pasa a técnico. La
-- política de citas deja pasar profesional_id = auth.uid() sin mirar el rol, así que sin
-- acotar por rol la rama `citas`, TEC1 la recibiría DOS veces, una con tipo y nota.
insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, estado, nota_operativa)
values
  (:C18TEC, :P18, :TEC1, :CA, :TT18, now() + interval '3 hours', now() + interval '3 hours 50 minutes',
   'Europe/Madrid', 'programada', 'Nota que el técnico no debe leer');

-- Una alerta abierta de nota sin firmar sobre la cita que acaba de terminar.
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P18, :PRO18, :CA, 'nota_sin_firmar', 'citas', :C18FIN);

-- El rango de todas las lecturas: de ayer a mañana a esta hora + 2 h.
create temp table t18_rango as
  select now() - interval '1 day' as desde, now() + interval '1 day 2 hours' as hasta;
grant select on t18_rango to authenticated;

-- =========================================================================
-- R1-R3 · El técnico: su centro, sin tipo ni nota, en curso de verdad, sin estado documental
-- =========================================================================

call pg_temp.como(:TEC1);

select pg_temp.assert(
  (select count(*) from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.id in (:C18INI, :C18FIN, :C18CAN, :C18FUT)) = 4,
  'R1 GEMELA POSITIVA: el técnico de centro A SÍ recibe las cuatro citas de PRO18 en el rango'
);

select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.centro_id is distinct from :CA::uuid),
  'R1: el técnico de centro A no recibe ninguna cita de otro centro'
);

select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.tipo_terapia_nombre is not null or r.nota_operativa is not null),
  'R1: en la rama del técnico el tipo de terapia y la nota operativa son NULL en TODAS las filas (choque 4)'
);

select pg_temp.assert(
  (select r.en_curso from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.id = :C18INI),
  'R2: el técnico recibe en_curso = true en la cita que empieza ahora (esta_en_curso le daba falso, H2)'
);

select pg_temp.assert(
  not (select public.esta_en_curso(:C18INI)),
  'R2 (el porqué): esta_en_curso(id) sigue dándole falso al técnico, que no ve citas — la lectura por rango es la que lo arregla'
);

select pg_temp.assert(
  (select r.nota_pendiente is null from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.id = :C18FIN),
  'R3: el técnico recibe nota_pendiente NULL aunque haya una alerta abierta sobre la cita'
);

select pg_temp.assert(
  (select r.paciente_nombre = 'Olga' and r.profesional_nombre = 'Profesional Dieciocho'
      and r.centro_nombre is not null
     from public.agenda_citas_rango((select desde from t18_rango), (select hasta from t18_rango)) r
    where r.id = :C18INI),
  'R1: el técnico sí recibe el nombre del paciente, del profesional y del centro (lo que su RLS le deja)'
);

-- R1b · El técnico que figura como profesional de una cita (revisión SQL H1).
select pg_temp.assert(
  exists (select 1 from public.citas c where c.id = :C18TEC),
  'R1b (el porqué): la política de citas SÍ le deja leer a TEC1 la cita de la que es profesional — la rama citas tiene que excluirlo por rol'
);
select pg_temp.assert(
  (select count(*) from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.id = :C18TEC) = 1,
  'R1b: la cita con profesional_id = TEC1 le llega UNA sola vez (las dos ramas son disjuntas por rol)'
);
select pg_temp.assert(
  (select r.tipo_terapia_nombre is null and r.nota_operativa is null and r.nota_pendiente is null
     from public.agenda_citas_rango((select desde from t18_rango), (select hasta from t18_rango)) r
    where r.id = :C18TEC),
  'R1b: y esa única fila es la de la rama del técnico: sin tipo, sin nota y sin nota_pendiente (choque 4)'
);

-- R1c · El solape también por la rama del técnico (revisión SQL H6): las pruebas de borde
-- de R6 corren como PRO18 y solo ejercen la rama `citas`.
select pg_temp.assert(
  exists (select 1 from public.agenda_citas_rango(now() + interval '10 minutes', now() + interval '1 hour') r
           where r.id = :C18INI),
  'R1c: al técnico le entra la cita que empezó antes del rango y acaba dentro (solape)'
);
select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(now(), now() + interval '1 hour') r
               where r.id = :C18FIN),
  'R1c: al técnico NO le entra la cita que acaba justo en el inicio del rango (fin > desde es estricto)'
);
select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(now() - interval '2 hours', now() - interval '50 minutes') r
               where r.id = :C18FIN),
  'R1c: al técnico NO le entra la cita que empieza justo en el fin del rango (inicio < hasta es estricto)'
);
select pg_temp.assert(
  exists (select 1 from public.agenda_citas_rango(now() - interval '2 hours', now() - interval '49 minutes') r
           where r.id = :C18FIN),
  'R1c GEMELA: al técnico SÍ le entra la cita que termina dentro de un rango que la solapa por un minuto'
);

call pg_temp.reset_sesion();

-- =========================================================================
-- R4 · El profesional: solo lo suyo, con tipo y nota
-- =========================================================================

call pg_temp.como(:PRO18);

select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.profesional_id is distinct from :PRO18::uuid),
  'R4: el profesional solo recibe sus citas'
);

select pg_temp.assert(
  (select r.tipo_terapia_nombre = 'Terapia T-014' and r.nota_operativa = 'Traer el informe'
     from public.agenda_citas_rango((select desde from t18_rango), (select hasta from t18_rango)) r
    where r.id = :C18INI),
  'R4 GEMELA: el profesional SÍ recibe el tipo de terapia y la nota operativa — el NULL del técnico es de su rama'
);

select pg_temp.assert(
  (select r.nota_pendiente from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.id = :C18FIN),
  'R3 GEMELA: el profesional SÍ recibe nota_pendiente = true sobre la misma cita'
);

select pg_temp.assert(
  (select r.nota_pendiente = false from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r
   where r.id = :C18INI),
  'R3: sin alerta abierta, nota_pendiente es false (no NULL) fuera de la rama del técnico'
);

-- =========================================================================
-- R6 · La regla semiabierta, con los bordes exactos
-- =========================================================================

select pg_temp.assert(
  (select r.en_curso from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r where r.id = :C18INI),
  'R6: now() = inicio → en curso (el borde de la izquierda es cerrado)'
);

select pg_temp.assert(
  (select not r.en_curso from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r where r.id = :C18FIN),
  'R6: now() = fin → NO en curso (el borde de la derecha es abierto)'
);

select pg_temp.assert(
  (select not r.en_curso from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r where r.id = :C18CAN),
  'R6: una cancelada que abarca now() NO está en curso'
);

select pg_temp.assert(
  (select not r.en_curso from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r where r.id = :C18NAS),
  'R6: una no_asistida que abarca now() NO está en curso'
);

select pg_temp.assert(
  (select r.reprogramable and not (select r2.reprogramable from public.agenda_citas_rango(
      (select desde from t18_rango), (select hasta from t18_rango)) r2 where r2.id = :C18INI)
     from public.agenda_citas_rango((select desde from t18_rango), (select hasta from t18_rango)) r
    where r.id = :C18FUT),
  'reprogramable: la de mañana sí; la que empieza ahora no (inicio > now() es estricto)'
);

select pg_temp.assert(
  (select not r.reprogramable from public.agenda_citas_rango(
     now(), now() + interval '3 days') r where r.id = :C18FCA),
  'reprogramable: una cancelada futura NO es reprogramable (manda el estado, no solo el reloj)'
);

-- El solape con el borde del rango: entra lo que cruza el borde, no lo que lo toca.
select pg_temp.assert(
  exists (select 1 from public.agenda_citas_rango(now() + interval '10 minutes', now() + interval '1 hour') r
           where r.id = :C18INI),
  'Una cita que empezó antes del rango y acaba dentro entra por solape'
);
select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(now(), now() + interval '1 hour') r
               where r.id = :C18FIN),
  'Una cita que acaba justo en el inicio del rango NO entra (fin > desde es estricto)'
);
select pg_temp.assert(
  not exists (select 1 from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r where r.id = :C18LEJ),
  'Una cita fuera del rango no entra'
);

-- =========================================================================
-- R7 · esta_en_curso(id) para el dueño: la misma respuesta que antes de delegar
-- =========================================================================

select pg_temp.assert(
  (select public.esta_en_curso(:C18INI)),
  'R7: esta_en_curso() cierto para el dueño con now() = inicio'
);
select pg_temp.assert(
  not (select public.esta_en_curso(:C18FIN)),
  'R7: esta_en_curso() falso con now() = fin'
);
select pg_temp.assert(
  not (select public.esta_en_curso(:C18CAN)),
  'R7: esta_en_curso() falso para la cancelada que abarca now()'
);
select pg_temp.assert(
  not (select public.esta_en_curso('a1800004-0000-4000-8000-0000000000ff')),
  'R7: esta_en_curso() de una cita que no existe (o no se ve) es falso, no nulo'
);

call pg_temp.reset_sesion();

-- =========================================================================
-- R5 · El administrador: tantas filas como citas en el rango, sin duplicados del union all
-- =========================================================================

select count(*) as n_citas from public.citas c, t18_rango g
 where c.inicio < g.hasta and c.fin > g.desde \gset r5_

call pg_temp.como(:ADM);
select pg_temp.assert(
  (select count(*) from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango))) = :r5_n_citas,
  'R5: el administrador recibe exactamente las citas del rango que ve postgres — ninguna duplicada por las dos ramas'
);
select pg_temp.assert(
  (select count(*) = count(distinct r.id) from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r)
  and :r5_n_citas > 0,
  'R5: ningún id repetido, y el rango no está vacío'
);
select pg_temp.assert(
  exists (select 1 from public.agenda_citas_rango(
     (select desde from t18_rango), (select hasta from t18_rango)) r where r.centro_id = :CB),
  'R1 GEMELA: el administrador sí ve citas del centro B en el rango — el cero del técnico no es «no hay»'
);

-- =========================================================================
-- R8 · La guarda del rango
-- =========================================================================

select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_citas_rango(now(), now() + interval ''63 days'')',
  '22023',
  'R8: un rango de 63 días se rechaza'
);
-- 62 días en HORAS, y con la sesión en Europe/Madrid a propósito (revisión SQL H9):
-- `now() + interval '62 days'` suma días de pared y, si cruza un cambio de hora, da 62 días
-- ± 1 h según la TimeZone de quien corra el banco. La gemela no puede depender de eso.
select current_setting('timezone') as zona_previa \gset r8_
select set_config('timezone', 'Europe/Madrid', true);
select pg_temp.assert(
  (select count(*) >= 0 from public.agenda_citas_rango(now(), now() + interval '1488 hours')),
  'R8 GEMELA: un rango de 62 días exactos (1488 h) se acepta, sea cual sea la zona de la sesión'
);
select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_citas_rango(now(), now() + interval ''1488 hours 1 second'')',
  '22023',
  'R8: un segundo más de 62 días se rechaza'
);
select set_config('timezone', :'r8_zona_previa', true);
select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_citas_rango(now(), now() - interval ''1 hour'')',
  '22023',
  'R8: un rango invertido se rechaza'
);
select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_citas_rango(now(), now())',
  '22023',
  'R8: un rango vacío (hasta = desde) se rechaza'
);
select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_citas_rango(null, now())',
  '22023',
  'R8: un extremo nulo se rechaza'
);

call pg_temp.reset_sesion();

-- =========================================================================
-- R9 · Invoker, y nadie anónimo
-- =========================================================================

select pg_temp.assert(
  not (select p.prosecdef from pg_proc p
        where p.oid = 'public.agenda_citas_rango(timestamptz, timestamptz)'::regprocedure),
  'R9: agenda_citas_rango es security INVOKER (en definer el técnico leería la organización entera)'
);
select pg_temp.assert(
  not (select p.prosecdef from pg_proc p
        where p.oid = 'public.cita_en_curso(timestamptz, timestamptz, public.estado_cita)'::regprocedure),
  'R9: cita_en_curso es security INVOKER'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.agenda_citas_rango(timestamptz, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.cita_en_curso(timestamptz, timestamptz, public.estado_cita)', 'execute'),
  'R9: anon no puede ejecutar agenda_citas_rango ni cita_en_curso'
);
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.agenda_citas_rango(timestamptz, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.cita_en_curso(timestamptz, timestamptz, public.estado_cita)', 'execute'),
  'R9 GEMELA: authenticated sí puede ejecutarlas'
);

drop table t18_rango;

\echo '18-agenda-rango: completa.'
