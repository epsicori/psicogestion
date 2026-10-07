**Sin hallazgos ALTA.** T-050, ronda 1: 0 ALTA, 0 MEDIA y 3 BAJA.

Diff revisado: `git diff main...worktree-agent-a49560e9e3018f241` (HEAD b4cc1f6, base 54c7ad2 = `main`).
Toca cuatro ficheros: `scripts/rls/23-cita-en-episodio.sql` (+8/−5), `tickets/T-050/simulacion.sql` (nuevo),
`docs/bitacora/T-050.md` (nuevo) y `docs/state.md` (+3). Los cuatro están dentro del `territorio:`.

## §5 «Qué revisar», punto por punto

| Punto | Resultado |
|---|---|
| Solo dos pares `(día, hora)` y un día de cierre; cada par cambiado en la inserción **y** en el `\gset` | Se cumple. En l.977-978 cambia `-10` por `-9` en las dos llamadas. En l.1170-1171 cambia `-2, 10:00` por `-5, 12:00` en las dos. En l.1172, `cerrado_en` pasa de `current_date - 5` a `current_date - 6`. No cambia nada más. |
| Ningún mensaje ni código esperado cambia | Se cumple. Las dos `assert_no_lanza` conservan su texto entre comillas. No se toca ningún `assert_lanza_codigo*`. |
| La cita de Z sigue siendo posterior al cierre de ET39 (cable trampa de T-034 SQL-H2) | Se cumple. La cita es `(current_date − 5) 12:00 Madrid` y el cierre, `current_date − 6`. Las dos se calculan desde el mismo `current_date`, así que la cita queda siempre un día después, también cuando el banco arranca entre las 00:00 y las 02:00 de Madrid, con la fecha UTC aún en el día anterior. Z1-Z3 no leen el día. |
| Ninguna línea nueva antes de la 198 (`23:194/198` del README) | Se cumple. Las líneas 1-972 son idénticas a las de `main` (comparado con `diff`). Los tramos `@@` empiezan en 976 y en 1167 del original (1168 del nuevo). |
| Sin fechas fijas | Se cumple. Los comentarios nuevos no llevan `AAAA-MM-DD`. Los literales `2026-10-07` de `simulacion.sql` están en `tickets/`, fuera de lo que mira el lint. |
| La simulación prueba lo que dice | Sí, en lo que afirma: la he lanzado desde la rama y salen exactamente las cuatro filas de la bitácora (`c_pasada HOY`, `c_z HOY` y las dos de C3b), ninguna `NUEVA`. Discrimina, porque las filas HOY salen. Con una variante propia (arranques cada 5 min, `current_date` en UTC y también en Madrid) mido el margen mínimo: 970 min para `c_z` y 125 min para `c_pasada`, sin ningún choque. Su inventario es manual (H3). |
| `docs/state.md` correcto y ≤ 80 líneas | Tiene 62 líneas. Dos de las tres entradas nuevas fallan: H1 y H2. |

Fuera de la lista, también comprobado:
- Ningún otro banco pone una cita de PRO1 a hora fija en D−5, D−6 o D−9. Solo aparece `28:325`, un vínculo de PRO2.
- El descanso de PRO1 sigue en 10 min de 15:227 a 21:35. El 23 no lo cambia.
- Los bancos 24-29 no cuentan citas de PRO1 por ventanas de fecha, y la rama de T-023 no toca el 23.

## Hallazgos

### H1 · BAJA · `docs/state.md:61`: el hallazgo «26.C4 falla» es un artefacto de la base de otra rama, no un defecto de `main`

La rama de T-023 añade `cobros_devolucion_motivo_ck` (migración 20261013) y en ese mismo diff corrige el 26.C4: `git diff main...T-023-cobros-y-pendiente -- scripts/rls/26-economico.sql` añade `motivo` al insert de la devolución. El 26 de `main` contra el esquema de `main` no tiene esa restricción.

**Escenario.** T-023 se integra con su 26 corregido y la línea 61 sigue diciendo «26.C4 falla en la base compartida». Quien lea `state.md` abre ticket o investiga un fallo que no existe, y esa línea ocupa una de las 80. La misma ejecución sobre la base de T-023 se cita en la bitácora como «test:rls real». Esto deja CA1 sin evidencia sobre `main`; le toca al verificador, no es hallazgo de código.

### H2 · BAJA · `docs/state.md:59` (y el comentario de `23-cita-en-episodio.sql:976`): la receta de C3b da por libres D−6 y D−9, y no lo están a primera hora

Un ancla `now() − k días` también entra en las primeras horas del día UTC-relativo `−k+1`, porque `current_date` es la fecha UTC. Entre las 00:00 y las 02:00 de Madrid, esa fecha es la del día anterior. Medido con la simulación, con `current_date` en UTC y arranques cada 5 min durante un año:
- una cita de 20 min en D−6 a las 00:30 choca con 16.C7PAS 6206 veces;
- en D−9 a las 00:30 choca con 16.C5P1 las mismas 6206 veces;
- a las 03:00, el margen en los dos días es de solo 5 min.

D−5 y D−8 sí están libres a cualquier hora. El comentario de l.976 («D−9 y no D−10: […] barre D−10») transmite la misma idea de día limpio. La `c_pasada` elegida (05:00) es segura, con un margen de 125 min. El fallo está en la receta escrita.

**Escenario.** El ticket que arregle C3b sigue `state.md:59` y lleva la baja de V39 y C3b a D−9 a las 00:30. Un `test:rls` arrancado el 08-10 a las 00:50 de Madrid (22:50 UTC del 07-10) pone `current_date − 9` en el 28-09, y C5P1 cae a las 00:50 de ese mismo 28-09. Resultado: 23P01 en C3b, que es el fallo de este ticket con otra cita.

### H3 · BAJA · `docs/state.md:60` (`tickets/T-050/simulacion.sql:4-31`): se presenta como «Detector» una simulación con inventario escrito a mano

Las dos listas son `values` literales. `rel` enumera las anclas a `now()` y `fija`, las citas del 23. Por ejemplo, `fija` ya omite Pf (D+8 05:00, l.1042), que hoy tiene margen de sobra. Una cita nueva anclada a `now()` no aparece en la simulación hasta que alguien la añade a mano. El diseño lo reconocía («sin mantenimiento a mano: […] que lea el inventario de un fichero»), pero `state.md` lo omite.

**Escenario.** Un ticket añade al 22 una cita de PRO1 en `now() − 5 days`. `simulacion.sql` sigue sin devolver ninguna fila `NUEVA`, mientras `test:rls` cae en Z si arranca hacia las 11:00-12:30. El «Detector» da un verde falso.

## Notas, sin hallazgo
- CA1 («`test:rls` en verde tras `db reset` + `seed`») no está demostrado en la rama: la única ejecución completa corrió con la base en 20261013 y se paró en el 26. Le toca al verificador.
- `state.md` no se reescribió en la cabecera («Actualizado», «En curso»): solo se añadieron tres líneas. Ningún escenario de fallo concreto se sigue de ello.
