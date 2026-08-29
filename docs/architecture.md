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
| Paciente · identificativo | `pacientes`, `pacientes_identificacion`, `consentimientos`, `consentimiento_firmantes`, `representantes_paciente` |
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
  sesión» sin rastro.
- La huella anterior son **32 bytes fijos**, así que la concatenación no es ambigua y no
  necesita separador. El primer eslabón usa 32 bytes cero.
- Cada versión guarda su `algoritmo_version`. Cambiar de algoritmo es abrir una era nueva,
  **nunca recalcular lo viejo**.

**El borrador no está en la cadena** (ADR-036). `notas_clinicas` es la cabecera **mutable**
y ahí vive el borrador con su autoguardado; `notas_clinicas_versiones` solo recibe filas
**al firmar**. La frontera es de una frase: *a la cadena se entra firmando*. El borrador es
dato clínico igualmente — mismo RLS, mismo candado, mismo registro de acceso.

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
| DNI y domicilio | Total | Sus pacientes | Sin acceso |
| Motivo de consulta y diagnósticos | Solo los suyos | Sus pacientes | Sin acceso |
| Nivel de riesgo | Solo los suyos | Sus pacientes | Solo indicador binario |
| Notas clínicas | Solo las suyas (+ emergencia) | Autor o asignado | Sin acceso |
| Agenda | Todas | La suya | Todas, sin tipo de terapia |
| Facturación | Total | Lo suyo | Cobros, sin dato clínico |
| Usuarios y ajustes de empresa | Total | Sin acceso | Sin acceso |
| Auditoría | Lectura | Sus propios registros | Sin acceso |

**El secreto profesional es del profesional, no del cargo.** Ser administrador no da
acceso a notas ajenas: existe un **acceso de emergencia** que exige justificación
escrita, caduca solo, se audita de forma destacada y notifica al titular.

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
  cuatro tablas de solo adición. La ventana se prolonga en Server Actions, **jamás en el
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

**Entrar, seguir siendo tú, y seguir delante del teclado** son tres cosas distintas:
contraseña, **TOTP** (ADR-039 — nunca SMS, para los tres roles) y **PIN** (ADR-026). El
administrador puede reponer un TOTP perdido, auditado y con aviso; un PIN, jamás.

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
