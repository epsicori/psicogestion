# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 02-10-2026 · T-036 integrado; T-012 corte B y T-035 en marcha

## Dónde estamos

- **Integrado en `main`**: T-000–T-014, T-011b, T-012b, T-012c, T-012 corte A, T-028 corte A, T-037, **T-036**,
  T-016–T-020, T-029–T-034. Autenticación, ficha cifrada, series, dinero, toda nota en episodio (era 4), calendario,
  y la nota clínica en servidor: borrador, firma sellada y encadenada (cotejada en la base: cita, borrador
  vigente, reloj), resolución de la alerta.
- `main` (02-10, 9be04e9): `npm test` 1315/1315, `db reset` + `seed` + `test:rls` verdes; en 44d6d67: lint 0 errores, build, `db reset` + `seed` +
  `test:rls` (20 suites, 846 OK) y playwright 7/7 (`SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`, `--workers=1`).

## En curso

- **T-012 corte B**: diseño en `tickets/T-012/diseno.md` §Corte B (+ decisiones del propietario al final:
  borrador ajeno visible en solo lectura; plazo nulo de la ficha dentro). En implementación. C después.
- **T-035**: diseño (arquitecto). **T-038** «regenerar mis códigos»: contrato con P-1…P-4 decididos
  (02-10: «Mi cuenta», `notificaciones`, avisar siempre, contraseña **también en la base**); falta diseño.
- **T-028** cortes B y C tras **T-028a** (contrato escrito; cierra H16, H23, H24). Al corte B: E15.3
  (`order desc limit 6` y su prueba), `hoy` inválido lanza → `agenda.alta.sugerencias.error` sin tumbar el
  render; H8 y H9 (BAJA, pruebas: recorte tras ordenar con > 6 desordenadas; día y hora sobre todas las pasadas).
- **Tickets por escribir**: cita↔episodio y presencial/online (ADR-075); auditoría alineada con la matriz (H25); Ajustes › Tipos de terapia (catálogo vacío).
- **Worktrees por quitar** (integrados; **`node_modules` junction**: `cmd /c rmdir` antes de
  `git worktree remove`): de T-014 `agent-a5cb7c…`, `agent-a09e76…`, `agent-a08093…`,
  `../Psicogestion-T014a`; de T-012 `agent-aff9f2…`, `agent-a2f34b…`, `agent-a76728…`, `agent-a83fae…`.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK auditoría impide borrar).
- Windows winnat a veces reserva 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. `supabase/` en orden, nunca dos a la vez: T-035 → T-028a → cita↔episodio (ADR-075) → T-038.
2. T-012 corte B (pantalla; su verificación usa la BD). Sin `supabase/`: T-015, T-011c.

## Hallazgos anotados (abiertos)

- **T-012 corte A → corte B** (BAJA): R4-H1, R4-H2, `prolongarDesbloqueo` y `notas.sello` con seis
  claves: decididos en §Corte B (B.2), se cierran al integrar el corte B.
- **T-033** (BAJA): (a) `next start` con config mala no sale: queda 500; (b) URL inlineada en build,
  no en runtime; (c) franja dentro `<Suspense>` no da 500 en headers (capa 2 intacta en acción).
- **T-034 SQL-H2** (MEDIA): reabrir episodio (`cerrado_en = null`) esquiva D6 y mueve el reloj.
  Regla para el ticket que cierre episodios. SQL-H3/H4 decididos en ADR-073; código en T-035.
- **T-011c** (MEDIA → ALTA): ordinal deducido del último evento; falta gemela 4.º = último; lectura
  de ancla sin candado.
- **T-036** (BAJA): R1-B-H1 `t005-concurrencia.sql:220` los `drop if exists` van tras inserts con UUID
  fijos; B-H4 sin `finally` (iría en `scripts/test-huellas.mjs`). Lint: 2 avisos en `lib/cuentas/accesos.test.ts`.
- `fn_alertar_nota_sin_firmar` no abre alerta si existe *cualquier* versión con ese `cita_id`
  (de otro paciente incluido); la resolución de T-012 sí lo mira. Sin ticket.
- **Fuera de CI**: `t001-esquema.sql`, `t002-rls.sql` crean notas sin episodio (sobre era 3).
- **Para T-014**: Zod `.omit()/.pick()` lanzan con `refine` (TS-H7). `2026-02-30` se lee como 2-03:
  validar `?semana=`. T-030 H10: zona `null` sin validación.
- **T-014, ronda de arreglos** (abiertos a propósito): SQL-H3 bandeja sin límite y `.in('id', ids)`;
  SQL-H5 `reprogramar.ts:80` «recarga» no sirve con `?centro=todos`; la RPC `agenda_actualizar_cita` no
  comprueba el estado; caja de cita < 44 px al tacto; `test:a11y` en paralelo; a 360 px la semana no
  muestra citas. La bandeja del administrador filtra por `profesional_id` propio. CRLF rompe `prettier --check`.
- **T-014 → T-015** (propietario, 01-10): el técnico solo ve alertas `consentimiento_pendiente`; la RLS de
  `alertas_documentacion` entra con T-015 y cierra la ficha (`pacientes/[id]/datos.ts:320`,
  `PanelResumen`, `PanelDocumentos`), que lee todas las alertas sin mirar el rol.
- **T-014** (BAJA): panel de la última fila del mes rebasa el calendario; cita movida fuera de la vista
  con panel abierto sigue pintada vieja (`calendario.tsx:312-315`). B3-1..B3-5 aceptadas.
- **Armazón**: objetivos < 44 px (menú 36, cerrar 32, centro 40); el login lleva a `/pacientes`, no a
  `/agenda`. Sin ticket. **T-031/T-032** (MEDIA). T-011 sin transiciones ADR-045.
- **H25** (T-028a Q1): el técnico lee el tipo de citas ajenas en sus filas de `auditoria` al reprogramar.
- **CI nunca ha corrido** (`actions/runs` = 0); a `ci.yml` le faltan `NEXT_PUBLIC_SUPABASE_*` y
  `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`. Sin ticket. `app/layout.tsx(45,50)` `LayoutProps` sin build previo en `tsc`.
- **R2-H4 (T-037)**: `seed.mjs:29`, `test-huellas.mjs:19` toman el primer `supabase_db_*` (hay `cinfa-e2e`);
  usar `contenedorDelProyecto()`. `acceso.spec.ts:138` falla ~1 de 4 en `test:a11y` en paralelo. Sin ticket.
- **Memoria desfasada**: `docs/interfaz.md:67` dice «Lista y alta, sin ficha» y `/pacientes/[id]` existe.
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
