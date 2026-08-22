# Plan de tickets

Objetivo de esta primera etapa: **llevar la agenda y las historias de la consulta propia
dentro del producto**, sobre la semana ocho. Todo lo demás espera.

Ejecución: `/fabrica T-XXX` por ticket, `/fabrica fase N` para encadenar.

## Leyenda

- **`opus`** — pasa por etapa de diseño con el arquitecto. Equivocarse obligaría a migrar
  datos o podría exponer información.
- **`sonnet`** — va sobre-especificado y salta el diseño.
- **Revisión con Opus** solo en tickets `opus` y en los que tocan RLS, dinero o datos
  clínicos.

---

## Paseo vertical

| ID | Título | Modelo | Depende | Estado |
|---|---|---|---|---|
| T-000 | Paseo vertical: login → paciente → lista | `opus` | — | **hecho** |

Atraviesa el stack entero con lo mínimo y **fija los patrones que luego se copian**:
sesión en Server Component, una política RLS real, un trigger de auditoría real.

## Fase 0 · Cimientos

Lo único que no se puede añadir después.

| ID | Título | Modelo | Depende | Estado |
|---|---|---|---|---|
| T-001 | Esquema base: organización, centros, perfiles, roles | `opus` | T-000 | pendiente |
| T-002 | RLS: funciones auxiliares y políticas | `opus` | T-001 | pendiente |
| T-003 | Banco de pruebas de RLS por rol | `opus` | T-002 | pendiente |
| T-004 | Auditoría por triggers, de solo adición | `opus` | T-001 | pendiente |
| T-005 | Cadena de huellas SHA-256 y su verificador | `opus` | T-004 | pendiente |
| T-006 | Autenticación completa: invitación, MFA, sesiones | `sonnet` | T-002 | pendiente |
| T-007 | Shell de navegación y tokens de diseño | `sonnet` | T-002 | pendiente |
| T-008 | Seed determinista de los tres roles | `sonnet` | T-002 | pendiente |
| T-009 | Migraciones en CI y andamiaje de i18n | `sonnet` | T-003 | pendiente |

**Se puede paralelizar**: T-004 no depende de T-002, y T-006/T-007/T-008 son
independientes entre sí una vez cerrado T-002.

**Los ADR-026 a ADR-033 se reparten aquí, no se añaden después.** Todos nacieron de la
misma pregunta —qué cuesta aplazarlos— y la respuesta era «una migración de datos». Ninguno
de estos tickets está hecho todavía, así que ahora cuestan lo que ocupan:

| ADR | T-001 esquema | T-002 RLS | T-003 pruebas | T-006 auth |
|---|---|---|---|---|
| 026 · Candado con PIN | `pines_historia`, `desbloqueos_historia` | `historia_desbloqueada()` | sin desbloqueo, cero filas | alta del PIN en la invitación |
| 027 · Anotaciones reservadas | `cuerpo` + `anotaciones_reservadas` en la versión | — | las dos entran en la huella | — |
| 028 · Menores | `representantes_paciente`, `capacidad_consentimiento()` | acceso del representante | capacidad por fecha, no bandera | N firmantes |
| 029 · DNI | `dni_cifrado` + `dni_indice` único | — | índice único rechaza el alta doble | claves en Vault |
| 030 · Pareja y familia | `episodio_participantes`, `modalidad_relacional` | por participación | nota conjunta en dos historias | — |
| 031 · Duplicados | `fusionado_en` + disparador anti-cadena | resolver por el vínculo | un solo salto, siempre | — |
| 032 · Baja del profesional | `perfiles.estado` | `es_profesional_asignado()` en baja | el saliente no lee ni lo suyo | revocar sesión, MFA y PIN |
| 033 · Centros | `politicas_retencion.centro_id` | técnico acotado a su centro | herencia resuelve, no da nulo | `centro_id` obligatorio en el técnico |
| 034 · Zona horaria | `zona_horaria` en organización y centro, validada contra `pg_timezone_names` | — | herencia resuelve; solo nombres IANA | — |
| 035 · Canonicalización | contenido canónico + `algoritmo_version` en la versión | — | **T-005**: JCS y NFC con casos feos | — |
| 036 · Borrador | borrador en la cabecera mutable | borrador bajo candado y RLS | nada entra en versiones sin firma | — |
| 037 · Accesos | tipos y contador de vistas en `accesos_historia` | — | la lista no genera acceso | — |
| 038 · Correo | — | — | — | invitación por Supabase Auth; SMTP del cliente en Vault |
| 039 · TOTP | — | — | — | TOTP los tres roles; reponer TOTP sí, PIN no |

Y los cuatro de interfaz, que caen enteros en **T-007** (armazón y tokens), con la
verificación de accesibilidad en **T-009**:

| ADR | Qué hace T-007 |
|---|---|
| 040 · Todo a mano | Primitivas compartidas en `components/ui/` (diálogo, menú, pestañas, desplegable, emergente, casilla), cada una con su lista de comprobación y su prueba de teclado |
| 041 · WCAG 2.2 AA | Verificador en el pipeline (T-009) y validador de contraste en la personalización de color |
| 042 · Tema claro | Ningún color literal en componentes; sin conmutador de tema |
| 043 · Cache Components | `cacheComponents: true` en `next.config.ts` + saneamiento de lo que bloquee el prerenderizado |
| 044 · Todo desde 360 px | Primitivas responsivas y táctiles de origen, 44 px de objetivo; sin vista degradada |

**T-007 crece, y se sabe por qué.** Los ADR-040 y 044 se decidieron el 22-08 contra la
recomendación: sin librería de componentes, las primitivas accesibles las escribimos
nosotros, y nacen además táctiles. Es trabajo de una vez, pero es trabajo. El editor de notas
y el calendario semanal, en fase 1, **se diseñan dos veces** por el mismo motivo.

**T-005** (cadena de huellas) hereda del 027 que el cómputo abarca los dos cuerpos, y del
031 que fusionar jamás recalcula una huella.

**El ADR-034 vence en fase 1, no en fase 0**: lo que entra en T-001 es la columna de zona
en organización y centro. El resto —`hora_local` en la serie, instantánea de zona en la
cita, anomalías de marzo y octubre marcadas como desviación, y la tarea de citas afectadas
cuando cambia la zona— es el ticket **«Series de citas con desviaciones»** (`opus`), y hay
que leerlo **antes** del de «Calendario: vista semanal», que es donde se formatean las
horas con `@date-fns/tz`.

## Fase 1 · Núcleo clínico

Títulos y modelo previstos. **Se redactan al llegar, no ahora**: los últimos se
escribirían sin saber lo aprendido en los primeros.

| Título | Modelo |
|---|---|
| Importador de Excel y CSV | `opus` |
| Pacientes: lista, filtros y previsualización | `sonnet` |
| Ficha del paciente y bloques reordenables | `sonnet` |
| Episodios asistenciales y valoraciones de riesgo | `sonnet` |
| Calendario: vista semanal | `opus` |
| Calendario: vistas mensual y anual | `sonnet` |
| Series de citas con desviaciones | `opus` |
| Disponibilidad, ausencias y festivos | `sonnet` |
| Notas clínicas versionadas y selladas | `opus` |
| Avisos de documentación escalados | `sonnet` |
| Registro de accesos a historia | `opus` |

## Fuera de alcance ahora

Facturación y Verifactu, firmas, informes, recordatorios `wa.me`, plano de control
multi-instancia y despliegue a Vercel. Vuelven cuando la fase 1 esté en uso real.
