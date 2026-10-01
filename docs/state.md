# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 01-10-2026 · T-034 integrado en `main`

## Dónde estamos

- **Integrado en `main`**: T-000–T-013a, T-011b, T-012b, T-016–T-020, T-029–T-032, T-034. Autenticación,
  ficha cifrada, series editables desde cita elegida, salud básica de solo adición, dinero, rejilla
  de semana, toda nota en episodio. Verificador de huellas coteja siete columnas con el sobre.

## En curso

- **T-012c** (`nota_id` al sobre): diseño cerrado (P6 resuelta por ADR-073.3). Implementación por lanzar.
- **T-035** (centro congelado + director sanitario coprofesional, ADR-073.1-2) y **T-036** (`cita_id`
  cotejado, ADR-073.4, tras T-012c): nuevos, sin diseño.
- **T-033** (segundo factor desactivable en local): nuevo, sin diseño. Bloquea T-014 en CI real.
- **T-014** diseñado, espera T-033. **T-014·a** (MiniMax, rama `T-014a-estado-cita`) entra con T-014.

## Bloqueos

- Hay trabajo económico sin comitear en worktree `agent-a3e72807070793a0e`.
- BD local: `qr-prueba-…@psicogestion.test` (FK de auditoría impide borrar).
- Windows winnat a veces reserva puertos 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. T-012c: implementación (Opus), verificación y dos revisores. Después T-035 y T-036.
2. T-033: segundo factor desactivable en local, para T-014 en CI.
3. T-011c (ordinal mensual bajo ADR-070, MEDIA → ALTA riesgo).

## Hallazgos anotados (abiertos)

- **T-034 SQL-H2** (MEDIA): Reabrir episodio (`cerrado_en = null`) esquiva D6 y mueve reloj. **Regla de ticket que cierre episodios.**
- **T-034 SQL-H3 y SQL-H4**: decididos en ADR-073 (congelar `centro_id`; admin sanitario vale de coprofesional). Código en T-035.
- **Fuera de CI**: `t001-esquema.sql`, `t002-rls.sql` crean notas sin episodio. Territorio ajeno.
- **T-011c** (MEDIA → ALTA): H1+H2+H3 de T-011b bajo ADR-070. Ordinal deducido de último evento. Falta gemela 4.º = último. Lectura de ancla sin candado.
- **H27 (T-012c)**: `cita_id` del sobre no se coteja contra la cabecera (`notas_clinicas` no la guarda; sale de la cita). Sin decisión. `t001`/`t002` pueden llevar generadores de sobre de la era 3 (territorio ajeno, fuera de CI).
- **Para T-014**: Zod `.omit()/.pick()` lanzan con `refine` (TS-H7). Fecha `2026-02-30` = 2-03; validar `?semana=`. T-030 H10: zona `null` sin validación.
- **T-031/T-032** (MEDIA). T-011 sin transiciones ADR-045. Anteriores 13-09: `estado-hasta-2026-09-13.md`.
