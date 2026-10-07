**Sin hallazgos ALTA.** T-023 · ronda 3 · revisión combinada (A: datos, acción del servidor, banco y constitución · B: cliente, accesibilidad y spec) · rama `worktree-agent-a875b9deffe28f1da` (HEAD `e7c356f`), diff de la ronda `worktree-agent-a65aa0bb5f872243e..worktree-agent-a875b9deffe28f1da`

Recuento combinado: **0 ALTA, 2 MEDIA, 6 BAJA**. Los ids llevan el prefijo del revisor y su número original.
Duplicados unidos con la gravedad más alta:
- **B-H1** (MEDIA) + la nota de A «Fuera de mi ámbito, para B» (`claveRef` vive en `FormularioCobro` y muere al cerrar el diálogo; A no la contaba).
- **A-H4** (BAJA) + **B-H5** (BAJA): con `?profesional=` y la lista de profesionales caída, las cifras siguen filtradas sin que nada lo diga ni permita quitar el filtro. Por eso no hay B-H5 en la tabla.

A-H1 (relectura fallida tras el 23505 de la propia clave contestada con `fallo()`) lleva al mismo duplicado que B-H1 por otra causa (servidor y no cliente) y se cuenta aparte.

Hallazgos de la ronda 2: A-H1, A-H2 y B-H2..B-H4, B-H7, B-H8 cerrados; B-H1, A-H3/B-H5 y B-H6 cerrados con residuo en B-H1, A-H4 y B-H4 de esta ronda.

Los textos de cada revisor siguen abajo sin cambios, salvo los ids y el nivel de los títulos.

| Id | Severidad | Dónde | Revisor |
|---|---|---|---|
| B-H1 | MEDIA | `app/(app)/facturacion/formulario-cobro.tsx:52` | A+B |
| B-H2 | MEDIA | `accesibilidad/facturacion.spec.ts:135` | B |
| A-H1 | BAJA | `app/(app)/facturacion/acciones.ts:109` | A |
| A-H2 | BAJA | `app/(app)/facturacion/acciones.ts:55` | A |
| A-H3 | BAJA | `docs/state.md:21` | A |
| A-H4 | BAJA | `app/(app)/facturacion/page.tsx:36` | A+B |
| B-H3 | BAJA | `accesibilidad/facturacion.spec.ts:154` | B |
| B-H4 | BAJA | `app/(app)/facturacion/paginacion-pendientes.tsx:38` | B |

---

# Revisor A (datos, acción del servidor, banco y constitución)

Sin hallazgos ALTA. Revisor A, ronda 3: 0 ALTA, 0 MEDIA, 4 BAJA.

## T-023 · Ronda 3 · Revisor A (datos, acción del servidor, banco y constitución)

Diff: `git diff worktree-agent-a65aa0bb5f872243e..worktree-agent-a875b9deffe28f1da -- . ':!tickets'` (19 ficheros).
Contrato: anexo R3 de `tickets/T-023/diseno.md` (R3.1, R3.4, R3.5 y R3.6, «Revisor A»).
No he leído `evidencia.json` ni el informe del implementador.

### Medido

Ejecuté `00-ayudantes + 01-fijacion + 30-cobros` de la rama (HEAD e7c356f) dentro de `begin … rollback`
en `supabase_db_Psicogestion` (max(version) = 20261013120000) y añadí al final una sonda propia.
Resultado: rc=0, con E12, E12b, E12c y E12g en OK. La sonda dio esto:

| Sonda | Qué | Salida |
|---|---|---|
| S1 | PRO2 (CB) inserta con el id del cobro de PRO1 y su propio paciente P30B | `23505 … "cobros_pkey"` |
| S2 | relectura del servidor como PRO2 (`id = X and registrado_por = auth.uid()`) | 0 filas |
| S3 | PRO2 con el mismo id y un paciente que no ve (P30A) | `42501` (la RLS va antes que el índice único) |
| S4 | PRO1 con su id existente y fecha futura | `23514` (el disparador before va antes que el índice único) |
| S5 | relectura del servidor como PRO1 | 1 fila |

### «Qué revisar» de R3.6 (Revisor A), punto por punto

- **El 23505 solo se da por bueno con `cobros_pkey` y fila propia bajo RLS.** Se cumple
  (`acciones.ts:100-112`). La condición pide `code === '23505'` y `cobros_pkey` en el mensaje. Después,
  `select('id').eq('id', id).eq('registrado_por', usuario.id).maybeSingle()` con el cliente de sesión.
  Si un usuario reutiliza el id de otro, recibe el mensaje genérico. Lo he medido: S1 + S2 dan 23505
  y 0 filas, así que la acción devuelve `fallo()`. Para el administrador, que con la RLS lo ve todo,
  la única guarda es `registrado_por`. La prueba positiva la fija con
  `toHaveBeenCalledWith('registrado_por', USUARIO)`, y un mutante que la quitara cae.
- **Sondeo de un cobro ajeno.** Con un id ajeno existente sale el genérico. Con uno inexistente, el cobro
  entra de verdad y no se puede borrar (regla 6). Ese diferencial ya existía antes de este diff, porque
  `authenticated` tiene `insert (id, …)` sobre `cobros` desde T-021 (`20261011120000_economico_esquema.sql:1255`)
  y PostgREST devuelve el 23505 tal cual. Además, solo sirve si ya se conoce el uuid, y conocerlo ya es el
  dato. Este diff no abre un oráculo nuevo, así que no lo cuento como hallazgo.
- **E12 lleva su gemela.** Sí: E12g mete otro id en la misma sesión con el mismo importe y entra. E12b usa
  `assert_lanza_codigo_msg` con el código y el fragmento `cobros_pkey`, así que no se pondría verde con un
  23505 de otra restricción.
- **Nada nuevo lee `perfiles`.** Revisé las líneas añadidas del diff: no aparece ningún `from('perfiles')`.
  `cargarOpcionesProfesional` sigue usando `directorio_perfiles` y la RPC.
- **`z.uuid()` antes de todo lo demás.** Va antes del paciente (`acciones.ts:33-35`). Sin id, o con un id
  que no es UUID, devuelve `fallo()` y no llega al insert. Las pruebas cubren `undefined`, `'x'` y `7`.

### Mutantes M18-M22 y banco E12

- **M21** (cualquier 23505 cuenta como éxito y no se relee): cae por el motivo correcto. «Sin fila propia»
  y «error al releer» esperan `fallo()`, y «otra restricción» espera además que no se llame a
  `selectCobros`. He razonado también tres variantes intermedias:
  - quitar `.eq('registrado_por', …)`: cae por `toHaveBeenCalledWith` en la positiva;
  - quitar `includes('cobros_pkey')`: cae «otra restricción», cuya fixture trae una fila existente;
  - quitar la validación del id: caen los tres `it.each`, que esperan que no se inserte.
  Quitar `&& !errorRelectura` no lo caza ninguna prueba, pero es equivalente: `maybeSingle` no devuelve
  `data` junto con `error`.
- **M18** (`router.refresh()` de vuelta en el catch): la prueba sigue simulando `next/navigation`
  (`formulario-cobro.test.tsx:8-9`), así que cae por `refresh not.toHaveBeenCalled` y no porque se rompa
  el renderizado.
- **M19, M20, M22**: son de interfaz (revisor B). Las pruebas que los cazan existen y comprueban lo que dice
  `mutantes.json`.
- **E12**: no tiene mutante SQL porque la guarda es la clave primaria, y el diseño lo acepta. Sin
  `cobros_pkey`, E12b caería («no lanzó nada»).

### Constitución (regla 6)

El diff no trae ningún `UPDATE`, `DELETE` ni `upsert` sobre tablas económicas. La acción hace un `insert` y,
si ese insert falla, un `select`. El banco solo inserta. La migración no cambia. **Sin violaciones.**

### Hallazgos A de la ronda 2

- **A-H1: cerrado.** `docs/state.md:26-31` de la rama coincide byte a byte con el bloque de R3.5 (`diff` vacío).
  Ya dice «Queda rastro en `auditoria`» y «sigue sin módulo propio».
- **A-H2: cerrado.** Están los tres casos (filtro del administrador, técnico del centro del superviviente y
  profesional del absorbido), con «No cambia ninguna cifra. Ticket aparte.».
- **A-H3: cerrado** en lo que pedía, que era no presentar un error como ausencia. Un fallo de la RPC o un
  error del directorio dan `{ ok: false }`, «Profesional no encontrado» solo sale sin fila y sin error, y
  hay pruebas para la RPC, el directorio (57014) y la página. Queda el residuo de H4.

### Hallazgos

#### A-H1 · BAJA · `app/(app)/facturacion/acciones.ts:109`
Si la relectura falla después de un 23505 de la propia clave, el usuario lee «No se ha podido registrar el
cobro», y es falso: el cobro con ese id ya está en la base. El registro solo guarda `23505`, no el código de
la relectura (`:115`). La prueba «con error al releer» no comprueba la consola.

**Escenario.** Un corte de red tras el primer envío, que sí entró. El usuario vuelve a pulsar, el insert da
23505 `cobros_pkey` y la relectura cae (57014 o se agota la conexión). La acción devuelve `fallo()`. El
usuario entiende que no quedó registrado, cierra el diálogo y lo vuelve a rellenar. El formulario se monta
de nuevo con otro id, así que queda un cobro duplicado que no se puede borrar.

El texto que corresponde aquí es `resultadoDesconocido`. No abre ningún oráculo, porque un error de lectura
no depende de que el cobro sea de otro. El diseño (R3.1, «sin fila o con error: `fallo()`») dicta lo que hay
ahora.

#### A-H2 · BAJA · `app/(app)/facturacion/acciones.ts:55`
El reintento con la misma clave vuelve a pasar por todas las guardas previas al insert. Si una de ellas
cambia entre los dos intentos, contesta como si el cobro no existiera.

**Escenario.** El primer envío del cobro de P entra, pero la red corta la respuesta. Antes del reintento,
un administrador fusiona P en Q. Al reintentar, la acción devuelve `pacienteFusionado` («Registra el cobro
en el que se conserva») sin llegar al insert. El usuario lo registra en Q y el pendiente consolidado de Q
suma los dos: queda `cobrado_de_mas`.

El caso es improbable, porque exige que la fusión caiga justo entre el corte y el reintento. Lo cerraría
comprobar la clave propia antes de las guardas: `select … where id = :id and registrado_por = :yo` y, si
devuelve la fila, éxito.

#### A-H3 · BAJA · `docs/state.md:21`
El §«Siguiente paso» no se reescribió y sigue pidiendo «T-023 ronda 2: verificador y dos revisores», cuando
la línea 11 ya dice «ronda 3 implementada». Además, la línea 11 sitúa «M18-M22» dentro del «banco 30»,
pero son mutantes TS (`mutantes.json` → `ts_ronda_3`). El pie de `30-cobros.sql` se queda en M17, como
corresponde.

**Escenario.** La sesión siguiente lee las primeras 80 líneas (regla 4) y lanza otra vez el verificador y
los revisores de la ronda 2. O busca M18-M22 en `scripts/rls/30-cobros.sql` y no los encuentra.

#### A-H4 · BAJA · `app/(app)/facturacion/page.tsx:36`
Cuando falla la carga de profesionales, la página quita el selector y pinta el aviso. Pero la métrica, el
pendiente y «Últimos cobros» siguen filtrados por `?profesional=` y nada en pantalla dice por quién.

**Escenario.** El administrador abre un enlace guardado, `/facturacion?profesional=<Ana>`, y
`profesionales_del_pendiente` agota el tiempo. Ve «No se ha podido cargar la lista de profesionales» y, debajo,
«Pendiente total» con la cifra solo de Ana. Lo toma por el total de la consulta. Antes la mentira era
«Todos»; ahora es una omisión.

Lo arreglaría que el aviso dijera que las cifras están filtradas, o un enlace «quitar filtro» cuando
`profesionalFiltrado !== null`. El diseño R3.4 dicta el comportamiento actual.

### Fuera de mi ámbito, para B (sin contar) [unido a B-H1]

`claveRef` vive en `FormularioCobro`. Si el usuario cierra y vuelve a abrir el diálogo tras
`resultadoDesconocido`, o cambia un campo y lo deja como estaba, la huella o el montaje cambian y el id
también. El texto pide «sin cambiar nada» y no menciona cerrar el diálogo.

---

# Revisor B (cliente, accesibilidad y spec)

Sin hallazgos ALTA. 0 ALTA, 2 MEDIA, 3 BAJA.

## T-023 · Ronda 3 · Revisor B (cliente, accesibilidad y spec)

Diff revisado: `git diff worktree-agent-a65aa0bb5f872243e..worktree-agent-a875b9deffe28f1da -- . ':!tickets'` (cinco commits, de b86848e a e7c356f). Lo he medido con `git show` sobre la rama. No he ejecutado el spec.

### La lista de «qué revisar» (R3.6, revisor B)

- **Ningún camino del `catch` navega.** Se cumple. `formulario-cobro.tsx:104-108` solo llama a `setMensaje`, `useRouter` ya no se importa y `grep refresh` sale vacío. Queda un hueco: tras el `catch` la lista y la métrica no se actualizan hasta que un reintento salga bien (por el `revalidatePath` de la acción) o hasta la siguiente navegación. Eso alimenta H1.
- **El `id` se renueva tras un éxito y con datos distintos, y en ningún otro caso.** Dentro del formulario montado se cumple (`:88-90`, `:96`):
  - El orden de las claves no importa. `datos` es la salida de Zod, que sigue el orden del `shape` y no el de la entrada, y `JSON.stringify` omite los `undefined` de los opcionales vacíos.
  - Los valores equivalentes cambian la huella. `importe` sale recortado pero sin normalizar, así que `0,01`, `0.01` y `0,010` dan tres `id`. Solo pasa si el usuario vuelve a escribir el importe, cosa que el mensaje le pide no hacer. Pero eso es justo lo que pasa en H1.
  - Hay un caso fuera de la regla: el `id` también muere cuando se desmonta el formulario, y el diálogo lo desmonta al cerrarse. Ver H1.
- **El paso 4 cuenta `+ 1` y no se conforma con «visible».** Sí cuenta (`toHaveCount(antes + 1)` sobre filas filtradas, `spec:182`). La revalidación entrega la lista de golpe, sin pasar por un `+ 1` intermedio, así que M20 (`+ 2`) cae. Pero el paso depende de lo que haya en la base. Ver H2 y H3.
- **El foco tras paginar, en los dos sentidos.** Se cumple: «Siguientes» y «Anteriores», con reconciliación y con remontaje (`paginacion-pendientes.test.tsx`). El residuo está en H4.

### Lo que preguntaba el orquestador, fuera de la lista

- **Regiones `aria-live` siempre montadas.** Se cumple. `registrar-cobro.tsx:41` y `formulario-cobro.tsx:201` ya no llevan `empty:hidden`. La del formulario nace vacía con el diálogo. Un segundo «No sabemos…» idéntico se vuelve a anunciar: el `setMensaje('')` del manejador se confirma antes de que el `await` de red falle. No encuentro escenario de fallo.
- **La marca de módulo y las fugas.**
  - Entre pestañas no se filtra: cada pestaña es otro realm.
  - En el servidor el módulo se evalúa en SSR y comparte la variable entre peticiones. Solo la enciende `onClick`, que no corre en el servidor, así que no hay fuga entre usuarios.
  - Entre pruebas tampoco: `vi.resetModules()` en `beforeEach`.
  - Sí se queda encendida dentro de la misma pestaña cuando el clic no navega en ella. Ver H4.
- **El aviso de profesionales.** Cierra el «Todos» falso de B-H5, pero deja el filtro invisible. Ver H5.
- **«Más de 18 cobros acumulados falla a propósito».** Si la base no tuviera más cobros que los del propio spec, el tope sería exacto: es el mayor `antes` con el que un `+ 2` aún cabe en las 20 filas. Como fallo explícito y con instrucción, sería aceptable. No lo es tal como está, por dos motivos (H2):
  - Con 0 filas, el estado justo después del `db reset && npm run seed` que pide su propio mensaje, el paso falla antes de empezar.
  - El tope cuenta las filas de Lucía, no las de la lista. Lo que hace falta es que no se caiga ninguna fila por abajo.

### MEDIA

#### B-H1 · `app/(app)/facturacion/formulario-cobro.tsx:52`: la clave de envío muere al cerrar el diálogo, y el aviso manda pulsar un botón que se llama igual que el que abre un formulario en blanco

`claveRef` vive en `FormularioCobro`, y `Dialogo` hace `return null` cuando está cerrado (`components/ui/dialogo.tsx`, `if (!abierto) return null`). Tras el `catch`, `enviando` vale `false` y el diálogo se cierra con Escape, con la «X» o con un `mousedown` fuera del panel (`useCierreExterior`). Al cerrarse se pierden la clave y lo escrito.

El aviso (`lib/i18n/es.ts:1383`) dice «Vuelve a pulsar «Registrar cobro» sin cambiar nada: si ya estaba registrado, no se duplica». Pero «Registrar cobro» es también el disparador de la página (`registrar-cobro.tsx:38`). Además, sin `refresh`, «Últimos cobros» y la métrica siguen sin el cobro que sí entró.

**Escenario:**
1. En el móvil se corta la red al registrar 60,00 € a un paciente. El primer POST insertó.
2. Sale «No sabemos…». El usuario toca fuera del panel, o pulsa Escape para mirar la lista.
3. La lista no enseña el cobro.
4. Pulsa el «Registrar cobro» de la página, que es lo que el aviso nombra, y le sale un formulario vacío.
5. Vuelve a escribir 60,00 €. La clave es otra, así que entra una segunda fila.

El cobro queda duplicado y no se puede borrar (regla 6): solo se compensa con una devolución con motivo. Es el escenario de B-H1 de la ronda 2 por otra puerta.

**Qué haría falta, con prueba de cada parte:**
- **Que la clave sobreviva al cierre.** Subirla a `RegistrarCobro`, junto con lo escrito o con una huella normalizada (importe en céntimos, `aCentimos`), para que reescribir el mismo cobro reutilice el `id`. O bien que el diálogo no se cierre sin confirmar mientras el resultado sea desconocido.
- **Que el aviso no nombre un botón ambiguo.** Por ejemplo: «sin cerrar esta ventana».
- **Pruebas:**
  - en `registrar-cobro.test.tsx`, un rechazo, cerrar, abrir, mismo envío y el mismo `id`;
  - un paso del spec que cierre el diálogo entre el corte y el reintento.

#### B-H2 · `accesibilidad/facturacion.spec.ts:135`: el paso 4 solo pasa con cobros de ejecuciones anteriores, y su tope de 18 no garantiza que se vea el `+ 1`

La siembra no inserta cobros: `supabase/seed.sql` y `seed-completo.sql` no los tienen, y los bancos de `scripts/rls/` corren en `begin … rollback`. Esto falla de dos maneras.

**Primer escenario (base recién sembrada):**
1. Se ejecuta `npx supabase db reset && npm run seed` y después el spec. Es lo que pide la cabecera (`:7`) y lo que pide el mensaje del tope (`:137`).
2. «Últimos cobros» pinta `EstadoVacio` («Todavía no hay cobros»), que no tiene ningún `<li>`.
3. `await expect(recientes.getByRole('listitem').first()).toBeVisible()` (`:135`) agota el tiempo, y el paso 4 sale rojo sin haber registrado nada.

El verde de la verificación se apoya en filas de 0,01 € de rondas anteriores en la base compartida. La bitácora recoge la trampa de Suspense, pero no esta.

**Segundo escenario (el tope cuenta lo que no es):** `:136-138` limita las filas de Lucía y no las de la lista (`order fecha desc, registrado_en desc, limit 20`, `datos.ts`). Supongamos que una ejecución del spec el 01-10 dejó una fila L1 y que después se registraron 19 cobros de otros pacientes con fecha 02-10 a 06-10, por ejemplo con pruebas manuales en la base compartida. L1 queda en la posición 20 y `antes = 1`:
- Con el código bueno entra una fila arriba y L1 sale por abajo. El recuento da 1 = `antes`, rojo «el reintento duplicó el cobro».
- Con M20 entran dos filas y salen L1 y otra. El recuento da 2 = `antes + 1`: **verde con el mutante**.

**Qué haría falta:**
- Esperar a la lista o a su estado vacío. Por ejemplo `recientes.getByRole('listitem').or(recientes.getByText('Todavía no hay cobros')).first()`.
- Poner el tope sobre `recientes.getByRole('listitem').count() ≤ 18`, todas las filas. Así ningún `+ 1` ni `+ 2` empuja una fila fuera.

### BAJA

#### B-H3 · `accesibilidad/facturacion.spec.ts:154`: no se comprueba que el primer POST insertó

`await route.fetch()` descarta la respuesta. Si ese POST no inserta, el cliente ve igualmente «No sabemos…» (la respuesta se aborta), el reintento inserta la única fila y el paso queda verde con `antes + 1`. En esa pasada la deduplicación no se ha probado, y M20 sobrevive.

**Escenario:** con `npm run dev`, el primer POST a la acción recién editada devuelve un 500 mientras Turbopack recompila. El paso 4 sale verde sin haber pasado por el 23505.

**Arreglo:** `const r = await route.fetch(); expect(r.status()).toBe(200)`, y que el cuerpo contenga «Cobro registrado».

#### B-H4 · `app/(app)/facturacion/paginacion-pendientes.tsx:38`: la marca se enciende con cualquier clic, también con los que no navegan en esta pestaña, y se queda encendida

El `onClick` del usuario corre siempre antes que la lógica de `Link` (`node_modules/next/dist/client/app-dir/link.js:328`). Con Ctrl, Cmd o Mayúsculas, `linkClicked` deja que el navegador abra otra pestaña (`isModifiedEvent`, `:45-56`), y en la pestaña actual `pagina` no cambia. Lo mismo pasa si la navegación se sustituye por otra antes de llegar. La marca sigue en `true` hasta el siguiente cambio de `pagina` o el siguiente montaje, aunque no venga de un clic.

**Escenario:**
1. El administrador, en la página 2, abre «Siguientes» en otra pestaña con Ctrl+clic.
2. En la pestaña original cambia el selector de profesional. `router.replace` sin `pagina`, con `scroll: false` (`selector-profesional.tsx`).
3. Si el filtro sigue teniendo más de 50 filas, `pagina` pasa de 2 a 1 y el foco salta del selector al rango, al pie de la lista. La página se desplaza aunque `scroll: false` pretendía evitarlo.
4. Con 50 filas o menos, el salto llega al volver a `/facturacion` desde otro módulo: montar «sin clic» mueve el foco, que es lo que la prueba `:82` dice que no pasa.

**Arreglo:**
- Ignorar los clics modificados (`e.metaKey || e.ctrlKey || e.shiftKey || e.altKey`).
- Guardar la página de destino en vez de un booleano y enfocar solo si `pagina` coincide con ella.
- Probarlo con un `fireEvent.click(..., { ctrlKey: true })` seguido de un `rerender` con otra página: el foco no se mueve.

#### B-H5 · `app/(app)/facturacion/page.tsx:36`: si falla la lista de profesionales con un filtro puesto, la página enseña cifras filtradas sin decir que lo están ni ofrecer quitar el filtro [unido a A-H4; no se cuenta aparte]

`AvisoDeError` sustituye al selector, y con él desaparece el único sitio donde se ve el profesional elegido. La métrica, «Por paciente» y «Últimos cobros» siguen filtrados por `profesionalFiltrado` (`bloques.tsx`, `datos.ts`).

**Escenario:** con `/facturacion?profesional=<Ana>` (un marcador, o un enlace compartido) y `profesionales_del_pendiente` caída, el administrador ve «No se ha podido cargar la lista de profesionales» y, debajo, el pendiente de Ana como si fuera el de la clínica, sin ningún control para volver a «todos».

**Arreglo:** cuando `profesionalFiltrado !== null`, usar la `accion` que `AvisoDeError` ya admite para poner un enlace «Ver todos los profesionales» a `/facturacion`. En `page.test.tsx`, el caso `{ ok: false }` con elegido.

### Hallazgos B de la ronda 2

| Id | Estado | Nota |
|---|---|---|
| B-H1 (MEDIA) | **Cerrado** | El `catch` ya no refresca ni navega. Lo prueban `formulario-cobro.test.tsx` y el paso 4.3. Por otra puerta queda un residuo: H1 de esta ronda |
| B-H2 (MEDIA) | **Cerrado** | Selector a 360 px (paso 1), diálogo medido después de los errores y con Motivo (pasos 2 y 3), botón de envío dentro, `+ 1` en vez de «visible», línea del importe en «Por paciente» (4.5). El paso 4 depende de la base: H2 y H3 de esta ronda |
| B-H3 (MEDIA) | **Cerrado** | Hay pruebas de foco para Fecha y para Motivo. Con el mutante de foco fijo en Paciente caen las dos |
| B-H4 (BAJA) | **Cerrado** | Sin `max`. `bloques.test.tsx` usa 999999 y comprueba «Del 101 al 120 de 120» |
| B-H5 (BAJA) | **Cerrado** | `{ ok: false }` y aviso, sin «Todos» falso. Residuo: H5 de esta ronda |
| B-H6 (BAJA) | **Cerrado** en el clic normal | El foco va al rango en los dos sentidos, también al remontar. Residuo: H4 de esta ronda |
| B-H7 (BAJA) | **Cerrado** | El aviso ya no remite a «Últimos cobros». Su texto nuevo promete algo que H1 rompe |
| B-H8 (BAJA) | **Cerrado** | Sin `empty:hidden` en las dos regiones. Las dos pruebas comprueban que la región existe vacía desde el montaje |
