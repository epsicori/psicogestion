---
id: T-013
titulo: Ficha del paciente — pestañas, candado y registro de accesos
modelo: sonnet
fase: 1
prioridad: alta
depende_de: [T-006, T-007]
estado: pendiente
---

# Contexto

Hoy `/pacientes` es una lista y un formulario de alta. **No hay ficha**, y sin ficha no hay
sitio donde escribir una nota. Este ticket construye el expediente: la pantalla que el
profesional abre cuando busca a alguien, con sus cinco pestañas, el candado del PIN
delante del contenido clínico y el registro de quién lo abrió.

Es un ticket `sonnet` **con revisión de Opus**, porque toca RLS y datos clínicos. Va
sobre-especificado: aquí abajo está todo lo que en un `opus` decidiría el arquitecto.

Módulo del prototipo: **Pacientes**. Sección: `docs/interfaz.md` §Pacientes. Choques que
toca: **5** (previsualización), **7** (píldoras de estado, no riesgo), **8** (UUID en la
URL), **11** (una sola puerta a la historia y pantalla de bloqueo) y **12** (los
consentimientos, fuera del candado). ADR **026** (candado), **037** (unidad de acceso),
**043** (nada de un paciente en `use cache`), **048** (pestaña de documentos).

## Tareas

- [ ] **Ruta `/pacientes/[id]`**, con `id` **UUID** (choque 8). Jamás un nombre de paciente
      en la URL, ni en un parámetro de búsqueda.
- [ ] **Cabecera fija** de la ficha: nombre y apellidos, motivo de consulta, centro,
      antigüedad, nivel de riesgo **con su fecha de valoración**, teléfono y teléfono de
      emergencia, edad y residencia. Cada campo se pinta **solo si el rol lo puede leer**;
      un bloque sin campos legibles **desaparece entero** (choque 5).
      - El nivel de riesgo caducado se marca visiblemente: un «riesgo alto» de hace tres
        años induce a error tanto como su ausencia.
      - El teléfono de emergencia se muestra junto al indicador cuando el nivel es alto.
- [ ] **Cinco pestañas**, con la primitiva de pestañas de T-007 (nada de reescribirla
      aquí):

      | Pestaña | Contenido | Candado |
      |---|---|---|
      | Resumen | Última sesión, próxima cita, recuento de actividad | No |
      | Ficha del paciente | Contacto y gestión asistencial (centro, profesional, modalidad) | No |
      | Historia clínica | Historial · Notas clínicas · Evaluaciones · Informes | **Sí** |
      | Documentos y consentimientos | Consentimientos con la versión exacta del texto, protección de datos, adjuntos administrativos, notas históricas importadas | No |
      | Facturación | Vacío con explicación honesta hasta su ticket | No |

- [ ] **Cuatro sub-pestañas** dentro de Historia clínica, y solo cuatro (ADR-048). El
      contenido de Notas clínicas es de **T-012**: aquí se deja el armazón, la lista y el
      estado, no el editor.
- [ ] **Pantalla de bloqueo**: sin desbloqueo vigente, la sub-pestaña **se sustituye** por
      la petición de PIN, con el vocabulario de estado vacío (icono en círculo, frase en
      serif, explicación corta). **Nunca se renderiza el contenido y se tapa con una capa
      encima: si no hay desbloqueo, el componente de servidor no llega a leer la fila.**
- [ ] **Botón de bloquear** siempre visible mientras la historia está abierta, y **aviso de
      ventana a punto de caducar**. El reloj sale de `desbloqueo_vigente()`; **la tabla
      `desbloqueos_historia` no se consulta** —a `authenticated` se le retiró el `select`
      a propósito—: la interfaz necesita el reloj, no la tabla.
      - **El paso a pantalla de bloqueo es automático al agotarse la ventana, no solo por el
        botón.** El mismo reloj que avisa de la caducidad dispara el estado bloqueado en
        cuanto llega a cero, sin esperar a que el usuario pulse algo ni a que la siguiente
        Server Action falle contra RLS. Una historia abierta y olvidada en una mesa
        compartida no debe seguir legible en pantalla ni un minuto más allá de los 15 del
        ADR-026, aunque nadie la toque.
- [ ] **Registro de acceso** (ADR-037), en la **Server Action de apertura**, nunca en el
      render:
      - Una fila en `accesos_historia` por apertura, con `pestana`.
      - Las repeticiones dentro de la ventana del desbloqueo, en `accesos_historia_vistas`.
      - El contador se **lee** de `accesos_historia_resumen`; no se almacena.
      - **Abrir la lista de pacientes no es un acceso.** Las búsquedas van a `auditoria`.
- [ ] **Las píldoras describen documentación, no al paciente** (choque 7): «Al día»,
      «Nuevo», «Revisar». El nivel de riesgo es otro campo con otra política y **no se
      mezcla en la misma píldora**.
- [ ] **Lenguaje claro (ADR-054)** en la pestaña Documentos y consentimientos: el título del
      consentimiento, el botón de firmar y la frase que explica qué se firma van sin jerga
      legal. **El texto legal del propio consentimiento no se toca** — se conserva y se firma
      tal cual, verbatim; lo que se simplifica es lo que lo rodea.
- [ ] Un **`<Suspense>` con esqueleto por bloque de datos**, no uno por página, y un límite
      de error por bloque (ADR-043). **Nada de un paciente entra en `use cache`, ni
      siquiera `use cache: private`.**
- [ ] Server Components por defecto; `"use client"` solo en las pestañas y en el formulario
      del PIN.

## Criterios de aceptación (verificables)

- [ ] **Manual** — `/pacientes/<uuid>` abre la ficha; la barra de direcciones **no
      contiene** nombre, apellidos ni DNI en ningún momento del recorrido.
- [ ] **Manual** — sin PIN fijado, Historia clínica muestra la petición de PIN. En el HTML
      recibido (ver código fuente, no el inspector) **no aparece** ni un fragmento del
      contenido clínico.
- [ ] **Automático** — con desbloqueo vigente, abrir Notas clínicas escribe **una** fila en
      `accesos_historia` con `pestana = 'notas_clinicas'`; volver a entrar dentro de la
      ventana **no** añade otra, sino una fila en `accesos_historia_vistas`.
- [ ] **Automático** — abrir `/pacientes` (la lista) **no** escribe nada en
      `accesos_historia`.
- [ ] **Manual** — como `tecnico_administrativo`, `/pacientes/<uuid>` **no muestra la
      pestaña Historia clínica en absoluto** —no en gris, no deshabilitada— y la cabecera
      no enseña DNI ni domicilio.
- [ ] **Manual** — como `tecnico_administrativo`, la pestaña Documentos y consentimientos
      **sí** se abre, y **sin pedir PIN**.
- [ ] **Manual** — bloquear con el botón y comprobar que la sub-pestaña vuelve a la
      pantalla de bloqueo sin recargar a mano.
- [ ] **Manual** — dejar Historia clínica abierta sin interactuar hasta que caduque la
      ventana de desbloqueo: la sub-pestaña pasa sola a la pantalla de bloqueo, sin pulsar
      nada ni recargar.
- [ ] **Manual** — `/pacientes/<uuid>` al lado de `/prototipo`: mismo vocabulario visual,
      sin controles de adorno (nada sin dato ni acción real detrás).
- [ ] **Manual** — la misma ruta con cada rol que la pueda abrir enseña exactamente lo que
      le concede la matriz de `architecture.md` §Roles, ni un campo más.
- [ ] **Manual** — a 360 px las cinco pestañas siguen siendo alcanzables y todo objetivo
      táctil mide 44 px.
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm run dev`, entrar como profesional y abrir un paciente del seed desde la lista.
2. Recorrer las cinco pestañas. Historia clínica pide PIN; Documentos, no.
3. Meter el PIN, abrir Notas clínicas, salir a Resumen y volver: comprobar en Studio que
   `accesos_historia` tiene una fila y `accesos_historia_vistas`, dos.
4. Pulsar bloquear y comprobar que la historia se cierra.
5. Repetir el paso 2 como técnico administrativo.

## Notas para el agente

- Las primitivas de pestañas, diálogo y desplegable **ya están escritas en T-007**.
  Reutilízalas. Si falta comportamiento, se añade **allí**, nunca dentro de esta pantalla.
- La ventana del candado **se prolonga en Server Actions, jamás en el renderizado**. Un
  render que prolonga el desbloqueo es un candado que no se cierra nunca.
- No inventes columnas. Todo lo que pintes tiene que existir en `lib/supabase/tipos-bd.ts`.
- La pestaña Facturación se queda vacía **con texto honesto**, no con datos falsos ni con
  un esqueleto permanente.
- Este ticket **no** escribe el editor de notas. Es T-012.
