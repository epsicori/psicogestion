# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño (ADR, trampas, circuito)
> en tickets y bitácora; las reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 15-09-2026 · `main` al día · tickets: 17 hechos · 2 en curso · 14 pendientes

## Dónde estamos

- Integrado en `main`: T-000 a T-011, T-013a, T-016 a T-020 y T-029. **No queda ninguna rama de
  ticket terminada fuera de `main`.**
- La autenticación está completa de punta a punta: invitación, primer acceso (TOTP → PIN),
  candado, recuperación, ajustes de administrador, baja y sesión de 30 minutos.
- El registro de accesos a la historia (ADR-037) ya tiene camino: `registrar_acceso_historia()`
  resuelve dentro el id del desbloqueo, que no sale de Postgres. T-013 la consume, no la reescribe.
- Verificación sobre el árbol integrado (15-09): `lint` limpio, **438 pruebas en 46 ficheros**,
  `build` limpio con doce rutas más el Proxy, `test:rls` **380 aserciones**, `lint:migraciones` 12.

## En curso

- T-002 · RLS: migración, enmienda multicentro (ADR-051) y revisión integradas. Queda el punto 3
  del guion manual (un perfil suspendido deja de ver `/pacientes`), nunca ejecutado en navegador.
- T-006 · Autenticación: **código completo e integrado y los ocho criterios automáticos cerrados**
  (tabla en el ticket §Estado de entrega). Sigue en `en_curso` solo por los criterios 9 y 10, que
  son navegador. Detalle en `docs/bitacora/T-006.md`.

## Bloqueos y decisiones que no toma un agente

- **`alcance` no entra en el sobre canónico de la versión** (T-005, tercera revisión). Decisión de
  una persona y **con reloj**: es gratis mientras `notas_clinicas_versiones` esté vacía; con la
  primera firma real dentro cuesta una era de esquema para siempre.
- `T-021-economico-esquema`: diseño comiteado (`79e039f`) y una **implementación sin comitear** en
  el worktree `agent-a3e72807070793a0e`
  (`supabase/migrations/20260913120000_economico_esquema.sql`, 1413 líneas). Decidir si se retoma
  o se rehace con la fábrica: no pasó por verificación ni revisión.
- Obsoletos, pendientes de que alguien diga que se borran: la rama `verificacion-T-011a` y los
  worktrees `agent-a0c13db09cb6a7b62`, `agent-a3133689fd69000ac`, `agent-a0cf274d698e0d85b` (39
  ficheros sin comitear), `agent-ac7b6a35059cc839d` (46), `agent-a0fd267d4973735c3` (6). Mirar
  `git -C <ruta> status` antes.

## Trampas de la fábrica (instalada v3.0, no la v3.1 del repo)

- Faltan el hook `evaluador-intocable.mjs` y `podar-reglas.mjs`.
- **El `merge-gate` corre en toda llamada a Bash** (el `if:` de `settings.json` no se aplica), así
  que deniega cualquier orden de consola cuyo texto contenga `T-XXX`, no solo un merge. Se esquiva
  partiendo el id (`N=029`). Un sufijo de letra no dispara: `T-011a` pasa, `T-029-` no.
- El agente `implementador` fuerza `isolation: worktree` y **no sirve si ya hay un worktree
  preparado** (el sandbox rechaza todo): se relanza como genérico con `sonnet` y sus reglas.
- `npm run build 2>&1 | tail -n` **devuelve el estado de `tail`, no el del build**. Siempre
  `> log 2>&1; echo "exit=$?"`.
- En rutas con espacio («01 Proyectos»), toda variable de ruta va entrecomillada o `grep` recibe dos
  argumentos y falla en silencio.

## Siguiente paso

1. **T-013 · ficha de paciente**: hoy `/pacientes/[uuid]` no existe, y es quien monta el candado
   sobre una ruta real y pasa a mandar sobre `/candado`. Su prerrequisito de base ya está hecho.
2. T-021 · económico, resolviendo antes qué se hace con la implementación sin comitear.
3. Los tres guiones de navegador de §Verificación manual, de una sentada y con la pila levantada.
   Ojo: `db reset` **no relee `config.toml`** — hay que parar y levantar el contenedor.

## Verificación manual pendiente

- T-000 criterio 8: guion en navegador (login A → paciente → alta → lista → logout → login B).
- T-002 punto 3: un perfil puesto en `suspendido` deja de ver `/pacientes`.
- T-006 criterios 9 y 10: guion de siete pasos del ticket (Mailpit en `http://127.0.0.1:54324`) y
  el repaso de la matriz de roles con cada uno de los tres.

## Hallazgos anotados (abiertos)

- T-013 · el guion manual paso 3 pide **dos** filas en `accesos_historia_vistas` tras una sola
  reentrada, y una reentrada deja una. Cuadrar guion y criterio al escribir el ticket.
- T-011 · el evento «entregado» se queda a medias cuando afecta a varios profesionales →
  derivado a T-015 §Heredado de T-011a, con su negativa exigida.
- T-011 · `minimax/cortes/T-011.md` describe la firma vieja de `listarPropuestasPendientes()`:
  **hay que enmendarlo antes de despachar el corte B**.
- T-011 · la base no impone la tabla de transiciones de estado del ADR-045 (se puede volver de
  `realizada` a `programada` por SQL directo). Candidato: disparador `before update of estado`.
- T-011 · `periodicidad = 'mensual'` sigue sin definir: los siete criterios son semanales.
- Los anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados.
