# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 01-10-2026 · T-033 integrado en `main`

## Dónde estamos

- **Integrado en `main`**: T-000–T-013a, T-011b, T-012b, T-016–T-020, T-029–T-034, T-033. Autenticación
  (incluida segundo factor solo local), ficha cifrada, series editables, dinero, rejilla de semana,
  toda nota en episodio, huellas con siete columnas. **T-014 ya no bloqueado.**

## En curso

- **T-012c** (`nota_id` al sobre): implementado en `worktree-agent-ac6451d13a104b7e4` (la rama
  `T-012c-nota-id-en-el-sobre` es historia). Verificador y dos revisores en marcha.
- **T-035** (congelar `centro_id` + director sanitario coprofesional) y **T-036** (`cita_id` cotejado
  en tercera huella): nuevos, sin diseño. Esperan T-012c.
- **T-037** (códigos de recuperación solo al activar, no en cada login): nuevo, sin diseño.
- **T-014** (edición de citas desde calendario): diseñado, entra cuando T-012c cierre.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK auditoría impide borrar).
- Windows winnat a veces reserva 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. T-012c: cerrar verificación y revisión, integrar (build en `main`), `db reset` + seed.
2. T-035–T-036: diseño tras T-012c.
3. T-011c (ordinal mensual, MEDIA → ALTA).

## Hallazgos anotados (abiertos)

- **T-033** (BAJA): (a) `next start` con config mala no sale: queda 500; (b) URL inlineada en build,
  no en runtime; (c) franja dentro `<Suspense>` no da 500 en headers (capa 2 intacta en acción).
- **T-034 SQL-H2** (MEDIA): Reabrir episodio esquiva D6. Regla en ticket que cierre.
- **T-011c** (MEDIA → ALTA): Ordinal deducido de último evento; falta gemela 4.º = último.
- **H27 (T-012c)**: `cita_id` del sobre no se coteja con la cabecera; código en T-036 (ADR-073.4).
  `t001`/`t002` (fuera de CI, territorio ajeno) crean notas sin episodio y quizá sobres de la era 3.
- **Para T-014**: Zod `.omit()/.pick()` + `refine` fallan. Validar `?semana=`. T-030 H10: zona `null`.
- **T-031/T-032** (MEDIA). Anteriores 13-09: `estado-hasta-2026-09-13.md`.
