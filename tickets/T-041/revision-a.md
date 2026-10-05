**Sin hallazgos ALTA.** 0 ALTA · 0 MEDIA · 2 BAJA (A2-H1 coincide con B2-H4).

# T-041 · Revisión A (base de datos, RLS y seguridad) — ronda 2

- **Diff de la ronda:** `git diff worktree-agent-ada3a424c2ef63d80..worktree-agent-ae6f460142344cc25 -- . ':!tickets'`, de `9e0033c` a `1d6f244`.
  - El commit propio es `e48ded8` (A-H1..H5).
  - Mi foco también incluye `carga.ts` (`192a4ce`) y la lectura de `centros` en `invitar.ts` (`57889db`).
  - `panel-resumen.tsx` y `docs/state.md` entran por el merge de main `d9865df` (T-028 C), así que no son de este ticket.
- **Migración:** `20261010120000` se corrigió en su sitio. La base local ya tenía el cuerpo nuevo (`pg_get_functiondef(...) ~ 'fecha de hoy'` = t).
- **Cómo medí:** todo en la base compartida, dentro de `begin … rollback` y sin `db reset`.
  - Cada ejecución empieza por `create or replace` de las tres funciones de HEAD, con el texto tal cual sale de la migración.
  - Si hay mutante, va a continuación el cuerpo mutado. Después corre el banco entero (`scripts/rls/*.sql` del worktree) y al final `rollback`.
  - Uso `docker exec supabase_db_Psicogestion` directamente, porque hay dos `supabase_db_*` en marcha.
- **Línea base:** banco entero en verde, con «28-altas-de-centro: completo.» (repetida al final, después del reinicio del contenedor).
- **Incidencias de la base compartida:**
  - Durante la medición alguien reinició el contenedor (`Up 9 minutes` a mitad de la tanda).
  - Otro banco concurrente provocó un deadlock en la primera ejecución de M4.
  - La primera de M11 se cortó en el módulo 21, sin ERROR y sin «completo».
  - Ninguna de esas tres ejecuciones cuenta. Repetí M4, M11, M7 y M12 en una tanda limpia.

## Cierre de la ronda 1

| Hallazgo | Arreglo | Mutante sobre el banco entero |
|---|---|---|
| A-H1 (MEDIA) ciclo dar → retirar → dar → retirar | 28.F11, F12 y F13 sobre INV2·C41A, después de F10 | M4 (idempotencia sin `hasta is null`) **muere** en 28.F11 · M5 (`where` de retirar sin `hasta is null`) **muere** en 28.F13 con el 42501 del disparador · M8 (principal sin `hasta is null`) **muere** en 28.F12 |
| A-H2 (BAJA) cierre fechado en el pasado | El disparador exige `new.hasta = current_date` (`migración:195`). 28.E9 prueba ayer → 42501, mañana → 42501 y hoy (gemela) pasa | M12 (sin la comprobación de fecha) **muere** en 28.E9 «fecha pasada» |
| A-H3 (BAJA) F6 solo con suspendido | 28.F6 «Destino de baja» | M3 (`= 'suspendido'`) **muere** en 28.F6 «de baja» |
| A-H4 (BAJA) `for update` sin prueba | 28.G4b lee `for\s+update` en el catálogo de las dos RPC | M6 (dar) y M11 (retirar) **mueren** en 28.G4b |
| A-H5 (BAJA) cotejo de `id` sin negativa | 28.E3 con `set id = gen_random_uuid()` → 42501 con el texto | M7 **muere** en 28.E3 «el id» |

Los cuatro que ya morían en la ronda 1 (M1, M1b, M2 y M10) siguen igual: sus pruebas no han cambiado y la línea base está verde.

**Lo que el arreglo de A-H2 podía romper:**
- Revisé todos los escritores de `perfiles_centros.hasta`. Usan `current_date`: la RPC (`:151`), `scripts/rls/06:23`, `12:220` y `19:742`.
- Ninguna migración, ni `app/`, ni `lib/`, ni las siembras cierran filas.
- `scripts/t002-enmienda-multicentro.sql:143` usa `current_date + 30`, pero queda fuera de CI y ya lo rechazaba el check `hasta <= current_date`.
- Cambiar solo `principal` en una vigente sigue pasando (28.E4), porque la comprobación nueva solo actúa con `new.hasta is not null`.
- La RPC y el disparador comparten transacción, así que comparten `current_date` y la zona de la sesión.

## BAJA

- **A2-H1** `lib/cuentas/invitar.ts:73` (= **B2-H4**)
  - **Qué pasa:** si falla la lectura de `centros`, el administrador ve el mismo mensaje que si un centro estuviera cerrado.
  - **Escenario:**
    1. El administrador envía una invitación con [Madrid principal, Canarias].
    2. `GET /centros?id=in.(…)` falla de forma transitoria: corte o tiempo agotado de PostgREST.
    3. `todosAbiertos` vale `false` y se devuelve «Un centro elegido ya no está abierto. Recarga la pantalla y revisa los centros.».
    4. Al recargar, los dos centros siguen abiertos. El administrador busca un cierre que no existe.
  - **Lo que sí está bien:**
    - El fallo deja la cuenta sin crear, que es lo seguro, y queda en `console.error`.
    - La prueba B-H4 solo simula `error: null`, así que la rama del error no tiene ninguna prueba.
    - En la práctica esa rama equivale a la del centro cerrado: quitar `!errorCentros` no cambia el resultado.
  - **Arreglo:** un `motivo` y un texto propios para la lectura fallida («No se pudo comprobar los centros; inténtalo de nuevo») y una prueba con `error` no nulo.
- **A2-H2** `scripts/rls/README.md:51`
  - **Qué pasa:** la línea del banco 28 no recoge lo que añade esta ronda:
    - el `id` en E3;
    - E9 (cierre con la fecha de hoy);
    - F6 de baja;
    - F11 a F13 (ciclo sobre un mismo par);
    - G4b.
  - Su lista «Mutantes medidos a mano» sigue con los cuatro de la ronda 1. Faltan M3 a M8, M11 y M12, que ahora mueren.
  - **Escenario:**
    1. Un ticket posterior toca `fn_perfiles_centros_solo_cierre` o el `where` de `retirar_alta_centro`.
    2. Consulta el README para saber qué mutantes repetir.
    3. Ve solo el cotejo de `centro_id` y la fila cerrada, y no repite el de la fecha ni el del ciclo.
    4. Un cambio que reabra A-H1 o A-H2 se cierra con la cobertura «documentada» en verde.
  - Es el patrón «README sin las secciones nuevas».
  - **Arreglo:** ampliar la línea 51 con E3 (`id`), E9, F6 de baja, F11 a F13, G4b y los ocho mutantes.

## Foco nuevo: `directorio_perfiles` en `carga.ts` y `centros.activo` en `invitar.ts`

**`app/(app)/ajustes/centros/carga.ts:63`**
- **Qué expone la vista:** `directorio_perfiles` es `security_invoker = false` con `security_barrier`. Da `id, nombre_completo, rol, estado, centro_id` a cualquiera con `rol_actual() is not null`.
  - El administrador no ve con ella nada que no vea ya cualquier compañero.
  - `motivo_estado` no está en la vista (`20260822160000:1390`).
  - Es la puerta correcta: `perfiles` solo tiene `perfiles_lectura_propia`, y la recursión impide añadirle otra política (`20260829180000:64`).
- **Filtros:** `estado = 'activo'` y `rol in (profesional_sanitario, administrador)` coinciden con P7 y con la lista cerrada de las RPC.
  - `centro_id` se pide y no se usa, pero es una columna del directorio abierto.
- **Errores:** los de `directorio_perfiles`, `perfiles_centros` y `centros` dan `ok: false`. Solo `organizacion` cae a `Europe/Madrid`, y la zona solo formatea `desde`.
- **Centros cerrados:** la página no ofrece los inactivos, y lo que manda sigue en la RPC (23514).

**`lib/cuentas/invitar.ts:62-81`**
- **¿Se lee por la sesión?** Sí: es `sesion.supabase`, no el cliente de administración.
  - `centros_lectura` deja leer todos los centros, abiertos y cerrados, a cualquier `rol_actual()` no nulo (medido en `pg_policies`).
  - Por eso un centro cerrado se ve como `activo = false`, no como ausente.
- **¿Qué pasa si falla?** No se crea la cuenta y se devuelve `motivo: 'centro'` con el texto del centro cerrado (A2-H1).
- **Residuo sin candado:** entre esta lectura y `inviteUserByEmail` queda una ventana. Medí en el catálogo que ni `fn_crear_perfil_de_usuario()` ni `preparar_invitacion()` miran `activo`.
  - Un cierre en esos milisegundos dejaría el principal en un centro cerrado.
  - Las adicionales no corren ese riesgo: las vuelve a comprobar `dar_alta_centro`.
  - Cerrar la ventana exige tocar el disparador de GoTrue, y P1 lo excluye. No lo elevo (B lo anota igual).
- **Orden:** la lectura va después de `preparar_invitacion()`, que ya exige administrador. Un no administrador no llega a ella, y `exigirAdministrador()` está antes.

## Comprobado sin hallazgo

- **28.E9** se ejecuta como ADM sobre una fila insertada como postgres (`desde = hoy - 5`), dentro de un savepoint.
  - El caso «mañana» también moriría por el check de tabla (23514 ≠ 42501): la prueba exige el 42501 con el texto del disparador, así que discrimina.
- **28.F13** cuenta dos filas del par con `hasta = current_date`: la de F10 y la nueva. Las dos se cierran en la misma transacción.
- **28.G4b** es la técnica que propuse en la ronda 1. Mata quitar el `for update`.
  - Como lee el texto, no mataría moverlo a otra `select` de la función ni añadirle `nowait` o `skip locked`.
  - Lo dejo como límite conocido, sin escenario de fallo que lo justifique como hallazgo.
- **Sin cambios de firma, permisos ni políticas.** El diff de la migración solo toca el cuerpo y el comentario de `fn_perfiles_centros_solo_cierre`.
- **`acciones.ts`:** `nombresDeCentros` lee `centros` por la sesión, y un error cae al uuid del centro, que no es dato de paciente. El resto de la acción es de B (B2-H1, B2-H2).
