# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 03-10-2026 · T-015 integrado (54ac0d7); T-039 en implementación; T-021 P3 decidido (copia mínima, espejo en T-026).

## Dónde estamos

- **Integrado en `main`**: T-000–T-015, T-011b, T-012 (A/B/C), T-012b/c, T-028 A/a, T-016–T-020, T-029–T-037, **T-040 A**.
  `main` (54ac0d7): 1857 pruebas, lint 0, build OK.

## En curso

- **T-040 A**: R3-H1 abierto (opacidad/color sin prueba). Corte B: migración, banco 24, interfaz.
- **T-039**: ronda 1 con 2 ALTA (oráculos de participación) + 3 MEDIA + 1 BAJA; adenda R2 escrita, P4 = A (resolución automática también para el admin, documentada). Ronda 2 en implementación.
- **T-021**: listo para implementar (ADR-077; espejo y pendiente salen a T-026/T-023). Turno en `supabase/` tras T-028 B. T-023 sube a riesgo alto (vista definer del pendiente).
- **T-038, T-041**: diseños cerrados; esperan turno en `supabase/`.
- **T-028 B/C**: desbloqueados. E15.3, `hoy`, H8/H9, previsualizar, cero sesiones → Zod.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK).
- winnat: `net stop winnat`.

## Siguiente paso

`supabase/`: T-039 → T-038 → T-040 B → T-041 → T-028 B.

## Hallazgos anotados

- **T-040 R3-H1** (BAJA): opacidad/color de marca sin prueba.
- **T-035 B-H1 → T-041**: suspendido.
- **Foco candado**: body, aria-describedby, useDevolucionDeFoco.
- **T-012**: fallos recarga, cargarPaciente→404, PostgREST directo, coprofesional.
- **T-028a**: marcada_realizada/por vacío; C18TEC; banco 21 año+3; deadlock DB14.
- **`perfiles` sin `apellidos`**: solo nombre_completo.
- **`docs/decisions/INDEX.md`**: faltan ADR-060..075.
- **Scratchpad**: mutar.mjs paralelo.
- **T-041 R3/R6**: funciones cuentas.
- **T-034 SQL-H2**: reabrir esquiva D6, reloj; y reabrir es hoy la única salida de la nota de una cita cuyo episodio se cerró (T-039 B-H2, banco 23.Z). Recomendación: no cerrar con citas no canceladas posteriores al cierre.
- **T-033**: next start, URL inline, Suspense.
- **T-011c**: ordinal último, sin candado.
- **T-036**: drop if exists + inserts UUID.
- **Alertar sin firmar**: cualquier versión con cita_id.
- **Fuera CI**: SQL crean sin episodio.
- **T-014**: bandeja sin límite, ?centro, estado, 44px, 360px, ?semana, CRLF.
- **T-015 R3-H1** (BAJA): `fotoDeLayout` época pierde ante foto fresca vieja; franja revive.
- **T-015 (anotados del diseño)**: realizada antes de fin no abre alerta; firmar no revalida layout.
- **T-015 retardo R2.3**: acciones agenda revalidan solo `/agenda`; cabecera vieja hasta navegar.
- **16-series**: `test:rls` falla en `16-series.sql` también en main.
- **T-021 A.9/P3.8**: T-026 espejo/inmutable; `facturas` linter; architecture desfasado; saldo/paciente; bono espejo; ADR-053 dos «cobrado»; outbox; interfaz previa.
- **T-025**: su consulta al asesor debe llevar la lista del ADR-077 punto 7 (contrato sin tocar).
- **Armazón**: <44px; login→/pacientes. T-031/T-032.
- **H25**: el técnico lee en su auditoría `tipo_terapia_id` y, desde T-039, `episodio_id` de las citas de sus centros. Deduce parejas. **Bloquea producción**.
- **CI**: sin `NEXT_PUBLIC_*`, `SEGUNDO_FACTOR_LOCAL`.
- **Worktrees**: sucios (T-014-correcciones, T-021).
- **interfaz.md:67**: «Lista y alta, sin ficha».
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
