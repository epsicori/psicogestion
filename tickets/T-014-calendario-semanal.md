---
id: T-014
titulo: Calendario — vista semanal, estados y ficha de cita
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-011, T-011b, T-007]
estado: pendiente
territorio:
  - supabase/migrations/*_agenda_citas_rango.sql
  - lib/supabase/tipos-bd.ts
  - scripts/rls/18-agenda-rango.sql
  - scripts/rls/README.md
  - lib/citas/**
  - lib/agenda/mes.ts
  - lib/agenda/mes.test.ts
  - lib/fechas/calendario.ts
  - lib/fechas/calendario.test.ts
  - app/(app)/agenda/**
  - app/page.tsx
  - app/globals.css
  - lib/i18n/es.ts
  - lib/contraste/tokens.ts
  - components/ui/dialogo.tsx
  - components/ui/dialogo.test.tsx
  - components/ui/estado-cita.tsx
  - components/ui/estado-cita.test.tsx
  - components/ui/panel-anclado.tsx
  - components/ui/panel-anclado.test.tsx
  - components/ui/colocacion.ts
  - components/ui/colocacion.test.ts
  - components/ui/rejilla-foco.ts
  - components/ui/rejilla-foco.test.tsx
  - components/armazon/modulos.ts
  - components/armazon/modulos.test.ts
  - docs/interfaz.md
---

# Contexto

Es la pantalla que el usuario mira cuarenta veces al día, y la puerta de entrada del
recorrido de nota en presencial: aquí se ve que una sesión está en curso y desde aquí se
salta a escribirla.

Va a mano sobre `date-fns` (decisión 20): ninguna librería da la leyenda de avisos ni las
series sin pelearse con ella en cada decisión, y con el ADR-040 tampoco hay librería de
componentes debajo.

Módulo del prototipo: **Agenda**. Sección: `docs/interfaz.md` §Agenda. Choques que toca:
**3** (la nota de la cita es logística) y **4** (el técnico no ve el tipo de terapia). ADR
**045** (cinco estados, «en curso» calculado), **047** (el estado late, no parpadea),
**034** (formateo en servidor con `@date-fns/tz`), **044** (360 px), **041** (WCAG).

## Tareas

- [ ] **Rejilla semanal a mano**: tira de días, franjas horarias, filtros de centro y
      profesional. Horas en **monoespaciada**; **franja de color 1×10 por profesional**;
      `tipo · profesional · modalidad`, centro y sala.
- [ ] **Estados con color, forma y etiqueta** — nunca solo color (ADR-047, sistema de
      diseño):

      | Estado | Forma | Etiqueta |
      |---|---|---|
      | Programada | Punto hueco, gris | «Programada» |
      | Confirmada | Punto hueco con contorno reforzado, gris | «Confirmada» |
      | **En curso** *(calculado)* | **Punto relleno con halo y pulso** | «En curso» |
      | Realizada | Punto relleno | «Realizada» |
      | Cancelada | Punto tachado, rojo | «Cancelada» |
      | No asistió | Punto partido, ámbar | «No asistió» |

- [ ] **El pulso lo lleva solo la cita en curso** (ADR-047): ciclo ≈2 s de opacidad y halo,
      **sin encendido y apagado**, un único elemento animado en pantalla,
      `prefers-reduced-motion` lo detiene y deja el punto relleno. La leyenda lateral
      explica los seis.
- [ ] **«En curso» se calcula en servidor** con `esta_en_curso()` (T-010) y baja resuelto,
      igual que el saludo del armazón. **Ni un `new Date()` en cliente** para el primer
      pintado: hidratación, y el navegador está en la zona del usuario, no en la del centro.
- [ ] **Clic en una cita → panel lateral** sobre `bg-secondary` con pico, con: horario y
      duración, tipo, profesional, centro y sala, **nota operativa** (logística, choque 3) y
      el estado con su etiqueta.
- [ ] **Dos niveles de clic, y la celda no es un botón.** El día y la cita son dos objetivos
      distintos, así que la celda del calendario va como `div` con `role="gridcell"` y
      dentro llevan foco propio **el número del día** y **cada cita**. Una celda-botón con
      las citas pintadas encima no admite el segundo nivel: no se anida botón en botón.
      - **Clic en una cita** (en cualquier vista) → panel de la cita, directo.
      - **Clic en el día** o en el hueco de la celda → panel del día con su lista ordenada
        por hora; **cada fila de esa lista es a su vez un botón** que abre el panel de la
        cita. La lista del día **no adelanta** nada que el panel de la cita no pueda
        enseñar: mismo recorte por rol, misma omisión del tipo de terapia (choque 4) y
        ninguna nota clínica (choque 3).
      - El `+N más` de una celda llena abre el panel del día, no otro menú.
- [ ] **Botón «Notas»** en el panel, que lleva a
      `/pacientes/<uuid>/historia/notas?cita=<uuid>` (la ruta de T-012, la misma que desde
      la ficha).
      - Con la sesión **en curso**: botón primario, sin más.
      - Con la sesión **terminada y sin nota firmada**: el mismo botón, más el aviso de que
        la nota es obligatoria y desde cuándo está pendiente. **El aviso informa; no
        bloquea nada.**
- [ ] **El técnico administrativo no ve el tipo de terapia** (choque 4): la fila **omite**
      la columna, no la tacha ni la enseña en gris. Se lee de la vista de T-010, no
      filtrando en la consulta.
- [ ] **Arrastrar para reprogramar**, con confirmación explícita y registro en auditoría.
      Sobre una cita de serie, la pregunta es **«¿solo esta, o esta y las siguientes?»**
      (T-011). La cita queda **marcada como desviada**.
      - **ADR-068**: al mover una cita de serie sale un diálogo que pregunta si **se mantiene
        la serie** (solo se mueve esta cita) o **se modifica desde esta cita** (esta y las
        siguientes), y en la segunda opción dice **en palabras en qué se convierte la serie**
        («las siguientes pasarán a ser el 3.er jueves de cada mes»), con el recorte cuando
        aplique. El texto sale de `agenda_previsualizar_edicion_serie` (T-011b); la regla no
        se reimplementa en TypeScript.
      - Una propuesta de «Por confirmar» que ya no vale **no se descarta sola**: al
        confirmarla, la base la rechaza y la pantalla enseña el motivo (ADR-068, punto 1).
- [ ] **El calendario distingue la cita de serie de la suelta y marca la desviada.** Sin
      eso, mover una cita da miedo.
- [ ] **La vista mensual tiene forma acordada** (`docs/state.md` § Sistema de diseño ·
      Agenda): rejilla 6×7 con **lunes primero**, celdas de mes vecino atenuadas pero
      navegables, hasta tres
      citas por celda con `hora + nombre corto` y `+N más` para el resto, y a 360 px las
      citas colapsan a puntos de estado con el recuento del día. Cambiar de vista
      **conserva la fecha enfocada**.
- [ ] **El panel se ancla al elemento y se recoloca solo**: mide su alto, elige arriba o
      abajo según el hueco disponible, se recorta a los límites del calendario y el pico
      sigue apuntando al día o a la cita que lo abrió. Un panel que se sale por el borde en
      la última fila del mes es el fallo típico de este patrón.
- [ ] **A 360 px no es una semana estrechada** (ADR-044): día con desplazamiento lateral o
      lista por franjas, **conservando la misma información y las mismas acciones**. La
      forma se decide en este ticket, **mirándola en un teléfono real**, y se anota la
      elección con su motivo.
- [ ] **Teclado completo y ARIA propia**: mover el foco por días y por citas, abrir el panel
      con Intro, cerrarlo con Escape, y devolver el foco a la cita al cerrar.
      - La rejilla se recorre con las flechas **entre días**; **Tab** entra a las citas del
        día enfocado y sale de ellas. Un solo día en el orden de tabulación (`tabindex`
        `0`/`-1` rodante), no cuarenta y dos.
      - Del panel del día se llega a la cita con Intro sobre su fila, y **Escape devuelve el
        foco al escalón anterior**: de la cita al día, del día a la celda.
- [ ] **Agenda absorbe Inicio y Clínica** (ADR-050): panel derecho con citas próximas,
      pendientes y **documentación pendiente** con su nivel de escalado, y cuadro inferior
      con adherencia, abandono, ingresos y trazabilidad documental. **El técnico
      administrativo no ve el cuadro inferior** (choque 6). La bandeja sale de
      `alertas_documentacion` y nunca enseña contenido clínico (choque 11).
- [ ] **`app/page.tsx` redirige a `/agenda`**: es la pantalla de entrada, no `/pacientes`.
- [ ] `disponible: true` para **Agenda** en `components/armazon/modulos.ts` — única edición
      que este ticket hace en el armazón.

## Criterios de aceptación (verificables)

- [ ] **Manual** — con una cita que abarque el instante actual, se ve verde, con punto
      latente y etiqueta «En curso»; **ninguna otra cita late**.
- [ ] **Manual** — con «reducir movimiento» activado en el sistema, el punto **se queda
      quieto** y la etiqueta y el color siguen ahí.
- [ ] **Manual** — en blanco y negro (imprimir a PDF en escala de grises), los seis estados
      siguen distinguiéndose.
- [ ] **Manual** — clic en la cita en curso abre el panel; «Notas» lleva al editor y pide
      PIN.
- [ ] **Manual** — en la vista mensual, clic en una cita abre **el panel de la cita**, y
      clic en el hueco del mismo día abre **el panel del día**; desde una fila de ese panel
      se llega a la misma cita.
- [ ] **Manual** — el panel abierto desde una cita de la **última fila** del mes y desde la
      **última columna** queda entero dentro de la pantalla, con el pico apuntando a ella.
- [ ] **Manual** — una cita de ayer, `realizada` y sin nota firmada, muestra el aviso de
      nota obligatoria en su panel, con los días que lleva pendiente.
- [ ] **Manual** — como `tecnico_administrativo`, ninguna fila muestra tipo de terapia y el
      panel no enseña la nota operativa clínica de nadie.
- [ ] **Manual** — arrastrar una cita de serie pregunta «¿solo esta, o esta y las
      siguientes?» y **nunca ofrece «todas»**, ni siquiera desactivada.
- [ ] **Manual** — en ese diálogo, la opción de modificar la serie dice en palabras en qué se
      convierte («el 3.er jueves de cada mes a las 10:00»). En una serie mensual llevada a un
      5.º jueves avisa de los meses que no lo tienen. Al aceptar, se mueve la cita arrastrada y
      las demás quedan en «Por confirmar».
- [ ] **Manual** — confirmar en «Por confirmar» una propuesta que ya no vale (por ejemplo, la
      de una cita movida a mano después) enseña el motivo, no mueve nada y deja la propuesta
      en la lista hasta que se descarta.
- [ ] **Manual** — a 360 px la semana se reorganiza, y **toda** acción disponible en
      escritorio sigue disponible. Ningún objetivo táctil por debajo de 44 px.
- [ ] **Manual** — recorrido completo con teclado, sin ratón, con foco visible siempre.
- [ ] **Manual** — `/agenda` al lado de `/prototipo`: mismo vocabulario visual, sin
      controles de adorno.
- [ ] **Automático** — `disponible: true` para Agenda en `components/armazon/modulos.ts`.
- [ ] **Automático** — `npm test` cubre la frase de la serie (semanal, quincenal, mensual y
      «último» con recorte) y el mapeo de los fragmentos de rechazo de T-011b, cotejados con
      el texto de su migración.
- [ ] **Automático** — `npm run lint && npm run build` limpios, y el verificador de
      accesibilidad de T-009 en verde.

## Guion de comprobación manual

1. `npm run dev` y ajustar una cita del seed para que abarque la hora actual.
2. Abrir `/agenda`: comprobar el punto latente y que es el único.
3. Activar «reducir movimiento» y recargar.
4. Clic en la cita → panel → «Notas» → PIN.
5. Estrechar a 360 px y repetir los pasos 2 y 4.

## Notas para el agente

- **`@date-fns/tz`** (`TZDate`, `tz`), no `date-fns-tz`. Ese es el de v2/v3 y no está
  instalado.
- Lee **T-011 antes que este ticket**. Las horas que aquí se formatean vienen de allí, y
  una cita desviada por anomalía horaria tiene que pintarse como lo que es.
- El malva es **selección**, no un estado. Lo seleccionado va en `bg-secondary`.
- Las píldoras de estado del vocabulario son tres —`success`, `info`, `warning`—; los seis
  estados de cita se resuelven con **punto + etiqueta**, no metiendo píldoras nuevas.
- Este ticket **no** escribe el aviso de sesión en curso ni la campana. Es T-015.
