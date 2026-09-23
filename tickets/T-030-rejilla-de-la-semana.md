---
id: T-030
titulo: La rejilla de la semana, pura
modelo: sonnet
fase: 1
prioridad: alta
depende_de: [T-016, T-018, T-020]
estado: en_curso
territorio:
  - lib/agenda/rejilla.ts
  - lib/agenda/rejilla.test.ts
  - lib/fechas/relativo.ts
  - lib/fechas/relativo.test.ts
  - lib/fechas/index.ts
  - kimi/informes/T-030.md
  - kimi/hallazgos/T-030.md
---

# Contexto

**T-014 dibuja el calendario semanal, y la mitad difícil de esa pantalla no es dibujo: es
aritmética.** Colocar una cita en una rejilla de siete columnas por N franjas, repartir en
columnas las que se solapan, y que la semana del cambio de hora —que tiene 23 o 25 horas—
no descuadre la cuadrícula. Nada de eso necesita base de datos, pantalla ni saber qué es
una historia clínica: es una función de entrada y salida, y por eso se corta aquí.

Se apoya en lo que **ya existe** y no se reescribe (T-018 y T-020, los dos integrados):

| Función | Dónde | Qué da |
|---|---|---|
| `diasDeSemana(fecha, zona)` | `lib/fechas/semana.ts` | los siete días de la semana de `fecha` en esa zona |
| `limitesDeSemana(fecha, zona)` | `lib/fechas/semana.ts` | el principio y el fin de esa semana |
| `seSolapan(a, b)` | `lib/fechas/intervalos.ts` | si dos intervalos se pisan |
| `duracionEnMinutos(inicio, fin)` | `lib/fechas/intervalos.ts` | minutos entre dos instantes |
| `estadoVisible(cita, ahora)` | `lib/agenda/estados-cita.ts` | el estado que se pinta, incluido `en_curso` |

**Ábrelos y míralos antes de escribir nada.** Si necesitas algo que no está ahí, no existe.

## Tareas

- [ ] **`lib/agenda/rejilla.ts`** con una función que, dados unos intervalos y una semana,
      devuelva **dónde va cada uno**: el día (0-6, lunes primero), el desplazamiento desde
      el principio del día **en minutos**, y su duración en minutos.
- [ ] **Reparto en columnas de lo que se solapa.** Dos citas a la misma hora no se pintan
      encima: cada una recibe **su columna** y **cuántas columnas hay en su grupo**, para
      que la pantalla sepa que una ocupa la mitad o un tercio del ancho. Un grupo es un
      conjunto de citas encadenadas por solape —A pisa a B y B pisa a C mete a las tres en
      el mismo grupo, aunque A y C no se toquen—.
- [ ] **Orden estable**: ante el mismo conjunto de entrada, la misma salida. Nada de
      depender del orden en que llegue el array. Ordena por inicio y, a igualdad, por un
      criterio explícito que dejes escrito.
- [ ] **Una cita que empieza un día y acaba al siguiente** (una guardia, un error de datos)
      **no rompe la rejilla**: decide qué haces —recortarla al día, partirla en dos tramos—
      y **escribe el porqué en el módulo**. Lo que no vale es que se pierda sin avisar.
- [ ] **La semana del cambio de hora.** El último domingo de marzo tiene **23 horas** y el
      de octubre **25**. La rejilla se construye sobre horas locales, así que ese día tiene
      una franja menos o una de más. **Hay que decidirlo y probarlo**, no descubrirlo en
      pantalla seis meses después.
- [ ] **`lib/fechas/relativo.ts`**: `formatearFechaSinZona(fechaIso, zona)` para una fecha
      de calendario **sin hora** —`'2026-05-01'` → `'01/05/2026'`—. Hoy hay una copia de
      esto resuelta a mano dentro de `lib/citas/`, que no es tuyo: tú escribes la buena
      aquí, y el otro carril la adopta después. **Ancla al mediodía** de ese día en la zona
      antes de formatear: los saltos de horario caen de madrugada, así que a las 12:00 no
      hay hora inexistente ni ambigua en ninguna zona y el día que entra es el que sale.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npm test`, `npm run lint` y `npx tsc --noEmit` limpios. Pega la salida.
- [ ] **Automático** — tres citas que se solapan en cadena (A-B, B-C) caen en **un solo
      grupo de tres columnas**, y una cuarta que no toca a ninguna queda **sola, en un
      grupo de una**.
- [ ] **Automático** — dos citas idénticas en hora reciben columnas **distintas**, y el
      resultado es el mismo si se le pasan en el orden contrario.
- [ ] **Automático** — una semana que contiene el último domingo de marzo: el caso está
      probado y la aserción dice **qué se espera y por qué**, no solo que no lanza.
- [ ] **Automático** — `formatearFechaSinZona('2026-03-29', 'Europe/Madrid')` y
      `'Atlantic/Canary'` dan **el mismo día**, que es el 29: el anclaje al mediodía no se
      lleva la fecha por delante.
- [ ] **Automático** — **cobertura del módulo nuevo por encima del 90 %**
      (`npm run test:cobertura`).

## Notas para el agente

- **Ni `Date.now()` ni `new Date()` sin argumentos dentro del módulo.** El «ahora» entra
  siempre por parámetro: una función que mira el reloj por su cuenta no se puede probar.
- **Nada de zona del sistema.** Toda operación con horas locales lleva su zona IANA
  explícita, como ya hace `lib/fechas/`.
- No escribas componentes, ni estilos, ni nada de `app/` o `components/`. Esto es
  aritmética: entra un array, sale un array.
- El módulo se exporta desde `lib/agenda/` y el de fechas desde `lib/fechas/index.ts`,
  siguiendo el patrón que ya está ahí.
