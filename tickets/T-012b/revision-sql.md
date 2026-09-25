Sin hallazgos ALTA. 0 ALTA · 1 MEDIA · 1 BAJA.

# T-012b · Revisión SQL (revisor 1 de 2)

Alcance de esta revisión: la migración `supabase/migrations/20260924150000_verificador_coteja_sobre_y_fila.sql`,
la sección F de `scripts/rls/14-cadena-huellas.sql` y la adaptación de D.1 y D.2.
Diff: `git diff main...worktree-agent-a47a1a55a62171516` (base `1496de7`). No he leído ni la evidencia
ni el informe del verificador. No he ejecutado `db reset` ni el banco, porque la base estaba en uso.
Sí he lanzado consultas de solo lectura contra `supabase_db_Psicogestion`, donde la función nueva
ya está aplicada.

## Diseño §5 «Qué revisar», punto por punto

1. **Firma idéntica y `create or replace`.** Cumple. He comparado con `diff` el cuerpo nuevo con el de
   `20260829210000_cadena_de_huellas.sql:513-596`. Solo cambian tres cosas: `create or replace`,
   nueve columnas más en el CTE `c` y la rama nueva con `order by 1, 2, 6`. Las seis columnas de
   retorno, `language sql stable security definer set search_path = ''` y `default null` son las
   mismas. `lib/supabase/tipos-bd.ts` no aparece en el diff. El `revoke all … from public, anon,
   authenticated, service_role` se repite (línea 172) y `F.0 · permisos` lo comprueba para los tres roles.
2. **Cada comparación tiene la semántica del disparador.** Cumple, y el predicado se ha copiado
   literalmente del diseño (líneas 139-147). Lo he contrastado con `20260915130000_alcance_en_el_sobre.sql:180-296`:
   - **Trampa del NULL.** Ninguna rama usa `->>` ni `<>`: todas usan `is distinct from`, que nunca da NULL.
     La única que puede dar NULL es `jsonb_typeof(c.sobre) <> 'object'`, y solo cuando `c.sobre is null`,
     que ya es verdadero en el mismo `or`. Las cinco columnas de la derecha que no son anulables
     (`alcance`, `autor_id`, `cuerpo`, `esquema_version`, `creada_en`) son `not null` en el esquema.
     Las dos anulables pasan por `coalesce(to_jsonb(x), 'null'::jsonb)`. Si al sobre le falta una
     clave, `-> k` da NULL frente a un valor no nulo, así que la fila se señala.
   - **`cuerpo` como JSON.** Se compara `c.sobre -> 'cuerpo'` con `c.cuerpo::jsonb`. D.2 8.1 (reescritura
     jsonb-equivalente) sigue a 0 y F.3 (no equivalente) da 1.
   - **Igualdad de cadenas.** Medido: `'"a"'::jsonb = to_jsonb('a'::text)` da `t` y `'3.0'::jsonb = to_jsonb(3::smallint)`
     también. En jsonb la igualdad de cadenas es byte a byte con la collation por defecto, que es
     determinista, igual que el `->> … <>` de la 6.4/6.6. Una fila honesta no puede salir divergente.
   - **`creada_en` en UTC.** `to_char(v.creada_en at time zone 'UTC', …MS"Z")` es el mismo formato que la
     6.7 y que `sobre_prueba`, y no depende de `TimeZone`. Medido: `.123999` se trunca a `.123`, igual
     que en el disparador y que `toISOString`, así que una fila con microsegundos no da un falso positivo.
     `F.0 · zona` (Pacific/Kiritimati, +14 h) se pondría roja si faltara el `at time zone`, y el valor
     guardado con `\gset` se restaura. `to_char` de `'infinity'` da NULL, que se señala; no abre ningún agujero.
3. **El cast va dentro de `CASE`.** Cumple, y el CTE está referenciado seis veces, así que se
   materializa. Medido: `pg_input_is_valid('{"a":"\u0000"}', 'jsonb')` devuelve `f` sin lanzar. Esas dos
   ramas son hoy inalcanzables porque lo impiden los CHECK de H9.
4. **`c.algoritmo_version = 1`** está en la rama nueva (línea 136), y la columna es `not null`.
5. **F.1 prueba lo que dice.** La aserción exacta (`array['sobre_no_coincide_con_fila@1']`) excluye
   `huella_no_coincide`. La contigua `F.1 · la huella de la fila sigue cuadrando` recalcula el `digest`
   sobre la fila. `pg_temp.assert` usa `is distinct from true`, así que el `array_agg` NULL del
   verificador de T-005 sí la pone roja. La salida roja de §3 fila 2 (ii) es cosa de la evidencia y no la he leído.
6. **Cerrojos devueltos.** `enable trigger` y `revoke update`, con sus dos aserciones (`has_table_privilege`
   y `tgenabled = 'O'`), antes de F.10 y F.11 y antes de los módulos 15-17.
7. **Otras puertas.** F.11 cubre el INSERT con `sellar_version_nota` apagado (PDEMO). F.4-F.7 cubren
   el NULL en los dos sentidos. Las filas duplicadas de D.1 están asumidas. Sobre filas honestas de
   otras eras: la guarda de `20260915130000:26-37` impide que existan filas de `esquema_version` < 3,
   así que ninguna fila real se coteja con una forma vieja.
8. **CLI.** Fuera de mi parte, salvo la consulta: `jsonb_agg(t order by …, t.motivo)` es correcta.
9. **Territorio.** Los cinco ficheros del diff están declarados. No se tocan `lib/huella/**`,
   `fn_sellar_version_nota()` ni la forma del sobre.

D.1 y D.2 están bien adaptadas. `count = 2`, más el array exacto `huella_no_coincide@2`,
`sobre_no_coincide_con_fila@2`, sustituye las tres subconsultas escalares, que habrían lanzado
«more than one row». La aserción nueva de 8.2 (motivo escalar `huella_no_coincide`) se pondría roja
si el cotejo tratara como divergente la reescritura jsonb-equivalente del sobre.

---

## MEDIA

### M1 · `docs/state.md` no recoge que un comentario de `fn_sellar_version_nota()` pasa a ser falso, y falta la bitácora

- **Dónde:** `supabase/migrations/20260915130000_alcance_en_el_sobre.sql:161-163` (fuera del diff,
  pero lo vuelve falso este ticket). También faltan `docs/state.md` y `docs/bitacora/T-012b.md` en
  `git diff --name-status main...worktree-agent-a47a1a55a62171516`.
- **Descripción:** el diseño (§1.4 y «Lo que no entra») manda anotar en `state.md` §Hallazgos que ese
  comentario queda desfasado, y escribir la bitácora (regla 4 de `CLAUDE.md`). La rama no trae
  ninguna de las dos cosas.
- **Escenario:** se integra la rama tal cual y T-012c (ADR-067, `nota_id` al sobre, `esquema_version` 4)
  reescribe `fn_sellar_version_nota()` entera con `create or replace`, como hace cada era. Su
  implementador copia el comentario vivo: «tampoco detecta un `alcance` de columna alterado por
  debajo sin tocar el sobre […] anotado en docs/state.md §Hallazgos abiertos». Desde T-012b es falso.
  Además, en `state.md` no hay ninguna nota que le diga que lo corrija, y la regla 2 obliga a que
  la haya. Se cierra si el paso de integración añade la bitácora y la nota. Si ya está previsto así,
  basta con comprobarlo antes del merge.

## BAJA

### B1 · Varias líneas del predicado no tienen ninguna prueba que se ponga roja si se quitan, y la tabla del diseño dice lo contrario de F.9

- **Dónde:** migración, línea 147 (`firmada_en`), líneas 143 y 145 (tipado estricto de 6.4 y 6.6);
  banco, `scripts/rls/14-cadena-huellas.sql:979-986` (F.9), `:934-950` (F.4 y F.5) y `:1015-1025` (F.11).
- **Descripción:** F.9 mueve la columna `creada_en`, y eso enciende a la vez las líneas 146
  (`creada_en`) y 147 (`firmada_en`). Si se quita cualquiera de las dos, F.9 sigue en verde. La tabla
  del diseño (§1.2, fila F.9: «se usa `firmada_en` en lugar de `creada_en`») afirma que F.9 lo atrapa,
  y no es así. Pasa lo mismo con 6.4 y 6.6: si se reescriben como `(c.sobre ->> k) is distinct from c.col`,
  que ya no es la trampa de `<>` pero pierde la distinción de tipo y la de clave ausente, F.4, F.5,
  F.6 y F.7 siguen en verde. F.11 solo pide que la rama exista en PDEMO, y ya la encienden `autor_id`
  y `esquema_version`.
- **Escenario:** según el ADR-067 (en `main` desde `061cf39`), T-012c volverá a redefinir
  `verificar_cadena_huellas()` entera para cotejar `nota_id`. Si al copiarla se cae la línea 147, o
  se simplifican las 6.4 y 6.6 a `->>`, el banco completo sigue en verde. Ese hueco solo lo aprovecha
  una fila insertada con `sellar_version_nota` apagado, la puerta de F.11. Por ejemplo, un sobre con
  `firmada_en` distinto de `creada_en` y la huella bien calculada sobre sus bytes, que ninguna otra
  rama señala. Arreglo barato: una fila como la de PDEMO pero con la huella correcta, y con solo
  `firmada_en` desalineado (y otra con `"anotaciones_reservadas": 5` frente a la columna `'5'`), que
  espere exactamente `array['sobre_no_coincide_con_fila@1']`. Como mínimo, una aserción de catálogo
  sobre `pg_get_functiondef('public.verificar_cadena_huellas(uuid)'::regprocedure)` que exija las
  nueve claves.

---

Descartados, por no tener un escenario de fallo concreto:
- Un cambio de `creada_en` por debajo del milisegundo no se detecta, pero tampoco lo detecta la 6.7,
  y no cambia ningún dato visible.
- Un `numero_version` alterado no está en el sobre. Adelantarlo exige `motivo_cambio` no nulo por el
  CHECK, y la línea 145 lo señala.
- `tgname` sin filtrar por `tgrelid` repite el patrón de D y hoy es único.
- `drop` más `create` también quedaría cubierto por el `revoke` repetido. El invariante que importa,
  que nadie de la API tenga EXECUTE, se cumple y está probado.
