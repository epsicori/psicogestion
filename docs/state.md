# Estado

> Memoria viva. Máximo 80 líneas (lo impone un hook). Solo presente. Diseño en tickets y bitácora;
> reglas por ruta en `.claude/rules/` (se cargan solas).

**Actualizado**: 01-10-2026 · T-012c integrado en `main` (a7ebc5e)

## Dónde estamos

- **Integrado en `main`**: T-000–T-013a, T-011b, T-012b, T-012c, T-016–T-020, T-029–T-034.
  Autenticación (segundo factor automático solo en local), ficha cifrada, series editables, dinero,
  rejilla de semana, toda nota en episodio. La huella de cada versión sella el sobre de la era 4
  (diecisiete claves) y el disparador y el verificador lo cotejan con la cabecera de la nota.
- `main` al integrar T-012c: build exit 0, `npm test` 737/737, lint 0 errores, `test:rls` exit 0,
  `verificar:huellas` íntegra.

## En curso

- Nada en implementación.
- **T-014** (calendario: vista semanal, estados y ficha de cita): diseñado (`tickets/T-014/diseno.md`),
  libre para entrar.
- **T-035** (congelar `centro_id` + director sanitario como coprofesional) y **T-036** (`cita_id`
  cotejado con la cabecera): sin diseño. T-036 ya no espera a nadie.
- **T-037** (códigos de recuperación solo al activar el segundo factor): sin diseño.

## Bloqueos

- BD local: `qr-prueba-…@psicogestion.test` (FK auditoría impide borrar).
- Windows winnat a veces reserva 54245–54344; Postgres en 54322. Arreglo: `net stop winnat`.

## Siguiente paso

1. T-014 (`modelo: opus`, migración `*_agenda_citas_rango.sql` + banco 18): implementación.
2. T-035 y T-036: diseño con el arquitecto mientras T-014 se implementa. T-014, T-035 y T-036 tocan
   `supabase/`: se implementan uno detrás de otro, nunca a la vez.
3. T-011c (ordinal mensual, MEDIA → ALTA) y T-037.

## Hallazgos anotados (abiertos)

- **T-033** (BAJA): (a) `next start` con config mala no sale: queda 500; (b) URL inlineada en build,
  no en runtime; (c) franja dentro `<Suspense>` no da 500 en headers (capa 2 intacta en acción).
- **T-034 SQL-H2** (MEDIA): reabrir episodio (`cerrado_en = null`) esquiva D6 y mueve el reloj.
  Regla para el ticket que cierre episodios. SQL-H3/H4 decididos en ADR-073; código en T-035.
- **T-011c** (MEDIA → ALTA): ordinal deducido del último evento; falta gemela 4.º = último; lectura
  de ancla sin candado.
- **H27 (T-012c)**: `cita_id` del sobre no se coteja con la cabecera → T-036 (ADR-073.4).
- **Fuera de CI** (territorio ajeno): `t001-esquema.sql` y `t002-rls.sql` crean notas sin episodio y
  pueden llevar generadores de sobre de la era 3.
- **Para T-014**: Zod `.omit()/.pick()` lanzan con `refine` (TS-H7). `2026-02-30` se lee como 2-03:
  validar `?semana=`. T-030 H10: zona `null` sin validación.
- **T-031/T-032** (MEDIA). T-011 sin transiciones ADR-045.
- **Memoria desfasada**: T-002, T-006 y T-013 dicen `estado: en_curso` en su frontmatter, pero están
  integrados. `docs/interfaz.md:67` dice «Lista y alta, sin ficha» y `/pacientes/[id]` existe.
- Anteriores al 13-09: `docs/bitacora/estado-hasta-2026-09-13.md`.
