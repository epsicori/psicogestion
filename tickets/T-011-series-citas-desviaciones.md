---
id: T-011
titulo: Series de citas con desviaciones
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-010]
estado: pendiente
---

# Contexto

La terapia es semanal por naturaleza: se cita «los martes a las 12 durante ocho sesiones»,
no ocho veces una cita. Pero una serie se rompe constantemente —el paciente se va de viaje,
el profesional enferma, cae festivo, cambia la hora en marzo— y un modelo que no lo prevea
acaba obligando a borrar la serie y rehacerla a mano.

T-010 dejó las tablas. Este ticket escribe **la materialización y las desviaciones**, que
es donde vive toda la dificultad. **Se lee antes que T-014**: ahí es donde se formatean las
horas, y quien no haya entendido esto las formateará mal.

Referencias: `docs/architecture.md` §Invariante 4. ADR **034** (hora local + zona en la
serie, instante + zona en la cita; anomalías de marzo y octubre; nada se recalcula solo),
**024** (outbox en Postgres), **045** (estados). `docs/interfaz.md` §Lo que el prototipo no
cubre — «Series de citas» está en la lista, así que **no vale «mira el prototipo»**.

## Tareas

- [ ] **Materializar** al crear la serie: se generan las citas una a una, cada una con su
      `inicio`/`fin` en `timestamptz` y la **instantánea de zona** del centro. La serie
      guarda la intención; las citas, los hechos.
- [ ] **Anomalías de horario de verano**, deterministas y ambas marcadas como desviación
      `anomalia_horaria`:
      - El **hueco de marzo** (la hora local no existe): el instante válido más cercano
        **hacia delante**.
      - El **solapamiento de octubre** (la hora local ocurre dos veces): **la primera** de
        las dos.
- [ ] **Festivos y ausencias**: al materializar se saltan los de `disponibilidad`,
      **proponiendo el desplazamiento y dejando decidir**. Nunca se salta en silencio ni se
      coloca encima.
- [ ] **Editar o cancelar una cita de una serie** pregunta siempre **«¿solo esta, o esta y
      las siguientes?»**. **Nunca «todas»**, que es la opción que destruye el histórico.
- [ ] **Las citas pasadas no se tocan jamás**, ni eligiendo «esta y las siguientes».
      Tienen notas clínicas y cobros colgando: son historia, no planificación. Se hace
      cumplir con un **disparador**, no solo con la interfaz.
- [ ] **Una cita tocada a mano queda `desviada`** y la serie **no la sobrescribe nunca**
      más. Cancelar la serie entera afecta solo a las futuras **no desviadas**.
- [ ] **Cambiar la zona de un centro o la regla de una serie no mueve nada solo**: genera
      un **evento de outbox** (ADR-024) con las citas futuras afectadas, y se confirma cita
      a cita. El motivo es que `wa.me` no devuelve estado de entrega: el sistema no sabe qué
      citas conoce ya el paciente, y moverlas por su cuenta es mandar a alguien a una
      consulta vacía.
- [ ] **Server Actions** para crear serie, desplazar, cancelar «esta» / «esta y las
      siguientes» y confirmar el desplazamiento propuesto, todas validadas con el mismo
      esquema Zod que use el formulario.
- [ ] Formateo de horas **en servidor**, en la zona del centro, bajando como cadena. Con
      **`@date-fns/tz`** (`TZDate`, `tz`) — **no `date-fns-tz`**, que es el de v2/v3.

## Criterios de aceptación (verificables)

- [ ] **Automático** — serie de ocho sesiones los martes a las 12:00 `Europe/Madrid`
      creada el 1 de febrero: las ocho citas tienen la **misma hora local** y **dos
      `inicio` distintos en UTC** a un lado y otro del cambio de marzo.
- [ ] **Automático** — serie que cae en el hueco del último domingo de marzo a las 02:30:
      la cita existe, su `inicio` es el primer instante válido posterior y
      `motivo_desviacion = 'anomalia_horaria'`.
- [ ] **Automático** — serie que cae en el solapamiento de octubre: se elige la primera de
      las dos ocurrencias, y queda marcada igual.
- [ ] **Automático** — desplazar una cita a mano y luego editar la serie con «esta y las
      siguientes»: la desplazada **conserva** su hora.
- [ ] **Automático** — «esta y las siguientes» sobre una serie con tres citas pasadas:
      las tres pasadas quedan **byte a byte iguales**; intentarlo por SQL directo **falla**
      por disparador.
- [ ] **Automático** — cambiar `centros.zona_horaria`: **ninguna** fila de `citas` cambia,
      y aparece **una** fila de outbox con las citas futuras afectadas.
- [ ] **Automático** — crear una serie que pisa un festivo de `disponibilidad`: esa sesión
      **no** se materializa encima; queda como propuesta pendiente de confirmar.

## Guion de comprobación manual

1. `npx supabase db reset && npm run seed`.
2. Crear una serie de ocho sesiones que cruce el último domingo de marzo.
3. Comprobar en Studio que la hora local es la misma en las ocho y el UTC cambia.
4. Mover la quinta media hora, editar la serie con «esta y las siguientes» y comprobar que
   la quinta no se mueve.

## Notas para el agente

- **Todo el cálculo de fechas en servidor.** Ni un `new Date()` en cliente: hidratación, y
  además el navegador está en la zona del usuario, no en la del centro.
- El diseño tiene que decir **dónde** se materializa: función de Postgres o Server Action.
  Hay argumentos para las dos; lo que no vale es que estén en ambas.
- La lista de zonas se valida con `es_zona_iana()` (T-001) contra `pg_timezone_names`. Solo
  nombres IANA: ni offsets fijos ni abreviaturas.
- «Todas» no aparece en ningún menú, ni desactivada. Una opción gris revela que existe.
- Las pruebas de marzo y octubre son las que descubren los bugs. Escríbelas primero.

## Anexos

- Diseño aprobado: `tickets/T-011/diseno.md` (239 líneas).

## Verificación · 11-09-2026

Ejecutada contra la base local de verdad, sobre `T-011a-series-materializacion`
(`efc3ad6`), antes de tocar una línea. **Los siete criterios automáticos pasan**, dentro de
`npm run test:rls`: **325 aserciones, cero fallidas, 17 módulos**.

**La prueba que decide, y que no es volver a correr el banco.** El criterio 3 —el solape de
octubre— tiene tres aserciones, y dos de ellas siguen verdes con la respuesta equivocada:
una cita a las 02:30 lee «02:30 local» tanto si se eligió la primera ocurrencia como la
segunda. Se mutó `resolver_hora_local()` cambiando `least()` por `greatest()` en la rama
`ambigua` —es decir, eligiendo la SEGUNDA de las dos—, `db reset` y banco:

    NOTICE:  OK: Criterio 3: la cita del solape de octubre existe y queda marcada anomalia_horaria
    NOTICE:  OK: Criterio 3: el instante elegido lee 02:30:00 en hora local
    ERROR:   ASERCIÓN FALLIDA: GEMELA (discrimina de verdad): una hora UTC más tarde
             TAMBIÉN lee 02:30:00 — confirma que la hora era ambigua de verdad y no una
             elección arbitraria
    npm run test:rls → código 3

Las dos primeras siguen en verde; **solo cae la gemela**. Revertida la mutación, el banco
vuelve a 0. La gemela del §10 del diseño era necesaria y está bien puesta: sin ella, este
ticket habría entrado eligiendo la ocurrencia equivocada de octubre sin que nada avisara.

**Las demás puertas**, todas limpias: `npx supabase db reset`, `npm run lint`,
`npm run lint:migraciones` (10 migraciones), `npx vitest run` (**382 pruebas, 38 ficheros**)
y `npm run build`. Comprobado además que el disparador `sellar_version_nota` y los seis de
`citas` existen DESPUÉS del reset, que es la trampa de Docker ya pagada en T-005.

**Dos comprobaciones vivas que el banco no hace**, contra la base y con `rollback`:

| Qué | Resultado |
|---|---|
| `update centros set zona_horaria = zona_horaria` (no-op) | **cero** filas de outbox: la guarda `is not distinct from` está puesta. Es el patrón del UPDATE espurio que mordió en T-005 |
| Privilegios de `anon`/`authenticated` sobre las dos tablas nuevas | `eventos_salientes`: **ninguno**, ni select. `propuestas_cita`: **solo `select`**. RLS activada en las dos. **Sin `TRUNCATE`** — la concesión por defecto que T-004 obliga a revocar |

## Revisión con Opus · 11-09-2026 — dos hallazgos MEDIA, los dos arreglados

Los dos se reprodujeron contra la base antes de arreglarlos, y los dos tienen ahora su
aserción en `scripts/rls/16-series.sql` §L, **demostrada roja con el arreglo quitado**.

### MEDIA · La cita que nace de una propuesta perdía el tipo de terapia

`agenda_confirmar_propuesta()`, en la rama sin `cita_id` —la que crea una cita nueva desde
una propuesta de festivo, ausencia u ocupada—, **no escribía `tipo_terapia_id`**, porque
`propuestas_cita` no lleva esa columna. Reproducido: serie con tarifa, festivo dentro,
confirmar la propuesta.

    serie.tipo_terapia_id = a1900001-0000-4000-8000-000000000001
    cita confirmada.tipo_terapia_id = NULL

No es cosmético: `tipos_terapia` es donde viven **`tarifa_base` y `regimen`** (el régimen de
IVA). Una sesión desplazada por un festivo nacía sin precio y sin régimen. Y **la pérdida
era definitiva**: en cuanto la sesión pasa, `fn_proteger_cita_pasada()` prohíbe cambiar
`tipo_terapia_id`, así que ya no hay forma de corregirla — ni por la aplicación ni por SQL.
El banco no lo veía porque sus aserciones del criterio 7 comprueban `desviada` y
`motivo_desviacion`, no el tipo.

**Arreglado** recuperándolo de `series_cita`, que es de donde nació la propuesta. Si la
propuesta no cuelga de una serie queda `null` como antes: no hay de dónde sacarlo y no se
inventa. Las propuestas nacidas de un evento siempre traen `cita_id`, así que van por la
otra rama —mover una cita existente— y nunca perdieron nada.

**Negativa**: §L.1 del banco. Con el arreglo quitado (`v_tipo_terapia_id` → `null`):

    ERROR:  ASERCIÓN FALLIDA: REVISIÓN: la cita creada al confirmar una propuesta
            CONSERVA el tipo_terapia_id de su serie
    npm run test:rls → código 3

### MEDIA · «Esta y las siguientes» resolvía contra el evento equivocado, y en silencio

`agenda_editar_serie()` buscaba el evento que acababa de provocar con **«el más reciente de
esta serie»**:

    select e.id into v_evento_id from public.eventos_salientes e
     where e.tipo = 'agenda.regla_serie_cambiada'
       and e.carga ->> 'serie_id' = v_serie_id::text
     order by e.creado_en desc limit 1;

`creado_en` es `now()`, que **no avanza dentro de una transacción**: dos ediciones seguidas
en la misma transacción empatan y el desempate cogía la vieja. Reproducido —serie a las
11:00, editar a 16:00, editar a 17:00, misma transacción—:

    r1: {"alcance":"esta_y_siguientes", "evento_id":"c6d2b030-…", "propuestas":[3 ids]}
    r2: {"alcance":"esta_y_siguientes", "evento_id":"c6d2b030-…", "propuestas":[]}
    propuestas por hora: 16:00:00 x3
    regla vigente de la serie: 17:00:00

El **mismo `evento_id`** en las dos llamadas. La segunda edición reprocesa el evento de la
primera, la idempotencia por `(evento_id, cita_id)` hace lo correcto y no crea nada, y el
resultado es el peor posible: **la regla queda a las 17:00, las citas siguen a las 11:00 y
no hay ni una propuesta pendiente que lo reconcilie**. Sin error y sin aviso.

PostgREST da una transacción por llamada, así que desde la pantalla dos ediciones seguidas
no empatan por `now()`. Pero la consulta es **por contenido, no por identidad**: dos
ediciones concurrentes de la misma serie resuelven las dos contra la misma fila y reproducen
el fallo por otro camino. Y el banco entero corre en UNA transacción, que es donde apareció.

**Arreglado** publicando la identidad: `fn_evento_regla_serie()` hace
`set_config('app.agenda_evento_regla', <id>, true)` con el evento que acaba de insertar, y
`agenda_editar_serie()` limpia el ajuste **antes** de tocar la regla y lee después lo que
haya quedado. Si la regla no cambió de verdad no queda nada, y se devuelve la rama de «sin
evento que resolver» — que antes reprocesaba el último de la serie.

**Negativas**: §L.2 del banco, tres aserciones más la gemela de la edición que no cambia
nada. Con el arreglo quitado (vuelta al `order by creado_en desc`):

    ERROR:  ASERCIÓN FALLIDA: REVISIÓN: dos ediciones en la MISMA transacción
            resuelven contra eventos DISTINTOS
    npm run test:rls → código 3

### Después de los dos arreglos

`npm run test:rls`: **331 aserciones, cero fallidas** (325 + las 6 de §L). `npm run lint`,
`npm run lint:migraciones`, `npx vitest run` (382 pruebas) y `npm run build`, limpios.
`npm run tipos` **sin deriva**: ninguno de los dos arreglos cambia una firma.

### Anotado, no arreglado — no es de este ticket

1. **`scripts/rls/14-cadena-huellas.sql` miente en su cabecera**: dice «Al ser el último,
   nada corre después», y desde T-010 corren `15-agenda` y `16-series` detrás. Hoy es
   inofensivo —el módulo restaura el `grant` y el disparador que levanta (líneas 579-581) y
   ni 15 ni 16 tocan `notas_clinicas_versiones`—, pero es una afirmación falsa justo en el
   sitio donde el próximo módulo irá a buscar la regla.
2. **La aserción byte a byte del criterio 6 compara en un solo sentido**
   (`después EXCEPT antes`, sin contar filas), así que **no vería un borrado**. La del
   criterio 5 sí lo ve, porque añade `count(*) = 3`.
3. **`agenda_propuestas_de_evento()` marca el evento `entregado` aunque solo haya procesado
   una parte**: con un evento de centro que afecta a varios profesionales, quien llame
   primero omite las citas que no le tocan —correcto— y deja el evento marcado como
   resuelto. Nada se pierde hoy (la función no mira el estado, y el siguiente llamante
   todavía crea las suyas), pero el consumidor de T-015 no volverá a barrerlo.
4. **Las propuestas nacidas de un evento no guardan `serie_id`** aunque la cita pertenezca a
   una serie. `listarPropuestasPendientes()` no filtra por serie, así que hoy no se nota;
   quien quiera «las propuestas de esta serie» no las encontrará.
5. **`listarPropuestasPendientes()` devuelve `[]` cuando la consulta falla** (registra en
   `console.error` y sigue). En una pantalla de propuestas pendientes, un fallo de lectura
   se ve igual que «no hay nada que decidir». El resto del módulo devuelve `ResultadoCitas`.
6. **`resumirPropuesta()` devuelve `fechaPrevistaCorta` sin formatear**: es la cadena ISO
   cruda (`2027-04-15`), no la fecha corta en castellano que da `formatearFechaCorta()` para
   las citas. Lo verá el corte de MiniMax (T-011b).
7. **Ni las políticas de T-010 ni las funciones de dominio exigen
   `es_profesional_asignado(paciente_id)`**: un profesional puede crear una serie o una cita
   para un `paciente_id` que no tiene asignado. No filtra nombres —`citas_agenda` solo
   expone ids y `pacientes` sigue cerrada por RLS— y **viene de T-010**, no de aquí: la
   función de dominio replica el predicado de `citas_alta` tal cual, como mandaba el diseño.
   Va al ticket que lo creó.

## Los siete anotados, decididos · 11-09-2026

Decisión del propietario sobre cada uno de los hallazgos de §«Anotado, no arreglado».
Cuatro se arreglan aquí, uno pasa a T-015 y uno abre ticket propio.

| # | Decisión | Dónde queda |
|---|---|---|
| 1 · cabecera de `14-cadena-huellas.sql` | Corregir el comentario ahora | este ticket |
| 2 · el byte a byte del criterio 6 | Añadir el recuento ahora | este ticket |
| 3 · evento «entregado» a medias | Pasar a T-015 con nota | `tickets/T-015-…` §Heredado de T-011a |
| 4 · propuestas sin `serie_id` | Rellenarlo desde la cita | este ticket |
| 5 · `listarPropuestasPendientes()` devolvía `[]` | Devolver `ResultadoCitas` | este ticket |
| 6 · fecha prevista sin formatear | Formatear en servidor | este ticket |
| 7 · vínculo con el paciente en el alta | Ticket de corrección sobre T-010 | `tickets/T-029-vinculo-en-el-alta-de-agenda.md` |

### 1 · La cabecera ya no miente, y dice qué comprobar

`scripts/rls/14-cadena-huellas.sql` decía «Al ser el último, nada corre después». Ahora
dice que **ya no es el último**, nombra a los dos que corren detrás y deja escrito por qué
sigue siendo seguro —devuelve los cerrojos al final de su sección D, y ni 15 ni 16 tocan
`notas_clinicas_versiones`—, que es lo que tendrá que volver a comprobar quien añada un
módulo 17.

### 2 · El criterio 6 ya vería un borrado, y está demostrado que antes no

Se añade el recuento que ya tenía el criterio 5. **Las dos mitades de la demostración**,
inyectando un `delete` de la cita futura del centro B justo después del cambio de zona:

    con el recuento puesto   → ASERCIÓN FALLIDA: Criterio 6: … ni se lleva ninguna por
                               delante                              (test:rls → código 3)
    con el recuento quitado  → el banco entero pasa EN VERDE        (test:rls → código 0)

Verde con una cita borrada delante. Eso era exactamente el hueco.

### 4 · La propuesta guarda su serie

`agenda_propuestas_de_evento()` copia `serie_id` de la cita (null si la cita es suelta, que
es lo correcto). Dos aserciones nuevas en §L.2, y la que discrimina **no fija un número**:
compara los dos caminos —buscar por serie contra buscar por cita— y exige que no sea cero.
La primera versión de esta aserción sí fijaba un número, tres, y se puso roja: la segunda
edición de la serie crea su propio evento y por tanto tres propuestas más. Se cambió la
aserción, no el número.

**Negativa**: con `serie_id` puesto a `null` en el insert, `test:rls` sale con código 3 en
«buscar las propuestas del cambio de regla POR SERIE da lo mismo que buscarlas por cita».

### 5 · Un fallo de lectura ya no se disfraza de «no hay nada pendiente»

`listarPropuestasPendientes()` devuelve `ResultadoCitas<{ propuestas }>` como el resto del
módulo. Nace `lib/citas/propuestas.test.ts` con tres pruebas y un doble mínimo del cliente
de Supabase: el camino bueno, **la lista vacía de verdad** (`ok` con cero propuestas) y el
fallo (`ok: false`, `motivo: 'no_autorizado'`). Las dos primeras son las que separan
«vacío» de «roto», que era justo lo que la firma anterior no dejaba distinguir.

**Esto cambia el contrato que consume T-011b**: `minimax/cortes/T-011.md` describe la firma
vieja y **hay que actualizarlo antes de despachar ese corte** — no lo toco desde aquí
porque el pack es de otro carril (`fabrica/ORDEN.md` §Lo que este carril no toca).

### 6 · La fecha prevista baja formateada

`resumirPropuesta()` devuelve `fechaPrevistaCorta` como `01/05/2026`, con el mismo
`formatearFechaCorta()` que las citas. `fecha_prevista` es un `date` sin zona, así que se
ancla **al mediodía** del día en la zona de la propuesta: los saltos de horario caen de
madrugada, y a las 12:00 no hay hora inexistente ni ambigua en ninguna zona. Dos pruebas
nuevas, y una de ellas usa **el 29 de marzo** —el domingo del salto— en dos zonas
distintas, que es donde un anclaje a medianoche se habría llevado el día por delante.

### 3 y 7 · Lo que sale de este ticket

- **T-015** gana la sección «Heredado de T-011a», con el código que lo provoca, por qué hoy
  no se pierde nada y las dos salidas posibles para el significado de `entregado`. No es
  una tarea pendiente: es una pregunta que ese ticket tiene que contestar al escribir el
  consumidor, y lleva exigida su negativa.
- **T-029 · El vínculo con el paciente, exigido también al crear agenda** queda escrito,
  `opus`, con la pregunta de dominio delante de todo lo demás: el técnico administrativo
  seguramente sí debe poder citar a cualquier paciente de su centro, y el profesional
  probablemente no — salvo que citar sea justamente cómo se crea el vínculo. Esa respuesta
  se escribe como ADR antes de tocar una política.

### Después de las seis intervenciones

`npm run test:rls`: **333 aserciones, cero fallidas**. `npx vitest run`: **387 pruebas**, 39
ficheros. `npm run lint`, `npm run lint:migraciones`, `npm run build` y `npm run tipos`
—sin deriva—, limpios.
