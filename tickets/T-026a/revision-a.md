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
