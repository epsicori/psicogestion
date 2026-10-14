Sin hallazgos ALTA. (Revisor B, ronda 1, commit b57a26f: 0 ALTA · 4 MEDIA · 7 BAJA.)

# T-026a · Revisión B (aplicación: lib/facturacion, acciones, Ajustes › Programa de facturación, Ficha › Facturación, textos, roles, pruebas)

Base: `git diff main...HEAD`. Mutantes medidos sobre una copia `git archive HEAD` en el scratchpad, sin tocar el worktree.

Comprobado sin hallazgo: la ruta de drenado (503 sin secreto, 401 con secreto erróneo, `timingSafeEqual`, mutantes matados por `route.test.ts`); `proxy.ts` solo añade la ruta; `estado_de_cuenta` vacío si el perfil no está activo y el guard de la acción lo respeta; `facturas_espejo.total` en euros y `euros()` correcto; `guardarClaveProveedor` no devuelve la clave; los mensajes 23514 de `encolar` casan con los fragmentos que la acción traduce; la vista del técnico no expone `borrador_id` ni líneas; el nombre del programa no sale de `lib/facturacion` salvo `esquemas.ts`; sin `use cache`.

## MEDIA

### M1 · `fallido` ambiguo se pinta como un fallo normal y se ofrece Preparar
- `app/(app)/pacientes/[id]/panel-facturacion.tsx:150-162` (y `lib/i18n/es.ts:259`, vista `borradores_factura_estado` en `supabase/migrations/20261014120000_proveedor_facturacion.sql:1048-1060`).
- El panel muestra para todo `fallido` «No se pudo preparar» con el botón Preparar; la clave `facturacion.panel.estado.fallidoAmbiguo` existe pero no se usa, y la vista no expone `ultimo_error`, así que la página no puede distinguir el caso ambiguo que el diseño de T-026 §1.7 obliga a avisar.
- Escenario: (con el adaptador real de T-026b) `crearBorrador` crea el documento en el programa y `registrar_envio` falla tres veces → el evento queda `fallido` con error `ambiguo` → el panel ofrece Preparar sin aviso → `encolar` reabre el evento → el reclamo sale con `ya_enviado` nulo → segundo documento en el programa para el mismo borrador, que una persona puede aprobar dos veces.

### M2 · `facturado` sin enlace al documento, ni en la ficha ni en la lista del técnico
- `app/(app)/pacientes/[id]/panel-facturacion.tsx:104-107, 186, 205-221`.
- El diseño (§1.7) fija `facturado → enlace al documento (url_proveedor)` y para el técnico «número, fecha, total y enlace»; la consulta a `facturas_espejo` no selecciona `url_proveedor` y el único enlace del panel está condicionado a `estado === 'enviado'`.
- Escenario: un borrador pasa a `facturado` → la fila muestra «Emitida en X · nº 12» sin forma de abrir la factura; el técnico ve su lista de emitidas sin ningún enlace. CA22 («cada estado con su acción») queda incumplido para `facturado`.

### M3 · Las anotaciones y varios estados del panel no tienen ninguna prueba
- `app/(app)/pacientes/[id]/panel-facturacion.test.tsx` (todas las respuestas de `facturas_anotaciones` son `ok([])`; la prueba «facturado sin programa» de la línea ~100 solo cubre `en_cola`).
- Ningún caso pinta `borrado_sin_aprobar`, `rectificado` ni `anulado`, ni afirma el texto de `facturadoSinPrograma`, `descartado` o `fallido`.
- Escenario medido: tres mutantes sobreviven con 18/18 en verde: (a) `{false && programa && datos.anotaciones…}` (no se pinta ninguna anotación), (b) sustituir el texto `facturadoSinPrograma` por el de `enviado` (una factura emitida se lee «Borrador enviado»), (c) ofrecer Preparar también en `descartado`. CA22 pide «las tres anotaciones como pastilla» y no hay prueba que lo sostenga.

### M4 · Las anotaciones desaparecen en modo degradado y no son pastillas
- `app/(app)/pacientes/[id]/panel-facturacion.tsx:173-180`.
- Las anotaciones se pintan como `<span>` de texto (no `Pildora`, contra CA22) y solo si `programa` existe; en T-026a no hay programa disponible nunca, y en T-026b basta con Desconectar.
- Escenario: un borrador `enviado` que alguien borró en el programa sin emitir (anotación `borrado_sin_aprobar`) → se desconecta la clave → la ficha sigue mostrando «Borrador enviado» y nada más: el profesional cree que el borrador está pendiente de aprobar cuando ya no existe.

## BAJA

### B1 · La vista evalúa `fallido` antes que `descartado`
- `supabase/migrations/20261014120000_proveedor_facturacion.sql:1058-1059` (consumido por `panel-facturacion.tsx:150`).
- La congelación permite una nueva versión descartada con el evento en `fallido`; la vista sigue diciendo `fallido`.
- Escenario: un borrador falla (evento `fallido`) → el profesional lo descarta → la ficha muestra «No se pudo preparar» y el botón Preparar, que siempre devuelve `no_preparable`: un control sin acción real (regla de `CLAUDE.md` › Interfaz).

### B2 · Dos textos en el límite de CA23 y ADR-078.3
- `lib/i18n/es.ts:268` y `lib/i18n/es.ts:262`.
- `borrado_sin_aprobar: 'Borrado en {programa} sin emitir'` sale en el grep de CA23 y no está en la lista permitida (es defendible porque describe el programa, no una acción de la app, y lo fija el diseño §1.7); `facturadoSinPrograma: 'Emitida · nº {numero}'` no es la forma permitida «Emitida en {programa}».
- Escenario: el grep de CA23 sobre `es.ts` devuelve una línea fuera de la lista permitida → un verificador posterior, o una regla de CI, marca el CA como fallido. Lo decide el propietario: o se añaden a la lista, o se reescriben.

### B3 · La lista del técnico se titula «Borradores» cuando no hay programa
- `app/(app)/pacientes/[id]/panel-facturacion.tsx:208`.
- Sin programa, el título cae en `facturacion.panel.titulo` («Borradores»).
- Escenario: un técnico abre la ficha en modo degradado (siempre en T-026a) → ve las facturas emitidas del espejo bajo el rótulo «Borradores».

### B4 · El diálogo Desconectar se cierra a media petición y el error queda obsoleto
- `app/(app)/ajustes/facturacion/dialogo-desconectar.tsx:28-31` con `components/ui/dialogo.tsx:69-71`; también `app/(app)/ajustes/facturacion/formulario-clave.tsx:62`.
- La X, Escape y el clic fuera llaman a `alCerrar` sin mirar `enviando` (solo los dos botones propios lo miran), y el formulario de clave solo usa `aria-disabled`, sin bloquear el envío con Enter mientras `enviando`.
- Escenario: se pulsa Desconectar y Escape antes de la respuesta → la petición falla → `errorDialogo` se guarda con el diálogo cerrado (nadie lo lee) y reaparece al reabrirlo, describiendo un intento anterior. Pulsar Enter dos veces en el campo de clave lanza dos `guardarClaveProveedor` seguidos.

### B5 · La fecha de la clave se formatea en la zona del servidor
- `app/(app)/ajustes/facturacion/page.tsx:54`.
- `format(new Date(conectado.actualizado_en), …)` sin la zona del centro (regla de fechas de `.claude/rules/nextjs.md`, ADR-034; `lib/fechas/zona.ts` existe).
- Escenario: servidor en UTC, clave guardada el 15-10 a las 00:30 en Madrid → Ajustes dice «Conectado desde el 14 de octubre».

### B6 · Textos de error que no describen la causa, y claves muertas
- `app/(app)/ajustes/facturacion/page.tsx:39`, `lib/i18n/es.ts:158`, `lib/i18n/es.ts:532-533`.
- `ajustes.facturacion.errores.fallo` («No se pudo guardar…») se usa también cuando falla la lectura del estado, la prueba de conexión y la desconexión; `ficha.facturacionVacia*` queda sin uso tras el cambio del panel.
- Escenario: la base no responde al abrir Ajustes › Programa de facturación → la página dice «No se pudo guardar. Inténtalo de nuevo» sin que el usuario haya guardado nada.

### B7 · La prueba de que el simulado no entra en producción solo mira `from '…simulado'`
- `lib/facturacion/importaciones.test.ts:22`.
- La expresión solo detecta importaciones estáticas.
- Escenario medido: añadir `export const _x = () => import('./simulado');` a `lib/facturacion/registro.ts` deja la suite en verde: el adaptador simulado podría llegar al registro de producción sin que la prueba lo vea.
