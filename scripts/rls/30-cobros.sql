-- T-023 · Cobros, cobros parciales y pendiente de cobro (tickets/T-023/diseno.md, §1.2).
--
-- Prueba la migración 20261013120000_cobros_y_pendiente.sql:
--   A · catálogo: la vista `pendiente_paciente` (definer con barrera, ocho columnas exactas, sin
--       tipo_terapia_id ni cita_id, solo SELECT para authenticated), `cobros.motivo` y su check
--       validado, el grant de insert de `motivo`, el disparador `validar_cobro` y la solo adición
--   B · los 100 € de P30A: dos parciales dejan `pendiente`, el tercero `cobrado`, el cuarto
--       `cobrado_de_mas` con su excedente, y dos devoluciones con motivo mueven el pendiente
--   C · qué se devenga (P30C): tarifa base, sin precio (cuenta 0 y se señala), el bono una vez y
--       no su cita, la tarifa del mismo día con mayor `orden`, y ni canceladas, ni no asistidas,
--       ni programadas, ni confirmadas
--   D · quién ve qué, con gemelas, y D9: la vista y `cobros` dan los mismos pacientes por rol
--   E · escritura: update/delete/truncate sobre cobros fallan (con gemela de lectura de la
--       misma fila), devolución sin motivo, fecha futura y la exención de postgres
--
-- Reutiliza los actores de 01-fijacion.sql (ADM, PRO1 de CA, PRO2 de CB, TEC1 de CA, CA, CB).
-- Fijación propia, ids con el prefijo 30300000-. Recuentos acotados a los pacientes del banco.
-- ANCLA (README, punto 10, regla 2): primer lunes de marzo de año + 11 (`lunes_30` = D). Las citas
-- de PRO1 van de D-10 a D+5, una por día.
--
-- Ronda 2: A5 (filtro de partidas), A9b, E10 (zona del centro), F (fusión en un salto) y G (funciones de lectura).
-- Los mutantes M1-M17 están al final, anotados, y en tickets/T-023/mutantes.json.

\echo ''
\echo '=== 30-cobros ==='

\set T30    '\'30300000-0000-0000-0000-000000000001\''
\set T30N   '\'30300000-0000-0000-0000-000000000002\''
\set P30A   '\'30300000-0000-0000-0000-000000000003\''
\set P30B   '\'30300000-0000-0000-0000-000000000004\''
\set P30C   '\'30300000-0000-0000-0000-000000000005\''
\set SINPERFIL30 '\'30300000-0000-0000-0000-000000000006\''
\set B30    '\'30300000-0000-0000-0000-000000000030\''
\set TAR30A '\'30300000-0000-0000-0000-000000000031\''
\set COB30A '\'30300000-0000-0000-0000-000000000040\''
\set COB30B '\'30300000-0000-0000-0000-000000000041\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------
select (extract(year from now())::int + 11) as anio_30 \gset
-- Primer lunes de marzo del año + 11.
select (make_date(:anio_30, 3, 1) + ((8 - extract(isodow from make_date(:anio_30, 3, 1))::int) % 7))::text
  as lunes_30 \gset
select (now() at time zone public.zona_horaria_centro(:CA))::date::text as hoy_ca30 \gset

insert into public.tipos_terapia (id, nombre, tarifa_base) values
  (:T30,  'Terapia T-023 con precio', 60.00),
  (:T30N, 'Terapia T-023 sin precio', null);

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P30A, 'Alba', 'T023 Cien', :PRO1, :CA),
  (:P30B, 'Bruno', 'T023 Otro centro', :PRO2, :CB),
  (:P30C, 'Celia', 'T023 Devengo', :PRO1, :CA);

-- Una cita de 50 minutos (ids 30300000-…-0000000001NN), siempre `programada` al nacer.
create function pg_temp.cita30(p_n int, p_pac uuid, p_pro uuid, p_centro uuid, p_tipo uuid,
  p_dia date, p_hora time, p_bono uuid default null)
returns void
language sql
as $$
  insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, bono_id)
  values (('30300000-0000-0000-0000-' || lpad((100 + p_n)::text, 12, '0'))::uuid,
          p_pac, p_pro, p_centro, p_tipo,
          (p_dia + p_hora) at time zone 'Europe/Madrid',
          (p_dia + p_hora + interval '50 minutes') at time zone 'Europe/Madrid',
          'Europe/Madrid', p_bono);
$$;

create function pg_temp.id_cita30(p_n int)
returns uuid
language sql
as $$ select ('30300000-0000-0000-0000-' || lpad((100 + p_n)::text, 12, '0'))::uuid $$;

-- La fila de la vista como texto, bajo la sesión que haya: la aserción enseña lo que salió.
create function pg_temp.fila30(p_pac uuid)
returns text
language sql
as $$
  select coalesce(
    (select format('dev=%s cob=%s pen=%s exc=%s est=%s sin=%s',
                   v.devengado_centimos, v.cobrado_centimos, v.pendiente_centimos,
                   v.excedente_centimos, v.estado, v.citas_sin_tarifa)
       from public.pendiente_paciente v where v.paciente_id = p_pac),
    'sin fila');
$$;

-- B · P30A: tarifa propia de 100,00 desde D y la cita CA1 a las 00:30 de Madrid del día D (en UTC
-- es el día anterior: si la vista mirase c.inicio::date, cogería la tarifa base, 60,00).
insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) values
  (:TAR30A, :P30A, :T30, 100.00, 'exento_sanitario', :'lunes_30'::date, :ADM);
select pg_temp.cita30(1, :P30A, :PRO1, :CA, :T30, :'lunes_30'::date, time '00:30');

-- C · P30C: el bono, las dos tarifas del mismo día D+5 (80,00 y luego 90,00; `orden` lo pone la
-- base) y una cita por día de D-10 a D+5.
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por) values
  (:B30, :P30C, 3, 150.00, null, :ADM);
insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) values
  (:P30C, :T30, 80.00, 'exento_sanitario', :'lunes_30'::date + 5, :ADM);
insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) values
  (:P30C, :T30, 90.00, 'exento_sanitario', :'lunes_30'::date + 5, :ADM);
select pg_temp.cita30(11, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date - 10, time '10:00');          -- C1
select pg_temp.cita30(12, :P30C, :PRO1, :CA, null,  :'lunes_30'::date - 9,  time '10:00');          -- C2
select pg_temp.cita30(13, :P30C, :PRO1, :CA, :T30N, :'lunes_30'::date - 8,  time '10:00');          -- C3
select pg_temp.cita30(14, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date - 7,  time '10:00', :B30);    -- C4
select pg_temp.cita30(15, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date + 5,  time '10:00');          -- C5
select pg_temp.cita30(16, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date - 6,  time '10:00');          -- cancelada
select pg_temp.cita30(17, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date - 5,  time '10:00');          -- no_asistida
select pg_temp.cita30(18, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date - 4,  time '10:00');          -- programada
select pg_temp.cita30(19, :P30C, :PRO1, :CA, :T30,  :'lunes_30'::date - 3,  time '10:00');          -- confirmada

select pg_temp.assert(
  (select array_agg(t.importe order by t.orden) from public.tarifas_paciente t
    where t.paciente_id = :P30C and t.tipo_terapia_id = :T30) = array[80.00, 90.00]::numeric[],
  '30.fij · las dos tarifas de P30C del mismo día: orden 1 = 80,00 y orden 2 = 90,00');

-- Ronda 2 · P30D (sin partidas), la fusión P30E <- P30F (la fusión se fija en el propio insert:
-- fn_proteger_columnas_reservadas_paciente la prohíbe después, como en 01-fijacion.sql, PFUS) y dos
-- centros con zona propia, uno por delante y otro por detrás de Madrid (E10).
\set P30D  '\'30300000-0000-0000-0000-000000000007\''
\set P30E  '\'30300000-0000-0000-0000-000000000008\''
\set P30F  '\'30300000-0000-0000-0000-000000000009\''
\set P30K  '\'30300000-0000-0000-0000-00000000000a\''
\set P30P  '\'30300000-0000-0000-0000-00000000000b\''
\set CK30  '\'30300000-0000-0000-0000-000000000060\''
\set CP30  '\'30300000-0000-0000-0000-000000000061\''
\set B30F  '\'30300000-0000-0000-0000-000000000034\''
\set TAR30F '\'30300000-0000-0000-0000-000000000032\''
\set COB30E '\'30300000-0000-0000-0000-000000000042\''
\set COB30F '\'30300000-0000-0000-0000-000000000043\''

insert into public.centros (id, nombre, zona_horaria) values
  (:CK30, 'Centro T-023 Kiritimati', 'Pacific/Kiritimati'),
  (:CP30, 'Centro T-023 Pago Pago',  'Pacific/Pago_Pago');
insert into public.perfiles_centros (perfil_id, centro_id, principal) values
  (:PRO1, :CK30, false),
  (:PRO1, :CP30, false);

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P30D, 'Dora',  'T023 Sin partidas', :PRO1, :CA),
  (:P30E, 'Elsa',  'T023 Superviviente', :PRO1, :CA),
  (:P30K, 'Kira',  'T023 Kiritimati',  :PRO1, :CK30),
  (:P30P, 'Pablo', 'T023 Pago Pago',   :PRO1, :CP30);
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id, fusionado_en, fusionado_el) values
  (:P30F, 'Fede',  'T023 Absorbido', :PRO2, :CB, :P30E, now());

-- P30E: una cita T30 realizada a la tarifa base (60,00) y un cobro de 20,00.
-- P30F: tarifa propia 70,00 desde D-30, una cita T30 realizada en D-1, un bono de 150,00 y un cobro de 50,00.
select pg_temp.cita30(21, :P30E, :PRO1, :CA, :T30, :'lunes_30'::date - 20, time '10:00');
select pg_temp.cita30(22, :P30F, :PRO2, :CB, :T30, :'lunes_30'::date - 1,  time '10:00');
insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) values
  (:TAR30F, :P30F, :T30, 70.00, 'exento_sanitario', :'lunes_30'::date - 30, :ADM);
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por) values
  (:B30F, :P30F, 3, 150.00, null, :ADM);
update public.citas set estado = 'realizada' where id in (pg_temp.id_cita30(21), pg_temp.id_cita30(22));
insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por) values
  (:COB30E, :P30E, 20.00, :'hoy_ca30', 'efectivo', :ADM),
  (:COB30F, :P30F, 50.00, :'hoy_ca30', 'efectivo', :ADM);


-- =========================================================================================
-- A · Catálogo
-- =========================================================================================
select pg_temp.assert(
  (select c.reloptions @> array['security_barrier=true', 'security_invoker=false']
     from pg_class c where c.oid = 'public.pendiente_paciente'::regclass and c.relkind = 'v'),
  '30.A1 · pendiente_paciente es una vista definer (security_invoker=false) con security_barrier=true');
select pg_temp.assert(
  (select array_agg(c.column_name::text || ':' || c.data_type::text order by c.ordinal_position)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'pendiente_paciente')
  = array['paciente_id:uuid', 'profesional_id:uuid', 'devengado_centimos:bigint', 'cobrado_centimos:bigint',
          'pendiente_centimos:bigint', 'excedente_centimos:bigint', 'estado:text', 'citas_sin_tarifa:integer'],
  '30.A2 · pendiente_paciente expone exactamente las ocho columnas del diseño, con sus tipos y en su orden');
select pg_temp.assert(
  not exists (select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = 'pendiente_paciente'
                 and c.column_name in ('tipo_terapia_id', 'cita_id')),
  '30.A3 · la vista no tiene tipo_terapia_id ni cita_id');
select pg_temp.assert(
  (select array_agg(p.privilege_type::text order by p.privilege_type) from information_schema.table_privileges p
    where p.table_schema = 'public' and p.table_name = 'pendiente_paciente' and p.grantee = 'authenticated')
  = array['SELECT']
  and not exists (select 1 from information_schema.table_privileges p
                   where p.table_schema = 'public' and p.table_name = 'pendiente_paciente'
                     and p.grantee in ('anon', 'PUBLIC', 'service_role'))
  and not has_table_privilege('anon', 'public.pendiente_paciente', 'SELECT')
  and not has_table_privilege('service_role', 'public.pendiente_paciente', 'SELECT'),
  '30.A4 · authenticated solo tiene SELECT sobre la vista; anon, PUBLIC y service_role, nada');
select pg_temp.assert(
  exists (select 1 from information_schema.columns c
           where c.table_schema = 'public' and c.table_name = 'cobros' and c.column_name = 'motivo'
             and c.data_type = 'text' and c.is_nullable = 'YES'),
  '30.A5 · cobros.motivo existe, text y nula');
select pg_temp.assert(
  exists (select 1 from pg_constraint k
           where k.conrelid = 'public.cobros'::regclass and k.conname = 'cobros_devolucion_motivo_ck'
             and k.contype = 'c' and k.convalidated),
  '30.A6 · cobros_devolucion_motivo_ck existe y está validado');
select pg_temp.assert(
  has_column_privilege('authenticated', 'public.cobros', 'motivo', 'INSERT')
  and not has_column_privilege('authenticated', 'public.cobros', 'registrado_en', 'INSERT')
  and not has_column_privilege('authenticated', 'public.cobros', 'motivo', 'UPDATE'),
  '30.A7 · authenticated inserta motivo, sigue sin insertar registrado_en y no actualiza motivo');
select pg_temp.assert(
  exists (select 1 from pg_trigger t
           where t.tgrelid = 'public.cobros'::regclass and t.tgname = 'validar_cobro'
             and t.tgenabled = 'O' and t.tgfoid = 'public.fn_validar_cobro()'::regprocedure
             and (t.tgtype & 1) <> 0 and (t.tgtype & 2) <> 0 and (t.tgtype & 4) <> 0
             and (t.tgtype & 8) = 0 and (t.tgtype & 16) = 0)
  and (select not p.prosecdef and p.proconfig @> array['search_path=""'] and p.proacl is not null
              and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         from pg_proc p where p.oid = 'public.fn_validar_cobro()'::regprocedure),
  '30.A8 · validar_cobro es BEFORE INSERT FOR EACH ROW; fn_validar_cobro es invoker, search_path vacío, sin EXECUTE para PUBLIC');
select pg_temp.assert(
  exists (select 1 from public.tablas_solo_adicion t where t.tabla = 'cobros')
  and (select count(*) from public.cobertura_solo_adicion()) = 0,
  '30.A9 · cobros sigue en tablas_solo_adicion y cobertura_solo_adicion() = 0');
-- A9b · las dos funciones de lectura de la ronda 2 (el A10 de la ronda, las ocho columnas, es A2).
select pg_temp.assert(
  (select count(*) from pg_proc p
    where p.oid in ('public.resumen_pendiente(uuid)'::regprocedure, 'public.profesionales_del_pendiente()'::regprocedure)
      and not p.prosecdef
      and p.proconfig @> array['search_path=""']
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 2,
  '30.A9b · resumen_pendiente y profesionales_del_pendiente existen, son invoker, con search_path vacío, sin EXECUTE para anon y con EXECUTE para authenticated');

-- A5 · el filtro «tiene alguna partida»: P30D, sin citas, bonos ni cobros, no tiene fila.
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30D) = 'sin fila',
  '30.A5a · ADM: un paciente sin partidas no tiene fila en la vista: ' || pg_temp.fila30(:P30D));
call pg_temp.reset_sesion();
insert into public.bonos (paciente_id, sesiones_totales, importe, caducidad, creado_por) values
  (:P30D, 1, 10.00, null, :ADM);
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30D) = 'dev=1000 cob=0 pen=1000 exc=0 est=pendiente sin=0',
  '30.A5b · gemela: con un bono de 10,00 sí tiene fila: ' || pg_temp.fila30(:P30D));
call pg_temp.reset_sesion();


-- =========================================================================================
-- B · Los 100 € (P30A)
-- =========================================================================================
select pg_temp.assert(
  (select count(*) from public.citas c where c.id = pg_temp.id_cita30(1)
      and (c.inicio at time zone 'UTC')::date = :'lunes_30'::date - 1) = 1,
  '30.B0.0 · control: la cita CA1 es del día D en Madrid y del día anterior en UTC');
update public.citas set estado = 'realizada' where id = pg_temp.id_cita30(1);

call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=0 pen=10000 exc=0 est=pendiente sin=0',
  '30.B0 · ADM: la cita de las 00:30 del día D se cobra a la tarifa del paciente (100,00), sin ningún cobro: '
  || pg_temp.fila30(:P30A));
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, %L, 30.00, %L, 'efectivo', %L)$f$, :COB30A, :P30A, :'hoy_ca30', :ADM),
  '30.B1.0 · ADM registra 30,00 de P30A');
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=3000 pen=7000 exc=0 est=pendiente sin=0',
  '30.B1 · tras 30,00: pendiente 70,00 y estado pendiente: ' || pg_temp.fila30(:P30A));

call pg_temp.como(:TEC1);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 30.00, %L, 'bizum', %L)$f$, :P30A, :'hoy_ca30', :TEC1),
  '30.B2.0 · TEC1 registra 30,00 de P30A (su centro)');
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=6000 pen=4000 exc=0 est=pendiente sin=0',
  '30.B2 · TEC1 ve tras el segundo parcial: pendiente 40,00 y estado pendiente: ' || pg_temp.fila30(:P30A));

call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 40.00, %L, 'tarjeta', %L)$f$, :P30A, :'hoy_ca30', :PRO1),
  '30.B3.0 · PRO1 registra 40,00 de P30A (su paciente)');
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=10000 pen=0 exc=0 est=cobrado sin=0',
  '30.B3 · el tercero deja el pendiente en 0 y el estado en cobrado: ' || pg_temp.fila30(:P30A));

call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 10.00, %L, 'efectivo', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '30.B4.0 · ADM registra 10,00 de más');
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=11000 pen=0 exc=1000 est=cobrado_de_mas sin=0',
  '30.B4 · el sobrepago deja cobrado_de_mas con 10,00 de excedente: ' || pg_temp.fila30(:P30A));
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, motivo, registrado_por)
            values (%L, -10.00, %L, 'efectivo', 'Devolución del cobro de más', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '30.B5.0 · ADM devuelve 10,00 con motivo');
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=10000 pen=0 exc=0 est=cobrado sin=0',
  '30.B5 · la devolución vuelve a cobrado, 0/0: ' || pg_temp.fila30(:P30A));
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, motivo, registrado_por)
            values (%L, -20.00, %L, 'transferencia', 'Devolución parcial', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '30.B6.0 · ADM devuelve otros 20,00 con motivo');
select pg_temp.assert(pg_temp.fila30(:P30A) = 'dev=10000 cob=8000 pen=2000 exc=0 est=pendiente sin=0',
  '30.B6 · la devolución mueve el pendiente a 20,00: ' || pg_temp.fila30(:P30A));
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.cobros c where c.paciente_id = :P30A) = 6
  and (select count(*) from public.cobros c where c.paciente_id = :P30A and c.registrado_por is null) = 0
  and (select count(*) from public.cobros c where c.paciente_id = :P30A and c.importe < 0 and c.motivo is not null) = 2,
  '30.B7 · seis filas de P30A en cobros (ningún contador), todas con registrado_por y las dos devoluciones con motivo');


-- =========================================================================================
-- C · Qué se devenga (P30C). Los cambios de estado, como postgres; las lecturas, como ADM.
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=15000 cob=0 pen=15000 exc=0 est=pendiente sin=0',
  '30.C0 · sin ninguna realizada, P30C ya devenga su bono de 150,00 (una vez): ' || pg_temp.fila30(:P30C));
call pg_temp.reset_sesion();
update public.citas set estado = 'realizada' where id = pg_temp.id_cita30(11);
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=21000 cob=0 pen=21000 exc=0 est=pendiente sin=0',
  '30.C1 · T30 en D-10 sin tarifa del paciente cuenta la tarifa base (60,00): ' || pg_temp.fila30(:P30C));
call pg_temp.reset_sesion();
update public.citas set estado = 'realizada' where id = pg_temp.id_cita30(12);
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=21000 cob=0 pen=21000 exc=0 est=pendiente sin=1',
  '30.C2 · la realizada sin tipo cuenta 0 y suma en citas_sin_tarifa: ' || pg_temp.fila30(:P30C));
call pg_temp.reset_sesion();
update public.citas set estado = 'realizada' where id = pg_temp.id_cita30(13);
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=21000 cob=0 pen=21000 exc=0 est=pendiente sin=2',
  '30.C3 · la realizada de un tipo sin tarifa_base cuenta 0 y suma en citas_sin_tarifa: ' || pg_temp.fila30(:P30C));
call pg_temp.reset_sesion();
update public.citas set estado = 'realizada' where id = pg_temp.id_cita30(14);
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=21000 cob=0 pen=21000 exc=0 est=pendiente sin=2',
  '30.C4 · la realizada con bono no cuenta (el bono ya cuenta una vez): ' || pg_temp.fila30(:P30C));
call pg_temp.reset_sesion();
update public.citas set estado = 'realizada' where id = pg_temp.id_cita30(15);
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=30000 cob=0 pen=30000 exc=0 est=pendiente sin=2',
  '30.C5 · dos tarifas el mismo día D+5: vale la de mayor orden (90,00): ' || pg_temp.fila30(:P30C));
call pg_temp.reset_sesion();
update public.citas set estado = 'cancelada'   where id = pg_temp.id_cita30(16);
update public.citas set estado = 'no_asistida' where id = pg_temp.id_cita30(17);
update public.citas set estado = 'confirmada'  where id = pg_temp.id_cita30(19);
select pg_temp.assert(
  (select array_agg(c.estado::text order by c.id) from public.citas c
    where c.id in (pg_temp.id_cita30(16), pg_temp.id_cita30(17), pg_temp.id_cita30(18), pg_temp.id_cita30(19)))
  = array['cancelada', 'no_asistida', 'programada', 'confirmada'],
  '30.C5b.0 · control: una cancelada, una no asistida, una programada y una confirmada de T30');
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=30000 cob=0 pen=30000 exc=0 est=pendiente sin=2',
  '30.C5b · ni la cancelada, ni la no asistida, ni la programada, ni la confirmada devengan: ' || pg_temp.fila30(:P30C));
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 300.00, %L, 'transferencia', %L)$f$, :P30C, :'hoy_ca30', :ADM),
  '30.C6.0 · ADM registra 300,00 de P30C');
select pg_temp.assert(pg_temp.fila30(:P30C) = 'dev=30000 cob=30000 pen=0 exc=0 est=cobrado sin=2',
  '30.C6 · 300,00 dejan P30C cobrado: ' || pg_temp.fila30(:P30C));

-- P30B (CB, PRO2) entra en la vista con un cobro de su profesional.
call pg_temp.como(:PRO2);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, %L, 50.00, %L, 'efectivo', %L)$f$, :COB30B, :P30B,
         (now() at time zone public.zona_horaria_centro(:CB))::date, :PRO2),
  '30.C7 · PRO2 registra 50,00 de P30B (su paciente, CB)');
call pg_temp.reset_sesion();


-- =========================================================================================
-- D · Quién ve qué
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L)', :P30A, :P30C)) = 2,
  '30.D1 · TEC1 ve P30A y P30C (su centro) en la vista');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id = %L', :P30B)) = 0,
  '30.D2 · TEC1 ve 0 filas de P30B (otro centro)');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.tarifas_paciente where paciente_id = %L', :P30A)) = 0,
  '30.D3 · TEC1 lee 0 filas de tarifas_paciente de P30A');
select pg_temp.assert(
  (select array_agg(k order by k) from public.pendiente_paciente v, jsonb_object_keys(to_jsonb(v)) k
    where v.paciente_id = :P30A)
  = array['citas_sin_tarifa', 'cobrado_centimos', 'devengado_centimos', 'estado', 'excedente_centimos',
          'paciente_id', 'pendiente_centimos', 'profesional_id']
  and (select v.devengado_centimos = 10000 and v.cobrado_centimos = 8000 and v.pendiente_centimos = 2000
              and v.estado = 'pendiente'
         from public.pendiente_paciente v where v.paciente_id = :P30A),
  '30.D8 · TEC1 ve las cifras de P30A y ninguna otra columna (las de A2)');
call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id = %L', :P30B)) = 1,
  '30.D2g · gemela: ADM ve 1 fila de P30B');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.tarifas_paciente where paciente_id = %L', :P30A)) = 1,
  '30.D3g · gemela: ADM lee la tarifa de P30A');
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.tarifas_paciente where paciente_id = %L', :P30A)) = 1,
  '30.D3g2 · gemela: PRO1 lee la tarifa de P30A (su paciente)');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id = %L', :P30A)) = 1
  and pg_temp.contar(format('select 1 from public.cobros where paciente_id = %L', :P30A)) = 6,
  '30.D4g · gemela: PRO1 ve 1 fila de P30A en la vista y sus 6 cobros');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id = %L', :P30B)) = 0,
  '30.D5 · PRO1 ve 0 filas de P30B (no asignado)');
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id = %L', :P30A)) = 0
  and pg_temp.contar(format('select 1 from public.cobros where paciente_id = %L', :P30A)) = 0,
  '30.D4 · PRO2 ve 0 filas de P30A en la vista y 0 en cobros (no asignado)');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id = %L', :P30B)) = 1,
  '30.D5g · gemela: PRO2 ve 1 fila de P30B');
call pg_temp.como(:SINPERFIL30);
select pg_temp.assert(
  pg_temp.contar('select 1 from public.pendiente_paciente') = 0,
  '30.D6 · un uuid sin perfil (rol nulo) ve 0 filas de la vista');
call pg_temp.reset_sesion();
set local role anon;
select pg_temp.assert_lanza_codigo('select 1 from public.pendiente_paciente', '42501',
  '30.D7 · anon: select sobre la vista da 42501');
reset role;

-- D9 · dos caminos: la vista y cobros dan el mismo conjunto de pacientes del banco por rol.
create function pg_temp.d9_30(p_a uuid, p_b uuid, p_c uuid)
returns boolean
language sql
as $$
  select coalesce((select array_agg(v.paciente_id order by v.paciente_id) from public.pendiente_paciente v
                    where v.paciente_id in (p_a, p_b, p_c)), '{}')
       = coalesce((select array_agg(distinct c.paciente_id order by c.paciente_id) from public.cobros c
                    where c.paciente_id in (p_a, p_b, p_c)), '{}');
$$;
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.d9_30(:P30A, :P30B, :P30C)
  and pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L, %L)', :P30A, :P30B, :P30C)) = 3,
  '30.D9 · ADM: la vista y cobros dan los mismos tres pacientes');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.d9_30(:P30A, :P30B, :P30C)
  and pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L, %L)', :P30A, :P30B, :P30C)) = 2,
  '30.D9 · PRO1: la vista y cobros dan los mismos dos pacientes (P30A, P30C)');
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.d9_30(:P30A, :P30B, :P30C)
  and pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L, %L)', :P30A, :P30B, :P30C)) = 1,
  '30.D9 · PRO2: la vista y cobros dan el mismo paciente (P30B)');
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.d9_30(:P30A, :P30B, :P30C)
  and pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L, %L)', :P30A, :P30B, :P30C)) = 2,
  '30.D9 · TEC1: la vista y cobros dan los mismos dos pacientes (P30A, P30C)');
call pg_temp.reset_sesion();


-- =========================================================================================
-- E · Escritura
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros where id = %L', :COB30A)) = 1,
  '30.E1g · gemela: ADM lee COB30A');
select pg_temp.assert_lanza_codigo(format('update public.cobros set importe = 1 where id = %L', :COB30A),
  '42501', '30.E1 · ADM: update sobre cobros');
select pg_temp.assert_lanza_codigo(format('delete from public.cobros where id = %L', :COB30A),
  '42501', '30.E2 · ADM: delete sobre cobros');
select pg_temp.assert_lanza_codigo('truncate public.cobros',
  '42501', '30.E3 · ADM: truncate sobre cobros');
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros where id = %L', :COB30A)) = 1,
  '30.E4g · gemela: TEC1 lee COB30A');
select pg_temp.assert_lanza_codigo(format('update public.cobros set motivo = %L where id = %L', 'x', :COB30A),
  '42501', '30.E4 · TEC1: update sobre cobros');
select pg_temp.assert_lanza_codigo(format('delete from public.cobros where id = %L', :COB30A),
  '42501', '30.E5 · TEC1: delete sobre cobros');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros where id = %L', :COB30A)) = 1,
  '30.E6g · gemela: PRO1 lee COB30A');
select pg_temp.assert_lanza_codigo(format('update public.cobros set importe = 1 where id = %L', :COB30A),
  '42501', '30.E6 · PRO1: update sobre cobros');

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, -5.00, %L, 'efectivo', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '23514', 'cobros_devolucion_motivo_ck', '30.E7 · una devolución sin motivo no entra');
select pg_temp.assert_lanza_codigo_msg(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, motivo, registrado_por)
            values (%L, -5.00, %L, 'efectivo', '   ', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '23514', 'cobros_devolucion_motivo_ck', '30.E7b · ni con un motivo en blanco');
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, motivo, registrado_por)
            values (%L, -5.00, %L, 'efectivo', 'Error de cobro', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '30.E7g · gemela: con motivo, entra');
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 5.00, %L, 'efectivo', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '30.E8 · un cobro positivo sin motivo entra');

call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 5.00, %L::date + 1, 'efectivo', %L)$f$, :P30A, :'hoy_ca30', :TEC1),
  '23514', 'no puede ser posterior a hoy', '30.E9 · TEC1 no registra un cobro con fecha de mañana (hoy del centro + 1)');
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 5.00, %L, 'efectivo', %L)$f$, :P30A, :'hoy_ca30', :TEC1),
  '30.E9g · gemela: con la fecha de hoy del centro, entra');
call pg_temp.reset_sesion();

-- E10 · la exención documentada: postgres (fijación, importador) no pasa por la guarda de fecha.
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 5.00, %L::date + 1, 'efectivo', %L)$f$, :P30A, :'hoy_ca30', :ADM),
  '30.E10 · como postgres, una fecha futura entra (exención de fn_validar_cobro)');

select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.pendiente_paciente', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.pendiente_paciente', 'INSERT')
  and not has_table_privilege('authenticated', 'public.pendiente_paciente', 'DELETE'),
  '30.E11 · la vista no da UPDATE, INSERT ni DELETE (catálogo)');

call pg_temp.reset_sesion();

-- =========================================================================================
-- E10 · La zona es la del centro del paciente (A-H4). Kiritimati (UTC+14) y Pago Pago (UTC-11)
-- separan «hoy» del de Madrid a cualquier hora: con Madrid entre las 11:00 y las 24:00 (12:00-24:00
-- en verano) el hoy de Kiritimati es mañana en Madrid; con Madrid entre las 0:00 y las 12:00
-- (13:00 en verano) el hoy de Pago Pago es ayer en Madrid. Un «hoy» calculado con Madrid cae en
-- E10a o en E10d.
-- =========================================================================================
select (now() at time zone 'Pacific/Kiritimati')::date::text as hoy_k \gset
select (now() at time zone 'Pacific/Pago_Pago')::date::text  as hoy_p \gset
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 1.00, %L, 'efectivo', %L)$f$, :P30K, :'hoy_k', :ADM),
  '30.E10a · ADM cobra a un paciente de Kiritimati con el hoy de Kiritimati');
select pg_temp.assert_lanza_codigo_msg(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 1.00, %L::date + 1, 'efectivo', %L)$f$, :P30K, :'hoy_k', :ADM),
  '23514', 'no puede ser posterior a hoy', '30.E10b · con el hoy de Kiritimati + 1 no entra');
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 1.00, %L, 'efectivo', %L)$f$, :P30P, :'hoy_p', :ADM),
  '30.E10c · ADM cobra a un paciente de Pago Pago con el hoy de Pago Pago');
select pg_temp.assert_lanza_codigo_msg(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 1.00, %L::date + 1, 'efectivo', %L)$f$, :P30P, :'hoy_p', :ADM),
  '23514', 'no puede ser posterior a hoy', '30.E10d · con el hoy de Pago Pago + 1 no entra');
call pg_temp.reset_sesion();


-- =========================================================================================
-- F · Fusión en un salto (A-H2). P30F (absorbido, PRO2, CB) se fusionó en P30E (PRO1, CA).
-- La cadena de F2: 60 de cita + 70 de la cita del absorbido a su tarifa + 150 de su bono = 280,
-- cobrado 20 + 50 = 70.
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.fila30(:P30F) = 'sin fila',
  '30.F1 · ADM: el absorbido no tiene fila: ' || pg_temp.fila30(:P30F));
select pg_temp.assert(pg_temp.fila30(:P30E) = 'dev=28000 cob=7000 pen=21000 exc=0 est=pendiente sin=0'
  and pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L)', :P30E, :P30F)) = 1,
  '30.F2 · ADM: el superviviente suma lo suyo y lo del absorbido, y sale una sola vez: ' || pg_temp.fila30(:P30E));
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.fila30(:P30E) = 'dev=28000 cob=7000 pen=21000 exc=0 est=pendiente sin=0',
  '30.F3 · PRO1, profesional del superviviente, ve lo del absorbido: ' || pg_temp.fila30(:P30E));
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L)', :P30E, :P30F)) = 0
  and pg_temp.fila30(:P30B) <> 'sin fila',
  '30.F4 · PRO2, profesional del absorbido y no asignado al superviviente, no ve ninguna de las dos filas (gemela: sí ve P30B)');
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.fila30(:P30E) = 'dev=28000 cob=7000 pen=21000 exc=0 est=pendiente sin=0',
  '30.F5 · TEC1, centro del superviviente, ve la cadena de F2: ' || pg_temp.fila30(:P30E));
call pg_temp.como(:TEC2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.pendiente_paciente where paciente_id in (%L, %L)', :P30E, :P30F)) = 0
  and pg_temp.fila30(:P30B) <> 'sin fila',
  '30.F6 · TEC2, centro del absorbido, no ve ninguna de las dos filas (gemela: sí ve P30B)');
call pg_temp.reset_sesion();


-- =========================================================================================
-- G · Las dos funciones de lectura, llamadas como las llama la página (A-H1, A-H3)
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select array_agg(f.id || '|' || f.nombre_completo order by f.id)
     from public.profesionales_del_pendiente() f where f.id in (:PRO1, :PRO2))
  = array[:PRO1 || '|Profesional Uno', :PRO2 || '|Profesional Dos'],
  '30.G1 · ADM: profesionales_del_pendiente ofrece a PRO1 y PRO2 con su nombre (sin RLS fingida)');
select pg_temp.assert(
  (select coalesce(array_agg(f.id order by f.id), '{}') from public.profesionales_del_pendiente() f)
  = (select coalesce(array_agg(distinct v.profesional_id order by v.profesional_id), '{}') from public.pendiente_paciente v),
  '30.G2 · ADM: los ids de profesionales_del_pendiente son los profesionales de la vista');
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select count(*) from public.profesionales_del_pendiente() f) >= 1
  and not exists (select 1 from public.profesionales_del_pendiente() f where f.id <> :PRO1),
  '30.G3 · PRO1: solo se ofrece a sí mismo');
call pg_temp.como(:SINPERFIL30);
select pg_temp.assert((select count(*) from public.profesionales_del_pendiente() f) = 0,
  '30.G3b · un uuid sin perfil (rol nulo): cero profesionales');
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select (r.pendiente_total_centimos, r.pacientes_con_pendiente, r.pacientes_cobrado_de_mas, r.filas)
     from public.resumen_pendiente(:PRO1) r)
  = (select (coalesce(sum(v.pendiente_centimos), 0)::bigint,
             (count(*) filter (where v.estado = 'pendiente'))::integer,
             (count(*) filter (where v.estado = 'cobrado_de_mas'))::integer,
             count(*)::integer)
       from public.pendiente_paciente v where v.profesional_id = :PRO1)
  and (select (r.pendiente_total_centimos, r.pacientes_con_pendiente, r.pacientes_cobrado_de_mas, r.filas)
         from public.resumen_pendiente(null) r)
  = (select (coalesce(sum(v.pendiente_centimos), 0)::bigint,
             (count(*) filter (where v.estado = 'pendiente'))::integer,
             (count(*) filter (where v.estado = 'cobrado_de_mas'))::integer,
             count(*)::integer)
       from public.pendiente_paciente v),
  '30.G4 · ADM: resumen_pendiente(PRO1) y resumen_pendiente(null) igualan al agregado de la vista');
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select (r.pendiente_total_centimos, r.pacientes_con_pendiente, r.pacientes_cobrado_de_mas, r.filas)
     from public.resumen_pendiente(:PRO2) r) = (0::bigint, 0, 0, 0)
  and (select r.filas from public.resumen_pendiente(:PRO1) r) >= 3,
  '30.G5 · PRO1: resumen_pendiente(PRO2) = ceros (solo estrecha); gemela: el suyo tiene al menos 3 filas');
call pg_temp.reset_sesion();

-- =========================================================================================
-- Mutantes M1-M17 (medidos a mano en begin … rollback con 00 + 01 + 30; tickets/T-023/mutantes.json)
-- =========================================================================================
-- M1  sin la condición de centro del técnico en el where              cae en D2
-- M2  sin `and public.es_profesional_asignado(p.id)`                  cae en D5 (y D4, D9)
-- M3  `c.inicio::date` en lugar del día local                         cae en B0 (sale 6000)
-- M4  sin `and c.bono_id is null`                                     cae en C4 (sale 27000)
-- M5  `estado in ('realizada', 'no_asistida')`                        cae en C5b (sale 36000)
-- M6  sin `t.orden desc` en el order by                               cae en C5 (sale 29000)
-- M7  `security_barrier = false`                                      cae en A1 (solo el catálogo)
-- M8  sin `cobros_devolucion_motivo_ck`                               cae en A6; sin A, en E7
-- M9  sin el disparador `validar_cobro`                               cae en A8; sin A, en E9
-- M10 `>` por `>=` en `when … > k.importe`                            cae en B3
-- Ronda 2 (medidos el 07-10-2026 con 00 + 01 + 30):
-- M11  sin `p.fusionado_en is null`                                   cae en F1 (sale la fila de P30F)
-- M12a sin la rama `union all` de absorbidos en citas                 cae en F2 (dev=21000)
-- M12b ídem en bonos                                                  cae en F2 (dev=13000)
-- M12c ídem en cobros                                                 cae en F2 (cob=2000)
-- M13  `t.paciente_id = p.id` en lugar de `c.paciente_id`             cae en F2 (dev=27000)
-- M14  sin `(s.sesiones > 0 or b.bonos > 0 or k.cobros > 0)`          cae en A5a (sale dev=0 est=cobrado)
-- M15  `zona_horaria_centro(null)` en fn_validar_cobro                cae en E10a o E10d, según la hora (a las 10:42 de Madrid, E10d)
-- M16  `public.perfiles` en profesionales_del_pendiente               cae en G1
-- M17  sin el `where` de p_profesional_id en resumen_pendiente        cae en G4 (G5 también lo cubre)

\echo '30-cobros: OK'
