Sin hallazgos ALTA. 0 ALTA, 0 MEDIA, 3 BAJA.

# T-023 · Ronda 4 · Revisor B (cliente, accesibilidad y spec)

Diff revisado: `git diff worktree-agent-a875b9deffe28f1da..worktree-agent-af4665097e6d61770 -- . ':!tickets'` (tres commits, de df74d83 a afcc774), más `tickets/T-023/mutantes.json` (`ts_ronda_4`). Lo he leído con `git show` sobre la rama. No he ejecutado el spec. Un mutante (el de H3) lo he medido con vitest sobre una copia `git archive` de afcc774, nunca en el worktree. Después he quitado el junction y he borrado la copia.

## Estado de los hallazgos B de la ronda 3

| Id R3 | Estado | Por qué |
|---|---|---|
| B-H1 (MEDIA) | **Cerrado**, con un residuo por otra puerta (H2) | La clave vive en `RegistrarCobro` (`registrar-cobro.tsx:28`), que no se desmonta al cerrar el diálogo. La huella está normalizada (`esquemas.ts:89`). El aviso ya no nombra ningún botón (`es.ts`, M34). Cerrar y reabrir con «0.01» lleva el mismo id: lo prueban `registrar-cobro-clave.test.tsx:56` y el paso 8 del spec. |
| B-H2 (MEDIA) | **Cerrado** | `lista.or(vacia).first()` (`spec:140`). El tope de 18 va sobre todas las filas de la lista (`totalAntes`). El paso cuenta `+ 1` sobre las de Lucía y también sobre el total, en el testigo y al final. |
| B-H3 (BAJA) | **Cerrado** | `spec:163-164` guarda el estado y el cuerpo. `spec:186-187` exige un 200 y «Cobro registrado». El recuento del testigo (`spec:196-200`) confirma que la fila entró antes del reintento. |
| B-H4 (BAJA) | **Cerrado** | `paginacion-pendientes.tsx:40-43`: un clic con modificador o con otro botón no marca nada. `:33-38`: un destino que no llega se apaga sin enfocar. M30 y M31 caen. Abajo, en las notas, queda un residuo que no cuento. |
| B-H5 (= A-H4, BAJA) | **Cerrado** | Con filtro, `page.tsx:37-52` pinta el texto propio y el enlace a `/facturacion`. La gemela sin filtro no pinta ningún enlace. Las medidas, abajo. |

## La lista de «qué revisar» (R4.7, revisor B)

- **Solo un éxito olvida una clave.** En el código, sí:
  - `registrar-cobro.tsx:69-70` es la única llamada a `delete`. Solo se llega desde `formulario-cobro.tsx:100-102`, cuando `estado.mensaje === cobroRegistrado` y no hay errores.
  - El `catch`, `fallo()`, un error de campo y `resultadoDesconocido` del servidor no tocan el `Map`. Cerrar (`alCerrar`) tampoco.
  - En las pruebas, «solo la suya» no se comprueba: un éxito que vacía el `Map` entero sobrevive a toda la batería. Ver H3.
- **El motivo solo cuenta en una devolución.** `esquemas.ts:89-98` tiene `centimos < 0 ? motivo : null`, igual que la regla del `insert` según el diseño. Las cuatro pruebas de `esquemas.test.ts` lo cubren.
- **El formulario no llama a `claveDeEnvio` durante el render.** Solo lo llama en `alSerValido` (`formulario-cobro.tsx:95-96`), que corre en el manejador del submit, nunca en el render.
- **El aviso no nombra ningún botón.** Se cumple y hay prueba (`registrar-cobro-clave.test.tsx:141`, M34).
- **Spec, paso 2.** Espera `lista.or(vacia)` y pone el tope sobre todas las filas. `Cargando` no pinta `<li>` (`piezas.tsx:245-256`), así que el esqueleto no se cuela en `totalAntes`.
- **Spec, paso 7.** Cuenta en un contexto nuevo, con red y antes de reabrir (`spec:191-203`). Usa la URL absoluta. El `finally` cierra el contexto.
- **Spec, paso 8.** Cierra de verdad con Escape, comprueba que el diálogo se oculta y que el foco vuelve al disparador, y escribe `'0.01'`.
- **Nada depende de filas anteriores.** `antes` y `totalAntes` se miden en cada ejecución. Con 0 filas (recién sembrado), el `or` encuentra el estado vacío. Con hasta 18, el `+ 1` cabe en las 20 de la lista. Por encima de 18 el paso falla en rojo y con un mensaje que lo explica, nunca en verde.
- **La paginación.** Ya está arriba (B-H4).
- **El enlace del aviso.** Mide 44 px (`min-h-11`, `inline-flex`). Usa el mismo par de color que el mensaje (`text-destructive` sobre `bg-destructive/10`). Lo he calculado con los tokens de `globals.css` en oklch, sobre `--background`: el texto da unos 5,0:1 y el anillo `outline-ring` unos 3,7:1 contra el fondo del aviso. Las dos cifras pasan (4,5:1 y 3:1). El enlace está dentro del `role="alert"`, así que se anuncia con el aviso.

## Lo que preguntaba el orquestador

- **¿Qué id lleva el tercer A en A, B, A?**
  - Si A sale bien primero, se borra su clave, y el tercer A lleva un id nuevo. Es lo correcto: es otro cobro.
  - Si fallan A y B, el tercer A recupera idA. Lo prueba la prueba «A, B, A».
  - Si A falla, B sale bien y luego se reenvía A, el código lleva idA, pero ninguna prueba lo exige. Ver H3.
- **¿Crece sin límite?** Gana una entrada por cada huella distinta que no ha salido bien: una cadena de unos 150 bytes y un UUID. Es memoria despreciable. El problema no es el tamaño, es lo que tarda en olvidarse. Ver H1.
- **¿Sobrevive a lo que debe y solo a eso?**
  - Una recarga lo vacía. Es un `useRef`.
  - Salir de la página **no** lo vacía, en contra de lo que suponen el diseño («Lo que no entra en la ronda 4») y el aviso («sin salir de la página»). Con `cacheComponents: true` (`next.config.ts`), Next oculta la ruta con `<Activity>` en vez de desmontarla, y conserva el estado de hasta 3 rutas. Lo he comprobado en `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` y en `client/components/bfcache-state-manager.js:13` (`MAX_BF_CACHE_ENTRIES = 3`). Que el aviso se quede corto no hace daño. Lo que sí hace daño es que la clave dure toda la jornada (H1).
  - Al revés, se vacía sin salir de la página si `AccionRegistrar` cambia el botón por un aviso (H2).
- **El texto nuevo y su anuncio.**
  - La región `aria-live="polite"` del formulario está montada desde el principio y empieza vacía en cada apertura.
  - Un segundo «No sabemos…» en el mismo diálogo se vuelve a anunciar: el `setMensaje('')` del manejador se confirma antes de que llegue la respuesta.
  - El texto no nombra botones y dice «esta ventana», que es correcto para un diálogo. No encuentro escenario de fallo.
- **Paso 4, estabilidad.**
  - El único `waitForTimeout(1500)` es el de R3 (`spec:179`). Es una ventana negativa («no navega en 1,5 s»): no espera a que algo aparezca, así que no hace el paso intermitente. Una navegación posterior se perdería, pero una recarga sin red falla enseguida y se ve en `framenavigated`.
  - El resto son esperas por condición.
  - `cortado = true` va antes del primer `await` (`spec:162`).
  - `respuesta.text()` espera al cuerpo entero, y la acción ya ha confirmado la transacción cuando el testigo lee.
  - El servidor de pruebas es `npm run start` (`playwright.config.ts`), así que no aparece el 500 de Turbopack. Si apareciera, el paso saldría en rojo, nunca en verde.
  - Ninguna otra acción de servidor se dispara sola en el armazón: todas las de `components/armazon` y `app/(app)/acciones.ts` necesitan un gesto. Así que la primera POST con `next-action` es la del cobro.

## Hallazgos

### H1 · BAJA · `app/(app)/facturacion/registrar-cobro.tsx:28` (con `acciones.ts:61`)
**Una clave de un resultado desconocido que sí entró no se olvida nunca, y se traga en silencio el siguiente cobro idéntico, con «Cobro registrado».** El paso 2b reconoce la clave propia y contesta éxito sin `insert`. Con Activity, el `Map` dura mientras `/facturacion` esté entre las tres últimas rutas, que en una recepción es toda la jornada.

Escenario:
1. A las 10:00 se registra 60,00 EUR en efectivo de Lucía, sin referencia. Se corta la red y el cobro sí entra. Sale «No sabemos…».
2. El usuario cambia el filtro de profesional para comprobarlo. La lista, ya revalidada, enseña el cobro, así que no reenvía. La clave sigue en el `Map`.
3. Va a Agenda y vuelve: Activity conserva el `Map`.
4. A las 18:00 Lucía paga en efectivo otra sesión de 60,00 EUR del mismo día. La huella es la misma, así que viaja idA.
5. El paso 2b encuentra la fila de las 10:00 y contesta «Cobro registrado» sin insertar.

El cobro de las 18:00 no queda anotado y el pendiente de Lucía sale 60,00 EUR más alto. Le reclamarán un dinero que ya pagó, y el usuario recibió una confirmación falsa.

Mitigaciones baratas, a elegir:
- que 2b y la relectura tras el 23505 contesten un mensaje propio («Ese cobro ya estaba registrado»), que el cliente trate como éxito y que el usuario sí distinga;
- o que la clave caduque al cabo de unos minutos.

### H2 · BAJA · `app/(app)/facturacion/page.tsx:25`
**El `Map` se pierde sin salir de la página.** Si `cargarPacientesParaCobro` falla en un render posterior, `AccionRegistrar` cambia `<RegistrarCobro>` por `<AvisoDeError>`, y eso desmonta la isla y su `Map`. Los renders posteriores llegan al cambiar el filtro (`selector-profesional.tsx:34`, `router.replace`), al paginar o al pulsar el enlace nuevo «Ver las cifras de todos los profesionales».

Escenario:
1. La base va a tirones, que es justo lo que produce el «No sabemos…», y el primer envío de 60,00 EUR sí entró. Sale el aviso.
2. El administrador cierra el diálogo y cambia el filtro para mirar la lista. En ese render, los pacientes dan un timeout y el botón pasa a ser «No se ha podido cargar la lista de pacientes». «Últimos cobros» también falla o todavía no enseña nada.
3. Vuelve a cambiar el filtro y el botón reaparece con un `RegistrarCobro` nuevo, con el `Map` vacío.
4. Rellena los mismos datos, como le pide el aviso («sin salir de la página»). El envío lleva un id nuevo y deja un cobro duplicado que no se puede borrar (regla 6).

Lo cerraría que el `Map` viva por encima de la rama condicional, o que `RegistrarCobro` se monte siempre y pinte él el aviso de pacientes.

### H3 · BAJA · `app/(app)/facturacion/registrar-cobro-clave.test.tsx:56`
**«Solo un éxito olvida su clave» solo se prueba con la misma huella.** Si `alRegistrar` vacía el `Map` entero (`claves.current.clear()`) en lugar de borrar su huella, toda la batería sigue en verde. Lo he medido sobre una copia `git archive` de afcc774, con `registrar-cobro.tsx:70` cambiado a `claves.current.clear(); void huella;`: `vitest run "app/(app)/facturacion/"` da 11 ficheros y 207 pruebas en verde.
- La prueba 1 tiene un éxito de la misma huella, y ahí `clear` y `delete` hacen lo mismo.
- Las pruebas 2, 3 y 4 no tienen ningún éxito.
- El M25 de `mutantes.json` es otro: hace `clear()` antes de guardar.

Escenario del fallo que la batería no ve:
1. A (60,00 EUR a Lucía) da resultado desconocido y sí entró.
2. Sin cerrar la página, se registra B (40,00 EUR a otro paciente), que sale bien. Con el mutante, la clave de A desaparece.
3. Se reenvía A como pide el aviso. Lleva un id nuevo y queda un cobro duplicado.

Lo cerraría una prueba «A desconocido, B con éxito, A otra vez → idA».

## Lo que he mirado y no cuento

- **Residuo de B-H4 en la paginación, por un recorte.**
  1. Se pulsa «Siguientes» en la 2, así que `destino` vale 3.
  2. Entretanto, otro usuario deja la lista en dos páginas, y el servidor recorta `?pagina=3` a la 2 (`bloques.tsx`, `Math.min`).
  3. `pagina` no cambia, el efecto no corre y `destino` se queda en 3.
  4. Si después una devolución propia, vía `revalidatePath`, devuelve una tercera página con la URL todavía en `?pagina=3`, el efecto enfoca el rango y le quita el foco al disparador.
  
  Hacen falta tres sucesos ajenos encadenados. Lo dejo como nota.
- **Activity vuelve a ejecutar los efectos al mostrar la ruta**: el de `PaginacionPendientes` enfocaría el rango si `destino === pagina` al volver. Para eso habría que pulsar «Siguientes» y salir antes de que llegue la página nueva, y volver justo a esa página. No encuentro un camino real.
- **`crypto.randomUUID`** solo existe en contexto seguro. Si lanzara, `enviandoRef` se quedaría en `true` (`formulario-cobro.tsx:91-96`). Pero en local se usa `127.0.0.1` y en producción HTTPS, y la llamada ya estaba en R3.
- **El testigo del paso 7** se crea con `browser.newContext`, que no hereda el `use` del proyecto. Solo importan `baseURL`, que se sustituye por la URL absoluta, y las cookies, que van en `storageState`. Sin efecto.
