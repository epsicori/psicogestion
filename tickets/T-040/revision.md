Sin hallazgos ALTA. Gate combinado (A+B): 0 ALTA, 4 MEDIA, 9 BAJA (revision.json).

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
