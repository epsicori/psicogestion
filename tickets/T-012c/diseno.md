# T-012c · Diseño: nota_id (y la cabecera que decide la lectura) en el sobre, era 4

Arquitecto · 29-09-2026 · Contrato: `tickets/T-012c-nota-id-en-el-sobre.md` · ADR-035, ADR-046, ADR-057 y ADR-067.

> **Aviso**: el propietario decidió el 29-09-2026 (ADR-071) sobre P1, P2, P4 y P5. Esas decisiones
> **mandan sobre este texto** y se recogen en §9 (enmienda). Donde choquen, gana §9.

Lo que no se pudo abrir antes de escribir va marcado **[sin verificar]**. El implementador lo comprueba primero. Si no se cumple, escala; no improvisa.

---

## 0 · Hechos verificados contra el código

| # | Hecho | Ruta |
|---|---|---|
| H1 | `ESQUEMA_VERSION = 3`, `ALGORITMO_VERSION = 1`. `esquemaSobre` es `.strict()` con doce claves. `EntradaFirma` ya trae `notaId`, pero `sinNormalizar` no lo usa. `autor_id` pasa a minúsculas y `cita_id` no. El orden es NFC y después Zod. | `lib/huella/sobre.ts:26-117` |
| H2 | `firmarVersionNota` manda `nota_id` y no manda `paciente_id`. No hay llamantes de `construirSobre` ni de `firmarVersionNota` fuera de `lib/huella` y sus pruebas (grep en app, lib, components y scripts). | `lib/huella/firmar.ts:34-61` |
| H3 | `sobre.test.ts` contiene `entradaBase`, `sobreBase`, «doce claves», la prueba de `esquema_version` 3 y la de reordenado con doce. | `lib/huella/sobre.test.ts:16-187` |
| H4 | `vectores.test.ts` fija nueve nombres y la era vigente por vector. Reproduce con `canonizar(normalizarNfc(sobre))` y no valida con Zod. | `lib/huella/vectores.test.ts:33-72` |
| H5 | Los nueve vectores son de la era 3. `genesis-minimo` lleva el autor `11111111-1111-4111-8111-111111111111`. | `lib/huella/vectores-congelados.json` |
| H6 | En el disparador de la era 3: `v_esperadas` tiene doce claves ordenadas. El paso 2 lee `n.paciente_id` sin cerrojo. Las 6.1-6.10 lanzan 23514 y las guardas 1 y 1.bis lanzan 42501. El párrafo desfasado está en 161-163. El DEFAULT y el comentario de la columna dicen 3. | `supabase/migrations/20260915130000_alcance_en_el_sobre.sql` |
| H7 | El verificador es una CTE sin join a `notas_clinicas`. Filtra por `v.paciente_id`. La rama `sobre_no_coincide_con_fila` compara una línea por clave (140-147) y da una fila por versión. Lleva `revoke all` para public, anon, authenticated y service_role. | `supabase/migrations/20260924150000_verificador_coteja_sobre_y_fila.sql` |
| H8 | `congelar_cabecera_sellada` prohíbe cambiar paciente, fecha_sesion, autor, episodio y cita si ya hay versión, con 42501. Su mensaje dice que el sobre «sella esos campos». | `20260906120000_agenda_esquema.sql:405-436` |
| H9 | `notas_clinicas.episodio_id` es nulable. La FK no tiene `on delete`. `fn_exigir_episodio_en_nota_conjunta` es la regla para las conjuntas. El `revoke` de `fn_congelar` está en :1331. | `20260822094547_*.sql:618, 1302, 1331` |
| H10 | La RLS de lectura de versiones decide por la cabecera: `n.autor_id`, `es_profesional_asignado(n.paciente_id)` y `es_profesional_del_episodio(n.episodio_id)`. | `20260822160000_rls_funciones_y_politicas.sql:1152-1167` (según el contrato) |
| H11 | El módulo 14 tiene 1288 líneas. Fijaciones: PCAD/NCADX-C, PDEMO/NDEMO, PVEC/NVEC (`d0050001-…-000000000008` / `f0050001-…-000000000008`, autor ANA) y PCOT/NCOT. La sección B tiene tres `$vec$` y `VECGENESIS`, que se inserta como versión de NVEC. La C tiene literales con el UUID de PRO1. Después corren 15 y 16. | `scripts/rls/14-cadena-huellas.sql:1-165` |
| H12 | El banco corre en una sola transacción con ON_ERROR_STOP. Las variables de psql no se sustituyen dentro de `$$`. | `scripts/test-rls.mjs`, `00-ayudantes.sql` |
| H13 | `pg_get_functiondef` es ejecutable tal cual. `create or replace` conserva la ACL. `prosrc` guarda CRLF. | sesión anterior |

Sin verificar:
- **V1**: la firma exacta de `pg_temp.sobre_prueba()` y cuántos llamantes tiene en 01, 04 y 14 (unas 24 llamadas en 14).
- **V2**: que la primera versión insertada sea la de NCONJ en `01-fijacion.sql`, y que exista `pg_temp.assert_no_lanza(sql, rotulo)`.
- **V3**: la forma del generador en `seed-completo.sql` y en `t005-concurrencia.sql`.
- **V4**: qué otros disparadores de `notas_clinicas` saltan al actualizar paciente, episodio o autor.
- **V5**: si la fusión de pacientes (ADR-031) mueve notas con versiones.
- **V6**: si alguna inserción del banco, de la siembra o de t005 usa un autor de versión distinto del de la cabecera.
- **V7**: la numeración actual de F y qué línea muta hoy F.9b.
- **V8**: las reglas de `lint-migraciones.ts`.

---

## 1 · Piezas y contratos

### 1.1 · El sobre de la era 4 (D3)
Quince claves, en el orden de `array_agg(k order by k)`, que es el mismo en C y en en_US:
`abierta_en, alcance, anotaciones_reservadas, autor_id, cita_id, creada_en, cuerpo, episodio_id, esquema_version, firmada_en, margen_sesion_minutos, motivo_cambio, nota_id, paciente_id, redactada_en_sesion`

| Clave nueva | Tipo | Valor | Cotejo |
|---|---|---|---|
| `nota_id` | UUID en minúsculas, no nulable | `versiones.nota_id` | columna de la versión |
| `paciente_id` | UUID en minúsculas, no nulable | `notas_clinicas.paciente_id` | cabecera y copia `versiones.paciente_id` |
| `episodio_id` | UUID en minúsculas **o null** (P1) | `notas_clinicas.episodio_id` | cabecera |

`autor_id` no cambia de forma. Además se coteja con `notas_clinicas.autor_id` (D2).

### 1.2 · `lib/huella/sobre.ts`
- `ESQUEMA_VERSION = 4`. `ALGORITMO_VERSION` no se toca. El comentario de cabecera pasa a «quince claves» y añade la decisión 7 (ADR-067).
- `EntradaFirma` gana `pacienteId: string` y `episodioId: string | null`, los dos obligatorios. Se leen de la cabecera que se firma.
- `esquemaSobre` añade `episodio_id: uuidMinusculas.nullable()`, `nota_id: uuidMinusculas` y `paciente_id: uuidMinusculas`.
- `sinNormalizar` añade `episodio_id: entrada.episodioId === null ? null : entrada.episodioId.toLowerCase()`, `nota_id: entrada.notaId.toLowerCase()` y `paciente_id: entrada.pacienteId.toLowerCase()`.
- `firmar.ts` no cambia: ya manda `nota_id`, y ni paciente ni episodio son columnas del payload. Además está fuera del territorio. La Server Action de T-012 queda obligada por el tipo.

### 1.3 · Migración `supabase/migrations/<sello>_nota_id_en_el_sobre.sql`
El sello tiene que ser posterior a `20260925120000`.
1. **Guarda de era** con el patrón de T-012a. El mensaje empieza exactamente por `'T-012c (nota_id en el sobre) se instala sobre una tabla notas_clinicas_versiones VACÍA. '` y explica que pasar de 3 a 4 cambia las claves de la 6.1 y que los datos los decide una persona.
2. **`create or replace` de `fn_sellar_version_nota()`**, con el cuerpo íntegro de `20260915130000:44-308` y solo estos cambios:
   - `v_esperadas` pasa a las quince claves. Se declaran `v_episodio_id uuid` y `v_autor_cabecera uuid`.
   - El paso 2 queda así: `select n.paciente_id, n.episodio_id, n.autor_id into strict v_paciente_id, v_episodio_id, v_autor_cabecera from public.notas_clinicas n where n.id = new.nota_id for share;` (D5).
   - El comentario del paso 6 cuenta «catorce» comprobaciones y «quince» claves. Se **borra** el paréntesis «Mismo motivo por el que tampoco detecta un `alcance` …». En su lugar va: «El verificador coteja desde T-012b cada clave sellada con su columna, y desde T-012c también con la cabecera notas_clinicas.»
   - El mensaje de la 6.1 cita `ADR-035/046/057/067` y conserva «exactamente las claves».
   - Después de la 6.10 van cuatro comprobaciones nuevas, todas con errcode 23514 y `is distinct from` sobre jsonb. **Cada condición cabe en una línea**:
     - 6.11: `if (v_contenido -> 'nota_id') is distinct from to_jsonb(new.nota_id::text) then` → `'El nota_id del sobre no coincide con la columna nota_id, o no es una cadena (T-012c, ADR-067)'`
     - 6.12: `if (v_contenido -> 'paciente_id') is distinct from to_jsonb(v_paciente_id::text) then` → `'El paciente_id del sobre no coincide con el paciente de la cabecera notas_clinicas, o no es una cadena (T-012c, ADR-067)'`
     - 6.13: `if (v_contenido -> 'episodio_id') is distinct from coalesce(to_jsonb(v_episodio_id::text), 'null'::jsonb) then` → `'El episodio_id del sobre no coincide con el episodio de la cabecera notas_clinicas (null si no tiene), o no es una cadena ni null (T-012c, ADR-067)'`
     - 6.14: `if (v_contenido -> 'autor_id') is distinct from to_jsonb(v_autor_cabecera::text) then` → `'El autor_id del sobre no coincide con el autor de la cabecera notas_clinicas (T-012c, ADR-067)'`
   - Se repite `revoke all on function public.fn_sellar_version_nota() from public, anon, authenticated, service_role;`.
3. **`create or replace` de `verificar_cadena_huellas(p_paciente_id uuid default null)`**, con la misma firma, el mismo retorno, `sql stable security definer search_path=''` y las seis ramas.
   - La CTE hace `from public.notas_clinicas_versiones v left join public.notas_clinicas n on n.id = v.nota_id` y añade `n.paciente_id as cab_paciente_id`, `n.episodio_id as cab_episodio_id` y `n.autor_id as cab_autor_id`. Hay que calificar con `v.` lo que se vuelva ambiguo. El `where` sigue filtrando por `v.paciente_id`.
   - La rama `sobre_no_coincide_con_fila` añade cinco líneas, cada una con un fragmento derecho único:
     - `or (c.sobre -> 'nota_id') is distinct from to_jsonb(c.nota_id::text)` -- 6.11
     - `or (c.sobre -> 'paciente_id') is distinct from to_jsonb(c.paciente_id::text)` -- 6.12, fila
     - `or (c.sobre -> 'paciente_id') is distinct from to_jsonb(c.cab_paciente_id::text)` -- 6.12, cabecera
     - `or (c.sobre -> 'episodio_id') is distinct from coalesce(to_jsonb(c.cab_episodio_id::text), 'null'::jsonb)` -- 6.13
     - `or (c.sobre -> 'autor_id') is distinct from to_jsonb(c.cab_autor_id::text)` -- 6.14 (D2)
   - Con el `left join`, una cabecera ausente da `cab_paciente_id` null y la versión se señala.
   - El `comment on function` se actualiza: coteja con la fila y con la cabecera (ADR-067) y sigue dando «una fila por versión divergente». Se repite el `revoke`.
4. **`create or replace` de `fn_congelar_cabecera_sellada()`** (D6). Es el cuerpo íntegro de `20260906120000:405-436` y solo cambia el mensaje: `'La cabecera de una nota ya firmada no se puede reatribuir (paciente, fecha de sesión, autor, episodio o cita). Paciente, autor, episodio y cita los sella el sobre canónico y los coteja verificar_cadena_huellas(); la fecha de sesión solo la protege este disparador (ADR-035/046/067)'`. El errcode sigue en 42501. Se repite su `revoke` como en `20260822094547:1331`. [sin verificar] Si alguna prueba exige el mensaje viejo, se ajusta el fragmento.
5. `alter table public.notas_clinicas_versiones alter column esquema_version set default 4;`
6. El `comment on column … esquema_version` empieza por `'Forma del sobre canónico. 4 desde el ADR-067 (nota_id, paciente_id y episodio_id dentro del sobre firmado, T-012c); 3 desde el ADR-057 …'` y dice que las versiones 1-3 nacen muertas.

No cambian tablas, columnas ni firmas, así que `tipos-bd.ts` queda igual.

### 1.4 · Vectores
- Los nueve ganan `"nota_id":"f0050001-0000-4000-8000-000000000008"` (NVEC), `"paciente_id":"d0050001-0000-4000-8000-000000000008"` (PVEC) y `"esquema_version":4`.
- Ocho llevan `"episodio_id":null`. `alcance-conjunta` lleva `"episodio_id":"e0050001-0000-4000-8000-000000000008"`, que nunca se inserta.
- `genesis-minimo` tiene que llevar NVEC, PVEC y null, porque se inserta como versión de NVEC.
- `canonico` y `huella_hex` se recalculan con un guion de un solo uso en el directorio temporal que no se comitea.
- En 14 se actualizan los tres `$vec$` y `\set VECGENESIS`.

### 1.5 · Generadores de sobres
- `pg_temp.sobre_prueba(p_nota_id uuid, …)`: `p_nota_id` va primero y sin valor por defecto. El resto de parámetros sigue detrás, en su orden [V1].
- `paciente_id` y `episodio_id` se leen de `notas_clinicas` con `where id = p_nota_id` e `into strict`.
- Emite las quince claves y la era 4.
- Se actualizan todos los llamantes de 01, 04 y 14. `seed-completo.sql` y `t005-concurrencia.sql` siguen el mismo contrato [V3].

### 1.6 · Banco `14-cadena-huellas.sql`
**Fijación nueva**, arriba del todo. Los UUID son propuestos y hay que confirmar con grep que no chocan:
- `P067` = `d0670001-0000-4000-8000-000000000001`, paciente de PRO1.
- `PMOV` = `…0002`, paciente sin versiones.
- `EPI067A` y `EPI067B` = `e0670001-0000-4000-8000-00000000000{1,2}`, episodios de P067 (copiar el insert del episodio de NCONJ en 01).
- `N067A` = `f0670001-…-0001`: EPI067A, una versión conjunta.
- `N067B` = `…0002`: EPI067B, sin versiones.
- `N067C` = `…0003`: sin episodio, una versión individual.
- `N067D` = `…0004`: EPI067A, sin versiones.
- Todas son de P067 y PRO1.

**Ayudantes locales** en `pg_temp`:
- `t012c_mutar(p_original text, p_fragmento text, p_reemplazo text)` exige que el fragmento aparezca exactamente una vez; si no, lanza. Después ejecuta `replace(...)`.
- `t012c_restaurar(p_original text, p_firma regprocedure)` ejecuta el original y afirma que `pg_get_functiondef(p_firma) = p_original`.
- Captura de los originales:
  - `select pg_get_functiondef('public.verificar_cadena_huellas(uuid)'::regprocedure) as verif_original \gset`
  - `select pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure) as sellar_original \gset`
  - Se usan como `:'verif_original'` y `:'sellar_original'`.

**Sección C**:
- Todas las negativas con literal ganan `"nota_id":"f0050001-0000-4000-8000-000000000000"`, `"paciente_id":"d0050001-0000-4000-8000-000000000001"` y `"episodio_id":null`, pasan a la era 4 y usan `assert_lanza_codigo_msg` con el fragmento propio de cada una. También las de 42501 y 22P05.
- Negativas nuevas, todas 23514 con fragmento de mensaje:

| Caso | Nota | Qué se altera | Fragmento |
|---|---|---|---|
| C.11a | NCADX | nota_id = NCADA | «El nota_id del sobre no coincide» |
| C.11b | NCADX | nota_id null | «El nota_id del sobre no coincide» |
| C.12a | NCADX | paciente_id = PDEMO | «El paciente_id del sobre no coincide» |
| C.12b | NCADX | paciente_id null | «El paciente_id del sobre no coincide» |
| C.13a | NCADX | episodio_id = EPI067A | «El episodio_id del sobre no coincide» |
| C.13b | N067A | episodio_id null | «El episodio_id del sobre no coincide» |
| C.13c | NCADX | episodio_id = 5 | «El episodio_id del sobre no coincide» |
| C.14 | NCADX | autor PRO2 en el sobre y en la columna | «no coincide con el autor de la cabecera» |
| C.era3 | NCADX | doce claves, era 3, columna en 3 | «exactamente las claves» |

- **Guarda de 6.11-6.14**: `savepoint t012c_m`, luego `t012c_mutar(:'sellar_original', frag, reemplazo)`. La negativa (a) ahora **se sella** (`assert_no_lanza`). Después `rollback to savepoint t012c_m` y se afirma que la definición es igual a `:'sellar_original'`. Sustituciones:

| Comprobación | Fragmento | Se reemplaza por |
|---|---|---|
| 6.11 | `to_jsonb(new.nota_id::text) then` | `(v_contenido -> 'nota_id') then` |
| 6.12 | `to_jsonb(v_paciente_id::text) then` | `(v_contenido -> 'paciente_id') then` |
| 6.13 | `coalesce(to_jsonb(v_episodio_id::text), 'null'::jsonb) then` | `(v_contenido -> 'episodio_id') then` |
| 6.14 | `to_jsonb(v_autor_cabecera::text) then` | `(v_contenido -> 'autor_id') then` |

- Gemelas positivas: se sellan la versión conjunta de N067A (el sobre dice EPI067A) y la individual de N067C (con null). NCADX sigue sin versiones.

**Sección F** (numerada tras el último F.n existente [V7]). Cada escenario usa los cerrojos como en T-012b, restaura y afirma `verificar_cadena_huellas(:P067) = 0`.
- **F.12** (criterio 4): `update versiones set nota_id = :N067B where nota_id = :N067A` (mismo paciente, otro episodio). Da **exactamente una fila**: esa versión, con `sobre_no_coincide_con_fila`. En la **misma** aserción se comprueba `digest(convert_to(contenido_canonico,'UTF8')||huella_anterior,'sha256') = huella`. Restaurado, 0.
- **F.12b**: `set nota_id = :N067D` (mismo episodio y autor): una fila. Si se muta `to_jsonb(c.nota_id::text)` → `(c.sobre -> 'nota_id')`, da 0. Luego se restaura con la afirmación de igualdad.
- **F.13**: `disable trigger congelar_cabecera_sellada`, luego `N067A.paciente_id = :PMOV`: una fila. El mutante `to_jsonb(c.cab_paciente_id::text)` → `(c.sobre -> 'paciente_id')` da 0.
- **F.14**: (a) `N067A.episodio_id = :EPI067B`: una fila. (b) `N067C.episodio_id` de null a `:EPI067B`: una fila. El mutante `coalesce(to_jsonb(c.cab_episodio_id::text), 'null'::jsonb)` → `(c.sobre -> 'episodio_id')` da 0 en (a).
- **F.15**: `N067A.autor_id = :PRO2`: una fila. El mutante `to_jsonb(c.cab_autor_id::text)` → `(c.sobre -> 'autor_id')` da 0.
- **F.16**: `update versiones set paciente_id = :PMOV where paciente_id = :P067` (la cadena entera). `verificar_cadena_huellas(:PMOV)` da una fila `sobre_no_coincide_con_fila` por cada versión (2) y ningún otro motivo. El mutante `to_jsonb(c.paciente_id::text)` → `(c.sobre -> 'paciente_id')` da 0.
- **F.17** (criterio 7): `set time zone 'Pacific/Kiritimati'`. `verificar(:P067) = 0` y `verificar()` solo devuelve PDEMO. Al final, `reset time zone`.
- Si otro disparador bloquea los `update` de F.13-F.15 [V4], se apaga también y se nombra. Nunca se tocan los datos para esquivarlo.

**F.9b (N1)**: se borra la copia escrita a mano. Se usa `\gset` de `verif_original` antes del mutante, y el mutante sale de `t012c_mutar` con la misma semántica que tiene hoy [V7]. Se restaura con `t012c_restaurar(..., 'public.verificar_cadena_huellas(uuid)'::regprocedure)` y el rótulo `'F.9b · N1: la definición restaurada es idéntica a la guardada antes del mutante'`.

### 1.7 · `01-fijacion.sql` (criterio 2)
La primera inserción de versión (NCONJ) [V2] se envuelve en `pg_temp.assert_no_lanza(format($f$insert … values (%L, …)$f$, :NCONJ, …), 'T-012c · NCONJ (primera firma de la fijación) se sella con un sobre de la era 4')`. Las variables de psql van como argumentos de `format`, nunca dentro de `$$`.

### 1.8 · Pruebas TS
- En `sobre.test.ts`:
  - `entradaBase` gana `pacienteId: '55555555-5555-4555-8555-555555555555'` y `episodioId: null`, y `sobreBase` las tres claves nuevas.
  - Las pruebas:
    - Quince claves literales y era 4.
    - Sensibilidad de `notaId` en el canónico **y** en la huella (sha256 de utf8 más 32 ceros con node:crypto).
    - Sensibilidad de `pacienteId` y de `episodioId` (null frente a uuid).
    - Paso de mayúsculas a minúsculas.
    - Zod rechaza `nota_id` null, `paciente_id` null y la falta de `nota_id`, y acepta `episodio_id` null.
    - La prueba de reordenado con quince claves.
- En `vectores.test.ts`: se mantienen los nueve nombres. Se añade que `esquemaSobre.parse(normalizarNfc(v.sobre))` no lance para ningún vector y que `alcance-conjunta` tenga `episodio_id` no nulo.
- `vectores-sql.test.ts` no se toca y tiene que seguir en verde.

### 1.9 · Documentación
- `docs/architecture.md:62-66` y `:91`: quince claves y era 4. En el párrafo del verificador, el cotejo con la fila y con la cabecera por `left join`. Se nombra como riesgo aceptado que `fecha_sesion` no está sellada.
- `scripts/rls/README.md`: la fila del módulo 14.

---

## 2 · Decisiones y alternativas descartadas
- **D1 = (b)**: se sellan nota_id, paciente_id y episodio_id. Los tres abren la RLS de lectura, y la cadena no cubre ninguno porque se particiona por la copia, no por la cabecera (F.16). Descartes:
  - (a): deja abierto el cambio de episodio de la cabecera.
  - Sellar el episodio solo en las conjuntas: rompe la forma fija.
- **D2 = sí**: se coteja el autor de la cabecera en el verificador y también en el disparador (6.14), para que los dos exijan la misma invariante. Descartada una clave redundante en el sobre.
- **D3**: quince claves, con `episodio_id` siempre presente y null si no hay episodio. El vector que lo ejerce es `alcance-conjunta`.
- **D4**: `sobre_prueba` deriva paciente y episodio de la cabecera y solo añade `p_nota_id`. Descartados tres parámetros nuevos: triplican los cambios sin nada que probar.
- **D5**: `for share` en el paso 2 cierra la carrera entre la primera firma y un `update` concurrente de la cabecera. Descartado no bloquear, porque deja falsos «manipulado».
- **D6**: el mensaje de `congelar_cabecera_sellada` se corrige aquí. Descartado dejarlo, porque seguiría siendo falso sobre la fecha.
- **D7**: `left join`, porque un `join` ocultaría las versiones huérfanas.
- **D8**: los mutantes cambian un fragmento derecho único por la parte izquierda, y la condición queda como `x is distinct from x`. Descartado quitar la línea entera, porque con CRLF se rompe.
- **D9**: los mutantes del disparador se deshacen con `rollback to savepoint`; los del verificador, restaurando desde la variable (N1).

## 3 · Cierre de cada criterio
1. `npx supabase db reset` sale con exit 0 y `npm run seed` funciona.
2. Se saca la migración de su carpeta, se hace `db reset` y se corre `npm run test:rls`: exit distinto de 0, y la primera aserción que falla es «T-012c · NCONJ (primera firma de la fijación) se sella con un sobre de la era 4», por la 6.1 de la era 3. La salida se pega en la evidencia y el fichero vuelve a su sitio.
3. `db reset` y `test:rls` dan exit 0, con 00-16 en verde.
4. F.12, con una sola aserción que cubre la fila única, el motivo y la huella. Restaurado, 0.
5. C.11a/b, C.12a/b, C.13a/b/c, C.14 y C.era3, todas con `_msg`, más sus gemelas y los mutantes 6.11-6.14.
6. D1 sella la cabecera: F.13, F.14 y F.15, cada uno con su restauración a 0 y su mutante.
7. F.17 en Kiritimati, más la aserción final (solo PDEMO).
8. `grep -nE "create (or replace )?function (public\.)?verificar_cadena_huellas" scripts/rls/14-cadena-huellas.sql` no devuelve nada, y existe la aserción de igualdad de F.9b.
9. `npm test` pasa `sobre.test.ts`, `vectores.test.ts` y `vectores-sql.test.ts`.
10. `begin; \i <migración> rollback;` sobre la base sembrada muestra «T-012c (nota_id en el sobre) se instala sobre una tabla notas_clinicas_versiones VACÍA». El cliente psql del proyecto está sin verificar.
11. `db reset`, `seed` y `verificar:huellas` dan «cadena íntegra: cero anomalías.» con exit 0, y `--json` devuelve `[]`.
12. `grep -n "tampoco detecta un" supabase/migrations/*_nota_id_en_el_sobre.sql` no devuelve nada, y `col_description` de `esquema_version` empieza por «Forma del sobre canónico. 4».
13. `npm run tipos && git diff --exit-code lib/supabase/tipos-bd.ts`, `lint`, `lint:migraciones`, `build` y `territorio.mjs T-012c`.

## 4 · Riesgos, por probabilidad
1. **Alta.** Un literal de C con la forma vieja muere en la 6.1 y da verde por el motivo equivocado. Mitigación: toda la sección C con `_msg`.
2. **Media.** Otro disparador de `notas_clinicas` bloquea F.13-F.15 [V4]. Se apaga y se nombra.
3. **Media.** Alguna inserción usa como autor de la versión uno distinto del de la cabecera [V6]. La 6.14 rompe entonces el reset o el seed. Se hace grep antes; si es legítima, se escala.
4. **Media.** El CRLF rompe un `replace`. Mitigación: fragmentos de una línea y exigir que aparezcan una vez exacta.
5. **Baja, impacto alto.** La fusión de pacientes mueve notas firmadas [V5]. Ver P3.
6. **Baja.** Oráculo: el disparador corre antes del `WITH CHECK` de la RLS y puede revelar datos de la cabecera a quien conozca el UUID de la nota. Ver P2.
7. **Baja.** El `for share` es un cerrojo nuevo. Es compatible con `key share` y va antes del consultivo; sin ciclos.
8. **Baja.** Los vectores quedan atados a NVEC y PVEC.
9. **Baja.** 15 y 16 corren detrás: cada `disable` necesita su `enable`.
10. **Baja.** `t001` y `t002` pueden llevar un generador de la era 3 fuera del territorio [sin verificar].

## 5 · Qué revisar
- **Qué elige el llamante.** `authenticated` elige `nota_id`, el sobre, autor, alcance y `esquema_version`, pero no `paciente_id` (guarda 1). Las claves nuevas se cotejan con la cabecera leída en el paso 2. `episodio_id` null solo si la cabecera no tiene episodio (C.13b).
- **Qué tiene que fallar.**
  - Sin la migración, la primera aserción fallida es la de NCONJ.
  - Cada mutante de 6.11-6.14 hace que su negativa se selle.
  - Cada mutante del verificador deja su escenario en 0.
  - Un mutante que no cambia nada es un hallazgo.
  - F.12 no aísla la 6.11: lo hace F.12b, que tiene que usar N067D.
- **Null.** C.11b, C.12b y C.13b; una cabecera ausente produce `cab_paciente_id` null. No se permite `->>` con `<>`.
- **Duplicados.** La 6.1 con `json_object_keys`; la regresión que ya existe sigue en verde con quince claves.
- **Concurrencia.** `for share` antes del cerrojo consultivo.
- **Permisos.** Se repiten los `revoke` de las tres funciones. El disparador es `security definer` y lee la cabecera saltándose la RLS (P2).
- **DELETE y TRUNCATE de la cabecera.** El `left join` la señala; la FK está sin verificar.
- **Moverlo todo junto.** Exige reescribir el sobre, y eso lo caza `huella_no_coincide`, salvo en la última versión (TS-B3, aceptado).
- **Forma.**
  - En 14 no queda ninguna copia escrita a mano.
  - Cada `disable` tiene su `enable` y cada `grant` su `revoke`.
  - No hay variables de psql dentro de `$$`.
  - El diff no toca `firmar.ts` ni `vectores-sql.test.ts`.
  - El guion de vectores no se comitea.

## 6 · Territorio
El del contrato, sin cambios. `tickets/T-012/diseno.md` queda fuera (P4, Anexo A).

## 7 · Delegable
Lo mecánico, una vez aprobada la migración:
- Regenerar el JSON y copiar los cuatro literales.
- Pasar los ~30 llamantes de `sobre_prueba`.
- La documentación.
- Añadir las tres claves de NCADX a los literales de C.

No es delegable:
- El disparador y el verificador.
- F.12-F.17.
- Los mutantes y los ayudantes.
- Los fragmentos de `_msg`.
- El envoltorio de NCONJ.

## Lo que no entra, y por qué
- `fecha_sesion` en el sobre: no decide quién lee. Queda congelada solo por el disparador y se documenta.
- `numero_version` (N2).
- `ALGORITMO_VERSION`, anclaje externo y TS-B3: fuera por contrato.
- Normalizar `cita_id` a minúsculas: incoherencia previa que no exige ningún criterio.
- Nada de T-012.

## Preguntas al propietario (sin decidir)
- **P1.** `episodio_id` nulable frente al «no nulables» del contrato. Una nota individual sin episodio no podría firmarse. El diseño lo hace presente siempre, como cadena o null. ¿Confirmas?
- **P2.** El oráculo de la cabecera por el orden de errores (6.12-6.14 antes de la RLS de alta). ¿Se acepta el riesgo, porque exige conocer un UUID oculto, o se mitiga comprobando antes en el disparador que `auth.uid()` puede escribir, a costa de duplicar la política?
- **P3.** [V5] Si la fusión de pacientes mueve notas ya firmadas, sellar `paciente_id` choca con ella. En ese caso, el implementador para con un BLOQUEO antes de la migración.
- **P4.** ¿Quién aplica la enmienda de `tickets/T-012/diseno.md`? Está fuera del territorio y de mi mandato.
- **P5.** `fecha_sesion` sin sellar: ¿se acepta o se abre un ticket?

## Anexo A · Enmienda de `tickets/T-012/diseno.md`
Hay que confirmar las líneas: §1.1 ronda la 163, y hay menciones a la era 3 hacia la 335 y la 694.

Texto que sustituye la descripción del sobre en §1.1:

> El sobre canónico es el de la **era 4** (`ESQUEMA_VERSION = 4`, T-012c, ADR-067), con quince claves: abierta_en, alcance, anotaciones_reservadas, autor_id, cita_id, creada_en, cuerpo, episodio_id, esquema_version, firmada_en, margen_sesion_minutos, motivo_cambio, nota_id, paciente_id y redactada_en_sesion. nota_id, paciente_id y episodio_id (null si la cabecera no tiene episodio) se sellan porque deciden quién lee la versión. La Server Action pasa a `firmarVersionNota` `pacienteId` y `episodioId` **leídos de la cabecera `notas_clinicas` que firma**, nunca del formulario. El disparador rechaza con 23514 cualquier discrepancia con la cabecera, también la de `autor_id` (6.11-6.14).

En las líneas 335 y 694, aproximadamente: cambiar «era 3», «esquema_version 3» y «doce claves» por «era 4», «esquema_version 4» y «quince claves».

---

## 9 · Enmienda por el ADR-071 y el ADR-072

Arquitecto · 29-09-2026 · Contrato: las secciones «Enmienda por el ADR-071» y «Enmienda por el
ADR-072» de `tickets/T-012c-nota-id-en-el-sobre.md`. Decisiones: ADR-071 y ADR-072. Base: el
diseño de T-034 con su «Enmienda por el ADR-072» (`tickets/T-034/diseno.md` §E.1-E.6).

**Precedencia.** Esta sección manda sobre §0-§8 y sobre el Anexo A donde choquen. Lo que §9 no
toca sigue en vigor: guarda de era (§1.3.1), `left join` del verificador (D7), mutantes por
fragmento derecho (D8, D9), F.9b/N1, `t012c_mutar` y `t012c_restaurar`, el envoltorio de NCONJ
(§1.7) y los criterios 1-4, 8 y 10-13. El Anexo A queda **sustituido**: la enmienda ya está
escrita en `tickets/T-012/diseno.md` §1.1.

**Dependencia dura.** T-012c se implementa **después de que T-034 esté en `main`**. Necesita:
- `notas_clinicas.episodio_id not null`;
- la columna `coprofesional_id`;
- el disparador `exigir_episodio_coherente_en_nota`;
- la re-emisión de `fn_congelar_cabecera_sellada` con `coprofesional_id` en el `update of`;
- los episodios que T-034 añade a la fijación de 14.

### 9.0 · Hechos verificados (nuevos)

| # | Hecho | Ruta |
|---|---|---|
| H14 | La columna se llama **`coprofesional_id`**: `uuid` nulable, FK a `perfiles(id)`, `check notas_clinicas_coprofesional_no_es_autor`. El disparador `exigir_episodio_coherente_en_nota` exige que sea `profesional_sanitario` con alta vigente en el **centro del episodio**. El nombre queda fijado: no hay dependencia abierta. | `tickets/T-034/diseno.md` §E.1 |
| H15 | T-034 re-emite `fn_congelar_cabecera_sellada()` con el mensaje `'…no se puede reatribuir (paciente, fecha de sesión, autor, episodio, cita o coprofesional): se congela con la primera versión (ADR-035/046/072)'`, errcode 42501. Su 19.41 comprueba el fragmento `no se puede reatribuir`. | `tickets/T-034/diseno.md:637, 731` |
| H16 | La política de alta de versiones es `with check ((select public.historia_desbloqueada()) and autor_id = (select auth.uid()) and exists (select 1 from public.notas_clinicas n where n.id = nota_id and n.autor_id = (select auth.uid())))`. `authenticated` tiene `grant select, insert` de tabla entera sobre `notas_clinicas_versiones`. | `20260822160000_rls_funciones_y_politicas.sql:1169`, `20260822094547_*.sql:1565` |
| H17 | Hay **dos** disparadores `before insert` en `notas_clinicas_versiones`, y disparan por orden alfabético: primero `exigir_episodio_en_nota_conjunta` (`when new.alcance = 'conjunta'`, 23514 si la nota no existe **o** no tiene episodio), después `sellar_version_nota`. El `with check` de la RLS se evalúa después de los `before`; la FK de `nota_id`, al final. | `20260822094547_*.sql:1302-1318, 1426-1430` |
| H18 | `fn_vaciar_borrador_al_firmar` es `after insert` sobre versiones y hace `update` de la fila de `notas_clinicas` en la misma transacción. | `20260829210000_cadena_de_huellas.sql` |
| H19 | El disparador **no** exige bytes canónicos: la 6.1 mira las claves del jsonb y la huella se calcula sobre los bytes recibidos. Un sobre producido con `jsonb::text` sirve para las negativas. | `20260915130000_alcance_en_el_sobre.sql` |
| H20 | `pg_temp.como()` hace `set local role authenticated` y fija `request.jwt.claims`; `reset_sesion()` deshace las dos. | `scripts/rls/00-ayudantes.sql` |
| H21 | **No existe** `pg_temp.assert_no_lanza`. La primera versión que inserta el banco es la de NCONJ. | `scripts/rls/00-ayudantes.sql`, `scripts/rls/01-fijacion.sql:124-129` |
| H22 | `sobre_prueba()` tiene esta firma: `(p_autor_id, p_creada_en, p_cuerpo, p_anotaciones_reservadas, p_motivo_cambio, p_cita_id, p_margen_sesion_minutos, p_redactada_en_sesion, p_abierta_en, p_alcance)`, `language sql`, volátil por omisión. Llamadas: 5 en 01 (una con `p_alcance =>`), 1 en 04 y 34 en 14. **T-034 añade otra en `scripts/rls/19-nota-en-episodio.sql` (19.41)**, fuera del territorio de T-012c. | `scripts/rls/00-ayudantes.sql:180`, `tickets/T-034/diseno.md:731` |
| H23 | `seed-completo.sql:41` define `pg_temp.sobre(...)` como `immutable`, con 5 llamadas. `t005-concurrencia.sql:63` crea `public.t005_sobre_prueba(uuid, timestamptz, jsonb, text)`; la línea 103 es un `\!` con UUID literales (nota `e0050002-0000-4000-8000-000000000002`); la 184 la borra por esa firma. T2 firma **otra** nota del mismo paciente y se exige 55P03. | `supabase/seed-completo.sql:41`, `scripts/t005-concurrencia.sql` |
| H24 | PRO2 tiene alta en CB desde la fijación; PRO1 y TEC1, en CA. El módulo 19 de T-034 inserta `perfiles_centros (PRO2, CA, hasta null)`. El índice único parcial `perfiles_centros_una_vigente_por_par` impide que 14 inserte antes el mismo par. | `scripts/rls/01-fijacion.sql:57-69`, `20260829120000_perfiles_centros_multicentro.sql:73`, `tickets/T-034/diseno.md:716` |
| H25 | `episodios_asistenciales.centro_id` no está atado por ninguna restricción al centro del paciente. | `20260822094547_*.sql:517-529` |
| H26 | Patrón de caducidad del candado: `update public.desbloqueos_historia set concedido_en = now() - interval '1 hour', caduca_en = now() - interval '1 minute' where perfil_id = … and revocado_en is null`. | `scripts/rls/03-candado.sql:33-45` |
| H27 | `cita_id` del sobre solo se comprueba de tipo (6.8) y contra margen y sesión (6.9). Ni el disparador ni el verificador lo cotejan con `notas_clinicas.cita_id`. | `20260915130000_alcance_en_el_sobre.sql`, `20260924150000_verificador_coteja_sobre_y_fila.sql:138-147` |

Estado de lo que §0 dejó sin verificar:
- **V1 y V3**: resueltos (H22, H23).
- **V2**: resuelto. NCONJ es la primera firma y hay que crear `assert_no_lanza` (H21).
- **V4**: resuelto. En `notas_clinicas` saltan `congelar_cabecera_sellada` y
  `exigir_episodio_coherente_en_nota`; 9.7 dice cuál se apaga en cada escenario.
- **V5**: lo cierra el ADR-071.7.
- **V7**: resuelto (F.0-F.11 más F.9b).
- **V6 y V8**: siguen abiertos, con el mismo tratamiento que en §0.

Nuevos sin verificar (el implementador los comprueba primero):
- **V9**: que `current_setting('role', true)` dentro de una función `security definer` siga
  valiendo `'authenticated'` en una sesión de usuario. `security definer` cambia el usuario
  efectivo, no el GUC `role`. C.perm lo demuestra solo: si el paso 0 no entrara, los intentos sin
  mutante ya darían errores distintos y la aserción fallaría.
- **V10**: los UUID de los episodios que T-034 da a NCADX (EPICAD
  `e0050001-0000-4000-8000-000000000001`) y a NVEC (EPIVEC `e0050001-0000-4000-8000-000000000008`),
  según `tickets/T-034/diseno.md:264`. Si al llegar a `main` son otros, se usan los reales.
- **V11**: que la primera versión insertada **como `authenticated`** del banco (N067E, 9.7) pase
  también por los disparadores `after`. Si alguno la rechaza, es un hallazgo para T-012 y se
  escala; no se esquiva.

### 9.1 · El sobre de la era 4: diecisiete claves (sustituye §1.1 y D3)

En el orden de `array_agg(k order by k)`, que coincide en C, en en_US y con JCS:

`abierta_en, alcance, anotaciones_reservadas, autor_id, cita_id, coprofesional_id, creada_en, cuerpo, episodio_id, esquema_version, fecha_sesion, firmada_en, margen_sesion_minutos, motivo_cambio, nota_id, paciente_id, redactada_en_sesion`

| Clave nueva | Tipo en el sobre | Valor | Cotejo en disparador y verificador |
|---|---|---|---|
| `nota_id` | UUID en minúsculas, no nulable | `versiones.nota_id` | columna de la versión (6.11) |
| `paciente_id` | UUID en minúsculas, no nulable | `notas_clinicas.paciente_id` | cabecera (6.12) y copia `versiones.paciente_id` (verificador) |
| `episodio_id` | UUID en minúsculas, **no nulable** (ADR-071.4) | `notas_clinicas.episodio_id` | cabecera (6.13) |
| `fecha_sesion` | cadena `AAAA-MM-DD`, no nulable (ADR-071.4) | `to_char(notas_clinicas.fecha_sesion, 'YYYY-MM-DD')` | cabecera (6.15) |
| `coprofesional_id` | UUID en minúsculas **o `null`**; la clave siempre está (ADR-072.3) | `notas_clinicas.coprofesional_id` | cabecera (6.16) |

- `autor_id` no cambia de forma. Se coteja además con `notas_clinicas.autor_id` (6.14, D2).
- `fecha_sesion` es una **fecha**, no un instante: no lleva zona ni hora, así que no depende del
  `TimeZone` de la sesión. F.19 (Kiritimati) lo comprueba.

### 9.2 · `lib/huella/sobre.ts` (sustituye §1.2)

- `ESQUEMA_VERSION = 4`. `ALGORITMO_VERSION` no se toca. El comentario de cabecera dice
  «diecisiete claves» y cita ADR-067, ADR-071 y ADR-072.
- `EntradaFirma` gana cuatro campos **obligatorios** (sin `?`), leídos de la cabecera que se firma:
  - `pacienteId: string`
  - `episodioId: string`
  - `fechaSesion: string`, en `'AAAA-MM-DD'` tal como PostgREST devuelve una columna `date`.
    Nunca un `Date`.
  - `coprofesionalId: string | null`. Es obligatorio: el llamante escribe `null` a mano.
- Esquema auxiliar nuevo, junto a `instanteIso`:
  ```ts
  const fechaIso = z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((s) => {
      const d = new Date(`${s}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, 'fecha_sesion debe ser una fecha real AAAA-MM-DD');
  ```
  El `refine` rechaza `2026-02-30`, que la expresión regular deja pasar.
- `esquemaSobre` (sigue `.strict()`) añade:
  - `coprofesional_id: uuidMinusculas.nullable()`, **sin `.optional()`**: omitir la clave falla;
  - `episodio_id: uuidMinusculas`;
  - `fecha_sesion: fechaIso`;
  - `nota_id: uuidMinusculas`;
  - `paciente_id: uuidMinusculas`.
- `sinNormalizar` añade:
  - `coprofesional_id: entrada.coprofesionalId === null ? null : entrada.coprofesionalId.toLowerCase()`
  - `episodio_id: entrada.episodioId.toLowerCase()`
  - `fecha_sesion: entrada.fechaSesion`
  - `nota_id: entrada.notaId.toLowerCase()`
  - `paciente_id: entrada.pacienteId.toLowerCase()`
- `firmar.ts` no cambia (§1.2 sigue en pie): ninguna de las cinco es una columna que mande el
  llamante, y el tipo ya obliga a T-012.

### 9.3 · Migración `<sello>_nota_id_en_el_sobre.sql` (sustituye §1.3, puntos 2 a 6)

El sello tiene que ser posterior al de la migración de T-034
(`20260929120000_nota_siempre_en_episodio.sql` según su diseño). Orden de bloques:

1. Guarda de era (§1.3.1, sin cambios).
2. `fn_sellar_version_nota`.
3. `fn_exigir_episodio_en_nota_conjunta` (2b).
4. Verificador.
5. `fn_congelar_cabecera_sellada`.
6. `default 4`.
7. `comment on`.

**2 · `create or replace function public.fn_sellar_version_nota()`**

Lleva el cuerpo íntegro de `20260915130000_alcance_en_el_sobre.sql`, con estos cambios y ninguno
más:

- `declare` añade `v_episodio_id uuid; v_autor_cabecera uuid; v_fecha_sesion date; v_coprofesional_id uuid;`.
- `v_esperadas` pasa a las diecisiete claves de 9.1, en ese orden.
- **Paso 0 (nuevo): permisos antes que cotejo (ADR-071.5).** Es la **primera sentencia** del
  cuerpo, antes de la guarda 1:
  ```sql
  -- 0 · Permisos antes que cotejo (ADR-071.5). Misma condición que la política
  -- notas_clinicas_versiones_alta. Todo lo que sigue lee la cabecera saltándose la
  -- RLS (security definer) y lanza errores que dependen de ella; la RLS de alta se
  -- evalúa DESPUÉS de este disparador. Sin este paso, el orden de los errores
  -- revelaría a quien no puede firmar el paciente, el episodio, el autor, la fecha,
  -- el coprofesional y hasta la existencia de la nota. postgres y service_role no
  -- pasan por la RLS y tampoco por aquí. Si cambia la política, cambia este paso
  -- (C.perm.0 lo vigila).
  if current_setting('role', true) in ('authenticated', 'anon') then
    if not coalesce(
         (select public.historia_desbloqueada())
         and new.autor_id = (select auth.uid())
         and exists (select 1 from public.notas_clinicas n
                      where n.id = new.nota_id and n.autor_id = (select auth.uid())),
         false) then
      raise exception 'No puedes firmar una versión de esta nota: la firma su autor, con la historia desbloqueada (T-012c, ADR-071)'
        using errcode = '42501';
    end if;
  end if;
  ```
  - Fragmento: **`No puedes firmar una versión de esta nota`**.
  - Una nota inexistente cae en el mismo error, porque el `exists` es falso. Esto cierra el
    oráculo de existencia del `into strict` (P0002) del paso 2.
  - El `coalesce(…, false)` convierte el `null` de `auth.uid()` sin `sub` en rechazo.
  - Se decide por el GUC `role` y no por `auth.uid() is not null`: un `postgres` con
    `request.jwt.claims` sin limpiar (siembra, t005) no debe quedar sometido a la regla (D19).
- **Paso 2.** Sustituye el `for share` de D5, que interbloquea (D13):
  ```sql
  select n.paciente_id, n.episodio_id, n.autor_id, n.fecha_sesion, n.coprofesional_id
    into strict v_paciente_id, v_episodio_id, v_autor_cabecera, v_fecha_sesion, v_coprofesional_id
    from public.notas_clinicas n
   where n.id = new.nota_id
     for no key update;
  ```
- **Comentario del paso 6**: dice «dieciséis comprobaciones, diecisiete claves». Se **borra** el
  paréntesis desfasado (líneas 161-163 de la migración anterior) y se pone la frase de §1.3.2.
- **Mensaje de la 6.1**: cita `ADR-035/046/057/067/071/072` y conserva «exactamente las claves».
- **Tras la 6.10, seis comprobaciones nuevas.** Todas lanzan 23514 y usan `is distinct from`
  sobre jsonb. Cada condición va **en una sola línea**, porque los mutantes la buscan por
  fragmento.

| # | Condición (una línea) | Mensaje | Fragmento para `_msg` |
|---|---|---|---|
| 6.11 | `if (v_contenido -> 'nota_id') is distinct from to_jsonb(new.nota_id::text) then` | `'El nota_id del sobre no coincide con la columna nota_id, o no es una cadena (T-012c, ADR-067)'` | `El nota_id del sobre no coincide` |
| 6.12 | `if (v_contenido -> 'paciente_id') is distinct from to_jsonb(v_paciente_id::text) then` | `'El paciente_id del sobre no coincide con el paciente de la cabecera notas_clinicas, o no es una cadena (T-012c, ADR-067)'` | `El paciente_id del sobre no coincide` |
| 6.13 | `if (v_contenido -> 'episodio_id') is distinct from to_jsonb(v_episodio_id::text) then` | `'El episodio_id del sobre no coincide con el episodio de la cabecera notas_clinicas, o no es una cadena (T-012c, ADR-067, ADR-071)'` | `El episodio_id del sobre no coincide` |
| 6.14 | `if (v_contenido -> 'autor_id') is distinct from to_jsonb(v_autor_cabecera::text) then` | `'El autor_id del sobre no coincide con el autor de la cabecera notas_clinicas (T-012c, ADR-067)'` | `no coincide con el autor de la cabecera` |
| 6.15 | `if (v_contenido -> 'fecha_sesion') is distinct from to_jsonb(to_char(v_fecha_sesion, 'YYYY-MM-DD')) then` | `'La fecha_sesion del sobre no coincide con la fecha de sesión de la cabecera notas_clinicas (AAAA-MM-DD), o no es una cadena (T-012c, ADR-071)'` | `La fecha_sesion del sobre no coincide` |
| 6.16 | `if (v_contenido -> 'coprofesional_id') is distinct from coalesce(to_jsonb(v_coprofesional_id::text), 'null'::jsonb) then` | `'El coprofesional_id del sobre no coincide con el coprofesional de la cabecera notas_clinicas (null si no hay), o no es una cadena ni null (T-012c, ADR-072)'` | `El coprofesional_id del sobre no coincide` |

- La 6.13 ya no lleva `coalesce`: tras T-034, `v_episodio_id` nunca es null. Un sobre con
  `"episodio_id":null` da `'null'::jsonb` frente a una cadena y falla.
- Se repite `revoke all on function public.fn_sellar_version_nota() from public, anon, authenticated, service_role;`.

**2b · `create or replace function public.fn_exigir_episodio_en_nota_conjunta()`** (nuevo en
§9, D20). Mismo cuerpo que en `20260822094547:1305-1318`, con una sola línea cambiada. La
condición pasa de «no existe una nota con este id y con episodio» a:
```sql
  if exists (select 1 from public.notas_clinicas n where n.id = new.nota_id and n.episodio_id is null) then
```
- **Por qué.** Este disparador corre **antes** que el paso 0 (H17). Con la condición vieja, una
  versión `conjunta` contra una nota inexistente devuelve el 23514 «exige que su nota tenga
  episodio», y contra una existente llega al 42501 del paso 0. Es un oráculo de existencia, y el
  ADR-071.5 lo prohíbe.
- **Qué hace la condición nueva.** Una nota inexistente pasa de largo y el paso 0 la rechaza como
  a cualquier otra.
- **Qué queda.** Tras T-034 la rama es inalcanzable (`episodio_id not null`), pero se mantiene
  como defensa.
- Se repite su `revoke`, con los mismos destinatarios que en `20260822094547`.

**3 · `create or replace function public.verificar_cadena_huellas(p_paciente_id uuid default null)`**
(sustituye §1.3.3):

- La CTE hace `left join public.notas_clinicas n on n.id = v.nota_id` y añade estas columnas:
  - `n.paciente_id as cab_paciente_id`
  - `n.episodio_id as cab_episodio_id`
  - `n.autor_id as cab_autor_id`
  - `n.fecha_sesion as cab_fecha_sesion`
  - `n.coprofesional_id as cab_coprofesional_id`
- La rama `sobre_no_coincide_con_fila` añade siete líneas. Cada una tiene un fragmento derecho
  único; su mutante lo sustituye por `(c.sobre -> '<clave>')`.

| Línea | Fragmento derecho |
|---|---|
| `or (c.sobre -> 'nota_id') is distinct from to_jsonb(c.nota_id::text)` | `to_jsonb(c.nota_id::text)` |
| `or (c.sobre -> 'paciente_id') is distinct from to_jsonb(c.paciente_id::text)` (fila) | `to_jsonb(c.paciente_id::text)` |
| `or (c.sobre -> 'paciente_id') is distinct from to_jsonb(c.cab_paciente_id::text)` (cabecera) | `to_jsonb(c.cab_paciente_id::text)` |
| `or (c.sobre -> 'episodio_id') is distinct from to_jsonb(c.cab_episodio_id::text)` | `to_jsonb(c.cab_episodio_id::text)` |
| `or (c.sobre -> 'autor_id') is distinct from to_jsonb(c.cab_autor_id::text)` | `to_jsonb(c.cab_autor_id::text)` |
| `or (c.sobre -> 'fecha_sesion') is distinct from to_jsonb(to_char(c.cab_fecha_sesion, 'YYYY-MM-DD'))` | `to_jsonb(to_char(c.cab_fecha_sesion, 'YYYY-MM-DD'))` |
| `or (c.sobre -> 'coprofesional_id') is distinct from coalesce(to_jsonb(c.cab_coprofesional_id::text), 'null'::jsonb)` | `coalesce(to_jsonb(c.cab_coprofesional_id::text), 'null'::jsonb)` |

- Si la cabecera no existe, el `left join` deja todos los `cab_*` a null y la versión se señala.
- El `comment on function` dice que coteja con la fila y con la cabecera `notas_clinicas`
  (paciente, episodio, autor, fecha de sesión y coprofesional), y que devuelve una fila por
  versión divergente.
- Se repite `revoke all … from public, anon, authenticated, service_role`.

**4 · `create or replace function public.fn_congelar_cabecera_sellada()`** (sustituye §1.3.4):

- El cuerpo es el que deja T-034; se toma con `pg_get_functiondef` tras aplicar T-034. Solo cambia
  el mensaje, que pasa a ser:
  `'La cabecera de una nota ya firmada no se puede reatribuir (paciente, fecha de sesión, autor, episodio, cita o coprofesional): el sobre canónico de la era 4 sella los seis campos, y verificar_cadena_huellas() los coteja con la cabecera salvo la cita (ADR-035/046/067/071/072)'`
- El errcode sigue siendo 42501. Se conserva el fragmento `no se puede reatribuir`, que usa el
  19.41 de T-034.
- El disparador **no** se toca: T-034 ya lo recreó con `coprofesional_id`.
- Se repite `revoke execute on function public.fn_congelar_cabecera_sellada() from public, anon, authenticated;`.

**5 · Valor por omisión:**
`alter table public.notas_clinicas_versiones alter column esquema_version set default 4;`

**6 · `comment on column public.notas_clinicas_versiones.esquema_version`.** Empieza por
`'Forma del sobre canónico. 4 desde el ADR-067, el ADR-071 y el ADR-072 (nota_id, paciente_id, episodio_id, fecha_sesion y coprofesional_id dentro del sobre firmado, diecisiete claves, T-012c); 3 desde el ADR-057 …'`
y dice que las versiones 1-3 nacen muertas.

`tipos-bd.ts` no cambia: ni tablas, ni columnas, ni firmas.

### 9.4 · Vectores (sustituye §1.4)

- Los nueve vectores ganan cinco valores:
  - `"nota_id":"f0050001-0000-4000-8000-000000000008"` (NVEC)
  - `"paciente_id":"d0050001-0000-4000-8000-000000000008"` (PVEC)
  - `"episodio_id":"e0050001-0000-4000-8000-000000000008"` (EPIVEC, [V10])
  - `"fecha_sesion":"2026-08-29"`
  - `"esquema_version":4`
- Ocho llevan `"coprofesional_id":null`. `alcance-conjunta` lleva
  `"coprofesional_id":"44444444-4444-4444-8444-444444444444"`, que no se inserta nunca. Así hay un
  vector por cada forma de la clave nulable sin pasar de nueve.
- `genesis-minimo` se inserta como versión de NVEC, así que lleva exactamente la cabecera de NVEC:
  PVEC, EPIVEC, `2026-08-29` y coprofesional `null`.
- En 14, el `insert` de las siete notas de la fijación gana `fecha_sesion` explícita
  (`date '2026-08-29'` en las siete). Así NVEC coincide con el vector y los literales de C no
  dependen del día en que corre el banco.
- `canonico` y `huella_hex` se recalculan con el guion de un solo uso de §1.4. En 14 se actualizan
  byte a byte los tres `$vec$` y `\set VECGENESIS`.

### 9.5 · Generadores de sobres (sustituye §1.5 y D4)

**`pg_temp.sobre_prueba`** (`scripts/rls/00-ayudantes.sql`):

- Firma nueva: `p_nota_id uuid` primero, **sin valor por defecto**; el resto de parámetros sigue
  igual y en su orden (H22). Pasa a `stable`, porque lee `notas_clinicas`.
- Emite las diecisiete claves en el orden de 9.1, con `"esquema_version":4`. Las claves de
  cabecera salen de subconsultas escalares, con `null` si no hay fila:
  - Tras `cita_id`:
    `'"coprofesional_id":' || coalesce(to_json((select n.coprofesional_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ','`
  - Tras `cuerpo`: `episodio_id`, con el mismo patrón.
  - Tras `esquema_version`: `fecha_sesion`, con `to_char(n.fecha_sesion, 'YYYY-MM-DD')`.
  - Tras `motivo_cambio`: `'"nota_id":"' || lower(p_nota_id::text) || '",'` y luego
    `paciente_id`, con el mismo patrón de subconsulta.
- No usa `into strict`, al contrario de lo que decía §1.5. Para una nota inexistente devuelve las
  claves de cabecera a `null`. Lo necesita C.perm (sobre para una nota que no existe), y no
  esconde nada: la 6.12-6.16 o el paso 0 lo rechazan.

**Llamantes que se actualizan:**
- los 5 de 01 (NCONJ conserva `p_alcance => 'conjunta'`);
- el de 04;
- los 34 de 14;
- el **19.41 de `scripts/rls/19-nota-en-episodio.sql`**, que pasa a `sobre_prueba(:NCO, :PRO1, …)`.
  Está fuera del territorio del contrato (P6, 9.15).

**`pg_temp.sobre`** (`supabase/seed-completo.sql:41`): `p_nota_id uuid` primero, de `immutable`
pasa a `stable`, y hace las mismas derivaciones con la misma forma. Se actualizan sus 5 llamadas.

**`public.t005_sobre_prueba`** (`scripts/t005-concurrencia.sql`):
- La firma pasa a
  `(p_nota_id uuid, p_autor_id uuid, p_creada_en timestamptz, p_cuerpo jsonb, p_motivo_cambio text default null)`.
- Las llamadas de T1 y T3 pasan la nota que firman.
- En el `\!` de la línea 103, el primer argumento es `'e0050002-0000-4000-8000-000000000002'::uuid`.
- El `drop` de la línea 184 pasa a `public.t005_sobre_prueba(uuid, uuid, timestamptz, jsonb, text)`.
- T2 firma otra nota del mismo paciente, así que el cerrojo de fila de 9.3 no le afecta: sigue
  esperando en el consultivo y el 55P03 no cambia.

### 9.6 · Ayudantes nuevos

En `scripts/rls/00-ayudantes.sql`:
- **`pg_temp.assert_no_lanza(consulta text, mensaje text)`**, en plpgsql y con el estilo de
  `assert_lanza`:
  - hace `execute consulta`;
  - si lanza: `raise exception 'FALLO: % (lanzó % · %)', mensaje, sqlstate, sqlerrm`;
  - si no: `raise notice 'OK: %', mensaje`.

  Lo usan §1.7 (NCONJ), las gemelas positivas y los mutantes. El `\echo` final de 00 lo nombra.

En `14-cadena-huellas.sql`, locales en `pg_temp`, junto a `t012c_mutar` y `t012c_restaurar`:
- **`pg_temp.t012c_sobre_con(p_sobre text, p_cambio jsonb) returns text`**, que devuelve
  `(p_sobre::jsonb || p_cambio)::text`. Construye cada negativa cambiando una clave; por ejemplo,
  `jsonb_build_object('episodio_id', :'EPI067A')`.
  - Un `null` se pasa como `jsonb_build_object('nota_id', null)`.
  - Para quitar una clave: `(p_sobre::jsonb - 'coprofesional_id')::text`.
- **`pg_temp.t012c_error(p_sql text) returns text`**, en plpgsql. Hace `execute p_sql; return 'sin error';`
  y, con `exception when others then`, devuelve `sqlstate || ' · ' || sqlerrm`. Captura el error
  completo para compararlo entre intentos.
- Además de las capturas de originales de §1.6, esta:
  `select pg_get_functiondef('public.fn_exigir_episodio_en_nota_conjunta()'::regprocedure) as conjunta_original \gset`.

### 9.7 · Banco `14-cadena-huellas.sql` (sustituye la fijación, la sección C y la F de §1.6)

**Fijación nueva**, como `postgres`, tras la de T-034. Hecho comprobado: ninguno de estos prefijos
existe en el repositorio (`grep` de `d067`, `e067`, `f067`, `d0710` y `f0710` en `scripts/` y en
la siembra).

| Var | UUID | Qué es |
|---|---|---|
| `P067` | `d0670001-0000-4000-8000-000000000001` | paciente de PRO1 (copiar el `insert` de PCAD) |
| `PMOV` | `d0670001-0000-4000-8000-000000000002` | paciente sin versiones |
| `EPI067A` | `e0670001-0000-4000-8000-000000000001` | P067, PRO1, **centro CB**, abierto (copiar el `insert` de EPICAD) |
| `EPI067B` | `e0670001-0000-4000-8000-000000000002` | igual que EPI067A |
| `N067A` | `f0670001-0000-4000-8000-000000000001` | EPI067A, **coprofesional PRO2**, una versión `conjunta` |
| `N067B` | `f0670001-0000-4000-8000-000000000002` | EPI067B, sin coprofesional, sin versiones |
| `N067C` | `f0670001-0000-4000-8000-000000000003` | EPI067B, coprofesional `null`, una versión individual |
| `N067D` | `f0670001-0000-4000-8000-000000000004` | EPI067A, **coprofesional PRO2**, sin versiones; cabecera gemela de N067A |
| `N067E` | `f0670001-0000-4000-8000-000000000005` | EPI067A, sin coprofesional, sin versiones; la firma PRO1 como `authenticated` en C.perm |
| `NFANTASMA` | `f0710001-0000-4000-8000-0000000000ff` | UUID sin nota |

- Las cinco notas son de P067, autor PRO1, con `fecha_sesion date '2026-08-29'`.
- Antes de insertar N067A se afirma
  `exists (select 1 from public.perfiles_centros where perfil_id = :'PRO2' and centro_id = :'CB' and hasta is null)`.
  Sin esa fila, `exigir_episodio_coherente_en_nota` rechazaría el coprofesional.
- Las versiones de N067A y N067C **no** son fijación: son las gemelas positivas de la sección C.

**Sección C**

- Todos los literales de sobre de NCADX ganan cinco claves y pasan a `"esquema_version":4`:
  - `"coprofesional_id":null`
  - `"episodio_id":"e0050001-0000-4000-8000-000000000001"` [V10]
  - `"fecha_sesion":"2026-08-29"`
  - `"nota_id":"f0050001-0000-4000-8000-000000000000"`
  - `"paciente_id":"d0050001-0000-4000-8000-000000000001"`
- **Toda** la sección C usa `assert_lanza_codigo_msg` con su fragmento, también las negativas de
  42501 y 22P05.
- Negativas nuevas. Salvo C.16d y C.era3, todas se construyen con
  `t012c_sobre_con(sobre_prueba(<nota>, :'PRO1', …), <cambio>)` y esperan 23514.

| Caso | Nota | Cambio en el sobre | Fragmento esperado |
|---|---|---|---|
| C.11a | NCADX | `nota_id` = NCADA | `El nota_id del sobre no coincide` |
| C.11b | NCADX | `nota_id` null | ídem |
| C.12a | NCADX | `paciente_id` = PDEMO | `El paciente_id del sobre no coincide` |
| C.12b | NCADX | `paciente_id` null | ídem |
| C.13a | NCADX | `episodio_id` = EPI067A | `El episodio_id del sobre no coincide` |
| C.13b | NCADX | `episodio_id` null (ya no se admite nunca) | ídem |
| C.13c | NCADX | `episodio_id` = 5 | ídem |
| C.14 | NCADX | autor PRO2 en el sobre y en la columna | `no coincide con el autor de la cabecera` |
| C.15a | NCADX | `fecha_sesion` = `"2026-08-30"` | `La fecha_sesion del sobre no coincide` |
| C.15b | NCADX | `fecha_sesion` null | ídem |
| C.15c | NCADX | `fecha_sesion` = `"29/08/2026"` | ídem |
| C.16a | N067A | `coprofesional_id` = TEC1 (la cabecera dice PRO2) | `El coprofesional_id del sobre no coincide` |
| C.16b | N067A | `coprofesional_id` null (la cabecera dice PRO2) | ídem |
| C.16c | NCADX | `coprofesional_id` = PRO2 (la cabecera dice null) | ídem |
| C.16d | NCADX | se quita la clave `coprofesional_id` | `exactamente las claves` (6.1) |
| C.era3 | NCADX | sobre de doce claves, era 3, columna en 3 | `exactamente las claves` (6.1) |

- C.16a y C.16b corren **antes** de sellar la gemela de N067A.
- **Mutantes de 6.13, 6.15 y 6.16.** Se añaden a la tabla de §1.6 con el mismo método:
  1. `savepoint`;
  2. `t012c_mutar`;
  3. `assert_no_lanza` de la negativa (a);
  4. `rollback to savepoint`;
  5. afirmar la igualdad con `:'sellar_original'`.

| Comprobación | Fragmento | Se reemplaza por | Negativa que pasa a sellarse |
|---|---|---|---|
| 6.13 | `to_jsonb(v_episodio_id::text) then` | `(v_contenido -> 'episodio_id') then` | C.13a |
| 6.15 | `to_jsonb(to_char(v_fecha_sesion, 'YYYY-MM-DD')) then` | `(v_contenido -> 'fecha_sesion') then` | C.15a |
| 6.16 | `coalesce(to_jsonb(v_coprofesional_id::text), 'null'::jsonb) then` | `(v_contenido -> 'coprofesional_id') then` | C.16a |

  La fila 6.13 de §1.6 (la que llevaba `coalesce`) queda sustituida. Las de 6.11, 6.12 y 6.14
  quedan como allí.
- **Gemelas positivas**, con `assert_no_lanza`:
  - la versión `conjunta` de N067A (el sobre dice EPI067A y coprofesional PRO2);
  - la versión individual de N067C (coprofesional `null`).
- **C.congelar**, como `postgres`, tras sellar N067A:
  `assert_lanza_codigo_msg('update public.notas_clinicas set coprofesional_id = null where id = ''f0670001-0000-4000-8000-000000000001''', '42501', 'el sobre canónico de la era 4 sella', …)`.
  El fragmento es nuevo de T-012c: el mensaje de T-034 no lo contiene.

**C.perm · permisos antes que cotejo** (criterio 5 de la enmienda del ADR-071). Va al final de C.

- **C.perm.0 (cable trampa)**, como `postgres`:
  `pg_temp.assert((select with_check from pg_policies where schemaname = 'public' and tablename = 'notas_clinicas_versiones' and policyname = 'notas_clinicas_versiones_alta') = '<literal>', 'C.perm.0 · la política de alta sigue igual; si cambia, cambia el paso 0 de fn_sellar_version_nota()')`.
  El implementador copia el `<literal>` byte a byte de `pg_policies`, tras `db reset`.
- **Sobres**, preparados como `postgres` y guardados con `\gset`. Cada uno moriría en un sitio
  distinto si no existiera el paso 0:
  - `sobre_b` = `sobre_prueba(:'N067B', :'PRO2', …)`: moriría en la 6.14 (la cabecera dice PRO1).
  - `sobre_x` = `t012c_sobre_con(sobre_prueba(:'NCADX', :'PRO2', …), jsonb_build_object('paciente_id', :'PDEMO'))`:
    moriría en la 6.12.
  - `sobre_n` = `sobre_prueba(:'NFANTASMA', :'PRO2', …)`: moriría con P0002.
  - `sobre_c` = `sobre_prueba(:'NFANTASMA', :'PRO2', …, p_alcance => 'conjunta')`: moriría en el
    disparador de la conjunta.
- **Intentos de PRO2.** `call pg_temp.como(:'PRO2')` y se afirma
  `(select desbloqueado from public.desbloquear_historia('222222'))`. Después, cuatro capturas con
  `t012c_error(format($sql$insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values (%L, …)$sql$, …)) as err_… \gset`,
  todas con `autor_id` PRO2:
  - `err_b`: N067B, `sobre_b`, `individual`.
  - `err_x`: NCADX, `sobre_x`, `individual`.
  - `err_n`: NFANTASMA, `sobre_n`, `individual`.
  - `err_c`: NFANTASMA, `sobre_c`, `conjunta` (ejerce 2b).

  Al terminar, `call pg_temp.reset_sesion()`.
- **Aserción:**
  `:'err_b' = :'err_x' and :'err_x' = :'err_n' and :'err_n' = :'err_c' and :'err_b' like '42501 · No puedes firmar una versión de esta nota%'`.
  Rótulo: «C.perm · cuatro intentos sin permiso contra cabeceras distintas (ajena, paciente
  cambiado, inexistente, inexistente conjunta) dan el mismo errcode y el mismo mensaje».
- **Candado cerrado**, dentro de `savepoint t012c_perm`:
  1. PRO1 se desbloquea con `'111111'`.
  2. Como `postgres`, se le caduca la ventana con el patrón de H26.
  3. `como(:'PRO1')` intenta N067D con un sobre correcto y guarda el resultado en `err_d`.
  4. Se afirma `:'err_d' = :'err_b'`.
  5. `rollback to savepoint t012c_perm` y `reset_sesion()`.
- **Mutantes**, dentro de `savepoint t012c_perm_m`:
  - **Paso 0.** `t012c_mutar(:'sellar_original', 'if not coalesce(', 'if false and coalesce(')`.
    - Se repiten las capturas como PRO2 y se afirma que `err_b`, `err_x` y `err_n` son
      **distintos dos a dos**.
    - Deben empezar por `23514 · El autor_id`, `23514 · El paciente_id` y `P0002`,
      respectivamente.
    - Después, `rollback to savepoint t012c_perm_m` y se afirma la igualdad con `:'sellar_original'`.
  - **Disparador de la conjunta.** `t012c_mutar(:'conjunta_original', 'if exists (', 'if not exists (')`.
    - `err_c` pasa a empezar por `23514 · Una versión de nota con alcance conjunta`.
    - Después, `rollback to savepoint t012c_perm_m` y se afirma la igualdad con `:'conjunta_original'`.
- **Gemela positiva.**
  1. `como(:'PRO1')` y `desbloquear_historia('111111')`.
  2. `assert_no_lanza(<insert de N067E con el sobre generado antes, como postgres, con sobre_prueba(:'N067E', :'PRO1', …)>, 'C.perm · el autor con la historia desbloqueada firma su nota como authenticated')`.
  3. `reset_sesion()`.

  Es la primera firma `authenticated` del banco [V11].

**Sección F** (sustituye F.12-F.17 de §1.6)

- Los cerrojos de T-012b van como en §1.6.
- Antes de F.12 se guarda
  `select count(*) as n067_versiones from public.notas_clinicas_versiones where paciente_id = :'P067' \gset`.
  Salen tres: N067A, N067C y N067E.
- Cada escenario restaura y afirma `verificar_cadena_huellas(:'P067')` en cero filas antes de
  pasar al siguiente.

| # | Qué se apaga en `notas_clinicas` | Cambio | Espera | Mutante que lo deja en 0 |
|---|---|---|---|---|
| F.12 (criterio 4) | nada | versiones: `nota_id = N067B where nota_id = N067A` | una fila `sobre_no_coincide_con_fila`, y la huella sigue cuadrando con sus bytes, en la **misma** aserción | — |
| F.12b | nada | versiones: `nota_id = N067D where nota_id = N067A` | una fila | `to_jsonb(c.nota_id::text)`; después, `t012c_restaurar` |
| F.13 | `congelar_cabecera_sellada` y `exigir_episodio_coherente_en_nota` | `N067A.paciente_id = PMOV` | una fila | `to_jsonb(c.cab_paciente_id::text)` |
| F.14 | `congelar_cabecera_sellada` | (a) `N067A.episodio_id = EPI067B`; (b) `N067C.episodio_id = EPI067A` | una fila en cada caso | `to_jsonb(c.cab_episodio_id::text)`: 0 en (a) y en (b) |
| F.15 | `congelar_cabecera_sellada` y `exigir_episodio_coherente_en_nota` | `N067C.autor_id = PRO2` | una fila | `to_jsonb(c.cab_autor_id::text)` |
| F.16 | nada | versiones: `paciente_id = PMOV where paciente_id = P067` | `verificar(:'PMOV')` da `:n067_versiones` filas, todas `sobre_no_coincide_con_fila`, ningún otro motivo | `to_jsonb(c.paciente_id::text)` |
| F.17 (nuevo) | `congelar_cabecera_sellada` | `N067A.fecha_sesion = date '2026-08-30'` | una fila | `to_jsonb(to_char(c.cab_fecha_sesion, 'YYYY-MM-DD'))` |
| F.18 (nuevo) | `congelar_cabecera_sellada` | (a) `N067A.coprofesional_id = null`; (b) `N067C.coprofesional_id = PRO2` | una fila en cada caso | `coalesce(to_jsonb(c.cab_coprofesional_id::text), 'null'::jsonb)`: 0 en (a) y en (b) |
| F.19 (criterio 7; antes F.17) | nada | `set time zone 'Pacific/Kiritimati'` | `verificar(:'P067')` = 0 y `verificar()` solo devuelve PDEMO; después, `reset time zone` | — |

Notas a la tabla:
- **F.14 y F.18(b)** dejan **encendido** `exigir_episodio_coherente_en_nota`, y el cambio lo
  supera: mismo paciente y autor, episodio abierto, y PRO2 con alta en CB, que es el centro de
  los dos episodios. Prueban que el escenario se alcanza sin apagar la coherencia.
- **F.15** usa N067C y no N067A: con N067A, `autor_id = PRO2` violaría el `check` de T-034
  (coprofesional distinto del autor).
- **F.12b** exige que N067D sea gemela de cabecera de N067A, coprofesional incluido. Si no, la
  línea del coprofesional señalaría la versión y el mutante de `nota_id` no llegaría a 0.
- **Cerrojos**: cada `disable` tiene su `enable` en el mismo escenario. Al final de F se afirma que
  `exigir_episodio_coherente_en_nota` y `congelar_cabecera_sellada` están en `'O'`, como ya se
  hace con `impedir_modificacion_notas_clinicas_versiones`.
- **F.11**: su comentario pasa de «frente a 3 en la columna» a «frente a 4». El literal de PDEMO
  (insertado con el sellado apagado) no se toca.

### 9.8 · `01-fijacion.sql` y `19-nota-en-episodio.sql`

- **01**: §1.7 sigue en pie. El envoltorio de NCONJ usa el `assert_no_lanza` de 9.6, y la llamada
  pasa `:'NCONJ'` como primer argumento de `sobre_prueba`. Las otras cuatro llamadas ganan su
  nota.
- **19**: solo cambia la llamada de 19.41, que pasa a `sobre_prueba(:'NCO', :'PRO1', …)`. Nada
  más del módulo.

### 9.9 · Pruebas TS (sustituye §1.8)

**`sobre.test.ts`**

- `entradaBase` gana cuatro campos:
  - `pacienteId: '55555555-5555-4555-8555-555555555555'`
  - `episodioId: '66666666-6666-4666-8666-666666666666'`
  - `fechaSesion: '2026-08-29'`
  - `coprofesionalId: null`

  `sobreBase` gana las cinco claves.
- Pruebas:
  - Diecisiete claves literales, en el orden de 9.1, y `esquema_version === 4`.
  - Sensibilidad, cambiando **solo** ese campo:
    - `notaId`: cambia el canónico **y** la huella (sha256 de utf8 más 32 ceros, con
      `node:crypto`).
    - `pacienteId`, `episodioId` y `fechaSesion` (`'2026-08-30'`): cambian el canónico.
    - `coprofesionalId`, de `null` a un UUID y de un UUID a otro: cambia el canónico **y** la
      huella. Es la prueba que pide la enmienda del ADR-072.
  - Mayúsculas a minúsculas en `notaId`, `pacienteId`, `episodioId` y `coprofesionalId`.
  - Zod rechaza:
    - `nota_id`, `paciente_id`, `episodio_id` o `fecha_sesion` a null;
    - `fecha_sesion` `'2026-02-30'`, `'29/08/2026'` o `'2026-08-29T00:00:00Z'`;
    - un sobre **sin** la clave `coprofesional_id`;
    - `coprofesional_id: 'no-es-uuid'`.
  - Zod acepta `coprofesional_id: null`.
  - La prueba de reordenado, con diecisiete claves.

**`vectores.test.ts`**

- Se mantienen los nueve nombres.
- `esquemaSobre.parse(normalizarNfc(v.sobre))` no lanza para ninguno.
- Tiene `coprofesional_id` no nulo **exactamente** `alcance-conjunta`.
- Los nueve llevan `episodio_id` EPIVEC y `fecha_sesion` `'2026-08-29'`.

`vectores-sql.test.ts` no se toca y sigue en verde.

### 9.10 · Documentación (sustituye §1.9)

- **`docs/architecture.md`, líneas 62-66 y 89-92**:
  - diecisiete claves y era 4;
  - el paso 0 (permisos antes que cotejo, ADR-071.5);
  - el cotejo del verificador con la fila y con la cabecera.

  Se **quita** el riesgo aceptado «`fecha_sesion` no está sellada» que proponía §1.9.
- **`scripts/rls/README.md`**, fila del módulo 14: C.perm, F.17 y F.18.
- **H27** (`cita_id` sin cotejo con la cabecera) va a `docs/state.md` §Hallazgos al cerrar. No
  entra en `architecture.md` como decisión, porque no la hay (P7).

### 9.11 · Decisiones y alternativas descartadas (se añaden a §2; D3 y D5 quedan sustituidas)

- **D3′ · Diecisiete claves.** Las cinco nuevas están siempre presentes; solo `coprofesional_id`
  admite `null` (ADR-071.4, ADR-072.3).
  - *Descartado*: omitir la clave cuando no hay coterapia. «Omitido» y «null» serían dos formas
    canónicas del mismo hecho.
- **D12 · `fecha_sesion` como cadena `AAAA-MM-DD` sacada con `to_char`.**
  - *Descartado*: `to_jsonb(date)`. Su texto depende de `DateStyle`.
  - *Descartado*: un instante ISO. Una fecha de calendario no tiene zona, y un instante movería
    el día según el `TimeZone`.
- **D13 · `for no key update` en el paso 2**, en lugar del `for share` de D5. Por H18, el
  `after insert` actualiza la misma fila en la misma transacción.
  - Con `for share`, dos firmas concurrentes de la misma nota tomarían los dos cerrojos
    compartidos y se interbloquearían al subirlos (40P01).
  - Con `for no key update`, la segunda espera en el paso 2 y relee la cabecera ya confirmada.
  - No choca con el `key share` de las FK.
- **D14 · Los episodios de la fijación van al centro CB**, donde PRO2 ya tiene alta.
  - *Descartado*: dar de alta a PRO2 en CA dentro de 14. El módulo 19 de T-034 inserta ese mismo
    par y el índice único parcial lo rompería (H24).
  - *Descartado*: otro coprofesional. PRO2 es el único profesional sanitario activo de la
    fijación distinto de PRO1.
- **D15 · N067D es gemela de cabecera de N067A**, coprofesional incluido, para que F.12b aísle la
  línea de `nota_id`.
- **D16 · F.15 cambia el autor de N067C**, no el de N067A, por el `check` de T-034.
- **D17 · `sobre_prueba` deriva de la cabecera las cuatro claves** y solo gana `p_nota_id`
  (confirma D4). No usa `into strict`, para poder construir el sobre de una nota inexistente.
- **D18 · Nuevo mensaje de `fn_congelar_cabecera_sellada`.** Tras T-012c es cierto que el sobre
  sella los seis campos, y el mensaje dice que la cita no se coteja con la cabecera (H27). Se
  conserva `no se puede reatribuir`.
  - *Descartado*: dejar el mensaje de T-034, que tras T-012c describiría mal lo que pasa.
- **D19 · El paso 0 se activa por el GUC `role`.**
  - *Descartado*: activarlo por `auth.uid() is not null`. Bajo `postgres` con claims sin limpiar,
    sometería la siembra a una regla de RLS que `postgres` no tiene.
  - *Descartado*: un disparador aparte con un nombre que ordene primero. El orden quedaría
    implícito en un nombre.
- **D20 · Se re-emite `fn_exigir_episodio_en_nota_conjunta`** con la condición invertida («existe
  y no tiene episodio»), en lugar de retirarla. Es el cambio mínimo que cierra el oráculo de H17
  sin quitar una defensa. T-034 dejó fuera retirarla.
- **D21 · Una sola aserción de igualdad** sobre `sqlstate · sqlerrm` completos, y no dos
  `assert_lanza_codigo_msg`. El criterio pide el **mismo** errcode y el **mismo** mensaje, no
  solo el mismo fragmento.

### 9.12 · Cómo se cierra cada criterio (cambios sobre §3)

- **Criterio 2**: sin cambios. Sin la migración, la primera aserción que falla es la de NCONJ
  (01), por la 6.1 de la era 3.
- **Criterio 5** se cierra con todo esto:
  - las negativas C.11a/b, C.12a/b, C.13a/b/c (C.13b: `null` ya no se admite), C.14, C.15a/b/c,
    C.16a/b/c/d y C.era3, todas con `_msg`;
  - los mutantes de 6.11-6.16;
  - las gemelas N067A (con coprofesional) y N067C (`null`);
  - C.congelar;
  - **C.perm**: igualdad de los cuatro errores, candado cerrado, los dos mutantes y la gemela
    N067E;
  - C.perm.0.
- **Criterio 6**: D1 sella la cabecera, y cada campo tiene su escenario:
  - F.13: paciente.
  - F.14: episodio.
  - F.15: autor.
  - F.17: `fecha_sesion`.
  - F.18: coprofesional, en los dos sentidos.

  Cada escenario da su fila, vuelve a 0 al restaurar y da 0 con su mutante. El `grep` de «riesgo
  aceptado» ya no aplica: no queda ningún campo de cabecera sin sellar. La única excepción es
  `cita_id` frente a la cabecera (H27), que queda fuera de este criterio porque la cita no abre
  lectura.
- **Criterio 7**: pasa a F.19.
- **Criterio 9**: se cierra con 9.9:
  - diecisiete claves y era 4;
  - la sensibilidad de `notaId` y de `coprofesionalId` (canónico y huella), y la de los otros
    tres;
  - los rechazos de Zod: `episodio_id` null, `fecha_sesion` mala y `coprofesional_id` omitido.
- **Criterio 12**: el comentario de columna empieza por «Forma del sobre canónico. 4».
- **Criterio 13**: `tipos-bd.ts` no cambia. Antes de pasar `territorio.mjs` hace falta la
  ampliación de P6.

### 9.13 · Riesgos nuevos, por probabilidad

1. **Alta · T-034 cambia algo al llegar a `main`**: UUID de episodios, nombre de un disparador o
   el cuerpo de `fn_congelar`.
   - Mitigación: [V10]; el cuerpo de `fn_congelar` se toma de `pg_get_functiondef`; los nombres
     de disparador se leen de `pg_trigger` antes de escribir F.
2. **Media · El paso 0 se desincroniza de la política** si alguien cambia la política y no el
   disparador.
   - Mitigación: C.perm.0 y el comentario del paso 0.
   - Si divergen, `authenticated` recibe el 42501 del paso 0 en lugar del de la RLS, o al revés.
     Nadie firma sin permiso, porque la RLS sigue detrás.
3. **Media · [V11]**: la firma `authenticated` de N067E choca con otro disparador `after`.
4. **Media · El banco no carga sin el 19.41 actualizado** (P6). Sin ampliar el territorio, T-012c
   no puede cerrar el criterio 3.
5. **Baja · Interbloqueo nuevo por el cerrojo de fila.**
   - Caso: una transacción firma dos notas del mismo paciente (N y luego N′) mientras otra firma
     N′. La primera tiene el consultivo y espera la fila N′; la segunda tiene la fila N′ y espera
     el consultivo.
   - Por qué es baja: T-012 firma una nota por acción, y la siembra y el banco firman en una sola
     sesión.
   - Se documenta en el comentario del paso 3.
6. **Baja · Oráculo de tiempo del paso 0**: el `exists` cuesta distinto si la nota existe.
   Aceptado: exige medir microsegundos sobre un UUID que ya hay que conocer.
7. **Baja · [V9]**: si el GUC `role` no se ve dentro del *definer*, C.perm falla.
   - Alternativa ya decidida: activar el paso 0 con `(select auth.uid()) is not null` y
     documentar que la siembra corre sin claims.

### 9.14 · Qué revisar (se añade a §5)

**Qué elige el llamante y qué efecto tiene**
- [ ] `authenticated` elige `nota_id`, el sobre entero, `autor_id` y `alcance`. El paso 0 decide
  si puede firmar **antes de leer nada de la cabecera**. Solo después se leen paciente, episodio,
  autor, fecha y coprofesional, y se cotejan con el sobre.
- [ ] Al firmar no se revalida el coprofesional (rol, centro): se coteja con la cabecera, que ya
  validó T-034 al escribirla.
- [ ] La `fecha_sesion` del sobre no admite hora, zona ni formato local (C.15c, Zod).

**Pruebas que deben fallar, y por qué motivo exacto**
- [ ] Sin el paso 0 (mutante), cada intento falla por un motivo distinto:
  - `err_b`: el 23514 de la 6.14;
  - `err_x`: el de la 6.12;
  - `err_n`: un P0002.

  Si el mutante da tres errores iguales, C.perm no prueba nada.
- [ ] Con la condición vieja de 2b, `err_c` es el 23514 «alcance conjunta»: es la puerta lateral
  del oráculo.
- [ ] C.13b falla por la 6.13, no por Zod ni por la 6.1: la clave está, con `null`.
- [ ] C.16b (null frente a PRO2) y C.16c (PRO2 frente a null) fallan los dos por la 6.16. Un `->>`
  con `<>` dejaría pasar C.16b.
- [ ] C.16d falla por la 6.1, no por la 6.16.
- [ ] F.12b llega a 0 con el mutante solo porque N067D es gemela de N067A.

**Invariantes que se podrían saltar por otra puerta**
- [ ] **Null.** `coalesce(…, false)` solo en el paso 0; `coalesce(…, 'null'::jsonb)` solo en la
  6.16 y en su línea del verificador. En ningún otro sitio.
- [ ] **Otro disparador antes.** `exigir_episodio_en_nota_conjunta` corre antes que el sellado
  por orden alfabético. Cualquier otro `before insert` sobre versiones que lea la cabecera repite
  el oráculo. Se comprueba con
  `select tgname from pg_trigger where tgrelid = 'public.notas_clinicas_versiones'::regclass and not tgisinternal order by tgname`.
- [ ] **Concurrencia.** El paso 2 lleva `for no key update` y va **después** del paso 0, así que
  un llamante sin permiso no llega a bloquear la fila de nadie.
- [ ] **Cambio de cabecera entre lectura y firma** (antes de la primera versión, cuando aún no
  está congelada). Lo serializa el cerrojo de fila. Si el sobre se hizo con la cabecera vieja, la
  6.1x da 23514, y T-012 lo traduce a conflicto.
- [ ] **Permisos de tabla entera.** El `grant insert` de tabla a `authenticated` (H16) no cambia;
  el paso 0 y la RLS dicen lo mismo. El `revoke` se repite en las cuatro funciones re-emitidas.
- [ ] **TRUNCATE o DELETE de la cabecera.** El `left join` señala la versión con todos los
  `cab_*` nulos (§5, sin cambios).
- [ ] **Forma.**
  - Cada `disable` tiene su `enable`, también el de `exigir_episodio_coherente_en_nota`.
  - Ninguna variable de psql va dentro de `$$`.
  - Los UUID de C.perm van por `format(%L)`, nunca dentro del `\!`.

### 9.15 · Territorio

- El del contrato **más** `scripts/rls/19-nota-en-episodio.sql`, solo para la llamada de 19.41.
  Pendiente de aprobación del propietario (P6). Sin ella, el banco no carga con la firma nueva de
  `sobre_prueba`.
- `docs/state.md` se escribe solo para anotar H27 en §Hallazgos, como manda la constitución.

### 9.16 · Delegable (sustituye §7)

Mecánico, una vez aprobada la migración:
- Regenerar el JSON de vectores y copiar los cuatro literales.
- Actualizar las 41 llamadas a `sobre_prueba` (5 + 1 + 34 + 1), las 5 de la siembra y las de t005.
- Añadir las cinco claves a los literales de NCADX en C.
- Poner la `fecha_sesion` explícita en el `insert` de las siete notas de 14.
- La documentación.

No delegable:
- el paso 0 y 2b;
- el disparador y el verificador;
- C.perm entero;
- F.12-F.19;
- los mutantes y los ayudantes;
- los fragmentos de `_msg`;
- `fechaIso` y las pruebas de Zod.

### 9.17 · Lo que no entra, y por qué (sustituye la lista final)

- **Cotejar el `cita_id` del sobre con `notas_clinicas.cita_id`** (H27). Un firmante podría
  declarar en el sobre otra cita suya y sellar «en sesión» con el margen de esa cita. No lo pide
  ningún ADR ni el contrato, y la cita no abre lectura. Queda como hallazgo y como P7.
- **Revalidar el coprofesional al firmar** (alta vigente el día de la firma). El ADR-072 lo valida
  al escribir la cabecera, y la cabecera se congela en la primera firma.
- **Retirar `fn_exigir_episodio_en_nota_conjunta`.** 2b la neutraliza como oráculo sin quitarla.
- **`numero_version` (N2), `ALGORITMO_VERSION`, anclaje externo y TS-B3**: fuera por contrato.
- **Normalizar `cita_id` a minúsculas**: sin cambios respecto a §8.
- **Nada de T-012** salvo su §1.1, que ya está escrito.

### 9.18 · Preguntas al propietario

Estado de las preguntas de §8:
- **P1**: cerrada por el ADR-071.1 y .4.
- **P2**: cerrada por el ADR-071.5 (paso 0).
- **P3**: cerrada por el ADR-071.7.
- **P4**: cerrada por el ADR-071.6; hecho en `tickets/T-012/diseno.md` §1.1.
- **P5**: cerrada por el ADR-071.4 (`fecha_sesion` sellada).

Ningún ADR choca con este diseño. Quedan abiertas dos:

- **P6 (bloquea el criterio 3).** ¿Se amplía el territorio de T-012c con
  `scripts/rls/19-nota-en-episodio.sql`, solo para la llamada de 19.41?
  - Motivo: T-034 crea el módulo llamando a `sobre_prueba` con la firma vieja, y T-012c cambia esa
    firma por contrato.
  - Alternativa: que T-034 escriba ya en 19.41 un sobre literal en lugar de llamar a
    `sobre_prueba`. Eso obliga a enmendar T-034.
- **P7.** Por H27, ¿se abre un ticket para cotejar el `cita_id` del sobre con la cabecera? No
  cambia la forma del sobre ni abre una era 5: sería una comprobación 6.17 y una línea más en el
  verificador.
