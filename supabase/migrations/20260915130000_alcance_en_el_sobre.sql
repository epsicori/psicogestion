-- =============================================================================
-- T-012a · El alcance entra en el sobre canónico, antes de la primera firma
--
-- Referencias: tickets/T-012a-alcance-en-el-sobre.md; tickets/T-012/diseno.md §1.1;
-- ADR-057 (alcance dentro del sobre firmado, porque gate quién puede leer esta
-- versión vía notas_clinicas_versiones_lectura, ADR-030).
--
-- `alcance` ya existe como columna en `notas_clinicas_versiones` (T-012). Esta
-- migración NO la crea: solo hace que el sobre canónico (ADR-035/046) lleve esa
-- misma información dentro, sellada por la huella, en vez de vivir solo en una
-- columna mutable-en-teoría al lado. `esquema_version` sube de 2 a 3.
-- =============================================================================


-- =========================================================================
-- 1 · Guarda de era (mismo patrón que T-005, §8 punto 1 de su diseño)
--
-- Cambiar la forma del sobre (las claves exigidas por la comprobación 6.1) es
-- un cambio de era de esquema (ADR-035/046): las filas ya firmadas quedan
-- selladas para siempre con la forma vieja, y no se pueden migrar hacia atrás
-- sin romper la huella. Si algún día hay una fila real, esta migración se
-- detiene con un mensaje legible en vez de sellar en silencio versiones nuevas
-- con una forma que las viejas no tienen.
-- =========================================================================

do $$
begin
  if exists (select 1 from public.notas_clinicas_versiones) then
    raise exception
      'T-012a (alcance en el sobre) se instala sobre una tabla notas_clinicas_versiones '
      'VACÍA. Hay filas existentes: subir esquema_version de 2 a 3 cambia las claves '
      'exigidas por la comprobación 6.1 del disparador, y una fila ya sellada con la forma '
      'vieja no se puede migrar sin romper su huella. Si esto ocurre de verdad, la decisión '
      'de cómo tratar los datos existentes la toma una persona, no esta migración.';
  end if;
end;
$$;


-- =========================================================================
-- 2 · fn_sellar_version_nota(): mismo cuerpo de T-005 + comprobación 6.10
-- =========================================================================

create or replace function public.fn_sellar_version_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente_id uuid;
  v_huella_prev bytea;
  v_pos         integer;
  v_contenido   jsonb;
  v_claves      text[];
  v_esperadas   constant text[] := array[
    'abierta_en', 'alcance', 'anotaciones_reservadas', 'autor_id', 'cita_id', 'creada_en',
    'cuerpo', 'esquema_version', 'firmada_en', 'margen_sesion_minutos',
    'motivo_cambio', 'redactada_en_sesion'
  ];
  v_creada_en_iso text;
begin
  -- 1 · No se sobrescribe en silencio: un llamante que cree haber escrito la
  -- cadena tiene que enterarse de que la cadena no se escribe por aplicación.
  if new.huella is not null or new.huella_anterior is not null
     or new.paciente_id is not null or new.posicion_cadena is not null
     or new.numero_version is not null then
    raise exception
      'huella, huella_anterior, paciente_id, posicion_cadena y numero_version los calcula '
      'fn_sellar_version_nota(): no se pueden mandar en el INSERT (T-005)'
      using errcode = '42501';
  end if;

  -- 1.bis · La era del algoritmo la abre una MIGRACIÓN, no un INSERT
  -- (hallazgo MEDIA de la TERCERA revisión con Opus del 06-09-2026).
  if new.algoritmo_version is distinct from 1 then
    raise exception
      'algoritmo_version la fija la era vigente de la cadena (hoy 1) y la abre una '
      'migración, no un INSERT: una versión marcada con otra era queda fuera de las '
      'comprobaciones de verificar_cadena_huellas() (T-005)'
      using errcode = '42501';
  end if;

  -- 2 · El paciente lo dice notas_clinicas, congelado tras la primera firma.
  select n.paciente_id into strict v_paciente_id
    from public.notas_clinicas n
   where n.id = new.nota_id;

  -- 3 · Serialización por paciente: un cerrojo consultivo, tomado ANTES de
  -- leer el eslabón anterior, así que dos firmas concurrentes sobre el mismo
  -- paciente se ordenan aquí y no pueden leer el mismo último eslabón.
  perform pg_advisory_xact_lock(hashtextextended('cadena_huellas:' || v_paciente_id::text, 0));

  -- 4 · El último eslabón de ESTE paciente.
  select v.huella, v.posicion_cadena
    into v_huella_prev, v_pos
    from public.notas_clinicas_versiones v
   where v.paciente_id = v_paciente_id
   order by v.posicion_cadena desc
   limit 1;

  -- 5 · Encadenado: 32 bytes cero en el primer eslabón, sin separador porque
  -- la longitud fija de huella_anterior lo hace inambiguo.
  new.paciente_id     := v_paciente_id;
  new.huella_anterior := coalesce(v_huella_prev, decode(repeat('00', 32), 'hex'));
  new.posicion_cadena := coalesce(v_pos, 0) + 1;
  new.numero_version  := coalesce(
    (select max(v.numero_version) from public.notas_clinicas_versiones v where v.nota_id = new.nota_id),
    0
  ) + 1;

  -- 6 · Las diez comprobaciones de coherencia sobre–fila (T-012a añade 6.10,
  -- alcance). El sobre nace completo o se paga una era nueva de algoritmo
  -- (nada de esto se recalcula jamás): esta es la guarda que impide sellar un
  -- sobre con otra forma.
  v_contenido := new.contenido_canonico::jsonb;

  -- 6.1 · Objeto con EXACTAMENTE las doce claves vigentes, SIN NINGUNA
  -- REPETIDA. `json_object_keys(...::json)`, NUNCA `jsonb_object_keys(...::jsonb)`
  -- (hallazgo MEDIA-3 de T-005): jsonb deduplica claves repetidas al parsear.
  if jsonb_typeof(v_contenido) <> 'object' then
    raise exception 'contenido_canonico debe ser un objeto JSON (el sobre), no un %',
      jsonb_typeof(v_contenido)
      using errcode = '23514';
  end if;
  select array_agg(k order by k) into v_claves from json_object_keys(new.contenido_canonico::json) as k;
  if v_claves is distinct from v_esperadas then
    raise exception
      'contenido_canonico debe ser un sobre con exactamente las claves %, ni una más ni una '
      'menos (esquema_version %, ADR-035/046/057)', v_esperadas, new.esquema_version
      using errcode = '23514';
  end if;

  -- 6.2 · autor_id del sobre = autor_id de la fila. `is distinct from` sobre
  -- el valor JSONB completo (no `->>` con `<>`): ver hallazgo ALTA de T-005.
  if (v_contenido -> 'autor_id') is distinct from to_jsonb(new.autor_id::text) then
    raise exception 'El autor_id del sobre no coincide con la columna autor_id, o no es una cadena (T-005)'
      using errcode = '23514';
  end if;

  -- 6.3 · Igualdad JSONB (semántica), no de bytes: el cuerpo puede llegar
  -- reformateado sin abrir ningún agujero, porque lo que se sella es
  -- contenido_canonico, no esta columna.
  if (v_contenido -> 'cuerpo') <> (new.cuerpo::jsonb) then
    raise exception 'El cuerpo del sobre no es jsonb-equivalente a la columna cuerpo (T-005)'
      using errcode = '23514';
  end if;

  -- 6.4 · anotaciones_reservadas: null JSON frente a cadena vacía, distintos.
  if new.anotaciones_reservadas is null then
    if (v_contenido -> 'anotaciones_reservadas') is distinct from 'null'::jsonb then
      raise exception
        'anotaciones_reservadas es NULL en la fila pero el sobre no lleva null (ADR-027)'
        using errcode = '23514';
    end if;
  else
    if jsonb_typeof(v_contenido -> 'anotaciones_reservadas') <> 'string'
       or (v_contenido ->> 'anotaciones_reservadas') <> new.anotaciones_reservadas then
      raise exception
        'anotaciones_reservadas del sobre no coincide con la columna (ADR-027)'
        using errcode = '23514';
    end if;
  end if;

  -- 6.5 · esquema_version del sobre = columna, y del TIPO correcto.
  if (v_contenido -> 'esquema_version') is distinct from to_jsonb(new.esquema_version) then
    raise exception
      'esquema_version del sobre no coincide con la columna esquema_version, o no es un número (T-005)'
      using errcode = '23514';
  end if;

  -- 6.6 · motivo_cambio: misma distinción null/cadena que 6.4.
  if new.motivo_cambio is null then
    if (v_contenido -> 'motivo_cambio') is distinct from 'null'::jsonb then
      raise exception 'motivo_cambio es NULL en la fila pero el sobre no lleva null (T-005)'
        using errcode = '23514';
    end if;
  else
    if jsonb_typeof(v_contenido -> 'motivo_cambio') <> 'string'
       or (v_contenido ->> 'motivo_cambio') <> new.motivo_cambio then
      raise exception 'motivo_cambio del sobre no coincide con la columna motivo_cambio (T-005)'
        using errcode = '23514';
    end if;
  end if;

  -- 6.7 · creada_en = firmada_en = new.creada_en, en formato toISOString().
  v_creada_en_iso := to_char(new.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if (v_contenido -> 'creada_en') is distinct from to_jsonb(v_creada_en_iso)
     or (v_contenido -> 'firmada_en') is distinct from to_jsonb(v_creada_en_iso) then
    raise exception
      'creada_en y firmada_en del sobre deben ser iguales entre sí e iguales a la columna '
      'creada_en en UTC con milisegundos y "Z" (ADR-035, ADR-046): esperado %, sobre creada_en '
      '=%, firmada_en=%', v_creada_en_iso, v_contenido -> 'creada_en', v_contenido -> 'firmada_en'
      using errcode = '23514';
  end if;

  -- 6.8 · Tipos del bloque de sesión (ADR-046), y abierta_en <= firmada_en.
  if jsonb_typeof(v_contenido -> 'cita_id') not in ('string', 'null') then
    raise exception 'cita_id del sobre debe ser una cadena o null (ADR-046)'
      using errcode = '23514';
  end if;
  if jsonb_typeof(v_contenido -> 'abierta_en') <> 'string' then
    raise exception 'abierta_en del sobre debe ser una cadena (ADR-046)'
      using errcode = '23514';
  end if;
  if jsonb_typeof(v_contenido -> 'firmada_en') <> 'string' then
    raise exception 'firmada_en del sobre debe ser una cadena (ADR-046)'
      using errcode = '23514';
  end if;
  if jsonb_typeof(v_contenido -> 'redactada_en_sesion') <> 'boolean' then
    raise exception 'redactada_en_sesion del sobre debe ser booleano (ADR-046)'
      using errcode = '23514';
  end if;
  if jsonb_typeof(v_contenido -> 'margen_sesion_minutos') not in ('number', 'null') then
    raise exception 'margen_sesion_minutos del sobre debe ser un número o null (ADR-046)'
      using errcode = '23514';
  end if;
  begin
    if (v_contenido ->> 'abierta_en')::timestamptz > (v_contenido ->> 'firmada_en')::timestamptz then
      raise exception 'abierta_en no puede ser posterior a firmada_en (ADR-046)'
        using errcode = '23514';
    end if;
  exception
    when invalid_datetime_format then
      raise exception 'abierta_en o firmada_en del sobre no son un instante ISO-8601 válido (ADR-046)'
        using errcode = '23514';
  end;

  -- 6.9 · Sin cita, ni margen ni «en sesión»: una nota sin cita jamás puede
  -- decir que se escribió en sesión.
  if (v_contenido -> 'cita_id') is not distinct from 'null'::jsonb then
    if (v_contenido -> 'redactada_en_sesion') is distinct from 'false'::jsonb
       or (v_contenido -> 'margen_sesion_minutos') is distinct from 'null'::jsonb then
      raise exception
        'Sin cita_id, redactada_en_sesion debe ser false y margen_sesion_minutos debe ser null (ADR-046)'
        using errcode = '23514';
    end if;
  end if;

  -- 6.10 · alcance del sobre = columna, y del TIPO correcto (T-012a, ADR-057).
  -- `is distinct from` sobre el valor JSONB completo, igual que 6.2/6.5: un
  -- `"alcance":null` da SQL NULL con `->>` y `NULL <> x` es NULL (falso en un
  -- `if`), la misma trampa ya pagada en T-005 — nunca `->>` + `<>` aquí.
  -- `to_jsonb(new.alcance::text)` exige además que sea una CADENA JSON.
  if (v_contenido -> 'alcance') is distinct from to_jsonb(new.alcance::text) then
    raise exception
      'El alcance del sobre no coincide con la columna alcance, o no es una cadena (T-012a, ADR-057)'
      using errcode = '23514';
  end if;

  -- 7 · El SHA-256 tiene una sola implementación en todo el sistema:
  -- pgcrypto. La aplicación no calcula huellas nunca.
  new.huella := extensions.digest(
    convert_to(new.contenido_canonico, 'UTF8') || new.huella_anterior,
    'sha256'
  );

  return new;
end;
$$;


-- =========================================================================
-- 3 · El valor por defecto de la columna sube con la era (2 → 3)
--
-- `sobre_prueba()`/`sobre()` (banco de RLS, seed, T-005) y `construirSobre()`
-- (aplicación) ya emiten `"esquema_version":3` sin excepción: nada en este
-- ticket produce un sobre con `esquema_version:2`. Si el DEFAULT de la
-- columna se quedara en 2, cualquier INSERT que no fije `esquema_version` a
-- mano (la mayoría del banco de RLS y de la siembra) sellaría un sobre
-- `esquema_version:3` contra una columna en 2, y la comprobación 6.5
-- (esquema_version del sobre = columna) lo rechazaría con 23514 — no por un
-- desacuerdo real, sino porque el DEFAULT se quedó atrás de la era vigente.
-- =========================================================================

alter table public.notas_clinicas_versiones
  alter column esquema_version set default 3;


-- =========================================================================
-- 4 · Comentario de la columna, actualizado a la era 3
-- =========================================================================

comment on column public.notas_clinicas_versiones.esquema_version is
  'Forma del sobre canónico. 3 desde el ADR-057 (alcance dentro del sobre firmado, T-012a); '
  '2 desde el ADR-046 (bloque de sesión: cita_id, abierta_en, firmada_en, '
  'redactada_en_sesion, margen_sesion_minutos). Las versiones 1 y 2 (sin alcance) no '
  'existen en ninguna fila de ninguna base: nacen muertas. Subir esta cifra es la única '
  'forma legítima de cambiar la forma del sobre; el disparador exige las claves exactas '
  'de la versión vigente.';
