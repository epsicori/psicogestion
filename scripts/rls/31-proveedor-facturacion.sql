-- T-026a · Programa de facturación sin red (ADR-053: la app prepara borradores y no los aprueba;
-- ADR-077: espejo mínimo de lo que el programa expide; ADR-024: el outbox es la cola). Diseño:
-- `tickets/T-026a/diseno.md` (delta) sobre `tickets/T-026/diseno.md` (base).
--
-- Qué prueba, por secciones (el fichero las recorre en este orden; la E y la C comparten el
-- borrador BORRE, que es el que llega a «envío» y «borrado sin aprobar»):
--   A · catálogo: columnas exactas de las tres tablas, de la vista y de `borradores_factura_estado`;
--       ninguna columna del espejo casa con estado/pago/cobro/pdf/qr/registro/huella; definer con
--       `search_path` vacío; `execute` por función y rol; privilegios de tabla; orden de disparadores.
--   B · solo adición: insert directo (ADM, PRO1, TEC1) y update/delete/truncate (authenticated,
--       service_role y postgres) dan 42501 en las tres tablas.
--   D · envíos: idempotentes por el mismo documento, 23505 con otro, y los tres rechazos de
--       `validar_envio_borrador` por insert directo como postgres.
--   E · anotaciones: vocabulario cerrado, coherencia con el espejo, idempotencia, y
--       `documentos_para_sincronizar`.
--   C · espejo: los mismos datos dos veces dan el mismo id; datos distintos, 23505 y la fila no se
--       mueve (xmin); sin envío 23503; tras un borrado sin aprobar 23514; discrepancia y cursor.
--   F · lectura por rol, con gemelas; G · la vista del técnico, comparando los dos caminos;
--   H · cobros con espejo (`validar_cobro_factura_espejo`), con fecha current_date − 1.
--   I · encolar (permisos primero, mismo texto para ajeno e inexistente), J · congelación,
--   K · estados (con el fallido ambiguo), N · reclamo (concesión, retroceso, intento 8, descartado), L · Vault,
--   O · el espejo lo lee el profesional asignado, no el autor (BORRF), M · auditoría.
--
-- Ids propios con prefijo `a0260001-`: BORRA y BORRB vienen de `01`; BORRC, BORRD y BORRE son de este
-- módulo. Los recuentos se filtran por esos ids, nunca por totales de tabla: el banco entero es UNA
-- transacción. Este módulo NO ancla nada a la agenda (sin citas, series ni disponibilidad): usa
-- `current_date`, `current_date − 1` y `now()`, y `creada_en` literales pasados como `postgres`.

\echo ''
\echo '=== 31-proveedor-facturacion ==='

\set BORRC '\'a0260001-0000-4000-8000-000000000003\''
\set BORRD '\'a0260001-0000-4000-8000-000000000004\''
\set BORRE '\'a0260001-0000-4000-8000-000000000005\''

-- Ayudante local: el resultado de una sentencia como texto «SQLSTATE:mensaje», o 'NO LANZA'. Sirve
-- para comparar por igualdad dos rechazos (el de un borrador ajeno y el de uno inexistente).
create or replace function pg_temp.resultado_de(consulta text) returns text
language plpgsql
as $$
begin
  begin
    execute consulta;
  exception when others then
    return sqlstate || ':' || sqlerrm;
  end;
  return 'NO LANZA';
end;
$$;

-- =========================================================================================
-- Fijación propia (como postgres): BORRC (la cadena de estados), BORRD (última versión
-- descartada) y BORRE (envío y borrado sin aprobar). Todos de P1 y PRO1.
-- =========================================================================================
call pg_temp.reset_sesion();

insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values
  (:BORRC, :P1, :PRO1, :PRO1),
  (:BORRD, :P1, :PRO1, :PRO1),
  (:BORRE, :P1, :PRO1, :PRO1);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRC, :PRO1, 50.00, timestamptz '2026-10-01 10:00:03+00', 'Ana Uno', :CA),
  '31.fij · la versión 1 de BORRC se sella');
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRD, :PRO1, 40.00, timestamptz '2026-10-01 10:00:04+00', 'Ana Uno', :CA),
  '31.fij · la versión 1 de BORRD se sella');
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRD, :PRO1, 40.00, timestamptz '2026-10-01 10:00:05+00', 'Ana Uno', :CA, true),
  '31.fij · la versión 2 de BORRD (descartada) se sella');
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRE, :PRO1, 30.00, timestamptz '2026-10-01 10:00:06+00', 'Ana Uno', :CA),
  '31.fij · la versión 1 de BORRE se sella');

-- Los ids que se leen de la fijación de `01` (versiones, eventos, espejos) y de aquí.
select format('%L', e.id) as "ESPA" from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-A' \gset
select format('%L', e.id) as "ESPB" from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-B' \gset
select format('%L', v.id) as "VERE" from public.borradores_factura_versiones v
 where v.borrador_id = :BORRE and v.numero_version = 1 \gset
select count(*) as "N_ADM" from public.perfiles p where p.rol = 'administrador' and p.estado = 'activo' \gset
select pg_temp.assert(:N_ADM >= 1, '31.fij · hay al menos un administrador activo (destinatario de los avisos)');

-- =========================================================================================
-- A · Catálogo
-- =========================================================================================
select pg_temp.assert(
  (select array_agg(c.column_name || ':' || c.data_type order by c.ordinal_position)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'borradores_factura_envios')
  = array['id:uuid', 'borrador_id:uuid', 'version_id:uuid', 'numero_version:integer', 'paciente_id:uuid',
          'proveedor:USER-DEFINED', 'proveedor_documento_id:text', 'proyeccion_version:smallint',
          'fecha_documento:date', 'evento_id:uuid', 'enviado_en:timestamp with time zone'],
  '31.A1 · borradores_factura_envios tiene exactamente las columnas del diseño, en su orden');
select pg_temp.assert(
  (select array_agg(c.column_name || ':' || c.data_type order by c.ordinal_position)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'facturas_espejo')
  = array['id:uuid', 'borrador_id:uuid', 'paciente_id:uuid', 'proveedor:USER-DEFINED',
          'proveedor_documento_id:text', 'numero:text', 'fecha_expedicion:date', 'base:numeric',
          'cuota_iva:numeric', 'total:numeric', 'url_proveedor:text', 'copiado_en:timestamp with time zone'],
  '31.A2 · facturas_espejo tiene exactamente la lista del ADR-077 punto 7, en su orden');
select pg_temp.assert(
  (select array_agg(c.column_name || ':' || c.data_type order by c.ordinal_position)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'facturas_anotaciones')
  = array['id:uuid', 'borrador_id:uuid', 'proveedor:USER-DEFINED', 'proveedor_documento_id:text',
          'tipo:USER-DEFINED', 'observada_en:timestamp with time zone'],
  '31.A3 · facturas_anotaciones tiene exactamente sus seis columnas (sin texto libre)');
select pg_temp.assert(
  (select array_agg(c.column_name || ':' || c.data_type order by c.ordinal_position)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'facturas_espejo_cabecera')
  = array['id:uuid', 'paciente_id:uuid', 'proveedor:USER-DEFINED', 'numero:text', 'fecha_expedicion:date',
          'base:numeric', 'cuota_iva:numeric', 'total:numeric', 'url_proveedor:text',
          'copiado_en:timestamp with time zone'],
  '31.A4 · la vista del técnico no lleva borrador_id, cita_id, líneas ni destinatario');
select pg_temp.assert(
  (select array_agg(c.column_name || ':' || c.data_type order by c.ordinal_position)
     from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'borradores_factura_estado')
  = array['borrador_id:uuid', 'ultima_version:integer', 'estado:text', 'envio_ambiguo:boolean'],
  '31.A5 · borradores_factura_estado conserva las tres columnas de T-021, en su orden y con su tipo, y suma envio_ambiguo al final');
select pg_temp.assert(
  (select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'facturas_espejo'
      and c.column_name ~* 'estado|pago|cobr|pdf|qr|registro|huella') = 0,
  '31.A6 · ninguna columna del espejo casa con estado, pago, cobro, pdf, qr, registro ni huella (ADR-077)');

select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'reclamar_envios_facturacion', 'registrar_envio_borrador', 'registrar_fallo_envio_facturacion',
      'registrar_factura_espejo', 'registrar_anotacion_documento', 'documentos_para_sincronizar',
      'notificar_discrepancia_facturacion', 'avanzar_cursor_sincronizacion', 'clave_proveedor_facturacion',
      'encolar_envio_borrador', 'guardar_clave_proveedor_facturacion', 'quitar_proveedor_facturacion',
      'proveedor_facturacion_activo', 'estado_clave_proveedor_facturacion', 'disparar_drenado_facturacion',
      'estado_cola_borrador', 'fn_validar_envio_borrador',
      'fn_sellar_version_borrador_tras_envio', 'fn_validar_cobro_factura_espejo')) = 19,
  '31.A7 · existen las diecinueve funciones nuevas, sin sobrecargas');
select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'reclamar_envios_facturacion', 'registrar_envio_borrador', 'registrar_fallo_envio_facturacion',
      'registrar_factura_espejo', 'registrar_anotacion_documento', 'documentos_para_sincronizar',
      'notificar_discrepancia_facturacion', 'avanzar_cursor_sincronizacion', 'clave_proveedor_facturacion',
      'encolar_envio_borrador', 'guardar_clave_proveedor_facturacion', 'quitar_proveedor_facturacion',
      'proveedor_facturacion_activo', 'estado_clave_proveedor_facturacion', 'disparar_drenado_facturacion',
      'estado_cola_borrador', 'fn_validar_envio_borrador',
      'fn_sellar_version_borrador_tras_envio', 'fn_validar_cobro_factura_espejo')
      and (not p.prosecdef or p.proconfig is distinct from array['search_path=""'])) = 0,
  '31.A8 · todas son definer con search_path vacío');

-- Matriz de execute: nombre → quién la ejecuta (a, u, s = anon, authenticated, service_role).
select pg_temp.assert(
  (select count(*) from (values
      ('reclamar_envios_facturacion', false, false, true),
      ('registrar_envio_borrador', false, false, true),
      ('registrar_fallo_envio_facturacion', false, false, true),
      ('registrar_factura_espejo', false, false, true),
      ('registrar_anotacion_documento', false, false, true),
      ('documentos_para_sincronizar', false, false, true),
      ('notificar_discrepancia_facturacion', false, false, true),
      ('avanzar_cursor_sincronizacion', false, false, true),
      ('clave_proveedor_facturacion', false, false, true),
      ('proveedor_facturacion_activo', false, true, true),
      ('encolar_envio_borrador', false, true, false),
      ('guardar_clave_proveedor_facturacion', false, true, false),
      ('quitar_proveedor_facturacion', false, true, false),
      ('estado_clave_proveedor_facturacion', false, true, false),
      ('estado_cola_borrador', false, true, false),
      ('disparar_drenado_facturacion', false, false, false),
      ('fn_validar_envio_borrador', false, false, false),
      ('fn_sellar_version_borrador_tras_envio', false, false, false),
      ('fn_validar_cobro_factura_espejo', false, false, false)) m(nombre, a, u, s)
    join pg_proc p on p.proname = m.nombre and p.pronamespace = 'public'::regnamespace
   where has_function_privilege('anon', p.oid, 'execute') is distinct from m.a
      or has_function_privilege('authenticated', p.oid, 'execute') is distinct from m.u
      or has_function_privilege('service_role', p.oid, 'execute') is distinct from m.s) = 0,
  '31.A9 · execute por función y rol: la matriz del diseño, sin ninguna de más ni de menos');

select pg_temp.assert(
  (select array_agg(t.tgname::text order by t.tgname) from pg_trigger t
    where t.tgrelid = 'public.borradores_factura_versiones'::regclass and not t.tgisinternal
      and t.tgname like 'sellar_version_borrador%')
  = array['sellar_version_borrador', 'sellar_version_borrador_cotas', 'sellar_version_borrador_tras_envio'],
  '31.A10 · orden de los disparadores BEFORE INSERT de las versiones: sellado (permisos), cotas, congelación');
select pg_temp.assert(
  (select array_agg(t.tgname::text order by t.tgname) from pg_trigger t
    where t.tgrelid = 'public.cobros'::regclass and not t.tgisinternal and t.tgname like 'validar_cobro%')
  = array['validar_cobro', 'validar_cobro_factura_espejo'],
  '31.A11 · orden de los disparadores de cobros: la fecha de T-023 antes que el espejo');

select pg_temp.assert(
  (select count(*) from information_schema.table_privileges g
    where g.table_schema = 'public'
      and g.table_name in ('borradores_factura_envios', 'facturas_espejo', 'facturas_anotaciones', 'facturacion_ajuste',
                           'facturas_espejo_cabecera')
      and (g.grantee in ('anon', 'service_role', 'public')
           or (g.grantee = 'authenticated' and (g.privilege_type <> 'SELECT' or g.table_name = 'facturacion_ajuste'))
           or (g.grantee = 'postgres' and g.privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
               and g.table_name in ('borradores_factura_envios', 'facturas_espejo', 'facturas_anotaciones')))) = 0,
  '31.A12 · privilegios de tabla: authenticated solo SELECT (y nada sobre el ajuste), nada a anon ni a service_role, ni UPDATE, DELETE ni TRUNCATE a postgres');
select pg_temp.assert(
  (select count(*) from information_schema.table_privileges g
    where g.table_schema = 'public' and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
      and g.table_name in ('borradores_factura_envios', 'facturas_espejo', 'facturas_anotaciones',
                           'facturas_espejo_cabecera')) = 4,
  '31.A13 · authenticated lee las tres tablas y la vista (la RLS decide qué filas)');
select pg_temp.assert(
  has_column_privilege('authenticated', 'public.cobros', 'factura_espejo_id', 'insert')
  and not has_column_privilege('authenticated', 'public.cobros', 'factura_espejo_id', 'update'),
  '31.A14 · cobros.factura_espejo_id: authenticated lo inserta y no lo actualiza');
select pg_temp.assert(
  (select count(*) from public.tablas_solo_adicion t
    where t.tabla in ('borradores_factura_envios', 'facturas_espejo', 'facturas_anotaciones')) = 3,
  '31.A15 · las tres tablas figuran en tablas_solo_adicion');
select pg_temp.assert(
  (select count(*) from public.cobertura_solo_adicion()) = 0,
  '31.A16 · cobertura_solo_adicion() = 0 filas con las tres tablas nuevas');
select pg_temp.assert(
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
      and c.relname in ('borradores_factura_envios', 'facturas_espejo', 'facturas_anotaciones', 'facturacion_ajuste')
      and c.relrowsecurity) = 4,
  '31.A17 · RLS activa en las tres tablas y en el ajuste');
select pg_temp.assert(
  (select count(*) from pg_policy p where p.polrelid = 'public.facturacion_ajuste'::regclass) = 0,
  '31.A18 · facturacion_ajuste no tiene políticas (ilegible para authenticated)');

-- =========================================================================================
-- B · Solo adición
-- =========================================================================================
do $$
declare
  v_t text;
  v_rol text;
  v_op text;
  v_col text;
  v_sql text;
begin
  for v_t in select unnest(array['borradores_factura_envios', 'facturas_espejo', 'facturas_anotaciones']) loop
    select c.column_name into v_col from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = v_t and c.column_name = 'proveedor_documento_id';
    foreach v_rol in array array['authenticated', 'service_role', 'postgres'] loop
      foreach v_op in array array['update', 'delete', 'truncate'] loop
        v_sql := case v_op
          when 'update' then format('update public.%I set %I = %I', v_t, v_col, v_col)
          when 'delete' then format('delete from public.%I', v_t)
          else format('truncate table public.%I', v_t) end;
        if v_rol = 'postgres' then
          reset role;
        else
          execute format('set local role %I', v_rol);
          if v_rol = 'authenticated' then
            execute format('set local request.jwt.claims = %L',
              jsonb_build_object('sub', 'b0030001-0000-4000-8000-000000000002', 'role', 'authenticated')::text);
          end if;
        end if;
        perform pg_temp.assert_lanza_codigo(v_sql, '42501', format('31.B · %L como %L sobre %L: 42501', v_op, v_rol, v_t));
        reset role;
        reset request.jwt.claims;
      end loop;
    end loop;
  end loop;
end $$;

-- B · insert directo, como ADM, PRO1 y TEC1: 42501 (no hay grant de INSERT; solo entran las funciones).
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, gen_random_uuid(), 1, %L, ''holded'', ''DOC-B1'', 1, current_date, gen_random_uuid())', :BORRC, :P1),
  '42501', '31.B · ADM no inserta en borradores_factura_envios');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.facturas_espejo (borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor) values (%L, %L, ''holded'', ''DOC-B1'', ''X'', current_date, 1, 0, 1, ''https://x.example'')', :BORRC, :P1),
  '42501', '31.B · ADM no inserta en facturas_espejo');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.facturas_anotaciones (borrador_id, proveedor, proveedor_documento_id, tipo) values (%L, ''holded'', ''DOC-B1'', ''rectificado'')', :BORRC),
  '42501', '31.B · ADM no inserta en facturas_anotaciones');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(format(
  'insert into public.facturas_espejo (borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor) values (%L, %L, ''holded'', ''DOC-B1'', ''X'', current_date, 1, 0, 1, ''https://x.example'')', :BORRC, :P1),
  '42501', '31.B · PRO1 no inserta en facturas_espejo');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.facturas_anotaciones (borrador_id, proveedor, proveedor_documento_id, tipo) values (%L, ''holded'', ''DOC-B1'', ''rectificado'')', :BORRC),
  '42501', '31.B · PRO1 no inserta en facturas_anotaciones');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, gen_random_uuid(), 1, %L, ''holded'', ''DOC-B1'', 1, current_date, gen_random_uuid())', :BORRC, :P1),
  '42501', '31.B · PRO1 no inserta en borradores_factura_envios');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(format(
  'insert into public.facturas_espejo (borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor) values (%L, %L, ''holded'', ''DOC-B1'', ''X'', current_date, 1, 0, 1, ''https://x.example'')', :BORRC, :P1),
  '42501', '31.B · TEC1 no inserta en facturas_espejo');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.facturas_anotaciones (borrador_id, proveedor, proveedor_documento_id, tipo) values (%L, ''holded'', ''DOC-B1'', ''rectificado'')', :BORRC),
  '42501', '31.B · TEC1 no inserta en facturas_anotaciones');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, gen_random_uuid(), 1, %L, ''holded'', ''DOC-B1'', 1, current_date, gen_random_uuid())', :BORRC, :P1),
  '42501', '31.B · TEC1 no inserta en borradores_factura_envios');
call pg_temp.reset_sesion();

-- =========================================================================================
-- D · Envíos (BORRE llega a «enviado»)
-- =========================================================================================
call pg_temp.como(:ADM);
select public.encolar_envio_borrador(:BORRE) as "EVE_ID" \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select e.clave_idempotencia = 'facturacion.enviar_borrador:' || :BORRE
          and e.tipo = 'facturacion.enviar_borrador' and e.estado = 'pendiente'
          and e.carga = jsonb_build_object('borrador_id', :BORRE::uuid)
     from public.eventos_salientes e where e.id = :'EVE_ID'),
  '31.D0 · encolar crea el evento con su clave de idempotencia y una carga que solo lleva el id del borrador');

set local role service_role;
select count(*) as "RECL_E" from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRE \gset
reset role;
select pg_temp.assert(:RECL_E = 1, '31.D1 · el consumidor reclama el evento de BORRE');

set local role service_role;
select public.registrar_envio_borrador(:'EVE_ID', 'holded', 'DOC-E', 1::smallint, :VERE, current_date) as "ENV_E1" \gset
select public.registrar_envio_borrador(:'EVE_ID', 'holded', 'DOC-E', 1::smallint, :VERE, current_date) as "ENV_E2" \gset
reset role;
select pg_temp.assert(:'ENV_E1' = :'ENV_E2'
    and (select count(*) from public.borradores_factura_envios s where s.borrador_id = :BORRE) = 1,
  '31.D2 · registrar_envio_borrador dos veces con los mismos datos da el mismo id y una sola fila');
select pg_temp.assert(
  (select e.estado = 'entregado' from public.eventos_salientes e where e.id = :'EVE_ID'),
  '31.D3 · registrar el envío deja el evento entregado en la misma transacción');
select pg_temp.assert(
  (select s.paciente_id = :P1::uuid and s.numero_version = 1 and s.proyeccion_version = 1
          and s.evento_id = :'EVE_ID'::uuid and s.proveedor_documento_id = 'DOC-E'
     from public.borradores_factura_envios s where s.id = :'ENV_E1'),
  '31.D4 · el paciente del envío se deriva de la cabecera y el evento queda vinculado');

set local role service_role;
select pg_temp.assert_lanza_codigo_msg(format(
  'select public.registrar_envio_borrador(%L, ''holded'', ''DOC-E2'', 1::smallint, %L, current_date)', :'EVE_ID', :VERE),
  '23505', 'otro documento', '31.D5 · el mismo borrador con otro documento da 23505');
select pg_temp.assert_lanza_codigo_msg(format(
  'select public.registrar_envio_borrador(%L, ''holded'', ''DOC-D6'', 1::smallint, %L, current_date)', gen_random_uuid(), :VERE),
  '22023', 'no es un envío de borrador', '31.D6 · un evento inexistente da 22023');
reset role;

-- D · los tres rechazos de validar_envio_borrador, por insert directo como postgres (la única
-- forma de pasar un version_id ajeno). Cada uno con su fragmento.
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, gen_random_uuid(), 1, %L, ''holded'', ''DOC-D7'', 1, current_date, gen_random_uuid())', :BORRC, :P1),
  '23503', 'la versión del envío no existe', '31.D7 · una versión inexistente da 23503');
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, %L, 1, %L, ''holded'', ''DOC-D8'', 1, current_date, gen_random_uuid())', :BORRC, :VERA, :P1),
  '23514', 'la versión no es la del borrador del envío', '31.D8 · la versión de otro borrador da 23514');
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, %L, 2, %L, ''holded'', ''DOC-D9'', 1, current_date, gen_random_uuid())', :BORRE, :VERE, :P1),
  '23514', 'la versión no es la del borrador del envío', '31.D9 · un numero_version que no es el de la versión da 23514');
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.borradores_factura_envios (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id, proyeccion_version, fecha_documento, evento_id) values (%L, %L, 1, %L, ''holded'', ''DOC-D10'', 1, current_date, gen_random_uuid())', :BORRE, :VERE, :P2),
  '23514', 'el paciente del envío no es el del borrador', '31.D10 · el paciente de otra cabecera da 23514');

-- =========================================================================================
-- E · Anotaciones
-- =========================================================================================
select pg_temp.assert(
  (select array_agg(x::text order by x::text)
     from unnest(enum_range(null::public.anotacion_documento_proveedor)) x)
  = array['anulado', 'borrado_sin_aprobar', 'rectificado'],
  '31.E1 · el vocabulario de anotaciones son exactamente tres valores');
select pg_temp.assert(
  (select array_agg(x::text) from unnest(enum_range(null::public.proveedor_facturacion)) x) = array['holded'],
  '31.E2 · el enum de proveedores es {holded}');

set local role service_role;
select pg_temp.assert_lanza_codigo(
  'select public.registrar_anotacion_documento(''holded'', ''DOC-E'', ''pagado'')',
  '22P02', '31.E3 · una anotación «pagado» no existe en el vocabulario (22P02)');
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_anotacion_documento(''holded'', ''DOC-E'', ''rectificado'')',
  '23514', 'sin factura copiada', '31.E4 · rectificado sin espejo da 23514');
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_anotacion_documento(''holded'', ''DOC-E'', ''anulado'')',
  '23514', 'sin factura copiada', '31.E5 · anulado sin espejo da 23514');
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_anotacion_documento(''holded'', ''DOC-A'', ''borrado_sin_aprobar'')',
  '23514', 'con factura copiada', '31.E6 · borrado sin aprobar sobre un documento con espejo da 23514');
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_anotacion_documento(''holded'', ''DOC-X'', ''rectificado'')',
  '23503', 'no hay envío para ese documento', '31.E7 · una anotación sin envío da 23503');
select public.registrar_anotacion_documento('holded', 'DOC-E', 'borrado_sin_aprobar') as "ANO_E1" \gset
select public.registrar_anotacion_documento('holded', 'DOC-E', 'borrado_sin_aprobar') as "ANO_E2" \gset
reset role;
select pg_temp.assert(:'ANO_E1' = :'ANO_E2'
    and (select count(*) from public.facturas_anotaciones a where a.borrador_id = :BORRE) = 1,
  '31.E8 · la misma anotación dos veces devuelve el mismo id y deja una fila');
select pg_temp.assert(
  (select a.borrador_id = :BORRE::uuid from public.facturas_anotaciones a where a.id = :'ANO_E1'),
  '31.E9 · el borrador de la anotación se deriva del envío');

-- documentos_para_sincronizar
set local role service_role;
select count(*) as "SINC_NULL" from public.documentos_para_sincronizar('holded', null, 50)
 where proveedor_documento_id in ('DOC-A', 'DOC-B', 'DOC-E') \gset
select proveedor_documento_id || ':' || tiene_espejo::text || ':' || anotaciones::text as "SINC_IDS"
  from public.documentos_para_sincronizar('holded', array['DOC-A', 'DOC-X'], 50) \gset
reset role;
select pg_temp.assert(:SINC_NULL = 0,
  '31.E10 · sin lista, no devuelve los envíos con espejo ni los borrados sin aprobar');
select pg_temp.assert(:'SINC_IDS' = 'DOC-A:true:{rectificado}',
  '31.E11 · con lista, devuelve solo los que tienen envío, con su espejo y sus anotaciones');

-- =========================================================================================
-- C · Espejo
-- =========================================================================================
select xmin::text as "XMIN_A" from public.facturas_espejo where proveedor_documento_id = 'DOC-A' \gset
set local role service_role;
select public.registrar_factura_espejo('holded', 'DOC-A', 'F-2026-0001', current_date, 6000, 0, 6000,
                                       'https://programa.example/doc/A') as "ESP_A2" \gset
reset role;
select pg_temp.assert(:'ESP_A2' = trim(both '''' from :ESPA)
    and (select count(*) from public.facturas_espejo e where e.borrador_id = :BORRA) = 1,
  '31.C1 · los mismos datos dos veces dan el mismo id y una sola fila');

set local role service_role;
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_factura_espejo(''holded'', ''DOC-A'', ''F-2026-0001'', current_date, 6100, 0, 6100, ''https://programa.example/doc/A'')',
  '23505', 'otros datos', '31.C2 · el mismo documento con otro total da 23505');
reset role;
select pg_temp.assert(
  (select e.total = 60.00 and e.base = 60.00 and e.xmin::text = :'XMIN_A'
     from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-A'),
  '31.C3 · la fila conserva su total original y su xmin: no hubo UPDATE');

set local role service_role;
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_factura_espejo(''holded'', ''DOC-X'', ''F-X'', current_date, 100, 0, 100, ''https://programa.example/doc/X'')',
  '23503', 'no hay envío para ese documento', '31.C4 · un documento sin envío da 23503');
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_factura_espejo(''holded'', ''DOC-E'', ''F-E'', current_date, 3000, 0, 3000, ''https://programa.example/doc/E'')',
  '23514', 'se borró sin aprobar', '31.C5 · tras un borrado sin aprobar no se copia el espejo (23514)');
select pg_temp.assert_lanza_codigo(
  'select public.registrar_factura_espejo(''holded'', ''DOC-A'', ''F-2026-0001'', current_date, 6000, 100, 6000, ''https://programa.example/doc/A'')',
  '23514', '31.C6 · base + cuota ≠ total no entra (check)');
select pg_temp.assert_lanza_codigo(
  'select public.registrar_factura_espejo(''holded'', ''DOC-A'', ''F-2026-0001'', current_date, 6000, 0, 6000, ''http://inseguro.example'')',
  '23514', '31.C7 · una URL que no es https no entra (check)');
reset role;

-- C · discrepancia (aviso deduplicado) y cursor
set local role service_role;
select public.notificar_discrepancia_facturacion('holded', 'DOC-A');
select public.notificar_discrepancia_facturacion('holded', 'DOC-A');
reset role;
select pg_temp.assert(
  (select count(*) from public.notificaciones n
    where n.tipo = 'facturacion_discrepancia' and n.origen_tabla = 'facturas_espejo'
      and n.origen_id = trim(both '''' from :ESPA)::uuid) = :N_ADM
  and (select count(distinct n.perfil_id) from public.notificaciones n
        where n.tipo = 'facturacion_discrepancia' and n.origen_id = trim(both '''' from :ESPA)::uuid) = :N_ADM,
  '31.C8 · la discrepancia avisa una vez a cada administrador activo, aunque se notifique dos veces');
select pg_temp.assert(
  (select n.titulo = 'Factura distinta en el programa'
          and n.detalle = 'Los datos de una factura del programa de facturación ya no coinciden con los copiados. Revísala en el programa.'
     from public.notificaciones n
    where n.tipo = 'facturacion_discrepancia' and n.origen_id = trim(both '''' from :ESPA)::uuid limit 1),
  '31.C9 · el aviso de discrepancia es el texto fijo y no nombra al paciente');

-- C · discrepancia SIN espejo (R2-H1): la base rechazó la copia (aquí, una factura con IRPF: base 100,
-- IVA 21, total 106) y el sincronizador avisa igual. BORRG es propio de este bloque: tiene envío
-- (DOC-G) y ni espejo ni borrado sin aprobar, para que el rechazo sea el del check y no el del borrado
-- (DOC-E lo tiene desde D, y con él C11 pasaba por el motivo equivocado).
\set BORRG '\'a0260001-0000-4000-8000-000000000007\''
call pg_temp.reset_sesion();
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values (:BORRG, :P1, :PRO1, :PRO1);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRG, :PRO1, 100.00, timestamptz '2026-10-01 10:00:07+00', 'Ana Uno', :CA),
  '31.fij · la versión 1 de BORRG se sella');
select format('%L', v.id) as "VERG" from public.borradores_factura_versiones v
 where v.borrador_id = :BORRG and v.numero_version = 1 \gset
call pg_temp.como(:ADM);
select public.encolar_envio_borrador(:BORRG) as "EVG_ID" \gset
call pg_temp.reset_sesion();
set local role service_role;
select count(*) as "RECL_G" from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRG \gset
select public.registrar_envio_borrador(:'EVG_ID', 'holded', 'DOC-G', 1::smallint, :VERG, current_date);
reset role;
select pg_temp.assert(:RECL_G = 1
  and (select count(*) from public.facturas_anotaciones a where a.borrador_id = :BORRG) = 0,
  '31.C11.fij · BORRG tiene envío (DOC-G) y ninguna anotación');

set local role service_role;
select pg_temp.assert_lanza_codigo_msg(
  'select public.registrar_factura_espejo(''holded'', ''DOC-G'', ''F-G'', current_date, 10000, 2100, 10600, ''https://programa.example/doc/G'')',
  '23514', 'facturas_espejo_check', '31.C11 · la factura con retención (base + cuota ≠ total) no se copia: la rechaza el check, sin espejo');
select public.notificar_discrepancia_facturacion('holded', 'DOC-G');
select public.notificar_discrepancia_facturacion('holded', 'DOC-G');
reset role;
select pg_temp.assert(
  (select count(*) from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-G') = 0
  and (select count(*) from public.notificaciones n
        where n.tipo = 'facturacion_discrepancia' and n.origen_tabla = 'borradores_factura_envios'
          and n.origen_id = (select s.id from public.borradores_factura_envios s where s.proveedor_documento_id = 'DOC-G')) = :N_ADM
  and (select count(distinct n.perfil_id) from public.notificaciones n
        where n.tipo = 'facturacion_discrepancia' and n.origen_tabla = 'borradores_factura_envios'
          and n.origen_id = (select s.id from public.borradores_factura_envios s where s.proveedor_documento_id = 'DOC-G')) = :N_ADM,
  '31.C12 · sin espejo, el aviso cuelga del envío: una vez por administrador activo aunque se notifique dos veces');
select pg_temp.assert(
  (select n.titulo = 'Factura que no se pudo copiar'
          and n.detalle = 'Una factura del programa de facturación no se pudo copiar porque sus datos no encajan. Revísala en el programa.'
     from public.notificaciones n
    where n.tipo = 'facturacion_discrepancia' and n.origen_tabla = 'borradores_factura_envios' limit 1),
  '31.C13 · el aviso sin espejo es texto fijo y no nombra al paciente');
set local role service_role;
select pg_temp.assert_lanza_codigo_msg(
  'select public.notificar_discrepancia_facturacion(''holded'', ''DOC-X'')',
  '23503', 'No hay envío para ese documento', '31.C14 · avisar de un documento sin envío ni espejo da 23503');
reset role;

set local role service_role;
select public.avanzar_cursor_sincronizacion(timestamptz '2026-10-01 12:00:00+00');
select public.avanzar_cursor_sincronizacion(timestamptz '2026-10-01 09:00:00+00');
reset role;
select pg_temp.assert(
  (select a.sincronizado_hasta = timestamptz '2026-10-01 12:00:00+00' from public.facturacion_ajuste a),
  '31.C10 · el cursor solo avanza (greatest): un valor anterior no lo retrasa');

-- =========================================================================================
-- F · Lectura por rol, con gemelas (se cuentan solo los ids de la fijación)
-- =========================================================================================
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.borradores_factura_envios where borrador_id = %L', :BORRA)) = 1
  and pg_temp.contar(format('select 1 from public.borradores_factura_envios where borrador_id = %L', :BORRB)) = 0
  and pg_temp.contar(format('select 1 from public.facturas_espejo where borrador_id = %L', :BORRA)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo where borrador_id = %L', :BORRB)) = 0
  and pg_temp.contar(format('select 1 from public.facturas_anotaciones where borrador_id = %L', :BORRA)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_anotaciones where borrador_id = %L', :BORRB)) = 0,
  '31.F1 · PRO1 lee 1 envío, 1 espejo y 1 anotación de BORRA y ninguno de BORRB');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.borradores_factura_envios where borrador_id = %L', :BORRA)) = 0
  and pg_temp.contar(format('select 1 from public.borradores_factura_envios where borrador_id = %L', :BORRB)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo where borrador_id = %L', :BORRA)) = 0
  and pg_temp.contar(format('select 1 from public.facturas_espejo where borrador_id = %L', :BORRB)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_anotaciones where borrador_id = %L', :BORRA)) = 0,
  '31.F2 · PRO2 lee lo contrario: solo los de BORRB');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.borradores_factura_envios where borrador_id in (%L, %L)', :BORRA, :BORRB)) = 2
  and pg_temp.contar(format('select 1 from public.facturas_espejo where borrador_id in (%L, %L)', :BORRA, :BORRB)) = 2
  and pg_temp.contar(format('select 1 from public.facturas_anotaciones where borrador_id = %L', :BORRA)) = 1,
  '31.F3 · ADM (la gemela) lee los dos envíos, los dos espejos y la anotación');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar('select 1 from public.borradores_factura_envios') = 0
  and pg_temp.contar('select 1 from public.facturas_espejo') = 0
  and pg_temp.contar('select 1 from public.facturas_anotaciones') = 0,
  '31.F4 · TEC1 no lee ninguna fila de las tres tablas');
call pg_temp.reset_sesion();
set local role anon;
select pg_temp.assert_lanza_codigo('select 1 from public.facturas_espejo', '42501', '31.F5 · anon no lee el espejo');
select pg_temp.assert_lanza_codigo('select 1 from public.facturas_espejo_cabecera', '42501', '31.F5 · anon no lee la vista');
reset role;

-- =========================================================================================
-- G · La vista del técnico: se comparan los dos caminos para el mismo perfil
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id = %L', :ESPA)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id = %L', :ESPB)) = 0,
  '31.G1 · TEC1 (centro A) ve la cabecera del espejo de P1 y no la de P2 (centro B)');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id in (%L, %L)', :ESPA, :ESPB)) = 2,
  '31.G2 · ADM (la gemela) ve las dos cabeceras');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id in (%L, %L)', :ESPA, :ESPB)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id in (%L, %L)', :ESPA, :ESPB))
    = pg_temp.contar(format('select 1 from public.facturas_espejo where id in (%L, %L)', :ESPA, :ESPB)),
  '31.G3 · PRO1: la vista y la tabla con la RLS de la cabecera dan lo mismo, y es solo el suyo');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id in (%L, %L)', :ESPA, :ESPB)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id in (%L, %L)', :ESPA, :ESPB))
    = pg_temp.contar(format('select 1 from public.facturas_espejo where id in (%L, %L)', :ESPA, :ESPB)),
  '31.G4 · PRO2: la vista y la tabla dan lo mismo, y es solo el suyo');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id in (%L, %L)', :ESPA, :ESPB)) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id = %L', :ESPB)) = 1,
  '31.G5 · TEC2 (centro B) ve solo la cabecera de su centro: la rama del técnico filtra por centros_actuales()');
call pg_temp.reset_sesion();

-- =========================================================================================
-- H · Cobros con espejo: fecha = current_date − 1 (T-023 no se adelanta), registrado_por = el propio
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id) values (%L, 10.00, current_date - 1, ''efectivo'', %L, %L)', :P2, :ADM, :ESPA),
  '23514', 'de otro paciente', '31.H1 · ADM: un cobro de P2 con el espejo de BORRA da 23514');
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id) values (%L, 10.00, current_date - 1, ''efectivo'', %L, gen_random_uuid())', :P1, :ADM),
  '23503', 'la factura del cobro no existe', '31.H3 · ADM: un espejo inexistente da 23503');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id) values (%L, 10.00, current_date - 1, ''efectivo'', %L, %L)', :P1, :TEC1, :ESPB),
  '23514', 'de otro paciente', '31.H2 · TEC1: un cobro de P1 (su centro) con el espejo de BORRB da 23514');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(format(
  'insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id) values (%L, 10.00, current_date - 1, ''efectivo'', %L, gen_random_uuid())', :P1, :PRO2),
  '42501', 'No puedes registrar este cobro', '31.H4 · PRO2: un cobro de un paciente ajeno con un espejo inexistente da 42501, no 23503');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(format(
  'insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id) values (%L, 10.00, current_date - 1, ''efectivo'', %L, %L)', :P1, :ADM, :ESPA),
  '31.H5 · la gemela: ADM registra el cobro de P1 con el espejo de BORRA');
select pg_temp.assert_no_lanza(format(
  'insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por) values (%L, 10.00, current_date - 1, ''efectivo'', %L)', :P1, :ADM),
  '31.H6 · un cobro sin factura sigue entrando (factura_espejo_id nulo no valida)');
call pg_temp.reset_sesion();

-- =========================================================================================
-- I · Encolar: permisos primero, mismo texto para ajeno e inexistente
-- =========================================================================================
call pg_temp.como(:PRO2);
select pg_temp.resultado_de(format('select public.encolar_envio_borrador(%L)', :BORRA)) as "R_AJENO" \gset
select pg_temp.resultado_de('select public.encolar_envio_borrador(gen_random_uuid())') as "R_INEXISTENTE" \gset
call pg_temp.reset_sesion();
select pg_temp.assert(:'R_AJENO' = :'R_INEXISTENTE' and :'R_AJENO' like '42501:No puedes preparar este borrador en el programa%',
  '31.I1 · PRO2 sobre un borrador ajeno y sobre un uuid inexistente: el mismo 42501, comparado por igualdad');
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.resultado_de('select public.encolar_envio_borrador(gen_random_uuid())') = :'R_AJENO',
  '31.I2 · ADM sobre un uuid inexistente recibe ese mismo 42501 (no hay oráculo de existencia)');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(format('select public.encolar_envio_borrador(%L)', :BORRC), '42501',
  '31.I3 · TEC1 no prepara borradores');
call pg_temp.reset_sesion();

-- Sin programa conectado: 23514; después se vuelve a conectar (la clave centinela de L).
call pg_temp.como(:ADM);
select public.quitar_proveedor_facturacion();
select pg_temp.assert_lanza_codigo_msg(format('select public.encolar_envio_borrador(%L)', :BORRC),
  '23514', 'no hay programa', '31.I4 · sin programa conectado, encolar da 23514');
select public.guardar_clave_proveedor_facturacion('holded', 'SENTINELA_T026_xxxxxxxxxxxxxxxxabcd');
-- BORRD tiene la última versión descartada.
select pg_temp.assert_lanza_codigo_msg(format('select public.encolar_envio_borrador(%L)', :BORRD),
  '23514', 'se pueda preparar', '31.I5 · un borrador con la última versión descartada no se prepara');
call pg_temp.reset_sesion();

-- =========================================================================================
-- K · Estados (columnas de T-021) y la cadena de BORRC
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 'sin_enviar'
  and (select v.ultima_version from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 1
  and (select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRD) = 'descartado'
  and (select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRA) = 'facturado'
  and (select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRE) = 'enviado',
  '31.K1 · sin_enviar, descartado, facturado (BORRA) y enviado (BORRE) por su situación real');
call pg_temp.reset_sesion();

-- I · PRO1 (autor y asignado) prepara BORRC; dos veces da el mismo evento.
call pg_temp.como(:PRO1);
select public.encolar_envio_borrador(:BORRC) as "EVC1" \gset
select public.encolar_envio_borrador(:BORRC) as "EVC2" \gset
select pg_temp.assert((select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 'en_cola',
  '31.K2 · tras preparar, BORRC está en_cola');
call pg_temp.reset_sesion();
select pg_temp.assert(:'EVC1' = :'EVC2'
    and (select count(*) from public.eventos_salientes e where e.clave_idempotencia = 'facturacion.enviar_borrador:' || :BORRC) = 1,
  '31.I6 · preparar dos veces da el mismo evento_id y un solo evento (PRO1, autor y asignado)');
select pg_temp.assert(
  (select e.creado_por = :PRO1::uuid and e.proximo_intento is not null from public.eventos_salientes e where e.id = :'EVC1'),
  '31.I7 · creado_por y proximo_intento los pone la función');
call pg_temp.como(:TEC1);
select pg_temp.assert((select count(*) from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 0,
  '31.K3 · TEC1 no ve el estado de ningún borrador (la cabecera le da 0 filas)');
call pg_temp.reset_sesion();

-- =========================================================================================
-- J · Congelación
-- =========================================================================================
select pg_temp.sql_version_simple(:BORRA, :PRO1, 61.00, timestamptz '2026-10-01 10:00:07+00', 'Ana Uno', :CA) as "SQL_J1" \gset
select pg_temp.assert_lanza_codigo_msg(:'SQL_J1', '23514', 'ya se preparó en el programa',
  '31.J1 · una versión nueva de BORRA, ya enviado, da 23514 incluso como postgres');
select pg_temp.sql_version_simple(:BORRC, :PRO1, 51.00, timestamptz '2026-10-01 10:00:08+00', 'Ana Uno', :CA) as "SQL_J2" \gset
select pg_temp.assert_lanza_codigo_msg(:'SQL_J2', '23514', 'ya se preparó en el programa',
  '31.J2 · una versión nueva de BORRC con el evento pendiente da 23514');
select pg_temp.sql_version_simple(:BORRA, :PRO2, 61.00, timestamptz '2026-10-01 10:00:09+00', 'Ana Uno', :CA) as "SQL_J3" \gset
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(:'SQL_J3', '42501', 'No puedes añadir una versión a este borrador',
  '31.J3 · PRO2 añadiendo una versión a BORRA recibe el 42501 del sellado, no el 23514 de la congelación');
call pg_temp.reset_sesion();

-- J · un borrador que el programa borró sin aprobar (BORRE, con su anotación) no queda enviado para
-- siempre: admite una versión DESCARTADA que lo cierra. Una versión viva sigue rechazada, y la gemela
-- sin anotación de borrado (BORRA, solo rectificado) también rechaza la descartada.
select pg_temp.sql_version_simple(:BORRE, :PRO1, 31.00, timestamptz '2026-10-01 10:00:11+00', 'Ana Uno', :CA) as "SQL_J5" \gset
select pg_temp.assert_lanza_codigo_msg(:'SQL_J5', '23514', 'ya se preparó en el programa',
  '31.J5 · BORRE (borrado sin aprobar): una versión viva sigue dando 23514');
select pg_temp.sql_version_simple(:BORRA, :PRO1, 61.00, timestamptz '2026-10-01 10:00:12+00', 'Ana Uno', :CA, true) as "SQL_J6" \gset
select pg_temp.assert_lanza_codigo_msg(:'SQL_J6', '23514', 'ya se preparó en el programa',
  '31.J6 · la gemela: BORRA (sin borrado sin aprobar) rechaza también una versión descartada');
select pg_temp.sql_version_simple(:BORRE, :PRO1, 30.00, timestamptz '2026-10-01 10:00:13+00', 'Ana Uno', :CA, true) as "SQL_J7" \gset
select pg_temp.assert_no_lanza(:'SQL_J7', '31.J7 · BORRE (borrado sin aprobar) admite una versión descartada que lo cierra');
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRE) = 'descartado'
  and (select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRA) = 'facturado',
  '31.K11 · BORRE sale descartado tras cerrarse; BORRA, facturado');
call pg_temp.reset_sesion();

-- =========================================================================================
-- N · Reclamo, concesión, retroceso, intento 8, descartado y la cadena de estados de BORRC (K)
-- =========================================================================================
-- BORRD tiene la última versión descartada: su evento (metido a mano, porque encolar lo rechaza)
-- debe pasar a fallido con 'descartado' en el reclamo y no devolverse.
insert into public.eventos_salientes (tipo, carga, clave_idempotencia, proximo_intento)
  values ('facturacion.enviar_borrador', jsonb_build_object('borrador_id', :BORRD::uuid),
          'facturacion.enviar_borrador:' || :BORRD, now());

set local role service_role;
select count(*) filter (where r.borrador_id = :BORRC) as "RECL_C",
       count(*) filter (where r.borrador_id = :BORRD) as "RECL_D",
       (array_agg(r.lineas::text) filter (where r.borrador_id = :BORRC))[1] as "LIN_C",
       (array_agg(r.destinatario_nombre) filter (where r.borrador_id = :BORRC))[1] as "NOM_C",
       coalesce((array_agg(r.ya_enviado_documento_id) filter (where r.borrador_id = :BORRC))[1], '') as "YA_C"
  from public.reclamar_envios_facturacion(10) r \gset
select count(*) as "RECL_C2" from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRC \gset
reset role;
select pg_temp.assert(:RECL_C = 1 and :RECL_D = 0,
  '31.N1 · el reclamo devuelve el evento de BORRC y no el de BORRD (descartado)');
select pg_temp.assert(:RECL_C2 = 0,
  '31.N2 · un segundo reclamo inmediato devuelve 0: la concesión de cinco minutos');
select pg_temp.assert(
  (select array_agg(k order by k) from json_object_keys((:'LIN_C'::jsonb -> 0)::json) k)
    = array['cantidad', 'precio_unitario_centimos', 'regimen_iva', 'tipo_iva_centesimas']
  and :'NOM_C' = 'Ana Uno' and :'YA_C' = '',
  '31.N3 · las líneas reclamadas llevan solo cantidad, precio, régimen y tipo (ni concepto ni cita_id)');
select pg_temp.assert(
  (select e.estado = 'fallido' and e.ultimo_error = 'descartado'
     from public.eventos_salientes e where e.clave_idempotencia = 'facturacion.enviar_borrador:' || :BORRD),
  '31.N4 · el evento de un borrador descartado pasa a fallido con el código descartado');
select pg_temp.assert(
  (select e.intentos = 1 and e.proximo_intento > now() + interval '4 minutes'
     from public.eventos_salientes e where e.id = :'EVC1'),
  '31.N5 · el reclamo suma un intento y concede cinco minutos');

-- Retroceso: el fallo transitorio crece con los intentos.
set local role service_role;
select public.registrar_fallo_envio_facturacion(:'EVC1', 'red', false);
reset role;
select (e.proximo_intento - now())::text as "BACK1" from public.eventos_salientes e where e.id = :'EVC1' \gset
select pg_temp.assert(
  (select e.estado = 'pendiente' and e.ultimo_error = 'red' from public.eventos_salientes e where e.id = :'EVC1'),
  '31.N6 · un fallo transitorio deja el evento pendiente con solo el código');
update public.eventos_salientes set proximo_intento = now() - interval '1 second' where id = :'EVC1';
set local role service_role;
select count(*) as "RECL_C3" from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRC \gset
select public.registrar_fallo_envio_facturacion(:'EVC1', 'red', false);
reset role;
select (e.proximo_intento - now())::text as "BACK2" from public.eventos_salientes e where e.id = :'EVC1' \gset
select pg_temp.assert(:RECL_C3 = 1 and :'BACK2'::interval > :'BACK1'::interval,
  '31.N7 · el segundo fallo espera más que el primero (retroceso exponencial)');

-- Códigos fuera de la lista cerrada: 22023.
set local role service_role;
select pg_temp.assert_lanza_codigo(format('select public.registrar_fallo_envio_facturacion(%L, ''Authorization: Bearer abc'', false)', :'EVC1'),
  '22023', '31.N8 · un código de fallo libre (que podría llevar una clave) da 22023');
reset role;

-- Fallo permanente: fallido y un aviso por administrador activo, sin duplicar.
set local role service_role;
select public.registrar_fallo_envio_facturacion(:'EVC1', 'rechazado', true);
select public.registrar_fallo_envio_facturacion(:'EVC1', 'rechazado', true);
reset role;
select pg_temp.assert(
  (select e.estado = 'fallido' and e.ultimo_error = 'rechazado' from public.eventos_salientes e where e.id = :'EVC1')
  and (select count(*) from public.notificaciones n
        where n.tipo = 'facturacion_envio_fallido' and n.origen_tabla = 'borradores_factura' and n.origen_id = :BORRC::uuid) = :N_ADM,
  '31.N9 · el fallo permanente deja el evento fallido y avisa una vez a cada administrador activo');
select pg_temp.assert(
  (select n.detalle = 'No se pudo preparar el borrador en el programa de facturación.'
     from public.notificaciones n
    where n.tipo = 'facturacion_envio_fallido' and n.origen_id = :BORRC::uuid limit 1),
  '31.N10 · el texto del aviso es fijo y no nombra al paciente ni lleva el código del proveedor');
call pg_temp.como(:ADM);
select pg_temp.assert((select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 'fallido',
  '31.K4 · con el evento fallido, el estado es fallido');
call pg_temp.reset_sesion();

-- J · con el evento fallido la congelación deja pasar una versión nueva.
select pg_temp.sql_version_simple(:BORRC, :PRO1, 52.00, timestamptz '2026-10-01 10:00:10+00', 'Ana Uno', :CA) as "SQL_J4" \gset
select pg_temp.assert_no_lanza(:'SQL_J4', '31.J4 · con el envío fallido, BORRC admite una versión nueva');

-- I · re-encolar un fallido lo deja pendiente, con cero intentos y sin error.
call pg_temp.como(:PRO1);
select public.encolar_envio_borrador(:BORRC) as "EVC3" \gset
select pg_temp.assert((select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 'en_cola',
  '31.K5 · re-encolado, BORRC vuelve a en_cola');
call pg_temp.reset_sesion();
select pg_temp.assert(:'EVC3' = :'EVC1'
    and (select e.estado = 'pendiente' and e.intentos = 0 and e.ultimo_error is null
           from public.eventos_salientes e where e.id = :'EVC1'),
  '31.I8 · re-encolar un fallido: el mismo evento, pendiente, intentos = 0 y sin error');

-- Intento 8: a los ocho intentos transitorios pasa a fallido.
update public.eventos_salientes set intentos = 7, proximo_intento = now() - interval '1 second' where id = :'EVC1';
set local role service_role;
select count(*) as "RECL_C4" from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRC \gset
select public.registrar_fallo_envio_facturacion(:'EVC1', 'red', false);
reset role;
select pg_temp.assert(:RECL_C4 = 1
    and (select e.estado = 'fallido' and e.intentos = 8 from public.eventos_salientes e where e.id = :'EVC1'),
  '31.N11 · el octavo intento transitorio deja el evento fallido');
-- N11 · el segundo fallo permanente del MISMO borrador, tras reabrirlo a mano (I8), vuelve a avisar: el
-- aviso de la primera vez (N9) tenía origen = el borrador, y sin un origen nuevo `on conflict do nothing`
-- lo descartaba en silencio. El mismo fallo repetido, en cambio, no duplica.
set local role service_role;
select public.registrar_fallo_envio_facturacion(:'EVC1', 'red', false);
select public.registrar_fallo_envio_facturacion(:'EVC1', 'red', false);
reset role;
select pg_temp.assert(
  (select count(*) from public.notificaciones n
    where n.tipo = 'facturacion_envio_fallido' and n.origen_tabla = 'borradores_factura'
      and n.origen_id in (:BORRC::uuid, md5(:BORRC::text || ':1')::uuid)) = 2 * :N_ADM
  and (select count(distinct n.origen_id) from public.notificaciones n
        where n.tipo = 'facturacion_envio_fallido' and n.origen_tabla = 'borradores_factura'
          and n.origen_id in (:BORRC::uuid, md5(:BORRC::text || ':1')::uuid)) = 2
  and (select count(*) from public.notificaciones n
        where n.tipo = 'facturacion_envio_fallido' and n.origen_id = md5(:BORRC::text || ':1')::uuid
          and n.detalle = 'No se pudo preparar el borrador en el programa de facturación.') = :N_ADM,
  '31.N11b · el segundo fallo permanente tras reabrir avisa otra vez a cada administrador, y repetido no duplica');

-- K · el fallido «ambiguo» se distingue en la vista (la pantalla pide comprobar antes de reintentar).
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select v.estado = 'fallido' and v.envio_ambiguo is false
     from public.borradores_factura_estado v where v.borrador_id = :BORRC),
  '31.K8 · un fallido por red no es ambiguo');
call pg_temp.reset_sesion();
set local role service_role;
select public.registrar_fallo_envio_facturacion(:'EVC1', 'ambiguo', true);
reset role;
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select v.estado = 'fallido' and v.envio_ambiguo is true
     from public.borradores_factura_estado v where v.borrador_id = :BORRC),
  '31.K9 · un fallido con el código ambiguo sale con envio_ambiguo = true');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert(
  (select count(*) from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 0,
  '31.K10 · TEC1 sigue sin ver el estado, ambiguo o no');
call pg_temp.reset_sesion();

-- Y otra vez a la cola; ahora llega a enviado y a facturado.
call pg_temp.como(:ADM);
select public.encolar_envio_borrador(:BORRC);
call pg_temp.reset_sesion();
set local role service_role;
select r.version_id as "VERC", r.numero_version as "NUMC"
  from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRC \gset
reset role;
select pg_temp.assert(:NUMC = 2, '31.N12 · el reclamo toma la última versión no descartada (la 2)');
set local role service_role;
select public.registrar_envio_borrador(:'EVC1', 'holded', 'DOC-C', 1::smallint, :'VERC', current_date);
reset role;
call pg_temp.como(:ADM);
select pg_temp.assert((select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 'enviado',
  '31.K6 · con el envío registrado, BORRC está enviado');
call pg_temp.reset_sesion();
set local role service_role;
select public.registrar_factura_espejo('holded', 'DOC-C', 'F-2026-0003', current_date, 5200, 0, 5200, 'https://programa.example/doc/C');
reset role;
call pg_temp.como(:ADM);
select pg_temp.assert((select v.estado from public.borradores_factura_estado v where v.borrador_id = :BORRC) = 'facturado',
  '31.K7 · con el espejo copiado, BORRC está facturado');
call pg_temp.reset_sesion();

-- =========================================================================================
-- L · Vault: la clave solo la gestiona el administrador y nunca se devuelve
-- =========================================================================================
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  'select public.guardar_clave_proveedor_facturacion(''holded'', ''SENTINELA_T026_yyyyyyyyyyyyyyyyzzzz'')', '42501',
  '31.L1 · TEC1 no guarda la clave');
select pg_temp.assert_lanza_codigo('select public.quitar_proveedor_facturacion()', '42501', '31.L2 · TEC1 no quita el proveedor');
select pg_temp.assert_lanza_codigo('select * from public.estado_clave_proveedor_facturacion()', '42501', '31.L3 · TEC1 no lee el estado');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  'select public.guardar_clave_proveedor_facturacion(''holded'', ''SENTINELA_T026_yyyyyyyyyyyyyyyyzzzz'')', '42501',
  '31.L4 · PRO1 no guarda la clave');
select pg_temp.assert_lanza_codigo('select public.quitar_proveedor_facturacion()', '42501', '31.L5 · PRO1 no quita el proveedor');
select pg_temp.assert_lanza_codigo('select * from public.estado_clave_proveedor_facturacion()', '42501', '31.L6 · PRO1 no lee el estado');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  'select public.guardar_clave_proveedor_facturacion(''holded'', ''corta'')', '22023', 'formato válido',
  '31.L7 · una clave corta se rechaza antes de tocar el Vault');
select public.guardar_clave_proveedor_facturacion('holded', 'SENTINELA_T026_' || repeat('x', 16) || 'abcd');
select pg_temp.assert((select e.ultimos4 from public.estado_clave_proveedor_facturacion() e) = '••••abcd',
  '31.L8 · el estado solo enseña los cuatro últimos caracteres');
select pg_temp.assert_lanza_codigo('select 1 from public.facturacion_ajuste', '42501',
  '31.L9 · el ajuste no es legible para authenticated');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from vault.secrets s where s.name = 'proveedor_facturacion_clave') = 1,
  '31.L10 · la clave vive en el Vault');
set local role service_role;
select public.clave_proveedor_facturacion() as "CLAVE_LEIDA" \gset
reset role;
select pg_temp.assert(:'CLAVE_LEIDA' = 'SENTINELA_T026_' || repeat('x', 16) || 'abcd',
  '31.L11 · el consumidor recupera la clave por la función de servicio');

-- =========================================================================================
-- O · La lectura del espejo sigue al profesional ASIGNADO al paciente, no al autor del borrador (D17)
-- =========================================================================================
-- BORRF: borrador de P1 escrito por PRO1, que entonces es su profesional. Cuando el espejo ya existe,
-- P1 pasa a PRO2 (como en 12): PRO1 queda como autor no asignado y PRO2 como asignado no autor. Las dos
-- reglas dan resultados opuestos; en BORRA y BORRB (autor = asignado) no se distinguen.
call pg_temp.reset_sesion();
\set BORRF '\'a0260001-0000-4000-8000-000000000006\''
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values (:BORRF, :P1, :PRO1, :PRO1);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRF, :PRO1, 20.00, timestamptz '2026-10-01 10:00:14+00', 'Ana Uno', :CA),
  '31.O0 · la versión 1 de BORRF se sella');
select format('%L', v.id) as "VERF" from public.borradores_factura_versiones v
 where v.borrador_id = :BORRF and v.numero_version = 1 \gset
call pg_temp.como(:ADM);
select public.encolar_envio_borrador(:BORRF) as "EVF" \gset
call pg_temp.reset_sesion();
set local role service_role;
select count(*) as "RECL_F" from public.reclamar_envios_facturacion(10) r where r.borrador_id = :BORRF \gset
select public.registrar_envio_borrador(:'EVF', 'holded', 'DOC-F', 1::smallint, :VERF, current_date);
select public.registrar_factura_espejo('holded', 'DOC-F', 'F-2026-0006', current_date, 2000, 0, 2000, 'https://programa.example/doc/F') as "ESPF" \gset
reset role;
select pg_temp.assert(:RECL_F = 1, '31.O1 · BORRF se reclama y llega a espejo por las funciones');
call pg_temp.como(:ADM);
update public.pacientes set profesional_id = :PRO2 where id = :P1;
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id = %L', :'ESPF')) = 1
  and pg_temp.contar(format('select 1 from public.facturas_espejo where id = %L', :'ESPF')) = 1,
  '31.O2 · PRO2 (asignado a P1, no autor de BORRF) ve la cabecera y el espejo de BORRF');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.facturas_espejo_cabecera where id = %L', :'ESPF')) = 0
  and pg_temp.contar(format('select 1 from public.facturas_espejo where id = %L', :'ESPF')) = 0,
  '31.O3 · PRO1 (autor de BORRF, ya no asignado a P1) no ve ni la cabecera ni el espejo');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
update public.pacientes set profesional_id = :PRO1 where id = :P1;
call pg_temp.reset_sesion();

-- =========================================================================================
-- M · Auditoría: una fila INSERT por fila fijada y ninguna con la clave
-- =========================================================================================
select pg_temp.assert(
  (select count(*) from public.auditoria a where a.tabla = 'facturas_espejo' and a.operacion = 'INSERT'
      and a.registro_id = trim(both '''' from :ESPA)) = 1
  and (select count(*) from public.auditoria a join public.borradores_factura_envios s on s.id::text = a.registro_id
        where a.tabla = 'borradores_factura_envios' and a.operacion = 'INSERT' and s.borrador_id = :BORRA) = 1
  and (select count(*) from public.auditoria a join public.facturas_anotaciones n on n.id::text = a.registro_id
        where a.tabla = 'facturas_anotaciones' and a.operacion = 'INSERT' and n.borrador_id = :BORRA) = 1
  and (select count(*) from public.auditoria a where a.tabla = 'facturacion_ajuste' and a.operacion in ('INSERT', 'UPDATE')) >= 1,
  '31.M1 · cada fila de las tres tablas y el ajuste dejaron su fila de auditoría');
select pg_temp.assert(
  (select count(*) from public.auditoria a
    where a.estado_posterior::text like '%SENTINELA_T026_%' or a.estado_anterior::text like '%SENTINELA_T026_%'
       or a.estado_posterior::text like '%claveFijacionT026a0001%') = 0,
  '31.M2 · ninguna fila de auditoría contiene la clave del proveedor');

-- Quitar el proveedor borra el secreto del Vault.
call pg_temp.como(:ADM);
select public.quitar_proveedor_facturacion();
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from vault.secrets s where s.name = 'proveedor_facturacion_clave') = 0
  and (select a.proveedor is null and a.secreto_id is null from public.facturacion_ajuste a),
  '31.L12 · quitar el proveedor borra la clave del Vault y deja el ajuste vacío');

\echo '31-proveedor-facturacion: completo.'
