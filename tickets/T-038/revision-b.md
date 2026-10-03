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
