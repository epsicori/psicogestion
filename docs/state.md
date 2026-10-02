# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 02-10-2026 · T-028a integrado; T-012 corte C en verificación; T-040 corte A en revisión ronda 2

## Dónde estamos

- **Integrado en `main`**: T-000–T-014, T-011b, T-012b, T-012c, T-012 cortes A y B, T-028 corte A, T-028a,
  T-016–T-020, T-029–T-037. Autenticación, ficha cifrada, series, dinero, toda nota en episodio, calendario,
  nota clínica con editor, centro congelado, coprofesional, base del alta de cita (bloques, previsualizar, cita suelta).
- `main` (02-10, 99b3068): `npm test` 1525/1525.

## En curso

- **T-012 corte C** (`T-012-corte-c`, 47aa00d): revisión cerrada (ronda 2, 0/0/3, sellada). Verificador en marcha
  (usa la base). Criterio 9 con NVDA: manual del propietario.
- **T-040 corte A** (`worktree-agent-a57d63ed182caa785`, b483b47; sin base): evidencia sellada (2a6daaf), ronda 1
  0/4/9 corregida; revisión ronda 2 en marcha. Corte B (migración `20261009`, banco 24, `servidor.ts`, interfaz) en
  su turno de la cola. Al corte B: `exportada_por = {nombre_completo, rol}`; la contraseña se cuenta en puntos de
  código (`[...s.normalize('NFC')].length`) también en la interfaz; Edge y Firefox en C7.
- **T-015** (avisos y escalado): diseño cerrado (P1, P4 del propietario). Siguiente en la cola de `supabase/`.
- **T-039**: diseño cerrado. Precondición: T-028a integrado (hecho) y su §0 re-comprobado.
- **T-028** cortes B y C, ya desbloqueados. Al corte B: E15.3 (`order desc limit 6` y su prueba), `hoy` inválido →
  `agenda.alta.sugerencias.error`; H8 y H9; previsualizar no recibe `p_excluir` ni `p_fin_el` (decidir); cero
  sesiones es 22023 en crear y previsualizar; Zod que exija al menos una sesión.
- **T-041** (altas de centro): contrato escrito, falta diseño. **Tickets por escribir**: auditoría alineada con la
  matriz (H25); Ajustes › Tipos de terapia; CI; ADR de telepsicología; foco del formulario del candado.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK auditoría impide borrar).
- Windows winnat a veces reserva 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. Verificador de T-012 C → integrar y cerrar T-012. Revisión ronda 2 de T-040 A → integrar el corte A.
2. `supabase/` en orden, nunca dos a la vez: T-015 → T-039 → T-038 → T-040 B → T-041 (si migra) → T-028 B.
3. Al implementador de T-038: reutilizar las etiquetas `notificaciones.tipos.*`.

## Hallazgos anotados (abiertos)

- **T-035 B-H1** → T-041. **H1**: un `suspendido` se rechaza con «de baja» y sin prueba. **H2**: `architecture.md:390`
  y el director administrativo (depende de ADR-065).
- **Foco del candado**: `formulario-candado.tsx`, PIN malo con clic deja el foco en `body`; `role="status"` sin
  `aria-describedby`; `useDevolucionDeFoco` no devuelve el foco a un disparador deshabilitado.
- **T-012**: B1-H8 `cargarPaciente` → 404; `select` directo por PostgREST sobre `borrador_contenido`; ruta del
  coprofesional (lee por episodio conjunto pero la página exige ver al paciente).
- **T-028a**: nada en la app rellena `marcada_realizada_en/_por` (solo la siembra). C18TEC: el técnico lee la cita
  donde es `profesional_id`. Bancos 16+ dejan citas hasta mayo de año + 2; el 21 ancla en año + 3. Deadlock
  intermitente en el banco 14 (`:1009`, `disable trigger`) visto solo al medir mutantes con `create or replace`.
- **`perfiles` no tiene `apellidos`** (solo `nombre_completo`): cualquier diseño que lo dé por hecho, mal.
- **`docs/decisions/INDEX.md`** no tiene ADR-060..075 (sí `decisions.md`). **T-040** sin `territorio:` en el
  contrato: manda el §6 del diseño.
- **Scratchpad compartido**: `scratchpad/mutar.mjs` lo pisan agentes en paralelo; cada uno, su subcarpeta.
- **T-041** R3, R6 y `<>` en las funciones de cuentas (de la revisión del contrato). R2-H1 de T-028a: puerta documentada.
- **T-034 SQL-H2** (MEDIA): reabrir episodio esquiva D6 y mueve el reloj. `episodio_para_nota` no mira el centro.
- **T-033** (BAJA): `next start` con config mala → 500; URL inlineada en build; franja en `<Suspense>`.
- **T-011c** (MEDIA → ALTA): ordinal deducido del último evento; falta gemela 4.º = último; ancla sin candado.
- **T-036** (BAJA): `t005-concurrencia.sql:220` `drop if exists` tras inserts con UUID fijos; sin `finally`.
  Lint: 2 avisos en `lib/cuentas/accesos.test.ts`. jsdom sin tipos.
- `fn_alertar_nota_sin_firmar` no abre alerta si existe *cualquier* versión con ese `cita_id`. Sin ticket.
- **Fuera de CI**: `t001-esquema.sql`, `t002-rls.sql` crean notas sin episodio (sobre era 3).
- **T-014**: SQL-H3 bandeja sin límite; SQL-H5 `reprogramar.ts:80` con `?centro=todos`; `agenda_actualizar_cita` no
  comprueba el estado; caja < 44 px; a 360 px la semana no muestra citas; validar `?semana=`. CRLF rompe prettier.
- **T-014 → T-015**: la ficha (`pacientes/[id]/datos.ts:320`) lee todas las alertas sin mirar el rol (lo cierra T-015).
- **Armazón**: objetivos < 44 px; el login lleva a `/pacientes`. **T-031/T-032** (MEDIA). T-011 sin ADR-045.
- **H25**: el técnico lee el tipo de citas ajenas en sus filas de `auditoria` al reprogramar.
- **CI nunca ha corrido**; a `ci.yml` le faltan `NEXT_PUBLIC_SUPABASE_*` y `SEGUNDO_FACTOR_AUTOMATICO_LOCAL`.
- **R2-H4**: `seed.mjs:29`, `test-huellas.mjs:19` toman el primer `supabase_db_*`; usar `contenedorDelProyecto()`.
- **Worktrees** sin integrar o sucios (no borrar sin mirar): T-014-correcciones `a080931`, T-021 diseño `aba4b63`,
  `a3e7280`, `a540024`, `a6a5f46`; sucios `a0cf274`, `a0fd267`, `a2250fd`, `a47a1a5`, `a5cb7c9`, `ac7b6a3`.
- **Memoria desfasada**: `docs/interfaz.md:67` dice «Lista y alta, sin ficha».
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
