## Revisión con Opus · primera pasada, 30-08-2026 — NO pasó el gate

Un hallazgo ALTA (bloqueante) y trece MEDIA/BAJA. Arreglados todos el mismo día, cada uno
con reproducción del fallo original y prueba de que ya no ocurre. **`estado` se queda en
`en_curso`**: no se cierra a `hecho` hasta una segunda pasada de revisión.

**ALTA — tres comprobaciones del disparador se saltaban con `null` JSON** (6.2 autor_id,
6.5 esquema_version, 6.7 creada_en/firmada_en, y el orden de 6.8). `->>` da SQL `NULL`
ante un `null` JSON, y `NULL <> x` es `NULL` — falso en un `if`. Reproducido: un sobre con
`"autor_id":null` se sellaba (`huella is not null` → `t`). Arreglado con
`(v_contenido -> 'campo') is distinct from to_jsonb(new.columna)` en las cuatro.
Reproducido de nuevo: las cuatro variantes nulas lanzan; un sobre válido sigue sellándose.

**MEDIA, las ocho:**
1. `normalizarNfc()` vaciaba `Date`/`Map` en `{}` en silencio antes de que `jcs.ts`
   pudiera rechazarlos. Arreglado con el guarda de objeto plano dentro de `nfc.ts`.
2. U+0000 no se puede insertar de verdad (`22P05` al castear a `jsonb`): documentado como
   limitación real, no como «no es un problema», en la columna y en la nota de corrección
   más arriba (§2).
3. `scripts/t005-concurrencia.sql` no podía fallar nunca (sin `raise`). Reescrito con
   `do $$ … raise exception … $$` y una tabla `t005_resultado` real para el resultado de
   la segunda conexión.
4. `fn_vaciar_borrador_al_firmar()` generaba auditoría espuria: `and borrador_contenido is
   not null` en el `where`.
5. `--paciente` de `verificar-huellas.mjs` sin validar, interpolado en SQL de
   superusuario: validado contra el mismo patrón UUID de `sobre.ts` antes de interpolar.
6. Evidencia declarada (negativas de `anotaciones_reservadas`/`motivo_cambio`) que no
   existía en el banco: añadidas en `scripts/rls/13-cadena-huellas.sql` §C.
7. `posicion_cadena` filtra cuántas versiones ajenas hay en la cadena: aceptado y
   documentado en `docs/architecture.md` §Roles («Fuga documentada»), no es un bug.
8. (El límite de interbloqueo con múltiples firmas por transacción — ver BAJA/operativo
   más abajo, agrupado con el hallazgo 5 de disparador por ser el mismo mecanismo.)

**BAJA, las cuatro** (arregladas, no solo anotadas): tipo de `esquema_version` no
comprobado (subsumido en el arreglo ALTA), precisión de milisegundo de `to_char('MS')`
documentada, la negativa del criterio 9 pasó a `assert_lanza_codigo('23505')`, la
comprobación ADR-031 pasó a comparar huellas reales byte a byte (antes solo comparaba
recuentos), y se colapsaron los saltos de línea duplicados de `13-cadena-huellas.sql`
(519 → 413 líneas).

**Evidencia de conjunto tras los arreglos**: `npx supabase db reset` limpio; `npm run
lint` y `npm run lint:migraciones` limpios; `npx vitest run` → 295 pruebas, 31 ficheros,
todas en verde; `npm run test:rls` → exit 0, 178 aserciones `OK`, cero `ASERCIÓN
FALLIDA`; `npm run test:huellas` → exit 0. Cada arreglo se probó además de forma aislada:
inyectando la condición contraria a propósito y comprobando que la prueba correspondiente
SÍ falla (exit distinto de cero, mensaje exacto), y que revertida vuelve a pasar — para
las dos pruebas (`t005-concurrencia.sql`, la comparación ADR-031) donde antes esto no era
cierto.

**Landmine del entorno, pagado tres veces esta sesión**: escribir la secuencia de seis
caracteres que representa el escape Unicode de un carácter nulo dentro de una cadena, vía
las herramientas de edición, puede grabar un byte NUL crudo en el fichero en vez de esos
seis caracteres ASCII. Rompió `db reset` una vez (`invalid message format`, SQLSTATE
`08P01`) al documentar precisamente ese hallazgo en la migración. Detalle completo y el
comando de comprobación en `docs/state.md`.

## Revisión con Opus · segunda pasada, 30-08-2026 — el hallazgo ALTA original quedó
## cerrado de verdad; 5 MEDIA nuevos y 4 BAJA nuevos, no encontrados en la primera vuelta

El revisor no se fió del informe de la primera vuelta y verificó todo a mano contra la
base. Confirmó que el hallazgo ALTA original (comprobaciones que se saltaban con `null`
JSON) está cerrado de verdad. Encontró cinco MEDIA y cuatro BAJA que la primera vuelta no
vio, el más serio de todos entre ellos (MEDIA-3). Arreglados todos con la misma
disciplina: reproducción del fallo, arreglo, reproducción de que ya no ocurre.

**MEDIA-3 (el más serio de los nueve nuevos) — `jsonb_object_keys()` deduplica claves
repetidas: un sobre con `autor_id` dos veces (una falsa, una real) se sellaba igual.**
Reproducido contra la base: un `insert` con `"autor_id":"2222…","autor_id":"1111…"` en el
texto de `contenido_canonico` se aceptó y selló (`huella is not null` → `t`) antes del
arreglo. RFC 8785 prohíbe claves duplicadas, y la columna «ES el JSON canónico»: sellar un
documento con una clave repetida es sellar bytes que la base nunca validó de verdad.
Arreglado cambiando `jsonb_object_keys(contenido_canonico::jsonb)` por
`json_object_keys(contenido_canonico::json)` en la comprobación 6.1 — `json` SÍ conserva
los duplicados al enumerar, así que un sobre con doce pares (uno repetido) da un array de
doce elementos que no coincide con las once claves esperadas. Reproducido de nuevo: el
mismo `insert` ahora lanza `contenido_canonico debe ser un sobre con exactamente las
claves […]` (23514). Negativa añadida en `scripts/rls/13-cadena-huellas.sql` §C.

**MEDIA-1 — las 8 (ahora 15) negativas de §C daban verde aunque se vaciara el disparador
entero, o chocaran con una restricción ajena.** Reproducido exactamente como describió el
revisor: con `sellar_version_nota` desactivado, mandar `huella` a mano lanzaba igual
`23502 null value in column "numero_version"` (NOT NULL de una columna que el disparador
rellenaría), no por la lógica que la prueba decía ejercitar; y la primera negativa mandaba
`decode(repeat('00',64),'hex')` (64 bytes, no 32), un motivo más ajeno todavía. Arreglado:
las 15 negativas pasaron a `pg_temp.assert_lanza_codigo` con el código exacto que de
verdad lanza `fn_sellar_version_nota()` (`42501` para la guarda 1 — huella/
huella_anterior/paciente_id/posicion_cadena/numero_version a mano —, `23514` para las
comprobaciones de coherencia, `22P05` para U+0000), se corrigió el tamaño de `huella` a 32
bytes, y se añadieron DOS demostraciones nuevas con el disparador desactivado: (D1)
mandar `huella` a mano ahora sí cambia de código, de `42501` a `23502` — reproducido y
confirmado; (D2) un sobre con `autor_id` mal formado, con TODAS las columnas rellenadas a
mano, **entra sin lanzar nada** — reproducido y confirmado, prueba de que la coherencia
6.2 vive solo en el disparador.

**MEDIA-2 — ninguna prueba cubría el arreglo ALTA con `null` JSON real; era el hueco que
dejó pasar el hallazgo original en la primera vuelta.** Añadidas cinco negativas
explícitas en §C: `autor_id`, `esquema_version`, `creada_en`, `firmada_en` con `null`
JSON, y `esquema_version` como cadena `"2"`. Las cinco lanzan `23514` tras el arreglo;
antes del arreglo (comprobado a mano, deshaciendo `is distinct from` de vuelta a
`->>`/`<>` en una copia de trabajo) las mismas cinco NO lanzaban — es la prueba de
regresión que el revisor pedía.

**MEDIA-4 — `normalizarNfc()` perdía en silencio una clave `__proto__`.** Reproducido en
Node: `resultado['__proto__'] = 'secreto'` sobre un objeto literal normal es un no-op
(reasigna el prototipo en vez de crear una propiedad), y `Object.keys()` del resultado
perdía la clave. Arreglado usando `Object.create(null)` en vez de `{}` para el objeto de
recorrido: un objeto sin prototipo no tiene el `setter` de `__proto__` heredado de
`Object.prototype`, así que la asignación es una propiedad propia normal. Reproducido de
nuevo con valor primitivo y con valor objeto: las dos conservan la clave. Dos pruebas
nuevas en `nfc.test.ts`.

**MEDIA-5 — la «prueba explícita» de U+0000 que el ticket decía tener no existía en
ningún fichero, solo en prosa.** Añadida de verdad en `scripts/rls/13-cadena-huellas.sql`
§C: un sobre con el escape de U+0000 en `cuerpo`, insertado por el disparador real, lanza
`22P05` (verificado antes de escribir la prueba, con el mismo `insert` a mano). La prueba
queda sujeta, no solo documentada.

**BAJA 6 — el disparador acepta un `contenido_canonico` que no es JCS de verdad (espacios
de más, claves reordenadas).** Documentado explícitamente como limitación conocida y
aceptada en el comentario del paso 6 de la migración, con la razón de por qué no se
corrige (reimplementar JCS en PL/pgSQL sería la segunda implementación que el ADR-035
quiere evitar) y por qué no importa para el invariante que sí cuenta (el verificador lee
bytes, nunca deriva).

**BAJA 7 — el diseño del ticket seguía afirmando «no hay ciclo posible» sin la salvedad
que la migración ya reconocía.** Añadida una nota de corrección justo debajo del párrafo
original (§7 del diseño aprobado) que remite al comentario del paso 3 de la migración
como fuente única de la limitación completa, en vez de repetirla con riesgo de que las dos
copias diverjan.

**BAJA 8 — `abierta_en` con texto que no es una fecha daba el error crudo de Postgres
(`22007`) en vez de un mensaje de dominio.** Reproducido: un sobre con
`"abierta_en":"basura-no-es-fecha"` reventaba con `invalid input syntax for type
timestamp with time zone`, sin `errcode` `23514` ni mensaje en castellano. Arreglado
envolviendo el cast en un `begin/exception … when invalid_datetime_format …`. Reproducido
de nuevo: el mismo sobre ahora lanza `abierta_en o firmada_en del sobre no son un instante
ISO-8601 válido (ADR-046)` con `23514`. Negativa añadida en §C.

**BAJA 9 — ninguna prueba metía un sobre REAL de TypeScript por el disparador; todo pasaba
por `pg_temp.sobre_prueba()`, deliberadamente no canónico.** Añadida una prueba de
integración en `scripts/rls/13-cadena-huellas.sql`: el vector congelado `genesis-minimo`
de `lib/huella/vectores-congelados.json`, con su texto EXACTO, insertado tal cual como
`contenido_canonico` a través del disparador real — y se comprueba que la huella
resultante coincide byte a byte con la que TypeScript y pgcrypto ya predicen, y que
`contenido_canonico` se guarda sin reformatear nada.

**Evidencia de conjunto tras esta tercera vuelta**: `npx supabase db reset` limpio; `npm
run lint` y `npm run lint:migraciones` limpios; `npx vitest run` → **297 pruebas**, 31
ficheros, todas en verde (+2 sobre la vuelta anterior: las de `__proto__`); `npm run
test:rls` → exit 0, **190 aserciones `OK`** (+12 sobre la vuelta anterior: las quince
negativas de §C, la integración del vector real y las dos demostraciones con el
disparador desactivado), cero `ASERCIÓN FALLIDA`; `npm run test:huellas` → exit 0; `npm
run build` → compila y tipa limpio, sin avisos `blocking-prerender-*`.

**Nota operativa de esta sesión, sin relación con el código**: el entorno Docker local
sufrió inestabilidad real durante esta vuelta (el contenedor `supabase_vector_Psicogestion`
entró en un bucle de reinicio, y un `db reset` llegó a fallar con
`LegacyDbSetupError: error running container: exit 1`). Se resolvió con `npx supabase
stop` seguido de `npx supabase start` y comprobando la existencia del disparador
`sellar_version_nota` (`select tgname from pg_trigger where tgrelid =
'public.notas_clinicas_versiones'::regclass`) antes de dar cada `db reset` por bueno —
dos veces el CLI imprimió «Finished… Reset local database» con el disparador todavía sin
crear, porque «Restarting containers…» tarda más de lo que el mensaje sugiere. Ningún
arreglo de código causó esto; queda anotado para que el próximo agente no lo confunda con
una regresión.

## Revisión con Opus · tercera pasada, 06-09-2026 — 1 MEDIA arreglado, 1 anotado para una persona, y pasa el gate

Se revisó el mecanismo entero de nuevo —migración, `lib/huella/`, el verificador y el
banco de pruebas— buscando lo que las dos vueltas anteriores no habían mirado: **qué
columnas de la fila puede elegir el llamante y qué efecto tienen sobre la verificación.**
Las dos vueltas anteriores habían mirado el sobre; esta ha mirado las columnas de
alrededor.

### MEDIA · `algoritmo_version` la elegía quien firma, y saca la fila del verificador

`algoritmo_version` es `not null default 1` desde T-001, y el privilegio de esta tabla es
de **tabla entera** —`grant select, insert on table public.notas_clinicas_versiones to
authenticated`, sin lista de columnas—, así que **cualquier profesional podía mandar
`algoritmo_version = 2` en el propio `INSERT`**. La guarda 1 rechaza `huella`,
`huella_anterior`, `paciente_id`, `posicion_cadena` y `numero_version`, pero no esta.

Y esta importa, porque `verificar_cadena_huellas()` clasifica **toda** fila con
`algoritmo_version <> 1` como `era_desconocida` y **no le comprueba nada**: ni el digest
(`huella_no_coincide`), ni el génesis, ni el hueco de posición, ni el encadenado — las
cinco ramas del verificador salvo la primera filtran por `algoritmo_version = 1`. Una
versión marcada como de otra era es un **punto ciego permanente del verificador, elegido
por quien firma**.

No era silencioso —el verificador emite su fila `era_desconocida`, así que «cadena sana =
cero filas» seguía fallando y un operador lo vería—, y por eso es MEDIA y no ALTA. Pero el
propio ticket dice que **cambiar de algoritmo abre una era nueva**, y eso es una decisión
de operación que toma una migración, no un campo que el cliente rellena.

**Arreglo**: guarda **1.bis** en `fn_sellar_version_nota()` —`if new.algoritmo_version is
distinct from 1 then raise ... errcode 42501`—. No es un `check` de tabla a propósito:
cuando llegue la era 2, la migración que la abra sube esa constante, y un `check` sobre
las filas viejas lo impediría.

**Reproducción del fallo, arreglo y reproducción de que ya no ocurre** (misma disciplina
que las dos vueltas anteriores):

```
# 1 · Con la guarda 1.bis DESACTIVADA (`if false then`), db reset + npm run test:rls:
psql:<stdin>:1759: ERROR:  ASERCIÓN FALLIDA (debía lanzar 42501 y no lanzó nada):
  Mandar algoritmo_version = 2 en el INSERT lanza 42501 (guarda 1.bis: la era la abre
  una migración, no quien firma)
EXIT_TEST=3

# 2 · Con la guarda restaurada, db reset + npm run test:rls:
psql:<stdin>:1759: NOTICE:  OK (lanzó 42501 como se esperaba): Mandar algoritmo_version = 2
  en el INSERT lanza 42501 (guarda 1.bis: la era la abre una migración, no quien firma)
psql:<stdin>:1766: NOTICE:  OK: GEMELA POSITIVA: NCADX sigue sin versiones tras las
  dieciséis negativas
psql:<stdin>:1863: NOTICE:  OK: GEMELA POSITIVA: un INSERT con algoritmo_version = 1
  explícito entra y queda en la era vigente
```

La primera salida es la prueba de que **el fallo era real** —sin la guarda, el `INSERT`
con `algoritmo_version = 2` entra sin lanzar nada— y de que **la prueba nueva no estaría
verde por el motivo equivocado**. La gemela positiva de la línea 1863 es la que impide el
otro error posible: una guarda que prohibiera mandar la columna *siempre* también pondría
verde la negativa, y sería otra cosa.

### Anotado, no arreglado · `alcance` decide quién lee una versión y no entra en el sobre

`notas_clinicas_versiones.alcance` es el campo del que cuelga la rama de participación de
`notas_clinicas_versiones_lectura` (`alcance = 'conjunta'` abre la versión a los
profesionales del episodio) y **no está entre las once claves del sobre**: cambiarlo no
rompe la cadena y el verificador da la cadena por sana. Sellar `autor_id` —quién la
escribió— y no sellar `alcance` —quién puede leerla— es una asimetría que conviene mirar.

**No se toca aquí**: la forma del sobre la fija el ADR-035/046 y eso es decisión de una
persona, no de un agente (constitución, regla 2). Queda en `docs/state.md` §Hallazgos
anotados con su porqué y su reloj: **hoy cuesta media tarde porque la tabla está vacía en
todas las bases; después de la primera firma real cuesta `esquema_version = 3` y dos
formas de sobre para siempre.**

### Evidencia de esta vuelta

```
npx supabase db reset      → aplica las 7 migraciones, limpio
npm run test:rls           → exit 0, 192 aserciones OK, cero ASERCIÓN FALLIDA (13 módulos)
npm run test:huellas       → exit 0 — «dos firmas concurrentes NO comparten huella_anterior
                             (posiciones 1 y 2, cerrojo real)» y «verificar_cadena_huellas()
                             sobre la cadena concurrente da cero roturas»
npm run verificar:huellas  → «cadena íntegra: cero anomalías»
npm run lint:migraciones   → «7 migración(es) limpias»
npm test                   → exit 0
npm run lint               → sin una sola línea de salida
npm run build              → «✓ Compiled successfully in 3.5s», sin avisos
                             blocking-prerender-* (ADR-043)
```

**El ticket pasa el gate.** `estado: hecho`. Lo que queda no es del ticket: la rama la
integra una persona (`CARRILES.md` §Integración), y la decisión sobre `alcance` en el sobre
está anotada para ti, no pendiente para un agente.
