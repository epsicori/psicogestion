-- T-003 · Ayudantes del banco de pruebas de RLS.
--
-- La diferencia con los guiones anteriores (t000/t001/t002/t004): aquí una aserción rota
-- LANZA una excepción, y con `-v ON_ERROR_STOP=1` eso hace que psql salga con código
-- distinto de cero. Nadie tiene que leer la salida para saber si el banco pasó.

-- `raise notice` en el caso OK, no solo `raise exception` en el fallo: el criterio del
-- ticket exige que la salida en verde "nombre cada rol y cada tabla", y los mensajes de
-- cada aserción ya los nombran (p. ej. "TEC1 (centro A) debe ver P1"). Sin este aviso, en
-- verde no habría nada que leer salvo "(1 row)" repetido.
create or replace function pg_temp.assert(condicion boolean, mensaje text)
returns void
language plpgsql
as $$
begin
  if condicion is distinct from true then
    raise exception 'ASERCIÓN FALLIDA: %', mensaje;
  end if;
  raise notice 'OK: %', mensaje;
end;
$$;

-- Para las negativas que hoy se comprueban dejando que psql muestre un error: ejecuta
-- `consulta` y falla si NO lanza. El motivo de que sea texto y no un bloque directo es que
-- así una sola llamada sirve para SELECT, INSERT, UPDATE o DELETE sin repetir el molde de
-- captura de excepción en cada sitio.
create or replace function pg_temp.assert_lanza(consulta text, mensaje text)
returns void
language plpgsql
as $$
begin
  begin
    execute consulta;
  exception when others then
    raise notice 'OK (lanzó %): %', sqlstate, mensaje;
    return; -- lanzó: correcto, se acabó
  end;
  raise exception 'ASERCIÓN FALLIDA (debía lanzar y no lanzó): %', mensaje;
end;
$$;

-- Cuenta filas de una consulta arbitraria bajo la sesión (rol + jwt) ya establecida. Sirve
-- para no repetir `select count(*) from ...` con su `perform`/`into` en cada bloque.
create or replace function pg_temp.contar(consulta text)
returns bigint
language plpgsql
as $$
declare
  v_n bigint;
begin
  execute 'select count(*) from (' || consulta || ') t' into v_n;
  return v_n;
end;
$$;

-- Cambia de sesión: rol Postgres `authenticated` y el `sub` del JWT. Envuelve el patrón que
-- ya usan t000/t001/t002/t004, para no repetir las dos líneas `set local` en cada bloque.
create or replace procedure pg_temp.como(p_uid uuid)
language plpgsql
as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text);
end;
$$;

-- Como `como()`, pero además simula un SEGUNDO FACTOR RECIÉN VERIFICADO: el claim `aal`
-- del JWT en `aal2` y una fila de `auth.mfa_factors` verificada con `last_challenged_at`
-- fresco. Es lo que exige `segundo_factor_verificado_recientemente()` (arreglo de los dos
-- hallazgos ALTA de la revisión de T-006a del 30-08-2026), del que ahora cuelgan
-- `fijar_pin_historia()` y `generar_codigos_recuperacion()`.
--
-- El factor lo crea `pg_temp.dar_segundo_factor()` y NO se inserta aquí: esta
-- procedimiento solo cambia la sesión, y hacerlo escribir en `auth` dejaría una escritura
-- escondida detrás de un `call` que en todos los demás sitios no escribe nada.
create or replace procedure pg_temp.como_con_2fa(p_uid uuid)
language plpgsql
as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text);
end;
$$;

-- Da a `p_uid` un factor TOTP verificado y retado hace `p_hace` (por defecto, ahora
-- mismo). Se llama como `postgres`, antes de cambiar de sesión.
--
-- TRAMPA PAGADA: `auth.mfa_factors` tiene un índice ÚNICO GLOBAL sobre
-- `last_challenged_at` (`mfa_factors_last_challenged_at_key`, comprobado con
-- `\d auth.mfa_factors` contra la base local, no de memoria). `now()` es constante dentro
-- de una transacción, así que dar el factor a dos usuarios con el valor por defecto
-- chocaría con un 23505. Por eso `p_hace` existe y por eso cada llamada de la fijación
-- pasa un desfase distinto.
create or replace procedure pg_temp.dar_segundo_factor(p_uid uuid, p_hace interval default interval '0 seconds')
language plpgsql
as $$
begin
  insert into auth.mfa_factors
    (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, last_challenged_at)
  values
    (gen_random_uuid(), p_uid, 'totp-banco-' || p_uid::text, 'totp', 'verified',
     now(), now(), 'SECRETODEPRUEBA', now() - p_hace);
end;
$$;

-- Como assert_lanza, pero exige que lance CON UN SQLSTATE CONCRETO. `assert_lanza` a
-- secas basta cuando cualquier rechazo es correcto (RLS deniega con 42501 sin más), pero
-- cuando el rechazo tiene que venir de una comprobación concreta —no de cualquier otra
-- que se dispare antes en la misma sentencia, como un disparador de columnas reservadas
-- que corre antes que el que se quiere probar— hace falta pedir el código exacto.
create or replace function pg_temp.assert_lanza_codigo(consulta text, codigo text, mensaje text)
returns void
language plpgsql
as $$
begin
  begin
    execute consulta;
  exception when others then
    if sqlstate = codigo then
      raise notice 'OK (lanzó % como se esperaba): %', sqlstate, mensaje;
      return; -- lanzó con el código esperado: correcto
    end if;
    raise exception 'ASERCIÓN FALLIDA (lanzó % en vez de %): % — %', sqlstate, codigo, mensaje, sqlerrm;
  end;
  raise exception 'ASERCIÓN FALLIDA (debía lanzar % y no lanzó nada): %', codigo, mensaje;
end;
$$;

-- T-012a · Como assert_lanza_codigo, pero exige además que el MENSAJE del error
-- contenga un fragmento literal. El SQLSTATE no basta cuando varias comprobaciones
-- del mismo disparador lanzan TODAS con 23514: una fila mal armada puede morir en
-- una comprobación anterior a la que la prueba dice ejercer y dar «OK» igual. Fue
-- el hallazgo ALTA de las dos revisiones de T-012a (la negativa de `"alcance":null`
-- moría en la 6.5, no en la 6.10, y con la 6.10 reescrita mal el banco seguía verde).
-- Con el fragmento, la aserción DEMUESTRA por dónde falla, no solo que falla.
create or replace function pg_temp.assert_lanza_codigo_msg(
  consulta text, codigo text, fragmento text, mensaje text)
returns void
language plpgsql
as $$
begin
  begin
    execute consulta;
  exception when others then
    if sqlstate <> codigo then
      raise exception 'ASERCIÓN FALLIDA (lanzó % en vez de %): % — %', sqlstate, codigo, mensaje, sqlerrm;
    end if;
    if position(fragmento in sqlerrm) = 0 then
      raise exception
        'ASERCIÓN FALLIDA (lanzó % con el código correcto pero desde OTRA comprobación; '
        'el mensaje no contiene «%»): % — mensaje real: %', sqlstate, fragmento, mensaje, sqlerrm;
    end if;
    raise notice 'OK (lanzó % y el mensaje dice «%»): %', sqlstate, fragmento, mensaje;
    return; -- lanzó con el código Y por la comprobación esperada: correcto
  end;
  raise exception 'ASERCIÓN FALLIDA (debía lanzar % y no lanzó nada): %', codigo, mensaje;
end;
$$;

-- T-012c · La gemela positiva de assert_lanza: ejecuta `consulta` y falla si LANZA,
-- con el SQLSTATE y el mensaje reales en el fallo. Sirve para que una inserción que
-- debe sellarse diga POR QUÉ no se selló en vez de cortar el banco con un error suelto
-- (la primera firma de la fijación, las gemelas positivas y los mutantes de 14).
create or replace function pg_temp.assert_no_lanza(consulta text, mensaje text)
returns void
language plpgsql
as $$
begin
  begin
    execute consulta;
  exception when others then
    raise exception 'FALLO: % (lanzó % · %)', mensaje, sqlstate, sqlerrm;
  end;
  raise notice 'OK: %', mensaje;
end;
$$;

create or replace procedure pg_temp.reset_sesion()
language plpgsql
as $$
begin
  reset role;
  reset request.jwt.claims;
end;
$$;

-- T-005 · Construye a mano el sobre canónico (JCS + NFC, ADR-035/046) de una versión de
-- prueba. NO es un canonicalizador general —los valores del banco son ASCII simple, sin
-- ninguno de los casos feos que prueba lib/huella/jcs.test.ts—, es la forma más corta de
-- dar de alta versiones que el disparador fn_sellar_version_nota() (T-005) acepte, con las
-- diecisiete claves exactas de la era 4 y en el orden alfabético que exige la
-- comprobación 6.1. `p_cuerpo` ya viene como jsonb de una sola clave en todos los usos
-- del banco, así que su orden interno no importa.
-- T-012a: p_alcance nuevo, al final para no romper las llamadas posicionales ya
-- existentes en el banco; default 'individual' porque es el valor por defecto de la
-- columna homónima (ADR-057).
-- T-012c: p_nota_id primero y sin valor por defecto. paciente_id, episodio_id,
-- fecha_sesion y coprofesional_id se leen de la cabecera notas_clinicas (por eso es
-- `stable`); sin `into strict`: para una nota inexistente salen a null, que es lo que
-- necesita C.perm de 14 (el paso 0 o las 6.12-6.16 lo rechazan igual). Se llama como
-- `postgres`: bajo `authenticated` la RLS de notas_clinicas decidiría qué cabecera ve.
create or replace function pg_temp.sobre_prueba(
  p_nota_id                  uuid,
  p_autor_id                 uuid,
  p_creada_en                timestamptz,
  p_cuerpo                   jsonb,
  p_anotaciones_reservadas   text default null,
  p_motivo_cambio            text default null,
  p_cita_id                  uuid default null,
  p_margen_sesion_minutos    integer default null,
  p_redactada_en_sesion      boolean default false,
  p_abierta_en               timestamptz default null,
  p_alcance                  text default 'individual'
) returns text
language sql
stable
as $$
  select
    '{' ||
    '"abierta_en":' || to_json(to_char(coalesce(p_abierta_en, p_creada_en) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"alcance":' || coalesce(to_json(p_alcance)::text, 'null') || ',' ||
    '"anotaciones_reservadas":' || coalesce(to_json(p_anotaciones_reservadas)::text, 'null') || ',' ||
    '"autor_id":"' || lower(p_autor_id::text) || '",' ||
    '"cita_id":' || coalesce(to_json(p_cita_id::text)::text, 'null') || ',' ||
    '"coprofesional_id":' || coalesce(to_json((select n.coprofesional_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"creada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"cuerpo":' || p_cuerpo::text || ',' ||
    '"episodio_id":' || coalesce(to_json((select n.episodio_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"esquema_version":4,' ||
    '"fecha_sesion":' || coalesce(to_json((select to_char(n.fecha_sesion, 'YYYY-MM-DD') from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"firmada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"margen_sesion_minutos":' || coalesce(p_margen_sesion_minutos::text, 'null') || ',' ||
    '"motivo_cambio":' || coalesce(to_json(p_motivo_cambio)::text, 'null') || ',' ||
    '"nota_id":"' || lower(p_nota_id::text) || '",' ||
    '"paciente_id":' || coalesce(to_json((select n.paciente_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"redactada_en_sesion":' || p_redactada_en_sesion::text ||
    '}';
$$;

-- T-042 · Los dos pasos de T-042, con la forma de la función vieja, para que las
-- aserciones de T-003 a T-038 sigan leyéndose igual. La puerta de un paso
-- (`public.desbloquear_historia(text)` y `public.canjear_codigo_recuperacion(text)`) ya no
-- existe: cotejaba y devolvía en la misma transacción, y eso era el oráculo. Estos dos
-- ayudantes llaman al paso uno (que coteja y confirma) y luego al paso dos (que no recibe
-- el secreto). Son `security invoker`: corren con el rol y el JWT que fijó `como()`.
-- El banco 24 NO los usa: llama a las funciones `public.*` directamente.
create or replace function pg_temp.desbloquear_historia(p_pin text)
returns table (desbloqueado boolean, motivo text, caduca_en timestamptz, bloqueado_hasta timestamptz)
language plpgsql as $$
begin
  perform public.comprobar_pin_historia(p_pin);
  return query select d.desbloqueado, d.motivo, d.caduca_en, d.bloqueado_hasta
                 from public.desbloquear_historia() d;
end $$;

create or replace function pg_temp.canjear_codigo_recuperacion(p_codigo text)
returns table (canjeado boolean, motivo text, bloqueado_hasta timestamptz)
language plpgsql as $$
begin
  perform public.comprobar_codigo_recuperacion(p_codigo);
  return query select c.canjeado, c.motivo, c.bloqueado_hasta
                 from public.canjear_codigo_recuperacion() c;
end $$;

-- T-021 · El sobre canónico de una versión de borrador de factura, construido a mano como
-- sobre_prueba() hace con el de la nota: las QUINCE claves exactas que exige
-- fn_sellar_version_borrador(), en orden alfabético. paciente_id y profesional_id se leen de
-- la cabecera borradores_factura (por eso es `stable`, y por eso se llama como `postgres`:
-- bajo `authenticated` la RLS decidiría qué cabecera ve). numero_version, si no se pasa, es
-- el siguiente que calculará el disparador (máximo + 1 de ese borrador). Los importes llegan
-- en euros, con dos decimales, y van al sobre en céntimos enteros (A.1-D4). El NIF, si se
-- pasa, son los tres bytea y la versión de clave 1, en base64 sin saltos de línea.
create or replace function pg_temp.sobre_borrador(
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
  p_numero_version       integer default null
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
    '"lineas":' || p_lineas::text || ',' ||
    '"numero_version":' || coalesce(p_numero_version,
        (select coalesce(max(v.numero_version), 0) + 1 from public.borradores_factura_versiones v
          where v.borrador_id = p_borrador_id))::text || ',' ||
    '"paciente_id":' || coalesce(to_json((select b.paciente_id::text from public.borradores_factura b where b.id = p_borrador_id))::text, 'null') || ',' ||
    '"profesional_id":' || coalesce(to_json((select b.profesional_id::text from public.borradores_factura b where b.id = p_borrador_id))::text, 'null') || ',' ||
    '"total_centimos":' || ((p_total * 100)::bigint)::text ||
    '}';
$$;

-- T-021 · Una línea de borrador con las seis claves exactas. Por defecto, exenta y sin cita.
create or replace function pg_temp.linea_borrador(
  p_concepto      text,
  p_cantidad      integer,
  p_precio        integer,
  p_regimen       text default 'exento_sanitario',
  p_tipo_iva      integer default 0,
  p_cita_id       uuid default null
) returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'concepto', p_concepto,
    'cantidad', p_cantidad,
    'precio_unitario_centimos', p_precio,
    'regimen_iva', p_regimen,
    'tipo_iva_centesimas', p_tipo_iva,
    'cita_id', p_cita_id::text);
$$;

-- T-026a · El INSERT de una versión de borrador de una sola línea exenta (cantidad 1), con el
-- sobre coherente ya calculado. Lo usan la fijación de `01` y el módulo 31: es la forma corta de
-- sellar una versión sin repetir el molde de `26-economico`. `p_total` en euros. El llamante
-- pasa `creada_en` (literal pasado, distinto por versión: el índice global de huellas, punto 9
-- del README). `numero_version` lo calcula el disparador; el sobre lo adivina como máximo + 1,
-- así que el texto se genera justo antes de ejecutarse.
create or replace function pg_temp.sql_version_simple(
  p_borrador    uuid,
  p_por         uuid,
  p_total       numeric,
  p_creada_en   timestamptz,
  p_nombre      text default 'Ana Uno',
  p_centro      uuid default null,
  p_descartado  boolean default false
) returns text
language sql
stable
as $$
  select format(
    'insert into public.borradores_factura_versiones (borrador_id, centro_id, destinatario_nombre, '
    'lineas, base, cuota_iva, total, descartado, creada_por, creada_en, algoritmo_version, contenido_canonico) '
    'values (%L, %L, %L, %L, %s, 0.00, %s, %L, %L, %L, 1, %L)',
    p_borrador, p_centro, p_nombre,
    jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, (p_total * 100)::integer)),
    p_total, p_total, p_descartado, p_por, p_creada_en,
    pg_temp.sobre_borrador(p_borrador, p_por, p_creada_en,
      jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, (p_total * 100)::integer)),
      p_total, 0.00, p_total, p_nombre, p_centro, p_descartado));
$$;

\echo '00-ayudantes: assert, assert_lanza, assert_no_lanza, contar, como(), sobre_prueba() y sobre_borrador() definidos.'
