---
id: T-012
titulo: Nota clínica — borrador, firma y versión sellada
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-005, T-007, T-013]
estado: pendiente
---

# Contexto

Es el corazón del producto. Todo lo demás —la agenda, el candado, la cadena de huellas—
existe para que este ticket pueda decir la verdad: **quién escribió qué, cuándo, y que
nadie lo ha tocado después**.

T-001 dejó las dos tablas: `notas_clinicas`, cabecera **mutable** donde vive el borrador, y
`notas_clinicas_versiones`, de **solo adición**, donde se entra firmando. T-005 dejó el
canonicalizador y el encadenado. Aquí se junta todo y se le pone un editor delante.

Referencias: `docs/architecture.md` §Invariante 1 (cadena), §Invariante 2 (solo adición),
§Reserva de anotaciones subjetivas. ADR **035** (se sella un byte, no un objeto), **036**
(a la cadena se entra firmando), **027** (dos cuerpos, una sola huella), **046** (la nota
sabe si se escribió en sesión, y eso va sellado), **030** (nota conjunta), **044** (el
editor necesita diseño táctil propio).

## Tareas

- [ ] **Editor de borrador** sobre `notas_clinicas.borrador_contenido`, con autoguardado y
      **bloqueo optimista** por `borrador_actualizado_en` (ADR-036). Si otro dispositivo
      guardó antes, se avisa y **no se pisa**.
- [ ] **Dos cuerpos, visualmente separados** (ADR-027): `cuerpo` y
      `anotaciones_reservadas`. La zona reservada lleva su explicación —art. 18.3 de la Ley
      41/2002— y advierte de lo que **sí** implica: se excluye de las salidas dirigidas al
      paciente, **no** se oculta a un colega que herede el caso, **no** se opone a un
      requerimiento judicial.
- [ ] **El borrador es dato clínico**: mismo RLS, mismo candado, mismo registro de acceso.
      No hay atajo para «guardar rápido sin desbloquear».
- [ ] **Firmar** construye el **sobre** del ADR-046 —`cuerpo`, `anotaciones_reservadas`,
      `autor_id`, `creada_en`, `motivo_cambio`, `esquema_version`, más `cita_id`,
      `abierta_en`, `firmada_en`, `redactada_en_sesion` y el margen aplicado—, lo
      canonicaliza con `lib/huella/` y escribe la fila en `notas_clinicas_versiones` con
      `contenido_canonico`, `huella` y `huella_anterior`.
- [ ] **`redactada_en_sesion` se calcula en el servidor al firmar** y se sella. **No es una
      casilla del formulario**: una casilla de «lo escribí en sesión» es exactamente lo que
      este sistema existe para no tener que creerse.
- [ ] **`abierta_en`** se fija la primera vez que se abre el editor para esa versión, en
      una Server Action, y se conserva mientras dure el borrador.
- [ ] **Modificar una nota firmada exige motivo** y crea la versión siguiente, encadenada.
      La vista muestra por defecto la **versión vigente**, con un indicador «modificada el ·
      por» y acceso a la **comparación entre versiones**, resaltando lo añadido y lo
      retirado.
- [ ] **La descarga incluye todas las versiones**, en orden, con sus autores y fechas. Es
      la única representación honesta ante un juzgado.
- [ ] **El sello se enseña como un hecho, no como una insignia**: «Escrita durante la sesión
      del 26/08 · 17:05–17:52». Si la nota se escribió fuera, se dice igual de claro y sin
      reproche: es un dato, no una regañina.
- [ ] **Entrada desde dos sitios, una sola ruta**:
      `/pacientes/<uuid>/historia/notas?cita=<uuid>`. Desde el calendario (T-014) y desde
      la ficha (T-013) se llega a la misma pantalla, con el mismo candado.
- [ ] **Nota conjunta** (ADR-030): si la cita es de un episodio con varios participantes, la
      nota cuelga del episodio, es **un solo eslabón** y se advierte de que no se entregará
      entera en un ejercicio de acceso individual.
- [ ] **Todas las mutaciones en Server Actions**, validadas con el mismo esquema Zod que usa
      el formulario. La ventana del candado se prolonga ahí, **jamás en el renderizado**.
- [ ] **Diseño táctil propio** (ADR-044): barra de herramientas al alcance del pulgar, sin
      depender de atajos de teclado, y **el teclado virtual no puede tapar el cursor**. Es
      otro producto, no el de escritorio estrechado.

## Criterios de aceptación (verificables)

- [ ] **Automático** — firmar la primera nota de un paciente crea una fila con
      `numero_version = 1`, `huella` no nula y `huella_anterior` de **32 bytes cero**.
- [ ] **Automático** — el `contenido_canonico` guardado, vuelto a pasar por SHA-256, da
      **exactamente** la `huella` almacenada. La verificación **relee esos bytes**; no los
      deriva otra vez del objeto.
- [ ] **Automático** — el sobre contiene `redactada_en_sesion = true` cuando el editor se
      abre y se firma dentro de la ventana de la cita, y `false` al firmar al día
      siguiente. En los dos casos, cambiar ese campo a mano **rompe la huella**.
- [ ] **Automático** — `update notas_clinicas_versiones set cuerpo = 'x'` como `postgres`
      **falla**. Idem `delete` e idem `truncate`.
- [ ] **Automático** — modificar sin motivo **falla**; con motivo crea
      `numero_version = 2` cuya `huella_anterior` es la `huella` de la 1.
- [ ] **Automático** — una nota con acento compuesto y otra con el mismo acento
      precompuesto producen **la misma** huella (NFC).
- [ ] **Automático** — `anotaciones_reservadas` **entra** en el cómputo: cambiarla y
      recalcular da una huella distinta.
- [ ] **Manual** — con el candado cerrado, la ruta del editor muestra la pantalla de
      bloqueo y **el HTML recibido no contiene el borrador**.
- [ ] **Manual** — comparación entre la versión 1 y la 2, con lo añadido y lo retirado
      distinguibles **sin depender del color**.
- [ ] **Manual** — a 360 px, con el teclado virtual abierto, el cursor sigue visible y la
      barra de herramientas alcanzable con el pulgar.
- [ ] **Manual** — `disponible: true` no aplica: Pacientes ya lo está. No se toca el
      armazón.
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm run dev`, entrar como profesional, abrir una cita en curso desde `/agenda`.
2. Pulsar «Notas», meter el PIN, escribir en los dos cuerpos y esperar el autoguardado.
3. Firmar. Comprobar el sello «Escrita durante la sesión de…».
4. En Studio, intentar `update` sobre la versión: debe fallar.
5. Modificar la nota con motivo y comparar versiones.

## Notas para el agente

- **El sobre completo está en el ADR-046. Léelo antes de tocar `lib/huella/`.** Si el
  canonicalizador de T-005 no lo contempla, se corrige allí, no se parchea aquí.
- **`algoritmo_version` no cambia.** Lo que sube es `esquema_version` del sobre.
- El margen de sesión se guarda **con la nota**, no se consulta al verificar: la regla que
  aplicó ese día tiene que seguir siendo legible dentro de diez años.
- No inventes un estado en `notas_clinicas`: T-001 lo dejó fuera a propósito. El estado se
  **deriva** de si hay versiones y de si hay borrador.
- El editor es la segunda pieza más cara de la fase, y se diseña dos veces por el ADR-044.
  Cuenta con ello en la estimación.
