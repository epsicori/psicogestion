-- T-023b · Cobros contra una factura del espejo (ADR-053 g, ADR-077). Diseño: `tickets/T-023b/diseno.md`.
--
-- Qué prueba, por bloques (el fichero los recorre en este orden; K va antes que J porque J gasta el saldo de ESPB):
--   A · forma: columnas, not null, restricción única, privilegios de columna, vista invoker, funciones.
--   B · solo adición: update/delete/truncate fallan para authenticated, service_role y postgres (con el
--       privilegio devuelto, el disparador); `cobertura_solo_adicion()` en cero.
--   C · mismo paciente.  D · un cobro, una factura (por registro y por asignación).
--   E · permisos antes que el cotejo: mismo texto para cobro ajeno e inexistente, y gemelas por rol.
--   F · columnas del llamante.  G · nulos (23502).  H · lectura única (`cobros_por_factura`).
--   I · el pendiente no se mueve.  K · listado y filtros.  J · devoluciones y su cota.
--   L · cobros asignables y auditoría.
--
-- Ids propios con prefijo `a023b001-`. ESPA/ESPB vienen de la fijación de T-026a (`01`), COB1 ya está
-- asignado a ESPA por `01` (sin esa fila, `10-solo-adicion` no tendría con qué probar la capa 2).
-- fecha-relativa: las fechas de los cobros son `current_date - 1`; T-023 rechaza el futuro.

\echo ''
\echo '=== 33-cobros-facturas ==='

\set CF01 '\'a023b001-0000-4000-8000-000000000001\''
\set CF02 '\'a023b001-0000-4000-8000-000000000002\''
\set CF03 '\'a023b001-0000-4000-8000-000000000003\''
\set CF04 '\'a023b001-0000-4000-8000-000000000004\''
\set CF05 '\'a023b001-0000-4000-8000-000000000005\''
\set CF06 '\'a023b001-0000-4000-8000-000000000006\''
\set CF07 '\'a023b001-0000-4000-8000-000000000007\''
\set CF08 '\'a023b001-0000-4000-8000-000000000008\''
\set CF09 '\'a023b001-0000-4000-8000-000000000009\''
\set CF10 '\'a023b001-0000-4000-8000-000000000010\''
\set CF11 '\'a023b001-0000-4000-8000-000000000011\''
\set CF12 '\'a023b001-0000-4000-8000-000000000012\''
\set CF13 '\'a023b001-0000-4000-8000-000000000013\''
\set CF14 '\'a023b001-0000-4000-8000-000000000014\''
\set CF15 '\'a023b001-0000-4000-8000-000000000015\''
\set CF16 '\'a023b001-0000-4000-8000-000000000016\''
\set CF17 '\'a023b001-0000-4000-8000-000000000017\''
\set CF18 '\'a023b001-0000-4000-8000-000000000018\''

-- El resultado de una sentencia como «SQLSTATE:mensaje», o 'NO LANZA'.
create or replace function pg_temp.resultado_de_33(consulta text) returns text
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

-- Un insert en cobros_facturas, como texto.
create or replace function pg_temp.asignar_33(p_cobro text, p_factura text) returns text
language sql
as $$ select format('insert into public.cobros_facturas (cobro_id, factura_espejo_id) values (%L, %L)', p_cobro, p_factura) $$;

-- Un cobro, como texto (registrado_por = quien se dice).
create or replace function pg_temp.cobro_33(p_id text, p_paciente text, p_importe numeric, p_registrador text,
                                            p_forma text default 'efectivo', p_factura text default null,
                                            p_motivo text default null) returns text
language sql
as $$ select format('insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id, motivo) values (%L, %L, %s, current_date - 1, %L, %L, %L, %L)',
                    p_id, p_paciente, p_importe, p_forma, p_registrador, p_factura, p_motivo) $$;

-- ESPA y ESPB ya los dejó la fijación; se recuperan por si el módulo 31 no corrió antes.
call pg_temp.reset_sesion();
select format('%L', e.id) as "ESPA" from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-A' \gset
select format('%L', e.id) as "ESPB" from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-B' \gset

-- Cobros sueltos de partida, como postgres (el dato no es lo que se prueba; las inserciones que sí lo son van en sesión).
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF01, :P2, 11.00, :ADM), '33 · CF01 (P2, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF02, :P1, 12.00, :ADM), '33 · CF02 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF04, :P1, 14.00, :ADM), '33 · CF04 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF05, :P1, 15.00, :ADM), '33 · CF05 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF06, :P1, 16.00, :ADM), '33 · CF06 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF07, :P1, 17.00, :ADM), '33 · CF07 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF08, :P1, 18.00, :ADM), '33 · CF08 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF09, :P1, 19.00, :ADM), '33 · CF09 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF10, :P1, 20.00, :ADM), '33 · CF10 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF11, :P1, 21.00, :ADM), '33 · CF11 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF12, :P1, 22.00, :ADM), '33 · CF12 (P1, suelto)');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF13, :P1, 23.00, :ADM, 'bizum'), '33 · CF13 (P1, bizum, suelto)');

-- =========================================================================================
-- A · Forma
-- =========================================================================================
select pg_temp.assert(
  (select count(*) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'cobros_facturas'
      and c.column_name in ('id', 'cobro_id', 'factura_espejo_id', 'creada_por', 'creada_en')
      and c.is_nullable = 'NO') = 5
  and (select count(*) from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = 'cobros_facturas') = 5,
  '33.A1 · cobros_facturas tiene cinco columnas y las cinco son NOT NULL');
select pg_temp.assert(
  exists (select 1 from pg_constraint k where k.conrelid = 'public.cobros_facturas'::regclass
             and k.conname = 'cobros_facturas_cobro_unico' and k.contype = 'u'),
  '33.A2 · cobros_facturas_cobro_unico existe y es única');
select pg_temp.assert(
  has_column_privilege('authenticated', 'public.cobros_facturas', 'cobro_id', 'insert')
  and has_column_privilege('authenticated', 'public.cobros_facturas', 'factura_espejo_id', 'insert')
  and not has_column_privilege('authenticated', 'public.cobros_facturas', 'id', 'insert')
  and not has_column_privilege('authenticated', 'public.cobros_facturas', 'creada_por', 'insert')
  and not has_column_privilege('authenticated', 'public.cobros_facturas', 'creada_en', 'insert'),
  '33.A3 · authenticated solo inserta cobro_id y factura_espejo_id (ni id, ni creada_por, ni creada_en)');
select pg_temp.assert(
  (select bool_and(not has_table_privilege(r, 'public.cobros_facturas', p))
     from unnest(array['authenticated', 'anon', 'service_role']) r,
          unnest(array['update', 'delete', 'truncate', 'references', 'trigger']) p)
  and not has_table_privilege('anon', 'public.cobros_facturas', 'select')
  and not has_table_privilege('service_role', 'public.cobros_facturas', 'select')
  and not has_table_privilege('anon', 'public.cobros_facturas', 'insert')
  and not has_table_privilege('service_role', 'public.cobros_facturas', 'insert')
  and has_table_privilege('authenticated', 'public.cobros_facturas', 'select')
  and not has_table_privilege('postgres', 'public.cobros_facturas', 'update')
  and not has_table_privilege('postgres', 'public.cobros_facturas', 'delete')
  and not has_table_privilege('postgres', 'public.cobros_facturas', 'truncate'),
  '33.A4 · nadie tiene update/delete/truncate/references/trigger; anon y service_role sin select ni insert');
select pg_temp.assert(
  (select 'security_invoker=true' = any (c.reloptions) from pg_class c where c.oid = 'public.cobros_por_factura'::regclass)
  and has_table_privilege('authenticated', 'public.cobros_por_factura', 'select')
  and not has_table_privilege('anon', 'public.cobros_por_factura', 'select')
  and not has_table_privilege('service_role', 'public.cobros_por_factura', 'select'),
  '33.A5 · cobros_por_factura es invoker; solo authenticated la lee');
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.cobros_asignables(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.cobros_asignables(uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.cobros_asignables(uuid)', 'execute')
  and has_function_privilege('authenticated',
        'public.listado_facturas_espejo(date,date,public.forma_pago,uuid,integer,integer)', 'execute')
  and not has_function_privilege('anon',
        'public.listado_facturas_espejo(date,date,public.forma_pago,uuid,integer,integer)', 'execute')
  and not has_function_privilege('service_role',
        'public.listado_facturas_espejo(date,date,public.forma_pago,uuid,integer,integer)', 'execute'),
  '33.A6 · las dos funciones de lectura: authenticated sí; anon y service_role no');
select pg_temp.assert(
  (select bool_and(not has_function_privilege(r, 'public.fn_comprobar_devolucion_en_factura(uuid,numeric)', 'execute')
               and not has_function_privilege(r, 'public.fn_validar_cobro_factura()', 'execute'))
     from unnest(array['authenticated', 'anon', 'service_role']) r)
  and has_function_privilege('postgres', 'public.fn_comprobar_devolucion_en_factura(uuid,numeric)', 'execute'),
  '33.A7 · la cota de devoluciones y el disparador: nadie salvo postgres ejecuta');
select pg_temp.assert(
  pg_get_function_arguments('public.listado_facturas_espejo(date,date,public.forma_pago,uuid,integer,integer)'::regprocedure) not like '%estado%'
  and pg_get_function_result('public.listado_facturas_espejo(date,date,public.forma_pago,uuid,integer,integer)'::regprocedure)
      !~ '(borrador_id|tipo_terapia_id|cita_id|destinatario|linea|base|cuota|estado)',
  '33.A8 · el listado no tiene parámetro de estado y no devuelve borrador, tipo, cita, destinatario, líneas, base ni cuota');
select pg_temp.assert(
  (select p.prosecdef from pg_proc p where p.oid = 'public.fn_validar_cobro_factura()'::regprocedure)
  and exists (select 1 from pg_proc p, unnest(p.proconfig) x
               where p.oid = 'public.fn_validar_cobro_factura()'::regprocedure and x like 'search_path=%')
  and not (select p.prosecdef from pg_proc p where p.oid = 'public.listado_facturas_espejo(date,date,public.forma_pago,uuid,integer,integer)'::regprocedure)
  and not (select p.prosecdef from pg_proc p where p.oid = 'public.cobros_asignables(uuid)'::regprocedure)
  and not (select p.prosecdef from pg_proc p where p.oid = 'public.fn_comprobar_devolucion_en_factura(uuid,numeric)'::regprocedure),
  '33.A9 · el disparador es definer con search_path fijado; las lecturas y la cota son invoker');
select pg_temp.assert(
  (select count(*) from pg_policies where tablename = 'cobros_facturas') = 2
  and exists (select 1 from pg_policies where tablename = 'cobros_facturas' and policyname = 'cobros_facturas_lectura' and cmd = 'SELECT')
  and exists (select 1 from pg_policies where tablename = 'cobros_facturas' and policyname = 'cobros_facturas_alta' and cmd = 'INSERT'),
  '33.A10 · cobros_facturas tiene su política de lectura y su política de alta, y ninguna más');

-- =========================================================================================
-- B · Solo adición, por las tres puertas
-- =========================================================================================
select count(*) as "N_CF_ANTES" from public.cobros_facturas \gset
do $$
declare
  v_rol text;
  v_op text;
  v_sql text;
begin
  foreach v_rol in array array['authenticated', 'service_role'] loop
    foreach v_op in array array['update', 'delete', 'truncate'] loop
      v_sql := case v_op
        when 'update' then 'update public.cobros_facturas set factura_espejo_id = factura_espejo_id'
        when 'delete' then 'delete from public.cobros_facturas'
        else 'truncate table public.cobros_facturas' end;
      execute format('set local role %I', v_rol);
      if v_rol = 'authenticated' then
        execute format('set local request.jwt.claims = %L',
          jsonb_build_object('sub', 'b0030001-0000-4000-8000-000000000001', 'role', 'authenticated')::text);
      end if;
      perform pg_temp.assert_lanza_codigo(v_sql, '42501', format('33.B1 · %s como %s: 42501', v_op, v_rol));
      reset role;
      reset request.jwt.claims;
    end loop;
  end loop;
end $$;
-- postgres con el privilegio devuelto: lo frena el disparador (capa 2); el truncado, el de sentencia (capa 3).
grant update, delete, truncate on table public.cobros_facturas to postgres;
select pg_temp.assert_lanza_codigo_msg('update public.cobros_facturas set factura_espejo_id = factura_espejo_id',
  '42501', 'es de solo adición', '33.B2 · postgres con UPDATE devuelto: el disparador de fila bloquea');
select pg_temp.assert_lanza_codigo_msg('delete from public.cobros_facturas',
  '42501', 'es de solo adición', '33.B3 · postgres con DELETE devuelto: el disparador de fila bloquea');
select pg_temp.assert_lanza_codigo_msg('truncate table public.cobros_facturas',
  '42501', 'es de solo adición', '33.B4 · TRUNCATE: el disparador de sentencia bloquea');
revoke update, delete, truncate on table public.cobros_facturas from postgres;
select pg_temp.assert((select count(*) from public.cobertura_solo_adicion()) = 0,
  '33.B5 · cobertura_solo_adicion() devuelve 0 filas');
select pg_temp.assert((select count(*) from public.cobros_facturas) = :N_CF_ANTES,
  '33.B6 · las puertas cerradas no cambiaron el número de filas');
select pg_temp.assert(
  exists (select 1 from public.tablas_solo_adicion t where t.tabla = 'cobros_facturas'),
  '33.B7 · cobros_facturas está en el catálogo de solo adición');

-- =========================================================================================
-- C · Mismo paciente
-- =========================================================================================
select count(*) as "N_CF_C" from public.cobros_facturas \gset
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF01, :ESPA), '23514', 'la factura asignada es de otro paciente',
  '33.C1 · ADM: un cobro de P2 a la factura de P1 da 23514');
call pg_temp.reset_sesion();
select pg_temp.assert((select count(*) from public.cobros_facturas) = :N_CF_C
  and not exists (select 1 from public.cobros_facturas a where a.cobro_id = :CF01),
  '33.C2 · y no deja fila');
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF02, :ESPA), '33.C3 · gemela: un cobro de P1 a la factura de P1 entra');
call pg_temp.reset_sesion();

-- =========================================================================================
-- D · Un cobro, una factura
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF03, :P1, 13.00, :ADM, 'efectivo', :ESPA),
  '33.D0 · ADM registra el cobro CF03 de P1 ya enlazado a ESPA (vía T-026a)');
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF03, :ESPA), '23514', 'el cobro ya está enlazado',
  '33.D1 · asignar un cobro que se registró con factura_espejo_id da 23514 (no 23505)');
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:COB1, :ESPA), '23514', 'el cobro ya está enlazado',
  '33.D2 · COB1, asignado en la fijación, asignado otra vez a la misma factura: 23514 del disparador (no 23505)');
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:COB1, :ESPB), '23514', 'la factura asignada es de otro paciente',
  '33.D3 · COB1 a la factura de P2: gana el cotejo de paciente (paso 3 antes que el 4)');
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF02, :ESPA), '23514', 'el cobro ya está enlazado',
  '33.D4 · CF02, asignado en C3, asignado otra vez: 23514');
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF04, :ESPA), '33.D5 · gemela: un cobro suelto de P1 entra');
call pg_temp.reset_sesion();

-- =========================================================================================
-- E · Permisos antes que el cotejo
-- =========================================================================================
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF05, gen_random_uuid()::text), '42501', 'No puedes asignar este cobro',
  '33.E1 · PRO2: cobro de P1 y factura inexistente → 42501, no 23503');
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF05, :ESPB), '42501', 'No puedes asignar este cobro',
  '33.E2 · PRO2: cobro de P1 y la factura de P2 (la suya) → 42501, no 23514');
select pg_temp.resultado_de_33(pg_temp.asignar_33(:CF05, gen_random_uuid()::text)) as "R_E1" \gset
select pg_temp.resultado_de_33(pg_temp.asignar_33(:CF05, :ESPB)) as "R_E2" \gset
call pg_temp.reset_sesion();
call pg_temp.como(:TEC2);
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF05, :ESPA), '42501', 'No puedes asignar este cobro',
  '33.E3 · TEC2 (centro B): un cobro de P1 (centro A) → 42501');
select pg_temp.resultado_de_33(pg_temp.asignar_33(:CF05, :ESPA)) as "R_E3" \gset
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(gen_random_uuid()::text, :ESPA), '42501', 'No puedes asignar este cobro',
  '33.E4 · ADM: un cobro inexistente → 42501 (el mismo rechazo que un cobro ajeno)');
select pg_temp.resultado_de_33(pg_temp.asignar_33(gen_random_uuid()::text, :ESPA)) as "R_E4" \gset
call pg_temp.reset_sesion();
select pg_temp.assert(
  :'R_E1' = :'R_E2' and :'R_E2' = :'R_E3' and :'R_E3' = :'R_E4' and :'R_E1' like '42501:No puedes asignar%',
  '33.E5 · los cuatro rechazos tienen el mismo SQLSTATE y el mismo mensaje: sin oráculo de existencia');

set local role anon;
select pg_temp.assert_lanza_codigo(pg_temp.asignar_33(:CF05, :ESPA), '42501', '33.E6 · anon no inserta (privilegio)');
reset role;
set local role service_role;
select pg_temp.assert_lanza_codigo(pg_temp.asignar_33(:CF05, :ESPA), '42501', '33.E7 · service_role no inserta (privilegio)');
reset role;

select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF05, gen_random_uuid()::text), '23503', 'la factura asignada no existe',
  '33.E8 · postgres: factura inexistente → 23503');
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(gen_random_uuid()::text, :ESPA), '23503', 'el cobro asignado no existe',
  '33.E9 · postgres: cobro inexistente → 23503');

call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF07, :ESPA), '33.E10 · gemela ADM: asigna un cobro suelto de P1');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF06, :ESPA), '33.E11 · gemela PRO1 (asignado a P1): asigna un cobro suelto de P1');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF08, :ESPA), '33.E12 · gemela TEC1 (centro A): asigna un cobro suelto de P1');
call pg_temp.reset_sesion();

-- =========================================================================================
-- F · Columnas del llamante
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(format(
  'insert into public.cobros_facturas (cobro_id, factura_espejo_id, creada_por) values (%L, %L, %L)', :CF09, :ESPA, :PRO2),
  '42501', '33.F1 · mandar creada_por: 42501');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.cobros_facturas (id, cobro_id, factura_espejo_id) values (gen_random_uuid(), %L, %L)', :CF09, :ESPA),
  '42501', '33.F2 · mandar id: 42501');
select pg_temp.assert_lanza_codigo(format(
  'insert into public.cobros_facturas (cobro_id, factura_espejo_id, creada_en) values (%L, %L, now())', :CF09, :ESPA),
  '42501', '33.F3 · mandar creada_en: 42501');
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF09, :ESPA), '33.F4 · gemela: sin ellas, entra');
call pg_temp.reset_sesion();
select pg_temp.assert(
  not exists (select 1 from public.cobros_facturas a where a.creada_por = :PRO2)
  and (select a.creada_por = :ADM and a.creada_en = now() from public.cobros_facturas a where a.cobro_id = :CF09),
  '33.F5 · creada_por es la sesión (ADM), creada_en es del servidor, y ninguna fila lleva a PRO2');

-- =========================================================================================
-- G · Nulos: los frena el NOT NULL, no el disparador
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.cobros_facturas (cobro_id, factura_espejo_id) values (null, %L)', :ESPA), '23502', 'cobro_id',
  '33.G1 · cobro_id nulo: 23502 por not null');
select pg_temp.assert_lanza_codigo_msg(
  format('insert into public.cobros_facturas (cobro_id, factura_espejo_id) values (%L, null)', :CF10), '23502', 'factura_espejo_id',
  '33.G2 · factura_espejo_id nulo: 23502 por not null');
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF10, :ESPA), '33.G3 · gemela: con los dos valores, entra');
call pg_temp.reset_sesion();

-- =========================================================================================
-- H · Lectura única
-- =========================================================================================
select pg_temp.assert(
  (select count(*) = count(distinct v.cobro_id) from public.cobros_por_factura v where v.factura_espejo_id = :ESPA)
  and (select v.via from public.cobros_por_factura v where v.cobro_id = :CF03) = 'al_registrar'
  and (select v.via from public.cobros_por_factura v where v.cobro_id = :CF09) = 'asignado'
  and (select count(*) from public.cobros_por_factura v where v.cobro_id in (:CF03, :CF09, :COB1)) = 3,
  '33.H1 · ESPA: cada cobro sale una vez, el registrado con factura (al_registrar) y el asignado (asignado)');
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select count(*) from public.listado_facturas_espejo(current_date, current_date) l, jsonb_array_elements(l.cobros) e
    where l.id = :ESPA and e ->> 'cobro_id' in (:CF03, :CF09)) = 2,
  '33.H2 · ADM: el listado trae los dos cobros (registrado y asignado) una vez cada uno');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(
  (select count(*) from public.listado_facturas_espejo(current_date, current_date) l, jsonb_array_elements(l.cobros) e
    where l.id = :ESPA and e ->> 'cobro_id' in (:CF03, :CF09)) = 2,
  '33.H3 · PRO1: lo mismo');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert(
  (select count(*) from public.listado_facturas_espejo(current_date, current_date) l, jsonb_array_elements(l.cobros) e
    where l.id = :ESPA and e ->> 'cobro_id' in (:CF03, :CF09)) = 2,
  '33.H4 · TEC1: lo mismo');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.cobros_por_factura where factura_espejo_id = %L', :ESPA)) = 0
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date, current_date) where id = %L', :ESPA)) = 0,
  '33.H5 · PRO2 no ve ningún cobro de ESPA ni la factura');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.cobros_por_factura where factura_espejo_id = %L', :ESPA)) = 0,
  '33.H6 · TEC2 no ve ningún cobro de ESPA');
call pg_temp.reset_sesion();
-- La TABLA, no la vista (S1): la vista ya esconde la fila porque hace join con `cobros`; la política de lectura
-- de `cobros_facturas` es la que impide el /rest/v1/cobros_facturas de un usuario ajeno.
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.cobros_facturas where factura_espejo_id = %L', :ESPA)) = 0
  and pg_temp.contar('select 1 from public.cobros_facturas') = 0,
  '33.H8 · PRO2 lee la TABLA cobros_facturas: 0 filas de ESPA y 0 en total');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.cobros_facturas where factura_espejo_id = %L', :ESPA)) = 0
  and pg_temp.contar('select 1 from public.cobros_facturas where cobro_id in (select id from public.cobros where paciente_id = ' || quote_literal(:P1) || ')') = 0,
  '33.H9 · TEC2 (centro B) lee la TABLA cobros_facturas: 0 filas de ESPA');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.cobros_facturas where factura_espejo_id = %L', :ESPA)) >= 1,
  '33.H10 · gemela: PRO1 (el asignado) lee la TABLA y ve las filas de ESPA');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.cobros_facturas where factura_espejo_id = %L', :ESPA)) >= 1,
  '33.H11 · gemela: TEC1 (centro A) lee la TABLA y ve las filas de ESPA');
call pg_temp.reset_sesion();
set local role anon;
select pg_temp.assert_lanza_codigo('select count(*) from public.cobros_por_factura', '42501', '33.H7 · anon no puede leer la vista');
reset role;

-- =========================================================================================
-- I · El pendiente no se mueve
-- =========================================================================================
call pg_temp.como(:ADM);
select p.pendiente_centimos as "PEND_A", p.cobrado_centimos as "COB_A", p.devengado_centimos as "DEV_A"
  from public.pendiente_paciente p where p.paciente_id = :P1 \gset
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF11, :ESPA), '33.I1 · ADM asigna CF11 a ESPA');
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF12, :ESPA), '33.I2 · ADM asigna CF12 a ESPA');
select pg_temp.assert(
  (select p.pendiente_centimos = :PEND_A and p.cobrado_centimos = :COB_A and p.devengado_centimos = :DEV_A
     from public.pendiente_paciente p where p.paciente_id = :P1),
  '33.I3 · pendiente, cobrado y devengado de P1 iguales antes y después de asignar dos cobros');
call pg_temp.reset_sesion();

-- =========================================================================================
-- K · Listado y filtros (antes que J, que gasta el saldo de ESPB)
-- =========================================================================================
select pg_temp.assert(
  (select count(*) from public.cobros_por_factura v where v.factura_espejo_id = :ESPB) = 0,
  '33.K0 · ESPB no tiene ningún cobro enlazado al empezar K');
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPA)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPB)) = 0,
  '33.K1 · TEC1 ve ESPA y no ESPB');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPA)) = 0
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPB)) = 1,
  '33.K2 · TEC2 ve ESPB y no ESPA');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPA)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPB)) = 0,
  '33.K3 · PRO1 ve ESPA');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPB)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id = %L', :ESPA)) = 0,
  '33.K4 · PRO2 ve ESPB');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date) where id in (%L, %L)', :ESPA, :ESPB)) = 2,
  '33.K5 · ADM ve las dos');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date, current_date) where id = %L', :ESPA)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date + 1, current_date + 5) where id = %L', :ESPA)) = 0
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date - 1) where id = %L', :ESPA)) = 0,
  '33.K6 · el rango incluye la fecha de expedición de ESPA en sus extremos y la excluye fuera');
select pg_temp.assert(
  pg_temp.contar('select 1 from public.listado_facturas_espejo(null, current_date)') = 0
  and pg_temp.contar('select 1 from public.listado_facturas_espejo(current_date, null)') = 0,
  '33.K7 · un extremo nulo no devuelve todo: no devuelve nada');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''efectivo'') where id = %L', :ESPA)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''bizum'') where id = %L', :ESPA)) = 0,
  '33.K8 · forma efectivo incluye ESPA (COB1); bizum la excluye mientras no tenga un cobro bizum');
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF13, :ESPA), '33.K9 · ADM asigna el cobro bizum CF13 a ESPA');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''bizum'') where id = %L', :ESPA)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''efectivo'') where id = %L', :ESPA)) = 1,
  '33.K10 · ahora bizum la incluye, y efectivo sigue incluyéndola (al menos un cobro de esa forma)');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''efectivo'') where id = %L', :ESPB)) = 0
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''bizum'') where id = %L', :ESPB)) = 0
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, ''tarjeta'') where id = %L', :ESPB)) = 0,
  '33.K11 · ESPB, sin cobros, no sale con ninguna forma de pago');
select pg_temp.assert(
  pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, null, %L) where id = %L', :PRO2, :ESPB)) = 1
  and pg_temp.contar(format('select 1 from public.listado_facturas_espejo(current_date - 5, current_date, null, %L) where id = %L', :PRO2, :ESPA)) = 0,
  '33.K12 · p_profesional_id = PRO2 como ADM: solo ESPB');
select pg_temp.assert(
  (select count(*) from public.listado_facturas_espejo(current_date - 5, current_date, null, null, 1000, 0)) <= 100
  and (select count(*) from public.listado_facturas_espejo(current_date - 5, current_date, null, null, 1, 0)) = 1
  and (select max(l.total_filas) from public.listado_facturas_espejo(current_date - 5, current_date, null, null, 1, 0) l) >= 2
  and (select count(*) from public.listado_facturas_espejo(current_date - 5, current_date, null, null, 1000, 0))
      = (select max(l.total_filas) from public.listado_facturas_espejo(current_date - 5, current_date, null, null, 1000, 0) l),
  '33.K13 · p_limite se topa a 100 y total_filas es el total filtrado, no el de la página');
select pg_temp.assert(
  (select l.cobros_sin_factura from public.listado_facturas_espejo(current_date - 5, current_date) l where l.id = :ESPA)
    = (select count(*) from public.cobros c where c.paciente_id = :P1
        and not exists (select 1 from public.cobros_por_factura v where v.cobro_id = c.id)),
  '33.K14 · cobros_sin_factura es el número de cobros de P1 que no están en ninguna factura');
call pg_temp.reset_sesion();

-- =========================================================================================
-- J · Devoluciones y su cota (sobre ESPB, sin cobros hasta aquí)
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.cobro_33(:CF14, :P2, -0.01, :ADM, 'efectivo', :ESPB, 'devolución de prueba'), '23514', 'la devolución supera lo cobrado',
  '33.J1 · registrar una devolución contra una factura sin cobros: 23514');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF15, :P2, 50.00, :ADM, 'efectivo', :ESPB), '33.J2 · registra +50,00 contra ESPB');
call pg_temp.reset_sesion();
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF16, :P2, -50.01, :ADM, 'efectivo', null, 'devolución de prueba'),
  '33.J3 · una devolución suelta de −50,01 (sin factura) entra en cobros');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF17, :P2, -50.00, :ADM, 'efectivo', null, 'devolución de prueba'),
  '33.J4 · una devolución suelta de −50,00 entra en cobros');
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(pg_temp.asignar_33(:CF16, :ESPB), '23514', 'la devolución supera lo cobrado',
  '33.J5 · asignar la de −50,01 a ESPB (+50,00): deja la suma en −0,01: 23514');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.cobro_33(:CF18, :P2, -50.01, :ADM, 'efectivo', :ESPB, 'devolución de prueba'), '23514', 'la devolución supera lo cobrado',
  '33.J6 · registrar −50,01 contra ESPB con factura: 23514 (la otra vía, misma cota)');
select pg_temp.assert_no_lanza(pg_temp.asignar_33(:CF17, :ESPB), '33.J7 · gemela: asignar la de −50,00 deja la suma en 0 y entra');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.cobro_33(:CF18, :P2, -0.01, :ADM, 'efectivo', :ESPB, 'devolución de prueba'), '23514', 'la devolución supera lo cobrado',
  '33.J8 · con la suma en 0, ni un céntimo más de devolución');
select pg_temp.assert_no_lanza(pg_temp.cobro_33(:CF18, :P2, 5.00, :ADM, 'efectivo', :ESPB),
  '33.J9 · un cobro positivo contra la factura entra siempre');
call pg_temp.reset_sesion();
select pg_temp.assert((select sum(v.importe) from public.cobros_por_factura v where v.factura_espejo_id = :ESPB) = 5.00,
  '33.J10 · la suma enlazada a ESPB es 5,00 (nunca bajó de 0)');

-- =========================================================================================
-- L · Asignables y auditoría
-- =========================================================================================
call pg_temp.como(:ADM);
select pg_temp.assert(
  (select count(*) from public.cobros_asignables(:ESPA) a) >= 1
  and not exists (select 1 from public.cobros_asignables(:ESPA) a join public.cobros_por_factura v on v.cobro_id = a.cobro_id)
  and not exists (select 1 from public.cobros_asignables(:ESPA) a join public.cobros c on c.id = a.cobro_id where c.paciente_id <> :P1),
  '33.L1 · cobros_asignables(ESPA) como ADM: solo cobros sueltos de P1');
select pg_temp.assert(exists (select 1 from public.cobros_asignables(:ESPA) a where a.cobro_id = :CF05)
  and not exists (select 1 from public.cobros_asignables(:ESPA) a where a.cobro_id = :CF09),
  '33.L2 · CF05 (suelto: los rechazos no dejaron fila) se ofrece y CF09 (ya asignado) no');
call pg_temp.reset_sesion();
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros_asignables(%L)', :ESPA)) = 0,
  '33.L3 · PRO2 no obtiene ningún cobro asignable de una factura que no ve');
call pg_temp.reset_sesion();
call pg_temp.como(:TEC2);
select pg_temp.assert(pg_temp.contar(format('select 1 from public.cobros_asignables(%L)', :ESPA)) = 0,
  '33.L4 · TEC2 tampoco');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.auditoria a join public.cobros_facturas f on f.id::text = a.registro_id
    where a.tabla = 'cobros_facturas' and a.operacion = 'INSERT') = (select count(*) from public.cobros_facturas),
  '33.L5 · cada fila de cobros_facturas dejó su INSERT en auditoria');

call pg_temp.reset_sesion();
