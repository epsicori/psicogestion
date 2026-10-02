Sin hallazgos ALTA en la ronda 2 (0 ALTA, 0 MEDIA, 2 BAJA; los once de la ronda 1, cerrados). Ronda 1: 0 ALTA, 1 MEDIA, 10 BAJA.

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

## Ronda 2: las correcciones (un revisor)

Delta: `git diff 4c25267 c60f057 -- . ':!docs/state.md'`, sin el merge de `main` (7f900c5). En la práctica son los commits 7a1ad9a y c60f057: la migración, el banco 21, su README, la siembra y `docs/architecture.md`. Los mutantes se han medido leyendo, sin tocar la base.

Gate de la ronda 2: **sin ALTA** (0 ALTA, 0 MEDIA, 2 BAJA).

### Los once de la ronda 1, uno por uno

| Hallazgo | Cierre | El mutante muere, y por qué |
|---|---|---|
| R1-H1 | Migración :594-603. El plan se calcula sobre `v_todas`, así que D10 salta también las excluidas. Después se filtra con `with ordinality` y `jsonb_agg(... order by s.n)`. | **O2**. Festivo el lunes l294, ausencia de martes a domingo y la 2.ª sesión (l301) excluida. Con el plan sobre `v_fechas` (el código anterior), l301 deja de estar en `p_fechas` y está libre: la gemela de O2 lo prueba. La alternativa sería l301 y cae `fecha_prevista = l294 and inicio_propuesto is null`. Si se quita el filtro, también cae: G espera 7 citas y O2 espera 1. |
| R1-H2 | O1 | **O1**. Si se quita la línea 335, el único día libre de la semana es l287, la 2.ª sesión (la gemela lo prueba), y la alternativa deja de ser `null`. |
| R1-H3 | O3, con un disparador temporal que lanza 23P01 si `sala = 'R1-H3 carrera'` | El plan ve el hueco libre: lo demuestra la gemela, con dos propuestas `ocupada` y sin hora, es decir, sin alternativa calculada. Por eso el 23P01 solo puede salir del insert, y el fragmento `carrera simulada` lo distingue del `raise` de :610. Hay dos mutantes: envolver la 1.ª sesión estricta en `exception when exclusion_violation`, o quitar la rama `v_i = 0 and p_estricta_primera`. Con cualquiera de los dos, el 23P01 se captura, nace una propuesta y la serie se crea sin error, así que `assert_lanza_codigo_msg` cae. |
| R1-H4 | O4, con PRO2 `suspendido` en las cuatro puertas, y su gemela ya `activo` | Con `<> 'baja'`, las cuatro llamadas pasan. La gemela demuestra que, con PRO2 activo, `crear_cita` en CB funciona. El fragmento del mensaje es el de D. |
| R1-H5 | 21-A: `pg_get_functiondef(...) ~* 'for\s+share'` | El texto «for share» solo aparece en el cuerpo de la función. El comentario de la migración (:236) queda fuera del cuerpo, y el `comment on` no forma parte de `functiondef`. |
| R1-H6 | La ausencia se inserta antes, en otra sentencia | Muere si se quita el `order by` entero. **No muere** si se quita solo la prioridad del festivo: ver RD2-H1. |
| R1-H7 | Migración :587-589, más O5 (cero sesiones, un final anterior al primer lunes y la gemela «excluir la única») | Los fragmentos son disjuntos: «no tiene ninguna sesión» no contiene «sin sesiones», y al revés tampoco. l330 es martes y l335 domingo, así que la primera ocurrencia (l336) cae después del final. |
| R2-H1 | `docs/architecture.md`, en el párrafo de puertas | Recoge la decisión del propietario tal cual está en el diseño. No contradice la fila «Agenda» («sin tipo de terapia» = el campo). |
| R2-H2 | Siembra: las citas se insertan `programada` y un `update ... where estado = 'programada'` las pasa a realizadas | Ver abajo. |
| R2-H3 | Siembra: el primer martes entre hoy + 14 y hoy + 20 | `(2 - isodow + 7) % 7` va de 0 a 6. El martes tiene franjas de Ana desde `current_date - 7` sin fin, y cae dentro de los 56 días. |
| R2-H4 | 21-A con los dos ayudantes, para `authenticated` y `anon`, y el README | El README nombra las seis funciones. Si una recreación olvida el `revoke`, el `grant` por defecto a PUBLIC hace verdadera la condición y el banco cae. |

### Lo que el orquestador pidió mirar

**El filtro con `with ordinality` conserva el orden y los ordinales.**
- `jsonb_agg(s.e order by s.n)` ordena por la posición en el plan, que es la de `v_todas`, que a su vez es la de `ocurrencias_serie`.
- `ocurrencias_serie` no repite fechas, así que `= any (v_fechas)` no duplica ni pierde ninguna.
- El cast `(s.e ->> 'fecha')::date` lee el ISO que escribió `jsonb_build_object`, y no depende de `DateStyle`.
- Los índices de `v_plan` (0..n-1) son los de `v_fechas`. `v_plan -> 0` sigue siendo la primera sesión **no excluida**, igual que antes, así que la estricta no cambia de significado.
- Calcular el plan de las excluidas solo cuesta lecturas: `plan_alta_serie` es `stable` y no escribe.

**El disparador temporal de O3 no deja rastro.**
- Se crea y se borra (`drop trigger` y `drop function`) dentro del `begin … rollback` único de `test-rls.mjs`.
- Si una aserción cae entre el `create` y el `drop`, `ON_ERROR_STOP` aborta y el `rollback` se lo lleva igual.
- 21 es el último módulo: ningún banco de catálogo corre con la función `public.t028a_banco_carrera` viva.
- Mientras existe, solo afecta a filas con esa sala. Los inserts del resto del banco no llevan esa sala.

**El seed 8.bis es idempotente y no duplica alertas.**
- Los ids del insert (`k + 1`, con k de 0 a 5) son los mismos que los del update (k de 1 a 6).
- Al resembrar, el insert no hace nada (`on conflict (id)`), y el update no encuentra ninguna fila `programada`, así que no dispara `alertar_nota_sin_firmar`, que es `after update of estado`.
- Aunque disparara, `fn_alertar_nota_sin_firmar` hace `on conflict do nothing` contra el índice único parcial `alertas_documentacion_origen_abierta_idx` (`origen_tabla, origen_id, tipo` con estado `abierta`).
- `fn_proteger_cita_pasada` permite cambiar `estado` y `marcada_realizada_en/_por` en una cita pasada.
- Las seis citas tienen `fin < now()`, porque el último martes es estrictamente anterior a hoy. Por eso el disparador abre las seis alertas.

### BAJA

**RD2-H1.** `scripts/rls/21-alta-de-cita.sql:503-505`, prueba de la migración `:168`.
- **Qué pasa.** R1-H6 solo mata el mutante que quita el `order by` entero. Si se quita solo la prioridad del festivo y se deja `order by d.id`, el mutante sobrevive en la mitad de las ejecuciones: los ids de `disponibilidad` salen de `gen_random_uuid()`, y el banco no los fija.
- **Escenario.**
  - Mutante: `order by d.id` en lugar de `order by (d.tipo = 'festivo') desc, d.id`. Es un «simplificar a algo determinista» verosímil.
  - En las ejecuciones en que el uuid del festivo es menor que el de la ausencia (alrededor del 50 %), sale `festivo` y F sigue verde.
  - En producción, un día con festivo y ausencia da `bloqueo` y `motivo` de la propuesta `ausencia` o `festivo` según el azar del id.
- **Arreglo.** Ids fijos en los dos inserts, con el de la ausencia menor que el del festivo. Así la aserción mide la prioridad del tipo y no el desempate.

**RD2-H2.** `supabase/migrations/20261005120000_base_del_alta_de_cita.sql:443-451`.
- **Qué pasa.** R1-H7 se arregló en `agenda_crear_serie` y no en `agenda_previsualizar_alta`. Con cero ocurrencias, la previsualización devuelve un plan vacío sin error, y la creación con la misma entrada da 22023. Eso rompe, en ese borde, el «lo que se ve es lo que se crea» del criterio 6 y de la sección E.
- **Escenario.**
  - `agenda_previsualizar_alta(P, PRO, C, 'semanal', 1, '10:00', 50, <lunes futuro>, 0)` devuelve `{"zona_horaria": …, "sesiones": []}`, sin error.
  - `agenda_crear_serie` con los mismos datos y `p_sesiones_totales => 0` da 22023 «La serie no tiene ninguna sesión…».
  - Una pantalla de T-028 que previsualice al teclear enseñaría una serie vacía con «Crear» disponible, y al pulsar saldría el genérico «Los datos enviados no son válidos».
- **Si no se arregla.** Con el mismo `raise` en la previsualización basta. Si el propietario prefiere no tocar la base, queda como nota para T-028 corte B: el esquema Zod debe exigir sesiones ≥ 1.

### Las dos dudas del implementador: notas para T-028 corte B, no hallazgos

**`agenda_previsualizar_alta` sin `p_excluir`.** No es un hallazgo.
- Tras R1-H1, previsualizar y crear calculan el plan sobre la misma lista completa de ocurrencias: `ocurrencias_serie` con las mismas sesiones y sin final.
- `plan_alta_serie` solo depende de la fecha y de esa lista (D10). Por eso cada fila de la previsualización es idéntica a la que se materializa para esa fecha, excluidas incluidas, y la segunda mitad del escenario de R1-H1 («la previsualización dijo sin alternativa y la creación propuso otra cosa») ya no se da.
- Nota para corte B:
  - La pantalla oculta de la previsualización las filas excluidas, en lugar de pedírselo a la base.
  - Ojo: la previsualización tampoco acepta `p_fin_el`. Una serie «hasta el día X» no se puede previsualizar tal cual: o la pantalla la convierte a número de sesiones, o hace falta ampliar la firma (ticket de `supabase/`).

**22023 frente a 23514 con cero ocurrencias.** Tampoco es un hallazgo.
- Nadie traduce 23514: `mapearErrorCitas` (`lib/citas/errores.ts:12`) lo deja en `desconocido`, y 22023 lo lleva a `parametro_invalido`, que describe mejor el fallo.
- El check `series_cita_sesiones_ck` sigue siendo la última guarda de la tabla.
- El diseño no fija 23514 para este caso.
- Nota para corte B: si la pantalla quiere un texto propio, se añade el fragmento «no tiene ninguna sesión» a `FRAGMENTOS_DE_RECHAZO`. Si no, basta con que Zod impida llegar ahí: sesiones ≥ 1 y final ≥ inicio. Esto enlaza con RD2-H2.

### Comprobado sin hallazgo

- Territorio de la ronda: migración, `scripts/rls/`, siembra y `docs/`. No hay nada fuera.
- En O1 y O2 el mutante muere por la alternativa y no por otra comprobación anterior:
  - las gemelas demuestran que la fecha descartada está libre;
  - las anclas (l280 y siguientes) no las usa ninguna otra sección;
  - el plan no mira franjas.
- O4 restaura PRO2 a `activo`, y la gemela lo usa. El disparador de `perfiles` que salta con el cambio de estado (`impedir_baja_ultimo_administrador`) solo protege al último administrador y no toca las altas en centros de PRO2.
- La siembra del festivo sigue siendo idempotente (`insert … select … on conflict (id)`).
