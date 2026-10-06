---
id: T-046
titulo: Editor del borrador de factura — crearlo desde las sesiones del paciente, corregirlo y descartarlo, siempre como versión nueva encadenada
modelo: opus
riesgo: alto
fase: 2
prioridad: alta
depende_de: [T-021, T-026a, T-031, T-032]   # T-031: lib/dinero; T-032: cifrado y leer_identificacion
estado: pendiente
delegable: no           # formulario, dinero, cifrado del NIF y cadena de huellas: la fábrica
territorio:             # provisional; lo cierra tickets/T-046/diseno.md §6
  - lib/economico/**                                # nuevo: el sobre TS del borrador (T-021 D12); dueño: la fábrica
  - app/(app)/pacientes/[id]/panel-facturacion.tsx  # de T-026a: la entrada al editor
  - app/(app)/pacientes/[id]/panel-facturacion.test.tsx
  - app/(app)/pacientes/[id]/borrador/**            # editor, esquemas, acciones y sus pruebas (nombre exacto: diseño)
  - lib/i18n/es.ts
  - accesibilidad/borrador.spec.ts
  - supabase/migrations/20261015120000_*.sql        # SOLO si el diseño la necesita; reserva en la cola de un solo dueño
  - scripts/rls/32-*.sql                            # ídem, con su fila en el README
  - scripts/rls/README.md                           # ídem
  - lib/supabase/tipos-bd.ts                        # ídem, solo regenerado
  - tickets/T-046/**
  - docs/bitacora/T-046*.md
  - docs/state.md
---

# Contexto

Hoy **nadie crea un borrador de factura desde la interfaz**: ni T-021, que hizo el esquema, ni T-023,
ni T-026a, que lo envía. Las pruebas usan borradores de la fijación. El propietario decidió el
05-10-2026 (Q1 de `tickets/T-026/diseno.md`) que el editor va en **un ticket propio, antes de
activar el envío** (T-026b depende de este).

El borrador no es una factura. Es el registro que la app conserva, encadenado y de solo adición,
porque el art. 29.2.j LGT nos alcanza aunque no seamos SIF (ADR-053 h): «los borradores que
mandamos al proveedor —y los que nunca lleguen a factura— se conservan encadenados y de solo
adición». Por eso **editar es siempre una versión nueva**, y descartar también (T-021, P2:
«descartado» es una versión sellada con la marca, el borrador no se borra).

Lo que ya existe y no se toca (T-021, en `main` tras su ronda 3):
- `borradores_factura` (cabecera) y `borradores_factura_versiones` (solo adición), con el disparador
  `sellar_version_borrador`: permisos primero, número de versión, huella, sobre de quince claves
  cotejado con la fila, líneas con `concepto`, `cantidad`, `precio_unitario_centimos`,
  `regimen_iva`, `tipo_iva_centesimas` y `cita_id`, y las comprobaciones de importes y régimen.
- El NIF del destinatario en cuatro columnas cifradas, todas o ninguna, con la clave
  `identificacion_cifrado_v1` (T-021, P4).
- Quién escribe: el administrador, o el profesional de la cabecera que tiene asignado al paciente.
  El técnico, nada (`architecture.md` §Roles, fila Facturación: «Cobros, sin dato clínico»).

Lo que pone T-026a y este ticket usa: la congelación (`sellar_version_borrador_tras_envio`: con
envío o en cola, una versión nueva da 23514; con el envío `fallido`, entra), el estado del borrador
en la ficha y el panel `PanelFacturacion`, donde vive la entrada al editor.

T-021 D12 dejó dicho que **el constructor TypeScript del sobre**, con sus vectores congelados frente
al disparador, lo escribe el primer ticket que guarde un borrador desde la aplicación. Es este.

ADR **053** (h, i, j), **078** (vocabulario: el borrador no se «emite» ni se «factura» aquí),
**029** y **060** (el DNI del paciente se lee por `leer_identificacion()`, que deja rastro), **043**
(nada de un paciente se cachea). `architecture.md` §Fiscalidad (tarifa base del tipo, salvo
`tarifas_paciente` vigente) y §Roles.

## Decisiones pendientes al diseñar

El arquitecto las plantea al propietario en `tickets/T-046/diseno.md` antes del resto. Opciones y
recomendación, allí; aquí solo la pregunta:

- **D1 · Sesiones por borrador.** ¿Una cita por borrador, o varias sesiones del mismo paciente en
  uno (por ejemplo, el mes)? El modelo de líneas admite las dos.
- **D2 · Destinatario.** ¿Siempre el paciente, o también un tercero (tutor legal, aseguradora,
  empresa) con su propio nombre y NIF?
- **D3 · Desde dónde.** ¿Solo desde la ficha › Facturación, o también desde la cita en la agenda?
- **D4 · Citas con bono.** Una cita consumida de un bono se paga con el bono, y el bono, si se
  factura, se factura en el programa y fuera de la app (T-027, ADR-053). ¿Se excluye del editor?
- **D5 · Régimen de IVA.** Lo marca el usuario y no se infiere (ADR-053 j). ¿Se presenta
  preseleccionado con el régimen de la tarifa que el usuario ya marcó, o en blanco en cada línea?
- **D6 · Líneas sin cita.** ¿Se admite una línea libre (un informe pericial, que va al 21 %) sin
  `cita_id`?

Y una que decide el diseño sin el propietario: si una misma cita puede estar en dos borradores no
descartados, y dónde se impide (en la pantalla, o en la base con una migración propia).

# Tareas

1. **`lib/economico/sobre-borrador.ts`**: el constructor del sobre de quince claves, con
   `canonizar()` y `normalizarNfc()` de `lib/huella` y `esquema_version` 1, y sus vectores
   congelados. No se toca `lib/huella/**`.
2. **Crear un borrador**: cabecera y primera versión desde las sesiones del paciente (según D1, D3,
   D4 y D6), con el precio propuesto por la misma regla que el pendiente de T-023 (tarifa del
   paciente vigente el día local de la cita, si no la base del tipo) y el régimen según D5. Una
   sesión sin precio resoluble deja el campo vacío y obligatorio, nunca un 0 silencioso.
3. **Destinatario** (según D2). Si es el paciente, nombre y documento se leen por
   `leer_identificacion()` en servidor. El NIF se valida con `lib/identidad` (T-017) y se cifra en
   servidor con `lib/cifrado`. **Nunca viaja en claro a una tabla, a la auditoría ni a un log.**
4. **Importes** con `lib/dinero` (T-031): céntimos enteros, cuota 0 si todo es exento, 21 % sobre
   las líneas generales con su redondeo, y la suma de líneas igual al total, como exige el sellado.
5. **Corregir**: una versión nueva completa a partir de la última. La acción lleva la versión de
   partida y **rechaza si ya no es la última** (dos personas corrigiendo a la vez no se pisan en
   silencio). Si el borrador está en cola o enviado, el 23514 de T-026a se traduce a «Ya se preparó
   en {programa}: no admite cambios», sin crear versión. Con el envío `fallido`, se puede corregir.
6. **Descartar**: una versión nueva con `descartado = true`, tras un diálogo de confirmación. No hay
   borrar.
7. **Pantalla**: el editor y su entrada en `PanelFacturacion`, solo para el administrador y el
   profesional asignado. El técnico no ve la entrada (no deshabilitada: ausente). Textos en
   `lib/i18n/es.ts` con el vocabulario del ADR-078 3.
8. **Server Actions** validadas con el mismo esquema Zod que el formulario; `creada_por` sale de la
   sesión y `creada_en` del servidor (el sellado lo acota a ±1 minuto).

# Criterios de aceptación (verificables)

## Cadena y base

- [ ] **CA1 · Sobre congelado.** Los vectores de `lib/economico/sobre-borrador.test.ts` dan, byte a
      byte, el mismo `contenido_canonico` que `pg_temp.sobre_borrador()` de
      `scripts/rls/00-ayudantes.sql` para las mismas entradas (incluidas NFC, NIF nulo y una línea
      con `cita_id` nulo). Contra la base local: una versión creada por la acción entra por el
      sellado, y `verificar_cadena_borrador(<id>)` devuelve 0 filas tras crear, corregir dos veces y
      descartar.
- [ ] **CA2 · Solo se añade.** Corregir crea la versión N+1 y la N no cambia (relectura de
      `huella` y `contenido_canonico`). `grep -rnE "\.(update|delete|upsert)\(" lib/economico
      app/(app)/pacientes/[id]/borrador` → vacío.
- [ ] **CA3 · Concurrencia.** Dos correcciones de la misma versión de partida, en paralelo: una crea
      versión y la otra recibe el conflicto, sin versión nueva.
- [ ] **CA4 · Congelado tras preparar.** Con el borrador en cola o enviado (fijación de T-026a),
      corregir y descartar devuelven el mensaje de «ya se preparó» y no hay versión nueva; con el
      envío `fallido`, entra.
- [ ] **CA5 · NIF.** Con un NIF centinela: las cuatro columnas cifradas se llenan, `descifrar`
      devuelve el centinela, y el centinela en claro no aparece en `borradores_factura_versiones`,
      en `auditoria` ni en ninguna respuesta al navegador después de guardar (prueba que recoge las
      respuestas, también RSC). Leer el documento del paciente deja su fila de `leer_identificacion`
      en `auditoria`.
- [ ] **CA6 · Permisos.** La acción como técnico, como profesional no asignado y sobre un paciente
      inexistente devuelve **el mismo** error genérico (sin oráculo de existencia), y no crea
      cabecera ni versión. Gemelas: el administrador y el profesional asignado crean.
- [ ] **CA7 · Sin cabeceras huérfanas.** Un fallo al insertar la primera versión no deja una
      cabecera sin versiones (el diseño fija cómo: transacción en una función, o el orden y la
      compensación que permita una tabla de solo adición).
- [ ] **Si hay migración**: `npx supabase db reset` sin errores, `max(version)` = `20261015120000`,
      `npm run lint:migraciones` con 0 hallazgos, y su banco `32-*` en `npm run test:rls`, con cada
      negativa y su gemela.

## Dinero

- [ ] **CA8 · Precio propuesto.** `esquemas.test.ts` o equivalente: la tarifa del paciente vigente
      el día local (una cita a las 00:30 de Madrid toma la tarifa de ese día, no la del anterior en
      UTC); sin tarifa del paciente, la base del tipo; sin ninguna, el campo vacío y el guardado
      rechazado hasta que se rellene.
- [ ] **CA9 · Importes.** Exento → cuota 0; general → 21 % con el redondeo de `lib/dinero`; mezcla
      de líneas → la cuota solo sobre las generales; la suma de líneas es el total. Un importe en
      coma flotante no llega a la base (`grep "Number(" ` sobre importes en los ficheros nuevos →
      vacío, salvo los listados en la evidencia).
- [ ] **CA10 · Régimen marcado.** Ninguna línea se guarda sin régimen elegido por el usuario
      (según D5), y la pantalla explica la diferencia entre exento y 21 % (ADR-053 j).

## Pantalla

- [ ] **CA11 · Quién ve el editor.** Prueba del panel: el técnico no tiene la entrada en el DOM; el
      profesional no asignado no llega a la ficha; el administrador y el asignado sí.
- [ ] **CA12 · Vocabulario (ADR-078 3).** `grep -rniE "\b(emitir|facturar|expedir|aprobar|crear
      factura|verifactu)\b"` sobre los ficheros nuevos y las claves nuevas de `lib/i18n/es.ts` →
      vacío.
- [ ] **CA13 · Sin caché.** Ni `use cache` ni `unstable_cache` en `lib/economico` ni en el editor.
- [ ] **CA14 · Manual.** Como profesional asignado: crear un borrador de una sesión realizada, ver
      el precio propuesto, corregir el importe (aparece «versión 2»), descartarlo (aparece
      «Descartado» y ningún botón de borrar). Como técnico: la ficha no ofrece nada de esto. Al lado
      de `/prototipo`: mismo vocabulario visual, sin controles de adorno. A 360 px se puede crear un
      borrador.
- [ ] **CA15.** `npm test`, `npm run test:a11y` (con `accesibilidad/borrador.spec.ts`: diálogo con
      foco y devolución de foco), `npm run test:rls`, `npm run lint` y `npm run build` en verde.
      `node ~/.claude/pipeline/territorio.mjs T-046` dentro del `territorio:`.

# Guion de comprobación manual

1. `npx supabase db reset && npm run seed`; como profesional, marcar una cita pasada como
   realizada.
2. Ficha del paciente › Facturación: crear el borrador de esa sesión. Precio y régimen propuestos;
   destinatario, el paciente.
3. Corregir el importe y guardar: el panel enseña la versión 2, sin enviar.
4. Descartarlo con su diálogo: «Descartado».
5. Entrar como técnico del centro: en la ficha no hay ni entrada ni borradores.

# Notas para el agente

- **El borrador no lleva nada que pueda salir mal fuera**: lo que sale al programa lo decide la
  proyección de T-026a (concepto genérico, sin `cita_id`). Pero el `concepto` de la línea **se
  queda en la instancia** y lo lee quien lee el borrador: la ayuda del campo dice que no es sitio
  para nada clínico.
- Antes de escribir un formulario o un diálogo, `docs/interfaz.md` y las primitivas de
  `components/ui/` (T-007). Si falta una primitiva, se para y se anota: `components/ui/**` está
  fuera.
- El sobre del disparador manda: si el constructor TS y `sellar_version_borrador` no coinciden, se
  arregla el TS, nunca el disparador desde aquí.
- Si el diseño necesita migración, va en `20261015120000` y su banco es el **32**. Antes de
  verificar, `max(version)` en la rama.
- `lib/economico/**` no figura en la tabla de dueños de `.claude/rules/pipeline.md`; este contrato
  lo asigna a la fábrica. Añadir la fila es cosa del propietario.

# Lo que no entra

- Enviar el borrador al programa: «Preparar borrador en {programa}» ya existe (T-026a) y solo se
  activa con T-026b.
- Facturar un bono: se hace en el programa, fuera de la app (T-027, ADR-053).
- Rectificativas y anulaciones: se hacen en el programa (ADR-078 2).
- Plantillas de facturación de Ajustes (`docs/interfaz.md` §Ajustes): sin contrato.
