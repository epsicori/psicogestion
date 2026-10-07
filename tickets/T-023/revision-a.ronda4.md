# T-023 · Ronda 4 · Revisión A (acción del servidor, datos, constitución)

**Sin hallazgos ALTA.** 0 ALTA, 0 MEDIA, 2 BAJA.

Diff revisado: `worktree-agent-a875b9deffe28f1da..worktree-agent-af4665097e6d61770` (afcc774), sin `tickets/`, más `tickets/T-023/mutantes.json` (`ts_ronda_4`). Solo lectura: sin migraciones nuevas en el diff, así que no hay sonda de base; la visibilidad se razona sobre `cobros_lectura` (`20261011120000_economico_esquema.sql:1157`) y `es_profesional_asignado` (`20260822160000_rls_funciones_y_politicas.sql:93`).

## Ronda 3 (A): estado

| Id R3 | Estado | Dónde |
|---|---|---|
| A-H1 relectura fallida → `fallo()` | **Cerrado** | `acciones.ts:126-130`: `resultadoDesconocido`, `console.error` solo con el código, sin `revalidatePath`. La prueba usa `57014`, el importe `77,77` y mira la consola (no contiene `77` ni el paciente). |
| A-H2 guardas antes de la clave | **Cerrado** para fusión y zona; **queda un residuo**: la pérdida de visibilidad (H2 de abajo) | `acciones.ts:59-64`: el paso 2b va después del UUID del paciente y antes de `pacientes`. Con una fila propia, no lee el paciente ni la zona y no inserta. Con fusión, la fila sigue visible: `es_profesional_asignado` resuelve la fusión en un salto, el técnico la ve por el `centro_id` del absorbido y el administrador la ve siempre. |
| A-H3 `state.md` | **Cerrado** | Las líneas 11 y 21 coinciden letra por letra con R4.5. `wc -l` = 60. Solo el paso 4 del spec escribe, así que «cada ejecución deja un cobro» es cierto. |
| A-H4 aviso con filtro de profesional | **Cerrado** | `page.tsx:37-52`: con filtro, el texto y el enlace a `/facturacion` (`min-h-11`). Tiene prueba y gemela sin filtro y sin enlace. |

## «Qué revisar» de R4.7 (revisor A), punto por punto

- **2b filtra por `registrado_por`.** Sí: `leerCobroPropio` (`acciones.ts:25-31`) lo usan el 2b y la relectura. Va después de validar el UUID del paciente: la prueba «no es uuid… no consulta nada» mira `from` sin llamadas. Un error no corta el flujo (`:60`), y la prueba «la consulta previa falla» exige el `insert` y el éxito.
- **Un 23505 de otra restricción no relee.** Sí. La condición sigue siendo `cobros_pkey` (`:124`) y la prueba cuenta una sola llamada a `selectCobros`, la del 2b.
- **La relectura fallida** no revalida y no lleva el importe ni el paciente al registro. Lo comprueba la prueba.
- **Oráculo.** No hay uno nuevo. Con un id ajeno, el 2b no ve nada por el `registrado_por`, aunque la RLS deje ver la fila (administrador o técnico), y se sigue al `insert` → 23505 → relectura con 0 filas → `fallo()`, igual que en R3. Ver que un id ajeno existe o no ya era posible antes por el `grant insert (id, …)`. `resultadoDesconocido` solo sale cuando la relectura falla, y quien llama no controla eso. El 2b solo confirma cobros de la propia sesión, que esa sesión ya conoce.
- **¿El 2b se salta alguna comprobación que importe?** No. Cuando confirma, no escribe nada: ni `insert` ni ninguna otra escritura. Saltarse el paciente, la fusión, la zona o el esquema solo cambia el mensaje. Desde la interfaz, el id solo puede llegar con los mismos datos, porque el `Map` asigna un UUID por huella. Una petición fabricada que reutilice su propio id con otros datos recibe «Cobro registrado» y no se inserta nada: solo se engaña a sí misma. Queda el caso contrario, una fila propia que el 2b no ve (H2).
- **Ni `UPDATE` ni `DELETE` ni `upsert`.** El grep del diff solo encuentra `claves.current.delete(huella)`, que es un `Map` del cliente. No hay migraciones ni cambios en `supabase/`, `lib/supabase/` ni `scripts/`.

## `huellaDeCobro`: ¿pueden dos cobros distintos dar la misma huella?

Solo si coinciden en todo lo que la base guarda (H1). Ninguna normalización mezcla datos distintos:
- **Céntimos.** La huella y el `insert` usan el mismo `aCentimos` (`importeParaBd(centimos)`), así que la misma huella implica el mismo `numeric`. El esquema rechaza el 0, también `-0`, porque `-0 !== 0` es falso.
- **Referencia vacía o `null`.** `opcional` convierte `''` y los espacios en `undefined`, y la base recibe `null` (`acciones.ts:109`). La huella pone `null` en los dos casos, lo mismo que se guarda. La cadena `"null"` se serializa con comillas y no coincide con el `null`.
- **Motivo solo en las devoluciones.** Se trata igual que en `acciones.ts:110`.
- **Signo.** Ya está en `centimos`. Además, una devolución lleva siempre un motivo que no es `null` (`superRefine`), y un cobro positivo lleva `null`. Un mutante que use `Math.abs` sería equivalente, así que no hace falta una prueba de signo.
- Los textos que se guardan pasan por el mismo `trim` en el cliente y en la acción, porque la acción vuelve a validar la salida del esquema.

## Mutantes de este revisor

- **M24**: cae por el motivo correcto. Con `JSON.stringify(datos)`, `'60'` y `'60,00'` son textos distintos en la salida de Zod.
- **M27**: cae porque se espera `resultadoDesconocido`. Además, la prueba atrapa por separado un `revalidatePath` o un importe en el registro.
- **M28**: cae porque, sin el 2b, la prueba llega a la guarda de fusión, que devuelve un error de campo, y llama a `select`.
- **M29**: el doble devuelve `previa` sin mirar los filtros, así que solo lo atrapa `eqCobros('registrado_por', USUARIO)`. Es correcto: en esa prueba no hay relectura que haga esa llamada.
- **M34**: correcto.

Los demás (M23, M25, M26, M30-M33) son del revisor B.

## Hallazgos

### H1 · BAJA · `app/(app)/facturacion/acciones.ts:61` (con `registrar-cobro.tsx:28`)
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

### H2 · BAJA · `app/(app)/facturacion/acciones.ts:59`
**El 2b no ve los cobros propios de un paciente que el usuario ya no ve.** El 2b lee bajo RLS, y `cobros_lectura` no tiene una rama por `registrado_por`. Si entre el envío y el reintento el usuario deja de ver al paciente, el 2b no encuentra la fila y el reintento cae en `fallo()`, «No se ha podido registrar el cobro», aunque el cobro exista. Es el residuo de R3 A-H2.

**Escenario.**
1. Ana registra un cobro de 60 € a P. Se corta la red y queda `resultadoDesconocido`; la pestaña sigue abierta.
2. El administrador traspasa P a Bea (cambia `pacientes.profesional_id`).
3. Ana reenvía: el 2b devuelve 0 filas, porque `es_profesional_asignado(P)` ya es falso, `pacientes` tampoco devuelve nada y la acción contesta `fallo()`.
4. Ana pide al administrador que lo registre él, y queda un cobro duplicado que no se puede borrar. Al técnico le pasa lo mismo si cambia el centro del paciente o sus `centros_actuales`.

**No se arregla ampliando `cobros_lectura` por `registrado_por`**: eso dejaría ver datos económicos de un paciente a quien ya no lo atiende. Basta con anotarlo en `docs/state.md` §Hallazgos como riesgo aceptado (hacen falta un corte de red y un traspaso dentro de la vida de la página), o con que el `fallo()` de un paciente invisible diga «resultado desconocido» cuando el cliente tiene una clave pendiente para esa huella. Lo segundo exige que el cliente lo marque en la petición.

No es un hallazgo: si el 2b da error y además ha cambiado una guarda (fusión), vuelve el escenario de R3 A-H2. Hacen falta dos fallos independientes, y el diseño acepta que la autoridad sea la clave primaria.
