---
id: T-039
titulo: La cita apunta a su episodio y lleva si es presencial u online
modelo: opus
riesgo: alto
fase: 1
prioridad: alta
depende_de: [T-028a]   # cola de supabase/, nunca dos a la vez: T-035 → T-028a → T-039 → T-038
bloquea: []            # el ticket de interfaz que pinte la modalidad en el alta, la agenda y la ficha de cita
estado: hecho
completado: 2026-10-03
territorio:
  - supabase/migrations/*_cita_en_episodio_y_asistencia.sql
  - supabase/seed-completo.sql
  - scripts/rls/*-cita-en-episodio.sql   # banco nuevo, con el siguiente número libre al empezar (tras el de T-028a)
  - scripts/rls/15-agenda.sql            # solo si alguna aserción enumera las columnas de citas_agenda
  - scripts/rls/16-series.sql            # solo si alguna aserción enumera las columnas de series_cita
  - scripts/rls/18-agenda-rango.sql      # solo si alguna aserción enumera las columnas de agenda_citas_rango
  - scripts/rls/19-nota-en-episodio.sql  # solo si el cambio de episodio_para_nota obliga a reescribir una aserción
  - scripts/rls/21-alta-de-cita.sql      # solo las firmas de agenda_crear_serie/agenda_crear_cita en la aserción A (ampliado por el orquestador, 03-10-2026)
  - scripts/rls/11-cobertura.sql         # solo para declarar las políticas nuevas, si las hay
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts
  - lib/citas/agenda.ts                  # solo si la firma regenerada de agenda_citas_rango rompe su tipo
  - lib/citas/series.ts                  # solo si la firma regenerada de agenda_crear_serie rompe su llamada
  - docs/architecture.md
  - docs/interfaz.md                     # solo §14, la línea «“Modalidad” no existe en la cita»
---

# Contexto

ADR-075 (aceptado el 02-10-2026, en el diseño de T-028, pregunta P1) decide dos cosas:

1. **La cita apunta a su episodio** (`citas.episodio_id`). La modalidad relacional (individual,
   pareja, familiar, grupo) y los participantes **se heredan del episodio y no se copian a la
   cita**. El paciente de la cita es uno de los participantes del episodio.
2. **La cita lleva su modalidad de asistencia**: presencial u online. Es un dato logístico, no
   clínico, y **lo ve también el técnico**.

Y manda hacerlo en un ticket propio de `supabase/`, de riesgo alto, con relleno de las citas
existentes, en la cola **detrás de T-028a**. Este es ese ticket. No pinta nada: deja el dato en la
base y sus puertas, y la pantalla lo pinta después (ADR-075.3; diseño de T-028, E3).

ADR que aplican: **075** (todo), **030** (lo conjunto cuelga del episodio; la persona es el
titular; una nota conjunta es un solo eslabón; el pagador es de la cita), **074** (el técnico
escribe en `citas` solo por las funciones de alta y no lee lo clínico de la cita), **071** (toda
nota cuelga de un episodio del autor; el técnico no abre ni elige episodios), **026** (agendar no
pide PIN), **055** (el técnico cita a cualquier paciente de sus centros), **069** (las series solo
nacen por función), **073** (el centro de un episodio con notas no cambia), **034** (hora local y
zona). Secciones de `docs/architecture.md`: §Roles (fila «Agenda»), §Los cuatro invariantes (3 y
4), §Candado, §Personas alrededor del paciente.

## Lo comprobado leyendo el código (02-10-2026, `main` en 245e180)

| | Hecho | Dónde |
|---|---|---|
| **C1** | `citas` no tiene `episodio_id` ni ninguna columna de modalidad. `series_cita` tampoco. | `supabase/migrations/20260906120000_agenda_esquema.sql:130` y `:180` |
| **C2** | La modalidad relacional vive en `episodios_asistenciales.modalidad_relacional` (por defecto `individual`). El paciente del episodio es su titular. Los demás van en `episodio_participantes`, con `alta_en` y `baja_en`, y un índice único por participante activo. **Un episodio individual no tiene fila de participante.** | `20260822094547_esquema_base_organizacion_paciente_historia.sql:517-555` |
| **C3** | `citas_agenda` (la única puerta del técnico a las citas) es una vista `security_barrier` que enumera columnas y omite `tipo_terapia_id` y `nota_operativa`. `agenda_citas_rango()` es `security invoker` y `returns table (…)`, con dos ramas disjuntas por rol; la del técnico lee `citas_agenda`. | `20260906120000_agenda_esquema.sql:515-541`; `20260926120000_agenda_citas_rango.sql:72-180` |
| **C4** | `grant select, insert, update on table public.citas to authenticated` es **de tabla entera**: cualquier rol que pase la política de `update` puede escribir una columna nueva. T-028a cierra la puerta directa del técnico (H16, H23); la del administrador y la del profesional siguen abiertas. | `20260906120000_agenda_esquema.sql:856` |
| **C5** | `fn_proteger_cita_pasada()` congela en una cita pasada una lista **cerrada** de columnas. Una columna nueva queda fuera de esa lista y se podría cambiar en el pasado. | `20260910120000_series_materializacion_desviaciones.sql:334-388` |
| **C6** | `agenda_confirmar_propuesta()` crea la cita copiando el tipo de terapia de su serie. Una columna nueva de la serie que no se copie se pierde en cada propuesta confirmada. | `20260925120000_editar_serie_desde_la_cita.sql:858-880` |
| **C7** | `episodio_para_nota()` (invoker) prohíbe al técnico elegir o abrir episodios, exige el PIN y resuelve: elegido, único abierto, o `EP001` si hay varios. Hoy solo usa `p_cita_id` para el centro del episodio que abre. | `20260929120000_nota_siempre_en_episodio.sql:260-385` |
| **C8** | La nota cuelga de un episodio de su autor, del mismo paciente o de un participante (`fn_exigir_episodio_coherente_en_nota`, con `for share`). Un episodio con notas no cambia de paciente ni de profesional, y un participante con notas no se mueve ni se borra. **T-035 re-emite** `fn_congelar_episodio_con_notas`. | `20260929120000_nota_siempre_en_episodio.sql:50-254`; `tickets/T-035-…md` |
| **C9** | Al firmar la v1, la cita de la nota tiene que ser del mismo paciente que la nota y de su autor (6.21). | `20261003120000_firma_cotejada_con_borrador_y_cita.sql:462-468` |
| **C10** | `auditar_citas` es `fn_auditar('id', 'nota_operativa')`: una columna nueva de `citas` entra en `estado_anterior` y `estado_posterior`, y el técnico lee sus propias filas de auditoría (H25, abierto). | `20260906120000_agenda_esquema.sql:657-659`; `docs/state.md` §Hallazgos |
| **C11** | `citas_sin_solape_profesional` excluye dos citas activas del mismo profesional con rangos solapados. | `20260906120000_agenda_esquema.sql:300-305` |
| **C12** | No existe ninguna columna de pagador en ninguna migración (grep `pagador`). | — |
| **C13** | La siembra ya tiene un episodio de pareja (`k_epi_pareja`, de Ana, con Sofía de titular y Sofía y Hugo como participantes). | `supabase/seed-completo.sql:322-341` |
| **C14** | La interfaz pinta la modalidad en la línea de la agenda (`tipo · profesional · modalidad`), en la ficha de cita y en el alta. Hoy §14 dice que «no existe en la cita». | `docs/interfaz.md:84`, `:296`, `:405-413` |

# Preguntas para el propietario (antes del diseño)

> **Decididas por el propietario el 02-10-2026: las tres recomendaciones.** Q1-A (relleno con la misma
> regla que el alta, nunca se crean episodios; `episodio_id` admite nulo para siempre), Q2 una sola fila
> por cita conjunta, Q3 nada en este ticket (telepsicología en un ADR propio antes de ofrecer `online` en
> producción). Tareas y criterios quedan como están.

Las tres que ADR-075 deja abiertas. Cada una cambia el diseño. Las tareas y los criterios de abajo
están escritos con la **recomendación** de cada una. Si el propietario elige otra opción, el
contrato se enmienda antes del diseño.

## Q1 · Las citas ya dadas, sin episodio

`episodio_id` **tiene que admitir nulo para siempre**, no solo en el relleno. La primera cita de
un paciente nuevo se da antes de que exista su episodio: el episodio lo abre `episodio_para_nota()`
al escribir la primera nota (C7). Además, el técnico no puede elegir episodio (ADR-071). Lo que
se pregunta es solo **cuánto rellena la migración**.

- **A (recomendada).** El relleno aplica la misma regla que el alta (tarea 4), en este orden:
  1. Una cita con notas toma **el episodio de sus notas**, si todas están en el mismo.
  2. Una cita sin notas toma **el único episodio candidato**: del mismo profesional, con el
     paciente de titular o de participante con alta ese día, y abierto o cerrado no antes de la
     fecha de la cita.
  3. En cualquier otro caso (notas en dos episodios, ningún candidato o varios), queda nula y se
     completa con su primera nota (tarea 8).

  Así, una cita antigua y una nueva se comportan igual.
- **B.** Solo las citas con notas. El resto queda nula hasta su nota.
- **C.** Ninguna: todas nulas. Es lo más prudente, pero deja sin episodio toda la agenda futura
  ya dada, también las sesiones de pareja que ADR-075 quiere poder distinguir.
- **Descartada: crear episodios individuales para las citas huérfanas.** Inventaría registros
  clínicos, y relojes de retención (ADR-033), para cubrir una necesidad logística.

## Q2 · Una fila por cita conjunta, o una por participante

- **A (recomendada). Una sola fila.** `paciente_id` es el participante con quien se dio la cita,
  y el resto sale del episodio. Es lo que apunta ADR-030 (el pagador es de la cita) y lo que
  encaja con lo que ya hay:
  - `citas_sin_solape_profesional` (C11) rechazaría la segunda fila del mismo profesional a la
    misma hora;
  - una cita da una alerta de nota sin firmar, una nota conjunta (un eslabón, ADR-030) y un
    cobro;
  - la firma exige que la cita sea del paciente de la nota (C9), y con una fila eso se cumple
    sin tocar el sobre.

  **Precio:** el otro participante no ve esa cita en su ficha ni en su «próxima cita», que hoy
  leen por `paciente_id` (`app/(app)/pacientes/[id]/datos.ts:138`). Para el profesional, una
  pantalla posterior puede leerla por el episodio. Para el técnico no, y es lo correcto: verla
  en la ficha de Hugo le diría que Hugo está en un proceso conjunto, y eso es la modalidad
  relacional que ADR-075 le oculta.
- **B. Una fila por participante.** Hay que exceptuar la restricción de solape y decidir qué
  fila lleva la nota, la alerta y el cobro. La nota conjunta quedaría colgando de una de las N
  citas, que es el problema que ADR-030 cierra. Se duplica la agenda del profesional.

## Q3 · Qué exige la sesión online

- **A (recomendada). Nada en este ticket.** La columna registra un hecho logístico, igual que
  `sala`, y el alta acepta `online` sin más condición. Lo que convierte una sesión en
  telepsicología se decide en un ADR propio y en su ticket, antes de ofrecer `online` en
  producción:
  - el consentimiento específico;
  - la plataforma, que es un encargado del tratamiento;
  - el enlace de la sesión;
  - las medidas del ENS.

  El manual de puesta en marcha lo recuerda.
- **B.** Rechazar `online` mientras el paciente no tenga un consentimiento de telepsicología. No
  existe ese tipo de consentimiento en el modelo: habría que inventarlo aquí, sin ADR.
- **C.** Añadir ya una columna `enlace_sesion`. El enlace lo ve el técnico y puede llevar
  identificadores de la plataforma. Es decidir la plataforma sin decidirla.

# Tareas

- [ ] **Diseño** (`tickets/T-039/diseno.md`, arquitecto), hecho sobre `main` con T-028a integrado
      y re-verificado contra el código de ese momento (C1-C14). Tiene que decidir:
  - cómo se impide la escritura directa de `episodio_id` (tarea 3). Pueden ser privilegios por
    columna, un disparador u otra cosa, pero **nunca una marca de sesión** que el llamante
    pueda poner con `set_config`;
  - si las funciones de alta ganan los parámetros nuevos por `create or replace` con valores
    por defecto o por sobrecarga. En ningún caso pueden quedar dos sobrecargas que PostgREST no
    sepa distinguir con los mismos argumentos con nombre;
  - si el cambio de asistencia de una cita va en `agenda_actualizar_cita` con un parámetro
    nuevo o en una función propia (tarea 5);
  - si la herencia de la serie a la cita (tarea 4.4) se hace en cada función o en un disparador
    `before insert` de `citas`;
  - los mensajes y errcodes de cada rechazo nuevo, con un fragmento propio por comprobación
    (`.claude/rules/supabase.md`);
  - el número del banco nuevo.

- [ ] **1 · Migración hacia delante** `supabase/migrations/<sello>_cita_en_episodio_y_asistencia.sql`,
      con sello posterior al de T-028a. No edita ninguna migración anterior: re-emite lo que
      cambia. **No re-emite** `fn_sellar_version_nota()`, `verificar_cadena_huellas()` ni las
      funciones que re-emite T-035: el sobre no cambia.

- [ ] **2 · Columnas** (sin destruir nada):
  - tipo `public.modalidad_asistencia as enum ('presencial', 'online')`. El nombre no se
    confunde con `modalidad_relacional`;
  - `citas.modalidad_asistencia public.modalidad_asistencia not null default 'presencial'`. El
    `default` rellena las filas existentes al añadir la columna, sin `UPDATE`. Es el único
    valor que el producto ha podido tener hasta hoy;
  - `citas.episodio_id uuid null references public.episodios_asistenciales (id)`, con su índice
    parcial `where episodio_id is not null`;
  - las mismas dos columnas en `series_cita`, con la misma semántica: la intención de la serie;
  - **ninguna** columna de modalidad relacional ni de participantes en `citas` ni en
    `series_cita` (ADR-075.1: se hereda, no se copia).

- [ ] **3 · Quién escribe**:

  | Columna | Quién la escribe | Por dónde |
  |---|---|---|
  | `modalidad_asistencia` | Los tres roles, con la autorización de `agenda_crear_serie` (T-028a) | Las funciones de alta y la de cambio de asistencia (tarea 5). El técnico nunca por `insert`/`update` directo (T-028a). |
  | `episodio_id` | **Ningún rol con `insert` ni `update` directo**, tampoco el administrador ni el profesional (C4) | Solo las funciones `security definer`: el alta (tarea 4), la completación desde la nota (tarea 8), el cambio por el profesional (tarea 9) y el relleno (tarea 11) |

  La razón de cerrar `episodio_id` también al administrador es que escribir un `episodio_id`
  ajeno y ver si la base lo acepta es un oráculo. Con él se sabría, por ejemplo, si Hugo es
  participante del episodio que el administrador ve en la cita de Sofía. Un mensaje de error
  uniforme no lo cierra, porque el oráculo es el éxito.

- [ ] **4 · Las funciones de alta de T-028a con el episodio y la asistencia.** Hablamos de
      `agenda_crear_cita` y `agenda_crear_serie`:
  1. **Ganan dos parámetros**: `p_modalidad_asistencia` (por defecto `'presencial'`) y
     `p_episodio_id` (por defecto `null`). Con el valor por defecto, las llamadas de hoy (T-028,
     `lib/citas/series.ts`, los bancos) se comportan igual que antes.
  2. **Con `p_episodio_id` no nulo:**
     - el técnico recibe `42501` (ADR-071: no elige episodios);
     - para cualquier otro llamante, el episodio solo vale si es **de `auth.uid()`**, de
       `p_profesional_id`, con el paciente como titular o participante activo, y abierto. Si es
       inexistente, ajeno o de otro paciente, **el mismo** `42501` con el mismo mensaje (sin
       oráculo de existencia). Si está cerrado, `22023`;
     - **no pide PIN** (ADR-026): quien pasa el id es el dueño del episodio, y la función no le
       devuelve nada que no supiera.
  3. **Con `p_episodio_id` nulo, resolución automática**, sea quien sea el llamante: si
     `p_profesional_id` tiene **exactamente un** episodio abierto con el paciente (como titular
     o como participante activo), la cita o la serie lo toman. Con cero o con varios, queda
     nulo. **Nunca abre un episodio** y nunca lanza `EP001`: dar una cita no es elegir un
     proceso clínico.
  4. **Herencia de la serie.** Toda cita que nace de una serie lleva la `modalidad_asistencia` y
     el `episodio_id` de la serie, la cree quien la cree:
     - `agenda_crear_serie`;
     - `agenda_confirmar_propuesta` (C6);
     - `agenda_editar_serie` cuando parte la serie en una nueva.
  5. **Ninguna función devuelve `episodio_id` ni nada del episodio.** Hablamos de las de alta,
     `agenda_previsualizar_alta` y la de la tarea 5. Lo que devuelven hoy no cambia de forma.
  6. `agenda_previsualizar_alta` no gana parámetros: la previsualización no depende ni del
     episodio ni de la asistencia.

- [ ] **5 · Cambiar la asistencia de una cita futura.** Hablamos de una cita con `fin > now()`.
      Pueden hacerlo:
  - el técnico de su centro;
  - el profesional de la cita;
  - el administrador.

  Va por función, no por `update` directo. Solo cambia esa cita, no la serie. En una cita
  pasada falla (tarea 10).

- [ ] **6 · Coherencia, en la base** (disparadores `security definer`, `search_path = ''`, sin
      oráculo, con `for share` donde se lea otra tabla, como en T-034). Al insertar o cambiar
      `episodio_id`, `paciente_id` o `profesional_id` de una cita o una serie con `episodio_id`
      no nulo:
  - el profesional de la cita es el del episodio;
  - el paciente de la cita es el titular del episodio **o** un participante con alta ese día:
    `alta_en ≤ fecha local de la cita` y `baja_en` nula o `≥ fecha local`. En una serie, el
    participante tiene que estar activo;
  - el episodio está abierto, o se cerró en la fecha local de la cita o después;
  - si falla, `23514` con un fragmento por comprobación.

- [ ] **7 · Las otras puertas de la coherencia** (disparadores propios, **sin re-emitir** los de
      T-034 ni los de T-035):
  - un episodio con citas o series que apuntan a él no cambia de `paciente_id` ni de
    `profesional_id` (`42501`). La gemela, sin citas, pasa;
  - un participante con citas en ese episodio (por su `paciente_id`) no se mueve ni se borra
    (`42501`). La gemela, sin citas, pasa.

- [ ] **8 · La nota y la cita** (nota conjunta incluida). En `notas_clinicas`, al insertar o
      cambiar `cita_id` o `episodio_id` con `cita_id` no nulo:
  - si la cita tiene episodio y la nota cuelga de otro: `23514`. **La nota de una sesión de
    pareja cuelga del episodio de la cita;**
  - si la cita no tiene episodio: se le completa con el de la nota (de nulo a valor, tarea 10),
    pasando la coherencia de la tarea 6;
  - **`episodio_para_nota()`** se re-emite con un paso nuevo antes del recuento (paso 7):
    - con `p_cita_id` cuya cita tiene episodio y sin `p_episodio_id`, devuelve ese episodio, sin
      `EP001`;
    - con un `p_episodio_id` distinto del de la cita, `42501`, con el mismo mensaje que «el
      episodio elegido no vale».

    Todo lo demás de la función (rol antes del candado, PIN, `EP001` sin cita) no cambia;
  - **la firma no cambia.** Con Q2-A, la nota conjunta lleva el `paciente_id` de la cita, y 6.21
    (C9) se cumple sin tocar el sobre ni `fn_sellar_version_nota()`.

- [ ] **9 · El profesional corrige el episodio de una cita.** Para el caso en que la resolución
      automática eligió el episodio individual y la sesión era de un episodio de pareja que se
      abrió después, hay una función con estas reglas:
  - solo la usa el profesional de la cita, dueño de los dos episodios;
  - exige el PIN (`historia_desbloqueada()`), porque es una decisión clínica, como
    `episodio_para_nota()`;
  - solo vale **mientras ninguna nota cuelga de la cita**;
  - pasa la coherencia de la tarea 6;
  - el técnico y el administrador reciben `42501`.

- [ ] **10 · La cita pasada** (`fn_proteger_cita_pasada()` re-emitida, C5). Con `old.fin <= now()`:
  - `episodio_id` **solo** pasa de nulo a valor. De valor a otro valor, o a nulo, `42501`;
  - `modalidad_asistencia` no cambia (`42501`): es lo que se acordó, como el tipo de terapia;
  - lo que hoy congela sigue congelado.

- [ ] **11 · Relleno** (Q1-A). Es una función **interna** (`revoke` a `public`, `anon` y
      `authenticated`), idempotente: solo toca citas y series con `episodio_id` nulo. La
      migración la llama una vez **antes** de crear los disparadores que la estorbarían
      (`.claude/rules/supabase.md`: «los rellenos van antes de crear el disparador»), y el banco
      la vuelve a llamar sobre sus propios datos. Reglas:
  - solo escribe `episodio_id`: ninguna otra columna cambia y no se borra ninguna fila;
  - deja un `raise notice` con tres recuentos: rellenadas por nota, rellenadas por candidato
    único y dejadas nulas;
  - las filas de `auditoria` que produce (una por cita, con actor nulo) son las esperadas y no se
    evitan.

- [ ] **12 · Quién lee**:

  | Dato | Administrador | Profesional | Técnico |
  |---|---|---|---|
  | `citas.modalidad_asistencia` | Sí (`citas`) | Sus citas (`citas`) | **Sí**: `citas_agenda` gana la columna, **añadida al final** con `create or replace view`, y `agenda_citas_rango()` la devuelve en las dos ramas |
  | `citas.episodio_id` | Sí (`citas`), como uuid opaco | Sus citas, como uuid opaco | **No**: ni en `citas_agenda`, ni en `agenda_citas_rango()`, ni en el resultado de ninguna función |
  | `series_cita.*` nuevas | Como `series_cita` | Como `series_cita` | No (T-028a cierra H24) |
  | Modalidad relacional y participantes | Sus episodios, con PIN | Sus episodios, con PIN | **No**: siguen solo en `episodios_asistenciales` y `episodio_participantes`, con su RLS y el candado. **Ninguna** vista ni función de agenda los une |

  `agenda_citas_rango()` cambia de `returns table`, así que va con `drop function` y
  `create function`, conservando el comentario, `revoke` y `grant`. Gana **solo**
  `modalidad_asistencia`, como última columna.

- [ ] **13 · Siembra** (`supabase/seed-completo.sql`):
  - una cita futura de Ana con Sofía en `k_epi_pareja` (C13), con `episodio_id` puesto;
  - una cita futura `online`;
  - todo dado por las funciones de alta, no por `insert` directo, salvo que el diseño justifique
    lo contrario.

- [ ] **14 · Banco** `scripts/rls/NN-cita-en-episodio.sql`, más las secciones de 15, 16, 18 y 19
      que nombra el territorio. Cada negativa lleva su gemela positiva y se asevera con
      `pg_temp.assert_lanza_codigo_msg` y el fragmento propio de su comprobación. Los criterios
      se prueban **llamando a las funciones que llamaría la aplicación**, no construyendo el
      estado a mano (`.claude/rules/supabase.md`, T-013a).

- [ ] **15 · `npm run tipos`**. `lib/citas/agenda.ts` y `lib/citas/series.ts` solo si la firma
      regenerada los rompe.

- [ ] **16 · Documentación**:
  - `docs/architecture.md`:
    - en la fila «Agenda» de §Roles, la columna del técnico añade «con presencial/online; sin
      episodio (ADR-075)»;
    - en §Personas alrededor del paciente, un párrafo «La cita y su episodio (ADR-075, T-039)»
      con las reglas de las tareas 3 a 11 y el residuo de H25 (ver «Lo que no entra»);
  - `docs/interfaz.md` §14: «Modalidad» pasa a decir que presencial/online existe en la cita
    desde T-039 y se pinta en el ticket de interfaz que lo siga, y que la modalidad relacional no
    se pinta en la agenda (está bajo el candado);
  - `scripts/rls/README.md`: la fila del módulo nuevo.

# Criterios de aceptación

Los criterios 3 a 22 se demuestran en el banco nuevo, salvo que se diga otra cosa, y los corre
`npm run test:rls`. «Como técnico» quiere decir `pg_temp.como(:TEC1)`, del centro A. «Se mira como
`postgres`» quiere decir tras `pg_temp.reset_sesion()`.

**Generales**

1. `npx supabase db reset`, `npm run seed` y `npm run test:rls` salen con exit 0. También
   `npm run lint:migraciones`, `npm test`, `npm run build`, `npm run verificar:huellas` («cadena
   íntegra») y `node ~/.claude/pipeline/territorio.mjs T-039`, todos en verde.
2. **La negativa muerde.** Con el banco nuevo escrito y **sin** la migración (tras `db reset`),
   `npm run test:rls` sale con un código distinto de cero. La primera aserción que falla es una de
   las nuevas, y el diseño dice cuál. La salida se pega en la evidencia.

**Columnas**

3. `information_schema.columns` da lo siguiente:
   - `citas.modalidad_asistencia` y `series_cita.modalidad_asistencia`: `not null`, por defecto
     `'presencial'`;
   - `citas.episodio_id` y `series_cita.episodio_id`: admiten nulo, con clave ajena a
     `episodios_asistenciales`;
   - `enum_range(null::public.modalidad_asistencia)` es exactamente `{presencial,online}`;
   - ninguna columna cuyo nombre contenga `relacional` ni `participante` en `citas`,
     `series_cita` ni `citas_agenda`, ni en `pg_get_function_result` de `agenda_citas_rango`.

**Relleno (Q1-A)**

4. Sobre datos propios del banco, como `postgres`, una llamada a la función de relleno deja:
   - (a) una cita con notas en E: `E`;
   - (b) una cita con notas en E y en F: nula;
   - (c) una cita sin notas con un solo candidato: ese candidato;
   - (d) una cita sin notas con dos candidatos: nula;
   - (e) una cita sin notas con un candidato del que el participante se dio de baja antes de la
     fecha: nula;
   - (f) una cita que ya tenía episodio: intacta.

   Además:
   - una segunda llamada cambia 0 filas;
   - para cada cita, `to_jsonb(c) - 'episodio_id'` es igual antes y después;
   - el recuento de filas de `citas` no cambia.
5. Como `authenticated` (cualquier rol), llamar a la función de relleno da `42501`.

**Coherencia**

6. Como `postgres`, cada una de estas operaciones da `23514`, con su fragmento:
   - una cita con el episodio de **otro profesional**;
   - con un **paciente que no es titular ni participante**;
   - con un participante **de baja antes** de la fecha de la cita;
   - con un episodio **cerrado antes** de la fecha de la cita.

   Las gemelas entran: titular, participante activo y episodio cerrado el mismo día de la cita.
   Lo mismo para `series_cita` en las dos primeras.
7. Las otras puertas dan `42501`:
   - `update episodios_asistenciales set profesional_id = …`, y `set paciente_id = …`, sobre un
     episodio con citas;
   - `delete` sobre un participante con citas en ese episodio, y el `update` de su `paciente_id`.

   Las gemelas, sin citas, pasan. `19-nota-en-episodio.sql` y las secciones de T-035 siguen en
   verde sin cambiar sus aserciones.
8. **Nadie escribe `episodio_id` a mano.** Como administrador, como el profesional de la cita y
   como técnico:
   - `update public.citas set episodio_id = <E> where id = <cita>`;
   - el mismo `update` **sin `WHERE`**;
   - `insert into public.citas (…, episodio_id)`;
   - lo mismo sobre `series_cita`.

   Todos fallan o no cambian ninguna fila, y se comprueba como `postgres` que ningún
   `episodio_id` cambió. La gemela es la función de la tarea 9, que sí lo cambia.

**Alta**

9. **Asistencia.**
   - Como técnico, `agenda_crear_cita` con `p_modalidad_asistencia => 'online'` crea una cita
     `online`, mirada como `postgres`. Sin el parámetro, `presencial`.
   - `agenda_crear_serie` con `'online'` deja la serie y todas sus citas `online`.
   - Una propuesta de esa serie, confirmada con `agenda_confirmar_propuesta`, nace `online` y con
     el `episodio_id` de la serie.
   - `agenda_editar_serie` con «esta y las siguientes» deja la serie nueva con los dos valores
     de la anterior.
10. **Resolución automática**, sin `p_episodio_id`, mirada como `postgres`:
    - el profesional con **un** episodio abierto del paciente como titular da `episodio_id` = ese;
    - el paciente que es **participante activo** del único episodio abierto de ese profesional
      (el de pareja) da ese episodio;
    - con **dos** abiertos, nulo;
    - con **ninguno**, nulo, y no se crea ningún episodio: el recuento de
      `episodios_asistenciales` es igual antes y después;
    - el episodio abierto de **otro** profesional con el mismo paciente no cuenta.

    Todo ello también cuando llama el técnico.
11. **Episodio explícito.**
    - El profesional dueño, sin PIN, da la cita con ese episodio.
    - El técnico, con cualquier uuid no nulo, recibe `42501`.
    - El administrador, o un profesional que no es el dueño, recibe `42501`, con **el mismo
      mensaje** que un uuid inexistente y que un episodio de otro paciente.
    - Un episodio cerrado da `22023`.
12. **Nada vuelve al técnico.** Los resultados de `agenda_crear_cita`, `agenda_crear_serie`,
    `agenda_previsualizar_alta` y la función de la tarea 5, pasados a texto (`::text`), no
    contienen el uuid del episodio asignado.

**Lectura**

13. Como técnico:
    - `information_schema` muestra que `citas_agenda` tiene `modalidad_asistencia` y **no** tiene
      `episodio_id`;
    - `select modalidad_asistencia from citas_agenda where id = <cita online>` da `online`.

    La aserción de `15-agenda.sql`, «`citas_agenda` no tiene `tipo_terapia_id` ni
    `nota_operativa`», sigue en verde.
14. `agenda_citas_rango()` devuelve `modalidad_asistencia` a los tres roles, con el mismo valor
    para la misma cita. `pg_get_function_result` no contiene `episodio_id`.
    `18-agenda-rango.sql` sigue en verde.
15. Como técnico, `select count(*)` sobre `episodios_asistenciales` y sobre
    `episodio_participantes` da 0. Ya lo cubre `02-matriz-roles.sql`, y aquí se repite con el
    episodio de pareja sembrado por el banco y una cita que apunta a él.

**Cambio de asistencia y de episodio**

16. **La función de la tarea 5:**
    - el técnico del centro A cambia una cita futura de su centro a `online`;
    - el técnico del centro B recibe `42501`;
    - el profesional de la cita y el administrador pueden;
    - otro profesional recibe `42501`;
    - sobre una cita pasada, `42501` (criterio 18).
17. **La función de la tarea 9:**
    - el dueño, con PIN, cambia el episodio de una cita sin notas;
    - sin PIN, `42501`;
    - con una nota colgando de la cita, `42501`;
    - el técnico y el administrador, `42501`;
    - un episodio incoherente, `23514` (criterio 6).
18. **La cita pasada.** Sobre una cita con `fin <= now()`:
    - `episodio_id` de nulo a valor pasa;
    - de valor a otro, o a nulo, `42501`;
    - `modalidad_asistencia`, `42501`.

    Sobre la gemela futura, todo pasa.

**La nota (y la conjunta)**

19. Una nota con `cita_id` de una cita en E y `episodio_id = F` da `23514`, con su fragmento. La
    gemela, en E, entra.
20. Una nota con `cita_id` de una cita sin episodio la deja, mirada como `postgres`, con
    `citas.episodio_id = notas_clinicas.episodio_id`.
21. **`episodio_para_nota()`**, con el profesional dueño de dos episodios abiertos con el paciente
    y PIN abierto:
    - con `p_cita_id` de una cita en E y sin `p_episodio_id`, devuelve `E`, sin `EP001`;
    - sin `p_cita_id`, sigue dando `EP001`;
    - con `p_episodio_id = F` y la misma cita, da `42501`.
22. **Nota conjunta de una sesión de pareja.**
    - Una cita de Sofía en el episodio de pareja.
    - Una nota de Ana con esa cita, en ese episodio y con el paciente de la cita.
    - Su v1 se sella con `alcance = 'conjunta'` como lo haría la aplicación, y pasa (6.21
      intacto).
    - El profesional asignado de Hugo la lee por la rama de participación, igual que antes de
      T-039.
    - `npm run verificar:huellas` dice «cadena íntegra».
    - `grep -c "fn_sellar_version_nota\|verificar_cadena_huellas" <migración>` da 0.

**Siembra y documentación**

23. Tras `npx supabase db reset && npm run seed`, como `postgres`:
    - `select count(*) from citas where modalidad_asistencia = 'online'` → 1 o más;
    - las citas de `k_epi_pareja` → 1 o más;
    - las citas cuyo `episodio_id` incumple la coherencia de la tarea 6 → 0.

    La consulta exacta de esa última la fija el diseño, y la evidencia pega la salida.
24. `grep -n "ADR-075" docs/architecture.md` encuentra la fila «Agenda» y el párrafo nuevo.
    `grep -n "T-039" docs/interfaz.md` encuentra §14.

# Guion de comprobación manual

No hay pantalla. En menos de dos minutos:

1. `npx supabase db reset && npm run seed && npm run test:rls`, y mirar que sale en verde.
2. En `psql` como `postgres`, mirar el `episodio_id` y la `modalidad_asistencia` de las citas
   de Sofía:
   ```sql
   select id, paciente_id, episodio_id, modalidad_asistencia
     from citas
    where paciente_id = (<Sofía>)
    order by inicio;
   ```
   La futura de pareja apunta a `k_epi_pareja`.
3. `npm run dev`, entrar como técnico y abrir la agenda. Nada cambia a la vista (no se pinta
   aún), y no hay errores en la consola del servidor.

# Notas para el agente

- **Es base de datos y nada más.** Ningún fichero de `app/` ni de `components/`. Si algo de la
  pantalla parece necesitarlo, es el ticket de interfaz que sigue.
- **Para saber qué hace hoy una función**, se busca su última redefinición
  (`grep -ln nombre supabase/migrations/*.sql | tail -1`). Esto vale sobre todo para las de alta,
  que T-028a acaba de re-emitir, y para `agenda_confirmar_propuesta` y `agenda_editar_serie`
  (`20260925120000`).
- **Patrones a calcar**:
  - la coherencia y los congelados de T-034 (`for share`, un fragmento por comprobación,
    permisos antes que cotejo);
  - `plan_edicion_serie` para lo interno, sin `grant`;
  - la rama del técnico de `agenda_citas_rango` con valores literales donde no debe ver.
- **No re-emitas** `fn_congelar_episodio_con_notas` ni `fn_exigir_episodio_coherente_en_nota`:
  T-035 las acaba de tocar. Las puertas nuevas son disparadores propios.
- `security definer` se salta la RLS: toda función definer que escriba repite a mano la
  autorización de `agenda_crear_serie`.
- `create or replace view` solo puede **añadir columnas al final** de `citas_agenda`.
  `agenda_citas_rango` necesita `drop` y `create`, porque cambia su `returns table`.
- **`modalidad_asistencia` ≠ tipo de terapia ≠ modalidad relacional.** Que el técnico elija «Sesión
  de pareja» como tipo (ADR-074) y la resolución automática ponga un episodio individual es
  posible y no se valida: el profesional lo corrige con la tarea 9.

# Lo que no entra, y por qué

- **Telepsicología** (consentimiento específico, plataforma, enlace, ENS de la sesión online),
  si Q3 queda en A. Es una decisión legal y de encargado del tratamiento que ADR-075 no toma.
  Va en un ADR propio y en su ticket, antes de ofrecer `online` en producción.
- **Pintar la modalidad** en el alta, la agenda, la ficha de cita o la ficha del paciente. Es
  interfaz (ADR-075.3; diseño de T-028, E3) y va en el ticket que siga a este.
- **El pagador de la cita** (ADR-030). No existe la columna (C12) y es del carril económico.
- **Que el otro participante vea la cita conjunta en su ficha.** Es el precio de Q2-A. Una
  lectura por episodio para el profesional es interfaz y otro ticket. Para el técnico no se
  hace: le revelaría la modalidad relacional.
- **H25: la auditoría propia del técnico.** Con esta migración, las filas de `auditoria` de
  `citas` también llevan `episodio_id` (C10). Es un uuid que el técnico no puede resolver, pero
  dos citas de dos pacientes con el mismo uuid le dirían que están en el mismo proceso. El
  ticket de auditoría que alinee la política con la matriz (decidido en T-028a, Q1) tiene que
  cubrirlo también. Aquí queda escrito en `docs/architecture.md`.
- **Cerrar un episodio con citas futuras, y reabrirlo** (T-034 SQL-H2). Va en el ticket que
  cierre episodios.
- **Cambiar la asistencia de toda una serie.** Este ticket la cambia cita a cita. La regla de
  la serie es la que se dio al crearla.
- **Validar que el tipo de terapia y la modalidad relacional cuadran.** Son datos distintos
  (ADR-074 y ADR-075), y el profesional lo corrige con la tarea 9.
