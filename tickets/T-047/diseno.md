# T-047 · Diseño — Agenda: vista anual como mapa de densidad

> Arquitecto, 06-10-2026. Contrato: `tickets/T-047-vista-anual-agenda.md` (D1–D5 cerradas por el
> propietario). Riesgo **alto**: dos lecturas nuevas sobre `citas` y `citas_agenda` con las dos
> ramas por rol. El implementador ejecuta este documento sin decidir nada de diseño; lo que
> queda abierto está en «Preguntas abiertas» y **bloquea el arranque hasta que el propietario
> responda** (la recomendada es la que este diseño ya desarrolla).

## Preguntas abiertas

**Respondida (06-10-2026)**: P1 = (a) dos funciones en un solo `Promise.all`. El diseño de abajo queda en pie tal cual.

**P1 · «Una sola llamada a la base por render» frente a «la lista de profesionales sale de lo visible
en el año» y CA3 («la salida no contiene ningún nombre»).** Las tres cosas no caben juntas:

- El selector de profesional necesita **nombres**, y en el mes salen de las filas de
  `agenda_citas_rango` (`vista.ts:188-192`).
- CA3 prohíbe que la función de densidad devuelva un nombre. Si devolviera una fila por (día,
  profesional), el número de filas sería 366 × N, y eso rompe «≤ `max_rows` por construcción».
- Por tanto la lista tiene que salir de **otra** lectura.

| Opción | Qué es | Coste |
|---|---|---|
| **(a) Recomendada** | Dos funciones con las mismas ramas y guardas: `agenda_densidad_anual` (recuentos) y `agenda_profesionales_anuales` (id y nombre de quien tiene citas visibles en el año). Las dos se llaman en **un solo `Promise.all`**, como el mes ya hace con `leerCitasRango` + `listarPropuestasPendientes` (`page.tsx:37`). «Una sola llamada» se lee como «una sola lectura de recuentos, no seis de 62 días». | Una función más en el banco 34 (bloque F). |
| (b) | Sin selector de profesional en el año: el filtro solo llega por la URL desde la semana o el mes. | Contradice «los mismos selectores» del contrato. |
| (c) | Lista sacada del directorio de profesionales de los centros del usuario. | El contrato lo descarta («no del directorio entero»). Además enseña a quien no tiene cita. |

El resto del documento desarrolla **(a)**. Con (b) se quitan `agenda_profesionales_anuales`, el
bloque F del banco y `listarProfesionalesDelAnio`. Nada más cambia.

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | `agenda_citas_rango(p_desde, p_hasta)` es la última forma vigente: plpgsql `stable security invoker`, `search_path = ''`. Lanza 22023 con «necesita sus dos extremos», «invertido o vacío» y «no puede pasar de 62 días». Pertenencia **por solape** (`inicio < hasta and fin > desde`). Rama `citas` acotada por `rol_actual() in (administrador, profesional_sanitario)`; rama `citas_agenda` para el técnico. Devuelve nombre y apellidos del paciente, tipo, nota y `profesional_nombre` (vía `directorio_perfiles`). | `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:1465-1578` |
| H2 | `citas_agenda` es la vista del técnico: `where rol_actual() = 'tecnico_administrativo' and centro_id in (select centros_actuales())`. Una cita sin centro **no** le llega. Columnas: id, paciente_id, profesional_id, centro_id, serie_id, inicio, fin, zona_horaria, estado, sala, desviada, motivo_desviacion, modalidad_asistencia. | misma migración `:1434-1462` |
| H3 | La política `citas_lectura` deja pasar `profesional_id = auth.uid()` **sin mirar el rol**. Por eso la rama `citas` necesita el filtro de rol explícito (un técnico que figure como profesional de una cita la leería dos veces). | `20260906120000_agenda_esquema.sql:691-699` |
| H4 | `citas.centro_id` admite nulo. `estado` es `estado_cita` (`programada`, `confirmada`, `realizada`, `cancelada`, `no_asistida`). Índices: `(profesional_id, inicio)`, `(centro_id, inicio)`, `(paciente_id)` y uno parcial por serie. **No hay índice por `inicio` solo.** | `20260906120000_agenda_esquema.sql:179-203`, `:225-228` |
| H5 | `es_zona_iana(text)`: `sql stable`. Un nulo da `false`. Rechaza `Etc/` y `posix/`. Tiene `grant execute … to authenticated`, que es imprescindible porque una función invoker la llama con el rol del usuario. | `20260822094547_…:964-977`, `:1343` |
| H6 | `max_rows = 1000` en la API local. PostgREST lo aplica también a las funciones que devuelven conjuntos. Este diseño no depende de ello porque devuelve ≤ 366 filas por construcción. | `supabase/config.toml:18` |
| H7 | En los disparadores de `insert` sobre `citas`, `postgres` no tropieza: `fn_exigir_vinculo_agenda` solo muerde a `profesional_sanitario`, porque `rol_actual()` es nulo. `proteger_cita_pasada` solo actúa en `update/delete`. `auditar_citas` escribe una fila de auditoría por cita, y eso supone 10 000 filas en el banco. | `20260911120000_vinculo_en_el_alta_de_agenda.sql:120`, `grep "create trigger" … on public.citas` |
| H8 | `?vista` solo admite `'mes'`; cualquier otro valor da `'semana'`. `Vista = 'semana' \| 'mes'`. El comentario de `leerParametros` dice «Ninguno llega a SQL», y eso deja de ser cierto con este ticket: centro y profesional pasan a ser parámetros con enlace de una RPC. | `app/(app)/agenda/parametros.ts:5`, `:28`, `:36` |
| H9 | `rangoDeVista` resuelve la semana con `limitesDeSemana` y trata **cualquier otro valor** como mes (rama `else`). `medianoche(fecha, zona)` es privada. | `app/(app)/agenda/bloques.ts:27-29`, `:40-47` |
| H10 | `construirVista` decide entre semana y mes con ternarias «si no es semana, es mes»: `:209`, `:279` y `:347-350`. El mes coloca cada cita por `fechaLocal(fila.inicio, zona)` (`:323`), es decir, por el día local de su inicio. La lista de profesionales sale de **todas** las filas, canceladas incluidas, antes del filtro de profesional (`:188-199`). | `app/(app)/agenda/vista.ts` |
| H11 | `BloqueCalendario` sigue este orden: `cargarContexto` → `fecha = parametros.fecha ?? hoy` → `rangoDeVista` → `Promise.all([leerCitasRango, listarPropuestasPendientes])` → filtro de centro en TS (`:41`) → `construirVista` → `<Calendario key=…>`. `Cuerpo` pone el calendario en `<Tarjeta className="p-4">` con `<Suspense fallback={<EsqueletoCalendario/>}>`. La página no es `async`. | `app/(app)/agenda/page.tsx:29-64`, `:66-105`, `:111` |
| H12 | `cargarContexto` está memoizada con `cache` y llama a `connection()`. Resuelve `centro` con `resolverCentro`, que solo acepta un centro ofrecido al usuario; si no, devuelve `null`. La zona sale de `zonaDeCentro(sesion, centro)` (`:96`) y `hoy` de `hoyEn` (`:100`). | `app/(app)/agenda/datos.ts:86-101`, `bloques.ts:64-69` |
| H13 | La isla `Calendario` guarda `fechaFoco` en estado. Su `href` construye `vista`, `fecha`, `centro` y `profesional` en ese orden (`:100-108`). Los botones Semana y Mes son `Link` con `aria-current="page"` dentro de `role="group"` (`:200-215`). Los filtros se muestran con `centros.length >= 2` y con `rol !== 'profesional_sanitario' && profesionales.length >= 2` (`:172-175`). La leyenda de estados va en `<details>` (`:280-283`). | `app/(app)/agenda/calendario.tsx` |
| H14 | El mes es `role="grid"` con sangría `-mx-4 sm:mx-0` (≈ 45 px por columna a 360 px). Las celdas son `min-h-11 … sm:pointer-fine:min-h-7` y hoy lleva `aria-current="date"`. El recuento sr-only usa `agenda.rejilla.sinCitas` / `citas.una` / `citas.varias` y cuenta **todas** las citas, canceladas incluidas (`:73`, `:110`). | `app/(app)/agenda/rejilla-mes.tsx:43-111` |
| H15 | `sumarDias`, `sumarMeses` (recorta al último día del mes) y `diaDeLaSemana` (lunes = 1 … domingo = 7) son puras y en UTC. `formatearFechaLarga(instante, zona)` da «martes, 3 de marzo de 2026». | `lib/fechas/calendario.ts:47-70`, `lib/fechas/formato.ts:18` |
| H16 | `ResultadoCitas<E>` = `{ ok: true } & E \| { ok: false; motivo; mensaje }`. 22023 → `parametro_invalido`. `fallo()` es privada de `agenda.ts`; `mapearErrorCitas` y `mensajeParaMotivo` se exportan desde `errores.ts`. | `lib/citas/tipos.ts:23-46`, `lib/citas/agenda.ts:6`, `:73-76` |
| H17 | Tokens: `--primary` es verde (hue 163); el malva es `--secondary` (hue 315), el color de selección. `lib/contraste/tokens.ts` lee `:root` de `globals.css` y solo conoce los umbrales 4,5 y 3,0 (`grande`); no hay un umbral «gráfico». | `app/globals.css:53-80`, `lib/contraste/tokens.ts:21-60` |
| H18 | Contraste medido con `lib/contraste/contraste.ts` para los cuatro tonos propuestos en §1.6, en oklch con hue 163. `foreground` sobre cada uno: 13,81 / 11,58 / 9,32 / 7,36. `primary` sobre cada uno: 8,28 / 6,95 / 5,59 / **4,41**. `primary` sobre `card`: 9,34. Los tonos frente a `card`: 1,13 a 2,12 (no llegan a 3:1, porque no llevan la información: §2 D9). | cálculo con `razonDeContraste`, mismo módulo que usa la prueba |
| H19 | Next 16: `<Link>` precarga en producción cada enlace que entra en el viewport; la guía pide `prefetch={false}` para listas grandes de enlaces. Con 365 días, este diseño la aplica (§2 D12). | `node_modules/next/dist/docs/01-app/02-guides/prefetching.md:27,64,319`; `…/03-api-reference/02-components/link.md:302` |
| H20 | Nada en la cola redefine lo que se usa aquí. T-043 (rama `T-043-aviso-de-hueco-raro`) solo hace `drop/create` de `agenda_bloques_profesional(uuid,uuid,date,date,smallint)`. T-023, T-026a, T-046 y T-023b no crean ni redefinen `citas`, `citas_agenda`, `agenda_citas_rango`, `directorio_perfiles`, `rol_actual`, `centros_actuales` ni `es_zona_iana`; T-023 solo **usa** `rol_actual()`. | `git show T-043-aviso-de-hueco-raro:supabase/migrations/20261012120000_hueco_raro.sql` (líneas `create/drop`: 7, 9, 203, 205); `grep` sobre los contratos y `tickets/T-023/diseno.md` |
| H21 | Años ya ocupados por el banco: Y+1 a Y+4 (16, 21, 23), Y+6 (26), Y+7 (17), Y+8 (19), Y+10 (29, T-043). T-023 propone `current_date + 1600` (≈ Y+5) y tendrá que anclarlo cuando rebase (regla 10.1). **Y+9 está libre.** | `scripts/rls/README.md:111-157`, `tickets/T-023/diseno.md:296`, `tickets/T-043/diseno.md:747-754` |
| H22 | El banco no tiene ninguna comprobación de catálogo con comodín sobre funciones (`like 'agenda_%'`), así que dos funciones nuevas no rompen ningún módulo existente. | `grep "from pg_proc" scripts/rls/*.sql` |

---

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261017120000_agenda_densidad_anual.sql`

Solo crea. No modifica ni borra nada existente. Contiene dos funciones, cada una con su `comment`,
su `revoke` y su `grant`.

#### 1.1.1 `public.agenda_densidad_anual`

```sql
create function public.agenda_densidad_anual(
  p_desde          timestamptz,
  p_hasta          timestamptz,
  p_zona           text,
  p_centro_id      uuid default null,
  p_profesional_id uuid default null
)
returns table (dia date, recuento integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'agenda_densidad_anual: faltan los extremos del rango' using errcode = '22023';
  end if;
  if p_hasta <= p_desde then
    raise exception 'agenda_densidad_anual: rango al revés o sin duración' using errcode = '22023';
  end if;
  if not public.es_zona_iana(p_zona) then
    raise exception 'agenda_densidad_anual: zona horaria no admitida' using errcode = '22023';
  end if;
  if p_hasta > ((p_desde at time zone p_zona) + interval '1 year') at time zone p_zona then
    raise exception 'agenda_densidad_anual: más de un año natural' using errcode = '22023';
  end if;

  return query
  with visibles as (
    select c.inicio, c.estado, c.centro_id, c.profesional_id
      from public.citas c
     where c.inicio >= p_desde and c.inicio < p_hasta
       and (select public.rol_actual()) in ('administrador'::public.rol_usuario,
                                           'profesional_sanitario'::public.rol_usuario)
    union all
    select a.inicio, a.estado, a.centro_id, a.profesional_id
      from public.citas_agenda a
     where a.inicio >= p_desde and a.inicio < p_hasta
  )
  select (v.inicio at time zone p_zona)::date, count(*)::integer
    from visibles v
   where v.estado <> 'cancelada'::public.estado_cita
     and (p_centro_id is null or v.centro_id = p_centro_id)
     and (p_profesional_id is null or v.profesional_id = p_profesional_id)
   group by 1
   order by 1;
end;
$$;
```

Reglas cerradas:

- **Nombres de salida**: `dia` y `recuento`. No se usa `citas`, que se confundiría con la tabla.
  Toda tabla lleva alias, y `group by 1` / `order by 1` evitan nombrar `dia` (regla de supabase.md).
- **Pertenencia**: `inicio ∈ [p_desde, p_hasta)`, **no** por solape (D1 y el contrato: «el día
  local de su inicio … una sola vez aunque cruce la medianoche»).
- **Cuatro guardas, cuatro mensajes** con fragmentos sin prefijo común, para que
  `assert_lanza_codigo_msg` sepa cuál ha saltado: `faltan los extremos`, `al revés o sin
  duración`, `zona horaria no admitida`, `más de un año natural`.
- **Orden de las guardas**: la de zona va antes que la del año, porque la del año usa `p_zona`. Con
  la zona nula, la del año compararía con `null` y dejaría pasar.
- **Cota del año**: el año natural se mide **en la zona**, como `[desde, desde + 1 año local)`.
  Un rango del 1 de enero al 1 de enero siguiente entra exacto, bisiesto o no. Un microsegundo más
  ya no entra.
- **Salida dispersa**: solo los días con recuento > 0. Como mucho hay 366 filas, porque la cota
  es un año y la agrupación es por día. TS rellena los ceros.
- `comment on function` en una línea: qué cuenta (todo salvo canceladas, D1), las ramas disjuntas
  por rol, por qué es invoker y la referencia a T-047.
- `revoke all on function public.agenda_densidad_anual(timestamptz, timestamptz, text, uuid, uuid) from public, anon, service_role;`
  y `grant execute … to authenticated;`.
- **Sin índice**. Solo se añade si el CA4 mide ≥ 1 s, y entonces es exactamente
  `create index citas_inicio_idx on public.citas (inicio);`, en esta misma migración. Si hiciera
  falta, se anota en la evidencia con el plan de antes y el de después.

#### 1.1.2 `public.agenda_profesionales_anuales` (opción P1-a)

```sql
create function public.agenda_profesionales_anuales(
  p_desde     timestamptz,
  p_hasta     timestamptz,
  p_zona      text,
  p_centro_id uuid default null
)
returns table (profesional_id uuid, profesional_nombre text)
-- mismo language/stable/invoker/search_path; mismas cuatro guardas, cada mensaje con el
-- prefijo 'agenda_profesionales_anuales: ' y los mismos fragmentos
```

El cuerpo:

- Usa la misma CTE `visibles`, con las mismas dos ramas y el mismo rango por `inicio`, pero
  proyecta solo `profesional_id` y `centro_id`.
- **No** filtra por estado: imita al mes, cuya lista sale de todas las filas visibles (H10).
- Hace `select distinct v.profesional_id, dp.nombre_completo::text from visibles v left join public.directorio_perfiles dp on dp.id = v.profesional_id where (p_centro_id is null or v.centro_id = p_centro_id) order by 2, 1`.

Lleva su propio `comment`, `revoke` y `grant`.

### 1.2 Banco `scripts/rls/34-agenda-anual.sql`

Todo dentro del `begin … rollback` del banco. Variables con sufijo `_34`. No hay ningún literal
de fecha: todo se ancla a `anio_34`.

```sql
select (extract(year from now())::int + 9) as anio_34 \gset
```

`ini_34 := make_date(:anio_34, 1, 1)`. Los instantes se escriben
`(make_date(:anio_34, m, d) + time 'hh:mm') at time zone 'Europe/Madrid'`.

**Fijación, como `postgres`.** Perfiles propios: `PRO34A` (CA), `PRO34B` (CB), `PRO34C` (CA) y
`PRO34N` (CA), todos `profesional_sanitario`. Se insertan en `auth.users` como en el banco 18, con
`descanso_activo = false` para `PRO34A` y `PRO34B`. Pacientes `P34A`, `P34B`, `P34C` y `P34N`, cada
uno de su profesional y de su centro. Tipo `TT34`. Los identificadores llevan el prefijo
`a3400000-0000-4000-8000-…`.

**Año sintético (CA4).** Se genera con un solo `insert … select`:

- Días: todos los de `anio_34` con `isodow <> 7`, es decir, ≈ 313 días.
- Huecos por día: `generate_series(0, 12 + extract(doy from d)::int % 9)`, de 13 a 21 al día
  (media ≈ 17), de 30 minutos cada uno, desde las 08:00 de Madrid.
- Profesionales: `(PRO34A, P34A, CA)` y `(PRO34B, P34B, CB)`.
- Estado según `(doy + s) % 10`: 0 da `cancelada`, 1 y 2 dan `confirmada`, y el resto
  `programada`. No se usa `realizada` ni `no_asistida`, porque son citas futuras.
- `zona_horaria = 'Europe/Madrid'`, `fin = inicio + 30 min`.

Salen ≈ 10 600 filas. La primera aserción del bloque G comprueba que hay **≥ 10 000**.

**Citas con nombre** (un profesional sin citas sintéticas, `PRO34N`, para tener recuentos exactos
y pequeños):

| Id | Profesional / centro | Inicio (hora de Madrid salvo que se diga) | Estado | Para qué |
|---|---|---|---|---|
| `C34INI` | PRO34N / CA | `ini_34` a las 00:00 exactas | programada | borde cerrado inferior |
| `C34PREV` | PRO34N / CA | 31-12 de `anio_34 − 1` a las 23:30, fin a las 00:20 | programada | solapa el año pero no empieza en él |
| `C34FIN` | PRO34N / CA | 1-1 de `anio_34 + 1` a las 00:00 exactas | programada | borde abierto superior |
| `C34MAD` | PRO34N / CA | 10-03 a las 00:30 (23:30 UTC del día 9) | programada | día local, no UTC |
| `C34NOCHE` | PRO34N / CA | 11-03 a las 23:30, fin el 12-03 a las 00:20 | confirmada | una sola vez, el día del inicio |
| `C34SINC` | PRO34N / **sin centro** | 13-03 a las 19:00 | programada | el filtro de centro la deja fuera; el técnico no la ve |
| `C34CANAR` | PRO34N / CA | 16-03 a las 23:30 de `Atlantic/Canary` (00:30 del 17 en Madrid) | programada | `p_zona` mueve el borde del día |
| `C34NCAN` | PRO34N / CA | 20-03 a las 19:00 | **cancelada** | D1 |
| `C34TEC` | **TEC1** / CA (paciente P34A) | 14-03 a las 19:00 | programada | copia propia de C18TEC: contarla una vez, no dos |
| `C34SOLOCAN` | PRO34C / CA | 18-03 a las 19:00 | cancelada | la lista incluye a quien solo tiene canceladas |

Si se llama como ADM con `p_profesional_id = PRO34N` sobre el año en Madrid, el recuento debe ser
**5**: C34INI, C34MAD, C34NOCHE, C34SINC y C34CANAR.

Ayudantes `pg_temp`, creados por `postgres` y de tipo invoker:

- **`pg_temp.discrepancias_34(p_desde, p_hasta, p_zona, p_centro, p_prof) returns integer`**: el
  número de días en los que `agenda_densidad_anual(...)` y el **oráculo** no coinciden, con un
  `full outer join` por día.
  - El oráculo lee `agenda_citas_rango` **mes a mes** dentro de `[p_desde, p_hasta)`, porque cada
    llamada solo admite 62 días.
  - De cada mes se queda con las filas cuyo `inicio` cae en ese mes, para que una cita que cruza
    de un mes a otro no cuente dos veces.
  - Descarta `estado = 'cancelada'`, aplica `p_centro` (`centro_id = p_centro`) y `p_prof`, y
    agrupa por `(inicio at time zone p_zona)::date`.
  - Se ejecuta con el rol de la sesión: por eso compara las dos lecturas **del mismo usuario**.
- **`pg_temp.lista_oraculo_34(p_desde, p_hasta, p_centro) returns setof (uuid, text)`**: el
  `distinct (profesional_id, profesional_nombre)` de esas mismas filas mensuales, **con** las
  canceladas.

| Bloque | Qué prueba | Aserciones (cada negativa con su gemela positiva) |
|---|---|---|
| **A · Forma y permisos** (CA3) | El catálogo | A1: `pg_get_function_result(...) = 'TABLE(dia date, recuento integer)'`. A2: el mismo texto no casa `(?i)paciente\|tipo\|nota\|nombre\|apellido\|sala\|serie\|episodio\|modalidad\|estado`. A3: `prosecdef = false` y `provolatile = 's'` en las dos funciones. A4: `proconfig` contiene `search_path=""`. A5: `has_function_privilege` da `false` a `anon` y `service_role`, y `true` a `authenticated`, en las dos. A6: `set local role anon` + llamada → `assert_lanza_codigo(…, '42501')` en las dos. A7: `pg_get_function_result` de la lista es igual a `'TABLE(profesional_id uuid, profesional_nombre text)'`. |
| **B · Guardas** (CA3) | 22023 con su fragmento | Con `assert_lanza_codigo_msg`: `p_desde` nulo y `p_hasta` nulo (`faltan los extremos`); invertido y `desde = hasta` (`al revés o sin duración`); zona nula, `'Etc/UTC'` y `'posix/Europe/Madrid'` (`zona horaria no admitida`); de `ini_34` a `ini_34 + 1 año + 1 µs` en Madrid (`más de un año natural`). **Gemelas**: con `assert_no_lanza`, el año exacto en Madrid y el año exacto en `Atlantic/Canary`. Las mismas negativas para `agenda_profesionales_anuales`. |
| **C · Oráculo por rol y filtro** (CA1) | Marzo de `anio_34` | Para ADM, PRO34A y TEC1, y para cada uno de los cuatro filtros (sin filtro; CA; PRO34A; CA + PRO34A): `discrepancias_34(1-3, 1-4, 'Europe/Madrid', …) = 0` (doce aserciones). **No vacío**: en cada combinación que debe tener citas, la suma de la densidad de marzo es > 0; un oráculo vacío contra una densidad vacía no prueba nada. Combinación cruzada CB + PRO34A como ADM: suma 0, con la gemela CA + PRO34A > 0. |
| **D · Lo que elige el llamante** (CA2) | Filtros que no abren nada | D1: TEC1 con `p_centro_id = CB` → ninguna fila en todo el año. Gemela: con CA, > 0. D2: PRO34A con `p_profesional_id = PRO34B` → ninguna fila. Gemela: con PRO34A, > 0 y `discrepancias_34 = 0`. D3: TEC1 con `p_profesional_id = TEC1` → el 14-03 vale **exactamente 1**, y no hay ningún otro día. D4: PRO34A con `p_profesional_id = TEC1` → ninguna fila (no comparte la cita). D5: ADM con `p_profesional_id = TEC1` → el 14-03 vale 1. |
| **E · Día local y bordes** | Todo como ADM con `p_profesional_id = PRO34N` salvo que se diga | E1: total del año = 5. E2: 1-1 = 1 (C34INI). E3: 10-03 = 1 y 09-03 sin fila. E4: 11-03 = 1 y 12-03 sin fila. E5: con Madrid, 17-03 = 1 y 16-03 sin fila; con `Atlantic/Canary` (rango del año en Canarias), 16-03 = 1 y 17-03 sin fila. E6: con `p_centro_id = CA`, total = 4 (sale C34SINC). E7: TEC1 con `p_profesional_id = PRO34N`, total = 4 (el técnico no ve C34SINC). E8: el 20-03 no tiene fila (C34NCAN cancelada); gemela: `agenda_citas_rango` de marzo sí la devuelve. |
| **F · Lista de profesionales** (P1-a) | La misma visibilidad | F1: para ADM, PRO34A y TEC1, sin centro y con CA, el conjunto devuelto es igual a `lista_oraculo_34` del año (diferencia simétrica vacía). F2: ADM incluye a PRO34C (solo canceladas). F3: TEC1 no incluye a PRO34B (CB); incluye a TEC1 **una vez**; y todos los nombres que recibe son no nulos. F4: PRO34A recibe solo a PRO34A. F5: el número de filas es igual al `count(distinct …)`, es decir, sin duplicados. |
| **G · Volumen y coste** (CA4) | El año sintético | G1: fijación con ≥ 10 000 citas. G2: ADM sin filtros sobre el año entero, `discrepancias_34 = 0`. G3: el número de filas de la densidad es ≤ 366. G4: en un `do` como ADM, `clock_timestamp()` antes y después de `perform count(*) from agenda_densidad_anual(año, 'Europe/Madrid', null, null)` debe dar **< 1 s**. G5 (evidencia, sin aserción): `\echo` y `explain (analyze, buffers)` de esa llamada, y de la consulta del cuerpo escrita con los valores, como ADM. |

Al final, `call pg_temp.reset_sesion();`.

**Mutantes**, que se miden a mano y se guardan en `tickets/T-047/mutantes.json`:

| # | Mutación | Debe caer |
|---|---|---|
| M1 | Quitar el filtro de rol de la rama `citas` | D3 (TEC1 cuenta 2 el 14-03, porque `citas_lectura` le deja leer su propia cita por la rama `citas`) |
| M2 | Pertenencia por solape (`inicio < hasta and fin > desde`) | E1 (6 por C34PREV) |
| M3 | `inicio <= p_hasta` | E1 (6 por C34FIN) |
| M4 | Quitar `estado <> 'cancelada'` | C (las doce), E8 |
| M5 | Quitar el filtro de centro | C (combinaciones con CA), D1, E6 |
| M6 | `or v.centro_id is null` en el filtro de centro | E6, C con CA |
| M7 | Quitar el filtro de profesional | C, D2, E1 |
| M8 | Agrupar por `(inicio at time zone 'UTC')::date` | E3, E5 |
| M9 | `security definer` | A3; D2 y C con PRO34A (como dueño, la rama `citas` salta la RLS y PRO34A vería las de PRO34B; el técnico no cambia, porque `citas_agenda` y el filtro de rol miran el JWT) |
| M10 | Quitar la guarda de zona | B (`Etc/UTC` y la zona nula dejan de lanzar) |
| M11 | Quitar la guarda del año | B (más de un año) |
| M12 | Sin `revoke … from public` | A5, A6 |

**Una zona inexistente como `'Nada/Inventada'` NO sirve para probar M10**: `at time zone` ya lanza
22023 por sí solo. Por eso B usa `Etc/UTC`, `posix/…` y la zona nula, con el fragmento del mensaje
propio.

### 1.3 README del banco (`scripts/rls/README.md`)

- Tabla de módulos: una fila `34-agenda-anual.sql` que cuente que es de T-047, que cubre las dos
  lecturas, los bloques A a G, el año sintético y que los mutantes están en
  `tickets/T-047/mutantes.json`.
- Punto 10.2: añadir `34:NN → +9` a la lista de la comprobación (NN es la línea real del `\gset`).
- Tabla de franjas: `| 34 (T-047) | PRO34A/CA, PRO34B/CB, PRO34C/CA, PRO34N/CA propios; TEC1/CA en una cita | Y+9 entero (lunes a sábado, 08:00–18:30) · bordes: 31-12 de Y+8 a las 23:30 y 1-1 de Y+10 a las 00:00, solo de PRO34N |`.

### 1.4 Tipos y lectura

- `lib/supabase/tipos-bd.ts`: **solo** con `npx supabase db reset && npm run tipos`.
- **`lib/citas/densidad.ts`** (nuevo, `import 'server-only'`):

```ts
export type DiaConCitas = { dia: string; recuento: number };            // dia: 'AAAA-MM-DD'
export type ProfesionalDelAnio = { id: string; nombre: string | null };
type Consulta = { desde: Date; hasta: Date; zona: string; centroId: string | null };

export async function leerDensidadAnual(
  sesion: Sesion,
  consulta: Consulta & { profesionalId: string | null },
): Promise<ResultadoCitas<{ dias: DiaConCitas[] }>>;
// rpc('agenda_densidad_anual', { p_desde: desde.toISOString(), p_hasta: hasta.toISOString(),
//   p_zona: zona, p_centro_id: centroId, p_profesional_id: profesionalId })

export async function listarProfesionalesDelAnio(
  sesion: Sesion,
  consulta: Consulta,
): Promise<ResultadoCitas<{ profesionales: ProfesionalDelAnio[] }>>;
// rpc('agenda_profesionales_anuales', { p_desde, p_hasta, p_zona, p_centro_id })
```

  El error se trata con `mapearErrorCitas` y `mensajeParaMotivo` de `./errores`, igual que hace
  `fallo()` en `agenda.ts`, copiado en tres líneas, porque `fallo` no se exporta. `data` nulo sin
  error se trata como lista vacía. No usa `Date` en la salida.

### 1.5 Funciones puras `lib/agenda/anio.ts` (nuevo)

```ts
export type NivelDensidad = 0 | 1 | 2 | 3 | 4;
export type Tramo = { nivel: 1 | 2 | 3 | 4; desde: number; hasta: number };
export type MesDelAnio = { mes: number /* 1-12 */; dias: string[] /* AAAA-MM-DD */; huecos: number /* 0-6 */ };

export function mesesDelAnio(anio: number): MesDelAnio[];
export function nivelDeDensidad(n: number, maximo: number): NivelDensidad;
export function tramosDeDensidad(recuentos: readonly number[]): Tramo[];
export function destinoEnAnio(tecla: string, fecha: string, anio: number): string | null;
```

- **`mesesDelAnio`**: doce meses. `huecos = diaDeLaSemana(primero) − 1`, porque la semana empieza
  en lunes. Los días se construyen con `sumarDias` y quedan dentro del mes.
- **`nivelDeDensidad(n, max)`**: si `n ≤ 0` o `max ≤ 0`, devuelve 0. En otro caso,
  `min(4, ceil(4·n / max))`. El día con el máximo siempre queda en el nivel 4.
- **`tramosDeDensidad(recuentos)`**:
  - `max = Math.max(0, ...recuentos)`.
  - Para k = 1..4: `desde = floor((k−1)·max/4) + 1` y `hasta = floor(k·max/4)`. Las divisiones
    son enteras: `Math.floor((k*max)/4)` con enteros.
  - Se devuelven **solo** los tramos con `desde ≤ hasta`, en orden ascendente.
  - Ejemplos: `max = 0` da `[]`; `max = 1` da `[{4,1,1}]`; `max = 14` da 1–3, 4–7, 8–10 y 11–14;
    `max = 5` (todos los días iguales) da 1–1, 2–2, 3–3 y 4–5.
  - **Invariante probado**: para todo `n` en `1..max`, `nivelDeDensidad(n, max)` es el `nivel`
    del único tramo que contiene `n`.
- **`destinoEnAnio(tecla, fecha, anio)`**: devuelve `null` si la tecla no es de navegación (el
  componente no llama a `preventDefault`). Devuelve **la misma fecha** cuando el destino se sale del
  año (es un tope: el foco no se mueve).

  | Tecla | Destino |
  |---|---|
  | `ArrowLeft` / `ArrowRight` | ±1 día, cruzando semana y mes |
  | `ArrowUp` / `ArrowDown` | ±7 días, cruzando mes |
  | `Home` / `End` | lunes / domingo de la **fila visible**, es decir, de esa semana **recortada al mes** (el primer o el último día del mes si la semana empieza o acaba en otro) |
  | `PageUp` / `PageDown` | `sumarMeses(fecha, ∓1)`, que recorta el 31 al último día |
  | Cualquier destino fuera de `anio` (flechas y páginas) | la misma `fecha` |
  | Cualquier otra tecla | `null` |

### 1.6 Pantalla

**Ficheros:**

| Fichero | Cambio |
|---|---|
| `app/(app)/agenda/parametros.ts` | `export type Vista = 'semana' \| 'mes' \| 'anio'`; `export type VistaConCitas = Exclude<Vista, 'anio'>`. En `leerParametros`, `vista === 'mes' \|\| vista === 'anio' ? vista : 'semana'`. Nuevo `export function hrefAgenda(v: { vista: Vista; fecha: string \| null; centro: string \| null; profesional: string \| null }): string`, con el mismo orden y las mismas omisiones que `calendario.tsx:100-108`. El comentario de `leerParametros` se corrige: centro y profesional llegan a SQL como parámetros con enlace, y la RLS manda. |
| `app/(app)/agenda/bloques.ts` | `rangoDeVista(vista: Vista, …)` pasa a ser un `switch` **exhaustivo**, con `const _nunca: never = vista` en el `default`. El caso `'anio'` da `{ desde: medianoche(`${a}-01-01`, zona), hasta: medianoche(`${a + 1}-01-01`, zona) }`, con `a = Number(fecha.slice(0, 4))`. Semana y mes quedan igual. |
| `app/(app)/agenda/vista.ts` | `EntradaVista.vista` y `VistaCalendario.vista` pasan a `VistaConCitas`. Al principio de `construirVista`: `if (vista !== 'semana' && vista !== 'mes') throw new Error('construirVista: solo semana o mes')`. Las ternarias no se tocan. |
| `app/(app)/agenda/vista-anio.ts` (nuevo) | `construirVistaAnio(entrada): VistaAnio`, puro. Ver más abajo. |
| `app/(app)/agenda/barra-agenda.tsx` (nuevo, `'use client'`) | Tres piezas. `ENLACE_BARRA`, la clase `ENLACE` que hoy está en `calendario.tsx:37`, movida aquí. `SelectorVista({ actual: Vista; hrefDe: (v: Vista) => string })`, con `role="group"`, `aria-label={t('agenda.barra.vista')}` y tres `Link` (Semana, Mes, Año), `aria-current="page"` en el activo y las mismas clases que hoy. `FiltrosAgenda({ centros, centroElegido, rol, profesionales, profesionalElegido, hrefCon })`, que contiene exactamente los dos `Seleccion` y las dos reglas de `calendario.tsx:172-175`, `218-247`, con `router.replace(…, { scroll: false })`. |
| `app/(app)/agenda/calendario.tsx` | Usa `ENLACE_BARRA`, `SelectorVista` (`hrefDe = (v) => href({ vista: v, fecha: fechaFoco })`) y `FiltrosAgenda` (con el mismo `hrefCon` que hoy, que fija `fecha: vista.fechaFoco`). `href` acepta `vista?: Vista` y delega en `hrefAgenda`. **El DOM de la semana y del mes no cambia**: mismos ids, etiquetas y orden, y se añade solo el enlace «Año». |
| `app/(app)/agenda/calendario-anio.tsx` (nuevo, `'use client'`) | La isla del año. Ver más abajo. |
| `app/(app)/agenda/leyenda-densidad.tsx` (nuevo, delegable) | `LeyendaDensidad({ entradas: { nivel: NivelDensidad; texto: string }[] })`, sin estado ni foco. |
| `app/(app)/agenda/esqueletos.tsx` | Añade `EsqueletoAnio()` (delegable). |
| `app/(app)/agenda/page.tsx` | En `Cuerpo`, `const enAnio = parametros.vista === 'anio'`. El fallback de la Suspense del calendario es `enAnio ? <EsqueletoAnio/> : <EsqueletoCalendario/>`, y el hijo es `enAnio ? <BloqueAnio parametros={parametros}/> : <BloqueCalendario parametros={{ ...parametros, vista: parametros.vista }}/>`. Con el estrechamiento, `BloqueCalendario` recibe `ParametrosAgenda & { vista: VistaConCitas }`. El panel derecho y el cuadro **no cambian**. |
| `lib/citas/densidad.ts` | §1.4. |
| `lib/agenda/anio.ts` | §1.5. |
| `lib/i18n/es.ts` | Las claves de la tabla siguiente. |
| `app/globals.css` | Tonos y rejilla del año (más abajo). |
| `lib/contraste/tokens.ts` | `Par.grafico?: boolean` y `UMBRAL_GRAFICO = 3.0` (WCAG 1.4.11). El umbral es `grande \|\| grafico ? 3.0 : 4.5`. Ocho pares nuevos (más abajo). |
| `docs/interfaz.md` | §Agenda, un párrafo (más abajo). |
| `accesibilidad/agenda-anual.spec.ts` (nuevo) | §3, CA13. |

**`BloqueAnio`** (en `page.tsx`):

```tsx
async function BloqueAnio({ parametros }: { parametros: ParametrosAgenda }) {
  const contexto = await cargarContexto(parametros.centro);
  if (!contexto.ok) return <AvisoDeError mensaje={contexto.mensaje} />;
  const { sesion, rol, centros, centro, zona, hoy } = contexto;
  const fecha = parametros.fecha ?? hoy;
  const { desde, hasta } = rangoDeVista('anio', fecha, zona);
  const [densidad, lista] = await Promise.all([
    leerDensidadAnual(sesion, { desde, hasta, zona, centroId: centro, profesionalId: parametros.profesional }),
    listarProfesionalesDelAnio(sesion, { desde, hasta, zona, centroId: centro }),
  ]);
  if (!densidad.ok) return <AvisoDeError mensaje={densidad.mensaje} />;
  if (!lista.ok) return <AvisoDeError mensaje={lista.mensaje} />;
  const vista = construirVistaAnio({ fecha, zona, hoy, dias: densidad.dias, profesionales: lista.profesionales });
  return (
    <CalendarioAnio key={`anio-${vista.fechaFoco}`} vista={vista}
      parametros={{ centro: parametros.centro, profesional: parametros.profesional }}
      centros={centros} centroElegido={centro ?? 'todos'} rol={rol} />
  );
}
```

`centro` es el ya resuelto (H12): un centro que no se ofrece al usuario nunca llega a la base, y si
llegara, la RLS lo deja en cero (D1 del banco). No hay `use cache`.

**`construirVistaAnio`** (`vista-anio.ts`):

```ts
export type EntradaVistaAnio = {
  fecha: string; zona: string; hoy: string;
  dias: readonly { dia: string; recuento: number }[];
  profesionales: readonly { id: string; nombre: string | null }[];
};
export type DiaAnio = { fecha: string; numero: number; recuento: number; nivel: NivelDensidad; nombre: string; esHoy: boolean };
export type MesAnio = { clave: string /* AAAA-MM */; titulo: string; total: number; huecos: number; dias: DiaAnio[] };
export type VistaAnio = {
  vista: 'anio'; anio: number; titulo: string; fechaFoco: string; hoy: string; total: number;
  meses: MesAnio[]; cabeceras: { corta: string; larga: string }[];
  leyenda: { nivel: NivelDensidad; texto: string }[];
  profesionales: { id: string; nombre: string }[];
};
```

- `anio = Number(fecha.slice(0, 4))`, `titulo = String(anio)` (D5) y `fechaFoco = fecha`.
- Los recuentos se colocan con un `Map` por `dia`. **Una fila de otro año se ignora.**
- `nivel` sale de `nivelDeDensidad(recuento, max)`.
- `DiaAnio.nombre = tCon('agenda.anio.dia', { fecha: formatearFechaLarga(alMediodia(dia, zona), zona), recuento: cuenta(n) })`. Ejemplo: «martes, 3 de marzo de 2026, 7 citas».
  - `cuenta(0)` es `t('agenda.anio.sinCitas')` («sin citas»).
  - `cuenta(1)` es `t('agenda.rejilla.citas.una')`.
  - `cuenta(n)` es `tCon('agenda.rejilla.citas.varias', { n })`.
  - `alMediodia` es una copia local de la de `vista.ts:101` (TZDate a las 12:00, regla de fechas.md).
- `MesAnio.titulo = tCon('agenda.anio.mes', { mes: Mayúscula(nombre del mes en es), recuento: cuenta(total) })`.
  Ejemplo: «Marzo · 57 citas». El nombre del mes sale de `format(…, 'LLLL', { locale: es })` sobre
  el día 1 al mediodía.
- `cabeceras`: los siete días de la primera semana completa del año, con `corta = format(…, 'EEEEE')`
  (L M X J V S D) y `larga = format(…, 'EEEE')`.
- `leyenda`: primero `{ nivel: 0, texto: '0' }` y después un elemento por tramo de
  `tramosDeDensidad`. El texto es `desde === hasta ? String(desde) : `${desde}–${hasta}`` (con raya
  corta). Con `total === 0` la leyenda queda solo en `[]`, y la isla pinta el vacío.
- `profesionales` se ordenan con `localeCompare(…, 'es')`. Un nombre nulo pasa a
  `t('agenda.cita.profesional')`, como hace el mes.

**`CalendarioAnio`** (`calendario-anio.tsx`). Props: `{ vista: VistaAnio; parametros: { centro; profesional }; centros; centroElegido; rol }`.

- **Estado**: `fechaFoco` (empieza en `vista.fechaFoco`), una ref `debeEnfocar` y un `Map` de refs
  de fecha a elemento.
- **Barra**:
  - `Link` anterior y siguiente: `hrefAgenda({ vista: 'anio', fecha: sumarMeses(fechaFoco, ∓12), ...parametros })`,
    con `aria-label` `agenda.barra.anioAnterior` y `anioSiguiente`.
  - «Hoy»: `fecha: null`.
  - `<h2>{vista.titulo}</h2>`.
  - `SelectorVista actual="anio" hrefDe={(v) => hrefAgenda({ vista: v, fecha: fechaFoco, ...parametros })}`.
  - `FiltrosAgenda`, con `profesionales = vista.profesionales` y `hrefCon` que fija `vista: 'anio', fecha: vista.fechaFoco`.
- **Leyenda**: `<LeyendaDensidad entradas={vista.leyenda} />`, **visible**, no dentro de `<details>`,
  con su título `agenda.anio.leyenda.titulo` («Citas por día, sin canceladas»). **No** sale
  `LeyendaEstadosCita`.
- **Vacío**: con `vista.total === 0`, en vez de la leyenda va
  `<EstadoVacio icono="calendario" titulo={tCon('agenda.anio.vacio', { anio })} explicacion={t('agenda.anio.vacioExplicacion')} />`.
  La rejilla se pinta igual, para que siga siendo posible ir a una semana.
- **Rejilla**: `<div className="contenedor-anio -mx-4 sm:mx-0">`, que contiene un
  `<div className="meses-anio">`, y dentro, por cada mes:

```tsx
<section aria-labelledby={`mes-${clave}`}>
  <h3 id={`mes-${clave}`} className="mb-1 px-4 text-sm font-semibold sm:px-0">{mes.titulo}</h3>
  <div role="grid" aria-labelledby={`mes-${clave}`}>
    <div role="row" className="grid grid-cols-7">{7 × <div role="columnheader"><span aria-hidden="true">{corta}</span><span className="sr-only">{larga}</span></div>}</div>
    {semanas → <div role="row" className="grid grid-cols-7">
       hueco: <div role="gridcell" />   // vacío, sin foco ni contenido
       día:   <div role="gridcell"><Link …/></div>
    </div>}
  </div>
</section>
```

- **Enlace del día**:

```tsx
<Link href={hrefAgenda({ vista: 'semana', fecha: dia.fecha, ...parametros })}
      prefetch={false}
      ref={…} data-dia={dia.fecha}
      tabIndex={dia.fecha === fechaFoco ? 0 : -1}
      aria-label={dia.nombre}
      aria-current={dia.esHoy ? 'date' : undefined}
      onFocus={() => setFechaFoco(dia.fecha)}
      onKeyDown={(e) => alTeclear(e, dia.fecha)}
      className={cn('focus-visible:ring-ring/50 flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md text-xs outline-none focus-visible:ring-2 sm:pointer-fine:min-h-7',
                    FONDO[dia.nivel], dia.esHoy && 'font-semibold underline decoration-2 underline-offset-2')}>
  <span aria-hidden="true">{dia.numero}</span>
  <span aria-hidden="true" className={cn('bg-primary h-[3px] rounded-full forced-color-adjust-none forced-colors:bg-[CanvasText]', ANCHO[dia.nivel])} />
</Link>
```

  - `FONDO = ['', 'bg-densidad-1', 'bg-densidad-2', 'bg-densidad-3', 'bg-densidad-4']`.
  - `ANCHO = ['w-0', 'w-1/4', 'w-1/2', 'w-3/4', 'w-full']`. El nivel 0 no tiene barra.
- **`alTeclear(e, fecha)`**:
  - Si hay `ctrlKey`, `altKey` o `metaKey`, no hace nada.
  - `const d = destinoEnAnio(e.key, fecha, vista.anio)`. Si `d === null`, no hace nada.
  - Si no, `e.preventDefault()`, y si `d !== fecha`, `debeEnfocar.current = true; setFechaFoco(d)`.
  - Un `useEffect([fechaFoco])` enfoca `refs.get(fechaFoco)` cuando `debeEnfocar` está activo y
    después lo apaga. Es el mismo patrón que `rejilla-foco.ts` (enfocar en un efecto), **sin
    tocarlo**.
  - Intro sigue el enlace de forma nativa.
- **Hoy**: subrayado y negrita en `foreground`, **no** en `text-primary`. `primary` sobre
  `densidad-4` da 4,41 (H18), que no llega a 4,5 para texto.

**Tonos** (`app/globals.css`):

- En `:root`: `--densidad-1: oklch(0.95 0.03 163); --densidad-2: oklch(0.89 0.05 163); --densidad-3: oklch(0.82 0.07 163); --densidad-4: oklch(0.75 0.08 163);`
- En `@theme inline`: `--color-densidad-1: var(--densidad-1);` hasta el 4.

**Pares nuevos en `PARES`**:

- `foreground` sobre `densidad-1..4`, para el número del día (4,5).
- `primary` sobre `densidad-1..4` con `grafico: true`, para la barra de densidad (3,0).

**Rejilla de meses** (`app/globals.css`, CSS explícito para que el orden de la cascada sea
determinista):

```css
.contenedor-anio { container-type: inline-size; }
.meses-anio { display: grid; gap: 1.5rem 1rem; grid-template-columns: minmax(0, 1fr); }
@container (min-width: 40rem) { .meses-anio { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@container (min-width: 60rem) { .meses-anio { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (pointer: fine) {
  @container (min-width: 25rem) { .meses-anio { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container (min-width: 28rem) { .meses-anio { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  @container (min-width: 36rem) { .meses-anio { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
}
```

Por qué estos cortes:

- **Al tacto**, cada mes necesita ≥ 7 × 44 px ≈ 308 px. Con dos columnas hacen falta 640 px y con
  tres, 960 px.
- **Con ratón**, cuatro por fila desde 576 px (D2, escritorio).
- **A 360 px**, siempre una por fila. Con la sangría, cada día mide ≈ 46–51 px de ancho.

**Claves de `lib/i18n/es.ts`**:

| Clave | Texto |
|---|---|
| `agenda.barra.anio` | `Año` |
| `agenda.barra.anioAnterior` | `Año anterior` |
| `agenda.barra.anioSiguiente` | `Año siguiente` |
| `agenda.esqueletos.anio` | `Cargando el año` |
| `agenda.anio.mes` | `{mes} · {recuento}` |
| `agenda.anio.dia` | `{fecha}, {recuento}` |
| `agenda.anio.sinCitas` | `sin citas` |
| `agenda.anio.leyenda.titulo` | `Citas por día, sin canceladas` |
| `agenda.anio.vacio` | `Sin citas en {anio}` |
| `agenda.anio.vacioExplicacion` | `Elige un día para abrir su semana.` |

**Leyenda** (delegable):

- `<div>` con un `<p>` de título y un `<ul className="flex flex-wrap gap-3">`.
- Cada `<li>` lleva una muestra `aria-hidden`: un cuadrado de 1,5 rem con el mismo `FONDO` y la
  misma barra `ANCHO` que el día. Al lado, el texto («0», «1–3»…).
- `FONDO` y `ANCHO` se exportan desde `leyenda-densidad.tsx`, y `calendario-anio.tsx` los importa
  de ahí, para que haya una sola fuente.

**Esqueleto** (delegable):

- `role="status"`, `aria-label={t('agenda.esqueletos.anio')}`.
- `contenedor-anio` y `meses-anio` con 12 bloques. Cada uno tiene una barra de título y una rejilla
  `grid-cols-7` de 35 cuadrados `bg-muted animate-pulse motion-reduce:animate-none`.
- `<span className="sr-only">`, como los demás esqueletos.

**`docs/interfaz.md` §Agenda**. Se añade un párrafo tras «Calendario, en tres vistas…»:

- La vista anual son doce mini-meses de siete columnas, con el lunes primero, y cuatro por fila con
  ratón en escritorio.
- Al tacto se ponen tantos como quepan a 44 px; a 360 px, uno por fila.
- Cada día es un enlace a su semana.
- La densidad se ve con tono y una barra proporcional, en cinco escalones relativos al año visible,
  y la leyenda numérica dice «sin canceladas».
- El motivo: la tira de 53 semanas obliga a desplazar a 360 px (D2), y el color solo no basta
  (1.4.1).

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado y por qué |
|---|---|---|
| D1 | **Lista de profesionales en una función aparte** (P1-a), dentro del mismo `Promise.all`. | Una fila por (día, profesional): rompe ≤ `max_rows` y CA3. `jsonb` con todo dentro: CA3 pasaría por la letra, pero escondería los nombres. |
| D2 | **Pertenencia por `inicio ∈ [desde, hasta)`**, no por solape. | El solape (como `agenda_citas_rango`) contaría en el año siguiente la cita que empieza el 31 a las 23:30 (M2). |
| D3 | **Zona como parámetro, validada con `es_zona_iana`** antes de la cota del año. | Sin la guarda, la zona nula pasa y agrupa por `null`. Una zona inválida lanzaría 22023 de todos modos, pero `Etc/UTC` y `posix/` se aceptarían. |
| D4 | **Cota de un año natural local** (`desde + 1 year` en la zona). | 366 días fijos: dejaría pasar 1-1 → 2-1 en un año no bisiesto. 62 días como el mes: no cabe el año. |
| D5 | **Salida dispersa** (solo días con citas), y TS rellena los ceros. | Usar `generate_series` en SQL: más trabajo en la base y otra fuente de verdad para «qué días tiene el año». |
| D6 | **Sin índice nuevo** salvo que el CA4 mida ≥ 1 s. | Indexar «por si acaso» va contra el contrato («si el plan lo pide»). |
| D7 | **La lista incluye a quien solo tiene canceladas**, como el mes (H10). | Excluirlas: el selector del año y el del mes enseñarían listas distintas para el mismo periodo. |
| D8 | **Escala `ceil(4n/max)`** con tramos `floor` enteros. El máximo siempre en el nivel 4 y los tramos vacíos no salen. | Cuantiles: con pocos días distintos dan tramos repetidos y no los explica una leyenda «1–3». Umbrales fijos: descartados por D3 del propietario. |
| D9 | **Forma = barra proporcional** (¼, ½, ¾, entera) en `primary`, que sigue visible con colores forzados (`CanvasText`). **Tono** = fondo `densidad-k`, redundante. | Puntos (1–4): no caben cuatro a 19 px de celda. Solo el tono: incumple 1.4.1. El tono no llega a 3:1 frente a `card` (H18) y no tiene por qué, porque la información la llevan la barra y el nombre accesible. |
| D10 | **Tonos en el hue de `primary` (verde)**. | Malva: es la selección (`interfaz.md` §vocabulario). Ámbar o rojo: significan atención o error. |
| D11 | **Doce `role="grid"` con una sola parada de tabulación compartida**, cada uno rotulado por su `<h3>`. | Un solo grid de 53 filas: no se corresponde con la forma visual de doce meses y el lector lee filas mezcladas. |
| D12 | **`prefetch={false}` en los 365 enlaces** (H19). | El valor por defecto: precarga en producción todo lo que entra en el viewport. |
| D13 | **Home/End recortan la semana al mes** (la fila visible). | La semana de calendario completa: Home en el jueves 1 de enero llevaría al lunes del año anterior, fuera de la rejilla. |
| D14 | **Topes: un destino fuera del año devuelve la misma fecha** y se llama a `preventDefault`. | Envolver o saltar de año: el contrato dice «no hacen nada», y la página no debe desplazarse. |
| D15 | **Anterior/siguiente se calculan en cliente desde `fechaFoco`** (`sumarMeses(±12)`). | Desde la URL: perdería el día al que se ha movido el foco antes de cambiar de año. |
| D16 | **Barra compartida en `barra-agenda.tsx`** (`SelectorVista`, `FiltrosAgenda`). | Duplicar en la isla del año: «las mismas reglas de cuándo se muestran» tendría dos copias que divergen. |
| D17 | **Columnas del año en CSS explícito** en `globals.css`. | Variantes de Tailwind `pointer-fine:@min-…` apiladas: el orden de la cascada entre `@container` y `@media` no está garantizado. |
| D18 | **`construirVista` lanza con `'anio'`** además de estrechar el tipo. | Solo el tipo: un `as` en un llamante futuro lo burlaría en silencio (CA7). |
| D19 | **Banco con año propio Y+9** y profesionales propios. Copia propia de C18TEC (`C34TEC`). | Depender de C18TEC del 18 iría contra la regla «cada módulo fija su estado» (`pruebas.md`). |
| D20 | **Error en la lista: `AvisoDeError`**, igual que la densidad. | Degradar a una lista vacía ocultaría el selector con un filtro activo en la URL. |

---

## 3 · Cómo se cierra cada criterio de aceptación

Antes de verificar: `npx supabase db reset`, y después `select max(version) from supabase_migrations.schema_migrations`
debe ser `20261017120000`.

| CA | Comprobación |
|---|---|
| 1 · Oráculo por rol | `npm run test:rls`: bloque C de `34-agenda-anual.sql` en verde (12 aserciones `discrepancias_34 = 0` más las de «no vacío»). |
| 2 · Lo que elige el llamante | Bloque D (D1–D5). C34TEC cuenta 1 para TEC1 (D3). |
| 3 · Forma y permisos | Bloques A y B. La lista exacta de lo prohibido está en A2. |
| 4 · Coste y tope | Bloque G. Se copian a `tickets/T-047/evidencia.json` el `explain (analyze, buffers)` y el tiempo de G4. |
| 5 · Nada se rompe alrededor | `npm run test:rls` en la rama frente a `main`, módulo por módulo: los mismos fallos o menos (state.md dice que hoy 00–28 está en verde). `npm run lint:migraciones`. |
| 6 | `parametros.test.ts`: `anio` → `'anio'`; `año`, `ANIO`, `['anio','anio']` y `''` → `'semana'`. `hrefAgenda` con y sin cada parámetro. |
| 7 | `bloques.test.ts`: `rangoDeVista('anio','2026-03-15','Europe/Madrid')` da `2025-12-31T23:00:00.000Z` a `2026-12-31T23:00:00.000Z`. Con `Atlantic/Canary`, `2026-01-01T00:00:00.000Z` a `2027-01-01T00:00:00.000Z`. Para 2028 en Madrid, `hasta − desde` = 366 días. La semana y el mes no cambian (una muestra de cada). `vista.test.ts`: `construirVista({ …, vista: 'anio' as never })` lanza; hay un `// @ts-expect-error` con `'anio'`. |
| 8 | `lib/agenda/anio.test.ts`: `mesesDelAnio(2026)` da 365 días únicos y ordenados, enero con `huecos = 3`; 2028 da 366 y contiene `2028-02-29`. Tramos: los cuatro ejemplos de §1.5 y el invariante para `max` de 1 a 60. Teclas: cada fila de la tabla de §1.5; 1-1 con ←/↑/RePág da la misma fecha; 31-12 con →/↓/AvPág, la misma; 3-1 con ↑, la misma; 31-3 con RePág da 28-2 (2026) o 29-2 (2028); Home el jueves 1-1-2026 da 1-1; End el lunes 30-3-2026 da 31-3; `'a'` y `'Enter'` dan `null`. |
| 9 | `vista-anio.test.ts`: `expect(JSON.parse(JSON.stringify(v))).toEqual(v)` y ningún valor es `instanceof Date` (recorrido profundo). |
| 10 | `calendario.test.tsx`: tres enlaces en el grupo «Vista del calendario», con `aria-current="page"` en el activo; «Año» lleva `vista=anio&fecha=<fechaFoco>`. `calendario-anio.test.tsx`: con `fechaFoco` 2026-03-10, `ArrowRight` hace que el enlace con `tabindex=0` sea 2026-03-11 y que tenga el foco; «Mes» lleva `/agenda?vista=mes&fecha=2026-03-11&centro=…&profesional=…`; el enlace de un día lleva `vista=semana&fecha=…&centro=…&profesional=…`. |
| 11 | `calendario-anio.test.tsx`: `getByRole('link', { name: 'martes, 3 de marzo de 2026, 7 citas' })`; un día vacío, `…, sin citas`; el de hoy tiene `aria-current="date"`; `getByRole('grid', { name: 'Marzo · 57 citas' })`. |
| 12 | `rg -n "use cache" "app/(app)/agenda" lib/citas/densidad.ts` no devuelve nada (código de salida 1). |
| 13 | `npx playwright test accesibilidad/agenda-anual.spec.ts` (§5, «Playwright»). |
| 14 | `npm run lint && npm run build` (en un worktree con junction, `npx next build --webpack`, state.md). |
| Manuales | El guion del contrato, más `tokens.test` (pares nuevos) en `npm test` como apoyo del criterio de escala de grises. |

---

## 4 · Riesgos, por probabilidad

1. **Alta: conflicto de cola en `scripts/rls/README.md` y en `lib/supabase/tipos-bd.ts`.** T-043,
   T-023, T-026a, T-046 y T-023b tocan los dos antes. Hay que rebasar en orden, conservar todas las
   filas y **regenerar** los tipos tras el `db reset` (nunca fusionarlos a mano). Antes del
   verificador, `max(version)`.
2. **Media: el banco tarda.** Con 10 600 inserciones salen otras tantas filas de auditoría y
   disparadores por fila (H7). Se aceptan unos segundos. Si `test:rls` pasa de un minuto más que
   en `main`, se baja a 13–17 huecos por día manteniendo ≥ 10 000 (G1 lo vigila). **Nunca** se
   desactiva `auditar_citas`.
3. **Media: otro ticket de la cola elige Y+9.** T-023 tiene que reanclar su `current_date + 1600`
   (regla 10.1). Quien rebase después comprueba la tabla de franjas. La colisión real es poco
   probable, porque los profesionales de este banco son propios y la exclusión es por profesional.
4. **Media: regresión en la semana o el mes** al extraer `barra-agenda.tsx`. La prueba es que
   `calendario.test.tsx` siga verde **sin cambiar ninguna aserción existente**, salvo las que
   enumeran las opciones del selector.
5. **Baja: la emulación táctil de Playwright no activa `(pointer: coarse)`.** La prueba lo afirma
   antes de medir. A 360 px las celdas miden 44 por base (`min-h-11` y sangría), así que la medida
   no depende de ello.
6. **Baja: zonas con cambio de hora a medianoche.** `medianoche()` las resuelve hacia delante,
   igual que el mes. El día de una cita lo decide la base con `at time zone`, que es coherente.
7. **Baja: más de 1000 profesionales en la lista.** No es realista en una consulta con instancia
   propia. No se pagina (§Lo que no entra).

---

## 5 · Qué revisar

**Base de datos**
- [ ] Las dos funciones son `security invoker`, `stable` y con `search_path = ''`. Cada tabla lleva
      alias y no hay ningún `join` entre `citas` y `citas_agenda`.
- [ ] La rama `citas` lleva `(select public.rol_actual()) in (administrador, profesional_sanitario)`.
      Sin eso, TEC1 cuenta C34TEC dos veces (M1). No basta con que «la RLS lo filtre» (H3).
- [ ] La pertenencia es `inicio >= p_desde and inicio < p_hasta`, en **las dos ramas**. Un `fin`
      en el predicado es un bug (M2).
- [ ] `estado <> 'cancelada'` está en la densidad y **no** en la lista (D7).
- [ ] El filtro de centro es `p_centro_id is null or centro_id = p_centro_id`. Un `or centro_id is null`
      reabre las citas sin centro (M6).
- [ ] Las guardas van en el orden extremos → invertido → zona → año. La de zona va antes que la del
      año (D3). Los cuatro fragmentos de mensaje no tienen prefijo común.
- [ ] La salida es exactamente `TABLE(dia date, recuento integer)`. `count(*)` lleva el
      `::integer` (sin él sería `bigint` y cambiaría el tipo generado).
- [ ] Hay `revoke … from public, anon, service_role` y `grant … to authenticated` en las **dos**
      funciones, con la firma completa.
- [ ] No hay índice salvo que G4 lo pida, y si lo hay es el de §1.1.1, en la misma migración.

**Banco**
- [ ] No hay literales de fecha. `anio_34 = Y+9` está declarado en el README (las tres partes de
      §1.3), y `node scripts/rls/fechas-fijas.mjs` sale limpio.
- [ ] El oráculo llama a `agenda_citas_rango` **con el rol de la sesión**, no como `postgres`. Si
      corriera como `postgres`, no compararía la visibilidad.
- [ ] Cada `= 0` tiene una gemela `> 0` (C «no vacío», D1, D2). Un oráculo vacío frente a una
      densidad vacía da verde por el motivo equivocado.
- [ ] Las negativas de zona usan `Etc/UTC`, `posix/…` y la zona nula, **no** una zona inexistente
      (§1.2).
- [ ] Los mutantes M1–M12 se han medido y están en `tickets/T-047/mutantes.json`, cada uno con la
      aserción que lo tumba.
- [ ] Termina con `pg_temp.reset_sesion()`. No hay `delete` ni `update` sobre `citas`.

**Aplicación**
- [ ] `Vista` tiene tres valores. `rangoDeVista` es exhaustivo (con `never`) y `construirVista`
      lanza con `'anio'`. No queda ninguna ternaria «si no es semana» que pueda recibir `'anio'`.
- [ ] `BloqueAnio` no llama a `leerCitasRango` ni a `listarPropuestasPendientes`, pasa `centro`
      **resuelto** (no `parametros.centro`) y pasa `parametros.profesional`.
- [ ] Al cliente solo bajan cadenas, números y booleanos (CA9).
- [ ] Una sola parada de tabulación en todo el año: `querySelectorAll('[data-dia][tabindex="0"]').length === 1`.
- [ ] `alTeclear` no llama a `preventDefault` con modificadores ni con teclas que no son de
      navegación (Tab sigue saliendo de la rejilla).
- [ ] `prefetch={false}` en el enlace del día (D12).
- [ ] Hoy se marca en `foreground` y con subrayado, no con `text-primary` (H18).
- [ ] Los tonos nuevos están en `PARES` con su sitio de uso, y `npm test` (tokens) pasa.
- [ ] El malva no aparece en la densidad.
- [ ] El DOM de la semana y del mes es el mismo de antes, más el enlace «Año».

**Playwright** (`accesibilidad/agenda-anual.spec.ts`, como admin sembrado, con el `entrar` de
`documentacion-pendiente.spec.ts`):
- [ ] **Escritorio, 1440 × 900**:
  - Ir a `/agenda?vista=semana&fecha=<Y>-03-10` (Y es el año en curso, calculado) y pulsar «Año».
  - La URL lleva `vista=anio&fecha=<Y>-03-10`.
  - Tab hasta entrar en la rejilla: el foco está en `[data-dia="<Y>-03-10"]`.
  - → da 03-11, ↓ da 03-18, AvPág da 04-18 e Inicio da el lunes de esa fila.
  - Intro: la URL pasa a `vista=semana&fecha=<ese día>`.
  - Los cuatro primeros `<section>` comparten `top`.
- [ ] **360 × 740** con `hasTouch: true, isMobile: true`:
  - `matchMedia('(pointer: coarse)').matches === true`.
  - `scrollWidth <= clientWidth` en `documentElement`.
  - Cada `[data-dia]` mide ≥ 44 × 44.
  - Los `<section>` tienen `top` estrictamente creciente (uno por fila).

**Puertas laterales**
- [ ] Un técnico que fuerza `?centro=<ajeno>` acaba con el centro descartado por `resolverCentro`.
      Aunque llegara a la base, da cero (D1).
- [ ] Un profesional que fuerza `?profesional=<otro>` obtiene un año vacío, no las citas del otro
      (D2).
- [ ] `anon` por PostgREST: 42501 (A6).
- [ ] El `service_role` no tiene `execute` y no lo necesita: nada de esto se llama con la clave de
      servicio.
- [ ] No hay escritura nueva: las dos funciones son `stable` y no modifican nada, así que no hay
      TRUNCATE, solo adición ni concurrencia que vigilar.

---

## 6 · Territorio

```yaml
territorio:
  - supabase/migrations/20261017120000_agenda_densidad_anual.sql
  - scripts/rls/34-agenda-anual.sql
  - scripts/rls/README.md                       # fila del módulo 34, punto 10.2 y fila de franjas
  - lib/supabase/tipos-bd.ts                    # solo con npm run tipos
  - lib/citas/densidad.ts
  - lib/citas/densidad.test.ts
  - lib/agenda/anio.ts
  - lib/agenda/anio.test.ts
  - app/(app)/agenda/parametros.ts
  - app/(app)/agenda/parametros.test.ts
  - app/(app)/agenda/bloques.ts
  - app/(app)/agenda/bloques.test.ts
  - app/(app)/agenda/vista.ts
  - app/(app)/agenda/vista.test.ts
  - app/(app)/agenda/vista-anio.ts
  - app/(app)/agenda/vista-anio.test.ts
  - app/(app)/agenda/barra-agenda.tsx
  - app/(app)/agenda/barra-agenda.test.tsx
  - app/(app)/agenda/calendario.tsx
  - app/(app)/agenda/calendario.test.tsx
  - app/(app)/agenda/calendario-anio.tsx
  - app/(app)/agenda/calendario-anio.test.tsx
  - app/(app)/agenda/leyenda-densidad.tsx
  - app/(app)/agenda/leyenda-densidad.test.tsx
  - app/(app)/agenda/esqueletos.tsx
  - app/(app)/agenda/esqueletos.test.tsx
  - app/(app)/agenda/page.tsx
  - app/(app)/agenda/page.test.tsx
  - lib/i18n/es.ts
  - app/globals.css                             # tonos densidad-1..4, @theme y .contenedor-anio/.meses-anio
  - lib/contraste/tokens.ts                     # Par.grafico y los ocho pares
  - lib/contraste/tokens.test.ts                # el umbral gráfico
  - accesibilidad/agenda-anual.spec.ts
  - docs/interfaz.md                            # solo §Agenda
  - tickets/T-047/**                            # evidencia, mutantes, revisión
  - docs/bitacora/T-047.md
  - docs/state.md
```

**Fuera, aunque tiente**:

- `components/ui/rejilla-foco.ts`, `rejilla-mes.tsx`, `rejilla-semana.tsx` y `lista-dia.tsx`.
- `lib/citas/agenda.ts`: `fallo()` se copia, no se exporta.
- `lib/fechas/**`: `alMediodia` se copia en `vista-anio.ts`.
- `components/ui/estado-cita.tsx` y `supabase/config.toml`.

---

## 7 · Delegable

`delegable: volumen`, solo pintura y sin foco ni estado:

- **`leyenda-densidad.tsx`** con su prueba. Recibe `entradas` ya calculadas y exporta `FONDO` y
  `ANCHO` (§1.6). La prueba comprueba un `<li>` por entrada, el texto visible y que las muestras
  llevan `aria-hidden`.
- **`EsqueletoAnio`** en `esqueletos.tsx`, con su prueba: `role="status"`, el nombre
  `Cargando el año`, 12 bloques y `motion-reduce:animate-none`.

Todo lo demás es de la fábrica (Opus): la migración, el banco, `densidad.ts`, `anio.ts`,
`vista-anio.ts`, `barra-agenda.tsx`, `calendario-anio.tsx`, `page.tsx`, los tokens y Playwright.

---

## Lo que no entra, y por qué

- **Desglose por estado, tipo o modalidad, y métricas de adherencia.** Es el cuadro inferior y es
  el choque 6 (contrato).
- **Panel del día desde el año.** Exigiría traer filas; el día lleva a la semana (D4 del
  propietario).
- **Paginar la lista de profesionales.** El número de filas está acotado por el número de
  profesionales, muy por debajo de `max_rows`.
- **Prueba de `max_rows` a través de PostgREST.** La garantía es por construcción (≤ 366 filas,
  G3), no por medida.
- **Exportar o imprimir el año.**
- **Cambiar la primitiva `rejilla-foco.ts`, la semana o el mes.** Solo se extrae la barra, sin
  cambiar su DOM.
- **Arreglar el `current_date + 1600` de T-023** ni el solape 16/21. Son de sus tickets
  (state.md).
- **Un índice por `inicio`** salvo que G4 lo exija.
