# Reglas del pipeline en Psicogestión (se cargan siempre)

## Territorio: un fichero, un dueño
| Ruta | Dueño |
|---|---|
| `supabase/**`, `scripts/*.sql`, `scripts/rls/**`, `lib/supabase/**`, `lib/huella/**`, `lib/cuentas/**`, `lib/citas/**`, `lib/dinero/**`, `docs/**` | **Fábrica (Claude)** |
| `components/**`, `app/**`, `next.config.ts`, `proxy.ts`, `lib/i18n/**`, `lib/contraste/**`, `.github/**` | Interfaz: la fábrica desde el 06-09-2026 (un CLI de volumen solo para piezas de pintura) |
| `lib/identidad/**`, `lib/fechas/**`, `lib/agenda/**`, `scripts/lint-migraciones.ts` | Funciones puras: la fábrica desde el 30-09-2026 (implementador Opus; Kimi deja el proyecto) |
| `tickets/**`, `PLAN.md`, `CLAUDE.md`, `CARRILES.md`, `.claude/**` | Nadie automático: el usuario y el arquitecto |

- Cada ticket declara `territorio:`; `node ~/.claude/pipeline/territorio.mjs T-XXX` lo comprueba. Lo que se sale se anota en `docs/state.md` §Hallazgos y se revierte; nunca se toca "un momento".
- `supabase/` tiene un solo dueño aunque el ticket sea de riesgo bajo: dos carriles escribiendo migraciones las ordenan mal.
- **Un informe de entrega no es una entrega**: se comprueba con `git fetch --all --prune` y el árbol, nunca leyendo el resumen. (Carril MiniMax, 06-09-2026)

## Delegación a un CLI de volumen
- Solo `delegable: volumen` = sin comportamiento: funciones puras, fixtures, tests repetitivos, componentes de pintura. Foco, ARIA, formularios, RLS, dinero, auth: la fábrica. (Regla medida en T-007: MiniMax acertó a la primera la pintura y falló tres veces los diálogos con foco.)
- El CLI lee `AGENTS.md` y su ticket; nunca `docs/` ni `CLAUDE.md` enteros. No integra: rama + informe.

## package.json
- Solo las dependencias que el ticket nombra, ancladas. Nadie sube versiones. Un conflicto en `package-lock.json` no se resuelve a mano: el de `main`, reaplicar `package.json`, `npm install`.

## Memoria (v3, desde el 13-09-2026)
- `docs/state.md` ≤ 80 líneas y solo presente (En curso, Bloqueos, Siguiente paso, Hallazgos abiertos). La historia completa hasta el 13-09-2026 está en `docs/bitacora/estado-hasta-2026-09-13.md`; desde entonces, un fichero por ticket en `docs/bitacora/`.
- Cada ticket: contrato en `tickets/T-XXX.md`; diseño en `tickets/T-XXX/diseno.md`; evidencia y revisiones en `tickets/T-XXX/`.
- ADR: índice en `docs/decisions.md`, uno por fichero en `docs/decisions/`. Se añaden, nunca se editan.
- Una lección es una regla por ruta (`.claude/rules/`), una comprobación (`.claude/guard.json`, suite, CI) o un patrón para el revisor. Si no cabe en una de las tres, no es una lección.
