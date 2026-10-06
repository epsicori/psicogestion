**Sin hallazgos ALTA.** 0 ALTA, 0 MEDIA, 3 BAJA.

# T-021 · Revisión B · ronda 4

- **Diff revisado:** `git diff 58cd9a1 worktree-agent-a8507d244f215480d` (HEAD 379a233). Las cinco confirmaciones propias de la ronda van de 9630f92 a 379a233. Los ficheros de T-046, T-047 y T-048 que salen en el diff llegan con el merge de `main` (680086c): no son de esta ronda.
- **Foco:** que las pruebas tengan dientes.

## Método (medido, no leído)

- **Arnés.** Un guion en el scratchpad monta `begin; <migración 20261011140000 de HEAD>; 00; 01; <mutante>; 26; rollback;` y lo manda a `supabase_db_Psicogestion`.
  - Los ficheros 00, 01 y 26 son los del worktree.
  - En 00, `raise exception 'ASERCIÓN FALLIDA…'` y `'FALLO:…'` pasan a `raise warning`, para ver todas las aserciones que caen.
  - Cada mutante es un `replace` de texto sobre la migración de HEAD y corre dentro de la transacción. Nada persiste.
- **Línea base, sin mutante:**
  - 0 avisos de fallo y exit 0;
  - 34 avisos `OK` de J28h y 67 de J28i;
  - J49g sellada: una versión de BORR3 con 82,65 / 17,34 / 99,99 y tres líneas;
  - J49ug sellada: 82,64 / 17,35 / 99,99 con una línea;
  - 67 versiones de J28i en BORR3, cada una con un concepto de un solo carácter (de U+21 a U+E1000).
- **Generador.** El de R4.2 (Node 24.14.1, Unicode 17.0) da 34 tramos y 67 vecinos. Diff vacío contra la migración, contra el bloque `tramos:` del banco y contra el bloque `vecinos:`.
- **Caracteres sospechosos.**
  - `grep -cF '\'` sobre la migración da 0.
  - En las líneas añadidas al banco, las únicas barras invertidas son las de los dos `\gexec`.
  - El `grep -cP` de R4.5-6 da 0 en los dos ficheros.

### M48-M58: todos mueren donde dice `mutantes.json`

| Mutante | Muere en (medido) | ¿Coincide con `mutantes.json`? |
|---|---|---|
| M48 `+ cantidad` | J49, J49u, J50, J50a, J50b, J50c, J50d, J50e, J50g | sí |
| M49 `> 1` | J49g | sí |
| M50 `+ 1` | J49 | sí |
| M51 `least(0.5, …)` | J47c | sí |
| M52 sin tope | J45, J47, J47b, J49, J49u, J50b | sí |
| M53 `least(1, v_q)` | J45g, J52g | sí |
| M54 tope sin cantidad | J53g | sí |
| M55 `v_holgura > 0` | J50f | sí |
| M56·01-34 | cada uno, en la J28h de su tramo | sí. M56·17 también en J28c y en el tramo 205F-206F (prefijo U+200B). M56·19 en J28d y en 34 J28h (prefijo U+2060). M56·22/23 en J28e. M56·26 en J28d |
| M57a / b / c | J28i U+21 / U+3001 / U+FFFC | sí |
| M58 `>=` | J50fg | sí |

### Mutantes nuevos

| Mutante | Resultado |
|---|---|
| `least(2, abs(v_q))` | muerto: J47, J47b, J49, J49u |
| sin el `abs` exterior: `(cuota·100 − Q) > T` | muerto: J47b, J49u |
| sin el `abs` exterior, al revés: `(Q − cuota·100) > T` | muerto: J43, J44, J45, J47, J48, J49, J50* (14) |
| Q sobre la base (`tipo/10000`) | muerto: B2… y J42 se corta |
| Q por unidad (sin la cantidad) | muerto: J47d, J49ug, J53g |
| `least(1, abs(v_q)) · cantidad` | muerto: J49u, J50a, J50b |
| `v_tipo >= 10000` | muerto: J46g |
| quitar la clase entera | muerto: 37 aserciones |
| quitar cualquiera de los 34 tramos | muerto (M56) |
| **`least(0.55 / 0.6 / 1.3 / 1.36, abs(v_q))`** | **sobrevive** (H1) |
| **`case when v_q <> 0 then 1 else 0 end`**, y su variante por precio ≠ 0 | **sobrevive** (H2) |
| **`v_tipo > 10001`** | **sobrevive** (H3) |
| la banda corre siempre (`if true and …`) | sobrevive: equivalente declarado (R4.7) |
| T acotada por \|Q\| total (`least(T, abs(Q))`) | sobrevive: equivalente para los documentos legítimos, solo más estricto |
| «la banda solo al IVA y no a la base» | equivalente: la base no es libre. `importes_ck` fija base + cuota = total, y el 6.4 fija total = Σ líneas. Una banda sobre la base repetiría la de la cuota |

### El `\gexec` (una sentencia por fila)

**La desviación del diseño está justificada.** `pg_temp.sv` es `stable`: en un solo `select … from generate_series`, todas las filas leerían `max(numero_version)+1` con la misma instantánea. En J28i, que sí sella, la segunda fila caería por otra comprobación.

No encuentro ninguna fila que pase en verde por un motivo equivocado:
- **J28h.** Exige 23514 y el fragmento `Un concepto invisible`, único de la cota. El prefijo (U+2060, o U+200B en 205F-206F) no es `[:space:]`, así que el 6.3 no lo intercepta. Cada M56·k muere exactamente en su fila: la fila depende de su tramo y no solo del prefijo.
- **J28i.** Cada vecino sella de verdad: 67 versiones en BORR3, de U+21 a U+E1000. M57a-c muestran que un vecino dentro de la clase la pone en rojo.
- **Filas omitidas.** `\gexec` ignora los campos nulos, pero `format()` no devuelve nulo con argumentos nulos. Un argumento nulo daría `chr()` vacío, que es un error de sintaxis, y con `ON_ERROR_STOP` el banco se pone en rojo.

**Observación sin escenario, no es hallazgo.** El banco no cuenta las sentencias que genera. Un `tramos.m` vacío daría cero filas y verde mudo, pero ese caso lo caza el diff contra el generador de R4.4.

## Hallazgos

### H1 · BAJA · el «1» del tope de la tolerancia no está fijado: cualquier constante entre 0,55 y 1,36 deja el banco verde
- **Dónde:** `supabase/migrations/20261011140000_economico_ronda_4.sql:95` (`least(1, abs(v_q))`), con las pruebas en `scripts/rls/26-economico.sql:1268-1353`.
- **Por qué sobrevive.** El banco solo tiene puntos lejos del borde de una línea:
  - la positiva más alta con T = 1 es J47c, con una diferencia de 0,54;
  - la negativa más baja con T = 1 es J49u, con 1,364.
  - Medido: `least(0.55, …)`, `least(0.6, …)`, `least(1.3, …)` y `least(1.36, …)` dejan 00 + 01 + 26 con 0 fallos.
- **Por qué importa.** D2 elige 1, y no 0,5, precisamente para que «la tolerancia no dependa de que T-026 redondee al más cercano o trunque». Eso solo se nota entre 0,5 y 1, y ahí no hay ninguna positiva. Es el mismo hueco que B-H2 de la ronda 3 (MB1), un escalón más fino.
- **Escenario A (medido con una sonda en la misma transacción).** Mutante `least(0.6, abs(v_q))`; borrador de 1 × 50,00 € general al 21 %, con la cuota truncada a 8,67 (Q = 867,77; diferencia 0,77).
  - Con HEAD se sella.
  - Con el mutante da 23514 «fuera de la banda», y el banco sigue verde.
- **Escenario B.** Mutante `least(1.3, …)`; el mismo documento con cuota 8,69 (diferencia 1,23).
  - Con HEAD da 23514.
  - Con el mutante se sella, y el banco sigue verde.
- **Qué falta:** una positiva de una línea con una diferencia entre 0,55 y 1 (la sonda A sirve) y una negativa con una diferencia entre 1 y 1,36 (la sonda B). Mueren las dos mitades.

### H2 · BAJA · la rama inferior de `least(1, |Q_i|)` no la recorre ninguna prueba; la que cita el diseño cae en la rama superior
- **Dónde:** `supabase/migrations/20261011140000_economico_ronda_4.sql:95`; la prueba citada está en `scripts/rls/26-economico.sql:1350-1353` (J53g).
- **Qué dice el diseño.** D2: «El tope `least(1, |Q_i|)`, y no 1 a secas. Una línea cuya cuota exacta es menor que un céntimo no puede desviar más que eso (J53g)».
- **Qué prueba J53g.** Su |Q_i| es 3,471 céntimos, así que su T vale 1 por la rama superior. Solo mata M54 (la cantidad fuera del tope).
- **Lo que no se recorre.** Ninguna prueba tiene una línea general con 0 < |Q_i| < 1. Las de 0 € dan 0 en cualquier variante, y las parejas ±1 céntimo de J50a y J50b llevan miles de unidades (|Q_i| ≥ 867).
- **Medido.** `case when v_q <> 0 then 1 else 0 end`, y su variante por precio ≠ 0, dejan el banco verde.
- **Escenario (medido con una sonda).** Mutante «1 por línea con cuota no nula». Borrador con 1 × 100,00 € más 1 × 0,01 € («Fotocopia»), las dos generales al 21 %, con cuota 17,37 y total 100,01: Q = 1735,71 y diferencia 1,29.
  - Con HEAD, T = 1,17 y da 23514.
  - Con el mutante, T = 2 y se sella.
  - Con el mutante, el residuo de D5 («una línea así cuesta unos 6 céntimos de precio») baja a 1 céntimo por línea, y nada lo ve.
- **Qué falta:** esa negativa, o cualquier otra con una línea de |Q_i| < 1 cuya holgura decida el resultado.

### H3 · BAJA · el techo del tipo de IVA se prueba lejos del borde: `> 10001` sobrevive y un tipo de 10001 centésimas se sella
- **Dónde:** `supabase/migrations/20261011140000_economico_ronda_4.sql:87` (redefinida en esta ronda, heredada de la 3); la prueba es `scripts/rls/26-economico.sql:1236` (J46).
- **Por qué sobrevive.**
  - La negativa J46 usa un tipo de 999900 centésimas (9999 %).
  - La positiva J46g usa 10000, así que mata `>=` (M41).
  - Nada mata un techo corrido hacia arriba: `> 10001`, ni tampoco `> 999899`.
- **Escenario (medido con una sonda).** Mutante `v_tipo > 10001`. Borrador de 1 × 100,00 € general con tipo 10001, base 50,00 y cuota 50,00 (Q = 5000,25; diferencia 0,25).
  - Con HEAD da 23514 «como mucho 10000».
  - Con el mutante se sella, y el banco sigue verde.
- **Qué falta:** J46 con 10001 (o una J46b), para que la negativa quede pegada al borde.

## Lo que comprobé y está bien

- La migración solo trae `create or replace function`, `revoke` y `comment`. En la base: `security invoker`, `search_path=""`, y sin `execute` para `authenticated` ni `anon`.
- Los fragmentos `fuera de la banda` y `Un concepto invisible` solo salen de esta función. La 20261011120000 tiene 0 de cada uno.
- La lista de tramos y la de vecinos son idénticas al generador. Los 34 tramos están todos cubiertos: no hay ningún tramo cuyo M56 sobreviva.
- J49g (S2: tres × 33,33 €, 82,65 / 17,34 / 99,99) y J49ug (82,64 / 17,35 / 99,99) se sellan: comprobado por fila insertada, no solo por el aviso.
- Constitución: ningún `UPDATE` ni `DELETE`; la función no lee ninguna tabla.
- Memoria: `state.md` tiene 78 líneas, y el hallazgo de `15-agenda.sql:494` está anotado y no arreglado.
