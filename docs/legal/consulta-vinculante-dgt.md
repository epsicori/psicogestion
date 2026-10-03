# Borrador · Consulta tributaria escrita a la Dirección General de Tributos

> **Estado: borrador para que lo revise un asesor fiscal antes de presentarlo.** Origen: ADR-053
> (k.1), ADR-077 (punto 7) y ADR-078 (punto 6). Redactado el 03-10-2026.
>
> **Antes de presentar, hay que comprobar:**
> - **Requisitos formales**: art. 88 LGT y art. 66 del RGAT (RD 1065/2007), con el asesor. Se
>   comprueba también el trámite electrónico vigente para presentarla.
> - **Plazo**: la consulta se formula antes de que venza la obligación (art. 88.2 LGT). Por eso
>   se presenta **antes de comercializar la facturación**. La DGT tiene seis meses para contestar
>   (art. 88.6 LGT).
> - **Hechos**: tienen que ser **exactamente** los del producto el día que se presenta. Si el
>   diseño cambia (ADR nuevo sobre la facturación), este texto se revisa antes de enviarlo. Una
>   contestación sobre hechos que no son los reales no vincula.
> - **Datos entre corchetes**: hay que rellenarlos.

---

**Consultante**: [Nombre y apellidos] · NIF [—] · Domicilio fiscal [—] · Correo electrónico [—]

**Condición en la que consulta**: empresario individual. Es productor de un programa informático
de gestión para consultas sanitarias, que va a comercializar. Consulta como posible obligado por
el art. 29.2.j de la Ley 58/2003, General Tributaria (LGT), y por su desarrollo en el Reglamento
aprobado por el Real Decreto 1007/2023 (RRSIF) y en la Orden HAC/1177/2024 (OM).

## 1. Hechos

1. El consultante desarrolla «Psicogestión», un programa de **gestión clínica** para consultas de
   psicología: agenda de citas, ficha del paciente, historia clínica, tarifas, bonos y registro
   de cobros. Se ofrece como servicio en la nube, con una instalación independiente para cada
   cliente.
2. Los clientes son profesionales o centros sanitarios. **Cada uno expide sus facturas con su
   propio sistema informático de facturación**, contratado por él a un tercero (en el primer
   caso, Holded), con su propia cuenta y bajo la declaración responsable del fabricante de ese
   sistema.
3. Psicogestión **prepara borradores** a partir de las citas y bonos del paciente. Cada borrador
   lleva:
   - un concepto no clínico, por ejemplo «Sesión de psicología»;
   - los datos del destinatario que ha registrado el usuario;
   - el importe;
   - el régimen de IVA, que **marca el usuario** (exención del art. 20.Uno.3.º LIVA o tipo
     general).
4. **Cuando el usuario lo decide**, Psicogestión envía cada borrador al programa de facturación
   del usuario. Lo hace por la interfaz de programación (API) del programa, con una clave que el
   usuario genera en su propia cuenta y configura él. El documento se crea **en estado de
   borrador**, sin numeración, sin código QR y sin registro de facturación. La creación se pide
   siempre como borrador (en Holded, con el parámetro `approveDoc` a `false`), sin excepción ni
   opción de configuración que lo cambie.
5. **Psicogestión no aprueba ni emite el documento en ningún caso**, ni puede hacerlo:
   - no llama nunca a la función de aprobación del programa;
   - no tiene ningún control que lo haga, ni directamente ni a través de enlaces o avisos
     automáticos.

   El paso de borrador a factura lo hace el usuario **dentro de la interfaz de su programa de
   facturación**, cuando y si lo decide. Puede antes modificar el borrador o eliminarlo. Las
   rectificaciones y anulaciones también las hace el usuario en ese programa.
6. **Psicogestión no hace ninguna de estas cosas**:
   - no numera facturas ni lleva series;
   - no genera registros de facturación ni su huella o encadenamiento;
   - no genera el código QR ni imprime facturas;
   - no remite nada a la sede electrónica de la AEAT;
   - no lleva registro de eventos;
   - no conserva la factura, su PDF, su QR ni su registro de facturación.
7. **Qué copia Psicogestión del programa de facturación.** Copia exactamente esto:
   - **al crear el borrador**: el identificador que devuelve el programa;
   - **cuando el documento se aprueba en el programa**: una sola vez, su número, su fecha de
     expedición, base, cuota de IVA, total y el enlace al documento;
   - **después**: solo una anotación de que el documento se borró sin aprobar, se rectificó o se
     anuló, con la fecha en que se observó;
   - **nada más**: ni el estado del documento, ni los pagos, ni el PDF, ni el QR, ni el registro de
     facturación, ni las líneas, ni los datos del cliente del programa.

   Estas copias se guardan para que la ficha del paciente muestre qué se le ha facturado. No se
   modifican nunca.
8. **Los registros propios de Psicogestión** se conservan de forma inalterable: solo se añaden,
   y cada uno va encadenado al anterior con una huella SHA-256. Eso incluye los borradores
   enviados y los que no llegan a enviarse, cada versión de un borrador y el vínculo entre el
   borrador y el documento creado en el programa. Una corrección es siempre un registro nuevo. El
   motivo es el art. 29.2.j LGT, que según la aclaración 11 de la AEAT alcanza a las prefacturas y
   borradores de cualquier sistema.
9. El usuario tiene que revisar cada borrador antes de aprobarlo en su programa, y así lo dicen
   las condiciones de uso del servicio.

## 2. Normativa y criterios que el consultante considera aplicables

- **Art. 29.2.j LGT** y **art. 201 bis LGT**.
- **RRSIF, art. 1.2**: definición de sistema informático de facturación.
- **OM HAC/1177/2024, art. 1.2.b y c**: componente de facturación y componente principal de
  facturación.
- **AEAT, «Aclaraciones a dudas de los desarrolladores», versión 1.3 (04-12-2025)**:
  - **Aclaración 4**: un SIF «expide (o gestiona/dirige/controla la expedición de) facturas […]
    a la vez que “simultáneamente” genera […] y remite o conserva […] sus correspondientes
    registros de facturación».
  - **Aclaración 5**:
    - solo hay que certificar los componentes que presten alguna de las funcionalidades
      relevantes: generación del RF, encadenamiento, impresión de facturas, generación del QR,
      envío a la sede electrónica, enlace indefectible entre componentes, conservación inalterada
      y registro de eventos;
    - la conexión indefectible es la que «no quede a decisión del usuario sino que se produzca de
      forma automática y necesaria».
  - **Aclaraciones 6 y 11**: hasta que se valida la factura, «cualquier alteración que se produzca
    en ese registro, previo al RF, sería perfectamente lícita». Los registros preparatorios se
    conservan conforme al art. 29.2.j LGT.
  - **Aclaración 10**: distingue el SIF del «sistema de gestión y proceso general de las facturas
    de la empresa».
  - **Aclaración 14.6**: cuando un programa de gestión deja la facturación a otro software, «el
    Sistema Informático De Facturación deberá estar directa e indefectiblemente conectado con
    aquel otro sistema del que reciba la información de facturación». El otro sistema queda
    sujeto al art. 29.2.j LGT, «sin perjuicio de que dicho cumplimiento no está sometido a un
    desarrollo reglamentario concreto, tal y como sí sucede con el SIF».
- **Preguntas frecuentes de la Sede electrónica sobre sistemas de pre-facturación**: el sistema de
  pre-facturación «debe estar vinculado indefectiblemente al sistema de emisión de facturas
  formando una unidad». La misma pregunta frecuente añade que no sería legal usar «sistemas que
  generen documentos preparatorios de facturas […] sin que el sistema informático mismo disponga
  de elementos de control para la conservación de tales documentos preparatorios de forma
  debidamente vinculada a las facturas o a los registros de facturación que finalmente se
  emitan». Psicogestión cumple esta segunda parte con lo descrito en los hechos 7 y 8.
  > [Comprobar el texto literal vigente de esa pregunta frecuente el día de la presentación y
  > citar su dirección; ver `tickets/T-021/diseno.md` §P3.]

**Criterio del consultante.** Psicogestión es un sistema de gestión, no un SIF ni un componente
de facturación:

- No expide, ni gestiona, dirige o controla la expedición, porque el paso a factura lo decide y lo
  ejecuta siempre el usuario en su propio SIF (hechos 4 y 5).
- No presta ninguna de las ocho funcionalidades de la aclaración 5 (hecho 6).
- En particular, el envío del borrador no es el enlace indefectible que describe esa aclaración.
  No determina la generación de ningún registro de facturación, y que el borrador llegue a factura
  «queda a decisión del usuario».
- La vinculación «formando una unidad» que pide la pregunta frecuente se da **dentro del SIF del
  usuario**, entre su borrador y su factura. Es el supuesto de la aclaración 14.6, que pone la
  indefectibilidad a cargo del SIF que recibe los datos.
- Sus obligaciones son las del art. 29.2.j LGT sobre sus propios registros, que cumple (hecho 8).

## 3. Preguntas

1. Con los hechos descritos, **¿tiene Psicogestión la consideración de sistema informático de
   facturación** a efectos del art. 1.2 del RRSIF?
2. **¿Tiene la consideración de componente de facturación**, en el sentido del art. 1.2.b de la
   OM HAC/1177/2024, del sistema informático de facturación del usuario? En particular:
   - ¿constituye el envío de borradores por API el «enlace indefectible entre componentes» de la
     aclaración 5?
   - ¿o constituye la vinculación «formando una unidad» que la pregunta frecuente de la Sede exige
     al sistema de pre-facturación?
3. En consecuencia, **¿está el consultante, como productor de Psicogestión, obligado a la
   certificación mediante declaración responsable** prevista en el RRSIF y en la OM? ¿Puede
   resultarle aplicable el art. 201 bis LGT por la comercialización de Psicogestión en estos
   términos?
4. **¿Se limitan sus obligaciones, en este ámbito, a las del art. 29.2.j LGT** respecto de los
   registros propios de Psicogestión, incluidos los borradores enviados y no enviados?
5. Si la respuesta a la pregunta 2 o a la 3 fuera afirmativa: **¿dejaría de serlo** si, en lugar
   del envío por API, el usuario exportara de Psicogestión un fichero con los borradores y lo
   importara él mismo en su programa de facturación?

[Lugar y fecha] · [Firma]
