HAY 1 ALTA (de proceso: la rama edita su propio contrato). Ninguna ALTA de código: sin violaciones de la regla 6, sin fugas entre roles en TypeScript, sin clave de servicio.

# T-014 · Revisión 1 de 2 (TypeScript, componentes, Server Actions, Zod, foco/ARIA, i18n, interfaz.md)

Diff: `git diff main...T-014-calendario` (85 ficheros, 13373fe..5ea153d). Sin BD. No se ha leído `evidencia.json`.

## Lista «Qué revisar» (§5 y §8.9), punto por punto

| Punto | Resultado |
|---|---|
| `?vista/?fecha/?centro/?profesional` no llegan a SQL | OK (`parametros.ts`, `resolverCentro` ignora centros no ofrecidos) |
| `alcance` solo `esta`/`esta_y_siguientes`; `grep -rni todas` | OK: solo un comentario en `dialogo-reprogramar.tsx:39` |
| `en_curso` solo de `cita_en_curso` (`now() >=`, `estaEnCurso(`) | OK, sin resultados |
| `from('citas')` solo `select` | OK (`lib/citas/agenda.ts:153`) |
| `administracion` en `app/(app)/agenda` | OK, sin resultados |
| URL solo con uuids | OK (`notas.ts`, `documentacion.tsx`) |
| `use cache`; `new Date/Date.now/format(` en ficheros `'use client'` | OK, sin resultados; `connection()` antes del reloj en `datos.ts:51,87` |
| **`late: true` en como mucho una `CitaVista`** | **FALLA** con una cita que cruza la medianoche → H2 |
| `EstadoVisibleCita` solo de `@/components/ui/estado-cita` | OK |
| Técnico sin `diasPendiente` ni `notas.mostrar`; bandeja sin candado | OK |
| Cuadro: el técnico no llega a `leerCitasRango` | OK. Pero el marco se pinta con error → H7 |
| `null` en `paciente_nombre` → «Paciente» | OK (`vista.ts:125`, `por-confirmar.tsx:13`) |
| grid/row/gridcell, un solo `tabIndex=0` por rejilla, la celda no es botón, ningún botón anidado, iconos `aria-hidden` + `sr-only` | OK |
| `min-h-11` en todo lo que se pulsa | **FALLA** en la cita de la semana y en el mes → H8 |
| `PARES` nuevos en `lib/contraste/tokens.ts` | OK (`foreground`/`secondary`) |
| `p_zona_horaria/p_duracion_minutos/p_dia_semana`; `getUTCDay/getDay()/isodow` | OK, sin resultados |
| `confirmarPropuesta` una sola vez en `reprogramar.ts`, sobre la ancla; firma antes de `editarSerie` | OK (`reprogramar.ts:239`) |
| Zod: preview sin `.omit` sobre esquema con `refine` | OK: `esquemaDestinoCita` es la base y `esquemaReprogramarCita` la extiende (esquiva la trampa) |
| Diálogo modal: foco inicial, Escape sin efecto, `pausado` debajo | OK en el camino feliz. Foco tras el éxito a 360 px → H4. Diálogo bloqueado si la acción rechaza → H6 |
| Rechazo en «Por confirmar»: la fila no desaparece, foco a Descartar, `hueco_ocupado` pasajero | OK. El camino del éxito no está cubierto → H5 y H9 |
| `Dialogo` sin `focoInicial` sigue igual | OK |
| D9: solo se pinta el panel de la cima | **FALLA** → H3 |
| i18n: claves dinámicas (`motivosDesviacion`, `documentacion.tipos`) cubren el enum | OK: 4/4 y 5/5 contra las migraciones |
| `territorio.mjs T-014` | Verde, pero sobre un contrato que la rama editó → H1 |

## ALTA

**H1 · `tickets/T-014-calendario-semanal.md:33`**. El commit 5ea153d cambia el bloque `territorio:` del propio ticket: `rejilla-foco.test.ts` pasa a `rejilla-foco.test.tsx`.
- Escenario: `node ~/.claude/pipeline/territorio.mjs T-014` da «todos dentro», pero lee la línea que reescribió el código auditado. `tickets/**` es «nadie automático» (`.claude/rules/pipeline.md`). El gate da verde porque su entrada la escribió la rama.
- El cambio de fondo es trivial y correcto. Lo decide el propietario: si el commit es suyo, el hallazgo se anula; si no, que lo reaplique él y la rama lo revierta.

## MEDIA

**H2 · `app/(app)/agenda/vista.ts:250`**. `late: fila.id === idQueLate` va en **cada tramo**, y una cita que cruza la medianoche da dos `CitaVista`.
- Escenario: una cita de 23:30 a 00:30 en `Europe/Madrid`, vista a las 23:45 en la semana. El tramo 0 del lunes y el tramo 1 del martes llevan los dos `late: true`, y `rejilla-semana.tsx:233` pasa `late` a los dos. Resultado: dos `latido-estado` en pantalla, contra «un único elemento animado» y contra §5 («`late: true` en como mucho una `CitaVista`»).
- `vista.test.ts:121` prueba los dos tramos pero no mira `late`. `vista.test.ts:189` solo prueba dos citas distintas.
- Arreglo esperado: `late` solo en `tramo === 0`, o en el tramo que contiene `ahora`.

**H3 · `app/(app)/agenda/calendario.tsx:240`**. `pila.map` pinta **todos** los paneles de la pila, no solo la cima. D9 dice «Solo se pinta el panel de la cima» y descarta expresamente «paneles apilados a la vista: se tapan entre sí y a 360 px no caben».
- Escenario: vista de mes a 360 px. Se toca el día 29 y sale `PanelDia` (fixed, z-40, 328 px). Se toca una fila y sale `PanelCita`, anclado a esa fila y superpuesto al panel del día: los dos se ven.
- Además, el panel pausado no lleva `inert` ni `aria-hidden`. Quedan dos `role="dialog"` expuestos, y el cursor virtual del lector entra en el de debajo y activa sus filas.
- `calendario.test.tsx:163` no comprueba que el panel del día desaparezca mientras está abierta la cita.

**H4 · `app/(app)/agenda/calendario.tsx:68-71`**. A 360 px, tras mover una cita a **otro día**, el foco cae a `body`.
- Escenario: a 360 px, `ListaDia` solo pinta las citas del día elegido. Se abre una cita del martes, «Reprogramar», jueves 10:00, éxito. Al llegar la vista nueva, el único `[data-cita-id]` que queda está en la rejilla `hidden md:block`. `find(offsetParent !== null)` no encuentra nada, y `?? candidatas[0]` enfoca un nodo con `display:none`, lo que no hace nada. El respaldo `[data-dia]` no se alcanza, porque `cita ?? dia` ya eligió el candidato oculto; y aunque se alcanzara, `querySelector` devolvería también el botón de día de la rejilla oculta.
- El diseño (§8.3, fila «Éxito») exige el número del día si la cita no está visible.
- `calendario.test.tsx:220` pasa en jsdom, donde `offsetParent` siempre es `null`, por la rama `candidatas[0]`. La selección de la disposición visible no se ejecuta en ninguna prueba.

**H5 · `app/(app)/agenda/calendario.tsx:260`** (con `panel-cita.tsx:129`). La pila guarda una **copia** de la cita, así que tras confirmar o descartar la propuesta desde el panel, el panel sigue enseñando la propuesta vieja.
- Escenario: panel de una cita con propuesta y «Confirmar», que da `ok`. `revalidatePath` refresca `vista.citas`, pero `PanelCita` sigue pintando `panel.cita`: la misma propuesta con Confirmar y Descartar, y el rango antiguo en la cabecera. Un segundo «Confirmar» da un rechazo («ya no vale» o el genérico) sobre una propuesta que el usuario acaba de confirmar.
- Si la cita cambió de día, además, el ancla se desmonta: Escape devuelve el foco a un nodo desconectado y acaba en `body`.

**H6 · `app/(app)/agenda/dialogo-reprogramar.tsx:142`**. `await reprogramar(carga)` no tiene `try/finally`. Si la Server Action **rechaza**, `enviando` se queda en `true` para siempre.
- Escenario: se cae la red, o el servidor da 500, al pulsar Mover. El `fetch` rechaza y `setEnviando(false)` no se ejecuta. `cerrar` ignora Escape y Cancelar, Mover queda `aria-disabled` y el foco sigue atrapado en el modal. Es una trampa de teclado (WCAG 2.1.2) hasta recargar.
- Lo mismo en `:84` con `previsualizarMovimiento`: «Calculando…» se queda para siempre y «Modificar» desactivado.

## BAJA

**H7 · `app/(app)/agenda/cuadro.tsx:21-28`**. El error de `contexto` se pinta **antes** de comprobar el rol.
- Escenario: con un técnico (o sin rol), falla `zonaDeCentro`. Se pinta la tarjeta «Cuadro» con el aviso de error, contra choque 6 y D13 (lista blanca: el técnico no ve el cuadro). No sale ningún dato, solo el marco.

**H8 · `app/(app)/agenda/rejilla-semana.tsx:225-231`** (y `rejilla-mes.tsx:193,210,223`). El botón de la cita en la semana no lleva el `min-h-11` que pide §1.6.3: su alto es `duración × PX_MIN`. En el mes, las citas y «+N más» son `min-h-6`, y el número del día es `sm:min-h-7`.
- Escenario: una cita de 15 min en la semana, en una tableta táctil a 768 px (rejilla visible desde `md`), da un objetivo de 24 px. Contradice §5 («`min-h-11` en todo lo que se pulsa»).

**H9 · `app/(app)/agenda/fila-propuesta.tsx:72-96`**. El `ok.anuncio` («Hecho.») de `confirmarPropuestaAgenda` y `descartarPropuestaAgenda` no se pinta en ningún sitio.
- Escenario: en «Por confirmar», un usuario de teclado pulsa Confirmar. La fila se desmonta con el foco dentro, `activeElement` pasa a `body` y el lector no anuncia nada.
- El diseño cuidó que el foco no cayera a `body` en el rechazo; el éxito queda sin anuncio y sin destino de foco.

**H10 · `app/(app)/agenda/rejilla-semana.tsx:128-143`**. §8.3 («Abrir tras un arrastre») exige `citaBoton.focus()` antes de abrir el diálogo. El código confía en el foco nativo del `mousedown`.
- Escenario: en Safari de macOS, un botón no toma el foco al pulsarlo, así que `useDevolucionDeFoco` captura `body`. Tras arrastrar y pulsar Escape, el foco vuelve a `body` y no a la cita.

**H11 · `app/(app)/agenda/acciones.ts:73-75`** (con `lib/citas/reprogramar.ts:235-242`). `noMovida()` sin motivo produce «…no se ha movido:  Su propuesta sigue en «Por confirmar».», con los dos puntos seguidos de nada.
- Escenario: con `!propuestaAncla`, la propuesta de la ancla **no existe**, y el anuncio afirma que sigue en «Por confirmar».

## Fuera de hallazgo (notas)

- La rama no trae `docs/state.md` ni `docs/bitacora/T-014.md`. §5 pide pegar los greps y las salidas en la bitácora. Hay que comprobarlo al cerrar.
- `nombreCorto` está duplicado en `por-confirmar.tsx:12` y `vista.ts:125`. Hoy se comportan igual, sin escenario de fallo.
