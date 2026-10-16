-- T-027 · Bonos de sesiones: saldo derivado y quién ve qué (tickets/T-027/diseno.md, §1.9).
--
-- No hay migración: prueba lo que T-021 ya dejó (`bonos`, `bonos_consumo`, `citas.bono_id`) con el
-- recorrido que hace la aplicación de T-027, tal como lo haría ella y no a mano:
--   A · la alta del bono y su consumo: el administrador da de alta un bono de 5 (el `insert` de
--       `registrarBono`), vincula cinco citas (`vincularBono`: `update citas set bono_id`) y marca
--       tres `realizada` por `agenda_actualizar_cita()`: queda saldo 2 en `bonos_consumo`, y la fila
--       de `bonos` no se tocó (su `ctid` es el mismo y `update` sobre ella es 42501)
--   B · el saldo no se mueve por las que NO cuentan: las dos restantes siguen `programada` (saldo 2);
--       cancelar una con `agenda_cancelar_cita()` y otra con `agenda_actualizar_cita(…, 'cancelada')`
--       tampoco lo mueve; y la gemela positiva: una cita nueva vinculada y marcada `realizada` sí
--       (saldo 1). El bono de otro paciente no se puede vincular (23514)
--   C · el técnico: ve el bono y el saldo de su centro en `bonos` y en `bonos_consumo`, nada del
--       otro centro, no lee `citas` y su `update` de `citas.bono_id` no alcanza ninguna fila; su gemelo del otro centro
--   D · el profesional: cero bonos ajenos (tabla, vista y citas) y su `update` de `bono_id` sobre la
--       cita de otro profesional no toca ninguna fila, con la gemela sobre la suya
--
-- Reutiliza los actores de 01-fijacion.sql (ADM, PRO1 de CA, PRO2 de CB, TEC1 de CA, TEC2 de CB, CA, CB).
-- Fijación propia, ids con el prefijo 35350000-. Variables con sufijo _35.
-- ANCLA (README, punto 10, regla 2): primer lunes de enero de año + 13 (`lunes_35` = D). Las citas
-- de PRO1 van de D a D+6, una por día, a las 10:00 (hora de Madrid).
--
-- Mutante medido a mano (ver el fichero de bitácora): si `bonos_consumo` contase también las citas
-- `programada`, fallan 35.A2, 35.B1, 35.B2 y 35.B3.

\echo ''
\echo '=== 35-bonos ==='

\set P35A '\'35350000-0000-0000-0000-000000000001\''
\set P35B '\'35350000-0000-0000-0000-000000000002\''
\set B35A '\'35350000-0000-0000-0000-000000000010\''
\set B35B '\'35350000-0000-0000-0000-000000000011\''
\set C351 '\'35350000-0000-0000-0000-000000000101\''
\set C352 '\'35350000-0000-0000-0000-000000000102\''
\set C353 '\'35350000-0000-0000-0000-000000000103\''
\set C354 '\'35350000-0000-0000-0000-000000000104\''
\set C355 '\'35350000-0000-0000-0000-000000000105\''
\set C356 '\'35350000-0000-0000-0000-000000000106\''
\set C357 '\'35350000-0000-0000-0000-000000000107\''
\set C35P2 '\'35350000-0000-0000-0000-000000000108\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------
select (extract(year from now())::int + 13) as anio_35 \gset
-- Primer lunes de enero del año + 13.
select (make_date(:anio_35, 1, 1) + ((8 - extract(isodow from make_date(:anio_35, 1, 1))::int) % 7))::text
  as lunes_35 \gset

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P35A, 'Alma', 'T027 Bono', :PRO1, :CA),
  (:P35B, 'Berta', 'T027 Otro centro', :PRO2, :CB);

-- Una cita de 50 minutos, siempre `programada` y sin bono al nacer. La vinculación y el estado los
-- pone el banco, como la aplicación.
create function pg_temp.cita35(p_id uuid, p_pac uuid, p_pro uuid, p_centro uuid, p_dia date)
returns void
language sql
as $$
  insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
  values (p_id, p_pac, p_pro, p_centro,
          (p_dia + time '10:00') at time zone 'Europe/Madrid',
          (p_dia + time '10:50') at time zone 'Europe/Madrid',
          'Europe/Madrid');
$$;

-- Filas que toca una sentencia `update`, bajo la sesión que haya: `UPDATE 0` es la RLS ocultando la
-- fila, y la prueba lo distingue de «no lanzó nada» con su gemela sobre una fila que sí es del actor.
create function pg_temp.filas35(p_sql text)
returns bigint
language plpgsql
as $$
declare
  v_n bigint;
begin
  execute p_sql;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Saldo derivado, como lo calcula la aplicación (`leerBono`): totales menos consumidas.
create function pg_temp.saldo35(p_bono uuid)
returns int
language sql
as $$
  select (b.sesiones_totales - b.sesiones_consumidas)::int from public.bonos_consumo b where b.bono_id = p_bono
$$;

select pg_temp.cita35(:C351, :P35A, :PRO1, :CA, :'lunes_35'::date + 0);
select pg_temp.cita35(:C352, :P35A, :PRO1, :CA, :'lunes_35'::date + 1);
select pg_temp.cita35(:C353, :P35A, :PRO1, :CA, :'lunes_35'::date + 2);
select pg_temp.cita35(:C354, :P35A, :PRO1, :CA, :'lunes_35'::date + 3);
select pg_temp.cita35(:C355, :P35A, :PRO1, :CA, :'lunes_35'::date + 4);
select pg_temp.cita35(:C356, :P35A, :PRO1, :CA, :'lunes_35'::date + 5);
select pg_temp.cita35(:C357, :P35A, :PRO1, :CA, :'lunes_35'::date + 6);
select pg_temp.cita35(:C35P2, :P35B, :PRO2, :CB, :'lunes_35'::date + 0);

-- El bono del otro centro y paciente, para el aislamiento (C, D) y el 23514 de B.
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por) values
  (:B35B, :P35B, 4, 120.00, null, :ADM);

-- =========================================================================================
-- A · Alta, vínculo y consumo: 5 sesiones, 3 realizadas = saldo 2, y la fila del bono intacta
-- =========================================================================================
call pg_temp.como(:ADM);
-- El `insert` de `registrarBono`: id de la clave de envío, importe como texto, caducidad nula.
select pg_temp.assert_no_lanza(
  format($f$insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por)
            values (%L, %L, 5, '150.00', null, %L)$f$, :B35A, :P35A, :ADM),
  '35.A1 · ADM da de alta el bono de 5 sesiones como lo hace la acción');
call pg_temp.reset_sesion();
-- `ctid` y no `xmin`: todo el banco corre en una sola transacción y un `update` en ella conserva el `xmin`.
select ctid::text as ctid_bono35 from public.bonos where id = :B35A \gset

call pg_temp.como(:ADM);
select pg_temp.assert(
  (select b.sesiones_totales from public.bonos_consumo b where b.bono_id = :B35A) = 5
  and (select b.sesiones_consumidas from public.bonos_consumo b where b.bono_id = :B35A) = 0,
  '35.A2a · bono recién dado de alta: 5 sesiones y ninguna consumida');
-- `vincularBono`: cinco citas con el bono (`grant update (bono_id)`), todas todavía programadas.
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = %L where id in (%L, %L, %L, %L, %L)',
                         :B35A, :C351, :C352, :C353, :C354, :C355)) = 5,
  '35.A2 · ADM vincula cinco citas programadas al bono y la sentencia toca las cinco');
select pg_temp.assert(pg_temp.saldo35(:B35A) = 5,
  '35.A2b · con las cinco citas programadas y vinculadas el saldo sigue en 5: vincular no consume');
-- Tres citas realizadas, por la puerta que usa la agenda.
select public.agenda_actualizar_cita(:C351::uuid, p_estado => 'realizada');
select public.agenda_actualizar_cita(:C352::uuid, p_estado => 'realizada');
select public.agenda_actualizar_cita(:C353::uuid, p_estado => 'realizada');
select pg_temp.assert(
  (select b.sesiones_consumidas from public.bonos_consumo b where b.bono_id = :B35A) = 3
  and (select b.sesiones_totales from public.bonos_consumo b where b.bono_id = :B35A) = 5
  and pg_temp.saldo35(:B35A) = 2,
  '35.A3 · bono de 5 y tres citas realizadas: consumidas 3, saldo 2');
-- La vista no trae saldo: lo deriva la aplicación (`leerBono`).
call pg_temp.reset_sesion();
select pg_temp.assert(
  not exists (select 1 from information_schema.columns c
               where c.table_schema = 'public' and c.table_name = 'bonos_consumo' and c.column_name ilike '%saldo%')
  and (select array_agg(c.column_name::text order by c.ordinal_position) from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'bonos_consumo')
      = array['bono_id', 'paciente_id', 'sesiones_totales', 'sesiones_consumidas', 'caducidad'],
  '35.A4 · bonos_consumo no tiene saldo: bono_id, paciente_id, sesiones_totales, sesiones_consumidas y caducidad');
select pg_temp.assert(
  (select ctid::text from public.bonos where id = :B35A) = :'ctid_bono35',
  '35.A5 · la fila del bono no cambió (mismo ctid): el consumo se deriva, no hubo ningún UPDATE sobre bonos');
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  format('update public.bonos set sesiones_totales = 6 where id = %L', :B35A),
  '42501', '35.A6 · ni el administrador actualiza un bono: no hay privilegio de update');
select pg_temp.assert_lanza_codigo(
  format('delete from public.bonos where id = %L', :B35A),
  '42501', '35.A7 · ni lo borra');
call pg_temp.reset_sesion();

-- =========================================================================================
-- B · Lo que no cuenta no mueve el saldo; lo que cuenta, sí
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select count(*) from public.citas where bono_id = :B35A and estado = 'programada') = 2
  and pg_temp.saldo35(:B35A) = 2,
  '35.B1 · dos citas con el bono siguen programadas y el saldo es 2: una programada no consume');
select public.agenda_cancelar_cita(:C354::uuid, 'esta'::public.alcance_cambio_serie) is not null as cancelada_35 \gset
select pg_temp.assert(:'cancelada_35'::boolean and pg_temp.saldo35(:B35A) = 2
  and (select estado from public.citas where id = :C354) = 'cancelada',
  '35.B2 · cancelar una cita programada con bono (agenda_cancelar_cita): el saldo sigue en 2');
select public.agenda_actualizar_cita(:C355::uuid, p_estado => 'cancelada');
select pg_temp.assert(
  pg_temp.saldo35(:B35A) = 2
  and (select estado from public.citas where id = :C355) = 'cancelada',
  '35.B3 · cancelar la otra (agenda_actualizar_cita): el saldo sigue en 2');
-- Gemela positiva: una cita nueva con el bono, ya realizada, sí consume.
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = %L where id = %L', :B35A, :C356)) = 1,
  '35.B4a · ADM vincula una cita nueva al bono');
select public.agenda_actualizar_cita(:C356::uuid, p_estado => 'realizada');
select pg_temp.assert(
  (select b.sesiones_consumidas from public.bonos_consumo b where b.bono_id = :B35A) = 4
  and pg_temp.saldo35(:B35A) = 1,
  '35.B4 · gemela: la cita nueva realizada sí consume. Cuatro de cinco, saldo 1');
-- El bono de otro paciente no se puede vincular, con el código exacto; y vincular al propio sí.
select pg_temp.assert_lanza_codigo(
  format('update public.citas set bono_id = %L where id = %L', :B35B, :C357),
  '23514', '35.B5 · la cita de P35A no admite el bono de P35B (bono de otro paciente)');
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = %L where id = %L', :B35A, :C357)) = 1,
  '35.B6 · gemela: la misma cita sí admite el bono de su paciente');
-- Otra sentencia: dentro de la misma, la subconsulta vería la fila de antes del update.
select pg_temp.assert((select bono_id from public.citas where id = :C357) = :B35A::uuid,
  '35.B6b · y queda con el bono');
-- Y se puede desvincular mientras sea una cita programada sin terminar.
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = null where id = %L', :C357)) = 1,
  '35.B7 · una cita programada futura se desvincula (bono_id nulo)');
select pg_temp.assert((select bono_id from public.citas where id = :C357) is null,
  '35.B7b · y queda sin bono');
-- Una realizada con bono ya no cambia de bono: 42501 (la aplicación ni lo ofrece).
select pg_temp.assert_lanza_codigo(
  format('update public.citas set bono_id = null where id = %L', :C351),
  '42501', '35.B8 · una cita realizada con bono no se desvincula');
call pg_temp.reset_sesion();

-- =========================================================================================
-- C · El técnico: el bono y el saldo de su centro, nada del otro, y ni citas ni bono_id
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35A)) = 1
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35A)) = 1
  and pg_temp.saldo35(:B35A) = 1,
  '35.C1 · TEC1 (CA) ve el bono de P35A en bonos y en bonos_consumo, con el saldo 1');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35B)) = 0
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35B)) = 0,
  '35.C2 · TEC1 no ve nada del bono de P35B (centro CB)');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.citas where id = %L', :C351)) = 0,
  '35.C3 · TEC1 no lee la cita vinculada: el saldo sale de la vista, no de las citas');
-- No es un 42501: los tres roles comparten el rol authenticated y el grant de columna es de todos. Lo que frena
-- al técnico es la RLS (no ve la cita): el update no alcanza ninguna fila. Gemela: B6 y D6, la misma
-- sentencia sobre la misma cita (C357) con quien sí la ve.
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = %L where id = %L', :B35A, :C357)) = 0,
  '35.C4 · el update de TEC1 sobre citas.bono_id no alcanza ninguna fila (no ve la cita)');
call pg_temp.como(:TEC2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35B)) = 1
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35B)) = 1
  and pg_temp.saldo35(:B35B) = 4,
  '35.C5 · gemela: TEC2 (CB) ve el bono de P35B con su saldo 4');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35A)) = 0
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35A)) = 0,
  '35.C6 · TEC2 no ve nada del bono de P35A (centro CA)');
call pg_temp.reset_sesion();
select pg_temp.assert((select bono_id from public.citas where id = :C357) is null,
  '35.C7 · y la cita C357 sigue sin bono tras el intento de TEC1');

-- =========================================================================================
-- D · El profesional: cero bonos ajenos, y su update de bono_id solo alcanza sus citas
-- =========================================================================================
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35A)) = 0
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35A)) = 0
  and pg_temp.contar(format('select 1 from public.citas where id = %L', :C351)) = 0,
  '35.D1 · PRO2 no ve el bono de P35A (tabla y vista) ni sus citas');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35B)) = 1
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35B)) = 1,
  '35.D2 · gemela: PRO2 ve el bono de su paciente P35B');
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = %L where id = %L', :B35A, :C357)) = 0,
  '35.D3 · el update de PRO2 sobre la cita de PRO1 no alcanza ninguna fila');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select bono_id from public.citas where id = :C357) is null,
  '35.D3b · y la cita de PRO1 sigue sin bono');
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35A)) = 1
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35A)) = 1
  and pg_temp.contar(format('select 1 from public.citas where id = %L', :C351)) = 1,
  '35.D4 · gemela: PRO1 ve el bono de su paciente P35A, su saldo y sus citas');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.bonos where id = %L', :B35B)) = 0
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :B35B)) = 0,
  '35.D5 · PRO1 no ve nada del bono de P35B');
select pg_temp.assert(
  pg_temp.filas35(format('update public.citas set bono_id = %L where id = %L', :B35A, :C357)) = 1,
  '35.D6 · gemela de D3: el mismo update de PRO1 sobre su cita sí toca la fila');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select bono_id from public.citas where id = :C357) = :B35A::uuid,
  '35.D6b · y la cita de PRO1 queda con el bono');
