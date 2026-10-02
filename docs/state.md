# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 02-10-2026 · T-035 integrado; T-012 corte B a falta de la verificación en navegador

## Dónde estamos

- **Integrado en `main`**: T-000–T-014, T-011b, T-012b, T-012c, T-012 corte A, T-028 corte A, T-016–T-020,
  T-029–T-037. Autenticación, ficha cifrada, series, dinero, toda nota en episodio, calendario, nota clínica en
  servidor (borrador, firma sellada y cotejada), centro congelado y coprofesional por rol y activo.
- `main` (02-10, 06d13b6): `npm test` 1316/1316. T-035 en 410046e: `db reset` + `seed` + `test:rls`, lint
  0 errores, build. La base local está en `main` sin cambios pendientes.

## En curso

- **T-012 corte B**: verificación 3 = todo PASA salvo el foco de la firma rechazada dentro del diálogo.
  Arreglado en la rama `worktree-agent-a50633aa7d7148c4d` (0c6fac2; contiene el corte B entero sobre `main`,
  1524 tests). **Falta**: repetir en navegador la reproducción del criterio «B» (`evidencia.json`), y entonces
  integrar **esa** rama (no la `a569a13…`, que queda sustituida) y bitácora.
- **T-012 corte C**: diseño cerrado en `tickets/T-012/diseno.md` §Corte C + decisiones del propietario
  (comparador por palabras, B2-H1..H3; **sin descarga**). Se implementa tras integrar B. Sin base.
- **T-040** «Capa de exportación clínica» (riesgo alto): contrato escrito; la descarga sale de T-012. El
  administrador exporta solo por motivo cerrado y auditado (Ley 41/2002 art. 16.4, decisión 5). Falta diseño.
- **Diseñados, en la cola de `supabase/`**: T-028a, T-015 (avisos; sello `20261006120000`), T-038.
  **T-039** (cita en episodio y modalidad): el arquitecto lo está diseñando.
- **T-028** cortes B y C tras T-028a. Al corte B: E15.3 (`order desc limit 6` y su prueba), `hoy` inválido →
  `agenda.alta.sugerencias.error`; H8 y H9 (BAJA, pruebas de recorte y de día y hora).
- **Tickets por escribir**: auditoría alineada con la matriz (H25); Ajustes › Tipos de terapia; CI; ADR de
  telepsicología; foco del formulario del candado (abajo).

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK auditoría impide borrar).
- Windows winnat a veces reserva 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. Base libre → verificación en navegador del foco de T-012 corte B → integrar → corte C.
2. `supabase/` en orden, nunca dos a la vez: T-028a → T-015 → T-039 → T-038 → T-040.
3. Al implementador de T-038: reutilizar las etiquetas `notificaciones.tipos.*`.

## Hallazgos anotados (abiertos)

- **T-035 B-H1 (MEDIA, propietario)**: la coterapia con el administrador solo existe en el banco: 7c exige
  alta en `perfiles_centros` y nada se la da (ni siembra ni invitación; tampoco a un profesional invitado).
  Decidido (02-10): altas de centro, **T-041** (contrato escrito). **H1**: un `suspendido` se rechaza con el texto
  «de baja» y sin prueba. **H2**: `architecture.md:390` da por excluido al director administrativo; solo es
  cierto si ADR-065 lo hace valor del enum, no marca de perfil.
- **Foco del candado**: `app/(app)/candado/formulario-candado.tsx`: PIN malo con clic en «Abrir» deja el foco en
  `body` (el botón se deshabilita); el mensaje es `role="status"` sin `aria-describedby`. El PIN del editor
  bloqueado es otro formulario, sin comprobar. `useDevolucionDeFoco` (`components/ui/foco.ts`) no devuelve el
  foco si el disparador queda deshabilitado.
- **T-012**: B1-H8 `cargarPaciente` → 404; un `select` directo por PostgREST sobre `borrador_contenido`; la ruta
  del coprofesional (lee por episodio conjunto pero la página exige ver al paciente).
- **ADR-049 / ADR-032:75** dan por existente la capa `exportaciones`: la construye T-040.
- **T-034 SQL-H2** (MEDIA): reabrir episodio (`cerrado_en = null`) esquiva D6 y mueve el reloj. Regla para el
  ticket que cierre episodios. `episodio_para_nota` reutiliza el episodio abierto sin mirar el centro de la cita.
- **T-033** (BAJA): (a) `next start` con config mala queda en 500; (b) URL inlineada en build; (c) franja dentro
  de `<Suspense>` no da 500 en headers.
- **T-011c** (MEDIA → ALTA): ordinal deducido del último evento; falta gemela 4.º = último; ancla sin candado.
- **T-036** (BAJA): `t005-concurrencia.sql:220` `drop if exists` tras inserts con UUID fijos; sin `finally`.
  Lint: 2 avisos en `lib/cuentas/accesos.test.ts`.
- `fn_alertar_nota_sin_firmar` no abre alerta si existe *cualquier* versión con ese `cita_id`. Sin ticket.
- **Fuera de CI**: `t001-esquema.sql`, `t002-rls.sql` crean notas sin episodio (sobre era 3).
- **T-014**: SQL-H3 bandeja sin límite; SQL-H5 `reprogramar.ts:80` con `?centro=todos`; la RPC
  `agenda_actualizar_cita` no comprueba el estado; caja de cita < 44 px; a 360 px la semana no muestra citas;
  panel de la última fila rebasa; cita movida fuera de vista sigue pintada. Validar `?semana=`. CRLF rompe prettier.
- **T-014 → T-015**: la ficha (`pacientes/[id]/datos.ts:320`) lee todas las alertas sin mirar el rol; lo cierra la
  RLS de T-015. Duda futura: ¿el técnico resuelve `consentimiento_pendiente`?
- **Armazón**: objetivos < 44 px; el login lleva a `/pacientes`. **T-031/T-032** (MEDIA). T-011 sin ADR-045.
- **H25**: el técnico lee el tipo de citas ajenas en sus filas de `auditoria` al reprogramar.
- **CI nunca ha corrido**; a `ci.yml` le faltan `NEXT_PUBLIC_SUPABASE_*` y `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`.
- **R2-H4**: `seed.mjs:29`, `test-huellas.mjs:19` toman el primer `supabase_db_*`; usar `contenedorDelProyecto()`.
- **Worktrees** sin integrar o sucios (no borrar sin mirar): T-014-correcciones `a080931`, T-021 diseño `aba4b63`,
  `a3e7280`, `a540024`, `a6a5f46`; sucios `a0cf274`, `a0fd267`, `a2250fd`, `a47a1a5`, `a5cb7c9`, `ac7b6a3`.
- **Memoria desfasada**: `docs/interfaz.md:67` dice «Lista y alta, sin ficha».
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
