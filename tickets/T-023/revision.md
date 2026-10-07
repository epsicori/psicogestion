**Sin hallazgos ALTA.** T-023 · ronda 4 · revisión combinada (A: acción del servidor, datos y constitución · B: cliente, accesibilidad y spec) · rama `worktree-agent-af4665097e6d61770` (HEAD `afcc774`), diff de la ronda `worktree-agent-a875b9deffe28f1da..worktree-agent-af4665097e6d61770`

Recuento combinado: **0 ALTA, 0 MEDIA, 4 BAJA**. Los ids llevan el prefijo del revisor y su número original.
Duplicado unido:
- **A-H1** (BAJA) + **B-H1** (BAJA): la clave de un resultado desconocido que sí entró no caduca (solo un éxito la borra y Activity la conserva al salir de la página), y el paso 2b contesta «Cobro registrado» sin insertar el siguiente cobro idéntico. Por eso no hay B-H1 en la tabla.

Hallazgos de la ronda 3: A-H1, A-H3, A-H4 (con B-H5), B-H2, B-H3 y B-H4 cerrados; A-H2 cerrado para fusión y zona, con residuo en A-H2 de esta ronda; B-H1 cerrado, con residuo por otra puerta en B-H2 de esta ronda. El residuo de B-H4 por recorte de página queda como nota de B, sin contar.

Los textos de cada revisor siguen abajo sin cambios, salvo los ids y el nivel de los títulos.

| Id | Severidad | Dónde | Revisor |
|---|---|---|---|
| A-H1 | BAJA | `app/(app)/facturacion/acciones.ts:61` (con `registrar-cobro.tsx:28`) | A+B |
| A-H2 | BAJA | `app/(app)/facturacion/acciones.ts:59` | A |
| B-H2 | BAJA | `app/(app)/facturacion/page.tsx:25` | B |
| B-H3 | BAJA | `app/(app)/facturacion/registrar-cobro-clave.test.tsx:56` | B |

---

# Revisor A (acción del servidor, datos, constitución)

Sin hallazgos ALTA. Revisor A, ronda 4: 0 ALTA, 0 MEDIA, 2 BAJA.

## T-023 · Ronda 4 · Revisión A (acción del servidor, datos, constitución)

Diff revisado: `worktree-agent-a875b9deffe28f1da..worktree-agent-af4665097e6d61770` (afcc774), sin `tickets/`, más `tickets/T-023/mutantes.json` (`ts_ronda_4`). Solo lectura: sin migraciones nuevas en el diff, así que no hay sonda de base; la visibilidad se razona sobre `cobros_lectura` (`20261011120000_economico_esquema.sql:1157`) y `es_profesional_asignado` (`20260822160000_rls_funciones_y_politicas.sql:93`).

### Ronda 3 (A): estado

| Id R3 | Estado | Dónde |
|---|---|---|
| A-H1 relectura fallida → `fallo()` | **Cerrado** | `acciones.ts:126-130`: `resultadoDesconocido`, `console.error` solo con el código, sin `revalidatePath`. La prueba usa `57014`, el importe `77,77` y mira la consola (no contiene `77` ni el paciente). |
| A-H2 guardas antes de la clave | **Cerrado** para fusión y zona; **queda un residuo**: la pérdida de visibilidad (A-H2 de abajo) | `acciones.ts:59-64`: el paso 2b va después del UUID del paciente y antes de `pacientes`. Con una fila propia, no lee el paciente ni la zona y no inserta. Con fusión, la fila sigue visible: `es_profesional_asignado` resuelve la fusión en un salto, el técnico la ve por el `centro_id` del absorbido y el administrador la ve siempre. |
| A-H3 `state.md` | **Cerrado** | Las líneas 11 y 21 coinciden letra por letra con R4.5. `wc -l` = 60. Solo el paso 4 del spec escribe, así que «cada ejecución deja un cobro» es cierto. |
| A-H4 aviso con filtro de profesional | **Cerrado** | `page.tsx:37-52`: con filtro, el texto y el enlace a `/facturacion` (`min-h-11`). Tiene prueba y gemela sin filtro y sin enlace. |

### «Qué revisar» de R4.7 (revisor A), punto por punto

- **2b filtra por `registrado_por`.** Sí: `leerCobroPropio` (`acciones.ts:25-31`) lo usan el 2b y la relectura. Va después de validar el UUID del paciente: la prueba «no es uuid… no consulta nada» mira `from` sin llamadas. Un error no corta el flujo (`:60`), y la prueba «la consulta previa falla» exige el `insert` y el éxito.
- **Un 23505 de otra restricción no relee.** Sí. La condición sigue siendo `cobros_pkey` (`:124`) y la prueba cuenta una sola llamada a `selectCobros`, la del 2b.
- **La relectura fallida** no revalida y no lleva el importe ni el paciente al registro. Lo comprueba la prueba.
- **Oráculo.** No hay uno nuevo. Con un id ajeno, el 2b no ve nada por el `registrado_por`, aunque la RLS deje ver la fila (administrador o técnico), y se sigue al `insert` → 23505 → relectura con 0 filas → `fallo()`, igual que en R3. Ver que un id ajeno existe o no ya era posible antes por el `grant insert (id, …)`. `resultadoDesconocido` solo sale cuando la relectura falla, y quien llama no controla eso. El 2b solo confirma cobros de la propia sesión, que esa sesión ya conoce.
- **¿El 2b se salta alguna comprobación que importe?** No. Cuando confirma, no escribe nada: ni `insert` ni ninguna otra escritura. Saltarse el paciente, la fusión, la zona o el esquema solo cambia el mensaje. Desde la interfaz, el id solo puede llegar con los mismos datos, porque el `Map` asigna un UUID por huella. Una petición fabricada que reutilice su propio id con otros datos recibe «Cobro registrado» y no se inserta nada: solo se engaña a sí misma. Queda el caso contrario, una fila propia que el 2b no ve (A-H2).
- **Ni `UPDATE` ni `DELETE` ni `upsert`.** El grep del diff solo encuentra `claves.current.delete(huella)`, que es un `Map` del cliente. No hay migraciones ni cambios en `supabase/`, `lib/supabase/` ni `scripts/`.

### `huellaDeCobro`: ¿pueden dos cobros distintos dar la misma huella?

Solo si coinciden en todo lo que la base guarda (A-H1). Ninguna normalización mezcla datos distintos:
- **Céntimos.** La huella y el `insert` usan el mismo `aCentimos` (`importeParaBd(centimos)`), así que la misma huella implica el mismo `numeric`. El esquema rechaza el 0, también `-0`, porque `-0 !== 0` es falso.
- **Referencia vacía o `null`.** `opcional` convierte `''` y los espacios en `undefined`, y la base recibe `null` (`acciones.ts:109`). La huella pone `null` en los dos casos, lo mismo que se guarda. La cadena `"null"` se serializa con comillas y no coincide con el `null`.
- **Motivo solo en las devoluciones.** Se trata igual que en `acciones.ts:110`.
- **Signo.** Ya está en `centimos`. Además, una devolución lleva siempre un motivo que no es `null` (`superRefine`), y un cobro positivo lleva `null`. Un mutante que use `Math.abs` sería equivalente, así que no hace falta una prueba de signo.
- Los textos que se guardan pasan por el mismo `trim` en el cliente y en la acción, porque la acción vuelve a validar la salida del esquema.

### Mutantes de este revisor

- **M24**: cae por el motivo correcto. Con `JSON.stringify(datos)`, `'60'` y `'60,00'` son textos distintos en la salida de Zod.
- **M27**: cae porque se espera `resultadoDesconocido`. Además, la prueba atrapa por separado un `revalidatePath` o un importe en el registro.
- **M28**: cae porque, sin el 2b, la prueba llega a la guarda de fusión, que devuelve un error de campo, y llama a `select`.
- **M29**: el doble devuelve `previa` sin mirar los filtros, así que solo lo atrapa `eqCobros('registrado_por', USUARIO)`. Es correcto: en esa prueba no hay relectura que haga esa llamada.
- **M34**: correcto.

Los demás (M23, M25, M26, M30-M33) son del revisor B.

### Hallazgos

#### A-H1 · BAJA · `app/(app)/facturacion/acciones.ts:61` (con `registrar-cobro.tsx:28`) [une B-H1]
**Un cobro nuevo idéntico se da por registrado y no se inserta.** La confirmación por clave dice lo mismo que un alta nueva. Desde R4.1, la clave dura toda la vida de la página, así que esa confirmación puede tragarse ese cobro en silencio.

**Escenario.**
1. El cobro A (Lucía, 60 €, hoy, efectivo, sin referencia) entra, pero se corta la red y el formulario muestra `resultadoDesconocido`. La clave de A sigue en el `Map`.
2. El usuario no reenvía. Para comprobarlo, pulsa «Siguientes» en la paginación o el enlace del filtro. Es una navegación por query dentro de `/facturacion`: `RegistrarCobro` no se desmonta (R4.0), pero el RSC se vuelve a pintar y «Últimos cobros» ya enseña A.
3. Más tarde, Lucía paga en efectivo una segunda sesión de 60 € el mismo día. El usuario la registra con los mismos datos.
4. `claveDeEnvio` devuelve el id de A, el 2b encuentra la fila y la acción contesta «Cobro registrado».

Resultado: no se inserta nada y el pendiente le atribuye a Lucía 60 € que ya pagó. Nada en pantalla avisa.

En R3 esto no pasaba: la clave moría al cerrar el diálogo o al cambiar la huella.

**Arreglo barato.** El 2b y la relectura del 23505 devuelven un texto propio, por ejemplo «Este cobro ya estaba registrado; no se ha añadido otro». El cliente lo trata como éxito y olvida la clave, porque hoy compara con `cobroRegistrado` (`formulario-cobro.tsx:100`). Así, quien quería un segundo cobro sabe que debe distinguirlo, por ejemplo con una referencia.

Pruebas: ese texto en las dos salidas de la acción, y la clave olvidada con él en `registrar-cobro-clave.test.tsx`.

#### A-H2 · BAJA · `app/(app)/facturacion/acciones.ts:59`
**El 2b no ve los cobros propios de un paciente que el usuario ya no ve.** El 2b lee bajo RLS, y `cobros_lectura` no tiene una rama por `registrado_por`. Si entre el envío y el reintento el usuario deja de ver al paciente, el 2b no encuentra la fila y el reintento cae en `fallo()`, «No se ha podido registrar el cobro», aunque el cobro exista. Es el residuo de R3 A-H2.

**Escenario.**
1. Ana registra un cobro de 60 € a P. Se corta la red y queda `resultadoDesconocido`; la pestaña sigue abierta.
2. El administrador traspasa P a Bea (cambia `pacientes.profesional_id`).
3. Ana reenvía: el 2b devuelve 0 filas, porque `es_profesional_asignado(P)` ya es falso, `pacientes` tampoco devuelve nada y la acción contesta `fallo()`.
4. Ana pide al administrador que lo registre él, y queda un cobro duplicado que no se puede borrar. Al técnico le pasa lo mismo si cambia el centro del paciente o sus `centros_actuales`.

**No se arregla ampliando `cobros_lectura` por `registrado_por`**: eso dejaría ver datos económicos de un paciente a quien ya no lo atiende. Basta con anotarlo en `docs/state.md` §Hallazgos como riesgo aceptado (hacen falta un corte de red y un traspaso dentro de la vida de la página), o con que el `fallo()` de un paciente invisible diga «resultado desconocido» cuando el cliente tiene una clave pendiente para esa huella. Lo segundo exige que el cliente lo marque en la petición.

No es un hallazgo: si el 2b da error y además ha cambiado una guarda (fusión), vuelve el escenario de R3 A-H2. Hacen falta dos fallos independientes, y el diseño acepta que la autoridad sea la clave primaria.

---

# Revisor B (cliente, accesibilidad y spec)

Sin hallazgos ALTA. 0 ALTA, 0 MEDIA, 3 BAJA.

## T-023 · Ronda 4 · Revisor B (cliente, accesibilidad y spec)

Diff revisado: `git diff worktree-agent-a875b9deffe28f1da..worktree-agent-af4665097e6d61770 -- . ':!tickets'` (tres commits, de df74d83 a afcc774), más `tickets/T-023/mutantes.json` (`ts_ronda_4`). Lo he leído con `git show` sobre la rama. No he ejecutado el spec. Un mutante (el de B-H3) lo he medido con vitest sobre una copia `git archive` de afcc774, nunca en el worktree. Después he quitado el junction y he borrado la copia.

### Estado de los hallazgos B de la ronda 3

| Id R3 | Estado | Por qué |
|---|---|---|
| B-H1 (MEDIA) | **Cerrado**, con un residuo por otra puerta (B-H2) | La clave vive en `RegistrarCobro` (`registrar-cobro.tsx:28`), que no se desmonta al cerrar el diálogo. La huella está normalizada (`esquemas.ts:89`). El aviso ya no nombra ningún botón (`es.ts`, M34). Cerrar y reabrir con «0.01» lleva el mismo id: lo prueban `registrar-cobro-clave.test.tsx:56` y el paso 8 del spec. |
| B-H2 (MEDIA) | **Cerrado** | `lista.or(vacia).first()` (`spec:140`). El tope de 18 va sobre todas las filas de la lista (`totalAntes`). El paso cuenta `+ 1` sobre las de Lucía y también sobre el total, en el testigo y al final. |
| B-H3 (BAJA) | **Cerrado** | `spec:163-164` guarda el estado y el cuerpo. `spec:186-187` exige un 200 y «Cobro registrado». El recuento del testigo (`spec:196-200`) confirma que la fila entró antes del reintento. |
| B-H4 (BAJA) | **Cerrado** | `paginacion-pendientes.tsx:40-43`: un clic con modificador o con otro botón no marca nada. `:33-38`: un destino que no llega se apaga sin enfocar. M30 y M31 caen. Abajo, en las notas, queda un residuo que no cuento. |
| B-H5 (= A-H4, BAJA) | **Cerrado** | Con filtro, `page.tsx:37-52` pinta el texto propio y el enlace a `/facturacion`. La gemela sin filtro no pinta ningún enlace. Las medidas, abajo. |

### La lista de «qué revisar» (R4.7, revisor B)

- **Solo un éxito olvida una clave.** En el código, sí:
  - `registrar-cobro.tsx:69-70` es la única llamada a `delete`. Solo se llega desde `formulario-cobro.tsx:100-102`, cuando `estado.mensaje === cobroRegistrado` y no hay errores.
  - El `catch`, `fallo()`, un error de campo y `resultadoDesconocido` del servidor no tocan el `Map`. Cerrar (`alCerrar`) tampoco.
  - En las pruebas, «solo la suya» no se comprueba: un éxito que vacía el `Map` entero sobrevive a toda la batería. Ver B-H3.
- **El motivo solo cuenta en una devolución.** `esquemas.ts:89-98` tiene `centimos < 0 ? motivo : null`, igual que la regla del `insert` según el diseño. Las cuatro pruebas de `esquemas.test.ts` lo cubren.
- **El formulario no llama a `claveDeEnvio` durante el render.** Solo lo llama en `alSerValido` (`formulario-cobro.tsx:95-96`), que corre en el manejador del submit, nunca en el render.
- **El aviso no nombra ningún botón.** Se cumple y hay prueba (`registrar-cobro-clave.test.tsx:141`, M34).
- **Spec, paso 2.** Espera `lista.or(vacia)` y pone el tope sobre todas las filas. `Cargando` no pinta `<li>` (`piezas.tsx:245-256`), así que el esqueleto no se cuela en `totalAntes`.
- **Spec, paso 7.** Cuenta en un contexto nuevo, con red y antes de reabrir (`spec:191-203`). Usa la URL absoluta. El `finally` cierra el contexto.
- **Spec, paso 8.** Cierra de verdad con Escape, comprueba que el diálogo se oculta y que el foco vuelve al disparador, y escribe `'0.01'`.
- **Nada depende de filas anteriores.** `antes` y `totalAntes` se miden en cada ejecución. Con 0 filas (recién sembrado), el `or` encuentra el estado vacío. Con hasta 18, el `+ 1` cabe en las 20 de la lista. Por encima de 18 el paso falla en rojo y con un mensaje que lo explica, nunca en verde.
- **La paginación.** Ya está arriba (B-H4).
- **El enlace del aviso.** Mide 44 px (`min-h-11`, `inline-flex`). Usa el mismo par de color que el mensaje (`text-destructive` sobre `bg-destructive/10`). Lo he calculado con los tokens de `globals.css` en oklch, sobre `--background`: el texto da unos 5,0:1 y el anillo `outline-ring` unos 3,7:1 contra el fondo del aviso. Las dos cifras pasan (4,5:1 y 3:1). El enlace está dentro del `role="alert"`, así que se anuncia con el aviso.

### Lo que preguntaba el orquestador

- **¿Qué id lleva el tercer A en A, B, A?**
  - Si A sale bien primero, se borra su clave, y el tercer A lleva un id nuevo. Es lo correcto: es otro cobro.
  - Si fallan A y B, el tercer A recupera idA. Lo prueba la prueba «A, B, A».
  - Si A falla, B sale bien y luego se reenvía A, el código lleva idA, pero ninguna prueba lo exige. Ver B-H3.
- **¿Crece sin límite?** Gana una entrada por cada huella distinta que no ha salido bien: una cadena de unos 150 bytes y un UUID. Es memoria despreciable. El problema no es el tamaño, es lo que tarda en olvidarse. Ver B-H1 (unido a A-H1).
- **¿Sobrevive a lo que debe y solo a eso?**
  - Una recarga lo vacía. Es un `useRef`.
  - Salir de la página **no** lo vacía, en contra de lo que suponen el diseño («Lo que no entra en la ronda 4») y el aviso («sin salir de la página»). Con `cacheComponents: true` (`next.config.ts`), Next oculta la ruta con `<Activity>` en vez de desmontarla, y conserva el estado de hasta 3 rutas. Lo he comprobado en `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md` y en `client/components/bfcache-state-manager.js:13` (`MAX_BF_CACHE_ENTRIES = 3`). Que el aviso se quede corto no hace daño. Lo que sí hace daño es que la clave dure toda la jornada (B-H1, unido a A-H1).
  - Al revés, se vacía sin salir de la página si `AccionRegistrar` cambia el botón por un aviso (B-H2).
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

### Hallazgos

#### B-H1 · BAJA · `app/(app)/facturacion/registrar-cobro.tsx:28` (con `acciones.ts:61`) [unido a A-H1; no se cuenta aparte]
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

#### B-H2 · BAJA · `app/(app)/facturacion/page.tsx:25`
**El `Map` se pierde sin salir de la página.** Si `cargarPacientesParaCobro` falla en un render posterior, `AccionRegistrar` cambia `<RegistrarCobro>` por `<AvisoDeError>`, y eso desmonta la isla y su `Map`. Los renders posteriores llegan al cambiar el filtro (`selector-profesional.tsx:34`, `router.replace`), al paginar o al pulsar el enlace nuevo «Ver las cifras de todos los profesionales».

Escenario:
1. La base va a tirones, que es justo lo que produce el «No sabemos…», y el primer envío de 60,00 EUR sí entró. Sale el aviso.
2. El administrador cierra el diálogo y cambia el filtro para mirar la lista. En ese render, los pacientes dan un timeout y el botón pasa a ser «No se ha podido cargar la lista de pacientes». «Últimos cobros» también falla o todavía no enseña nada.
3. Vuelve a cambiar el filtro y el botón reaparece con un `RegistrarCobro` nuevo, con el `Map` vacío.
4. Rellena los mismos datos, como le pide el aviso («sin salir de la página»). El envío lleva un id nuevo y deja un cobro duplicado que no se puede borrar (regla 6).

Lo cerraría que el `Map` viva por encima de la rama condicional, o que `RegistrarCobro` se monte siempre y pinte él el aviso de pacientes.

#### B-H3 · BAJA · `app/(app)/facturacion/registrar-cobro-clave.test.tsx:56`
**«Solo un éxito olvida su clave» solo se prueba con la misma huella.** Si `alRegistrar` vacía el `Map` entero (`claves.current.clear()`) en lugar de borrar su huella, toda la batería sigue en verde. Lo he medido sobre una copia `git archive` de afcc774, con `registrar-cobro.tsx:70` cambiado a `claves.current.clear(); void huella;`: `vitest run "app/(app)/facturacion/"` da 11 ficheros y 207 pruebas en verde.
- La prueba 1 tiene un éxito de la misma huella, y ahí `clear` y `delete` hacen lo mismo.
- Las pruebas 2, 3 y 4 no tienen ningún éxito.
- El M25 de `mutantes.json` es otro: hace `clear()` antes de guardar.

Escenario del fallo que la batería no ve:
1. A (60,00 EUR a Lucía) da resultado desconocido y sí entró.
2. Sin cerrar la página, se registra B (40,00 EUR a otro paciente), que sale bien. Con el mutante, la clave de A desaparece.
3. Se reenvía A como pide el aviso. Lleva un id nuevo y queda un cobro duplicado.

Lo cerraría una prueba «A desconocido, B con éxito, A otra vez → idA».

### Lo que he mirado y no cuento

- **Residuo de B-H4 en la paginación, por un recorte.**
  1. Se pulsa «Siguientes» en la 2, así que `destino` vale 3.
  2. Entretanto, otro usuario deja la lista en dos páginas, y el servidor recorta `?pagina=3` a la 2 (`bloques.tsx`, `Math.min`).
  3. `pagina` no cambia, el efecto no corre y `destino` se queda en 3.
  4. Si después una devolución propia, vía `revalidatePath`, devuelve una tercera página con la URL todavía en `?pagina=3`, el efecto enfoca el rango y le quita el foco al disparador.

  Hacen falta tres sucesos ajenos encadenados. Lo dejo como nota.
- **Activity vuelve a ejecutar los efectos al mostrar la ruta**: el de `PaginacionPendientes` enfocaría el rango si `destino === pagina` al volver. Para eso habría que pulsar «Siguientes» y salir antes de que llegue la página nueva, y volver justo a esa página. No encuentro un camino real.
- **`crypto.randomUUID`** solo existe en contexto seguro. Si lanzara, `enviandoRef` se quedaría en `true` (`formulario-cobro.tsx:91-96`). Pero en local se usa `127.0.0.1` y en producción HTTPS, y la llamada ya estaba en R3.
- **El testigo del paso 7** se crea con `browser.newContext`, que no hereda el `use` del proyecto. Solo importan `baseURL`, que se sustituye por la URL absoluta, y las cookies, que van en `storageState`. Sin efecto.
