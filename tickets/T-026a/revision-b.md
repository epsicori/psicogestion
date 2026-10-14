Sin hallazgos ALTA. (Revisor B, ronda 2, commit d9b5287: 0 ALTA · 1 MEDIA · 1 BAJA.)

# T-026a · Revisión B, ronda 2 (delta `git diff 29d77bb d9b5287`)

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
