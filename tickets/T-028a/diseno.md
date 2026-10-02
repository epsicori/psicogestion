# T-028a · Diseño — base del alta de cita

Arquitecto, 02-10-2026. Contrato: `tickets/T-028a-base-del-alta-de-cita.md`. Hecho sobre `main` en
51430e2, **sin T-035 integrado** (solo diseñado) y **sin usar la base local** (ocupada). La
precondición del contrato (línea 78: «sobre `main` con T-035 integrado y re-verificado») queda como
tarea 0 del implementador (§Por confirmar al implementar, P0).

## Orden de lectura para el implementador

1. Este diseño entero, y las «Preguntas para el propietario» con lo que el propietario decidió.
2. `.claude/rules/supabase.md` y `.claude/rules/fechas.md` (se cargan solas al tocar SQL).
3. `supabase/migrations/20260910120000_series_materializacion_desviaciones.sql:564-780`, el
   `agenda_crear_serie` vigente, que se reescribe. También `resolver_hora_local` (:170) y
   `ocurrencias_serie` (versión vigente en `20260925120000_editar_serie_desde_la_cita.sql:1057`).
4. `20260925120000_editar_serie_desde_la_cita.sql:270-410`. Es el patrón de función interna:
   `plan_edicion_serie`, con su `revoke … from public, anon, authenticated`.
5. Las políticas que se recrean:
   - `20260906120000_agenda_esquema.sql:688-753`: `citas_lectura`, `citas_modificacion`,
     `series_cita_lectura`;
   - `20260911120000_vinculo_en_el_alta_de_agenda.sql:35-126`: `citas_alta`, `series_cita_alta`
     y `fn_exigir_vinculo_agenda`.
6. `lib/citas/errores.ts`: `mapearErrorCitas` y `FRAGMENTOS_DE_RECHAZO`. Ningún mensaje nuevo
   puede contener esos fragmentos.
7. Los bancos:
   - `scripts/rls/00-ayudantes.sql` (ayudantes) y `01-fijacion.sql` (uuids);
   - `15-agenda.sql:395-438` (§J);
   - `17-vinculo-agenda.sql:85-127` (§B y §C);
   - `18-agenda-rango.sql:40-110`, por C18TEC: ver la pregunta A;
   - `16-series.sql:46-64`, las anclas de cambio de hora que se copian.
8. `supabase/seed-completo.sql` entero: las constantes y su estilo idempotente.

## 0 · Hechos verificados contra el código

**Políticas y permisos**

| # | Hecho | Dónde |
|---|---|---|
| F1 | `citas_alta` tiene tres ramas: el administrador; `profesional_id = uid` y `es_profesional_asignado(paciente_id)`; y el técnico con `centro_id in centros_actuales()`. **H16** es la tercera rama. | `20260911120000_vinculo_en_el_alta_de_agenda.sql:35-52` |
| F2 | `citas_modificacion` (en `using` y en `with check`) tiene tres ramas: el administrador; `profesional_id = uid` **sin mirar el rol**; y el técnico con su centro. **H23** es la rama del técnico más el `grant update`. | `20260906120000_agenda_esquema.sql:715-738` |
| F3 | `series_cita_lectura` tiene la misma forma de tres ramas. **H24** es su rama del técnico. A `authenticated` ya se le revocaron `insert` y `update` sobre `series_cita`. | `agenda_esquema.sql:741-753`; `20260925120000…:1144` |
| F4 | Todas las `agenda_*` que escribe el técnico son `security definer`, así que no dependen de la rama del técnico en las políticas: `agenda_actualizar_cita` (`agenda_esquema.sql:574-625`), `agenda_cancelar_cita` y `agenda_descartar_propuesta` (`20260910120000…:785, 1188`), y `agenda_confirmar_propuesta` y `agenda_editar_serie` (`20260925120000…`). | grep de `security definer` en cada una |
| F5 | Ningún código de `app/` ni de `lib/` hace `insert` ni `update` sobre `citas` o `series_cita`, ni lee `series_cita`. Las únicas lecturas de `citas` son `select` (`lib/notas/servidor.ts:248,445,730`, `lib/citas/agenda.ts:153`, `app/(app)/pacientes/[id]/datos.ts:139`). | grep `from('citas')`, `from('series_cita')` |
| F6 | En los bancos, el técnico solo escribe en `citas` en dos sitios: el `update … where id` de `15-agenda.sql:412` y el `insert` de `17-vinculo-agenda.sql:118`. `C29TEC` solo aparece en 17 §C (líneas 17, 119 y 126). | awk sobre `scripts/rls/*.sql` |
| F7 | **C18TEC** (`a1800004-…-0008`): la siembra `18-agenda-rango.sql` crea, como `postgres`, una cita de CA con `profesional_id = TEC1`, futura (`now() + 3h`). Persiste en los bancos 19, 20 y 21 (una transacción, `README.md` punto 7). Por la rama `profesional_id = uid` sin rol de F2, el técnico **puede actualizarla**. Ver la pregunta A. | `18-agenda-rango.sql:40-110` |
| F8 | Los nombres de las políticas están en la lista de cobertura. Recrearlas con el mismo nombre no toca `11-cobertura.sql`. | `11-cobertura.sql:24-26` |

**Funciones y disparadores**

| # | Hecho | Dónde |
|---|---|---|
| F9 | El `agenda_crear_serie` vigente tiene 11 argumentos, los dos últimos con valor por defecto, y devuelve `{serie_id, zona_horaria, citas:[{cita_id, fecha}], propuestas:[{propuesta_id, fecha, motivo}]}`, sin tipo.<br>Detalles del cuerpo:<br>- La fecha pasada se mide con `current_date` y da `'la fecha de inicio no puede ser pasada'`, 22023.<br>- El bloqueo de festivo o ausencia es `limit 1` **sin `order by`**.<br>- La alternativa (hasta 7 días) compara con `[inicio, fin)` sin el descanso de la cita nueva.<br>- La propuesta `ocupada` guarda **el mismo hueco ocupado** como `inicio_propuesto`. | `20260910120000…:564-780` |
| F10 | `citas_sin_solape_profesional` es `exclude using gist (profesional_id with =, rango_bloqueante with &&) where (estado in ('programada','confirmada','realizada'))`. `fn_calcular_rango_bloqueante` fija `[inicio, fin + descanso)` con `descanso = perfiles.descanso_minutos` si `descanso_activo`, y si no 0. | `agenda_esquema.sql:239-305` |
| F11 | `resolver_hora_local(p_zona text, p_local timestamp) returns table (instante timestamptz, clasificacion text)`, `stable`, con `grant` a `authenticated`. | `20260910120000…:170, 1238` |
| F12 | `fn_exigir_vinculo_agenda` (`before insert` sobre `citas` y `series_cita`) solo actúa si el rol es `profesional_sanitario` y la fila es suya. Mensaje: `'Ese paciente no es tuyo: citar no crea el vínculo (ADR-055). Paciente: %'`, 42501. | `20260911120000…:78-126` |
| F13 | `fn_proteger_cita_pasada`: sobre una cita con `old.fin <= now()`, un `update` que cambia `tipo_terapia_id` **lanza** 42501. Uno que cambia `nota_operativa` o `sala` **no lanza**. | `20260910120000…` (cuerpo leído) |

**Tablas**

| # | Hecho | Dónde |
|---|---|---|
| F14 | `propuestas_cita`: `fecha_prevista date not null`, `hora_local_prevista time not null`, `inicio_propuesto` y `fin_propuesto` nulables, `motivo ∈ {festivo, ausencia, ocupada, zona_cambiada, regla_cambiada}`. | `20260910120000…:34, 85-117` |
| F15 | `series_cita`: `tipo_terapia_id` nulable, `duracion_minutos` not null con default 50 y `check 5..480`, y `series_cita_final_ck` (sesiones **o** `fin_el`). | `agenda_esquema.sql:130-155` |
| F16 | Bancos 15-20: ninguno siembra `disponibilidad` de tipo `franja`. El banco 16 usa como anclas el año que viene (`anio_test = año + 1`). | grep `'franja'`; `16-series.sql:46-64` |

**Código de la aplicación**

| # | Hecho | Dónde |
|---|---|---|
| F17 | `lib/citas/series.ts:18` llama a `rpc('agenda_crear_serie', {…11 nombrados})`. Los parámetros nuevos con valor por defecto al final no la rompen. | leído |
| F18 | `mapearErrorCitas`:<br>- 23P01 da `hueco_ocupado`;<br>- 42501 da `cita_pasada` si el mensaje contiene «pasada», y si no `no_autorizado`;<br>- 22023 da `parametro_invalido`.<br>`FRAGMENTOS_DE_RECHAZO` contiene: `ya ha empezado o ha pasado`, `cancelada o cerrada`, `se movió a mano`, `no coinciden`, `nuevo horario de esta cita ya ha pasado`, `quedado en el pasado`, `sin evento`, `otra regla`, `otra zona`, `La cita cambió`, `no tiene horario`. | `lib/citas/errores.ts` |

**Documentación y herramientas**

| # | Hecho | Dónde |
|---|---|---|
| F19 | La fila «Agenda» de la matriz está en la **línea 184** de `docs/architecture.md`, no en la 175 que cita el contrato. La fila «Auditoría» está en la 186. | `docs/architecture.md:184,186` |
| F20 | El linter de migraciones (regla 2) solo marca `drop table`, `drop column`, `drop type`, `alter column … type` y `set not null` sin valor por defecto. `drop function` y `drop policy` no necesitan anuncio. | `scripts/lint-migraciones.ts:216-257` |
| F21 | Sello: T-035 reserva `20261004120000`. El último en `main` es `20261003120000`. | `ls supabase/migrations` |

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261005120000_base_del_alta_de_cita.sql`

Va en este orden. Cada función nueva o recreada es `security definer`, `set search_path = ''`,
con `comment on function`. Las públicas llevan `revoke execute … from public, anon` y
`grant execute … to authenticated`. Las internas llevan `revoke execute … from public, anon,
authenticated` y ningún `grant`.

**§1 · Puertas del técnico (H16, H23, H24).** Cada política se borra y se crea de nuevo con **el
mismo nombre** (`drop policy … ; create policy …`) y su `comment on policy`.

| Política | Antes | Después |
|---|---|---|
| `citas_alta` (insert, `with check`) | admin ∨ (profesional = uid ∧ asignado) ∨ (técnico ∧ centro) | admin ∨ (**[rol = profesional_sanitario ∧]** profesional = uid ∧ asignado) |
| `citas_modificacion` (update, `using` y `with check`) | admin ∨ profesional = uid ∨ (técnico ∧ centro) | admin ∨ (**[rol = profesional_sanitario ∧]** profesional = uid) |
| `series_cita_lectura` (select) | admin ∨ profesional = uid ∨ (técnico ∧ centro) | admin ∨ (**[rol = profesional_sanitario ∧]** profesional = uid) |

- El conjuntivo entre corchetes depende de la **pregunta A**. Se recomienda ponerlo: es
  `(select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario`.
- Las dos políticas conservan el conjuntivo inicial `rol_actual() is not null`.
- Los `grant` de tabla no se tocan: `insert`, `update` y `select` a `authenticated`. Los necesitan
  el administrador y el profesional (criterio 18).
- `citas_lectura`, `series_cita_alta` y `series_cita_modificacion` no se tocan.
  `series_cita_alta` está dormida, porque `insert` está revocado.

**§2 · Ayudantes internos.** Todos son `stable`, `security invoker`, `language sql` o `plpgsql`, sin
`grant`. Como son invoker y los llaman funciones definer, corren con los privilegios del dueño, el
mismo patrón que `plan_edicion_serie`.

```sql
public.alta_descanso(p_profesional_id uuid) returns interval
  -- case when descanso_activo then make_interval(mins => descanso_minutos) else '0' end;
  -- coalesce '0'. Es la MISMA expresión que fn_calcular_rango_bloqueante (F10).

public.alta_bloqueo_disponibilidad(p_profesional_id uuid, p_centro_id uuid, p_fecha date,
    p_inicio timestamptz, p_fin timestamptz) returns public.tipo_disponibilidad
  -- El predicado de F9, idéntico (centro nulo o igual; desde/hasta; día entero, o solape
  -- de [p_inicio, p_fin) con [fecha+hora_inicio, fecha+hora_fin) en d.zona_horaria),
  -- más `order by (d.tipo = 'festivo') desc, d.id limit 1`: el festivo gana y es
  -- determinista (F9 no lo era).

public.alta_hueco_ocupado(p_profesional_id uuid, p_inicio timestamptz, p_fin timestamptz) returns boolean
  -- exists citas c where c.profesional_id = p and c.estado in ('programada','confirmada','realizada')
  -- and c.rango_bloqueante && tstzrange(p_inicio, p_fin + alta_descanso(p), '[)').
  -- Es EXACTAMENTE la restricción de F10. No hay otro predicado de «ocupado» en el ticket.
```

**§3 · `public.plan_alta_serie`.** Es interna: `stable`, invoker, sin `grant` y con
`revoke … from public, anon, authenticated`, como `plan_edicion_serie`.

```sql
public.plan_alta_serie(p_profesional_id uuid, p_centro_id uuid, p_zona_horaria text,
    p_fechas date[], p_hora_local time, p_duracion_minutos smallint) returns jsonb
-- → jsonb array, uno por fecha de p_fechas EN SU ORDEN:
--   {fecha, hora_local, inicio, fin, clasificacion, bloqueo, alternativa}
```

Por cada fecha `f`:

1. `(inicio, clasificacion) := resolver_hora_local(zona, f + hora)` y `fin := inicio +
   duración`.
2. `bloqueo := alta_bloqueo_disponibilidad(…)`. Si es nulo y `alta_hueco_ocupado(…)`, el bloqueo es
   `'ocupada'`. Si no, es `null`.
3. Si hay bloqueo, se busca la alternativa: para `d` de 1 a 7, el primer `f + d` que cumpla tres
   cosas:
   - no tiene bloqueo de disponibilidad;
   - no está ocupado (con el descanso);
   - **no está en `p_fechas`**, para que la alternativa no pise otra sesión de la misma serie
     (una ausencia de una semana justa).

   Se devuelve `{fecha, inicio, fin}`, o `null` si no hay ninguno.

`hora_local` es `p_hora_local`. Se calcula **una vez**, antes de escribir nada (§2 D7).

**§4 · `public.agenda_previsualizar_alta`.** Es `stable` y definer.

```sql
public.agenda_previsualizar_alta(p_paciente_id uuid, p_profesional_id uuid, p_centro_id uuid,
    p_periodicidad public.periodicidad_serie, p_dia_semana smallint, p_hora_local time,
    p_duracion_minutos smallint, p_desde date, p_sesiones_totales smallint) returns jsonb
-- → {zona_horaria, sesiones: plan_alta_serie(...)}. Sin tipo, sin ids.
```

Comprobaciones, en este orden:

1. Autorización (§1.2 A1-A3).
2. Parámetros, todos con 22023:
   - suelta (`p_periodicidad is null`) con `p_dia_semana` o `p_sesiones_totales` no nulos;
   - serie sin `p_sesiones_totales`;
   - `p_desde`, `p_hora_local` o `p_duracion_minutos` nulos, o duración fuera de 5..480;
   - `p_desde < current_date`. Es el mismo criterio que `agenda_crear_serie`, para que la gemela
     de coherencia no diverja.

Las fechas se calculan así:

- en una suelta, `array[p_desde]`;
- en una serie, `array(select ocurrencias_serie(p_periodicidad, p_dia_semana, p_desde,
  p_sesiones_totales, null))`.

**§5 · `public.agenda_crear_serie`.** Se hace `drop function` de la firma de 11 argumentos de F9 y
se crea así:

```sql
public.agenda_crear_serie(
  p_paciente_id uuid, p_profesional_id uuid, p_centro_id uuid, p_tipo_terapia_id uuid,
  p_periodicidad public.periodicidad_serie, p_dia_semana smallint, p_hora_local time,
  p_duracion_minutos smallint, p_desde date,
  p_sesiones_totales smallint default null, p_fin_el date default null,
  p_excluir date[] default null, p_sala text default null,
  p_nota_operativa text default null, p_estricta_primera boolean default false
) returns jsonb   -- forma de retorno IDÉNTICA a F9
```

T-039 añadirá `p_modalidad_asistencia … default null, p_episodio_id uuid default null` al final,
con el mismo `drop` y `create`. Así nunca conviven dos sobrecargas. Hay que hacer de nuevo el
`comment on function`, el `revoke` y el `grant` con la firma nueva.

Comprobaciones, en este orden:

1. **A1-A3** (§1.2). Los mensajes existentes se conservan: `'No hay sesión activa con perfil.'` y
   `'No autorizado para crear esta serie.'`.
2. **A4**, la nota del técnico (§1.2).
3. **Fecha pasada**: el mensaje y el criterio existentes de F9.
4. **Tipo** (§1.3). Se aplica si `p_estricta_primera` o si `p_tipo_terapia_id is not null`. Con un
   tipo nulo y sin `p_estricta_primera`, se conserva el comportamiento actual: ver la pregunta C.
5. **Duración** (§1.3). `v_duracion := coalesce(p_duracion_minutos, tipo.duracion_minutos)`. Si
   queda nula, da 22023 `'Falta la duración de la cita.'`.
6. **Zona**: el bloque existente.
7. `v_todas := ocurrencias_serie(…)`, en orden.
   - Un elemento de `p_excluir` que no esté en `v_todas` da 22023 `'Esa fecha excluida no es de la
     serie.'`. Los nulos dentro de `p_excluir` dan el mismo error.
   - `v_fechas := v_todas` sin las excluidas. **Las excluidas consumen su ordinal** porque se
     quitan después de generar `v_todas`.
   - Si `v_fechas` queda vacío, da 22023 `'Excluir todas las fechas deja la serie sin
     sesiones.'`.
8. `v_plan := plan_alta_serie(…, v_fechas, …)`.
9. **Estricta.** Si `p_estricta_primera`, se mira `v_plan[0]`:
   - un bloqueo `festivo` o `ausencia` da 22023 `'La primera sesión cae en festivo o
     ausencia.'` (pregunta B);
   - un bloqueo `ocupada` da `raise … using errcode = '23P01'` con `'La primera sesión choca con
     otra cita del profesional.'`.
10. `insert into series_cita (…)`, con `duracion_minutos = v_duracion`. Lo demás como en F9.
11. Por cada sesión `s` de `v_plan`, por índice `i`:
    - **Si `s.bloqueo` no es nulo:** se crea la propuesta, con `motivo = s.bloqueo`,
      `fecha_prevista = coalesce(alt.fecha, s.fecha)`, `hora_local_prevista = p_hora_local`,
      `inicio_propuesto = alt.inicio` y `fin_propuesto = alt.fin`. Si `alt` es nulo, las dos
      columnas quedan nulas.
      - Es la misma forma de F9 para festivo y ausencia.
      - **Cambia `ocupada`**, que ahora lleva la alternativa del plan en vez del hueco ocupado.
    - **Si no, y además `i = 0 ∧ p_estricta_primera`:** `insert into citas` **sin bloque
      `exception`**. Un 23P01 por concurrencia se propaga y deshace todo (criterio 9).
    - **Si no:** `insert into citas` dentro de `begin … exception when exclusion_violation`. Eso
      solo ocurre por concurrencia entre el plan y el insert. Se crea la propuesta `ocupada` sin
      alternativa (`inicio_propuesto` nulo) con `fecha_prevista = s.fecha`.
    - Cada `insert into citas` lleva:
      - `tipo_terapia_id = p_tipo_terapia_id`;
      - `fin = s.inicio + v_duracion`;
      - `sala = p_sala`;
      - `nota_operativa = p_nota_operativa`;
      - `desviada` y `motivo_desviacion` como en F9.
    - El `fecha` del jsonb de retorno es siempre `s.fecha`, la fecha original.

**§6 · `public.agenda_crear_cita`.** Es `volatile` y definer.

```sql
public.agenda_crear_cita(
  p_paciente_id uuid, p_profesional_id uuid, p_centro_id uuid, p_tipo_terapia_id uuid,
  p_fecha date, p_hora_local time, p_duracion_minutos smallint default null,
  p_sala text default null, p_nota_operativa text default null
) returns uuid   -- solo el id de la cita creada
```

Comprobaciones, en este orden:

1. A1-A3. El mensaje de A2 es `'No autorizado para dar esta cita.'`.
2. A4.
3. `p_fecha` o `p_hora_local` nulos dan 22023 `'Faltan la fecha o la hora de la cita.'`.
4. Tipo (§1.3, siempre obligatorio aquí) y duración (§1.3).
5. `v_zona := zona_horaria_centro(p_centro_id)`. Si es nula, el mismo error que F9 con el prefijo
   `agenda_crear_cita:`.
6. `p_fecha < (now() at time zone v_zona)::date` da 22023 `'agenda_crear_cita: la fecha es
   anterior a hoy.'`.
7. `(v_inicio, v_clasif) := resolver_hora_local(v_zona, p_fecha + p_hora_local)`. `v_inicio <=
   now()` da 22023 `'agenda_crear_cita: el inicio es anterior a ahora.'`.
8. `alta_bloqueo_disponibilidad(…)` no nulo da 22023 `'Ese día el profesional tiene festivo o
   ausencia.'`.
9. `insert into citas` con `serie_id` nulo, la sala, la nota, `desviada = (v_clasif <>
   'normal')` y `motivo_desviacion = 'anomalia_horaria'` si la hora no es normal. Va **sin
   bloque `exception`**: el 23P01 se propaga.

No exige que la cita caiga dentro de una franja: la franja ordena la sugerencia, no prohíbe.

**§7 · `public.agenda_bloques_profesional`.** Es `stable` y definer. Toda tabla del cuerpo lleva
alias (regla de `returns table`).

```sql
public.agenda_bloques_profesional(p_profesional_id uuid, p_centro_id uuid, p_desde date,
    p_hasta date, p_duracion_minutos smallint)
returns table (fecha date, hora_local time, inicio timestamptz, fin timestamptz, estado text)
```

Validación, todos con 22023:

| Caso | Mensaje |
|---|---|
| Algún parámetro nulo | `'agenda_bloques_profesional: faltan parámetros.'` |
| `p_hasta < p_desde` | `'agenda_bloques_profesional: hasta es anterior a desde.'` |
| `p_hasta - p_desde + 1 > 62` | `'agenda_bloques_profesional: como mucho 62 días.'` |
| Duración fuera de 5..480 | `'agenda_bloques_profesional: duración entre 5 y 480 minutos.'` |

La autorización va **antes** que la validación de rango (permisos antes que cotejo):
- `rol_actual()` nulo da 42501, como A1;
- si no se cumple `admin ∨ p_profesional_id = uid ∨ (técnico ∧ p_centro_id ∈
  centros_actuales())`, da 42501 `'No autorizado para ver esta agenda.'`.

Algoritmo, para cada `d` de `p_desde` a `p_hasta`:

1. Si hay un festivo o ausencia **de día entero** (`hora_inicio is null`, centro nulo o igual,
   vigente en `d`), el día se salta.
2. Las franjas `f` aplicables son `tipo = 'franja'`, `perfil_id = p`, `dia_semana =
   isodow(d)`, centro nulo o igual y vigentes en `d`, ordenadas por `hora_inicio`.
3. Para cada franja, `f_ini` y `f_fin` salen de `resolver_hora_local(f.zona_horaria, d +
   f.hora_inicio / hora_fin)`, y `cursor := f_ini`.
4. Mientras `cursor + dur <= f_fin`, sea `cand := [cursor, cursor + dur + descanso)`:
   - Los bloqueos son las citas del profesional en **cualquier centro**, con estado bloqueante y
     `rango_bloqueante && cand`, más las ausencias o festivos **parciales** cuyo tramo `&&
     [cursor, cursor + dur)`. Es el mismo predicado que `alta_bloqueo_disponibilidad`.
   - **Si hay bloqueos:** se emite `(d, local(cursor), cursor, cursor + dur, 'ocupado')` y
     `cursor :=` el mayor límite superior de los bloqueos.
   - **Si no:** se emite `'libre'` y `cursor := cursor + dur + descanso`.
5. `hora_local` es `(cursor at time zone zona_horaria_centro(p_centro_id))::time`.
6. Solo se emiten los tramos con `inicio > now()`.
7. El orden es `fecha, inicio`.

Nada de la salida identifica la cita que bloquea.

### 1.2 Autorización común (A1-A4)

```
A1  v_rol is null                                   → 42501 'No hay sesión activa con perfil.'
A2  not (v_rol = admin
         or p_profesional_id = uid
         or (v_rol = tecnico and p_centro_id in centros_actuales()))  → 42501 (texto por función)
A3  v_rol = profesional_sanitario and p_profesional_id = uid
      and not es_profesional_asignado(p_paciente_id)
                                  → 42501 'Ese paciente no es tuyo: citar no crea el vínculo (ADR-055).'
A4  v_rol = tecnico and p_nota_operativa is not null
                                  → 42501 'El técnico administrativo no escribe la nota operativa (choque 4).'
```

- A3 repite el texto de F12 **sin el uuid**, antes de cualquier cotejo. El disparador sigue debajo
  como segunda capa.
- `agenda_bloques_profesional` no lleva A3, porque no tiene paciente.
- `agenda_previsualizar_alta` lleva A1-A3, y no A4, porque no tiene nota.
- Ningún mensaje 42501 contiene «pasada» (F18).

### 1.3 Tipo y duración (ADR-074, criterios 12 y 13)

```
T0  p_tipo_terapia_id is null        → 22023 'Falta el tipo de terapia de la cita (ADR-074).'
T1  select … from tipos_terapia t where t.id = p for share;  no existe
                                     → 22023 'Ese tipo de terapia no existe en el catálogo.'
T2  t.activo = false                 → 22023 'Ese tipo de terapia está dado de baja en el catálogo.'
D1  p_duracion_minutos is not null and p_duracion_minutos <> t.duracion_minutos
                                     → 22023 'La duración no es la del tipo de terapia: manda el tipo (ADR-074).'
```

Los fragmentos para el banco son `Falta el tipo de terapia`, `no existe en el catálogo`, `dado de
baja en el catálogo` y `no es la del tipo de terapia`. Ninguno es prefijo de otro ni contiene un
fragmento de F18.

### 1.4 Siembra (`supabase/seed-completo.sql`)

Es una sección nueva, **antes** de la sección 9 (la baja) y de los secretos de Vault. Va dentro del
mismo `do $seed$`, con uuids fijos y `on conflict (id) do nothing`.

**Excepción documentada en comentario:** las fechas son relativas a `current_date`. Una siembra
con fechas absolutas caducaría: el festivo debe ser futuro y las seis citas, pasadas.

| Qué | Filas | uuids |
|---|---|---|
| Tipos activos | `'Sesión individual'` 50 · `'Sesión de pareja'` 90 · `'Sesión breve de seguimiento'` 30, todos `exento_sanitario` | `e0280001-0000-4000-8000-00000000000{1,2,3}` |
| Tipo inactivo | `'Sesión de grupo'` 90, `activo = false` | `e0280001-…-000000000004` |
| Franjas | Ana (`k_ana`) y Bruno (`k_bruno`), `dia_semana` 1 a 5, de 09:00 a 14:00 y de 16:00 a 20:00. `centro_id` y `zona_horaria` son los de su centro en la siembra (P3), `desde = current_date - 7` y `hasta` nulo. En total, 20 filas. | `e0280002-…-0000000000NN` |
| Festivo | Ana, `tipo = 'festivo'`, `desde = hasta = current_date + 14`, sin hora y con motivo `'Festivo local'` | `e0280003-…-000000000001` |
| Paciente de los martes | `k_lucia` con Ana: seis citas, `v_martes - 7*k` para k de 0 a 5, de 12:00 a 12:50 en `Europe/Madrid`, tipo `'Sesión individual'`, `estado = 'realizada'` (P4) | `e0280004-…-00000000000{1..6}` |
| Paciente sin citas | `k_diego`: ninguna fila. Se afirma solo con la consulta del criterio 19. | — |

- `v_martes := current_date - (((extract(isodow from current_date)::int - 2 + 6) % 7) + 1)` es el
  último martes **estrictamente** anterior a hoy.
- Bárbara (`k_baja`) no recibe franjas.

### 1.5 Bancos

**`scripts/rls/21-alta-de-cita.sql`**, nuevo (P1: confirmar que el 21 sigue libre).

Fijación:
- Se reutilizan PRO1 (CA, con pertenencia a CB por `06-centro.sql`), PRO2, P1 (asignado a PRO1),
  P2 (asignado a PRO2), TEC1 (CA), TEC2 (CB) y ADM.
- Como `postgres`:
  - `update perfiles set descanso_activo = true, descanso_minutos = 10 where id = :PRO1`;
  - tipos `TT21A` de 50 minutos, `TT21B` de 90 y `TT21X` de 50 con `activo = false`, con uuids
    `a2100001-…`.
- **Anclas en el año + 2** (`anio_21 = año actual + 2`). Así nada de los bancos 15-20 cae dentro
  (F16).
  - El domingo de marzo y el de octubre se calculan como en `16-series.sql:51-56`.
  - `lunes_21` es el primer lunes de mayo del `anio_21`.
- Franja de PRO1 (como `postgres`): `dia_semana = 1`, de 09:00 a 14:00, CA, `Europe/Madrid`,
  `desde = lunes_21`, `hasta = lunes_21 + 70`.
- Las variables que se usan para comparar se guardan con `\gset`.

Secciones:

| § | Criterio | Contenido |
|---|---|---|
| A | 4 (forma) | `pg_get_function_result('public.agenda_bloques_profesional(uuid,uuid,date,date,smallint)'::regprocedure) = 'TABLE(fecha date, hora_local time without time zone, inicio timestamp with time zone, fin timestamp with time zone, estado text)'`. Además, `has_function_privilege` de las cuatro públicas (authenticated sí, anon no), de `plan_alta_serie` y de los tres ayudantes (ni authenticated ni anon). |
| B | 3 | Como PRO1, `bloques(PRO1, CA, lunes_21, lunes_21, 50)` da exactamente 5 filas `libre` con `hora_local` 09:00, 10:00, 11:00, 12:00 y 13:00, y ninguna fila a las 14:00. Gemela del mutante «sin descanso»: con 0 de descanso saldrían 09:00, 09:50… |
| C | 4 | Como `postgres`, una cita de PRO1 en **CB** el `lunes_21 + 7` de 10:00 a 11:05 (rango `[10:00, 11:15)`). Como TEC1, sobre CA ese día: 09:00 `libre`, 10:00 `ocupado` y el siguiente `libre` a las **11:15**. Las 11:00, que es el paso normal, delatarían el mutante «sin salto». |
| D | 5 | **Festivo:** como `postgres`, un festivo de PRO1 el `lunes_21 + 14`. Ese día da 0 filas y la gemela del `lunes_21 + 21` da más de 0.<br>**Tope:** `(lunes_21, lunes_21 + 62)`, que son 63 días, da 22023 con `como mucho 62 días`. La gemela de 62 días entra.<br>**Otro centro:** TEC2 pidiendo CA da 42501 con `No autorizado para ver esta agenda`. La gemela con TEC1 da filas. |
| E | 6 | **Previsualización sin escritura:** se cuentan `citas`, `series_cita` y `propuestas_cita`, se llama a `previsualizar_alta` (serie semanal de lunes a las 10:00, 8 sesiones desde `lunes_21 + 28`, 50 minutos) y los tres recuentos son iguales.<br>**Preparación (como `postgres`):** un festivo en la 3.ª sesión; una cita de PRO1 en la 5.ª sesión a las 10:55. Así solo choca **por el descanso** de la cita nueva (10:50 + 10).<br>**Gemela de coherencia** (`crear_serie`, con la misma entrada, como PRO1, sin estricta):<br>- las fechas de `citas[]` son las sesiones con `bloqueo` nulo;<br>- cada `propuestas[]` tiene `(fecha, motivo)` igual a `(fecha, bloqueo)` del plan;<br>- `inicio_propuesto` y `fin_propuesto` de cada propuesta son `is not distinct from` la `alternativa` del plan.<br>Se compara con consultas sobre los dos jsonb guardados con `\gset`. |
| F | 7 | `previsualizar_alta`, suelta, en el `anio_21`:<br>- serie semanal de martes a las 12:00, 4 sesiones desde `domingo_marzo - 12`: todas a las 12:00 locales y `normal`;<br>- suelta a las 02:30 del domingo de marzo: `inexistente`;<br>- suelta a las 02:30 del domingo de octubre: `ambigua`;<br>- **festivo con alternativa:** la alternativa es a ≤ 7 días;<br>- **festivo sin alternativa:** festivo más una ausencia que cubre los días +1 a +7, y la alternativa es `null`. |
| G | 8 | `crear_serie` con 8 sesiones y `p_excluir = array[3.ª fecha]`: 7 citas, 0 propuestas de la serie, y `max(fecha local) = desde + 49`, que es el 8.º ordinal. Negativa: una fecha que no es de la serie da 22023 con `no es de la serie`. |
| H | 9 | Como `postgres`, una cita de PRO1 en la 1.ª sesión. Se cuentan las tres tablas, `crear_serie(…, p_estricta_primera => true)` da 23P01 con `La primera sesión choca` (`assert_lanza_codigo_msg`), y los tres recuentos no cambian. Con la 1.ª en festivo da 22023 con `primera sesión cae en festivo`. Gemela: la misma serie con la 1.ª libre entra. |
| I | 10 | Como PRO1, `crear_serie` (2 sesiones) y `crear_cita` con `p_sala => 'Sala 3'` y `p_nota_operativa => 'Traer informe'`. Como `postgres`, todas las citas de la serie y la suelta tienen las dos. Como TEC1, con nota, las dos funciones dan 42501 con `no escribe la nota operativa`. La gemela de TEC1 sin nota entra. |
| J | 11 | `crear_cita`:<br>- hora normal: `serie_id` nulo y `desviada = false`;<br>- 02:30 del domingo de marzo: `desviada` con `motivo_desviacion = 'anomalia_horaria'` e inicio local 03:00;<br>- festivo: 22023 con `tiene festivo o ausencia`;<br>- `current_date - 1`: 22023 con `anterior a hoy`;<br>- hoy a las 00:01: 22023 con `anterior a ahora`;<br>- hueco ocupado: 23P01;<br>- TEC2 en CA: 42501 con `No autorizado para dar esta cita`;<br>- PRO1 con P2: 42501 con `citar no crea el vínculo`.<br>Cada negativa lleva su gemela. |
| K | 12-13 | Las dos funciones (serie con `p_estricta_primera`):<br>- tipo nulo: 22023 con `Falta el tipo de terapia`;<br>- `gen_random_uuid()`: 22023 con `no existe en el catálogo`;<br>- `TT21X`: 22023 con `dado de baja en el catálogo`;<br>- gemela con `TT21A`: entra;<br>- `TT21B` con 50: 22023 con `no es la del tipo de terapia`;<br>- gemela de `TT21B` con duración nula: 90 minutos;<br>- **la aserción del criterio 13:** `count(*) from citas where tipo_terapia_id = :TT21B and fin - inicio <> interval '90 minutes'` da 0. |
| L | 14, 15 | Como TEC1:<br>- `crear_cita(P1, PRO1, CA, TT21A, …)` y `crear_serie(…TT21A…, 2 sesiones)`;<br>- como `postgres`, sus citas tienen `tipo_terapia_id = TT21A`;<br>- `position(:'TT21A' in resultado::text) = 0` en los dos resultados.<br>**H16:** como TEC1, `insert into public.citas` con los mismos datos y otra hora da 42501 con `row-level security`. La gemela es la `crear_cita` de arriba. |
| M | 16 | **H23, con C18TEC presente:**<br>- Como `postgres`, `huella := md5(string_agg(id \|\| coalesce(nota_operativa,'') \|\| coalesce(tipo_terapia_id::text,''), ',' order by id))` sobre **todas** las citas.<br>- Como TEC1, en un `do`: `update public.citas set nota_operativa = 'x'` sin `where`. `row_count` debe ser 0 **y sin excepción**.<br>- Lo mismo con `set tipo_terapia_id = :TT21A`.<br>- Como `postgres`, la huella es igual. |
| N | 17 | Como TEC1, `select tipo_terapia_id from public.series_cita` da 0 filas. La gemela, como ADM, da más de 0 filas sobre la serie de L (CA). |

En el mismo banco, las gemelas de rol del criterio 18 (§5): ADM y PRO1 siguen pudiendo
`insert` y `update … where id` directos sobre `citas` suyas.

**`scripts/rls/15-agenda.sql` §J** (solo esa sección):

- Se añaden, **antes** de la negativa existente, las mismas dos negativas H23 de 21-M: J-H23a
  (nota) y J-H23b (tipo).
- Cada una lleva la huella de `postgres` antes y después, y exige `row_count = 0` sin
  excepción.
- La negativa con `where` y la gemela de `agenda_actualizar_cita` se quedan como están.
- Texto exacto de la aserción J-H23a, que es **la primera que falla sin la migración**
  (criterio 2):
  `'H23 (T-028a): como técnico, UPDATE citas SET nota_operativa sin WHERE no cambia ninguna cita'`.

**`scripts/rls/17-vinculo-agenda.sql` §C** (solo esa sección):

- El `insert` directo de TEC1 se sustituye por:

  ```sql
  call pg_temp.como(:TEC1);
  select public.agenda_crear_cita(:P1, :PRO1, :CA, :TT4, :'f29'::date, time '13:00') as c29tec \gset
  call pg_temp.reset_sesion();
  ```

- La aserción pasa a usar `(:'c29tec')::uuid`. Su texto dice «por la función».
- La constante `C29TEC` de la línea 17 se queda sin usar. Se borra, si cuenta como parte de §C.
- `TT4` es de 50 minutos y está activo. Si no lo estuviera (P5), se pasa `p_duracion_minutos`
  nulo.

**`scripts/rls/README.md`**: fila del módulo 21.

### 1.6 Tipos y documentación

- `npm run tipos`, tras `db reset`, regenera `lib/supabase/tipos-bd.ts`.
- `lib/citas/series.ts` no se toca si compila (F17).
- `docs/architecture.md:184`, columna del técnico: «Todas, sin tipo de terapia; lo elige al dar la
  cita, solo por las funciones de alta (ADR-074)».
- Debajo de la matriz va un párrafo **«Puertas del técnico en agenda (ADR-074, T-028a)»**. Cuenta
  tres cosas:
  - H16, H23 y H24 quedan cerradas por política, y cómo;
  - la puerta abierta, H25 (auditoría propia, ticket aparte);
  - el residuo de C18TEC en `citas_lectura` (§Lo que no entra).

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado y por qué |
|---|---|---|
| D1 | Quitar la rama del técnico de `citas_alta`, `citas_modificacion` y `series_cita_lectura`, y recrearlas con el mismo nombre. | Revocar `insert`, `update` o `select` de tabla: rompe al administrador y al profesional, que comparten `authenticated` (criterio 18). Revocar columnas: no acota por rol (regla de `supabase.md`). Una marca de sesión en un disparador: se falsifica con `set_config`. |
| D2 | `agenda_crear_serie` se recrea con `drop function` y la firma de 11 argumentos más 4 parámetros con valor por defecto al final. | Una sobrecarga: PostgREST no distingue dos firmas con los mismos nombres y valores por defecto, y T-039 la multiplicaría. `create or replace` con otra firma crea una sobrecarga, no reemplaza. |
| D3 | Duración: se **rechaza** una distinta del tipo (22023). La nula toma la del tipo. | Ignorarla en silencio: el llamante creería haber pedido 50 y tendría 90. T-028 manda la del catálogo, así que el rechazo nunca salta en uso normal. |
| D4 | El tipo se valida siempre que no sea nulo. Es obligatorio en `crear_cita` y en la serie con estricta. | Obligarlo en toda serie: rompe unas 26 llamadas del banco 16 que el criterio 18 no deja tocar. Hoy todas pasan tipo, pero 22023 sobre tipo nulo en modo no estricto es pregunta C. |
| D5 | `for share` sobre la fila del tipo. | `for key share`, que toma ya la FK: no bloquea un `update … set activo = false` concurrente. |
| D6 | Ayudantes `alta_hueco_ocupado` y `alta_bloqueo_disponibilidad`, compartidos por el plan, las altas y los bloques. «Ocupado» es exactamente la restricción de F10. | Copiar el predicado en tres sitios: la previsualización y la materialización divergirían en el primer cambio. |
| D7 | El plan se calcula **una vez**, antes de escribir. `crear_serie` materializa lo que dijo el plan, sin reintentar el insert donde el plan vio ocupado. | Decidir sesión a sesión con el insert: la gemela de coherencia dependería del orden de escritura. |
| D8 | Estricta: el `ocupada` del plan da un 23P01 lanzado a mano. El insert de la 1.ª va sin `exception`, para la carrera. | Envolverla como las demás: dejaría una propuesta en vez de 23P01 (criterio 9). |
| D9 | La propuesta `ocupada` lleva la alternativa del plan. | Mantener el hueco ocupado (F9): confirmarla da siempre 23P01 y rompe la coherencia del criterio 6. |
| D10 | La alternativa excluye las fechas de la propia serie. | No excluirlas: una ausencia de una semana justa propone el hueco de la sesión siguiente. |
| D11 | `crear_cita` valida «hoy» en la zona del centro y además `inicio <= now()`. | Solo `current_date`: en Canarias, o a las 00:30, da por hoy un día que no es. |
| D12 | Los bloques no exigen vínculo. `crear_cita` no exige franja. | Exigir vínculo en los bloques: no hay paciente. Exigir franja en `crear_cita`: el contrato no lo pide y bloquearía las citas fuera de horario. |
| D13 | Banco 21, con anclas en el año + 2 y los actores de `01-fijacion`. | Un profesional nuevo en `auth.users`: más siembra sin ganar aislamiento, porque ningún banco siembra franjas (F16). |
| D14 | La primera aserción que muerde es J-H23a en `15-agenda.sql` (criterio 2). | Ponerla en el 21: el 15 corre antes y, sin la migración, J-H23a ya falla. |

## 3 · Cómo se cierra cada criterio de aceptación

**Generales**

| C | Cierre |
|---|---|
| 1 | Hay que pegar en la evidencia la salida de cada comando: `npx supabase db reset`, `npm run tipos` (sin diff tras regenerar), `npm run seed`, `npm run test:rls`, `npm run lint:migraciones`, `npm test`, `npm run build` y `node ~/.claude/pipeline/territorio.mjs T-028a`. |
| 2 | En un worktree, con los bancos y **sin** el fichero de migración: `npx supabase db reset && npm run test:rls`, que sale distinto de cero. Se pega la línea del fallo. Debe ser exactamente la aserción J-H23a de §1.5. Sin la migración, TEC1 cambia las notas de todas las citas de CA: `row_count > 0`. |

**Bloques, previsualización y altas**

| C | Cierre |
|---|---|
| 3 | 21-B. |
| 4 | 21-C, con salto a las 11:15, y 21-A con `pg_get_function_result`. |
| 5 | 21-D. |
| 6 | 21-E. |
| 7 | 21-F. |
| 8 | 21-G. |
| 9 | 21-H. |
| 10 | 21-I. |
| 11 | 21-J. |

**Tipo de terapia**

| C | Cierre |
|---|---|
| 12 | 21-K, con cuatro fragmentos. |
| 13 | 21-K, aserción de «no existe la cita de 50». |
| 14 | 21-L. |

**Puertas del técnico**

| C | Cierre |
|---|---|
| 15 | 21-L (H16) y 17 §C reescrita. |
| 16 | 21-M y 15-§J. Huella como `postgres` y `row_count = 0` **sin excepción** (ver R2). |
| 17 | 21-N. La aserción de `information_schema` sobre `citas_agenda` (`15-agenda.sql:371-393`) no se toca. |
| 18 | `test:rls` en verde **sin cambiar ninguna aserción** de las secciones de administrador y profesional de 15, 16 y 17. El diff de esos ficheros solo muestra 15-§J y 17-§C: se comprueba con `git diff main -- scripts/rls/15-agenda.sql scripts/rls/16-series.sql scripts/rls/17-vinculo-agenda.sql`. Además van las gemelas de rol de 21. |

**Siembra y documentación**

C19 se cierra tras `npx supabase db reset && npm run seed`, como `postgres`
(`docker exec … psql -U postgres`). Hay que pegar la salida de cada consulta, y después la de
`npm run verificar:huellas` («cadena íntegra»). Las columnas de `perfiles` están por confirmar
(P2).

```sql
-- 19.a  literal del contrato → 20
select count(*) from public.disponibilidad where tipo = 'franja';
-- 19.a' por profesional activo → cada fila: franjas = 10, dias = 5, min_dia = 1, max_dia = 5
select p.id, count(d.id) as franjas, count(distinct d.dia_semana) as dias,
       min(d.dia_semana) as min_dia, max(d.dia_semana) as max_dia
  from public.perfiles p
  left join public.disponibilidad d on d.perfil_id = p.id and d.tipo = 'franja'
 where p.rol = 'profesional_sanitario' and p.estado = 'activo'
 group by p.id;
-- 19.b  → ≥ 1
select count(*) from public.disponibilidad
 where tipo = 'festivo' and desde > current_date and desde <= current_date + 56;
-- 19.c  → 6 | 6
select count(*) filter (where fin < now()
                          and extract(isodow from inicio at time zone zona_horaria) = 2
                          and (inicio at time zone zona_horaria)::time = time '12:00') as martes_12,
       count(*) as total
  from public.citas where paciente_id = 'd0080001-0000-4000-8000-000000000001';
-- 19.d  → 0
select count(*) from public.citas where paciente_id = 'd0080001-0000-4000-8000-000000000002';
-- 19.e  → ≥ 3 | ≥ 2
select count(*), count(distinct duracion_minutos) from public.tipos_terapia where activo;
-- 19.f  → ≥ 1
select count(*) from public.tipos_terapia where not activo;
```

C20: la salida de `grep -n "ADR-074" docs/architecture.md` muestra la línea de la matriz (~184)
y la del párrafo.

## 4 · Riesgos, por probabilidad

1. **Alta: C18TEC hace fallar el criterio 16** si se elige la opción B de la pregunta A. TEC1 es
   `profesional_id` de C18TEC, y la rama sin rol le deja actualizarla: `UPDATE 1`. Con la opción
   A no pasa. Con la B, 21-M tiene que cambiar a «ninguna cita con `profesional_id <> TEC1`» y
   C18TEC se anota en `state.md`.
2. **Alta: falso verde de la negativa del tipo.** `set tipo_terapia_id` sin `where`, sobre una cita
   pasada, **lanza** 42501 por F13 aunque la política deje pasar. Si la prueba aceptara «lanza
   error», pasaría sin la migración. Por eso 15-§J y 21-M exigen `row_count = 0` **sin
   excepción**.
3. **Media: el cambio de `ocupada` y de la alternativa** (D9, D10 y el descanso en D6) altera
   propuestas del banco 16. Por lectura, las aserciones de `16-series.sql:230-275` solo miran el
   estado y el recuento, y §F mira la alternativa de festivo al día +1. Si alguna se rompe, **no
   se toca la aserción** (criterio 18): se vuelve al diseño.
4. **Media: el gist frente al plan.** Si el descanso se calcula distinto en el plan y en el
   disparador, la previsualización dice «libre» y el insert choca. La sección 21-E con la cita a
   las 10:55 lo detecta.
5. **Media: T-035 cambia algo leído aquí** (P0). Se re-verifican F1-F4 y F9 antes de empezar.
6. **Baja: `for share` sobre `tipos_terapia`** exige `UPDATE` al dueño. `postgres` no es
   superusuario (P6).
7. **Baja: franjas solapadas** del mismo profesional y día emitirían bloques duplicados. Ni la
   siembra ni los bancos las tienen; queda fuera.

## 5 · Qué revisar

**Puertas**
- [ ] Ninguna de las tres políticas recreadas conserva una rama `tecnico_administrativo`. Su nombre
  no cambia: `11-cobertura.sql` sin diff.
- [ ] Con la opción A, el conjuntivo de rol del profesional va en `using` **y** en `with check` de
  `citas_modificacion`. Los `grant` de tabla siguen iguales (`\dp public.citas`).
- [ ] Puertas que quedan por otra vía, una por una:
  - `insert` y `update` directos: no;
  - `agenda_actualizar_cita`: no admite tipo ni nota;
  - `confirmar_propuesta`: copia el tipo de la serie que eligió el propio técnico;
  - `citas_agenda`: sin columna;
  - `series_cita`: sin lectura;
  - `agenda_citas_rango`: la rama del técnico va por `citas_agenda`;
  - `auditoria`: **H25 abierta y anotada**.
- [ ] TRUNCATE y DELETE sobre `citas` siguen imposibles para `authenticated`. No se ha añadido
  ningún grant.

**Lo que elige el llamante**
- [ ] `p_profesional_id`: rama del profesional y A3. ¿Puede un técnico pasar su propio uid y saltarse
  el centro? Sí, con citas a su nombre: es la pregunta D.
- [ ] `p_centro_id` decide la rama del técnico.
- [ ] `p_tipo_terapia_id`: T0-T2 con `for share`.
- [ ] `p_duracion_minutos`: D1. Duración nula sin tipo da 22023.
- [ ] `p_nota_operativa` da 42501 al técnico **incluso con `''`**.
- [ ] `p_excluir`: nulos dentro, fechas ajenas y «todas excluidas».
- [ ] `p_estricta_primera`: el insert de la 1.ª va **sin** `exception`.

**Funciones**
- [ ] Orden en cada función: rol, autorización, vínculo y nota del técnico **antes** de cualquier
  cotejo de tipo, fecha o disponibilidad. Ningún mensaje filtra otra cita.
- [ ] `plan_alta_serie` y los tres ayudantes tienen `has_function_privilege('authenticated', …,
  'execute') = false`.
- [ ] `agenda_bloques_profesional`:
  - toda tabla lleva alias;
  - `estado` solo toma `libre` u `ocupado`;
  - el salto va al **mayor** límite superior, no al paso normal;
  - la ausencia parcial se mira con `[cursor, cursor + dur)` y la cita con descanso.
- [ ] Existe una sola `agenda_crear_serie` (`select count(*) from pg_proc where proname =
  'agenda_crear_serie'` da 1) y una sola `agenda_crear_cita`. Se han hecho de nuevo el `comment`,
  el `revoke` y el `grant`.
- [ ] Ningún mensaje nuevo contiene un fragmento de F18. Ningún 42501 nuevo contiene «pasada».

**Pruebas**
- [ ] Toda negativa usa `assert_lanza_codigo_msg` con su fragmento y tiene gemela.
- [ ] Los mutantes que deben fallar, y dónde:

  | Mutante | Falla en | Por qué |
  |---|---|---|
  | M1 · sin conjuntivo de rol | 21-M | C18TEC cambia |
  | M2 · rama del técnico en `citas_alta` | 21-L H16 | el insert entra |
  | M3 · rama en `series_cita_lectura` | 21-N | da filas |
  | M4 · paso normal en vez de salto | 21-C | 11:00 en vez de 11:15 |
  | M5 · plan sin descanso | 21-E | coherencia en la 5.ª sesión |
  | M6 · sin T2 | 21-K | el inactivo entra |
  | M7 · sin A4 | 21-I | la nota del técnico entra |
  | M8 · excluir antes de generar | 21-G | la última cae en el 7.º ordinal |
  | M9 · estricta con `exception` | 21-H | no hay 23P01 |

  El implementador prueba al menos M1, M2, M4 y M5 a mano y pega el fallo.
- [ ] La siembra se puede ejecutar dos veces sin error, por los `on conflict`. `verificar:huellas`
  sigue íntegra.

## 6 · Territorio

Es el del contrato, sin ampliar:

- `supabase/migrations/20261005120000_base_del_alta_de_cita.sql`
- `supabase/seed-completo.sql`
- `scripts/rls/21-alta-de-cita.sql`
- `scripts/rls/15-agenda.sql` (solo §J)
- `scripts/rls/17-vinculo-agenda.sql` (solo §C, más la constante de la línea 17 si se borra)
- `scripts/rls/README.md`
- `lib/supabase/tipos-bd.ts`
- `docs/architecture.md`

Se prevé **no** tocar `16-series.sql`, `11-cobertura.sql` ni `lib/citas/series.ts`.

Al cerrar van además `docs/state.md` y `docs/bitacora/T-028a.md`, por la constitución 4.
`docs/**` es de la fábrica.

## 7 · Delegable

Solo lo que no tiene comportamiento: las filas de la siembra de §1.4 (tipos, franjas, festivo y
las seis citas, con los uuids dados) y la fila del README. Todo lo demás es RLS, funciones definer
o pruebas de permisos, y queda en la fábrica.

## Preguntas para el propietario

- **A · El técnico como «profesional» de una cita (C18TEC).** La rama `profesional_id = uid` de
  `citas_modificacion` y `citas_alta` no mira el rol. Un técnico que figure como profesional de
  una cita puede editarla directamente, nota y tipo incluidos.
  - **Recomendación:** añadir `rol_actual() = 'profesional_sanitario'` a esa rama en las tres
    políticas recreadas. Para el administrador y el profesional no cambia nada. Contradice la
    letra «las ramas del profesional no cambian», y por eso se pregunta.
  - **Alternativa:** dejarla y acotar 21-M a `profesional_id <> TEC1`, con un hallazgo en
    `state.md`.
- **B · Estricta con la 1.ª sesión en festivo o ausencia.** El contrato solo dice «si choca:
  23P01».
  - **Recomendación:** 22023 con un fragmento propio, sin crear nada. Es lo mismo que hace
    `crear_cita` en festivo.
  - **Alternativa:** crearla como propuesta, igual que en el modo no estricto.
- **C · Tipo nulo en una serie no estricta.**
  - **Recomendación:** se admite, como hoy, para no tocar el banco 16. Si viene, el tipo se valida
    siempre. T-028 siempre llama con estricta.
  - **Alternativa:** obligarlo siempre, reescribiendo llamadas del banco 16. Eso choca con el
    criterio 18.
- **D · Validar que `p_profesional_id` es un profesional o un administrador activo.**
  - **Recomendación:** fuera de T-028a, anotado en `state.md`. Es lo que permite filas como
    C18TEC.

## Por confirmar al implementar

- **P0:** con T-035 integrado, re-verificar F1-F4, F9 y F21:
  - `git log main`;
  - `grep -ln agenda_crear_serie supabase/migrations/*.sql | tail -1`;
  - que el sello `20261005120000` sigue siendo el siguiente.
- **P1:** el número de banco 21 sigue libre (`ls scripts/rls`).
- **P2:** los nombres de las columnas de rol y estado en `perfiles`
  (`20260815192424_base_perfiles_pacientes_auditoria.sql`) para la consulta 19.a'.
- **P3:** el centro de Bruno en `supabase/seed-completo.sql` (pertenencias), para el `centro_id` y
  la `zona_horaria` de sus franjas.
- **P4:** los `check` de `disponibilidad` (festivo sin `dia_semana` ni horas) y los de `citas`
  para `estado = 'realizada'` (columnas `marcada_realizada_*` obligatorias o no), en
  `20260906120000_agenda_esquema.sql`.
- **P5:** que `TT4` (`17-vinculo-agenda.sql`) es de 50 minutos y está activo.
- **P6:** que `postgres` conserva `UPDATE` sobre `tipos_terapia`, para `for share` (`\dp
  public.tipos_terapia`).
- **P7:** que los textos de `16-series.sql` §K siguen casando con `'No autorizado para crear esta
  serie.'`.

## Lo que no entra, y por qué

- **T-039** (`p_modalidad_asistencia`, `p_episodio_id`, ADR-075): su propio ticket. Las firmas ya
  lo admiten añadiendo parámetros al final.
- **H25** (el técnico lee el tipo en sus filas de `auditoria`): el propietario lo dejó fuera en Q1.
- **El residuo de C18TEC en `citas_lectura`**: el banco 18 R1b afirma que TEC1 lo lee, y el 18 no
  es territorio. Se anota.
- **La pregunta D**, `lib/citas/alta.ts`, Zod y la pantalla: son T-028.
- **El catálogo en Ajustes.**
- **Cambiar el tipo de una cita existente.**
- **Franjas solapadas.**
- **Exigir franja en `crear_cita`.**
- **Previsualizar una serie por `fin_el`**: el contrato solo pide sesiones.
