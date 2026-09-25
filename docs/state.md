# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 25-09-2026 · T-012b integrado en `main`

## Dónde estamos

- **Integrado en `main`**: T-000–T-013a, T-012b, T-016–T-020, T-029–T-032. Autenticación, ficha
  de paciente cifrada, salud básica de solo adición, dinero en céntimos, rejilla de la semana. El
  verificador de huellas coteja siete columnas de la fila con el sobre (T-012b).

## En curso

- **T-011b** (editar una serie desde la cita elegida): diseñado y enmendado por ADR-068 y ADR-069
  (`0644bc6`). Falta implementarlo. Va **antes** de T-014 (D6 = opción B).
- **T-014** diseñado; espera a T-011b. El botón «Notas» queda desactivado hasta T-012, y el
  criterio 4 se cierra allí.
- **T-014·a** (MiniMax por API): rama `T-014a-estado-cita` (`13373fe`, build verde). Entra con T-014.

## Decidido por el propietario (falta ticket)

- **Salud básica, fila completa** (ADR-064, cierra SQL-H1/TS-H2).
- **Cargo × función** (ADR-065 y ADR-066): el director administrativo no ve datos clínicos, salvo en
  emergencia.
- **`nota_id` al sobre** (ADR-067): ticket T-012c, antes de T-012 (ya depende de T-012b y T-012c).

## Bloqueos

- Hay trabajo económico sin comitear en el worktree `agent-a3e72807070793a0e`: retomar o rehacer.
- BD local: queda `qr-prueba-…@psicogestion.test` (la sonda del QR del 24-09); las FK de auditoría
  impiden borrarlo. Lo limpia el próximo `db reset`.
- Windows reserva a veces los puertos 54245–54344 (winnat), y así el 54322 de Postgres no arranca.
  Se arregla con `net stop winnat` y `net start winnat` en una consola de administrador.

## Trampas de la fábrica

- **El hook de sellado** (`~/.claude/hooks/verificador-gate.mjs`) toma el id del ticket del último
  texto del hilo principal, no del subagente. Un ticket por ventana de parada.
- Un verificador no hace `git stash` en el repo principal. `git archive` con `autocrlf` rompe sellos.
- `merge-gate` busca el id en la orden: nómbralo en el `-m`. `db reset` no relee `config.toml`.
- MiniMax por API: el sondeo elige modelo en cada llamada (Text-01 o M1 el 24-09; M2 no está).

## Siguiente paso

1. T-012c: diseño (arquitecto). Llevar N1 de T-012b y el comentario desfasado (ver Hallazgos).
2. T-011b: implementar; luego T-014 con T-014·a.
3. Tickets de ADR-064 y ADR-065. Guiones de navegador, de una sentada.

## Verificación manual pendiente

- T-000 criterio 8 · T-002 punto 3 · T-006 criterios 9 y 10 (Mailpit `http://127.0.0.1:54324`) ·
  T-013 criterios 1, 5, 6, 9, 10 y 11 · T-032 criterio 17 (tres sesiones sobre un paciente con DNI).

## Hallazgos anotados (abiertos)

- **Para T-012c (de T-012b)**: el comentario de `fn_sellar_version_nota()` en
  `20260915130000_alcance_en_el_sobre.sql:161-163` («tampoco detecta un `alcance` alterado por
  debajo») es falso desde T-012b; no copiarlo al reescribir. **N1**: F.9b de
  `scripts/rls/14-cadena-huellas.sql` restaura una copia del verificador escrita a mano, y lo que
  viene después corre sobre ella. Restaurar desde `pg_get_functiondef` con `\gset`.
- **Para T-014**: `new Date('2026-02-30')` da 2 de marzo: validar `?semana=`. T-030 H10: la zona
  `null` cae a la del servidor sin lanzar; pasar `zona_horaria_centro()`.
- **T-030 H11**: el informe de Kimi trae evidencia desfasada del criterio 3.
- **T-031**: H12 (MEDIA) `kimi/informes/T-031.md` dice «media al alza», y la regla es la mitad lejos
  del cero. H13 sin prueba de `isSafeInteger` · H14 salidas sin guarda · H15
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
