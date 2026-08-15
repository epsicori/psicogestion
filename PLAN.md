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
| T-000 | Paseo vertical: login → paciente → lista | `opus` | — | pendiente |

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
