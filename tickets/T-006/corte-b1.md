---
id: T-006b1
titulo: Invitación, primer acceso (contraseña → TOTP → PIN) y guardia del grupo (app)
riesgo: medio
territorio: app/**, components/**
depende_de: [T-006a]
estado: hecho
notas: Integrado en main en 6301729 (15-09-2026). Las diez tareas del ticket padre quedan marcadas; lo unico sin ejecutar son los guiones de navegador.
---

# Qué es esto

La **primera mitad del corte b** de `tickets/T-006-autenticacion-completa.md`. El corte
entero está en `minimax/cortes/T-006.md`: **léelo, es el contrato**. Este fichero solo dice
qué trozo te toca, qué se ha verificado ya y las tres cosas que el corte daba por sentadas y
no son ciertas hoy.

El corte b se parte en dos porque no cabe en una ejecución. El otro trozo (candado en la
historia, PIN bloqueado por intentos, ajustes de reposición y baja) es `corte-b2.md` y **no
lo tocas**.

## Lo tuyo

Las cuatro primeras tareas de `minimax/cortes/T-006.md` §Tareas:

- [ ] **Pantalla de invitación** (administrador).
- [ ] **Primer acceso, en este orden exacto**: contraseña → TOTP (enroll + QR + verify +
      `generarCodigosRecuperacion()` mostrados una vez) → PIN (`fijarPinHistoria()`, salvo
      técnico administrativo).
- [ ] **Guardia de ruta del grupo `app/(app)/`**.
- [ ] **Canje de código de recuperación**.

Y de §Criterios de aceptación, los automáticos 1 a 4. El quinto (`prolongarDesbloqueo()`
nunca en renderizado) es de `corte-b2.md`.

## Lo que NO es tuyo, aunque el corte lo nombre

- La pantalla del candado sobre la historia, el aviso de caducidad y el PIN bloqueado por
  intentos → `corte-b2.md`.
- Ajustes › reponer TOTP y baja de perfil → `corte-b2.md`.
- La sesión de 30 minutos de inactividad → `corte-b2.md`.

# Tres hechos comprobados, para que no los redescubras

1. **El bloqueo del corte b está levantado.** `supabase/config.toml` líneas 310-312 ya
   tiene `[auth.mfa.totp] enroll_enabled = true` y `verify_enabled = true`, y `lib/cuentas/`
   está integrado en `main`. No pares por el aviso de arriba del corte.

2. **`enroll()` ya te da el QR: no instales ninguna librería de códigos QR.** Verificado en
   `node_modules/@supabase/auth-js/dist/module/lib/types.d.ts:1632` —
   `totp: { qr_code: string; secret: string; uri: string }`, y `qr_code` es **un SVG como
   data URI**. `getAuthenticatorAssuranceLevel()` existe (línea 1449) y devuelve
   `{ currentLevel, nextLevel }` con valores `'aal1' | 'aal2'`. `challengeAndVerify()`
   existe (línea 1384). `@supabase/supabase-js` y `@supabase/auth-js` son **2.112.3**;
   Next es **16.3.1**. No añades una sola dependencia a `package.json`.

3. **No existe `/pacientes/[uuid]`.** El único sitio del grupo `(app)` es
   `app/(app)/pacientes/page.tsx`, la lista. La ficha del paciente es T-013 y está
   pendiente. Consecuencia para ti: la guardia se prueba **sobre `/pacientes`**, que es la
   ruta protegida que hay, y el paso de PIN del primer acceso vive en su propia ruta, no
   colgado de una historia que aún no se puede abrir.

# Decisiones ya tomadas (no las vuelvas a abrir)

- **Rutas nuevas, fuera del grupo `(app)`** — el armazón con barra lateral no pinta detrás
  de un usuario que todavía no ha terminado de entrar: `/acceso/totp`, `/acceso/pin`,
  `/acceso/recuperacion` (los nombres exactos los eliges tú; lo cerrado es que **no** van
  dentro de `app/(app)/`). Añádelas a `RUTAS_PUBLICAS` de `proxy.ts` **solo si hace falta**
  — cuidado: quien está a medio primer acceso **sí tiene sesión**, así que el proxy ya le
  deja pasar y no hay que abrirle nada.
- **La invitación va en Ajustes**, que es del administrador y de nadie más
  (`components/armazon/modulos.ts`: la matriz recorta `Usuarios y ajustes de empresa` a
  `Total / Sin acceso / Sin acceso`). Si creas el módulo de Ajustes, pon `disponible: true`
  en `modulos.ts` solo para lo que exista de verdad.
- **Quién decide el paso pendiente es `estadoDeCuenta()` más el AAL de la sesión**, y nadie
  más. Un componente no deduce el paso por su cuenta (`minimax/cortes/T-006.md` §Tareas,
  tercera).
- **El técnico administrativo no ve el paso del PIN.** `estadoDeCuenta().requierePin` ya lo
  dice; no lo deduzcas del rol a mano en la pantalla.

# Trampas de este repo que te van a morder

- `getUser()`, **nunca** `getSession()` — hay un hook (`.claude/guard.json`, regla AUTH-01)
  que te bloquea la edición si lo escribes.
- `exigirSesion()` dentro de **cada** Server Action. El proxy es guardia optimista y no
  autoriza nada.
- `redirect()` **siempre fuera del `try`**: lanza `NEXT_REDIRECT`.
- Zod **4**: `z.email()`, `z.flattenError()`. La guía de formularios de Next enseña Zod 3.
- El mismo esquema de `lib/cuentas/esquemas.ts` en cliente y en la Server Action. El
  `.refine` del técnico sin centro ya está escrito ahí: **no lo reescribas**, impórtalo.
- Las pantallas **llaman** a `lib/cuentas/`: no tocas `lib/cuentas/**`, `lib/supabase/**`
  ni `supabase/**`. Si una pantalla necesitara cambiar algo ahí, **paras y avisas**.
- Sigue `.claude/rules/nextjs.md` y `docs/interfaz.md` §Reglas al implementar una pantalla
  (Suspense por bloque, 360 px, estado vacío, nada de color literal).

# Evidencia que tienes que dejar

Los cuatro criterios automáticos, cada uno con su prueba que **falló antes** de existir el
código, más `npm run lint`, `npm run build` y `npm test` limpios, con la salida real.
