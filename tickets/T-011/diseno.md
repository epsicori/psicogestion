## Diseño aprobado · 10-09-2026

### 0 · Hechos verificados contra el código, no supuestos

| Hecho | Dónde se comprobó | Consecuencia |
|---|---|---|
| `series_cita`, `citas`, `disponibilidad`, `tipos_terapia`, los cuatro enums, `rango_bloqueante`, `citas_sin_solape_profesional`, la vista `citas_agenda` y `agenda_actualizar_cita()` **ya existen** | `supabase/migrations/20260906120000_agenda_esquema.sql` | T-011 **no crea ninguna tabla de agenda**: añade materialización, desviaciones, dos tablas de estado operativo y cuatro disparadores |
| **No existe ninguna tabla de outbox** (cero coincidencias de `outbox`, `cola_`, `eventos_` en `supabase/`) | `supabase/**` | T-011 la crea con la forma completa del ADR-024 y **sin consumidor ni cron**: eso es T-015/T-026 |
| `lib/agenda/` contiene **solo** `estados-cita.ts` y su prueba: módulo puro, sin reloj ni base de datos | `lib/agenda/` | El puente de servidor **no entra ahí**. Ver §1 |
| `lib/fechas/anomalias.ts` **clasifica y no decide**, y su cabecera dice literalmente «qué se hace con una cita ambigua es de T-011» | `lib/fechas/anomalias.ts` | La regla de decisión es de este ticket. El SQL usa **las mismas tres palabras** (`normal`/`inexistente`/`ambigua`): es un contrato de vocabulario entre carriles |
| `lib/fechas/formato.ts` ya formatea con `@date-fns/tz` (`tz()`) y locale `es` | `lib/fechas/formato.ts` | T-011 **no añade dependencias** y **no escribe otro formateador**: lo llama |
| El banco de RLS va por `15-agenda.sql` y su README manda añadir **al final, con el número siguiente** | `scripts/rls/README.md` §7 | El módulo de T-011 es `scripts/rls/16-series.sql` |
| `fn_validar_zona_horaria('<columna>')`, `es_zona_iana()`, `centros_actuales()`, `rol_actual()`, `fn_auditar('<clave>', …)` existen y son el patrón | T-001/T-002/T-004 | Se reutilizan; no se reescribe ninguna |
| El linter exige `enable row level security` en el mismo fichero para toda tabla nueva y `set search_path` en toda `security definer` | `scripts/lint-migraciones.ts` reglas 3 y 4 | Las dos tablas nuevas nacen con RLS; las funciones, con `search_path = ''` |
| **Ocho martes semanales desde el 1 de febrero de 2026 terminan el 24 de marzo**, antes del cambio del 29 | calendario real | El primer criterio de aceptación no puede pasar tal como está redactado. Ver §12 |

### 1 · La frontera de carriles, resuelta antes de diseñar nada

El ticket pide «Server Actions». `CARRILES.md` asigna `app/**` en exclusiva a MiniMax y
`lib/agenda/**` a Kimi. Se aplica **el mismo corte que T-005 y T-006**, ya escrito en
`docs/state.md`: **la fábrica escribe el mecanismo; la directiva `"use server"` y la pantalla
las escribe MiniMax.**

| Entrega | Rama | Quién | Qué escribe |
|---|---|---|---|
| **T-011a · Materialización y desviaciones** | `T-011a-series-materializacion` | fábrica | `supabase/migrations/*`, `lib/citas/**`, `scripts/rls/16-series.sql`, `lib/supabase/tipos-bd.ts`, `docs/**` |
| **T-011b · Acciones y diálogo de alcance** | `T-011b-acciones-series` | MiniMax | `app/**`, `components/**`, `lib/i18n/**` — corte en `minimax/cortes/T-011.md` |

**El puente de servidor va en `lib/citas/`, carpeta nueva. No en `lib/agenda/`.** Por orden de
peso:

1. `lib/agenda/**` es de Kimi y está **reservado a funciones puras**: sin reloj, sin base de
   datos, sin `server-only`. Un módulo que abre un cliente de Supabase no es eso.
2. Existe el precedente exacto y de este mismo carril: `lib/huella/` (T-005) y `lib/cuentas/`
   (T-006a) son mecanismo de servidor escrito por la fábrica, fuera de `app/`.
3. `lib/citas/` **no casa con ningún glob de otro carril**.

**Excepción de territorio registrada al aprobar este diseño**: `lib/citas/**` (y `lib/huella/**`,
`lib/cuentas/**`, que ya existían sin registrar) añadidas al `prohibido` de `kimi/alcance.json` y
`minimax/alcance.json`, y a `CARRILES.md` §Territorio de escritura → **Claude**.

**Lo que T-011a NO escribe, y no es negociable**: ni un fichero con `"use server"`, ni una
pantalla, ni una clave de i18n. Si hiciera falta, se para y se amplía el corte de MiniMax.

### 2 · La decisión grande: la materialización vive en Postgres

Una sola vía, como manda el ticket: `agenda_crear_serie()`, `security definer`, y **cero
cálculo de instantes en TypeScript**. Cinco motivos, del más caro al más barato:

1. **No hay transacción del lado del cliente.** `supabase-js` habla por PostgREST y cada llamada
   es su propia transacción: materializar ocho citas desde TypeScript son nueve escrituras sin
   atomicidad, y un fallo en la quinta deja media serie creada sin forma de saberlo. Es el
   argumento del **ADR-024** —«el evento se inserta en la misma transacción que el hecho que lo
   origina»— aplicado a la serie.
2. **El outbox obliga a Postgres igualmente.** «Cambiar la zona de un centro genera un evento»
   debe cumplirse venga el cambio de Ajustes, de un guion o de Studio: eso es un **disparador**.
3. **Una sola base de datos de zonas.** Postgres resuelve `at time zone` con su tzdata; Node con
   el ICU de la imagen. Dos tzdata dando instantes distintos para la misma serie es un fallo que
   no se reproduce en local.
4. **El técnico administrativo no tiene `select` sobre `citas`** y `INSERT … RETURNING` aplica la
   política de `SELECT`. Sin `definer` no puede crear una serie y recuperar lo creado.
5. **Auditoría y solo-adición se cumplen por construcción** (T-004), en la misma transacción que
   la fila que las origina.

**Lo que sigue en TypeScript, y solo eso**: esquemas Zod, puente de llamada, mapeo de SQLSTATE a
motivo y **formateo de horas** con `lib/fechas/`.

### 3 · La primitiva que decide: `resolver_hora_local()`

```sql
public.resolver_hora_local(p_zona text, p_local timestamp)
  returns table (instante timestamptz, clasificacion text)  -- 'normal' | 'inexistente' | 'ambigua'
  language plpgsql stable   -- NO immutable: la tzdata cambia
```

1. `v_ref := p_local at time zone 'UTC'` — la hora de pared leída como si fuera UTC.
2. Desfase en un instante `t`: `(t at time zone p_zona) - (t at time zone 'UTC')`. Se toman los
   de `v_ref - 1 day` y `v_ref + 1 day`.
3. Candidatos: `v_ref - desfase` para cada desfase **distinto**, conservando los que cumplen
   `(candidato at time zone p_zona) = p_local`.
4. **Uno** → `normal`. **Dos** → `ambigua`, y se devuelve `least(...)`: **la primera de las
   dos**. **Cero** → `inexistente`.
5. En `inexistente`, el instante es **`min{ t : (t at time zone p_zona) >= p_local }`**, por
   bisección de resolución de un segundo dentro del intervalo que contiene el salto. Acotada a
   20 iteraciones.

**Interpretación fijada del «instante válido más cercano hacia delante»**: el 29-03-2026 a las
02:30 en `Europe/Madrid` la respuesta es **03:00 local (01:00 UTC)**, el instante del salto — el
más cercano. **No** son las 03:30. La prueba del banco distingue las dos comprobando que un
segundo antes del instante elegido la hora de pared es `01:59:59`.

Complemento, calendario puro:

```sql
public.ocurrencias_serie(
  p_periodicidad public.periodicidad_serie, p_dia_semana smallint,
  p_desde date, p_sesiones smallint, p_fin_el date
) returns setof date   -- stable
```

- Primera fecha: el primer día `>= p_desde` con `extract(isodow) = p_dia_semana` (**isodow**,
  nunca `dow`).
- `semanal` `+7 días`; `quincenal` `+14 días`; `mensual` **el mismo ordinal de día de la semana
  del mes siguiente**, recortando al **último** de ese día si el mes no lo tiene.
- **Tope duro de 200 ocurrencias** (`22023` al superarlo).

### 4 · Dos tablas nuevas, las dos de estado operativo

Ninguna entra en `tablas_solo_adicion`.

**`public.eventos_salientes`** — el outbox del ADR-024, con su forma completa y **sin
consumidor**: `id`, `tipo text` (check de forma `tipo.subtipo`, texto y no enum a propósito: el
conjunto no está cerrado), `carga jsonb`, `estado public.estado_evento_saliente` (`pendiente` /
`entregado` / `fallido`), `intentos`, `ultimo_error`, `proximo_intento`, `clave_idempotencia
unique` nulable, `creado_en`/`actualizado_en`, `creado_por → perfiles`. Índice parcial
`(proximo_intento) where estado='pendiente'`. **RLS activada y CERO políticas, cero `grant`**:
solo escriben los disparadores `security definer`.

**`public.propuestas_cita`** — lo que se propone y no ha decidido nadie: `id`, `serie_id`,
`cita_id` (nulo si la sesión nunca existió), `evento_id`, `paciente_id`, `profesional_id`,
`centro_id`, `motivo public.motivo_propuesta_cita` (`festivo`/`ausencia`/`ocupada`/
`zona_cambiada`/`regla_cambiada`), `fecha_prevista`, `hora_local_prevista`, `inicio_propuesto`,
`fin_propuesto`, `zona_horaria`, `estado public.estado_propuesta_cita` (`pendiente`/`confirmada`/
`descartada`), `resuelta_en`, `resuelta_por`, `cita_resultante_id`, `creada_en`, `creada_por`.
Checks de forma cruzada (siempre cuelga de algo; resuelta ⇔ tiene fecha de resolución; confirmada
⇔ tiene cita resultante). Disparadores de zona y auditoría. **RLS: una sola política de
`select`** (misma forma que `citas_lectura` + rama del técnico); **ninguna de `insert`/`update`**:
solo las funciones `definer`. Añadir `propuestas_cita_lectura` al catálogo de
`scripts/rls/11-cobertura.sql`.

### 5 · Cuatro disparadores

| Disparador | Cuándo | Qué hace |
|---|---|---|
| `proteger_cita_pasada` | `before update or delete on citas` | Con `old.fin <= now()`: `DELETE` falla siempre (`42501`); `UPDATE` falla si cambia `inicio`/`fin`/`zona_horaria`/`serie_id`/`paciente_id`/`profesional_id`/`centro_id`/`tipo_terapia_id`/`desviada`/`motivo_desviacion`. Sigue permitido cambiar `estado`, `sala`, `nota_operativa`, `marcada_realizada_en/_por` |
| `marcar_cita_desviada` | `before update of inicio, fin, zona_horaria on citas` | Si `serie_id is not null` y el instante cambia de verdad: `desviada := true`. Salvo que la transacción venga de la maquinaria de la serie (marca de origen, ver abajo) |
| `evento_zona_centro` | `after update of zona_horaria on centros` | Una fila en `eventos_salientes`, tipo `agenda.zona_centro_cambiada`, con las citas futuras afectadas en la carga. No toca `citas` |
| `evento_regla_serie` | `after update of dia_semana, hora_local, duracion_minutos, zona_horaria on series_cita` | Ídem, tipo `agenda.regla_serie_cambiada`, con las citas futuras no desviadas |

**Marca de origen**: las funciones de serie hacen `set_config('app.agenda_origen','serie',true)`
(local a la transacción) y `marcar_cita_desviada` la lee. Así, mover una cita porque la serie lo
dice y un humano lo confirmó **no** la marca desviada; moverla a mano sí.

### 6 · Las funciones de dominio

Todas `security definer`, `set search_path = ''`, `revoke`/`grant execute to authenticated`,
mismo predicado de autorización que las políticas de T-010.

- **`agenda_crear_serie(...)`** — resuelve zona (centro → organización, nunca `UTC` silencioso),
  exige `p_desde >= hoy`, inserta `series_cita`, y por cada fecha de `ocurrencias_serie()`:
  resuelve la hora con `resolver_hora_local()`; si cae en festivo/ausencia de `disponibilidad`,
  **no inserta la cita**, crea una `propuestas_cita`; si choca con
  `citas_sin_solape_profesional` (`23P01`, capturado sesión a sesión), también propuesta con
  motivo `ocupada`; si no, inserta la cita con `desviada = (clasificacion <> 'normal')`. Devuelve
  `{serie_id, zona_horaria, citas:[...], propuestas:[...]}`. Una sesión convertida en propuesta
  consume su hueco: 8 sesiones con un festivo dentro son 7 citas y 1 propuesta.
- **`agenda_cancelar_cita(p_cita_id, p_alcance, p_motivo)`** — `p_alcance` es
  `public.alcance_cambio_serie`, enum de **exactamente dos valores**: `esta`, `esta_y_siguientes`
  (sin valor por defecto: la pregunta es obligatoria por firma). `esta_y_siguientes` salta las
  desviadas y las devuelve nombradas en `saltadas_desviadas`.
- **`agenda_editar_serie(p_cita_id, p_alcance, ...)`** — `esta` llama a
  `agenda_actualizar_cita()` de T-010 (no hay un segundo camino de escritura de citas).
  `esta_y_siguientes` **no mueve nada**: actualiza la regla de `series_cita` (dispara el evento)
  y llama a `agenda_propuestas_de_evento()`.
- **`agenda_propuestas_de_evento(p_evento_id)`** — único sitio donde se crean propuestas a partir
  de un evento, para `regla_serie_cambiada` y `zona_centro_cambiada`. Idempotente por
  `where not exists`. Marca el evento `entregado`.
- **`agenda_confirmar_propuesta`** / **`agenda_descartar_propuesta`** — solo sobre `pendiente`;
  con `cita_id` mueve esa cita con la marca de origen puesta (no queda desviada); sin `cita_id`
  crea la cita desde la propuesta (sí queda desviada, con el motivo mapeado). El choque `23P01`
  se propaga tal cual.

### 7 · Festivos y ausencias

`disponibilidad` con `tipo in ('festivo','ausencia')`, `perfil_id` del profesional,
`(centro_id is null or = el de la cita)`, rango de fechas, y si trae horas, solo bloquea si se
solapa. Desplazamiento propuesto: el primer día natural siguiente (hasta 7) a la misma hora local
que no choque; si ninguno vale, propuesta sin hora, la decide una persona.

**Anotado, no arreglado**: `disponibilidad.perfil_id` es `not null`, así que un festivo de centro
exige hoy una fila por profesional. Es de T-010 y no se toca aquí.

### 8 · El puente de TypeScript: `lib/citas/`

Todos los módulos con `import 'server-only'`. `lib/citas/tipos.ts`, `esquemas.ts` (con
`esquemaAlcance = z.enum(['esta','esta_y_siguientes'])`), `series.ts` (`crearSerie`,
`editarSerie`, `cancelarCita`), `citas.ts` (`desplazarCita`, sobre
`agenda_actualizar_cita` de T-010), `propuestas.ts` (`listarPropuestasPendientes`,
`confirmarPropuesta`, `descartarPropuesta`, `generarPropuestasDeEvento`), `presentacion.ts`
(`resumirCita`, `resumirPropuesta` — horas **ya formateadas** con `lib/fechas/`, nunca un
instante crudo baja al navegador). Mapa de errores único:
`23P01→hueco_ocupado`, `42501→no_autorizado|cita_pasada`, `22023→parametro_invalido`,
resto→`desconocido`.

### 9 · Orden de la migración

Enums → `eventos_salientes` → `propuestas_cita` + índices + disparadores + RLS →
`resolver_hora_local()`/`ocurrencias_serie()` → `fn_proteger_cita_pasada()` +
`fn_marcar_cita_desviada()` → `fn_evento_zona_centro()` + `fn_evento_regla_serie()` →
las seis funciones de dominio → `grant`/`revoke` → comentarios. Después `npm run tipos` y
`npm run lint:migraciones`.

### 10 · El banco: `scripts/rls/16-series.sql`

Al final, como manda el README. Las aserciones de marzo/octubre se escriben antes que la
migración. **Nada de fechas de un año concreto a mano**: anclas calculadas desde `now()`
(`v_anio := extract(year from now())::int + 1`; último domingo de marzo/octubre calculado). Las
aserciones que discriminan de verdad: los **dos desfases UTC** distintos en la serie que cruza
marzo, el segundo **anterior** al instante elegido en el hueco (`01:59:59`), y la **hora**
siguiente también válida en el solapamiento de octubre (se eligió la primera). Toda negativa con
su gemela positiva.

### 11 · Riesgos, por probabilidad

1. Que marzo/octubre pasen por el motivo equivocado — mitigado con las tres aserciones que
   discriminan (§10).
2. `dow` en vez de `isodow` — un domingo, seis meses después. El banco prueba con domingo (`7`).
3. La marca de origen mal puesta: una confirmación sin la marca deja la cita `desviada` para
   siempre y la serie deja de gobernarla.
4. El disparador de pasado demasiado ancho: si bloqueara `estado`, marcar `realizada` una sesión
   de ayer dejaría de funcionar.
5. Media serie creada por una excepción no capturada que no sea `23P01`.
6. Zona nula resuelta en silencio a `'UTC'` — se lanza `22023` en su lugar.

### 12 · Tres cosas que el ticket da por buenas y no lo son

1. **El primer criterio de aceptación no puede pasar tal como está escrito** con «creada el 1 de
   febrero» (las ocho caen todas antes del cambio de marzo de 2026). El banco lo ancla en «los
   ocho martes que empiezan tres semanas antes del último domingo de marzo del año que viene»,
   que cumple la propiedad buscada y no caduca. Se corrige el ejemplo de fecha, no la propiedad
   verificada.
2. **`periodicidad = 'mensual'` no está definida en ningún sitio.** Se elige el **ordinal del día
   de la semana del mes** (recortando al último si el mes no lo tiene), reversible y barato. Los
   siete criterios de aceptación son semanales, así que esto no bloquea: queda anotado como
   pregunta abierta al propietario, no como bloqueo.
3. **La base no impone la tabla de transiciones de estado del ADR-045** (nada impide volver de
   `realizada` a `programada` por SQL directo). No es de este ticket — anotado en `docs/state.md`
   para quien lo recoja, candidato natural: un disparador `before update of estado`.
