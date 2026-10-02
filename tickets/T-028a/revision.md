Sin hallazgos ALTA (total de los dos revisores: 0 ALTA, 1 MEDIA, 10 BAJA).

# Revisión de T-028a: base del alta de cita

Rama `worktree-agent-a239aecd75381c8f5` (HEAD 4c25267). Diff: `git diff main...worktree-agent-a239aecd75381c8f5`.

## Revisor 1: migración y bancos 21, 15 §J y 17 §C

Los mutantes se han medido leyendo, sin ejecutar nada en la base.

### Comprobado sin hallazgo

**Permisos**
- Las cuatro funciones públicas son `security definer` con `search_path=''`.
- Tienen `revoke` de `public` y `anon`, y `grant` a `authenticated`.
- Los cinco ayudantes y `plan_alta_serie` son invoker y llevan `revoke` de `public, anon, authenticated`.

**Firma de `agenda_crear_serie`**
- El `drop function` quita la firma de 11 argumentos.
- La firma nueva de 15 argumentos lleva sus `comment`, `revoke` y `grant`.
- 21-A comprueba que existe una sola versión.

**Orden de guardas**
- En las cuatro funciones, A1-A4 van antes que la decisión D y antes de cualquier cotejo de tipo, fecha o disponibilidad.
- Un técnico que pasa su propio uid para saltarse el centro lo frena D (22023), y 21-J lo prueba.

**Predicados y bucle**
- `alta_hueco_ocupado` es el predicado exacto de `citas_sin_solape_profesional`: mismos estados, `rango_bloqueante` y descanso con la expresión del disparador.
- El bucle de `agenda_bloques_profesional` termina siempre: el salto va a un `upper` mayor que el cursor, porque hay solape.

**Concurrencia del «siguiente libre»**
- Los bloques y el plan son de solo lectura.
- La carrera la resuelve la restricción de exclusión:
  - en `agenda_crear_cita`, sin bloque `exception` (23P01);
  - en la serie, sesión a sesión, como propuesta `ocupada`.
- El tipo se bloquea con `for share` en `alta_resolver_tipo`; volátil es correcto, porque lo exige `for share`.

**Decisiones del implementador fuera del diseño**
- Los ayudantes `alta_exigir_profesional` y `alta_resolver_tipo` son la decisión D6 aplicada a D y a T0-T2. Es razonable y quita copias.
- Que las excluidas consuman ordinal es §1 paso 7 del diseño.
- Las anclas en el año + 3 son coherentes con el comentario: las series del banco 16 llegan al año + 2.

**Bancos**
- 15 §J (H23):
  - exige `row_count = 0` sin excepción, más la huella md5 de todas las citas;
  - con la rama del técnico restaurada, el UPDATE de la nota cambia filas y el banco cae.
- 17 §C: pasa el técnico a `agenda_crear_cita` con TT4, sin nota. El paso es correcto.
- 21-L (H16) comprueba el fragmento `row-level security`.
- 21-M y 21-N tienen gemelas de rol.
- A4 cubre `''`.

**Una carrera que no se cuenta como hallazgo.** Hay una carrera en el estado del profesional: `alta_exigir_profesional` lee `perfiles` sin `for share`. No es hallazgo porque `dar_de_baja_perfil` no cancela citas futuras, así que «un perfil de baja con citas futuras» ya es un estado normal del sistema.

### BAJA

**R1-H1.** `supabase/migrations/20261005120000_base_del_alta_de_cita.sql:588` (y `:334`)
- **Qué pasa.** La alternativa de una sesión bloqueada puede ser una fecha que el usuario excluyó. El plan recibe `v_fechas` ya sin las excluidas, y D10 (`continue when v_fecha2 = any (p_fechas)`) solo salta las fechas que siguen en la serie.
- **Escenario.**
  - Serie semanal de lunes, 8 sesiones, con `p_excluir = array[lunes de la 3.ª]` (vacaciones del paciente).
  - PRO1 tiene una ausencia de martes a domingo en la semana de la 2.ª sesión, y festivo el lunes de la 2.ª.
  - La propuesta de la 2.ª sesión trae como `fecha_prevista` el lunes que el usuario acaba de excluir.
  - Además, `agenda_previsualizar_alta` no tiene `p_excluir`, así que la previsualización mostró «sin alternativa» y la creación propone otra cosa.

**R1-H2.** `scripts/rls/21-alta-de-cita.sql:424-482` (secciones E, F y G)
- **Qué pasa.** D10 no tiene prueba que muerda. Todas las alternativas que mira el banco caen en d = 1 o son `null`, y ninguna tendría que saltar otra sesión de la serie.
- **Escenario.**
  - Mutante: se borra la línea 334 de la migración (`continue when v_fecha2 = any (p_fechas)`).
  - El banco 21 sigue verde.
  - En producción, una ausencia de lunes a domingo exacta hace que la propuesta de la sesión N proponga el hueco de la sesión N+1, que es justo el caso que motivó D10 en el diseño.

**R1-H3.** `supabase/migrations/20261005120000_base_del_alta_de_cita.sql:635` y `scripts/rls/21-alta-de-cita.sql:540`
- **Qué pasa.** M9 sobrevive en 21-H, aunque el diseño (§5, tabla de mutantes) dice que 21-H lo caza. El 23P01 que mide 21-H sale del `raise` explícito de la línea 595 (el plan ya ve la cita ocupada), no del insert sin `exception` de la línea 635.
- **Escenario.**
  - Mutante: se envuelve el insert de la 1.ª sesión estricta en `begin … exception when exclusion_violation`, igual que el resto de sesiones.
  - 21-H sigue verde, porque el mensaje «La primera sesión choca» es el del `raise` previo.
  - En producción, una carrera entre el plan y el insert convierte la 1.ª sesión estricta en una propuesta `ocupada`, en vez de deshacer la serie, y se incumple el criterio 9.
  - Lo que se puede arreglar sin concurrencia en el banco: corregir la tabla de mutantes del diseño, o dejarlo anotado como «solo por lectura».

**R1-H4.** `supabase/migrations/20261005120000_base_del_alta_de_cita.sql:221` y `scripts/rls/21-alta-de-cita.sql:292, 417, 692, 707`
- **Qué pasa.** La decisión D solo se prueba con `baja`, y `estado_perfil` tiene tres valores.
- **Escenario.**
  - Mutante: `p.estado <> 'baja'` en lugar de `p.estado = 'activo'`.
  - El banco 21 sigue verde: no hay ningún caso `suspendido`.
  - Con el mutante, un técnico da citas y series a un profesional suspendido.

**R1-H5.** `scripts/rls/21-alta-de-cita.sql:166-177` (prueba de la migración `:239-279`)
- **Qué pasa.** Nada en el banco guarda el `for share` de `alta_resolver_tipo` (D5). Los `revoke` que faltan en el catálogo de los dos ayudantes nuevos son R2-H4, y no se cuentan dos veces.
- **Escenario.**
  - Mutante: se quita el `for share`, y la función puede volver a ser `stable`.
  - El banco 21 sigue verde: ninguna aserción mira el cuerpo, y la concurrencia no se puede probar en una sola transacción.
  - En producción, un administrador da de baja el tipo entre T2 y el insert, y la cita nace con un tipo inactivo.
- **Arreglo.** Basta una aserción de catálogo, `pg_get_functiondef('public.alta_resolver_tipo(uuid,smallint)'::regprocedure) ~* 'for share'`, como la de 19 para su disparador.

**R1-H6.** `scripts/rls/21-alta-de-cita.sql:469-480` (prueba de `:168`)
- **Qué pasa.** «Gana el festivo (determinista)» no muerde. El festivo se inserta antes que la ausencia en el mismo `values`, así que un recorrido secuencial o por índice de `perfil_id` lo devuelve primero aunque no haya `order by`.
- **Escenario.**
  - Mutante: se quita `order by (d.tipo = 'festivo') desc, d.id`.
  - El bloqueo sigue saliendo `festivo` por orden físico, y el banco sigue verde.
  - Para que muerda, hay que insertar primero la ausencia (o en otra sentencia anterior).

**R1-H7.** `supabase/migrations/20261005120000_base_del_alta_de_cita.sql:584-586`
- **Qué pasa.** Con cero ocurrencias y sin excluir nada, el error dice «Excluir todas las fechas deja la serie sin sesiones». Antes de la rama era un 23514 del check `sesiones_totales > 0`, porque el insert de `series_cita` iba primero; ahora `ocurrencias_serie` y el plan corren antes.
- **Escenario.**
  - `agenda_crear_serie(..., p_sesiones_totales => 0, p_excluir => null)`, o un `p_fin_el` anterior a la primera fecha.
  - Resultado: 22023 «Excluir todas las fechas…».
  - El usuario no excluyó nada, y quien traduzca 23514 a «número de sesiones inválido» ya no lo recibe.

## Revisor 2 (fuera de la migración: siembra, tipos, llamantes, documentación, territorio)

Gate del revisor 2: **sin ALTA** (0 ALTA, 1 MEDIA, 3 BAJA).

### MEDIA

- **R2-H1** · `docs/architecture.md:189` — El párrafo de puertas da por cerradas todas salvo H25, pero D1 (migración :267) hace que fin − inicio sea función exacta del tipo, y el técnico lee el catálogo con duracion_minutos (tipos_terapia_lectura) y el inicio/fin de toda cita (citas_agenda): la duración es un canal lateral del tipo que ni la doc ni el ADR-074.2 recogen.
  - *Escenario*: db reset + seed; Ana da a Sofía una cita con «Sesión de pareja» por agenda_crear_cita → la base la fuerza a 90 min. Teresa (técnico, Madrid) ve en su agenda 10:00–11:30 y en el catálogo el único tipo activo de 90 es «Sesión de pareja»: conoce el tipo de una cita que no dio, contra «sigue sin ver el tipo de ninguna cita». Con las seis citas sembradas de Lucía (50 min) deduce «Sesión individual» igual. Decide el propietario: aceptarlo y anotarlo como puerta abierta junto a H25, o no.

### BAJA

- **R2-H2** · `supabase/seed-completo.sql:526` — Las seis citas de Lucía se insertan ya en estado realizada, así que no dispara alertar_nota_sin_firmar (after update of estado) ni se rellena marcada_realizada_en/_por: la siembra deja un estado que la aplicación no puede producir (realizada, pasada, sin nota y sin alerta).
  - *Escenario*: db reset + npm run seed; Ana abre su agenda en la semana del último martes → la cita de Lucía de las 12:00 sale realizada SIN el aviso de nota pendiente (nota_pendiente = false, porque no hay fila nota_sin_firmar), y el panel de documentos de Lucía no enseña ninguna «Nota sin firmar» aunque ninguna de las seis sesiones tiene nota. Insertar como programada y luego update a realizada (con fin < now()) abre las seis alertas como lo haría la app.
- **R2-H3** · `supabase/seed-completo.sql:521` — El festivo es current_date + 14, es decir, el mismo día de la semana en que se siembra; sembrando en sábado o domingo cae en un día sin franjas y no se ve en ningún sitio (criterio 19.b pasa por recuento, pero la siembra no enseña lo que el guion necesita).
  - *Escenario*: npm run seed un sábado → festivo el sábado +14. agenda_bloques_profesional de Ana esa semana da lo mismo con y sin festivo (no hay franja el sábado) y ninguna previsualización de lunes a viernes da bloqueo = festivo. Además solo coincide con la serie de los martes de Lucía si se sembró en martes. Anclarlo a un día laborable fijo (p. ej. el martes de dentro de dos o tres semanas) lo hace visible siempre.
- **R2-H4** · `scripts/rls/README.md:47` — La fila del banco 21 dice «firmas y permisos ... de los cuatro ayudantes internos (A)», pero la migración crea seis funciones internas: 21-A comprueba plan_alta_serie, alta_descanso, alta_bloqueo_disponibilidad y alta_hueco_ocupado, y no alta_exigir_profesional ni alta_resolver_tipo (revocadas hoy en :234 y :279, sin prueba que lo guarde).
  - *Escenario*: T-039 (que ya prevé drop + create en estas funciones) recrea alta_resolver_tipo y olvida el revoke → por el privilegio por defecto de PUBLIC/Supabase, anon y authenticated la pueden ejecutar por PostgREST y 21-A sigue en verde, mientras el README asegura que los ayudantes internos están cubiertos.

### Comprobado sin hallazgo

- **Firma de 15 argumentos y sus llamantes.** `lib/citas/series.ts:18` llama a `agenda_crear_serie` por nombre con los 11 de antes; los cuatro nuevos tienen default, así que compila y no hacía falta tocarlo (el diff no lo toca, conforme a §6 del diseño). Ningún otro llamante en `app/`, `lib/` ni `components/` (grep de `agenda_crear_serie`, `agenda_crear_cita`, `agenda_previsualizar_alta`, `agenda_bloques_profesional`). `crearSerie` no tiene llamante en `app/`; con D1, un tipo con duración distinta da ahora 22023, a tener en cuenta en T-028 (`lib/citas/alta.ts`).
- **La puerta que pierde el técnico.** Ningún código hace `insert`/`update` sobre `citas` ni lee `series_cita` (solo `select` de `citas` en `lib/notas/servidor.ts`, `lib/citas/agenda.ts:153`, `app/(app)/pacientes/[id]/datos.ts:139`, bajo `citas_lectura`, que no cambia). Las funciones que el técnico usa y leen `series_cita` (`agenda_previsualizar_edicion_serie`, `agenda_editar_serie`, `agenda_confirmar_propuesta`, `agenda_actualizar_cita`) son `security definer`; las dos invoker que la leen (`plan_edicion_serie`, `calcular_propuesta_de_evento`) son internas. Ninguna otra política ni vista consulta `series_cita`.
- **`lib/supabase/tipos-bd.ts`**: las entradas nuevas casan con las firmas de la migración (opcionales justo los parámetros con default; `agenda_crear_serie` sustituida, no duplicada; orden alfabético y forma de una línea del generador). Las funciones internas aparecen porque el generador no filtra por `grant`, igual que `plan_edicion_serie`. No se aprecia edición a mano (no se regeneró: la base es del verificador).
- **Siembra, criterio 19**: 20 franjas (Ana y Bruno, ambos en Madrid según `seed.sql`), festivo futuro, seis martes pasados a las 12:00 Madrid (el martes se calcula en la fecha UTC, que nunca va por delante de la de Madrid, así que siempre son pasados), Diego sin citas, 3 tipos activos con 3 duraciones y 1 inactivo, nombres de servicio y sin choque con el índice único `lower(trim(nombre))` ni con los nombres de los bancos. Es idempotente: `on conflict (id)` hace la comprobación del árbitro antes que la exclusión gist.
- **Territorio**: `node ~/.claude/pipeline/territorio.mjs T-028a` → 10 ficheros, todos dentro (`docs/state.md` y `docs/bitacora/**` son rutas comunes). 15 solo toca §J, 17 solo §C y su constante, y 16 y 11 no se tocan (criterio 18).
- **`docs/architecture.md`**: la fila «Agenda» y el párrafo cumplen el criterio 20 y no contradicen el resto de la matriz, salvo lo que dice R2-H1.
