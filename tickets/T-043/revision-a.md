**Revisor A (SQL, permisos y datos): 0 ALTA, 3 MEDIA, 2 BAJA.** No hay ALTA.

# T-043 · Revisión A, ronda 1

Diff: `git diff main...worktree-agent-a84f11f89963e2cc9` (HEAD c8759df). Alcance: la migración
`20261012120000_hueco_raro.sql`, `scripts/rls/29-hueco-raro.sql`, la enmienda de `21-alta-de-cita.sql`,
`lib/citas/alta.ts` y `lib/supabase/tipos-bd.ts`.

## Cómo se midió

- Base compartida `supabase_db_Psicogestion`, con `max(version) = 20261012120000`. El contenedor se
  fijó por nombre porque hay dos stacks levantados (`cinfa-e2e`).
- Cada ejecución fue `begin; <migración de HEAD entera>; 00; 01; 29; [sondas]; rollback;`, por
  `docker exec -i … psql -v ON_ERROR_STOP=1 -f -`, el mismo mecanismo que `scripts/test-rls.mjs`.
  La migración va dentro de la transacción para que un `db reset` ajeno no cambie lo que se mide.
  Los mutantes se aplican por sustitución de texto sobre esa copia, con una comprobación de que el
  patrón aparece una sola vez. No se hizo ningún `db reset` ni se escribió en el worktree.
- El runner real (`node scripts/test-rls.mjs` desde el worktree) cae en `15-agenda`, por las fechas
  fijas ya anotadas en `state.md`. No se cuenta aquí. Con 00-28 sin 15 ni 18, `21-alta-de-cita` corre
  completo con la enmienda; la ejecución cae después, en 26.M, porque usa `C18TEC` de 18, y eso es un
  efecto de mi recorte. 29 sobre 00+01 da OK.

## Diseño §5, punto por punto

| Punto | Resultado |
|---|---|
| `diff` de cuerpos 20261005120000:850-1009 contra 20261012120000 | Solo aparecen la sexta columna, `v_tras` y `v_sig`, el bloque §1.1 dentro de `if v_cursor > v_ahora` y la frase del comentario. Ninguna otra línea cambia. Ninguna migración intermedia redefine la función (`grep -l`): la copia parte de la última versión. |
| Puerta de permisos antes que los parámetros, `security definer`, `search_path=''`, grants | Iguales. `proacl = {postgres=X/postgres,authenticated=X/postgres}`, sin `public` ni `anon`. 29.A lo fija. |
| Entradas | Las mismas cinco. La salida es un `integer` que no identifica la cita. |
| `null` en ocupado (M9), `?? null` y la guarda de entero en TS | Bien. `alta.test.ts` cubre `null`, 0, 12.5, un ocupado con número y una fila sin la columna. |
| Cita con inicio exactamente en `F_fin` | **No probado**: I la pone a las 14:10 (H3). |
| Bordes `g = d`, `g = d+1`, `g = 69`, `g = 70` | Las cuatro pruebas existen y matan M1, M2 y M3. |
| Descanso en los dos sitios | F y C matan M3. Quitarlo solo del umbral superior lo mata E1. |
| Mínimo con dos candidatas | B1 mata M5. |
| Tipos | `supabase gen types typescript --local` contra la base con la migración da un fichero idéntico a `tipos-bd.ts`. |
| Territorio en 21 | Solo cambian las l. 149-152. |
| CA6 (`grep`) | `acciones.ts` y `lib/citas/` solo tienen el mapeo de `leerBloques`. |
| `lint:migraciones` | 33 migraciones limpias. |

Mutantes del diseño, medidos: **M1 a M9 mueren**, cada uno en la aserción que nombra el diseño (M1 en
E2, M2 y M3 en C, M4 en I, M5, M8 y M9 en B1, M6 en H y M7 en J). También muere quitar el
`hueco_raro_minutos := null` (en B1).

Mutantes nuevos que **sobreviven** a 29 y que mis sondas matan (función de HEAD → mutante):

| Mutante | Sonda (martes de la misma franja, PRO1 en CA salvo indicación) | HEAD | Mutante |
|---|---|---|---|
| N1 `c.inicio >= v_tras` → `>` | X1: citas 10:00-10:20 y 10:30-11:20 | `09:00/libre/-` | `09:00/libre/40` |
| N2b `c.inicio >= v_tras` → `>= v_f_ini` | X2: citas 09:00-09:50 y 11:30-12:20 | `10:00/libre/40` | `10:00/libre/-` |
| N3 sin `c.profesional_id = p_profesional_id` | X4: solo una cita de **PRO2** en CB, 10:30-11:20 | `09:00/libre/-` | `09:00/libre/40` |
| N4 `c.inicio < v_f_fin` → `<=` | X3: cita 09:00-09:20 en CA y otra de PRO1 en CB a las **14:00** | `12:30/libre/-` | `12:30/libre/40` |
| N5 ausencia sin `desde/hasta` | X5: cita 10:30 otro día que la ausencia de H | `09:00/libre/40` | `09:00/libre/-` (también X7) |
| N6 ausencia sin el filtro de centro | X5: ausencia de PRO1 **en CB** 10:00-10:20 | `09:00/libre/40` | `09:00/libre/-` |
| N7 ausencia sin `d.perfil_id` | X5: ausencia de **PRO2** 10:00-10:20 | `09:00/libre/40` | `09:00/libre/-` |
| N10 ausencia desde `v_tras` y no desde `c+D` | X6: ausencia 09:52-09:58 (en el descanso) y cita 10:30 | `09:00/libre/-` | `09:00/libre/40` |
| N8 `ceil` → `floor` | X7: cita a las 10:30:30 | `09:00/libre/41` | `09:00/libre/40` |

## Hallazgos

### MEDIA

**H1 · `supabase/migrations/20261012120000_hueco_raro.sql:152` (banco `29-hueco-raro.sql`, sin
distractor).** Quitar el filtro `c.profesional_id = p_profesional_id` de la consulta nueva deja 29 en
verde, porque ningún día del banco tiene una cita de otro profesional dentro de la franja.
- *Escenario*: un refactor quita o tuerce ese predicado (por ejemplo, copia `= auth.uid()` o
  elimina la línea). `test:rls` sigue verde. En producción, TEC1 pide la agenda de PRO1 en CA y recibe
  `09:00/libre/40`, calculado con la cita de PRO2 en CB a las 10:30 (medido en X4 con N3).
- *Efecto*: un aviso falso, y la hora de inicio de las citas de **otro** profesional llega a quien
  solo puede ver la de PRO1. Es la única condición de la consulta nueva que separa los datos de un
  profesional de los de otro, y la función es `security definer`.
- *Arreglo*: en un día con el resultado esperado `null`, sembrar una cita de PRO2 (con P2) dentro de
  la ventana del tramo.

**H2 · `supabase/migrations/20261012120000_hueco_raro.sql:154` (banco 29, la cota inferior de la
búsqueda de S).** Ni `>= v_tras` → `> v_tras` (N1) ni `>= v_tras` → `>= v_f_ini` (N2b) hacen caer
29. El único caso con `S = T` es C, que tiene una sola cita, y ningún día tiene una cita **antes** del
tramo libre que se mide.
- *Escenario N2b*: es el caso más común de la agenda, una cita a primera hora. Con citas
  09:00-09:50 y 11:30-12:20, el tramo de las 10:00 debe dar 40 (X2). Con el mutante, `min` toma la de
  las 09:00, `v_sig > v_tras` es falso y da `null`: el aviso desaparece en cualquier día con una cita
  anterior en la franja, y el banco sigue verde.
- *Escenario N1*: con citas de duración distinta, 10:00-10:20 adyacente y 10:30-11:20, el 09:00 debe
  dar `null` porque el hueco real es el descanso. El mutante salta la adyacente y avisa de «40
  minutos» (X1).
- *Arreglo*: añadir a 29 un día con una cita antes del tramo raro y otro con una cita adyacente más
  una segunda dentro del umbral.

**H3 · `supabase/migrations/20261012120000_hueco_raro.sql:155` y `scripts/rls/29-hueco-raro.sql:282`
(la cota superior en `F_fin` exacto).** El diseño §5 dice: «Una cita con `inicio` exactamente en
`F_fin` no cuenta, porque `<` es estricto (I/M4)». Pero I pone la cita a las 14:10, así que `<` → `<=`
(N4) sobrevive. Con D = 50 y la franja en punto, el último tramo acaba en `T = 14:00`, y una cita a
las 14:00 da `g = d` también con `<=`: la prueba no puede ver el borde.
- *Escenario*: con una cita corta 09:00-09:20, los tramos se desplazan a :30. La última es 12:30, con
  `T = 13:30`. Una cita de PRO1 en CB a las 14:00 debe dar `null` (P3) y con el mutante da
  `12:30/libre/40` (X3). El aviso saltaría en el último hueco de la mañana por una cita que está fuera
  de la franja.
- *Arreglo*: llevar I, o una I2, a una cita en `F_fin` exacto con el último tramo desplazado.

### BAJA

**H4 · `supabase/migrations/20261012120000_hueco_raro.sql:159-171` (el `not exists` de la ausencia,
con una sola fijación).** H usa una única ausencia, de PRO1, sin centro, en el mismo día y en medio
del hueco. Así, cuatro de sus predicados se pueden quitar o cambiar sin que 29 caiga: la fecha (N5),
el centro (N6), el perfil (N7) y el inicio del rango en `c+D` (N10).
- *Escenario N5*: sin `desde/hasta`, `v_dia + d.hora_inicio` aplica la ausencia de las 10:00-10:20
  del día de H a **todos** los días. Todo hueco raro que cruce las 10:00 pasa a `null` (X5 y X7: 40 →
  `-`).
- *Escenario N7*: la ausencia de PRO2 apaga el aviso de PRO1, y el `null` frente a 40 delata a quien
  ve la agenda de PRO1 que PRO2 está ausente.
- Hoy es una copia literal de `v_limite2`, así que el riesgo es una deriva futura. Las sondas X5 y X6
  lo cubren con tres ausencias que no deben contar (otro centro, otro profesional, otro día) y una en
  el descanso que sí cuenta.

**H5 · `supabase/migrations/20261012120000_hueco_raro.sql:173` (`ceil` sin prueba).** El diseño
(§1.1, notas) elige `ceil` para que «una cita con segundos no convierta un hueco de 30 s en "0
minutos"», y `citas` no tiene ningún check que impida segundos. `floor` (N8) sobrevive.
- *Escenario*: con una cita a las 10:30:30, el aviso dice 40 en vez de 41 (X7).
- *Escenario con `d = 0`*: un hueco de 30 s da `0`, `leerBloques` lo descarta (`minutos > 0`) y no
  hay aviso para un hueco que el SQL ha declarado raro.
- *Arreglo*: una aserción con una cita con segundos.

## Lo que no es hallazgo

- **Exposición al técnico (P4)**: decidida por el propietario. Con la gemela de 29.G medida, el
  técnico no obtiene nada que no pudiera sondear ya con duración 5.
- **Fechas fijas de 15 y 18**: ya anotadas en `state.md`.
- **Sello y cola**: `20261012120000` es mayor que `20261011140000` (T-021, ya en `main`), y R2 quedó
  resuelto por el orden que decidió el propietario.

Las sondas X1-X7 y el guion de mutantes están en el scratchpad de esta sesión
(`mutantes43.mjs`, `29X.sql`). Las fijaciones de cada sonda están descritas en la tabla de arriba,
para que el implementador las convierta en aserciones de 29.
