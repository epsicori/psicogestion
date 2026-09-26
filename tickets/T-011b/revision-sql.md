Sin hallazgos ALTA. 0 ALTA · 2 MEDIA · 2 BAJA (revisión SQL / RLS / banco; la de TypeScript y alcance va aparte).

# T-011b · Revisión SQL, RLS y banco

Diff revisado: `git diff 9c74516..a22b032` (rama `worktree-agent-ab1a3b406d7170f06`), ficheros
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql`, `scripts/rls/16-series.sql` §M,
`scripts/rls/17-vinculo-agenda.sql` y `scripts/rls/README.md`. Contrastado con el contrato, `diseno.md` (§1, §3 y §5),
ADR-068 y ADR-069. No he leído la evidencia ni el informe del verificador.

Comprobado y sin hallazgo:
- Todas las funciones `security definer` llevan `set search_path = ''`.
- Los tres ayudantes internos (`calcular_propuesta_de_evento`, `citas_afectadas_por_regla`, `plan_edicion_serie`) solo
  los puede ejecutar `postgres`: medido en `information_schema.routine_privileges`, así que tampoco `service_role`.
- Las funciones públicas dan EXECUTE a `authenticated` y no a `anon` (M.12).
- Se revocan `insert` y `update` de `series_cita` a `authenticated`, y se comprueba de dos formas: el catálogo en M.10
  y el 42501 con su fragmento en M.10, M.15 y 17-vinculo §A.
- No hay UPDATE ni DELETE sobre tablas de solo adición: se actualizan `citas`, `series_cita` y `propuestas_cita`, y
  ninguna es de la regla 6.
- El orden de las guardas en `plan_edicion_serie` y `agenda_confirmar_propuesta` sigue §1.6.
- Toda negativa de §M usa `assert_lanza_codigo_msg` con el fragmento de §3 y tiene su gemela.

## MEDIA

### H1 · La guarda «la serie ya tiene otra regla» lee la serie sin candado, y una edición concurrente se la salta
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:744` (y `:753` para la zona del centro)

`agenda_confirmar_propuesta` bloquea la propuesta (`:694`) y la cita (`:723`). La regla vigente, en cambio, la lee con
un `select` sin `for share` (`:744`), mientras `agenda_editar_serie` toma la serie con `for no key update` (`:502`).
Un `select` simple no espera a ese candado y ve la versión confirmada anterior.

Escenario:
1. La serie S está a las 16:00. Hay una propuesta P1, de un evento anterior, que mueve la cita C.
2. T1 entra en `agenda_editar_serie(C0, 'esta_y_siguientes', p_hora_local => '17:00')`: bloquea S, la actualiza y
   el disparador crea P2 para C, calculada sobre la posición actual de C.
3. Antes de que T1 confirme, T2 entra en `agenda_confirmar_propuesta(P1)`. Lee S sin esperar y ve 16:00, que coincide
   con la carga de P1, así que pasa la guarda. La frescura también pasa, porque T1 no toca C. T2 mueve C y confirma.
4. T1 confirma.

Efecto: la serie dice 17:00 y C queda en la regla vieja, sin marcar como desviada. P2 falla después por frescura
(«La cita cambió»). Justo el caso que el ADR-068.1 promete rechazar («serie […] cambiadas después») entra en la base
sin aviso. El usuario solo lo descubre al confirmar P2, y tiene que replantear C a mano. Pasa lo mismo con
`zona_cambiada` y la zona de `centros` (`:753`).

El diseño §5 solo pedía candado sobre la propuesta, la cita y la serie dentro de editar, así que el hueco también está
en el diseño. Como un banco de una sola sesión no puede probarlo, pido una aserción de catálogo del tipo
`pg_get_functiondef('public.agenda_confirmar_propuesta(uuid)'::regprocedure) ~* 'series_cita[^;]*for (share|key share|no key update)'`.

### H2 · En mensual, el ordinal sale de la fecha del ancla: editar desde una cita recortada devuelve la deriva que el ADR-069 quitó
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:117-122`, junto con `:311-315` (`plan_edicion_serie`)

Con ancla, `fecha_en_regla_nueva` toma `v_ordinal := ord(p_fecha_destino)` (`:122`). Sin `p_fecha`, el destino es la
propia cita (`:312-315`). Si esa cita es un recorte (el 4.º jueves de un mes sin 5.º), el ordinal queda en 4 y toda la
serie baja al 4.º jueves.

Escenario, medido en la base de la rama:
1. Serie mensual de jueves creada el 29-04-2027 (el 5.º jueves). `ocurrencias_serie` da
   `{2027-04-29, 2027-05-27, 2027-06-24, 2027-07-29}`: mayo se recorta al último jueves, y julio vuelve al 5.º.
2. El usuario abre la cita del 27-05 y solo cambia la hora (`p_hora_local => '18:00'`).
3. `fecha_en_regla_nueva('mensual', '2027-07-29', 4, '2027-05-27', '2027-05-27')` da **2027-07-22**.

Efecto: la cita de julio se propone una semana antes. Crear y editar vuelven a dar fechas distintas para «la misma
regla», que es lo que el ADR-069.1 cierra («el ordinal es fijo […] aplica igual al crear y al editar»). La
previsualización lo anuncia («4.º jueves», `ultimo = false`), pero para quien solo quería cambiar la hora, la
propuesta de mover la fecha es una sorpresa.

La fórmula sigue al pie de la letra el ADR-068.3 y el diseño §1.1 («mismo ordinal que la cita de destino»), así que
decide el propietario. Una salida posible: cuando `p_fecha` es nula, o su día cae en la misma semana del mes que el
origen, conservar el ordinal de la serie (el de su primera cita) en vez de derivarlo del ancla. El banco no tiene
este caso: M.11 y M.13 editan siempre desde una cita no recortada o con `p_fecha` explícita.

## BAJA

### H3 · Con alcance `esta`, la guarda de `p_fecha` va antes de la autorización y revela si existe una cita ajena
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:479-482`

El `select` de `:474` es `security definer` y encuentra cualquier cita. En la rama `esta`, `p_fecha` se rechaza con
22023 antes de comprobar si la cita es del llamante (eso lo hace `agenda_actualizar_cita`, `:483`).

Escenario: PRO2 llama a `agenda_editar_serie(<uuid>, 'esta', p_fecha => current_date + 1)`.
- Si el uuid es una cita de PRO1, recibe 22023 «Con "esta" no se cambia la fecha…».
- Si el uuid no existe, recibe 42501 «La cita no existe o no es tuya».

Eso contradice el §5 del diseño («42501 primero»). El impacto es bajo porque los identificadores son UUID v4 y no se
pueden adivinar. Arreglo: mover el 42501 de `:487-496` antes de la bifurcación por alcance.

### H4 · La previsualización no valida la duración y promete una edición que la base rechaza
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:306` (`plan_edicion_serie`, que comparten las dos RPC)

`plan_edicion_serie` acepta cualquier `p_duracion_minutos`. El límite 5-480 solo está en `series_cita_duracion_ck`, y
la previsualización no escribe en esa tabla.

Escenario, medido con el banco hasta 16 y una sonda:
1. `agenda_previsualizar_edicion_serie(c, p_duracion_minutos => 1000)` devuelve `cambia = true` y una cita de
   07:00 a 23:40.
2. `agenda_editar_serie(c, 'esta_y_siguientes', p_duracion_minutos => 1000)` falla con 23514
   `series_cita_duracion_ck`.

Desde la interfaz no se llega, porque Zod (`lib/citas/esquemas.ts:127`) limita a 480. Por RPC directa, la
previsualización y la edición dejan de ser «una sola fuente» (criterio 16d). La zona sí está cubierta:
`resolver_hora_local` rechaza `Etc/GMT+1` en las dos. Arreglo: validar 5-480 en `plan_edicion_serie` con 22023.

## Los cuatro desvíos del diseño

- **M.13 empieza en el 2.º martes, no «desde el día 1»**: vale. El §3 del diseño se contradice («desde el día 1» y
  «serie del 2.º martes»), y la fijación comprueba que la 2.ª cita cae en mes5 (`16-series.sql:1810-1815`). Todas
  las afirmaciones de 16a son exactas: ordinal 5, último, recorte, las tres citas en orden, mes5 no recortada, mes5+1
  recortada en su 4.º jueves, y mes5+2 recortada si y solo si su mes no tiene 5.º. El comentario «dos meses seguidos
  nunca tienen cinco» es cierto para cualquier combinación de 28 a 31 días. Criterio 16 cerrado.
- **M.14b con PRO2 en CB por el festivo**: vale. Lo que se prueba (crear = `ocurrencias_serie` con el ordinal fijo)
  no depende del profesional. La aserción exige `propuestas = []` y las fechas exactas, así que un festivo en CB la
  pondría en rojo, no en verde. No choca con M.13d: aquello son propuestas de PRO1 en CA a las 07:15, y esto citas de
  PRO2 a las 21:00. Criterio 17 cerrado.
- **M.5 y M.6 con PRO2**: el §1.9 lo permite («si el vínculo lo permite»). Las dos confirman con el producto
  (`agenda_confirmar_propuesta`) y comprueban anomalía y desviación en la fila real.
- **M.7, M.9 y parte de M.8 montan el estado como `postgres`**: vale. Lo que se fabrica a mano es solo lo que el
  tiempo no deja producir dentro de una transacción: citas pasadas y en curso, una propuesta envejecida y una sin
  evento. En M.9 también se fabrican el centro propio, el usuario, el paciente, la serie y la cita desviada, que el
  §1.9 permite. Lo que se prueba siempre se ejerce por la función real (`agenda_editar_serie`,
  `agenda_confirmar_propuesta`, `agenda_actualizar_cita` para N1). En M.7c(iii), el UPDATE que pone N3 en curso
  también la desvía, y la prueba exige «ya ha empezado», de modo que discrimina el orden de las guardas. En M.8,
  envejecer e2c2 discrimina la guarda de pasado frente a la de frescura, porque darían mensajes distintos.
