# Estado

> Memoria viva. Máximo 80 líneas. Solo presente. Diseño (ADR, trampas, circuito) en tickets y
> bitácora; reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 16-09-2026 · rama `worktree-agent-a2fbeaf1f1cdd100e` sin mezclar (T-032) ·
tickets: 17 hechos en `main` · 5 en curso · 12 pendientes

## Dónde estamos

- Integrado en `main`: T-000 a T-011, T-013 (dos cortes), T-013a, T-016 a T-020 y T-029.
- **T-032 (alta de paciente completa) implementado entero en su worktree, sin mezclar en `main`**:
  teléfono/sexo, DNI/domicilio cifrados con lectura auditada (`leer_identificacion()`, ADR-060),
  salud básica sin el técnico (ADR-061). 19/20 criterios con evidencia (`docs/bitacora/T-032.md`);
  el 17 es de navegador, sin ejecutar.
- La autenticación está completa de punta a punta: invitación, primer acceso (TOTP → PIN), candado,
  recuperación, ajustes de administrador, baja y sesión de 30 minutos.
- **La ficha del paciente existe**: `/pacientes/<uuid>`, cinco pestañas, candado dentro de Historia
  clínica, caducidad automática y registro de acceso en la acción de apertura.
- Verificación del árbol de T-032 (16-09, en su worktree): `lint` 0 errores, **546 pruebas / 56
  ficheros**, `build` limpio (+`/pacientes/[id]`, sin `blocking-prerender-*` nuevo), `test:rls`
  **406 aserciones** (antes 380), `lint:migraciones` **13** limpias.

## En curso

- T-002 · RLS: todo integrado; queda el punto 3 del guion manual, nunca ejecutado en navegador.
- T-006 · Autenticación: ocho criterios automáticos cerrados; abierto solo por los 9 y 10, de
  navegador (`docs/bitacora/T-006.md`).
- T-013 · Ficha del paciente: **todo lo automático cerrado** (tabla en el ticket §Estado de entrega).
  Quedan los de navegador: matriz de roles con las tres sesiones, cotejo con `/prototipo`, 44 px.
- T-012 · Nota clínica: diseño hecho, cuatro cortes. En vuelo el previo (sobre de doce claves), que
  tiene que estar en `main` **antes de que nadie firme**: después cuesta una era de esquema.

## Bloqueos y decisiones que no toma un agente

- Económico: diseño comiteado (`79e039f`) y una **implementación sin comitear** en el worktree
  `agent-a3e72807070793a0e` (`…/20260913120000_economico_esquema.sql`, 1413 líneas). Decidir si se
  retoma o se rehace: no pasó por verificación ni revisión.
- Obsoletos, a la espera de que alguien diga que se borran: la rama `verificacion-T-011a` y los
  worktrees `agent-a0c13db09cb6a7b62`, `agent-a3133689fd69000ac`, `agent-a0cf274d698e0d85b`,
  `agent-ac7b6a35059cc839d`, `agent-a0fd267d4973735c3` (con ficheros sin comitear; mirar antes).

## Trampas de la fábrica (v3.0 instalada, no la v3.1 del repo: faltan dos hooks)

- **El `merge-gate` corre en toda llamada a Bash**: deniega cualquier orden cuyo texto lleve un id de
  ticket; se esquiva partiendo el id (`N=029`). `npm run build 2>&1 | tail -n` **devuelve el estado
  de `tail`**: siempre `> log 2>&1; echo "exit=$?"`.
- En rutas con espacio («01 Proyectos»), toda variable va entrecomillada o falla en silencio.

## Siguiente paso

1. T-032 · revisar e integrar en `main`; luego ejecutar su guion de navegador (criterio 17).
2. T-012 · nota clínica con firma: la ficha ya tiene el hueco y el registro que la hace lícita.
3. T-021 · económico, resolviendo antes qué se hace con la implementación sin comitear.
4. Los otros cuatro guiones de navegador, de una sentada. `db reset` **no relee `config.toml`**.

## Verificación manual pendiente

- T-000 criterio 8: login A → paciente → alta → lista → logout → login B.
- T-002 punto 3: un perfil puesto en `suspendido` deja de ver `/pacientes`.
- T-006 criterios 9 y 10: guion de siete pasos del ticket (Mailpit en `http://127.0.0.1:54324`).
- T-013 criterios 1, 5, 6, 9, 10 y 11: el guion de cinco pasos del ticket, con las tres sesiones.
- T-032 criterio 17: tres sesiones (ADM, PRO1 asignado, TEC1 de otro centro) sobre un paciente con
  DNI — documento/domicilio a ADM/PRO1/técnico de ese centro, ocultos al de otro; alergias a ninguno.

## Hallazgos anotados (abiertos)

- **`alta_paciente()` no fija `centro_id`** (ADR-033, T-032): un paciente creado desde el formulario
  no aparece para el técnico de ningún centro hasta que algo se lo asigne. Ticket propuesto.
- **`territorio.mjs` lanza EISDIR** al comprobar T-032 (`readFileSync` sobre un directorio): no
  ejecuta. Verificado a mano con `git diff --name-only main...HEAD` contra `territorio:`, sin desvíos.
- **`lib/cuentas/accesos.test.ts`**: 2 imports sin usar (`SupabaseClient`, `Database`) → 2 warnings
  de `npm run lint`, preexistentes, ajenos a T-032.
- **`modalidad_relacional` bajo el candado** (choque 11) y **técnico sin `consentimientos`** pese
  al choque 12 —llega por `alertas_documentacion`, sin palabra clínica—: ambos, decisión de
  arquitectura, no arreglo de pantalla.
- T-011 · «entregado» a medias con varios profesionales → T-015. La base no impone las transiciones
  del ADR-045; `periodicidad = 'mensual'` sin definir.
- Los anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados.
