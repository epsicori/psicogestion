---
id: T-026a
titulo: Programa de facturación sin red — interfaz, esquema del espejo, cola, sincronizador, Vault, Ajustes y ficha (Holded «no disponible»)
modelo: opus
riesgo: alto
fase: 2
prioridad: alta
depende_de: [T-021, T-023, T-007]   # T-043 solo por el orden de migraciones (ver Notas)
estado: pendiente
delegable: volumen      # SOLO la pastilla de pintura `EstadoBorrador` (diseño §7); todo lo demás, la fábrica
territorio:                           # cerrado por tickets/T-026/diseno.md §6
  - supabase/migrations/20261014120000_proveedor_facturacion.sql   # cola de un solo dueño: después de T-021 (20261011120000), T-043 (20261012120000) y T-023 (20261013120000)
  - scripts/rls/00-ayudantes.sql
  - scripts/rls/01-fijacion.sql       # borradores nuevos BORRA/BORRB, no BORR1 (diseño §3, «Fijación en 01»)
  - scripts/rls/11-cobertura.sql      # las tres políticas nuevas en v_declaradas
  - scripts/rls/31-proveedor-facturacion.sql
  - scripts/rls/26-economico.sql      # solo la aserción 26.F9 (columna envio_ambiguo de M1); ampliado por el propietario el 14-10-2026
  - scripts/rls/README.md
  - scripts/lint-migraciones.ts       # tres tablas nuevas en TABLAS_SOLO_ADICION
  - scripts/lint-migraciones.test.ts
  - lib/supabase/tipos-bd.ts          # solo regenerado con `npm run tipos`, nunca a mano
  - lib/facturacion/**
  - lib/i18n/es.ts
  - app/api/facturacion/drenar/route.ts
  - app/api/facturacion/drenar/route.test.ts               # ampliado por el propietario el 08-10-2026
  - app/(app)/ajustes/page.tsx        # solo el enlace en AccesosDeAdministracion
  - app/(app)/ajustes/facturacion/**
  - app/(app)/pacientes/[id]/page.tsx # solo sustituir <Facturacion /> por <PanelFacturacion /> con su Suspense
  - app/(app)/pacientes/[id]/panel-facturacion.tsx
  - app/(app)/pacientes/[id]/panel-facturacion.test.tsx
  - app/(app)/pacientes/[id]/acciones-facturacion.ts
  - app/(app)/pacientes/[id]/acciones-facturacion.test.ts   # ampliado por el propietario el 08-10-2026
  - app/(app)/pacientes/[id]/boton-preparar.tsx            # isla de cliente para los errores de «Preparar» (propietario, 08-10-2026)
  - app/(app)/pacientes/[id]/boton-preparar.test.tsx
  - proxy.ts                          # solo /api/facturacion/drenar en RUTAS_PUBLICAS
  - .env.example                      # solo FACTURACION_DRENAR_SECRETO=
  - accesibilidad/facturacion-clave.spec.ts
  - vitest.config.ts
  - vitest.bd.config.ts
  - package.json                      # solo el script test:facturacion; ninguna dependencia nueva
  - tickets/T-026a/**
  - docs/bitacora/T-026a*.md
  - docs/state.md
---

# Contexto

Mitad construible hoy de T-026 (`tickets/T-026-proveedor-facturacion-holded.md`). El propietario
decidió partirlo el 05-10-2026 (Q0 de `tickets/T-026/diseno.md`): el ADR-053 (k) bloquea **el
adaptador**, no el esquema. Este ticket no hace **ni una llamada de red a Holded**.

Construye la frontera entera contra la interfaz `ProveedorFacturacion`, con un adaptador simulado
para las pruebas. `holded.ts` existe solo como esqueleto: la constante `APPROVE_DOC = false`, tres
métodos que lanzan `ErrorProveedor('no_disponible')` y `disponible: false` en su ficha. Por eso la
app queda en **modo degradado en todas partes**, y ese es el comportamiento que se entrega.

El cuerpo real de `holded.ts` es T-026b. El editor del borrador (crear, corregir, descartar) es
T-046. El listado de facturas y el cobro contra factura son T-023b.

**Diseño: `tickets/T-026/diseno.md`, entero salvo lo que marca «T-026b».** Manda sobre este
contrato en todo lo que fija: nombres, firmas, columnas, códigos de error, bloques del banco.
Respuestas del propietario (05-10-2026): Q0 partir; Q1 editor aparte (T-046); Q4 concepto según el
IVA («Sesión de psicología» exento, «Servicios profesionales de psicología» general); Q6 Ajustes ›
Programa de facturación solo para el administrador. Cerradas por el orquestador con la recomendada:
Q2 (asignación de solo adición, en T-023b), Q3 (pg_cron + pg_net), Q5 (sin referencia nuestra en lo
que sale).

ADR **053** (b, c, d, e, f, h, i, j), **077** (espejo mínimo; manda sobre el 053 c y d), **078**
(vocabulario y ningún control que expida), **024** (outbox), **043** (nada de un paciente se
cachea). `architecture.md` §Roles, fila Facturación.

# Tareas

1. **Migración `20261014120000_proveedor_facturacion.sql`** (diseño §1.5): los dos enums, las tres
   tablas de solo adición (`borradores_factura_envios`, `facturas_espejo`, `facturas_anotaciones`)
   con sus tres capas, auditoría y fila en `tablas_solo_adicion`; las políticas de lectura que
   cuelgan de la cabecera; la vista `facturas_espejo_cabecera` para el técnico; las funciones
   definer de `service_role` (§1.5.4) y `encolar_envio_borrador` (§1.5.5); la congelación de
   versiones (§1.5.6); `cobros.factura_espejo_id` con su disparador (§1.5.7); la redefinición de
   `borradores_factura_estado` (§1.5.8); `facturacion_ajuste`, las funciones del Vault y el cron
   (§1.5.9); y los `comment on` (§1.5.10).
2. **Banco `scripts/rls/31-proveedor-facturacion.sql`**, bloques A a N del diseño §3, con su
   fijación en `01`, sus ayudantes en `00`, las políticas en `11` y su fila en el README.
3. **Linter**: las tres tablas en `TABLAS_SOLO_ADICION`, con sus casos de prueba.
4. **`npx supabase db reset` + `npm run tipos`.**
5. **`lib/facturacion/`** (diseño §1.2-§1.4 y §1.6): `proveedor.ts`, `proyeccion.ts`,
   `conceptos.ts`, `registro.ts`, `holded.ts` (esqueleto), `simulado.ts`, `clave.ts`, `cola.ts`,
   `sincronizador.ts` y sus pruebas, más `cola.bd.test.ts` contra la base local
   (`npm run test:facturacion`).
6. **Ruta `app/api/facturacion/drenar/route.ts`** y su entrada en `proxy.ts` (diseño §1.6). Antes
   de escribirla, la guía de route handlers de `node_modules/next/dist/docs/`.
7. **Ajustes › Programa de facturación** (diseño §1.7), solo para el administrador. Con ninguna
   ficha disponible, como en este ticket, la página dice «Todavía no hay ningún programa de
   facturación disponible para conectar» y no pinta formulario. El formulario, las acciones y el
   diálogo de desconectar se construyen igual, y se prueban con el registro simulado como
   disponible.
8. **Ficha › Facturación** (`PanelFacturacion`, diseño §1.7): estados del borrador, anotaciones,
   lista del técnico y la acción «Preparar borrador en {programa}», que solo encola. Sin proveedor
   activo, ningún botón.

# Criterios de aceptación (verificables)

Los números entre paréntesis remiten a la tabla del diseño §3 o a sus bloques del banco.

## Base de datos

- [ ] **CA1 · Migración.** `npx supabase db reset` aplica sin errores; `max(version)` es
      `20261014120000`; `npm run lint:migraciones` sale con 0 hallazgos.
- [ ] **CA2 · Solo adición.** Banco 31-B: `insert` sobre las tres tablas como ADM, PRO1 y TEC1 →
      42501; por las funciones definer, como `service_role`, entra. `update`, `delete` y
      `truncate` → 42501 como `authenticated`, `service_role` **y `postgres`**.
      `10-solo-adicion` recoge las tres tablas con su fila de `01`, y
      `select public.cobertura_solo_adicion()` = 0. (5, 6)
- [ ] **CA3 · Espejo idempotente y nunca actualizado.** Banco 31-C: `registrar_factura_espejo` dos
      veces con los mismos datos → mismo `id`; con otro total → 23505, y la relectura de la fila da
      el total original. Sin envío → 23503; tras `borrado_sin_aprobar` → 23514. (7)
- [ ] **CA4 · Forma del espejo.** Banco 31-A: las columnas de `facturas_espejo`, en orden, son
      exactamente las del diseño §1.5.2, y ninguna casa con
      `estado|pago|cobr|pdf|qr|registro|huella`. (8)
- [ ] **CA5 · Vocabulario de anotaciones.** Banco 31-E: `registrar_anotacion_documento(…, 'pagado')`
      → 22P02; `enum_range` son los tres valores; la coherencia con el espejo da 23514. (9)
- [ ] **CA6 · Técnico.** Banco 31-F/G: TEC1 cuenta 1 en `facturas_espejo_cabecera` sobre el
      espejo del centro A y 0 sobre el del B; la gemela ADM cuenta 2; TEC1 sobre la tabla
      `facturas_espejo` cuenta 0. Las columnas de la vista no incluyen `cita_id`, `lineas` ni
      `borrador_id`. (10)
- [ ] **CA7 · Cobro con espejo de otro paciente.** Banco 31-H: ADM y TEC1 → 23514; espejo
      inexistente → 23503; PRO2 sin permiso sobre el paciente → 42501 **antes** que el cotejo; la
      gemela con el espejo correcto entra. (11)
- [ ] **CA8 · Encolar sin oráculo.** Banco 31-I: PRO2 sobre un borrador de PRO1 y sobre un uuid
      inexistente reciben **el mismo** texto 42501; sin proveedor → 23514; última versión
      descartada → 23514; dos veces → el mismo `evento_id`; desde `fallido` vuelve a `pendiente`.
- [ ] **CA9 · Congelación.** Banco 31-J: una versión nueva de un borrador con envío o con evento
      `pendiente` → 23514; con el evento `fallido`, entra; PRO2 recibe 42501 del sellado de T-021,
      no 23514 de la congelación.
- [ ] **CA10 · Estado del borrador.** Banco 31-K: `borradores_factura_estado` conserva las
      columnas de T-021 (nombre, orden y tipo) y recorre `sin_enviar` → `en_cola` → `enviado` →
      `facturado`, y `fallido` y `descartado`.
- [ ] **CA11 · Vault y ajuste.** Banco 31-L: TEC1 y PRO1 → 42501 en guardar, quitar y estado; ADM
      guarda; `estado_clave_proveedor_facturacion()` devuelve `'••••'` y cuatro caracteres, nada más;
      `facturacion_ajuste` no se lee como `authenticated`; `quitar` borra la fila de
      `vault.secrets`. Banco 31-M: una fila de `auditoria` por alta en las tres tablas y en el
      ajuste, y la clave centinela no aparece en `auditoria`.
- [ ] **CA12 · Reclamo y retroceso.** Banco 31-N: un segundo reclamo inmediato devuelve 0 (la
      concesión); las líneas que devuelve `reclamar_envios_facturacion` no tienen las claves
      `concepto` ni `cita_id`; el retroceso crece y el intento 8 pasa a `fallido` con una
      notificación por administrador, deduplicada.

## Servidor

- [ ] **CA13 · Nada aprueba.** `grep -rn "approveDoc\|APPROVE_DOC" lib/` → solo la constante
      `false` de `holded.ts` y su `void`. `grep -rniE "approve" app components lib proxy.ts
      --exclude=*.test.ts` → solo esa constante. (1)
- [ ] **CA14 · Idempotencia por borrador.** `cola.bd.test.ts`: `encolar_envio_borrador` ×2 → el
      mismo evento; `drenarEnvios` ×2 **en paralelo** → `control.documentos().length === 1` y una
      sola fila en `borradores_factura_envios`. Con `perderRespuesta`: 1 documento, 0 envíos, evento
      `fallido` con `ambiguo` y la notificación creada. (2)
- [ ] **CA15 · Proyección mínima.** `proyeccion.test.ts`: una entrada con `tipo_terapia`,
      `cita_id`, `diagnostico` y `concepto: 'TCC ansiedad'` en las líneas y en la raíz → ni esas
      claves ni esos valores en `JSON.stringify(salida)`; las claves de la salida son exactamente
      `destinatario, fecha, lineas`, y las de cada línea, las de `LineaProyectada`. El concepto es
      el de Q4 según el régimen. (3)
- [ ] **CA16 · Proveedor caído.** `cola.bd.test.ts` con `control.caido(true)`: el evento sigue
      `pendiente`, `intentos = 1`, `proximo_intento > now()`, 0 envíos y
      `borradores_factura_estado.estado = 'en_cola'`. (12)
- [ ] **CA17 · Sincronizador.** `sincronizador.test.ts` con el simulado: aprobado → un espejo;
      borrado → anotación `borrado_sin_aprobar`; rectificado o anulado sin espejo → espejo y luego
      anotación; datos distintos de un espejo ya copiado → `notificar_discrepancia_facturacion` y
      ningún reintento con otros datos; un documento sin envío se ignora. `sincronizar` no llama
      nunca a `crearBorrador`.
- [ ] **CA18 · La clave no sale.** `accesibilidad/facturacion-clave.spec.ts`: como administrador,
      guarda una clave centinela (`SENTINELA_T026_` + 20 caracteres) **por la RPC**
      `guardar_clave_proveedor_facturacion` con su sesión (en este ticket no hay formulario
      visible); abre `/ajustes/facturacion` y la ficha de un paciente, recoge todas las respuestas
      (también RSC) → ninguna contiene el centinela. Después recorre `.next/` → ninguna
      coincidencia. Unitario: `guardarClaveProveedor` devuelve un objeto sin la clave. El recorrido
      a través del formulario queda para T-026b. (4)
- [ ] **CA19 · Ruta de drenado.** Prueba de la ruta: sin `FACTURACION_DRENAR_SECRETO` → 503; con
      una cabecera que no coincide, o de otra longitud → 401; nunca 200 sin el secreto. `proxy.ts`
      añade **solo** `/api/facturacion/drenar` (diff).
- [ ] **CA20 · Holded encerrado.** `grep -rniI holded app components lib proxy.ts scripts/*.ts
      --exclude-dir=facturacion` → vacío, salvo la etiqueta del enum en `lib/supabase/tipos-bd.ts`,
      que se lista y se justifica en la evidencia. Ningún fichero fuera de `*.test.ts` importa
      `simulado.ts` (prueba que recorre `app/` y `lib/`). (13)

## Pantalla

- [ ] **CA21 · Ajustes solo para el administrador.** Prueba de la página: PRO y TEC →
      `redirect('/ajustes')`; el enlace «Programa de facturación» solo está en
      `AccesosDeAdministracion`. Con el registro real (ninguna ficha disponible): el texto de «no
      hay programa disponible» y **ningún** `input`, botón de probar ni de desconectar. Con el
      registro simulado como disponible: el formulario (`type="password"`, sin `defaultValue`,
      `reset()` tras guardar), «Probar conexión» y «Desconectar» con su diálogo.
- [ ] **CA22 · Ficha.** `panel-facturacion.test.tsx`: cada `estado` del diseño §1.7 con su texto y
      su acción; las tres anotaciones como pastilla; sin proveedor activo, **ningún** botón; el
      técnico ve solo «Emitidas en {programa}» desde la vista, sin borradores. «Preparar borrador»
      llama a `encolar_envio_borrador` y nunca al proveedor.
- [ ] **CA23 · Vocabulario (ADR-078) y caché (ADR-043).**
      `grep -rniE "\b(emitir|facturar|expedir|aprobar|crear factura|verifactu)\b" app components lib/i18n`
      → solo «Abrir en {programa} para emitir», «Emitida en {programa}» y textos previos ajenos al
      ticket, listados en la evidencia. Ni `use cache` ni `unstable_cache` en `lib/facturacion`,
      `app/(app)/ajustes/facturacion` ni el panel.
- [ ] **CA24 · Manual, modo degradado.** Sin ajuste de proveedor: la app arranca, la ficha no
      tiene botones de facturación y los cobros de T-023 se registran. Captura en la evidencia. (14)

## Cierre

- [ ] **CA25.** `npm test`, `npm run test:facturacion`, `npm run test:rls`,
      `npm run lint:migraciones`, `npm run lint` y `npm run build` en verde, con su salida en la
      evidencia. `node ~/.claude/pipeline/territorio.mjs T-026a` dentro del `territorio:`.
- [ ] **Fuera: T-026b.** Los criterios manuales con Holded real (15), la clave enmascarada a
      través del formulario (16) y el texto definitivo de «sin plan de pago» se marcan «fuera:
      T-026b» en la evidencia, no «PASA».

# Guion de comprobación manual

1. `npx supabase db reset && npm run seed`; anotar `max(version)` (`20261014120000`).
2. Como administrador, Ajustes: aparece «Programa de facturación». Dentro, el texto de que no hay
   programa disponible y ningún formulario.
3. Ficha de un paciente, pestaña Facturación: ningún botón de preparar ni de abrir.
4. Registrar un cobro en `/facturacion` (T-023): entra.
5. Como profesional y como técnico, Ajustes no enseña «Programa de facturación», y
   `/ajustes/facturacion` redirige a `/ajustes`.

# Notas para el agente

- **Lee `tickets/T-026/diseno.md` entero antes de empezar.** Lo marcado «T-026b» no se hace aquí.
- **T-021 ronda 3 cambia la lectura de la cabecera** (A-H2: el profesional lee borradores solo
  mientras tiene asignado al paciente). El diseño de T-026 se escribió con la política de la ronda 2.
  Dos sitios repiten esa regla: la rama del profesional de `facturas_espejo_cabecera` y la réplica
  de permisos de `encolar_envio_borrador`. Se copia **la política fusionada en `main`**, carácter a
  carácter, y la diferencia con el diseño va a la bitácora. Lo mismo para cualquier hecho del §0 del
  diseño que la ronda 3 haya movido: manda lo fusionado.
- **Orden de migraciones**: no se implementa hasta que T-021, T-043 y T-023 estén en `main`. Antes
  de lanzar el verificador, `max(version)` en la rama (un `db reset` desde `main` pierde la
  migración de la rama).
- **Si te hace falta aprobar un documento, actualizar una fila copiada, o copiar el estado o los
  pagos del programa, para.** Es el ADR-053 (b) y el ADR-077, no un detalle.
- La clave del cliente no se registra, no va a un `console.*`, no aparece en un `raise`, `format`
  ni `notice` de la migración (`grep p_clave`: solo la validación y las dos llamadas al Vault).
- Reutiliza el outbox `eventos_salientes` (ADR-024) y las primitivas de `components/ui/` (T-007). No
  escribas otro mecanismo de reintento.
- La pastilla `EstadoBorrador` (recibe `estado` y el texto ya traducido, sin acciones) es la única
  pieza delegable a un CLI de volumen.
- Los hallazgos van a §«Para `docs/state.md`» del informe. Uno ya conocido: añadir a
  `docs/legal/preguntas-holded.md` cómo deduplica Holded una creación repetida (Q5); ese fichero
  está fuera del territorio.

# Lo que no entra

- El cuerpo de `holded.ts`, los textos definitivos que dependen de Holded y los manuales con Holded
  real → **T-026b**.
- Crear, corregir y descartar un borrador desde la interfaz → **T-046**. Las pruebas usan los
  borradores de la fijación.
- El listado de facturas, el cobro contra una factura y la asignación de cobros anteriores →
  **T-023b**.
- `bonos.factura_espejo_id`, atribuir una rectificativa a su original, el plan B de fichero y
  disparar el drenado con `after()`: diseño §«Lo que no entra».
