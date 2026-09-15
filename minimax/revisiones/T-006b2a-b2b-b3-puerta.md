# Puerta de entrada · b2a, b2b y b3 (segunda vuelta) · 11-09-2026

`b2` se parte en dos —enrolar TOTP por un lado, PIN y guardia de ruta por otro— y a los
tres encargos se les antepone un aviso corto de **formato**, que era lo único que fallaba:
un fichero por ruta y una sola vez, `lib/i18n/index.ts` no se toca, nada que no se haya
pedido, y terminar siempre con `## FALTA`.

| | b2a · TOTP y códigos | b2b · PIN y guardia | b3 · candado (2ª) |
|---|---|---|---|
| ficheros | 3 | 7 | 7 |
| fuera de alcance | **0** | **0** | **3** |
| rutas repetidas | **0** | **0** | **1** |
| llega entera con FALTA | **sí** | **sí** | **no** |
| **pasa la puerta** | **sí** | **sí** | no |

**Partir funcionó.** Las dos mitades de b2 pasan la puerta a la primera, y son las dos
primeras entregas de este carril que lo hacen sin arreglo previo. b2a cabe en tres ficheros
y su FALTA dice «ninguna», enumerando los cuatro errores de la vuelta anterior que evitó.

**La FALTA de b2b es la mejor señal de las cuatro vueltas**: admite que escribió
`@/lib/countas/candado` y pide que se le confirme la ruta, pregunta si `sesion.supabase` es
el cliente correcto para `getAuthenticatorAssuranceLevel()`, y avisa de que **ha reescrito
`app/(app)/layout.tsx` sin haberlo visto**. Eso último hay que mirarlo con lupa al
aplicarlo: el armazón con la navegación y el selector de centro vive ahí.

**b3 vuelve a caer, y ya no por tamaño**: son siete ficheros, y tres están fuera de su
alcance —`lib/cuentas/candado.ts`, `lib/cuentas/esquemas.ts` y **`lib/i18n/index.ts` por
cuarta vez**—, con `es.ts` mandado dos veces y sin FALTA. Es el encargo con más reglas de
«no hagas X» —el candado que no prolonga al renderizar, el aviso no modal, el mensaje
igualado— y es el que peor sale.

## Estado de las cuatro piezas de T-006·b

| Pieza | Estado |
|---|---|
| **b1** · ajustes del administrador | **integrada** en `T-006b1-ajustes-admin` (reescrita aquí) |
| **b2a** · enrolar TOTP y códigos | entregada y **pasa la puerta**; pendiente de revisar el fondo y aplicar |
| **b2b** · PIN y guardia de ruta | entregada y **pasa la puerta**; ojo al `layout.tsx` que reescribe a ciegas y al `countas` de su FALTA |
| **b3** · candado y recuperación | **devuelta por segunda vez**. O se parte otra vez (candado por un lado, `/recuperar` por otro) o se escribe aquí |
