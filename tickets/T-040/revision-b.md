Sin hallazgos ALTA en la ronda 2. Gate del corte B, revisor B (servidor, interfaz y cifrado): 0 ALTA, 0 MEDIA, 3 BAJA. Una de las BAJA es la que ya está anotada en `docs/state.md:52` de `main`, y la acepto así.

# T-040 · Revisión del corte B · Revisor B · Ronda 2

**Qué he revisado.** `git diff 99fe720..55c6399` en el worktree `agent-a9325d705ce4db36b`, sin lo que entra por el merge de `main` (`1b61f93`). Son cinco commits de la rama: `c1f5dbd` y `85d079c`, que son del revisor A, y `3517b4a`, `fb7104b` y `55c6399`, que son míos.

**Contra qué.** La ronda 1 de abajo, los hallazgos B-H1 a B-H6 de `revision.md`, y `diseno.md` (§B0, §1.3–§1.6 y §5). No he leído la evidencia ni el informe del verificador. No he consultado la base. No he arreglado nada: cada mutante se restauró y el árbol ha quedado limpio (`git status` vacío).

**Pruebas sin tocar nada.** `npx vitest run dialogo-de-copia editor-de-nota lista-de-notas panel-historia` da 148/148, seis veces seguidas.

## Cierre de la ronda 1, con mutantes medidos

| Hallazgo R1 | Arreglo | Mutante medido | Resultado |
|---|---|---|---|
| B-H1 (MEDIA) · `null` pintado como «no hay notas» | `lista-de-notas.tsx:25-35,92-103` separa `null` de `[]`, avisa y ofrece reintento. `panel-historia.tsx:199` reintenta con `intento+1` | `paraCopia = []` → `= null` como valor por defecto | **Muerto** («renderiza estado vacío cuando no hay notas») |
| | | Quitar `alReintentarCopias={alReintentar}` del panel | **Muerto** (panel: «Volver a intentarlo vuelve a pedir la pestaña») |
| B-H2 (MEDIA) · `solo_copia` sin PIN | `dialogo-de-copia.tsx:347-358`, botón «Desbloquear con el PIN» solo si `fase==='error' && bloqueada`. `editor-de-nota.tsx:807-810` lo lleva a `cerrada` | `setBloqueada(pedida.motivo==='bloqueada')` → `setBloqueada(true)` | **Muerto** («con otro error no hay botón de desbloquear») |
| | | Quitar el `alBloquearse` que el editor pasa a `CopiaPorMotivo` | **Muerto** (editor: «lleva al PIN y vuelve a la copia») |
| | | Quitar `alCerrar()` del botón | **Muerto** (diálogo: «cierra y avisa a la vista») |
| B-H3 (BAJA) · contraseña mirada con el formulario desmontado | Prueba nueva con `campo.value` tras un error, con el formulario montado | Quitar el `reset(...)` de la línea 171 | **Muerto** («tras un error… los campos de contraseña están vacíos») |
| B-H4 (BAJA) · cancelar solo en `pidiendo` | Prueba nueva: Escape mientras `cifrarCopia` sigue pendiente | Quitar `if (!vigente()) return;` de la línea 191 | **Muerto** («si se cierra mientras cifra…») |
| | | Quitar `contador.current += 1` del desmontaje | **Muerto** (las dos pruebas de cancelación) |
| | | Quitar `if (!vigente()) return;` de la línea 199, tras registrar | **SOBREVIVE**, 17/17 → R2B-H2 |
| B-H5 (BAJA) · sin axe ni modo motivo | `accesibilidad/nota-clinica.spec.ts:169-259`: foco en «Cerrar» tras la descarga, grupo «Motivo» con nombre, «Referencia» etiquetada y con descripción, Escape devuelve el foco. El desvío de axe está declarado en la spec y en `docs/state.md` («`@axe-core/playwright` no instalado») | No lo he ejecutado: hace falta el servidor y la sesión de Ana. Le toca al verificador | Cerrado en lo estático |
| B-H6 (BAJA) · la vista abierta caducada sigue ofreciendo «Descargar copia» | `editor-de-nota.tsx:218-221`: `solo_copia` siempre reemplaza la vista. `:434`: `solo_copia` ya no cuenta como `noDisponible` | El reductor vuelve a la forma de R1 | **Muerto** («una recarga que devuelve solo_copia…») |
| | | `noDisponible` vuelve a incluir `solo_copia` | **Muerto** (la misma prueba) |

**Técnica.** Los mutantes se aplicaron con un `replace` exacto de node en `scratchpad/mutar.mjs`. El script convierte `\n` en CRLF cuando el fuente lo lleva: `dialogo-de-copia.tsx` está en CRLF en el árbol de trabajo y `editor-de-nota.tsx` no. Una primera tanda sin esa conversión dio resultados que no se repitieron: un superviviente falso en el reductor y rojos ajenos. Todo lo de la tabla está medido otra vez, uno a uno, con la conversión.

## Lo que se pidió juzgar

1. **Cada hallazgo, ¿cerrado de verdad?** Sí, salvo la fase `registrando` de B-H4 (R2B-H2). Los mutantes de la tabla mueren por la prueba nueva, no por otra que ya existía.
2. **B-H2: ¿la salida al PIN deja algo vivo?** No. El orden es este:
   - La contraseña sale del formulario antes del primer `await` (`:171`). La prueba de B-H3 lo fija.
   - Al pulsar «Desbloquear con el PIN», `alCerrar()` y `alBloquearse()` van en el mismo manejador, así que se pintan juntos. `CopiaPorMotivo`, su `useState(abierto)` y el `ContenidoDeCopia` con el motivo y la referencia en `react-hook-form` se desmontan enteros, porque la fase pasa de `solo_copia` a `bloqueada`.
   - `useDevolucionDeFoco` intenta devolver el foco al disparador, que ya está desmontado, y no hace nada. Después el efecto de `enfocar: 'titulo'` lleva el foco al `h2` «Historia bloqueada» (`:550-553`), cuyo `aria-describedby` es la explicación, y el PIN queda en el siguiente Tab.
   - Tras el PIN, `abrir({ trasPin: true })` vuelve a pedir `notaId` y la acción recalcula `solo_copia`. Se monta un `CopiaPorMotivo` nuevo, con el diálogo cerrado, y `pedirFoco` lleva el foco al grupo. La vista es coherente.
   - Si tras el PIN la base vuelve a decir «bloqueada», se pasa a `sin_acceso`, y no hay bucle.
3. **B-H6: ¿abre la vista con contenido a quien solo tiene copia?** No.
   - La acción solo devuelve `solo_copia` cuando el servidor ya ha dicho `no_disponible` y la nota está en `notas_para_copia`. Esa función de la base exige ser administrador, no estar asignado, no ser el autor y tener el candado abierto. Ver `historia/notas/acciones.ts:46-52` y la migración `:500-525`.
   - La fase `solo_copia` del reductor solo lleva `nota: NotaParaCopia`, es decir, fecha, autor y número de versiones.
   - `abrir` vacía `sesion.current` (`:438`) y el `Estado` de la vista abierta (modelo, texto, reservadas, `caducaEn`) se descarta, así que el reloj se desmonta.
   - La prueba nueva comprueba que no hay textbox «Nota» ni «Descargar copia».
   - Corrijo mi R1-H6: el escenario que escribí no se puede alcanzar. Para recargar desde la vista abierta hace falta un aviso con recarga (`AVISOS_CON_RECARGA`: `yaFirmada`, `firmadaSinRecargar`, `noSeRecargo`, o el conflicto), y esos avisos solo salen de acciones del autor. Pero el autor nunca recibe `solo_copia`, porque `notas_para_copia` filtra `n.autor_id <> auth.uid()`. El arreglo es defensivo: correcto e inocuo.
4. **«Descargar copia» ante «bloqueada» en la vista abierta.** La acepto como BAJA anotada (R2B-H3). Tiene salida: «Cerrar historia» (`editor-de-nota.tsx:876`) lleva a la vista del PIN, y el reloj la cierra solo al caducar. Además el residuo está escrito con su qué en `docs/state.md:52` de `main`.
5. **Territorio.** Todo lo que tocan los cinco commits de la rama está en el YAML de B0.2:
   - `scripts/rls/27-exportaciones.sql`, `scripts/t040-oraculo.mjs`, `tickets/T-040/mutantes.json` y `oraculo-postgrest.json`;
   - `app/(app)/pacientes/[id]/historia/**`, `lista-de-notas.*` y `panel-historia.*`;
   - `lib/i18n/es.ts` y `accesibilidad/**`.

   `docs/state.md` y `tickets/T-028/**` llegan por el merge de `main`. `node ~/.claude/pipeline/territorio.mjs T-040` responde «sin territorio declarado», porque el YAML vive en `diseno.md` §B0.2 y no en el contrato. Es la ceguera ya conocida del gate, no un desvío de la rama.
6. **Claves nuevas de `lib/i18n/es.ts`.** Son dos y solo se añaden: `exportaciones.boton.desbloquear` y `exportaciones.lista.noSePudoLeer`. No hay reordenaciones ni cambios de formato en la zona que comparte con T-028 B.

## BAJA

### R2B-H1 · El reintento de B-H1 no da señal: si falla igual, no se anuncia; si sale bien, el foco cae en `body`
**Dónde:** `app/(app)/pacientes/[id]/lista-de-notas.tsx:92-103` y `panel-historia.tsx:199` (con `:155` y `:204`)

**Qué pasa:** «Volver a intentarlo» hace `setIntento(n+1)`. Mientras dura la petición no se ve nada, porque `apertura` sigue puesta y `<Cargando>` solo se pinta cuando no la hay.
- **Si la segunda lectura también falla:** React reutiliza el mismo `<div role="alert">`, con el mismo texto. El lector de pantalla no anuncia nada y la vista no cambia.
- **Si sale bien:** el aviso se desmonta con el botón enfocado dentro, y el foco cae en `body`.

**Escenario:** un administrador no asignado, con lector de pantalla. `notas_para_copia` falla por red dos veces seguidas.
1. Pulsa «Volver a intentarlo» y no oye ni ve ningún cambio, así que no sabe si se reintentó. Lo pulsa tres veces más. Cada pulsación es un `abrirPestanaDeHistoria` que deja un acceso registrado más, y el contador «N veces en esta ventana» sube cuatro.
2. Cuando por fin vuelve bien, el foco está en `body` y la lista «Otras notas» aparece sin anunciarse.

El editor ya resolvió lo mismo con `noSeRecargoOtraVez` y su contador de intentos (`editor-de-nota.tsx:850-855`). Es el patrón «reintento que falla igual sin anuncio».

**Por qué las pruebas no lo ven:** la prueba del panel solo cubre el reintento que sale bien, y no mira el foco.

### R2B-H2 · El arreglo de B-H4 prueba la cancelación en `cifrando`, pero la fase `registrando` sigue sin prueba
**Dónde:** `app/(app)/pacientes/[id]/historia/notas/dialogo-de-copia.tsx:199`

**Qué pasa:** el mutante que quita `if (!vigente()) return;` justo después de `registrarFicheroDeCopia` deja la suite del diálogo en verde (medido: 17/17). La guarda está en el código, pero ninguna prueba la fija.

**Escenario:** el usuario pulsa Escape mientras se registra el fichero, porque se ha equivocado de nota. El diálogo se cierra. Con esa línea quitada en un refactor, el registro vuelve con `ok` y `descargar(html, …)` dispara de todos modos la descarga de una copia que el usuario canceló, y nada se pone rojo.

**Qué haría falta:** la misma prueba de B-H4, pero con `registrarFicheroDeCopia` pendiente: Escape, resolver y comprobar que no se crea ninguna URL ni se descarga nada.

### R2B-H3 · En la vista abierta, «Descargar copia» ante «bloqueada» sigue sin ofrecer el PIN (anotada, aceptada)
**Dónde:** `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx:975`. `BotonDeCopia` no recibe `alBloquearse`.

**Escenario:** el profesional tiene la historia abierta en dos pestañas y la cierra en una. En la otra, con el reloj todavía vigente, pulsa «Descargar copia» → 42501 «no está desbloqueada» → aparece «Vuelve a desbloquearla con tu PIN y repite la copia», pero el diálogo no tiene botón para desbloquear.

**Por qué es BAJA:** hay salida. Se cierra el diálogo y «Cerrar historia» (`:876`) lleva al formulario del PIN. Y el reloj cierra la vista solo cuando caduca. Está anotada en `docs/state.md:52` de `main` («B-H2 solo cubrió solo_copia»). La acepto así.

## Descartados

- **Mutante «quitar `setBloqueada(false)` al reenviar» (`:174`): sobrevive, pero es inocuo.** Solo cambia algo si, tras un «bloqueada», el segundo envío pasa `pedirCopiaDeNota` (porque el candado se reabrió en otra pestaña) y después falla el registro. En ese caso se vería «Desbloquear con el PIN» bajo «no se pudo registrar». Pulsarlo pide un PIN que se acepta y devuelve a `solo_copia`. No se pierde ni se expone nada.
- **Salida al PIN cuando se entró por la cita.** Tras el PIN, `abrir` usa `citaId` y `notaId` de las props, no la nota de `reabrir`. Pero por la cita solo se abren notas propias (`buscarPorCita` filtra `autor_id`), y las propias nunca son `solo_copia`. No hay escenario.
- **El foco va al título «Historia bloqueada» y no al campo del PIN.** Es la misma fase `cerrada` que usa «Cerrar historia». El título describe el estado y el PIN está en el siguiente Tab. No es un fallo.

---

# Ronda 1

Sin hallazgos ALTA. Gate del corte B, revisor B (servidor, interfaz y cifrado de punta a punta): 0 ALTA, 2 MEDIA, 4 BAJA.

# T-040 · Revisión del corte B · Revisor B

Rama `worktree-agent-a9325d705ce4db36b`, diff `git diff main...HEAD`. He revisado contra el contrato, `diseno.md` (B0, §1.3 a §1.6, §5 y las decisiones del propietario) y `lib/exportaciones/formato.ts`, del corte A. No he leído la evidencia ni el informe del verificador. No he arreglado nada.

## Lo que se pidió atacar y no da hallazgo

1. **La contraseña no entra en el servidor.** Ninguna Server Action la recibe: `esquemaPedirCopia` y `esquemaRegistrarFichero` son `strictObject`. En `dialogo-de-copia.tsx:156-158` la contraseña se copia a una variable local y se vacía del formulario antes del primer `await`. `servidor.ts` registra solo `{code}`, o `path` y `code` de Zod. El guion C5 tiene controles positivos: el volcado contiene `exportacionId`, `MARCA_CUERPO` aparece dos veces en `notas_clinicas_versiones` y los registros no están vacíos. Así que, si hubiera una fuga, la búsqueda la vería en las cinco tablas y en los registros de db y rest.
2. **Contenido clínico en servidor.** La copia entera viaja al cliente solo para cifrarla, que es lo que manda ADR-076. `CopiaPorMotivo` y `BotonDeCopia` pintan solo fecha, autor y número de versiones.
3. **Administración.** Solo ve metadatos. La copia por motivo deja acceso y auditoría, y avisa al titular, al superviviente y al autor (`distinct`, activos, sin quien pide). El técnico no llega a ninguna RPC.
4. **Editor.** Si `solo_copia` llega con el editor abierto, se trata como `no_disponible` (`editor-de-nota.tsx:218-226`). El diálogo ordena las versiones y los autores por `numero_version` en la base.
5. **Foco y Escape del diálogo** (`Dialogo` con `useFocoAtrapado`, `useCierreExterior` y `useDevolucionDeFoco`). La spec prueba el foco al abrir, las vueltas de Tab y Mayús+Tab, y que Escape devuelve el foco al disparador.
6. **Desvíos declarados: los cuatro son aceptables.**
   - `esquemaDialogoCopiaPorMotivo` solo añade validación en el cliente.
   - Las props de `CopiaPorMotivo` (`{pacienteId, nota}`): B0.4 solo las fijaba si la pieza se delegaba, y no se delegó.
   - El contador `ejecucion` equivale a la bandera `cancelado`, y el desmontaje lo incrementa.
   - Que el guion actúe como Bruno está justificado: una sesión real es lo que exige H23.
7. **Convivencia con T-028 B en `lib/i18n/es.ts`.** Solo hay añadidos: el bloque `exportaciones` y `notificaciones.tipos.exportacion_por_administracion`. Nada se reordena ni se reformatea fuera de ellos.

## MEDIA

### H1 · El fallo de `notas_para_copia` se pinta como «no hay notas»
**Dónde:** `app/(app)/pacientes/[id]/lista-de-notas.tsx:28`

**Qué pasa:** `abrirPestanaDeHistoria` distingue bien entre `null` («no se pudo leer») y `[]`, y `acciones.test.ts` lo prueba. Pero la lista vuelve a juntarlos con `const otras = paraCopia ?? []`, y la línea 29 pinta el estado vacío.

**Escenario:** un administrador que no es el asignado no lee ninguna nota por RLS. Abre «Notas clínicas» y `notas_para_copia` falla (red, o 42501 por una carrera con el candado) → `notas = []`, `paraCopia = null` → ve «Todavía no hay notas» en un paciente que tiene cinco notas firmadas. No hay aviso ni reintento, así que concluye que no hay nada que entregar al juzgado. Si `notas` no está vacío, la sección «Otras notas» desaparece sin decir nada.

**Por qué las pruebas no lo ven:** `lista-de-notas.test.tsx` prueba `paraCopia={null}` solo con `notas=[nota]` y comprueba que no haya encabezado. Es decir, fija como correcto el silencio.

### H2 · En `solo_copia`, el candado caduca y el error manda a un PIN que la vista no ofrece
**Dónde:** `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx:798` (la rama `solo_copia`) y `:489` (el reloj)

**Qué pasa:** el reloj se calcula como `abierta?.caducaEn ?? null`, así que en `solo_copia` no hay reloj: la vista nunca pasa a `bloqueada` ni pinta el formulario de PIN. `exportar_nota` sí exige el candado abierto.

**Escenario:**
1. El administrador abre la nota por `?nota=`, entra en `solo_copia` y se pone a redactar la referencia del requerimiento.
2. Pasa la ventana del desbloqueo y pulsa «Descargar copia» → 42501 «no está desbloqueada» → `bloqueada` → «La historia se ha bloqueado. Vuelve a desbloquearla con tu PIN y repite la copia».
3. En la vista no hay campo de PIN. Cerrar y reabrir el diálogo da el mismo error una y otra vez. La única salida es recargar la página, y en ningún sitio se le dice.

En `abierta` no pasa, porque el reloj la lleva a `bloqueada` con el PIN enfocado. Es una vista nueva que no hereda el reloj de su hermana.

## BAJA

### H3 · La prueba de «la contraseña ya no está» comprueba la fase en que el formulario no existe
**Dónde:** `app/(app)/pacientes/[id]/historia/notas/dialogo-de-copia.test.tsx:104-115`

**Qué pasa:** la prueba mira tras `descargada`, pero en esa fase el formulario está desmontado (`dialogo-de-copia.tsx:207`). Por eso `queryAllByLabelText(/contraseña/i)` no devuelve nada y el bucle no da ni una vuelta. Además, `innerHTML` no refleja la propiedad `value` de un `<input>`.

**Escenario:** el mutante que quita `reset(...)` de `dialogo-de-copia.tsx:158` la deja en verde. Con ese mutante, en cualquier ruta de error (`sin_permiso`, `bloqueada`, `noRegistrada`) el formulario sigue montado con la contraseña en el campo y en el estado de react-hook-form. Quien deja el puesto con el diálogo abierto tras el error deja la contraseña recuperable desde las herramientas de desarrollo. Ninguna prueba mira `campo.value` en una ruta de error.

### H4 · La cancelación solo se prueba durante `pidiendo`
**Dónde:** `app/(app)/pacientes/[id]/historia/notas/dialogo-de-copia.test.tsx:188-203`

**Qué pasa:** se prueba cerrar mientras se pide la copia, pero no mientras se cifra.

**Escenario:** el mutante que quita `if (!vigente()) return;` de `dialogo-de-copia.tsx:174`, justo tras `cifrarCopia`, deja la suite en verde. Con él, si el usuario pulsa Escape durante los 2-5 s de Argon2id porque se ha equivocado de nota, el diálogo se cierra pero el código sigue: registra el fichero y dispara la descarga de una copia que ha cancelado.

### H5 · La spec de accesibilidad no lleva axe ni cubre el diálogo en modo motivo
**Dónde:** `accesibilidad/nota-clinica.spec.ts:1`

**Qué pasa:** §1.6 pide axe sobre el diálogo y §5 pide el foco en «Cerrar» tras la descarga. La spec no importa axe (no está en las dependencias) y no lo declara como desvío. Solo recorre el modo profesional.

**Escenario:** una regresión que deje sin `legend` el grupo de radios del motivo (`dialogo-de-copia.tsx:219`), o sin etiqueta el campo de referencia, no la caza ninguna prueba. Tampoco una que deje el foco en `<body>` al pasar a `descargada`: el lector de pantalla no anuncia «Copia descargada» y el usuario de teclado pierde su sitio. El desvío tendría que estar escrito en el diseño o en `docs/state.md`.

### H6 · Con la vista caducada, «Descargar copia» sigue ahí y solo puede dar `falta_motivo`
**Dónde:** `app/(app)/pacientes/[id]/historia/notas/editor-de-nota.tsx:966` (con `:218-226`)

**Qué pasa:** cuando la nota abierta deja de leerse y la recarga devuelve `solo_copia`, la vista se queda con el aviso `noDisponible`. `VistaVigente` sigue pintando `BotonDeCopia` en modo profesional, sin campo de motivo.

**Escenario:** un administrador que era el asignado tiene la nota abierta; se reasigna el paciente y la recarga devuelve `solo_copia`. Pulsa «Descargar copia» → 42501 «Falta el motivo» → «Para sacar una copia de esta nota hace falta un motivo». Pero el diálogo no tiene dónde ponerlo. Solo puede salir recargando para entrar por `solo_copia`. El control no tiene detrás ninguna acción posible, contra la regla de interfaz de `CLAUDE.md`.

## Descartados

- **El 23505 de `registrar_fichero_exportado` se traduce a `noRegistrada`** (`servidor.ts:125`). No es alcanzable desde la interfaz: cada envío pide una exportación nueva, y la guarda `trabajando` impide el doble registro. No hay escenario.
