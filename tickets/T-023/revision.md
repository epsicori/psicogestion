**Sin hallazgos ALTA.** T-023 · ronda 2 · revisión combinada (A: base, RLS y dinero · B: interfaz) · diff `T-023-cobros-y-pendiente..worktree-agent-a65aa0bb5f872243e` (HEAD `27cd231`)

Recuento combinado: **0 ALTA, 3 MEDIA, 7 BAJA**. Los ids llevan el prefijo del revisor y su número original.
Duplicados unidos con la gravedad más alta:
- **A-H1** (BAJA) + la nota de B «Fuera de mi ámbito, para el revisor A» (`docs/state.md` dice «sin rastro»; B no la contaba).
- **A-H3** (BAJA) + **B-H5** (BAJA): error de la RPC o del directorio presentado como «Todos los profesionales» o «Profesional no encontrado». Por eso no hay B-H5 en la tabla.

Los textos de cada revisor siguen abajo sin cambios, salvo los ids.

| Id | Severidad | Dónde | Revisor |
|---|---|---|---|
| B-H1 | MEDIA | `app/(app)/facturacion/formulario-cobro.tsx:103` | B |
| B-H2 | MEDIA | `accesibilidad/facturacion.spec.ts:38` | B |
| B-H3 | MEDIA | `app/(app)/facturacion/formulario-cobro.test.tsx:135` | B |
| A-H1 | BAJA | `docs/state.md:27` | A+B |
| A-H2 | BAJA | `docs/state.md:30` | A |
| A-H3 | BAJA | `app/(app)/facturacion/datos.ts:281` | A+B |
| B-H4 | BAJA | `app/(app)/facturacion/bloques.test.tsx:240` | B |
| B-H6 | BAJA | `app/(app)/facturacion/bloques.tsx:177` | B |
| B-H7 | BAJA | `lib/i18n/es.ts:1383` | B |
| B-H8 | BAJA | `app/(app)/facturacion/registrar-cobro.tsx:41` | B |

---

# Revisor A (base, RLS y dinero)

**Sin hallazgos ALTA.** T-023 · ronda 2 · revisor A (base, RLS, dinero y constitución). 0 ALTA, 0 MEDIA, 3 BAJA.

Base: `worktree-agent-a65aa0bb5f872243e` (HEAD 27cd231), diff de la ronda `T-023-cobros-y-pendiente..` y
diff completo `main...`. He leído el código y no he ejecutado nada contra la base: la revisión es de solo
lectura y no he hecho reset ni seed.

## Hallazgos de la ronda 1 que me tocan

| R1 | Estado | Por qué |
|---|---|---|
| A-H1 ALTA | **Cerrado** | `profesionales_del_pendiente()` saca el nombre de `directorio_perfiles` (migración:192-200). En `app/(app)/facturacion/` no queda ningún `from('perfiles')`. G1 llama a la función como ADM, sin RLS fingida, y M16 cae en G1 porque `perfiles` solo devuelve la fila propia. |
| A-H2 MEDIA | **Cerrado** | La vista consolida en el superviviente: `p.fusionado_en is null` más `union all` de los absorbidos en los tres laterales, con un salto, que `fn_repuntar_fusionados` mantiene. La acción rechaza `fusionado_en` en `pacienteId` antes de insertar (acciones.ts:48-50), con su prueba y su gemela. Si una fusión ocurre entre la lectura y el insert, el cobro queda en el absorbido y la vista lo suma igual, así que no se pierde. |
| A-H3 MEDIA | **Cerrado** | La métrica sale de `resumen_pendiente` (un agregado, una fila). La lista se pide con `.range` de 50 y los nombres con `.in` de 50 ids como mucho. Los pacientes del formulario se leen de 1000 en 1000, con desempate por id y deduplicados. «Últimos cobros» lleva `limit 20`. No queda ninguna lectura sin tope ni ningún `.in()` sin tope. |
| A-H4 BAJA | **Cerrado** | E10a-d en los centros CK (Kiritimati) y CP (Pago Pago). La función lee el centro del paciente, no la sesión (`fn_validar_cobro`:51-52). |
| A-H5 BAJA | **Cerrado** | A5a da «sin fila», y su gemela A5b, con un bono de 10,00, da la fila exacta. M14 cae en A5a. |
| A-H6 BAJA | **Cerrado a medias** | Los cinco puntos están en `state.md`, pero dos no dicen lo que fija R2.7: uno niega un hecho medido y otro da por cerrado lo que el diseño deja abierto. Va como A-H1. |

## Lista R2.9 (revisor A), punto por punto

- **El absorbido no tiene fila y el superviviente sale una vez.** Se cumple: `where p.fusionado_en is null`
  (migración:138) y `p.id` es la clave, con tres laterales que agregan. F1 y F2 lo comprueban, este con
  `count = 1`.
- **Cada lateral suma el `union all`, en un solo salto y sin `coalesce`.** Se cumple: las tres ramas usan
  `m.fusionado_en = p.id` (líneas 117-119, 127-129 y 134-136). Busqué las variantes que no se dan:
  - `m.fusionado_en is not null` sumaría lo de P30F a P30A, y caerían los casos B;
  - mirar la familia en el recorte del técnico o del profesional caería en F6 y en F4.
- **La tarifa contra `c.paciente_id`.** Se cumple (línea 109). M13 da `dev=27000`. La variante contraria,
  buscar la tarifa en toda la familia, pondría la cita de P30E a 70 en lugar de 60 y daría `dev=29000`; F2
  la caza.
- **El recorte por rol mira el `p.id` del superviviente.** Se cumple. `es_profesional_asignado(p.id)`, con
  `p` superviviente, solo es cierto para su profesional (rls_funciones:100-106), y por eso F4 da cero filas a
  PRO2.
- **F5/F6, la decisión deliberada. La juzgo aceptable y no es un BLOQUEO.**
  - El absorbido y el superviviente son la misma persona (ADR-031).
  - La fila solo lleva importes y no lleva sesiones, tipos ni fechas.
  - El técnico de CA ya podía ver el pendiente de esa persona en su centro. La fusión le suma importes de
    CB sin ningún dato clínico.
  - TEC2 deja de ver la fila, y es coherente: la persona ya no es de su centro. Tampoco puede registrar un
    cobro, porque la acción rechaza al absorbido.
  - La consecuencia que sí queda sin anotar es una incoherencia de pantalla (A-H2).
- **PRO2 sigue leyendo en `cobros` lo de P30F, sin fila en la vista.** Se cumple, pero el diseño dice
  «queda anotado» y no está ni en `state.md` ni en la bitácora (A-H2).
- **Las dos funciones.**
  - Son `security invoker`, con `search_path = ''`, `revoke … from public, anon` y `grant` a `authenticated`.
    A9b lo lee del catálogo.
  - `p_profesional_id` no puede ampliar nada. El filtro es una conjunción sobre una vista que ya recorta por
    `rol_actual()`, y aunque el planificador lo empuje bajo la barrera, `uuid_eq` es leakproof y solo quita
    filas. G5 lo comprueba con su gemela.
  - `profesionales_del_pendiente` no lee `perfiles` (M16) y devuelve solo `id, nombre_completo`.
  - Al técnico solo le da nombres que `directorio_perfiles` ya le enseña.
- **`max_rows` y `.in()`.** Ver A-H3: no queda ninguna lectura sin tope.
- **E10.** La zona sale del centro del paciente. M15 se midió una vez, a las 10:42 de Madrid en horario de
  verano. A esa hora Pago Pago va 13 h por detrás, así que «hoy» allí es ayer en Madrid y el mutante acepta
  E10d. La tabla de R2.2 se sostiene:
  - en invierno, [11, 24) ∪ [0, 12) cubre el día;
  - en verano, [12, 24) ∪ [0, 13) también;
  - ni Kiritimati ni Pago Pago tienen horario de verano;
  - `now()` es constante en la transacción compartida, así que `\gset` y el disparador ven el mismo instante.
  - Con la tabla basta, sin medir a una segunda hora.
- **Aserciones existentes.**
  - No cambia ningún valor esperado.
  - No había recuentos por prefijo: D1-D9 ya iban por lista explícita.
  - P30D (con el bono de A5b), P30E, P30K y P30P son de PRO1 o de CA y no tocan ninguna lista de los
    bloques B, C y D.
- **Gemelas y códigos.** F4 y F6 llevan su gemela (`P30B ≠ sin fila`) y G5 la suya (`filas >= 3`). E10b y
  E10d comprueban 23514 y el fragmento del mensaje.
- **Constitución, regla 6.** El diff no tiene ningún UPDATE ni DELETE sobre `cobros`, `bonos`, `facturas`
  ni `auditoria`. Los únicos `update` son de `citas.estado`, en la fijación y como `postgres`. Los `update`,
  `delete` y `truncate` sobre `cobros` solo aparecen como negativas (E1-E6, 42501).

## Mutantes M11-M17: ¿caen por el motivo correcto?

| M | Cae en | ¿Motivo correcto? |
|---|---|---|
| M11 | F1, con `dev=22000` | Sí. 22000 son la cita de P30F a 70 más su bono de 150, que salen como fila propia. F2 también caería por el `count = 1`. |
| M12a | F2, con `dev=21000` | Sí: 60 + 150, sin la cita del absorbido. |
| M12b | F2, con `dev=13000` | Sí: 60 + 70, sin el bono. |
| M12c | F2, con `cob=2000` | Sí: solo el cobro de P30E. |
| M13 | F2, con `dev=27000` | Sí: la cita de P30F a la tarifa base de 60, porque P30E no tiene tarifa propia. |
| M14 | A5a, con `dev=0 est=cobrado` | Sí: P30D sale con ceros. |
| M15 | E10d a las 10:42 | Sí, y en la otra franja caería en E10a (ver arriba). |
| M16 | G1 | Sí: el administrador lee 0 perfiles ajenos, el `array_agg` sale nulo y `assert` trata el nulo como fallo (`is distinct from true`). |
| M17 | G4 y G5 | Sí: el agregado sin filtro no iguala al de PRO1, y como PRO1 ve sus filas y no ceros. |

## Hallazgos

### A-H1 · BAJA · `docs/state.md:27` y `:31`: dos de los textos de R2.7 cambian el hecho que anotan

- **Línea 27.** Dice que el paso `realizada → cancelada` mueve el pendiente «**sin rastro**». R2.7 y el
  juicio de la ronda 1 (revision-a.ronda1.md:89) dicen lo contrario, medido: quedan 2 filas en `auditoria`
  (`auditar_citas`) y el técnico no puede hacerlo (UPDATE 0). La línea también pierde «ticket aparte, de
  agenda».
- **Línea 31.** Borra la línea antigua «`directorio_perfiles` sin prueba RLS» y dice que 30-cobros «cierra el
  hallazgo … para esa vista». R2.7 pedía añadir el texto a la línea existente con «sigue sin módulo propio».
  G1-G3 solo ejercen la vista a través de `profesionales_del_pendiente()` y con tres sesiones (ADM, PRO1 y
  rol nulo). Ninguna aserción lee la vista directamente ni mira qué ven el técnico o un profesional de las
  columnas `rol`, `estado` y `centro_id`.
- **Escenario.** Quien abra el ticket de la guarda de transición lee «sin rastro» y lo prioriza o lo diseña
  como un hueco de auditoría que no existe. Quien triage los hallazgos lee «cierra» y descarta el módulo
  RLS de `directorio_perfiles`. Así, una política que el técnico lea de más en las tres pantallas de
  administración seguiría sin ninguna prueba que la cace.

### A-H2 · BAJA · `docs/state.md:30`: la nota de «Últimos cobros» cubre una puerta de tres

- **Qué pasa.** La vista suma al superviviente los cobros de sus absorbidos. `cobros_lectura`, en cambio,
  recorta por el registro del cobro (economico_esquema:1157-1168, sin resolver la fusión para el técnico).
- **Qué está anotado.** Solo el caso del filtro del administrador.
- **Qué falta.** Dos casos más:
  - el técnico del centro del superviviente;
  - el profesional del absorbido. R2.9 dice que su caso «queda anotado», y no está ni en `state.md` ni en
    `docs/bitacora/T-023.md`.
- **Escenario, con la fijación del banco.**
  - TEC1, de CA, ve a «Elsa» con `cobrado = 70,00 €` (F5). En «Últimos cobros» solo encuentra el cobro de
    20,00 de P30E: el de 50,00 de P30F, en CB, no lo ve, y no puede cuadrar la cifra con la lista.
  - PRO2 ve en «Últimos cobros» el cobro de 50,00 de «Fede» y ningún pendiente de esa persona.
  - No cambia ninguna cifra, y no hay ninguna nota que lo explique ni ticket que lo recoja.

### A-H3 · BAJA · `app/(app)/facturacion/datos.ts:281-282`: un error al leer el directorio se rotula como «Profesional no encontrado»

- **Qué pasa.** Si la lectura de `directorio_perfiles` del elegido falla, el error se registra y la opción se
  pinta con `t('cobros.profesionalDesconocido')`, el mismo texto que «no existe». Ninguna prueba de
  `datos.test.ts` cubre esa rama: la de la línea 216 simula `data: null` sin error.
- **Escenario.**
  1. El administrador abre `?profesional=<uuid de Bruno>` y Bruno no tiene filas en la vista, así que no
     sale entre las opciones.
  2. La lectura del directorio da un error transitorio.
  3. El desplegable afirma «Profesional no encontrado» de un profesional que existe, mientras la lista y la
     métrica siguen filtradas por él.
- **Lo que esperaría.** Que un error pinte un rótulo neutro, o el uuid. «No encontrado» solo debería
  salir cuando la lectura acaba bien y no trae la fila.

## Mirado sin hallazgo

- `resumen_pendiente` devuelve siempre una fila, porque es un agregado sin `group by`, y `cargarResumen`
  trata como error cualquier otra cosa y los números que no sean enteros seguros.
- La paginación usa el mismo orden que el diseño: `excedente desc, pendiente desc, paciente_id`.
  `?pagina` fuera de rango cae en la última página.
- La acción solo rechaza al absorbido a quien ya lo ve bajo RLS, así que no abre ningún oráculo nuevo.
- La columna `fusionado_en` se lee con el grant de tabla (`grant select … pacientes to authenticated`).
- El `fusionado_en` del simulador de `acciones.test.ts` es una marca de tiempo y no un uuid. Es inocuo,
  porque la guarda solo mira que no sea nulo, y no hay ningún escenario de fallo.
- `tipos-bd.ts` está regenerado, con `p_profesional_id?` opcional y `Args: never`.
- El 30 es el último módulo de la transacción compartida. Las filas de PRO1 en `perfiles_centros` (CK y CP)
  y los centros nuevos no alcanzan a ningún módulo posterior.

---

# Revisor B (interfaz)

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
| Foco al primer campo con error, en orden, también con `motivo` | **El código está bien; la prueba no basta (B-H3).** |
| `catch`: estado con salida; el texto no afirma ni niega | **El texto está bien y el diálogo vuelve a poder cerrarse.** El `router.refresh()` del `catch` lo anula justo en el caso para el que existe (B-H1). El canal de comprobación que propone el texto no siempre enseña el cobro (B-H7). |
| Cierre: con envío en vuelo no cierra; sin envío sí, y el foco vuelve | **OK.** Escape, la X y el clic fuera pasan por el mismo `alCerrar` (`dialogo.tsx:29`, `:71`). El efecto que avisa del fin del envío se vuelve a lanzar al remontar, así que el `enviando=true` que queda en el padre tras un éxito no bloquea la siguiente apertura. |
| Paginación: el enlace que no aplica no se pinta | **OK**, pero al quitar el enlace enfocado se pierde el foco (B-H6). |
| El `href` conserva `?profesional` y el selector quita `pagina` | **OK**, con prueba en los dos sitios. |
| `?pagina=999999` cae en la última y `?pagina=abc` en la 1 | **`abc` va a la 1. `999999` también va a la 1, no a la última** (B-H4). |
| `Pildora success`: ¿algún sitio dependía del verde para distinguir estados? | **No.** Recorridas las 7 pantallas de R2-V7, cada píldora lleva su propio texto. El único caso en que el tono cambia y el texto no es `panel-datos.tsx:61` (representante vigente o no), y allí `:76-79` lo dice con texto («Ya no vigente» o «Vigente desde…»). |
| La prueba de `piezas.test.tsx` cae con el `success` antiguo por el `/` | **OK.** `bg-primary/10` da `fondo[2] = '/10'`, así que cae en la aserción «el fondo lleva opacidad», que es la correcta. |
| El importe se lee entero a 360 px | **En jsdom sí** (`bloques.test.tsx`, sin `truncate` y con `break-words`). **El paso 1 del spec no mira la lista** (B-H2). |
| Si fallan los pacientes, `AvisoDeError` en lugar del botón | **OK** (`page.tsx:24` y `page.test.tsx`). |
| Atajo `(evento) => handleSubmit(fn)(evento)` del React Compiler | **Correcto.** Aplaza al evento la lectura del ref que `react-hooks/refs` prohíbe en el render. Se crea un manejador por envío, que es barato, y el lint queda limpio. Hay precedente en `dialogo-de-copia.tsx:227` (con `void`). Sin hallazgo. |

## Hallazgos de la ronda 1 (B)

| R1 | Estado |
|---|---|
| B-H1 (`try/catch`) | **Cerrado en jsdom.** El `catch` existe y el formulario sigue montado. Queda una variante nueva: el `refresh` del `catch` recarga la página entera cuando falla la red (B-H1). |
| B-H2 (`disabled` y foco) | **Cerrado** en el código. Solo hay prueba de una de las tres ramas del orden (B-H3). |
| B-H3 (selector con valor ajeno) | **Cerrado para la URL escrita a mano.** Sigue abierto en la otra mitad de mi escenario, «opciones [] por un fallo», y ahora una prueba lo da por bueno (B-H5). |
| B-H4 (`Pildora success` a 1,13:1) | **Cerrado.** Medido: 7,95:1, y el par está en `PARES`. |
| B-H5 (`.in` sin límite) | **Cerrado.** Como mucho 50 ids por `.range`. |
| B-H6 (spec) | **A medias.** Ya entra como administrador y hace un envío completo. Sigue sin mirar el selector ni el diálogo con los errores o el motivo a la vista, que eran mi escenario (B-H2). |
| B-H7 (`truncate`) | **Cerrado en jsdom.** No hay medida en navegador (B-H2). |
| B-H8 (matiz de `Metrica`) | **Cerrado.** Medido: 5,33:1, y solo lo usa Facturación. |
| B-H9 (pacientes como `[]`) | **Cerrado.** |
| B-H10 (más de 1000 pacientes) | **Cerrado.** Se leen por páginas de 1000 hasta agotarlos. |
| B-H11 (Escape en vuelo, aviso `sr-only`) | **Cerrado.** Pero el aviso visible lleva ahora `empty:hidden` (B-H8). |

## MEDIA

### B-H1 · `app/(app)/facturacion/formulario-cobro.tsx:103`: el `router.refresh()` del `catch` recarga la página entera justo cuando ha fallado la red, y se pierde el aviso que el `catch` acaba de poner

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

### B-H2 · `accesibilidad/facturacion.spec.ts:38-82`: el spec sigue sin cubrir lo que el escenario de B-H6 y R2.6 piden medir

- **Paso 1 (`:38-50`):** no mira el selector de profesional. R2.6 dice: «El selector de profesional se ve y está dentro de la ventana (es el administrador)».
  - Escenario: el selector del administrador se sale por la derecha a 360 px (`max-w-xs` dentro de un contenedor que no lo encoge) y el spec sigue verde.
- **Paso 2 (`:58-60` frente a `:67`):** el `boundingBox` del diálogo se mide **antes** del envío vacío. R2.6 lo pide «con los mensajes de error pintados».
- **Paso 3 (`:75-82`):** comprueba que aparece «Motivo», pero no que el diálogo siga dentro de la ventana.
  - Escenario: los mensajes de error de cuatro campos y el motivo alargan el diálogo y sacan el botón de la ventana, y el spec sigue verde. Era la segunda mitad del escenario de B-H6.
- **Paso 4 (`:100-101`):** «Lucía Márquez» `.first()` en «Últimos cobros» ya está verde por el cobro de 0,01 € de una pasada anterior, porque la base no se borra.
  - El cierre del diálogo y «Cobro registrado» sí prueban el éxito. La línea de «Últimos cobros» no prueba nada propio de esta pasada.
- **R2.9:** dice que el importe entero a 360 px lo cubre «el paso 1 del spec», y ningún paso mira la lista del pendiente. Con la siembra recién hecha, además, la lista está vacía en el paso 1 (R2-V10).

### B-H3 · `app/(app)/facturacion/formulario-cobro.test.tsx:135`: el orden del foco se prueba con un único caso, y ese caso no distingue «el primero del orden» de «siempre `pacienteId`»

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

### B-H4 · `app/(app)/facturacion/bloques.test.tsx:240` y `datos.ts:67`: `?pagina=999999` va a la página 1, no a la última, y la prueba que dice lo contrario simula 99999

- `esquemaPagina` acepta como mucho 100000, y `datos.test.ts:152` fija que `'100001'` da 1. La prueba de bloques se titula «(?pagina=999999)» pero pasa `pagina: 99999` directamente al contexto simulado.
- Afirman que va a la última:
  - el comentario de `bloques.tsx:120`;
  - la bitácora («una página fuera de rango cae en la última»);
  - R2.9.
- Escenario: con 120 filas, `?pagina=999999` pinta «Del 1 al 50 de 120», sin «Anteriores». Cualquier número de más de 100000 se comporta igual.
- El diseño se contradice a sí mismo (`max(100000)` en R2.3 frente a «999999 cae en la última» en R2.9). Hay que alinear la prueba, el comentario y la bitácora con lo que se decida.

### B-H5 (unido a A-H3) · `app/(app)/facturacion/datos.ts:270`: si falla `profesionales_del_pendiente`, el selector enseña «Todos los profesionales» con el filtro activo, y `datos.test.ts:362` lo da por bueno

- Escenario:
  1. El administrador está en `?profesional=<Ana>` y la función falla (timeout o 42501).
  2. `cargarOpcionesProfesional(PRO)` devuelve `[]` sin anteponer el elegido.
  3. `Desplegable` pinta su `marcador`, «Todos los profesionales» (`desplegable.tsx:109`).
  4. La métrica y la lista siguen filtradas por Ana.
- Era la segunda mitad del escenario de B-H3 («o opciones [] por un fallo»). R2.3 lo dejó así («Un fallo deja `[]`, como ahora»), y la prueba nueva lo fija con `PRO` como elegido.
- Pasa lo mismo en `:281-282`: un error al leer `directorio_perfiles` sale como «Profesional no encontrado». Es un error pintado como ausencia.

### B-H6 · `app/(app)/facturacion/bloques.tsx:177-186`: al llegar a la primera o a la última página se desmonta el enlace que tenía el foco

- Los enlaces son dos expresiones en posiciones fijas. React conserva el elemento de `Link` cuando sigue en su posición, pero lo desmonta cuando la condición pasa a `false`. `stateKey` no lleva la búsqueda (`layout-router.js:549`), así que el árbol se reconcilia y no se remonta.
- Escenario:
  1. Con el teclado, en la página 2 de 3, se pulsa Intro en «Siguientes».
  2. En la página 3 no hay «Siguientes»: el nodo enfocado desaparece y el foco cae en `body`. Pasa lo mismo de la 2 a la 1 con «Anteriores».
  3. El siguiente Tab vuelve a empezar desde arriba, y ninguna región anuncia el nuevo «Del 101 al 120 de 120».
- Es lo que pide el diseño («no se pinta»). El arreglo cabe sin pintar controles sin acción: por ejemplo, llevar el foco al rango o al título de la lista cuando cambia la página.

### B-H7 · `lib/i18n/es.ts:1383` y `datos.ts:226-229`: el aviso manda a comprobar en «Últimos cobros», y esa lista no enseña un cobro con fecha atrasada ni uno que quede fuera del filtro de profesional

- «Últimos cobros» son los 20 primeros ordenados por `fecha desc`.
- Escenario 1:
  1. El 07-10 se registra un cobro con fecha del 30-09, que el formulario permite (`max={hoy}`).
  2. Falla la red y sale «Mira «Últimos cobros» antes de repetirlo».
  3. Hay más de 20 cobros con fecha posterior al 30-09, así que el cobro que sí entró no aparece.
  4. El usuario concluye que no se registró y lo repite.
- Escenario 2: el administrador tiene puesto el filtro de otro profesional y el paciente no es suyo. El resultado es el mismo.
- El texto no afirma ni niega, como pide R2.9, pero el canal de comprobación que nombra no es fiable. La fila del paciente en el pendiente sí refleja el cobro.

### B-H8 · `app/(app)/facturacion/registrar-cobro.tsx:41`: el `role="status"` pasa de `sr-only`, siempre en el árbol de accesibilidad, a `empty:hidden`, que es `display:none` mientras está vacío

- Con `empty:hidden`, la región no existe para el lector de pantalla hasta que se le mete texto, y aparece ya rellena. Un `role="status"` (educado) que nace con su contenido no se anuncia de forma fiable (patrón «región viva creada ya rellena», T-028 B R2).
- Además coincide con la vuelta del foco al botón, que se anuncia antes.
- Escenario: un usuario de NVDA registra un cobro. Oye «Registrar cobro, botón» y no oye «Cobro registrado». En la ronda 1, con `sr-only`, la región existía desde el montaje.
- No lo he medido con un lector de pantalla. La clase la fija R2.3 tal cual. Basta con quitar `empty:hidden` y dejar el `<p>` vacío, que no ocupa nada visible.

## Fuera de mi ámbito, para el revisor A

`docs/state.md` (diff) dice que la transición `realizada → cancelada` mueve el pendiente «sin rastro». El texto de R2.7 dice lo contrario: «Queda rastro en `auditoria` (2 filas, `auditar_citas`)». No lo cuento.
