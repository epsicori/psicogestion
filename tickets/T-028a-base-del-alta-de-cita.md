---
id: T-028a
titulo: Base del alta de cita — bloques reales, previsualización, cita suelta, y el técnico escribe el tipo solo por las funciones de alta
modelo: opus
riesgo: alto
fase: 1
prioridad: alta
depende_de: [T-035]   # cola de supabase/, nunca dos a la vez: T-012 → T-036 → T-035 → T-028a
bloquea: [T-028]      # cortes B y C; el corte A (lib/agenda/sugerencias.ts) no espera
estado: hecho
territorio:
  - supabase/migrations/*_base_del_alta_de_cita.sql
  - supabase/seed-completo.sql
  - scripts/rls/*-alta-de-cita.sql      # banco nuevo, con el siguiente número libre al empezar (el 20 es de T-012)
  - scripts/rls/15-agenda.sql           # solo la sección J: el UPDATE sin WHERE del técnico (H23)
  - scripts/rls/16-series.sql           # solo si alguna aserción lee series_cita como técnico (H24)
  - scripts/rls/17-vinculo-agenda.sql   # solo la sección C: el técnico cita por la función, no por insert (H16)
  - scripts/rls/11-cobertura.sql        # solo si cambia el nombre de alguna política de citas o series_cita
  - scripts/rls/README.md
  - lib/supabase/tipos-bd.ts
  - lib/citas/series.ts                 # solo si la firma nueva de agenda_crear_serie rompe su llamada al regenerar tipos
  - docs/architecture.md
---

# Contexto

T-028 dibuja el alta de cita. Su diseño (`tickets/T-028/diseno.md`, §B1) comprobó que hoy no se
puede cerrar leyendo lo que hay en la base. El propietario aprobó el 02-10-2026 hacer primero
este ticket. Son tres cosas.

1. **Lo que pide §1.A del diseño de T-028.**
   - Bloques de sesión reales, con el descanso de cualquier profesional y las citas de cualquier
     centro.
   - Una previsualización de la serie que no escribe.
   - La serie con fechas excluidas, sala, nota operativa y primera sesión estricta.
   - La cita suelta.
   - La siembra que el guion necesita.
2. **ADR-074 punto 4: la base garantiza que el técnico solo escribe el tipo.** El técnico
   administrativo lee el catálogo `tipos_terapia` y elige el tipo al dar la cita. Lo escribe
   **solo a través de las funciones de alta**, nunca con `insert` ni `update` directo en `citas`.
   `citas_agenda` sigue sin la columna. Ninguna otra puerta de la base le enseña el tipo de una
   cita.
3. **Las puertas abiertas que hoy contradicen ese punto**, verificadas el 02-10-2026 (diseño de
   T-028, §E0). Ejecutadas dentro de `begin … rollback` como el técnico sembrado:

| Hecho | Lo que pasa hoy | Dónde |
|---|---|---|
| **H16** | `insert into public.citas (…, tipo_terapia_id, …, nota_operativa)` como técnico → `INSERT 0 1`. Escribe a ciegas dos columnas que no puede leer. | Política `citas_alta`, `supabase/migrations/20260911120000_vinculo_en_el_alta_de_agenda.sql:37`. El banco 17-C lo afirma como bueno (`scripts/rls/17-vinculo-agenda.sql:114-127`). |
| **H23** | `update public.citas set nota_operativa = '…'` **sin `WHERE`** como técnico → `UPDATE 2`. `set tipo_terapia_id = null` → `UPDATE 3`: todas las citas de su centro. | Rama del técnico en `citas_modificacion` (`20260906120000_agenda_esquema.sql:715-737`) más `grant update` (`:856`). Postgres no aplica la política de SELECT a un `UPDATE` que no lee columnas. El banco solo prueba el `UPDATE … WHERE id = …` (`15-agenda.sql:408-418`). |
| **H24** | `select s.tipo_terapia_id, t.nombre from series_cita s join tipos_terapia t …` como técnico → una fila, «Sesión de pareja». Con `citas_agenda.serie_id` le da el tipo de cada cita de una serie. | `series_cita_lectura` (`20260906120000_agenda_esquema.sql:741`) y `grant select` (`:855`). T-011b solo revocó `insert, update`. Ningún código de `app/` ni de `lib/` lee `series_cita`. |

ADR que aplican: **074** (todo), **034** (hora local y zona; anomalías de marzo y octubre),
**049c** (el alta no puntúa: solo bloques), **055** (el técnico cita a cualquier paciente de sus
centros), **069** (las series solo nacen por función), **026** (agendar no pide PIN). **075 no
entra** (ver «Lo que no entra»).

## Pregunta abierta al propietario (antes del diseño)

- **Q1 · RESUELTA por el propietario el 02-10-2026: fuera de T-028a, ticket propio de auditoría que alinee la política con la matriz.** H25, la auditoría propia del técnico enseña el tipo. Comprobado leyendo el código, no
  ejecutado.
  - `auditar_citas` es `fn_auditar('id', 'nota_operativa')`. Copia `tipo_terapia_id` en
    `estado_anterior` y `estado_posterior`, con `actor_id = auth.uid()`, también dentro de las
    funciones `security definer`.
  - `auditoria_lectura_propia` (`20260829180000_revision_corte_por_baja.sql:31`) deja a
    cualquier rol leer sus propias filas.
  - Resultado: el técnico que reprograma con `agenda_actualizar_cita` una cita que dio otro puede
    leer su tipo.
  - Además, la matriz dice «Auditoría · técnico: Sin acceso» (`docs/architecture.md:175`).

  **Propuesta:** fuera de T-028a. Es la política de una tabla de todo el sistema y no se decide
  desde agenda. Va a un ticket propio de auditoría, que alinee la política con la matriz.
  **Si el propietario lo quiere aquí**, se añade el criterio 20 bis: «como técnico, ninguna fila
  de `auditoria` que pueda leer contiene `tipo_terapia_id`». El territorio crece con el banco de
  auditoría que toque.

## Tareas

- [ ] **Diseño** (`tickets/T-028a/diseno.md`, arquitecto), hecho sobre `main` con T-035 integrado
      y re-verificado contra el código de ese momento. Tiene que decidir:
  - la forma de cerrar H16, H23 y H24: quitar la rama del técnico de las políticas, revocar
    columnas, una vista u otra cosa. Recordatorio: los tres roles del dominio comparten el rol
    `authenticated` de la base (`20260906120000_agenda_esquema.sql`, §12.bis);
  - si `agenda_crear_serie` gana los parámetros nuevos por sobrecarga o por `create or replace`
    con valores por defecto, y qué pasa con su firma antigua (hoy la llaman los bancos y
    `lib/citas/series.ts`, sin ningún llamante en `app/`);
  - si la duración del tipo se impone ignorando `p_duracion_minutos` o rechazando una distinta
    (criterio 12);
  - los mensajes y errcodes de cada rechazo nuevo, con un fragmento propio por comprobación
    (`.claude/rules/supabase.md`);
  - el número del banco nuevo.
- [ ] **Migración hacia delante** `supabase/migrations/<sello>_base_del_alta_de_cita.sql`, con
      sello posterior al de T-035. Las funciones de abajo, todas `security definer`,
      `search_path = ''`, `revoke … from public, anon` y `grant execute … to authenticated`. La
      autorización es la de `agenda_crear_serie`: administrador; o
      `p_profesional_id = auth.uid()` más vínculo (T-029); o técnico con
      `p_centro_id in centros_actuales()`. **Ninguna devuelve la identidad de otras citas.**
  - `agenda_bloques_profesional(p_profesional_id, p_centro_id, p_desde date, p_hasta date,
    p_duracion_minutos smallint) returns table (fecha date, hora_local time, inicio timestamptz,
    fin timestamptz, estado text)`, con `estado ∈ {'libre','ocupado'}`.
    - Recorre las franjas de `disponibilidad` del profesional para ese centro o sin centro.
    - Salta los días con festivo o ausencia.
    - Avanza un cursor por cada franja. Si `[cursor, cursor + duración + descanso)` choca con el
      `rango_bloqueante` de una cita del profesional **en cualquier centro**, el tramo sale
      `ocupado`. Si no, sale `libre` y el cursor avanza la duración más el descanso.
    - Tope de 62 días: más da `22023`. Es `stable`.
  - `plan_alta_serie(…)` es **interna**: sin `grant` a `authenticated`, con el patrón de
    `plan_edicion_serie`. Por cada fecha calcula `{fecha, hora_local, inicio, fin,
    clasificacion, bloqueo, alternativa}`. La usan **las dos** funciones siguientes.
  - `agenda_previsualizar_alta(p_paciente_id, p_profesional_id, p_centro_id, p_periodicidad
    (null = suelta), p_dia_semana, p_hora_local, p_duracion_minutos, p_desde,
    p_sesiones_totales) returns jsonb`. Devuelve `{zona_horaria, sesiones:[{fecha, hora_local,
    inicio, fin, clasificacion: 'normal'|'inexistente'|'ambigua', bloqueo:
    null|'festivo'|'ausencia'|'ocupada', alternativa: null|{fecha, inicio, fin}}]}`. **No
    escribe y no devuelve tipo.**
  - `agenda_crear_serie` con `p_excluir date[]`, `p_sala text`, `p_nota_operativa text` y
    `p_estricta_primera boolean`.
    - Una fecha excluida no da ni cita ni propuesta, pero **consume su ordinal**.
    - Con `p_estricta_primera`, si la primera sesión choca, devuelve `23P01` y no crea nada.
    - Una nota operativa no nula, si llama el técnico, da `42501`.
  - `agenda_crear_cita(p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, p_fecha
    date, p_hora_local time, p_duracion_minutos smallint, p_sala text, p_nota_operativa text)
    returns uuid`.
    - Resuelve la hora con `resolver_hora_local` y marca `anomalia_horaria`.
    - Festivo o ausencia: `22023`. Fecha pasada: `22023`.
    - `23P01` se propaga.
    - Nota operativa con el técnico: `42501`.
  - **Tipo (ADR-074).** En `agenda_crear_cita` y en `agenda_crear_serie` con
    `p_estricta_primera`, un tipo nulo, inexistente o con `activo = false` da `22023`. La cita
    creada dura lo que dice su tipo.
  - **Puertas del técnico**: se cierran H16, H23 y H24. `agenda_actualizar_cita` y las demás
    funciones `agenda_*` siguen funcionando para él.
  - Las ramas del administrador y del profesional en `citas` no cambian.
- [ ] **Siembra** (`supabase/seed-completo.sql`; hoy no tiene `tipos_terapia`, `disponibilidad`
      ni `citas`):
  - franjas de lunes a viernes, 09:00–14:00 y 16:00–20:00, para cada profesional sembrado;
  - un festivo futuro dentro de las próximas ocho semanas;
  - un paciente con **seis citas pasadas, los martes a las 12:00** (Europe/Madrid), con su
    profesional asignado;
  - un paciente **sin citas**;
  - tipos de terapia **con nombre de servicio, no de condición** (ADR-074.3): al menos tres
    activos, con al menos dos duraciones distintas, y uno inactivo.
- [ ] **Banco** `scripts/rls/NN-alta-de-cita.sql`, más las secciones de 15, 16 y 17 que nombra
      el territorio. Cada negativa lleva su gemela positiva y se asevera con
      `pg_temp.assert_lanza_codigo_msg` y el fragmento propio de su comprobación.
- [ ] `npm run tipos`. Y `lib/citas/series.ts` solo si la firma regenerada rompe su llamada.
- [ ] **`docs/architecture.md`**:
  - la fila «Agenda» de la matriz, en la columna del técnico: «Todas, sin tipo de terapia; lo
    elige al dar la cita, solo por las funciones de alta (ADR-074)»;
  - un párrafo con las puertas cerradas (H16, H23, H24) y la abierta, si Q1 la deja fuera;
  - `scripts/rls/README.md` con la fila del módulo nuevo.

## Criterios de aceptación

Los criterios 3 a 18 se demuestran en el banco nuevo, salvo que se diga otra cosa, y los corre
`npm run test:rls`. «Como técnico» quiere decir `pg_temp.como(:TEC1)`, del centro A.

**Generales**

1. `npx supabase db reset`, `npm run seed` y `npm run test:rls` salen con exit 0. También
   `npm run lint:migraciones`, `npm test` y `npm run build`, y
   `node ~/.claude/pipeline/territorio.mjs T-028a` en verde.
2. **La negativa muerde.** Con el banco nuevo escrito y **sin** la migración (tras `db reset`),
   `npm run test:rls` sale con un código distinto de cero. La primera aserción que falla es una de
   las nuevas, y el diseño dice cuál. La salida se pega en la evidencia.

**Bloques**

3. Franja de 09:00 a 14:00, 50 minutos y 10 de descanso, sin citas: salen cinco bloques
   `libre`, de 09:00 a 13:00, y ninguno a las 14:00.
4. Con una cita del mismo profesional a las 10:00 **en el centro B**, el técnico del centro A
   recibe ese tramo como `ocupado`. El siguiente `libre` empieza al final del `rango_bloqueante`
   de esa cita. La salida no tiene más columnas que `fecha, hora_local, inicio, fin, estado`, y
   eso se comprueba con `information_schema` o `pg_get_function_result`.
5. Un día con festivo o ausencia no da bloques. Pedir más de 62 días da `22023`. Un técnico del
   centro B que pide los bloques del centro A recibe `42501`.

**Previsualización**

6. `agenda_previsualizar_alta` no escribe: el número de filas de `citas`, `series_cita` y
   `propuestas_cita` es igual antes y después. **Gemela de coherencia**: con la misma entrada,
   `agenda_crear_serie` materializa exactamente las fechas, los bloqueos y las alternativas que
   la previsualización enseñó.
7. **Hora de verano.**
   - Una serie semanal a las 12:00 que cruza el último domingo de marzo da todas las sesiones a
     las 12:00 con `clasificacion = 'normal'`.
   - Una sesión a las 02:30 de ese domingo da `'inexistente'`.
   - Una a las 02:30 del último domingo de octubre da `'ambigua'`.
   - Una sesión en festivo da `bloqueo = 'festivo'`, con una alternativa a siete días como
     mucho, o `null` si no la hay.

**Altas**

8. Ocho sesiones con una fecha en `p_excluir` dan siete citas, ninguna propuesta para esa fecha,
   y la última cita cae en el octavo ordinal.
9. Con `p_estricta_primera` y la primera sesión ocupada: `23P01` y **cero filas nuevas** en
   `series_cita`, `citas` y `propuestas_cita`.
10. `p_sala` y `p_nota_operativa` quedan en cada cita creada (se mira como `postgres`). Con una
    nota no nula, el técnico recibe `42501`, en la serie y en la cita suelta.
11. `agenda_crear_cita`:
    - en una hora normal crea una cita con `serie_id` nulo;
    - a las 02:30 del domingo de marzo, la crea con `desviada` y `anomalia_horaria`;
    - en festivo, o con fecha pasada, da `22023`;
    - en un hueco ocupado da `23P01`;
    - un técnico de otro centro recibe `42501`;
    - un profesional sin vínculo con el paciente recibe el error de `fn_exigir_vinculo_agenda`.

**Tipo de terapia (ADR-074)**

12. **El tipo es obligatorio y está vivo.** En `agenda_crear_cita` y en `agenda_crear_serie` con
    `p_estricta_primera`, un tipo nulo, inexistente o inactivo da `22023`, cada uno con su
    fragmento. La gemela, con un tipo activo, entra.
13. **La cita dura lo que dice su tipo.** Un alta con un tipo de 90 minutos nunca deja una cita
    con `fin − inicio` distinto de 90 minutos. Se prueba mandando `p_duracion_minutos = 50`, si
    el parámetro sigue existiendo: o se crea con 90, o se rechaza. Lo que se comprueba es que
    no existe la cita de 50.
14. **El técnico escribe el tipo por la función.** Como técnico, `agenda_crear_cita` y
    `agenda_crear_serie` con un tipo activo crean citas con ese `tipo_terapia_id` (se mira como
    `postgres`). Ninguna de las dos lo devuelve: el resultado no contiene el uuid del tipo.

**Puertas del técnico**

15. **H16.** Como técnico, un `insert into public.citas` directo con los mismos datos que la
    gemela falla. La gemela entra por `agenda_crear_cita`. **ADR-055 se conserva**: la sección C
    de `17-vinculo-agenda.sql`, reescrita, demuestra que el técnico cita **por la función** a un
    paciente que no tiene asignado.
16. **H23.** Como técnico:
    - `update public.citas set nota_operativa = 'x'` sin `WHERE` no cambia ninguna fila;
    - `update public.citas set tipo_terapia_id = <tipo>` sin `WHERE`, tampoco.

    Se comprueba como `postgres` que ninguna cita cambió, sea porque el `UPDATE` da 0 filas o
    porque lanza error. La gemela positiva de la sección J de `15-agenda.sql`
    (`agenda_actualizar_cita`) sigue en verde.
17. **H24.** Como técnico, `select tipo_terapia_id from public.series_cita` no devuelve ninguna
    fila, o lanza `42501`. La gemela, como administrador, devuelve más de 0 filas sobre una serie
    del centro A. La aserción de `15-agenda.sql`, «`citas_agenda` no tiene `tipo_terapia_id`
    ni `nota_operativa`», sigue en verde.
18. **Los demás roles no pierden nada.** Las secciones de administrador y profesional de los bancos
    15, 16 y 17 siguen en verde sin cambiar sus aserciones.

**Siembra y documentación**

19. Tras `npx supabase db reset && npm run seed`, como `postgres`, cada consulta debe dar:
    - `select count(*) from disponibilidad where tipo = 'franja'` → franjas de lunes a viernes de
      cada profesional sembrado;
    - festivos futuros → 1 o más;
    - el paciente de los martes → seis citas pasadas con `extract(isodow from inicio at time zone
      zona_horaria) = 2` y la hora local 12:00;
    - el paciente sin citas → 0;
    - tipos con `activo` → 3 o más, con al menos dos `duracion_minutos` distintas;
    - tipos sin `activo` → 1 o más.

    Las consultas exactas, con sus nombres de columna verificados, las fija el diseño, y la
    evidencia pega su salida. `npm run verificar:huellas` sigue diciendo «cadena íntegra».
20. `grep -n "ADR-074" docs/architecture.md` encuentra la fila «Agenda» de la matriz y el párrafo
    de las puertas.

## Lo que no entra, y por qué

- **ADR-075**: `citas.episodio_id`, la herencia de la modalidad relacional y presencial/online.
  Tienen un ticket propio de `supabase/`, detrás de este (ADR-075.3), con su relleno de las citas
  existentes.
- **La auditoría propia del técnico** (H25), salvo que el propietario diga otra cosa en Q1.
- **Pantalla del catálogo de tipos** (Ajustes) y su texto de ayuda de ADR-074.3: es interfaz y otro
  ticket. Hasta entonces, los tipos llegan por la siembra.
- **Validar por máquina que el nombre de un tipo no revele una condición**: ADR-074.3 dice que no
  se puede.
- **Tipo de terapia por defecto del profesional**: sin objeto desde ADR-074, porque lo elige
  quien da la cita.
- **Los envoltorios de TypeScript** (`lib/citas/alta.ts`), el esquema Zod y toda la pantalla: son
  T-028.
- **Cambiar el tipo de una cita ya creada**: ninguna función lo admite hoy (`agenda_actualizar_cita`
  lo excluye a propósito) y ningún contrato lo pide.
