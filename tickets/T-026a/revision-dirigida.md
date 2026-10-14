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
