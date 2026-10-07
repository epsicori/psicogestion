**Hay 1 ALTA (H1).** Revisor A (base, RLS y dinero) · T-023 ronda 1 · diff `main...fcc10e8`

Mediciones en `supabase_db_Psicogestion` (`max(version)` = 20261013120000), siempre en `begin … rollback`.
Los mutantes se aplicaron sobre una copia de `git archive fcc10e8`, nunca en la rama.

## ALTA

### H1 · `app/(app)/facturacion/datos.ts:197` — el selector de profesional del administrador sale vacío
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

### H2 · `app/(app)/facturacion/datos.ts:216` + `supabase/migrations/20261013120000_cobros_y_pendiente.sql:96` — tras una fusión, la deuda del absorbido no se puede saldar desde la pantalla
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

### H3 · `app/(app)/facturacion/datos.ts:118` — con más de ~215 pacientes con movimiento, el bloque del pendiente entero falla
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

### H4 · `scripts/rls/30-cobros.sql:431` — 30.E9/E9g no distinguen la zona del centro del paciente de la de la organización
`CA` nace sin `zona_horaria` (`01-fijacion.sql:51`) y hereda la de la organización (`Europe/Madrid`).
- **Escenario (medido)**: el mutante `public.zona_horaria_centro(null)` en lugar de
  `zona_horaria_centro(v_centro)` en `fn_validar_cobro` (`migración:50`) deja el **30 entero en
  verde**. Si alguien hace esa regresión, un paciente de Las Palmas a las 23:30 hora canaria (00:30
  en Madrid) podría registrar un cobro con fecha de mañana canaria. El diseño (`diseno.md:461`) dice
  que «30.E9 cubre la otra puerta», y no la cubre. Hace falta una fijación con un centro de
  `Atlantic/Canary` y una hora frontera. Si no, hay que anotar que E9 solo prueba la fecha y no la
  zona.

### H5 · `supabase/migrations/20261013120000_cobros_y_pendiente.sql:128` — el filtro «tiene alguna partida» no lo prueba ninguna aserción
- **Escenario (medido)**: si se quita `(s.sesiones > 0 or b.bonos > 0 or k.cobros > 0) and`, el 30
  sigue en verde. Con esa regresión, todos los pacientes visibles salen en el pendiente como
  «al día, 0,00 €». La lista se llena de ruido y la lista de ids de H3 crece hasta el total de
  pacientes. Falta una negativa «un paciente sin partidas no sale» con su gemela.

### H6 · `docs/state.md` (sin cambios en el diff) — los tres hallazgos fuera de alcance solo están en la bitácora
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
