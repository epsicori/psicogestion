# Estado

> Memoria viva del proyecto. **Léelo antes de tocar código; actualízalo al terminar.**
> Es el bus entre agentes: lo que aprendas aquí se escribe, no se re-explica.

**Actualizado**: 15-08-2026

## Ticket en curso

Ninguno. El siguiente es **T-000 · Paseo vertical**.

## Dónde estamos

Fase 0 recién arrancada. Proyecto andamiado y vacío de lógica propia:

- Next.js 16.3.1 + React 19.2.8 + Tailwind 4 instalados, plantilla por defecto sin tocar.
- Dependencias del proyecto puestas: `@supabase/supabase-js`, `@supabase/ssr`, `zod`,
  `react-hook-form`, `@hookform/resolvers`, `@tanstack/react-table`, `date-fns`.
  Dev: `supabase` (CLI 2.114), `tsx`.
- `npx supabase init` ejecutado: existe `supabase/config.toml`. **Todavía sin migraciones.**
- Memoria del proyecto escrita: `CLAUDE.md`, `docs/architecture.md`, `docs/decisions.md`.
- **Humo verde**: `npm run lint` limpio y `npm run build` correcto (compila en 5,7 s).
  Node 24 + Next 16.3.1 + Tailwind 4 funcionan en esta máquina.

## Últimos cambios

- Andamiaje del proyecto y destilado del documento maestro a memoria de agentes.

## Bloqueos

1. **Docker Desktop parado.** Está instalado (29.2.1) pero el demonio no responde, así
   que `npx supabase start` fallará. Lo tiene que abrir el usuario.
2. **Identidad de git sin configurar.** `user.name` y `user.email` están vacíos, así que
   no se puede hacer ningún commit. Pendiente de que el usuario diga con qué nombre
   quiere firmar.

## Siguiente paso

Resolver los dos bloqueos y ejecutar `/fabrica T-000`.

## Aprendizajes

- **Next.js 16 rompe cosas** respecto a lo que los modelos traen aprendido. Antes de
  escribir código de framework, leer la guía en `node_modules/next/dist/docs/`. Lo avisa
  el propio `AGENTS.md` que genera Next.
- `create-next-app` rechaza la carpeta `Psicogestion` por la mayúscula (npm no admite
  mayúsculas en el nombre del paquete). Se generó en temporal y se movió; el
  `package.json` quedó como `psicogestion`. **Si hay que re-andamiar, mismo truco.**
