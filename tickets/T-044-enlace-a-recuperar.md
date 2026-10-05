---
id: T-044
titulo: Un enlace a /recuperar desde el paso «Verificación en dos pasos», y uno de vuelta
modelo: sonnet
riesgo: bajo            # un enlace, dos textos y un párrafo de interfaz.md: ni base, ni acción, ni sesión
fase: 1
prioridad: media
depende_de: []          # T-042 ya está en main; no comparte ficheros con T-041 (ver Notas)
estado: pendiente
delegable: no           # segundo-factor.tsx lleva foco y ramas por factor; es poco y lo hace la fábrica
territorio:
  - app/primera-vez/segundo-factor.tsx
  - app/primera-vez/segundo-factor.test.tsx
  - app/recuperar/formulario-recuperar.tsx
  - app/recuperar/formulario-recuperar.test.tsx
  - accesibilidad/recuperar.spec.ts      # solo el caso C nuevo; A y B no se tocan
  - lib/i18n/es.ts                       # solo las dos claves de las Notas
  - docs/interfaz.md                     # solo la sección nueva «Recuperar el acceso»
  - docs/bitacora/T-044.md
  - docs/state.md
---

# Contexto

Hallazgo de la prueba manual del propietario en T-042 (`docs/bitacora/T-042.md`, §«Prueba manual
del propietario (04-10-2026)»; `docs/state.md`, hallazgo «`/recuperar` sin enlace»).

`/recuperar` canjea un código de recuperación cuando se pierde la aplicación TOTP (ADR-039:
«Códigos de recuperación de un solo uso»). La pantalla existe y funciona: `app/recuperar/page.tsx`,
`formulario-recuperar.tsx` y `acciones.ts`. Además, `proxy.ts:26` (`RUTAS_DE_ACCESO`) la exime de la
guardia del primer acceso para que quien está en `aal1` pueda llegar a ella. **Pero ninguna pantalla
la enlaza.** Comprobado con `grep`: en `app/`, `components/` y `lib/` no hay ningún `href` ni
`Link` a `/recuperar`. La ruta solo aparece en `proxy.ts:26` y en `accesibilidad/recuperar.spec.ts`,
que la abre con `goto`. La exención del proxy existe, pero solo se llega tecleando la URL.

Quien perdió el móvil entra con contraseña, se queda en `aal1` y la guardia lo manda a
`/primera-vez`. `app/primera-vez/page.tsx:33-41` le pinta `SegundoFactor` con `factorVerificadoId`
no nulo, es decir, el texto «Escribe el número de seis dígitos que te dé tu aplicación de
autenticación» (`primeraVez.totp.yaEnrolado`). Esa persona no tiene ese número. **Ahí falta el
enlace.**

En la otra rama de `SegundoFactor`, la de `factorVerificadoId === null` (activación: se enrola por
primera vez o tras un canje), el enlace **no debe salir**. Esa persona aún no tiene códigos, porque
se generan al activar (ADR-039, T-037). Un canje en ese estado gastaría un código, si lo tuviera, y
borraría cero factores (`lib/cuentas/totp.ts:148-150`). Ofrecerlo sería un control sin acción real
detrás (CLAUDE.md, Interfaz).

Tampoco va en `/login`. `/recuperar` exige sesión, porque un código solo vale para la cuenta que ya
demostró su contraseña (`app/recuperar/page.tsx:15-16`), y sin sesión el proxy devuelve a `/login`.

**Pantalla sin prototipo.** Ni `/primera-vez` ni `/recuperar` están dibujadas, y `docs/interfaz.md`
no las menciona. Este ticket añade la sección de `/recuperar`. No toca la matriz de roles: el paso
TOTP es igual para los tres roles (ADR-039).

## Tareas

- [ ] `segundo-factor.tsx`: en la vista del formulario (no en la de fallo ni en la de códigos),
      **solo si `factorVerificadoId` no es nulo**, un `Link` de `next/link` a `/recuperar` con el
      texto `primeraVez.totp.perdisteLaAplicacion`.
- [ ] `formulario-recuperar.tsx`: un `Link` a `/primera-vez` con el texto `recuperar.volver`.
- [ ] Dos claves en `lib/i18n/es.ts` (texto exacto en las Notas).
- [ ] Pruebas unitarias en los dos `.test.tsx` y caso C en `accesibilidad/recuperar.spec.ts`.
- [ ] `docs/interfaz.md`: sección `### Recuperar el acceso (/recuperar, T-044)` justo después de
      `### Mi cuenta` (antes de `## De dónde sale cada pieza`).
- [ ] Al cerrar: quitar de `docs/state.md` el hallazgo «`/recuperar` sin enlace» y escribir
      `docs/bitacora/T-044.md`.

## Criterios de aceptación (verificables)

- [ ] **Automático**: `npx vitest run app/primera-vez/segundo-factor.test.tsx` pasa con dos casos
      nuevos:
      (a) con `factorVerificadoId="factor-1"`,
      `getByRole('link', { name: '¿Has perdido el acceso a tu aplicación? Usa un código de recuperación' })`
      existe y tiene `href="/recuperar"`;
      (b) con `factorVerificadoId={null}` y `enroll` simulado, **después** de esperar al QR
      (`findByAltText('Código QR para configurar la verificación en dos pasos')`), `queryByRole('link', { name: … })`
      es `null`.
      Contra el `main` de hoy, (a) falla porque no hay enlace. Si el enlace se pintara sin
      condición, falla (b). El caso (b) espera al QR para que no pase por no haber montado aún
      la vista.
- [ ] **Automático**: `npx vitest run app/recuperar/formulario-recuperar.test.tsx` pasa con un caso
      nuevo: `getByRole('link', { name: 'Volver a la verificación en dos pasos' })` tiene
      `href="/primera-vez"`. Los casos existentes siguen verdes.
- [ ] **Automático**: `npm test` verde, incluido `lib/i18n/sin-literales.test.ts` (ningún texto
      nuevo fuera del catálogo).
- [ ] **Automático**: `npm run build && npx playwright test recuperar --workers=1` (requisitos de la
      cabecera del spec: `db reset`, `seed`, Docker) pasa con el caso C nuevo, «se llega a
      `/recuperar` por el enlace (T-044)». El caso entra con contraseña y espera la URL
      `/primera-vez`. Pulsa el enlace por su nombre accesible y espera la URL `/recuperar` y la
      etiqueta «Código de recuperación». Pulsa «Volver a la verificación en dos pasos» y espera la
      URL `/primera-vez`. A y B siguen verdes y sin cambios.
- [ ] **Automático**: `npm run lint` sin errores nuevos.
- [ ] **Manual**: a 360 px de ancho, el enlace de `/primera-vez` y el de `/recuperar` se ven
      enteros (el texto parte línea, no se corta) y su caja mide al menos 44 px de alto (ADR-044).
      Se comprueba con las herramientas del navegador.
- [ ] **Manual**: el enlace sale igual para los tres roles (ana, tecnico, admin; ver guion) y nunca
      en la vista de enrolar un factor nuevo.
- [ ] **Manual**: `docs/interfaz.md` tiene la sección nueva y dice: quién llega (sesión `aal1` con
      factor verificado), por dónde (el enlace de `/primera-vez`), qué hace el canje (borra el
      factor y obliga a enrolar de nuevo, `app/recuperar/acciones.ts:14-17`), que código inválido y
      agotado dan el mismo mensaje, y el enlace de vuelta.

## Guion de comprobación manual

El modo local del segundo factor hace que las cuentas sembradas lleguen a `aal2` sin pasar por
`/primera-vez` (T-033). Para ver el paso hay que apagarlo un momento.

1. En `.env.local`, comenta `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` y reinicia `npm run dev`.
2. En `/login`, entra con `ana@psicogestion.test` / `psico1234`. Debes ver `/primera-vez`,
   «Verificación en dos pasos», y debajo de «Verificar» el enlace «¿Has perdido el acceso a tu
   aplicación? Usa un código de recuperación».
3. Llega al enlace con Tab y pulsa Intro: debes ver `/recuperar`, «¿Has perdido tu teléfono?».
4. Pulsa «Volver a la verificación en dos pasos»: vuelves a `/primera-vez`.
5. Repite 2 con `tecnico@psicogestion.test` y con `admin@psicogestion.test`.
6. **No canjees ningún código**: el canje borra el factor sembrado de esa cuenta, y solo se recupera
   con `npx supabase db reset` + `npm run seed`.
7. Descomenta la línea de `.env.local` y reinicia `npm run dev`.

## Notas para el agente

**Claves del catálogo** (`lib/i18n/es.ts`; de momento, el texto que recomienda P2):

- `primeraVez.totp.perdisteLaAplicacion: '¿Has perdido el acceso a tu aplicación? Usa un código de recuperación'`
  va dentro del objeto `primeraVez.totp`, detrás de `noSePudoEnrolar`.
- `recuperar.volver: 'Volver a la verificación en dos pasos'` va dentro de `recuperar`, detrás de
  `bloqueado`.

**Dónde va cada enlace**:

- En `segundo-factor.tsx`, en el `return` final (la vista del formulario). Va después del bloque
  `{mensaje && (<p role="status" …>)}` y antes del `<span hidden>{retoId}</span>`, envuelto en
  `{factorVerificadoId && ( … )}`. **No** va en la vista de fallo (`fallo !== null`) ni en la de
  códigos (`codigos`): las dos ocurren cuando el paso ya se ha superado.
- En `formulario-recuperar.tsx`, como último hijo del `<form>`, después del `role="status"`. Es un
  `Link`, no un `Button`: no envía el formulario.

**Estilo de los dos enlaces**: enlace de texto, no botón. Estas clases, sin inventar otras:
`'text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex min-h-11 items-center self-center text-center text-sm underline underline-offset-4 outline-none focus-visible:ring-2 rounded'`.
`min-h-11` da los 44 px de ADR-044. El patrón de foco es el de `app/(app)/agenda/calendario.tsx:37`.

**Pruebas**:

- `next/link` se renderiza en jsdom sin simularlo, igual que en
  `app/(app)/agenda/panel-cita.test.tsx:101`. Los `vi.mock('next/navigation')` de los dos ficheros
  de prueba no hay que tocarlos.
- Caso C del spec: reutiliza `prepararUsuario()`. Entra como hace `abrirRecuperar()` pero **sin**
  `pagina.goto('/recuperar')`. Ese ayudante no se modifica (A y B dependen de él). Escribe la
  entrada aparte o añade al ayudante un parámetro opcional que por defecto haga lo de hoy. El
  usuario del spec tiene un factor no sembrado: con el modo local activo el pase falla y redirige
  igual (regla de `autenticacion.md`), así que cae en `/primera-vez` también con `.env.local`
  preparado.

**Choque de ramas**: T-041 (rama `worktree-agent-ae6f460142344cc25`) toca `lib/i18n/es.ts` en las
líneas 125-172 de `main` y `docs/interfaz.md` en la 181-184. Este ticket escribe en `primeraVez`
(línea 226 y siguientes), en `recuperar` (331 y siguientes) y después de la línea 203 de
`interfaz.md`. No se pisan. Se puede integrar antes o después de T-041.

## Preguntas abiertas al propietario (con recomendación)

**Respondidas por el propietario (05-10-2026)**: P1 sí, enlace de vuelta · P2 «tu aplicación» · P3 siempre visible (con factor verificado). Las recomendaciones de abajo quedan cerradas tal cual.


- **P1 · ¿Enlace de vuelta en `/recuperar`?** Recomendación: **sí**, como está en este contrato.
  Quien entra por error no tiene más salida que el botón Atrás del navegador, y el enlace lleva a
  una pantalla real. Si dices que no: fuera la tarea 2, la clave `recuperar.volver`, el segundo
  criterio y el último paso del caso C.
- **P2 · Texto del enlace.** Tu propuesta en T-042 decía «tu app». El catálogo dice siempre
  «aplicación de autenticación» y nunca «app» (`primeraVez.totp.escanea`, `yaEnrolado`).
  Recomendación: «¿Has perdido el acceso a tu aplicación? Usa un código de recuperación».
- **P3 · ¿Siempre visible o solo tras fallar el código?** La bitácora de T-042 lo situaba en la
  «pantalla de bloqueo por fallidos». Recomendación: **siempre visible** en la rama con factor.
  Quien perdió el móvil no tiene código que fallar, así que nunca vería un enlace que solo sale
  tras un fallo. Además, `/primera-vez` no tiene pantalla de bloqueo propia.

## Lo que no entra, y por qué

- **Zod en servidor en `canjearCodigo`** (nota de T-042 en `state.md`): es otra acción y otro
  riesgo. Sigue anotado.
- **`try/catch` en `verificar`** (`segundo-factor.tsx:122`, hallazgo T-037): mismo fichero, pero
  otro defecto, que tiene su propio hallazgo.
- **Enlace en `/login`**: sin sesión no se puede canjear (ver Contexto).
- **Qué ve en `/recuperar` quien no tiene factor o ya está en `aal2`**: no lo pide el hallazgo, y
  la pantalla no ha cambiado desde T-042.
