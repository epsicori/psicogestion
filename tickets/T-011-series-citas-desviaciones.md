---
id: T-011
titulo: Series de citas con desviaciones
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-010]
estado: pendiente
---

# Contexto

La terapia es semanal por naturaleza: se cita «los martes a las 12 durante ocho sesiones»,
no ocho veces una cita. Pero una serie se rompe constantemente —el paciente se va de viaje,
el profesional enferma, cae festivo, cambia la hora en marzo— y un modelo que no lo prevea
acaba obligando a borrar la serie y rehacerla a mano.

T-010 dejó las tablas. Este ticket escribe **la materialización y las desviaciones**, que
es donde vive toda la dificultad. **Se lee antes que T-014**: ahí es donde se formatean las
horas, y quien no haya entendido esto las formateará mal.

Referencias: `docs/architecture.md` §Invariante 4. ADR **034** (hora local + zona en la
serie, instante + zona en la cita; anomalías de marzo y octubre; nada se recalcula solo),
**024** (outbox en Postgres), **045** (estados). `docs/interfaz.md` §Lo que el prototipo no
cubre — «Series de citas» está en la lista, así que **no vale «mira el prototipo»**.

## Tareas

- [ ] **Materializar** al crear la serie: se generan las citas una a una, cada una con su
      `inicio`/`fin` en `timestamptz` y la **instantánea de zona** del centro. La serie
      guarda la intención; las citas, los hechos.
- [ ] **Anomalías de horario de verano**, deterministas y ambas marcadas como desviación
      `anomalia_horaria`:
      - El **hueco de marzo** (la hora local no existe): el instante válido más cercano
        **hacia delante**.
      - El **solapamiento de octubre** (la hora local ocurre dos veces): **la primera** de
        las dos.
- [ ] **Festivos y ausencias**: al materializar se saltan los de `disponibilidad`,
      **proponiendo el desplazamiento y dejando decidir**. Nunca se salta en silencio ni se
      coloca encima.
- [ ] **Editar o cancelar una cita de una serie** pregunta siempre **«¿solo esta, o esta y
      las siguientes?»**. **Nunca «todas»**, que es la opción que destruye el histórico.
- [ ] **Las citas pasadas no se tocan jamás**, ni eligiendo «esta y las siguientes».
      Tienen notas clínicas y cobros colgando: son historia, no planificación. Se hace
      cumplir con un **disparador**, no solo con la interfaz.
- [ ] **Una cita tocada a mano queda `desviada`** y la serie **no la sobrescribe nunca**
      más. Cancelar la serie entera afecta solo a las futuras **no desviadas**.
- [ ] **Cambiar la zona de un centro o la regla de una serie no mueve nada solo**: genera
      un **evento de outbox** (ADR-024) con las citas futuras afectadas, y se confirma cita
      a cita. El motivo es que `wa.me` no devuelve estado de entrega: el sistema no sabe qué
      citas conoce ya el paciente, y moverlas por su cuenta es mandar a alguien a una
      consulta vacía.
- [ ] **Server Actions** para crear serie, desplazar, cancelar «esta» / «esta y las
      siguientes» y confirmar el desplazamiento propuesto, todas validadas con el mismo
      esquema Zod que use el formulario.
- [ ] Formateo de horas **en servidor**, en la zona del centro, bajando como cadena. Con
      **`@date-fns/tz`** (`TZDate`, `tz`) — **no `date-fns-tz`**, que es el de v2/v3.

## Criterios de aceptación (verificables)

- [ ] **Automático** — serie de ocho sesiones los martes a las 12:00 `Europe/Madrid`
      creada el 1 de febrero: las ocho citas tienen la **misma hora local** y **dos
      `inicio` distintos en UTC** a un lado y otro del cambio de marzo.
- [ ] **Automático** — serie que cae en el hueco del último domingo de marzo a las 02:30:
      la cita existe, su `inicio` es el primer instante válido posterior y
      `motivo_desviacion = 'anomalia_horaria'`.
- [ ] **Automático** — serie que cae en el solapamiento de octubre: se elige la primera de
      las dos ocurrencias, y queda marcada igual.
- [ ] **Automático** — desplazar una cita a mano y luego editar la serie con «esta y las
      siguientes»: la desplazada **conserva** su hora.
- [ ] **Automático** — «esta y las siguientes» sobre una serie con tres citas pasadas:
      las tres pasadas quedan **byte a byte iguales**; intentarlo por SQL directo **falla**
      por disparador.
- [ ] **Automático** — cambiar `centros.zona_horaria`: **ninguna** fila de `citas` cambia,
      y aparece **una** fila de outbox con las citas futuras afectadas.
- [ ] **Automático** — crear una serie que pisa un festivo de `disponibilidad`: esa sesión
      **no** se materializa encima; queda como propuesta pendiente de confirmar.

## Guion de comprobación manual

1. `npx supabase db reset && npm run seed`.
2. Crear una serie de ocho sesiones que cruce el último domingo de marzo.
3. Comprobar en Studio que la hora local es la misma en las ocho y el UTC cambia.
4. Mover la quinta media hora, editar la serie con «esta y las siguientes» y comprobar que
   la quinta no se mueve.

## Notas para el agente

- **Todo el cálculo de fechas en servidor.** Ni un `new Date()` en cliente: hidratación, y
  además el navegador está en la zona del usuario, no en la del centro.
- El diseño tiene que decir **dónde** se materializa: función de Postgres o Server Action.
  Hay argumentos para las dos; lo que no vale es que estén en ambas.
- La lista de zonas se valida con `es_zona_iana()` (T-001) contra `pg_timezone_names`. Solo
  nombres IANA: ni offsets fijos ni abreviaturas.
- «Todas» no aparece en ningún menú, ni desactivada. Una opción gris revela que existe.
- Las pruebas de marzo y octubre son las que descubren los bugs. Escríbelas primero.

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

## Verificación · 11-09-2026

Ejecutada contra la base local de verdad, sobre `T-011a-series-materializacion`
(`efc3ad6`), antes de tocar una línea. **Los siete criterios automáticos pasan**, dentro de
`npm run test:rls`: **325 aserciones, cero fallidas, 17 módulos**.

**La prueba que decide, y que no es volver a correr el banco.** El criterio 3 —el solape de
octubre— tiene tres aserciones, y dos de ellas siguen verdes con la respuesta equivocada:
una cita a las 02:30 lee «02:30 local» tanto si se eligió la primera ocurrencia como la
segunda. Se mutó `resolver_hora_local()` cambiando `least()` por `greatest()` en la rama
`ambigua` —es decir, eligiendo la SEGUNDA de las dos—, `db reset` y banco:

    NOTICE:  OK: Criterio 3: la cita del solape de octubre existe y queda marcada anomalia_horaria
    NOTICE:  OK: Criterio 3: el instante elegido lee 02:30:00 en hora local
    ERROR:   ASERCIÓN FALLIDA: GEMELA (discrimina de verdad): una hora UTC más tarde
             TAMBIÉN lee 02:30:00 — confirma que la hora era ambigua de verdad y no una
             elección arbitraria
    npm run test:rls → código 3

Las dos primeras siguen en verde; **solo cae la gemela**. Revertida la mutación, el banco
vuelve a 0. La gemela del §10 del diseño era necesaria y está bien puesta: sin ella, este
ticket habría entrado eligiendo la ocurrencia equivocada de octubre sin que nada avisara.

**Las demás puertas**, todas limpias: `npx supabase db reset`, `npm run lint`,
`npm run lint:migraciones` (10 migraciones), `npx vitest run` (**382 pruebas, 38 ficheros**)
y `npm run build`. Comprobado además que el disparador `sellar_version_nota` y los seis de
`citas` existen DESPUÉS del reset, que es la trampa de Docker ya pagada en T-005.

**Dos comprobaciones vivas que el banco no hace**, contra la base y con `rollback`:

| Qué | Resultado |
|---|---|
| `update centros set zona_horaria = zona_horaria` (no-op) | **cero** filas de outbox: la guarda `is not distinct from` está puesta. Es el patrón del UPDATE espurio que mordió en T-005 |
| Privilegios de `anon`/`authenticated` sobre las dos tablas nuevas | `eventos_salientes`: **ninguno**, ni select. `propuestas_cita`: **solo `select`**. RLS activada en las dos. **Sin `TRUNCATE`** — la concesión por defecto que T-004 obliga a revocar |

## Revisión con Opus · 11-09-2026 — dos hallazgos MEDIA, los dos arreglados

Los dos se reprodujeron contra la base antes de arreglarlos, y los dos tienen ahora su
aserción en `scripts/rls/16-series.sql` §L, **demostrada roja con el arreglo quitado**.

### MEDIA · La cita que nace de una propuesta perdía el tipo de terapia

`agenda_confirmar_propuesta()`, en la rama sin `cita_id` —la que crea una cita nueva desde
una propuesta de festivo, ausencia u ocupada—, **no escribía `tipo_terapia_id`**, porque
`propuestas_cita` no lleva esa columna. Reproducido: serie con tarifa, festivo dentro,
confirmar la propuesta.

    serie.tipo_terapia_id = a1900001-0000-4000-8000-000000000001
    cita confirmada.tipo_terapia_id = NULL

No es cosmético: `tipos_terapia` es donde viven **`tarifa_base` y `regimen`** (el régimen de
IVA). Una sesión desplazada por un festivo nacía sin precio y sin régimen. Y **la pérdida
era definitiva**: en cuanto la sesión pasa, `fn_proteger_cita_pasada()` prohíbe cambiar
`tipo_terapia_id`, así que ya no hay forma de corregirla — ni por la aplicación ni por SQL.
El banco no lo veía porque sus aserciones del criterio 7 comprueban `desviada` y
`motivo_desviacion`, no el tipo.

**Arreglado** recuperándolo de `series_cita`, que es de donde nació la propuesta. Si la
propuesta no cuelga de una serie queda `null` como antes: no hay de dónde sacarlo y no se
inventa. Las propuestas nacidas de un evento siempre traen `cita_id`, así que van por la
otra rama —mover una cita existente— y nunca perdieron nada.

**Negativa**: §L.1 del banco. Con el arreglo quitado (`v_tipo_terapia_id` → `null`):

    ERROR:  ASERCIÓN FALLIDA: REVISIÓN: la cita creada al confirmar una propuesta
            CONSERVA el tipo_terapia_id de su serie
    npm run test:rls → código 3

### MEDIA · «Esta y las siguientes» resolvía contra el evento equivocado, y en silencio

`agenda_editar_serie()` buscaba el evento que acababa de provocar con **«el más reciente de
esta serie»**:

    select e.id into v_evento_id from public.eventos_salientes e
     where e.tipo = 'agenda.regla_serie_cambiada'
       and e.carga ->> 'serie_id' = v_serie_id::text
     order by e.creado_en desc limit 1;

`creado_en` es `now()`, que **no avanza dentro de una transacción**: dos ediciones seguidas
en la misma transacción empatan y el desempate cogía la vieja. Reproducido —serie a las
11:00, editar a 16:00, editar a 17:00, misma transacción—:

    r1: {"alcance":"esta_y_siguientes", "evento_id":"c6d2b030-…", "propuestas":[3 ids]}
    r2: {"alcance":"esta_y_siguientes", "evento_id":"c6d2b030-…", "propuestas":[]}
    propuestas por hora: 16:00:00 x3
    regla vigente de la serie: 17:00:00

El **mismo `evento_id`** en las dos llamadas. La segunda edición reprocesa el evento de la
primera, la idempotencia por `(evento_id, cita_id)` hace lo correcto y no crea nada, y el
resultado es el peor posible: **la regla queda a las 17:00, las citas siguen a las 11:00 y
no hay ni una propuesta pendiente que lo reconcilie**. Sin error y sin aviso.

PostgREST da una transacción por llamada, así que desde la pantalla dos ediciones seguidas
no empatan por `now()`. Pero la consulta es **por contenido, no por identidad**: dos
ediciones concurrentes de la misma serie resuelven las dos contra la misma fila y reproducen
el fallo por otro camino. Y el banco entero corre en UNA transacción, que es donde apareció.

**Arreglado** publicando la identidad: `fn_evento_regla_serie()` hace
`set_config('app.agenda_evento_regla', <id>, true)` con el evento que acaba de insertar, y
`agenda_editar_serie()` limpia el ajuste **antes** de tocar la regla y lee después lo que
haya quedado. Si la regla no cambió de verdad no queda nada, y se devuelve la rama de «sin
evento que resolver» — que antes reprocesaba el último de la serie.

**Negativas**: §L.2 del banco, tres aserciones más la gemela de la edición que no cambia
nada. Con el arreglo quitado (vuelta al `order by creado_en desc`):

    ERROR:  ASERCIÓN FALLIDA: REVISIÓN: dos ediciones en la MISMA transacción
            resuelven contra eventos DISTINTOS
    npm run test:rls → código 3

### Después de los dos arreglos

`npm run test:rls`: **331 aserciones, cero fallidas** (325 + las 6 de §L). `npm run lint`,
`npm run lint:migraciones`, `npx vitest run` (382 pruebas) y `npm run build`, limpios.
`npm run tipos` **sin deriva**: ninguno de los dos arreglos cambia una firma.

### Anotado, no arreglado — no es de este ticket

1. **`scripts/rls/14-cadena-huellas.sql` miente en su cabecera**: dice «Al ser el último,
   nada corre después», y desde T-010 corren `15-agenda` y `16-series` detrás. Hoy es
   inofensivo —el módulo restaura el `grant` y el disparador que levanta (líneas 579-581) y
   ni 15 ni 16 tocan `notas_clinicas_versiones`—, pero es una afirmación falsa justo en el
   sitio donde el próximo módulo irá a buscar la regla.
2. **La aserción byte a byte del criterio 6 compara en un solo sentido**
   (`después EXCEPT antes`, sin contar filas), así que **no vería un borrado**. La del
   criterio 5 sí lo ve, porque añade `count(*) = 3`.
3. **`agenda_propuestas_de_evento()` marca el evento `entregado` aunque solo haya procesado
   una parte**: con un evento de centro que afecta a varios profesionales, quien llame
   primero omite las citas que no le tocan —correcto— y deja el evento marcado como
   resuelto. Nada se pierde hoy (la función no mira el estado, y el siguiente llamante
   todavía crea las suyas), pero el consumidor de T-015 no volverá a barrerlo.
4. **Las propuestas nacidas de un evento no guardan `serie_id`** aunque la cita pertenezca a
   una serie. `listarPropuestasPendientes()` no filtra por serie, así que hoy no se nota;
   quien quiera «las propuestas de esta serie» no las encontrará.
5. **`listarPropuestasPendientes()` devuelve `[]` cuando la consulta falla** (registra en
   `console.error` y sigue). En una pantalla de propuestas pendientes, un fallo de lectura
   se ve igual que «no hay nada que decidir». El resto del módulo devuelve `ResultadoCitas`.
6. **`resumirPropuesta()` devuelve `fechaPrevistaCorta` sin formatear**: es la cadena ISO
   cruda (`2027-04-15`), no la fecha corta en castellano que da `formatearFechaCorta()` para
   las citas. Lo verá el corte de MiniMax (T-011b).
7. **Ni las políticas de T-010 ni las funciones de dominio exigen
   `es_profesional_asignado(paciente_id)`**: un profesional puede crear una serie o una cita
   para un `paciente_id` que no tiene asignado. No filtra nombres —`citas_agenda` solo
   expone ids y `pacientes` sigue cerrada por RLS— y **viene de T-010**, no de aquí: la
   función de dominio replica el predicado de `citas_alta` tal cual, como mandaba el diseño.
   Va al ticket que lo creó.
