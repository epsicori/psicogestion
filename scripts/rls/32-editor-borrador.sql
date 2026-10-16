-- T-046 · El editor del borrador de factura (tickets/T-046/diseno.md, §1.1 y §1.2).
--
-- Prueba la migración 20261015120000_editor_borrador.sql:
--   A · catálogo: el disparador `validar_citas_version_borrador` corre DESPUÉS de los tres
--       `sellar_*` (permisos y congelación antes que cualquier lectura de citas), y su función es
--       definer con `search_path` vacío
--   B · quién ejecuta: las dos RPC solo `authenticated`; la función del disparador, nadie
--   C · crear como PRO1 con el sobre JCS: versión 1 y cadena verificada
--   D · CA7: si la versión falla, la cabecera tampoco queda
--   E · las citas de las líneas (P-D1a, P-D1b, D4 y la duplicidad), cada negativa con su fragmento,
--       también por insert directo, y sus gemelas; la exención de `postgres`
--   F · permisos antes que cotejo: el técnico y PRO2 reciben 42501, nunca el mensaje de la cita
--   G · conflicto (CA3): un sobre con numero_version obsoleto da 23514
--   H · congelado (CA4): con el evento pendiente, ni corrección ni descarte; con fallido, entra
--   R · el administrador reasigna al paciente con un borrador vivo: la cabecera sigue mandando, el
--       administrador corrige con la cita del profesional de la cabecera y descarta; ni el de antes
--       ni el de ahora añaden (revisión H1)
--   N · el NIF parcial da 22023
--   V · los seis vectores de lib/economico/vectores-borrador.json: byte a byte frente al ayudante
--       JCS del banco, iguales como jsonb a `pg_temp.sobre_borrador()` y con la huella congelada
--
-- Reutiliza los actores de 01-fijacion.sql (ADM, PRO1 de CA, PRO2 de CB, TEC1 de CA, CA, CB) y el
-- programa conectado que deja allí. Fijación propia, ids con el prefijo 32320000-.
-- ANCLA (README, punto 10, regla 2): primer lunes de abril de año + 12 (`lunes_32` = D). Las citas
-- de PRO1 van de D+1 a D+13, una por día; la de PRO2, en D+1.

\echo ''
\echo '=== 32-editor-borrador ==='

\set P32    '\'32320000-0000-4000-8000-000000000001\''
\set P32X   '\'32320000-0000-4000-8000-000000000002\''
\set P32R   '\'32320000-0000-4000-8000-000000000003\''
\set T32    '\'32320000-0000-4000-8000-000000000010\''
\set TAR32  '\'32320000-0000-4000-8000-000000000011\''
\set BONO32 '\'32320000-0000-4000-8000-000000000012\''
\set BC     '\'32320000-0000-4000-8000-000000000301\''
\set BD     '\'32320000-0000-4000-8000-000000000302\''
\set BE1    '\'32320000-0000-4000-8000-000000000303\''
\set BE2    '\'32320000-0000-4000-8000-000000000304\''
\set BE3    '\'32320000-0000-4000-8000-000000000305\''
\set BE4    '\'32320000-0000-4000-8000-000000000306\''
\set BE5    '\'32320000-0000-4000-8000-000000000307\''
\set BEX    '\'32320000-0000-4000-8000-000000000308\''
\set BF     '\'32320000-0000-4000-8000-000000000309\''
\set BH     '\'32320000-0000-4000-8000-00000000030a\''
\set BR     '\'32320000-0000-4000-8000-00000000030b\''
\set CINEX  '\'32320000-0000-4000-8000-0000000003ff\''

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------
select (extract(year from now())::int + 12) as anio_32 \gset
-- Primer lunes de abril del año + 12.
select (make_date(:anio_32, 4, 1) + ((8 - extract(isodow from make_date(:anio_32, 4, 1))::int) % 7))::text
  as lunes_32 \gset

insert into public.tipos_terapia (id, nombre, tarifa_base) values (:T32, 'Terapia T-046', 60.00);

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P32,  'Paz', 'T046 Borrador', :PRO1, :CA),
  (:P32X, 'Otto', 'T046 Otro', :PRO1, :CA),
  (:P32R, 'Rita', 'T046 Reasignada', :PRO1, :CA);

insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por) values
  (:TAR32, :P32, :T32, 70.00, 'exento_sanitario', :'lunes_32'::date, :ADM);

insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por) values
  (:BONO32, :P32, 5, 250.00, null, :ADM);

-- Una cita de 50 minutos (ids 32320000-…-0000000001NN), `programada` al nacer.
create function pg_temp.id_cita32(p_n int)
returns uuid
language sql
as $$ select ('32320000-0000-4000-8000-' || lpad((100 + p_n)::text, 12, '0'))::uuid $$;

create function pg_temp.cita32(p_n int, p_pac uuid, p_pro uuid, p_centro uuid, p_dia date, p_bono uuid default null)
returns void
language sql
as $$
  insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, bono_id)
  values (pg_temp.id_cita32(p_n), p_pac, p_pro, p_centro, '32320000-0000-4000-8000-000000000010'::uuid,
          (p_dia + time '10:00') at time zone 'Europe/Madrid',
          (p_dia + time '10:50') at time zone 'Europe/Madrid',
          'Europe/Madrid', p_bono);
$$;

select pg_temp.cita32(1,  :P32,  :PRO1, :CA, :'lunes_32'::date + 1);            -- C1 realizada
select pg_temp.cita32(2,  :P32,  :PRO1, :CA, :'lunes_32'::date + 2);            -- C2 realizada
select pg_temp.cita32(3,  :P32,  :PRO1, :CA, :'lunes_32'::date + 3);            -- C3 programada
select pg_temp.cita32(4,  :P32,  :PRO1, :CA, :'lunes_32'::date + 4);            -- C4 cancelada
select pg_temp.cita32(5,  :P32,  :PRO1, :CA, :'lunes_32'::date + 5);            -- C5 no_asistida
select pg_temp.cita32(6,  :P32,  :PRO2, :CB, :'lunes_32'::date + 1);            -- C6 realizada de PRO2
select pg_temp.cita32(7,  :P32,  :PRO1, :CA, :'lunes_32'::date + 6, :BONO32);   -- C7 realizada con bono
select pg_temp.cita32(8,  :P32X, :PRO1, :CA, :'lunes_32'::date + 7);            -- C8 realizada de otro paciente
select pg_temp.cita32(9,  :P32,  :PRO1, :CA, :'lunes_32'::date + 8);            -- C9 realizada, luego a bono
select pg_temp.cita32(10, :P32,  :PRO1, :CA, :'lunes_32'::date + 9);            -- C10 realizada, en dos borradores
select pg_temp.cita32(11, :P32,  :PRO1, :CA, :'lunes_32'::date + 10);           -- C11 realizada (vector 4)
select pg_temp.cita32(12, :P32,  :PRO1, :CA, :'lunes_32'::date + 11);           -- C12 realizada (vector 4)
select pg_temp.cita32(13, :P32,  :PRO1, :CA, :'lunes_32'::date + 12);           -- C13 realizada (crear)
select pg_temp.cita32(14, :P32R, :PRO1, :CA, :'lunes_32'::date + 13);           -- C14 realizada (R)

update public.citas set estado = 'realizada'
 where id in (pg_temp.id_cita32(1), pg_temp.id_cita32(2), pg_temp.id_cita32(6), pg_temp.id_cita32(7),
              pg_temp.id_cita32(8), pg_temp.id_cita32(9), pg_temp.id_cita32(10), pg_temp.id_cita32(11),
              pg_temp.id_cita32(12), pg_temp.id_cita32(13), pg_temp.id_cita32(14));
update public.citas set estado = 'cancelada' where id = pg_temp.id_cita32(4);
update public.citas set estado = 'no_asistida' where id = pg_temp.id_cita32(5);

select pg_temp.assert(
  (select array_agg(c.estado::text order by c.id) from public.citas c
    where c.id in (pg_temp.id_cita32(1), pg_temp.id_cita32(3), pg_temp.id_cita32(4), pg_temp.id_cita32(5),
                   pg_temp.id_cita32(6), pg_temp.id_cita32(7)))
    = array['realizada', 'programada', 'cancelada', 'no_asistida', 'realizada', 'realizada'],
  '32.fij · los estados de las citas de P32 son los de la fijación');

-- El sobre canónico con las líneas en JCS (ADR-035): la misma firma que `pg_temp.sobre_borrador()`,
-- más el paciente y el profesional opcionales para cuando la cabecera aún no existe (crear). Las
-- líneas van con las seis claves en orden alfabético y sin espacios, como las escribe `canonizar()`.
-- `sobre_borrador()` las escribe como jsonb (con espacios y claves por longitud): por eso el banco
-- trae su propio ayudante y `00-ayudantes.sql` no se toca (T-046, P1).
create function pg_temp.lineas_jcs(p_lineas jsonb)
returns text
language sql
immutable
as $$
  select '[' || coalesce(string_agg(
    '{"cantidad":' || (l ->> 'cantidad') ||
    ',"cita_id":' || coalesce(to_json(l ->> 'cita_id')::text, 'null') ||
    ',"concepto":' || to_json(l ->> 'concepto')::text ||
    ',"precio_unitario_centimos":' || (l ->> 'precio_unitario_centimos') ||
    ',"regimen_iva":' || to_json(l ->> 'regimen_iva')::text ||
    ',"tipo_iva_centesimas":' || (l ->> 'tipo_iva_centesimas') || '}',
    ',' order by o), '') || ']'
  from jsonb_array_elements(p_lineas) with ordinality as e(l, o);
$$;

create function pg_temp.sobre_borrador_jcs(
  p_borrador_id          uuid,
  p_creada_por           uuid,
  p_creada_en            timestamptz,
  p_lineas               jsonb,
  p_base                 numeric,
  p_cuota_iva            numeric,
  p_total                numeric,
  p_destinatario_nombre  text default 'Destinatario de prueba',
  p_centro_id            uuid default null,
  p_descartado           boolean default false,
  p_nif_cifrado          bytea default null,
  p_nif_nonce            bytea default null,
  p_nif_etiqueta         bytea default null,
  p_numero_version       integer default null,
  p_paciente_id          uuid default null,
  p_profesional_id       uuid default null
) returns text
language sql
stable
as $$
  select
    '{' ||
    '"base_centimos":' || ((p_base * 100)::bigint)::text || ',' ||
    '"borrador_id":"' || lower(p_borrador_id::text) || '",' ||
    '"centro_id":' || coalesce(to_json(p_centro_id::text)::text, 'null') || ',' ||
    '"creada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"creada_por":"' || lower(p_creada_por::text) || '",' ||
    '"cuota_iva_centimos":' || ((p_cuota_iva * 100)::bigint)::text || ',' ||
    '"descartado":' || p_descartado::text || ',' ||
    '"destinatario_nif":' || case when p_nif_cifrado is null then 'null' else
      '{"cifrado":' || to_json(translate(encode(p_nif_cifrado, 'base64'), E'\n', ''))::text ||
      ',"clave_version":1' ||
      ',"etiqueta":' || to_json(translate(encode(p_nif_etiqueta, 'base64'), E'\n', ''))::text ||
      ',"nonce":' || to_json(translate(encode(p_nif_nonce, 'base64'), E'\n', ''))::text || '}' end || ',' ||
    '"destinatario_nombre":' || to_json(p_destinatario_nombre)::text || ',' ||
    '"esquema_version":1,' ||
    '"lineas":' || pg_temp.lineas_jcs(p_lineas) || ',' ||
    '"numero_version":' || coalesce(p_numero_version,
        (select coalesce(max(v.numero_version), 0) + 1 from public.borradores_factura_versiones v
          where v.borrador_id = p_borrador_id))::text || ',' ||
    '"paciente_id":' || coalesce(to_json(coalesce(p_paciente_id,
        (select b.paciente_id from public.borradores_factura b where b.id = p_borrador_id))::text)::text, 'null') || ',' ||
    '"profesional_id":' || coalesce(to_json(coalesce(p_profesional_id,
        (select b.profesional_id from public.borradores_factura b where b.id = p_borrador_id))::text)::text, 'null') || ',' ||
    '"total_centimos":' || ((p_total * 100)::bigint)::text ||
    '}';
$$;

-- Una línea exenta de sesión (60,00) con su cita, o libre si la cita es null.
create function pg_temp.linea32(p_cita uuid, p_precio integer default 6000)
returns jsonb
language sql
immutable
as $$ select pg_temp.linea_borrador('Sesión T-046', 1, p_precio, 'exento_sanitario', 0, p_cita) $$;

-- Las líneas exentas de una lista de citas (null = línea libre).
create function pg_temp.lineas32(p_citas uuid[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(pg_temp.linea32(c) order by o), '[]'::jsonb)
  from unnest(p_citas) with ordinality as u(c, o);
$$;

-- La suma de las líneas, en céntimos.
create function pg_temp.suma32(p_lineas jsonb)
returns bigint
language sql
immutable
as $$
  select coalesce(sum((l ->> 'cantidad')::bigint * (l ->> 'precio_unitario_centimos')::bigint), 0)::bigint
  from jsonb_array_elements(p_lineas) l;
$$;

-- El texto de una llamada a `crear_borrador` con el sobre coherente (exento: cuota 0). Se genera
-- como postgres, ANTES de cambiar de sesión, y se ejecuta después bajo la sesión que toque.
-- `p_total` sustituye al total de verdad (en el sobre y en el parámetro) para 32.D.
create function pg_temp.sql_crear32(p_borrador uuid, p_paciente uuid, p_profesional uuid, p_por uuid,
                                    p_lineas jsonb, p_total bigint default null)
returns text
language sql
stable
as $$
  select format(
    'select public.crear_borrador(%L, %L, %L, %L, %L, null, null, null, %L::jsonb, %s, 0, %s, %L, %L)',
    p_borrador, p_paciente, p_profesional, 'c0030001-0000-4000-8000-00000000000a', 'Destinatario T-046',
    p_lineas::text, coalesce(p_total, pg_temp.suma32(p_lineas)), coalesce(p_total, pg_temp.suma32(p_lineas)),
    now(),
    pg_temp.sobre_borrador_jcs(p_borrador, p_por, now(), p_lineas,
      coalesce(p_total, pg_temp.suma32(p_lineas)) / 100.0, 0, coalesce(p_total, pg_temp.suma32(p_lineas)) / 100.0,
      'Destinatario T-046', 'c0030001-0000-4000-8000-00000000000a'::uuid, false, null, null, null, 1,
      p_paciente, p_profesional));
$$;

-- El texto de una llamada a `anadir_version_borrador`. `p_numero` fuerza el numero_version del
-- sobre (32.G); por defecto, el máximo + 1 que asignará la base.
create function pg_temp.sql_anadir32(p_borrador uuid, p_por uuid, p_lineas jsonb,
                                     p_descartado boolean default false, p_numero integer default null)
returns text
language sql
stable
as $$
  select format(
    'select public.anadir_version_borrador(%L, %L, %L, %L, null, null, null, %L::jsonb, %s, 0, %s, %L, %L)',
    p_borrador, p_descartado, 'c0030001-0000-4000-8000-00000000000a', 'Destinatario T-046',
    p_lineas::text, pg_temp.suma32(p_lineas), pg_temp.suma32(p_lineas), now(),
    pg_temp.sobre_borrador_jcs(p_borrador, p_por, now(), p_lineas,
      pg_temp.suma32(p_lineas) / 100.0, 0, pg_temp.suma32(p_lineas) / 100.0,
      'Destinatario T-046', 'c0030001-0000-4000-8000-00000000000a'::uuid, p_descartado, null, null, null, p_numero));
$$;

-- El mismo dato por la otra puerta: el INSERT directo en la tabla (el grant de tabla entera, H5).
create function pg_temp.sql_insert32(p_borrador uuid, p_por uuid, p_lineas jsonb)
returns text
language sql
stable
as $$
  select format(
    'insert into public.borradores_factura_versiones (borrador_id, algoritmo_version, contenido_canonico, '
    'centro_id, destinatario_nombre, lineas, base, cuota_iva, total, descartado, creada_por, creada_en) '
    'values (%L, 1, %L, %L, %L, %L::jsonb, %s, 0, %s, false, %L, %L)',
    p_borrador,
    pg_temp.sobre_borrador_jcs(p_borrador, p_por, now(), p_lineas,
      pg_temp.suma32(p_lineas) / 100.0, 0, pg_temp.suma32(p_lineas) / 100.0,
      'Destinatario T-046', 'c0030001-0000-4000-8000-00000000000a'::uuid),
    'c0030001-0000-4000-8000-00000000000a', 'Destinatario T-046', p_lineas::text,
    pg_temp.suma32(p_lineas) / 100.0, pg_temp.suma32(p_lineas) / 100.0, p_por, now());
$$;

-- Cuántas versiones tiene un borrador (como postgres).
create function pg_temp.versiones32(p_borrador uuid)
returns bigint
language sql
stable
as $$ select count(*) from public.borradores_factura_versiones v where v.borrador_id = p_borrador $$;

-- =========================================================================================
-- A · Catálogo
-- =========================================================================================
select pg_temp.assert(
  (select array_agg(t.tgname::text order by t.tgname)
     from pg_trigger t
    where t.tgrelid = 'public.borradores_factura_versiones'::regclass
      and not t.tgisinternal
      and (t.tgtype & 2) = 2    -- before
      and (t.tgtype & 4) = 4    -- insert
      and (t.tgtype & 1) = 1)   -- for each row
    = array['sellar_version_borrador', 'sellar_version_borrador_cotas', 'sellar_version_borrador_tras_envio',
            'validar_citas_version_borrador'],
  '32.A1 · los before insert de las versiones son los tres sellar_* y DESPUÉS validar_citas_version_borrador');
select pg_temp.assert(
  (select p.prosecdef and p.proconfig = array['search_path=""'] and p.provolatile = 'v'
     from pg_proc p where p.oid = 'public.fn_validar_citas_version_borrador()'::regprocedure),
  '32.A2 · fn_validar_citas_version_borrador es definer, volatile y con search_path vacío');
select pg_temp.assert(
  (select bool_and(not p.prosecdef and p.proconfig = array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.anadir_version_borrador(uuid, boolean, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)'::regprocedure,
                    'public.crear_borrador(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)'::regprocedure)),
  '32.A3 · crear_borrador y anadir_version_borrador son invoker con search_path vacío');
select pg_temp.assert(
  (select count(*) from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name in ('borradores_factura', 'borradores_factura_versiones')
      and g.grantee in ('authenticated', 'anon') and g.privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')) = 0,
  '32.A4 · ni update, ni delete, ni truncate sobre la cabecera ni las versiones para authenticated o anon');

-- =========================================================================================
-- B · Quién ejecuta
-- =========================================================================================
select pg_temp.assert(
  (select bool_and(has_function_privilege('authenticated', f, 'execute')
                   and not has_function_privilege('anon', f, 'execute')
                   and not has_function_privilege('service_role', f, 'execute'))
     from unnest(array[
       'public.anadir_version_borrador(uuid, boolean, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)',
       'public.crear_borrador(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)']) f),
  '32.B1 · las dos RPC las ejecuta authenticated; anon y service_role no');
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.fn_validar_citas_version_borrador()', 'execute')
  and not has_function_privilege('anon', 'public.fn_validar_citas_version_borrador()', 'execute')
  and not has_function_privilege('service_role', 'public.fn_validar_citas_version_borrador()', 'execute'),
  '32.B2 · la función del disparador no la ejecuta nadie de la API');

-- =========================================================================================
-- C · Crear como PRO1
-- =========================================================================================
select pg_temp.sql_crear32(:BC, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(13), null])) as "SQL_C1" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_C1', '32.C1 · PRO1 crea el borrador con una sesión realizada y una línea libre');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select v.numero_version = 1 and v.creada_por = :PRO1::uuid and v.paciente_id = :P32::uuid
     from public.borradores_factura_versiones v where v.borrador_id = :BC),
  '32.C2 · la cabecera y la versión 1 quedan, de PRO1 y de P32');
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_borrador(:BC)) = 0,
  '32.C3 · verificar_cadena_borrador da 0 filas: la cadena del borrador nuevo está bien');

-- =========================================================================================
-- D · CA7: la versión falla y la cabecera no queda
-- =========================================================================================
select pg_temp.sql_crear32(:BD, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[null::uuid]), 5000) as "SQL_D1" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_D1', '23514', 'no es el total',
  '32.D1 · crear_borrador con un total que no es la suma de las líneas da el 23514 de T-021');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.borradores_factura b where b.id = :BD) = 0,
  '32.D2 · y la cabecera tampoco queda: una sola transacción');

-- =========================================================================================
-- E · Las citas de las líneas
-- =========================================================================================
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(3)])) as "SQL_E1" \gset
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(4)])) as "SQL_E2" \gset
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(5)])) as "SQL_E3" \gset
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(6)])) as "SQL_E4" \gset
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(7)])) as "SQL_E5" \gset
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1,
  pg_temp.lineas32(array[pg_temp.id_cita32(1), pg_temp.id_cita32(1)])) as "SQL_E6" \gset
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(8)])) as "SQL_E7" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_E1', '23514', 'La cita de la línea no está realizada',
  '32.E1 · una cita programada no entra (P-D1a)');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E2', '23514', 'La cita de la línea no está realizada',
  '32.E2 · una cita cancelada no entra (P-D1a)');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E3', '23514', 'La cita de la línea no está realizada',
  '32.E3 · una cita no_asistida no entra (P-D1a)');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E4', '23514', 'La cita de la línea no es del profesional del borrador',
  '32.E4 · una cita realizada de PRO2 no entra en un borrador de PRO1 (P-D1b)');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E5', '23514', 'La cita de la línea va en un bono',
  '32.E5 · una cita realizada que va en un bono no entra (D4)');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E6', '23514', 'La misma cita aparece dos veces en el borrador',
  '32.E6 · la misma cita dos veces en una versión no entra');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E7', '23514', 'La cita de una línea no existe o es de otro paciente',
  '32.E7 · la cita de otro paciente la para el sellado de T-021, antes que el disparador nuevo');
call pg_temp.reset_sesion();
select pg_temp.assert((select count(*) from public.borradores_factura b where b.id = :BEX) = 0,
  '32.E8 · ninguno de los rechazos dejó la cabecera');

-- Gemela: la realizada de PRO1 entra (BE1 con C10, BE2 con C1 y C2).
select pg_temp.sql_crear32(:BE1, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(10)])) as "SQL_E9" \gset
select pg_temp.sql_crear32(:BE2, :P32, :PRO1, :PRO1,
  pg_temp.lineas32(array[pg_temp.id_cita32(1), pg_temp.id_cita32(2)])) as "SQL_E10" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_E9', '32.E9 · gemela: una cita realizada de PRO1, sin bono y libre, entra (BE1 con C10)');
select pg_temp.assert_no_lanza(:'SQL_E10', '32.E10 · gemela: dos citas realizadas distintas entran (BE2 con C1 y C2)');
call pg_temp.reset_sesion();

-- Otro borrador vivo: C10 ya está en BE1.
select pg_temp.sql_crear32(:BEX, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(10)])) as "SQL_E11" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_E11', '23514', 'La cita ya está en otro borrador sin descartar',
  '32.E11 · una cita que ya está en otro borrador vivo no entra');
call pg_temp.reset_sesion();

-- La misma negativa por la otra puerta: cabecera de BEX como postgres e insert directo como PRO1.
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values (:BEX, :P32, :PRO1, :PRO1);
select pg_temp.sql_insert32(:BEX, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(10)])) as "SQL_E12" \gset
select pg_temp.sql_insert32(:BEX, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(3)])) as "SQL_E13" \gset
select pg_temp.sql_insert32(:BEX, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(6)])) as "SQL_E13B" \gset
select pg_temp.sql_insert32(:BEX, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(7)])) as "SQL_E13C" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_E12', '23514', 'La cita ya está en otro borrador sin descartar',
  '32.E12 · por insert directo en la tabla, la cita de otro borrador vivo tampoco entra');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E13', '23514', 'La cita de la línea no está realizada',
  '32.E13 · por insert directo, una cita programada tampoco entra');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E13B', '23514', 'La cita de la línea no es del profesional del borrador',
  '32.E13b · por insert directo, una cita de PRO2 tampoco entra');
select pg_temp.assert_lanza_codigo_msg(:'SQL_E13C', '23514', 'La cita de la línea va en un bono',
  '32.E13c · por insert directo, una cita con bono tampoco entra');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.versiones32(:BEX) = 0, '32.E14 · BEX sigue sin versiones');

-- Gemela: descartar BE1 entra, y entonces C10 entra en otro borrador.
select pg_temp.sql_anadir32(:BE1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(10)]), true) as "SQL_E15" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_E15', '32.E15 · gemela: descartar BE1 entra, aunque lleve su cita');
call pg_temp.reset_sesion();
select pg_temp.sql_insert32(:BEX, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(10)])) as "SQL_E16" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_E16', '32.E16 · gemela: con BE1 descartado, C10 entra en BEX');
call pg_temp.reset_sesion();

-- Una corrección que arrastra una cita que pasó a bono después: entra (D5). La cita nueva, no.
select pg_temp.sql_crear32(:BE3, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(9)])) as "SQL_E17" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_E17', '32.E17 · BE3 nace con C9 realizada');
call pg_temp.reset_sesion();
update public.citas set bono_id = :BONO32 where id = pg_temp.id_cita32(9);
select pg_temp.sql_anadir32(:BE3, :PRO1,
  jsonb_build_array(pg_temp.linea32(pg_temp.id_cita32(9), 6500))) as "SQL_E18" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_E18', '32.E18 · gemela: la corrección de BE3 arrastra C9, ya en bono, y entra');
call pg_temp.reset_sesion();
-- Tras un descarte, la cita que sigue ya no se arrastra: se comprueba como nueva.
select pg_temp.sql_anadir32(:BE3, :PRO1, jsonb_build_array(pg_temp.linea32(pg_temp.id_cita32(9), 6500)), true) as "SQL_E19" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_E19', '32.E19 · descartar BE3 entra');
call pg_temp.reset_sesion();
select pg_temp.sql_anadir32(:BE3, :PRO1, jsonb_build_array(pg_temp.linea32(pg_temp.id_cita32(9), 6500))) as "SQL_E20" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_E20', '23514', 'La cita de la línea va en un bono',
  '32.E20 · tras un descarte, la cita en bono ya no se arrastra: se comprueba y no entra');
call pg_temp.reset_sesion();

-- Exención por rol (H9): como postgres, una cita programada entra.
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values (:BE4, :P32, :PRO1, :PRO1);
select pg_temp.assert_no_lanza(format(
  'insert into public.borradores_factura_versiones (borrador_id, algoritmo_version, contenido_canonico, centro_id, '
  'destinatario_nombre, lineas, base, cuota_iva, total, descartado, creada_por, creada_en) '
  'values (%L, 1, %L, %L, %L, %L::jsonb, 60.00, 0, 60.00, false, %L, %L)',
  :BE4,
  pg_temp.sobre_borrador_jcs(:BE4, :PRO1, timestamptz '2026-10-03 10:00:00+00',
    pg_temp.lineas32(array[pg_temp.id_cita32(3)]), 60.00, 0, 60.00, 'Destinatario T-046', :CA),
  :CA, 'Destinatario T-046', pg_temp.lineas32(array[pg_temp.id_cita32(3)])::text, :PRO1,
  timestamptz '2026-10-03 10:00:00+00'),
  '32.E21 · como postgres, una cita programada entra (la exención por rol del paso 6.5, H9)');

-- El administrador también crea (con su propio uid de autor) y la cita sigue la misma regla.
select pg_temp.sql_crear32(:BE5, :P32, :PRO1, :ADM, pg_temp.lineas32(array[pg_temp.id_cita32(3)])) as "SQL_E22" \gset
select pg_temp.sql_crear32(:BE5, :P32, :PRO1, :ADM, pg_temp.lineas32(array[null::uuid])) as "SQL_E23" \gset
call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo_msg(:'SQL_E22', '23514', 'La cita de la línea no está realizada',
  '32.E22 · el administrador tampoco mete una cita programada');
select pg_temp.assert_no_lanza(:'SQL_E23', '32.E23 · gemela: el administrador crea un borrador de PRO1 con una línea libre');
call pg_temp.reset_sesion();

-- =========================================================================================
-- F · Permisos antes que cotejo
-- =========================================================================================
select pg_temp.sql_crear32(:BF, :P32, :PRO1, :TEC1, pg_temp.lineas32(array[:CINEX::uuid])) as "SQL_F1" \gset
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(:'SQL_F1', '42501',
  '32.F1 · el técnico con una cita inexistente recibe 42501, no el mensaje de la cita');
call pg_temp.reset_sesion();
select pg_temp.sql_crear32(:BF, :P32, :PRO1, :PRO2, pg_temp.lineas32(array[:CINEX::uuid])) as "SQL_F2" \gset
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo(:'SQL_F2', '42501',
  '32.F2 · PRO2 creando para P32 (no asignado) con una cita inexistente recibe 42501');
call pg_temp.reset_sesion();
select pg_temp.sql_anadir32(:BE2, :PRO2, pg_temp.lineas32(array[:CINEX::uuid])) as "SQL_F3" \gset
select pg_temp.sql_anadir32(:BE2, :PRO2, pg_temp.lineas32(array[pg_temp.id_cita32(6)])) as "SQL_F4" \gset
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(:'SQL_F3', '42501', 'No puedes añadir una versión a este borrador',
  '32.F3 · PRO2 añadiendo a BE2 con una cita inexistente recibe el 42501 del sellado');
select pg_temp.assert_lanza_codigo_msg(:'SQL_F4', '42501', 'No puedes añadir una versión a este borrador',
  '32.F4 · PRO2 añadiendo a BE2 con su propia cita realizada recibe el mismo 42501');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select count(*) from public.borradores_factura b where b.id = :BF) = 0 and pg_temp.versiones32(:BE2) = 1,
  '32.F5 · ni la cabecera de BF ni una versión nueva de BE2');

-- =========================================================================================
-- G · Conflicto (CA3): dos correcciones desde la misma partida
-- =========================================================================================
select pg_temp.sql_anadir32(:BE2, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(1)]), false, 2) as "SQL_G1" \gset
select pg_temp.sql_anadir32(:BE2, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(2)]), false, 2) as "SQL_G2" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_G1', '32.G1 · la primera corrección desde la versión 1 entra como versión 2');
select pg_temp.assert_lanza_codigo_msg(:'SQL_G2', '23514', 'numero_version del sobre no es el que asigna la base',
  '32.G2 · la segunda corrección desde la misma partida (sobre con versión 2) da 23514');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.versiones32(:BE2) = 2, '32.G3 · BE2 tiene dos versiones, no tres');

-- =========================================================================================
-- H · Congelado (CA4)
-- =========================================================================================
-- El módulo fija el programa conectado que necesita (31 lo desconecta al final): el administrador
-- guarda una clave ficticia, como en 01.
call pg_temp.como(:ADM);
select public.guardar_clave_proveedor_facturacion('holded', 'claveFijacionT0460001');
call pg_temp.reset_sesion();
select pg_temp.sql_crear32(:BH, :P32, :PRO1, :PRO1, pg_temp.lineas32(array[null::uuid])) as "SQL_H0" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_H0', '32.H0 · BH nace con una línea libre');
select public.encolar_envio_borrador(:BH);
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select e.estado = 'pendiente' from public.eventos_salientes e
    where e.clave_idempotencia = 'facturacion.enviar_borrador:' || :BH),
  '32.H1 · BH queda en cola (evento pendiente)');
select pg_temp.sql_anadir32(:BH, :PRO1, pg_temp.lineas32(array[null::uuid])) as "SQL_H2" \gset
select pg_temp.sql_anadir32(:BH, :PRO1, pg_temp.lineas32(array[null::uuid]), true) as "SQL_H3" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_H2', '23514', 'ya se preparó en el programa',
  '32.H2 · corregir BH en cola da 23514');
select pg_temp.assert_lanza_codigo_msg(:'SQL_H3', '23514', 'ya se preparó en el programa',
  '32.H3 · descartar BH en cola también da 23514');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.versiones32(:BH) = 1, '32.H4 · BH sigue con una versión');
update public.eventos_salientes set estado = 'fallido', ultimo_error = 'red'
 where clave_idempotencia = 'facturacion.enviar_borrador:' || :BH;
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_H2', '32.H5 · gemela: con el envío fallido, la corrección entra');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.versiones32(:BH) = 2, '32.H6 · BH tiene ahora dos versiones');

-- =========================================================================================
-- R · El administrador reasigna al paciente con un borrador vivo (revisión H1)
-- =========================================================================================
-- El borrador es de su cabecera (PRO1) aunque P32R pase a PRO2: el sobre lleva PRO1 y la cita de
-- PRO1 sigue entrando. La política de alta exige el profesional de la cabecera Y asignado: tras la
-- reasignación, solo el administrador corrige y descarta.
select pg_temp.sql_crear32(:BR, :P32R, :PRO1, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(14)])) as "SQL_R1" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'SQL_R1', '32.R1 · PRO1 crea BR para P32R con su sesión C14');
call pg_temp.reset_sesion();
call pg_temp.como(:ADM);
update public.pacientes set profesional_id = :PRO2 where id = :P32R;
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select p.profesional_id = :PRO2::uuid from public.pacientes p where p.id = :P32R)
  and (select b.profesional_id = :PRO1::uuid from public.borradores_factura b where b.id = :BR),
  '32.R2 · el administrador pasa P32R a PRO2; la cabecera de BR sigue siendo de PRO1');
select pg_temp.sql_anadir32(:BR, :PRO1, pg_temp.lineas32(array[pg_temp.id_cita32(14), null])) as "SQL_R3" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_R3', '42501', 'No puedes añadir una versión a este borrador',
  '32.R3 · PRO1, ya no asignado, no corrige BR');
call pg_temp.reset_sesion();
select pg_temp.sql_anadir32(:BR, :PRO2, pg_temp.lineas32(array[pg_temp.id_cita32(14), null])) as "SQL_R4" \gset
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo_msg(:'SQL_R4', '42501', 'No puedes añadir una versión a este borrador',
  '32.R4 · PRO2, asignado pero sin ser el de la cabecera, no corrige BR');
call pg_temp.reset_sesion();
select pg_temp.sql_anadir32(:BR, :ADM, pg_temp.lineas32(array[pg_temp.id_cita32(14), null])) as "SQL_R5" \gset
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(:'SQL_R5', '32.R5 · el administrador corrige BR con la sesión de PRO1 (sobre con PRO1)');
call pg_temp.reset_sesion();
select pg_temp.sql_anadir32(:BR, :ADM, pg_temp.lineas32(array[pg_temp.id_cita32(14), null]), true) as "SQL_R6" \gset
call pg_temp.como(:ADM);
select pg_temp.assert_no_lanza(:'SQL_R6', '32.R6 · el administrador descarta BR');
call pg_temp.reset_sesion();
select pg_temp.assert(
  pg_temp.versiones32(:BR) = 3
  and (select bool_and(v.profesional_id = :PRO1::uuid) from public.borradores_factura_versiones v where v.borrador_id = :BR)
  and (select count(*) from public.verificar_cadena_borrador(:BR)) = 0,
  '32.R7 · BR tiene tres versiones, todas de PRO1, y su cadena verifica');

-- =========================================================================================
-- N · El NIF va completo o no va
-- =========================================================================================
select replace(pg_temp.sql_anadir32(:BE2, :PRO1, pg_temp.lineas32(array[null::uuid])),
               ', null, null, null, ', ', ''QUJD'', null, null, ') as "SQL_N1" \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(:'SQL_N1', '22023', 'El NIF del destinatario va completo o no va',
  '32.N1 · el NIF con solo el cifrado da 22023');
call pg_temp.reset_sesion();

-- =========================================================================================
-- V · Los seis vectores de lib/economico/vectores-borrador.json
-- =========================================================================================
-- Cada vector: su cabecera (como postgres); el literal es igual BYTE A BYTE al ayudante JCS; es igual
-- como jsonb a `pg_temp.sobre_borrador()`; e insertado como postgres, la huella sellada es la congelada.
-- El literal y la huella los lee también `lib/economico/vectores-borrador-sql.test.ts`.
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
select ('32320000-0000-4000-8000-' || lpad((200 + n)::text, 12, '0'))::uuid, :P32, :PRO1, :PRO1
  from generate_series(1, 6) n;

create function pg_temp.vector32(p_n int, p_literal text, p_jcs text, p_jsonb text, p_huella bytea,
                                 p_nombre text, p_centro uuid, p_lineas jsonb, p_base numeric, p_cuota numeric,
                                 p_total numeric, p_descartado boolean, p_creada_en timestamptz,
                                 p_nif bytea default null, p_nonce bytea default null, p_etiqueta bytea default null)
returns void
language plpgsql
as $$
declare
  v_borrador uuid := ('32320000-0000-4000-8000-' || lpad((200 + p_n)::text, 12, '0'))::uuid;
  v_huella   bytea;
begin
  perform pg_temp.assert(p_literal = p_jcs,
    format('32.V%s · el literal es igual byte a byte a sobre_borrador_jcs()', p_n));
  perform pg_temp.assert(p_literal::jsonb = p_jsonb::jsonb,
    format('32.V%s · el literal es igual como jsonb a sobre_borrador()', p_n));
  insert into public.borradores_factura_versiones (borrador_id, algoritmo_version, contenido_canonico, centro_id,
    destinatario_nombre, destinatario_nif_cifrado, destinatario_nif_nonce, destinatario_nif_etiqueta,
    destinatario_nif_clave_version, lineas, base, cuota_iva, total, descartado, creada_por, creada_en)
  values (v_borrador, 1, p_literal, p_centro, p_nombre, p_nif, p_nonce, p_etiqueta,
          case when p_nif is null then null else 1 end, p_lineas, p_base, p_cuota, p_total, p_descartado,
          'b0030001-0000-4000-8000-000000000002'::uuid, p_creada_en)
  returning huella into v_huella;
  perform pg_temp.assert(v_huella = p_huella,
    format('32.V%s · la huella que sella la base es la congelada en el JSON', p_n));
end;
$$;

-- V1 · NFC en concepto y destinatario (e + U+0301, normalizado en la base con normalize()).
select $vec${"base_centimos":6000,"borrador_id":"32320000-0000-4000-8000-000000000201","centro_id":"c0030001-0000-4000-8000-00000000000a","creada_en":"2026-10-02T09:00:01.100Z","creada_por":"b0030001-0000-4000-8000-000000000002","cuota_iva_centimos":0,"descartado":false,"destinatario_nif":null,"destinatario_nombre":"José Pérez","esquema_version":1,"lineas":[{"cantidad":1,"cita_id":null,"concepto":"Sesión de evaluación","precio_unitario_centimos":6000,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0}],"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001","profesional_id":"b0030001-0000-4000-8000-000000000002","total_centimos":6000}$vec$ as "VEC1" \gset
select pg_temp.linea_borrador(normalize(U&'Sesio\0301n de evaluacio\0301n', NFC), 1, 6000) as "LIN1" \gset
select pg_temp.vector32(1, :'VEC1',
  pg_temp.sobre_borrador_jcs('32320000-0000-4000-8000-000000000201', :PRO1, timestamptz '2026-10-02 09:00:01.100+00',
    jsonb_build_array(:'LIN1'::jsonb), 60.00, 0, 60.00, normalize(U&'Jose\0301 Pe\0301rez', NFC), :CA),
  pg_temp.sobre_borrador('32320000-0000-4000-8000-000000000201', :PRO1, timestamptz '2026-10-02 09:00:01.100+00',
    jsonb_build_array(:'LIN1'::jsonb), 60.00, 0, 60.00, normalize(U&'Jose\0301 Pe\0301rez', NFC), :CA),
  decode('9985bcb5928ceeb788a57f542ef0e95959965e0227e47f87554ff7413856196f', 'hex'),
  normalize(U&'Jose\0301 Pe\0301rez', NFC), :CA, jsonb_build_array(:'LIN1'::jsonb), 60.00, 0, 60.00, false,
  timestamptz '2026-10-02 09:00:01.100+00');

-- V2 · NIF nulo.
select $vec${"base_centimos":6000,"borrador_id":"32320000-0000-4000-8000-000000000202","centro_id":"c0030001-0000-4000-8000-00000000000a","creada_en":"2026-10-02T09:00:02.200Z","creada_por":"b0030001-0000-4000-8000-000000000002","cuota_iva_centimos":0,"descartado":false,"destinatario_nif":null,"destinatario_nombre":"Destinatario T-046","esquema_version":1,"lineas":[{"cantidad":1,"cita_id":null,"concepto":"Sesión individual","precio_unitario_centimos":6000,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0}],"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001","profesional_id":"b0030001-0000-4000-8000-000000000002","total_centimos":6000}$vec$ as "VEC2" \gset
select jsonb_build_array(pg_temp.linea_borrador('Sesión individual', 1, 6000)) as "LIN2" \gset
select pg_temp.vector32(2, :'VEC2',
  pg_temp.sobre_borrador_jcs('32320000-0000-4000-8000-000000000202', :PRO1, timestamptz '2026-10-02 09:00:02.200+00',
    :'LIN2'::jsonb, 60.00, 0, 60.00, 'Destinatario T-046', :CA),
  pg_temp.sobre_borrador('32320000-0000-4000-8000-000000000202', :PRO1, timestamptz '2026-10-02 09:00:02.200+00',
    :'LIN2'::jsonb, 60.00, 0, 60.00, 'Destinatario T-046', :CA),
  decode('5aa98095129559a4a5bd574b3f3cbb359f852bc3c37eeeecbaa3d6b0e33f48a0', 'hex'),
  'Destinatario T-046', :CA, :'LIN2'::jsonb, 60.00, 0, 60.00, false, timestamptz '2026-10-02 09:00:02.200+00');

-- V3 · Una línea sin cita y con cantidad 2.
select $vec${"base_centimos":5000,"borrador_id":"32320000-0000-4000-8000-000000000203","centro_id":"c0030001-0000-4000-8000-00000000000a","creada_en":"2026-10-02T09:00:03.300Z","creada_por":"b0030001-0000-4000-8000-000000000002","cuota_iva_centimos":0,"descartado":false,"destinatario_nif":null,"destinatario_nombre":"Destinatario T-046","esquema_version":1,"lineas":[{"cantidad":2,"cita_id":null,"concepto":"Informe escrito","precio_unitario_centimos":2500,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0}],"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001","profesional_id":"b0030001-0000-4000-8000-000000000002","total_centimos":5000}$vec$ as "VEC3" \gset
select jsonb_build_array(pg_temp.linea_borrador('Informe escrito', 2, 2500)) as "LIN3" \gset
select pg_temp.vector32(3, :'VEC3',
  pg_temp.sobre_borrador_jcs('32320000-0000-4000-8000-000000000203', :PRO1, timestamptz '2026-10-02 09:00:03.300+00',
    :'LIN3'::jsonb, 50.00, 0, 50.00, 'Destinatario T-046', :CA),
  pg_temp.sobre_borrador('32320000-0000-4000-8000-000000000203', :PRO1, timestamptz '2026-10-02 09:00:03.300+00',
    :'LIN3'::jsonb, 50.00, 0, 50.00, 'Destinatario T-046', :CA),
  decode('e06fcbb9793778ca1d41986c929d1ce41ba8256d3cc1fd0f1690ad11e213d133', 'hex'),
  'Destinatario T-046', :CA, :'LIN3'::jsonb, 50.00, 0, 50.00, false, timestamptz '2026-10-02 09:00:03.300+00');

-- V4 · NIF presente y mezcla de exento y general, con dos citas (C11 y C12).
select $vec${"base_centimos":16000,"borrador_id":"32320000-0000-4000-8000-000000000204","centro_id":"c0030001-0000-4000-8000-00000000000a","creada_en":"2026-10-02T09:00:04.400Z","creada_por":"b0030001-0000-4000-8000-000000000002","cuota_iva_centimos":2100,"descartado":false,"destinatario_nif":{"cifrado":"Y2lmcmFkby1kZS1wcnVlYmE=","clave_version":1,"etiqueta":"CQkJCQkJCQkJCQkJCQkJCQ==","nonce":"BwcHBwcHBwcHBwcH"},"destinatario_nombre":"Destinatario T-046","esquema_version":1,"lineas":[{"cantidad":1,"cita_id":"32320000-0000-4000-8000-000000000111","concepto":"Sesión del 01/03","precio_unitario_centimos":6000,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0},{"cantidad":1,"cita_id":"32320000-0000-4000-8000-000000000112","concepto":"Sesión del 02/03","precio_unitario_centimos":12100,"regimen_iva":"general","tipo_iva_centesimas":2100}],"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001","profesional_id":"b0030001-0000-4000-8000-000000000002","total_centimos":18100}$vec$ as "VEC4" \gset
select jsonb_build_array(
  pg_temp.linea_borrador('Sesión del 01/03', 1, 6000, 'exento_sanitario', 0, pg_temp.id_cita32(11)),
  pg_temp.linea_borrador('Sesión del 02/03', 1, 12100, 'general', 2100, pg_temp.id_cita32(12))) as "LIN4" \gset
select pg_temp.vector32(4, :'VEC4',
  pg_temp.sobre_borrador_jcs('32320000-0000-4000-8000-000000000204', :PRO1, timestamptz '2026-10-02 09:00:04.400+00',
    :'LIN4'::jsonb, 160.00, 21.00, 181.00, 'Destinatario T-046', :CA, false,
    decode('Y2lmcmFkby1kZS1wcnVlYmE=', 'base64'), decode('BwcHBwcHBwcHBwcH', 'base64'),
    decode('CQkJCQkJCQkJCQkJCQkJCQ==', 'base64')),
  pg_temp.sobre_borrador('32320000-0000-4000-8000-000000000204', :PRO1, timestamptz '2026-10-02 09:00:04.400+00',
    :'LIN4'::jsonb, 160.00, 21.00, 181.00, 'Destinatario T-046', :CA, false,
    decode('Y2lmcmFkby1kZS1wcnVlYmE=', 'base64'), decode('BwcHBwcHBwcHBwcH', 'base64'),
    decode('CQkJCQkJCQkJCQkJCQkJCQ==', 'base64')),
  decode('8f8113580ccb6f5c68682d5a54d6efb56fae23f020c3ce0eacf3d99b64c06fe9', 'hex'),
  'Destinatario T-046', :CA, :'LIN4'::jsonb, 160.00, 21.00, 181.00, false, timestamptz '2026-10-02 09:00:04.400+00',
  decode('Y2lmcmFkby1kZS1wcnVlYmE=', 'base64'), decode('BwcHBwcHBwcHBwcH', 'base64'),
  decode('CQkJCQkJCQkJCQkJCQkJCQ==', 'base64'));

-- V5 · Descartado y sin centro.
select $vec${"base_centimos":6000,"borrador_id":"32320000-0000-4000-8000-000000000205","centro_id":null,"creada_en":"2026-10-02T09:00:05.500Z","creada_por":"b0030001-0000-4000-8000-000000000002","cuota_iva_centimos":0,"descartado":true,"destinatario_nif":null,"destinatario_nombre":"Destinatario T-046","esquema_version":1,"lineas":[{"cantidad":1,"cita_id":null,"concepto":"Sesión individual","precio_unitario_centimos":6000,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0}],"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001","profesional_id":"b0030001-0000-4000-8000-000000000002","total_centimos":6000}$vec$ as "VEC5" \gset
select pg_temp.vector32(5, :'VEC5',
  pg_temp.sobre_borrador_jcs('32320000-0000-4000-8000-000000000205', :PRO1, timestamptz '2026-10-02 09:00:05.500+00',
    :'LIN2'::jsonb, 60.00, 0, 60.00, 'Destinatario T-046', null, true),
  pg_temp.sobre_borrador('32320000-0000-4000-8000-000000000205', :PRO1, timestamptz '2026-10-02 09:00:05.500+00',
    :'LIN2'::jsonb, 60.00, 0, 60.00, 'Destinatario T-046', null, true),
  decode('848e1f9bbcdce86ef046f6acdbb28ffb305e72bea50ed77334dbdcc093f13aea', 'hex'),
  'Destinatario T-046', null, :'LIN2'::jsonb, 60.00, 0, 60.00, true, timestamptz '2026-10-02 09:00:05.500+00');

-- V6 · Comillas y barra invertida en el concepto.
select $vec${"base_centimos":6000,"borrador_id":"32320000-0000-4000-8000-000000000206","centro_id":"c0030001-0000-4000-8000-00000000000a","creada_en":"2026-10-02T09:00:06.600Z","creada_por":"b0030001-0000-4000-8000-000000000002","cuota_iva_centimos":0,"descartado":false,"destinatario_nif":null,"destinatario_nombre":"Destinatario T-046","esquema_version":1,"lineas":[{"cantidad":1,"cita_id":null,"concepto":"Sesión \"online\" C:\\ruta\\a","precio_unitario_centimos":6000,"regimen_iva":"exento_sanitario","tipo_iva_centesimas":0}],"numero_version":1,"paciente_id":"32320000-0000-4000-8000-000000000001","profesional_id":"b0030001-0000-4000-8000-000000000002","total_centimos":6000}$vec$ as "VEC6" \gset
select jsonb_build_array(pg_temp.linea_borrador($c$Sesión "online" C:\ruta\a$c$, 1, 6000)) as "LIN6" \gset
select pg_temp.vector32(6, :'VEC6',
  pg_temp.sobre_borrador_jcs('32320000-0000-4000-8000-000000000206', :PRO1, timestamptz '2026-10-02 09:00:06.600+00',
    :'LIN6'::jsonb, 60.00, 0, 60.00, 'Destinatario T-046', :CA),
  pg_temp.sobre_borrador('32320000-0000-4000-8000-000000000206', :PRO1, timestamptz '2026-10-02 09:00:06.600+00',
    :'LIN6'::jsonb, 60.00, 0, 60.00, 'Destinatario T-046', :CA),
  decode('1ae5c2590a430030c9c7fc7230d9d7103f3b8d585cfc25492219f873548edbb0', 'hex'),
  'Destinatario T-046', :CA, :'LIN6'::jsonb, 60.00, 0, 60.00, false, timestamptz '2026-10-02 09:00:06.600+00');
