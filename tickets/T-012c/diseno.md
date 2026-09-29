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
