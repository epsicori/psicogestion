---
paths:
  - "lib/cuentas/"
  - "app/login/**"
  - "instrumentation.ts"
  - "app/layout.tsx"
---

# Autenticación y segundo factor — trampas ya pagadas (se cargan al tocar login o TOTP)

Cada línea salió de un ticket. Antes de escribir código de autenticación o segundo factor, léelas enteras.

## Segundo factor desactivable en desarrollo local (T-033)

**Decisión**: el TOTP (segundo factor) es obligatorio en producción (ADR-039). En **desarrollo local**,
la Server Action de login calcula el código automáticamente para factores **sembrados**. Falla cerrado
en tres capas: evaluación en arranque (`instrumentation.ts`), en cada petición (función lanza), y
estructural (solo conoce factores de siembra, no reales).

**Mecanismo**: `lib/cuentas/modo-desarrollo.ts` contiene `decidirModoSegundoFactor(variable, url)` pura
y `superarSegundoFactorSembrado(supabase)` que calcula TOTP de los cinco factores de `seed-completo.sql`
y llama a `mfa.challengeAndVerify()`. En `iniciarSesion` el modo se evalúa **antes** de `signInWithPassword`
(mal configurado, lanza sin dejar sesión `aal1`) y el pase se intenta **después**. La sesión
llega a `aal2` real, emitida por GoTrue, y la base acepta PIN y códigos de recuperación exactamente
igual que en producción. **Ni la guardia ni SQL se tocan.**

**Condición compuesta**: falla cerrado si variable y URL local no se dan a la vez. Lectura literal de
`process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL` (nunca `NEXT_PUBLIC_*`), comparación de host exacta
(`.has(hostname)` contra `{127.0.0.1, localhost}`, no `includes`/`endsWith`), protocolo `http:`.
`NODE_ENV` no participa. Variable ausente o vacía → `false` antes de parsear URL, así producción no
gana camino de error nuevo.

**Franja visible**: `app/aviso-modo-local.tsx` (Server Component, no `"use client"`) roja en todas las
páginas cuando el modo está activo. Lee con `connection()` para evaluar por petición (Cache Components).
Dentro de `<Suspense>` en `app/layout.tsx` para que el resto se siga prerenderizando.

**Revisión de seguridad** (checklist para el revisor; ver `docs/bitacora/T-033.md` §Patrones):
- No hay `'use server'` en `modo-desarrollo.ts`. Solo importa desde `acciones.ts`, aviso e instrumento.
- Igualdad exacta de host: `.has(hostname)`, no `includes`, `startsWith`, `endsWith`.
- Variable ausente → `false` antes de parsear URL (producción sin camino de error).
- Valor exacto `'activo'`; cualquier otro lanza `ErrorModoLocal`.
- `NODE_ENV` no aparece en modo-desarrollo.ts.
- Solo factores sembrados (test GEMELA: id aleatorio → `'sin_factor_sembrado'`, sin llamar a MFA).
- Recomprobación interna dentro de `superarSegundoFactorSembrado()`.
- Modo evaluado antes de `signInWithPassword` en `iniciarSesion`.
- `connection()` antes de leer modo; dentro de `<Suspense>` en layout.
- `instrumentation.ts`: importación dinámica dentro de `register()`, sin `try/catch`.
- Texto en catálogo (`lib/i18n/es.ts`), sin literales.
- Base32 con relleno probado contra vectores independientes (Python `base64.b32decode`).
- Pase con fallo redirige igual que exitoso.
- URL adversarias: `localhost.evil.com`, `127.0.0.1.nip.io`, `127.0.0.1@evil.com`, `127.0.0.2`, `evil-localhost`,
  `x.localhost`, `supabase-127.0.0.1` → rechazo esperado.
- La base no cambia (`git diff --stat main -- supabase/` vacío).

**Riesgos residuales**: (a) reloj de Docker desfasado tras suspensión → GoTrue tolera ±30 s; (b) `next start`
con URL remota en build responde 500, no sale del proceso (importación dinámica en `register()`);
(c) franja dentro `<Suspense>` no da 500 en headers (capa 2 en acción sí lo hace, intacta).

**Fuera de alcance**: pase automático para invitados, tocar `/primera-vez`, Zod en `refine`, Admin API,
códigos de recuperación generados en pase.
