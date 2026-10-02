**Gate T-036: sin hallazgos ALTA** (A + B: 0 ALTA · 3 MEDIA · 4 BAJA).

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
