---
id: T-023b
titulo: Facturas del espejo en Facturación — listado, cobro contra factura y asignación de cobros anteriores
modelo: opus
riesgo: alto
fase: 2
prioridad: media
depende_de: [T-023, T-026a]   # los datos reales del espejo llegan con T-026b; las pruebas usan la fijación de T-026a
estado: pendiente
delegable: no                 # dinero, RLS y una tabla de solo adición
territorio:                   # provisional; lo cierra tickets/T-023b/diseno.md §6
  - supabase/migrations/20261016120000_cobros_facturas.sql   # cola de un solo dueño: tras T-026a (20261014120000) y la reserva de T-046 (20261015120000)
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/11-cobertura.sql       # las políticas nuevas en v_declaradas
  - scripts/rls/33-cobros-facturas.sql
  - scripts/rls/README.md
  - scripts/lint-migraciones.ts        # cobros_facturas en TABLAS_SOLO_ADICION
  - scripts/lint-migraciones.test.ts
  - lib/supabase/tipos-bd.ts           # solo regenerado con `npm run tipos`
  - app/(app)/facturacion/**
  - lib/i18n/es.ts
  - accesibilidad/facturacion.spec.ts
  - tickets/T-023b/**
  - docs/bitacora/T-023b*.md
  - docs/state.md
---

# Contexto

T-023 se partió el 05-10-2026 (P4 de `tickets/T-023/diseno.md`): hizo cobros, pendiente y la
pantalla Facturación sin depender del proveedor. Este ticket hace **lo que necesitaba el espejo de
T-026**: la sección «Lo que depende de T-026» de `tickets/T-023-cobros-y-pendiente.md` (`:99-115`),
el criterio «con T-026 integrado» y la asignación de cobros anteriores a la factura (Q2 de
`tickets/T-026/diseno.md`, cerrada con la recomendada: tabla de solo adición `cobros_facturas`,
decidida aquí).

Lo que ya existe y este ticket no cambia:
- **El pendiente es lo devengado menos lo cobrado** (P1 (ii) de T-023), por paciente, en la vista
  `pendiente_paciente`. Enlazar un cobro a una factura **no mueve el pendiente**: el cobro ya
  contaba. La opción (i) del contrato de T-023 («el pendiente, si cuenta lo facturado») queda
  descartada por esa respuesta y **no entra**.
- **`cobros.factura_espejo_id`** (T-026a, diseño §1.5.7): nula, sin FK, solo se fija al insertar, y
  la valida `validar_cobro_factura_espejo` (42501 por la política de alta, 23503 si no existe el
  espejo, 23514 si es de otro paciente).
- **`facturas_espejo_cabecera`** (T-026a, diseño §1.5.3): vista definer con barrera; diez columnas,
  sin `borrador_id`, `cita_id`, líneas ni destinatario. El técnico ve las de pacientes de sus
  centros; el profesional, las de sus borradores; el administrador, todas.
- **El espejo no tiene estado de pago ni lo cobrado en el programa** (ADR-077). Lo cobrado es solo
  lo que registra la app (ADR-053 g).

ADR **053** (d, g, i), **077**, **078** (vocabulario), **033**, **041**, **043**. `docs/interfaz.md`
§Facturación y choque 13. `architecture.md` §Roles, fila Facturación: el técnico ve «Cobros, sin
dato clínico».

## Decisión que toma el diseño

**Una sola fuente de «los cobros de una factura».** Hay dos caminos para enlazar: el
`factura_espejo_id` del cobro (al registrarlo) y `cobros_facturas` (después). El diseño elige cómo
se leen sin que una pantalla sume uno y otra los dos: una vista o función única que todas usan, o
que el registro nuevo escriba siempre en `cobros_facturas` y la columna quede solo para lo que ya
haya. Lo que no vale es que dos consumidores reconstruyan la unión cada uno a su manera.

También decide si un cobro negativo (devolución, con `motivo`) se puede asignar a una factura, y
con qué límite.

# Tareas

1. **Migración `20261016120000_cobros_facturas.sql`**: la tabla de asignación `cobros_facturas`,
   de solo adición (revoke de UPDATE, DELETE y TRUNCATE, disparador de fila y `before truncate`), con
   su disparador de validación definer, sus políticas y la lectura única de la §«Decisión».
2. **Listado de facturas del espejo** en `/facturacion`, por `facturas_espejo_cabecera`: número,
   fecha, total, enlace al programa y los cobros de la app de cada una. Filtrable por rango de
   fechas y por forma de pago de sus cobros. **Sin filtro por estado de cobro**: el pendiente es por
   paciente. Número e importes **no se editan**.
3. **«Registrar cobro» en la fila**: el formulario de cobro de T-023 con la factura prefijada
   (mismo esquema Zod, misma acción o una que la reutiliza).
4. **Asignar un cobro anterior** a una factura del mismo paciente, sin modificar el cobro.
5. **Banco 33** con cada negativa y su gemela, y `cobros_facturas` en el linter.

# Criterios de aceptación (verificables)

## Base de datos

- [ ] **CA1.** `npx supabase db reset` sin errores; `max(version)` en `supabase_migrations` =
      `20261016120000`; `npm run lint:migraciones` con 0 hallazgos y `cobros_facturas` en
      `TABLAS_SOLO_ADICION`, con su caso en `lint-migraciones.test.ts`.
- [ ] **CA2 · Solo adición, por las tres puertas.** En el banco 33, como `authenticated` y como
      `service_role` donde aplique: UPDATE, DELETE y TRUNCATE sobre `cobros_facturas` fallan; y
      `cobertura_solo_adicion()` devuelve 0 filas.
- [ ] **CA3 · Mismo paciente.** Asignar un cobro a una factura de otro paciente da 23514, sin fila.
      Gemela: mismo paciente, entra.
- [ ] **CA4 · Un cobro, una factura.** Asignar un cobro que ya está enlazado, sea por
      `factura_espejo_id` o por una asignación anterior, da 23514. Dos asignaciones concurrentes del
      mismo cobro: entra una (la restricción vive en la base, no en la pantalla).
- [ ] **CA5 · Permisos antes que el cotejo.** Quien no podría registrar ese cobro (la política de
      alta de `cobros`) recibe 42501 antes de cualquier 23503 o 23514: sin oráculo de existencia de
      facturas ajenas. Gemelas por rol: administrador, profesional sobre sus borradores y técnico
      sobre pacientes de sus centros asignan; anon y `service_role`, no.
- [ ] **CA6 · Columnas del llamante.** `authenticated` solo tiene INSERT sobre las columnas que el
      diseño declare; quién asigna (`creada_por`) y cuándo salen de la sesión y del servidor, y el
      banco prueba que mandar otro `creada_por` no se guarda.
- [ ] **CA7 · Null.** Asignar con `cobro_id` o `factura_espejo_id` nulos falla por `not null`, no
      por el disparador.
- [ ] **CA8 · Lectura única.** La consulta de la §«Decisión» devuelve, para una factura con un cobro
      enlazado al registrarse y otro asignado después, los dos y una sola vez cada uno; ningún
      fichero de `app/` lee `cobros.factura_espejo_id` ni `cobros_facturas` por otra vía
      (`grep` en la evidencia).
- [ ] **CA9 · El pendiente no se mueve.** Banco: el `pendiente_paciente` de un paciente es el mismo
      antes y después de asignar sus cobros a una factura.
- [ ] **CA10 · Rendimiento (riesgo 10 de T-023).** `explain analyze` de `pendiente_paciente` y del
      listado sobre una fijación con miles de citas y cientos de facturas, en la evidencia; si
      alguno pasa de lo que el diseño fije, se dice y se mide la mejora.

## Pantalla

- [ ] **CA11 · Lo que ve el técnico.** Con la fijación de T-026a: el técnico ve el listado de los
      pacientes de sus centros, y ninguna respuesta que recibe (también RSC) contiene
      `tipo_terapia_id`, `cita_id`, `borrador_id`, líneas ni destinatario. Es el criterio «con T-026»
      de T-023, que allí quedó «fuera: T-023b».
- [ ] **CA12 · Nada se edita.** El listado no tiene control que cambie número ni importe; la fila
      enseña los cobros de la app y nada del programa (ni «pagada», ni estado).
- [ ] **CA13 · Filtros.** Prueba de los dos filtros (fechas, forma de pago de sus cobros) y de que
      no hay filtro por estado de cobro.
- [ ] **CA14 · Vocabulario (ADR-078 3).** `grep -rniE "\b(emitir|facturar|expedir|aprobar|crear
      factura|verifactu)\b"` sobre lo nuevo de `app/(app)/facturacion` y las claves nuevas de
      `lib/i18n/es.ts` → vacío. La fila dice «Emitida en {programa}».
- [ ] **CA15 · Manual.** Como técnico y como administrador: registrar un cobro desde la fila de una
      factura, asignar un cobro anterior a otra, y comprobar que el pendiente del paciente no cambia.
      A 360 px, la fila y su acción se usan sin desbordar.
- [ ] **CA16.** `npm test`, `npm run test:a11y` (con `accesibilidad/facturacion.spec.ts`
      ampliada), `npm run test:rls`, `npm run lint` y `npm run build` en verde.
      `node ~/.claude/pipeline/territorio.mjs T-023b` dentro del `territorio:`.

# Guion de comprobación manual

1. `npx supabase db reset && npm run seed`, y la fijación de espejo de T-026a (o un espejo real si
   T-026b ya está).
2. Como técnico: `/facturacion` › facturas. Filtrar por fechas y por forma de pago.
3. «Registrar cobro» en una fila: el cobro aparece bajo esa factura.
4. Asignar un cobro anterior del mismo paciente a otra factura: aparece bajo ella; el pendiente del
   paciente sigue igual.
5. Intentar asignar el mismo cobro a una tercera: mensaje claro, sin fila.

# Notas para el agente

- La migración es la `20261016120000` porque la `20261015120000` está reservada para T-046 si la
  necesita. Si T-023b se fusiona antes que T-046, se intercambian los sellos **antes** de
  implementar, nunca después. Antes de verificar, `max(version)` en la rama.
- El disparador de validación reproduce la política de alta de `cobros` para `authenticated`, como
  `validar_cobro_factura_espejo` en T-026a, para que el 42501 vaya antes que el cotejo.
- `components/ui/**` y `app/(app)/pacientes/**` quedan fuera: si falta una primitiva, se para y se
  anota.

# Lo que no entra

- El pendiente que cuenta lo facturado (opción (i) del contrato de T-023): descartado por la P1.
- Desasignar: una asignación equivocada no se borra. Si hace falta corregirla, es una decisión de
  producto (una anotación de solo adición) que pide su propio ticket.
- Facturas de bono: se hacen en el programa, fuera de la app (T-027), y no llegan al espejo.
- La pestaña Facturación de la ficha del paciente: es de T-026a y T-046.
