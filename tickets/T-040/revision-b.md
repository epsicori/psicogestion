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
