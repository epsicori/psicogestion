---
id: T-046
titulo: Editor del borrador de factura — crearlo desde las sesiones del paciente, corregirlo y descartarlo, siempre como versión nueva encadenada
modelo: opus
riesgo: alto
fase: 2
prioridad: alta
depende_de: [T-021, T-026a, T-031, T-032]   # T-031: lib/dinero; T-032: cifrado y leer_identificacion
estado: hecho
completado: 2026-10-16
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

Lo que pone T-021 y este ticket no toca. **T-021 sigue en ronda 4, sin integrar en `main`**: lo de
abajo es su diseño, y T-046 no se diseña hasta que entre:
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

## Decisiones del propietario (06-10-2026)

Sustituyen a la lista de «Decisiones pendientes al diseñar». Lo que cada una cambia está aplicado en
Tareas, Criterios y Guion.

- **D1 · Varias sesiones por borrador.** Un borrador admite varias sesiones del mismo paciente y el
  usuario elige cuáles (por ejemplo, las del mes): una línea por sesión, cada una con su `cita_id`.
  El sellado ya exige que cada `cita_id` exista y sea del paciente del borrador. El modelo no cambia.
  - **Elegibles (P-D1a, 06-10-2026):** solo las citas `realizada`. Una inasistencia que se cobre
    entra como línea libre (D6).
  - **Del profesional del borrador (P-D1b, 06-10-2026):** solo las sesiones con
    `citas.profesional_id = borradores_factura.profesional_id`. El sellado no lo comprueba (solo
    mira que la cita sea del paciente), así que lo exige la acción.
  - **Nota para el diseño:** decidir si conviene endurecerlo también en la base, en la reserva
    `20261015120000` con su banco `32`.
- **D2 · Destinatario: el paciente por defecto, o un tercero.** Por defecto, el paciente. Se puede
  poner un tercero (tutor legal, aseguradora, empresa) con nombre y NIF propios.
  - **Cabe en el modelo de T-021 sin columna ni migración.** `destinatario_nombre` es texto libre y
    el NIF son las cuatro columnas nulables, todas o ninguna, con `identificacion_cifrado_v1`
    (T-021 P4), sea del paciente o de un tercero. Ninguna columna dice si el destinatario es el
    paciente, y ninguna tarea la necesita mientras se cumpla la regla de lectura de abajo.
  - **Cifrado (ADR-029).** El NIF del tercero se teclea y se valida con `lib/identidad/esquemas.ts`:
    `esquemaNif` para persona física y `esquemaCif` para persona jurídica (los dos existen ya).
    Después se normaliza y se cifra en servidor con nonce aleatorio. No lleva índice ciego, porque
    no se busca por él. Un particular sin NIF deja las cuatro columnas nulas.
  - **Lectura con rastro (ADR-060).** Con el paciente como destinatario, la versión guarda **una
    copia cifrada de su DNI** fuera de `pacientes_identificacion`. El administrador y el profesional
    asignado pueden leer ese criptograma. Si el editor lo descifrara, el DNI se leería sin pasar por
    `leer_identificacion()` y sin rastro, que es lo que el ADR-060 cierra. Regla: **el editor nunca
    descifra el NIF de una versión guardada**. Al corregir, puede hacer una de dos cosas:
    - arrastrar las cuatro columnas tal cual;
    - sustituirlas por un cifrado nuevo, hecho con el documento del paciente leído por
      `leer_identificacion()` (que deja su fila) o con el NIF del tercero recién tecleado.

    Esa copia solo la descifra el envío de T-026a, como ya está diseñado.
  - **Nota para el diseño.** Si el diseño concluye que hay que enseñar en claro el NIF guardado de
    una versión (por ejemplo, el del tercero al corregir), esa lectura necesita su propio rastro.
    Eso es una función nueva, que va en la reserva `20261015120000` con su banco `32`. El esquema
    no se fija aquí.
- **D3 · Solo desde la ficha › Facturación.** La entrada vive en `PanelFacturacion`. La agenda y la
  cita no ofrecen crear un borrador.
- **D4 · Las citas de un bono, fuera.** Una cita con `bono_id` no nulo no aparece entre las
  elegibles, y la acción la rechaza aunque llegue en la petición. El sellado no lo comprueba, así
  que la exclusión es de la acción.
- **D5 · Régimen precargado desde la tarifa, visible y editable.** Cada línea de sesión llega con el
  régimen de la tarifa del paciente para ese tipo de sesión (`tarifas_paciente.regimen_iva`). El
  usuario lo ve y lo puede cambiar.
  - **Encaja con el ADR-053 j**: esa columna no tiene valor por defecto y el usuario la marca al dar
    de alta la tarifa. Se precarga lo que el usuario ya marcó, sin deducirlo del tipo de servicio.
  - **Sin `tarifas_paciente` vigente (P-D5, 06-10-2026):** el régimen va en blanco y es
    obligatorio, aunque el precio salga de `tipos_terapia.tarifa_base`. `tipos_terapia.regimen` no
    se usa para precargar: tiene `default 'exento_sanitario'` y ninguna pantalla lo pide, así que no
    se distingue lo que marcó el usuario de lo que se quedó por defecto. Quitar ese valor por
    defecto y la pantalla de Ajustes que lo pida quedan fuera.
- **D6 · Líneas libres, sin cita.** Se admite una línea con `cita_id` nulo, con concepto, importe y
  régimen a mano (por ejemplo, un informe pericial al 21 %).
  - Su régimen empieza en blanco y es obligatorio.
  - Un borrador puede llevar solo líneas libres: el sellado exige al menos una línea, no una cita
    (aceptado el 06-10-2026).
  - La cantidad de la línea libre la fija el diseño; el sellado pide un entero ≥ 1 (aceptado el
    06-10-2026).

### Queda abierto

Ninguna pregunta al propietario. Para el diseño, sin el propietario:

- si una misma cita puede estar en dos borradores no descartados, y dónde se impide: en la
  pantalla, o en la base con la migración reservada;
- qué pasa con una cita que recibe bono después de entrar en un borrador. T-021 ronda 3 (B-H1)
  permite pasar de nulo a un bono una vez en una cita realizada;
- si la regla de P-D1b (sesiones del profesional del borrador) se endurece también en la base
  (D1).

# Tareas

1. **`lib/economico/sobre-borrador.ts`**: el constructor del sobre de quince claves, con
   `canonizar()` y `normalizarNfc()` de `lib/huella` y `esquema_version` 1, y sus vectores
   congelados. No se toca `lib/huella/**`.
2. **Crear un borrador**: cabecera y primera versión desde la ficha › Facturación (D3).
   - El usuario elige una o varias sesiones del paciente (D1): solo citas `realizada` y del
     profesional del borrador. Las que tienen bono quedan excluidas (D4). La acción lo exige todo,
     no solo la lista.
   - Puede añadir líneas libres sin `cita_id` (D6).
   - Precio propuesto en cada línea de sesión: la misma regla que el pendiente de T-023 (la tarifa
     del paciente vigente el día local de la cita, y si no la hay, la base del tipo).
   - Una sesión sin precio resoluble deja el campo vacío y obligatorio, nunca un 0 silencioso.
   - Régimen según D5:
     - línea de sesión con tarifa del paciente: precargado, visible y editable;
     - línea libre: en blanco y obligatorio;
     - sin tarifa del paciente vigente (precio de la base del tipo, o ninguno): en blanco y
       obligatorio.
3. **Destinatario** (D2).
   - Por defecto, el paciente: nombre y documento se leen por `leer_identificacion()` en servidor.
   - O un tercero: nombre y NIF tecleados. El NIF se valida con `esquemaNif` o `esquemaCif` de
     `lib/identidad` (T-017).
   - En los dos casos el NIF se cifra en servidor con `lib/cifrado`.
   - El editor no descifra el NIF de una versión guardada (regla de D2).
   - **Nunca viaja en claro a una tabla, a la auditoría ni a un log.**
4. **Importes** con `lib/dinero` (T-031): céntimos enteros, cuota 0 si todo es exento, 21 % sobre
   las líneas generales con su redondeo, y la suma de líneas igual al total, como exige el sellado.
5. **Corregir**: una versión nueva completa a partir de la última.
   - El destinatario se arrastra o se sustituye según D2, sin descifrar el guardado.
   - La acción lleva la versión de partida y **rechaza si ya no es la última** (dos personas
     corrigiendo a la vez no se pisan en silencio).
   - Si el borrador está en cola o enviado, el 23514 de T-026a se traduce a «Ya se preparó en
     {programa}: no admite cambios», sin crear versión.
   - Con el envío `fallido`, se puede corregir.
6. **Descartar**: una versión nueva con `descartado = true`, tras un diálogo de confirmación. No hay
   borrar.
7. **Pantalla**: el editor y su entrada en `PanelFacturacion`, solo para el administrador y el
   profesional asignado.
   - Ninguna otra entrada: ni la agenda ni la cita (D3).
   - El técnico no ve la entrada (no deshabilitada: ausente).
   - Textos en `lib/i18n/es.ts` con el vocabulario del ADR-078 3.
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
- [ ] **CA5 · NIF (D2).**
      - Con un NIF centinela del paciente: las cuatro columnas cifradas se llenan y `descifrar`
        devuelve el centinela.
      - Lo mismo con un tercero y un CIF centinela válido.
      - En los dos casos, el centinela en claro no aparece en `borradores_factura_versiones`, en
        `auditoria` ni en ninguna respuesta al navegador después de guardar (prueba que recoge las
        respuestas, también RSC).
      - Leer el documento del paciente deja su fila de `leer_identificacion` en `auditoria`.
      - Un NIF o CIF con el control mal se rechaza sin crear versión.
      - Al corregir sin cambiar de destinatario, ni la acción ni el editor llaman a `descifrar` con
        columnas de `borradores_factura_versiones` (espía sobre `descifrar`), y las cuatro columnas
        de la versión N+1 son las de la N.
- [ ] **CA6 · Permisos.** La acción como técnico, como profesional no asignado y sobre un paciente
      inexistente devuelve **el mismo** error genérico (sin oráculo de existencia), y no crea
      cabecera ni versión. Gemelas: el administrador y el profesional asignado crean.
- [ ] **CA7 · Sin cabeceras huérfanas.** Un fallo al insertar la primera versión no deja una
      cabecera sin versiones (el diseño fija cómo: transacción en una función, o el orden y la
      compensación que permita una tabla de solo adición).
- [ ] **CA16 · Sesiones elegibles (D1, D4).**
      - Dos sesiones elegidas del paciente dan un borrador con dos líneas, cada una con su `cita_id`.
      - Una cita con `bono_id` no aparece en la lista.
      - Metida a mano en la petición, la acción la rechaza sin crear cabecera ni versión.
      - Lo mismo con una cita de otro paciente.
      - Lo mismo con una cita no `realizada` (`programada`, `cancelada`, `no_asistida`) y con una
        de otro profesional del mismo paciente. Gemela: la cita elegible entra.
- [ ] **Si hay migración**: `npx supabase db reset` sin errores, `max(version)` = `20261015120000`,
      `npm run lint:migraciones` con 0 hallazgos, y su banco `32-*` en `npm run test:rls`, con cada
      negativa y su gemela.

## Dinero

- [ ] **CA8 · Precio propuesto.** `esquemas.test.ts` o equivalente, en cada línea de sesión:
      - con tarifa del paciente, la vigente el día local (una cita a las 00:30 de Madrid toma la
        tarifa de ese día, no la del anterior en UTC);
      - sin tarifa del paciente, la base del tipo;
      - sin ninguna, el campo vacío y el guardado rechazado hasta que se rellene.
- [ ] **CA9 · Importes.** Exento → cuota 0; general → 21 % con el redondeo de `lib/dinero`; mezcla
      de líneas → la cuota solo sobre las generales; la suma de líneas es el total. Un importe en
      coma flotante no llega a la base (`grep "Number(" ` sobre importes en los ficheros nuevos →
      vacío, salvo los listados en la evidencia).
- [ ] **CA10 · Régimen marcado (D5, ADR-053 j).** Ninguna línea se guarda sin régimen.
      - La línea de sesión con tarifa del paciente llega con `tarifas_paciente.regimen_iva` y el
        usuario puede cambiarlo (prueba: cambiarlo y guardar sella el elegido).
      - La línea libre, y la de sesión sin tarifa del paciente vigente, llegan en blanco, y
        guardarlas así se rechaza. Prueba: con `tipos_terapia.regimen = 'general'` y sin tarifa del
        paciente, el régimen propuesto sigue vacío (nada se precarga desde `tipos_terapia.regimen`).
      - La pantalla explica la diferencia entre exento y 21 %.
- [ ] **CA17 · Línea libre (D6).**
      - Un borrador con una sola línea libre al 21 % (`cita_id` nulo) entra por el sellado, con la
        cuota de `lib/dinero`.
      - Una línea libre sin concepto, sin importe o sin régimen se rechaza sin crear versión.

## Pantalla

- [ ] **CA11 · Quién ve el editor.**
      - Prueba del panel: el técnico no tiene la entrada en el DOM.
      - El profesional no asignado no llega a la ficha.
      - El administrador y el asignado sí.
      - Ninguna ruta de la agenda enlaza al editor (D3): `grep -rn "/borrador" app/(app)/agenda`
        → vacío.
- [ ] **CA12 · Vocabulario (ADR-078 3).** `grep -rniE "\b(emitir|facturar|expedir|aprobar|crear
      factura|verifactu)\b"` sobre los ficheros nuevos y las claves nuevas de `lib/i18n/es.ts` →
      vacío.
- [ ] **CA13 · Sin caché.** Ni `use cache` ni `unstable_cache` en `lib/economico` ni en el editor.
- [ ] **CA14 · Manual.**
      - Como profesional asignado:
        - crear un borrador de dos sesiones realizadas más una línea libre, y ver el precio y el
          régimen propuestos;
        - corregir el importe (aparece «versión 2»);
        - cambiar el destinatario a un tercero con CIF (versión 3);
        - descartarlo (aparece «Descartado» y ningún botón de borrar).
      - Como técnico: la ficha no ofrece nada de esto.
      - Al lado de `/prototipo`: mismo vocabulario visual, sin controles de adorno.
      - A 360 px se puede crear un borrador.
- [ ] **CA15.** `npm test`, `npm run test:a11y` (con `accesibilidad/borrador.spec.ts`: diálogo con
      foco y devolución de foco), `npm run test:rls`, `npm run lint` y `npm run build` en verde.
      `node ~/.claude/pipeline/territorio.mjs T-046` dentro del `territorio:`.

# Guion de comprobación manual

1. `npx supabase db reset && npm run seed`. Como profesional, marcar dos citas pasadas como
   realizadas.
2. Ficha del paciente › Facturación: crear el borrador de esas dos sesiones y añadir una línea libre
   «Informe» al 21 %. Comprobar que salen el precio y el régimen propuestos y que el destinatario es
   el paciente.
3. Corregir el importe y guardar: el panel enseña la versión 2, sin enviar.
4. Cambiar el destinatario a un tercero con nombre y CIF, y guardar: versión 3.
5. Descartarlo con su diálogo: «Descartado».
6. Entrar como técnico del centro: en la ficha no hay ni entrada ni borradores. En la agenda, nadie
   ofrece crear un borrador.

# Notas para el agente

- **El borrador no lleva nada que pueda salir mal fuera**: lo que sale al programa lo decide la
  proyección de T-026a (concepto genérico, sin `cita_id`). Pero el `concepto` de la línea **se
  queda en la instancia** y lo lee quien lee el borrador: la ayuda del campo dice que no es sitio
  para nada clínico. Vale igual para el concepto de una línea libre (D6).
- El régimen no se deduce del destinatario: que el tercero sea una aseguradora no cambia la línea
  a 21 % sola (ADR-053 j). La explicación de la pantalla lo puede decir.
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
- Crear el borrador desde la agenda o desde la cita (D3).
- Tomar el tutor de `representantes_paciente` (D2): su documento cifrado no tiene camino de lectura
  con rastro. El tercero se teclea.
- Facturar un bono: se hace en el programa, fuera de la app (T-027, ADR-053).
- Rectificativas y anulaciones: se hacen en el programa (ADR-078 2).
- Plantillas de facturación de Ajustes (`docs/interfaz.md` §Ajustes): sin contrato.
