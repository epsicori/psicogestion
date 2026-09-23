# T-032 · Diseño

> El contrato es `tickets/T-032-alta-de-paciente-completa.md`. Aquí está la forma exacta de
> cada pieza: quien implemente **no debería tener que decidir nada**. Donde el propietario no
> decidió, decidí yo y lo dejo dicho con su motivo en §2.

---

## 0 · Hechos verificados contra el código

Todo lo de esta sección está leído, no recordado. Ruta y línea.

### 0.1 · El esquema que ya existe

| Hecho | Dónde |
|---|---|
| `pacientes_identificacion` con las diez columnas de criptograma, `dni_*` **NOT NULL** y el grupo de domicilio todo-o-nada (`num_nonnulls(...) in (0,4)`) | `supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql:366-386` |
| Índice único sobre `dni_indice` (`nulls distinct`, el de por defecto) | íd. `:388-389` |
| `pacientes.fecha_nacimiento date` **nulable**, añadida por su comentario «la necesita `capacidad_consentimiento()`» | íd. `:320-325` |
| `pacientes` no tiene ni `telefono` ni `sexo`; tiene `titularidad`, `centro_id`, fusión y traspaso | íd. `:320-345` |
| `alcance_representacion` es `('patria_potestad','custodia','solo_contacto')` | íd. `:48-52` |
| `capacidad_consentimiento()` filtra `r.alcance = 'patria_potestad'` y devuelve `'desconocida'` cuando `fecha_nacimiento` es nula | íd. `:1080-1105` (rama nula en `:1084-1087`, filtro en `:1103`) |
| `consentimiento_firmantes.representante_id` referencia a `representantes_paciente (id)` **sin ninguna comprobación de alcance** | íd. `:491-493` |
| `capacidad_consentimiento` está revocada de `public` y concedida a `authenticated` | íd. `:1324`, `:1346` |

**Consecuencia directa**: `solo_contacto` no otorga capacidad de consentimiento —eso está bien
cerrado— pero **sí puede acabar siendo firmante** de un consentimiento. Nada lo impide hoy. El
valor no se usa en ninguna parte (solo el enum, `lib/supabase/tipos-bd.ts` y `ETIQUETA_ALCANCE`
en `app/(app)/pacientes/[id]/panel-datos.tsx:38-42`), así que el agujero es teórico **hasta
este ticket**, que lo estrena.

### 0.2 · La RLS que ya existe

| Hecho | Dónde |
|---|---|
| Tres políticas sobre `pacientes_identificacion` (`lectura`, `alta`, `modificacion`), todas `administrador or es_profesional_asignado(paciente_id)` | `supabase/migrations/20260822160000_rls_funciones_y_politicas.sql:882-901` |
| El comentario que las precede: «Técnico administrativo: **NI UNA política** sobre `pacientes_identificacion`. Cero filas por construcción, no por filtro (matriz de roles: «DNI y domicilio · Sin acceso»)» | íd. `:880-881` |
| `pacientes_alta_profesional` exige `profesional_id = (select auth.uid())`, `titularidad = 'organizacion'`, sin fusión ni traspaso | íd. `:855-863` |
| `pacientes_alta_administrador` solo exige ser administrador | íd. `:851-853` |
| La forma vigente del acotado del técnico es **`centro_id in (select public.centros_actuales())`**, no `centro_actual()`: la redefine el multicentro | `supabase/migrations/20260829120000_perfiles_centros_multicentro.sql:291-297` |
| `centros_actuales()` «acota al técnico administrativo y a nadie más» (ADR-051) | íd. `:208-224` |

### 0.3 · Auditoría

- El recorte por tabla es un `jsonb_build_object` dentro de un `do $$` de
  `supabase/migrations/20260829150000_auditoria_y_solo_adicion.sql:291-365`; para
  `pacientes_identificacion` omite `dni_cifrado, dni_nonce, dni_indice, domicilio_cifrado,
  domicilio_nonce` (`:302-303`).
- **Ese bucle recorre el catálogo una sola vez, el día que se aplicó**: una tabla creada
  después **no** obtiene disparador de auditoría sola. Lo confirma el propio fichero, que
  cuelga a mano los de `desbloqueos_historia` (`:373-383`), y las migraciones posteriores, que
  crean cada `create trigger auditar_…` explícito. El comentario de `:287-290` («este es el
  único sitio donde hay que acordarse») **ya no es cierto** para tablas nuevas; el ticket no lo
  edita (los ficheros de migración no se editan hacia atrás, regla 6 del linter) pero la
  migración nueva lo dice en su comentario.
- `fn_auditar(clave, columnas…)`: primer argumento el nombre de la clave primaria, el resto las
  columnas recortadas (`:358-363`).

### 0.3 bis · Lo que `auditoria` ya sabe hacer (leído el 16-09-2026, para la corrección del ADR-060)

| Hecho | Dónde |
|---|---|
| `auditoria.operacion` admite **ocho** verbos: `INSERT`, `UPDATE`, `DELETE`, `SESION`, `BUSQUEDA`, `PIN_FALLIDO`, `PIN_BLOQUEADO`, `TITULARIDAD`, en un `check` que T-004 **ensanchó hacia delante** (`drop constraint if exists` + `add constraint`, sin tocar una fila) | `supabase/migrations/20260829150000_auditoria_y_solo_adicion.sql:100-109` |
| `registrar_evento_auditable(p_operacion, p_tabla, p_registro_id, p_detalle)` existe, es `security definer` con `set search_path = ''`, **fuerza `actor_id = auth.uid()`**, exige sesión (42501), rechaza `INSERT/UPDATE/DELETE` (22023) y tiene lista blanca de **tres** verbos; `revoke … from public` y `grant execute … to authenticated` | íd. `:125-163` |
| `grant select on table public.auditoria to authenticated`, **sin `insert`**; y la política `auditoria_lectura_propia` deja ver **solo las filas propias** y solo con `rol_actual() is not null` | `20260815192424_base_perfiles_pacientes_auditoria.sql:231` y `20260829180000_revision_corte_por_baja.sql:29-36` |
| Índice `auditoria_actor_id_ocurrido_en_idx (actor_id, ocurrido_en desc)` | `20260815192424_…:65-66` |
| `update` y `delete` sobre `auditoria` están revocados **incluso a `postgres`**, y encima llevan las tres capas de solo adición | `20260815192424_…:279-280`, `20260829150000_…:394` |
| `registrar_acceso_historia()` (T-013a) exige **desbloqueo vigente** y ser administrador o profesional asignado; sin eso, 42501 y no escribe | `20260915120000_registrar_acceso_historia.sql:50-71` |
| El ADR-037 reparte: abrir una historia va a `accesos_historia`; «**las búsquedas van a `auditoria`**», porque son acceso a datos personales que no es abrir una historia | `docs/decisions/ADR-037.md:27-28` |

**Tres consecuencias directas, y son las que fijan el mecanismo del rastro**:

1. **`accesos_historia` no sirve** para esto aunque se quisiera: su escritor exige desbloqueo
   vigente y un rol que el técnico administrativo **no tiene**; registrar allí obligaría a
   inventar un camino paralelo y a contradecir el ADR-037 por escrito.
2. **Una función `security invoker` no puede insertar en `auditoria`**: `authenticated` no tiene
   `insert` ni política de alta. Tiene que pasar por el escritor `definer` que ya existe, y por
   eso la corrección se reduce a **un verbo más** en dos sitios.
3. **Un `select` no dispara nada**: Postgres no tiene `AFTER SELECT`. El rastro solo puede nacer
   de que leer **sea una llamada a una función**.

### 0.4 · El linter de migraciones

`scripts/lint-migraciones.ts:216-257`: lo destructivo que exige anuncio es `drop table`,
`drop column`, `drop type`, `alter column … type` y `alter column … set not null` **sin
default**. **`alter column … drop not null` y `add constraint` no disparan nada**: la migración
de este ticket no necesita ningún `-- destructivo:`. Regla 3 (`:259-286`): toda tabla creada en
el fichero necesita su `enable row level security` **en el mismo fichero**. Regla 4
(`:288-304`): `security definer` sin `set search_path` es hallazgo.

### 0.5 · La aplicación

| Hecho | Dónde |
|---|---|
| `crearPaciente()` inserta **tres columnas** (`nombre`, `apellidos`, `profesional_id` de la sesión), devuelve `fieldErrors` de Zod y mensaje genérico en cualquier error | `app/(app)/pacientes/acciones.ts:17-50` |
| `esquemaNuevoPaciente` tiene **dos campos**, `trim/min 1/max 120`, mensajes por `t(...)` | `app/(app)/pacientes/esquemas.ts:5-16` |
| `Field` es `ComponentProps<'input'> + {etiqueta, errores?}`, ata `label`/`aria-describedby` por `id` y pinta `errores[0]` | `components/ui/field.tsx:5-43` |
| `cargarPaciente()` ya trae `fecha_nacimiento`; `null` significa «no existe **o** RLS no deja verlo» | `app/(app)/pacientes/[id]/datos.ts:34-62` |
| `cargarRepresentantes()` decide **por rol antes de consultar** y devuelve `null` para «este rol no puede leer esto» | íd. `:196-227`, con el porqué en `:98-112` |
| `PanelDatos` pinta el teléfono **del representante** diciendo de quién es, y su cabecera afirma que «no hay hoy camino de descifrado escrito» | `app/(app)/pacientes/[id]/panel-datos.tsx:15-28, 138` |
| La cabecera de la página repite las tres ausencias | `app/(app)/pacientes/[id]/page.tsx:27-37` |
| `PanelDatos` va dentro de un `<Suspense>` | íd. `:119-123` |
| `lib/identidad` exporta `normalizarNif`, `validarNif`, `validarTelefono`, `normalizarTelefono`, `formatearTelefono`, `tipoTelefono` | `lib/identidad/index.ts`, `nif.ts:17-21`, `telefono.ts:21-46` |

### 0.6 · El banco

- `scripts/rls/02-matriz-roles.sql:51-53` — `TEC1 … = 0, 'TEC1 NO debe ver identificación: sin
  acceso, aunque P1 sea de su centro'`. **Esta aserción cambia de signo con el ADR-060.** Es la
  prueba de que el choque es real y no una interpretación.
- `scripts/rls/08-identificacion.sql` — las inserciones del banco **omiten**
  `dni_clave_version` y `dni_indice_clave_version` (dependen de su `default 1`) y pasan siempre
  las cinco columnas del documento. Cualquier cambio que las obligue a cambiar rompe el banco;
  el diseño lo evita a propósito (§2, decisión 6).
- `scripts/rls/11-cobertura.sql` — array `v_declaradas` de nombres de política, con fallo por
  ambos lados (política sin declarar y declarada sin política).
- **No existe** ninguna aserción de banco que compruebe que toda tabla tiene disparador de
  auditoría o RLS activada: si la tabla nueva se olvida, lo dice el linter (regla 3) y nadie
  más. Por eso el criterio de cobertura del contrato es explícito.

### 0.7 · Lo que **no** he podido verificar y por eso es la tarea 0 del contrato

1. Que `postgres` lea `vault.decrypted_secrets` en el Supabase local de este repo (`[db.vault]`
   está comentado en `supabase/config.toml`).
2. Cómo devuelve `supabase-js` un `bytea` (se espera `\x…`).
3. Si el login por API basta para ejercer `alta_paciente` desde un guion `tsx`.

Ninguna de las tres cambia el diseño de las políticas; las tres cambian el **código** que las
usa. Por eso son verificación empírica y no supuesto.

---

## 1 · Piezas y contratos

### 1.1 · Los tres ADR

**`docs/decisions/ADR-060.md` — El técnico administrativo lee DNI y domicilio de sus centros,
y cada lectura deja rastro.**

- *Contexto*: la matriz de `docs/architecture.md` §Roles dice «Sin acceso» y la migración de
  T-002 lo escribió como comentario. El propietario decide que es lectura de gestión (cita
  previa, facturación, verificación de identidad en recepción) y que no lleva «fricción extra».
  **Al aprobar la enmienda, el 16-09-2026, corrige una sola cosa**: sin fricción **no es sin
  registro**. «¿Quién ha visto mi DNI?» tiene que poder responderse, y el PIN sigue descartado
  con las palabras de la decisión 3.
- *Decisión*: se añade **una sola política de `select`** sobre `pacientes_identificacion` para
  el rol técnico, acotada por `centros_actuales()`. **No** se le da `insert` ni `update`. Y el
  camino de lectura de la aplicación deja de ser un `select` a la tabla: pasa a ser
  **`public.leer_identificacion(p_paciente_id)`**, `security invoker`, que devuelve el
  criptograma **y escribe el rastro en la misma transacción**. El rastro va a **`auditoria`**,
  con el verbo nuevo **`LECTURA_IDENTIFICACION`**, y se escribe **para los tres roles**, no
  solo para el técnico: un registro al que le falte justamente el rol que sí puede mirar no
  responde nada.
- *Por qué el rastro va a `auditoria`*: el ADR-037 ya partió el mundo en dos —abrir una
  historia va a `accesos_historia`; «**las búsquedas van a `auditoria`**», porque son acceso a
  datos personales que no es abrir una historia—. Leer un DNI para llamar por teléfono o para
  emitir una factura cae del segundo lado sin discusión. Y `auditoria` ya trae hecho todo lo
  que haría falta inventar: es de solo adición con sus tres capas, tiene su escritor
  `security definer` (`registrar_evento_auditable`, T-004), su lectura propia y su índice por
  actor y fecha. No hace falta tabla nueva, y **disparador no puede haberlo**: en Postgres no
  existe `AFTER SELECT`.
- *Consecuencias, escritas para que nadie las descubra después*: (a) el invariante 3 sigue en
  pie —la tabla sigue separada y el candado del ADR-026 no la cubre porque nunca la cubrió—;
  (b) el rastro es del **acceso al criptograma**, no del descifrado: descifrar ocurre en Node y
  la base no lo ve. Como la clave vive en el Vault y solo la alcanza `service_role` desde el
  servidor, quien obtiene el criptograma por otra puerta no puede leerlo, y quien puede leerlo
  pasa por aquí; (c) **una fila por actor, paciente y ventana de quince minutos**, no una por
  render: es la misma unidad que el ADR-037 eligió para la historia, y sin ella cada recarga de
  la ficha escribiría una fila y el registro sería ilegible —el fallo exacto que el ADR-037
  nombra—. Dentro de la ventana, dos miradas no se distinguen; (d) el ámbito es el centro, no
  el paciente: un técnico ve el DNI de pacientes que no atiende nadie de su lista, exactamente
  como ya ve su ficha; (e) un `select` directo a `pacientes_identificacion` por PostgREST
  **sigue siendo posible** para quien tenga sesión y política, y ese no deja rastro: devuelve
  criptograma, que sin clave no es nada. Se dice aquí en vez de esconderlo.
- *Alternativas descartadas*: **una fila en `accesos_historia`** (es el registro clínico del
  art. 18; mezclarle un hecho de gestión lo ensucia, contradice el ADR-037 y además exigiría
  desbloqueo vigente para una lectura que no es clínica); **una tabla nueva
  `accesos_identificacion`** (una cuarta tabla de solo adición con sus tres capas, su guarda de
  TRUNCATE y su pantalla, para un hecho que `auditoria` ya sabe guardar); **un disparador** (no
  hay `AFTER SELECT`); **revocar el `select` y dejar solo una función `definer`** (daría un
  rastro infalsificable, pero convertiría las tres políticas de lectura en código muerto y
  obligaría a reescribir en plpgsql la autorización que hoy dicen las políticas: dos fuentes de
  verdad sobre quién ve un DNI); **pedir un clic** («ver DNI») antes de descifrar (es fricción,
  y la decisión 3 la descarta); una vista sin domicilio (el propietario pide los dos); PIN
  (decisión 3 dice lo contrario con esas palabras).
- *Enmienda*: `docs/architecture.md` §Roles, celda «DNI y domicilio · Técnico administrativo»,
  que pasa a «Los de sus centros, lectura registrada en `auditoria`»; y §Registro de accesos,
  que gana la línea del verbo nuevo y de por qué no vive en `accesos_historia`.

**`docs/decisions/ADR-061.md` — Alergias y medicación: tabla propia, en claro, fuera del
candado, sin el técnico.**

- *Decisión*: tabla `public.pacientes_salud_basica` (una fila por paciente), texto libre, **sin
  cifrar**, **fuera** de las ocho tablas del candado del ADR-026, visible para administrador y
  profesional asignado, **cero políticas** para el técnico administrativo.
- *El «cero políticas para el técnico» es condición de la aprobación* (propietario,
  16-09-2026), no una preferencia del diseño: ni de lectura ni de escritura, ni ahora ni por
  descuido de una política futura que se escriba sin `rol_actual()`. Dos aserciones del banco
  lo sostienen, con TEC1 **y** con TEC2, y las gemelas de ADM y PRO1 impiden que el cero sea
  cero por el motivo equivocado. La consecuencia se acepta a sabiendas: **en recepción nadie
  ve una alergia**; quien la necesita deprisa es el profesional, que la tiene sin PIN.
- *Por qué no cifrada*: el cuerpo de la nota clínica se guarda en claro y lo protege la RLS.
  Cifrar la medicación y dejar la nota en claro no sube el listón: lo baja, porque da una
  sensación de protección que el resto del esquema no sostiene. El cifrado del ADR-029 está
  justificado para **identificadores**, que son la llave para cruzar bases de datos ajenas; una
  frase clínica no lo es.
- *Por qué fuera del candado*: una alergia detrás de un PIN es el «contador tapado» que el
  propio ADR-026 nombra como antipatrón. Es dato que puede hacer falta **deprisa**.
- *Por qué tabla propia y no dos columnas en `pacientes`*: `pacientes` la lee el técnico
  administrativo entera (`pacientes_lectura_tecnico_de_su_centro`), y `grant select (columnas)`
  **no acota por rol** —los tres roles comparten `authenticated`, está en las reglas de
  `supabase.md`—. Dos columnas de salud en `pacientes` serían legibles por el técnico y **no
  habría forma de impedirlo** salvo partiendo la tabla en una vista. La tabla aparte es el
  mismo movimiento del invariante 3, por el mismo motivo.
- *Consecuencia aceptada*: es mutable y se sobrescribe; no hay historial. Versionar es otro ADR.

**`docs/decisions/ADR-062.md` — Un solo campo de sexo, administrativo.**

- *Decisión*: `pacientes.sexo` con enum `public.sexo_administrativo ('hombre','mujer','otro')`,
  los tres valores del RD 1093/2010, **opcional**.
- *Por qué no el par de FHIR R5* (`administrativeGender` + identidad de género): dos campos sin
  ninguna pantalla que sepa qué hacer con el segundo son dos campos que se rellenan al azar. El
  día que haya un informe que distinga, será otro ADR y otra columna; hoy no lo hay.
- *Lo que queda prohibido*: usar `sexo` como si fuera identidad de género, y colgar de él
  ninguna lógica clínica.

Las tres filas van a `docs/decisions.md`. **Ningún ADR anterior se edita** (regla de memoria).

### 1.2 · La migración

Un fichero, `supabase/migrations/<sello>_alta_de_paciente_completa.sql`, con sello mayor que
`20260915120000` **y que el de T-012a en el momento de integrar**. Ocho secciones, en este
orden (el orden importa: los tipos antes que las columnas, las tablas antes que sus políticas,
las funciones antes que sus disparadores).

**§1 · Teléfono y sexo en `pacientes`.**

```sql
create type public.sexo_administrativo as enum ('hombre', 'mujer', 'otro');

alter table public.pacientes
  add column telefono text,
  add column sexo public.sexo_administrativo,
  add constraint pacientes_telefono_e164
    check (telefono is null or telefono ~ '^\+[1-9][0-9]{6,14}$');
```

- La forma es **E.164** y la restricción es **genérica**, no española: `lib/identidad` ya sabe
  que un móvil español empieza por 6 o 7, y repetir esa regla en la base la congela el día que
  haya un paciente extranjero. La base comprueba la **forma**; el país lo comprueba Zod.
- **Sin índice y sin unicidad**: dos hermanos comparten teléfono, y un índice invitaría a buscar
  pacientes por teléfono sin pasar por ninguna política pensada para eso.
- `comment on column public.pacientes.telefono`: normalizado a E.164 porque `wa.me` no admite
  espacios (ADR-023); se pinta con `formatearTelefono()`.
- `comment on column public.pacientes.sexo`: RD 1093/2010, ADR-062, **no es identidad de género**.

**§2 · La fecha de nacimiento, dicha.**

```sql
comment on column public.pacientes.fecha_nacimiento is
  'Obligatoria en el alta desde T-032 (Ley 41/2002 · RD 1093/2010) y sostiene '
  'capacidad_consentimiento() (ADR-028). NULABLE EN LA TABLA a propósito: hay filas '
  'anteriores a T-032 sin ella y la rama «desconocida» debe seguir existiendo. Ponerla '
  'not null es otra migración, el día que no queden nulos.';
```

No se añade `check` de cordura sobre la fecha: **`current_date` no es inmutable y Postgres no la
admite en un `check`**. El «no futura» vive en Zod y en `alta_paciente()`; el suelo duro vive en
§3.

**§3 · `pacientes_identificacion` admite domicilio sin documento.**

```sql
alter table public.pacientes_identificacion
  alter column tipo_documento drop not null,
  alter column dni_cifrado    drop not null,
  alter column dni_nonce      drop not null,
  alter column dni_etiqueta   drop not null,
  alter column dni_indice     drop not null;

alter table public.pacientes_identificacion
  add constraint pacientes_identificacion_documento_todo_o_nada
    check (num_nonnulls(tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice)
           in (0, 5)),
  add constraint pacientes_identificacion_fila_no_vacia
    check (num_nonnulls(dni_cifrado, domicilio_cifrado) >= 1),
  add constraint pacientes_identificacion_domicilio_acotado
    check (domicilio_cifrado is null or octet_length(domicilio_cifrado) <= 2048);
```

- Los `check (octet_length(...) = 12|16)` que ya existen **no estorban**: un `check` con NULL da
  NULL y NULL **pasa**. No se tocan.
- `dni_clave_version` y `dni_indice_clave_version` se quedan **`not null default 1`** y **fuera**
  del grupo: si entraran, su propio `default` llenaría la fila de domicilio-solo y la haría
  violar el todo-o-nada. Además, tocarlas obligaría a reescribir las inserciones de
  `scripts/rls/01-fijacion.sql` y `08-identificacion.sql`, que las omiten (§0.6). Queda un 1
  sin significado en las filas sin documento: ruido inocuo, dicho en el comentario.
- El índice único sobre `dni_indice` sigue igual y **los nulos no chocan entre sí** (`nulls
  distinct` por defecto): N filas de solo domicilio conviven. Eso hay que decirlo en el
  comentario, porque es justo lo que un revisor teme.
- El tope de 2048 bytes de criptograma es la única longitud que la base puede comprobar de un
  domicilio cifrado —AES-GCM no cambia el tamaño—, y cierra la puerta a que una llamada directa
  a PostgREST meta un megabyte en la columna.

**§4 · `pacientes_salud_basica`.**

```sql
create table public.pacientes_salud_basica (
  paciente_id uuid primary key references public.pacientes (id),
  alergias text
    check (alergias is null or (length(trim(alergias)) > 0 and length(alergias) <= 2000)),
  medicacion_actual text
    check (medicacion_actual is null
           or (length(trim(medicacion_actual)) > 0 and length(medicacion_actual) <= 2000)),
  constraint pacientes_salud_basica_fila_no_vacia
    check (num_nonnulls(alergias, medicacion_actual) >= 1),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid not null references public.perfiles (id)
);

alter table public.pacientes_salud_basica enable row level security;
```

- Sin `on delete cascade`: aquí no se borra nada, como en el resto del esquema.
- **Sin fila vacía**: una fila con los dos campos nulos no significa «sin alergias», significa
  «nadie ha preguntado». Distinguirlas importa clínicamente y el esquema no debe permitir
  confundirlas: si no hay dato, no hay fila.
- Privilegios, con el patrón exacto de la agenda
  (`supabase/migrations/20260906120000_agenda_esquema.sql:846-858`):

```sql
revoke all on table public.pacientes_salud_basica from public, anon, authenticated, service_role;
grant select, insert, update on table public.pacientes_salud_basica to authenticated;
```

  **Cero `delete`. Cero `anon`. Cero `service_role`.**
- Tres políticas, la misma condición que ya rige `representantes_paciente` y
  `pacientes_identificacion` (y **ninguna** para el técnico):

```sql
create policy pacientes_salud_basica_lectura on public.pacientes_salud_basica
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );
-- …_alta (for insert, with check idéntico) y …_modificacion (for update, using + with check).
```

- Auditoría **explícita**, porque el bucle de 2026-08-29 no vuelve a correr (§0.3), con las dos
  columnas de contenido recortadas:

```sql
create trigger auditar_pacientes_salud_basica
  after insert or update or delete on public.pacientes_salud_basica
  for each row execute function public.fn_auditar('paciente_id', 'alergias', 'medicacion_actual');
```

  Se audita **que** alguien tocó la alergia y cuándo, no **qué** dice. Mismo criterio que
  `notas_clinicas.borrador_contenido`.

**§5 · La puerta al Vault.**

```sql
create function public.clave_de_cifrado(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text;
begin
  -- Lista blanca de DOS nombres. Sin ella, esta función es «dame cualquier secreto».
  if p_nombre not in ('identificacion_cifrado_v1', 'identificacion_indice_v1') then
    raise exception 'Secreto no permitido: %', p_nombre using errcode = '42501';
  end if;

  select s.decrypted_secret into v_clave
  from vault.decrypted_secrets s
  where s.name = p_nombre;

  if v_clave is null then
    raise exception 'Falta el secreto % en el Vault. Créalo con vault.create_secret(...).',
      p_nombre using errcode = 'P0002';
  end if;

  return v_clave;
end;
$$;

revoke execute on function public.clave_de_cifrado(text) from public, anon, authenticated;
grant  execute on function public.clave_de_cifrado(text) to service_role;
```

- Devuelve **base64 de 32 bytes** (44 caracteres). El decodificado ocurre en Node, no en SQL:
  la clave nunca es un `bytea` que pueda acabar en un log de sentencias.
- `authenticated` **no** la ejecuta: si la ejecutara, la clave viajaría al navegador con la
  sesión de cualquier usuario y todo el ADR-029 sería decorado.
- La lista blanca es literal y no parametrizable a propósito: la versión de clave se añade a
  mano el día de la rotación, que es cuando alguien tiene que mirar esto de todas formas.

**§6 · El alta en una sola transacción.**

```sql
create function public.alta_paciente(
  p_nombre                text,
  p_apellidos             text,
  p_fecha_nacimiento      date,
  p_sexo                  public.sexo_administrativo default null,
  p_telefono              text default null,
  p_tipo_documento        text default null,
  p_dni_cifrado           text default null,   -- base64
  p_dni_nonce             text default null,   -- base64
  p_dni_etiqueta          text default null,   -- base64
  p_dni_indice            text default null,   -- base64
  p_domicilio_cifrado     text default null,   -- base64
  p_domicilio_nonce       text default null,   -- base64
  p_domicilio_etiqueta    text default null,   -- base64
  p_clave_version         smallint default 1,
  p_indice_clave_version  smallint default 1,
  p_alergias              text default null,
  p_medicacion_actual     text default null
)
returns uuid
language plpgsql
security invoker          -- NO definer: las políticas de las tres tablas deben morder
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_fecha_nacimiento is null then
    raise exception 'La fecha de nacimiento es obligatoria en el alta (T-032).'
      using errcode = '23514';
  end if;
  if p_fecha_nacimiento > current_date or p_fecha_nacimiento < date '1900-01-01' then
    raise exception 'Fecha de nacimiento fuera de rango.' using errcode = '23514';
  end if;

  insert into public.pacientes (nombre, apellidos, fecha_nacimiento, sexo, telefono, profesional_id)
  values (p_nombre, p_apellidos, p_fecha_nacimiento, p_sexo, p_telefono, (select auth.uid()))
  returning id into v_id;

  if p_dni_cifrado is not null or p_domicilio_cifrado is not null then
    insert into public.pacientes_identificacion (
      paciente_id, tipo_documento,
      dni_cifrado, dni_nonce, dni_etiqueta, dni_indice,
      dni_clave_version, dni_indice_clave_version,
      domicilio_cifrado, domicilio_nonce, domicilio_etiqueta, domicilio_clave_version)
    values (
      v_id, p_tipo_documento,
      decode(p_dni_cifrado, 'base64'), decode(p_dni_nonce, 'base64'),
      decode(p_dni_etiqueta, 'base64'), decode(p_dni_indice, 'base64'),
      p_clave_version, p_indice_clave_version,
      decode(p_domicilio_cifrado, 'base64'), decode(p_domicilio_nonce, 'base64'),
      decode(p_domicilio_etiqueta, 'base64'),
      case when p_domicilio_cifrado is null then null else p_clave_version end);
  end if;

  if p_alergias is not null or p_medicacion_actual is not null then
    insert into public.pacientes_salud_basica
      (paciente_id, alergias, medicacion_actual, actualizado_por)
    values (v_id, p_alergias, p_medicacion_actual, (select auth.uid()));
  end if;

  return v_id;
end;
$$;

revoke execute on function public.alta_paciente(...) from public;
grant  execute on function public.alta_paciente(...) to authenticated;
```

- `decode(null,'base64')` es NULL, así que las ramas no necesitan `case` salvo la de
  `domicilio_clave_version`, que sí lo lleva porque es la única con valor propio.
- **`profesional_id` sale de `auth.uid()` dentro de la función**, no de un parámetro: así no
  existe siquiera la forma de pedir el alta a nombre de otro. Es la misma conducta de hoy
  (`acciones.ts:36`), movida a un sitio donde no se puede saltar.
- `security invoker`: `pacientes_alta_profesional` (`profesional_id = auth.uid()`,
  `titularidad = 'organizacion'`) y `pacientes_identificacion_alta`
  (`es_profesional_asignado`) siguen mordiendo. La segunda es cierta dentro de la misma
  transacción porque la fila de `pacientes` ya está insertada.
- El comentario de la función dice **por qué existe**: `DELETE` sobre `pacientes` es imposible
  para todos los roles (regla de `supabase.md`, decidida en T-001), así que dos viajes sueltos
  —primero el paciente, después la identificación— dejarían un **paciente fantasma permanente**
  cada vez que el índice único rechazara el DNI. No es una optimización de red: es la única
  forma de que el alta sea atómica.

**§7 · El técnico entra a leer (ADR-060).**

```sql
create policy pacientes_identificacion_lectura_tecnico on public.pacientes_identificacion
  for select to authenticated
  using (
    (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
    and paciente_id in (
      select p.id from public.pacientes p
      where p.centro_id in (select public.centros_actuales())
    )
  );
```

- El acotado va por el `centro_id` **del paciente**, porque la tabla no tiene centro propio. El
  `in (select …)` sobre `public.pacientes` corre **bajo la RLS de `pacientes`** (regla conocida
  de `supabase.md`), lo que aquí **refuerza**: el técnico solo ve las filas de pacientes que ya
  puede ver, y la condición explícita de centro impide que un cambio futuro en la política de
  `pacientes` ensanche esta sin que nadie se entere. **No hay recursión**: `pacientes` no
  consulta `pacientes_identificacion`.
- Solo `select`. El técnico **no** escribe identificación: ADR-060 lo dice y la ausencia de
  política de insert/update lo impone.
- `comment on policy … is` con la referencia al ADR-060, y `comment on policy
  pacientes_identificacion_lectura` reescrito para que la frase «ni una política para el
  técnico» deje de estar en pie en el catálogo.

**§7.1 · El rastro del descifrado (ADR-060, corrección del propietario del 16-09-2026).**

Tres piezas, en este orden, y **ninguna tabla nueva**.

*(a) El verbo.* Se ensancha el `check` hacia delante, sin tocar una sola fila, exactamente como
hizo T-004 al añadir `SESION`, `BUSQUEDA`, `PIN_*` y `TITULARIDAD`
(`20260829150000_auditoria_y_solo_adicion.sql:100-109`):

```sql
alter table public.auditoria drop constraint if exists auditoria_operacion_check;
alter table public.auditoria add constraint auditoria_operacion_check
  check (operacion in (
    'INSERT', 'UPDATE', 'DELETE',
    'SESION',          -- inicio de sesión (T-006)
    'BUSQUEDA',        -- búsqueda que devuelve pacientes (interfaz.md, choque 8)
    'PIN_FALLIDO',     -- intento de PIN incorrecto (ADR-026)
    'PIN_BLOQUEADO',   -- bloqueo por intentos (ADR-026)
    'TITULARIDAD',     -- cambio de titularidad o de asignación (ADR-032)
    'LECTURA_IDENTIFICACION'   -- T-032 · lectura de DNI/domicilio (ADR-060)
  ));
```

- La lista se copia **entera**, con los ocho verbos anteriores: un `check` se sustituye, no se
  amplía. Perder uno por el camino rompería el inicio de sesión sin tocar una línea de sesión.
- **No hace falta `-- destructivo:`**: el linter solo mira `drop table|column|type`,
  `alter column … type` y `set not null` (`scripts/lint-migraciones.ts:216-242`), y su regla 1
  solo mira `update|delete|truncate` como **sentencia** (`:198-214`). `drop constraint` sobre
  una tabla de solo adición no dispara nada, y no modifica ni borra ninguna fila.

*(b) El escritor.* Es la función de T-004
(`20260829150000_auditoria_y_solo_adicion.sql:125-163`) con **una línea distinta**: el verbo
nuevo en la lista blanca. Misma firma, mismo cuerpo, mismos `revoke`/`grant`.

```sql
create or replace function public.registrar_evento_auditable(
  p_operacion text, p_tabla text, p_registro_id text, p_detalle jsonb default null)
returns void language plpgsql security definer set search_path = ''
as $$
-- … cuerpo idéntico al de T-004, con esta única línea cambiada:
--   if p_operacion not in ('SESION', 'BUSQUEDA', 'TITULARIDAD') then
  if p_operacion not in
     ('SESION', 'BUSQUEDA', 'TITULARIDAD', 'LECTURA_IDENTIFICACION') then
-- …
$$;

comment on function public.registrar_evento_auditable(text, text, text, jsonb) is
  'Registra un hecho auditable que no es un cambio de fila: sesión, búsqueda, titularidad y '
  'lectura de identificación (T-032, ADR-060). Fuerza actor_id = auth.uid() y rechaza '
  'INSERT/UPDATE/DELETE.';
```

- Se **copia el cuerpo entero**: un `create or replace` parcial no existe. Los tres verbos
  anteriores siguen en la lista o se rompe lo que ya funciona.
- Se reescribe el `comment on function`, porque el catálogo es lo que lee el siguiente que pase
  por aquí y hoy dice «sesión, búsqueda, titularidad» a secas.
- Queda en pie la trampa conocida de `supabase.md` —para saber qué hace hoy una función hay que
  buscar la **última** redefinición—; la cabecera de esta migración la nombra con el fichero y
  la línea de la anterior, que es lo único que ahorra el siguiente rastreo.

*(c) El único camino de lectura de la aplicación.*

```sql
create function public.leer_identificacion(p_paciente_id uuid)
returns table (
  tipo_documento          text,
  dni_cifrado             bytea,
  dni_nonce               bytea,
  dni_etiqueta            bytea,
  dni_clave_version       smallint,
  domicilio_cifrado       bytea,
  domicilio_nonce         bytea,
  domicilio_etiqueta      bytea,
  domicilio_clave_version smallint
)
language plpgsql
volatile                  -- NO stable: escribe. Y PostgREST manda las volátiles por POST.
security invoker          -- deciden las políticas; aquí no se repite ninguna autorización
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_fila public.pacientes_identificacion%rowtype;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Bajo la RLS del llamante. El alias `i` es obligatorio: los parámetros OUT se llaman igual
  -- que las columnas y sin alias la referencia es ambigua EN EJECUCIÓN (regla de supabase.md).
  select i.* into v_fila
  from public.pacientes_identificacion i
  where i.paciente_id = p_paciente_id;

  -- Sin fila legible no ha habido lectura de nada: ni se devuelve ni se registra. Esto va
  -- ANTES del rastro a propósito; al revés, un barrido de uuids llenaría la auditoría de
  -- accesos que nunca ocurrieron.
  if not found then
    return;
  end if;

  -- Una fila por actor, paciente y ventana de quince minutos (ADR-037: N aperturas dentro de
  -- la ventana son UN acceso). Esta consulta corre bajo `auditoria_lectura_propia`, que solo
  -- deja ver las filas del propio actor: es justo lo que se busca, y si la política ocultara
  -- algo el fallo sería UNA FILA DE MÁS, nunca una de menos.
  if not exists (
    select 1
    from public.auditoria a
    where a.actor_id    = v_uid
      and a.operacion   = 'LECTURA_IDENTIFICACION'
      and a.registro_id = p_paciente_id::text
      and a.ocurrido_en > now() - interval '15 minutes'
  ) then
    perform public.registrar_evento_auditable(
      'LECTURA_IDENTIFICACION',
      'pacientes_identificacion',
      p_paciente_id::text,
      jsonb_build_object(
        'rol',       (select public.rol_actual())::text,
        'documento', v_fila.dni_cifrado is not null,
        'domicilio', v_fila.domicilio_cifrado is not null));
  end if;

  return query select
    v_fila.tipo_documento,    v_fila.dni_cifrado,        v_fila.dni_nonce,
    v_fila.dni_etiqueta,      v_fila.dni_clave_version,  v_fila.domicilio_cifrado,
    v_fila.domicilio_nonce,   v_fila.domicilio_etiqueta, v_fila.domicilio_clave_version;
end;
$$;

revoke execute on function public.leer_identificacion(uuid) from public, anon;
grant  execute on function public.leer_identificacion(uuid) to authenticated;
```

- **El rastro y la lectura son la misma transacción, y el rastro va primero.** Si el `insert` en
  `auditoria` fallara, la función entera se deshace y el criptograma no sale. No hay orden en el
  que se pueda leer sin registrar.
- **`security invoker` y ni una comprobación de rol dentro.** Quién puede leer un DNI lo dicen
  las políticas de `pacientes_identificacion` —las tres de T-002 más la del ADR-060— y nadie
  más. Repetirlo aquí sería la segunda fuente de verdad que el ADR-060 descarta por escrito.
  Por eso tampoco hay `force row level security` que valga: la función no es `definer`.
- **`dni_indice` no se devuelve.** La ficha no lo necesita y es un HMAC con clave que confirma
  una conjetura: la misma razón por la que T-004 lo recortó de `auditoria`
  (`20260829150000_…:34-37`). El buscador por DNI, cuando exista, comparará índices **dentro**
  de la base y no lo necesitará tampoco.
- **El detalle no lleva dato.** Rol y dos booleanos de presencia. Ni nonce, ni etiqueta, ni
  índice, ni una letra del DNI: `auditoria` la lee el propio actor.
- **No hace falta índice nuevo**: la comprobación de la ventana entra por
  `auditoria_actor_id_ocurrido_en_idx (actor_id, ocurrido_en desc)`, que existe desde T-000
  (`20260815192424_…:65-66`).
- `authenticated` puede llamarla con **cualquier** uuid. Sin política que le deje ver la fila,
  la respuesta es cero filas y **cero rastro**; con política, fila y rastro. No hay tercera
  salida.

**§8 · El contacto de emergencia no firma.**

```sql
create function public.fn_firmante_no_es_solo_contacto()
returns trigger
language plpgsql
security definer          -- a propósito: ver §2, decisión 12
set search_path = ''
as $$
begin
  if new.representante_id is not null and exists (
    select 1 from public.representantes_paciente r
    where r.id = new.representante_id
      and r.alcance = 'solo_contacto'::public.alcance_representacion
  ) then
    raise exception
      'Un representante con alcance solo_contacto no puede firmar un consentimiento (ADR-028).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_firmante_no_es_solo_contacto() from public;

create trigger firmante_no_es_solo_contacto
  before insert or update on public.consentimiento_firmantes
  for each row execute function public.fn_firmante_no_es_solo_contacto();
```

`before`, no `after`: se rechaza antes de escribir. El código es **23514** (coherencia) y no
42501, porque no es una cuestión de permiso sino de qué significa la fila.

### 1.3 · Las claves en el Vault

`supabase/seed.sql` (lo aplica `db reset`, `[db.seed] sql_paths = ["./seed.sql"]`) y
`supabase/seed-completo.sql`, **con los mismos valores literales en los dos**:

```sql
-- Claves DE JUGUETE, solo desarrollo. En producción se crean a mano, una vez,
-- con el patrón de scripts/vault-smtp.sql, y NO viven en el repositorio.
select vault.create_secret('<32 bytes en base64>', 'identificacion_cifrado_v1',
  'T-032 · AES-256-GCM de pacientes_identificacion (ADR-029). CLAVE DE JUGUETE.');
select vault.create_secret('<otros 32 bytes en base64>', 'identificacion_indice_v1',
  'T-032 · HMAC-SHA-256 del índice ciego (ADR-029). OTRA clave, a propósito. DE JUGUETE.');
```

Idempotente: `where not exists (select 1 from vault.secrets where name = …)`, porque
`seed-completo.sql` se ejecuta con `npm run seed` sobre una base que ya pasó por `db reset`.
Si los dos guiones sembraran valores distintos, lo cifrado por uno no lo descifraría el otro y
el síntoma sería «etiqueta inválida» en una pantalla, a mil kilómetros de la causa.

**Nunca hay clave por defecto en el código.** Si el secreto falta, se lanza con el nombre del
secreto y la orden que lo crea. Una clave por defecto convierte un despliegue mal configurado en
datos cifrados con una clave pública, y eso no se descubre hasta la auditoría.

### 1.4 · `lib/cifrado/` — territorio nuevo de la fábrica

Vive en `lib/cifrado/` y **no** en `lib/identidad/`, que es carril de Kimi y además es puro: aquí
hay `server-only`, cliente de Supabase y claves.

```
lib/cifrado/
  aes-gcm.ts          ← puro, sin server-only. node:crypto.
  aes-gcm.test.ts
  bytea.ts            ← puro. Traducción de columnas bytea ↔ base64.
  bytea.test.ts
  claves.ts           ← server-only. Vault.
  identificacion.ts   ← server-only. Compone lo anterior con lib/identidad.
  identificacion.test.ts
```

**`aes-gcm.ts`** (sin `server-only`: así lo puede probar Vitest sin montar medio Next):

```ts
export type Sobre = { cifrado: Buffer; nonce: Buffer; etiqueta: Buffer };

export function cifrar(clave: Buffer, texto: string): Sobre;
export function descifrar(clave: Buffer, sobre: Sobre): string;   // LANZA si la etiqueta no cuadra
export function indice(clave: Buffer, texto: string): Buffer;     // HMAC-SHA-256, 32 bytes
```

- `cifrar`: `randomBytes(12)`, `createCipheriv('aes-256-gcm', clave, nonce)`, `getAuthTag()`.
- `descifrar`: `setAuthTag()` antes del `final()`. El `final()` es el que lanza; **no se captura
  aquí**. Quien decide qué pintar es la capa de arriba.
- Las tres comprueban `clave.length === 32` y lanzan con un mensaje propio: una clave corta
  produciría un error de OpenSSL ilegible.
- **Ni una sola traza**: nada de `console.log` con la clave, el texto o el criptograma.

**`bytea.ts`**: `aBase64(Buffer): string` y `desdeBytea(valor: string | null): Buffer | null`,
que acepta la forma confirmada en la tarea 0 (`\xAABB…`) y **lanza con un mensaje propio** si
llega otra cosa. Aquí es donde se paga, en un solo sitio, la incógnita de PostgREST.

**`claves.ts`** (`server-only`):

```ts
export const VERSION_CLAVE = 1;
export async function claveDeCifrado(): Promise<Buffer>;   // identificacion_cifrado_v1
export async function claveDeIndice(): Promise<Buffer>;    // identificacion_indice_v1
```

Usan `crearClienteAdministracion()` de `lib/supabase/administracion.ts` —único consumidor
legítimo de la clave de servicio— para `rpc('clave_de_cifrado', { p_nombre })`, decodifican
base64 y **memorizan por proceso** en un módulo-nivel `Map`. Sin caducidad: el proceso muere
antes. Sin fallback.

**`identificacion.ts`** (`server-only`):

```ts
export type IdentificacionEnClaro = { documento?: string; domicilio?: string };

export type ColumnasIdentificacion = {
  p_tipo_documento: 'dni' | 'nie' | null;
  p_dni_cifrado: string | null; p_dni_nonce: string | null;
  p_dni_etiqueta: string | null; p_dni_indice: string | null;
  p_domicilio_cifrado: string | null; p_domicilio_nonce: string | null;
  p_domicilio_etiqueta: string | null;
  p_clave_version: number; p_indice_clave_version: number;
};

export async function cifrarIdentificacion(datos: IdentificacionEnClaro): Promise<ColumnasIdentificacion>;
export async function descifrarIdentificacion(fila: FilaIdentificacion): Promise<IdentificacionEnClaro>;
```

- El documento se **normaliza con `normalizarNif()` de `lib/identidad` antes de cifrar y antes
  de indexar**, y eso es exactamente lo que el ADR-029 exige. Se cifra **la forma normalizada**:
  si se cifrara lo tecleado y se indexara lo normalizado, dos fichas del mismo DNI enseñarían
  textos distintos con el mismo índice.
- `tipo_documento` se **deriva**: primera letra en `XYZ` → `'nie'`, si no `'dni'`. Nunca se
  pregunta al usuario un dato que se lee del propio documento.
- El domicilio se cifra con **la misma clave AES** que el documento y **no se indexa**: §2,
  decisiones 3 y 4.
- El nombre de las claves del objeto es **el de los parámetros del RPC** a propósito: la Server
  Action hace `{ ...columnas }` y no hay traducción a mano que pueda equivocarse.
- `FilaIdentificacion` es **exactamente lo que devuelve `leer_identificacion()`** (§1.2 §7.1) y
  por tanto **no trae `dni_indice`**: `descifrarIdentificacion` no lo necesita y no debe
  recibirlo. Este módulo **no consulta la tabla**: recibe la fila de quien la pidió por RPC, que
  es el único camino que deja rastro.

**Pruebas (`vitest`, junto al módulo).** Las cinco que el contrato exige, más el redondeo:

| Prueba | Lo que caza |
|---|---|
| ida y vuelta de un texto con acentos y ñ | UTF-8 mal tratado |
| dos cifrados del mismo texto **difieren** | nonce fijo o reutilizado |
| un byte cambiado en `cifrado` **lanza**; otro en `etiqueta` **lanza** | `setAuthTag` olvidado (sin esto, GCM cifra pero no autentica) |
| `12345678z`, `12345678-Z`, ` 12345678 Z ` dan **el mismo** índice | normalización olvidada, que es el fallo que duplica pacientes |
| ese índice **≠** HMAC con la clave de cifrado | usar una sola clave, que es lo que el ADR-029 prohíbe |
| clave de 31 bytes lanza mensaje propio | error ilegible de OpenSSL |

Las claves de las pruebas son literales del propio fichero (`Buffer.alloc(32, 7)`), **no** el
Vault: una prueba unitaria no levanta Postgres.

### 1.5 · Esquemas Zod

`app/(app)/pacientes/esquemas.ts` conserva `nombre` y `apellidos` tal cual y añade:

```ts
const opcional = (e: z.ZodType<string>) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), e.optional());
```

- `fechaNacimiento`: `z.string()` con formato `YYYY-MM-DD` (es lo que da `<input type="date">`),
  **obligatoria**, no futura, no anterior a 1900-01-01, y edad ≤ 120. Se compara con
  `new Date()` **dentro del refinement**, que corre en la acción y en el cliente, nunca en el
  render (regla de Cache Components: `Date.now()` en render dispara `blocking-prerender`).
- `telefono`: opcional, `validarTelefono` de `lib/identidad`, y **se guarda `normalizarTelefono`**
  (`+34600000000`). El `transform` va **después** del refinement, para que el mensaje de error se
  refiera a lo que la persona escribió.
- `sexo`: `z.enum(['hombre','mujer','otro'])` opcional.
- `dni`: opcional, `validarNif`, se guarda **normalizado** (`normalizarNif`).
- `domicilio`: opcional, `trim`, `max(300)`.
- `alergias`, `medicacionActual`: opcionales, `trim`, `max(2000)`.

Los mensajes, en `lib/i18n/es.ts` bajo `pacientes.*`, con `t(...)` como los dos existentes. **No
se toca `lib/identidad/esquemas.ts`** (carril ajeno, y sus mensajes están fijados a mano allí).

### 1.6 · Dos primitivas nuevas

`components/ui/area-texto.tsx` y `components/ui/seleccion.tsx`, calcados del contrato de `Field`
(`components/ui/field.tsx:5-43`) porque es el que `register()` de react-hook-form ya sabe usar:

```ts
type Props = ComponentProps<'textarea'> & { etiqueta: string; errores?: string[] };
type Props = ComponentProps<'select'> & { etiqueta: string; errores?: string[]; opciones: { valor: string; texto: string }[] };
```

- `<select>` **nativo**, no `components/ui/desplegable.tsx`: ese es un listbox propio con API
  `valor`/`alElegir`, incompatible con `register()`, y tres campos opcionales no justifican
  reescribir el formulario alrededor de él. Un `<select>` nativo ya es accesible y funciona en
  móvil mejor que cualquier cosa que escribamos.
- `Seleccion` empieza con una opción vacía (`<option value="">`), que es lo que hace que
  «opcional» sea verdad.
- `Field` **no se toca**: es el fichero más usado del repositorio.
- Una prueba cada una: la etiqueta está asociada al control (`getByLabelText`) y con `errores`
  el control queda `aria-invalid` y `aria-describedby` apuntando al párrafo. No hace falta
  prueba de foco: no hay foco que atrapar.

### 1.7 · Formulario y acción

`formulario-nuevo-paciente.tsx` (sigue `"use client"`, RHF + `zodResolver`):

```
[ Nombre ] [ Apellidos ] [ Fecha de nacimiento ]        (fila visible, sm:flex-row)
▸ Más datos (opcional)                                  (<details>/<summary> nativo)
    [ Teléfono ] [ Sexo ]
    [ DNI o NIE ] [ Domicilio ]
    [ Alergias (área de texto) ]
    [ Medicación actual (área de texto) ]
                                          [ Crear paciente ]
```

- `<details>` **nativo**: sin estado, sin JavaScript de foco, sin trampa de teclado. La lección
  de T-007 es que un desplegable propio cuesta tres vueltas; aquí no aporta nada.
- El `<details>` se abre solo (`open`) si tras enviar hay algún error en un campo de dentro: un
  error invisible es un formulario que no se envía y nadie sabe por qué. Con RHF eso es
  `Object.keys(errors)` cruzado con la lista de campos opcionales.
- Las etiquetas llevan «(opcional)» **en el texto del catálogo**, no como pista aparte: `Field`
  no tiene ranura para pistas y no se va a inventar una aquí.
- `aplicarErroresDelServidor` de `lib/formularios.ts` sigue mapeando por nombre de campo; los
  nombres nuevos deben coincidir con las claves de Zod, **y `dni` es la clave a la que se ata el
  error de duplicado**.

`acciones.ts`:

```ts
const { supabase, usuario } = await exigirSesion();          // 1 · igual que hoy
const r = esquemaNuevoPaciente.safeParse(datos);             // 2 · igual que hoy
const columnas = await cifrarIdentificacion({ documento: r.data.dni, domicilio: r.data.domicilio });
const { error } = await supabase.rpc('alta_paciente', {
  p_nombre: r.data.nombre, p_apellidos: r.data.apellidos,
  p_fecha_nacimiento: r.data.fechaNacimiento, p_sexo: r.data.sexo ?? null,
  p_telefono: r.data.telefono ?? null,
  ...columnas,
  p_alergias: r.data.alergias ?? null, p_medicacion_actual: r.data.medicacionActual ?? null,
});
if (error?.code === '23505') return { ...ESTADO_INICIAL, errores: { dni: [t('pacientes.eseDocumentoYaEstaDadoDeAlta')] } };
if (error) { console.error(...); return { ...ESTADO_INICIAL, mensaje: t('pacientes.noSePudoCrearElPaciente') }; }
revalidatePath('/pacientes');
```

- El **23505** es el único código que se traduce, y se traduce a **error de campo**, no a mensaje
  general: el texto dice lo que manda el ADR-031 —ese documento ya está dado de alta; el
  duplicado **se vincula, no se duplica**— y **no** revela de quién es la ficha existente, que
  sería filtrar un paciente de otro profesional.
- `randomBytes` vive aquí, en una Server Action, y **nunca** en un render: es exactamente el
  caso que dispara `blocking-prerender-random` (regla de `nextjs.md`).
- `usuario.id` deja de usarse para el insert (lo pone la función), pero `exigirSesion()` sigue
  siendo la primera línea: el proxy es guardia optimista.

### 1.8 · La ficha

`[id]/datos.ts`, dos cargadores nuevos, memoizados con `cache()` como los demás, **nunca
`use cache`**:

```ts
export type Legible<T> = { estado: 'ok'; datos: T } | { estado: 'sin-datos' } | { estado: 'no-legible' };

export const cargarIdentificacion = cache(async (id): Promise<Legible<{documento: string|null; domicilio: string|null}> | null>);
export const cargarSaludBasica   = cache(async (id): Promise<{alergias: string|null; medicacionActual: string|null} | null>);
```

- `null` sigue significando **«este rol no puede leer esto»**, con la misma convención y el mismo
  comentario que `cargarRepresentantes` (`datos.ts:98-112`). `cargarSaludBasica` decide **por rol
  antes de consultar** (administrador o profesional sanitario), igual que él.
- `cargarIdentificacion` **no** puede decidir por rol de la misma forma —los tres roles pueden
  leerla ahora, cada uno con su alcance—, así que consulta y distingue: error → `null`; sin fila
  → `sin-datos`; fila que no descifra → **`no-legible`**.
- **Consulta con `supabase.rpc('leer_identificacion', { p_paciente_id: id })` y jamás con un
  `select` a `pacientes_identificacion`** (ADR-060): el `select` directo funcionaría igual de
  bien y **no dejaría rastro**, que es precisamente el fallo silencioso de esta corrección.
  `data` llega como **array** (la función devuelve `table`), así que `data?.[0] ?? sin-datos`.
- El «**nunca `use cache`**» deja de ser preferencia de estilo y pasa a ser **el invariante**:
  una ficha servida de caché sería un DNI mirado sin fila en `auditoria`. `cache()` de React sí,
  porque deduplica dentro de **una** petición, que es exactamente una lectura.
- **Los tres estados son el corazón del diseño de esta pantalla**: si un fallo de descifrado se
  pintara como «sin DNI», la ficha estaría afirmando un hecho falso sobre el expediente, que es
  lo que el choque 5 prohíbe con esas palabras.

`[id]/panel-datos.tsx`:

- Bloque **Identificación**: documento y domicilio. Si `null`, no aparece el bloque (no un bloque
  vacío con rótulo: choque 5). Si `no-legible`, aparece con el aviso de que el dato existe y no
  se puede mostrar.
- El teléfono del paciente entra en el bloque de gestión, pintado con `formatearTelefono()`, y el
  párrafo `t('ficha.sinTelefonoDelPaciente')` (`panel-datos.tsx:138`) **desaparece**: deja de ser
  verdad.
- Sexo, junto a la fecha de nacimiento que la cabecera ya usa para la edad.
- Bloque **Alergias y medicación**, que al técnico **no le aparece en absoluto** (el cargador
  devuelve `null` y el bloque no se pinta). Ni en gris, ni «no tienes permiso»: la pestaña
  deshabilitada ya se rechazó en `page.tsx:111-113` por decir que hay algo detrás.
- El bloque de contacto se parte en **dos listas con dos rótulos**: «Representación legal»
  (`patria_potestad`, `custodia`) y **«Contacto de emergencia»** (`solo_contacto`). No se mezclan
  nunca, porque el primero firma y el segundo no, y una lista única invita a pedirle la firma al
  segundo. El texto del bloque de emergencia lo dice: *no puede consentir ni firmar*.
- Las cabeceras-comentario de `panel-datos.tsx:15-28` y `page.tsx:27-37` se reescriben. Dejar en
  pie «no hay camino de descifrado escrito» el día que lo hay es sembrar la siguiente
  investigación en falso.

### 1.9 · Banco de RLS

| Fichero | Qué se añade |
|---|---|
| `02-matriz-roles.sql:51-53` | La aserción del técnico **cambia de signo** (`= 1`, con el texto citando el ADR-060) y gana su gemela de centro ajeno (`= 0` para P2, que es de otro centro). Bloque nuevo para `pacientes_salud_basica`: ADM 1, PRO1 1, TEC1 **0**, TEC2 **0**. |
| `08-identificacion.sql` | `assert_lanza_codigo(…, '42501')` para insert y update como TEC1 **sobre una fila que TEC1 sí lee** (si no, el cero podría ser la RLS ocultándola: regla de `pruebas.md`); `clave_de_cifrado` como `authenticated` → 42501, y su gemela positiva como `postgres`; fila **solo domicilio** entra; fila **vacía** → 23514; `alta_paciente` con fecha nula → 23514; y el índice único sigue rechazando el alta doble mientras **dos filas de solo domicilio conviven** (los nulos no chocan). **Y el rastro (ADR-060)**: `leer_identificacion(P1)` como TEC1 devuelve fila **y añade una** en `auditoria` con `operacion = 'LECTURA_IDENTIFICACION'`, `actor_id` = TEC1 y `registro_id` = P1; la **segunda llamada seguida no añade ninguna** (ventana de quince minutos); `leer_identificacion(P2)` —otro centro— **ni fila ni rastro**; gemelas de ADM y PRO1, que también dejan rastro (el registro no exime a nadie); y una aserción de guardia de que `registrar_evento_auditable('BUSQUEDA', …)` **sigue funcionando** después de la redefinición. |
| `07-capacidad.sql` | `solo_contacto` no sale de `capacidad_consentimiento()` (gemela: el mismo menor con `patria_potestad` vigente sí devuelve representante) y no puede ser firmante → **23514** (gemela: el de patria potestad sí entra). |
| `11-cobertura.sql` | `pacientes_identificacion_lectura_tecnico`, `pacientes_salud_basica_lectura`, `…_alta`, `…_modificacion`. |
| `README.md` | Las filas de 02, 07 y 08 mencionan lo nuevo. |

**Los números de módulo no se tocan** (son dependencia real: se abren por ruta y corren en orden
alfabético). El banco corre también sobre la base sembrada, así que ninguna aserción nueva fija
un número absoluto de filas de tablas que el seed toca.

### 1.10 · El guion de punta a punta

`scripts/t032-alta.ts`, `npx tsx`, cinco pasos y salida legible:

1. sesión real de profesional (`ana@psicogestion.test` / `psico1234`);
2. `cifrarIdentificacion` con un DNI de prueba → `rpc('alta_paciente', …)` → uuid;
3. lectura de vuelta con la misma sesión **por `leer_identificacion()`**,
   `descifrarIdentificacion`, **comparación byte a byte** con lo enviado, y recuento de
   `auditoria` con `operacion = 'LECTURA_IDENTIFICACION'` **antes y después**: sube exactamente
   en 1, y una segunda lectura seguida **no** lo mueve;
4. `select count(*) from pacientes` antes / después de repetir el **mismo** DNI: la segunda
   llamada falla con 23505 y **el recuento no cambia**;
5. `process.exit(1)` a la primera desigualdad.

Es la prueba de que la transacción es de verdad, y la única forma de cerrar el criterio 10 sin
creerse la palabra de nadie. Esto no es un banco de RLS construyendo el estado a mano: llama a
lo que llama la Server Action (regla aprendida en T-013a).

---

## 2 · Decisiones y alternativas descartadas

1. **Teléfono en E.164 (`+34600000000`), no legible.** Se guarda una sola forma canónica porque
   `wa.me` (ADR-023) no admite espacios; lo bonito lo pone `formatearTelefono()` al pintar.
2. **`check` de teléfono genérico, no español.** La base comprueba la forma; el país lo comprueba
   Zod. Un `^\+34[67]` en un `check` congela el esquema el día del primer paciente extranjero.
3. **El domicilio se cifra igual que el DNI y con la misma clave AES.** El ADR-029 solo exige que
   la clave de cifrado sea **distinta de la del índice**, no una por columna; una tercera clave
   multiplicaría la rotación por nada.
4. **El domicilio NO se indexa.** Un índice ciego sirve para igualdad exacta, y dos personas
   escriben su calle de tres maneras: daría falsos negativos y sugeriría una búsqueda que no
   funciona. Buscar por domicilio no lo pide nadie.
5. **Domicilio limitado a 300 caracteres en Zod y a 2048 bytes de criptograma en la base.** Lo
   segundo es lo único comprobable sobre texto cifrado y cierra una llamada directa a PostgREST.
6. **Las dos columnas `*_clave_version` se quedan `not null default 1` y fuera del grupo
   todo-o-nada.** Meterlas dentro haría que su propio `default` violara el grupo en la fila de
   solo-domicilio, y obligaría a reescribir inserciones del banco que este ticket no debería
   tocar.
7. **Un RPC transaccional (`alta_paciente`) en vez de dos `insert` desde la acción.** `DELETE`
   sobre `pacientes` es imposible para todo el mundo: el fallo del índice único en el segundo
   viaje dejaría un paciente fantasma **para siempre**. No hay compensación posible desde la
   aplicación.
8. **`security invoker`, no definer.** Un definer se saltaría las políticas de las tres tablas y
   convertiría el alta en una puerta trasera de escritura.
9. **Los criptogramas viajan en base64 como `text` y los decodifica `decode(...)`.** Evita
   depender de cómo serializa `bytea` PostgREST en **escritura**, que es donde un error se
   convierte en datos corruptos. En **lectura** la incógnita persiste y por eso existe
   `bytea.ts` y la tarea 0.
10. **`fecha_nacimiento` sigue nulable en la tabla.** Hay filas anteriores sin ella y la rama
    `'desconocida'` de `capacidad_consentimiento()` debe seguir existiendo. La obligación se
    impone en **tres capas de la aplicación** (Zod en cliente, el mismo Zod en la acción, y
    `23514` dentro de `alta_paciente`). **Se dice sin adornos**: un `insert` directo a PostgREST
    sobre `pacientes` sigue pudiendo omitirla. Cerrar esa puerta es rellenar los nulos y poner
    `not null`, y eso es un ticket con migración de datos.
11. **Sexo opcional; solo la fecha de nacimiento pasa a obligatoria.** El propietario pidió
    ampliar el alta sin dejar de ser mínima; la fecha tiene una función (calcula quién
    consiente), el sexo hoy no la tiene.
12. **La guarda de `solo_contacto` es un disparador `security definer`.** Una clave ajena no
    puede mirar una columna de la tabla referenciada, y un disparador *invoker* leería
    `representantes_paciente` bajo la RLS del llamante: si la política le ocultara la fila, el
    `exists` daría falso y **la guarda dejaría pasar en silencio**. Es el uso deliberado de
    definer que describe `supabase.md`, acotado a leer un booleano.
13. **Alergias y medicación en tabla propia, sin cifrar, fuera del candado.** Razonado en el
    ADR-061; lo decisivo es que `grant select (columnas)` no acota por rol, así que en
    `pacientes` serían legibles por el técnico y no habría forma de impedirlo.
14. **Una fila de `pacientes_salud_basica` no puede estar vacía.** «Sin alergias conocidas» y
    «nadie ha preguntado» no son lo mismo, y el esquema no debe permitir confundirlas.
15. **`tipo_documento` se deriva, no se pregunta.** La letra inicial ya lo dice. Preguntar un
    dato deducible es una ocasión de incoherencia. **Pasaporte queda fuera**: `lib/identidad` no
    lo valida y este ticket no inventa esa validación.
16. **`<details>` nativo y `<select>` nativo.** Cero foco propio, cero trampa de teclado, cero
    primitiva nueva con comportamiento. La lección de T-007 está medida.
17. **Tres estados de lectura (`ok` / `sin-datos` / `no-legible`).** Un fallo de descifrado
    pintado como «no hay DNI» es una afirmación falsa sobre el expediente.
18. **`lib/cifrado/`, no `lib/identificacion/` ni `lib/identidad/`.** El nombre dice lo que hace
    la pieza —criptografía— y no colisiona con el carril de funciones puras de Kimi, que este
    ticket **no toca**.
19. **El rastro de la lectura va a `auditoria`, no a `accesos_historia` ni a una tabla nueva.**
    El reparto ya estaba escrito en el ADR-037: abrir una historia va a `accesos_historia`;
    «las búsquedas van a `auditoria`». Leer un DNI para llamar o para facturar es lo segundo.
    `auditoria` ya es de solo adición con sus tres capas y ya tiene escritor definer: una tabla
    nueva sería repetir todo eso —y su guarda de TRUNCATE, y su pantalla— para un hecho que
    ya cabe.
20. **El rastro lo escribe una función de lectura, no un disparador.** En Postgres no existe
    `AFTER SELECT`: la única forma de que leer escriba es que leer **sea una llamada**.
    `leer_identificacion()` devuelve el criptograma y registra en la misma transacción; si no
    puede registrar, no devuelve.
21. **Una fila por actor, paciente y quince minutos.** La ficha se lee en un Server Component:
    sin ventana, cada recarga y cada reintento de `<Suspense>` escribiría una fila y el registro
    sería ilegible —el fallo exacto que el ADR-037 nombra—. La ventana es la misma unidad que
    allí. Se acepta lo que cuesta: dentro de ella, dos miradas no se distinguen.
22. **No se revoca el `select` directo sobre `pacientes_identificacion`.** Revocarlo daría un
    rastro infalsificable, pero dejaría en código muerto las tres políticas de lectura y
    obligaría a reescribir la autorización dentro de una función definer: dos fuentes de verdad
    sobre quién ve un DNI. Se prefiere una puerta que **no descifra** —sin clave, el criptograma
    no es nada— y decirlo en el ADR en vez de esconderlo.
23. **El rastro se escribe para los tres roles, no solo para el técnico.** Un registro donde
    falte justamente el rol que más mira no responde a «¿quién ha visto mi DNI?». Además evita
    una rama por rol dentro de la función, que es una rama que alguien puede invertir sin que
    ninguna prueba se entere.

---

## 3 · Cómo se cierra cada criterio de aceptación

| # | Criterio | Cómo se demuestra |
|---|---|---|
| 1 | La base se levanta sola | `npx supabase db reset` → `psql` con `select name from vault.secrets order by name` (dos filas) y `select length(public.clave_de_cifrado('identificacion_cifrado_v1'))` = **44** (32 bytes en base64). Se pega la salida. |
| 2 | Tipos regenerados | `npm run tipos` y `git diff lib/supabase/tipos-bd.ts`: `telefono`, `sexo`, enum `sexo_administrativo`, tabla `pacientes_salud_basica`, los cinco campos de documento ahora `| null`, `alta_paciente` y `leer_identificacion` en `Functions`. Ni una línea más. El fichero **se genera, nunca se edita**. |
| 3 | Linter | `npm run lint:migraciones` sin hallazgos y con el fichero nuevo contado. Comprobado de antemano contra `scripts/lint-migraciones.ts:216-304`: no hay `drop` ni `set not null`, la tabla nueva lleva su `enable row level security` en el mismo fichero, y las dos funciones definer llevan `set search_path`. |
| 4 | La clave no llega al navegador | Banco, `08`: `pg_temp.assert_lanza_codigo(…'select public.clave_de_cifrado(…)'…, '42501')` como `authenticated`, **y gemela** que la obtiene como `postgres`. Sin la gemela, un `revoke` de más pasaría por bueno. |
| 5 | El técnico lee lo suyo | `npm run test:rls` verde; aserción de `02` invertida más gemela de centro ajeno. El total sube sobre **380** y la bitácora anota el número nuevo. |
| 6 | El técnico no escribe | `assert_lanza_codigo(…, '42501')` en insert y update **sobre la fila de P1, que TEC1 sí lee**. Un `UPDATE 0` no probaría nada. |
| 7 | El técnico no ve salud básica | `contar(...) = 0` para TEC1 **y** TEC2, con gemelas de ADM y PRO1 en 1. |
| 8 | El contacto de emergencia no consiente ni firma | `capacidad_consentimiento(PMENOR_SOLOCONTACTO)` → `representante_id` nulo; `insert` en `consentimiento_firmantes` con ese representante → **23514**. Las dos con gemela positiva de `patria_potestad`. |
| 9 | Ida y vuelta | `npx tsx scripts/t032-alta.ts` sale 0 e imprime el DNI descifrado igual al enviado. |
| 10 | Transacción de verdad | El mismo guion con DNI repetido: 23505 y **`count(*)` de `pacientes` idéntico antes y después**. Se pega la salida. |
| 11 | La fecha no se omite | Tres pruebas separadas: unitaria de `esquemaNuevoPaciente` sin fecha → error de campo; unitaria de `crearPaciente` con carga inválida → `fieldErrors.fechaNacimiento`; banco → `alta_paciente(..., null, ...)` = **23514**. |
| 12 | El alta mínima sigue mínima | `npm test`: con los seis opcionales vacíos, `rpc` recibe todos los `p_*` en null y el guion comprueba que **no** hay fila en `pacientes_identificacion` ni en `pacientes_salud_basica`. La comprobación de «no hay fila» va en el guion de la tarea 6, que es quien tiene base. |
| 13 | Domicilio sin documento | Banco `08`: `insert` con solo el cuarteto de domicilio entra; prueba de componente de que el bloque pinta el domicilio y **no** un «DNI: —». |
| 14 | Índice ciego del ADR-029 | `lib/cifrado/aes-gcm.test.ts`: tres formas del mismo DNI → mismo índice; otra clave → otro índice; clave de cifrado → índice distinto. |
| 15 | Criptograma manipulado | Unitaria: un byte cambiado hace lanzar. Componente: `estado: 'no-legible'` pinta «no se puede mostrar», no «sin DNI». |
| 16 | Lint y build | `npm run lint`; `npm run build > log 2>&1; echo "exit=$?"` (la tubería a `tail` devuelve el estado de `tail`, trampa ya pagada). Sin `blocking-prerender-*` nuevos: el cifrado vive en la acción y el descifrado es determinista dentro del `<Suspense>` que ya existe. |
| 17 | Guion de navegador | Tres sesiones, la matriz de la ficha. Si no da tiempo, entra en `docs/state.md` §Verificación manual pendiente con el guion escrito, como T-013. **No se marca hecho sin ejecutarlo.** |
| 18 | El descifrado deja rastro | Banco `08`: TEC1 → `leer_identificacion(P1)` devuelve fila **y** añade una en `auditoria` con el verbo, el actor y el paciente; segunda llamada seguida → **ninguna más**; `leer_identificacion(P2)` → cero filas y cero rastro; gemelas de ADM y PRO1. Guion de la tarea 6: el recuento sube exactamente en 1. Se pega la salida. |
| 19 | El rastro no lleva el dato | `select estado_posterior from public.auditoria where operacion = 'LECTURA_IDENTIFICACION'`: solo `rol`, `documento` y `domicilio`. Se lee **con los ojos** y se pega. Un nonce, una etiqueta o un `dni_indice` ahí dentro es el fallo. |
| 20 | Nadie lee por la puerta de atrás | `git grep -n "pacientes_identificacion" app/ lib/` no enseña ni un `.from(...)`: el único lector del producto es el RPC. |

---

## 4 · Riesgos, por probabilidad

1. **Alta** · *El `bytea` de vuelta no tiene la forma esperada.* Es la incógnita real del ticket.
   Mitigación: tarea 0 antes de escribir nada, y una sola función (`bytea.ts`) que traduce.
2. **Alta** · *La ficha acaba leyendo con un `select` directo y el rastro no se escribe nunca.*
   Es el fallo silencioso de la corrección del propietario: en pantalla todo se ve bien y el
   registro queda vacío. Mitigación: `cargarIdentificacion()` es el **único** lector y va por
   RPC; el guion de la tarea 6 cuenta filas de `auditoria`; y el criterio 20 es un `git grep`
   que no admite interpretación.
3. **Media** · *`postgres` no lee `vault.decrypted_secrets` en el local de este repo.* Sin eso,
   `clave_de_cifrado` no existe y la única alternativa (variable de entorno) es **otro ADR**, no
   un apaño. Por eso está como BLOQUEO explícito en la tarea 0.
4. **Media** · *Los dos ficheros de siembra acaban con claves distintas* y lo cifrado por uno no
   lo descifra el otro. Síntoma remoto («etiqueta inválida» en una pantalla). Mitigación: valores
   literales idénticos y criterio 1 que los lista.
5. **Media** · *Colisión de migraciones con T-012a*, que lleva otra en vuelo. Mitigación: el sello
   se fija **al integrar**, no al escribir (regla 5 del linter: nombre y orden).
6. **Media** · *La aserción invertida de `02-matriz-roles.sql` se cambia y nadie repara en que el
   comentario de la migración de T-002 sigue diciendo lo contrario.* Mitigación: tarea 2 incluye
   reescribir `comment on policy`, y §5 lo pone como punto de revisión.
7. **Baja** · *Un `<details>` cerrado esconde un error de validación* y el formulario parece no
   enviarse. Mitigación: se abre solo si hay error dentro (§1.7).
8. **Baja** · *La política nueva se escribe con `centro_actual()`* (singular, la forma antigua que
   sigue estando en la migración de T-002) en vez de `centros_actuales()`: un técnico multicentro
   dejaría de ver la mitad. Mitigación: §1.2 §7 la da escrita y §5 la nombra.
9. **Baja** · *`sin-literales.test.ts` falla* por textos nuevos sin pasar por `lib/i18n/es.ts`.
   Se ve en `npm test` a la primera.
10. **Media** · *La ficha se envuelve en `use cache` o se prerrenderiza*, y entonces hay
    lecturas sin fila de rastro. Mitigación: §1.8 lo prohíbe por escrito, el criterio 16 vigila
    `blocking-prerender-*` y el revisor comprueba que `cargarIdentificacion` sigue bajo
    `cache()` de React y dentro del `<Suspense>` que ya existe.
11. **Baja** · *El `create or replace` de `registrar_evento_auditable` se escribe a medias* y
    pierde alguno de los tres verbos que ya admitía, o el `check` se reescribe sin los ocho
    anteriores: el síntoma sería que deja de poder iniciarse sesión, a mil kilómetros de la
    causa. Mitigación: los dos se copian enteros (§1.2 §7.1) y el banco añade una aserción de
    guardia con `BUSQUEDA`.

---

## 5 · Qué revisar

Lista específica de este ticket. El revisor mira esto; el implementador se lo pregunta antes de
entregar.

**Lo que el llamante puede elegir, y qué efecto tiene**

- `alta_paciente` tiene **17 parámetros y quince con default**: cualquiera puede llamarla desde
  PostgREST con los que quiera. Comprobar uno a uno que ningún parámetro que la aplicación
  «siempre rellena» sea el que sostiene un invariante. En concreto: **no existe
  `p_profesional_id`** (sale de `auth.uid()`), y `p_fecha_nacimiento` **no tiene default**.
- `p_clave_version` y `p_indice_clave_version` son elegibles por el llamante: una fila cifrada
  con la clave 1 podría marcarse como versión 9 y volverse ilegible el día de la rotación.
  ¿Merece un `check (p_clave_version = 1)`? Decidirlo explícitamente en la revisión; el diseño
  los deja abiertos porque la rotación está fuera de alcance, y esa es justo la clase de puerta
  que conviene mirar dos veces.
- `p_tipo_documento` llega como `text` y la base admite `'pasaporte'`, que el módulo nunca
  produce. No es un agujero, pero que nadie lo lea como «los pasaportes están soportados».
- `clave_de_cifrado(p_nombre)`: la lista blanca tiene **dos** nombres. Cualquier otro → 42501.
  Comprobar que no se ha vuelto parametrizable «por comodidad».
- `leer_identificacion(p_paciente_id)`: cualquiera con sesión puede llamarla con **cualquier**
  uuid. Sin política que le deje ver la fila → cero filas **y cero rastro**. Comprobar que el
  `if not found then return` está **antes** del registro: al revés, un barrido de uuids
  llenaría `auditoria` de accesos que nunca ocurrieron, y esa tabla no se puede limpiar.
- `registrar_evento_auditable(p_operacion, …)`: `authenticated` puede llamarla directamente con
  `LECTURA_IDENTIFICACION` y el uuid que quiera, igual que ya puede con `BUSQUEDA`. No es fuga
  ni borrado —`actor_id` lo fuerza la función y `auditoria` es de solo adición—: es ruido
  firmado por quien lo escribe. Confirmar que se acepta a sabiendas y que nadie ha «arreglado»
  esto abriendo `insert` sobre `auditoria`.

**Qué prueba debe fallar, y por qué motivo exacto**

- TEC1 insertando identificación → **42501**, y sobre una fila que TEC1 **sí lee**. Si la fila no
  fuera legible, el fallo podría venir de la RLS de lectura y la prueba estaría verde por el
  motivo equivocado.
- `authenticated` ejecutando `clave_de_cifrado` → **42501**, con gemela positiva.
- Firmante `solo_contacto` → **23514** (no 42501: no es permiso, es coherencia).
- Fila de identificación vacía → **23514**. Alta doble del mismo DNI → **23505**.
- `alta_paciente` con fecha nula → **23514**.
- `leer_identificacion()` **sin sesión** → **42501**; sobre un paciente que el llamante no puede
  ver → **cero filas, sin excepción y sin rastro**. Son dos resultados distintos a propósito: la
  segunda no debe revelar si ese paciente existe.
- Descifrado con un byte cambiado → **lanza**. Si no lanza, falta el `setAuthTag` y GCM está
  cifrando sin autenticar: el criptograma se podría manipular y la ficha pintaría basura como si
  fuera un domicilio.

**Por dónde se podría saltar el invariante**

- **Nulos**: con `dni_indice` nulable, el índice único ya no impide **nada** entre filas de solo
  domicilio (los nulos no chocan). ¿Sigue impidiendo el alta doble cuando sí hay documento? Hay
  que verlo en la aserción, no razonarlo.
- **La otra puerta a `pacientes`**: `alta_paciente` exige la fecha, pero **un `insert` directo a
  `pacientes` por PostgREST sigue sin exigirla**. Está dicho en §2.10 y en el ticket; que el
  revisor confirme que se dice, no que se esconde.
- **Permisos de tabla entera**: `grant select, insert, update` sobre `pacientes_salud_basica`, y
  **`grant select (columnas)` no acota por rol**. Comprobar que no hay `delete`, que no hay
  `anon` ni `service_role`, y que el `revoke all` va **antes** de los grants.
- **`TRUNCATE`**: `pacientes_salud_basica` **no** es tabla de solo adición (es mutable por
  diseño) y por eso no lleva las tres capas. Verificar que Supabase no le ha concedido TRUNCATE
  por defecto: `\dp public.pacientes_salud_basica` después del reset. Es el fallo de T-001.
- **Concurrencia**: dos altas simultáneas con el mismo DNI. Una gana, la otra recibe 23505 y su
  transacción entera se deshace. Confirmar que la acción no reintenta ni «arregla» nada.
- **Recursión de políticas**: `pacientes_identificacion_lectura_tecnico` consulta `pacientes`;
  `pacientes` no consulta `pacientes_identificacion`. Si alguien añadiera lo segundo, esto sería
  recursión infinita. Anotarlo.
- **La auditoría**: `pacientes_salud_basica` recorta `alergias` y `medicacion_actual`. Leer la
  tabla `auditoria` después del guion y comprobar **con los ojos** que no hay ni una frase
  clínica dentro.
- **El rastro del descifrado** (ADR-060, corregido el 16-09-2026). Cinco cosas, no una: que el
  único lector de la aplicación sea `leer_identificacion()` (`git grep` del criterio 20); que el
  registro ocurra **dentro** de la misma transacción y **antes** del `return query`; que se
  escriba **para los tres roles** y no solo para el técnico; que dentro de la ventana de quince
  minutos **no** se duplique y fuera de ella **sí** vuelva a escribirse; y que el ADR diga en
  voz alta lo que el rastro **no** cubre —un `select` directo por PostgREST, que devuelve
  criptograma sin clave—.
- **El detalle del rastro**: `rol`, `documento`, `domicilio`, y nada más. Leer una fila real de
  `auditoria` con los ojos. Un nonce, una etiqueta o un `dni_indice` ahí dentro es exactamente
  lo que T-004 recortó a propósito.
- **La redefinición de `registrar_evento_auditable`**: ¿están los **tres** verbos anteriores en
  la lista blanca nueva, y los **ocho** anteriores en el `check`? Un `create or replace` a
  medias rompe el inicio de sesión sin tocar una línea de sesión.
- **`pacientes_salud_basica` y el técnico**: contar las políticas de la tabla en `pg_policies` y
  comprobar que **ninguna** menciona `tecnico_administrativo`, ni siquiera por omisión de
  `rol_actual()`. El cero de TEC1 y TEC2 tiene que venir de que no hay política, no de un filtro
  que alguien pueda relajar.
- **Fuga por el mensaje de error**: el 23505 se traduce a un texto que **no** dice de quién es la
  ficha existente. Leer el literal en `lib/i18n/es.ts`.
- **Trazas**: `git grep -n "console\." lib/cifrado/` debe salir vacío salvo el `console.error` de
  la acción, que **no** imprime el criptograma ni el texto claro.

---

## 6 · Territorio

El contrato lo declara en su frontmatter y es el que manda; se comprueba con
`node ~/.claude/pipeline/territorio.mjs T-032`. En resumen: `docs/` (tres ADR nuevos, índice,
arquitectura, interfaz, estado, bitácora), `supabase/migrations/**` y los dos ficheros de
siembra, `scripts/rls/{02,07,08,11}` + `README.md`, `scripts/t032-alta.ts`, `lib/cifrado/**`,
`lib/i18n/es.ts`, `lib/supabase/tipos-bd.ts` (**generado**), dos primitivas nuevas en
`components/ui/`, los cinco ficheros de `app/(app)/pacientes/` y `tickets/T-032/**`.

**Fuera, y no se toca ni «un momento»**: `lib/identidad/**` (carril de Kimi; se **usa**, no se
modifica), `components/ui/field.tsx`, `lib/supabase/administracion.ts` (se usa tal cual),
`scripts/rls/01-fijacion.sql` (por eso las versiones de clave se quedan como están),
`scripts/lint-migraciones.ts`, y cualquier migración anterior.

---

## 7 · Delegable

`delegable: no` en el contrato, y con motivo: RLS, cifrado y formularios son exactamente lo que
la regla del pipeline reserva a la fábrica. Lo único sin comportamiento, y solo **después** de
que el corte B esté escrito y revisado:

- las cadenas de `lib/i18n/es.ts` (rótulos, «(opcional)», textos de vacío);
- el `<option>` de los tres sexos;
- las dos pruebas de las primitivas, **copiando** la plantilla existente sin generalizarla.

Nada de eso justifica abrir una rama aparte. **No es delegable** ninguna prueba del banco (una
negativa sin su código exacto es ruido verde), ni las primitivas en sí (llevan ARIA), ni el
formulario (lleva estado y errores del servidor).

---

## Lo que no entra, y por qué

- **Buscar por DNI.** El índice queda construido y `lib/cifrado` expone `indice()`; el buscador
  de recepción tiene sus propias preguntas (¿qué ve el técnico en los resultados?) y es otro
  ticket.
- **Editar los campos nuevos** después del alta, y **crear representantes o contactos de
  emergencia por pantalla**: hoy no existe formulario de representantes, así que T-032 garantiza
  la semántica (`solo_contacto` no firma) y cómo se enseñan, no cómo se crean.
- **Rotar claves.** Es mantenimiento planificado del ADR-029 y necesita un guion de recifrado con
  su propia prueba de corte de luz.
- **La pantalla que enseñe el rastro.** El verbo `LECTURA_IDENTIFICACION` se escribe y se
  comprueba en el banco; la pantalla de auditoría es de fase 1 y tiene su propio ticket.
  Tampoco entra registrar el acceso en `accesos_historia` —contradiría el ADR-037— ni registrar
  la búsqueda por DNI, que todavía no existe.
- **`fecha_nacimiento not null`.** Requiere rellenar los nulos existentes: migración de datos.
- **Historial de alergias y medicación.** La tabla se sobrescribe; versionar es encadenar y eso
  es otro ADR.
- **`centro_id` en el alta.** Hoy `crearPaciente()` no lo fija y `alta_paciente()` tampoco lo
  hará: sería cambiar conducta sin decisión. Consecuencia real y anotada como hallazgo: **el
  técnico administrativo no verá los pacientes creados desde el formulario**, ni su ficha ni su
  identificación, porque las dos políticas piden centro.
- **Pasaporte, identidad de género, correo del paciente, segundo teléfono, teléfono en la lista.**

---

## Resumen

1. T-032 convierte el alta de paciente en el alta que el sector exige y estrena el ADR-029:
   fecha de nacimiento obligatoria, sexo, teléfono, DNI y domicilio cifrados, alergias y
   medicación, y el contacto de emergencia como `solo_contacto`.
2. Se construye en dos cortes: **A** (tres ADR, una migración, `lib/cifrado/`, RLS y banco) y
   **B** (Zod, dos primitivas, formulario, acción, ficha), para que cada revisión mire una cosa.
3. **Decisión 1**: el alta es **un RPC transaccional**, `alta_paciente`, porque `DELETE` sobre
   `pacientes` es imposible y dos viajes dejarían un paciente fantasma en cada DNI repetido.
4. **Decisión 2**: las dos claves viven en el Vault detrás de `clave_de_cifrado()`, definer, con
   lista blanca de dos nombres, concedida **solo a `service_role`**, **sin clave por defecto**
   jamás.
5. **Decisión 3**: alergias y medicación van a **tabla propia sin cifrar y sin el técnico**,
   porque `grant select (columnas)` no acota por rol y en `pacientes` serían legibles por él.
6. Dos decisiones chocaban con lo escrito —el técnico leyendo DNI (ADR-060) y el dato de salud
   fuera del candado (ADR-061)—: el propietario las **aprobó el 16-09-2026 con dos
   correcciones**, ya incorporadas. El descifrado **deja rastro** en `auditoria` con el verbo
   `LECTURA_IDENTIFICACION`, escrito por `leer_identificacion()` en la misma transacción que la
   lectura; y `pacientes_salud_basica` **no la ve el técnico administrativo**, ni una política.
7. Se ha encontrado y se cierra un agujero real: `consentimiento_firmantes.representante_id` no
   comprueba el alcance, así que un contacto de emergencia podría figurar como firmante.
8. Lo que más hay que revisar: los **códigos exactos** de cada negativa y su gemela positiva; que
   el técnico **no escriba**; los privilegios de la tabla nueva (`\dp`, cero delete, cero
   TRUNCATE); que el índice único siga impidiendo el alta doble ahora que `dni_indice` es
   nulable; y que **no quede ni un `select` directo a `pacientes_identificacion`** en `app/` ni
   en `lib/`, porque ese es el camino que lee sin dejar rastro.
9. Lo que queda abierto y dicho: la fecha sigue nulable en la tabla, así que un `insert` directo
   por PostgREST puede omitirla; y `centro_id` sigue sin fijarse en el alta, así que el técnico
   no verá a los pacientes creados desde el formulario.
10. Riesgo mayor antes de escribir código: cómo devuelve PostgREST un `bytea` y si `postgres` lee
    el Vault. Las dos son la **tarea 0**, con BLOQUEO explícito si fallan.

---

## Historial de correcciones

- **16-09-2026 · El propietario aprueba ADR-060 y ADR-061, con dos correcciones.** Ambas están
  ya aplicadas arriba y al contrato; no hay nada pendiente de gate.
  1. **ADR-060**: el técnico administrativo sigue leyendo DNI y domicilio de sus centros **sin
     PIN**, pero **cada lectura deja rastro**. Mecanismo elegido, por ser el que el esquema ya
     tiene hecho: verbo nuevo `LECTURA_IDENTIFICACION` en `auditoria` —donde el ADR-037 ya manda
     los accesos a datos personales que no son abrir una historia— escrito por
     `public.leer_identificacion()`, que pasa a ser el **único** camino de lectura de la
     aplicación y registra en la misma transacción. Sin tabla nueva y sin disparador (no existe
     `AFTER SELECT`). Toca §1.1 (ADR-060), §1.2 §7.1, §1.4, §1.8, §1.9, §1.10, §2.19-23, §3
     (criterios 18-20), §4 y §5; y en el contrato, el contexto, las tareas 1, 2, 5, 6 y 8, el
     criterio 2 y los criterios nuevos 18, 19 y 20.
  2. **ADR-061**: alergias y medicación siguen **sin cifrar y fuera del candado**, y el técnico
     administrativo **no accede a la tabla**. Era ya lo que el diseño traía —cero políticas para
     el técnico, criterio 7 con TEC1 y TEC2— y ahora consta además como **condición** de la
     aprobación, no como preferencia del diseño.
- Ninguna otra decisión del diseño cambia.
