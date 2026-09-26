**Sin hallazgos ALTA.** Revisión TS, contrato y alcance de T-011b: 0 ALTA · 1 MEDIA · 6 BAJA.

- Diff revisado: `git diff 9c74516..a22b032` (rama `worktree-agent-ab1a3b406d7170f06`, worktree `.claude/worktrees/t011b-banco`).
- Contrato: `tickets/T-011b-editar-serie-desde-la-cita.md`. Diseño: `tickets/T-011b/diseno.md` §1.8, §3, §5, §6, §8 y «Para T-014».
- No se ha leído ni `evidencia.json` ni el informe del verificador. El SQL y el banco los revisa el otro revisor. Aquí solo entra el SQL que toca la frontera con TS, el contrato con T-014 o la autorización.

## MEDIA

### H1 · `esta` con `p_fecha` responde `22023` antes de autorizar: oráculo de existencia de citas
- **Dónde:** `supabase/migrations/20260925120000_editar_serie_desde_la_cita.sql:479-482`.
- **Qué pasa:** la guarda nueva `Con "esta"…` va antes de cualquier comprobación de autorización.
  - Antes, la rama `esta` delegaba sin más en `agenda_actualizar_cita`, que autoriza por dentro (`20260910120000_…:901-908`).
  - Ahora `agenda_editar_serie` lee la cita como `definer`, sin RLS. Si existe y viene `p_fecha`, lanza `22023` sin haber mirado de quién es.
- **Escenario:** PRO2, de otro centro, llama por PostgREST a `rpc('agenda_editar_serie', {p_cita_id: <uuid de una cita de PRO1>, p_alcance: 'esta', p_fecha: '2027-01-01'})`.
  - Recibe `22023` «Con "esta" no se cambia la fecha…».
  - Con un uuid inventado recibe `42501` «La cita no existe o no es tuya.».
  - La diferencia le dice qué citas existen, que es justo lo que §5 del diseño pide no revelar («42501 primero»; en la previsualización, «sin revelar si la cita existe»).
- **Alcance del fallo:** `esquemaEditarSerie` impide esta combinación desde la aplicación, pero la RPC está concedida a todo `authenticated`.
- **Cómo cerrarlo:** la guarda de `p_fecha` va detrás del predicado de autorización de F25, el que ya usa la rama `esta_y_siguientes` (líneas 487-496), o se comprueba la autorización antes de bifurcar por alcance.
- Se solapa con la revisión SQL. Si ya la ha anotado, cuenta una sola vez.

## BAJA

### H2 · La traducción del domingo a ISODOW no tiene prueba: la mutación sigue en verde (medido)
- **Dónde:** `lib/citas/esquemas.ts:52`; pruebas en `lib/citas/esquemas.test.ts:139-187`.
- **Qué pasa:** las tres pruebas nuevas de `diaSemana` usan el lunes `2027-03-08` (con 1 y con 2). No hay ninguna fecha en domingo.
- **Medido:** en una copia en el scratchpad cambié `return diaSemanaJS === 0 ? 7 : diaSemanaJS;` por `return diaSemanaJS;` y las pruebas siguieron pasando, 19 de 19.
- **Escenario:** alguien «simplifica» `isodowDe` a `getUTCDay()`.
  - `{alcance: 'esta_y_siguientes', fecha: '2027-03-07', diaSemana: 7}` pasaría a rechazarse en el cliente con «no coinciden».
  - La base lo acepta, porque `extract(isodow)` da 7.
  - Hoy el código es correcto: esa entrada da `success: true`.
- **Cómo cerrarlo:** un caso positivo en domingo (`'2027-03-07'`, 7) y su negativa (`'2027-03-07'`, 0 lo corta ya el `min(1)`; mejor 6).

### H3 · El comentario de la negativa reapuntada de §A no dice que el vínculo en las series lo prueba §B
- **Dónde:** `scripts/rls/17-vinculo-agenda.sql:60-73`.
- **Qué pide el contrato:** que la negativa pase a `assert_lanza_codigo_msg` con el fragmento del privilegio (hecho) y que «su comentario explica que el vínculo en las series lo prueba §B». El comentario nuevo no nombra §B.
- **Qué dice el rótulo:** sigue diciendo «PRO1 NO puede crear una SERIE **para P2**».
- **Escenario:** la aserción ya no depende del paciente. Con P1, que sí es de PRO1, daría el mismo `42501 permission denied`.
  - Quien lea §A creerá que ahí se protege el vínculo profesional-paciente en las series.
  - Si §B se rompe o se borra, nada de §A lo delata, y el comentario no le dice al lector dónde mirar.
- **Además:** la cabecera del módulo (líneas 7-10, «la política cubre el INSERT directo») ya no es verdad para `series_cita`. El contrato dice «Nada más de ese módulo», así que no se toca aquí; va a `docs/state.md` al integrar.

### H4 · La fila del módulo 16 en el README promete «un criterio por bloque», y no es así
- **Dónde:** `scripts/rls/README.md:42`.
- **Qué dice:** «criterios 4 a 18 del contrato, uno por bloque M.1-M.15». No es así:
  - los criterios 14 y 15 (TS, lint, build, territorio) no tienen bloque M;
  - el criterio 5 ocupa M.2 y M.3, y el 7 ocupa M.5 y M.6;
  - M.12 es el criterio 13, M.13 el 16, M.14 el 17 y M.15 el 18 (cabeceras en `16-series.sql:767-2032`).
- **Escenario:** quien busque la prueba del criterio 16 contando «criterio n = M.(n-3)» abre M.13 por casualidad, pero para el 14 llega a M.11, que es el criterio 12 (mensual). La tabla del README está para eso, y aquí orienta mal.
- **Cómo cerrarlo:** «criterios 4-13 y 16-18, en los bloques M.1-M.15».

### H5 · El docblock de `editarSerie` no dice que la regla se aplica desde la cita elegida
- **Dónde:** `lib/citas/series.ts:88-97`.
- **Qué pide el diseño (§1.8):** «El docblock dice que la regla parte de la cita elegida y que `fecha` fija el día nuevo de esa cita».
- **Qué dice el docblock:** la segunda parte, pero la primera sigue como en T-011: «cambia la regla de la serie y devuelve las propuestas».
- **Escenario:** el implementador de T-014 lee el docblock de la función que va a llamar y no ve que ya no afecta a las citas anteriores a la elegida (H8), que es el cambio central del ticket.

### H6 · La cabecera de `esquemas.ts` sigue atribuyendo a «T-011b (MiniMax)» un formulario que no existe
- **Dónde:** `lib/citas/esquemas.ts:3-5`.
- **Qué dice:** «el mismo esquema que usará el formulario en cliente de T-011b (MiniMax)». T-011b es ahora este ticket, y la interfaz está fuera de su alcance (el formulario, si lo hay, es de T-014).
- **Escenario:** el hallazgo 3 de §8 del diseño («colisión de nombre T-011b») anota solo `minimax/alcance.json:154` y `minimax/cortes/T-011.md:16`. Este tercer sitio, en código que la rama ha tocado, quedaría fuera de la anotación de `state.md`, y el implementador de T-014 buscaría un formulario MiniMax que no existe.
- **Cómo cerrarlo:** añadirlo al hallazgo 3 al integrar, o corregir la línea, que está en territorio.

### H7 · Para T-014: `.omit()` y `.pick()` lanzan sobre esquemas con `refine` en el Zod del repo (medido)
- **Dónde:** `tickets/T-011b/diseno.md:629-631` («Su esquema Zod es el de `esquemaEditarSerie` sin los campos de `esta`») y `tickets/T-014/diseno.md:854` (`esquemaReprogramarCita.omit({ alcance: true, firma: true })`).
- **Medido** con el `zod` del worktree:
  - `esquemaEditarSerie.omit({estado: true})` lanza `.omit() cannot be used on object schemas containing refinements`;
  - `.pick()` lanza lo mismo.
- **Escenario:** T-014 deriva el esquema de la previsualización con `.omit()` sobre `esquemaEditarSerie`, que ya tiene tres `refine`, o hace el `.omit()` de su §8.3.2 sobre `esquemaReprogramarCita` después de añadirle el `refine` de la firma. La excepción salta al importar el módulo y tumba toda acción de `/agenda` que lo importe.
- **Alcance:** no es un defecto del código de esta rama. Los dos `refine` anteriores ya lo impedían, y el tercero no cambia nada. Es una frase del contrato que T-014 va a encontrarse. Se anota en `docs/state.md` §Hallazgos, apuntando a T-014: el esquema base se escribe sin `refine` y se refina por separado.

## Comprobado sin hallazgo

- **`fecha` en Zod frente a `p_fecha date`:** regex `AAAA-MM-DD` más una ida y vuelta por `Date.UTC`. No hay ningún `new Date('AAAA-MM-DD')` ni hora local.
  - Medido: `2028-02-29` pasa, `2027-02-29` y `2027-02-30` se rechazan.
  - Un año `0001`-`0099` se rechaza como «no existe» (`Date.UTC` lleva 0-99 a 19xx). No tiene efecto: la base rechaza igualmente toda fecha pasada.
- **Guardas del esquema:**
  - `fecha` está prohibida con `esta` (primer `refine`), y la base también lo rechaza.
  - Si no coincide con `diaSemana`, el error va en `path ['fecha']`, como la guarda de `plan_edicion_serie`.
  - Las negativas de `esta` y de fecha inexistente se ponen rojas si se quita su guarda (razonado: no queda ninguna otra que las rechace).
- **`editarSerie`:**
  - pasa `p_fecha: entrada.fecha ?? undefined`;
  - el error no se traga: `console.error` más `mapearErrorCitas`;
  - la forma de retorno (`propuestas` como `uuid[]` de `to_jsonb(v_creadas)`) casa con el `data as {…propuestas?: string[]}` y con H18 de T-014 (`{alcance, propuestaIds}`).
- **`tipos-bd.ts` frente a la migración:**
  - `agenda_editar_serie` tiene una sola entrada, de 11 argumentos y con `p_fecha?: string`; la firma de 10 ya no aparece;
  - `agenda_previsualizar_edicion_serie` tiene 6 argumentos opcionales salvo `p_cita_id`;
  - los ayudantes internos coinciden con su SQL (orden alfabético y `Row` de tabla, que son forma de fichero generado).
- **Contrato con T-014 §8.1 y §8.5:**
  - las claves del `jsonb` de la previsualización (`serie_id`, `desde_cita_id`, `fecha_origen`, `fecha_destino`, `cambia`, `regla_anterior`, `regla{…, ordinal, ultimo, recorte}`, `citas[{cita_id, fecha_actual, fecha_nueva, hora_local, inicio|null, fin|null, clasificacion, recortada}]`) están todas;
  - los 11 fragmentos de §8.5 aparecen literalmente en los mensajes de la migración, y ninguno contiene a otro anterior en el orden de búsqueda;
  - el nombre del fichero casa con el glob `*_editar_serie_desde_la_cita.sql` que leerá `errores.test.ts`.
- **Alcance:**
  - `node ~/.claude/pipeline/territorio.mjs T-011b`, ejecutado desde el worktree, dice: «8 fichero(s) tocado(s), todos dentro…» (exit 0);
  - la rama no toca `tickets/**`, `.claude/**` ni `CLAUDE.md`;
  - no hay envoltorio TS de la previsualización ni `errores.ts` (son de T-014, como manda el contrato).
- **Constitución:**
  - regla 6: las tablas de solo adición no se tocan; `citas` y `series_cita` no lo son;
  - regla 4: `docs/state.md` y `docs/bitacora/T-011b.md` no están en la rama, que es la convención (entran en el commit de integración, como en T-012b). Al integrar hay que comprobar que llegan los cinco hallazgos de §8 del diseño, más la cabecera de `17-vinculo-agenda.sql` (H3), el tercer sitio de la colisión de nombre (H6) y la nota de `.omit()` para T-014 (H7).
- **Pruebas:** `npx vitest run lib/citas/esquemas.test.ts` en el worktree pasa 19 de 19.
