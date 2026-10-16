# Plan de puesta en marcha · consulta propia antes de fin de 2026

> Aprobado el 16-10-2026 tras la entrevista con el propietario. Resumen en `PLAN.md` §Puesta en marcha; cada fila se convierte en ticket al llegar.

## Lo que se decidió en la entrevista

| Tema | Decisión |
|---|---|
| **Primer usuario** | Solo la consulta del propietario. Los testers, que pueden tener más de 100 pacientes, van en una etapa posterior, cada uno con su instancia y su contrato del art. 28. |
| **Fecha** | Pacientes reales **antes de fin de 2026**. |
| **Piezas del primer día** | Las cinco: importador, disponibilidad y festivos, recordatorios wa.me, firmas e informes. |
| **Origen de los datos** | Vienen de varios sitios: un Excel propio, Google Calendar (`.ics`) y Doctoralia (CSV). Lo que está en papel se da de alta a mano. |
| **Qué se importa** | Pacientes con su contacto, las citas futuras, el historial de citas y las notas antiguas, estas **como documento adjunto y nunca como nota firmada** (decisión 15). Las tarifas por paciente no se importan. |
| **Volumen** | Menos de 100 pacientes en la consulta propia. El importador tiene que aguantar varios cientos para los testers. |
| **Disponibilidad** | Varía por centro: días y franjas distintos en cada uno. |
| **Festivos** | Nacionales, autonómicos y locales (pueden variar por centro), vacaciones del profesional y cierres de centro. |
| **Fuera de horario o en festivo** | **Avisa y deja agendar.** Las sugerencias de hueco nunca lo proponen. |
| **Calendario del profesional** | Las citas aparecen en el calendario del móvil del profesional, como en Doctoralia, **sin nombre del paciente**: «Cita · centro · modalidad» y un enlace a la app. Se arranca con una suscripción `.ics`. |
| **Recordatorios** | Hoy se mandan a mano por WhatsApp. La app tendrá una **lista diaria** y además un **botón en cada cita**. Por defecto, **48 h antes con dos enlaces de un solo uso, «Confirmo» y «No puedo ir»**. La antelación la personaliza cada profesional. |
| **Firmas del primer día** | Consentimiento informado, asistencia por cita y rúbrica del profesional en los informes. La firma cualificada eIDAS y los periciales quedan para después. |
| **Dispositivo del paciente** | **Tablet con lápiz, en consulta.** El trazo se guarda como prueba, unido a la huella del documento. **No se usa para identificar a nadie**: así no es dato biométrico de categoría especial. El propietario lo confirma con su asesor de protección de datos. |
| **Consentimientos** | **Varios modelos por caso**: adultos, menores (firman los tutores), pareja y online, versionados. |
| **Informes** | **Plantilla y texto libre**: la app rellena la cabecera, el paciente y las sesiones, el profesional escribe el cuerpo, y sale un PDF con su rúbrica. También el **justificante de asistencia**. |

## Etapas y tickets

Los números son una propuesta. El riesgo sigue la regla de `CLAUDE.md`.

### Etapa 0 · en curso
| Ticket | Qué | Riesgo |
|---|---|---|
| T-047 | Vista anual de la agenda (ronda 2) | alto |
| T-051 | Siembra de bonos | bajo |
| T-052 | Foco y desborde en `/facturacion` | medio |

### Etapa 1 · que se pueda usar con datos reales
| Ticket | Qué | Riesgo |
|---|---|---|
| **T-053** | **H25**: hoy el técnico deduce qué pacientes son pareja a través de `episodio_id` en la auditoría. Es el único hallazgo marcado «bloquea producción». | alto |
| **T-054** | **Despliegue de la instancia propia**. Incluye: Supabase en París y Vercel `cdg1`; migraciones desde cero; MFA obligatorio; claves en Vault; copias de seguridad y su prueba de restauración; dominio y correo de Auth; guion de alta de la instancia. | alto |

### Etapa 2 · el día a día
| Ticket | Qué | Riesgo |
|---|---|---|
| **T-055** | **Disponibilidad por centro**: franjas semanales por profesional y centro, con vigencia. El alta avisa fuera de horario y las sugerencias se ajustan. | alto (esquema) |
| **T-056** | **Festivos y ausencias**: nacionales, autonómicos y locales por centro, vacaciones del profesional y cierres de centro. Comparten el mismo aviso que T-055. | alto (esquema) |
| **T-057a** | **Importador · pacientes**: Excel propio y CSV de Doctoralia. Columnas con mapeo, previsualización, duplicados por DNI normalizado (ADR-029) y reimportación idempotente. Un informe de qué entró y qué no. | alto |
| **T-057b** | **Importador · citas**: futuras e historial, desde `.ics` de Google Calendar y desde Doctoralia. Casa cada cita con su paciente. Las importadas nunca generan notas. | alto |
| **T-057c** | **Importador · notas antiguas como documento**: adjuntos en la ficha, marcados como importados, fuera de la cadena de notas firmadas. | alto |
| **T-058** | **Recordatorios wa.me**: lista de las citas por recordar y botón en la cita. La antelación es configurable, 48 h por defecto. Incluye los enlaces firmados de un solo uso, que van a una ruta pública: confirmar o anular, con caducidad y auditoría. | alto (ruta pública) |
| **T-062** | **Calendario del profesional en su móvil**: una suscripción `.ics` privada y revocable por profesional, que vale para Google, Apple y Outlook. Cada evento lleva solo «Cita · centro · modalidad» y un enlace a la cita en la app, que pide inicio de sesión. **Ningún dato del paciente sale de la app.** El token se guarda con huella, se puede revocar y queda auditado. Google tarda horas en refrescar estas suscripciones: si en el uso real molesta, se pasa al envío inmediato por la API de Google (ver «Después»). | alto (ruta pública con token) |

### Etapa 3 · firmas e informes
| Ticket | Qué | Riesgo |
|---|---|---|
| **T-059** | **Consentimientos versionados** por modelo (adulto, menor con tutores, pareja, online) y su **firma en tablet**. El punto de partida es el `SignaturePad` del prototipo Rúbrica. Se guarda el trazo, la huella del documento, la hora y la auditoría. | alto |
| **T-060** | **Firma de asistencia** por cita, en la misma pieza de firma. | alto |
| **T-061** | **Rúbrica del profesional e informes**: plantilla y texto libre, PDF en servidor (React-PDF) y justificante de asistencia. | alto |

### Después de la puesta en marcha
- Firma cualificada eIDAS e informes periciales.
- Envío inmediato de las citas a Google Calendar por su API, con eventos sin datos del paciente, si el retraso de la suscripción `.ics` molesta. Exige pasar la verificación de Google para el permiso de calendario: sin ella, la conexión caduca cada 7 días.
- Holded: T-026b y T-025, a la espera de sus respuestas.
- Testers: alta de instancia por cliente, contrato del art. 28 e importador probado con más de 100 pacientes.
- Hallazgos medios antiguos: T-039, T-040 y T-021.

## Calendario orientativo (hoy: 16-10-2026)

| Semanas | Etapa |
|---|---|
| 16-10 a 25-10 | Etapa 0 cerrada; T-053 |
| 26-10 a 08-11 | T-054 despliegue; T-055 y T-056 |
| 09-11 a 29-11 | T-057a, b y c; T-058; T-062 |
| 30-11 a 13-12 | T-059, T-060 y T-061 |
| 14-12 a 20-12 | Ensayo general: importación real en la instancia de producción, una semana en paralelo con el sistema actual |
| **21-12** | Arranque con pacientes reales, si el ensayo sale limpio |

Hay margen de una semana. Si algo se retrasa, la etapa 3 es la única que admite un arranque parcial, con consentimiento y asistencia en papel durante unos días. Las demás no.

## Lo que necesito del propietario (bloquea tickets)

1. **Un fichero de ejemplo anonimizado de cada fuente**: tu Excel, el CSV de pacientes de Doctoralia, el de citas de Doctoralia si existe, y un `.ics` de Google Calendar. Sin ellos no se puede escribir T-057. Cambia los nombres por inventados y deja las columnas tal cual.
2. **Los textos de los consentimientos** de cada modelo. Son contenido legal tuyo, no de la app. Bloquea T-059.
3. **Horario por centro y festivos locales** de tus centros, para sembrar y probar T-055 y T-056.
4. **Confirmación del asesor de protección de datos** sobre guardar el trazo de la firma. Bloquea T-059.
5. **Dominio y cuentas** de Supabase y Vercel a tu nombre, para T-054.
