---
id: T-010
titulo: Dominio Agenda — esquema, auditoría y políticas
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-004]
estado: hecho
completado: 2026-09-06
notas: Revisado con Opus. Un hallazgo ALTA sobre el propio diseno: el tecnico administrativo podia CREAR citas y no podia reprogramar ninguna -UPDATE 0, en silencio- porque un UPDATE con WHERE lee la fila y se le aplica tambien la politica de SELECT, que no tiene a proposito. Cerrado con agenda_actualizar_cita(), security definer, con sus cuatro aserciones.
---

# Contexto

El dominio Agenda **no existe**. No hay `citas`, ni `series_cita`, ni `tipos_terapia`, ni
`disponibilidad`: T-001 se los saltó a propósito y todo lo demás de la fase 1 cuelga de
ellos. Este ticket los escribe, con su auditoría y sus políticas, y **no dibuja ni una
pantalla**.

Es el segundo ticket más caro de equivocar después de T-002. Una columna mal elegida aquí
—un `timestamp` sin zona, un estado de más— se paga migrando datos de citas reales dentro
de tres meses.

Referencias: `docs/architecture.md` §Invariante 4 (la serie es la intención, la cita es el
hecho), §Roles (fila Agenda), §Invariante 3. ADR **034** (hora local en la serie, instante
en la cita), **045** (los cinco estados y «en curso» calculado), **024** (outbox), **033**
(el centro acota al técnico), **051** (varios centros por perfil). Choques **3** y **4** de
`docs/interfaz.md`.

## Tareas

- [ ] **Enum `estado_cita`**: `programada`, `confirmada`, `realizada`, `cancelada`,
      `no_asistida`. **Cinco, ni uno más** — `en_curso` no existe (ADR-045).
- [ ] **`tipos_terapia`**: nombre, `duracion_minutos` por defecto, `tarifa_base`,
      régimen de IVA (reutilizar el enum de T-001 si existe; si no, crearlo aquí),
      `color`, `activo`. El color es del **tipo**, no del profesional: la franja de color
      de la agenda identifica al profesional y sale de `perfiles`.
- [ ] **`series_cita`** (ADR-034, la intención): `paciente_id`, `profesional_id`,
      `centro_id`, `tipo_terapia_id`, `periodicidad` (`semanal` | `quincenal` | `mensual`
      — **nada de reglas de recurrencia arbitrarias**), `dia_semana` **con la convención
      escrita en su `comment on column`: `isodow`, 1 = lunes** —Postgres tiene dos, y
      `extract(dow)` empieza en domingo; equivocarla es un bug que aparece un domingo seis
      meses después—, **`hora_local time`**
      y **`zona_horaria`** validada con `es_zona_iana()` (existe de T-001),
      `sesiones_totales` o `fin_el`, `creada_por`, `cancelada_en`. **Un `timestamptz` en
      la serie es el bug**: la serie creada en enero se corre una hora en julio.
- [ ] **`citas`** (el hecho): `paciente_id`, `profesional_id`, `centro_id`,
      `tipo_terapia_id`, `serie_id` nulo si es suelta, **`inicio timestamptz`**,
      **`fin timestamptz`**, **`zona_horaria`** como instantánea del centro al
      materializar, `estado`, `sala`, `nota_operativa`, `desviada bool`,
      `motivo_desviacion` (enum con al menos `reprogramada`, `anomalia_horaria`,
      `festivo`, `ausencia`), `marcada_realizada_en/_por`, `creada_en/_por`.
      - `check (fin > inicio)`.
      - Índice por `(profesional_id, inicio)` y por `(centro_id, inicio)`: son las dos
        consultas del calendario.
      - **`rango_bloqueante tstzrange`**, que es `[inicio, fin + descanso)`: el descanso
        entre sesiones **es una extensión invisible de la cita**, y meterlo en el rango es lo
        que hace que la restricción lo garantice. Validarlo solo en la aplicación es no
        validarlo. Se calcula con un **disparador** `before insert or update of
        profesional_id, inicio, fin`, y **queda congelado**: cambiar el descanso mueve las
        reservas nuevas, jamás las ya acordadas con un paciente.
      - **El descanso se aplica solo por detrás**, no por los dos lados. Con 50 minutos de
        sesión y 10 de descanso, 10:00–10:50 y 11:00–11:50 son válidas; por los dos lados
        exigirías veinte minutos entre sesiones. La simetría sale gratis porque toda cita
        lleva el suyo.
      - **Índice de exclusión** sobre `rango_bloqueante`, que impida solapar dos citas no
        canceladas del mismo profesional (`btree_gist` sobre `profesional_id` +
        `rango_bloqueante`, con `where estado in ('programada','confirmada','realizada')`).
        **Con nombre explícito y estable** —`citas_sin_solape_profesional`—, porque la
        aplicación lo captura por nombre para responder «ese hueco acaba de ocuparse» con
        sugerencias nuevas, en vez de un error muerto (T-028).
      - **Agujero conocido y aceptado**: al congelar el rango, activar el descanso hoy no
        protege el hueco anterior a una cita ya reservada sin él. Es el precio de no tocar
        lo acordado, y se nota el primer día. **No se arregla recalculando en cascada.**
- [ ] **Descanso entre sesiones, en `perfiles`**: `descanso_activo bool` por defecto
      **cierto** y `descanso_minutos smallint` con `check between 5 and 20`, por defecto
      **10**. Su `comment on column` dice para qué es de verdad: **no es descanso, es el
      tiempo de escribir la nota clínica**, que T-012 hace obligatoria y cuya ausencia
      dispara `alertas_documentacion` (T-015). Encadenar seis sesiones sin hueco es cómo se
      acumula la deuda documental que el producto persigue; por eso viene activo.
- [ ] **`nota_operativa` es logística**, y así lo dice su `comment on column`: sala,
      material, aviso de acceso. **Jamás contenido clínico** (choque 3): lo clínico se lee
      del episodio, con su política y su registro en `accesos_historia`.
- [ ] **`disponibilidad`**: franjas horarias, ausencias y festivos por profesional y
      centro, en hora local con su zona, con `tipo` (`franja` | `ausencia` | `festivo`).
- [ ] **`esta_en_curso(p_cita_id)` → bool**, `stable`, la regla del ADR-045 escrita **una
      sola vez**: `now()` entre `inicio` y `fin` y estado no `cancelada` ni `no_asistida`.
      Toda pantalla y toda consulta la invoca; nadie la reescribe a mano.
- [ ] **Auditoría**: `fn_auditar()` de T-004 colgado de las cuatro tablas nuevas.
- [ ] **Políticas RLS** según la matriz §Roles:
      - Administrador: todas las citas de la organización.
      - Profesional sanitario: **las suyas** (`profesional_id = auth.uid()`).
      - Técnico administrativo: **todas las de sus centros**, vía `centros_actuales()` — plural,
        porque un perfil puede tener varias pertenencias vigentes (ADR-051). Patrón:
        `centro_id in (select public.centros_actuales())`.
      - `tipos_terapia` y `disponibilidad`: lectura para los tres roles; escritura para
        administrador, y el profesional sobre su propia disponibilidad.
- [ ] **El técnico no ve el tipo de terapia** (choque 4). Se resuelve con una **vista
      `security_barrier`** al modo de `pacientes_indicador_riesgo`, que omite
      `tipo_terapia_id` y `nota_operativa` — **no** filtrando columnas en la consulta de la
      aplicación (invariante 3). La fila se **omite**, no se tacha ni se enseña en gris.
- [ ] **Política de `insert` sobre `alertas_documentacion`**, que T-002 dejó sin escribir a
      propósito, y **disparador** que abre una alerta `nota_sin_firmar` cuando una cita
      pasa a `realizada` y su fin ya quedó atrás sin versión firmada. La alerta **nunca
      lleva contenido clínico**: vive fuera del candado porque alimenta contadores.
- [ ] **Neutralizar `alter default privileges`** de Supabase sobre las tablas nuevas, como
      en T-001.
- [ ] Regenerar `lib/supabase/tipos-bd.ts` y dejar `scripts/t010-agenda.sql` con las
      consultas de comprobación.

## Criterios de aceptación (verificables)

- [ ] **Automático** — `npx supabase db reset` termina sin error y
      `select count(*) from pg_policies where schemaname = 'public'` sube en el número de
      políticas que declare el diseño, sin bajar en ninguna existente.
- [ ] **Automático** — `select unnest(enum_range(null::estado_cita))` devuelve
      **exactamente cinco** valores y **ninguno** se llama `en_curso`.
- [ ] **Automático** — insertar dos citas solapadas del mismo profesional, ambas
      `programada`, **falla** por el índice de exclusión. Con una de las dos `cancelada`,
      **entra**.
- [ ] **Automático** — con `descanso_activo` y 10 minutos: una cita 10:00–10:50 y otra
      10:55–11:45 del mismo profesional **fallan**; 11:00–11:50 **entra**. El error nombra
      `citas_sin_solape_profesional`.
- [ ] **Automático** — cambiar `perfiles.descanso_minutos` **no modifica ni una fila** de
      `citas`: `rango_bloqueante` sigue byte a byte igual en las citas ya creadas.
- [ ] **Automático** — `select obj_description` / `col_description` sobre
      `series_cita.dia_semana` devuelve un comentario que nombra `isodow`.
- [ ] **Automático** — `insert into series_cita` con `zona_horaria = 'CEST'` o `'+02'`
      **falla**; con `'Europe/Madrid'` entra.
- [ ] **Automático** — como `tecnico_administrativo`: `select` sobre la vista de agenda
      devuelve sus citas **sin** columna de tipo de terapia; `select tipo_terapia_id from
      citas` devuelve **cero filas** o error de permiso.
- [ ] **Automático** — como `profesional_sanitario`: cero filas de citas de otro
      profesional; como `administrador`: todas.
- [ ] **Automático** — `update` sobre una cita genera fila en `auditoria` con
      `estado_anterior` y `estado_posterior`.
- [ ] **Automático** — pasar una cita de ayer a `realizada` crea una fila en
      `alertas_documentacion` con `tipo = 'nota_sin_firmar'` y **sin** ningún texto clínico
      en la fila.
- [ ] **Automático** — `esta_en_curso()` devuelve verdadero para una cita que abarca
      `now()` y falso para la misma cita `cancelada`.

## Guion de comprobación manual

1. `npx supabase db reset` y abrir Studio.
2. `\dp citas` — comprobar que `anon` y `service_role` no tienen nada concedido.
3. Insertar una serie de ocho sesiones los martes a las 12:00 en `Europe/Madrid` y una
   cita suelta que la solape; comprobar que la segunda es rechazada.
4. Cambiar el reloj de una cita para que abarque el instante actual y comprobar
   `select esta_en_curso(id)`.

## Notas para el agente

- **No dibujes pantallas.** Este ticket termina en la base de datos y en los tipos.
- La materialización de la serie en citas **no es de aquí**: es T-011. Aquí solo el
  esquema que la permite.
- `btree_gist` es una extensión: instálala en el esquema `extensions`, e invócala
  cualificada, como manda la regla de `search_path = ''` que T-002 ya sufrió.
- Trampa conocida de T-002: si una política nueva consulta una tabla que a su vez tiene
  política que consulta la primera, Postgres aborta con `infinite recursion detected in
  policy`. Si aparece, la salida es una función `security definer`, como
  `nota_tiene_version_conjunta()`.
- Las citas se leen muchísimo y se escriben poco. Los índices de arriba no son opcionales.

## Diseño aprobado · 06-09-2026

### 0 · Hechos verificados contra el esquema (no supuestos)

| Hecho | Consecuencia |
|---|---|
| **No existe ningún enum de IVA ni de régimen fiscal.** Los trece enums de `public` son los de T-001 y ninguno lo es | El ticket dice «reutilizar el de T-001 si existe; si no, crearlo aquí». Se crea `regimen_iva` aquí, mínimo |
| **`btree_gist` está disponible pero NO instalada.** Las extensiones viven en el esquema `extensions` (`pgcrypto`, `uuid-ossp`, `pg_net`) | `create extension btree_gist with schema extensions`, e invocación cualificada por `search_path = ''` |
| **`alertas_documentacion` tiene política de `SELECT` y de `UPDATE`, y ninguna de `INSERT`** | Confirmado: la escribe este ticket, como decía T-002 |
| **`fn_auditar()` se cuelga con argumentos**: `EXECUTE FUNCTION fn_auditar('id', 'borrador_contenido')` — la clave primero, las columnas recortadas después | Las cuatro tablas nuevas siguen ese patrón exacto |
| **El modelo de vista acotada es `pacientes_indicador_riesgo`**: `security_invoker=false, security_barrier=true`, filtrando con `rol_actual() = 'tecnico_administrativo'` y `centro_id in (select centros_actuales())` | La vista de agenda del técnico se calca de ahí |
| **`es_zona_iana(text)` y `centros_actuales()` existen** | No se reescriben |
| **El orden de `estado_cita` YA ESTÁ FIJADO por T-020**, en otro carril: `lib/agenda/estados-cita.ts` congela `programada, confirmada, realizada, cancelada, no_asistida` y lo comenta como «contrato con T-010» | El enum se declara **en ese orden exacto**. Cambiarlo rompe un contrato que otro carril cerró antes |

### 1 · Lo que se crea

**Enums**: `estado_cita` (cinco, en el orden de T-020), `periodicidad_serie`
(`semanal`/`quincenal`/`mensual`), `motivo_desviacion_cita`
(`reprogramada`/`anomalia_horaria`/`festivo`/`ausencia`), `tipo_disponibilidad`
(`franja`/`ausencia`/`festivo`) y `regimen_iva` (`exento_sanitario`/`general`).

**`regimen_iva` con dos valores y sin el tipo dentro del nombre**: lo sanitario está exento
(art. 20.1.3.º LIVA) y lo pericial no. El 21 % no entra en el nombre del valor porque los
tipos los cambia una ley y un enum no se migra por eso; el porcentaje es dato de facturación
(T-021), no de esquema.

**Tablas**: `tipos_terapia`, `series_cita`, `citas`, `disponibilidad`.
**Columnas nuevas en `perfiles`**: `descanso_activo` (por defecto **cierto**) y
`descanso_minutos` (`check between 5 and 20`, por defecto **10**).

### 2 · La serie lleva hora local; la cita, instante (ADR-034)

`series_cita` guarda `dia_semana smallint`, **`hora_local time`** y **`zona_horaria text`**
validada con `es_zona_iana()`. **Ni un `timestamptz` en la serie**: una serie creada en
enero se correría una hora en julio.

`dia_semana` lleva su `comment on column` diciendo **`isodow`, 1 = lunes**. Postgres tiene
dos convenciones y `extract(dow)` empieza en domingo; equivocarla es un fallo que aparece un
domingo, seis meses después, en una sola cita.

`citas` guarda `inicio` y `fin` **`timestamptz`**, y `zona_horaria` como **instantánea del
centro al materializar**: qué zona regía cuando se acordó, que no es necesariamente la que
rige hoy.

### 3 · El descanso vive dentro del rango, no en la aplicación

`rango_bloqueante tstzrange` = `[inicio, fin + descanso)`, calculado por
`fn_calcular_rango_bloqueante()` en `before insert or update of profesional_id, inicio, fin`.

- **Solo por detrás.** Con 50 de sesión y 10 de descanso, 10:00–10:50 y 11:00–11:50 son
  válidas. Aplicarlo por los dos lados exigiría veinte minutos entre sesiones; la simetría
  sale gratis porque toda cita lleva el suyo.
- **Queda congelado.** El disparador solo recalcula si cambian `profesional_id`, `inicio` o
  `fin` —es decir, si la cita se mueve, que es un acuerdo nuevo—. Cambiar
  `perfiles.descanso_minutos` **no toca ni una fila** de `citas`: mover lo ya acordado con
  un paciente porque el profesional cambió un ajuste es exactamente lo que no debe pasar.
- **Agujero conocido y aceptado**: activar el descanso hoy no protege el hueco anterior a
  una cita ya reservada sin él. Es el precio de no tocar lo acordado y se nota el primer
  día. **No se arregla recalculando en cascada.**

**Restricción de exclusión `citas_sin_solape_profesional`**: `exclude using gist` sobre
`profesional_id` con `=` y `rango_bloqueante` con `&&`, **`where estado in
('programada','confirmada','realizada')`**. El nombre es explícito y estable **porque la
aplicación lo captura por nombre** (T-028) para responder «ese hueco acaba de ocuparse» con
sugerencias nuevas, en vez de con un error muerto. Cancelar libera el hueco sin borrar nada,
que es lo que hace la cláusula `where`.

### 4 · Quién ve qué

| Tabla | Administrador | Profesional | Técnico administrativo |
|---|---|---|---|
| `citas` | todas | `profesional_id = auth.uid()` | **ninguna por `select` directo** |
| `citas_agenda` (vista) | — | — | las de sus centros, **sin `tipo_terapia_id` ni `nota_operativa`** |
| `tipos_terapia`, `disponibilidad` | escribe | lee; escribe su propia disponibilidad | lee |

**El técnico no tiene política de `SELECT` sobre `citas`, y eso es el diseño, no un
olvido.** El choque 4 dice que no ve el tipo de terapia, y el invariante 3 que la fila se
**omite**, no se tacha ni se filtra en la consulta de la aplicación. Una política que le
diera la fila entera y confiara en que la pantalla no pinte dos columnas es justo lo que el
invariante prohíbe. Lee por `citas_agenda`, `security_barrier`, calcada de
`pacientes_indicador_riesgo`. Escribir sí: `insert` y `update` acotados por
`centro_id in (select centros_actuales())` —plural, ADR-051—, porque gestionar la agenda es
suyo.

### 5 · La alerta de nota sin firmar

Disparador `after update of estado on citas` que, cuando una cita pasa a `realizada` y su
`fin` ya quedó atrás sin versión firmada, inserta en `alertas_documentacion` una fila
`nota_sin_firmar` con `origen_tabla = 'citas'`.

**Dos cosas que hay que mirar antes de escribirlo**, y que no estaban en el ticket:

1. `alertas_documentacion.origen_tabla` tiene un `check` que hoy admite `notas_clinicas`,
   `consentimientos`, `informes` y `evaluaciones` — **no `citas`**. Hay que ampliarlo, y
   ampliar un `check` es una migración hacia delante: se cae y se recrea, sin ventana en la
   que la tabla quede sin restricción.
2. **La alerta no lleva ni una palabra clínica**: vive fuera del candado porque alimenta
   contadores. Solo identificadores y fechas.

### 6 · Auditoría, con recorte

`fn_auditar()` en las cuatro tablas nuevas. **`citas.nota_operativa` va recortada.** Por
definición es logística —sala, material, aviso de acceso— y no debería llevar nada clínico
(choque 3), pero el choque existe precisamente porque en el prototipo se usa para lo
contrario. La auditoría la lee el propio actor y no está bajo el candado del ADR-026: copiar
ahí un campo de texto libre que la gente usará mal es la misma lección que costó la revisión
de T-002. El resto de columnas son identificadores, instantes y estados, y sí entran.

### 7 · Orden de la migración

1. `create extension btree_gist with schema extensions`
2. Enums
3. `perfiles`: dos columnas nuevas con sus `check` y sus `comment on column`
4. `tipos_terapia` → `series_cita` → `citas` → `disponibilidad`
5. `fn_calcular_rango_bloqueante()` y su disparador; la restricción de exclusión **después**
   del disparador, o las filas entrarían sin rango
6. `esta_en_curso(uuid)`, `stable`
7. Ampliación del `check` de `origen_tabla`, disparador de alerta y política de `insert`
8. Vista `citas_agenda`
9. Políticas RLS
10. `revoke` y `grant` neutralizando los privilegios por defecto de Supabase

### 8 · Riesgos, por probabilidad

1. **Confundir `dow` con `isodow`.** Mitigado por el `comment on column` y por una aserción
   del banco que lo comprueba.
2. **Recursión de políticas** (`infinite recursion detected in policy`) si una política de
   `citas` consulta una tabla cuya política consulta `citas`. Salida: función
   `security definer`, como ya hizo T-002.
3. **La restricción de exclusión sin `where`** bloquearía también las canceladas y haría
   imposible reprogramar sobre un hueco liberado.
4. **`btree_gist` sin cualificar** con `search_path = ''`: falla al crear la restricción, no
   al usarla, así que se ve pronto.
