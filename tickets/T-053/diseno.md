# T-053 · Diseño: el técnico no deduce tipo ni episodio por su propia auditoría (H25)

Arquitecto · 16-10-2026 · base `main` bb4f9b1 (la base local ya lleva 20261017120000 de la rama T-047).

## 0 · Hechos verificados contra el código

Todo lo de esta sección se ha leído en el fichero o se ha medido en la base local, siempre en
`begin … rollback` y sin `db reset`.

**La política y la tabla**
- Sobre `auditoria` hay una sola política, `auditoria_lectura_propia`. Es `for select to
  authenticated` y su `using` es `(select rol_actual()) is not null and actor_id = (select
  auth.uid())`. Viene de `supabase/migrations/20260829180000_revision_corte_por_baja.sql:30-37`,
  que la rehízo con `drop policy if exists` + `create policy`. Ese es el precedente de forma.
- `auditoria` tiene RLS activada sin FORCE. `authenticated` solo tiene SELECT.
- **Ninguna rama da al administrador lectura de filas ajenas.** Hoy el administrador lee sus
  propias filas, y con todas las claves.
- Ninguna vista depende de `auditoria`. No está en ninguna publicación de realtime.
- `rol_actual()` devuelve `rol_usuario`, un enum con tres valores: `administrador`,
  `profesional_sanitario` y `tecnico_administrativo`. Para un perfil que no está activo
  devuelve nulo. `auditoria.operacion` es de tipo `text`.

**Quién escribe en `auditoria`**
- `fn_auditar` (`20260829150000_auditoria_y_solo_adicion.sql:45-84`) es definer y anota
  `actor_id = auth.uid()`. Copia `to_jsonb` de la fila menos las columnas que recibe en
  `TG_ARGV`. Solo escribe INSERT, UPDATE y DELETE.
- `registrar_evento_auditable` es definer y fuerza `actor = uid`. Solo admite SESION, BUSQUEDA,
  TITULARIDAD y LECTURA_IDENTIFICACION. El contenido de esas filas lo pone quien llama.

**Funciones que leen `auditoria`**
- Catálogo, `prosrc ~* 'from\s+(public\.)?auditoria\y'`: solo dos.
  - `leer_identificacion(p_paciente_id)` es **security invoker** (`prosecdef = f`).
  - `generar_codigos_recuperacion()` es definer y lee filas de TOTP_REPUESTO.
- La deduplicación de `leer_identificacion` filtra por `actor_id = v_uid`,
  `operacion = 'LECTURA_IDENTIFICACION'`, `registro_id` y una ventana de 15 minutos. **No
  filtra por `tabla`.** Corre bajo la RLS de quien llama, así que el técnico tiene que seguir
  viendo sus filas LECTURA_IDENTIFICACION. Si no las ve, cada lectura añade una fila: el fallo
  es benigno pero rompe ADR-060 y el banco 08.
- La fila de rastro que escribe es `tabla = 'pacientes_identificacion'` con
  `estado_posterior = {rol, documento: bool, domicilio: bool}`. No lleva nada clínico.

**Lectores de `auditoria` en la app**
- La app no hace ningún `.from('auditoria')`.
  - `app/(app)/pacientes/[id]/datos.ts:364` y `lib/economico/borrador.ts:222` llaman a
    `leer_identificacion`.
  - `panel-datos.tsx:34`, `panel-diferido.tsx:14`, `page.tsx:35,120` y `lib/cuentas/invitar.ts:24`
    solo la nombran en comentarios.
  - No existe pantalla de auditoría en `app/`.
- Fuera de la app:
  - `scripts/t032-alta.ts:111` lee `auditoria` como profesional (ana).
  - `scripts/t004-auditoria.sql` lee como `postgres`.

**Bancos que leen `auditoria` bajo un rol**
- `08-identificacion.sql:191-288`. TEC1, ADM y PRO1 ven su fila LECTURA_IDENTIFICACION y la
  deduplicación funciona. PRO1 ve su fila BUSQUEDA.
- `26-economico.sql:689` (26.F7): TEC1 ve 0 filas de `borradores_factura_versiones`.
- `04-baja.sql:45,59`: PROBAJA (profesional) ve más de 0 filas activo y 0 de baja.
- `11-cobertura.sql:21` lista el nombre `auditoria_lectura_propia`.

**Sonda medida con 00 + 01 + guion propio en `begin … rollback`**
- TEC1 da de alta una cita (`agenda_crear_cita`) para Q, participante de un episodio de pareja
  EP que es el único abierto de PRO1. La cita queda con `episodio_id = EP`: la resolución
  automática actúa aunque el técnico no elija episodio.
- Después TEC1 hace, por este orden:
  - reprograma con `agenda_actualizar_cita(p_inicio, p_fin)`;
  - cambia la asistencia con `agenda_cambiar_asistencia`;
  - crea una serie de 3 con `agenda_crear_serie`;
  - edita la serie con `agenda_editar_serie(…, 'esta_y_siguientes', p_hora_local)`;
  - cancela con `agenda_cancelar_cita(…, 'esta')`.
- Filas con actor TEC1 que deja todo eso:

  | tabla | operación | filas | lleva EP | lleva el tipo |
  |---|---|---|---|---|
  | citas | INSERT | 4 | sí | sí |
  | citas | UPDATE | 3 | sí | sí |
  | series_cita | INSERT | 1 | sí | sí |
  | series_cita | UPDATE | 1 | sí | sí |
  | propuestas_cita | INSERT | 3 | no | no |

- **Con la política de hoy, TEC1 ve 9 filas que contienen EP o el tipo. Esto reproduce H25.**
- Con la política de §1:
  - TEC1 ve 0 filas en total y 0 con EP o el tipo.
  - Después hace `leer_identificacion(P1)` dos veces. Ve 1 fila LECTURA_IDENTIFICACION y como
    `postgres` hay 1. La deduplicación se conserva.

**Otras columnas que identifican o agrupan, inventario de `information_schema`**
- `citas`: `tipo_terapia_id`, `episodio_id`, `serie_id`, `bono_id`.
- `series_cita`: `tipo_terapia_id`, `episodio_id`.
- `tarifas_paciente`: `tipo_terapia_id`.
- `episodio_id` además en `consentimientos`, `diagnosticos`, `episodio_participantes`,
  `evaluaciones`, `informes` y `valoraciones_riesgo`.
- `notas_clinicas`: `episodio_id`, `cita_id`.
- `propuestas_cita`: `serie_id`, `cita_id`.

**Caminos en los que el técnico es actor**
- Funciones de agenda (`agenda_*`).
- Cascadas de `citas`: `alertas_documentacion` y bono de la cita.
- `cobros_alta`, `bonos_alta` y `cobros_facturas_alta` en su rama de técnico.
- Notificaciones por disparador.
- `registrar_evento_auditable`: SESION, BUSQUEDA y LECTURA_IDENTIFICACION.

**Requisitos de la migración y del banco**
- `scripts/lint-migraciones.ts`:
  - la regla 1 solo muerde UPDATE, DELETE o TRUNCATE sobre tablas de solo adición;
    `drop policy … on public.auditoria` no cae;
  - la regla 5 exige el nombre `AAAAMMDDHHMMSS_descripcion.sql`.
- Banco: `scripts/test-rls.mjs` concatena `scripts/rls/*.sql` en orden alfabético dentro de un
  solo `begin … rollback`. En `main` existen 00–33 y 35; T-047 añade 34.
- Anclas de año ya usadas: +1, +3, +4, +6, +7, +8, +9 (34, T-047), +10, +11, +12 y +13. **+14
  está libre.**
- ADR-074 y `docs/architecture.md` §Roles: fila «Auditoría — Administrador: Lectura ·
  Profesional: sus propios registros · Técnico: **sin acceso**». En Agenda, el técnico va
  «sin tipo de terapia ni episodio».

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261018120000_auditoria_propia_del_tecnico.sql`

Solo DDL de política. No toca ninguna fila de `auditoria`, ninguna función ni ninguna firma, así
que `lib/supabase/tipos-bd.ts` no cambia.

```sql
-- Cabecera: H25 en cuatro líneas, la elección (b) con lista blanca y por qué (ver §2 del diseño),
-- y la frase «no se reescribe ninguna fila: protege por lectura también lo escrito antes».

drop policy if exists auditoria_lectura_propia on public.auditoria;
create policy auditoria_lectura_propia on public.auditoria
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    and (
      (select public.rol_actual()) in ('administrador'::public.rol_usuario,
                                       'profesional_sanitario'::public.rol_usuario)
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and operacion = 'LECTURA_IDENTIFICACION'
      )
    )
  );

comment on policy auditoria_lectura_propia on public.auditoria is
  'T-053 (H25): administrador y profesional leen sus filas; el técnico solo su rastro de '
  'LECTURA_IDENTIFICACION, que necesita la deduplicación de leer_identificacion() (invoker, '
  'ADR-060). Ninguna fila de fn_auditar del técnico es legible por él: citas y series_cita '
  'llevan tipo_terapia_id y episodio_id (ADR-074.2). Lista blanca: una tabla nueva queda '
  'cerrada al técnico sin tocar esto. De baja (rol_actual nulo), nada.';
```

- **El nombre de la política no cambia**, así que `11-cobertura.sql` no se toca.
- El corte por baja se conserva: con `rol_actual()` nulo, tanto `in (…)` como `=` dan nulo.
- No hay rama nueva para el administrador (ver §2, D4).

### 1.2 Banco `scripts/rls/36-auditoria-propia.sql`

Va al final, en el siguiente número libre (punto 7 del README). Usa los ayudantes de 00 y los
actores de 01: ADM, PRO1, PRO2, TEC1, CA y P1.

Tiene que pasar igual en dos ejecuciones:
- en el banco entero, donde antes otros módulos han hecho actuar a TEC1 como actor de muchas
  tablas;
- en la ejecución mínima `00 + 01 + 36` que usan los mutantes.

Por eso ninguna aserción supone que TEC1 no haya hecho nada antes.

**Fijación propia**, como `postgres`; las variables psql llevan sufijo 36:
- `TT36 = 'a0530001-0000-4000-8000-000000000001'`: tipo de terapia `Sesión T-053`, 50 min,
  activo.
- `P36 = 'd0530001-…-000000000001'` (titular) y `Q36 = 'd0530001-…-000000000002'`: pacientes
  de PRO1 en CA.
- `EP36 = 'e0530001-…-000000000001'`: episodio de PRO1 en CA, `modalidad_relacional = 'pareja'`,
  titular P36, `abierto_en = current_date - 30`, sin cerrar.
- Participantes de EP36: P36 y Q36, `papel = 'miembro'`, `alta_en = current_date - 20`.
- `lunes_36`: primer lunes de mayo de `extract(year from now())::int + 14`, con la plantilla
  del README.

**A · Actúa el técnico** (`pg_temp.como(:TEC1)`), en este orden:
1. `agenda_crear_cita(Q36, PRO1, CA, TT36, lunes_36, '09:00')` → `C36`.
2. `agenda_actualizar_cita(C36, p_inicio, p_fin)` → reprogramar al día siguiente a las 10:00.
3. `agenda_cambiar_asistencia(C36, 'online')`.
4. `agenda_crear_serie(Q36, PRO1, CA, TT36, 'semanal', 3, '12:00', 50, lunes_36 + 7, 3)`, más
   `agenda_editar_serie(<primera cita de la serie>, 'esta_y_siguientes', p_hora_local => '13:00')`.
5. `agenda_cancelar_cita(C36, 'esta', 'T-053')`.
6. `leer_identificacion(P1)` dos veces seguidas.

**B · Gemelas de existencia** (como `postgres`). Sin ellas, un «0 filas» no prueba nada.

| Id | Comprobación |
|---|---|
| 36.B1 | `citas.episodio_id` de C36 es EP36: la resolución automática actuó. |
| 36.B2 | Hay al menos una fila de `auditoria` con actor TEC1, `tabla = 'citas'`, `estado_posterior->>'episodio_id' = EP36` y `->>'tipo_terapia_id' = TT36`. |
| 36.B3 | Lo mismo con `tabla = 'series_cita'` y `tipo_terapia_id = TT36`. |
| 36.B4 | Sembrado: una fila con actor TEC1, `tabla = 'episodio_participantes'`, `operacion = 'INSERT'` y `estado_posterior = jsonb_build_object('id', gen_random_uuid(), 'episodio_id', EP36, 'paciente_id', Q36, 'papel', 'miembro')`. Solo lleva `episodio_id`. Se siembra igual que `08-identificacion.sql:227`. |
| 36.B5 | Sembrado: otra con `tabla = 'tarifas_paciente'` y `estado_posterior = jsonb_build_object('id', gen_random_uuid(), 'paciente_id', P36, 'tipo_terapia_id', TT36)`. Solo lleva el tipo. |

Las dos filas sembradas modelan «una tabla auditada que lleva solo una de las dos claves». Son
las que distinguen los mutantes M2 y M3.

**C · El técnico no ve nada que agrupe ni tipifique** (`como(:TEC1)`). **El orden es parte del
contrato**: cada mutante tiene que caer en una aserción distinta.

| Id | Comprobación |
|---|---|
| 36.T1 | 0 filas con `tabla = 'citas'`. |
| 36.T2 | 0 filas con `tabla = 'series_cita'`. |
| 36.T3 | 0 filas con `coalesce(estado_anterior,'{}') ? 'episodio_id' or coalesce(estado_posterior,'{}') ? 'episodio_id'`. |
| 36.T4 | Lo mismo con `? 'tipo_terapia_id'`. |
| 36.T5 | 0 filas cuyo `coalesce(estado_anterior::text,'') \|\| coalesce(estado_posterior::text,'')` contenga el texto de EP36 o de TT36. Caza claves con otro nombre o anidadas. |
| 36.T6 | 0 filas con `operacion <> 'LECTURA_IDENTIFICACION'`. Es la lista blanca. |
| 36.T7 | Gemela positiva: exactamente 1 fila con `operacion = 'LECTURA_IDENTIFICACION' and registro_id = P1::text`. |
| 36.T8 | Como `postgres`, también 1 fila LECTURA_IDENTIFICACION de TEC1 sobre P1: la deduplicación sigue viva. |

**D · El administrador sigue viendo sus filas completas**
- `como(:ADM)`: `agenda_crear_cita(Q36, PRO1, CA, TT36, lunes_36 + 2, '09:00')` → `CA36`. La
  resolución automática le pone EP36 (P4 = A, aceptado).
- Después reprograma `CA36` con `agenda_actualizar_cita`.

| Id | Comprobación |
|---|---|
| 36.A1 | ADM ve al menos 1 fila `tabla = 'citas'` con `registro_id = CA36` y `estado_posterior->>'episodio_id' = EP36`. |
| 36.A2 | La misma fila con `->>'tipo_terapia_id' = TT36`. |
| 36.A3 | ADM ve 0 filas con `actor_id <> ADM`. Es el estado de hoy, que no cambia (D4). |

**E · Profesional propio y ajeno**
- `como(:PRO1)`: `agenda_crear_cita(P36, PRO1, CA, TT36, lunes_36 + 3, '09:00')`.

| Id | Comprobación |
|---|---|
| 36.P1 | PRO1 ve su fila de `citas` con `episodio_id = EP36` y el tipo TT36. |

- `como(:PRO2)`: `registrar_evento_auditable('BUSQUEDA', 'pacientes', P2::text, null)`.

| Id | Comprobación |
|---|---|
| 36.P2 | PRO2 ve 0 filas con `actor_id <> PRO2`. |
| 36.P3 | PRO2 ve 0 filas que contengan el texto de EP36 o de TT36. |
| 36.P4 | Gemela: PRO2 ve al menos 1 fila suya (la BUSQUEDA). |

**K · Catálogo y cable trampa** (como `postgres`)

| Id | Comprobación |
|---|---|
| 36.K1 | Exactamente una política en `pg_policies` sobre `public.auditoria`: nombre `auditoria_lectura_propia`, `cmd = 'SELECT'`, `roles = {authenticated}`. |
| 36.K2 | `relrowsecurity = true` en `public.auditoria`. `has_table_privilege('authenticated','public.auditoria', p)` es falso para INSERT, UPDATE, DELETE y TRUNCATE y verdadero para SELECT. |
| 36.K3 | Ninguna vista ni vista materializada depende de `auditoria`: `pg_depend` con `pg_rewrite`, `refobjid = 'public.auditoria'::regclass`, `0 filas`. |
| 36.K4 | El conjunto de funciones de `public` con `prosrc ~* 'from\s+(public\.)?auditoria\y'` es exactamente `{generar_codigos_recuperacion, leer_identificacion}`. En la regex de Postgres va `\y`, no `\b`. |
| 36.K5 | `leer_identificacion` sigue con `prosecdef = false`. |

K4 y K5 obligan a que cualquier función nueva que lea `auditoria` pase por revisión, y a que
quien cambie `leer_identificacion` a definer relea este diseño.

Cierre: `\echo '36-auditoria-propia: completa.'`.

### 1.3 `scripts/rls/README.md`

- Tabla de módulos: una fila para el 36, `auditoria_lectura_propia` y H25.
- Punto 10.2:
  - fila de la tabla de franjas: `36 (T-053) | PRO1/CA | primer lunes de mayo de Y+14 .. +7 y la
    serie +7..+21`;
  - entrada en la lista de comprobación: `36:<línea> → +14`.

### 1.4 `tickets/T-053/mutantes.json`

Formato de T-023b: `{ticket, metodo, mutantes:[{id, cambio, cae}]}`.

**Método**: cada mutante es un fichero SQL con su `drop policy` / `create policy` y se aplica
dentro de la misma transacción del banco:

```sh
( echo "begin;"; cat tickets/T-053/mutantes/Mx.sql; cat scripts/rls/*.sql; echo "rollback;" ) \
  | docker exec -i <contenedor> psql -U postgres -v ON_ERROR_STOP=1
```

- Se usa el banco entero, con el mismo orden que `test:rls`. «Cae» es la primera aserción que
  rompe.
- La medida se hace sobre una base con `max(version) = 20261018120000`.
- El original, con el mismo comando y sin mutante, da exit 0.

| Id | Cambio (sustituye el `using`) | Debe caer en |
|---|---|---|
| M1 | Quitar el filtro de rol: `(select rol_actual()) is not null and actor_id = (select auth.uid())`, la política de hoy. | 36.T1 |
| M2 | «Dejar `episodio_id`»: la rama técnico admite toda fila sin la clave `tipo_terapia_id` (`not (coalesce(estado_anterior,'{}') ? 'tipo_terapia_id' or coalesce(estado_posterior,'{}') ? 'tipo_terapia_id')`) en vez de solo LECTURA_IDENTIFICACION. | 36.T3, por la fila sembrada 36.B4 |
| M3 | «Dejar `tipo_terapia_id`»: lo simétrico, filtrando solo por la clave `episodio_id`. | 36.T4, por la fila sembrada 36.B5 |
| M4 | Olvidar `series_cita`: la rama técnico admite `tabla <> 'citas'`. | 36.T2 |
| M5 | Abrir al profesional ajeno: `(rol = 'profesional_sanitario') or (actor_id = uid and (rol = 'administrador' or (rol = técnico and operacion = 'LECTURA_IDENTIFICACION')))`. | 36.P2 |
| M6 | Técnico sin rama: lista positiva solo de administrador y profesional. | `08-identificacion` («TEC1: la primera lectura de P1 añade UNA fila…»). Corre antes que 36; 36.T7 lo cazaría igual. |

Si un mutante cae en otra aserción de la prevista, se anota la real. No se reordena el banco
para que coincida sin entender por qué. Si alguno sobrevive, el ticket no se cierra.

### 1.5 Documentación

**`docs/architecture.md:199`**: «Sigue abierta H25 …» pasa a «**H25 cerrada (T-053)**». Texto
del cambio:
- `auditoria_lectura_propia` ya no le devuelve al técnico ninguna fila escrita por los
  disparadores de auditoría;
- solo le devuelve su rastro de `LECTURA_IDENTIFICACION`, que la deduplicación de
  `leer_identificacion()` necesita;
- **no lee en su auditoría ni el tipo ni el `episodio_id` de las citas o series que da de alta o
  reprograma.**
- La frase que sigue, la puerta de la duración (R2-H1), **se queda tal cual**.

**`docs/architecture.md:505`**: el residuo (1) se reescribe como «(1) H25, cerrado en T-053:
…», con la misma idea. Los residuos (2) P4 = A y C18TEC no se tocan.

Ninguna de las dos frases puede decir «el técnico no deduce el tipo» ni «el técnico no ve nada
de la auditoría»: la primera negaría R2-H1 y la segunda su rastro de identificación.

**Fila «Auditoría» de §Roles**: no se edita. «Técnico: sin acceso» describe la pantalla. Si
hace falta precisión, una nota al pie, no una celda: «salvo su propio rastro de lectura de
identificación, que no se muestra en ninguna pantalla».

**`docs/state.md`**: se quita la línea 62 (H25) de Hallazgos y se reescribe la cabecera.

**`docs/bitacora/T-053.md`**: nueva.

## 2 · Decisiones y alternativas descartadas

- **D1 · Salida (b) para todas las tablas, con lista blanca (cerrada por defecto).**
  - Ningún lector de la app ni de los scripts necesita una fila de `fn_auditar` del técnico. El
    único lector bajo su rol es la deduplicación de `leer_identificacion`, y solo mira
    LECTURA_IDENTIFICACION.
  - Una lista blanca deja cerrada al técnico cualquier tabla que se audite en el futuro, sin
    volver a esta política.
  - La matriz ya dice «Técnico: sin acceso».
- **(a) descartada** (quitar las claves y dejar leer la fila).
  - RLS filtra filas, no claves de un jsonb. Haría falta una vista `security_invoker` o una
    función definer nueva que ningún lector usa.
  - Habría que mantener por tabla una lista negra de claves: `episodio_id` vive en ocho tablas,
    y `bono_id` y `serie_id` también agrupan.
  - Es más superficie para el mismo efecto.
- **(b) por tabla negra** (`tabla not in ('citas','series_cita')`) **descartada**.
  - Es el mutante M4 en potencia: falla abierta con la próxima tabla.
  - Deja ver `propuestas_cita`, que sí lleva `cita_id` y `serie_id`.
- **Pasar `leer_identificacion` a definer, para que la deduplicación no dependa de la RLS,
  descartado.**
  - Toca una función de ADR-060 que el ticket no cita.
  - No quita la necesidad de la política: el técnico seguiría leyendo `fn_auditar` por la
    tabla.
- **Sin condición `tabla = 'pacientes_identificacion'` en la rama técnico.**
  - Las filas LECTURA_IDENTIFICACION solo nacen de `registrar_evento_auditable`, con el
    contenido que pone quien llama; `fn_auditar` nunca las escribe.
  - La condición no protegería nada medible y produciría un mutante equivalente.
- **D4 · El administrador no gana rama de lectura total.** «Sigue leyendo la auditoría
  completa» se lee como «sus filas, sin recortar claves», que es lo que lee hoy. Abrirle las
  filas ajenas es otro cambio de quién ve qué, fuera de H25. Se pregunta igualmente en el gate
  (P1).
- **No cambiar el actor** (nota del contrato): falsearía la auditoría.
- **Mismo nombre de política**: no hay que tocar `11-cobertura` y queda un solo punto de
  verdad.
- **Banco nuevo con fijación propia y ancla +14**: no hereda el calendario de nadie (punto 10
  del README).

## 3 · Cómo se cierra cada criterio de aceptación

**CA1 · Banco nuevo en `test:rls`**
- `npx supabase db reset`.
- `select max(version) from supabase_migrations.schema_migrations` debe dar `20261018120000`.
  Ojo: si T-047 no está en `main`, la base local de la rama no llevará 20261017.
- `npm run test:rls` con exit 0, y en la salida `36-auditoria-propia: completa.` y los OK de
  36.B*/T*/A*/P*/K*.

**CA2 · Mutantes**
- `tickets/T-053/mutantes.json` con M1–M6, todos muertos, más los seis SQL en
  `tickets/T-053/mutantes/`.
- Cada uno medido con el comando de §1.4, que corre en `begin … rollback` y no necesita
  `db reset`. Se guarda la línea `ERROR:  FALLO: …` real.

**CA3 · Resto en verde**
- `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx next build --webpack` y
  `npx tsc --noEmit`, con su salida en la evidencia.
- `git diff main -- lib/supabase/tipos-bd.ts` vacío, tras `npm run tipos`.

**CA4 · Huellas**: `npm run verificar:huellas` dice «cadena íntegra». Además, como `postgres`:
- `select count(*) from auditoria` antes y después de aplicar la migración, igual;
- la migración no contiene `update`, `delete` ni `insert` sobre `auditoria` (grep).

**CA5 · QA visible**
1. Como técnico, con la base sembrada:
   - `/agenda`: dar de alta una cita y reprogramarla;
   - `/pacientes/<uuid>`, pestaña Datos: el bloque Identificación se pinta y la llamada a
     `leer_identificacion` responde bien.
   - Capturas frente a `main` y consola sin errores.
   - `node ~/.claude/pipeline/qa.mjs visita /agenda /pacientes/<uuid>`.
2. **Como administrador, «la auditoría de una cita sigue enseñando tipo y episodio»: no hay
   pantalla de auditoría en la app.** Propuesta, pendiente de P2:
   - se cierra con 36.A1 y 36.A2;
   - más una consulta como ADM en `begin … rollback` (`set local role authenticated` y sus
     claims) que muestra la fila con `tipo_terapia_id` y `episodio_id`, pegada en la evidencia.

**Documentación**: `grep -n "H25" docs/architecture.md docs/state.md` solo encuentra las frases
de cierre. `docs/bitacora/T-053.md` existe.

## 4 · Riesgos, por probabilidad

1. **Alta · conflicto de README con T-047.** Las dos ramas añaden una fila en la tabla de anclas
   del punto 10.2. Quien integre segundo resuelve a mano, conservando las dos filas (+9 y +14).
   Lo mismo con `max(version)` si T-047 entra después.
2. **Media · el banco 36 choca en el calendario.**
   - PRO1/CA en Y+14 está libre hoy. Si otro ticket elige +14 antes, hay que mover el ancla.
   - `fechas-fijas.mjs` debe pasar: sin literales de fecha.
3. **Media · el orden de 36.T1–T6 se «arregla» sin entenderlo.** Si se reordena, los mutantes
   siguen muriendo pero ya no se distinguen. §5 lo vigila.
4. **Baja · un lector futuro de la auditoría del técnico.** Por ejemplo, una pantalla «Mi
   actividad». Se encontrará la lista blanca cerrada. Es deseable: tendrá que decidirlo un
   ticket.
5. **Baja · rendimiento.** La política añade `(select rol_actual())`, que es un initPlan, y una
   comparación de texto. Es despreciable frente a la deduplicación, que ya filtra por `actor_id`.
6. **Baja · el técnico pierde la lectura de sus filas SESION y BUSQUEDA.** Hoy ninguna pantalla
   ni script las lee bajo su rol, así que no cambia nada visible.

## 5 · Qué revisar

- [ ] **La política entera, cláusula por cláusula.**
  - `actor_id = (select auth.uid())` va fuera de las ramas y aplica a los tres roles. Si queda
    dentro de una sola rama, la otra se abre (M5).
  - Los roles van en positivo con `in (…)`, nunca `is not null` ni `<>`.
  - La rama técnico solo admite `operacion = 'LECTURA_IDENTIFICACION'`.
- [ ] **Qué elige el llamante.**
  - El técnico controla el contenido de las filas que escribe por `registrar_evento_auditable`,
    incluso con operación LECTURA_IDENTIFICACION. Solo puede leer lo que él mismo ha escrito,
    así que no hay fuga.
  - No controla `actor_id`: `fn_auditar` y `registrar_evento_auditable` lo fuerzan.
  - Comprobar que la migración no añade grants de INSERT a `authenticated` sobre `auditoria`
    (36.K2).
- [ ] **Nulos.**
  - Perfil de baja: `rol_actual()` nulo da 0 filas para los tres roles (`04-baja` sigue en
    verde).
  - Fila con `estado_anterior` nulo (los INSERT): los `?` del banco van con `coalesce(…,'{}')`.
    Si no, `null ? k` es nulo y la aserción cuenta mal a favor.
- [ ] **Otras puertas.**
  - Vistas: 36.K3. Funciones: 36.K4 y K5.
  - Realtime: no está publicada.
  - PostgREST con `count=exact` aplica la misma RLS.
  - TRUNCATE, UPDATE y DELETE siguen sin grant (36.K2).
  - Una función definer nueva que devuelva filas de `auditoria` haría caer K4. Es lo que se
    quiere.
- [ ] **Pruebas que deben fallar, y por qué.**
  - 36.T1 con la política de `main` (M1): las 7 filas de `citas` de TEC1.
  - 36.T3 y 36.T4 solo por las filas sembradas B4 y B5. Verificar que las siembras existen
    (gemelas B4 y B5) y que llevan **solo** una de las dos claves.
  - 36.P2 con M5.
  - 36.T7 y 08 con M6.
- [ ] **Gemelas.**
  - Cada «0 filas» de T1–T5 tiene su B1–B3 que prueba que la fila existe con la clave.
  - P2 tiene P4; T6 tiene T7.
- [ ] **El banco pasa en las dos ejecuciones.**
  - Entero, con TEC1 ya cargado de filas de otros módulos: T6 sigue en 0 porque la lista blanca
    vale para todas.
  - La de los mutantes.
- [ ] **Regla 6.** La migración no lleva `update`, `delete` ni `insert` sobre `auditoria`, y
  `verificar:huellas` está íntegro.
- [ ] **Documentación (patrón «la doc generaliza la cobertura»).**
  - Las frases nuevas de `architecture.md:199` y `:505` no dicen que el técnico no pueda deducir
    el tipo (R2-H1 sigue abierto y aceptado).
  - Tampoco que no vea nada de la auditoría: ve su rastro de identificación.
  - Dejan intactos P4 = A y C18TEC.
- [ ] `tipos-bd.ts` sin diff. `11-cobertura.sql` sin diff.

## 6 · Territorio

El del contrato:
- `supabase/migrations/20261018120000_auditoria_propia_del_tecnico.sql`
- `scripts/rls/36-auditoria-propia.sql` y `scripts/rls/README.md`
- `docs/architecture.md`, `docs/bitacora/T-053.md` y `docs/state.md`
- `lib/supabase/tipos-bd.ts`, que no se espera tocar

Más lo que exigen los criterios: `tickets/T-053/mutantes.json`, `tickets/T-053/mutantes/*.sql` y
la evidencia en `tickets/T-053/`.

## 7 · Delegable

Nada. El contrato dice `delegable: no` y todo el ticket es RLS y su banco.

## Lo que no entra, y por qué

- **Duración como canal del tipo (R2-H1)**: riesgo aceptado el 02-10-2026.
- **P4 = A**: el administrador deduce el episodio por la resolución automática. Aceptado en
  T-039.
- **Residuo C18TEC del banco 18**: anotado aparte en `architecture.md`.
- **Lectura total de la auditoría para el administrador**: la matriz dice «Lectura», pero hoy no
  existe y no es H25 (D4 y pregunta P1).
- **Pantalla de auditoría**: no existe y el ticket no la pide (pregunta P2).
- **`propuestas_cita`, `alertas_documentacion` y demás**: quedan cerradas al técnico por la
  misma lista blanca, sin tratarlas aparte.

## Gate del propietario (16-10-2026)

- Diseño: **aprobado, implementa**.
- P1: el administrador **se queda como está** (sus filas, completas). Leer la auditoría de todos sería un ticket propio.
- P2: el criterio de QA del administrador se cierra con 36.A1 y 36.A2 más una consulta como administrador en `begin … rollback` pegada en la evidencia.
- P3: el técnico deja de leer sus filas de inicio de sesión y búsqueda: **sí** (aprobado con el diseño).
