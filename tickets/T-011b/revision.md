Sin hallazgos ALTA. 0 ALTA · 2 MEDIA · 2 BAJA (revisión de la ronda de arreglos, diff `9c74516..f673e5e`).

# T-011b · Revisión (tercera pasada, sobre `f673e5e`)

- Rama: `worktree-agent-ab1a3b406d7170f06`, worktree `.claude/worktrees/t011b-banco`, HEAD `f673e5e`.
- Leído: contrato `tickets/T-011b-editar-serie-desde-la-cita.md`, `diseno.md` §1 y §5, las revisiones previas
  `revision-sql.md` y `revision-ts.md`, y el diff entero. No he leído la evidencia ni el informe del verificador.
- No he tocado la base de datos. `npx vitest run lib/citas` en el worktree pasa 31 de 31, y `npm run lint:migraciones`
  sale limpio (16 migraciones).

## Las correcciones de la ronda anterior

| Hallazgo | Arreglo | ¿Hay prueba que falle sin él? |
|---|---|---|
| SQL-H1: serie y centro leídos sin candado al confirmar | `for share` en `:811` y `:821` | Sí. Son dos aserciones de catálogo en M.12 (`16-series.sql:1856-1868`) con el texto exacto de cada lectura, así que quitar el `for share` las pone en rojo. La carrera en sí no se puede probar en un banco de una sola sesión. |
| SQL-H2: ordinal sacado del ancla recortada | `plan_edicion_serie` `:337-368`, `p_ordinal` en `fecha_en_regla_nueva`, `ordinal` en la carga (`:467`) | Sí. M.14(e) (`16-series.sql:2117-2257`): sin la rama de desambiguación, m5b cae en el 4.º jueves y la aserción lo detecta. Solo se prueba el lado «es un 5.º» (ver H2). |
| SQL-H3 / TS-H1: 22023 de `p_fecha` antes de autorizar | Autorización antes de bifurcar por alcance (`:537-550`). Es el mismo predicado que `agenda_actualizar_cita` (`20260906120000_…:603-606`), así que la rama `esta` no cambia. | Sí. M.2 (`16-series.sql:832-848`): una cita ajena y un id inventado dan el mismo 42501 con el mismo mensaje. Sin el arreglo, la primera daría 22023. |
| SQL-H4: la previsualización no valida la duración | 22023 de 5 a 480 en `plan_edicion_serie` `:320-322` | Sí. M.4 prueba 4 y 481 en las dos RPC, y 480 como gemela. Sin la guarda, la previsualización no lanza y la edición da 23514. |
| TS-H2: el domingo no tiene prueba | Caso positivo `2027-03-07`/7 y negativo /6 | Sí. Si se quita `0 → 7`, el positivo se pone en rojo. |
| TS-H3: el comentario de §A no remite a §B | Comentario reescrito en `17-vinculo-agenda.sql:60-68` y nota en §B | No lleva prueba. |
| TS-H4: la fila del README | «criterios 4-13 y 16-18 … (14 y 15 no tienen bloque)» | No lleva prueba. |
| TS-H5: el docblock de `editarSerie` | Ahora dice que la regla se aplica desde la cita elegida, qué hace `fecha` y cómo sale el ordinal | No lleva prueba. |
| TS-H6: la cabecera de `esquemas.ts` | Ahora apunta a T-014 | No lleva prueba. |
| TS-H7: `.omit()` sobre esquemas con `refine` | Es una nota para T-014, así que va a `docs/state.md` al integrar. No está en la rama, y es lo correcto. | No aplica. |

## MEDIA

### H1 · El ordinal mensual se deduce de cualquier cita no desviada de la serie, también de las que siguen una regla anterior
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:351-361` (`plan_edicion_serie`)

**Qué pasa.** Cuando el ancla es un 4.º que además es el último de su mes, el ordinal se decide con la cita «no recortada»
más cercana de la serie. La consulta no filtra por día de la semana, ni por la regla vigente, ni por si la cita ya pasó.
Las citas anteriores a una edición con `p_fecha` conservan la regla vieja y no están desviadas, así que entran en el voto.

**Escenario** (calendario comprobado con `node`):
1. Serie mensual de viernes creada el 30-04-2027 (el 5.º viernes). Sus citas son 30-04, 28-05, 25-06, 30-07 y 27-08.
2. Desde la cita del 28-05 se edita con `p_fecha => '2027-05-27'` (jueves, 4.º y último de mayo). Es la rama
   `p_fecha <> origen`, así que el ordinal es 4 y la previsualización dice «4.º jueves». Se confirman las propuestas y
   las citas quedan en 27-05, 24-06, 22-07 y 26-08. La del 30-04 sigue en viernes y no está desviada.
3. Desde la cita del 27-05 se cambia **solo la hora** (`p_hora_local => '18:00'`). El 27-05 es el 4.º jueves y también
   el último, así que el caso es ambiguo. Las candidatas son el 30-04 (día > 28, ordinal 5, a 27 días) y el 22-07
   (ordinal 4, a 56 días). Gana el 30-04, `v_ordinal := 5`, y la carga lleva `ordinal = 5`.
4. **Efecto:** la cita del 22-07 se propone el **29-07**. La serie pasa del «4.º jueves» al «último jueves» sin que nadie
   haya movido una fecha. Es justo lo que la decisión de SQL-H2 quería evitar («si la cita no cambia de fecha, el ordinal
   es el de la serie»). La previsualización lo anuncia (`ordinal = 5`, `ultimo = true`), pero la frase que enseñará
   T-014 («el último jueves de cada mes») es falsa respecto a la regla que el usuario fijó en el paso 2.

Con propuestas pendientes pasa lo mismo, y también al revés. Las citas del paso 2 que aún no se han confirmado siguen en
viernes: el 30-07 es un 5.º y también vota. En el escenario de M.13, una serie del 2.º martes con una edición a medio
confirmar puede hacer que un 5.º jueves ambiguo se resuelva como 4.º.

**Arreglo posible** (decide quien lo implemente): restringir las candidatas a `isodow = p_serie.dia_semana` y a
`inicio >= ` la última cita que ya siga la regla vigente. Lo más robusto es guardar el ordinal en `series_cita`, pero es
una columna nueva y queda fuera del territorio. Hace falta una prueba con una serie ya editada de otro día.

### H2 · La desambiguación solo tiene prueba para el lado «es un 5.º»; con «ambiguo ⇒ 5» todo el banco sigue en verde
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:348-365`, `scripts/rls/16-series.sql:2117-2257` (M.14 e)

**Qué pasa.** M.14(e) prueba una serie del 5.º jueves editada desde su cita recortada, y espera 5. Ninguna prueba de la
sección M edita una serie mensual de un **4.º de verdad** desde una cita que también es la última de su mes:
- M.11 y M.13 son del 2.º martes.
- M.13(e) edita desde un 2.º martes, así que no es ambiguo.
- Las demás llamadas mensuales llevan `p_fecha` distinta del origen.

**Escenario.** Alguien simplifica `:348-365` a `if v_ordinal = 4 and <es el último> then v_ordinal := 5; end if;`, por
ejemplo porque «la consulta es cara». M.14(e) sigue en verde y ninguna otra prueba entra en esa rama.

**Efecto en producción:** una serie creada el 27-05-2027 (4.º jueves, y el último de mayo) da 27-05, 24-06, 22-07 y 26-08.
Cambiar solo la hora desde el 24-06 propondría el 22-07 en el **29-07**. El caso común, un 4.º de verdad en un mes de
cuatro jueves, que pasa unos siete meses al año por día de la semana, queda sin protección, y el raro (5.º) sí la tiene.

**Qué pedir:** una gemela en M.14(e) con una serie creada en un 4.º que también sea el último, y una edición solo de hora
desde otra cita suya que sea la última. Debe esperar `ordinal = 4` y las mismas fechas de `ocurrencias_serie`.

## BAJA

### H3 · `agenda_editar_serie` lee la cita ancla sin candado antes de bloquear la serie; con el arreglo de SQL-H1 espera justo entre las dos lecturas
`supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:532` (lectura) y `:564` (candado de la serie)

**Qué pasa.**
- `v_cita` se lee con un `select` simple (`:532`), y solo después se toma la serie `for no key update` (`:564`).
- `agenda_confirmar_propuesta` bloquea la cita (`:786`) y ahora también la serie `for share` (`:811`).
- Si la confirmación va primero, la edición se queda esperando en `:564` con un `v_cita` de antes de que la otra
  transacción moviera la cita.
- En READ COMMITTED, las sentencias posteriores sí ven la cita nueva: el subselect de `citas_afectadas_por_regla` y
  `agenda_propuestas_de_evento`. `plan_edicion_serie`, en cambio, ya ha fijado `fecha_origen`, y las guardas de pasada,
  desviada y cancelada con la fila vieja.

**Escenario** (serie semanal):
1. Una propuesta pendiente P0, de un evento anterior de desplazamiento +7, mueve la cita C del martes 09 al martes 16.
2. T2, la técnica, confirma P0: bloquea C y la serie `for share`, y actualiza C.
3. A la vez, T1, el profesional, arrastra C en la agenda (la ve el 09) al jueves 11 con «esta y las siguientes». Lee C
   (09) y espera en `:564`.
4. T2 confirma. T1 sigue con `fecha_origen = 09` y `fecha_destino = 11`.
5. El disparador calcula la propuesta de C desde su posición real (16) más el desplazamiento del ancla: el **jueves 18**.

**Efecto:** la previsualización y la propuesta no coinciden, porque la previsualización dijo 11 (criterio 16d). Si
además la confirmación marca C con `anomalia_horaria`, la edición se ancla en una cita desviada, que es lo que la guarda
de `plan_edicion_serie` rechaza.

Es BAJA porque la propuesta se ve antes de confirmarla (ADR-034) y la ventana dura lo que una confirmación.

**Arreglo:** volver a leer `v_cita` después de `:564`, o tomar la cita `for share` **antes** de la serie. Es el mismo
orden cita → serie que en la confirmación. El orden serie → cita cerraría un ciclo 40P01 con `agenda_confirmar_propuesta`.

### H4 · El gate de territorio sale con 1 por dos ficheros sin seguimiento que no son de la rama
`.claude/worktrees/t011b-banco/.claude/agent-memory/revisor/{MEMORY.md,patrones-de-fallo.md}`

**Qué pasa.** `node ~/.claude/pipeline/territorio.mjs T-011b` ejecutado en el worktree da «2 fichero(s) FUERA del
territorio» y exit 1. Los dos son memoria de un revisor, creada hoy a las 13:16 dentro del worktree y no en el repo
principal. El diff de la rama (`git diff --name-only 9c74516..f673e5e`) tiene 8 ficheros, todos dentro de `territorio:`.

**Escenario:**
- El criterio 15 («territorio.mjs limpio») se cierra con exit 1 y bloquea el gate por algo ajeno al implementador.
- O bien un `git add -A` en el commit de integración mete `.claude/**`, que no es de nadie automático, en `main`.

**Arreglo:** mover los dos ficheros a `.claude/agent-memory/revisor/` del repo principal (fundiéndolos) y borrarlos del
worktree antes de volver a ejecutar el gate.

## Comprobado sin hallazgo

- **Autorización antes de las guardas.**
  - `agenda_editar_serie`: 42501 antes de cualquier 22023 en las dos ramas.
  - `agenda_previsualizar_edicion_serie`: autoriza antes de `plan_edicion_serie`, con el mismo mensaje para una cita
    ajena y para una inexistente.
  - `agenda_confirmar_propuesta`: el 22023 «La propuesta no existe» frente al 42501 ya estaba así en T-011, y el diseño
    §1.6.2 lo conserva a propósito («como hoy»). No es de este diff.
- **Candados y orden.**
  - En la confirmación, el orden es propuesta → cita (NKU) → serie o centro (SHARE).
  - En la edición, es serie (NKU) → FK `KEY SHARE` sobre citas al insertar propuestas, que no choca con el NKU de la
    cita. No hay ciclo.
  - `for share` choca con `for no key update`, así que la guarda de regla relee la versión confirmada. La de zona hace
    lo mismo frente al `UPDATE` de `centros`.
- **Solo adición.** Solo se escriben `series_cita`, `citas`, `propuestas_cita` y `eventos_salientes` (estado del
  outbox). Ninguna está en la regla 6, y no hay ningún `DELETE`.
- **`security definer`.** Todas las funciones llevan `set search_path = ''` y todas las referencias van cualificadas
  (`public.`, `auth.uid()`). Los tres ayudantes internos no tienen `EXECUTE` para `public`, `anon` ni `authenticated`.
- **La deducción del ordinal.**
  - Con `p_fecha` distinta del origen, el ordinal sale del destino (ADR-068.3).
  - Con la misma fecha o sin fecha, sale del ancla, y solo es ambiguo cuando el ancla es un 4.º que también es el último.
  - Previsualización y edición usan el mismo `v_plan`, y la carga lleva el `ordinal` que usa la frescura, así que la
    confirmación recalcula igual.
  - Sin ancla (el `UPDATE` del dueño), `ordinal` es nulo y cada cita conserva el suyo.
- **El ancla en el GUC** es ahora el `v_plan` entero. El disparador lo anula si el `serie_id` no coincide (`:433`), y se
  limpia justo después del `UPDATE` (`:581`). Solo se publica si `cambia`.
- **La frontera TS.** `fecha` va con regex + ida y vuelta por `Date.UTC`, está prohibida con `esta` y tiene que coincidir
  con `diaSemana`, con el error en `['fecha']`. `editarSerie` pasa `p_fecha`. `tipos-bd.ts` lleva `p_ordinal` en
  `fecha_en_regla_nueva`.

## Para integrar (no son hallazgos del código)

- La decisión «si la cita no cambia de fecha, el ordinal es el de la serie» (SQL-H2, «decisión del propietario,
  25-09-2026») solo aparece en comentarios del código y en el mensaje de `5a82b85`. No hay ADR, y `diseno.md` §1.1 sigue
  diciendo `n := ord(p_fecha_cita)`. Al integrar conviene dejarla escrita donde se leen las decisiones (ADR nuevo o
  bitácora), junto con H1 si el propietario lo acepta como riesgo.
- `fecha_en_regla_nueva` pasa a tener 6 argumentos, y el diseño §1.7 dice 5. El cambio es coherente con el arreglo, y
  ningún criterio fija esa firma.
