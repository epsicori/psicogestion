# T-040 · Diseño — capa de exportación clínica (copia cifrada de la nota con todas sus versiones)

**Riesgo alto** · arquitecto, 02-10-2026 · contrato: `tickets/T-040-capa-de-exportacion-clinica.md`.

La tabla de quién puede exportar la decidió el propietario el 02-10-2026 (Q-C1 = D-a, Q-C2) y aquí no
se reabre. Este diseño la aplica tal cual.

Orden de lectura:
- **A.** El ADR de cifrado (propuesta de texto), que va antes que el código.
- **B.** Las preguntas para el propietario. El diseño sigue cada recomendación.
- **C.** Los tres abiertos del contrato, cerrados.
- **§0-§7.** El diseño.
- **Final.** «Lo que no entra».

**Precondiciones de implementación**: T-015 integrado en `main`, con `notificaciones.titulo`,
`origen_tabla`, `origen_id`, el índice `notificaciones_origen_unico` y el espacio i18n
`notificaciones.tipos.*`. Antes de escribir la migración se vuelve a comprobar el §0 contra `main`.
La cola es T-028a → T-015 → T-039 → T-038 → T-040.

---

## A · ADR de cifrado: propuesta de texto

El fichero lo escribe el implementador:
- `docs/decisions/ADR-0NN.md`, con el siguiente número libre al implementar. Hoy es ADR-076, pero
  T-041 se diseña en paralelo y puede tomarlo antes.
- Su fila en `docs/decisions.md` y en `docs/decisions/INDEX.md`.

El texto, salvo el número y la fecha, es este:

> # ADR-0NN · La copia clínica descargable es un HTML que se descifra solo: Argon2id + AES-256-GCM, y se abre con el navegador
>
> **Estado**: aceptada · **Fecha**: (la de integración) · **Contexto**: diseño de T-040 ·
> **Continúa** la decisión fundacional 4. **Sustituye** el contenedor y la entrega que describe el §5.4 del
> documento maestro: PDF o ZIP AES-256, URL firmada de vida corta y destrucción a las 24 h.
>
> ## Contexto
>
> La decisión 4 dice que las copias descargables van cifradas con una contraseña del usuario. La clave se
> deriva con Argon2id, se cifra con AES-256, la contraseña no se guarda jamás y no hay recuperación. El §5.4 del
> maestro pide además un PDF o un ZIP que abra un lector estándar.
>
> Las dos cosas no caben juntas en un fichero pasivo:
> - **El PDF cifrado estándar** (ISO 32000-2, manejador estándar revisión 6, AES-256) deriva la clave con su
>   propio algoritmo: el 2.B, una iteración de SHA-256/384/512. Ningún lector de PDF acepta otra derivación.
> - **El ZIP con AES** (WinZip AE-2) usa PBKDF2-HMAC-SHA1 con 1000 iteraciones. Los descompresores que
>   traen los sistemas no lo abren de forma fiable.
> - **Ningún formato pasivo** que abra un lector estándar deriva la clave con Argon2id.
>
> Elegir PDF es enmendar la decisión 4: cambiar Argon2id por una derivación mucho más barata de atacar con
> fuerza bruta. Además, el proyecto no tiene ninguna biblioteca de PDF ni de ZIP.
>
> ## Decisión
>
> 1. **El fichero es un único `.html` autodescifrable**, de formato `psicogestion.copia-nota` versión 1.
>    Lleva cuatro partes:
>    - **una cabecera en claro, sin ningún dato**:
>      - `formato` y `formato_version`;
>      - `cifrado = "argon2id-aes-256-gcm"`;
>      - los parámetros de Argon2id y su sal;
>      - el nonce;
>    - **la carga cifrada**: el JSON de la copia, en base64;
>    - **los textos genéricos** de la pantalla de apertura;
>    - **el visor**: JavaScript escrito en el propio fichero, sin red y sin nada que instalar.
> 2. **La derivación.**
>    - Algoritmo: Argon2id (RFC 9106), versión 0x13.
>    - Parámetros: m = 65 536 KiB (64 MiB), t = 3, p = 1, clave de 32 bytes.
>    - Sal aleatoria de 16 bytes por fichero.
>    - Entrada: la contraseña normalizada a NFC y codificada en UTF-8. Así, la misma contraseña tecleada en
>      sistemas distintos da la misma clave.
> 3. **El cifrado.**
>    - Algoritmo: AES-256-GCM, con nonce aleatorio de 12 bytes y etiqueta de 128 bits.
>    - Datos asociados (AAD): los bytes exactos de la cabecera. Si alguien cambia los parámetros o la sal, el
>      fichero no abre.
> 4. **Nada identificable fuera del cifrado.**
>    - El nombre del paciente, el texto clínico, el motivo y la proyección van solo dentro de la carga cifrada.
>    - El nombre del fichero no lleva el nombre del paciente.
>    - Fuera del cifrado, todos los ficheros son iguales salvo la sal, el nonce y el texto cifrado.
> 5. **La contraseña no sale del navegador de quien exporta.**
>    - El servidor entrega la proyección ya recortada.
>    - El navegador deriva la clave, cifra, calcula la huella SHA-256 del fichero, la registra y lo descarga.
>    - El servidor nunca recibe la contraseña ni compone el fichero.
>    - No se guarda nada en Storage. Por eso no hay URL firmada ni destrucción a las 24 h: no hay nada que
>      destruir.
> 6. **El lector es el navegador.**
>    - Cualquier versión actual de Edge, Chrome, Firefox o Safari, sin conexión.
>    - El visor pinta el contenido solo con `textContent`, nunca con `innerHTML`.
>    - Una `Content-Security-Policy` en el propio fichero le niega toda conexión de red.
> 7. **La contraseña.**
>    - Mínimo 12 caracteres y máximo 256. Se escribe dos veces.
>    - Quien exporta confirma expresamente que sin ella nadie, tampoco la consulta, podrá abrir la copia.
>    - No se guarda, no se registra y no se envía.
> 8. **Los parámetros viven en `formato_version`.**
>    - Cambiarlos es un formato nuevo.
>    - Cada fichero lleva su propio visor, así que los ficheros antiguos siguen abriendo.
>
> ## Consecuencias
>
> - **Se gana**:
>   - la decisión 4 se cumple al pie de la letra;
>   - se abre sin instalar nada;
>   - no entra ninguna dependencia;
>   - la contraseña no toca el servidor;
>   - no queda ningún fichero que custodiar ni borrar.
> - **Se pierde**:
>   - no es un PDF;
>   - algunas pasarelas de correo bloquean adjuntos `.html`;
>   - con JavaScript desactivado no abre;
>   - derivar la clave tarda unos segundos, más en un móvil viejo;
>   - el Argon2id del visor es código propio. Se mitiga con pruebas que lo cotejan byte a byte con el
>     Argon2id nativo de Node;
>   - imprimir desde el navegador produce una copia en claro, que es responsabilidad de quien imprime, y se
>     le avisa.
> - **Queda bloqueado**:
>   - guardar el fichero o la contraseña en el servidor;
>   - bajar los parámetros de Argon2id sin subir `formato_version`;
>   - pintar contenido descifrado con `innerHTML`;
>   - sacar del cifrado cualquier dato del paciente o de la nota.

---

## B · Preguntas para el propietario

El diseño sigue la recomendación de cada una. Si alguna respuesta es otra, cambian los apartados que se
indican y nada más.

**P1 · El formato de la copia.**
- (a) **HTML autodescifrable**, Argon2id + AES-256-GCM, que se abre con el navegador. Es el ADR de A.
- (b) **PDF 2.0 con AES-256 estándar**. Abre en cualquier lector de PDF, pero la derivación no es Argon2id.
  Hay que enmendar la decisión 4, escribir a mano un generador de PDF con fuentes y cifrado R6 (no hay
  biblioteca en el proyecto) y probarlo con una herramienta externa.
- (c) Las dos.

**Recomendación: (a).** Es la única que cumple la decisión 4 sin enmendarla, y la única que deja la
contraseña fuera del servidor. Si se elige (b), cambian el ADR, `lib/exportaciones/{nucleo-js,visor-js,fichero,cifrar}.ts`
y la entrega: el cifrado pasaría al servidor y la contraseña viajaría en la petición.

**P2 · Cómo llega el administrador a una nota que no puede leer.** Hoy no llega:
- `listarNotasDelPaciente` va con RLS y al administrador solo le devuelve las suyas
  (`lib/notas/servidor.ts:910-961`);
- abrir `?nota=` de otro le da `no_disponible`.

El contrato pone el botón «en la vista de la nota». Las opciones:
- (a) En la pestaña Notas, el administrador ve también las notas firmadas de ese paciente que no puede
  leer, **solo con la fecha de la sesión, el autor y el número de versiones**: ni estado, ni borrador, ni
  alcance, ni texto. Cada una lleva a la vista de la nota, que para él enseña esa cabecera y el botón de
  copia por motivo.
- (b) El administrador no ve la lista. Pide «copia por motivo» de **todas** las notas del paciente desde
  la pestaña. Cambia el alcance de la copia (paciente entero, no nota) y la carga crece con la historia.
- (c) Nada en este ticket: la copia por motivo existe en la base y no tiene pantalla.

**Recomendación: (a).** La fecha y el autor de una sesión ya los ve en la agenda («Agenda: Todas»), y el
contenido no se toca hasta elegir motivo, con traza y aviso. Si se elige (b), cambian `exportar_nota`, que
pasaría a recorrer notas, el formato v1 y la pestaña. Si se elige (c), salen
`notas_para_copia` y las piezas de la pestaña, y el criterio manual del administrador se prueba por SQL.

**P3 · A quién avisa la copia del administrador.** El contrato dice «al profesional titular». El titular
del paciente (`pacientes.profesional_id`) puede no ser el autor de la nota: notas sembradas, coterapia o
un traspaso.

**Recomendación: al titular y, si es otra persona, también al autor.** El secreto profesional es del
autor (decisión 5: «el administrador no lee notas ajenas salvo acceso [...] notificado»). Nunca se avisa a
quien exporta ni a un perfil que no esté activo.

---

## C · Los tres abiertos de §Notas, cerrados

1. **¿El motivo del administrador lleva texto libre?** Sí.
   - Es una **referencia obligatoria** de 3 a 200 caracteres: número de oficio o procedimiento, fecha de la
     solicitud del paciente, profesional de destino del traspaso.
   - Sin ella, la auditoría sabe *por qué* tipo de motivo se exportó, pero no *qué* solicitud lo justifica.
   - Se guarda en `exportaciones.referencia` y en `accesos_historia.justificacion`. **No va en el aviso.**
   - El campo lleva una ayuda: «No escribas datos de salud».
2. **¿El aviso sale por `notificaciones`?** Sí.
   - Es el canal de T-015, que va antes en la cola. Una fila por destinatario (P3), con:
     - `tipo = 'exportacion_por_administracion'`;
     - `origen_tabla = 'exportaciones'`;
     - `origen_id` = el id de la exportación.
   - El `detalle` sigue el criterio de T-015 D13: **sin el nombre del paciente** y sin la referencia.
3. **¿La cabecera nombra al paciente?** Sí, por nombre, apellidos e id, pero **solo dentro de la carga
   cifrada**.
   - Una copia para el paciente, el juez o el profesional que hereda tiene que decir de quién es.
   - Cifrada no expone nada.
   - Fuera del cifrado no hay ni el nombre ni el id. El DNI no va: no hace falta para identificar la copia
     y vive en la ficha cifrada (ADR-060).

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | `tipo_acceso_historia` ya incluye `'exportacion'`. `accesos_historia` tiene `perfil_id`, `paciente_id`, `tipo`, `pestana`, `desbloqueo_id`, `iniciado_en`, `ip`, `agente`, `justificacion` y un id `bigint identity`. Solo `emergencia` exige justificación. | `supabase/migrations/20260822094547_…:82`, `:766-782` |
| H2 | El índice único `accesos_historia_ventana_idx (desbloqueo_id, paciente_id, pestana) nulls not distinct where desbloqueo_id is not null`. Una exportación con `desbloqueo_id` nulo **no** choca con la apertura de la misma ventana. | ídem `:799-802` |
| H3 | `registrar_acceso_historia` es solo para `apertura`. Comprueba el rol o la asignación **antes** del candado y revoca `execute` a `public`. Es el patrón a copiar. | `20260915120000_registrar_acceso_historia.sql` |
| H4 | La política `accesos_historia_alta` admite `desbloqueo_id is null` sin mirar el candado. Una función definer no la atraviesa: tiene que comprobar `historia_desbloqueada()` ella misma. | `20260822160000_rls_funciones_y_politicas.sql:1269-1277` |
| H5 | `es_profesional_asignado(p_paciente_id)` es definer y no mira el rol (un administrador puede ser `profesional_id`). Resuelve la fusión en un salto y exige el perfil activo. `rol_actual()` es nulo si el perfil no está activo. Roles: `administrador`, `profesional_sanitario`, `tecnico_administrativo`. | `20260822160000_…:93-115`, `:38-50`; `20260815192424_…:18-22` |
| H6 | La lectura de notas es: autor, o asignado, o episodio conjunto. El último camino es la «lectura conjunta» (`notas_clinicas_lectura`, `notas_clinicas_versiones_lectura`). | `20260822160000_…:1117`, `:1152`; `es_profesional_del_episodio` `:125`, `nota_tiene_version_conjunta` `:161` |
| H7 | `notas_clinicas_versiones` tiene: `nota_id`, `numero_version`, `cuerpo` (texto JSON `{texto}`), `anotaciones_reservadas`, `contenido_canonico`, `huella` y `huella_anterior` (bytea de 32), `motivo_cambio`, `alcance`, `autor_id`, `creada_en`, y después `paciente_id` y `posicion_cadena`. La cadena es **por paciente**: `huella_anterior` de una versión puede ser la huella de **otra nota**. | `20260822094547_…`; `docs/architecture.md:183-195` (la fuga documentada de `posicion_cadena`) |
| H8 | El sello se lee del sobre (`contenido_canonico`, era 4) con `leerSello`, y la frase sale de `fraseDelSello(s, zona)`. La zona es la de la cita o la de la organización, y si no, `Europe/Madrid`. | `lib/notas/sello.ts:19-87`; `lib/notas/servidor.ts:268-287` |
| H9 | `pacientes.nombre` y `apellidos` están en claro. `perfiles.nombre_completo`, `perfiles.estado`. | `20260815192424_…:28-46`; `20260822094547_…:231` |
| H10 | `episodio_participantes (episodio_id, paciente_id, papel, alta_en date, baja_en date)`; `episodios_asistenciales.modalidad_relacional` (`individual`, `pareja`, `familiar`, `grupo`); `notas_clinicas.fecha_sesion` es `date`. | `20260822094547_…:541-549`, `:63`, `:522`, `:623` |
| H11 | El patrón de solo adición tiene tres capas, el catálogo y la auditoría explícita: `revoke all … from public, anon, authenticated, service_role`; `revoke update, delete … from postgres`; los disparadores `fn_impedir_modificacion` por fila y por sentencia; `insert into tablas_solo_adicion`; y `fn_auditar('clave', …omitidas)`. Una tabla de solo adición **no puede ser destino de una FK** (lo explica el comentario de `accesos_historia_vistas`). | `20260916120000_alta_de_paciente_completa.sql:130-205`; `20260822160000_…:1280-1284` |
| H12 | `lint-migraciones.ts:26` lleva a mano la lista `TABLAS_SOLO_ADICION`. La regla 5 exige sellos estrictamente crecientes. | `scripts/lint-migraciones.ts` |
| H13 | `11-cobertura.sql` exige que toda política de `pg_policies` esté declarada. Una tabla con RLS y **cero políticas** ya tiene precedente comentado allí (`eventos_salientes`). | `scripts/rls/11-cobertura.sql:1-20` |
| H14 | `notificaciones` existe: `perfil_id`, `tipo text`, `detalle`, `creado_en`, `leida_en`. Solo insertan las funciones definer. T-015 le añade `titulo`, `origen_tabla` y `origen_id`, con `check` de que van juntos, y un índice único parcial por origen. | `tickets/T-015/diseno.md:30-36`, `:84-101` |
| H15 | Bancos y sellos en cola: T-015 → `22-avisos.sql` y `20261006120000`; cita en episodio → `23-cita-en-episodio.sql` y `20261007120000`. T-038 usa el banco 13. El siguiente banco libre esperado es el **24**. | `tickets/T-015/diseno.md`, `tickets/T-039/diseno.md` |
| H16 | La pestaña Notas se abre con `abrirPestanaDeHistoria`, que registra el acceso y después `listarNotasDelPaciente` (con RLS). Se pinta en `ListaDeNotas`, a través de `panel-historia.tsx`. | `app/(app)/pacientes/[id]/acciones.ts:72-116`; `lista-de-notas.tsx`; `panel-historia.tsx:20,194,238` |
| H17 | El editor abre con `abrirEditorDeNota`. Registra el acceso **antes** de leer y devuelve `no_disponible` si la RLS oculta la cabecera. `ModeloDeNota` lleva `soyAutor`, `lecturaConjunta` y `versiones`. | `lib/notas/servidor.ts:55-100`, `:464-500` |
| H18 | Las Server Actions de la nota solo envuelven: sesión → Zod → servidor (`historia/notas/acciones.ts`). Las IP y el agente salen de `headers()` y `ipDeLaPeticion`. | `app/(app)/pacientes/[id]/historia/notas/acciones.ts` |
| H19 | Next 16: una Server Action es un POST; su **petición** está limitada a 1 MB, y la respuesta se serializa al cliente («Constrain return values»). | `node_modules/next/dist/docs/01-app/02-guides/server-actions.md:79-91` |
| H20 | No hay CSP en `next.config.ts` ni en `proxy.ts`. No hay biblioteca de PDF, ZIP ni Argon2 en `package.json`. Node local v24.14.1 tiene `crypto.argon2Sync` (desde 24.7). | `next.config.ts`, `proxy.ts`, `package.json`; `node -e` |
| H21 | `sin-literales.test.ts` solo recorre `.tsx` de `app/` y `components/`. Aun así, la convención es que todo texto visible salga de `lib/i18n/es.ts`. | `lib/i18n/sin-literales.test.ts:14-44` |
| H22 | Primitiva de diálogo: `Dialogo({abierto, alCerrar, titulo, focoInicial, children})`. Fallo conocido: `useDevolucionDeFoco` no devuelve el foco si el disparador queda deshabilitado. | `components/ui/dialogo.tsx:9-21`; `docs/state.md:49-52` |
| H23 | El guion de punta a punta con sesión real se ejecuta con `npx tsx scripts/t0NN-*.ts` (patrón de T-012 y T-032). | `scripts/t012-nota.ts:1-30` |

---

## 1 · Piezas y contratos

### 1.1 · Migración `supabase/migrations/<sello>_exportaciones.sql`

**Sello**: posterior a `20261007120000` **y** al último de `main` cuando se implemente. Propuesta:
`20261009120000`, que deja el 08 a T-038 si migra. Se comprueba con `ls supabase/migrations | tail -1`, y
la regla 5 del lint lo exige.

**Tipos**
```sql
create type public.motivo_exportacion as enum
  ('peticion_paciente', 'requerimiento_judicial_o_inspeccion', 'traspaso_caso');
create type public.proyeccion_exportacion as enum ('profesional', 'paciente');
```

**Tabla `public.exportaciones`** (solo adición). Una fila por **copia pedida**, escrita por la base en el
mismo acto que la lectura.

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid pk default gen_random_uuid()` | |
| `perfil_id` | `uuid not null references perfiles(id)` | quien exporta, `auth.uid()` |
| `paciente_id` | `uuid not null references pacientes(id)` | |
| `nota_id` | `uuid not null references notas_clinicas(id)` | `notas_clinicas` no es de solo adición: la FK vale |
| `versiones` | `integer[] not null` | `check (cardinality(versiones) > 0)`; los `numero_version` entregados, en orden |
| `proyeccion` | `proyeccion_exportacion not null` | |
| `motivo` | `motivo_exportacion` | nulo en el camino del profesional |
| `referencia` | `text` | `check ((motivo is null) = (referencia is null))`, `check (referencia is null or char_length(btrim(referencia)) between 3 and 200)` |
| `formato_version` | `smallint not null` | `check (formato_version >= 1)` |
| `algoritmo` | `text not null` | `check (algoritmo in ('argon2id-aes-256-gcm'))` |
| `parametros_kdf` | `jsonb not null` | `check (jsonb_typeof(parametros_kdf) = 'object')` |
| `acceso_id` | `bigint not null` | **sin FK**: `accesos_historia` es de solo adición. `unique (acceso_id)` |
| `creada_en` | `timestamptz not null default now()` | |

- Además: `check ((proyeccion = 'paciente') = coalesce(motivo = 'peticion_paciente', false))`.
- Índices: `(paciente_id, creada_en desc)` y `(perfil_id, creada_en desc)`.
- **No hay columna** para la contraseña, la clave, la sal, el nonce ni ningún contenido.

**Tabla `public.exportaciones_ficheros`** (solo adición). La huella del fichero que **sí** se entregó.

| Columna | Tipo | Regla |
|---|---|---|
| `exportacion_id` | `uuid primary key` | **sin FK** (el padre es de solo adición); lo comprueba la función |
| `huella_fichero` | `bytea not null` | `check (octet_length(huella_fichero) = 32)`, SHA-256 de los bytes UTF-8 del `.html` |
| `registrado_en` | `timestamptz not null default now()` | |

**Lo mismo para las dos tablas**:
- `enable row level security`, **sin políticas**;
- `revoke all … from public, anon, authenticated, service_role`;
- `revoke update, delete … from postgres`;
- los dos disparadores `fn_impedir_modificacion`, por fila (`before update or delete`) y por sentencia
  (`before truncate`);
- `insert into tablas_solo_adicion` con su motivo;
- `create trigger auditar_… after insert … fn_auditar('id')` para `exportaciones`, y
  `fn_auditar('exportacion_id')` para `exportaciones_ficheros`. No hay columnas que recortar: no llevan
  contenido.

Nadie tiene `select` ni `insert`. Solo escriben las funciones de abajo.

**Función `public.etiqueta_motivo_exportacion(m motivo_exportacion) returns text`**
- `immutable`, `language sql`, `set search_path = ''`.
- Devuelve «Petición del paciente», «Requerimiento judicial o inspección» o «Traspaso del caso».
- La usan el `detalle` del aviso y la `justificacion`.
- `revoke execute … from public`.

**Función `public.exportar_nota(...)`**
```sql
public.exportar_nota(
  p_paciente_id uuid,
  p_nota_id     uuid,
  p_motivo      public.motivo_exportacion default null,
  p_referencia  text default null,
  p_ip          inet default null,
  p_agente      text default null
) returns jsonb
```
Es `volatile security definer set search_path = ''`, `revoke execute … from public, anon`, `grant execute … to authenticated`.

**Orden obligatorio.** Cada `raise` lleva un mensaje propio, porque el banco los distingue por texto:

| Paso | Qué hace | Error |
|---|---|---|
| 0 | `v_uid := auth.uid()`; si es nulo, falla. | 42501 «No hay sesión.» |
| 1 | `v_rol := rol_actual()`. Si es nulo o no es `administrador` ni `profesional_sanitario`, falla. | 42501 «No puede exportar notas clínicas.» |
| 2 | Lee la nota (`id`, `paciente_id`, `autor_id`, `episodio_id`, `cita_id`, `fecha_sesion`). Si no existe o `paciente_id <> p_paciente_id`, falla. **El mismo mensaje que el paso 4b**, para no confirmar que existe. | 42501 «Sin acceso a esa nota.» |
| 3 | Parámetros: `(p_motivo is null) <> (p_referencia is null)`, o una referencia que tras `btrim` no mide de 3 a 200. | 22023 «El motivo y la referencia van juntos.» / «La referencia tiene que medir entre 3 y 200 caracteres.» |
| 4a | **Camino del profesional** (`p_motivo is null`): exige `nota.autor_id = v_uid or es_profesional_asignado(nota.paciente_id)`. El episodio conjunto **no** cuenta. Si falla y `v_rol = 'administrador'`, error «Falta el motivo». Si falla y es otro rol, error «Sin acceso». Si pasa: `v_proyeccion := 'profesional'`. | 42501 «Falta el motivo de la copia.» / «Sin acceso a esa nota.» |
| 4b | **Camino del administrador** (`p_motivo` no nulo): exige `v_rol = 'administrador'`. Si pasa: `v_proyeccion := case p_motivo when 'peticion_paciente' then 'paciente' else 'profesional' end`. | 42501 «Solo la administración pide copias con motivo.» |
| 5 | Exige `historia_desbloqueada()`, **después** de la autorización (H3). | 42501 «La historia no está desbloqueada.» |
| 6 | Exige al menos una versión firmada de la nota. | 22023 «La nota no tiene versiones firmadas.» |
| 7 | `insert into accesos_historia`: `perfil_id = v_uid`, `paciente_id`, `tipo 'exportacion'`, `pestana 'notas_clinicas'`, `desbloqueo_id null`, `ip`, `agente`, y `justificacion = case when p_motivo is null then null else etiqueta_motivo_exportacion(p_motivo) \|\| ': ' \|\| btrim(p_referencia) end`. Devuelve `v_acceso`. | |
| 8 | `insert into exportaciones`: `versiones` = `array_agg(numero_version order by numero_version)` del mismo `select` que el paso 10; `formato_version 1`; `algoritmo 'argon2id-aes-256-gcm'`; `parametros_kdf '{"m":65536,"t":3,"p":1,"longitud":32}'`; `acceso_id = v_acceso`. Devuelve `v_exportacion`. | |
| 9 | Si `p_motivo` no es nulo, un aviso por destinatario de `select distinct` (P3). Destinatarios: el `profesional_id` del paciente de la nota, más el `profesional_id` del superviviente si está fusionado (el mismo salto que H5), más `nota.autor_id`. Se quitan `v_uid` y los perfiles no activos. Cada aviso es un `insert into notificaciones` con `tipo 'exportacion_por_administracion'`, `titulo 'Copia de una nota por la administración'` y `detalle = format('%s ha pedido una copia de una nota de la sesión del %s. Motivo: %s.', nombre_completo del actor, to_char(fecha_sesion,'DD/MM/YYYY'), etiqueta)`. **Sin paciente y sin referencia.** `origen_tabla 'exportaciones'`, `origen_id v_exportacion`. Sin `on conflict`: los destinatarios ya van sin duplicados, y un 23505 delataría un fallo. | |
| 10 | Devuelve el `jsonb` de §1.2. | |

Todo ocurre en la misma transacción: un error en cualquier paso deshace el acceso, la exportación y los
avisos.

**Función `public.registrar_fichero_exportado(p_exportacion_id uuid, p_huella_hex text) returns void`**
- Es `volatile security definer set search_path = ''`, con execute solo para `authenticated`.
- Falla con 42501 «No hay sesión.» sin `auth.uid()`.
- Falla con 22023 si `p_huella_hex !~ '^[0-9a-f]{64}$'`.
- Exige que exista `exportaciones` con ese `id`, `perfil_id = auth.uid()` y `creada_en > now() - interval '15 minutes'`.
  Si no, 42501 «Esa exportación no es tuya o ha caducado.»
- Exige que no exista ya un fichero. Si existe, 23505 «Esa copia ya tiene fichero registrado.» La pk lo
  garantiza igualmente.
- `insert into exportaciones_ficheros (exportacion_id, huella_fichero) values (p_exportacion_id, decode(p_huella_hex,'hex'))`.

**Función `public.notas_para_copia(p_paciente_id uuid)`** (P2-a)
```sql
returns table (nota_id uuid, fecha_sesion date, autor_nombre text, versiones integer)
```
- Es `stable security definer set search_path = ''`, `language sql`, con execute solo para `authenticated`.
- Devuelve filas **solo** si se cumplen todas estas condiciones:
  - `rol_actual() = 'administrador'`;
  - `historia_desbloqueada()`;
  - `not es_profesional_asignado(p_paciente_id)` (si es asignado, ya las lee todas).
- De ese paciente devuelve las notas con alguna versión firmada que el administrador **no** lee por RLS:
  - `autor_id <> auth.uid()`;
  - y no se cumple el predicado de lectura conjunta de la **última** definición de
    `notas_clinicas_lectura`, copiado tal cual con `grep -n "notas_clinicas_lectura" supabase/migrations/*.sql`.
- Para cualquier otro llamante, cero filas, sin error. No registra acceso: listar no es acceder (ADR-037),
  y la pestaña ya registró su apertura.

**No se toca**:
- la política `accesos_historia_alta`;
- el `check` de `auditoria.operacion`;
- `registrar_evento_auditable`.

Ver §2 D6 y D7.

### 1.2 · El resultado de `exportar_nota`: el contrato entre la base y `lib/exportaciones`

```jsonc
{
  "exportacion_id": "uuid",
  "proyeccion": "profesional" | "paciente",
  "motivo": null | "peticion_paciente" | "requerimiento_judicial_o_inspeccion" | "traspaso_caso",
  "referencia": null | "texto",
  "generada_en": "timestamptz ISO",
  "zona": "Europe/Madrid",                 // cita.zona_horaria → organizacion.zona_horaria → 'Europe/Madrid'
  "cifrado": { "formato_version": 1, "algoritmo": "argon2id-aes-256-gcm",
               "kdf": { "m": 65536, "t": 3, "p": 1, "longitud": 32 } },
  "paciente": { "id": "uuid", "nombre": "…", "apellidos": "…" },
  "nota": { "id": "uuid", "fecha_sesion": "AAAA-MM-DD", "modalidad": "individual|pareja|familiar|grupo" },
  "versiones": [ /* jsonb_agg(... order by numero_version) */ ]
}
```

Lo que lleva cada versión depende de la proyección. **La base construye cada rama con su propio
`jsonb_build_object`: la rama del paciente no nombra las columnas que no entrega** (ADR-027: «algo que
físicamente no la contiene»).

| Campo | profesional | paciente · `alcance = individual` | paciente · `alcance = conjunta` |
|---|---|---|---|
| `numero_version`, `alcance`, `autor_nombre`, `creada_en` | sí | sí | sí |
| `huella`, `huella_anterior` (`encode(…,'hex')`) | sí | sí | sí |
| `sello` (abajo) | sí | sí | sí |
| `motivo_cambio` | sí | sí | **no**: texto libre que puede hablar de terceros |
| `cuerpo` (el texto JSON tal cual) | sí | sí | **no** |
| `anotaciones_reservadas` | sí | **no** | **no** |
| `contenido_canonico` | sí | **no**: contiene las reservadas | **no** |
| `participantes` (`[{nombre, apellidos, papel}]`) | no | no | sí: los de `episodio_participantes` del episodio con `alta_en <= fecha_sesion and (baja_en is null or baja_en >= fecha_sesion)` (ADR-030: «fecha, asistentes, tipo de sesión») |

`sello` es un subconjunto del sobre:
- solo si `pg_input_is_valid(contenido_canonico, 'jsonb')`, como hace `20260924150000_…:66`; si no, `null`;
- el subconjunto es `jsonb_build_object('esquema_version', …, 'cita_id', …, 'abierta_en', …, 'firmada_en', …, 'redactada_en_sesion', …, 'margen_sesion_minutos', …, 'fecha_sesion', …)`.

Así la frase del sello sale igual en las dos proyecciones sin mandar el sobre al paciente.

### 1.3 · `lib/exportaciones/` (nuevo)

| Fichero | Qué es | Contrato |
|---|---|---|
| `constantes.ts` | Los valores de la versión 1 | `FORMATO = 'psicogestion.copia-nota'`, `FORMATO_VERSION = 1`, `ALGORITMO = 'argon2id-aes-256-gcm'`, `KDF = {m: 65536, t: 3, p: 1, longitud: 32}`, `SAL_BYTES = 16`, `NONCE_BYTES = 12`, `CONTRASENA_MIN = 12`, `CONTRASENA_MAX = 256`, `REFERENCIA_MIN = 3`, `REFERENCIA_MAX = 200`, `MOTIVOS` (los tres valores del enum, en ese orden). Lo que tiene gemelo en SQL lo coteja el banco 24 §A. |
| `formato.ts` | El esquema de la respuesta de la base y el de la carga v1, y la proyección pura | `esquemaRespuestaExportar` (Zod) es §1.2. **`cifrado` se valida con literales** iguales a `constantes.ts`: si la base y el código discrepan, la copia no se hace. `type CopiaV1` y `esquemaCopiaV1`. `proyectar(respuesta): CopiaV1` es pura, pero **vuelve a quitar** reservadas, canónico, cuerpo y motivo según §1.2 aunque lleguen (defensa en profundidad). Formatea en `zona`: la fecha y hora de firma con `lib/fechas`, la frase del sello con `fraseDelSello` (construye un `SelloLeido` desde `sello`, y si el esquema no es el vigente, `null`, es decir, «ilegible»), el texto con `JSON.parse(cuerpo).texto` con alternativa `''` (como `servidor.ts:350-356`), las reservadas vacías como `null`, y las etiquetas de motivo, proyección y modalidad con `t()`. Conserva `numero_version` real, `huella` y `huella_anterior` en hexadecimal, y en la profesional el `contenido_canonico` literal y la fórmula (`t('exportaciones.copia.formula')`). **No** lleva `posicion_cadena` ni ids de perfiles. |
| `nucleo-js.ts` | `export const NUCLEO_JS: string` | El cuerpo de una función en JavaScript ES2017 **plano**: sin `class`, `async`, generadores ni sintaxis que el compilador baje con ayudantes. Define BLAKE2b (RFC 7693) y Argon2id (RFC 9106, v0x13, **solo p = 1**: con otro `p` lanza) y termina en `return { argon2id: argon2id, blake2b: blake2b };`. Firma: `argon2id(contrasena: Uint8Array, sal: Uint8Array, {m, t, p, longitud}) → Uint8Array`. Es síncrono. Es **una cadena**, no código del módulo: lo mismo que se prueba es lo que va en el fichero y en el trabajador. `scriptDelNucleo(): string` devuelve `'var Nucleo = (function(){' + NUCLEO_JS + '})();'`. |
| `visor-js.ts` | `export const VISOR_JS: string` | El arranque del visor, en JS plano. Lee la cabecera de `#cabecera` (`textContent` exacto), la carga de `#carga` y los textos de `#textos`. Pide la contraseña en un formulario con `label`. Pinta un `role="status"` («Abriendo… puede tardar unos segundos») y cede un tic con `setTimeout(…, 0)` antes de derivar con `Nucleo.argon2id`. Después `crypto.subtle.importKey('raw', …, 'AES-GCM')` y `decrypt({name: 'AES-GCM', iv: nonce, additionalData: bytes(cabecera), tagLength: 128})`. Si falla: «Contraseña incorrecta o fichero dañado» (`role="alert"`), y el foco vuelve al campo. Si `crypto.subtle` no existe: «Este navegador no puede abrir la copia». Pinta **solo** con `createElement` y `textContent`. Al terminar vacía el campo de la contraseña. |
| `fichero.ts` | Compone el `.html` | `cabeceraDelFichero(sal, nonce): string` es un JSON ASCII con un orden de claves fijo (`formato`, `formato_version`, `cifrado`, `kdf: {m, t, p, longitud, sal}`, `nonce`). `componerFichero({cabecera, cargaB64, textos}): string` lleva `<!doctype html>`, `lang="es"`, la `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">`, CSS en línea, y tres `<script type="application/json">` (cabecera, carga y textos, con `<` escapado como `<`). Después `<script>` con `scriptDelNucleo()` y `VISOR_JS`. `textosDelVisor()` saca de `t('exportaciones.visor.*')` todas las etiquetas genéricas. |
| `cifrar.ts` | Cifra en el navegador (también corre en Node para las pruebas) | `cifrarCopia(copia: CopiaV1, contrasena: string, derivar: Derivar, aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n))): Promise<{html: string; huellaHex: string}>`. El orden es: rechazar si la contraseña normalizada a NFC no mide de 12 a 256; sal y nonce; `clave = await derivar(utf8(NFC(contrasena)), sal, KDF)`; `cabecera`; `AES-GCM` con `additionalData = utf8(cabecera)`; base64 por trozos (sin `String.fromCharCode(...grande)`); `componerFichero`; `huellaHex = hex(SHA-256(utf8(html)))`. `type Derivar = (c: Uint8Array, s: Uint8Array, k: typeof KDF) => Promise<Uint8Array>`. |
| `derivar-en-trabajador.ts` | `'use client'` | `derivarEnTrabajador: Derivar`. Crea un `Worker` desde un `Blob` con `scriptDelNucleo()` y un pegamento de `onmessage`, lo termina al acabar y revoca la URL del blob. No usa `eval` ni `new Function`. |
| `servidor.ts` | `import 'server-only'`, con la forma `(sesion, entrada, contexto)` como `lib/notas/servidor.ts` | Tres funciones, detalladas abajo. |

Las tres funciones de `servidor.ts`:
- **`pedirCopiaDeNota(sesion, {pacienteId, notaId, motivo, referencia}, contexto)`**
  - Devuelve `{ok: true; exportacionId; copia: CopiaV1; nombreFichero}` o `{ok: false; motivo: 'bloqueada' | 'sin_permiso' | 'falta_motivo' | 'sin_versiones' | 'error'}`.
  - Llama a `rpc('exportar_nota')` y traduce los errores por código **y** fragmento de mensaje: candado,
    `sin_permiso` o `falta_motivo`. El 22023 de «sin versiones» es `sin_versiones`, y cualquier otro error es `error`.
  - Valida con `esquemaRespuestaExportar` y aplica `proyectar`.
  - `nombreFichero = 'copia-de-nota-' + AAAAMMDD-HHmm (zona) + '.html'`.
- **`registrarFichero(sesion, {exportacionId, huellaHex})`**
  - Devuelve `{ok: true} | {ok: false; motivo: 'caducada' | 'error'}`.
- **`notasParaCopia(sesion, pacienteId)`**
  - Devuelve `Leida<NotaParaCopia[]>`, con `NotaParaCopia = {id, fechaSesion (formateada), autor, versiones, href}`.

**Regla de registros, para las tres**: en un fallo se registra `console.error('exportaciones: …', {code: error.code})`, **nunca** el objeto
`error` entero, la respuesta, la `copia` ni los `issues` de Zod con su `input`. De un fallo de Zod solo
salen `path` y `code`.

Pruebas, junto a cada fichero:
- `nucleo-js.test.ts`
- `formato.test.ts`
- `fichero.test.ts`
- `cifrar.test.ts`
- `visor-js.test.ts` (jsdom)
- `servidor.test.ts`

Lo que exigen está en §3 y §5.

### 1.4 · Interfaz: `app/(app)/pacientes/[id]/historia/notas/`

| Fichero | Qué |
|---|---|
| `esquemas-copia.ts` | `esquemaPedirCopia = z.strictObject({pacienteId: z.uuid(), notaId: z.uuid(), motivo: z.enum(MOTIVOS).nullable(), referencia: z.string().trim().min(3).max(200).nullable()}).refine(motivo y referencia van juntos)`. `esquemaRegistrarFichero = z.strictObject({pacienteId: z.uuid(), exportacionId: z.uuid(), huellaHex: z.string().regex(/^[0-9a-f]{64}$/)})`. `esquemaDialogoCopia` (solo cliente) es `esquemaPedirCopia` sin los ids, más `contrasena` y `repeticion` (12-256, iguales tras NFC) y `entendido: z.literal(true)`. **Es `strictObject` a propósito**: si el cliente mandara `contrasena` a la acción, fallaría en vez de ignorarse en silencio. |
| `acciones-copia.ts` | `'use server'`. `pedirCopiaDeNota(entrada)` hace `exigirSesion()`, valida con `esquemaPedirCopia` (con error, `{ok: false, motivo: 'error'}`), `headers()` y llama a `servidor.pedirCopiaDeNota`. `registrarFicheroDeCopia(entrada)` sigue el mismo patrón. **Ninguna recibe la contraseña.** |
| `dialogo-de-copia.tsx` | `'use client'`. Va sobre `Dialogo`, con `react-hook-form` y `esquemaDialogoCopia`. Props: `{pacienteId, notaId, modo: 'profesional' \| 'motivo', abierto, alCerrar}`. En modo `motivo` añade un `fieldset` con `legend` «Motivo», tres radios y la «Referencia», con su ayuda «No escribas datos de salud». Siempre lleva «Contraseña» y «Repite la contraseña» (`type=password`, `autoComplete="new-password"`) y la casilla «Entiendo que sin esta contraseña nadie podrá abrir la copia, tampoco la consulta». Botón «Cifrar y descargar». |
| `boton-de-copia.tsx` | `'use client'`. «Descargar copia» abre `dialogo-de-copia` en modo `profesional`. |
| `copia-por-motivo.tsx` | La vista de la nota para el administrador que no la lee (P2-a). Enseña la fecha de la sesión, el autor y el número de versiones, el texto `t('exportaciones.motivo.explicacion')` y «Pedir copia por motivo», que abre el diálogo en modo `motivo`. |
| `acciones.ts` (existente) | `abrirEditorDeNota` envuelve el resultado. Si `servidor.abrirEditorDeNota` da `no_disponible`, hay `notaId` y `notasParaCopia(sesion, pacienteId)` contiene esa nota, devuelve `{estado: 'solo_copia', nota: NotaParaCopia}`. El tipo es `ResultadoAperturaConCopia = servidor.ResultadoApertura \| {estado: 'solo_copia'; nota: NotaParaCopia}`, declarado aquí. **`lib/notas/` no se toca.** |
| `editor-de-nota.tsx` (existente) | Dos ramas. (1) Con `estado: 'solo_copia'` pinta `<CopiaPorMotivo>`. (2) Con `estado: 'abierta'`, `!nota.lecturaConjunta` y `nota.versiones.length > 0`, pinta `<BotonDeCopia>` en la cabecera de la sección de versiones, no en la barra pegada al teclado, para no competir con «Firmar». |

**El flujo del diálogo** (estados: `editando` → `pidiendo` → `cifrando` → `registrando` → `descargada` | `error`):
1. Valida en el cliente. La contraseña se queda en el estado del formulario y **no se pasa a ninguna acción**.
2. `pedirCopiaDeNota({pacienteId, notaId, motivo, referencia})`. Con `ok: false`, el mensaje de
   `exportaciones.error.<motivo>` va en `role="alert"` y el foco pasa al mensaje.
3. `cifrarCopia(copia, contrasena, derivarEnTrabajador)`. Mientras dura, un `role="status"` dice «Cifrando la copia…».
4. `registrarFicheroDeCopia({pacienteId, exportacionId, huellaHex})`. **Si falla, no se descarga** y se
   explica.
5. Descarga: `Blob([html], {type: 'text/html'})`, `URL.createObjectURL`, `a[download=nombreFichero]`,
   `click` y `revokeObjectURL`.
6. `reset()` del formulario (la contraseña sale del estado), el mensaje «Copia descargada», y `Cerrar`.
7. Si el diálogo se cierra a medio camino, una bandera `cancelado` descarta los resultados: no se registra
   el fichero ni se descarga.
8. El disparador **no** se deshabilita, por H22.

**Pestaña Notas** (P2-a): `app/(app)/pacientes/[id]/`.
- `acciones.ts`: en `notas_clinicas`, `abrirPestanaDeHistoria` añade `notasParaCopia: NotaParaCopia[] | null`,
  que llama a `notasParaCopia(sesion, pacienteId)` **después** del registro, igual que `leerNotas`.
- `panel-historia.tsx` lo pasa a la lista.
- `lista-de-notas.tsx`: una segunda lista con su encabezado, «Otras notas de este paciente (solo copia por
  motivo)». Cada fila lleva la fecha, el autor y las versiones, y enlaza a `?nota=`. El estado vacío solo
  aparece si **las dos** listas están vacías.

### 1.5 · `lib/i18n/es.ts`

**`exportaciones.*`**:
- botones;
- títulos del diálogo;
- etiquetas y ayudas;
- los tres motivos;
- las dos proyecciones;
- errores: `bloqueada`, `sin_permiso`, `falta_motivo`, `sin_versiones`, `caducada`, `error`, `noRegistrada`;
- estados: `pidiendo`, `cifrando`, `registrando`, `descargada`;
- `motivo.explicacion`;
- `lista.otras`;
- `copia.*`: lo que va dentro de la carga, que son las etiquetas de los campos, la fórmula
  «huella = SHA-256( UTF-8(contenido_canonico) ‖ huella_anterior )», la nota de que `huella_anterior` es el
  eslabón anterior **de la historia del paciente** y no necesariamente de esta nota, la frase de exclusión
  del art. 18.3 y la de sesión conjunta (ADR-030);
- `visor.*`: los textos genéricos del fichero.

**`notificaciones.tipos.exportacion_por_administracion`**: «Copia de una nota por la administración».

### 1.6 · Bancos, guion y documentos

- **`scripts/rls/24-exportaciones.sql`**: el número es el siguiente libre al implementar. Secciones A-J de §3.
- **`scripts/rls/README.md`**: la fila del 24.
- **`scripts/rls/11-cobertura.sql`**: solo un comentario, «`exportaciones` y `exportaciones_ficheros` NO
  tienen política a propósito», como el de `eventos_salientes`.
- **`scripts/lint-migraciones.ts`**: `'exportaciones'` y `'exportaciones_ficheros'` en `TABLAS_SOLO_ADICION`.
  `lint-migraciones.test.ts` solo cambia si fija la lista.
- **`scripts/t040-exportacion.ts`**: el guion de punta a punta con sesión real (H23), en §3 C4 y C5.
- **`accesibilidad/nota-clinica.spec.ts`** (ampliado): abrir el diálogo, axe sin violaciones, el teclado
  (Tab dentro, Escape cierra, el foco vuelve a «Descargar copia»).
- **`docs/architecture.md`**:
  - en el dominio Cumplimiento, `exportaciones_ficheros`;
  - un párrafo «Exportaciones», con las dos tablas, las tres funciones, el flujo en tres pasos y el
    formato v1 (ADR);
  - la fila «Bajo demanda» de copias, que apunta al ADR;
  - la definición de **auditoría destacada** (D6).
- **ADR**: el fichero, más `docs/decisions.md` y `docs/decisions/INDEX.md`.
- **Memoria**: `docs/state.md`, reescrito, y `docs/bitacora/T-040.md`.

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado, y por qué |
|---|---|---|
| D1 | Se cifra **en el navegador**. El servidor entrega la proyección y nunca ve la contraseña. | Cifrar en el servidor con `crypto.argon2` nativo: la contraseña viajaría en el POST y quedaría a un `console.error` de un registro. El criterio 5 dejaría de ser estructural. |
| D2 | El HTML autodescifrable con Argon2id propio y AES-GCM de WebCrypto (ADR de A, P1). | Un PDF R6 enmienda la decisión 4. Un ZIP AES: PBKDF2-SHA1 y soporte desigual. Meter `@noble/hashes` como dependencia: hoy solo es transitiva, la regla de `package.json` exige que la nombre el ticket, y embeberla en el fichero pediría un paso de empaquetado. |
| D3 | El núcleo criptográfico es **una cadena** (`NUCLEO_JS`) que se ejecuta en un `Worker` desde un Blob en la aplicación, y en línea en el visor. | `Function.prototype.toString()` de una función del módulo: tras el compilador de Next puede depender de ayudantes externos, y lo probado no sería lo que se entrega. `new Function` en la aplicación: rompe una CSP futura sin `unsafe-eval`. En el hilo principal: congelaría la interfaz de 1 a 5 s. |
| D4 | **Dos tablas**: `exportaciones`, que escribe la base al leer, y `exportaciones_ficheros`, con la huella que se registra después. | Una sola tabla con la huella: la huella solo existe después de cifrar, y una tabla de solo adición no admite completar la fila. Y si la fila se escribiera al final, una llamada directa a la RPC leería sin dejar fila en `exportaciones` ni aviso con origen. |
| D5 | **Autoriza, lee, registra y avisa en una sola función** definer. El aviso sale **al leer**, no al registrar el fichero. | Avisar en el segundo paso: quien llame a `exportar_nota` directamente por PostgREST tendría el contenido sin aviso (decisión 5). |
| D6 | La «**auditoría destacada**» es un predicado documentado: `exportaciones.motivo is not null`, más sus filas de `accesos_historia` (por `acceso_id`) y de `auditoria` (`tabla = 'exportaciones'`). | Un verbo nuevo en `auditoria.operacion`: obliga a recopiar entera la lista del `check` (`20260916120000:382`) con otros tickets en cola, y duplica la fila que ya escribe `fn_auditar`. La pantalla de auditoría es otro ticket (H25). |
| D7 | No se toca `accesos_historia_alta`, aunque deja insertar a mano filas `tipo = 'exportacion'`. | Cerrarla: con D4 la integridad de la exportación ya no depende de esas filas, porque la fila de `exportaciones` la escribe la base. Es preexistente (igual pasa con `informe` y `emergencia`): se anota en `state.md`. |
| D8 | El administrador **con motivo** pasa por el camino del administrador aunque sea el asignado. El profesional **con motivo** recibe 42501. | Ignorar el motivo si es asignado: la proyección del paciente dependería de quién la pide, no del motivo. Dejar al profesional exportar con motivo: reabre la tabla del propietario. |
| D9 | La proyección del paciente se recorta **en la base** (ramas de `jsonb_build_object`) **y otra vez** en `proyectar`. | Solo en TypeScript: lo que no se entrega viajaría hasta el navegador del administrador (ADR-027: «no un filtro en la aplicación»). |
| D10 | La vista previa del administrador (P2-a) solo lleva la fecha, el autor y el número de versiones, con una función definer que **no** registra acceso. | Registrar acceso al listar: contradice ADR-037 («listar no es acceso»), y la pestaña ya registró su apertura. Enseñar el estado o el alcance: no hace falta para pedir la copia. |
| D11 | Una exportación es **una nota con todas sus versiones** firmadas. | Elegir versiones: el contrato dice «todas». La historia entera: P2-b. |
| D12 | La huella del fichero la da el cliente. Es un hecho **atestiguado por la aplicación**, no por la base. | Que la calcule la base: nunca ve el fichero. El riesgo queda acotado: solo quien exportó, una vez y en 15 minutos (§5). |
| D13 | El candado se exige en la base (`historia_desbloqueada()`) **después** de autorizar. | Antes: un 42501 de candado escondería el de autorización en las pruebas, y quien no tiene permiso sabría que su candado está cerrado. |
| D14 | Argon2id con **p = 1** solamente. | Soportar varias vías: más código propio que probar, sin ganancia en un navegador de un solo hilo. Cambiarlo es un formato nuevo. |
| D15 | Las fechas se formatean en el servidor (`proyectar` corre en `servidor.ts`), en la zona de la cita o de la organización (ADR-034). | En el visor: dependería de la zona del ordenador del juez. |

---

## 3 · Cómo se cierra cada criterio de aceptación

Banco = `scripts/rls/24-exportaciones.sql`, que corre con `npm run test:rls`.

**Fijación del banco 24**:
- un paciente P de PRO1 (titular), con una nota N1 de autoría de PRO3, que es otro profesional asignado
  por coterapia o sembrado como autor. N1 tiene:
  - **v1 individual**, con cuerpo `'MARCA-CUERPO-1'` y reservadas `'MARCA-RESERVADA-1'`;
  - **v2 conjunta**, con cuerpo `'MARCA-CUERPO-2'`, reservadas `'MARCA-RESERVADA-2'` y `motivo_cambio` `'MARCA-MOTIVO-2'`;
- un episodio de pareja con un participante P2, de PRO2;
- PRO4 sin asignación;
- TEC y ADM.

Los años y las citas se anclan como dice `state.md` («un banco nuevo ancla en año + 3»).

**Cada negativa lleva su gemela positiva** con el mismo actor y el candado abierto, y comprueba el **código y
el fragmento del mensaje**.

| Criterio | Cómo se demuestra |
|---|---|
| **C1** el autor y el asignado exportan; el profesional sin asignación, el técnico y el lector por episodio conjunto reciben un error de la base | **Banco §C**. Con el candado abierto, `exportar_nota(P, N1)` funciona como PRO3 (autor) y como PRO1 (asignado no autor). Falla con `assert_lanza(…, '42501')` y su fragmento en tres casos: PRO4 («Sin acceso a esa nota»); TEC («No puede exportar»); PRO2, lector de v2 por el episodio conjunto, con la gemela que demuestra que PRO2 **sí** lee v2 con `select` bajo RLS, para que el 42501 no se deba a otra cosa. Además, en `lib/exportaciones/servidor.test.ts`, el 42501 se traduce a `sin_permiso` y no a `bloqueada`. |
| **C2** el administrador sin motivo recibe error; con «petición del paciente», la copia no contiene ningún texto de las reservadas | **Banco §C**: ADM sin motivo da 42501 «Falta el motivo», con la gemela de que con motivo funciona. **Banco §D**: como ADM con `peticion_paciente`, `position('MARCA-RESERVADA' in r::text) = 0`, `position('contenido_canonico' in r::text) = 0`, `position('MARCA-CUERPO-2' in r::text) = 0` y `position('MARCA-MOTIVO-2' in r::text) = 0`. La v2 trae `participantes` y la v1 trae `MARCA-CUERPO-1`. Con `requerimiento_judicial_o_inspeccion` **sí** aparecen las dos `MARCA-RESERVADA`. **Vitest**: `formato.test.ts` (`proyectar` quita las reservadas aunque la respuesta las traiga) y `cifrar.test.ts` (la carga descifrada de una copia de paciente no contiene la marca). **Guion** `t040` paso 3: como el administrador sembrado, descifra el fichero real y busca la marca. |
| **C3** cada exportación deja una fila en `exportaciones` y otra en `accesos_historia`; `update` y `delete` como `postgres` fallan | **Banco §E**: cada llamada que funciona deja +1 en `exportaciones` y +1 en `accesos_historia` (`tipo = 'exportacion'`, `pestana = 'notas_clinicas'`, `desbloqueo_id is null`, `exportaciones.acceso_id` = esa fila; `justificacion` nula en el camino del profesional y «Petición del paciente: REF» en el del administrador). Cada llamada que falla deja +0 en las dos. **Banco §B**: como `postgres`, `update exportaciones set referencia = 'x'`, `delete from exportaciones` y `truncate exportaciones` dan 42501, y lo mismo sobre `exportaciones_ficheros`. El 10 lo repite por el catálogo. |
| **C4** todas las versiones en orden, y la huella de cada una coincide | **Banco §G**: `(r->'versiones'->i->>'numero_version')::int` es estrictamente creciente, y `->>'huella' = encode(v.huella, 'hex')` para cada versión de la tabla, en las dos proyecciones. **Vitest** `formato.test.ts`: `proyectar` conserva el orden, las huellas y el número real. `cifrar.test.ts`: la carga descifrada es igual a la copia. **Guion `t040`**: PRO (Ana) firma dos versiones con `lib/notas/servidor.ts` como en `t012`, pide la copia, la cifra derivando con `new Function(NUCLEO_JS)()`, registra el fichero y descifra con el mismo camino que el visor. Después, como `postgres`, compara versión a versión `huella`, `huella_anterior` y `numero_version`, y comprueba `exportaciones_ficheros.huella_fichero = sha256(fichero)`. |
| **C5** ni la contraseña ni el fichero en claro quedan en la base, en Storage ni en los registros del servidor | Es **estructural**: ninguna acción recibe la contraseña. `acciones-copia.test.ts` comprueba que `esquemaPedirCopia` **rechaza** una entrada con `contrasena`, y el diálogo (`dialogo-de-copia.test.tsx`) que el espía de `pedirCopiaDeNota` y de `registrarFicheroDeCopia` nunca recibe una clave llamada `contrasena` ni el valor tecleado. **Banco §A**: las columnas de las dos tablas son exactamente las de §1.1. **Vitest** `servidor.test.ts`: con espías en `console.*`, ningún argumento contiene la marca del cuerpo, de las reservadas ni del nombre del paciente, ni en el camino feliz ni en los de error. **Prueba de fuente**, como `page.test.ts`: `lib/exportaciones/**` y los ficheros de copia no contienen `.storage`, `writeFile` ni `localStorage`. **Guion `t040`**: un `pg_dump --data-only` de `exportaciones`, `exportaciones_ficheros`, `accesos_historia`, `notificaciones` y `auditoria`, y `docker logs` de los contenedores `supabase_db_*` y `supabase_rest_*` del proyecto, no contienen la contraseña de prueba ni `MARCA-RESERVADA` (salvo, en la base, en `notas_clinicas_versiones`, que es su sitio). El guion vigila también el `stdout` y el `stderr` de su propio proceso. |
| **C6** la exportación del administrador crea un aviso para el titular | **Banco §F**: tras ADM con motivo sobre N1, hay una fila en `notificaciones` para PRO1 (titular) y otra para PRO3 (autor, P3), las dos con `tipo = 'exportacion_por_administracion'`, `origen_tabla = 'exportaciones'` y `origen_id` = la exportación. Ninguna es para ADM. `position(P.nombre in detalle) = 0`, `position(P.apellidos in detalle) = 0` y `position('REF' in detalle) = 0`. La exportación del profesional crea **cero** avisos. Con PRO3 dado de baja, el autor no recibe aviso y el titular sí. |
| **C7** (manual) abrir una nota de dos versiones con la herramienta del ADR | Guion pasos 1 y 2 con **Edge y Firefox** en Windows: fichero, contraseña, dos versiones en orden, con reservadas, la frase del sello y las huellas. Con una contraseña errónea, el mensaje y el foco en el campo. Se anota en `evidencia.json` con el nombre del fichero y su huella, que coincide con la de `exportaciones_ficheros`. |
| **C8** (manual) la misma vista enseña el botón solo a quien la tabla deja | Matriz de seis filas en la evidencia: autor sí; asignado no autor sí; PRO2 por lectura conjunta no; PRO4 no (ni siquiera ve la nota); TEC no (no hay pestaña); ADM no asignado: «Pedir copia por motivo» sí y «Descargar copia» no. **Vitest** `editor-de-nota.test.tsx`: el botón aparece solo con `!lecturaConjunta && versiones > 0`, y `solo_copia` pinta `CopiaPorMotivo`. |
| **C9** `lint` y `build` limpios, `test:rls` en verde | `npm run lint && npm run build`, `npm run test:rls`, `npm test` y `npm run lint:migraciones`, con la salida pegada en la evidencia. |

**Además (sin criterio propio, pero bloqueantes)**:
- **Banco §H** (`registrar_fichero_exportado`):
  - el dueño en plazo funciona;
  - la segunda vez da 23505;
  - otro usuario da 42501;
  - una huella mal formada da 22023;
  - una exportación caducada da 42501. Se fabrica insertando como `postgres` una fila con
    `creada_en = now() - interval '16 minutes'`: `postgres` conserva `insert`.
- **Banco §I** (permisos):
  - `has_table_privilege('authenticated', 'public.exportaciones', 'select' / 'insert')` es falso, y lo mismo
    para `exportaciones_ficheros`;
  - `has_function_privilege('anon', …, 'execute')` es falso para las tres funciones, y para `authenticated`
    es cierto.
- **Banco §J** (`notas_para_copia`):
  - ADM no asignado ve N1 con fecha, autor y 2 versiones;
  - PRO4 y TEC ven cero;
  - ADM con el candado cerrado ve cero;
  - ADM asignado ve cero;
  - las columnas devueltas son exactamente cuatro.
- **Banco §A**: `constantes.ts` y SQL coinciden en `formato_version`, `algoritmo` y `parametros_kdf`. El
  banco fija los literales y `formato.test.ts` fija los mismos.
- **Vitest, núcleo**: `nucleo-js.test.ts` cubre:
  - BLAKE2b-512 de `"abc"` (RFC 7693, apéndice A) y de la cadena vacía;
  - Argon2id contra `crypto.argon2Sync('argon2id', {message, nonce, parallelism: 1, tagLength: 32, memory, passes})`
    en **cinco** combinaciones, incluida la de producción (`m = 65536, t = 3`), una con `m = 8` y `t = 1`,
    una con `t = 4`, una con una contraseña con «ñ» y emoji, y una con la sal de todo ceros;
  - `p = 2` lanza.
  
  Si `crypto.argon2Sync` no existe (Node < 24.7), la prueba **falla** con ese motivo. **No** se salta.
- **Vitest, visor** (`visor-js.test.ts`, jsdom con `crypto.subtle` de Node):
  - compone un fichero y lo carga;
  - con la contraseña correcta pinta las versiones;
  - con una errónea, el mensaje en `role="alert"`;
  - si el cuerpo es `<img src=x onerror=…>`, no aparece ningún `img` en el DOM;
  - una cabecera alterada (otro `m`) no abre.

---

## 4 · Riesgos, por probabilidad

1. **Alta. Un 42501 que pasa por el motivo equivocado.** Hay seis causas distintas con el mismo código.
   **Mitigación**: el mensaje propio en cada `raise`, la aserción del fragmento y la gemela positiva (§3).
2. **Alta. Se descuadra la cola de `supabase/`.** T-015 sin integrar (sin `origen_*`, sin
   `notificaciones.tipos`), un sello que choca, un banco 24 ocupado. **Mitigación**: las precondiciones de
   la cabecera y volver a comprobar el §0 antes de migrar.
3. **Media. Un fallo en el Argon2id o el BLAKE2b propios** que sea simétrico: cifra y descifra, pero no es
   Argon2id. **Mitigación**: el oráculo nativo de Node en cinco combinaciones. Una implementación que pase
   esas cinco con `m` distintos es Argon2id.
4. **Media. Copiar mal el predicado de lectura conjunta** en `notas_para_copia`: o aparecen notas que el
   administrador ya lee, o desaparecen. **Mitigación**: copiarlo de la última definición y el §J con un
   administrador coterapeuta.
5. **Media. Rendimiento en el navegador.** 64 MiB y t = 3 en JavaScript son de 1 a 5 s, más en un móvil viejo.
   **Mitigación**: el trabajador y el `role="status"`. Si en la prueba manual pasa de 10 s en el portátil
   de referencia, se anota y se escala. No se bajan los parámetros sin un ADR.
6. **Baja. `crypto.subtle` no existe en `file://`** en algún navegador. Chrome, Edge y Firefox tratan `file:`
   como contexto seguro. **Mitigación**: el mensaje explícito y la prueba manual en dos navegadores.
7. **Baja. Respuestas grandes.** Una nota con muchas versiones largas duplica el texto (cuerpo y canónico).
   Vercel corta las respuestas a 4,5 MB, y una nota real queda muy por debajo. Se anota, sin mitigar.
8. **Baja. Las pasarelas de correo bloquean `.html`.** Afecta a cómo se entrega, no al ticket. Está en el ADR.
9. **Baja. Una carrera** entre firmar una versión y exportar: `exportaciones.versiones` y la carga salen
   del mismo `select` de la misma transacción, así que siempre coinciden.

---

## 5 · Qué revisar

**Qué puede elegir quien llama, y qué efecto tiene**:
- [ ] `exportar_nota`: el llamante elige `p_paciente_id`, `p_nota_id`, `p_motivo`, `p_referencia`, `p_ip`
      y `p_agente`. **No** elige:
      - `perfil_id`, que sale de `auth.uid()`;
      - la proyección, que se deriva del motivo;
      - las versiones (todas);
      - el formato, el algoritmo ni los parámetros, que son constantes en SQL.
      
      Comprueba que ninguna de esas columnas sale de un parámetro.
- [ ] `p_paciente_id` distinto del de la nota da el **mismo** 42501 que «sin acceso», para no confirmar que
      la nota existe.
- [ ] Con `p_motivo` no nulo y rol `profesional_sanitario` da 42501, aunque sea el autor (D8).
- [ ] `registrar_fichero_exportado`: el llamante elige el id y la huella. Solo sobre **sus** exportaciones,
      en 15 minutos y una vez. Comprueba que no hay otra forma de insertar en `exportaciones_ficheros`
      (`\dp`).
- [ ] `notas_para_copia`: no devuelve ninguna columna de texto clínico, ni estado ni alcance, y no registra
      acceso.

**Qué prueba debe fallar, y por qué motivo exacto**:
- [ ] Si se quita `es_profesional_asignado` del paso 4a, cae la positiva de PRO1 en §C.
- [ ] Si se añade `es_profesional_del_episodio` al 4a, la negativa de PRO2 deja de lanzar.
- [ ] Si se mueve el paso 5 antes del 1, la negativa de TEC con el candado **cerrado** da «no está
      desbloqueada» en vez de «No puede exportar». El banco debe tener esa gemela.
- [ ] Si se quita `anotaciones_reservadas` de la rama del paciente en SQL **sin** tocar `proyectar`, falla
      el §D, que mira la base. Y si se quita de `proyectar` sin tocar SQL, falla `formato.test.ts`. Las dos
      capas tienen que morder **por separado**.
- [ ] Si se mueve el aviso de `exportar_nota` a `registrar_fichero_exportado`, falla el §F, que llama solo
      a `exportar_nota`.
- [ ] Si `esquemaPedirCopia` se cambia por `z.object`, falla `acciones-copia.test.ts`, que manda una
      `contrasena` y espera el rechazo.
- [ ] Si `textContent` se cambia por `innerHTML` en `VISOR_JS`, aparece el `img` en `visor-js.test.ts`.
- [ ] Si los datos asociados no entran en `decrypt`, la cabecera alterada abriría.

**Invariantes que se podrían saltar por otra puerta**:
- [ ] **Por un nulo.** `p_motivo` nulo con `p_referencia` puesta da 22023. Un `rol_actual()` nulo (perfil de baja
      o suspendido) da 42501 en el paso 1. `fecha_sesion` nula no es posible (`not null`). Un `sello` nulo
      en la proyección se pinta como «ilegible», no como «fuera de sesión».
- [ ] **Por duplicados.** El `unique (acceso_id)`, la pk de `exportaciones_ficheros` y el `select distinct`
      de los destinatarios: el titular y el autor que son la misma persona reciben **un** aviso.
- [ ] **Por concurrencia.** Dos exportaciones en la misma ventana dejan dos accesos (`desbloqueo_id` nulo:
      fuera del índice de ventana, H2) y dos filas. Es correcto: son dos copias.
- [ ] **Por los permisos de tabla entera.** `\dp public.exportaciones*` no debe mostrar ningún privilegio
      para `authenticated`, `anon` ni `service_role`, y para `postgres` sin `UPDATE` ni `DELETE`. Las
      funciones, sin `EXECUTE` para `PUBLIC` ni `anon`.
- [ ] **Por `TRUNCATE`.** Están los dos disparadores por sentencia y las dos filas del catálogo, y
      `cobertura_solo_adicion()` las ve.
- [ ] **Por el registro.** En el código nuevo, ningún `console.*` recibe un objeto `error` entero de
      Supabase o de Zod, la `copia` ni la respuesta del RPC. Hay que leerlo a mano además de la prueba.
- [ ] **Por la huella anterior.** El visor y la copia **no** afirman que `huella_anterior` de la v2 sea la
      huella de la v1, porque la cadena es por paciente (H7). Revisa el texto de `exportaciones.copia.*`.
- [ ] **Por la carga en claro.** Fuera de la carga cifrada no hay nombre, id, fecha, proyección ni motivo.
      Revisa `cabeceraDelFichero`, `textosDelVisor` y `nombreFichero`.
- [ ] **Por la contraseña.** Se normaliza a NFC **en los dos lados**: en el cifrado y en el visor. Si falta
      en uno, la «ñ» compuesta de macOS no abre lo cifrado en Windows. Hay un caso en `cifrar.test.ts`.
- [ ] **Por el foco.** Tras un error, el foco va al mensaje. Tras la descarga, a «Cerrar». Y al cerrar,
      vuelve a «Descargar copia», que nunca se deshabilita (H22).

---

## 6 · Territorio (definitivo; sustituye al provisional del contrato)

```yaml
territorio:
  - supabase/migrations/*_exportaciones.sql
  - scripts/rls/24-exportaciones.sql          # el número: el siguiente libre al implementar
  - scripts/rls/README.md
  - scripts/rls/11-cobertura.sql              # solo el comentario de tablas sin política
  - scripts/lint-migraciones.ts
  - scripts/lint-migraciones.test.ts          # solo si fija la lista
  - scripts/t040-exportacion.ts
  - lib/supabase/tipos-bd.ts                  # solo regenerado con `npm run tipos`
  - lib/exportaciones/**
  - lib/i18n/es.ts
  - app/(app)/pacientes/[id]/historia/**
  - app/(app)/pacientes/[id]/acciones.ts
  - app/(app)/pacientes/[id]/acciones.test.ts
  - app/(app)/pacientes/[id]/panel-historia.tsx
  - app/(app)/pacientes/[id]/panel-historia.test.tsx
  - app/(app)/pacientes/[id]/lista-de-notas.tsx
  - app/(app)/pacientes/[id]/lista-de-notas.test.tsx
  - accesibilidad/**
  - docs/architecture.md
  - docs/decisions/ADR-0*.md                  # solo el nuevo
  - docs/decisions.md
  - docs/decisions/INDEX.md
  - docs/state.md
  - docs/bitacora/T-040*.md
```

**Fuera, a propósito**:
- `lib/notas/**`: el `solo_copia` se envuelve en `historia/notas/acciones.ts`;
- `package.json`: no hay dependencias nuevas ni `engines`;
- `components/ui/**`: se usa `Dialogo` tal cual;
- `next.config.ts`.

---

## 7 · Delegable

**Casi nada.** Todo lo que hay es criptografía, RLS, foco, formularios o recorte de datos.

Lo único sin comportamiento es la maqueta de `copia-por-motivo.tsx`: un encabezado con tres datos y un
botón que recibe por props. Y aun así su prueba toca la rama `solo_copia` del editor.

**Recomendación: no delegar.** La fábrica lo hace todo con Opus. El banco y el núcleo criptográfico no se
delegan bajo ningún concepto.

---

## Lo que no entra, y por qué

- **La copia de la historia entera o de varias notas**, incluida la exportación masiva del profesional que
  se va (ADR-032). Este ticket es la primera salida de la capa: una nota. La masiva reutiliza las dos tablas
  y el formato con un `formato_version` o una proyección nuevos.
- **La valoración de lo segregable de una nota conjunta** (ADR-030: «el profesional valora qué es
  segregable, dejando constancia»). La copia del paciente entrega el metadato y lo dice. El flujo de
  valoración es otro ticket.
- **Los datos de terceros dentro del `cuerpo` de una nota individual** (art. 18.3). No se pueden filtrar
  automáticamente (ADR-030), y el profesional recibe el aviso. Si el propietario quiere una revisión
  previa obligatoria, es otro ticket.
- **La proyección del paciente pedida por el profesional.** La tabla del propietario no la contempla.
- **La comprobación de huellas dentro del visor.** No la pide ningún criterio. La fórmula va escrita y el
  canónico literal en la copia profesional.
- **Una pantalla de auditoría** que lea `exportaciones`. Queda definido el predicado de «destacada» (D6),
  y la pantalla es el ticket de H25.
- **Storage, URL firmada y destrucción a las 24 h.** El fichero nunca está en el servidor (ADR).
- **Cerrar `accesos_historia_alta` a `tipo = 'exportacion'`** (D7). Es preexistente y se anota como hallazgo.
- **El administrador coterapeuta** que lee una nota por episodio conjunto y quiere la copia por motivo:
  `notas_para_copia` la excluye porque ya la lee, y la vista conjunta no ofrece descarga (C.1.7). Es un
  caso marginal y se anota.
- **Fijar Node en `engines`.** Con el cifrado en el navegador, el servidor no usa Argon2. Solo lo usan las
  pruebas, que fallan con un motivo claro si Node es anterior a 24.7. Se anota para cuando exista CI.

## Decisiones del propietario (02-10-2026)

| Pregunta | Respuesta |
|---|---|
| P1 · Formato | **HTML autodescifrable (Argon2id + AES-256-GCM) con marca de agua.** |
| P2 · Acceso del administrador | **Lista solo con metadatos** en la pestaña Notas (fecha, autor, número de versiones) y la vista «solo copia por motivo». |
| P3 · Aviso | **Al titular y, si es otra persona, también al autor** de la nota. |

**Antes de elegir, el propietario preguntó por un formato que impidiera copiar o hacer capturas.**
Se le explicó que ningún formato lo impide:
- la captura se hace en el sistema o con otra cámara;
- los permisos «no copiar» de un PDF son advertencias que un lector o `qpdf` ignoran con la
  contraseña de apertura;
- un DRM exige lector propietario y un servidor de licencias de un tercero, que sería encargado del
  tratamiento.

La alternativa elegida es la **trazabilidad**.

**Enmienda al diseño (marca de agua), que la fábrica añade por decisión del propietario:**
- **Qué muestra:** el visor, tras descifrar, pinta una marca de agua visible, repetida y en
  diagonal, sobre todo el contenido y en la impresión (`@media print`). Muestra quién exportó
  (nombre y rol), la fecha y hora, el motivo (o «copia profesional») y el **código de la copia**,
  que es el `id` de la fila de `exportaciones`.
- **Dónde va:** dentro de la parte cifrada. Fuera del cifrado sigue sin haber nada identificable;
  el código de la copia puede ir también en la cabecera en claro, porque no identifica al paciente.
- **Prueba:** una prueba del visor comprueba que la marca existe, que lleva el código de la copia
  y que no se pinta con `innerHTML`.
- **Criterio manual nuevo:** al imprimir, la marca de agua sale en cada página.
- La marca disuade y rastrea; **no impide** copiar. El ADR lo dice así, sin prometer más.

### Contrato de la marca de agua (fábrica, 02-10-2026; desarrolla P1)

- **§1.2 gana un campo**: `"exportada_por": {"nombre": "…", "apellidos": "…", "rol": "profesional_sanitario" | "administrador"}`,
  que la base saca del perfil de `auth.uid()` en el mismo acto. `esquemaRespuestaExportar` lo exige.
- **`CopiaV1` gana `marca`**: `{codigo, quien, rol, fecha, motivo}`.
  - `codigo` es `exportacion_id`;
  - `quien` es nombre y apellidos;
  - `rol` es la etiqueta con `t()`, reutilizando la clave de rol que ya exista en `lib/i18n/es.ts` (se
    comprueba, no se inventa);
  - `fecha` es `generada_en` formateada en `zona`;
  - `motivo` es la etiqueta del motivo o `t('exportaciones.marca.copiaProfesional')`.
- **Cabecera en claro**: no cambia; el código **no** va en ella. El formato v1 y su AAD quedan como
  están, y la marca vive solo dentro de la parte cifrada.
- **Visor**: tras descifrar y pintar, hace dos cosas.
  - **Una línea visible y legible** al principio, no oculta a lectores de pantalla:
    `t('exportaciones.visor.marcaLinea')` con los cinco datos.
  - **Una capa `aria-hidden="true"`** sobre el contenido:
    - `position: fixed; inset: 0; pointer-events: none; overflow: hidden`, y
      `print-color-adjust: exact`;
    - filas repetidas del texto `codigo · quien · fecha`, giradas unos −30°, con opacidad baja;
    - construida con `createElement` y `textContent`;
    - con `@media print` se mantiene fija, para que salga en cada página.
- **Pruebas** (`visor-js.test.ts`):
  - tras descifrar existen la línea y la capa, y las dos llevan el `codigo`;
  - la capa es `aria-hidden` y no captura eventos;
  - `VISOR_JS` no contiene `innerHTML`, `outerHTML`, `insertAdjacentHTML` ni `document.write`;
  - `formato.test.ts` comprueba que `proyectar` arma `marca` desde la respuesta.

### Cortes (fábrica, 02-10-2026)

- **Corte A, sin base**:
  - `lib/exportaciones/` salvo `servidor.ts`: `constantes`, `nucleo-js`, `visor-js` (con la marca),
    `fichero`, `cifrar`, `formato` (con `esquemaRespuestaExportar`), `derivar-en-trabajador`;
  - sus pruebas;
  - las claves `exportaciones.copia.*`, `exportaciones.visor.*` y `exportaciones.marca.*` de `lib/i18n/es.ts`;
  - el ADR de cifrado (texto de §A con la marca de agua), con `docs/decisions.md` y `docs/decisions/INDEX.md`.
  - Cierra C4 (la parte de Vitest), C5 (la parte de Vitest), el criterio manual de abrir el fichero (con un
    fichero de muestra que genera una prueba) y la marca.
  - No ocupa la cola de `supabase/`.
- **Corte B, con base y en su turno de la cola**: el resto, que incluye la migración, el banco 24,
  `servidor.ts`, la interfaz, el guion `t040`, `architecture.md` y la accesibilidad.

### Decisiones tras la revisión del corte A (02-10-2026)

- **A-H2 · quien exporta se nombra con `perfiles.nombre_completo`.** `perfiles` no tiene `apellidos`
  (`20260815192424_…:28-33`). §1.2 y el contrato de la marca quedan así:
  `"exportada_por": {"nombre_completo": "…", "rol": "profesional_sanitario" | "administrador"}`, y `marca.quien` es
  `nombre_completo`. En SQL (corte B): `jsonb_build_object('nombre_completo', p.nombre_completo, 'rol', p.rol)`. No se añade
  columna. Al paciente y a los participantes no les afecta: `pacientes` sí tiene `nombre` y `apellidos`.
- **A-H8 · la etiqueta del motivo es la de §1.1, «Requerimiento judicial o inspección»**, sin «de». Una sola etiqueta en
  `lib/i18n/es.ts`, en `etiqueta_motivo_exportacion` (SQL) y en la marca.
- **A-H3 · la marca cubre el contenido a cualquier ancho.** El criterio es medible: a 1920×1080, 1366×768 y 390×844, al menos el
  80 % del área de `<main>` queda bajo alguna fila de la marca. Lo mide una prueba de Playwright sobre el fichero de muestra.
  El método (rejilla repetida, filas centradas o `repeating` por CSS) lo elige el implementador; la capa sigue siendo
  `aria-hidden`, sin eventos, fija y presente al imprimir.
