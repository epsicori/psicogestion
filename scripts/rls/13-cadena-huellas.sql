-- T-005 · Cadena de huellas: sellado, encadenado y verificador.
--
-- Se añade AL FINAL (13), no intercalado, siguiendo la regla del README: este módulo
-- manipula filas de notas_clinicas_versiones con los cerrojos levantados, y hacerlo antes
-- de que otros módulos las lean rompería sus supuestos. Al ser el último, nada corre
-- después dentro del mismo `begin … rollback` de test-rls.mjs.

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

\echo ''

\echo '=== 13-cadena-huellas ==='

call pg_temp.reset_sesion();

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values

  (:PCAD, 'Carla', 'Cadena', :PRO1, :CA),
  (:PDEMO, 'Dora', 'Demostración', :PRO1, :CA),
  (:PVEC, 'Vera', 'Vector', :ANA, :CA);

insert into public.notas_clinicas (id, paciente_id, autor_id) values

  (:NCADX, :PCAD, :PRO1),

  (:NCADA, :PCAD, :PRO1),

  (:NCADB, :PCAD, :PRO1),

  (:NCADC, :PCAD, :PRO1),

  (:NDEMO, :PDEMO, :PRO1),

  (:NVEC, :PVEC, :ANA);

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
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"Nota"},"esquema_version":2,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('86480db9f7e4230896f9fdf2e78fa14ea4fdc9fd56d2b4f51bdce83985ca1dc3', 'hex'),
  'Vector congelado "genesis-minimo": pgcrypto reproduce la huella de TypeScript'
);

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"café"},"esquema_version":2,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('f7473e07ca29a6daf7ff899a06d4fc8b716e86ce2db2966dfe6043bc179ceb3f', 'hex'),
  'Vector congelado "acentos-nfc": pgcrypto reproduce la huella de TypeScript'
);

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"control":"\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f","exponente":100},"esquema_version":2,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('a18b06cc7d0316debb3866c031e563f56f0c5e47ab2bf247080afdd542cf343f', 'hex'),
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
\set VECGENESIS '\'{"abierta_en":"2026-08-29T09:12:03.123Z","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"Nota"},"esquema_version":2,"firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}\''

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NVEC, '{"texto":"Nota"}',
   :VECGENESIS,
   :ANA, timestamptz '2026-08-29T09:20:00.000Z');

select pg_temp.assert(
  (select huella from public.notas_clinicas_versiones where nota_id = :NVEC)
    = decode('86480db9f7e4230896f9fdf2e78fa14ea4fdc9fd56d2b4f51bdce83985ca1dc3', 'hex'),
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
--     posicion_cadena/numero_version a mano); 23514 para las nueve
--     comprobaciones de coherencia 6.1-6.9; 22P05 para el caso especial de
--     U+0000 (§ más abajo), que ni siquiera llega a la guarda 1 porque
--     revienta en el propio `::jsonb` de la comprobación 6.
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
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:09.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:09.000Z","anotaciones_reservadas":null,"autor_id":null,"cita_id":null,"creada_en":"2026-08-29T09:30:09.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:09.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'REGRESIÓN — autor_id JSON null lanza 23514 (comprobación 6.2; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:10.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:10.000Z","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:10.000Z","cuerpo":{"t":"neg"},"esquema_version":null,"firmada_en":"2026-08-29T09:30:10.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'REGRESIÓN — esquema_version JSON null lanza 23514 (comprobación 6.5; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:11.000Z')$sql$,
    :NCADX,
    -- esquema_version como CADENA "2", no número: el hallazgo BAJA 10 (subsumido en el
    -- arreglo ALTA) — un cast a smallint la habría colado igual que el número 2.
    '{"abierta_en":"2026-08-29T09:30:11.000Z","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:11.000Z","cuerpo":{"t":"neg"},"esquema_version":"2","firmada_en":"2026-08-29T09:30:11.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'REGRESIÓN — esquema_version como cadena "2" (no número) lanza 23514 (comprobación 6.5)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:12.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:12.000Z","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":null,"cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:12.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'REGRESIÓN — creada_en JSON null lanza 23514 (comprobación 6.7; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:13.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:13.000Z","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:13.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":null,"margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'REGRESIÓN — firmada_en JSON null lanza 23514 (comprobación 6.7; era el hueco del hallazgo ALTA)'
);

-- Hallazgo MEDIA-3 (el más serio) de la segunda revisión: `autor_id` repetido en el
-- propio texto del sobre (uno falso, uno real más adelante). Con `jsonb_object_keys()`
-- esto pasaba desapercibido (jsonb deduplica); con `json_object_keys()` (el arreglo) el
-- array de claves tiene doce elementos en vez de once y no coincide con v_esperadas.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:14.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:14.000Z","anotaciones_reservadas":null,"autor_id":"22222222-2222-4222-8222-222222222222","autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:14.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:14.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
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
    '{"abierta_en":"2026-08-29T09:30:15.000Z","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:15.000Z","cuerpo":{"control":"\u0000"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:15.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '22P05',
  'Un sobre con U+0000 en el cuerpo lanza 22P05 al castear contenido_canonico a jsonb (Postgres no admite ese escape ni siquiera dentro de un jsonb)'
);

-- Hallazgo BAJA 8 de la segunda revisión: `abierta_en` con texto que no es un instante
-- válido daba el error crudo de Postgres (22007) en vez de un mensaje de dominio como
-- las otras ocho comprobaciones de 6.8. Arreglado con un `begin/exception` alrededor del
-- cast; esta negativa lo deja sujeto con el código correcto (23514, no 22007).
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:16.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"esto-no-es-una-fecha","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:30:16.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514',
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

-- Gemela positiva de las dieciséis anteriores: NCADX sigue sin ninguna versión —
-- ninguna de las negativas coló nada.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas_versiones where nota_id = %L', :NCADX)) = 0,
  'GEMELA POSITIVA: NCADX sigue sin versiones tras las dieciséis negativas'
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
     '{"abierta_en":"2026-08-29T09:30:16.000Z","anotaciones_reservadas":null,"autor_id":"22222222-2222-4222-8222-222222222222","cita_id":null,"creada_en":"2026-08-29T09:30:16.000Z","cuerpo":{"t":"neg"},"esquema_version":2,"firmada_en":"2026-08-29T09:30:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
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
-- intermedia señala EXACTAMENTE esa posición y ninguna otra.

update public.notas_clinicas_versiones
   set contenido_canonico = replace(contenido_canonico, 'cad-b', 'MANIPULADO')
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 1,
  'Manipulada la posición intermedia (NCADB), el verificador señala EXACTAMENTE una fila'
);

select pg_temp.assert(
  (select posicion_cadena from public.verificar_cadena_huellas(:PCAD)) = 2,
  'La fila señalada es la posición 2 (NCADB) y ninguna anterior'
);

select pg_temp.assert(
  (select motivo from public.verificar_cadena_huellas(:PCAD)) = 'huella_no_coincide',
  'El motivo es huella_no_coincide: el contenido cambió, la huella guardada no'
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
--    de más (jsonb-equivalente, distinto en bytes): el verificador NO LO VE,
--    porque no deriva nada de `cuerpo`, solo lee `contenido_canonico`.

update public.notas_clinicas_versiones
   set cuerpo = '{ "t" :   "cad-b" }'
 where nota_id = :NCADB;

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCAD)) = 0,
  'Criterio 8.1: reescribir `cuerpo` (jsonb-equivalente, distinto en bytes) no lo detecta el verificador'
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

\echo '13-cadena-huellas: completa.'

