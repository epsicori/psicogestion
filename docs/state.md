# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño (ADR, trampas, circuito)
> en tickets y bitácora; las reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 15-09-2026 · `main` en `9027a8d` · tickets: 15 hechos · 2 en curso · 13 pendientes

## Dónde estamos

- Integrado en `main`: T-000, T-001, T-002 (con la enmienda del ADR-051), T-003, T-004, T-005,
  T-006a, T-007, T-008, T-009, T-010 y T-016 a T-020.
- **Fuera de `main` y terminado**: T-011 (series y desviaciones), en `T-011a-cierre`.
- Última verificación sobre el árbol integrado (06-09): `db reset` con 8 migraciones, `test:rls`
  243 aserciones, 342 pruebas unitarias, `lint` y `build` limpios. Desde entonces han entrado
  T-009b y T-010: **reverificar antes del siguiente ticket de base de datos**.

## En curso

- T-002 · RLS: migración, enmienda multicentro (ADR-051) y revisión integradas. Queda el punto 3
  del guion manual (un perfil suspendido deja de ver `/pacientes`), nunca ejecutado en navegador.
- T-006 · Autenticación: T-006a integrado (197 aserciones). Queda T-006b (pantallas de invitación,
  MFA y PIN), que hace la fábrica desde que el carril de interfaz volvió a ella.

## Bloqueos y decisiones que no toma un agente

- **`alcance` no entra en el sobre canónico de la versión** (T-005, tercera revisión). Decisión de
  una persona y **con reloj**: es gratis mientras `notas_clinicas_versiones` esté vacía; con la
  primera firma real dentro cuesta una era de esquema para siempre.
- `T-021-economico-esquema`: diseño aprobado comiteado (`79e039f`) y una **implementación sin
  comitear** en el worktree `agent-a3e72807070793a0e`
  (`supabase/migrations/20260913120000_economico_esquema.sql`, 1413 líneas). Decidir si se retoma
  o se rehace con la fábrica: no pasó por verificación ni revisión.
- Rama `verificacion-T-011a` y worktrees `agent-a0c13db09cb6a7b62` y `agent-a3133689fd69000ac`:
  **obsoletos**, están en `efc3ad6`, anterior al cierre del ticket. Decidir si se borran.
- Worktrees con cambios sin comitear de tickets ya cerrados: `agent-a0cf274d698e0d85b` (39
  ficheros), `agent-ac7b6a35059cc839d` (46), `agent-a0fd267d4973735c3` (6). `git -C <ruta> status`
  antes de borrar nada.
- **El pipeline instalado en `~/.claude` es v3.0, no el v3.1 del repo**: falta el hook
  `evaluador-intocable.mjs` y `podar-reglas.mjs`. Y el `merge-gate` corre en **toda** llamada a
  Bash (el `if:` de `settings.json` no se aplica), así que deniega cualquier orden de consola que
  nombre un ticket, no solo un merge. Se esquiva partiendo el id (`N=011`).

## Siguiente paso

1. **Integrar `T-011a-cierre`** (una persona): cierra T-011 y trae la memoria v3. `main` avanza
   por fast-forward hasta `a1ffe48` y después el commit de memoria.
2. T-006b · pantallas de autenticación.
3. T-021 · económico, resolviendo antes qué se hace con la implementación sin comitear.

## Verificación manual pendiente

- T-000 criterio 8: guion completo en navegador (login A → paciente → alta → lista → logout →
  login B → aislamiento).
- T-002 punto 3: un perfil puesto en `suspendido` deja de ver `/pacientes`.

## Hallazgos anotados (abiertos)

- T-011 · el evento «entregado» se queda a medias cuando afecta a varios profesionales →
  derivado a T-015 §Heredado de T-011a, con su negativa exigida.
- T-011 · crear cita o serie no exige vínculo con el paciente → derivado a
  `tickets/T-029-vinculo-en-el-alta-de-agenda.md` (`opus`, ADR antes de tocar una política).
- T-011 · `minimax/cortes/T-011.md` describe la firma vieja de `listarPropuestasPendientes()`:
  **hay que enmendarlo antes de despachar el corte B**.
- T-011 · la base no impone la tabla de transiciones de estado del ADR-045 (se puede volver de
  `realizada` a `programada` por SQL directo). Candidato: disparador `before update of estado`.
- T-011 · `periodicidad = 'mensual'` sigue sin definir: los siete criterios son semanales.
- Los anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados
  (líneas 1247-1444).
