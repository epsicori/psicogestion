Sin hallazgos ALTA. 0 ALTA, 0 MEDIA, 3 BAJA.

# T-023 · Ronda 5 · Revisor B (cliente, accesibilidad y spec)

He revisado este diff: `git diff worktree-agent-af4665097e6d61770..worktree-agent-aaa4e03b1bd13834a -- . ':!tickets'` (de 810678f a 5604fa0), más `tickets/T-023/mutantes.json` (`ts_ronda_5`), con el anexo R5 de `diseno.md` como contrato.

- No he ejecutado el spec.
- He medido dos mutantes con vitest sobre una copia `git archive` de 5604fa0 en el scratchpad, con una unión hacia `node_modules`. Nunca he tocado el worktree. Después solté la unión y borré la copia.
- Línea base: 11 ficheros y 213 pruebas en verde.

## Estado de los hallazgos B de la ronda 4

| Id R4 | Estado | Por qué |
|---|---|---|
| B-H1 (BAJA) | **Cerrado** | El paso 2b (`acciones.ts:63`) y la relectura propia (`:133`) contestan ahora `cobroYaRegistrado`, y el alta nueva (`:143`) sigue con `cobroRegistrado`. `formulario-cobro.tsx:103` da por éxito los dos textos, y `registrar-cobro.tsx:76-80` olvida esa huella y anuncia el texto recibido. En el escenario de las 18:00, el usuario lee «Este cobro ya estaba registrado; no se ha añadido otro…» en vez de «Cobro registrado». Cuando lo vuelve a enviar, va con un id nuevo: la prueba «"ya estaba registrado" cierra…» comprueba `idDe(2) ≠ idDe(0)` y M39 cae. Queda un residuo aceptado: el usuario tiene que leer el aviso. Tiene el mismo estilo que el éxito y el diálogo se cierra igual. El diseño lo eligió así a sabiendas (R5.1). |
| B-H2 (BAJA) | **Cerrado**, con dos residuos de la misma puerta (H1 y H2) | `page.tsx:26` monta siempre `<RegistrarCobro>`, del mismo tipo y sin `key`. Con `null`, la isla pinta el aviso y conserva el `useRef`. La prueba B-H2 vuelve a buscar el disparador y exige el mismo id, así que M41 cae. Lo que no se prueba es la `key` (H1). Y con el aviso en pantalla no hay ninguna salida que no sea recargar (H2). |
| B-H3 (BAJA) | **Cerrado** | Lo he medido. Con `claves.current.clear(); void huella;` en `registrar-cobro.tsx:77`, cae «solo se olvida la clave del envío que sale bien: A desconocido, B con éxito, A otra vez lleva idA» (1 roja, 212 verdes). |

## La lista de «qué revisar» (R5.6, revisor B)

- **`MENSAJES_DE_EXITO` tiene exactamente los dos textos** (`formulario-cobro.tsx:41`). `fallo()` y `resultadoDesconocido` no están en la lista: siguen por `aplicarErroresDelServidor`, no cierran el diálogo y no tocan el `Map`. La guarda `estado.mensaje !== undefined` sobra para `includes`, pero no hace daño.
- **`alRegistrar` borra solo su huella y anuncia el texto recibido** (`registrar-cobro.tsx:76-80`).
  - El `<p role="status">` está siempre montado (`:58`), también con `null`. Al abrir el diálogo se vacía (`:49`), así que cada resultado pasa de `''` a un texto y se anuncia, aunque repita el anterior.
  - Con «ya estaba», `textContent` es exactamente `cobroYaRegistrado`. Lo exige la prueba con `toBe`, así que M38 cae. El texto no contiene «cobro registrado» en minúsculas (lo prueba M44).
  - No se pisa con el aviso de pacientes: el aviso es `role="alert"` y va en otro nodo (`AvisoDeError`, `piezas.tsx:270-276`). Si los dos cambian en el mismo commit, el aviso de pacientes interrumpe y el estado educado se anuncia detrás.
- **Hooks antes de cualquier rama.** Se cumple: hay un solo `return`, y las tres piezas van en el orden del anexo. Con `null` no hay disparador ni `Dialogo`. Sí están `AvisoDeError` y el `status`, y la prueba nueva de `registrar-cobro.test.tsx` lo comprueba.
- **El tipo y la `key` de la isla entre renders.** En el código no cambian:
  - `AccionRegistrar` tiene una sola salida, y `EncabezadoDeModulo`, `Suspense` y el segmento de página siguen en la misma posición.
  - `layout-router.js:549` crea la clave del segmento **sin** los parámetros de búsqueda (`createRouterCacheKey(activeSegment, true)`). Así que cambiar el filtro o la página no monta otro `Activity` ni otro árbol.
  - Si el `Suspense` con `fallback={null}` volviera a suspender fuera de una transición, React oculta el contenido ya mostrado, pero no lo desmonta. El `Map` sobrevive.
  - La prueba solo mira el tipo. La `key` no se prueba (H1).
- **Las pruebas nuevas comprueban ids.** Las tres usan `idDe` y no solo el número de llamadas. La de B-H2 vuelve a buscar el disparador después del `rerender`.
- **Spec, paso 9.** `getByRole('status').filter({ hasText: 'ya estaba registrado' })` seguido de `toHaveText(<texto entero>)` exige lo mismo que el anexo, y hace falta. En la página hay varias regiones `status`: `aviso-sesion.tsx:139`, `campana.tsx:187` y `Cargando` (`piezas.tsx:247`). Por eso `getByRole('status')` a secas fallaría por el modo estricto, no por el cobro. Con el filtro:
  - con M38, el `status` dice «Cobro registrado», el filtro no encuentra nada y `toHaveText` vence el plazo en rojo;
  - con M35, lo mismo;
  - con M37, cae antes, en `toBeHidden` (`:220`);
  - si hubiera dos coincidencias, el modo estricto da rojo, nunca verde;
  - `toHaveText` con una cadena compara el texto entero, después de normalizar los espacios.

  La región `aria-live` del formulario no es `role="status"` (`formulario-cobro.tsx:209`), así que no puede colarse. El paso 6 (`:187`) sigue exigiendo `'Cobro registrado'` en el cuerpo del primer envío. El desvío consta en la bitácora, en «Trampas».
- **El catálogo** no nombra ningún botón («regístralo otra vez» no es el nombre de ningún botón) y no contiene «cobro registrado» en minúsculas.

## Lo que preguntaba el orquestador

- **¿Sobrevive el `Map` de verdad?** En el código, sí: es el mismo elemento en la misma posición, y la clave del segmento no incluye la *query*. En las pruebas, también: M41 cae en la prueba B-H2. Pero un `key` que dependa de `pacientes.ok` sobrevive a toda la batería (H1).
- **¿Qué ve el usuario con `null`?** Ve el aviso «No se ha podido cargar la lista de pacientes», sin disparador y sin ninguna acción. Debajo sigue el último `status`. Esto tiene dos consecuencias nuevas:
  - el foco se pierde si la lista falla justo en el repintado que sigue a un éxito (H3);
  - para quien no tiene filtro ni paginación, la única salida visible es recargar, y recargar vacía el `Map` que R5 quería conservar (H2).
- **`cacheComponents` y `Activity`.** No cambian el análisis de R5:
  - con la clave del segmento sin *query*, el `Map` dura lo mismo con cualquier filtro;
  - que la clave no caduque ya no produce una confirmación falsa, porque el reconocimiento por 2b se anuncia como «ya estaba»;
  - volver a la ruta desde la barra lateral refresca los datos sin desmontar la isla, así que es una salida del aviso de pacientes que conserva el `Map`. Pero nada se la dice al usuario (H2).

## Hallazgos

### H1 · BAJA · `app/(app)/facturacion/page.test.tsx:150` (con `page.tsx:26`)
**«Nada cambia la `key` de la isla entre renders» no se prueba: un `key` que dependa de la lista vuelve a abrir B-H2 y toda la batería sigue en verde.** Las dos pruebas de `AccionRegistrar` (`:150-151` y `:162-166`) comparan `r.type` y `r.props`. La `key` no está en `props`.

Lo he medido. Con `page.tsx:26` cambiado a `<RegistrarCobro key={pacientes.ok ? "ok" : "ko"} pacientes=… />`, `vitest run "app/(app)/facturacion/"` da 11 ficheros y 213 pruebas en verde.

Escenario con ese cambio:
1. 60,00 EUR a Lucía da «No sabemos…», y el cobro sí entró.
2. El administrador cambia el filtro. En ese render la lista de pacientes falla, la `key` pasa a `"ko"` y React desmonta la isla con su `Map`.
3. Vuelve a cambiar el filtro. La `key` vuelve a `"ok"`, y la isla nueva tiene el `Map` vacío.
4. Reenvía con los mismos datos y le sale un id nuevo: un cobro duplicado que no se puede borrar (regla 6).

Lo cerraría añadir `expect(isValidElement(r) && r.key).toBeNull()` en las dos pruebas de `AccionRegistrar`.

### H2 · BAJA · `app/(app)/facturacion/registrar-cobro.tsx:42-43` (con `lib/i18n/es.ts:1384`)
**Con `pacientes === null`, la isla conserva el `Map`, pero el aviso no ofrece ninguna salida dentro de la página. Para quien no tiene filtro ni paginación, lo evidente es recargar, y recargar vacía el `Map`.** El texto «No se ha podido cargar la lista de pacientes» no trae ninguna acción ni dice nada de recargar. La isla solo se vuelve a pintar si algo repinta el segmento: el filtro (solo el administrador), la paginación de «Por paciente» (solo con más de una página) o ir a otra sección y volver.

Escenario, con un técnico en una consulta pequeña (una página de pendientes y ningún selector):
1. Envía A (60,00 EUR a Lucía). Sale «No sabemos…», y el cobro sí entró.
2. Sin reenviar, registra B (40,00 EUR a otro paciente), que sale bien. El `revalidatePath` repinta la página.
3. En ese repintado falla `cargarPacientesParaCobro`, que es justo lo esperable con la base a tirones. El botón pasa a ser el aviso, y no hay nada que pulsar.
4. Pulsa F5, que es la única salida visible. Para el usuario, F5 no es «salir de la página». El `Map` se vacía.
5. Vuelve a enviar A como le pedía el aviso. Le sale un id nuevo y el cobro queda duplicado sin poder borrarse.

En R4 el `Map` ya se perdía en el paso 3. R5 lo conserva, pero no le deja al usuario ningún camino que lo aproveche.

Lo cerraría una de estas dos cosas:
- un texto del aviso que diga cómo reintentar sin recargar;
- un «Reintentar» con `router.refresh()`. Es suave mientras haya red: mi memoria de T-023 B R2 dice que, sin red, `refresh()` acaba en una navegación completa.

### H3 · BAJA · `app/(app)/facturacion/registrar-cobro.tsx:42-56`
**Si la lista de pacientes falla en el repintado que sigue a un éxito, el disparador se sustituye por el aviso en ese mismo commit, y el foco que `Dialogo` devuelve cae en un nodo desmontado: el foco se pierde en `body`.**
- `useDevolucionDeFoco` (`components/ui/foco.ts:41-43`) llama a `previo.current?.focus()` sobre el botón. Si el botón ya no está conectado, no hace nada.
- Si el commit del árbol llega después de `setAbierto(false)`, el botón enfocado se desmonta igual.

Escenario:
1. Un usuario de teclado registra 60,00 EUR, o un reintento que sale «ya estaba».
2. La acción llama a `revalidatePath`, y en ese render `cargarPacientesParaCobro` da `{ ok: false }`.
3. El diálogo se cierra, el botón «Registrar cobro» pasa a ser el aviso, y el foco queda en `body`.
4. El lector oye el aviso y el `status`, pero el siguiente Tab sale desde el principio del documento (o desde donde quedó el nodo quitado, según el navegador), no desde el encabezado de Facturación.

No es una regresión: en R4 la isla entera se cambiaba por el aviso, con el mismo foco perdido y sin el `status`. Pero ahora el ternario vive dentro de la isla, y ella sabe cuándo pasa. Lo cerraría que el aviso sea enfocable (`tabIndex={-1}`) y reciba el foco cuando la lista pasa a `null` con el foco dentro de la isla o en `body`.

## Lo que he mirado y no cuento

- **`formulario-cobro.tsx:43`: `const OPCIONES_FORMA =FORMAS_DE_PAGO…`** Falta un espacio. No hay prettier en `lint` ni en CI, así que no rompe nada y no hay escenario de fallo.
- **La prueba «con "ya estaba registrado"… no se pinta como error»** (`formulario-cobro.test.tsx`) mira `queryByText` justo después de `waitFor(alRegistrar)`. Un formulario que pintara el texto después de llamar a `alRegistrar` podría pasar por cuestión de tiempos. En la app no se vería, porque el padre desmonta el formulario al cerrar. No lo cuento.
- **Volver con «Atrás» del navegador con el diálogo abierto.** `Activity` conserva `abierto = true`. Si al volver la lista falla, el diálogo desaparece. Cuando la lista vuelve, el diálogo se abre solo. Para eso hacen falta un gesto de historial con un modal abierto y dos fallos. Tampoco es nuevo, porque `abierto` ya sobrevivía en R4.
- **El último `status` sigue visible al volver a `/facturacion` horas después** («Cobro registrado» o «ya estaba»), por `Activity`. Viene de R3, no entra en este diff y no hay acción que lo use.
