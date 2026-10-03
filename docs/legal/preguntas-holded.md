# Borrador · Preguntas a Holded por escrito

> **Estado**: borrador redactado el 03-10-2026. Origen: ADR-053 (k.2), ADR-077 (punto 5),
> ADR-078 (punto 4) y el bloqueo de T-026.
>
> **Cómo se envía**:
> - Por el canal de soporte o de partners de Holded, de forma que la respuesta quede **por
>   escrito y fechada**.
> - Cuando llegue, se guarda junto a este fichero y se cita en T-025 y en T-026.
>
> **Qué cuenta como respuesta**: algo que se pueda enseñar. Si contestan por teléfono o en un
> chat que no se puede exportar, se pide que lo confirmen por correo.

---

**Asunto**: Integración por API que crea documentos en borrador · preguntas sobre Veri\*Factu y la
declaración responsable

Hola:

Desarrollo un programa de gestión clínica para consultas de psicología. Muchos de nuestros
clientes facturan con Holded, y queremos integrarnos de esta forma:

- nuestro programa crea, con la clave de API que el propio cliente genera en su cuenta, **documentos
  de venta en borrador** (`approveDoc: false`);
- **nunca los aprueba**: el cliente revisa el borrador y lo aprueba él mismo en la interfaz de
  Holded, que es quien expide la factura, genera el registro de facturación y lo remite a la AEAT.

Antes de construirlo necesitamos su confirmación por escrito sobre estos puntos:

1. **Borradores sin efectos fiscales.** ¿Un documento creado por API con `approveDoc: false` queda
   sin número, sin código QR y sin registro de facturación, y sin que se remita nada a la AEAT,
   hasta que una persona lo aprueba en Holded?
2. **El momento de la expedición.** ¿En qué instante se genera y se remite el registro de
   facturación: al aprobar, o en otro momento? ¿Qué devuelve la API sobre un documento ya aprobado
   (número, fecha de expedición, importes, estado de la remisión a la AEAT)?
3. **Su declaración responsable.** ¿Contempla su declaración responsable como sistema informático
   de facturación la creación de documentos en borrador por API desde software de terceros?
   ¿Consideran que ese software de terceros forma parte de su SIF o es un componente de
   facturación que deba certificarse? Si pueden facilitarnos la declaración responsable vigente o
   el pasaje que trate las integraciones, nos sería muy útil.
4. **Lo que pasa después.** Necesitamos saber:
   - qué estados expone la API para un documento;
   - si un documento aprobado se puede anular o borrar, y cómo se refleja en la API;
   - cómo se enlaza una factura rectificativa con su original;
   - si un borrador borrado sin aprobar deja algún rastro que se pueda consultar por la API.
5. **Permisos de la clave.** ¿Se puede generar una clave de API con permisos limitados, por ejemplo
   crear y leer documentos pero no aprobarlos? Si se puede, ¿cómo? Queremos pedir a nuestros
   clientes la clave de menos alcance que nos sirva.
6. **Plan necesario.** ¿Qué planes de Holded incluyen el acceso a la API que hace falta para esto?

Gracias de antemano.

[Nombre] · [Empresa o nombre comercial] · [Correo] · [Teléfono]
