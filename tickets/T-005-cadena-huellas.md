---
id: T-005
titulo: Cadena de huellas SHA-256, canonicalización y verificador
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-004]
estado: en_curso
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

## Diseño aprobado · 29-08-2026

### 0 · Hechos verificados contra el esquema (no supuestos)

Leídos antes de decidir nada: `supabase/migrations/20260822094547_…` §9, `…20260822160000_rls…`, `…20260829150000_auditoria_y_solo_adicion.sql`, `scripts/lint-migraciones.ts`, `scripts/rls/01-fijacion.sql`, `docs/decisions.md` (ADR-027/031/035/036/043/046) y `docs/state.md`.

| Hecho | Consecuencia para este diseño |
|---|---|
| `notas_clinicas_versiones` ya existe con `contenido_canonico text not null`, `huella bytea check (octet_length = 32)`, `huella_anterior bytea check (octet_length = 32)`, `algoritmo_version smallint default 1`, `esquema_version smallint default 1` | No hay que crear la tabla. La huella se guarda en `bytea` de 32 bytes; **no hay decisión que tomar sobre «cómo se serializan 32 bytes fijos»**: el tipo ya es binario de longitud comprobada, y el primer eslabón es `decode(repeat('00',32),'hex')` |
| La tabla **no tiene** `paciente_id` ni ninguna columna de posición en la cadena | La cadena no tiene hoy ni ámbito ni orden. §8 los añade |
| El comentario de T-001 dice literalmente «AQUÍ NO SE CALCULA NINGUNA HUELLA: ni disparador que encadene ni default. La cadena es T-005» | El sitio previsto para el sellado **es un disparador de esta tabla**. §6 |
| `grant select, insert on notas_clinicas_versiones to authenticated` + política `notas_clinicas_versiones_alta` ya existen | Cualquier profesional puede insertar una versión directamente. El sellado **no puede** vivir solo en una función de aplicación: se saltaría por la puerta de al lado. §6 |
| `revoke update, delete … from public, anon, authenticated, service_role, postgres` + disparadores por fila y por sentencia | Ninguna huella se puede reescribir jamás. También significa que **un `paciente_id` nuevo no se puede rellenar con `UPDATE`**. §8 |
| `pgcrypto` está instalada **en el esquema `extensions`** (T-000) | Se escribe `extensions.digest(...)`, nunca `digest(...)`: las funciones llevan `set search_path = ''` |
| **No existe la tabla `citas`** ni `series_cita` ni ninguna columna de margen en `centros` | `cita_id` no puede ser clave ajena y `redactada_en_sesion` no se puede calcular contra una ventana que no existe. §5 |
| `fn_congelar_cabecera_sellada()` congela `notas_clinicas.paciente_id` en cuanto existe la versión 1 | Denormalizar `paciente_id` en la versión es seguro: la fuente no puede cambiar después |
| `fn_auditar()` sobre `notas_clinicas_versiones` recorta `cuerpo`, `anotaciones_reservadas` y `contenido_canonico` | Las columnas nuevas (`paciente_id`, `posicion_cadena`) y las huellas **sí** entran en `auditoria`, y está bien: son metadatos, no contenido |
| `lint-migraciones` regla 2: `alter column … set not null` sin `default` es hallazgo; regla 1: cualquier `update` sobre `notas_clinicas_versiones` es hallazgo | El patrón «añadir nulable + backfill + set not null» **está prohibido dos veces** aquí. §8 |
| `lib/i18n/sin-literales.test.ts` solo audita `app/` y `components/` | `lib/huella/**` escribe sus mensajes en castellano como literales y **no importa `lib/i18n`**. §15 |
| No hay ninguna implementación de JCS en `node_modules` | §2 |

### 1 · Dónde vive cada pieza

| Fichero | Qué es |
|---|---|
| `lib/huella/jcs.ts` | **crear** · Canonicalizador RFC 8785 |
| `lib/huella/jcs.test.ts` | **crear** · Batería de casos feos y de conformidad |
| `lib/huella/nfc.ts` | **crear** · Normalización NFC recursiva |
| `lib/huella/nfc.test.ts` | **crear** |
| `lib/huella/sobre.ts` | **crear** · Forma del sobre, esquema Zod, `construirSobre`, `canonizarSobre` |
| `lib/huella/sobre.test.ts` | **crear** |
| `lib/huella/sesion.ts` | **crear** · `calcularRedactadaEnSesion()`, pura |
| `lib/huella/sesion.test.ts` | **crear** |
| `lib/huella/firmar.ts` | **crear** · La cara de aplicación de la firma (§9) |
| `lib/huella/index.ts` | **crear** · Reexportaciones |
| `lib/huella/vectores-congelados.json` | **crear** · El vector de regresión (§12) |
| `lib/huella/vectores.test.ts` | **crear** · Reproduce el vector byte a byte |
| `lib/huella/vectores-sql.test.ts` | **crear** · Cierra el lazo entre el JSON y el SQL (§12) |
| `supabase/migrations/20260829210000_cadena_de_huellas.sql` | **crear** · §8 |
| `scripts/psql.mjs` | **crear** · `localizarContenedor()` y `ejecutarSql()`, extraídos de `test-rls.mjs` |
| `scripts/test-rls.mjs` | **modificar** · Pasa a importar `scripts/psql.mjs` (sin cambio de comportamiento) |
| `scripts/verificar-huellas.mjs` | **crear** · `npm run verificar:huellas` (§10) |
| `scripts/rls/01-fijacion.sql` | **modificar** · Sus versiones ya no pueden traer huella a mano (§8, nota final) |
| `scripts/rls/13-cadena-huellas.sql` | **crear** · Batería automática de la cadena |
| `scripts/rls/README.md` | **modificar** · Una fila más en la tabla de módulos |
| `scripts/t005-concurrencia.sql` | **crear** · La única prueba que necesita dos conexiones y commit (§11) |
| `scripts/test-huellas.mjs` | **crear** · Corredor del anterior · `npm run test:huellas` |
| `package.json` | **modificar** · `verificar:huellas`, `test:huellas` |
| `CLAUDE.md`, `docs/state.md`, `docs/architecture.md` | **modificar** · Comandos, memoria y §Cadena de huellas al día |

**Ningún fichero bajo `app/`, `components/`, `.github/`, `lib/i18n/`, `lib/contraste/`, `lib/identidad/`, `lib/fechas/` ni `lib/agenda/`.** Ver §15.

### 2 · El canonicalizador es propio, sin dependencia nueva

No hay ninguna implementación de JCS instalada. **Se escribe en `lib/huella/jcs.ts`, no se añade dependencia.** Tres razones, en orden de peso:

1. **El modo de fallo que el ADR-035 existe para evitar es literalmente «un `npm update` mueve una huella».** Meter la canonicalización en el camino de dependencias transitivas es reintroducir ese riesgo en el único sitio donde no se puede correr.
2. **RFC 8785 en JavaScript es delgado a propósito.** Las dos partes difíciles —el formato de los números y el escapado de las cadenas— el RFC las **delega en ECMAScript** (§3.2.2.2 remite al escapado de `JSON.stringify`; §3.2.2.3, a la serialización de `Number`), y la ordenación de claves es por unidades de código UTF-16, que es exactamente lo que hace `Array.prototype.sort()` sin comparador. Lo que queda propio es el recorrido recursivo y el ensamblado: unas noventa líneas.
3. La alternativa real era `canonicalize` (erdtman): un fichero CommonJS sin tipos, sin publicaciones recientes, que habría que envolver con `@types` propios. **Descartada**: el coste de mantener el envoltorio es mayor que el del algoritmo, y el vector congelado del §12 protege igual de bien un módulo propio que uno ajeno — pero un módulo propio no cambia solo.

**Esto no es «aproximarlo con `JSON.stringify` y claves ordenadas»**, que es lo que el ticket prohíbe: es implementar el RFC usando las primitivas que el propio RFC señala como normativas, con la batería de conformidad del §11 y el vector congelado detrás.

Contrato:

```ts
export type ValorJson =
  | null | boolean | number | string | ValorJson[] | { [clave: string]: ValorJson };

export class ErrorCanonicalizacion extends Error { constructor(motivo: string, ruta: string); }

/** JCS (RFC 8785) sobre `valor`. NO normaliza: eso lo hace normalizarNfc() antes. */
export function canonizar(valor: ValorJson): string;

/** El mismo resultado en UTF-8. Es lo que se sella. */
export function canonizarABytes(valor: ValorJson): Uint8Array;
```

**Dominio de entrada, deliberadamente estrecho.** `canonizar` **lanza** (no adivina) ante:

| Entrada | Por qué se rechaza |
|---|---|
| `undefined`, función, `symbol`, `bigint` | No son JSON. `JSON.stringify` los omitiría o los rompería en silencio |
| `Date`, `Map`, `Set`, cualquier objeto no plano | Un `Date` convertido a ISO por detrás es exactamente el tipo de conversión implícita que rompe una huella. El llamante pasa cadenas |
| `NaN`, `±Infinity` | No son JSON |
| Un número que no sea `Number.isSafeInteger` | **Decisión con consecuencia**: los únicos números que aparecen legítimamente en un documento TipTap o en el sobre son enteros pequeños (nivel de encabezado, `colspan`, minutos de margen). Todo entero seguro se serializa con `String(n)` como dígitos planos bajo cualquier motor —el primer entero con notación exponencial es 1e21, muy por encima de 2^53−1—, así que **la huella deja de depender del camino doble→texto de ES6**. Y de paso deja escrito para las facturas de fase 2 que el dinero no es un `float` |
| Un sustituto UTF-16 suelto | No es Unicode válido; `convert_to(…, 'UTF8')` de Postgres lo rechazaría más tarde y peor |
| Dos claves que colisionan al normalizar a NFC | Una de las dos se perdería en silencio (§3) |

Todos los rechazos llevan la ruta del nodo culpable en el mensaje (`cuerpo.content[2].attrs.level`), porque el que los va a leer es el profesional que no puede firmar.

**El U+0000 no es un problema pero hay que dejarlo escrito**: `contenido_canonico` es una columna `text` y Postgres no admite el byte nulo, pero JCS/`JSON.stringify` escapan U+0000 como los seis caracteres ASCII `\u0000`, así que la salida canónica **nunca contiene un byte nulo crudo**. Hay una prueba explícita de esto.

> **Corrección tras la revisión con Opus del 30-08-2026 (hallazgo MEDIA)**: la frase de
> arriba es cierta a nivel de bytes de `text` pero **incompleta**: el `::jsonb` que exige
> el `check` de la columna (y el propio disparador, que castea `contenido_canonico::jsonb`
> antes de nada) **rechaza esa secuencia de escape con SQLSTATE `22P05`**
> (`unsupported Unicode escape sequence`), porque Postgres no admite ese carácter ni
> siquiera escapado dentro de un jsonb. Consecuencia real, verificada contra Postgres 17:
> el cast falla con 22P05. Una nota cuyo contenido incluya U+0000 **no se puede firmar**:
> falla alto y con un código concreto, no en silencio, pero no es el «no es un problema»
> que decía el párrafo original. No se corrige aquí (cambiar el tipo de columna no es
> objeto de este ticket); queda documentado en el comentario de la columna
> `contenido_canonico` y en `docs/state.md`, con su prueba explícita en
> `scripts/rls/13-cadena-huellas.sql`.

### 3 · NFC: antes de canonicalizar, y también en las claves

`lib/huella/nfc.ts`:

```ts
/** Devuelve una copia con toda cadena —en valor Y EN CLAVE— normalizada a NFC. */
export function normalizarNfc<T extends ValorJson>(valor: T): T;
```

**Las claves también se normalizan**, aunque `architecture.md` diga «todos los valores de texto»: JCS ordena por unidades de código UTF-16, así que una clave con «á» descompuesta ordena y serializa distinto que la misma compuesta. Dejarlas fuera reabriría el agujero por el otro lado. Si dos claves distintas del mismo objeto normalizan a la misma, **es un error**, no una fusión silenciosa.

El orden es: `normalizarNfc` → validación Zod del sobre → `canonizar`. Nunca al revés.

*Riesgo residual asumido*: `String.prototype.normalize` se apoya en la ICU de Node. La política de estabilidad de Unicode garantiza que la normalización de los caracteres ya asignados no cambia; para los no asignados en su día, no. Es un riesgo que ninguna implementación evita y que el vector congelado del §12 detecta el día que ocurra.

### 4 · El sobre, congelado hoy · `esquema_version = 2`

Once claves exactas, ni una más ni una menos. `algoritmo_version` **no** entra en el sobre (es metadato de la era, no contenido); `esquema_version` **sí**, como manda el ADR-035.

```jsonc
{
  "abierta_en":             "2026-08-29T09:12:03.123Z",  // string ISO-8601 UTC con ms y Z
  "anotaciones_reservadas": null,                        // string | null  (ADR-027)
  "autor_id":               "uuid en minúsculas",
  "cita_id":                null,                        // string | null  (ADR-046)
  "creada_en":              "2026-08-29T09:20:00.000Z",
  "cuerpo":                 { },                         // objeto TipTap, siempre objeto
  "esquema_version":        2,
  "firmada_en":             "2026-08-29T09:20:00.000Z",
  "margen_sesion_minutos":  null,                        // number | null  (ADR-046: «con el margen que aplicó»)
  "motivo_cambio":          null,                        // string | null
  "redactada_en_sesion":    false
}
```

Decisiones que quedan cerradas aquí y no se reabren:

1. **`esquema_version = 2`**, no 1. El ADR-046 dice «sube `esquema_version`». La versión 1 es el sobre anterior al ADR-046 y **no existe en ninguna fila de ninguna base**: nace muerta, y así queda escrito en el comentario de la columna. `algoritmo_version` sigue en 1 (JCS + NFC + SHA-256).
2. **Los instantes van como `Date.prototype.toISOString()`: UTC, milisegundos, sufijo `Z`.** Nunca la representación de Postgres: `timestamptz` se renderiza según el GUC `TimeZone` de la sesión, y una huella que depende de un ajuste de sesión es la definición de rotura silenciosa.
3. **`firmada_en === creada_en`, siempre**, y el disparador lo exige. Son el mismo instante con dos nombres —uno del ADR-035, otro del ADR-046— y los dos ADR obligan a llevarlos. Dejarlos derivar sería crear dos verdades sobre cuándo se firmó.
4. **El margen aplicado se guarda dentro del sobre** (`margen_sesion_minutos`), no por referencia al centro: el ADR-046 bloquea explícitamente «guardar el margen del centro solo por referencia».
5. **`cuerpo` es un objeto**, nunca un array ni un escalar: es la restricción que ya impone el `check (jsonb_typeof(cuerpo::jsonb) = 'object')` de la tabla.

Contrato de `lib/huella/sobre.ts`:

```ts
export const ESQUEMA_VERSION = 2;
export const ALGORITMO_VERSION = 1;

export interface Sobre { /* las once claves de arriba */ }
export const esquemaSobre: z.ZodType<Sobre>;   // Zod 4, estricto: .strict() en el objeto raíz

export interface EntradaFirma {
  notaId: string; autorId: string;
  cuerpo: Record<string, ValorJson>;
  anotacionesReservadas: string | null;
  motivoCambio: string | null;
  alcance: 'individual' | 'conjunta';
  citaId: string | null;
  ventanaCita: { inicio: Date; fin: Date } | null;
  margenMinutos: number | null;
  abiertaEn: Date;
  ahora?: Date;            // inyectable: sin esto las pruebas del sobre no son deterministas
}

export function construirSobre(entrada: EntradaFirma): Sobre;   // NFC + cálculo + validación
export function canonizarSobre(sobre: Sobre): string;
```

### 5 · `redactada_en_sesion` sin tabla de `citas`

**No existe `citas`.** Y aun así el sobre nace con los cuatro campos, porque el ADR-046 se cerró *antes* que T-005 justamente para que añadirlos después no costara una era nueva.

- El **cálculo** vive en una función pura, `lib/huella/sesion.ts`, que no conoce el esquema:
  ```ts
  export function calcularRedactadaEnSesion(p: {
    abiertaEn: Date; firmadaEn: Date;
    ventanaCita: { inicio: Date; fin: Date } | null;
    margenMinutos: number | null;
  }): boolean;
  ```
  Cierto **si y solo si** hay ventana y margen y `abiertaEn >= inicio − margen` y `firmadaEn <= fin + margen`. Se prueba hoy, con fechas fijas, sin base de datos.
- Sin cita: `cita_id = null`, `margen_sesion_minutos = null`, `redactada_en_sesion = false`, y el disparador **exige** esa coherencia (§6). Una nota sin cita jamás puede decir que se escribió en sesión.
- Cuando llegue el ticket de agenda, lo único que cambia es **quién rellena `ventanaCita` y `margenMinutos`** al llamar. **La forma del sobre no se toca y `esquema_version` no sube.** Esto es lo que había que asegurar.
- `cita_id` viaja como cadena UUID dentro del sobre y **no tiene columna ni clave ajena**: no hay tabla a la que apuntar, y crearla aquí sería agenda, que no es este ticket.

### 6 · El sello es un disparador `BEFORE INSERT`, no una función de aplicación

**Decisión central del ticket.** El cálculo de `huella`, `huella_anterior`, `posicion_cadena` y `paciente_id` lo hace `fn_sellar_version_nota()`, disparador `before insert for each row` sobre `notas_clinicas_versiones`, `security definer`, `set search_path = ''`.

**Por qué el disparador y no una función `firmar_nota()` llamada por RPC:** `authenticated` ya tiene `grant insert` y política de alta sobre la tabla. Una función de aplicación sería *una* puerta; el `insert` directo seguiría siendo *otra*, y por ella entrarían huellas inventadas. Un disparador **es la tabla**: no hay camino que lo evite. Además resuelve solo el «todo en una transacción» del ticket, porque un `INSERT` es su propia transacción. Y era el diseño que T-001 dejó anunciado por escrito.

**Por qué `security definer`:** el eslabón anterior de la cadena del paciente puede ser una versión de **otro** profesional que el firmante no puede leer bajo RLS. Un disparador `invoker` no la vería, creería estar ante el primer eslabón y produciría un segundo génesis. Lo único que cruza la frontera del definer son **32 bytes de hash y un entero**: ni una palabra de contenido clínico. La autorización no se reimplementa —la sigue haciendo la política `notas_clinicas_versiones_alta`, que se evalúa **después** de los disparadores `BEFORE`, sobre la fila ya sellada.

Cuerpo, en orden (el orden importa: el cerrojo va antes de la lectura):

1. **Rechaza** con `raise exception` si el llamante trae `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` o `numero_version` no nulos. *No se sobrescriben en silencio*: un llamante que cree haber escrito la cadena tiene que enterarse de que la cadena no se escribe.
2. `select paciente_id into strict` desde `notas_clinicas` por `new.nota_id` → `new.paciente_id`.
3. `perform pg_advisory_xact_lock(hashtextextended('cadena_huellas:' || new.paciente_id::text, 0));` — §7.
4. Lee el último eslabón: `select huella, posicion_cadena … where paciente_id = … order by posicion_cadena desc limit 1`.
5. `new.huella_anterior := coalesce(v_huella_prev, decode(repeat('00',32),'hex'));`
   `new.posicion_cadena := coalesce(v_pos, 0) + 1;`
   `new.numero_version := (max(numero_version) filter … por nota) + 1`, con 1 por defecto.
6. **Las nueve comprobaciones de coherencia sobre–fila.** Si alguna falla, `raise exception` con el nombre del campo:
   1. `contenido_canonico::jsonb` es un objeto y sus claves son **exactamente** las once del §4 (comparación de `array_agg(k order by k)` contra la lista literal). Esto es lo que impide que un llamante de fase 1 selle un sobre de otra forma.
   2. `->>'autor_id' = new.autor_id::text`.
   3. `-> 'cuerpo' = new.cuerpo::jsonb` — igualdad **jsonb**, es decir semántica, no de bytes: es lo que deja pasar la prueba del criterio 8 (§11.4) sin abrir ningún agujero.
   4. `->'anotaciones_reservadas'` casa con `new.anotaciones_reservadas`, distinguiendo **`null` JSON de cadena vacía**.
   5. `->>'esquema_version' = new.esquema_version::text`.
   6. `->'motivo_cambio'` casa con `new.motivo_cambio`.
   7. `->>'creada_en' = ->>'firmada_en' = to_char(new.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`.
   8. Tipos del bloque de sesión: `cita_id` string o null; `abierta_en` string; `redactada_en_sesion` booleano; `margen_sesion_minutos` número o null. Y `abierta_en <= firmada_en`.
   9. **Si `cita_id` es null, `redactada_en_sesion` debe ser `false` y `margen_sesion_minutos` null.**
7. `new.huella := extensions.digest(convert_to(new.contenido_canonico, 'UTF8') || new.huella_anterior, 'sha256');`

**El SHA-256 tiene una sola implementación en todo el sistema: pgcrypto.** La aplicación no calcula huellas nunca. Es lo que hace que el criterio de `blocking-prerender-*` (ADR-043) se cumpla por construcción y no por vigilancia: **`lib/huella/**` no importa `node:crypto` en ningún fichero de producción** (solo las pruebas lo usan, para comprobar el vector).

**Y un segundo disparador, `after insert`: `fn_vaciar_borrador_al_firmar()`**, que pone a null los tres campos de borrador de la nota. Es del ADR-036 («el borrador se vacía») y **se incluye a propósito aunque el ticket no lo nombre**: hacerlo desde la aplicación sería una segunda transacción —justo lo que este ticket prohíbe— y no hacerlo deja la nota firmada generando alertas de «nota sin firmar» para siempre. Queda anotado como decisión añadida, no como descuido.

### 7 · Serialización por paciente: cerrojo consultivo, y por qué no una fila

**Ámbito de la cadena: el paciente**, no la nota ni el episodio.

- Por nota, la cadena tendría longitud 1 en el caso normal y no demostraría nada sobre orden ni completitud.
- Por episodio no vale: `notas_clinicas.episodio_id` es **nulable**, así que habría notas fuera de toda cadena.
- Por paciente, **borrar una nota entera rompe la cadena**, que es la propiedad que se quiere.
- Y el ámbito es estable, porque `fn_congelar_cabecera_sellada()` congela `notas_clinicas.paciente_id` en cuanto existe la versión 1.

**El cerrojo es `pg_advisory_xact_lock(hashtextextended('cadena_huellas:' || paciente_id::text, 0))`.** Se descarta `select … from pacientes where id = … for no key update` explícitamente, y el motivo está en `docs/state.md`: la fusión de pacientes **ya** toma `for no key update` sobre esa misma fila, y las comprobaciones de clave ajena toman `for key share`. Meter la firma en ese mismo juego de cerrojos de fila añadiría aristas nuevas al grafo de espera —firma↔fusión, y firma↔firma con la clave ajena de por medio— es decir, **exactamente el modo de fallo de interbloqueo que ese apartado documenta**, en una operación que un profesional ejecuta con el paciente delante. El cerrojo consultivo:

- no toca ninguna fila, así que **no puede formar ciclo con `for no key update` ni con `for key share`**;
- se suelta solo al `commit` o al `rollback`, sin camino de fuga;
- no bloquea ninguna lectura ni ninguna otra escritura del paciente.

**Regla que queda escrita**: la firma toma **exactamente un** cerrojo consultivo por transacción, y lo toma **antes** de leer el eslabón anterior. Con un solo cerrojo consultivo por transacción no hay ciclo posible entre firmas. El prefijo `'cadena_huellas:'` reserva el espacio de nombres para que un cerrojo consultivo futuro de otra parte de la aplicación no colisione por casualidad. Dos pacientes distintos pueden compartir clave por colisión de hash: la consecuencia es que se serializan sin necesidad, y no hay ninguna otra.

**Y, por debajo del cerrojo, dos restricciones únicas que hacen el error imposible aunque el cerrojo desapareciera** — porque un cerrojo es una convención y una restricción es un hecho:

- `unique (paciente_id, huella_anterior)` — **es el criterio de aceptación 9 escrito como restricción**: dos versiones de la misma cadena no pueden compartir eslabón anterior. De regalo, un solo génesis por paciente.
- `unique (paciente_id, posicion_cadena)` — no hay dos versiones en la misma posición.

### 8 · La migración · `20260829210000_cadena_de_huellas.sql`

```
1 · Guarda de era.  do $$ … if exists (select 1 from notas_clinicas_versiones)
                    then raise exception 'La cadena se instala sobre una tabla vacía …'
```
La tabla se amplía con **`add column … not null` en una sola sentencia**, sin valor por defecto y sin relleno. No es un descuido: `paciente_id` no se puede rellenar después porque **`UPDATE` sobre esta tabla está revocado, disparado y vetado por el linter** (regla 1), y el patrón «nulable + backfill + `set not null`» además dispararía la regla 2. Si algún día hubiera filas, esta migración **debe fallar en voz alta** y la decisión (una era nueva) la toma una persona. La guarda del punto 1 convierte ese fallo en un mensaje legible.

```
2 · alter table public.notas_clinicas_versiones
      add column paciente_id     uuid    not null,
      add column posicion_cadena integer not null;
    -- SIN clave ajena a pacientes, a propósito (ver más abajo)
3 · alter table … add constraint notas_clinicas_versiones_posicion_ck
      check (posicion_cadena >= 1);
    alter table … add constraint notas_clinicas_versiones_canonico_ck
      check (jsonb_typeof(contenido_canonico::jsonb) = 'object');
4 · create unique index notas_clinicas_versiones_cadena_idx
      on … (paciente_id, posicion_cadena);
    create unique index notas_clinicas_versiones_eslabon_idx
      on … (paciente_id, huella_anterior);
5 · alter table … alter column esquema_version set default 2;
6 · comment on column … (los cinco: por qué text, por qué 32 bytes, por qué
    esquema_version 2, qué es posicion_cadena, por qué paciente_id sin FK)
7 · fn_sellar_version_nota()          + disparador before insert  (§6)
8 · fn_vaciar_borrador_al_firmar()    + disparador after  insert  (§6)
9 · verificar_cadena_huellas(uuid)    + privilegios                (§10)
```

**`paciente_id` sin clave ajena, y esto es una decisión, no un olvido.** La garantía referencial ya la da `notas_clinicas.paciente_id`, que sí tiene la clave ajena y está congelada tras la primera firma; el valor lo escribe el disparador leyendo de ahí, así que no puede mentir. Una clave ajena de más significaría **un `for key share` de más sobre `pacientes` en cada firma**, ampliando la superficie de cerrojos justo al lado de la fusión (§7). Se paga una redundancia inofensiva para no pagar contención.

**Efecto colateral que hay que arreglar en el mismo ticket:** `scripts/rls/01-fijacion.sql` inserta hoy versiones con `numero_version`, `huella` y `huella_anterior` a mano; con el disparador eso **lanza**. Se reescribe para que inserte solo `(nota_id, cuerpo, contenido_canonico, motivo_cambio, alcance, autor_id, creada_en)` con sobres válidos de once claves — y el banco pasa a tener cadenas **de verdad** en su fijación, que es mejor que las de mentira que tiene ahora. Cuidado con una trampa real: el índice único **global** sobre `huella` hace que dos sobres idénticos byte a byte (mismo cuerpo, mismo autor, mismo instante) en dos pacientes distintos choquen en el génesis. La fijación debe variar algo —basta `abierta_en`— y esto va escrito en el `README.md` del banco.

### 9 · La cara de aplicación · `lib/huella/firmar.ts`

```ts
export interface ResultadoFirma {
  id: string; numeroVersion: number; posicionCadena: number; huellaHex: string;
}

/** Construye el sobre, lo canoniza y lo inserta. El sellado lo hace la base. */
export async function firmarVersionNota(
  cliente: SupabaseClient<Database>,
  entrada: EntradaFirma,
): Promise<ResultadoFirma>;
```

Un solo `insert(...).select('id, numero_version, posicion_cadena, huella').single()` con `nota_id`, `cuerpo` (el cuerpo normalizado y canonizado, como texto), `anotaciones_reservadas` (normalizado), `contenido_canonico`, `motivo_cambio`, `alcance`, `esquema_version`, `autor_id` y `creada_en`. **No manda `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` ni `numero_version`**: el disparador lanza si llegan.

**No lleva la directiva `"use server"` y no vive en `app/`.** El ticket dice que la pantalla de notas es fase 1; este módulo es la función que la Server Action de fase 1 envolverá en una línea. Lo que el ticket exige de la firma —canonizar, calcular, encadenar e insertar en una transacción, y fuera del render— se cumple aquí y en el §6. Ver §15.

**Un `insert` es una transacción**, así que el «todo en una transacción» del ticket se cumple sin `begin` explícito y sin RPC.

### 10 · El verificador: la lógica en la base, la cáscara en Node

```sql
create function public.verificar_cadena_huellas(p_paciente_id uuid default null)
returns table (
  paciente_id uuid, posicion_cadena integer, version_id uuid, nota_id uuid,
  creada_en timestamptz, motivo text
)
language sql stable security definer set search_path = '';
```

Devuelve **una fila por anomalía**; **cero filas es la cadena sana**. `motivo` es un valor cerrado:

| `motivo` | Qué detecta |
|---|---|
| `huella_no_coincide` | `digest(convert_to(contenido_canonico,'UTF8') \|\| huella_anterior,'sha256') <> huella` |
| `eslabon_desencadenado` | `huella_anterior` no es la `huella` de la posición anterior |
| `genesis_incorrecto` | La posición 1 no lleva 32 bytes cero, o hay una posición 1 que no es la primera |
| `hueco_de_posicion` | Falta una posición en la secuencia |
| `era_desconocida` | `algoritmo_version <> 1`: **no se verifica, se declara** — verificar una era ajena con el algoritmo de esta sería inventar |

**Por qué la lógica vive en SQL y no en Node:**

1. El criterio del ticket es que el verificador **no vuelva a serializar el objeto**. Si el verificador no puede importar el canonicalizador, la tentación desaparece por construcción: en SQL no hay ningún canonicalizador al alcance.
2. No hay que sacar el corpus clínico entero de la base para verificarlo.
3. La ejecución nocturna es una llamada a función, que es lo que T-009 sabrá enganchar.

**Privilegios**: `revoke all on function … from public, anon, authenticated, service_role`. No se concede a `authenticated`: recorrer todas las cadenas revela cuántas versiones tiene cada paciente, saltándose la RLS. Es una herramienta de operación, y la ejecuta `postgres`.

`scripts/verificar-huellas.mjs` es cáscara: localiza el contenedor con `docker ps` vía `scripts/psql.mjs`, ejecuta la función, imprime **el primer eslabón roto de cada cadena con su paciente y su fecha** más el recuento total, y **sale con código 1 si hay una sola anomalía**. Banderas: `--json` (salida para máquinas, que es lo que T-009 consumirá) y `--paciente <uuid>`. `npm run verificar:huellas`.

**El enganche a la ejecución nocturna no se hace en este ticket.** Ver §15.

### 11 · Qué prueba cada capa

**11.1 · `vitest`, en `lib/huella/*.test.ts`** — el canonicalizador, sin base de datos:

- **Conformidad JCS**: orden de claves por unidades de código UTF-16 (incluidas claves ASCII vs no ASCII y el caso `"a"` / `"A"` / `"á"`), objetos y arrays vacíos, anidamiento, `true/false/null`, y **el escapado completo de U+0000 a U+001F uno por uno**, comprobando que `\b \t \n \f \r \" \\` salen en forma corta y el resto como `\u00XX`.
- **Casos feos del ticket, cada uno con su aserción**: «á» NFD frente a NFC → **misma** huella; emoji fuera del BMP y emoji con selector de variación; comillas tipográficas y guion largo de Word; espacio duro; claves en otro orden → **mismo** canónico; enteros en notación exponencial en la entrada (`1e2`) → salen como `100`; caracteres de control; cadena vacía; `anotaciones_reservadas` **`null` frente a `""`** → **huellas distintas**, con las dos escritas en el vector congelado.
- **Rechazos**: `undefined`, `Date`, `NaN`, `1.5`, `9007199254740993`, sustituto suelto, colisión de claves por NFC.
- **`calcularRedactadaEnSesion`**: dentro de la ventana, justo en el borde, fuera por un minuto, sin cita, con margen nulo, abierta antes y firmada después.
- **Sobre**: cambiar un carácter de `anotaciones_reservadas` cambia la huella; cambiar `autor_id` la cambia; **cambiar `redactada_en_sesion` de `false` a `true` la cambia** (ADR-046, el criterio que hace que el sello valga algo).

**11.2 · `scripts/rls/13-cadena-huellas.sql`**, dentro de `npm run test:rls`, con `pg_temp.assert` y `rollback` al final:

- Firma de tres versiones sobre dos pacientes; posiciones 1,2 y 1; génesis de 32 ceros; `huella_anterior(n) = huella(n−1)`; `verificar_cadena_huellas()` devuelve **cero filas**.
- **Los tres pares del vector congelado**: `extensions.digest(convert_to(<canónico>,'UTF8') || decode(repeat('00',32),'hex'),'sha256')` da el hex esperado. Es lo que impide que TypeScript y pgcrypto se separen.
- **Negativas con su gemela positiva**, todas con `pg_temp.assert_lanza`: mandar `huella`; mandar `posicion_cadena`; sobre con una clave de más; sobre con `autor_id` distinto del de la fila; sobre con `creada_en` distinto de la columna; `cita_id` nulo con `redactada_en_sesion` verdadero; y **`huella_anterior` repetida en la misma cadena**, que es el criterio 9 comprobado por restricción y de forma perfectamente determinista.
- **Manipulación con los cerrojos levantados**, dentro de la transacción del banco y por tanto reversible: `grant update on … to postgres` (hace falta: el `revoke` de T-004 muerde también al propietario) + `alter table … disable trigger impedir_modificacion_notas_clinicas_versiones`, se altera **una versión intermedia**, y se afirma que el verificador devuelve **exactamente una fila**, la de esa posición, y **ninguna anterior**. Después se rehabilita y se revoca otra vez, y el `rollback` es la segunda red.
- **Criterio 8, el del «no reserializa», en sus dos sentidos** —y son dos porque uno solo no distingue:
  1. Con los cerrojos levantados se reescribe la **columna `cuerpo`** con las claves en otro orden y espacios de más (equivalente en `jsonb`, distinto en bytes). El verificador da **idéntico** resultado: cero roturas. Un verificador que derivase el sobre de las columnas habría fallado aquí.
  2. Se reescribe **`contenido_canonico`** de forma también `jsonb`-equivalente. El verificador **sí** la señala. Es la prueba de que lo que se verifica son los bytes guardados y nada más.
- **ADR-031**: se guarda la salida del verificador en una tabla temporal, se vincula un paciente duplicado (`update pacientes set fusionado_en …`) y se compara la salida después: **idéntica, fila a fila**. Y una aserción explícita de que el verificador **no resuelve `fusionado_en`**: las cadenas se recorren por el `paciente_id` guardado, porque resolver el vínculo uniría dos cadenas y produciría roturas falsas.

**11.3 · `scripts/t005-concurrencia.sql`, vía `npm run test:huellas`** — lo único que no cabe en el banco, porque necesita **dos conexiones** y por tanto datos confirmados:

```
begin;
  insert into … versiones (paciente PC, sobre A);   -- el disparador toma el cerrojo consultivo
  \! psql -c "set lock_timeout='2s'; insert … (paciente PC, sobre B) …"
     -- escribe su resultado (éxito / SQLSTATE) en public.t005_resultado
commit;
-- aserciones sobre t005_resultado y sobre la cadena
```
La segunda conexión **debe** morir con `55P03 lock_not_available`. **No hay `pg_sleep` ni carrera**: la primera transacción tiene el cerrojo cogido con certeza antes de que la segunda arranque, así que el resultado es determinista, no probable. Después del `commit` se repite el `insert` de la segunda: ahora entra, y se afirma que las dos versiones tienen **posiciones 1 y 2 y `huella_anterior` distintas**. Se cierra con el mismo `lock_timeout` con el que `t001-esquema.sql` ya probó la carrera de fusión: es el patrón de la casa.

Este guion **confirma** y sus filas quedan (la tabla es de solo adición): se ejecuta después de `npx supabase db reset`, usa un paciente propio identificable y así está escrito en su cabecera y en el `README`.

**11.4 · Independencia de capas.** El vector congelado se comprueba en TypeScript **y** en SQL; `lib/huella/vectores-sql.test.ts` lee `scripts/rls/13-cadena-huellas.sql`, extrae los pares literales `(canónico, hex)` y afirma que están, idénticos, en `vectores-congelados.json`. Sin eso, la copia manual entre los dos ficheros se desincroniza el primer día.

### 12 · El vector de regresión congelado

`lib/huella/vectores-congelados.json`, escrito a mano y **nunca regenerado por un script** — un vector que se regenera solo no es un vector, es un espejo:

```jsonc
[
  { "nombre": "genesis-minimo",        "porque": "El sobre más pequeño posible",
    "sobre": { … }, "canonico": "…", "huella_hex": "…" },
  { "nombre": "acentos-nfd",           "porque": "Mismo texto visible que 'acentos-nfc'" },
  { "nombre": "acentos-nfc",           "porque": "Debe dar EXACTAMENTE la misma huella que el anterior" },
  { "nombre": "emoji-y-tipograficas",  "porque": "Fuera del BMP y comillas de Word" },
  { "nombre": "reservadas-nulas",      "porque": "null" },
  { "nombre": "reservadas-vacias",     "porque": "Cadena vacía: huella DISTINTA de la anterior" },
  { "nombre": "en-sesion",             "porque": "redactada_en_sesion=true con cita y margen" },
  { "nombre": "control-y-exponente",   "porque": "U+0000..U+001F y 1e2 → 100" }
]
```

`huella_hex = SHA-256( utf8(canonico) || 32 bytes cero )`, es decir la huella real del primer eslabón: así el vector no congela solo la canonicalización sino **el encadenado completo**. Tres de los ocho se copian literalmente al módulo SQL (§11.4), con comillas de dólar `$vec$…$vec$` para no pelear con las barras invertidas de los escapes de control.

### 13 · Cómo se cierra cada criterio de aceptación

| Criterio | Dónde queda cerrado |
|---|---|
| `db reset`, `lint`, `build` limpios | Migración + `npm run lint:migraciones` (guarda de era en §8 para la regla 2) |
| Claves en otro orden → misma huella; NFD y NFC → misma huella | `jcs.test.ts`, `nfc.test.ts` y los vectores `acentos-nfd` / `acentos-nfc` |
| Un carácter de `anotaciones_reservadas` cambia la huella (ADR-027) | `sobre.test.ts` + pareja `reservadas-nulas` / `reservadas-vacias` |
| Cambiar `autor_id` rompe la cadena | `sobre.test.ts` y, en base, la comprobación 2 del §6 |
| `redactada_en_sesion` `false`→`true` rompe la huella (ADR-046) | `sobre.test.ts`, vector `en-sesion` |
| El vector reproduce byte a byte | `vectores.test.ts` (TS) y `13-cadena-huellas.sql` (pgcrypto) |
| Cadena sana → cero roturas; manipulada con los cerrojos levantados → **esa** y ninguna anterior | §11.2, bloque de manipulación |
| El verificador no reserializa | §11.2, criterio 8 en sus **dos** sentidos |
| Dos firmas concurrentes no comparten `huella_anterior` | `unique (paciente_id, huella_anterior)` (§7) + `assert_lanza` determinista (§11.2) + el cerrojo probado con dos conexiones (§11.3) |
| Vincular un duplicado no altera ninguna huella (ADR-031) | §11.2, comparación de la salida del verificador antes y después |
| `build` sin avisos `blocking-prerender-*` por `crypto` (ADR-043) | **Por construcción**: no hay `node:crypto` en ningún fichero de producción de `lib/huella/`; el SHA-256 es de pgcrypto |

### 14 · Riesgos, por probabilidad

1. **La fijación del banco de RLS deja de compilar** al entrar el disparador. Es seguro que pasa, está previsto en §8, y es lo primero que hay que arreglar; el síntoma es un `raise` que nombra la columna prohibida, no un fallo oscuro.
2. **Índice único global sobre `huella`**: dos sobres idénticos en pacientes distintos chocan. Solo ocurre con datos de prueba de instante fijo. Escrito en el `README` del banco.
3. **NFC depende de la ICU de Node.** Estable por política de Unicode para lo asignado; el vector congelado lo detecta el día que no lo sea.
4. **La comprobación de «claves exactas» del §6.6.1 es rígida a propósito.** El día que el sobre crezca, hay que subir `esquema_version` y aceptar **las dos** listas de claves en el disparador, cada una con su versión. Que duela es la intención: es lo que impide sellar dos formas distintas sin darse cuenta.
5. **`security definer` en el disparador**: revisar en la revisión con Opus que no filtra nada más que hash y posición, y que el `set search_path = ''` está (la regla 4 del linter lo comprueba, pero conviene mirarlo con ojos).
6. **`extensions.digest`, nunca `digest`.** Con `search_path = ''` la forma corta falla en ejecución, no al crear la función.

### 15 · Coordinación con el carril de MiniMax

`fabrica/ORDEN.md` marca `components/**`, `app/**`, `next.config.ts`, `lib/i18n/**`, `lib/contraste/**` y `.github/**` como territorio con alguien dentro. **T-005 no toca ni un fichero de esa lista**, y no por prudencia: porque el propio ticket ya lo dejó fuera («el editor TipTap y la pantalla de notas no entran aquí: son fase 1… se ejercita con un guion, no con una interfaz»). Tres puntos concretos, decididos:

1. **La Server Action.** El ticket pide «Server Action de firma»; las Server Actions de este proyecto viven en `app/**/acciones.ts`, que es de MiniMax. **Se corta por la línea natural del ticket**: T-005 entrega `lib/huella/firmar.ts`, una función de servidor con el contrato del §9 —canoniza, construye el sobre y ejecuta la inserción que la base sella en una transacción—, **sin la directiva `"use server"` y sin ningún fichero en `app/`**. La Server Action de fase 1 será su envoltorio de una línea. Nada del mecanismo ni de sus garantías queda del otro lado del corte: el «todo en una transacción» lo sostiene el disparador (§6), no el envoltorio.
2. **El enganche a la ejecución nocturna.** Un `workflow` vive en `.github/**`, territorio de MiniMax, y además T-009 es quien monta CI. **T-005 entrega el mecanismo y para ahí**: la función `verificar_cadena_huellas()`, el comando `npm run verificar:huellas`, su `--json` y su **código de salida distinto de cero cuando hay una sola anomalía**. En `docs/state.md` queda escrita la línea exacta que T-009 tiene que añadir. **No se crea ni se edita ningún fichero de `.github/`**, ni siquiera «para dejarlo preparado»: dejar un workflow a medias en la rama de otro es peor que no dejarlo.
3. **`lib/huella/**` no importa `lib/i18n/**`.** Comprobado: `lib/i18n/sin-literales.test.ts` solo audita `app/` y `components/`, así que la regla de cadenas fuera del código **no alcanza a `lib/`**. Los mensajes de `lib/huella` son de error de servidor y de salida de guion —los lee el implementador y el operador, no el paciente—, así que van como literales en castellano en el propio módulo. Importar el catálogo crearía una dependencia de `lib/huella` sobre un directorio que otro carril está reescribiendo, a cambio de nada. El día que un mensaje de firma tenga que salir en pantalla, la traducción es de la pantalla, no del sellador.

Si durante la implementación apareciera la necesidad de tocar cualquiera de esas rutas, **se corta el ticket y se pasa la parte al carril de MiniMax; no se toca «un momento»**.

### 16 · Lo que no entra, y por qué

- **La tabla `citas` y el margen por centro.** Son agenda. El sobre nace con sus cuatro campos y su margen (§5), que es lo que el ADR-046 exigía; rellenarlos con datos reales es del ticket que cree `citas`.
- **Columnas para `cita_id`, `abierta_en`, `firmada_en` y `redactada_en_sesion`.** El sobre sellado es la verdad (ADR-046). Cuatro columnas espejo serían cuatro sitios más donde discrepar, y este esquema ya arrastra la duplicación de `cuerpo`. Si fase 1 necesita filtrar por cita, se añade una columna **generada** a partir de `contenido_canonico`, que no puede discrepar.
- **La cadena de `facturas`.** No existe la tabla (ADR-053 la dejó fuera del producto). El mecanismo se escribe genérico —el disparador está parametrizado por la columna de ámbito de cadena en su comentario, igual que `fn_auditar()` lo está por la clave—, pero **no se crea nada de facturación aquí**.
- **El editor TipTap y la pantalla de notas.** Fase 1, y territorio de otro carril (§15).
- **Revocar el `insert` directo sobre `notas_clinicas_versiones`.** Se estudió y se descarta: el disparador hace innecesario cerrar esa puerta, y quitar el `grant` obligaría a reescribir la política de T-002 y dos módulos del banco de T-003 sin ganar ni una garantía.
- **`algoritmo_version` fijado por `check`.** Un `check (algoritmo_version = 1)` habría que borrarlo el día de la era 2, y borrar una restricción es una migración destructiva. En su lugar, el verificador **declara** `era_desconocida` y se niega a opinar.

## Revisión con Opus · primera pasada, 30-08-2026 — NO pasó el gate

Un hallazgo ALTA (bloqueante) y trece MEDIA/BAJA. Arreglados todos el mismo día, cada uno
con reproducción del fallo original y prueba de que ya no ocurre. **`estado` se queda en
`en_curso`**: no se cierra a `hecho` hasta una segunda pasada de revisión.

**ALTA — tres comprobaciones del disparador se saltaban con `null` JSON** (6.2 autor_id,
6.5 esquema_version, 6.7 creada_en/firmada_en, y el orden de 6.8). `->>` da SQL `NULL`
ante un `null` JSON, y `NULL <> x` es `NULL` — falso en un `if`. Reproducido: un sobre con
`"autor_id":null` se sellaba (`huella is not null` → `t`). Arreglado con
`(v_contenido -> 'campo') is distinct from to_jsonb(new.columna)` en las cuatro.
Reproducido de nuevo: las cuatro variantes nulas lanzan; un sobre válido sigue sellándose.

**MEDIA, las ocho:**
1. `normalizarNfc()` vaciaba `Date`/`Map` en `{}` en silencio antes de que `jcs.ts`
   pudiera rechazarlos. Arreglado con el guarda de objeto plano dentro de `nfc.ts`.
2. U+0000 no se puede insertar de verdad (`22P05` al castear a `jsonb`): documentado como
   limitación real, no como «no es un problema», en la columna y en la nota de corrección
   más arriba (§2).
3. `scripts/t005-concurrencia.sql` no podía fallar nunca (sin `raise`). Reescrito con
   `do $$ … raise exception … $$` y una tabla `t005_resultado` real para el resultado de
   la segunda conexión.
4. `fn_vaciar_borrador_al_firmar()` generaba auditoría espuria: `and borrador_contenido is
   not null` en el `where`.
5. `--paciente` de `verificar-huellas.mjs` sin validar, interpolado en SQL de
   superusuario: validado contra el mismo patrón UUID de `sobre.ts` antes de interpolar.
6. Evidencia declarada (negativas de `anotaciones_reservadas`/`motivo_cambio`) que no
   existía en el banco: añadidas en `scripts/rls/13-cadena-huellas.sql` §C.
7. `posicion_cadena` filtra cuántas versiones ajenas hay en la cadena: aceptado y
   documentado en `docs/architecture.md` §Roles («Fuga documentada»), no es un bug.
8. (El límite de interbloqueo con múltiples firmas por transacción — ver BAJA/operativo
   más abajo, agrupado con el hallazgo 5 de disparador por ser el mismo mecanismo.)

**BAJA, las cuatro** (arregladas, no solo anotadas): tipo de `esquema_version` no
comprobado (subsumido en el arreglo ALTA), precisión de milisegundo de `to_char('MS')`
documentada, la negativa del criterio 9 pasó a `assert_lanza_codigo('23505')`, la
comprobación ADR-031 pasó a comparar huellas reales byte a byte (antes solo comparaba
recuentos), y se colapsaron los saltos de línea duplicados de `13-cadena-huellas.sql`
(519 → 413 líneas).

**Evidencia de conjunto tras los arreglos**: `npx supabase db reset` limpio; `npm run
lint` y `npm run lint:migraciones` limpios; `npx vitest run` → 295 pruebas, 31 ficheros,
todas en verde; `npm run test:rls` → exit 0, 178 aserciones `OK`, cero `ASERCIÓN
FALLIDA`; `npm run test:huellas` → exit 0. Cada arreglo se probó además de forma aislada:
inyectando la condición contraria a propósito y comprobando que la prueba correspondiente
SÍ falla (exit distinto de cero, mensaje exacto), y que revertida vuelve a pasar — para
las dos pruebas (`t005-concurrencia.sql`, la comparación ADR-031) donde antes esto no era
cierto.

**Landmine del entorno, pagado tres veces esta sesión**: escribir la secuencia de seis
caracteres que representa el escape Unicode de un carácter nulo dentro de una cadena, vía
las herramientas de edición, puede grabar un byte NUL crudo en el fichero en vez de esos
seis caracteres ASCII. Rompió `db reset` una vez (`invalid message format`, SQLSTATE
`08P01`) al documentar precisamente ese hallazgo en la migración. Detalle completo y el
comando de comprobación en `docs/state.md`.
