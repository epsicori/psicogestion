# Estado

> Memoria viva. Máximo 80 líneas. Solo presente. Diseño en tickets y bitácora; reglas en `.claude/rules/`.

**Actualizado**: 16-10-2026 · T-023b cerrado (`f6a2a51`) · T-046, T-027 y T-026a en `main`.

## Dónde estamos

- **Integrado en `main`**: T-000–T-043, T-048, T-049, T-050 (T-023 en 20261013120000), T-026a (20261014120000), T-027 (d366323) y T-046 (20261015120000, editor del borrador; bitácora `docs/bitacora/T-046.md`).
- **T-023b (20261016120000)**: integrado con su merge; banco RLS 33 (63 OK). Bitácora `docs/bitacora/T-023b.md`. Siguiente en `supabase/`: T-047 (20261017).

## Bloqueos

- `.env.local` `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` (propietario).
- winnat: `net stop winnat`.

## Siguiente paso

1. **T-047** (migración 20261017), a rehacer sobre `main`.
2. **T-051** (siembra de bonos en los tres estados).
3. **T-027** (bonos, en `main`): c5 y c6 pasaron en QA visible (16-10); c7 abierto (`/prototipo` no está en el árbol).
4. Limpiar worktrees y ramas viejas (`agent-*`, `t050-r1-backup`…); unlink de la junction antes de `git worktree remove`.

## Hallazgos abiertos

- **T-023b N1 (MEDIA)**, `app/(app)/facturacion/asignar-cobro.tsx:67-69`: el efecto de foco depende de `disponible` (por paciente) y del aviso viejo; con dos facturas del paciente, el foco cae en la hermana. Arreglo: que lo arme el éxito de esa instancia. Requiere ticket.
- **`paginacion-pendientes.tsx`**: la variable de módulo `destino` se comparte entre instancias. Requiere ticket.
- **Suite a11y en frío**: 1.ª pasada, timeouts de login en `acceso`, `facturacion-clave`, `nota-clinica`; 2.ª, 43/43. Contención con más de 1 worker (`acceso:138`, `avisos:29`).
- **Spec `accesibilidad/facturacion.spec.ts`**: cada pasada deja un cobro de 0,01 EUR (T-023) y una factura y un cobro de Lucía (T-023b); el paso 4 falla con más de 18 filas. Resembrar: `db reset` + `seed`.
- **`territorio:` de T-023b**: el diseño nombra `scripts/t023b-concurrencia.*`; el frontmatter no. Requiere corregir el frontmatter.
- **`scripts/psql.mjs` / `test-rls.mjs` `localizarContenedor`**: con varios stacks coge el primero; con tres levantados (T-023b) falla igual.
- **T-046 H5 (BAJA, prueba)**: `aviso-de-estado.tsx:12`, la marca `descarteEnCurso` queda encendida si el descarte falla por red; `editor-borrador.test.tsx:188` pasa solo por el orden. Sin camino en la app hoy. Arreglo: marca con `borradorId` o apagarla al confirmar. Requiere ticket.
- **Playwright `page.on('response')`**: no lee POST de Server Actions; `accesibilidad/facturacion-clave.spec.ts:76` lo usa. T-023b lo cambió en `facturacion.spec.ts`. Revisar las demás.
- **Base compartida a11y**: 5 specs fallan con la base contaminada. CA de a11y: `db reset` + `seed` y `next start`.
- **`/facturacion` a 360 px**: desborda 64 px con la base contaminada. Los hijos de `grid gap-6 lg:grid-cols-2` (`app/(app)/facturacion/page.tsx:83`, hijos :84 y :89) no llevan `min-w-0`. Requiere ticket.
- **T-027 sin control de borrador vivo**: deja poner un bono a una cita que ya está en un borrador sin descartar. T-046 no lo cierra. Requiere ticket.
- **T-027 ronda 2 (5 BAJA)**: H3 `bono-de-cita.tsx:147` foco a `body`; H7 `:40` guardas sin prueba; H8 `acciones-bono.ts:156` «quedan» sin descontar la propia; H9 `registrar-bono.tsx:40` `removeItem` sin prueba; H10 `:24` clave en `sessionStorage` sin ligar al usuario.
- **T-027 fuera de alcance**: cita realizada con bono agotado no se cobra; no hay control de «marcar realizada» (ticket de asistencia).
- **T-026a · D-B1 (BAJA, prueba)**: quitar el `return` de `supabase/migrations/20261014120000_proveedor_facturacion.sql:816` deja el banco en verde. Arreglo: en 31.C8, exigir 0 avisos de DOC-A con origen `borradores_factura_envios`. Requiere ticket.
- **QA visible (16-10)**: `QA_PASSWORD` en `.claude/settings.local.json` (ignorado por git). Bonos «Agotado» y «Caducado» hechos con SQL a mano; la semilla no los trae (T-051).
- **Contratos T-026a** (`tickets/T-026a/diseno.md`): Holded Q5 abierto (`docs/legal/preguntas-holded.md`).
- **T-023 ronda 5** (3 BAJA, `tickets/T-023/revision.md`): B-H1 `page.test.tsx:150` no fija la `key` de la isla; B-H2 `registrar-cobro.tsx:42` con la lista caída solo deja recargar, y recargar vacía el `Map`; B-H3 foco en `body` si la lista cae tras un éxito.
- **T-023 fuera de alcance** (rondas 3-4, `tickets/T-023/revision.md`): cita `realizada`→`cancelada` rebaja el devengado (falta guarda en `citas`, R2.8 de T-021); el técnico deduce el precio por diferencia de pendientes (riesgo aceptado); `cobros_alta` admite cobro a paciente fusionado; «Últimos cobros» no casa con el pendiente en tres casos; A-H2 (riesgo aceptado): tras un traspaso, el reintento no ve su cobro y puede duplicarlo.
- **`directorio_perfiles` sin prueba RLS propia**: la usan tres pantallas admin y `30-cobros` vía `profesionales_del_pendiente()`.
- **Banco `test:rls` (07-10)**: una sesión `psql` huérfana provoca `deadlock detected`; `pg_terminate_backend` y repetir.
- **B5-H1 (BAJA, T-043)**: `setAviso('')` en `formulario-alta.tsx:161` y `:181` borra «acaba de ocuparse». Arreglo: `tickets/T-043/revision-b.ronda5.md`.
- **`formulario-alta.test.tsx` (T-043)**: colas de `mockResolvedValueOnce` sin `mockReset` antes de R11; la de la línea 966 cae con vitest en paralelo.
- **Propuesta al propietario (T-043 r5)**: medir siempre sobre `git archive <hash>`, nunca en el worktree de la rama. Requiere `.claude/`.
- **T-021 seguimiento (r4)**: B4-H1, B4-H2, B4-H3, A4-H2, A4-H3. Futuro.
- **Solape de calendario 16/21 (T-049)**: coinciden un lunes en 2026-2028, en verde. Requiere ticket.
- **Colisión interna del 16 (T-049)**: C7 frente a la serie de 12:00 de `desde_8_martes`, un jueves hacia mediodía en enero-febrero. Requiere ticket.
- **`16-series.sql:702`**: comentario desfasado (nombra `current_date + 300`).
- **T-049 H1/H2 (BAJA)**: `fechas-fijas.mjs` solo caza `AAAA-MM-DD`; un directorio como argumento sale 1 con traza.
- **`territorio.mjs`**: no reconoce `territorio:` con comentario en la línea ni la lista YAML (T-043), ni lee bien sus comentarios (T-026a). Compara contra `main`, no contra la base de la rama (T-046).
- **Gate de merge**: bloquea `git merge main` con sellos antiguos; el diseño se lee con `git show main:<ruta>`.
- **Build**: Turbopack falla con `node_modules` como junction; usar `npx next build --webpack`. Si muere con `WasmHash…`, borrar `.next/cache/webpack`.
- **Reglas propuestas para `.claude/`** (decide el propietario): lecciones de T-046 en su bitácora; R4.9, T-021 R3.9 y T-026a para `supabase.md`.
- **T-048 R4-H1 (BAJA, patrón)**: promesas colgadas en `dialogo-reprogramar`, `calendario` y `zona-por-confirmar`; arreglo con `afterEach`.
- **T-028 R5-H32 (BAJA)**: `role="status"` nace relleno. **T-028 R7**: agendar sobre paciente fusionado o traspasado sin bloqueo. Requiere ticket.
- **T-042 R2-H1 (BAJA)**: predicado `update` de `bloquear_historia()` sin prueba.
- **T-039 R3-B-H1 (MEDIA)**: reprogramar fuera de ventana y dar de baja participante sin dueño. **R3-A-H1 (BAJA)**: `fn_exigir_vinculo_agenda` solo `before insert`.
- **H25 (bloquea producción)**: técnico deduce parejas por `episodio_id` en auditoría.
- **T-040 R2A-H1 (MEDIA)**: `offset`+`count=exact` con 416 bit no contado; PostgREST v16+ requiere S7.
- **Lint**: 2 avisos en `lib/cuentas/accesos.test.ts`.
- **Base compartida `test:rls`**: el verificador hace `db reset`; los revisores trabajan en `begin…rollback`.
- **T-050 C3b (latente)**: D+0 03:00 choca con 22 c2 y 16 C7N3 en ciertas horas; arreglo: baja de V39 y C3b a D−5 u D−8. Requiere ticket.
- **T-050 regla 10.4 propuesta** para `scripts/rls/README.md` (decide el propietario); simulación en `tickets/T-050/simulacion.sql`.
- Anteriores 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
