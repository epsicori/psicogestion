---
id: T-010
titulo: Dominio Agenda — esquema, auditoría y políticas
modelo: opus
fase: 1
prioridad: alta
depende_de: [T-004]
estado: pendiente
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
      — **nada de reglas de recurrencia arbitrarias**), `dia_semana`, **`hora_local time`**
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
      - **Índice de exclusión** que impida solapar dos citas no canceladas del mismo
        profesional (`btree_gist` sobre `profesional_id` + `tstzrange(inicio, fin)`).
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
