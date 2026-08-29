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
