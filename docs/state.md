# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 02-10-2026 · T-014 cerrado (bitácora); T-012 corte A y diseño de T-036 en marcha

## Dónde estamos

- **Integrado en `main`**: T-000–T-014, T-011b, T-012b, T-012c, T-016–T-020, T-029–T-034.
  Autenticación, ficha cifrada, series editables, dinero, toda nota en episodio (era 4) y el
  calendario (semana, mes, estados, ficha de cita, «Por confirmar»).
- `main` (02-10): `npm test` 1150/1150, build, `db reset` + `seed` + `test:rls` (19 suites) y
  playwright 7/7 (`SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`, `--workers=1`).

## En curso

- **T-012 corte A** (base, acciones, banco 20, guion): entregado en `T-012-corte-a` (`ac7cfc9`);
  verificación y dos revisores. Piezas P1-P8 de MiniMax para el corte B en `minimax/`.
- **T-036**: diseño hecho, (a)-(c) decididas el 02-10; espera a T-012 en `main` (gate §0.B).
- **T-037**: diseño hecho; P-3 = spec Playwright (territorio + `accesibilidad/**`): el arquitecto
  rehace CA2. **T-028**: diseño hecho; corte A (`lib/agenda/sugerencias.ts`) libre; B y C esperan.
- **Tickets por escribir** (arquitecto): T-028a (base del alta, cierra H16, ADR-074), cita↔episodio
  y presencial/online (ADR-075), «regenerar mis códigos» desde el perfil (T-037 P-1).
- **Worktrees de T-014** por quitar (integrados): `agent-a5cb7c…`, `agent-a09e76…`, `agent-a08093…`
  (**`node_modules` junction**: `cmd /c rmdir` antes de `git worktree remove`), `../Psicogestion-T014a`.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK auditoría impide borrar).
- Windows winnat a veces reserva 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. T-012 cortes A, B y C. `supabase/` en orden, nunca dos a la vez:
   T-012 → T-036 → T-035 → T-028a → cita↔episodio (ADR-075).
2. Sin `supabase/`: T-037, T-028 corte A. Luego T-015 (RLS de `alertas_documentacion`), T-011c.

## Hallazgos anotados (abiertos)

- **T-033** (BAJA): (a) `next start` con config mala no sale: queda 500; (b) URL inlineada en build,
  no en runtime; (c) franja dentro `<Suspense>` no da 500 en headers (capa 2 intacta en acción).
- **T-034 SQL-H2** (MEDIA): reabrir episodio (`cerrado_en = null`) esquiva D6 y mueve el reloj.
  Regla para el ticket que cierre episodios. SQL-H3/H4 decididos en ADR-073; código en T-035.
- **T-011c** (MEDIA → ALTA): ordinal deducido del último evento; falta gemela 4.º = último; lectura
  de ancla sin candado.
- **H27 (T-012c)**: `cita_id` del sobre no se coteja con la cabecera → T-036 (ADR-073.4).
- **T-012 D1/D3** (propietario, 01-10): sello falsificable y doble firma de una modificación → T-036;
  su contrato aún no exige borrador vivo, ni coteja `abierta_en`, ni recalcula `redactada_en_sesion`.
- `fn_alertar_nota_sin_firmar` no abre alerta si existe *cualquier* versión con ese `cita_id`
  (de otro paciente incluido); la resolución de T-012 sí lo mira. Sin ticket. El sello de T-012
  dice la fecha `dd/MM` sin año: ambiguo si la nota cruza de año.
- **Fuera de CI** (territorio ajeno): `t001-esquema.sql` y `t002-rls.sql` crean notas sin episodio y
  pueden llevar generadores de sobre de la era 3.
- **Para T-014**: Zod `.omit()/.pick()` lanzan con `refine` (TS-H7). `2026-02-30` se lee como 2-03:
  validar `?semana=`. T-030 H10: zona `null` sin validación.
- **T-014, ronda de arreglos** (abiertos a propósito): SQL-H3 bandeja sin límite y `.in('id', ids)`
  (`leerAlertasNotaPendiente`, `por-confirmar.tsx`); SQL-H5 `reprogramar.ts:80` «recarga» no sirve con
  `?centro=todos`; la RPC `agenda_actualizar_cita` no comprueba el estado (barrera real de SQL-H4);
  la caja de cita < 44 px al tacto (por diseño); `test:a11y` en paralelo; a 360 px la semana no
  muestra citas (consultar con el arquitecto). La bandeja del administrador filtra por
  `profesional_id` propio: no incluye pacientes donde solo es asignado. CRLF rompe `prettier --check`.
- **T-014, decisión del propietario (01-10)**: el técnico solo ve alertas `consentimiento_pendiente`
  (lista blanca; un tipo nuevo queda oculto hasta decidirlo). En T-014 se filtra en la aplicación; la RLS
  sobre `alertas_documentacion` entra con **T-015**, y cierra también la otra puerta: la ficha del paciente
  lee todas las alertas sin mirar el rol (`pacientes/[id]/datos.ts:320`, `PanelResumen`, `PanelDocumentos`).
- **T-014** (sin FALLA): en la vista mes, el panel de la última fila rebasa el recuadro del calendario
  (queda entero en pantalla); el contrato dice «se recorta a los límites del calendario».
- **T-014** (BAJA, de la rama abandonada `T-014-correcciones`): si la cita de un panel abierto sale
  de la vista (movida a otra semana), `calendario.tsx:312-315` sigue pintando la copia vieja; esa
  rama cerraba el panel. El servidor revalida al reprogramar: sin daño en datos.
- **T-014, B3 (BAJA, aceptadas al integrar)**: B3-1 el foco cae a `body` si la cita cambia de día
  con el foco en su fila del panel del día; B3-2 `dialogo === null` sin prueba; B3-3 «Por confirmar»
  roba el foco desde el Confirmar de otra propuesta; B3-4 pico dibujado con el panel centrado;
  B3-5 tres mutantes vivos en colocación y `visibleEnVentana` solo recorta arriba. El panel sigue
  a su ancla al desplazar: sale de pantalla con ella (verificador).
- **Armazón**: objetivos < 44 px (menú 36, cerrar 32, centro 40); el login lleva a `/pacientes`, no a
  `/agenda`. Sin ticket. **T-031/T-032** (MEDIA). T-011 sin transiciones ADR-045.
- **Memoria desfasada**: `docs/interfaz.md:67` dice «Lista y alta, sin ficha» y `/pacientes/[id]` existe.
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
