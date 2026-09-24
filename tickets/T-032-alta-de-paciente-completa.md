---
id: T-032
titulo: El alta de paciente completa — fecha, sexo, telefono, DNI y domicilio cifrados, alergias y medicacion
modelo: opus
riesgo: alto
delegable: no
fase: 2
prioridad: alta
depende_de: [T-013, T-017]
bloquea: []
estado: en_curso
territorio:
  - docs/decisions/ADR-060.md
  - docs/decisions/ADR-061.md
  - docs/decisions/ADR-062.md
  - docs/decisions/ADR-063.md
  - docs/decisions.md
  - docs/architecture.md
  - docs/interfaz.md
  - docs/state.md
  - docs/bitacora/T-032.md
  - supabase/migrations/**
  - supabase/seed.sql
  - supabase/seed-completo.sql
  - scripts/rls/02-matriz-roles.sql
  - scripts/rls/07-capacidad.sql
  - scripts/rls/08-identificacion.sql
  - scripts/rls/11-cobertura.sql
  - scripts/rls/12-resto-de-tablas.sql  # ADR-063: su aserción fijaba cuatro filas en tablas_solo_adicion
  - scripts/rls/README.md
  - scripts/t032-alta.ts
  - lib/cifrado/**
  - lib/i18n/es.ts
  - lib/supabase/tipos-bd.ts
  - components/ui/area-texto.tsx
  - components/ui/area-texto.test.tsx
  - components/ui/seleccion.tsx
  - components/ui/seleccion.test.tsx
  - app/(app)/pacientes/esquemas.ts
  - app/(app)/pacientes/esquemas.test.ts
  - app/(app)/pacientes/acciones.ts
  - app/(app)/pacientes/formulario-nuevo-paciente.tsx
  - app/(app)/pacientes/formulario-nuevo-paciente.test.tsx
  - app/(app)/pacientes/[id]/datos.ts
  - app/(app)/pacientes/[id]/panel-datos.tsx
  - app/(app)/pacientes/[id]/page.tsx
  - app/(app)/pacientes/acciones.test.ts
  - app/(app)/pacientes/[id]/panel-datos.test.tsx
  - app/(app)/pacientes/[id]/panel-diferido.tsx
  - app/(app)/pacientes/[id]/panel-diferido.test.tsx
  - tickets/T-032/**
---

# Contexto

El propietario cerró el 16-09-2026 siete decisiones sobre el alta de paciente, las cuatro
primeras respondiendo a un formulario y las tres últimas tras contrastar con el sector qué
campos exigen la Ley 41/2002, el RD 1093/2010 (conjunto mínimo de datos de la historia
clínica), el art. 9 del RGPD y `Patient` de HL7 FHIR. Literales, y lo que significan aquí:

1. **El alta sigue siendo mínima**, y gana **teléfono opcional**: «Los pacientes tienen su
   número personal, por tanto tiene que estar representado». Columna nueva en `pacientes`;
   `representantes_paciente.telefono` sigue siendo el del representante y se sigue enseñando
   como suyo.
2. **DNI y domicilio entran en este mismo ticket**: «Dentro del mismo ticket que amplíe el
   formulario de alta». Opcionales, y por el camino de cifrado del **ADR-029**, que lleva
   aceptado desde el 21-08-2026 y **sin una sola línea de aplicación**.
3. **Administrador y técnico administrativo los ven en claro, «sin fricción extra»**: es
   lectura de gestión, no clínica. Ni PIN del ADR-026, ni fila en `accesos_historia`.
   **Corrección del propietario al aprobar el ADR-060 (16-09-2026)**: sin fricción **no es sin
   rastro**. Cada lectura de identificación deja una fila en `auditoria` con el verbo nuevo
   `LECTURA_IDENTIFICACION`, que es donde el propio ADR-037 manda los accesos a datos
   personales que **no** son abrir una historia («las búsquedas van a `auditoria`»).
4. **`fecha_nacimiento` pasa a obligatoria en el alta.** La columna existe desde T-001 y
   sostiene `capacidad_consentimiento()` (ADR-028), pero el formulario nunca la ha pedido:
   hoy **nadie la rellena**, así que la capacidad de consentimiento de todo paciente creado
   por la aplicación devuelve `desconocida`.
5. **Sexo: un solo campo administrativo** (hombre / mujer / otro, RD 1093/2010). **No** se
   separa de identidad de género como hace FHIR R5.
6. **Alergias y medicación actual**, texto libre: «la medicación puede afectar al estado del
   paciente, además en caso de derivación sería importante». No existe en ningún sitio del
   esquema.
7. **El contacto de emergencia no es una tabla nueva**: es `representantes_paciente` con
   `alcance_representacion = 'solo_contacto'`, valor que existe en el enum desde T-001 y que
   **no usa nadie**.

Lo comprobado en el árbol —con ruta y línea— está en `tickets/T-032/diseno.md` §0. Lo que hay
que saber antes de leer las tareas:

- `pacientes_identificacion` existe con sus diez columnas de criptograma y su índice único
  sobre `dni_indice`; ninguna línea de `lib/` ni de `app/` la escribe ni la lee.
- `app/(app)/pacientes/[id]/panel-datos.tsx` y `[id]/page.tsx` llevan escrito en su cabecera
  por qué no enseñan DNI, domicilio ni teléfono: «no hay camino de descifrado escrito». Este
  ticket lo escribe, así que esos dos comentarios dejan de ser ciertos el mismo día.
- `lib/identidad/` (T-017) ya trae `validarNif`/`normalizarNif` —la normalización exacta que
  el ADR-029 exige antes del HMAC, documentada allí como intocable sin migrar el índice— y
  `validarTelefono`/`normalizarTelefono`/`formatearTelefono`. **No se reescribe ninguna
  validación**: se compone. `lib/identidad/` es carril ajeno y **no se toca**.
- `capacidad_consentimiento()` solo mira `alcance = 'patria_potestad'`, así que un
  `solo_contacto` no consiente nada. **Pero `consentimiento_firmantes.representante_id` no
  comprueba el alcance**: hoy nadie impide nombrar firmante a un contacto de emergencia. El
  agujero es teórico mientras el valor no se use, y este ticket lo estrena.

**Dos decisiones chocan con la arquitectura escrita y por eso el ticket empieza por tres
ADR**: la 3 contra la matriz de `docs/architecture.md` §Roles («DNI y domicilio · Técnico
administrativo · Sin acceso»), el choque 5 de `docs/interfaz.md` y el comentario de la
migración de T-002; y la 6 porque mete **dato de salud** en un esquema donde todo lo clínico
está bajo el candado del ADR-026. **El propietario aprobó las dos enmiendas el 16-09-2026**,
con dos correcciones ya incorporadas a estas tareas: el descifrado del técnico **deja rastro en
`auditoria`** (ADR-060) y `pacientes_salud_basica` **no la ve el técnico en absoluto**
(ADR-061). El ticket no espera ningún gate: lo que hay debajo es ya la versión aprobada.

# Cortes

Dos commits, dos revisiones, por el mismo motivo que T-013 y T-012a: **que cada revisión mire
una sola cosa**.

- **Corte A — esquema, claves y RLS.** ADR, migración, `lib/cifrado/`, banco de RLS, guion de
  punta a punta. Ni una línea de interfaz.
- **Corte B — formulario y ficha.** Esquemas Zod, dos primitivas, formulario de alta, Server
  Action, `panel-datos.tsx`. No toca ninguna política ni ninguna clave.

# Tareas

## 0 · Tres verificaciones que cambian el diseño (antes de escribir nada)

- [ ] **El Vault existe en local y `postgres` lo lee**: `select extname from pg_extension where
      extname = 'supabase_vault'` devuelve fila, y `select count(*) from
      vault.decrypted_secrets` funciona **como `postgres`**, que es quien aplica las
      migraciones y será dueño de la función definer. Si no, **BLOQUEO**: el ADR-029 pone las
      claves en el Vault y la alternativa (variable de entorno) es otro ADR, no un apaño.
- [ ] **Cómo viaja un `bytea` por PostgREST**: insertar una fila de prueba y leerla con
      `supabase-js`. Se espera hexadecimal con prefijo `\x`. Si llega de otra forma, se ajusta
      `lib/cifrado/bytea.ts` y **se anota en la bitácora**; lo que no se hace es adivinar.
- [ ] **Qué exige el login por API**: que una sesión creada con `ana@psicogestion.test` /
      `psico1234` baste hoy para insertar en `pacientes`. Si alguna guarda exige `aal2`, el
      guion de la tarea 9 usa el camino de `psql` con `request.jwt.claims` del banco, y lo dice.

## 1 · Corte A · Tres ADR, antes que cualquier política

- [ ] **ADR-060** — el técnico administrativo **lee** DNI y domicilio de los pacientes **de sus
      centros**, sin PIN; **no escribe** ninguno de los dos; el invariante 3 sigue justificando
      la tabla aparte, y el ADR enumera por qué. Y **toda lectura deja rastro**: el camino de
      lectura de la aplicación pasa a ser `leer_identificacion()`, que devuelve el criptograma
      **y** escribe la fila de `auditoria` en la misma transacción, **para los tres roles** y no
      solo para el técnico. Sin PIN no es sin registro. El ADR dice también lo que el rastro no
      cubre: es del **acceso al criptograma**, no del descifrado en Node —la base no ve
      descifrar—, **N lecturas dentro de una ventana de 15 minutos son una sola fila**
      (ADR-037), y un `select` directo por PostgREST sigue sin dejar rastro porque sin clave no
      descifra nada.
- [ ] **ADR-061** — alergias y medicación viven en **tabla propia**, `pacientes_salud_basica`,
      **fuera del candado** (una alergia detrás de un PIN es el contador tapado que el propio
      ADR-026 prohíbe), **sin cifrar** (cifrar la medicación y no la nota clínica sería teatro:
      la nota se guarda en claro y la protege la RLS) y **sin el técnico administrativo**. El
      «sin el técnico» es **condición de la aprobación del propietario** (16-09-2026), no una
      preferencia del diseño: la tabla no lleva **ni una** política para el rol técnico, ni de
      lectura ni de escritura, y el banco lo comprueba con TEC1 **y** TEC2.
- [ ] **ADR-062** — el sexo es **un solo campo administrativo** con los tres valores del RD
      1093/2010. Queda bloqueado: modelar identidad de género en v1, y usar este campo como si
      lo fuera.
- [ ] **ADR-063** *(decisión del propietario del 24-09-2026, enmienda al ADR-061)* — alergias
      y medicación son **de solo adición** (regla 6 de la constitución): cada cambio es una
      fila nueva con quién y cuándo, lo vigente es la última, y la base impide `update`,
      `delete` y `truncate` con las tres capas del T-004 (la tabla entra en
      `tablas_solo_adicion`). Recoge también el criterio 7: las ve solo el profesional
      asignado, administrador incluido.
- [ ] Cuatro filas nuevas en `docs/decisions.md`. **Ningún ADR anterior se edita.**
- [ ] `docs/architecture.md`: la celda «DNI y domicilio · Técnico administrativo» pasa a «Los
      de sus centros, lectura **registrada en `auditoria`**» con referencia al ADR-060;
      §Registro de accesos gana la línea del verbo `LECTURA_IDENTIFICACION` y de dónde vive
      (`auditoria`, no `accesos_historia`); `pacientes_salud_basica` entra en la tabla de
      dominios de datos (fila «Paciente · identificativo», con la nota del ADR-061).
- [ ] `docs/interfaz.md` choque 5: se corrige la frase «donde el técnico administrativo no
      entra». El resto del choque —el panel se construye campo a campo y desaparece entero si
      no queda ninguno— **sigue vigente y manda en la tarea 8**.

## 2 · Corte A · Migración

Un fichero, sello mayor que la última migración de `main` **en el momento de integrar** (hoy
`20260915120000`; T-012a lleva otra en vuelo).

- [ ] **`pacientes.telefono text`** nulable, con `check` de forma E.164 y `comment on column`:
      se guarda normalizado porque `wa.me` no admite espacios (ADR-023). **Sin índice y sin
      unicidad**: dos hermanos comparten teléfono.
- [ ] **`pacientes.sexo public.sexo_administrativo`** nulable, enum nuevo
      `('hombre','mujer','otro')`, con comentario que cite el RD 1093/2010 y el ADR-062.
- [ ] **`comment on column public.pacientes.fecha_nacimiento`**: obligatoria en el alta desde
      T-032, **nulable en la tabla** porque hay filas anteriores sin ella y porque la rama
      `desconocida` de `capacidad_consentimiento()` tiene que seguir existiendo. Ponerla
      `not null` es otra migración, cuando no queden nulos.
- [ ] **`pacientes_identificacion` admite domicilio sin documento**: el grupo del documento
      pasa a todo-o-nada nulable y una restricción nueva impide la fila vacía. Sin esto, dar
      solo el domicilio sería imposible y el formulario tendría que mentir. Forma exacta en el
      diseño §1.2.
- [ ] **`public.pacientes_salud_basica`** (ADR-061 y ADR-063): `id` clave primaria,
      `paciente_id`, `alergias text`, `medicacion_actual text`, quién y cuándo. RLS activada
      en el mismo fichero, `revoke all` y después `grant select, insert to authenticated`
      —cero `update`, cero `delete`, cero `anon`, cero `service_role`—, dos políticas, las
      tres capas de solo adición con su fila en `tablas_solo_adicion`, y disparador de
      auditoría **con las dos columnas de contenido recortadas**.
- [ ] **`public.clave_de_cifrado(p_nombre text)`**, `security definer`, `set search_path = ''`,
      que lee `vault.decrypted_secrets`, **acepta solo los dos nombres de este ticket** y lanza
      si el secreto no existe. `revoke execute … from public, anon, authenticated` y
      `grant execute … to service_role`, y a nadie más.
- [ ] **`public.alta_paciente(…)`**, `security invoker`, que escribe en `pacientes`,
      `pacientes_identificacion` y `pacientes_salud_basica` **en una sola transacción** y
      devuelve el uuid. Criptogramas en base64 como `text`, que la función `decode`. Rechaza
      `p_fecha_nacimiento` nula con `23514`. Existe por un motivo que se escribe en su
      comentario: **`DELETE` sobre `pacientes` es imposible para todos los roles**, así que dos
      viajes sueltos dejarían un paciente fantasma cada vez que el DNI estuviera repetido.
- [ ] **Política `pacientes_identificacion_lectura_tecnico`**, solo `select`, acotada con
      `centro_id in (select public.centros_actuales())` igual que
      `pacientes_lectura_tecnico_de_su_centro` (ADR-033 + ADR-051), con su `comment on policy`
      citando el ADR-060.
- [ ] **El verbo `LECTURA_IDENTIFICACION`** (ADR-060): se ensancha `auditoria_operacion_check`
      hacia delante y sin tocar una fila —igual que hizo T-004 al añadir `SESION`, `BUSQUEDA`,
      `PIN_*` y `TITULARIDAD`—, **copiando la lista entera**, y se vuelve a definir
      `public.registrar_evento_auditable(...)` con ese verbo en su lista blanca: **misma firma,
      mismo cuerpo, una línea distinta**. Su `comment on function` se reescribe, porque hoy el
      catálogo dice «sesión, búsqueda, titularidad» y dejará de ser cierto.
- [ ] **`public.leer_identificacion(p_paciente_id uuid)`**, `security invoker`, `volatile`, con
      `set search_path = ''`: el **único** camino por el que la aplicación lee identificación.
      Devuelve el criptograma —**sin `dni_indice`**— y registra la lectura en `auditoria` **en
      la misma transacción**: si el registro falla, no hay lectura. Una fila por actor, paciente
      y ventana de 15 minutos; sin fila legible, **ni se devuelve nada ni se registra nada**.
      `revoke ... from public, anon` y `grant execute ... to authenticated`. Forma exacta en el
      diseño §1.2 §7.1.
- [ ] **`fn_firmante_no_es_solo_contacto()`**, disparador `before insert or update` sobre
      `consentimiento_firmantes`: un representante con `alcance = 'solo_contacto'` no puede ser
      firmante, `23514`. Es lo que hace verdadera la decisión 7, y una clave ajena no puede
      comprobarlo.
- [ ] `comment on policy pacientes_identificacion_lectura` reescrito: hoy la migración de T-002
      dice que el técnico no tiene ninguna política. Esa frase no puede quedar en pie.

## 3 · Corte A · Las claves en el Vault

- [ ] `supabase/seed.sql` crea con `vault.create_secret` los dos secretos de desarrollo
      —`identificacion_cifrado_v1` e `identificacion_indice_v1`, 32 bytes en base64, marcados
      como de juguete—, para que `npx supabase db reset` deje la base usable sin ningún paso
      manual.
- [ ] Lo mismo en `supabase/seed-completo.sql`, con **los mismos valores**: lo que sembró un
      guion tiene que descifrarlo el otro.
- [ ] El procedimiento de producción (crear los secretos una vez, a mano, con el patrón de
      `scripts/vault-smtp.sql`) se documenta en la bitácora del ticket. No se automatiza.

## 4 · Corte A · `lib/cifrado/`, el módulo que no existe

- [ ] `lib/cifrado/aes-gcm.ts` — **puro, sin `server-only`**: `cifrar(clave, texto)` →
      `{cifrado, nonce, etiqueta}` con nonce de 12 bytes de `randomBytes`;
      `descifrar(clave, sobre)` que **lanza** si la etiqueta no cuadra; `indice(clave, texto)`
      con HMAC-SHA-256. Comprueba que la clave mide 32 bytes.
- [ ] `lib/cifrado/bytea.ts` — `aBase64()` y `desdeBytea()`, con la forma que confirmó la tarea
      0 y un error claro si llega otra.
- [ ] `lib/cifrado/claves.ts` — `server-only`. Lee los dos secretos con el cliente de
      administración y `clave_de_cifrado`, los memoriza por proceso y **nunca cae a una clave
      por defecto**: si falta el secreto, lanza diciendo qué hay que ejecutar.
- [ ] `lib/cifrado/identificacion.ts` — `server-only`. `cifrarIdentificacion({dni, domicilio})`
      → las columnas listas para `alta_paciente`, con `tipo_documento` **derivado** del propio
      documento (jamás preguntado); `descifrarIdentificacion(fila)` → `{documento, domicilio}`.
- [ ] Pruebas junto a cada módulo. Las cinco que no pueden faltar: ida y vuelta; dos cifrados
      del mismo texto **no coinciden**; tocar un byte del criptograma **o de la etiqueta** hace
      lanzar; `12345678z`, `12345678-Z` y ` 12345678 Z ` dan **el mismo** índice; y ese índice
      **no** coincide con el HMAC calculado con la clave de cifrado.

## 5 · Corte A · Banco de RLS

- [ ] `02-matriz-roles.sql`: la aserción «TEC1 NO debe ver identificación» **cambia de signo** y
      gana su gemela: TEC1 ve la de P1 (centro A) y **no** la de P2 (centro B). Bloque nuevo
      para `pacientes_salud_basica` con los tres roles.
- [ ] `08-identificacion.sql`: el técnico **no** inserta ni actualiza
      (`assert_lanza_codigo(…, '42501')`, nunca `assert_lanza` a secas, sobre una fila que sí
      puede leer); `authenticated` **no** ejecuta `clave_de_cifrado` (42501) y `postgres` sí; el
      índice único sigue rechazando el alta doble; una fila **solo con domicilio** entra y una
      **vacía del todo** se rechaza con `23514`; `alta_paciente` con fecha nula, `23514`. **Y
      el rastro**: `leer_identificacion()` como TEC1 sobre P1 devuelve fila **y añade una** en
      `auditoria` con `operacion = 'LECTURA_IDENTIFICACION'`, `actor_id` = TEC1 y
      `registro_id` = P1; la **segunda llamada seguida no añade ninguna**; sobre P2 (otro
      centro) **ni fila ni rastro**; y las gemelas de ADM y PRO1, que también dejan rastro.
      Una aserción más, de guardia: `registrar_evento_auditable('BUSQUEDA', …)` **sigue
      funcionando** después de la redefinición.
- [ ] `07-capacidad.sql`: un representante `solo_contacto` **no** aparece nunca en
      `capacidad_consentimiento()` —con su gemela: el mismo menor con un `patria_potestad`
      vigente sí devuelve representante— y **no** puede ser firmante (`23514`), con la gemela
      positiva del `patria_potestad` que sí puede.
- [ ] `11-cobertura.sql`: los cuatro nombres de política nuevos.
- [ ] `scripts/rls/README.md`: las filas de `07` y `08` mencionan lo nuevo.

## 6 · Corte A · Demostración de punta a punta

- [ ] `scripts/t032-alta.ts`, con `npx tsx`: cifra con el módulo real, llama a `alta_paciente`
      con una sesión real de profesional, lee de vuelta **por `leer_identificacion()`**,
      descifra y compara, y cuenta las filas de `auditoria` con `LECTURA_IDENTIFICACION` antes
      y después —sube exactamente en 1, y una segunda lectura seguida no lo mueve—; repite con el
      **mismo** DNI y comprueba que falla **y que no ha quedado ningún paciente nuevo**. Es la
      prueba de que la transacción es de verdad, y el motivo por el que la función existe.

## 7 · Corte B · Esquemas y primitivas

- [ ] `esquemas.ts`: `fechaNacimiento` **obligatoria** (no futura, no anterior a 1900, la edad
      máxima que fije el diseño), y `sexo`, `telefono`, `dni`, `domicilio`, `alergias` y
      `medicacionActual` **opcionales**, con «vacío es ausente» —un `''` de un input no es un
      valor—, compuestos sobre las funciones de `lib/identidad` y con los mensajes en
      `lib/i18n/es.ts`.
- [ ] `components/ui/area-texto.tsx` y `components/ui/seleccion.tsx`: mismo contrato que
      `Field` (etiqueta, `errores`, resto de props al control) para que `register()` siga
      funcionando. `components/ui/field.tsx` **no se toca**. Una prueba cada una: etiqueta
      asociada al control y error anunciado por `aria-describedby`.

## 8 · Corte B · Formulario, acción y ficha

- [ ] `formulario-nuevo-paciente.tsx`: fila visible con **nombre, apellidos y fecha de
      nacimiento**, y el resto dentro de un `<details>` «Más datos (opcional)» —nativo, sin
      JavaScript de foco: la lección de T-007 es que un desplegable propio cuesta tres vueltas
      y aquí no aporta nada—. Las etiquetas dicen «(opcional)» desde el catálogo.
- [ ] `acciones.ts`: un solo viaje, `supabase.rpc('alta_paciente', …)`, con los criptogramas ya
      calculados. El `23505` del índice único se traduce a **error del campo `dni`** con el
      texto del ADR-031 (el duplicado se vincula, no se duplica); cualquier otro error, mensaje
      genérico y `console.error`. `profesional_id` sigue saliendo de la sesión.
- [ ] `[id]/datos.ts`: `cargarIdentificacion()` y `cargarSaludBasica()`, las dos con resultado
      de **tres estados** (`ok`, `sin-datos`, `no-legible`). Un fallo de descifrado **jamás** se
      pinta como «no hay DNI»: sería afirmar un hecho falso sobre el expediente (choque 5).
      `cargarIdentificacion()` lee con `supabase.rpc('leer_identificacion', …)` y **nunca** con
      un `select` a `pacientes_identificacion`: el `select` directo no deja rastro. Memoizada
      con `cache()` de React y **jamás** bajo `use cache` —una ficha servida de caché sería un
      DNI mirado sin fila en `auditoria`—.
- [ ] `[id]/panel-datos.tsx`: bloque de identificación (documento y domicilio), sexo y teléfono
      del paciente —formateado con `formatearTelefono`—, bloque de alergias y medicación **que
      al técnico no le aparece en absoluto**, y el bloque de contacto partido en dos:
      **representación legal** (patria potestad, custodia) y **contacto de emergencia**
      (`solo_contacto`), que no se mezclan nunca en la misma lista.
- [ ] Los comentarios de cabecera de `panel-datos.tsx` y de `[id]/page.tsx` se reescriben: hoy
      afirman que no existe camino de descifrado.

## 9 · Memoria

- [ ] `docs/bitacora/T-032.md` con la evidencia de cada criterio.
- [ ] `docs/state.md` reescrito (≤ 80 líneas): salen los dos hallazgos que este ticket cierra;
      **entra** el que no cierra —`alta_paciente()` no fija `centro_id` (ADR-033), así que el
      técnico no ve a los pacientes creados desde el formulario— con su ticket propuesto.

# Criterios de aceptacion

1. **La base se levanta sola.** `npx supabase db reset` aplica limpio y siembra; después
   `select name from vault.secrets order by name` muestra los dos secretos y
   `select length(public.clave_de_cifrado('identificacion_cifrado_v1'))` devuelve 44.
2. **Los tipos se regeneran, no se escriben.** `npm run tipos`; `git diff
   lib/supabase/tipos-bd.ts` enseña `telefono` y `sexo` en `pacientes`, el enum
   `sexo_administrativo`, la tabla `pacientes_salud_basica`, los cinco campos del documento (tipo y cuarteto) ya
   nulables y `alta_paciente` y `leer_identificacion` en `Functions`. Ninguna otra línea.
3. `npm run lint:migraciones` sin hallazgos, con el fichero nuevo en el total.
4. **La clave no la alcanza el navegador.** En el banco, `authenticated` ejecutando
   `public.clave_de_cifrado('identificacion_cifrado_v1')` falla con **42501**, y la gemela
   positiva la obtiene. Sin gemela no prueba nada.
5. **El técnico lee lo de sus centros y solo eso.** `npm run test:rls` verde con las aserciones
   de la tarea 5; el total sube respecto a las **380** de `main` y la bitácora anota el número.
6. **El técnico no escribe identificación**: el `insert` como TEC1 falla con **42501**; el
   `update` como TEC1 afecta **cero filas** y la fila queda intacta, sobre una fila que TEC1
   **sí** puede leer (si no, el cero podría ser la RLS ocultándola). *(Reformulado por el
   propietario el 23-09-2026: un `update` sin política de modificación da cero filas, no 42501.)*
7. **Salud básica solo para el profesional asignado**: cero filas para TEC1 y TEC2, y cero
   para el administrador sobre un paciente que no tiene asignado; gemelas del profesional
   asignado y del administrador sobre un paciente suyo, que sí las ven. *(Decisión del
   propietario del 23-09-2026: alergias y medicación siguen la fila «Motivo de consulta y
   diagnósticos» de la matriz de `docs/architecture.md` —administrador, solo los suyos—.)*
   Y es de solo adición (ADR-063): `10-solo-adicion` la recorre porque está en
   `tablas_solo_adicion`, y `cobertura_solo_adicion()` sigue en cero.
8. **Un contacto de emergencia no consiente ni firma.** `capacidad_consentimiento()` sobre un
   menor cuyo único representante es `solo_contacto` devuelve `representante_id` nulo; e
   insertarlo en `consentimiento_firmantes` falla con **23514**. Las dos con su gemela
   positiva sobre `patria_potestad`.
9. **Ida y vuelta real.** `npx tsx scripts/t032-alta.ts` sale con 0 e imprime el DNI descifrado
   igual al enviado.
10. **La transacción es de verdad.** El mismo guion con el DNI repetido: la llamada falla y
    `select count(*) from public.pacientes` vale lo mismo que antes. Se pega la salida.
11. **La fecha de nacimiento no se puede omitir por el camino de la aplicación**: el formulario
    no envía sin ella, la acción la rechaza con el mismo esquema, y `alta_paciente` con nulo
    lanza `23514`. Los tres, demostrados por separado.
12. **El alta mínima sigue siendo mínima.** `npm test` verde: con los seis campos opcionales
    vacíos se crea el paciente y **no** se crea fila en `pacientes_identificacion` ni en
    `pacientes_salud_basica`.
13. **Un domicilio sin documento se guarda**, y la ficha lo enseña.
14. **El índice ciego es el del ADR-029**: prueba unitaria con las tres formas del mismo DNI
    dando el mismo índice, que cambia con la clave y que no coincide con el HMAC de la clave de
    cifrado.
15. **Un criptograma manipulado no se pinta**: prueba unitaria de que `descifrar` lanza con un
    byte cambiado, y prueba de componente de que la ficha dice «no se puede mostrar» en vez de
    «sin DNI».
16. `npm run lint` y `npm run build` limpios, sin `blocking-prerender-*` nuevos.
17. **Guion de navegador** (si no da tiempo, queda anotado como verificación manual pendiente):
    con las tres sesiones, la ficha de un paciente con DNI enseña documento y domicilio al
    administrador, al profesional asignado y al técnico **de ese centro**; al técnico de otro
    centro el bloque **no aparece**, ni vacío ni tachado; el bloque de alergias y medicación no
    aparece **a ningún** técnico.
18. **El descifrado deja rastro, y solo uno por ventana.** En el banco: TEC1 llamando a
    `leer_identificacion(P1)` recibe fila **y** deja una fila nueva en `auditoria`
    (`operacion = 'LECTURA_IDENTIFICACION'`, `actor_id` = TEC1, `registro_id` = P1); la segunda
    llamada seguida **no** añade otra; `leer_identificacion(P2)` —otro centro— no devuelve fila
    **ni** escribe rastro. Y en el guion de punta a punta, el recuento con ese verbo sube
    exactamente en 1 al leer la ficha. Se pega la salida.
19. **El rastro no lleva dentro ni el criptograma ni el dato.** `select estado_posterior from
    public.auditoria where operacion = 'LECTURA_IDENTIFICACION'` enseña **solo** `rol`,
    `documento` y `domicilio` (dos booleanos de presencia): ni nonce, ni etiqueta, ni
    `dni_indice`, ni una letra del DNI. Se lee con los ojos y se pega en la bitácora.
20. **Nadie lee identificación por la puerta de atrás dentro del producto**:
    `git grep -n "pacientes_identificacion" app/ lib/` no enseña ni un `.from(...)`; el único
    lector es el RPC.

# Fuera de alcance

- **Buscar por DNI.** El índice HMAC queda construido y expuesto en `lib/cifrado/`; el buscador
  de recepción y el importador son sus tickets.
- **Editar** después del alta cualquiera de los campos nuevos, y **dar de alta representantes o
  contactos de emergencia por pantalla**: hoy no existe formulario para representantes y este
  ticket no lo inventa. Lo que sí queda garantizado es la semántica y cómo se enseñan.
- **Pasaporte**: `tipo_documento` lo admite desde T-001, pero `lib/identidad` no valida
  pasaportes y este ticket no inventa esa validación. Se derivan `dni` y `nie`.
- **Rotar claves**: mantenimiento planificado del ADR-029. Las columnas de versión se rellenan
  con 1 y el módulo elige clave por versión; el guion de rotación, no.
- **Registrar el descifrado en `accesos_historia`**, y **la pantalla que enseñe el rastro**: el
  rastro se escribe en `auditoria` (ADR-060 corregido), que es la tabla de gestión y de solo
  adición; meterlo en `accesos_historia` contradiría el ADR-037 y exigiría desbloqueo vigente
  para una lectura que no es clínica. La pantalla de auditoría es de fase 1 y tiene su ticket.
  Tampoco entra registrar la **búsqueda por DNI**, que todavía no existe.
- **Encadenar por huella el historial de alergias y medicación** (ADR-063 lo deja de solo
  adición, sin huella), y la pantalla para editarlas o consultar su historial.
- **`centro_id` en el alta** (ADR-033): hoy no se fija y este ticket no cambia esa conducta. Se
  anota como hallazgo.
- **`fecha_nacimiento not null` en la tabla**, identidad de género, correo del paciente, segundo
  teléfono, teléfono en la lista de pacientes.
