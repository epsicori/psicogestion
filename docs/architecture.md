# Arquitectura

Destilado de `documento-maestro.html`. **Consulta este fichero, no el HTML.** Si algo no
está aquí y lo necesitas, búscalo en el HTML por su § y añade el resumen a este fichero.

La **forma** tiene su propio destilado: `interfaz.md`, sacado del prototipo visual
(`/prototipo`). Este fichero manda sobre el modelo y sobre quién ve qué; aquél, sobre qué
pantallas hay y qué muestran. **Cuando chocan, gana este.**

## Topología

**Instancia dedicada por cliente**: un proyecto Supabase y un despliegue Vercel por
clínica, desde un repositorio único. No es multi-tenant — no existe `organizacion_id` en
las filas, porque cada instancia sirve a una sola organización. La tabla `organizacion`
tiene exactamente una fila.

Región **París** (`eu-west-3` / `cdg1`). En desarrollo, Supabase local con Docker.

## Dominios de datos

| Dominio | Tablas |
|---|---|
| Organización | `organizacion` (1 fila), `centros`, `perfiles`, `perfiles_centros`, `preferencias_usuario` |
| Paciente · identificativo | `pacientes`, `pacientes_identificacion`, `pacientes_salud_basica` (alergias y medicación actual, en claro, fuera del candado y de solo adición; ADR-061, ADR-063), `consentimientos`, `consentimiento_firmantes`, `representantes_paciente` |
| Paciente · clínico | `episodios_asistenciales`, `episodio_participantes`, `diagnosticos`, `valoraciones_riesgo`, `notas_clinicas`, `notas_clinicas_versiones`, `evaluaciones`, `evaluacion_archivos`, `informes` |
| Agenda | `tipos_terapia`, `series_cita`, `citas`, `disponibilidad`, `alertas_documentacion` |
| Económico | `tarifas_paciente`, `series_facturacion`, `facturas`, `factura_lineas`, `cobros`, `bonos`, `gastos`, `registro_eventos_sif` |
| Firmas | `firmas_profesional`, `certificados_firma`, `firmas_paciente`, `consentimientos_firmados`, `documentos_firmados` |
| Mensajería | `canales_paciente`, `plantillas_mensaje`, `envios_mensaje`, `enlaces_respuesta`, `respuestas_mensaje` |
| Cumplimiento | `auditoria`, `accesos_historia`, `accesos_historia_vistas`, `notificaciones`, `politicas_retencion`, `exportaciones`, `pines_historia`, `desbloqueos_historia` |

Dos tablas que no estaban en esta lista y aparecieron al implementar T-001, aprobadas por
el propietario el 22-08-2026:

- **`consentimiento_firmantes`** — los «N firmantes» que exige el ADR-028. Tabla hija y no
  un `jsonb`: un array no admite clave ajena, ni índice, ni comprobar que el firmante
  existe, y sin eso «N firmantes» no sería un hecho de la base.
- **`accesos_historia_vistas`** — hija de `accesos_historia`, **también de solo adición**.
  Existe porque el contador de vistas del ADR-037 y el invariante 2 no caben en la misma
  tabla: un contador que se incrementa es un `UPDATE`. La apertura es una fila, cada
  repetición dentro de la ventana es otra, y el contador se **lee** de la vista
  `accesos_historia_resumen` (`security_invoker`), no se almacena.

## Los cuatro invariantes

### 1 · Cadena de huellas

`huella(n) = SHA-256( contenido(n) || huella(n-1) )`

Un solo mecanismo sirve a dos obligaciones legales distintas:
`notas_clinicas_versiones` (Ley 41/2002) y `facturas` (RD 1007/2023 Verifactu).
Alterar un eslabón invalida todos los posteriores, y la verificación nocturna señala
cuál y cuándo.

**Qué es `contenido(n)`** (ADR-035), que sin definir rompe el invariante en silencio: **una
cadena de bytes canónica generada una sola vez al firmar y guardada**. La verificación
vuelve a leer esos bytes; **jamás los deriva otra vez del objeto**.

- Forma canónica **JCS (RFC 8785)** sobre JSON en UTF-8, con **normalización Unicode NFC**
  de todos los valores de texto antes de canonicalizar. Sin NFC, «á» compuesta y precompuesta
  dan dos huellas para el mismo texto visible.
- Se sella un **sobre**, no solo el cuerpo: `cuerpo`, `anotaciones_reservadas`, `autor_id`,
  `creada_en`, `motivo_cambio` y `esquema_version`, más `cita_id`, `abierta_en`,
  `firmada_en` y `redactada_en_sesion` con el margen que aplicó (**ADR-046**). Sellar solo
  el cuerpo dejaría cambiar el autor sin romper la cadena; dejar fuera
  `redactada_en_sesion` dejaría convertir un «lo escribí el viernes» en un «lo escribí en
  sesión» sin rastro. Desde la **era 4** (T-012c, ADR-067) el sobre lleva diecisiete claves:
  a las anteriores suma la identidad de la nota y su cabecera —`nota_id`, `paciente_id`,
  `episodio_id`, `fecha_sesion` (`AAAA-MM-DD`, sin zona; con sufijo ` BC` si es anterior a Cristo) y `coprofesional_id`, siempre
  presente aunque valga `null`—, para que ni mover la versión a otra nota ni reatribuir la
  cabecera pasen sin romper la cadena.
- La huella anterior son **32 bytes fijos**, así que la concatenación no es ambigua y no
  necesita separador. El primer eslabón usa 32 bytes cero.
- Cada versión guarda su `algoritmo_version`. Cambiar de algoritmo es abrir una era nueva,
  **nunca recalcular lo viejo**.

**El borrador no está en la cadena** (ADR-036). `notas_clinicas` es la cabecera **mutable**
y ahí vive el borrador con su autoguardado; `notas_clinicas_versiones` solo recibe filas
**al firmar**. La frontera es de una frase: *a la cadena se entra firmando*. El borrador es
dato clínico igualmente — mismo RLS, mismo candado, mismo registro de acceso.

**Implementación (T-005)**: el canonicalizador JCS + NFC es propio, en `lib/huella/`
(sin dependencia nueva — el ADR-035 existe justamente para que un `npm update` no pueda
mover una huella). El sello lo hace un disparador `before insert` sobre
`notas_clinicas_versiones` —`fn_sellar_version_nota()`, `security definer`—, no una
función de aplicación: la tabla ya concede `insert` directo a `authenticated`, así que una
función aparte sería una puerta y no la única. Calcula `huella`, `huella_anterior`,
`paciente_id` (denormalizado desde `notas_clinicas`, sin clave ajena a propósito) y
`posicion_cadena` (el orden de la cadena, ámbito **el paciente**, no la nota ni el
episodio), y comprueba que el sobre recibido coincide campo a campo con la fila. El SHA-256
lo calcula `extensions.digest()` (pgcrypto): la aplicación nunca calcula huellas, lo que
cierra por construcción el criterio de `blocking-prerender-*` (ADR-043). La serialización
por paciente es un cerrojo consultivo (`pg_advisory_xact_lock`), no un `for no key update`
sobre `pacientes` — esa fila ya la usa la fusión de pacientes (ADR-031) y compartir el
mismo juego de cerrojos abriría interbloqueos nuevos. `esquema_version = 4` desde T-012c
(ADR-046 abrió la 2; versión 1 nunca existió). Antes de nada (paso 0) el disparador exige
que quien firma como `authenticated` sea el autor de la nota y tenga la historia
desbloqueada; cualquier otro caso —nota ajena, inexistente, sobre incoherente,
conjunta— recibe el mismo 42501, sin pistas sobre si la nota existe ni de quién es.
Desde T-036 el disparador añade 6.17-6.24 (23514). La 6.19 (`cita_id` del sobre = el de la
cabecera) vale para todos los roles. El resto va en la guarda P1, solo para
`authenticated`/`anon` (la firma de `postgres`, que es la del importador y la de las pruebas,
queda exenta): 6.17 exige borrador vivo; 6.24 coteja texto y reservadas, en NFC, con el
borrador vigente releído bajo el cerrojo de la cabecera (R2-H1: guardar mientras se firma);
6.18 coteja `abierta_en` con la apertura del borrador; 6.20 acota `creada_en` a ±1 minuto del
reloj de la base. Con cita, 6.21 (solo en la v1), 6.22 (margen) y 6.23 (`redactada_en_sesion`).
Ningún mensaje de 6.17-6.24 contiene la palabra `abierta_en`: `firmarNota` traduce a error
los 23514 que la llevan y el resto a conflicto reintentable. El verificador no recalcula
`redactada_en_sesion` ni coteja `abierta_en` con el borrador: la cita se reprograma (ADR-046)
y el borrador se vacía al firmar, así que ambos darían falsos positivos. El verificador, `verificar_cadena_huellas(uuid)`, vive
en SQL y no en Node —para que reserializar el objeto sea imposible por construcción, no
solo por disciplina— y no se concede a `authenticated`. Desde T-012b también coteja, por
valor y sin reserializar, las columnas que el sobre repite (`alcance`, `autor_id`,
`cuerpo`, `anotaciones_reservadas`, `esquema_version`, `motivo_cambio`, `creada_en`) contra
la fila que las guarda, con motivo `sobre_no_coincide_con_fila` (ADR-057): así se detecta
un `update` con los cerrojos levantados que cambie una de ellas sin tocar el sobre. Desde
T-012c coteja además `nota_id` y `paciente_id` con la fila, y `paciente_id`, `episodio_id`,
`autor_id`, `fecha_sesion` y `coprofesional_id` con la **cabecera** de `notas_clinicas`;
desde T-036 también `cita_id` (6.19).
Fuera del cotejo queda `numero_version`, sin decisión. Y sigue sin cubrir la reescritura completa de la ÚLTIMA versión de una
cadena —columna, sobre y huella a la vez, sin eslabón siguiente que la delate—: ese riesgo
lo acepta el diseño de T-012b y solo lo cierra un anclaje externo, fuera de alcance.
Ejecutable a mano con `npm run verificar:huellas`.

### 2 · Solo adición

`notas_clinicas_versiones`, `facturas`, `auditoria` y `accesos_historia` **revocan
`UPDATE` y `DELETE` a todos los roles**, incluido el propietario. Corregir es añadir una
versión con motivo de cambio. Una factura no se edita: se anula y se reemite.

**Protección en tres capas (necesarias todas)**:
1. **Revoke**: `revoke update, delete on table <tabla> from all roles`.
2. **Trigger `FOR EACH ROW`**: `before update or delete`, lanza `raise exception`.
3. **Trigger `FOR EACH STATEMENT`**: `before truncate` también lanza exception. **TRUNCATE no dispara `FOR EACH ROW` triggers y RLS no lo intercepta** — es agujero crítico.

Supabase regala **`alter default privileges`** a nuevos roles sobre tablas nuevas: TRUNCATE, TRIGGER y REFERENCES. Toda migración debe neutralizar: `alter default privileges in schema public revoke all on tables from anon, authenticated, service_role`.

### 3 · Separación por sensibilidad

Lo que un rol no puede ver **no está en la tabla que sí puede leer**. Por eso
`pacientes` (ficha básica, la ven los tres roles) está separada de
`pacientes_identificacion` (DNI y domicilio) y de `episodios_asistenciales` (motivo de
consulta y diagnósticos). Así la política RLS del rol administrativo es trivial de
auditar y un `select *` olvidado no puede filtrar nada.

### 4 · La serie es la intención, la cita es el hecho

`series_cita` guarda la regla de repetición; al crearla se materializan las `citas` una
a una. Cada cita puede desviarse y queda marcada. **Las citas pasadas de una serie no se
modifican jamás**: tienen notas y cobros colgando.

De aquí sale la regla de zona horaria (ADR-034), que no es una decisión aparte sino este
invariante aplicado al reloj: **la intención se guarda en hora local con su zona IANA**
(`series_cita.hora_local` + `zona_horaria`), **el hecho en instante**
(`citas.inicio` en `timestamptz`, más la zona en que ocurrió). Un `timestamptz` en la serie
es el bug: la serie creada en enero se corre una hora en julio.

- La zona vive en `centros.zona_horaria`, heredada de `organizacion.zona_horaria`
  (`Europe/Madrid` por defecto), validada contra `pg_timezone_names`. **Solo nombres IANA**:
  ni desplazamientos fijos, que dejan de ser ciertos dos veces al año, ni abreviaturas.
- **Anomalías del cambio de hora**: el hueco de marzo se materializa en el instante válido
  más cercano hacia delante; el solapamiento de octubre toma la primera de las dos. Las dos
  quedan **marcadas como desviación**, que es el mecanismo que este invariante ya tiene.
- **Nada se recalcula solo.** Cambiar la zona de un centro o la regla de una serie genera
  una tarea con las citas futuras afectadas (outbox del ADR-024), nunca un movimiento
  automático: `wa.me` no devuelve estado de entrega, así que el sistema no sabe qué citas
  conoce ya el paciente.
- Las horas se **formatean en servidor** en la zona del centro y bajan como cadena. Con
  **`@date-fns/tz`** (`TZDate`, `tz`), que es donde date-fns 4 puso las zonas — **no
  `date-fns-tz`**, que es el paquete de v2 y v3.

## Roles

`administrador` · `profesional_sanitario` · `tecnico_administrativo`

| Recurso | Administrador | Profesional | Técnico administrativo |
|---|---|---|---|
| Ficha básica del paciente | Total | Sus pacientes | Subconjunto de lectura |
| DNI y domicilio | Total | Sus pacientes | Los de sus centros, lectura registrada en `auditoria` (ADR-060) |
| Motivo de consulta y diagnósticos | Solo los suyos | Sus pacientes | Sin acceso |
| Alergias y medicación | Solo los suyos | Sus pacientes | Sin acceso (ADR-061, ADR-063) |
| Nivel de riesgo | Solo los suyos | Sus pacientes | Solo indicador binario |
| Notas clínicas | Solo las suyas (+ emergencia) | Autor o asignado | Sin acceso |
| Agenda | Todas | La suya | Todas, sin tipo de terapia ni episodio; lo elige al dar la cita, solo por las funciones de alta (ADR-074); ve y cambia si es presencial u online (ADR-075) |
| Facturación | Total | Lo suyo | Cobros, sin dato clínico |
| Usuarios y ajustes de empresa | Total | Sin acceso | Sin acceso |
| Auditoría | Lectura | Sus propios registros | Sin acceso |

**Puertas del técnico en agenda (ADR-074, T-028a).** El técnico administrativo agenda, pero no
ve ni fija el tipo de terapia por la tabla: lo hace por `agenda_crear_cita()` y
`agenda_crear_serie()` (definer), que devuelven fechas e ids y nunca el tipo. Tres puertas
quedaron cerradas por política, recreada con el mismo nombre: **H16** (`citas_alta` ya no tiene
rama del técnico), **H23** (`citas_modificacion` tampoco: un `UPDATE` sin `WHERE` y con `SET`
constante no aplica la política de lectura, y la rama del técnico le dejaba reescribir la nota
y el tipo de todas las citas de su centro) y **H24** (`series_cita_lectura`, que lleva el tipo).
La rama del profesional exige además el rol `profesional_sanitario`, así que un técnico que
figure como `profesional_id` de una cita no la modifica por ahí. Una función de alta rechaza
con 22023 un profesional que no sea profesional sanitario o administrador activo. **Sigue
abierta H25**: el técnico lee el tipo en sus filas de `auditoria` (ticket aparte). **Puerta
conocida y aceptada (R2-H1, decisión del propietario del 02-10-2026)**: el técnico deduce el tipo
de una cita por su duración, porque la duración es la del tipo (D1), lee el catálogo
(`tipos_terapia_lectura`) y ve `inicio` y `fin` en `citas_agenda`. Sin cambio de base: ADR-074.2
se lee como «no ve el campo tipo», no como «no puede deducirlo». Residuo
anotado: la cita C18TEC del banco 18 (`profesional_id` = un técnico) sigue legible por él
(`citas_lectura`, 18 R1b) aunque ya no pueda modificarla.

**El secreto profesional es del profesional, no del cargo.** Ser administrador no da
acceso a notas ajenas: existe un **acceso de emergencia** que exige justificación
escrita, caduca solo, se audita de forma destacada y notifica al titular.

**Fuga documentada (hallazgo MEDIA de la revisión con Opus del 30-08-2026, T-005)**: la
política de lectura `notas_clinicas_versiones_lectura` filtra por autor/asignado/episodio
conjunto, pero deja pasar la columna **`posicion_cadena`** entera de cada fila visible. Un
profesional con una sola versión suya en la cadena de un paciente puede ver, en esa misma
fila, que `posicion_cadena` vale por ejemplo 7 — es decir, que **hay otras seis versiones
en la cadena de ese paciente**, aunque no pueda leer su contenido ni saber de quién son.
No es un fallo de código: es una consecuencia del diseño (`security definer` en
`fn_sellar_version_nota()`, cadena a nivel de paciente para que la propiedad de «cadena
íntegra» signifique algo) que no se documentó al decidirlo. Se acepta tal cual — cambiar
el ámbito de numeración a por-nota rompería la propiedad de integridad que la cadena
existe para dar — y queda escrito aquí para que ningún ticket futuro lo redescubra como
sorpresa.

**La matriz es también el guion de la interfaz.** El prototipo está dibujado desde un
único punto de vista y no sabe de roles: cada pantalla se filtra por esta tabla antes de
renderizar. Los **trece** sitios donde el prototipo enseña de más —bandeja clínica global,
nota clínica en la cita, tipo de terapia al técnico, métricas económicas, datos de
identificación en la previsualización, píldoras de estado confundidas con riesgo, y la
historia clínica con dos puertas— están resueltos uno a uno en `interfaz.md` §Donde el
prototipo choca con la arquitectura.

## Candado de la historia clínica

Un tercer control, perpendicular a los otros dos: RLS dice **quién puede leer qué** y el
MFA de sesión **quién ha entrado**; el candado responde a **quién está delante del teclado
ahora**. Existe por la consulta física — el paciente sentado frente a la pantalla mientras
el profesional se levanta. **ADR-026** lo fija entero; lo que manda sobre el modelo:

- **PIN personal de seis dígitos**, hash bcrypt en `pines_historia`, sin `select` para
  ningún rol. Cinco fallos bloquean quince minutos, con entrada en `auditoria` y aviso al
  titular. Lo fija y lo cambia solo su dueño; el administrador puede bloquearlo, nunca
  establecerlo. El técnico administrativo no tiene PIN: no alcanza contenido clínico.
- **Desbloqueo de sesión**, ventana de 15 minutos configurable, en `desbloqueos_historia`.
  Es estado operativo y se actualiza — como el outbox del ADR-024, y a diferencia de las
  tablas de solo adición (`tablas_solo_adicion`). La ventana se prolonga en Server Actions, **jamás en el
  renderizado**.
- **Se hace cumplir en RLS** vía `historia_desbloqueada()`, sobre `episodios_asistenciales`,
  `diagnosticos`, `valoraciones_riesgo`, `notas_clinicas`, `notas_clinicas_versiones`,
  `evaluaciones`, `evaluacion_archivos` e `informes`. Es decir: **contenido**.
- **No cubre recuentos ni estados**. La bandeja de Clínica y las métricas de Inicio salen
  de `alertas_documentacion`. Un candado que tapa los contadores se queda abierto todo el
  día.
- **No es cifrado, no es un permiso y no es el acceso de emergencia.** La emergencia exige
  las dos cosas: PIN vigente *y* justificación escrita.

## Registro de accesos

El maestro exige que **cada lectura** de una historia quede registrada, no solo cada
escritura. La unidad es **un usuario abriendo la historia de un paciente** (ADR-037), no la
fila leída — que daría un registro ilegible y una escritura en cada render.

- Se registra al abrir contenido clínico: quién, qué paciente, cuándo, desde dónde y qué
  pestaña. Las **aperturas repetidas dentro de la ventana del desbloqueo** (ADR-026) son un
  solo acceso con contador de vistas.
- **Las listas no son accesos**: nombre, profesional y estado documental son ficha básica,
  no historia (invariante 3). Las búsquedas van a `auditoria`.
- **La escritura la hace la Server Action de apertura, nunca el componente que pinta.** El
  render sigue siendo lectura pura.
- **La lectura de DNI y domicilio no es esto.** Es dato de gestión, no clínico (invariante
  3), así que su rastro no va a `accesos_historia`: va a `auditoria`, con el verbo
  `LECTURA_IDENTIFICACION` (ADR-060), escrito por `public.leer_identificacion()` en la
  misma transacción que la lectura, una fila por actor, paciente y ventana de quince
  minutos — la misma unidad que arriba.

**Entrar, seguir siendo tú, y seguir delante del teclado** son tres cosas distintas:
contraseña, **TOTP** (ADR-039 — nunca SMS, para los tres roles) y **PIN** (ADR-026). El
administrador puede reponer un TOTP perdido, auditado y con aviso; un PIN, jamás.
**Modo local (T-033)**: con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`, el inicio de sesión
supera él mismo el TOTP, en servidor (`lib/cuentas/modo-desarrollo.ts`, variable sin
`NEXT_PUBLIC_`), y solo para factores cuyo secreto está en `supabase/seed-completo.sql`; la
sesión llega a `aal2` real y ni la guardia ni la base cambian. Exige Supabase en
`http://127.0.0.1`/`localhost`, que ninguna instancia de producción (Supabase en la nube,
§Topología) cumple: mal puesto, el servidor no arranca (`instrumentation.ts`).

## RLS

Activo en **todas** las tablas desde la primera migración. Las políticas se apoyan en
funciones auxiliares para que se lean como frases:

- `rol_actual()` → rol del usuario autenticado **y solo si su perfil está `activo`**
  (ADR-032). `security definer` + `search_path = ''` + sin recursión por construcción
  (ninguna política sobre `perfiles` la invoca). `rol_actual() is not null` significa
  «tengo perfil y estoy activo», y toda política que lo use hereda el corte por baja
- `centros_actuales()` → **conjunto** de centros vigentes del perfil (ADR-033 + ADR-051).
  Es la que usan las políticas: `centro_id in (select public.centros_actuales())`.
  **Acota al técnico administrativo y a nadie más**: vacío para administrador y profesional,
  y es correcto
- `centro_actual()` → el centro **principal**, para lo que necesita exactamente uno —el alta
  de paciente, que decide la retención de esa historia durante veinticinco años (ADR-033)
- `es_profesional_asignado(paciente_id)` → si el usuario actual atiende a ese paciente,
  resolviendo el vínculo de fusión en **un solo salto** (ADR-031). Definer obligatorio:
  como *invoker* consultaría `pacientes` bajo RLS y sería recursión infinita.
  **Rol-agnóstica**, para que ninguna política clínica necesite invocar `rol_actual()`
- `es_profesional_del_episodio(episodio_id)` → participación, no copia (ADR-030). Incluye
  a los participantes dados de baja **del episodio**; exige que el lector siga activo
- `episodio_para_nota(paciente, episodio?, cita?, centro?)` → *invoker*: valida el episodio elegido,
  devuelve el único abierto del llamante con ese paciente, abre uno individual si no hay ninguno
  (centro de la cita o, sin ella, el centro activo que pasa la aplicación en `p_centro_id`),
  y con varios lanza `EP001` «elige episodio» (ADR-071, T-034)
- `nota_tiene_version_conjunta(nota_id)` → definer **por necesidad**: sin ella, la política
  de `notas_clinicas` y la de `notas_clinicas_versiones` se consultan mutuamente y Postgres
  aborta con `infinite recursion detected in policy`
- `historia_desbloqueada()` → si el usuario tiene un desbloqueo de PIN vigente **y su
  perfil sigue activo** (ADR-026 + ADR-032), `stable security definer` + `search_path = ''`.
  **No invoca `crypt`**: solo lee. La regla «`extensions.crypt`, no `crypt`» aplica a las
  funciones de PIN. Sin recursión por construcción: `pines_historia` y
  `desbloqueos_historia` **no tienen ni una política**
- `desbloqueo_vigente()` → cuándo caduca la ventana. Sustituye al `select` sobre
  `desbloqueos_historia`, que se le retira a `authenticated`: la interfaz necesita el
  reloj, no la tabla

**El candado es el único punto por el que pasan las ocho tablas de contenido clínico**, y
por eso el corte por baja se hace cumplir ahí y no en cada política: las políticas clínicas
no invocan `rol_actual()` a propósito —así el administrador no tiene rama propia— y sus
ramas `autor_id = <yo>` no miran el estado de nadie.

**Dos vistas derivadas** hacen lo que un `grant select (columnas)` no puede, porque los
tres roles del dominio comparten el mismo rol de Postgres. Ambas
`security_invoker = false` **y `security_barrier = true`** —sin la barrera el planificador
puede empujar una función barata del usuario por debajo del filtro:

- `pacientes_indicador_riesgo` `(paciente_id, indicador, valorado_en)` → el indicador
  binario del técnico. `nivel`, `descripcion` y `plan_seguridad` **no aparecen en el texto
  de la vista**. **Solo sirve al técnico**: profesional y administrador leen la tabla con
  su política y su candado, y así el ADR-026 la cubre sin excepciones
- `directorio_perfiles` → el directorio de compañeros, **sin `motivo_estado`**. Existe
  porque una política sobre `perfiles` no puede invocar `rol_actual()`

**Cada política tiene su prueba automatizada.** Una política sin test se considera
código no escrito.

**Regla de auditoría en Supabase local**: verificar permisos reales con `\dp` en Studio, no asumirlos. Los grants se especifican explícitamente; Supabase concede por `alter default privileges`.

## Fiscalidad (afecta al modelo, no solo a la interfaz)

El tipo de IVA **se deriva del tipo de servicio**, no se elige a mano:

| Servicio | IVA | Fundamento |
|---|---|---|
| Terapia y evaluación diagnóstica | Exento | Art. 20.Uno.3.º LIVA |
| Informe pericial o para aseguradora | 21 % | Finalidad no asistencial |

Retención IRPF 15 %, o 7 % durante el año de inicio de actividad y los dos siguientes.
Precio = tarifa base del tipo de terapia, salvo `tarifas_paciente` vigente.

## Retención

El reloj arranca al **cerrar el episodio asistencial**, no al crear el registro.
25 años configurables, con mínimos legales bloqueados por debajo. Consentimientos e
informes de alta son de conservación indefinida. La purga anonimiza de forma
irreversible; no borra.

**`politicas_retencion` cuelga del centro**, no de la organización (ADR-033): los mínimos
legales varían por comunidad autónoma —cinco años de norma general del art. 17.1, hasta
quince en Cataluña— y una organización con dos centros tiene dos mínimos. La organización
fija el valor por defecto y el centro lo hereda mientras no lo pise; un centro sin política
propia resuelve a la de la organización, **nunca a nulo**, y eso tiene prueba propia.

## Copias de seguridad

Estaba en el maestro y no en este destilado, que es tanto como no estar. **Tres niveles
independientes**, más la exportación del usuario:

| Nivel | Qué | Cadencia | Se guarda |
|---|---|---|---|
| Continuo | PITR de Supabase | Continuo | 7 días |
| Diario | Volcado lógico cifrado a almacenamiento frío en la UE | Diario | 90 días |
| Mensual | Volcado íntegro con huella registrada | Mensual | 7 años |
| Bajo demanda | Exportación del usuario, cifrada con su contraseña (decisión 4) | Cuando quiera | Suya |

**Una copia de seguridad que nunca se ha restaurado no es una copia de seguridad: es una
suposición.** Prueba de restauración **trimestral obligatoria** sobre una instancia
desechable, con acta del resultado y del tiempo empleado. Es el control que casi nadie
ejecuta y el único que demuestra que las copias sirven — y lo que RGPD art. 32 pide por su
nombre.

**Baja de cliente**: se exporta el volcado cifrado íntegro, se entrega y se destruye la
instancia con certificado de borrado. Procedimiento documentado y ensayado, no improvisado.

## Personas alrededor del paciente

- **Representantes legales** (`representantes_paciente`, ADR-028): tipo, alcance y
  **vigencia**. La capacidad de consentir se **calcula por fecha**
  (`capacidad_consentimiento`), nunca se guarda como bandera. Por debajo de 16 años consiente
  el representante, oído el menor desde los doce; desde los 16 consiente el propio menor. Un
  consentimiento admite **N firmas**, porque el inicio de tratamiento de un menor exige a los
  dos titulares de la patria potestad salvo documento que lo excuse.
- **Participantes de un episodio** (`episodio_participantes`, ADR-030): pareja, familia y
  grupo se modelan en el episodio; **el paciente sigue siendo la persona**. La nota conjunta
  cuelga del episodio, es un solo eslabón de la cadena y **no se entrega entera** en un
  ejercicio de acceso individual.
- **Toda nota cuelga de un episodio** (ADR-071, T-034): `notas_clinicas.episodio_id` es obligatorio,
  del episodio del AUTOR y del mismo paciente o de un participante (la base lo impone con
  `exigir_episodio_coherente_en_nota`). Una nota nueva no cuelga de un episodio cerrado, y
  ninguna nota se mueve a uno cerrado. Si es de coterapia, la nota lleva un `coprofesional_id`
  opcional (quien puede ser autor de notas —profesional sanitario o administrador, el director
  sanitario del ADR-065—, activo, distinto del autor, con alta vigente en el centro del
  episodio; la lista de roles es cerrada y el director administrativo no entra, ADR-073) que no
  da acceso a nada —ninguna política lo lee— y se congela con la primera
  versión (ADR-072). Un episodio con notas no cambia de paciente, de profesional ni de centro
  (ADR-073), y un
  participante con notas no se mueve ni se borra. La aplicación obtiene el episodio con
  `episodio_para_nota()`: abre uno individual si no hay ninguno abierto propio, reutiliza el
  único y exige elegir (`EP001`) si hay varios. El centro del episodio nuevo sale de la cita
  o, sin cita, del centro activo, que la aplicación pasa en `p_centro_id` (la cookie no se lee
  en SQL; sin ninguno de los dos, 22023).
- **La cita y su episodio (ADR-075, T-039)**: `citas` y `series_cita` llevan `episodio_id`
  (clínico, nulo si no hay episodio) y `modalidad_asistencia` (presencial u online, logística).
  Ninguna se escribe a mano: `authenticated` no tiene `insert` ni `update` sobre ellas
  (privilegio por columna) y solo las tocan `agenda_crear_cita`, `agenda_crear_serie`,
  `agenda_cambiar_asistencia`, `agenda_cambiar_episodio_cita`, la nota que documenta la cita y
  los disparadores. El episodio es del mismo profesional, con el paciente como titular o
  participante cubierto por la fecha de la cita, y no cerrado antes de ese día
  (`velar_episodio_de_cita`, 23514). Sin elegirlo, se toma el único abierto del profesional con
  el paciente, o ninguno; nunca se abre uno. El técnico no elige ni ve el episodio (no está en
  `citas_agenda` ni en `agenda_citas_rango`) pero sí ve y cambia la modalidad. La nota de una
  cita va en el episodio de la cita (`exigir_nota_en_episodio_de_su_cita`; el paso 5b de
  `episodio_para_nota` lo devuelve) y una cita con nota no cambia de episodio. Un episodio o
  participante con citas no se mueve, y una cita pasada no cambia de episodio ni de
  modalidad. Las citas de una serie heredan los dos valores de la serie.
- **Duplicados** (ADR-031): no se fusionan, **se vinculan**. `fusionado_en` apunta al
  superviviente, el absorbido queda en solo lectura, nada se repunta y RLS resuelve por el
  vínculo en un solo salto.
- **De quién es el paciente** (`pacientes.titularidad`, enmienda del ADR-032): `organizacion`
  por defecto, o `profesional` cuando el paciente llegó con un colaborador autónomo y la
  relación es suya. La fija el **administrador**, nunca el profesional sobre sí mismo.
  Decide **solo qué pasa en la baja** —los de la organización se reasignan, los suyos se
  traspasan con exportación cifrada y el original se conserva bajo el reloj de retención—;
  **no decide quién factura**. En esta instancia se factura siempre bajo el NIF de la
  organización. Un profesional que emita con **su propio NIF** no es un profesional de esta
  organización: es otra instancia y otro cliente, la misma frontera dura que rige para los
  centros.

## Reserva de anotaciones subjetivas

Art. 18.3 de la Ley 41/2002: el paciente accede a su historia, pero el profesional puede
oponer **la reserva de sus anotaciones subjetivas**, y los datos de terceros recogidos en
interés terapéutico tampoco se entregan.

Por eso la versión de nota tiene **dos cuerpos**, `cuerpo` y `anotaciones_reservadas`
(ADR-027). **Los dos entran en el cómputo de la huella** — una nota es un eslabón, no dos.
La reserva **no es RLS**: quien puede leer la nota lee las dos partes, incluido el
profesional que hereda al paciente (ADR-032). Lo reservado se excluye solo de las **salidas
dirigidas al paciente** —derecho de acceso, informe entregado, exportación, portal de v2—, y
no se opone a un requerimiento judicial.

## Clasificación regulatoria del producto

**Psicogestión no es producto sanitario** (ADR-049). Es software de gestión de consulta:
no diagnostica, no monitoriza, no calcula nada clínico y no recomienda tratamiento. Queda
fuera del MDR (UE) 2017/745, sin marcado CE y sin registro en AEMPS. La clasificación la
hace el fabricante y responde de ella, así que consta escrita y con fecha.

**Tres funciones cruzarían la línea** y convertirían el producto en software como producto
sanitario. Si una entra en un ticket, **el ticket se para y se abre un ADR**:

1. **Corregir una prueba** — derivar puntuación, baremo o interpretación de lo que se
   introduce en `evaluaciones`. Hoy son campos que alguien teclea.
2. **Calcular o proponer un nivel de riesgo** — `valoraciones_riesgo.nivel` lo fija el
   profesional; `indicador` es un `GENERATED` trivial sobre ese nivel y no deriva nada.
3. **Proponer, priorizar o triar** tratamiento, derivación u orden de atención.

**Sin IA en v1**: la sugerencia de hora del alta de cita es determinista y explicable, y se
queda así. Eso deja el AI Act (UE) 2024/1689 fuera entero.

**El EEDS —Reglamento (UE) 2025/327— se vigila, no se implementa todavía.** Psicogestión es
un sistema de historia clínica electrónica y le tocará interoperabilidad y formato europeo
de intercambio; el calendario se confirma contra el texto del reglamento antes de planificar
nada. Lo único que se hace desde ya, porque hoy es gratis: **toda exportación clínica sale
por una capa propia con formato versionado** (`exportaciones`), nunca por un `select`
incrustado en la pantalla; y **todo código clínico se guarda con su sistema y su versión**
(`cie10es_codigo` y `dsm5tr_codigo` separados). Un código sin sistema no se puede mapear.
