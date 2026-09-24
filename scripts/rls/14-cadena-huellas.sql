-- T-005 · Cadena de huellas: sellado, encadenado y verificador.
--
-- Se añadió AL FINAL (14), no intercalado, siguiendo la regla del README: este módulo
-- manipula filas de notas_clinicas_versiones con los cerrojos levantados, y hacerlo antes
-- de que otros módulos las lean rompería sus supuestos.
--
-- CORRECCIÓN (11-09-2026): ya NO es el último. Desde T-010 corren detrás 15-agenda.sql y
-- 16-series.sql, y la cabecera seguía diciendo «nada corre después». Sigue siendo seguro
-- por dos motivos, y conviene comprobar los dos antes de añadir un módulo 17: este fichero
-- DEVUELVE los cerrojos antes de acabar (el `enable trigger` y el `revoke update` del
-- final de la sección D), y ni 15 ni 16 tocan notas_clinicas_versiones. Un módulo nuevo que
-- sí la toque hereda filas manipuladas y restauradas a mano: léase antes la sección D.

\set PCAD  '\'d0050001-0000-4000-8000-000000000001\''

\set NCADX '\'f0050001-0000-4000-8000-000000000000\''

\set NCADA '\'f0050001-0000-4000-8000-000000000001\''

\set NCADB '\'f0050001-0000-4000-8000-000000000002\''

\set NCADC '\'f0050001-0000-4000-8000-000000000003\''

-- Paciente y nota DESECHABLES, solo para la demostración de «con el disparador
-- desactivado, el fallo cambia de motivo» (§C, segunda revisión con Opus). Aparte de
-- PCAD/NCADX a propósito: la demostración inserta un génesis real, y si compartiera la
-- cadena de PCAD chocaría con el génesis legítimo que la sección D crea más abajo.
\set PDEMO '\'d0050001-0000-4000-8000-000000000009\''
\set NDEMO '\'f0050001-0000-4000-8000-000000000009\''

-- Paciente y nota para el hallazgo BAJA 9 de la segunda revisión: insertar un sobre REAL
-- de lib/huella/vectores-congelados.json (no uno construido a mano con
-- pg_temp.sobre_prueba()) a través del disparador de verdad. Su autor_id es
-- 11111111-1111-4111-8111-111111111111 (Ana, de supabase/seed.sql): el propio vector lo
-- trae fijo, así que la nota tiene que ser suya para que la comprobación 6.2 coincida.
\set PVEC '\'d0050001-0000-4000-8000-000000000008\''
\set NVEC '\'f0050001-0000-4000-8000-000000000008\''
\set ANA  '\'11111111-1111-4111-8111-111111111111\''

-- T-012b · Paciente y nota propios de la sección F (cotejo sobre-fila): no
-- reutiliza PCAD, porque D ya cuenta «tres versiones» de esa cadena y D.1
-- está afinada a esa cuenta exacta.
\set PCOT '\'d012b001-0000-4000-8000-000000000001\''
\set NCOT '\'f012b001-0000-4000-8000-000000000001\''

\echo ''

\echo '=== 14-cadena-huellas ==='

call pg_temp.reset_sesion();

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values

  (:PCAD, 'Carla', 'Cadena', :PRO1, :CA),
  (:PDEMO, 'Dora', 'Demostración', :PRO1, :CA),
  (:PVEC, 'Vera', 'Vector', :ANA, :CA),
  (:PCOT, 'Cora', 'Cotejo', :PRO1, :CA);

insert into public.notas_clinicas (id, paciente_id, autor_id) values

  (:NCADX, :PCAD, :PRO1),

  (:NCADA, :PCAD, :PRO1),

  (:NCADB, :PCAD, :PRO1),

  (:NCADC, :PCAD, :PRO1),

  (:NDEMO, :PDEMO, :PRO1),

  (:NVEC, :PVEC, :ANA),

  (:NCOT, :PCOT, :PRO1);

-- =========================================================================
-- A · Las fijaciones de 01-fijacion.sql ya forman cadenas de verdad
-- =========================================================================

select pg_temp.assert(
  (select huella_anterior from public.notas_clinicas_versiones where nota_id = :NCONJ)
    = decode(repeat('00', 32), 'hex'),
  'NCONJ (posición 1 de la cadena de P1) nace con huella_anterior = 32 ceros'
);

select pg_temp.assert(
  (select posicion_cadena from public.notas_clinicas_versiones where nota_id = :NCONJ) = 1,
  'NCONJ ocupa la posición 1 de la cadena de P1'
);

select pg_temp.assert(
  (select posicion_cadena from public.notas_clinicas_versiones where nota_id = :NIND) = 2,
  'NIND ocupa la posición 2 de la cadena de P1'
);

select pg_temp.assert(
  (select huella_anterior from public.notas_clinicas_versiones where nota_id = :NIND)
    = (select huella from public.notas_clinicas_versiones where nota_id = :NCONJ),
  'huella_anterior(NIND) = huella(NCONJ): el eslabón encadena de verdad'
);

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas()) = 0,
  'verificar_cadena_huellas() sobre la cadena sana devuelve cero filas'
);

-- =========================================================================
-- B · Los pares del vector congelado (lib/huella/vectores-congelados.json,
--     §12), reproducidos con pgcrypto: cierra el lazo entre TypeScript y SQL.
--     lib/huella/vectores-sql.test.ts comprueba que estos TRES pares están,
--     literales, también en el JSON.
-- =========================================================================

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"Nota"},"esquema_version":3,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('f955c4984edc9facd3fa0b8ee662618de0aaaab26886ff953dee1374e7925e67', 'hex'),
  'Vector congelado "genesis-minimo": pgcrypto reproduce la huella de TypeScript'
);

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"café"},"esquema_version":3,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('183caf10deb5daad829bb6c397344ac9c3f0d6012bdbfc659a05c8534d7c6068', 'hex'),
  'Vector congelado "acentos-nfc": pgcrypto reproduce la huella de TypeScript'
);

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"control":"\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f","exponente":100},"esquema_version":3,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('e97d557b6dde40ae975a282fee321fddbec987691cbbbedeeb9a1aab1eec353c', 'hex'),
  'Vector congelado "control-y-exponente": pgcrypto reproduce la huella de TypeScript'
);

-- Hallazgo BAJA 9 de la segunda revisión con Opus del 30-08-2026: hasta aquí, TODAS las
-- inserciones de esta batería usan pg_temp.sobre_prueba(), deliberadamente NO canónico
-- (§8 del diseño: `::text` de un jsonb mete un espacio tras los dos puntos). Ninguna
-- prueba metía un sobre REAL de TypeScript (canonizar()/construirSobre()) por el
-- disparador. Esta sí: el vector "genesis-minimo" de vectores-congelados.json, con su
-- texto EXACTO (el mismo que reproduce pgcrypto arriba), insertado tal cual como
-- contenido_canonico — y se comprueba que fn_sellar_version_nota() lo acepta y que la
-- huella resultante es la MISMA que el vector congelado ya declara (génesis: huella
-- sobre 32 ceros).
\set VECGENESIS '\'{"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"Nota"},"esquema_version":3,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}\''

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NVEC, '{"texto":"Nota"}',
   :VECGENESIS,
   :ANA, timestamptz '2026-08-29T09:20:00.000Z');

select pg_temp.assert(
  (select huella from public.notas_clinicas_versiones where nota_id = :NVEC)
    = decode('f955c4984edc9facd3fa0b8ee662618de0aaaab26886ff953dee1374e7925e67', 'hex'),
  'Un sobre REAL del vector congelado "genesis-minimo", insertado tal cual, se sella con EXACTAMENTE la huella que TypeScript y pgcrypto ya predicen'
);
select pg_temp.assert(
  (select contenido_canonico from public.notas_clinicas_versiones where nota_id = :NVEC) = :VECGENESIS,
  'contenido_canonico se guarda byte a byte igual al vector congelado (sin recanonizar ni reformatear nada)'
);

-- =========================================================================
-- C · Negativas con su gemela positiva, todas con pg_temp.assert_lanza_codigo
--     (nunca assert_lanza a secas: hallazgo MEDIA-1 de la segunda revisión con
--     Opus del 30-08-2026 — con assert_lanza a secas, una negativa que en
--     realidad chocaba con una restricción AJENA a este disparador (o que ni
--     siquiera pasaba por él) seguía dando «OK» sin que nadie se enterase).
--     Contra NCADX, que nunca llega a tener versión: todas fallan.
--
--     Los códigos exigidos son los que de verdad lanza fn_sellar_version_nota():
--     42501 para la guarda 1 (huella/huella_anterior/paciente_id/
--     posicion_cadena/numero_version a mano); 23514 para las diez
--     comprobaciones de coherencia 6.1-6.10 (T-012a añade la 6.10, alcance
--     del sobre = columna alcance, ADR-057); 22P05 para el caso especial de
--     U+0000 (§ más abajo), que ni siquiera llega a la guarda 1 porque
--     revienta en el propio `::jsonb` de la comprobación 6.
--
--     T-012a (hallazgo ALTA, encontrado por los DOS revisores por separado):
--     el código exacto ya no basta dentro del bloque 6.x. Las DIEZ
--     comprobaciones lanzan 23514, así que una fila incoherente en más de un
--     campo muere en la PRIMERA que la pilla y la aserción da «OK» con el
--     rótulo de otra — verde por el motivo equivocado, que es exactamente lo
--     que `.claude/rules/pruebas.md` prohíbe. Por eso toda negativa cuyo sobre
--     sea un LITERAL escrito a mano —las que fijan los doce campos uno a uno y
--     por tanto pueden desalinearse de la fila en más de uno, como pasó aquí—
--     usa `assert_lanza_codigo_msg`, que además del SQLSTATE exige un fragmento
--     del MENSAJE de la comprobación que la prueba dice ejercer. Las que
--     construyen el sobre con `pg_temp.sobre_prueba()` siguen con
--     `assert_lanza_codigo`: ahí el sobre es coherente por construcción salvo
--     en el único campo que la prueba altera, así que no hay dos candidatas.
--     Las de fuera del bloque 6.x (42501 de la guarda 1, 22P05 del cast)
--     también, porque su código ya identifica el sitio sin ambigüedad.
--     Excepción deliberada: las DOS negativas de la 6.10 exigen el mensaje
--     aunque una de ellas use `sobre_prueba()`. La 6.10 es la comprobación que
--     este ticket existe para instalar y es la última de las diez: cualquier
--     desajuste futuro en el generador de sobres la mataría antes, en silencio
--     y en verde. Es la prueba que más tiene que demostrar por dónde falla.
-- =========================================================================

-- b0030001-0000-4000-8000-000000000002 es el UUID literal de :PRO1
-- (scripts/rls/01-fijacion.sql). Se escribe a mano en los sobres de esta
-- sección porque son literales de texto construidos aparte de
-- pg_temp.sobre_prueba(), para poder meter un `null` JSON, una clave
-- duplicada o U+0000 donde el generador no lo permitiría.

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, huella, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, decode(repeat('00', 32), 'hex'), %L, timestamptz '2026-08-29 09:30:00+00')$sql$,
    :NCADX, pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:00+00', '{"t":"neg"}'::jsonb), :PRO1),
  '42501',
  'Mandar huella a mano en el INSERT lanza 42501 (guarda 1; fn_sellar_version_nota la calcula)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, posicion_cadena, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 1, %L, timestamptz '2026-08-29 09:30:01+00')$sql$,
    :NCADX, pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:01+00', '{"t":"neg"}'::jsonb), :PRO1),
  '42501',
  'Mandar posicion_cadena a mano en el INSERT lanza 42501 (guarda 1; fn_sellar_version_nota la calcula)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:02+00')$sql$,
    :NCADX,
    left(pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:02+00', '{"t":"neg"}'::jsonb), -1) || ',"extra":1}',
    :PRO1),
  '23514',
  'Un sobre con una clave de más lanza 23514 (comprobación 6.1: claves exactas)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:03+00')$sql$,
    :NCADX,
    -- Sobre construido para PRO2, insertado con autor_id = PRO1: no coinciden.
    pg_temp.sobre_prueba(:PRO2, timestamptz '2026-08-29 09:30:03+00', '{"t":"neg"}'::jsonb),
    :PRO1),
  '23514',
  'Un sobre con autor_id distinto del de la fila lanza 23514 (comprobación 6.2)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, %L)$sql$,
    :NCADX,
    -- Sobre con creada_en=09:30:04, columna creada_en=09:30:05: no coinciden.
    pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:04+00', '{"t":"neg"}'::jsonb),
    :PRO1,
    timestamptz '2026-08-29 09:30:05+00'),
  '23514',
  'Un sobre con creada_en distinto de la columna creada_en lanza 23514 (comprobación 6.7)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:06+00')$sql$,
    :NCADX,
    -- cita_id null pero redactada_en_sesion = true: viola la coherencia 6.9 (ADR-046).
    pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:06+00', '{"t":"neg"}'::jsonb,
                          null, null, null, null, true),
    :PRO1),
  '23514',
  'cita_id null con redactada_en_sesion=true lanza 23514 (comprobación 6.9, ADR-046)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, anotaciones_reservadas, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, %L, timestamptz '2026-08-29 09:30:07+00')$sql$,
    :NCADX,
    -- Sobre con anotaciones_reservadas='reservado-sobre', columna='reservado-fila': no coinciden.
    pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:07+00', '{"t":"neg"}'::jsonb, 'reservado-sobre'),
    'reservado-fila',
    :PRO1),
  '23514',
  'Un sobre con anotaciones_reservadas distinto de la columna lanza 23514 (comprobación 6.4, ADR-027)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, motivo_cambio, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, %L, timestamptz '2026-08-29 09:30:08+00')$sql$,
    :NCADX,
    -- Sobre con motivo_cambio='motivo-sobre', columna='motivo-fila': no coinciden.
    pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:08+00', '{"t":"neg"}'::jsonb, null, 'motivo-sobre'),
    'motivo-fila',
    :PRO1),
  '23514',
  'Un sobre con motivo_cambio distinto de la columna lanza 23514 (comprobación 6.6)'
);

-- Hallazgo MEDIA-2 de la segunda revisión con Opus: regresión EXPLÍCITA del hallazgo
-- ALTA de la primera. Ninguna prueba cubría un `null` JSON real en autor_id,
-- esquema_version o creada_en/firmada_en — el error se descubrió a mano, no con una
-- prueba. Estas cinco lo dejan sujeto: cada sobre es correcto en todo salvo el campo
-- nulado (o, en el quinto caso, mal tipado), y se comprueba también CON EL ARREGLO
-- DESHECHO (más abajo) que sin él estas cinco NO lanzaban.
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:09.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:09.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":null,"cita_id":null,"creada_en":"2026-08-29T09:30:09.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:09.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'El autor_id del sobre no coincide',
  'REGRESIÓN — autor_id JSON null lanza 23514 POR LA 6.2 (era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:10.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:10.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:10.000Z","cuerpo":{"t":"neg"},"esquema_version":null,"firmada_en":"2026-08-29T09:30:10.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'esquema_version del sobre no coincide',
  'REGRESIÓN — esquema_version JSON null lanza 23514 (comprobación 6.5; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:11.000Z')$sql$,
    :NCADX,
    -- esquema_version como CADENA "3", no número: el hallazgo BAJA 10 (subsumido en el
    -- arreglo ALTA) — un cast a smallint la habría colado igual que el número 3. La cadena
    -- lleva el valor VIGENTE (3, no 2): con el DEFAULT de la columna en 3 desde T-012a, una
    -- cadena "2" fallaría igual por el VALOR y dejaría de demostrar la distinción de TIPO.
    '{"abierta_en":"2026-08-29T09:30:11.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:11.000Z","cuerpo":{"t":"neg"},"esquema_version":"3","firmada_en":"2026-08-29T09:30:11.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'esquema_version del sobre no coincide',
  'REGRESIÓN — esquema_version como cadena "3" (no número) lanza 23514 (comprobación 6.5)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:12.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:12.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":null,"cuerpo":{"t":"neg"},"esquema_version":3,"firmada_en":"2026-08-29T09:30:12.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'creada_en y firmada_en del sobre deben ser iguales',
  'REGRESIÓN — creada_en JSON null lanza 23514 (comprobación 6.7; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:13.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:13.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:13.000Z","cuerpo":{"t":"neg"},"esquema_version":3,"firmada_en":null,"margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'creada_en y firmada_en del sobre deben ser iguales',
  'REGRESIÓN — firmada_en JSON null lanza 23514 (comprobación 6.7; era el hueco del hallazgo ALTA)'
);

-- Hallazgo MEDIA-3 (el más serio) de la segunda revisión: `autor_id` repetido en el
-- propio texto del sobre (uno falso, uno real más adelante). Con `jsonb_object_keys()`
-- esto pasaba desapercibido (jsonb deduplica); con `json_object_keys()` (el arreglo) el
-- array de claves tiene doce elementos en vez de once y no coincide con v_esperadas.
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:14.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:14.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"22222222-2222-4222-8222-222222222222","autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:14.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:14.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'exactamente las claves',
  'REGRESIÓN — sobre con autor_id DUPLICADO (uno falso, uno real) lanza 23514 (comprobación 6.1)'
);

-- Hallazgo MEDIA-5 de la segunda revisión: la «prueba explícita» de U+0000 que el
-- ticket decía tener no existía en ningún fichero, solo en prosa. Esta la sujeta de
-- verdad: un sobre con el escape de U+0000 dentro de `cuerpo` falla al castear a jsonb
-- (`contenido_canonico::jsonb`, dentro del propio disparador) con 22P05, no con 23514 —
-- ni siquiera llega a la guarda 1 ni a la comprobación 6.1, porque el cast revienta antes.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:15.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:15.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:15.000Z","cuerpo":{"control":"\u0000"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:15.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '22P05',
  'Un sobre con U+0000 en el cuerpo lanza 22P05 al castear contenido_canonico a jsonb (Postgres no admite ese escape ni siquiera dentro de un jsonb)'
);

-- Hallazgo BAJA 8 de la segunda revisión: `abierta_en` con texto que no es un instante
-- válido daba el error crudo de Postgres (22007) en vez de un mensaje de dominio como
-- las otras ocho comprobaciones de 6.8. Arreglado con un `begin/exception` alrededor del
-- cast; esta negativa lo deja sujeto con el código correcto (23514, no 22007).
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:16.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"esto-no-es-una-fecha","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:16.000Z","cuerpo":{"t":"neg"},"esquema_version":3,"firmada_en":"2026-08-29T09:30:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'no son un instante ISO-8601 válido',
  'Un sobre con abierta_en que no es un instante ISO-8601 válido lanza 23514, no el 22007 crudo de Postgres (comprobación 6.8)'
);

-- Hallazgo MEDIA de la TERCERA revisión con Opus (06-09-2026): `algoritmo_version` es
-- `not null default 1` y el grant de la tabla es de tabla entera, así que hasta la
-- guarda 1.bis cualquier profesional podía marcar su versión como de otra era en el
-- propio INSERT — y toda fila con `algoritmo_version <> 1` la clasifica
-- `verificar_cadena_huellas()` como `era_desconocida`, SIN comprobarle el digest, el
-- génesis, el hueco de posición ni el encadenado. Un punto ciego del verificador
-- elegido por quien firma.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, algoritmo_version, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 2, %L, timestamptz '2026-08-29 09:30:17+00')$sql$,
    :NCADX, pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:17+00', '{"t":"neg"}'::jsonb), :PRO1),
  '42501',
  'Mandar algoritmo_version = 2 en el INSERT lanza 42501 (guarda 1.bis: la era la abre una migración, no quien firma)'
);

-- T-012a · comprobación 6.10 (alcance del sobre = columna alcance, ADR-057). La fila no
-- lleva `alcance` en la lista de columnas, así que toma el DEFAULT de la columna
-- ('individual'): un sobre que diga "conjunta" no coincide y debe lanzar 23514. La nota
-- NCADX no tiene episodio, pero eso no interfiere aquí — el disparador
-- exigir_episodio_en_nota_conjunta solo se dispara `when (new.alcance = 'conjunta')`, y
-- la columna alcance de esta fila sigue siendo 'individual' (el default): el ÚNICO
-- disparador que puede rechazar este INSERT es fn_sellar_version_nota, comprobación 6.10.
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:18+00')$sql$,
    :NCADX,
    -- Sobre construido con p_alcance='conjunta'; la columna alcance de la fila queda en
    -- su default 'individual' (no está en la lista de columnas del INSERT): no coinciden.
    pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:18+00', '{"t":"neg"}'::jsonb,
                          p_alcance => 'conjunta'),
    :PRO1),
  '23514',
  'El alcance del sobre no coincide',
  'Un sobre con alcance distinto del de la columna alcance lanza 23514 POR LA 6.10 (ADR-057)'
);

-- T-012a · "alcance":null (JSON null, no una cadena) frente a la columna alcance =
-- 'individual' (el default): `is distinct from` sobre el jsonb completo lo atrapa
-- igual que autor_id/esquema_version nulos (6.2/6.5) — nunca `->>` + `<>`, que con un
-- JSON null da SQL NULL y `NULL <> x` es NULL (falso en un `if`, la comprobación no
-- saltaría).
-- Hallazgo ALTA de la revisión (dos revisores independientes, mismo hallazgo): con
-- "esquema_version":2 en el literal y sin esa columna en la lista del INSERT, la fila
-- tomaba el DEFAULT (3 desde esta misma migración) y la 6.5 ("esquema_version" 2 ≠ 3)
-- lanzaba 23514 ANTES de llegar a la 6.10 — la prueba pasaba en verde por el motivo
-- equivocado y no demostraba nada sobre "alcance":null. Arreglo de TRES partes:
--   1. el literal lleva "esquema_version":3, coherente con la columna;
--   2. la columna esquema_version se fija explícita en el INSERT, sin depender del DEFAULT;
--   3. la aserción exige el MENSAJE de la 6.10, no solo el 23514 — las diez
--      comprobaciones lanzan todas 23514, así que el código por sí solo nunca puede
--      distinguir «falló por donde digo» de «falló antes». Si mañana alguien reescribe
--      la 6.10 como `->>` + `<>`, esta fila se sella y la aserción se pone ROJA por
--      «debía lanzar y no lanzó nada», que es justo lo que el ticket existe para impedir.
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, esquema_version, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 3, %L, timestamptz '2026-08-29T09:30:19.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:19.000Z","alcance":null,"anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:19.000Z","cuerpo":{"t":"neg"},"esquema_version":3,"firmada_en":"2026-08-29T09:30:19.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'El alcance del sobre no coincide',
  'Un sobre con "alcance":null (JSON null) lanza 23514 POR LA 6.10 (ADR-057)'
);

-- Gemela positiva de las dieciocho anteriores: NCADX sigue sin ninguna versión —
-- ninguna de las negativas coló nada.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas_versiones where nota_id = %L', :NCADX)) = 0,
  'GEMELA POSITIVA: NCADX sigue sin versiones tras las dieciocho negativas'
);

-- T-012a · gemela positiva DE VERDAD: un sobre coherente con alcance='conjunta' SÍ debe
-- sellarse. Reutiliza NCONJ (01-fijacion.sql), que YA tiene episodio (ADR-030 lo exige
-- para alcance='conjunta') y ya es la posición 1 de la cadena de P1: esta es su tercera
-- versión (tras NCONJ en 1 y NIND en 2), encadenada de verdad. `numero_version` > 1 exige
-- `motivo_cambio` no vacío (restricción de tabla ajena a esta comprobación, ya vigente
-- desde el esquema base): se pasa el mismo texto a la columna y al sobre, o la
-- comprobación 6.6 (motivo_cambio del sobre = columna) la rechazaría por un motivo
-- distinto del que esta prueba quiere demostrar.
insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, motivo_cambio, autor_id, creada_en) values
  (:NCONJ, '{"t":"conjunta-otra-vez"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:30:20+00', '{"t":"conjunta-otra-vez"}'::jsonb,
                         null, 'Aclaración conjunta (T-012a)', p_alcance => 'conjunta'),
   'conjunta', 'Aclaración conjunta (T-012a)', :PRO1, timestamptz '2026-08-29 09:30:20+00');

select pg_temp.assert(
  (select posicion_cadena from public.notas_clinicas_versiones
    where nota_id = :NCONJ and cuerpo = '{"t":"conjunta-otra-vez"}') = 3,
  'GEMELA POSITIVA: un sobre con alcance=''conjunta'' coherente con la columna SÍ se sella (comprobación 6.10, posición 3 de la cadena de P1)'
);

-- Hallazgo MEDIA-1 (segunda mitad): demostrar que estas comprobaciones dependen DE
-- VERDAD del disparador, no de una coincidencia con otra restricción. Con
-- `sellar_version_nota` desactivado, la misma clase de fallo dejaría de ocurrir por el
-- motivo que la prueba dice, o dejaría de ocurrir del todo:
alter table public.notas_clinicas_versiones disable trigger sellar_version_nota;

-- D1: sin el disparador, mandar `huella` a mano (sin paciente_id/posicion_cadena/
-- numero_version, que el disparador rellenaría) revienta por un motivo TOTALMENTE
-- distinto (NOT NULL de numero_version), nunca por la guarda 1 — prueba de que la
-- guarda 1 es del disparador, no de una restricción de columna que estuviera ahí de
-- todos modos.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, huella, autor_id, creada_en)
         values (%L, '{"t":"neg"}', '{"a":1}', decode(repeat('00', 32), 'hex'), %L, now())$sql$,
    :NDEMO, :PRO1),
  '23502',
  'Con el disparador DESACTIVADO, mandar huella a mano ya NO lanza 42501: lanza 23502 (NOT NULL de numero_version) — la guarda 1 es del disparador'
);

-- D2: sin el disparador, un INSERT con autor_id mal formado (mismatch con el sobre)
-- pero con TODAS las columnas rellenadas a mano (como haría un atacante que conociera
-- el esquema) ENTRA SIN LANZAR NADA — prueba de que la coherencia 6.2 vive solo en el
-- disparador, y sin él el mismatch pasa desapercibido.
do $$
declare
  v_id uuid;
begin
  insert into public.notas_clinicas_versiones
    (nota_id, cuerpo, contenido_canonico, autor_id, creada_en,
     paciente_id, posicion_cadena, numero_version, huella, huella_anterior)
  values
    ('f0050001-0000-4000-8000-000000000009', '{"t":"neg"}',
     '{"abierta_en":"2026-08-29T09:30:16.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"22222222-2222-4222-8222-222222222222","cita_id":null,"creada_en":"2026-08-29T09:30:16.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
     'b0030001-0000-4000-8000-000000000002', timestamptz '2026-08-29T09:30:16.000Z',
     'd0050001-0000-4000-8000-000000000009', 1, 1,
     decode(repeat('11', 32), 'hex'), decode(repeat('00', 32), 'hex'))
  returning id into v_id;
  perform pg_temp.assert(true, format('Con el disparador DESACTIVADO, un sobre con autor_id mismatch ENTRA sin lanzar nada (id=%s) — la comprobación 6.2 vive solo en fn_sellar_version_nota()', v_id));
exception when others then
  raise exception 'FALLO: con el disparador desactivado, este INSERT (deliberadamente incoherente) debía entrar sin lanzar nada, y lanzó % — %', sqlstate, sqlerrm;
end;
$$;

alter table public.notas_clinicas_versiones enable trigger sellar_version_nota;

-- =========================================================================
-- D · La cadena real de PCAD (tres versiones, posiciones 1-2-3), y sobre
--     ella: la huella_anterior repetida, la manipulación con los cerrojos
--     levantados y el criterio 8 («no reserializa») en sus dos sentidos.
-- =========================================================================

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NCADA, '{"t":"cad-a"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:31:00+00', '{"t":"cad-a"}'::jsonb),
   :PRO1, timestamptz '2026-08-29 09:31:00+00');

-- Criterio 9 comprobado por RESTRICCIÓN, de forma determinista y sin
-- concurrencia: con el disparador desactivado se intenta un segundo génesis
-- (huella_anterior = 32 ceros) para el MISMO paciente. NCADA ya ocupa ese
-- huella_anterior: choca con notas_clinicas_versiones_eslabon_idx.

alter table public.notas_clinicas_versiones disable trigger sellar_version_nota;

-- `assert_lanza_codigo`, no `assert_lanza` a secas (hallazgo BAJA 12 de la revisión con
-- Opus, regla 8 del README): el criterio 9 exige la violación DE ESA restricción exacta
-- (unique paciente_id/huella_anterior), no cualquier otro rechazo que pudiera dispararse
-- antes en la misma fila.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones
           (nota_id, cuerpo, contenido_canonico, autor_id, creada_en,
            paciente_id, posicion_cadena, numero_version, huella, huella_anterior)
         values (%L, '{"t":"dup"}', %L, %L, timestamptz '2026-08-29 09:31:01+00',
                 %L, 99, 1, extensions.digest('dup'::bytea, 'sha256'), decode(repeat('00', 32), 'hex'))$sql$,
    :NCADX, pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:31:01+00', '{"t":"dup"}'::jsonb),
    :PRO1, :PCAD),
  '23505',
  'huella_anterior repetida en la misma cadena viola unique(paciente_id, huella_anterior) — criterio 9 por restricción'
);

alter table public.notas_clinicas_versiones enable trigger sellar_version_nota;

-- GEMELA POSITIVA de la guarda 1.bis (tercera revisión con Opus): esta versión SÍ manda
-- `algoritmo_version` en el INSERT, con el valor de la era vigente, y entra. Prueba que
-- la guarda rechaza el VALOR ajeno a la era, no la presencia de la columna — sin esta
-- gemela, la negativa de arriba seguiría verde con una guarda que prohibiera mandarla
-- siempre, que es otra cosa.
insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, algoritmo_version, autor_id, creada_en) values
  (:NCADB, '{"t":"cad-b"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:31:02+00', '{"t":"cad-b"}'::jsonb),
   1, :PRO1, timestamptz '2026-08-29 09:31:02+00');

select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.notas_clinicas_versiones where nota_id = %L and algoritmo_version = 1', :NCADB)) = 1,
  'GEMELA POSITIVA: un INSERT con algoritmo_version = 1 explícito entra y queda en la era vigente'
);

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NCADC, '{"t":"cad-c"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:31:03+00', '{"t":"cad-c"}'::jsonb),
   :PRO1, timestamptz '2026-08-29 09:31:03+00');

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 0,
  'La cadena de PCAD (tres versiones) está sana antes de manipular nada'
);

-- Los cerrojos: el REVOKE de T-004 muerde también al propietario, así que
-- postgres necesita el GRANT de vuelta para esta manipulación deliberada.
-- Todo dentro de la transacción del banco: el ROLLBACK final es la segunda
-- red aunque cada bloque también se deshaga a mano.

grant update on public.notas_clinicas_versiones to postgres;

alter table public.notas_clinicas_versiones disable trigger impedir_modificacion_notas_clinicas_versiones;

-- --- D.1 · Manipulación de una versión INTERMEDIA (posición 2 de 3) ---
-- Se reescribe contenido_canonico (no huella ni huella_anterior): la propia
-- posición 2 deja de cuadrar (huella_no_coincide) pero la posición 3 sigue
-- encadenando bien, porque su huella_anterior sigue apuntando a la huella
-- ORIGINAL, sin tocar, de la posición 2. Por eso la manipulación de una
-- intermedia señala EXACTAMENTE esa posición y ninguna otra por la rama de
-- huella_no_coincide.
--
-- Desde T-012b el mismo `replace` también desalinea el sobre con la fila: el
-- `cuerpo` que dice `contenido_canonico` (ahora "MANIPULADO") ya no coincide
-- con la columna `cuerpo`, intacta ("cad-b"). La posición 2 sale señalada
-- DOS VECES, una por cada rama del `union all`, y ambas son ciertas: la
-- huella no cuadra con sus bytes y, por separado, el sobre tampoco cuadra
-- con la fila. No es redundante: cada motivo prueba una comprobación
-- distinta del verificador (T-012b, criterio 2).

update public.notas_clinicas_versiones
   set contenido_canonico = replace(contenido_canonico, 'cad-b', 'MANIPULADO')
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 2,
  'Manipulada la posición intermedia (NCADB), el verificador señala EXACTAMENTE dos filas (T-012b: huella y sobre)'
);

select pg_temp.assert(
  (select array_agg(motivo || '@' || posicion_cadena order by motivo)
     from public.verificar_cadena_huellas(:PCAD))
    = array['huella_no_coincide@2', 'sobre_no_coincide_con_fila@2'],
  'Las dos filas son de la posición 2 (NCADB): huella_no_coincide y sobre_no_coincide_con_fila'
);

-- Se restaura para que las comprobaciones siguientes partan de una cadena sana.

update public.notas_clinicas_versiones
   set contenido_canonico = replace(contenido_canonico, 'MANIPULADO', 'cad-b')
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 0,
  'Restaurada NCADB, la cadena vuelve a estar sana'
);

-- --- D.2 · Criterio 8 («no reserializa»), en sus dos sentidos ---
-- 1) Reescribir la COLUMNA `cuerpo` con las claves en otro orden y espacios
--    de más (jsonb-equivalente, distinto en bytes): el verificador NO LO VE
--    por huella_no_coincide, porque no deriva nada de `cuerpo` para la
--    huella, solo lee `contenido_canonico`. Desde T-012b el cotejo del sobre
--    (comprobación 6.3) SÍ lo ve, pero comparando JSONB (`c.cuerpo_jsonb`),
--    no bytes: reescribir a una forma jsonb-EQUIVALENTE sigue sin señalarse,
--    exactamente lo que exige el criterio 6(d) del ticket.

update public.notas_clinicas_versiones
   set cuerpo = '{ "t" :   "cad-b" }'
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 0,
  'Criterio 8.1 / 6(d) de T-012b: reescribir `cuerpo` (jsonb-equivalente, distinto en bytes) no lo detecta el verificador'
);

update public.notas_clinicas_versiones
   set cuerpo = '{"t":"cad-b"}'
 where nota_id = :NCADB;

-- 2) Reescribir `contenido_canonico` de forma también jsonb-equivalente
--    (mismas claves, espacios de más): el verificador SÍ LO SEÑALA, porque
--    la huella guardada se calculó sobre los bytes ORIGINALES, no sobre
--    estos. Es la prueba de que se verifican los bytes guardados, nada más.
-- Nota: pg_temp.sobre_prueba() construye `cuerpo` con `p_cuerpo::text`, y el
-- `::text` de un jsonb en Postgres imprime UN ESPACIO tras los dos puntos
-- (`{"t": "cad-b"}`), a diferencia del canónico JCS que no lleva ninguno. Por
-- eso el texto guardado en contenido_canonico es `"t": "cad-b"` (con espacio):
-- se manipula sobre ESE texto, no sobre la forma sin espacio.
update public.notas_clinicas_versiones
   set contenido_canonico = replace(contenido_canonico, '"t": "cad-b"', '"t":   "cad-b"')
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 1,
  'Criterio 8.2: reescribir `contenido_canonico` (jsonb-equivalente, distinto en bytes) SÍ lo detecta el verificador'
);

select pg_temp.assert(
  (select motivo from public.verificar_cadena_huellas(:PCAD)) = 'huella_no_coincide',
  'Criterio 8.2: el motivo es huella_no_coincide (los bytes cambiaron), no sobre_no_coincide_con_fila (el sobre sigue siendo el mismo JSONB que cuerpo)'
);

update public.notas_clinicas_versiones
   set contenido_canonico = replace(contenido_canonico, '"t":   "cad-b"', '"t": "cad-b"')
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 0,
  'Restaurada, la cadena de PCAD vuelve a estar sana'
);

alter table public.notas_clinicas_versiones enable trigger impedir_modificacion_notas_clinicas_versiones;

revoke update on public.notas_clinicas_versiones from postgres;

-- =========================================================================
-- E · ADR-031: vincular un paciente duplicado no altera ninguna huella
-- =========================================================================

create temporary table t005_antes_de_fusion as
  select * from public.verificar_cadena_huellas(:PCAD);

-- Hallazgo BAJA 13 de la revisión con Opus: comparar solo la salida del verificador
-- (cero filas antes, cero filas después) demuestra que sigue sano, pero no que las
-- HUELLAS sean las mismas — dos conjuntos vacíos son iguales entre sí trivialmente. Esto
-- guarda las huellas reales, en orden, para comparar byte a byte más abajo.
select string_agg(encode(huella, 'hex'), ',' order by posicion_cadena) as huellas,
       string_agg(encode(huella_anterior, 'hex'), ',' order by posicion_cadena) as huellas_anteriores
  from public.notas_clinicas_versiones
 where paciente_id = :PCAD
\gset t005_antes_

-- La fusión de pacientes exige administrador (fn_proteger_columnas_reservadas_paciente,
-- ADR-032): fuera de una sesión admin, postgres «a pelo» no tiene rol_actual() y la
-- update se rechazaría igual que a cualquier no-administrador.

call pg_temp.como(:ADM);

update public.pacientes set fusionado_en = :P1, fusionado_el = now() where id = :PCAD;

call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = (select count(*) from t005_antes_de_fusion),
  'Tras fusionar PCAD en P1, verificar_cadena_huellas(PCAD) da el MISMO recuento que antes'
);

select pg_temp.assert(
  not exists (
    select 1 from public.verificar_cadena_huellas(:PCAD) v
    full outer join t005_antes_de_fusion a
      on a.paciente_id = v.paciente_id and a.posicion_cadena = v.posicion_cadena and a.motivo = v.motivo
    where v.paciente_id is null or a.paciente_id is null
  ),
  'ADR-031: la fusión no cambia NI UNA fila de lo que devuelve el verificador (comparación fila a fila)'
);

-- La comprobación real, byte a byte (hallazgo BAJA 13): las huellas y los
-- huella_anterior de las tres versiones, en el mismo orden, son EXACTAMENTE
-- las de antes de fusionar — no solo «el verificador sigue sin quejarse».
select
  string_agg(encode(huella, 'hex'), ',' order by posicion_cadena) as huellas,
  string_agg(encode(huella_anterior, 'hex'), ',' order by posicion_cadena) as huellas_anteriores
  from public.notas_clinicas_versiones
 where paciente_id = :PCAD
\gset t005_despues_

select pg_temp.assert(
  :'t005_antes_huellas' = :'t005_despues_huellas',
  'ADR-031: las huellas de PCAD, byte a byte y en orden, son IDÉNTICAS antes y después de fusionar'
);
select pg_temp.assert(
  :'t005_antes_huellas_anteriores' = :'t005_despues_huellas_anteriores',
  'ADR-031: los huella_anterior de PCAD, byte a byte y en orden, son IDÉNTICOS antes y después de fusionar'
);

-- Y el verificador sigue agrupando por el paciente_id GUARDADO, no por el
-- destino de la fusión: sigue existiendo bajo PCAD, no ha migrado a P1.

select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where paciente_id = :PCAD) = 3,
  'El verificador no resuelve fusionado_en: las tres versiones siguen con paciente_id = PCAD'
);

drop table t005_antes_de_fusion;

-- =========================================================================
-- F · Cotejo sobre-fila (T-012b): el verificador coteja el sobre sellado con
--     las columnas de la fila. `fn_sellar_version_nota()` compara sobre y
--     fila SOLO `before insert` (6.2-6.7, 6.10); con los cerrojos levantados
--     un `update` puede alterar una columna sin tocar el sobre y la huella
--     sigue cuadrando (el sobre no cambió). Esta sección demuestra el
--     escenario de M1 de T-012a (`alcance` alterado por debajo) y las otras
--     seis columnas que `lib/huella/firmar.ts` copia del sobre.
-- =========================================================================

call pg_temp.reset_sesion();

-- F.0 · Dos versiones HONESTAS de NCOT, con anotaciones_reservadas y
-- motivo_cambio no nulos en la segunda: la gemela positiva de toda la
-- sección. numero_version 1 y 2 son también posicion_cadena 1 y 2, porque
-- PCOT es un paciente nuevo con una sola nota (NCOT).

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NCOT, '{"t":"cot-1"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:40:00.123+00', '{"t":"cot-1"}'::jsonb),
   :PRO1, timestamptz '2026-08-29 09:40:00.123+00');

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, anotaciones_reservadas, motivo_cambio, autor_id, creada_en) values
  (:NCOT, '{"t":"cot-2"}',
   pg_temp.sobre_prueba(:PRO1, timestamptz '2026-08-29 09:41:00.456+00', '{"t":"cot-2"}'::jsonb,
                         'reservada', 'Aclaración (T-012b)'),
   'reservada', 'Aclaración (T-012b)', :PRO1, timestamptz '2026-08-29 09:41:00.456+00');

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCOT)) = 0,
  'F.0 · gemela positiva: dos versiones honestas de NCOT (con anotaciones_reservadas y motivo_cambio no nulos en la segunda) dan cero filas'
);

-- F.0 · zona: sin `at time zone 'UTC'` en el cotejo de creada_en/firmada_en,
-- toda fila saldría divergente en una sesión que no esté en UTC.
select current_setting('TimeZone') as valor \gset t012b_zona_
set timezone = 'Pacific/Kiritimati';
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCOT)) = 0,
  'F.0 · zona: en sesión Pacific/Kiritimati, la cadena honesta de PCOT sigue dando cero filas'
);
set timezone = :'t012b_zona_valor';

-- F.0 · permisos: ni anon, ni authenticated, ni service_role tienen EXECUTE
-- sobre verificar_cadena_huellas(uuid). `create or replace` conserva los
-- permisos de la definición original: si alguien lo cambiara por un `drop` +
-- `create`, Supabase concedería EXECUTE por defecto y esta aserción lo
-- atraparía.
select pg_temp.assert(
  not has_function_privilege('anon', 'public.verificar_cadena_huellas(uuid)', 'execute'),
  'F.0 · permisos: anon sigue sin EXECUTE sobre verificar_cadena_huellas(uuid)'
);
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.verificar_cadena_huellas(uuid)', 'execute'),
  'F.0 · permisos: authenticated sigue sin EXECUTE sobre verificar_cadena_huellas(uuid)'
);
select pg_temp.assert(
  not has_function_privilege('service_role', 'public.verificar_cadena_huellas(uuid)', 'execute'),
  'F.0 · permisos: service_role sigue sin EXECUTE sobre verificar_cadena_huellas(uuid)'
);

-- Los cerrojos, igual que en la sección D: el REVOKE de T-004 muerde también
-- al propietario.

grant update on public.notas_clinicas_versiones to postgres;

alter table public.notas_clinicas_versiones disable trigger impedir_modificacion_notas_clinicas_versiones;

-- F.1 · alcance cambiado por debajo (M1 de T-012a): el escenario exacto que
-- este ticket existe para cerrar. Sin la migración de T-012b, esta es la
-- aserción que falla PRIMERO (criterio 2): el verificador de T-005 no mira
-- ninguna columna que el sobre repita, así que `verificar_cadena_huellas()`
-- da cero filas aquí y `array_agg` sobre cero filas da NULL, distinto del
-- array esperado.

update public.notas_clinicas_versiones
   set alcance = 'conjunta'
 where nota_id = :NCOT and numero_version = 1;

select pg_temp.assert(
  (select array_agg(motivo || '@' || posicion_cadena order by motivo)
     from public.verificar_cadena_huellas(:PCOT)) = array['sobre_no_coincide_con_fila@1'],
  'F.1 · alcance cambiado por debajo (M1 de T-012a): con los cerrojos levantados, `update … set alcance = ''conjunta''` sobre una versión sellada `individual` hace que verificar_cadena_huellas(PCOT) devuelva exactamente una fila, de esa versión, con motivo sobre_no_coincide_con_fila'
);

select pg_temp.assert(
  (select extensions.digest(convert_to(contenido_canonico, 'UTF8') || huella_anterior, 'sha256')
     from public.notas_clinicas_versiones where nota_id = :NCOT and numero_version = 1)
    = (select huella from public.notas_clinicas_versiones where nota_id = :NCOT and numero_version = 1),
  'F.1 · la huella de la fila sigue cuadrando con sus bytes guardados: alcance no forma parte del sobre, así que huella_no_coincide NO la señala — solo el cotejo sobre-fila la ve'
);

update public.notas_clinicas_versiones
   set alcance = 'individual'
 where nota_id = :NCOT and numero_version = 1;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCOT)) = 0,
  'F.1 · restaurada `alcance`, la cadena de PCOT vuelve a estar sana'
);

-- F.2-F.9 · una negativa por columna cotejada, cada una con su propia
-- restauración a cero filas. `pg_temp.t012b_caso()` recibe el fragmento
-- `set` y el fragmento `restaura` ya formados (con `format(...)` del lado de
-- fuera, donde `:PRO1`/`:PRO2` SÍ se sustituyen — a diferencia de dentro de
-- un cuerpo `$$...$$`, donde no se sustituyen: por eso nota y paciente se
-- pasan como parámetros).
create or replace function pg_temp.t012b_caso(
  p_nota uuid, p_paciente uuid, p_numero_version integer,
  p_set text, p_restaura text, p_esperado text[], p_rotulo text
) returns void
language plpgsql
as $$
begin
  execute format(
    'update public.notas_clinicas_versiones set %s where nota_id = %L and numero_version = %s',
    p_set, p_nota, p_numero_version);
  perform pg_temp.assert(
    (select array_agg(motivo || '@' || posicion_cadena order by motivo)
       from public.verificar_cadena_huellas(p_paciente)) = p_esperado,
    p_rotulo
  );
  execute format(
    'update public.notas_clinicas_versiones set %s where nota_id = %L and numero_version = %s',
    p_restaura, p_nota, p_numero_version);
  perform pg_temp.assert(
    (select count(*) from public.verificar_cadena_huellas(p_paciente)) = 0,
    p_rotulo || ' — restaurada, cero filas'
  );
end;
$$;

-- F.2 · autor_id (comprobación 6.2)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 1,
  format('autor_id = %L', :PRO2),
  format('autor_id = %L', :PRO1),
  array['sobre_no_coincide_con_fila@1'],
  'F.2 · autor_id cambiado por debajo: el verificador señala exactamente esa versión (comprobación 6.2)'
);

-- F.3 · cuerpo no equivalente (comprobación 6.3)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 1,
  format('cuerpo = %L', '{"t":"otro"}'),
  format('cuerpo = %L', '{"t":"cot-1"}'),
  array['sobre_no_coincide_con_fila@1'],
  'F.3 · cuerpo cambiado por debajo (no jsonb-equivalente al sobre): el verificador señala exactamente esa versión (comprobación 6.3)'
);

-- F.4 · anotaciones_reservadas: NULL en la fila -> '' por debajo (sentido 1)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 1,
  format('anotaciones_reservadas = %L', ''),
  format('anotaciones_reservadas = %L', null::text),
  array['sobre_no_coincide_con_fila@1'],
  'F.4 · anotaciones_reservadas NULL -> '''' por debajo: el verificador señala exactamente esa versión (comprobación 6.4)'
);

-- F.5 · anotaciones_reservadas: cadena en la fila -> NULL por debajo (sentido 2)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 2,
  format('anotaciones_reservadas = %L', null::text),
  format('anotaciones_reservadas = %L', 'reservada'),
  array['sobre_no_coincide_con_fila@2'],
  'F.5 · anotaciones_reservadas cadena -> NULL por debajo: el verificador señala exactamente esa versión (comprobación 6.4)'
);

-- F.6 · motivo_cambio: NULL en la fila -> cadena por debajo (sentido 1)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 1,
  format('motivo_cambio = %L', 'inventado'),
  format('motivo_cambio = %L', null::text),
  array['sobre_no_coincide_con_fila@1'],
  'F.6 · motivo_cambio NULL -> cadena por debajo: el verificador señala exactamente esa versión (comprobación 6.6)'
);

-- F.7 · motivo_cambio: cadena en la fila -> otra cadena por debajo (sentido 2)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 2,
  format('motivo_cambio = %L', 'Otro motivo'),
  format('motivo_cambio = %L', 'Aclaración (T-012b)'),
  array['sobre_no_coincide_con_fila@2'],
  'F.7 · motivo_cambio cadena -> otra cadena por debajo: el verificador señala exactamente esa versión (comprobación 6.6)'
);

-- F.8 · esquema_version (comprobación 6.5)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 1,
  format('esquema_version = %s', 2),
  format('esquema_version = %s', 3),
  array['sobre_no_coincide_con_fila@1'],
  'F.8 · esquema_version cambiado por debajo (3 -> 2): el verificador señala exactamente esa versión (comprobación 6.5)'
);

-- F.9 · creada_en +1 ms (comprobación 6.7)
select pg_temp.t012b_caso(
  :NCOT, :PCOT, 1,
  $set$creada_en = creada_en + interval '1 millisecond'$set$,
  $set$creada_en = creada_en - interval '1 millisecond'$set$,
  array['sobre_no_coincide_con_fila@1'],
  'F.9 · creada_en desplazado un milisegundo por debajo: el verificador señala exactamente esa versión (comprobación 6.7)'
);

-- F.9b · firmada_en AISLADO (comprobación 6.7, hallazgo BAJA de la revisión
-- SQL): F.9 mueve la columna `creada_en`, y como el predicado coteja las
-- claves `creada_en` y `firmada_en` contra la MISMA `c.creada_en_iso`
-- (derivada de esa columna), F.9 enciende las líneas 146 y 147 A LA VEZ — si
-- se quitara cualquiera de las dos, F.9 seguiría en verde. F.9b deja la
-- columna `creada_en` intacta y solo cambia la clave `firmada_en` DENTRO del
-- sobre, con la huella recalculada sobre esos bytes nuevos (huella bien
-- calculada: el verificador nunca reserializa, ADR-035), para que solo la
-- línea 147 se encienda.
--
-- Sobre numero_version 2 (la ÚLTIMA de NCOT), no la 1: recalcular la huella
-- de una versión que tiene un eslabón siguiente rompería ADEMÁS el
-- encadenado (huella_anterior de v2 dejaría de casar con la huella nueva de
-- v1), y eslabon_desencadenado ensuciaría la aserción exacta de abajo. Sobre
-- la última versión, no hay ningún eslabón siguiente que le importe.
--
-- `regexp_replace` sobre el sobre guardado, no `pg_temp.sobre_prueba()`: las
-- tres claves `abierta_en`/`creada_en`/`firmada_en` de NCOT v2 valen el MISMO
-- literal ("2026-08-29T09:41:00.456Z"), así que solo el patrón con el nombre
-- de la clave delante distingue cuál de las tres se toca.
select contenido_canonico as valor from public.notas_clinicas_versiones
 where nota_id = :NCOT and numero_version = 2
\gset t012b_f9b_original_
select encode(huella, 'hex') as valor from public.notas_clinicas_versiones
 where nota_id = :NCOT and numero_version = 2
\gset t012b_f9b_huella_original_

select regexp_replace(
         :'t012b_f9b_original_valor',
         '"firmada_en":"2026-08-29T09:41:00\.456Z"',
         '"firmada_en":"2026-08-29T09:41:00.457Z"'
       ) as valor
\gset t012b_f9b_nuevo_

select pg_temp.assert(
  :'t012b_f9b_nuevo_valor' <> :'t012b_f9b_original_valor',
  'F.9b · el patrón encontró y cambió la clave firmada_en (si esto fallara, el resto de F.9b no probaría nada)'
);

update public.notas_clinicas_versiones
   set contenido_canonico = :'t012b_f9b_nuevo_valor',
       huella = extensions.digest(convert_to(:'t012b_f9b_nuevo_valor', 'UTF8') || huella_anterior, 'sha256')
 where nota_id = :NCOT and numero_version = 2;

select pg_temp.assert(
  (select array_agg(motivo || '@' || posicion_cadena order by motivo)
     from public.verificar_cadena_huellas(:PCOT)) = array['sobre_no_coincide_con_fila@2'],
  'F.9b · firmada_en desalineado por sí solo (creada_en cuadra y la huella cuadra con el sobre nuevo): el verificador señala exactamente esa versión, y solo con sobre_no_coincide_con_fila (comprobación 6.7, línea 147 aislada de la 146)'
);

-- Demostración de guarda (.claude/rules/pruebas.md): se redefine la función
-- SIN la línea 147, dentro de esta misma transacción, y se comprueba que la
-- fila de arriba deja de señalarse; luego se restaura la definición exacta
-- de la migración. Cuerpo copiado de
-- supabase/migrations/20260924150000_verificador_coteja_sobre_y_fila.sql
-- salvo esa línea.
create or replace function public.verificar_cadena_huellas(p_paciente_id uuid default null)
returns table (
  paciente_id     uuid,
  posicion_cadena integer,
  version_id      uuid,
  nota_id         uuid,
  creada_en       timestamptz,
  motivo          text
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select
      v.paciente_id, v.posicion_cadena, v.id as version_id, v.nota_id, v.creada_en,
      v.huella, v.huella_anterior, v.contenido_canonico, v.algoritmo_version,
      lag(v.huella) over (partition by v.paciente_id order by v.posicion_cadena) as huella_prev_real,
      lag(v.posicion_cadena) over (partition by v.paciente_id order by v.posicion_cadena) as posicion_prev,
      v.cuerpo, v.anotaciones_reservadas, v.autor_id, v.esquema_version, v.motivo_cambio, v.alcance,
      case when pg_input_is_valid(v.contenido_canonico, 'jsonb')
           then v.contenido_canonico::jsonb end                                   as sobre,
      case when pg_input_is_valid(v.cuerpo, 'jsonb')
           then v.cuerpo::jsonb end                                               as cuerpo_jsonb,
      to_jsonb(to_char(v.creada_en at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))                          as creada_en_iso
    from public.notas_clinicas_versiones v
    where p_paciente_id is null or v.paciente_id = p_paciente_id
  )
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'era_desconocida'::text as motivo
    from c
   where c.algoritmo_version <> 1
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'huella_no_coincide'::text
    from c
   where c.algoritmo_version = 1
     and extensions.digest(convert_to(c.contenido_canonico, 'UTF8') || c.huella_anterior, 'sha256')
         <> c.huella
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'genesis_incorrecto'::text
    from c
   where c.algoritmo_version = 1
     and c.posicion_prev is null
     and c.posicion_cadena = 1
     and c.huella_anterior <> decode(repeat('00', 32), 'hex')
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'hueco_de_posicion'::text
    from c
   where c.algoritmo_version = 1
     and (
       (c.posicion_prev is null and c.posicion_cadena <> 1)
       or (c.posicion_prev is not null and c.posicion_cadena <> c.posicion_prev + 1)
     )
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'eslabon_desencadenado'::text
    from c
   where c.algoritmo_version = 1
     and c.posicion_prev is not null
     and c.posicion_cadena = c.posicion_prev + 1
     and c.huella_anterior <> c.huella_prev_real
  union all
  -- sobre_no_coincide_con_fila SIN la línea 147 (firmada_en): la demostración
  -- de guarda de F.9b vive de que esta rama, tal cual, deje pasar el caso.
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'sobre_no_coincide_con_fila'::text
    from c
   where c.algoritmo_version = 1
     and (
          c.sobre is null
       or jsonb_typeof(c.sobre) <> 'object'
       or (c.sobre -> 'alcance')                is distinct from to_jsonb(c.alcance::text)
       or (c.sobre -> 'autor_id')               is distinct from to_jsonb(c.autor_id::text)
       or (c.sobre -> 'cuerpo')                 is distinct from c.cuerpo_jsonb
       or (c.sobre -> 'anotaciones_reservadas') is distinct from coalesce(to_jsonb(c.anotaciones_reservadas), 'null'::jsonb)
       or (c.sobre -> 'esquema_version')        is distinct from to_jsonb(c.esquema_version)
       or (c.sobre -> 'motivo_cambio')          is distinct from coalesce(to_jsonb(c.motivo_cambio), 'null'::jsonb)
       or (c.sobre -> 'creada_en')              is distinct from c.creada_en_iso
       -- (línea 147, firmada_en, QUITADA A PROPÓSITO para esta demostración)
     )
  order by 1, 2, 6;
$$;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCOT)) = 0,
  'F.9b · demostración de guarda: SIN la línea 147 (firmada_en) en el predicado, la MISMA fila con firmada_en desalineado ya no se señala — la cadena vuelve a darse por sana. Prueba que la aserción de arriba depende de esa línea y no de otra.'
);

-- Se restaura la definición EXACTA de la migración (con la línea 147).
create or replace function public.verificar_cadena_huellas(p_paciente_id uuid default null)
returns table (
  paciente_id     uuid,
  posicion_cadena integer,
  version_id      uuid,
  nota_id         uuid,
  creada_en       timestamptz,
  motivo          text
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select
      v.paciente_id, v.posicion_cadena, v.id as version_id, v.nota_id, v.creada_en,
      v.huella, v.huella_anterior, v.contenido_canonico, v.algoritmo_version,
      lag(v.huella) over (partition by v.paciente_id order by v.posicion_cadena) as huella_prev_real,
      lag(v.posicion_cadena) over (partition by v.paciente_id order by v.posicion_cadena) as posicion_prev,
      v.cuerpo, v.anotaciones_reservadas, v.autor_id, v.esquema_version, v.motivo_cambio, v.alcance,
      case when pg_input_is_valid(v.contenido_canonico, 'jsonb')
           then v.contenido_canonico::jsonb end                                   as sobre,
      case when pg_input_is_valid(v.cuerpo, 'jsonb')
           then v.cuerpo::jsonb end                                               as cuerpo_jsonb,
      to_jsonb(to_char(v.creada_en at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))                          as creada_en_iso
    from public.notas_clinicas_versiones v
    where p_paciente_id is null or v.paciente_id = p_paciente_id
  )
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'era_desconocida'::text as motivo
    from c
   where c.algoritmo_version <> 1
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'huella_no_coincide'::text
    from c
   where c.algoritmo_version = 1
     and extensions.digest(convert_to(c.contenido_canonico, 'UTF8') || c.huella_anterior, 'sha256')
         <> c.huella
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'genesis_incorrecto'::text
    from c
   where c.algoritmo_version = 1
     and c.posicion_prev is null
     and c.posicion_cadena = 1
     and c.huella_anterior <> decode(repeat('00', 32), 'hex')
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'hueco_de_posicion'::text
    from c
   where c.algoritmo_version = 1
     and (
       (c.posicion_prev is null and c.posicion_cadena <> 1)
       or (c.posicion_prev is not null and c.posicion_cadena <> c.posicion_prev + 1)
     )
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'eslabon_desencadenado'::text
    from c
   where c.algoritmo_version = 1
     and c.posicion_prev is not null
     and c.posicion_cadena = c.posicion_prev + 1
     and c.huella_anterior <> c.huella_prev_real
  union all
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'sobre_no_coincide_con_fila'::text
    from c
   where c.algoritmo_version = 1
     and (
          c.sobre is null
       or jsonb_typeof(c.sobre) <> 'object'
       or (c.sobre -> 'alcance')                is distinct from to_jsonb(c.alcance::text)
       or (c.sobre -> 'autor_id')               is distinct from to_jsonb(c.autor_id::text)
       or (c.sobre -> 'cuerpo')                 is distinct from c.cuerpo_jsonb
       or (c.sobre -> 'anotaciones_reservadas') is distinct from coalesce(to_jsonb(c.anotaciones_reservadas), 'null'::jsonb)
       or (c.sobre -> 'esquema_version')        is distinct from to_jsonb(c.esquema_version)
       or (c.sobre -> 'motivo_cambio')          is distinct from coalesce(to_jsonb(c.motivo_cambio), 'null'::jsonb)
       or (c.sobre -> 'creada_en')              is distinct from c.creada_en_iso
       or (c.sobre -> 'firmada_en')             is distinct from c.creada_en_iso
     )
  order by 1, 2, 6;
$$;

revoke all on function public.verificar_cadena_huellas(uuid) from public, anon, authenticated, service_role;

-- … y se restauran los datos de NCOT v2.
update public.notas_clinicas_versiones
   set contenido_canonico = :'t012b_f9b_original_valor',
       huella = decode(:'t012b_f9b_huella_original_valor', 'hex')
 where nota_id = :NCOT and numero_version = 2;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCOT)) = 0,
  'F.9b · restaurados firmada_en, la definición de verificar_cadena_huellas() y sus permisos: la cadena de PCOT vuelve a estar sana'
);

-- 6.4 (anotaciones_reservadas) y 6.6 (motivo_cambio) NO llevan la misma
-- demostración de guarda: el hueco que el revisor señala ahí no es «quitar
-- la línea» (F.4-F.7 ya la ejercen con NULL en los dos sentidos), sino que
-- una reescritura futura con `->>` en vez de `->` perdería la distinción de
-- tipo sin que ninguna prueba actual lo note. Reproducir F.9b dos veces más
-- —dos redefiniciones más de la función dentro de la misma transacción, cada
-- una con su propio riesgo de desincronizarse del cuerpo real— para un hueco
-- BAJA que hoy solo alcanza la puerta de F.11 (una fila con el disparador de
-- sellado apagado, ya señalada por autor_id y esquema_version) no compensa
-- frente a dejarlo escrito aquí para quien redefina la función en T-012c.

-- Los cerrojos vuelven a su sitio, igual que al final de la sección D.

alter table public.notas_clinicas_versiones enable trigger impedir_modificacion_notas_clinicas_versiones;

revoke update on public.notas_clinicas_versiones from postgres;

select pg_temp.assert(
  not has_table_privilege('postgres', 'public.notas_clinicas_versiones', 'update'),
  'Los cerrojos de la sección F vuelven a su sitio: postgres ya no tiene UPDATE sobre notas_clinicas_versiones'
);

select pg_temp.assert(
  (select tgenabled from pg_trigger where tgname = 'impedir_modificacion_notas_clinicas_versiones') = 'O',
  'Los cerrojos de la sección F vuelven a su sitio: el disparador impedir_modificacion_notas_clinicas_versiones vuelve a estar activo (''O'')'
);

-- F.10 · sin falsos positivos en todo el banco: cubre NCONJ (conjunta), NVEC
-- (sobre real de TypeScript con NFC), P2/NCORR con motivo_cambio y, sobre la
-- base sembrada, las cinco firmas del seed. Solo PDEMO puede aparecer (F.11,
-- la fila insertada con el disparador de sellado apagado en la sección C).
select pg_temp.assert(
  not exists (
    select 1 from public.verificar_cadena_huellas() v where v.paciente_id <> :PDEMO
  ),
  'F.10 · sin falsos positivos: al final de la sección F, verificar_cadena_huellas() no devuelve ninguna fila de ningún paciente salvo PDEMO'
);

-- F.11 · la otra puerta: la fila de PDEMO insertada en la sección C con
-- fn_sellar_version_nota() apagado (sobre con autor_id 2222… frente a la
-- columna PRO1, esquema_version 2 en el sobre frente a 3 en la columna y
-- huella falsa) aparece ahora TAMBIÉN como sobre_no_coincide_con_fila,
-- además de huella_no_coincide.
select pg_temp.assert(
  exists (
    select 1 from public.verificar_cadena_huellas(:PDEMO) where motivo = 'sobre_no_coincide_con_fila'
  ),
  'F.11 · la fila de PDEMO, insertada con el disparador de sellado apagado, también sale como sobre_no_coincide_con_fila'
);

\echo '14-cadena-huellas: completa.'

