# T-042 · Revisión B (aplicación y pruebas), ronda 1

**Sin hallazgos ALTA.** 0 ALTA, 2 MEDIA, 4 BAJA.

Diff `main...worktree-agent-a9f0330c3f05f9a94` (HEAD 8693cf1). Mi parte: `lib/cuentas/candado.ts` y su prueba,
`lib/cuentas/totp.ts` (`canjearCodigoRecuperacion`) y su prueba, `lib/supabase/tipos-bd.ts`,
`accesibilidad/recuperar.spec.ts`, `tickets/T-042/mutantes.json`, `docs/bitacora/T-042.md` y `docs/state.md`.
No he leído `evidencia.json`.

## Lo que se pidió mirar, y lo que dio

- **La interfaz no puede saltarse el paso uno.** El único camino de `app/**` pasa por `desbloquearHistoria` y
  `canjearCodigoRecuperacion`, y las dos llaman al paso uno antes que al paso dos (`candado.ts:68-76`,
  `totp.ts:133-141`). Si se llama al paso dos a mano por PostgREST sin paso uno, la base responde
  `pin_incorrecto` o `codigo_invalido`. `git diff main...HEAD --stat -- app components` está vacío.
- **`{ get: true }`.** No aparece en ninguna llamada nueva: solo sale en comentarios y en el texto de M17.
  `rpc.mock.calls[0]` se compara con `toEqual` contra un array de dos elementos, así que un tercer argumento lo
  pone en rojo.
- **Llamadores de las firmas viejas.** No queda ninguno en `app/**`, `lib/**` ni `accesibilidad/**`. En
  `scripts/` solo quedan `t002-rls.sql` y `t004-auditoria.sql`, que el contrato excluye y que la bitácora y
  `state.md` ya dan por rotos. `scripts/t012-nota.ts` pasa por `lib`.
- **Si la primera llamada confirma y la segunda falla:**
  - en el PIN, el usuario ve «PIN incorrecto», porque `error` comparte mensaje con el fallo (ADR-026, D9). La
    autorización se queda viva 60 s. Al reintentar, la historia se abre y **sobra una autorización** (H3).
  - en el canje, ve «Ese código no es válido.» y el código sigue sin usar y autorizado 60 s. Si reintenta con el
    mismo código, funciona. No hay pérdida.
- **`tipos-bd.ts`** es idéntico, byte a byte, a `supabase gen types typescript --local` contra la base con
  `20261009120000` aplicada (lo medí). Aun así, cambia más de lo que dicen CA15 y §1.2 (H4).
- **`recuperar.spec.ts`**:
  - usa `contenedorDelProyecto()`, no `localizarContenedor()`. Ahora mismo hay otro `supabase_db_*` en marcha
    (`supabase_db_cinfa-e2e`), así que esto importa;
  - la centinela se busca con la misma ordenación que usa la función;
  - el caso B comprueba también que el factor sigue ahí.
- **Mutantes de TS y Playwright (M16 a M20).** Matan por el motivo dicho. M12 y M15 los mata otra aserción
  antes que la del 24, pero con la misma propiedad. M-H4 no está bien registrado (H1).

## Comprobado sin hallazgo

### El `42501 La historia no está desbloqueada` de `nota-clinica.spec.ts` (aviso del verificador)

Lo descarto. Es la sonda normal del candado cerrado, no una ventana abierta por los dos pasos.

**Por qué no puede venir del cambio.**

- `desbloquearHistoria` solo devuelve `desbloqueado: true` con la fila del paso dos (`candado.ts:76-86`), y esa
  fila sale de la misma transacción confirmada que inserta la ventana en `desbloqueos_historia`.
- El paso uno solo nunca da `true`.
- Si el paso dos falla, caduca (60 s) o ya no le quedan usos, devuelve `error` o `pin_incorrecto`, y
  `abrirHistoria` pinta «PIN incorrecto». La interfaz no llega a creer que la historia está abierta.

**De dónde sale el mensaje.**

- `abrirEditorDeNota` (`lib/notas/servidor.ts:474`, fuera del diff) llama a `registrarAccesoHistoria` antes de
  todo, y usa su 42501 para decidir que la historia está «bloqueada» y pedir el PIN.
- `registrarAccesoHistoria` (`lib/cuentas/accesos.ts:51`, fuera del diff) imprime ese `console.error` en cada
  rechazo. Sale siempre que el spec encuentra la ventana de Ana cerrada, también en `main`.

**Lo que dice la base**, con lecturas sin escritura:

| Hora (UTC) | Qué pasa |
|---|---|
| 10:38:19.67 | Se crea la sesión de Ana del test 1. No había ninguna antes. |
| 10:38:20.595 | Paso uno bueno: autorización 1. |
| 10:38:20.601 | Paso dos: ventana hasta 10:53. |
| 10:38:20.668 | `accesos_historia` de tipo `apertura`, con el agente del navegador. |
| 10:38:21.1 | Sesión del test 2. La ventana ya estaba abierta, así que no hay PIN ni mensaje. |
| 10:38:45 a 10:38:59 | Sesiones de las repeticiones. Encuentran la ventana abierta: no hay mensaje. |

Hay una sola ventana para `1111…` y no queda ninguna autorización sobrante (`desbloqueos_autorizados = 0`). Que el
mensaje saliera **una vez**, en la primera pasada, es justo lo esperado.

**El oráculo no interviene.** Usa un UID propio en cada pasada, y su `reiniciar()` filtra por ese UID.

**Un dato aparte para el orquestador, que no es del código.** Hay un `PIN_FALLIDO` de `1111…` a las
10:38:14.22: `intentos_fallidos` pasó de 0 a 1 y lo reinició el acierto de las 10:38:20. A esa hora **no existía
ninguna sesión de GoTrue de Ana**. Quien lo hizo llamó a `comprobar_pin_historia` como `1111…` con un JWT
fabricado o desde `psql`, y confirmó. Parece una medida del verificador fuera de `begin … rollback`. No afecta a
la prueba, pero ensucia la auditoría de la base compartida.

## MEDIA

### H1 · `tickets/T-042/mutantes.json:25` (y `scripts/t042-oraculo.mjs:293`, `docs/state.md:36`)

**Qué pasa.** Ninguna prueba puede matar M-H4, porque C1 es equivalente a ese mutante por construcción. Sin
embargo, el registro lo presenta como «no observado» y dice que «lo cubre M3».

- C1 lanza tres comprobaciones malas a la vez y exige +3. Eso lo garantiza el propio
  `update … set intentos_fallidos = ph.intentos_fallidos + 1`: en READ COMMITTED, el segundo `update` espera la
  fila y reevalúa sobre la versión confirmada. Da +3 con el `for update` y sin él, así que repetir la pasada 5 o
  500 veces no cambia nada.
- M3 prueba el consumo del paso dos y no tiene nada que ver con esto.
- Lo que el `for update` de `20261009120000:90` protege de verdad es que `bloqueado_hasta` se lea después del
  último fallo confirmado. Eso no lo prueba nadie.

**Escenario de fallo.** Alguien quita ese `for update` («ya serializa el update») y toda la suite sigue en verde.

- Con la sesión del navegador, un atacante lanza N `POST /rpc/comprobar_pin_historia` a la vez.
- Todas leen `bloqueado_hasta` nulo antes de que confirme la primera.
- Resultado: N cotejos bcrypt y N filas `PIN_FALLIDO` en una sola oleada, saltándose el límite de cinco del
  ADR-026. Además, varios `PIN_BLOQUEADO` y varios avisos `pin_bloqueado`.

**La prueba que lo mataría.** Con `intentos_fallidos = 4`, tres comprobaciones malas a la vez deben dejar
exactamente **un** `PIN_FALLIDO` nuevo, `intentos_fallidos = 5` y un solo `PIN_BLOQUEADO`. Sin el `for update`,
dejan tres, 7 y tres. La misma idea vale para el canje.

### H2 · `docs/state.md:15-16, 33-36`

**Qué pasa.** El `state.md` de la rama choca con el de `main` (037f0a0). `git merge-tree` da
`CONFLICT (content): Merge conflict in docs/state.md`.

**Escenario de fallo.** Si el conflicto se resuelve tomando la rama, entero o por bloques:

- vuelve «**T-038**: ronda 4 en implementación…» (línea 15), y T-038 ya está integrado;
- revive «T-038 A3-H2 (BAJA)» (línea 35), que `main` ya cerró;
- desaparecen de los hallazgos «**T-038 R4-H1 (BAJA)**», un hallazgo abierto con su arreglo, y
  «**T-038 lecciones**», las reglas propuestas que esperan al usuario y al arquitecto.

Además, la línea 33 dice «Se cierra al integrar». El contrato (tarea 7) manda cerrar el hallazgo «PIN y canje»,
y esa frase quedaría falsa en `main` el día del merge.

Hay que rehacer `state.md` sobre el de `main`, no fusionarlo.

## BAJA

### H3 · `lib/cuentas/candado.ts:76-80` (con `desbloquear_historia()` y `bloquear_historia()`, sin cambios)

**Qué pasa.** Si el paso dos falla después de un paso uno bueno, el reintento del usuario deja una autorización
sobrante de 60 s. `bloquear_historia()` no la borra, así que la historia se reabre sin PIN después de que el
titular la haya cerrado.

**Escenario de fallo.** Lo medí en `begin … rollback`, como `1111…`:

1. El titular escribe el PIN bueno. El paso uno autoriza (1) y el paso dos falla por transporte.
2. La pantalla dice «PIN incorrecto» y el titular reintenta. El paso uno sube a 2 (`least(1+1, 2)`) y el paso dos
   abre y gasta una: queda 1.
3. Pulsa «Cerrar historia»: `bloquear_historia()` devuelve 1 y `historia_desbloqueada()` vale `f`.
4. Antes de 60 s, quien se sienta ante esa sesión hace `POST /rpc/desbloquear_historia {}`. Respuesta:
   `t | ok`, y `historia_desbloqueada()` vale `t`.

Es justo el atacante del ADR-026 que cita el contrato. Lo limita la necesidad de un fallo de transporte en el
paso dos, por eso es BAJA. El diseño (riesgo 5) solo acepta la ventana tras cambiar el PIN, no esta.

### H4 · `lib/supabase/tipos-bd.ts:440-463, 1856-1880`

**Qué pasa.** El regenerado añade las cuatro columnas nuevas a `codigos_recuperacion_totp` y `pines_historia`
(Row, Insert y Update). CA15 dice «cambia solo en las cuatro funciones», y §1.2 dice «si aparecen, hay que mirar
por qué».

El fichero es salida legítima del generador. `supabase gen types` introspecciona las tablas de `public` sin mirar
los grants, y esas dos tablas ya estaban en los tipos. Lo que está mal es la premisa del diseño, pero ni la
bitácora ni `state.md` lo dicen.

**Escenario de fallo.** Un verificador que aplica CA15 al pie de la letra lo marca FALLA, o lo da por bueno sin
dejar escrito por qué el criterio no se cumple tal como está redactado.

### H5 · `lib/cuentas/candado.ts:79` y `lib/cuentas/totp.ts:144`

**Qué pasa.** El `console.error` del paso dos sigue registrando el objeto `error` entero. §1.4 («pasa a registrar
`error?.code`, no el objeto entero») y §5 («los `console.error` registran `.code`») piden lo contrario. Solo se
cambió el del paso uno.

**Escenario de fallo.** Un fallo de `desbloquear_historia()` vuelca `message`, `details` y `hint` de PostgREST al
registro del servidor, y el punto de §5 no se cumple. Hoy esa llamada no lleva el secreto, así que no se filtra
nada: es una desviación del diseño, no una fuga.

### H6 · `lib/cuentas/totp.test.ts:150, 170-178`

**Qué pasa.** Faltan dos casos que pide §1.4 (pruebas 3 y 4):

- no hay ninguno con `sin_codigos`;
- `listFactors` devuelve `factors: []`, así que nunca se llega a `deleteFactor`.

**Escenario de fallo.** El mutante
`if (fila.motivo !== 'codigo_invalido' && fila.motivo !== 'bloqueado') await borrarFactoresTotp(…)` sigue en
verde. Con él, alguien que solo tiene la contraseña de una cuenta sin lote escribe cualquier cosa en
`/recuperar`, recibe `sin_codigos` y le borran el factor TOTP al titular. En la siguiente entrada, el sistema le
pide enrolar uno nuevo. La única red que queda es el caso A de `recuperar.spec.ts`, que no cubre `sin_codigos`.
