---
paths:
  - "app/**"
  - "components/**"
  - "proxy.ts"
  - "next.config.ts"
  - "lib/i18n/**"
---

# Next.js 16 e interfaz — trampas ya pagadas (se cargan al tocar app/ o components/)

- **Next.js 16 rompe lo que traes aprendido**: antes de escribir código de framework, lee la guía en `node_modules/next/dist/docs/`. Middleware es `proxy.ts`, no `middleware.ts`; `cookies()` es async; `revalidateTag` exige segundo argumento (usa `revalidatePath`); `next lint` no existe (`npm run lint` es independiente del build).
- **Cache Components**: `cacheComponents: true` va en la raíz de `next.config.ts`, no bajo `experimental`. El trabajo asíncrono sin cachear va en `<Suspense>` o bloquea el prerenderizado (`blocking-prerender-dynamic`). `crypto`, `Date.now()` y los aleatorios disparan `blocking-prerender-*`: viven en Server Actions y en la base, nunca en el render. `use cache: private` está **prohibido para datos clínicos** (ADR-043). `cache()` de React **no** es `use cache`. (T-007c)
- **Sesión y autorización**: `getUser()` para autorizar, nunca `getSession()`; `exigirSesion()` dentro de cada Server Action (el proxy es guardia optimista); `profesional_id` sale de la sesión, jamás del formulario; `redirect` fuera de `try`. (T-000)
- **Fechas**: las horas se formatean en servidor, en la zona del centro, y bajan como cadena (ADR-034); `new Date()` en cliente rompe la hidratación. date-fns 4 lleva zonas en `@date-fns/tz` (`TZDate`, `tz`), **no** `date-fns-tz`. (T-018)
- **Interfaz**: ninguna librería de componentes (ADR-040): las primitivas accesibles se escriben una vez en `components/ui/`. Antes de dibujar una pantalla, `docs/interfaz.md` (vocabulario, anchos, y los trece sitios donde el prototipo enseña de más). Nada de controles sin un dato o una acción real detrás. Cada primitiva lleva su prueba de teclado (tabular al disparador, abrir, cerrar con Escape, el foco vuelve) copiando la plantilla, sin generalizarla. (T-007)
- **Reparto**: donde no hay comportamiento (piezas de pintura) rinde un CLI de volumen; donde hay foco, ARIA y pruebas que no deben pasar por el motivo equivocado, lo escribe la fábrica. (T-007a, tres vueltas fallidas)
- Server Components por defecto; `"use client"` solo con estado o eventos del navegador; los datos clínicos se renderizan en servidor. Mutaciones vía Server Actions con el mismo esquema Zod que el formulario. Nunca la clave de servicio de Supabase en el navegador. Identificadores UUID; jamás un nombre de paciente en la URL.
