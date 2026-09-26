# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 26-09-2026 · T-011b integrado en `main`

## Dónde estamos

- **Integrado en `main`**: T-000–T-013a, T-011b, T-012b, T-016–T-020, T-029–T-032. Autenticación,
  ficha cifrada, series editables desde cita elegida, salud básica de solo adición, dinero, rejilla
  de semana. Verificador de huellas coteja siete columnas con el sobre.

## En curso

- **T-014** diseñado, espera «esta y las siguientes» de T-011b (ya integrado). Botón «Notas»
  desactivado hasta T-012. **T-014·a** (MiniMax por API, rama `T-014a-estado-cita`) entra con T-014.
- **T-012c** (`nota_id` al sobre): diseño a cargo del arquitecto. Depende de T-012b.

## Decidido por el propietario (falta ticket)

- **Salud básica, fila completa** (ADR-064). **Cargo × función** (ADR-065, ADR-066): administrativo
  no ve clínicos, salvo emergencia.

## Bloqueos

- Hay trabajo económico sin comitear en el worktree `agent-a3e72807070793a0e`: retomar o rehacer.
- BD local: `qr-prueba-…@psicogestion.test` (sonda del 24-09); FK de auditoría impide borrar.
- Windows winnat a veces reserva puertos 54245–54344; Postgres no arranca en 54322. Arreglo: `net
  stop winnat` + `net start winnat` en consola de administrador.

## Siguiente paso

1. T-014 + T-014·a: editar cita desde rejilla, confirmar cambio de serie que T-011b prepara.
2. T-012c: diseño (arquitecto). N1 de T-012b (verificador escrito a mano vs. pg_get_functiondef).
3. Tickets de ADR-064 y ADR-065. T-011c (ordinal mensual bajo ADR-070).

## Hallazgos anotados (abiertos)

- **T-011c (MEDIA → ALTA riesgo, diseño en tickets)**. H1+H2+H3 de T-011b, bajo ADR-070 (propietario
  decidió opción a, c451d47). Ordinal deducido del último evento `agenda.regla_serie_cambiada` en
  serie, no de heurística de cita más cercana. H2: falta gemela 4.º de verdad = último. H3: lectura
  de ancla sin candado. Necesita diseño del arquitecto.
- **Para T-012c (de T-012b)**: comentario `20260915130000_…:161-163` es falso desde T-012b; no copiar.
  **N1**: F.9b restaura verificador escrito a mano. Usar `pg_get_functiondef` con `\gset`.
- **Para T-014**: Zod `.omit()` y `.pick()` lanzan en esquemas con `refine` (TS-H7, bitácora T-011b).
  `new Date('2026-02-30')` = 2-03: validar `?semana=`. T-030 H10: zona `null` cae a servidor sin lanzar.
- **T-031 H12–H17** (MEDIA), **T-032 SQL-H2–H4, TS-H3** (MEDIA, sin prueba). Mirar antes de T-023.
- `Pildora` success / `architecture.md` once claves / `Button` 44px / T-011 sin transiciones
  ADR-045. Anteriores 13-09: `estado-hasta-2026-09-13.md`.
