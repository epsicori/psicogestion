-- T-012 · Borrador, firma y alerta de nota sin firmar (corte A, diseño §1.2 y §A).
--
-- Prueba la base, no la aplicación: `fn_tocar_borrador()` endurecido (el llamante no elige ni
-- `borrador_abierta_en` ni el testigo `borrador_actualizado_en`), el check todo-o-nada, el
-- índice único (cita, autor), los márgenes de sesión y `fn_resolver_alerta_nota_sin_firmar()`.
-- Corre el último (hereda estado de 01-19) y crea SUS PROPIOS pacientes, episodios y citas.
--
-- `now()` es constante dentro de la transacción del banco: para distinguir «se conservó» de
-- «se reescribió con now()» el borrador se envejece a mano con el disparador apagado, y el
-- disparador se enciende otra vez antes de cada aserción.

\echo ''
\echo '=== 20-nota-borrador ==='

\set P20   '\'d0120001-0000-4000-8000-000000000001\''
\set Q20   '\'d0120001-0000-4000-8000-000000000002\''
\set E20   '\'e0120001-0000-4000-8000-000000000001\''
\set EQ20  '\'e0120001-0000-4000-8000-000000000002\''
\set C1    '\'a0120001-0000-4000-8000-000000000001\''
\set C2    '\'a0120001-0000-4000-8000-000000000002\''
\set C3    '\'a0120001-0000-4000-8000-000000000003\''
\set C4    '\'a0120001-0000-4000-8000-000000000004\''
\set C5    '\'a0120001-0000-4000-8000-000000000005\''
\set NB    '\'f0120001-0000-4000-8000-0000000000b0\''
\set N0    '\'f0120001-0000-4000-8000-000000000000\''
\set N1    '\'f0120001-0000-4000-8000-000000000001\''
\set N2    '\'f0120001-0000-4000-8000-000000000002\''
\set N3    '\'f0120001-0000-4000-8000-000000000003\''
\set N5    '\'f0120001-0000-4000-8000-000000000005\''
\set NA    '\'f0120001-0000-4000-8000-0000000000a0\''
\set EP2   '\'e0120001-0000-4000-8000-000000000003\''
\set NP2   '\'f0120001-0000-4000-8000-0000000000d2\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P20, 'Paula', 'T012 P', :PRO1, :CA),
  (:Q20, 'Quique', 'T012 Q', :PRO1, :CA);
insert into public.episodios_asistenciales
  (id, paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en) values
  (:E20,  :P20, :PRO1, :CA, 'individual', current_date - 10),
  (:EQ20, :Q20, :PRO1, :CA, 'individual', current_date - 10);

-- ---------------------------------------------------------------------------
-- B · El borrador: el llamante no elige abierta_en ni el testigo
-- ---------------------------------------------------------------------------
-- 20.B1 · En el INSERT, lo que mande el cliente se ignora.
insert into public.notas_clinicas
  (id, paciente_id, episodio_id, autor_id, borrador_contenido, borrador_autor_id,
   borrador_actualizado_en, borrador_abierta_en)
values
  (:NB, :P20, :E20, :PRO1, '{"texto":"a"}', :PRO1,
   timestamptz '2000-01-01 00:00:00+00', timestamptz '2000-01-01 00:00:00+00');
select pg_temp.assert(
  (select borrador_abierta_en = now() and borrador_actualizado_en = now()
     from public.notas_clinicas where id = :NB),
  '20.B1 En el INSERT la base fija abierta_en y el testigo; el 2000-01-01 del cliente se ignora');

-- Se envejece el borrador (disparador apagado) para que «conservar» no se confunda con now().
alter table public.notas_clinicas disable trigger tocar_borrador;
update public.notas_clinicas
   set borrador_abierta_en = now() - interval '1 day',
       borrador_actualizado_en = now() - interval '1 day'
 where id = :NB;
alter table public.notas_clinicas enable trigger tocar_borrador;
select pg_temp.assert(
  (select borrador_abierta_en = now() - interval '1 day' from public.notas_clinicas where id = :NB),
  '20.B1 (preparación) el borrador de prueba tiene un abierta_en de ayer');

-- 20.B2 · Cambia el contenido, el cliente manda otro abierta_en: se conserva el de ayer; el
--         testigo sí se mueve.
update public.notas_clinicas
   set borrador_contenido = '{"texto":"b"}',
       borrador_abierta_en = timestamptz '2001-01-01 00:00:00+00'
 where id = :NB;
select pg_temp.assert(
  (select borrador_abierta_en = now() - interval '1 day' and borrador_actualizado_en = now()
     from public.notas_clinicas where id = :NB),
  '20.B2 Con contenido nuevo: abierta_en se conserva (ayer, no el 2001 del cliente) y el testigo se mueve');

-- 20.B3 · Mismo contenido y un testigo forjado por el cliente: el testigo no se mueve.
alter table public.notas_clinicas disable trigger tocar_borrador;
update public.notas_clinicas set borrador_actualizado_en = now() - interval '1 hour' where id = :NB;
alter table public.notas_clinicas enable trigger tocar_borrador;
update public.notas_clinicas
   set borrador_contenido = '{"texto":"b"}',
       borrador_actualizado_en = timestamptz '2002-01-01 00:00:00+00'
 where id = :NB;
select pg_temp.assert(
  (select borrador_actualizado_en = now() - interval '1 hour' and borrador_abierta_en = now() - interval '1 day'
     from public.notas_clinicas where id = :NB),
  '20.B3 Sin cambio de contenido el testigo no se mueve aunque el cliente mande otro (el 2002 se ignora)');

-- 20.B4 · El check todo-o-nada, ejercido con el disparador apagado (con él encendido el
--         disparador lo rellena siempre y el check no se alcanza).
alter table public.notas_clinicas disable trigger tocar_borrador;
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set borrador_abierta_en = null where id = %L', :NB),
  '23514', 'notas_clinicas_borrador_abierta_ck',
  '20.B4 Contenido sin abierta_en: 23514 por notas_clinicas_borrador_abierta_ck');
select pg_temp.assert_lanza_codigo_msg(
  format('update public.notas_clinicas set borrador_contenido = null where id = %L', :NB),
  '23514', 'notas_clinicas_borrador_abierta_ck',
  '20.B4 abierta_en sin contenido: 23514 por el mismo check');
alter table public.notas_clinicas enable trigger tocar_borrador;
-- Gemela positiva: con el disparador encendido, vaciar el contenido vacía las cuatro columnas.
savepoint s20_b4;
update public.notas_clinicas set borrador_contenido = null where id = :NB;
select pg_temp.assert(
  (select borrador_contenido is null and borrador_abierta_en is null
          and borrador_actualizado_en is null and borrador_autor_id is null
     from public.notas_clinicas where id = :NB),
  '20.B4 (gemela) Con el disparador encendido, vaciar el contenido vacía las cuatro columnas');
rollback to savepoint s20_b4;

-- 20.B5 · Firmar vacía el borrador (fn_vaciar_borrador_al_firmar), también abierta_en.
select pg_temp.assert(
  (select borrador_abierta_en is not null from public.notas_clinicas where id = :NB),
  '20.B5 (antes de firmar) el borrador tiene abierta_en');
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:NB, '{"texto":"b"}',
   pg_temp.sobre_prueba(:NB, :PRO1, timestamptz '2026-10-02 10:00:00+00', '{"texto":"b"}'::jsonb),
   'individual', :PRO1, timestamptz '2026-10-02 10:00:00+00');
select pg_temp.assert(
  (select borrador_contenido is null and borrador_abierta_en is null
          and borrador_actualizado_en is null and borrador_autor_id is null
     from public.notas_clinicas where id = :NB),
  '20.B5 Al firmar, las cuatro columnas del borrador quedan vacías, abierta_en incluida');

-- 20.B6 · Reabrir tras firmar: abierta_en vuelve a ser now(), no lo que mande el cliente (R1-H2).
--         La rama «reabrir» de fn_tocar_borrador es la de UPDATE con old.borrador_abierta_en nulo:
--         es la que un coalesce(new.borrador_abierta_en, …) dejaría abierta a la casilla del cliente.
update public.notas_clinicas
   set borrador_contenido = '{"texto":"c"}', borrador_autor_id = :PRO1,
       borrador_abierta_en = timestamptz '2003-01-01 00:00:00+00'
 where id = :NB;
select pg_temp.assert(
  (select borrador_abierta_en = now() and borrador_actualizado_en = now()
     from public.notas_clinicas where id = :NB),
  '20.B6 Reabrir un borrador tras firmar: abierta_en = now(); el 2003-01-01 del cliente se ignora');

-- 20.B7 · B1 y B3 como el usuario real (R1-H4): el disparador es invoker y corre igual bajo
--         `authenticated` con la historia desbloqueada. Un atajo «si auth.uid() no es nulo, salir»
--         dejaría pasar la casilla del cliente justo por el camino que usa la aplicación.
call pg_temp.como_con_2fa(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  '20.B7 (preparación) PRO1 desbloquea su historia');
insert into public.notas_clinicas
  (id, paciente_id, episodio_id, autor_id, borrador_contenido, borrador_autor_id,
   borrador_actualizado_en, borrador_abierta_en)
values
  (:NA, :P20, :E20, :PRO1, '{"texto":"a"}', :PRO1,
   timestamptz '2000-01-01 00:00:00+00', timestamptz '2000-01-01 00:00:00+00');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select borrador_abierta_en = now() and borrador_actualizado_en = now()
     from public.notas_clinicas where id = :NA),
  '20.B7 Como authenticated, en el INSERT la base fija abierta_en y el testigo (el 2000 del cliente se ignora)');
alter table public.notas_clinicas disable trigger tocar_borrador;
update public.notas_clinicas
   set borrador_abierta_en = now() - interval '1 day',
       borrador_actualizado_en = now() - interval '1 hour'
 where id = :NA;
alter table public.notas_clinicas enable trigger tocar_borrador;
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  '20.B7 (preparación) PRO1 sigue desbloqueado');
update public.notas_clinicas
   set borrador_contenido = '{"texto":"a"}',
       borrador_actualizado_en = timestamptz '2002-01-01 00:00:00+00',
       borrador_abierta_en = timestamptz '2001-01-01 00:00:00+00'
 where id = :NA;
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select borrador_actualizado_en = now() - interval '1 hour' and borrador_abierta_en = now() - interval '1 day'
     from public.notas_clinicas where id = :NA),
  '20.B7 Como authenticated, sin cambio de contenido el testigo y abierta_en no se mueven (el 2002 y el 2001 se ignoran)');

-- ---------------------------------------------------------------------------
-- U · Un borrador por cita y autor
-- ---------------------------------------------------------------------------
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:C5, :P20, :PRO1, :CA, now() - interval '44 days 3 hours', now() - interval '44 days 3 hours' + interval '50 minutes', 'Europe/Madrid');
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, cita_id)
  values (:N5, :P20, :E20, :PRO1, :C5);
savepoint s20_u;
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L)',
         :P20, :E20, :PRO1, :C5),
  '23505', 'notas_clinicas_cita_autor_uidx',
  '20.U1 Segunda cabecera para la misma cita y el mismo autor: 23505 por el índice único');
rollback to savepoint s20_u;
-- Gemelas: otro autor con la misma cita, y el mismo autor sin cita (varias), sí entran.
-- 20.U3 · PRO2, con su propio episodio de P20, abre SU nota de la misma cita C5 (R1-H3): el
--         índice es (cita_id, autor_id). Reducido a (cita_id) esta sentencia daría 23505.
insert into public.episodios_asistenciales
  (id, paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en) values
  (:EP2, :P20, :PRO2, :CA, 'individual', current_date - 10);
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, cita_id) values (%L, %L, %L, %L, %L)',
         :NP2, :P20, :EP2, :PRO2, :C5),
  '20.U3 Otro autor con la MISMA cita entra: el índice único es (cita_id, autor_id), no (cita_id)');
select pg_temp.assert_no_lanza(
  format('insert into public.notas_clinicas (paciente_id, episodio_id, autor_id) values (%L, %L, %L), (%L, %L, %L)',
         :P20, :E20, :PRO1, :P20, :E20, :PRO1),
  '20.U2 Dos notas del mismo autor SIN cita entran (el índice es parcial: cita_id is not null)');

-- ---------------------------------------------------------------------------
-- M · Margen de sesión
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select margen_sesion_minutos from public.organizacion) = 15
  and (select count(*) from public.centros where margen_sesion_minutos is not null and id in (:CA, :CB)) = 0,
  '20.M1 Valor por defecto: 15 minutos en la organización y los centros del banco heredan (nulo)');
select pg_temp.assert_lanza_codigo(
  'update public.organizacion set margen_sesion_minutos = -1', '23514', '20.M2 Margen -1 en la organización: 23514');
select pg_temp.assert_lanza_codigo(
  'update public.organizacion set margen_sesion_minutos = 121', '23514', '20.M2 Margen 121 en la organización: 23514');
select pg_temp.assert_lanza_codigo(
  format('update public.centros set margen_sesion_minutos = -1 where id = %L', :CA), '23514', '20.M3 Margen -1 en el centro: 23514');
select pg_temp.assert_lanza_codigo(
  format('update public.centros set margen_sesion_minutos = 121 where id = %L', :CA), '23514', '20.M3 Margen 121 en el centro: 23514');
savepoint s20_m;
update public.organizacion set margen_sesion_minutos = 120;
update public.centros set margen_sesion_minutos = 0 where id = :CA;
select pg_temp.assert(
  (select margen_sesion_minutos from public.organizacion) = 120
  and (select margen_sesion_minutos from public.centros where id = :CA) = 0,
  '20.M4 (gemela) Los bordes 0 y 120 son válidos');
rollback to savepoint s20_m;

-- ---------------------------------------------------------------------------
-- A · Firmar resuelve la alerta nota_sin_firmar de SU cita (D2)
-- ---------------------------------------------------------------------------
-- C1 (P, PRO1) es la cita de la nota N1. C2 es de OTRO paciente (Q), C3 de OTRO profesional
-- (PRO2), C4 es de P y PRO1 pero ninguna nota cuelga de ella.
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:C1, :P20, :PRO1, :CA, now() - interval '41 days 3 hours', now() - interval '41 days 3 hours' + interval '50 minutes', 'Europe/Madrid'),
  (:C2, :Q20, :PRO1, :CA, now() - interval '42 days 3 hours', now() - interval '42 days 3 hours' + interval '50 minutes', 'Europe/Madrid'),
  (:C3, :P20, :PRO2, :CA, now() - interval '43 days 3 hours', now() - interval '43 days 3 hours' + interval '50 minutes', 'Europe/Madrid'),
  (:C4, :P20, :PRO1, :CA, now() - interval '45 days 3 hours', now() - interval '45 days 3 hours' + interval '50 minutes', 'Europe/Madrid');
update public.citas set estado = 'realizada' where id in (:C1, :C2, :C3, :C4);
select pg_temp.assert(
  (select count(*) from public.alertas_documentacion
    where origen_tabla = 'citas' and tipo = 'nota_sin_firmar' and estado = 'abierta'
      and origen_id in (:C1, :C2, :C3, :C4)) = 4,
  '20.A0 Las cuatro citas realizadas abren su alerta nota_sin_firmar (punto de partida)');

-- Cabeceras: N1 con C1; N2 (de P) con C2 (cita de otro paciente); N3 (de PRO1) con C3 (cita de
-- otro profesional); N0 sin cita.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, cita_id) values
  (:N1, :P20, :E20, :PRO1, :C1),
  (:N2, :P20, :E20, :PRO1, :C2),
  (:N3, :P20, :E20, :PRO1, :C3),
  (:N0, :P20, :E20, :PRO1, null);

-- 20.A1 · Firmar una nota cuya cita es de otro paciente: la versión entra y la alerta sigue.
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:N2, '{"texto":"x"}',
   pg_temp.sobre_prueba(:N2, :PRO1, timestamptz '2026-10-02 11:00:00+00', '{"texto":"x"}'::jsonb, p_cita_id => :C2::uuid),
   'individual', :PRO1, timestamptz '2026-10-02 11:00:00+00');
select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where nota_id = :N2) = 1
  and (select count(*) from public.alertas_documentacion
        where origen_id = :C2 and tipo = 'nota_sin_firmar' and estado = 'abierta') = 1,
  '20.A1 Nota con la cita de OTRO paciente: la versión entró y la alerta de esa cita sigue abierta');

-- 20.A2 · Cita de otro profesional.
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:N3, '{"texto":"x"}',
   pg_temp.sobre_prueba(:N3, :PRO1, timestamptz '2026-10-02 11:05:00+00', '{"texto":"x"}'::jsonb, p_cita_id => :C3::uuid),
   'individual', :PRO1, timestamptz '2026-10-02 11:05:00+00');
select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where nota_id = :N3) = 1
  and (select count(*) from public.alertas_documentacion
        where origen_id = :C3 and tipo = 'nota_sin_firmar' and estado = 'abierta') = 1,
  '20.A2 Nota con la cita de OTRO profesional: la versión entró y la alerta de esa cita sigue abierta');

-- 20.A5 · Nota sin cita: entra y no toca ninguna alerta.
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:N0, '{"texto":"x"}',
   pg_temp.sobre_prueba(:N0, :PRO1, timestamptz '2026-10-02 11:10:00+00', '{"texto":"x"}'::jsonb),
   'individual', :PRO1, timestamptz '2026-10-02 11:10:00+00');
select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where nota_id = :N0) = 1
  and (select count(*) from public.alertas_documentacion
        where origen_tabla = 'citas' and tipo = 'nota_sin_firmar' and estado = 'abierta'
          and origen_id in (:C1, :C2, :C3, :C4)) = 4,
  '20.A5 Nota sin cita: la versión entró y las cuatro alertas siguen abiertas');

-- 20.A3 · Gemela positiva: la nota que SÍ es de su cita resuelve la suya y solo la suya.
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:N1, '{"texto":"v1"}',
   pg_temp.sobre_prueba(:N1, :PRO1, timestamptz '2026-10-02 12:00:00+00', '{"texto":"v1"}'::jsonb, p_cita_id => :C1::uuid),
   'individual', :PRO1, timestamptz '2026-10-02 12:00:00+00');
select pg_temp.assert(
  (select estado = 'resuelta' and resuelta_en is not null
     from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :C1 and tipo = 'nota_sin_firmar'),
  '20.A3 Firmar N1 resuelve la alerta de C1 y rellena resuelta_en');
select pg_temp.assert(
  (select count(*) from public.alertas_documentacion
    where origen_tabla = 'citas' and tipo = 'nota_sin_firmar' and estado = 'abierta'
      and origen_id in (:C2, :C3, :C4)) = 3,
  '20.A3 C2, C3 y C4 siguen abiertas (la de otro paciente, la de otro profesional y la de la cita sin nota)');

-- 20.A4 · La v2 no mueve el resuelta_en que dejó la v1.
-- now() es constante en la transacción: sin envejecer la alerta, la v1 y la v2 escribirían el mismo
-- instante y «no se movió» sería indistinguible de «se reescribió» (R1-H1).
update public.alertas_documentacion
   set resuelta_en = now() - interval '1 day'
 where origen_tabla = 'citas' and origen_id = :C1 and tipo = 'nota_sin_firmar';
select resuelta_en as resuelta_v1
  from public.alertas_documentacion
 where origen_tabla = 'citas' and origen_id = :C1 and tipo = 'nota_sin_firmar' \gset
select pg_temp.assert(:'resuelta_v1'::timestamptz = now() - interval '1 day',
  '20.A4 (preparación) la alerta resuelta de C1 tiene un resuelta_en de ayer');
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en, motivo_cambio) values
  (:N1, '{"texto":"v2"}',
   pg_temp.sobre_prueba(:N1, :PRO1, timestamptz '2026-10-02 13:00:00+00', '{"texto":"v2"}'::jsonb,
                         p_motivo_cambio => 'corrección', p_cita_id => :C1::uuid),
   'individual', :PRO1, timestamptz '2026-10-02 13:00:00+00', 'corrección');
select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where nota_id = :N1) = 2
  and (select resuelta_en = :'resuelta_v1'::timestamptz
         from public.alertas_documentacion
        where origen_tabla = 'citas' and origen_id = :C1 and tipo = 'nota_sin_firmar'),
  '20.A4 La versión 2 entra y deja intacto el resuelta_en (de ayer, no now()) de la versión 1');

-- ---------------------------------------------------------------------------
-- Demostraciones de mutante (con el disparador apagado la prueba cambia)
-- ---------------------------------------------------------------------------
-- Mutante 1: sin `resolver_alerta_nota_sin_firmar` la alerta de C4 NO se resuelve al firmar su nota.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, cita_id)
  values ('f0120001-0000-4000-8000-0000000000c4', :P20, :E20, :PRO1, :C4);
alter table public.notas_clinicas_versiones disable trigger resolver_alerta_nota_sin_firmar;
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  ('f0120001-0000-4000-8000-0000000000c4', '{"texto":"m"}',
   pg_temp.sobre_prueba('f0120001-0000-4000-8000-0000000000c4', :PRO1, timestamptz '2026-10-02 14:00:00+00',
                         '{"texto":"m"}'::jsonb, p_cita_id => :C4::uuid),
   'individual', :PRO1, timestamptz '2026-10-02 14:00:00+00');
select pg_temp.assert(
  (select estado = 'abierta' from public.alertas_documentacion
    where origen_tabla = 'citas' and origen_id = :C4 and tipo = 'nota_sin_firmar'),
  '20.MUT1 Con el disparador de resolución apagado la alerta de C4 sigue abierta: la 20.A3 la discrimina');
alter table public.notas_clinicas_versiones enable trigger resolver_alerta_nota_sin_firmar;

-- Mutante 2: sin `tocar_borrador` lo que manda el cliente SÍ llega a la fila (la 20.B1 lo detecta).
alter table public.notas_clinicas disable trigger tocar_borrador;
insert into public.notas_clinicas
  (id, paciente_id, episodio_id, autor_id, borrador_contenido, borrador_autor_id,
   borrador_actualizado_en, borrador_abierta_en)
values
  ('f0120001-0000-4000-8000-0000000000b1', :P20, :E20, :PRO1, '{"texto":"a"}', :PRO1,
   timestamptz '2000-01-01 00:00:00+00', timestamptz '2000-01-01 00:00:00+00');
select pg_temp.assert(
  (select borrador_abierta_en = timestamptz '2000-01-01 00:00:00+00'
     from public.notas_clinicas where id = 'f0120001-0000-4000-8000-0000000000b1'),
  '20.MUT2 Con tocar_borrador apagado el 2000-01-01 del cliente persiste: la 20.B1 lo discrimina');
alter table public.notas_clinicas enable trigger tocar_borrador;

-- ---------------------------------------------------------------------------
-- Mutantes de FUNCIÓN e ÍNDICE verificados a mano (02-10-2026, ronda de correcciones de T-012)
-- ---------------------------------------------------------------------------
-- Sustituyendo el objeto en la base viva (create or replace / drop index + create) y corriendo el
-- banco, cada prueba se pone en rojo; con el objeto original, en verde:
--   · 20.A4 — fn_resolver_alerta_nota_sin_firmar() SIN `and estado = 'abierta'`.
--             ERROR: ASERCIÓN FALLIDA: 20.A4 La versión 2 entra y deja intacto el resuelta_en ...
--   · 20.B6 — fn_tocar_borrador() con `coalesce(old…, new.borrador_abierta_en, now())` al reabrir.
--             ERROR: ASERCIÓN FALLIDA: 20.B6 Reabrir un borrador tras firmar ...
--   · 20.B7 — fn_tocar_borrador() con `if auth.uid() is not null then return new; end if;` al
--             principio (las 20.B1-B6 corren como postgres y NO lo ven; solo la 20.B7 sí).
--             ERROR: ASERCIÓN FALLIDA: 20.B7 Como authenticated, en el INSERT ...
--   · 20.U3 — índice notas_clinicas_cita_autor_uidx reducido a (cita_id).
--             ERROR: FALLO: 20.U3 Otro autor con la MISMA cita entra ... (lanzó 23505)
-- Los dos mutantes de disparador apagado (MUT1, MUT2, arriba) cubren otras guardas.

\echo '20-nota-borrador: completa.'
