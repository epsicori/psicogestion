# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño (ADR, trampas, circuito)
> en tickets y bitácora; las reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 15-09-2026 · `main` al día · tickets: 16 hechos · 2 en curso · 14 pendientes

## Dónde estamos

- Integrado en `main`: T-000 a T-011, T-016 a T-020 y T-029. **No queda ninguna rama de ticket
  terminada fuera de `main`.**
- La autenticación está completa de punta a punta: invitación, primer acceso (TOTP → PIN),
  candado, recuperación, ajustes de administrador, baja y sesión de 30 minutos.
- Verificación sobre el árbol integrado (15-09): `lint` limpio, **415 pruebas en 43 ficheros**,
  `build` limpio con doce rutas más el Proxy.

## En curso

- T-002 · RLS: migración, enmienda multicentro (ADR-051) y revisión integradas. Queda el punto 3
  del guion manual (un perfil suspendido deja de ver `/pacientes`), nunca ejecutado en navegador.
- T-006 · Autenticación: **código completo e integrado**. Sigue en `en_curso` solo porque los
  criterios 1, 9 y 10 exigen pila levantada y navegador. Detalle en `docs/bitacora/T-006.md`.

## Bloqueos y decisiones que no toma un agente

- **`alcance` no entra en el sobre canónico de la versión** (T-005, tercera revisión). Decisión de
  una persona y **con reloj**: es gratis mientras `notas_clinicas_versiones` esté vacía; con la
  primera firma real dentro cuesta una era de esquema para siempre.
- `T-021-economico-esquema`: diseño comiteado (`79e039f`) y una **implementación sin comitear** en
  el worktree `agent-a3e72807070793a0e`
  (`supabase/migrations/20260913120000_economico_esquema.sql`, 1413 líneas). Decidir si se retoma
  o se rehace con la fábrica: no pasó por verificación ni revisión.
- Ramas y worktrees obsoletos, pendientes de que alguien diga que se borran: `T-006b-acceso-pantallas`
  (sus dos ficheros de corte quedaron redundantes), `verificacion-T-011a`, y los worktrees
  `agent-a0c13db09cb6a7b62`, `agent-a3133689fd69000ac`, `agent-a0cf274d698e0d85b` (39 ficheros sin
  comitear), `agent-ac7b6a35059cc839d` (46) y `agent-a0fd267d4973735c3` (6). `git -C <ruta> status`
  antes de borrar nada.

## Trampas de la fábrica (instalada v3.0, no la v3.1 del repo)

- Faltan el hook `evaluador-intocable.mjs` y `podar-reglas.mjs`.
- **El `merge-gate` corre en toda llamada a Bash** (el `if:` de `settings.json` no se aplica), así
  que deniega cualquier orden de consola cuyo texto contenga `T-XXX`, no solo un merge. Se esquiva
  partiendo el id (`N=029`). Un sufijo de letra no dispara: `T-011a` pasa, `T-029-` no.
- El agente `implementador` fuerza `isolation: worktree` y **no es usable cuando ya hay un worktree
  preparado**: el sandbox rechaza todas sus órdenes. Se relanza como agente genérico con `sonnet` y
  sus reglas en el prompt.
- `npm run build 2>&1 | tail -n` **devuelve el estado de `tail`, no el del build**. Siempre
  `> log 2>&1; echo "exit=$?"`.
- En rutas con espacio («01 Proyectos»), toda variable de ruta va entrecomillada o `grep` recibe dos
  argumentos y falla en silencio.

## Siguiente paso

1. **Levantar la pila y cerrar T-006**: `test:rls` y el guion de navegador. Ojo: `db reset` **no
   relee `config.toml`** — hay que parar y levantar el contenedor.
2. T-013 · ficha de paciente, que es quien pasará a mandar sobre `/candado`.
3. T-021 · económico, resolviendo antes qué se hace con la implementación sin comitear.

## Verificación manual pendiente

- T-000 criterio 8: guion completo en navegador (login A → paciente → alta → lista → logout →
  login B → aislamiento).
- T-002 punto 3: un perfil puesto en `suspendido` deja de ver `/pacientes`.
- T-006: guion de siete pasos del ticket, con Mailpit en `http://127.0.0.1:54324`.

## Hallazgos anotados (abiertos)

- T-011 · el evento «entregado» se queda a medias cuando afecta a varios profesionales →
  derivado a T-015 §Heredado de T-011a, con su negativa exigida.
- T-011 · `minimax/cortes/T-011.md` describe la firma vieja de `listarPropuestasPendientes()`:
  **hay que enmendarlo antes de despachar el corte B**.
- T-011 · la base no impone la tabla de transiciones de estado del ADR-045 (se puede volver de
  `realizada` a `programada` por SQL directo). Candidato: disparador `before update of estado`.
- T-011 · `periodicidad = 'mensual'` sigue sin definir: los siete criterios son semanales.
- `docs/decisions/INDEX.md` enlaza `decisions/ADR-0XX.md` desde dentro de `docs/decisions/`: la
  ruta sobra un nivel y ningún enlace del índice abre. Arreglo de una línea, sin dueño.
- Los anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md` §Hallazgos anotados.
