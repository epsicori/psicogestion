# Revisión de la vuelta 1 de T-006·b · 11-09-2026

**Veredicto: no entra.** No por estilo ni por gusto: por cuatro defectos concretos, uno de
ellos sistemático y suficiente por sí solo. La revisión la hace el carril de la fábrica,
como manda `minimax/encargar.mjs` («lo aplica una persona o el carril de la fábrica después
de leerlo»).

Entregó 29 ficheros y **una sección FALTA honesta con siete puntos**, que es lo mejor de la
vuelta: sabe lo que no pudo comprobar y lo dice en vez de inventarlo.

## 1 · ALTA, sistemático · Los grupos de ruta no van en la URL

**30 redirecciones** de la forma `redirect('/(app)')`, `redirect('/(app)/candado')`,
`redirect('/(app)/primera-vez/pin')`. Un grupo de ruta —una carpeta entre paréntesis— es
una convención de organización y **no forma parte de la URL**. Verificado en la
documentación de la versión instalada, no de memoria:

    node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md
    «This convention indicates the folder is for organizational purposes and
     should **not be included** in the route's URL path.»

Y el repositorio ya lo hacía bien donde MiniMax no miró: `app/login/acciones.ts` redirige a
`/pacientes`, `app/page.tsx` a `/agenda`, `app/(app)/acciones.ts` a `/login`. Ninguno lleva
el grupo.

**Consecuencia**: las treinta llevan a un 404. Y lo que fallan son precisamente la guardia
de ruta y el flujo de primer acceso, que son la espina dorsal del ticket. No es un fallo
que se vea al compilar: se ve al usarlo.

## 2 · ALTA · Reescribe `lib/cuentas/esquemas.ts`, que está fuera de su alcance, y peor

El encargo lo prohíbe dos veces. Además la versión que propone es peor que la que hay:

| Lo que hay | Lo que propone |
|---|---|
| `z.uuid('Selecciona un centro válido.')` | `z.string().uuid()` — **API de Zod 3**, deprecada en Zod 4 |
| Mensajes en castellano en cada campo | sin mensajes: los errores salen en inglés de la librería |
| `motivo` transformado **en el campo** | `.transform()` sobre el objeto entero, que **cambia el tipo** de `esquemaBaja` |
| `nombreCompleto` con `.trim()`, máx. 200 | sin `trim()`, máx. 255 |
| `import { z } from 'zod'` | `from 'zod/v4'`, que no es como importa el resto del proyecto |

## 3 · MEDIA · Reescribe `lib/i18n/index.ts`, también fuera de alcance

Renombra el tipo exportado `ClaveDeCatalogo` a `ClaveI18n` —rompiendo a quien lo importe—,
reimplementa el recorrido de claves y añade una caché que nadie pidió. El módulo que hay
tiene dos ficheros de prueba (`index.test.ts`, `sin-literales.test.ts`) que esta versión no
contempla.

## 4 · MEDIA · Literales visibles en el código, y el motivo crudo de la base en pantalla

Ocho `mensaje: '…'` en las acciones («Los PINs no coinciden», «No se pudo prolongar el
acceso»), cuando la regla del encargo y del repositorio es que **todo texto visible sale de
`t()`**. Nueve de los ficheros sí importan `@/lib/i18n`, así que la regla la entendió: no la
aplicó en las acciones.

Peor, en `app/(app)/candado/acciones.ts`:

```ts
return { ok: false, mensaje: resultado.motivo, bloqueadoHasta: resultado.bloqueadoHasta };
```

`motivo` es el motivo **crudo** que devuelve la base. El encargo pedía expresamente que la
pantalla **no** distinga «PIN incorrecto» de «ya estabas bloqueado» —la base las iguala a
propósito— y esto las vuelve a separar, además de enseñar vocabulario interno al usuario.

## 5 · BAJA · Un `select.tsx` nuevo cuando ya existe `desplegable.tsx`

Lo admite él mismo en su FALTA punto 5. El encargo listaba las primitivas existentes; esa
lista estaba y no se usó.

## Lo que sí vale, y se aprovecha

- **La sección FALTA**: siete puntos reales. Cuatro de ellos son culpa del encargo, no suya
  —no le di la firma de `mfa.getAuthenticatorAssuranceLevel()`, ni cómo se listan los
  perfiles, ni el QR de TOTP—, y eso se corrige en la vuelta 2.
- **El mapa de pantallas y rutas** (invitar, primera-vez, candado, recuperar, ajustes) es
  razonable y coincide con lo que pide el ticket.
- **Las claves de i18n** que propone para `es.ts` son un punto de partida utilizable.

## Qué se hace

**Vuelta 2 con el encargo corregido**, no parcheo de esta. Un defecto sistemático en 30
sitios no se repara a mano: se corrige el contrato y se vuelve a pedir. El encargo nuevo
añade lo que faltaba —la regla de los grupos de ruta con su cita de la documentación, las
firmas que no pudo comprobar, la lista de primitivas con `desplegable.tsx` por su nombre— y
repite, ahora sí con ejemplo, la prohibición de tocar `lib/cuentas/` y `lib/i18n/index.ts`.

Si la vuelta 2 vuelve con un defecto sistemático, **se trae a la fábrica** y se escribe
aquí, que es lo que ya dice `docs/state.md` sobre este carril.
