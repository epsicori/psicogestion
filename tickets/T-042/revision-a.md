**Sin hallazgos ALTA.** Revisor A (base, seguridad y guiones), T-042, ronda 1: 0 ALTA, 1 MEDIA, 3 BAJA.

Diff revisado: `main...worktree-agent-a9f0330c3f05f9a94` (HEAD 8693cf1). Mi parte: la migración
`supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql`, `scripts/rls/**` (el banco 24 y los
ayudantes `pg_temp`) y `scripts/t042-oraculo.mjs`. Todas las mediciones se hicieron en la base local,
dentro de `begin … rollback`, con `max(version) = 20261009120000`.

## Lo pedido, punto por punto (sin hallazgo)

- **PIN nulo y vacío.**
  - Medido: `comprobar_pin_historia(null)` y `('')` cuentan como fallo, y el paso dos da `pin_incorrecto` con `historia_desbloqueada() = f`.
  - Una cadena de 1 MB no lanza ningún error. `'111111'` seguido de 100 caracteres basura cuenta como fallo.
  - Con `intentos_fallidos = 100` y un PIN malo, el contador se queda en 100 y bloquea, sin desbordar.
  - El canje se comporta igual: con `null`, `''` y 1 MB el contador sube a 3 y no queda autorización.
  - El `coalesce(... = ..., false)` de la línea 102 y el `where crypt(...) = codigo_hash` de la línea 278 hacen que un NULL no autorice nada.
- **Ningún camino coteja y devuelve en la misma transacción.**
  - Los dos pasos uno devuelven `void`: comprobado en el catálogo y por la CA3.1.
  - Los dos pasos dos no tienen argumentos y solo leen la autorización ya confirmada.
  - Los ayudantes `pg_temp` de `00-ayudantes.sql:243-263` son de prueba e invoker. Encadenan los dos pasos en una sola sesión de psql, pero no son una puerta: viven en `pg_temp` y solo existen dentro del banco.
- **Auditoría sin el PIN ni el hash.**
  - Medido tras 5 fallos y 1 bloqueo: 5 `PIN_FALLIDO`, 1 `PIN_BLOQUEADO` y 7 filas `UPDATE` del disparador.
  - Ninguna lleva la clave `hash` ni una cadena `$2x$`, ni en `estado_anterior` ni en `estado_posterior`. El disparador sigue siendo `fn_auditar('perfil_id','hash')` y `fn_auditar('id','codigo_hash')`.
  - En el canje, ninguna de las 9 filas lleva `codigo_hash`.
  - Las columnas nuevas (`desbloqueos_autorizados`, `autorizado_hasta`, `canje_autorizado_*`) sí salen en el JSON del `UPDATE`. Son inocuas.
- **Privilegios y `search_path` de las cuatro funciones definer.**
  - Las cuatro: `prosecdef = t`, `provolatile = v` y `proconfig = {search_path=""}`.
  - `proacl = {postgres=X, authenticated=X}`: sin PUBLIC, sin anon y sin service_role.
  - Las dos tablas tienen solo `postgres=arwdDxtm`, sin ACL de columna, así que las columnas nuevas no son legibles por `authenticated`.
- **Firmas viejas.**
  - `to_regprocedure('public.desbloquear_historia(text)')` y `to_regprocedure('public.canjear_codigo_recuperacion(text)')` son nulas.
  - En `scripts/rls` no queda ninguna llamada a las firmas viejas fuera de los ayudantes.
  - Los cambios de los bancos 02, 03, 04, 09, 12, 13, 14, 19, 20 y 23 son solo el prefijo `public.` → `pg_temp.`: comparé las líneas quitadas y añadidas, y no cambia ninguna aserción.
- **Tope de 2 y 60 s (P1).** El `least(…+1, 2)` respeta el `check 0..2`, y el reinicio a 0 cuando la autorización ha caducado está bien.
- **Canje por lote, en la centinela (P2).**
  - El `pg_advisory_xact_lock('codigos_recuperacion:'||uid)` serializa los dos pasos con `generar`, `comprobar_contrasena_para_regenerar` y `regenerar`. Por eso quitar el `for update` del canje no tiene efecto observable.
  - La C2 del oráculo sí discrimina el `for update` del paso dos del PIN.
- **Localizador.** El oráculo usa `contenedorDelProyecto()`, que es el bueno, y no `localizarContenedor()`.

## MEDIA

### H1 · Nada falla si se quita el `for update` del paso uno del PIN
- **Dónde:** `supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql:90` (la guarda) y `scripts/t042-oraculo.mjs:290-297` (C1, la prueba que dice cubrirla).
- **Qué pasa:** la C1 comprueba «tres malos a la vez dan +3». Ese resultado no depende del candado.
  - En READ COMMITTED, el `update … set intentos_fallidos = least(ph.intentos_fallidos + 1, 100)` vuelve a evaluar la fila tras la espera, así que cada `+1` se aplica sobre el valor confirmado aunque no haya un `for update` antes.
  - Por eso el mutante M-H4 sale «rojo: false»: es equivalente para esta prueba, no para el código.
  - El banco 24 corre en una sola sesión y no puede verlo.
- **Lo que el `for update` protege de verdad** es la regla «el bloqueo se mira antes de comparar» (ADR-026, línea 96) cuando hay concurrencia.
- **Escenario:**
  1. Se quita el `for update` y todas las suites siguen en verde.
  2. Con `intentos_fallidos = 4`, el atacante (con la sesión abierta y desatendida) lanza 10 `POST /rpc/comprobar_pin_historia` a la vez, cada uno con un PIN distinto.
  3. Los 10 leen `bloqueado_hasta = null` antes de que el quinto confirme. Los 10 cotejan y dejan 10 `PIN_FALLIDO`, cuando debería haber 1 más el bloqueo.
  4. Resultado: N intentos por ventana en vez de uno. Si uno de la ráfaga acierta, su `UPDATE` pone `intentos_fallidos = 0` y `bloqueado_hasta = null` y borra el bloqueo que otro acababa de poner.
- **Prueba que discrimina:** partir de `intentos_fallidos = 4` y lanzar 10 malos concurrentes. Debe acabar con exactamente 5 intentos (no `min(4+10, 100)`) y exactamente 1 `PIN_FALLIDO` nuevo.

## BAJA

### H2 · Una autorización pendiente sobrevive a «Bloquear historia» (y al cambio de PIN)
- **Dónde:** la migración, líneas 112-116 (la autorización se fija con 60 s) y 185-190 (el consumo).
  - `bloquear_historia()` (`20260822160000:441-465`) solo revoca `desbloqueos_historia`.
  - `fijar_pin_historia` (`20260830090000:859-891`) no pone a cero `desbloqueos_autorizados` ni `autorizado_hasta`.
  - Ninguna de las dos está en el diff, pero el estado nuevo que no limpian sí lo está.
- **Escenario (reproducido en SQL dentro de rollback):**
  1. El usuario hace dos pasos uno buenos (doble pulsación; P1 permite 2 usos) y un paso dos, que da `ok`.
  2. Pulsa «Bloquear»: `bloquear_historia()` devuelve 1 y `historia_desbloqueada()` da `f`.
  3. Dentro de los 60 s, quien se sienta en la sesión abierta lanza `POST /rpc/desbloquear_historia` con `{}` desde las herramientas del navegador.
  4. La función devuelve `ok` y `historia_desbloqueada()` vuelve a `t` sin que nadie haya escrito el PIN.
- **Otras formas de llegar:** lo mismo pasa si el paso dos se pierde (error de red o la acción se corta) y si el titular cambia el PIN con una autorización viva.
- **Por qué es BAJA:** la ventana es de 60 s como mucho y hace falta llamar al RPC a mano. Aun así, va contra lo que el usuario pidió al pulsar «Bloquear».

### H3 · La comprobación de auditoría de la CA4 no mira dónde estaría el hash
- **Dónde:** `scripts/rls/24-pin-y-canje-dos-pasos.sql:294-298`.
- **Qué pasa:** la aserción solo mira las filas `PIN_FALLIDO` y `PIN_BLOQUEADO`, y solo su `estado_posterior`.
  - Esas filas las escribe la función con un JSON fijo, sin el hash.
  - El hash solo podría colarse por las filas `UPDATE` del disparador `fn_auditar`, en `estado_anterior` o en `estado_posterior`, y esas no se miran.
- **Escenario:**
  1. Una migración posterior recrea el disparador como `fn_auditar('perfil_id')`, sin excluir `'hash'`.
  2. Cada `comprobar_pin_historia` escribe el bcrypt del PIN en `auditoria`, dos veces por fila.
  3. La CA4 sigue en verde.
- **Comprobación que lo cerraría:** todas las filas de `auditoria` con `tabla = 'pines_historia'` y `ocurrido_en = now()`, sin la clave `hash` ni el patrón `$2_$` en ninguno de los dos JSON. Para el canje, lo mismo con `codigo_hash`.

### H4 · La CA5.5 no discrimina el `usado_en is null` del paso dos del canje (M10)
- **Dónde:** `scripts/rls/24-pin-y-canje-dos-pasos.sql:360-367`.
- **Qué pasa:**
  - `t42_lote` crea un lote nuevo con una centinela nueva y sin autorización.
  - El paso dos falla ya en el consumo (`canje_autorizado_hasta > now()`, líneas 345-354) y nunca llega al `where … usado_en is null` de las líneas 358-367.
  - Solo la CA5.5b, con un estado forjado como postgres que ningún camino real produce, pone el mutante en rojo. `mutantes.json` ya atribuye M10 a la 5.5b.
  - La §5 del diseño dice que la reposición «da codigo_invalido por el usado_en is null». Es inexacto: lo da la guarda del consumo, o `sin_codigos`.
- **Escenario:**
  1. Se aplica M10.
  2. La CA5.5 sigue verde: el lote nuevo entre los dos pasos da `codigo_invalido` por la guarda del consumo.
  3. Si mañana alguien borra la 5.5b por «forjada», la cláusula `usado_en is null` queda sin ninguna prueba.

## Observaciones sin hallazgo
- La aserción «ningún contador cambió» tras `rollback to savepoint` en la CA7 (`24-…sql:459-462`) no puede fallar, porque el rollback lo deshace todo.
  - La pidió el diseño. M13 lo cazan las aserciones del texto 25006 de esa misma CA, así que no queda ninguna guarda sin cubrir.
- El «+1 sobrevive al 406» de la O6 (`t042-oraculo.mjs:268-270`) comprueba la estructura y no una guarda.
  - Los dos pasos son peticiones HTTP distintas, así que el +1 del paso uno siempre sobrevive al 406 del paso dos.
  - Lo que importa de la O6, el 406 en el paso dos, sí se comprueba.
