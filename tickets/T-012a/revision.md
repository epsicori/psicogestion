# T-012a · Revisión de cierre (tercera pasada, sobre las dos anteriores)

**No hay ningún hallazgo ALTA.** *(Reemisión del 18-09-2026, tras el commit `53a4a91`.)*

Dos ALTA han pasado por este ticket y las dos están cerradas. La de los dos revisores anteriores
(las diez comprobaciones 6.x lanzando el mismo 23514) está cerrada **de verdad** —comprobado
abajo, comprobación a comprobación, no leyendo el informe—. La que abrió esta tercera pasada
(**H1**: el commit de arreglo reescribió el `territorio:` de su propio ticket) la cerró el
propietario del contrato revirtiendo la línea, que es lo que pedía el hallazgo; queda su resto
como **M4**, sin ALTA. Detalle en §3.

Leído: memoria del revisor (vacía: no había ninguna entrada para este proyecto),
`git diff main...worktree-agent-a171fd6674526760f` completo (8 commits, 12 ficheros),
`tickets/T-012a-alcance-en-el-sobre.md`, `tickets/T-012/diseno.md` §5 y §6, `docs/decisions/ADR-057.md`,
`CLAUDE.md` + `.claude/rules/pipeline.md`, `tickets/T-012a/revision.md` (ahora en `revision-sql.md`)
y `revision-ts.md`. **No leídos**: `evidencia.json` ni el informe del verificador.
**No se ha tocado la base de datos.** Comprobación ejecutada: recálculo independiente en Node de
los nueve vectores congelados (`sha256(utf8(canonico) || 32 ceros)`, orden de claves y
`esquema_version`) → **9/9 correctos, 12 claves, `alcance` en su sitio, era 3 en los nueve**.

> Nota: el informe del primer revisor estaba en `tickets/T-012a/revision.md` y este fichero lo
> habría borrado. Se ha copiado antes a **`tickets/T-012a/revision-sql.md`**, intacto.

---

## 1 · ¿Está cerrado el ALTA de las dos revisiones anteriores? **Sí.**

El ALTA era: la negativa de `"alcance":null` moría en la 6.5 y la aserción, que solo comparaba el
SQLSTATE, daba «OK» con el rótulo de la 6.10. Verificado sobre el código, no sobre el commit:

1. **El literal y la fila ya no se desalinean.** `scripts/rls/14-cadena-huellas.sql:449-459`: el
   sobre lleva `"esquema_version":3` y el INSERT **lista la columna `esquema_version` con valor 3
   explícito**, sin depender del DEFAULT. Recorrí la fila por las diez comprobaciones de
   `supabase/migrations/20260915130000_alcance_en_el_sobre.sql:166-289`: 6.1 (doce claves, OK),
   6.2 (`autor_id` = PRO1, OK), 6.3 (cuerpo, OK), 6.4 (`null`/`null`, OK), 6.5 (3 = 3, OK), 6.6
   (OK), 6.7 (`creada_en`=`firmada_en`=columna, OK), 6.8 (tipos y `abierta_en <= firmada_en`, OK),
   6.9 (sin cita, `false`/`null`, OK) → **llega a la 6.10 y muere ahí**. No queda ninguna otra
   candidata.
2. **La aserción ya demuestra por dónde falla.** `pg_temp.assert_lanza_codigo_msg`
   (`scripts/rls/00-ayudantes.sql:137-159`) exige el SQLSTATE **y** un fragmento del mensaje, y
   distingue los tres desenlaces (no lanzó / otro código / código correcto desde otra
   comprobación). Cotejé **los seis fragmentos** contra el texto real de cada `raise exception` de
   la migración: `'El autor_id del sobre no coincide'` ↔ 6.2 (:184), `'esquema_version del sobre
   no coincide'` ↔ 6.5 (:215), `'creada_en y firmada_en del sobre deben ser iguales'` ↔ 6.7
   (:238), `'exactamente las claves'` ↔ 6.1 (:177), `'no son un instante ISO-8601 válido'` ↔ 6.8
   (:267), `'El alcance del sobre no coincide'` ↔ 6.10 (:285). Los seis casan; ninguno es
   ambiguo entre dos comprobaciones.
3. **La guarda es sensible de verdad.** Reconstruido a mano el escenario que importa: con la 6.10
   reescrita a la forma prohibida (`(v_contenido->>'alcance') <> new.alcance::text`), la fila de
   `"alcance":null` **no lanza nada** (`->>` da SQL NULL, `NULL <> x` es NULL) y la aserción cae
   por «debía lanzar 23514 y no lanzó nada». La otra negativa de la 6.10 (`conjunta` contra
   columna `individual`, `:418`) seguiría verde bajo esa misma reescritura — por eso hacen falta
   **las dos**, y las dos están.
4. **Efecto colateral bien resuelto.** Las otras siete negativas con sobre literal (6.1 dup, 6.2,
   6.5 ×2, 6.7 ×2, 6.8) también exigen ahora el mensaje, así que las cuatro regresiones del
   hallazgo ALTA de T-005 que se habían quedado inertes (H2 de ambas revisiones) vuelven a
   demostrar lo que dicen: las repasé una a una y cada una fallaría con mensaje distinto —y por
   tanto en ROJO— si se deshiciera su arreglo.

**Criterio de aceptación 8 del contrato: cumplido de verdad.** Y el §5 del diseño («la prueba de
`"alcance":null` debe fallar por la 6.10 y no por otra cosa»): cumplido.

---

## 2 · Estado de los hallazgos que las dos revisiones dejaron abiertos

| Hallazgo | ¿Vivo? | Severidad hoy |
|---|---|---|
| `revision.md` H5 · `docs/architecture.md` en once claves y era 2 | **Sí** | **BAJA** (era MEDIA) |
| `revision.md` H9 · guarda de era sin `begin;/commit;` | **Sí**, sin cambios | **BAJA** |
| `revision.md` H10 · la 6.3 puede salir por 22P02 crudo | **Sí**, sin cambios | **BAJA** |
| `revision-ts.md` H4 · `verificar_cadena_huellas()` no coteja `alcance` | **Sí** | **MEDIA** |

- **H5 baja de MEDIA a BAJA**: el texto de `docs/architecture.md:62-64,91` sigue describiendo el
  sobre viejo, pero la rama ha hecho lo que exige la regla 2 de la constitución — lo ha anotado en
  `docs/state.md` §Hallazgos (`docs/state.md:74-77`). Queda el riesgo del destilado desactualizado,
  no el incumplimiento.
- **H9 y H10** están exactamente igual que en la revisión anterior; no son regresiones de este
  ticket y no los toca ningún commit. Se reproducen abajo con su escenario para que no se pierdan.
- **H4-TS sigue en MEDIA y es el hallazgo abierto que más pesa**: detalle en M1.

---

## 3 · ALTA: ninguna. H1 cerrada por revert

### H1 · El commit de arreglo reescribió el `territorio:` de su propio ticket — **CERRADA**

`tickets/T-012a-alcance-en-el-sobre.md:13` · abierta en `29bec7e` · **cerrada en `53a4a91`**

El hallazgo era: el commit que arreglaba los demás hallazgos se añadió a sí mismo
`- lib/huella/vectores.test.ts` en el bloque `territorio:` de su propio contrato, cuando
`.claude/rules/pipeline.md` §Territorio dice que `tickets/**` es de «**nadie automático: el
usuario y el arquitecto**».

**Cierre verificado sobre el árbol, no sobre el informe**: `53a4a91` («Devuelve el contrato de
T-012a a su dueño») borra esa línea —un fichero, una línea, ninguna otra— y
`git diff main worktree-agent-a171fd6674526760f -- tickets/T-012a-alcance-en-el-sobre.md` **sale
vacío**: el contrato es byte a byte el de `main`. Comprobado además que la rama ya **no toca
ningún fichero de gobierno**: `git diff --name-status main...worktree-agent-a171fd6674526760f --
'tickets/**' '.claude/**' CLAUDE.md AGENTS.md 'docs/decisions*'` no devuelve nada. El propietario
eligió revertir en vez de ratificar, que es exactamente el cierre que pedía el hallazgo.

**Corrección al escenario que escribí.** Verificando el cierre apareció que `territorio.mjs` no
reconocía el id `T-012a` (lo pasaba a `T-012A`) y que su parser solo leía `territorio: [a, b]` en
línea, no la lista de bloque que usan los contratos de este proyecto. Es decir: la comprobación de
carril **no daba verde por una entrada reescrita — nunca llegaba a correr**. El fallo era peor que
el que describí, y la ampliación del `territorio:` no lo causaba: lo habría tapado en cuanto la
herramienta funcionase. Ya está arreglada y ahora señala `lib/huella/vectores.test.ts`, que es el
estado honesto. Es la misma familia que la trampa ya anotada para `ticket.mjs`/`fase.mjs`: **los
gates de este proyecto no ven los tickets con sufijo de letra**, y un gate que no corre es
indistinguible de un gate en verde.

**Resto abierto**: la rama sigue modificando un fichero que el contrato no declara. Ya no es ALTA
—no hay ningún gate neutralizado por el código que audita, y quien decide es el propietario— pero
tampoco está resuelto: va como **M4**.

---

## MEDIA

### M1 · `verificar_cadena_huellas()` no coteja `alcance`: el ADR-057 promete una detección que no existe

`supabase/migrations/20260829210000_cadena_de_huellas.sql:515-596` (sin cambios en esta rama);
`docs/decisions/ADR-057.md` §Consecuencias

El ADR que este ticket implementa afirma: «**Cambiar quién puede leer una nota pasa a ser
detectable.** Un `alcance` alterado por debajo rompe la huella de esa versión y el verificador lo
señala». Leí el cuerpo del verificador: recalcula
`sha256(convert_to(contenido_canonico,'UTF8') || huella_anterior)` y **no compara ni una columna
del contenido con el sobre**. La 6.10 solo corre `before insert`.

**Escenario de fallo**: alguien con `postgres` ejecuta
`alter table public.notas_clinicas_versiones disable trigger impedir_modificacion_notas_clinicas_versiones;`
y luego `update public.notas_clinicas_versiones set alcance = 'conjunta' where id = …;` — el
banco de RLS demuestra que ese camino existe y funciona (`scripts/rls/14-cadena-huellas.sql:598-608`
lo hace para `contenido_canonico`). El `contenido_canonico` no se toca, la huella sigue cuadrando
y `npm run verificar:huellas` devuelve **cadena sana**. La política
`notas_clinicas_versiones_lectura` lee **la columna**, no el sobre: la nota individual queda
abierta a todos los profesionales del episodio y nada lo señala. Es, palabra por palabra, el
adversario que el propio ADR nombra («ese es exactamente el adversario para el que existe una
cadena de huellas»).

**No es regresión** (antes `alcance` no estaba sellado en absoluto), **no está en el contrato** y
**está anotado** en `docs/state.md`. Pero la consecuencia escrita en un ADR **aceptado** es falsa
hoy, y los ADR se añaden y no se editan: o entra un motivo `sobre_no_coincide_con_fila` en el
verificador, o hace falta un ADR que corrija la frase. Decidirlo **antes de T-012**, que es quien
mete la primera firma real.

### M2 · La exigencia de mensaje cubre 9 de las 15 negativas del bloque 6.x; en las otras 6 el invariante es prosa

`scripts/rls/14-cadena-huellas.sql:201-284` (las seis negativas construidas con
`pg_temp.sobre_prueba()`) y la justificación en `:181-187`

El arreglo es correcto pero está aplicado a medias: las negativas de 6.1 (clave de más), 6.2
(autor ajeno), 6.4, 6.6, 6.7 y 6.9 siguen con `assert_lanza_codigo`, apoyadas en un argumento
escrito en un comentario — «ahí el sobre es coherente por construcción salvo en el único campo
que la prueba altera, así que no hay dos candidatas»— que **nada comprueba**. Es el mismo
razonamiento que sostenía la negativa de `"alcance":null` antes de este ticket.

**Escenario de fallo**: T-012 (corte A) añade a la 6.8 una comprobación nueva del bloque de sesión
—por ejemplo, exigir `margen_sesion_minutos` no nulo cuando `redactada_en_sesion` es `true`—. La
fila de la negativa de la 6.9 (`:262`, `sobre_prueba(…, p_redactada_en_sesion => true)` con
`cita_id` nulo y margen nulo) pasa a morir en esa comprobación nueva, dentro de la 6.8, con el
mismo 23514. `npm run test:rls` sigue verde con el rótulo «comprobación 6.9» y **la 6.9 deja de
estar probada** sin que nadie se entere: si mañana se rompe la coherencia «sin cita, ni margen ni
en sesión», el banco no lo dice. Añadir el fragmento a las seis cuesta seis líneas y no puede
poner en rojo ninguna prueba que hoy sea correcta.

### M3 · No hay `docs/bitacora/T-012a.md`: la única copia del porqué está en dos mensajes de commit

`docs/bitacora/` (la rama no añade ningún fichero ahí; `git diff --name-status main...` lo
confirma)

La regla 4 de `CLAUDE.md` pide, al acabar, «la bitácora del ticket en `docs/bitacora/`, y
`state.md` reescrito». `state.md` está reescrito y al día; la bitácora no existe, y los tickets
comparables (`T-013a`, `T-029`) sí la tienen.

**Escenario de fallo**: se mergea. `docs/state.md` está capado a 80 líneas por un hook y ya ha
soltado la línea de T-012a que había en §Bloqueos. Tres semanas después, el implementador de una
exportación necesita saber por qué `esquema_version` saltó de 2 a 3 sin pasar por la 2, por qué
existe `assert_lanza_codigo_msg` y por qué el generador de sobres del banco tiene un `p_alcance`
al final de la lista de parámetros; busca en `docs/bitacora/` como manda la regla 4, no encuentra
nada, y reescribe una de las dos decisiones a ojo. La razón vive solo en los mensajes de `29bec7e`
y `732a9e3`, que es precisamente el sitio donde la constitución dice que **no** debe vivir.

---

### M4 · El `territorio:` del contrato declara los vectores congelados pero no la prueba que los enumera

`tickets/T-012a-alcance-en-el-sobre.md:10-18` (contrato, hoy igual que en `main`) ·
`lib/huella/vectores.test.ts:34-57` (fichero modificado por la rama)

El contrato declara `lib/huella/vectores-congelados.json` pero no `lib/huella/vectores.test.ts`, y
esa prueba **enumera los vectores por nombre** (`expect(...map(v => v.nombre).sort()).toEqual([...])`).
Añadir el noveno vector sin tocarla es imposible: la lista de nombres pone la suite en rojo. El
territorio declarado es, por tanto, inconsistente consigo mismo, y el resto de H1 es este: la línea
que faltaba sigue faltando, solo que ahora se ve.

**Escenario de fallo** (entrada → efecto): se ejecuta `node ~/.claude/pipeline/territorio.mjs T-012a`
en el gate de merge —ya arreglado, ya capaz de leer la lista de bloque y el id con letra— y sale en
rojo señalando `lib/huella/vectores.test.ts` como escritura fuera de lo declarado. El merge queda
bloqueado por un fichero cuyo cambio es correcto y necesario, y la rama **no puede desbloquearse a
sí misma** sin reincidir en H1. Sale solo por la mano del propietario del contrato: añadir esa línea
al `territorio:` (o aceptar la excepción por escrito). Segundo efecto, más largo: si se mergea
ignorando el rojo, el contrato deja de describir lo que la rama tocó y la próxima auditoría de «quién
escribe dónde» parte de una lista falsa.

**Nota del mismo paquete, sin severidad propia**: `docs/state.md` tampoco está en el `territorio:` y
también se escribe; ahí no hay violación —la regla 4 de `CLAUDE.md` lo *exige* y `docs/**` es
territorio de la fábrica—, lo que hay es el mismo `territorio:` incompleto. Se arregla por el mismo
sitio y por la misma mano.

---

## BAJA

### B1 · `docs/architecture.md` sigue describiendo el sobre de once claves y `esquema_version = 2`

`docs/architecture.md:62-64` y `:91` (anotado en `docs/state.md:74-76`; fuera del `territorio:`).
**Escenario**: el siguiente ticket que necesite firmar algo lee el destilado, como manda
`CLAUDE.md` («no abras las fuentes enteras; lee los destilados»), construye un sobre de once
claves y todo INSERT muere en la 6.1 — o, peor, escribe un fixture asumiendo once claves y lo da
por bueno porque el destilado lo respalda. Bien escalado por la rama; queda pendiente de otro
ticket.

### B2 · La guarda de era depende de que el runner pare en el primer error

`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:26-37`. El `do $$ … raise exception $$;`
es lo primero del fichero y no hay nada antes: con `supabase db reset` / `db push` la migración va
en su transacción y el `raise` la deshace entera. **Escenario residual**: alguien aplica el fichero
a mano con `psql -f` **sin** `ON_ERROR_STOP=1`; psql informa del error y sigue, y el
`create or replace` de doce claves y el `set default 3` se aplican igual sobre una base **con filas
firmadas en era 2** — dos formas vivas sin recalcular, justo lo que el ADR-035 prohíbe. No es
regresión: T-005 tiene la misma forma (`20260829210000:29-39`).

### B3 · La 6.3 puede salir por un código que no es 23514

`supabase/migrations/20260915130000_alcance_en_el_sobre.sql:188`:
`if (v_contenido -> 'cuerpo') <> (new.cuerpo::jsonb)`. Los dos lados son no-NULL, así que aquí no
hay trampa de `NULL <> x`; pero el `check (jsonb_typeof(cuerpo::jsonb) = 'object')` de la columna
se evalúa **después** de los disparadores BEFORE. **Escenario**: `authenticated` inserta
`cuerpo = 'esto-no-es-json'` con un sobre por lo demás coherente; el `new.cuerpo::jsonb` revienta
con **22P02** crudo en vez del 23514 de dominio, igual que pasaba con `abierta_en` antes del
`begin/exception` de la 6.8. Se rechaza igual: es forma, no agujero. Preexistente.

### B4 · `assert_lanza_codigo_msg` se degrada en silencio a `assert_lanza_codigo` si el fragmento es NULL

`scripts/rls/00-ayudantes.sql:150` — `if position(fragmento in sqlerrm) = 0 then`. Con
`fragmento` NULL, `position()` devuelve NULL, `NULL = 0` es NULL, el `if` es falso y **la
comprobación del mensaje no se hace**; la aserción da «OK» comprobando solo el código. Lo mismo
con `codigo` NULL en `:147` (`sqlstate <> null` es NULL). **Escenario**: alguien añade la negativa
número diecinueve, pasa el fragmento desde una variable que resulta NULL (o deja un `null` de
sitio mientras la redacta) y la prueba queda con la misma cobertura que tenía antes de este ticket,
en verde y sin aviso. Un `if fragmento is null or position(...) = 0` lo cierra.

### B5 · `t005_sobre_prueba` cambia de aridad con `create or replace`, sin borrar la sobrecarga vieja

`scripts/t005-concurrencia.sql:63-67` y `:184`. La función pasa de `(uuid, timestamptz, jsonb)` a
`(uuid, timestamptz, jsonb, text default 'individual')`: eso **no reemplaza** la vieja, crea una
sobrecarga; el `drop` del final solo borra la de cuatro argumentos. **Escenario**: una ejecución
anterior del guion viejo se cortó antes de su `drop` y dejó la función de tres argumentos en
`public`; se corre `npm run test:huellas` con el guion nuevo sin `db reset` de por medio (el guion
es explícitamente no idempotente); las llamadas pasan tres argumentos, Postgres prefiere la
coincidencia exacta y usa **la función vieja**, que emite un sobre de once claves con
`"esquema_version":2`; el INSERT muere en la 6.1 y la prueba de concurrencia falla con un error de
claves que no tiene nada que ver con lo que mide. Un
`drop function if exists public.t005_sobre_prueba(uuid, timestamptz, jsonb);` al principio lo evita.

### B6 · La llamada posicional a `pg_temp.sobre()` del seed reintroduce lo que se corrigió en el banco

`supabase/seed-completo.sql:398-400`: `pg_temp.sobre(…, null, null, 'conjunta')`, mientras que
`scripts/rls/01-fijacion.sql:126` y `:133` sí usan notación nombrada (`p_alcance => …`) tras la
revisión anterior. **Escenario**: el siguiente cambio del sobre añade un parámetro (`p_cita_id`,
por ejemplo) antes de `p_alcance`; `'conjunta'` cae en el parámetro nuevo, la nota de pareja se
siembra con un sobre que dice `individual` contra una columna `conjunta`, la 6.10 la rechaza con
23514 y **`npm run seed` se cae entero**. Es ruidoso, no silencioso, pero es exactamente el fallo
que la revisión anterior describió y que se arregló solo en uno de los dos ficheros.

---

## Lo que comprobé y está bien (para que no se revise una cuarta vez)

- **Los nueve vectores congelados**, recalculados con Node desde el `canonico` guardado: las nueve
  huellas cuadran, los nueve tienen **doce claves en orden JCS** con `alcance` en el índice 1
  (entre `abierta_en` y `anotaciones_reservadas`) y `esquema_version: 3` tanto en `sobre` como en
  `canonico`; el noveno (`alcance-conjunta`) lleva `"conjunta"` en los dos sitios.
- **El orden de `v_esperadas`** (`…:53-57`) coincide con `array_agg(k order by k)` bajo cualquier
  colación razonable: `alcance` cae entre `abierta_en` y `anotaciones_reservadas` tanto por
  unidades UTF-16 (JCS) como por `C` y por `en_US.UTF-8`.
- **`ALGORITMO_VERSION` sigue en 1** (`lib/huella/sobre.ts:27`) y `esquemaSobre` sigue `.strict()`.
- **`construirSobre()` toma `alcance` de la entrada** y `sobre.test.ts:129-132` lo ata con una
  aserción que se pone roja si se sustituye por un literal.
- **Las tres copias del generador de sobres** suben a doce claves y `esquema_version: 3`, y las
  tres interpolan `alcance` con `to_json()`/`coalesce` (no por concatenación cruda).
- **Nada en el diff modifica ni borra contenido clínico**: la migración solo hace
  `create or replace function`, `alter column … set default 3` y `comment on column`. Los dos
  `update` sobre `notas_clinicas_versiones` del banco (`:598` y siguientes) son los preexistentes
  de la sección D, dentro de `disable trigger` → `enable trigger` → `revoke`, y la transacción del
  banco entero termina en `rollback`.
- **La gemela positiva de la 6.10 existe y encadena de verdad** (`…:473-487`): un sobre `conjunta`
  coherente con la columna se sella en la posición 3 de la cadena de P1, con `motivo_cambio` en
  columna y sobre para que no la rechace la 6.6.
- **Ningún módulo posterior del banco (15, 16, 17) toca `notas_clinicas_versiones`**, así que la
  versión nueva que la gemela positiva añade a NCONJ no contamina el estado de ningún módulo que
  venga después.
- **`vectores-sql.test.ts`** sigue cerrando el lazo SQL→JSON por huella, y los cuatro literales
  `$vec$` del banco y el `\set VECGENESIS` se regeneraron a la vez que el JSON.
