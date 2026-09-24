# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño (ADR, trampas, circuito)
> en tickets y bitácora; las reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 24-09-2026 · `main` con T-012a integrado · tickets: 18 hechos · 6 en curso

## Dónde estamos

- Integrado en `main`: T-000 a T-011, **T-012a** (sobre de doce claves, `esquema_version = 3`),
  T-013 (dos cortes), T-013a, T-016 a T-020 y T-029. La nota clínica (T-012) ya puede firmar.
- La autenticación está completa de punta a punta; la ficha del paciente existe con cinco pestañas.

## En curso

- **T-032** · Alta de paciente completa (riesgo alto), en el worktree `agent-a2fbeaf1f1cdd100e`.
  Segunda vuelta de correcciones hecha (24-09). Alergias y medicación son de solo adición y solo del
  profesional asignado (**ADR-063**, decisión del propietario). Pruebas de unión y de cableado de la
  ficha, candado en la guarda de `solo_contacto`. En verde: test 581/581, rls 428 OK (base vacía y
  sembrada), build, lint y `territorio.mjs`. Falta: reverificar, dos revisores de cierre y merge.
  Detalle en `docs/bitacora/T-032.md`.
- **T-031** · Dinero. Por decisión del propietario (23-09) `lib/dinero/**` pasa a la fábrica; lo de
  Kimi (`170afbf`) es punto de partida. Revisión: altas H1 (`'1.23,50'` se acepta como 123,50 €) y
  H2 (gobierno, resuelta con la decisión); medias H3 y H4.
- **T-030** · Rejilla de la semana (rama `T-030-rejilla-semana`, carril de Kimi). La corrige la
  fábrica por esta vez (decisión del 23-09): falta la prueba del domingo de 25 h de octubre (ALTA) y
  `formatearFechaSinZona` no valida el día del calendario.
- T-002, T-006, T-013: solo les quedan los guiones de navegador (abajo).

## Bloqueos y decisiones que no toma un agente

- **Cada cuánto caduca una valoración de riesgo**: `MESES_VALORACION_VIGENTE = 6` es un marcador.
- **`verificar_cadena_huellas()` no coteja `alcance`** de la fila contra el del sobre: decidirlo
  antes de la primera firma real (T-012).
- Económico: implementación sin comitear en el worktree `agent-a3e72807070793a0e` (1413 líneas, sin
  verificar ni revisar). Retomar o rehacer.
- Obsoletos, a la espera de que alguien diga que se borran: la rama `verificacion-T-011a` y los
  worktrees `agent-a0c13db09cb6a7b62`, `agent-a3133689fd69000ac`, `agent-a0cf274d698e0d85b`,
  `agent-ac7b6a35059cc839d`, `agent-a0fd267d4973735c3` (con ficheros sin comitear; mirar antes).
- **`stash@{0}` («verificador T-031 stash»)**: el verificador de T-031 guardó ahí todo lo no
  comiteado. Los ficheros sin seguimiento ya están restaurados (evidencia y revisión selladas de
  T-012a, contrato y diseño de T-032). Siguen dentro dos cambios de `main` sin comitear: el arreglo
  del QR de `segundo-factor.tsx` (anotado como erróneo: `qr_code` llega como SVG crudo, no data URI)
  y una nota de state.md. No borrar el stash sin decidir el QR.

## Trampas de la fábrica (v3.1)

- **Un verificador no hace `git stash`** en el repo principal: se llevó evidencia sellada ajena.
- `git archive` con `core.autocrlf=true` convierte a CRLF: un JSON sellado se restaura con
  `git show`, no con `git archive`, o su hash deja de coincidir.
- `merge-gate` busca el id de ticket en el texto de la orden: una rama `worktree-agent-*` no lo
  lleva; nómbralo en el `-m`.
- `territorio.mjs` lee el contrato **de la rama**: tras ampliar `territorio:` en `main`, tráelo con
  `git checkout main -- tickets/T-XXX-….md` (el merge-gate bloquea `git merge main`).
- `implementador` fuerza worktree propio · `build | tail` da el estado de `tail` · rutas con espacio.

## Siguiente paso

1. T-032 · verificador y dos revisores sobre la segunda vuelta; merge.
2. T-031 y T-030 · correcciones por la fábrica, nueva revisión, verificación.
3. T-012 · nota clínica con firma, ya desbloqueada por T-012a.
4. Los guiones de navegador, de una sentada. `db reset` **no relee `config.toml`**.

## Verificación manual pendiente

- T-000 criterio 8 · T-002 punto 3 · T-006 criterios 9 y 10 (Mailpit `http://127.0.0.1:54324`) ·
  T-013 criterios 1, 5, 6, 9, 10 y 11 · T-032 criterio 17 (tres sesiones sobre un paciente con DNI).

## Hallazgos anotados (abiertos)

- `alta_paciente()` no fija `centro_id` (ADR-033, T-032): un técnico no ve a los pacientes creados
  desde el formulario hasta que algo les asigne centro. Ticket propio.
- `docs/architecture.md:62-64,91` sigue en el sobre de once claves y `esquema_version = 2`.
- `modalidad_relacional` bajo el candado (choque 11); técnico sin `consentimientos` (choque 12).
- El `Button` compartido mide 40 px contra 44 px.
- T-011 · «entregado» a medias → T-015; sin transiciones del ADR-045 en base; `mensual` sin definir.
- Los anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados.
