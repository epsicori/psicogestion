---
id: T-033
titulo: El segundo factor se puede apagar en desarrollo local, nunca en producción
modelo: opus
riesgo: alto
fase: 1
prioridad: media
depende_de: []
estado: pendiente
territorio:
  - proxy.ts
  - lib/cuentas/primer-acceso.ts
  - lib/cuentas/primer-acceso.test.ts
  - lib/cuentas/modo-desarrollo.ts
  - lib/cuentas/modo-desarrollo.test.ts
  - app/login/**
  - app/primera-vez/**
  - .env.example
  - instrumentation.ts                 # P1 del diseño, aprobada 01-10-2026
  - app/layout.tsx
  - app/aviso-modo-local.tsx
  - app/aviso-modo-local.test.tsx
  - lib/i18n/es.ts
  - docs/architecture.md
---

# Contexto

Decisión del propietario (25-09-2026): el segundo factor (TOTP) **sigue siendo obligatorio en
producción** para los tres roles, como fijan la decisión fundacional y el ADR-039. Pero en
**desarrollo local** tiene que poder apagarse, porque cada entrada con un usuario sembrado
obliga a sacar un código de una aplicación de autenticación. **No se toca ningún ADR**: esto
es una comodidad del entorno local y no cambia el producto. Si el diseño concluye que no se
puede hacer sin cambiar el comportamiento en producción, se para y se vuelve al propietario.

**Riesgo alto, porque el fallo es exactamente el contrario de lo que se pide.** Un
interruptor que apague el segundo factor y llegue a producción, por una variable de entorno
mal puesta en el despliegue, deja las historias clínicas protegidas solo por una contraseña
(RGPD art. 32; `docs/documento-maestro.html` §Autenticación). El diseño tiene que hacer que
eso sea **imposible**, no solo improbable.

## Hechos que el diseño tiene que partir de ellos (verificados el 25-09-2026)

- La guardia está en `proxy.ts` y llama a `primerAccesoPendiente()`
  (`lib/cuentas/primer-acceso.ts:38`). Si la sesión no está en `aal2`, devuelve `'totp'` y
  `proxy.ts` redirige a `/primera-vez`.
- **La base también exige el segundo factor, y eso no se apaga desde Next.** `fijar_pin()` y
  `generar_codigos_recuperacion()` lanzan `42501` si no se cumple
  `segundo_factor_verificado_recientemente()`, que pide `aal2` en el JWT más un reto TOTP de
  menos de cinco minutos (`supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql:569`
  y `:873`). Apagar solo la guardia deja a un usuario nuevo sin poder fijar el PIN, y sin PIN
  no abre ninguna historia (ADR-026).
- **Desde SQL no se puede emitir `aal2`** (el comentario de la misma migración, `:20`). Solo lo
  da `auth.mfa.verify()` con un código válido.
- El seed ya siembra un factor TOTP verificado para los cinco usuarios, con secretos fijos y
  conocidos (`supabase/seed-completo.sql:163-181`, `SEMILLATOTPDEMO…`).

# Decisiones que toma el diseño

- **D1 · Mecanismo.** Hay dos familias, y el diseño elige una con argumento:
  - (a) **Saltarse la guardia** en local. Obliga a resolver `fijar_pin()` y los códigos de
    recuperación, que exigen `aal2` en la base, y **cualquier cambio en SQL es una puerta
    que viaja a producción con las migraciones**. Por eso, si se elige (a), la base **no** se
    toca.
  - (b) **Pasar el segundo factor de verdad, pero sin teclearlo**: en local, la pantalla del
    reto calcula el código TOTP del factor ya sembrado y llama a `auth.mfa.verify()` sola.
    La sesión llega a `aal2` real, la base no cambia y el camino de producción es el mismo.
    Queda por resolver qué pasa con un usuario invitado en local que aún no tiene factor.
- **D2 · Qué cuenta como «local».** No basta con `NODE_ENV !== 'production'`, porque
  `npm run build && npm start` en local ya es `production`. Tampoco basta con una variable de
  entorno sola, porque es justo lo que se pone mal en un despliegue. El diseño fija una
  condición **compuesta**, que falle cerrada: por ejemplo, la variable explícita **y** que la
  URL de Supabase sea `127.0.0.1` o `localhost`. Si la variable está puesta y la URL no es
  local, **el proceso no arranca**, no solo ignora la variable. Hay que decir dónde se evalúa
  (servidor, nunca `NEXT_PUBLIC_*`).
- **D3 · Visibilidad.** Mientras esté activo, la aplicación lo tiene que dejar claro, para que
  nadie lo confunda con un entorno real.

# Tareas

- [ ] **Diseño** (`tickets/T-033/diseno.md`, arquitecto) con D1–D3 cerradas y la lista de
      comprobación para los revisores.
- [ ] Implementación según el diseño, con la prueba que falla primero.
- [ ] `.env.example`: la variable nueva, comentada, con el aviso de que en un despliegue no
      se define.
- [ ] `docs/architecture.md` §Autenticación: una frase sobre el modo local, dónde se evalúa y
      por qué no puede llegar a producción.

# Criterios de aceptación

1. **Apagado por defecto.** Sin la variable, en local, entrar con un usuario sembrado sigue
   pidiendo el código TOTP (prueba de `primer-acceso` o de la función que decida el modo).
2. **Encendido en local.** Con la variable y Supabase en `127.0.0.1`, un usuario sembrado entra
   hasta la agenda sin teclear ningún código. Si D1 = (b), la sesión queda en `aal2`, que se
   comprueba leyendo `getAuthenticatorAssuranceLevel()`.
3. **El PIN sigue funcionando.** En modo local, un usuario sin PIN puede fijarlo, y
   `fijar_pin()` no devuelve `42501`. Si D1 = (a) no puede cumplir esto sin tocar la base, el
   diseño lo dice y se vuelve al propietario.
4. **Falla cerrado.** Con la variable puesta y una URL de Supabase que no sea local, el servidor
   no arranca, o la función de modo lanza una excepción con un mensaje propio. Lo prueba un
   test unitario por cada combinación: variable sí/no × URL local/remota ×
   `NODE_ENV` development/production.
5. **Nada en el navegador.** `grep` sobre `.next/static` tras `npm run build` no encuentra el
   nombre de la variable ni los secretos `SEMILLATOTPDEMO`.
6. **La base no cambia.** `git diff --stat main -- supabase/` vacío.
7. **Visible.** Con el modo activo, la aplicación muestra un aviso permanente. Se comprueba a
   mano, con una captura.
8. `npm test`, `npm run lint` y `npm run build` limpios. `npm run test:rls` sigue en exit 0, y
   `node ~/.claude/pipeline/territorio.mjs T-033` en verde.

# Fuera de alcance

- Hacer el segundo factor opcional para algún rol en producción. Eso lo cierra el ADR-039, y
  el propietario lo descartó el 25-09-2026.
- Cambiar `config.toml`, las funciones SQL o las políticas.
- La pantalla de ajustes de MFA del usuario.
