---
id: T-006
titulo: Autenticación completa — invitación, TOTP, PIN, sesiones y baja
modelo: sonnet
fase: 0
prioridad: alta
depende_de: [T-002]
estado: en_curso
notas: Corte a (base de datos, lib/cuentas/, dos hallazgos ALTA cerrados con prueba) INTEGRADO en main. Falta el corte b -pantallas de invitacion, primer acceso, MFA y PIN-, cuyo corte esta en minimax/cortes/T-006.md y ya NO esta bloqueado.
---

# Contexto

T-000 dejó un login de correo y contraseña y dos usuarios sembrados a mano. Aquí entra el
circuito real de alta y de acceso, que son **tres cosas distintas** y así hay que
implementarlas (`docs/architecture.md` §Registro de accesos):

| Pregunta | Mecanismo |
|---|---|
| Quién eres | contraseña |
| Que sigues siendo tú al entrar | **TOTP** (ADR-039) |
| Que sigues delante del teclado al abrir una historia | **PIN** (ADR-026) |

Referencias: `docs/architecture.md` §Roles, §Candado. ADR **038** (el correo de cuenta
sale por Supabase Auth; SMTP del cliente al Vault si algún día hace falta), **039** (TOTP
para los tres roles, nunca SMS), **026** (alta del PIN), **033** (`centro_id` obligatorio
en el técnico), **032** (la baja revoca sesión, MFA y PIN).

Pantallas: no están en el prototipo (`interfaz.md` §Lo que el prototipo no cubre lista
expresamente el alta del PIN y la pantalla de bloqueo). Se dibujan con el vocabulario del
armazón de T-007; si T-007 aún no está integrado, se usan las primitivas que ya existen
(`components/ui/button.tsx`, `components/ui/field.tsx`) y **no se inventan otras**.

## Tareas

- [ ] **Invitación**: el administrador da de alta un perfil (nombre, correo, rol y
      **`centro_id` obligatorio si el rol es `tecnico_administrativo`**) y Supabase Auth
      envía el enlace de un solo uso. En desarrollo se lee en **Mailpit**. Ningún
      proveedor de correo contratado (ADR-038).
- [ ] **Primer acceso, en este orden exacto**: contraseña → **TOTP** → **PIN**. Sin
      atajos: no se llega a la aplicación con un paso a medias.
- [ ] **TOTP** con `supabase.auth.mfa` (enroll → challenge → verify), código QR y
      **códigos de recuperación de un solo uso mostrados una vez**. Para los tres roles.
- [ ] **PIN de seis dígitos** (ADR-026): lo fija **su dueño** y solo él lo cambia,
      reautenticándose con contraseña y segundo factor. El técnico administrativo **no
      tiene PIN** y no ve la pantalla. Se llama a las funciones `security definer` de
      T-002; **nunca se verifica el PIN en cliente** ni se interpola en SQL.
- [ ] **Desbloqueo, prolongación y bloqueo**: Server Actions. La ventana se prolonga en
      acciones —abrir paciente, guardar— **jamás en el renderizado**. Botón de **bloquear**
      siempre disponible. Aviso cuando la ventana está a punto de caducar.
- [ ] **Pantalla de PIN bloqueado por intentos**, con el tiempo restante. Ni reintentos
      silenciosos ni mensajes que revelen si el PIN era correcto.
- [ ] **Sesión de 30 minutos de inactividad** (elecciones técnicas menores) y cierre de
      sesión desde la barra lateral, que ya existe.
- [ ] **Reponer TOTP**: lo puede hacer el administrador, **auditado y con aviso al
      titular**. **Reponer un PIN, jamás** — ni el gesto existe en la interfaz.
- [ ] **Baja de un profesional** (ADR-032): pasa `perfiles.estado` a `baja`, **revoca
      sesiones, inutiliza TOTP y PIN**, y deja constancia. La restricción del último
      administrador activo ya la impone la base (T-001); la interfaz **explica** el error,
      no lo previene por su cuenta.
- [ ] **Vault**: si se configura SMTP propio del cliente, las credenciales van al Vault de
      Supabase, **nunca a variables de entorno de Vercel**, y con clave distinta de las del
      PIN y del DNI (ADR-038, ADR-029).

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm run lint`, `npm run build` y `npm run test:rls` limpios.
- [ ] **Automático** — un usuario invitado que **no** ha completado TOTP no puede alcanzar
      ninguna ruta del grupo `app/(app)/`: redirige al paso pendiente.
- [ ] **Automático** — un `profesional_sanitario` sin PIN fijado es redirigido al alta de
      PIN; un `tecnico_administrativo` **no**, y no tiene fila en `pines_historia`.
- [ ] **Automático** — cinco PIN erróneos bloquean quince minutos, dejan entrada en
      `auditoria` y el sexto intento **con el PIN correcto falla igual**.
- [ ] **Automático** — invitar a un `tecnico_administrativo` **sin centro** falla, y el
      formulario lo dice antes de llamar a la base.
- [ ] **Automático** — tras la baja de un profesional: sus sesiones dejan de valer, su
      factor TOTP desaparece, su PIN queda inutilizado y `es_profesional_asignado()`
      devuelve falso (gemelo del criterio de T-003).
- [ ] **Automático** — no existe ninguna acción de servidor que permita a un administrador
      **establecer** el PIN de otro (comprobable por lectura del código y por prueba: la
      llamada, forzada, es rechazada).
- [ ] **Automático** — ninguna Server Action de renderizado prolonga la ventana: el
      recuento de `desbloqueos_historia` **no cambia** al recargar una página cinco veces.
- [ ] **Manual** — el guion de abajo se completa entero.
- [ ] **Manual** — con cada rol, la interfaz enseña exactamente lo que le concede la matriz
      de `architecture.md` §Roles: el técnico no ve nada de PIN, el profesional no ve nada
      de invitaciones.

## Guion de comprobación manual

1. `npx supabase start`, `npm run dev` y entra como administrador.
2. Invita a un profesional. Abre Mailpit (`http://127.0.0.1:54324`), sigue el enlace.
3. Fija contraseña → escanea el TOTP → guarda los códigos de recuperación → fija el PIN.
4. Abre un paciente: pide PIN. Introdúcelo mal cinco veces: bloqueo con cuenta atrás.
5. Espera o adelanta la caducidad, entra bien, y pulsa **bloquear**: vuelve a pedirlo.
6. Como administrador, repón el TOTP de ese usuario: se puede, queda auditado y avisado.
   Busca la forma de reponerle el PIN: **no existe**.
7. Da de baja al profesional: su sesión abierta deja de funcionar en la siguiente acción.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.** Lo que no esté aquí resuelto y
  toque RLS, PIN o roles, se para y se escala; no se decide dentro del ticket.
- `getUser()`, nunca `getSession()`, para decidir autorización en servidor.
- `exigirSesion()` dentro de **cada** Server Action; el Proxy es guardia **optimista** y
  no autoriza nada por sí solo.
- Las funciones de PIN son las de T-002. **Este ticket no escribe SQL de candado**: lo
  llama. Si falta una función, se anota en `docs/state.md` y se abre en T-002.
- Zod 4: `z.email()`, `z.flattenError()`. La guía de formularios de Next muestra Zod 3 —
  no la copies literalmente.
- `redirect` siempre **fuera** del `try` (lanza `NEXT_REDIRECT`).
- Mailpit viene con Supabase local; confirma el puerto real con `npx supabase status` en
  vez de fiarte del que aparece arriba.
- Nada de SMS ni de correo como segundo factor (ADR-039), y nada de contratar un proveedor
  de correo (ADR-038).

## Estado de entrega (30-08-2026) — SOLO la mitad de base de datos

**`estado` sigue en `pendiente` a propósito: este ticket se entrega en dos ramas y no se
cierra hasta que las dos hayan entrado en `main`.**

- **`T-006a-cuentas-base` (esta entrega, hecha)**: el corte de base de datos completo —
  migración `20260830090000_cuentas_invitacion_baja_totp.sql`, `lib/supabase/administracion.ts`,
  `lib/cuentas/**`, `scripts/rls/13-cuentas.sql`, `scripts/vault-smtp.sql`, y los tres
  cambios de `supabase/config.toml` (TOTP activado, `enable_signup = false`,
  `email_sent = 30`). Evidencia:
  - `npx supabase db reset`: limpio, siete migraciones aplicadas.
  - `npm run test:rls`: **192 aserciones, todas en cierto, cero fallos** (14 módulos,
    incluido el nuevo `13-cuentas.sql`).
  - `npm run lint`: limpio. `npm run lint:migraciones`: `7 migración(es) limpias`.
  - `npm run build`: limpio (TypeScript, generación de páginas, sin avisos).
  - `npm test`: **229 pruebas, 25 ficheros, todas en verde**.
- **`T-006b-acceso-pantallas` (pendiente, bloqueada)**: todas las pantallas —invitación,
  primer acceso, candado y PIN bloqueado, ajustes de reposición y baja, canje de código
  de recuperación—. Corte completo, criterios de aceptación y bloqueo explicado en
  `minimax/cortes/T-006.md`.

**Nota de alcance**: `T-006a-cuentas-base` fusiona `T-003-banco-pruebas-rls` (no
integrada en `main` en el momento de empezar esta rama) para poder ejecutar
`npm run test:rls`, que el propio ticket exige como criterio automático. Detalle en
`docs/state.md` § T-006.
