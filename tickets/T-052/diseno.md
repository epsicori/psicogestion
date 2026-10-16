# T-052 · Diseño (riesgo medio, corto)

Foco de `AsignarCobro` en la fila donde se actuó (N1) y `min-w-0` en la rejilla de `/facturacion`.
Sin base de datos, sin acción nueva y sin migración.

## 0 · Hechos verificados contra el código

- `app/(app)/facturacion/asignar-cobro.tsx:67-69`: el efecto `[disponible, aviso]` enfoca `estado` si
  `!disponible && aviso !== ''`. No sabe si el aviso es de ahora o de hace dos asignaciones.
- `asignar-cobro.tsx:110-113`: el éxito (`cobroAsignado` o `cobroYaEstaba`) hace `setAbierto(false)` y luego
  `setAviso(mensaje)`. `abrir()` (`:75-94`) pone `setAviso('')`.
- `asignar-cobro.tsx:130-141`: el `Button` disparador no lleva `ref`. `components/ui/button.tsx` pasa `...props`
  al `<button>`, y en React 19 `ref` es una prop más. Hay precedentes:
  `app/(app)/agenda/nueva/formulario-alta.tsx:615` y `app/(app)/pacientes/[id]/historia/notas/dialogo-de-copia.tsx:376`.
- `components/ui/foco.ts`, `useDevolucionDeFoco`: guarda `document.activeElement` al abrir y le hace `.focus()` en
  la limpieza del efecto pasivo, al cerrar. Si el elemento guardado ya no está en el DOM, ese `focus()` no hace nada
  y el foco queda en `body`.
- `components/ui/dialogo.tsx`: se pinta en línea, sin portal, como hermano del botón y de la región dentro del
  fragmento de `AsignarCobro`. Al abrirse enfoca el primer enfocable del panel, que es la «X».
- `app/(app)/facturacion/acciones-factura.tsx:25`: `disponible={cobrosSinFactura > 0}`. Es por paciente: todas las
  filas del mismo paciente cambian en el mismo repintado.
- React ejecuta los efectos pasivos de hermanos en orden de árbol. Con dos filas que disparan el efecto en el mismo
  commit, gana la que va **después** en el DOM. Por eso la prueba debe poner la fila del aviso viejo detrás de la
  fila donde se actúa.
- jsdom 29.1.1, `node_modules/jsdom/lib/jsdom/living/nodes/HTMLOrSVGElement-impl.js:71-72`: `focus()` dispara
  `focus` y `focusin` (`bubbles: true`). Un `focusin` en `document` se puede probar en `npm test`.
- `app/(app)/facturacion/acciones-factura.test.tsx` no tiene `beforeEach`. H1 (`:29-63`) monta una sola fila, le da
  foco al disparador antes del clic y repinta con `cobrosSinFactura={0}` en un `act` aparte, **después** del commit
  del éxito, cuando `disponible` todavía es `true`.
- `rg -n MarcoFacturacion app` devuelve solo `bloques.tsx:43` (la definición) y `page.tsx:93`, `:98` y `:106`. No se
  usa en ningún otro sitio. `Tarjeta` (`components/ui/piezas.tsx:9`) es compartida y está fuera del territorio, así
  que no se toca.
- `page.tsx:92`: `grid gap-6 lg:grid-cols-2`. A 360 px no hay `grid-template-columns`, y la columna implícita es
  `auto`. El tercer marco (`:106`) es hijo de un `flex flex-col`. En el eje cruzado no hay mínimo automático, así que
  `min-w-0` allí no cambia nada.
- `page.test.tsx:97` busca la rejilla por `className.includes('lg:grid-cols-2')`. No mira la clase de los marcos.
- `components/armazon/armazon-cliente.tsx:103-124`: entre la página y `<html>` ningún antecesor recorta
  (`section.min-w-0.flex-1`, sin `overflow`). Lo que desborde por fuera de la tarjeta, aunque sea con
  `overflow: visible`, suma al `scrollWidth` del documento. Ver D4.
- `MarcoFacturacion` pinta `<section aria-labelledby={id}>`. Las dos de la rejilla son
  `section[aria-labelledby="facturacion-pendientes"]` («Por paciente», `es.ts:1467`) y
  `section[aria-labelledby="facturacion-cobros"]` («Últimos cobros», `es.ts:1483`). Mientras cargan llevan
  `Cargando` (`piezas.tsx:245`), que es `role="status"` con `aria-label="Cargando"`.
- `accesibilidad/facturacion.spec.ts`:
  - es `mode: 'serial'` y su `beforeAll` inserta dos facturas y dos cobros en cada ejecución, también con `-g`;
  - `entrar()` deja la ventana a 360 × 740 como administrador;
  - el último paso es el `10`.
- `playwright.config.ts:58,72`: `webServer` es `npm run start` con `reuseExistingServer` fuera de CI. Un servidor
  viejo en el puerto se reutiliza con el build viejo.

## 1 · Piezas y contratos

### 1.1 `app/(app)/facturacion/asignar-cobro.tsx` (N1)

Dos refs nuevas y un efecto nuevo. Se sustituye el efecto de `:65-69`. Nada más cambia: ni props, ni textos, ni el
`Dialogo`, ni `disponible`.

```ts
const disparador = useRef<HTMLButtonElement>(null);
// Marca de ESTA instancia: se arma con un éxito suyo; se gasta al mover el foco a la región, o se
// apaga en cuanto el foco va a cualquier sitio que no sea su botón o su región (el usuario ya está en otra cosa).
const focoTrasExito = useRef(false);
```

- **Dónde se arma.** En `enviar`, rama de éxito (`:110`), como **primera** línea, antes de `setAbierto(false)` y de
  `setAviso(...)`: `focoTrasExito.current = true;`. No se arma en ningún otro sitio.
- **Dónde se apaga (1), al abrir.** Primera línea de `abrir()`: `focoTrasExito.current = false;`.
- **Dónde se apaga (2), al ir el foco a otra parte.** Un efecto montado una vez (`[]`) escucha `focusin` en
  `document`:
  ```ts
  useEffect(() => {
    function alEnfocar(evento: FocusEvent) {
      if (!focoTrasExito.current) return;
      if (evento.target === disparador.current || evento.target === estado.current) return;
      focoTrasExito.current = false;
    }
    document.addEventListener('focusin', alEnfocar);
    return () => document.removeEventListener('focusin', alEnfocar);
  }, []);
  ```
- **Dónde se gasta: el efecto que mueve el foco.** Sustituye al de `:67-69`, con las mismas dependencias:
  ```ts
  useEffect(() => {
    if (!focoTrasExito.current || disponible || aviso === '') return;
    focoTrasExito.current = false;
    estado.current?.focus();
  }, [disponible, aviso]);
  ```
  - Con `disponible === true` **no** se apaga. Esta es la desviación D1.
- **El disparador.** `<Button ref={disparador} ...>` (`:131`), con el resto igual.
- **El comentario de `:65-66`.** Se reescribe en dos líneas. El foco a la región lo mueve solo la instancia con un
  éxito propio cuyo foco no se ha ido a otra parte, y la razón es N1 de T-023b.

**Cómo interactúa con el `Dialogo` y con `disponible`, caso por caso.**

| Orden real de los commits | Qué pasa |
|---|---|
| **B**: éxito primero (`disponible` sigue `true`), repintado del servidor después (es el de H1) | Éxito: se arma la marca; el `Dialogo` devuelve el foco al disparador, hay `focusin` sobre `disparador` y la marca sigue. El efecto no hace nada porque `disponible` es `true`. Repintado con `false`: el botón se va y el foco cae a `body` sin `focusin`. El efecto ve la marca y `!disponible`, apaga la marca y enfoca la región. |
| **A**: éxito y repintado en el mismo commit | El botón se va con el foco dentro del panel. Al desmontarse el panel no hay `focusin`, y el `focus()` de la devolución cae sobre un nodo suelto. El efecto ve la marca y `!disponible`, y enfoca la región. |
| **C**: repintado primero (el botón se va con el diálogo abierto), éxito después | La marca se arma con el éxito. El efecto salta porque cambia `aviso` y enfoca la región. Por eso `aviso` sigue entre las dependencias. |
| **Quedan cobros** (`disponible` siempre `true`) | La marca queda armada mientras el foco siga en el disparador, y el foco está ahí, devuelto por el `Dialogo`, como hoy. En cuanto el usuario va a otro control hay `focusin` ajeno y la marca se apaga. |
| **Fila hermana con aviso viejo** (N1) | F2 se armó en su éxito. El usuario va a F1 con el teclado o el ratón: hay `focusin` sobre el botón de F1, o sobre la «X» del diálogo de F1 si el clic no enfoca (Safari), y F2 se apaga. En el repintado final solo F1 tiene la marca. |

### 1.2 `app/(app)/facturacion/bloques.tsx` (`min-w-0`)

- `:45` `<Tarjeta className="p-5">` pasa a `<Tarjeta className="min-w-0 p-5">`, con un comentario de una línea
  encima. Hijo de rejilla: sin `min-w-0` no encoge por debajo de su contenido y la página desborda a 360 px
  (T-052). En el tercer marco no hace efecto.
- `page.tsx` **no se toca**, aunque esté en el territorio.

### 1.3 Pruebas unitarias

**`app/(app)/facturacion/acciones-factura.test.tsx`: el `describe` nuevo de N1, la prueba que decide.**

Va en un `describe('AccionesDeFactura · dos facturas del mismo paciente (T-052 N1)')` **aparte**, después del
existente. Lleva su propio `beforeEach` con `cargarCobrosAsignables.mockReset(); asignarCobroAFactura.mockReset();`.
El `describe` de H1 no se toca, ni una línea.

- Datos:
  - `F1 = { id: 'f…0001', numero: 'F-2026-0001', pacienteId: 'p1', paciente: 'Márquez, Lucía' }` y `F2` igual con
    `…0002` y `'F-2026-0002'`;
  - `COBRO_A` y `COBRO_B` con la forma del H1 (ids `…0a` y `…0b`).
- Montaje: un componente local `Filas({ n, orden })` que pinta, en el orden de `orden`, un
  `<div data-testid={`fila-${numero}`} key={numero}>` con su `AccionesDeFactura` (`cobrosSinFactura={n}`,
  `zona="Europe/Madrid"`, `hoy="2026-10-16"`). Las `key` estables evitan remontar en `rerender`.
- Ayudante `dondeEstaElFoco(): string`:
  - devuelve `'región de F1'` o `'región de F2'` si `document.activeElement` es un `[role="status"]` dentro de
    esa fila;
  - `'botón de F1'` o `'botón de F2'` si es su disparador de asignar;
  - `'body'` si es `document.body`;
  - si no, `tagName`.

  Es lo que hace que el fallo diga dónde quedó el foco.
- `it.each` con dos órdenes: `['F1 antes que F2', ['F1', 'F2']]` y `['F2 antes que F1', ['F2', 'F1']]`. **El primero
  es el que discrimina**: en `main`, el efecto de F2 corre el último y se lleva el foco. El segundo blinda el arreglo
  contra cualquier dependencia del orden.
- La secuencia exacta de `rerender`:
  1. `cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A, COBRO_B], hayMas: false })`;
     `asignarCobroAFactura.mockResolvedValue({ mensaje: t('cobros.facturas.cobroAsignado') })`.
     `const { rerender } = render(<Filas n={2} orden={orden} />)`.
  2. **Paso 1, asignar a F2.**
     - `botonF2.focus()`.
     - `await act(async () => fireEvent.click(botonF2))`.
     - `fireEvent.change(getByLabelText(t('cobros.facturas.cobro')), { target: { value: COBRO_B.id } })`.
     - `await act(async () => fireEvent.submit(…closest('form')!))`.
     - `await waitFor(() => expect(queryByRole('dialog')).toBeNull())`.
  3. `await act(async () => rerender(<Filas n={1} orden={orden} />))`: el servidor repinta y queda un cobro.
     - `expect(dondeEstaElFoco()).toBe('botón de F2')`. Esto **cierra la segunda mitad del CA2**: si quedan cobros,
       el foco vuelve al botón y no a la región.
     - La región de F2 contiene `cobroAsignado`.
  4. `cargarCobrosAsignables.mockResolvedValue({ ok: true, cobros: [COBRO_A], hayMas: false })`.
     **Paso 2, asignar a F1**: `botonF1.focus()`, clic, `change` a `COBRO_A.id`, `submit` y `waitFor` sin diálogo.
     `expect(dondeEstaElFoco()).toBe('botón de F1')`.
  5. `await act(async () => rerender(<Filas n={0} orden={orden} />))`: el último cobro suelto se ha ido.
     - `queryByRole('button', { name: asignarDeFactura F1 })` y el de F2 son `null`.
     - **`expect(dondeEstaElFoco()).toBe('región de F1')`**.
     - La región de F2 **sigue** diciendo `cobroAsignado`: el aviso no se toca.
- Nada de `mockResolvedValueOnce`: la lista de cobros se fija antes de cada apertura con `mockResolvedValue`.

**`app/(app)/facturacion/asignar-cobro.test.tsx`: una guarda del caso C.** No falla en `main`; existe para matar
una mutación concreta.

- `it('si el botón se va con el diálogo abierto y luego llega el éxito, el foco va a la región (T-052, caso C)')`.
- `const { rerender } = render(<AsignarCobro factura={FACTURA} zona="Europe/Madrid" />)`; foco al disparador; clic;
  elegir `COBRO_A`. `asignarCobroAFactura.mockReturnValue(new Promise((r) => (resolver = r)))`; enviar.
- `await act(async () => rerender(<AsignarCobro … disponible={false} />))`: el diálogo sigue abierto.
- `await act(async () => resolver({ mensaje: t('cobros.facturas.cobroAsignado') }))`.
- `queryByRole('dialog')` es `null`, y `document.activeElement` es `getByRole('status')`.
- La mutación que mata es quitar `aviso` de las dependencias del efecto. Los dos casos del `it.each` siguen verdes
  sin `aviso`, porque en los dos el último cambio es de `disponible`.

### 1.4 `accesibilidad/facturacion.spec.ts`: el paso nuevo

Se añade al final, como `test('11 · a 360 px, contenido ancho en «Por paciente» y «Últimos cobros» no desborda la página (min-w-0)', …)`.
No escribe en la base. La cabecera del fichero añade una línea con el paso 11 y T-052.

```ts
await entrar(page);
const marcos = ['facturacion-pendientes', 'facturacion-cobros'];
for (const id of marcos) {
  const marco = page.locator(`section[aria-labelledby="${id}"]`);
  await expect(marco).toBeVisible();
  // Sin esqueleto: se inyecta en el contenido real, no en el `Cargando` que el Suspense va a sustituir.
  await expect(marco.getByRole('status', { name: 'Cargando' })).toHaveCount(0);
}
const medida = await page.evaluate((ids) => {
  let insertados = 0;
  let anchoRelleno = 0;
  for (const id of ids) {
    const seccion = document.querySelector(`section[aria-labelledby="${id}"]`);
    if (!seccion) continue;
    const destino = seccion.querySelector('li') ?? seccion;
    // Imita `truncate`: bloque que recorta y no parte. Su contenido mínimo es de 600 px.
    const envoltura = document.createElement('span');
    envoltura.dataset.t052 = 'ancho';
    envoltura.style.cssText = 'display:block;overflow:hidden;white-space:nowrap';
    const relleno = document.createElement('span');
    relleno.style.cssText = 'display:inline-block;width:600px';
    relleno.textContent = ' ';
    envoltura.append(relleno);
    destino.append(envoltura);
    anchoRelleno = Math.max(anchoRelleno, relleno.getBoundingClientRect().width);
    insertados += 1;
  }
  return {
    insertados,
    anchoRelleno,
    desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}, marcos);
expect(medida.insertados, 'no se encontró uno de los dos marcos de la rejilla').toBe(2);
expect(medida.anchoRelleno, 'el contenido inyectado no mide 600 px: la prueba no prueba nada').toBe(600);
expect(medida.desborde, 'la página se sale a lo ancho a 360 px con contenido ancho en la rejilla').toBeLessThanOrEqual(0);
```

- **Selector de los dos marcos**: `section[aria-labelledby="facturacion-pendientes"]` y
  `section[aria-labelledby="facturacion-cobros"]`. Son los `id` que `page.tsx:93,98` pasa a `MarcoFacturacion`, no
  dependen del texto y dejan fuera a propósito `facturacion-facturas`.
- **Dónde va el `span`**: en el primer `li` del marco o, si no hay filas, en la `section`. «Últimos cobros» recién
  sembrado está vacío (`facturacion.spec.ts:16`) y cae en la `section`.
- **Inyección y medida en el mismo `evaluate`**: leer `scrollWidth` fuerza el layout síncrono con el nodo ya dentro.
  Así no queda hueco para que una hidratación o un streaming tardío retire el nodo entre una cosa y otra.

## 2 · Decisiones y alternativas descartadas

- **D1. La marca no se apaga cuando `disponible` sigue en `true`.** El contrato lo sugiere («si sigue `disponible`, la
  marca se apaga»), pero rompe H1. En el orden B, el commit del éxito llega con `disponible = true`: la marca se
  apagaría ahí y, en el repintado con `false`, nadie movería el foco. Iría a `body`, que es justo lo que H1 prohíbe.
  El CA2 manda que H1 pase sin cambios, y ese criterio gana. La marca se apaga en tres sitios: al gastarse, al abrir
  y con un `focusin` ajeno.
- **D2. El `focusin` en `document` es lo que apaga la marca vieja.** Un repintado con `disponible` todavía en `true`
  no cambia ninguna prop, así que el efecto no corre y no hay otro sitio donde apagarla. Lo que sí marca que el
  usuario está en otra cosa es que el foco se va. Descartadas:
  - `onBlur` del disparador: si el navegador lanza `blur` o `focusout` al quitar el botón enfocado, la marca de la
    propia fila se apagaría antes del efecto;
  - mirar en el efecto si el foco está en `body`: depende del orden de los hermanos, y la fila del aviso viejo, si va
    primero, se lleva igual el foco;
  - una variable de módulo «último éxito»: es el mismo defecto abierto en `paginacion-pendientes.tsx`;
  - mirar en la limpieza del `ref` del botón si tenía el foco: falla el orden A, porque el foco está dentro del panel.
- **D3. `min-w-0` va en `MarcoFacturacion` (`bloques.tsx:45`), no en `page.tsx`.**
  - `MarcoFacturacion` solo se usa en los tres sitios de `page.tsx`, y en el tercero no hace efecto.
  - El esqueleto y el bloque comparten el mismo marco, así que el arreglo vale también mientras carga.
  - `Tarjeta` es compartida y está fuera del territorio.
- **D4. El `span` inyectado es un bloque que recorta, con 600 px de contenido mínimo. No es un `span` en línea de
  600 px con `overflow: visible`.** Ningún antecesor de la página recorta (`armazon-cliente.tsx:103-124`). Un `span`
  visible de 600 px se saldría por la tarjeta y haría crecer el `scrollWidth` del documento **con o sin `min-w-0`**.
  El paso quedaría en rojo con el arreglo y no distinguiría nada. El contenido que desbordó de verdad en T-046 es de
  dos clases que encogen cuando el marco les deja: `truncate` (`bloques.tsx:191`, `FilaConAvatar`) y `break-words`.
  El bloque con `overflow: hidden` y `nowrap` imita `truncate`. Conserva el «600 px» y el «`nowrap`» del contrato y
  cambia solo dónde se recorta.
- **D5. La prueba de N1 va en `acciones-factura.test.tsx`, no en `asignar-cobro.test.tsx`.** Allí `disponible` sale
  de `cobrosSinFactura`, que es por paciente, como en la app. Además es el fichero de H1, y el fallo de N1 es
  precisamente que H1 monta una sola fila.
- **D6. Las dos órdenes de filas van en `it.each`.** Solo `[F1, F2]` falla en `main`. `[F2, F1]` impide que el
  arreglo dependa del orden del DOM, que es la forma en que una corrección a medias pasaría la primera.

## 3 · Cómo se cierra cada criterio de aceptación

| CA | Comprobación |
|---|---|
| **N1 pasa con el arreglo y falla con `main`** | Con el arreglo: `npx vitest run "app/(app)/facturacion/acciones-factura.test.tsx"`, con los dos casos del `it.each` en verde. Contra `main`, con el arreglo ya en un commit: `git checkout main -- "app/(app)/facturacion/asignar-cobro.tsx"`, después el mismo comando y después `git checkout HEAD -- "app/(app)/facturacion/asignar-cobro.tsx"`. Se espera que falle **solo** `F1 antes que F2`, con `Expected: "región de F1"` y `Received: "región de F2"`. Si falla en otro paso o con otro texto, la prueba no prueba N1. Se pegan las dos salidas y, al final, `git diff --stat main -- "app/(app)/facturacion/asignar-cobro.tsx"` para mostrar que el arreglo ha vuelto. |
| **H1 sigue verde; si quedan cobros, el foco va al botón** | `git diff main -- "app/(app)/facturacion/acciones-factura.test.tsx"` solo añade líneas después de la `:74` (el `describe` nuevo); las `:1-74` no cambian. El mismo `vitest run` deja verde «al asignar el ÚLTIMO cobro suelto…». La segunda mitad la afirman dos pruebas: el paso 3 del `it.each` (`'botón de F2'` con `n=1`) y la existente `asignar-cobro.test.tsx:131` (`activeElement` igual al botón). |
| **`min-w-0` en Playwright, verde con arreglo y rojo sin él** | Sobre `npx supabase db reset && npm run seed`. Con el arreglo: `npx next build --webpack`, se para cualquier `next start` del puerto (por `reuseExistingServer`) y se lanza `npx playwright test accesibilidad/facturacion.spec.ts --workers=1 -g "11 ·"`. Sin él: `git checkout main -- "app/(app)/facturacion/bloques.tsx"`, otra vez el build, se para el servidor y el mismo comando. Debe fallar en la última aserción con un `desborde` mayor que 0, del orden de 300 px. Si falla en `insertados` o en `anchoRelleno`, no vale. Después, `git checkout HEAD -- "app/(app)/facturacion/bloques.tsx"` y un build nuevo. Se pegan las dos salidas. |
| **`npm test`, lint, build y la suite a11y entera** | `npm test`, `npm run lint` y `npx next build --webpack`. Después, `npx supabase db reset && npm run seed`, un servidor nuevo y `npx playwright test --workers=1`. Las dos pasadas del `-g` anterior insertan filas por el `beforeAll`, y por eso se resiembra antes de la suite entera. Si un spec ajeno ya fallaba en `main` (los de `state.md`, «Suite a11y en frío»), se pega su salida en `main`. |
| **Sin base** | `git diff --stat main -- supabase/ scripts/rls/` vacío. |
| **QA visible** | El verificador prepara con SQL, dentro de la visita, un paciente con dos facturas del espejo y dos cobros sueltos (el patrón del `beforeAll` del spec, dos veces). Asigna con el teclado un cobro a F2 y otro a F1, en este orden y con F1 encima en la lista. Captura el foco en la región de F1. Después pone `/facturacion` a 360 px y comprueba que no hay barra horizontal. Las capturas van en `.claude/qa/visitas/T-052/` (`qa.mjs visita /facturacion`). |

## 4 · Riesgos, por probabilidad

1. **Media.** Que el implementador apague la marca cuando `disponible` sigue en `true`, porque lo dice el contrato.
   H1 se pondría en rojo; D1 lo explica y la sección 5 lo pide revisar.
2. **Media.** Que la prueba Playwright pase sin el arreglo porque el `span` cayó en un esqueleto o en un nodo que
   luego se sustituyó. Lo impiden la espera de `Cargando` con cuenta 0, la inyección y la medida en el mismo
   `evaluate`, y las aserciones de `insertados` y `anchoRelleno`.
3. **Baja.** Un servidor `next start` viejo reutilizado por `reuseExistingServer` haría que la pasada «sin arreglo»
   midiera el build con arreglo, o al revés. Se para el servidor entre las dos pasadas.
4. **Baja.** Otro elemento enfocable dentro de la fila que reciba el foco tras el éxito (por ejemplo, el «Registrar
   cobro» de la misma fila) apaga la marca. Es correcto: el usuario se ha ido. No es un bug.
5. **Baja.** El paso 8 del spec (H1 en navegador real) es el que vigila los órdenes A y C en Chrome. Si se pone rojo,
   el diseño de la marca está mal, no la prueba.

## 5 · Qué revisar

- [ ] `focoTrasExito.current = true` aparece **una sola vez**, en la rama de éxito de `enviar` y antes de
  `setAbierto(false)`. No está en `catch`, ni en la rama de rechazo, ni en `alCerrar`.
- [ ] El efecto que enfoca exige marca y `!disponible` y `aviso !== ''`, y apaga la marca **antes** de `focus()`.
  Con `disponible === true` no la apaga (D1). Si la apaga, H1 tiene que estar rojo. Compruébalo con el revisor
  quitando la condición.
- [ ] Dependencias del efecto: `[disponible, aviso]`. Sin `aviso`, la guarda del caso C de `asignar-cobro.test.tsx`
  debe ponerse roja. Compruébalo.
- [ ] El `focusin` exceptúa **exactamente** `disparador.current` y `estado.current`.
  - Si no exceptúa el disparador, H1 se pone rojo: la devolución de foco del `Dialogo` apaga la marca.
  - Si no hay `focusin`, el caso `F1 antes que F2` se pone rojo, porque F2 conserva la marca vieja.
  - Prueba las dos mutaciones.
- [ ] El oyente se registra con `[]` y se quita en la limpieza. No hay oyentes que se acumulen por cada repintado.
- [ ] `abrir()` apaga la marca en su primera línea.
- [ ] `disponible` sigue siendo `cobrosSinFactura > 0` (`acciones-factura.tsx` sin tocar), y el botón desaparece en
  todas las filas del paciente.
- [ ] El texto y la permanencia del aviso no cambian. Tras el paso 5 del `it.each`, la región de F2 sigue diciendo
  «Cobro asignado a la factura».
- [ ] La salida contra `main` falla en `F1 antes que F2`, en la aserción de `dondeEstaElFoco()` del paso 5, con
  «región de F2». Si falla antes (por ejemplo, al buscar el botón), está fallando por el motivo equivocado.
- [ ] `F2 antes que F1` está verde en `main` y con el arreglo. Si está rojo en `main`, la prueba mide otra cosa.
- [ ] En `acciones-factura.test.tsx`, `git diff` no toca las líneas 1-74. El `beforeEach` nuevo vive dentro del
  `describe` nuevo.
- [ ] `bloques.tsx`: el único cambio de clase es `min-w-0` en la `Tarjeta` de `MarcoFacturacion`. `Tarjeta`
  (`components/ui/piezas.tsx`) no se ha tocado.
- [ ] Nadie ha escrito una unitaria que mire la clase `min-w-0` y la dé por buena (contrato, notas).
- [ ] Spec, paso 11:
  - selectores por `aria-labelledby`, con los dos `id` de la rejilla y no `facturacion-facturas`;
  - espera a que desaparezca `Cargando`;
  - inyección y medida en un solo `evaluate`;
  - aserciones de `insertados === 2` y `anchoRelleno === 600` antes de la del desborde;
  - ningún `ejecutarSql` nuevo.
- [ ] Salida sin el arreglo: falla en la aserción del desborde, con un valor mayor que 0. No falla en las de control.
- [ ] `git diff --stat main -- supabase/ scripts/rls/` vacío, y `page.tsx` sin cambios.
- [ ] `docs/state.md`: desaparecen «T-023b N1» y «`/facturacion` a 360 px», y no se añade historia.
  `docs/bitacora/T-052.md` enlaza T-023 B-H3 como el mismo patrón.

## 6 · Territorio

Lo declara el contrato. De él, este diseño escribe:

- `app/(app)/facturacion/asignar-cobro.tsx`
- `app/(app)/facturacion/asignar-cobro.test.tsx`
- `app/(app)/facturacion/acciones-factura.test.tsx`
- `app/(app)/facturacion/bloques.tsx`
- `accesibilidad/facturacion.spec.ts`
- `docs/bitacora/T-052.md`
- `docs/state.md`

`app/(app)/facturacion/page.tsx` está en el territorio y no se toca (D3).

## 7 · Delegable

No aplica: el contrato dice `delegable: no`.

## Lo que no entra, y por qué

- **`paginacion-pendientes.tsx` `destino`** y **T-023 B-H3** (`registrar-cobro.tsx`): son otras islas y otros fallos.
  El contrato los excluye. B-H3 se nombra en la bitácora como el mismo patrón.
- **La marca de foco como hook compartido en `components/ui/`**: hoy solo hay un usuario, y `components/ui/` está
  fuera del territorio. Si B-H3 pide lo mismo, se extrae entonces.
- **Que el spec deje de dejar datos**: es un hallazgo propio y toca la siembra.
- **`min-w-0` en `Tarjeta` para todas las pantallas**: es otro alcance, y cambiaría la disposición de pantallas que
  no se han medido.
