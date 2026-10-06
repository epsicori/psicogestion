Sin hallazgos ALTA (revisor B: 0 ALTA, 1 MEDIA, 5 BAJA).

<!-- REVISOR-B -->
# T-043 · Revisión B (interfaz, foco y pruebas) · ronda 1

Diff: `git diff main...worktree-agent-a84f11f89963e2cc9` (HEAD c8759df), centrado en
`app/(app)/agenda/nueva/` (formulario, aviso, alternativas, estado-alta y sus pruebas), `lib/i18n/es.ts`
y `docs/interfaz.md`. Los mutantes se midieron en una copia (`git archive c8759df` en el scratchpad, con
una unión de `node_modules`), con `npx vitest run formulario-alta aviso-hueco-raro alternativas-hueco
estado-alta`. Línea base: 69/69 en verde. El worktree no se tocó.

## Hallazgos

### MEDIA

**B-H1 · `app/(app)/agenda/nueva/formulario-alta.tsx:300` (y :123).** La intercepción lee la vista de
una clave de cálculo que ya no es la vigente. Si el recálculo en vuelo llega después y quita la rareza,
el aviso se desmonta con el foco dentro y el foco cae en `body`.
- **Escenario (medido, sonda S5):** se elige tipo A (50 min) y el hueco 17:00, que es raro. Se cambia
  a tipo B, y `recalcularAlta` queda en vuelo. Se pulsa Guardar antes de que vuelva: `enviar` usa
  `vista.huecosRaros` de la vista vieja, enseña el aviso y le da el foco. Cuando llega el recálculo
  (17:00 ya no es raro con 90 min), `avisoVisible` pasa a falso y la sección se desmonta.
  `document.activeElement` = `BODY` y `guardarAlta` = 0. El lector de pantalla no oye nada y el
  siguiente Tab empieza desde arriba del diálogo.
- Esto contradice §5 del diseño («El foco nunca va a `body`») y CA5. El efecto de foco diferido no
  lo recoge, porque solo actúa si alguien dejó `focoPendiente`. Guardar no espera al cálculo: `cargando`
  solo llega a las tarjetas. La ventana es la latencia de una Server Action, de cientos de ms a
  segundos con una red lenta.
- La misma causa produce B-H2.

### BAJA

**B-H2 · `app/(app)/agenda/nueva/formulario-alta.tsx:300`.** Con un recálculo en vuelo, un Guardar
rápido decide el aviso con la rareza de la duración anterior, así que puede guardar sin avisar.
- **Escenario (medido, sonda S6):** tipo A, 17:00 sin rareza. Se cambia a tipo B, con el recálculo en
  vuelo, y se pulsa Guardar. `guardarAlta` se llama una vez con `tipoTerapiaId = B`, y nunca sale un
  aviso. Con B el hueco sí era raro: la vista que llega después lo trae en `huecosRaros`.
- El caso inverso también ocurre: el aviso sale con los minutos de la duración vieja.
- No bloquea nada, pero el aviso del criterio se pierde justo cuando se cambia el tipo.
- Un arreglo común con B-H1: en `enviar`, con `calculo.clave !== claveCalculo`, no decidir con la vista
  vieja.

**B-H3 · `app/(app)/agenda/nueva/formulario-alta.tsx:312` y `:576`.** Las dos guardas contra un segundo
«Agendar igualmente» se tapan una a otra, y ninguna prueba del formulario las cubre juntas.
- El mutante declarado equivalente (quitar la guarda de `agendarIgualmente`) **es** equivalente por sí
  solo (69/69). Pero también lo es `ocupado={false}` (69/69), por la guarda anterior. Y quitando las dos
  (69/69 en verde), la sonda S1 cuenta **2 llamadas** a `guardarAlta`.
- **Escenario de S1:** Guardar, «Agendar igualmente», esperar a «Guardando…» y pulsar «Agendar
  igualmente» otra vez. En HEAD hay 1 llamada; con el mutante, 2.
- El «una vez» de CA5 se prueba con un solo clic (`formulario-alta.test.tsx:869`).
- El caso 7 de CA5 («Agendar igualmente» nunca `disabled` durante el guardado) solo existe en la prueba
  del componente, no en la del formulario.
- La bitácora (`docs/bitacora/T-043.md:19`) dice «`ocupado` ignorado … matado». Lo que se mató fue la
  guarda del componente (`aviso-hueco-raro.test.tsx`), no el cableado del formulario.

**B-H4 · `app/(app)/agenda/nueva/formulario-alta.tsx:132` y `:313-316`.** Dos ramas que añade el
ticket no tienen prueba.
- **(a) La condición «solo si el foco se perdió» del destino `'guardar'`.** El mutante
  `refGuardar.current?.focus()` sin mirar `body` sobrevive (69/69).
  - **Escenario (sonda S2):** «Agendar igualmente» devuelve un fallo genérico y el aviso sigue
    montado. En HEAD, el foco se queda en «Agendar igualmente». Con el mutante salta a Guardar, y un
    Intro ahí ya no guarda: lleva el foco de vuelta al aviso.
  - Es la guarda que justifica el desvío del diseño. Hace falta una prueba con un resultado que no
    desmonte el aviso.
- **(b) El reintento de la serie desde «Agendar igualmente»** (`falloSerie !== null` → `setSerieFallida(null)`).
  Quitarlo sobrevive (69/69).
  - **Escenario:** serie con la previsualización fallida mientras el aviso está visible. «Agendar
    igualmente» lanza `handleSubmit(guardar)` sin firma, en lugar de volver a pedir la serie, como
    hace `onSubmit`.

**B-H5 · `app/(app)/agenda/nueva/formulario-alta.tsx:572`.** Que las alternativas excluyan los huecos
raros solo se prueba en la función pura. El cableado del formulario no tiene prueba.
- El mutante `alternativasSinHueco(vista.calendario.huecos, {}, …)` sobrevive (69/69): la fixture `RARA`
  solo tiene raro el propio elegido.
- **Escenario (sonda S4):** 17:00 y 18:00 raros, se elige 17:00 y se pulsa Guardar.
  - En HEAD, la única alternativa es la de las 19:00.
  - Con el mutante se ofrece también la de las 18:00. El usuario la elige, pulsa Guardar y le sale
    otro aviso.
- La bitácora (`:19`) dice «alternativas con raros … matado». El mutante que se mató está en
  `alternativas-hueco.ts`.

**B-H6 · `app/(app)/agenda/nueva/formulario-alta.test.tsx:852`.** El caso 1 de CA5 falla por el
selector y no por «`guardarAlta` llamado», que es justo lo que §5 del diseño pide evitar («la aserción
de la llamada va primero»).
- **Escenario:** sin la intercepción (mutante M_H), el mensaje es `Unable to find role="region" and
  name "Esta cita deja un hueco corto"`. La aserción `not.toHaveBeenCalled` va después del
  `findByRole` y nunca llega a ejecutarse.
- El mutante muere igual (7 rojos). Lo que falla es el diagnóstico, no la detección.

## Lo que se pidió juzgar

- **La intercepción ocurre una sola vez, y bien.**
  - Cada Guardar sobre un hueco raro lo intercepta `enviar`. «Agendar igualmente» llama a
    `handleSubmit(guardar)` directamente, sin pasar por `enviar`, así que no se vuelve a interceptar.
  - Mueren tres mutantes:
    - sin intercepción (M_H): 7 rojos;
    - interceptar sin `return`, es decir, aviso y guardado a la vez (M_Q): 4 rojos;
    - segundo Guardar sin foco al aviso (M_I): 1 rojo.
  - La excepción es la carrera con el recálculo (B-H1, B-H2).
- **El foco.**
  - Aviso: M_N y M_P mueren.
  - Alternativa a «Hueco elegido»: M_J muere.
  - Segundo Guardar: M_I muere.
  - `hueco_ocupado` a Guardar: M_C muere.
  - Los cuatro destinos son correctos en estado estable. Falla en B-H1.
  - La línea «Hueco elegido» enfocada sale con rol `null` y nombre vacío en `dom-accessibility-api`.
    No lo cuento como hallazgo, porque NVDA y VoiceOver leen el texto de un párrafo enfocado y el
    diseño lo prescribe así. Pero CA7 debería anotar qué se oye en Chromium.
- **`disabled` y ARIA.**
  - Ningún `disabled=` en los dos ficheros (grep); solo `aria-disabled`.
  - La sección es una `region` con nombre (el título) y descripción (el texto con los minutos), con
    `tabIndex=-1`.
  - No hay `role=status`, `alert`, `aria-live` ni `dialog`.
  - La lista se etiqueta por su rótulo.
  - Los botones son `type="button"` por defecto, así que Intro dentro del aviso no envía.
  - El contraste `muted-foreground` sobre `muted` ya está en `lib/contraste/tokens.ts:51`.
- **Las alternativas no incluyen huecos raros.**
  - En la función pura, sí: M_K muere.
  - En el formulario no hay prueba (B-H5).
- **El desvío del foco de «Agendar igualmente»: correcto y necesario.**
  - La versión del diseño, que mira `document.activeElement` en el `then` (M_D), hace caer la prueba
    de `hueco_ocupado`.
  - Las actualizaciones que siguen al `await` de la Server Action van por el carril por defecto, que
    se confirma en una tarea del Scheduler. La cadena de microtareas del `then` corre antes, con el
    aviso todavía montado y el foco aún sin caer a `body`. Chromium sigue el mismo orden.
  - Dejar `focoPendiente = 'guardar'` para el efecto del commit siguiente lo resuelve, y la
    comprobación de `body` evita robar el foco cuando el aviso sigue montado. Esa comprobación no
    tiene prueba (B-H4a).
- **Los dos mutantes «equivalentes».**
  - Quitar `huecoRaroElegido !== null` de `avisoVisible` (M_A) **es equivalente**, porque el JSX
    repite la conjunción y `avisoVisible` no se usa en otro sitio. Quitar las dos (M_AB) hace caer
    «un recálculo que quita la rareza».
  - Quitar la guarda de `agendarIgualmente` (M_B) **es equivalente por sí solo**, pero forma pareja con
    el `ocupado` del formulario, y la pareja sobrevive (B-H3).

## Tabla de mutantes (copia, 69 pruebas de base)

| Mutante | Resultado |
|---|---|
| M_A `avisoVisible` sin rareza | 69/69 (equivalente) |
| M_B `agendarIgualmente` sin guarda | 69/69 (equivalente solo) |
| M_AB ambas rarezas | 1 rojo |
| M_C sin `then` | 1 rojo (hueco_ocupado) |
| M_D el `then` del diseño | 1 rojo (hueco_ocupado) |
| M_E `'guardar'` sin mirar `body` | **69/69** (B-H4a) |
| M_F sin reintento de serie | **69/69** (B-H4b) |
| M_G `elegirHueco` sin reset | 1 rojo |
| M_H sin intercepción | 7 rojos |
| M_I segundo Guardar sin foco | 1 rojo |
| M_J alternativa sin foco | 1 rojo |
| M_K pura sin filtro de raros | 1 rojo |
| M_L formulario con mapa `{}` | **69/69** (B-H5) |
| M_M `ocupado={false}` | 69/69 |
| M_BM sin ninguna guarda de ocupado | **69/69** (B-H3, S1 = 2 llamadas) |
| M_N efecto sin aviso/resumen | 2 rojos |
| M_O componente sin `if (!ocupado)` | 1 rojo |
| M_P efecto con `[]` | 3 rojos |
| M_Q intercepta sin `return` | 4 rojos |
<!-- /REVISOR-B -->
