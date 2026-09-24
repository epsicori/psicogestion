# Revisión T-031 (tercera ronda): Dinero, importes, IVA y redondeo

**No hay ALTAS.** Queda 1 MEDIA (el informe de entrega no se actualizó con los arreglos) y 5 BAJAS. Los seis hallazgos de la ronda anterior (H6-H11) están cerrados, y en cada uno la prueba se pone en rojo si se quita la guarda.

Commit revisado: **`29e4c36`** (rama `T-031-dinero-importes-y-redondeo`, worktree `.claude/worktrees/t031`).
Diff: `git diff main...HEAD`, 7 ficheros: `lib/dinero/{importe,iva,reparto}.ts`, sus `.test.ts` y
`kimi/informes/T-031.md`. `territorio.mjs T-031` da «7 fichero(s) tocado(s), todos dentro de
lib/dinero/**, kimi/informes/T-031.md».

Comprobaciones que he ejecutado:
- `vitest run lib/dinero --coverage`: 42/42 pruebas, 100 % de líneas y 97,82 % de ramas.
- `tsc --noEmit`: sale con 0.
- `eslint lib/dinero`: sin avisos.

Los casos límite los medí con `tsx` sobre una copia en el scratchpad. Las pruebas con la guarda
revertida las corrí con `vitest` sobre otra copia. No he leído `evidencia.json` ni el informe del
verificador.

## Estado de los hallazgos de la segunda ronda

| Id | Estado | Comprobación |
|---|---|---|
| H6 (MEDIA) `'0.500'` → 500 € | **Resuelto** | El primer grupo es ahora `[1-9]\d{0,2}` en los dos patrones (`importe.ts:53`, `:58`). Con el patrón antiguo, `aCentimos('0.500')` daba 50000 sin lanzar, así que la negativa nueva se pondría en rojo. Siguen valiendo `'0.50'` → 50 y `'1.500'` → 150000. `'01.234'` y `'01.234,00'` también se rechazan (medido). |
| H7 (MEDIA) IVA sin validar entero ni `NaN` | **Resuelto** | `comprobarCentimos` está al principio de las dos funciones (`iva.ts:65`, `:86`), antes de la rama exenta. Sin esa línea, `desglosarDesdeBase(10.5, 'exento_sanitario')` devolvería un resultado en lugar de lanzar, y la prueba se pondría en rojo. |
| H8 (MEDIA) redondeo asimétrico en negativos | **Resuelto** | `redondearCentimos` redondea ahora con media lejos del cero. Los bucles 0..10000 de `iva.test.ts:45` y `:110` fallarían con `Math.round` en `b = 50`. Lo medí además en ±2 000 000, desde la base y desde el total: 0 asimetrías y ningún `-0` en cuota ni en base, salvo con entrada `-0` (ver H17). |
| H9 (BAJA) `-0` en `aCentimos`/`formatearImporte` | **Resuelto en las dos funciones**. Sin la guarda, las tres pruebas nuevas con `Object.is` se pondrían en rojo. Queda una puerta en `iva.ts`: ver H17. |
| H10 (BAJA) reparto negativo sin fijar | **Resuelto** | Hay un `toEqual([-34, -33, -33])`. Con `Math.floor`, el reparto da `[-33, -33, -34]` y la prueba cae. |
| H11 (BAJA) `aCentimos` sin entero seguro | **Resuelto en `aCentimos`** (`importe.ts:105`). Tiene frontera positiva (`'90071992547409,91'` → `MAX_SAFE_INTEGER`) y negativa (`,92`). El mismo cambio en `comprobarCentimos` no tiene ninguna prueba que lo sostenga: ver H13. |

## MEDIA

### H12: el informe de entrega describe la regla de redondeo que este mismo commit ha cambiado, cita pruebas que ya no existen y da una cobertura que no es la real
**Archivo:** `kimi/informes/T-031.md:24` (y `:81-86`, `:102-104`, `:112`, `:121`, `:168`)

El commit `29e4c36` cambia la regla a «media lejos del cero» y renombra las pruebas. El informe, que
va dentro del diff, sigue diciendo lo de la primera ronda:
- La regla es «media al alza» (`:24`, `:86`, `:148`), y la sección «Para `docs/state.md`» (`:168`) lleva esa misma frase a la memoria del proyecto.
- Como evidencia del criterio 5 cita dos pruebas con nombres que ya no existen: `redondearCentimos > media al alza: medio céntimo sube…` (`:82`, `:112`).
- La cobertura que da es 100 % de ramas en los tres ficheros (`:102-104`). La real es 97,82 %, con `importe.ts:91` sin cubrir.
- El recuento de pruebas es 26 (`:121`). Ahora son 42.

**Escenario:** al integrar, alguien copia «Para `docs/state.md`» y la memoria queda con «redondeo
media al alza». T-023 o T-027 leen eso y dan por buena la conducta de `Math.round` en negativos, que
es justo la que H8 quitó. Además, quien coteje el criterio 5 buscando en la salida de `vitest` el
nombre citado no lo encuentra.

Los criterios se siguen cumpliendo en el árbol: 97,82 % supera el 95 %, y el filo está probado en las
dos direcciones. Por eso no es una ALTA de la regla 3. Pero el informe ya no es evidencia de este
commit.

## BAJA

### H13: el cambio de `Number.isInteger` a `Number.isSafeInteger` en `comprobarCentimos` no lo sostiene ninguna prueba
**Archivo:** `lib/dinero/importe.ts:32`. Las negativas están en `importe.test.ts:97-98`, `iva.test.ts:54-56` y `:119-121`, y `reparto.test.ts:43` y `:81-82`.

Todas las negativas de `formatearImporte`, `desglosar*`, `repartir` y `pendiente` usan fracciones
(`10.5`, `4000.5`) o `NaN`, que `Number.isInteger` también rechaza. Solo `aCentimos` prueba un entero
no seguro, y `aCentimos` tiene su propia guarda (`:105`).

**Escenario (medido):** en una copia, cambié `Number.isSafeInteger(valor)` por `Number.isInteger(valor)`
en `comprobarCentimos`. Las 42 pruebas siguen en verde, y `formatearImporte(1e19)` volvería a pintar
un importe inexacto sin lanzar. Falta, por ejemplo, un
`expect(() => formatearImporte(Number.MAX_SAFE_INTEGER + 1)).toThrow(/entero/)`.

### H14: la guarda comprueba las entradas pero no las salidas, y el desglose y `pendiente` devuelven enteros no seguros sin error
**Archivo:** `lib/dinero/iva.ts:75` (`total: base + cuota`) y `lib/dinero/reparto.ts:50` (`total - cobrado`).

`aCentimos` acepta hasta `MAX_SAFE_INTEGER` céntimos. Ni el desglose ni la resta de `pendiente` lo
comprueban a la salida.

**Escenario (medido):** `desglosarDesdeBase(aCentimos('80000000000000'), 'general')` devuelve
`total: 9680000000000000`, que no es un entero seguro. Si luego se llama a
`formatearImporte(d.total)` sobre el resultado del propio módulo, lanza «El importe ha de ser un
entero en céntimos». `pendiente(MAX_SAFE_INTEGER, -MAX_SAFE_INTEGER)` da
`pendiente: 18014398509481982`. Solo pasa con cifras absurdas (80 billones de euros); por eso es BAJA.
Basta con acotar la entrada a `MAX_SAFE_INTEGER / 1.21`, o con pasar `comprobarCentimos` por la salida.

### H15: `redondearCentimos` es pública y devuelve `NaN` o `Infinity` sin lanzar
**Archivo:** `lib/dinero/importe.ts:24`

La cabecera del módulo (`:6-7`) promete que «nunca se devuelve `NaN` callando», y la propia función
pide que «quien calcule porcentajes o divisiones» pase por ella. Pero no valida lo que recibe.

**Escenario (medido):** `redondearCentimos(NaN)` → `NaN` y `redondearCentimos(-Infinity)` → `-Infinity`.
Un llamante de T-027 que calcule `redondearCentimos(precio * pct / 100)` con `pct` sin definir
recibe `NaN`. Si ese valor se serializa (`JSON.stringify(NaN)` da `null`), llega como nulo a la base,
sin error. Es el mismo caso que H7 en la única función de dinero que quedó sin comprobar.

### H16: `pendiente()` acepta un total negativo y lo presenta como «cobrado de más»
**Archivo:** `lib/dinero/reparto.ts:47` (y `:57`)

El módulo admite negativos «para devoluciones» (`aCentimos`, `repartir`, el desglose simétrico).
`pendiente` no los rechaza ni dice qué significan.

**Escenario (medido):** `pendiente(-6100, 0)`, una devolución de 61 € todavía sin pagar, da
`{ estado: 'cobrado_de_mas', pendiente: 0, excedente: 6100 }`. La pantalla de cobros (T-023)
enseñaría «cobrado de más 61 €» en algo que no se ha cobrado ni devuelto. Otro caso:
`pendiente(10000, -500)` da `pendiente: 10500`, más de lo que vale el servicio. Hay que rechazar
`total < 0` o dejar escrito que no aplica a devoluciones.

### H17: con entrada `-0`, el desglose de IVA devuelve `-0`, y el bucle de simetría lo recorre sin verlo
**Archivo:** `lib/dinero/iva.ts:95` (`cuota: total - base`) y `:44` (`base: importe` en el exento). La prueba está en `lib/dinero/iva.test.ts:110`.

Lo natural para construir una devolución es `-cargo.total`, y si el cargo vale 0 eso da `-0`.
`redondearCentimos` sí limpia el `-0`, pero la resta y la rama exenta lo dejan pasar.

**Escenario (medido):**
- `desglosarDesdeTotal(-0, 'general')` → `cuota: -0, total: -0`.
- `desglosarDesdeBase(-0, 'exento_sanitario')` → `base: -0, total: -0`.

El bucle de `iva.test.ts:110` arranca en `t = 0`, así que llama exactamente a
`desglosarDesdeTotal(-0)`. Solo comprueba sumas (`-0 + 0` es `0`), y no lo ve. En `vitest`, `toEqual`
distingue `-0` de `0` (medido: `expect({a: -0}).toEqual({a: 0})` falla). Una prueba de T-023 que
espere `{ base: 0, cuota: 0, total: 0 }` para la devolución de una sesión gratuita se pondría en rojo.
`formatearImporte` sí lo pinta bien.

## Qué no es un hallazgo (comprobado y descartado)

- **Redondeo en coma flotante:** `n·21/100` con `n ≡ 50 (mod 100)` es exactamente `k,5` y se puede
  representar. `total·100/121` nunca cae en empate. `redondearCentimos(0.49999999999999994)` → 0.
  `Math.sign(x)·Math.round(|x|) + 0` no deja `-0` para ningún `x` finito.
- **`repartir` con negativos pequeños:** `repartir(-1, 3)` da `[-1, 0, 0]`, sin `-0`. `Math.trunc(-1/3)`
  es `-0`, pero se suma a `+0`. `repartir(-0, 2)` da `[0, 0]`.
- **Frontera de `aCentimos`:** entre `Number(m[1])·100` y el `isSafeInteger` final no hay forma de que
  un valor inexacto se redondee a uno seguro, porque por encima de 2^53 todo sigue siendo no seguro.
  `'- 5'` → -500 (se admite un espacio tras el signo). `'-'` y `'€'` lanzan. `'0500'` → 500 €, una
  lectura entera sin ambigüedad de millar.
- **Rama sin cubrir en `importe.ts:91`** (`if (m)`): no se puede alcanzar después de validar el patrón.
  Ya se descartó en la ronda anterior.
- **Territorio y memoria:** la rama no toca `tickets/**`, `.claude/**`, `CLAUDE.md`, `docs/**` ni `supabase/**`.
