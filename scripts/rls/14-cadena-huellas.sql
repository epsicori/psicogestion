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
\set EPICAD  '\'e0050001-0000-4000-8000-000000000001\''
\set EPIDEMO '\'e0050001-0000-4000-8000-000000000009\''
\set EPIVEC  '\'e0050001-0000-4000-8000-000000000008\''
\set EPICOT  '\'e012b001-0000-4000-8000-000000000001\''

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

-- T-012c · Fijación propia: un paciente y dos episodios para las notas con coprofesional, y
-- una cabecera (fecha_sesion fija) por cada caso que el sobre de la era 4 cotejaría. Los
-- UUID f0670001-… son notas; d0670001-… pacientes; e0670001-… episodios.
--   N067A  EPI067A, coprofesional PRO2   · una versión `conjunta` en C (gemela de la 6.16)
--   N067B  EPI067B, sin coprofesional    · sin versiones (objetivo de la RLS en C.perm y de F.12)
--   N067C  EPI067B, sin coprofesional    · una versión individual en C (gemela de la 6.16, null)
--   N067D  EPI067A, coprofesional PRO2   · sin versiones (gemela de cabecera de N067A: F.12b)
--   N067E  EPI067A, sin coprofesional    · la firma `authenticated` de su autor en C.perm
\set P067    '\'d0670001-0000-4000-8000-000000000001\''
\set PMOV    '\'d0670001-0000-4000-8000-000000000002\''
\set EPI067A '\'e0670001-0000-4000-8000-000000000001\''
\set EPI067B '\'e0670001-0000-4000-8000-000000000002\''
\set N067A   '\'f0670001-0000-4000-8000-000000000001\''
\set N067B   '\'f0670001-0000-4000-8000-000000000002\''
\set N067C   '\'f0670001-0000-4000-8000-000000000003\''
\set N067D   '\'f0670001-0000-4000-8000-000000000004\''
\set N067E   '\'f0670001-0000-4000-8000-000000000005\''
-- Una nota que NO existe (C.perm: el paso 0 y el P0002 de después la tratan igual).
\set NFANTASMA '\'f0710001-0000-4000-8000-0000000000ff\''

\echo ''

\echo '=== 14-cadena-huellas ==='

call pg_temp.reset_sesion();

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values

  (:PCAD, 'Carla', 'Cadena', :PRO1, :CA),
  (:PDEMO, 'Dora', 'Demostración', :PRO1, :CA),
  (:PVEC, 'Vera', 'Vector', :ANA, :CA),
  (:PCOT, 'Cora', 'Cotejo', :PRO1, :CA),
  (:P067, 'Pablo', 'T012c', :PRO1, :CB),
  (:PMOV, 'Mara', 'Movida', :PRO1, :CB);

-- T-034 (ADR-071): toda nota cuelga de un episodio, y del de su autor (D2). Un episodio
-- individual por paciente, a nombre de quien escribe la nota, en el centro CA.
insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id) values
  (:EPICAD,  :PCAD,  :PRO1, :CA),
  (:EPIDEMO, :PDEMO, :PRO1, :CA),
  (:EPIVEC,  :PVEC,  :ANA,  :CA),
  (:EPICOT,  :PCOT,  :PRO1, :CA),
  (:EPI067A, :P067,  :PRO1, :CB),
  (:EPI067B, :P067,  :PRO1, :CB);

-- T-012c: fecha_sesion explícita en todas (el sobre de la era 4 la sella; la columna ya
-- tiene valor por defecto, pero un sobre de vector congelado exige una fecha concreta).
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, fecha_sesion) values
  (:NCADX, :PCAD, :EPICAD, :PRO1, date '2026-08-29'),
  (:NCADA, :PCAD, :EPICAD, :PRO1, date '2026-08-29'),
  (:NCADB, :PCAD, :EPICAD, :PRO1, date '2026-08-29'),
  (:NCADC, :PCAD, :EPICAD, :PRO1, date '2026-08-29'),
  (:NDEMO, :PDEMO, :EPIDEMO, :PRO1, date '2026-08-29'),
  (:NVEC, :PVEC, :EPIVEC, :ANA, date '2026-08-29'),
  (:NCOT, :PCOT, :EPICOT, :PRO1, date '2026-08-29');

-- El coprofesional de N067A y N067D (PRO2) tiene que tener alta vigente en el centro del
-- episodio (CB): sin ella, la fijación fallaría por una regla de T-034 que no es la de
-- este módulo. Se comprueba, no se supone.
select pg_temp.assert(
  exists (select 1 from public.perfiles_centros where perfil_id = :PRO2 and centro_id = :CB and hasta is null),
  'Fijación de T-012c: PRO2 tiene alta vigente en CB (el coprofesional de N067A/N067D)'
);

insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, coprofesional_id, fecha_sesion) values
  (:N067A, :P067, :EPI067A, :PRO1, :PRO2, date '2026-08-29'),
  (:N067B, :P067, :EPI067B, :PRO1, null,  date '2026-08-29'),
  (:N067C, :P067, :EPI067B, :PRO1, null,  date '2026-08-29'),
  (:N067D, :P067, :EPI067A, :PRO1, :PRO2, date '2026-08-29'),
  (:N067E, :P067, :EPI067A, :PRO1, null,  date '2026-08-29');

-- Ayudantes locales de este módulo (T-012c). Viven en pg_temp, como los de 00.
-- Sustituye UNA aparición exacta de `p_fragmento` en la definición `p_original` de una
-- función y la ejecuta: un mutante. Si el fragmento no aparece una sola vez, falla: el
-- mutante que no muta es una demostración que no demuestra nada.
create or replace function pg_temp.t012c_mutar(p_original text, p_fragmento text, p_reemplazo text)
returns void
language plpgsql
as $$
declare
  v_n integer;
begin
  v_n := (length(p_original) - length(replace(p_original, p_fragmento, ''))) / length(p_fragmento);
  if v_n <> 1 then
    raise exception 'FALLO: el fragmento «%» aparece % veces en la definición (debía ser exactamente una)', p_fragmento, v_n;
  end if;
  execute replace(p_original, p_fragmento, p_reemplazo);
end;
$$;

-- Deshace un mutante: reejecuta la definición guardada y exige que la función quede
-- byte a byte como estaba (la comparación va con la salida de pg_get_functiondef, la
-- misma con la que se guardó).
create or replace function pg_temp.t012c_restaurar(p_original text, p_firma regprocedure, p_rotulo text)
returns void
language plpgsql
as $$
begin
  execute p_original;
  perform pg_temp.assert(pg_get_functiondef(p_firma) = p_original, p_rotulo);
end;
$$;

-- El sobre con una o varias claves cambiadas (un `null` JSON incluido).
create or replace function pg_temp.t012c_sobre_con(p_sobre text, p_cambio jsonb)
returns text
language sql
immutable
as $$
  select (p_sobre::jsonb || p_cambio)::text;
$$;

-- El INSERT de una versión de prueba, con el sobre de `sobre_prueba()` y los cambios y
-- quitas que pide cada negativa. El mismo instante va a la columna y al sobre.
create or replace function pg_temp.t012c_neg(
  p_nota uuid, p_autor uuid, p_ts timestamptz,
  p_cambio jsonb default '{}'::jsonb, p_quitar text default null,
  p_alcance text default 'individual')
returns text
language sql
stable
as $$
  select format(
    $f$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
       values (%L, '{"t":"neg"}', %L, %L, %L, %L)$f$,
    p_nota,
    ((pg_temp.sobre_prueba(p_nota, p_autor, p_ts, '{"t":"neg"}'::jsonb, p_alcance => p_alcance)::jsonb || p_cambio)
       - coalesce(p_quitar, ''))::text,
    p_alcance, p_autor, p_ts);
$$;

-- `sqlstate · mensaje` del error de una sentencia, o `sin error`. Para comparar dos
-- caminos sin fijar el texto: C.perm compara lo que ve quien NO puede firmar.
create or replace function pg_temp.t012c_error(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'sin error';
exception when others then
  return sqlstate || ' · ' || sqlerrm;
end;
$$;
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
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"Nota"},"episodio_id":"e0050001-0000-4000-8000-000000000008","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000008","paciente_id":"d0050001-0000-4000-8000-000000000008","redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('e133f6910d8e08426954c27acb7832a3c148dca7f16c24bed3f4b70e52ec2ea6', 'hex'),
  'Vector congelado "genesis-minimo": pgcrypto reproduce la huella de TypeScript'
);

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"café"},"episodio_id":"e0050001-0000-4000-8000-000000000008","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000008","paciente_id":"d0050001-0000-4000-8000-000000000008","redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('93eb884b5d23062ec33cfe169392202ce9fa4a09874498439d669e62bd4c8af5', 'hex'),
  'Vector congelado "acentos-nfc": pgcrypto reproduce la huella de TypeScript'
);

select pg_temp.assert(
  extensions.digest(
    convert_to($vec${"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"control":"\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\b\t\n\u000b\f\r\u000e\u000f\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001a\u001b\u001c\u001d\u001e\u001f","exponente":100},"episodio_id":"e0050001-0000-4000-8000-000000000008","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000008","paciente_id":"d0050001-0000-4000-8000-000000000008","redactada_en_sesion":false}$vec$, 'UTF8')
    || decode(repeat('00', 32), 'hex'),
    'sha256'
  ) = decode('8b7a3e4f120076f7c2c941ef37cabe01f1e8ed569aba19f43edf52c0eb79eaf6', 'hex'),
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
-- sobre 32 ceros). T-012c: el vector es de la era 4, así que su nota_id, paciente_id,
-- episodio_id y fecha_sesion tienen que ser los de la cabecera de NVEC (por eso NVEC
-- lleva fecha_sesion fija en la fijación): el disparador los coteja.
\set VECGENESIS '\'{"abierta_en":"2026-08-29T09:12:03.123Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"11111111-1111-4111-8111-111111111111","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:20:00.000Z","cuerpo":{"texto":"Nota"},"episodio_id":"e0050001-0000-4000-8000-000000000008","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:20:00.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000008","paciente_id":"d0050001-0000-4000-8000-000000000008","redactada_en_sesion":false}\''

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NVEC, '{"texto":"Nota"}',
   :VECGENESIS,
   :ANA, timestamptz '2026-08-29T09:20:00.000Z');

select pg_temp.assert(
  (select huella from public.notas_clinicas_versiones where nota_id = :NVEC)
    = decode('e133f6910d8e08426954c27acb7832a3c148dca7f16c24bed3f4b70e52ec2ea6', 'hex'),
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

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, huella, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, decode(repeat('00', 32), 'hex'), %L, timestamptz '2026-08-29 09:30:00+00')$sql$,
    :NCADX, pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:00+00', '{"t":"neg"}'::jsonb), :PRO1),
  '42501',
  'los calcula fn_sellar_version_nota()',
  'Mandar huella a mano en el INSERT lanza 42501 (guarda 1; fn_sellar_version_nota la calcula)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, posicion_cadena, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 1, %L, timestamptz '2026-08-29 09:30:01+00')$sql$,
    :NCADX, pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:01+00', '{"t":"neg"}'::jsonb), :PRO1),
  '42501',
  'los calcula fn_sellar_version_nota()',
  'Mandar posicion_cadena a mano en el INSERT lanza 42501 (guarda 1; fn_sellar_version_nota la calcula)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:02+00')$sql$,
    :NCADX,
    left(pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:02+00', '{"t":"neg"}'::jsonb), -1) || ',"extra":1}',
    :PRO1),
  '23514',
  'exactamente las claves',
  'Un sobre con una clave de más lanza 23514 (comprobación 6.1: claves exactas)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:03+00')$sql$,
    :NCADX,
    -- Sobre construido para PRO2, insertado con autor_id = PRO1: no coinciden.
    pg_temp.sobre_prueba(:NCADX, :PRO2, timestamptz '2026-08-29 09:30:03+00', '{"t":"neg"}'::jsonb),
    :PRO1),
  '23514',
  'El autor_id del sobre no coincide con la columna autor_id',
  'Un sobre con autor_id distinto del de la fila lanza 23514 (comprobación 6.2)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, %L)$sql$,
    :NCADX,
    -- Sobre con creada_en=09:30:04, columna creada_en=09:30:05: no coinciden.
    pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:04+00', '{"t":"neg"}'::jsonb),
    :PRO1,
    timestamptz '2026-08-29 09:30:05+00'),
  '23514',
  'creada_en y firmada_en del sobre deben ser iguales',
  'Un sobre con creada_en distinto de la columna creada_en lanza 23514 (comprobación 6.7)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29 09:30:06+00')$sql$,
    :NCADX,
    -- cita_id null pero redactada_en_sesion = true: viola la coherencia 6.9 (ADR-046).
    pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:06+00', '{"t":"neg"}'::jsonb,
                          null, null, null, null, true),
    :PRO1),
  '23514',
  'Sin cita_id, redactada_en_sesion debe ser false',
  'cita_id null con redactada_en_sesion=true lanza 23514 (comprobación 6.9, ADR-046)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, anotaciones_reservadas, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, %L, timestamptz '2026-08-29 09:30:07+00')$sql$,
    :NCADX,
    -- Sobre con anotaciones_reservadas='reservado-sobre', columna='reservado-fila': no coinciden.
    pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:07+00', '{"t":"neg"}'::jsonb, 'reservado-sobre'),
    'reservado-fila',
    :PRO1),
  '23514',
  'anotaciones_reservadas del sobre no coincide con la columna',
  'Un sobre con anotaciones_reservadas distinto de la columna lanza 23514 (comprobación 6.4, ADR-027)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, motivo_cambio, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, %L, timestamptz '2026-08-29 09:30:08+00')$sql$,
    :NCADX,
    -- Sobre con motivo_cambio='motivo-sobre', columna='motivo-fila': no coinciden.
    pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:08+00', '{"t":"neg"}'::jsonb, null, 'motivo-sobre'),
    'motivo-fila',
    :PRO1),
  '23514',
  'motivo_cambio del sobre no coincide con la columna motivo_cambio',
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
    '{"abierta_en":"2026-08-29T09:30:09.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":null,"cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:09.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:09.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'no coincide con la columna autor_id',
  'REGRESIÓN — autor_id JSON null lanza 23514 POR LA 6.2 (era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:10.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:10.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:10.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":null,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:10.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'esquema_version del sobre no coincide',
  'REGRESIÓN — esquema_version JSON null lanza 23514 (comprobación 6.5; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:11.000Z')$sql$,
    :NCADX,
    -- esquema_version como CADENA "4", no número: el hallazgo BAJA 10 (subsumido en el
    -- arreglo ALTA) — un cast a smallint la habría colado igual que el número 4. La cadena
    -- lleva el valor VIGENTE (4 desde T-012c, 3 desde T-012a): con el DEFAULT de la columna
    -- en 4, una cadena "2" fallaría igual por el VALOR y dejaría de demostrar la distinción
    -- de TIPO.
    '{"abierta_en":"2026-08-29T09:30:11.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:11.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":"4","fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:11.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'esquema_version del sobre no coincide',
  'REGRESIÓN — esquema_version como cadena "4" (no número) lanza 23514 (comprobación 6.5)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:12.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:12.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":null,"cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:12.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'creada_en y firmada_en del sobre deben ser iguales',
  'REGRESIÓN — creada_en JSON null lanza 23514 (comprobación 6.7; era el hueco del hallazgo ALTA)'
);

select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:13.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:13.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:13.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":null,"margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
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
    '{"abierta_en":"2026-08-29T09:30:14.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"22222222-2222-4222-8222-222222222222","autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:14.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:14.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
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
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:15.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:15.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:15.000Z","cuerpo":{"control":"\u0000"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:15.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '22P05',
  'Unicode',
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
    '{"abierta_en":"esto-no-es-una-fecha","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:16.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
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
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, algoritmo_version, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 2, %L, timestamptz '2026-08-29 09:30:17+00')$sql$,
    :NCADX, pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:17+00', '{"t":"neg"}'::jsonb), :PRO1),
  '42501',
  'algoritmo_version la fija la era vigente',
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
    pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:30:18+00', '{"t":"neg"}'::jsonb,
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
-- tomaba el DEFAULT (3 entonces; 4 desde T-012c) y la 6.5 ("esquema_version" 2 ≠ 3)
-- lanzaba 23514 ANTES de llegar a la 6.10 — la prueba pasaba en verde por el motivo
-- equivocado y no demostraba nada sobre "alcance":null. Arreglo de TRES partes:
--   1. el literal lleva "esquema_version":4 (T-012c; 3 en T-012a), coherente con la columna;
--   2. la columna esquema_version se fija explícita en el INSERT, sin depender del DEFAULT;
--   3. la aserción exige el MENSAJE de la 6.10, no solo el 23514 — las diez
--      comprobaciones lanzan todas 23514, así que el código por sí solo nunca puede
--      distinguir «falló por donde digo» de «falló antes». Si mañana alguien reescribe
--      la 6.10 como `->>` + `<>`, esta fila se sella y la aserción se pone ROJA por
--      «debía lanzar y no lanzó nada», que es justo lo que el ticket existe para impedir.
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, esquema_version, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 4, %L, timestamptz '2026-08-29T09:30:19.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:19.000Z","alcance":null,"anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:19.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:19.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'El alcance del sobre no coincide',
  'Un sobre con "alcance":null (JSON null) lanza 23514 POR LA 6.10 (ADR-057)'
);

-- Gemela positiva de las anteriores: NCADX sigue sin ninguna versión — ninguna de las
-- negativas coló nada.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas_versiones where nota_id = %L', :NCADX)) = 0,
  'GEMELA POSITIVA: NCADX sigue sin versiones tras las dieciocho negativas de T-005/T-012a'
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
   pg_temp.sobre_prueba(:NCONJ, :PRO1, timestamptz '2026-08-29 09:30:20+00', '{"t":"conjunta-otra-vez"}'::jsonb,
                         null, 'Aclaración conjunta (T-012a)', p_alcance => 'conjunta'),
   'conjunta', 'Aclaración conjunta (T-012a)', :PRO1, timestamptz '2026-08-29 09:30:20+00');

select pg_temp.assert(
  (select posicion_cadena from public.notas_clinicas_versiones
    where nota_id = :NCONJ and cuerpo = '{"t":"conjunta-otra-vez"}') = 3,
  'GEMELA POSITIVA: un sobre con alcance=''conjunta'' coherente con la columna SÍ se sella (comprobación 6.10, posición 3 de la cadena de P1)'
);

-- =========================================================================
-- C (T-012c) · El sobre de la era 4 sella la cabecera: nota_id, paciente_id,
--     episodio_id, autor_id, fecha_sesion y coprofesional_id (comprobaciones
--     6.11-6.16), y el paso 0 del disparador (quién puede firmar).
--
--     Las negativas se construyen con pg_temp.t012c_neg(): el sobre es el de
--     sobre_prueba() —coherente con la cabecera por construcción— salvo la
--     única clave que la prueba altera. Las seis comprobaciones lanzan 23514,
--     así que cada negativa exige el FRAGMENTO de su mensaje (assert_lanza_
--     codigo_msg), y la demostración de guarda de más abajo quita cada una a
--     su vez: con la guarda fuera, la negativa (a) de cada comprobación se
--     SELLA (assert_no_lanza), y el disparador vuelve a su definición exacta.
-- =========================================================================

-- Las definiciones vigentes, para los mutantes. pg_get_functiondef() devuelve la
-- definición completa (`create or replace function …`): reejecutarla restaura.
select pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) as sellar_original,
       pg_get_functiondef('public.fn_exigir_episodio_en_nota_conjunta()'::regprocedure) as conjunta_original,
       pg_get_functiondef('public.verificar_cadena_huellas(uuid)'::regprocedure) as verif_original
\gset

-- Demostración «CON EL ARREGLO DESHECHO» de la regresión de 6.2 (arriba, en C de T-005): la 6.2 reescrita con `<>` (el hueco de T-005: con
-- `"autor_id":null`, `NULL <> x` es falso y no lanza). La misma inserción ya NO la para la 6.2
-- sino la 6.14 (mismo 23514, otro mensaje: «con el autor de la cabecera»), y por eso la
-- aserción de arriba, que pide el mensaje de la 6.2, cambia de resultado.
savepoint t012c_m62;
select pg_temp.t012c_mutar(:'sellar_original', '(v_contenido -> ''autor_id'') is distinct from to_jsonb(new.autor_id::text)', '(v_contenido ->> ''autor_id'') <> new.autor_id::text');
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, %L, timestamptz '2026-08-29T09:30:09.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:30:09.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":null,"cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:09.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000001","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:09.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000000","paciente_id":"d0050001-0000-4000-8000-000000000001","redactada_en_sesion":false}',
    :PRO1),
  '23514',
  'con el autor de la cabecera',
  'REGRESIÓN con la 6.2 reescrita con <> — el autor_id null ya no lo para la 6.2 sino la 6.14: la aserción de la 6.2 depende de que la 6.2 sea `is distinct from`');
rollback to savepoint t012c_m62;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'REGRESIÓN 6.2 · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- 6.11 · nota_id del sobre = nota_id de la fila
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:01+00', jsonb_build_object('nota_id', :NCADA::text)),
  '23514', 'El nota_id del sobre no coincide',
  'C.11a · el sobre dice otra nota (NCADA): 23514 por la 6.11');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:02+00', jsonb_build_object('nota_id', null::text)),
  '23514', 'El nota_id del sobre no coincide',
  'C.11b · nota_id JSON null: 23514 por la 6.11');

-- 6.12 · paciente_id del sobre = paciente de la cabecera
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:03+00', jsonb_build_object('paciente_id', :PDEMO::text)),
  '23514', 'El paciente_id del sobre no coincide',
  'C.12a · el sobre dice otro paciente (PDEMO): 23514 por la 6.12');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:04+00', jsonb_build_object('paciente_id', null::text)),
  '23514', 'El paciente_id del sobre no coincide',
  'C.12b · paciente_id JSON null: 23514 por la 6.12');

-- 6.13 · episodio_id del sobre = episodio de la cabecera
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:05+00', jsonb_build_object('episodio_id', :EPI067A::text)),
  '23514', 'El episodio_id del sobre no coincide',
  'C.13a · el sobre dice otro episodio (EPI067A): 23514 por la 6.13');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:06+00', jsonb_build_object('episodio_id', null::text)),
  '23514', 'El episodio_id del sobre no coincide',
  'C.13b · episodio_id JSON null: 23514 por la 6.13');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:07+00', jsonb_build_object('episodio_id', 5)),
  '23514', 'El episodio_id del sobre no coincide',
  'C.13c · episodio_id numérico: 23514 por la 6.13');

-- 6.14 · autor del sobre = autor de la CABECERA (no solo el de la fila: la 6.2). El sobre
-- y la columna dicen PRO2, coherentes entre sí; la nota es de PRO1.
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO2, timestamptz '2026-08-29 09:35:08+00'),
  '23514', 'no coincide con el autor de la cabecera',
  'C.14 · sobre y columna dicen PRO2 pero la nota es de PRO1: 23514 por la 6.14, no por la 6.2');

-- 6.15 · fecha_sesion
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:09+00', jsonb_build_object('fecha_sesion', '2026-08-30'::text)),
  '23514', 'La fecha_sesion del sobre no coincide',
  'C.15a · otra fecha (30-08 frente a 29-08): 23514 por la 6.15');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:10+00', jsonb_build_object('fecha_sesion', null::text)),
  '23514', 'La fecha_sesion del sobre no coincide',
  'C.15b · fecha_sesion JSON null: 23514 por la 6.15');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:11+00', jsonb_build_object('fecha_sesion', '29/08/2026'::text)),
  '23514', 'La fecha_sesion del sobre no coincide',
  'C.15c · la misma fecha en otro formato (29/08/2026): 23514 por la 6.15 (el formato es AAAA-MM-DD)');

-- 6.15 · la ERA cuenta: una cabecera '2026-08-29 BC' no coincide con un sobre «2026-08-29».
-- N067B no tiene versiones, así que su cabecera se puede mover (savepoint: se deshace). El
-- sobre que construye sobre_prueba() usa to_char sin era, que es justo el sobre del ataque.
savepoint t012c_bc;
update public.notas_clinicas set fecha_sesion = date '2026-08-29 BC' where id = :N067B;
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:N067B, :PRO1, timestamptz '2026-08-29 09:35:30+00'),
  '23514', 'La fecha_sesion del sobre no coincide',
  'C.15d · cabecera 2026-08-29 BC y sobre «2026-08-29»: 23514 por la 6.15 (la era no se pierde)');
-- Gemela positiva: el sobre que conserva la era SÍ se sella.
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:N067B, :PRO1, timestamptz '2026-08-29 09:35:31+00', jsonb_build_object('fecha_sesion', '2026-08-29 BC'::text)),
  'C.15d · gemela: el sobre «2026-08-29 BC» sobre la cabecera BC SÍ se sella');
rollback to savepoint t012c_bc;
-- Mutante: la 6.15 con el to_char de siempre (sin era) deja pasar el sobre «2026-08-29».
savepoint t012c_bc_m;
update public.notas_clinicas set fecha_sesion = date '2026-08-29 BC' where id = :N067B;
select pg_temp.t012c_mutar(:'sellar_original', 'to_jsonb(to_char(v_fecha_sesion, ''YYYY-MM-DD'') || case when v_fecha_sesion < date ''0001-01-01'' then '' BC'' else '''' end) then', 'to_jsonb(to_char(v_fecha_sesion, ''YYYY-MM-DD'')) then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:N067B, :PRO1, timestamptz '2026-08-29 09:35:30+00'),
  'C.15d · SIN la era en la 6.15 el sobre «2026-08-29» sobre la cabecera BC se sella: la negativa depende de ella');
rollback to savepoint t012c_bc_m;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.15d · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- 6.16 · coprofesional_id: PRIMERO, antes de sellar ninguna versión de N067A.
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:N067A, :PRO1, timestamptz '2026-08-29 09:35:12+00', jsonb_build_object('coprofesional_id', :TEC1::text)),
  '23514', 'El coprofesional_id del sobre no coincide',
  'C.16a · N067A tiene a PRO2 de coprofesional y el sobre dice TEC1: 23514 por la 6.16');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:N067A, :PRO1, timestamptz '2026-08-29 09:35:13+00', jsonb_build_object('coprofesional_id', null::text)),
  '23514', 'El coprofesional_id del sobre no coincide',
  'C.16b · N067A tiene coprofesional y el sobre dice null: 23514 por la 6.16');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:14+00', jsonb_build_object('coprofesional_id', :PRO2::text)),
  '23514', 'El coprofesional_id del sobre no coincide',
  'C.16c · NCADX no tiene coprofesional y el sobre dice PRO2: 23514 por la 6.16');
select pg_temp.assert_lanza_codigo_msg(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:15+00', '{}'::jsonb, 'coprofesional_id'),
  '23514', 'exactamente las claves',
  'C.16d · un sobre SIN la clave coprofesional_id (16 claves): 23514 por la 6.1; la clave es obligatoria aunque valga null');

-- Un sobre de la era 3 (doce claves, esquema 3): ya no se sella.
select pg_temp.assert_lanza_codigo_msg(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, esquema_version, autor_id, creada_en)
         values (%L, '{"t":"neg"}', %L, 3, %L, timestamptz '2026-08-29T09:35:16.000Z')$sql$,
    :NCADX,
    '{"abierta_en":"2026-08-29T09:35:16.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"b0030001-0000-4000-8000-000000000002","cita_id":null,"creada_en":"2026-08-29T09:35:16.000Z","cuerpo":{"t":"neg"},"esquema_version":3,"firmada_en":"2026-08-29T09:35:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"redactada_en_sesion":false}',
    :PRO1),
  '23514', 'exactamente las claves',
  'C.era3 · un sobre de la era 3 (doce claves, esquema_version 3) lanza 23514 por la 6.1: la era 3 ya no se sella');

select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas_versiones where nota_id in (%L, %L)', :NCADX, :N067A)) = 0,
  'GEMELA POSITIVA: ni NCADX ni N067A tienen versiones tras las negativas de la era 4');

-- Demostración de guarda de 6.11-6.16: con cada comprobación QUITADA (la condición
-- compara el sobre consigo mismo), la negativa (a) de esa comprobación se SELLA. Cada
-- mutante vive en un savepoint y la definición vuelve a ser idéntica a la guardada.
savepoint t012c_m611;
select pg_temp.t012c_mutar(:'sellar_original', 'to_jsonb(new.nota_id::text) then', '(v_contenido -> ''nota_id'') then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:01+00', jsonb_build_object('nota_id', :NCADA::text)),
  'C.11a · SIN la 6.11 el sobre que dice otra nota se sella: la negativa depende de ella');
rollback to savepoint t012c_m611;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.11a · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

savepoint t012c_m612;
select pg_temp.t012c_mutar(:'sellar_original', 'to_jsonb(v_paciente_id::text) then', '(v_contenido -> ''paciente_id'') then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:03+00', jsonb_build_object('paciente_id', :PDEMO::text)),
  'C.12a · SIN la 6.12 el sobre que dice otro paciente se sella: la negativa depende de ella');
rollback to savepoint t012c_m612;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.12a · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

savepoint t012c_m613;
select pg_temp.t012c_mutar(:'sellar_original', 'to_jsonb(v_episodio_id::text) then', '(v_contenido -> ''episodio_id'') then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:05+00', jsonb_build_object('episodio_id', :EPI067A::text)),
  'C.13a · SIN la 6.13 el sobre que dice otro episodio se sella: la negativa depende de ella');
rollback to savepoint t012c_m613;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.13a · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

savepoint t012c_m614;
select pg_temp.t012c_mutar(:'sellar_original', 'to_jsonb(v_autor_cabecera::text) then', '(v_contenido -> ''autor_id'') then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:NCADX, :PRO2, timestamptz '2026-08-29 09:35:08+00'),
  'C.14 · SIN la 6.14 un sobre de PRO2 sobre una nota de PRO1 se sella: la negativa depende de ella');
rollback to savepoint t012c_m614;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.14 · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

savepoint t012c_m615;
select pg_temp.t012c_mutar(:'sellar_original', 'to_jsonb(to_char(v_fecha_sesion, ''YYYY-MM-DD'') || case when v_fecha_sesion < date ''0001-01-01'' then '' BC'' else '''' end) then', '(v_contenido -> ''fecha_sesion'') then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:NCADX, :PRO1, timestamptz '2026-08-29 09:35:09+00', jsonb_build_object('fecha_sesion', '2026-08-30'::text)),
  'C.15a · SIN la 6.15 el sobre con otra fecha se sella: la negativa depende de ella');
rollback to savepoint t012c_m615;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.15a · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

savepoint t012c_m616;
select pg_temp.t012c_mutar(:'sellar_original', 'coalesce(to_jsonb(v_coprofesional_id::text), ''null''::jsonb) then', '(v_contenido -> ''coprofesional_id'') then');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:N067A, :PRO1, timestamptz '2026-08-29 09:35:12+00', jsonb_build_object('coprofesional_id', :TEC1::text)),
  'C.16a · SIN la 6.16 el sobre con otro coprofesional se sella: la negativa depende de ella');
rollback to savepoint t012c_m616;
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.16a · tras deshacer el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- Gemelas positivas de 6.11-6.16: la versión `conjunta` de N067A (el sobre dice EPI067A y
-- coprofesional PRO2, como la cabecera) y la individual de N067C (coprofesional null) SÍ se
-- sellan. Son las filas que la sección F manipulará por debajo.
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:N067A, :PRO1, timestamptz '2026-08-29 09:36:00+00', '{}'::jsonb, null, 'conjunta'),
  'C.gemela · la versión conjunta de N067A (episodio EPI067A, coprofesional PRO2) se sella');
select pg_temp.assert_no_lanza(
  pg_temp.t012c_neg(:N067C, :PRO1, timestamptz '2026-08-29 09:36:01+00'),
  'C.gemela · la versión individual de N067C (sin coprofesional, el sobre lleva null) se sella');

select pg_temp.assert(
  (select contenido_canonico::jsonb ->> 'coprofesional_id' from public.notas_clinicas_versiones where nota_id = :N067A) = :PRO2::text
  and (select contenido_canonico::jsonb -> 'coprofesional_id' from public.notas_clinicas_versiones where nota_id = :N067C) = 'null'::jsonb
  and (select contenido_canonico::jsonb ->> 'episodio_id' from public.notas_clinicas_versiones where nota_id = :N067A) = :EPI067A::text
  and (select contenido_canonico::jsonb ->> 'fecha_sesion' from public.notas_clinicas_versiones where nota_id = :N067A) = '2026-08-29',
  'C.gemela · los sobres sellados llevan la cabecera de su nota (coprofesional, episodio y fecha_sesion)');

-- Una vez sellada la primera versión, la cabecera no se reatribuye (fn_congelar_cabecera_sellada):
-- el sobre sella seis campos, y quitar al coprofesional por debajo los desalinearía.
select pg_temp.assert_lanza_codigo_msg(
  $q$update public.notas_clinicas set coprofesional_id = null where id = 'f0670001-0000-4000-8000-000000000001'$q$,
  '42501', 'el sobre canónico de la era 4 sella',
  'C.congelar · con N067A ya firmada, quitarle el coprofesional lanza 42501 (la cabecera sellada no se reatribuye)');
-- Gemela: la misma reatribución sobre una nota SIN versiones (N067B) es legítima.
savepoint t012c_cong;
select pg_temp.assert_no_lanza(
  format('update public.notas_clinicas set coprofesional_id = %L where id = %L', :PRO2, :N067B),
  'C.congelar · gemela: reatribuir el coprofesional de N067B (sin versiones) SÍ se permite');
rollback to savepoint t012c_cong;

-- ---------------------------------------------------------------------------
-- C.perm · Quién puede firmar (paso 0 del disparador + RLS de alta). Un
-- `authenticated` solo firma su propia nota con la historia desbloqueada; el
-- resto recibe SIEMPRE el mismo error, exista o no la nota y sea cual sea su
-- sobre: ni un 23514 ni un P0002 distinto le dicen si la nota existe, de quién
-- es o qué paciente tiene.
-- ---------------------------------------------------------------------------

-- C.perm.0 · la RLS de alta no ha cambiado (la copia es la que Postgres devuelve tras
-- `db reset`, con los blancos colapsados: el salto de línea de pg_policies no importa).
select pg_temp.assert(
  regexp_replace((select with_check from pg_policies
                   where schemaname = 'public' and tablename = 'notas_clinicas_versiones'
                     and policyname = 'notas_clinicas_versiones_alta'), '\s+', ' ', 'g')
  = $wc$(( SELECT historia_desbloqueada() AS historia_desbloqueada) AND (autor_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM notas_clinicas n WHERE ((n.id = notas_clinicas_versiones.nota_id) AND (n.autor_id = ( SELECT auth.uid() AS uid))))))$wc$,
  'C.perm.0 · la política notas_clinicas_versiones_alta es la de siempre (historia desbloqueada, autor = yo, la nota es mía)');

-- Los sobres, como postgres (bajo `authenticated` la RLS de notas_clinicas decidiría qué cabecera se ve).
select pg_temp.sobre_prueba(:N067B, :PRO2, timestamptz '2026-08-29 09:37:00+00', '{"t":"neg"}'::jsonb) as sobre_b,
       pg_temp.t012c_sobre_con(
         pg_temp.sobre_prueba(:NCADX, :PRO2, timestamptz '2026-08-29 09:37:00+00', '{"t":"neg"}'::jsonb),
         jsonb_build_object('paciente_id', :PDEMO::text)) as sobre_x,
       pg_temp.sobre_prueba(:NFANTASMA, :PRO2, timestamptz '2026-08-29 09:37:00+00', '{"t":"neg"}'::jsonb) as sobre_n,
       pg_temp.sobre_prueba(:NFANTASMA, :PRO2, timestamptz '2026-08-29 09:37:00+00', '{"t":"neg"}'::jsonb, p_alcance => 'conjunta') as sobre_c,
       pg_temp.sobre_prueba(:N067D, :PRO1, timestamptz '2026-08-29 09:37:00+00', '{"t":"neg"}'::jsonb) as sobre_d,
       pg_temp.sobre_prueba(:N067E, :PRO1, timestamptz '2026-08-29 09:37:01+00', '{"t":"firma"}'::jsonb) as sobre_e
\gset

-- Los PIN de historia se FIJAN aquí (no se suponen los que dejó 13-cuentas): fijar_pin_historia()
-- exige el segundo factor reciente, de ahí `como_con_2fa`. Un upsert: vale con o sin PIN previo.
call pg_temp.como_con_2fa(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:PRO2); select public.fijar_pin_historia('222222'); call pg_temp.reset_sesion();

-- PRO2 (profesional, con PIN) desbloquea y firma «como» el autor de una nota ajena (N067B),
-- con un sobre incoherente con la cabecera (NCADX, paciente de PDEMO), sobre una nota que
-- no existe (NFANTASMA), y una versión `conjunta` de la nota que no existe.
call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')),
  'C.perm · PRO2 desbloquea su historia (el paso 0 pide la historia desbloqueada, y la tiene)');
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :N067B, :'sobre_b', :PRO2)) as err_b \gset
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :NCADX, :'sobre_x', :PRO2)) as err_x \gset
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :NFANTASMA, :'sobre_n', :PRO2)) as err_n \gset
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'conjunta', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :NFANTASMA, :'sobre_c', :PRO2)) as err_c \gset
call pg_temp.reset_sesion();

select pg_temp.assert(
  :'err_b' = :'err_x' and :'err_b' = :'err_n' and :'err_b' = :'err_c'
  and :'err_b' like '42501 · No puedes firmar una versión de esta nota%',
  'C.perm · las cuatro firmas ajenas (nota de otro, sobre incoherente, nota inexistente, conjunta) dan el MISMO error: 42501, No puedes firmar una versión de esta nota (' || :'err_b' || ')');

-- Ventana cerrada: PRO1 firma su propia nota, pero con la ventana caducada recibe el mismo error.
savepoint t012c_perm;
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'C.perm · PRO1 desbloquea su historia');
call pg_temp.reset_sesion();
update public.desbloqueos_historia
   set concedido_en = now() - interval '1 hour',
       caduca_en    = now() - interval '1 minute'
 where perfil_id = :PRO1 and revocado_en is null;
call pg_temp.como(:PRO1);
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :N067D, :'sobre_d', :PRO1)) as err_d \gset
call pg_temp.reset_sesion();
rollback to savepoint t012c_perm;
call pg_temp.reset_sesion();
select pg_temp.assert(:'err_d' = :'err_b',
  'C.perm · el AUTOR con la ventana de desbloqueo caducada recibe el mismo error que quien no es el autor (' || :'err_d' || ')');

-- Demostración de guarda del paso 0: sin él, los mismos tres intentos de PRO2 fallan por
-- OTRAS comprobaciones, y distintas entre sí (el mensaje delata la nota).
savepoint t012c_perm_m;
select pg_temp.t012c_mutar(:'sellar_original', 'if not coalesce(', 'if false and coalesce(');
call pg_temp.como(:PRO2);
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :N067B, :'sobre_b', :PRO2)) as err_b2 \gset
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :NCADX, :'sobre_x', :PRO2)) as err_x2 \gset
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'individual', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :NFANTASMA, :'sobre_n', :PRO2)) as err_n2 \gset
call pg_temp.reset_sesion();
rollback to savepoint t012c_perm_m;
call pg_temp.reset_sesion();
select pg_temp.assert(
  :'err_b2' like '23514 · El autor_id del sobre no coincide con el autor de la cabecera%' and :'err_x2' like '23514 · El paciente_id%' and :'err_n2' like 'P0002%'
  and :'err_b2' <> :'err_x2' and :'err_b2' <> :'err_n2' and :'err_x2' <> :'err_n2',
  'C.perm · SIN el paso 0, las tres firmas dan errores distintos (' || :'err_b2' || ' / ' || :'err_x2' || ' / ' || :'err_n2' || '): el paso 0 es lo que los iguala');
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original',
  'C.perm · tras deshacer el mutante del paso 0, fn_sellar_version_nota() es idéntica a la guardada');

-- Y el disparador de las conjuntas: con su condición invertida, la versión `conjunta` sobre
-- una nota inexistente lanza SU error (no el del paso 0), lo que prueba que la cuarta
-- firma de arriba pasó por él y que el paso 0 la paró antes de que pudiera delatar nada.
savepoint t012c_perm_c;
select pg_temp.t012c_mutar(:'conjunta_original', 'if exists (', 'if not exists (');
call pg_temp.como(:PRO2);
select pg_temp.t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
  values (%L, '{"t":"neg"}', %L, 'conjunta', %L, timestamptz '2026-08-29 09:37:00+00')$sql$, :NFANTASMA, :'sobre_c', :PRO2)) as err_c2 \gset
call pg_temp.reset_sesion();
rollback to savepoint t012c_perm_c;
call pg_temp.reset_sesion();
select pg_temp.assert(:'err_c2' like '23514 · Una versión de nota con alcance conjunta%',
  'C.perm · con la condición del disparador de conjuntas invertida, la cuarta firma lanza su mensaje (' || :'err_c2' || ')');
select pg_temp.assert(pg_get_functiondef('public.fn_exigir_episodio_en_nota_conjunta()'::regprocedure) = :'conjunta_original',
  'C.perm · tras deshacer el mutante, fn_exigir_episodio_en_nota_conjunta() es idéntica a la guardada');

-- Gemela positiva: la PRIMERA firma de un `authenticated` del banco. PRO1, autor de N067E,
-- con la historia desbloqueada y un sobre de su nota, sí firma.
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'C.perm · PRO1 desbloquea su historia para firmar N067E');
-- T-036 (E.6): desde 6.17-6.24 un `authenticated` solo firma el borrador vigente de su nota, fechado
-- con el reloj de la base. El borrador lo deja postgres (como el guardado de la aplicación) y el
-- sobre se construye con su `abierta_en` y con `creada_en` = el reloj de la base (constante en el banco).
call pg_temp.reset_sesion();
update public.notas_clinicas
   set borrador_contenido = '{"texto":"firma","reservadas":""}', borrador_autor_id = :PRO1
 where id = :N067E;
select date_trunc('milliseconds', now()) as t0_perm,
       pg_temp.sobre_prueba(:N067E, :PRO1, date_trunc('milliseconds', now()), '{"texto":"firma"}'::jsonb,
         p_abierta_en => (select borrador_abierta_en from public.notas_clinicas where id = :N067E)) as sobre_e36
\gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(
  format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en)
    values (%L, '{"texto":"firma"}', %L, 'individual', %L, %L)$sql$, :N067E, :'sobre_e36', :PRO1, :'t0_perm'),
  'C.perm · GEMELA POSITIVA: PRO1, autor de N067E con la historia desbloqueada, SÍ firma su propia nota como authenticated');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.notas_clinicas_versiones where nota_id = :N067E) = 1
  and (select autor_id from public.notas_clinicas_versiones where nota_id = :N067E) = :PRO1::uuid,
  'C.perm · la firma de PRO1 quedó sellada, con él de autor');

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
     '{"abierta_en":"2026-08-29T09:30:16.000Z","alcance":"individual","anotaciones_reservadas":null,"autor_id":"22222222-2222-4222-8222-222222222222","cita_id":null,"coprofesional_id":null,"creada_en":"2026-08-29T09:30:16.000Z","cuerpo":{"t":"neg"},"episodio_id":"e0050001-0000-4000-8000-000000000009","esquema_version":4,"fecha_sesion":"2026-08-29","firmada_en":"2026-08-29T09:30:16.000Z","margen_sesion_minutos":null,"motivo_cambio":null,"nota_id":"f0050001-0000-4000-8000-000000000009","paciente_id":"d0050001-0000-4000-8000-000000000009","redactada_en_sesion":false}',
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
   pg_temp.sobre_prueba(:NCADA, :PRO1, timestamptz '2026-08-29 09:31:00+00', '{"t":"cad-a"}'::jsonb),
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
    :NCADX, pg_temp.sobre_prueba(:NCADX, :PRO1, timestamptz '2026-08-29 09:31:01+00', '{"t":"dup"}'::jsonb),
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
   pg_temp.sobre_prueba(:NCADB, :PRO1, timestamptz '2026-08-29 09:31:02+00', '{"t":"cad-b"}'::jsonb),
   1, :PRO1, timestamptz '2026-08-29 09:31:02+00');

select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.notas_clinicas_versiones where nota_id = %L and algoritmo_version = 1', :NCADB)) = 1,
  'GEMELA POSITIVA: un INSERT con algoritmo_version = 1 explícito entra y queda en la era vigente'
);

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NCADC, '{"t":"cad-c"}',
   pg_temp.sobre_prueba(:NCADC, :PRO1, timestamptz '2026-08-29 09:31:03+00', '{"t":"cad-c"}'::jsonb),
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
   pg_temp.sobre_prueba(:NCOT, :PRO1, timestamptz '2026-08-29 09:40:00.123+00', '{"t":"cot-1"}'::jsonb),
   :PRO1, timestamptz '2026-08-29 09:40:00.123+00');

insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, anotaciones_reservadas, motivo_cambio, autor_id, creada_en) values
  (:NCOT, '{"t":"cot-2"}',
   pg_temp.sobre_prueba(:NCOT, :PRO1, timestamptz '2026-08-29 09:41:00.456+00', '{"t":"cot-2"}'::jsonb,
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
  format('esquema_version = %s', 3),
  format('esquema_version = %s', 4),
  array['sobre_no_coincide_con_fila@1'],
  'F.8 · esquema_version cambiado por debajo (4 -> 3): el verificador señala exactamente esa versión (comprobación 6.5)'
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

-- Demostración de guarda (.claude/rules/pruebas.md): se reejecuta la definición vigente
-- SIN la línea de `firmada_en` (T-012c: ya no se copia el verificador a mano, que era un
-- texto pegado que se desincronizaba con cada migración: el mutante se construye con
-- pg_get_functiondef() guardado en la sección C), y se comprueba que la fila de arriba
-- deja de señalarse; luego se restaura la definición exacta.
select pg_temp.t012c_mutar(:'verif_original', '(c.sobre -> ''firmada_en'')', '(c.sobre -> ''creada_en'')');

select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PCOT)) = 0,
  'F.9b · demostración de guarda: SIN la línea de firmada_en en el predicado, la MISMA fila con firmada_en desalineado ya no se señala — la cadena vuelve a darse por sana. Prueba que la aserción de arriba depende de esa línea y no de otra.'
);

-- Se restaura la definición EXACTA (con la línea de firmada_en).
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.9b · N1: la definición restaurada es idéntica a la guardada antes del mutante');
select pg_temp.assert(
  not has_function_privilege('authenticated', 'public.verificar_cadena_huellas(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.verificar_cadena_huellas(uuid)', 'execute'),
  'F.9b · tras restaurar, verificar_cadena_huellas(uuid) sigue sin EXECUTE para anon ni authenticated');

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

-- =========================================================================
-- F (T-012c) · El verificador coteja el sobre con la fila Y con la CABECERA.
--     Cada escenario altera UNA cosa por debajo (cerrojos levantados), exige que
--     verificar_cadena_huellas(P067) señale exactamente la versión, y restaura.
--     Cuando la comprobación tiene su propia línea en el verificador, un mutante
--     (t012c_mutar sobre la definición guardada en C) la quita y el escenario deja
--     de señalarse: la aserción depende de esa línea y no de otra. Un escenario
--     cuyo cambio dispararía DOS líneas a la vez (p. ej. mover una versión a otra
--     nota con otro episodio) no se pone con mutante hasta usar un gemelo de
--     cabecera (N067D) para que solo se encienda una.
-- =========================================================================

select count(*) as n067_versiones from public.notas_clinicas_versiones where paciente_id = :P067
\gset

select pg_temp.assert(
  :n067_versiones = 3 and (select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.12 · partida: P067 tiene tres versiones (N067A, N067C, N067E) y la cadena está sana');

-- F.12 · nota_id del sobre (6.11). Se mueve la versión de N067A a N067B por debajo.
update public.notas_clinicas_versiones set nota_id = :N067B where nota_id = :N067A;
select pg_temp.assert(
  (select array_agg(motivo order by motivo) from public.verificar_cadena_huellas(:P067)) = array['sobre_no_coincide_con_fila']
  and (select extensions.digest(convert_to(contenido_canonico, 'UTF8') || huella_anterior, 'sha256') = huella
         from public.notas_clinicas_versiones where nota_id = :N067B),
  'F.12 · nota_id cambiado por debajo: una fila, sobre_no_coincide_con_fila, y la huella sigue cuadrando con sus bytes (solo el cotejo con la fila lo ve)');
update public.notas_clinicas_versiones set nota_id = :N067A where nota_id = :N067B;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.12 · restaurado, P067 vuelve a estar sana');

-- F.12b · lo mismo con N067D (la gemela de cabecera de N067A: mismo episodio y mismo
-- coprofesional), para que SOLO la línea de nota_id se encienda; con ella quitada, no se señala.
update public.notas_clinicas_versiones set nota_id = :N067D where nota_id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.12b · nota_id movido a N067D (cabecera gemela): una fila, la de la línea 6.11');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(c.nota_id::text)', '(c.sobre -> ''nota_id'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.12b · SIN la línea 6.11 del verificador la misma fila deja de señalarse: la aserción depende de esa línea');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.12b · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas_versiones set nota_id = :N067A where nota_id = :N067D;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.12b · restaurado, P067 vuelve a estar sana');

-- Las reatribuciones de CABECERA (F.13-F.18) necesitan apagar fn_congelar_cabecera_sellada
-- (que las prohíbe con una versión sellada) y, para el paciente y el episodio,
-- exigir_episodio_coherente_en_nota. Se vuelven a encender al final de F.
alter table public.notas_clinicas disable trigger congelar_cabecera_sellada;
alter table public.notas_clinicas disable trigger exigir_episodio_coherente_en_nota;

-- F.13 · paciente de la cabecera (6.12, línea de la cabecera). El sobre y la fila dicen P067.
update public.notas_clinicas set paciente_id = :PMOV where id = :N067A;
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.13 · paciente_id de la CABECERA cambiado por debajo (P067 -> PMOV): una fila en la cadena de P067 (6.12, cabecera)');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(c.cab_paciente_id::text)', '(c.sobre -> ''paciente_id'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.13 · SIN la línea 6.12 de cabecera, la misma fila deja de señalarse');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.13 · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas set paciente_id = :P067 where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.13 · restaurada, P067 vuelve a estar sana');

-- F.14 · episodio de la cabecera (6.13), en los dos sentidos: de un episodio a otro, y de «sin
-- episodio» a uno (N067C vive en EPI067B).
update public.notas_clinicas set episodio_id = :EPI067B where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.14a · episodio_id de la cabecera de N067A cambiado por debajo (EPI067A -> EPI067B): una fila (6.13)');
update public.notas_clinicas set episodio_id = :EPI067A where id = :N067C;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 2,
  'F.14b · y el de N067C (EPI067B -> EPI067A): dos filas (6.13)');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(c.cab_episodio_id::text)', '(c.sobre -> ''episodio_id'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.14 · SIN la línea 6.13 las dos filas dejan de señalarse');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.14 · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas set episodio_id = :EPI067A where id = :N067A;
update public.notas_clinicas set episodio_id = :EPI067B where id = :N067C;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.14 · restauradas, P067 vuelve a estar sana');

-- F.15 · autor de la cabecera (6.14). La fila y el sobre de N067C dicen PRO1.
update public.notas_clinicas set autor_id = :PRO2 where id = :N067C;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.15 · autor_id de la CABECERA cambiado por debajo (PRO1 -> PRO2): una fila (6.14)');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(c.cab_autor_id::text)', '(c.sobre -> ''autor_id'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.15 · SIN la línea 6.14 la misma fila deja de señalarse');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.15 · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas set autor_id = :PRO1 where id = :N067C;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.15 · restaurado, P067 vuelve a estar sana');

-- F.16 · paciente de la FILA (6.12, línea de la fila): las versiones de P067 pasan a PMOV por
-- debajo; la cabecera sigue en P067. Las tres versiones salen señaladas, en la cadena de PMOV.
update public.notas_clinicas_versiones set paciente_id = :PMOV where paciente_id = :P067;
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:PMOV)) = :n067_versiones
  and (select bool_and(motivo = 'sobre_no_coincide_con_fila') from public.verificar_cadena_huellas(:PMOV)),
  'F.16 · paciente_id de las FILAS cambiado por debajo (P067 -> PMOV): las tres señaladas, todas con sobre_no_coincide_con_fila');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(c.paciente_id::text)', '(c.sobre -> ''paciente_id'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:PMOV)) = 0,
  'F.16 · SIN la línea 6.12 de fila (la de cabecera sigue en P067), ninguna se señala');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.16 · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas_versiones set paciente_id = :P067 where paciente_id = :PMOV;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.16 · restauradas, P067 vuelve a estar sana');

-- F.17 · fecha_sesion de la cabecera (6.15)
update public.notas_clinicas set fecha_sesion = date '2026-08-30' where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.17 · fecha_sesion de la cabecera cambiada por debajo (29-08 -> 30-08): una fila (6.15)');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(to_char(c.cab_fecha_sesion, ''YYYY-MM-DD'') || case when c.cab_fecha_sesion < date ''0001-01-01'' then '' BC'' else '''' end)', '(c.sobre -> ''fecha_sesion'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.17 · SIN la línea 6.15 la misma fila deja de señalarse');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.17 · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas set fecha_sesion = date '2026-08-29' where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.17 · restaurada, P067 vuelve a estar sana');

-- F.17b · la era: la cabecera de N067A movida a '2026-08-29 BC' (el sobre dice 2026-08-29).
update public.notas_clinicas set fecha_sesion = date '2026-08-29 BC' where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.17b · fecha_sesion de la cabecera movida a la misma fecha BC: una fila (6.15 conserva la era)');
select pg_temp.t012c_mutar(:'verif_original', 'to_jsonb(to_char(c.cab_fecha_sesion, ''YYYY-MM-DD'') || case when c.cab_fecha_sesion < date ''0001-01-01'' then '' BC'' else '''' end)', 'to_jsonb(to_char(c.cab_fecha_sesion, ''YYYY-MM-DD''))');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.17b · SIN la era en el verificador la misma fila deja de señalarse');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.17b · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas set fecha_sesion = date '2026-08-29' where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.17b · restaurada, P067 vuelve a estar sana');

-- F.18 · coprofesional de la cabecera (6.16), en los dos sentidos: de PRO2 a null (N067A, cuyo
-- sobre dice PRO2) y de null a PRO2 (N067C, cuyo sobre dice null).
update public.notas_clinicas set coprofesional_id = null where id = :N067A;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'F.18a · coprofesional_id de N067A cambiado por debajo (PRO2 -> null): una fila (6.16)');
update public.notas_clinicas set coprofesional_id = :PRO2 where id = :N067C;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 2,
  'F.18b · y el de N067C (null -> PRO2): dos filas (6.16)');
select pg_temp.t012c_mutar(:'verif_original', 'coalesce(to_jsonb(c.cab_coprofesional_id::text), ''null''::jsonb)', '(c.sobre -> ''coprofesional_id'')');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.18 · SIN la línea 6.16 las dos filas dejan de señalarse');
select pg_temp.t012c_restaurar(:'verif_original', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'F.18 · el verificador restaurado es idéntico al guardado');
update public.notas_clinicas set coprofesional_id = :PRO2 where id = :N067A;
update public.notas_clinicas set coprofesional_id = null where id = :N067C;
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'F.18 · restauradas, P067 vuelve a estar sana');

alter table public.notas_clinicas enable trigger exigir_episodio_coherente_en_nota;
alter table public.notas_clinicas enable trigger congelar_cabecera_sellada;

-- F.19 · zona: la fecha_sesion del sobre y de la cabecera es un `date`, sin zona. En una
-- sesión Pacific/Kiritimati (UTC+14) la cadena de P067 sigue dando cero filas y la base
-- entera solo devuelve lo de PDEMO.
select current_setting('TimeZone') as valor \gset t012c_zona_
set timezone = 'Pacific/Kiritimati';
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:P067)) = 0
  and not exists (select 1 from public.verificar_cadena_huellas() v where v.paciente_id <> :PDEMO),
  'F.19 · en sesión Pacific/Kiritimati, la fecha_sesion (un date) no se corre un día: P067 da cero filas y el resto de la base, salvo PDEMO, también');
set timezone = :'t012c_zona_valor';

-- Los cerrojos vuelven a su sitio, igual que al final de la sección D.

alter table public.notas_clinicas_versiones enable trigger impedir_modificacion_notas_clinicas_versiones;

revoke update on public.notas_clinicas_versiones from postgres;

select pg_temp.assert(
  not has_table_privilege('postgres', 'public.notas_clinicas_versiones', 'update'),
  'Los cerrojos de la sección F vuelven a su sitio: postgres ya no tiene UPDATE sobre notas_clinicas_versiones'
);

select pg_temp.assert(
  (select tgenabled from pg_trigger where tgname = 'impedir_modificacion_notas_clinicas_versiones') = 'O'
  and (select tgenabled from pg_trigger where tgname = 'congelar_cabecera_sellada') = 'O'
  and (select tgenabled from pg_trigger where tgname = 'exigir_episodio_coherente_en_nota') = 'O',
  'Los cerrojos de la sección F vuelven a su sitio: impedir_modificacion_notas_clinicas_versiones, congelar_cabecera_sellada y exigir_episodio_coherente_en_nota vuelven a estar activos (''O'')'
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
-- columna PRO1, esquema_version 4 en el sobre y en la columna, y huella falsa) aparece ahora TAMBIÉN como sobre_no_coincide_con_fila,
-- además de huella_no_coincide.
select pg_temp.assert(
  exists (
    select 1 from public.verificar_cadena_huellas(:PDEMO) where motivo = 'sobre_no_coincide_con_fila'
  ),
  'F.11 · la fila de PDEMO, insertada con el disparador de sellado apagado, también sale como sobre_no_coincide_con_fila'
);


-- =========================================================================
-- G · T-036 · La firma no se fía del cliente: cita, borrador y reloj, cotejados con la base
-- =========================================================================
-- Diseño: tickets/T-036/diseno.md (§1.2, enmienda E.1-E.5 y decisiones del propietario del
-- 02-10-2026: A para todos los roles, P3 solo en la v1, ±1 minuto fijo).
--
-- Reglas de la sección:
--   · Toda firma `authenticated` la construye pg_temp.t036_q() como la aplicación: borrador
--     vivo `{"texto":"X","reservadas":""}`, cuerpo `{"texto":"X"}` en la columna y en el sobre,
--     reservadas nulas, `abierta_en` de la cabecera y `creada_en = :'t0'` (el reloj de la base:
--     now() es constante dentro de la transacción del banco, así que t0 cae dentro de ±1 min).
--   · Un escenario, un savepoint (s036): cita, nota y firma se deshacen con `rollback to
--     savepoint`. Nunca hay dos citas del mismo profesional solapadas (rango bloqueante).
--   · Toda negativa lleva código y fragmento exactos y su gemela positiva en el mismo escenario,
--     con el mismo perfil y la misma nota, ejecutada después.
--   · Los mutantes (X1-X12) reejecutan la definición guardada con UNA condición apagada, comprueban
--     que la negativa deja de lanzar y que, deshecho el mutante, la función es idéntica.

\set N36   '\'f0360001-0000-4000-8000-000000000001\''
\set N36B  '\'f0360001-0000-4000-8000-000000000002\''
\set K36   '\'a0360001-0000-4000-8000-000000000001\''
\set K36B  '\'a0360001-0000-4000-8000-000000000002\''
\set KX36  '\'a0360001-0000-4000-8000-000000000003\''
\set KY36  '\'a0360001-0000-4000-8000-000000000004\''
\set CM20  '\'c0360001-0000-4000-8000-000000000020\''
\set CMNULO '\'c0360001-0000-4000-8000-000000000021\''
\set CX    '\'{"texto":"X"}\''

call pg_temp.reset_sesion();

-- El reloj de la base, al milisegundo (now() es constante en la transacción del banco): la
-- `creada_en` de toda firma de esta sección, que 6.20 coteja con ±1 minuto.
select date_trunc('milliseconds', now()) as t0 \gset

-- Las definiciones vigentes, para los mutantes (propias de esta sección: no dependen de las de C).
select pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) as sellar_original_036,
       pg_get_functiondef('public.verificar_cadena_huellas(uuid)'::regprocedure) as verif_original_036
\gset

-- Fijar el estado, no suponerlo: el margen de la organización, un centro con 20 y otro sin margen.
update public.organizacion set margen_sesion_minutos = 15;
insert into public.centros (id, nombre, margen_sesion_minutos) values
  (:CM20,   'T-036 margen 20',   20),
  (:CMNULO, 'T-036 margen nulo', null);
select pg_temp.assert(
  (select margen_sesion_minutos from public.organizacion) = 15
  and (select margen_sesion_minutos from public.centros where id = :CM20) = 20
  and (select margen_sesion_minutos from public.centros where id = :CMNULO) is null,
  'T036 · estado fijado: organización 15, CM20 con 20, CMNULO sin margen');

-- La compatibilidad de NFC que 6.24 necesita: NFD y NFC del mismo texto son cadenas distintas.
select pg_temp.assert(normalize(U&'o\0301', NFC) = U&'\00F3',
  'T036 · normalize(…, NFC) de la base compone o + acento en ó');

-- El PIN y el desbloqueo de PRO1, fijados aquí (no se suponen los de otro módulo).
call pg_temp.como_con_2fa(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'T036 · PRO1 desbloquea su historia para firmar');
call pg_temp.reset_sesion();

-- ---- Ayudantes de la sección (pg_temp) -----------------------------------

-- Una cita de prueba, como postgres.
create or replace function pg_temp.t036_cita(
  p_id uuid, p_paciente uuid, p_prof uuid, p_centro uuid, p_inicio timestamptz, p_fin timestamptz)
returns void
language sql
as $$
  insert into public.citas (id, paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
  values (p_id, p_paciente, p_prof, p_centro, p_inicio, p_fin, 'Europe/Madrid');
$$;

-- Una nota de PRO1 en EPI067A (P067) con o sin borrador vivo y con o sin cita, como postgres.
-- El borrador lo abre fn_tocar_borrador(): borrador_abierta_en = now().
create or replace function pg_temp.t036_nota(p_id uuid, p_borrador jsonb, p_cita uuid default null)
returns void
language sql
as $$
  insert into public.notas_clinicas
    (id, paciente_id, episodio_id, autor_id, fecha_sesion, cita_id, borrador_contenido, borrador_autor_id)
  values (p_id, 'd0670001-0000-4000-8000-000000000001', 'e0670001-0000-4000-8000-000000000001',
          'b0030001-0000-4000-8000-000000000002', date '2026-10-02', p_cita, p_borrador,
          case when p_borrador is not null then 'b0030001-0000-4000-8000-000000000002'::uuid end);
$$;

-- Fija a mano borrador_abierta_en (criterios C, D): se apaga el disparador que lo conserva.
-- El check notas_clinicas_borrador_abierta_ck sigue en pie: solo se fija con el borrador vivo.
create or replace function pg_temp.t036_abierta(p_nota uuid, p_abierta timestamptz)
returns void
language plpgsql
as $$
begin
  alter table public.notas_clinicas disable trigger tocar_borrador;
  update public.notas_clinicas set borrador_abierta_en = p_abierta where id = p_nota;
  alter table public.notas_clinicas enable trigger tocar_borrador;
end;
$$;

-- El instante en la forma de toISOString(): milisegundos truncados y «Z».
create or replace function pg_temp.t036_iso(p_ts timestamptz)
returns text
language sql
immutable
as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- {"abierta_en": <borrador_abierta_en de la cabecera + p_delta, en ISO>}: para el sobre que
-- se aparta un milisegundo del instante real. Definer: lee la cabecera sin RLS.
create or replace function pg_temp.t036_ab(p_nota uuid, p_delta interval)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('abierta_en',
    pg_temp.t036_iso((select n.borrador_abierta_en from public.notas_clinicas n where n.id = p_nota) + p_delta));
$$;

-- El INSERT de la firma, como lo haría la aplicación. Definer: sobre_prueba() lee la cabecera
-- y bajo `authenticated` la RLS decidiría qué cabecera ve; la sentencia que devuelve, en cambio,
-- se EJECUTA como quien la llama.
create or replace function pg_temp.t036_q(
  p_nota uuid, p_cuerpo jsonb, p_creada timestamptz,
  p_cita uuid default null, p_margen integer default null, p_redactada boolean default false,
  p_motivo text default null, p_reservadas text default null, p_cambio jsonb default '{}'::jsonb,
  p_autor uuid default 'b0030001-0000-4000-8000-000000000002')
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select format(
    $f$insert into public.notas_clinicas_versiones
         (nota_id, cuerpo, anotaciones_reservadas, motivo_cambio, contenido_canonico, alcance, autor_id, creada_en)
       values (%L, %L, %L, %L, %L, 'individual', %L, %L)$f$,
    p_nota, p_cuerpo::text, p_reservadas, p_motivo,
    (pg_temp.sobre_prueba(p_nota, p_autor, p_creada, p_cuerpo, p_reservadas, p_motivo, p_cita,
       p_margen, p_redactada,
       (select n.borrador_abierta_en from public.notas_clinicas n where n.id = p_nota))::jsonb
     || p_cambio)::text,
    p_autor, p_creada);
$$;

-- Negativa y gemela: 23514 con el fragmento exacto / no lanza.
create or replace function pg_temp.t036_neg(
  p_frag text, p_rot text, p_nota uuid, p_cuerpo jsonb, p_creada timestamptz,
  p_cita uuid default null, p_margen integer default null, p_redactada boolean default false,
  p_motivo text default null, p_reservadas text default null, p_cambio jsonb default '{}'::jsonb)
returns void
language sql
as $$
  select pg_temp.assert_lanza_codigo_msg(
    pg_temp.t036_q(p_nota, p_cuerpo, p_creada, p_cita, p_margen, p_redactada, p_motivo, p_reservadas, p_cambio),
    '23514', p_frag, p_rot);
$$;

create or replace function pg_temp.t036_pos(
  p_rot text, p_nota uuid, p_cuerpo jsonb, p_creada timestamptz,
  p_cita uuid default null, p_margen integer default null, p_redactada boolean default false,
  p_motivo text default null, p_reservadas text default null, p_cambio jsonb default '{}'::jsonb)
returns void
language sql
as $$
  select pg_temp.assert_no_lanza(
    pg_temp.t036_q(p_nota, p_cuerpo, p_creada, p_cita, p_margen, p_redactada, p_motivo, p_reservadas, p_cambio),
    p_rot);
$$;

-- El estado de cada familia de escenarios, como postgres. Ids fijos: K36 (cita en curso:
-- ±30 min de t0), K36B (t0 + 3 h), KX36 (otro paciente), KY36 (otro profesional), N36 y N36B.
create or replace function pg_temp.t036_prep(
  p_fam text, p_t0 timestamptz, p_borr jsonb default '{"texto":"X","reservadas":""}'::jsonb)
returns void
language plpgsql
as $$
declare
  c_pac   constant uuid := 'd0670001-0000-4000-8000-000000000001';
  c_cad   constant uuid := 'd0050001-0000-4000-8000-000000000001';
  c_pro1  constant uuid := 'b0030001-0000-4000-8000-000000000002';
  c_pro2  constant uuid := 'b0030001-0000-4000-8000-000000000003';
  c_cm20  constant uuid := 'c0360001-0000-4000-8000-000000000020';
  c_cmnul constant uuid := 'c0360001-0000-4000-8000-000000000021';
  n1      constant uuid := 'f0360001-0000-4000-8000-000000000001';
  n2      constant uuid := 'f0360001-0000-4000-8000-000000000002';
  k1      constant uuid := 'a0360001-0000-4000-8000-000000000001';
  k2      constant uuid := 'a0360001-0000-4000-8000-000000000002';
  kx      constant uuid := 'a0360001-0000-4000-8000-000000000003';
  ky      constant uuid := 'a0360001-0000-4000-8000-000000000004';
  v_ab    timestamptz;
begin
  case p_fam
    when 'A' then            -- cita propia en curso, otra cita propia, y una nota sin cita
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, c_cmnul, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_cita(k2, c_pac, c_pro1, c_cmnul, p_t0 + interval '3 hours', p_t0 + interval '4 hours');
      perform pg_temp.t036_nota(n1, p_borr, k1);
      perform pg_temp.t036_nota(n2, p_borr, null);
    when 'B' then            -- n1 con borrador vivo, n2 sin borrador; ninguna con cita
      perform pg_temp.t036_nota(n1, p_borr, null);
      perform pg_temp.t036_nota(n2, null, null);
    when 'C1', 'C2' then     -- borrador_abierta_en fijado: .345000 (C1) o .345999 (C2)
      v_ab := date_trunc('second', p_t0) - interval '10 seconds'
              + case p_fam when 'C1' then interval '345 milliseconds' else interval '345999 microseconds' end;
      perform pg_temp.t036_nota(n1, p_borr, null);
      perform pg_temp.t036_abierta(n1, v_ab);
    when 'P2' then           -- abierta dos días antes, sin cita (para que no intervenga D)
      perform pg_temp.t036_nota(n1, p_borr, null);
      perform pg_temp.t036_abierta(n1, p_t0 - interval '2 days');
    when 'P3a' then          -- cabecera con una cita de OTRO paciente (del mismo profesional)
      perform pg_temp.t036_cita(kx, c_cad, c_pro1, c_cmnul, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_nota(n1, p_borr, kx);
    when 'P3b' then          -- cabecera con una cita del MISMO paciente pero de otro profesional
      perform pg_temp.t036_cita(ky, c_pac, c_pro2, c_cmnul, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_nota(n1, p_borr, ky);
    when 'P3v2' then         -- cita propia en curso y otra cita de otro paciente (a las 3 h, sin solape)
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, c_cmnul, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_cita(kx, c_cad, c_pro1, c_cmnul, p_t0 + interval '3 hours', p_t0 + interval '4 hours');
      perform pg_temp.t036_nota(n1, p_borr, k1);
    when 'M20' then          -- cita en curso en un centro con margen 20
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, c_cm20, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_nota(n1, p_borr, k1);
    when 'Msc' then          -- cita en curso sin centro
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, null, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_nota(n1, p_borr, k1);
    when 'Mnul' then         -- cita en curso en un centro sin margen propio
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, c_cmnul, p_t0 - interval '30 minutes', p_t0 + interval '30 minutes');
      perform pg_temp.t036_nota(n1, p_borr, k1);
    when 'Da' then           -- cita de ayer
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, c_cmnul, p_t0 - interval '1 day', p_t0 - interval '1 day' + interval '50 minutes');
      perform pg_temp.t036_nota(n1, p_borr, k1);
    when 'D5', 'D6', 'D7' then   -- borrador abierto 1 h antes; la cita acaba de caber (D5) o no (D6, D7)
      v_ab := p_t0 - interval '1 hour';
      perform pg_temp.t036_cita(k1, c_pac, c_pro1, c_cmnul,
        v_ab + interval '15 minutes' + case p_fam when 'D6' then interval '1 millisecond' else interval '0' end,
        p_t0 - interval '15 minutes' - case p_fam when 'D7' then interval '1 millisecond' else interval '0' end);
      perform pg_temp.t036_nota(n1, p_borr, k1);
      perform pg_temp.t036_abierta(n1, v_ab);
    when 'E1' then           -- nota sin borrador (la siembra y t005 firman así, como postgres)
      perform pg_temp.t036_nota(n1, null, null);
    when 'R' then            -- una nota sin cita, con el borrador que pida el caso
      perform pg_temp.t036_nota(n1, p_borr, null);
    when 'R9' then           -- dos notas sin cita: borrador Y con reservadas vacías, y X con «mías»
      perform pg_temp.t036_nota(n1, '{"texto":"Y","reservadas":""}'::jsonb, null);
      perform pg_temp.t036_nota(n2, '{"texto":"X","reservadas":"mías"}'::jsonb, null);
    else
      raise exception 'T036: familia de escenario desconocida: %', p_fam;
  end case;
end;
$$;

savepoint s036;

-- ---- A · cita_id del sobre = cita de la cabecera (6.19, TODOS los roles) -----
-- Cuatro sobres que no son la cita de la cabecera (otra cita propia, null, la misma en MAYÚSCULAS
-- y una nota sin cita con sobre que dice K), todos con margen y «en sesión» coherentes con la
-- cita, para que mueran por A y no por 6.22/6.23. Gemela: la cita de la cabecera, con la
-- redactada que da la fórmula (cita en curso: true).
select pg_temp.t036_prep('A', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es la cita de la cabecera', 'T036.A1 · el sobre dice OTRA cita propia: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36B, p_margen => 15, p_redactada => true);
select pg_temp.t036_neg('no es la cita de la cabecera', 'T036.A2 · el sobre dice cita null y la cabecera tiene cita: 23514',
  :N36, :CX::jsonb, :'t0');
select pg_temp.t036_neg('no es la cita de la cabecera', 'T036.A3 · el sobre dice la cita de la cabecera en MAYÚSCULAS: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true,
  p_cambio => jsonb_build_object('cita_id', upper(:K36::text)));
select pg_temp.t036_neg('no es la cita de la cabecera', 'T036.A4 · una nota SIN cita con un sobre que dice K: 23514',
  :N36B, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
select pg_temp.t036_pos('T036.A · GEMELA: la cita de la cabecera, margen 15 y en sesión, entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select numero_version from public.notas_clinicas_versiones where nota_id = :N36) = 1
  and (select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'T036.A5 · partida: la gemela de A es la v1 de N36 y la cadena de P067 está sana');

-- A5 · la cita de la cabecera cambia tras firmar (como postgres, con el congelador apagado):
-- el verificador la señala, y solo con la línea 6.19.
alter table public.notas_clinicas disable trigger congelar_cabecera_sellada;
update public.notas_clinicas set cita_id = :K36B where id = :N36;
alter table public.notas_clinicas enable trigger congelar_cabecera_sellada;
select pg_temp.assert(
  (select count(*) from public.verificar_cadena_huellas(:P067)) = 1
  and (select motivo from public.verificar_cadena_huellas(:P067)) = 'sobre_no_coincide_con_fila'
  and (select version_id from public.verificar_cadena_huellas(:P067))
        = (select id from public.notas_clinicas_versiones where nota_id = :N36),
  'T036.A5 · con la cita de la cabecera cambiada, verificar_cadena_huellas señala exactamente esa versión (sobre_no_coincide_con_fila)');
select pg_temp.t012c_mutar(:'verif_original_036',
  $f$or (c.sobre -> 'cita_id') is distinct from coalesce(to_jsonb(c.cab_cita_id::text), 'null'::jsonb)   -- 6.19$f$, '');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 0,
  'T036.A5 · MUTANTE del verificador sin la línea 6.19: ya no señala el cambio de cita');
select pg_temp.t012c_restaurar(:'verif_original_036', 'public.verificar_cadena_huellas(uuid)'::regprocedure,
  'T036.A5 · deshecho el mutante, verificar_cadena_huellas() es idéntica a la guardada');
select pg_temp.assert((select count(*) from public.verificar_cadena_huellas(:P067)) = 1,
  'T036.A5 · restaurado, el verificador vuelve a señalar el cambio de cita');
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- A6 · 6.19 vale para TODOS los roles: como postgres (sin como()), con K36 en la cabecera, un sobre
-- que dice K36B o null muere por A; la gemela con K36 entra. Si 6.19 volviera al bloque de
-- authenticated/anon, estas negativas dejarían de lanzar.
select pg_temp.t036_prep('A', :'t0');
select pg_temp.t036_neg('no es la cita de la cabecera', 'T036.A6 · como postgres, cabecera K36 y sobre K36B: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36B, p_margen => 15, p_redactada => true);
select pg_temp.t036_neg('no es la cita de la cabecera', 'T036.A7 · como postgres, cabecera K36 y sobre con cita null: 23514',
  :N36, :CX::jsonb, :'t0');
select pg_temp.t036_pos('T036.A6 · GEMELA como postgres: el sobre dice la cita de la cabecera y entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- B · borrador vivo (6.17) -----------------------------------------------
select pg_temp.t036_prep('B', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.B1 · GEMELA: PRO1 firma la v1 de su nota con borrador vivo',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select borrador_contenido is null and borrador_abierta_en is null from public.notas_clinicas where id = :N36),
  'T036.B1 · firmar vació el borrador y su abierta_en');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('No hay borrador vivo que firmar', 'T036.B1 · otra versión sin reabrir el borrador: 23514',
  :N36, '{"texto":"v2"}'::jsonb, :'t0', p_motivo => 'sin reabrir');
-- B2 · lo que hace empezarModificacion: el autor reabre el borrador, y la v2 entra.
update public.notas_clinicas
   set borrador_contenido = '{"texto":"v2","reservadas":""}', borrador_autor_id = :PRO1
 where id = :N36;
select pg_temp.t036_pos('T036.B2 · reabierto el borrador, la v2 con motivo entra',
  :N36, '{"texto":"v2"}'::jsonb, :'t0', p_motivo => 'reabierta');
select pg_temp.t036_neg('No hay borrador vivo que firmar', 'T036.B3 · nota creada SIN borrador: 23514',
  :N36B, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select max(numero_version) from public.notas_clinicas_versiones where nota_id = :N36) = 2,
  'T036.B2 · la v2 de N36 tiene numero_version = 2');
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- B4 · permisos antes que cotejo (ADR-071.5): contra la nota SIN borrador, quien no puede firmar
-- (PRO2, que no es el autor; PRO1 con la ventana caducada) recibe el 42501 del paso 0, el MISMO
-- texto que en C.perm, y no el «No hay borrador vivo» que delataría que la nota existe y está vacía.
select pg_temp.t036_prep('B', :'t0');
call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')),
  'T036.B4 · PRO2 desbloquea su historia');
select pg_temp.t012c_error(pg_temp.t036_q(:N36B, :CX::jsonb, :'t0', p_autor => :PRO2)) as err_b4a \gset
call pg_temp.reset_sesion();
update public.desbloqueos_historia
   set concedido_en = now() - interval '1 hour',
       caduca_en    = now() - interval '1 minute'
 where perfil_id = :PRO1 and revocado_en is null;
call pg_temp.como(:PRO1);
select pg_temp.t012c_error(pg_temp.t036_q(:N36B, :CX::jsonb, :'t0')) as err_b4b \gset
call pg_temp.reset_sesion();
select pg_temp.assert(:'err_b4a' = :'err_b' and :'err_b4b' = :'err_b',
  'T036.B4 · contra la nota sin borrador, PRO2 (no autor) y PRO1 (ventana caducada) reciben el MISMO error que en C.perm (' || :'err_b4a' || ' / ' || :'err_b4b' || ')');
-- Con el paso 0 apagado, PRO1 con la ventana caducada llega a 6.17: el paso 0 es lo que lo tapa.
select pg_temp.t012c_mutar(:'sellar_original_036', 'if not coalesce(', 'if false and coalesce(');
call pg_temp.como(:PRO1);
select pg_temp.t012c_error(pg_temp.t036_q(:N36B, :CX::jsonb, :'t0')) as err_b4c \gset
call pg_temp.reset_sesion();
select pg_temp.assert(:'err_b4c' like '23514 · No hay borrador vivo que firmar%',
  'T036.B4 · SIN el paso 0, PRO1 con la ventana caducada recibe «No hay borrador vivo» (' || :'err_b4c' || '): el paso 0 es lo que lo iguala');
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.B4 · deshecho el mutante del paso 0, fn_sellar_version_nota() es idéntica a la guardada');
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'T036.B4 · PRO1 vuelve a desbloquear su historia');
call pg_temp.reset_sesion();

-- ---- C · abierta_en = borrador_abierta_en de la cabecera, truncado (6.18) -----
select pg_temp.t036_prep('C1', :'t0');
-- El dato de partida, leído como postgres (PRO1 podría no ver la cabecera y leer null): .345000.
select pg_temp.assert(
  (select extract(microseconds from borrador_abierta_en)::bigint % 1000000 from public.notas_clinicas where id = :N36) = 345000,
  'T036.C · partida de C1: la apertura de la cabecera está exactamente en .345000');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el instante en que la base abrió el borrador', 'T036.C1 · el sobre dice .344Z y la base abrió en .345: 23514',
  :N36, :CX::jsonb, :'t0', p_cambio => pg_temp.t036_ab(:N36, interval '-1 millisecond'));
select pg_temp.t036_neg('no es el instante en que la base abrió el borrador', 'T036.C2 · el sobre dice .346Z y la base abrió en .345: 23514',
  :N36, :CX::jsonb, :'t0', p_cambio => pg_temp.t036_ab(:N36, interval '1 millisecond'));
select pg_temp.t036_pos('T036.C3 · GEMELA: el sobre dice .345Z, el instante exacto, y entra',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('C2', :'t0');
-- El dato de partida, leído como postgres y sin escapatoria: si la cabecera no queda en .345999,
-- C4 y C5 no distinguen truncar de redondear (con µs = 0 dan lo mismo).
select pg_temp.assert(
  (select extract(microseconds from borrador_abierta_en)::bigint % 1000000 from public.notas_clinicas where id = :N36) = 345999,
  'T036.C · partida de C2: la apertura de la cabecera está exactamente en .345999');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el instante en que la base abrió el borrador', 'T036.C5 · el sobre REDONDEA .345999 a .346Z: 23514',
  :N36, :CX::jsonb, :'t0', p_cambio => pg_temp.t036_ab(:N36, interval '1 millisecond'));
select pg_temp.t036_pos('T036.C4 · GEMELA: el sobre TRUNCA .345999 a .345Z y entra',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- P2 · la firma se fecha con el reloj de la base, ±1 minuto (6.20) -----------
select pg_temp.t036_prep('P2', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('del reloj de la base', 'T036.P2a · firmada_en un día antes que la base: 23514',
  :N36, :CX::jsonb, :'t0'::timestamptz - interval '1 day');
select pg_temp.t036_neg('del reloj de la base', 'T036.P2b · firmada_en un día después que la base: 23514',
  :N36, :CX::jsonb, :'t0'::timestamptz + interval '1 day');
select pg_temp.t036_neg('del reloj de la base', 'T036.P2c · firmada_en 61 s antes que la base: 23514',
  :N36, :CX::jsonb, :'t0'::timestamptz - interval '61 seconds');
select pg_temp.t036_neg('del reloj de la base', 'T036.P2d · firmada_en 61 s después que la base: 23514',
  :N36, :CX::jsonb, :'t0'::timestamptz + interval '61 seconds');
call pg_temp.reset_sesion();
rollback to savepoint s036;
select pg_temp.t036_prep('P2', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P2e · GEMELA: firmada_en 59 s antes que la base entra (la tolerancia es de ±1 minuto)',
  :N36, :CX::jsonb, :'t0'::timestamptz - interval '59 seconds');
call pg_temp.reset_sesion();
rollback to savepoint s036;
select pg_temp.t036_prep('P2', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P2f · GEMELA: firmada_en 59 s después que la base entra',
  :N36, :CX::jsonb, :'t0'::timestamptz + interval '59 seconds');
call pg_temp.reset_sesion();
rollback to savepoint s036;
select pg_temp.t036_prep('P2', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P2 · GEMELA: firmada_en = reloj de la base entra',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- P3 · la cita es de esta nota: mismo paciente y su autor, SOLO en la v1 (6.21) -----
select pg_temp.t036_prep('P3a', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no pertenece a esta nota', 'T036.P3a · la cabecera apunta a una cita de OTRO paciente: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :KX36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
select pg_temp.t036_cita(:K36B, :P067, :PRO1, :CMNULO, :'t0'::timestamptz + interval '3 hours', :'t0'::timestamptz + interval '4 hours');
update public.notas_clinicas set cita_id = :K36B where id = :N36;
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P3a · GEMELA: con la cita propia (mismo paciente y autor) la v1 entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36B, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('P3b', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no pertenece a esta nota', 'T036.P3b · la cabecera apunta a una cita del mismo paciente pero de OTRO profesional: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :KY36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
select pg_temp.t036_cita(:K36B, :P067, :PRO1, :CMNULO, :'t0'::timestamptz + interval '3 hours', :'t0'::timestamptz + interval '4 hours');
update public.notas_clinicas set cita_id = :K36B where id = :N36;
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P3b · GEMELA: con la cita propia la v1 entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36B, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- P3 solo en la v1 (decisión del propietario): tras la v1 se reasigna la cita (como postgres, con el
-- congelador apagado) a una de OTRO paciente, se reabre el borrador y la v2 ENTRA.
select pg_temp.t036_prep('P3v2', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P3v2 · la v1 con la cita propia entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
alter table public.notas_clinicas disable trigger congelar_cabecera_sellada;
update public.notas_clinicas set cita_id = :KX36 where id = :N36;
alter table public.notas_clinicas enable trigger congelar_cabecera_sellada;
update public.notas_clinicas
   set borrador_contenido = '{"texto":"v2","reservadas":""}', borrador_autor_id = :PRO1
 where id = :N36;
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.P3v2 · GEMELA de la v1: con la cita de la cabecera ya de otro paciente, la v2 ENTRA (P3 solo en la v1)',
  :N36, '{"texto":"v2"}'::jsonb, :'t0', p_motivo => 'reasignada', p_cita => :KX36, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select max(numero_version) from public.notas_clinicas_versiones where nota_id = :N36) = 2,
  'T036.P3v2 · la versión que entró es la 2');
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- M · margen efectivo (6.22) ------------------------------------------------
select pg_temp.t036_prep('M20', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el margen efectivo', 'T036.M1 · cita en el centro de 20 y el sobre dice 15: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
select pg_temp.t036_neg('no es el margen efectivo', 'T036.M2 · cita en el centro de 20 y el sobre dice margen null: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_redactada => true);
select pg_temp.t036_pos('T036.M · GEMELA: el sobre dice 20, el margen del centro, y entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 20, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('Msc', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.M3 · GEMELA: cita SIN centro, margen 15 (el de la organización), entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('Mnul', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.M4 · GEMELA: cita en un centro SIN margen propio, margen 15 (el de la organización), entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- D · «redactada en sesión» lo recalcula la base (6.23) ----------------------
select pg_temp.t036_prep('Da', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el que recalcula la base', 'T036.D1 · cita de ayer: la firma es de hoy, y el sobre dice true: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
select pg_temp.t036_pos('T036.D2 · GEMELA: cita de ayer, el sobre dice false, entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('Mnul', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el que recalcula la base', 'T036.D3 · cita en curso y el sobre dice false: 23514',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => false);
select pg_temp.t036_pos('T036.D4 · GEMELA: cita en curso, el sobre dice true, entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- Los bordes, al milisegundo: el borrador se abrió 1 h antes de t0; la cita empieza a abierta + 15 min
-- y acaba 15 min antes de t0. D5: los dos bordes exactos, incluidos: true entra. D6: la apertura queda
-- 1 ms antes del borde: true falla. D7: la firma queda 1 ms después del borde: true falla.
select pg_temp.t036_prep('D5', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.D5 · los dos bordes exactos (apertura = inicio - margen, firma = fin + margen) cuentan como en sesión: true entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('D6', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el que recalcula la base', 'T036.D6 · la apertura queda 1 ms antes del borde: true falla',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
select pg_temp.t036_pos('T036.D6 · GEMELA: en ese caso el sobre dice false y entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('D7', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el que recalcula la base', 'T036.D7 · la firma queda 1 ms después del borde: true falla',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
select pg_temp.t036_pos('T036.D7 · GEMELA: en ese caso el sobre dice false y entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- E1 · P1: postgres está exento de 6.17-6.18 y 6.20-6.24 --------------------
-- Retrofechada y sin borrador, como firman la siembra, la fijación y t005. Si esta prueba falla,
-- alguien extendió 6.17-6.24 a todos los roles.
select pg_temp.t036_prep('E1', :'t0');
select pg_temp.assert_no_lanza(
  pg_temp.t036_q(:N36, :CX::jsonb, timestamptz '2026-01-01 00:00:00+00'),
  'T036.E1 · P1: la exención de postgres es una decisión del 01-10-2026; si esta prueba falla, alguien extendió 6.17-6.24 a todos los roles');
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- ---- R · 6.24: lo que se sella es el borrador vigente (R2-H1) --------------------
-- R1 · lo que hace guardarBorrador entre la lectura de firmarNota y el insert: PRO1 cambia el
-- borrador de X a Y con el testigo leído; la firma construida con X no entra. La gemela con Y, sí.
select pg_temp.t036_prep('R', :'t0');
select pg_temp.t036_q(:N36, :CX::jsonb, :'t0') as qx \gset
select borrador_actualizado_en as testigo from public.notas_clinicas where id = :N36 \gset
call pg_temp.como(:PRO1);
with u as (
  update public.notas_clinicas
     set borrador_contenido = '{"texto":"Y","reservadas":""}', borrador_autor_id = :PRO1
   where id = :N36 and borrador_actualizado_en = :'testigo'
  returning 1)
select pg_temp.assert((select count(*) from u) = 1, 'T036.R1 · PRO1 guardó el borrador Y con el testigo leído: tocó una fila');
select pg_temp.assert_lanza_codigo_msg(:'qx', '23514', 'no es el borrador vigente',
  'T036.R1 · firmar con el sobre de X cuando el borrador vigente es Y: 23514');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select borrador_contenido ->> 'texto' from public.notas_clinicas where id = :N36) = 'Y'
  and (select count(*) from public.notas_clinicas_versiones where nota_id = :N36) = 0,
  'T036.R1 · tras la negativa el borrador sigue siendo Y y la nota sigue sin versiones');
select pg_temp.t036_q(:N36, '{"texto":"Y"}'::jsonb, :'t0') as qy \gset
call pg_temp.como(:PRO1);
select pg_temp.assert_no_lanza(:'qy', 'T036.R1 · GEMELA: el sobre de Y, el borrador vigente, entra');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select borrador_contenido is null from public.notas_clinicas where id = :N36),
  'T036.R1 · la gemela dejó el borrador vacío');
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- R2a · el borrador lleva reservadas «mías» y el sobre null.
select pg_temp.t036_prep('R', :'t0', '{"texto":"X","reservadas":"mías"}'::jsonb);
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el borrador vigente', 'T036.R2a · borrador con reservadas «mías» y sobre con reservadas null: 23514',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- R2b · el borrador sin reservadas y el sobre con «mías» (la columna también, para que pase 6.4).
select pg_temp.t036_prep('R', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el borrador vigente', 'T036.R2b · borrador sin reservadas y sobre con «mías»: 23514',
  :N36, :CX::jsonb, :'t0', p_reservadas => 'mías');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- R2c · gemela: «mías» en el borrador, en el sobre y en la columna.
select pg_temp.t036_prep('R', :'t0', '{"texto":"X","reservadas":"mías"}'::jsonb);
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.R2c · GEMELA: reservadas «mías» en el borrador, el sobre y la columna entran',
  :N36, :CX::jsonb, :'t0', p_reservadas => 'mías');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- R3 · lo que hace la aplicación: reservadas '' en el borrador y null en el sobre; y la clave ausente.
select pg_temp.t036_prep('R', :'t0');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.R3 · borrador con "reservadas":"" y sobre con reservadas null entran',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

select pg_temp.t036_prep('R', :'t0', '{"texto":"X"}'::jsonb);
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.R3 · borrador SIN la clave reservadas y sobre con reservadas null entran',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- R4 · NFD en el borrador, NFC en el sobre (el cliente normaliza antes de firmar): entra.
select pg_temp.assert(
  convert_to(U&'sesi\006F\0301n', 'UTF8') <> convert_to(U&'sesi\00F3n', 'UTF8'),
  'T036.R4 · partida: las dos formas de «sesión» son cadenas distintas byte a byte');
select pg_temp.t036_prep('R', :'t0', jsonb_build_object('texto', U&'sesi\006F\0301n', 'reservadas', ''));
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.R4 · borrador en NFD y sobre en NFC: el mismo texto, entra',
  :N36, jsonb_build_object('texto', U&'sesi\00F3n'), :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- R5 · un texto ausente en los dos lados no coincide.
select pg_temp.t036_prep('R', :'t0', '{"t":"x","reservadas":""}'::jsonb);
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el borrador vigente', 'T036.R5 · sin clave texto en el borrador ni en el cuerpo: 23514',
  :N36, '{"t":"x"}'::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();

-- T · ningún mensaje de 6.17-6.24 contiene abierta_en: firmarNota traduce a conflicto lo que no
-- lo lleva (servidor.ts) y a error lo que sí. Solo los tres de 6.8.
select pg_temp.assert(
  (select count(*) from regexp_matches(
     pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure), 'raise exception ''[^'']*abierta_en', 'g')) = 3,
  'T036.T · solo los tres mensajes de 6.8 contienen abierta_en; firmarNota traduce a conflicto todo lo demás (servidor.ts)');

-- ---- X · mutantes: cada comprobación, apagada, deja de lanzar -------------------
-- X1 (corregido, E.5) · sin 6.17 (B) la segunda barrera, 6.24, sigue parando la firma sin borrador.
select pg_temp.t036_prep('B', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036', 'if not v_borrador_vivo then', 'if false then');
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el borrador vigente', 'T036.X1 · sin 6.17, la nota sin borrador sigue sin poder firmarse: lo para 6.24',
  :N36B, :CX::jsonb, :'t0');
select pg_temp.t036_pos('T036.X1 · sin 6.17, la v1 de la nota con borrador entra', :N36, :CX::jsonb, :'t0');
select pg_temp.t036_neg('no es el borrador vigente', 'T036.X1 · sin 6.17, una versión sin reabrir el borrador la para 6.24',
  :N36, '{"texto":"v2"}'::jsonb, :'t0', p_motivo => 'sin reabrir');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X1 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X2 · sin 6.18 (C): el sobre con .344Z entra.
select pg_temp.t036_prep('C1', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$if (v_contenido -> 'abierta_en') is distinct from to_jsonb(to_char(v_borrador_abierta_en$f$,
  $f$if false and (v_contenido -> 'abierta_en') is distinct from to_jsonb(to_char(v_borrador_abierta_en$f$);
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X2 · sin 6.18, el sobre con otro instante de apertura entra',
  :N36, :CX::jsonb, :'t0', p_cambio => pg_temp.t036_ab(:N36, interval '-1 millisecond'));
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X2 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X3 · sin 6.19 (A): el sobre que dice otra cita propia entra.
select pg_temp.t036_prep('A', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$if (v_contenido -> 'cita_id') is distinct from coalesce($f$,
  $f$if false and (v_contenido -> 'cita_id') is distinct from coalesce($f$);
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X3 · sin 6.19, el sobre con otra cita propia entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36B, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X3 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X4 · sin 6.20 (P2): la firma retrofechada entra.
select pg_temp.t036_prep('P2', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036', 'if new.creada_en not between', 'if false and new.creada_en not between');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X4 · sin 6.20, la firma fechada un día antes entra',
  :N36, :CX::jsonb, :'t0'::timestamptz - interval '1 day');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X4 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X5 · sin 6.21 (P3): la cita de otro paciente entra.
select pg_temp.t036_prep('P3a', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  'if new.numero_version = 1 and (v_cita_paciente is distinct from v_paciente_id or v_cita_profesional is distinct from v_autor_cabecera) then',
  'if false then');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X5 · sin 6.21, la cita de otro paciente entra',
  :N36, :CX::jsonb, :'t0', p_cita => :KX36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X5 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X6 · sin 6.22 (margen): el sobre con 15 en el centro de 20 entra.
select pg_temp.t036_prep('M20', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$if (v_contenido -> 'margen_sesion_minutos') is distinct from to_jsonb(v_margen) then$f$, 'if false then');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X6 · sin 6.22, el sobre con margen 15 en el centro de 20 entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X6 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X7 · sin 6.23 (D): el true de la cita de ayer entra.
select pg_temp.t036_prep('Da', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$if (v_contenido -> 'redactada_en_sesion') is distinct from to_jsonb(v_en_sesion) then$f$, 'if false then');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X7 · sin 6.23, redactada true sobre una cita de ayer entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X7 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X8-X10 · las condiciones de 6.24 son independientes. N36: borrador Y, sobre X (la forma de R1);
-- N36B: borrador X con reservadas «mías», sobre X con reservadas null (la forma de R2a).
-- X8 · sin 6.24 entera.
select pg_temp.t036_prep('R9', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036', 'if not (v_mismo_texto and v_mismas_reservadas) then', 'if false then');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X8 · sin 6.24, el sobre de X sobre el borrador Y entra (forma de R1)', :N36, :CX::jsonb, :'t0');
select pg_temp.t036_pos('T036.X8 · sin 6.24, el sobre sin reservadas sobre el borrador con «mías» entra (forma de R2a)', :N36B, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X8 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X9 · sin la condición del texto: R1 entra, R2a sigue lanzando.
select pg_temp.t036_prep('R9', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036', 'v_mismo_texto := ', 'v_mismo_texto := true or ');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X9 · sin la condición del texto, la forma de R1 entra', :N36, :CX::jsonb, :'t0');
select pg_temp.t036_neg('no es el borrador vigente', 'T036.X9 · sin la condición del texto, la forma de R2a SIGUE lanzando: las dos condiciones son independientes',
  :N36B, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X9 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X10 · sin la condición de las reservadas: R2a entra, R1 sigue lanzando.
select pg_temp.t036_prep('R9', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036', 'v_mismas_reservadas := ', 'v_mismas_reservadas := true or ');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X10 · sin la condición de las reservadas, la forma de R2a entra', :N36B, :CX::jsonb, :'t0');
select pg_temp.t036_neg('no es el borrador vigente', 'T036.X10 · sin la condición de las reservadas, la forma de R1 SIGUE lanzando',
  :N36, :CX::jsonb, :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X10 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X11 · sin la NFC del lado del borrador: la gemela de R4 (NFD en el borrador, NFC en el sobre) pasa a lanzar.
select pg_temp.t036_prep('R', :'t0', jsonb_build_object('texto', U&'sesi\006F\0301n', 'reservadas', ''));
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$normalize(v_borrador_contenido ->> 'texto', NFC)$f$, $f$(v_borrador_contenido ->> 'texto')$f$);
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el borrador vigente', 'T036.X11 · sin la NFC del lado del borrador, el NFD frente al NFC lanza: la NFC hace falta',
  :N36, jsonb_build_object('texto', U&'sesi\00F3n'), :'t0');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X11 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X12 · P3 solo en la v1: si el mutante quita la condición de versión, la v2 de la gemela de P3 lanza.
select pg_temp.t036_prep('P3v2', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036', 'new.numero_version = 1 and (v_cita_paciente', '(v_cita_paciente');
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X12 · la v1 con la cita propia entra',
  :N36, :CX::jsonb, :'t0', p_cita => :K36, p_margen => 15, p_redactada => true);
call pg_temp.reset_sesion();
alter table public.notas_clinicas disable trigger congelar_cabecera_sellada;
update public.notas_clinicas set cita_id = :KX36 where id = :N36;
alter table public.notas_clinicas enable trigger congelar_cabecera_sellada;
update public.notas_clinicas
   set borrador_contenido = '{"texto":"v2","reservadas":""}', borrador_autor_id = :PRO1
 where id = :N36;
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no pertenece a esta nota', 'T036.X12 · sin la condición de versión, la v2 con la cita ya de otro paciente lanza: la condición hace falta',
  :N36, '{"texto":"v2"}'::jsonb, :'t0', p_motivo => 'reasignada', p_cita => :KX36, p_margen => 15, p_redactada => false);
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X12 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X13 · 6.19 devuelta al bloque de authenticated/anon (la posición anterior a la decisión del
-- 02-10-2026): la negativa A6, como postgres, deja de lanzar.
select pg_temp.t036_prep('A', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$if (v_contenido -> 'cita_id') is distinct from coalesce(to_jsonb(v_cita_cabecera::text), 'null'::jsonb) then$f$,
  $f$if current_setting('role', true) in ('authenticated', 'anon') and (v_contenido -> 'cita_id') is distinct from coalesce(to_jsonb(v_cita_cabecera::text), 'null'::jsonb) then$f$);
select pg_temp.t036_pos('T036.X13 · con 6.19 solo para authenticated/anon, el sobre con OTRA cita entra como postgres',
  :N36, :CX::jsonb, :'t0', p_cita => :K36B, p_margen => 15, p_redactada => true);
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X13 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X14 · 6.18 que REDONDEA en vez de truncar: con la apertura en .345999, el sobre que trunca (.345Z)
-- lanza y el que redondea (.346Z) entra.
select pg_temp.t036_prep('C2', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$to_char(v_borrador_abierta_en at time zone 'UTC'$f$,
  $f$to_char((v_borrador_abierta_en + interval '500 microseconds') at time zone 'UTC'$f$);
call pg_temp.como(:PRO1);
select pg_temp.t036_neg('no es el instante en que la base abrió el borrador', 'T036.X14 · con 6.18 que redondea, el sobre que TRUNCA (.345Z) lanza: truncar hace falta',
  :N36, :CX::jsonb, :'t0');
select pg_temp.t036_pos('T036.X14 · con 6.18 que redondea, el sobre que redondea (.346Z) entra',
  :N36, :CX::jsonb, :'t0', p_cambio => pg_temp.t036_ab(:N36, interval '1 millisecond'));
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X14 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

-- X15 · tolerancia de 6.20 ensanchada de 1 minuto a 23 horas: las negativas a ±61 s (P2c, P2d) entran.
select pg_temp.t036_prep('P2', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$now() - interval '1 minute' and now() + interval '1 minute'$f$,
  $f$now() - interval '23 hours' and now() + interval '23 hours'$f$);
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X15 · con tolerancia de 23 h, firmada_en 61 s antes entra: el minuto hace falta',
  :N36, :CX::jsonb, :'t0'::timestamptz - interval '61 seconds');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.t036_prep('P2', :'t0');
select pg_temp.t012c_mutar(:'sellar_original_036',
  $f$now() - interval '1 minute' and now() + interval '1 minute'$f$,
  $f$now() - interval '23 hours' and now() + interval '23 hours'$f$);
call pg_temp.como(:PRO1);
select pg_temp.t036_pos('T036.X15 · con tolerancia de 23 h, firmada_en 61 s después entra',
  :N36, :CX::jsonb, :'t0'::timestamptz + interval '61 seconds');
call pg_temp.reset_sesion();
rollback to savepoint s036;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) = :'sellar_original_036',
  'T036.X15 · deshecho el mutante, fn_sellar_version_nota() es idéntica a la guardada');

release savepoint s036;
call pg_temp.reset_sesion();

\echo '14-cadena-huellas: completa.'

