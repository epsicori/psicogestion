-- T-036 · Cita, borrador y reloj de la firma, cotejados con la base (corte 1).
--
-- Diseño: tickets/T-036/diseno.md (§1.1 y enmienda E.1-E.2). ADR-036 (borrador y bloqueo
-- optimista), ADR-046 (el sobre sella lo que la base puede comprobar), ADR-071.5 (permisos antes
-- que cotejo), ADR-073.4 (la cita en la cabecera).
--
--   1  Guarda: exige T-012 (borrador_abierta_en y los dos márgenes de sesión).
--   2  fn_sellar_version_nota() re-emitida: lee también la cita y el borrador en el paso 2 y
--      añade 6.17-6.24. 6.19 (cita_id = cabecera) vale para todos los roles; el resto, solo para
--      authenticated y anon, como el paso 0 (P1).
--   3  verificar_cadena_huellas() re-emitida: coteja cita_id con la cabecera (6.19).
--   4  fn_congelar_cabecera_sellada() re-emitida: solo cambia el texto del mensaje.
--
-- Orden de los errores = parte del diseño: 6.17-6.24 van DESPUÉS de 6.16 y del paso 0.

-- =========================================================================
-- 1 · Guarda de prerrequisitos
-- =========================================================================

do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public'
         and ((table_name = 'notas_clinicas' and column_name = 'borrador_abierta_en')
           or (table_name = 'organizacion'   and column_name = 'margen_sesion_minutos')
           or (table_name = 'centros'        and column_name = 'margen_sesion_minutos'))) <> 3 then
    raise exception
      'T-036 exige T-012: faltan notas_clinicas.borrador_abierta_en, organizacion.margen_sesion_minutos '
      'o centros.margen_sesion_minutos. Aplica antes la migración de T-012 (20261002120000).'
      using errcode = '55000';
  end if;
end;
$$;


-- =========================================================================
-- 2 · fn_sellar_version_nota(): cuerpo de T-012c + 6.17-6.24
-- =========================================================================

create or replace function public.fn_sellar_version_nota()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 set search_path = ''
AS $$
declare
  v_paciente_id      uuid;
  v_episodio_id      uuid;
  v_autor_cabecera   uuid;
  v_fecha_sesion     date;
  v_coprofesional_id uuid;
  v_huella_prev      bytea;
  v_pos              integer;
  v_contenido        jsonb;
  v_claves           text[];
  v_esperadas        constant text[] := array[
    'abierta_en', 'alcance', 'anotaciones_reservadas', 'autor_id', 'cita_id',
    'coprofesional_id', 'creada_en', 'cuerpo', 'episodio_id', 'esquema_version',
    'fecha_sesion', 'firmada_en', 'margen_sesion_minutos', 'motivo_cambio', 'nota_id',
    'paciente_id', 'redactada_en_sesion'
  ];
  v_creada_en_iso text;
  -- T-036: la cita y el borrador de la cabecera, y lo que 6.17-6.24 calculan con ellos.
  v_cita_cabecera       uuid;
  v_borrador_vivo       boolean;
  v_borrador_abierta_en timestamptz;
  v_borrador_contenido  jsonb;
  v_mismo_texto         boolean;
  v_mismas_reservadas   boolean;
  v_cita_paciente       uuid;
  v_cita_profesional    uuid;
  v_cita_centro         uuid;
  v_cita_inicio         timestamptz;
  v_cita_fin            timestamptz;
  v_margen              integer;
  v_en_sesion           boolean;
begin
  -- 0 · Permisos antes que cotejo (ADR-071.5). Misma condición que la política
  -- notas_clinicas_versiones_alta. Todo lo que sigue lee la cabecera saltándose la
  -- RLS (security definer) y lanza errores que dependen de ella; la RLS de alta se
  -- evalúa DESPUÉS de este disparador. Sin este paso, el orden de los errores
  -- revelaría a quien no puede firmar el paciente, el episodio, el autor, la fecha,
  -- el coprofesional y hasta la existencia de la nota. postgres y service_role no
  -- pasan por la RLS y tampoco por aquí. Si cambia la política, cambia este paso
  -- (C.perm.0 lo vigila).
  if current_setting('role', true) in ('authenticated', 'anon') then
    if not coalesce(
         (select public.historia_desbloqueada())
         and new.autor_id = (select auth.uid())
         and exists (select 1 from public.notas_clinicas n
                      where n.id = new.nota_id and n.autor_id = (select auth.uid())),
         false) then
      raise exception 'No puedes firmar una versión de esta nota: la firma su autor, con la historia desbloqueada (T-012c, ADR-071)'
        using errcode = '42501';
    end if;
  end if;

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

  -- 2 · La cabecera la dice notas_clinicas: paciente, episodio, autor, fecha de
  -- sesión y coprofesional, congelados tras la primera firma. Se lee con
  -- `for no key update` (D13): la segunda de dos firmas concurrentes de la misma nota
  -- espera aquí y relee la cabecera ya confirmada. NO `for share`: el `after insert`
  -- fn_vaciar_borrador_al_firmar actualiza esta misma fila en la misma transacción, y
  -- dos cerrojos compartidos que luego suben a exclusivo se interbloquean (40P01).
  -- Va DESPUÉS del paso 0: quien no puede firmar no llega a bloquear la fila de nadie.
  -- T-036: también la cita y el borrador (con su abierta_en y su contenido); A, B y 6.24 se
  -- deciden con ESTA lectura, no con otra: la segunda de dos firmas concurrentes relee aquí
  -- la fila ya confirmada, con el borrador vaciado por la primera, o con el que guardó otra
  -- sesión entretanto (R2-H1).
  select n.paciente_id, n.episodio_id, n.autor_id, n.fecha_sesion, n.coprofesional_id,
         n.cita_id, n.borrador_contenido is not null, n.borrador_abierta_en, n.borrador_contenido
    into strict v_paciente_id, v_episodio_id, v_autor_cabecera, v_fecha_sesion, v_coprofesional_id,
         v_cita_cabecera, v_borrador_vivo, v_borrador_abierta_en, v_borrador_contenido
    from public.notas_clinicas n
   where n.id = new.nota_id
     for no key update;

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
  --
  -- T-012c: el cerrojo de fila del paso 2 es un cerrojo más. Una transacción que
  -- firma dos notas del mismo paciente (N y luego N') mientras otra firma N' puede
  -- interbloquearse: la primera tiene el consultivo y espera la fila N', la segunda
  -- tiene la fila N' y espera el consultivo. Mismo remedio: una firma por transacción
  -- (T-012 firma una nota por acción) u orden estable.
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

  -- 6 · Las comprobaciones de coherencia sobre–fila: 6.1-6.16 (T-012c añadió 6.11-6.16:
  -- nota_id, paciente_id, episodio_id, autor de la cabecera, fecha_sesion y
  -- coprofesional_id) y 6.19 valen para TODOS los roles; 6.17, 6.18 y 6.20-6.24 (T-036)
  -- solo para authenticated y anon (P1, como el paso 0). El sobre nace completo o se paga una era nueva de algoritmo
  -- (nada de esto se recalcula jamás): esta es la guarda que impide sellar un
  -- sobre con otra forma.
  --
  -- LIMITACIÓN CONOCIDA (hallazgo BAJA 6 de la segunda revisión con Opus del
  -- 30-08-2026, documentada a propósito y no dejada implícita): estas comprobaciones
  -- validan que las CLAVES sean las diecisiete exactas y que los VALORES coincidan
  -- semánticamente con las columnas y la cabecera — NO validan que
  -- `contenido_canonico` sea JCS (RFC 8785) de verdad byte a byte. Un texto
  -- con espacios de más o las claves en otro orden pasa estas comprobaciones
  -- igual, porque comparan valores JSON (vía `->`/`->>`), no la forma exacta del
  -- texto. Hoy la única garantía de canonicidad real es `lib/huella/jcs.ts`, en
  -- TypeScript — y `authenticated` tiene `grant insert` directo sobre esta tabla
  -- (`notas_clinicas_versiones_alta`), así que un `insert` a mano (o un cliente
  -- que no pase por `firmar.ts`) puede sellar un sobre válido en contenido pero
  -- NO canónico byte a byte. La cadena sigue siendo internamente consistente (la
  -- huella coincide con ESOS bytes, encadena bien, el verificador la da por sana)
  -- pero esos bytes podrían no ser los que JCS habría producido para el mismo
  -- contenido. Se acepta tal cual: exigir JCS de verdad en SQL significaría
  -- reimplementar el canonicalizador en PL/pgSQL, que es precisamente lo que
  -- el ADR-035 quiere evitar (dos implementaciones del mismo algoritmo que
  -- pueden desincronizarse). El verificador (`verificar_cadena_huellas`) LEE LOS
  -- BYTES GUARDADOS y nunca los deriva — es la garantía que sí importa (ADR-035) y
  -- esta no la rompe. El verificador coteja desde T-012b cada clave sellada con su
  -- columna, y desde T-012c también con la cabecera notas_clinicas.
  v_contenido := new.contenido_canonico::jsonb;

  -- 6.1 · Objeto con EXACTAMENTE las diecisiete claves vigentes, SIN NINGUNA
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
      'menos (esquema_version %, ADR-035/046/057/067/071/072)', v_esperadas, new.esquema_version
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

  -- 6.11-6.16 · La cabecera de la nota (T-012c). Mismas reglas que 6.10: `is distinct
  -- from` sobre el jsonb completo, nunca `->>` con `<>`; cada condición en UNA línea
  -- (los mutantes del banco la buscan por fragmento).
  -- 6.11 · nota_id del sobre = columna nota_id (ADR-067).
  if (v_contenido -> 'nota_id') is distinct from to_jsonb(new.nota_id::text) then
    raise exception
      'El nota_id del sobre no coincide con la columna nota_id, o no es una cadena (T-012c, ADR-067)'
      using errcode = '23514';
  end if;

  -- 6.12 · paciente_id del sobre = paciente de la cabecera (ADR-067).
  if (v_contenido -> 'paciente_id') is distinct from to_jsonb(v_paciente_id::text) then
    raise exception
      'El paciente_id del sobre no coincide con el paciente de la cabecera notas_clinicas, o no es una cadena (T-012c, ADR-067)'
      using errcode = '23514';
  end if;

  -- 6.13 · episodio_id del sobre = episodio de la cabecera. Tras T-034 la cabecera
  -- siempre tiene episodio: un sobre con `null` falla (ADR-071.4).
  if (v_contenido -> 'episodio_id') is distinct from to_jsonb(v_episodio_id::text) then
    raise exception
      'El episodio_id del sobre no coincide con el episodio de la cabecera notas_clinicas, o no es una cadena (T-012c, ADR-067, ADR-071)'
      using errcode = '23514';
  end if;

  -- 6.14 · autor_id del sobre = autor de la cabecera, además de la columna (6.2) (D2).
  if (v_contenido -> 'autor_id') is distinct from to_jsonb(v_autor_cabecera::text) then
    raise exception
      'El autor_id del sobre no coincide con el autor de la cabecera notas_clinicas (T-012c, ADR-067)'
      using errcode = '23514';
  end if;

  -- 6.15 · fecha_sesion del sobre = fecha de la cabecera, como cadena AAAA-MM-DD (ADR-071).
  -- La era se conserva (sufijo ' BC' antes de Cristo): to_char la descartaría y una cabecera BC
  -- coincidiría con un sobre del mismo día d. C.; así no depende de DateStyle.
  if (v_contenido -> 'fecha_sesion') is distinct from to_jsonb(to_char(v_fecha_sesion, 'YYYY-MM-DD') || case when v_fecha_sesion < date '0001-01-01' then ' BC' else '' end) then
    raise exception
      'La fecha_sesion del sobre no coincide con la fecha de sesión de la cabecera notas_clinicas (AAAA-MM-DD), o no es una cadena (T-012c, ADR-071)'
      using errcode = '23514';
  end if;

  -- 6.16 · coprofesional_id del sobre = coprofesional de la cabecera; `null` JSON si la
  -- cabecera no tiene (la clave siempre está, ADR-072.3). El `coalesce` es uno de los dos
  -- sitios del disparador (6.16 y 6.19) donde un null SQL se vuelve null JSON a propósito.
  if (v_contenido -> 'coprofesional_id') is distinct from coalesce(to_jsonb(v_coprofesional_id::text), 'null'::jsonb) then
    raise exception
      'El coprofesional_id del sobre no coincide con el coprofesional de la cabecera notas_clinicas (null si no hay), o no es una cadena ni null (T-012c, ADR-072)'
      using errcode = '23514';
  end if;

  -- 6.19 · A · cita_id del sobre = cita de la cabecera (H27, ADR-073.4), para TODOS los roles
  -- (decisión del propietario del 02-10-2026): es coherencia pura, como 6.11-6.16. null JSON
  -- si la cabecera no tiene. Sin lower(): el sobre canónico lleva el UUID en minúsculas
  -- (uuidMinusculas en lib/huella/sobre.ts), igual que 6.11-6.16.
  if (v_contenido -> 'cita_id') is distinct from coalesce(to_jsonb(v_cita_cabecera::text), 'null'::jsonb) then
    raise exception 'El cita_id del sobre no es la cita de la cabecera notas_clinicas (null si no hay; UUID en minúsculas) (T-036, ADR-073)'
      using errcode = '23514';
  end if;

  -- 6.17-6.24 · La firma no se fía del cliente (T-036; D1, D3 y H27 de T-012/T-012c, R2-H1).
  -- Solo para authenticated y anon, como el paso 0 (P1 del 01-10-2026): la siembra, la
  -- fijación y t005 firman como postgres, retrofechadas y sin borrador. Van DESPUÉS de 6.16:
  -- ninguna negativa anterior cambia de error, y ninguna sale antes que el 42501 del paso 0.
  -- Ningún mensaje de este bloque contiene la subcadena que firmarNota usa para distinguir
  -- un error de programación de un conflicto: todos se traducen a conflicto.
  if current_setting('role', true) in ('authenticated', 'anon') then  -- P1 (T-036)

    -- 6.17 · B · Borrador vivo (D3). Se firma lo que hay abierto. Leído en el paso 2, con
    -- el cerrojo: la segunda de dos firmas concurrentes ve el borrador ya vaciado.
    if not v_borrador_vivo then
      raise exception 'No hay borrador vivo que firmar: la nota ya se firmó o no se abrió para modificarla; hay que reabrir el borrador (T-036, D3)'
        using errcode = '23514';
    end if;

    -- 6.24 · R2-H1 · Lo que se sella es el borrador VIGENTE, leído en el paso 2 bajo el cerrojo:
    -- un guardado de otra sesión entre la lectura de firmarNota y este insert se detecta aquí
    -- y no se pierde (ADR-036). Texto y reservadas en NFC a los dos lados: el borrador se guarda
    -- crudo y el sobre llega en NFC (lib/huella/nfc.ts). Texto nulo o ausente en cualquiera de
    -- los dos lados = no coincide. Reservadas: '' en el borrador ≡ null en el sobre (firmarNota).
    v_mismo_texto := coalesce(normalize(v_contenido #>> '{cuerpo,texto}', NFC) = normalize(v_borrador_contenido ->> 'texto', NFC), false);
    v_mismas_reservadas := normalize(nullif(v_contenido ->> 'anotaciones_reservadas', ''), NFC) is not distinct from normalize(nullif(v_borrador_contenido ->> 'reservadas', ''), NFC);
    if not (v_mismo_texto and v_mismas_reservadas) then
      raise exception 'Lo que se firma no es el borrador vigente de la cabecera: otra sesión lo cambió entretanto; hay que releerlo (T-036, R2-H1, ADR-036)'
        using errcode = '23514';
    end if;

    -- 6.18 · C · el instante de apertura del sobre = notas_clinicas.borrador_abierta_en, que
    -- escribe solo fn_tocar_borrador (T-012). Truncado a milisegundos con el mismo to_char que
    -- 6.7: igual que `new Date(...)` en Node, que trunca y no redondea. Se compara como cadena
    -- JSON, así que también exige la forma de toISOString() (milisegundos y «Z»).
    if (v_contenido -> 'abierta_en') is distinct from to_jsonb(to_char(v_borrador_abierta_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
      raise exception 'El instante de apertura del sobre no es el instante en que la base abrió el borrador (columna de la cabecera, truncada a milisegundos) (T-036, ADR-046)'
        using errcode = '23514';
    end if;

    -- 6.20 · P2 · firmada_en (= creada_en, 6.7) acotado al reloj de la base: un minuto a
    -- cada lado de now(). Sin esto, 6.23 se burla retrofechando la firma.
    if new.creada_en not between now() - interval '1 minute' and now() + interval '1 minute' then
      raise exception 'firmada_en se aparta más de un minuto del reloj de la base: la firma se fecha al firmar, no la elige el cliente (T-036, P2)'
        using errcode = '23514';
    end if;

    if v_cita_cabecera is not null then
      select c.paciente_id, c.profesional_id, c.centro_id,
             date_trunc('milliseconds', c.inicio), date_trunc('milliseconds', c.fin)
        into v_cita_paciente, v_cita_profesional, v_cita_centro, v_cita_inicio, v_cita_fin
        from public.citas c
       where c.id = v_cita_cabecera;

      -- 6.21 · P3 · La cita es DE ESTA NOTA: mismo paciente y su profesional es el autor. Solo
      -- en la v1 (decisión del propietario del 02-10-2026): las siguientes heredan una cita ya
      -- comprobada y congelada en la cabecera. La misma regla que
      -- fn_resolver_alerta_nota_sin_firmar (T-012 §1.2 paso 9).
      if new.numero_version = 1 and (v_cita_paciente is distinct from v_paciente_id or v_cita_profesional is distinct from v_autor_cabecera) then
        raise exception 'La cita de la cabecera no pertenece a esta nota: tiene que ser del mismo paciente y de su autor (T-036, P3)'
          using errcode = '23514';
      end if;

      -- 6.22 · Margen efectivo: el del centro de la cita si no es nulo; si no (o si la cita
      -- no tiene centro), el de la organización (fila única, not null).
      select coalesce(ce.margen_sesion_minutos, o.margen_sesion_minutos)
        into v_margen
        from public.organizacion o
        left join public.centros ce on ce.id = v_cita_centro;
      if (v_contenido -> 'margen_sesion_minutos') is distinct from to_jsonb(v_margen) then
        raise exception 'El margen_sesion_minutos del sobre no es el margen efectivo (el del centro de la cita o, si es nulo, el de la organización) (T-036, ADR-046)'
          using errcode = '23514';
      end if;

      -- 6.23 · D · redactada_en_sesion lo recalcula la base con la fórmula de
      -- calcularRedactadaEnSesion (lib/huella/sesion.ts): bordes incluidos, en milisegundos.
      -- abierta_en y firmada_en salen del sobre, ya atados a la base por 6.18, 6.7 y 6.20.
      v_en_sesion := (v_contenido ->> 'abierta_en')::timestamptz >= v_cita_inicio - make_interval(mins => v_margen)
                 and (v_contenido ->> 'firmada_en')::timestamptz <= v_cita_fin + make_interval(mins => v_margen);
      if (v_contenido -> 'redactada_en_sesion') is distinct from to_jsonb(v_en_sesion) then
        raise exception 'El redactada_en_sesion del sobre no es el que recalcula la base con la ventana de la cita y el margen (T-036, ADR-046)'
          using errcode = '23514';
      end if;
    end if;
    -- Sin cita en la cabecera, 6.19 ya obligó a cita_id null en el sobre, y 6.9 a
    -- redactada_en_sesion false y margen null: no queda nada que comprobar.
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

revoke all on function public.fn_sellar_version_nota() from public, anon, authenticated, service_role;


-- =========================================================================
-- 3 · verificar_cadena_huellas(): coteja también cita_id con la cabecera (6.19)
-- =========================================================================

create or replace function public.verificar_cadena_huellas(p_paciente_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(paciente_id uuid, posicion_cadena integer, version_id uuid, nota_id uuid, creada_en timestamp with time zone, motivo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 set search_path = ''
AS $$
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
      lag(v.posicion_cadena) over (partition by v.paciente_id order by v.posicion_cadena) as posicion_prev,
      v.cuerpo,
      v.anotaciones_reservadas,
      v.autor_id,
      v.esquema_version,
      v.motivo_cambio,
      v.alcance,
      case when pg_input_is_valid(v.contenido_canonico, 'jsonb')
           then v.contenido_canonico::jsonb end                                   as sobre,
      case when pg_input_is_valid(v.cuerpo, 'jsonb')
           then v.cuerpo::jsonb end                                               as cuerpo_jsonb,
      to_jsonb(to_char(v.creada_en at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))                          as creada_en_iso,
      n.paciente_id      as cab_paciente_id,
      n.episodio_id      as cab_episodio_id,
      n.autor_id         as cab_autor_id,
      n.fecha_sesion     as cab_fecha_sesion,
      n.coprofesional_id as cab_coprofesional_id,
      n.cita_id          as cab_cita_id
    from public.notas_clinicas_versiones v
    left join public.notas_clinicas n on n.id = v.nota_id
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

  union all

  -- sobre_no_coincide_con_fila (T-012b, ADR-057; T-012c, ADR-067/071/072): cada
  -- columna que el firmante copia del sobre (lib/huella/firmar.ts) se coteja con su
  -- clave SELLADA, y desde T-012c las claves de cabecera también con la cabecera
  -- notas_clinicas, con la MISMA semántica que la comprobación del disparador que las
  -- validó al insertar. La huella sigue calculándose solo sobre los bytes guardados
  -- (ADR-035): aquí se comparan valores, no se reserializa nada. Si la cabecera no
  -- existe, todos los cab_* son null y la versión se señala.
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'sobre_no_coincide_con_fila'::text
    from c
   where c.algoritmo_version = 1
     and (
          c.sobre is null                                                    -- no es JSON: no se puede cotejar
       or jsonb_typeof(c.sobre) <> 'object'
       or (c.sobre -> 'alcance')                is distinct from to_jsonb(c.alcance::text)                         -- 6.10
       or (c.sobre -> 'autor_id')               is distinct from to_jsonb(c.autor_id::text)                        -- 6.2
       or (c.sobre -> 'cuerpo')                 is distinct from c.cuerpo_jsonb                                    -- 6.3
       or (c.sobre -> 'anotaciones_reservadas') is distinct from coalesce(to_jsonb(c.anotaciones_reservadas), 'null'::jsonb) -- 6.4
       or (c.sobre -> 'esquema_version')        is distinct from to_jsonb(c.esquema_version)                       -- 6.5
       or (c.sobre -> 'motivo_cambio')          is distinct from coalesce(to_jsonb(c.motivo_cambio), 'null'::jsonb)          -- 6.6
       or (c.sobre -> 'creada_en')              is distinct from c.creada_en_iso                                   -- 6.7
       or (c.sobre -> 'firmada_en')             is distinct from c.creada_en_iso                                   -- 6.7
       or (c.sobre -> 'nota_id') is distinct from to_jsonb(c.nota_id::text)                                        -- 6.11
       or (c.sobre -> 'paciente_id') is distinct from to_jsonb(c.paciente_id::text)                                -- 6.12, fila
       or (c.sobre -> 'paciente_id') is distinct from to_jsonb(c.cab_paciente_id::text)                            -- 6.12, cabecera
       or (c.sobre -> 'episodio_id') is distinct from to_jsonb(c.cab_episodio_id::text)                            -- 6.13
       or (c.sobre -> 'autor_id') is distinct from to_jsonb(c.cab_autor_id::text)                                  -- 6.14
       or (c.sobre -> 'fecha_sesion') is distinct from to_jsonb(to_char(c.cab_fecha_sesion, 'YYYY-MM-DD') || case when c.cab_fecha_sesion < date '0001-01-01' then ' BC' else '' end) -- 6.15
       or (c.sobre -> 'coprofesional_id') is distinct from coalesce(to_jsonb(c.cab_coprofesional_id::text), 'null'::jsonb) -- 6.16
       or (c.sobre -> 'cita_id') is distinct from coalesce(to_jsonb(c.cab_cita_id::text), 'null'::jsonb)   -- 6.19
     )

  order by 1, 2, 6;
$$;

comment on function public.verificar_cadena_huellas(uuid) is
  'Verificador de la cadena de huellas (T-005). Recorre notas_clinicas_versiones LEYENDO '
  'LOS BYTES GUARDADOS de contenido_canonico y huella_anterior — NUNCA reserializa el '
  'objeto (ADR-035): no hay ningún canonicalizador en la base, así que la tentación '
  'desaparece por construcción. p_paciente_id null recorre todas las cadenas. Cero filas '
  'es la cadena sana; una fila por anomalía, con el motivo cerrado: huella_no_coincide, '
  'eslabon_desencadenado, genesis_incorrecto, hueco_de_posicion, era_desconocida, '
  'sobre_no_coincide_con_fila. Además coteja las siete columnas que el sobre repite '
  '(alcance, autor_id, cuerpo, anotaciones_reservadas, esquema_version, motivo_cambio, '
  'creada_en) con su clave sellada (comprobaciones 6.2-6.7 y 6.10 de '
  'fn_sellar_version_nota()) y, desde T-012c (ADR-067/071/072), las claves de '
  'cabecera con la fila de la versión y con la cabecera notas_clinicas (nota_id, '
  'paciente_id, episodio_id, autor_id, fecha_sesion y coprofesional_id; 6.11-6.16) y, '
  'desde T-036 (ADR-073.4), cita_id con la cabecera (6.19); '
  'cotejar valores no es reserializar (ADR-035). Una fila por versión divergente, no por '
  'columna.';

revoke all on function public.verificar_cadena_huellas(uuid) from public, anon, authenticated, service_role;


-- =========================================================================
-- 4 · fn_congelar_cabecera_sellada(): solo cambia el texto del mensaje
-- =========================================================================

create or replace function public.fn_congelar_cabecera_sellada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 set search_path = ''
AS $$
begin
  if exists (select 1 from public.notas_clinicas_versiones v where v.nota_id = old.id) then
    raise exception
      'La cabecera de una nota ya firmada no se puede reatribuir (paciente, fecha de '
      'sesión, autor, episodio, cita o coprofesional): el sobre canónico de la era 4 sella '
      'los seis campos, y verificar_cadena_huellas() los coteja todos con la cabecera '
      '(ADR-035/046/067/071/072/073)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_congelar_cabecera_sellada() from public, anon, authenticated;

comment on function public.fn_congelar_cabecera_sellada() is
  'Con la primera versión se congela la cabecera de la nota: paciente, fecha de sesión, autor, '
  'episodio, cita y coprofesional (ADR-035/046/072). El sobre de la era 4 los sella y el '
  'verificador los coteja todos, la cita incluida desde T-036. 42501.';
