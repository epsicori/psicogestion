# T-028 · Revisión del corte A (`sugerirHuecos`)

**Sin hallazgos ALTA.** 3 MEDIA, 4 BAJA. Diff revisado: `e3db77d..e56c884` (rama `worktree-agent-abc779e83092cd3fa`):
`lib/agenda/sugerencias.ts` y `lib/agenda/sugerencias.test.ts`. Los dos ficheros están dentro del territorio (diseño §6).

Método: lectura contra §1.B, §5, E1-E11 y las decisiones del propietario. Se midieron 19 mutantes (13 muertos, 6 vivos)
en una copia del scratchpad con vitest, más sondas de comportamiento con `tsx`. El worktree no se tocó.

## Lo que está bien (comprobado)

- **Aritmética de fechas.** Toda la aritmética pasa por `lib/fechas/calendario`
  (`diasEntre`, `sumarDias`). No hay `Date` en el módulo. Solo se usa `>`/`<=` sobre
  cadenas `AAAA-MM-DD`, que es correcto mientras el formato lo sea (ver H7). `horaLocal`
  se copia del bloque y nunca se calcula, así que el cambio de hora no tiene por dónde
  entrar. Las pruebas de marzo, octubre y fin de año son de regresión: con este código
  no pueden ponerse rojas, y no hay nada que discrimine.
- **Motivos sin tipo de terapia ni modalidad.** La `Sugerencia` se construye campo a campo
  (`sugerencias.ts:78`), sin propagación de `b` ni de `p`. El motivo solo lleva literales,
  `diaSemana` (número), `horaLocal` y `intervaloModa`. El mutante `{ ...b, motivo }` muere
  porque los `toEqual` ven el `diaSemana` de más. No hay ningún camino por el que un campo
  extra del llamante llegue a la salida.
- **Mutantes muertos (13):** frecuencia 2→1, empate al mayor, `>=` hoy, `<` en el avance,
  (b) sin `usados`, `comoLasUltimas` solo por día, `n` fijo en 6, objetivo desde la primera,
  hora habitual global, rellenar sin `usados`, sin `excluir`, (b) sin día, (a) sobre
  `libres` sin filtrar.

## MEDIA

**H1 · `lib/agenda/sugerencias.ts:104` (y :115).** La guarda `intervaloModa > 0` es lo único
que impide que el `while` de la línea 115 no termine, y ninguna prueba la ejercita.
- Escenario: un paciente con sesión doble semanal (martes 12:00 y 13:00, tres semanas) tiene
  intervalos 0,7,0,7,0, así que la moda es 0. Con la guarda quitada, `sumarDias(objetivo, 0)`
  no avanza y el render del servidor se cuelga. **Medido**: las 29 pruebas siguen en verde y
  la sonda se corta a los 20 s sin salida.
- Con `pasadas` en orden descendente (moda negativa), la misma guarda evita un bucle hacia
  atrás que solo acaba cuando `aCadena` deja de casar con el patrón de fecha.
- Falta una prueba con intervalo modal 0 y otra con moda negativa, las dos esperando
  `enFrio`.

**H2 · `lib/agenda/sugerencias.test.ts:170` (prueba de `sugerencias.ts:122`).** El criterio
central del contrato («seis martes a las 12 → martes a las 12») no comprueba la hora del
bloque (a).
- Escenario: el mutante `b.fecha === objetivo` (sin `&& b.horaLocal === horaHabitual`) **sobrevive (medido)**.
  Ninguna prueba pone un bloque más temprano en la fecha objetivo. Con unos `libres` reales
  (10-06 a las 09:00, 09:50… 12:00), ese mutante devuelve «Como las seis últimas» a las 09:00.
- Falta añadir a la prueba de la línea 170 un `bloque('2026-10-06', '09:00')` antes del de
  las 12:00.

**H3 · `lib/agenda/sugerencias.ts:133-138` (punto 2 del implementador, necesita decisión del
arquitecto).** Cuando el intervalo es mayor de 7, la sugerencia (b) toma el primer día
habitual posterior a hoy y no tiene en cuenta el intervalo. Puede quedar semanas antes del
objetivo y salir como **primera** tarjeta.
- Escenario medido: un paciente mensual (28 días), martes 12:00, última cita el 29-09, hoy
  el 02-10. El objetivo es el 27-10, que está ocupado. La 1.ª sugerencia es **06-10**,
  «Martes a las 12:00, su día habitual», tres semanas antes de su cadencia.
- Con el objetivo libre, la 2.ª tarjeta es la del 06-10, anterior a la 1.ª (27-10).
- ADR-049c habla de la moda del intervalo «**cruzada** con día y franja habituales». En (b)
  el cruce se pierde. En pacientes semanales no ocurre: para ellos (b) nunca precede al
  objetivo si todas las citas caen en el día habitual.
- Propuesta para el arquitecto: «el siguiente bloque en `diaHabitual` a `horaHabitual` **a
  partir del objetivo**». La alternativa es aceptar la lectura literal y dejarla escrita en
  el diseño.

## BAJA

**H4 · `lib/agenda/sugerencias.ts:93,104` (punto 4, necesita decisión del arquitecto).** Hoy
el intervalo 0 compite en la moda y, cuando gana, deja al paciente en frío. Como el empate se
resuelve al menor, el 0 gana todos los empates.
- Escenario medido: martes 12:00 y 13:00 durante tres semanas, que es un hábito evidente. Sale
  `enFrio` con tres `primerHueco`. El contrato reserva el frío para el paciente «sin historial
  suficiente».
- Con cinco citas (0,7,0,7) pasa lo mismo, por el empate.
- Lectura alternativa: dos citas el mismo día no forman un intervalo entre sesiones, así que
  los 0 se descartan antes de calcular la moda. Entonces la moda es 7 y el paciente queda
  habitual. Las dos lecturas son deterministas. Decide el arquitecto. La guarda de H1 hace
  falta en cualquier caso.

**H5 · `lib/agenda/sugerencias.ts:38,102` y `sugerencias.test.ts:35`.** El umbral de 3
citas sobra: no se puede tener una moda de intervalo con frecuencia ≥ 2 sin al menos 3
pasadas. Por eso no hay prueba que pueda cumplir lo que pide §5 («"en frío" debe fallar si el
umbral baja a 2 citas»).
- Escenario: **medido**, `MINIMO_PASADAS = 2` y la condición quitada entera sobreviven con 29
  verdes. La prueba «0, 1 y 2 pasadas: en frío» es verde por la regla de frecuencia, no por el
  umbral.
- No es un fallo del código, pero el diseño afirma una protección que no existe. El
  arquitecto debería corregir el punto de §5, o reconocer que el umbral es redundante con la
  frecuencia mínima.

**H6 · `sugerencias.test.ts:239`, `:201` (prueba de `sugerencias.ts:115` y `:128`).** Un
intervalo distinto de 7 no se prueba ni en el avance del objetivo ni en el motivo
`cadaIntervalo`.
- Escenario: dos mutantes **sobreviven (medido)**.
  - El avance `sumarDias(objetivo, 7)`: un paciente quincenal con la última cita el 01-09 y
    hoy el 02-10 pasa de 13-10 a 06-10, «Como las tres últimas», fuera de su cadencia.
  - `dias: 7` fijo en `cadaIntervalo`: un paciente quincenal leería «Cada semana».
- Hace falta una prueba quincenal que obligue a avanzar el objetivo y un `cadaIntervalo` con
  `dias: 14`.

**H7 · `lib/agenda/sugerencias.ts:62-71,90-91,127`.** La frontera confía en el llamante
(orden, longitud y formato de `hoy`) sin validar ni normalizar, y cuando falla lo hace en
silencio. Tiene tres caras:
- (a) `pasadas` en orden descendente, que es justo lo que da la consulta natural
  `order by inicio desc limit 6`, deja **en frío a todos los pacientes**. Sale sin error,
  medido.
- (b) Si llegan más de 6 pasadas, `n` crece, por ejemplo a «Como las ocho últimas» (medido),
  frente al «seis últimas» de ADR-049c.
- (c) Con `hoy = '2026-10-2'` (sin el cero), la comparación de cadenas descarta en silencio
  los bloques del 06-10 al 19-10 (medido).
- El diseño asigna las tres cosas al llamante. O la función ordena, corta con
  `slice(-6)` y valida `hoy` con `esFechaDeCalendario`, que ya existe, o el corte B
  (`leerUltimasCitasPaciente`) lleva una prueba del orden ascendente. Esto se anota para el
  corte B.

## Los cinco puntos que el implementador resolvió por lectura literal

1. **Empates de día y hora al menor: coherente.** §1.B fija «empate → el menor» para el
   intervalo, y extenderlo al día y a la hora mantiene la misma regla, determinista y
   explicable (ADR-049c). La moda es compartida, así que el mutante de empate muere por la
   prueba del intervalo. El mínimo lexicográfico de `HH:MM` es correcto con el relleno a dos
   cifras que exige el tipo. Efecto aceptable: un paciente de lunes y jueves a partes iguales
   queda como «lunes». No necesita decisión.
2. **(b) antes del objetivo: necesita decisión del arquitecto** (H3). Solo ocurre con
   intervalos mayores de 7 y pierde el «cruzada» del ADR.
3. **`comoLasUltimas` exige día y hora iguales: coherente.** Es el texto literal de §1.B. Si
   todas las pasadas caen el mismo día de la semana, todos los intervalos son múltiplos de 7
   (el 0 queda fuera por la guarda), así que el objetivo cae en ese día y (a) exige esa hora.
   Por tanto «Como las N últimas» siempre es cierto del bloque que acompaña. La regularidad
   ya la impone el objetivo. No necesita decisión.
4. **Intervalo modal 0 no es habitual: necesita decisión del arquitecto** (H4). La lectura es
   literal y segura, pero deja en frío a un patrón semanal claro. La alternativa es descartar
   los 0 antes de la moda.
5. **Libres duplicados como un solo bloque: coherente.** La deduplicación por
   `fecha T hora` (`usados`) es la misma que usa `excluir`, y es lo que la base considera el
   mismo hueco. El mutante que la quita en `rellenar` muere (5 rojas). No necesita decisión.

---

# Ronda 2 · arreglos de la ronda 1 (E12-E15)

**Sin hallazgos ALTA.** 0 MEDIA, 2 BAJA (H8, H9), las dos son pruebas que faltan; el código
cumple E12-E16. H1-H7 quedan cerrados. Diff revisado: `ae73156..08af1e6` (rama
`worktree-agent-a55a4754a7c62b1db`), con `lib/agenda/sugerencias.ts` y `lib/agenda/sugerencias.test.ts`,
los dos dentro del territorio.

Método: lista de E16 punto por punto, y 31 mutantes medidos con vitest sobre una copia en el
scratchpad. Los mutantes son míos, no los del implementador. Las sondas de comportamiento van
en la misma copia. El worktree no se tocó. Base: 41 pruebas verdes.

## Lista de E16

- **Normalización (E15).** Se cumple.
  - `hoy` se valida en `:79`, antes de cualquier comparación.
  - Las copias se hacen antes de `sort`, y el recorte va después de ordenar (`:83-84`).
  - Ninguna rama vuelve a leer `entrada.pasadas` ni `entrada.libres`: después de `:84`
    solo quedan `entrada.excluir` (`:85`) y `entrada.hoy` desestructurado.
  - La entrada no se modifica, medido. Muere ordenar `pasadas` en el sitio y muere ordenar
    `libres` en el sitio.
- **Intervalos (E13).** El filtro `d > 0` va antes de `moda` (`:109`) y no dentro de
  `habitual`. Día y hora se calculan sobre todas las pasadas normalizadas (`:112-116`).
  Ver H9: ninguna prueba distingue esto último.
- **Sin umbral fantasma (E14).** Ya no hay `MINIMO_PASADAS` ni ningún `pasadas.length >= N`.
  Con `FRECUENCIA_MINIMA = 1`, «0, 1 y 2 pasadas: en frío» (`:35`) se pone en rojo, medido,
  junto con otras cuatro. El punto corregido de §5 se cumple.
- **(b) y la cadencia (E12).** La condición es `b.fecha >= objetivo` (`:155`). Las dos pruebas
  mensuales escriben el objetivo a mano en un comentario (10-27) y esperan la lista exacta.

## Mutantes (31 medidos)

**Muertos (23):**
- `hoy`: sin validar; validado solo con regex (`2026-02-30` pasa).
- `pasadas`: sin ordenar; ordenadas en el sitio; sin recorte; `slice(0, 6)`;
  `MAXIMO_PASADAS` en 5 y en 7.
- `libres`: sin ordenar; ordenadas en el sitio; `candidatos` sacados de `entrada.libres`.
- Comparador: sin hora; hora invertida.
- E13: sin filtro `> 0`; filtro `>= 0`.
- E12: sin `b.fecha >= objetivo`; `b.fecha >= hoy`.
- H2: (a) sin la hora.
- H6: avance de 7 fijo; `dias: 7` fijo.
- E14: `FRECUENCIA_MINIMA = 1`; umbral `pasadas.length >= 4`.
- `n: 6` fijo.

**Rojo por cuelgue (1):** sin filtro y sin guarda a la vez. Medido: vitest no termina y lo
corta el timeout de 40 s. El comentario de la prueba de `:540` dice la verdad.

**Equivalentes (3), no son hallazgos:**
- La guarda `intervaloModa > 0`: es el equivalente que declara E13.3.
- `d !== 0` en lugar de `d > 0`: con las pasadas ya ordenadas no existe un `d < 0`.
- `b.fecha > objetivo` en lugar de `>=`. Se razona así:
  - el único bloque con `fecha === objetivo`, en el día habitual y a la hora habitual,
    tiene la misma clave que el que toma (a);
  - si (a) lo encontró, `usados` ya lo descarta en (b);
  - si (a) no lo encontró, ese bloque no existe en `candidatos`.

  Es lo que dice E12.1.

**Vivos (4):** H8 y H9.

## Cierre de la ronda 1

| | Estado | Comprobación |
|---|---|---|
| H1 | Cerrado (E13.3) | La guarda es equivalente. El filtro tiene rojo (sesión doble) y los dos quitados cuelgan. |
| H2 | Cerrado | El mutante de (a) sin la hora muere con 2 rojas. |
| H3 | Cerrado (E12) | Quitar `>= objetivo` da 2 rojas, y también `>= hoy`. |
| H4 | Cerrado (E13) | Sesión doble → `habitual`, con la lista exacta. |
| H5 | Cerrado (E14) | La constante ya no está y `:35` se pone en rojo con frecuencia 1. |
| H6 | Cerrado | Avance de 7 da 3 rojas y `dias: 7` da 1. |
| H7 | Cerrado en la función (E15) | La parte del llamante (`order desc + limit 6` con su prueba) es del corte B (E15.3). |

No hay regresiones: las 29 pruebas de la ronda 1 siguen verdes y el diff solo añade pruebas.
E12 cambia (b) solo cuando el día habitual cae antes del objetivo. Es la consecuencia que
acepta E12.3.

## BAJA

**H8 · `lib/agenda/sugerencias.ts:83` (pruebas de `sugerencias.test.ts:575` y `:589`).**
Ninguna prueba pasa más de seis pasadas fuera de orden. Por eso sobreviven dos mutantes de la
normalización que E16 pide revisar.
- **Mutante 1, recorte antes de ordenar:** `[...entrada.pasadas].slice(-6).sort(…)`. Las
  41 pruebas siguen verdes, medido.
  - Escenario medido: ocho pasadas en orden descendente, que son los seis martes 12:00
    (08-25 a 09-29) y dos jueves 10:00 (08-13 y 08-20).
  - El código da `10-06 12:00 comoLasUltimas{n:6}`.
  - El mutante se queda con las seis más antiguas y da `cadaIntervalo{dias:7}`.
  - La prueba «más de seis» pasa las pasadas en ascendente, y la del orden descendente solo
    lleva seis. Ninguna de las dos lo ve.
- **Mutante 2, pasadas ordenadas solo por fecha:** un comparador para `pasadas` que no mira la
  hora. Las 41 siguen verdes, medido.
  - Escenario medido: siete pasadas con el corte en mitad de un día doble. La entrada es
    `09-08 13:00, 09-08 12:00, 09-15 13:00, 09-22 13:00, 09-22 12:00, 09-29 12:00, 09-29 13:00`.
  - El código descarta la cita de las 12:00 del 09-08, sale hora habitual 13:00 (4 a 2) y la
    1.ª tarjeta es `10-06 13:00`.
  - El mutante descarta la de las 13:00, empatan 3-3, gana 12:00 y la tarjeta pasa a `10-06 12:00`.
  - La prueba de libres desordenados no lo mata, porque es un comparador aparte del de `libres`.
- **Arreglo mínimo:** que la prueba «más de seis» pase las ocho pasadas en orden descendente,
  o añadir una gemela así. Eso mata el mutante 1. Para el 2 hace falta, además, un día doble al
  borde del corte y con la hora invertida en la entrada.

**H9 · `lib/agenda/sugerencias.ts:112-116` (sin prueba).** E16 manda comprobar que «día y hora
habituales se calculan sobre **todas** las pasadas, no sobre las filtradas». Ninguna prueba lo
distingue: la única con sesiones dobles, la de `:511`, lo tiene todo en martes y empata la
hora a favor de 12:00 en las dos lecturas.
- **Mutante de día, sobre un representante por fecha:** las 41 siguen verdes, medido.
  - Escenario medido: `09-07 lun 12:00, 09-10 jue 12:00+13:00, 09-14 lun 12:00, 09-17 jue 12:00+13:00`.
  - El código da día habitual jueves (4 frente a 2) y (b) es `10-08 diaHabitual{4,'12:00'}`.
  - El mutante empata 2-2, gana el lunes y (b) pasa a ser `10-12 diaHabitual{1,'12:00'}`,
    con el jueves degradado a `primerHueco`.
- **Mutante de hora, sobre un representante por fecha:** las 41 siguen verdes, medido.
  - Escenario medido: `09-15 12:00+13:00, 09-22 12:00+13:00, 09-29 13:00`.
  - El código da 13:00, y la 1.ª tarjeta es `10-06 13:00`.
  - El mutante da 12:00, y la tarjeta pasa a `10-06 12:00`.
- **Arreglo mínimo:** una prueba con dobles en un día y sencillas en otro, que espere la
  tarjeta `diaHabitual` del día con más citas (el escenario de día de arriba sirve tal cual).

## Para el corte B (no son hallazgos de este diff)

- E15.3: `leerUltimasCitasPaciente` con `order('inicio', { ascending: false })` y `limit(6)`,
  con su prueba. Además, ningún `sort` ni `slice` sobre `pasadas` o `libres` en el llamante.
- `sugerirHuecos` ahora **lanza** si `hoy` no es válida. El corte B tiene que llevar ese error
  al estado `agenda.alta.sugerencias.error` (§1.F) y no dejar que tumbe el render de la página.
