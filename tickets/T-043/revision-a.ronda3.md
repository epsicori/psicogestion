**Revisor A, ronda 3 (SQL: migración, banco 29 y README del banco): 0 ALTA, 0 MEDIA, 1 BAJA.** No hay ALTA.

# T-043 · Revisión A, ronda 3

Diff de la ronda: `git diff 3d512cb 0c2c87e` (3d512cb es la «bitácora ronda 2» rebasada sobre `main`; f2670dc ya
no es antecesor de la rama). Diff del conjunto: `git diff main...T-043-aviso-de-hueco-raro`. Worktree
`agent-a831b63e745ab7cf6`, HEAD 0c2c87e, árbol limpio. La migración `20261012120000_hueco_raro.sql` no cambia en
la ronda (`git diff --stat 3d512cb 0c2c87e -- supabase` vacío). En mi territorio cambian
`scripts/rls/29-hueco-raro.sql` (K10-K12, `\gset`, franja a +154, cabecera, anotaciones) y
`scripts/rls/README.md` (fila 29 de la tabla de módulos y la línea de comprobación del año propio).
Las revisiones anteriores están en `revision-a.ronda1.*` y `revision-a.ronda2.*`.

## Cómo se midió

- Base `supabase_db_Psicogestion`, `max(version) = 20261012120000`. El contenedor se fijó por nombre, porque
  `supabase_db_cinfa-e2e` también está levantado. Todo en `begin … rollback`, con la migración de HEAD dentro de
  la transacción. No escribí en el worktree ni confirmé filas.
- **Mutantes** (`scratchpad/mut43r3.mjs`, el `mut43r2.mjs` de la ronda 2 apuntado al worktree nuevo y con la
  sección capturada por `/ASERCIÓN FALLIDA: ([^ ]+) ·/`): `begin; migración mutada; 00; 01; 29; rollback;`. Cada
  patrón se exige exactamente una vez.
- **Banco entero** (`scratchpad/banco-r3.mjs`): `begin; migración; 00 … 28; sonda; 29; sonda; rollback;`, en
  orden alfabético y sin tocar ningún módulo (T-049 ya está en la base de la rama, así que el 15 no necesita
  desplazarse). La primera ejecución murió con `deadlock detected` en otro módulo mientras corría el
  verificador; no cuenta. La segunda: **estado 0**, `29-hueco-raro: OK` con 16, 21, 23 y 26 dentro, y las cinco
  líneas K10-K12 en OK.
- `node scripts/rls/fechas-fijas.mjs` en el worktree: «29 fichero(s) … ninguno sin anotar», estado 0.

## Mutantes, medidos sobre HEAD

| Mutante | Cae en | | Mutante | Cae en |
|---|---|---|---|---|
| ORIG | `29-hueco-raro: OK`, estado 0 | | N4 | K4 |
| M1 | E2 | | N5 | K5 |
| M2 | C | | N6 | K6 |
| M3 | C | | N7 | K7 |
| M4 | I | | N8 `floor` / `round` / `trunc` / cast | K9 (los cuatro) |
| M5 | B1 | | N9 (sin `hueco_raro_minutos := null`) | B1 |
| M6 | H | | N10 | K8 |
| M7 | J | | **N11** (`in ('programada')`) | **K10** |
| M8 | B1 | | **N12** (`in ('ausencia')`) | **K11** |
| M9 | B1 | | **N13** (`d.hasta >= v_dia`) | **K12** |
| N1 | K3 | | X_centro_null | H |
| N2b | K2 | | X_aus_fin_tras | H |
| N3 | K1 | | | |

Cada mutante cae en la sección que le asigna el diseño (tabla R3.1.5). Ninguno cae en otra ni sobrevive.

## Hallazgos de la ronda 2

| Id | Estado | Cómo se cerró |
|---|---|---|
| H1 · filtro de estado probado con un solo valor | **Cerrado** | K10: cita de las 10:30 pasada a `confirmada` como `postgres`, con aserción de fijación sobre el estado leído (l. 473-477) y el array de G. N11 cae en K10. |
| H2 · festivo parcial y ausencia abierta | **Cerrado** | K11 (`festivo`, `centro_id null`, l. 491-494) y K12 (`ausencia`, `hasta null`, l. 509-512), los dos con el array de H. N12 cae en K11 y N13 en K12. El borrado de K12 (l. 523-531) filtra por perfil, motivo y `hasta is null`, y exige exactamente 1. |

## Diseño R3.5, «Banco», punto por punto

| Punto | Resultado |
|---|---|
| K10 con fijación | Sí. Si el `update` no tocara la fila, el `select` daría `null` y `pg_temp.assert` (`is distinct from true`) fallaría. |
| K11 `festivo` + `centro_id null`; K12 `hasta null`; esperado = array de H | Sí, los dos con `09:00:00/libre/-`. |
| Borrado de K12 | Perfil, motivo y `hasta is null`; `count(*) = 1`. El banco corre en una sola transacción con `rollback` (`scripts/test-rls.mjs:48-55`), así que un fallo antes del borrado tampoco deja la fila. |
| Sin literales ni `current_date` nuevos; ids | El 29 no tiene ningún literal `AAAA-MM-DD` ni `current_date`; el lint pasa. Los ids de cita son 1-26, sin repetir. |
| Cabecera contra la tabla del README | La cabecera dice «ninguno pasa de año + 8 y el 29 es el único en año + 10». Lo medí: antes del 29, la cita más tardía del banco está en Y+8 (19) y la `disponibilidad` más tardía en Y+4. El grep del año propio da +1, +7, +8, +3, +4 ×3, +6 y +10 (29:34), lo mismo que la línea de comprobación. **La fila 29 de la tabla de ventanas no cuadra**: ver H1. |
| Fila 29 de la tabla de módulos | Dice año + 10, A-J, K1-K12, M1-M9 y N1-N13 con su frase, y declara el superviviente. Cuadra con el fichero. |

## Hallazgos nuevos

### BAJA

**H1 · `scripts/rls/README.md:143` (ventana del 29 en la tabla de años: `.. +84`).** La fila la escribió T-049
con el 29 de la ronda 1. Esta rama llevó la franja a `lunes_29 + 154` (`29-hueco-raro.sql:62` y `:68`) y
siembra citas hasta `l154`, pero solo actualizó la línea de comprobación (`29:34 → +10`, l. 130); la celda sigue
en `+84`. El diseño R3.5 pide que «la cabecera y la fila del README cuadren con la tabla de años», y la cabecera
del 29 (l. 6-11) remite a esa tabla como la fuente: «un banco nuevo que siembre agenda de PRO1 en año + 10 tiene
que mirar esto».
- *Escenario*: quien añade agenda de PRO1/CA en Y+10 (una K13 del propio 29, o un módulo que llegue a Y+10
  desde otro ancla) mira la tabla, como pide la cabecera, y ve que la ventana del 29 acaba en `+84`, a finales de
  abril. Si pone una cita de lunes a las 10:30 entre mayo y julio de Y+10, cae en uno de los días de K1-K12
  (`l091` … `l154`). El array completo de esa sección deja de cuadrar y el 29 sale en rojo sin que la función
  haya cambiado. Si la cita va en un módulo anterior al 29, el fallo aparece en el 29 y no en el módulo que la
  sembró.
- *Arreglo*: `primer lunes de febrero de Y+10 .. +154`.

## Lo que no es hallazgo

- **Anotación de los mutantes** (`29-hueco-raro.sql:534`): dice «medidos a mano sobre la función en la base, uno
  por uno», y la fila del README dice «en `begin … rollback` con la migración dentro». Las dos frases describen
  la misma medición, aunque la primera también se puede leer como el `create or replace` sobre la base
  compartida que D-R3.7 descarta. Es cosmético, porque remite a la evidencia.
- **Superviviente `'realizada'`** (l. 558): declarado en el banco y en el README, como pide el diseño. Para que
  fuera visible haría falta una cita realizada *posterior* al tramo; con el banco anclado en el futuro, eso
  obliga a fijar un estado que la aplicación no produce.
- **«Ninguna `disponibilidad` sembrada antes del 29 queda abierta»** (cabecera, l. 8): la sonda antes del 29 da
  20 filas con `hasta` nulo, pero son las franjas de la siembra de la aplicación (`ana@` y `bruno@psicogestion.test`,
  presentes en la base compartida). No son del banco ni de PRO1 (`b0030001-…-0002`). Las filas del banco de PRO1
  llevan todas `hasta`, y tras el 29 el recuento sigue en 20: la de K12 se borró.
- **Variables `lNNN` sin sufijo de módulo** (README, regla 10.2): ya existían en la ronda 2. El 21 usa `l007`,
  pero corre antes del 29, así que la redefinición no le afecta.
- **Cambio de hora**: para Y+10, `l140`-`l154` caen entre finales de junio y principios de julio, en horario de
  verano y lejos de los dos cambios. Las citas se escriben en hora local.

Ejecutores en el scratchpad de esta sesión: `mut43r3.mjs` y `banco-r3.mjs`.
