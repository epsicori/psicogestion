---
id: T-026
titulo: Proveedor de facturación — capa, adaptador de Holded, espejo mínimo y ajustes
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-021, T-007]
estado: pendiente
riesgo: alto
---

# Contexto

Por el **ADR-053**, Psicogestión no expide facturas: deja un **borrador** en la cuenta del
proveedor que el cliente ya usa, y el cliente lo aprueba allí. Este ticket construye esa
frontera y es el único sitio del repositorio que habla con un proveedor.

Es `opus` por tres motivos que no son opinión: toca **la clave API de un tercero**, toca **la
frontera regulatoria** de la que depende que no seamos SIF, y un fallo aquí manda datos fuera
de la instancia.

**Cambio del 03-10-2026 (P3 de T-021, ADR-077).** El espejo de facturas **nace aquí** y no en
T-021, con una forma mínima: los hechos de la expedición, copiados una vez y nunca actualizados. Del
programa no se copian ni el estado ni los cobros. Este ticket crea también el registro de envíos y las
anotaciones de lo que pase después, las dos de solo adición. Por eso ahora escribe en `supabase/`.
Diseño de T-021: `tickets/T-021/diseno.md`, §P3.3 (opción d), §P3.5 (M2) y §«Adenda P3 aplicada»,
PA.1, que lista lo que se trae de T-021.

ADR **053** (b, c, d, e, f, i, j), **077** (espejo mínimo; manda sobre el 053 c y d), **024**
(outbox), **029** (identificadores), **043** (nada de un paciente se cachea). `architecture.md`
§Roles, fila Facturación.

## No se empieza todavía, y por qué

> El frontmatter dice `pendiente` porque la plantilla solo admite `pendiente | en_curso |
> hecho`. **De hecho está bloqueado** hasta tener por escrito, de Holded:
>
> 1. En qué instante remiten el registro de facturación a la AEAT y qué devuelve la API al
>    aprobar.
> 2. Si su declaración responsable contempla la creación de documentos por API desde software
>    de terceros.
> 3. Confirmación de que un documento creado con `approveDoc: false` **no** genera registro de
>    facturación, ni numeración, ni remisión, hasta que una persona lo aprueba en su interfaz.
> 4. *(ADR-077)* Qué estados expone la API para un documento; si un documento aprobado se puede
>    anular o borrar; cómo se enlaza una rectificativa con su original; y si un borrador borrado
>    sin aprobar deja rastro consultable. Sin esto no se puede fijar la forma de las anotaciones.
>
> Y hasta tener la respuesta a la duda del «formando una unidad» (ADR-053 k.1, T-025). **La
> consulta al asesor tiene que haber llevado la lista exacta del ADR-077, punto 7.** Si este
> ticket necesita copiar del programa algo que no esté en esa lista, para: hace falta un ADR nuevo
> y repetir la pregunta.
> **No se escribe contra una API supuesta** (constitución, regla 1).

## Tareas

- [ ] **Interfaz `ProveedorFacturacion`** en `lib/facturacion/proveedor.ts`: `crearBorrador`,
      `consultarDocumento`, `listarDocumentosDesde`. **Nada más.** No hay `aprobar`, no hay
      `expedir`, no hay `descargarPdf` — y su ausencia es el invariante del ADR-053 (b), no un
      recorte de alcance. El dominio depende de esta interfaz y **nunca** de Holded.
- [ ] **Adaptador `lib/facturacion/holded.ts`**, única implementación. Todo lo específico
      —rutas, forma del JSON, nombres de campo, ventanas de límite de peticiones— vive aquí y
      no se filtra ni un nombre de Holded fuera de este fichero. Prueba: `grep -ri "holded"
      --exclude-dir=lib/facturacion` no devuelve nada de código.
- [ ] **`approveDoc: false` fijo en el adaptador**, sin parámetro, sin ajuste, sin bandera.
      Constante local con comentario que cite el ADR-053 (b) y la aclaración 4 de la AEAT.
- [ ] **Ajustes › Facturación**: alta de proveedor con su **clave API, que el cliente genera en
      su propia cuenta**. Se guarda en el **Vault de Supabase**, jamás en columna en claro ni en
      el navegador, y solo la lee el servidor. Se muestra enmascarada y **no se puede releer**:
      se sustituye.
      - Botón de **probar conexión** que solo lee. Si el cliente no tiene plan de pago en
        Holded, la API no responde y hay que decírselo con esas palabras, no con un 401 crudo.
      - **Sin proveedor configurado, la facturación no existe**: modo degradado limpio —se
        registran cobros (T-023) y no hay botones de facturar—, no un error. Qué enseña el
        pendiente sin proveedor depende de lo que T-023 decida que cuenta.
- [ ] **Esquema del espejo, en una migración de este ticket** (ADR-077). Lo que se trae de T-021
      está en PA.1 de su diseño. La forma exacta la fija el diseño de este ticket con las respuestas
      de Holded, y ninguna columna copiada del programa puede salir de la lista del ADR-077, punto 7.
      - **Enum `proveedor_facturacion`** (`holded`).
      - **`borradores_factura_envios`**, de solo adición: versión del borrador que salió, cuándo, a
        qué proveedor y con qué identificador de documento. Es el vínculo inalterable que pide la FAQ
        de prefacturación; el outbox no sirve para eso porque es mutable (ADR-024). La versión va sin
        FK, con disparador: `borradores_factura_versiones` es de solo adición.
      - **`facturas_espejo`**, de solo adición: proveedor, identificador del documento, borrador,
        número, fecha de expedición, base, cuota de IVA, total, enlace y `copiado_en`. **Sin
        `estado_proveedor` ni nada de cobros.** Ni PDF, ni QR, ni registro de facturación, ni huella
        (ADR-053 c).
      - **Anotaciones de lo que pasa después**, de solo adición: identificador del documento, un
        `tipo` de vocabulario cerrado (`borrado sin aprobar`, `rectificado`, `anulado`) y la fecha
        de observación. **Sin texto libre del programa.**
      - Las tres tablas, con las tres capas (`revoke`, disparador de fila y `before truncate`),
        dentro de `tablas_solo_adicion` y de `TABLAS_SOLO_ADICION` del linter, cada una con su fila
        en `scripts/rls/01-fijacion.sql` (sin ella, `10-solo-adicion` falla con la tabla vacía).
      - **`registrar_factura_espejo(...)`**, `security definer`, que solo ejecuta `service_role`.
        Si el documento ya está copiado con los mismos datos, devuelve el mismo `id`; con datos
        distintos, 23505. **Nunca actualiza.** Lo mismo para las altas de envíos y de anotaciones.
      - **`cobros.factura_espejo_id`**: con `alter table … add column`, nula, sin default y sin FK
        (el espejo es de solo adición). Un disparador exige que el espejo exista (23503) y sea del
        mismo paciente (23514). `bonos.factura_espejo_id`, solo si el diseño encuentra de dónde
        llenarla: la factura de un bono no sale de un borrador (T-027).
      - **Vista `facturas_espejo_cabecera`** para el técnico, por centro, sin las líneas del
        borrador ni `cita_id`, con su `where` repitiendo las tres ramas de rol.
      - **Redefinir `borradores_factura_estado`** de T-021 con `create or replace view`, añadiendo
        `enviado` (hay envío) y `facturado` (hay espejo), y conservando sus columnas.
      - RLS: el espejo, los envíos y las anotaciones los lee el administrador y el profesional del
        borrador. El técnico, nada, salvo la cabecera por la vista. Nadie de `authenticated` inserta.
      - Auditoría con `fn_auditar('id')` en las tablas nuevas.
- [ ] **Envío del borrador por el outbox del ADR-024**, no en la petición del usuario. Reintento
      con retroceso, y **idempotencia por `borrador_id`**: dos envíos del mismo borrador no
      crean dos documentos. Cuando el proveedor devuelve el identificador, el envío se registra en
      `borradores_factura_envios`.
- [ ] **Lo que sale de la instancia, mínimo y no clínico** (ADR-053 i): destinatario, NIF,
      fecha, importe, régimen de IVA y un concepto genérico. **Ni diagnóstico, ni tipo de
      terapia, ni `cita_id`, ni nombre de la terapia.** Función única de proyección con su
      prueba, y prueba negativa: un borrador con datos clínicos en las líneas **no** los manda.
- [ ] **Sincronizador del espejo**: cuando ve un documento **aprobado**, copia una sola vez su
      número, fecha de expedición, importes y enlace por `registrar_factura_espejo()`. Es el
      **único** camino de escritura a esas tablas.
      - Enlaza con el borrador por el identificador que devolvió el proveedor y quedó en el envío.
      - **No trae PDF, ni QR, ni registro de facturación** (ADR-053 c).
      - **No trae el estado del documento ni sus pagos** (ADR-077). Lo cobrado es solo lo de `cobros`.
      - Un documento ya copiado **no se actualiza nunca**. Si el número o los importes cambian en el
        programa, es un hallazgo que se escala, no una actualización.
      - Lo único que anota después es borrado sin aprobar, rectificado o anulado, cada uno como fila
        nueva.
- [ ] **Estado visible del borrador en la ficha del paciente**: sin enviar, enviado, facturado, y
      la anotación si la hay. Con enlace al documento en el proveedor. El usuario tiene que entender
      **dónde está la factura**, y no está aquí.
- [ ] **Registro en `auditoria`** de cada envío y de cada sincronización, con qué se mandó y a
      dónde. Salir de la instancia es un evento auditable.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `grep -rn "approveDoc" lib/` devuelve **solo** la constante `false`, y no
      existe llamada al endpoint de aprobación en todo el repositorio.
- [ ] **Automático** — con el adaptador simulado, crear un borrador dos veces produce **un**
      documento (idempotencia por `borrador_id`) y **un** envío registrado.
- [ ] **Automático** — la proyección de un borrador con `tipo_terapia`, `cita_id` y diagnóstico
      en sus datos manda **ninguno** de los tres.
- [ ] **Automático** — la clave API no aparece en ninguna respuesta al navegador, ni en el HTML,
      ni en el paquete de cliente: prueba que recorre el `build`.
- [ ] **Automático** — `insert` sobre `facturas_espejo`, los envíos o las anotaciones como
      `authenticated` **falla**; por la función del sincronizador **entra**.
- [ ] **Automático** — `update`, `delete` y `truncate` sobre las tres tablas **fallan** para todo
      rol, incluido el del sincronizador, y `cobertura_solo_adicion()` = 0.
- [ ] **Automático** — registrar el mismo documento dos veces con los mismos datos devuelve el mismo
      `id`; con un total distinto, 23505, y la fila copiada no cambia.
- [ ] **Automático** — `facturas_espejo` no tiene ninguna columna de estado, de cobro, de PDF, de QR
      ni de registro de facturación (`information_schema.columns`).
- [ ] **Automático** — el `tipo` de las anotaciones no admite un valor fuera de su vocabulario.
- [ ] **Automático** — como `tecnico_administrativo`: la cabecera de las facturas de su centro sí,
      las de otro centro no (con su gemela), y ni `cita_id` ni las líneas en las columnas de la vista.
- [ ] **Automático** — un cobro enlazado a un espejo de otro paciente **falla** con 23514, también
      como técnico.
- [ ] **Automático** — con el proveedor caído, el borrador queda en la cola del outbox y **no**
      se pierde ni se marca como facturado.
- [ ] **Automático** — `grep -ri "holded"` fuera de `lib/facturacion/` no devuelve código.
- [ ] **Manual** — sin proveedor configurado, la app funciona: cobros sí, facturar no aparece.
- [ ] **Manual** — configurar la clave, probar conexión, crear un borrador y verlo **en borrador
      y sin numeración** dentro de Holded. Aprobarlo allí a mano y ver aparecer el espejo.
- [ ] **Manual** — la clave guardada se muestra enmascarada y no hay forma de releerla.
- [ ] **Automático** — `npm run test:rls` en verde, `npm run lint:migraciones` sin hallazgos,
      `npm run lint && npm run build` limpios.

## Territorio

Lo cierra el diseño en el frontmatter. Lo que ya se sabe que necesita por el ADR-077:
- una migración propia en `supabase/migrations/`, con el sello libre al diseñar;
- `scripts/rls/00-ayudantes.sql`, `01-fijacion.sql`, `11-cobertura.sql`, un banco nuevo y su fila en
  `scripts/rls/README.md`;
- `scripts/lint-migraciones.ts` y `scripts/lint-migraciones.test.ts`;
- `lib/supabase/tipos-bd.ts` y `lib/facturacion/**`;
- las rutas y componentes de Ajustes › Facturación y del estado del borrador en la ficha;
- `tickets/T-026/**`, `docs/bitacora/T-026*.md` y `docs/state.md`.

## Guion de comprobación manual

1. Ajustes › Facturación: pegar la clave de una cuenta de pruebas de Holded y probar conexión.
2. Crear un borrador desde una cita y enviarlo. Abrir Holded: **existe, en borrador, sin número**.
3. Aprobarlo en Holded. Esperar la sincronización y comprobar el espejo: número, importes, enlace, y
   ninguna columna de estado.
4. Registrar un cobro contra él (T-023). El espejo no cambia; lo cobrado está solo en `cobros`.
5. Marcarlo como pagado en Holded y sincronizar: en la app no cambia nada.
6. Quitar la clave y comprobar que la app queda en modo degradado, sin errores.

## Notas para el agente

- **Si en algún momento te hace falta aprobar un documento para que el flujo funcione, para.**
  No es una limitación a rodear: es la decisión (ADR-053 b). Se anota como hallazgo y se escala.
- **Si te hace falta actualizar una fila copiada, o copiar el estado o los pagos del programa, para.**
  Es la decisión del ADR-077, no un detalle de implementación.
- Los hallazgos van a la sección **§Para `docs/state.md`** de tu informe. En `docs/` solo escribes
  lo que dice `territorio:`.
- La clave API es de un tercero y es del cliente: no la registres, no la muestres en un log, no
  la mandes a Sentry ni equivalente.
- Reutiliza el outbox del ADR-024 y las primitivas de `components/ui/` de T-007. No escribas
  otro mecanismo de reintento.
- Si Holded cambia la forma del JSON, se arregla en el adaptador. Si te obliga a cambiar la
  interfaz, la abstracción está mal planteada: eso es un hallazgo.
