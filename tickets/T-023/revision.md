**Hay 1 ALTA (A-H1).** T-023 · ronda 1 · revisión combinada (A: base, RLS y dinero · B: interfaz) · diff `main...fcc10e8`

Recuento combinado: **1 ALTA, 8 MEDIA, 6 BAJA**. Los ids llevan el prefijo del revisor y su número original.
Duplicados unidos en **A-H3** con la gravedad más alta (MEDIA): A-H3 + B-H5 (`.in(ids)` → 414) + B-H10 (`max_rows = 1000`).
Los textos de cada revisor siguen abajo sin cambios, salvo los ids.

| Id | Severidad | Dónde | Revisor |
|---|---|---|---|
| A-H1 | ALTA | `app/(app)/facturacion/datos.ts:197` | A |
| A-H2 | MEDIA | `app/(app)/facturacion/datos.ts:216` | A |
| A-H3 | MEDIA | `app/(app)/facturacion/datos.ts:118` | A+B |
| B-H1 | MEDIA | `app/(app)/facturacion/formulario-cobro.tsx:63` | B |
| B-H2 | MEDIA | `app/(app)/facturacion/formulario-cobro.tsx:156` | B |
| B-H3 | MEDIA | `app/(app)/facturacion/selector-profesional.tsx:28` | B |
| B-H4 | MEDIA | `app/(app)/facturacion/presentacion.ts:79` | B |
| B-H6 | MEDIA | `accesibilidad/facturacion.spec.ts:18` | B |
| B-H7 | MEDIA | `app/(app)/facturacion/bloques.tsx:119` | B |
| A-H4 | BAJA | `scripts/rls/30-cobros.sql:431` | A |
| A-H5 | BAJA | `supabase/migrations/20261013120000_cobros_y_pendiente.sql:128` | A |
| A-H6 | BAJA | `docs/state.md:1` | A |
| B-H8 | BAJA | `app/(app)/facturacion/bloques.tsx:69` | B |
| B-H9 | BAJA | `app/(app)/facturacion/datos.ts:220` | B |
| B-H11 | BAJA | `app/(app)/facturacion/formulario-cobro.tsx:70` | B |

---

# Revisor A (base, RLS y dinero)

Mediciones en `supabase_db_Psicogestion` (`max(version)` = 20261013120000), siempre en `begin … rollback`.
Los mutantes se aplicaron sobre una copia de `git archive fcc10e8`, nunca en la rama.

## ALTA

### A-H1 · `app/(app)/facturacion/datos.ts:197` — el selector de profesional del administrador sale vacío
`cargarOpcionesProfesional` lee los nombres de `perfiles`, pero la única política de lectura de
`perfiles` es `perfiles_lectura_propia` (`id = auth.uid()`). El directorio de compañeros es la vista
`directorio_perfiles`.
- **Escenario (medido)**: como ADM (`b0080001-…-0001`), `select count(*) from perfiles where id in
  (PRO Ana, PRO Bruno)` → **0**. La misma consulta sobre `directorio_perfiles` → 2. La vista sí
  devuelve sus `profesional_id`, así que `ids` no está vacío. La segunda lectura devuelve `[]` sin
  error, y el selector queda solo con «todos».
- **Efecto**: el CA manual «como administrador, el selector filtra y la métrica se mueve con él»
  (contrato, línea 155) no se puede cumplir. Además queda un control sin acción real detrás, que
  `CLAUDE.md` (Convenciones) prohíbe. El filtro solo funciona si alguien teclea `?profesional=<uuid>`
  a mano.
- **Verde por el motivo equivocado**: `datos.test.ts:214` simula `perfiles` con dos filas. Ninguna
  prueba lee `perfiles` bajo la RLS de un administrador.
- **Origen**: el diseño §1.4 (`diseno.md:344`) manda «sus nombres de `perfiles.nombre_completo`».
  El implementador lo siguió al pie de la letra. El arreglo es leer de `directorio_perfiles`, que
  tiene las columnas `id` y `nombre_completo`, y añadir una prueba que no simule esa tabla.

## MEDIA

### A-H2 · `app/(app)/facturacion/datos.ts:216` + `supabase/migrations/20261013120000_cobros_y_pendiente.sql:96` — tras una fusión, la deuda del absorbido no se puede saldar desde la pantalla
La vista agrega por `p.id` y no resuelve `fusionado_en`. Por su parte, la lista del formulario
filtra `fusionado_en is null`. La deuda queda pegada a un paciente al que la interfaz no deja cobrar.
- **Escenario (medido)**: A tiene una cita `realizada` de 60 €, y el ADM fusiona A en B. El TEC ve
  en la vista A = pendiente 6000, pero en el formulario solo puede elegir B. Si cobra 60 € a B, A
  sigue **pendiente 6000** y B pasa a **cobrado_de_mas 6000**. La métrica cuenta las dos cosas a la
  vez: 60 € pendientes y 60 € de más. La única salida es insertar el cobro a A por la API (la base lo
  acepta y A pasa a `cobrado`).
- **Relación con el punto 3 del encargo**: el bug de T-023 no es que la base acepte un cobro a un
  fusionado. Es que la pantalla no ofrece ninguna forma de saldar lo que el absorbido ya debía.
  Cerrar ahora el cobro al fusionado en la base, sin consolidar antes el pendiente en el
  superviviente (vista por `coalesce(fusionado_en, id)` o equivalente), quitaría también esa única
  salida. Como ADR-031 dice «nada se repunta», decide el propietario: o la vista consolida, o el
  formulario ofrece cobrar al absorbido mientras tenga pendiente. En cualquiera de los dos casos, el
  cierre en la base va después.

### A-H3 · `app/(app)/facturacion/datos.ts:118` — con más de ~215 pacientes con movimiento, el bloque del pendiente entero falla
Los nombres se leen con `.in('id', filas.map(…))`, sin trocear. Cada uuid añade unos 37 caracteres
a la URL de PostgREST.
- **Escenario (medido contra el gateway local, `:54321/rest/v1/pacientes?select=id,nombre,apellidos&id=in.(…)`)**:
  con 210 ids la URL pasa (401 sin clave). Con 220, **HTTP 414**. La vista incluye a todo paciente
  que haya tenido alguna vez una sesión, un bono o un cobro, también los que están al día. Una
  consulta con 220 pacientes históricos recibe `errorPacientes` y `cargarPendientes` devuelve
  `{ ok: false }`: el bloque se queda para siempre en `AvisoDeError`.
- **Secundario**: `supabase/config.toml` fija `max_rows = 1000`. La lectura de la vista sin `limit`
  ni orden (líneas 94-100 y 189) se trunca en silencio a partir de 1000 filas. En ese caso la
  métrica suma solo una parte y el selector puede perder profesionales.
  (Es el patrón de T-014: `.in(ids)` sin límite.)

## BAJA

### A-H4 · `scripts/rls/30-cobros.sql:431` — 30.E9/E9g no distinguen la zona del centro del paciente de la de la organización
`CA` nace sin `zona_horaria` (`01-fijacion.sql:51`) y hereda la de la organización (`Europe/Madrid`).
- **Escenario (medido)**: el mutante `public.zona_horaria_centro(null)` en lugar de
  `zona_horaria_centro(v_centro)` en `fn_validar_cobro` (`migración:50`) deja el **30 entero en
  verde**. Si alguien hace esa regresión, un paciente de Las Palmas a las 23:30 hora canaria (00:30
  en Madrid) podría registrar un cobro con fecha de mañana canaria. El diseño (`diseno.md:461`) dice
  que «30.E9 cubre la otra puerta», y no la cubre. Hace falta una fijación con un centro de
  `Atlantic/Canary` y una hora frontera. Si no, hay que anotar que E9 solo prueba la fecha y no la
  zona.

### A-H5 · `supabase/migrations/20261013120000_cobros_y_pendiente.sql:128` — el filtro «tiene alguna partida» no lo prueba ninguna aserción
- **Escenario (medido)**: si se quita `(s.sesiones > 0 or b.bonos > 0 or k.cobros > 0) and`, el 30
  sigue en verde. Con esa regresión, todos los pacientes visibles salen en el pendiente como
  «al día, 0,00 €». La lista se llena de ruido y la lista de ids de H3 crece hasta el total de
  pacientes. Falta una negativa «un paciente sin partidas no sale» con su gemela.

### A-H6 · `docs/state.md` (sin cambios en el diff) — los tres hallazgos fuera de alcance solo están en la bitácora
El diseño (riesgos 5 y 6, y §5 «Puertas laterales») manda anotar en `state.md` §Hallazgos la
transición realizada→cancelada, la deducción del precio y el cobro a un fusionado.
`docs/bitacora/T-023.md:55-60` los recoge, pero `state.md` no cambia, aunque está en el territorio.
- **Escenario**: el ticket se cierra sin que la línea llegue a `state.md`. El siguiente ticket que
  lea las 80 líneas no ve que el pendiente puede bajar sin rastro en la propia pantalla, y la guarda
  de transición propuesta no tiene ticket. Si el cierre de memoria lo hace el orquestador, esto es
  solo un recordatorio. Conviene que H2 viaje en la misma línea que el cobro al fusionado.

## Juicio de los tres puntos del encargo

1. **Una cita realizada que pasa a cancelada rebaja lo devengado → ticket aparte (guarda de
   transición en la agenda), no es un bug de T-023.** Lo medí: PRO1 pasa una realizada pasada a
   cancelada y lo devengado baja de 6000 a 0. El paciente que ya pagó queda como `cobrado_de_mas`
   6000. El TEC no puede hacerlo (UPDATE 0). Sí queda rastro: `auditoria` tiene las 2 filas de la
   cita (lo hace el disparador `auditar_citas`). La vista no lo enseña, pero no se pierde. La causa
   es que `citas` no tiene guarda de transición (R2.8 de T-021). La vista de T-023 hace bien en
   contar solo `realizada`. Tiene que llegar a `state.md` (H6).
2. **El técnico deduce el precio del devengado → nada en T-023 (riesgo aceptado).** El contrato
   pide «el mismo pendiente» para el técnico. La vista no da el recuento de sesiones, ni el tipo, ni
   fechas: no tiene ninguna de las columnas que §5 prohíbe (comprobado). Para deducir el precio, el
   técnico tiene que cruzar el devengado con la agenda, que ya ve por otro lado. Cerrarlo del todo
   obliga a no enseñarle lo devengado, y eso contradice el contrato. Se anota en `state.md` como
   riesgo aceptado, de la familia de R2-H1 de T-021.
3. **La base admite un cobro a un paciente fusionado → el bug de T-023 es H2, no la admisión.**
   Hoy, que la base lo admita es la única forma de saldar la deuda del absorbido. Bloquearlo en la
   base antes de consolidar el pendiente dejaría esa deuda sin ninguna salida. Primero se decide H2
   y después se cierra la puerta, en un ticket aparte.

## Revisado sin hallazgo
- El `where` de la vista es carácter a carácter el de `cobros_lectura` (`20261011120000…:1157`). El
  único cambio es el alias interior `p2`, que está documentado. El rol aparece en positivo en las
  tres ramas, y no hay ningún `is null` que se cuele por un `or`.
- `security_invoker=false, security_barrier=true`, sin CTE y sin `create or replace`. Tiene las ocho
  columnas, en céntimos `bigint` después de sumar `numeric`. Usa el día local de la cita, cuenta solo
  `realizada` sin bono, y elige la tarifa por `vigente_desde desc, orden desc` con respaldo a
  `tarifa_base`.
- Grants: solo `select` a `authenticated` en la vista. En `cobros`, solo `grant insert (motivo)`. El
  check está validado. `fn_validar_cobro` es invoker, con `search_path=''`, sin EXECUTE para PUBLIC,
  y su exención se limita a quien no es authenticated/anon. El fragmento «no puede ser posterior a
  hoy» no aparece en ninguna otra migración.
- La acción: `registrado_por = usuario.id`, sin `id` ni `registrado_en`. Calcula `hoy` con la zona
  del centro del paciente, leída bajo RLS y sin oráculo. Guarda `motivo` como `null` si el importe
  es positivo, y el importe pasa por aritmética entera.
- Las lecturas: `?profesional` solo se mira si el rol es administrador, y se valida con `z.uuid()`.
  Los importes se leen como `importe::text` y pasan por `importeDeBd`. Nada usa `use cache`.
- El 26 solo cambia en C4.

---

# Revisor B (interfaz)

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

### B-H1 · `app/(app)/facturacion/formulario-cobro.tsx:63`: la transición de envío no tiene try/catch
**Qué pasa:** si `registrarCobro` rechaza, el error escapa al boundary, y en `app/` no hay ningún `error.tsx`. El formulario se desmonta sin mensaje.
**Escenario:**
1. Se cae la red o un despliegue deja huérfana la acción mientras se pulsa «Registrar cobro».
2. Medido con un doble que rechaza con `TypeError('Failed to fetch')`: `act` relanza el error, el formulario desaparece (el botón ya no está en el DOM) y `cobros.noSePudoRegistrar` no se pinta.
3. Si el insert sí llegó y se perdió la respuesta, el usuario recarga y lo registra otra vez. Queda un cobro duplicado que, por la regla 6, no se puede borrar.

**Precedente:** `agenda/nueva/formulario-alta.tsx` ya envuelve la acción en `try/catch` con un mensaje genérico.

### B-H2 · `app/(app)/facturacion/formulario-cobro.tsx:156`: un error de campo del servidor no se anuncia
**Qué pasa:** `disabled={enviando}` en el submit tira el foco a `body`, y nadie lo devuelve.
**Escenario:**
1. El servidor devuelve un error de campo. Con la siembra: entre las 00:00 y la 01:00 de Madrid, un cobro a un paciente del centro de Atlantic/Canary con la fecha por defecto (el «hoy» de la organización) acaba en el 23514 de fecha que `acciones.ts` asigna a `fecha`. Vale igual para cualquier 23514 con campo.
2. `aplicarErroresDelServidor` llama a `setError` sin foco y `setMensaje('')` vacía la región viva.
3. El `<p>` del error de `Field` no tiene `role`.
4. Resultado: el foco está en `body`, la región viva está vacía y el lector de pantalla no oye nada.

**Precedente:** el patrón del proyecto es `aria-disabled` y foco al primer campo con error (H27 de T-028 B).
**Hueco de pruebas:** ninguna prueba cubre el foco tras un error del servidor.

### B-H3 · `app/(app)/facturacion/selector-profesional.tsx:28`: el selector dice «Todos» con el filtro activo
**Qué pasa:** con `valor={elegido ?? TODOS}` y un `elegido` que no está en `opciones`, el `Desplegable` pinta el marcador «Todos los profesionales» mientras el servidor sigue filtrando por ese profesional.
**Escenario:**
1. El administrador abre un `/facturacion?profesional=<PRO1>` guardado. PRO1 ya no tiene pacientes en la vista porque se reasignaron, o `cargarOpcionesProfesional` falló y devolvió `[]` (datos.ts:192/204).
2. La métrica dice 0,00 € y «No hay nada pendiente» bajo un combobox que dice «Todos los profesionales».
3. Medido: con `opciones=[PRO2]` y `elegido=PRO1`, el texto del combobox es «Todos los profesionales».

**Hueco de pruebas:** ninguna prueba cubre un `elegido` fuera de las opciones.

### B-H4 · `app/(app)/facturacion/presentacion.ts:79` (pintada en `bloques.tsx:120`): la píldora «Cobrado» no se lee
**Qué pasa:** el tono `success` de `Pildora` es `text-primary-foreground` sobre `bg-primary/10`. Medido sobre `--card`: 1,13:1, cuando WCAG 1.4.3 pide 4,5:1.
**Escenario:**
1. Un paciente al día aparece en la lista de pendientes.
2. Su único indicador de estado, el texto «Cobrado», es casi blanco sobre blanco.

**Contexto:**
- La primitiva está en `components/ui/piezas.tsx:91`, fuera de territorio. El arreglo es elegir otro tono o anotarlo en `state.md`.
- `lib/contraste/tokens.ts` no comprueba pares con alfa, así que no lo caza.

### B-H5 (unido a A-H3) · `app/(app)/facturacion/datos.ts:118` (y `:200`): `.in('id', ids)` sin límite
**Qué pasa:** con unos 220 ids o más, la URL de PostgREST supera el límite del gateway.
**Escenario:**
1. Medido contra el Kong local con `pacientes?id=in.(…)`: 215 uuid dan HTTP 401 (pasa el gateway) y 220 dan HTTP 414.
2. Una organización con 220 pacientes o más que tengan devengado o cobros (es acumulativo, de toda la historia) abre `/facturacion` sin filtro.
3. `cargarPendientes` devuelve `{ok:false}` → la métrica y la lista quedan en `AvisoDeError` de forma permanente.
4. Lo mismo en `cargarOpcionesProfesional` con ids de perfiles: haría falta tener 220 profesionales, así que es improbable.

**Precedente:** es el mismo patrón que T-014.

### B-H6 · `accesibilidad/facturacion.spec.ts:18`: el spec no hace lo que pide el diseño
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

### B-H7 · `app/(app)/facturacion/bloques.tsx:119` (subtítulo de `subtituloDe`, l.81): a 360 px se corta la cifra
**Qué pasa:** `FilaConAvatar` pinta el subtítulo con `truncate` (`piezas.tsx:71`), y la cifra es justo lo que se corta.
**Escenario:**
1. A 360 px, con el avatar y la píldora a la derecha, al subtítulo le quedan unos 118 px de `text-xs`: unos 20 caracteres.
2. «Cobrado de más: 10,00 €» (23) se queda en «Cobrado de más: 10,0…».
3. «Debe 40,00 € · ha pagado 20,00 €» oculta lo pagado.
4. El contrato pide que el excedente se vea.

**Medición:** es una estimación de anchura, no la he medido en un navegador. H6 hace que el spec tampoco la mida.

## BAJA

### B-H8 · `app/(app)/facturacion/bloques.tsx:69`: el `matiz` de la métrica no llega al contraste
**Qué pasa:** el `matiz` («N pacientes con pendiente») se pinta con `text-muted-foreground/70` (`piezas.tsx:43`). Medido: 2,92:1, cuando el mínimo es 4,5:1.
**Escenario:** el dato de cuántos pacientes deben, que solo está en esa línea, no es legible con baja visión.
**Contexto:** es el primer uso de `Metrica` en la app; la agenda usa sus propias `Metricas`.

### B-H9 · `app/(app)/facturacion/datos.ts:220`: un fallo de lectura de pacientes se pinta como «no hay pacientes»
**Escenario:**
1. Falla la lectura de `pacientes`: timeout o error de RLS.
2. `cargarPacientesParaCobro` devuelve `[]` y solo deja un `console.error`.
3. El diálogo se abre con el selector de paciente vacío y sin explicación. El usuario no puede registrar y no sabe por qué.

**Patrón:** error tragado como ausencia.

### B-H10 (unido a A-H3) · `app/(app)/facturacion/datos.ts:213`: la lista de pacientes del diálogo se corta en silencio en 1000
**Qué pasa:** la consulta no tiene rango ni búsqueda, y `supabase/config.toml:18` fija `max_rows = 1000`.
**Escenario:**
1. Una organización con más de 1000 pacientes no fusionados. Los pacientes no se borran, así que se acumulan con los años.
2. La lista se corta por apellidos.
3. Los pacientes de final del alfabeto no aparecen en «Paciente» y no se les puede registrar un cobro desde la pantalla.
4. No sale ningún aviso.

### B-H11 · `app/(app)/facturacion/formulario-cobro.tsx:70`: un fallo tras cerrar con Escape se pierde
**Qué pasa:** si se cierra el diálogo con Escape mientras se envía, la acción sigue en vuelo. `Dialogo` desmonta el formulario, y `setMensaje` cae sobre un componente desmontado.
**Escenario:**
1. El usuario pulsa «Registrar cobro» y, sin esperar, pulsa Escape.
2. Si la acción falla, el error no llega a nadie: el usuario cree que canceló o que se registró.
3. Si la acción tiene éxito, la única confirmación es el `role="status"` `sr-only` de `registrar-cobro.tsx:39`. Para un usuario vidente el cobro «aparece» en la lista sin que lo haya confirmado.
