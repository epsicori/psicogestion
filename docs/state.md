# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 03-10-2026 · T-040 A integrado (538799f); T-015 ronda 2 entregada, en verificación.

## Dónde estamos

- **Integrado en `main`**: T-000–T-014, T-011b, T-012 (A/B/C), T-012b/c, T-028 A/a, T-016–T-020, T-029–T-037, **T-040 A**.
  `main` (538799f): 1679 pruebas (ronda 3 T-040 +5), lint 0, build OK.

## En curso

- **T-040 corte A**: integrado (f8990c2). R3-H1 abierto (opacidad y color de marca sin prueba). Corte B: migración, banco 24, interfaz.
- **T-015** (avisos): ronda 2 de arreglos entregada en `worktree-agent-af009e949ce597dfb` (16466e3); verificador en marcha, luego dos revisores.
  Al integrar, fusionar `docs/state.md` a mano (la rama trae el suyo).
- **T-038, T-039, T-041**: diseños cerrados con las decisiones del propietario; esperan turno en `supabase/`.
- **T-028 B/C**: desbloqueados. E15.3, `hoy` inválido, H8/H9, previsualizar (decidir), cero sesiones → error Zod.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK).
- winnat: `net stop winnat`.

## Siguiente paso

1. T-015: verificación y revisión ronda 2; integrar con build Turbopack en `main`.
2. `supabase/`: T-015 → T-039 → T-038 → T-040 B → T-041 → T-028 B.

## Hallazgos anotados (abiertos)

- **T-040 R3-H1** (BAJA): opacidad/color de marca sin prueba. getComputedStyle o fixture.
- **T-035 B-H1 → T-041**: suspendido rechazado.
- **Foco candado**: body, aria-describedby, useDevolucionDeFoco.
- **T-012**: fallos de recarga, cargarPaciente→404, PostgREST directo, coprofesional.
- **T-028a**: marcada_realizada/por vacío; C18TEC; banco 21 año+3; deadlock DB14.
- **`perfiles` sin `apellidos`**: solo nombre_completo.
- **`docs/decisions/INDEX.md`**: faltan ADR-060..075.
- **Scratchpad**: mutar.mjs en paralelo.
- **T-041 R3/R6**: funciones cuentas.
- **T-034 SQL-H2**: reabrir esquiva D6, reloj.
- **T-033**: next start, URL inline, Suspense.
- **T-011c**: ordinal último, sin candado.
- **T-036**: drop if exists + inserts UUID.
- **Alertar sin firmar**: cualquier versión con cita_id.
- **Fuera CI**: SQL crean sin episodio.
- **T-014**: bandeja sin límite, ?centro=todos, estado, 44px, 360px, ?semana, CRLF.
- **T-014→T-015**: ficha lee alertas sin rol.
- **Armazón**: <44px; login→/pacientes. T-031/T-032.
- **H25**: técnico lee tipos ajenos.
- **CI**: sin `NEXT_PUBLIC_*`, `SEGUNDO_FACTOR_LOCAL`.
- **Worktrees**: T-014-correcciones a080931, T-021 aba4b63/a3e7280/a540024/a6a5f46; sucios.
- **interfaz.md:67**: «Lista y alta, sin ficha».
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
