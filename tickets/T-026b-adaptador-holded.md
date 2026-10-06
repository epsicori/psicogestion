---
id: T-026b
titulo: Adaptador de Holded — el cuerpo de holded.ts, sus errores y estados, y los manuales con una cuenta real
modelo: opus
riesgo: alto
fase: 2
prioridad: alta
depende_de: [T-026a, T-046]   # T-046: el propietario pidió el editor del borrador antes de activar el envío (Q1)
estado: pendiente             # de hecho BLOQUEADO: ver «No se empieza todavía»
delegable: no                 # clave de un tercero, red y frontera regulatoria
territorio:                   # provisional; lo cierra tickets/T-026b/diseno.md
  - lib/facturacion/holded.ts
  - lib/facturacion/holded.test.ts
  - lib/i18n/es.ts                          # solo facturacion.* y ajustes.facturacion.* que dependen de Holded
  - app/(app)/ajustes/facturacion/**        # solo textos y pruebas; ninguna acción nueva
  - accesibilidad/facturacion-clave.spec.ts # el recorrido a través del formulario
  - tickets/T-026b/**
  - docs/bitacora/T-026b*.md
  - docs/state.md
---

# Contexto

Segunda mitad de T-026 (`tickets/T-026-proveedor-facturacion-holded.md`), partido el 05-10-2026
(Q0 de `tickets/T-026/diseno.md`). T-026a deja la frontera construida y probada con un adaptador
simulado. `holded.ts` queda como esqueleto: `APPROVE_DOC = false`, tres métodos que lanzan
`ErrorProveedor('no_disponible')` y `disponible: false`. Este ticket le pone el cuerpo y, con eso,
**activa** la facturación: `fichaHolded.disponible` pasa a `true` y la app sale del modo degradado
para quien configure su clave.

Es el único ticket que habla por red con un proveedor. Es `opus` por tres motivos: toca **la clave
API de un tercero**, toca **la frontera regulatoria** de la que depende que no seamos SIF, y un fallo
aquí manda datos fuera de la instancia.

ADR **053** (b, e, f, i, k), **077**, **078** (1, 3, 4 y 7), **024**. Diseño de la interfaz:
`tickets/T-026/diseno.md` §1.2 y §1.4, que **no se cambian aquí**.

## No se empieza todavía, y por qué

> No se escribe contra una API supuesta (constitución, regla 1; ADR-053 k). Hace falta, por escrito
> y archivado por el propietario en `docs/legal/`:
>
> 1. De Holded, las cuatro respuestas de T-026 (`:33-52`): en qué instante remiten el registro de
>    facturación y qué devuelve la API al aprobar; si su declaración responsable contempla la
>    creación de documentos por API desde software de terceros; que un documento creado con
>    `approveDoc: false` no genera registro, ni numeración, ni remisión hasta que una persona lo
>    aprueba en su interfaz; y qué estados expone la API, si un aprobado se puede anular o borrar,
>    cómo se enlaza una rectificativa y si un borrador borrado sin aprobar deja rastro consultable.
> 2. De Holded, además: si admite claves con permisos limitados (ADR-078 4) y cómo deduplica una
>    creación repetida (Q5 de T-026).
> 3. La respuesta a la duda k.1 («formando una unidad»): informe de asesor fiscal o consulta
>    vinculante (ADR-053 k), y la consulta tiene que haber llevado **la lista exacta del ADR-077,
>    punto 7**. La consulta a la DGT se presenta antes de que la facturación llegue a ningún
>    cliente (ADR-078 6): eso no bloquea construir, bloquea comercializar.
>
> Con eso, el arquitecto escribe `tickets/T-026b/diseno.md`: la traducción de cada respuesta a
> rutas, JSON, estados y errores. Si una respuesta obliga a copiar algo que no está en la lista del
> ADR-077 punto 7, o a cambiar la interfaz de `proveedor.ts`, **para**: hace falta un ADR nuevo o es
> un hallazgo de la abstracción, no algo que se arregla en el adaptador.

# Tareas

1. **`crearProveedorHolded({ clave, fetch })`**, los tres métodos de la interfaz y nada más:
   `crearBorrador`, `consultarDocumento`, `listarDocumentosDesde`. Todo `fetch` usa el `fetch`
   inyectado, lleva `cache: 'no-store'` y un tiempo límite de 30 s (riesgo 2 del diseño de T-026).
2. **`approveDoc: false` en el cuerpo de creación**, leído de la constante `APPROVE_DOC`. Ninguna
   llamada al endpoint de aprobación, en ninguna rama.
3. **Traducción de estados** de Holded a la `situacion` cerrada de `DocumentoObservado`
   (`borrador`, `borrado_sin_aprobar`, `aprobado`, `rectificado`, `anulado`) y, para los aprobados,
   solo los `HechosDeExpedicion` (número, fecha de expedición, base, cuota, total, enlace). Del
   programa no se lee nada más: ni estado de pago, ni líneas, ni PDF.
4. **Traducción de errores** a `CodigoErrorProveedor`: `red` y `limite` reintentables (el documento
   **no** se creó); `no_autorizado`, `sin_plan` y `rechazado` permanentes; `ambiguo` cuando la
   petición salió y no se sabe si creó (tiempo agotado tras enviar). El mensaje es fijo por código:
   nunca el cuerpo, las cabeceras ni la URL de la respuesta.
5. **La clave, solo en la cabecera** que indique Holded. Nunca en la URL, en un error ni en un
   `console.*`.
6. **`fichaHolded`**: `disponible: true` y `enlaceDeBorrador(documentoId)` con el enlace que
   documente Holded, o `null` si no existe (entonces la ficha no pinta «Abrir en {programa} para
   emitir»).
7. **Textos que dependen de Holded** en `lib/i18n/es.ts`: el de `sin_plan` («Tu cuenta de
   {programa} no tiene un plan que permita conectar otras aplicaciones…», ajustado a la respuesta)
   y, si Holded admite claves limitadas, la indicación de cuál generar (ADR-078 4).

# Criterios de aceptación (verificables)

- [ ] **CA1 · Nada aprueba.** `holded.test.ts`, con `fetch` simulado que registra cada petición:
      ninguna URL pedida contiene `approve` en ningún método ni en ninguna rama de error, y el cuerpo
      de creación lleva `approveDoc: false`. `grep -rn "approveDoc\|APPROVE_DOC" lib/` → solo la
      constante y su uso en el cuerpo. `grep -rniE "approve" app components lib proxy.ts
      --exclude=*.test.ts` → solo esas líneas.
- [ ] **CA2 · Lo que sale.** `holded.test.ts`: el cuerpo de creación de un `BorradorProyectado`
      contiene destinatario, NIF, fecha, líneas con el concepto genérico, importes y régimen, y
      nada más: la lista exacta de claves la fija `tickets/T-026b/diseno.md` y no sale de la del
      ADR-053 (i). Ninguna referencia a nuestro `borrador_id` (Q5).
- [ ] **CA3 · Estados.** Una prueba por cada respuesta documentada de Holded → la `situacion`
      correcta; un aprobado devuelve exactamente los seis campos de `HechosDeExpedicion`; una
      respuesta con estado de pago o líneas no cambia la salida.
- [ ] **CA4 · Errores.** Una prueba por cada código: 401/403, falta de plan, límite de peticiones,
      error de red antes de enviar, tiempo agotado después de enviar (`ambiguo`), respuesta mal
      formada. `reintentable` solo es verdadero en `red` y `limite`.
- [ ] **CA5 · La clave no se filtra.** Con una clave centinela: aparece solo en la cabecera de
      autenticación de cada petición; nunca en la URL, en `error.message`, en `String(error)` ni en
      lo que reciban los `console.*` espiados.
- [ ] **CA6 · La clave no llega al navegador, por el formulario.**
      `accesibilidad/facturacion-clave.spec.ts`, ampliada: el administrador pega el centinela en el
      formulario de Ajustes, guarda y recarga → «••••» y los cuatro últimos, el `input` vacío; ninguna
      respuesta (también RSC) contiene el centinela; `.next/` tampoco.
- [ ] **CA7 · Holded encerrado.** `grep -rniI holded app components lib proxy.ts scripts/*.ts
      --exclude-dir=facturacion` → vacío, salvo la etiqueta del enum en `lib/supabase/tipos-bd.ts`.
- [ ] **CA8 · La interfaz no cambia.** `git diff main -- lib/facturacion/proveedor.ts` vacío.
- [ ] **CA9 · Vocabulario (ADR-078 3).** El mismo `grep` de T-026a CA23, sin cadenas nuevas fuera
      de las permitidas.
- [ ] **CA10 · Manual, cuenta de pruebas de Holded.** Siguiendo el guion: probar conexión responde;
      un borrador preparado aparece en Holded **en borrador y sin numeración**; aprobado a mano allí,
      el espejo aparece con número, importes y enlace, y ninguna columna de estado; marcado como
      pagado en Holded, en la app no cambia nada; borrado sin aprobar, sale la anotación. Capturas
      en la evidencia.
- [ ] **CA11 · Manual, sin plan.** Con una cuenta sin plan de API, «Probar conexión» enseña el texto
      de `sin_plan`, no un 401.
- [ ] **CA12 · Manual, desconectar.** Quitar la clave: la app vuelve al modo degradado sin errores.
- [ ] **CA13.** `npm test`, `npm run test:facturacion`, `npm run test:rls`, `npm run lint` y
      `npm run build` en verde. `node ~/.claude/pipeline/territorio.mjs T-026b` dentro del
      `territorio:`.

# Guion de comprobación manual

1. Ajustes › Programa de facturación: pegar la clave de una cuenta de pruebas de Holded y probar
   conexión.
2. Con un borrador creado con el editor (T-046), «Preparar borrador en Holded». Esperar al drenado.
   Abrir Holded: **existe, en borrador, sin número**.
3. Aprobarlo en Holded. Esperar a la sincronización: la ficha dice «Emitida en Holded · nº …», con
   enlace.
4. Registrar un cobro contra él (T-023b, si está; si no, un cobro normal). El espejo no cambia.
5. Marcarlo como pagado en Holded y esperar a la sincronización: en la app no cambia nada.
6. Preparar otro borrador y borrarlo en Holded sin aprobar: aparece «Borrado en Holded sin emitir».
7. Desconectar: modo degradado, sin errores.

# Notas para el agente

- **Si en algún momento hace falta aprobar un documento para que el flujo funcione, para.** No es
  una limitación a rodear: es el ADR-053 (b). Se anota como hallazgo y se escala.
- **Si Holded ofrece una clave de idempotencia en cabecera**, usarla con nuestro `borrador_id` es
  mandar una referencia nuestra, y eso amplía la lista cerrada del ADR-053 (i): necesita ADR. Sin
  él, no se usa.
- Si Holded cambia la forma del JSON, se arregla aquí. Si obliga a cambiar `proveedor.ts`, es un
  hallazgo: la abstracción está mal planteada.
- La cuenta de pruebas y su clave son del propietario: no van al repositorio, ni a `.env.example`,
  ni a la evidencia (se enseñan enmascaradas).
- Los hallazgos van a §«Para `docs/state.md`» del informe.

# Lo que no entra

- Cualquier cambio de esquema: si una respuesta de Holded lo exige, se para y se pide un ticket
  `supabase/` aparte.
- El plan B de fichero (ADR-078 7): diseñado, no construido.
- Otro proveedor: la interfaz lo admite, pero no hay contrato.
