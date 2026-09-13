---
id: T-005
titulo: Cadena de huellas SHA-256, canonicalización y verificador
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-004]
estado: hecho
completado: 2026-09-06
---

# Contexto

El invariante 1 dice `huella(n) = SHA-256( contenido(n) || huella(n-1) )` y el **ADR-035**
define lo que faltaba: `contenido(n)` es **una cadena de bytes canónica generada una sola
vez al firmar y guardada**, y la verificación vuelve a leer esos bytes, **jamás los deriva
otra vez del objeto**.

Si se hace mal, se rompe en silencio, que es la peor forma. Una huella recalculada
serializando el objeto cambia con el orden de las claves, el escapado, los espacios, la
forma de los números o la normalización Unicode. Un `npm update` bastaría, y el
verificador nocturno **no podría distinguirlo de una manipulación**.

Referencias: `docs/architecture.md` §Cadena de huellas. ADR **035** (canonicalización y
sobre), **046** (el sobre crece con la cita y el sello de sesión), **027** (los dos
cuerpos entran en el cómputo), **031** (fusionar **jamás**
recalcula una huella), **036** (a la cadena se entra firmando), **043** (`crypto` bloquea
el prerenderizado: esto vive en Server Actions y en la base, nunca en el render).

Sirve a **dos** obligaciones legales con un solo mecanismo: `notas_clinicas_versiones`
(Ley 41/2002) y `facturas` (RD 1007/2023, Verifactu). Las facturas son fase posterior;
la cadena se escribe ahora **genérica**, igual que se hizo con `fn_auditar()`.

## Tareas

- [x] **Canonicalizador JCS (RFC 8785)** en TypeScript, en `lib/huella/`, con
      **normalización Unicode NFC de todos los valores de texto antes de canonicalizar**.
      Salida: `Uint8Array` en UTF-8.
      — `lib/huella/jcs.ts` (`canonizar`, `canonizarABytes`) + `lib/huella/nfc.ts`
      (`normalizarNfc`), sin dependencia nueva. 24 pruebas en `jcs.test.ts` + 6 en
      `nfc.test.ts`, todas en verde (`npx vitest run lib/huella`).
- [x] **Sobre**, no cuerpo suelto: se sellan `cuerpo`, `anotaciones_reservadas`, `autor_id`,
      `creada_en`, `motivo_cambio` y `esquema_version`, **más `cita_id`, `abierta_en`,
      `firmada_en` y `redactada_en_sesion` con el margen que aplicó** (ADR-046, cerrado el
      26-08-2026). Sellar solo el cuerpo dejaría cambiar el autor sin romper la cadena; y
      dejar `redactada_en_sesion` fuera dejaría convertir un «lo escribí el viernes» en un
      «lo escribí en sesión» sin rastro. **El sobre nace completo o se paga una era nueva
      de algoritmo**, porque lo viejo jamás se recalcula.
      — `lib/huella/sobre.ts` (`esquemaSobre` Zod estricto de once claves,
      `construirSobre`, `canonizarSobre`), `esquema_version = 2`. Comprobado además en la
      base: `fn_sellar_version_nota()` exige las once claves exactas (comprobación 6.1).
- [x] **Encadenado**: `contenido || huella_anterior`, con la anterior en **32 bytes
      fijos** —sin separador, porque la longitud fija lo hace inambiguo— y **32 bytes cero**
      en el primer eslabón.
      — `notas_clinicas_versiones.huella_anterior bytea check (octet_length = 32)` (T-001);
      primer eslabón `decode(repeat('00',32),'hex')` en `fn_sellar_version_nota()`.
      Verificado con datos reales: `scripts/rls/13-cadena-huellas.sql` §A.
- [x] `algoritmo_version` en cada versión. Cambiar de algoritmo abre una era nueva;
      **recalcular lo viejo está prohibido**.
      — Columna ya existente (T-001, `default 1`); el verificador declara `era_desconocida`
      para cualquier valor distinto de 1 y se niega a opinar (nunca recalcula).
- [x] **Server Action de firma**: canoniza, calcula, encadena e inserta la versión, todo en
      **una transacción**, con **serialización de la cadena por paciente o por episodio**
      para que dos firmas simultáneas no compartan `huella_anterior`.
      — Cortado por la línea del ticket (§15 del diseño aprobado): `lib/huella/firmar.ts`
      (`firmarVersionNota`, sin `"use server"`, fuera de `app/`) construye el sobre y hace
      el único `insert`; el cálculo, encadenado y cerrojo (`pg_advisory_xact_lock`) viven en
      el disparador `fn_sellar_version_nota()`, así que un `insert` es su propia
      transacción. La Server Action de fase 1 la envuelve en una línea.
      Concurrencia real de dos conexiones probada y en verde: `npm run test:huellas`
      (`scripts/t005-concurrencia.sql`) — la segunda conexión muere con
      `ERROR: canceling statement due to lock timeout` (55P03) mientras la primera no ha
      hecho commit, y entra limpia después con `posicion_cadena` 1 y 2 y
      `huella_anterior` distintas.
- [x] **Verificador**: recorre la cadena leyendo los bytes guardados y señala **cuál** es
      el primer eslabón roto y **cuándo**. Ejecutable a mano (`npm run verificar:huellas`)
      y preparado para la ejecución nocturna.
      — `public.verificar_cadena_huellas(uuid)` (SQL, `stable security definer`, sin
      concesión a `authenticated`) + `scripts/verificar-huellas.mjs`. Ejecutado a mano contra
      la base local: cadena sana → `cadena íntegra: cero anomalías` (exit 0); versión
      manipulada a mano con los cerrojos levantados → nombra paciente, versión, nota y fecha
      exactos (exit 1); restaurada → íntegra de nuevo (evidencia completa más abajo, guion
      de comprobación manual). `--json` y el código de salida distinto de cero listos para
      que T-009 los enganche a la ejecución nocturna (línea exacta en `docs/state.md`).
- [x] **Batería de casos feos** a propósito: acentos compuestos y precompuestos, emoji,
      comillas tipográficas, texto pegado desde Word, claves fuera de orden, números en
      notación exponencial, cadenas con caracteres de control, campos vacíos y
      `anotaciones_reservadas` nulo frente a cadena vacía.
      — Todos en `lib/huella/jcs.test.ts` (sección «casos feos a propósito» y
      «conformidad JCS») y en los 8 vectores de `vectores-congelados.json`.
- [x] **Vector de regresión congelado**: un puñado de sobres con su huella esperada,
      guardados como fichero. Si un cambio de dependencia mueve una huella, **falla ahí**,
      no en producción seis meses después.
      — `lib/huella/vectores-congelados.json` (8 vectores), `lib/huella/vectores.test.ts`
      (TypeScript) y `lib/huella/vectores-sql.test.ts` (cierra el lazo con las 3 copias
      literales en `scripts/rls/13-cadena-huellas.sql`, comprobadas contra pgcrypto).

## Criterios de aceptación (verificables)

- [x] **Automático** — `npx supabase db reset`, `npm run lint` y `npm run build` limpios.
      — `npx supabase db reset`: `Finished supabase db reset on branch T-005-cadena-huellas`
      (7 migraciones aplicadas, seed incluido). `npm run lint`: sin salida, exit 0.
      `npm run build`: `✓ Compiled successfully`, `Finished TypeScript`, sin errores (con
      `.env.local` temporal para superar la comprobación de variables de entorno, no
      relacionada con este ticket; retirado al terminar). `npm run lint:migraciones`:
      `lint-migraciones: 7 migración(es) limpias.`
- [x] **Automático** — el mismo sobre con las claves en **otro orden** produce la
      **misma** huella; el mismo texto en NFD y en NFC, también.
      — `jcs.test.ts` («ordena las claves…», «el mismo objeto con las claves en otro
      orden…»), `sobre.test.ts` («el mismo sobre con las claves insertadas en otro orden…»)
      y los vectores `acentos-nfd`/`acentos-nfc` (`vectores.test.ts`: «dan EXACTAMENTE la
      misma huella»). Los tres en verde.
- [x] **Automático** — cambiar **un solo carácter** de `anotaciones_reservadas` cambia la
      huella (ADR-027: los dos cuerpos entran).
      — `sobre.test.ts` («cambiar un solo carácter de anotaciones_reservadas cambia el
      canónico») + vectores `reservadas-nulas`/`reservadas-vacias` (huellas distintas) +
      comprobación 6.4 de `fn_sellar_version_nota()`, ejercitada en
      `scripts/rls/13-cadena-huellas.sql` §C (rechaza un sobre con `anotaciones_reservadas`
      que no coincide).
- [x] **Automático** — cambiar `autor_id` sin tocar el cuerpo **rompe** la cadena.
      — `sobre.test.ts` («cambiar autor_id cambia el canónico») y, en base, la comprobación
      6.2 del disparador: `scripts/rls/13-cadena-huellas.sql` §C, «Un sobre con autor_id
      distinto del de la fila lanza» — verde con `npm run test:rls`.
- [x] **Automático** — cambiar `redactada_en_sesion` de `false` a `true` en el sobre
      **rompe** la huella (ADR-046). Es el criterio que hace que el sello valga algo.
      — `sobre.test.ts` («cambiar redactada_en_sesion de false a true cambia el canónico
      (ADR-046)») y el vector `en-sesion`.
- [x] **Automático** — el vector de regresión congelado reproduce sus huellas byte a byte.
      — `vectores.test.ts` (los 8, en TypeScript) y `vectores-sql.test.ts` (cierra el lazo
      con los 3 copiados literalmente en SQL) + `scripts/rls/13-cadena-huellas.sql` §B, que
      reproduce esos 3 con pgcrypto de verdad contra la base — verde con `npm run test:rls`.
- [x] **Automático** — el verificador sobre una cadena sana devuelve **cero** roturas;
      manipulando una versión intermedia **con `postgres` y los cerrojos levantados a
      propósito**, señala **exactamente esa** y ninguna anterior.
      — `scripts/rls/13-cadena-huellas.sql` §D.1 (cadena de tres versiones; manipulada la
      posición 2, el verificador devuelve exactamente 1 fila, posición 2,
      `huella_no_coincide`) — verde con `npm run test:rls`. Repetido a mano contra la base
      local con `npm run verificar:huellas`: cadena sana → «cero anomalías» (exit 0);
      manipulada con `grant update … to postgres` + `alter table … disable trigger` →
      nombra el paciente, la versión, la nota y la fecha exactos (exit 1); restaurada →
      «cero anomalías» de nuevo (exit 0). Transcripción completa en el guion de
      comprobación manual, más abajo.
- [x] **Automático** — el verificador **no vuelve a serializar el objeto**: comprobable
      porque, alterando el JSON guardado de forma que serialice distinto pero canonice
      igual, la verificación sigue dando el mismo resultado que leyendo los bytes.
      — `scripts/rls/13-cadena-huellas.sql` §D.2, en sus dos sentidos: reescribir la
      columna `cuerpo` (jsonb-equivalente, distinto en bytes) **no** lo detecta —el
      verificador no deriva nada de `cuerpo`—; reescribir `contenido_canonico`
      (jsonb-equivalente, distinto en bytes) **sí** lo detecta, porque compara los bytes
      guardados, no una reserialización. Las dos aserciones en verde con `npm run test:rls`.
- [x] **Automático** — dos firmas concurrentes sobre la misma cadena **no** producen dos
      versiones con la misma `huella_anterior` (prueba con dos transacciones a la vez).
      — Por restricción: `unique (paciente_id, huella_anterior)`, ejercitada de forma
      determinista (sin concurrencia) en `scripts/rls/13-cadena-huellas.sql` §D («huella_anterior
      repetida… lanza 23505»). Por concurrencia real: `npm run test:huellas`
      (`scripts/t005-concurrencia.sql`, dos conexiones de verdad) — la segunda transacción
      muere con `55P03 lock_not_available` mientras la primera no ha hecho `commit`; tras el
      `commit`, la segunda firma entra limpia con posiciones 1 y 2 y `huella_anterior`
      distintas. Salida completa en la evidencia de ejecución de esta sesión.
- [x] **Automático** — vincular un paciente duplicado (ADR-031) **no** altera ninguna
      huella existente: el verificador da idéntico resultado antes y después.
      — `scripts/rls/13-cadena-huellas.sql` §E: se guarda la salida de
      `verificar_cadena_huellas(PCAD)` en una tabla temporal, se fusiona PCAD en P1
      (`update pacientes set fusionado_en = …`, en sesión de administrador) y se compara:
      mismo recuento y comparación fila a fila idéntica (`full outer join` sin huérfanos en
      ningún lado). Verde con `npm run test:rls`.
- [x] **Automático** — `npm run build` no muestra avisos `blocking-prerender-*` por uso de
      `crypto` en render (ADR-043).
      — Por construcción: ningún fichero de `lib/huella/**` fuera de las pruebas importa
      `node:crypto` (el SHA-256 de producción es `extensions.digest`, en la base). Salida
      completa de `npm run build` sin ninguna línea `blocking-prerender-*`
      (`grep -i blocking-prerender` sobre la salida: sin coincidencias).

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run dev`. — Hecho: `db reset` completo y limpio.
   (`npm run dev` no se ha dejado corriendo: no hace falta para lo que sigue, que se hizo
   contra la base directamente).
2. Firma una nota desde el guion de prueba del ticket y ejecuta
   `npm run verificar:huellas`: cadena íntegra.
   — Insertada una versión real (paciente y profesional del `seed.sql`, sobre canónico
   válido, sellada por `fn_sellar_version_nota()`). Salida real:
   `verificar:huellas — cadena íntegra: cero anomalías.` (exit 0).
3. Manipula a mano una versión intermedia en Studio con los cerrojos levantados y vuelve a
   ejecutarlo: debe nombrar esa versión, su fecha y su paciente.
   — Manipulado `contenido_canonico` de esa versión con
   `grant update … to postgres` + `alter table … disable trigger
   impedir_modificacion_notas_clinicas_versiones` (el equivalente SQL de manipular en
   Studio con los cerrojos levantados). Salida real:
   `verificar:huellas — 1 anomalía(s) en 1 cadena(s):` seguida de
   `paciente e58ddaea-7b27-4dff-95ed-8c53a42d3e73 — primer eslabón roto: posición 1
   (versión 917dc5a2-a1cc-4215-850e-bc529654774f, nota 90000000-0000-4000-8000-000000000001,
   creada 2026-08-30T09:00:40.370521+00:00) — huella_no_coincide` (exit 1).
4. Restaura y vuelve a verificar: íntegra.
   — Restaurado el texto original y reactivado el disparador. Salida real:
   `verificar:huellas — cadena íntegra: cero anomalías.` (exit 0). También comprobado con
   `--json`: `[]`.

## Notas para el agente

- **La columna de contenido *es* el JSON canónico.** No hay un objeto por un lado y unos
  bytes por otro: serían dos verdades y una tendría que ganar.
- JCS es un estándar escrito **exactamente para esto**. No lo reinventes ni lo aproximes
  con `JSON.stringify` y claves ordenadas: los números y los escapes están especificados.
- NFC **no** la exige JCS; aquí hace falta y va antes de canonicalizar.
- El editor puede normalizar un documento antiguo al abrirlo; si lo hace, guardar produce
  **una versión nueva con su motivo, visible**. Lo que no puede es normalizar y volver a
  sellar en silencio.
- Nada de esto vive en el renderizado (ADR-043). Server Actions y base de datos.
- El editor TipTap y la pantalla de notas **no entran aquí**: son fase 1. Este ticket
  entrega el mecanismo y su prueba, y se ejercita con un guion, no con una interfaz.

## Anexos

- Diseño aprobado: `tickets/T-005/diseno.md` (445 líneas).
- Resultado, evidencia y revisiones: `tickets/T-005/revisiones.md` (258 líneas).
