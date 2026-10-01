SIN ALTA. Total de los dos revisores: 0 ALTA · 0 MEDIA · 5 BAJA. Revisor A (SQL, RLS, seguridad y datos): 0/0/0, sin hallazgos nuevos. Revisor B (interfaz, accesibilidad y React): 0/0/5, de B3-1 a B3-5, copiados tal cual de `revision-B.md`.

# T-014 · Revisión de la tercera ronda de arreglos (cee5503..9d84a86)

Qué se ha revisado:
- `git diff worktree-agent-ad57f1926d23105e2 worktree-agent-a09e769eeabcb1913` (10 ficheros, sin SQL: el diff no toca `supabase/`, `scripts/` ni `lib/`). El contrato y `diseno.md`.
- `revision.md` y `revision.json` de la ronda anterior; `revision-B.md` de esta; `docs/state.md` §Hallazgos.
- En el worktree: `bloques.ts` (`VISIBLE_AL_TECNICO`, `criterioDocumentacion`, `leerRol`), `documentacion.tsx`, `documentacion.test.tsx`, `vista.ts` (`propia`), `page.tsx`, `lib/citas/agenda.ts` (`AlertaPendiente`, `leerAlertasNotaPendiente`) y su prueba, `lib/supabase/tipos-bd.ts` y la migración que crea el enum `tipo_alerta_documentacion`.

No se ha leído `evidencia.json`. No se ha usado la base local (la tiene el verificador). En el worktree, `vitest run` de `documentacion.test.tsx`, `bloques.test.ts` y `lib/citas/agenda.test.ts` sale verde: 37 pruebas. No se han aplicado mutaciones en el worktree para no pisar al verificador; las que siguen se razonan contra las aserciones exactas.

## 1 · Hallazgos anteriores (revisor A y los de B en mi foco)

| Id | Veredicto |
|---|---|
| A2-1 | **Cerrado.** `criterioDocumentacion` (`bloques.ts:108-114`) solo deja sin filtro de tipo a `administrador` y `profesional_sanitario`; cualquier otro valor, `null` incluido, recibe `tipos: TIPOS_DEL_TECNICO`. Como `leerRol` (`bloques.ts:74-76`) reduce todo lo desconocido a `null`, los únicos casos son técnico y `null`, y los dos caen en la lista blanca. La prueba de `null` (`documentacion.test.tsx:51`) compara el objeto entero, `{ soloPropias: true, tipos: ['consentimiento_pendiente'] }`: si `null` volviera a la rama clínica, caería por `tipos`. |
| B2-5 | **Cerrado desde mi lado.** `VISIBLE_AL_TECNICO` (`bloques.ts:90-96`) solo marca `consentimiento_pendiente`. El técnico ya no pide `borrador_abandonado`, ni `informe_pendiente` ni `evaluacion_sin_corregir`. El filtro va en la consulta (`agenda.ts:218`, `.in('tipo', [...tipos])`), no al pintar, así que tampoco cuentan en el recuento ni viajan al cliente. La prueba del técnico compara el objeto entero: marcar cualquier otro tipo a `true` la pone roja. |
| B2-6 | **Cerrado.** El tipo del mapa es `AlertaPendiente['tipo']`, que es `Database['public']['Enums']['tipo_alerta_documentacion']` (`agenda.ts:59`), y `lib/supabase/tipos-bd.ts` lo genera `npm run tipos` (`supabase gen types`), no una copia a mano. `satisfies Record<TipoAlerta, boolean>` sobre un literal obliga a las dos cosas: falta una clave → no compila; sobra una → no compila. La copia `TIPOS_ALERTA_DOCUMENTACION` ha desaparecido, y con ella el filtro de todos. |

**Sin otra puerta dentro del territorio de T-014.** Las únicas lecturas de `alertas_documentacion` en `app/`, `components/` y `lib/` son `leerAlertasNotaPendiente` (solo la llama `documentacion.tsx:46`, siempre con `criterioDocumentacion`) y `pacientes/[id]/datos.ts:325`, que es la ficha del paciente, ya anotada en `state.md` para T-015. El otro dato derivado de las alertas, `nota_pendiente` de la RPC, llega a la interfaz solo por `diasPendiente` (`vista.ts:271`), y ahí `propia` exige `rol in (profesional_sanitario, administrador)` (`vista.ts:235`): el técnico y `null` reciben `null` aunque figuren como profesional de la cita. `CitaVista` se construye campo a campo, sin esparcir la fila, así que `notaPendiente` no viaja al cliente por otro campo.

**El profesional y el administrador no abren nada que antes estuviera cerrado.** Con `tipos` ausente, `leerAlertasNotaPendiente` no añade `.in` (`agenda.ts:218`, probado en `agenda.test.ts:162`). Antes de la ronda recibían la lista de los cinco tipos; ahora, todos los del enum, que hoy son los mismos cinco. `soloPropias` no cambia: sigue `true` para el administrador (choque 2) y `false` para el profesional sanitario (su RLS lo limita). La única diferencia futura es que un tipo nuevo les llega sin tocar nada, que es lo que pedía B2-6. Las dos pruebas fijan `tipos` con `toBeUndefined` y `soloPropias` con su valor: si uno de los dos roles cayera en la lista blanca, o el administrador perdiera el recorte, se pondrían rojas.

## 2 · Hallazgos nuevos (revisor A)

Ninguno. He buscado en mi foco:
- **Rol `null` o desconocido.** Recorta a lo propio y a la lista blanca a la vez. Un administrador al que le falla la lectura de `perfiles` ve solo sus consentimientos: falla cerrado.
- **Lista blanca vacía.** `TIPOS_DEL_TECNICO = []` hace que `documentacion.tsx:45` devuelva `null` antes de consultar, así que no llega un `.in('tipo', [])` a PostgREST. Es coherente con «un tipo nuevo queda oculto».
- **Técnico con `soloPropias: false`.** Ve los `consentimiento_pendiente` de toda la organización que le deje la RLS. Es lo que decidió el propietario, y la RLS de la tabla entra con T-015 (anotado).
- **Regresiones de datos en el resto del diff** (calendario, zona por confirmar, colocación del panel). No leen ni escriben datos nuevos: solo deciden foco y posición. `resolverCita` reutiliza `vista.citas`, que ya está en el cliente.

## 3 · Hallazgos de esta ronda del revisor B (copiados de `revision-B.md`)

### BAJA

**B3-1 · `app/(app)/agenda/calendario.tsx:160-163`**. Con el panel del día abierto y el foco en la fila de la cita, el resultado tardío no hace nada y, si la cita cambia de día, el foco cae a `body`.
- **La causa.** `nadaAbierto` exige `abiertos.length === 0`. Con la pila `[día]`, no es «nada abierto», no es «sigue abierto» y la función sale sin tocar el foco. Es el mismo tercer estado de B2-1 («foco en la propia cita»), pero con el día debajo.
- **Escenario.** Se abre el martes desde su número y, desde la lista del día, la cita A. Se pulsa Confirmar en su propuesta, «el jueves a las 11:00». Durante «Un momento…» se pulsa Escape: el panel de A se cierra y el foco vuelve a la fila de A en el panel del martes (D9). La acción vuelve y el recargado saca a A del martes. La fila se desmonta con el foco dentro, y el foco cae a `body` con el panel del día todavía abierto. El lector de pantalla pierde el sitio. El siguiente Tab sí lo recupera la trampa, que lleva el foco a la primera fila del panel.
- **Reproducido** (R1, prueba temporal): tras el recargado, `document.activeElement === document.body` y el panel del martes sigue abierto.
- **Lo que falta.** Decidir el caso por dónde está el foco (en un `[data-cita-id=cita.id]` o en `body`), no por cuántos paneles hay. Con el día abierto, el destino razonable es el propio panel del día (su primera fila o el número del día nuevo si se cierra). Elegirlo es cosa del diseño.

**B3-2 · `app/(app)/agenda/calendario.tsx:160`**. La conjunción `dialogo === null` de `nadaAbierto` no tiene prueba. Si se quita, el resultado tardío roba el foco a un diálogo modal y ninguna prueba cae.
- **Cuándo importa.** El diálogo de reprogramar también se abre con la pila vacía, al soltar una cita arrastrada (`alSoltar`). Es el único estado con un diálogo abierto y ningún panel.
- **Escenario.** Se confirma la propuesta de A desde su panel y se pulsa Escape. Durante la espera, se arrastra B a otra hora, y se abre «Reprogramar la cita» con el foco dentro. Vuelve el resultado de A. Con la conjunción, la función sale y el foco no se mueve: el código está bien. Sin ella, `nadaAbierto` es `true`, `enfocarCita` lleva el foco a A en la rejilla, detrás del modal, y vuelve a hacerlo con el recargado.
- **Medido.** Con el mutante, las 334 pruebas siguen en verde. Una prueba temporal (R2) con ese recorrido (arrastre de B como en «soltar una cita arrastrada…» y foco en el diálogo) pasa con el código del árbol y se pone **roja** con el mutante. Es la prueba que falta.

**B3-3 · `app/(app)/agenda/zona-por-confirmar.tsx:25-26`**. «Dentro de la zona» incluye las filas de las otras propuestas, y la resolución de una les quita el foco.
- **La causa.** `zona.current.contains(activo)` es verdad para cualquier botón de «Por confirmar», no solo para los de la fila que se resuelve. La guarda sigue al pie de la letra lo que pedía B2-2, que era demasiado ancho.
- **Escenario.** Hay dos propuestas, la de Ana y la de Berta. Se pulsa Confirmar en la de Ana y, durante «Un momento…», se pasa con Tab al Confirmar de Berta para encadenarla. Vuelve la de Ana: el foco salta al `div` de la zona (`tabIndex=-1`). Un Intro ya no confirma la de Berta, y el lector anuncia la zona en vez del botón.
- **Reproducido** (R3, filas con `key` como en `por-confirmar.tsx`): el Confirmar de Berta sigue montado (`isConnected === true`) y `activeElement` es el `div` de la zona.
- **Lo que falta.** La fila que se resuelve tiene que decir si el foco era suyo. Por ejemplo, `alResuelta` puede recibir el contenedor de la fila, o la fila puede comprobar `contains` antes de avisar. La zona solo toma el foco si estaba en esa fila o en `body`.

**B3-4 · `components/ui/colocacion.ts:129`** (lo pinta `panel-anclado.tsx:147`). Con el panel centrado, el pico sigue dibujado y apunta a lo que haya justo encima del panel, que no es la cita.
- **La causa.** `centrarEnVentana` devuelve `lado: 'abajo'` y `picoX = ancho / 2`. El pico sale en el centro del borde superior, apuntando hacia arriba, al centro horizontal del calendario.
- **Escenario.** Es el de B2-3: un iPad mini con la semana abierta en horizontal, una cita abierta desde el panel del día, y se gira a vertical (744 px, por debajo de `md`). La semana pasa a la `ListaDia` y el panel se centra en `top` 446. El pico apunta a la fila de la lista que queda encima del panel, que puede ser otra cita, por ejemplo la de Berta. Quien mira lee que el panel de Ana pertenece a Berta.
- **Lo que falta.** Sin referencia, no dibujar el pico: un tercer `lado` sin `before:`, o `--pico-x` vacío. Otra opción, de alcance más ancho, es buscar antes del calendario el gemelo visible `[data-cita-id]`: en este escenario existe en `lista-dia.tsx:93`.

**B3-5 · `components/ui/panel-anclado.tsx:101-104` y `components/ui/colocacion.ts:99-103`**. Las dos condiciones nuevas del último escalón no tienen prueba que las fije, y `visibleEnVentana` solo recorta por un lado.
- **`referencia.calendario &&`.** Si se quita, se centra cualquier panel que no quepa, no solo el que se coloca contra el calendario, y las 334 pruebas siguen en verde.
  - **Escenario:** un teléfono en horizontal (932 × 430), y el panel de un día con diez citas (unos 500 px), abierto desde un número a media altura. Hoy se coloca en el lado mayor y hace scroll por dentro (criterio 12).
  - Con el mutante, se despega del día y se centra, y ninguna prueba cae: `colocacion.test.ts` prueba `colocarPanel`, no el cableado.
- **`visibleEnVentana`.** Cambiarla por la identidad, o quitarle el `Math.max(0, …)`, deja todo en verde.
  - Para la caja de B2-3 es equivalente: los dos huecos negativos o a cero llevan igualmente a centrar.
  - Solo cambia algo cuando el calendario queda entero **por encima** de la ventana. Por ejemplo, tras el giro de B2-3, al bajar hasta «Documentación» con el panel abierto: el calendario acaba en −100 px. Sin el recorte, el panel va a `top` −92, cortado por arriba. Con él, va a 8.
  - Ese caso no tiene prueba.
  - El recorte no es simétrico. Con el calendario por debajo de la ventana, `top` se queda en `rect.top` (mayor que `alto`) y no se acota a `alto`, aunque el comentario dice «la parte de `rect` que se ve en una ventana». En `/agenda` hoy no se llega ahí, porque por encima del calendario solo están la cabecera y el título.
- **Lo que falta.** Una prueba de `PanelAnclado` con un ancla normal donde no quepa el panel, que exija que no se centre. Una prueba de `visibleEnVentana` en `colocacion.test.ts` con la caja por encima y por debajo de la ventana. Y el `top` acotado a `[0, alto]`.

**Sobre las severidades de B.** No discrepo de ninguna: son de foco y de colocación, sin datos de por medio.

## Notas (sin hallazgo)

- **No se cuenta otra vez lo que ya está en `state.md`:** la ficha del paciente como segunda puerta a las alertas (T-015), la RLS de `alertas_documentacion` para el técnico (T-015), SQL-H3 (bandeja sin límite y `.in('id', ids)`), SQL-H5, la RPC sin comprobación de estado, la bandeja del administrador que no incluye los pacientes donde solo es asignado, y lo del armazón. Tampoco lo aceptado en B2-1 (el foco sigue a la cita aunque el usuario lo moviera a otro control).
- **El comentario de `criterioDocumentacion`** (`bloques.ts:100-107`) describe ya el criterio real, y deja escrito por qué no se filtra por `origen_tabla`: `fn_alertar_nota_sin_firmar` escribe `citas`.
- **Fusión.** Sigue en pie lo de las rondas anteriores: la rama tiene `evidencia.json` comiteado, y en el repo principal hay otro sin seguimiento.
