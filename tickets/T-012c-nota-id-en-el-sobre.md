---
id: T-012c
titulo: nota_id entra en el sobre canónico, antes de la primera firma
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-012b, T-034]
bloquea: [T-012]
estado: pendiente
territorio:
  - lib/huella/sobre.ts
  - lib/huella/sobre.test.ts
  - lib/huella/vectores-congelados.json
  - lib/huella/vectores.test.ts
  - supabase/migrations/*_nota_id_en_el_sobre.sql
  - supabase/seed-completo.sql
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/04-baja.sql
  - scripts/rls/14-cadena-huellas.sql
  - scripts/rls/README.md
  - scripts/t005-concurrencia.sql
  - docs/architecture.md
---

# Contexto

El ADR-067 está aceptado y este ticket es **su código**. Quién lee una versión de nota lo deciden
dos cosas. Una es `alcance`, sellado desde el ADR-057 (T-012a) y cotejado desde T-012b. La otra es
la cabecera a la que apunta `nota_id`: `autor_id`, `paciente_id` y `episodio_id` de
`notas_clinicas`, que lee la política `notas_clinicas_versiones_lectura`
(`supabase/migrations/20260822160000_rls_funciones_y_politicas.sql:1152-1167`). `nota_id` **no
está en el sobre**. Quien tenga `postgres` puede levantar los cerrojos, `grant update` y `disable
trigger impedir_modificacion_notas_clinicas_versiones`, y ejecutar `update … set nota_id = <otra
nota del mismo paciente en otro episodio>` sobre una versión `conjunta`. Eso cambia qué
profesionales la leen, y ni la huella ni el cotejo de T-012b lo ven, porque el paciente no cambia y
la cadena sigue encadenando. Es el mismo adversario del ADR-057 (diseño de T-012b §8).

**Esto se paga ahora o no se paga nunca.** `notas_clinicas_versiones` solo tiene filas en las bases
locales sembradas, no en ninguna real. La era 3 no ha sellado ninguna firma de verdad. T-012 escribe
la primera: después, subir de era obliga a convivir con dos formatos para siempre (ADR-035).

## Hechos que el diseño tiene que partir de ellos (verificados el 25-09-2026)

- `EntradaFirma` **ya trae** `notaId` (`lib/huella/sobre.ts`) y `firmar.ts` ya manda `nota_id` en el
  payload. Lo que no hace es meterlo en `sinNormalizar` ni en `esquemaSobre`.
- La cabecera **sí se congela** tras la primera versión: el disparador `congelar_cabecera_sellada`
  (`20260906120000_agenda_esquema.sql:405-436`) prohíbe cambiar `paciente_id`, `fecha_sesion`,
  `autor_id`, `episodio_id` y `cita_id` si existe alguna versión. Pero es un disparador: con los
  cerrojos levantados cae igual, y su mensaje dice que «el sobre canónico sella esos campos», lo que
  hoy solo es cierto de `cita_id`. El `autor_id` sellado es el de la **versión**; la política de
  alta exige hoy que coincida con el de la cabecera, pero nadie coteja después que siga siendo así.
- El verificador compara el sobre con la fila en
  `20260924150000_verificador_coteja_sobre_y_fila.sql:140-147`, una línea por clave.
- El generador de sobres de prueba tiene **tres copias** fuera de TypeScript:
  `scripts/rls/00-ayudantes.sql` (`sobre_prueba()`, llamado desde `01-fijacion.sql`, `04-baja.sql`
  y `14-cadena-huellas.sql`), `supabase/seed-completo.sql` y `scripts/t005-concurrencia.sql`.
  Además, `14-cadena-huellas.sql` lleva los vectores como literales `$vec$`, que
  `vectores-sql.test.ts` coteja byte a byte con el JSON.

# Decisiones que toma el diseño (el ADR-067 se las deja)

- **D1 · ¿Se sella también la cabecera que decide la lectura?** Las opciones mínimas son dos.
  (a) Solo `nota_id`. (b) `nota_id` más los campos de la cabecera que abren la lectura
  (`episodio_id`, y `paciente_id` si no lo cubre ya la cadena), con el verificador cruzando
  `notas_clinicas`. Con (a), un `update` de `notas_clinicas.episodio_id` con el disparador apagado
  sigue cambiando quién lee una versión `conjunta` sin que nada lo señale. Si el diseño elige (a), ese
  riesgo queda **escrito como aceptado** en `docs/architecture.md`, con esas palabras. Si elige
  (b), el sobre gana más de una clave y los criterios 5 y 6 se aplican a cada una.
- **D2 · El `autor_id` de la cabecera.** Decidir si el verificador coteja
  `notas_clinicas.autor_id` con el `autor_id` ya sellado de la versión. Eso no pide una clave nueva,
  pero sí cruzar con la cabecera. Si no se coteja, el riesgo también se deja escrito.
- **D3 · Forma exacta del sobre de era 4** y el vector nuevo que la ejercite, como en T-012a.

# Enmienda por el ADR-071 (propietario, 29-09-2026)

Manda sobre todo lo anterior y lo que sigue donde choquen.

- **Depende de T-034**: toda nota tiene episodio. `episodio_id` entra en el sobre **no nulable**,
  como UUID en minúsculas.
- **`fecha_sesion` también entra en el sobre**: dieciséis claves. Se coteja con la cabecera igual
  que `episodio_id`. El mensaje de `fn_congelar_cabecera_sellada()` pasa a ser cierto para los
  cinco campos.
- **Permisos antes que cotejo**: el disparador comprueba primero que quien firma puede escribir esa
  nota (misma condición que la política de alta) y después coteja el sobre con la cabecera. Un
  llamante sin permiso recibe siempre el mismo error, tenga la cabecera lo que tenga. Hay una
  prueba que lo demuestra: dos intentos sin permiso contra cabeceras distintas dan el mismo
  errcode y el mismo mensaje.
- **El arquitecto enmienda `tickets/T-012/diseno.md` §1.1** en el mismo trabajo (ADR-071.6).
- Criterios que cambian: el 5 (C.13 ya no admite `null`; hay una negativa nueva para
  `fecha_sesion`), el 6 (también `fecha_sesion`) y el 9 (dieciséis claves).

# Enmienda por el ADR-072 (propietario, 29-09-2026)

Manda sobre la enmienda anterior donde choquen.

- **Depende de la columna del coprofesional** que añade T-034 en `notas_clinicas`.
- **El coprofesional entra en el sobre**: diecisiete claves. Es la única clave **nulable** de las
  nuevas (una nota sin coterapia lo sella como `null`, nunca omitido); con valor, UUID en
  minúsculas. Se coteja con la cabecera igual que `episodio_id`, y el mensaje de
  `fn_congelar_cabecera_sellada()` lo incluye.
- Criterios que cambian: el 5 (negativas del coprofesional: distinto de la cabecera, y `null`
  cuando la cabecera tiene valor), el 6 (también el coprofesional) y el 9 (diecisiete claves, y una
  prueba de sensibilidad que cambia solo el coprofesional).

# Tareas

- [ ] **Diseño** (`tickets/T-012c/diseno.md`, arquitecto) con D1–D3 cerradas. El arquitecto
      enmienda en el mismo trabajo `tickets/T-012/diseno.md` §1.1 a la era 4.
- [ ] **El sobre gana `nota_id`** (y lo que decida D1). En `lib/huella/sobre.ts`,
      `ESQUEMA_VERSION = 4`, las claves nuevas en `esquemaSobre` (UUID en minúsculas, **no nulables**)
      y en `sinNormalizar`. `ALGORITMO_VERSION` **no se toca**.
- [ ] **Migración con guarda de era** `supabase/migrations/<sello>_nota_id_en_el_sobre.sql`, con
      sello posterior a `20260924150000`:
  - Empieza **abortando con mensaje propio si hay una sola fila** en `notas_clinicas_versiones`,
    con el patrón de T-012a.
  - `create or replace` de `fn_sellar_version_nota()`: `v_esperadas` con las claves de la era 4 y
    una comprobación nueva por clave, escrita como la 6.2 (`is distinct from` sobre el jsonb, nunca
    `->>` con `<>`).
  - **Sin** el párrafo desfasado que decía que el verificador no detecta un `alcance` alterado por
    debajo (`20260915130000_alcance_en_el_sobre.sql:161-163`).
  - `create or replace` de `verificar_cadena_huellas()`, con la misma firma y la misma rama
    `sobre_no_coincide_con_fila`, más una línea por clave nueva.
  - `comment on` de la función y de la columna `esquema_version` al día, y el `revoke` repetido.
- [ ] **Vectores congelados regenerados**. Los nueve ganan las claves nuevas y `esquema_version: 4`;
      `canonico` y `huella_hex` se recalculan con un guion de un solo uso **que no se comitea**. Los
      literales `$vec$` de `14-cadena-huellas.sql` se actualizan a la par.
- [ ] **Las tres copias del generador de sobres** pasan a la era 4. `sobre_prueba()` recibe
      `p_nota_id` **sin valor por defecto**: un sobre sin nota no existe, y un valor por defecto
      escondería un llamante olvidado. Se actualizan todos los llamantes.
- [ ] **Banco (`14-cadena-huellas.sql`)**:
  - En la sección C, las negativas del disparador van con `assert_lanza_codigo_msg`, con un fragmento
    propio por comprobación.
  - En la sección F, el escenario del ADR-057 para `nota_id`, con sus gemelas positivas.
  - **N1 de T-012b**: F.9b guarda `pg_get_functiondef('public.verificar_cadena_huellas(uuid)'::regprocedure)`
    con `\gset` antes del mutante. Deriva el mutante con `replace()` sobre ese texto, afirmando que
    el reemplazo cambió algo, y restaura desde la variable. No queda ninguna copia de la función
    escrita a mano en el banco.
- [ ] `docs/architecture.md`: el sobre vigente (claves y era 4) en `:62-66` y `:91`, que hoy siguen
      en once claves y era 2, y el párrafo del verificador al día. `scripts/rls/README.md`: la fila
      del módulo 14.

# Criterios de aceptación

1. `npx supabase db reset` aplica todas las migraciones, la nueva incluida, y el banco entero siembra.
2. **La prueba negativa muerde.** Con el banco nuevo escrito y **sin** la migración nueva (tras
   `db reset`), `npm run test:rls` sale con código distinto de cero, y la primera aserción fallida es
   una de las nuevas (la nombra el diseño). Se pega esa salida en la evidencia.
3. Con la migración, `npm run test:rls` sale con exit 0 y todos los módulos en verde.
4. **El escenario del ADR-067.** Con los cerrojos levantados, `update … set nota_id = <otra nota del
   mismo paciente, en otro episodio>` sobre una versión `conjunta` hace que
   `verificar_cadena_huellas(<paciente>)` devuelva **exactamente una fila**: esa versión, con
   `motivo = 'sobre_no_coincide_con_fila'`. La misma aserción comprueba que la huella sigue
   cuadrando con sus bytes. Restaurada, cero filas.
5. **Disparador**, para cada clave nueva: insertar una versión cuyo sobre no coincide con la fila,
   o que la lleva a `null`, falla con `23514` **y con el fragmento de mensaje de esa comprobación**
   (`assert_lanza_codigo_msg`). Un sobre de la era 3, sin la clave, falla en la 6.1.
6. **Si D1 sella la cabecera**: por cada campo sellado, cambiarlo en `notas_clinicas` con el
   disparador `congelar_cabecera_sellada` apagado hace que el verificador señale la versión o
   versiones de esa nota. Restaurado, cero. **Si no la sella**: `docs/architecture.md` nombra ese
   riesgo como aceptado (se comprueba con `grep`).
7. **Sin falsos positivos.** La gemela positiva da cero filas, también en sesión
   `Pacific/Kiritimati`. Al final del banco, `verificar_cadena_huellas()` no devuelve ninguna fila
   salvo la deliberada de PDEMO.
8. **N1 cerrado.** En `14-cadena-huellas.sql` no queda ninguna definición de
   `verificar_cadena_huellas` escrita a mano (se comprueba con `grep`). Después de F.9b, una aserción
   comprueba que `pg_get_functiondef(...)` es igual al texto guardado antes del mutante.
9. `npm test` pasa:
   - `sobre.test.ts` enumera las claves literales de la era 4 y afirma `esquema_version === 4`.
   - Una prueba de sensibilidad nueva: cambiar `notaId` produce otro canónico y otra huella.
   - `acentos-nfd` y `acentos-nfc` siguen compartiendo huella.
   - `vectores-sql.test.ts` sigue en verde.
10. **Guarda de era.** Aplicar la migración sobre una base con una fila firmada aborta con su mensaje
    propio. Se demuestra reaplicándola dentro de `begin; … rollback;` sobre la base sembrada.
11. Tras `npx supabase db reset` + `npm run seed`, `npm run verificar:huellas` dice
    `cadena íntegra: cero anomalías.` (exit 0), y `--json` imprime `[]`.
12. En la migración nueva no está el párrafo desfasado (`grep` de «tampoco detecta un `alcance`»).
    `comment on column … esquema_version` dice 4.
13. `npm run tipos` no cambia `lib/supabase/tipos-bd.ts`. `npm run lint`, `npm run lint:migraciones`
    y `npm run build` salen limpios, y `node ~/.claude/pipeline/territorio.mjs T-012c` en verde.

# Fuera de alcance

- `numero_version` en el sobre: no hay decisión (T-012b, N2).
- `ALGORITMO_VERSION`, que sigue en 1.
- Anclaje externo de la huella de cabeza, y reescribir entera la última versión de una cadena
  (T-012b, TS-B3, riesgo aceptado).
- El mensaje de `fn_congelar_cabecera_sellada()`, salvo que D1 lo haga cierto o lo contradiga. En
  ese caso, el diseño decide si se corrige aquí.
- Cualquier pieza de T-012: editor, borrador, Server Actions o pantalla.
