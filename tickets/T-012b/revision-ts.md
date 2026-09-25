# T-012b · Revisión 2 de 2 (CLI y documentación)

**No hay ninguna ALTA.** 2 MEDIA y 3 BAJA.

Diff revisado: `git diff main...worktree-agent-a47a1a55a62171516`, 3 commits (`aa54358`, `99564fc` y `dc6e938`),
con base `1496de7`. Foco: `scripts/verificar-huellas.mjs`, `docs/architecture.md` y `scripts/rls/README.md`,
además del ADR-057 §Consecuencias y el territorio. No he leído `evidencia.json` ni el informe del verificador.

## Lo que se comprobó y está bien

- **Territorio.** Ejecuté `node ~/.claude/pipeline/territorio.mjs T-012b` desde el worktree de la rama y dio
  «5 fichero(s) tocado(s), todos dentro», con exit 0. Lo cotejé a mano con `git diff --name-status`: las
  cinco rutas casan con `territorio:`. La rama no toca `tickets/**`, `.claude/**`, `CLAUDE.md` ni
  `docs/decisions/**`, `lib/huella/**` ni `fn_sellar_version_nota()`.
- **La forma de `--json` no cambia.** Sigue siendo `jsonb_agg(t …)` sobre las mismas seis columnas de
  retorno, en el mismo orden. Solo cambia el `order by` interno.
- **Los códigos de salida no cambian.** La rama no toca 0 (cero anomalías), 1 (anomalías o fallo de `psql`)
  ni 2 (argumentos).
- **La línea «y N anomalía(s) más» es correcta.** Lo simulé en el scratchpad con el cuerpo literal del guion
  (`sed` del bloque, `new Function`). Usé tres cadenas: una con dos motivos en la misma posición y otro
  en una posición posterior, una con una sola anomalía y otra con la entrada desordenada a propósito.
  Salen 6 anomalías en 3 cadenas. En las cadenas con resto, N vale 2 y 1, y en la de una sola anomalía no
  sale la línea. En la cadena desordenada, la primera línea es igualmente la posición mínima. En todos
  los casos, 1 + N por cadena suma el total de la cabecera.
- **El desempate por motivo** da el mismo orden en `C` y en `en_US`: `era_… < eslabon_… < genesis_… <
  hueco_… < huella_… < sobre_…`, y `hueco`/`huella` se separan en la cuarta letra. Cuando hay empate en la
  posición, la primera línea enseña `huella_no_coincide` antes que `sobre_no_coincide_con_fila`.
- **`lib/supabase/tipos-bd.ts`** sale como `M` en el worktree, pero solo por el fin de línea (CRLF):
  `git diff --exit-code --quiet` da 0. No es un hallazgo.
- **`scripts/rls/README.md:40`**: la frase añadida es cierta (la sección F existe, de F.0 a F.11).

## MEDIA

### M1 · `docs/architecture.md:94-98`: el destilado promete detectar cualquier `update` de la fila, y `nota_id` sigue sin detectarse

La frase nueva termina así: «así se detecta también un `update` con los cerrojos levantados que cambie la
fila sin tocar el sobre». Es falso para dos columnas de la fila que no son ninguna de las siete cotejadas:
`nota_id` y `numero_version`. El propio diseño (§8) y el ADR-067 (ya en `main`) dicen que `nota_id` no lo
ve ni la huella ni el cotejo. `docs/architecture.md` es el destilado que «manda sobre quién ve qué», y
`nota_id` es justo una de las dos columnas que deciden la lectura (H8 del diseño).

- **Escenario.** Con los cerrojos levantados, `update public.notas_clinicas_versiones set nota_id =
  '<otra nota del mismo paciente en otro episodio>' where id = '<versión conjunta>'` cambia qué
  profesionales leen la versión. Después, `npm run verificar:huellas` imprime «cadena íntegra: cero
  anomalías.», con exit 0. Quien lea `architecture.md` (el arquitecto de T-012c, o un auditor) entiende que
  ese `update` sale como `sobre_no_coincide_con_fila`.
- **Arreglo sugerido.** Acotar la frase a «que cambie una de esas siete columnas sin tocar el sobre» y
  añadir que `nota_id` queda fuera hasta T-012c (ADR-067).

### M2 · La rama no deja memoria, y el hallazgo que el diseño manda anotar se pierde

`git diff --name-status` no trae ni `docs/bitacora/T-012b.md` ni `docs/state.md`. El diseño §1.4 los
exige («por la regla 4. Son rutas comunes del territorio»). Además, «Lo que no entra» manda anotar en
`docs/state.md` §Hallazgos el comentario obsoleto de `fn_sellar_version_nota()`
(`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:161-163`), que dice que el verificador
«tampoco detecta un `alcance` de columna alterado por debajo sin tocar el sobre». Desde esta migración,
ese comentario es falso. El `state.md` de `main` no lo recoge, y sigue diciendo «T-012b: implementándose».

- **Escenario.** Se integra la rama tal cual. T-012c (ADR-067) tiene que redefinir
  `fn_sellar_version_nota()` para subir `esquema_version` a 4, y lo hará con `create or replace`,
  copiando la versión viva, que es la más reciente (ver el patrón de la memoria «Arreglo aplicado a
  medias»). El comentario falso pasa a la copia nueva, porque nadie tiene anotado que hay que
  corregirlo. Y el comentario remite a «docs/state.md §Hallazgos abiertos», donde no hay ninguna
  entrada.
- **Nota.** En T-012a la bitácora se escribió al integrar, así que puede cerrarlo el orquestador. Pero la
  anotación tiene que existir antes de diseñar T-012c.

## BAJA

### B1 · `scripts/verificar-huellas.mjs:12-14`: el comentario atribuye a T-012b algo que ya pasaba desde T-005

El comentario dice «Desde T-012b una misma cadena puede tener MÁS DE UNA anomalía por versión». Con el
verificador de T-005, una sola versión ya daba dos filas, y una cadena, varias. Hasta esta rama, el CLI
las descartaba en silencio y desempataba de forma indeterminada (H14 del diseño).

- **Escenario.** Con los cerrojos levantados, `update … set huella_anterior = '\x11…' where posicion_cadena
  = 1` da `genesis_incorrecto` y `huella_no_coincide` en la misma versión con el verificador de T-005. En
  una posición mayor que 1, da `eslabon_desencadenado` y `huella_no_coincide`. Quien lea el comentario
  para enganchar T-009 concluye que antes de T-012b el modo texto no perdía nada, y es al revés: T-012b es
  lo que deja de perderlo.

### B2 · `scripts/verificar-huellas.mjs:68`: el desempate no es total si falta el índice único de la cadena

`order by paciente_id, posicion_cadena, motivo` solo es un orden total mientras exista
`notas_clinicas_versiones_cadena_idx`, el índice único de `(paciente_id, posicion_cadena)`. El adversario
que levanta los cerrojos puede borrarlo con el mismo privilegio.

- **Escenario.** `drop index public.notas_clinicas_versiones_cadena_idx; update … set posicion_cadena = 2
  where id = '<v3>'` deja dos versiones del paciente en la posición 2 con el mismo motivo. La línea
  «primer eslabón roto» y el orden de `--json` pueden nombrar `v2` o `v3` según el plan de ejecución.
- **Arreglo sugerido.** Añadir `t.version_id` como último criterio. Cuesta una palabra. La propia función
  tampoco es determinista en ese caso, porque el `lag()` tiene empates, así que esto solo cierra la parte
  del CLI.

### B3 · ADR-057 §Consecuencias se cumple solo frente al adversario que no toca el sobre, y el resto del riesgo no está escrito en ningún documento vivo

La rama sí hace cierta la frase que el contrato quería hacer cierta: un `alcance` cambiado por debajo sin
tocar el sobre lo señala el verificador (F.1). No la rompe la huella, como dice el ADR, pero el
propietario lo aceptó (diseño §2, «Nota sobre el ADR-057»). La consecuencia de más alto nivel, «Cambiar
quién puede leer una nota pasa a ser detectable», sigue sin cumplirse por dos caminos:

- **`nota_id`**: M1 de esta revisión, previsto en T-012c.
- **La última versión de una cadena, reescrita entera.** El adversario cambia a la vez la columna, el sobre
  y la huella, y como es la última versión no tiene eslabón siguiente que la delate.

- **Escenario (el segundo camino).** Con los cerrojos levantados, sobre la última versión de un paciente:
  `update … set alcance = 'conjunta', contenido_canonico = <mismo sobre con "alcance":"conjunta">, huella =
  extensions.digest(convert_to(<ese sobre>,'UTF8') || huella_anterior,'sha256')`. El resultado es
  «cadena íntegra». El contrato lo deja fuera («reescritura completa … y anclaje externo»), y es
  correcto. Pero solo lo cuenta el diseño del ticket: ni `architecture.md` ni `state.md` dicen que la
  cadena sin anclaje externo no protege la cola.
- **Decide el propietario** si se anota como riesgo aceptado. No es un defecto del diff.

## Descartado (sin escenario de fallo)

- La línea de resto lista cada anomalía, pero D10 del diseño dice «sin listar cada anomalía». La
  implementación sigue el formato literal de §1.3, que sí las lista. Con una cadena larga, la línea crece,
  pero no hay ningún fallo.
- `docs/architecture.md:91` sigue diciendo «`esquema_version = 2`». Viene de antes y ya está anotado en
  `state.md` (B1 de T-012a). El diseño lo excluye a propósito.
