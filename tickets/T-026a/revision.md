**Sin hallazgos ALTA.** T-026a · ronda 2 · revisión combinada (A: sincronizador, estados, vista, regla 6, RLS y alcance · B: hallazgos de su ronda 1 y regresiones del delta · dirigida: cierre de R2-H1, R2-M1 y R2-B1 sobre `0781696`).

Recuento combinado: **0 ALTA, 0 MEDIA, 1 BAJA.**

- Commit revisado: `0781696`. La cabeza de la rama es `c48708a`, y `git diff 0781696 c48708a --stat` solo toca `tickets/T-026a/`: la evidencia y la revisión dirigida, con su copia en `rondas/`. El sello de la evidencia y el de la revisión dirigida llevan la misma huella de código (`777d1376…`).
- A y B revisaron `d9b5287` (delta `git diff 29d77bb d9b5287`). La dirigida revisó `0781696` (delta `git diff 67b1000 0781696` sin `tickets/`).
- Los ids no chocan: `R2-H1` es de A, `R2-M1` y `R2-B1` son de B, y `D-B1` es de la dirigida. `R2-H1` y `R2-M1` son el mismo hallazgo visto por los dos revisores.

## Estado de los hallazgos de la ronda 2

| Id | Revisor | Severidad | Estado | Cómo se cerró |
|---|---|---|---|---|
| R2-H1 | A | MEDIA | **Cerrado** | `notificar_discrepancia_facturacion` cuelga el aviso del envío cuando no hay espejo. La dirigida lo midió en `supabase_db_Psicogestion`, dentro de `begin … rollback`, con dos pasadas sobre envíos reales sin espejo: el aviso entra sin error, el siguiente documento se copia, no hay duplicados y ningún aviso nombra al paciente. |
| R2-M1 | B | MEDIA | **Cerrado** | El mismo arreglo y la misma medición que R2-H1. |
| R2-B1 | B | BAJA | **Cerrado** | `sincronizador.test.ts` (12 pruebas) mata cinco mutantes: quitar el `return`, dejar la clase 23 en 23505/23514, ignorar `errorAviso`, `return` solo en 23514 y no contar la discrepancia. La base falsa ya no acepta un aviso sin espejo salvo con `avisoSinEspejo`. |

## Hallazgos abiertos

| Id | Severidad | Dónde | Revisor | Destino |
|---|---|---|---|---|
| D-B1 | BAJA | `supabase/migrations/20261014120000_proveedor_facturacion.sql:816` | dirigida | Ticket de seguimiento |

**D-B1 (prueba).** Ninguna prueba mata el `return` de la rama con espejo de `notificar_discrepancia_facturacion`. Si se quita, el banco RLS entero sigue en verde (31.C8, C9 y C11-C14 en OK), porque ninguna aserción cuenta los avisos de un documento por todos sus orígenes.
- **Escenario:** el programa cambia el total de una factura ya copiada. `registrar_factura_espejo` da 23505 y el sincronizador avisa. Si un refactor ha quitado ese `return`, cada administrador recibe dos avisos del mismo documento. Uno de ellos («Una factura del programa de facturación no se pudo copiar…») es falso, porque la factura sí está copiada.
- **Cierre:** en C8, contar también los avisos `facturacion_discrepancia` de DOC-A con el origen de su envío, y exigir 0.

Los textos de cada revisión siguen abajo sin cambios. Solo baja un nivel el título propio de cada una.

---

# Revisor A · ronda 2 (sobre d9b5287)

Sin hallazgos ALTA. (Revisor A, ronda 2, commit d9b528739d7a252b2e4cf1146132cfc1dd560d8c · delta `git diff 29d77bb d9b5287`; foco: cierre de H1-H5 de la ronda 1 y regresiones en sincronizador, estado `ambiguo`, vista con `envio_ambiguo`, regla 6, RLS y alcance.)

Recuento: 0 ALTA · 1 MEDIA · 0 BAJA.

## Estado de los hallazgos de la ronda 1

| Hallazgo | Estado | Cómo se comprobó |
|---|---|---|
| H1 sincronizador atascado | **ABIERTO** (ver R2-H1) | La corrección llama a `notificar_discrepancia_facturacion`, que exige un espejo que en ese caso no existe. Reproducido en la base, `begin … rollback`. |
| H2 segundo fallo sin aviso | Cerrado | `encolar` suma `carga.reaperturas`, y `registrar_fallo` deriva el origen `md5(borrador:n)::uuid` cuando `n > 0`. N9 fija el origen = borrador y N11b exige 2·N_ADM y dos orígenes distintos, así que lo matan los dos mutantes (sin incremento, origen siempre derivado). `eventos_salientes` no tiene disparadores y nadie más lee `carga` (solo `reclamar`, que lee `borrador_id`). Ningún consumidor de `notificaciones` enlaza por `origen_id`. |
| H3 `fallido` oculta `descartado` | Cerrado | La vista evalúa `u.descartado` después de `facturado` y antes de `enviado`, `en_cola` y `fallido`. Que haya `descartado` junto a `en_cola` o `enviado` sin anotación es imposible, porque la congelación lo rechaza. K11 mata la vuelta al orden anterior. |
| H4 borrado sin aprobar sin salida | Cerrado, con su límite declarado | La congelación deja pasar una versión `descartado` si hay anotación `borrado_sin_aprobar`. El paso va en `tras_envio`, después de `sellado` y `cotas`, así que los permisos y las cotas siguen aplicándose. J5 (versión viva rechazada), J6 (gemela BORRA, solo `rectificado`) y J7/K11 lo matan. La re-preparación con un borrador nuevo queda en T-046, anotado en la bitácora. |
| H5 G3/G4 no distinguían D17 | Cerrado | La sección O (BORRF: autor PRO1, asignado PRO2 tras el cambio de profesional) tiene O2 y O3 en sentidos opuestos. Mata `b.profesional_id = auth.uid()` en la cabecera y en el espejo. |

## Comprobado sin hallazgo en el delta

- Regla 6: el delta no añade ningún `UPDATE` ni `DELETE` sobre `borradores_factura_envios`, `facturas_espejo` ni `facturas_anotaciones`. El cierre de H4 es una inserción más en `borradores_factura_versiones`. Lo único que se actualiza es el outbox (`eventos_salientes.carga`), que no es una tabla de solo adición.
- `estado_cola_borrador` devuelve ahora `'ambiguo'`. Su único consumidor es la vista: `en_cola` sigue con `= 'pendiente'` y `fallido` acepta `('fallido','ambiguo')`. La función sigue con la misma guarda de rol (TEC1 nulo, K10). `envio_ambiguo` hereda el grant de la vista: `authenticated` sí, `anon` no (comprobado en el catálogo).
- El panel solo usa `ambiguo` si `estado === 'fallido'`. `url_proveedor` está limitado a `https://` por el check de la tabla. `facturas_espejo_cabecera` expone esa columna.
- Ajustes: la zona sale de `organizacion.zona_horaria`, con el mismo patrón que `cuenta/lista-avisos.tsx` y `lib/citas/avisos.ts`. `@date-fns/tz` ya estaba anclada. B4: `Dialogo` es controlado por `abierto`, así que ignorar `alCerrar` mientras se envía mantiene el estado coherente.
- `01-fijacion.sql:295`: el recuento filtrado por BORRA y BORRB no cambia lo que se reclama.
- `lib/supabase/tipos-bd.ts`: el cambio sin comitear del árbol son solo finales de línea.
- Alcance: `26-economico.sql` solo toca 26.F9, la ampliación que decidió el propietario. Ningún fichero fuera del `territorio:` del ticket.

## MEDIA

### R2-H1 · El arreglo de H1 sigue abortando la sincronización: el aviso exige un espejo que no existe (cruce)

**Dónde:** `lib/facturacion/sincronizador.ts:79-86`, junto con `supabase/migrations/20261014120000_proveedor_facturacion.sql:801-806` (`notificar_discrepancia_facturacion`, que el delta no toca).

**Qué falla:** cuando `registrar_factura_espejo` rechaza un documento con un código de clase 23 distinto de 23505, la factura no se ha copiado. El sincronizador llama entonces a `notificar_discrepancia_facturacion`, pero esa función empieza buscando el espejo y lanza 23503 «No hay factura copiada para ese documento» si no lo encuentra. Con ese `errorAviso`, `fallo(errorAviso, 'aviso')` lanza y la pasada se aborta igual que antes del arreglo.

**Escenario:**
1. Un borrador se aprueba en el programa con un total distinto de base + cuota (retención de IRPF), con un enlace que no es `https://` o con un número de más de 60 caracteres. Vale también un documento con `borrado_sin_aprobar` que la pasada B ve aprobado.
2. `registrar_factura_espejo` devuelve 23514 y no crea ninguna fila.
3. `notificar_discrepancia_facturacion` devuelve 23503 y el sincronizador lanza «Fallo al sincronizar (aviso)».
4. La ruta responde 500 y el cursor no avanza. Cada 5 minutos se repite: la pasada A vuelve a tomar ese documento el primero (por `enviado_en`), ningún espejo posterior se copia y ningún administrador recibe aviso.

**Reproducido** en `supabase_db_Psicogestion`, dentro de `begin … rollback`, como `service_role` y sobre un envío sin espejo (`BD-a1c87670-1`):
- `registrar_factura_espejo(…, 10000, 0, 12000, 'https://…')` da `facturas_espejo_check`.
- `notificar_discrepancia_facturacion('holded', 'BD-a1c87670-1')` da «No hay factura copiada para ese documento».

**Prueba verde por el motivo equivocado:** la prueba nueva «un documento que la base rechaza (23514) se avisa y los siguientes se copian igual» (`sincronizador.test.ts:194`) usa `bdFalsa`, que responde `{ data: 'id', error: null }` a cualquier RPC que no sea `registrar_factura_espejo` (l.61). Con eso, el aviso de un documento sin espejo «funciona» en la prueba y nunca en la base. En la práctica, el único rechazo que el arreglo deja pasar es 23505, cuyo espejo sí existe y que ya se trataba bien antes.

**Qué hace falta para cerrarlo:**
- Un aviso que no dependa del espejo para el rechazo sin espejo. Por ejemplo, con origen en el envío o en el borrador, o haciendo que `notificar_discrepancia_facturacion` acepte el documento sin espejo.
- Una prueba contra la base real (banco 31) o un `bdFalsa` que reproduzca el 23503 de `notificar_discrepancia_facturacion` cuando no hay espejo.
- Además, la nota de la bitácora «el aviso está deduplicado, el documento se reintenta cada pasada» no describe lo que pasa hoy.

## Descartados (sin escenario con daño)

- La congelación admite cualquier número de versiones `descartado` tras `borrado_sin_aprobar` (el comentario dice «UNA»). Son inserciones inocuas que no cambian el estado.
- Descartar un borrador en `fallido` ambiguo hace desaparecer el texto «Comprueba en el programa…» (la vista da `descartado`). Hoy no hay interfaz de descarte (T-046), y el administrador ya recibió el aviso de `ambiguo` cuando se produjo el fallo.

---

# Revisor B · ronda 2 (sobre d9b5287)

Sin hallazgos ALTA. (Revisor B, ronda 2, commit d9b5287: 0 ALTA · 1 MEDIA · 1 BAJA.)

## T-026a · Revisión B, ronda 2 (delta `git diff 29d77bb d9b5287`)

Método: los once hallazgos de mi ronda 1, uno por uno; después las regresiones del delta. Los mutantes se
midieron sobre una copia `git archive d9b5287` en el scratchpad, con una junction a `node_modules`, y sin
tocar el worktree. La base se consultó solo dentro de `begin … rollback`, en `supabase_db_Psicogestion`.

## Estado de los hallazgos de la ronda 1

| Id | Estado | Comprobación |
|---|---|---|
| M1 fallido ambiguo | CERRADO | La vista expone `envio_ambiguo` (`estado_cola_borrador` devuelve `ambiguo` si `ultimo_error = 'ambiguo'`). `cola.ts:123` lo registra siempre como permanente, así que la marca no se pierde en un reintento. El panel avisa y deja preparar, como fija T-026 §1.7. Banco 31 K8, K9 y K10. |
| M2 factura sin enlace | CERRADO | `url_proveedor` se lee en `facturas_espejo` y en `facturas_espejo_cabecera`, que sí lo expone (migración :222). El `check '^https://'` (:65) impide un `javascript:` en el `href`. Mutante «sin enlace del técnico»: muerto, 2 rojas. |
| M3 mutantes vivos | CERRADO | Los tres de la ronda 1 se repitieron: sin anotaciones (4 rojas), el texto de `enviado` en `facturadoSinPrograma` (1 roja) y Preparar en `descartado` (1 roja). |
| M4 anotaciones | CERRADO | Las anotaciones van en `Pildora` y con «el programa de facturación» cuando no hay programa. El mutante `programa ?? ''` muere. |
| B1 fallido antes que descartado | CERRADO | La vista evalúa `descartado` antes que `enviado`, `en_cola` y `fallido`. Fuera del bypass nuevo (que exige `borrado_sin_aprobar`), no hay otra forma de tener una versión descartada con envío: los estados del outbox son solo `pendiente`, `entregado` y `fallido`, y la congelación bloquea `pendiente` (incluido un reclamo en curso). Banco 31 K11. |
| B2 textos | CERRADO | El grep de CA23 sobre `app components lib/i18n` solo devuelve `es.ts:269 'Abrir en {programa} para emitir'`. |
| B3 título del técnico | CERRADO | `emitidasSinPrograma: 'Emitidas'`, con prueba. |
| B4 diálogo y doble Enter | CERRADO | Si se quita cualquiera de las dos guardas `if (enviando) return`, su prueba falla. |
| B5 zona de la fecha | CERRADO | `tz(organizacion.zona_horaria)`. Si se quita `in: tz(zona)`, la prueba de las 22:30Z (servidor en UTC) falla. |
| B6 errores y claves muertas | CERRADO | `errores.lectura` para la lectura. `facturacionVacia*` ya no tiene ningún uso en `app`, `components` ni `lib`. |
| B7 simulado | CERRADO | La expresión cubre `import()` y `require`, y se prueba a sí misma con seis formas y dos negativas. |

Comprobado en el delta, sin hallazgo:
- La ruta `drenar` y el secreto de la clave no cambian: `route.ts`, `clave.ts` y `acciones.ts` no están en el delta, y el formulario sigue sin recibir la clave.
- `carga.reaperturas`: en `eventos_salientes` ningún disparador impide el `jsonb_set`, y el consumidor solo lee `carga ->> 'borrador_id'`.
- El bypass de la congelación solo actúa con una versión descartada **y** la anotación `borrado_sin_aprobar`, que exige un envío. Por eso no puede haber un evento `pendiente` reabierto, porque `encolar` sale antes si hay envío. Banco J5, J6 y J7 con su gemela.
- `tipos-bd.ts`: el cambio local sin comitear es solo de fin de línea. El contenido coincide con el generado.
- Alcance: `26-economico.sql` solo toca 26.F9, por decisión del propietario; `01-fijacion.sql`, dentro del territorio.

Descartados por falta de un escenario con daño:
- El `origen_id` derivado con `md5` no apunta a ninguna fila de `borradores_factura`, pero hoy ningún consumidor de `notificaciones` lee `origen_id`.
- El panel acepta `envio_ambiguo` con cualquier estado: si se quita la comprobación de `fallido`, el mutante sobrevive, pero solo cambia el texto de un borrador descartado.
- El tono de la pastilla: si se fija el tono a `info`, el mutante sobrevive, y es pintura.

## MEDIA

### R2-M1 · El arreglo de H1 sigue atascando el sincronizador: el aviso exige un espejo que no existe en ese caso
- `lib/facturacion/sincronizador.ts:79-86`, con `supabase/migrations/20261014120000_proveedor_facturacion.sql:803-806` (`notificar_discrepancia_facturacion`, que el delta no toca).
- Para cualquier rechazo de clase 23 que no sea 23505, no existe fila en `facturas_espejo`. Aun así, la corrección llama a `notificar_discrepancia_facturacion`. Esa función busca el espejo y, si no lo hay, lanza 23503 «No hay factura copiada para ese documento». Entonces `if (errorAviso) fallo(errorAviso, 'aviso')` aborta la pasada entera, igual que antes del arreglo. La prueba nueva (`sincronizador.test.ts:194`) sale verde por el motivo equivocado: la base falsa responde `ok` a `notificar_discrepancia_facturacion` haya espejo o no.
- Escenario (reproducido en `begin … rollback` sobre el envío `BD-a1c87670-1`):
  1. El programa expide una factura con retención de IRPF: base 100, IVA 21 y total 106.
  2. `registrar_factura_espejo` rechaza la fila por el `check (base + cuota_iva = total)` (:67), con 23514.
  3. `notificar_discrepancia_facturacion` lanza 23503.
  4. `sincronizar` lanza «Fallo al sincronizar (aviso)». Los documentos posteriores de la pasada A no se copian, la pasada B no corre y el cursor no avanza.
  5. Cada cinco minutos se repite lo mismo, porque la pasada A empieza por los más antiguos.

  Ninguna factura posterior llega a «Emitida» en la ficha. Pasa lo mismo con un `url_proveedor` que no es `https://` o con un número de más de 60 caracteres.

## BAJA

### R2-B1 · El `return` que evita anotar un documento sin espejo no tiene prueba
- `lib/facturacion/sincronizador.ts:90`.
- `if (error.code !== '23505') return;` impide que un documento rechazado y marcado `rectificado` o `anulado` llame a `registrar_anotacion_documento`. Sin espejo, esa función lanza 23514 (migración, `registrar_anotacion_documento`), y `fallo(error, 'anotación')` volvería a abortar la pasada.
- Escenario medido: quitar esa línea deja `sincronizador.test.ts` en verde, 10/10. Lo mismo pasa si se restringe la clase 23 a `23505`/`23514`, porque ninguna prueba usa otro código de la clase, como un 23502 por un número nulo. Un documento rectificado en el programa cuyo espejo la base rechaza volvería a atascar la sincronización sin que ninguna prueba lo vea. Hoy queda tapado por R2-M1, que aborta antes.

---

# Comprobación dirigida · ronda 2 (sobre 0781696)

Sin hallazgos ALTA. (Revisión dirigida, commit 0781696077f412aad1ac93416bfdf851fddf1e51 · delta `git diff 67b1000 0781696` sin `tickets/`; foco: cierre de R2-H1 (revisión A), R2-M1 y R2-B1 (revisión B), y lo que el arreglo pueda romper.)

Recuento: 0 ALTA · 0 MEDIA · 1 BAJA.

## Estado de los hallazgos de la ronda 2

| Hallazgo | Estado | Cómo se comprobó |
|---|---|---|
| R2-H1 (A) / R2-M1 (B): el sincronizador se atasca porque el aviso exige un espejo | **Cerrado** | Lo probé contra `supabase_db_Psicogestion` (comprobado con `docker ps`; `max(version)` = 20261014120000; `pg_get_functiondef` ya trae la rama del envío). Usé `begin … rollback` y un savepoint por RPC, como hace PostgREST, que abre una transacción por llamada. Simulé dos pasadas sobre dos envíos reales sin espejo (`BD-34655e89-1`, `BD-82c27531-1`). Pasada 1: el espejo con IRPF da `facturas_espejo_check`; el aviso entra sin error; `registrar_anotacion_documento(…, 'rectificado')` da 23514, que es lo que el `return` evita; el siguiente documento se copia. Pasada 2: `documentos_para_sincronizar` vuelve a dar solo el rechazado, que da otra vez el check, y el aviso de nuevo entra sin error. Después un 23505 sobre el copiado, avisado con origen `facturas_espejo`. Resultado: una fila por administrador activo y documento en cada origen, nada duplicado, y ningún aviso contiene el nombre del paciente. |
| R2-B1: el `return` sin prueba | **Cerrado** | Mutantes en una copia `git archive`, con `sincronizador.test.ts` (12 pruebas). Se mata quitar el `return` (falla 1). Se mata dejar la clase 23 solo en 23505/23514 (1). Se mata ignorar `errorAviso` (1). Se mata convertir el `return` en «solo 23514» (1). Se mata no contar la discrepancia (3). La base falsa ya no acepta un aviso sin espejo salvo con `avisoSinEspejo`, y rechaza anotar rectificado o anulado sin espejo, igual que `registrar_anotacion_documento`. |
| Nota de la revisión B: 31.C11 pasaba por el borrado sin aprobar de DOC-E | **Cerrado** | C11 usa ahora BORRG/DOC-G, que tiene envío y no tiene anotaciones (C11.fij), y comprueba el mensaje `facturas_espejo_check`, no solo el código. |

## Lo demás que se pidió comprobar

- **Deduplicación y paciente.** El aviso sin espejo se deduplica por `(perfil, tipo, 'borradores_factura_envios', id del envío)`. Ese id es único por documento, porque `borradores_factura_envios` tiene `unique (proveedor, proveedor_documento_id)`; así que el `select … into` nunca elige entre dos filas. Título y detalle son fijos: no nombran al paciente ni al programa, y no usan «emitir», «facturar» ni «aprobar». C12 y C13 lo fijan. En la base, ningún aviso contiene el nombre del paciente.
- **Solo adición.** Ni el diff ni el banco tienen `UPDATE` ni `DELETE`. La función solo hace `insert … on conflict do nothing` sobre `notificaciones`, y el espejo, las anotaciones y los envíos no se tocan.
- **Otros lectores de `origen_tabla = 'facturas_espejo'`.** No hay ninguno. Las lecturas de `notificaciones` son `lib/citas/avisos.ts`, `lib/agenda/avisos.ts`, `app/(app)/cuenta/lista-avisos.tsx`, `app/api/avisos/route.ts` y `components/armazon/*`. Ninguna selecciona `origen_tabla` ni `origen_id`: muestran el `titulo` propio o la etiqueta del `tipo`, y el `tipo` no cambia. Los `origen_tabla = 'citas'` que hay en SQL y en la agenda leen `alertas_documentacion`, que es otra tabla. `notificaciones.origen_tabla` solo exige que no esté vacío, y la rama con espejo no cambia (C8 y C9 siguen verdes).
- **Migración editada en sitio.** `20261014120000` no está en `origin/main` (`git cat-file -e` falla), así que editarla no rompe la regla de «solo hacia delante».
- **Alcance.** Son cuatro ficheros: la migración, el banco 31, `lib/facturacion/sincronizador.test.ts` y `docs/bitacora/T-026a.md`. Todos están dentro del `territorio:` del ticket, y el código de producción del sincronizador no cambia.

## BAJA

### D-B1 · El `return` de la rama con espejo de `notificar_discrepancia_facturacion` no tiene prueba que lo mate (prueba)

- **Dónde:** `supabase/migrations/20261014120000_proveedor_facturacion.sql:816`.
- **Qué pasa:** el `return;` es lo único que impide que un documento con espejo reciba también el aviso «Factura que no se pudo copiar», colgado del envío. Quitarlo deja el banco entero en verde. Lo medí con el banco completo en una sola transacción con `rollback`, con la función mutada por `create or replace` al principio: `exit=0` y 31.C8, C9 y C11-C14 en OK. La razón es que C8 y C9 filtran por `origen_id = ESPA`, C12 por el envío de DOC-G, y C13 toma la primera fila con `origen_tabla = 'borradores_factura_envios'`, cuyo texto coincide igual. Ninguna aserción cuenta los avisos de un documento por todos sus orígenes.
- **Escenario:** el programa cambia el total de una factura ya copiada. `registrar_factura_espejo` da 23505 y el sincronizador avisa. Con el `return` quitado por un refactor, cada administrador recibe dos avisos del mismo documento. Uno de ellos, «Una factura del programa de facturación no se pudo copiar…», es falso, porque la factura sí está copiada. Ninguna prueba lo detecta.
- **Cierre posible:** en C8, contar los avisos `facturacion_discrepancia` de DOC-A por sus dos orígenes (el espejo ESPA y el envío de DOC-A) y exigir `N_ADM`, o exigir 0 filas con el origen del envío de DOC-A.

## Descartados (sin escenario con daño)

- **El texto nuevo no está en la tabla cerrada de textos del diseño (§1.4).** El arreglo necesitaba un texto distinto, porque el anterior afirma que la factura está copiada. El texto nuevo cumple las tres restricciones de esa tabla (ni paciente, ni programa, ni verbos vetados), y lo registra la bitácora.
- **El texto «sus datos no encajan» también sale cuando el rechazo es por un borrado sin aprobar.** Pasa cuando la pasada B ve aprobado un documento anotado como borrado. El texto es impreciso, pero la acción que pide («Revísala en el programa») es la correcta.
- **La base falsa de `sincronizador.test.ts` reproduce por defecto la función anterior** (23503 sin `avisoSinEspejo`). Está documentado en el comentario y sirve para la prueba de «aborta si el aviso falla». Hoy no rompe nada.
- **La pasada A, con 50 o más rechazos permanentes.** El límite ya existía y está declarado en la bitácora. Los documentos que cambian después del cursor siguen entrando por la pasada B.
