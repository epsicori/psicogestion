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

## Ronda 2 — revisor B

**Sin ALTA.** 0 ALTA, 1 MEDIA, 1 BAJA. Diff `main...worktree-agent-ad4f297deba7c97ae` (HEAD 31d97f0;
ronda 2 = 7f00448 y 31d97f0).

### Cerrado y comprobado

- **A-H1.** El paso 0 de `fn_velar_episodio_de_cita` va antes de la coherencia y lanza un 23514
  con mensaje constante. D7b (vaciar el episodio y cambiar el paciente a la vez) demuestra que el
  orden importa. D1-D5 comparan las cuatro cadenas, también tras caducar el PIN. D1b y D2b son
  las gemelas permitidas.
- **A-H2.** `serie_id` ya no está en los dos `grant`. La comprobación de la serie (paso 1) va
  antes de `cita_episodio_coherente`.
  - H4 da 42501.
  - H5, como postgres, exige seis cadenas iguales con el 23514 de la serie. Sin el paso 1, H5 no
    lanza; si el paso 1 estuviera solo en la rama coherente, R39 tampoco lanzaría. La aserción
    mordería.
  - Ninguna puerta legítima tropieza con el paso 1: `agenda_confirmar_propuesta` inserta con el
    paciente y el profesional de la serie, y `agenda_actualizar_cita` no cambia ninguno de los dos.
- **Adaptaciones de la sección H.** `id_ser_v` sobre W39/EB39 (S2 rechaza una serie de V39, y el
  diseño ya preveía esta salida) e `id_ser_m` = serie de Q39. Las dos conservan lo que vigila H5.
- **B-H1.** El párrafo ya no dice «no ve el episodio» y nombra H25. Queda a medias: ver R2-B-H1.
- **B-H2.** La sección Z es un cable trampa, con mensajes:
  - Z1 da 22023 «de la cita está cerrado».
  - Z2 reabre y Z3 comprueba que `episodio_para_nota` devuelve ET39, lo que cubre el `no_lanza`
    de 0 filas.
  - X5 pasa a «indicado está cerrado». El fragmento es único en la migración y no casa con el
    22023 del paso 5b.
- **B-H3.** El bloque 8.ter da las dos citas con `agenda_crear_cita` y claims de Ana o del técnico,
  cada una con su guarda `if not exists`, y al final vacía los claims.
  - En la base sembrada por el verificador, la cita de Carmen es online, de `k_epi_carmen` y la
    creó `k_tec`; la de Sofía es de `k_epi_pareja` y la creó Ana.
  - No queda ningún `e0390001`.
  - La guarda depende de `inicio > now()`. Si la siembra se repite cuando la cita ya pasó, se da
    otra. Es lo que pide el diseño, no un hallazgo.
- **B-H4.** `interfaz.md` §14 queda «tipo · profesional · modalidad».
- **Criterio 2.** La aserción A del banco 21 localiza las funciones por nombre en `pg_proc`, tras
  comprobar que existe una sola de cada. No se debilita: sigue comprobando el privilegio sobre el
  oid. Los bancos 16 y 17 no están en el diff.
- **Sección R.** Guarda `tgenabled` y lo restaura con `\gexec`, así que un mutante `disable` ya
  no se deshace antes de Y1.
- **Sondeo, con rollback.** El técnico, con un `update citas set paciente_id` directo, obtiene
  UPDATE 0 por RLS en citas con y sin episodio, así que el paso 0 no le da oráculo.

### MEDIA

- **R2-B-H1 · `docs/architecture.md:427-431` (rama).** El arreglo de B-H1 nombra los residuos por
  su etiqueta («residuo de fechas», «el alcance del P1 queda en el ticket», «P4 = A», H25) sin
  decir qué dejan abierto, y la frase siguiente los contradice como garantía. Además, `:199`
  sigue diciendo que el técnico lee «el tipo» en la auditoría, sin el `episodio_id`.
  - *Escenario P1.* PRO2, coterapeuta de `k_epi_pareja`, escribe su nota con el `cita_id` de la
    cita conjunta de Sofía, pero en su propio episodio. Entra, porque
    `fn_exigir_nota_en_episodio_de_su_cita` vuelve pronto si el autor no es el profesional de la
    cita. Mientras tanto, `:432` afirma sin excepción «La nota de una cita va en el episodio de la
    cita».
  - *Escenario de fechas.* El técnico reprograma con `agenda_actualizar_cita(p_inicio)` la cita
    de Carmen a una fecha posterior al cierre de `k_epi_carmen`. El disparador es
    `of episodio_id, paciente_id, profesional_id` y no corre con `inicio`, así que la cita queda
    en un episodio cerrado antes de su día. La doc, en `:422-424`, sigue diciendo «no cerrado
    antes de ese día (… 23514)», y «residuo de fechas» no avisa de que reprogramar, cerrar o dar
    de baja no se revalida, ni dice quién lo cierra (T-034 SQL-H2).
  - *Escenario P4.* «Riesgo aceptado (P4 = A)» no dice qué se acepta: que el administrador
    deduce, por el `episodio_id` de la cita que acaba de dar, si el paciente es participante de un
    episodio abierto del profesional.
  - *Escenario H25.* Quien lea `:199` para cerrar H25 solo buscará el tipo. No sabrá que
    `episodio_id` también viaja y permite al técnico agrupar parejas o familias por episodio
    compartido, ni que es un bloqueo de producción.

### BAJA

- **R2-B-H2 · `scripts/rls/README.md:49` (rama).** La fila del banco 23 enumera las secciones sin
  D, H ni Z, y repite la S.
  - *Escenario.* Quien implemente T-034 SQL-H2 (revalidar el cierre de episodios) busca en el
    README qué banco cubre los episodios cerrados con citas posteriores. No ve el cable trampa
    23.Z y se lo encuentra al romperlo, sin saber que su rojo es la señal esperada y no una
    regresión.

## Ronda 2 — revisor A

**Sin ALTA.** A-H1 y A-H2 quedan cerrados. Revisado `git diff main...worktree-agent-ad4f297deba7c97ae`
(HEAD 31d97f0), medido en `begin … rollback` contra `supabase_db_Psicogestion` con la migración aplicada.

Comprobado de la lista R2.8 (puntos 1 a 7, de seguridad):
- **A-H1 cerrado.** El paso 0 (`mig:288`) va antes del paso 1 y del 2. Solo mira `old.episodio_id`,
  `paciente_id` y `profesional_id`, y su mensaje es literal. En una cita futura con episodio, los
  BEFORE que corren antes (`calcular_rango_bloqueante` con `profesional_id`, `proteger_cita_pasada`)
  no dependen del paciente nuevo. La RLS `with check` se evalúa después de los BEFORE, así que tampoco
  separa los casos. `insert … on conflict do update` dispara los mismos BEFORE UPDATE. D4, D5 y D7
  comparan cadenas, no solo códigos. D7b cubre el orden respecto al paso 2.
- **A-H2 cerrado.** `serie_id` sale de las dos listas (18 columnas). Como ADM:
  `has_column_privilege(...,'serie_id','INSERT'/'UPDATE') = f`, medido. El 42501 de privilegio sale
  antes de los disparadores y su cadena es constante. La comprobación de la serie (`mig:307`) va antes
  de `cita_episodio_coherente`. Si se devuelve `serie_id` al grant, H2 muere por el código esperado:
  discrimina.
- **Ninguna puerta legítima tropieza con los 23514 nuevos.** Las inserciones con `serie_id` usan los
  valores de la serie: `agenda_crear_serie` (T-039, `mig:1063/1078`) y `agenda_confirmar_propuesta`
  (las dos versiones, con la propuesta, que sale de `p_paciente_id`/`p_profesional_id`). Las propuestas
  de evento llevan `cita_id`, van por la rama `update` y no insertan. La FK sin `on delete` impide que
  ese `cita_id` quede nulo. Ninguna función ni la siembra hacen `update` de `paciente_id` o
  `profesional_id` en `citas`. Los `insert` con `serie_id` del banco 16 (`:357`, `:1265`, `:1618`)
  usan el paciente y el profesional de su serie.
- **Sin oráculo nuevo de participación.** `agenda_crear_cita` y `agenda_crear_serie` dan el mismo
  «no vale» al ADM con `p_episodio_id` (`e.profesional_id = auth.uid()`). `agenda_cambiar_episodio_cita`
  y `episodio_para_nota` se limitan a la cita y el episodio propios. La serie sin episodio elegido
  resuelve con `baja_en is null` y `alta_en <= p_desde`, así que todas sus citas heredan igual. Lo que
  queda es la resolución automática (P4 = A) y H25, los dos escritos en `architecture.md`.

### R2-A-H1 · MEDIA · `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:307` (y `docs/architecture.md:439`)
«Una cita de una serie es del paciente y del profesional de la serie (23514)» solo se comprueba al
INSERTAR. `paciente_id` y `profesional_id` siguen en el `grant update`, y el paso 0 solo corta las citas
con episodio. La razón que R2.2 dio para cerrar `update serie_id` («cualquier edición posterior de la
serie la arrastraría») sigue al alcance por las dos columnas hermanas.
- **Escenario (medido en rollback).** Hay una serie de Lucía con Ana, sin episodio, y una cita futura
  suya. Como ADM: `update citas set paciente_id = <d0080001-…-0003>, profesional_id = <PRO2>` sobre
  esa cita → `UPDATE 1`. Al releer, `mismo_pac = f`, `mismo_pro = f` y `serie_id` es el de la serie de
  Ana.
- **Efecto.** `citas_afectadas_por_regla` (20260925:244) elige por `serie_id`. Un «esta y las
  siguientes» de Ana sobre su serie reprograma la cita que ahora es de PRO2 con otro paciente. Una
  sustitución de una sesión por otro profesional es una reasignación realista. La arquitectura y el
  comentario del paso 1 («ninguna puerta legítima la fabrica») afirman un invariante que la base no
  sostiene.
- **Arreglo en el territorio.** Extender el paso 0 a `old.serie_id is not null` (constante, sin mirar
  la serie), o escribir el alcance real («al crear la cita») y anotarlo.

### R2-A-H2 · MEDIA · `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:68`
La lista nueva por columna sigue concediendo `update (id)`, y `fn_proteger_cita_pasada` (`:557-567`)
no congela `id`. El administrador cambia la identidad de una cita pasada, y el 23503 de la FK de
`notas_clinicas` le dice qué citas tienen nota clínica, aunque no lee ninguna.
- **Escenario 1 (medido).** Como ADM: `update citas set id = 'aaaaaaaa-…-01' where id =
  'e0280004-…-01'` (realizada, de Lucía, pasada) → `UPDATE 1`. Su alerta `nota_sin_firmar`
  (`alertas_documentacion.origen_id`, sin FK) queda huérfana: 1 fila sin cita. La firma de la nota de
  esa sesión ya no la resuelve, y el escalado avisa por una cita que no existe.
- **Escenario 2 (medido).** Una nota de Ana con `cita_id = fce6bc3c…`. ADM ve
  `count(*) from notas_clinicas where cita_id = … = 0`. `update citas set id = … where id = fce6bc3c…`
  da `23503 … violates foreign key constraint "notas_clinicas_cita_id_fkey"`. Sobre `35cb8c96…`, que
  no tiene nota, da `UPDATE 1`, y un segundo `update` lo devuelve a su id: el sondeo no deja rastro en
  la cita, solo dos filas de auditoría.
- **Origen.** Ya existía con el grant de tabla entera. Pero es la lista que este diff reescribe para
  cerrar escrituras: quitar `id` del `grant update` no rompe ninguna ruta (R6). Si no se hace aquí,
  se anota en `docs/state.md`.

### R2-A-H3 · BAJA · `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:70`
`rango_bloqueante` sigue en el `grant update`. `calcular_rango_bloqueante` solo corre con
`profesional_id`, `inicio` y `fin`, así que un `update` de esa columna sola deja el rango a mano y se
salta la exclusión.
- **Escenario (medido).** Como PRO1 (Ana): `update citas set rango_bloqueante = 'empty' where id =
  '35cb8c96…'` → `UPDATE 1`. Después, un `insert` de otra cita suya con el mismo `inicio` y `fin` →
  `INSERT 0 1`, sin 23P01: doble reserva.
- **Origen.** Ya existía. Se cierra quitándolo de la lista de `update` (en `insert` ya lo rechaza el
  disparador) o se anota en `docs/state.md`.
