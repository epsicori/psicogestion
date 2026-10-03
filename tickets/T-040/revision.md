Ronda 2: sin hallazgos ALTA. Gate de la ronda 2: 0 ALTA, 1 MEDIA, 4 BAJA; se cierran los 13 de la ronda 1 (revision.json). Ronda 1: 0 ALTA, 4 MEDIA, 9 BAJA.

# T-040 · Revisión del corte A

## Revisor A · datos y accesibilidad

Rama `worktree-agent-a57d63ed182caa785` (HEAD `2a6daaf`), `git diff main...HEAD`. Corte A, sin base.
Mutantes y sondas medidos en una copia aparte (`git archive` al scratchpad, con una unión de
`node_modules` que ya está quitada). La marca de agua se midió abriendo en Chromium el fichero de muestra
que genera `cifrar.test.ts`.

**Sin ALTA.** 4 MEDIA, 4 BAJA.

### MEDIA

- **A-H1** `lib/exportaciones/formato.ts:45`. Los campos que §1.2 marca «sí» por rama (cuerpo y contenido_canonico en la profesional; cuerpo en la individual del paciente; participantes en la conjunta) son todos .optional() y el esquema no es estricto: si la base no los manda, o los manda con otra clave, la copia sale con el texto vacío y nadie se entera.
  *Escenario:* Medido en una copia aparte: respuestaProfesional() con cuerpo→cuerpo_texto y sin contenido_canonico pasa safeParse, y proyectar da texto "" y contenidoCanonico "" en las dos versiones. Una conjunta sin participantes pasa con []. En el corte B, un alias mal escrito en el jsonb_build_object produce una copia para un juzgado con huellas y sello correctos y las notas en blanco. Arreglo: un refine por rama que exija los campos presentes (o un discriminatedUnion por proyección y alcance).
- **A-H2** `lib/exportaciones/formato.ts:120`. El contrato de la marca exige exportada_por.apellidos, pero perfiles solo tiene nombre_completo (20260815192424_…:28-33). El esquema lo pide como z.string() obligatorio y el hallazgo vive solo en un comentario, no en el diseño ni en docs/state.md.
  *Escenario:* En el corte B, quien escriba exportar_nota siguiendo el diseño ('apellidos', p.apellidos) choca con una columna inexistente; si lo arregla con 'apellidos', null u omitiéndolo, safeParse falla (medido: apellidos null → false; sin la clave → false) y TODAS las exportaciones devuelven error. Hay que anotar la decisión (nombre_completo en nombre, apellidos '') en state.md §Hallazgos o en el diseño para que el corte B la herede.
- **A-H3** `lib/exportaciones/visor-js.ts:187`. La capa de marca no cubre el contenido en una pantalla de escritorio: cada fila es la frase tres veces (unos 1364 px) alineada a la izquierda dentro de un bloque girado del 200 % del ancho, así que en pantallas anchas la marca se queda en el margen izquierdo.
  *Escenario:* Medido con Chromium sobre el fichero de muestra (contraseña de la prueba): a 1920×1080 la columna <main> tiene un 0,3 % de su área bajo la marca (la captura lo confirma: ninguna marca sobre el texto); a 1366×768, la mitad; a 390×844, toda. Una captura recortada a la nota en un portátil de escritorio no lleva el código, contra el contrato («una capa sobre el contenido») y contra ADR-076 («cada copia impresa o capturada lleva el código»). Las pruebas solo miran que la capa exista y lleve el código. Arreglo: repetir la frase hasta cubrir el ancho del giro (o centrar las filas).
- **A-H4** `lib/exportaciones/visor-js.ts:125`. La normalización NFC del lado del visor no tiene prueba: el diseño (§5 «Por la contraseña») exige NFC en los dos lados, pero la contraseña de visor-js.test.ts no lleva ningún carácter descompuesto y el caso «dos lados» de cifrar.test.ts descifra con un ayudante propio que ya normaliza.
  *Escenario:* Mutante medido en una copia aparte: quitar .normalize('NFC') de VISOR_JS deja verdes visor-js.test.ts y cifrar.test.ts (26/26). En producción, una copia cifrada desde Windows con «contraseña» (ñ compuesta) y tecleada en macOS (ñ descompuesta) diría «Contraseña incorrecta» para siempre. Falta una prueba que cifre con NFC y abra el visor con la contraseña en NFD.

### BAJA

- **A-H5** `lib/exportaciones/visor-js.ts:238`. La línea visible de la marca se inserta antes del h1, y el foco va al h1 (línea 269): quien usa lector de pantalla y lee hacia delante desde el foco nunca oye la marca.
  *Escenario:* Usuario de NVDA abre la copia → el foco cae en «Copia de una nota clínica» → lee la ficha y las versiones sin oír «Copia … exportada por … el …». El contrato pide una línea «no oculta a lectores de pantalla»: no está oculta, pero queda detrás del punto de entrada. Arreglo: ponerla después del h1 o enfocar la línea.
- **A-H6** `lib/exportaciones/visor-js.ts:114`. Con el visor bloqueado (sin crypto.subtle o con la cabecera dañada) el aviso se escribe en la región role=alert al cargar y al pulsar «Abrir» se reescribe con el mismo texto y sin mover el foco, así que no se anuncia.
  *Escenario:* Fichero abierto como file:// en un navegador sin SubtleCrypto → el alert ya tiene el texto en la carga (no se anuncia) → el usuario de lector teclea la contraseña y pulsa «Abrir» → el campo se vacía y no oye nada. Arreglo: vaciar la región y escribir en el siguiente tick, o mover el foco al aviso.
- **A-H7** `lib/exportaciones/visor-js.ts:126`. Cualquier excepción de Argon2 (por ejemplo, un RangeError al reservar los 64 MiB del Uint32Array) se muestra como «Contraseña incorrecta o fichero dañado».
  *Escenario:* Móvil antiguo o pestaña con poca memoria → new Uint32Array falla → el visor dice «Contraseña incorrecta» → el destinatario reintenta con la contraseña correcta, falla siempre igual y pide otra copia (otro acceso y otra fila de auditoría). Arreglo: un texto propio para el fallo de memoria.
- **A-H8** `lib/i18n/es.ts:898`. La etiqueta del motivo en i18n («Requerimiento judicial o de inspección») no coincide con la que el diseño fija para etiqueta_motivo_exportacion en SQL («Requerimiento judicial o inspección», diseño §1.1).
  *Escenario:* La marca y la copia dicen «… o de inspección», y accesos_historia.justificacion y el aviso al titular dirán «… o inspección». Quien coteje la copia con el registro de accesos ve dos textos para el mismo motivo. Hay que fijar una de las dos antes del corte B.

### Comprobado sin hallazgo

- `proyectar` construye cada rama de la versión campo a campo, sin `...v`. Quita reservadas y canónico en la
  rama del paciente, y cuerpo y motivo del cambio en la conjunta, aunque la respuesta los traiga. Lo prueba la
  fixture que trae de más. La fórmula solo va en la profesional y `posicion_cadena` no sale.
- `cifrado` se valida con literales de `constantes.ts`, y `MOTIVOS` y `PROYECCIONES` coinciden con el diseño.
  Los dos refinamientos del implementador (paciente ⇔ `peticion_paciente`; motivo y referencia van juntos)
  repiten los checks de §1.1 y no chocan con §1.2 ni con las decisiones.
- La cabecera en claro no lleva ni el código ni datos del paciente. `textosDelVisor` solo lleva los textos
  fijos del visor. La nota de la huella anterior no afirma que esa huella sea la de la versión anterior (H7).
- El visor tiene una etiqueta con `for`, regiones `status` y `alert` persistentes y todos los textos salen de `t()`.
  El campo se vacía al enviar y al fallar, y el DOM se construye solo con `createElement` y `textContent`.
  La capa es `aria-hidden` con `pointer-events: none`, y `@media print` la mantiene fija.
- `derivarEnTrabajador` termina el Worker y revoca la URL del Blob en el mensaje, en el error y al fallar el
  constructor. No hay `eval` ni `new Function`.
- Fuera de las pruebas no hay ningún `console.*`. Los `throw` del núcleo y de `cifrar` no llevan datos de
  entrada. `cifrar` pone a cero los bytes de la clave.
- ADR-076 está libre en `main` y en las otras ramas, y su fila está en `docs/decisions.md` y en `INDEX.md`. En la
  §9 dice que la marca «disuade y rastrea; no impide copiar». La frase de la línea 91 la desmiente A-H3 mientras no
  se arregle.

## Revisor B · criptografía

**0 ALTA · 0 MEDIA · 5 BAJA** propios. Foco: nucleo-js (BLAKE2b, Argon2id), cifrar, fichero y el visor.

**Coincidencias con A (no se cuentan dos veces):** B también midió A-H4 (quitar `.normalize(NFC)` de VISOR_JS:125 deja lib/exportaciones 80/80 verde; el caso «NFC en los dos lados» de cifrar.test.ts:83 descifra con el ayudante nativo de la prueba, que normaliza por su cuenta, así que el §5 del diseño lo da por cubierto sin que lo esté) y A-H7 (el catch de VISOR_JS:126 culpa a la contraseña de un fallo que Argon2id nunca produce por ella).

**Lo que se comprobó y está bien:**
- **BLAKE2b (RFC 7693)**: el parámetro de bloque `0x01010000 ^ longitud`, el contador en v12/v13, el último bloque con relleno de ceros, las rotaciones 32/24/16/63 en pares de 32 bits y la SIGMA de 12 rondas. El último bloque exactamente de 128 bytes no se comprime dos veces.
- **Argon2id (RFC 9106)**:
  - H0: p, T, m (no m′), t, 0x13, y=2, y las longitudes de P, S, K y X;
  - H′ con r = ⌈T/32⌉ − 2 y el último trozo de T − 32r;
  - los bloques 0 y 1 con LE32(i) y la vía 0;
  - la mitad independiente de los datos (solo pasada 0 y cortes 0 y 1), con la entrada (r, l, sl, m′, t, y, i) y el contador que empieza en 1;
  - G(0, G(0, Z)) y la regeneración cada 128 en i % 128;
  - la ventana de referencia en las dos ramas de la pasada, y `start` = (corte + 1)·seg salvo en el corte 3;
  - el XOR con el bloque anterior en las pasadas > 0;
  - P por filas y por columnas con los índices de la referencia, y fBlaMka en 64 bits con el acarreo.
- **Cotejo propio con crypto.argon2Sync (Node 24.14.1)**: m = 10, 1027, 4099 y 4096 (t = 1), 520 (t = 5); sales de 8, 32 y 300 bytes; contraseña vacía y de 1024 bytes; longitudes 4, 33, 63, 65, 96, 100, 128, 1000 y 1024. Todo coincide.
- **ES2017 plano**: acorn parsea el núcleo envuelto y el visor con `ecmaVersion` 5, 2015, 2016 y 2017.
- **cifrar**:
  - NFC antes de medir (el caso de la línea 169 lleva de verdad U+0303);
  - sal y nonce del generador, en el orden 16 y 12;
  - AAD = utf8(cabecera) literal;
  - huella = SHA-256 del HTML en UTF-8.
- **fichero**:
  - el orden de claves de la cabecera, fijado con un literal;
  - `<` escapado en los textos;
  - la cabecera rechaza `<>&`;
  - el código no puede cerrar su `<script>`;
  - la CSP va antes del primer `<script>`.
- **Visor**:
  - lee `textContent` exacto y lo usa como AAD;
  - valida formato, versión, p, longitud y las longitudes de sal y nonce antes de derivar;
  - pinta solo con `createElement`/`textContent`/`className` constante/`style` constante: no hay ningún camino de inyección (los valores descifrados nunca llegan a un atributo, a una URL ni a HTML).
- **Medido sobre el AAD**: el mutante que quita los datos asociados de los DOS lados lo caza la prueba del espacio de más (`visor-js.test.ts:161`). La prueba que nombra el diseño («otro m») seguiría verde, porque otro m ya da otra clave. Aun así, la guarda está cubierta. El mutante que re-serializa la cabecera (`JSON.stringify(JSON.parse(...))`) también muere.
- Mutantes medidos en una copia aparte (`lib/` + configuración de vitest, `node_modules` por unión, que ya se ha quitado). Base: 80/80 verde.

| id | sev. | archivo:línea | qué |
|---|---|---|---|
| B-H1 | BAJA | `lib/exportaciones/fichero.ts:17` | El base64 por trozos (contrato del diseño §1.3) nunca se prueba con más de un trozo: ninguna carga de las pruebas pasa de 32 KiB, así que el bucle solo da una vuelta. |
| B-H2 | BAJA | `lib/exportaciones/nucleo-js.test.ts:89` | Los seis cotejos de Argon2id con crypto.argon2Sync usan todos un m múltiplo de 4 y una sal de 16 bytes, así que tres desvíos del RFC 9106 sobreviven. |
| B-H3 | BAJA | `lib/exportaciones/nucleo-js.ts:265` | De los lanzamientos del núcleo solo se prueba p = 2. Ni t ∈ [1, 64], ni m ≥ 8, ni la longitud, ni la sal corta, ni las cotas de m y t del visor (visor-js.ts:60) tienen una prueba. |
| B-H4 | BAJA | `lib/exportaciones/cifrar.ts:37` | La longitud de la contraseña se mide en unidades UTF-16 (`.length`), no en caracteres como dicen el ADR-076 §7 y el mensaje de ErrorContrasena. |
| B-H5 | BAJA | `lib/exportaciones/visor-js.ts:122` | `setTimeout(…, 0)` no garantiza que el navegador pinte «Abriendo…» antes de los segundos de Argon2id en el hilo principal. |

### B-H1 · BAJA · `lib/exportaciones/fichero.ts:17`

El base64 por trozos (contrato del diseño §1.3) nunca se prueba con más de un trozo: ninguna carga de las pruebas pasa de 32 KiB, así que el bucle solo da una vuelta.

**Escenario:** Medido: el mutante `bytes.subarray(i, TROZO)` (que para i ≥ 32768 da un trozo vacío) deja 80/80 verde. La proyección profesional repite cada versión dos veces (texto y canónico), así que una nota de tres versiones de unos 6 KB ya pasa de 32 KiB. Con esa regresión, la carga se trunca, el fichero no abre nunca («Contraseña incorrecta o fichero dañado») y su huella ya se habría registrado. El código actual es correcto; falta una prueba de ida y vuelta con una carga de más de 64 KiB.

### B-H2 · BAJA · `lib/exportaciones/nucleo-js.test.ts:89`

Los seis cotejos de Argon2id con crypto.argon2Sync usan todos un m múltiplo de 4 y una sal de 16 bytes, así que tres desvíos del RFC 9106 sobreviven.

**Escenario:** Medido con los mismos seis casos: sobreviven `columnas = m` (sin el redondeo m′ = 4·⌊m/4⌋), H0 con m′ en vez de m, y `le32(16)` fijo en vez de `le32(sal.length)`. Con m = 10 o una sal de 32 bytes darían otra clave. En v1 son equivalentes (m = 65536 y sal de 16, fijados por el visor), pero la mitigación del riesgo 3 del diseño («una implementación que pase esas cinco con m distintos es Argon2id») no se cumple. Comprobé que el núcleo actual SÍ coincide con Node en m = 10, 1027 y 4099, sales de 8, 32 y 300 bytes, contraseña vacía y de 1024 bytes, y longitudes 4…1024. Bastaría con añadir dos de esos casos.

### B-H3 · BAJA · `lib/exportaciones/nucleo-js.ts:265`

De los lanzamientos del núcleo solo se prueba p = 2. Ni t ∈ [1, 64], ni m ≥ 8, ni la longitud, ni la sal corta, ni las cotas de m y t del visor (visor-js.ts:60) tienen una prueba.

**Escenario:** Medido: sin la guarda `entero(t, 1, 64)`, argon2id con t = 0 devuelve la MISMA clave para cualquier contraseña y sal (7636809c… para «contraseña uno» con sal 01… y para «otra distinta» con sal 09…). Si no hay pasadas, la memoria solo tiene los dos primeros bloques, y el último bloque, que es cero, da la clave. La única barrera en el camino del Worker (derivarEnTrabajador) es esa guarda, y quitarla deja la suite verde. Quitar las cotas `entero(k.m…)`/`entero(k.t…)` del visor también deja 80/80 verde.

### B-H4 · BAJA · `lib/exportaciones/cifrar.ts:37`

La longitud de la contraseña se mide en unidades UTF-16 (`.length`), no en caracteres como dicen el ADR-076 §7 y el mensaje de ErrorContrasena.

**Escenario:** `cifrarCopia(copia, '🔐'.repeat(6), …)` se acepta: son 6 caracteres y miden 12 unidades. Una contraseña de 200 emojis (200 caracteres) se rechaza, porque mide 400 unidades. Hay que contar con `Array.from(normalizada).length`, o el ADR tiene que decir «unidades».

### B-H5 · BAJA · `lib/exportaciones/visor-js.ts:122`

`setTimeout(…, 0)` no garantiza que el navegador pinte «Abriendo…» antes de los segundos de Argon2id en el hilo principal.

**Escenario:** No está medido en un navegador; jsdom no pinta. El temporizador de 0 ms suele correr antes de la siguiente oportunidad de renderizado (~16 ms). Entonces el role="status" y el botón deshabilitado no se ven ni se anuncian hasta que termina la derivación, y la página parece colgada de 2 a 5 s. La forma habitual de evitarlo es `requestAnimationFrame(() => setTimeout(f, 0))`. Conviene mirarlo en la prueba manual C7.

## Ronda 2 · corte A (revisor único, 03-10-2026)

Rama `worktree-agent-a57d63ed182caa785`, HEAD `b483b47`. Diff de la ronda `2a6daaf..b483b47`, con el contexto de `main...HEAD`.
Se miden los mutantes en una copia aparte (`git archive` al scratchpad, con una unión de `node_modules` que ya está quitada).
La marca y el visor se miden en Chromium (Playwright) sobre `%TEMP%\psicogestion-T-040-copia-de-muestra.html`, regenerado desde `b483b47`.

**Comandos en el worktree:**
- `npm test`: 128 ficheros y 1621 pruebas, todo verde.
- `npm run lint`: 0 errores. Hay 2 avisos en `lib/cuentas/accesos.test.ts`, fuera del diff.
- `npx next build --webpack`: «Compiled successfully», salida 0.

**Sin ALTA. 1 MEDIA, 4 BAJA. Los 13 hallazgos de la ronda 1 quedan cerrados en el código.**

### Cierre de la ronda 1 (mutante medido → resultado)

| id | cierre | mutante (copia aparte) |
|---|---|---|
| A-H1 | `superRefine` con los campos «sí» de §1.2 por rama y alcance. La profesional conjunta no exige `participantes`, como dice la tabla. | Sin `superRefine` → **muere** (2 rojas). Paciente individual sin `motivo_cambio` → **muere**. |
| A-H2 | `{nombre_completo, rol}`, como en las decisiones del diseño. Ya no queda `apellidos` en `lib/exportaciones`. | Aceptar la forma vieja → **muere**. Quitar `.trim()` → **sobrevive** (R2-H5). |
| A-H3 | Filas dimensionadas al lado mayor (suelo 1920). Medido con píxeles reales en Chromium: 99,8 % de `<main>` a 1920×1080, 1366×768, 390×844 y 2560×1440. El guion del implementador da 100 % en las tres. | 40 filas, 3 frases por fila, sin el suelo de 1920 → **mueren**. Las mutaciones de CSS sobreviven (R2-H1). Queda el caso de la ventana que se agranda (R2-H2). |
| A-H4 | Prueba NFC → NFD de punta a punta en el visor. | Quitar `.normalize('NFC')` de VISOR_JS → **muere**. |
| A-H5 | La línea de la marca va tras el h1, que es donde cae el foco. | La línea antes del h1 → **muere**. |
| A-H6 | `avisarDeNuevo`: vacía la región y escribe el aviso en el siguiente tick. | Escribir directamente → **muere**. |
| A-H7 | Texto propio `sinMemoria`. | Volver a `tx('error')` → **muere**. Ver R2-H4. |
| A-H8 | «Requerimiento judicial o inspección», fijado en una prueba. No queda otra variante en el repo. | Con «de» → **muere**. |
| B-H1 | Ida y vuelta con más de 3 × 32 KiB. | `subarray(i, TROZO)` → **muere**. |
| B-H2 | m = 10, 1027 y 4099, y sales de 8, 32 y 300 bytes. | `columnas = m` → **muere** (3 rojas). `le32(16)` → **muere** (3 rojas). |
| B-H3 | Lanzamientos del núcleo y cotas del visor. | En el núcleo mueren todos: sin guarda de t, de sal, de m o de longitud, y sin el tope de m o de t. En el visor, `t ≥ 0` y el tope de m a 4 GiB → **mueren**. |
| B-H4 | `[...normalizada].length` (puntos de código). | Volver a `.length` → **muere**. |
| B-H5 | Doble `requestAnimationFrame`, con `setTimeout` si no hay rAF. En Chromium hay 2 fotogramas (17-31 ms) entre «Abrir» y Argon2id. | `setTimeout` siempre → **muere**. **Un solo rAF → sobrevive** (R2-H3). |

**Lo que se preguntó:**
- **La capa grande (A-H3): ¿pesa en el rendimiento o en la impresión?** No. Lo medido en Chromium:
  - Tamaño: a 1920 son 56 filas y 44 688 caracteres; con una pantalla de 3840 (o al abrir en una de 1366 con `screen` 3840), 109 filas y 158 595 caracteres.
  - Pintado: reinsertar la capa y forzar la composición cuesta 1,3 ms a 1920 y 4,3 ms a 3840.
  - Desplazamiento: entre fotogramas, la mediana es de 16,6 ms con capa y sin ella. El p95 es de 17,6 ms frente a 17,6 ms a 1920, y de 18,0 ms frente a 17,7 ms a 3840. El peor caso es de 25 ms frente a 18 ms a 3840.
  - Impresión: el PDF A4 tarda 150-200 ms más con la capa (7-23 ms sin ella) y pesa 13 KB más. Una nota alargada a 13 páginas pesa 95,6 KB con la capa y 72,0 KB sin ella. Al imprimir, la capa sigue en `display:block; position:fixed`.
- **A-H7: ¿«sin memoria» esconde una contraseña mala o un fichero dañado?**
  - La contraseña, no: solo entra en H0 por BLAKE2b.
  - El fichero dañado, sí, en un caso medido: una cabecera con `m` alterado dentro de la cota del visor. Está en R2-H4.
  - Fuera de eso, la excepción solo puede venir de la reserva de memoria o de un fallo del propio núcleo.
- **B-H5: ¿se queda colgado en segundo plano?** No.
  - El rAF solo se aplaza mientras el documento está oculto. La retrollamada queda en cola y corre al volver a la pestaña, con `ocupado` y el botón deshabilitado mientras tanto. La ventana para que eso pase es de dos fotogramas (unos 33 ms) después de «Abrir». Pasados esos dos fotogramas, Argon2id corre de forma síncrona, y AES y `pintar` siguen por promesas, que no dependen de rAF.
  - Playwright no deja medir el caso de la pestaña oculta. Con las banderas anti-throttling quitadas, en headless y con ventana, y con la ventana minimizada por CDP, `visibilityState` sigue `visible`. Minimizada, rAF siguió corriendo frenado (37 fotogramas en 4,8 s) y la copia se abrió.
  - Lo anterior queda razonado, no medido en una pestaña oculta de verdad.

### MEDIA

- **R2-H1** `lib/exportaciones/visor-js.test.ts:326`. La decisión del diseño sobre A-H3 dice «lo mide una prueba de Playwright sobre el fichero de muestra», y no hay tal prueba en la rama. La prueba de vitest repite la fórmula del código: 6 px por carácter y filas de 72 px, contadas en jsdom, que no maqueta. El guion del implementador, fuera del repo, no mide el giro real: lo modela, porque quita `transform` y aplica −30° a mano.
  *Escenario:* medido en Chromium sobre el fichero de muestra.
  - Con `giro.style.transform = 'rotate(-30deg) translateX(40%)'`, toda la suite sigue verde y el guion del implementador da «PASA, 100 %» en los tres tamaños. Con píxeles reales (filas con fondo negro y anchura `max-content`, `<main>` invisible, captura), `<main>` queda cubierto al 67,8 % a 390×844 y al 87,5 % a 1366×768.
  - Con `fontSize` a `6px`, toda la suite sigue verde y el guion da 80,4 % a 1920. Con píxeles reales queda en 71,7 % a 2560×1440.
  - Una regresión de estilo deja de nuevo la nota sin marca en una captura, y nada lo para.
  - La infraestructura ya existe (`playwright.config.ts`, `accesibilidad/`). Falta la prueba que pide la decisión, y tiene que medir píxeles o geometría con la transformación real.

### BAJA

- **R2-H2** `lib/exportaciones/visor-js.ts:207`. `lado` se calcula una sola vez, al pintar, con la pantalla de ese momento. Si después la ventana pasa a una pantalla mucho más ancha, las filas, alineadas a la izquierda del bloque girado, ya no llegan al centro.
  *Escenario:* medido con píxeles reales. La copia se abre en un portátil de 1366×768 o 1920×1080 y luego la ventana se arrastra a un monitor ultrapanorámico de 5120×1440 al 100 % y se maximiza. Entonces solo queda bajo la marca el **35,5 %** de `<main>`, y una captura de la parte derecha de la nota sale sin el código. Abriendo directamente en 5120×1440 se cubre el 99,8 %. Alejar el zoom a 50 % o 33 % después de abrir da 99,8 %, y a 25 %, 0 %, aunque a esa escala el texto ya no se lee. Arreglo: recalcular en `resize` o centrar las filas en el bloque girado.
- **R2-H3** `lib/exportaciones/visor-js.test.ts:269`. La prueba de B-H5 no distingue uno de dos fotogramas. Ejecuta los fotogramas en bucle y solo comprueba que no se deriva antes del primero.
  *Escenario:* el mutante `window.requestAnimationFrame(f)`, con un solo rAF, deja la suite verde. Con un solo rAF, Argon2id corre en la retrollamada del fotograma, antes de que ese fotograma se pinte, así que «Abriendo…» no se ve ni se anuncia durante 1-5 s. Ese es justo el fallo de B-H5, y el comentario del código («un fotograma y el siguiente garantizan que el navegador ya pintó») queda sin guarda. Basta con ejecutar un solo fotograma y exigir `derivaciones === 0`.
- **R2-H4** `lib/exportaciones/visor-js.ts:60` y `:141`. Ahora cualquier excepción de Argon2id se atribuye a la memoria. El visor admite m hasta 1 GiB y t hasta 16, aunque v1 siempre escribe m = 65536 y t = 3, y el servidor los exige como literales. Por eso una cabecera dañada en `m` se presenta como un problema del dispositivo.
  *Escenario:* medido en Chromium con la contraseña correcta y `"m":65536` cambiado a `"m":655360` (un dígito de más) o a `"m":1048576`.
  - En un dispositivo que no puede reservar más de 256 MiB (simulado), el visor dice a los 70 ms: «Este dispositivo no tiene memoria libre suficiente… ábrela en otro ordenador».
  - En un ordenador que sí puede, tarda 9,5 s o 15 s y dice: «Contraseña incorrecta o fichero dañado».
  - Al destinatario se le manda cambiar de equipo por un fichero que está dañado. En la ronda 1, ese mismo caso daba el mensaje correcto.
  - Arreglo: que el visor de v1 exija los literales `m = 65536` y `t = 3` y dé por dañado lo demás. Así la excepción sí solo puede ser de memoria.
- **R2-H5** `lib/exportaciones/formato.ts:93`. El `.trim()` de `nombre_completo` no tiene prueba. `perfiles.nombre_completo` es `text not null` sin un check de blancos (`20260815192424_…:30`), y `esquemaCopiaV1` solo se aplica en las pruebas.
  *Escenario:* el mutante `z.string().min(1)`, sin `.trim()`, deja verde `formato.test.ts`. Con esa regresión, un perfil con `nombre_completo = '  '` pasa el esquema. `proyectar` da `quien: ''` y la copia sale «exportada por  (Profesional sanitario)», con la capa sin autor. La prueba de `sinNombre` solo usa `''`; falta el caso `'   '`.

### Comprobado sin hallazgo

- `camposExigidos` sigue la tabla de §1.2 al pie de la letra. `null` en las columnas que lo admiten sigue valiendo, y ausente no vale; lo prueban las dos ramas.
- `proyectar` usa `nombre_completo.trim()`. En el diff no queda `unirNombre` para quien exporta, y el comentario de «hallazgo» de la ronda 1 ya no está.
- `trasPintar`: hasta la derivación, `ocupado` y `boton.disabled` siguen como estaban. La rama sin rAF es la que recorren las demás pruebas en jsdom, que no trae rAF.
- `avisarDeNuevo`: con dos pulsaciones seguidas, el último `setTimeout` escribe el mismo texto, y no se anuncia dos veces.
- Los textos nuevos salen de `t()` (`sinMemoria`). No hay `innerHTML` ni `console.*` nuevos, y la ronda no toca ni docs ni ADR.

## Ronda 3 · corte A (revisor único, 03-10-2026)

Rama `worktree-agent-a3bc1f4d1b3e8ee02`, HEAD `f8990c2`. Diff de la ronda `b483b47..f8990c2` (un commit por hallazgo), con el contexto de `main...f8990c2`.
Los mutantes se miden en una copia aparte (`git archive f8990c2` al scratchpad de la sesión, con una unión de `node_modules` que ya está quitada). Las mutaciones de la marca se miden con la spec nueva en Chromium, con una configuración de Playwright sin `webServer` solo en la copia (la spec abre por `file://`).

**Comandos en el worktree:**
- `npm test`: 128 ficheros y 1626 pruebas, todo verde (1621 de la ronda 2 + 5 nuevas).
- `npm run lint`: 0 errores. Hay 2 avisos en `lib/cuentas/accesos.test.ts`, fuera del diff.
- `npx next build --webpack`: «Compiled successfully», salida 0.
- `PUERTO=3101 npx playwright test accesibilidad/marca-de-agua.spec.ts --workers=1`: 5/5 en verde. `<main>` y ventana: 99,8/99,8 % a 1920×1080, 99,9/99,8 % a 1366×768, 99,9/99,9 % a 390×844, 99,8/99,8 % a 2560×1440, y 99,8/99,7 % al pasar de 1366×768 a 5120×1440.

**Sin ALTA. 0 MEDIA, 1 BAJA. R2-H1..R2-H5 quedan cerrados.**

### Cierre de la ronda 2 (mutante medido → resultado)

| id | cierre | mutante (copia aparte) |
|---|---|---|
| R2-H1 | `accesibilidad/marca-de-agua.spec.ts`: genera la copia con el código de `lib/exportaciones/`, la abre en Chromium y cuenta píxeles negros (filas `max-content` con fondo negro, `<main>` invisible) en cuatro tamaños. Exige el 80 % de `<main>` y de la ventana. | `rotate(-30deg) translateX(40%)` → **muere** (0,0 % de `<main>` de 1366 a 5120). `fontSize` a `6px` → **muere** (48,4 % de la ventana de 1366 a 5120). Con el centrado nuevo, los cuatro tamaños fijos ya no distinguen estos dos mutantes: los mata solo el caso de R2-H2. `zIndex -1` → **muere** (0 % en los cinco casos). La opacidad y el color de la tinta **sobreviven** (R3-H1). |
| R2-H2 | Las filas van centradas en el bloque girado (`flex`, columna, centrado en los dos ejes). Con la ventana agrandada después, siguen cruzando el centro. La spec lo prueba de 1366×768 a 5120×1440 (en Playwright, `screen` = viewport al abrir, así que `lado` = 1920: la prueba no es vacua). | `display:block` → **muere** (35,5 %, la cifra de la ronda 2). `alignItems: flex-start` → **muere** (35,5 %). Sin el suelo de 1920 → **muere** (77,4 % de la ventana). `justifyContent: flex-start` → sobrevive, pero no hay fallo: `<main>` sigue al 99,8 % incluso de 1366×768 a un 2160×3840 vertical (la ventana baja al 55,7 % en las esquinas). Sin hallazgo. |
| R2-H3 | La prueba de B-H5 ejecuta un solo fotograma, exige `derivaciones === 0` y que se haya pedido el segundo. | Un solo rAF → **muere**. `rAF(() => setTimeout(f, 0))` → **muere**. |
| R2-H4 | El visor v1 solo admite `m = 65536`, `t = 3`, `p = 1`, `longitud = 32`; lo demás es «dañado» al cargar. Reserva aparte los 64 MiB y la pasa al núcleo: «sin memoria» solo si falla esa reserva, y cualquier otro fallo de Argon2id da `error`. El núcleo acepta la memoria reservada, comprueba que sea un `Uint32Array` de la medida exacta y la deja a cero. Coincide con el diseño §8, «los parámetros viven en `formato_version`». | Volver a las cotas de la ronda 2 → **muere** (2 rojas). Quitar `t` → **muere**. Quitar `m` → **muere**. El catch de Argon2id con `sinMemoria` → **muere**. No pasar la memoria al núcleo → **muere** (2 reservas en vez de 1). El núcleo sin comprobar la memoria → **muere**. El núcleo sin `memoria.fill(0)` → **muere**. |
| R2-H5 | Prueba con `'   '` y `' \t\n '`, y las gemelas `'B'` y `'  Berta Ruiz  '`. | `z.string().min(1)` sin `.trim()` → **muere**. |

### BAJA

- **R3-H1** `accesibilidad/marca-de-agua.spec.ts:81` (y `lib/exportaciones/visor-js.ts:205`, `:239`). La spec mide la geometría de la marca, pero antes de medir fuerza `opacity: 1` en la capa y pinta de negro el fondo de cada fila. Así no ve si la marca se ve. Ninguna prueba de vitest comprueba la opacidad ni el color de la tinta.
  *Escenario:* medido en la copia. Con `s.opacity = '0'`, vitest de `lib/exportaciones` da 101/101 y la spec 5/5 (99,8 % en todos los casos). Con `fila.style.color = '#fff'`, 101/101 y 5/5 (92,5 %). En los dos casos la copia se abre en Chromium sin ninguna marca visible: con opacidad 0, por definición; con tinta blanca, sobre el fondo `#fff` del cuerpo y, al 12 %, sobre el `#f6f8fa` de `.texto`. Una captura de la nota sale sin código y nada lo para, que es la clase de fallo de R2-H1 por otra vía.
  Arreglo barato: en vitest, fijar `capa.style.opacity === '0.12'` (o un intervalo) y `color` de fila; o, en la spec, comprobar con `getComputedStyle` la opacidad y el color antes de neutralizarlos.

### Comprobado sin hallazgo

- **Impresión con el centrado nuevo** (`emulateMedia print`, sonda en la copia): 99,9 % a 794×1123 (A4) y 99,8 % a 1920×1080. El bloque sigue siendo `flex` en impresión.
- **Crecimiento en vertical** con el código real: de 1366×768 a 1440×2560, 99,8 % de `<main>` y de la ventana. A 2160×3840, 99,8 % y 98,9 %.
- `leerCabecera`: con `!==` estricto, una `m` en cadena (`"65536"`) también se rechaza. `danado` se escribe al cargar, sin derivar; las pruebas comprueban la alerta antes de enviar y después.
- Las sustituciones de la prueba de literales (`"t":3`, `"p":1`) caen en la cabecera, no en otro JSON del fichero: lo demuestra el mutante «sin `t`», que muere en `"t":4`.
- `sinMemoriaPara` solo intercepta reservas de 64 MiB o más. La gemela cuenta una sola reserva, así que el núcleo usa la del visor.
- **Node ≥ 24.7.** La spec usa `crypto.argon2Sync`, como las pruebas de vitest de `lib/exportaciones`. `ci.yml` fija Node 20, pero el diseño ya lo anota (riesgos, «fijar Node en `engines`») y `state.md` dice que la CI nunca ha corrido. No es nuevo de esta ronda.
- La ronda no toca docs, ADR, `package.json` ni `.github`. `accesibilidad/**` está en el territorio de §6. El worktree queda limpio (`git status` vacío).
