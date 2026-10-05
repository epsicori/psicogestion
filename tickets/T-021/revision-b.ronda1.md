**Hay 1 hallazgo ALTA (H1, regla 6 de la constitución): el gate de esta etapa no pasa hasta que decida el propietario.**

# T-021 · Revisión B (corrección de datos y pruebas)

Diff revisado: `git diff main...worktree-agent-a19ecdb63f2c1e386` (12 ficheros, +2581). Base: la
migración `20261011120000` ya aplicada en `supabase_db_Psicogestion` (max(version) = 20261011120000).
Todas las mediciones se hicieron como postgres dentro de `begin … rollback`, cargando
`00-ayudantes.sql` + `01-fijacion.sql` del worktree y con `ON_ERROR_ROLLBACK on`. No se tocó nada.

Recuento: **1 ALTA · 3 MEDIA · 6 BAJA**.

He repasado la lista A.5/PA.5 punto por punto:

- **Columnas que elige el llamante** (I1-I6): bien en las versiones. Mal en la cabecera: H3.
- **Paso 0 antes del cotejo** (I8-I13): bien.
- **Mutantes**:
  - M1-M5 y M6b, muertos por su aserción.
  - M6a **no es equivalente**: H4.
- **Nulos**:
  - NIF, todo o nada (J12, J35): bien.
  - `centro_id` null (J10): bien.
  - `rol_actual()` nulo: las políticas comparan en positivo.
- **Duplicados**:
  - tarifas solapadas (K3): bien.
  - clave repetida (J4, J22): bien.
- **Concurrencia**: sin prueba (H9).
- **Permisos de tabla entera** (L3-L7): bien.
- **TRUNCATE**, capa 3 y cobertura (B15, L8): bien.
- **Puertas del técnico** (F1-F10): bien.

---

## ALTA

### H1 · `supabase/migrations/20261011120000_economico_esquema.sql:1011`: tres datos económicos se reescriben en sitio con UPDATE (regla 6)

**Qué pasa.** La migración concede tres UPDATE sobre datos económicos sin versión nueva:

- `grant update (caducidad) on bonos` (L1011): sin disparador, se cambia cuantas veces se quiera y en cualquier dirección.
- `grant update (vigente_hasta) on tarifas_paciente` (L1006).
- `grant update (bono_id) on citas` (L220) sobre citas ya realizadas. El propio comentario de L216-217 lo llama «corregir un cobro».

En los tres casos el valor anterior solo sobrevive en `auditoria`. La regla 6 dice «nada […] económico se modifica […] la base de datos debe impedirlo». El diseño usó esa misma letra para descartar el espejo como caché (diseno.md L770, «rompe la letra de la regla 6»), pero no la aplicó a estas tres columnas.

**De dónde viene.** Del diseño (A.1-D8 y §12 de grants), no del implementador. El contrato no pide que `caducidad` sea mutable, y «cerrar la vigente» admite un modelo de solo adición.

**Escenarios, medidos:**

- **S13, un bono que se «des-consume».** Bono de 3 sesiones con una cita realizada: `bonos_consumo` = 1. PRO1 hace `update citas set bono_id = null` sobre esa cita realizada de hace 30 días. Pasa, y `bonos_consumo` = 0. El paciente recupera una sesión pagada y consumida, y la tabla ya no dice que se consumió.
- **Caducidad adelantada.** Bono vendido con `caducidad = 2027-10-05`. ADM hace `update bonos set caducidad = '2026-10-04'` y el bono queda caducado hacia atrás. La fila solo enseña el último valor.
- **Tarifa:** ver H2.

**Dos salidas, que decide el propietario:**

- **(a)** Enmendar la regla 6 con una excepción explícita y un ADR: «vigencia y caducidad se cierran una sola vez, hacia delante; el vínculo cita→bono se congela al realizarse».
- **(b)** Solo adición:
  - la vigencia de una tarifa la cierra la siguiente `vigente_desde`;
  - la caducidad pasa a una hija de solo adición donde manda la última fila (ojo con el patrón «última fila» al leerla);
  - `bono_id` queda inmutable una vez la cita está `realizada`.

**Compatibilidad.** Hoy no hay filas, así que cambiarlo cuesta solo la migración. Después del merge, pasar a (b) obliga a migrar `tarifas_paciente.vigente_hasta` y `bonos.caducidad`.

---

## MEDIA

### H2 · `supabase/migrations/20261011120000_economico_esquema.sql:714`: el cierre de tarifa admite fechas pasadas y `creada_en` lo elige el llamante

**Qué pasa.** `fn_cerrar_tarifa()` solo comprueba `old.vigente_hasta is not null`. No comprueba el valor nuevo frente a `current_date`. Además, `tarifas_paciente.creada_en` (L63) entra con el grant de insert de tabla entera.

**Escenario, medido (S11):**

1. La tarifa de P1 vale 60 € desde 2026-01-01, y los borradores de marzo se hicieron con ella.
2. El 05-10-2026, PRO1 ejecuta `update tarifas_paciente set vigente_hasta = '2026-02-01'`, y pasa.
3. PRO1 inserta una tarifa de 90 € desde 2026-02-01 con `creada_en = '2026-02-01'`, y pasa.
4. Resultado: la tabla dice que en marzo regía 90 € y que esa tarifa se creó en febrero. El borrador de marzo ya no «se puede explicar» (contrato L62-64). La verdad solo queda en `auditoria.ocurrido_en`.

Es el patrón de T-041: «solo cierre» que deja fechar el cierre hacia atrás.

**El banco lo consagra.** K4 (`26-economico.sql:825`) cierra TAR1 en `2026-06-01`, ya pasado, como caso positivo.

**Arreglo sin migrar datos.** En el disparador, `new.vigente_hasta >= current_date` y `creada_en` forzado a `now()` para `authenticated`. K4 tendría que usar una fecha futura y ganar su negativa.

### H3 · `supabase/migrations/20261011120000_economico_esquema.sql:889`: `borradores_factura_alta` no exige `creado_por = auth.uid()`; la cabecera se abre a nombre de otro

**Qué pasa.** Las altas de tarifas, cobros y bonos sí fijan la autoría (L958 y hermanas). La de la cabecera del borrador no. El diseño también la omitía.

**Escenario, medido (S9).** Como PRO1:

```sql
insert into borradores_factura (paciente_id, profesional_id, creado_por, creado_en)
values (P1, PRO1, ADM, '2020-01-01')
```

Pasa, y devuelve `creado_por = ADM` y `creado_en = 2020-01-01`. La cabecera de un registro preparatorio que la LGT obliga a conservar dice que la abrió el administrador hace seis años.

**El banco no lo ve.** La sección G no tiene ninguna negativa de autoría.

**Arreglo sin migrar datos.** Añadir `and creado_por = (select auth.uid())` a las dos ramas del `with check`, con su negativa y su gemela.

### H4 · `tickets/T-021/mutantes.json:42`: M6a se declara equivalente y no lo es; el banco sigue verde sin la línea `total_centimos` del verificador

**Por qué no es equivalente.** El argumento («el check `base + cuota_iva = total` obliga a cambiar base o cuota») restringe la **fila**, no el **sobre**. El verificador tampoco comprueba que el sobre sea coherente por dentro: no mira que la suma de las líneas cuadre con `total_centimos`.

**Escenario, medido (S1):**

1. Con los cerrojos levantados como en B, se cambia en el sobre de la v2 de BORR1 `"total_centimos":6000` por `7000`, y se recalcula la huella de la v2 (es la última, así que no hay eslabón que la delate).
2. `verificar_cadena_borrador` devuelve solo `sobre_no_coincide_con_fila`.
3. El cotejo clave a clave da `base_ok = t`, `cuota_ok = t`, `lineas_ok = t` y `total_ok = f`.

Sin la línea L689 (`total_centimos`), el verificador devuelve cero filas: un sobre sellado que dice 70 € sobre una fila de 60 €.

**El banco no lo cubre.** Ninguna aserción de B altera el sobre recalculando la huella (B9 no la recalcula). Quitar la línea deja el banco verde.

**Arreglo.** Una aserción en B: total del sobre alterado y huella recalculada ⇒ `sobre_no_coincide_con_fila`. Corregir el `resultado` de M6a.

---

## BAJA

### H5 · `supabase/migrations/20261011120000_economico_esquema.sql:501`: `tipo_iva_centesimas` no está atado a `regimen_iva` ni a la cuota

**Qué pasa.** Solo se exige un entero ≥ 0. No se exige 0 si la línea es exenta, ni > 0 si es general. Tampoco se exige cuota > 0 cuando hay una línea general con tipo > 0. L533-537 solo cubre «todo exento ⇒ cuota 0».

**Escenarios, medidos:**

- **S2:** una línea `exento_sanitario` con `tipo_iva_centesimas = 2100` se sella. El comentario de la columna dice «0 si exento».
- **S3:** una línea `general` al 21 % con cuota 0 y total 100 se sella. Es IVA no repercutido, que T-026 enviaría tal cual, y queda en una cadena de solo adición.

**Lo que excluyó el diseño, y lo que no.** El diseño excluyó repetir el redondeo (L642-645), pero estas comprobaciones son categóricas, no de redondeo.

**Arreglo.** En el disparador: exento ⇔ 0, y general ⇒ > 0. Solo afecta a filas nuevas.

### H6 · `supabase/migrations/20261011120000_economico_esquema.sql:137`: base y cuota sin coherencia de signo

**Qué pasa.** Solo hay `check (base + cuota_iva = total)`, y el disparador no pone signo a la base ni a la cuota.

**Escenario, medido (S4):** `base = -50`, `cuota_iva = 150` y `total = 100`, con una sola línea general de 100 €, se sella.

**Arreglo.** Exigir que base y cuota tengan el mismo signo que el total. El total negativo se deja libre por si un borrador rectifica.

### H7 · `supabase/migrations/20261011120000_economico_esquema.sql:174`: los sellos de tiempo del sistema los elige el llamante

Afecta a `cobros.registrado_en` (L174), `borradores_factura.creado_en` (L91), `bonos.creado_en` (L195) y `tarifas_paciente.creada_en` (L63). Solo las versiones fuerzan ±1 minuto (paso 6.5).

**Escenario, medido (S10).** Como TEC1, `insert into cobros (..., registrado_en) values (..., '2025-01-01')` pasa y devuelve `2025-01-01`. Un cobro de solo adición dice haberse registrado un año antes de existir. `fecha` ya es la fecha de negocio elegible; `registrado_en` debería ser la del sistema.

**Arreglo.** Forzar `now()` para `authenticated` en un `before insert`.

### H8 · `supabase/migrations/20261011120000_economico_esquema.sql:397`: el `centro_id` de la versión no se valida contra nada

**Escenario, medido (S6).** Una versión del borrador de P1 y PRO1 (centro A) se sella con `centro_id = CB`, coherente entre sobre y fila. Cualquier lectura futura por centro, como el espejo de T-026 o un filtro del administrador, la atribuiría al centro B.

**Arreglo.** Exigir que sea un centro del paciente o del profesional, o null.

### H9 · `scripts/rls/26-economico.sql` (sin línea: falta la prueba): el punto «Concurrencia» de A.5 no tiene ninguna prueba

**Escenario.** Si una refactorización quita el `for no key update` (L337) y el cerrojo consultivo (L340), el banco, que es una sola transacción, sigue verde. Dos «guardar» simultáneos del mismo borrador calculan el mismo `max + 1`: el segundo muere con 23505 en lugar de esperar, y la corrección se pierde con un error.

**Arreglo.** Un guion de dos conexiones, como `test:huellas`.

### H10 · `supabase/migrations/20261011120000_economico_esquema.sql:466`: `trim()` solo quita espacios; un concepto de tabuladores o saltos de línea pasa como no vacío

**Escenario, medido (S8).** Una línea con `concepto = E'\t'` se sella. J28 solo prueba `'  '`.

**Arreglo.** `btrim(x, E' \t\r\n')` o una expresión regular `\S`.

---

Descartados tras medir:

- **Números no canónicos en el sobre** (S5: `"base_centimos":6000.00` se sella). Está heredado y aceptado por escrito en la nota (`20261003120000:201-211`).
- **P0002 en lugar de 23503 con cabecera inexistente.** Solo le pasa a postgres; para `authenticated`, el paso 0 da 42501.
- **F7, la auditoría del técnico, trivialmente a 0.** Lo pide así el diseño.

`lib/supabase/tipos-bd.ts`: salida generada y coherente con la migración: enum `forma_pago`, `citas.bono_id` con sus dos relaciones, las dos vistas y `verificar_cadena_borrador`. `scripts/lint-migraciones.ts` y su prueba añaden las dos tablas sin más.
