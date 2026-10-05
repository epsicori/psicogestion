-- T-021 · Dominio económico: esquema (ADR-053: la app no expide facturas; ADR-077: el espejo
-- de lo que expide el programa lo crea T-026). Diseño: `tickets/T-021/diseno.md`, con la
-- «Adenda P3 aplicada» (PA.*) por encima de la adenda del 03-10 (A.*).
--
-- Qué prueba, por secciones:
--   A · solo adición como `authenticated`: update, delete y truncate sobre las versiones del
--       borrador y sobre `cobros` dan 42501 (las tres capas las recorre `10-solo-adicion` por
--       catálogo con las filas de `01-fijacion`).
--   B · la cadena de un borrador con tres versiones verifica con `verificar_cadena_borrador()`,
--       y alterar la segunda con los cerrojos levantados la rompe (como `14-cadena-huellas`).
--   C · un cobro sin factura entra, como técnico de su centro y como administrador.
--   D · `bonos_consumo`: tres citas realizadas con el mismo bono = 3, cancelar una = 2, y el
--       `xmin` del bono no se mueve (no hubo UPDATE sobre `bonos`).
--   E · bonos por rol, con gemelas, sobre la tabla y sobre la vista.
--   F · el técnico: cobros sí; tarifas, versiones y estado del borrador no (gemela de ADM);
--       la vista definer no le enseña ni `cita_id` ni `lineas`.
--   G · el profesional: su borrador sí, el ajeno no, también en la vista de estado.
--   H · auditoría al insertar en las cinco tablas, con el recorte del NIF y del sobre.
--   I · paso 1 del sellado: una negativa por columna que calcula la base; paso 0: el mismo
--       42501 con sobre coherente, incoherente o borrador inexistente.
--   J · paso 6: una negativa 23514 por comprobación, cada una con su fragmento de mensaje.
--   K · bono de otro paciente, cierre de tarifa, solape de tarifas, altas por rol.
--   L · catálogo: privilegios, `execute` del verificador denegado, `tablas_solo_adicion`.
--
-- Ids propios con prefijo `a0260001-`. Los recuentos se filtran por esos ids (y por los de
-- `01`), nunca por totales de tabla: el banco entero es UNA transacción.

\echo ''
\echo '=== 26-economico ==='

\set BORR2  '\'a0260001-0000-4000-8000-0000000000b2\''
\set BORRX  '\'a0260001-0000-4000-8000-0000000000bf\''
\set TIPO26 '\'a0260001-0000-4000-8000-0000000000a1\''
\set TAR1   '\'a0260001-0000-4000-8000-0000000000c1\''
\set TAR2   '\'a0260001-0000-4000-8000-0000000000c2\''
\set BONO1  '\'a0260001-0000-4000-8000-0000000000d1\''
\set BONO2  '\'a0260001-0000-4000-8000-0000000000d2\''
\set COB2   '\'a0260001-0000-4000-8000-0000000000e2\''
\set COB3   '\'a0260001-0000-4000-8000-0000000000e3\''
\set CITA1  '\'a0260001-0000-4000-8000-0000000000f1\''
\set CITA2  '\'a0260001-0000-4000-8000-0000000000f2\''
\set CITA3  '\'a0260001-0000-4000-8000-0000000000f3\''
\set CITAP2 '\'a0260001-0000-4000-8000-0000000000f4\''

-- La fijación de `01` (BORR1, COB1) la vuelve a nombrar este módulo.
\set BORR1 '\'a0210001-0000-4000-8000-000000000001\''
\set COB1  '\'a0210002-0000-4000-8000-000000000001\''

-- =========================================================================================
-- Ayudante local: cuántas filas toca un UPDATE ... returning 1 (un DML no va en una subconsulta,
-- sí en un CTE). Cero filas sobre una fila que existe es la RLS que no la alcanza.
-- =========================================================================================
create or replace function pg_temp.contar_dml(sentencia text)
returns bigint
language plpgsql
as $$
declare
  v_n bigint;
begin
  execute 'with u as (' || sentencia || ') select count(*) from u' into v_n;
  return v_n;
end;
$$;

-- =========================================================================================
-- Ayudante local: el INSERT de una versión de borrador, con el sobre que se le pase. Las
-- negativas de J cambian UNA cosa (del sobre o de la fila) sobre la base buena.
-- =========================================================================================
create or replace function pg_temp.sql_version(
  p_borrador    uuid,
  p_sobre       text,
  p_lineas      jsonb,
  p_base        numeric,
  p_cuota       numeric,
  p_total       numeric,
  p_creada_por  uuid,
  p_creada_en   timestamptz,
  p_nombre      text default 'Destinatario de prueba',
  p_centro      uuid default null,
  p_descartado  boolean default false,
  p_cifrado     bytea default null,
  p_nonce       bytea default null,
  p_etiqueta    bytea default null,
  p_extra_col   text default null,
  p_extra_val   text default null
) returns text
language sql
immutable
as $$
  select format(
    'insert into public.borradores_factura_versiones (borrador_id, centro_id, destinatario_nombre, '
    'destinatario_nif_cifrado, destinatario_nif_nonce, destinatario_nif_etiqueta, destinatario_nif_clave_version, '
    'lineas, base, cuota_iva, total, descartado, creada_por, creada_en, algoritmo_version, contenido_canonico%s) '
    'values (%L, %L, %L, %L, %L, %L, %s, %L, %s, %s, %s, %L, %L, %L, 1, %L%s)',
    coalesce(', ' || p_extra_col, ''),
    p_borrador, p_centro, p_nombre, p_cifrado, p_nonce, p_etiqueta,
    case when p_cifrado is null then 'null' else '1' end,
    p_lineas, p_base, p_cuota, p_total, p_descartado, p_creada_por, p_creada_en, p_sobre,
    coalesce(', ' || p_extra_val, ''));
$$;

-- =========================================================================================
-- Fijación propia (como postgres)
-- =========================================================================================
call pg_temp.reset_sesion();

insert into public.tipos_terapia (id, nombre) values (:TIPO26, 'Terapia económica 26');

-- BORR2: el borrador de PRO2 sobre P2 (centro B), con una versión.
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values
  (:BORR2, :P2, :PRO2, :PRO2);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version(:BORR2,
    pg_temp.sobre_borrador(:BORR2, :PRO2, timestamptz '2026-10-02 09:00:00+00',
      jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)), 70.00, 0.00, 70.00,
      'Beto Dos', :CB),
    jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)), 70.00, 0.00, 70.00,
    :PRO2, timestamptz '2026-10-02 09:00:00+00', 'Beto Dos', :CB),
  '26.fij · la versión 1 de BORR2 (PRO2, P2) se sella');

-- Tarifas: una de P1 y una de P2, abiertas.
insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) values
  (:TAR1, :P1, :TIPO26, 60.00, 'exento_sanitario', date '2026-01-01', :ADM),
  (:TAR2, :P2, :TIPO26, 70.00, 'exento_sanitario', date '2026-01-01', :ADM);

-- Bonos: BONO1 de P1 (centro A), BONO2 de P2 (centro B).
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por) values
  (:BONO1, :P1, 3, 165.00, date '2031-12-31', :ADM),
  (:BONO2, :P2, 5, 300.00, null, :ADM);

-- Un cobro de P2 (COB1 de P1 ya viene de `01`).
insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por) values
  (:COB2, :P2, 70.00, date '2026-10-02', 'transferencia', :ADM);

-- Tres citas FUTURAS de P1 con PRO1, en tres días distintos (no se solapan por
-- `citas_sin_solape_profesional`), y una de P2 con PRO2 para el bono de otro paciente.
insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria) values
  (:CITA1, :P1, :PRO1, :CA, ((current_date + 1500) + time '10:00') at time zone 'Europe/Madrid',
                            ((current_date + 1500) + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid'),
  (:CITA2, :P1, :PRO1, :CA, ((current_date + 1501) + time '10:00') at time zone 'Europe/Madrid',
                            ((current_date + 1501) + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid'),
  (:CITA3, :P1, :PRO1, :CA, ((current_date + 1502) + time '10:00') at time zone 'Europe/Madrid',
                            ((current_date + 1502) + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid'),
  (:CITAP2, :P2, :PRO2, :CB, ((current_date + 1500) + time '10:00') at time zone 'Europe/Madrid',
                             ((current_date + 1500) + time '10:50') at time zone 'Europe/Madrid', 'Europe/Madrid');

-- =========================================================================================
-- A · Solo adición como `authenticated` (42501)
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  format('update public.borradores_factura_versiones set destinatario_nombre = %L where borrador_id = %L', 'X', :BORR1),
  '42501', '26.A1 · ADM: update sobre borradores_factura_versiones');
select pg_temp.assert_lanza_codigo(
  format('delete from public.borradores_factura_versiones where borrador_id = %L', :BORR1),
  '42501', '26.A2 · ADM: delete sobre borradores_factura_versiones');
select pg_temp.assert_lanza_codigo(
  'truncate public.borradores_factura_versiones',
  '42501', '26.A3 · ADM: truncate sobre borradores_factura_versiones');
select pg_temp.assert_lanza_codigo(
  format('update public.cobros set importe = 1 where id = %L', :COB1),
  '42501', '26.A4 · ADM: update sobre cobros');
select pg_temp.assert_lanza_codigo(
  format('delete from public.cobros where id = %L', :COB1),
  '42501', '26.A5 · ADM: delete sobre cobros');
select pg_temp.assert_lanza_codigo(
  'truncate public.cobros',
  '42501', '26.A6 · ADM: truncate sobre cobros');
-- La cabecera del borrador no tiene columnas modificables (D5): sin grant de update ni delete.
select pg_temp.assert_lanza_codigo(
  format('update public.borradores_factura set profesional_id = %L where id = %L', :PRO2, :BORR1),
  '42501', '26.A7 · ADM: update sobre la cabecera borradores_factura');
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format('update public.cobros set importe = 1 where id = %L', :COB1),
  '42501', '26.A8 · TEC1: update sobre cobros');
select pg_temp.assert_lanza_codigo(
  'truncate public.cobros',
  '42501', '26.A9 · TEC1: truncate sobre cobros');
call pg_temp.reset_sesion();

-- =========================================================================================
-- B · La cadena de tres versiones verifica; alterar la segunda la rompe
-- =========================================================================================
-- v1 viene de `01` (postgres). v2 y v3, como ADM, fechadas con el reloj de la base.
select pg_temp.sobre_borrador(:BORR1, :ADM, now(),
  jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 2, 6000)), 120.00, 0.00, 120.00,
  'Ana Uno', :CA) as sobre_v2 \gset
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version(:BORR1, :'sobre_v2',
    jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 2, 6000)), 120.00, 0.00, 120.00,
    :ADM, now(), 'Ana Uno', :CA),
  '26.B1 · ADM sella la v2 de BORR1');
call pg_temp.reset_sesion();

select pg_temp.sobre_borrador(:BORR1, :ADM, now(),
  jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 2, 6000),
                    pg_temp.linea_borrador('Informe pericial', 1, 12100, 'general', 2100)),
  220.00, 21.00, 241.00, 'Ana Uno', :CA) as sobre_v3 \gset
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version(:BORR1, :'sobre_v3',
    jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 2, 6000),
                      pg_temp.linea_borrador('Informe pericial', 1, 12100, 'general', 2100)),
    220.00, 21.00, 241.00, :ADM, now(), 'Ana Uno', :CA),
  '26.B2 · ADM sella la v3 de BORR1 (una línea al 21 %, total con IVA)');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select array_agg(v.numero_version order by v.numero_version) from public.borradores_factura_versiones v
    where v.borrador_id = :BORR1) = array[1, 2, 3],
  '26.B3 · BORR1 tiene las versiones 1, 2 y 3, numeradas por la base');
select pg_temp.assert(
  (select v2.huella_anterior = v1.huella and v3.huella_anterior = v2.huella
     and v1.huella_anterior = decode(repeat('00', 32), 'hex')
     from public.borradores_factura_versiones v1, public.borradores_factura_versiones v2,
          public.borradores_factura_versiones v3
    where v1.borrador_id = :BORR1 and v1.numero_version = 1
      and v2.borrador_id = :BORR1 and v2.numero_version = 2
      and v3.borrador_id = :BORR1 and v3.numero_version = 3),
  '26.B4 · la cadena encadena: génesis de 32 bytes cero y cada huella_anterior es la huella previa');
select pg_temp.assert(
  (select v.huella = extensions.digest(convert_to(v.contenido_canonico, 'UTF8') || v.huella_anterior, 'sha256')
     and v.paciente_id = :P1::uuid and v.profesional_id = :PRO1::uuid
     from public.borradores_factura_versiones v where v.borrador_id = :BORR1 and v.numero_version = 2),
  '26.B5 · la huella de la v2 es SHA-256(sobre || anterior) y paciente/profesional los puso la base desde la cabecera');
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_borrador(:BORR1)) = 0,
  '26.B6 · verificar_cadena_borrador(BORR1) = 0 filas: la cadena de tres versiones verifica');
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_borrador() r where r.borrador_id in (:BORR1, :BORR2)) = 0,
  '26.B7 · verificar_cadena_borrador() sin argumento tampoco señala BORR1 ni BORR2');

-- Se levantan los cerrojos como en 14-cadena-huellas: privilegio y disparador de fila.
grant update on public.borradores_factura_versiones to postgres;
alter table public.borradores_factura_versiones disable trigger impedir_modificacion_borradores_factura_versiones;

-- B8 · El total (y la base, por el check) de la v2 por debajo: el sobre ya no casa con la fila.
update public.borradores_factura_versiones set base = 99.00, total = 99.00
 where borrador_id = :BORR1 and numero_version = 2;
select pg_temp.assert(
  (select array_agg(r.motivo order by r.motivo) from public.verificar_cadena_borrador(:BORR1) r) = array['sobre_no_coincide_con_fila']
  and (select r.numero_version from public.verificar_cadena_borrador(:BORR1) r) = 2,
  '26.B8 · alterar el total de la v2 la señala: sobre_no_coincide_con_fila en la v2');
update public.borradores_factura_versiones set base = 120.00, total = 120.00
 where borrador_id = :BORR1 and numero_version = 2;
select pg_temp.assert((select count(*) from public.verificar_cadena_borrador(:BORR1)) = 0,
  '26.B8b · restaurado el total, la cadena vuelve a verificar');

-- B9 · El sobre de la v2 por debajo (otra persona destinataria): la huella ya no es la suya
-- y el sobre tampoco casa con la columna.
update public.borradores_factura_versiones
   set contenido_canonico = replace(contenido_canonico, '"Ana Uno"', '"Otra Persona"')
 where borrador_id = :BORR1 and numero_version = 2;
select pg_temp.assert(
  (select array_agg(r.motivo order by r.motivo) from public.verificar_cadena_borrador(:BORR1) r
    where r.numero_version = 2) = array['huella_no_coincide', 'sobre_no_coincide_con_fila']
  and (select count(*) from public.verificar_cadena_borrador(:BORR1) r where r.numero_version <> 2) = 0,
  '26.B9 · alterar el sobre de la v2: huella_no_coincide y sobre_no_coincide_con_fila, solo en la v2');
update public.borradores_factura_versiones
   set contenido_canonico = :'sobre_v2'
 where borrador_id = :BORR1 and numero_version = 2;

-- B10 · La huella de la v2 por debajo: la v2 ya no es su SHA-256 y la v3 queda desencadenada.
update public.borradores_factura_versiones
   set huella = extensions.digest('manipulada', 'sha256')
 where borrador_id = :BORR1 and numero_version = 2;
select pg_temp.assert(
  (select array_agg(r.numero_version || ':' || r.motivo order by r.numero_version, r.motivo)
     from public.verificar_cadena_borrador(:BORR1) r) = array['2:huella_no_coincide', '3:eslabon_desencadenado'],
  '26.B10 · tocar la huella de la v2: huella_no_coincide en la v2 y eslabon_desencadenado en la v3');
update public.borradores_factura_versiones v
   set huella = extensions.digest(convert_to(v.contenido_canonico, 'UTF8') || v.huella_anterior, 'sha256')
 where v.borrador_id = :BORR1 and v.numero_version = 2;

-- B11 · Génesis y hueco: la v1 con otra huella_anterior, y una v3 renumerada.
update public.borradores_factura_versiones set huella_anterior = extensions.digest('x', 'sha256')
 where borrador_id = :BORR2 and numero_version = 1;
select pg_temp.assert(
  'genesis_incorrecto' = any (select r.motivo from public.verificar_cadena_borrador(:BORR2) r),
  '26.B11 · una v1 sin los 32 bytes cero como anterior: genesis_incorrecto');
update public.borradores_factura_versiones set huella_anterior = decode(repeat('00', 32), 'hex')
 where borrador_id = :BORR2 and numero_version = 1;
update public.borradores_factura_versiones set numero_version = 7
 where borrador_id = :BORR1 and numero_version = 3;
select pg_temp.assert(
  'hueco_de_posicion' = any (select r.motivo from public.verificar_cadena_borrador(:BORR1) r where r.numero_version = 7),
  '26.B12 · una versión renumerada deja hueco: hueco_de_posicion');
update public.borradores_factura_versiones set numero_version = 3
 where borrador_id = :BORR1 and numero_version = 7;
update public.borradores_factura_versiones set algoritmo_version = 2
 where borrador_id = :BORR2 and numero_version = 1;
select pg_temp.assert(
  (select array_agg(r.motivo) from public.verificar_cadena_borrador(:BORR2) r) = array['era_desconocida'],
  '26.B13 · una era que no es la 1 se declara, no se verifica: era_desconocida');
update public.borradores_factura_versiones set algoritmo_version = 1
 where borrador_id = :BORR2 and numero_version = 1;

alter table public.borradores_factura_versiones enable trigger impedir_modificacion_borradores_factura_versiones;
revoke update on public.borradores_factura_versiones from postgres;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_borrador() r where r.borrador_id in (:BORR1, :BORR2)) = 0,
  '26.B14 · restaurado todo, las dos cadenas vuelven a verificar');
select pg_temp.assert((select count(*) from public.cobertura_solo_adicion()) = 0,
  '26.B15 · cerrojos repuestos: cobertura_solo_adicion() = 0');

-- =========================================================================================
-- C · Un cobro sin factura entra (cobrar antes de facturar es el caso normal)
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, %L, 55.00, current_date, 'bizum', %L)$f$, :COB3, :P1, :TEC1),
  '26.C1 · TEC1 registra un cobro de P1 (su centro) sin factura');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 10.00, current_date, 'efectivo', %L)$f$, :P2, :TEC1),
  '42501', '26.C2 · TEC1 no registra un cobro de P2 (otro centro)');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 10.00, current_date, 'efectivo', %L)$f$, :P1, :ADM),
  '42501', '26.C3 · TEC1 no registra un cobro a nombre de otro (registrado_por)');
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, referencia, registrado_por)
            values (%L, -20.00, current_date, 'transferencia', 'Devolución parcial', %L)$f$, :P2, :ADM),
  '26.C4 · ADM registra un cobro (una devolución, importe negativo) de P2 sin factura');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 0, current_date, 'efectivo', %L)$f$, :P2, :ADM),
  '23514', '26.C5 · un cobro de importe 0 no entra (check <> 0)');
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 15.00, current_date, 'tarjeta', %L)$f$, :P1, :PRO1),
  '26.C6 · PRO1 registra un cobro de su paciente P1');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por)
            values (%L, 15.00, current_date, 'tarjeta', %L)$f$, :P2, :PRO1),
  '42501', '26.C7 · PRO1 no registra un cobro de P2 (no es su paciente)');
call pg_temp.reset_sesion();

-- =========================================================================================
-- D · bonos_consumo: 3 realizadas = 3; cancelar una = 2; sin UPDATE sobre bonos
-- =========================================================================================
select xmin::text as xmin_bono1 from public.bonos where id = :BONO1 \gset

call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(
  format('update public.citas set bono_id = %L where id in (%L, %L, %L)', :BONO1, :CITA1, :CITA2, :CITA3),
  '26.D1 · ADM marca las tres citas con BONO1 (grant update (bono_id))');
select pg_temp.assert(
  (select b.sesiones_consumidas from public.bonos_consumo b where b.bono_id = :BONO1) = 0,
  '26.D2 · con las tres citas programadas, sesiones_consumidas = 0');
select pg_temp.assert_no_lanza(
  format($f$update public.citas set estado = 'realizada' where id in (%L, %L, %L)$f$, :CITA1, :CITA2, :CITA3),
  '26.D3 · ADM pasa las tres citas a realizada');
select pg_temp.assert(
  (select b.sesiones_consumidas from public.bonos_consumo b where b.bono_id = :BONO1) = 3
  and (select b.sesiones_totales from public.bonos_consumo b where b.bono_id = :BONO1) = 3,
  '26.D4 · tres citas realizadas con BONO1: sesiones_consumidas = 3 (de 3)');
select pg_temp.assert_no_lanza(
  format($f$update public.citas set estado = 'cancelada' where id = %L$f$, :CITA3),
  '26.D5 · ADM cancela una de las tres');
select pg_temp.assert(
  (select b.sesiones_consumidas from public.bonos_consumo b where b.bono_id = :BONO1) = 2,
  '26.D6 · cancelada una, sesiones_consumidas = 2');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select xmin::text from public.bonos where id = :BONO1) = :'xmin_bono1',
  '26.D7 · el xmin de BONO1 no cambió: el consumo se deriva, no hubo ningún UPDATE sobre bonos');

-- =========================================================================================
-- E · Bonos por rol, en la tabla y en la vista
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO1)) = 1,
  '26.E1 · TEC1 ve el bono de P1 (su centro, A)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO2)) = 0,
  '26.E2 · TEC1 no ve el bono de P2 (centro B)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :BONO1)) = 1,
  '26.E3 · TEC1 ve BONO1 en bonos_consumo (no lee citas, la vista definer cuenta por él)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :BONO2)) = 0,
  '26.E4 · TEC1 no ve BONO2 en bonos_consumo: el where de la vista repite la política');
call pg_temp.como(:TEC2);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO2)) = 1,
  '26.E5 · gemela: TEC2 ve el bono de P2 (su centro, B)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :BONO2)) = 1
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :BONO1)) = 0,
  '26.E6 · gemela: TEC2 ve BONO2 y no BONO1 en bonos_consumo');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO1)) = 1,
  '26.E7 · PRO1 ve el bono de su paciente P1');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO2)) = 0,
  '26.E8 · PRO1 no ve el bono de P2');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :BONO1)) = 1
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id = %L', :BONO2)) = 0,
  '26.E9 · PRO1: BONO1 sí y BONO2 no en bonos_consumo');
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO2)) = 1
  and pg_temp.contar(format('select 1 from public.bonos where id = %L', :BONO1)) = 0,
  '26.E10 · gemela: PRO2 ve BONO2 y no BONO1');
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos where id in (%L, %L)', :BONO1, :BONO2)) = 2
  and pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id in (%L, %L)', :BONO1, :BONO2)) = 2,
  '26.E11 · ADM ve los dos bonos, en la tabla y en la vista');
call pg_temp.como(:PROBAJA);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.bonos_consumo where bono_id in (%L, %L)', :BONO1, :BONO2)) = 0,
  '26.E12 · PROBAJA (no asignado) no ve ningún bono en la vista');

-- Altas y modificación de bonos.
call pg_temp.como(:TEC1);
select pg_temp.assert_no_lanza(
  format('insert into public.bonos (paciente_id, sesiones_totales, importe, creado_por) values (%L, 10, 500.00, %L)', :P1, :TEC1),
  '26.E13 · TEC1 da de alta un bono de P1 (su centro)');
select pg_temp.assert_lanza_codigo(
  format('insert into public.bonos (paciente_id, sesiones_totales, importe, creado_por) values (%L, 10, 500.00, %L)', :P2, :TEC1),
  '42501', '26.E14 · TEC1 no da de alta un bono de P2 (otro centro)');
select pg_temp.assert_lanza_codigo(
  format('insert into public.bonos (paciente_id, sesiones_totales, importe, creado_por) values (%L, 10, 500.00, %L)', :P1, :ADM),
  '42501', '26.E15 · TEC1 no da de alta un bono a nombre de otro (creado_por)');
select pg_temp.assert_no_lanza(
  format($f$update public.bonos set caducidad = date '2032-06-30' where id = %L$f$, :BONO1),
  '26.E16 · TEC1 cambia la caducidad de BONO1 (update (caducidad))');
select pg_temp.assert_lanza_codigo(
  format('update public.bonos set sesiones_totales = 99 where id = %L', :BONO1),
  '42501', '26.E17 · TEC1 no cambia sesiones_totales (solo caducidad tiene update)');
select pg_temp.assert(
  pg_temp.contar_dml(format($f$update public.bonos set caducidad = date '2032-06-30' where id = %L returning 1$f$, :BONO2)) = 0,
  '26.E18 · TEC1 no alcanza la caducidad de BONO2 (otro centro): cero filas');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select caducidad from public.bonos where id = :BONO2) is null,
  '26.E18b · BONO2 sigue sin caducidad');

-- =========================================================================================
-- F · El técnico: cobros sí; tarifas, versiones y estado del borrador no (con gemelas)
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros where id in (%L, %L)', :COB1, :COB3)) = 2,
  '26.F1 · TEC1 lee los cobros de P1 (su centro)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros where id = %L', :COB2)) = 0,
  '26.F2 · TEC1 no lee el cobro de P2 (otro centro)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.tarifas_paciente where id = %L', :TAR1)) = 0,
  '26.F3 · TEC1 cuenta 0 en tarifas_paciente, aun siendo P1 de su centro');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura_versiones where borrador_id = %L', :BORR1)) = 0,
  '26.F4 · TEC1 cuenta 0 en borradores_factura_versiones (las líneas y cita_id)');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura where id = %L', :BORR1)) = 0,
  '26.F5 · TEC1 cuenta 0 en la cabecera borradores_factura');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura_estado where borrador_id = %L', :BORR1)) = 0,
  '26.F6 · TEC1 cuenta 0 en borradores_factura_estado');
select pg_temp.assert(pg_temp.contar('select 1 from public.auditoria where tabla = ''borradores_factura_versiones''') = 0,
  '26.F7 · TEC1 no tiene filas propias de auditoría de las versiones: no inserta ninguna');
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.tarifas_paciente where id = %L', :TAR1)) = 1,
  '26.F3g · gemela: ADM cuenta 1 sobre la misma tarifa');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura_versiones where borrador_id = %L', :BORR1)) = 3,
  '26.F4g · gemela: ADM cuenta las 3 versiones de BORR1');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura_estado where borrador_id = %L', :BORR1)) = 1,
  '26.F6g · gemela: ADM cuenta 1 en borradores_factura_estado');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros where id in (%L, %L, %L)', :COB1, :COB2, :COB3)) = 3,
  '26.F2g · gemela: ADM lee los tres cobros');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select array_agg(c.column_name::text order by c.ordinal_position) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'bonos_consumo')
  = array['bono_id', 'paciente_id', 'sesiones_totales', 'sesiones_consumidas'],
  '26.F8 · bonos_consumo expone exactamente bono_id, paciente_id, sesiones_totales y sesiones_consumidas: ni cita_id ni lineas');
select pg_temp.assert(
  (select array_agg(c.column_name::text order by c.ordinal_position) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'borradores_factura_estado')
  = array['borrador_id', 'ultima_version', 'estado']
  and (select c.data_type from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'borradores_factura_estado' and c.column_name = 'estado') = 'text',
  '26.F9 · borradores_factura_estado: borrador_id, ultima_version, estado (text), en ese orden (PA.2)');
select pg_temp.assert(
  (select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid = 'public.borradores_factura_estado'::regclass)
  and (select c.reloptions @> array['security_barrier=true'] and not coalesce(c.reloptions @> array['security_invoker=true'], false)
         from pg_class c where c.oid = 'public.bonos_consumo'::regclass),
  '26.F10 · borradores_factura_estado es security_invoker; bonos_consumo es definer con security_barrier');

-- =========================================================================================
-- G · El profesional: su borrador sí, el ajeno no
-- =========================================================================================
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura where id = %L', :BORR1)) = 1,
  '26.G1 · PRO1 cuenta 1 sobre su borrador');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura where id = %L', :BORR2)) = 0,
  '26.G2 · PRO1 cuenta 0 sobre el borrador de PRO2');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura_estado where borrador_id = %L', :BORR1)) = 1
  and pg_temp.contar(format('select 1 from public.borradores_factura_estado where borrador_id = %L', :BORR2)) = 0,
  '26.G3 · lo mismo en borradores_factura_estado');
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura_versiones where borrador_id = %L', :BORR2)) = 0
  and pg_temp.contar(format('select 1 from public.borradores_factura_versiones where borrador_id = %L', :BORR1)) = 3,
  '26.G4 · y en las versiones: 3 de BORR1, 0 de BORR2');
select pg_temp.assert(
  (select e.ultima_version = 3 and e.estado = 'sin_enviar' from public.borradores_factura_estado e where e.borrador_id = :BORR1),
  '26.G5 · el estado de BORR1 es sin_enviar, con la versión 3 como última');
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura where id = %L', :BORR2)) = 1
  and pg_temp.contar(format('select 1 from public.borradores_factura where id = %L', :BORR1)) = 0,
  '26.G6 · gemela: PRO2 cuenta 1 sobre el suyo y 0 sobre el de PRO1');
call pg_temp.como(:PROBAJA);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.borradores_factura where id in (%L, %L)', :BORR1, :BORR2)) = 0,
  '26.G7 · PROBAJA no ve ningún borrador');

-- Alta de cabecera: el profesional, solo para su paciente y a su nombre.
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(
  format('insert into public.borradores_factura (paciente_id, profesional_id, creado_por) values (%L, %L, %L)', :PMENOR, :PRO1, :PRO1),
  '26.G8 · PRO1 abre un borrador de su paciente PMENOR');
select pg_temp.assert_lanza_codigo(
  format('insert into public.borradores_factura (paciente_id, profesional_id, creado_por) values (%L, %L, %L)', :P2, :PRO1, :PRO1),
  '42501', '26.G9 · PRO1 no abre un borrador de P2 (no es su paciente)');
select pg_temp.assert_lanza_codigo(
  format('insert into public.borradores_factura (paciente_id, profesional_id, creado_por) values (%L, %L, %L)', :P1, :PRO2, :PRO1),
  '42501', '26.G10 · PRO1 no abre un borrador a nombre de otro profesional');
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format('insert into public.borradores_factura (paciente_id, profesional_id, creado_por) values (%L, %L, %L)', :P1, :PRO1, :TEC1),
  '42501', '26.G11 · TEC1 no abre borradores');
call pg_temp.reset_sesion();

-- =========================================================================================
-- H · Auditoría al insertar, en las cinco tablas
-- =========================================================================================
select pg_temp.assert(
  exists (select 1 from public.auditoria a where a.tabla = 'tarifas_paciente' and a.operacion = 'INSERT' and a.registro_id = :TAR1)
  and exists (select 1 from public.auditoria a where a.tabla = 'borradores_factura' and a.operacion = 'INSERT' and a.registro_id = :BORR1)
  and exists (select 1 from public.auditoria a where a.tabla = 'cobros' and a.operacion = 'INSERT' and a.registro_id = :COB1)
  and exists (select 1 from public.auditoria a where a.tabla = 'bonos' and a.operacion = 'INSERT' and a.registro_id = :BONO1)
  and exists (select 1 from public.auditoria a join public.borradores_factura_versiones v on v.id::text = a.registro_id
               where a.tabla = 'borradores_factura_versiones' and a.operacion = 'INSERT' and v.borrador_id = :BORR1
                 and v.numero_version = 1),
  '26.H1 · cada una de las cinco tablas escribe un INSERT en auditoria con su registro_id');
select pg_temp.assert(
  (select bool_and(not (a.estado_posterior ? 'destinatario_nif_cifrado')
               and not (a.estado_posterior ? 'destinatario_nif_nonce')
               and not (a.estado_posterior ? 'destinatario_nif_etiqueta')
               and not (a.estado_posterior ? 'contenido_canonico')
               and (a.estado_posterior ? 'destinatario_nif_clave_version')
               and (a.estado_posterior ? 'lineas'))
     from public.auditoria a join public.borradores_factura_versiones v on v.id::text = a.registro_id
    where a.tabla = 'borradores_factura_versiones' and v.borrador_id = :BORR1),
  '26.H2 · el INSERT de las versiones en auditoria recorta el NIF cifrado, su nonce, su etiqueta y el sobre; deja la versión de clave');
select pg_temp.assert(
  (select count(*) from public.auditoria a join public.borradores_factura_versiones v on v.id::text = a.registro_id
    where a.tabla = 'borradores_factura_versiones' and v.borrador_id = :BORR1 and a.actor_id = :ADM) = 2,
  '26.H3 · las versiones 2 y 3 llevan a ADM como actor en auditoria');
select pg_temp.assert(
  exists (select 1 from public.auditoria a where a.tabla = 'cobros' and a.registro_id = :COB3 and a.actor_id = :TEC1),
  '26.H4 · el cobro de TEC1 lleva a TEC1 como actor');

-- =========================================================================================
-- I · Paso 1 (columnas que calcula la base) y paso 0 (quién puede añadir una versión)
-- =========================================================================================
select pg_temp.sobre_borrador(:BORR1, :PRO1, now(),
  jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)), 60.00, 0.00, 60.00,
  'Ana Uno', :CA) as sobre_pro1 \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA, false, null, null, null, 'huella', quote_literal(extensions.digest('h', 'sha256'))),
  '42501', 'los calcula fn_sellar_version_borrador()', '26.I1 · mandar huella: 42501');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA, false, null, null, null, 'huella_anterior', quote_literal(extensions.digest('h', 'sha256'))),
  '42501', 'los calcula fn_sellar_version_borrador()', '26.I2 · mandar huella_anterior: 42501');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA, false, null, null, null, 'numero_version', '4'),
  '42501', 'los calcula fn_sellar_version_borrador()', '26.I3 · mandar numero_version: 42501');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA, false, null, null, null, 'paciente_id', quote_literal(:P1)),
  '42501', 'los calcula fn_sellar_version_borrador()', '26.I4 · mandar paciente_id (aun el correcto): 42501');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA, false, null, null, null, 'profesional_id', quote_literal(:PRO1)),
  '42501', 'los calcula fn_sellar_version_borrador()', '26.I5 · mandar profesional_id (aun el correcto): 42501');
select pg_temp.assert_lanza_codigo_msg(
  replace(pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA), ', 1, ''{', ', 2, ''{'),
  '42501', 'algoritmo_version del borrador la fija la era vigente', '26.I6 · algoritmo_version 2: 42501');
-- Gemela positiva del paso 1 y del paso 0: PRO1 sella una versión de su borrador.
select pg_temp.assert_no_lanza(
  pg_temp.sql_version(:BORR1, :'sobre_pro1', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PRO1, now(), 'Ana Uno', :CA),
  '26.I7 · PRO1 (profesional del borrador, asignado a P1) sella la v4 de BORR1');
call pg_temp.reset_sesion();

-- Paso 0: el mismo 42501, con el mismo mensaje, sea cual sea el sobre.
select pg_temp.sobre_borrador(:BORR2, :PRO1, now(),
  jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)), 70.00, 0.00, 70.00,
  'Beto Dos', :CB) as sobre_ajeno \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR2, :'sobre_ajeno', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)),
    70.00, 0.00, 70.00, :PRO1, now(), 'Beto Dos', :CB),
  '42501', 'No puedes añadir una versión a este borrador', '26.I8 · PRO1 sobre el borrador de PRO2, sobre coherente: 42501');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR2, '{}', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)),
    70.00, 0.00, 70.00, :PRO1, now(), 'Beto Dos', :CB),
  '42501', 'No puedes añadir una versión a este borrador', '26.I9 · el mismo borrador ajeno con un sobre incoherente: el MISMO 42501, no un 23514');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORRX, '{}', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)),
    70.00, 0.00, 70.00, :PRO1, now(), 'Beto Dos', :CB),
  '42501', 'No puedes añadir una versión a este borrador', '26.I10 · un borrador que no existe: el MISMO 42501 (sin oráculo de existencia)');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR2, :'sobre_ajeno', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 7000)),
    70.00, 0.00, 70.00, :PRO1, now(), 'Beto Dos', :CB, false, null, null, null, 'huella', quote_literal(extensions.digest('h', 'sha256'))),
  '42501', 'No puedes añadir una versión a este borrador', '26.I11 · borrador ajeno y además huella: gana el paso 0');
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, '{}', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :TEC1, now(), 'Ana Uno', :CA),
  '42501', 'No puedes añadir una versión a este borrador', '26.I12 · TEC1 sobre un borrador de su centro: 42501');
call pg_temp.como(:PROBAJA);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, '{}', jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
    60.00, 0.00, 60.00, :PROBAJA, now(), 'Ana Uno', :CA),
  '42501', 'No puedes añadir una versión a este borrador', '26.I13 · PROBAJA: 42501');
call pg_temp.reset_sesion();

-- =========================================================================================
-- J · Paso 6: una negativa 23514 por comprobación, con su fragmento (como postgres, salvo J.auth)
-- =========================================================================================
-- Base buena: una línea exenta de 60 €, sobre de pg_temp.sobre_borrador() para la v5 de BORR1.
select jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000))::text as l_ok \gset
select pg_temp.sobre_borrador(:BORR1, :PRO1, timestamptz '2026-10-03 08:00:00+00', :'l_ok'::jsonb,
  60.00, 0.00, 60.00, 'Ana Uno', :CA) as s_ok \gset
\set T0 '\'2026-10-03 08:00:00+00\''

select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, '[]', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'debe ser un objeto JSON', '26.J1 · el sobre no es un objeto');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, (:'s_ok'::jsonb - 'descartado')::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'exactamente las quince claves', '26.J2 · falta una clave');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, (:'s_ok'::jsonb || '{"nota":"x"}')::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'exactamente las quince claves', '26.J3 · sobra una clave');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, rtrim(:'s_ok', '}') || ',"total_centimos":6000}', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'exactamente las quince claves', '26.J4 · una clave repetida (json_object_keys, no jsonb_object_keys)');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(:'s_ok'::jsonb, '{esquema_version}', '2')::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'esquema_version del sobre del borrador', '26.J5 · esquema_version distinto de 1');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(:'s_ok'::jsonb, '{borrador_id}', to_jsonb(:BORR2::text))::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'borrador_id del sobre', '26.J6 · borrador_id del sobre de otro borrador');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(:'s_ok'::jsonb, '{numero_version}', '1')::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'numero_version del sobre', '26.J7 · numero_version del sobre que no es el que asigna la base');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(:'s_ok'::jsonb, '{paciente_id}', to_jsonb(:P2::text))::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'paciente_id del sobre', '26.J8 · paciente_id del sobre que no es el de la cabecera');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(:'s_ok'::jsonb, '{profesional_id}', to_jsonb(:PRO2::text))::text, :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'profesional_id del sobre', '26.J9 · profesional_id del sobre que no es el de la cabecera');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', null),
  '23514', 'centro_id del sobre', '26.J10 · centro_id: la fila nula y el sobre con centro');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Otra Persona', :CA),
  '23514', 'destinatario_nombre del sobre', '26.J11 · destinatario_nombre distinto');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA, false,
    '\x0102'::bytea, '\x000000000000000000000000'::bytea, '\x00000000000000000000000000000000'::bytea),
  '23514', 'destinatario_nif del sobre', '26.J12 · NIF en las columnas y null en el sobre');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', jsonb_build_array(pg_temp.linea_borrador('Otra cosa', 1, 6000)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'lineas del sobre', '26.J13 · las líneas de la columna no son las del sobre');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 50.00, 10.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'base_centimos del sobre', '26.J14 · base de la columna distinta de base_centimos');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(jsonb_set(:'s_ok'::jsonb, '{base_centimos}', '5000'), '{cuota_iva_centimos}', '1000')::text,
    :'l_ok'::jsonb, 50.00, 0.00, 50.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'cuota_iva_centimos del sobre', '26.J15 · cuota de la columna distinta de cuota_iva_centimos');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 50.00, 0.00, 50.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'base_centimos del sobre', '26.J16a · base y total de la columna a 50: salta la base primero');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, jsonb_set(:'s_ok'::jsonb, '{base_centimos}', '5000')::text, :'l_ok'::jsonb, 50.00, 0.00, 50.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'total_centimos del sobre', '26.J16 · total de la columna distinto de total_centimos');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA, true),
  '23514', 'descartado del sobre', '26.J17 · descartado distinto');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :ADM, :T0, 'Ana Uno', :CA),
  '23514', 'creada_por del sobre', '26.J18 · creada_por distinto');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, timestamptz '2026-10-03 08:00:00.001+00', 'Ana Uno', :CA),
  '23514', 'creada_en del sobre', '26.J19 · creada_en a un milisegundo');

-- Líneas: las seis claves y sus tipos. El sobre lleva las mismas líneas que la fila.
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000) || '{"nota_clinica":"x"}'), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000) || '{"nota_clinica":"x"}'), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'Cada línea del borrador debe tener exactamente las claves', '26.J20 · una línea con una clave de más');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000) - 'cita_id'), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000) - 'cita_id'), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'Cada línea del borrador debe tener exactamente las claves', '26.J21 · una línea sin cita_id (ni siquiera null)');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    replace(:'s_ok', '"cantidad": 1', '"cantidad": 1, "cantidad": 1'),
    :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'Cada línea del borrador debe tener exactamente las claves', '26.J22 · una línea con una clave repetida');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 0, 6000)), 0.00, 0.00, 0.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 0, 6000)), 0.00, 0.00, 0.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'La cantidad de una línea', '26.J23 · cantidad 0');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(jsonb_set(pg_temp.linea_borrador('S', 1, 6000), '{cantidad}', '1.5')), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(jsonb_set(pg_temp.linea_borrador('S', 1, 6000), '{cantidad}', '1.5')), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'La cantidad de una línea', '26.J24 · cantidad no entera');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(jsonb_set(pg_temp.linea_borrador('S', 1, 6000), '{precio_unitario_centimos}', '6000.5')), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(jsonb_set(pg_temp.linea_borrador('S', 1, 6000), '{precio_unitario_centimos}', '6000.5')), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'precio_unitario_centimos de una línea', '26.J25 · precio con fracción de céntimo');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'reducido')), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'reducido')), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'regimen_iva de una línea', '26.J26 · un régimen que no existe en regimen_iva');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'general', -100)), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'general', -100)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'tipo_iva_centesimas de una línea', '26.J27 · tipo de IVA negativo');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('  ', 1, 6000)), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('  ', 1, 6000)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'El concepto de una línea', '26.J28 · concepto en blanco');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(jsonb_set(pg_temp.linea_borrador('S', 1, 6000), '{cita_id}', '"no-es-uuid"')), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(jsonb_set(pg_temp.linea_borrador('S', 1, 6000), '{cita_id}', '"no-es-uuid"')), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'cita_id de una línea', '26.J29 · cita_id que no es un uuid');

-- Las tres comprobaciones de importe y cita.
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 2, 6000)), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 2, 6000)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'La suma de cantidad por precio_unitario_centimos', '26.J30 · 2 × 60 € con un total de 60 €');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, :'l_ok'::jsonb, 50.00, 10.00, 60.00, 'Ana Uno', :CA),
    :'l_ok'::jsonb, 50.00, 10.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'todas las líneas son exento_sanitario, la cuota', '26.J31 · todo exento con cuota de IVA');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'exento_sanitario', 0, :CITAP2)), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'exento_sanitario', 0, :CITAP2)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'La cita de una línea no existe o es de otro paciente', '26.J32 · una línea con una cita de P2 en un borrador de P1');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'exento_sanitario', 0, :BORRX)), 60.00, 0.00, 60.00, 'Ana Uno', :CA),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'exento_sanitario', 0, :BORRX)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA),
  '23514', 'La cita de una línea no existe o es de otro paciente', '26.J33 · una línea con una cita que no existe');

-- Gemelas positivas: cita propia, NIF completo, descartado. Como postgres (sin ±1 minuto).
select pg_temp.assert_no_lanza(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'exento_sanitario', 0, :CITA1)), 60.00, 0.00, 60.00, 'Ana Uno', :CA,
      false, '\x0102030405'::bytea, '\x0a0b0c0d0e0f101112131415'::bytea, '\x202122232425262728292a2b2c2d2e2f'::bytea),
    jsonb_build_array(pg_temp.linea_borrador('S', 1, 6000, 'exento_sanitario', 0, :CITA1)), 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA,
    false, '\x0102030405'::bytea, '\x0a0b0c0d0e0f101112131415'::bytea, '\x202122232425262728292a2b2c2d2e2f'::bytea),
  '26.J34 · gemela: una línea con una cita de P1 y el NIF completo (cuatro columnas y el objeto del sobre) se sellan');
select pg_temp.assert_lanza_codigo(
  pg_temp.sql_version(:BORR1, :'s_ok', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA, false,
    '\x0102'::bytea, null, null),
  '23514', '26.J35 · el NIF es todo o nada: una sola de las columnas no entra (check num_nonnulls)');
select pg_temp.assert_no_lanza(
  pg_temp.sql_version(:BORR1,
    pg_temp.sobre_borrador(:BORR1, :PRO1, :T0, :'l_ok'::jsonb, 60.00, 0.00, 60.00, 'Ana Uno', :CA, true),
    :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, :T0, 'Ana Uno', :CA, true),
  '26.J36 · gemela: una versión descartada se sella');
select pg_temp.assert(
  (select e.estado = 'descartado' and e.ultima_version = 6 from public.borradores_factura_estado e where e.borrador_id = :BORR1),
  '26.J37 · la última versión descartada deja el borrador en descartado');
select pg_temp.assert((select count(*) from public.verificar_cadena_borrador(:BORR1)) = 0,
  '26.J38 · las seis versiones de BORR1 siguen verificando');

-- J.auth · Solo para authenticated: creada_por es quien inserta, creada_en con el reloj de la base.
select pg_temp.sobre_borrador(:BORR1, :ADM, now(), :'l_ok'::jsonb, 60.00, 0.00, 60.00, 'Ana Uno', :CA) as s_adm_por \gset
select pg_temp.sobre_borrador(:BORR1, :PRO1, now() - interval '2 minutes', :'l_ok'::jsonb, 60.00, 0.00, 60.00, 'Ana Uno', :CA) as s_viejo \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_adm_por', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :ADM, now(), 'Ana Uno', :CA),
  '23514', 'creada_por de la versión debe ser quien la inserta', '26.J39 · PRO1 firma a nombre de ADM');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.sql_version(:BORR1, :'s_viejo', :'l_ok'::jsonb, 60.00, 0.00, 60.00, :PRO1, now() - interval '2 minutes', 'Ana Uno', :CA),
  '23514', 'creada_en de la versión se aparta más de un minuto', '26.J40 · PRO1 retrofecha la versión dos minutos');
call pg_temp.reset_sesion();

-- =========================================================================================
-- K · Bono de otro paciente, tarifas (cierre, solape, altas por rol)
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set bono_id = %L where id = %L', :BONO2, :CITA1),
  '23514', 'el bono es de otro paciente', '26.K1 · una cita de P1 con el bono de P2: 23514');
call pg_temp.reset_sesion();
select pg_temp.assert_lanza_codigo_msg(
  format('update public.citas set paciente_id = %L where id = %L', :P2, :CITA2),
  '23514', 'el bono es de otro paciente', '26.K2 · cambiar el paciente de una cita con bono a otro paciente: 23514');

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
            values (%L, %L, 65.00, 'exento_sanitario', date '2026-06-01', %L)$f$, :P1, :TIPO26, :ADM),
  '23P01', '26.K3 · dos tarifas vigentes solapadas del mismo paciente y tipo: la exclusión las rechaza');
select pg_temp.assert_no_lanza(
  format($f$update public.tarifas_paciente set vigente_hasta = date '2026-06-01' where id = %L$f$, :TAR1),
  '26.K4 · ADM cierra la tarifa de P1');
select pg_temp.assert_no_lanza(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
            values (%L, %L, 65.00, 'exento_sanitario', date '2026-06-01', %L)$f$, :P1, :TIPO26, :ADM),
  '26.K5 · gemela: cerrada la anterior, la nueva desde el mismo día entra (intervalo [desde, hasta))');
select pg_temp.assert_lanza_codigo_msg(
  format($f$update public.tarifas_paciente set vigente_hasta = date '2026-07-01' where id = %L$f$, :TAR1),
  '42501', 'ya cerrada', '26.K6 · una tarifa cerrada no se vuelve a cerrar');
select pg_temp.assert_lanza_codigo(
  format('update public.tarifas_paciente set importe = 1 where id = %L', :TAR2),
  '42501', '26.K7 · el importe de una tarifa no se cambia (solo update (vigente_hasta))');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
            values (%L, %L, 0, 'exento_sanitario', date '2027-01-01', %L)$f$, :P2, :TIPO26, :ADM),
  '23514', '26.K8 · una tarifa de importe 0 no entra');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, vigente_desde, creada_por)
            values (%L, %L, 10, date '2027-01-01', %L)$f$, :P2, :TIPO26, :ADM),
  '23502', '26.K9 · regimen_iva no tiene valor por defecto: lo marca el usuario');
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
            values (%L, %L, 80.00, 'general', date '2026-01-01', %L)$f$, :PMENOR, :TIPO26, :PRO1),
  '26.K10 · PRO1 da de alta una tarifa de su paciente');
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
            values (%L, %L, 80.00, 'general', date '2026-01-01', %L)$f$, :P2, :TIPO26, :PRO1),
  '42501', '26.K11 · PRO1 no da de alta una tarifa de P2');
select pg_temp.assert(
  pg_temp.contar_dml(format($f$update public.tarifas_paciente set vigente_hasta = date '2026-12-31' where id = %L returning 1$f$, :TAR2)) = 0,
  '26.K12 · PRO1 no alcanza a cerrar la tarifa de P2: cero filas');
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format($f$insert into public.tarifas_paciente (paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
            values (%L, %L, 80.00, 'general', date '2027-01-01', %L)$f$, :P1, :TIPO26, :TEC1),
  '42501', '26.K13 · TEC1 no da de alta tarifas');
call pg_temp.reset_sesion();

-- =========================================================================================
-- L · Catálogo: privilegios, execute del verificador, tablas_solo_adicion
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  'select * from public.verificar_cadena_borrador()',
  '42501', '26.L1 · authenticated no ejecuta verificar_cadena_borrador()');
call pg_temp.reset_sesion();
select pg_temp.assert(
  not has_function_privilege('anon', 'public.verificar_cadena_borrador(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.verificar_cadena_borrador(uuid)', 'EXECUTE'),
  '26.L2 · verificar_cadena_borrador: execute revocado a anon y authenticated');
select pg_temp.assert(
  has_column_privilege('authenticated', 'public.citas', 'bono_id', 'UPDATE')
  and has_column_privilege('authenticated', 'public.citas', 'bono_id', 'SELECT')
  and not has_column_privilege('authenticated', 'public.citas', 'bono_id', 'INSERT'),
  '26.L3 · citas.bono_id: update y select para authenticated; insert no (los grants por columna de T-039)');
select pg_temp.assert(
  has_column_privilege('authenticated', 'public.bonos', 'caducidad', 'UPDATE')
  and not exists (select 1 from information_schema.column_privileges p
                   where p.table_schema = 'public' and p.table_name = 'bonos' and p.grantee = 'authenticated'
                     and p.privilege_type = 'UPDATE' and p.column_name <> 'caducidad'),
  '26.L4 · bonos: solo caducidad tiene update');
select pg_temp.assert(
  has_column_privilege('authenticated', 'public.tarifas_paciente', 'vigente_hasta', 'UPDATE')
  and not exists (select 1 from information_schema.column_privileges p
                   where p.table_schema = 'public' and p.table_name = 'tarifas_paciente' and p.grantee = 'authenticated'
                     and p.privilege_type = 'UPDATE' and p.column_name <> 'vigente_hasta'),
  '26.L5 · tarifas_paciente: solo vigente_hasta tiene update');
select pg_temp.assert(
  not exists (select 1 from information_schema.table_privileges p
               where p.table_schema = 'public'
                 and p.table_name in ('tarifas_paciente', 'borradores_factura', 'borradores_factura_versiones', 'cobros', 'bonos',
                                      'borradores_factura_estado', 'bonos_consumo')
                 and p.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
                 and p.privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES', 'DELETE', 'UPDATE')),
  '26.L6 · ninguna de las cinco tablas ni de las dos vistas concede truncate, trigger, references, delete ni update de tabla');
select pg_temp.assert(
  not exists (select 1 from information_schema.table_privileges p
               where p.table_schema = 'public'
                 and p.table_name in ('tarifas_paciente', 'borradores_factura', 'borradores_factura_versiones', 'cobros', 'bonos',
                                      'borradores_factura_estado', 'bonos_consumo')
                 and p.grantee in ('anon', 'PUBLIC')),
  '26.L7 · anon no tiene nada sobre las tablas ni las vistas económicas');
select pg_temp.assert(
  (select array_agg(t.tabla order by t.tabla) from public.tablas_solo_adicion t
    where t.tabla in ('borradores_factura_versiones', 'cobros', 'borradores_factura', 'bonos', 'tarifas_paciente'))
  = array['borradores_factura_versiones', 'cobros'],
  '26.L8 · tablas_solo_adicion gana exactamente las versiones del borrador y cobros');
select pg_temp.assert(
  (select bool_and(c.relrowsecurity) from pg_class c
    where c.oid in ('public.tarifas_paciente'::regclass, 'public.borradores_factura'::regclass,
                    'public.borradores_factura_versiones'::regclass, 'public.cobros'::regclass, 'public.bonos'::regclass)),
  '26.L9 · las cinco tablas tienen la RLS activada');
select pg_temp.assert(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
    where p.oid = 'public.fn_sellar_version_borrador()'::regprocedure)
  and (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's' from pg_proc p
    where p.oid = 'public.verificar_cadena_borrador(uuid)'::regprocedure),
  '26.L10 · el sellado y el verificador son security definer con search_path vacío; el verificador, stable');

-- Limpieza para los bancos que vienen detrás (todo es una transacción): las citas futuras de
-- PRO1 y PRO2 quedan canceladas.
update public.citas set estado = 'cancelada' where id in (:CITA1, :CITA2, :CITA3, :CITAP2) and estado <> 'cancelada';
call pg_temp.reset_sesion();

\echo '26-economico: completa.'
