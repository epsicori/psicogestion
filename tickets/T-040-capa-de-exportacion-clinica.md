---
id: T-040
titulo: Capa de exportación clínica — copia cifrada de la nota con todas sus versiones
modelo: opus
riesgo: alto
fase: 1
prioridad: alta
depende_de: [T-012]
estado: pendiente
territorio:                           # provisional: lo cierra el diseño (§territorio)
  - supabase/migrations/*_exportaciones.sql   # cola de un solo dueño
  - scripts/rls/*-exportaciones.sql
  - scripts/rls/README.md
  - scripts/rls/11-cobertura.sql
  - lib/supabase/tipos-bd.ts          # solo regenerado con `npm run tipos`
  - lib/exportaciones/**
  - lib/i18n/es.ts
  - app/(app)/pacientes/[id]/historia/**
  - accesibilidad/**
  - docs/architecture.md
  - docs/decisions/ADR-0*.md          # el ADR de cifrado (nuevo, no se edita ninguno existente)
  - docs/decisions.md
  - docs/decisions/INDEX.md
---

# Contexto

La tarea «La descarga incluye todas las versiones, en orden, con sus autores y fechas» sale de
T-012 por decisión del propietario (02-10-2026, Q-C1 = D-a en `tickets/T-012/diseno.md`
§Decisiones del propietario sobre el corte C). Descargarla en texto plano chocaría con dos
cosas cerradas:

- **Decisión fundacional 4**: las copias descargables van cifradas con la contraseña del usuario
  (Argon2id + AES-256; la contraseña no se guarda, sin recuperación). Ver `docs/decisions/fundacionales.md`.
- **ADR-049** y `docs/architecture.md` §EEDS: toda exportación clínica sale por una capa propia
  con formato versionado (`exportaciones`), nunca por un `select` en la pantalla. ADR-049 y
  ADR-032:75 dan esa capa por existente. **No existe**: ni la tabla ni el código.

Este ticket construye esa capa, con la nota clínica como primera salida.

Referencias: ADR-027 (dos cuerpos; las reservadas no van al paciente; la salida judicial lleva
su traza), ADR-030 (nota conjunta: no se entrega entera en un acceso individual), ADR-032
(el profesional que se va se lleva una exportación cifrada), ADR-049, decisión fundacional 5
(el administrador no lee notas ajenas salvo acceso justificado, auditado y avisado), Ley 41/2002
arts. 16.3, 16.4, 16.5 y 18.3.

## Quién puede pedir la copia (decidido por el propietario, 02-10-2026, Q-C2)

| Quién | Cuándo | Qué recibe |
|---|---|---|
| Autor de la nota o profesional asignado | Cuando quiera; nunca desde lectura conjunta | Copia profesional: todas las versiones, con reservadas |
| Administrador | Solo eligiendo un motivo cerrado | Según el motivo (abajo) |

Motivos del administrador:
- **Petición del paciente** (derecho de acceso): proyección del paciente, **sin reservadas**
  (art. 18.3) y con las conjuntas recortadas (ADR-030).
- **Requerimiento judicial o inspección** (arts. 16.3 y 16.5): copia completa.
- **Traspaso del caso**: copia completa.

Toda copia del administrador deja fila en `accesos_historia` con su motivo, entra en la
auditoría destacada y **avisa al profesional titular**. El técnico administrativo no exporta.

## Tareas

- [ ] **ADR de cifrado** que reconcilie Argon2id (decisión 4, documento maestro §5.4) con un
      fichero que abra un lector estándar sin instalar nada, o que diga por qué no se puede y qué
      se entrega en su lugar.
- [ ] **Tabla `exportaciones`**, de solo adición: quién, cuándo, alcance (paciente, nota,
      versiones), proyección, motivo, `formato_version`, algoritmo y huella del fichero. Nunca
      la contraseña ni el fichero en claro.
- [ ] **RLS y funciones** que impongan la tabla de arriba **en la base**, no solo en la pantalla.
- [ ] **Proyecciones** en `lib/exportaciones/`: profesional/judicial (con reservadas) y del
      paciente (sin reservadas, conjuntas recortadas). Cada versión con su número, autor, fecha,
      motivo de cambio, sello de sesión y huella, en orden.
- [ ] **Entrega**: el fichero sale una vez, de vida corta; no queda en claro en el servidor.
- [ ] **Aviso al titular** cuando exporta el administrador.
- [ ] **Botón «Descargar»** en la vista de la nota (`historia/notas`), solo para quien la tabla
      de arriba deja, con el candado abierto, y el formulario de motivo para el administrador.

## Criterios de aceptación (verificables)

- [ ] **Automático** — el autor y el asignado exportan; un profesional sin asignación, el
      técnico y quien lee por episodio conjunto reciben error **desde la base**, no solo desde la acción.
- [ ] **Automático** — el administrador sin motivo recibe error; con motivo «petición del
      paciente», la copia **no contiene** ningún texto de `anotaciones_reservadas`.
- [ ] **Automático** — cada exportación deja una fila en `exportaciones` y otra en
      `accesos_historia`; `update` y `delete` sobre `exportaciones` como `postgres` **fallan**.
- [ ] **Automático** — la copia lleva todas las versiones en orden, y la huella de cada una
      coincide con la de `notas_clinicas_versiones`.
- [ ] **Automático** — ni la contraseña ni el fichero en claro quedan en la base, en Storage
      ni en los registros del servidor.
- [ ] **Automático** — la exportación del administrador crea un aviso para el profesional titular.
- [ ] **Manual** — descargar una nota con dos versiones y abrir el fichero con la contraseña,
      con la herramienta que diga el ADR.
- [ ] **Manual** — la misma vista con cada rol enseña el botón solo a quien la tabla deja.
- [ ] **Automático** — `npm run lint && npm run build` limpios; `test:rls` verde.

## Guion de comprobación manual

1. Como profesional asignado, abrir una nota con dos versiones, pulsar «Descargar», poner contraseña.
2. Abrir el fichero con esa contraseña: dos versiones, en orden, con reservadas.
3. Como administrador, intentar descargar sin motivo (no deja); con «Petición del paciente», sin reservadas.
4. Como el profesional titular, ver el aviso.

## Notas para el agente

- **El diseño va primero** (`tickets/T-040/diseno.md`), y el ADR de cifrado antes que el código.
- La cola de `supabase/` es de un solo dueño: este ticket entra en ella tras los que ya esperan
  (ver `docs/state.md` §Siguiente paso).
- Abiertos para el diseño: si el motivo del administrador lleva también texto libre; si el aviso
  sale por `notificaciones`; si la cabecera identifica al paciente por nombre o solo por UUID.
- Lo decidido en `tickets/T-012/diseno.md` C.1.7 sobre el contenido de la copia vale aquí.
