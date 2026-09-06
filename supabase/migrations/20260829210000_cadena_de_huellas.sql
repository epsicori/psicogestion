-- =============================================================================
-- T-005 · Cadena de huellas: canonicalización, encadenado y verificador
--
-- Referencias: docs/architecture.md §Cadena de huellas; ADR-027, 031, 035, 036,
-- 043, 046; el «Diseño aprobado · 29-08-2026» de tickets/T-005-cadena-huellas.md
-- (secciones citadas como §N más abajo).
--
-- `notas_clinicas_versiones` ya existe desde T-001 con `contenido_canonico`,
-- `huella`, `huella_anterior`, `algoritmo_version` y `esquema_version` — el
-- comentario de esa migración dice literalmente «AQUÍ NO SE CALCULA NINGUNA
-- HUELLA: ni disparador que encadene ni default. La cadena es T-005». Esta
-- migración es esa promesa cumplida. No crea ninguna tabla nueva.
-- =============================================================================


-- =========================================================================
-- 1 · Guarda de era (§8, punto 1)
--
-- `paciente_id` y `posicion_cadena` se añaden `not null` sin valor por
-- defecto y sin relleno, a propósito: no se pueden rellenar después porque
-- `UPDATE` sobre esta tabla está revocado, disparado y vetado por el linter
-- (regla 1), y el patrón «nulable + backfill + set not null» dispararía
-- además la regla 2. Si algún día hubiera filas, esta migración debe fallar
-- en voz alta y la decisión (una era nueva de algoritmo) la toma una
-- persona — esta guarda convierte el fallo en un mensaje legible en vez de
-- en la excepción genérica de Postgres sobre la columna.
-- =========================================================================

do $$
begin
  if exists (select 1 from public.notas_clinicas_versiones) then
    raise exception
      'La cadena de huellas (T-005) se instala sobre una tabla notas_clinicas_versiones VACÍA. '
      'Hay filas existentes: añadir paciente_id/posicion_cadena NOT NULL sin relleno es '
      'intencional (ver §8 del diseño aprobado de T-005) y esta migración se detiene en vez '
      'de fallar con el error genérico de Postgres. Si esto ocurre de verdad, la decisión de '
      'cómo migrar los datos existentes la toma una persona, no esta migración.';
  end if;
end;
$$;


-- =========================================================================
-- 2 · Columnas de ámbito y orden de la cadena (§8, punto 2)
--
-- Sin clave ajena a `pacientes`, a propósito: la garantía referencial ya la
-- da `notas_clinicas.paciente_id` (con su FK, y congelada tras la primera
-- firma por `fn_congelar_cabecera_sellada()`); el disparador de abajo lee de
-- ahí, así que este valor no puede mentir. Una FK de más añadiría un
-- `for key share` sobre `pacientes` en cada firma, ampliando la superficie de
-- cerrojos justo al lado de la fusión de pacientes (§7 del diseño aprobado).
-- =========================================================================

alter table public.notas_clinicas_versiones
  add column paciente_id     uuid    not null,
  add column posicion_cadena integer not null;

alter table public.notas_clinicas_versiones
  add constraint notas_clinicas_versiones_posicion_ck check (posicion_cadena >= 1);

alter table public.notas_clinicas_versiones
  add constraint notas_clinicas_versiones_canonico_ck
    check (jsonb_typeof(contenido_canonico::jsonb) = 'object');

-- Un solo génesis por paciente y ningún hueco: la posición es única y
-- consecutiva por diseño del disparador de abajo.
create unique index notas_clinicas_versiones_cadena_idx
  on public.notas_clinicas_versiones (paciente_id, posicion_cadena);

-- Es el criterio de aceptación «dos firmas concurrentes no comparten
-- huella_anterior» escrito como restricción: aunque el cerrojo consultivo
-- del disparador desapareciera, esto sigue siendo imposible. De regalo, un
-- solo génesis por paciente (huella_anterior = 32 ceros no puede repetirse).
create unique index notas_clinicas_versiones_eslabon_idx
  on public.notas_clinicas_versiones (paciente_id, huella_anterior);

alter table public.notas_clinicas_versiones
  alter column esquema_version set default 2;

comment on column public.notas_clinicas_versiones.paciente_id is
  'Denormalizado desde notas_clinicas.paciente_id (T-005), sin clave ajena a propósito: '
  'la referencial ya la da notas_clinicas y está congelada tras la primera firma '
  '(fn_congelar_cabecera_sellada). Una FK aquí añadiría un for key share por firma, justo '
  'al lado de los cerrojos de la fusión de pacientes (ADR-031). Ámbito de la cadena de '
  'huellas: el paciente, no la nota (longitud 1 no demuestra nada) ni el episodio '
  '(episodio_id es nulable).';

comment on column public.notas_clinicas_versiones.posicion_cadena is
  'Posición de esta versión en la cadena de huellas DEL PACIENTE (empieza en 1). La '
  'calcula fn_sellar_version_nota(); no lo fija nunca el llamante.';

comment on column public.notas_clinicas_versiones.contenido_canonico is
  'El sobre JCS (RFC 8785) + NFC en UTF-8 (ADR-035), guardado como `text` y NO como '
  '`jsonb`: jsonb reordena claves, normaliza numeros y descarta el espaciado, exactamente '
  'los bytes que hay que sellar. Esta columna ES el JSON canonico; no hay un objeto '
  'guardado por un lado y unos bytes por otro. '
  'LIMITACION CONOCIDA (hallazgo MEDIA de la revision con Opus del 30-08-2026): un '
  'documento que contenga el caracter Unicode nulo (punto de codigo cero) se canoniza '
  'correctamente en TypeScript, escapado a seis caracteres ASCII imprimibles segun JCS, '
  'pero el volcado a jsonb de esta migracion (el check de abajo y el propio disparador, '
  'que hacen contenido_canonico::jsonb) RECHAZA esa secuencia de escape con SQLSTATE '
  '22P05 (unsupported Unicode escape sequence): Postgres no admite ese caracter dentro '
  'de un jsonb ni siquiera escapado. Consecuencia real: una nota cuyo contenido incluya '
  'el caracter nulo NO SE PUEDE FIRMAR, y falla alto (22P05), no en silencio. No se '
  'puede evitar sin cambiar el tipo de columna a algo que no valide como jsonb, lo que '
  'no es objeto de este ticket.';


comment on column public.notas_clinicas_versiones.huella is
  'SHA-256(contenido_canonico en UTF-8 || huella_anterior), calculado por pgcrypto '
  '(extensions.digest) dentro de fn_sellar_version_nota(). 32 bytes fijos: el tipo bytea '
  'con el check de longitud es la única forma de serializarlos, no hace falta decidir nada.';

comment on column public.notas_clinicas_versiones.esquema_version is
  'Forma del sobre canónico. 2 desde el ADR-046 (bloque de sesión: cita_id, abierta_en, '
  'firmada_en, redactada_en_sesion, margen_sesion_minutos). La versión 1 (sin ese bloque) '
  'no existe en ninguna fila de ninguna base: nace muerta. Subir esta cifra es la única '
  'forma legítima de cambiar la forma del sobre; el disparador exige las claves exactas '
  'de la versión vigente.';


-- =========================================================================
-- 3 · El sellado: disparador BEFORE INSERT, no una función de aplicación
--     (§6 del diseño aprobado)
--
-- Por qué disparador y no una función `firmar_nota()` por RPC: `authenticated`
-- ya tiene `grant insert` y la política `notas_clinicas_versiones_alta` sobre
-- esta tabla. Una función de aplicación sería *una* puerta; el INSERT directo
-- seguiría siendo *otra*, y por ella entrarían huellas inventadas. Un
-- disparador ES la tabla: no hay camino que la evite. Resuelve también el
-- «todo en una transacción» del ticket porque un INSERT es su propia
-- transacción.
--
-- Por qué `security definer`: el eslabón anterior de la cadena puede ser una
-- versión de OTRO profesional que el firmante no puede leer bajo RLS. Un
-- disparador invoker no la vería, creería estar ante el primer eslabón y
-- produciría un segundo génesis. Lo único que cruza la frontera del definer
-- son 32 bytes de hash y un entero: ni una palabra de contenido clínico. La
-- autorización la sigue haciendo `notas_clinicas_versiones_alta`, evaluada
-- DESPUÉS de los disparadores BEFORE, sobre la fila ya sellada.
-- =========================================================================

create function public.fn_sellar_version_nota()
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
    'abierta_en', 'anotaciones_reservadas', 'autor_id', 'cita_id', 'creada_en',
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
  -- `algoritmo_version` es `not null default 1` desde T-001 y el `grant` de
  -- esta tabla es de tabla entera —`grant select, insert on table
  -- public.notas_clinicas_versiones to authenticated`—, así que hasta aquí
  -- cualquier profesional podía elegir su valor en el propio INSERT. La fila
  -- se sellaba bien (la huella la calcula el punto 7 de esta función pase lo
  -- que pase), pero `verificar_cadena_huellas()` clasifica toda fila con
  -- `algoritmo_version <> 1` como `era_desconocida` y NO le comprueba ni el
  -- digest, ni el génesis, ni el hueco de posición, ni el encadenado: una
  -- versión marcada como de otra era es un punto ciego permanente del
  -- verificador, elegido por quien firma. No era silencioso —el verificador
  -- emite su fila `era_desconocida`, así que «cadena sana = cero filas»
  -- sigue fallando— pero el ticket dice que cambiar de algoritmo abre una
  -- era nueva, y eso es una decisión de operación, no un campo de
  -- formulario. No se puede cerrar con un `check`: cuando llegue la era 2,
  -- la migración que la abra tendrá que subir esta constante, y un `check`
  -- sobre las filas viejas lo impediría.
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
  -- paciente se ordenan aquí y no pueden leer el mismo último eslabón. No se
  -- usa `for no key update` sobre `pacientes`: esa fila ya la bloquea la
  -- fusión de pacientes (ADR-031) con `for no key update`, y las
  -- comprobaciones de clave ajena con `for key share`; compartir ese juego de
  -- cerrojos abriría aristas nuevas de interbloqueo (firma↔fusión,
  -- firma↔firma) en una operación que un profesional ejecuta con el paciente
  -- delante. El cerrojo consultivo no toca ninguna fila: no puede formar
  -- ciclo con esos otros dos, y se suelta solo, al commit o al rollback.
  --
  -- LIMITACIÓN OPERATIVA REAL (hallazgo MEDIA de la revisión con Opus del
  -- 30-08-2026): el argumento de «sin interbloqueo» de arriba asume UN
  -- cerrojo consultivo por transacción. Este disparador es `for each row`:
  -- firmar N notas de N pacientes DISTINTOS dentro de la MISMA transacción
  -- toma N cerrojos, uno por fila, en el orden en que las filas se procesan.
  -- Eso reabre el interbloqueo clásico ABBA si dos transacciones concurrentes
  -- firman los mismos dos pacientes en orden distinto (T1: paciente A luego
  -- B; T2: paciente B luego A). No es un caso hipotético: el propio banco de
  -- pruebas (`scripts/rls/01-fijacion.sql`) ya firma varios pacientes en una
  -- sola transacción, aunque ahí no hay una segunda transacción concurrente
  -- que dispute los mismos cerrojos, así que no lo sufre en la práctica.
  -- REGLA para cualquier código futuro que firme varias notas de varios
  -- pacientes en una misma transacción: ordenar las firmas por `paciente_id`
  -- (orden total, estable) para que dos transacciones que compitan por los
  -- mismos pacientes los tomen siempre en el mismo orden.
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

  -- 6 · Las nueve comprobaciones de coherencia sobre–fila. El sobre nace
  -- completo o se paga una era nueva de algoritmo (nada de esto se recalcula
  -- jamás): esta es la guarda que impide sellar un sobre con otra forma.
  --
  -- LIMITACIÓN CONOCIDA (hallazgo BAJA 6 de la segunda revisión con Opus del
  -- 30-08-2026, documentada a propósito y no dejada implícita): estas nueve
  -- comprobaciones validan que las CLAVES sean las once exactas y que los
  -- VALORES coincidan semánticamente con las columnas — NO validan que
  -- `contenido_canonico` sea JCS (RFC 8785) de verdad byte a byte. Un texto
  -- con espacios de más o las claves en otro orden pasa estas nueve
  -- comprobaciones igual, porque comparan valores JSON (vía `->`/`->>`), no
  -- la forma exacta del texto. Hoy la única garantía de canonicidad real es
  -- `lib/huella/jcs.ts`, en TypeScript — y `authenticated` tiene `grant
  -- insert` directo sobre esta tabla (`notas_clinicas_versiones_alta`), así
  -- que un `insert` a mano (o un cliente que no pase por `firmar.ts`) puede
  -- sellar un sobre válido en contenido pero NO canónico byte a byte. La
  -- cadena sigue siendo internamente consistente (la huella coincide con
  -- ESOS bytes, encadena bien, el verificador la da por sana) pero esos
  -- bytes podrían no ser los que JCS habría producido para el mismo
  -- contenido. Se acepta tal cual: exigir JCS de verdad en SQL significaría
  -- reimplementar el canonicalizador en PL/pgSQL, que es precisamente lo que
  -- el ADR-035 quiere evitar (dos implementaciones del mismo algoritmo que
  -- pueden desincronizarse). El verificador nocturno (`verificar_cadena_huellas`)
  -- seguiría sin detectarlo, porque por diseño LEE LOS BYTES GUARDADOS y
  -- nunca los deriva — es la garantía que sí importa (ADR-035) y esta no la
  -- rompe.
  v_contenido := new.contenido_canonico::jsonb;

  -- 6.1 · Objeto con EXACTAMENTE las once claves vigentes, SIN NINGUNA
  -- REPETIDA. Se comprueba el tipo ANTES de listar claves: jsonb_object_keys()
  -- lanza su propio error si se le pasa algo que no sea un objeto, y aquí se
  -- quiere el mensaje propio.
  --
  -- `json_object_keys(...::json)`, NUNCA `jsonb_object_keys(...::jsonb)`
  -- (hallazgo MEDIA-3, el más serio, de la segunda revisión con Opus del
  -- 30-08-2026): `jsonb` DEDUPLICA claves repetidas al parsear —se queda con
  -- la última—, así que un sobre con `"autor_id"` dos veces (una falsa, una
  -- real más adelante) pasaba esta comprobación con jsonb_object_keys()
  -- devolviendo solo las once claves esperadas, aunque el texto tuviera doce
  -- pares. RFC 8785 (JCS) prohíbe claves duplicadas, y esta columna «ES el
  -- JSON canónico»: sellar un documento con una clave repetida es sellar
  -- bytes que la base nunca validó de verdad. `json_object_keys()` sobre
  -- `::json` SÍ conserva los duplicados al enumerar, así que una clave
  -- repetida hace que el array tenga doce elementos en vez de once y
  -- `is distinct from v_esperadas` lo atrapa sin comprobación aparte.
  if jsonb_typeof(v_contenido) <> 'object' then
    raise exception 'contenido_canonico debe ser un objeto JSON (el sobre), no un %',
      jsonb_typeof(v_contenido)
      using errcode = '23514';
  end if;
  select array_agg(k order by k) into v_claves from json_object_keys(new.contenido_canonico::json) as k;
  if v_claves is distinct from v_esperadas then
    raise exception
      'contenido_canonico debe ser un sobre con exactamente las claves %, ni una más ni una '
      'menos (esquema_version %, ADR-035/046)', v_esperadas, new.esquema_version
      using errcode = '23514';
  end if;

  -- 6.2 · autor_id del sobre = autor_id de la fila. `is distinct from` sobre
  -- el valor JSONB completo (no `->>` con `<>`): un `autor_id` JSON `null`
  -- convierte `->>` en SQL NULL, y `NULL <> x` es NULL, que en un `if` es
  -- FALSO — la comprobación no saltaba y un sobre con `"autor_id":null` se
  -- sellaba igual (hallazgo ALTA de la revisión con Opus del 30-08-2026).
  -- `to_jsonb(new.autor_id::text)` exige además que sea una CADENA JSON, no
  -- solo un valor que en teoría coincide en texto.
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

  -- 6.5 · esquema_version del sobre = columna, y del TIPO correcto. El
  -- `::smallint` sobre `->>'esquema_version'` tenía DOS problemas (hallazgo
  -- ALTA + hallazgo BAJA 10 de la revisión con Opus): un `null` JSON daba
  -- SQL NULL y la comprobación no saltaba; y una CADENA como `"2"` pasaba el
  -- cast igual que el número 2, así que un sobre mal tipado colaba.
  -- `to_jsonb(new.esquema_version)` compara el valor JSONB completo: exige
  -- que sea un número JSON y que valga lo mismo, los dos a la vez.
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
  -- `to_char('MS')` trunca (no redondea) a milisegundos: es EXACTAMENTE la
  -- precisión de `Date.prototype.toISOString()` en el lado TypeScript, así
  -- que no hay pérdida frente al sobre real — pero si algún día un llamante
  -- confía en el DEFAULT `now()` de la columna en vez de pasar `creada_en`
  -- explícito (el disparador no lo exige; firmar.ts sí lo hace siempre), los
  -- microsegundos de más que `now()` traería se pierden en esta cadena. No es
  -- un defecto del formato: es la razón por la que `creada_en` se pasa
  -- siempre explícito desde la aplicación (hallazgo BAJA 11 de la revisión).
  v_creada_en_iso := to_char(new.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  -- `is distinct from` sobre el valor JSONB, no `->>` con `<>`: un `null`
  -- JSON en `creada_en` o `firmada_en` daba SQL NULL con `->>`, y `NULL <> x`
  -- es NULL — la comprobación no saltaba (mismo hallazgo ALTA que 6.2/6.5).
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
  -- Tipo de `firmada_en` explícito aquí también (hallazgo ALTA de la
  -- revisión): 6.7 ya lo deja igualado a una cadena ISO real si pasa, pero
  -- esta comprobación no debe DEPENDER de que 6.7 se ejecutara antes sin
  -- fallar para ser segura por sí misma.
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
  -- Los dos tipos ya están garantizados 'string' arriba (JSON), pero eso no
  -- garantiza que el TEXTO sea un instante válido — hallazgo BAJA 8 de la
  -- segunda revisión con Opus del 30-08-2026: sin este `begin/exception`, un
  -- `abierta_en` como `"basura-no-es-fecha"` reventaba el `::timestamptz` con
  -- el error crudo de Postgres (`22007 invalid input syntax for type
  -- timestamp with time zone`), sin errcode `23514` ni mensaje de dominio,
  -- rompiendo la regla que las otras ocho comprobaciones sí siguen.
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

  -- 7 · El SHA-256 tiene una sola implementación en todo el sistema:
  -- pgcrypto. La aplicación no calcula huellas nunca — es lo que hace que el
  -- criterio de blocking-prerender-* (ADR-043) se cumpla por construcción.
  new.huella := extensions.digest(
    convert_to(new.contenido_canonico, 'UTF8') || new.huella_anterior,
    'sha256'
  );

  return new;
end;
$$;

revoke execute on function public.fn_sellar_version_nota() from public;

create trigger sellar_version_nota
  before insert on public.notas_clinicas_versiones
  for each row
  execute function public.fn_sellar_version_nota();


-- =========================================================================
-- 4 · Vaciar el borrador al firmar (ADR-036)
--
-- Decisión añadida, no descuido: el ticket no la nombra, pero hacerlo desde
-- la aplicación sería una segunda transacción —justo lo que este ticket
-- prohíbe— y no hacerlo deja la nota firmada generando alertas de «nota sin
-- firmar» para siempre.
-- =========================================================================

create function public.fn_vaciar_borrador_al_firmar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `borrador_contenido = null` basta: fn_tocar_borrador() (T-001) limpia las
  -- otras dos columnas del borrador en el mismo UPDATE (check todo-o-nada).
  -- `and borrador_contenido is not null`: sin esto, CADA firma generaba una
  -- fila de auditoría de UPDATE espuria sobre notas_clinicas aunque no
  -- hubiera ningún borrador que vaciar (hallazgo MEDIA de la revisión con
  -- Opus del 30-08-2026) — firmar directamente sobre la última versión, sin
  -- pasar por un borrador, es un camino real (p. ej. la primera versión de
  -- una nota).
  update public.notas_clinicas
     set borrador_contenido = null
   where id = new.nota_id
     and borrador_contenido is not null;
  return null;
end;
$$;

revoke execute on function public.fn_vaciar_borrador_al_firmar() from public;

create trigger vaciar_borrador_al_firmar
  after insert on public.notas_clinicas_versiones
  for each row
  execute function public.fn_vaciar_borrador_al_firmar();


-- =========================================================================
-- 5 · El verificador (§10 del diseño aprobado)
--
-- La lógica vive en SQL, no en Node: si el verificador no puede importar el
-- canonicalizador, la tentación de reserializar desaparece por construcción.
-- Devuelve UNA FILA POR ANOMALÍA; cero filas es la cadena sana.
-- =========================================================================

create function public.verificar_cadena_huellas(p_paciente_id uuid default null)
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
      v.paciente_id,
      v.posicion_cadena,
      v.id as version_id,
      v.nota_id,
      v.creada_en,
      v.huella,
      v.huella_anterior,
      v.contenido_canonico,
      v.algoritmo_version,
      lag(v.huella) over (partition by v.paciente_id order by v.posicion_cadena) as huella_prev_real,
      lag(v.posicion_cadena) over (partition by v.paciente_id order by v.posicion_cadena) as posicion_prev
    from public.notas_clinicas_versiones v
    where p_paciente_id is null or v.paciente_id = p_paciente_id
  )
  -- era_desconocida: no se verifica, se declara — verificar una era ajena
  -- con el algoritmo de esta sería inventar. Es un punto ciego por diseño, y
  -- por eso la guarda 1.bis de fn_sellar_version_nota() impide que lo elija
  -- quien firma: a la era 2 solo se llega por una migración que suba esa
  -- constante (hallazgo MEDIA de la tercera revisión con Opus del 06-09-2026).
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

  order by 1, 2;
$$;

comment on function public.verificar_cadena_huellas(uuid) is
  'Verificador de la cadena de huellas (T-005). Recorre notas_clinicas_versiones LEYENDO '
  'LOS BYTES GUARDADOS de contenido_canonico y huella_anterior — NUNCA reserializa el '
  'objeto (ADR-035): no hay ningún canonicalizador en la base, así que la tentación '
  'desaparece por construcción. p_paciente_id null recorre todas las cadenas. Cero filas '
  'es la cadena sana; una fila por anomalía, con el motivo cerrado: huella_no_coincide, '
  'eslabon_desencadenado, genesis_incorrecto, hueco_de_posicion, era_desconocida.';

-- No se concede a `authenticated`: recorrer todas las cadenas revela cuántas
-- versiones tiene cada paciente, saltándose la RLS. Es una herramienta de
-- operación y la ejecuta `postgres`.
revoke all on function public.verificar_cadena_huellas(uuid) from public, anon, authenticated, service_role;
