# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. La historia completa hasta
> el 13-09-2026 está en `docs/bitacora/estado-hasta-2026-09-13.md`; las trampas por zona, en
> `.claude/rules/` (se cargan solas al tocar los ficheros de esa zona).

**Actualizado**: 13-09-2026 · `main` en `9027a8d` · tickets: 14 hechos · 2 en curso · 13 pendientes

## Dónde estamos

- Fase 0 casi cerrada e integrada en `main` el 06-09 (`1e2b5b7`): T-000, T-001, T-003, T-004, T-005,
  T-006a (cuentas), T-008 (seed), T-009 (CI + a11y), T-016 a T-020 (Kimi). T-010 (agenda, esquema)
  integrado con su revisión el 10-09. T-011 tiene el diseño aprobado (`tickets/T-011/diseno.md`, 10-09).
- Verificado sobre el árbol integrado del 06-09: `db reset` con 8 migraciones, `test:rls` 243
  aserciones, 342 pruebas unitarias, `lint` y `build` limpios. Desde entonces han entrado T-010 y
  T-009b: reverificar antes del siguiente ticket de base de datos.

## En curso

- T-002 · RLS: migración, enmienda multicentro (ADR-051) y revisión integradas. **Queda solo el punto 3
  del guion manual** (un perfil suspendido deja de ver `/pacientes`), nunca ejecutado en navegador.
- T-006 · Autenticación: T-006a (corte de base de datos) integrado con 197 aserciones. **Queda T-006b**
  (pantallas de invitación, MFA y PIN): era del carril de interfaz, que no entregó; lo hace la fábrica.

## Bloqueos y decisiones pendientes de una persona

- Ramas con trabajo sin fusionar: `T-021-economico-esquema` (1 commit sobre `main`, worktree
  `agent-aba4b6304060cf2e1`) y `verificacion-T-011a` (1 commit, worktree `agent-a3133689fd69000ac`).
  Decidir: integrar, rehacer con la fábrica v3, o descartar.
- Tres worktrees de agente con cambios **sin comitear** (`agent-a0cf274d698e0d85b`: 39 ficheros;
  `agent-ac7b6a35059cc839d`: 46; `agent-a0fd267d4973735c3`: 6). Revisar con `git -C <ruta> status`
  antes de borrar nada; el 13-09 se eliminaron solo los dos que estaban limpios y fusionados.
- Carril MiniMax: tres vueltas sin entrega integrable (06-09). Las pantallas vuelven a la fábrica.
- `alcance` no entra en el sobre canónico de la versión (T-005, tercera revisión): decisión de una
  persona, gratis mientras `notas_clinicas_versiones` esté vacía. Tiene reloj.

## Siguiente paso

1. Resolver los bloqueos de arriba (una decisión por rama y por worktree).
2. `/fabrica T-011` en sesión limpia: diseño ya aprobado, salta a implementación; riesgo alto →
   implementador `opus`, verificación y revisión en paralelo, dos revisores.
3. Después, T-006b (pantallas de auth) y T-021 (económico), en ese orden. `node ~/.claude/pipeline/ticket.mjs --listos`.

## Verificación manual pendiente

- T-000 criterio 8: guion completo en navegador (login A → paciente → alta → lista → logout → login B → aislamiento).
- T-002 punto 3 del guion manual (perfil suspendido).

## Hallazgos anotados (fuera de alcance, abiertos)

- Los abiertos a 13-09 están en `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados
  (líneas 1247-1444). El documentalista trae aquí, en una línea cada uno, los que sigan abiertos al
  cerrar el próximo ticket, y da por cerrados los demás.
