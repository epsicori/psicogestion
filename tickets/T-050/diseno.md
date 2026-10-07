# T-050 · Diseño corto: el banco 23 deja de chocar con las citas ancladas a `now()`

Contrato: `tickets/T-050-banco-23-solape.md`. Riesgo medio, sin migración ni código de producto, sin
ADR citado. Antecedente: `tickets/T-049-fechas-del-banco-rls.md` (tabla de franjas, D5) y
`tickets/T-049/diseno.md`. El diseño se ha hecho solo leyendo, con `SELECT` contra la base local
(sin `db reset`, `seed` ni `test:rls`).

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| El paso Z inserta, como `postgres`, la cita `c_z` de T39 con **PRO1** (`b0030001-…-0002`) en CA, en `pg_temp.ts39(-2, time '10:00')`: el día `current_date − 2` a las 10:00 de Madrid, 20 minutos | `scripts/rls/23-cita-en-episodio.sql:1167-1168`; `ts39` y `sql_ins39` en l.201-211 |
| Después cierra ET39 en `current_date − 5`: la cita queda **posterior** al cierre, que es lo que vigila el cable trampa | `23-cita-en-episodio.sql:1169`, comentario l.1159-1160 |
| `episodio_para_nota` (paso 5b) solo mira si `cerrado_en` es no nulo; el día de la cita no cuenta para Z1-Z3 | `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:729-749` |
| `citas_sin_solape_profesional` = `exclude using gist (profesional_id with =, rango_bloqueante with &&) where estado in ('programada','confirmada','realizada')` | `supabase/migrations/20260906120000_agenda_esquema.sql:301-305` |
| `rango_bloqueante = [inicio, fin + descanso)` y se congela al insertar: no se recalcula al cambiar el descanso | `20260906120000_agenda_esquema.sql:239-285` |
| PRO1 tiene descanso de 10 minutos desde `15-agenda.sql:107` (y vuelve a 10 en l.227); `21-alta-de-cita.sql:35` lo repite | `15-agenda.sql:107, 202, 227` |
| **La cita con la que choca**: `15-agenda.sql`, sección H (l.295-320), un `do $$` que inserta para PRO1/CA una cita de `now() − 2 days` a `now() − 2 days + 50 min` y la pasa a `realizada`. Nadie la cancela: sigue activa cuando corre el 23. Bloquea `[now−48 h, now−47 h)` (50 min + 10 de descanso) | `15-agenda.sql:303-309` |
| Todo el banco es una transacción: `now()` es la hora de arranque de `test:rls`, constante | `scripts/test-rls.mjs` (`begin … rollback`) |
| La sesión del banco corre en `TimeZone = UTC`: `current_date` es la fecha UTC | `SELECT current_setting('TimeZone')` → `UTC` |
| Ninguna cita de la siembra es de PRO1 del banco | `SELECT count(*) FROM citas WHERE profesional_id = 'b0030001-…-0002'` → `0` |
| Los escenarios de cita del 14 (T-036) se deshacen con `rollback to savepoint s036` | `14-cadena-huellas.sql:2052, 2098-2231` |
| Citas de PRO1 ancladas a `now()` que siguen activas cuando corre el 23: 15.H (−48 h); 16 C5P1 (−10 d), C5P2 (−3 d), C5P3 (−1 d, realizada), C7PAS (−7 d), C7N3 (movida a `now() − 5 min`, l.1369); 20 C1, C2, C4, C5 (−41 d 3 h … −45 d 3 h); 22 c2 (−2 h 20), c25 (−25 h 20), c26 (−26 h 20) y las de Z22 de −73 h 20 a −92 h 20. C5F1, C5F2, C7CUR y C7N2 se cancelan antes | `16-series.sql:358-362, 370-393, 1269-1275, 1350, 1368-1369`; `20-nota-borrador.sql:186, 241-244`; `22-avisos.sql:52-783` |
| Los bancos 24-29 no insertan citas de PRO1 ancladas a `now()`; 26 usa D−37 y D−39 a las 07:05 | `grep` sobre `scripts/rls/2[4-9]-*.sql` |
| La evidencia de T-023 se selló a las 10:11 (Madrid) del 07-10-2026: el banco arrancó poco antes, dentro de la ventana de abajo | `git log tickets/T-023/evidencia.json` → `45bebb0 2026-10-07 10:11:21 +0200` |

### Causa exacta del 23P01

`c_z` bloquea `[D−2 10:00, D−2 10:30)` en hora de Madrid. La cita H del 15 bloquea `[now−48 h, now−47 h)`.
Se solapan si `test:rls` **arranca entre las 09:00 y las 10:30 (hora de Madrid)**: entonces la cita del 15
cae en el mismo tramo de D−2. Fuera de esa ventana el banco pasa, y por eso «00+01+23 aislados pasan»
(sin el 15 no hay cita H). No es una fecha que caduca, es **una hora de arranque**. Comprobado con una
simulación de solo lectura (anexo A): con arranques cada 10 minutos el 07-10-2026, el choque ocurre de
09:10 a 10:20. A lo largo de un año, por los cambios de hora, la ventana se mueve entre las 08:10 y las 11:20.

**El mecanismo**. Una cita anclada a `now() − k` cae en una hora que depende de cuándo arranca el banco y
barre así todas las horas de su día. Una cita a hora fija (`current_date − d` + hora) choca con ella en
algún arranque, sea cual sea la hora elegida. Dos citas de PRO1 de esas dos familias **no pueden compartir
día**. La misma simulación encuentra dos casos latentes más en el 23:

| Cita del 23 | Choca con | Arranques que fallan (07-10-2026) |
|---|---|---|
| `c_z` (D−2 10:00, l.1167) | 15.H `now() − 2 days` | 09:10-10:20 · **el fallo observado** |
| `c_pasada` (D−10 05:00, l.976) | 16 C5P1 `now() − 10 days` | ~04:10-05:20 |
| C3b (D+0 03:00, l.366) | 22 c2 `now() − 2 h 20` y 16 C7N3 `now() − 5 min` | ~05:00-05:40 y ~02:10-03:30 |

## 1 · Piezas y contratos

Un solo fichero de código: `scripts/rls/23-cita-en-episodio.sql`. **No se añade ni se quita ninguna línea
antes de la 198**: el punto 10 del README fija `23:194` y `23:198` en la comprobación de año propio, y el
README está fuera del territorio.

### 1.1 Z: la cita a D−5 a mediodía y el cierre a D−6

- l.1167 y l.1168: `-2, time '10:00'` → `-5, time '12:00'` (las dos apariciones; el mensaje
  `'Z · fijación de la cita pasada c_z en ET39 (abierto)'` **no cambia**).
- l.1169: `cerrado_en = current_date - 5` → `cerrado_en = current_date - 6`. Así la cita sigue
  siendo posterior al cierre, que es la condición que el cable trampa debe conservar para T-034 SQL-H2.
- Justo antes de la l.1167, un comentario de dos líneas sin fechas `AAAA-MM-DD`:
  `-- T-050 · D−5 a mediodía: ningún módulo anterior deja en D−5 una cita de PRO1 anclada a now() (el 15
  deja una en now() − 2 días, que barre D−2 según la hora de arranque). El cierre, un día antes.`

### 1.2 `c_pasada`: D−9 en vez de D−10

- l.976 y l.977: `-10, time '05:00'` → `-9, time '05:00'` (las dos apariciones; mensaje igual).
- Antes de la l.976, una línea:
  `-- T-050 · D−9 y no D−10: el 16 deja C5P1 en now() − 10 días, que barre D−10 según la hora de arranque.`

### 1.3 `docs/state.md` (reescribir, ≤ 80 líneas)

Tres hallazgos (§4 y §«Lo que no entra»): C3b latente (22 c2 y 16 C7N3), la tabla de franjas sin la
familia `now()` y la regla 10.4 propuesta. Se quita lo que T-050 cierra, si aparece.

### 1.4 `docs/bitacora/T-050.md` (crear)

La causa, la ventana medida, la salida de las gemelas de §3 y la tabla del anexo A, antes y después.

## 2 · Decisiones y alternativas descartadas

- **a · Cambiar de día, no de hora.** Ninguna hora de D−2 está libre para todos los arranques: la cita H
  del 15 recorre el día entero. Descartado: otra hora en D−2.
- **b · D−5 para Z.** Es el primer día anterior a hoy al que no llega ninguna cita de PRO1 anclada a
  `now()`. Las de Z22 (hasta −92 h 20) llegan, como muy pronto, a D−4 03:40. C7PAS cae en D−7. Margen de
  más de ocho horas, también con el cambio de hora y con `current_date` en UTC. Descartados: D−4 a las
  01:00, libre por solo 1 h 10; D−6, igual de válido pero mueve el cierre más lejos sin ganar nada.
- **c · Mediodía.** Es la convención de `.claude/rules/fechas.md`: a las 12:00 no hay hora inexistente
  ni ambigua. Además, el 23 no tiene ninguna otra cita en D−5.
- **d · El cierre pasa a D−6.** Con el cierre en D−5 y la cita en D−5, la cita dejaría de ser posterior
  al cierre y el cable trampa vigilaría otra cosa. Z1-Z3 seguirían en verde, pero la alarma de T-034
  SQL-H2 («prohibir el cierre con citas posteriores») ya no saltaría aquí.
- **e · `c_pasada` entra, aunque no es el fallo observado.** Es el mismo mecanismo en el mismo fichero,
  cuesta un carácter, y el contrato pide mover «las citas del banco 23». D−9 está libre (C5P1 cae en
  D−10 y llega, con el cambio de hora, como mucho a las 04:00) y el 23 no tiene otra cita ese día. S6 y
  S6b solo exigen que la cita sea pasada.
- **f · C3b no se mueve.** Tiene que caer el mismo día que la baja de V39 (`baja_en = current_date`,
  l.191: es la gemela «baja el mismo día»). Ese día lo barre la c2 del 22 (de 00:00 a 22:10) y, por la
  noche, la C7N3 del 16. Ninguna hora de D+0 está libre: está medido, de 00:00 a 23:30 en tramos de 30
  minutos. Moverla obliga a cambiar la baja de V39, y esa baja la usan R(e), C3, D3 y H2 («hoy y
  mañana»). Va a hallazgo, como pide el contrato cuando el choque viene de otro banco.
- **g · Sin anclar el 23 a `now()`.** Daría a Z la familia contraria y la expondría a las citas a hora
  fija de otros módulos. El 23 ya ancla todo con `ts39`. Descartado.
- **h · Sin tocar el 15.** Fuera del territorio, y su sección H prueba «anteayer», que necesita
  `now()`.

## 3 · Cómo se cierra cada criterio de aceptación

`$T` = directorio temporal fuera del árbol. Todo `test:rls`, también el de las copias, corre en
`begin … rollback`. El `db reset` y la `seed` los pide el orquestador con permiso: la base es compartida.

- **Reproducción (tarea 1), sin esperar a las 09:00.** La copia de `main` con Z puesta a la hora de
  arranque cae siempre:
  `cp -r scripts "$T/a"; sed -i "1167,1168s/-2, time '10:00'/-2, (now() at time zone 'Europe\/Madrid')::time/" "$T/a/rls/23-cita-en-episodio.sql"; node "$T/a/test-rls.mjs"; echo $?`
  → código ≠ 0, y la salida contiene `23P01` y `c_z` (en la fijación de Z, no en otra aserción). No vale
  si se lanza entre las 00:00 y las 02:00 de Madrid, cuando `current_date` (UTC) es el día anterior.
- **Gemela de la arreglada.** La misma sustitución sobre el fichero nuevo,
  `-5, time '12:00'` → `-5, (now() at time zone 'Europe\/Madrid')::time`, termina con código `0`: D−5
  está libre a la hora de arranque. Para `c_pasada`, lo mismo con `-10` (cae con 23P01 en «S · fijación
  de la cita pasada») frente a `-9` (código `0`).
- **CA1 · `test:rls` en verde tras `db reset` + `seed`.** Antes: `select max(version) from
  supabase_migrations.schema_migrations` como lectura, y anotar el valor. Después: `npm run test:rls;
  echo $?` → `0`, con `23-cita-en-episodio: completa.` y el resumen final. Se anota la hora de arranque.
- **CA1 bis · la cobertura no depende de la hora.** La simulación del anexo A, con las filas nuevas
  (`-5 12:00`, `-9 05:00`): **ninguna fila** para ellas. Las filas de hoy (`-2 10:00`, `-10 05:00`)
  salen, y eso demuestra que la simulación detecta el choque. Se guarda como `tickets/T-050/simulacion.sql`
  y su salida va a la bitácora.
- **CA2 · el lint de fechas fijas sigue en verde.** `node scripts/rls/fechas-fijas.mjs; echo $?` → `0`.
  Además, las dos comprobaciones del punto 10 del README dan lo mismo que en `main`: `23:194` y `23:198`
  ×2 en la de año propio y nada nuevo del 23 en la de banda corta. Con `git diff main --stat` solo cambia
  `23-cita-en-episodio.sql` y no se añade ninguna línea antes de la 198
  (`git diff main -U0 -- scripts/rls/23-cita-en-episodio.sql | grep '^@@'`: todos los tramos empiezan
  después de la l.900).
- **Territorio.** `node ~/.claude/pipeline/territorio.mjs T-050` en el worktree del ticket → verde.

## 4 · Riesgos, por probabilidad

1. **Media · C3b sigue siendo latente.** Un arranque hacia las 05:00-05:40, o de 02:10 a 03:30 (Madrid),
   pone rojo el 23 en C3b con 23P01. No se cierra aquí (§2-f). El verificador anota la hora de arranque;
   si cae en esa ventana, repite fuera de ella y lo dice.
2. **Media · Un banco nuevo pone otra cita de PRO1 anclada a `now()` en D−5 o D−9.** Si corre antes del
   23, vuelve el mismo fallo; si corre después (30 de T-023 en adelante), es él quien falla. Mitigación:
   la regla 10.4 propuesta (§«Lo que no entra»).
3. **Baja · Se añade una línea antes de la 198** (un comentario en la cabecera) y la comprobación de año
   propio del README deja de casar con `23:194/198`. El §3 lo comprueba con los `@@` del diff.
4. **Baja · La base no está en la última migración de `main`** porque otro agente la dejó en una rama.
   CA1 lee `max(version)` antes y avisa; no se resetea por cuenta propia.

## 5 · Qué revisar

- **Qué elige el banco y qué efecto tiene**: solo dos pares `(día, hora)` de `sql_ins39`/`ts39` y un día
  de cierre. Cada par aparece dos veces, en la inserción y en la búsqueda con `\gset`: si solo se cambia
  una, el `\gset` no encuentra fila y `c_z` (o `c_pasada`) queda vacío. Las aserciones siguientes caerían
  por un motivo ajeno.
- **Prueba que debe fallar, y por qué**: la gemela de reproducción cae con **23P01 en la fijación de Z**.
  Si cae antes, en otra aserción, o con otro código, no reproduce el fallo del contrato.
- **Invariante que se podría saltar**: que la cita de Z sea **posterior** al cierre de ET39 (cita D−5 >
  cierre D−6). Revisar que el cierre se movió con la cita.
- **Ningún mensaje ni código esperado cambia**:
  `git diff main -- scripts/rls/23-cita-en-episodio.sql | grep -E "^[-+].*(assert|'2[0-9A-Z]{4}')"`
  solo enseña las dos líneas `assert_no_lanza` de fijación, con el mismo texto entre comillas.
- **Comentarios sin `AAAA-MM-DD`**: el lint cuenta también los comentarios.
- **Nulos, duplicados, concurrencia, permisos, TRUNCATE**: no aplican; no hay esquema, política ni
  función nueva.

## 6 · Territorio

El del contrato (`scripts/rls/23-cita-en-episodio.sql`, `tickets/T-050/**`, `docs/bitacora/T-050*.md`,
`docs/state.md`). Este diseño no lo amplía. `scripts/rls/README.md` queda **fuera**.

## 7 · Delegable

Nada. Son cinco sustituciones, pero la evidencia (gemelas y simulación) exige entender el mecanismo, y
el contrato dice `delegable: no`.

## Lo que no entra, y por qué

- **C3b** (§2-f). Hallazgo en `state.md`: «C3b del 23 (D+0 03:00, baja de V39) choca con 22 c2
  (`now() − 2 h 20`) al arrancar hacia las 05:00-05:40 y con 16 C7N3 (`now() − 5 min`) hacia las
  02:10-03:30. Ninguna hora de D+0 está libre. Arreglo: llevar la baja de V39 y C3b a un día sin citas
  de PRO1 ancladas a `now()` (D−5, D−6, D−8, D−9), revisando R(e), C3, D3 y H2, o sacar la c2 del 22 a
  otro profesional.»
- **¿Debía haberlo evitado T-049? Sí, la tabla; el lint no podía.** `fechas-fijas.mjs` solo ve
  literales `AAAA-MM-DD`, y aquí no hay ninguno. La tabla del README (punto 10) falla en dos cosas.
  (1) La fila del 15 dice «PRO1/CA martes D+14..D+20, y PRO2/CB en `now()`», y omite la cita H de **PRO1**
  en `now() − 2 días`. (2) Modela las franjas por rangos de días y deja que 16 (D−10..D+68), 20/22
  (D−45..D−1) y 23 (D−40..D+11) se solapen en PRO1 sin decir cómo se separan. La separación por horas
  que usa el 23 («a horas distintas entre sí») no sirve contra una cita anclada a `now()`. El razonamiento
  de T-049 (D1, punto 3) solo comprobó D+14..D+22.
  **Comprobación propuesta** (README, fuera de territorio; ticket aparte o anexo de T-049, decide el
  propietario). Una regla 10.4, «dos anclas, días distintos»: una cita a hora fija (`current_date ± k` +
  hora) no cae en un día al que llegue una cita del mismo profesional anclada a `now() ± interval`. La
  tabla gana una columna con esos días, que para PRO1 son D+0, D−1, D−2, D−3, D−4, D−7, D−10, D−41..D−46
  y D+40..D+68. Comprobación por grep, al estilo de las reglas 1 y 2, que debe devolver exactamente el
  inventario:
  `grep -nE "now\(\) *[-+] *interval '[^']+'( *\+ *interval '[^']+')?, *(fin *= *)?now\(\)" scripts/rls/*.sql`.
  Una cita nueva anclada a `now()` obliga a actualizar la columna y a mirar las citas a hora fija de esos
  días. Si se quiere sin mantenimiento a mano: la simulación del anexo A como módulo propio, que lea el
  inventario de un fichero.
- **Corregir la fila del 15 en la tabla del README**: fuera de territorio; va con el hallazgo de arriba.
- **Tocar el 15, el 16 o el 22**: fuera de territorio y no hace falta para Z ni para `c_pasada`.

## Anexo A · Simulación de solo lectura (va a `tickets/T-050/simulacion.sql`)

Una sola sentencia `select`; se lanza con `docker exec -i supabase_db_Psicogestion psql -U postgres -At
-F ' | ' < tickets/T-050/simulacion.sql`. Para cada hora de arranque (un año, cada 10 minutos), cruza las
citas de PRO1 ancladas a `now()` que siguen activas cuando corre el 23 con las del 23 a hora fija.
`current_date` se toma en UTC, como en el banco.

```sql
with ahora as (
  select g as t from generate_series(timestamptz '2026-10-07 00:00+02', timestamptz '2027-10-07 00:00+02', interval '10 minutes') g
),
rel(origen, k, l) as (values   -- k: cuánto antes de now() empieza; l: fin − inicio + descanso
  ('15.H', interval '48 hours', interval '60 minutes'),
  ('16.C5P1', interval '240 hours', interval '60 minutes'), ('16.C5P2', interval '72 hours', interval '60 minutes'),
  ('16.C5P3', interval '24 hours', interval '60 minutes'),  ('16.C7PAS', interval '168 hours', interval '60 minutes'),
  ('16.C7N3', interval '5 minutes', interval '60 minutes'),
  ('20.C1', interval '41 days 3 hours', interval '60 minutes'), ('20.C2', interval '42 days 3 hours', interval '60 minutes'),
  ('20.C4', interval '45 days 3 hours', interval '60 minutes'), ('20.C5', interval '44 days 3 hours', interval '60 minutes'),
  ('22.c2', interval '2 hours 20 minutes', interval '30 minutes'), ('22.c25', interval '25 hours 20 minutes', interval '30 minutes'),
  ('22.c26', interval '26 hours 20 minutes', interval '30 minutes'),
  ('22.73', interval '73 hours 20 minutes', interval '30 minutes'), ('22.74', interval '74 hours 20 minutes', interval '30 minutes'),
  ('22.75', interval '75 hours 20 minutes', interval '30 minutes'), ('22.76', interval '76 hours 20 minutes', interval '30 minutes'),
  ('22.77', interval '77 hours 20 minutes', interval '30 minutes'), ('22.78', interval '78 hours 20 minutes', interval '30 minutes'),
  ('22.79', interval '79 hours 20 minutes', interval '30 minutes'), ('22.80', interval '80 hours 20 minutes', interval '30 minutes'),
  ('22.81', interval '81 hours 20 minutes', interval '30 minutes'), ('22.86', interval '86 hours 20 minutes', interval '30 minutes'),
  ('22.88', interval '88 hours 20 minutes', interval '30 minutes'), ('22.90', interval '90 hours 20 minutes', interval '30 minutes'),
  ('22.92', interval '92 hours 20 minutes', interval '30 minutes')
),
fija(cita, d, h) as (values    -- citas del 23 que se insertan (las negativas no dejan fila)
  ('c_z HOY', -2, time '10:00'), ('c_z NUEVA', -5, time '12:00'),
  ('c_pasada HOY', -10, time '05:00'), ('c_pasada NUEVA', -9, time '05:00'),
  ('C3b', 0, time '03:00'), ('c_pp', -8, time '05:00'), ('c_y4', -40, time '05:00'),
  ('Ra', -20, time '05:00'), ('Rb', -20, time '07:00'), ('Rc', -20, time '09:00'), ('Rd', -20, time '11:00'), ('Rf', -20, time '13:00'),
  ('c_re', 3, time '05:00'), ('c_eb', 3, time '13:00'), ('C1b', 4, time '05:00'), ('C2b', 4, time '07:00'),
  ('C4b', 5, time '05:00'), ('c_w', 7, time '05:00'), ('c_c6b', 8, time '03:00'), ('c_j', 11, time '05:00')
)
select f.cita, r.origen, count(*) as arranques,
       min((a.t at time zone 'Europe/Madrid')::time) as desde, max((a.t at time zone 'Europe/Madrid')::time) as hasta
from ahora a cross join fija f cross join rel r
where tstzrange(a.t - r.k, a.t - r.k + r.l, '[)')
   && tstzrange((((a.t at time zone 'UTC')::date + f.d) + f.h) at time zone 'Europe/Madrid',
                (((a.t at time zone 'UTC')::date + f.d) + f.h) at time zone 'Europe/Madrid' + interval '30 minutes', '[)')
group by 1, 2 order by 1, 2;
```

Salida medida el 07-10-2026 (solo hay estas cuatro filas; ninguna de `c_z NUEVA` ni de `c_pasada NUEVA`):

```
c_pasada HOY | 16.C5P1 | 2920 | 03:10:00 | 06:20:00
c_z HOY      | 15.H    | 2920 | 08:10:00 | 11:20:00
C3b          | 16.C7N3 | 3285 | 01:10:00 | 03:30:00
C3b          | 22.c2   | 1825 | 05:00:00 | 05:40:00
```
