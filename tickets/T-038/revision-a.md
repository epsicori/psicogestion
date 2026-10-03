Sin hallazgos ALTA. Revisor A, ronda 3: 0 ALTA, 0 MEDIA, 2 BAJA.

## Revisor A · base, seguridad y guiones (ronda 3)

- **Diff:** `worktree-agent-ac39d19a23cb82596..worktree-agent-a3f1df59a02f0397d` (HEAD `b05d3e3`), comparado fichero a fichero contra la rama de la ronda 2. También se repasó el conjunto `main...worktree-agent-a3f1df59a02f0397d` en lo que me toca.
- **Dónde se midió:** en `supabase_db_Psicogestion`, con `max(version) = 20261008120000` y el cuerpo de C9 ya aplicado. Todo dentro de `begin … rollback`, sin `db reset` y sin sembrar nada.
- **Rol de la medición:** se midió como `supabase_admin -d postgres`, porque `postgres` no puede fijar `plpgsql_check.enable_tracer`.

### Hallazgos de la ronda 2

| Id | Estado | Cómo se comprobó |
|---|---|---|
| A2-H1 | **Cerrado** | Detalle debajo de la tabla. |
| A2-H2 | **Cerrado** | `scripts/t038-concurrencia.mjs:196` exige `b.espero` con la misma aserción que la A, y antes de la de `ok|10`. Si no hay solape, `exigir` mete el fallo en `fallos` y la pasada B sale roja. |

**A2-H1, cómo se comprobó.** El arreglo tiene tres piezas:
- C9 en el evaluador;
- N1 para `plpgsql_check`, que pide `enable_tracer`, `tracer`, `tracer_errlevel` y `log_min_messages`;
- el envoltorio, que lee esas cuatro claves de `pg_settings`.

Se midió en vivo con `registro_postgres_seguro()` y, en la misma transacción, una función `pg_temp.sonda(p_contrasena text)` en PL/pgSQL. Después se buscó la sonda en `docker logs`. Para que C7 no tapara el resultado se fijó `statement_timeout = 8000`; sin eso, `auto_explain.log_min_duration` (10000) da falso por su cuenta.

| `tracer_errlevel` / `log_min_messages` | Evaluador | ¿Llega al registro? |
|---|---|---|
| valores de fábrica (trazador apagado) | t | no |
| los mismos, como `authenticated` | t | no |
| notice / warning | t | no |
| notice / notice | **f** | sí |
| notice / log | t | no |
| log / log | **f** | sí |
| log / error | **f** | sí |
| log / warning | **f** | sí |
| log / fatal | t | no |
| log / panic | t | no |
| info / error | t | no |
| info / info | **f** | sí |
| debug1 / debug1 | **f** | sí |

El evaluador coincide con el registro real en las 13 combinaciones. Dos conclusiones:
- **El orden de niveles es el correcto.** El orden de `v_niveles` (con `log` entre `error` y `fatal`) es el que aplica `is_log_level_output` al registro del servidor, no el del cliente.
- **N1 no deja la acción siempre bloqueada.** Con la imagen de fábrica, `plpgsql_check` está en `shared_preload_libraries`, sus claves salen en `pg_settings`, el trazador está apagado y el resultado es `t`.

Detalles que también se comprobaron:
- El alias `debug` se guarda como `debug2`, que está en el arreglo.
- Los valores posibles de `tracer_errlevel` en esta imagen son `debug5..debug1, info, notice, log`, y todos están en el arreglo.

**Las negativas del banco distinguen cada pieza.** Se razonó mutante por mutante:
- Si se quita el bloque N1 de `plpgsql_check`, las tres negativas `t38_ev_sin(...)` pasan a dar `t`, porque con `enable_tracer` en `off` o en `null` y `tracer` en `off`, el `and` da `false` sin pasar por el `coalesce`. Cada una pone el banco en rojo.
- Si `>=` se cambia por `>`, salta la negativa notice/notice.
- Si `log` se coloca entre los `debug`, que es el orden del cliente, salta la negativa log/warning.
- Si se quita cualquiera de las dos condiciones `on`, salta su gemela.

### BAJA

- **A3-H1** · `lib/cuentas/totp.ts:57`
  - **Qué falla:** se traduce cualquier 42501 de `generar_codigos_recuperacion()` como «el segundo factor tiene más de cinco minutos». Pero esa función lanza 42501 por cuatro causas:
    - no hay sesión;
    - el perfil no está activo;
    - el segundo factor no es reciente;
    - **ya hay códigos vigentes** (Q3(B), en `supabase/migrations/20261008120000_regenerar_codigos_recuperacion.sql:509`).
  - **Escenario:**
    1. En `/primera-vez` el usuario pulsa «Reintentar».
    2. La acción llega a confirmar los diez códigos, pero la respuesta se pierde. El `catch` muestra `sinRespuesta` (`segundo-factor.tsx:117`).
    3. Un minuto después vuelve a pulsar «Reintentar», con el segundo factor aún dentro de los cinco minutos.
    4. La base contesta 42501 «Ya tienes códigos de recuperación vigentes».
    5. La vista dice «Tu verificación en dos pasos se hizo hace más de cinco minutos y ya no vale…», que es falso.
  - **Alcance:** la salida que ofrece (volver a entrar y regenerar en Mi cuenta con la contraseña) sí resuelve el caso. Lo que falla es la causa que se le da al usuario.
  - **Prueba:** la de `lib/cuentas/totp.test.ts` usa un 42501 con el mensaje «sin segundo factor reciente». No prueba la rama Q3(B), que comparte el código.
- **A3-H2** · `docs/bitacora/T-038.md:56`
  - **Qué falla:** la nota de despliegue de Q1, la única que existe según `docs/state.md`, solo nombra dos de las nueve condiciones: C2 y C7. La ronda 3 añade C9 sin ampliarla.
  - **Escenario:**
    1. En producción, un operador activa el trazador de `plpgsql_check` a nivel `log` para depurar otra función.
    2. Desde ese momento, cada regeneración devuelve `registroInseguro` («avisa al administrador»).
    3. El administrador sigue la nota, comprueba `log_parameter_max_length_on_error` y `auto_explain`, y los dos están bien.
    4. Nadie puede regenerar códigos y la nota no da la causa.
  - **Alcance:** la acción falla cerrada y no se filtra nada. El problema es que la nota no deja diagnosticarlo.
  - **Lo mismo pasa** con C1, C3 a C6 y C8, que ya estaban en la ronda 2.

### Comprobado sin hallazgo

- **Otros ajustes de `plpgsql_check`** (se listaron todos en `pg_settings`):
  - `trace_assert` es de contexto `user`, pero solo enseña variables cuando falla un `ASSERT`, y ninguna función de las migraciones usa `ASSERT`;
  - `profiler`, `mode` y los avisos no escriben los valores de los argumentos.
- **Resto de bibliotecas precargadas:**
  - `pg_stat_statements` guarda texto normalizado;
  - `pg_cron` registra solo sus propios trabajos;
  - de `plan_filter`, un error cae en C2;
  - `pg_tle`, `pg_net`, `pgsodium`, `supabase_vault` y `supautils` no escriben parámetros de RPC.

  La propuesta más amplia de A2-H1 (una lista de bibliotecas permitidas en N1) no se adoptó. Queda para el arquitecto; no cuenta como hallazgo, porque hoy ninguna biblioteca precargada escribe parámetros sin una regla que la cubra.
- **`app/primera-vez/acciones.ts`:** devuelve `resultado` tal cual. El tipo solo lleva `mensaje` y `reentrar`; no viaja nada más al cliente.
- **`formulario-regenerar.tsx`:** en B2-H4 el `catch` sigue vaciando la contraseña (`reset`) antes de cambiar de vista, y no registra nada.
- **Comentario L8 de `scripts/rls/13-cuentas.sql`:** es exacto para `postgres`. La medición en vivo de C9 la cubre la tabla de arriba.
