# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 06-10-2026 · **T-043 hecho** (merge 31743f7, cinco rondas) · T-048 (8c4cb13) · T-049 (3f367b1).

## Dónde estamos

- **Integrado en `main`**: T-000–T-043, T-048 y T-049.
- **En curso**: T-023 **ronda 5 implementada** el 07-10 sobre la ronda 4 («ya estaba registrado» como resultado propio que cierra y olvida la clave, `RegistrarCobro` montado siempre aunque falle la lista de pacientes, prueba de que un éxito solo olvida su clave); falta verificación y revisión de la ronda 5. Los mutantes M18 en adelante son de TypeScript y del spec (`tickets/T-023/mutantes.json`, `ts_ronda_3` a `ts_ronda_5`); el banco 30 llega hasta M17. T-050 revisado (ronda 1, 6acbd3f), sin integrar.
- **Siguiente en `supabase/`**: T-023 (20261013120000) → T-026a (20261014120000) → T-046 (20261015120000) → T-023b → T-047.

## Bloqueos

- `.env.local` `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` (propietario).
- winnat: `net stop winnat`.

## Siguiente paso

1. **T-023 ronda 5: verificador y dos revisores** sobre una copia `git archive <HEAD de la rama>`. Antes, `npx supabase db reset` y `npm run seed`: el paso 4 de `accesibilidad/facturacion.spec.ts` pasa con «Últimos cobros» vacío y con hasta 18 filas, y cada ejecución deja un cobro de 0,01 EUR a Lucía Márquez con referencia `T-023 spec <ts>` (no se borra). Después, la cola: T-026a → T-046 → T-023b → T-047.
2. Limpiar worktrees: T-038, T-042, agent-*, rama a15498... (unlink junction antes de git worktree remove).

## Hallazgos anotados

- **T-023, fuera de alcance (R2.7, ronda 3 y ronda 4)**:
  - una cita que pasa de `realizada` a `cancelada` rebaja el devengado (medido: 6000 → 0; quien ya había pagado pasa a `cobrado_de_mas` 6000). Queda rastro en `auditoria` (2 filas, `auditar_citas`) y el técnico no puede hacerlo (UPDATE 0). Falta una guarda de transición en `citas` (R2.8 de T-021). Ticket aparte, de agenda;
  - el técnico puede deducir el precio de una sesión restando el pendiente antes y después de una cita realizada. Riesgo aceptado: la vista no lleva sesiones, tipo ni fechas (familia de R2-H1 de T-021);
  - la base admite un cobro a un paciente fusionado (`cobros_alta`, `fn_validar_cobro`); la acción lo rechaza. Ticket aparte, con su banco;
  - «Últimos cobros» recorta por el paciente del registro y el pendiente consolida en el superviviente, así que no casan en tres casos: con el filtro de profesional del administrador; el técnico del centro del superviviente ve sumado el cobro hecho al absorbido de otro centro y no lo ve en la lista (`cobros_lectura`); el profesional del absorbido ve sus cobros en la lista y no tiene fila en el pendiente. No cambia ninguna cifra. Ticket aparte;
  - **A-H2 de la ronda 4, riesgo aceptado**: si entre un envío con resultado desconocido y su reintento el usuario deja de ver al paciente (traspaso de `profesional_id`, cambio de centro del paciente o de los `centros_actuales` del técnico), el paso 2b no encuentra su propio cobro (`cobros_lectura` no tiene rama por `registrado_por`) y el reintento contesta «No se ha podido registrar el cobro» aunque el cobro exista; si otro lo registra de nuevo, queda duplicado y no se puede borrar. No se amplía `cobros_lectura` (daría datos económicos a quien ya no atiende al paciente). Exige un corte de red y un traspaso dentro de la vida de la página.
- **`directorio_perfiles` sin prueba RLS**: ningún módulo de `scripts/rls/` la prueba como vista; la usan tres pantallas admin (centros, dar de baja, TOTP) desde T-041/T-045. `30-cobros` la ejerce a través de `profesionales_del_pendiente()` (ADM, PRO1, rol nulo); sigue sin módulo propio.
- **Banco `test:rls` (07-10)**: una sesión `psql` huérfana (`create temp table t6_codigos_pro2…`) provocó `deadlock detected` en reejecuciones seguidas; `pg_terminate_backend` y repetir. Pasa limpio con la base sin huérfanas.
- **B5-H1 (BAJA, T-043)**: el `setAviso('')` de las dos ramas de fallo del recálculo, en `formulario-alta.tsx:161` y `:181`, borra también el mensaje «acaba de ocuparse» de `hueco_ocupado`. Arreglo: vaciar solo si el aviso es el texto de la vuelta, más prueba negativa en las dos ramas. Detalle en `tickets/T-043/revision-b.ronda5.md`.
- **Pruebas de `formulario-alta.test.tsx` (T-043)**: las anteriores a R11 encadenan `mockResolvedValueOnce` sin `mockReset`; si una falla, sus colas pasan a las siguientes. R11-R16 usan `respuestasDeRecalculo()`.
- **T-043 (BAJA)**: con varias ejecuciones de vitest en paralelo, la prueba de `formulario-alta.test.tsx:966` cayó una vez por el plazo de 1 s de `waitFor`.
- **Contratos de T-026a** (`tickets/T-026a/diseno.md`): la clave `identificacion_cifrado_v1` es contrato con T-046; Holded Q5 sigue abierto (`docs/legal/preguntas-holded.md`); `test:facturacion` no está en la tabla de comandos de `CLAUDE.md`; A4-H1 (T-021) pasa a T-046.
- **Propuesta al propietario (T-043, ronda 5)**: verificador y revisores miden siempre sobre una copia (`git archive <hash>` en su scratchpad) y nunca mutan el worktree de la rama; el revisor vio un mutante ajeno en `git status`. Requiere instrucción del orquestador (`.claude/`).
- **T-021 A4-H1 (BAJA)**: si la parte general mueve Q < 0,5 céntimos, ninguna cuota sella (6.4 rechaza cuota 0; banda admite solo 0). T-026 debe acotar esto en Zod.
- **T-021 · seguimiento (ronda 4)**: B4-H1 (constante 1 de `least(1,…)` sin fijar: 0.6 y 1.3 sobreviven), B4-H2 (rama |Q_i| < 1 sin prueba positiva), B4-H3 (techo tipo IVA lejos del borde), A4-H2 (U+1D159 fuera clase invisibles), A4-H3 (tramo extra sin aserción de catálogo) — anotados, T-026 o futuro.
- **Solape de calendario 16/21 (T-049)**: 16 (hasta ~febrero de Y+4) y 21 (mayo de Y+3 a abril de Y+4) comparten calendario; coinciden un lunes (`lunes_21 + 259`) en 2026-2028, en verde, y dejan de coincidir en 2029-2031. Requiere ticket.
- **Colisión interna del 16 (T-049)**: C7 (D+40..D+68 a la hora de `now()`) frente a la serie de 12:00 de `desde_8_martes`, solo si el banco corre un jueves hacia mediodía en enero-febrero. Requiere ticket.
- **Comentario desfasado `16-series.sql:702` (T-049)**: nombra el `current_date + 300` del 17, que ahora ancla en Y+7.
- **T-049 H1/H2 (BAJA)**: `fechas-fijas.mjs` solo caza `AAAA-MM-DD` (no `'2027-1-5'`, `'20270105'` ni `make_date`); un directorio como argumento sale 1 con traza en vez de 2.
- **`localizarContenedor` (`scripts/psql.mjs`)**: toma el primer `supabase_db_*` de `docker ps`; con `supabase_db_cinfa-e2e` levantado puede elegir el contenedor equivocado. Comprobar `Contenedor:` en la salida.
- **`~/.claude/pipeline/territorio.mjs`**: no reconoce `territorio:` con comentario en la misma línea ni la lista YAML de T-043; muestra verde o «sin territorio». Usuario. Ejecutarlo dentro del worktree del ticket: desde `main` da falsos positivos.
- **Gate de merge**: bloquea `git merge main` dentro de la rama de un ticket con sellos antiguos; el implementador lee el diseño con `git show main:<ruta>`.
- **Build**: Turbopack falla con `node_modules` como junction en un worktree; usar `npx next build --webpack`.
- **R4.9 propuesta de regla para `.claude/rules/supabase.md`**: lista de caracteres como enteros hexadecimales y `chr()`, nunca escapes barra invertida; y otra de T-021 R3.9: dos disparadores de cotas se ordenan por nombre y cada mensaje de error lleva un fragmento sin prefijo común (decisión usuario/arquitecto).
- **T-048 R4-H1 (BAJA, patrón)**: `dialogo-reprogramar`, `calendario` y `zona-por-confirmar` sueltan sus promesas colgadas solo en la última línea de cada prueba; si un mutante la hace caer antes, la siguiente agota el tiempo. Arreglo: `afterEach` de módulo como en T-048.
- **T-048 (BAJA)**: `rg "latido|animate-"` devuelve 3 coincidencias inocuas (aserciones negativas y un comentario).
- **T-028 R5-H32 (BAJA)**: `role="status"` en sugerencias nace relleno cuando cambia el tipo. Arreglo: región montada siempre.
- **Paciente fusionado o traspasado (T-028 R7)**: ni `agenda_crear_cita`/`agenda_crear_serie` ni disparadores impiden agendar fusionado/traspasado. Requiere ticket.
- **T-042 R2-H1 (BAJA)**: predicado `update` `bloquear_historia()` sin prueba ni mutante; cada «Bloquear» escribe en `auditoria`.
- **T-039 R3-B-H1 (MEDIA)**: reprogramar fuera ventana episodio y dar de baja participante sin dueño; T-034 cubre solo cierre.
- **T-039 R3-A-H1 (BAJA)**: `fn_exigir_vinculo_agenda` solo `before insert`; profesional pasa cita suelta a paciente ajeno.
- **H25 (bloquea producción)**: técnico deduce parejas por `episodio_id` en auditoría.
- **T-040 R2A-H1 (MEDIA)**: `offset`+`count=exact` con 416 bit en cuerpo no contado. PostgREST v16+ requiere S7.
- **Lint**: 2 avisos en `lib/cuentas/accesos.test.ts` (`SupabaseClient`, `Database` sin usar).
- **Base compartida `test:rls`**: verificador hace `db reset` (con permiso del propietario); revisores trabajan en `begin…rollback` esperando `max(version)`.
- Anteriores 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
