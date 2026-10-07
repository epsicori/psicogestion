Sin hallazgos ALTA. Revisor B (interfaz, foco, formularios), ronda 2: 3 MEDIA y 5 BAJA.

# T-023 · Revisión B (interfaz) · ronda 2

- **Diff revisado:** `T-023-cobros-y-pendiente..worktree-agent-a65aa0bb5f872243e` (HEAD `27cd231`), sin `tickets/`. Contexto: diseño §R2.3, §R2.4, §R2.6 y §R2.9 (lista del revisor B).
- **Medido** (solo lectura, el worktree queda limpio):
  - `npx vitest run components/ui/piezas.test.tsx lib/contraste "app/(app)/facturacion"`: 12 ficheros y 192 pruebas, todo verde.
  - `npx eslint "app/(app)/facturacion" components/ui/piezas.tsx accesibilidad/facturacion.spec.ts`: limpio.
  - Contrastes con `lib/contraste` sobre los tokens de `app/globals.css`, a partir de una copia en el scratchpad: `primary` sobre `muted` da 7,95:1, `muted-foreground` sobre `card` da 5,33:1 y `foreground` sobre `background` (warning) da 14,70:1.
  - La conducta de `router.refresh()` ante un fallo de red está leída en `node_modules/next/dist/client/components/router-reducer/` (fetch-server-response.js:142-148 y :236-241; ppr-navigations.js:988-999 y :1117-1125).
- **No ejecutado:** el spec de Playwright, porque escribe en la base compartida. Lo ejecuta el verificador.

## Lista «Qué revisar» (R2.9, revisor B), punto por punto

| Punto | Resultado |
|---|---|
| El botón nunca es `disabled` | **OK.** Lleva `aria-disabled={enviando}` (`formulario-cobro.tsx:192`) y la prueba exige `not.toBeDisabled()`. |
| Con doble envío, la acción se llama una vez | **OK.** La guarda es `enviandoRef` (`:84`). Si se quita la guarda, la segunda pulsación pasa por `handleSubmit` y llega a `registrarCobro`, así que la prueba de la `:115` caería. |
| Foco al primer campo con error, en orden, también con `motivo` | **El código está bien; la prueba no basta (H3).** |
| `catch`: estado con salida; el texto no afirma ni niega | **El texto está bien y el diálogo vuelve a poder cerrarse.** El `router.refresh()` del `catch` lo anula justo en el caso para el que existe (H1). El canal de comprobación que propone el texto no siempre enseña el cobro (H7). |
| Cierre: con envío en vuelo no cierra; sin envío sí, y el foco vuelve | **OK.** Escape, la X y el clic fuera pasan por el mismo `alCerrar` (`dialogo.tsx:29`, `:71`). El efecto que avisa del fin del envío se vuelve a lanzar al remontar, así que el `enviando=true` que queda en el padre tras un éxito no bloquea la siguiente apertura. |
| Paginación: el enlace que no aplica no se pinta | **OK**, pero al quitar el enlace enfocado se pierde el foco (H6). |
| El `href` conserva `?profesional` y el selector quita `pagina` | **OK**, con prueba en los dos sitios. |
| `?pagina=999999` cae en la última y `?pagina=abc` en la 1 | **`abc` va a la 1. `999999` también va a la 1, no a la última** (H4). |
| `Pildora success`: ¿algún sitio dependía del verde para distinguir estados? | **No.** Recorridas las 7 pantallas de R2-V7, cada píldora lleva su propio texto. El único caso en que el tono cambia y el texto no es `panel-datos.tsx:61` (representante vigente o no), y allí `:76-79` lo dice con texto («Ya no vigente» o «Vigente desde…»). |
| La prueba de `piezas.test.tsx` cae con el `success` antiguo por el `/` | **OK.** `bg-primary/10` da `fondo[2] = '/10'`, así que cae en la aserción «el fondo lleva opacidad», que es la correcta. |
| El importe se lee entero a 360 px | **En jsdom sí** (`bloques.test.tsx`, sin `truncate` y con `break-words`). **El paso 1 del spec no mira la lista** (H2). |
| Si fallan los pacientes, `AvisoDeError` en lugar del botón | **OK** (`page.tsx:24` y `page.test.tsx`). |
| Atajo `(evento) => handleSubmit(fn)(evento)` del React Compiler | **Correcto.** Aplaza al evento la lectura del ref que `react-hooks/refs` prohíbe en el render. Se crea un manejador por envío, que es barato, y el lint queda limpio. Hay precedente en `dialogo-de-copia.tsx:227` (con `void`). Sin hallazgo. |

## Hallazgos de la ronda 1 (B)

| R1 | Estado |
|---|---|
| B-H1 (`try/catch`) | **Cerrado en jsdom.** El `catch` existe y el formulario sigue montado. Queda una variante nueva: el `refresh` del `catch` recarga la página entera cuando falla la red (H1). |
| B-H2 (`disabled` y foco) | **Cerrado** en el código. Solo hay prueba de una de las tres ramas del orden (H3). |
| B-H3 (selector con valor ajeno) | **Cerrado para la URL escrita a mano.** Sigue abierto en la otra mitad de mi escenario, «opciones [] por un fallo», y ahora una prueba lo da por bueno (H5). |
| B-H4 (`Pildora success` a 1,13:1) | **Cerrado.** Medido: 7,95:1, y el par está en `PARES`. |
| B-H5 (`.in` sin límite) | **Cerrado.** Como mucho 50 ids por `.range`. |
| B-H6 (spec) | **A medias.** Ya entra como administrador y hace un envío completo. Sigue sin mirar el selector ni el diálogo con los errores o el motivo a la vista, que eran mi escenario (H2). |
| B-H7 (`truncate`) | **Cerrado en jsdom.** No hay medida en navegador (H2). |
| B-H8 (matiz de `Metrica`) | **Cerrado.** Medido: 5,33:1, y solo lo usa Facturación. |
| B-H9 (pacientes como `[]`) | **Cerrado.** |
| B-H10 (más de 1000 pacientes) | **Cerrado.** Se leen por páginas de 1000 hasta agotarlos. |
| B-H11 (Escape en vuelo, aviso `sr-only`) | **Cerrado.** Pero el aviso visible lleva ahora `empty:hidden` (H8). |

## MEDIA

### H1 · `app/(app)/facturacion/formulario-cobro.tsx:103`: el `router.refresh()` del `catch` recarga la página entera justo cuando ha fallado la red, y se pierde el aviso que el `catch` acaba de poner

- Si el fetch RSC falla, Next 16 no hace el `refresh` en cliente: cae a una navegación de página completa. Lo hace en dos casos:
  - el fetch lanza (`fetch-server-response.js:236-241`, «Falling back to browser navigation»);
  - la respuesta no es 200 (`:142-148`).
- Después, `ppr-navigations.js:988-999` lo trata como `isHardRetry`. Su propio comentario dice: «when the network fails, we fall back to the browser behavior for offline navigations».
- **Escenario:**
  1. Se cae la wifi al pulsar «Registrar cobro» y la acción rechaza con `TypeError`.
  2. El `catch` pinta «No sabemos si el cobro se ha registrado…» y llama a `router.refresh()`.
  3. El fetch del refresco también falla y el navegador recarga `/facturacion` sin conexión: sale la página de error del navegador.
  4. Se pierden el aviso y lo escrito en el formulario.
  5. Cuando vuelve la red, el usuario recarga, ve un formulario limpio sin ninguna advertencia y vuelve a registrar el cobro. Si el primer `insert` llegó a la base, queda duplicado. Un cobro no se borra (regla 6): solo se compensa con una devolución.
- Ese es el escenario exacto de B-H1 de la ronda 1. El arreglo lo cubre en jsdom porque allí `router` es un doble (`formulario-cobro.test.tsx:9`). El `refresh` lo manda el diseño (R2.3), así que la decisión vuelve al arquitecto.

### H2 · `accesibilidad/facturacion.spec.ts:38-82`: el spec sigue sin cubrir lo que el escenario de B-H6 y R2.6 piden medir

- **Paso 1 (`:38-50`):** no mira el selector de profesional. R2.6 dice: «El selector de profesional se ve y está dentro de la ventana (es el administrador)».
  - Escenario: el selector del administrador se sale por la derecha a 360 px (`max-w-xs` dentro de un contenedor que no lo encoge) y el spec sigue verde.
- **Paso 2 (`:58-60` frente a `:67`):** el `boundingBox` del diálogo se mide **antes** del envío vacío. R2.6 lo pide «con los mensajes de error pintados».
- **Paso 3 (`:75-82`):** comprueba que aparece «Motivo», pero no que el diálogo siga dentro de la ventana.
  - Escenario: los mensajes de error de cuatro campos y el motivo alargan el diálogo y sacan el botón de la ventana, y el spec sigue verde. Era la segunda mitad del escenario de B-H6.
- **Paso 4 (`:100-101`):** «Lucía Márquez» `.first()` en «Últimos cobros» ya está verde por el cobro de 0,01 € de una pasada anterior, porque la base no se borra.
  - El cierre del diálogo y «Cobro registrado» sí prueban el éxito. La línea de «Últimos cobros» no prueba nada propio de esta pasada.
- **R2.9:** dice que el importe entero a 360 px lo cubre «el paso 1 del spec», y ningún paso mira la lista del pendiente. Con la siembra recién hecha, además, la lista está vacía en el paso 1 (R2-V10).

### H3 · `app/(app)/facturacion/formulario-cobro.test.tsx:135`: el orden del foco se prueba con un único caso, y ese caso no distingue «el primero del orden» de «siempre `pacienteId`»

- El único caso trae errores en `fecha` y en `pacienteId`, y espera el foco en «Paciente».
- Faltan dos casos:
  - El que pide R2.3: «con errores del servidor en `fecha`, `document.activeElement.id === 'fecha'`». La prueba de la `:82` solo tiene el error de `fecha` y no mira el foco.
  - El de `motivo`, que pide R2.9.
- Escenario (razonado, sin ejecutar el mutante): un mutante `if (estado.errores) setCampoConFoco({ campo: 'pacienteId' })` deja la prueba verde.
  - Con él, un 23514 de fecha futura, que es el caso real de un paciente de Canarias, manda el foco a «Paciente».
  - Un error de `motivo` (`cobros_devolucion_motivo_ck`) también lo manda allí.
  - En los dos, el lector de pantalla no anuncia el campo que está mal.
- El mutante que ordena por `Object.keys` sí cae, porque el objeto de prueba empieza por `fecha`.

## BAJA

### H4 · `app/(app)/facturacion/bloques.test.tsx:240` y `datos.ts:67`: `?pagina=999999` va a la página 1, no a la última, y la prueba que dice lo contrario simula 99999

- `esquemaPagina` acepta como mucho 100000, y `datos.test.ts:152` fija que `'100001'` da 1. La prueba de bloques se titula «(?pagina=999999)» pero pasa `pagina: 99999` directamente al contexto simulado.
- Afirman que va a la última:
  - el comentario de `bloques.tsx:120`;
  - la bitácora («una página fuera de rango cae en la última»);
  - R2.9.
- Escenario: con 120 filas, `?pagina=999999` pinta «Del 1 al 50 de 120», sin «Anteriores». Cualquier número de más de 100000 se comporta igual.
- El diseño se contradice a sí mismo (`max(100000)` en R2.3 frente a «999999 cae en la última» en R2.9). Hay que alinear la prueba, el comentario y la bitácora con lo que se decida.

### H5 · `app/(app)/facturacion/datos.ts:270`: si falla `profesionales_del_pendiente`, el selector enseña «Todos los profesionales» con el filtro activo, y `datos.test.ts:362` lo da por bueno

- Escenario:
  1. El administrador está en `?profesional=<Ana>` y la función falla (timeout o 42501).
  2. `cargarOpcionesProfesional(PRO)` devuelve `[]` sin anteponer el elegido.
  3. `Desplegable` pinta su `marcador`, «Todos los profesionales» (`desplegable.tsx:109`).
  4. La métrica y la lista siguen filtradas por Ana.
- Era la segunda mitad del escenario de B-H3 («o opciones [] por un fallo»). R2.3 lo dejó así («Un fallo deja `[]`, como ahora»), y la prueba nueva lo fija con `PRO` como elegido.
- Pasa lo mismo en `:281-282`: un error al leer `directorio_perfiles` sale como «Profesional no encontrado». Es un error pintado como ausencia.

### H6 · `app/(app)/facturacion/bloques.tsx:177-186`: al llegar a la primera o a la última página se desmonta el enlace que tenía el foco

- Los enlaces son dos expresiones en posiciones fijas. React conserva el elemento de `Link` cuando sigue en su posición, pero lo desmonta cuando la condición pasa a `false`. `stateKey` no lleva la búsqueda (`layout-router.js:549`), así que el árbol se reconcilia y no se remonta.
- Escenario:
  1. Con el teclado, en la página 2 de 3, se pulsa Intro en «Siguientes».
  2. En la página 3 no hay «Siguientes»: el nodo enfocado desaparece y el foco cae en `body`. Pasa lo mismo de la 2 a la 1 con «Anteriores».
  3. El siguiente Tab vuelve a empezar desde arriba, y ninguna región anuncia el nuevo «Del 101 al 120 de 120».
- Es lo que pide el diseño («no se pinta»). El arreglo cabe sin pintar controles sin acción: por ejemplo, llevar el foco al rango o al título de la lista cuando cambia la página.

### H7 · `lib/i18n/es.ts:1383` y `datos.ts:226-229`: el aviso manda a comprobar en «Últimos cobros», y esa lista no enseña un cobro con fecha atrasada ni uno que quede fuera del filtro de profesional

- «Últimos cobros» son los 20 primeros ordenados por `fecha desc`.
- Escenario 1:
  1. El 07-10 se registra un cobro con fecha del 30-09, que el formulario permite (`max={hoy}`).
  2. Falla la red y sale «Mira «Últimos cobros» antes de repetirlo».
  3. Hay más de 20 cobros con fecha posterior al 30-09, así que el cobro que sí entró no aparece.
  4. El usuario concluye que no se registró y lo repite.
- Escenario 2: el administrador tiene puesto el filtro de otro profesional y el paciente no es suyo. El resultado es el mismo.
- El texto no afirma ni niega, como pide R2.9, pero el canal de comprobación que nombra no es fiable. La fila del paciente en el pendiente sí refleja el cobro.

### H8 · `app/(app)/facturacion/registrar-cobro.tsx:41`: el `role="status"` pasa de `sr-only`, siempre en el árbol de accesibilidad, a `empty:hidden`, que es `display:none` mientras está vacío

- Con `empty:hidden`, la región no existe para el lector de pantalla hasta que se le mete texto, y aparece ya rellena. Un `role="status"` (educado) que nace con su contenido no se anuncia de forma fiable (patrón «región viva creada ya rellena», T-028 B R2).
- Además coincide con la vuelta del foco al botón, que se anuncia antes.
- Escenario: un usuario de NVDA registra un cobro. Oye «Registrar cobro, botón» y no oye «Cobro registrado». En la ronda 1, con `sr-only`, la región existía desde el montaje.
- No lo he medido con un lector de pantalla. La clase la fija R2.3 tal cual. Basta con quitar `empty:hidden` y dejar el `<p>` vacío, que no ocupa nada visible.

## Fuera de mi ámbito, para el revisor A

`docs/state.md` (diff) dice que la transición `realizada → cancelada` mueve el pendiente «sin rastro». El texto de R2.7 dice lo contrario: «Queda rastro en `auditoria` (2 filas, `auditar_citas`)». No lo cuento.
