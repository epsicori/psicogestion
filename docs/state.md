# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 24-09-2026 · T-030, T-031 y T-032 integrados en `main` (`ff49fa6`, `cbca245`, `b7aeea2`)

## Dónde estamos

- **Integrado en `main`**: T-000–T-013a, T-016–T-020, T-029–T-032. Autenticación de punta a punta;
  ficha de paciente con identificación cifrada (descifrado registrado en auditoría), sexo, teléfono,
  alergias y medicación (solo adición, solo el profesional asignado, ADR-063). Aritmética de dinero
  (céntimos, IVA 21 %, reparto sin pérdida, redondeo de la mitad lejos del cero). Rejilla de la
  semana con citas solapadas y cambios de hora (23 y 25 h) probados.

## En curso

- **T-014·a · MiniMax por API** (`node minimax/encargar.mjs`, clave en `.env.local`): punto de
  estado de la cita, leyenda y latido (ADR-047), en la rama `T-014a-estado-cita` (worktree
  `../Psicogestion-T014a`). Dos vueltas (`minimax/revisiones/T-014a.md`); la segunda la aplicó la
  fábrica con tres arreglos (`13373fe`, build verde). Sin integrar hasta que T-014 tenga territorio.

## Decidido el 24-09 por el propietario (falta ticket)

- **Salud básica, fila completa** (ADR-064, cierra SQL-H1/TS-H2): formulario con los valores
  vigentes, las dos columnas obligatorias en fila nueva, vaciar es un valor explícito.
- **El verificador coteja sobre y fila** (cierra M1 de T-012a): motivo `sobre_no_coincide_con_fila`
  en `verificar_cadena_huellas()`. Ticket de riesgo alto **antes de T-012**.
- **Cargo × función** (ADR-065): director sanitario = `administrador` de hoy; director
  administrativo nuevo, sin dato clínico. **Abierto**: ¿conserva el acceso de emergencia?
- **Orden**: T-014 y luego T-012, los dos con territorio y diseño del arquitecto (a ninguno de
  los dos contratos le falta nada más que `territorio:`).

## Bloqueos

- Económico sin comitear en el worktree `agent-a3e72807070793a0e`; retomar o rehacer.
- BD local: queda `qr-prueba-…@psicogestion.test` (sonda del QR, 24-09); no se deja borrar por
  las FK de auditoría. Lo limpia el próximo `db reset`.

## Trampas de la fábrica

- **El hook de sellado** (`~/.claude/hooks/verificador-gate.mjs`, del usuario) toma el id del
  ticket del último texto del hilo principal, no del subagente: con agentes en marcha, el último
  texto nombra solo el ticket que parará antes. Un ticket por ventana de parada.
- Un verificador no hace `git stash` en el repo principal. `git archive` con `autocrlf` rompe sellos.
- `merge-gate` busca el id en la orden: nómbralo en el `-m`. `db reset` no relee `config.toml`.
- MiniMax por API: el sondeo elige modelo en cada llamada (Text-01 o M1 el 24-09; M2 no está).

## Siguiente paso

1. Arquitecto: territorio y diseño de T-014 (usa la pieza de T-014·a, rama `T-014a-estado-cita`).
2. Tickets nuevos: verificador sobre/fila, salud básica completa (ADR-064), cargo × función
   (ADR-065). Después, T-012.
3. Guiones de navegador de una sentada.

## Verificación manual pendiente

- T-000 criterio 8 · T-002 punto 3 · T-006 criterios 9 y 10 (Mailpit `http://127.0.0.1:54324`) ·
  T-013 criterios 1, 5, 6, 9, 10 y 11 · T-032 criterio 17 (tres sesiones sobre un paciente con DNI).

## Hallazgos anotados (abiertos)

- **Para T-014**: `new Date('2026-02-30')` da 2 de marzo: validar `?semana=`. T-030 H10: zona
  `null` cae a la del servidor sin lanzar; pasar `zona_horaria_centro()`.
- **T-030 H11**: el informe de Kimi trae evidencia desfasada del criterio 3.
- **T-031**: H12 (MEDIA) `kimi/informes/T-031.md` dice «media al alza»; la regla es la mitad lejos
  del cero, no copiarla. H13 sin prueba de `isSafeInteger` · H14 salidas sin guarda · H15
  `redondearCentimos` deja pasar NaN/Infinity · H16 `pendiente(-6100, 0)` da `cobrado_de_mas` ·
  H17 sale `-0` del desglose de IVA. Mirar antes de T-023 y T-027.
- **T-032**: SQL-H2 (MEDIA) `TABLAS_SOLO_ADICION` de `scripts/lint-migraciones.ts` sin
  `pacientes_salud_basica` (carril de Kimi) · SQL-H3 el `for share` de
  `fn_firmante_no_es_solo_contacto()` sin prueba · SQL-H4 `scripts/rls/README.md:28` dice que el
  administrador lee salud básica · TS-H3 `lib/cifrado/bytea.ts:24` mete el valor en el mensaje de
  error y `datos.ts:381` lo manda a `console.error` · `alta_paciente()` no fija `centro_id` (ADR-033).
- `Pildora` tono `success` pinta `text-primary-foreground` (casi blanco) sobre `bg-primary/10`.
- `docs/architecture.md:62–64,91` sigue en el sobre de once claves y `esquema_version = 2`.
- `modalidad_relacional` bajo el candado (choque 11); técnico sin `consentimientos` (choque 12).
- `Button` 40 px contra 44 px. T-011: sin transiciones del ADR-045 en base.
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados.
