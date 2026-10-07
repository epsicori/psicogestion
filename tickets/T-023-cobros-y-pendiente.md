---
id: T-023
titulo: Cobros — registro, cobros parciales y pendiente de cobro
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-021, T-007]
estado: pendiente
riesgo: alto
territorio:
  - supabase/migrations/20261013120000_cobros_y_pendiente.sql
  - scripts/rls/30-cobros.sql
  - scripts/rls/26-economico.sql
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts
  - app/(app)/facturacion/**
  - components/armazon/modulos.ts
  - components/armazon/modulos.test.ts
  - components/ui/piezas.tsx
  - components/ui/piezas.test.tsx
  - lib/contraste/**
  - lib/i18n/es.ts
  - accesibilidad/facturacion.spec.ts
  - tickets/T-023/**
  - docs/bitacora/T-023*.md
  - docs/state.md
---

> **Ronda 2 (07-10-2026), decisiones del propietario.** (1) A-H2: el pendiente sigue la flecha de
> `fusionado_en` y suma lo del duplicado en el superviviente, dentro de T-023. (2) B-H4: el territorio
> se amplía a `components/ui/piezas.tsx` (y su prueba) y `lib/contraste/**` para corregir el tono
> `success` de `Pildora` en todas las pantallas. (3) CA15: el fallo del banco 23 es ajeno y pasa a
> T-050; CA15 se juzga con el resto de bancos en verde.

> **Partido el 05-10-2026 (P4 de `tickets/T-023/diseno.md`).** Este ticket hace cobros, pendiente y
> pantalla. La sección «Lo que depende de T-026» y el criterio «con T-026 integrado» pasan a
> `tickets/T-023b-facturas-del-espejo-y-cobro-contra-factura.md`, junto con la asignación de cobros
> anteriores (`cobros_facturas`). Respuestas del propietario: P1 (ii) lo devengado menos lo cobrado;
> P2 la `no_asistida` no cuenta; P3 una cita sin precio cuenta 0 y se señala; P5 `cobros.motivo`
> con check. El `territorio:` está en el diseño, §6.

# Contexto

`docs/interfaz.md` §Facturación pinta «pendiente de cobro» como una de las tres métricas de la
pantalla. Hoy no hay nada detrás: sin `cobros` es un número decorativo. Este ticket lo hace
real.

Es además **la única parte de Facturación que ve el técnico administrativo**: la matriz de
`architecture.md` §Roles dice «Cobros, sin dato clínico». Esa fila es el criterio de diseño de
toda la pantalla, no una restricción que se añade al final.

**Cambio del 03-10-2026 (P3 de T-021, ADR-077).** Pasa de `sonnet` a `opus` y de riesgo medio a
**alto**: este ticket crea ahora la vista del pendiente, una vista definer que lee el técnico, y eso es
RLS. Además:
- **El pendiente es por paciente** (P1 del diseño de T-021), no por factura. Un cobro hecho antes de
  facturar no se puede enlazar después, porque `cobros` es de solo adición.
- **Qué cuenta el pendiente está sin decidir.** Lo decide el diseño de este ticket (§Decisión
  pendiente).
- **El espejo de facturas nace en T-026**, no en T-021. Todo lo que lista facturas o enlaza un cobro
  con una factura depende de T-026 (§Lo que depende de T-026).
- **Lo cobrado es solo lo que registra la app.** El estado de pago que lleve el programa de
  facturación no se copia (ADR-077).

Módulo del prototipo: **Facturación**. Sección: `docs/interfaz.md` §Facturación y choque **13**
(una sola pantalla, con selector solo para el administrador). ADR **053** (i: el concepto que
sale al proveedor no es clínico; d: el espejo es de solo lectura; g: cobros y pendiente son de la
app), **077** (qué se copia del programa), **033**, **041**, **043**. Diseño de T-021:
`tickets/T-021/diseno.md`, §A.8 (P1), §P3.4 y §«Adenda P3 aplicada».

## Decisión pendiente al diseñar: qué cuenta el pendiente (P3.d)

El arquitecto la plantea al propietario antes de diseñar el resto. Opciones:

- **(i) Lo facturado menos lo cobrado.** Suma de los totales del espejo del paciente menos la suma de
  sus cobros. Con este ticket dependiendo entero de T-026. Huecos que tiene (§P3.4 del diseño de T-021):
  - la factura de un bono (T-027) no sale de un borrador y no llega al espejo;
  - las rectificativas y las facturas hechas directamente en el programa no llegan al espejo;
  - sin proveedor configurado (modo degradado de T-026) no hay nada facturado, y el pendiente sería
    siempre 0;
  - como se cobra antes de facturar, todo cobro sale como excedente hasta que el programa aprueba la
    factura;
  - una factura anulada en el programa solo se ve por la anotación de T-026 (ADR-077, punto 2), y la
    vista tendría que descontarla.
- **(ii) Lo devengado menos lo cobrado.** Lo devengado son las citas realizadas sin bono, por la
  tarifa vigente ese día, más el importe de los bonos dados de alta. No depende del programa y
  funciona sin proveedor. Pide decidir:
  - cómo resuelve su tarifa cada cita: `tarifas_paciente` y, si no hay, `tipos_terapia.tarifa_base`;
  - si una cita `no_asistida` se cobra;
  - qué pasa con una cita realizada sin tarifa resoluble.

Sea cual sea:
- el pendiente es **por paciente** (P1);
- nunca baja de cero, y lo cobrado de más sale como excedente, con la semántica de `pendiente()` de
  `lib/dinero/reparto.ts` (`EstadoCobro = 'pendiente' | 'cobrado' | 'cobrado_de_mas'`);
- es una vista: redefinirla después no migra datos.

## Tareas

- [ ] **Vista del pendiente por paciente** (`pendiente_paciente`, nombre provisional), según lo que
      se decida arriba. Es definer con barrera, porque el técnico no lee `citas` ni el espejo, y su
      `where` repite exactamente la política de lectura de `cobros` de T-021: administrador, profesional
      asignado y técnico de su centro. Es la puerta lateral de este ticket.
- [ ] **Registro de cobro**: importe, fecha, forma de pago y referencia. Un cobro es **una fila
      nueva** en `cobros` (T-021), siempre.
- [ ] **Un cobro no necesita factura, y es el caso normal.** Se cobra la sesión y se factura
      después, o no se factura. El cobro va contra el paciente. Cobrar contra una factura del espejo
      solo existe cuando T-026 haya añadido el enlace.
- [ ] **Cobros parciales de primera clase.** Un paciente puede tener N cobros. Lo que debe se
      **deriva de la vista**, jamás de una columna que se actualiza: un contador que se incrementa es
      un `UPDATE`, y `cobros` es de solo adición.
- [ ] **Estado de cobro derivado**, no almacenado, con la semántica de `pendiente()` de `lib/dinero`.
      `cobrado_de_mas` existe a propósito: si aparece, hay un error real que alguien tiene que ver, y
      esconderlo lo entierra. Si el diseño quiere enseñar además «parcial» (debe y ya ha pagado
      algo), lo deriva en la pantalla, no en una columna.
- [ ] **Una devolución es un cobro negativo**, con su motivo. No hay borrado ni edición de un
      cobro. El botón no está.
- [ ] **Selector de profesional solo para el administrador** (choque 13). El profesional ve lo
      suyo **sin selector visible**: una entrada que no puede usar le revela que existe y a
      quién pertenece.
- [ ] **Vista del técnico administrativo**: los mismos cobros y el mismo pendiente, **sin
      `tipo_terapia_id`, sin `cita_id` y sin acceso a `tarifas_paciente`**. Ve a quién se cobra,
      cuánto y si está cobrado. Acotado por centro (ADR-033).
      Lo que le falta **no se muestra deshabilitado**: no se muestra.
- [ ] **La métrica «pendiente de cobro» de la pantalla de Facturación** pasa a leer de esta
      vista. Cuenta **lo que el rol puede ver**, no el total de la organización (choque 2).
- [ ] **Server Action** para registrar cobro, validada con el mismo esquema Zod del formulario.
      Rechaza importe cero y fecha futura.

## Lo que depende de T-026

El espejo, el enlace de un cobro a una factura y la cabecera de facturas que ve el técnico nacen en
T-026 (ADR-077). Si T-026 no está integrado cuando empiece este ticket, el diseño decide entre
esperar o partir el ticket: cobros y pendiente primero, y el listado de facturas después. Lo que
depende:

- [ ] **Listado de facturas del espejo**, filtrable por rango de fechas y por forma de pago de sus
      cobros, con la acción «Registrar cobro» en la fila. Sin filtro por estado de cobro de cada
      factura: el pendiente es por paciente (P1). El número y el importe vienen del programa y
      **no se editan aquí**: si algo está mal, se corrige donde se expidió. El espejo no tiene
      estado del programa ni lo cobrado allí (ADR-077): la fila enseña los cobros de la app, y nada
      más.
- [ ] **Registrar un cobro contra una factura** del espejo (enlace nulo por defecto).
- [ ] **El técnico ve la cabecera** de esas facturas por la vista de T-026, sin `tipo_terapia_id`
      ni `cita_id`.
- [ ] **El pendiente, si cuenta lo facturado** (opción (i) de arriba).

## Criterios de aceptación (verificables)

- [ ] **Automático** — con un paciente que debe 100 €, dos cobros parciales dejan el pendiente en
      el valor correcto y el estado en `pendiente`; el tercero lo deja en 0 y en `cobrado`.
- [ ] **Automático** — un cobro que supera lo debido deja el estado en `cobrado_de_mas`, con su
      excedente, y la pantalla lo señala; no se silencia.
- [ ] **Automático** — `update cobros` y `delete from cobros` **fallan**.
- [ ] **Automático** — una devolución entra como fila con importe negativo y el pendiente se mueve.
- [ ] **Automático** — un cobro sin factura entra y cuenta en el pendiente del paciente.
- [ ] **Automático** — como `tecnico_administrativo`: filas en `cobros` y en la vista del pendiente
      de su centro, cero de otro centro (con su gemela positiva), y cero filas en `tarifas_paciente`.
      La vista del pendiente no tiene columna `tipo_terapia_id` ni `cita_id`.
- [ ] **Automático** — como `profesional_sanitario`: cero cobros y cero pendiente de pacientes que no
      tiene asignados, y los de los suyos sí (prueba negativa con su gemela positiva).
- [ ] **Automático** — con T-026 integrado: como `tecnico_administrativo`, la consulta de facturas
      **no** devuelve `tipo_terapia_id` ni `cita_id`.
- [ ] **Manual** — como profesional, **no existe** el selector de profesional en la pantalla.
- [ ] **Manual** — como administrador, el selector filtra y la métrica se mueve con él.
- [ ] **Manual** — no existe ningún control para editar o borrar un cobro.
- [ ] **Manual** — `/facturacion` al lado de `/prototipo`: mismo vocabulario visual, sin
      controles de adorno.
- [ ] **Manual** — la misma ruta con cada rol enseña exactamente lo que le concede la matriz de
      `architecture.md` §Roles, ni un campo más.
- [ ] **Manual** — a 360 px se sigue pudiendo registrar un cobro.
- [ ] **Automático** — el verificador de accesibilidad de T-009 en verde, `npm run test:rls` en verde
      y `npm run lint && npm run build` limpios.

## Territorio

Lo cierra el diseño en el frontmatter. Lo que ya se sabe que necesita:
- una migración propia en `supabase/migrations/` para la vista del pendiente, con el sello libre al
  diseñar;
- un banco nuevo en `scripts/rls/`, y su fila en `scripts/rls/README.md`;
- `lib/supabase/tipos-bd.ts`;
- las rutas y componentes de `/facturacion`;
- `tickets/T-023/**`, `docs/bitacora/T-023*.md` y `docs/state.md`.

## Guion de comprobación manual

1. `npm run dev` y abrir `/facturacion` como administrador.
2. Registrar dos cobros parciales a un paciente con pendiente y ver cómo se mueven el pendiente y el
   estado.
3. Registrar un tercero que se pase: aparece `cobrado_de_mas`, visible.
4. Entrar como profesional: no hay selector, y solo se ven sus pacientes.
5. Entrar como técnico: se ven importes y estados, y en ninguna parte el tipo de terapia.

## Notas para el agente

- **El pendiente se deriva siempre.** Si aparece la tentación de una columna `pendiente` en
  `facturas_espejo` o en `cobros`, es el bug: las dos son de solo adición y esa columna sería un
  `UPDATE`.
- **El espejo no tiene estado del programa** ni lo cobrado allí (ADR-077). El único estado de cobro es
  el que la app deriva de `cobros`. No lo mezcles con el estado de la cabecera del borrador
  (`facturado`, `enviado`) en una sola píldora: es el choque de píldoras que ya costó una entrada en
  `interfaz.md`.
- **No toques `facturas_espejo` desde aquí. Ni para marcar nada.** Solo escribe en esa tabla el
  sincronizador de T-026, por función `security definer` (ADR-053 d, ADR-077).
- **No expidas nada, ni ofrezcas un botón que lo parezca.** Aquí no se factura (ADR-053 a).
- Reutiliza las primitivas de `components/ui/` de T-007 y `pendiente()` de `lib/dinero/reparto.ts`.
