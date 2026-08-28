---
id: T-023
titulo: Cobros — registro, cobros parciales y pendiente de cobro
modelo: sonnet
fase: 2
prioridad: alta
depende_de: [T-021, T-007]
estado: pendiente
---

# Contexto

`docs/interfaz.md` §Facturación pinta «pendiente de cobro» como una de las tres métricas de la
pantalla. Hoy no hay nada detrás: sin `cobros` es un número decorativo. Este ticket lo hace
real.

Es además **la única parte de Facturación que ve el técnico administrativo**: la matriz de
`architecture.md` §Roles dice «Cobros, sin dato clínico». Esa fila es el criterio de diseño de
toda la pantalla, no una restricción que se añade al final.

Es `sonnet` **con revisión de Opus** —toca dinero y RLS— y va sobre-especificado.

Módulo del prototipo: **Facturación**. Sección: `docs/interfaz.md` §Facturación y choque **13**
(una sola pantalla, con selector solo para el administrador). ADR **053** (i: el concepto que
sale al proveedor no es clínico; d: el espejo es de solo lectura), **033**, **041**, **043**.

## Tareas

- [ ] **Registro de cobro**: importe, fecha, forma de pago y referencia. Un cobro es **una fila
      nueva** en `cobros` (T-021), siempre.
- [ ] **Un cobro puede no tener factura, y es el caso normal.** Se cobra la sesión y se factura
      después, o no se factura. `factura_espejo_id` es nulo y la pantalla lo admite sin
      fricción: cobro suelto contra paciente, o cobro contra una factura del espejo.
- [ ] **Cobros parciales de primera clase.** Una factura puede tener N cobros. El saldo es
      `total − suma(cobros)` y se **deriva de una vista**, jamás de una columna que se
      actualiza: un contador que se incrementa es un `UPDATE`, y `cobros` es de solo adición.
- [ ] **Estado de cobro derivado**, no almacenado: `pendiente`, `parcial`, `cobrada`,
      `sobrecobrada`. El cuarto existe a propósito: si aparece, hay un error real que alguien
      tiene que ver, y esconderlo con un `least()` lo entierra.
- [ ] **Una devolución es un cobro negativo**, con su motivo. No hay borrado ni edición de un
      cobro. El botón no está.
- [ ] **Listado de `facturas_espejo` con su estado de cobro**, filtrable por estado, rango de
      fechas y forma de pago. Acción «Registrar cobro» en la fila. El número y el importe vienen
      del proveedor y **no se editan aquí**: si algo está mal, se corrige donde se expidió.
- [ ] **Selector de profesional solo para el administrador** (choque 13). El profesional ve lo
      suyo **sin selector visible**: una entrada que no puede usar le revela que existe y a
      quién pertenece.
- [ ] **Vista del técnico administrativo**: las mismas facturas y los mismos cobros,
      **sin `tipo_terapia_id`, sin `cita_id` y sin acceso a `tarifas_paciente`**. Ve a quién se
      factura, cuánto y si está cobrado. Acotado por centro (ADR-033).
      Lo que le falta **no se muestra deshabilitado**: no se muestra.
- [ ] **La métrica «pendiente de cobro» de la pantalla de Facturación** pasa a leer de esta
      vista. Cuenta **lo que el rol puede ver**, no el total de la organización (choque 2).
- [ ] **Server Action** para registrar cobro, validada con el mismo esquema Zod del formulario.
      Rechaza importe cero y fecha futura.

## Criterios de aceptación (verificables)

- [ ] **Automático** — dos cobros parciales sobre una factura de 100 € dejan el saldo en el
      valor correcto y el estado en `parcial`; el tercero la pone en `cobrada`.
- [ ] **Automático** — un cobro que supera el total deja la factura en `sobrecobrada` y la
      pantalla lo señala; no se silencia.
- [ ] **Automático** — `update cobros` y `delete from cobros` **fallan**.
- [ ] **Automático** — una devolución entra como fila con importe negativo y el saldo se mueve.
- [ ] **Automático** — como `tecnico_administrativo`: filas en `cobros`, y la consulta de
      facturas **no** devuelve `tipo_terapia_id` ni `cita_id`; cero filas en `tarifas_paciente`.
- [ ] **Automático** — como `profesional_sanitario`: cero cobros de facturas ajenas, y los
      propios sí (prueba negativa con su gemela positiva).
- [ ] **Manual** — como profesional, **no existe** el selector de profesional en la pantalla.
- [ ] **Manual** — como administrador, el selector filtra y la métrica se mueve con él.
- [ ] **Manual** — no existe ningún control para editar o borrar un cobro.
- [ ] **Manual** — `/facturacion` al lado de `/prototipo`: mismo vocabulario visual, sin
      controles de adorno.
- [ ] **Manual** — la misma ruta con cada rol enseña exactamente lo que le concede la matriz de
      `architecture.md` §Roles, ni un campo más.
- [ ] **Manual** — a 360 px la fila de factura sigue permitiendo registrar un cobro.
- [ ] **Automático** — el verificador de accesibilidad de T-009 en verde, y
      `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm run dev` y abrir `/facturacion` como administrador.
2. Registrar dos cobros parciales sobre una factura del seed y ver el saldo y el estado.
3. Registrar un tercero que se pase: aparece `sobrecobrada`, visible.
4. Entrar como profesional: no hay selector, y solo se ven las propias.
5. Entrar como técnico: se ven importes y estados, y en ninguna parte el tipo de terapia.

## Notas para el agente

- **El saldo se deriva siempre.** Si aparece la tentación de una columna `pendiente` en
  `facturas_espejo`, es el bug: el espejo es de solo lectura y esa columna sería un `UPDATE`.
- El estado de cobro **no es el `estado_proveedor` del espejo**. Son dos columnas distintas y
  dos conceptos distintos; no las mezcles en una sola píldora (es el choque de píldoras que ya
  costó una entrada en `interfaz.md`).
- **No toques `facturas_espejo` desde aquí. Ni para marcar nada.** Solo escribe en esa tabla el
  sincronizador de T-026, por función `security definer` (ADR-053 d).
- **No expidas nada, ni ofrezcas un botón que lo parezca.** Aquí no se factura (ADR-053 a).
- Reutiliza las primitivas de `components/ui/` de T-007.
