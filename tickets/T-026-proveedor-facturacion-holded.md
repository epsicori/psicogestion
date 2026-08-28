---
id: T-026
titulo: Proveedor de facturación — capa, adaptador de Holded y ajustes
modelo: opus
fase: 2
prioridad: alta
depende_de: [T-021, T-007]
estado: pendiente
---

# Contexto

Por el **ADR-053**, Psicogestión no expide facturas: deja un **borrador** en la cuenta del
proveedor que el cliente ya usa, y el cliente lo aprueba allí. Este ticket construye esa
frontera y es el único sitio del repositorio que habla con un proveedor.

Es `opus` por tres motivos que no son opinión: toca **la clave API de un tercero**, toca **la
frontera regulatoria** de la que depende que no seamos SIF, y un fallo aquí manda datos fuera
de la instancia.

ADR **053** (b, c, d, e, f, i, j), **024** (outbox), **029** (identificadores),
**043** (nada de un paciente se cachea). `architecture.md` §Roles, fila Facturación.

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
>
> Y hasta tener la respuesta a la duda del «formando una unidad» (ADR-053 k.1, T-025).
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
        registran cobros y pendiente (T-023) y no hay botones de facturar—, no un error.
- [ ] **Envío del borrador por el outbox del ADR-024**, no en la petición del usuario. Reintento
      con retroceso, y **idempotencia por `borrador_id`**: dos envíos del mismo borrador no
      crean dos documentos.
- [ ] **Lo que sale de la instancia, mínimo y no clínico** (ADR-053 i): destinatario, NIF,
      fecha, importe, régimen de IVA y un concepto genérico. **Ni diagnóstico, ni tipo de
      terapia, ni `cita_id`, ni nombre de la terapia.** Función única de proyección con su
      prueba, y prueba negativa: un borrador con datos clínicos en las líneas **no** los manda.
- [ ] **Sincronizador del espejo**: trae número, fecha, total, estado y enlace de los documentos
      del proveedor y los escribe en `facturas_espejo` por la función `security definer` de
      T-021. Es el **único** camino de escritura a esa tabla.
      - Enlaza con el borrador por el identificador que devolvió el proveedor.
      - **No trae PDF, ni QR, ni registro de facturación** (ADR-053 c).
      - Un documento que ya está en el espejo se actualiza **solo** en `estado_proveedor` y
        `sincronizado_en`; el número y los importes, si cambian, es un hallazgo, no una
        actualización silenciosa.
- [ ] **Estado visible del borrador en la ficha del paciente**: sin enviar, enviado, facturado.
      Con enlace al documento en el proveedor. El usuario tiene que entender **dónde está la
      factura**, y no está aquí.
- [ ] **Registro en `auditoria`** de cada envío y de cada sincronización, con qué se mandó y a
      dónde. Salir de la instancia es un evento auditable.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `grep -rn "approveDoc" lib/` devuelve **solo** la constante `false`, y no
      existe llamada al endpoint de aprobación en todo el repositorio.
- [ ] **Automático** — con el adaptador simulado, crear un borrador dos veces produce **un**
      documento (idempotencia por `borrador_id`).
- [ ] **Automático** — la proyección de un borrador con `tipo_terapia`, `cita_id` y diagnóstico
      en sus datos manda **ninguno** de los tres.
- [ ] **Automático** — la clave API no aparece en ninguna respuesta al navegador, ni en el HTML,
      ni en el paquete de cliente: prueba que recorre el `build`.
- [ ] **Automático** — `insert`/`update` sobre `facturas_espejo` como `authenticated` **falla**;
      por el sincronizador **entra**.
- [ ] **Automático** — con el proveedor caído, el borrador queda en la cola del outbox y **no**
      se pierde ni se marca como facturado.
- [ ] **Automático** — `grep -ri "holded"` fuera de `lib/facturacion/` no devuelve código.
- [ ] **Manual** — sin proveedor configurado, la app funciona: cobros sí, facturar no aparece.
- [ ] **Manual** — configurar la clave, probar conexión, crear un borrador y verlo **en borrador
      y sin numeración** dentro de Holded. Aprobarlo allí a mano y ver aparecer el espejo.
- [ ] **Manual** — la clave guardada se muestra enmascarada y no hay forma de releerla.
- [ ] **Automático** — `npm run test:rls` en verde, `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. Ajustes › Facturación: pegar la clave de una cuenta de pruebas de Holded y probar conexión.
2. Crear un borrador desde una cita y enviarlo. Abrir Holded: **existe, en borrador, sin número**.
3. Aprobarlo en Holded. Esperar la sincronización y comprobar el espejo: número, total, enlace.
4. Registrar un cobro contra él (T-023) y ver el pendiente moverse.
5. Quitar la clave y comprobar que la app queda en modo degradado, sin errores.

## Notas para el agente

- **Si en algún momento te hace falta aprobar un documento para que el flujo funcione, para.**
  No es una limitación a rodear: es la decisión (ADR-053 b). Se anota como hallazgo y se escala.
- **No leas ni escribas `docs/`.** El material sube por `kimi/hallazgos/` y por §Para
  `docs/state.md` de tu informe.
- La clave API es de un tercero y es del cliente: no la registres, no la muestres en un log, no
  la mandes a Sentry ni equivalente.
- Reutiliza el outbox del ADR-024 y las primitivas de `components/ui/` de T-007. No escribas
  otro mecanismo de reintento.
- Si Holded cambia la forma del JSON, se arregla en el adaptador. Si te obliga a cambiar la
  interfaz, la abstracción está mal planteada: eso es un hallazgo.
