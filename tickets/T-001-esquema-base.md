---
id: T-001
titulo: Esquema base — organización, centros, perfiles, paciente e historia
modelo: opus
fase: 0
prioridad: alta
depende_de: [T-000]
estado: hecho
---

# Contexto

T-000 dejó tres tablas de juguete (`perfiles`, `pacientes`, `auditoria`) para fijar los
patrones. Este ticket levanta **el esquema que no se puede añadir después**: todo aquello
cuya ausencia obligaría a migrar datos clínicos ya sellados.

La lista no la inventa este ticket. Sale entera de la tabla de reparto de `PLAN.md`
(columna «T-001 esquema») y de los ADR que la generaron: **026** (candado), **027**
(anotaciones reservadas), **028** (menores), **029** (DNI), **030** (pareja y familia),
**031** (duplicados), **032** y su enmienda (baja del profesional, titularidad), **033**
(centros y retención), **034** (zona horaria), **035** (contenido canónico), **036**
(borrador), **037** (accesos).

Referencias: `docs/architecture.md` §Dominios de datos, §Los cuatro invariantes,
§Separación por sensibilidad, §Candado, §Registro de accesos, §Retención, §Personas
alrededor del paciente, §Reserva de anotaciones subjetivas.

**Frontera del ticket, explícita.** Entra el dominio **Organización**, el **Paciente
identificativo** y el **Paciente clínico**. **No entra** Agenda, Económico, Firmas ni
Mensajería: son fase 1 y añadirlos luego no cuesta migración porque no cuelga nada de
ellos todavía. Dos excepciones, y por qué: `alertas_documentacion` **sí entra**, porque de
ella se alimentan la bandeja y las métricas sin abrir el candado (choque 11 de
`interfaz.md`); y `zona_horaria` en organización y centro **también**, porque después
obligaría a migrar `citas`, `series_cita` y `disponibilidad` a la vez (ADR-034).

De `citas` y `series_cita` **no se escribe ni una columna aquí**: lo que el ADR-034 deja
para su ticket se queda en su ticket.

## Tareas

- [x] **Organización y centros.** `organizacion` con restricción de fila única, NIF, y
      `zona_horaria` validada contra `pg_timezone_names`, `Europe/Madrid` por defecto.
      `centros` con `zona_horaria` **anulable**: nulo significa heredar, nunca «sin zona».
      → migración §2; validación por disparador `fn_validar_zona_horaria` + `es_zona_iana`.
- [x] **`politicas_retencion` colgando del centro** (ADR-033), con la fila de la
      organización como valor por defecto heredable y mínimos legales por debajo de los
      cuales no se puede bajar. Función de resolución que **jamás devuelve nulo** para un
      centro sin política propia.
      → migración §3 (fila semilla + veto de borrado) y `retencion_efectiva()` en §14.
- [x] **`perfiles` ampliada**: `estado` (`activo`, `suspendido`, `baja`) con fecha,
      `centro_id` **obligatorio solo para `tecnico_administrativo`** (restricción de la
      base, no de la aplicación), y restricción que **impide dar de baja al último
      administrador activo** (ADR-032).
      → migración §4; `check perfiles_tecnico_exige_centro` + `constraint trigger`
      `impedir_baja_ultimo_administrador` (§15).
- [x] **`preferencias_usuario`**, una fila por perfil. → migración §5.
- [x] **Candado (ADR-026)**: `pines_historia` (hash bcrypt, contador de fallos, instante
      de bloqueo) **sin `select` para ningún rol**, y `desbloqueos_historia` (perfil,
      concesión, caducidad, revocación) como **estado operativo mutable**, no de solo
      adición. → migración §6; cero grants en §17.
- [x] **`pacientes` ampliada**: `titularidad` (`organizacion` por defecto, `profesional`),
      `fusionado_en` con su disparador anti-cadena (ADR-031) y las columnas de traspaso de
      la enmienda del ADR-032.
      → migración §7; `fn_normalizar_fusion_paciente` + `fn_repuntar_fusionados`.
- [x] **`pacientes_identificacion`** (invariante 3): `dni_cifrado` (AES-256-GCM, nonce
      aleatorio) y `dni_indice` (HMAC-SHA-256) con **índice único**, más domicilio
      cifrado. Ninguna columna en claro (ADR-029). → migración §7.
- [x] **`representantes_paciente`** con tipo, alcance y **vigencia desde/hasta
      obligatoria**, más `capacidad_consentimiento(paciente, fecha)` que **calcula** quién
      consiente (ADR-028). Prohibida cualquier bandera `es_menor`.
      → migración §7 y §14. `vigente_desde not null`, `vigente_hasta` nulable: punto
      abierto (c) del diseño, aprobado.
- [x] **`consentimientos`** con **N firmantes** y la casilla «menor oído» con fecha.
      → migración §7: `consentimientos` + tabla hija `consentimiento_firmantes`.
- [x] **Episodios**: `episodios_asistenciales` con `modalidad_relacional`
      (`individual`, `pareja`, `familiar`, `grupo`) y fecha de cierre —que es la que
      arranca el reloj de retención—, `episodio_participantes` con alta y baja,
      `diagnosticos` (CIE-10-ES + columna paralela DSM-5-TR, decisión 7) y
      `valoraciones_riesgo`. → migración §8.
- [x] **Notas**: `notas_clinicas` como **cabecera mutable** con el borrador
      (`borrador_contenido`, `borrador_actualizado_en`, autor) y bloqueo optimista
      (ADR-036); `notas_clinicas_versiones` de **solo adición** con `cuerpo`,
      `anotaciones_reservadas` (ADR-027), `contenido_canonico`, `huella`,
      `huella_anterior`, `algoritmo_version`, `esquema_version`, `motivo_cambio` y
      `alcance` (`individual` | `conjunta`, ADR-030). → migración §9. `cuerpo` y
      `contenido_canonico` son **`text`**, verificado en `tipos-bd.ts`.
- [x] **`evaluaciones`, `evaluacion_archivos`, `informes`.** → migración §10.
- [x] **`accesos_historia`** con **tipo** (apertura, exportación, informe, emergencia),
      pestaña y **contador de vistas** (ADR-037). → migración §11: el contador se calcula
      en la vista `accesos_historia_resumen` sobre `accesos_historia_vistas`, porque un
      contador mutable rompería el criterio 11.
- [x] **`alertas_documentacion`**, que es lo que la bandeja y las métricas leen **sin
      abrir el candado**. → migración §12.
- [x] RLS **activo en todas las tablas nuevas** desde esta migración, con `grant`
      explícitos y `alter default privileges ... revoke all`. Las políticas son T-002.
      → migración §16 y §17. `pg_tables where not rowsecurity` = 0; cero grants a `anon`
      y `service_role`; cero `delete`; saneadas también las secuencias.

## Criterios de aceptación (verificables)

- [x] **Automático** — `npx supabase db reset` aplica las migraciones sin error y
      `npm run tipos` regenera `lib/supabase/tipos-bd.ts`.
      → `Applying migration 20260822094547_esquema_base_organizacion_paciente_historia.sql`
      … `Finished supabase db reset on branch main.`, sin una sola línea `ERROR:`.
      `npm run tipos` deja el fichero en 1656 líneas, con `organizacion:` (877),
      `pines_historia:` (1109), `accesos_historia_resumen:` (1356) y
      `nivel_riesgo: "bajo" | "moderado" | "alto"` (1426); 1419 líneas de diferencia
      frente a la versión anterior al ticket.
- [x] **Automático** — `npm run lint` y `npm run build` limpios.
      → `eslint` sin salida. `build`: `✓ Compiled successfully in 8.1s`,
      `Finished TypeScript in 2.5s`, `✓ Generating static pages (7/7)`, rutas `/`,
      `/login`, `/pacientes`, `/prototipo`. **`tipos-bd.ts` NO ha necesitado
      `globalIgnores`.**
- [x] **Automático** — un segundo `insert` en `organizacion` **falla**.
      → `ERROR: duplicate key value violates unique constraint
      "organizacion_fila_unica_key" · DETAIL: Key (fila_unica)=(t) already exists.`
- [x] **Automático** — `insert` de un centro con `zona_horaria = 'CEST'` o `'+02:00'`
      **falla**; con `'Atlantic/Canary'` pasa.
      → los dos primeros: `ERROR: Zona horaria no válida: … (ADR-034)` (22023).
      `'Atlantic/Canary'` inserta. **Además, y como exige el ADR-034 aunque el ticket no
      lo pidiera: `'CET'` y `'Etc/GMT+2'` también fallan, pese a estar los dos en
      `pg_timezone_names`** (comprobado en el mismo guion). Zona nula pasa y
      `zona_horaria_centro()` la resuelve a `Europe/Madrid`.
- [x] **Automático** — un centro **sin** `politicas_retencion` propia resuelve a la de la
      organización; la función de resolución **nunca devuelve nulo**.
      → `25 | 5 | organizacion` para el centro sin política, para un uuid inexistente y
      para `null`; `filas = 1, con_nulos = 0`. Con política propia: `30 | 10 | centro`.
      La fila de la organización **no se puede borrar**: `ERROR: La política de retención
      de la organización no se puede borrar (ADR-033)`.
- [x] **Automático** — bajar la retención por debajo del mínimo legal del centro **falla**.
      → `ERROR: new row for relation "politicas_retencion" violates check constraint
      "politicas_retencion_check"`. Bajar a 5 con mínimo 5 pasa (`UPDATE 1`).
- [x] **Automático** — `insert` de un `tecnico_administrativo` **sin `centro_id` falla**;
      con `centro_id` pasa. Un `profesional_sanitario` sin `centro_id` pasa.
      → `ERROR: … violates check constraint "perfiles_tecnico_exige_centro"`; los dos
      controles insertan (`INSERT 0 1`).
- [x] **Automático** — poner en `baja` al **último** administrador activo **falla**; con
      dos administradores activos pasa.
      → `ERROR: La instancia no puede quedarse sin ningún administrador activo (ADR-032)`.
      Con dos admins: `UPDATE 1` y uno queda `baja` y otro `activo`. **Cambiar el `rol`
      del último también falla** (mismo error) y **el relevo en dos sentencias dentro de
      una transacción pasa** con `set constraints all deferred`.
      *Matiz honesto*: el `delete` del último administrador también falla, pero con
      `42501` de la comprobación referencial contra `notas_clinicas_versiones`, no con el
      disparador — ver «Hallazgos» al final y `docs/state.md`.
- [x] **Automático** — dos `pacientes_identificacion` con el mismo `dni_indice` violan el
      índice único.
      → `ERROR: duplicate key value violates unique constraint
      "pacientes_identificacion_dni_indice_unico_idx"`.
- [x] **Automático** — `capacidad_consentimiento` devuelve el representante para una fecha
      en que el paciente tiene 15 años y el propio paciente para otra en que tiene 16, **con
      la misma fila**. Ninguna columna booleana de minoría de edad existe en
      `information_schema.columns`.
      → con **una sola** fila de representante (`filas_representante = 1`,
      `sin_caducidad = t`): a `2026-01-01` → `representante | … | 15 | t`; a `2026-07-01`
      → `paciente | | 16 | f`; a `2021-06-16` → `representante | … | 11 | f`.
      Recuento de columnas `boolean` con nombre de minoría de edad: **0**. El control
      confirma que `consentimientos.menor_oido_en` existe y es `date`.
- [x] **Automático** — `update pacientes set fusionado_en = <ya fusionado>` **falla** o
      normaliza al superviviente final; no se crean cadenas de dos saltos.
      → normaliza. `A→B`; `C→A` queda como `C→B`; tras `B→D`, `A`, `B` y `C` apuntan a
      `D`. `cadenas_de_dos_saltos = 0`. Fusionarse consigo mismo: `ERROR: Ciclo de fusión
      detectado … (ADR-031)`.
- [x] **Automático** — `update` y `delete` sobre `notas_clinicas_versiones` y
      `accesos_historia` **fallan**; `update` sobre `notas_clinicas` (cabecera) y sobre
      `desbloqueos_historia` **pasa**.
      → sin privilegio: `ERROR: permission denied for table …` en las dos tablas y en
      `accesos_historia_vistas`. **Tras devolver `update, delete` a `postgres` a la
      fuerza**, con fila presente: `ERROR: La tabla … es de solo adición` en `update` y
      en `delete`. `TRUNCATE` como `postgres`: mismo error en las tres tablas. Mutables:
      `UPDATE 1` en `notas_clinicas` (y el disparador fija `borrador_actualizado_en`) y
      `UPDATE 1` en `desbloqueos_historia`.
- [x] **Automático** — `select` sobre `pines_historia` como `authenticated` **falla** con
      permiso denegado.
      → `ERROR: permission denied for table pines_historia`, igual como `anon` y como
      `service_role`. `role_table_grants` sobre esa tabla: solo `postgres`.
- [x] **Automático** — `select count(*) from pg_tables where schemaname = 'public' and not
      rowsecurity` devuelve **0**.
      → `tablas_sin_rls = 0`. Extras del mismo bloque: `concesiones_a_anon_o_service_role
      = 0`, `grants_de_delete = 0`, `concesiones_en_secuencias = 0`, las políticas RLS
      siguen siendo **solo las cuatro de T-000**, y `perfiles` tiene
      `relforcerowsecurity = f`.

## Guion de comprobación manual

1. `npx supabase db reset` y `npm run tipos`.
2. Abre Studio (`http://127.0.0.1:54323`) y comprueba con `\dp` que ninguna tabla nueva
   concede nada a `anon`, y que `pines_historia` no concede `select` a nadie.
3. `npm run dev` y entra en `/pacientes`: el paseo vertical de T-000 **sigue funcionando**
   sin tocar el código de la pantalla.

## Notas para el agente

- **Es una migración nueva hacia delante**, no una edición de la de T-000. Las columnas se
  añaden con `alter table`; nada destructivo en un solo paso.
- **`perfiles` nunca lleva `force row level security`** — es la regla que hace imposible
  la recursión de `rol_actual()` (T-000 §Diseño).
- Lo que se cifra se cifra **en la aplicación** con `node:crypto` y claves del Vault
  (ADR-029). La migración crea las columnas; **no** instala `pgsodium`.
- El `check` de zona horaria se apoya en `pg_timezone_names`; resuélvelo como disparador o
  como función, y deja escrito por qué esa forma y no la otra.
- Los `grant` explícitos son el riesgo número uno (T-000 §Riesgos): `auto_expose_new_tables`
  está sin definir y sin ellos todo falla con `permission denied` aunque la política sea
  perfecta.
- Las políticas RLS **no van aquí**. Aquí va `enable row level security` y nada más: una
  tabla con RLS activo y sin política deniega todo, que es el estado correcto hasta T-002.
- La cadena de huellas no se calcula en este ticket (es T-005). Aquí solo existen las
  columnas donde va a vivir.
- Si aparece una decisión no cerrada en `decisions.md`, **se para y se escala**. No se
  decide dentro del ticket.

---

## Diseño aprobado

### 0 · Hechos verificados contra la base y el repositorio (no re-verificar, sí respetar)

| Hecho | Comprobado con | Consecuencia de diseño |
|---|---|---|
| `pg_timezone_names` **no contiene** `'CEST'` ni `'+02:00'`; **sí contiene** `'CET'`, `'UTC'`, `'Etc/GMT+2'` y 598 duplicados `posix/...` | `select ... from pg_timezone_names` | Validar «existe en `pg_timezone_names`» **no basta** para cumplir el ADR-034 («ni abreviaturas, ni desplazamientos fijos»). La regla es: existe **y** contiene `/` **y** no empieza por `posix/` **y** no empieza por `Etc/` |
| T-000 ya dejó `alter default privileges ... revoke all on tables` **efectivo** para el rol `postgres` | `pg_default_acl` → `postgres/public/r = {postgres=arwdDxtm/postgres}` | Las tablas que cree esta migración nacen **sin ningún privilegio** para `anon`/`authenticated`/`service_role`. Sin `grant` explícito, todo devuelve `permission denied` con RLS perfecto. Sigue siendo el riesgo nº 1 |
| Para **secuencias** el `alter default privileges` de `postgres` sigue concediendo `w` a `anon`, `authenticated` y `service_role` | mismo `pg_default_acl` (`postgres/public/S`) | `UPDATE` sobre una secuencia habilita `nextval`/`setval`. Se cierra en esta migración (§2.14) |
| `create unique index ... on tabla ((centro_id is null)) where centro_id is null` es válido y rechaza la segunda fila | probado en transacción con `rollback` | Es la forma de garantizar la fila única de organización en `politicas_retencion` |
| `create constraint trigger ... after update or delete ... deferrable initially immediate for each row when (...)` es válido | probado en transacción | Es la forma del candado del último administrador |
| Columna `generated always as (...) stored` sobre otra columna de la misma fila es válida | probado en transacción | Sirve para el indicador binario de riesgo (decisión 6) |
| `pg_tables where schemaname='public' and not rowsecurity` = **0** hoy | consulta directa | El criterio 14 solo se mantiene si **cada** tabla nueva lleva `enable row level security` |
| `crearPaciente` inserta columnas explícitas y `page.tsx` selecciona columnas explícitas | `app/(app)/pacientes/acciones.ts:33`, `page.tsx:14` | El paseo vertical sobrevive **si y solo si** ninguna columna nueva de `pacientes` o `perfiles` es `not null` sin `default` |
| `lib/supabase/tipos-bd.ts` no está en `globalIgnores` y hoy lintea limpio | `eslint.config.mjs` | Si el fichero regenerado rompiera `npm run lint`, la corrección aprobada es añadirlo a `globalIgnores` con comentario, **no** editarlo a mano |
| `pgcrypto` ya instalado en `extensions` | migración de T-000 | Esta migración **no crea ninguna extensión** y **no instala `pgsodium`** (ADR-026, ADR-029) |

### 1 · Reglas de forma que gobiernan toda la migración

1. **Una sola migración nueva**, hacia delante:
   `npx supabase migration new esquema_base_organizacion_paciente_historia`. No se edita
   la de T-000.
2. **Nada `not null` sin `default`** al alterar `perfiles` y `pacientes`.
3. **Ninguna política RLS.** Solo `enable row level security`. Una tabla con RLS y sin
   política deniega todo: es el estado correcto hasta T-002.
4. **`perfiles` nunca lleva `force row level security`.** Se repite el comentario.
5. **Ningún trigger de auditoría** sobre las tablas nuevas: eso es T-004.
6. **Ningún cálculo de huella**: aquí solo existen las columnas donde vivirá (T-005).
7. **Ningún `grant` a `anon` ni a `service_role`.** Ningún `grant delete` en ninguna tabla.
8. Todas las funciones nuevas: `set search_path = ''`, nombres cualificados,
   `revoke execute from public` y `grant execute to authenticated` **solo** las tres que la
   aplicación va a llamar.
9. Cada tabla y cada columna no obvia lleva `comment on`: el comentario es donde vive el
   «por qué» y es lo que sobrevive al agente siguiente.

### 2 · La migración, sección a sección

Orden del fichero: `enums → organización → retención → alter perfiles → preferencias →
candado → alter pacientes → identificación y personas → clínico → notas →
evaluaciones/informes → cumplimiento → referencias cruzadas → funciones → triggers → RLS
→ grants`.

#### 2.1 Enums (lo más caro de migrar después: se definen completos)

| Tipo | Valores | Fuente |
|---|---|---|
| `estado_perfil` | `activo`, `suspendido`, `baja` | ADR-032 |
| `titularidad_paciente` | `organizacion`, `profesional` | ADR-032 enmienda |
| `tipo_representante` | `progenitor`, `tutor`, `acogedor`, `guardador_de_hecho`, `representante_judicial` | ADR-028 (literal) |
| `alcance_representacion` | `patria_potestad`, `custodia`, `solo_contacto` | ADR-028 (literal) |
| `tipo_consentimiento` | `asistencial`, `terapia_pareja_familiar`, `tratamiento_datos`, `cesion_informacion`, `grabacion`, `otro` | ADR-030, decisión 10 |
| `modalidad_relacional` | `individual`, `pareja`, `familiar`, `grupo` | ADR-030 (literal) |
| `nivel_riesgo` | `bajo`, `moderado`, `alto` | §Roles + decisión 6 — punto abierto (a) |
| `alcance_nota` | `individual`, `conjunta` | ADR-030 |
| `tipo_informe` | `alta`, `seguimiento`, `derivacion`, `pericial`, `aseguradora`, `otro` | §Fiscalidad (el IVA se deriva del tipo) |
| `tipo_acceso_historia` | `apertura`, `exportacion`, `informe`, `emergencia` | ADR-037 (literal) |
| `pestana_historia` | `historial_clinico`, `notas_clinicas`, `evaluaciones`, `informes`, `documentos` | `interfaz.md` §Pacientes |
| `tipo_alerta_documentacion` | `nota_sin_firmar`, `borrador_abandonado`, `consentimiento_pendiente`, `informe_pendiente`, `evaluacion_sin_corregir` | ADR-036 + choque 11 |

`estado_episodio` **no existe**: se deriva de `cerrado_en is null`. `estado_nota` **no
existe**: se deriva (§2.9).

#### 2.2 Organización y centros

**`public.organizacion`** — una sola fila (decisión 1).

| Columna | Tipo | Restricción |
|---|---|---|
| `id` | `uuid` | pk, `default gen_random_uuid()` |
| `fila_unica` | `boolean` | `not null default true`, `check (fila_unica)`, `unique` ← **el candado de fila única** |
| `razon_social` | `text` | `not null check (length(trim(razon_social)) > 0)` |
| `nif` | `text` | `not null check (nif ~ '^[A-Z0-9]{9}$')` |
| `zona_horaria` | `text` | `not null default 'Europe/Madrid'` (validada por disparador) |
| `minutos_desbloqueo_historia` | `smallint` | `not null default 15 check (between 1 and 60)` — ADR-026 |
| `direccion`, `telefono`, `correo` | `text` | nulables |
| `creado_en`, `actualizado_en` | `timestamptz` | `not null default now()` |

`comment on table`: la frontera dura del ADR-033 y de la enmienda del ADR-032 — **un solo
NIF por instancia**; quien emita con otro NIF es otro cliente y otra instancia.

**`public.centros`** — `id`, `nombre` (`not null`, no vacío), `direccion`, `localidad`,
**`provincia`** (determina el mínimo legal de la CCAA, ADR-033), `codigo_postal`,
`telefono`, **`zona_horaria text null`** (nulo = hereda, **nunca** «sin zona»), `activo`,
`creado_en`.

**Sin columna `nif`**, y con comentario diciendo por qué: un centro con NIF propio no es un
centro (ADR-033).

#### 2.3 `politicas_retencion` (ADR-033)

`id`, `centro_id uuid references centros(id)` **nulable (nulo = la fila de la
organización)**, `anios_historia_clinica smallint not null default 25` (decisión 8),
`anios_minimo_legal smallint not null default 5` (art. 17.1), `actualizado_por`,
`creado_en`, `actualizado_en`.

- `check (anios_historia_clinica >= anios_minimo_legal)` ← **es el criterio 6, y es una
  `check` pura, no un disparador.**
- Índice único por centro, e índice único `((centro_id is null)) where centro_id is null`.
- **Fila semilla en la propia migración** con los valores por defecto: es lo que hace que
  la herencia tenga siempre a dónde caer.
- Disparador que **impide borrar la fila de la organización**.

**Ninguna columna de conservación indefinida**: consentimientos e informes de alta son
indefinidos **por norma, no por configuración**. Queda en el comentario de tabla.

#### 2.4 `perfiles` ampliada (ADR-032, ADR-033)

`estado public.estado_perfil not null default 'activo'`, `estado_desde`, `motivo_estado`,
`centro_id uuid references centros(id)` nulable.

- `check (rol <> 'tecnico_administrativo' or centro_id is not null)` ← **es el criterio 7,
  y es una `check` de la base.**
- Candado del último administrador:
  `create constraint trigger ... after update or delete ... deferrable initially immediate
  for each row when (old.rol = 'administrador' and old.estado = 'activo')`.

Tres motivos para esa forma exacta, que van en el comentario:
- **`after`, no `before`**: una sentencia que degrada a un administrador y promueve a otro
  debe pasar; con `before` dependería del orden de las filas.
- **`constraint trigger` + `deferrable`**: permite validar al final un relevo hecho en dos
  sentencias dentro de una transacción.
- El `when` cubre a la vez el cambio de `estado`, el cambio de `rol` y el `delete`, y no
  cuesta nada en el resto de escrituras.

#### 2.5 `preferencias_usuario`

`perfil_id` pk, `idioma` (`check (idioma = 'es')`, decisión 17), `densidad_listas`,
fechas. **No lleva `tema`** (ADR-042), ni `zona_horaria` (ADR-034: siempre la del centro),
ni la ventana del PIN (vive en `organizacion`, punto abierto (b)). Quien crea la fila es
T-006.

#### 2.6 El candado (ADR-026)

**`pines_historia`** — `perfil_id` pk, `hash text not null` (bcrypt de `extensions.crypt`),
`intentos_fallidos`, `bloqueado_hasta`, fechas.
- **Cero `grant` para todos los roles.** Ni `select` para `authenticated`. Es el criterio 13.
- Disparador: si el `rol` del perfil es `tecnico_administrativo`, excepción. El técnico no
  tiene PIN, y eso es regla de la base, no de la pantalla.

**`desbloqueos_historia`** — **estado operativo mutable, sin ningún cerrojo de solo
adición**: `perfil_id`, `concedido_en`, `caduca_en` (`> concedido_en`), `revocado_en`.
- Índice parcial de vigentes.
- **Grant: solo `select` a `authenticated`. Ni `insert` ni `update`.** Con su comentario:
  si `authenticated` pudiera insertar aquí, un cliente fabricaría un desbloqueo por
  PostgREST **sin teclear el PIN** y el candado entero sería decorativo. Conceder,
  prolongar y revocar pasa por funciones `security definer` que verifican el PIN — y esas
  son T-006.
- El criterio «`update` sobre `desbloqueos_historia` pasa» se comprueba **como
  `postgres`**: demuestra que la tabla no tiene cerrojo de solo adición, no que el cliente
  pueda escribirla.

#### 2.7 Paciente identificativo

**`pacientes` ampliada** (todo nulable o con `default`): `titularidad` (ADR-032 enmienda),
`centro_id`, **`fecha_nacimiento`** (la necesita `capacidad_consentimiento()`),
`fusionado_en` / `fusionado_el` / `fusionado_por` / `motivo_fusion` (ADR-031),
`traspasado_en` / `traspasado_a` / `motivo_traspaso` (ADR-032 enmienda).

- `check (fusionado_en is distinct from id)` y `check` todo-o-nada de fusión y de traspaso.
- `check (traspasado_en is null or titularidad = 'profesional')` ← solo se traspasa lo que
  es del profesional.
- «Cerrado a nueva actividad» **no es columna**: es `traspasado_en is not null`. Igual que
  «solo lectura» del absorbido es `fusionado_en is not null`. Las hace cumplir RLS en
  T-002; aquí solo existe el dato.
- **Disparador anti-cadena (ADR-031), en dos piezas**:
  - `fn_normalizar_fusion_paciente()` — `before insert or update of fusionado_en`: recorre
    hasta el superviviente final (tope de 50 saltos) y **asigna ese**; si resulta ser
    `new.id`, excepción por ciclo.
  - `fn_repuntar_fusionados()` — `after update of fusionado_en`: reapunta al nuevo
    superviviente las filas que apuntaban a la recién absorbida. **Sin esta segunda pieza
    la cadena entra por la puerta de atrás** y el «un solo salto» de la RLS deja de ser
    cierto.
  - Invariante resultante, en el comentario: **`fusionado_en` apunta siempre a una fila con
    `fusionado_en is null`**. Nada de contenido clínico se repunta jamás — solo el vínculo.

**`pacientes_identificacion`** (invariante 3 + ADR-029) — `paciente_id` pk **sin
`cascade`** (no se borra nada):

| Columna | Tipo | Restricción / porqué |
|---|---|---|
| `tipo_documento` | `text` | `check in ('dni','nie','pasaporte')` — el tipo no identifica, el número sí |
| `dni_cifrado` | `bytea` | `not null` — AES-256-GCM |
| `dni_nonce` | `bytea` | `not null`, 12 bytes |
| `dni_etiqueta` | `bytea` | `not null`, 16 bytes |
| `dni_clave_version` | `smallint` | la rotación del ADR-029 necesita saber con qué clave se cifró cada fila |
| `dni_indice` | `bytea` | `not null`, 32 bytes — HMAC-SHA-256 |
| `dni_indice_clave_version` | `smallint` | **clave distinta**, versión distinta |
| `domicilio_cifrado` / `_nonce` / `_etiqueta` / `_clave_version` | `bytea`, `smallint` | nulables, `check` todo-o-nada |

- Índice **único** sobre `dni_indice` ← criterio 8.
- **Ninguna columna en claro.** Comentario de tabla: el cifrado y el HMAC ocurren **en la
  aplicación** con `node:crypto` y claves del Vault; la normalización previa al HMAC
  (mayúsculas, sin espacios ni guiones, letra de control validada) es de la aplicación, y
  sin ella el índice único no protege de nada.

**`representantes_paciente`** (ADR-028) — persona, documento cifrado con el mismo patrón,
`tipo`, `alcance`, **`vigente_desde date not null`**, `vigente_hasta` nulable,
documento acreditativo adjunto, `creado_por`.

**`consentimientos`** — `paciente_id`, `episodio_id`, `tipo`, **`texto_firmado`** y
**`texto_version`** (decisión 10: se guarda la versión exacta del texto firmado),
`otorgado_en`, `revocado_en`, **`menor_oido_en date`** (art. 9.3), documento.

> **`menor_oido_en` es una fecha y no hay booleano.** La «casilla con fecha» del ADR-028 se
> representa con la presencia de la fecha. Además, un `menor_oido boolean` haría fallar la
> comprobación obvia del criterio 10 sobre `information_schema.columns`.

**`consentimiento_firmantes`** (los «N firmantes») — nombre, `representante_id` o
`paciente_id` (`check` de que hay uno), `firmado_en` (nulo = pendiente) y
**`documento_justificativo_ruta`**: la resolución judicial o la guarda exclusiva que excusa
la segunda firma **se adjunta, no se declara**.

Tabla hija en lugar de un `jsonb`: un array no admite FK, ni índice, ni comprobar que el
firmante existe. Es la única forma de que «N firmantes» sea un hecho de la base.

#### 2.8 Paciente clínico

**`episodios_asistenciales`** — `paciente_id`, `profesional_id`, `centro_id`,
`modalidad_relacional`, `motivo_consulta`, `abierto_en`, **`cerrado_en`**, `motivo_cierre`.
Comentario obligatorio: **`cerrado_en` arranca el reloj de retención**, y se computa en la
zona del centro (ADR-034 §7).

**`episodio_participantes`** (ADR-030) — `episodio_id`, `paciente_id`, `papel`, `alta_en`,
`baja_en`; único por episodio y paciente mientras no haya baja. `papel` es texto libre
validado y **no un enum**: los papeles de una familia no forman lista cerrada y un enum
sería una migración por cada caso nuevo, sin gobernar ninguna política.

**`diagnosticos`** (decisión 7) — `episodio_id`, **`paciente_id`** (en un episodio conjunto
el diagnóstico es de **una** persona: sin esta columna no se puede ni escribir ni
proteger), `cie10es_codigo` y descripción, `dsm5tr_*` paralelos, `principal`,
`diagnosticado_en`, `diagnosticado_por`, `retirado_en`.

El **catálogo precargado** de CIE-10-ES **no entra aquí**: no está en el ticket ni en
§Dominios. Se anota en `docs/state.md` para el ticket de historia clínica de fase 1.

**`valoraciones_riesgo`** — `nivel public.nivel_riesgo not null`, **`indicador boolean
generated always as (nivel <> 'bajo') stored`** (decisión 6: «columna derivada, nunca el
dato»; T-002 la expondrá al técnico con `grant select (columnas)`), `descripcion`,
`plan_seguridad`, `valorado_en`, `valorado_por`. **Sin `update` en los grants**: corregir
una valoración es **añadir otra**.

#### 2.9 Notas (ADR-027, 035, 036)

**`notas_clinicas` — cabecera MUTABLE**: `paciente_id`, `episodio_id`, `autor_id`,
`fecha_sesion`, **`borrador_contenido jsonb`**, **`borrador_actualizado_en`**,
**`borrador_autor_id`**, `creada_en`. `check` todo-o-nada entre las tres de borrador.

- Disparador `fn_tocar_borrador()`: si el borrador cambia, fija
  `borrador_actualizado_en = now()`. Convierte la columna en testigo monótono y hace que el
  **bloqueo optimista** del ADR-036 (`update ... where borrador_actualizado_en = <esperado>`
  → 0 filas = conflicto) sea fiable sin confiar en el cliente.
- **Sin columna `estado`**: pendiente/borrador/firmada/modificada se derivan del borrador y
  del recuento de versiones. Una columna de estado sería una segunda verdad que se
  desincroniza en silencio; y la bandeja no la necesita porque lee
  `alertas_documentacion` (choque 11).
- **Sin cerrojo de solo adición**: es mutable a propósito. Criterio 11.

**`notas_clinicas_versiones` — SOLO ADICIÓN**

| Columna | Tipo | Restricción / porqué |
|---|---|---|
| `nota_id` | `uuid` | `not null` |
| `numero_version` | `integer` | `>= 1`, único por nota |
| `cuerpo` | **`text`** | `not null`, `check (jsonb_typeof(cuerpo::jsonb) = 'object')` |
| `anotaciones_reservadas` | **`text`** | nulable (ADR-027: el valor por defecto correcto es vacío) |
| `contenido_canonico` | **`text`** | `not null` — **el sobre** JCS/NFC completo |
| `huella` | `bytea` | `not null`, 32 bytes, **único** |
| `huella_anterior` | `bytea` | `not null`, 32 bytes (32 ceros en el primer eslabón) |
| `algoritmo_version`, `esquema_version` | `smallint` | `not null default 1` |
| `motivo_cambio` | `text` | obligatorio salvo en la versión 1 |
| `alcance` | `alcance_nota` | `not null default 'individual'` |
| `autor_id`, `creada_en` | | `not null` |

> **`cuerpo` y `contenido_canonico` son `text`, no `jsonb`, y esto no es negociable.**
> `jsonb` reordena claves, normaliza números y descarta el espaciado: guardar ahí el
> contenido destruiría exactamente los bytes que el ADR-035 manda sellar, y el verificador
> de T-005 no podría distinguir eso de una manipulación. La columna **es** el JSON canónico
> en UTF-8. El `check` con `::jsonb` valida que sea JSON sin guardarlo como tal.

- `alcance` vive **solo aquí**, no en la cabecera: duplicarlo daría dos verdades.
  Consecuencia cubierta con disparador: si `alcance = 'conjunta'`, la cabecera debe tener
  `episodio_id` (ADR-030).
- **Tres capas de solo adición**, reutilizando `public.fn_impedir_modificacion()` de T-000:
  `revoke` a todos los roles incluido `postgres`; disparador `before update or delete
  for each row`; disparador `before truncate for each statement`.
- **Ningún cálculo de huella aquí.** Ni disparador que encadene, ni `default`. T-005.

#### 2.10 Evaluaciones e informes

`evaluaciones` (instrumento, aplicación, `puntuaciones jsonb`, interpretación);
`evaluacion_archivos` (`ruta` única, nombre original, MIME, tamaño, quién y cuándo);
`informes` (`tipo`, destinatario, `version`, contenido, emisión y entrega, autor).

> **No se crea ningún bucket de Storage** ni políticas de Storage: no está en el ticket.
> `ruta` es la referencia y basta. Anotar en `state.md`.

Las **firmas en dos capas** (decisión 9) y la huella del informe son de su ticket de fase 1.

#### 2.11 `accesos_historia` (ADR-037) — la única tensión del ticket, resuelta

El ticket pide dos cosas que no caben juntas en una tabla: **«contador de vistas»** y
**«`update` sobre `accesos_historia` falla»**. Un contador que se incrementa es un
`UPDATE`, y el invariante 2 lo prohíbe con tres cerrojos, `postgres` incluido.

**Resolución, sin tocar ninguna decisión cerrada**: la apertura y las repeticiones son dos
filas distintas, las dos de solo adición.

- **`accesos_historia`** — una fila por **apertura**: `perfil_id`, `paciente_id`, `tipo`,
  `pestana`, `desbloqueo_id`, `iniciado_en`, `ip`, `agente`, `justificacion`, con
  `check` que **exige justificación cuando `tipo = 'emergencia'`** (decisión 5).
  Índice **único** `(desbloqueo_id, paciente_id, pestana) where desbloqueo_id is not null`
  ← es lo que convierte «aperturas repetidas dentro de la ventana son un solo acceso» en un
  hecho de la base: la Server Action hace `insert ... on conflict do nothing` y, si no
  insertó, registra una vista.
- **`accesos_historia_vistas`** — una fila por repetición (`acceso_id`, `ocurrido_en`).
  También de solo adición, también con los tres cerrojos.
- **`accesos_historia_resumen`** — vista `with (security_invoker = true)` que devuelve el
  acceso más `1 + count(vistas)` como **`vistas`**. Es el «contador» del ticket, calculado
  y no almacenado. **`security_invoker` es obligatorio**: sin él la vista leería con los
  privilegios de su propietario y saltaría la RLS que T-002 va a poner debajo.

*Descartado*: permitir el `UPDATE` del contador exceptuando columnas en el disparador.
Rompe el criterio explícito y, peor, convierte «solo adición» en «solo adición con
matices», que es como se pierde un invariante.

#### 2.12 `alertas_documentacion` (choque 11 + ADR-036)

Mutable, y **jamás contiene contenido clínico** — es lo que permite que la bandeja y las
métricas vivan fuera del candado. `paciente_id`, `profesional_id`, `centro_id`, `tipo`,
`origen_tabla` (`check` sobre cuatro tablas), `origen_id` **sin FK** (apunta a cuatro
tablas distintas), `fecha_referencia`, `estado`, `resuelta_en`. Única por origen y tipo
mientras esté abierta.

`comment on table`: **prohibido** añadir aquí motivo de consulta, diagnóstico, nivel de
riesgo o texto de nota. Si una alerta necesitara eso, la alerta está mal planteada. Quién
la rellena es de fase 1.

#### 2.13 Funciones

| Función | Volatilidad / seguridad | Qué hace |
|---|---|---|
| `es_zona_iana(text) → boolean` | `stable`, invoker | `exists` en `pg_timezone_names` **y** contiene `/` **y** no empieza por `posix/` **ni** por `Etc/` |
| `fn_validar_zona_horaria()` | trigger, invoker | Genérica: lee la columna que llega en `TG_ARGV[0]`. Se cuelga de `organizacion` y `centros`, y **se reutiliza tal cual en `series_cita` y `citas`** en fase 1 |
| `zona_horaria_centro(uuid) → text` | `stable`, definer | `coalesce(centro, organizacion, 'Europe/Madrid')`. Nunca nulo |
| `retencion_efectiva(uuid) → table` | `stable`, definer | **Siempre exactamente una fila y nunca nulos**; `origen` ∈ `centro` \| `organizacion` \| `predeterminado` |
| `capacidad_consentimiento(uuid, date) → table` | `stable`, **invoker** | `edad >= 16` → `quien='paciente'`; `< 16` → una fila por representante vigente con patria potestad y `requiere_audiencia_menor = (edad >= 12)`; sin fecha de nacimiento → `quien='desconocida'` |
| `fn_impedir_baja_ultimo_administrador()` | trigger, definer | §2.4 |
| `fn_pin_no_para_tecnico()` | trigger, definer | §2.6 |
| `fn_normalizar_fusion_paciente()` / `fn_repuntar_fusionados()` | trigger, definer | §2.7 |
| `fn_impedir_borrado_politica_organizacion()` | trigger, definer | §2.3 |
| `fn_tocar_borrador()` | trigger, invoker | §2.9 |
| `fn_exigir_episodio_en_nota_conjunta()` | trigger, definer | §2.9 |
| `fn_impedir_modificacion()` | ya existe (T-000) | Se reutiliza sin tocarla |

**`capacidad_consentimiento` es `security invoker` a propósito**, al revés que
`rol_actual()`: no rompe ninguna recursión, y como `definer` saltaría la RLS de `pacientes`
y `representantes_paciente` y convertiría una función de cálculo en una puerta trasera de
lectura.

`revoke execute ... from public` en todas. `grant execute to authenticated` **solo** en
`zona_horaria_centro`, `retencion_efectiva` y `capacidad_consentimiento`.

#### 2.14 RLS y grants

`enable row level security` en las 20 tablas nuevas, **sin una sola política**.

Grants **después** de un `revoke all ... from public, anon, authenticated, service_role`
explícito — aunque `pg_default_acl` diga que ya nacen limpias: es lo que hace que «ni un
grant a `anon`» sea un hecho verificable y no una suposición sobre el catálogo.

Lo que no es obvio: `pines_historia` **nada**; `desbloqueos_historia` solo `select`;
`valoraciones_riesgo`, `notas_clinicas_versiones`, `evaluacion_archivos`,
`accesos_historia` y `accesos_historia_vistas` solo `select, insert`;
`alertas_documentacion` `select, update`. **Cero `delete` en toda la migración. Cero
`grant` a `anon` y a `service_role`.**

Y las dos líneas de saneamiento:

```
alter default privileges in schema public revoke all on tables    from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;
```

La segunda es **nueva** y la justifica el hallazgo de `pg_default_acl`: `UPDATE` sobre una
secuencia habilita `nextval`/`setval`, y `auditoria`, `accesos_historia` y
`accesos_historia_vistas` usan `identity`. Se anota en `docs/state.md`.

### 3 · Ficheros

| Ruta | Qué |
|---|---|
| `supabase/migrations/<sello>_esquema_base_organizacion_paciente_historia.sql` | **Crear.** Todo lo anterior, en el orden de §2 |
| `scripts/t001-esquema.sql` | **Crear.** Verificación de los criterios 3 a 14, a imagen de `scripts/t000-rls.sql` |
| `lib/supabase/tipos-bd.ts` | **Regenerar** con `npm run tipos`. No se edita a mano |
| `docs/state.md` | **Actualizar** al cerrar: hallazgos y aprendizajes |
| `tickets/T-001-esquema-base.md` | Marcar tareas y criterios con su evidencia |

**No se toca** `supabase/seed.sql` (es T-008), ni `app/`, ni `proxy.ts`, ni
`package.json`. El paseo vertical debe seguir funcionando **sin tocar el código de la
pantalla**: es el criterio manual 3.

### 4 · Alternativas descartadas

| Descartada | Por qué |
|---|---|
| `check` de zona horaria en la columna | `pg_timezone_names` es catálogo volátil y una `check` no admite subconsulta; envolverla en una función `immutable` sería mentir al planificador y a `pg_dump`, y un cambio de tzdata rompería una restauración. **Disparador** |
| Validar la zona solo con «existe en `pg_timezone_names`» | Verificado: aceptaría `'CET'` y `'Etc/GMT+2'`, prohibidos por el ADR-034 |
| `politicas_retencion` colgando de `organizacion` | ADR-033: dos centros, dos mínimos; migración al entrar el segundo |
| Que `retencion_efectiva` devuelva nulo | El criterio dice «nunca nulo». Fila semilla + `coalesce` + veto de borrado |
| Bandera `es_menor` | ADR-028: estaría mal el día del decimoctavo cumpleaños y nadie se enteraría |
| `cuerpo`/`contenido_canonico` como `jsonb` | Destruiría los bytes canónicos del ADR-035 y volvería inútil el verificador de T-005 |
| Columna `estado` en `notas_clinicas` | Segunda verdad frente al borrador y a las versiones |
| Contador de vistas mutable en `accesos_historia` | Rompe el invariante 2 y el criterio 11 |
| `grant insert/update` de `desbloqueos_historia` a `authenticated` | Un cliente fabricaría un desbloqueo por PostgREST sin teclear el PIN |
| `jsonb` de firmantes | Sin FK, sin índice y sin comprobar que el firmante existe |
| Enum para `episodio_participantes.papel` | Lista no cerrada que no gobierna ninguna política |
| `before` trigger para el último administrador | Un relevo en una sentencia fallaría según el orden de las filas |
| Crear el bucket de Storage y el catálogo CIE-10-ES | Fuera del alcance (constitución, regla 2): se anotan en `state.md` |

### 5 · Verificación, criterio a criterio

Preparación: `npx supabase db reset` y `npm run tipos`. El guion se ejecuta con
`docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t001-esquema.sql`,
en transacción con `rollback`; los perfiles de prueba exigen crear antes sus filas en
`auth.users` dentro de la misma transacción.

| # | Comprobación exacta | Esperado |
|---|---|---|
| 1 | `db reset` + `npm run tipos` | `Finished supabase db reset.` sin `ERROR:`; `git diff --stat` del fichero de tipos no vacío |
| 2 | `npm run lint`; `npm run build` | Sin salida / sin errores. Son dos, `build` ya no lintea |
| 3 | Dos `insert` en `organizacion` | El segundo viola el único de `fila_unica` |
| 4 | `insert` en `centros` con `'CEST'`, `'+02:00'`, `'Atlantic/Canary'` | Los dos primeros `22023`; el tercero pasa. **Añadir `'CET'` y `'Etc/GMT+2'`: también fallan** (ADR-034), aunque el ticket no los pida |
| 5 | `retencion_efectiva` con centro sin política, uuid inexistente y `null` | Tres veces una fila, `origen='organizacion'`, sin nulos. Con política propia: `origen='centro'` |
| 6 | Bajar `anios_historia_clinica` a 3 con mínimo 5 | Viola la `check` |
| 7 | Técnico sin centro / con centro / profesional sin centro | Falla / pasa / pasa |
| 8 | Baja del último admin; con dos admins; **también con `delete` y con cambio de `rol`** | Excepción `23514` / pasa |
| 9 | Dos identificaciones con el mismo `dni_indice` | Viola el índice único |
| 10 | `capacidad_consentimiento` a los 15 y a los 16 con **una sola** fila de representante; después, recuento de columnas `boolean` cuyo nombre huela a minoría de edad | `representante` / `paciente`, y `0`. **La comprobación no puede ser un `like '%menor%'` a secas**: `consentimientos.menor_oido_en` existe y es legítima — por eso es `date` y por eso el filtro incluye `data_type='boolean'` |
| 11 | `A→B`; luego `C→A`; luego `B→D` | `C.fusionado_en = B` (normalizado); tras el tercer paso `A→D` y `C→D`. General: cero filas cuyo superviviente esté a su vez fusionado |
| 12 | Como `postgres`: `update`/`delete`/`truncate` en las tres tablas de solo adición, antes y después de conceder privilegios a la fuerza; y `update` en `notas_clinicas` y `desbloqueos_historia` | `permission denied` → 42501 del disparador → 42501 en truncate; `UPDATE 1` en las dos mutables |
| 13 | `set local role authenticated; select * from pines_historia` | `permission denied` (42501) |
| 14 | Recuento de tablas de `public` sin RLS | `0` |
| M2 | `\dp` en Studio | Ninguna fila con `anon=`; `pines_historia` sin ACL salvo el propietario |
| M3 | Paseo vertical con `ana@psicogestion.test` | Funciona sin tocar `app/` |

### 6 · Riesgos, por orden de probabilidad

1. **Los `grant` olvidados.** Verificado en `pg_default_acl`: desde T-000 las tablas nuevas
   nacen **sin nada** para `authenticated`. El síntoma es `permission denied` y el instinto
   será tocar RLS, que aquí ni existe. Ante ese error: mirar `\dp`, no las políticas. Es el
   riesgo nº 1 igual que en T-000, y ahora con veinte tablas.
2. **`cuerpo`/`contenido_canonico` declarados `jsonb`.** Es lo que un agente hará por
   reflejo; la migración pasará verde y el daño solo aparecerá en T-005, sobre datos ya
   sellados. Irreparable por definición.
3. **Un cerrojo de solo adición a medias.** Tres capas × tres tablas = nueve piezas. La que
   más se olvida es la de `truncate`, porque no la caza ninguna prueba que no la pruebe
   explícitamente.
4. **La comprobación del criterio 10 mal escrita.** Un `like '%menor%'` da falso positivo
   con `menor_oido_en` y hace parecer roto lo que está bien.
5. **`check` de zona horaria en vez de disparador.** Postgres rechaza la subconsulta, y la
   salida cómoda —una función `immutable` mentirosa— pasa la migración y rompe una
   restauración meses después.
6. **`dni_indice` único frente a los duplicados del importador.** Consecuencia aceptada del
   ADR-029: dos fichas del mismo paciente no pueden tener ambas identificación con el mismo
   documento. Debe quedar en el comentario de tabla y en `state.md`, porque el importador
   de v1 se topará con ello el primer día.
7. **FK cruzada `consentimientos.episodio_id`.** Si se declara en línea, la migración
   falla. Va en el bloque de referencias cruzadas.
8. **`npm run tipos` con la base desactualizada.** `db reset` y `npm run tipos` van siempre
   juntos. Si el fichero regenerado rompiera el lint, la salida aprobada es
   `globalIgnores`.
9. **`force row level security` sobre `perfiles`.** Reintroduce la recursión de
   `rol_actual()`.
10. **Un `not null` sin `default` en `pacientes` o `perfiles`.** Rompería el alta de T-000
    y el criterio manual 3.

### 7 · Puntos abiertos — **aprobados por el propietario el 22-08-2026**

Los cuatro, tal cual los propuso el arquitecto. Los tres primeros cambian una columna; el
cuarto obliga a subir dos tablas al destilado al cerrar el ticket.

| # | Punto | Resolución |
|---|---|---|
| a | Escala de `nivel_riesgo` | `bajo`, `moderado`, `alto`, con `indicador = (nivel <> 'bajo')`. Añadir valores a un enum después es barato; quitarlos no |
| b | Dónde vive la ventana configurable del PIN | `organizacion.minutos_desbloqueo_historia`, ajuste del administrador. **Descartado** ponerlo en `preferencias_usuario`: que cada usuario alargue su propio candado vacía el control |
| c | «Vigencia desde/hasta obligatoria» del representante | `vigente_desde not null`, `vigente_hasta` nulable. El ADR-028 dice que a los 18 la representación «caduca sola» —se calcula—, y el criterio 10 exige que **la misma fila** sirva a los 15 y a los 16. Un `vigente_hasta not null` obligaría a teclear una fecha ficticia: la bandera `es_menor` disfrazada |
| d | `consentimiento_firmantes` y `accesos_historia_vistas`, que no están en §Dominios | Aprobadas. **Se añaden a `docs/architecture.md` §Dominios de datos al cerrar el ticket**, con la nota de que son de solo adición o hijas de una que lo es |

---

## Resultado de la implementación (22-08-2026)

**Los quince criterios de aceptación pasan.** Todos con salida real del comando, recogida
arriba criterio a criterio. Guion reproducible:

```
npx supabase db reset
npm run tipos && npm run lint && npm run build
docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t001-esquema.sql
```

### Ficheros

| Ruta | Qué |
|---|---|
| `supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql` | Creada. 22 tablas, 1 vista, 12 enums, 12 funciones, 16 disparadores |
| `scripts/t001-esquema.sql` | Creado. Verificación de los criterios 3 a 14 |
| `lib/supabase/tipos-bd.ts` | Regenerado con `npm run tipos` |

### Pendiente de verificación manual

Los tres puntos del «Guion de comprobación manual», al detalle:

1. `db reset` + `npm run tipos` — **hecho**, salida arriba.
2. `\dp` en Studio — **no ejecutado en Studio**, pero comprobado por consulta equivalente
   sobre `information_schema.role_table_grants`: cero concesiones a `anon` y a
   `service_role` en todo `public`, y `pines_historia` sin ACL salvo el propietario.
3. Paseo vertical en `/pacientes` con `ana@psicogestion.test` — **no ejecutado en
   navegador**. Comprobado a nivel de base: el `insert` de T-000 con columnas explícitas
   bajo RLS como Ana sigue devolviendo la fila, el `select id, nombre, apellidos,
   creado_en` sigue funcionando, y ninguna columna nueva de `pacientes` ni de `perfiles`
   es `not null` sin `default` (recuento = 0). **Queda por confirmar en navegador.**

### Hallazgos que el diseño no anticipó

1. **`accesos_historia_vistas` no puede llevar clave ajena a `accesos_historia`.** La
   comprobación de integridad referencial corre como propietario (`postgres`, que en
   Supabase local **no es superusuario**) y necesita bloquear la fila padre con
   `FOR KEY SHARE`, lo que exige `UPDATE` o `DELETE` sobre el padre — justo lo que la
   capa 1 del cerrojo de solo adición le revoca. Con la clave ajena, **ningún rol podía
   insertar jamás una vista**, y el mecanismo del §2.11 del diseño quedaba muerto. Se
   quita la clave ajena y se conserva la columna, exactamente como T-000 hizo con
   `auditoria.actor_id`. Los tres cerrojos quedan intactos. Documentado en la propia
   migración.
2. **Borrar una fila de `perfiles` o de `pacientes` es ahora imposible para cualquier
   rol**, por la misma mecánica: `notas_clinicas_versiones` y `accesos_historia` los
   referencian y la comprobación referencial no puede tomar el bloqueo. Es coherente con
   el proyecto («la baja no borra»), pero afecta al `on delete cascade` desde
   `auth.users`: **borrar un usuario de Auth fallará** si tiene notas o accesos. Lo
   recoge `docs/state.md` para T-006 y T-008.
3. **`es_zona_iana()` y `authenticated`.** El `execute` de una función de disparador se
   comprueba al crear el disparador, no al dispararlo, así que las `fn_*` no necesitan
   `grant`; pero `fn_validar_zona_horaria()` es *security invoker* y llama a
   `es_zona_iana()` en tiempo de ejecución. Hoy da igual —sin política RLS de escritura,
   nadie salvo `postgres` escribe en `centros` ni en `organizacion`—, pero **T-002 debe
   conceder `execute` de `es_zona_iana()` a `authenticated` o hacer el disparador
   *definer***. Anotado en la migración y en `docs/state.md`.

---

## Ronda de revisión (22-08-2026) — cuatro altos y tres medios, corregidos

Todo se arregla **en la misma migración**, no en una nueva: T-001 no se había integrado
todavía, así que sigue siendo una sola migración hacia delante.

| # | Sev | Hallazgo | Corrección | Prueba nueva |
|---|---|---|---|---|
| 1 | Alta | `fn_normalizar_fusion_paciente()` leía el destino sin bloquearlo: dos fusiones concurrentes se cruzaban y creaban la cadena de dos saltos que el tope de 50 no caza | `for no key update` en el recorrido | **R1** |
| 2 | Alta | El suelo de retención comparaba dos columnas **ambas editables**, con `grant update` a `authenticated`: bajar las dos a 1 año pasaba | `constraint politicas_retencion_suelo_legal check (anios_minimo_legal >= 5)` | **R2** |
| 3 | Alta | La fila de retención de la organización se podía **mover** con `update ... set centro_id`, y entonces todos los centros caían en silencio a los 25/5 del `coalesce` | El disparador pasa a `before delete or update of centro_id`, y la función distingue las dos operaciones | **R3** |
| 4 | Alta | `notas_clinicas.paciente_id` y `.fecha_sesion` eran editables tras sellar; como el sobre canónico no los incluye, una versión firmada se reatribuía a otro paciente **sin romper la cadena de huellas** | `fn_congelar_cabecera_sellada()`, disparador `before update of paciente_id, fecha_sesion` | **R4** |
| 5 | Media | El índice de la ventana de acceso no deduplicaba con `pestana` nula | `nulls not distinct` | **R5** |
| 6 | Media | Un consentimiento otorgado podía quedarse sin `texto_firmado`, y eso no tiene backfill | `constraint consentimientos_otorgado_exige_texto` | **R6** |
| 7 | Media | `es_zona_iana()` sin `execute` para `authenticated` | Concedido | **R7** |

### Salida real de las siete pruebas nuevas

Cada una con su gemela positiva: una prueba negativa sin control positivo no distingue
«la guarda funciona» de «esto no pasa nunca».

- **R1** — control: la segunda conexión fusiona `A→B` sin esperar (`UPDATE 1`).
  Negativo, con `B→D` abierto en la primera: `ERROR: canceling statement due to lock
  timeout · CONTEXT: while locking tuple (0,19) in relation "pacientes" · SQL statement
  "select p.fusionado_en ... for no key update" · PL/pgSQL function
  public.fn_normalizar_fusion_paciente() line 24`. Tras el `rollback`, la misma fusión
  pasa y queda normalizada. `cadenas_de_dos_saltos = 0`, y la limpieza deja
  `pacientes_de_prueba_restantes = 0`.
- **R2** — negativo: `ERROR: ... violates check constraint
  "politicas_retencion_suelo_legal" · DETAIL: Failing row contains (..., 1, 1, ...)`.
  Controles: 5/5 pasa (`UPDATE 1`), y subir el mínimo a 15 pasa (`25 | 15`).
- **R3** — negativo: `ERROR: La política de retención de la organización no se puede
  reasignar a un centro (ADR-033)`. Controles: la fila **sí** deja cambiar sus años
  (`30 | 5 | ` con `centro_id` nulo), y la política de **un centro** sí se puede mover a
  otro centro (`UPDATE 1`). `retencion_efectiva(null)` sigue dando `25 | 5 | organizacion`.
- **R4** — controles: sin versión sellada la cabecera es corregible
  (`04000000-…-0002 | 2026-03-02`), y con versión sellada el **borrador** sigue editable
  (`borrador_editable_tras_sellar = t`). Negativos: `ERROR: La nota … ya tiene versiones
  selladas: paciente_id y fecha_sesion no se pueden cambiar (ADR-035)`, tanto al cambiar
  `paciente_id` como `fecha_sesion`.
- **R5** — negativo: dos `insert ... on conflict do nothing` con `pestana` nula dan
  `INSERT 0 1` y `INSERT 0 0` → `filas_con_pestana_nula = 1`. Controles: dos pestañas
  distintas → `2`; sin desbloqueo (el índice es parcial) → `2`, que es lo correcto.
- **R6** — negativos: `ERROR: ... violates check constraint
  "consentimientos_otorgado_exige_texto"`, tanto sin texto como con texto y sin versión.
  Controles: con texto y versión pasa (`asistencial | v3 | t`), y un consentimiento
  preparado y sin otorgar no exige texto (`asistencial | t`).
- **R7** — control: como `authenticated`, `es_zona_iana('Europe/Madrid') = t` y
  `es_zona_iana('CET') = f`. Contraste: `has_function_privilege` da `es_zona_iana = t`,
  `zona_horaria_centro = t`, `fn_tocar_borrador = f`, `fn_congelar = f`. Y el disparador
  sigue rechazando `'CET'` **también desde `authenticated`**, que antes ni llegaba.

### Dos sub-pruebas que se reescribieron por vacías

Los bloques de R2 y R3 «como `authenticated`» devolvían `UPDATE 0`, no un error: con RLS
activo y **sin ninguna política hasta T-002**, `authenticated` ni siquiera ve la fila, así
que el `update` nunca llega a la restricción. Estaban en verde por el motivo equivocado.
Ahora están etiquetados como **contexto, no prueba**, y junto a ellos se lista
`pg_constraint` / `pg_trigger` para dejar claro lo que sí sostiene la guarda para
cualquier rol: que es una restricción **de tabla**, no un privilegio.

### Además, dentro del mismo alcance

- **Siete índices de clave ajena**, los que T-002 va a poner en el `using` de una política
  más el de la fusión: `episodios_asistenciales.profesional_id`,
  `episodio_participantes.paciente_id`, `notas_clinicas.autor_id`,
  `notas_clinicas.episodio_id`, `pacientes.fusionado_en` (parcial),
  `pacientes.centro_id`, `perfiles.centro_id`. Verificado: los siete existen.
  Las ~23 restantes se quedan sin índice a propósito y con su razón escrita.
- **Corregido el comentario de `valoraciones_riesgo`**, que prometía un
  `grant select (columnas)` imposible en Supabase: los tres roles comparten el rol
  `authenticated`, así que T-002 necesitará una vista aparte para el técnico.

### Lo que sigue anotado y NO se toca aquí

- `accesos_historia_vistas.acceso_id` sigue sin clave ajena por la razón ya documentada;
  lo que falta es que **T-002 lo ate con un `with check`**, porque la base ya no lo
  garantiza y un huérfano aquí no se podría borrar.
- Borrar un perfil o un paciente es imposible **siempre**, no «si tiene notas o accesos»:
  reproducido con la base entera vacía (`versiones = 0`, `accesos = 0`) sobre un paciente
  recién insertado.
- `pacientes.centro_id` nace nulo (`pacientes_totales = 2, con_centro = 0`); el criterio
  de relleno para T-002 está escrito en `docs/state.md`.
