# T-037 · Diseño — los códigos de recuperación solo se generan al activar el segundo factor

> Arquitecto, 02-10-2026. Riesgo alto. Un solo corte. **No toca `supabase/`**: la función
> `generar_codigos_recuperacion()` no cambia (§2, D3). Preguntas para el propietario al final.

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | El fallo: tras un `mfa.verify()` correcto, `verificar()` llama a `generarCodigos()` **sin mirar en qué rama está**. La rama «ya tengo factor» (`factorVerificadoId !== null`) pasa por ahí en cada entrada. | `app/primera-vez/segundo-factor.tsx:94-116` (la llamada en `:106`) |
| H2 | El docblock del componente afirma el comportamiento erróneo como diseño: «En los dos casos, al superarlo se generan los códigos de recuperación». | `app/primera-vez/segundo-factor.tsx:32-34` |
| H3 | La rama la decide **el servidor**: `PasoPendiente` lee `sesion.supabase.auth.mfa.listFactors()` y pasa `factorVerificadoId` = id del primer factor TOTP con `status === 'verified'`, o `null`. | `app/primera-vez/page.tsx:33-40` |
| H4 | `listFactors()` no lee el token: llama a `getUser()`, que va a GoTrue (`/user`), que lee `auth.mfa_factors`. Es un dato de la base, no del cliente. | `node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:4980-4982` |
| H5 | Toda entrada con un factor ya activo pasa por `/primera-vez`: `primerAccesoPendiente()` devuelve `'totp'` si la sesión no es `aal2`, y el proxy redirige allí. | `lib/cuentas/primer-acceso.ts:36-38`, `proxy.ts:26,110` |
| H6 | `generar_codigos_recuperacion()` tiene **una sola definición** (sin redefiniciones posteriores): exige sesión, perfil activo y `segundo_factor_verificado_recientemente()` (`aal2` + reto en los últimos 5 min), **caduca el lote vigente** (`usado_en = now()`) y emite diez nuevos. | `supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql:548-594` (caducidad en `:575-579`); `grep -ln` solo la encuentra ahí y en `scripts/rls/` |
| H7 | La migración **prevé la regeneración** por el titular: «lo que exige volver a pedir en cualquier regeneración posterior». El RPC tiene `grant execute ... to authenticated`: el titular puede llamarlo por PostgREST con su propio JWT sin pasar por ninguna pantalla. | misma migración `:544-547`, `:908`, `:916` |
| H8 | `codigos_recuperacion_totp`: RLS activo, cero políticas, `revoke all` **también a `service_role`**. Ni la aplicación ni el cliente de administración pueden leer el lote; solo `postgres` (psql) y las funciones `definer`. | misma migración `:117-148` |
| H9 | Canjear un código marca **solo ese** como usado (el resto del lote sigue vigente) y la aplicación borra el factor TOTP; la siguiente entrada es una **activación** nueva, que caduca los nueve restantes al generar. La reposición por el administrador también borra el factor. | migración `:691-697`; `lib/cuentas/totp.ts:72-94`, `:30-44` |
| H10 | `generarCodigos` solo se llama desde `segundo-factor.tsx:106`; ninguna otra pantalla genera ni regenera códigos. | `grep -rn generarCodigos app lib` |
| H11 | El texto de la rama «entrar» ya existe (`primeraVez.totp.yaEnrolado`); el arreglo **no necesita textos nuevos** (y `lib/i18n/**` está fuera del territorio). | `lib/i18n/es.ts:232` |
| H12 | Patrón de prueba de componente de esta carpeta: `vi.mock('./acciones')`, `vi.mock('next/navigation')` con `useRouter: () => ({ refresh })`, importación dinámica del componente. | `app/primera-vez/formulario-pin.test.tsx:1-14` |
| H13 | La ruta de la prueba de RLS (`scripts/rls/13-cuentas.sql:279-419`) ya cubre la función; este ticket no la cambia y `test:rls` solo se corre como regresión. | `scripts/rls/13-cuentas.sql` |
| H14 | `territorio.mjs` permite siempre `tickets/T-037*`, `tickets/T-037/**`, `docs/bitacora/**` y `docs/state.md`. | `~/.claude/pipeline/territorio.mjs:34` |

## 1 · Piezas y contratos

### P1 · `app/primera-vez/segundo-factor.tsx` (modificar)

- **Prop sin cambios**: `factorVerificadoId: string | null`. Su significado pasa a ser contractual y
  se escribe en el docblock de `Props`: *no nulo ⇒ entrada con un factor ya activo (no se generan
  códigos); nulo ⇒ activación (se enrola, se verifica y se generan los códigos una vez)*.
- En `verificar()`, **inmediatamente después** del bloque `if (error) { ... return; }` del
  `mfa.verify()` (hoy `:100-104`) y **antes** de `generarCodigos()`, se añade exactamente:

  ```ts
  if (factorVerificadoId !== null) {
    // Entrada con un factor ya activo: el lote vigente no se toca (ADR-039, T-037).
    router.refresh();
    return;
  }
  ```

  La condición es `factorVerificadoId !== null` y **no** `!enrolamiento`, `factorId === ...` ni nada
  derivado de estado del cliente: el único dato que decide es el que vino del servidor (H3, H4).
- El resto de `verificar()` (generar, `ok: false` ⇒ mensaje + `refresh`, `ok: true` ⇒ pantalla de
  códigos) queda igual: ahora solo se alcanza en la activación.
- Reescribir el docblock del componente (`:20-35`): sustituir el párrafo «En los dos casos…» por
  «Solo en la activación se generan los códigos de recuperación y se enseñan una sola vez (ADR-039);
  al entrar con un factor ya activo, superarlo solo refresca: el lote vigente no se toca (T-037)».
- Nada más en este fichero: ni el `useEffect` de enrolamiento, ni el JSX, ni el `retoId`.

### P2 · `app/primera-vez/acciones.ts` (solo comentario)

Docblock de `generarCodigos` (`:12-16`): añadir que la pantalla la llama **solo al activar** el
factor, y que no es una barrera: el titular puede regenerar su lote llamando al RPC con su JWT, y la
base lo permite con reto TOTP reciente (H7). Sin cambio de firma ni de cuerpo.

### P3 · `app/primera-vez/page.tsx` (solo comentario)

En el comentario de `:34-36`, una frase: esta lectura de `listFactors()` es **la que decide** si
superar el factor genera códigos (activación) o no (entrada) — T-037. Sin cambio de código.

### P4 · `app/primera-vez/segundo-factor.test.tsx` (nuevo; la prueba que falla primero)

Mocks (patrón H12):
- `./acciones` → `{ generarCodigos }` con `generarCodigos = vi.fn()`; en `beforeEach`,
  `generarCodigos.mockResolvedValue({ ok: true, codigos: DIEZ })` con `DIEZ` = diez cadenas distintas
  (`'AAAA000001'`…). **Importante**: si el mock devolviera `undefined`, el código actual rompería con
  un `TypeError` en `resultado.ok` y la prueba fallaría por el motivo equivocado.
- `next/navigation` → `useRouter: () => ({ refresh })`.
- `@/lib/supabase/navegador` → `crearClienteNavegador: () => ({ auth: { mfa: { enroll, challenge, verify } } })`
  con `enroll`, `challenge`, `verify` como `vi.fn()` reseteados en `beforeEach`;
  `challenge.mockResolvedValue({ data: { id: 'reto-1' }, error: null })`,
  `verify.mockResolvedValue({ data: {}, error: null })`.
- Etiquetas reales del catálogo: campo `'Código de seis dígitos'`, botón `'Verificar'`, título de
  la pantalla de códigos `'Tus códigos de recuperación'`, botón `'Ya los he guardado'`.

Casos (nombres orientativos, aserciones exactas):

1. **«entrar con un factor ya activo no genera códigos»** (FALLA PRIMERO). `factorVerificadoId="factor-1"`.
   Teclear `123456`, pulsar Verificar. Esperar con
   `await waitFor(() => expect(refresh.mock.calls.length + generarCodigos.mock.calls.length).toBeGreaterThan(0))`
   (espera a que la rama posterior al `verify` haya corrido, sea cual sea). Después:
   `expect(generarCodigos).not.toHaveBeenCalled()`; `expect(refresh).toHaveBeenCalledTimes(1)`;
   `expect(enroll).not.toHaveBeenCalled()`; `expect(challenge).toHaveBeenCalledWith({ factorId: 'factor-1' })`;
   `expect(screen.queryByText('Tus códigos de recuperación')).toBeNull()`.
   **Motivo exacto del fallo sobre `main`**: falla la línea `expect(generarCodigos).not.toHaveBeenCalled()`
   (vitest: «… to not be called at all, but actually been called 1 times»; el texto literal depende de la
   versión, lo que cuenta es que falla **esa** aserción). Si falla por otra cosa (timeout del `waitFor`, `TypeError`, mock roto), la
   prueba está mal escrita.
2. **«activar el factor genera los códigos una vez y los enseña» (gemela positiva, CA1)**.
   `factorVerificadoId={null}`; `enroll.mockResolvedValue({ data: { id: 'factor-nuevo', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'SECRETO' } }, error: null })`.
   Esperar a que aparezca el QR (`getByAltText` con `primeraVez.totp.alt`), teclear, Verificar. Después:
   `enroll` llamado **una** vez; `challenge` con `{ factorId: 'factor-nuevo' }`; `generarCodigos`
   llamado **una** vez; título `'Tus códigos de recuperación'` visible; las diez cadenas en la lista;
   `refresh` **no** llamado hasta pulsar `'Ya los he guardado'`, y llamado una vez después. Pasa sobre
   `main` y con el arreglo: es la que impide el arreglo falso «no generar nunca».
3. **«un código erróneo al entrar no genera ni refresca»**. `factorVerificadoId="factor-1"`,
   `verify.mockResolvedValue({ data: null, error: { message: 'x' } })`. Tras pulsar: mensaje
   `primeraVez.totp.codigoNoValido` visible, `generarCodigos` y `refresh` sin llamar. Fija que el nuevo
   `return` va **después** del control de error y no antes (un `refresh` antes del `if (error)` dejaría
   pasar a quien teclea mal… hasta que la guardia lo devuelva, pero sería un bucle visible).

### P5 · Nada en `lib/cuentas/**`, `supabase/**`, `lib/i18n/**`

`lib/cuentas/totp.ts` no cambia (su docblock ya dice «para mostrar una sola vez», que sigue siendo
cierto). El territorio del contrato lo admite, pero el diseño no lo necesita.

## 2 · Decisiones y alternativas descartadas

- **D1 · El dato que decide es `auth.mfa_factors.status = 'verified'` del propio usuario, leído en el
  servidor al pintar `/primera-vez`** (H3, H4). Es la definición misma de «ya tengo un factor activo»;
  no hay heurística. Activación ⇔ no había ningún factor verificado cuando el servidor pintó el paso.
- **D2 · Un `return` explícito en el componente existente, no dos componentes**. Mínimo diff, misma
  prueba; partir el fichero en `activar-`/`retar-segundo-factor.tsx` duplicaba el reto/verificación
  (~25 líneas) sin cerrar nada más.
- **D3 · `generar_codigos_recuperacion()` NO cambia, y el territorio no se amplía a `supabase/`**. El
  fallo está en quién la llama, no en la función: su contrato (caducar el lote y emitir otro con reto
  TOTP reciente) es el de una **regeneración legítima** que la propia migración prevé (H7).
- **D4 · Sin guarda en la Server Action `generarCodigos`**. Descartada: el titular puede llamar al RPC
  directamente por PostgREST con su JWT (H7), así que una guarda en la acción sería teatro, y además
  no tiene con qué decidir: tras el `verify` el factor ya está verificado y el lote no es legible ni con
  `service_role` (H8).
- **D5 · Descartado decidir por «¿hay lote vigente?»** (generar solo si no lo hay). Exigiría una función
  nueva en la base (H8 ⇒ `supabase/`), y no coincide con «activar»: tras un canje quedan nueve vigentes
  y aun así hay que generar (H9).
- **D6 · Descartado comparar `mfa_factors.created_at` con el `creado_en` del lote**. Necesita leer el
  lote (misma razón que D5) y compara relojes de dos procesos (GoTrue y Postgres): eso sí es heurística.
- **D7 · Descartado decidir por estado del cliente** (`enrolamiento !== null`, `sessionStorage`, una
  bandera en la URL). El cliente no es fuente de verdad; el dato ya llega del servidor.
- **D8 · Qué pasa si el usuario cierra la pantalla antes de guardar los códigos** (lo pide el contrato):
  - El `verify` ya ha promovido la sesión a `aal2` y `generar_codigos_recuperacion()` ya ha insertado
    el lote: **el lote queda vigente en la base y el usuario no lo ha visto**. Los códigos en claro solo
    vivían en el estado de React; no hay forma de volver a enseñarlos (solo se guarda el hash bcrypt).
  - Al volver a entrar, el usuario tiene un factor verificado ⇒ rama «entrar» ⇒ **no se regeneran**
    (es exactamente lo que pide el CA2). Hoy, sin el arreglo, la siguiente entrada le daba un lote nuevo
    «por accidente»; con el arreglo, no.
  - Salidas que existen hoy: la **reposición por el administrador** (ADR-039; borra el factor ⇒ la
    siguiente entrada es una activación ⇒ lote nuevo que caduca el perdido). Salida que no existe: una
    pantalla de «regenerar mis códigos» (la base ya la soporta, H7). **Pregunta P-1 al propietario.**
  - Lo mismo vale para el caso `generarCodigos()` → `ok: false` durante la activación (comportamiento
    actual sin cambios: avisa y deja seguir; el usuario queda sin lote hasta una reposición).
- **D9 · La prueba que falla primero es de componente (vitest), y la comprobación «por consulta» del CA2
  es una evidencia contra la base real** (§3). Un spec de Playwright comprometido necesitaría
  `accesibilidad/**` (fuera del territorio). **Pregunta P-3.**

## 3 · Cómo se cierra cada criterio de aceptación

### CA1 · Al activar el factor por primera vez se generan los códigos y se muestran una sola vez

- `npm test -- app/primera-vez/segundo-factor.test.tsx`: caso 2 en verde (un `enroll`, un
  `generarCodigos`, diez códigos pintados, `refresh` solo tras «Ya los he guardado»).
- Contra la base real: pasos E1–E3 de abajo; la consulta Q tras E3 devuelve `vigentes = 10`.
- «Una sola vez»: tras «Ya los he guardado» el `refresh` lleva a PIN o a `/`; volver a `/primera-vez`
  con sesión `aal2` redirige (`page.tsx:28-31`). Se anota en la evidencia.

### CA2 · Una entrada posterior con TOTP no genera códigos nuevos; el lote es el mismo antes y después, por consulta

- Prueba que falla primero: caso 1 de P4, **ejecutado sobre `main` antes del arreglo** (salida con el
  mensaje exacto de §1 P4.1 guardada en la evidencia) y en verde después.
- Contra la base real (procedimiento E, en local, sin commit de nada fuera de territorio):
  - **Preparación**: `npx supabase db reset` → `npm run seed` → `npm run dev`. Usuario U = titular del
    factor sembrado `a0080004-0000-4000-8000-000000000002` (su `perfil_id`:
    `select user_id from auth.mfa_factors where id = 'a0080004-0000-4000-8000-000000000002'`).
  - **E1**: borrar el factor de U con la Admin API (script desechable en el *scratchpad*, con la clave
    de `npx supabase status -o env`; `auth.admin.mfa.deleteFactor`) — simula la reposición (H9). Al no
    quedar factor sembrado, el pase automático de T-033 no interviene aunque esté activo.
  - **E2**: entrar como U en el navegador ⇒ `/primera-vez` enseña QR y clave ⇒ calcular el código con
    `codigoTotp(clave, Date.now())` (`lib/cuentas/modo-desarrollo.ts:108`) ⇒ Verificar.
  - **E3**: aparece «Tus códigos de recuperación» con diez ⇒ **Q → L1**. Pulsar «Ya los he guardado».
  - **E4**: cerrar sesión (o ventana privada nueva), entrar otra vez como U ⇒ `/primera-vez` en la rama
    «Escribe el número de seis dígitos…» ⇒ código de la **siguiente** ventana de 30 s ⇒ Verificar ⇒ **no**
    aparece la pantalla de códigos ⇒ **Q → L2**.
  - **Criterio**: `L1 = L2` en las tres columnas (mismo `vigentes = 10`, mismos `ids`, mismo `ultimo`).
  - **Contraprueba** (recomendada; demuestra que Q discrimina): repetir E4 con el código de `main` sin
    el arreglo ⇒ `L2 ≠ L1` (ids distintos, `ultimo` posterior). Si en `main` también sale igual, la
    evidencia no prueba nada.
  - **Q** (como `postgres`; contenedor con `docker ps --filter name=supabase_db_ --format "{{.Names}}"`,
    nunca de memoria):

    ```sql
    select count(*) as vigentes,
           string_agg(id::text, ',' order by id) as ids,
           max(creado_en) as ultimo
      from public.codigos_recuperacion_totp
     where perfil_id = '<perfil de U>' and usado_en is null;
    ```

  Se pegan L1, L2 (y la contraprueba) literales en `tickets/T-037/evidencia.json`.

### CA3 · `npm test`, `npm run lint`, `npm run build`, `npm run test:rls` limpios; `territorio.mjs T-037` en verde

- `npm test` (1150 + 3 casos nuevos), `npm run lint`, `npm run build`.
- `npx supabase db reset && npm run seed && npm run test:rls` (19 suites; sin cambio esperado: la base
  no se toca). Nota: el procedimiento E deja filas; el `db reset` va **después** de E, no antes.
- `node ~/.claude/pipeline/territorio.mjs T-037` y `git diff --stat main -- supabase/ lib/i18n/` vacío.

## 4 · Riesgos, por probabilidad

1. **(Alta, de proceso) La prueba que falla primero falla por el motivo equivocado**: mock de
   `generarCodigos` sin valor ⇒ `TypeError`; o `waitFor(refresh)` que agota el tiempo antes de evaluar
   `generarCodigos`. Mitigado por la forma exacta de P4.1; el revisor exige ver el mensaje del fallo.
2. **(Media) Repetición del código TOTP en E4**: GoTrue puede rechazar un código ya usado en la misma
   ventana de 30 s. Esperar a la siguiente ventana.
3. **(Media) Usuario que cerró la pantalla sin guardar los códigos queda sin recuperación propia** hasta
   una reposición (D8). Es consecuencia del contrato, no regresión; hoy quedaba igual entre una entrada
   y la siguiente. P-1.
4. **(Baja) Dos pestañas activando a la vez** (dos factores sin verificar): cada `verify` es una
   activación y genera; el segundo lote caduca el primero. La última pantalla enseña el lote válido.
   No se mitiga (exigiría la base); se anota.
5. **(Baja) Factor borrado por el administrador entre el pintado y el `verify`**: el reto falla y se
   enseña `noSePudoEnrolar`; al refrescar, la página pinta la rama de activación. Sin daño.
6. **(Baja) El `refresh` de la rama «entrar» no ve `aal2`**: el mismo `router.refresh()` ya funciona
   hoy tras el `verify` (ruta `ok: false` y botón «guardados»), y `generarCodigos` —Server Action— ya
   veía `aal2` por cookie en ese punto. Se comprueba en E4 (llega a PIN o a `/`, no vuelve al reto).

## 5 · Qué revisar

- **Entradas que elige el llamante**: `SegundoFactor` solo recibe `factorVerificadoId`, y lo fija
  `page.tsx` desde `listFactors()` del servidor. Comprobar que `page.tsx` no ha cambiado de lógica y que
  ningún otro sitio monta `SegundoFactor` (`grep -rn SegundoFactor app`).
- **La condición** es literalmente `factorVerificadoId !== null`, colocada **después** de `if (error)`
  del `verify` y **antes** de `generarCodigos()`. Cualquier otra condición (sobre `enrolamiento`,
  `factorId`, `retoId`) es un rechazo.
- **La prueba 1 falla sobre `main` por el motivo exacto** (`generarCodigos` llamado 1 vez), con la salida
  en la evidencia; la prueba 2 (gemela) pasa sobre `main` y sobre la rama. Si la 2 falla con el arreglo,
  el arreglo es «no generar nunca».
- **Mutante a matar a mano**: quitar el `return` nuevo (o invertir la condición) ⇒ la 1 (o la 2) se pone
  roja. Anotarlo en la revisión.
- **CA2 por consulta**: L1 y L2 idénticos en `ids` **y** `ultimo`, y la contraprueba en `main` distinta.
  Sin contraprueba, Q no está demostrado como discriminante.
- **Otra puerta que sigue abierta, a propósito**: el titular con `aal2` y reto reciente puede regenerar
  por PostgREST (H7). No es un fallo de este ticket; si el revisor lo considera contrario al ADR-039, va
  a P-2, no se arregla aquí.
- **Lo que no debe aparecer en el diff**: `supabase/**`, `lib/i18n/**`, `lib/cuentas/**`,
  `scripts/rls/**`, `proxy.ts`, `app/login/**`; ni el script de E1 (vive en el *scratchpad*).
- **Docblocks**: el de `segundo-factor.tsx` ya no dice «en los dos casos»; el de `acciones.ts` no
  presenta la acción como barrera.
- **Sin textos literales nuevos** en el JSX (no hacen falta: H11).

## 6 · Territorio

El del contrato basta y sobra: `app/primera-vez/**` (se tocan `segundo-factor.tsx`, `acciones.ts`,
`page.tsx` y se crea `segundo-factor.test.tsx`) y `lib/cuentas/**` (no se usa). Más los comunes de
`territorio.mjs` (carpeta del ticket, `docs/bitacora/**`, `docs/state.md`). **No se pide `supabase/`.**

## 7 · Delegable

Nada. Es un cambio de comportamiento de autenticación (regla de `pipeline.md`: auth es de la fábrica),
de unas diez líneas más tres pruebas; no hay pintura que separar.

## Cortes

Uno solo: P1 + P2 + P3 + P4, en ese orden de commit lógico: primero P4 sobre `main` (rojo con el mensaje
exacto, guardado), después P1 (verde), después P2/P3 (comentarios), después E y CA3.

## Lo que no entra, y por qué

- **Pantalla «regenerar mis códigos»** (perfil/ajustes): es la salida natural de D8, pero es una pantalla
  y un flujo nuevos (reautenticación con contraseña + reto TOTP, H7 y comentario de la migración
  `:268-279`). Ticket propio si el propietario lo quiere (P-1).
- **Aviso `beforeunload` en la pantalla de códigos**: mitiga D8 en escritorio, no en móvil ni ante un
  cierre del navegador; añade comportamiento no pedido. Solo si el propietario lo pide (P-1).
- **Reintento in situ cuando `generarCodigos` falla en la activación**: comportamiento existente, fuera
  del CA; el usuario queda en la misma situación que D8.
- **Cerrar la regeneración en la base** (que el RPC solo funcione en la activación): exige `supabase/`
  y contradice lo que la migración prevé; solo si P-2 lo decide, y en otro ticket.
- **Factores TOTP huérfanos sin verificar** (cada visita sin terminar enrola uno): preexistente, sin
  relación con los códigos.
- **Spec de Playwright comprometido para el CA2**: fuera del territorio (P-3).

## Preguntas para el propietario (no bloquean el diseño; cada una tiene opción por defecto)

- **P-1 · Códigos cerrados sin guardar**: ¿basta con la reposición por el administrador como salida
  (por defecto), o se abre un ticket de «regenerar mis códigos» desde el perfil? ¿Quieres además un
  aviso `beforeunload` en este ticket (por defecto: no)?
- **P-2 · Lectura del ADR-039**: «generados al activar» ¿prohíbe toda regeneración posterior, o solo
  que la entrada normal regenere? La base hoy permite regenerar al titular con reto reciente (H7). Por
  defecto: solo lo segundo, y T-037 no toca la base. Si es lo primero, hace falta un ticket con
  `supabase/` en la cola T-012 → T-036 → T-035.
- **P-3 · Evidencia del CA2**: ¿vale la consulta contra la base real hecha a mano y pegada en la
  evidencia (por defecto), o quieres un spec de Playwright comprometido? Lo segundo amplía el territorio a
  `accesibilidad/**`.
