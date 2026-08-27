---
id: T-020
titulo: Estados de la cita — tabla de transiciones pura y «en curso» calculado
modelo: sonnet
fase: 1
prioridad: media
depende_de: [T-016, T-018]
estado: pendiente
---

# Contexto

El ADR-045 está **cerrado**: `citas.estado` es un enum de cinco valores —`programada`,
`confirmada`, `realizada`, `cancelada`, `no_asistida`— y **«en curso» no es uno de ellos**,
sino algo que se calcula con el reloj, en servidor y en la zona del centro.

Lo que el ADR **no** escribe es qué transiciones son legales. Y ese es exactamente el tipo
de regla que, si vive suelta, acaba escrita tres veces —en la Server Action, en el botón y
en el disparador— y las tres se desincronizan. Este ticket la escribe **una vez, como
módulo puro**, para que **T-010** la ancle en la base y **T-014** pinte contra ella en vez
de contra un `switch` propio.

**Frontera, y no se cruza**: aquí no hay migración, ni enum en Postgres, ni tabla `citas`,
ni RLS, ni pantalla. T-010 sigue siendo `opus` y sigue siendo quien decide la forma de la
fila y quién puede escribirla. Equivocarse aquí cuesta reescribir un fichero de cien
líneas; por eso es `sonnet`.

Referencias: ADR **045** (los cinco estados y el reloj), ADR **047** (el estado **late**,
no parpadea — pero la animación es de T-014), `docs/interfaz.md` §Agenda.

## Tareas

- [ ] `lib/agenda/estados-cita.ts` con el tipo `EstadoCita` como **unión de literales** y
      una constante congelada con los cinco valores **en el orden en que se declararán en
      el enum de Postgres**. Deja escrito en un comentario que ese orden es el contrato con
      T-010 y que **añadir un valor al enum es una migración**, quitarlo no existe.
- [ ] **Tabla de transiciones** como dato, no como `switch`: un mapa de estado origen a
      estados destino permitidos, más `puedeTransitar(desde, hasta)` y
      `transicionesDesde(estado)` —que es lo que T-014 usará para pintar el menú de la cita
      sin repetir la regla—. Las reglas:
      - `programada` → `confirmada`, `realizada`, `cancelada`, `no_asistida`;
      - `confirmada` → `realizada`, `cancelada`, `no_asistida`;
      - `realizada`, `cancelada` y `no_asistida` son **terminales**: no salen a ningún
        sitio. Corregir un error es **otra cita**, no un viaje de vuelta, igual que una
        nota se corrige con otra versión.
      - Ninguna transición a sí mismo.
- [ ] **`estaEnCurso(cita, ahora)`**, la regla completa del ADR-045: el instante cae en
      `[inicio, fin)` **y** el estado no es `cancelada` ni `no_asistida`. Se apoya en
      `estaEnCurso` de `lib/fechas/` (T-018) para la parte de reloj y añade la de estado.
      Recibe `ahora` como parámetro: **ninguna llamada a `new Date()` sin argumentos**.
- [ ] **`estadoVisible(cita, ahora)`**, que devuelve lo que la interfaz pinta: los cinco
      guardados más `en_curso` y `pasada_sin_marcar` —la que ya terminó y sigue
      `programada` o `confirmada`, que es la que dispara el deber de documentación—.
      **Este tipo derivado nunca se guarda.** Dilo en un comentario, porque el próximo
      agente intentará persistirlo.
- [ ] **Claves de i18n, no cadenas.** Cada estado expone su clave (`agenda.estado.programada`)
      para el catálogo de T-009; **ningún texto visible en castellano dentro del módulo**.
      Tampoco color: el color es token y lo decide T-007.
- [ ] Pruebas con el banco de **T-016** y **reloj fijo**: la matriz de transiciones al
      completo —cinco por cinco, veinticinco casos, cada uno afirmado— y `estaEnCurso` con
      el instante justo en `inicio` (cierto), justo en `fin` (**falso**, intervalo
      semiabierto), un minuto antes, un minuto después, y una cita cancelada dentro de su
      propio horario (falso).

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm test` en verde con los **veinticinco** casos de la matriz
      afirmados uno a uno, no en bucle sobre la propia tabla. Una prueba que recorre la
      estructura que prueba no prueba nada.
- [ ] **Automático** — `puedeTransitar('realizada', 'programada')` es falso, y lo es desde
      los tres estados terminales hacia cualquier otro.
- [ ] **Automático** — `estaEnCurso` con `ahora === fin` devuelve **falso**.
- [ ] **Automático** — una cita `cancelada` cuyo horario contiene a `ahora` **no** está en
      curso.
- [ ] **Automático** — `estadoVisible` devuelve `pasada_sin_marcar` para una cita
      `confirmada` cuyo `fin` ya pasó, y `realizada` para una marcada.
- [ ] **Automático** — `grep -rn "new Date()\|Date.now()\|supabase\|use client" lib/agenda/`
      devuelve **cero** resultados.
- [ ] **Automático** — `npm run lint && npm run build` limpios.

## Guion de comprobación manual

1. `npm test` — verde.
2. Añadir `realizada → programada` a la tabla: la prueba correspondiente se pone roja.
   Revertir.

## Notas para el agente

- **Va sobre-especificado y salta la etapa de diseño.**
- **No escribas ninguna migración.** Ni el enum, ni `citas`, ni `esta_en_curso()` en SQL.
  Todo eso es **T-010**, que es `opus`. Este módulo es la copia en TypeScript de una regla
  que allí se anclará en la base; si T-010 decide otra cosa, **manda T-010** y este fichero
  se reescribe.
- **No leas el reloj en cliente.** El ADR-045 lo deja bloqueado con todas las letras: el
  color de una cita no se decide con la hora del navegador. Por eso `ahora` es parámetro.
- **No toques `supabase/`, `docs/architecture.md`, `docs/decisions.md` ni ninguna pantalla.**
- Si al escribirlo aparece una transición que el producto necesita y no está aquí —por
  ejemplo, deshacer una cancelación— **no la añadas**: anótala en `docs/state.md`
  §Hallazgos anotados con el caso concreto, y que la decida T-010.
