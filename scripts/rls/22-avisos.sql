-- T-015 · Avisos: nivel de la nota pendiente, recuento de la cabecera, escalado al nivel 3,
-- notificaciones y la lectura/resolución de alertas (diseño §1.1 y §3: C4-C8, E1-E8).
--
-- Corre el último y hereda el estado de 01-21: el módulo 15 deja una alerta de PRO1/P1 de
-- unas 47 h, el 04 pone a PROBAJA en baja y otros módulos dejan notificaciones. Por eso
-- todo recuento se compara como DELTA y toda aserción del escalado mira el `origen_id` de su
-- propio escenario, nunca un total de la tabla.
--
-- `now()` es constante dentro de la transacción del banco: «la base pone el reloj» se
-- comprueba como `= now()` frente al 2000-01-01 que manda el cliente.
--
-- Las citas de este módulo son cortas (20 min) y en horas que los demás módulos no usan,
-- para no chocar con la exclusión `citas_sin_solape_profesional` de PRO1.

\echo ''
\echo '=== 22-avisos ==='

\set ADM2 '\'b0150001-0000-4000-8000-000000000001\''
\set Z22  '\'d0150001-0000-4000-8000-000000000001\''
\set Q22  '\'d0150001-0000-4000-8000-000000000002\''
\set ADM3 '\'b0150001-0000-4000-8000-000000000003\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------
-- ADM2: segundo administrador, propio del módulo (molde de 01-fijacion.sql).
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :ADM2, 'authenticated', 'authenticated', 'adm2@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"administrador","nombre_completo":"Admin Dos"}'::jsonb, '', '', '', '');

-- Z22: paciente de PRO1 con un nombre que no comparte ninguna palabra con «Profesional Uno»,
-- para que «el detalle no lleva el paciente» se pueda comprobar por posición (P1 se apellida
-- «Uno», igual que el nombre del profesional, y la comprobación no distinguiría nada).
-- Q22: paciente de PRO2 en el centro A, para el coasignado de C8.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:Z22, 'Zoraida', 'Quintanilla', :PRO1, :CA),
  (:Q22, 'Quirino', 'Benavente',  :PRO2, :CA);

-- =========================================================================
-- C4 · El nivel sale de citas.fin y de los umbrales del centro; el recuento lo suma
-- =========================================================================
call pg_temp.como(:PRO1);
select nivel1 as r0_n1, nivel2 as r0_n2, nivel3 as r0_n3 from public.recuento_notas_pendientes() \gset
call pg_temp.reset_sesion();

-- Cita de PRO1 con P1 que terminó hace 25 h, marcada realizada: abre su nota_sin_firmar.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:P1, :PRO1, :CA, now() - interval '25 hours 20 minutes', now() - interval '25 hours', 'Europe/Madrid')
returning id as c25 \gset
update public.citas set estado = 'realizada' where id = :'c25';
select id as a25 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c25' and tipo = 'nota_sin_firmar' \gset

-- Gemelas: una de hace 2 h (nivel 1) y una de hace 73 h (nivel 3), de Z22.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:P1, :PRO1, :CA, now() - interval '2 hours 20 minutes', now() - interval '2 hours', 'Europe/Madrid')
returning id as c2 \gset
update public.citas set estado = 'realizada' where id = :'c2';
select id as a2 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c2' and tipo = 'nota_sin_firmar' \gset

insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '73 hours 20 minutes', now() - interval '73 hours', 'Europe/Madrid')
returning id as c73 \gset
update public.citas set estado = 'realizada' where id = :'c73';
select id as a73 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c73' and tipo = 'nota_sin_firmar' \gset

select pg_temp.assert(
  (select a.referencia_en = c.fin from public.alertas_documentacion a join public.citas c on c.id = a.origen_id
    where a.id = :'a25'),
  '22.C4 referencia_en de la alerta es el fin de la cita, no el momento de abrirla');

call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select nivel = 2 from public.alertas_documentacion_nivel where id = :'a25'),
  '22.C4 La cita realizada hace 25 h sin firmar está en nivel 2');
select pg_temp.assert(
  (select nivel2 = :r0_n2 + 1 from public.recuento_notas_pendientes()),
  '22.C4 El recuento de PRO1 suma una en nivel 2');
select pg_temp.assert(
  (select nivel = 1 from public.alertas_documentacion_nivel where id = :'a2'),
  '22.C4 GEMELA: la de hace 2 h está en nivel 1');
select pg_temp.assert(
  (select nivel1 = :r0_n1 + 1 and nivel2 = :r0_n2 + 1 from public.recuento_notas_pendientes()),
  '22.C4 GEMELA: la de 2 h suma al nivel 1 y NO al nivel 2');
select pg_temp.assert(
  (select nivel = 3 from public.alertas_documentacion_nivel where id = :'a73'),
  '22.C4 GEMELA: la de hace 73 h está en nivel 3');
select pg_temp.assert(
  (select nivel3 = :r0_n3 + 1 from public.recuento_notas_pendientes()),
  '22.C4 GEMELA: la de 73 h suma al nivel 3');
call pg_temp.reset_sesion();

-- Umbral por centro: con nivel 2 a las 48 h en el centro A, la de 25 h baja a nivel 1.
update public.centros set escalado_nivel2_horas = 48 where id = :CA;
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select nivel = 1 from public.alertas_documentacion_nivel where id = :'a25'),
  '22.C4 Con escalado_nivel2_horas = 48 en el centro A la de 25 h baja a nivel 1 (umbral por centro)');
call pg_temp.reset_sesion();
-- Un centro con nivel 2 a 100 h y nivel 3 heredado (72): nivel 3 nunca queda por debajo del 2.
update public.centros set escalado_nivel2_horas = 100 where id = :CA;
select pg_temp.assert(
  (select nivel2_horas = 100 and nivel3_horas = 101 from public.umbrales_escalado(:CA::uuid)),
  '22.C4 Si el centro fija nivel 2 por encima del 3 heredado, el 3 sube a nivel2 + 1');
update public.centros set escalado_nivel2_horas = null where id = :CA;
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select nivel = 2 from public.alertas_documentacion_nivel where id = :'a25'),
  '22.C4 GEMELA: con el umbral del centro a null vuelve a nivel 2 (hereda de la organización)');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select nivel2_horas = 24 and nivel3_horas = 72 from public.umbrales_escalado(null)),
  '22.C4 umbrales_escalado(null) da 24/72: nunca nulo');
select pg_temp.assert(
  (select count(*) = 1 from public.umbrales_escalado('00000000-0000-4000-8000-000000000000'::uuid)),
  '22.C4 umbrales_escalado de un centro inexistente devuelve una fila');
select pg_temp.assert(
  public.nivel_nota_pendiente(null, :CA::uuid) is null,
  '22.C4 Una referencia nula da nivel nulo');
select pg_temp.assert(
  (select attnotnull from pg_attribute
    where attrelid = 'public.alertas_documentacion'::regclass and attname = 'referencia_en'),
  '22.C4 referencia_en es not null');

-- =========================================================================
-- C5 · El escalado al nivel 3: una fila, sin paciente, idempotente, a quien toca (P4)
-- =========================================================================
select public.escalar_notas_pendientes() as escalado1 \gset
select public.escalar_notas_pendientes() as escalado2 \gset
select pg_temp.assert(:escalado1 >= 1, '22.C5 La primera pasada escala al menos la alerta de 73 h');
select pg_temp.assert(:escalado2 = 0, '22.C5 La segunda pasada no crea nada y no lanza (on conflict)');
select pg_temp.assert(
  (select count(*) = 1 from public.notificaciones
    where perfil_id = :ADM and origen_tabla = 'citas' and origen_id = :'c73'),
  '22.C5 Hay UNA notificación para ADM por la cita de 73 h (origen = la cita, no la alerta)');
select pg_temp.assert(
  (select tipo = 'nota_pendiente_escalada' and titulo = 'Nota sin firmar'
          and position('Zoraida' in detalle) = 0
          and position('Quintanilla' in detalle) = 0
          and position(:Z22 in detalle) = 0
          and position('Profesional Uno' in detalle) > 0
     from public.notificaciones
    where perfil_id = :ADM and origen_tabla = 'citas' and origen_id = :'c73'),
  '22.C5 El detalle lleva el profesional y NO el nombre, los apellidos ni el id del paciente');
select pg_temp.assert(
  (select count(*) = 0 from public.notificaciones where origen_id = :'c25'),
  '22.C5 GEMELA: la alerta de nivel 2 no genera ninguna notificación');

-- Una alerta de nivel 3 ya resuelta no escala.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '74 hours 20 minutes', now() - interval '74 hours', 'Europe/Madrid')
returning id as c74 \gset
update public.citas set estado = 'realizada' where id = :'c74';
select id as a74 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c74' and tipo = 'nota_sin_firmar' \gset
update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now() where id = :'a74';
select public.escalar_notas_pendientes() as escalado3 \gset
select pg_temp.assert(
  (select count(*) = 0 from public.notificaciones where origen_id = :'c74'),
  '22.C5 GEMELA: una alerta resuelta no escala');

-- Designar: solo un administrador activo.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.organizacion set administrador_avisos_id = %L', :PRO1),
  '23514', 'debe ser un administrador activo',
  '22.C5 Designar a un profesional como administrador de avisos lanza 23514');
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format('update public.organizacion set administrador_avisos_id = %L', :ADM2),
  '22.C5 GEMELA: ADM designa a ADM2, administrador activo');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select administrador_avisos_id = :ADM2 from public.organizacion),
  '22.C5 (preparación) ADM2 queda designado');

-- (i) Designado ADM2 activo: solo él.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '75 hours 20 minutes', now() - interval '75 hours', 'Europe/Madrid')
returning id as c75 \gset
update public.citas set estado = 'realizada' where id = :'c75';
select id as a75 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c75' and tipo = 'nota_sin_firmar' \gset
select public.escalar_notas_pendientes() as escalado4 \gset
select pg_temp.assert(
  (select count(*) filter (where perfil_id = :ADM2) = 1
      and count(*) filter (where perfil_id = :ADM) = 0
      and count(*) = 1
     from public.notificaciones where origen_tabla = 'citas' and origen_id = :'c75'),
  '22.C5 (i) Con ADM2 designado y activo el aviso va SOLO a ADM2');

-- (ii) Columna nula: todos los administradores activos.
update public.organizacion set administrador_avisos_id = null;
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '76 hours 20 minutes', now() - interval '76 hours', 'Europe/Madrid')
returning id as c76 \gset
update public.citas set estado = 'realizada' where id = :'c76';
select id as a76 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c76' and tipo = 'nota_sin_firmar' \gset
select public.escalar_notas_pendientes() as escalado5 \gset
select pg_temp.assert(
  (select count(*) filter (where perfil_id = :ADM2) = 1
      and count(*) filter (where perfil_id = :ADM) = 1
      and count(*) = (select count(*) from public.perfiles where rol = 'administrador' and estado = 'activo')
     from public.notificaciones where origen_tabla = 'citas' and origen_id = :'c76'),
  '22.C5 (ii) Sin designado el aviso va a TODOS los administradores activos');

-- (iii) Designado ADM2 que después pasa a baja: respaldo a los activos, y ADM2 no recibe.
update public.organizacion set administrador_avisos_id = :ADM2;
update public.perfiles set estado = 'baja', estado_desde = now() where id = :ADM2;
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '77 hours 20 minutes', now() - interval '77 hours', 'Europe/Madrid')
returning id as c77 \gset
update public.citas set estado = 'realizada' where id = :'c77';
select id as a77 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c77' and tipo = 'nota_sin_firmar' \gset
select public.escalar_notas_pendientes() as escalado6 \gset
select pg_temp.assert(
  (select count(*) filter (where perfil_id = :ADM2) = 0
      and count(*) filter (where perfil_id = :ADM) = 1
      and count(*) = (select count(*) from public.perfiles where rol = 'administrador' and estado = 'activo')
     from public.notificaciones where origen_tabla = 'citas' and origen_id = :'c77'),
  '22.C5 (iii) Designado de baja: el aviso va a los administradores activos y no a él');
update public.organizacion set administrador_avisos_id = null;

-- (iv) Designar a un administrador INACTIVO (ADM2 está de baja desde (iii)) lanza 23514:
-- sin `p.estado = 'activo'` en el validador esto entraría (A-H5).
select pg_temp.assert_lanza_codigo_msg(
  format('update public.organizacion set administrador_avisos_id = %L', :ADM2),
  '23514', 'debe ser un administrador activo',
  '22.C5 (iv) Designar a un administrador de baja lanza 23514');
select pg_temp.assert(
  (select administrador_avisos_id is null from public.organizacion),
  '22.C5 (iv) La designación rechazada no deja nada guardado');

-- (v) Designado ADM3 activo que después deja de ser administrador: el validador solo se
-- dispara con `update of administrador_avisos_id`, así que no salta. Quien decide es
-- `designado` en el escalado, con `p.rol = 'administrador'` (A-H5).
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :ADM3, 'authenticated', 'authenticated', 'adm3@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"administrador","nombre_completo":"Admin Tres"}'::jsonb, '', '', '', '');
update public.organizacion set administrador_avisos_id = :ADM3;
select pg_temp.assert(
  (select administrador_avisos_id = :ADM3 from public.organizacion),
  '22.C5 (v) (preparación) ADM3, administrador activo, queda designado');
update public.perfiles set rol = 'profesional_sanitario' where id = :ADM3;
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '79 hours 20 minutes', now() - interval '79 hours', 'Europe/Madrid')
returning id as c79 \gset
update public.citas set estado = 'realizada' where id = :'c79';
select public.escalar_notas_pendientes() as escalado7 \gset
select pg_temp.assert(
  (select count(*) filter (where perfil_id = :ADM) = 1
      and count(*) filter (where perfil_id = :ADM3) = 0
     from public.notificaciones where origen_tabla = 'citas' and origen_id = :'c79'),
  '22.C5 (v) Designado que ya no es administrador: el aviso va a los administradores y no a él');
update public.perfiles set rol = 'administrador' where id = :ADM3;
update public.organizacion set administrador_avisos_id = null;

-- A-H6 · el escalado es solo de la nota sin firmar: una consentimiento_pendiente de 4 días
-- NO genera aviso (sin `a.tipo = 'nota_sin_firmar'`, `nivel_nota_pendiente` la pondría en 3).
select public.escalar_notas_pendientes() as escalado8 \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'consentimiento_pendiente', 'consentimientos', gen_random_uuid())
returning id as a4d, origen_id as o4d \gset
update public.alertas_documentacion set referencia_en = now() - interval '4 days' where id = :'a4d';
select count(*) as n_notif_antes from public.notificaciones \gset
select public.escalar_notas_pendientes() as escalado9 \gset
select pg_temp.assert(
  (select count(*) = 0 from public.notificaciones where origen_id = :'o4d')
  and (select count(*) = :n_notif_antes from public.notificaciones),
  '22.C5 Una consentimiento_pendiente de 4 días no escala: ninguna notificación nueva');

-- =========================================================================
-- C6 · Notificaciones: cada cual las suyas, y la baja no lee ni las suyas
-- =========================================================================
insert into public.notificaciones (perfil_id, tipo, detalle) values (:PRO2, 'prueba_22', 'para PRO2')
returning id as n_pro2 \gset
insert into public.notificaciones (perfil_id, tipo, detalle) values (:PRO1, 'prueba_22', 'para PRO1')
returning id as n_pro1 \gset
insert into public.notificaciones (perfil_id, tipo, detalle) values (:PROBAJA, 'prueba_22', 'para PROBAJA')
returning id as n_baja \gset

call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notificaciones where perfil_id = %L', :PRO2)) = 0,
  '22.C6 PRO1 no ve ninguna notificación de PRO2');
with u as (update public.notificaciones set leida_en = now() where id = :'n_pro2' returning 1)
select count(*) as upd_ajena from u \gset
select pg_temp.assert(:upd_ajena = 0, '22.C6 PRO1 no puede marcar como leída una notificación de PRO2 (0 filas)');
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notificaciones where perfil_id = %L and tipo = %L', :PRO1, 'prueba_22')) = 1,
  '22.C6 GEMELA: PRO1 ve la suya');
call pg_temp.reset_sesion();

call pg_temp.como(:PROBAJA);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notificaciones where perfil_id = %L', :PROBAJA)) = 0,
  '22.C6 PROBAJA (de baja) no ve ni las suyas: rol_actual() is not null');
call pg_temp.reset_sesion();

-- =========================================================================
-- C7 · Solo leida_en, solo de null a now(), y para siempre
-- =========================================================================
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set titulo = %L where id = %L', 'x', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 titulo no se toca');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set detalle = %L where id = %L', 'x', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 detalle no se toca');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set tipo = %L where id = %L', 'x', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 tipo no se toca');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set origen_tabla = %L, origen_id = %L where id = %L',
         'citas', :'c25', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 origen_tabla y origen_id no se tocan');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set origen_id = %L where id = %L', :'c25', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 origen_id no se toca');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set id = gen_random_uuid() where id = %L', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 id no se toca');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set creado_en = now() - interval ''1 day'' where id = %L', :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 creado_en no se toca');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set perfil_id = %L where id = %L', :PRO2, :'n_pro1'),
  '42501', 'solo se puede actualizar en su columna leida_en', '22.C7 perfil_id no se toca');

update public.notificaciones set leida_en = timestamptz '2000-01-01 00:00:00+00' where id = :'n_pro1';
select pg_temp.assert(
  (select leida_en = now() from public.notificaciones where id = :'n_pro1'),
  '22.C7 GEMELA: marcar como leída entra y la base pone now(), no el 2000-01-01 del cliente');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set leida_en = null where id = %L', :'n_pro1'),
  '42501', 'no vuelve a no leída', '22.C7 Una leída no vuelve a no leída');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notificaciones set leida_en = %L where id = %L', '2001-01-01', :'n_pro1'),
  '42501', 'no vuelve a no leída', '22.C7 Una leída no cambia de fecha');
call pg_temp.reset_sesion();

-- =========================================================================
-- C8 · El recuento es de MIS notas, aunque la RLS me deje ver las de otro
-- =========================================================================
call pg_temp.como(:PRO1);
select nivel2 as r1_pro1 from public.recuento_notas_pendientes() \gset
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select nivel2 as r1_pro2 from public.recuento_notas_pendientes() \gset
call pg_temp.reset_sesion();

-- Cita de PRO1 con Q22 (paciente de PRO2): PRO2 es asignado del paciente y ve la alerta.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Q22, :PRO1, :CA, now() - interval '26 hours 20 minutes', now() - interval '26 hours', 'Europe/Madrid')
returning id as c26 \gset
update public.citas set estado = 'realizada' where id = :'c26';
select id as a26 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c26' and tipo = 'nota_sin_firmar' \gset

call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.alertas_documentacion_nivel where id = %L and nivel = 2', :'a26')) = 1,
  '22.C8 PRO2 (asignado del paciente) VE la alerta de nivel 2 de PRO1');
select pg_temp.assert(
  (select nivel2 = :r1_pro2 from public.recuento_notas_pendientes()),
  '22.C8 Pero su recuento NO la cuenta: no es suya');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select nivel2 = :r1_pro1 + 1 from public.recuento_notas_pendientes()),
  '22.C8 GEMELA: el recuento de PRO1 sí la cuenta');
call pg_temp.reset_sesion();

-- =========================================================================
-- E1 · El técnico solo ve consentimiento_pendiente (decisión del 01-10)
-- =========================================================================
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'consentimiento_pendiente', 'consentimientos', gen_random_uuid())
returning id as ac1 \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'consentimiento_pendiente', 'consentimientos', gen_random_uuid())
returning id as ac2 \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'consentimiento_pendiente', 'consentimientos', gen_random_uuid())
returning id as ac3 \gset

call pg_temp.como(:TEC1);
-- La consulta literal de app/(app)/pacientes/[id]/datos.ts (cargarAlertasDeDocumentacion).
\set CONSULTA_FICHA 'select id, tipo, fecha_referencia, creada_en from public.alertas_documentacion where paciente_id = ''d0030001-0000-4000-8000-000000000001'' and estado = ''abierta'' order by creada_en desc'
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.tipo = %L', :'CONSULTA_FICHA', 'nota_sin_firmar')) = 0,
  '22.E1 TEC1 no ve ninguna nota_sin_firmar de P1 con la consulta de la ficha');
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.id = %L', :'CONSULTA_FICHA', :'ac1')) = 1,
  '22.E1 GEMELA: TEC1 sí ve la consentimiento_pendiente de P1 (centro A)');
call pg_temp.reset_sesion();

-- A-H3 · La lectura del técnico es una lista blanca: una alerta de CADA uno de los cinco
-- tipos en el centro A (como postgres) y una aserción por tipo. Una política escrita como
-- `tipo <> 'nota_sin_firmar'` dejaría pasar tres de los cuatro que no deben verse.
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'nota_sin_firmar', 'notas_clinicas', gen_random_uuid())
returning id as e1_nota \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'borrador_abandonado', 'notas_clinicas', gen_random_uuid())
returning id as e1_borr \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'consentimiento_pendiente', 'consentimientos', gen_random_uuid())
returning id as e1_cons \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'informe_pendiente', 'informes', gen_random_uuid())
returning id as e1_info \gset
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id)
values (:P1, :PRO1, :CA, 'evaluacion_sin_corregir', 'evaluaciones', gen_random_uuid())
returning id as e1_eval \gset
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.id = %L', :'CONSULTA_FICHA', :'e1_cons')) = 1,
  '22.E1 TEC1 ve la consentimiento_pendiente (1 de 5 tipos)');
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.id = %L', :'CONSULTA_FICHA', :'e1_nota')) = 0,
  '22.E1 TEC1 no ve la nota_sin_firmar (0 de ese tipo)');
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.id = %L', :'CONSULTA_FICHA', :'e1_borr')) = 0,
  '22.E1 TEC1 no ve la borrador_abandonado (0 de ese tipo)');
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.id = %L', :'CONSULTA_FICHA', :'e1_info')) = 0,
  '22.E1 TEC1 no ve la informe_pendiente (0 de ese tipo)');
select pg_temp.assert(
  pg_temp.contar(format('select * from (%s) f where f.id = %L', :'CONSULTA_FICHA', :'e1_eval')) = 0,
  '22.E1 TEC1 no ve la evaluacion_sin_corregir (0 de ese tipo)');
call pg_temp.reset_sesion();

-- =========================================================================
-- E2 / E8 · Nadie cierra a mano una nota pendiente
-- =========================================================================
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L, resuelta_en = now() where id = %L', 'resuelta', :'a25'),
  '42501', 'solo se cierra firmando la nota', '22.E2 PRO1 no cierra su nota_sin_firmar por update');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L, resuelta_en = now() where id = %L', 'resuelta', :'a25'),
  '42501', 'solo se cierra firmando la nota', '22.E8 ADM tampoco cierra una nota_sin_firmar por update');
call pg_temp.reset_sesion();

-- =========================================================================
-- E3 · Ni el instante ni la identidad de una alerta se mueven
-- =========================================================================
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set referencia_en = now() where id = %L', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 referencia_en no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set profesional_id = %L where id = %L', :PRO2, :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 profesional_id no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set tipo = %L where id = %L', 'consentimiento_pendiente', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 tipo no se mueve');
-- A-H1 / A-H4 · una aserción por cada columna congelada (once): quitar cualquiera de la
-- lista del disparador hace fallar la suya.
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set id = gen_random_uuid() where id = %L', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 id no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set paciente_id = %L where id = %L', :Z22, :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 paciente_id no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set centro_id = %L where id = %L', :CB, :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 centro_id no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set origen_tabla = %L where id = %L', 'informes', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 origen_tabla no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set origen_id = gen_random_uuid() where id = %L', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 origen_id no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set fecha_referencia = date ''2000-01-01'' where id = %L', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 fecha_referencia no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set creada_en = now() - interval ''1 day'' where id = %L', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 creada_en no se mueve');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set anulada_en = now() where id = %L', :'a25'),
  '42501', 'no cambia de identidad ni de instante', '22.E3 anulada_en no se mueve');
call pg_temp.reset_sesion();
select pg_temp.assert_no_lanza(
  format('update public.alertas_documentacion set referencia_en = referencia_en - interval ''1 second'' where id = %L', :'a2'),
  '22.E3 GEMELA: como postgres el relleno entra (el disparador solo actúa con authenticated)');

-- =========================================================================
-- E4 · El insert no elige el instante
-- =========================================================================
-- authenticated no tiene grant de INSERT sobre alertas_documentacion (solo select y update):
-- la política de alta (H11) no la alcanza ningún cliente. El disparador cubre a quien sí
-- inserta, que son las funciones definer; se prueba como postgres, igual que ellas.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, referencia_en)
          values (%L, %L, %L, %L, %L, %L, %L)', :P1, :PRO1, :CA, 'borrador_abandonado', 'citas', :'c2', '2000-01-01'),
  '42501', '22.E4 PRO1 no inserta alertas a mano (sin grant)');
call pg_temp.reset_sesion();

insert into public.alertas_documentacion
  (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, referencia_en)
values (:P1, :PRO1, :CA, 'borrador_abandonado', 'citas', :'c2', timestamptz '2000-01-01 00:00:00+00')
returning id as ae4 \gset
select pg_temp.assert(
  (select a.referencia_en = c.fin from public.alertas_documentacion a join public.citas c on c.id = :'c2'
    where a.id = :'ae4'),
  '22.E4 Insertar con referencia_en = 2000-01-01 deja referencia_en = citas.fin');
insert into public.alertas_documentacion
  (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, referencia_en)
values (:P1, :PRO1, :CA, 'informe_pendiente', 'informes', gen_random_uuid(), timestamptz '2000-01-01 00:00:00+00')
returning id as ae4b \gset
select pg_temp.assert(
  (select referencia_en = now() from public.alertas_documentacion where id = :'ae4b'),
  '22.E4 GEMELA: con otro origen, referencia_en = now(), tampoco el 2000-01-01');

-- =========================================================================
-- E5 · Permisos y programación
-- =========================================================================
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.escalar_notas_pendientes()', 'execute'),
  '22.E5 authenticated no ejecuta escalar_notas_pendientes()');
select pg_temp.assert(
  not has_function_privilege('anon', 'public.escalar_notas_pendientes()', 'execute')
  and not has_function_privilege('anon', 'public.umbrales_escalado(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.nivel_nota_pendiente(timestamptz, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.recuento_notas_pendientes()', 'execute'),
  '22.E5 anon no ejecuta ninguna de las cuatro funciones nuevas');
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.recuento_notas_pendientes()', 'execute')
  and has_function_privilege('authenticated', 'public.umbrales_escalado(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.nivel_nota_pendiente(timestamptz, uuid)', 'execute'),
  '22.E5 GEMELA: authenticated ejecuta el recuento, los umbrales y el nivel');
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.notificaciones', 'insert')
  and not has_table_privilege('authenticated', 'public.notificaciones', 'delete')
  and not has_table_privilege('authenticated', 'public.notificaciones', 'truncate'),
  '22.E5 authenticated no inserta, no borra ni trunca notificaciones');
select pg_temp.assert(
  not has_table_privilege('anon', 'public.alertas_documentacion_nivel', 'select')
  and has_table_privilege('authenticated', 'public.alertas_documentacion_nivel', 'select'),
  '22.E5 La vista del nivel: authenticated lee, anon no');
select pg_temp.assert(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c
    where c.oid = 'public.alertas_documentacion_nivel'::regclass),
  '22.E5 La vista del nivel es security_invoker');
select pg_temp.assert(
  (select not p.prosecdef from pg_proc p where p.oid = 'public.fn_proteger_alerta_documentacion()'::regprocedure),
  '22.E5 fn_proteger_alerta_documentacion es invoker (si fuera definer current_user nunca sería authenticated)');
select pg_temp.assert(
  (select count(*) = 1 from cron.job where jobname = 'escalar-notas-pendientes'
     and schedule = '*/15 * * * *' and command like '%public.escalar_notas_pendientes()%'),
  '22.E5 GEMELA: el cron escalar-notas-pendientes está programado cada 15 minutos');
select pg_temp.assert(
  (select p.prosecdef and 'search_path=""' = any (p.proconfig)
     from pg_proc p where p.oid = 'public.fn_anular_alerta_nota_sin_firmar()'::regprocedure),
  '22.E5 fn_anular_alerta_nota_sin_firmar es definer y fija search_path = ''''');
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.fn_anular_alerta_nota_sin_firmar()', 'execute')
  and not has_function_privilege('anon', 'public.fn_anular_alerta_nota_sin_firmar()', 'execute'),
  '22.E5 authenticated y anon no ejecutan fn_anular_alerta_nota_sin_firmar');

-- =========================================================================
-- E6 · Resolver: quién (P1)
-- =========================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.alertas_documentacion where id = %L', :'ac1')) = 1,
  '22.E6 (preparación) TEC1 ve la consentimiento_pendiente de P1');
with u as (update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now()
            where id = :'ac1' returning id)
select count(*) as upd_tec from u \gset
select pg_temp.assert(:upd_tec = 0, '22.E6 TEC1 la ve pero no la resuelve (0 filas: sin política de update)');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
with u as (update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now()
            where id = :'ac1' returning id)
select count(*) as upd_pro2 from u \gset
select pg_temp.assert(:upd_pro2 = 0, '22.E6 PRO2, sin relación con P1, no la resuelve (0 filas)');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
with u as (update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now()
            where id = :'ac1' returning id)
select count(*) as upd_pro1 from u \gset
call pg_temp.reset_sesion();
select pg_temp.assert(:upd_pro1 = 1, '22.E6 GEMELA: PRO1 la resuelve (1 fila)');
select pg_temp.assert(
  (select estado = 'resuelta' from public.alertas_documentacion where id = :'ac1'),
  '22.E6 GEMELA: queda resuelta');
select pg_temp.assert(
  exists (select 1 from public.auditoria
           where tabla = 'alertas_documentacion' and operacion = 'UPDATE'
             and registro_id = :'ac1' and actor_id = :PRO1),
  '22.E6 La resolución queda en auditoria con actor PRO1');

call pg_temp.como(:ADM);
with u as (update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now()
            where id = :'ac2' returning id)
select count(*) as upd_adm from u \gset
call pg_temp.reset_sesion();
select pg_temp.assert(:upd_adm = 1, '22.E6 GEMELA: ADM resuelve otra igual (1 fila)');

-- =========================================================================
-- E7 · Resolver: el reloj lo pone la base y no hay vuelta atrás
-- =========================================================================
call pg_temp.como(:PRO1);
update public.alertas_documentacion set estado = 'resuelta', resuelta_en = timestamptz '2000-01-01 00:00:00+00'
 where id = :'ac3';
select pg_temp.assert(
  (select resuelta_en = now() from public.alertas_documentacion where id = :'ac3'),
  '22.E7 resuelta_en = now(), no el 2000-01-01 del cliente');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L, resuelta_en = null where id = %L', 'abierta', :'ac3'),
  '42501', 'no se reabre', '22.E7 Una alerta resuelta no se reabre');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set resuelta_en = %L where id = %L', '2001-01-01', :'ac3'),
  '42501', 'no se reabre', '22.E7 Ni cambia su fecha de resolución');
call pg_temp.reset_sesion();

-- =========================================================================
-- E9-E12 · Una cita que deja de ser `realizada` anula su alerta (A-H2): solo la base
-- =========================================================================
-- E9 · La cita de 78 h, realizada, con su alerta abierta; PRO1 la corrige a no_asistida.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '78 hours 20 minutes', now() - interval '78 hours', 'Europe/Madrid')
returning id as c78 \gset
update public.citas set estado = 'realizada' where id = :'c78';
select id as a78 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c78' and tipo = 'nota_sin_firmar' and estado = 'abierta' \gset
call pg_temp.como(:PRO1);
select nivel3 as e9_n3 from public.recuento_notas_pendientes() \gset
update public.citas set estado = 'no_asistida' where id = :'c78';
select pg_temp.assert(
  (select nivel3 = :e9_n3 - 1 from public.recuento_notas_pendientes()),
  '22.E9 El recuento de PRO1 baja en 1 al corregir la cita');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select estado = 'anulada' and anulada_en is not null and resuelta_en is null
     from public.alertas_documentacion where id = :'a78'),
  '22.E9 La alerta queda anulada, con anulada_en y sin resuelta_en (no es una resolución)');
select public.escalar_notas_pendientes() as escalado10 \gset
select pg_temp.assert(
  (select count(*) = 0 from public.notificaciones where origen_id = :'c78'),
  '22.E9 El escalado no avisa de una cita que ya no fue realizada');
select pg_temp.assert(
  exists (select 1 from public.auditoria
           where tabla = 'alertas_documentacion' and operacion = 'UPDATE'
             and registro_id = :'a78' and actor_id = :PRO1),
  '22.E9 La anulación queda en auditoria con actor PRO1, quien corrigió la cita');

-- E10 · Nadie anula ni reabre a mano.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L where id = %L', 'anulada', :'e1_cons'),
  '42501', 'Solo la corrección de la cita', '22.E10 PRO1 no anula a mano una alerta (estado)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L, anulada_en = now() where id = %L', 'anulada', :'e1_cons'),
  '42501', 'no cambia de identidad ni de instante', '22.E10 Ni poniendo anulada_en: es columna congelada');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L, anulada_en = null where id = %L', 'abierta', :'a78'),
  '42501', 'no cambia de identidad ni de instante', '22.E10 Una anulada no se reabre (anulada_en congelada)');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L where id = %L', 'abierta', :'a78'),
  '42501', 'solo se cierra firmando la nota', '22.E10 Una anulada no se reabre (estado): una anulada es siempre una nota_sin_firmar');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.alertas_documentacion set estado = %L where id = %L', 'anulada', :'e1_info'),
  '42501', 'Solo la corrección de la cita', '22.E10 GEMELA: tampoco otro tipo de alerta pasa a anulada a mano');
call pg_temp.reset_sesion();

-- E11 · Escalar, anular y volver a realizada: dos alertas, un solo aviso por cita.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '80 hours 20 minutes', now() - interval '80 hours', 'Europe/Madrid')
returning id as c80 \gset
update public.citas set estado = 'realizada' where id = :'c80';
select public.escalar_notas_pendientes() as escalado11 \gset
select pg_temp.assert(
  (select count(*) = 1 from public.notificaciones
    where perfil_id = :ADM and origen_tabla = 'citas' and origen_id = :'c80'),
  '22.E11 (preparación) Escalada una vez: 1 aviso para ADM por la cita');
call pg_temp.como(:PRO1);
update public.citas set estado = 'no_asistida' where id = :'c80';
update public.citas set estado = 'realizada'   where id = :'c80';
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) filter (where estado = 'anulada') = 1
      and count(*) filter (where estado = 'abierta') = 1
      and count(*) = 2
     from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :'c80' and tipo = 'nota_sin_firmar'),
  '22.E11 Tras volver a realizada hay 2 alertas de la cita: 1 anulada y 1 abierta');
select pg_temp.assert(
  (select a.referencia_en = c.fin from public.alertas_documentacion a join public.citas c on c.id = a.origen_id
    where a.origen_id = :'c80' and a.estado = 'abierta'),
  '22.E11 La alerta reabierta cuenta desde el fin de la sesión, no desde la corrección');
select public.escalar_notas_pendientes() as escalado12 \gset
select pg_temp.assert(
  (select count(*) = 1 from public.notificaciones
    where perfil_id = :ADM and origen_tabla = 'citas' and origen_id = :'c80'),
  '22.E11 El segundo escalado no duplica el aviso de ADM por la misma cita (idempotencia por cita)');

-- E12 · Con la nota ya resuelta, corregir la cita no toca la alerta.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '81 hours 20 minutes', now() - interval '81 hours', 'Europe/Madrid')
returning id as c81 \gset
update public.citas set estado = 'realizada' where id = :'c81';
select id as a81 from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :'c81' and tipo = 'nota_sin_firmar' \gset
update public.alertas_documentacion set estado = 'resuelta', resuelta_en = now() where id = :'a81';
call pg_temp.como(:PRO1);
update public.citas set estado = 'cancelada' where id = :'c81';
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select estado = 'resuelta' and anulada_en is null and resuelta_en is not null
     from public.alertas_documentacion where id = :'a81'),
  '22.E12 Una alerta ya resuelta no se anula al corregir la cita');

-- E13 · TODAS las salidas de `realizada` anulan la alerta abierta (A2-H1): el `when` del
-- disparador no se reduce a `no_asistida`. Cada destino con su cita y su alerta: cancelada,
-- por la puerta definer del técnico (agenda_actualizar_cita); confirmada y programada, por
-- el profesional.
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '86 hours 20 minutes', now() - interval '86 hours', 'Europe/Madrid')
returning id as c86 \gset
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '88 hours 20 minutes', now() - interval '88 hours', 'Europe/Madrid')
returning id as c88 \gset
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '90 hours 20 minutes', now() - interval '90 hours', 'Europe/Madrid')
returning id as c90 \gset
update public.citas set estado = 'realizada' where id in (:'c86', :'c88', :'c90');
select pg_temp.assert(
  (select count(*) = 3 from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id in (:'c86', :'c88', :'c90')
      and tipo = 'nota_sin_firmar' and estado = 'abierta'),
  '22.E13 (preparación) Tres citas realizadas, cada una con su alerta abierta');

call pg_temp.como(:TEC1);
select public.agenda_actualizar_cita(:'c86'::uuid, p_estado => 'cancelada');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
update public.citas set estado = 'confirmada' where id = :'c88';
update public.citas set estado = 'programada' where id = :'c90';
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select estado = 'anulada' and anulada_en is not null and resuelta_en is null
     from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :'c86' and tipo = 'nota_sin_firmar'),
  '22.E13 realizada → cancelada (por el técnico, agenda_actualizar_cita) anula la alerta');
select pg_temp.assert(
  (select estado = 'anulada' and anulada_en is not null and resuelta_en is null
     from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :'c88' and tipo = 'nota_sin_firmar'),
  '22.E13 realizada → confirmada anula la alerta');
select pg_temp.assert(
  (select estado = 'anulada' and anulada_en is not null and resuelta_en is null
     from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :'c90' and tipo = 'nota_sin_firmar'),
  '22.E13 realizada → programada anula la alerta');
select public.escalar_notas_pendientes() as escalado13 \gset
select pg_temp.assert(
  (select count(*) = 0 from public.notificaciones where origen_id in (:'c86', :'c88', :'c90')),
  '22.E13 El escalado no avisa de ninguna de las tres citas corregidas');

-- E13 · GEMELA: una cita que sigue `realizada` conserva su alerta (otra columna no anula).
insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
values (:Z22, :PRO1, :CA, now() - interval '92 hours 20 minutes', now() - interval '92 hours', 'Europe/Madrid')
returning id as c92 \gset
update public.citas set estado = 'realizada' where id = :'c92';
call pg_temp.como(:PRO1);
update public.citas set sala = 'Sala E13' where id = :'c92';
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select estado = 'abierta' and anulada_en is null
     from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :'c92' and tipo = 'nota_sin_firmar'),
  '22.E13 GEMELA: una cita que sigue realizada conserva su alerta abierta');

-- E14 · El escalado copia el origen de la alerta, no lo supone cita (A2-H2). Una
-- nota_sin_firmar con origen `notas_clinicas` (la del seed a0080007-…-03 es así) y 100 h
-- de antigüedad. El disparador fija la referencia solo para `citas`, así que se apaga para
-- fijarla a mano; la fila de la prueba nace en nivel 3.
select gen_random_uuid() as n14 \gset
alter table public.alertas_documentacion disable trigger fijar_referencia_alerta;
insert into public.alertas_documentacion
  (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, fecha_referencia, referencia_en)
values (:Z22, :PRO1, :CA, 'nota_sin_firmar', 'notas_clinicas', :'n14', (now() - interval '4 days')::date, now() - interval '100 hours');
alter table public.alertas_documentacion enable trigger fijar_referencia_alerta;
select pg_temp.assert(
  (select count(*) = 1 from public.alertas_documentacion
    where origen_tabla = 'notas_clinicas' and origen_id = :'n14'
      and public.nivel_nota_pendiente(referencia_en, centro_id) = 3),
  '22.E14 (preparación) La alerta con origen notas_clinicas nace en nivel 3');
select public.escalar_notas_pendientes() as escalado14 \gset
select pg_temp.assert(
  (select count(*) = 1 from public.notificaciones
    where perfil_id = :ADM and origen_tabla = 'notas_clinicas' and origen_id = :'n14'),
  '22.E14 El aviso lleva el origen de la alerta (notas_clinicas), no el literal citas');
select pg_temp.assert(
  (select count(*) = 0 from public.notificaciones
    where origen_tabla = 'citas' and origen_id = :'n14'),
  '22.E14 GEMELA: ningún aviso apunta a una cita con el id de la nota');

-- ---------------------------------------------------------------------------
-- Mutantes verificados a mano (03-10-2026, implementación de T-015)
-- ---------------------------------------------------------------------------
-- Inyectando el mutante justo antes de este módulo y corriendo el banco entero, cada uno lo
-- pone en rojo en la aserción indicada; sin mutante, el banco está en verde:
--   · disparador proteger_notificacion apagado        → 22.C7 titulo no se toca (no lanzó)
--   · disparador proteger_alerta_documentacion apagado → 22.E2 PRO1 no cierra su nota_sin_firmar
--   · disparador fijar_referencia_alerta apagado       → 22.C4 referencia_en es el fin de la cita
--   · disparador validar_administrador_avisos apagado  → 22.C5 designar a un profesional (23514)
--   · recuento_notas_pendientes() sin `profesional_id = uid` → 22.C8 su recuento NO la cuenta
--   · notificaciones_lectura_propia sin `rol_actual() is not null` → 22.C6 PROBAJA no ve las suyas
--   · alertas_documentacion_lectura con la fuga del técnico (sin filtro de tipo) → 22.E1
--   · umbrales_escalado() que devuelve 24/72 fijos       → 22.C4 umbral por centro
--   · escalar_notas_pendientes() a todos los administradores, sin designado → 22.C5 (i)
-- Ronda 2 (03-10-2026, A-H1..A-H6; con `mutar.mjs`, que quita los `\r` de la migración CRLF):
--   · sin el disparador que anula al corregir la cita  → 22.E9 el recuento de PRO1 baja en 1
--   · sin la rama `anulada` del disparador de guarda   → 22.E10 PRO1 no anula a mano (lanza 23514
--     por el check `alertas_documentacion_anulada_check` en vez de 42501: lo mata la restricción,
--     no la aserción; la aserción exige el código exacto y por eso también salta)
--   · fn_anular_alerta_nota_sin_firmar en invoker      → 22.E5 es definer y fija search_path = ''
--   · política de lectura del técnico por lista negra  → 22.E1 TEC1 no ve la borrador_abandonado
--   · validador de administrador sin `activo`          → 22.C5 (iv) designar a uno de baja lanza 23514
--   · cada columna congelada desbloqueada (id, paciente_id, profesional_id, centro_id, tipo,
--     origen_tabla, origen_id, fecha_referencia, referencia_en, creada_en, anulada_en) → 22.E3
--   · «sin estado = abierta» en la anulación: lo mata `alertas_documentacion_check` (23514) en
--     el `update public.citas set estado = 'cancelada'` de 22.E12: la anulación pisaría la
--     `resuelta` y dejaría `resuelta_en` no nulo con `estado = 'anulada'`. Lo mata la
--     restricción, no una aserción. Un `deadlock detected` NO cuenta como muerte de mutante: el
--     banco tiene un deadlock intermitente (autovacuum, antes del módulo 22) y deja el banco
--     sin llegar a este módulo.
-- Ronda 3 (03-10-2026, A2-H1 y A2-H2; con `mutar3.mjs`, mismo método):
--   · `when` del disparador reducido a `new.estado = 'no_asistida'`    → 22.E13 realizada → cancelada
--   · `when` reducido a `new.estado in ('no_asistida', 'cancelada')`    → 22.E13 realizada → confirmada
--   · escalado con el literal 'citas' en vez de `a.origen_tabla`        → 22.E14 el aviso lleva notas_clinicas
-- En total, 19 entradas y 29 mutantes: 9 de la implementación, 7 entradas de la ronda 2 (la de
-- columnas congeladas son 11 mutantes, uno por columna) y 3 de la ronda 3. Dos más se descartan por equivalentes: anular sin
-- `tipo = 'nota_sin_firmar'` (solo ese tipo tiene origen `citas`) y `old.estado = 'resuelta'` en
-- vez de `<> 'abierta'` en «una cerrada no se reabre».

\echo '22-avisos: completa.'
