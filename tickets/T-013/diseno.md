# T-013 · Diseño corto

Riesgo medio. Lo que sigue no es el contrato (ese es `tickets/T-013-ficha-paciente-pestanas.md`)
sino las cinco decisiones que el contrato daba por sentadas y el esquema no confirma.

## 1 · Tres campos de la cabecera no se pueden pintar, y no es lo mismo en los tres

El contrato pide «teléfono y teléfono de emergencia, edad y residencia». Leído
`lib/supabase/tipos-bd.ts`:

| Campo | Qué hay de verdad | Qué se hace |
|---|---|---|
| Edad | `pacientes.fecha_nacimiento` | Se pinta |
| Teléfono del paciente | **No existe columna**: `telefono` solo está en `centros`, `organizacion` y `representantes_paciente` | No se pinta. Hallazgo abierto |
| Teléfono de emergencia | `representantes_paciente.telefono`, del representante vigente | Se pinta, y solo a quien puede leer esa tabla (el técnico no) |
| Residencia y DNI | `pacientes_identificacion.domicilio_cifrado` / `dni_cifrado`; `*_etiqueta` es el **tag AEAD de 16 bytes**, no una etiqueta legible, y no hay camino de descifrado escrito | No se pintan. Hallazgo abierto |

Inventar un `telefono` en `pacientes` sería una migración, y las migraciones de esta ficha no
son de esta ficha. Pintar el domicilio exigiría el descifrado, que es otro ticket.

## 2 · El nivel de riesgo y el motivo de consulta están DENTRO del candado

`valoraciones_riesgo_lectura` y `episodios_lectura` empiezan las dos por
`(select public.historia_desbloqueada())`. El contrato los pone en la cabecera fija, que está
fuera del candado. Gana la arquitectura, y además está dicho a propósito en la migración:

> «profesional y administrador leen la tabla con su política y su candado, y así el ADR-026
> sigue cubriéndola sin excepciones. Una vista que sirviera a los tres sería un segundo camino
> al riesgo por fuera del candado.»

Consecuencia visible: **la cabecera del profesional gana un bloque al desbloquear**. No se
maqueta con un hueco reservado ni con un «•••»: el bloque no está, por la misma regla del
choque 5 que hace desaparecer un bloque sin campos legibles. El técnico ve el indicador
binario de `pacientes_indicador_riesgo`, que es suyo y no lleva candado.

## 3 · Por dónde llega el contenido clínico → ADR-056

Pestaña activa en estado de cliente; el contenido de Historia clínica lo devuelve la misma
Server Action que registra el acceso. Motivo entero en `docs/decisions/ADR-056.md`: con la
pestaña en la URL, una recarga pinta historia sin escribir en `accesos_historia`.

## 4 · Dos cortes

- **Corte A (este commit)**: ruta, cabecera por rol, cinco pestañas, Historia clínica con sus
  cuatro sub-pestañas, pantalla de bloqueo, caducidad automática, registro de acceso y el
  contenido real de **Historial clínico** (episodios, diagnósticos, valoraciones) — que es lo
  único de las cuatro cuyos datos existen hoy y lo que hace demostrable que el candado tapa.
- **Corte B**: Resumen, Ficha del paciente, Documentos y consentimientos, y el texto honesto
  de Facturación.

El corte no es por tamaño: es que el corte A contiene entero el mecanismo que hay que revisar,
y el B no toca el candado ni una vez.

## 5 · El paso 3 del guion manual está mal contado

Pide «`accesos_historia` una fila y `accesos_historia_vistas`, dos» tras una sola reentrada.
Una reentrada deja **una** fila en `accesos_historia_vistas`; el contador que se lee en
`accesos_historia_resumen` vale 2 porque suma la apertura. El guion se corrige a «una fila y
una vista, contador 2».
