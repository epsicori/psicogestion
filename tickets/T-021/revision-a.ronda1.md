HAY UNA ALTA (H1). La etapa no pasa hasta que el propietario decida sobre H1.

# T-021 · Revisión A (seguridad y constitución)

Diff: `git diff main...worktree-agent-a19ecdb63f2c1e386` (HEAD d20e33d). He medido cada escenario
contra la base local, dentro de `begin; … rollback;`, con `scripts/rls/00-ayudantes.sql` y
`01-fijacion.sql` de la rama. No he leído `evidencia.json` ni el informe del verificador.
Las líneas citadas son de `supabase/migrations/20261011120000_economico_esquema.sql` (lo llamo `mig`),
salvo que se indique otro fichero.

Recuento: **1 ALTA · 5 MEDIA · 1 BAJA.**

## ALTA

### H1 · `mig:1011` (y la política `bonos_modificacion`, `mig:968-987`): las condiciones de un bono pagado se reescriben en sitio, varias veces y en ambos sentidos
- **Qué pasa.** `grant update (caducidad) on public.bonos` y la política de modificación dejan que
  el administrador, el profesional asignado y **cualquier técnico del centro** sobrescriban la
  caducidad de un bono. La cambian sin límite de veces, hacia atrás o a `null`, y ningún
  disparador lo impide. `bonos` es económico: guarda lo que el paciente compró (N sesiones por un
  importe, hasta una fecha). La regla 6 de `CLAUDE.md` dice «nada económico se modifica, solo se
  añade», y que la base debe impedirlo.
- **Escenario medido.** El ADM da de alta un bono de 10 sesiones y 500 € que caduca el
  2027-06-30. TEC1 ejecuta `update bonos set caducidad = '2026-01-01'`: las sesiones pagadas
  quedan caducadas. Después ejecuta `update … set caducidad = null` y el bono queda sin
  caducidad. Las dos sentencias entran. La fila solo guarda el último valor; los anteriores
  quedan únicamente en `auditoria` (3 filas: alta y dos cambios), y ningún lector del bono
  consulta esa tabla.
- **Origen.** No es un error del implementador. El permiso lo manda el diseño (§A.5 punto 12,
  §PA.5: «`has_column_privilege(… 'caducidad','UPDATE')` es verdadero»). El contrato no lo pide.
  Al contrario, dice: «un contador que se incrementa es un `UPDATE`». Aunque el diseño lo
  apruebe, sigue chocando con la regla 6 (precedente: T-032 / ADR-063).
- **Salidas para el propietario, que es quien decide:**
  (a) un ADR que declare la caducidad de un bono fuera de la regla 6, con su motivo; o
  (b) versionarla: quitar el `grant update`, y que el cambio de caducidad sea una fila de solo
  adición (`bonos_caducidades`, de la que la vista lee la última) o un bono nuevo que sustituya
  al anterior.
  Si elige (a), conviene que al menos la base impida reabrir o retroceder la fecha.
- Nota relacionada, sin hallazgo propio: el cierre de `tarifas_paciente.vigente_hasta` por `UPDATE`
  sí lo manda el contrato («cerrar la vigente») y es de un solo uso (`mig:714`). El problema
  concreto de ese cierre es H3.

## MEDIA

### H2 · `mig:889-896` · `borradores_factura_alta` no exige `creado_por = auth.uid()`
- Las otras tres políticas de alta con autoría sí lo exigen: `tarifas_paciente_alta` (`mig:863`),
  `bonos_alta` (`mig:958`) y cobros. En las versiones lo exige el paso 6.5 del sellado. La
  cabecera del borrador, que es el registro preparatorio del art. 29.2.j LGT, se queda sin esa
  comprobación, tanto en la rama del administrador como en la del profesional.
- **Escenario medido.** PRO1, autenticado, ejecuta
  `insert into borradores_factura (paciente_id, profesional_id, creado_por) values (P1, PRO1, PRO2)`
  y la fila entra con `creado_por = PRO2`. El registro atribuye a PRO2 un borrador que no creó.
  La fila de `auditoria` lleva el actor real, pero la cabecera, que es lo que leerán T-023 y
  T-026, dice otra cosa.

### H3 · `mig:708-720` y `mig:1006` · una tarifa se puede cerrar con fecha pasada y reescribir lo que costaba antes
- `fn_cerrar_tarifa()` solo impide volver a cerrar una tarifa. No pone cota inferior a la
  `vigente_hasta` nueva: solo se comprueba `> vigente_desde`. Si la tarifa se cierra en el
  pasado, queda un hueco, y una tarifa nueva puede ocuparlo hacia atrás sin chocar con el
  `exclude`.
- **Escenario medido.** PRO1 tiene una tarifa de 60 € vigente desde el 2026-01-01. Ejecuta
  `update … set vigente_hasta = '2026-01-02'` (entra) y luego da de alta una tarifa de 90 € con
  `vigente_desde = '2026-01-02'` (entra). Resultado: todo el periodo del 2026-01-02 a hoy, en el
  que se cobró a 60 €, figura a 90 €. Un borrador de marzo deja de «poder explicarse» con la
  tarifa vigente en su fecha, que es justo lo que pide el contrato (Tareas, `tarifas_paciente`).
- Arreglo mínimo: en `fn_cerrar_tarifa()`, exigir `new.vigente_hasta >= current_date` a
  `authenticated` (con la zona del centro, si se quiere precisión), con una negativa en 26.K.

### H4 · `mig:854-878` (y el paso 0, `mig:300-311`) · `es_profesional_asignado()` sin comparar el rol deja a un técnico titular leer y escribir tarifas
- Esta es la duda 3 del implementador. `es_profesional_asignado()` no mira el rol, y su
  comentario lo dice a propósito (`20260822160000…sql:1413`). El ADM puede poner a un técnico
  como `pacientes.profesional_id`: la política `pacientes_modificacion_administrador` no pone
  condición a la columna. Las políticas de `borradores_factura` sí comparan
  `rol_actual() = 'profesional_sanitario'`, y `citas_modificacion` también
  (`20261005120000…sql:87`, «un técnico que figure como profesional_id de una cita no la
  modifica»). Las de `tarifas_paciente`, en cambio, no lo comparan, y el paso 0 del sellado
  tampoco.
- **Escenario medido.** El ADM ejecuta `update pacientes set profesional_id = TEC1 where id = P1`
  y la sentencia entra. TEC1 obtiene `es_profesional_asignado(P1) = true` y
  `select count(*) from tarifas_paciente where paciente_id = P1` le devuelve 1. El contrato dice
  «como técnico: **cero** en `tarifas_paciente`». Por la misma vía, TEC1 puede dar de alta y
  cerrar tarifas de P1 (`tarifas_paciente_alta` y `_cierre` tienen el mismo `or`). Y si el ADM
  le crea una cabecera con `profesional_id = TEC1` (H5, entra), TEC1 también supera el paso 0
  de las versiones.
- Arreglo mínimo: en `tarifas_paciente_*` y en el paso 0, añadir
  `rol_actual() = 'profesional_sanitario' and es_profesional_asignado(…)`, igual que ya hacen
  las de `borradores_factura`. Con una negativa del técnico titular y su gemela positiva del
  profesional titular.

### H5 · `mig:889-896` (rama del administrador) · el `profesional_id` de la cabecera no se valida: ni rol ni asignación
- La rama del administrador acepta cualquier `profesional_id`. La lectura de la cabecera
  (`mig:881-887`) se concede por `profesional_id = auth.uid()`, sin pasar por el paciente, y las
  versiones se leen si la cabecera es legible (`mig:900-904`).
- **Escenario medido.** El ADM crea un borrador de P1 con `profesional_id = PRO2`, por ejemplo
  al equivocarse en el selector de profesional (choque 13). PRO2, que no tiene asignado a P1
  (`es_profesional_asignado(P1) = false`), ve la cabecera (`count = 1`). Con ella ve cada versión:
  destinatario, NIF cifrado, líneas y los `cita_id` de P1. El ADM también puede crear la cabecera
  con `profesional_id = TEC1` y la sentencia entra.
- Arreglo mínimo: exigir en la rama del administrador que `profesional_id` sea un perfil con rol
  `profesional_sanitario` o `administrador` que esté asignado al paciente. Se puede hacer en la
  política o en un disparador `before insert`.

### H6 · `mig:220` · el bono de una cita **pasada y realizada** se quita o se cambia sin límite, y con él cambia el consumo de un bono pagado
- `grant update (bono_id) on public.citas` entra en `fn_proteger_cita_pasada()`, pero esa
  función solo congela la lista de columnas anterior a esta migración (`inicio`, `fin`,
  `paciente_id`, …), y `bono_id` no está en ella. El contrato quiere el consumo «derivado» para
  que no sea un contador editable. Ahora el dato del que se deriva sí es editable hacia atrás.
- **Escenario medido.** Hay una cita de P1 de hace 30 días, `realizada`, con un bono de 10
  sesiones. PRO1 ejecuta `update citas set bono_id = null where id = …` y la sentencia entra.
  La sesión consumida hace un mes desaparece del consumo del bono. Si en vez de `null` pone otro
  bono del mismo paciente, la sesión pasa de un bono pagado a otro. Nada lo impide salvo el
  paciente distinto (26.K1).
- **Origen.** El diseño dice «tocar `fn_proteger_cita_pasada()` no entra». El arreglo puede ir
  en esta misma migración con un disparador propio de `citas` (`before update of bono_id`,
  limitado a las citas pasadas en estado `realizada`) o como anotación en `docs/state.md`.
  Lo decide el propietario junto con H1, porque los dos hallazgos responden a la misma pregunta:
  qué parte del bono es un hecho económico.

## BAJA

### H7 · `mig:526-539` · la cuota no se ata a las líneas: una línea exenta puede llevar IVA y el reparto entre base y cuota es libre
- Esta es la duda 5 del implementador. El sellado solo comprueba `base + cuota = total`, que la
  suma de las líneas dé el total y que la cuota sea 0 si todas las líneas son exentas. El diseño
  lo limita a eso a propósito (§«Lo que no entra»: no repetir el redondeo de `lib/dinero`).
  Pero hay dos comprobaciones que no son redondeo:
  1. en una línea `exento_sanitario`, `tipo_iva_centesimas` debe ser 0 (D4);
  2. ni la base ni la cuota pueden ser negativas cuando todas las líneas son positivas.
- **Escenario medido.**
  (1) Una línea `exento_sanitario` con `tipo_iva_centesimas = 2100`, con cuota 0, se sella
  como versión 2.
  (2) Una línea `general` de 100 € al 21 % se sella con `base = -50`, `cuota_iva = 150` y
  `total = 100` como versión 3.
  Las dos son versiones válidas de la cadena, y la cadena no admite correcciones in situ: el
  error queda sellado. T-026 enviará esos importes al proveedor.

## Las seis dudas del implementador, juzgadas contra el diseño

1. **`bono_id` solo por `update`**: conforme a D8. Consecuencia no prevista: H6. El técnico no
   puede asignar un bono porque `citas_modificacion` no tiene rama de técnico. Es una laguna de
   producto que toca T-023, no de seguridad.
2. **`algoritmo_version` not null sin default**: conforme. El paso 1.bis da un mensaje explícito.
   Lo he medido omitiendo la columna: «la fija la era vigente … la abre una migración». No hay
   hallazgo.
3. **El rol se compara en `borradores_factura` y no en las versiones ni en el paso 0**:
   hallazgo H4 (y H5).
4. **Un `creada_por` ajeno da 23514 y no 42501**: aceptable. Cuando llega el paso 6.5, el paso 0
   ya ha autorizado, así que no hay oráculo de existencia. Solo es una diferencia de código con
   la nota. No hay hallazgo.
5. **Una línea exenta sin IVA 0**: hallazgo H7.
6. **Comentario del ADR-053 abreviado**: conforme. `mig:4-7` nombra las cinco tablas del ADR-053
   y añade la línea del ADR-077.

## Lista «Qué revisar» del diseño (A.5 y PA.5), comprobada

- **`grep` de PA.4** (`serie|numeracion|qr|verifactu|registro_facturacion`, y `espejo|proveedor`
  fuera de comentarios): 0 coincidencias. No hay alcance de facturación ni de espejo.
- **Privilegios.** Ni `authenticated` ni `anon` tienen `TRUNCATE`, `TRIGGER`, `REFERENCES`,
  `UPDATE` ni `DELETE` de tabla sobre las cinco tablas ni sobre las dos vistas. `anon` no tiene
  `SELECT`.
- **Columnas con `UPDATE`.** En `bonos`, solo `caducidad` (esa es H1). En `tarifas_paciente`,
  solo `vigente_hasta`. En `citas.bono_id`, `UPDATE` sí e `INSERT` no.
- **Capa 1 de solo adición.** `revoke update, delete, truncate … from postgres` está en las dos
  tablas (`mig:1002-1003`). Los disparadores de fila y de `truncate` también están (`mig:789-836`).
  Las dos tablas figuran en `tablas_solo_adicion`.
- **Funciones.** `fn_sellar_version_borrador`, `fn_bono_de_la_cita` y `verificar_cadena_borrador`
  son `security definer` con `search_path=""`. Ninguna tiene `EXECUTE` para `anon`,
  `authenticated` ni `service_role`. `fn_cerrar_tarifa` es invoker.
- **Vistas.** `borradores_factura_estado` tiene `security_invoker=true`. `bonos_consumo` es
  definer con `security_barrier=true`, y su `where` replica `bonos_lectura`.
- **Auditoría.** El técnico no ve en `auditoria` ninguna fila de borradores ni de tarifas (0 filas).
- **Territorio.** Todos los ficheros del `git diff --stat` están en el `territorio:`.
