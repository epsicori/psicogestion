---
id: T-028
titulo: Alta de cita — sugerencias, serie y conflicto (pantalla)
modelo: sonnet
fase: 1
prioridad: alta
depende_de: [T-010, T-011, T-013, T-014]
estado: pendiente
---

# Contexto

**La pantalla de alta de cita no existe en el plan.** `docs/interfaz.md` §Agenda la nombra
una sola vez —«Acción primaria: **Nueva cita**»— y ahí se acaba: T-010 deja el esquema,
T-011 escribe las Server Actions de crear serie, desplazar y cancelar, y T-014 dibuja el
calendario y el panel de la cita **que ya existe**. Nadie dibuja el formulario que la crea.
Este ticket lo dibuja, y es el único sitio del producto donde se decide una serie completa.

Tiene **dos entradas y una sola pantalla**:

1. Desde **Agenda**, con la acción primaria, sin paciente elegido.
2. Desde la **ficha del paciente**, pestaña **Resumen** —la que ya enseña «próxima cita» y
   está **fuera del candado** (T-013)—, con el paciente ya fijado.

Módulo del prototipo: **Agenda**. Sección: `docs/interfaz.md` §Agenda y §«Lo que el
prototipo no cubre», donde **«Series de citas»** está en la lista: el prototipo pinta citas
sueltas, así que **no vale «mira el prototipo»** para la mitad importante de esta pantalla.

Choques que toca: **3** (la nota de la cita es logística) y **4** (el técnico administrativo
no ve el tipo de terapia). ADR **049(c)** —la sugerencia de hora es determinista,
explicable y **ya tiene algoritmo decidido**—, **034** (hora local + zona en la serie),
**045** (los cinco estados), **041** y **047** (nunca solo color), **044** (360 px),
**026** (agendar es logística y **no pide PIN**), **054** (lenguaje claro, y aquí **no
aplica**: esta pantalla no habla al paciente).

Va **sobre-especificado** porque es `sonnet`. **Revisión con Opus solo si acaba escribiendo
una consulta propia sobre `citas`**; si se limita a leer la vista de agenda de T-010 —que es
lo que debe hacer—, cierra con verificador, lint y build.

## Tareas

### Ruta y armazón

- [ ] **Ruta propia, no un diálogo suelto**: `/agenda/nueva`, que acepta `?paciente=<uuid>`
      y `?inicio=<iso>` para llegar con el paciente o el hueco ya elegidos. Enlazable y
      recargable: si el usuario recarga, la pantalla sigue existiendo con el mismo estado.
- [ ] **Desde la ficha se abre encima de la ficha**, sin perder el sitio, pero la **ruta es
      la fuente de verdad**. Sobre el diálogo: foco atrapado, Escape cierra, y al cerrar el
      foco vuelve al botón que lo abrió.
- [ ] **Agendar no pide PIN** (ADR-026) y **el diálogo no hereda ni un dato de Historia
      clínica** aunque el desbloqueo esté vigente en esa sesión. Ni en la cabecera, ni en un
      resumen, ni en una razón de sugerencia. Si algo del episodio aparece aquí, el candado
      se ha vaciado sin que nadie lo note.

### Sugerencias

- [ ] **Tres sugerencias, calculadas en servidor**, con el algoritmo que el **ADR-049(c) ya
      fija**: la **moda del intervalo de las seis últimas citas**, cruzada con día y franja
      habituales. **No se inventa un motor de puntuación nuevo**: cinco factores ponderados
      con pesos configurables serían una reapertura del ADR, no una mejora.
- [ ] **Sin cifra de puntuación en pantalla.** Ni `92`, ni estrellas, ni barras. Una
      puntuación es un artefacto interno: enseñarla invita a discutirla y finge una
      precisión que no existe. Lo que se enseña es **el motivo**, que es lo que el ADR pide
      por explicabilidad.
- [ ] **Los motivos se escriben en tercera persona y sobre el dato**, no en segunda persona
      al paciente: «Como las seis últimas», «Martes a las 12, su día habitual», «Primer
      hueco libre». Quien opera la pantalla es recepción o el profesional.
- [ ] **Arranque en frío**: un paciente sin historial suficiente **no tiene hora habitual**.
      Las tarjetas degradan a «primeros huecos libres» y **lo dicen con esas palabras**.
      Fingir confianza el primer día es cómo se pierde el segundo.
- [ ] **Ni un `new Date()` en cliente** para el primer pintado: las sugerencias, las horas y
      los motivos bajan resueltos desde servidor, en la zona del centro (ADR-034).

### El calendario de selección

- [ ] **Es la vista semanal de T-014 en modo selección, no un calendario nuevo.** Mismo
      componente, mismo vocabulario visual, misma navegación de teclado (flechas entre días,
      Tab dentro del día). Dos calendarios con dos vocabularios divergen a la tercera
      semana.
- [ ] **Se pintan bloques de sesión reales, no una malla de media hora.** Con sesiones de 50
      minutos, una rejilla cada 30 insinúa que las 17:30 están libres cuando las 17:00 ocupan
      hasta las 17:50.
- [ ] **Nunca solo color** (ADR-047, ADR-041): libre, ocupado, sugerido y hora habitual se
      distinguen además por texto o forma, y **cada hueco es un botón** con nombre accesible
      completo — «Martes 8 de septiembre, 17:00, libre, sugerida».
- [ ] **El resaltado de «hora habitual» pasa el validador de contraste** de `lib/contraste/`
      (ADR-041) en su tono más tenue. Si no pasa, no se usa fondo: se usa marca.
- [ ] **A 360 px no es una semana estrechada** (ADR-044): día a día con desplazamiento
      lateral o lista por franjas, **con la misma información y las mismas acciones**.

### Los campos sin los cuales la cita no se guarda

- [ ] **Paciente** (fijado y no editable si se entró desde la ficha), **profesional** —por
      defecto el asignado—, **centro y sala**, **tipo de terapia** (que fija duración y
      tarifa por defecto), **modalidad** e **inicio**.
- [ ] **Nota operativa**, con su etiqueta diciendo que es **logística** —sala, material,
      aviso de acceso— y su texto de ayuda. Es el sitio exacto donde alguien escribirá
      contenido clínico si no se lo impides (choque 3).
- [ ] **El técnico administrativo no ve el tipo de terapia** (choque 4): el campo **se
      omite** —no se tacha ni se enseña en gris— y la cita se crea con el tipo por defecto
      del profesional. Se lee de la **vista `security_barrier` de T-010**, no filtrando
      columnas en la consulta de la aplicación.
- [ ] **Ningún motivo de sugerencia nombra el tipo de terapia** cuando el rol no puede
      verlo. El recorte del choque 4 se aplica también al texto explicativo, que es por
      donde se escapa.

### La serie, que es la mitad del ticket

- [ ] **La pantalla pregunta la periodicidad**: suelta, **semanal**, **quincenal** o
      **mensual**. **Los tres valores del ADR-034 y ni uno más** — nada de «personalizada»
      ni de reglas de recurrencia arbitrarias.
- [ ] **Previsualización de la serie antes de guardar**, con las próximas sesiones una a
      una: fecha, hora y estado de cada una. Es el momento en el que se decide bien o mal.
- [ ] **Los festivos y ausencias se saltan proponiendo, nunca en silencio y nunca encima**
      (T-011): la sesión afectada aparece marcada, con la alternativa propuesta y la opción
      de dejarla fuera.
- [ ] **Las anomalías de marzo y octubre se ven** en la previsualización, marcadas como lo
      que son (`anomalia_horaria`), con la hora resultante. El usuario no tiene por qué
      saber qué es el horario de verano; tiene que ver que esa sesión cambió de hora.
- [ ] **Confirmar la serie entera o sesión a sesión**, con casillas por fecha. Guardar llama
      a las Server Actions de T-011; **esta pantalla no escribe SQL propio**.

### Conflicto y errores

- [ ] **El hueco se puede ocupar mientras se rellena el formulario.** El índice de exclusión
      de T-010 lo rechaza, y la pantalla **no enseña un error muerto**: mensaje «Ese hueco
      acaba de ocuparse», sugerencias **recalculadas** en el mismo sitio, y el resto del
      formulario intacto.
- [ ] **Aviso no bloqueante cuando la cita deja un hueco raro** en la agenda del profesional
      —menos que una sesión y más que el descanso—, con alternativas y un **«Agendar
      igualmente» que siempre existe**. La preferencia del profesional informa; no bloquea.
- [ ] **Vacío, error y cargando** para las tres piezas: sugerencias, calendario y
      previsualización de la serie (`docs/interfaz.md` §Lo que el prototipo no cubre — el
      prototipo solo dibuja el caso feliz).

## Criterios de aceptación (verificables)

- [ ] **Manual** — desde la ficha de un paciente, pestaña Resumen, «Nueva cita» abre el
      diálogo con el paciente fijado; **recargar la página** deja la misma pantalla en pie.
- [ ] **Manual** — con el desbloqueo de historia **vigente**, la pantalla no muestra ni un
      dato clínico: ni diagnóstico, ni episodio, ni motivo de consulta, ni en los textos de
      sugerencia.
- [ ] **Manual** — abrir `/agenda/nueva` **sin PIN introducido** funciona entero, incluida
      la creación de la serie.
- [ ] **Manual** — un paciente con seis citas los martes a las 12 recibe como primera
      sugerencia un martes a las 12, y su motivo dice «como las seis últimas» o equivalente.
      **En ninguna parte de la pantalla aparece una cifra de puntuación.**
- [ ] **Manual** — un paciente sin citas previas recibe «primeros huecos libres», con esas
      palabras, y ninguna tarjeta habla de hora habitual.
- [ ] **Manual** — como `tecnico_administrativo`, el campo de tipo de terapia **no está en
      el DOM**, y ningún motivo de sugerencia lo nombra.
- [ ] **Manual** — elegir «semanal» y ocho sesiones sobre una serie que cruza el último
      domingo de marzo: la previsualización enseña las ocho con la **misma hora local** y
      marca la afectada por la anomalía.
- [ ] **Manual** — una serie que pisa un festivo de `disponibilidad` muestra esa sesión
      marcada con alternativa propuesta, **nunca colocada encima**.
- [ ] **Manual** — con dos pestañas abiertas, reservar el mismo hueco en la segunda da «Ese
      hueco acaba de ocuparse» **con sugerencias nuevas**, y el resto del formulario
      conserva lo escrito.
- [ ] **Manual** — recorrido completo con teclado, sin ratón: abrir, elegir hueco, elegir
      periodicidad, confirmar, cerrar. Foco visible siempre y de vuelta al botón de origen.
- [ ] **Manual** — a 360 px la pantalla se reorganiza y **toda** acción de escritorio sigue
      disponible. Ningún objetivo táctil por debajo de 44 px.
- [ ] **Manual** — `/agenda/nueva` al lado de `/prototipo`: mismo vocabulario visual, sin
      controles de adorno.
- [ ] **Automático** — `npm run lint && npm run build` limpios y el verificador de
      accesibilidad de T-009 en verde sobre la ruta nueva.

## Guion de comprobación manual

1. `npx supabase db reset && npm run seed && npm run dev`.
2. Abrir la ficha de un paciente con historial, pestaña Resumen → «Nueva cita». Comprobar
   las tres sugerencias y sus motivos, y que **no hay ninguna cifra**.
3. Elegir «semanal · 8 sesiones» sobre una fecha que cruce el cambio de marzo y revisar la
   previsualización entera antes de guardar.
4. Abrir la misma pantalla en una segunda pestaña y reservar el mismo hueco desde las dos.
5. Repetir el paso 2 como `tecnico_administrativo` y a 360 px.

## Notas para el agente

- **Carril de interfaz.** Este ticket escribe en `components/**` y `app/**`. No toca
  `supabase/**` ni escribe SQL: todo lo que necesita se lo dan la **vista de agenda de
  T-010** y las **Server Actions de T-011**. Si te falta un dato, **falta un ticket**, no
  una consulta improvisada.
- **`@date-fns/tz`** (`TZDate`, `tz`), no `date-fns-tz`. Ese es el de v2/v3 y no está
  instalado.
- Sin librería de componentes (ADR-040): el diálogo, el foco atrapado y la rejilla de
  selección se escriben a mano, una vez, y se reutilizan.
- **Lee T-011 antes que este ticket.** Las anomalías horarias y las reglas de la serie salen
  de allí, y quien no las haya entendido dibujará una previsualización que miente.
- El malva es **selección**, no un estado (sistema de diseño). El hueco elegido va en
  `bg-secondary`.
- Este ticket **no** escribe el aviso de sesión en curso, ni la campana, ni el recordatorio
  por `wa.me`. Son T-015 y el ticket de mensajería, que todavía no existe.
