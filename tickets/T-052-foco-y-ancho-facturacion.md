---
id: T-052
titulo: En /facturacion el foco no se va a la factura de al lado y la pantalla no desborda a 360 px
modelo: sonnet
riesgo: medio           # foco y ARIA en una isla de cliente; sin migración, sin RLS, sin acción nueva
fase: 2
prioridad: media        # N1 es el único MEDIA abierto de T-023b; el desborde es latente
depende_de: [T-023b]    # AsignarCobro y la tabla de facturas del espejo
estado: pendiente
delegable: no           # foco: lo hace la fábrica (regla medida en T-007)
territorio:
  - app/(app)/facturacion/asignar-cobro.tsx
  - app/(app)/facturacion/asignar-cobro.test.tsx
  - app/(app)/facturacion/acciones-factura.test.tsx
  - app/(app)/facturacion/bloques.tsx
  - app/(app)/facturacion/page.tsx
  - accesibilidad/facturacion.spec.ts
  - docs/bitacora/T-052.md
  - docs/state.md
---

# Contexto

Este ticket recoge dos hallazgos abiertos de `docs/state.md`. Los dos están en `/facturacion` y ninguno toca la base de datos.

## N1 · El foco salta a la factura de al lado

Es el hallazgo MEDIA de la ronda 2 de la revisión de T-023b. Está en `app/(app)/facturacion/asignar-cobro.tsx:67-69`:

```ts
useEffect(() => {
  if (!disponible && aviso !== '') estado.current?.focus();
}, [disponible, aviso]);
```

El problema es que `disponible` depende del paciente y no de la factura. Viene de `cobrosSinFactura > 0` en `acciones-factura.tsx`, así que todas las filas de facturas del mismo paciente cambian a la vez.

**Cómo falla.** Lucía tiene dos facturas, F1 y F2, y dos cobros sueltos.

1. Se asigna un cobro a F2. F2 guarda su aviso «Cobro asignado» y `disponible` sigue en `true`, porque queda otro cobro suelto.
2. Se asigna el último cobro a F1, y el `revalidatePath` repinta las dos filas con `disponible = false`.
3. Saltan los dos efectos: el de F1, con su aviso nuevo, y el de F2, con el aviso viejo.
4. Gana el último en ejecutarse. El foco puede acabar en la región de estado de F2, y el lector de pantalla anuncia la fila donde no se ha hecho nada.

La prueba H1 de `acciones-factura.test.tsx:29` no lo detecta porque monta una sola fila.

## `min-w-0` · `/facturacion` desborda a 360 px

Los dos hijos de `<div className="grid gap-6 lg:grid-cols-2">` (`app/(app)/facturacion/page.tsx:92`) son `MarcoFacturacion` (`bloques.tsx:43`), y su `Tarjeta` no lleva `min-w-0`.

Un elemento de una rejilla tiene por defecto `min-width: auto`, así que no encoge por debajo del ancho de su contenido. Si una fila trae un contenido ancho que no se parte, la columna crece y la página desborda.

En el diagnóstico de T-046, con la base contaminada, desbordó 64 px. Con `min-width: 0` en los hijos, desapareció.

# Tareas

- [ ] **N1.** Que el foco solo lo mueva la instancia donde acaba de haber un éxito.
  - Al cerrar el diálogo con un éxito, se arma una marca local de esa instancia (por ejemplo, un `useRef<boolean>`).
  - El efecto mueve el foco a la región de estado solo si la marca está armada y el botón ya no está (`!disponible`). Después, apaga la marca.
  - Si sigue `disponible`, la marca se apaga sin mover nada: el foco vuelve al botón como hoy, con el `Dialogo`.
  - El aviso se queda como está. Solo cambia quién mueve el foco.
- [ ] **Prueba de N1**: dos filas hermanas montadas a la vez, con el escenario del contexto. Antes del arreglo tiene que fallar. Se pega la salida contra el `asignar-cobro.tsx` de `main`.
- [ ] **`min-w-0`.** Añadirlo a los hijos de la rejilla.
  - La forma recomendada es en la `Tarjeta` de `MarcoFacturacion`. El tercer marco, el de facturas, está fuera de la rejilla y allí no hace daño.
  - Si el implementador prefiere hacerlo en `page.tsx` (`[&>*]:min-w-0`), vale igual. Lo que cuenta es el criterio.
- [ ] **Prueba de `min-w-0`** en `accesibilidad/facturacion.spec.ts`, a 360 px y como administrador, sobre la base resembrada.
  - Con `page.evaluate`, la prueba mete en el primer elemento de lista de cada uno de los dos marcos de la rejilla un `span` de 600 px con `white-space: nowrap`.
  - Después comprueba que `scrollWidth - clientWidth` de la página es `<= 0`.
  - Así el desborde se reproduce sin depender de cuánta basura tenga la base.
  - Si un marco viene sin filas, el `span` se mete en el contenedor de la `section`.
- [ ] Al cerrar:
  - quitar de `docs/state.md` los dos hallazgos, «T-023b N1» y «`/facturacion` a 360 px»;
  - escribir `docs/bitacora/T-052.md`.

# Criterios de aceptación (verificables)

- [ ] **Automático, N1.** La prueba nueva de dos filas pasa con el arreglo.
  - Con el `asignar-cobro.tsx` de `main` (`git show main:… > …` en una copia temporal, o revirtiendo solo ese fichero), la misma prueba falla, y el fallo dice dónde quedó el foco.
  - Se pegan las dos salidas.
- [ ] **Automático, H1 sigue verde.**
  - `acciones-factura.test.tsx` «al asignar el ÚLTIMO cobro suelto…» pasa sin cambios.
  - Cuando quedan cobros, el foco vuelve al botón y no a la región. Hay una prueba que lo afirma: la que exista o una nueva.
- [ ] **Automático, `min-w-0`.** El paso nuevo del spec pasa con `--workers=1` contra `next start`, sobre `db reset` + `seed`.
  - Sin el arreglo, el mismo paso falla con un desborde mayor que 0. Se pegan las dos salidas.
- [ ] **Automático.** `npm test`, `npm run lint`, `npx next build --webpack` y la suite a11y entera en verde.
  - Si algún spec ajeno ya fallaba en `main`, se dice con su salida.
- [ ] **Automático.** `git diff --stat main -- supabase/ scripts/rls/` vacío.
- [ ] **QA visible (verificador, navegador a la vista).**
  - Como administrador, con un paciente con dos facturas del espejo y dos cobros sueltos, preparado con SQL dentro de la visita.
  - Se asigna uno a cada factura con el teclado. Tras la segunda asignación, el foco queda en la región de estado de la fila donde se actuó.
  - `/facturacion` a 360 px sin barra horizontal.
  - Capturas en `.claude/qa/visitas/T-052/`.
  - `qa.mjs visita /facturacion`.

# Notas para el agente

- Lee `docs/interfaz.md` §Facturación antes de tocar la pantalla. Lee también la regla de `.claude/rules/` que cargue `app/**`.
- La región de estado de `AsignarCobro` (`estado`, `role="status"`, `tabIndex={-1}`) ya existe. No hace falta una región nueva.
- **No cambies `disponible` a algo por factura.** Que el botón desaparezca en todas las filas del paciente es lo correcto: ya no hay nada que asignar a ninguna.
- `MarcoFacturacion` se usa tres veces en `page.tsx` (`:93`, `:98`, `:106`). Comprueba con `rg -n MarcoFacturacion app` que no se usa en ningún otro sitio antes de cambiarle la clase.
- `jsdom` no mide el layout. El desborde solo se prueba en Playwright. Que nadie escriba una unitaria que mire la clase `min-w-0` y la dé por buena.
- El spec deja datos al pasar (`docs/state.md`, «Spec `accesibilidad/facturacion.spec.ts`»). El paso nuevo no inserta nada en la base, solo en el DOM.

# Preguntas abiertas al propietario (con recomendación)

Ninguna. Las dos cosas son arreglos de un comportamiento que ya está decidido.

# Lo que no entra, y por qué

- **`paginacion-pendientes.tsx` `destino`** (variable de módulo compartida). Es otro hallazgo de `state.md` en la misma pantalla, pero es otro componente y otro fallo. Tendrá su propio ticket.
- **T-023 B-H3** (foco en `body` si la lista cae tras un éxito, en `registrar-cobro.tsx`). Es el mismo tipo de fallo en otra isla. Se puede enlazar en la bitácora como patrón, pero no se arregla aquí.
- **Limpiar los datos que deja el spec.** Es su propio hallazgo y toca la siembra.
