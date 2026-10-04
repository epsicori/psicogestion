**Sin ALTA. Gate combinado de la ronda 1: 0 ALTA, 2 MEDIA, 6 BAJA** (A1: 1 MEDIA y 3 BAJA; B1: 2 MEDIA y 4 BAJA; dos duplicados contados una vez).

# T-042 · Revisión, ronda 1 (combinada)

- **Diff revisado:** `main...worktree-agent-a9f0330c3f05f9a94` (HEAD `8693cf1`).
- **Reparto:**
  - El revisor A miró la base, la seguridad y los guiones: la migración `20261009120000`, `scripts/rls/**` y `scripts/t042-oraculo.mjs`. Su informe está en `revision-a.md`.
  - El revisor B miró la aplicación y las pruebas: `lib/cuentas/**`, `tipos-bd.ts`, `accesibilidad/recuperar.spec.ts`, `mutantes.json`, la bitácora y `state.md`. Su informe está en `revision-b.md`.
- **Mediciones:** todas en `supabase_db_Psicogestion`, dentro de `begin … rollback`.
- **Duplicados:**
  - A1-H1 = B1-H1: el `for update` del paso uno del PIN no tiene ninguna prueba. Se cuenta como A1-H1.
  - A1-H2 = B1-H3: una autorización sobrante sobrevive a «Bloquear». Se cuenta como A1-H2.

| Id | Sev. | Dónde | Qué |
|---|---|---|---|
| A1-H1 (= B1-H1) | MEDIA | `supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql:90` · `scripts/t042-oraculo.mjs:290-297` · `tickets/T-042/mutantes.json:25` | La C1 comprueba que tres malos a la vez dan +3, y eso sale igual sin el candado: en READ COMMITTED, el `update … + 1` vuelve a evaluar la fila. Por eso M-H4 sale «rojo: false». Lo que el `for update` protege es que el bloqueo se mire antes de comparar. Sin él, N peticiones a la vez con `intentos = 4` cotejan N PIN, y el límite de cinco del ADR-026 se salta en una sola ráfaga. La prueba que lo discrimina: partir de `intentos = 4`, lanzar varios malos a la vez y exigir exactamente `intentos = 5`, 1 `PIN_FALLIDO` nuevo y 1 `PIN_BLOQUEADO`. |
| B1-H2 | MEDIA | `docs/state.md:15-16, 33-36` | El `state.md` de la rama choca con el de `main` 037f0a0 (`git merge-tree` da CONFLICT). Si se toma el lado de la rama, vuelve «T-038 ronda 4 en implementación», revive A3-H2 (ya cerrado) y desaparecen T-038 R4-H1 (BAJA abierto) y «T-038 lecciones». Además, «Se cierra al integrar» queda falso en `main`. |
| A1-H2 (= B1-H3) | BAJA | la migración, líneas 112-116 y 185-190 · `lib/cuentas/candado.ts:76` | Ni `bloquear_historia()` ni `fijar_pin_historia` limpian una autorización pendiente (`desbloqueos_autorizados > 0`). Escenario: un paso dos se pierde y el reintento abre, así que queda 1 autorización. El usuario pulsa «Bloquear». Antes de 60 s, alguien manda `POST /rpc/desbloquear_historia {}` desde la sesión desatendida, recibe `ok` y la historia vuelve a estar abierta sin el PIN. Reproducido en rollback por los dos revisores. |
| A1-H3 | BAJA | `scripts/rls/24-pin-y-canje-dos-pasos.sql:294-298` | La aserción de la CA4 «sin hash en la auditoría» solo mira el `estado_posterior` de `PIN_FALLIDO` y `PIN_BLOQUEADO`, que llevan un JSON fijo. No mira las filas `UPDATE` de `fn_auditar` ni el `estado_anterior`, que es por donde se colaría el hash si el disparador perdiera la exclusión de `'hash'`. |
| A1-H4 | BAJA | `scripts/rls/24-pin-y-canje-dos-pasos.sql:360-367` | La CA5.5 falla en la guarda del consumo de la centinela nueva y nunca llega al `usado_en is null`. Solo la 5.5b, con un estado forjado, mata M10. La §5 del diseño atribuye ese resultado al `usado_en is null`, y es un error. |
| B1-H4 | BAJA | `lib/supabase/tipos-bd.ts:440-463, 1856-1880` | El regenerado añade las cuatro columnas nuevas a las dos tablas. Es la salida legítima del generador, idéntica byte a byte, pero contradice CA15 y §1.2, y nadie lo ha anotado. |
| B1-H5 | BAJA | `lib/cuentas/candado.ts:79` · `lib/cuentas/totp.ts:144` | El `console.error` del paso dos registra el objeto de error entero y no `.code`, en contra de §1.4 y §5. Ese camino no lleva el secreto: es una desviación del diseño, no una fuga. |
| B1-H6 | BAJA | `lib/cuentas/totp.test.ts:150, 170-178` | No hay ningún caso con `sin_codigos`, y `deleteFactor` nunca se ejecuta porque `listFactors` devuelve `factors: []`. El mutante que borra el factor salvo con `codigo_invalido` o `bloqueado` sigue en verde. |

## Severidad de A1-H2 / B1-H3: se queda en BAJA

El coordinador lo dejó a mi juicio. Se queda en BAJA por lo que se midió:

- **La doble pulsación normal no deja ninguna autorización sobrante.** Lo medí en rollback con las dos secuencias posibles: «paso uno, paso uno, paso dos, paso dos» y «paso uno, paso dos, paso uno, paso dos». En las dos se consumen las dos autorizaciones. Después de `bloquear_historia()`, `desbloquear_historia()` da `pin_incorrecto`.
- **Los «dos caminos» tienen una sola causa.** Hace falta un paso dos que no llegó (por la red, o porque la acción se cortó) seguido de un reintento. El camino de A (dos pasos uno y un solo paso dos) y el de B (el paso dos se pierde y luego se reintenta) son el mismo estado. El de `fijar_pin_historia` también exige que ese sobrante siga vivo.
- **Para explotarlo tienen que coincidir tres cosas en 60 s:** el fallo del paso dos, que el usuario pulse «Bloquear» y que alguien llame al RPC a mano desde la sesión abierta.
- **No viola la constitución ni expone datos de otro usuario.** Lo que abre es la historia de quien ya tiene la sesión iniciada. Lo que rompe es la promesa de «Bloquear», en una ventana estrecha.

Hay que arreglarlo igualmente. Basta con que `bloquear_historia()` y `fijar_pin_historia` pongan `desbloqueos_autorizados = 0` y `autorizado_hasta = null`.

## Comprobado sin hallazgo (resumen)

- **Revisor A.**
  - El PIN nulo o vacío, una cadena de 1 MB y el contador en 100 cuentan como fallo, sin errores y sin autorizar nada.
  - Ninguna función coteja y devuelve el resultado en la misma transacción.
  - La auditoría medida no lleva ni el hash ni ninguna cadena `$2x$`.
  - Las cuatro funciones definer tienen `search_path=""` y EXECUTE solo para `authenticated`.
  - Las firmas viejas ya no existen.
  - El tope de 2 en 60 s y el canje por lote en la centinela están bien.
  - El oráculo usa `contenedorDelProyecto()`.
- **Revisor B.**
  - Ningún llamador de las firmas viejas queda en `app/`, `lib/` ni `accesibilidad/`.
  - No hay `{ get: true }` en ninguna llamada nueva.
  - M16 a M20 matan por el motivo correcto.
  - El 42501 «La historia no está desbloqueada» de `nota-clinica.spec.ts` es la sonda normal de `abrirEditorDeNota` con el candado cerrado (`servidor.ts:474`, `accesos.ts:51`, fuera del diff). No es una ventana abierta por los dos pasos.
- **Dato para el orquestador.** Hay un `PIN_FALLIDO` confirmado de 1111… a las 10:38:14 sin ninguna sesión de GoTrue de Ana. Parece una medida hecha fuera de rollback.
