# Revisión de las vueltas 2 y 3 de T-006·b · 11-09-2026

## Vuelta 2 · el encargo corregido arregló lo sistemático, y apareció el fallo de raíz

Con la adenda —la regla de los grupos de ruta con su cita de la documentación instalada, y
las firmas de MFA que la vuelta 1 no pudo comprobar—, lo que estaba roto dejó de estarlo:

| | vuelta 1 | vuelta 2 |
|---|---|---|
| `redirect` con el grupo dentro de la URL | **30** | **0** |
| API de Zod 3 (`z.string().uuid()`) | 1 | **0** |
| ficheros fuera de alcance | 1 | **4** |
| rutas repetidas en la misma respuesta | 0 | **4** |

**Pero se cortó.** 58 686 caracteres y la respuesta termina **dentro de un `import`**, sin
sección FALTA y sin las pantallas de invitación ni de recuperación. El techo de salida de la
API son 16 384 *tokens*: siete pantallas con sus acciones y sus formularios no caben, y el
modelo no avisa de que no caben — escribe hasta que se le acaba el sitio.

**Ese es el fallo de raíz de las dos vueltas anteriores, y no es de calidad: es de tamaño.**
T-009·B entró a la primera y era pequeño. La conclusión no es «MiniMax no puede con esto»,
es «el encargo no cabía».

## Vuelta 3 · partido en tres, y es la primera que pasa la puerta

`T-006·b` se parte como en su día se partió T-007. La primera pieza, **b1 · ajustes del
administrador** (invitar, reponer TOTP, dar de baja), se pidió sola:

| La puerta, antes de leer una línea de lógica | vuelta 3 |
|---|---|
| ficheros fuera de alcance | **0** |
| rutas repetidas | **0** |
| redirecciones con el grupo en la URL | **0** |
| llega entera | **sí**, con su sección de notas al final |
| primitivas existentes reescritas | 2 (`desplegable.tsx`, `dialogo.tsx`) |

Once ficheros, todos dentro de `app/(app)/ajustes/**` y `lib/i18n/es.ts`. **La autorización
está bien puesta**: cada una de las tres Server Actions llama a `exigirSesion()` y comprueba
`estadoDeCuenta().rol === 'administrador'` por dentro, que es lo que pide la constitución.

### Los cuatro defectos que quedan, todos en la ruta de error

1. **El criterio de aceptación del técnico sin centro no se cumple.** La acción elige el
   mensaje de error recorriendo `fieldErrors.correo`, `nombreCompleto`, `rol` y `root` — y
   el `.refine` de `esquemaInvitacion` pone su error en **`fieldErrors.centroId`**, que no
   está en la lista. El usuario ve un error genérico en vez de «El técnico administrativo
   exige un centro».
2. **`centroId: formData.get('centroId')?.toString() ?? null`**: un campo presente y vacío
   da `''`, no `null`, y `z.uuid()` lo rechaza con un mensaje que no toca. La cadena vacía
   tiene que convertirse en `null`.
3. **`t('...').replace('{motivo}', ...)`** en tres sitios, teniendo `tCon()` al lado y
   usándolo bien en otros tres. Inconsistente.
4. **`validado.error.flatten()`** en vez de `z.flattenError(validado.error)`, que es como lo
   hacen `app/login/acciones.ts` y `app/(app)/pacientes/acciones.ts`. Las dos funcionan en
   Zod 4; el proyecto usa la segunda.

Más las dos primitivas reescritas, que simplemente **no se aplican**: `desplegable.tsx` y
`dialogo.tsx` ya existen y tienen pruebas propias.

### Veredicto

**b1 se puede aplicar**, arreglando esos cuatro puntos al integrarlo y descartando las dos
primitivas. Es la primera entrega de este carril en varias vueltas que no hay que devolver
entera.

**b2 (primer acceso con TOTP) y b3 (candado del PIN) se piden igual de pequeños**, con la
misma adenda. El corte está en `minimax/cortes/T-006.md`.

**La lección, para cualquier encargo futuro de este carril**: no es cuánto sabe el modelo,
es cuánto cabe en una respuesta. Tres pantallas por encargo, y la respuesta se mide con tres
preguntas antes de leerla —¿algo fuera de alcance?, ¿alguna ruta repetida?, ¿llegó entera?—
porque las tres se contestan con un `grep` y ahorran leer sesenta mil caracteres.
