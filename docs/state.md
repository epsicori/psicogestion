# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 05-10-2026 · **T-041 hecho** (merge 80b6a06: altas de centro); **T-044, T-045** en verificación.

## Dónde estamos

- **Integrado en `main`**: T-000–T-015, T-011b, T-012 (A/B/C), T-012b/c, T-028 (A/B/C), T-016–T-020, T-029–T-042.
- **En verificación**: T-044, T-045 (riesgo bajo).
- **Siguiente en `supabase/`**: T-021 (migración 20261011120000, riesgo alto, diseño hecho con respuestas del propietario), luego T-043 (migración 20261012120000, idem, va tras T-021).

## Bloqueos

- `.env.local` `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` (propietario, 04-10).
- winnat: `net stop winnat`.

## Siguiente paso

1. T-044, T-045 en verificación y merge.
2. Ya se puede `npx supabase db reset` desde main (20261010120000 está en main).
3. T-021 en implementación (riesgo alto, Opus).
4. Limpiar worktrees: T-038, T-042, agent-a9325d705ce4db36b, a2b0012224d53ce71, a32189ff51a6d9558, aa3cf8ef16a243549, aae08223ceefe21b6, ada3a424c2ef63d80 y ae6f460142344cc25 (T-041), rama a1549876942c02f5f (unlink junction node_modules antes de git worktree remove).

## Hallazgos anotados

- **T-028 R5-H32 (BAJA)**: `role="status"` en sugerencias nace relleno cuando cambia el tipo. Arreglo: región montada siempre.
- **T-028 R5-H33 (BAJA)**: Error lectura `tipos_terapia`/`directorio_perfiles` en `contenido-alta.tsx:52-53` cae a `[]` y se pinta falso «No hay…». Arreglo: propagar error.
- **T-028 R6-H35 (BAJA)**: la prueba de H34 (`vista-alta.test.ts:64`) deja vivos tres mutantes de `finDeOcupado` (máximo en vez de mínimo, último tramo de la entrada, sin la cota `< fin`). Arreglo: un segundo libre tras el de 09:40 y un día con ocupado al final de la mañana y libre por la tarde. **Nota R6**: `agenda_bloques_profesional` sigue emitiendo el ocupado con la duración pedida; el recorte es solo de pantalla y otro consumidor vería el solape.
- **Paciente fusionado o traspasado (T-028 R7, sin medir)**: ni `agenda_crear_cita`/`agenda_crear_serie` ni los disparadores de `citas` impiden agendar a un paciente con `fusionado_en` o `traspasado_en`; el buscador del alta ya dejaba llegar. Requiere ticket `supabase/`.
- **`directorio_perfiles` sin prueba de RLS (T-045)**: ningún módulo de `scripts/rls/` nombra la vista, y desde T-041 y T-045 la usan tres pantallas de administrador (centros, dar de baja, reponer TOTP). Falta un módulo de quién ve qué. T-045 (dar de baja y reponer TOTP leen la vista) pendiente de verificación y merge.
- **`/recuperar` sin enlace (T-042, prueba manual)**: ninguna pantalla enlaza a `/recuperar`, tampoco «Verificación en dos pasos» de `/primera-vez`, donde se queda quien perdió el móvil; solo se llega tecleando la URL. `docs/interfaz.md` no la menciona. Propuesta: enlace «¿Has perdido el acceso a tu app? Usa un código de recuperación».
- **T-042 R2-H1 (BAJA)**: el predicado del `update` de `bloquear_historia()` (migración `20261009120000:442`) no tiene prueba ni mutante; sin él cada «Bloquear» escribe una fila `UPDATE` en `auditoria` y `test:rls` sigue verde. Arreglo: aserción en CA-R2.2 de que bloquear con `0/0/false` no cambia el recuento.
- **T-038 A3-H1=B3-H2 (BAJA)**: `lib/cuentas/totp.ts:57` marca `reentrar` ante cualquier 42501; `generar_codigos_recuperacion()` lo lanza por cuatro causas (Q3(B) incluida) y la vista afirma «hace más de cinco minutos». La salida sí resuelve.
- **T-038 R4-H1 (BAJA)**: `app/(app)/cuenta/formulario-regenerar.test.tsx:160-161` niega dos frases concretas, no cualquier condición sobre el aviso; «… salvo que en tus avisos ya salga…» pasa. Arreglo: negar la etiqueta del aviso.
- **T-038 y T-042 lecciones**: reglas por ruta propuestas para `.claude/rules/supabase.md` (orden de guardas en RPC definer, fallo sin lanzar, `p_contrasena` fuera de raise/format, `crypt`+NULL en `coalesce`), una comprobación para `guard.json` y el ADR del patrón de dos pasos, en `docs/bitacora/T-038.md` y `T-042.md`; decide usuario/arquitecto.
- **T-042 notas**: `canjearCodigo` sin Zod en servidor; `scripts/t002-rls.sql` y `t004-auditoria.sql` llaman a la firma de un paso, que ya no existe (ningún `npm run` los usa).
- **T-038 nota de despliegue (Q1)**: los ajustes de registro de Postgres que exige `registro_postgres_seguro()` viven solo en `docs/bitacora/T-038.md`; no hay manual de despliegue.
- **`app/page.tsx` en `next dev`**: el `redirect('/agenda')` hace saltar «Route "/": Could not validate `instant`» (Cache Components) en cada visita a `/`; sale en el indicador de errores de desarrollo. Funciona, pero ensucia el registro.
- **`verificar` en `app/primera-vez/segundo-factor.tsx:117` (T-037)**: transición asíncrona sin `try/catch` y sin `error.tsx` en `app/`; un fallo sustituye la página entera (mismo patrón que T-038 B2-H1).
- **Playwright con 6 workers**: `acceso.spec:138` y `avisos.spec:29` fallan porque entran a la vez con el mismo usuario sembrado («el TOTP sembrado no se aceptó»); en serie pasan.
- **`test:a11y`**: sin `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` cinco specs ajenas caen en `/primera-vez` y fallan sin decir por qué. El script debería fijarla.
- **R2-H4 (T-037)**: `scripts/seed.mjs:29` y `scripts/test-huellas.mjs:19` toman el primer `supabase_db_*`.
- **Base compartida**: el verificador hace `db reset` mientras los revisores miden; los revisores trabajan en `begin … rollback` y esperan a `max(version)`.
- **T-039 R3-B-H1 (MEDIA)**: architecture.md, residuo (3). Reprogramar fuera de la ventana del episodio y dar de baja a un participante no tienen dueño; T-034 SQL-H2 cubre solo el cierre posterior.
- **T-039 R3-B-H2 (BAJA)**: H25 dice «de una cita», pero el técnico lee `episodio_id` también en la auditoría de `series_cita`.
- **T-039 R3-B-H3 (BAJA)**: `scripts/rls/README.md:49` dice «(V, S)»; faltan C, W, N, T.
- **T-039 R3-A-H1 (BAJA)**: `fn_exigir_vinculo_agenda` solo `before insert`; un profesional pasa su cita suelta a un paciente ajeno (ADR-055). Arreglo: también `before update of paciente_id`.
- **H25**: técnico deduce parejas por `episodio_id` en auditoría. **Bloquea producción**.
- **Verificador T-028**: tras Cambiar, buscador conserva texto; centro por defecto sin franjas. Comentario `rejilla-semana.tsx:232` desactualizado.
- **T-040 R2A-H1 (MEDIA, anotada por el propietario 05-10)**: `scripts/t040-oraculo.mjs` no prueba `offset`+`Prefer: count=exact`; ese 416 («only 1/0 rows») lleva un bit del cuerpo y `conContenido` no lo cuenta. Con PostgREST v16.1 (local) confirma y deja rastro; al subir PostgREST, añadir la forma S7 con su gemela.
- **T-040 A-H3 (BAJA, por diseño)**: el administrador coterapeuta no tiene camino para la copia por motivo (`notas_para_copia` no lo lista; la vista conjunta no descarga); en la vista abierta, «Descargar copia» ante «bloqueada» no ofrece el PIN. **R3-H1 (BAJA)**: opacidad/color de marca sin prueba.
- **Sello de T-033**: el hook reselló su `revision.sha` sin que parara su revisor (integrado hace semanas); sin commitear, lo decide el usuario.
- **T-034 SQL-H2**: reabrir esquiva D6, reloj. Única salida nota de cita con episodio cerrado (23.Z). No cerrar con citas posteriores.
- **16-series y 23-cita-en-episodio**: `npm run test:rls` falla en ambas (citas_sin_solape_profesional, 23P01). Idéntico en main; hipótesis: fechas fijas sembrado vs fecha actual. Requiere ticket.
- **`playwright.config.ts`**: no pasa `SEGUNDO_FACTOR_AUTOMATICO_LOCAL` al servidor ni serializa specs que comparten cuenta; la batería falla en bloque fuera de un `.env.local` preparado.
- **T-035 B-H1 → T-041**: cierre: la nota con coprofesional y alta posterior sigue vigente porque 7c no se reevalúa al firmar.
- **T-041 R3/R6**: funciones cuentas.
- **T-041 R2 (6 BAJA)**: B2-H1/H2 en acciones.ts (ramas registroConAltasPendientes/avisoPendiente sin prueba); B2-H3 en gestion-altas (catch no revalida); B2-H4=A2-H1 en invitar.ts (error lectura confunde con cierre); B2-H5 en formulario-invitar (transición sin try/catch); A2-H2 en README banco 28 (mutantes nuevos no documentados). Más: t002 líneas 148/190/217 sin `hasta is null`; ResultadoCuentas no puede `ok:true`; tsc app/layout.tsx(45,50); territorio.mjs no ve sufijos; DELETE en perfiles_centros sin disparador; ventana ms entre centros.activo e inviteUserByEmail; directorio_perfiles sin prueba RLS.
- **T-025/T-026 (ADR-078)**: borradores en `docs/legal/` (consulta vinculante DGT con la lista del ADR-077 p.7; preguntas a Holded). Los envía el propietario tras revisión de asesor, antes de comercializar. Contratos sin tocar: los ajusta el arquitecto (vocabulario, 14.6, clave mínima).
- **T-021 A.9/P3.8**: T-026 espejo/inmutable; `facturas` linter; architecture desfasado; saldo/paciente; bono espejo; ADR-053 dos «cobrado»; outbox; interfaz previa.
- **T-015 R3-H1** (BAJA): `fotoDeLayout` época pierde ante foto fresca vieja; franja revive.
- **T-015 (anotados del diseño)**: realizada antes de fin no abre alerta; firmar no revalida layout.
- **T-015 retardo R2.3**: acciones agenda revalidan solo `/agenda`; cabecera vieja hasta navegar.
- **T-014**: bandeja sin límite, ?centro, estado, 44px, 360px, ?semana, CRLF.
- **T-012**: fallos recarga, cargarPaciente→404, PostgREST directo, coprofesional.
- **T-028a**: marcada_realizada/por vacío; C18TEC; banco 21 año+3; deadlock DB14.
- **T-033**: next start, URL inline, Suspense. **T-011c**: ordinal. **T-036**: UUID.
- **Foco**: body, aria-describedby, useDevolucionDeFoco. **Alertar sin firmar**: cita_id.
- **Fuera CI**: SQL crean sin episodio. **CI**: sin `NEXT_PUBLIC_*`, `SEGUNDO_FACTOR_LOCAL`. **Scratchpad**: mutar.mjs paralelo.
- **Armazón**: login→/pacientes (T-031/T-032). **`@axe-core/playwright`**: no instalado.
- **`perfiles` sin `apellidos`** (solo nombre_completo). **<44px**: menú, sesión (T-028 B).
- **ADR INDEX**: faltan 060..075. **interfaz.md:67**: lista y alta. **Worktrees**: T-014, T-021.
- Anteriores 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
