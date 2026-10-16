# Estado

> Memoria viva. Máximo 80 líneas. Solo presente. Diseño en tickets y bitácora; reglas en `.claude/rules/`.

**Actualizado**: 16-10-2026 · T-047 cerrado en su rama (pendiente de merge) · T-023b (`f6a2a51`) · T-046, T-027 y T-026a en `main`.

## Dónde estamos

- **Integrado en `main`**: T-000–T-043, T-048, T-049, T-050 (T-023 en 20261013120000), T-026a (20261014120000), T-027 (d366323) y T-046 (20261015120000; bitácora `docs/bitacora/T-046.md`).
- **T-023b (20261016120000)**: integrado con su merge; banco RLS 33 (63 OK). Bitácora `docs/bitacora/T-023b.md`.
- **T-047 (20261017120000)**: cerrado en la rama `T-047-agenda-anual` (HEAD `fbdbe22`); entra en `main` con su merge. Bitácora `docs/bitacora/T-047.md`.

## Bloqueos

- `.env.local` `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` (propietario).
- winnat: `net stop winnat`.

## Siguiente paso

1. **Merge de T-047** (`T-047-agenda-anual`, migración 20261017120000) en `main`.
2. **T-051, T-052 y T-053**, con el diseño aprobado el 16-10.
3. **T-027** (bonos, en `main`): c5 y c6 pasaron en QA visible (16-10); c7 abierto. Comprobar si `/prototipo` está en `main`: en el worktree de T-047 sí existe.
4. Limpiar worktrees y ramas viejas (`agent-*`, `t050-r1-backup`…); unlink de la junction antes de `git worktree remove`.

## Hallazgos abiertos

- **R2-C-H1 (BAJA, T-047, prueba)**: `scripts/rls/34-agenda-anual.sql:13-15`. La cabecera no nombra PRO34S y dice que TEC1 es profesional solo de `C34TEC`; también lo es de `C34TECB`. Arreglo: corregir la cabecera.
- **Banco 34 (`test:rls`)**: tarda unos 4 minutos (4 min 21 s en ronda 2) por el insert sintético de 10 600 citas.
- **T-023b N1 (MEDIA)**, `app/(app)/facturacion/asignar-cobro.tsx:67-69`: el foco cae en la hermana con dos facturas del paciente. Requiere ticket.
- **`paginacion-pendientes.tsx`**: la variable de módulo `destino` se comparte entre instancias. Requiere ticket.
- **Suite a11y en frío**: timeouts de login en la 1.ª pasada; más de 1 worker contiende (`acceso:138`, `avisos:29`).
- **Spec `accesibilidad/facturacion.spec.ts`**: cada pasada deja cobros; resembrar con `db reset` + `seed`.
- **`territorio:` de T-023b**: el diseño nombra `scripts/t023b-concurrencia.*`; el frontmatter no. Requiere corregir el frontmatter.
- **`scripts/psql.mjs` / `test-rls.mjs` `localizarContenedor`**: con varios stacks coge el primero; con tres levantados (T-023b) falla igual.
- **T-046 H5 (BAJA, prueba)**: `aviso-de-estado.tsx:12`, la marca `descarteEnCurso` queda encendida si el descarte falla por red. Requiere ticket.
- **Playwright `page.on('response')`**: no lee POST de Server Actions; lo usa `facturacion-clave.spec.ts:76`.
- **Base compartida a11y**: 5 specs fallan con la base contaminada. CA de a11y: `db reset` + `seed` y `next start`.
- **`/facturacion` a 360 px**: desborda 64 px con la base contaminada (`app/(app)/facturacion/page.tsx:83-89` sin `min-w-0`). Requiere ticket.
- **T-027 sin control de borrador vivo**: deja poner un bono a una cita que ya está en un borrador sin descartar. Requiere ticket.
- **T-027 ronda 2 (5 BAJA)**: `bono-de-cita.tsx:147` y `:40`; `acciones-bono.ts:156`; `registrar-bono.tsx:40`; `:24`.
- **T-027 fuera de alcance**: cita realizada con bono agotado no se cobra; no hay control de «marcar realizada».
- **T-026a · D-B1 (BAJA, prueba)**: quitar el `return` de `supabase/migrations/20261014120000_proveedor_facturacion.sql:816` deja el banco en verde. Requiere ticket.
- **QA visible (16-10)**: `QA_PASSWORD` en `.claude/settings.local.json` (ignorado por git). Bonos «Agotado» y «Caducado» hechos con SQL a mano (T-051).
- **Contratos T-026a** (`tickets/T-026a/diseno.md`): Holded Q5 abierto (`docs/legal/preguntas-holded.md`).
- **T-023 ronda 5** (3 BAJA, `tickets/T-023/revision.md`): B-H1 `page.test.tsx:150`; B-H2 `registrar-cobro.tsx:42`; B-H3 foco en `body`.
- **T-023 fuera de alcance** (`tickets/T-023/revision.md`): `realizada`→`cancelada` rebaja el devengado (R2.8 de T-021); A-H2 (riesgo aceptado): reintento tras traspaso puede duplicar cobro.
- **`directorio_perfiles` sin prueba RLS propia**: la usan tres pantallas admin y `30-cobros`.
- **Banco `test:rls` (07-10)**: una sesión `psql` huérfana provoca `deadlock detected`; `pg_terminate_backend` y repetir.
- **B5-H1 (BAJA, T-043)**: `setAviso('')` en `formulario-alta.tsx:161` y `:181`. Arreglo: `tickets/T-043/revision-b.ronda5.md`.
- **`formulario-alta.test.tsx` (T-043)**: colas de `mockResolvedValueOnce` sin `mockReset`; la de la línea 966 cae con vitest en paralelo.
- **Propuesta al propietario (T-043 r5)**: medir siempre sobre `git archive <hash>`, no en el worktree. Requiere `.claude/`.
- **T-021 seguimiento (r4)**: B4-H1, B4-H2, B4-H3, A4-H2, A4-H3. Futuro.
- **Solape de calendario 16/21 (T-049)**: coinciden un lunes en 2026-2028, en verde. Requiere ticket.
- **Colisión interna del 16 (T-049)**: C7 frente a la serie de 12:00 de `desde_8_martes`. Requiere ticket.
- **`16-series.sql:702`**: comentario desfasado (nombra `current_date + 300`).
- **T-049 H1/H2 (BAJA)**: `fechas-fijas.mjs` solo caza `AAAA-MM-DD`; un directorio como argumento sale 1 con traza.
- **`territorio.mjs`**: no reconoce `territorio:` con comentario ni lista YAML (T-043); compara contra `main` (T-046).
- **Gate de merge**: bloquea `git merge main` con sellos antiguos; el diseño se lee con `git show main:<ruta>`.
- **Build**: Turbopack falla con `node_modules` como junction; usar `npx next build --webpack`. Si muere con `WasmHash…`, borrar `.next/cache/webpack`.
- **Reglas propuestas para `.claude/`** (decide el propietario): lecciones de T-046; R4.9, T-021 R3.9 y T-026a para `supabase.md`.
- **T-048 R4-H1 (BAJA, patrón)**: promesas colgadas en `dialogo-reprogramar`, `calendario` y `zona-por-confirmar`; arreglo con `afterEach`.
- **T-028 R5-H32 (BAJA)**: `role="status"` nace relleno. **T-028 R7**: agendar sobre paciente fusionado o traspasado sin bloqueo. Requiere ticket.
- **T-042 R2-H1 (BAJA)**: predicado `update` de `bloquear_historia()` sin prueba.
- **T-039 R3-B-H1 (MEDIA)**: reprogramar fuera de ventana y dar de baja participante sin dueño. **R3-A-H1 (BAJA)**: `fn_exigir_vinculo_agenda` solo `before insert`.
- **H25 (bloquea producción)**: técnico deduce parejas por `episodio_id` en auditoría.
- **T-040 R2A-H1 (MEDIA)**: `offset`+`count=exact` con 416 bit no contado; PostgREST v16+ requiere S7.
- **Lint**: 2 avisos en `lib/cuentas/accesos.test.ts`.
- **Base compartida `test:rls`**: el verificador hace `db reset`; los revisores trabajan en `begin…rollback`.
- **T-050 C3b (latente)**: D+0 03:00 choca con 22 c2 y 16 C7N3; arreglo: baja de V39 y C3b a D−5 u D−8. Requiere ticket.
- **T-050 regla 10.4 propuesta** para `scripts/rls/README.md` (decide el propietario); simulación en `tickets/T-050/simulacion.sql`.
- Anteriores 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
