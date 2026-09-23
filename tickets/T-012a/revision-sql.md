# T-012a · Revisión (revisor 1 de 2, lado SQL primero)

**Hay 1 hallazgo ALTA.** No es un fallo del código sellador —la comprobación 6.10 está escrita
bien y el disparador se comporta como manda el ADR-057—, sino de la prueba que la protege: la
negativa de `"alcance":null` **muere antes de llegar a la 6.10** y por tanto no prueba nada. Con
la 6.10 reescrita mañana en la forma mala (`->>` + `<>`), el banco seguiría verde.

Leído: memoria del revisor (vacía: primera revisión registrada de este proyecto), `git diff
4bc61a9...worktree-agent-a171fd6674526760f`, el contrato, `tickets/T-012/diseno.md` §1.1 y §5,
`CLAUDE.md`, `.claude/rules/pipeline.md`, ADR-057, y el contexto inmediato de cada fichero tocado.
**No se ha tocado la base de datos** (hay un verificador en marcha). Lo ejecutado, todo sin base:
`npx tsx scripts/lint-migraciones.ts` → «13 migración(es) limpias»; `npx vitest run lib/huella` en
el worktree de la rama → 6 ficheros, 70 pruebas en verde; recálculo independiente en Node de los
nueve `huella_hex` a partir de su `canonico` → los nueve cuadran.

---

## ALTA

### H1 · La negativa de `"alcance":null` no llega nunca a la comprobación 6.10

`scripts/rls/14-cadena-huellas.sql:409` (sobre literal) / `:412` (rótulo de la aserción)

El sobre escrito a mano para esta negativa sigue diciendo `"esquema_version":2`, pero el INSERT
**no lista la columna `esquema_version`**, así que toma su DEFAULT, que esta misma migración acaba
de subir a **3** (`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:277`). La 6.5 se
evalúa antes que la 6.10.

**Escenario de fallo** (entrada → efecto): el banco ejecuta
`insert into notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en)`
con el sobre `{…,"alcance":null,…,"esquema_version":2,…}`; la fila entra al disparador con
`new.esquema_version = 3`; en la línea 166 de la migración, `(v_contenido -> 'esquema_version')` =
`2` **is distinct from** `to_jsonb(3)` → `raise … 23514` con el mensaje *«esquema_version del sobre
no coincide con la columna»*. `pg_temp.assert_lanza_codigo` compara **solo el SQLSTATE**
(`scripts/rls/00-ayudantes.sql:120`), nunca el mensaje: la aserción da «OK (lanzó 23514)» y la
comprobación 6.10 **no se ejecuta ni una vez** en todo el banco para el caso `null`.

Consecuencia concreta: si alguien reescribe la 6.10 como
`if (v_contenido ->> 'alcance') <> new.alcance::text then` —la forma que el ADR-057, el contrato y
el diseño §5 prohíben por escrito—, `npm run test:rls` **sigue verde**, y un sobre con
`"alcance":null` queda sellado con la huella y sin que nadie sepa quién puede leer esa versión.
Es exactamente el agujero de la trampa `NULL <> x` que este ticket existe para cerrar.

Incumple el criterio de aceptación 8 del contrato («Insertar una versión cuyo sobre lleve
`"alcance":null` falla con 23514» — falla, sí, pero por otra comprobación) y la instrucción
literal del diseño §5: «La prueba de `"alcance":null` debe fallar **por la 6.10** y no por […] otra
cosa».

**Arreglo**: en ese literal, `"esquema_version":2` → `"esquema_version":3`. Un carácter. Conviene
además dejar demostrado que llega a la 6.10 (p. ej. comprobando el texto del error, o insertando
la fila con `esquema_version` explícito y correcto).

La otra negativa nueva —sobre `conjunta` contra columna `individual`, línea 397— **sí** está bien:
usa `pg_temp.sobre_prueba()`, que emite `"esquema_version":3`, pasa la 6.5 y muere de verdad en la
6.10. El camino «no coincide» está probado; el camino «null» no.

---

## MEDIA

### H2 · Otras tres regresiones de la sección C también mueren ahora en la 6.5, no donde dicen

`scripts/rls/14-cadena-huellas.sql:306` (rótulo 6.7), `:316` (rótulo 6.7), `:359` (rótulo 6.8)

Mismo mecanismo que H1: los tres sobres son literales escritos a mano con
`"esquema_version":2` y sus INSERT dejan la columna en el DEFAULT, que ahora es 3.

**Escenario**: la fila de la línea 306 lleva `"creada_en":null` para demostrar el hallazgo ALTA de
T-005 («un `null` JSON no saltaba con `->>`»); al entrar, la 6.5 la rechaza por `2 ≠ 3` y la 6.7
—la que la prueba nombra— no se ejecuta. Igual con `"firmada_en":null` (316) y con
`"abierta_en":"esto-no-es-una-fecha"` (359, que además pretende demostrar que el `begin/exception`
convierte el 22007 crudo en 23514: ya no demuestra nada, porque nunca llega al cast). Las tres son
**las regresiones explícitas del hallazgo ALTA de T-005**, y las tres han quedado inertes en este
ticket. Quedan bien con el mismo arreglo: `2` → `3` en los tres literales.

Siguen siendo válidas, comprobado una a una: `autor_id:null` (274, muere en 6.2, que va antes que
la 6.5), `esquema_version:null` (284, 6.5 de verdad), `autor_id` duplicado (330, muere en 6.1) y
U+0000 (345, revienta en el `::jsonb` antes de todo).

### H3 · La prueba de `esquema_version` como cadena ya no prueba el tipo, solo el valor

`scripts/rls/14-cadena-huellas.sql:296` y su rótulo en `:299`

El sobre dice `"esquema_version":"2"` (cadena) y el rótulo afirma que lo que salta es el **tipo**
(el hallazgo BAJA 10 de T-005: «un cast a smallint la habría colado igual que el número 2»).

**Escenario**: con la columna en 3, ese sobre fallaría igualmente aunque llevara el **número** 2,
porque el valor tampoco coincide. La prueba ya no distingue «cadena en vez de número» de
«número equivocado»: una 6.5 que volviera a `(…->>'esquema_version')::smallint` sin comparar tipos
la dejaría verde igual. Arreglo: `"esquema_version":"3"`.

### H4 · La función replegada pierde las reglas de operación que solo vivían en su cuerpo

`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:44-260`

El `create or replace` copia el cuerpo de T-005 **ejecutable byte a byte** (lo he diffeado
ignorando comentarios: no falta ni sobra una sola sentencia; los únicos cambios son `alcance` en
`v_esperadas`, el `ADR-035/046/057` del mensaje y el bloque 6.10 — esto está **bien**). Lo que sí
se ha caído son unas 90 líneas de comentario del cuerpo, y entre ellas dos que no son prosa
decorativa:

1. La **REGLA para el interbloqueo ABBA**: «firmar N notas de N pacientes distintos en la MISMA
   transacción toma N cerrojos […] REGLA para cualquier código futuro: ordenar las firmas por
   `paciente_id`».
2. La **limitación conocida** de que las comprobaciones 6.x validan valores JSON, **no** que
   `contenido_canonico` sea JCS byte a byte.

**Escenario**: el implementador de T-012 (o de la exportación, o de un importador) hace
`\sf public.fn_sellar_version_nota()` o abre la migración más reciente —que es ahora la única copia
viva del cuerpo— para saber qué garantiza el disparador; no ve la regla, firma varias notas de
varios pacientes en una transacción sin ordenar por `paciente_id`, y dos transacciones concurrentes
se interbloquean en producción con el paciente delante. La lección de T-005 estaba escrita en el
único sitio donde se leía, y este ticket la borra sin moverla a `.claude/rules/` ni a un ADR
(`pipeline.md` §Memoria: una lección es una regla por ruta, una comprobación o un patrón). Arreglo
barato: recuperar esos dos bloques de comentario en el cuerpo nuevo.

### H5 · `docs/architecture.md` sigue describiendo el sobre de once claves y `esquema_version = 2`

`docs/architecture.md:62-64` (la enumeración de lo que se sella) y `docs/architecture.md:91`
(«`esquema_version = 2` desde el ADR-046»)

El destilado que **manda sobre el modelo** (CLAUDE.md: «No abras las fuentes enteras; lee los
destilados» y «si arquitectura e interfaz chocan, gana la arquitectura») dice hoy que se sellan
diez campos sin `alcance` y que la era es la 2. `docs/**` no está en el `territorio:` del contrato,
así que el implementador hizo bien en no tocarlo — pero entonces la regla 2 de la constitución
exige anotarlo en `docs/state.md` §Hallazgos, y la rama no toca `docs/` en absoluto.

**Escenario**: el siguiente ticket que necesite firmar algo (exportación, informe, importador) lee
el destilado como manda CLAUDE.md, construye un sobre de once claves y **todo INSERT muere en la
6.1**; o peor, escribe un verificador o un test de fixtures asumiendo once claves y lo da por bueno
porque el destilado lo respalda. Arreglo: dos frases en `architecture.md` (fuera de este ticket) y,
mientras tanto, la línea en `state.md` §Hallazgos.

---

## BAJA

### H6 · El rótulo de la sección C sigue diciendo «las nueve comprobaciones 6.1-6.9»

`scripts/rls/14-cadena-huellas.sql:168`. La cabecera que documenta qué código lanza cada cosa no se
actualizó a diez, aunque la migración sí lo hizo (`…:112`, «Las diez comprobaciones»). **Escenario**:
quien añada la negativa número diecinueve lee esa cabecera para saber qué códigos son legítimos y
no encuentra la 6.10 en la lista; la prueba nueva acaba con `assert_lanza` genérico o con el código
equivocado.

### H7 · Llamadas posicionales con siete argumentos para llegar a `p_alcance`

`scripts/rls/01-fijacion.sql:126` y `:132`, `scripts/rls/14-cadena-huellas.sql:394` y `:432`
(`sobre_prueba(…, null, null, null, null, false, null, 'conjunta')`). PL/pgSQL admite notación
nombrada (`p_alcance => 'conjunta'`), que es a prueba de desplazamientos.

**Escenario**: el siguiente cambio del sobre añade un parámetro `p_x text` antes de `p_alcance`;
`'conjunta'` cae en `p_x`, el sobre se construye con `alcance:"individual"` y la fila de NCONJ
—cuya columna es `'conjunta'`— muere con 23514 en la 6.10, que es **el fallo que deja de sembrar el
banco entero** y que el propio contrato avisa. Es ruidoso, no silencioso, pero cuesta una tarde
encontrarlo.

### H8 · `p_alcance` se interpola en el JSON sin validar ni escapar

`scripts/rls/00-ayudantes.sql:165`, `supabase/seed-completo.sql:55`,
`scripts/t005-concurrencia.sql:73`: `'"alcance":"' || p_alcance || '",'`.

**Escenario**: alguien escribe la negativa «alcance nulo» como
`sobre_prueba(…, p_alcance => null)` esperando `"alcance":null`; la concatenación con NULL vuelve
**todo el sobre** NULL, `contenido_canonico` es NOT NULL y el INSERT muere con **23502**, no con
23514 — otra prueba verde/roja por el motivo equivocado. (Hoy nadie lo hace; queda como trampa
montada.) Basta `coalesce` + un `check` del valor, o construirlo con `to_json(p_alcance)`.

### H9 · La guarda de era depende de que el runner pare en el primer error

`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:26-37`. El `do $$ … raise exception …
$$;` está **primero** en el fichero y no hay nada antes: correcto, y es el mismo patrón que T-005
(`20260829210000:29-39`). Con `supabase db reset` / `db push` la migración va en su transacción y
un `raise` la deshace entera, así que nada de lo que viene después se aplica.

**Escenario residual**: si alguien aplica el fichero a mano con `psql -f` **sin**
`ON_ERROR_STOP=1`, psql informa del error y sigue: el `create or replace` de doce claves y el
`set default 3` se aplican igual sobre una base **con filas firmadas en era 2**, que es justo lo
que el ADR-035 prohíbe (dos formas vivas sin recalcular). No es una regresión de este ticket —T-005
tiene la misma forma— pero el remedio es una línea: envolver el fichero en `begin; … commit;` o
meter el resto de la migración dentro del mismo bloque `do`.

### H10 · La 6.3 puede salir por un código que no es 23514 (preexistente, no del ticket)

`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:144`:
`if (v_contenido -> 'cuerpo') <> (new.cuerpo::jsonb)`. Los dos lados están garantizados no-NULL
(la clave existe por la 6.1, y `cuerpo` es `not null`), así que **no** hay aquí ninguna trampa de
`NULL <> x`. Pero el `check (jsonb_typeof(cuerpo::jsonb) = 'object')` de la columna se evalúa
*después* de los disparadores BEFORE.

**Escenario**: `authenticated` inserta `cuerpo = 'esto-no-es-json'` con un sobre por lo demás
coherente; el `new.cuerpo::jsonb` de la 6.3 revienta con **22P02** crudo en vez del 23514 de
dominio, igual que pasaba con `abierta_en` antes del `begin/exception` de la 6.8 (hallazgo BAJA 8
de T-005). Se rechaza igual: es forma, no agujero.

---

## Lo que he comprobado y está bien (para que no se revise dos veces)

- **Las diez comprobaciones, una a una, contra la trampa `->>` + `<>`**: ninguna está escrita de la
  forma mala. 6.1 (`array … is distinct from`), 6.2, 6.5, 6.7 y la **6.10 nueva** usan
  `is distinct from` sobre el JSONB completo; 6.9 usa `is [not] distinct from`; las ramas `else` de
  6.4 y 6.6 usan `<>` pero **detrás de un `jsonb_typeof(...) <> 'string'`** que ya descarta el
  `null` JSON, y su lado derecho es no-NULL por la rama del `if`; la 6.8 usa `->>` solo sobre
  valores ya comprobados como `'string'` y dentro de su `begin/exception`; la 6.3, ver H10. El
  `to_jsonb(new.alcance::text)` de la 6.10 es correcto también si la columna fuera NULL: daría SQL
  NULL y cualquier valor del sobre (incluido `'null'::jsonb`) sería `distinct from` él, así que
  salta igual.
- **`v_esperadas`**: doce literales, exactamente los doce del ADR-057 y del diseño §1.1, y en el
  mismo orden que produce `array_agg(k order by k)` tanto en collation C como en ICU
  (`abierta_en < alcance < anotaciones_reservadas < autor_id < …`).
- **`json_object_keys(new.contenido_canonico::json)`**: sigue sobre `::json`, no `::jsonb`
  (línea 126). La negativa de clave duplicada (línea 330) lo mantiene sujeto: trece elementos y
  salta por `is distinct from v_esperadas`.
- **El cuerpo de la función**: diffeado sentencia a sentencia contra el de T-005 ignorando
  comentarios — no falta ni cambia ninguna guarda; lo único nuevo es la 6.10 y `alcance` en
  `v_esperadas`. `security definer` + `set search_path = ''` intactos.
- **El DEFAULT de `esquema_version` a 3: correcto y necesario**, y no deja nada desalineado salvo
  lo que dice H1-H3. Es el mismo movimiento que hizo T-005 (`20260829210000:78`, 1 → 2): sin él, el
  banco y la siembra —que no fijan la columna— sellarían un sobre 3 contra una columna 2 y morirían
  en la 6.5. Comprobado: `supabase/config.toml` siembra `./seed.sql`, que **no** inserta versiones;
  las cinco inserciones de `seed-completo.sql` pasan `3` explícito; `04-baja.sql` y
  `t005-concurrencia.sql` dependen del default y emiten sobres de 3; `lib/huella/firmar.ts:29`
  manda `esquema_version` explícito desde el sobre; `lib/supabase/tipos-bd.ts` no cambia (un DEFAULT
  no altera el tipo generado: `esquema_version?: number` en `Insert`); y
  `npx tsx scripts/lint-migraciones.ts` da las 13 migraciones limpias (`alter column … set default`
  no toca ninguna de sus seis reglas). Los `scripts/t00[124]-*.sql` que aún llevan sobres viejos son
  guiones históricos que ya morían con la guarda 1 de T-005 y no los invoca ningún `npm run`.
- **Vectores congelados**: nueve, los ocho regenerados más `alcance-conjunta`; los nueve con doce
  claves y `esquema_version: 3`; recalculé los nueve `huella_hex` como
  `sha256(utf8(canonico) ‖ 32 ceros)` fuera del repo y los nueve cuadran. **`acentos-nfd` sigue en
  NFD de verdad** (`63 61 66 65 301` en `sobre`, `63 61 66 e9` en `canonico`), así que el criterio 6
  del contrato sigue teniendo dientes; su huella coincide con la de `acentos-nfc`. Los tres
  `$vec$…$vec$` de `14-cadena-huellas.sql` y el `\set VECGENESIS` coinciden con el JSON, y sus tres
  hex son los regenerados.
- **El banco firma por el camino de la aplicación** (lección T-013a): la gemela positiva nueva
  (`14-cadena-huellas.sql:430-434`) inserta solo columnas de aplicación —`nota_id, cuerpo,
  contenido_canonico, alcance, motivo_cambio, autor_id, creada_en`— y deja que el disparador calcule
  `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` y `numero_version`; con `huella` a
  mano habría muerto en la guarda 1. Elige `motivo_cambio` no vacío a propósito para no chocar con
  el `check` de `numero_version > 1`, y lo repite en el sobre para no morir en la 6.6: bien pensado.
  La posición 3 que afirma es correcta — la cadena de P1 solo tiene NCONJ (1) y NIND (2); `NCORR`
  es de P2 y `NVEC`/`NCADX`/`NDEMO` son de pacientes propios— y ningún módulo posterior (15, 16, 17)
  toca `notas_clinicas_versiones`, así que la versión de más no descuadra nada aguas abajo.
- **`01-fijacion.sql`** pasa `'conjunta'` para NCONJ, que es lo que impedía que el banco entero
  dejara de sembrar.
- **Alcance del ticket**: no hay desvío. Los diez ficheros tocados están todos en el `territorio:`
  declarado, `ALGORITMO_VERSION` sigue en 1, no hay ni una línea de interfaz, y el guion de un solo
  uso que regeneró los vectores no está comiteado.
- **Lado TypeScript**: `esquemaSobre` estricto con doce claves, `ESQUEMA_VERSION = 3`, `alcance`
  dentro de `sinNormalizar`, prueba de sensibilidad nueva, y `firmar.ts` manda `alcance` a la
  columna desde la misma `entrada` que alimenta el sobre (no pueden divergir). 70 pruebas verdes.

## Lo que no he podido comprobar (hace falta la base, y no la he tocado)

1. **El orden real de las comprobaciones en H1-H3**. Está deducido del código (la 6.5 se evalúa
   antes que la 6.7/6.8/6.10 y el DEFAULT es 3), pero se cierra con una consulta de dos líneas:
   insertar el sobre de la línea 409 y mirar el **mensaje** del error — si dice «esquema_version del
   sobre no coincide», H1 está confirmado.
2. **Criterio de aceptación 9** (la guarda de era aborta sobre una base con una fila firmada por el
   camino de la aplicación). Nada de la rama lo automatiza; es evidencia manual del verificador.
3. `npm run test:rls`, `npm run verificar:huellas`, `npm run test:huellas` y `npm run build`.
