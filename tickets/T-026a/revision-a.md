Sin hallazgos ALTA. (Revisor A, ronda 1, commit b57a26fb58acbcbc2981c203791d4acf8ef4e4f8 · base `main`; foco: migración 20261014120000, RLS y solo adición, banco 31, cola, sincronizador, Vault y clave, ruta de drenado y `proxy.ts`.)

Recuento: 0 ALTA · 2 MEDIA · 3 BAJA.

## Comprobado y correcto (no son hallazgos)

- Regla 6: `borradores_factura_envios`, `facturas_espejo` y `facturas_anotaciones` no tienen `UPDATE` ni `DELETE` para ningún rol. Las tres tienen disparador de solo adición, y la congelación del borrador enviado se aplica también a `postgres` (la matan G1/G5, J1/J2).
- Las 19 funciones nuevas llevan `revoke all … from public, anon, authenticated, service_role` y su `grant` coincide con la matriz del diseño. `encolar_envio_borrador` devuelve el mismo 42501 en todas las ramas que niegan y usa `coalesce(…, false)`. `rol_actual()` exige perfil activo.
- `fn_validar_cobro_factura_espejo` copia exacta la regla de alta de `cobros`. El orden alfabético de los disparadores es el que pide el diseño (sellado < cotas < tras_envio; validar_cobro < validar_cobro_factura_espejo).
- `for update` en la cabecera (encolar) frente a `for key share` (sellado) serializa encolar y versión nueva.
- `p_clave` solo pasa por la validación y por Vault. La auditoría del ajuste excluye `sincronizado_hasta`.
- Ruta de drenado: sin secreto configurado responde 503 y nunca 200. `timingSafeEqual` va precedido de la comparación de longitudes. El registro es solo `'[facturacion] drenar', 'fallo'`. `proxy.ts` solo añade `/api/facturacion/drenar` a las rutas públicas.
- Mutantes del diseño: los permisos de encolar los mata I1, el orden de disparadores A10/J3 y la rama del técnico sin `centros_actuales()` G1/G5.

## MEDIA

### H1 · El sincronizador se atasca para siempre con un documento que la base rechaza (local)
`lib/facturacion/sincronizador.ts:76-77` (y `fallo`, l.35). Si `registrar_factura_espejo` devuelve cualquier error que no sea 23505, la función lanza y aborta la sincronización entera antes del `avanzar_cursor_sincronizacion` final (l.130). La pasada A ordena siempre por `enviado_en` (`documentos_para_sincronizar`, migración l.774), así que la siguiente ejecución vuelve a tropezar con el mismo documento.
- **Escenario**: un borrador se aprueba en el programa con una retención de IRPF (total ≠ base + cuota), con un enlace que no es `https://` o con un número de más de 60 caracteres. También vale un documento con anotación `borrado_sin_aprobar` que la pasada B observa como aprobado.
- **Efecto**: `registrar_factura_espejo` devuelve 23514 (check `base + cuota_iva = total` en l.67, o los checks de l.60/l.65, o el `raise` de l.662-666). El sincronizador lanza y la ruta responde 500. Cada 5 minutos se repite lo mismo: ningún espejo posterior se copia, el cursor no avanza y no se avisa a nadie (la ruta solo registra «fallo»). La pasada A no salta el documento, porque sigue sin espejo y sin `borrado_sin_aprobar`.
- **Qué falta**: tratar el rechazo por documento (aviso o anotación y seguir) en vez de abortar la pasada. Además, una prueba con el simulado que devuelva un total incoherente y compruebe que el documento siguiente sí se copia.

### H2 · Un segundo fallo de envío del mismo borrador no avisa a nadie (cruce)
`supabase/migrations/20261014120000_proveedor_facturacion.sql:614-619` (`registrar_fallo_envio`), junto con el índice ya existente `notificaciones_origen_unico (perfil_id, tipo, origen_tabla, origen_id)` de `20261006120000`, l.20. El aviso `facturacion_envio_fallido` usa como origen el id del borrador con `on conflict … do nothing`. Por eso hay un solo aviso por borrador y administrador para siempre, por muchas veces que se reencole.
- **Escenario**: el envío falla de forma permanente y se avisa. El administrador vuelve a preparar el borrador (`encolar_envio_borrador` pone el evento fallido en `pendiente` con `intentos = 0`, l.920-925). El segundo intento acaba en `ambiguo`, cuyo texto pide comprobar en el programa antes de volver a prepararlo.
- **Efecto**: el `insert` choca con el aviso del primer fallo y no se crea nada. El administrador no se entera de que el documento puede existir ya en el programa. El panel muestra «fallido» con el botón Preparar (`app/(app)/pacientes/[id]/panel-facturacion.tsx:150`) y, si lo pulsa, se crea un segundo documento en el programa para el mismo borrador. Es justo el duplicado que el texto de `ambiguo` intenta evitar.
- **Prueba**: el banco no lo ve. N11 (intento 8 tras reencolar) no comprueba ningún aviso, porque el de N9 ya existe.

## BAJA

### H3 · «fallido» oculta «descartado» y el panel ofrece Preparar sobre un borrador descartado (local)
`supabase/migrations/20261014120000_proveedor_facturacion.sql:1057-1059` (el CASE de `borradores_factura_estado`, en el orden fijado por el diseño). Mientras no hay envío, la congelación no actúa. Con el evento en `fallido`, se puede añadir una versión `descartado = true` (hoy por PostgREST con la política de alta de versiones; mañana por T-046).
- **Escenario**: el envío falla, después se descarta el borrador y alguien abre la ficha.
- **Efecto**: el estado sigue siendo `fallido`, porque la rama de la cola va antes que la de `u.descartado`. El panel ofrece Preparar y `encolar_envio_borrador` responde 23514 «El borrador no tiene una versión que se pueda preparar» (l.900-902). Es un botón que siempre falla y un estado que contradice la última versión.

### H4 · Tras «borrado sin aprobar», el borrador queda bloqueado sin salida (local)
Migración, `encolar_envio_borrador` l.904-909, y la congelación (§9). Si el programa informa de que el documento se borró sin aprobar, la fila de `borradores_factura_envios` sigue existiendo.
- **Escenario**: el profesional prepara el borrador y el administrador lo borra en Holded sin aprobarlo, por ejemplo porque tenía un error.
- **Efecto**: el estado sale `enviado` para siempre. `encolar` devuelve el evento viejo y no hace nada. La congelación impide sellar una versión corregida y también descartarlo. El borrador no se puede volver a preparar, corregir ni cerrar, y el diseño no lo prevé ni lo anota como límite.

### H5 · El banco no distingue la rama del profesional en la cabecera del espejo (prueba)
`scripts/rls/31-proveedor-facturacion.sql:527-538` (31.G3/31.G4). El diseño (`tickets/T-026a/diseno.md:677-678`) pide un caso que distinga `es_profesional_asignado(e.paciente_id)` de `b.profesional_id = auth.uid()` (D17), o que se anote como mutante no matado.
- **Escenario**: alguien cambia la rama del profesional de `facturas_espejo_cabecera` por `b.profesional_id = auth.uid()`, la regla de la ronda 2 que T-021 ya no aplica.
- **Efecto**: G3 y G4 siguen verdes, porque en las fijaciones PRO1 y PRO2 son a la vez autores y asignados. Un profesional asignado que no es el autor deja de ver lo emitido y el banco no lo detecta. La bitácora (`docs/bitacora/T-026a.md`) menciona D17, pero no lo anota como mutante no matado. La evidencia no la he leído, por regla.

## Descartados (sin escenario alcanzable)

- Un solo `try` en `route.ts:42-67`, cuando T-026 §1.6 pide uno para cada paso: `drenarEnvios` no lanza en la práctica (si falla el reclamo, devuelve; los errores por fila los atrapa su propio `try`), así que no hay ningún escenario en el que un fallo del drenado se lleve por delante la sincronización.
- Concesión de 5 min frente a un documento duplicado si el proceso muere entre `crearBorrador` y `registrar_envio_borrador`: es el riesgo de diseño abierto en Holded Q5, no un fallo de esta implementación.
