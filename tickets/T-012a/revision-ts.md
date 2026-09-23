# T-012a · Revisión (lado TypeScript) · revisor A

**Hay 1 hallazgo ALTA.** No es un fallo del sello: el sello está bien. Es una prueba negativa
—la del `"alcance":null`, la razón de ser de la comprobación 6.10— que **nunca llega a la 6.10**
y pasa en verde por otra comprobación.

Rama revisada: `worktree-agent-a171fd6674526760f` (6 commits sobre `4bc61a9`).
Leído: memoria del revisor (vacía: primer ticket), `git diff 4bc61a9...HEAD` entero,
`tickets/T-012a-alcance-en-el-sobre.md`, `tickets/T-012/diseno.md` §1.1 y §5, `docs/decisions/ADR-057.md`,
`CLAUDE.md` + `.claude/rules/pipeline.md`. **No** leídos: `evidencia.json` ni el informe del verificador.

---

## Lo que comprobé a mano y salió bien (para que no se vuelva a comprobar)

Recalculé los **nueve** vectores con una implementación **propia** de JCS (NFC + orden por
unidades UTF-16 + serialización ES) y de la huella génesis (`sha256(utf8(canónico) || 32 ceros)`),
sin usar `lib/huella/jcs.ts` ni `nfc.ts`, para que un error dentro de esas funciones no se
autoconfirmara:

| Vector | `canonico` | `huella_hex` |
|---|---|---|
| genesis-minimo, acentos-nfd, acentos-nfc, emoji-y-tipograficas, reservadas-nulas, reservadas-vacias, en-sesion, control-y-exponente, alcance-conjunta | 9/9 OK | 9/9 OK |

- **Regenerados, no editados a mano**: los nueve `canonico` y los nueve `huella_hex` del JSON
  son exactamente los que sale de canonizar el `sobre` del propio vector. Ninguno está tocado.
- **NFC sigue viva.** `acentos-nfd.sobre.cuerpo.texto` son los codepoints `63 61 66 65 0301`
  (descompuesto de verdad, no un NFC disfrazado) y su `canonico` guardado lleva `63 61 66 e9`
  (compuesto). `acentos-nfc` es `63 61 66 e9` en los dos sitios. Las dos huellas coinciden:
  `183caf10deb5daad829bb6c397344ac9c3f0d6012bdbfc659a05c8534d7c6068`. Leído del JSON, no de la
  prueba en verde.
- **Orden de claves**: el orden real del `canonico` guardado es
  `abierta_en, alcance, anotaciones_reservadas, autor_id, cita_id, creada_en, cuerpo,
  esquema_version, firmada_en, margen_sesion_minutos, motivo_cambio, redactada_en_sesion`.
  `alcance` está en el índice 1, entre `abierta_en` y `anotaciones_reservadas`, que es donde JCS
  lo pone. No está colocado a ojo: mi canonizador independiente lo produce en ese sitio.
- **`ALGORITMO_VERSION` sigue en 1** (`lib/huella/sobre.ts:27`), y la prueba lo afirma con
  literal (`sobre.test.ts:76`).
- **`esquemaSobre` sigue siendo `.strict()`** (`sobre.ts:60`) y la negativa de `sobre.test.ts:120`
  es sensible a la guarda: quitar `.strict()` deja pasar `{...sobreBase(), extra: 1}` y la prueba
  se pone roja. Correcto.
- **`lib/huella/vectores.test.ts`**: el diff es exactamente 1 línea de rótulo («ocho» → «nueve»,
  con la coletilla del ticket) y 1 línea con `'alcance-conjunta'` en la lista de nombres. Nada
  más: ni asserts relajados, ni `it.skip`, ni cambios en `huellaGenesis`. Verificado sobre el diff
  completo del fichero, no sobre el resumen.
- `npx vitest run lib/huella` en la rama: 6 ficheros, 70 pruebas, todo verde.
- Ningún otro consumidor TypeScript da por buena la era 2: `firmar.ts` toma
  `esquema_version` de `sobre`, `scripts/verificar-huellas.mjs` y `verificar_cadena_huellas()`
  son agnósticos de la forma del sobre, y no hay más importadores de `ESQUEMA_VERSION`.

---

## ALTA

### H1 · La negativa de `"alcance":null` muere en la 6.5 y nunca ejecuta la 6.10

`scripts/rls/14-cadena-huellas.sql:409`

La migración sube el DEFAULT de la columna (`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:277`:
`alter column esquema_version set default 3`), pero el sobre literal de esta negativa sigue
diciendo `"esquema_version":2` y el `insert` **no lista la columna** `esquema_version`
(`insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)`).

**Escenario**: se ejecuta `npm run test:rls`. La fila entra con `new.esquema_version = 3` (el
default nuevo) y un sobre que dice `2`. La comprobación **6.5** (migración línea 166,
`(v_contenido -> 'esquema_version') is distinct from to_jsonb(new.esquema_version)`) lanza 23514
**antes** de llegar a la 6.10 (migración línea 245). `assert_lanza_codigo(..., '23514')` ve el
código que espera y da OK con el rótulo «comprobación 6.10, ADR-057».

**Efecto**: la única prueba que cubre el `null` JSON en `alcance` —el caso exacto que el contrato
manda proteger y por el que la 6.10 se escribe con `is distinct from` y no con `->>`+`<>`— **no
toca la 6.10 ni una vez**. Si alguien reescribe la 6.10 como
`if (v_contenido->>'alcance') <> new.alcance::text then` (la trampa que el ticket nombra por su
nombre), el banco sigue verde y el criterio de aceptación 8 se sigue «demostrando». Un sobre con
`"alcance":null` colaría sellado, y quién puede leer esa versión dejaría de estar atado a lo
firmado, para siempre, porque esto no se recalcula nunca.

**Arreglo**: en ese literal, `"esquema_version":2` → `"esquema_version":3`. Y, para que la prueba
no vuelva a apoyarse en una coincidencia, fijar `esquema_version` explícitamente en la lista de
columnas del `insert` de las negativas en vez de depender del DEFAULT.

---

## MEDIA

### H2 · La misma causa apaga en silencio cuatro regresiones heredadas de T-005

`scripts/rls/14-cadena-huellas.sql:296`, `:306`, `:316`, `:359`

Los cuatro sobres literales conservan `"esquema_version":2` contra una columna que ahora vale 3
por defecto, así que todos revientan en la 6.5 antes de llegar a la comprobación que dicen probar.

| Línea | Rótulo de la prueba | Comprobación que dice ejercer | La que ejerce de verdad |
|---|---|---|---|
| 296 | `esquema_version` como cadena `"2"` (hallazgo BAJA 10) | 6.5, distinción **tipo** | 6.5, por **valor** (`"2"` ≠ 3): el matiz cadena-vs-número deja de probarse |
| 306 | `creada_en` JSON null (hueco del hallazgo ALTA) | 6.7 | 6.5 |
| 316 | `firmada_en` JSON null (hueco del hallazgo ALTA) | 6.7 | 6.5 |
| 359 | `abierta_en` no es ISO-8601 → 23514 y no 22007 | 6.8 | 6.5 |

**Escenario**: se deshace el arreglo del hallazgo ALTA de T-005 —volver a escribir la 6.7 como
`(v_contenido->>'creada_en')::timestamptz <> new.creada_en`, que con un JSON null da SQL NULL y
no salta— y `npm run test:rls` **sigue verde**, porque la fila muere antes en la 6.5. Las tres
pruebas que existen exactamente para que eso no pueda volver a pasar ya no lo impiden.

**Arreglo**: los cuatro literales a `"esquema_version":3` (misma corrección que H1).

### H3 · Ninguna prueba de TypeScript ata `entrada.alcance` al `alcance` del sobre

`lib/huella/sobre.test.ts:16-30` (`entradaBase`), `:52`, `:149`

`entradaBase()` siempre fija `alcance: 'individual'` y **ninguna prueba lo sobrescribe**. La de
las doce claves (`:52`) solo mira nombres de clave; la de sensibilidad (`:149`) construye los dos
sobres con `sobreBase()` + `esquemaSobre.parse`, que **no pasa por `construirSobre()`**: prueba
que JCS es sensible al campo, no que el campo venga de la entrada. Ningún test lee
`construirSobre(...).alcance`.

**Escenario**: se cambia `lib/huella/sobre.ts:100` de `alcance: entrada.alcance` a
`alcance: 'individual'`. Las 70 pruebas siguen verdes. Quien firme una nota conjunta desde la
aplicación sellaría un sobre que dice `individual` mientras `firmar.ts:57` escribe `'conjunta'`
en la columna: lo único que lo para es la 6.10 en la base (23514 en tiempo de ejecución, con la
firma perdida en la cara del profesional) y la siembra de NCONJ del banco de RLS. La suite del
carril que es dueño del fichero no dice nada.

**Arreglo**: una línea —
`expect(construirSobre(entradaBase({ alcance: 'conjunta' })).alcance).toBe('conjunta')`.

### H4 · Lo sellado no se vuelve a comparar con la columna: el ADR-057 promete una detección que no existe

`supabase/migrations/20260829210000_cadena_de_huellas.sql:515-596` (`verificar_cadena_huellas`),
sin cambios en esta rama.

El ADR-057 dice: «Cambiar quién puede leer una nota pasa a ser detectable. Un `alcance` alterado
por debajo rompe la huella de esa versión y el verificador lo señala». Eso solo es cierto si el
atacante toca el **sobre**. La 6.10 solo corre `before insert`; `verificar_cadena_huellas()`
recalcula `sha256(contenido_canonico || huella_anterior)` y no mira ni una columna del contenido.

**Escenario**: alguien con `postgres` hace
`alter table ... disable trigger all; update notas_clinicas_versiones set alcance = 'conjunta' where id = ...;`
El `contenido_canonico` no se toca, así que la huella sigue cuadrando y `npm run verificar:huellas`
dice **cadena sana**. La política `notas_clinicas_versiones_lectura` lee la **columna**, no el
sobre: la nota queda abierta a todos los profesionales del episodio y no hay nada que lo señale.
Es el adversario que el propio ADR nombra («ese es exactamente el adversario para el que existe
una cadena de huellas»).

**No es regresión** —antes de este ticket `alcance` no estaba sellado en absoluto— y **no está en
el contrato**: añadir un motivo `sobre_no_coincide_con_fila` al verificador es trabajo de otro
ticket. Pero la consecuencia escrita en un ADR aceptado hoy es falsa, y eso hay que decidirlo
antes de la primera firma real (T-012), no después. Anotar en `docs/state.md` §Hallazgos abiertos.

---

## BAJA

### H5 · `vectores.test.ts` está fuera del `territorio:` declarado y no se declara en ningún sitio

`lib/huella/vectores.test.ts:33`, `:44`; `tickets/T-012a-alcance-en-el-sobre.md` (bloque `territorio:`).

El cambio es **correcto y necesario** (el noveno vector no entra sin tocar la lista de nombres) y
es mínimo, pero el fichero no está en `territorio:` y el diff no toca `docs/` en absoluto.

**Escenario**: en el gate de merge, `node ~/.claude/pipeline/territorio.mjs` marca un fichero
fuera del contrato; o pasa desapercibido y la regla «un fichero, un dueño» queda con una
excepción tácita. Arreglo: añadir la línea al `territorio:` del contrato (el diseño §6 ya declara
`lib/huella/**` entero, así que es un olvido del contrato, no una invasión).

### H6 · Los tres generadores de sobres concatenan `alcance` sin `to_json()`

`scripts/rls/00-ayudantes.sql:166`, `supabase/seed-completo.sql:55`, `scripts/t005-concurrencia.sql:74`
(`'"alcance":"' || p_alcance || '",'`).

Es el único campo de texto de los tres generadores que no pasa por `to_json()`.

**Escenario**: alguien escribe la negativa obvia `sobre_prueba(..., p_alcance => null)` esperando
un sobre con `"alcance":null`. En SQL, `'x' || null` es NULL, así que el generador devuelve NULL
entero, `contenido_canonico` llega nulo y el `insert` falla con **23502** (NOT NULL), no con
23514: otra prueba verde por el motivo equivocado. Igual con un `p_alcance` que llevara comilla:
sobre malformado y 22P02 en el cast. Arreglo:
`'"alcance":' || coalesce(to_json(p_alcance)::text, 'null') || ','`, como hacen `motivo_cambio` y
`anotaciones_reservadas` dos líneas más abajo.

### H7 · La prueba de sensibilidad promete una huella que nunca calcula

`lib/huella/sobre.test.ts:149`

El rótulo dice «cambia el canónico **y la huella**» y el cuerpo solo compara dos cadenas
canónicas (en TypeScript no hay SHA-256 fuera de `vectores.test.ts`, y es deliberado).

**Escenario**: alguien lee el rótulo, da por cubierto el extremo de la huella y no añade el
vector `alcance-conjunta` al lado SQL. Es cosmético —el vector existe y el banco compara contra
pgcrypto—, pero el rótulo afirma una cobertura que el fichero no tiene. Arreglo: quitar «y la
huella» del rótulo.

### H8 · Nada ata `vectores-congelados.json` a la era vigente

`lib/huella/vectores.test.ts:49-53`

Las pruebas de vectores son **autoconsistentes**: comparan el JSON consigo mismo, y
`vectores-sql.test.ts` compara el SQL con ese mismo JSON. Ninguna comprueba
`vector.sobre.esquema_version === ESQUEMA_VERSION`.

**Escenario**: la próxima era (la que costará un `esquema_version = 4`) sube la constante y la
prueba literal de `sobre.test.ts`, pero se olvida de regenerar el JSON. Las dos suites de
vectores siguen verdes porque siguen cuadrando entre ellas, y lo que se congela deja de describir
el sobre vigente; solo lo caza el banco de RLS en CI. Arreglo: una línea —
`expect(v.sobre.esquema_version).toBe(ESQUEMA_VERSION)` dentro del `it.each`.

---

## Cosas que miré y NO son hallazgos

- `firmar.ts:57` escribe la columna con `entrada.alcance` y no con `sobre.alcance` (a diferencia
  de `autor_id`/`anotaciones_reservadas`, que sí van del sobre). Hoy no pueden divergir:
  `z.enum` valida sin transformar, así que si `construirSobre` no lanzó, los dos valores son el
  mismo. Sin escenario de fallo → no es hallazgo; queda dicho por si alguien añade un
  `.transform()` al enum.
- Las negativas de `autor_id` nulo (`:274`) y `autor_id` duplicado (`:330`) conservan
  `"esquema_version":2` pero sus comprobaciones (6.2 y 6.1) corren **antes** de la 6.5: siguen
  fallando por donde dicen. No entran en H2.
- La gemela positiva nueva (`:431`) mete una segunda versión en NCONJ. Ningún módulo posterior
  del banco (15-17) toca NCONJ, y las tres consultas escalares sobre NCONJ del propio fichero
  (`:71`, `:77`, `:88`) corren antes de ese `insert`. La posición 3 cuadra: en la cadena de P1
  solo hay NCONJ(1) y NIND(2), y `04-baja.sql` firma sobre PBAJA, otro paciente.
- La guarda de era de la migración (`:26-37`) está y su mensaje se entiende.
