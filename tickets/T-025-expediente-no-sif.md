---
id: T-025
titulo: Expediente de no-SIF — por qué Psicogestión no firma declaración responsable
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-021, T-026]
estado: pendiente
---

# Contexto

**Este ticket cambió de naturaleza con el ADR-053.** Antes redactaba la declaración responsable
(DR) de Psicogestión como componente principal de facturación. Ahora hace lo contrario:
**demuestra que no hay nada que declarar**, y deja la demostración por escrito y automatizada.

No es papeleo defensivo. El art. 201.bis LGT sanciona con **150.000 € por ejercicio con ventas
y por tipo de sistema** al productor de un SIF no certificado. Si algún día alguien sostiene que
Psicogestión era un SIF, lo único que vale es poder enseñar **cuándo, cómo y con qué prueba** se
garantizó que no lo era. La AEAT no homologa nada por adelantado: **lo que defiende no es un
sello, es poder demostrarlo.** Es el principio 3 de la constitución aplicado a normativa.

ADR **053** (entero, en especial a, b, c, h y k).

## No se empieza todavía, y por qué

> El frontmatter dice `pendiente` porque la plantilla solo admite `pendiente | en_curso |
> hecho`. **De hecho está bloqueado.**

Depende de las dos respuestas que el ADR-053 (k) deja abiertas:

1. **La duda del «formando una unidad».** La FAQ de la Sede dice que el sistema de
   pre-facturación «debe estar vinculado indefectiblemente al sistema de emisión de facturas
   formando una unidad», y **no hay aclaración de la AEAT que resuelva el caso «software externo
   que crea borradores en un SIF de terceros vía API»**. Las aclaraciones 5 y 10 apuntan a que
   no nos arrastra. Hace falta **consulta vinculante o informe de asesor fiscal**, y su texto es
   la pieza central de este expediente.
2. **Las respuestas de Holded por escrito**: en qué instante remite el registro de facturación,
   qué devuelve la API al aprobar, y si su DR contempla la creación de documentos por API desde
   software de terceros.

**Pasa a `pendiente` cuando esos dos documentos estén en mano.** No antes. Y si la respuesta a
(1) es que sí nos arrastra, esto no es una fila pendiente: **para el ticket y reabre el ADR**.

## Tareas

- [ ] **Matriz inversa** en `docs/conformidad-sif.md`: una fila por cada una de las **ocho
      funcionalidades** que según la aclaración 5 de la AEAT obligan a certificar —generación
      del RF, encadenamiento, impresión de facturas, generación del QR, envío a sede
      electrónica, enlace indefectible entre componentes, conservación inalterada y registro de
      eventos—, con tres columnas: **quién la implementa** (siempre el proveedor), **por qué no
      la tocamos**, y **la prueba automática que lo demuestra**. Una fila sin prueba es una fila
      que no está hecha.
- [ ] **El invariante `approveDoc: false`, probado en negativo.** Es el ADR-053 (b) y es de lo
      que cuelga todo lo demás: una prueba que recorra el código y demuestre que **no existe
      ninguna ruta** que envíe `approveDoc: true` ni que invoque el endpoint de aprobación del
      proveedor. Que se entere el CI, no una persona en seis meses.
- [ ] **La prueba de que no conservamos**: `facturas_espejo` no tiene columna de PDF, de QR ni
      de registro de facturación, y no hay fichero en Storage con la factura. `grep` en CI.
- [ ] **La prueba de que no numeramos**: no existe `series_facturacion`, ni columna
      `siguiente_numero`, ni código que genere numeración de factura.
- [ ] **La conservación inalterable de los borradores** (art. 29.2.j LGT, aclaración 11): las
      pruebas de inmutabilidad y de cadena de huellas de T-021 **son** la evidencia, y se citan
      desde la matriz. Incluye el borrador descartado que nunca llegó a factura.
- [ ] **Declaración de lo que Psicogestión NO es, visible en el producto.** Una página accesible
      desde Ajustes que diga, sin letra pequeña, que Psicogestión no expide facturas, que no es
      un sistema informático de facturación, que la expedición la hace el proveedor que el
      cliente configure y que la declaración responsable es de ese proveedor.
      - **Es protección comercial, no adorno**: si un cliente cree que compró un SIF y no lo
        era, el problema vuelve. Va también en el material de venta, no solo dentro de la app.
- [ ] **El texto de la consulta vinculante o el informe del asesor, archivado** en `docs/` con
      su fecha, y citado desde la matriz como fundamento de la fila del enlace indefectible.
- [ ] **Entrada en el pipeline**: la matriz se verifica en CI junto al resto. Un cambio que
      rompa una prueba citada por la matriz rompe la build.

## Criterios de aceptación (verificables)

- [ ] **Automático** — cada fila de la matriz nombra una prueba existente; un script comprueba
      que **todas** existen y **todas** pasan. Cero filas sin prueba.
- [ ] **Automático** — no existe ruta de código que apruebe un documento en el proveedor ni que
      mande `approveDoc: true`. Si alguien la añade, el CI falla.
- [ ] **Automático** — no existe columna ni fichero que conserve la factura expedida.
- [ ] **Automático** — no existe generación de numeración de factura en el repositorio.
- [ ] **Automático** — las pruebas de inmutabilidad y de cadena de T-021 pasan y están citadas.
- [ ] **Manual** — la página «Psicogestión no expide facturas» es accesible desde Ajustes y dice
      quién sí expide y de quién es la declaración responsable.
- [ ] **Manual** — el informe del asesor o la consulta vinculante está archivado y citado.
- [ ] **Automático** — `npm run lint && npm run build` limpios y el pipeline de T-009 en verde.

## Guion de comprobación manual

1. Ejecutar el script de la matriz y leer la salida: filas, pruebas, resultado.
2. Añadir a mano un `approveDoc: true` en una rama sucia y ver fallar el CI. Revertirlo.
3. Abrir la página de Ajustes y leerla como la leería un comprador.

## Notas para el agente

- **Este ticket no se implementa sin las dos respuestas.** Si llega bloqueado, se escala; no se
  redacta un expediente sobre una consulta que nadie ha hecho.
- **Nada de citar la normativa de memoria.** Las citas de la AEAT están en el ADR-053 con su
  aclaración numerada; se copian de ahí o de la fuente, no se parafrasean.
- El texto legal lo revisa una persona antes de publicarse. El ticket lo deja escrito, probado y
  visible; **no lo da por firmado**.
- La matriz vive en `docs/`, así que **la escribe el arquitecto al integrar**, no el
  implementador. El implementador deja el script, las pruebas y el borrador en su informe.
- Si al construir la matriz aparece una funcionalidad de las ocho que **sí** tocamos, eso no es
  una fila pendiente: es un hallazgo que para el ticket y reabre el ADR-053.
