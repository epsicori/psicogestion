# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 04-10-2026 · T-042 integrado (2 rondas; prueba manual del propietario OK: PIN y canje en `/recuperar`).

## Dónde estamos

- **Integrado en `main`**: T-000–T-015, T-011b, T-012 (A/B/C), T-012b/c, T-028 A/a, T-016–T-020, T-029–T-039, **T-040 A**, **T-042**.
  T-042 ronda 2: `npm test` 1953, `test:rls` 1645 OK, lint 0, build OK (detalle en `docs/bitacora/T-042.md`).

## En curso

- **T-040 A**: R3-H1 abierto (opacidad/color sin prueba). Corte B: migración, banco 24, interfaz.
- **T-021**: listo para implementar (ADR-077; espejo y pendiente salen a T-026/T-023). T-023 sube a riesgo alto (vista definer del pendiente).
- **T-028 B/C**: desbloqueados. E15.3, `hoy`, H8/H9, previsualizar, cero sesiones → Zod.
- **T-041**: diseño cerrado; espera turno en `supabase/`.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK).
- winnat: `net stop winnat`.

## Siguiente paso

Cola `supabase/`: T-040 B → T-041 → T-028 B → T-021. Ticket corto de interfaz: enlace a `/recuperar` (ver Hallazgos).
Limpiar los worktrees de T-038 y T-042 (rondas 1 y 2) y `agent-acac6bd68d6c681b5`, quitando antes la junction de `node_modules`.

## Hallazgos anotados

- **`/recuperar` sin enlace (T-042, prueba manual)**: ninguna pantalla enlaza a `/recuperar`, tampoco «Verificación en dos pasos» de `/primera-vez`, donde se queda quien perdió el móvil; solo se llega tecleando la URL. `docs/interfaz.md` no la menciona. Propuesta: enlace «¿Has perdido el acceso a tu app? Usa un código de recuperación».
- **T-042 R2-H1 (BAJA)**: el predicado del `update` de `bloquear_historia()` (migración `20261009120000:442`) no tiene prueba ni mutante; sin él cada «Bloquear» escribe una fila `UPDATE` en `auditoria` y `test:rls` sigue verde. Arreglo: aserción en CA-R2.2 de que bloquear con `0/0/false` no cambia el recuento.
- **T-038 A3-H1=B3-H2 (BAJA)**: `lib/cuentas/totp.ts:57` marca `reentrar` ante cualquier 42501; `generar_codigos_recuperacion()` lo lanza por cuatro causas (Q3(B) incluida) y la vista afirma «hace más de cinco minutos». La salida sí resuelve.
- **T-038 R4-H1 (BAJA)**: `app/(app)/cuenta/formulario-regenerar.test.tsx:160-161` niega dos frases concretas, no cualquier condición sobre el aviso; «… salvo que en tus avisos ya salga…» pasa. Arreglo: negar la etiqueta del aviso.
- **T-038 y T-042 lecciones**: reglas por ruta propuestas para `.claude/rules/supabase.md` (orden de guardas en RPC definer, fallo sin lanzar, `p_contrasena` fuera de raise/format, `crypt`+NULL en `coalesce`), una comprobación para `guard.json` y el ADR del patrón de dos pasos, en `docs/bitacora/T-038.md` y `T-042.md`; decide usuario/arquitecto.
- **T-042 notas**: `canjearCodigo` sin Zod en servidor; `scripts/t002-rls.sql` y `t004-auditoria.sql` llaman a la firma de un paso, que ya no existe (ningún `npm run` los usa).
- **T-038 nota de despliegue (Q1)**: los ajustes de registro de Postgres que exige `registro_postgres_seguro()` viven solo en `docs/bitacora/T-038.md`; no hay manual de despliegue.
- **`app/page.tsx` en `next dev`**: el `redirect('/agenda')` hace saltar «Route "/": Could not validate `instant`» (Cache Components) en cada visita a `/`; sale en el indicador de errores de desarrollo. Funciona, pero ensucia el registro.
- **`verificar` en `app/primera-vez/segundo-factor.tsx:117` (T-037)**: transición asíncrona sin `try/catch` y sin `error.tsx` en `app/`; un fallo sustituye la página entera (mismo patrón que T-038 B2-H1).
- **Playwright con 6 workers**: `acceso.spec:138` y `avisos.spec:29` fallan porque entran a la vez con el mismo usuario sembrado («el TOTP sembrado no se aceptó»); en serie pasan.
- **`test:a11y`**: sin `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` cinco specs ajenas caen en `/primera-vez` y fallan sin decir por qué. El script debería fijarla.
- **R2-H4 (T-037)**: `scripts/seed.mjs:29` y `scripts/test-huellas.mjs:19` toman el primer `supabase_db_*`.
- **Base compartida**: el verificador hace `db reset` mientras los revisores miden; los revisores trabajan en `begin … rollback` y esperan a `max(version)`.
- **T-039 R3-B-H1 (MEDIA)**: architecture.md, residuo (3). Reprogramar fuera de la ventana del episodio y dar de baja a un participante no tienen dueño; T-034 SQL-H2 cubre solo el cierre posterior.
- **T-039 R3-B-H2 (BAJA)**: H25 dice «de una cita», pero el técnico lee `episodio_id` también en la auditoría de `series_cita`.
- **T-039 R3-B-H3 (BAJA)**: `scripts/rls/README.md:49` dice «(V, S)»; faltan C, W, N, T.
- **T-039 R3-A-H1 (BAJA)**: `fn_exigir_vinculo_agenda` solo `before insert`; un profesional pasa su cita suelta a un paciente ajeno (ADR-055). Arreglo: también `before update of paciente_id`.
- **H25**: el técnico lee en su auditoría `tipo_terapia_id` y, desde T-039, `episodio_id`. Deduce parejas. **Bloquea producción**.
- **T-034 SQL-H2**: reabrir esquiva D6, reloj; y reabrir es hoy la única salida de la nota de una cita cuyo episodio se cerró (banco 23.Z). Recomendación: no cerrar con citas no canceladas posteriores al cierre.
- **T-040 R3-H1** (BAJA): opacidad/color de marca sin prueba.
- **T-035 B-H1 → T-041**: suspendido.
- **T-041 R3/R6**: funciones cuentas.
- **T-025/T-026 (ADR-078)**: borradores en `docs/legal/` (consulta vinculante DGT con la lista del ADR-077 p.7; preguntas a Holded). Los envía el propietario tras revisión de asesor, antes de comercializar. Contratos sin tocar: los ajusta el arquitecto (vocabulario, 14.6, clave mínima).
- **T-021 A.9/P3.8**: T-026 espejo/inmutable; `facturas` linter; architecture desfasado; saldo/paciente; bono espejo; ADR-053 dos «cobrado»; outbox; interfaz previa.
- **T-015 R3-H1** (BAJA): `fotoDeLayout` época pierde ante foto fresca vieja; franja revive.
- **T-015 (anotados del diseño)**: realizada antes de fin no abre alerta; firmar no revalida layout.
- **T-015 retardo R2.3**: acciones agenda revalidan solo `/agenda`; cabecera vieja hasta navegar.
- **T-014**: bandeja sin límite, ?centro, estado, 44px, 360px, ?semana, CRLF.
- **T-012**: fallos recarga, cargarPaciente→404, PostgREST directo, coprofesional.
- **T-028a**: marcada_realizada/por vacío; C18TEC; banco 21 año+3; deadlock DB14.
- **T-033**: next start, URL inline, Suspense.
- **T-011c**: ordinal último, sin candado.
- **T-036**: drop if exists + inserts UUID.
- **16-series**: `test:rls` falla en `16-series.sql` también en main.
- **Foco candado**: body, aria-describedby, useDevolucionDeFoco.
- **Alertar sin firmar**: cualquier versión con cita_id.
- **Fuera CI**: SQL crean sin episodio.
- **CI**: sin `NEXT_PUBLIC_*`, `SEGUNDO_FACTOR_LOCAL`.
- **Armazón**: <44px; login→/pacientes. T-031/T-032.
- **`perfiles` sin `apellidos`**: solo nombre_completo.
- **`docs/decisions/INDEX.md`**: faltan ADR-060..075.
- **interfaz.md:67**: «Lista y alta, sin ficha».
- **Scratchpad**: mutar.mjs paralelo.
- **Worktrees**: sucios (T-014-correcciones, T-021).
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
