# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 06-10-2026 · **T-021 hecho** (merge 67c1ddd: rondas 1–4, 0 ALTA/0 MEDIA/6 BAJA integrados).

## Dónde estamos

- **Integrado en `main`**: T-000–T-042 (incluye T-021).
- **Siguiente en `supabase/`**: T-043 (20261012120000) → T-023 (20261013120000) → T-026a (20261014120000) → T-046 (20261015120000) → T-023b → T-047.

## Bloqueos

- `.env.local` `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` (propietario).
- winnat: `net stop winnat`.

## Siguiente paso

1. T-043 ya puede empezar.
2. Limpiar worktrees: T-038, T-042, agent-*, rama a15498... (unlink junction antes de git worktree remove).

## Hallazgos anotados

- **T-021 A4-H1 (BAJA)**: si la parte general mueve Q < 0,5 céntimos, ninguna cuota sella (6.4 rechaza cuota 0; banda admite solo 0). T-026 debe acotar esto en Zod.
- **T-021 · seguimiento (ronda 4)**: B4-H1 (constante 1 de `least(1,…)` sin fijar: 0.6 y 1.3 sobreviven), B4-H2 (rama |Q_i| < 1 sin prueba positiva), B4-H3 (techo tipo IVA lejos del borde), A4-H2 (U+1D159 fuera clase invisibles), A4-H3 (tramo extra sin aserción de catálogo) — anotados, T-026 o futuro.
- **Fechas fijas ya pasadas en banco RLS**: `15-agenda.sql:494` CITA1 a 2026-10-06, también en `18-agenda-rango`; `npm run test:rls` cae con 42501 «cita pasada». Requiere ticket.
- **`~/.claude/pipeline/territorio.mjs`**: no reconoce `territorio:` con comentario en la misma línea; muestra verde sin territorio. Usuario.
- **R4.9 propuesta de regla para `.claude/rules/supabase.md`**: lista de caracteres como enteros hexadecimales y `chr()`, nunca escapes barra invertida; y otra de T-021 R3.9: dos disparadores de cotas se ordenan por nombre y cada mensaje de error lleva un fragmento sin prefijo común (decisión usuario/arquitecto; el documentalista las escribió en `.claude/rules/` y se revirtieron).
- **T-028 R5-H32 (BAJA)**: `role="status"` en sugerencias nace relleno cuando cambia el tipo. Arreglo: región montada siempre.
- **Paciente fusionado o traspasado (T-028 R7)**: ni `agenda_crear_cita`/`agenda_crear_serie` ni disparadores impiden agendar fusionado/traspasado. Requiere ticket.
- **`directorio_perfiles` sin prueba RLS**: ningún módulo `scripts/rls/` la nombra; tres pantallas admin (centros, dar de baja, TOTP) la usan desde T-041/T-045.
- **T-042 R2-H1 (BAJA)**: predicado `update` `bloquear_historia()` sin prueba ni mutante; cada «Bloquear» escribe en `auditoria`.
- **T-039 R3-B-H1 (MEDIA)**: reprogramar fuera ventana episodio y dar de baja participante sin dueño; T-034 cubre solo cierre.
- **T-039 R3-A-H1 (BAJA)**: `fn_exigir_vinculo_agenda` solo `before insert`; profesional pasa cita suelta a paciente ajeno.
- **H25 (bloquea producción)**: técnico deduce parejas por `episodio_id` en auditoría.
- **T-040 R2A-H1 (MEDIA)**: `offset`+`count=exact` con 416 bit en cuerpo no contado. PostgREST v16+ requiere S7.
- **Base compartida `test:rls`**: verificador hace `db reset`; revisores trabajan en `begin…rollback` esperando `max(version)`.
- Anteriores 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
