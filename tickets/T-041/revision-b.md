# T-041 · Revisión B (aplicación e interfaz) — ronda 2

**Sin hallazgos ALTA.** 0 ALTA · 0 MEDIA · 5 BAJA. Los ocho hallazgos de la ronda 1 (B-H1..B-H8) y el criterio 8 quedan cerrados, cada uno con una prueba que discrimina, salvo la mitad visible de B-H3 (B2-H1).

- Diff: `git diff worktree-agent-ada3a424c2ef63d80..worktree-agent-ae6f460142344cc25 -- . ':!tickets'` (`9e0033c..1d6f244`).
  - Ese rango arrastra el merge de `main` `d9865df` (`panel-resumen.*`, `docs/bitacora/T-028.md`, `docs/state.md`), que no es de la ronda.
  - Lo propio de la ronda es `d9865df..1d6f244`: `192a4ce`, `57889db` y `1d6f244` son míos; `e48ded8` (migración y banco 28) es del revisor A.
- Mutantes medidos en el worktree con `scratchpad/mutar.mjs`. Cada uno se restaura con `git checkout` y `git status` queda limpio.
- `tsc --noEmit`: limpio. `eslint` sobre `app/(app)/ajustes` y `lib/cuentas`: 0 errores (2 avisos en `accesos.test.ts`, que no toca el diff).
- Suite de la zona: 159/159.

## Cierre de la ronda 1, mutante por mutante

| Hallazgo | Arreglo | Mutante | Resultado |
|---|---|---|---|
| Criterio 8 | `carga.ts` lee `directorio_perfiles` | `.from('perfiles')` | **Muere**: 2 rojas en `carga.test.ts` («lee las personas de directorio_perfiles…» y la de error de lectura) |
| Criterio 8, en la base | — | Medido en `supabase_db_Psicogestion` con el JWT de `b0080001-…-01`, dentro de `rollback` | `perfiles` da **1** fila activa (él mismo) y `directorio_perfiles` da **3**. La fuente nueva es la buena |
| B-H2 | Pruebas (c2) y (c3) con dos adicionales | `return` tras `altasSinDar.push` | **Muere**: (c2) y (c3) |
| B-H3 | `altasSinDar` en la rama de `registro`, más el texto `registroConAltasPendientes` | Quitar `altasSinDar` de la rama | **Muere**: las dos pruebas B-H3 |
| B-H3, la parte que se ve | Rama nueva de `acciones.ts:62` | `if (false)` en esa rama | **Sobrevive**, 159/159: ver B2-H1 |
| B-H4 | Lectura de `centros` antes de `inviteUserByEmail` | `c.id === id && c.activo` → `c.id === id` | **Muere**: los dos casos B-H4 (principal y adicional) |
| B-H4 | — | Quitar el bloque entero | **Muere**: (a) y los dos B-H4 |
| B-H5 | `cargarAltas` devuelve `{ ok: false }` y la página pinta `role="alert"` | Quitar `if (fallo) return { ok: false }` | **Muere**: las tres lecturas (`directorio_perfiles`, `perfiles_centros`, `centros`) |
| B-H6 | `construirPersonas` extraída y probada | `tienePrincipal: suyas.length > 0` | **Muere**: «estado D5» |
| B-H7 | Región `role="status"` montada siempre; `data-aviso` y estilo de aviso | Quitar `role="status"` del contenedor | **Muere**: las 2 pruebas de la región |
| B-H7 | — | Quitar `setAviso(...)` en el formulario | **Muere**: «un aviso de altas pendientes se pinta como aviso» |
| B-H7, el productor | `avisoPendiente: true` en `acciones.ts:81` | Quitarlo | **Sobrevive**, 159/159: ver B2-H1 |
| B-H1 | `aria-disabled` en lugar de `disabled`; guardas en `confirmar` y `cerrar` | Quitar los `aria-disabled` | **Muere**: «B-H1: mientras envía…» |
| B-H1 | — | Volver a `disabled={enviando}` | **Muere**: la misma prueba (`not.toBeDisabled`) |
| B-H1 | — | Quitar `\|\| enviando` de `confirmar` | **Muere**: el segundo clic llama dos veces a la acción |
| B-H1 | — | Quitar `if (enviando) return` de `cerrar` | **Muere**: Cancelar cierra el diálogo mientras envía |
| B-H8 | `try/catch` alrededor de `await accion(...)` | Quitar el `try/catch` | **Muere**: «B-H8: si la acción lanza…» |

**Foco, medido en Chromium** (Playwright 1228, `setContent` con la misma secuencia de DOM: foco en Confirmar → los dos botones pasan a ocupados → se inserta el `role="alert"` → se liberan):

```
aria-disabled (HEAD): inicio:confirmar | enviando:confirmar | tras error:confirmar | Intro reactiva Confirmar:true
disabled (ronda 1):  inicio:confirmar | enviando:BODY | tras error:BODY | Intro reactiva Confirmar:false
```

- B-H1 queda cerrado: el foco no sale del diálogo y el reintento se hace con Intro.
- La prueba de jsdom no mide el foco, pero sí la causa: mata los dos mutantes que lo romperían (sin `aria-disabled` y con `disabled`).
- `Dialogo` no recoloca el foco al volver a pintar: su efecto depende solo de `[abierto, focoInicial]`, que no cambian mientras se envía.

## Las dos decisiones que el implementador tomó solo

### 1. Si falla `registrar_invitacion`, no intenta las altas adicionales y las nombra

**Tiene dueño en el diseño, y en `lib/cuentas/invitar.ts` sigue la opción que yo propuse en la ronda 1.**

- P4 dice «3. `registrar_invitacion`, sin cambios», y su fallo ya devolvía `ok: false` antes de esta rama. La cabecera de P4 dice «EN ESTE ORDEN, y ninguno se salta».
- No intentar el paso 4 es lo que ya hacía el código, y el diseño lo dejó «sin cambios». Nombrar los centros era la segunda de las dos salidas que planteé en B-H3, y no choca con nada.
- No hay riesgo para la constitución:
  - `perfiles_centros` no está en la regla 6;
  - cada `dar_alta_centro` se audita con su propio actor, y saltárselas no deja ninguna escritura sin rastro.
- **Lo que falta** está en `acciones.ts`, no en `invitar.ts`: la rama que pone los nombres en el mensaje no tiene prueba (B2-H1) y sale con el estilo del éxito (B2-H2).

### 2. B-H4 se comprueba leyendo `centros` con la sesión del administrador antes de `inviteUserByEmail`

**Tiene dueño en el diseño: D9.** D9 dice «Validar todos los centros antes de enviar el correo. Un correo enviado no se desenvía».

- El §0 del diseño ya decía que `preparar_invitacion` «no mira `centros.activo`».
- Para hacerlo en la base habría que redefinir `preparar_invitacion`. P1 dice «Tres objetos y nada más» en la migración, así que leer `centros` desde la aplicación es la vía que respeta el diseño y queda dentro del territorio (`lib/cuentas/**`).
- La lectura usa `sesion.supabase` y no la clave de servicio, como manda el proyecto. `centros_lectura` deja leer al administrador los centros cerrados, así que `activo = false` se ve y no se confunde con «no existe».
- **Residuo aceptable, y no es un hallazgo**: entre la lectura y `inviteUserByEmail` queda una ventana sin candado.
  - No se puede cerrar desde la aplicación: el alta principal la inserta `fn_crear_perfil_de_usuario` en la transacción de GoTrue.
  - La ventana pasa de «lo que dure el formulario abierto» a milisegundos.
  - Cerrarla del todo exigiría tocar ese disparador, y D8 lo descarta.
- **Lo que falta**: el fallo de lectura sale con el mismo texto que el centro cerrado (B2-H4).

## BAJA

### B2-H1 · La mitad visible de B-H3 y quien produce `avisoPendiente` no tienen prueba

- **Dónde**: `app/(app)/ajustes/acciones.ts:61` y `app/(app)/ajustes/acciones.ts:81`.
- **Qué pasa**:
  - `invitar.test.ts` prueba que `invitarPerfil` devuelve `altasSinDar`.
  - `formulario-invitar.test.tsx` simula `invitar` y le pone `avisoPendiente: true` a mano.
  - Nadie prueba la acción que une las dos cosas.
- **Mutantes** (medidos, los dos sobreviven 159/159):
  - `if (false)` en la rama `registroConAltasPendientes` (línea 62);
  - quitar `avisoPendiente: true` (línea 81).
- **Escenario**:
  1. Se invita con [Madrid (principal), Canarias].
  2. `registrar_invitacion` falla.
  3. Con el primer mutante, el administrador lee «La cuenta se creó, pero no se pudo dejar constancia de la invitación.», sin Canarias. Es el escenario exacto de B-H3, y no hay ninguna prueba roja.
  4. Con el segundo, «No se pudo dar el alta en Canarias…» vuelve a pintarse con el estilo del éxito (B-H7).
- **Qué haría falta, las dos cosas**:
  - una prueba de `invitar` (la acción) con `invitarPerfil` simulado que devuelva `ok: false` con `altasSinDar` y compruebe que el mensaje nombra el centro;
  - otra con `ok: true` y `altasSinDar` no vacío que compruebe `avisoPendiente: true`.

### B2-H2 · El aviso de altas pendientes tras fallar el registro se pinta como un éxito

- **Dónde**: `app/(app)/ajustes/acciones.ts:63`.
- **Qué pasa**: la rama `registroConAltasPendientes` devuelve `{ ...ESTADO_INICIAL, mensaje }` sin `avisoPendiente`.
  - El formulario lo pinta con `text-sm`, igual que «Invitación enviada a …».
  - Es la segunda variante con altas pendientes que hay. B-H7 pedía el estilo de aviso para «la variante con altas pendientes», y el arreglo lo puso solo en la de `ok: true`.
- **Escenario**:
  1. Se invita con [Madrid (principal), Canarias].
  2. `registrar_invitacion` falla.
  3. Sale «La cuenta se creó, pero no se pudo dejar constancia de la invitación. Tampoco se dio el alta en Canarias: dásela desde Ajustes › Altas de centro.» con el estilo del éxito, sin borde ni color.
  4. El administrador que solo ve la forma lo toma por un éxito y no da el alta.
- **Qué haría falta**: `avisoPendiente: true` también en esa rama, y la prueba de B2-H1 que lo compruebe.

### B2-H3 · Si la acción lanza, el diálogo dice «No se pudo guardar» cuando no se sabe

- **Dónde**: `app/(app)/ajustes/centros/gestion-altas.tsx:101`.
- **Qué pasa**:
  - Un rechazo de transporte (la respuesta se pierde) no dice si la RPC llegó a confirmarse.
  - El `catch` lo traduce a `altasCentro.noGuardado` y no revalida la lista.
- **Escenario**:
  1. El administrador confirma «Retirar» en Pau · Centro Sur.
  2. La base cierra el alta y la respuesta se pierde por un corte de red.
  3. El diálogo dice «No se pudo guardar el cambio de centro.», y la lista sigue mostrando Sur como vigente, porque no hubo `revalidatePath`.
  4. El administrador reintenta y recibe P0002: «No tenía alta vigente en ese centro: puede que otra persona la haya retirado ya.». Culpa a otra persona de su propio cambio.
- **Qué haría falta**: un texto propio del `catch`, del tipo «No se ha podido confirmar si el cambio se guardó. Recarga la página para comprobarlo.».
  - No hay que reutilizar `noGuardado`, que sigue sirviendo para la rama de `safeParse`.
- Es el patrón «rechazo de transporte dicho como “no se ha hecho”» de T-038 R2.

### B2-H4 · Un fallo al leer `centros` se dice como «un centro ya no está abierto»

- **Dónde**: `lib/cuentas/invitar.ts:73`.
- **Qué pasa**: `todosAbiertos` es falso tanto si hay un centro cerrado como si la lectura da error, y las dos causas salen con el mismo mensaje.
  - Las pruebas B-H4 solo simulan centros cerrados. El cliente simulado devuelve siempre `error: null`.
- **Escenario**:
  1. La lectura de `centros` falla de forma transitoria (por ejemplo, el pool está agotado).
  2. El administrador lee «Un centro elegido ya no está abierto. Recarga la pantalla y revisa los centros.».
  3. Recarga y ve los mismos centros, todos abiertos. Busca un centro cerrado que no existe.
- **Qué haría falta**: con `errorCentros`, un mensaje propio («No se pudo comprobar los centros. Vuelve a intentarlo.») y un `motivo` distinto de `'centro'`, con su prueba.

### B2-H5 · El arreglo de B-H8 se quedó en uno de los dos formularios del diff

- **Dónde**: `app/(app)/ajustes/invitar/formulario-invitar.tsx:98`.
- **Qué pasa**: `await invitar(datos)` sigue dentro de `iniciarTransicion` sin `try/catch`.
  - En la ronda 1 escribí que ese patrón estaba «fuera del diff», y es falso para este fichero: T-041 lo reescribe (121 líneas), y es justo el formulario del aviso de altas pendientes.
- **Escenario**:
  1. Se invita con [Madrid (principal), Canarias].
  2. El correo sale, falla el alta de Canarias y la respuesta de la acción se pierde por un corte de red.
  3. La promesa se rechaza en la transición, y React 19 la lleva al límite de error de la ruta.
  4. El administrador no ve ni que la invitación salió ni que falta Canarias.
  5. Si reintenta, `inviteUserByEmail` falla con el correo ya registrado y lee «No se pudo enviar la invitación por correo.».
- **Qué haría falta**: el mismo `try/catch` que en `gestion-altas.tsx`, con un texto que diga que no se sabe si la invitación salió (B2-H3), y su prueba con `invitar.mockRejectedValueOnce`.
- La estructura es anterior al ticket. Si el orquestador prefiere no ampliar la ronda, va a `state.md` §Hallazgos.

## Lo que miré y está bien

- `carga.ts` filtra `estado = 'activo'` y los dos roles sobre la vista. La vista declara todas sus columnas como anulables, y el `flatMap` descarta las filas sin `id`, `nombre_completo` o `rol`.
- `PersonaConAltas` llega a `carga.ts` con un `import type` desde un módulo `'use client'`, y ese import se borra al compilar.
- La lectura de `centros` de B-H4 va después de todas las `preparar_invitacion` y antes de `inviteUserByEmail`. Lo fija el orden que asevera la prueba (a).
- El técnico pasa por la misma comprobación (con `centrosIds = [id]`). Cambia su comportamiento, pero a mejor: antes podía nacer en un centro cerrado.
- `tCon('invitar.resultados.registroConAltasPendientes', { mensaje, centros })` compone una frase correcta, y el `mensaje` que entra es un literal sin llaves.
- `aria-disabled:opacity-50` es una variante nativa de Tailwind 4. `Button` mezcla `className` con `cn`, así que no pisa `disabled:` ni el tamaño de 44 px.
- `docs/state.md` del diff viene del merge de `main` y no tiene nada de esta ronda. La bitácora de T-041 aún no existe. La desviación de P7 (que decía `perfiles`) tiene dueño, el §0 del diseño («`directorio_perfiles` da … a todo perfil activo»). Ahora solo consta en el comentario de `carga.ts` y en el commit; tiene que llegar a la bitácora al cerrar.
