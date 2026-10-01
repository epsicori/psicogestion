Sin hallazgos ALTA (total 0 ALTA, 1 MEDIA, 3 BAJA · revisor A: 0/0/1, H4 en revision.json · revisor B: 0/1/2, H1-H3).

# T-012c · Revisión

## Revisor A: migración `20261001120000_nota_id_en_el_sobre.sql` y la constitución

Diff revisado: `main...worktree-agent-ac6451d13a104b7e4` (base 62be550, HEAD 31c2923). La
migración se leyó de `git show HEAD:` porque el verificador la retiró del árbol del worktree
para su criterio 2. No se usó la base local.

### Constitución (regla 6): se cumple

- La migración no hace ningún `update` ni `delete` sobre las tablas de solo adición.
- La guarda de era (líneas 28-39) aborta si `notas_clinicas_versiones` tiene alguna fila,
  así que no hay versiones de la era 3 que reinterpretar.
- Los disparadores `impedir_modificacion_*` e `impedir_truncado_*` no se tocan.
- `fn_congelar_cabecera_sellada` (608-632) solo cambia su mensaje y su comentario. Los
  campos congelados siguen siendo los mismos.
- El banco equilibra cada `disable trigger` con su `enable` (14:1670-1671) y comprueba
  después que los cerrojos han quedado puestos (14:1686-1700).
- Cada mutante del banco se restaura desde `pg_get_functiondef()` guardado con `\gset`, nunca
  desde una copia a mano.

### «Qué revisar» (§5 y §9.14 del diseño): comprobado punto por punto

- **6.11-6.16** (342-384):
  - Las seis comparan `jsonb` con `is distinct from`, de modo que una clave ausente o un
    `null` JSON no se cuelan como «falso».
  - 6.16 es la única que convierte un null de SQL en `'null'::jsonb` a propósito, y lo
    documenta.
  - Las seis dan 23514 y el texto exacto del diseño.
  - En el banco, cada una tiene su negativa con el fragmento del mensaje, su mutante y su
    gemela positiva.
- **Paso 0, permisos antes que el cotejo** (78-88):
  - Su condición es literalmente el WITH CHECK de la política `notas_clinicas_versiones_alta`:
    `historia_desbloqueada()`, autor igual a `auth.uid()` y la nota del autor.
  - Va envuelta en `coalesce(…, false)`, de modo que una nota inexistente (nulo) también
    entra en el 42501.
  - Corre antes de leer la cabecera.
  - En el banco, C.perm da el mismo 42501 para cinco casos: nota ajena, sobre incoherente,
    nota inexistente, conjunta y ventana caducada.
  - Con el paso 0 mutado, el banco devuelve tres errores distintos, así que la prueba
    discrimina.
  - 2b ya no actúa de oráculo de existencia: su condición pasa a `exists (… episodio_id is
    null)`. Tras T-034 no se cumple nunca, y la conjunta llega al paso 0.
- **Lectura de la cabecera**: usa `for no key update` (118-122), y el comentario explica por
  qué no `for share`: el interbloqueo 40P01 con `vaciar_borrador_al_firmar`.
- **`verificar_cadena_huellas()`** (440-572):
  - Usa `left join` con la cabecera.
  - Añade una línea por clave nueva (562-568) y coteja `paciente_id` tanto con la fila como
    con la cabecera.
  - Una versión huérfana queda detectada: con `cab_*` nulos, la comparación con el sobre da
    verdadero.
- **Revokes y comentarios**:
  - El disparador lleva `revoke … from public, anon, authenticated, service_role` (397).
  - El verificador lleva el suyo (595).
  - `congelar` lleva `revoke … from public, anon, authenticated`.
  - La columna `esquema_version` pasa a `default 4` con su comentario al día (643-658).
  - El párrafo falso de la era 3 («tampoco detecta un `alcance`…») ha desaparecido.
- **Cuerpo del disparador frente a la era 3**: el diff contra `20260915130000` solo contiene
  los cambios previstos. Ninguna comprobación anterior se ha perdido.

### Hallazgos

#### BAJA

**H4 (A) · `supabase/migrations/20261001120000_nota_id_en_el_sobre.sql:371` (y `:567` en el
verificador).** `to_char(fecha, 'YYYY-MM-DD')` descarta la era, así que 6.15 y su cotejo en el
verificador no distinguen una `fecha_sesion` antes de Cristo de la misma fecha después de
Cristo.

- **Escenario del verificador.** El atacante tiene los cerrojos levantados (el modelo de
  amenaza del verificador):
  1. Ejecuta `alter table notas_clinicas disable trigger congelar_cabecera_sellada`.
  2. Ejecuta `update notas_clinicas set fecha_sesion = '2026-08-29 BC'` sobre una nota firmada
     con `"fecha_sesion":"2026-08-29"`.
  3. `to_char` devuelve `'2026-08-29'` también para la fecha BC.
  4. `verificar_cadena_huellas()` devuelve 0 filas: la cabecera se ha reatribuido a otra
     fecha sin romper la cadena.
- **Escenario del disparador.** `notas_clinicas.fecha_sesion` no tiene ningún `check` de
  rango.
  1. Antes de la primera firma, el autor pone su propia cabecera a `'2026-08-29 BC'`, cosa
     que la política de modificación le permite.
  2. Después inserta directamente una versión con `"fecha_sesion":"2026-08-29"`.
  3. 6.15 la acepta.
  4. Queda sellado un sobre que no dice la fecha que guarda la cabecera.
- **Alcance.** Es estrecho: el camino de la aplicación (`lib/huella/sobre.ts:54`) rechaza
  cualquier fecha que no sea `AAAA-MM-DD`. Pero el cotejo promete igualdad de valor y no la
  da.
- **Lo que cierra el hallazgo:**
  - Un formato que conserve la era, o comparar `(sobre->>'fecha_sesion')::date = fecha`
    dentro de un bloque que capture el error de conversión.
  - O bien un `check (fecha_sesion >= date '1900-01-01')` en la cabecera.
  - En los dos casos, con su negativa en el banco.

### Descartado (sin escenario de fallo)

- **2b solo hace `revoke … from public`.** Una función de disparador no se puede llamar
  directamente, y su revoke es el mismo que el del original.
- **`service_role` y `postgres` quedan fuera del paso 0.** Tienen BYPASSRLS y la política
  tampoco los alcanza. El paso 0 replica la política, no la amplía, y eso es lo diseñado.
- **`docs/bitacora/T-012c.md` aún no existe.** La bitácora se escribe en el cierre de
  memoria, después de integrar (como en T-033); no corresponde a esta etapa.
- **`cita_id` no se coteja con la cabecera.** Ya consta como H27 en `docs/state.md`, sin
  decisión, y es fuera de alcance por diseño.

## Revisor B: sobre.ts, vectores, generadores SQL y banco 14

Alcance: `git diff main...worktree-agent-ac6451d13a104b7e4` (base 62be550). No se ha usado la base local. Los ids de abajo son los de `revision.json`.

### Comprobado sin hallazgo

- **`lib/huella/sobre.ts`**:
  - Era 4, 17 claves en orden JCS.
  - `coprofesional_id` es nulable pero siempre está (`.nullable()`, sin `.optional()`).
  - `fecha_sesion` es `AAAA-MM-DD`, sin hora ni zona.
  - Los UUID van en minúsculas.
  - `vitest run lib/huella`: 99/99.
- **Vectores**, comprobados con un guion fuera del repo:
  - Los 9 del JSON reproducen su `huella_hex`.
  - Los tres `$vec$` de 14 (líneas 234, 243 y 252) son byte a byte genesis-minimo, acentos-nfd y control-y-exponente.
  - `\set VECGENESIS` (14:270) es genesis-minimo.
  - Los tres generadores SQL emiten las mismas 17 claves, en el mismo orden y con la misma forma: `00-ayudantes.sql` `sobre_prueba`, `seed-completo.sql` `pg_temp.sobre` y `t005-concurrencia.sql` `t005_sobre_prueba`.
- **Ninguna copia a mano en 14**: no aparece ningún `create or replace function public.`.
  - Todos los mutantes se derivan de `:'verif_original'`, `:'sellar_original'` o `:'conjunta_original'` con `t012c_mutar`, que exige que el fragmento aparezca una sola vez. Cubre C, C.perm, F.9b y F.12b-F.18.
  - Todos se restauran con `t012c_restaurar`, que compara con `pg_get_functiondef`.
  - F.9b vuelve a comprobar el `revoke` de EXECUTE.
- **F.12b, F.14, F.16 y F.18**:
  - F.12b usa N067D, la gemela de cabecera.
  - F.14 y F.18 prueban los dos sentidos.
  - F.16 prueba la línea de fila de `paciente_id`.
- **Cada `disable` tiene su `enable`**:
  - 1575-1576 con 1670-1671.
  - `impedir_modificacion_…` se vuelve a activar en 1686.
  - 1695-1700 comprueba `'O'` en los tres.
- **Variables de psql**: ninguna dentro de `$$`. En 01 y en C.perm van por `format(%L)`.
- **Ficheros que no se tocan**: `firmar.ts`, `vectores-sql.test.ts` y el guion de vectores no aparecen en el diff.
- **Territorio**: `territorio.mjs T-012c` lo da todo por dentro. `docs/state.md` solo cambia la línea de H27 (diseño §9, l.996), que sustituye la nota «Para T-012c» que este ticket resuelve.

### Hallazgos

#### MEDIA

**H1 (B) · `scripts/rls/14-cadena-huellas.sql:437`: la regresión del ALTA de T-005, «autor_id JSON null lanza 23514 POR LA 6.2», ya no distingue la 6.2.**

El fragmento que exige, `'El autor_id del sobre no coincide'`, es desde T-012c también el prefijo del mensaje de la 6.14, con el mismo 23514:
- 6.2 (migración:224): «…con la columna autor_id…».
- 6.14 (migración:365): «…con el autor de la cabecera…».

Escenario:
1. Alguien reescribe la 6.2 como `(v_contenido->>'autor_id') <> new.autor_id::text`, que es justo el hueco que vigila esta regresión.
2. Con el sobre `"autor_id":null`, `NULL <> x` es falso y la fila pasa la 6.2.
3. La 6.14 (`->` con `is distinct from`) la para con 23514.
4. La prueba sigue en verde y su rótulo sigue diciendo «POR LA 6.2».

Dos detalles empeoran el caso:
- El comentario de 14:428-429 promete una demostración «CON EL ARREGLO DESHECHO (más abajo)» que no existe.
- La negativa de 14:368 ya usa el fragmento que sí distingue: `'…no coincide con la columna autor_id'`.

#### BAJA

**H2 (B) · `scripts/rls/14-cadena-huellas.sql:906`: con el paso 0 mutado, C.perm acepta `err_b2 like '23514 · El autor_id%'`, que casa tanto con la 6.2 como con la 6.14.** §9.14 pide exactamente el 23514 de la 6.14.

Escenario: si `sobre_b` y la columna `autor_id` del insert sobre N067B dejaran de coincidir, el error pasaría a ser el de la 6.2. La aserción seguiría verde y ya no probaría que se llega al cotejo con la cabecera.

**H3 (B) · `scripts/rls/14-cadena-huellas.sql:855` (también 875 y 931): C.perm desbloquea con `'999999'` (PRO2) y `'424242'` (PRO1).** Esos PIN no los fija la fijación (01:211-212 pone `'111111'` y `'222222'`); los deja `13-cuentas.sql` en las líneas 198 y 384. Es justo el estado global que no se debe suponer (`.claude/rules/pruebas.md`).

Escenario: alguien cambia el PIN de la gemela positiva en 13:384 y 14 se cae en «C.perm · PRO1 desbloquea su historia», un fallo sin relación con T-012c y a varios módulos de la causa. Se cierra fijando el PIN dentro de C.perm (`como_con_2fa` + `fijar_pin_historia`).

### Anotado sin severidad (sin escenario de fallo)

- 14:605: el rótulo «dieciocho negativas de T-005/T-012a» sigue intacto tras reescribir esas negativas a la era 4. No he contado si siguen siendo dieciocho.
- 14:1491-1500: el comentario de F.9b dice que repetir el mutante para 6.4 y 6.6 «no compensa». Con `t012c_mutar` ese coste ya no existe.
