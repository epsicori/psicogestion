Sin hallazgos ALTA. 1 MEDIA, 2 BAJA.

# Revisión T-048 · ronda 3 · Documentación pendiente agrupada por paciente

- **Rama**: `T-048-documentacion-pendiente-agrupada`, HEAD `a65dfd1`, en el worktree
  `.claude/worktrees/agent-a69f77c2852a5d107`.
- **Diff de la ronda**: `git diff 8182a28 a65dfd1`, 12 ficheros. `8182a28` es el último commit del
  cherry-pick, «idempotencia del spec comprobada».
- **Diff del conjunto**: `git diff main...a65dfd1`, 30 ficheros.
- **Territorio**: `node ~/.claude/pipeline/territorio.mjs T-048` dice «30 fichero(s) tocado(s),
  todos dentro», y lee los 19 globs. La corrección de la línea `territorio:` funciona.
- **Líneas citadas**: las del worktree.
- **Mutantes**: medidos en una copia del árbol de `a65dfd1` (`git archive`, en el scratchpad, con
  una unión a `node_modules`). El worktree no se ha tocado. La línea base de la copia da
  `app/(app)/agenda`: 54 ficheros y 615 pruebas en verde.

## Hallazgos de la ronda 2

| Id | Estado | Prueba y mutante |
|---|---|---|
| R2-H1 | **Resuelto en lo que pedía; queda la puerta de R3-H1** | `remontaje.test.tsx` monta el `RedirectBoundary` real (`next/dist/client/components/redirect-boundary`) y el `AppRouterContext` real, con un `redirect()` de `next/navigation` lanzado durante el render (`:49`). No hay mock de `next/navigation`. Comprueba `getElementById(ID_TITULO) !== h2Antes` (`:172`, `:212`): el `h2` es otro nodo. Comprueba que `[data-estado-bloque]` es el **mismo** nodo (`:174`, `:213`), que nace vacío (`:162`) y que hay una sola región (`:176`). Mutante «memoria propia siempre» (`if (memoria && false)`): 4 rojos, los tres casos de `remontaje` y el gemelo de «Buscar». |
| R2-H2 | Resuelto | jsdom (`pendientes-fila.test.tsx:134`): `user.tab()` desde el enlace del nombre hasta el botón, Intro abre, Espacio cierra y Espacio abre. Hay además el caso de dos filas abiertas a la vez. En el spec (`:147-153`) hay Tab desde el nombre, `Space` y `toBeFocused`. `grep` de `boton.focus()` o `boton.click()` en el spec no devuelve nada. Los mutantes `div role=button` se han analizado leyendo el código, sin medirlos: `user.tab()` no se detiene en `tabIndex=-1`, y ni `user-event` ni el navegador hacen `click` en un `div` al pulsar Espacio. |
| R2-H3 | Resuelto | `min-w-11` en `ENLACE` (`pendientes-fila.tsx:16`), sin `justify-center`. `mide44` mide ahora el ancho (`spec:116`). Se miden el nombre, «Il Z» en el panel y en la página, el desplegable y cada enlace de pendiente. Playwright no se ha ejecutado en esta revisión. |
| R2-H4 | Resuelto | El fixture ya no tiene notas: las 13 alertas de `PRIMERO` son `informe_pendiente`. Desaparece el `update … referencia_en`. El paso 0 cierra con `update` una nota vieja del prefijo. El paso 1 marca `leida_en` solo en `leida_en is null`, con el tipo, el `origen_tabla` y el `origen_id` exactos del fixture viejo. No hay ningún `DELETE`. «Il Z» no contiene «zzmarca», y la prueba 3 sigue esperando 21. |

## Lo que pidió el orquestador

- **`decidirDestino`**:
  - El orden es el de R3.2 a): alerta pintada, paciente presente (con el prefijo del bloque),
    lista vacía, prefijo ajeno y, al final, el vecino (`eraUltimo` o `min(indice)`).
  - Los `it.each` cubren la lista del diseño.
  - Matan dos mutantes: «paciente presente» detrás de «prefijo ajeno», con el caso del prefijo
    ajeno y el paciente presente, y el enlace con `p.prefijo` en lugar de `bloque.prefijo`.
  - Invertir «lista vacía» y «prefijo ajeno» es un **mutante equivalente**: las dos reglas
    devuelven `{ id: encabezadoId, texto: base }`. Medido: 615 en verde. No es un defecto, pero
    R3.9.3 dice que «cambiar el orden da un destino distinto», y para ese par no es así.
- **`cerrar` idempotente**:
  - Compara por identidad, `ultimoCerrado.current === p` (`resolver-alerta.tsx:104`).
  - Mutante sin la guarda: cae solo «cerrar es idempotente por identidad…», que pasa
    «primero/segundo» y luego `{...p}` como «tercero». Esa prueba mata también la comparación por
    `alertaId`.
  - La prueba «con StrictMode» no ve la guarda (R3-H2).
- **Puertas del pendiente**:
  - `limpiar` y `enviar` descartan; `relanzar` no.
  - Activity descarta mediante el `useLayoutEffect` (`:112`).
  - Nadie más llama a `descartar`: `grep` de `useDescartarResolucion` y de `ContextoMemoria`
    fuera de las pruebas solo devuelve `buscador.tsx` y el propio módulo.
  - Mutantes, uno a uno:

    | Mutante | Resultado |
    |---|---|
    | Sin `descartar` en `limpiar` | Cae su prueba. El gemelo también cae, pero por contagio (R3-H3). |
    | Sin `descartar` en `enviar` | Cae el gemelo. |
    | Sin la limpieza del `useLayoutEffect` | Cae la prueba de Activity. |

  - Las tres puertas descartan lo que **ya** se ha anotado, pero no lo que llega después: es
    R3-H1.
- **El spec**:
  - No inserta ninguna `nota_sin_firmar`. Las dos únicas apariciones de esa cadena están en el
    `update` de cierre del paso 0.
  - No hay ningún `DELETE`. Se usan `update` de estado y de `leida_en`, ambos acotados por el
    prefijo `b0480000-` o por el `origen_id` exacto.
- **El desvío: `ContextoMemoria` exportado solo para la prueba (`resolver-alerta.tsx:85`)**.
  - **Lo acepto, y no es un hallazgo.** Hoy no hay escenario de fallo: fuera de las pruebas
    nadie lo importa (`grep`), y la bitácora declara el desvío.
  - El coste es que la privacidad del módulo ya no garantiza R3.9.5 («que nadie más llame a
    `descartar`»). Pasa a depender de un `grep` en cada revisión, y cualquiera puede llamar a
    `anotar` o a `cerrar` desde fuera.
  - Si se quiere cerrar, la idempotencia puede probarse por el camino real que la guarda
    protege: un `BloqueResolucion` que **se monta** bajo StrictMode con un pendiente ya
    anotado, que es el remontaje. Así no hace falta exportar el contexto. Con eso se
    resolvería también R3-H2.

## MEDIA

### R3-H1 · «Descartar» no alcanza a una resolución en vuelo: si el `ok` llega después, se anota en la memoria que sobrevive y roba el foco

- **Dónde**:
  - `app/(app)/agenda/resolver-alerta.tsx:217`: `bloque?.alResolver(...)` tras el `await`.
  - `:181`: `anotar(...)`.
  - `:101` y `:112`: `descartar` y la limpieza de Activity.
  - `app/(app)/agenda/documentacion/buscador.tsx:80` y `:96`.
- **Por qué pasa**: `descartar()` pone `pendiente = null` en el instante en que se llama. Pero
  el `ok` de una acción ya enviada llega después.
  - Al llegar, `ResolverAlerta` llama al `alResolver` del bloque que la envió, aunque ese bloque
    ya esté desmontado (`limpiar`) u oculto (Activity), y `anotar` escribe en la memoria.
  - Antes de esta ronda, el estado vivía en el proveedor: un `setState` sobre un bloque
    desmontado no hacía nada.
  - Ahora vive en el layout, que sobrevive a todo. La puerta de `limpiar` es, por tanto, una
    **regresión** de la ronda 3.
- **Escenarios**, los tres medidos en jsdom en la copia con sondas, ya borradas. El
  `resolverAlerta` devuelve una promesa que se resuelve a mano:
  1. **«Limpiar búsqueda» con el botón en «Resolviendo…»**. El arnés es el de
     `buscador.test.tsx:290`: memoria, `h2`, buscador y lista `pagina` con `pQ`.
     - Se busca y se pulsa «Marcar como resuelta» del paciente 1.
     - Antes de que vuelva el `ok`, se pulsa «Limpiar búsqueda», y el foco queda en el campo.
     - Al llegar el `ok`, el foco salta al título. Medido: `activo = documentacion-titulo`, y la
       región dice «Marcada como resuelta.».
     - El usuario estaba en el campo, donde `limpiar` le dejó, y quizá escribiendo.
  2. **Nueva búsqueda con el botón en «Resolviendo…»**. Se resuelve el paciente 1 de
     `[p1, p2]` y se envía otra búsqueda, que devolverá `[p2]`.
     - Al llegar el `ok`, el foco va a `busqueda-paciente-p2` (medido), un resultado de una
       búsqueda que el usuario no ha elegido mirar.
     - Es el mismo efecto que el gemelo de `buscador.test.tsx:328` declara evitado.
  3. **Salir de la ruta con el botón en «Resolviendo…»**. Ocurre, por ejemplo, al pulsar el
     nombre del paciente, que está al lado, o «Ver todos» en el panel.
     - Next resuelve la promesa de la acción aunque la navegación descarte su estado del
       enrutador: `server-action-reducer.js:263` hace `resolve(actionResult)` sin mirar
       `discarded`, y `app-router-instance.js:82-96` solo descarta el `nextState`.
     - El `ok` llega con la ruta oculta: la limpieza del `useLayoutEffect` ya ha corrido y el
       `anotar` entra después.
     - Al volver con «Atrás», Activity repite el efecto del bloque. Medido con
       `<Activity>` + `MemoriaResolucion` + el `Bloque` de `resolver-alerta.test.tsx`: el foco
       termina en `panel-paciente-pB` y la región dice «Marcada como resuelta.» de una acción de
       hace minutos.
     - Pasa en la página y en el panel de `/agenda`, porque el panel crea la misma memoria
       dentro de su proveedor.
- **Qué incumple**:
  - R3.2 c), «no robar el foco al campo que `limpiar` acaba de enfocar».
  - La prueba de Activity de R3.2 e), «al volver, nada roba el foco».
  - Las pruebas solo cubren la ventana «el `ok` ya llegó, y después se descarta»:
    - en `buscador.test.tsx:308` y `:328` el `resolverAlerta` ya ha resuelto y lo que queda en
      vuelo es `relanzar`;
    - en `resolver-alerta.test.tsx` (Activity), `pulsar()` espera al `ok` antes de ocultar.
- **Qué haría falta**:
  - El descarte tiene que invalidar también las resoluciones **enviadas** y aún sin respuesta,
    y no solo el pendiente ya anotado.
  - Por ejemplo, una época en la memoria que `descartar` incrementa. El bloque la captura al
    **enviar**, no al acertar, y `anotar` ignora un acierto de una época vieja.
  - Una guarda «el bloque sigue montado» solo cerraría el escenario 1. En el 2 el bloque sigue
    montado, y en el 3 está oculto pero no desmontado.
  - Cada una de las tres puertas necesita su prueba con el `resolverAlerta` diferido y resuelto
    **después** del gesto.

## BAJA

### R3-H2 · La prueba «con StrictMode, un acierto anuncia una sola vez» no puede ver un segundo anuncio

- **Dónde**: `app/(app)/agenda/resolver-alerta.test.tsx:439`.
- **Qué pasa**:
  - El efecto que llama a `cerrar` corre aquí en una **actualización** (el `rerender` que quita
    a Ana). StrictMode solo repite los efectos al **montar**.
  - Además, la aserción es `textContent === 'Marcada como resuelta.'`, que vale lo mismo con uno
    o con dos anuncios del mismo texto.
- **Medido**: sin la guarda de `cerrar` (`:104`), esta prueba sigue en verde. Solo cae
  «cerrar es idempotente por identidad…» (614 de 615).
- **Escenario**: alguien quita la prueba directa, porque el título de esta promete lo mismo, y la
  guarda se queda sin ninguna prueba.
- **Qué falta**: o se retitula, o se monta el caso que StrictMode sí repite, un
  `BloqueResolucion` que nace con un pendiente ya anotado. Eso último cubriría además el desvío
  de `ContextoMemoria`.

### R3-H3 · La prueba de «Limpiar» solo suelta su acción en vuelo al final, y su fallo contagia al gemelo

- **Dónde**:
  - `app/(app)/agenda/documentacion/buscador.test.tsx:325`: `soltar(...)` en la última línea.
  - El mismo patrón en `remontaje.test.tsx:209`, con `responderRelanzada`.
- **Qué pasa**: una acción asíncrona sin resolver retiene las transiciones de todo React. El
  propio comentario de `:324` lo dice. Si la prueba falla antes de `soltar`, la promesa queda
  pendiente y la prueba siguiente no recibe sus resultados.
- **Medido**, con el mutante «sin `descartar` en `limpiar`»:
  - en el fichero entero caen dos pruebas, «Limpiar» y el gemelo de «Buscar», este último por
    tiempo agotado (1256 ms);
  - con `-t "gemelo con"`, el gemelo pasa.
- **Escenario**: la evidencia de mutantes que pide R3.8 atribuye al gemelo una muerte que no es
  suya, y un fallo real del gemelo queda tapado por el de «Limpiar».
- **Qué falta**: soltar en un `afterEach` o en un `finally`.

## Lo que se miró y está bien

- **`layout.tsx`**: no es `async`, no lee nada, no lleva `use cache` y solo pinta la región
  `sr-only`. Está por encima del `RedirectBoundary` de la página y de la `key` de `Buscador`.
- **La región**: hay una sola por memoria y es hermana de `[data-bloque-pendientes]`.
  `documentacion.test.tsx` y `contenido.test.tsx` se han ajustado al hermano (`closest('section')`
  y `~`), sin aflojar la comprobación de que existe en lista, vacío y error.
- **El panel de `/agenda`**: `documentacion.tsx` no cambia, y su proveedor crea su memoria
  dentro de la `section`. La prueba 1 de Playwright la sigue encontrando en
  `section[aria-labelledby="agenda-documentacion"]`.
- **Los casos de `resolver-alerta.test.tsx:225` y `:237`**: se han retitulado como «regla
  eraUltimo con un rerender», y citan `remontaje.test.tsx` como evidencia de la redirección. No
  se venden como prueba de ella.
- **`remontaje.test.tsx`, caso 3 (gemelo sin redirección)**: comprueba que no hay `replace` ni
  `push` y que el foco va al vecino de su índice.
- **Un comentario del spec que ya no es cierto**: `spec:171` dice «le quedan 11 informes y la
  nota», y el fixture ya no tiene nota (son 12 informes). No tiene efecto en la prueba: el
  recuento que se comprueba, «12 pendientes», es correcto.
- **Riesgos 3 y 4 de R3.6**: anotados en la bitácora, como pedía el diseño.
