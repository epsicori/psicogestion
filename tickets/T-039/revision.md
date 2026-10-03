**HAY ALTA**: 2, las dos del revisor A (A-H1, A-H2). El revisor B no añade ninguna ALTA (3 MEDIA, 1 BAJA). Total conjunto: 2 ALTA, 3 MEDIA, 1 BAJA (revision.json).

# T-039 · Revisión

## Revisor A

Foco: SQL (migración `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql`, RLS,
funciones definer, disparadores, cadena). Commit `80a99b6`. **2 ALTA, 0 MEDIA, 0 BAJA.**
Las sondas se ejecutaron en `begin … rollback` contra `supabase_db_Psicogestion` (ya en
`20261007120000`), con `00-ayudantes`, `01-fijacion` y la fijación del banco 23 tal cual.

### ALTA

**A-H1 · El oráculo que la tarea 3 cierra sigue abierto por `paciente_id`.**
`supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:370` (disparador
`before … update of episodio_id, paciente_id, profesional_id`), con el `grant update (… paciente_id …)`
de la línea 66 y la política `citas_modificacion`, que deja al administrador actualizar cualquier cita.
Cerrar `episodio_id` por privilegio no basta: el administrador cambia el **paciente** de una cita que
ya tiene episodio, y el disparador le contesta si ese paciente es participante.
- Escenario (medido como ADM, sin PIN): cita de P39 (Sofía) en EP39 (pareja).
  - `update public.citas set paciente_id = :H39 where id = <cita>` da 23514 «no es titular ni
    participante del episodio».
  - Tras dar de alta a H39 (Hugo) en EP39, la misma sentencia da **éxito**.
  - Con V39 (baja hoy) en una cita a +12 días, da 23514 «no estaba de alta en el episodio el día de
    la cita». Así distingue «nunca estuvo» de «estuvo y se fue».
  - Es literalmente el ejemplo del contrato (tarea 3: «si Hugo es participante del episodio que el
    administrador ve en la cita de Sofía… el oráculo es el éxito»).
  - El mismo camino le sirve a PRO1 sin PIN sobre sus episodios, que la tabla de la tarea 12 pone
    «con PIN».
- Origen: la tarea 6 del contrato pide el 23514 al cambiar `paciente_id`, y la tarea 3 prohíbe el
  oráculo. El diseño (§1.6, D1) solo cierra la columna `episodio_id`.
- El banco no lo ve: 23.C6 prueba el `update paciente_id` solo como `postgres`, y la sección W solo
  prueba la columna cerrada.
- Lo decide el propietario. Por ejemplo, una cita con episodio no cambia de paciente fuera de
  una definer: siempre 42501, coherente o no, para que el éxito no informe.

**A-H2 · La herencia de la serie es un oráculo silencioso, y con fecha al día.**
`supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:283-295`.
- La herencia toma la serie por `new.serie_id` y no comprueba que la serie sea del mismo paciente
  (ni del mismo profesional) que la cita.
- `serie_id` está en el `grant insert` (línea 62), y el administrador lee `citas.episodio_id`
  (uuid opaco, tarea 12).
- Escenario (medido como ADM): existe una serie de P39 en EP39.
  - `insert into public.citas (paciente_id, profesional_id, centro_id, serie_id, inicio, fin,
    zona_horaria) values (:Q39, :PRO1, :CA, <serie de P39>, …)` entra **sin error**. Al releerla
    como ADM, `episodio_id = EP39`: Q39 es participante.
  - Con R39 o con H39, la cita nace con `episodio_id` nulo: no lo es.
  - Con V39 sobre la serie de W39 en EB39, la cita de hoy hereda EB39 y la de mañana queda nula.
    Eso da la `baja_en` exacta, día a día, que es justo lo que D6 quería no revelar al reprogramar.
  - No hay ningún 23514 en el log (D5: la herencia no lanza). Además queda una cita de Q39 colgando
    de la serie de P39, un estado incoherente.
- El banco no lo ve: W4 prueba el `insert` con `episodio_id` explícito, nunca con `serie_id`.
- Un arreglo posible es heredar solo si `new.paciente_id` y `new.profesional_id` son los de la
  serie (o solo desde las definer de alta). Lo decide el propietario junto con A-H1.

### Comprobado sin hallazgo

- **§5, `p_episodio_id`.**
  - E1 (técnico, 42501) va antes de leer el episodio.
  - E2 tiene un solo texto para inexistente, ajeno, de otro paciente o administrador, con
    `for share of e`.
  - E3 «cerrado» va detrás de E2.
  - `p_profesional_id` entra en E2.
  - M0 da 22023 antes que `not null`.
- **Re-emisiones.** El diff contra la versión anterior está limpio: `fn_proteger_cita_pasada` solo
  gana los dos `if`. `episodio_para_nota` solo gana el 5b, antes del 6 (y quita `volatile` y
  `security invoker`, que son los valores por defecto). `agenda_crear_serie`, `agenda_crear_cita` y
  `agenda_citas_rango` solo ganan lo nombrado.
- **Privilegios y vista.** El `grant` lleva exactamente las 19 columnas, sin las dos nuevas, y va
  después del `revoke`. `citas_agenda` conserva `security_invoker=false` y `security_barrier`, con
  `modalidad_asistencia` al final.
- **Nulos.**
  - `cita_episodio_coherente` es un `exists` y nunca da nulo.
  - `episodio_id` nulo sale en el paso 2.
  - Un `cita_id` nulo en la nota sale enseguida.
  - Con `auth.uid()` nulo, la nota se comprueba (no se salta).
- **Candados.** Los cuatro están:
  - `for share` del episodio y de los participantes (§1.6);
  - `for no key update` de la cita en el disparador de la nota;
  - `for update` en `agenda_cambiar_episodio_cita`;
  - `for share` de la serie en la herencia.
- **Técnico.**
  - Ningún `raise` de §1.6 es alcanzable con `new.serie_id`: la herencia no lanza y la resolución
    es coherente por construcción.
  - No tiene `update` directo de `paciente_id` (T-028a), así que A-H1 y A-H2 no son suyos.
  - Ninguna función devuelve el episodio.
- **Cambio de profesional.** El administrador ya no puede cambiar el `profesional_id` de una cita
  con episodio (V1). No hay ruta de la app que lo haga (las funciones de agenda solo mueven
  `inicio`, `fin`, `estado` y `sala`), así que no es una regresión alcanzable.
- **Cita pasada en un episodio cerrado.** Sin nota, se queda sin camino: 5b da 22023 y
  `fn_proteger_cita_pasada` impide cambiar el episodio. Tiene salida: reabrir el episodio
  (`cerrado_en` es actualizable por su profesional con PIN) y hoy no hay ninguna función que
  cierre episodios. Residuo ya anotado en el diseño (§4, T-034 SQL-H2).

## Revisor B

Foco: cobertura de los criterios en el banco 23, siembra, tipos, llamantes TS de las altas, docs,
alcance y el residuo declarado. Commit `80a99b6`. **0 ALTA, 3 MEDIA, 1 BAJA.**
Sondas en `begin … rollback` contra `supabase_db_Psicogestion` (en `20261007120000`, sembrada).

### Juicio sobre el residuo declarado

Reprogramar una cita fuera de la ventana de su episodio, o cerrar el episodio antes de una cita ya
dada, no revalida la coherencia. **Es aceptable hoy, con una condición que hoy no se cumple (B-H2).**
- Es aceptable porque ninguna ruta de la aplicación cierra un episodio ni da de baja a un
  participante.
- Además, la salida existe: si se reabre el episodio, la nota vuelve a entrar (medido).
- La condición es que el ticket que cierre la puerta de reabrir sepa que esa puerta es la única
  salida de la nota de la cita. Hoy no lo dice ningún sitio.
- Su efecto no es logístico sino clínico: deja una sesión sin poder documentarse.

### MEDIA

**B-H1 · `docs/architecture.md:425`: el párrafo nuevo dice lo contrario de lo medido y omite los
tres residuos que el contrato manda escribir.**
- Qué falta o sobra:
  - Dice «El técnico no elige ni ve el episodio».
  - Omite H25, que el contrato pide expresamente: «Aquí queda escrito en `docs/architecture.md`».
  - Omite el residuo de reprogramar o cerrar fuera de la ventana.
  - Omite el alcance P1. Dice sin matiz «La nota de una cita va en el episodio de la cita».
  - Todo ello lo exigen la tarea 16 y el diseño §1.16.
- Escenario medido, como `k_tec` con `aal2`, sin PIN:
  1. Llama a `agenda_cambiar_asistencia(<cita sembrada de Sofía>, 'online')` y luego a la misma
     con `'presencial'`. La cita queda como estaba.
  2. Lee sus dos filas de `auditoria`, y las dos llevan `episodio_id = e0080001-…-0001`.
  3. Tras dar con `agenda_crear_cita` una cita a Sofía y otra a Hugo, su auditoría enseña el mismo
     uuid en las dos. El técnico deduce así que están en el mismo proceso, que es la modalidad
     relacional que el criterio 3 pone bajo candado.
- Es H25, aceptado por el contrato. Lo que falla es que el documento que manda sobre «quién ve
  qué» afirma lo contrario, y el ticket que cierre H25 no encuentra la pista allí.
- El ida y vuelta de la asistencia es un oráculo de efecto neto nulo sobre cualquier cita de sus
  centros. Conviene que conste en H25 (`docs/state.md:57` solo dice «técnico lee tipos ajenos»).
- Sobre la regla nota-cita sin P1: quien implemente la nota del coterapeuta siguiendo el documento
  le pasaría el episodio de la cita, y `episodio_para_nota` le contestaría 42501 «no vale», porque
  no es suyo.

**B-H2 · `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:719-724`
(paso 5b) con `docs/state.md:43`: la única salida de la trampa del residuo es la puerta que T-034
SQL-H2 va a cerrar, y eso no está anotado.**
- Escenario medido como Ana, con PIN:
  1. Ana tiene una cita futura de Carmen en `k_epi_carmen`.
  2. Hace `update episodios_asistenciales set cerrado_en = now()`, y nada lo impide. La consulta
     de incoherencia pasa de 0 a 2, porque arrastra también la cita sembrada del martes.
  3. Cuando la cita ya es pasada, no hay forma de dejar la nota:
     - `episodio_para_nota(Carmen, null, cita)` da 22023 «El episodio de la cita está cerrado».
     - Con el mismo episodio, da 22023 «El episodio elegido está cerrado».
     - Con otro episodio abierto suyo, da 42501 «no vale».
     - `agenda_cambiar_episodio_cita` da 42501 «no cambia de episodio una vez asignado».
  4. Si reabre (`cerrado_en = null`), devuelve el episodio.
- `docs/state.md:43` dice «T-034 SQL-H2: reabrir esquiva D6». Quien arregle SQL-H2 al pie de la
  letra prohibirá reabrir. Desde ese momento la nota de esa cita no se escribe nunca y su alerta
  `nota_sin_firmar` no se resuelve nunca.
- El diseño y el contrato dicen «va en el ticket que cierre episodios», pero no que reabrir es la
  única salida. La bitácora lo llama residuo sin consecuencia.

**B-H3 · `supabase/seed-completo.sql:563-578`: la siembra inserta las dos citas a mano, contra la
tarea 13 y el diseño §1.15.**
- La tarea 13 dice «todo dado por las funciones de alta, no por `insert` directo, salvo que el
  diseño justifique lo contrario». El diseño §1.15 dice «Se usan las funciones de alta, como pide
  la tarea 13, y no un `insert` directo».
- La siembra hace un `insert` con `episodio_id` y `modalidad_asistencia` fijados a mano, con
  `creada_por = k_ana` y sin pasar por `k_tec`. El comentario no da ninguna justificación.
- Escenario: una regresión en la resolución de `agenda_crear_cita` (E1-E3, `cita_episodio_unico`)
  o en el paso de la modalidad por el técnico deja la demostración igual de bien. El criterio 23
  («online ≥ 1», «`k_epi_pareja` ≥ 1», «0 incoherentes»; medido: 1, 1, 0) sale verde por
  construcción, porque los valores que comprueba son los que la siembra escribe a mano.
- No hay choque de fechas: el martes calculado cae siempre entre hoy + 2 y hoy + 8, lejos del
  festivo (hoy + 14 a + 20), y las citas de Lucía son pasadas.

### BAJA

**B-H4 · `docs/interfaz.md:425-426`: el orden de la línea de la agenda no es el del contrato ni el
del prototipo.**
- Escribe `tipo · modalidad · profesional`, y C14 fija `tipo · profesional · modalidad`.
- Escenario: el ticket de interfaz que pinte la modalidad lee `interfaz.md`, que manda sobre las
  pantallas, y pinta un orden distinto del prototipo. Para alinearlo después habrá que tocar el
  texto y las pruebas de la línea.

### Comprobado sin hallazgo

- **Llamantes TS.**
  - `lib/citas/series.ts:18` llama a `agenda_crear_serie` con argumentos con nombre y sin los dos
    nuevos. Como es drop+create sin sobrecarga, PostgREST lo resuelve y toma los valores por
    defecto.
  - No hay llamante TS de `agenda_crear_cita`.
  - Los bancos 16 y 17 no aseveran su firma, y el 21 está actualizado.
- **Tipos.**
  - `tipos-bd.ts` trae el enum, las columnas, `p_episodio_id?`/`p_modalidad_asistencia?` y las
    funciones nuevas.
  - En `Insert`/`Update` aparecen las columnas cerradas, que es una limitación del generador.
    Ningún llamante las escribe.
- **Territorio.** El banco 21 queda fuera del territorio de la rama, pero está cubierto por la
  ampliación del orquestador en `main` (a3b08c0). Los ficheros `docs/state.md`, la bitácora y
  `tickets/T-039/**` entran por el diseño §6.
- **Criterio 8: celdas sin aserción.**
  - Faltan estas celdas:
    - TEC1: el `update` de citas sin WHERE y el `insert` con `episodio_id`;
    - ADM: el `insert` en `series_cita`;
    - PRO1: el `update` de `series_cita`.
  - Lo descarto: el privilegio por columna es del rol `authenticated`, que comparten los tres. Las
    celdas presentes (W2, W4, W5 y W10) caen con el mismo `grant` que haría pasar las ausentes.
- **Criterio 10 con el técnico.** Solo N2 y N3. `cita_episodio_unico` va dentro de la definer, y
  N2/N3 ya prueban que el rol no cambia la resolución.
- **K4 sin gemela de `paciente_id`.** La gemela de `episodio_id` está en el banco 19:678.
