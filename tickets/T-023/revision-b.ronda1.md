Sin hallazgos ALTA. Revisor B (interfaz), ronda 1: 7 MEDIA y 4 BAJA.

# T-023 · Revisión B (interfaz) · ronda 1

- **Diff revisado:** `main...fcc10e8`. Lo he medido sobre una copia hecha con `git archive fcc10e8`, con una junction al `node_modules` de main.
- **Sondas:**
  - Las pruebas vitest de las sondas eran temporales y las borré al acabar.
  - El límite de URL se midió con `curl` contra el Kong local. Solo hice lecturas anónimas y la base no se mutó.
- **Qué está bien** (comprobado):
  - El selector no existe en el DOM para el profesional ni para el técnico.
  - `?profesional=` solo se lee si el rol es administrador, y se valida con `z.uuid()`.
  - No hay controles de editar ni de borrar cobros.
  - No sale el vocabulario prohibido por el ADR-078.
  - No hay `use cache`.
  - El importe se lee como `::text`.
  - El técnico no recibe ningún dato clínico: la vista no lleva el tipo de terapia ni la cita.
  - `modulos.ts` y su prueba están correctos.

## MEDIA

### H1 · `app/(app)/facturacion/formulario-cobro.tsx:63`: la transición de envío no tiene try/catch
**Qué pasa:** si `registrarCobro` rechaza, el error escapa al boundary, y en `app/` no hay ningún `error.tsx`. El formulario se desmonta sin mensaje.
**Escenario:**
1. Se cae la red o un despliegue deja huérfana la acción mientras se pulsa «Registrar cobro».
2. Medido con un doble que rechaza con `TypeError('Failed to fetch')`: `act` relanza el error, el formulario desaparece (el botón ya no está en el DOM) y `cobros.noSePudoRegistrar` no se pinta.
3. Si el insert sí llegó y se perdió la respuesta, el usuario recarga y lo registra otra vez. Queda un cobro duplicado que, por la regla 6, no se puede borrar.

**Precedente:** `agenda/nueva/formulario-alta.tsx` ya envuelve la acción en `try/catch` con un mensaje genérico.

### H2 · `app/(app)/facturacion/formulario-cobro.tsx:156`: un error de campo del servidor no se anuncia
**Qué pasa:** `disabled={enviando}` en el submit tira el foco a `body`, y nadie lo devuelve.
**Escenario:**
1. El servidor devuelve un error de campo. Con la siembra: entre las 00:00 y la 01:00 de Madrid, un cobro a un paciente del centro de Atlantic/Canary con la fecha por defecto (el «hoy» de la organización) acaba en el 23514 de fecha que `acciones.ts` asigna a `fecha`. Vale igual para cualquier 23514 con campo.
2. `aplicarErroresDelServidor` llama a `setError` sin foco y `setMensaje('')` vacía la región viva.
3. El `<p>` del error de `Field` no tiene `role`.
4. Resultado: el foco está en `body`, la región viva está vacía y el lector de pantalla no oye nada.

**Precedente:** el patrón del proyecto es `aria-disabled` y foco al primer campo con error (H27 de T-028 B).
**Hueco de pruebas:** ninguna prueba cubre el foco tras un error del servidor.

### H3 · `app/(app)/facturacion/selector-profesional.tsx:28`: el selector dice «Todos» con el filtro activo
**Qué pasa:** con `valor={elegido ?? TODOS}` y un `elegido` que no está en `opciones`, el `Desplegable` pinta el marcador «Todos los profesionales» mientras el servidor sigue filtrando por ese profesional.
**Escenario:**
1. El administrador abre un `/facturacion?profesional=<PRO1>` guardado. PRO1 ya no tiene pacientes en la vista porque se reasignaron, o `cargarOpcionesProfesional` falló y devolvió `[]` (datos.ts:192/204).
2. La métrica dice 0,00 € y «No hay nada pendiente» bajo un combobox que dice «Todos los profesionales».
3. Medido: con `opciones=[PRO2]` y `elegido=PRO1`, el texto del combobox es «Todos los profesionales».

**Hueco de pruebas:** ninguna prueba cubre un `elegido` fuera de las opciones.

### H4 · `app/(app)/facturacion/presentacion.ts:79` (pintada en `bloques.tsx:120`): la píldora «Cobrado» no se lee
**Qué pasa:** el tono `success` de `Pildora` es `text-primary-foreground` sobre `bg-primary/10`. Medido sobre `--card`: 1,13:1, cuando WCAG 1.4.3 pide 4,5:1.
**Escenario:**
1. Un paciente al día aparece en la lista de pendientes.
2. Su único indicador de estado, el texto «Cobrado», es casi blanco sobre blanco.

**Contexto:**
- La primitiva está en `components/ui/piezas.tsx:91`, fuera de territorio. El arreglo es elegir otro tono o anotarlo en `state.md`.
- `lib/contraste/tokens.ts` no comprueba pares con alfa, así que no lo caza.

### H5 · `app/(app)/facturacion/datos.ts:118` (y `:200`): `.in('id', ids)` sin límite
**Qué pasa:** con unos 220 ids o más, la URL de PostgREST supera el límite del gateway.
**Escenario:**
1. Medido contra el Kong local con `pacientes?id=in.(…)`: 215 uuid dan HTTP 401 (pasa el gateway) y 220 dan HTTP 414.
2. Una organización con 220 pacientes o más que tengan devengado o cobros (es acumulativo, de toda la historia) abre `/facturacion` sin filtro.
3. `cargarPendientes` devuelve `{ok:false}` → la métrica y la lista quedan en `AvisoDeError` de forma permanente.
4. Lo mismo en `cargarOpcionesProfesional` con ids de perfiles: haría falta tener 220 profesionales, así que es improbable.

**Precedente:** es el mismo patrón que T-014.

### H6 · `accesibilidad/facturacion.spec.ts:18`: el spec no hace lo que pide el diseño
**Qué pide el diseño** (`diseno.md` §1.4 l.358-360 y la tabla de l.459):
- Entrar como administrador.
- Pasar «sin violaciones del verificador de T-009».
- A 360 px, abrir el diálogo, rellenarlo y enviarlo («un envío completo»).

**Qué hace el spec:**
- Entra como `ana@psicogestion.test` (profesional).
- No rellena ni envía el formulario (l.38-57).
- No comprueba el contraste.
- Según la bitácora, no se ha ejecutado.

**Escenario:**
1. Hay que reescribir el selector del administrador a 360 px, o el desbordamiento del diálogo con los mensajes de error y el campo de motivo visibles.
2. El spec sigue verde, porque no ve ni al administrador ni el formulario enviado.
3. El criterio «a 360 px se registra un cobro» queda sin evidencia.

**Dónde consta el desvío:** solo en el comentario de cabecera y en la bitácora. Lo de «lo económico no se borra» se resuelve con un rollback o una base desechable, no quitando el envío.

### H7 · `app/(app)/facturacion/bloques.tsx:119` (subtítulo de `subtituloDe`, l.81): a 360 px se corta la cifra
**Qué pasa:** `FilaConAvatar` pinta el subtítulo con `truncate` (`piezas.tsx:71`), y la cifra es justo lo que se corta.
**Escenario:**
1. A 360 px, con el avatar y la píldora a la derecha, al subtítulo le quedan unos 118 px de `text-xs`: unos 20 caracteres.
2. «Cobrado de más: 10,00 €» (23) se queda en «Cobrado de más: 10,0…».
3. «Debe 40,00 € · ha pagado 20,00 €» oculta lo pagado.
4. El contrato pide que el excedente se vea.

**Medición:** es una estimación de anchura, no la he medido en un navegador. H6 hace que el spec tampoco la mida.

## BAJA

### H8 · `app/(app)/facturacion/bloques.tsx:69`: el `matiz` de la métrica no llega al contraste
**Qué pasa:** el `matiz` («N pacientes con pendiente») se pinta con `text-muted-foreground/70` (`piezas.tsx:43`). Medido: 2,92:1, cuando el mínimo es 4,5:1.
**Escenario:** el dato de cuántos pacientes deben, que solo está en esa línea, no es legible con baja visión.
**Contexto:** es el primer uso de `Metrica` en la app; la agenda usa sus propias `Metricas`.

### H9 · `app/(app)/facturacion/datos.ts:220`: un fallo de lectura de pacientes se pinta como «no hay pacientes»
**Escenario:**
1. Falla la lectura de `pacientes`: timeout o error de RLS.
2. `cargarPacientesParaCobro` devuelve `[]` y solo deja un `console.error`.
3. El diálogo se abre con el selector de paciente vacío y sin explicación. El usuario no puede registrar y no sabe por qué.

**Patrón:** error tragado como ausencia.

### H10 · `app/(app)/facturacion/datos.ts:213`: la lista de pacientes del diálogo se corta en silencio en 1000
**Qué pasa:** la consulta no tiene rango ni búsqueda, y `supabase/config.toml:18` fija `max_rows = 1000`.
**Escenario:**
1. Una organización con más de 1000 pacientes no fusionados. Los pacientes no se borran, así que se acumulan con los años.
2. La lista se corta por apellidos.
3. Los pacientes de final del alfabeto no aparecen en «Paciente» y no se les puede registrar un cobro desde la pantalla.
4. No sale ningún aviso.

### H11 · `app/(app)/facturacion/formulario-cobro.tsx:70`: un fallo tras cerrar con Escape se pierde
**Qué pasa:** si se cierra el diálogo con Escape mientras se envía, la acción sigue en vuelo. `Dialogo` desmonta el formulario, y `setMensaje` cae sobre un componente desmontado.
**Escenario:**
1. El usuario pulsa «Registrar cobro» y, sin esperar, pulsa Escape.
2. Si la acción falla, el error no llega a nadie: el usuario cree que canceló o que se registró.
3. Si la acción tiene éxito, la única confirmación es el `role="status"` `sr-only` de `registrar-cobro.tsx:39`. Para un usuario vidente el cobro «aparece» en la lista sin que lo haya confirmado.
