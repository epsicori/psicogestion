**Sin ALTA. Gate combinado tras la ronda 4: 0 ALTA, 0 MEDIA, 3 BAJA** (B3-H1 cerrado; siguen abiertos A3-H1 y A3-H2 de la ronda 3, fuera de esta ronda; nuevo R4-H1, BAJA).

# T-038 · Revisión, ronda 4 (solo B3-H1)

Un solo revisor: la ronda es de riesgo bajo dentro de un ticket de riesgo alto.

- **Diff revisado:** `b05d3e3...23526fb` (rama `worktree-agent-afb56cf928f6caf81`, commit `23526fb`). Contrato de la ronda: `tickets/T-038/diseno.md` §«R4 · Ronda 4: solo B3-H1».
- **Ficheros del diff:** `lib/i18n/es.ts` (1 línea) y `app/(app)/cuenta/formulario-regenerar.test.tsx` (+5/−3). Nada más: se cumple «nada fuera de los dos ficheros».
- **Ejecutado en el worktree, sin modificarlo:** `npx vitest run "app/(app)/cuenta/formulario-regenerar.test.tsx"`: 12 de 12. Los mutantes del texto se han evaluado con un script de node en el scratchpad de la sesión, que aplica las cuatro aserciones del caso a cada redacción, sin tocar el árbol. No se ha tocado la base ni se ha hecho `db reset`.

## B3-H1: cerrado

| Punto | Estado | Cómo se comprobó |
|---|---|---|
| El reintento se pide sin condición | **Sí** | `es.ts:288`: «Vuelve a regenerarlos en cualquier caso: así tendrás una lista nueva que sí vale». No queda ningún «si aparece», ni ninguna otra mención al aviso. El texto es el del diseño, palabra por palabra. |
| No queda ningún criterio que no discrimine | **Sí** | El aviso «Códigos de recuperación nuevos» ya no aparece en el texto. `git grep` de «si no aparece», «lista de avisos de seguridad» y «ya no valdr» fuera de `tickets/`: solo sale en la aserción negativa de la prueba. |
| «La lista que tienes en papel ya no vale» si se regeneraron | **Cierto** | El paso dos marca `usado_en = now()` en los códigos vigentes (`20261008120000:426-428`) antes de insertar el lote nuevo. |
| «La nueva no se te ha enseñado» | **Cierto en el único camino que pinta el texto** | `resultadoDesconocido` solo se pinta en el `catch` de `formulario-regenerar.tsx:77-81`, es decir, cuando `regenerarCodigos` se rechaza. En ese caso no llega ningún `estado`, así que no llega ningún `codigos`, y la vista `codigos` no se monta. Si el paso dos no llegó, la frase va en condicional («Si se regeneraron…»), así que no afirma nada falso. |
| El reintento funciona en los dos casos | **Sí** | (a) Si no se regeneró, regenerar es lo pedido. (b) Si se regeneró, el paso dos vuelve a caducar el lote vigente y da uno nuevo: Q3(B), «ya hay códigos vigentes», está solo en `generar_codigos_recuperacion()` (activación, `:465-510`), no en la regeneración. El bloqueo de 15 min solo cuenta contraseñas erróneas (`:333-335`), y un éxito pone el contador a 0, así que el reintento con la contraseña buena no se bloquea. |
| La prueba mira la instrucción | **Sí, con un hueco: R4-H1** | Exige la frase imperativa «Vuelve a regenerarlos en cualquier caso», que es la instrucción y no una palabra suelta, y niega «si no aparece» y «lista de avisos». No niega una condición escrita de otra forma: lo recoge **R4-H1**. |
| Mata el mutante del diseño | **Sí** | Con el texto de la ronda 3 la prueba sale **en rojo**: le falta «Vuelve a regenerarlos en cualquier caso», contiene «si no aparece» y contiene «lista de avisos» (tres aserciones en rojo). Con el texto nuevo, **en verde**. |

## BAJA

- **R4-H1** · `app/(app)/cuenta/formulario-regenerar.test.tsx:160-161`
  - **Qué falla:** el diseño (R4, «Prueba») pide que la descripción «no contiene «si no aparece» **ni ninguna otra condición sobre el aviso**». Las dos negativas solo cubren dos frases concretas: `/si no aparece/i` y `'lista de avisos'`. Una condición sobre el aviso escrita de otra forma pasa las cuatro aserciones.
  - **Escenario:** alguien retoca el texto a «… Vuelve a regenerarlos en cualquier caso, salvo que en tus avisos ya salga «Códigos de recuperación nuevos».» El caso sigue **en verde** (medido con el script: las cuatro aserciones se cumplen). Lo mismo pasa con «Si en tus avisos sale «Códigos de recuperación nuevos» con fecha de hoy, no hagas nada. Vuelve a regenerarlos en cualquier caso si no lo ves.». En los dos casos vuelve B3-H1: quien ya tiene el aviso de la activación no reintenta y, en el caso (b), se queda sin ningún código válido.
  - **Arreglo posible:** que la negativa compruebe que el aviso no se nombra, sea cual sea la redacción: `not.toHaveAccessibleDescription(expect.stringContaining(t('…codigos_regenerados')))`, o la etiqueta literal «Códigos de recuperación nuevos». Si se quiere dejar el aviso como explicación, como propuso B3-H1, entonces hay que negar los conectores de condición junto al aviso (`/salvo|si (no )?(aparece|sale|ves)/i`).
  - **Alcance:** el texto de hoy está bien. El hueco solo deja pasar una regresión.

## Comprobado sin hallazgo

- **Título y «Volver».** El título sigue siendo «No sabemos si se han regenerado los códigos» (`es.ts:300`), y «Volver» sigue refrescando en el caso desconocido. Esto ya no es un criterio de decisión, pero sí sirve: el aviso con la fecha de hoy explica lo que pasó. El comentario de `formulario-regenerar.tsx:118` («el aviso que lo delata») no forma parte del diff y no le dice nada al usuario.
- **Territorio.** `lib/i18n/**` y `app/**` son de interfaz, que lleva la fábrica. El commit no toca `supabase/`, ni `docs/`, ni `tickets/`.

## Para el documentalista (fuera del diff, sin contar)

- `docs/bitacora/T-038.md:79` describe el arreglo de B2-H4 así: «nombra la lista en papel y la lista de avisos». Tras R4 el texto ya no nombra la lista de avisos. La fila es historia de la ronda 3, pero conviene añadir la línea de R4 (B3-H1: el reintento sin condición, mutante = texto de R3, en rojo) cuando se cierre A3-H2 en la misma bitácora.

# T-038 · Revisión, ronda 3

Esta ronda sustituye a la 2.

- **Diff revisado:** el de la ronda 3, `worktree-agent-ac39d19a23cb82596..worktree-agent-a3f1df59a02f0397d` (HEAD `b05d3e3`). También se repasó el conjunto `main...worktree-agent-a3f1df59a02f0397d`.
- **Cerrados de la ronda 2:** A2-H1, A2-H2 y B2-H1 a B2-H5. De dos de ellos sale un hallazgo nuevo: de B2-H4 nace B3-H1 y de B2-H5 nace A3-H1.
- **Duplicado:** A3-H1 (revisor A) y B3-H2 (revisor B) son el mismo hallazgo: `lib/cuentas/totp.ts:57` traduce cualquier 42501 como «segundo factor de hace más de cinco minutos». Se cuenta una vez, con el id A3-H1.

| Id | Sev. | Dónde | Qué |
|---|---|---|---|
| B3-H1 | MEDIA | `lib/i18n/es.ts:287` | El texto de resultado desconocido manda reintentar solo si no aparece «Códigos de recuperación nuevos». La activación inserta ese mismo aviso, así que la condición no se cumple nunca. Y si la regeneración sí se confirmó, el texto no dice que haga falta otra lista. |
| A3-H1 (= B3-H2) | BAJA | `lib/cuentas/totp.ts:57` | `reentrar` se marca ante cualquier 42501. Pero también es 42501 tener ya códigos vigentes (Q3(B), con el reto de hace 24 s en el banco 13), no tener sesión o tener el perfil inactivo. En todos esos casos la vista dice «hace más de cinco minutos», y es falso. |
| A3-H2 | BAJA | `docs/bitacora/T-038.md:56` | La nota de despliegue de Q1 nombra dos de las nueve condiciones (C2 y C7). La ronda 3 añade C9 y no la amplía. |

<!-- REVISOR-A -->
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

<!-- REVISOR-B -->
**Sin ALTA en la parte del revisor B** (ronda 3: 0 ALTA, 1 MEDIA, 1 BAJA).

# T-038 · Revisión, ronda 3 · Revisor B (interfaz, accesibilidad y TS)

**Qué se ha revisado.** El commit de la ronda 3 `b05d3e3`, sobre la rama `worktree-agent-a3f1df59a02f0397d`, en la parte de interfaz y TS. Además, el conjunto `main...b05d3e3` en `app/primera-vez/**`, `app/(app)/cuenta/**`, `lib/cuentas/totp.ts`, `lib/i18n/es.ts` y `accesibilidad/**`.

**Qué se ha ejecutado en el worktree, sin modificarlo:**
- `npx vitest run app/primera-vez "app/(app)/cuenta" lib/cuentas/totp.test.ts`: 73 de 73.
- `npx tsc --noEmit`: limpio.
- `eslint` sobre los ficheros tocados: limpio.

No se ha ejecutado `db reset`.

## B2-H1 a B2-H5 de la ronda 2

| # | Estado | Comprobación |
|---|---|---|
| B2-H1 | **Cerrado** | `reintentar` lleva `try/catch` (`segundo-factor.tsx:108-118`). La prueba monta una frontera de clase y rechaza la acción. La frontera no se activa, el `status` lo dice y «Reintentar» sigue habilitado. Mutante «sin catch» en rojo (`mutantes-r3-ui.json`). `verificar` (T-037) sigue anotado en `docs/state.md:35`. El texto del `catch` tiene un matiz: lo recoge **B3-H2**. |
| B2-H2 | **Cerrado** | `fallo` es un objeto nuevo en cada fallo, así que el efecto `[fallo]` vuelve a correr aunque el texto sea el mismo. La prueba simula el `blur()` que hace Chromium al deshabilitar, y con el efecto atado al texto queda en rojo. El foco también vuelve a la región cuando «Reintentar» se sustituye por «Volver a entrar»: el botón enfocado se desmonta y el objeto es nuevo. |
| B2-H3 | **Cerrado** | Hay un `{' '}` real antes de la marca. Vitest mira `textContent` (`/\S\s+Sin leer$/`) y Playwright S6 mira `ariaSnapshot`. Sin el espacio sale en rojo. |
| B2-H4 | **Cerrado en lo que afirmaba; abre B3-H1** | El rechazo ya no dice «No se han regenerado»: el título es «No sabemos si se han regenerado los códigos» y «Volver» refresca para que salga el aviso. Ahora bien, la regla que el texto da para decidir no discrimina, y deja de pedir el reintento que el texto anterior sí pedía: **B3-H1**. |
| B2-H5 | **Cerrado en el caso medido; abre B3-H2** | Con el reto TOTP caducado, la vista dice por qué y ofrece «Volver a entrar», que hace `cerrarSesion`, `signOut` y `redirect('/login')`. El foco va a la región. La salida es buena: si queda el PIN pendiente, `fijar_pin_historia` también exige un reto reciente (`20260830090000:873`), así que «Aceptar» no bastaría. Pero la marca se pone ante **cualquier** 42501: **B3-H2**. |

## MEDIA

- **B3-H1** · `lib/i18n/es.ts:287` (`cuenta.errores.resultadoDesconocido`), que pinta `app/(app)/cuenta/formulario-regenerar.tsx:81`
  - **Problema.** El texto manda reintentar solo «si no aparece» el aviso «Códigos de recuperación nuevos». Ese aviso lo inserta también la **activación**: `generar_codigos_recuperacion()` lo escribe en `20261008120000:530`, con el mismo tipo `codigos_regenerados` y la misma etiqueta (`es.ts:1032`). Por tanto, toda persona que activó o regeneró desde T-038 ya lo tiene en la lista, y la condición del reintento no se cumple nunca. Hay un segundo problema: si el aviso aparece porque la regeneración se confirmó, el texto tampoco dice que haya que regenerar otra vez. En ese caso la lista en papel ha caducado y la nueva nunca se enseñó.
  - **Escenario.**
    1. Ana activa el 05-10 y en su lista queda «Códigos de recuperación nuevos · 05/10».
    2. El 20-11 regenera y la acción se rechaza por transporte.
    3. Caso (a): el paso dos no llegó. Ana pulsa «Volver», la lista se refresca y ve el aviso del 05-10. Como «aparece», no reintenta, y además cree que su papel ya no vale, aunque sigue valiendo.
    4. Caso (b): el paso dos se confirmó. Ve el aviso nuevo, no reintenta y se queda **sin ningún código válido**: el papel caducó y el lote nuevo no se le mostró. Si pierde el móvil, depende de que el administrador le reponga el TOTP.
    5. El texto anterior, «No se han regenerado… Vuelve a intentarlo», mentía sobre el estado, pero llevaba al reintento, y el reintento es lo correcto en los dos casos.
  - **Arreglo posible.** Pedir el reintento sin condición: «en los dos casos necesitas una lista nueva». El aviso queda solo como explicación.
  - **Por qué la prueba no lo ve.** Busca las palabras («en papel», «lista de avisos») y no la instrucción.

## BAJA

- **B3-H2** · `lib/cuentas/totp.ts:57` (y la vista en `app/primera-vez/segundo-factor.tsx:111,163`, con el texto en `es.ts:252`)
  - **Problema.** `reentrar` se marca con `error?.code === '42501'` y no mira nada más. Pero `generar_codigos_recuperacion()` lanza 42501 por cuatro causas: «No hay sesión», «El perfil no está activo», el reto caducado y **Q3(B), «Ya tienes códigos de recuperación vigentes»**. El banco 13 mide esta última con el reto de hace **24 segundos** (`scripts/rls/13-cuentas.sql:797-803`). En las cuatro, la vista dice «Tu verificación en dos pasos se hizo hace más de cinco minutos». En la llamada de `verificar` (`:163`), que va justo tras `mfa.verify`, esa frase es siempre falsa.
  - **Escenario.**
    1. Tras el TOTP, la respuesta de `generar_codigos_recuperacion()` se pierde después del commit. Puede llegar como error de supabase-js o como rechazo de la acción; en este segundo caso, el nuevo `catch` de B2-H1 dice «No hemos podido contactar con el servidor… vuelve a intentarlo».
    2. A los 30 s la persona pulsa «Reintentar». Hay lote vigente y salta Q3(B) con 42501.
    3. Ve «se hizo hace más de cinco minutos», que es falso, y «Volver a entrar», que cierra la sesión (`signOut` con el alcance por defecto).
    4. La salida remite a Mi cuenta, que es la correcta para Q3(B). Lo que está mal es la causa que se le da.
  - **Arreglo posible.** Distinguir por el mensaje, que es fijo en el SQL, o hacer neutro el texto de `reentrar`: «tu verificación ya no vale para generarlos aquí; vuelve a entrar y genéralos en Mi cuenta».

## Fuera del diff

Nada nuevo. `verificar` (T-037) sigue en `docs/state.md:35`.
