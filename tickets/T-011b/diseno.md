# T-011b · Diseño — editar una serie «desde esta cita»

Contrato: `tickets/T-011b-editar-serie-desde-la-cita.md`. Riesgo alto: es la cadena de series y
propuestas (ADR-034). El diseño cierra H8 y H9 de `tickets/T-014/diseno.md` §0 sin romper el
principio «nada se recalcula solo». Tampoco cambia ninguna tabla: la migración redefine
funciones, añade cinco y retira un privilegio de tabla.

**Enmienda por el ADR-068 (24-09-2026).** El propietario respondió las tres preguntas de la
primera versión, y esta versión las incorpora:

1. **Propuestas viejas**: siguen en «Por confirmar» y se rechazan al confirmarlas, con `22023` y
   su motivo legible. Queda cerrado como decisión (D4), no como pregunta.
2. **`UPDATE` directo**: se retira el `update` de `authenticated` sobre `series_cita` en esta
   misma migración (§1.0). La regla solo cambia por `agenda_editar_serie`. Criterio 11 reescrito.
3. **Mensual y diálogo de T-014**: la regla es la de `ocurrencias_serie` (mismo ordinal que la
   fecha de destino y, si el mes no lo tiene, el último de ese día). La base expone **antes de
   confirmar** en qué se convierte la serie con una función de solo lectura,
   `agenda_previsualizar_edicion_serie` (§1.10, criterio 16). «Mantener la serie» es mover solo
   esa cita con `esta`, que ya existe (D14).

Nombre: en `minimax/alcance.json:154` y `minimax/cortes/T-011.md:16` existe un «T-011b» antiguo,
la rama `T-011b-acciones-series` del reparto a tres del 29-08. Es historia y no tiene contrato en
`tickets/`. `territorio.mjs` solo busca en `tickets/`, así que el nombre no choca con la
comprobación. Se anota como hallazgo en §8.

---

## 0 · Hechos verificados contra el código

Migración de T-011: `supabase/migrations/20260910120000_series_materializacion_desviaciones.sql`
(en adelante, **M11**). Ninguna migración posterior redefine sus funciones de series (se buscó
cada nombre en `supabase/migrations/*.sql`).

**Series y citas**

| # | Hecho | Dónde |
|---|---|---|
| F1 | `series_cita` guarda `periodicidad` (`semanal`/`quincenal`/`mensual`), `dia_semana` ISODOW 1-7, `hora_local time`, `zona_horaria`, `duracion_minutos` (5-480), y `sesiones_totales` xor `fin_el`. No guarda la fecha de inicio: la serie **se materializa entera al crearse** y ninguna ocurrencia futura depende de la regla. | `20260906120000_agenda_esquema.sql:130-156`; M11 `agenda_crear_serie` 564-779 |
| F2 | `authenticated` tiene hoy `update` sobre `series_cita` (política `series_cita_modificacion`: administrador o profesional dueño). Ninguna línea de `lib/`, `app/` ni `components/` actualiza `series_cita` directamente: la única escritura de la aplicación es `agenda_editar_serie`. El ADR-068 retira ese `update` (F21-F23, §1.0). | `…agenda_esquema.sql`, grants; grep |
| F3 | `citas_desviacion_ck`: `desviada = (motivo_desviacion is not null)`. | `…agenda_esquema.sql:202` |
| F4 | La exclusión `citas_sin_solape_profesional` da `23P01` en `programada/confirmada/realizada`. | `…agenda_esquema.sql` |

**Disparadores**

| # | Hecho | Dónde |
|---|---|---|
| F5 | `fn_proteger_cita_pasada()` actúa **solo si `old.fin <= now()`**. No impide mover una cita futura al pasado (H5 de T-014), ni mover una cita **en curso** (`inicio <= now() < fin`). | M11 336-389 |
| F6 | `fn_marcar_cita_desviada()` (`before update of inicio, fin, zona_horaria`). Sin la marca `app.agenda_origen = 'serie'`, pone `desviada = true` y `motivo = 'reprogramada'` si no tenía. **Con** la marca, deja `NEW` como viene, así que un `desviada = true, motivo_desviacion = 'anomalia_horaria'` explícito en el mismo `UPDATE` sobrevive. | M11 391-428 |
| F7 | `fn_evento_zona_centro()` (`after update of zona_horaria on centros`) mete en la carga **todas** las futuras `programada/confirmada` del centro, **desviadas incluidas**. La carga es `centro_id`, `zona_horaria_anterior`, `zona_horaria_nueva` y `citas_afectadas`. | M11 435-483 |
| F8 | `fn_evento_regla_serie()` (`after update of dia_semana, hora_local, duracion_minutos, zona_horaria on series_cita`) vuelve pronto si ninguna de las cuatro cambia. **H8**: recoge `serie_id = new.id and inicio > now() and estado in (programada, confirmada) and desviada = false`, sin ancla. Publica el id del evento en `app.agenda_evento_regla` (arreglo L.2 de T-011). | M11 485-549; H8 en 503-509 |

**Funciones de agenda**

| # | Hecho | Dónde |
|---|---|---|
| F9 | `agenda_editar_serie(p_cita_id, p_alcance, p_estado, p_sala, p_inicio, p_fin, p_dia_semana, p_hora_local, p_duracion_minutos, p_zona_horaria) returns jsonb`. `esta` delega en `agenda_actualizar_cita`. `esta_y_siguientes` comprueba autorización, da `22023` si la cita es suelta, limpia `app.agenda_evento_regla`, hace `update series_cita set` de las cuatro columnas con `coalesce` y llama a `agenda_propuestas_de_evento`. **No mira si la cita ancla es pasada, está en curso, desviada o cancelada.** | M11 867-962 |
| F10 | `agenda_propuestas_de_evento(p_evento_id)`. **H9**: en `regla_serie_cambiada`, `v_local = fecha_local_de_la_cita + hora_nueva` y `fin = instante + (cita.fin - cita.inicio)`. Conserva la fecha y la duración **de la cita**. Es idempotente por `(evento_id, cita_id)`, se salta las citas no autorizadas y marca el evento `entregado`. **No mira si el instante calculado ya ha pasado.** | M11 968-1076; H9 en 1033-1046 |
| F11 | `agenda_confirmar_propuesta(p_propuesta_id) returns uuid`. Comprueba autorización, `pendiente` y que la propuesta tenga hora. Con `cita_id`, mueve la cita con la marca de origen. Sin ella, inserta una cita desviada con `tipo_terapia_id` de la serie. **No bloquea filas ni comprueba** si la cita es pasada, en curso, cancelada, desviada después de proponer o movida por otra propuesta, ni si la regla o la zona siguen siendo las del evento, ni si `inicio_propuesto` ya pasó. | M11 1082-1182 |
| F12 | `resolver_hora_local(zona, local)` es determinista: hueco → primer instante válido por bisección de 1 s, marcado `inexistente`; solape → el menor, marcado `ambigua`. Lanza `22023` con una zona no IANA. | M11 170-245 |
| F13 | `ocurrencias_serie`, en la rama mensual, usa el ordinal `((día - 1) / 7) + 1` del día de la semana y recorta al último si el mes no lo tiene (`- 7`). | M11 254-323 |
| F14 | `agenda_cancelar_cita(…, 'esta_y_siguientes')` **ya** parte de la cita elegida (`c.inicio > v_cita.inicio`). La edición es la única rama de serie sin ancla. | M11 785-861 |

**Permisos y banco**

| # | Hecho | Dónde |
|---|---|---|
| F15 | Grants: `revoke execute … from public` y `grant … to authenticated` por firma. No hay `alter default privileges` para funciones, así que Supabase concede `EXECUTE` a `anon`/`authenticated` en las funciones nuevas si no se revoca a mano. | M11 1238-1278; `20260822094547_…:1593-1603` solo tablas y secuencias |
| F16 | `lint-migraciones` prohíbe `drop table`, `drop column`, `drop type` y `alter column … type` sin anuncio. **No** marca `drop function`. Regla 6: una migración que ya está en `main` no se edita. | `scripts/lint-migraciones.ts:217-224, 360-390` |
| F17 | Banco `16-series.sql`: la sección G (criterio 4 de T-011) edita desde la **primera** cita, con la segunda desviada, y comprueba que la desviada no recibe propuesta. L.2 hace dos ediciones (16:00, 17:00) desde la primera, **sin confirmar**. Las anclas son `domingo_marzo`/`domingo_octubre` del año que viene. §D y §E dejan citas de PRO1 a las 02:30/03:00 en esos domingos. | `scripts/rls/16-series.sql:47-64, 93-150, 279-345, 559-687` |
| F18 | `17-vinculo-agenda.sql` §E confirma **como PRO1** una propuesta `festivo` sin cita e insertada a mano (`evento_id` nulo) y espera **`42501`** del disparador de vínculo. Toda guarda nueva que corra antes del `insert` y dé otro código la rompería. | `scripts/rls/17-vinculo-agenda.sql:168-200` |

**TypeScript**

| # | Hecho | Dónde |
|---|---|---|
| F19 | `esquemaEditarSerie` tiene dos `refine`: con `esta`, nada de regla; con `esta_y_siguientes`, ni `estado`, ni `sala`, ni `inicio`, ni `fin`. `FECHA_ISO` es una constante privada del mismo fichero. No hay ningún validador de fecha de calendario exportado en `lib/fechas/` (el de T-014 aún no existe). | `lib/citas/esquemas.ts:20, 76-111` |
| F20 | `editarSerie` pasa los diez `p_*` a la RPC y devuelve `{ alcance, propuestaIds }`. Los errores salen de `mapearErrorCitas`, que convierte todo `22023` en `parametro_invalido`. | `lib/citas/series.ts:97-123`; `lib/citas/errores.ts:12-23` |

**Enmienda ADR-068**

| # | Hecho | Dónde |
|---|---|---|
| F21 | El privilegio sale de `grant select, insert, update on table public.series_cita to authenticated`, después de un `revoke all … from public, anon, authenticated, service_role` sobre las tablas de agenda. `service_role` y `anon` no tienen nada. Ninguna migración posterior vuelve a conceder ni a revocar sobre `series_cita` (grep de `grant`/`revoke`/`policy` con `series_cita` en `supabase/migrations/*.sql`). | `20260906120000_agenda_esquema.sql:846-855` |
| F22 | La política `series_cita_modificacion` (`for update to authenticated`) está declarada en el arreglo de `scripts/rls/11-cobertura.sql:26`. Ese módulo falla si una política declarada desaparece de `pg_policies`. `series_cita_alta` se redefinió en T-011a. | `…agenda_esquema.sql:769`; `11-cobertura.sql:15-80`; `20260911120000_vinculo_en_el_alta_de_agenda.sql:54-66` |
| F23 | Grep de `series_cita` en `lib/`, `app/`, `components/` y `scripts/`: **nada hace un `update` directo desde el cliente**. `lib/citas/esquemas.ts` y `esquemas.test.ts` solo la nombran en comentarios; `lib/supabase/tipos-bd.ts` es generado; `scripts/rls/15-agenda.sql`, `16-series.sql` y `17-vinculo-agenda.sql` insertan como `postgres` y leen; `11-cobertura.sql` nombra políticas. El único `UPDATE` de la base está dentro de `agenda_editar_serie` (`security definer`, M11 935). Ninguna aserción del banco comprueba hoy los privilegios de tabla de `series_cita`. El mensaje de Postgres para una tabla sin privilegio ya se usa como referencia en el banco: «permission denied for table …». | grep; `scripts/rls/13-cuentas.sql:390` |
| F24 | **No existe nada que describa la regla resultante.** `ocurrencias_serie` genera fechas al crear la serie, no recibe ancla y no devuelve el ordinal. `fecha_en_regla_nueva` y `calcular_propuesta_de_evento` son nuevas en este ticket. Además, `ocurrencias_serie` **recalcula el ordinal desde la fecha anterior**, así que tras un recorte (5.º → último, que es el 4.º) la serie sigue en el 4.º los meses siguientes, aunque tengan quinto (hallazgo 5 de §8). | M11 254-323; recálculo en 309-316 |
| F25 | `agenda_editar_serie` autoriza `esta_y_siguientes` con: administrador, profesional de la cita (`auth.uid()`), o técnico administrativo con la cita en `centros_actuales()`. Sin perfil, `42501` «No hay sesión activa con perfil.»; sin cita o ajena, `42501` «La cita no existe o no es tuya.». La cita suelta da `22023` «La cita no pertenece a una serie…». | M11 891-924 |

---

## 1 · Piezas y contratos

Una sola migración nueva: `supabase/migrations/<AAAAMMDDHHMMSS>_editar_serie_desde_la_cita.sql`.
El sello es posterior a la última migración de `main` al fusionar, porque T-012b tiene una en
vuelo. La migración **no** crea tablas ni columnas ni toca enums, así que no hay relleno.

Las funciones van en el orden de esta sección, porque cada una usa las anteriores. La
previsualización (§1.10) va después de §1.6 y antes del bloque de permisos (§1.7).

### 1.0 · Retirar el `UPDATE` directo sobre `series_cita` (ADR-068, punto 2)

```
revoke update on table public.series_cita from authenticated;
```

- **Solo `update`.** `select` e `insert` se quedan como están (F21). El `insert` directo es otra
  puerta, y no la pide el ADR (hallazgo 6 de §8).
- **La política `series_cita_modificacion` no se borra** (F22, D13). Queda dormida: sin el
  privilegio, Postgres rechaza el `UPDATE` con `42501` «permission denied for table series_cita»
  antes de mirar las políticas. Se le añade:
  `comment on policy series_cita_modificacion on public.series_cita is 'Dormida desde T-011b
  (ADR-068): authenticated no tiene UPDATE sobre la tabla y la regla solo cambia por
  agenda_editar_serie (security definer). Se conserva porque 11-cobertura la declara y para que
  un grant futuro no abra la tabla sin filtro.'`
- `agenda_editar_serie` es `security definer` y corre como el dueño de la tabla, que conserva el
  privilegio. No cambia nada para ella.
- Tras el revoke, el camino sin ancla del disparador (§1.3) solo lo recorre quien sea dueño de la
  tabla: `postgres` en una migración, en una operación manual o en el banco. Se mantiene (D13).

### 1.1 · `public.fecha_en_regla_nueva` (nueva, pura)

```
fecha_en_regla_nueva(
  p_periodicidad  public.periodicidad_serie,
  p_fecha_cita    date,
  p_dia_semana    smallint,         -- ISODOW 1-7 de la regla nueva
  p_fecha_origen  date default null, -- fecha local actual de la cita ancla
  p_fecha_destino date default null  -- fecha local nueva de la cita ancla
) returns date
language plpgsql immutable set search_path = ''
```

- `22023` si `p_dia_semana` está fuera de 1-7, o si viene uno de los dos `p_fecha_origen` /
  `p_fecha_destino` sin el otro.
- `lunes(d) := d - (extract(isodow from d)::int - 1)`.

**`semanal` y `quincenal`.** La cita conserva **su semana relativa** y toma el día nuevo:

```
lunes(p_fecha_cita)
  + coalesce(lunes(p_fecha_destino) - lunes(p_fecha_origen), 0)
  + (p_dia_semana - 1)
```

- Sin ancla, cada cita queda en su propia semana ISO.
- Con ancla, todas se desplazan tantas semanas como la ancla.
- La ancla cae **exactamente** en `p_fecha_destino`.
- La paridad de la quincenal se conserva, porque el desplazamiento es el mismo para todas.

**`mensual`.** `ord(d) := ((extract(day from d)::int - 1) / 7) + 1` y
`meses(d) := extract(year from d)*12 + extract(month from d)`.

- `mes_base := date_trunc('month', p_fecha_cita)::date`, más
  `make_interval(months => meses(destino) - meses(origen))` si hay ancla.
- `n := ord(p_fecha_destino)` con ancla, u `ord(p_fecha_cita)` sin ella.
- `cand := mes_base + ((p_dia_semana - isodow(mes_base) + 7) % 7) + (n - 1) * 7`.
- Si `cand` se sale del mes de `mes_base`, `cand - 7`. Es el mismo recorte que F13.
- Con ancla, la ancla cae exactamente en `p_fecha_destino`: es el `n`-ésimo de su día en su mes.

**Propiedad que se prueba y que usa §1.4.** Con ancla, toda cita posterior a la ancla cae en una
fecha `>= p_fecha_destino`.

- Semanal y quincenal: `lunes(cita) >= lunes(origen)`.
- Mensual: el mes es `>=`, y si es el mismo mes, es la propia ancla.

Todo es aritmética de `date`, sin instantes: un día de 23 o 25 h no la toca. La hora se resuelve
después, por fecha, con `resolver_hora_local`.

### 1.2 · `public.calcular_propuesta_de_evento` (nueva, única fuente del cálculo)

```
calcular_propuesta_de_evento(p_tipo text, p_carga jsonb, p_cita public.citas)
returns table (fecha date, hora time, zona text, inicio timestamptz, fin timestamptz, clasificacion text)
language plpgsql stable set search_path = ''   -- security invoker
```

Todas las tablas del cuerpo llevan alias (regla de `out` ambiguo).

**`agenda.zona_centro_cambiada`.** Es el comportamiento de hoy, sin cambios:

- `zona := carga->>'zona_horaria_nueva'`;
- `local := p_cita.inicio at time zone p_cita.zona_horaria`;
- se resuelve `local` en `zona`;
- `fin := inicio + (p_cita.fin - p_cita.inicio)`.

**`agenda.regla_serie_cambiada`.**

- `zona := carga->>'zona_horaria'`.
- `periodicidad := coalesce((carga->>'periodicidad')::periodicidad_serie, <periodicidad de la serie carga->>'serie_id'>)`. El `coalesce` cubre los eventos anteriores a esta migración, que no la llevan.
- `fecha := fecha_en_regla_nueva(periodicidad, (p_cita.inicio at time zone p_cita.zona_horaria)::date, (carga->>'dia_semana')::smallint, (carga->>'fecha_origen')::date, (carga->>'fecha_destino')::date)`. `->>` de un `null` JSON da `NULL`, que es el caso sin ancla.
- `hora := (carga->>'hora_local')::time`.
- Se resuelve `fecha + hora` en `zona`.
- **`fin := inicio + make_interval(mins => (carga->>'duracion_minutos')::int)`**. Esto cierra H9 en la duración.

**Cualquier otro tipo.** `22023`.

La función devuelve los valores **en bruto**: no mira el reloj. Qué hacer con un instante pasado
lo deciden quienes la llaman (§1.5, §1.6 y §1.10).

### 1.2a · `public.citas_afectadas_por_regla` (nueva, interna)

```
citas_afectadas_por_regla(p_serie_id uuid, p_desde_cita_id uuid default null)
returns table (cita_id uuid)
language sql stable set search_path = ''   -- security invoker
```

Es el conjunto de H8 escrito una vez, para el disparador (§1.3) y para la previsualización
(§1.10):

```
select c.id
  from public.citas c
 where c.serie_id = p_serie_id
   and c.inicio > now()
   and c.estado in ('programada', 'confirmada')
   and c.desviada = false
   and (p_desde_cita_id is null
        or c.inicio >= (select a.inicio from public.citas a where a.id = p_desde_cita_id))
 order by c.inicio, c.id
```

- Con `p_desde_cita_id` nulo es el predicado de T-011 (F8), el camino sin ancla.
- Un `p_desde_cita_id` que no existe da el conjunto vacío (`>= null`). Nunca pasa: quien la llama
  ya ha leído la cita.
- Es `invoker`, y sus dos llamantes son `definer`, así que corre como el dueño. No se concede a
  nadie (§1.7).

### 1.2b · `public.plan_edicion_serie` (nueva, interna)

```
plan_edicion_serie(
  p_cita public.citas, p_serie public.series_cita,
  p_fecha date, p_dia_semana smallint, p_hora_local time,
  p_duracion_minutos smallint, p_zona_horaria text)
returns jsonb
language plpgsql stable set search_path = ''   -- security invoker
```

Es la validación de la ancla y el cálculo de la regla nueva, en un solo sitio para
`agenda_editar_serie` (§1.4) y `agenda_previsualizar_edicion_serie` (§1.10).

- **Cuerpo**: los pasos 2 a 5 de §1.4, en ese orden y con esos mismos mensajes. No lee tablas ni
  bloquea: recibe las filas ya leídas.
- **No autoriza.** Los dos llamantes autorizan y descartan la cita suelta antes de llamarla.
- **Retorno.** Un `jsonb` con **las mismas claves que la carga del evento**, para que
  `calcular_propuesta_de_evento('agenda.regla_serie_cambiada', plan, cita)` lo acepte tal cual:
  ```
  { serie_id, periodicidad, dia_semana, hora_local, duracion_minutos, zona_horaria,
    desde_cita_id, fecha_origen, fecha_destino, cambia }
  ```
  - `dia_semana`, `hora_local` y `zona_horaria` son `v_dia`, `v_hora` y `v_zona` de §1.4.
  - `duracion_minutos = coalesce(p_duracion_minutos, p_serie.duracion_minutos)`.
  - `cambia` es verdadero si las cuatro columnas nuevas difieren de las de `p_serie` (con
    `is distinct from`) **o** `fecha_origen <> fecha_destino`. Es la negación exacta del retorno
    temprano del disparador (§1.3.2): `cambia = false` si y solo si la edición no crearía evento.
- Los valores se construyen con `jsonb_build_object` desde los mismos tipos que usa el disparador
  (`time`, `date`, `smallint`), así que la carga del evento y el plan escriben igual cada campo.
- No se concede a nadie (§1.7).

### 1.3 · `fn_evento_regla_serie()` (`create or replace`, mismo disparador)

El ancla la publica `agenda_editar_serie` en un GUC local a la transacción:

- `app.agenda_regla_ancla` = texto de
  `jsonb {serie_id, desde_cita_id, fecha_origen, fecha_destino}`.

Pasos del disparador:

1. `v_ancla := nullif(current_setting('app.agenda_regla_ancla', true), '')::jsonb`. Si
   `v_ancla->>'serie_id' is distinct from new.id::text`, se anula: un ancla de otra serie no
   cuenta.
2. **Retorno temprano**. Vuelve pronto si las cuatro columnas no cambian **y** además
   (`v_ancla is null` **o** `fecha_origen = fecha_destino`). Sin esa segunda condición, arrastrar
   al mismo día de la semana de otra semana no crearía evento.
3. **Conjunto (H8)**. Sale de §1.2a:
   ```
   select coalesce(jsonb_agg(a.cita_id order by a.n), '[]'::jsonb)
     from public.citas_afectadas_por_regla(new.id, (v_ancla->>'desde_cita_id')::uuid)
          with ordinality as a(cita_id, n)
   ```
   El ancla entra (es `>=`). Las desviadas, pasadas y en curso quedan fuera como hoy
   (`inicio > now()`, `desviada = false`). Un conjunto vacío se trata como hoy.
4. **Carga**. La de hoy, más:
   - `periodicidad` (`new.periodicidad`);
   - `desde_cita_id`, `fecha_origen` y `fecha_destino`, los tres `null` JSON sin ancla.
5. Se publica `app.agenda_evento_regla` como hoy.
6. El comentario de la función se actualiza.

**Sin ancla** (un `UPDATE` directo, que tras §1.0 solo puede hacer el dueño de la tabla) el
conjunto sigue siendo el de T-011, y el cálculo cae en la rama sin ancla de §1.1: cada cita toma
el día nuevo en su propia semana. Hoy conservaría la fecha. Es la única diferencia de
comportamiento de ese camino, y es la corrección de H9.

### 1.4 · `agenda_editar_serie` (`drop function` + `create`)

```
drop function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text);

create function public.agenda_editar_serie(
  p_cita_id uuid, p_alcance public.alcance_cambio_serie,
  p_estado public.estado_cita default null, p_sala text default null,
  p_inicio timestamptz default null, p_fin timestamptz default null,
  p_dia_semana smallint default null, p_hora_local time default null,
  p_duracion_minutos smallint default null, p_zona_horaria text default null,
  p_fecha date default null)
returns jsonb language plpgsql volatile security definer set search_path = ''
```

**`esta`.** Si `p_fecha is not null`, `22023` («Con "esta" la fecha nueva va en el inicio.»). Si
no, igual que hoy.

**`esta_y_siguientes`.** Autorización y cita suelta igual que hoy (F25). Después, en este orden.
Los pasos 2 a 5 **no** se escriben en esta función: son el cuerpo de `plan_edicion_serie` (§1.2b).
Tras el paso 1, `agenda_editar_serie` hace
`v_plan := public.plan_edicion_serie(v_cita, v_serie, p_fecha, p_dia_semana, p_hora_local, p_duracion_minutos, p_zona_horaria)`.
Se describen aquí porque es donde se leen en orden:

1. `select * into v_serie from public.series_cita s where s.id = v_cita.serie_id for no key update`.
   Serializa dos ediciones concurrentes de la misma serie antes de validar.
2. **La cita ancla.** Cada caso da `22023` con su propio texto:
   - `v_cita.inicio <= now()`: «La cita ya ha empezado o ha pasado: la serie se edita desde una cita futura.» Cubre la pasada y la en curso.
   - `v_cita.estado not in ('programada','confirmada')`: «La cita está cancelada o cerrada.»
   - `v_cita.desviada`: «La cita se movió a mano y ya no la gobierna la serie.»
3. **El día nuevo.**
   - `v_dia := coalesce(p_dia_semana, extract(isodow from p_fecha)::smallint, v_serie.dia_semana)`.
   - Si vienen `p_fecha` y `p_dia_semana` y no coinciden, `22023` («La fecha y el día de la semana
     no coinciden.»).
4. **La fecha nueva de la ancla.**
   - `v_origen := (v_cita.inicio at time zone v_cita.zona_horaria)::date`.
   - `v_destino := coalesce(p_fecha, fecha_en_regla_nueva(v_serie.periodicidad, v_origen, v_dia))`.
   - Solo con `p_dia_semana`, la ancla va a ese día de **su** semana (en mensual, al mismo ordinal
     de su mes).
5. **La ancla no puede caer en el pasado.**
   - `v_zona := coalesce(p_zona_horaria, v_serie.zona_horaria)`.
   - `v_hora := coalesce(p_hora_local, v_serie.hora_local)`.
   - Si `(resolver_hora_local(v_zona, v_destino + v_hora)).instante <= now()`, `22023` («El nuevo
     horario de esta cita ya ha pasado.»).
   - Por la propiedad de §1.1, ninguna cita siguiente puede caer antes que ella.
6. `set_config('app.agenda_evento_regla', '', true)`, como hoy.
7. `set_config('app.agenda_regla_ancla', jsonb_build_object('serie_id', v_serie.id, 'desde_cita_id', v_cita.id, 'fecha_origen', v_plan->'fecha_origen', 'fecha_destino', v_plan->'fecha_destino')::text, true)`.
8. `update public.series_cita set dia_semana = (v_plan->>'dia_semana')::smallint, hora_local = (v_plan->>'hora_local')::time, duracion_minutos = (v_plan->>'duracion_minutos')::smallint, zona_horaria = v_plan->>'zona_horaria' where id = v_serie.id`.
9. `set_config('app.agenda_regla_ancla', '', true)`, **inmediatamente después** del `update`. Así
   un `UPDATE` posterior en la misma transacción no hereda el ancla.
10. El resto, igual que hoy. El retorno no cambia de forma:
    `{alcance, serie_id, propuestas:[]}`, o `{alcance, serie_id} || {evento_id, propuestas}`.

Después vienen `comment on function` con la firma de 11 argumentos (que menciona el ancla), y el
revoke y el grant de §1.7.

### 1.5 · `agenda_propuestas_de_evento` (`create or replace`, misma firma)

Se conservan autorización, idempotencia, salto de citas ajenas, `serie_id` copiado de la cita y
evento `entregado`. El bloque de cálculo (M11 1033-1046) se sustituye por
`select … from public.calcular_propuesta_de_evento(v_evento.tipo, v_evento.carga, v_cita)`.

- `fecha_prevista := fecha`, `hora_local_prevista := hora`, `zona_horaria := zona`.
- **Si `inicio <= now()`**, `inicio_propuesto` y `fin_propuesto` van **nulos**: «la decide una
  persona», el mismo significado de la columna de hoy. Pasa en el camino sin ancla y en un cambio
  de zona hacia el este con una cita inminente.
- Si no, van `inicio` y `fin`.
- **Se salta la cita** (no crea propuesta) cuando `v_cita.inicio <= now()` o
  `v_cita.estado not in ('programada','confirmada')`. Entre el evento y la llamada, la cita pudo
  empezar o cancelarse. Hoy no pasa en la misma transacción, pero cierra la puerta al consumidor
  de T-015.

### 1.6 · `agenda_confirmar_propuesta` (`create or replace`, misma firma)

Orden exacto. El **código** de cada guarda está elegido para no romper F18.

1. Rol, igual que hoy.
2. `select … from public.propuestas_cita p where p.id = … for no key update`. Serializa dos
   confirmaciones de la misma propuesta. Si no existe, `22023` como hoy.
3. Autorización (`42501`) y `pendiente` (`22023`), igual que hoy.
4. Sin hora: `22023`, igual que hoy.
5. **Nuevo, para toda propuesta**: `inicio_propuesto <= now()` da `22023` («La propuesta ha
   quedado en el pasado; descártala.»).
6. **Sin `cita_id`**: la rama de hoy, sin más cambios. Por eso F18 sigue dando `42501` desde el
   disparador de vínculo, porque su propuesta está en el futuro.
7. **Con `cita_id`**:
   - a. `select * into v_cita from public.citas c where c.id = v_propuesta.cita_id for no key update`.
     Serializa contra otra confirmación sobre la misma cita.
   - b. `22023` si `v_cita.inicio <= now()` («La cita ya ha empezado o ha pasado.»).
   - c. `22023` si `v_cita.estado not in ('programada','confirmada')` («La cita está cancelada o
     cerrada.»).
   - d. `22023` si `v_propuesta.evento_id is null` («Propuesta sobre una cita sin evento: no se
     puede comprobar; descártala.»): no hay cálculo contra el que cotejar, se falla cerrado.
   - e. Se carga el evento.
     - **`regla_cambiada`**: `22023` si `v_cita.desviada` («La cita se movió a mano; la serie ya no
       la gobierna.»). También `22023` si la regla vigente de la serie
       (`dia_semana`, `hora_local`, `duracion_minutos`, `zona_horaria`) difiere, con
       `is distinct from`, de la del evento («La serie ya tiene otra regla; descarta esta
       propuesta.»).
     - **`zona_cambiada`**: `22023` si `centros.zona_horaria` del `carga->>'centro_id'` difiere de
       `zona_horaria_nueva` («El centro ya tiene otra zona horaria; descarta esta propuesta.»). Las desviadas **sí** se confirman: F7 las incluye a propósito.
   - f. **Frescura.** Se llama a `calcular_propuesta_de_evento(evento.tipo, evento.carga, v_cita)`.
     Si `inicio`, `fin` o `zona` difieren (`is distinct from`) de `inicio_propuesto`,
     `fin_propuesto` y `zona_horaria` de la propuesta, `22023` («La cita cambió desde que se hizo
     la propuesta; descártala.»).
   - g. `set_config('app.agenda_origen','serie',true)` y
     `update public.citas set inicio, fin, zona_horaria` desde la propuesta. **Si
     `clasificacion <> 'normal'` y `v_cita.serie_id is not null` y `not v_cita.desviada`**, en el
     mismo `update` van `desviada = true, motivo_desviacion = 'anomalia_horaria'`. Con la marca, F6
     lo respeta. Así la cita confirmada queda igual que si hubiera nacido así (ADR-034; M11
     `agenda_crear_serie`, línea 740). Una desviada conserva su motivo. Después se limpia la marca.
     El `23P01` se propaga tal cual.
8. Se marca `confirmada`, igual que hoy.

### 1.10 · `agenda_previsualizar_edicion_serie` (nueva, de solo lectura; ADR-068, punto 3)

Va aquí en la migración, antes de los permisos. Se numera 1.10 para no mover las referencias de la
primera versión.

```
create function public.agenda_previsualizar_edicion_serie(
  p_cita_id          uuid,
  p_fecha            date     default null,
  p_dia_semana       smallint default null,
  p_hora_local       time     default null,
  p_duracion_minutos smallint default null,
  p_zona_horaria     text     default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
```

Recibe los mismos argumentos de regla que `agenda_editar_serie` con `esta_y_siguientes`, sin
`p_alcance`, `p_estado`, `p_sala`, `p_inicio` ni `p_fin`. **No escribe nada**: ni `insert`, ni
`update`, ni `set_config`, ni cerrojos.

1. **Autorización**: la de `esta_y_siguientes` (F25), con los mismos códigos y mensajes. Sin
   perfil o sin cita, `42501`. Cita suelta, `22023`.
2. `select * into v_serie from public.series_cita s where s.id = v_cita.serie_id`, sin cerrojo.
3. `v_plan := public.plan_edicion_serie(v_cita, v_serie, p_fecha, p_dia_semana, p_hora_local,
   p_duracion_minutos, p_zona_horaria)`. Mismas guardas `22023` y mismos fragmentos (§3).
4. **Citas.** Si `v_plan->>'cambia'` es falso, `citas = []`, igual que `agenda_editar_serie`
   devuelve `propuestas: []` cuando la regla no cambia. Si es verdadero, para cada `cita_id` de
   `citas_afectadas_por_regla(v_serie.id, v_cita.id)`, en su orden, con el mismo salto de citas no
   autorizadas que `agenda_propuestas_de_evento` (mismo predicado, §1.5), se llama a
   `calcular_propuesta_de_evento('agenda.regla_serie_cambiada', v_plan, cita)`. Si `inicio <= now()`,
   `inicio` y `fin` van nulos, como en §1.5.
5. **Retorno**:
   ```
   {
     "serie_id", "desde_cita_id", "fecha_origen", "fecha_destino", "cambia": bool,
     "regla_anterior": { periodicidad, dia_semana, hora_local, duracion_minutos, zona_horaria },
     "regla": { periodicidad, dia_semana, hora_local, duracion_minutos, zona_horaria,
                "ordinal": 1-5 | null, "ultimo": bool, "recorte": bool },
     "citas": [ { cita_id, fecha_actual, fecha_nueva, hora_local, inicio, fin,
                  clasificacion, recortada } ]
   }
   ```
   - `ordinal`: en `mensual`, `ord(fecha_destino)` con el `ord` de §1.1. En `semanal` y
     `quincenal`, `null`.
   - `ultimo = (ordinal = 5)`. Todo mes tiene al menos cuatro de cada día de la semana, así que
     solo el 5.º puede faltar. Con ordinal 5, cada cita cae en el último de ese día de su mes, y el
     diálogo puede decir «el último jueves de cada mes». Un 4.º que resulta ser el último de su mes
     sigue siendo «4.º»: la regla es el ordinal (ADR-068).
   - `recortada` (por cita): `mensual` y `ord(fecha_nueva) <> ordinal`. `recorte` es verdadero si
     alguna cita está `recortada`. Solo puede serlo con `ordinal = 5`.
   - `fecha_actual` es la fecha local de la cita en su zona. `fecha_nueva`, `hora_local`,
     `inicio`, `fin` y `clasificacion` son la salida de `calcular_propuesta_de_evento`.
     `clasificacion` deja al diálogo avisar de un hueco o de un solape de hora.
   - `regla_anterior` sale de `v_serie`, para que el diálogo diga qué cambia.
6. `comment on function` con la firma de seis argumentos: «Solo lectura. Describe la regla y las
   fechas que produciría agenda_editar_serie(esta_y_siguientes) con los mismos argumentos. No
   crea evento ni propuestas».

**Por qué coincide con las propuestas.** La previsualización y la edición comparten el plan
(§1.2b), el conjunto (§1.2a) y el cálculo (§1.2). La carga del evento lleva los mismos valores que
el plan, porque el disparador los toma de la fila que `agenda_editar_serie` escribió con ese plan.
Solo difieren si pasa el tiempo entre las dos llamadas (`now()` cambia): una cita que empieza
entre medias sale de la edición, y la ancla se vuelve a validar. Eso es correcto.

**«Mantener la serie» no necesita nada nuevo** (D14). Es
`agenda_editar_serie(p_cita_id, 'esta', p_inicio => …, p_fin => …)`, que ya existe (F9): delega en
`agenda_actualizar_cita`, la cita queda `desviada` con `reprogramada` (F6) y la serie no cambia.
Mover una cita futura al pasado por esa puerta es H5, de T-014.

### 1.7 · Permisos y comentarios

| Función | `revoke execute … from` | `grant execute … to` |
|---|---|---|
| `fecha_en_regla_nueva(periodicidad_serie, date, smallint, date, date)` | `public, anon` | `authenticated` (pura, como `ocurrencias_serie`) |
| `calcular_propuesta_de_evento(text, jsonb, public.citas)` | `public, anon, authenticated` | nadie. Solo la llaman las funciones `definer`, que corren como su dueño |
| `agenda_editar_serie(…11…)` | `public, anon` | `authenticated` |
| `citas_afectadas_por_regla(uuid, uuid)` | `public, anon, authenticated` | nadie |
| `plan_edicion_serie(public.citas, public.series_cita, date, smallint, time, smallint, text)` | `public, anon, authenticated` | nadie |
| `agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text)` | `public, anon` | `authenticated` |

**Tabla**: `revoke update on table public.series_cita from authenticated` (§1.0). Es el único
cambio de privilegios de tabla de la migración.

- `fn_evento_regla_serie`, `agenda_propuestas_de_evento` y `agenda_confirmar_propuesta` conservan
  sus privilegios con `create or replace`. Aun así se repite el bloque, porque es barato y deja el
  hecho escrito donde se lee.
- Cada función redefinida lleva su `comment on function` al día.

### 1.8 · TypeScript

**`lib/citas/esquemas.ts`**, `esquemaEditarSerie`:

- Gana `fecha: z.string().regex(FECHA_ISO, 'La fecha debe tener forma AAAA-MM-DD.').refine(esFechaReal, 'Esa fecha no existe.').nullable().optional()`.
- `esFechaReal` es un ayudante **privado** del fichero: ida y vuelta por `Date.UTC`, comparando
  año, mes y día. No se importa nada de `lib/fechas/`, que es otro carril y aún no tiene la función.
- El primer `refine` («con `esta` no se cambia la regla») añade `datos.fecha == null`.
- Tercer `refine` nuevo: si vienen `fecha` y `diaSemana`, el ISODOW de `fecha` (calculado con
  `Date.UTC`, `getUTCDay() || 7`) es igual a `diaSemana`. Si no, el mensaje es «La fecha y el día de
  la semana no coinciden.» con `path: ['fecha']`.

**`lib/citas/series.ts`**, `editarSerie`: añade `p_fecha: entrada.fecha ?? undefined`. El
docblock dice que la regla parte de la cita elegida y que `fecha` fija el día nuevo de esa cita.

**`lib/citas/esquemas.test.ts`**: los cuatro casos del criterio 14. `lib/supabase/tipos-bd.ts` sale
de `npm run tipos`.

**La previsualización no tiene envoltorio TS en este ticket.** Aparece en `tipos-bd.ts` tras
`npm run tipos`, y la envuelve T-014, que tiene `lib/citas/**` en su territorio y es quien la
consume. Su esquema Zod es el de `esquemaEditarSerie` sin los campos de `esta`.

### 1.9 · Banco: sección M de `scripts/rls/16-series.sql`

La sección va al final, **antes** del eco de cierre del módulo, y no toca nada de A-L. Detalle por
criterio en §3.

**Fijaciones**

- Constantes `\set` nuevas con el prefijo `a1100006-…`, que no está usado.
- Las series de M.5 y M.6 **no** son de PRO1: §D y §E ya tienen citas de PRO1 en esos domingos
  (F17), y confirmar chocaría con `23P01`. Se usan P2/PRO2 si el vínculo lo permite, o un
  profesional y paciente propios de la sección. Se elige leyendo `01-fijación.sql` y el disparador
  de vínculo de `20260911120000_vinculo_en_el_alta_de_agenda.sql`.
- M.7 y M.9 insertan citas como `postgres`, igual que §H. Así se tienen citas pasadas, en curso y
  desviadas dentro de una serie, y un centro propio para el cambio de zona (`Europe/Madrid` →
  `Asia/Tokyo`, `Atlantic/Canary`, `Europe/Lisbon`).
- **Las llamadas que prueban el producto van por la función que llamaría la Server Action**
  (`agenda_editar_serie`, `agenda_propuestas_de_evento`, `agenda_confirmar_propuesta`) y **como**
  el profesional (`pg_temp.como`). Construir el estado a mano solo se permite para lo que el tiempo
  no deja fabricar: una cita pasada, una en curso, o una que empieza entre la propuesta y la
  confirmación.

`scripts/rls/README.md`: una frase en la fila del módulo 16, «+ sección M (T-011b): ancla, día,
duración, cambio de hora, guardas de confirmación, cambio de zona, `UPDATE` directo retirado y
previsualización».

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado, y por qué |
|---|---|---|
| D1 | **El ancla viaja en un GUC local a la transacción** (`app.agenda_regla_ancla`). El disparador lo lee y lo ignora si es de otra serie. | **Columna nueva en `series_cita`**: es estado persistente para algo que dura una sentencia, y exige migrar datos. **Filtrar en `agenda_editar_serie` después del disparador**: el evento ya estaría escrito con el conjunto malo. **Quitar el disparador**: el `UPDATE` directo (F2) perdería su evento. |
| D2 | **Las citas siguientes conservan su semana (o mes) relativa y toman el día nuevo.** La ancla fija el desplazamiento. | **Recalcular las ocurrencias desde la ancla con `ocurrencias_serie`**: rehace el conjunto y crea o quita sesiones, que ya no es una propuesta por cita (ADR-034), y rompe la cuenta de `sesiones_totales`. **«El día nuevo más cercano»**: ambiguo a mitad de semana y distinto hacia delante que hacia atrás. |
| D3 | **Una sola función de cálculo** (`calcular_propuesta_de_evento`) para crear y para confirmar. | **Guardar la clasificación en la propuesta**: exige una columna nueva y no sirve para detectar que la cita cambió. **Duplicar el cálculo**: dos fórmulas que divergen en el primer arreglo. |
| D4 | **Cerrada por el ADR-068, punto 1.** Una propuesta que ya no vale sigue en «Por confirmar» y se rechaza al confirmarla, con `22023` y su motivo legible (los mensajes de §1.6; la traducción a la interfaz es de T-014). Las pendientes que queden, incluidas las que salieron del H9 antes de esta migración, se descartan a mano. Consecuencia aceptada por el ADR: «Por confirmar» puede acumular propuestas viejas. | **Descartar automáticamente las propuestas anteriores de la misma cita** al crear una nueva: algo desaparece sin que el usuario lo vea, que es lo que el ADR-068 prohíbe. **No hacer nada**: se podría confirmar la de las 16:00 con la serie a las 17:00. |
| D5 | **`drop function` + `create`** de `agenda_editar_serie` con `p_fecha` al final. | **Sobrecarga de 11 argumentos junto a la de 10**: con los `default`, las llamadas son ambiguas («function is not unique») y PostgREST no sabe cuál elegir. **Función con otro nombre**: dos caminos de edición. `drop function` no es destructivo de datos y el linter no lo marca (F16). |
| D6 | **La duración de la propuesta de regla es la de la regla** (`carga.duracion_minutos`). La de zona sigue siendo la de la cita. | Conservar la de la cita, que es H9. En una cita no desviada, la duración ya es la de la regla. |
| D7 | **Un hueco o un solape confirmados dejan la cita `anomalia_horaria`**, como al materializar. | Confirmar sin marca, como hoy: una cita a las 03:00 de una serie de las 02:30 quedaría «no desviada» y contradiría el ADR-034. |
| D8 | **Se valida la cita ancla** (futura, `programada/confirmada`, no desviada) **y su horario nuevo** (futuro). | Aceptar cualquier ancla: una pasada dejaría entrar citas de antes de ahora en el razonamiento, y una desviada editaría una regla que ya no la gobierna. Coincide con `alcanceSiguientesPermitido` de T-014 §1.6.2. |
| D9 | **Una propuesta cuyo instante ya pasó queda sin hora**, y no se omite. | Omitirla: la cita quedaría en su sitio sin que nadie lo sepa. Confirmarla, que es H5: movería una cita al pasado. |
| D10 | **Pruebas en la sección M de `16-series.sql`.** | **Módulo nuevo `18-…`**: T-014 ya reserva el 18 (`18-agenda-rango.sql`) y los dos tickets van seguidos. Además, G y L.2 viven en 16, y las pruebas de la misma función van juntas. |
| D11 | **La regla resultante se expone con una función de solo lectura** (`agenda_previsualizar_edicion_serie`), que se llama antes de editar. | **Columnas en `propuestas_cita`** o **el retorno de `agenda_editar_serie`**: los dos existen solo después de cambiar la regla. El diálogo tiene que describirla antes, cuando el usuario aún elige entre mantener y modificar. Deshacerla después sería otro evento con sus propias propuestas. Las columnas, además, son esquema y relleno. |
| D12 | **Dos ayudantes internos** (`citas_afectadas_por_regla`, `plan_edicion_serie`) que usan la edición y la previsualización. | **Copiar las validaciones y el conjunto en la previsualización**: dos copias que divergen en el primer arreglo, y el diálogo prometería una regla distinta de la que se aplica. Es la misma razón que D3. |
| D13 | **Se revoca solo el privilegio `update`; la política y el camino sin ancla del disparador se quedan.** | **`drop policy series_cita_modificacion`**: `11-cobertura.sql` la declara (F22), está fuera del territorio y fallaría. Dormida, además, filtra si un grant futuro vuelve a abrir la tabla. **Quitar la rama sin ancla**: el dueño de la tabla aún puede hacer `UPDATE`, y el evento debe salir igual. |
| D14 | **«Mantener la serie» es `esta`**, que ya existe: mueve solo esa cita y la deja desviada. | **Una función nueva «mover y mantener»**: sería un segundo camino de escritura de citas para lo mismo que ya hace `agenda_actualizar_cita`. |
| D15 | **La base da datos (`ordinal`, `ultimo`, `recorte`, fechas); la frase la escribe T-014.** | **Devolver el texto en castellano desde SQL**: los textos de interfaz viven en `lib/i18n/`, y la frase depende del contexto del diálogo. |

---

## 3 · Cómo se cierra cada criterio de aceptación

Todas las guardas nuevas lanzan `22023`, así que **toda negativa de guarda usa
`pg_temp.assert_lanza_codigo_msg(consulta, '22023', <fragmento>, …)`** (`00-ayudantes.sql:137`), con
el fragmento de la tabla. El código solo no demuestra qué comprobación mordió; es la lección de
T-012a escrita en el propio ayudante.

| Guarda | Fragmento literal del mensaje |
|---|---|
| §1.4.2 ancla pasada o en curso · §1.6.7b | `ya ha empezado o ha pasado` |
| §1.4.2 ancla cancelada o cerrada · §1.6.7c | `cancelada o cerrada` |
| §1.4.2 ancla desviada · §1.6.7e regla sobre desviada | `se movió a mano` |
| §1.4.3 `p_fecha` y `p_dia_semana` no coinciden | `no coinciden` |
| §1.4.5 horario nuevo de la ancla en el pasado | `nuevo horario de esta cita ya ha pasado` |
| `esta` con `p_fecha` | `Con "esta"` |
| §1.6.5 propuesta en el pasado | `quedado en el pasado` |
| §1.6.7d propuesta con cita y sin evento | `sin evento` |
| §1.6.7e regla vigente distinta | `otra regla` |
| §1.6.7e zona del centro distinta | `otra zona` |
| §1.6.7f frescura | `La cita cambió` |
| sin hora (M11, ya existe) | `no tiene horario` |
| §1.0 `UPDATE` directo como `authenticated` (`42501`, no `22023`) | `permission denied for table series_cita` |
| F25 cita ajena, en la previsualización (`42501`) | `no es tuya` |

Salvo que se diga otra cosa, las anclas de fecha son relativas a `now()`: el año que viene, o
`domingo_marzo + N` lejos de otras fijaciones. Toda negativa tiene su gemela positiva.

| Crit. | Comprobación |
|---|---|
| 1 | `npx supabase db reset` y `npm run lint:migraciones`: salida pegada en la evidencia. |
| 2 | Se escribe M **antes** que la migración. Tras `db reset`, `npm run test:rls` falla, y la primera fallida es `ASERCIÓN FALLIDA: M.1 · …`: el conjunto incluye las citas 1 y 2. Salida pegada. |
| 3 | Con la migración, `npm run test:rls`: exit 0, con el eco `16-series: completa.` y el de 17. |
| 4 | **M.1**. Serie semanal de 6 (como `pg_temp.como(PRO)` y `agenda_crear_serie`). `agenda_editar_serie(c3, 'esta_y_siguientes', p_hora_local => '10:00')`. Asserts: `carga->'citas_afectadas' = jsonb_build_array(c3,c4,c5,c6)` (orden incluido); ninguna propuesta con `cita_id in (c1,c2)`; `carga->>'desde_cita_id' = c3`. |
| 5 | **M.2**. Serie nueva. `editar(c3, p_fecha => fecha(c3)+2, p_hora_local => '10:00')`. Para cada propuesta: `extract(isodow from fecha_prevista) = isodow(fecha(c3)+2)`; `lunes(fecha_prevista) = lunes(fecha(cita))`; `to_char(inicio_propuesto at time zone zona,'HH24:MI') = '10:00'`; la de c3 tiene `fecha_prevista = fecha(c3)+2`. **M.3**. Otra serie, `p_fecha => fecha(c3)+7`: `fecha_prevista = fecha(cita)+7` para las 4. |
| 6 | **M.4**. `p_duracion_minutos => 80`: `fin_propuesto - inicio_propuesto = interval '80 minutes'` en todas. Se confirma la de la ancla como PRO: la cita queda con `fin - inicio = 80 min` y `desviada = false`. |
| 7a | **M.5**. Serie semanal de martes (PRO2) desde `domingo_octubre - 12`, 4 sesiones, 12:00. `editar(primera, p_fecha => primera+2, p_hora_local => '12:00', p_duracion_minutos => 60)`. Asserts: todas en jueves; `count(distinct to_char(inicio_propuesto at time zone zona,'HH24:MI')) = 1` con valor `'12:00'`; `count(distinct extract(hour from inicio_propuesto at time zone 'UTC')) = 2`; duración de 60. Lo mismo con `domingo_marzo - 12`. |
| 7b | **M.6**. Serie de domingos (PRO2) a las 11:00 con 3 sesiones: `domingo_marzo - 7`, `domingo_marzo` y `+7`. `editar(primera, p_hora_local => '02:30')`. Asserts sobre la propuesta del domingo de marzo: `to_char(… ,'HH24:MI') = '03:00'`; `inicio_propuesto - 1 s` lee `'01:59:59'`. Se confirma: `desviada and motivo_desviacion = 'anomalia_horaria'`. **Gemela**: se confirma la del `+7`, y `desviada = false`. |
| 7c | Igual con `domingo_octubre`: la propuesta lee `'02:30'`, y `inicio_propuesto + 1 h` **también** lee `'02:30'` (es la primera de las dos). Confirmada, queda `anomalia_horaria`. |
| 8a | **M.7**. Serie S7 insertada como `postgres`: una cita pasada (`now()-7d`), una en curso (`now()-10 min` a `now()+40 min`), una futura desviada (`reprogramada`), una futura cancelada y tres futuras normales. Como PRO, `assert_lanza_codigo('…agenda_editar_serie(<cada una de las 4>, ''esta_y_siguientes'', p_hora_local => ''18:00'')', '22023', …)`. El número de filas de `eventos_salientes` de S7 no cambia y `propuestas_cita` de S7 sigue vacía. |
| 8b | Tabla temporal de las pasadas y en curso antes; `editar(primera futura normal, p_hora_local => '18:00')`. `citas_afectadas` contiene exactamente las tres normales. `EXCEPT` en los dos sentidos más el recuento, como §H, para las pasadas y en curso. |
| 8c | Sobre tres propuestas de 8b: (i) se desplaza la cita a mano con `agenda_actualizar_cita` y queda desviada; (ii) como `postgres`, `update citas set estado = 'cancelada'`; (iii) como `postgres`, `update citas set inicio = now() - interval '5 minutes', fin = now() + interval '45 minutes'`. Es una cita futura, así que F5 lo deja; es el «empezó entre medias». Cada `agenda_confirmar_propuesta` da `22023` y la cita no cambia (se compara `inicio, fin, zona_horaria, estado` antes y después). |
| 9a | **M.8**. Dos ediciones seguidas (16:00 y luego 17:00) desde la misma ancla, en serie nueva. Confirmar la propuesta de la ancla del **primer** evento da `22023`. La del segundo se confirma y la cita queda a las 17:00. |
| 9b | Serie nueva **de una sola sesión** (con más, la ancla movida a +14 chocaría con la tercera: `23P01`). Dos desplazamientos puros desde la misma ancla, sin cambiar hora ni día (la regla queda igual y la guarda de regla no salta): evento A con `p_fecha => fecha(ancla)+7`, evento B con `p_fecha => fecha(ancla)+14`. Se confirma la de B: la cita queda a +14. La de A da `22023` con el fragmento de **frescura** (recalculada desde la cita movida, cae en +21, no en +7). |
| 10a | **M.9**. Centro propio CT en `Europe/Madrid`, con una cita suelta a `now() + 30 min`. Como `postgres`, `update centros set zona_horaria = 'Asia/Tokyo'`. Como PRO, `agenda_propuestas_de_evento(evento)`: la propuesta de esa cita tiene `inicio_propuesto is null`, y confirmarla da `22023`. Se restaura la zona. |
| 10b | Cita suelta a `now() + 5 days` en CT. Cambio a `Atlantic/Canary` y propuestas. Se desplaza la cita una hora con `agenda_actualizar_cita`. Confirmar da `22023` (frescura). |
| 10c | Cita a `now() + 6 days`. Cambio a `Atlantic/Canary` (propuesta P1) y después a `Europe/Lisbon` (P2). Confirmar P1 da `22023` (zona del centro). |
| 10d | Gemela: P2 se confirma. Una cita de serie **desviada** de CT con su propuesta de zona intacta se confirma, y conserva `desviada = true` con su motivo. |
| 11 | **M.10**. (a) **El `UPDATE` directo ya no entra.** Serie semanal nueva de miércoles, de PRO. Como PRO (`pg_temp.como`), `assert_lanza_codigo_msg('update public.series_cita set dia_semana = 5 where id = …', '42501', 'permission denied for table series_cita', …)`. Después, como `postgres`, la fila sigue con `dia_semana = 3` (se compara `to_jsonb(s)` antes y después) y el número de eventos de la serie no ha cambiado. **Gemela**: como el mismo PRO, `agenda_editar_serie(primera, 'esta_y_siguientes', p_dia_semana => 5)` crea el evento y una propuesta por cita. Sin la migración, (a) falla porque el `update` entra. Además, `has_table_privilege('authenticated', 'public.series_cita', 'update')` es falso, y `select` e `insert` siguen verdaderos. (b) **El camino sin ancla sigue igual**, sobre otra serie de miércoles: como `postgres`, `update series_cita set dia_semana = 5` directo. El evento tiene todas las futuras no desviadas y `carga->'fecha_origen' = 'null'::jsonb`. Tras `agenda_propuestas_de_evento` como PRO, cada propuesta cae en viernes de **su** semana. |
| 12 | **M.11**. Serie mensual del 2.º martes desde un mes lejano, 4 sesiones. `editar(2.ª, p_fecha => 3.er jueves del mes de la 2.ª)`: las propuestas de la 2.ª a la 4.ª son 3.er jueves de su mes. Sobre la función pura, `fecha_en_regla_nueva('mensual', <un 5.º martes>, 4::smallint)` = el último jueves de ese mes (recorte), y `fecha_en_regla_nueva('semanal', d, 3, d, d+9)` = `lunes(d) + 7 + 2`. |
| 13 | **M.12**. `has_function_privilege('authenticated', 'public.agenda_editar_serie(uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz, smallint, time, smallint, text, date)', 'execute')` es verdadero, y para `anon` es falso. `to_regprocedure('public.agenda_editar_serie(uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz, smallint, time, smallint, text)') is null`. `has_function_privilege` de `anon` y `authenticated` sobre `calcular_propuesta_de_evento(text, jsonb, public.citas)`, `citas_afectadas_por_regla(uuid, uuid)` y `plan_edicion_serie(public.citas, public.series_cita, date, smallint, time, smallint, text)` es falso. Sobre `agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text)`, verdadero para `authenticated` y falso para `anon`. |
| 14 | `npm run tipos`: el diff de `lib/supabase/tipos-bd.ts` muestra `p_fecha?: string` en `agenda_editar_serie` y la entrada nueva `agenda_previsualizar_edicion_serie`. `npm test` (vitest) pasa con los cuatro casos. |
| 15 | `npm run lint`, `npm run build` (comprueba los tipos de la RPC contra `tipos-bd.ts`) y `node ~/.claude/pipeline/territorio.mjs T-011b`. |
| 16 | **M.13, previsualización.** (a) **Mensual con recorte.** `mes5` := el primer mes de **febrero a diciembre** del año que viene con cinco jueves; siempre hay alguno, y así el mes anterior es futuro. Dos meses seguidos nunca tienen cinco jueves (un mes de 31 días con cinco empieza su primer jueves el 1-3, y el del siguiente cae el 5-7). Serie mensual de PRO del 2.º martes, desde el día 1 del mes anterior a `mes5`, 4 sesiones, a una hora que ninguna otra fijación use (p. ej. 07:15). Como PRO, `agenda_previsualizar_edicion_serie(<cita de mes5>, p_fecha => <5.º jueves de mes5>)`. Asserts: `regla->>'ordinal' = '5'`, `ultimo` y `recorte` verdaderos, `cambia` verdadero, `regla->>'dia_semana' = '4'`; `citas` tiene 3 elementos (la de `mes5` y las dos siguientes, en orden); cada `fecha_nueva` es el último jueves de su mes; la de `mes5` es `p_fecha` y no está `recortada`; la de `mes5 + 1` está `recortada` y cae en su 4.º jueves; la de `mes5 + 2` está `recortada` si y solo si su mes no tiene quinto jueves. (b) **Semanal**: sobre la serie de M.1 (o una nueva), `p_fecha => fecha(c3) + 2`: `ordinal` nulo, `ultimo` y `recorte` falsos, ninguna `recortada`. (c) **Solo lectura**: antes y después de (a), son iguales el número de filas de `eventos_salientes` y de `propuestas_cita` de la serie, `to_jsonb` de la fila de `series_cita`, y `current_setting('app.agenda_regla_ancla', true)` y `current_setting('app.agenda_evento_regla', true)`. (d) **Una sola fuente**: con los mismos argumentos, `agenda_editar_serie(<cita de mes5>, 'esta_y_siguientes', p_fecha => …)`. El conjunto `(cita_id, fecha_nueva, inicio, fin)` de la previsualización, guardado antes en una tabla temporal, es igual a `(cita_id, fecha_prevista, inicio_propuesto, fin_propuesto)` de las propuestas del evento: `EXCEPT` en los dos sentidos más el recuento. (e) **Sin cambio**: previsualizar sin argumentos de regla da `cambia = false` y `citas = []`. (f) **Negativas**: como PRO2, `42501` con `no es tuya`; sobre una cita desviada, `22023` con `se movió a mano`; con `p_fecha` y `p_dia_semana` que no coinciden, `22023` con `no coinciden`. Sin la migración, M.13 falla porque la función no existe. |

---

## 4 · Riesgos, por probabilidad

1. **Alta. Choques `23P01` en el banco al confirmar.** El módulo 16 ya siembra citas de PRO1 en
   las mismas fechas de marzo y octubre, a varias horas, y 17 corre después sobre la misma
   transacción. Mitigación en §1.9: otro profesional para M.5 y M.6, fechas lejanas para el resto,
   y el banco entero en verde como criterio.
2. **Media. La prueba de «en curso» depende del reloj.** `now()` es constante en la transacción
   del banco, así que `now() - 5 min` está en curso de forma estable. No se usa `clock_timestamp()`.
3. **Media. Los eventos anteriores a la migración no llevan `periodicidad` ni ancla.** El
   `coalesce` de §1.2 los trata como «sin ancla». Sus propuestas pendientes del H9 dejarán de
   confirmarse (frescura, o la guarda de regla) si su cálculo difiere. Es lo correcto, porque eran
   las erróneas. Hoy no hay producción; en la base sembrada, se descartan.
4. **Media. `drop function` y PostgREST.** El caché de esquema de PostgREST se recarga con
   `db reset` en local. En un entorno desplegado, el despliegue de migraciones de Supabase lo
   recarga; si no, un `notify pgrst, 'reload schema'` al final de la migración es inocuo. **No** se
   pone sin comprobar que el proyecto lo usa, porque no hay precedente en `supabase/migrations/`.
5. **Baja. Bisección y frescura.** La comparación de frescura exige que `resolver_hora_local`
   devuelva el mismo instante con las mismas entradas. Es `stable` y determinista (F12), y la misma
   entrada da la misma bisección.
6. **Media. El revoke rompe una escritura que nadie vio.** F23 dice que ni la aplicación ni el
   banco hacen `UPDATE` directo de `series_cita` como `authenticated`. Mitigación: el banco
   entero en verde (criterio 3) y `npm run build`. Si algo falla con `permission denied for table
   series_cita`, es un camino que había que pasar a `agenda_editar_serie`, no un motivo para
   devolver el grant.
7. **Baja. La previsualización promete lo que la edición no hace.** Solo si divergen el plan, el
   conjunto o el cálculo, y los tres son la misma función (D12). M.13d lo comprueba.
8. **Baja. Una ancla que otra sesión desvía a la vez.** El cerrojo de §1.4.1 es sobre la serie, no
   sobre la cita. Si otra transacción desvía la ancla entre la lectura y el `UPDATE`, el disparador
   la excluye del conjunto (`desviada = false`) y la edición sigue desde su `inicio`. La ancla no
   recibe propuesta y la interfaz lo ve en `propuestaIds`. Es aceptable y no merece otro cerrojo.

---

## 5 · Qué revisar

**Qué elige el llamante y qué efecto tiene**

- `p_cita_id` elige el ancla. Solo vale una cita futura, `programada/confirmada`, no desviada y
  autorizada (§1.4.2). Comprobar que la validación va **después** de la autorización (`42501`
  primero) y antes de cualquier `set_config` o `UPDATE`.
- `p_fecha` y `p_dia_semana`: si no coinciden, `22023`. `p_fecha` con `esta` da `22023`. Una
  `p_fecha` en el pasado, o una que junto con la hora da un instante pasado, da `22023`, también
  en un hueco de marzo resuelto hacia delante.
- `p_zona_horaria` cambia la zona **de la serie**, con todas sus consecuencias. `resolver_hora_local`
  valida que sea IANA antes del `UPDATE`.
- `agenda_previsualizar_edicion_serie` recibe los mismos argumentos de regla. Comprobar que
  autoriza **antes** de llamar a `plan_edicion_serie`, y que una cita ajena da `42501` con el
  mismo mensaje que la edición, sin revelar si la cita existe.

**Previsualización (ADR-068, punto 3)**

- **Solo lectura**: ni `insert`, ni `update`, ni `delete`, ni `set_config`, ni `for … update` en
  el cuerpo. `stable` impide a PL/pgSQL escribir, pero no impide `set_config`; por eso M.13c mira
  los GUC.
- **Una sola fuente**: los mensajes de las guardas de la ancla aparecen **una vez** en la migración,
  dentro de `plan_edicion_serie`. Un `grep` de «ya ha empezado o ha pasado» en la migración da la
  de §1.2b y la de §1.6.7b, y ninguna más. Ni `agenda_editar_serie` ni la previsualización repiten
  el predicado de §1.2a.
- `ultimo` es `ordinal = 5`, y no «es el último de su mes»: un 4.º jueves que resulta ser el
  último sigue siendo el 4.º (ADR-068).
- `recortada` se calcula por cita, contra `ordinal`, y no contra el ordinal de la fecha anterior
  (la deriva de `ocurrencias_serie`, F24, no se copia).

**GUC `app.agenda_regla_ancla`**

- Solo **acota**: añade `c.inicio >= ancla` a un predicado que ya exige `serie_id = new.id`. Un
  ancla falsificada (en `psql` como `authenticated`; PostgREST no expone `set_config`) solo puede
  reducir el conjunto de la propia edición, nunca meter citas ajenas.
- Se anula si el `serie_id` no coincide, y se limpia justo después del `UPDATE`. Verificar las dos
  cosas leyendo el cuerpo.

**Qué prueba debe fallar y por qué**

- Sin la migración, M.1 falla porque `citas_afectadas` incluye c1 y c2 (H8). Es la salida del
  criterio 2.
- M.2 falla sin la migración porque la propuesta conserva el martes (H9).
- M.4 falla porque `fin - inicio = 50`.
- M.8a falla porque la de las 16:00 se confirma.
- M.7c(iii) falla porque la cita en curso se mueve. El `update` como `postgres` que la pone en
  curso **también la desvía** (F6, sin marca) y cambia su fecha. Por eso la guarda §1.6.7b va
  **antes** que la de desviada y la de frescura, y la aserción exige su fragmento. Si alguien quita
  §1.6.7b, el `22023` sigue saliendo, pero por otra guarda, y la aserción se pone roja.
- Toda negativa de guarda lleva su fragmento (tabla de §3). Una `assert_lanza_codigo` sin
  fragmento sobre `22023` en la sección M es un defecto de la prueba.
- Si alguna pasa en verde sin la migración, está mal escrita.

**Invariantes que se podrían saltar por otra puerta**

- **`UPDATE` directo de `series_cita`**: cerrado para `authenticated` (§1.0). Comprobar con
  `\dp public.series_cita` que `authenticated` conserva `r` y `a` y ha perdido `w`, y que nadie más
  gana nada. La política queda dormida (D13). El dueño sí puede, y su evento sigue saliendo con el
  conjunto de T-011 y el cálculo sin ancla; nadie lo procesa hasta T-015.
- **`insert` directo de `series_cita`**: sigue abierto (hallazgo 6). No lo pide el ADR.
- **`null`**: `->>` de un campo ausente da `NULL`. Comprobar que `fecha_en_regla_nueva` con los dos
  nulos va a la rama sin ancla, y que con uno solo da `22023`. Las comparaciones de la guarda de
  regla y de frescura van con `is distinct from`, nunca con `<>`.
- **Duplicados**: la idempotencia `(evento_id, cita_id)` no cambia. Dos eventos distintos sí dan
  dos propuestas pendientes para la misma cita. Esa es D4: la vieja se rechaza al confirmar, no se
  descarta sola.
- **Concurrencia**: los cerrojos `for no key update` sobre la propuesta y sobre la cita (§1.6), y
  sobre la serie (§1.4). No se usa `for update`, que choca con `for key share` de las FK
  (`propuestas_cita.cita_id` y `citas.serie_id` referencian esas filas). El banco no puede probar
  concurrencia; se revisa leyendo el cuerpo.
- **Pasado**: ninguna ruta de confirmación deja una cita con `inicio <= now()`. Hay tres guardas:
  §1.6.5, §1.6.7b y D9. La rama sin cita (festivo) también queda cubierta por §1.6.5.
- **Desviadas**: la regla nunca las propone ni las confirma (disparador y §1.6.7e). La zona sí, y
  conservan `desviada` (F6 y §1.6.7g, que solo marca `anomalia_horaria` si **no** estaba desviada).
- **F18**: `17-vinculo-agenda.sql` §E debe seguir dando `42501`. Ninguna guarda nueva de la rama
  sin cita corre antes del `insert`, salvo §1.6.5, y esa propuesta es futura.
- **Permisos de tabla entera**: la migración no concede nada sobre tablas y solo revoca
  `update` de `series_cita`. Comprobar con `\dp` que `propuestas_cita` y `eventos_salientes`
  siguen como en M11 1273-1278.
- **`TRUNCATE`**: no aplica. No hay tabla nueva ni tabla de solo adición implicada.

**Lectura del código**

- `calcular_propuesta_de_evento` es la **única** fórmula. `agenda_propuestas_de_evento` y
  `agenda_confirmar_propuesta` no deben conservar ningún resto del bloque M11 1033-1046.
- En `agenda_confirmar_propuesta`, el orden de §1.6 es parte del contrato: cambiarlo cambia qué
  código ve el llamante.

**Autoevaluación del implementador**

- Pegar la salida del criterio 2 **antes** de escribir la migración.
- Recorrer §5 punto por punto en la bitácora.

---

## 6 · Territorio

El del contrato:

```
supabase/migrations/*_editar_serie_desde_la_cita.sql
lib/supabase/tipos-bd.ts
scripts/rls/16-series.sql
scripts/rls/README.md
lib/citas/esquemas.ts
lib/citas/esquemas.test.ts
lib/citas/series.ts
```

- **La enmienda del ADR-068 no amplía el territorio.** El revoke va en la misma migración, su
  prueba en `16-series.sql` y la previsualización en la migración. El envoltorio TS es de T-014.
- Siempre permitidos: `tickets/T-011b*`, `docs/bitacora/**` y `docs/state.md`.
- `lib/citas/errores.ts` **no** entra. Todo `22023` sigue siendo `parametro_invalido`. Los mensajes
  distinguibles para el diálogo son de T-014, que tiene `lib/citas/**` en su territorio.
- Se trabaja en un worktree limpio. El árbol principal tiene ficheros sin seguimiento
  (`.claude/agent-memory/`, `docs/metricas/`, `scratchpad_factor_resp.json`) que
  `territorio.mjs` contaría.

---

## 7 · Delegable

- **Nada del núcleo.** La migración, el banco y las guardas son dinero de agenda, RLS y reloj.
- **Candidato a volumen**, si se quiere: los cuatro casos de `esquemas.test.ts`. Son repetitivos y
  sin comportamiento propio. Aun así, son cuatro `it` y delegarlos cuesta más que escribirlos. **Se
  recomienda no delegar.**

---

## 8 · Hallazgos que el implementador anota en `docs/state.md`

El antiguo hallazgo 1 (`UPDATE` directo) lo cerró el ADR-068 y ya no se anota.

1. Las propuestas `festivo`, `ausencia` y `ocupada` (sin cita) no se recalculan cuando cambia la
   regla después.
2. `fin_el` y `sesiones_totales` no se ajustan tras desplazar la serie semanas adelante o atrás.
   Son parámetros de creación (F1), pero el formulario de «editar serie», si algún día lo hay, los
   mostrará.
3. Colisión de nombre «T-011b» con la rama MiniMax antigua (`minimax/alcance.json:154`,
   `minimax/cortes/T-011.md:16`).
4. «Por confirmar» puede acumular propuestas viejas (consecuencia aceptada del ADR-068). Si
   molesta, el aviso es de T-015.
5. **Deriva del ordinal en `ocurrencias_serie`** (F24). Al crear una serie mensual del 5.º jueves,
   el primer mes sin quinto la recorta al 4.º, y a partir de ahí sigue en el 4.º aunque el mes
   tenga quinto, porque el ordinal se recalcula desde la fecha anterior. La edición de este
   ticket aplica el ADR-068 al pie de la letra (ordinal fijo, recorte por mes), así que una serie
   creada y una editada con el mismo 5.º jueves divergen. Lo decide el propietario; aquí no se
   toca `ocurrencias_serie`.
6. `authenticated` conserva `insert` directo sobre `series_cita`. Una serie insertada a mano
   nace sin citas (la materialización es de `agenda_crear_serie`). Es inerte, pero es la misma
   clase de puerta que el ADR-068 cerró para `update`.

---

## Para T-014 (lo que el diálogo encuentra en la base)

La nota D6 = B al final de `tickets/T-014/diseno.md` es anterior al ADR-068 y no menciona la
previsualización. Este ticket no la edita. Lo que T-014 necesita:

- **Al soltar una cita de serie en otra fecha**, el diálogo pregunta «mantener la serie» o
  «modificarla según la nueva fecha».
  - **Mantener**: `agenda_editar_serie(cita, 'esta', p_inicio, p_fin)` (D14).
  - **Modificar**: primero `agenda_previsualizar_edicion_serie(cita, p_fecha, p_hora_local)` para
    escribir la frase («las siguientes pasarán a ser el 3.er jueves de cada mes», o «el último
    jueves de cada mes» si `ultimo`, con el aviso de los meses `recortada`). Tras aceptar,
    `agenda_editar_serie(cita, 'esta_y_siguientes', p_fecha, p_hora_local)` y confirmar la
    propuesta de la ancla, como dice la nota D6.
- Los fragmentos de §3 son los motivos legibles del ADR-068.1. Su mapeo a textos de interfaz es de
  T-014 (`lib/citas/errores.ts`).
- T-014 debe llevar T-011b en `depende_de`.

---

## Lo que no entra, y por qué

- **Interfaz.** El diálogo de «mantener o modificar» y la rama «esta y las siguientes» son de
  T-014, igual que la frase en castellano y el envoltorio TS de la previsualización. Aquí se dejan
  la firma de edición, la previsualización y la sección «Para T-014».
- **Descartar propuestas automáticamente.** D4 y el ADR-068, punto 1: el rechazo al confirmar
  cierra el riesgo sin que nada desaparezca a espaldas del usuario.
- **Corregir la deriva del ordinal de `ocurrencias_serie`** (hallazgo 5) y **retirar el `insert`
  directo** (hallazgo 6). No los pide el ADR-068.
- **Consumidor del outbox y aviso de propuestas pendientes.** T-015.
- **Recalcular propuestas sin cita, `fin_el` y `sesiones_totales`.** Hallazgos 2 y 3: no los pide
  H8 ni H9.
- **H5 de T-014** (`fn_proteger_cita_pasada` no impide mover una cita futura al pasado por
  `agenda_actualizar_cita`). Es otra puerta, la de «solo esta», y la cierra T-014 en la acción. Aquí
  solo se cierra la puerta de las propuestas (§1.6.5).
- **Transiciones de estado del ADR-045** y **mensajes distinguibles** de `errores.ts`. No los pide el
  contrato, y los mensajes los consume T-014.
- **Unificar `agenda_cancelar_cita` con el ancla nueva.** Ya parte de la cita elegida (F14).
