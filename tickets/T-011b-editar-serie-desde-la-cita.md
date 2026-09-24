---
id: T-011b
titulo: Editar una serie «desde esta cita» — ancla, día de la semana y duración
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-011]
bloquea: [T-014]
estado: pendiente
territorio:
  - supabase/migrations/*_editar_serie_desde_la_cita.sql
  - lib/supabase/tipos-bd.ts
  - scripts/rls/16-series.sql
  - scripts/rls/README.md
  - lib/citas/esquemas.ts
  - lib/citas/esquemas.test.ts
  - lib/citas/series.ts
---

# Contexto

`agenda_editar_serie(…, 'esta_y_siguientes', …)` (T-011) cambia la regla de `series_cita`, el
disparador `fn_evento_regla_serie()` publica un evento `agenda.regla_serie_cambiada` y
`agenda_propuestas_de_evento()` crea una propuesta por cita, que se confirma una a una (ADR-034:
nada se recalcula solo). Dos defectos, anotados en `tickets/T-014/diseno.md` §0:

- **H8.** El evento recoge **todas** las citas futuras no desviadas de la serie, también las
  anteriores a la cita elegida
  (`supabase/migrations/20260910120000_series_materializacion_desviaciones.sql:503-509`).
  «Esta y las siguientes» se comporta como «todas las futuras».
- **H9.** La propuesta conserva la **fecha** de cada cita y solo cambia la hora
  (`…:1033-1046`). Cambiar el día de la semana no mueve ninguna cita de día, y la duración de la
  propuesta es la de la cita, no la de la regla nueva. Un cambio de día o de duración no llega a
  las citas ya materializadas.

El propietario decidió el 24-09-2026 **arreglar las series antes de T-014** (opción B de D6 en
`tickets/T-014/diseno.md` §2), en lugar de limitar la opción en la interfaz. Con este ticket,
T-014 puede ofrecer «esta y las siguientes» al arrastrar a otro día sin restricciones.

El **ADR-068** (24-09-2026) cierra las tres preguntas de la primera versión del diseño:

1. Una propuesta que se queda vieja sigue en «Por confirmar» y se rechaza al confirmarla, con
   `22023` y su motivo legible. Nada se descarta solo.
2. Se retira el `UPDATE` directo de `authenticated` sobre `series_cita`, en este ticket. La regla
   solo cambia por `agenda_editar_serie`.
3. La regla mensual es la de `ocurrencias_serie`: mismo ordinal que la fecha de destino y, si el
   mes no lo tiene, el último de ese día. El diálogo de T-014 pregunta si la serie se mantiene o
   se modifica y dice en qué se convierte. Para eso, este ticket expone la regla resultante
   **antes de confirmar**, desde la base. «Mantener la serie» es mover solo esa cita con `esta`,
   que ya existe.

Condiciones que no cambian:

- Se mantienen las propuestas del ADR-034: nada se mueve sin confirmarlo.
- Las migraciones solo van hacia delante.
- Los cambios de hora se resuelven como en ADR-034: hueco hacia delante, solape a la primera, y la
  cita queda marcada `anomalia_horaria`.
- Las citas desviadas, pasadas y en curso no las gobierna la serie.
- El cambio de zona del centro sale por el mismo camino (`agenda_propuestas_de_evento` y
  `agenda_confirmar_propuesta`) y queda cubierto con las mismas guardas.

El diseño completo está en `tickets/T-011b/diseno.md`. **Léelo antes de tocar nada.**

# Tareas

- [ ] **Migración nueva** `supabase/migrations/<sello>_editar_serie_desde_la_cita.sql`, con el
      sello posterior a la última migración de `main` en el momento de fusionar:
  - [ ] `revoke update on table public.series_cita from authenticated`. La política
        `series_cita_modificacion` se conserva, dormida y comentada (diseño §1.0).
  - [ ] Función pura nueva `public.fecha_en_regla_nueva(…)`, que da la fecha nueva de una cita
        (diseño §1.1).
  - [ ] Función nueva `public.calcular_propuesta_de_evento(…)`. Es la única fuente del cálculo de
        una propuesta, al crearla y al confirmarla (§1.2).
  - [ ] Ayudantes internos nuevos, sin `EXECUTE` para nadie: `public.citas_afectadas_por_regla(…)`,
        el conjunto de citas desde la ancla (§1.2a), y `public.plan_edicion_serie(…)`, la
        validación de la ancla y la regla nueva (§1.2b).
  - [ ] `create or replace` de `fn_evento_regla_serie()`: acota la carga a partir de la cita ancla
        y la amplía con `periodicidad`, `desde_cita_id`, `fecha_origen` y `fecha_destino` (§1.3).
  - [ ] `drop function` + `create` de `agenda_editar_serie` con el argumento nuevo
        `p_fecha date default null`, validación de la cita ancla y publicación del ancla (§1.4).
  - [ ] `create or replace` de `agenda_propuestas_de_evento()`: usa la función común, y una
        propuesta que caería en el pasado queda sin hora (§1.5).
  - [ ] `create or replace` de `agenda_confirmar_propuesta()` con las guardas nuevas, cerrojo de
        filas y la marca `anomalia_horaria` (§1.6).
  - [ ] Función nueva de solo lectura `public.agenda_previsualizar_edicion_serie(p_cita_id,
        p_fecha, p_dia_semana, p_hora_local, p_duracion_minutos, p_zona_horaria) returns jsonb`:
        la regla resultante (frecuencia, día, hora, duración, zona, ordinal, «último» y recorte) y
        la fecha nueva de cada cita, sin escribir nada (§1.10).
  - [ ] Revoke, grant y comentarios de todo lo anterior (§1.7).
- [ ] `npx supabase db reset` y `npm run tipos`. `lib/supabase/tipos-bd.ts` se regenera y no se
      edita a mano.
- [ ] **Banco**: sección M nueva al final de `scripts/rls/16-series.sql`, según §3 del diseño.
      Las secciones G y L.2 no se tocan y siguen en verde.
- [ ] **TypeScript**:
  - [ ] `esquemaEditarSerie` gana `fecha` (AAAA-MM-DD y fecha de calendario real). Está prohibida
        con `esta`, y debe coincidir con `diaSemana` si vienen las dos.
  - [ ] `editarSerie` pasa `p_fecha`.
  - [ ] Casos nuevos en `esquemas.test.ts`.
- [ ] Una frase en la fila del módulo 16 de `scripts/rls/README.md`.

# Criterios de aceptacion

1. `npx supabase db reset` aplica todas las migraciones, la nueva incluida, sin errores.
   `npm run lint:migraciones` pasa.
2. **Las pruebas nuevas muerden.** Con la sección M escrita y **sin** la migración nueva (tras
   `db reset`), `npm run test:rls` sale con código distinto de cero. La primera aserción fallida
   es la de M.1 (H8): `ASERCIÓN FALLIDA: M.1 · …`. Se pega esa salida en la evidencia.
3. Con la migración aplicada, `npm run test:rls` pasa con exit 0, con todas las secciones
   anteriores de `16-series.sql` (en particular G y L.2) y los módulos 00-17 intactos.
4. **H8, el alcance parte de la cita elegida** (M.1). En una serie semanal de seis citas futuras,
   editar desde la tercera deja en `citas_afectadas` exactamente las citas 3 a 6, en orden de
   inicio. Las citas 1 y 2 no reciben propuesta y la carga lleva `desde_cita_id` = la tercera.
5. **H9, cambio de día** (M.2). La misma edición con `p_fecha` = la fecha de la tercera + 2 días
   (y hora 10:00) propone para cada cita 3 a 6 **su misma semana ISO, el día nuevo, a las 10:00
   locales**. La propuesta de la ancla cae exactamente en `p_fecha`. Con `p_fecha` = +7 días
   (M.3), cada propuesta es su fecha + 7.
6. **H9, duración** (M.4). Con `p_duracion_minutos => 80`, toda propuesta tiene
   `fin_propuesto - inicio_propuesto = 80 min`. Tras confirmar la de la ancla, la cita dura
   80 min y **no** queda desviada.
7. **Cambio de hora, días de 23 y 25 h** (M.5, M.6). Anclas relativas a `now()` (el último
   domingo de marzo y de octubre del año que viene), nunca un año fijo:
   - (a) Una serie semanal de martes que cruza el domingo de octubre, editada desde la primera a
     jueves 12:00 y 60 min: todas las propuestas son jueves a las 12:00 locales, con **dos**
     horas UTC distintas y 60 min de duración. Lo mismo cruzando marzo.
   - (b) Una serie de domingos llevada a las 02:30: la propuesta del domingo de marzo es a las
     03:00 locales. Confirmada, la cita queda `desviada` con `anomalia_horaria`, y la de un
     domingo normal no queda desviada.
   - (c) La del domingo de octubre es la **primera** 02:30 (una hora después, el reloj local
     vuelve a leer 02:30) y, confirmada, queda `anomalia_horaria`.
Todas las negativas de guarda de los criterios 8 a 11 y 16 usan
`pg_temp.assert_lanza_codigo_msg` con el fragmento de mensaje de la tabla del diseño §3. Las
guardas dan `22023`, así que el código solo no dice qué guarda mordió. Las de permisos (criterios
11 y 16) dan `42501`, también con su fragmento.

8. **Citas desviadas, pasadas y en curso** (M.7):
   - (a) `agenda_editar_serie(…, 'esta_y_siguientes', …)` sobre una cita pasada, en curso,
     desviada o cancelada da `22023`, y no crea ni el evento ni la propuesta.
   - (b) Editando desde una cita futura, ninguna cita pasada, en curso o desviada entra en
     `citas_afectadas`. Las pasadas y en curso quedan idénticas byte a byte.
   - (c) Una propuesta cuya cita se desvía a mano después de crearla, pasa a cancelada o empieza
     (`inicio <= now()`) no se confirma: `22023`, y la cita no cambia.
9. **Propuestas que ya no valen** (M.8):
   - (a) Tras dos ediciones seguidas (16:00 y 17:00), confirmar la propuesta de las 16:00 da
     `22023` («la serie ya tiene otra regla») y la de las 17:00 se confirma.
   - (b) Hay dos desplazamientos puros desde la misma ancla (+7 y +14 días, con la misma regla).
     Una vez confirmado el de +14, confirmar el de +7 da `22023` por frescura: recalculado desde la
     cita movida, ya no da el instante propuesto.
10. **Cambio de zona del centro, el mismo camino** (M.9), en un centro propio de la prueba:
    - (a) Cambiar la zona a `Asia/Tokyo` con una cita a `now() + 30 min` crea para ella una
      propuesta **sin hora**, y confirmarla da `22023`.
    - (b) Una propuesta de zona cuya cita se movió después da `22023`.
    - (c) Una propuesta de zona, cuando el centro ha vuelto a cambiar de zona, da `22023`.
    - (d) La gemela positiva: una propuesta de zona intacta se confirma, y una cita desviada
      conserva `desviada = true`.
11. **El `UPDATE` directo ya no entra, y el camino sin ancla sigue igual** (M.10):
    - (a) Como profesional dueño de la serie, un `update` directo de `series_cita.dia_semana` da
      `42501` con el fragmento `permission denied for table series_cita`. La fila no cambia y no
      se crea evento. La gemela: `agenda_editar_serie(…, 'esta_y_siguientes', p_dia_semana => …)`,
      como el mismo profesional, sigue creando el evento y las propuestas.
      `has_table_privilege('authenticated', 'public.series_cita', 'update')` es falso; `select` e
      `insert` siguen concedidos.
    - (b) Un `UPDATE` directo **como `postgres`** (el dueño de la tabla) crea un evento con todas
      las futuras no desviadas y `fecha_origen` nulo. `agenda_propuestas_de_evento()` propone
      para cada una el día nuevo de **su** semana ISO.
12. **Mensual** (M.11). En una serie mensual del 2.º martes, editar desde la 2.ª cita con
    `p_fecha` = el 3.er jueves de su mes propone el 3.er jueves de cada mes siguiente. La
    función pura recorta al último jueves cuando el mes no tiene quinto.
13. **La nueva firma**:
    - `authenticated` tiene `EXECUTE` sobre
      `agenda_editar_serie(uuid, alcance_cambio_serie, estado_cita, text, timestamptz, timestamptz, smallint, time, smallint, text, date)`.
    - `anon` no lo tiene. La firma de 10 argumentos ya no existe.
    - `anon` y `authenticated` no tienen `EXECUTE` sobre `calcular_propuesta_de_evento`,
      `citas_afectadas_por_regla` ni `plan_edicion_serie`.
    - `authenticated` tiene `EXECUTE` sobre
      `agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text)`, y `anon` no.
    - Todo se comprueba con `has_function_privilege` y `to_regprocedure` en M.12.
14. `npm run tipos` regenera `lib/supabase/tipos-bd.ts` con `p_fecha` en `agenda_editar_serie` y
    con `agenda_previsualizar_edicion_serie`.
    `npm test` pasa, con los casos nuevos de `esquemas.test.ts`:
    - `fecha` válida con `esta_y_siguientes`;
    - rechazada con `esta`;
    - `'2027-02-30'` rechazada;
    - `fecha` y `diaSemana` que no coinciden, rechazadas.
15. `npm run lint`, `npm run build` y `node ~/.claude/pipeline/territorio.mjs T-011b` limpios.
16. **La previsualización dice en qué se convierte la serie, sin cambiar nada** (M.13):
    - (a) En una serie mensual del 2.º martes, previsualizar desde la cita de un mes con cinco
      jueves con `p_fecha` = su 5.º jueves da `ordinal = 5`, `ultimo` y `recorte` verdaderos.
      Cada cita cae en el último jueves de su mes; la del mes siguiente, que no tiene quinto,
      está `recortada`.
    - (b) En una serie semanal, `ordinal` es nulo y `recorte` falso.
    - (c) Es de solo lectura: no cambian ni los eventos, ni las propuestas, ni la fila de la
      serie, ni los GUC `app.agenda_regla_ancla` y `app.agenda_evento_regla`.
    - (d) Con los mismos argumentos, `agenda_editar_serie` crea exactamente las propuestas que
      la previsualización anunció: mismas citas, fechas, inicios y fines.
    - (e) Sin cambio de regla ni de fecha, `cambia = false` y ninguna cita.
    - (f) Un profesional ajeno recibe `42501`; una ancla desviada, o una fecha y un día que no
      coinciden, `22023` con el fragmento de su guarda.

# Fuera de alcance

- Cualquier pieza de interfaz, incluida la rama «esta y las siguientes» del diálogo de T-014,
  que la implementa T-014 contra esta firma.
- Recalcular las propuestas pendientes de `festivo`, `ausencia` y `ocupada` (sin cita), y descartar
  propuestas automáticamente.
- Un consumidor del outbox para los eventos creados fuera de `agenda_editar_serie` (T-015).
- El diálogo «mantener o modificar la serie», la frase en castellano que describe la regla y el
  envoltorio TS de la previsualización: T-014.
- Corregir la deriva del ordinal de `ocurrencias_serie` tras un recorte, y retirar el `insert`
  directo sobre `series_cita` (hallazgos 5 y 6 del diseño).
- Recalcular `fin_el` o `sesiones_totales` de la serie tras desplazarla.
- Las transiciones de estado del ADR-045 y los mensajes de `lib/citas/errores.ts`.

# Anexos

- Diseño: `tickets/T-011b/diseno.md`.
