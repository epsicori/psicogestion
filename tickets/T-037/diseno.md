# T-037 · Diseño — los códigos de recuperación solo se generan al activar el segundo factor

> Arquitecto, 02-10-2026. Riesgo alto. Un solo corte. **No toca `supabase/`**: la función
> `generar_codigos_recuperacion()` no cambia (§2, D3). Preguntas para el propietario al final.
> **Enmendado el 02-10-2026 (P-3, opción 2)**: el CA2 se cierra con un spec de Playwright guardado en
> `accesibilidad/`, que corre con `npm run test:a11y` y en el paso «Verificador de accesibilidad» de CI.
> Eso añade P6 (`lib/cuentas/codigo-totp.ts`) y P7 (el spec). Lo enmendado está en §Enmienda P-3, al
> final, y manda sobre lo anterior; §3 CA2, §5 y §6 ya están reescritos. El procedimiento manual E se
> conserva en §3 marcado como **sustituido**.

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
| H15–H26 | Hechos de la enmienda P-3 (specs, Playwright, CI, `server-only`, alta por SQL): en §Enmienda P-3. | — |

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

### P5 · Nada en `supabase/**` ni en `lib/i18n/**`

`lib/cuentas/totp.ts` no cambia (su docblock ya dice «para mostrar una sola vez», que sigue siendo
cierto). ~~El territorio del contrato lo admite, pero el diseño no lo necesita.~~ **Enmienda P-3**: en
`lib/cuentas/**` sí entra una pieza, P6 (mover `codigoTotp` a un módulo sin `server-only`), porque el
spec P7 necesita calcular el TOTP. P6 y P7 tienen su contrato completo en §Enmienda P-3.

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
  **Sustituida por la enmienda P-3 (D10-D17)**: la prueba de componente se queda como prueba que falla
  primero del componente, y la comprobación «por consulta» del CA2 es ahora el spec P7.

## 3 · Cómo se cierra cada criterio de aceptación

### CA1 · Al activar el factor por primera vez se generan los códigos y se muestran una sola vez

- `npm test -- app/primera-vez/segundo-factor.test.tsx`: caso 2 en verde (un `enroll`, un
  `generarCodigos`, diez códigos pintados, `refresh` solo tras «Ya los he guardado»).
- ~~Contra la base real: pasos E1–E3 de abajo; la consulta Q tras E3 devuelve `vigentes = 10`.~~
  *(Sustituido por P-3.)* Contra la base real: spec P7, pasos S1–S3 (§Enmienda P-3): diez `<li>`
  distintos en pantalla y la instantánea L1 de la base con `vigentes = 10`, `total = 10`, `factores = 1`.
- «Una sola vez»: spec P7, paso S4: tras «Ya los he guardado» aparece «Tu PIN de historia», y un
  `page.goto('/primera-vez')` vuelve a pintar el PIN y **no** «Tus códigos de recuperación» (la página
  redirige o pinta otro paso porque la sesión ya es `aal2`, `page.tsx:28-31`).

### CA2 · Una entrada posterior con TOTP no genera códigos nuevos; el lote es el mismo antes y después, por consulta

- **Prueba de componente que falla primero** (sin cambios): caso 1 de P4, ejecutado antes del arreglo
  (salida con el mensaje exacto de §1 P4.1 guardada en la evidencia) y en verde después.
- **Cierre del CA2: el spec P7, `accesibilidad/codigos-recuperacion.spec.ts`** (contrato en §Enmienda
  P-3). Activa el factor de un usuario propio, toma la instantánea L1 del lote **por consulta a la
  base**, vuelve a entrar con TOTP en una sesión nueva, toma L2 y exige
  `expect(L2, '<mensaje de S7>').toEqual(L1)` sobre cinco campos: `vigentes`, `total`, `ids` vigentes,
  `ultimo` `creado_en` y nº de `factores` (D13).
- **Contraensayo (rojo antes del arreglo)**, en el commit C2 de §Cortes (spec + P6, sin P1):
  `npm run build` y luego
  `PUERTO=3237 npx playwright test accesibilidad/codigos-recuperacion.spec.ts --workers=1`, dos veces:
  sin `SEGUNDO_FACTOR_AUTOMATICO_LOCAL` y con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`. Las dos salen
  **rojas en S7**, con el mensaje propio y el diff `total: 10 → 20` (H25). Rojo en otro paso (tiempo
  agotado en S6, login, `localizarContenedor`) = el spec está mal escrito, no es contraensayo. Se pegan
  la salida y el sha de C2 en `tickets/T-037/evidencia.json`.
- **Verde después**, en C3 (P1 aplicado): `npm run build` y los mismos dos comandos, verdes; además la
  batería entera `npm run test:a11y` (con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`, que la necesitan
  los specs de Ana — `docs/state.md`), **sin** `--workers=1` una vez, para enseñar que el spec nuevo no
  depende del orden ni del paralelismo.
- **En CI**: el spec entra solo en el paso «Verificador de accesibilidad» (`testDir: './accesibilidad'`,
  H17); no se toca `ci.yml`. **Pero CI no ha corrido nunca** y no tiene las variables que el build y los
  specs de Ana necesitan (H18): T-037 no puede aportar un verde de CI como evidencia. Se dice así en la
  evidencia y se anota como hallazgo (§Enmienda P-3, «Hallazgo para state.md»).

#### Procedimiento manual E — SUSTITUIDO por la enmienda P-3 (02-10-2026)

> Se conserva como historia del diseño. **No se ejecuta ni se pega en la evidencia**; su lugar lo ocupa
> el spec P7, que hace lo mismo (E1 → usuario propio sin factor, E2–E3 → S1–S3, E4 → S5–S7, Q → L1/L2,
> contraprueba → contraensayo en C2).

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
  no se toca). Nota: el spec P7 deja un usuario de prueba por ejecución (D11); el `db reset` va
  **después** de las ejecuciones del spec y **antes** de `test:rls`.
- `npm run test:a11y` verde (ver CA2; no lo exige el contrato, pero el spec P7 vive en esa batería).
- `node ~/.claude/pipeline/territorio.mjs T-037` y
  `git diff --stat main -- supabase/ lib/i18n/ scripts/ playwright.config.ts .github/ package.json package-lock.json`
  vacío.

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

Riesgos propios del spec (R-E1…R-E8): en §Enmienda P-3. El riesgo 2 lo resuelve ahora D16 en el spec, y
el 6 lo comprueba el spec en S6–S8 (la segunda entrada acaba en «Tu PIN de historia»).

## 5 · Qué revisar

*(Reescrita por la enmienda P-3. Lo que no cambia de la lista original va primero.)*

**El arreglo (P1-P4)**

- **Entradas que elige el llamante**: `SegundoFactor` solo recibe `factorVerificadoId`, y lo fija
  `page.tsx` desde `listFactors()` del servidor. Comprobar que `page.tsx` no ha cambiado de lógica y que
  ningún otro sitio monta `SegundoFactor` (`grep -rn SegundoFactor app`).
- **La condición** es literalmente `factorVerificadoId !== null`, colocada **después** de `if (error)`
  del `verify` y **antes** de `generarCodigos()`. Cualquier otra condición (sobre `enrolamiento`,
  `factorId`, `retoId`) es un rechazo.
- **La prueba 1 de P4 falla sobre el código previo al arreglo por el motivo exacto** (`generarCodigos`
  llamado 1 vez), con la salida en la evidencia; la 2 (gemela) pasa antes y después. Si la 2 falla con
  el arreglo, el arreglo es «no generar nunca».
- **Mutante a matar a mano**: quitar el `return` nuevo ⇒ la prueba 1 de P4 **y** el spec P7 se ponen
  rojos; invertir la condición ⇒ la 2 de P4 se pone roja. Anotarlo en la revisión.
- **Otra puerta que sigue abierta, a propósito**: el titular con `aal2` y reto reciente puede regenerar
  por PostgREST (H7). No es un fallo de este ticket (P-2 decidido: el ADR-039 solo prohíbe que la
  entrada normal regenere).
- **Docblocks**: el de `segundo-factor.tsx` ya no dice «en los dos casos»; el de `acciones.ts` no
  presenta la acción como barrera. **Sin textos literales nuevos** en el JSX (H11).

**El spec P7 (CA2)**

- **Contraensayo de verdad**: la salida roja de C2 está en la evidencia, con el sha de C2, y **falla en
  S7** (`toEqual` con el mensaje propio y `total` 10 → 20). Un rojo por tiempo agotado en S6, en el
  login o en S1 no vale. Reproducible sin fiarse de la evidencia:
  `git checkout <C2> -- app/primera-vez/segundo-factor.tsx && npm run build && PUERTO=3237 npx playwright test accesibilidad/codigos-recuperacion.spec.ts --workers=1`
  (rojo en S7), y `git checkout HEAD -- app/primera-vez/segundo-factor.tsx` para volver.
- **Servidor fresco**: el contraensayo y el verde se corren con un `PUERTO` libre y tras `npm run build`.
  Con `reuseExistingServer` (H16), un `next start` viejo en el 3000 haría medir otro build.
- **Independiente del modo local**: rojo en C2 y verde en C3 **con y sin**
  `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`. Si con la variable sale verde en C2, el spec está usando un
  factor sembrado y no pasa por `SegundoFactor` (H23).
- **Usuario propio**: el spec no contiene ningún id ni correo sembrado
  (`grep -nE "a0080004|11111111-|22222222-|(ana|bruno|tecnico|admin|baja)@" accesibilidad/codigos-recuperacion.spec.ts`
  vacío). Id = `randomUUID()` por ejecución; correo `t037-<id>@psicogestion.test`.
- **La instantánea discrimina**: L1 y L2 comparan los cinco campos de D13, `total` incluido. Una
  instantánea solo de `vigentes` pasaría en `main` (10 = 10) y no probaría nada.
- **Nada en el navegador**: ni `page.evaluate`, ni `page.request`, ni `fetch` a PostgREST en el spec;
  ninguna lectura de `SUPABASE_SERVICE_ROLE_KEY` ni de `process.env` fuera de lo que ya lee
  `playwright.config.ts`. La base solo se toca por `docker exec … psql -U postgres` desde el proceso
  del corredor (D12).
- **SQL que construye el spec**: solo interpola el UUID que el propio spec genera, comprobado con
  `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/` antes de usarlo. Ningún texto leído
  de la página entra en SQL.
- **El alta va en una transacción** (`begin; … commit;`) y comprueba `ejecutarSql(...) === 0`: un alta
  a medias no deja un `auth.users` sin `auth.identities`.
- **Ventana TOTP** (D16): el segundo código se calcula en un paso de 30 s posterior al primero y nunca
  con menos de 5 s restantes; `test.setTimeout(120_000)` está puesto. Un `waitForTimeout(31_000)` fijo
  es un rechazo (no protege del borde de ventana).
- **La segunda entrada es una sesión nueva** (`browser.newContext()`), y el spec afirma la rama
  «entrar»: se ve «Escribe el número de seis dígitos que te dé tu aplicación de autenticación.» y **no**
  existe el campo «Clave, por si no puedes escanear». Si la segunda entrada enrolara otra vez,
  `factores` cambiaría y S7 lo cazaría.
- **Esperas sin trampa**: S6 espera «Tus códigos de recuperación» **o** «Tu PIN de historia», para que en
  C2 el spec llegue a S7 y falle por la consulta, no por tiempo.

**P6 (`codigoTotp` fuera de `server-only`) — toca un fichero de seguridad de T-033**

- `lib/cuentas/codigo-totp.ts` contiene **solo** `ALFABETO_BASE32`, `decodificarBase32` (sin exportar) y
  `codigoTotp`, movidos tal cual (comparar cuerpos con `git diff -M main`): sin `import 'server-only'`,
  sin `'use server'`, sin `process.env`, sin ningún secreto ni `FACTORES_SEMBRADOS`.
- `modo-desarrollo.ts` conserva `import 'server-only'`, `FACTORES_SEMBRADOS`,
  `superarSegundoFactorSembrado` y la decisión del modo; importa `codigoTotp` de `./codigo-totp` y lo
  **reexporta** (misma API pública).
- `git diff main -- lib/cuentas/modo-desarrollo.test.ts` vacío y
  `npm test -- lib/cuentas/modo-desarrollo.test.ts` verde: los vectores RFC 6238 y los de Python siguen
  pasando por la reexportación.
- La comprobación de T-033 «nada en el navegador» sigue en verde: tras `npm run build`,
  `grep -rlE "SEGUNDO_FACTOR_AUTOMATICO_LOCAL|SEMILLATOTPDEMO" .next/static` → exit 1.
- `grep -rn "codigo-totp" app components lib accesibilidad` solo encuentra `modo-desarrollo.ts` y el spec.

**Lo que no debe aparecer en el diff**: `supabase/**`, `lib/i18n/**`, `scripts/**` (el spec **importa**
`scripts/psql.mjs`, no lo cambia), `playwright.config.ts`, `.github/**`, `package.json`,
`package-lock.json`, `accesibilidad/acceso.spec.ts`, `proxy.ts`, `app/login/**`; y de `lib/cuentas/**`,
nada salvo `codigo-totp.ts` (nuevo) y `modo-desarrollo.ts`.

## 6 · Territorio

*(Reescrita por la enmienda P-3.)* El del contrato, ya ampliado por el propietario:

| Glob | Qué se escribe |
|---|---|
| `app/primera-vez/**` | `segundo-factor.tsx` (P1), `acciones.ts` (P2, comentario), `page.tsx` (P3, comentario), `segundo-factor.test.tsx` (P4, nuevo) |
| `lib/cuentas/**` | `codigo-totp.ts` (P6, nuevo) y `modo-desarrollo.ts` (P6: sale `codigoTotp`, entran la importación y la reexportación). Nada más |
| `accesibilidad/**` | `codigos-recuperacion.spec.ts` (P7, nuevo). `acceso.spec.ts` no se toca |

Más los comunes de `territorio.mjs` (carpeta del ticket, `docs/bitacora/**`, `docs/state.md`).

**Se leen o se importan, no se escriben**: `scripts/psql.mjs`, `playwright.config.ts`,
`.github/workflows/ci.yml`, `supabase/seed.sql`. **No se pide** `supabase/`, `.github/`, `scripts/`,
`playwright.config.ts` ni `package.json`.

## 7 · Delegable

Nada. Es un cambio de comportamiento de autenticación (regla de `pipeline.md`: auth es de la fábrica),
de unas diez líneas más tres pruebas; no hay pintura que separar.
La enmienda P-3 no cambia esto: P7 es autenticación contra GoTrue y la base reales, y P6 toca un
fichero de seguridad de T-033. Ninguna de las dos es pintura.

## Cortes

*(Reescrita por la enmienda P-3.)* Uno solo, en este orden de commits, que es el que hace posible el
contraensayo:

- **C1 · P6**: mover `codigoTotp` a `lib/cuentas/codigo-totp.ts` y reexportarlo. Refactor puro:
  `npm test` verde sin tocar ninguna prueba.
- **C2 · P4 + P7** (sin P1): `npm test -- app/primera-vez/segundo-factor.test.tsx` rojo en el caso 1 por
  el motivo exacto; `npm run build` y el spec P7 rojo en S7, sin y con el modo local. Salidas y sha de C2
  a la evidencia.
- **C3 · P1**: el arreglo. Los dos rojos pasan a verde (rebuild antes del spec).
- **C4 · P2 + P3**: comentarios.
- Después: `npm run test:a11y` completo y CA3 (`db reset` + `seed` + `test:rls` **después** de las
  ejecuciones del spec).

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
- ~~**Spec de Playwright comprometido para el CA2**: fuera del territorio (P-3).~~ **Entra** por la
  decisión P-3 del propietario: es P7.
- **Arreglar CI para que corra de verdad** (variables `NEXT_PUBLIC_SUPABASE_*` y
  `SEGUNDO_FACTOR_AUTOMATICO_LOCAL` en `ci.yml`, H18): `.github/**` está fuera del territorio y el fallo
  es anterior y ajeno a T-037. Hallazgo para `state.md`; ticket aparte si el propietario lo quiere.
- **Borrar el usuario de prueba al terminar el spec**: la FK de `auditoria` ya impidió borrar un usuario
  de prueba local (`docs/state.md` §Bloqueos, `qr-prueba-…`), y un `delete` de limpieza dentro de un
  spec es justo lo que la regla 6 de la constitución mira con lupa. El usuario es inerte (sin centro,
  sin pacientes, sin PIN) y el siguiente `db reset` lo quita.
- **Un helper de login compartido o un `globalSetup` para `accesibilidad/`**: no existen (H15, H16);
  crearlos obligaría a tocar `acceso.spec.ts` o `playwright.config.ts` sin que ningún criterio lo pida.
- **Cotejar los diez códigos en claro con sus hashes**: cien bcrypt de coste 12 (H26); el CA1 ya lo
  cierran P4 caso 2 y L1.

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

## Decisiones del propietario (02-10-2026) — mandan sobre §1-§7

- **P-1:** si el usuario se queda sin códigos, el administrador repone el TOTP. No hay aviso
  `beforeunload` en este ticket. Se abre un ticket aparte para «regenerar mis códigos» desde el perfil.
- **P-2:** ADR-039 prohíbe solo que la entrada normal regenere. `generar_codigos_recuperacion()` no
  cambia.
- **P-3: opción 2.** El criterio 2 se cierra con un spec de Playwright guardado en `accesibilidad/`,
  no con una consulta a mano. El territorio se amplía a `accesibilidad/**`. **Pendiente: el
  arquitecto rehace CA2 y §6 para el spec.** Usa un usuario propio o deja el sembrado como estaba,
  para que no dependa del orden de los demás specs.

## Enmienda P-3 (02-10-2026) — el CA2 se cierra con un spec de Playwright

> Arquitecto, 02-10-2026, tras la decisión P-3 del propietario (opción 2). Manda sobre §1-§7 donde
> choquen. No cambia P1-P4 ni D1-D8: el arreglo es el mismo; cambia **cómo se demuestra** el CA2.

### Las cuatro preguntas del encargo, en corto

1. **Cómo están hechos los specs**: hay uno, `acceso.spec.ts`, sin helpers, sin fixtures, sin
   `globalSetup` ni `storageState`; entra a mano por `/login` con Ana y depende del pase automático de
   T-033 (H15, H16). El spec nuevo sigue ese estilo (todo dentro del fichero, textos literales del
   catálogo) y solo reutiliza lo que ya existe: `localizarContenedor`/`ejecutarSql` de
   `scripts/psql.mjs` (H21) y `codigoTotp`, que P6 saca de detrás de `server-only` (H19).
2. **Usuario propio, nuevo en cada ejecución** (D11). No restaura nada porque no toca nada compartido.
3. **Cómo obtiene L1 y L2 sin la clave de servicio en el navegador**: los códigos en claro de la
   activación los lee **del DOM** (lo que ve el usuario); el lote de la base (L1 y L2) lo lee el
   **proceso Node del corredor** con `docker exec <supabase_db_*> psql -U postgres`, el mismo camino que
   `npm run seed`. Nada corre en la página y ninguna clave interviene: la de servicio, además, **no
   serviría**, porque el lote tiene `revoke all` también a `service_role` (H8) (D12).
4. **Cómo se demuestra que falla en `main`**: el commit C2 es `main` + P6 (refactor puro) + el spec,
   sin el arreglo. Ahí el spec sale **rojo en S7** (`total` 10 → 20), con y sin el modo local; en C3,
   verde. Comando, criterio de «motivo exacto» y reproducción en §3 CA2 y §5.

### Hechos verificados (continúan §0)

| # | Hecho | Dónde |
|---|---|---|
| H15 | `accesibilidad/` tiene un solo spec, `acceso.spec.ts`. Sin helpers ni fixtures: cada prueba entra con `getByLabel('Correo')`/`getByLabel('Contraseña')`, botón «Entrar» y `waitForURL('**/pacientes')`. Usa textos literales del catálogo, no `t()`. Ningún spec teclea un TOTP: los de sesión cuentan con el pase automático de T-033 para Ana. | `accesibilidad/acceso.spec.ts:105-111`, `:143-147` |
| H16 | `playwright.config.ts`: `testDir: './accesibilidad'`, `fullyParallel: true`, `workers: CI ? 1 : undefined`, `retries: 0`, tiempo por prueba por defecto (30 s), `webServer` = `npm run start` (build de producción) con `reuseExistingServer: !CI` y puerto por `PUERTO`. Sin `globalSetup` ni `storageState`. | `playwright.config.ts:31-35`, `:57-74` |
| H17 | `ci.yml` corre `db reset` → … → «Sembrar» → `test:rls` → … → «Verificador de accesibilidad» (`npm run test:a11y`), el último. Un `*.spec.ts` nuevo en `accesibilidad/` entra solo, sin tocar `ci.yml`. | `.github/workflows/ci.yml:103`, `:132-133` |
| H18 | **CI no ha corrido nunca**: `gh api repos/epsicori/psicogestion/actions/runs` → `total_count: 0`, y `origin/main` está en `adc87ad` (T-009b). Además `ci.yml` no define `NEXT_PUBLIC_SUPABASE_URL` ni `NEXT_PUBLIC_SUPABASE_ANON_KEY`, que `lib/supabase/config.ts:15-22` exige, ni `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`, sin la cual los dos specs de Ana no pasan de `/primera-vez`. Fallo anterior y ajeno; `.github/**` está fuera del territorio. | `gh api` (02-10-2026); `ci.yml` entero |
| H19 | `lib/cuentas/modo-desarrollo.ts:1` importa `server-only`, cuyo `default` lanza fuera de la condición `react-server`. **Comprobado ejecutándolo** (ensayo en el *scratchpad*, sin tocar el repo): un spec de Playwright que importa `codigoTotp` de ese módulo muere al cargar con «This module cannot be imported from a Client Component module». Un `.ts` del repo sin `server-only` sí se carga y se transpila. | `node_modules/server-only/package.json`, `index.js` |
| H20 | `codigoTotp` (`:108-122`) y `decodificarBase32` (`:83-105`, con `ALFABETO_BASE32`) son puras: no leen el entorno ni conocen ningún secreto. Las usan `superarSegundoFactorSembrado` (`:165`) y las pruebas de vectores RFC 6238 y Python (`modo-desarrollo.test.ts:135-162`), que importan el módulo por `importarConEntorno`. | `lib/cuentas/modo-desarrollo.ts`, `.test.ts` |
| H21 | Los scripts hablan con la base como `postgres` por `docker exec`: `scripts/psql.mjs` exporta `localizarContenedor()` (busca `supabase_db_*` con `docker ps`) y `ejecutarSql(contenedor, guion)` (stdin, `ON_ERROR_STOP=1`, salida heredada, devuelve el código). Para **leer** un valor, `scripts/seed.mjs:31-39` usa `execFileSync('docker', ['exec','-i',c,'psql','-U','postgres','-d','postgres','-t','-A','-c', sql], { encoding: 'utf8' })`. **Comprobado**: un spec de Playwright importa `localizarContenedor` de `scripts/psql.mjs` y lo ejecuta (Node 24.14; `tsconfig` con `allowJs`). | `scripts/psql.mjs`, `scripts/seed.mjs` |
| H22 | Alta de usuario por SQL: `auth.users` con `confirmation_token`, `recovery_token`, `email_change_token_new` y `email_change` = `''` (NULL da 500 en GoTrue) y `raw_user_meta_data.rol`; más `auth.identities` (sin ella el login por contraseña falla). El perfil lo crea `fn_crear_perfil_de_usuario()`: `centro_id` opcional salvo para el técnico; `estado` nace `activo`. `requiere_pin = rol <> 'tecnico_administrativo'`. | `supabase/seed.sql:85-141`; `20260829120000_perfiles_centros_multicentro.sql:160-196`; `20260830090000_…:210` |
| H23 | Los cinco usuarios sembrados tienen factor sembrado; con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` su login supera el TOTP en servidor (`app/login/acciones.ts:44-48`) y **nunca monta `SegundoFactor`**. Un factor enrolado por GoTrue tiene id aleatorio, fuera de `FACTORES_SEMBRADOS`: el pase devuelve `'sin_factor_sembrado'` sin llamar a MFA y el usuario va a `/primera-vez`. | `seed-completo.sql:182-195`; `modo-desarrollo.ts:159-161` |
| H24 | Marcas de la pantalla: `<h2>` «Verificación en dos pasos», «Tus códigos de recuperación» y «Tu PIN de historia»; campo «Clave, por si no puedes escanear» (`id="secreto"`, `type="password"`, `readOnly`, valor = `data.totp.secret`) y «Código de seis dígitos» (`id="codigo"`); botones «Verificar» y «Ya los he guardado»; los diez códigos son los `<li>` de la única `<ul>`; texto de la rama entrar «Escribe el número de seis dígitos que te dé tu aplicación de autenticación.». El login redirige a `/pacientes` y el proxy manda a `/primera-vez`. | `segundo-factor.tsx:123-129`, `:139`, `:158-172`; `formulario-pin.tsx:68`; `lib/i18n/es.ts:228-257`; `app/login/acciones.ts:50`; `proxy.ts:110` |
| H25 | El lote: `id`, `perfil_id`, `codigo_hash`, `creado_en`, `usado_en`, `intentos_fallidos`, `bloqueado_hasta`. Generar **inserta** diez filas y caduca las vigentes con `usado_en = now()` (no borra): tras una regeneración, el total de filas del perfil pasa de 10 a 20 y los `id` vigentes son otros. | `20260830090000_…:117-127`, `:575-588` |
| H26 | Cotejar un código en claro con su hash es un bcrypt de coste 12 por par (`gen_salt('bf', 12)`): diez códigos contra diez filas son cien bcrypt, decenas de segundos. | `20260830090000_…:587` |

### P6 · `lib/cuentas/codigo-totp.ts` (nuevo) y `lib/cuentas/modo-desarrollo.ts` (mover)

- **`codigo-totp.ts`**: recibe, **movidos sin cambiar una línea de cuerpo**, `ALFABETO_BASE32`,
  `decodificarBase32` (sin exportar) y
  `export function codigoTotp(secretoBase32: string, instanteMs: number): string`, con
  `import { createHmac } from 'node:crypto'`. Docblock: RFC 6238 puro, sin secretos ni entorno; **sin
  `server-only` a propósito**, porque lo importa el corredor de Playwright, donde ese paquete lanza (H19,
  T-037); sin `'use server'`.
- **`modo-desarrollo.ts`**: se quitan esas tres piezas y la importación de `createHmac`; se añade
  `import { codigoTotp } from './codigo-totp';` y `export { codigoTotp };`. Todo lo demás queda igual:
  `import 'server-only'`, `decidirModoSegundoFactor`, `segundoFactorAutomaticoActivo`,
  `FACTORES_SEMBRADOS`, `superarSegundoFactorSembrado`.
- **Pruebas**: ninguna nueva. `modo-desarrollo.test.ts` no se toca y sigue cubriendo `codigoTotp` con
  sus vectores a través de la reexportación (H20).

### P7 · `accesibilidad/codigos-recuperacion.spec.ts` (nuevo)

**Importaciones** (rutas relativas, no `@/`): `{ expect, test, type Browser }` de `@playwright/test`;
`{ execFileSync }` de `node:child_process`; `{ randomUUID }` de `node:crypto`;
`{ ejecutarSql, localizarContenedor }` de `../scripts/psql.mjs`; `{ codigoTotp }` de
`../lib/cuentas/codigo-totp`. **Nada** de `modo-desarrollo`, `lib/supabase/**` ni `lib/i18n`.

**Docblock del fichero** (tres ideas): qué demuestra (CA2 de T-037 contra GoTrue y la base reales, que
jsdom no puede); por qué usa un usuario propio (D11); por qué lee la base por `psql` y no con ninguna
clave (D12). Requisitos: `npx supabase db reset` (migraciones) y Docker; **no** necesita `npm run seed`
ni `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`, y funciona con o sin ella.

**Constantes del módulo**: `CONTRASENA = 'psico1234'` (local, no secreta, como la siembra);
`UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`; los textos de H24, literales.

**Funciones locales del fichero** (no exportadas; ninguna existe hoy en el repo con otro nombre):

| Firma | Contrato |
|---|---|
| `consultar(contenedor: string, sql: string): string` | `execFileSync` exactamente como `seed.mjs:31-39` (`-t -A -c`, `encoding: 'utf8'`), devuelve `.trim()`. Lanza si psql sale ≠ 0. |
| `crearUsuario(contenedor: string, id: string, correo: string): void` | Exige `UUID.test(id)`. Guion `begin; insert into auth.users (…); insert into auth.identities (…); commit;` con las columnas y valores de `seed.sql:101-141` (instancia `00000000-…`, `aud`/`role` `authenticated`, `extensions.crypt(CONTRASENA, extensions.gen_salt('bf'))`, `email_confirmed_at`/`created_at`/`updated_at` = `now()`, `raw_app_meta_data` `{"provider":"email","providers":["email"]}`, `raw_user_meta_data` = `jsonb_build_object('rol','profesional_sanitario','nombre_completo','Prueba T-037 (Playwright)')` **sin `centro_id`**, los cuatro tokens a `''`; identidad `gen_random_uuid()`, `provider 'email'`, `provider_id = id`, `identity_data {sub, email}`). `expect(ejecutarSql(contenedor, guion)).toBe(0)`. |
| `type Lote = { vigentes: number; total: number; ids: string; ultimo: string; factores: number }` | La instantánea de D13. |
| `leerLote(contenedor: string, perfilId: string): Lote` | Exige `UUID.test(perfilId)`. Una sola consulta con cinco subconsultas escalares: `count(*)` vigentes (`usado_en is null`) y total de `public.codigos_recuperacion_totp` del perfil; `coalesce(string_agg(id::text, ',' order by id), '')` de los vigentes; `coalesce(max(creado_en)::text, '')` de todas; `count(*)` de `auth.mfa_factors` del usuario. Parte la salida por `\|` y comprueba que hay cinco campos. |
| `codigoFresco(secreto: string, pasoUsado: number \| null): Promise<{ codigo: string; paso: number }>` | Bucle: `paso = Math.floor(Date.now() / 30_000)`, `restante = 30_000 - Date.now() % 30_000`; si `restante < 5_000` o (`pasoUsado !== null` y `paso <= pasoUsado`), espera `restante + 250` ms (`setTimeout` de Node) y repite. Devuelve `codigoTotp(secreto, Date.now())` y su paso. |
| `entrar(browser: Browser, correo: string)` | `browser.newContext()` + `newPage()`; `goto('/login')`; rellena «Correo» y «Contraseña»; pulsa «Entrar»; `waitForURL('**/primera-vez')`. Devuelve `{ contexto, pagina }`. |

**La prueba**: una sola, `test('una segunda entrada con TOTP no cambia el lote de códigos de recuperación (T-037)', async ({ browser }) => { … })`,
con `test.setTimeout(120_000)` en la primera línea y los pasos en `test.step` con estos nombres:

- **S0 · Usuario propio**: `contenedor = localizarContenedor()`; `id = randomUUID()`;
  correo `t037-<id>@psicogestion.test`; `crearUsuario(...)`.
- **S1 · Activar**: `entrar`; esperar el campo «Clave, por si no puedes escanear» visible (el
  enrolamiento es asíncrono); `secreto = await …inputValue()`; `expect(secreto).toMatch(/^[A-Z2-7]+=*$/)`;
  `{ codigo, paso: paso1 } = await codigoFresco(secreto, null)`; rellenar «Código de seis dígitos»; pulsar
  «Verificar».
- **S2 · Se enseñan**: heading «Tus códigos de recuperación» visible;
  `codigos = await pagina.getByRole('list').getByRole('listitem').allTextContents()`; diez, todos
  `/^[0-9A-F]{10}$/`, diez distintos (`new Set`).
- **S3 · L1**: `L1 = leerLote(contenedor, id)`; `expect(L1).toMatchObject({ vigentes: 10, total: 10, factores: 1 })`.
- **S4 · Una sola vez**: pulsar «Ya los he guardado» ⇒ heading «Tu PIN de historia» visible;
  `goto('/primera-vez')` ⇒ «Tu PIN de historia» visible y «Tus códigos de recuperación» con
  `toHaveCount(0)`. Cerrar el contexto.
- **S5 · Entrar otra vez**: `entrar` (sesión nueva, `aal1`); visible «Escribe el número de seis dígitos
  que te dé tu aplicación de autenticación.»; el campo «Clave, por si no puedes escanear» con
  `toHaveCount(0)`; `{ codigo } = await codigoFresco(secreto, paso1)`; rellenar; «Verificar».
- **S6 · Esperar a que acabe la rama**:
  `await expect(heading «Tus códigos de recuperación».or(heading «Tu PIN de historia»)).toBeVisible()`.
  Así, antes del arreglo, la prueba llega a S7 en vez de agotar el tiempo.
- **S7 · L2 = L1**: `L2 = leerLote(contenedor, id)`;
  `expect(L2, 'una entrada con un factor ya activo ha cambiado el lote de códigos de recuperación de la base (ADR-039, T-037)').toEqual(L1)`.
- **S8 · Lo que se ve**: «Tus códigos de recuperación» con `toHaveCount(0)` y «Tu PIN de historia»
  visible (riesgo 6 de §4). Cerrar el contexto.

**Motivo exacto del rojo en C2**: falla S7 con el mensaje de arriba y un diff con `total` 10 → 20, otros
`ids` y otro `ultimo`; `vigentes` y `factores` iguales. Cualquier otro rojo es un spec mal escrito.

### Decisiones (continúan §2)

- **D10 · El spec vive en `accesibilidad/` y corre con `test:a11y`** (P-3). No se crea otro `testDir`
  ni otro proyecto de Playwright: sería tocar `playwright.config.ts`, fuera de territorio, y CI ya corre
  esa carpeta (H17).
- **D11 · Usuario propio, nuevo en cada ejecución, dado de alta por SQL como `postgres`**. Descartado
  reutilizar y restaurar un sembrado: (a) con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` un sembrado no
  pasa por `SegundoFactor` (H23) y el spec saldría **verde en `main`**: el contraensayo dependería del
  entorno; (b) forzar su activación exige borrar el factor sembrado y reponerlo con el mismo secreto y un
  `last_challenged_at` distinto (índice único global, `seed-completo.sql:173-177`), y el lote generado no
  se «des-genera» sin un `delete` sobre una tabla de seguridad; (c) con `fullyParallel` (H16), tocar a
  un usuario que otro spec usa crea dependencia de orden. Descartada también el alta por invitación
  (Admin API, la clave de servicio en el proceso de pruebas y el correo de Mailpit: mucha maquinaria sin
  ganar nada).
- **D12 · L1 y L2 se leen por `docker exec … psql -U postgres` desde el proceso del corredor**, nunca
  desde la página. Es el camino de `npm run seed` y de `test:rls` (H21); la clave de servicio no
  serviría (H8). Se importan `localizarContenedor` y `ejecutarSql`, no se copian.
- **D13 · La instantánea tiene cinco campos**. `total` es el que discrimina sin ambigüedad (H25);
  `ids` y `ultimo` dicen qué cambió; `factores` demuestra que la segunda entrada no enrola. Descartado
  cotejar los códigos en claro con los hashes (H26).
- **D14 · `codigoTotp` se mueve a un módulo sin `server-only` y `modo-desarrollo.ts` lo reexporta**.
  Descartados: importarlo de `modo-desarrollo.ts` (lanza, H19); copiarlo en el spec (segunda
  implementación sin vectores; `scripts/psql.mjs` nació precisamente para no pegar copias); un paquete
  de TOTP (dependencia nueva que ningún ticket nombra, `pipeline.md`); leer el código de otra parte (no
  existe). El secreto de los factores sembrados sigue detrás de `server-only`.
- **D15 · Rol `profesional_sanitario`, sin centro y sin PIN**: `requiere_pin` hace que al superar el
  TOTP la pantalla pase a «Tu PIN de historia» sin salir de `/primera-vez`. Es la señal final de las dos
  entradas y no depende de ninguna página de la aplicación; sin centro ni pacientes, el usuario no
  aparece en ninguna vista acotada por centro.
- **D16 · Ventana TOTP**: el segundo código, en un paso de 30 s posterior al del primero y nunca con
  menos de 5 s de ventana; `test.setTimeout(120_000)`. Descartado un `sleep` fijo de 31 s: igual de
  largo y no protege del borde de ventana.
- **D17 · La segunda entrada es un `browser.newContext()`**, no el botón de cerrar sesión: no depende
  del armazón (al que el usuario sin PIN no llega) y es exactamente «entrar otra vez».

### Riesgos de la enmienda, por probabilidad

1. **R-E1 (Media) Contraensayo contra un servidor viejo**: `reuseExistingServer` fuera de CI (H16)
   reutiliza cualquier `next start` del puerto. Mitigado con `PUERTO` libre y `npm run build` antes de
   cada ejecución (§3 CA2, §5).
2. **R-E2 (Media) «Corre en CI» no se puede evidenciar** (H18): el spec está en el camino de CI, pero CI
   no ha corrido nunca y le faltan variables. Se dice en la evidencia; hallazgo para `state.md`.
3. **R-E3 (Media) Tiempo**: hasta ~35 s de espera de ventana más dos bcrypt de coste 12 por lote. Sin
   `test.setTimeout(120_000)` el spec agota los 30 s por defecto, en rojo antes y después del arreglo.
4. **R-E4 (Baja) Un usuario de prueba por ejecución en la base local**: `test:rls` sin `db reset` previo
   vería un profesional más. CI corre `test:rls` antes que `test:a11y`, y `CLAUDE.md` ya exige `db reset`
   antes de `test:rls`.
5. **R-E5 (Baja) CI con Node 20 cargando `scripts/psql.mjs` desde un spec TS**: comprobado con Node 24;
   Node ≥ 20.19 carga ESM desde CommonJS. Si fallara, falla al cargar y con mensaje, no en silencio.
6. **R-E6 (Baja) Reloj de Docker desfasado** (T-033, riesgo a): GoTrue rechazaría el código; se ve como
   `codigoNoValido` en S1, no como un falso verde.
7. **R-E7 (Baja) P6 abre una puerta en T-033**: no hay secreto ni entorno en `codigo-totp.ts`; la
   comprobación de `.next/static` de T-033 sigue en la lista de §5.

### Hallazgo para `state.md` (lo escribe el implementador al cerrar)

- **CI no ha corrido nunca** (`actions/runs` = 0; `origin/main` en `adc87ad`) y `ci.yml` no define
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` ni `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`: el
  build y los specs de Ana fallarían allí. Sin ticket; territorio `.github/**`.
