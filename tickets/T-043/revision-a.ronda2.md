**Revisor A, ronda 2 (SQL: migración y banco 29): 0 ALTA, 0 MEDIA, 2 BAJA.** No hay ALTA.

# T-043 · Revisión A, ronda 2

Diff de la ronda: `git diff c8759df f2670dc`. Diff del conjunto: `git diff main...f2670dc`. Worktree
`agent-aa8091620e0e92d48`, HEAD f2670dc. La migración `20261012120000_hueco_raro.sql` no cambia en la ronda
(`git diff --quiet c8759df f2670dc -- supabase/migrations`). En SQL solo cambia `scripts/rls/29-hueco-raro.sql`.
La revisión de la ronda 1 está archivada en `revision-a.ronda1.md` y `revision-a.ronda1.json`.

## Cómo se midió

- Base `supabase_db_Psicogestion`, con `max(version) = 20261012120000`. El contenedor se fijó por nombre
  porque también está levantado `supabase_db_cinfa-e2e`. Cada ejecución fue `begin; <migración de HEAD,
  mutada o no>; 00; 01; 29; [sondas]; rollback;` por `docker exec -i … psql -v ON_ERROR_STOP=1 -f -`.
  Cada mutante es una sustitución de texto sobre la copia, con una comprobación de que el patrón aparece
  una sola vez. Al terminar, `max(version)` sigue igual y no queda ninguna cita `a2900004…`. No escribí
  nada en el worktree.
- **Convivencia con 00-28**: `begin; migración; 00 … 14, 15*, 16 … 28, 29; rollback;` en orden alfabético.
  `15*` es el 15 con sus literales desplazados nueve semanas (`2026-10-06/07/08` → `2026-12-08/09/10`,
  el mismo día de la semana). Resultado: **`29-hueco-raro: OK`** tras los 28 módulos anteriores, con 16,
  21, 23 y 26 dentro, que son los que siembran agenda de PRO1.
- El orden del diseño R2.3.2 (15 al final y sin tocar) **no llega al 29**. Cae en
  `18-agenda-rango`, «R1 GEMELA: el administrador sí ve citas del centro B en el rango», porque 18 usa
  citas que siembra 15. El diseño ya prevé este caso como plan B, y es lo que medí arriba. No es un
  hallazgo del código, pero el verificador debe saber que el plan A no le servirá.

## Diseño R2.5, punto por punto (parte SQL)

| Punto | Resultado |
|---|---|
| Ancla | `anio_29 = año + 10` (l. 35). La franja llega a `lunes_29 + 140` (l. 66). El `\gset` define `l077`, `l084`, `l091`, `l098`, `l105`, `l106`, `l112`, `l119`, `l126` y `l133`. La cabecera (l. 6-12) ya no dice «21 usa año + 3», remite a R2.0 y la l. 6 termina en «P1, P2)». |
| Alcance de 00-28 | Repetí los greps de R2.0 y añadí `interval 'N years/months'`, `make_date` y `date_trunc('year')`. Las únicas anclas de año son 16 (+1), 21 (+3), 23 (+4) y 29 (+10). El mayor desplazamiento es `current_date + 1502` (26). El literal más alto es `'2033-06-30'` (26, bonos). Las filas de `disponibilidad` de 16, 21 y 23 llevan `hasta`. La ejecución alfabética completa da OK en 29. |
| Arrays completos | Las nueve K comparan con `pg_temp.dia29(...) = array[...]`, sin `like` ni `@>`. `pg_temp.assert` usa `is distinct from true`, así que un `null` (día sin filas) también falla. |
| K1 | Se llama como **TEC1**. La única cita es de PRO2 con P2 en CB (l. 325). |
| K4 | La cita de las 14:00 es de PRO1 **en CB** (l. 370). |
| K5 | La ausencia está en `l106`, el martes. |
| K8 | La ausencia es 09:52-09:58 y el 09:00 sale `libre`, así que no toca `[09:00, 09:50)`. |
| K9 | La cita es `10:30:20`, y el array trae `11:30:20` y `12:30:20`. |
| Ids | `cita29(12…23)`, consecutivos y sin repetir los de B-J (1-11). |
| Anotación final | M1-M9 y N1-N10, con la sección de caída correcta. |

## Mutantes, medidos (aislados, `00 + 01 + 29`)

| Mutante | Cae en | | Mutante | Cae en |
|---|---|---|---|---|
| M1 | E2 | | N1 | K3 |
| M2 | C | | N2b | K2 |
| M3 | C | | N3 | K1 |
| M4 | I | | N4 | K4 |
| M5 | B1 | | N5 | K5 |
| M6 (`where false and d.perfil_id…`) | H | | N6 | K6 |
| M7 | J | | N7 | K7 |
| M8 | B1 | | N8 `floor` | K9 |
| M9 | B1 | | N8 `round` | K9 |
| quitar `hueco_raro_minutos := null` | B1 | | N8 `trunc` | K9 |
| | | | N8 sin `ceil` (cast `::integer`) | K9 |
| | | | N10 | K8 |

M1-M9 siguen cayendo en la sección de la ronda 1, y cada N cae en la primera K que lo nombra, con el
mensaje del `assert` de esa K.

## Hallazgos de la ronda 1

| Id | Estado | Cómo se cerró |
|---|---|---|
| H1 · sin distractor de otro profesional | **Cerrado** | K1 (como TEC1, con una cita de PRO2 en CB). N3 cae en K1. |
| H2 · cota inferior de S | **Cerrado** | K2 mata N2b y K3 mata N1. |
| H3 · cita en `F_fin` exacto | **Cerrado** | K4, con el último tramo desplazado a 12:30. N4 cae en K4, e I sigue matando M4. |
| H4 · `not exists` de la ausencia (fecha, centro, perfil, inicio del rango) | **Cerrado** para los cuatro predicados nombrados | K5-K8. Ver H2 de esta ronda para los que no nombré. |
| H5 · `ceil` | **Cerrado** | K9. También caen `round`, `trunc` y el cast sin `ceil`. |

## Hallazgos nuevos

Los dos son de la misma familia que H4 de la ronda 1, y los dos estaban ya en c8759df. Son huecos de mi
revisión de la ronda 1, que solo enumeró cuatro predicados, no de esta ronda. Los dos son BAJA por la misma
razón que H4: HEAD es correcto, y la lista copiada es literalmente la de `v_limite` (l. 117) y la de
`v_limite2` (l. 126-130), así que el riesgo es que una de las copias derive en un refactor futuro.

### BAJA

**H1 · `supabase/migrations/20261012120000_hueco_raro.sql:153` (`c.estado in ('programada', 'confirmada',
'realizada')`, probado con un solo valor).** Todas las citas de 29 nacen `programada`, y la única que
cambia de estado pasa a `cancelada` (J). Por eso `in ('programada', 'confirmada', 'realizada')` →
`in ('programada')` deja 29 en verde (medido: `29-hueco-raro: OK`).
- *Escenario (sonda Y1)*: una cita de PRO1 a las 10:30 que el paciente ha **confirmado**
  (`programada → confirmada`, la transición normal de `lib/agenda/estados-cita.ts:43`). HEAD da
  `09:00:00/libre/40`. El mutante da `09:00:00/libre/-`, así que el aviso desaparece en cuanto la cita
  siguiente se confirma, y `test:rls` sigue verde.
- *Arreglo*: una K10 igual que G o K5, con la cita de las 10:30 pasada a `confirmada`, que espere 40.

**H2 · `supabase/migrations/20261012120000_hueco_raro.sql:162` y `:166` (el `not exists` de la ausencia:
festivo parcial y ausencia abierta).** H y K5-K8 solo siembran filas `tipo = 'ausencia'` con `hasta`. Por eso
sobreviven `d.tipo in ('festivo', 'ausencia')` → `in ('ausencia')` y `(d.hasta is null or d.hasta >= v_dia)`
→ `d.hasta >= v_dia`. Los dos dan `29-hueco-raro: OK`. El esquema admite las dos filas
(`disponibilidad_forma_ck` solo exige `desde`), y el comentario de la l. 113 nombra los «festivos
parciales».
- *Escenario Y2*: un festivo parcial de PRO1 de 10:00 a 10:20 (`centro_id null`) y una cita a las 10:30.
  HEAD da `09:00:00/libre/-`, porque el hueco lo corta el festivo, como en H. Sin `'festivo'`, da
  `09:00:00/libre/40`: el aviso dice «40 minutos» por un hueco que no existe. La gemela sin festivo
  (Y4) da 40 en HEAD.
- *Escenario Y3*: una ausencia de PRO1 de 10:00 a 10:20 con `desde` = el día y `hasta null` (recurrente
  sin fin), y una cita a las 10:30. HEAD da `-` y el mutante, 40.
- *Arreglo*: dos K más, como H: una con `tipo = 'festivo'` y otra con `hasta = null`. Si van al final y la
  abierta no cruza ningún lunes posterior del banco, no mueven nada.

## Lo que no es hallazgo

- **Fixtures del banco en la base** (bitácora, l. 47): según la bitácora, la base del implementador tenía
  los fixtures de 01 confirmados y por eso ejecutó «00 + `\set` de 01 + 29». Hoy la base no tiene usuarios
  `%rls.test`, y 01 corre entero dentro del rollback. Mi tabla de mutantes está medida con 01 completo y
  coincide con la de la bitácora en todos los N. Que el verificador no copie ese método.
- **Encabezado de K2**: dice «sin `c.inicio >= v_f_ini`», cuando N2b *sustituye* la cota por
  `>= v_f_ini`. La anotación final lo dice bien. Es cosmético y no tiene escenario de fallo.
- **Cambio de hora en año + 10**: la cita y la franja están en hora local de `Europe/Madrid`. En 2036 el
  cambio cae el 30 de marzo, entre `l049` y `l056`, y G y H dan sus arrays.

Sondas y guion en el scratchpad de esta sesión: `mut43r2.mjs` (mutantes M, N y X), `29Y.sql` (Y1-Y4) y
`15-desplazado.sql`.
