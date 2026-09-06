---
id: T-002
titulo: RLS — funciones auxiliares y políticas de los tres roles
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-001]
estado: en_curso
notas: Migracion, enmienda multicentro (ADR-051) y revision con Opus INTEGRADAS en main. Queda solo el punto 3 del guion manual en navegador (un perfil suspendido deja de ver /pacientes), que no se ha ejecutado nunca.
---

# Contexto

T-001 dejó todas las tablas con RLS activo y **sin una sola política**, es decir,
denegando todo. Este ticket escribe las políticas, y con ellas la matriz de roles deja de
ser una tabla en un documento y pasa a ser código que la base hace cumplir.

Es el ticket más caro de equivocar del proyecto: **una política mal escrita es una
filtración**, y se propaga a las veinte pantallas que la dan por buena. Las pruebas que lo
demuestran son T-003 y son ticket aparte a propósito — quien escribe la política no es
quien la prueba.

Referencias: `docs/architecture.md` §Roles (la matriz manda), §RLS, §Candado,
§Separación por sensibilidad. ADR **026** (`historia_desbloqueada()`), **028** (acceso del
representante), **030** (participación en episodio), **031** (resolver por el vínculo),
**032** (baja del profesional, titularidad), **033** (centro acota al técnico), **036**
(el borrador va bajo candado y bajo RLS).

## Tareas

- [x] **Funciones auxiliares**, todas `stable security definer set search_path = ''`, con
      `revoke execute from public` y `grant` solo a `authenticated`:
      - `rol_actual()` — ya existe de T-000; revisar, no reescribir.
      - `es_profesional_asignado(paciente_id)` — **resuelve el vínculo de fusión en un
        solo salto** (ADR-031) y devuelve **falso si el perfil no está `activo`**
        (ADR-032).
      - `historia_desbloqueada()` — desbloqueo vigente y no revocado (ADR-026). Invoca
        `extensions.crypt`, no `crypt`, porque el `search_path` está vacío.
      - `centro_actual()` — el centro del perfil, para acotar al técnico (ADR-033).
- [x] **Disparador de alta de perfil**: al crearse un `auth.users` se crea su fila en
      `perfiles`. Es la deuda que T-000 dejó anotada («un usuario creado a mano en Studio
      no tendrá perfil»).
- [x] **Políticas del dominio Organización**: `organizacion` y `centros` legibles por los
      tres roles; escritura solo administrador. `perfiles`: lectura propia siempre, y
      lectura del directorio según la matriz. **Ninguna política sobre `perfiles` invoca
      `rol_actual()`** — regla permanente.
- [x] **Políticas de `pacientes`**: administrador total; profesional los suyos vía
      `es_profesional_asignado()`; técnico administrativo **el subconjunto de lectura**
      acotado a su centro.
- [x] **Políticas de `pacientes_identificacion`**: administrador total, profesional los
      suyos, **técnico sin acceso** (ni una fila).
- [x] **Políticas del contenido clínico** —`episodios_asistenciales`, `diagnosticos`,
      `valoraciones_riesgo`, `notas_clinicas`, `notas_clinicas_versiones`, `evaluaciones`,
      `evaluacion_archivos`, `informes`— **exigiendo `historia_desbloqueada()` además del
      resto** (ADR-026). El administrador **no ve notas ajenas** (decisión 5); el
      profesional, como autor o asignado.
- [x] **Riesgo para el técnico**: nunca la fila de `valoraciones_riesgo`. El indicador
      binario sale de columna o vista derivada, no de un `select` filtrado en la
      aplicación (decisión 6, invariante 3).
- [x] **Nota conjunta** (ADR-030): visible para el profesional de **cualquier**
      participante del episodio, por participación y no por copia.
- [ ] ~~**Acceso del representante legal** (ADR-028) y su restricción por defecto a partir
      de los 16 años, levantable por el profesional dejando constancia.~~
      **FUERA DE ALCANCE** por decisión del propietario (§0 del diseño, punto 1): un
      representante no es un `auth.users` ni tiene perfil, así que no hay sujeto al que
      aplicar una política. Se traslada al ticket de la salida dirigida al paciente.
      Anotado en `docs/state.md` §Hallazgos anotados.
- [x] **`alertas_documentacion` queda fuera del candado**: se lee sin desbloqueo, porque
      son recuentos y estados, no contenido (ADR-026, choque 11).
- [x] **`pines_historia` y `desbloqueos_historia`**: sin `select` para nadie; se tocan solo
      por funciones `security definer` (fijar PIN, verificar PIN, desbloquear, bloquear,
      prolongar). **Ninguna de sus políticas invoca `historia_desbloqueada()`** — sin
      recursión por construcción.
- [x] **Bloqueo por intentos** dentro de la función de verificación: cinco fallos, quince
      minutos, entrada en `auditoria` y notificación al titular. El contador vive en la
      base, no en la sesión. El PIN viaja **como parámetro ligado**, jamás interpolado.
      *La **notificación al titular** queda pendiente: no existe tabla `notificaciones` en
      el esquema (T-001 no la creó). Se escribe la auditoría, que es lo que exige el
      criterio 10, y la deuda queda anotada en `docs/state.md`.*

## Criterios de aceptación (verificables)

Todos con sesión simulada (`set local role authenticated` + `request.jwt.claims`), en el
guion SQL de este ticket. La batería completa por rol es T-003.

- [x] **Automático** — `npx supabase db reset`, `npm run lint` y `npm run build` limpios.
- [x] **Automático** — el `tecnico_administrativo` obtiene **cero filas** de
      `pacientes_identificacion`, `notas_clinicas`, `notas_clinicas_versiones`,
      `episodios_asistenciales`, `diagnosticos`, `valoraciones_riesgo`, `evaluaciones`,
      `evaluacion_archivos` e `informes`.
- [x] **Automático** — el técnico de un centro **no ve** los pacientes de otro centro; el
      profesional **sí** ve a los suyos aunque estén en otro centro (ADR-033).
- [x] **Automático** — el `administrador` obtiene **cero filas** de `notas_clinicas` de
      otro profesional, incluso con desbloqueo vigente.
- [x] **Automático** — el profesional asignado **sin desbloqueo vigente** obtiene **cero
      filas** de `notas_clinicas`; tras desbloquear, las suyas; tras `bloquear`, cero otra
      vez (prueba negativa del ADR-026).
- [x] **Automático** — el mismo profesional **sí** lee `alertas_documentacion` sin
      desbloqueo alguno.
- [x] **Automático** — un paciente `fusionado_en` otro es legible por el profesional del
      **superviviente**, en un solo salto, y crear una cadena de dos saltos es imposible.
- [x] **Automático** — un profesional con `estado = 'baja'` obtiene **cero filas** de sus
      propios pacientes y de sus propias notas.
- [x] **Automático** — el profesional de **cualquier** participante de un episodio conjunto
      lee la nota conjunta; un profesional ajeno al episodio, cero filas.
- [x] **Automático** — cinco verificaciones fallidas de PIN dejan el PIN bloqueado, generan
      su entrada en `auditoria`, y la sexta **no** desbloquea aunque el PIN sea correcto.
- [x] **Automático** — `select` directo sobre `pines_historia` como `authenticated` falla
      con permiso denegado, con y sin desbloqueo vigente.
- [x] **Automático** — ninguna política sobre `perfiles`, `pines_historia` ni
      `desbloqueos_historia` menciona `rol_actual()` ni `historia_desbloqueada()`
      (comprobable con `select ... from pg_policies`).

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run dev`.
2. Entra con el profesional sembrado y abre `/pacientes`: sigue viendo solo los suyos.
3. En Studio, ejecuta el guion SQL del ticket y comprueba que **el bloque de desbloqueo
   caduca solo** esperando la ventana o adelantando la caducidad a mano.

## Notas para el agente

- **`(select auth.uid())` siempre entre paréntesis** → InitPlan, una evaluación por
  sentencia y no por fila. Patrón de proyecto, no preferencia.
- Una política que lo deniega todo **también pasa** una prueba negativa. Cada criterio
  negativo lleva su gemelo positivo, o no prueba nada.
- **La ventana de desbloqueo se prolonga en Server Actions, jamás en el renderizado**
  (ADR-026). Aquí solo se escriben las funciones; quien las llama es T-006 y la fase 1.
- Nada de guardar el rol en el JWT: quedaría cacheado hasta la renovación y revocar un rol
  no tendría efecto inmediato (T-000 §Diseño, descartado con motivo).
- Las políticas se leen como frases o están mal escritas. Si una necesita un comentario
  para entenderse, el comentario va en la migración.
- **Cada política que escribas aquí tiene su prueba en T-003.** Una política sin test es
  código no escrito (`architecture.md` §RLS): deja la lista de las que añades para que
  T-003 no tenga que deducirla.

---

## Diseño aprobado

### 0 · Decisiones del propietario, 22-08-2026 (resuelven los tres bloqueos)

| # | Bloqueo | Resolución |
|---|---|---|
| 1 | **Acceso del representante legal (ADR-028)** no es implementable en RLS: un representante no es un `auth.users` ni tiene perfil, y el portal del paciente es v2 (decisión 13). No hay sujeto al que aplicar una política | **Se traslada** al ticket que cree la salida dirigida al paciente (derecho de acceso / exportación), que es donde tendrá sujeto y prueba. **Sale del alcance de T-002** y se anota en `docs/state.md`. Escribir hoy una función que nadie llama sería una política sin prueba, es decir, código no escrito |
| 2 | **Acceso de emergencia del administrador** — la matriz lo cita, el ticket no lo lista | **Confirmado fuera de T-002.** Cuando entre, entra por **función `security definer`** con justificación y aviso al titular, **jamás por política**: `authenticated` tiene `insert` sobre `accesos_historia`, así que una política del tipo «lee si hay emergencia vigente» sería auto-servicio de privilegios — cualquiera se escribiría su propia fila |
| 3 | El relleno de `centro_id`: `state.md` proponía leer el nulo como «toda la organización» | **Fallo cerrado**, enmendando lo acordado. La organización **puede ser multicentro**, y ahí un paciente sin centro se filtraría a **todos** los técnicos, que es justo el rol que esa columna gobierna. La política del técnico es una igualdad simple; con `centro_id` nulo da `null`, o sea, no visible |

### 1 · Hechos verificados contra la base (no supuestos)

| Hecho | Comprobación |
|---|---|
| 25 tablas en `public`, **todas** con `relrowsecurity = t` y `relforcerowsecurity = f`, propietario `postgres` | `pg_class` |
| Solo existen las 4 políticas de T-000 | `pg_policies` |
| `postgres` **no es superusuario** pero es propietario de todo `public` y no hay `FORCE` → **una función `security definer` suya salta la RLS**. Es la base de todo el diseño | `pg_user.usesuper = f` |
| `auth.users` es de `supabase_auth_admin`, pero `postgres` tiene `TRIGGER` y `SELECT`: `create trigger ... on auth.users` **funciona** | probado y revertido en transacción |
| **No existe tabla `notificaciones`** (T-001 no la creó) | inventario de tablas |
| `supabase/seed.sql` inserta `auth.users` con `raw_user_meta_data = '{}'` y **después** el perfil a mano | fichero |
| Ningún código de aplicación consulta `perfiles` | grep en `app/` y `lib/` |

**Corrección de una imprecisión del ticket**: `historia_desbloqueada()` **no invoca `crypt`**; solo lee `desbloqueos_historia`. La regla «`extensions.crypt`, no `crypt`» del ADR-026 aplica a las funciones de PIN, y ahí se cumple.

### 2 · Ficheros

| Fichero | Qué |
|---|---|
| `supabase/migrations/<ts>_rls_funciones_y_politicas.sql` | **Nuevo.** Todo el ticket |
| `supabase/seed.sql` | **Modificar**: metadatos de rol en `auth.users` + `on conflict (id) do update` en `perfiles` |
| `scripts/t002-rls.sql` | **Nuevo.** Mismo formato que `scripts/t001-esquema.sql` |
| `lib/supabase/tipos-bd.ts` | **Regenerar** con `npm run tipos` |
| `docs/state.md` | **Actualizar** al cerrar |
| `docs/architecture.md` §RLS | **Añadir** `centro_actual()` y las dos vistas derivadas |

**No se toca ninguna migración existente.** Lo que T-000 dejó mal se corrige con `drop policy` + `create policy` y `create or replace function` en la migración nueva.

### 3 · Convenciones de escritura (obligatorias, no estilo)

1. **`(select auth.uid())` siempre entre paréntesis**, y también las funciones **sin argumento**: `(select public.rol_actual())`, `(select public.historia_desbloqueada())` → InitPlan, una vez por sentencia.
2. **Las funciones CON argumento de columna van SIN el envoltorio**: `public.es_profesional_asignado(paciente_id)`. Envolverla no la cachea —depende de la fila— y solo añade un SubPlan. **Es el error fácil de cometer copiando el patrón.**
3. Enum siempre casteado: `= 'administrador'::public.rol_usuario`.
4. Todas las políticas `to authenticated`. Ninguna a `public`, `anon` ni `service_role`.
5. `comment on policy` cuando la expresión no se lea como frase.
6. Nombres `<tabla>_<operacion>[_<matiz>]`, en castellano.

Abreviaturas de este diseño (se escriben expandidas en el SQL):

```
U       := (select auth.uid())
ROL     := (select public.rol_actual())
ADMIN   := ROL = 'administrador'::public.rol_usuario
PRO     := ROL = 'profesional_sanitario'::public.rol_usuario
TECNICO := ROL = 'tecnico_administrativo'::public.rol_usuario
ACTIVO  := ROL is not null          -- perfil existente Y activo (§4.1)
CANDADO := (select public.historia_desbloqueada())
ASIG(x) := public.es_profesional_asignado(x)
EPI(x)  := public.es_profesional_del_episodio(x)
```

### 4 · Funciones auxiliares

Todas: `set search_path = ''`, nombres cualificados, `revoke execute from public`, `grant execute to authenticated` salvo donde se diga.

#### 4.1 · `rol_actual()` — se enmienda, no se reescribe

Único cambio: **`and estado = 'activo'`**. Firma, volatilidad y grants intactos (`create or replace` los conserva).

**Por qué**: ADR-032, «el acceso se corta entero». Es el **único punto** donde se puede hacer cumplir para `administrador` y `tecnico_administrativo`; `es_profesional_asignado()` solo cubre al profesional. A partir de aquí `ROL is not null` significa «tengo perfil y estoy activo», y **todas las políticas heredan el corte gratis**.

*Descartado*: una función aparte `perfil_activo()` compuesta en cada política — dos lecturas de `perfiles` por sentencia y, sobre todo, **una política que olvide llamarla es un agujero silencioso**.

**Efecto que se acepta a sabiendas**: un perfil suspendido o de baja deja de ver todo, incluida la pantalla de T-000.

#### 4.2 · Las demás

| Función | Volatilidad / seguridad | Qué hace y por qué |
|---|---|---|
| `centro_actual() → uuid` | `stable definer` | Centro del perfil activo. **Definer** para no depender de la política de `perfiles`. Nulo para admin y profesional, y es correcto: solo la usa la política del técnico, que por `check` de T-001 siempre tiene centro |
| `es_profesional_asignado(paciente) → boolean` | `stable definer` | Resuelve el vínculo de fusión con **un solo salto** (`s.fusionado_en` es siempre nulo por el disparador de T-001) y exige `estado = 'activo'`. **Definer es obligatorio**: como *invoker* consultaría `pacientes` bajo RLS y entraría en recursión infinita. **Rol-agnóstica a propósito**: si un administrador figura como `profesional_id`, ese paciente es suyo, y así las políticas clínicas no necesitan `rol_actual()` en absoluto |
| `es_profesional_del_episodio(episodio) → boolean` | `stable definer` | El ADR-030, «por participación y no por copia». **Incluye a los participantes dados de baja**: quien participó cuando se escribió la nota conjunta sigue siendo parte de ese acto asistencial, y una baja posterior no puede volver ilegible una nota firmada |
| `historia_desbloqueada() → boolean` | `stable definer` | Desbloqueo vigente y no revocado. Definer porque §6 le quita el `select` a `authenticated` sobre la tabla. **No invoca `crypt`** |
| `desbloqueo_vigente() → timestamptz` | `stable definer` | `max(caduca_en)` de los vigentes. Sustituye al `grant select` que se retira: la interfaz necesita el reloj, no la tabla |
| `desbloqueo_propio_vigente(id) → boolean` | `stable definer` | La usa el `with check` de `accesos_historia` |

#### 4.3 · Funciones del candado (volátiles, definer, `grant to authenticated`)

Ninguna se invoca desde una política; las llama T-006.

**`fijar_pin_historia(p_pin text)`** — valida `^[0-9]{6}$`, `upsert` con `extensions.crypt(p_pin, extensions.gen_salt('bf', 12))`. Siempre `perfil_id = (select auth.uid())`: **sin parámetro de perfil ajeno**, que es la forma de garantizar que un administrador no pueda establecer un PIN (ADR-026).

**`desbloquear_historia(p_pin text)`** → devuelve `(desbloqueado, motivo, caduca_en, bloqueado_hasta)`. Orden exacto:

1. `select ... for update` sobre `pines_historia` — serializa los intentos concurrentes.
2. Si `bloqueado_hasta > now()` → `(false, 'bloqueado', …)` **sin comprobar el PIN**. Esto es lo que hace fallar el sexto intento con el PIN correcto.
3. Compara con `extensions.crypt`. **`p_pin` es parámetro ligado; no hay `execute` en la función, y eso es parte del diseño.**
4. Fallo: incrementa; a los 5, `bloqueado_hasta = now() + 15 min`; escribe en `auditoria`.
5. Acierto: resetea, revoca los vigentes e inserta uno nuevo con la ventana de `organizacion.minutos_desbloqueo_historia` (`coalesce(…, 15)`).

> **Por qué devuelve una fila y no lanza excepción al fallar — es la pieza crítica**: un `raise` aborta la transacción y **deshace el incremento del contador y la entrada de auditoría**. El bloqueo por intentos, que según el ADR-026 es «lo que hace seguro esto», dejaría de existir. Solo se lanza excepción en errores de forma, donde no hay estado que preservar.

**`bloquear_historia() → integer`** — el botón «bloquear». **`prolongar_desbloqueo() → timestamptz`** — solo prolonga uno **ya vigente**; jamás resucita uno caducado, o la ventana sería infinita. Su comentario recuerda que se llama **desde Server Actions, jamás desde el renderizado**.

**Fuera de alcance explícito**: el bloqueo administrativo del PIN de otro es T-006.

#### 4.4 · La entrada en `auditoria` del bloqueo de PIN

`auditoria.operacion` tiene `check in ('INSERT','UPDATE','DELETE')` y `registro_id text not null`. Se escribe así o viola la restricción: `tabla = 'pines_historia'`, `operacion = 'UPDATE'`, `registro_id = perfil_id::text`, y el evento en `estado_posterior` como `jsonb`. **Nunca el hash ni el PIN en el jsonb.**

**Desviación registrada, no bloqueo**: el ADR-026 pide además **notificación al titular**, y `notificaciones` no existe en el esquema. Se escribe la auditoría, se anota la deuda en `state.md`, y el criterio 10 —que solo exige la entrada en `auditoria`— se cumple igual.

#### 4.5 · Alta automática de perfil (deuda de T-000)

Disparador `after insert on auth.users`, función `security definer` (el disparador corre como `supabase_auth_admin`, que no tiene privilegios sobre `public.perfiles`).

**Fallo cerrado**: si `raw_user_meta_data ->> 'rol'` falta o no es del enum → **excepción**, y el alta de `auth.users` falla. Con `enable_signup = true`, un rol por defecto convertiría cualquier registro público en un profesional sanitario con acceso clínico. **Un usuario que no se puede crear es infinitamente mejor que un usuario que nace con acceso.**

**Hallazgo para `state.md` y T-006**: `enable_signup = true` debería pasar a `false` en el ticket de usuarios. No se toca aquí.

### 5 · Vistas derivadas (lo que un `grant select (columnas)` no puede hacer)

Las dos: `security_invoker = false` **y `security_barrier = true`** —sin la barrera el planificador puede empujar una función barata del usuario por debajo del filtro y filtrar filas por el mensaje de error—, `revoke all from public, anon, service_role`, `grant select to authenticated`.

**`pacientes_indicador_riesgo`** — el deber nº 2 de T-001. Columnas exactamente `(paciente_id, indicador, valorado_en)`: `nivel`, `descripcion` y `plan_seguridad` **no aparecen en el texto de la vista** — no es que se filtren, es que no están (invariante 3 aplicado a una proyección). **Solo sirve al técnico**, deliberadamente: profesional y administrador leen la tabla con su política y su candado, y así el ADR-026 sigue cubriéndola sin excepciones. Una vista que sirviera a los tres sería un segundo camino al riesgo por fuera del candado.

*Descartado*: `grant select (columnas)` —imposible, los tres roles comparten `authenticated`— y columna materializada en `pacientes` —segunda verdad que se desincroniza, el error que T-001 evitó con `estado_nota`.

**`directorio_perfiles`** — porque la regla permanente prohíbe que una política sobre `perfiles` invoque `rol_actual()`, y a la vez `motivo_estado` («causa de la baja de un compañero») no puede salir en un directorio. **`perfiles` conserva una sola política**, la de T-000, y **cero de escritura**: alta, cambio de rol y baja pasan por funciones definer de T-006.

### 6 · Cambios de privilegios (antes de las políticas)

```sql
grant update on table public.pacientes to authenticated;      -- sin esto, «administrador total» es mentira
revoke select on table public.desbloqueos_historia from authenticated;  -- ADR-026
```

`pines_historia` sigue sin un solo privilegio. **Verificación obligatoria**: que tras el `revoke`, un `insert` en `accesos_historia` con `desbloqueo_id` no nulo **siga funcionando** (la FK corre como propietario, que conserva `update`/`delete` sobre esa tabla, que no es de solo adición). Si fallara, la salida es quitar la FK, **no** devolver el `select`.

### 7 · Índices nuevos — deber nº 4 de T-001

Solo los que la RLS de este ticket pone en un `using`: `episodio_participantes (episodio_id)` —el único que había es **parcial** `where baja_en is null`, y la función mira también a los de baja—, `diagnosticos (paciente_id)`, `evaluacion_archivos (evaluacion_id)` y `alertas_documentacion (centro_id)`. No se añaden `informes(autor_id)` ni `notas_clinicas_versiones(autor_id)`: ahí la columna va dentro de un `or`, donde el índice no es utilizable.

### 8 · Relleno de `pacientes.centro_id` — deber nº 3, con la enmienda aprobada

Relleno en la migración: (1) centro del profesional asignado; (2) si solo hay un centro activo, ese. Después, **fallo cerrado**: la política del técnico es `centro_id = (select public.centro_actual())`, que con nulo da `null` y por tanto no visible.

Como el paso 2 asigna centro a todos cuando solo hay uno, **el caso solo puede darse en una instancia multicentro, que es justo donde debe darse**. Coste operativo: un paciente sin centro es invisible para recepción hasta que el administrador se lo asigne — visible y arreglable, el mismo criterio del ADR-032 con los huérfanos.

Y un disparador `before insert` que rellena por defecto (centro del profesional; el único centro activo; o nulo). **Nunca inventa un centro.** *Descartado* hacer la columna `not null`: no hay centro que poner en una instancia recién creada y rompería `crearPaciente` de T-000.

### 9 · Columnas reservadas de `pacientes` (RLS no ve el `OLD`)

Un `with check` no puede decir «no cambies esta columna». Sin esto, la política de `update` del profesional le permitiría **reasignarse pacientes ajenos** o **marcarse pacientes como suyos** (`titularidad`), prohibido por la enmienda del ADR-032.

Disparador `before update` que lanza `42501` si quien escribe no es administrador y cambia `profesional_id`, `titularidad`, `centro_id`, o cualquiera de las columnas de fusión y traspaso. Es disparador y no política **porque la comparación exige `old`**. Deja al profesional editar nombre, apellidos y fecha de nacimiento.

### 10 · Catálogo de políticas

Primero, y **no es limpieza cosmética sino requisito de corrección**:

```sql
drop policy pacientes_lectura_profesional_propio on public.pacientes;
drop policy pacientes_alta_profesional_propio    on public.pacientes;
```

Las permisivas se suman con `OR`: dejar la de T-000 —que no mira `estado` ni resuelve la fusión— haría que **un profesional de baja siguiera viendo a sus pacientes**, y el criterio 7 fallaría con las políticas nuevas perfectamente escritas. Se conservan `perfiles_lectura_propia` y `auditoria_lectura_propia`.

**Organización.** `organizacion`, `centros` y `politicas_retencion`: lectura para todo perfil activo, escritura solo administrador. `preferencias_usuario`: las tres operaciones sobre la fila propia. `perfiles`: ninguna nueva. **`pines_historia` y `desbloqueos_historia`: cero políticas** — con RLS activo y sin grants, deniegan dos veces.

**Paciente identificativo.**

| Tabla | Política | Op. | Expresión |
|---|---|---|---|
| `pacientes` | `_lectura_administrador` | S | `ADMIN` |
| `pacientes` | `_lectura_profesional_asignado` | S | `ASIG(id)` |
| `pacientes` | `_lectura_tecnico_de_su_centro` | S | `TECNICO and centro_id = (select public.centro_actual())` |
| `pacientes` | `_alta_administrador` | I | `ADMIN` |
| `pacientes` | `_alta_profesional` | I | `PRO and profesional_id = U and titularidad = 'organizacion' and fusionado_en is null and traspasado_en is null` |
| `pacientes` | `_modificacion_administrador` | U | `ADMIN` (using y check) |
| `pacientes` | `_modificacion_profesional_asignado` | U | `using (ASIG(id) and fusionado_en is null and traspasado_en is null)` · `with check (ASIG(id))` |
| `pacientes_identificacion` | lectura / alta / modificación | S/I/U | `ADMIN or ASIG(paciente_id)` |
| `representantes_paciente` | lectura / alta / modificación | S/I/U | `ADMIN or ASIG(paciente_id)` |
| `consentimientos` | lectura / alta / modificación | S/I/U | `ADMIN or ASIG(paciente_id)` |
| `consentimiento_firmantes` | lectura / alta / modificación | S/I/U | `exists (… c.id = consentimiento_id and (ADMIN or ASIG(c.paciente_id)))` |

El `fusionado_en is null` del `using` es el «solo lectura» del absorbido (ADR-031); `traspasado_en is null`, el «cerrado a nueva actividad» de la enmienda del ADR-032. El administrador sí puede tocarlos: revocar una vinculación es acto suyo.

**Técnico: ni una política sobre `pacientes_identificacion`** — cero filas por construcción, no por filtro. `representantes_paciente` y `consentimientos` **no llevan candado**: el ADR-026 enumera las ocho tablas que cubre y estas no están.

**Paciente clínico — todas con `CANDADO`.**

| Tabla | Op. | Expresión |
|---|---|---|
| `episodios_asistenciales` | S | `CANDADO and (ASIG(paciente_id) or profesional_id = U or EPI(id))` |
| `episodios_asistenciales` | I | `CANDADO and profesional_id = U and ASIG(paciente_id)` |
| `episodios_asistenciales` | U | `CANDADO and (ASIG(paciente_id) or profesional_id = U)` |
| `episodio_participantes` | S/I/U | `CANDADO and EPI(episodio_id)` |
| `diagnosticos` | S/I/U | `CANDADO and ASIG(paciente_id)` |
| `valoraciones_riesgo` | S | `CANDADO and ASIG(paciente_id)` |
| `valoraciones_riesgo` | I | `CANDADO and ASIG(paciente_id) and valorado_por = U` |
| `notas_clinicas` | S | `CANDADO and (autor_id = U or ASIG(paciente_id) or (episodio_id is not null and EPI(episodio_id) and exists (… v.nota_id = id and v.alcance = 'conjunta')))` |
| `notas_clinicas` | I | `CANDADO and autor_id = U and ASIG(paciente_id)` |
| `notas_clinicas` | U | `CANDADO and autor_id = U` |
| `notas_clinicas_versiones` | S | `CANDADO and exists (… n.id = nota_id and (n.autor_id = U or ASIG(n.paciente_id) or (alcance = 'conjunta' and n.episodio_id is not null and EPI(n.episodio_id))))` |
| `notas_clinicas_versiones` | I | `CANDADO and autor_id = U and exists (… n.id = nota_id and n.autor_id = U)` |
| `evaluaciones` | S/I/U | `CANDADO and ASIG(paciente_id)` |
| `evaluacion_archivos` | S/I | `CANDADO and exists (… e.id = evaluacion_id and ASIG(e.paciente_id))` |
| `informes` | S | `CANDADO and (autor_id = U or ASIG(paciente_id))` |
| `informes` | I | `CANDADO and autor_id = U and ASIG(paciente_id)` |
| `informes` | U | `CANDADO and autor_id = U` |

Cuatro decisiones que hay que entender **antes** de tocar estas líneas:

1. **Ninguna política clínica menciona `rol_actual()`.** El administrador entra por `autor_id = U` o por `ASIG()`, igual que un profesional. Así «el administrador no ve notas ajenas» no depende de que nadie escriba una rama para él: **no hay rama para él**.
2. **La participación llega a `episodios_asistenciales` y a `notas_clinicas`, y NO a `diagnosticos` ni a `valoraciones_riesgo`.** Un diagnóstico y una valoración son **de una persona** —por eso T-001 les puso `paciente_id`—; dejar que el profesional del otro miembro de la pareja los leyera filtraría el dato clínico individual de un tercero por la puerta del episodio.
3. **La rama de participación exige `alcance = 'conjunta'`**, que solo existe en la versión sellada. Consecuencia deliberada: una nota **individual** dentro de un episodio conjunto no se comparte, y un **borrador** conjunto tampoco se ve desde fuera hasta que se firma (ADR-036). **T-003 debe firmar la nota conjunta en su fijación de datos**, o su prueba positiva será verde por el motivo equivocado.
4. **`valoraciones_riesgo` sin política de `update`**: T-001 no concedió `update`, y corregir es añadir otra fila.

**Cumplimiento.**

| Tabla | Op. | Expresión |
|---|---|---|
| `accesos_historia` | S | `perfil_id = U or ADMIN` |
| `accesos_historia` | I | `perfil_id = U and (ADMIN or ASIG(paciente_id)) and (desbloqueo_id is null or public.desbloqueo_propio_vigente(desbloqueo_id))` |
| `accesos_historia_vistas` | S | `exists (… a.id = acceso_id)` |
| `accesos_historia_vistas` | I | `exists (… a.id = acceso_id and a.perfil_id = U)` |
| `alertas_documentacion` | S | `ADMIN or profesional_id = U or ASIG(paciente_id) or (TECNICO and centro_id = (select public.centro_actual()))` |
| `alertas_documentacion` | U | `ADMIN or profesional_id = U or ASIG(paciente_id)` |

**`accesos_historia_vistas_alta` es el deber nº 1 de T-001**, y hace dos cosas: el `exists` recorre `accesos_historia` **bajo su propia RLS** —no es una función definer, a propósito—, así que exige que el acceso exista y sea visible para quien escribe; y el `a.perfil_id = U` lo exige explícitamente, sin dejarlo depender de que la política del padre no cambie mañana.

**`alertas_documentacion` es la única de este bloque sin `CANDADO`** (choque 11): recuentos y estados, no contenido. La lectura de `auditoria` por el administrador **no entra aquí**: es T-004.

**Recuento**: 60 políticas nuevas, 2 borradas, 2 vistas, 12 funciones nuevas, 1 enmendada, 3 disparadores, 4 índices, 2 cambios de privilegio.

### 11 · Orden del fichero (cada bloque depende del anterior)

Cabecera con las reglas → `create or replace` de `rol_actual()` → funciones de política → funciones del candado → funciones de disparador y sus disparadores → **relleno de `centro_id`** (antes de las políticas, para que ninguna prueba manual vea el estado intermedio) → índices → privilegios → `drop policy` → políticas → **vistas al final** (invocan `centro_actual()` y `rol_actual()`) → `comment on policy`.

### 12 · Verificación

Guion `scripts/t002-rls.sql` con **fijación propia**: un administrador, dos profesionales, un técnico con centro, dos centros, un paciente fusionado, un episodio conjunto con dos participantes y su nota **firmada**.

| # | Criterio | Cómo se cierra |
|---|---|---|
| 1 | `db reset`, `lint`, `build` | `db reset` es el que de verdad prueba el disparador de perfil y el seed nuevo |
| 2 | Técnico: cero filas en las 9 tablas clínicas | 9 ceros, **más su gemelo positivo obligatorio**: el mismo bloque como profesional asignado con desbloqueo vigente → 9 recuentos > 0 |
| 3 | Técnico acotado al centro; profesional no | P1 en centro A, P2 en B. Extra: paciente con `centro_id` nulo → invisible al técnico |
| 4 | Administrador: cero notas ajenas **con desbloqueo vigente** | Se desbloquea de verdad antes de contar. Gemelo: su propia nota, sí |
| 5 | Profesional: cero sin desbloqueo, las suyas con él, cero tras `bloquear_historia()` | Los tres estados en una transacción, imprimiendo `historia_desbloqueada()` en cada paso |
| 6 | `alertas_documentacion` sin desbloqueo | Inmediatamente después del `bloquear_historia()` del criterio 5, para que «sin desbloqueo» sea un hecho encadenado |
| 7 | Fusión: un salto | Profesional de B lee A |
| 8 | Profesional en baja: cero | Gemelo positivo con `estado='activo'` en la misma transacción, antes del `update` |
| 9 | Nota conjunta | Control negativo extra: nota **individual** del mismo episodio → el otro profesional obtiene cero |
| 10 | Cinco fallos, auditoría, sexto con PIN correcto | Y control positivo: adelantando `bloqueado_hasta`, el PIN correcto sí abre |
| 11 | `pines_historia` denegada | Con y sin desbloqueo. **Añadido**: lo mismo sobre `desbloqueos_historia` |
| 12 | Sin recursión | `pg_policies` sin menciones prohibidas → 0, y cero políticas en las dos tablas del candado |

**Comprobaciones que el ticket no pide y el diseño exige**: `insert` en `accesos_historia_vistas` con `acceso_id` inexistente falla y con uno propio pasa; `insert` en `accesos_historia` con `desbloqueo_id` ajeno falla; un profesional haciendo `update pacientes set profesional_id = <yo>` falla con `42501`; la vista de riesgo devuelve filas al técnico y **cero** al profesional; y su texto no contiene la columna `nivel`.

### 13 · Riesgos, por probabilidad

1. **Olvidar el `drop policy` de T-000.** Las permisivas se suman: el criterio 7 quedaría en verde falso o en rojo inexplicable. **Es el fallo más probable del ticket entero.**
2. **`permission denied` que parece de políticas y es de `grant`** (falta `grant update on pacientes`). Ante ese síntoma: mirar `\dp`, no la política.
3. **`db reset` roto por el disparador de `auth.users`**: si el disparador crea el perfil primero, choca la clave primaria; si el seed no lleva `rol` en los metadatos, aborta el alta. Ambas se arreglan en `seed.sql` en la misma migración.
4. **La enmienda de `rol_actual()` cambia comportamiento existente**: cualquier perfil no activo pierde acceso a todo. Es lo buscado, pero **hay que verlo en el navegador antes de cerrar**.
5. **La vista de riesgo filtrando de más.** Es definer por necesidad: si se olvida el filtro por rol o la barrera, expone el indicador a todo el mundo. Revisar su texto carácter a carácter.
6. **`(select …)` mal aplicado**: envolver una función con argumento de columna no rompe nada pero delata que no se entendió el patrón; **no** envolver `historia_desbloqueada()` cuesta una evaluación por fila en tablas que crecerán a millones.
7. **Pruebas verdes por el motivo equivocado** — el patrón de error escrito en `state.md` tras T-001. Toda negativa con su gemela positiva **sobre la misma fila**, y ante cada aserción: ¿seguiría verde si quito el arreglo?
8. **`revoke select on desbloqueos_historia` rompiendo la FK de `accesos_historia`.** No debería, pero es la clase de trampa que T-001 pagó dos veces. Prueba explícita.
9. **Coste de la subconsulta de `alcance = 'conjunta'`**: revisar con `explain` sobre la lista de notas de un paciente.
10. **`search_path = ''` y los enums**: todo cualificado dentro de los cuerpos. Un `crypt` sin cualificar muere en ejecución, no al crear la función.

---

# Enmienda del 26-08-2026 · Un profesional puede estar en varios centros

**Estado del ticket: vuelve a `en_curso`.** El ADR-051 cierra que la pertenencia a centro es
una relación con vigencia y no una columna. Entra **antes** de la revisión con Opus: revisar
un juego de políticas que vamos a cambiar es trabajo tirado, y hacerlo ahora es gratis
porque no hay una sola fila real dentro.

## Tareas de la enmienda

- [x] **`perfiles_centros`**: `perfil_id`, `centro_id`, `principal bool`, `desde date`,
      `hasta date`. Índice único parcial de **un solo principal vigente por perfil** y una
      sola fila vigente por par. Auditoría con `fn_auditar()`.
- [x] **`perfiles.centro_id` no se borra**: pasa a ser **espejo del principal**, mantenido
      por disparador desde `perfiles_centros`. Migración hacia delante, no destructiva; el
      `check perfiles_tecnico_exige_centro` y todo lo que ya lee esa columna siguen
      funcionando el primer día.
- [x] **`centros_actuales()` → `setof uuid`**, `stable security definer set search_path = ''`.
      **`centro_actual()` se conserva** devolviendo el principal.
- [x] **Reescribir con `centros_actuales()`** las cuatro cosas que hoy usan
      `centro_actual()`: la rama del técnico en `pacientes_lectura`, la de
      `alertas_documentacion`, la vista `pacientes_indicador_riesgo` y el disparador
      `fn_rellenar_centro_paciente` —que **usa el principal**, porque el centro del paciente
      decide su retención durante veinticinco años (ADR-033)—. Patrón:
      `centro_id in (select public.centros_actuales())`.
- [x] **El técnico administrativo exige al menos una pertenencia vigente**. Sin centro no
      hay recorte, y sin recorte ve la organización entera.
- [x] **Políticas de `perfiles_centros`**: lectura para los tres roles (es directorio);
      escritura **solo administrador**. Un profesional **no se asigna centros a sí mismo**.
- [x] **Cerrar, no borrar**: se pone `hasta`, nunca se hace `delete`.

## Lo que esta enmienda NO cambia, y conviene decirlo alto

**El centro no decide qué pacientes lee un profesional, y nunca lo ha decidido.** El
profesional lee **los suyos** —asignados o dados de alta por él— vía
`es_profesional_asignado()`, que mira `pacientes.profesional_id` y **no consulta el centro**.
`centros_actuales()` **acota al técnico administrativo y a nadie más**.

Por tanto: cerrar la pertenencia de un profesional a un centro **no le quita ni un
paciente**. Lo que le retira el acceso es la baja del perfil (ADR-032) o que el
administrador desasigne. Y ampliarle el alcance tampoco es cosa de centros: es que **el
administrador le asigne el paciente** o lo dé de alta en el episodio (ADR-030). Ese es el
único mecanismo que existe, y debe seguir siéndolo.

## Criterios de aceptación de la enmienda

- [x] **Automático** — un técnico con dos pertenencias vigentes lee pacientes de **los dos**
      centros; al cerrar una con `hasta`, deja de leer los de ese centro **en la misma
      sesión**.
- [x] **Automático** — un profesional con dos pertenencias, o con ninguna, lee **exactamente
      el mismo conjunto** de pacientes: los suyos. Cerrar o abrir pertenencias **no cambia
      ni una fila**. Es la prueba que demuestra que el corte es solo del técnico.
- [x] **Automático** — insertar una segunda fila `principal = true` vigente para el mismo
      perfil **falla** por el índice único parcial.
- [x] **Automático** — `perfiles.centro_id` coincide siempre con el principal vigente
      después de insertar, cambiar de principal y cerrar pertenencias.
- [x] **Automático** — un profesional intentando insertar en `perfiles_centros` obtiene
      violación de política; el administrador, no.
- [x] **Automático** — alta de paciente por un profesional con tres centros: el paciente
      recibe el **principal**, no el primero ni uno al azar.
- [x] **Automático** — `delete` sobre `perfiles_centros` no ocurre en ningún camino de la
      aplicación; el cierre es siempre `hasta`.

## Resultado de la enmienda · 29-08-2026

Entra `supabase/migrations/20260829120000_perfiles_centros_multicentro.sql`: la tabla
`perfiles_centros`, dos índices únicos parciales, el disparador de espejo,
`centros_actuales()` y `centro_principal(uuid)` nuevas, `centro_actual()` reescrita, los
cuatro consumidores reescritos, cuatro políticas y la auditoría. Verificado con
`scripts/t002-enmienda-multicentro.sql` —fijación propia, todo en una transacción con
`rollback`—: **ninguna aserción en falso y cinco errores en la salida, que son las cinco
aserciones negativas buscadas**.

**Dos cosas que la enmienda descubrió y no estaban en el ticket:**

1. **`fn_crear_perfil_de_usuario()` había que enmendarla también.** Escribía
   `perfiles.centro_id` desde `raw_user_meta_data`, y con la enmienda esa columna es el
   **espejo**: cada usuario nuevo nacía con el espejo relleno y la fuente de verdad vacía,
   así que `centros_actuales()` devolvía cero y un técnico recién creado no veía nada. El
   relleno de la migración no lo cubre, porque solo corre una vez. Ahora el alta crea
   también la pertenencia, como principal.

2. **«Vigente» tiene que ser exactamente `hasta is null`.** Un índice único parcial no
   puede usar `current_date` en su predicado —no es inmutable—, así que definir la
   vigencia por rango de fechas dejaba el índice y el tiempo de ejecución diciendo cosas
   distintas, con una ventana en la que caben dos principales. Se cierra igualando las dos
   definiciones y prohibiendo con un `check` que el cierre se feche en el futuro. Efecto
   buscado: cerrar surte efecto **en la misma sesión**, que es lo que pide el criterio 1.

**El técnico sin centro se resuelve solo, y conviene saber por dónde**: cerrar su última
pertenencia pone el espejo a nulo y eso viola `perfiles_tecnico_exige_centro`, así que el
cierre **falla desde dentro del disparador de espejo**. Es la tarea «el técnico exige al
menos una pertenencia vigente», y el mensaje de error nombra la restricción, no el
disparador.

**Queda pendiente**: la revisión con Opus del ticket entero —políticas de T-002 más esta
enmienda— y el punto 3 del guion manual en navegador.

---

# Revisión con Opus · 29-08-2026

Pendiente desde el 22-08. Se revisa el ticket **entero**: las políticas originales y la
enmienda del ADR-051.

**Método**: no se leyeron las 1431 líneas de la migración de corrido. Se interrogó el
catálogo —`pg_policies`, `pg_proc`, `information_schema`— buscando clases de fallo, y cada
sospecha se confirmó o descartó **con una prueba contra la base**, no razonando.

## Lo que se comprobó y está bien

| Comprobación | Resultado |
|---|---|
| Tablas sin RLS activo | **ninguna** |
| Políticas `UPDATE` con `USING` y sin `WITH CHECK` | **ninguna** — es el agujero clásico: dejaría convertir una fila visible en otra que no lo sería |
| Políticas `FOR ALL` | **ninguna**; los cuatro verbos van separados |
| Políticas concedidas a `public` o `anon` | **ninguna**; todas a `authenticated` |
| Funciones `security definer` sin `search_path` | **ninguna** |
| Tablas con RLS y cero políticas | `pines_historia` y `desbloqueos_historia` — **correcto y deliberado**: solo se tocan por funciones `definer` |

**Cuatro disparadores `definer` quedan ejecutables por `PUBLIC`** —`fn_crear_perfil_de_usuario`,
`fn_espejar_centro_principal`, `fn_proteger_columnas_reservadas_paciente`,
`fn_rellenar_centro_paciente`—. **No es un hallazgo**, y se comprobó en vez de suponerlo:
Postgres rechaza la invocación directa de una función de disparador con
*«trigger functions can only be called as triggers»*.

## Hallazgo ALTO · el corte por baja tenía dos puertas abiertas

El ADR-032 dice que cuando un profesional causa baja **el acceso se corta entero**. T-002 lo
cerró en las ocho tablas clínicas y en `alertas_documentacion`, y dejó escrita la regla:
*toda política que conceda por `<columna> = auth.uid()` y no lleve candado necesita su propio
`rol_actual() is not null`*. **La regla no se aplicó a otras dos tablas, y las dos guardan
datos de paciente.**

Reproducido con un profesional puesto en `baja`:

```
--- pacientes visibles estando de baja (debe ser 0) ---
 pacientes_visibles = 0          ← el corte funciona donde se aplicó

--- filas de auditoria visibles estando de baja ---
 filas_auditoria = 1
--- de esas, cuantas llevan el nombre del paciente dentro ---
 con_nombre_de_paciente = 1      ← FUGA

--- su registro de ACCESOS a historia ---
 accesos_visibles = 1 · pacientes_delatados = 1   ← FUGA
```

- **`auditoria_lectura_propia`**: `estado_anterior` y `estado_posterior` traen el nombre del
  paciente de cada fila que ese profesional creó o modificó.
- **`accesos_historia_lectura`**: la rama `perfil_id = auth.uid()` no mira el estado, así que
  delata **a qué historias entró y cuándo**. La política sí menciona `rol_actual()`, pero en
  la **otra** rama — por eso una búsqueda por política, y no por rama, no lo habría visto.

**Y T-004 agrandó la primera puerta sin querer**: al colgar la auditoría de las veinticinco
tablas, lo que antes era el rastro de una tabla pasó a ser el de todas. El hallazgo es
anterior a T-004, pero su alcance lo multiplicó ese ticket.

### Cómo se cierra

`supabase/migrations/20260829180000_revision_corte_por_baja.sql` antepone
`rol_actual() is not null` a las dos políticas. Verificado con
`scripts/t002-revision-corte-por-baja.sql`: **nueve aserciones, todas ciertas, cero errores**,
con su gemela positiva —estando activo lo ve todo— y su control —el administrador sigue
viendo los accesos, así que los ceros no son «nadie ve nada»—.

### Lo que se decidió NO tocar, y por qué

- **`accesos_historia_vistas`**: su lectura exige que la fila padre sea visible, así que
  **hereda** el corte. Comprobado en el guion, no supuesto.
- **`preferencias_usuario`**: guarda idioma y densidad de lista, ni un dato de paciente.
  Cortarla obligaría a que la pantalla de «tu cuenta está suspendida» se dibujara sin las
  preferencias de quien la lee: empeora la experiencia sin cerrar ninguna fuga.
- **`perfiles_lectura_propia`**: una política sobre `perfiles` que invoque `rol_actual()`
  —que lee `perfiles`— es recursión. Es la regla permanente que el propio ticket dejó
  escrita, y el motivo por el que existe la vista `directorio_perfiles`.

## Estado

**T-002 queda revisado.** Sigue pendiente el punto 3 del guion manual en navegador: un perfil
puesto en `suspendido` deja de ver `/pacientes`. Es lo único de este ticket que no se ha
ejecutado nunca contra la aplicación de verdad.
