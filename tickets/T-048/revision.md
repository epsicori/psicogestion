Sin hallazgos ALTA. 0 MEDIA, 1 BAJA.

# Revisión T-048 · ronda 4 · Documentación pendiente agrupada por paciente

- **Rama**: `T-048-documentacion-pendiente-agrupada`, HEAD `63dd69e`, worktree
  `.claude/worktrees/agent-a499e90fb57374002` (árbol limpio).
- **Diff de la ronda**: `git diff a65dfd1 63dd69e`, 6 ficheros. En producción solo cambia
  `app/(app)/agenda/resolver-alerta.tsx`.
- **Territorio**: `node ~/.claude/pipeline/territorio.mjs T-048` da «30 fichero(s) tocado(s), todos
  dentro».
- **Sin cambios, como pide R4.6.10**: `git diff a65dfd1 63dd69e` de `buscador.tsx`,
  `documentacion.tsx` y `documentacion/layout.tsx` sale vacío.
- **Cómo se ha medido**:
  - En una copia de `63dd69e` (`git archive` en el scratchpad, con una unión a `node_modules`), sin
    tocar el worktree. Las sustituciones respetan el CRLF de cada fichero.
  - Línea base de `app/(app)/agenda`: 54 ficheros y 619 pruebas en verde.
  - Los tres ficheros del ticket, seis veces seguidas: 58/58 en las seis.
  - `eslint` sobre los cuatro ficheros cambiados: limpio. `tsc --noEmit` no da errores en ellos.
  - No se ha tocado la base.

## Hallazgos de la ronda 3

| Id | Estado | Evidencia medida |
|---|---|---|
| R3-H1 | **Cerrado** | Ver la sección «R3-H1» de abajo. |
| R3-H2 | **Cerrado** | Ver la sección «R3-H2» de abajo. |
| R3-H3 | **Cerrado** | Ver la sección «R3-H3» de abajo. |

### R3-H1

**«Rojo antes».** Las cuatro pruebas nuevas, P1, P2 y P3 ×2, caen con el `resolver-alerta.tsx` de
`a65dfd1` en su sitio, y con el foco donde lo describí en la ronda 3:

| Prueba | Dónde acaba el foco en `a65dfd1` |
|---|---|
| P1 | `documentacion-titulo` |
| P2 | `busqueda-paciente-p2` |
| P3, panel | `panel-paciente-pB` |
| P3, layout | `panel-paciente-pB` |

**Mutantes**, uno a uno, sobre los tres ficheros:

| Mutante | Qué cae |
|---|---|
| M1 · sin comparar la época en `anotar` | P1, P2 y P3 ×2 (4) |
| M2 · `preparar()` llamado tras el `await` | 4 |
| M3 · sin `epocaRef.current += 1` | 4 |
| M6 · sin el `useLayoutEffect` | P3 ×2 y la prueba de Activity existente (3) |
| M8 · `alAcertar` condicionado a la época | 4, por sus señales |
| M4 · `limpiar` sin `descartar` | Las dos pruebas de «Limpiar» |
| M5 · `enviar` sin `descartar` | P2 y el gemelo de «Buscar» |
| `relanzar` que también descarta | `remontaje.test.tsx`, caso 1 |

El último mutante protege la decisión de que `relanzar` no descarta.

**Leído en el código**:

- `preparar()` es la primera línea de la acción (`:225`), antes del `try` y del `await`.
- La época es un `useRef` (`:104`), y `descartar` la sube antes del `setPendiente(null)` (`:111-114`).
- `alAcertar` se llama siempre (`:198`).
- Concurrencia (R4.6.6):
  - Con dos envíos y un descarte entre medias, los dos llevan una época vieja y se ignoran.
  - Sin descarte, gana el último `anotar`.
  - Sin bloque, `confirmar` es `undefined`.

**Puertas.** Fuera de las pruebas, `descartar(` y `useDescartarResolucion` solo aparecen en
`buscador.tsx:80` y `:96` y en `resolver-alerta.tsx:122`.

**Caminos que siguen bien con la época.** He repasado los caminos que no deben descartar:

- La redirección de `?pagina`: el layout sobrevive y `BuscadorInterno` se remonta sin descartar.
  Lo cubre `remontaje.test.tsx`, que sigue verde.
- El orden real en Next: la navegación se entrelaza con la acción en vuelo, y entonces el `anotar`
  entra antes de que Activity oculte la ruta. Aun así, la limpieza del `useLayoutEffect` tira ese
  pendiente al confirmarse la navegación, y es el camino de la prueba de Activity existente.

### R3-H2

- **Lo que queda en el código**: `ultimoCerrado` ha desaparecido, `cerrar(texto)` no lleva guarda y
  `ContextoMemoria` ya no se exporta (`:88`). `rg` de `ultimoCerrado`, `alResolver` e
  «idempotente» en `app/(app)/agenda` no devuelve nada, aparte de dos parámetros `alResolver`
  ajenos en otros tests.
- **La prueba nueva de StrictMode** remonta por `key`, cuenta los focos (≥ 2) y los `SPAN`
  insertados (1), restaura el espía y el observador en `finally`, y dice en un comentario que no
  prueba ninguna guarda.
- **Mutantes del arnés**:

  | Mutante | Resultado |
  |---|---|
  | Sin `<StrictMode>` | Cae: «expected 1 to be greater than or equal to 2» |
  | `rerender` con la misma `key` | Cae igual |

  La prueba no puede degenerar en silencio.

### R3-H3

- `diferido(alSoltar)` y un `afterEach` en el nivel del módulo en los tres ficheros.
- En los tres, `grep` no encuentra ninguna promesa que se suelte solo en la última línea.
- Con M4, en el fichero entero caen solo las dos pruebas de «Limpiar», sin ningún tiempo agotado.
  En la ronda 3 caía también el gemelo de «Buscar».

### Otros puntos

- El comentario del spec dice «12 informes» (`:174`).
- `rg "11 informes"` no devuelve nada.

## BAJA

### R4-H1 · El patrón de las promesas sin soltar fuera de T-048 no llega a `docs/state.md`

- **Dónde**:
  - `docs/bitacora/T-048.md:45`: es el único sitio donde consta.
  - `docs/state.md` §«Hallazgos anotados»: no aparece, ni en la rama ni en `main`.
- **Qué pasa**:
  - El diseño (`diseno.md:1758`, «Lo que no entra») dice: «Va a `docs/state.md` §Hallazgos como
    patrón para el revisor». R4.8 incluye `docs/state.md` entre los ficheros que se tocan.
  - El implementador lo dejó en la bitácora, como «Hallazgo para el revisor». `grep` de
    `calendario`, `zona-por-confirmar` y `dialogo-reprogramar` en los dos `state.md` no devuelve
    nada.
  - La regla 2 de la constitución manda que lo que queda fuera del ticket se anote en `state.md`.
    La bitácora de un ticket cerrado no la lee nadie al empezar el siguiente (regla 4: las
    primeras 80 líneas de `state.md`).
- **Escenario de fallo**:
  1. Un ticket futuro toca `dialogo-reprogramar.test.tsx` (`new Promise(() => {})` en `:150` y
     `:318`) o `calendario.test.tsx`, y mide mutantes.
  2. La prueba que suelta al final cae antes de soltar, y la siguiente cae por tiempo agotado. Es
     lo que medí en la ronda 3: 1256 ms y una muerte atribuida a la prueba equivocada.
  3. Ni el implementador ni el revisor de ese ticket tienen la pista, porque solo está en la
     bitácora de T-048.
- **Qué falta**: una línea en `state.md` §«Hallazgos anotados» con los tres ficheros y el
  arreglo, es decir, `afterEach` con la suelta, como en T-048.

## Lo que se miró y está bien

- **Prueba P2** (R4.7.1): su orden de llegada es estable, con seis pasadas verdes.
- **El camino sin bloque** (`confirmar === undefined`): ninguna prueba lo ejercita. El mutante
  `bloque!.preparar()` sale 619/619. No lo cuento como hallazgo:
  - las tres llamadas de producción a `FilaPaciente`, que es quien pinta `ResolverAlerta`, están
    dentro de un `ProveedorResolucion` (`buscador.tsx:187`, `contenido.tsx:132` y
    `documentacion.tsx:113`), así que hoy no hay escenario de fallo;
  - en `a65dfd1` el camino era el mismo (`bloque?.alResolver`).
- **Silencio tras un descarte**: el acierto que llega tras «Limpiar», «Buscar» o una salida de la
  ruta no se anuncia, y la alerta desaparece en silencio. Es la decisión de R4.2 c), que exige
  «región vacía» en P1, P2 y P3. No es un hallazgo.
- **El orden entre «lista vacía» y «prefijo ajeno»**: sigue siendo un mutante equivalente, y
  R4.1 lo da por aceptado.
