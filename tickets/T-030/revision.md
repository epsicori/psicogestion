# Revisión T-030 (ronda 4) — La rejilla de la semana, pura

**No hay hallazgos ALTA.** Tampoco hay MEDIA. H8 y H9 están cerrados en lo que decían. Quedan dos
BAJA nuevas, y las dos son restos de esos mismos arreglos. H10: la guarda de H8 no para una zona
`null` o `undefined`, que cae en la zona del sistema. H11: el informe todavía describe la prueba
antigua del criterio 3.

**Commit revisado: `cd9cdbc`** (rama `T-030-rejilla-semana-fabrica`). Diff: `git diff main...cd9cdbc`,
7 ficheros, todos dentro del `territorio:` del ticket. En el worktree:
- `vitest run lib/agenda/rejilla.test.ts lib/fechas/relativo.test.ts`: 25/25.
- Suite completa: 52 ficheros y 518 pruebas en verde.
- `tsc --noEmit` y `eslint lib/agenda lib/fechas` terminan sin salida.

Las mediciones se hicieron con `tsx` y guiones del scratchpad que importan el módulo del
worktree, sin modificarlo.

## Estado de los hallazgos anteriores

| Id | Sev. | Estado | Comprobación |
|---|---|---|---|
| H8 | BAJA | **Cerrado** (queda el resto en H10) | `rejilla.ts:110-112` lanza cuando algún límite de día es `NaN`. Las pruebas de `rejilla.test.ts:94-100` distinguen el caso bueno del malo. Medido: `diasDeSemana` y `limitesDeSemana` **no lanzan** por sí solas con `new Date('x')` ni con `'Europa/Madriz'`, sino que devuelven ocho `NaN`. Por tanto, sin la guarda, la función devuelve `[]` y `toThrow(/semana/)` se pone rojo. Ninguna otra pieza del camino lanza un mensaje que contenga «semana». También hay gemela positiva y una prueba de semana válida sin citas que devuelve `[]` (`:102-108`). También lanzan `''`, `'Local'`, `'Z'`, `'Europe/Madrid '` (con espacio al final) y `new Date(8.64e15)`. |
| H9 | BAJA | **Cerrado** (queda el resto en H11) | Las líneas que citaba H9 (`kimi/informes/T-030.md:11`, `:17`, `:19`, `:184`, `:193-196` y `:223-224`) ya hablan de `id` y ya no de `indice`. `grep -i "indice\|índice"` solo encuentra la nota histórica de `:194-196`, que explica el cambio. |

Corrección a la ronda anterior: el escenario de H8 ponía como ejemplo `?semana=2026-02-30`, y ese
valor no produce una fecha inválida. V8 interpreta `new Date('2026-02-30')` como
`2026-03-02T00:00:00Z`, una fecha válida, así que la rejilla enseña **otra semana** sin avisar. Ese
riesgo está en cómo T-014 valide el parámetro, no en esta función, que recibe un `Date` válido. Hay
que anotarlo para T-014 (se puede validar con el mismo método de `formatearFechaSinZona:27-34`).

## BAJA

### H10 — Con una zona `null` o `undefined`, la rejilla usa en silencio la zona del proceso: la guarda de H8 no la para
- **Archivo/línea**: `lib/agenda/rejilla.ts:110`. La guarda solo mira si los límites son `NaN`.
  El JSDoc de `:96-97` promete «Lanza si… `zona` no es una zona conocida».
- **Descripción**: `@date-fns/tz` interpreta una zona `null` o `undefined` como «zona local del
  proceso». Los límites salen válidos, la guarda los da por buenos y todas las citas se colocan con
  la zona equivocada. Eso contradice la nota del ticket «Nada de zona del sistema». La cadena vacía
  sí lanza. Medido con la cita `2026-04-13T08:00Z`, que son las 10:00 en Madrid:

  | Zona del proceso | `zona` | `inicioMinutos` |
  |---|---|---|
  | `TZ=UTC` | `undefined` o `null` | 480 (las 08:00 en pantalla) |
  | cualquiera | `'Europe/Madrid'` | 600 |
  | `Europe/Madrid` | `undefined` o `null` | 600 (por eso en local no se nota) |

- **Escenario**: `centros.zona_horaria` es `string | null` (`lib/supabase/tipos-bd.ts:238`), y
  `null` significa «hereda de la organización».
  1. T-014 llama `colocarEnRejilla(citas, semana, centro.zona_horaria!)`, o `as string`, en vez de
     usar `zona_horaria_centro()`.
  2. Un centro que hereda la zona tiene `null` en esa columna.
  3. En el servidor desplegado (UTC), cada cita aparece dos horas antes de su hora real en verano y
     una hora antes en invierno.
  4. No hay error. En el portátil de desarrollo, que está en Madrid, sale bien.

  Hoy el tipo `string` bloquea el `null` directo, pero no un `!` ni una fila sin tipar.
  Ninguna prueba cubre `null` ni `undefined`.

### H11 — La evidencia del criterio 3 en el informe sigue describiendo la prueba anterior a H5, y las cifras de la suite no se actualizaron
- **Archivo/línea**: `kimi/informes/T-030.md:85-93`. También `:36-37` y `:124-125`.
- **Descripción**: el arreglo de H9 cambió las decisiones del informe, pero no la evidencia de los
  criterios:
  - El criterio 3 cita la prueba «dos citas idénticas reciben columnas distintas y el resultado no
    depende del orden de entrada». Esa prueba ya no existe. La actual está en
    `rejilla.test.ts:131` y se llama «…y CADA UNA conserva su columna sea cual sea el orden de
    entrada (H5)».
  - El informe dice que `[x, y]` y `[y, x]` «devuelven arrays idénticos celda a celda
    (`toEqual`)». Esa comparación es justo la que no discriminaba y la que H5 sustituyó por la
    comparación por identidad.
  - El informe habla de 503 pruebas. Hoy hay 518.
- **Escenario**: la bitácora `docs/bitacora/T-030.md` se escribe en el merge a partir del informe.
  - Si copia el criterio 3, deja como evidencia cerrada una aserción (`toEqual` de los dos arrays)
    que no demuestra la estabilidad.
  - Quien busque ese título en el árbol no lo encuentra (`grep "el resultado no depende"
    lib/agenda/rejilla.test.ts` no devuelve nada).
  - El código está bien probado. Lo que queda mal es el registro.

## Revisado sin hallazgo

- **Territorio**: los 7 ficheros del diff coinciden con los 7 de `territorio:`.
- **El mensaje de error** incluye `String(fecha)`, que se formatea con la zona del proceso. Es
  diagnóstico, no un dato que se pinte ni que se use en cálculos, y no contiene datos de paciente.
- **`formatearFechaSinZona`** no cambia en esta ronda (se revisó en la 3). Un año de dos cifras
  como `'0050-01-01'` lanza «inexistente», porque `Date.UTC` lo lleva a 1950. Como error sirve,
  aunque el mensaje no sea exacto. Ninguna fecha de Postgres real cae ahí.
- **Títulos de las pruebas de «toda la noche»** (`rejilla.test.ts:229` y `:279`): dicen «y el lunes
  siguiente vuelve a 1440», pero solo comprueban el domingo, porque ese lunes pertenece a la semana
  siguiente. El título afirma algo que la prueba no comprueba. No lo subo a hallazgo porque no hay
  entrada de esta función que lo haga fallar.
- **Bitácora y `state.md`**: se comprueban en el merge, no en esta etapa.
