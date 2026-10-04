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


---

# T-028 · Revisión del corte B (pantalla del alta de cita)

**Sin hallazgos ALTA.** 5 MEDIA, 3 BAJA.

- **Diff revisado:** `git diff main...worktree-agent-a1549876942c02f5f`, con 14 commits y 52 ficheros.
- **Contra qué:** el contrato `tickets/T-028-alta-de-cita.md` y el diseño `tickets/T-028/diseno.md`. Mandan E1-E17, y §5 se aplica según E6/E16.
- **Lo que no he usado:** ni la evidencia ni el informe del verificador. Tampoco he consultado la base local, que está compartida con T-040 B.

## Lista «Qué revisar» (§5 + E6), punto por punto

- **Entradas que elige el llamante (E6).** Sin hallazgo.
  - `tipoTerapiaId` lo elige cualquier rol, y la duración sale del catálogo en el servidor (`estado-alta.ts:53-62`).
  - `esquemaAltaCita` no tiene `duracionMinutos`: `z.object` la descarta.
  - La nota del técnico se fuerza a `null` en la acción (`aplicarRol`) y en el cliente, y la base da 42501. Son dos capas.
  - Con rol profesional, `profesionalId = usuario.id`.
- **Pruebas que deben fallar por el motivo exacto.**
  - `formulario-alta.test.tsx:78` («el tipo está para los tres roles») cae si se vuelve a esconder el selector por rol. El fixture trae tipos a los tres roles.
  - `acciones.test.ts:115` cae si se quita el forzado de la nota a `null`.
  - No existe la prueba «el selector empieza vacío con citas pasadas en el fixture». Pero el formulario no recibe ninguna entrada de la que pudiera salir un tipo inicial (`tipoTerapiaId: undefined` fijo, `formulario-alta.tsx:79`), y la comprobación «Duración: elige un tipo» lo cubre. Hoy no hay escenario de fallo.
- **Lectura del tipo por otra puerta.** El hueco está en la prueba, no en el código: ver H7.
  - El catálogo se pide con tres columnas (`contenido-alta.tsx:35`).
  - `leerUltimasCitasPaciente` lee solo `inicio, zona_horaria`.
  - Ningún resultado de acción lleva el id ni el nombre del tipo.
- **Puertas al dato clínico.** Sin hallazgo. El grep no encuentra ningún `import` de `lib/notas`, historia, episodios ni diagnósticos, ni en `app/(app)/agenda/nueva/**` ni en `lib/citas/alta.ts`.
- **Cero `new Date()` en cliente.** Sin hallazgo. Solo aparece en `estado-alta.ts` y `vista-alta.ts`, que son de servidor, y en ningún fichero `'use client'`. Navegar de semana es `recalcularAlta`.
- **Periodicidad.** Sin hallazgo: suelta y las tres del ADR-034.
- **Duplicados.** Guardar se deshabilita con `guardando`, y la base tiene el índice de exclusión. Pero Guardar sigue activo mientras se recalcula la previsualización: ver H3.
- **`excluir ∩ aceptarAlternativas` vacío.** Lo exige el esquema. Lo que falla es la firma, que no cubre ni el paciente, ni el profesional, ni el centro, ni el tipo: ver H3.
- **Sin cifra; contraste.** Sin hallazgo. El par «habitual» está en `lib/contraste/tokens.ts`.
- **Modalidad (E3).** Sin hallazgo. No hay ni control ni texto, y lo comprueba `formulario-alta.test.tsx:102`.

## Puntos de atención del orquestador

- **ADR-074.** Correcto: el técnico elige el tipo y no vuelve a leerlo (ver arriba).
- **Nada clínico en el alta.** Correcto.
- **Diálogo y foco.** Sin hallazgo con escenario.
  - Se usa la primitiva `Dialogo`, con su devolución de foco.
  - Escape y la «X» hacen `router.back()`, y hay prueba.
  - El diálogo es `max-w-3xl` y el diseño pedía `max-w-5xl`. Es cosmético y lo descarto.
- **Server Actions con el mismo esquema Zod que el cliente.** Sí: `esquemaAltaCita` en las dos capas, y `safeParse` en cada acción.
- **Aviso de «hueco raro».** No es lo que pide el diseño: es un desvío (H4).
- **Pruebas nacidas en verde.** H7, y las citadas arriba.

## MEDIA

### H1 · `app/(app)/agenda/nueva/contenido-alta.tsx:40` — el administrador nunca aparece como profesional elegible

**Qué pasa.**
- El directorio se filtra con `.eq('rol', 'profesional_sanitario')`.
- La decisión D de T-028a (`alta_exigir_profesional`, migración `20261005120000:208-226`) admite como profesional de una cita a un `profesional_sanitario` **o a un `administrador`** activo.
- El filtro lo dicta el propio diseño (§1.E, línea 254). El diseño choca con la decisión D, y el implementador siguió el diseño.

**Escenario.** Una consulta de una sola psicóloga cuyo perfil es `administrador`, sin ningún `profesional_sanitario` activo en el centro:
- la lista `profesionales` sale vacía;
- la línea 66 devuelve `agenda.alta.error.sinProfesionales`;
- la pantalla de alta queda inutilizable para todos los roles.

Si el centro tiene más profesionales, el administrador que atiende pacientes no puede citarse a sí mismo, ni el técnico citarle a él, aunque `agenda_crear_cita` lo aceptaría.

**Qué falta.** Decisión del propietario: ¿el directorio incluye a los administradores? Es el mismo patrón que T-034, el rol usado como señal de quién es clínico.

### H2 · `app/(app)/agenda/nueva/contenido-alta.tsx:44,64-65` — el profesional por defecto no es el asignado del paciente

**Qué piden.** El contrato (línea 133) dice «profesional —por defecto el asignado—», y el diseño §1.E (línea 253) manda leer `pacientes.profesional_id`.

**Qué hace el código.**
- El paciente se lee con `select('id, nombre, apellidos')`, sin `profesional_id`.
- El valor por defecto es `profesionales.find(p => p.centroId === centroId)?.id`, es decir, el primero que devuelve `directorio_perfiles`, sin `.order`.

**Escenario.** Un técnico abre `/agenda/nueva?paciente=X`, y X está asignado a la Dra. B. El desplegable entra con la Dra. A, que es la primera del directorio:
- las sugerencias se calculan con A, «en frío», porque X no tiene citas con A;
- si el técnico no mira el desplegable, la cita se guarda a nombre de A.

La prueba `contenido-alta.test.tsx:84` («entra el primero») fija este comportamiento equivocado.

### H3 · `app/(app)/agenda/nueva/formulario-alta.tsx:212-216,284-287` (y `lib/citas/alta.ts:146-156`) — una firma vieja valida una serie que el usuario no ha visto

**Qué pasa.** Tres huecos que se suman:
- Al cambiar de paciente, profesional, centro o tipo, se hace `setSerie(null)`, pero `firma` no vuelve a `null`. Solo lo hace `cambiarPeriodicidad` (línea 208).
- La firma cubre la periodicidad, la hora, la duración, la zona, y las fechas e instantes de las sesiones. No cubre ni el paciente, ni el profesional, ni el centro, ni el tipo.
- Guardar sigue activo mientras la nueva previsualización está en vuelo.

**Escenario.**
1. Serie semanal de 8 sesiones con la Dra. A. El usuario desmarca 2 fechas por vacaciones.
2. Cambia el profesional a la Dra. B, que tiene libres esas fechas, o cambia el tipo por otro de la misma duración.
3. Pulsa Guardar antes de que llegue la nueva previsualización. El envío lleva la `firma` de A y `excluir: []`, porque `serieVigente` es `null`.
4. `guardarAlta` vuelve a previsualizar para B. La firma sale idéntica: mismas fechas, misma hora, misma duración.

**Efecto.** Se crea la serie de 8 sesiones a nombre de B, incluidas las 2 fechas que el usuario había desmarcado, sin que haya visto ninguna previsualización de B.

Si la firma se anulara al cambiar, el esquema lo habría frenado: su `superRefine` exige `firma` en una serie.

### H4 · `app/(app)/agenda/nueva/vista-alta.ts` (pieza ausente; contrato:169, diseño §1.F:309-313) — el aviso de hueco raro se retiró en silencio

**Qué pasa.**
- El contrato lo exige como criterio, con alternativas y «Agendar igualmente».
- El implementador añadió sus claves en `a2ce801` y las quitó en `92e41d4`.
- Solo queda una línea en el mensaje del commit: nada en `docs/state.md` §Hallazgos, ni en una decisión, ni en el código.

**Por qué la premisa del diseño no se cumple (comprobado).** El diseño dice que el hueco raro es «el tramo libre que no generó bloque». Pero `agenda_bloques_profesional` (migración `20261005120000:850-996`) funciona así:
- emite el bloque «ocupado» en la rejilla del cursor (`inicio = cursor`, `fin = cursor + dur`), no con las horas de la cita real;
- después salta a `upper(rango_bloqueante)`.

Por eso el tramo libre anterior a una cita queda tragado por el bloque ocupado, y no se puede distinguir en la salida.

**Lo que tocaba.** Parar y anotarlo (regla 2), o pedir a T-028a la consulta que falta. No borrar la pieza en silencio.

**Escenario.** Franja de 9:00 a 14:00, una cita a las 10:20 y sesiones de 50 minutos. Se elige el hueco libre de las 9:00. Entre su fin y las 10:20 queda un tramo más corto que una sesión y más largo que el descanso. No sale aviso ni alternativas, y el criterio del contrato queda sin cubrir sin que nadie lo sepa.

### H5 · `app/(app)/agenda/nueva/calendario-seleccion.tsx:45` — calendario nuevo en vez de `RejillaSemana`/`ListaDia` en modo selección

**Qué piden.**
- El contrato (línea 116) dice «Es la vista semanal de T-014 en modo selección, **no un calendario nuevo**».
- El diseño §1.F (línea 278) fija una prop `seleccion?` sobre `RejillaSemana` y `ListaDia`, con la misma geometría (`minutoPared`, `PX_MIN`).

**Qué hace el código.**
- `CalendarioSeleccion` es un componente nuevo: siete botones de día y la lista del día elegido, también desde `md`.
- No hay decisión escrita, y `docs/interfaz.md` describe el resultado sin decir que se aparta.

**Escenario.**
- Desde `md`, el técnico que busca hueco entre martes y jueves no ve la semana, sino un día cada vez, y tiene que ir cambiando de día para comparar. En la agenda de T-014 los vería uno al lado del otro.
- El primer cambio en `RejillaSemana` (pintar festivos o ausencias, por ejemplo) no llegará al alta. Los dos vocabularios divergen, que es justo lo que el contrato quería evitar.

## BAJA

### H6 · `app/(app)/agenda/nueva/formulario-navegable.tsx:19` — el éxito no se anuncia ni lleva a la semana de la cita

**Qué pasa.**
- El diseño (línea 308) pide, en la página, ir a `/agenda?semana=<fecha>`.
- El código hace `router.push('/agenda')` e ignora la `fecha` que devuelve la acción.
- El propio comentario reconoce que no se anuncia.

**Escenario.** Desde la URL directa, se guarda una cita para dentro de tres semanas. Se vuelve a la semana actual: no se ve la cita ni hay ningún mensaje, así que el usuario no tiene confirmación de que exista.

### H7 · `app/(app)/agenda/nueva/acciones.test.ts:234-252` — «ningún resultado lleva el nombre del tipo» no prueba nada sobre el nombre

**Qué pasa.** El mock de `tipos_terapia` (línea 56) devuelve solo `{ duracion_minutos }`, aunque el fixture traiga `nombre`.

**Escenario.** Un mutante cambia `duracionDeTipo` para hacer `select('nombre, duracion_minutos')` y compone `anuncio` con el nombre. El mock le da `nombre: undefined`, y `not.toContain(NOMBRE_TIPO)` sigue en verde. La mitad «nombre» de ADR-074.2 no está probada.

### H8 · `app/(app)/agenda/nueva/formulario-alta.tsx:128-131` — «el hueco ya no cabe» solo se comprueba si el día elegido está en la semana visible

**Escenario.**
1. Se elige el martes a las 17:00 con un tipo de 50 minutos.
2. Se navega a la semana siguiente.
3. Se cambia a un tipo de 90 minutos, que choca con la cita de las 18:00.
4. El recálculo no trae el martes, así que el elegido sigue marcado y no hay aviso.
5. Guardar choca en la base, y la pantalla dice «Ese hueco acaba de ocuparse». Es falso: nadie lo ha ocupado, es que ya no cabe.

## Descartados

- **Propuestas nulas en `crearSerieAlta`.** La base inicializa las listas a `'[]'` (migración, líneas 524-525 y 700-705).
- **Doble `router.back()`.** Sin un escenario que se pueda reproducir.
- **«Fijado y no editable» desde la ficha.** El enlace de la ficha no forma parte de este corte.
- **La marca de habitual depende de la tarjeta (b).** Sin un escenario cerrado.
- **Ancho del diálogo.** Cosmético.
