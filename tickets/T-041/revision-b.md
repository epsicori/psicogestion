# T-041 · Revisión B (aplicación e interfaz) — ronda 1

**Sin hallazgos ALTA.** 0 ALTA · 1 MEDIA · 7 BAJA.

- Diff: `git diff main...worktree-agent-ada3a424c2ef63d80` (base común `afbbfcc`, HEAD `9e0033c`).
- Mi parte: `app/(app)/ajustes/**`, `lib/cuentas/{esquemas,invitar,altas}.ts` y sus pruebas,
  `lib/i18n/es.ts` y `docs/interfaz.md`. La migración, el banco 28, la siembra y `architecture.md` son del revisor A.
- Mutantes medidos en el worktree, con el fichero restaurado después (`git status` limpio salvo
  `tmp-v41.mjs`, que no es mío).
- Foco medido en Chromium con Playwright (`setContent`).

## Lista «Qué revisar» del diseño (§5), lo que me toca

| Punto | Resultado |
|---|---|
| `invitarPerfil`: refine 3 obliga a que `centroPrincipalId` esté en `centrosIds` | Sí (`esquemas.ts`, refine 3). Probado con principal C fuera de [A, B] y con principal sin centros. |
| `centro_id` de los metadatos = el principal elegido, no `centrosIds[0]` | Sí (`invitar.ts:70`). Gemela (a) con principal A y con principal B. |
| `dar_alta_centro` por `sesion.supabase`, nunca por `crearClienteAdministracion()` | Sí (`invitar.ts:101-111`, `altas.ts`). `invitar.test.ts` (a) asevera `adminRpc` sin llamadas, y el cliente simulado no tiene la RPC. |
| `/ajustes/centros` redirige en servidor a quien no es administrador | Sí (`centros/page.tsx:32-34`, `redirect` antes de leer nada). Mismo patrón que `dar-de-baja/page.tsx`. Las dos acciones repiten `exigirAdministrador()`. |
| La lista no muestra técnicos | Sí: `.in('rol', ['profesional_sanitario','administrador'])` y `estado = 'activo'`. |
| La confirmación dice qué cambia y lleva «principal» en texto | Sí, en el diálogo y en la lista. Hay pruebas de los dos avisos de principal, cada una con su gemela. |
| 44 px | `Button` (`min-h-11`), `Casilla` (etiqueta `min-h-11`). |
| Mismo esquema Zod en el cliente y en la acción | Sí: `zodResolver(esquemaInvitacion)` y `esquemaInvitacion.safeParse`. Las acciones de altas usan `esquemaAltaCentro`. |
| Pruebas de foco: «Cancelar» devuelve, éxito → estado | Discriminan. Al quitar `estado.current?.focus()`, mueren 2 pruebas (medido). Pero ver B-H1: la salida con error no la puede ver jsdom. |

## Dudas que el implementador resolvió solo

1. **`EstadoAlta = EstadoFormulario & { ok?: true }`**: lo decidió el implementador. P6 dice
   «devuelven `EstadoFormulario`».
   - Es un superconjunto compatible, y hace falta: el éxito y el rechazo llevan los dos `mensaje`,
     y el diálogo solo se cierra con éxito.
   - Exportar un `type` desde un fichero `'use server'` se borra al compilar, así que no rompe la
     regla de «solo funciones async».
   - Aceptable.
2. **Altas vigentes en centros cerrados**: también lo decidió el implementador. P7 lee
   `centros` con `activo = true` y no dice qué pasa con un alta vigente en un centro cerrado.
   - Leer todos los centros para poner nombre a esas altas, y ofrecer solo los abiertos, cuadra
     con la base:
     - `retirar_alta_centro` no mira `centros.activo`, así que se puede retirar;
     - `tienePrincipal` cuenta un principal en un centro cerrado igual que `v_principal`.
   - Correcto.
3. **`altasCentro.noGuardado`**: lo decidió el implementador; no está en P8.
   - Es el texto de reserva cuando la acción vuelve sin `mensaje`, que solo pasa por la rama de
     `safeParse` fallido.
   - Repite el texto de `MENSAJE_GENERICO` de `altas.ts`. Inocuo.
4. **De una casilla a dos, el principal se vacía**: esto **lo decide el diseño**. P7 dice «con dos
   o más, … valor `null` hasta que se elija», y D10 lo respalda.
   - La prueba discrimina. Al quitar la rama `centrosIds.length <= 1`, muere «dos casillas y sin
     principal no llega a la acción» (medido).

## MEDIA

### B-H1 · Con error, el diálogo de dar o retirar queda abierto con el foco fuera de él

- **Dónde**: `app/(app)/ajustes/centros/gestion-altas.tsx:237`.
- **Qué pasa**: «Confirmar» y «Cancelar» llevan `disabled={enviando}`. Al pulsar «Confirmar», el
  botón enfocado se deshabilita y el foco cae en `BODY`. No vuelve al rehabilitarlo.
  - Medido en Chromium: `tras disabled: BODY`, `tras rehabilitar: BODY`.
  - En la salida con éxito lo arregla el efecto que enfoca el estado. **En la salida con error
    nadie lo recoloca.**
  - La prueba «GEMELA: con error, el diálogo sigue abierto» no puede verlo: jsdom deja
    `activeElement` en el botón deshabilitado.
- **Escenario**:
  1. Un administrador usa teclado y lector de pantalla.
  2. Pulsa «Retirar» en un alta que otro administrador acaba de retirar, y luego «Confirmar».
  3. Llega P0002 y el `role="alert"` se lee, pero el foco está en `body`, fuera del diálogo modal.
  4. Intro no hace nada. El cursor virtual del lector arranca al principio del documento.
  5. Solo un Tab lo devuelve, a la «X», y no a «Confirmar» ni al mensaje.
- El diseño (P7) especifica el foco de las dos salidas de este diálogo, y el foco es de la fábrica.
- Mismo patrón que `dar-de-baja` (fuera del diff), y que T-015 B-H4 y T-028 B R4.

## BAJA

### B-H2 · La prueba (c) no ve que el bucle de altas adicionales se corte al primer fallo

- **Dónde**: `lib/cuentas/invitar.test.ts:121`.
- **Qué pasa**: (c) usa un solo centro adicional.
- **Mutante**: añadir `return { ok: true, perfilId, altasSinDar }` tras el `push` de
  `invitar.ts:109`. **Sobrevive**: 6/6 en verde (medido).
- **Escenario**:
  1. Se invita con [Madrid (principal), Canarias, Bilbao].
  2. Falla el alta de Canarias.
  3. El código mutado no intenta la de Bilbao ni la reporta. El mensaje dice «No se pudo dar el
     alta en Canarias» y Bilbao falta sin aviso.
- Hace falta una prueba con dos adicionales, la primera fallando: `altasSinDar = [primera]` y
  `dar_alta_centro` llamado dos veces.

### B-H3 · Si falla `registrar_invitacion`, las altas adicionales no se dan y nadie lo dice

- **Dónde**: `lib/cuentas/invitar.ts:89`.
- **Qué pasa**: el paso 3 devuelve `ok: false` antes del paso 4.
- **Escenario**:
  1. Se invita con [Madrid (principal), Canarias].
  2. `registrar_invitacion` falla por un error transitorio.
  3. El perfil existe y solo tiene Madrid.
  4. El administrador lee «La cuenta se creó, pero no se pudo dejar constancia de la invitación.»,
     sin mención a Canarias.
  5. La persona no aparece como coprofesional en Canarias, y nada apunta a Ajustes › Altas de centro.
- Es justo el «estado a medias sin avisar» que el diseño quiere evitar en la invitación en cuatro
  pasos. Las dos salidas posibles:
  - intentar el paso 4 de todos modos y decirlo;
  - o nombrar en el mensaje los centros pendientes.

### B-H4 · Un centro cerrado entre la carga del formulario y el envío pasa la validación previa

- **Dónde**: `lib/cuentas/invitar.ts:44`.
- **Qué pasa**:
  - `preparar_invitacion` no mira `centros.activo` (diseño §0).
  - El formulario solo ofrece centros abiertos, pero la lista es una foto de cuando se cargó.
- **Escenario**:
  1. El administrador 1 cierra Canarias mientras el administrador 2 tiene abierto
     `/ajustes/invitar` con Canarias marcado.
  2. Si Canarias es el **principal**, va en los metadatos. `fn_crear_perfil_de_usuario` inserta el
     alta principal sin mirar si el centro está activo. Resultado: perfil con principal en un
     centro cerrado, y sus pacientes futuros quedan allí.
  3. Si Canarias es **adicional**, `dar_alta_centro` da 23514 y sale `exitoConAltasPendientes`:
     «dásela desde Ajustes › Altas de centro». Pero `/ajustes/centros` no ofrece centros cerrados
     (`centros/page.tsx:83-85`), así que el consejo no lleva a ninguna parte.
- D9 promete validar todos los centros antes del correo, y aquí no valida que estén abiertos. Es
  una carrera entre dos administradores, por eso BAJA.

### B-H5 · Un fallo de lectura en `/ajustes/centros` se pinta como ausencia y falsea el aviso de principal

- **Dónde**: `app/(app)/ajustes/centros/page.tsx:52`.
- **Qué pasa**: los tres errores de lectura solo van a `console.error`.
- **Escenario**: la lectura de `perfiles_centros` falla y la de `perfiles` no.
  - Todas las personas salen con «Sin altas de centro vigentes» y `tienePrincipal: false`.
  - Dar a Pau (principal en Norte) un alta en Este enseña «Será su centro principal: los pacientes
    que dé de alta a partir de hoy quedarán en Centro Este…». Es falso: la base la inserta como no
    principal.
  - Si falla `centros`, cada alta sale sin nombre. Con una persona elegida, se lee «Ya tiene alta en
    todos los centros abiertos».
- Tiene precedente en `dar-de-baja/page.tsx`. Aquí pesa más, porque la ausencia decide el texto de
  la confirmación explícita de ADR-051.

### B-H6 · La derivación de `tienePrincipal` no tiene prueba, y decide el aviso de principal

- **Dónde**: `app/(app)/ajustes/centros/page.tsx:70`.
- **Qué pasa**: `gestion-altas.test.tsx` recibe `tienePrincipal` ya hecho, y `page.tsx` no tiene
  prueba.
- **Mutante**: `tienePrincipal: suyas.length > 0`. Sobrevive a toda la suite, porque no hay ninguna
  prueba que lo cargue.
- **Escenario**: el mutante solo se distingue en el estado D5.
  1. Se retira el principal de Pau (Norte) y le queda Sur, no principal.
  2. Se le da Este.
  3. La base hará de Este su principal (P2a), pero la confirmación mutada no avisa de que sus
     pacientes futuros quedarán en Este.
- Basta con extraer el mapeo a una función pura y probarla con «altas sin principal».

### B-H7 · El aviso de invitación a medias se anuncia peor que el de éxito y se ve igual

- **Dónde**: `app/(app)/ajustes/invitar/formulario-invitar.tsx:200`.
- **Qué pasa**:
  - `exitoConAltasPendientes` sale por `{mensaje && <p role="status">}`. La región viva se crea ya
    rellena, y varios lectores no anuncian una región insertada con contenido.
  - El texto tiene el mismo estilo que el éxito.
  - La estructura es previa, pero el aviso nuevo de estado a medias depende de ella.
- **Escenario**:
  1. Se invita con dos centros y falla el alta adicional.
  2. NVDA no lee nada, o lee el texto como un éxito más.
  3. El administrador no da el alta pendiente.
- Arreglo posible: región montada desde el principio y vacía, y un estilo de aviso para la variante
  con altas pendientes.

### B-H8 · La transición del diálogo no tiene `try/catch`: un fallo de transporte tumba la pantalla

- **Dónde**: `app/(app)/ajustes/centros/gestion-altas.tsx:93`.
- **Qué pasa**: `await accion(...)` dentro de `iniciarTransicion` sin `try/catch`.
- **Escenario**:
  1. Se corta la red, o la acción responde 500, al pulsar «Confirmar».
  2. La promesa se rechaza dentro de la transición y React 19 la lleva al límite de error.
  3. Se ve la pantalla de error de la ruta en lugar del mensaje dentro del diálogo que pide P7.
- Mismo patrón que los demás formularios de `ajustes/` (fuera del diff), por eso BAJA.

## Lo que miré y está bien

- La primera alta de quien no tiene principal la decide la RPC: el cliente no manda `principal`.
  `esquemaAltaCentro` solo tiene `perfilId` y `centroId`.
- `mensajeDeErrorDeAlta` solo deja pasar el texto de la base con 23514. El resto sale con mensaje
  fijo, y el genérico va con `console.error`. Las pruebas van código por código.
- Al cambiar de rol se vacían las casillas, y el técnico conserva el desplegable de un centro. La
  gemela del técnico (R1) sigue y exige exactamente uno (refine 1 con [] y con [A, B]).
- El enlace solo está en `AccesosDeAdministracion`, que devuelve `null` a quien no es
  administrador.
- `invitar/page.tsx` filtra `activo = true`.
- El orden de los efectos para el foco de éxito es correcto: las limpiezas del diálogo que se
  desmonta corren antes que el efecto del padre.
- `revalidatePath` desde `next/cache` en una Server Action está documentado en
  `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`.
- `docs/interfaz.md`: una línea en §Ajustes, como pide P9.
