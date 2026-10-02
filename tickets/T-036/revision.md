**Gate T-036 (ronda 1): sin hallazgos ALTA** (A + B: 0 ALTA · 0 MEDIA · 1 BAJA; la ronda 0 tuvo 0 ALTA · 3 MEDIA · 4 BAJA, todas cerradas).

## Revisor A (seguridad e invariantes de base: SQL, cerrojos, cadena de huellas, RLS)

**Sin hallazgos de severidad ALTA (revisor A).** 0 ALTA · 0 MEDIA · 2 BAJA.

Diff: `main...worktree-agent-a4a817c2de2579aac` (0fc10d2..401e536). Revisado leyendo, sin tocar la base.

### Lista «Qué revisar» (§5 y E.11), punto por punto
- **Orden y atomicidad bajo `for no key update`**: `cita_id`, `borrador_contenido is not null`, `borrador_abierta_en` y `borrador_contenido` se leen en la MISMA sentencia con cerrojo del paso 2 (migración:130-136). En READ COMMITTED la firma que espera relee la fila confirmada (EvalPlanQual), así que 6.17 ve el borrador vaciado por la primera firma (§1.4) y 6.24 ve el guardado concurrente (R2-H1). Las nuevas comprobaciones van después de 6.16 y del 42501 del paso 0. Sin hallazgos.
- **NFC e `''`≡null en 6.24** (432-433): NFC a los dos lados; `coalesce(…, false)` deja el texto ausente o nulo como «no coincide»; `nullif('')` a los dos lados de las reservadas, con `is not distinct from`. Las condiciones son independientes (X9/X10). Sin hallazgos.
- **search_path, definer y privilegios**: `security definer set search_path = ''`, nombres cualificados y `revoke` de las dos funciones (507, 659). Sin hallazgos.
- **Ningún camino de UPDATE/DELETE sobre versiones**: la migración no añade ninguno. Los `disable trigger` del banco van dentro de savepoints con `rollback to` y apuntan a `notas_clinicas` (la cabecera mutable), nunca a `notas_clinicas_versiones`. Sin hallazgos.
- **El verificador coincide con el disparador (6.19)**: `cab_cita_id` (550) y la línea 636 usan la misma expresión que 407. Que el verificador no recalcule 6.23 ni coteje 6.18 está justificado en architecture.md (reprogramación, borrador vaciado). Sin hallazgos.
- **Compatibilidad entre eras**: la guarda de era de T-012c deja solo versiones de la era 4, y firmarNota ya mandaba `cita_id` de la cabecera. Las firmas de `postgres` (siembra, fijación, t005, banco 20) quedan exentas de P1, y las que llevan cita la mandan en el sobre (banco 20: `p_cita_id`). Sin hallazgos.
- **firmarNota traduce el 23514 nuevo**: ningún mensaje de 6.17-6.24 contiene `abierta_en` (423, 435, 444, 451, 467, 478, 488), así que todos se traducen a `conflicto`. La aserción T del banco lo fija contando tres. Sin hallazgos.
- **Las funciones reemitidas no pierden nada frente a 20261001120000/20261002120000**: `fn_sellar_version_nota` conserva el cuerpo y los comentarios y añade lo previsto; `fn_congelar_cabecera_sellada` solo cambia el mensaje. El verificador pierde un comentario: A-H2.
- **Concurrencia (t005)**: T2 se ejecuta como función invoker. El sondeo usa `pg_stat_clear_snapshot` y espera `wait_event_type = 'Lock'`. El mutante de E.4.3 se deshace con la excepción del sub-bloque, y se comprueba byte a byte que la función restaurada es la original. El paciente que se verifica es el mismo `pconc_id`. Sin hallazgos.

### BAJA

**A-H1 · `scripts/rls/14-cadena-huellas.sql:2177-2179`: la aserción que comprueba el dato de partida de C4/C5 lleva `or true` y nunca puede fallar.**
La aritmética (`extract(microseconds)%1000000%1000 = 999`) es correcta, pero el `or true` la anula. Ningún paso comprueba que la cabecera quede de verdad en `.345999`.
Escenario: alguien cambia en `t036_prep` (línea 2004) `interval '345999 microseconds'` por `interval '345 milliseconds'`, o `t036_abierta` deja de fijar la columna. Entonces C5 (`.346Z`) sigue lanzando, C4 (`.345Z`) sigue entrando y la aserción sigue verde. El criterio 7 («trunca y no redondea con microsegundos ≠ 0») queda probado solo con µs = 0, donde truncar y redondear dan lo mismo: un mutante de 6.18 que redondee (`date_trunc('milliseconds', x + interval '500 microseconds')`) pasaría el banco.

**A-H2 · `supabase/migrations/20261003120000_firma_cotejada_con_borrador_y_cita.sql:659`: el verificador reemitido pierde el comentario que explicaba por qué no se concede a `authenticated`.**
En `20261001120000_nota_id_en_el_sobre.sql:592-596` decía: «recorrer todas las cadenas revela cuántas versiones tiene cada paciente, saltándose la RLS».
Escenario: la próxima migración que reemita `verificar_cadena_huellas` copiará este cuerpo vivo, que ya no lleva la razón del `revoke`. Un ticket que quiera «que el profesional verifique su propia cadena» puede cambiar el `revoke` por un `grant … to authenticated` sin ver el motivo. Con `p_paciente_id null`, la función definer devolvería entonces filas de todas las cadenas y dejaría ver cuántas versiones tiene cada paciente, saltándose la RLS.

### Descartados (sin escenario que no sea decisión del propietario)
- P3 (6.21) solo en la v1 (466): una v1 firmada por `postgres` con una cita ajena dejaría que la v2 de un `authenticated` llegue a 6.22/6.23 contra esa cita. Es la decisión del propietario del 02-10-2026, la cubren P3v2 y X12, y exige una importación ya defectuosa.

## Revisor B (lente de pruebas: bancos, mutantes y carrera)

**Sin hallazgos de severidad ALTA (revisor B).** 0 ALTA · 3 MEDIA · 2 BAJA.

Diff: `main...worktree-agent-a4a817c2de2579aac` (0fc10d2..401e536). Revisado leyendo, sin la base.

Lo comprobado que aguanta:
- **La carrera de t005 intercala de verdad** (§1.4, E.4.2 y E.4.3). `t036_esperar_bloqueo` llama a `pg_stat_clear_snapshot()`, exige `wait_event_type='Lock'` y da FALLO si no lo ve.
- **E.4.2 mata dos mutantes:**
  - el del paso 2 sin `for no key update`: T2 sellaría X con `exito=true` y la prueba se pondría roja;
  - el del borrador leído antes del cerrojo: el mensaje cambia y la prueba lo caza.
- **E.4.3 detecta una 6.24 apagada**: `exito=true` con 0 versiones. Nunca confirma el mutante y compara la función con `t036_original`.
- **El recuento de §1.4 es exacto**: 2 versiones.
- **Los negativos tienen sqlstate y fragmento:**
  - X1-X12, con `assert_lanza_codigo_msg`;
  - cada mitad del `or` de P3 tiene su negativa: P3a por el paciente y P3b por el profesional.
- **04-baja sigue probando lo mismo.** Su firma pasa ahora 6.17-6.24: borrador vivo `{"texto":"baja","reservadas":""}` (`''` ≡ null), `creada_en` igual a `date_trunc('milliseconds', now())` y `abierta_en` tomado de la cabecera. Las aserciones de la baja no cambian.

### MEDIA

**B-H1 · `scripts/rls/14-cadena-huellas.sql:2177-2179`. La aserción que fija `.345999` es tautológica (`... = 999 or true`), y C1 no comprueba `.345000`.**
Coincide con A-H1. La subo a MEDIA por un agravante: la aserción corre como `PRO1` (`como` de la 2176), así que, aunque se quite el `or true`, la subconsulta puede leer null por RLS.

Escenario:
- `t036_abierta` deja de surtir efecto (otro disparador, `tocar_borrador` renombrado u otro orden en `t036_prep`), y la apertura queda con menos de 500 µs bajo el milisegundo.
- C5, con `ab+1ms`, sigue lanzando y C4 sigue entrando, porque truncar y redondear dan lo mismo.
- Un mutante de 6.18 que redondee en vez de truncar deja C4 y C5 en verde. El criterio 7 queda sin probar.

Arreglo: hacer la aserción como `postgres`, sin `or true`, y repetirla en C1 con `.345000`.

**B-H2 · `scripts/rls/14-cadena-huellas.sql:2191-2194` (y X4 en 2491-2495). 6.20 solo tiene negativas a ±1 día, cuando la tolerancia es de ±1 minuto (migración, línea 450).**

Escenario:
- El mutante que cambia `interval '1 minute'` por `interval '23 hours'` en los dos lados del `between` deja en verde P2a, P2b y la gemela P2.
- X4 también sigue verde, porque solo apaga la comprobación entera.
- Con 23 h, un cliente puede retrofechar `firmada_en` casi un día y burlar 6.23, que es justo lo que 6.20 cierra («Sin esto, 6.23 se burla retrofechando la firma»).

La decisión (c), «±1 minuto», no tiene guarda. Faltan una negativa a `t0 ± 61 s` y una gemela a `t0 ± 59 s`. Como `now()` es constante en la transacción del banco, el borde es determinista.

**B-H3 · `scripts/rls/14-cadena-huellas.sql:2061` (A1-A4) y 2334-2341 (E1). 6.19 vale «para TODOS los roles» (migración, 403-409), pero solo se prueba como `authenticated`: no hay ninguna negativa como `postgres`.**
E1 firma como `postgres` con `cita_id` coherente (null y null), así que no ejerce 6.19.

Escenario:
- Un `create or replace` devuelve 6.19 al bloque `if current_setting('role',true) in ('authenticated','anon')`, que es la posición del diseño original, anterior a la decisión (a) del 02-10-2026.
- A1-A4, X3 y E1 siguen en verde.
- Con eso, una firma como `postgres` o `service_role` (la siembra, el importador o una RPC definer futura) se sella sin error aunque el `cita_id` del sobre sea distinto del de la cabecera.
- La huella queda certificando una cita que la cabecera no tiene.

Falta una negativa como `postgres`: cabecera con `K36`, sobre con `K36B` (o con null), y error 23514 con el fragmento «no es la cita de la cabecera».

### BAJA

**B-H4 · `scripts/t005-concurrencia.sql:600-605`. Los `drop` de `t036_*` solo están al final, y con `ON_ERROR_STOP=1` cualquier FALLO intermedio (líneas 406, 485 o 570, o cualquier aserción) los deja en `public`.**

Escenario:
- `t036_esperar_bloqueo('t036_r')` da FALLO y psql sale. Quedan `t036_sobres`, `t036_original` y cuatro funciones.
- Tres de esas funciones, `t036_esperar_bloqueo`, `t036_esperar_resultado` y `t036_sobre_prueba`, no tienen `revoke`. Solo lo tiene `t036_firmar_en_segundo_plano` (línea 314).
- Los privilegios por defecto de `public` solo retiran los de tablas (migración base, línea 245), así que `anon` puede ejecutar esas funciones por PostgREST.
- Además, al morir la conexión principal T1 aborta, y la T2 que sigue en segundo plano firma X sobre el borrador X y confirma una versión de NOTA36R.

Es la base local y el guion ya «exige `db reset`», así que el daño se queda en residuo. Aun así, el encargo pedía que se borraran «siempre», y eso no se cumple.

Arreglo:
- `drop ... if exists` también al empezar;
- `revoke ... from public, anon, authenticated` en las tres funciones.

**B-H5 · `scripts/t005-concurrencia.sql:338`. El FALLO de `t036_esperar_bloqueo` dice «no llegó a esperar el cerrojo del guardado» también en §1.4 (la llamada de la línea 406), donde quien tiene el cerrojo es la v2 de T1, una firma.**

Escenario: si §1.4 deja de intercalar, el mensaje manda a buscar en `guardarBorrador` o `fn_vaciar`, cuando lo que falla es el `insert` de la versión.

Arreglo: pasar el qué como parámetro, o usar un texto neutro como «el cerrojo de la cabecera».

## Ronda 1 · Revisor B (lente de pruebas: bancos, mutantes y carrera)

**Sin hallazgos de severidad ALTA (revisor B, ronda 1).** 0 ALTA · 0 MEDIA · 1 BAJA.

Diff: `main...worktree-agent-a924f41815b576e9e`, commit de la ronda b9f0477. Revisado leyendo el SQL, sin tocar la base.

### Hallazgos de la ronda 0, uno a uno

- **B-H1 (y A-H1): cerrado.**
  - Las dos partidas, C1 `= 345000` (14:2178-2180) y C2 `= 345999` (14:2195-2197), se comprueban ahora como `postgres`. Las dos van después de un `reset_sesion` y antes de `como(PRO1)`, y ya no llevan `or true`.
  - `extract(microseconds)::bigint % 1000000` da los microsegundos dentro del segundo. `t036_prep` construye `date_trunc('second', t0) - 10 s + 345 ms` (o `+ 345999 µs`), así que la igualdad es exacta.
  - Mutantes que caen:
    - el de la fijación (que `t036_abierta` no surta efecto, o que cambie el literal): cae en la partida;
    - el de 6.18 que redondea: X14 lo mata. Con `.345999 + 500 µs = .346499` el sobre truncado lanza, el redondeado entra, y C4 se pondría roja;
    - el que trunca a segundos: C1 lo mata.
- **B-H2: cerrado.**
  - `t0 = date_trunc('milliseconds', now())` y `now()` es constante en el `begin…rollback` del banco, así que `now() - 1 ms < t0 ≤ now()`. Las cuatro desigualdades son deterministas y no dependen del reloj real:
    - P2c: `t0 - 61 s < now() - 60 s`, lanza;
    - P2d: `t0 + 61 s ≥ now() + 60,999 s`, lanza;
    - P2e: `t0 - 59 s > now() - 60 s`, entra;
    - P2f: `t0 + 59 s ≤ now() + 59 s`, entra.
  - Cada gemela positiva va en su propio `rollback to savepoint` + `t036_prep('P2')`, porque la firma vacía el borrador. Sin eso, la siguiente moriría en 6.17.
  - Mutantes que caen:
    - ensanchar los dos lados (X15 con 23 h; también 2 min o 61 s): P2c o P2d;
    - ensanchar un solo lado: P2c o P2d, cada una el suyo;
    - estrechar a 30 s o a la igualdad: P2e, P2f o la gemela P2;
    - quitar un lado del `between`: P2b o P2d.
  - Solo sobrevive una tolerancia entre 59 s y 61 s. El borde exacto de 60 s no es alcanzable porque `creada_en` va al milisegundo y `now()` al microsegundo. Aceptable.
  - La negativa muere por 6.20 y no por otra comprobación. P2 va sin cita, con el borrador vivo `X`, `abierta_en` exacto y dos días antes. El fragmento «del reloj de la base» solo aparece en el mensaje de 6.20 (migración:451).
- **B-H3: cerrado.**
  - A6 y A7 (14:2104-2110) se ejecutan como `postgres`: `reset_sesion` y ningún `como`.
  - La fila no es incoherente en nada anterior a 6.19. A7 lleva margen null y redactada false, que es lo que pide 6.9 sin cita en el sobre.
  - El fragmento «no es la cita de la cabecera» es único (migración:408).
  - X13 aplica exactamente el mutante del escenario de la ronda 0, que guarda 6.19 con el rol, y comprueba que el sobre K36B entra como `postgres`.
  - Las variantes razonables también caen en A6/A7, por ejemplo moverla físicamente dentro del bloque o añadir `service_role` a la lista.
  - Ninguna de esas variantes está fuera de lo que A6 discrimina.
- **Reaplicación de mutantes tras `rollback to savepoint`: correcta.**
  - `t012c_mutar` parte siempre del texto capturado con `\gset`, `:'sellar_original_036`, y no de la definición viva, así que el segundo mutante de X15 no se apila sobre el primero.
  - El `create or replace` es transaccional y lo deshace el `rollback to savepoint s036`, que conserva el savepoint.
  - Tras X13, X14 y X15, la definición se compara byte a byte con la capturada.
  - `t012c_mutar` falla si el fragmento no aparece exactamente una vez, así que un mutante que no muta no puede pasar por demostración.
  - Las tres cadenas aparecen una sola vez en la migración (407, 443 y 450).
- **B-H5: cerrado.** `p_quien` lleva el sujeto correcto en las tres llamadas, y en §1.4 dice «el insert de la v2 de T1, una firma». La firma vieja `(text)` también se borra.
- **A-H2** (la lente de A, lo dictamina él): leído, el comentario del `revoke` del verificador queda repuesto (migración:659-663).

### B-H4: dictamen sobre el cierre parcial

**Basta, como BAJA residual, con una salvedad (R1-B-H1).**

Las dos mitades que importaban quedan cerradas o no admiten arreglo dentro del territorio:
- **Exposición a `anon`: cerrada.** Las cuatro funciones `t036_*` llevan `revoke … from public, anon, authenticated` justo después de crearse (t005:264, 329, 358 y 375). Aunque el guion muera a mitad, lo que quede en `public` no se puede ejecutar por PostgREST.
- **La T2 superviviente que confirma una versión de NOTA36R: no se puede evitar sin un `finally`.**
  - Con `ON_ERROR_STOP`, psql no lo tiene, y el que lanza el guion (`scripts/test-huellas.mjs`) está fuera del territorio.
  - La versión la sella el disparador real, así que la cadena queda sana.
  - El mutante de E.4.3 se deshace dentro del sub-bloque de T2 aunque T1 haya muerto, y nunca se confirma.
  - El guion ya exige `db reset` (cabecera, líneas 7-13).
  - Una segunda ejecución sin reset muere en rojo por los UUID repetidos, no en verde.
  - El daño se queda en una base local que hay que resetear de todos modos.

### BAJA

**R1-B-H1 · `scripts/t005-concurrencia.sql:220-226`. Los `drop … if exists` «al empezar» no corren antes de nada en el único caso para el que existen.**
- Están en la línea 220, detrás del montaje de T-005, que inserta con UUID fijos `EPICONC` (línea 45) y `NOTA1`/`NOTA2` (línea 48).
- El comentario de 217-219 dice que los residuos de una ejecución que murió a mitad «se borran al empezar», y eso no es verdad.

Escenario:
- Una ejecución muere en `t036_esperar_bloqueo('t036_r', …)` (línea 503) y quedan en `public` `t036_sobres`, `t036_original` y las cuatro funciones.
- Se vuelve a lanzar `npm run test:huellas` sin `db reset`, y psql muere con un 23505 en la línea 45, antes de llegar a la 220.
- Los residuos siguen ahí hasta el `db reset`, que los habría borrado igual.

Los `drop` nunca limpian nada que no limpie el reset. No hay fuga, porque las funciones ya tienen `revoke`, pero el comentario promete una limpieza que no ocurre.

Arreglo, a elegir:
- subir los siete `drop` por encima de la línea 45, al principio del guion;
- o corregir el comentario para que diga que el `revoke` es la protección y el `db reset`, la limpieza.

### Descartados
- **El rótulo de la sección G sigue diciendo «Los mutantes (X1-X12)»** (14:1814) y ya hay X15. No hay escenario de fallo.
- **El mutante `now()` → `clock_timestamp()` en 6.20** puede sobrevivir si el banco tarda menos de un segundo entre `t0` y P2. En producción, cada firma va en su propia transacción y los dos son prácticamente equivalentes. No es un hueco de prueba con consecuencia.

## Ronda 1 · Revisor A (seguridad e invariantes de base: SQL, cerrojos, cadena de huellas, RLS)

**Sin hallazgos de severidad ALTA (revisor A, ronda 1).** 0 ALTA · 0 MEDIA · 0 BAJA.

Diff: `main...worktree-agent-a924f41815b576e9e`, commit de la ronda b9f0477. Revisado leyendo, sin tocar la base. `git diff 401e536 12b54cc -- scripts supabase docs/architecture.md` sale vacío, así que lo único nuevo frente a la ronda 0 es b9f0477.

### La función de producción no cambia
- En la migración `20261003120000_firma_cotejada_con_borrador_y_cita.sql`, b9f0477 solo añade cinco líneas de comentario `--` (659-663), entre el `comment on function` y el `revoke` del verificador.
- No toca ni el cuerpo de `fn_sellar_version_nota` ni el de `verificar_cadena_huellas`, ni ningún `grant` o `revoke`.
- La afirmación del comentario es cierta: `create or replace function` conserva el propietario y la ACL de la definición anterior, así que el `revoke` es redundante y no hace daño.

### Hallazgos de la ronda 0
- **A-H1: cerrado.**
  - Las dos partidas se comprueban ahora como `postgres`, sin `or true`: C1 `= 345000` (14:2178-2180) y C2 `= 345999` (14:2194-2197).
  - `pg_temp.assert` usa `is distinct from true` (00-ayudantes:16), así que un null por RLS o por un id equivocado también daría FALLO. `N36` es el `n1` de `t036_prep` (14:1817).
  - X14 aplica exactamente el mutante de mi escenario, `+ 500 µs` antes del `to_char`. El fragmento aparece una sola vez (migración:443). Con `.345999` el sobre truncado lanza y el redondeado entra, así que C4 caza el redondeo.
- **A-H2: cerrado.** El motivo del `revoke` vuelve a estar junto a la función (migración:659-663), con el mismo razonamiento que en 20261001120000:592-596: recorrer todas las cadenas revela cuántas versiones tiene cada paciente, saltándose la RLS.

### Lo demás de b9f0477, con la lente de base
- **6.19 para todos los roles (A6, A7 y X13).**
  - A6 y A7 corren sin `como()`, así que `current_setting('role')` es `none`. El fragmento «no es la cita de la cabecera» solo sale de 6.19 (migración:408), y 6.19 está fuera del bloque P1 (migración:407 frente a 418).
  - El fragmento que muta X13 es la línea 407 entera, única en la función.
  - Cualquier regresión que vuelva a condicionar 6.19 por rol y deje fuera a `postgres` (incluido añadir `service_role` a la lista) cae en A6.
- **6.20 (P2c-P2f y X15).**
  - `t0 = date_trunc('milliseconds', now())` se toma dentro de la transacción del banco (14:1831), así que los bordes de ±59 s y ±61 s son deterministas.
  - El fragmento de X15 es único (migración:450).
  - Cada gemela positiva va en su propio `prep`, porque la firma vacía el borrador.
- **Mutantes en general.** Los tres se deshacen con `rollback to savepoint s036` (el `create or replace` es transaccional) y se coteja la definición byte a byte con `:'sellar_original_036'`. `t012c_mutar` parte siempre del texto capturado, así que el segundo mutante de X15 no se apila sobre el primero.
- **t005: cerrojos y mutante de E.4.3.** b9f0477 no cambia la lógica de la carrera, solo el texto del FALLO y los permisos. El mutante de 6.24 se aplica y se deshace dentro del sub-bloque de la propia T2 (t005:298-321):
  - con `p_mutar` siempre termina en `raise`;
  - si el `insert` lanza, el `exception when others` revierte también el `create or replace`.

  Así que, aunque T1 muera, el mutante no se confirma: no hay escenario en el que la función de producción quede mutada.

### B-H4: ¿basta el cierre parcial para riesgo alto?

**Sí, basta.** No encuentro escenario que lo impida. Repaso lo que podría quedar si el guion muere a mitad:
- **Las funciones `t036_*` en `public`.** Las cuatro llevan `revoke … from public, anon, authenticated` justo después de crearse (t005:264, 329, 358 y 375). PostgREST no las expone a la clave anónima ni a una sesión de usuario. Solo las conserva `service_role`, que ya tiene la clave de servicio y no gana nada.
- **Las tablas `t036_sobres` y `t036_original`.**
  - El guion las crea como `postgres`.
  - El `alter default privileges in schema public revoke all on tables from anon, authenticated, service_role` (20260822094547:1593, repetido en 20260829150000:408) hace que nazcan sin privilegios para los roles del cliente.
  - Contienen sobres de prueba de un paciente sintético y una definición de función, nada de un paciente real.
- **La versión que confirma la T2 superviviente en NOTA36R.**
  - La sella el disparador real, en una base local de pruebas que el guion ya exige resetear, así que la cadena queda íntegra.
  - Una segunda ejecución sin reset muere en rojo por los UUID fijos, no en verde. La regla 6 de la constitución no se toca: es una fila añadida, no una modificación.
- **La función de producción.** No puede quedar mutada (punto anterior).

El `finally` imposible solo habría ahorrado residuo en una base que se resetea de todos modos.

Sobre R1-B-H1, el comentario que promete «se borran al empezar»: estoy de acuerdo en que el comentario promete de más. Es un hallazgo de B y como BAJA no mueve el gate.

### Descartados
- **6.19 no se prueba como `service_role`.** Ninguna redacción verosímil de la guarda distingue a `service_role` de `postgres` sin caer en A6. Que alguien escriba a propósito «todos menos `service_role`» no es un escenario de regresión creíble.
