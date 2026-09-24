# T-012b · Diseño: el verificador coteja el sobre sellado con las columnas de la fila

Contrato: `tickets/T-012b-verificador-coteja-sobre-y-fila.md`. Riesgo alto (`modelo: opus`).
Origen: `tickets/T-012a/revision.md` §M1 · `docs/bitacora/T-012a.md` · decisión del propietario
del 24-09-2026 (`docs/state.md`, «El verificador coteja sobre y fila»).

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | El verificador solo se define una vez; ninguna migración posterior lo redefine. | `grep verificar_cadena_huellas supabase/migrations/*.sql` → solo `20260829210000_cadena_de_huellas.sql:515` crea |
| H2 | Es `language sql stable security definer set search_path = ''`, devuelve `table (paciente_id uuid, posicion_cadena integer, version_id uuid, nota_id uuid, creada_en timestamptz, motivo text)` y **una fila por anomalía**. Cinco motivos: `era_desconocida`, `huella_no_coincide`, `genesis_incorrecto`, `hueco_de_posicion`, `eslabon_desencadenado`. Solo lee `contenido_canonico`, `huella`, `huella_anterior`, `algoritmo_version` y las posiciones: **no mira ni una columna que el sobre repita**. | `20260829210000_cadena_de_huellas.sql:515-596` |
| H3 | `revoke all … from public, anon, authenticated, service_role`: solo lo ejecuta `postgres`. | mismo fichero `:609` |
| H4 | La versión vigente de `fn_sellar_version_nota()` (T-012a) compara sobre y fila **solo `before insert`**: 6.2 `autor_id`, 6.3 `cuerpo` (igualdad jsonb), 6.4 `anotaciones_reservadas` (null JSON ↔ NULL), 6.5 `esquema_version`, 6.6 `motivo_cambio`, 6.7 `creada_en` = `firmada_en` = `to_char(creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`, 6.10 `alcance`. | `20260915130000_alcance_en_el_sobre.sql:180-286` |
| H5 | El sobre tiene doce claves; **solo siete tienen columna**: `alcance`, `anotaciones_reservadas`, `autor_id`, `creada_en` (+ `firmada_en`, mismo instante), `cuerpo`, `esquema_version`, `motivo_cambio`. `abierta_en`, `cita_id`, `margen_sesion_minutos` y `redactada_en_sesion` viven solo en el sobre. | columnas: `20260822094547_…:648-675` + `20260829210000_…:54-56`; claves: `20260915130000_…:53-57` |
| H6 | La aplicación escribe exactamente esas siete columnas copiándolas del sobre. | `lib/huella/firmar.ts:51-61` |
| H7 | No hay más disparadores `BEFORE INSERT` que modifiquen `NEW` después del sellado (`exigir_episodio_en_nota_conjunta` corre antes y no toca `NEW`; `vaciar_borrador_al_firmar` es `AFTER`). Lo guardado es lo que las 6.x compararon: una fila honesta cumple las siete igualdades **en reposo**. | `20260822094547_…:1426-1444`, `20260829210000_…:461,501` |
| H8 | `notas_clinicas_versiones_lectura` decide con la **columna** `alcance` y con la cabecera por `nota_id` (`autor_id`, `paciente_id`, `episodio_id` de `notas_clinicas`). | `20260822160000_rls_funciones_y_politicas.sql:1152-1167` |
| H9 | Hay CHECK que siguen vigentes con los disparadores apagados: `contenido_canonico` y `cuerpo` tienen que ser objetos JSON, y `numero_version = 1 or motivo_cambio no vacío`. | `20260822094547_…:659,669`, `20260829210000_…:61-63` |
| H10 | El banco manipula filas así: `grant update … to postgres` + `disable trigger impedir_modificacion_notas_clinicas_versiones`, y los devuelve al final de la sección D. **D.1** reescribe `'cad-b'` → `'MANIPULADO'` dentro de `contenido_canonico` y comprueba **1 fila**, `posicion_cadena = 2` y `motivo = 'huella_no_coincide'` con subconsultas escalares. **D.2** comprueba que reescribir la columna `cuerpo` de forma jsonb-equivalente **no** se señala (8.1) y que reescribir `contenido_canonico` de forma jsonb-equivalente se señala con 1 fila (8.2). | `scripts/rls/14-cadena-huellas.sql:571-676` |
| H11 | La sección C deja en PDEMO una fila **insertada con `sellar_version_nota` apagado**: sobre con `autor_id` 2222… frente a la columna PRO1, `esquema_version` 2 en el sobre frente a 3 en la columna y huella falsa (`'11'×32`). Hoy solo la señala `huella_no_coincide`. | `14-cadena-huellas.sql:504-526` |
| H12 | `pg_temp.sobre_prueba(p_autor_id, p_creada_en, p_cuerpo, p_anotaciones_reservadas, p_motivo_cambio, …, p_alcance)` genera sobres coherentes de doce claves. | `scripts/rls/00-ayudantes.sql:180-209` |
| H13 | `pg_temp.assert` lanza `ASERCIÓN FALLIDA: <rótulo>` y el banco corre en **una** transacción con `ON_ERROR_STOP=1`, así que se para en la primera aserción que falla. | `00-ayudantes.sql:11-20`, `scripts/test-rls.mjs:39-46` |
| H14 | `scripts/verificar-huellas.mjs` agrega con `jsonb_agg(t order by t.paciente_id, t.posicion_cadena)`, y en modo texto imprime **solo la anomalía de posición mínima de cada paciente**, con desempate indeterminado. `--json` imprime el array tal cual. Exit 1 si hay anomalías. | `scripts/verificar-huellas.mjs:59-120` |
| H15 | Nada de `lib/**`, `app/**` ni `components/**` lee `notas_clinicas_versiones` ni los motivos del verificador. `lib/huella/` no tiene verificador. El único tipo generado es `Functions.verificar_cadena_huellas` con `motivo: string`. | grep; `lib/supabase/tipos-bd.ts:2772-2782` |
| H16 | Postgres 17 (`supabase/config.toml:42`), así que `pg_input_is_valid(text, 'jsonb')` existe (PG ≥ 16). | |
| H17 | La semilla firma cinco versiones con `anotaciones_reservadas` y `motivo_cambio` no nulos y una `conjunta`. | `supabase/seed-completo.sql:361-425` |

---

## 1 · Piezas y contratos

### 1.1 · Migración `supabase/migrations/20260924150000_verificador_coteja_sobre_y_fila.sql`

Sello `20260924150000`. Si al integrar hay en `main` una migración con sello posterior, se
renumbra por encima antes del merge (ver §4, R3).

**Sin guarda de era.** No cambia datos ni la forma del sobre. Tiene que aplicarse igual sobre una
base con filas firmadas, al revés que T-005 y T-012a.

Contenido, en este orden:

**(a) Cabecera** que cite T-012b, ADR-057 §Consecuencias y `tickets/T-012a/revision.md` §M1.

**(b) `create or replace function public.verificar_cadena_huellas(p_paciente_id uuid default null)`**
con **la misma firma, los mismos nombres y tipos de columna de retorno en el mismo orden,
`language sql stable security definer set search_path = ''`**. Nunca `drop function`: ver §2 D3.

El cuerpo es el actual (`20260829210000_…:529-596`) **copiado literalmente**, con tres cambios.

1. Al CTE `c` se le añaden estas columnas, todas con el alias `v.`:

```sql
      v.cuerpo,
      v.anotaciones_reservadas,
      v.autor_id,
      v.esquema_version,
      v.motivo_cambio,
      v.alcance,
      case when pg_input_is_valid(v.contenido_canonico, 'jsonb')
           then v.contenido_canonico::jsonb end                                   as sobre,
      case when pg_input_is_valid(v.cuerpo, 'jsonb')
           then v.cuerpo::jsonb end                                               as cuerpo_jsonb,
      to_jsonb(to_char(v.creada_en at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))                          as creada_en_iso
```

2. Rama nueva, **la última** antes del `order by`:

```sql
  union all

  -- sobre_no_coincide_con_fila (T-012b, ADR-057): cada columna que el firmante
  -- copia del sobre (lib/huella/firmar.ts) se coteja con su clave SELLADA, con la
  -- MISMA semántica que la comprobación del disparador que la validó al insertar.
  -- La huella sigue calculándose solo sobre los bytes guardados (ADR-035): aquí se
  -- comparan valores, no se reserializa nada.
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'sobre_no_coincide_con_fila'::text
    from c
   where c.algoritmo_version = 1
     and (
          c.sobre is null                                                    -- no es JSON: no se puede cotejar
       or jsonb_typeof(c.sobre) <> 'object'
       or (c.sobre -> 'alcance')                is distinct from to_jsonb(c.alcance::text)                         -- 6.10
       or (c.sobre -> 'autor_id')               is distinct from to_jsonb(c.autor_id::text)                        -- 6.2
       or (c.sobre -> 'cuerpo')                 is distinct from c.cuerpo_jsonb                                    -- 6.3
       or (c.sobre -> 'anotaciones_reservadas') is distinct from coalesce(to_jsonb(c.anotaciones_reservadas), 'null'::jsonb) -- 6.4
       or (c.sobre -> 'esquema_version')        is distinct from to_jsonb(c.esquema_version)                       -- 6.5
       or (c.sobre -> 'motivo_cambio')          is distinct from coalesce(to_jsonb(c.motivo_cambio), 'null'::jsonb)          -- 6.6
       or (c.sobre -> 'creada_en')              is distinct from c.creada_en_iso                                   -- 6.7
       or (c.sobre -> 'firmada_en')             is distinct from c.creada_en_iso                                   -- 6.7
     )
```

   El predicado es **literal**: el implementador no reescribe ninguna línea con `->>` ni con `<>`.

3. `order by 1, 2;` pasa a `order by 1, 2, 6;` (desempate determinista por motivo).

**(c) `comment on function public.verificar_cadena_huellas(uuid)`** con el texto actual y dos
cambios: seis motivos cerrados, con `sobre_no_coincide_con_fila` al final, y una frase: «Además
coteja las siete columnas que el sobre repite (`alcance`, `autor_id`, `cuerpo`,
`anotaciones_reservadas`, `esquema_version`, `motivo_cambio`, `creada_en`) con su clave sellada,
con la semántica de las comprobaciones 6.2–6.7 y 6.10 de `fn_sellar_version_nota()`; cotejar
valores no es reserializar (ADR-035). Una fila por versión divergente, no por columna.»

**(d) `revoke all on function public.verificar_cadena_huellas(uuid) from public, anon, authenticated, service_role;`**
repetido. `create or replace` conserva los permisos, así que es redundante, pero deja la
invariante escrita junto a la función.

### 1.2 · Banco: `scripts/rls/14-cadena-huellas.sql`

**Cabecera del fichero**: dos `\set` nuevos junto a los demás.

```
\set PCOT '\'d012b001-0000-4000-8000-000000000001\''
\set NCOT '\'f012b001-0000-4000-8000-000000000001\''
```

`(:PCOT, 'Cora', 'Cotejo', :PRO1, :CA)` se añade al `insert into public.pacientes` existente y
`(:NCOT, :PCOT, :PRO1)` al `insert into public.notas_clinicas` existente.

**D.1, adaptada.** La manipulación no cambia. Ahora da **dos** filas, las dos en la posición 2:
el sobre de NCADB dice `{"t":"MANIPULADO"}` y la columna `cuerpo`, `{"t":"cad-b"}`. Las tres
aserciones escalares se sustituyen por estas:
- `count(*) = 2`, con el rótulo «Manipulada la posición intermedia (NCADB), el verificador señala EXACTAMENTE esa versión y ninguna anterior (dos motivos)»;
- `(select array_agg(motivo || '@' || posicion_cadena order by motivo) from public.verificar_cadena_huellas(:PCAD)) = array['huella_no_coincide@2','sobre_no_coincide_con_fila@2']`.

El comentario de D.1 explica por qué ahora son dos.

**D.2**: 8.1 se queda como está (tiene que seguir dando 0). Su comentario pasa a decir: «el
verificador no deriva la huella de `cuerpo`; desde T-012b la coteja con el sobre **como jsonb**,
y una reescritura jsonb-equivalente no es una divergencia». En 8.2 se añade tras el recuento:
`(select motivo from public.verificar_cadena_huellas(:PCAD)) = 'huella_no_coincide'`.

**Sección F nueva: «Cotejo sobre–fila (T-012b)»**, después de E y antes del `\echo` final.

- **F.0 · Dos versiones honestas** de NCOT, en sesión `postgres` (`call pg_temp.reset_sesion()`):
  - v1: `cuerpo '{"t":"cot-1"}'`, `anotaciones_reservadas` y `motivo_cambio` NULL, `creada_en timestamptz '2026-08-29 09:40:00.123+00'`, sobre `pg_temp.sobre_prueba(:PRO1, <ese instante>, '{"t":"cot-1"}'::jsonb)`.
  - v2: `cuerpo '{"t":"cot-2"}'`, `anotaciones_reservadas 'reservada'`, `motivo_cambio 'Aclaración (T-012b)'`, `creada_en '2026-08-29 09:41:00.456+00'`, sobre `sobre_prueba(:PRO1, <instante>, '{"t":"cot-2"}'::jsonb, 'reservada', 'Aclaración (T-012b)')`.
  - Aserción `F.0 · gemela positiva`: `verificar_cadena_huellas(:PCOT)` da 0 filas, con cadenas no nulas en las dos columnas anulables.
  - Aserción `F.0 · zona`: se guarda `current_setting('TimeZone')` con `\gset`, `set timezone = 'Pacific/Kiritimati'`, 0 filas, y se restaura el valor guardado.
  - Aserción `F.0 · permisos`: `not has_function_privilege(r, 'public.verificar_cadena_huellas(uuid)', 'execute')` para `anon`, `authenticated` y `service_role`.
- **Cerrojos levantados**: `grant update on public.notas_clinicas_versiones to postgres;` + `alter table … disable trigger impedir_modificacion_notas_clinicas_versiones;`.
- **F.1 a F.9 · un caso por fila de la tabla.** Cada caso: `update` → aserción exacta → restauración → aserción de 0 filas. La aserción exacta es
  `(select array_agg(motivo || '@' || posicion_cadena order by motivo) from public.verificar_cadena_huellas(:PCOT)) = array['sobre_no_coincide_con_fila@<pos>']`.
  Se puede escribir un ayudante local `pg_temp.t012b_caso(p_nota uuid, p_numero_version int, p_set text, p_restaura text, p_esperado text[], p_rotulo text)` que haga `execute format('update public.notas_clinicas_versiones set %s where nota_id = %L and numero_version = %s', …)`. Los UUID se pasan como parámetro, porque `:NCOT` no se sustituye dentro de `$$`.

| Caso | Versión | `set` | Restaura | Qué impediría que se detecte |
|---|---|---|---|---|
| **F.1 · alcance cambiado por debajo (M1 de T-012a)** | v1 (pos 1) | `alcance = 'conjunta'` | `'individual'` | falta la línea 6.10 |
| F.2 · autor_id | v1 | `autor_id = '<PRO2>'` | PRO1 | falta la línea 6.2 |
| F.3 · cuerpo no equivalente | v1 | `cuerpo = '{"t":"otro"}'` | `'{"t":"cot-1"}'` | falta la línea 6.3 |
| F.4 · anotaciones NULL → '' | v1 | `anotaciones_reservadas = ''` | `null` | se compara como texto con `->>` y coalesce a `''` |
| F.5 · anotaciones cadena → NULL | v2 (pos 2) | `anotaciones_reservadas = null` | `'reservada'` | se usa `->>` + `<>`: `NULL <> x` es NULL |
| F.6 · motivo NULL → cadena | v1 | `motivo_cambio = 'inventado'` | `null` | falta la línea 6.6, o el mismo coalesce |
| F.7 · motivo cadena → otra | v2 | `motivo_cambio = 'Otro motivo'` | `'Aclaración (T-012b)'` | falta la línea 6.6 |
| F.8 · esquema_version | v1 | `esquema_version = 2` | `3` | falta la línea 6.5 |
| F.9 · creada_en +1 ms | v1 | `creada_en = creada_en + interval '1 millisecond'` | `- interval '1 millisecond'` | se compara a segundos, o se usa `firmada_en` en lugar de `creada_en` |

  **F.1 lleva además** `extensions.digest(convert_to(contenido_canonico,'UTF8') || huella_anterior,'sha256') = huella` sobre esa fila, dentro de la misma aserción o en una contigua con rótulo `F.1 · …`. Así queda probado que la huella sigue intacta y que solo el cotejo lo ve. El rótulo de F.1 empieza por `F.1 · alcance cambiado por debajo`: el criterio 2 lo busca en la salida roja.
- **Cerrojos devueltos**: `enable trigger` + `revoke update … from postgres`, y dos aserciones:
  `not has_table_privilege('postgres', 'public.notas_clinicas_versiones', 'update')` y
  `(select tgenabled from pg_trigger where tgname = 'impedir_modificacion_notas_clinicas_versiones') = 'O'`.
- **F.10 · sin falsos positivos en todo el banco**:
  `not exists (select 1 from public.verificar_cadena_huellas() v where v.paciente_id <> :PDEMO)`.
  Cubre NCONJ `conjunta`, NVEC (sobre real de TypeScript con NFC), P2/NCORR con `motivo_cambio` y,
  sobre base sembrada, las cinco firmas de la semilla.
- **F.11 · la otra puerta**: la fila de PDEMO, insertada en §C con `sellar_version_nota` apagado,
  aparece ahora también como `sobre_no_coincide_con_fila`:
  `exists (select 1 from public.verificar_cadena_huellas(:PDEMO) where motivo = 'sobre_no_coincide_con_fila')`.

### 1.3 · `scripts/verificar-huellas.mjs`

- En la consulta, `jsonb_agg(t order by t.paciente_id, t.posicion_cadena, t.motivo)`.
- En modo texto, agrupar por paciente respetando el orden del array. La primera línea de cada
  cadena **no cambia de formato**. Si la cadena tiene más anomalías, se añade **una** línea
  justo debajo:
  `      y <N> anomalía(s) más en esta cadena: <motivo> (posición <p>), <motivo> (posición <p>)…`
  Se escribe por `console.error`, como las demás.
- `--json`, la cabecera `verificar:huellas — N anomalía(s) en M cadena(s):` y los códigos de salida
  (0, 1 y 2) **no cambian**.
- En el comentario de cabecera del guion, una frase: el sexto motivo, y que el modo texto enseña la
  primera anomalía de cada cadena más el recuento del resto.

### 1.4 · Documentación

- `docs/architecture.md`, párrafo «Implementación (T-005)», justo después de «…y no se concede a
  `authenticated`.»: una frase con el cotejo de las siete columnas y el motivo
  `sobre_no_coincide_con_fila` (T-012b, ADR-057). **Nada más de ese párrafo**: el sobre de once
  claves y `esquema_version = 2` (B1 de T-012a) no se tocan aquí.
- `scripts/rls/README.md`, fila del módulo 14: añadir «y el cotejo sobre–fila del verificador
  (T-012b, sección F)».
- Bitácora `docs/bitacora/T-012b.md` y `docs/state.md` reescrito, por la regla 4. Son rutas comunes
  del territorio.

---

## 2 · Decisiones y alternativas descartadas

- **D1 · Se cotejan las siete columnas, no solo `alcance`.** Son exactamente las que
  `firmar.ts` copia del sobre y el disparador valida al insertar (6.2–6.7, 6.10). La que se deje
  fuera tiene el mismo agujero que `alcance`, y en `cuerpo` el agujero es el texto clínico mismo.
  Las otras cinco claves no tienen columna. *Descartado:* solo `alcance`, porque deja abierta a
  propósito la misma puerta en `cuerpo` y `autor_id`.
- **D2 · La semántica de cada comparación es la del disparador, línea por línea.**
  `is distinct from` sobre el jsonb completo, igualdad jsonb para `cuerpo` y null JSON ↔ NULL con
  `coalesce(to_jsonb(x), 'null')`. Así ninguna fila honesta da un falso positivo, por construcción
  (H7). *Descartado:* `->>` con `<>`, que es la trampa del NULL ya pagada en T-005 y T-012a.
- **D3 · Una fila por versión divergente, y la firma no cambia.** *Descartado:* una columna
  `campos text[]` con las columnas que no coinciden. Cambia el tipo de retorno, lo que obliga a
  `drop function` + `create`. Supabase concede entonces `EXECUTE` por defecto a `anon`,
  `authenticated` y `service_role`, `tipos-bd.ts` se regenera y cambia el contrato de T-009. Para
  el análisis forense basta una consulta a mano.
- **D4 · El cotejo va dentro del verificador y no se comparte con el disparador.** *Descartado:*
  sacar una `fn_sobre_coincide_con_fila()` que usen los dos, porque obliga a redefinir
  `fn_sellar_version_nota()`, fuera de alcance, y a perder los diez mensajes distintos en los que
  se apoya `assert_lanza_codigo_msg`. El riesgo de que las dos copias diverjan lo cubren F.10 y F.1–F.9.
- **D5 · Si una fila no se puede cotejar, se marca.** Si `contenido_canonico` o `cuerpo` no son
  JSON (hoy lo impiden los CHECK de H9, salvo que alguien los retire), la fila sale como
  `sobre_no_coincide_con_fila` en lugar de abortar el verificador. El cast va dentro de `CASE`
  con `pg_input_is_valid`. *Descartado:* el cast sin guarda, porque una fila rota ciega la
  verificación de todas las demás.
- **D6 · Solo las filas con `algoritmo_version = 1`**, como las otras comprobaciones. Una fila de
  otra era ya sale como `era_desconocida`. Todas las `esquema_version` se cotejan igual: si una
  era 4 futura no redefine esta rama, fallará con falsos positivos visibles, nunca en silencio.
- **D7 · Un solo motivo, `sobre_no_coincide_con_fila`**, con el nombre que fijó el propietario.
  *Descartado:* un motivo por columna, que abre el conjunto cerrado y rompe el nombre decidido.
- **D8 · La migración no lleva guarda de era**, porque no cambia datos ni la forma del sobre.
- **D9 · Se cumple el ADR-035.** La huella se sigue calculando solo sobre los bytes guardados.
  Parsear el sobre para comparar valores no es reserializarlo para calcular un resumen, y el
  verificador sigue sin canonicalizador.
- **D10 · En modo texto se añade una línea de recuento, sin listar cada anomalía.** Así una
  divergencia sobre–fila que no sea la primera anomalía de su cadena se ve también en texto. La
  primera línea conserva el formato de T-005 y `--json` es el contrato de T-009, que no cambia.
- **D11 · Las pruebas nuevas usan un paciente propio (PCOT)**, no PCAD. E cuenta «tres versiones»
  de PCAD, y D ya está afinada a esa cadena.
- **Nota sobre el ADR-057.** Su texto dice que un `alcance` alterado «rompe la huella de esa
  versión y el verificador lo señala». Con este diseño la huella **no** se rompe: el sobre sigue
  intacto. Lo que el verificador señala es que la fila ya no coincide con lo sellado. El propietario
  decidió el 24-09 que eso cumple el ADR, y la consecuencia que importa («el verificador lo
  señala») queda cierta. No se escribe ningún ADR nuevo.

---

## 3 · Cómo se cierra cada criterio de aceptación

| # | Comprobación |
|---|---|
| 1 | `npx supabase db reset` → `Finished supabase db reset`, sin errores. |
| 2 | **Orden de trabajo obligatorio.** (i) Se escribe la sección F (y los `\set` e inserts de cabecera) **sin** tocar D.1 y **sin** crear la migración. (ii) `db reset` + `npm run test:rls`: exit ≠ 0, y la primera línea `ASERCIÓN FALLIDA` es `F.1 · alcance cambiado por debajo…`, porque el verificador de T-005 da `NULL` en `array_agg`. F.0 pasa antes. (iii) Se crea la migración, `db reset`, `test:rls`: ahora falla D.1 (`count = 1` esperaba 2, o la subconsulta escalar devuelve más de una fila), y eso demuestra que la rama nueva también ve la manipulación del cuerpo del sobre. (iv) Se adapta D.1 y queda verde. Las salidas de (ii) y (iii) van a `evidencia.json`. |
| 3 | `npm run test:rls` exit 0, con las líneas `OK: F.0 …` a `OK: F.11 …`, D.1 adaptada y D.2 8.2 con su motivo. |
| 4 | Aserciones F.1 (motivo@posición exactos y huella intacta) y su restauración a 0. |
| 5 | Aserciones F.2–F.9. |
| 6 | (a) `F.0 · gemela positiva`; (b) `F.0 · zona`; (c) F.10; (d) D.2 8.1 sin cambios, en verde. |
| 7 | `npx supabase db reset && npm run seed && npm run verificar:huellas` → `verificar:huellas — cadena íntegra: cero anomalías.` (exit 0); `npm run verificar:huellas -- --json` → `[]`. |
| 8 | **Guion manual** sobre la base sembrada, en `psql` como `postgres` (`docker exec -i <contenedor supabase_db_…> psql -U postgres -d postgres`):<br>`grant update on public.notas_clinicas_versiones to postgres;`<br>`alter table public.notas_clinicas_versiones disable trigger impedir_modificacion_notas_clinicas_versiones;`<br>`update public.notas_clinicas_versiones set alcance = 'conjunta' where id = (select id from public.notas_clinicas_versiones where alcance = 'individual' order by paciente_id, posicion_cadena limit 1) returning id, paciente_id, posicion_cadena;`<br>(se dejan los cerrojos levantados hasta restaurar) → `npm run verificar:huellas`: exit 1, `1 anomalía(s) en 1 cadena(s)`, línea con ese paciente, versión, nota y fecha, y `— sobre_no_coincide_con_fila`. → `-- --json`: array de 1 elemento con `"motivo": "sobre_no_coincide_con_fila"`. → `-- --paciente <uuid>`: lo mismo. → Segunda manipulación en la **misma** cadena: `update … set cuerpo = '{"x":1}' where id = <la misma u otra versión de ese paciente>` → `npm run verificar:huellas` enseña la línea `y N anomalía(s) más en esta cadena: …`. → Se restauran los dos valores originales, `enable trigger`, `revoke update … from postgres` → `cadena íntegra: cero anomalías.` (exit 0). La transcripción va a la evidencia. |
| 9 | Aserción `F.0 · permisos`. |
| 10 | Tras el `db reset` final: `npm run tipos` y `git diff --exit-code lib/supabase/tipos-bd.ts` → exit 0. |
| 11 | `npm test`, `npm run lint`, `npm run lint:migraciones` (14 migraciones limpias), `npm run build`, `node ~/.claude/pipeline/territorio.mjs T-012b`. |

---

## 4 · Riesgos, por probabilidad

1. **Alta, esperado: D.1 se rompe al aplicar la migración.** Pasa de 1 a 2 filas, y la subconsulta
   escalar de `posicion_cadena` lanza «more than one row returned by a subquery». Se adapta como dice
   §1.2. El orden de §3 fila 2 hace que se vea primero el rojo de F.1 y después el de D.1.
2. **Media: los módulos 15–17 cuentan pacientes de PRO1.** Si alguno cuenta todos los pacientes de
   PRO1, PCOT le cambia la cuenta. PDEMO y PVEC ya existen y no rompieron nada, pero hay que
   comprobarlo con `grep -n "count" scripts/rls/1[5-7]*.sql` antes de darlo por bueno y ejecutar el
   banco entero, también sobre la base sembrada.
3. **Media: choque de sello de migración.** Si T-014 u otro ticket integra antes una migración con
   sello ≥ `20260924150000`, `supabase migration up` en CI (incremental) rechaza una migración
   intercalada. Se renumbra antes del merge.
4. **Baja: `pg_input_is_valid` puede lanzar en vez de devolver `false`** con algún error de entrada
   jsonb que no sea «suave» (el candidato es U+0000, `22P05`). Se comprueba en revisión (§5). En el
   peor caso el verificador aborta de forma visible (exit 1), nunca en silencio.
5. **Baja: el implementador cambia el tipo de retorno.** `create or replace` falla en el `db reset`
   con «cannot change return type». Es un fallo visible. El peligro real sería «arreglarlo» con
   `drop function`: F.0 · permisos lo atrapa.
6. **Baja: la zona horaria.** Sin `at time zone 'UTC'`, todas las filas salen divergentes en una
   sesión que no esté en UTC. La gemela `F.0 · zona` lo atrapa.
7. **Baja: el rendimiento.** Cada ejecución nocturna parsea dos jsonb por fila. Es O(n) y
   despreciable para un centro.
8. **Baja: el guardarraíl de territorio en el árbol principal.** `territorio.mjs` cuenta los
   ficheros sin seguimiento (`.claude/agent-memory/`, `docs/metricas/`,
   `scratchpad_factor_resp.json`), así que el ticket se implementa en un worktree.

---

## 5 · Qué revisar

**Entradas.** El llamante solo elige `p_paciente_id`: `null` recorre todas las cadenas y
`--paciente` se valida como UUID antes de interpolarse (`verificar-huellas.mjs:21,36-40`, sin
cambios). Solo lo ejecuta `postgres`. Las entradas hostiles son **los valores de la fila**
cuando alguien levanta los cerrojos, o cuando inserta con `sellar_version_nota` apagado.

1. **Firma idéntica y `create or replace`**, nunca `drop`. Mismo orden y tipo en las seis
   columnas de retorno. `tipos-bd.ts` sin diff. `F.0 · permisos` en verde.
2. **Cada una de las nueve comparaciones es la del disparador** (tabla H4). Hay que cotejarlas una
   a una contra `20260915130000_…:180-286`. En concreto:
   - `anotaciones_reservadas` y `motivo_cambio` usan `coalesce(to_jsonb(col), 'null'::jsonb)` con
     `is distinct from`. **F.5 es la prueba que discrimina**: si se reescribe a
     `(c.sobre ->> 'anotaciones_reservadas') <> c.anotaciones_reservadas`, F.5 da `NULL` en
     `array_agg` y falla con `ASERCIÓN FALLIDA: F.5 …`. Si se reescribe con
     `coalesce(…, '')`, la que falla es **F.4**.
   - `cuerpo` se compara **como jsonb**. Si se compara como texto
     (`c.sobre ->> 'cuerpo' <> c.cuerpo`), falla **D.2 8.1** (1 fila en vez de 0) y todas las
     filas del banco, cuyo `cuerpo` sale de `jsonb::text` con espacios, salen divergentes (F.10).
   - `creada_en` y `firmada_en` se comparan con el mismo `to_char(… at time zone 'UTC', …MS"Z")`.
     Sin `at time zone`, falla `F.0 · zona`. Con precisión de segundos, falla F.9.
   - `alcance` con `is distinct from to_jsonb(alcance::text)`: sin esa línea, falla **F.1**.
3. **El cast va protegido por `CASE`**, no por un `and pg_input_is_valid(…)` en el `where`: el
   planificador puede reordenar un `AND`, pero no el `CASE`. Comprobar a mano que
   `select pg_input_is_valid('{"a":"\u0000"}', 'jsonb')` devuelve `false` y no lanza.
4. **`c.algoritmo_version = 1`** está en la rama nueva.
5. **F.1 prueba lo que dice.** La huella de la fila sigue cuadrando (aserción de `digest`), y la
   salida roja de §3 fila 2 (ii) se ha producido con el verificador de T-005. Sin esa salida, F.1
   no está demostrada.
6. **Los cerrojos vuelven a su sitio** al final de F: `revoke update` y trigger `'O'` con sus
   dos aserciones. Si no, los módulos 15–17 heredan una tabla actualizable por `postgres`.
7. **Las otras puertas.**
   - Una fila **insertada** con el disparador de sellado apagado: F.11 (PDEMO).
   - Un NULL en el sobre frente a una cadena en la fila, y al revés: F.4–F.7.
   - Filas duplicadas en la salida: una versión puede dar a la vez `huella_no_coincide` y
     `sobre_no_coincide_con_fila` (D.1); es correcto y el CLI lo agrupa.
   - Concurrencia: no aplica, porque la función es `stable` y lee una sola instantánea.
   - Permisos de tabla entera y TRUNCATE: no aplican, porque la migración no toca grants de tabla.
   - `EXECUTE` a roles de la API: punto 1.
8. **CLI.** El `jsonb_agg` ordena también por `motivo`. La línea «y N anomalía(s) más» solo aparece
   si N > 0. La forma de `--json` y los códigos de salida no cambian.
9. **Nada fuera de territorio.** Ni `lib/huella/**`, ni `fn_sellar_version_nota()`, ni la forma
   del sobre. En `docs/architecture.md`, una sola frase.

---

## 6 · Territorio

El que declara el contrato:

```
supabase/migrations/*_verificador_coteja_sobre_y_fila.sql
scripts/rls/14-cadena-huellas.sql
scripts/rls/README.md
scripts/verificar-huellas.mjs
docs/architecture.md
```

Además, las rutas comunes que `territorio.mjs` permite siempre: `tickets/T-012b/**`,
`docs/bitacora/**` y `docs/state.md`. `lib/supabase/tipos-bd.ts` queda **fuera a propósito**:
si cambia, es que la firma cambió (§5 punto 1).

---

## 7 · Delegable

**Nada.** Todo tiene comportamiento: SQL del verificador, banco de pruebas de la cadena y
salida del CLI que consume la ejecución nocturna. Las nueve negativas de F son repetitivas, pero
son banco de RLS y cadena de huellas, que según `.claude/rules/pipeline.md` hace la fábrica.

---

## 8 · Pregunta para el propietario (no bloquea este ticket; sí conviene antes de T-012)

La lectura de una versión la deciden `alcance`, que ya está sellado, **y** la cabecera a la que
apunta `nota_id`: `autor_id`, `paciente_id` y `episodio_id` de `notas_clinicas` (H8). `nota_id`
**no está en el sobre**. Con los cerrojos levantados, `update … set nota_id = <otra nota del mismo
paciente en otro episodio>` sobre una versión `conjunta` cambia qué profesionales la leen, y ni la
huella ni este cotejo lo ven. Es el mismo adversario que el ADR-057.

Sellarlo cuesta `esquema_version = 4` y solo es gratis **antes de la primera firma real**, la de
T-012, igual que lo fue el ADR-057. ¿Se sella `nota_id` (y con él la cabecera congelada) en un ADR
y un ticket propios antes de T-012, o se acepta el riesgo por escrito? T-012b no cambia en ninguno
de los dos casos: el cotejo gana una línea si entra.

---

## Lo que no entra, y por qué

- **La forma del sobre, `fn_sellar_version_nota()` y `lib/huella/**`.** No hace falta tocarlos para
  detectar, y cambiarlos es otra era (ADR-035).
- **El comentario viejo dentro de `fn_sellar_version_nota()`**
  (`20260915130000_…:161-163`) que dice que el verificador no detecta un `alcance` alterado. Queda
  desfasado, pero corregirlo exige redefinir la función de sellado. Se anota en `docs/state.md`
  §Hallazgos.
- **Una columna de detalle con qué campos divergen** (D3).
- **Reescribir la cadena entera** (cambiar el sobre y recalcular esa huella y todas las
  siguientes) **y truncar la cola.** Para eso hace falta un anclaje externo de la huella de
  cabeza, y es otra decisión.
- **Qué hacer cuando aparece `sobre_no_coincide_con_fila`** (procedimiento de respuesta y posible
  notificación de brecha): es de operación y de T-009.
- **Los hallazgos M2, B2–B6 de T-012a y B1** (`docs/architecture.md` en once claves): son de otros
  tickets.
- **`tickets/T-012-nota-clinica-firma.md` `depende_de`**: debería incluir T-012b. Lo edita el
  propietario o el orquestador, no este diseño.
