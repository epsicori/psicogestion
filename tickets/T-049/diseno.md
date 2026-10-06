# T-049 · Diseño corto: banco de RLS sin fechas que caducan

Contrato: `tickets/T-049-fechas-del-banco-rls.md` (D1-D5 y las decisiones P1-P3 del propietario del
06-10-2026). Riesgo medio, sin migración ni código de producto. El ticket no cita ningún ADR. Este
diseño no reabre decisiones: concreta el mecanismo de D1 (un ayudante `pg_temp` en lugar de `\gset`,
§2-a) y la colocación de las anotaciones de D3 (§1.5).

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| El lanzador define `dirRls`, lista los `.sql` con `.sort()` por defecto (orden de código UTF-16: `0-x.sql` va antes que `00-ayudantes.sql`), llama a `localizarContenedor()` en la línea 28 y envuelve todo en `begin; … rollback;` | `scripts/test-rls.mjs:18-48` |
| `localizarContenedor()` ejecuta `docker ps`; `ejecutarSql()` lanza `psql -v ON_ERROR_STOP=1` | `scripts/psql.mjs:13-30` |
| `test:rls` = `node scripts/test-rls.mjs`; `lint` = `eslint` sin rutas, y `eslint.config.mjs` no excluye `scripts/` | `package.json:9,14`; `eslint.config.mjs` |
| Última definición de `fn_proteger_cita_pasada`: con `old.fin <= now()` rechaza (42501) cambiar `inicio`, `fin`, centro, profesional…; **permite** `estado`, `sala` y `nota_operativa` | `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:540-600` |
| En 15, CITA1 solo se toca después de insertarla con `sala` (l.248, 475), `nota_operativa` (l.261) y, en l.494-497, `agenda_actualizar_cita(... p_inicio, p_fin)`: el único cambio que la guarda rechaza en una cita pasada | `scripts/rls/15-agenda.sql:248-497` |
| Literales futuros de 15: líneas 104, 107, 108, 117, 118, 128, 138, 152, 167, 180, 209, 212, 213, 215 y 496. Los de 115-118 y 124-138 están **dentro de plantillas `$sql$`**; el de 152, **dentro de un `do $$ … $$`**; el de 496 es un **argumento** de `format()` (`timestamptz %L`) | `scripts/rls/15-agenda.sql:101-216, 492-497` |
| psql no sustituye `:var` ni `:'var'` dentro de cadenas con comillas de dólar: el `\gset` del contrato original no llega a 117-138 ni a 152 | sintaxis de psql; patrón ya usado en `23-cita-en-episodio.sql:197` (`pg_temp.dia39`) |
| 17: el ancla es una sola línea, `select (current_date + 300) as f29 \gset`, y todos los usos son `:'f29'::date (+ k)`; 17 escribe en `citas`, `series_cita` y `propuestas_cita` | `scripts/rls/17-vinculo-agenda.sql:25, 38-196` |
| 19: las dos citas son `insert` de SQL plano (fuera de toda cadena) en l.97-99 y l.579-581, a `10:00+01` | `scripts/rls/19-nota-en-episodio.sql:96-99, 578-581` |
| 26: las cuatro citas son un `insert` de SQL plano en l.191-199 con `current_date + 1500/1501/1502` | `scripts/rls/26-economico.sql:189-199` |
| Ninguna migración compara `caducidad` con un operador de orden: mover las citas de 26 a Y+6 (después de la caducidad `2031-12-31` de BONO1) no cambia ningún resultado | `grep` sobre `supabase/migrations/*.sql` |
| No hay tabla de festivos nacionales ni guarda de horizonte de agenda; los festivos de prueba son filas de `public.disponibilidad` | `grep` sobre `supabase/migrations/*.sql`; `23-cita-en-episodio.sql:234` |
| Nombres libres para variables psql (globales a todo el banco): `anio_17`, `anio_19`, `anio_26`, `lunes_19`, `lunes_26`, `d15`, y la función `pg_temp.instante15` | `grep -w` sobre `scripts/rls/*.sql` |
| Salida actual del grep de banda corta (D5.1): 16:702 (comentario), 16:1257, 16:1271-1275, 17:25, 18:377 (comentario), 26:192-199 | `scripts/rls/*.sql` |
| Salida actual del grep de año propio (D5.2): 16:50 (+1), 21:37 (+3), 23:194 (+4), 23:198 (+4, dos veces) | `scripts/rls/*.sql` |
| Literales ≥ 2026-10-06 fuera de 15: 01:251; 19:99, 581; 26:182, 211, 604, 607, 608, 617, 623, 626, 629, 632, 639, 642, 650, 1439, 1632; 27:102, 104, 110, 112, 119, 121, 126, 128. Ninguno en módulos fuera del territorio | `scripts/rls/*.sql` |
| 26:1439 y 27:102, 110, 119, 126 están en líneas **interiores** de una plantilla `format($f$ … $f$)` de varias líneas | `26-economico.sql:1438-1439`; `27-exportaciones.sql:99-128` |
| `territorio.mjs` admite siempre `docs/state.md` y `docs/bitacora/**`, y quita comentarios `#` de cada elemento | `~/.claude/pipeline/territorio.mjs` |

## 1 · Piezas y contratos

### 1.1 `scripts/rls/15-agenda.sql` (modificar)

**Ayudante**, justo después del bloque `\set` (tras la l.20), antes de la sección A:

```sql
-- T-049 · Ancla del bloque de agenda: el martes entre D+14 y D+20, siempre en hora local de Madrid.
-- p_dia = 0, 1, 2: el martes, el miércoles y el jueves de ese martes. Nunca un desplazamiento escrito a mano.
create function pg_temp.instante15(p_dia int, p_hora time) returns timestamptz
language sql stable as
$$ select ((current_date + 14 + ((9 - extract(isodow from current_date + 14)::int) % 7) + p_dia) + p_hora) at time zone 'Europe/Madrid' $$;
select (pg_temp.instante15(0, '12:00') at time zone 'Europe/Madrid')::date as d15 \gset
\echo 'Ancla 15: d15=':d15
```

- `stable`, no `immutable` (depende de `current_date`).
- La expresión `current_date + 14` aparece en **una sola línea** del fichero (la del cuerpo).
- Ningún comentario del fichero lleva una fecha `AAAA-MM-DD` (CA1 cuenta también los comentarios).

**Sustituciones** (mismo texto alrededor; solo cambia el instante):

| Línea | Hoy | Pasa a |
|---|---|---|
| 104 | `timestamptz '2026-10-06 10:00:00+02', timestamptz '2026-10-06 10:50:00+02'` | `pg_temp.instante15(0, '10:00'), pg_temp.instante15(0, '10:50')` |
| 107-108 | `tstzrange(… 10:00 …, … 11:00 …, '[)')` | `tstzrange(pg_temp.instante15(0, '10:00'), pg_temp.instante15(0, '11:00'), '[)')` |
| 117-118 (en `$sql$`) | 10-07 10:00 / 10:50, y el `tstzrange` igual | `pg_temp.instante15(1, '10:00')`, `pg_temp.instante15(1, '10:50')`, ídem dentro del `tstzrange` |
| 128 (en `$sql$`) | 10:30 / 11:20 | `pg_temp.instante15(0, '10:30'), pg_temp.instante15(0, '11:20')` |
| 138 (en `$sql$`) | 10:55 / 11:45 | `(0, '10:55')`, `(0, '11:45')` |
| 152 (en `do $$`) | 10:55 / 11:45 | `(0, '10:55')`, `(0, '11:45')` |
| 167 | 11:00 / 11:50 | `(0, '11:00')`, `(0, '11:50')` |
| 180 | 11:10 / 12:00 | `(0, '11:10')`, `(0, '12:00')` |
| 209 | 10-08 09:00 / 09:50 | `(2, '09:00')`, `(2, '09:50')` |
| 212-213 | `tstzrange(… 09:00 …, … 10:10 …, '[)')` | `tstzrange(pg_temp.instante15(2, '09:00'), pg_temp.instante15(2, '10:10'), '[)')` |
| 215 | `where inicio = timestamptz '2026-10-08 09:00:00+02'` | `where inicio = pg_temp.instante15(2, '09:00')` |
| 496 | `:CITA1, '2026-10-06 11:15:00+02', '2026-10-06 12:05:00+02'),` | `:CITA1, pg_temp.instante15(0, '11:15'), pg_temp.instante15(0, '12:05')),` |

En 496 la plantilla de `format` (`timestamptz %L`) **no cambia**: solo los argumentos. Ningún mensaje,
código esperado ni llamada `assert*` cambia (CA2).

### 1.2 `scripts/rls/17-vinculo-agenda.sql` (modificar)

La l.25 se sustituye por dos líneas; nada más del fichero cambia:

```sql
select (extract(year from now())::int + 7) as anio_17 \gset
select (make_date(:anio_17, 6, 1) + ((8 - extract(isodow from make_date(:anio_17, 6, 1))::int) % 7)) as f29 \gset
```

`f29` sigue siendo una fecha (primer lunes de junio de Y+7); sus 15 usos no se tocan.

### 1.3 `scripts/rls/19-nota-en-episodio.sql` (modificar)

Antes de la l.96 (el comentario «Cita de PD con PRO1 en CA»):

```sql
select (extract(year from now())::int + 8) as anio_19 \gset
select (make_date(:anio_19, 1, 1) + ((8 - extract(isodow from make_date(:anio_19, 1, 1))::int) % 7))::text as lunes_19 \gset
```

- l.99: `(:'lunes_19'::date + time '10:00') at time zone 'Europe/Madrid', (:'lunes_19'::date + time '10:50') at time zone 'Europe/Madrid'`.
- l.581: lo mismo con `(:'lunes_19'::date + 7)`.

### 1.4 `scripts/rls/26-economico.sql` (modificar)

Antes del comentario de la l.189 («Tres citas FUTURAS…»):

```sql
select (extract(year from now())::int + 6) as anio_26 \gset
select (make_date(:anio_26, 6, 1) + ((8 - extract(isodow from make_date(:anio_26, 6, 1))::int) % 7))::text as lunes_26 \gset
```

En l.192-199: `(current_date + 1500)` → `(:'lunes_26'::date + 0)`, `1501` → `+ 1`, `1502` → `+ 2`. Horas
iguales. CITAP2 (PRO2/CB) va al mismo día que CITA1, como hoy.

### 1.5 Anotaciones `-- fecha-fija:` (01, 26, 27)

Una línea propia `-- fecha-fija: <motivo>` **inmediatamente antes** de cada línea con literal futuro:

- `01-fijacion.sql`: 251.
- `26-economico.sql`: 182, 211, 604, 607, 608, 617, 623, 626, 629, 632, 639, 642, 650, 1439, 1632.
- `27-exportaciones.sql`: 102, 104, 110, 112, 119, 121, 126, 128.

Reglas:
- La anotación de una línea no cubre la siguiente: 607/608 y cada par de 27 (102/104…) llevan una cada uno.
- Si la línea anterior está dentro de una plantilla `$f$ … $f$` de varias líneas (26:1439; 27:102,
  110, 119, 126), la anotación queda dentro del SQL dinámico como comentario de línea completa. Es
  válido, y por eso el motivo **no lleva `%`** (rompería `format`), **ni `$`, `'` ni `:` seguido de
  letra**. Palabras y espacios.
- Motivos tipo: «caducidad de bono, ninguna guarda la compara con el reloj»; «creada_en como postgres,
  el ±1 minuto solo aplica a authenticated»; «TEC1 cae por permiso antes de mirar la fecha».

### 1.6 `scripts/rls/fechas-fijas.mjs` (crear)

CLI de Node puro (`node:fs`, `node:path`, `node:url`), sin exportaciones, cabecera en castellano.

- **Uso**: `node scripts/rls/fechas-fijas.mjs [--hoy AAAA-MM-DD] [fichero.sql …]`.
- **Ficheros por defecto**: los `.sql` del directorio del propio script
  (`path.dirname(fileURLToPath(import.meta.url))`), ordenados. Nunca relativo a `process.cwd()`.
- **Hoy**: `--hoy` si viene (exige `^\d{4}-\d{2}-\d{2}$` y fecha válida); si no,
  `new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())`.
- **Literal**: `/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g` sobre cada línea (`split(/\r?\n/)`). Se
  descarta si mes ∉ 1..12 o el día no existe en ese mes (comprobación con `Date.UTC` y vuelta). Los
  UUID (`8-4-4-4-12`) no casan; `2026-10-06T10:00` sí.
- **Futuro**: comparación de cadenas `fecha >= hoy`.
- **Anotado**: la línea `i` o la `i-1` casa con `/fecha-fija:\s*\S/`.
- **Salida (stdout)**: una línea por literal sin anotar, `<ruta>:<línea>: <AAAA-MM-DD>`, con `<ruta>` =
  `path.relative(process.cwd(), f)` con `/`; después un resumen
  `fechas-fijas: <n> literal(es) futuro(s) sin anotar (hoy = …). Muévelo a un ancla relativa o anótalo (README, punto 10).`
  Si no hay ninguno: `fechas-fijas: <f> fichero(s), <k> literal(es) futuro(s) anotado(s), ninguno sin anotar (hoy = …).`
- **Códigos**: `0` limpio; `1` algún literal sin anotar; `2` uso incorrecto (`--hoy` mal formado o sin
  valor, fichero inexistente). Nunca `0` ante un error de uso.

### 1.7 `scripts/test-rls.mjs` (modificar: solo añadir)

- Import: `import { spawnSync } from "node:child_process";`.
- Entre `ficherosSql()` y `const contenedor = localizarContenedor();`:

```js
// T-049 · Antes de tocar la base, el lint de fechas fijas: una fecha futura sin anotar corta aquí,
// sin docker ni psql (scripts/rls/README.md, punto 10).
const lint = spawnSync(process.execPath, [path.join(dirRls, "fechas-fijas.mjs")], { stdio: "inherit" });
if (lint.status !== 0) {
  console.error("test:rls: el lint de fechas fijas no pasa; el banco no se ejecuta.");
  process.exit(lint.status ?? 1);
}
```

Ninguna línea existente se borra ni se edita (CA9).

### 1.8 `scripts/rls/README.md` (modificar)

- «Cómo funciona»: una frase, «`test:rls` pasa primero `fechas-fijas.mjs`; si falla, no llega a la base».
- Punto 5: añadir «ni escribas una fecha futura literal: ancla relativa (punto 10) o, si no es agenda,
  `-- fecha-fija: motivo`».
- **Punto 10 nuevo**: las tres reglas de D5 con sus dos greps y la salida esperada exacta (§3, CA8); la
  tabla de franjas (columna «tras T-049» del contrato, con 29 → +10 para T-043); la prohibición de
  `fecha-fija:` en `citas`, `series_cita`, `propuestas_cita` y `disponibilidad`; y cómo se calcula un
  ancla anual (las dos líneas de §1.2 como plantilla).

### 1.9 `docs/state.md` (reescribir, ≤ 80 líneas)

- Quitar el hallazgo «Fechas fijas ya pasadas en banco RLS … también en `18-agenda-rango`».
- Añadir tres hallazgos: solape de calendario 16/21 (`lunes_21 + 259`, cambia en 2029); colisión
  interna del 16 (C7 contra `desde_8_martes`, jueves a mediodía en enero-febrero); comentario
  desfasado `16-series.sql:702` (nombra el `current_date + 300` del 17).
- «Siguiente paso»: T-049 se fusiona antes que T-043, que rebasa y añade su fila (29 → +10).

### 1.10 `docs/bitacora/T-049.md` (crear)

Inventario A-D, fechas calculadas de §B, solape 16/21 y la salida de CA3, CA4 y CA11.

## 2 · Decisiones y alternativas descartadas

- **a · Ayudante `pg_temp.instante15` en vez de `\gset`.** `\gset` no entra en `do $$` ni en `$sql$`;
  pasar cada instante como argumento `%L` reescribiría seis plantillas y el bloque `do`. Descartado:
  `\gset` + reescritura de plantillas (más diff, más riesgo de cambiar lo que prueban).
- **b · Martes de D+14..D+20 calculado en el ayudante, no en una variable**, para que CA3 se fuerce con
  un solo `sed` sobre una sola línea.
- **c · El lint se lanza con `spawnSync(process.execPath, …)` y no con `import`.** El lint es un CLI con
  `process.exit`; importarlo lo ejecutaría al cargar. Una sola puerta de entrada, y CA11 prueba la real.
  Descartado: exportar una función y además un CLI (dos superficies para lo mismo).
- **d · El lint va antes de `localizarContenedor()`.** Falla sin Docker y sin tocar la base compartida.
- **e · Año propio en dos líneas (`anio_NN` y la fecha).** El grep de D5.2 da una coincidencia por
  módulo y el desplazamiento se lee de un vistazo. Descartado: la expresión repetida dos veces en una
  línea (dos coincidencias, más ruido en CA8).
- **f · Anotación en línea propia antes del literal**, también dentro de plantillas (comentario de línea
  completa). Descartado: al final de la línea del literal, porque D3 lo prohíbe dentro de cadenas y
  una regla única es más fácil de revisar.
- **g · Salida con ruta relativa al directorio de trabajo**, para que `C:` no rompa los `sed` de CA6.
- **h · Sin prueba Vitest del lint.** CA6, CA7 y CA11 lo ejercitan por su entrada real; `npm test` no
  cubre `scripts/`.
- **i · `0-trampa.sql` + `\q` en CA11.** Ordena antes que `00-ayudantes.sql` y, si el corte fallara,
  psql saldría tras el `begin` sin ejecutar el banco ni confirmar nada.

## 3 · Cómo se cierra cada criterio de aceptación

`$T` = un directorio temporal fuera del árbol (`mktemp -d`). Todo lo que habla con la base corre en
`begin … rollback` o se corta con `\q`. **Nada de `db reset`, `seed` ni consultas que confirmen.**

- **CA1**: `grep -cE "\b20[0-9]{2}-[01][0-9]-[0-3][0-9]\b" scripts/rls/15-agenda.sql` → `0`.
- **CA2**: `diff <(git show main:scripts/rls/15-agenda.sql | grep -oE "assert[a-z_]*\(|'(23P01|42501|23514|22023)'" | sort | uniq -c) <(grep -oE "assert[a-z_]*\(|'(23P01|42501|23514|22023)'" scripts/rls/15-agenda.sql | sort | uniq -c)` → sin salida, código 0.
- **CA3**: `cp -r scripts "$T/s"; rm "$T"/s/rls/1[6-9]-*.sql "$T"/s/rls/2[0-9]-*.sql;
  sed -i 's/current_date + 14/current_date - 7/g' "$T/s/rls/15-agenda.sql"; node "$T/s/test-rls.mjs"; echo $?`
  → código ≠ 0 y la única `ASERCIÓN FALLIDA` es «lanzó 42501 en vez de 23P01: Mover una cita encima de
  otra por la funcion CHOCA igual … Una cita pasada no se puede reprogramar». Gemela: otra copia sin
  el `sed` → código `0`. Si cae en otra aserción antes, **se para y se informa**: no se ajusta el banco.
- **CA4**: lectura previa `docker exec <contenedor> psql -U postgres -tAc "select max(version) from supabase_migrations.schema_migrations"` → `20261011140000`; luego `npm run test:rls; echo $?` → `0`, la primera línea es el resumen de éxito del lint, `Módulos (N)` con N = `ls scripts/rls/*.sql | wc -l` (28), y el último aviso de `28-…`.
- **CA5**: `node scripts/rls/fechas-fijas.mjs; echo $?` → `0`.
- **CA6**: `git show main:scripts/rls/15-agenda.sql > "$T/15.sql"; node scripts/rls/fechas-fijas.mjs --hoy 2026-10-01 "$T/15.sql" | sed -nE 's/.*:([0-9]+): [0-9]{4}-[0-9]{2}-[0-9]{2}$/\1/p' | sort -un | tr '\n' ' '`
  → `104 107 108 117 118 128 138 152 167 180 209 212 213 215 496`, y el código del lint (sin tubería) es `1`.
- **CA7**: `printf -- "-- fecha-fija:\nselect date '2099-01-01';\n" > "$T/a.sql"` → código `1`;
  `printf -- "-- fecha-fija: prueba\nselect date '2099-01-01';\n" > "$T/b.sql"` → `0`;
  `--hoy 2026-01-01 scripts/rls/14-cadena-huellas.sql` → `1`. Añadido: `--hoy 2026-1-1` → `2`.
- **CA8**: grep de banda corta → exactamente: la línea del ayudante de 15, `16-series.sql:702`,
  `16-series.sql:1257`, `16-series.sql:1271..1275`, `18-agenda-rango.sql:377`. Grep de año propio →
  `16-series.sql:50` (+1), la línea `anio_17` (+7), la `anio_19` (+8), `21-alta-de-cita.sql:37` (+3),
  `23-cita-en-episodio.sql:194` y `:198` ×2 (+4), la `anio_26` (+6). Y
  `grep -nE "current_date *\+ *(300|150[0-2])" scripts/rls/17-vinculo-agenda.sql scripts/rls/26-economico.sql` vacío.
  Las mismas listas, copiadas en el punto 10 del README.
- **CA9**: `node ~/.claude/pipeline/territorio.mjs T-049` → verde; `git diff main --stat -- scripts/rls/16-series.sql scripts/rls/18-agenda-rango.sql scripts/rls/21-alta-de-cita.sql scripts/psql.mjs package.json` → vacío; `git diff main -- scripts/test-rls.mjs | grep -E "^-[^-]"` → vacío.
- **CA10**: `npm run lint; echo $?` → `0`.
- **CA11**: `cp -r scripts "$T/t"; printf "select date '2099-01-01';\n\\\\q\n" > "$T/t/rls/0-trampa.sql"; node "$T/t/test-rls.mjs"; echo $?`
  → `1`, la salida contiene `0-trampa.sql:1: 2099-01-01` y **no** contiene `Contenedor:`. Gemela: con
  `-- fecha-fija: prueba` en una primera línea → `Contenedor:` aparece y el código es `0`.
- **CA12**: `wc -l < docs/state.md` ≤ 80; `grep -c "18-agenda-rango" docs/state.md` → `0`; `grep -nE "16/21|C7|16-series.sql:702" docs/state.md` → tres hallazgos.

## 4 · Riesgos, por probabilidad

1. **Media · Una anotación dentro de `format()` lleva `%`** → «unrecognized format() type specifier» en
   26 o 27. Mitigación: la regla de §1.5; CA4 lo caza.
2. **Media · Alguna otra franja de PRO1 en D+14..D+22 no inventariada** (huecos o propuestas de 16-28
   que ahora vean ocupado el martes 10:00-12:05 o el jueves 09:00-10:10). El contrato no la encontró;
   CA4 la caza. Si aparece, **se para y se informa**: no se mueven horas del 15 por cuenta propia.
3. **Baja · CA3 cae antes de l.494.** La guarda permite `sala`, `nota_operativa` y `estado` en una cita
   pasada, y el fallo real del 06-10 llegó a l.494; poco probable.
4. **Baja · La base no está en `20261011140000`** porque un revisor de T-043 la dejó con su migración.
   CA4 lo lee antes y se avisa al orquestador; no se resetea.
5. **Baja · Variable psql pisada**: los nombres de §0 están libres hoy; un módulo futuro que reutilice
   `anio_17` la pisaría. El README (punto 10) pide sufijo de módulo.
6. **Baja · Diferencia UTC/Madrid en `current_date`**: margen de 14 días; irrelevante.

## 5 · Qué revisar

**Entradas del llamante y su efecto**
- `fechas-fijas.mjs`: `--hoy` cambia el umbral; mal formado o sin valor → código 2, nunca 0. Un fichero
  inexistente → 2. Sin ficheros → los del directorio del script, no del `cwd` (ejecutar desde otra
  carpeta da el mismo resultado).
- `test-rls.mjs`: no acepta argumentos nuevos; el lint corre siempre, sin forma de saltarlo.

**Pruebas que deben fallar, y por qué motivo exacto**
- CA3: 42501 con «Una cita pasada no se puede reprogramar» en la aserción «Mover una cita encima de
  otra», y en ninguna otra. Otra aserción o otro mensaje = la gemela no prueba lo que dice.
- CA6: exactamente las 15 líneas; una de más o de menos es un fallo del patrón.
- CA7: el `-- fecha-fija:` vacío cae; uno con solo espacios también.
- CA11: código 1 **sin** `Contenedor:`. Si aparece, el corte va después de Docker y el criterio no se cumple.

**Invariantes que se podrían saltar por otra puerta**
- **La anotación como coladero**: `fecha-fija:` sobre una cita también pasa el lint. Revisar cada
  anotación: `grep -n -A1 "fecha-fija:" scripts/rls/*.sql`, y ninguna línea anotada puede escribir en
  `citas`, `series_cita`, `propuestas_cita` ni `disponibilidad` ni llamar a `agenda_crear_*` o
  `agenda_actualizar_cita`.
- **Anotación a dos líneas**: solo cuentan la misma línea y la anterior; comprobar que el código no
  mira más atrás ni hacia delante.
- **Patrón**: no casa dentro de UUID; casa `AAAA-MM-DDThh`; las fechas imposibles (`2026-02-30`) se
  descartan, y no se descartan las válidas.
- **Umbral**: «hoy» de Madrid, no `toISOString()` (UTC); comparación `>=` (hoy cuenta como futuro).
- **Lanzador**: `status` nulo (señal) o error de `spawnSync` → salida distinta de 0; sin `shell: true`;
  el código del lint se propaga (2 sigue siendo 2).
- **15**: ningún literal en comentarios; las plantillas `$sql$` y la de l.496 conservan su texto salvo
  el instante; `instante15` es `stable`; el día de cada cita se conserva (martes 0, miércoles 1, jueves 2).
- **17, 19, 26**: el diff toca solo el ancla, las inserciones que la usan y las anotaciones; las horas
  locales no cambian (19 sigue a las 10:00 de Madrid, ahora sin `+01` a mano).
- **Base compartida**: ninguna orden de la evidencia confirma filas (sin `db reset`, `seed`, ni `psql`
  fuera de `begin … rollback`).
- No aplican aquí: concurrencia, permisos de tabla, `TRUNCATE`, nulos de columna (no hay esquema nuevo).

## 6 · Territorio

El que declara el contrato (once rutas); este diseño no lo amplía.

## 7 · Delegable

Nada. El lint es puro pero está acoplado a CA6, CA7 y CA11, y el resto exige razonar colisiones.

## Lo que no entra, y por qué

- Corregir el comentario de `16-series.sql:702`: el 16 está fuera del territorio; va a hallazgo y CA8 lo
  da por esperado.
- Una prueba Vitest del lint: CA6, CA7 y CA11 lo prueban por su entrada real (§2-h).
- Hacer que el lint distinga literales de agenda de los que no lo son: haría falta analizar SQL; lo
  cubre la revisión de §5.
- Todo lo de §«Lo que no entra» del contrato (solape 16/21, colisión interna del 16, simular el reloj,
  literales pasados).
