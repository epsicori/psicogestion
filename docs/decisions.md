# Decisiones (ADR)

22 decisiones cerradas el 15-08-2026. Cada una con su § en `documento-maestro.html` por
si hace falta el razonamiento completo. **Un ticket que contradiga una de estas se para
y se escala al usuario** (regla de escalado de la fábrica).

## Fundacionales

| # | Decisión | Consecuencia | § |
|---|---|---|---|
| 1 | **Instancia dedicada por cliente** | Sin `organizacion_id` en las filas; `organizacion` tiene una sola fila. Hará falta un plano de control a partir del tercer cliente | §1, §3.2 |
| 2 | **Verifactu desde el diseño**, modo VERI\*FACTU | Facturas inmutables con huella encadenada, QR y remisión a AEAT. No existe «editar factura» | §1, §2.3 |
| 3 | **Next.js App Router + TypeScript** | Server Components: los historiales no viajan al cliente. Tipos de la BD generados por Supabase | §1, §3.1 |
| 4 | **Cifrado de exportaciones con clave del usuario** | Argon2id + AES-256. La contraseña no se persiste jamás. Sin recuperación posible | §1, §5.4 |

## De alcance

| # | Decisión | Consecuencia | § |
|---|---|---|---|
| 5 | Administrador **no** lee notas ajenas | Acceso de emergencia con justificación, caducidad, auditoría destacada y aviso al titular | §5.1 |
| 6 | Técnico administrativo ve **solo indicador binario** de riesgo | Columna derivada, nunca el dato. RLS propia sobre `valoraciones_riesgo` | §5.1 |
| 7 | **CIE-10-ES** + campo paralelo DSM-5-TR | Dos columnas en `diagnosticos`; catálogo precargado | §10 |
| 8 | Retención **25 años** configurable | Solo el administrador la cambia; mínimos legales bloqueados por debajo | §5.7 |
| 9 | Firma en **dos capas** | Rúbrica manuscrita (visible) + cualificada eIDAS (jurídica). Justificada por los informes periciales, que van a juzgados | §2.6, §6.7 |
| 10 | **Firma del paciente en consulta** | Asistencia por cita + consentimientos versionados. Se guarda la **versión exacta del texto firmado** | §6.7 |
| 11 | Recordatorios por **`wa.me`** | No es una API: la app redacta y una persona envía. Ningún encargado del tratamiento nuevo. Los dos botones se emulan con enlaces firmados de un solo uso | §2.7, §6.8 |
| 12 | **Sector público aparcado** | La conformidad ENS no alcanza a Supabase ni a Vercel. Se diseña compatible, no se certifica | §2.5 |
| 13 | Portal del paciente **fuera de v1** | `accesos_historia` lo deja preparado para v2 sin migrar nada | §10 |
| 14 | Precio: **base por instancia + tramo por usuario** | — | §10 |
| 15 | **Importador Excel/CSV en v1** | Las notas históricas se adjuntan como documento, **nunca** como notas firmadas: una importación no puede fabricar autor, fecha ni huella | §6.9 |
| 16 | Lo construye **una persona con IA** | Ruta corta de §8.1; el calendario a medida es la mayor inversión de la fase 1 | §8 |
| 17 | **Solo castellano** en v1 | Andamiaje de i18n desde la fase 0, sin traducir | §10 |
| 18 | **La clínica es responsable; nosotros encargados** | Hace falta contrato propio del art. 28 RGPD para poder vender | §2.1 |
| 19 | **Series de citas con excepciones** | La serie guarda la intención, las citas los hechos. Al editar: «¿solo esta o esta y las siguientes?». Nunca «todas» | §6.2 |
| 20 | **Calendario a medida** sobre date-fns | Regla general: se integra lo invisible, se construye lo que el usuario mira a diario | §3.5 |
| 21 | **Tarifa por tipo + excepción por paciente** | `tarifas_paciente` con importe, motivo y vigencia | §6.4 |
| 22 | **El primer usuario es la consulta propia** | Dentro de cada fase, primero lo que se usa a diario | §8 |

## Elecciones técnicas menores

Región París (`eu-west-3`, no Fráncfort, por latencia desde España) · React-PDF en
servidor (no Chrome sin interfaz) · react-hook-form + Zod compartido cliente/servidor ·
TanStack Table · Server Actions por defecto · MFA obligatorio para administrador y
profesional · sesión de 30 min de inactividad · Vault de Supabase para claves de columna.

---

## Plantilla para decisiones nuevas

```markdown
## ADR-XXX · Título
**Fecha** · **Estado**: propuesta | aceptada | revertida
**Contexto**: qué problema obliga a decidir.
**Decisión**: qué se hace.
**Consecuencias**: qué se gana, qué se pierde, qué queda bloqueado.
```
