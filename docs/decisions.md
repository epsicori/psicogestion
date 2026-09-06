# Decisiones (ADR)

22 decisiones cerradas el 15-08-2026. Cada una con su § en `documento-maestro.html` por
si hace falta el razonamiento completo. **Un ticket que contradiga una de estas se para
y se escala al usuario** (regla de escalado de la fábrica).

## Fundacionales

| # | Decisión | Consecuencia | § |
|---|---|---|---|
| 1 | **Instancia dedicada por cliente** | Sin `organizacion_id` en las filas; `organizacion` tiene una sola fila. Hará falta un plano de control a partir del tercer cliente | §1, §3.2 |
| 2 | **Verifactu desde el diseño**, modo VERI\*FACTU | Facturas inmutables con huella encadenada, QR y remisión a AEAT. No existe «editar factura» | §1, §2.3 |
| 3 | **Next.js App Router + TypeScript** | Server Components: los historiales no viajan al cliente. Tipos de la BD generados por Supabase | §1, §3.1 |
| 4 | **Cifrado de exportaciones con clave del usuario** | Argon2id + AES-256. La contraseña no se persiste jamás. Sin recuperación posible | §1, §5.4 |

## De alcance

| # | Decisión | Consecuencia | § |
|---|---|---|---|
| 5 | Administrador **no** lee notas ajenas | Acceso de emergencia con justificación, caducidad, auditoría destacada y aviso al titular | §5.1 |
| 6 | Técnico administrativo ve **solo indicador binario** de riesgo | Columna derivada, nunca el dato. RLS propia sobre `valoraciones_riesgo` | §5.1 |
| 7 | **CIE-10-ES** + campo paralelo DSM-5-TR | Dos columnas en `diagnosticos`; catálogo precargado | §10 |
| 8 | Retención **25 años** configurable | Solo el administrador la cambia; mínimos legales bloqueados por debajo | §5.7 |
| 9 | Firma en **dos capas** | Rúbrica manuscrita (visible) + cualificada eIDAS (jurídica). Justificada por los informes periciales, que van a juzgados | §2.6, §6.7 |
| 10 | **Firma del paciente en consulta** | Asistencia por cita + consentimientos versionados. Se guarda la **versión exacta del texto firmado** | §6.7 |
| 11 | Recordatorios por **`wa.me`** | No es una API: la app redacta y una persona envía. Ningún encargado del tratamiento nuevo. Los dos botones se emulan con enlaces firmados de un solo uso | §2.7, §6.8 |
| 12 | **Sector público aparcado** | La conformidad ENS no alcanza a Supabase ni a Vercel. Se diseña compatible, no se certifica | §2.5 |
| 13 | Portal del paciente **fuera de v1** | `accesos_historia` lo deja preparado para v2 sin migrar nada | §10 |
| 14 | Precio: **base por instancia + tramo por usuario** | — | §10 |
| 15 | **Importador Excel/CSV en v1** | Las notas históricas se adjuntan como documento, **nunca** como notas firmadas: una importación no puede fabricar autor, fecha ni huella | §6.9 |
| 16 | Lo construye **una persona con IA** | Ruta corta de §8.1; el calendario a medida es la mayor inversión de la fase 1 | §8 |
| 17 | **Solo castellano** en v1 | Andamiaje de i18n desde la fase 0, sin traducir | §10 |
| 18 | **La clínica es responsable; nosotros encargados** | Hace falta contrato propio del art. 28 RGPD para poder vender | §2.1 |
| 19 | **Series de citas con excepciones** | La serie guarda la intención, las citas los hechos. Al editar: «¿solo esta o esta y las siguientes?». Nunca «todas» | §6.2 |
| 20 | **Calendario a medida** sobre date-fns | Regla general: se integra lo invisible, se construye lo que el usuario mira a diario | §3.5 |
| 21 | **Tarifa por tipo + excepción por paciente** | `tarifas_paciente` con importe, motivo y vigencia | §6.4 |
| 22 | **El primer usuario es la consulta propia** | Dentro de cada fase, primero lo que se usa a diario | §8 |

## Elecciones técnicas menores

Región París (`eu-west-3`, no Fráncfort, por latencia desde España) · React-PDF en
servidor (no Chrome sin interfaz) · react-hook-form + Zod compartido cliente/servidor ·
TanStack Table · Server Actions por defecto · MFA obligatorio para administrador y
profesional · sesión de 30 min de inactividad · Vault de Supabase para claves de columna.

---

# Decisiones posteriores

Las 22 de arriba se cerraron en bloque el 15-08-2026. Lo que sigue se decide sobre la
marcha, con la plantilla del final. Misma fuerza: **un ticket que las contradiga se para y
se escala.**

## ADR-023 · La cuenta de WhatsApp Business, si llega, es de la clínica

**20-08-2026** · **Estado**: aceptada

**Contexto**: la decisión 11 eligió `wa.me` porque no añade ningún encargado del
tratamiento. Quedaba sin resolver qué hacer si un cliente cruza el umbral de volumen
(ver «Hallazgos anotados» en `state.md`: ~7 profesionales) y pide envío automático.

La pregunta habitual —«¿Twilio o Meta?»— está mal formulada. **Twilio no evita a Meta**:
es un BSP que revende sobre la WhatsApp Business API, el mensaje pasa por infraestructura
de Meta en ambos casos y la Cloud API no está cifrada de extremo a extremo frente a Meta.
Elegir Twilio no quita un encargado del tratamiento, **añade uno encima**. Y hay un coste
que no aparece en ninguna tabla de precios: un número dado de alta en la Business API
**deja de funcionar en la aplicación normal de WhatsApp**, así que la clínica pierde el
canal por el que sus pacientes ya le escriben.

**Decisión**: no se contrata a Meta ni a ningún BSP en nuestro nombre, nunca. Si algún día
se integra la API, **la WABA la contrata y la posee la clínica**; la aplicación solo
guarda sus credenciales y llama a su cuenta. Meta pasa a ser encargado *de ella*, no
subencargado nuestro.

Condiciones para abrir el módulo — **las tres, acumulativas**:

1. Un cliente real cruza el umbral con las cuatro mitigaciones de `state.md` ya aplicadas.
2. Ese cliente contrata su propia WABA y asume el encargo del tratamiento con Meta.
3. Acepta un número dedicado, distinto del que ya usa con sus pacientes.

**Credenciales**: **Vault de Supabase**, en la instancia de esa clínica. No en variables de
entorno de Vercel —exigen redespliegue e impiden que la clínica rote su propia credencial
sin pasar por nosotros— ni bajo una clave maestra alojada en el mismo entorno que el
código que la lee. **Clave distinta de la del cifrado de columna del DNI**: distinto ciclo
de vida, distinto radio de explosión, distinta cadencia de rotación. Compartirla obliga a
recifrar una cosa al rotar por causa de la otra.

**Consecuencias**:

- Se gana: la cadena de encargados no crece jamás por iniciativa nuestra. Ni art. 28.2 que
  gestionar, ni transferencia internacional propia que documentar, ni riesgo de baneo de
  un número que no es nuestro.
- Se pierde: `wa.me` sigue sin estado de entrega ni de lectura y sigue exigiendo una
  persona que pulse. El módulo automático no se puede vender como característica de
  catálogo, solo habilitar caso a caso y con papeleo del cliente.
- Queda bloqueado: cualquier ticket que proponga contratar Twilio, Meta o un BSP en
  nombre nuestro. Contradice esta ADR y la decisión 11.

## ADR-024 · Los envíos a terceros salen de un outbox en Postgres, no de una cola externa

**20-08-2026** · **Estado**: aceptada

**Contexto**: la remisión de facturas a la AEAT (decisión 2, modo VERI\*FACTU) necesita
reintentos, porque la AEAT puede no responder. La solución refleja es una cola gestionada
—Vercel Queues, QStash, BullMQ— y rompe el invariante que sostiene todo lo demás: **la
cola vive fuera de la transacción que escribe la factura**. Si la factura entra y el
encolado falla, queda una factura emitida sin remitir *y sin rastro de que falta
remitirla*, que es justo el estado que el registro de eventos existe para hacer imposible.
Es el mismo argumento por el que la cadena de huellas y `auditoria` viven en la base de
datos y no en la aplicación. Vercel Queues está además en beta pública: no es donde se
apoya una obligación tributaria.

**Decisión**: patrón **outbox** en Postgres. El evento pendiente se inserta en la **misma
transacción** que el hecho que lo origina, y un consumidor idempotente lo drena.

- Tabla de pendientes con estado, número de intentos, último error y próximo intento.
- Reclamo de trabajo con `select ... for update skip locked` más `limit`, para que dos
  ejecuciones solapadas no procesen la misma fila.
- Consumidor **idempotente**: el resultado se aplica por clave del registro, no por «he
  llamado». Reintentar no puede duplicar una remisión.
- Retroceso exponencial con techo. Agotados los intentos, la fila queda en fallo
  permanente y **genera una notificación**; nunca un silencio.
- Disparo por cron (`pg_cron` en la instancia, o cron de Vercel contra una ruta que exige
  secreto). El disparo es reemplazable; **el estado vive en la base de datos**.
- La tabla de outbox **no es de solo adición**: es estado operativo y se actualiza. Lo
  inmutable es `registro_eventos_sif`, que es otra tabla y no se toca desde aquí.

Aplica igual a la mensajería el día que deje de ser un clic humano, y a cualquier flujo
futuro que nazca de una escritura en la base de datos.

**Consecuencias**:

- Se gana: atomicidad entre el hecho y su obligación de remitirlo. Estado y reintentos
  visibles en SQL y auditables como todo lo demás. Cero proveedores nuevos, cero
  subencargados, cero secretos más que rotar.
- Se pierde: el consumidor y su retroceso hay que escribirlos —una cola gestionada los
  trae hechos— y la latencia mínima es el intervalo del cron, no milisegundos. Irrelevante
  para la AEAT.
- Queda bloqueado: introducir Vercel Queues, QStash, BullMQ o Redis para cualquier flujo
  que nazca de una escritura en la base de datos.

---

## ADR-025 · El sistema de diseño se destila del prototipo, el prototipo no se despliega

**21-08-2026** · **Estado**: aceptada

**Contexto**: la interfaz de Psicogestión llegó como una maqueta de v0
(`diseño/psicogestion.zip`): un único Client Component de 49 KB con los siete módulos del
producto y datos inventados. Tentación evidente: hacerla la aplicación y conectarla
después. Eso rompe a la vez el renderizado en servidor por defecto y el «nunca inventes»
de la constitución — datos falsos en rutas reales.

**Decisión**: se separa el prototipo de su sistema de diseño, y el prototipo pasa a ser
**fuente documental de primer nivel**: se destila en `docs/interfaz.md` igual que el
documento maestro se destila en `docs/architecture.md`. Quien vaya a escribir una pantalla
lee el destilado; el prototipo se abre para mirarlo, no para decidir.

- El **sistema** entra en el proyecto: tokens en `app/globals.css` (oklch, tema claro
  únicamente), fuentes en `app/layout.tsx` (Geist para el texto, DM Serif Display para
  titulares y cifras) y el armazón en `components/armazon/` (barra lateral, cabecera,
  cajón en móvil).
- El **prototipo** se conserva tal cual en `/prototipo`, exento de ESLint y documentado
  como referencia congelada. No se edita para arreglarlo: se compara contra él.
- Las pantallas reales se visten con el sistema, **nunca con los datos de la maqueta**.
  Lo que la maqueta enseña y el proyecto todavía no tiene —el selector de organización,
  la búsqueda global, las notificaciones, los seis módulos sin ticket— se pinta apagado o
  no se pinta. Un módulo sin ticket integrado aparece en la navegación marcado «pronto» y
  sin enlace.

**Consecuencias**:

- Se gana: un lenguaje visual cerrado desde el primer ticket de interfaz, sin discutir
  colores en cada pantalla; y una referencia navegable contra la que verificar. Y, al
  destilarlo, los diez sitios donde el prototipo enseña más de lo que la matriz de roles
  permite quedan cazados **antes** de escribir la pantalla, no en la revisión.
- Se pierde: la maqueta no se «aprovecha» como código. Cada módulo se escribe de nuevo
  como componente de servidor contra datos reales, mirando el prototipo.
- Queda bloqueado: promover `/prototipo` a ruta de producto, y añadir a la interfaz
  cualquier control que no tenga detrás un dato o una acción real. Antes de producción,
  `/prototipo` se protege o se borra.

---

## ADR-026 · La historia clínica se abre con un PIN personal, y el candado vive en RLS

**21-08-2026** · **Estado**: aceptada

**Contexto**: RLS responde a *quién puede leer qué* y el MFA de sesión a *quién ha
entrado*. Ninguno de los dos cubre el hueco que abre la consulta física: el paciente
sentado enfrente de la pantalla mientras el profesional se levanta, recepción pasando por
detrás del escritorio, el portátil abierto entre sesión y sesión. Los 30 minutos de
inactividad de la sesión son una eternidad en una sala con un paciente dentro.

Falta por tanto un tercer control, **reautenticación de paso elevado** sobre datos que el
usuario ya está autorizado a ver. Tres cosas que **no** es, porque son las que se
malinterpretan solas:

- **No es cifrado.** La base sigue guardando la nota en claro; quien tenga la clave de
  servicio la lee sin PIN. El cifrado de columna del DNI (Vault de Supabase) es otro
  mecanismo, con otra clave y otro ciclo de vida.
- **No es un permiso.** No amplía ni reduce la matriz de roles. Un administrador con su
  PIN sigue sin ver notas ajenas.
- **No es el acceso de emergencia** (decisión 5). Son perpendiculares: la emergencia
  exige justificación escrita, caduca y notifica al titular; el PIN solo demuestra que
  quien está delante del teclado sigue siendo el titular de la sesión.

**Decisión**: **PIN personal de seis dígitos** que abre el contenido clínico durante una
ventana corta, hecho cumplir en **RLS**, no solo en la aplicación.

**El secreto**

- Tabla `pines_historia`, una fila por perfil, con el hash, el contador de intentos
  fallidos y el instante de bloqueo. **Ningún rol tiene `select` sobre ella**: se toca
  únicamente a través de funciones `security definer`.
- Hash con **bcrypt de `pgcrypto`** (`extensions.crypt` + `extensions.gen_salt('bf', 12)`),
  ya instalado y ya usado por la siembra. `pgsodium` ofrece Argon2id pero está disponible
  sin instalar y **Supabase lo tiene en retirada**: no se apoya un control de acceso nuevo
  sobre una extensión deprecada. Sin autoengaño: con seis dígitos el factor limitante es la
  entropía, no la función de derivación — **lo que hace seguro esto es el bloqueo por
  intentos en servidor**, y el hash solo cubre el caso de fuga de la tabla.
- **Bloqueo a los cinco fallos**, quince minutos, con entrada en `auditoria` y
  notificación al titular. El contador vive en la base, no en la sesión.
- **Lo fija el usuario** en su primer acceso tras la invitación, y **solo él lo cambia**,
  reautenticándose con contraseña y segundo factor. El administrador puede **bloquear** un
  PIN; jamás establecerlo ni verlo. Un administrador que resetease un PIN ajeno seguiría
  sin poder leer nada — RLS no cede — pero el gesto no debe existir igualmente.
- El técnico administrativo **no tiene PIN**: nunca alcanza contenido clínico, y pedírselo
  enseñaría que el PIN es un trámite de entrada y no un candado.
- El PIN viaja como **parámetro ligado** a la función, nunca interpolado en SQL. En
  producción no se habilita el registro de sentencias.

**El desbloqueo**

- Tabla `desbloqueos_historia` (perfil, concesión, caducidad, revocación). Es **estado
  operativo, no registro inmutable**: se actualiza, igual que el outbox del ADR-024. Lo
  imperecedero son las entradas en `auditoria` y `accesos_historia`, que son otras tablas.
- **Ventana de 15 minutos configurable**, alcance de sesión: un PIN abre toda la historia
  clínica, no un paciente. Botón explícito de **bloquear** que revoca al instante.
- La ventana **se prolonga en las Server Actions** —abrir un paciente, guardar una nota— y
  en una acción explícita de renovación con freno; **jamás en el renderizado**. Un
  componente de servidor que escribiese al pintar convertiría cada lectura en escritura y
  haría el candado inútil por deriva.
- El **acceso de emergencia exige las dos cosas**: PIN vigente *y* justificación escrita.
  El PIN no sustituye a la justificación ni al aviso al titular.

**El candado**

- Función auxiliar `historia_desbloqueada()`, `stable security definer set search_path = ''`,
  que se lee como frase igual que `rol_actual()` y `es_profesional_asignado()`. Al ir con
  `search_path` vacío, invoca `extensions.crypt`, no `crypt`.
- **Sin recursión por construcción**: ninguna política sobre `desbloqueos_historia` ni
  sobre `pines_historia` invoca `historia_desbloqueada()`. Misma regla que ata a
  `rol_actual()` con `perfiles`.
- Lo cubre: `episodios_asistenciales`, `diagnosticos`, `valoraciones_riesgo`,
  `notas_clinicas`, `notas_clinicas_versiones`, `evaluaciones`, `evaluacion_archivos`,
  `informes`. Es decir, **contenido**.
- **No lo cubre**: recuentos, estados de firma, antigüedad y avisos. La bandeja de Clínica
  y las métricas de Inicio se alimentan de `alertas_documentacion`, que existe justo para
  eso. Si el candado tapase los contadores, la pantalla de inicio quedaría inservible y el
  usuario dejaría el candado abierto todo el día — que es el modo real en que fracasa este
  tipo de control.
- **Cada política nueva con su prueba** en el banco de T-003, incluida la negativa: sin
  desbloqueo vigente, `select` sobre `notas_clinicas` devuelve cero filas.

**Consecuencias**:

- Se gana: la pantalla desatendida deja de ser una filtración. El control se hace cumplir
  en la misma capa que todo lo demás, así que un `select` olvidado en un componente de
  servidor no lo esquiva. Y encaja en el calendario: T-001, T-002, T-003 y T-006 **todavía
  no están hechos**, así que no cuesta ninguna migración de datos.
- Se pierde: dos tablas, una función auxiliar y su banco de pruebas; políticas más largas
  de leer; y una fricción real de dos segundos varias veces al día, que es exactamente la
  que hay que vigilar en el uso real antes de acortar la ventana.
- Queda bloqueado: verificar el PIN en cliente; guardarlo en `perfiles` junto a datos que
  otros roles leen; usarlo como sustituto de la justificación de emergencia; y presentarlo
  en la interfaz o en la venta como «historia cifrada».

---

## ADR-027 · Las anotaciones subjetivas son un campo aparte dentro de la misma versión

**21-08-2026** · **Estado**: aceptada

**Contexto**: el maestro cita el art. 18 de la Ley 41/2002 —derecho de acceso del
paciente— pero **no su excepción**. El art. 18.3 dice que ese derecho no se ejerce en
perjuicio del derecho de terceras personas a la confidencialidad de sus datos recogidos en
interés terapéutico, «ni en perjuicio del derecho de los profesionales participantes en su
elaboración, los cuales pueden oponer al derecho de acceso la **reserva de sus anotaciones
subjetivas**». La palabra «subjetiv» no aparece ni una vez en el documento maestro.

Si `notas_clinicas` no distingue eso desde la primera migración, el día que entre una
solicitud de acceso —o el portal del paciente de v2, decisión 13— hay que separar el grano
a mano, nota a nota, sobre texto **firmado, sellado e inmutable**. No es caro: es
irreparable.

**Decisión**: la versión de nota tiene **dos cuerpos**, `cuerpo` y `anotaciones_reservadas`.

- **Los dos entran en el cómputo de la huella.** Una nota es un eslabón, no dos. Sacar lo
  reservado de la cadena lo convertiría en un apéndice sin sellar, que es exactamente lo
  que el invariante 1 existe para impedir.
- **Marcar y desmarcar solo se puede mientras es borrador.** Firmada la versión, cambiar
  de opinión es añadir una versión nueva con su motivo, como cualquier otra corrección.
- **La reserva se opone al paciente, no al colega.** No es una capa más de RLS: quien puede
  leer la nota lee las dos partes. Lo reservado se excluye únicamente de las **salidas
  dirigidas al paciente**: ejercicio del derecho de acceso, informe entregado al paciente,
  exportación para el paciente y portal de v2. Queda escrito porque la tentación de
  implementarlo como política de RLS es fuerte y sería un error.
- **No se opone a un juez.** Un requerimiento judicial se atiende con la nota íntegra; la
  exportación para uso judicial es otra salida, con su propia traza.
- La reserva es un **derecho del profesional, no una obligación**: el campo puede quedar
  vacío siempre, y la interfaz no debe empujar a rellenarlo.
- En v2, la proyección del portal del paciente es una **vista que no selecciona la
  columna**. No un filtro en la aplicación: algo que físicamente no la contiene.

**Consecuencias**:

- Se gana: el derecho de acceso del paciente se atiende con una consulta en vez de con una
  revisión manual de años de notas selladas. Y la excepción de terceros del mismo art. 18.3
  encuentra ya el sitio donde vivir, que es lo que necesita el **ADR-030**.
- Se pierde: un campo más en el editor y una decisión más al escribir cada nota. Se mitiga
  con el valor por defecto correcto: vacío.
- Queda bloqueado: sacar lo reservado del cómputo de la huella; implementar la reserva como
  política de RLS; y entregar al paciente una nota sin pasar por la proyección.

---

## ADR-028 · Menores: la representación es una relación con vigencia, y lo dudoso lo decide el profesional

**21-08-2026** · **Estado**: aceptada

**Contexto**: cero apariciones de «tutor», «representante» o «patria potestad» en el
documento maestro. En una consulta de psicología sanitaria el menor es rutina, y trae tres
preguntas que el modelo actual no puede ni formular: quién consiente, quién accede a la
historia, y qué pasa cuando los dos progenitores no están de acuerdo.

El marco (Ley 41/2002 art. 9, redacción de la Ley 26/2015): por debajo de 16 años consiente
el representante legal, **oído el menor si tiene doce años cumplidos**; a partir de los 16
no cabe el consentimiento por representación y consiente el propio menor, salvo actuación
de grave riesgo, donde se informa a los progenitores. Iniciar un tratamiento psicológico no
es acto ordinario de la patria potestad, así que **lo normal es que exija la firma de los
dos titulares**, custodia aparte — la patria potestad suele seguir siendo compartida tras
un divorcio.

**Decisión**: tabla `representantes_paciente`, y una función que deriva la capacidad por
fecha en vez de guardarla como bandera.

- Fila por representante: persona, `tipo` (`progenitor`, `tutor`, `acogedor`,
  `guardador_de_hecho`, `representante_judicial`), `alcance` (patria potestad, custodia,
  solo contacto), **vigencia desde/hasta** y documento acreditativo adjunto.
- **La vigencia es obligatoria y la capacidad se calcula, no se almacena.**
  `capacidad_consentimiento(paciente, fecha)` devuelve quién consiente en esa fecha. Una
  bandera `es_menor` estaría mal el día del decimoctavo cumpleaños y nadie se enteraría.
- El consentimiento admite **varias firmas**: el circuito acepta N firmantes, no uno. El de
  inicio de tratamiento de un menor exige a los dos titulares de la patria potestad salvo
  que conste resolución judicial o guarda exclusiva — y ese documento **se adjunta, no se
  declara**.
- «**Menor oído**» (art. 9.3) es una casilla del consentimiento con fecha, no texto libre.
  Es un requisito legal que se demuestra o no se demuestra.
- **Acceso del representante a la historia**: permitido, y **auditado en `accesos_historia`
  como cualquier otro acceso**. Pasa por el filtro del ADR-027.
- A partir de los 16, el acceso del representante al **contenido clínico** queda restringido
  por defecto, y el profesional puede levantarlo dejando constancia. Aquí la aplicación **no
  zanja un asunto jurídicamente discutido: registra la decisión del profesional, su motivo y
  su fecha.** Es el principio general para todo lo que la ley deja abierto.
- Al cumplir 18 la representación **caduca sola** y genera notificación por el consumidor
  del ADR-024. No se borra nada: quién consintió y cuándo es historia.

**Consecuencias**:

- Se gana: la consulta infantojuvenil deja de ser el caso que rompe el modelo. Y el conflicto
  entre progenitores —el que acaba en queja o en juzgado— se responde con documentos
  adjuntos y fechas, no con memoria.
- Se pierde: el alta de un paciente menor es más larga, y el circuito de firma se complica
  para todos por servir a una parte de los casos.
- Queda bloqueado: guardar la minoría de edad como bandera; aceptar un consentimiento de
  menor con una sola firma sin documento que lo justifique; y que la aplicación decida por su
  cuenta un extremo legal discutido en vez de registrar quién lo decidió.

---

## ADR-029 · El DNI se cifra al azar y se busca por un índice ciego, con dos claves distintas

**21-08-2026** · **Estado**: aceptada

**Contexto**: el maestro dice que `pacientes_identificacion` guarda «DNI/NIE y domicilio
completo, **cifrados a nivel de columna**», y `decisions.md` añade «Vault de Supabase para
claves de columna». Ninguno dice **cómo**, y ahí está el problema: con cifrado aleatorio dos
cifrados del mismo DNI no se parecen, así que **no se puede buscar por DNI** — que es lo
primero que hace recepción y lo que el importador necesita para detectar duplicados.
Descubrirlo después obliga a recifrar y rellenar hacia atrás la tabla entera.

La solución refleja —cifrado determinista, para que el mismo DNI dé siempre el mismo
criptograma— resuelve la búsqueda y estropea el cifrado: sin nonce, el texto cifrado filtra
igualdad y se presta a análisis de frecuencia.

**Decisión**: dos columnas, dos claves, dos propósitos.

- `dni_cifrado`: **AES-256-GCM con nonce aleatorio**. Sirve para mostrar y para facturar.
  Nunca para comparar.
- `dni_indice`: **HMAC-SHA-256** del DNI normalizado, con **índice único**. Sirve para buscar
  por igualdad exacta y para que el importador cace duplicados sin descifrar nada.
- **Normalización antes del HMAC**: mayúsculas, sin espacios ni guiones, letra de control
  validada. Sin ese paso el mismo documento produce dos índices y el índice único no protege
  de nada.
- **Las dos claves son distintas**, por el mismo motivo por el que el ADR-023 separa las de
  mensajería: distinto radio de explosión. Con una sola, quien la obtenga puede además
  fabricar el índice y confirmar «¿está Fulano en esta clínica?» sin descifrar una sola fila
  — que en una consulta de psicología es ya la filtración entera.
- **Cifrado y HMAC ocurren en la aplicación** (`node:crypto`), con las claves leídas del Vault
  en servidor. No en la base: el cifrado transparente de Postgres en Supabase era `pgsodium`,
  **disponible sin instalar y en retirada** — el mismo hallazgo que ya obligó al ADR-026 a
  elegir bcrypt.
- **Búsqueda parcial o por prefijo: no existe.** Solo igualdad exacta sobre el documento
  completo. El buscador por nombre no toca esta tabla: vive en `pacientes`, la ficha básica,
  tal como manda el invariante 3.
- **Rotación**: rotar la clave de cifrado es recifrar; rotar la del índice exige descifrar
  todo para recalcularlo. Ambas son mantenimiento planificado, no rutina. Queda escrito para
  que nadie lo descubra a mitad.

**Consecuencias**:

- Se gana: recepción busca por DNI, el importador detecta duplicados y la base no guarda un
  solo documento en claro. El índice único hace además imposible dar de alta dos veces al
  mismo paciente por descuido.
- Se pierde: dos claves que custodiar y rotar en vez de una, y un procedimiento de rotación
  que hay que ensayar antes de necesitarlo.
- Queda bloqueado: el cifrado determinista; guardar el DNI en claro «temporalmente» para
  facilitar una migración; buscar por fragmentos del documento; e instalar `pgsodium`.

---

## ADR-030 · En pareja y familia, el paciente sigue siendo la persona; lo conjunto cuelga del episodio

**21-08-2026** · **Estado**: aceptada

**Contexto**: cero menciones de terapia de pareja o familiar en el maestro, y el modelo
supone una historia por persona. Una sesión de pareja rompe ese supuesto por los dos
extremos: la nota contiene datos de salud de **dos** personas, y si una ejerce su derecho de
acceso no se le puede entregar entera. Si esto aparece en fase 1 sin decidir, se arregla
partiendo notas ya firmadas y encadenadas, es decir, no se arregla.

La ley ya lo contempla: el art. 18.3 bloquea el acceso «en perjuicio del derecho de terceras
personas a la confidencialidad de los datos que constan en ella recogidos en interés
terapéutico del paciente». El sitio donde vive esa reserva lo abrió el **ADR-027**.

**Decisión**: no se inventa una entidad «unidad familiar». **El titular del secreto y del
derecho es siempre la persona.** Lo conjunto se modela en el episodio.

- `episodios_asistenciales` gana `modalidad_relacional`: `individual`, `pareja`, `familiar`,
  `grupo`.
- Tabla `episodio_participantes` (paciente, papel, alta y baja). Con altas y bajas porque los
  participantes entran y salen — un hermano que se incorpora en la quinta sesión es lo
  normal, no la excepción.
- **Cada participante es un `paciente` con su ficha propia.** La sesión conjunta no crea un
  paciente nuevo.
- La nota de sesión conjunta lleva `alcance = conjunta` y cuelga del episodio: aparece en la
  historia de todos los participantes por su participación, no por una copia por cabeza. Una
  nota, un eslabón, una cadena.
- **En el ejercicio del derecho de acceso individual, la nota conjunta no se entrega
  entera.** Se entrega su metadato —fecha, asistentes, tipo de sesión— y el profesional
  valora qué es segregable, dejando constancia. Filtrar texto libre automáticamente es
  imposible y fingir que se puede sería peor que no hacerlo.
- **Consentimiento informado específico** de terapia de pareja o familiar, firmado por todos
  los adultos participantes, que fija **de antemano** la regla de confidencialidad entre
  miembros: qué hace el profesional con lo que uno cuenta en sesión individual dentro de un
  proceso de pareja. Se guarda la versión exacta del texto firmado (decisión 10). Es la pieza
  que hace legítimo todo lo demás, igual que el acceso de emergencia lo es para la matriz de
  roles.
- El **pagador** es un dato de la cita, no del episodio: una sesión conjunta genera una
  factura a quien corresponda, y `tarifas_paciente` sigue siendo por persona.

**Consecuencias**:

- Se gana: la modalidad más común después de la individual deja de ser un caso imposible, sin
  duplicar notas ni inventar titulares de secreto que la ley no reconoce.
- Se pierde: el derecho de acceso sobre sesiones conjuntas no es automático — exige criterio
  del profesional y su registro. Es el precio honesto de un dato que pertenece a dos personas.
- Queda bloqueado: escribir la misma nota conjunta una vez por participante; crear un
  «paciente» que sea una pareja o una familia; y entregar una nota conjunta en un ejercicio de
  acceso individual sin valoración registrada.

---

## ADR-031 · Los duplicados no se fusionan: se vinculan

**21-08-2026** · **Estado**: aceptada

**Contexto**: el maestro promete detección de duplicados en el importador de v1 «por DNI y
por nombre más fecha de nacimiento, resuelta caso a caso: crear, **fusionar** u omitir», y no
dice cómo se fusiona. Bajo el invariante de solo adición, con notas selladas y encadenadas y
facturas remitidas a la AEAT, fusionar **no es un `update paciente_id`**: es la única
operación del sistema que tocaría contenido clínico y fiscal ya cerrado. Y el importador la
va a necesitar el primer día.

**Decisión**: **no se fusiona nada. Se vincula.**

- El registro duplicado no se borra ni se vacía: se marca con `fusionado_en` apuntando al
  superviviente, más fecha, actor y motivo, y queda en **solo lectura**.
- Nada se repunta. Las notas, los episodios y las evaluaciones del registro absorbido siguen
  colgando de él, con sus huellas intactas.
- La historia del superviviente **los muestra a través del vínculo**, marcados de forma
  visible: «procede del registro fusionado el 12-03-2026». El profesional ve una sola historia
  y la base conserva dos verdades.
- **Las facturas no se tocan jamás.** Una factura emitida al registro duplicado conserva el
  nombre y el NIF con los que se emitió: es un documento fiscal y lo rige el ADR-002.
- RLS y `es_profesional_asignado()` **resuelven a través del vínculo**, un solo salto. Un
  disparador impide que `fusionado_en` apunte a un registro ya fusionado: al vincular contra
  uno absorbido se normaliza al superviviente final. Sin esa regla aparecen cadenas y el
  «un solo salto» deja de ser cierto.
- **Deshacer es avanzar**: revocar una vinculación es otro registro con su motivo, nunca un
  borrado.
- **El importador propone, una persona confirma.** Nunca automático, ni siquiera con DNI
  coincidente.

**Consecuencias**:

- Se gana: la operación más destructiva imaginable en este sistema deja de serlo, y se puede
  auditar y revertir. El invariante de solo adición sobrevive al importador.
- Se pierde: consultar la historia del superviviente exige resolver el vínculo, así que las
  políticas y las consultas llevan un salto más. Y en la interfaz hay que enseñar la
  procedencia en vez de fingir que siempre fue un solo paciente.
- Queda bloqueado: `update` de `paciente_id` sobre notas, episodios, evaluaciones o facturas
  para consolidar registros; borrar el registro absorbido; y fusionar sin confirmación humana.

---

## ADR-032 · Un profesional que se va pierde el acceso, conserva la autoría y no arrastra a sus pacientes

**21-08-2026** · **Estado**: aceptada

**Contexto**: `es_profesional_asignado()` es la bisagra de casi toda la RLS clínica, y nadie
ha decidido qué pasa cuando el profesional causa baja. Tres cosas quedan colgando a la vez:
su acceso, sus notas y sus pacientes. Cerrarlo después de T-003 significa reescribir
políticas que ya tienen pruebas.

**Decisión**: son tres cosas distintas y se resuelven por separado.

- **El perfil no se borra nunca.** `perfiles.estado`: `activo`, `suspendido`, `baja`, con
  fecha. Borrarlo dejaría notas sin autor identificable, que es tanto como no tener autor.
- **El acceso se corta entero.** En la baja se revocan sesiones, se inutilizan MFA y PIN, y
  `es_profesional_asignado()` deja de devolver cierto. **No conserva acceso ni a lo suyo**:
  ya no trabaja allí, y el secreto profesional no es una llave vitalicia sobre un archivo
  ajeno.
- **La autoría es inmutable.** Sus notas siguen siendo suyas, firmadas por él, para siempre.
  No se reasigna autoría ni se «traspasa» una nota. La retención de 25 años corre igual, y es
  de la clínica, no del profesional.
- **Los pacientes se reasignan por acto expreso** del administrador, auditado. No se
  reasignan solos: dejar pacientes sin profesional asignado es visible y por tanto se arregla;
  repartirlos automáticamente es invisible y por tanto no se arregla.
- **La continuidad asistencial no necesita mecanismo nuevo.** El profesional entrante queda
  asignado y ve la historia completa, incluidas las notas del saliente, porque
  `es_profesional_asignado()` ya concede eso. La regla «el secreto es del profesional, no del
  cargo» limita el acceso **lateral entre compañeros a la vez**, no la continuidad del
  tratamiento de un paciente. Sin esto, cada consulta a una nota anterior exigiría acceso de
  emergencia, que es inviable y acabaría normalizando la emergencia.
- Las **anotaciones reservadas** del saliente (ADR-027) siguen siendo visibles para el
  entrante —la reserva se opone al paciente, no al colega— y se muestran con su autor y su
  fecha. Su lectura se registra en `accesos_historia` como todo lo demás.
- **No se puede dar de baja al último administrador activo.** Restricción de la base, no aviso
  de la interfaz.
- Volver es reactivar el mismo perfil. **Las asignaciones no vuelven solas** y el PIN se fija
  de nuevo.

**Consecuencias**:

- Se gana: la salida de un profesional deja de ser un agujero improvisado, y el paciente no se
  queda con una historia que nadie puede leer.
- Se pierde: reasignar pacientes es trabajo manual del administrador, y una baja mal
  ejecutada deja pacientes huérfanos hasta que alguien los mire. Es deliberado: se prefiere
  visible a automático.
- Queda bloqueado: borrar perfiles; reasignar autoría de notas; conceder al saliente acceso
  «solo a lo suyo»; y resolver la continuidad asistencial con acceso de emergencia.

### Enmienda del 22-08-2026 · No todos los pacientes son de la organización

El ADR original daba por hecho que todo paciente es de la clínica. En una consulta española
eso es falso la mitad de las veces: el profesional suele ser **autónomo colaborando con la
organización**, y ahí conviven dos figuras que la baja separa de golpe.

- **Paciente de la organización** (el caso corriente): la relación asistencial la tiene la
  clínica. El profesional se va y **los pacientes se quedan**, con la reasignación expresa de
  arriba. Es lo que el ADR ya decía.
- **Paciente propio del profesional**: llegó con él y la relación es suya. Se va y **se lo
  lleva**.

Se modela con `pacientes.titularidad`: `organizacion` (valor por defecto) o `profesional`.
La fija el **administrador** al dar de alta y solo él la cambia, auditado — nunca el
profesional sobre sí mismo, que sería juez y parte de a quién se lleva.

**Frontera dura, la misma que la de los centros**: la titularidad **no cambia quién
factura**. En esta instancia se factura siempre bajo el NIF de la organización, sea de quien
sea la relación. Un profesional que emita sus propias facturas con **su NIF** no es un
profesional de esta organización: es otro obligado tributario, con su serie, su cadena de
huellas y su registro de eventos — **otra instancia y otro cliente**. Dos NIF conviviendo
rompen a la vez las decisiones 1 y 2, venga el segundo de un centro o de una persona.

**Qué pasa en la baja con los suyos**:

- **No se reasignan.** El registro se marca como traspasado, con fecha y destino, y queda
  cerrado a nueva actividad.
- Se le entrega **exportación cifrada con su propia clave** (decisión 4), que es el mecanismo
  que ya existe para esto.
- **No se borra nada.** Mientras el tratamiento se prestó bajo el NIF de la clínica, la
  clínica fue responsable de él: el reloj de retención sigue corriendo sobre el original y la
  purga lo anonimizará cuando toque. Lo que viaja es una copia, no el registro.
- **El saliente pierde el acceso igual**, también a los suyos. Se lleva la exportación, no la
  llave. La regla principal del ADR queda intacta.

**Consecuencias de la enmienda**:

- Se gana: el modelo deja de suponer una relación laboral que casi nunca es la real, y la
  salida de un colaborador tiene respuesta antes de que se produzca — que es cuando se
  discute mal.
- Se pierde: una columna más en el alta de paciente, y una conversación incómoda que ahora
  hay que tener al principio en vez de al final.
- Queda bloqueado: que un profesional marque como suyos a pacientes de la organización;
  borrar el original tras un traspaso; y facturar bajo un segundo NIF en la misma instancia.

---

## ADR-033 · La retención cuelga del centro; el centro es dimensión de RLS solo para el técnico

**21-08-2026** · **Estado**: aceptada

**Contexto**: las dos preguntas que `state.md` dejó anotadas para T-001, cerradas aquí antes
de escribir la migración. `architecture.md` lista `centros` y el maestro no lo especifica; si
se pasan por alto se convierten en migración de datos.

**Decisión**:

**1 · `politicas_retencion` cuelga del centro**, con la organización fijando el valor por
defecto que los centros heredan mientras no lo pisen. Los mínimos legales varían por
comunidad autónoma —cinco años como norma general del art. 17.1, hasta quince en Cataluña, y
varias CCAA con un núcleo documental indefinido—, así que una organización con centro en
Barcelona y centro en Madrid tiene **dos mínimos distintos**. Colgarlo de la organización
obliga a migrar el día que entre el segundo centro. Cuesta lo mismo hacerlo bien ahora.

**2 · El centro acota al técnico administrativo, y a nadie más.**

- **Técnico administrativo**: acotado a su centro. `perfiles.centro_id` es obligatorio para
  este rol, y su agenda y sus cobros son los de su centro.
- **Profesional**: sigue a **sus pacientes**, estén donde estén. Manda la asignación, no la
  ubicación — un profesional que pasa consulta dos días en cada centro es el caso normal, no
  el raro.
- **Administrador**: ve todos los centros, con los límites que ya tiene sobre lo clínico.
- **Disponibilidad y festivos, por centro**: los locales y autonómicos difieren y no son
  atributo de la organización.
- **Series de facturación por centro**, opcionales, bajo el mismo NIF. `series_facturacion`
  admite `centro_id` nulo para la serie única, que es el caso de la consulta propia.

**La frontera dura sigue en pie** y se recoge aquí para que no se pierda en `state.md`: un
«centro» con **NIF propio no es un centro**. Es otro obligado tributario, con su serie, su
cadena de huellas y su registro de eventos: **otra instancia y otro cliente**. Dos NIF en una
instancia rompen a la vez la decisión 1 y la 2.

**Coste comercial**: un centro adicional bajo el mismo NIF cuesta 0 €/mes de infraestructura
(`modelo-coste-instancia.md`) y una configuración de una a dos horas, una sola vez. **No se
cobra cuota por centro**: duplicaría el cobro del crecimiento que ya captura el tramo por
usuario (decisión 14).

**Consecuencias**:

- Se gana: el segundo centro deja de ser una migración, y la RLS gana **una sola** dimensión
  nueva en vez de tres. Acotar al técnico es la única acotación que la matriz de roles pedía
  de verdad.
- Se pierde: `centro_id` obligatorio en el técnico complica la invitación de usuarios (T-006),
  y la herencia de la retención necesita su propia prueba: un centro sin política propia debe
  resolver a la de la organización, no a nulo.
- Queda bloqueado: colgar la retención de la organización; acotar al profesional por centro;
  y dar de alta un segundo NIF en la misma instancia.

---

## ADR-034 · La regla se guarda en hora local con zona IANA; el hecho, en instante

**21-08-2026** · **Estado**: aceptada

**Contexto**: cero menciones de zona horaria, `UTC` o horario de verano en el documento
maestro, y el calendario a medida es la mayor inversión de la fase 1 (decisiones 16 y 20).
El error clásico se comete al crear la serie: si «todos los martes a las 10:00» se guarda
como un instante o como un desplazamiento fijo respecto a UTC, la serie creada en enero
pasa a las 11:00 en julio y nadie entiende por qué.

Lo bueno es que la mitad de la decisión ya estaba tomada: **el invariante 4 la dicta**. «La
serie es la intención, la cita es el hecho» significa exactamente que la intención se
expresa en hora local —que es como la dice el profesional y como la entiende el paciente— y
el hecho es un instante.

**Decisión**:

**1 · Dónde vive la zona.** `organizacion.zona_horaria` fija el valor por defecto
(`Europe/Madrid`) y `centros.zona_horaria` lo hereda mientras no lo pise — el mismo patrón
que la retención en el ADR-033, y por el mismo motivo: un cliente con centro en Madrid y
centro en Las Palmas son `Europe/Madrid` y `Atlantic/Canary`, con una hora de diferencia
todo el año. Colgarlo de la organización obligaría a migrar `citas`, `series_cita` y
`disponibilidad` a la vez.

**Solo nombres IANA**, validados contra `pg_timezone_names`. Nunca un desplazamiento fijo
(`+02:00`), que deja de ser cierto dos veces al año, ni una abreviatura (`CEST`), que además
es ambigua entre países.

**2 · Qué guarda cada cosa.**

| Tabla | Guarda | Por qué |
|---|---|---|
| `series_cita` | `hora_local` + `zona_horaria` + regla de repetición | Es la intención. Un `timestamptz` aquí es el bug. |
| `citas` | `inicio`/`fin` en `timestamptz` + `zona_horaria` | Es el hecho: un instante, y la zona en que ocurrió. |

La `zona_horaria` de la serie es una **instantánea** de la del centro al crearla, y la de la
cita otra al materializarla. Así una serie no cambia de significado a espaldas de nadie si
el centro cambia de zona, y una cita pasada se pinta siempre en la hora en que de verdad
ocurrió — que es lo que necesitan la historia y la factura.

**3 · Anomalías del cambio de hora.** Deterministas y marcadas, nunca ambiguas ni
silenciosas:

- **Hueco** (último domingo de marzo: las 02:30 no existen): se materializa en el **instante
  válido más cercano hacia delante** y la cita queda marcada como desviación con motivo
  `anomalia_horaria`. El mecanismo de desviación ya existe por el invariante 4; esto no
  inventa nada.
- **Solapamiento** (último domingo de octubre: las 02:30 ocurren dos veces): se toma la
  **primera**, la anterior al cambio, y se marca igual.

En una consulta que trabaja de nueve a nueve esto no se disparará casi nunca. Se escribe
porque el día que se dispare tiene que haber una respuesta, no una excepción.

**4 · Nada se recalcula solo.** Cambiar la zona de un centro o la regla de una serie **no
mueve ninguna cita ya materializada**. Genera un evento de outbox (ADR-024) que produce una
tarea con las citas futuras afectadas, y se confirman una a una. Las pasadas no se tocan
jamás: lo prohíbe el invariante 4, y tienen notas y cobros colgando.

El motivo es la decisión 11: los recordatorios los envía **una persona** por `wa.me`, y
`wa.me` no devuelve estado de entrega. El sistema no sabe qué citas conoce ya el paciente,
así que no puede permitirse mover ninguna por su cuenta.

**5 · Se pinta siempre en la zona del centro, y en servidor.** La consulta es un sitio
físico y su agenda es la de ese sitio. La hora baja al navegador como **cadena ya
formateada**, igual que el saludo y la fecha del armazón — nada de `new Date()` en cliente,
que es deuda ya anotada por hidratación.

Matiz sobre lo que se rotula: la etiqueta de zona junto a la hora aparece cuando **la
organización tiene más de una zona en juego**, no cuando difiere de la del navegador.
Averiguar la del navegador exige JavaScript en cliente, que es justo lo que se está
evitando; y el dato que importa —«esta cita es en Canarias»— el servidor ya lo tiene.

**6 · La dependencia.** date-fns 4 trae zonas horarias de primera clase en el paquete
aparte **`@date-fns/tz`** (`TZDate`, `tz`), verificado en
`node_modules/date-fns/docs/timeZones.md` del paquete instalado. **No es `date-fns-tz`**:
ese es el paquete de terceros para date-fns 2 y 3, y es lo que un agente traerá de memoria.

**7 · Fronteras de día y de trimestre.** La fecha de una factura, los cortes de trimestre
de IVA y el arranque del reloj de retención se calculan en la zona del centro. Una sesión
del 31 de diciembre a las 23:30 cae en un trimestre o en el siguiente según la zona, y eso
es un dato fiscal. Disponibilidad y festivos ya son por centro (ADR-033) y son hora local:
misma regla.

**Consecuencias**:

- Se gana: el bug clásico del calendario a medida queda cerrado antes de escribir el
  calendario, que es la mayor inversión de la fase 1. Y Canarias deja de ser una migración
  futura para ser una columna con valor por defecto.
- Se pierde: una dependencia más, una instantánea de zona en dos tablas, y trabajo manual
  cada vez que cambie la zona de un centro — cosa que pasará casi nunca, y cuando pase es
  justo cuando no se quiere automatismo.
- Queda bloqueado: guardar la hora de una serie como `timestamptz`; guardar
  desplazamientos fijos o abreviaturas en vez de nombres IANA; calcular o formatear horas en
  cliente; mover citas ya materializadas sin confirmación humana; e instalar `date-fns-tz`.

---

## ADR-035 · Se sella un byte, no un objeto: canonicalización del contenido con huella

**22-08-2026** · **Estado**: aceptada

**Contexto**: el invariante 1 dice `huella(n) = SHA-256( contenido(n) || huella(n-1) )` y
no define `contenido(n)`. El maestro fija el editor —TipTap, «documento estructurado en
**JSON**, no HTML opaco: versionable y comparable»— pero «canonicalización» y
«serialización» aparecen **cero veces** en todo el documento.

Ese hueco rompe el invariante en silencio, que es la peor forma de romperlo. Si la huella
se calcula volviendo a serializar el objeto JSON, cambia sin que cambie el contenido en
cuanto varíe cualquiera de estas cosas: el orden de las claves, el escapado de los no
ASCII, los espacios insignificantes, la forma de los números, o la normalización Unicode —
en castellano, «á» puede ser un punto de código o dos, y un texto pegado desde Word no
tiene por qué venir igual que uno tecleado. Una actualización de librería bastaría, y el
verificador nocturno **no podría distinguir eso de una manipulación**. Señalaría un eslabón
roto y la respuesta correcta sería «no sabemos».

**Decisión**: la huella se calcula sobre **una cadena de bytes canónica que se genera una
sola vez, al firmar, y se guarda**. La verificación vuelve a leer esos bytes; **nunca los
vuelve a derivar del objeto**.

- La columna de contenido **es** el JSON canónico en UTF-8. No hay un objeto guardado por
  un lado y unos bytes por otro: eso serían dos verdades y una tendría que ganar.
- **Forma canónica: JCS (RFC 8785)** — claves ordenadas, sin espacios insignificantes,
  números y escapes especificados, salida UTF-8. Es un estándar escrito precisamente para
  esto, y no hay que inventarlo.
- **Normalización Unicode NFC de todos los valores de texto antes de canonicalizar.** JCS no
  la exige y aquí hace falta: sin ella el mismo texto visible produce dos huellas.
- Lo que se sella no es solo el cuerpo, es un **sobre**: `cuerpo`,
  `anotaciones_reservadas` (ADR-027), `autor_id`, `creada_en`, `motivo_cambio` y
  `esquema_version`. Sellar solo el cuerpo permitiría cambiar el autor de una nota sin
  romper la cadena, que es tanto como no tener cadena.
- **Concatenación sin ambigüedad**: la huella anterior son 32 bytes de longitud fija, así
  que `contenido || huella_anterior` no admite dos lecturas y no necesita separador. El
  primer eslabón usa **32 bytes cero** como huella anterior.
- Cada versión guarda su **`algoritmo_version`**. Cambiar de algoritmo algún día es empezar
  una era nueva y dejar constancia, no recalcular lo viejo — recalcular una huella pasada es
  exactamente lo que el invariante prohíbe.
- El editor **puede** normalizar al abrir un documento antiguo. Si lo hace, guardar produce
  una versión nueva con su motivo, visible. Lo que no puede es normalizar y volver a sellar
  en silencio.

**Consecuencias**:

- Se gana: el verificador nocturno vuelve a significar algo. Un eslabón roto es una
  manipulación, no un `npm update`.
- Se pierde: hay que implementar JCS y NFC, y probarlos con casos feos a propósito —
  acentos compuestos, emoji, comillas tipográficas, texto pegado desde Word.
- Queda bloqueado: calcular una huella volviendo a serializar el objeto; sellar el cuerpo
  sin el sobre; recalcular huellas antiguas por cualquier motivo; y guardar el contenido en
  una forma que no sea la canónica.

---

## ADR-036 · El borrador vive en la cabecera mutable; a la cadena solo se entra firmando

**22-08-2026** · **Estado**: aceptada

**Contexto**: el maestro define los estados de la nota —pendiente, borrador, firmada,
modificada— y no dice dónde vive cada uno. `notas_clinicas_versiones` es de **solo
adición**: si el borrador se guardara ahí, un autoguardado cada treinta segundos dejaría
cientos de filas inmutables por sesión, y la cadena de huellas se llenaría de eslabones que
no son nada.

**Decisión**: dos sitios, y la frontera es la firma.

- `notas_clinicas` (la cabecera) es **mutable** y guarda el borrador: `borrador_contenido`,
  `borrador_actualizado_en` y su autor. Uno por nota. El autoguardado escribe aquí y solo
  aquí.
- `notas_clinicas_versiones` es de solo adición y **solo recibe filas al firmar**: se
  canoniza (ADR-035), se sella y se encadena. El borrador se vacía.
- **El borrador no tiene huella y no está en la cadena.** Es mutable a propósito. Queda
  escrito para que a nadie le parezca una incoherencia que hay que «arreglar» metiéndolo.
- Corregir una nota firmada es abrir un borrador nuevo partiendo de la última versión; al
  firmar se añade otra versión con **motivo obligatorio**. No existe editar.
- **El borrador es dato clínico de pleno derecho**: mismo RLS, mismo candado del PIN
  (ADR-026), mismo registro de acceso. No es un limbo sin reglas.
- **Bloqueo optimista** por `borrador_actualizado_en`: si el mismo profesional lo tiene
  abierto en dos sitios, la segunda escritura se rechaza y avisa en vez de pisar en
  silencio.
- Un borrador abandonado más de N días genera aviso en `alertas_documentacion`, que ya
  existe para eso. Una nota sin firmar es exactamente la deuda documental que esa tabla
  vigila.

**Consecuencias**:

- Se gana: autoguardado real sin ensuciar la cadena, y una frontera de una sola frase — se
  entra a la cadena firmando.
- Se pierde: el borrador no es recuperable versión a versión. Si alguien borra medio párrafo
  y guarda, se perdió. Es el precio de no versionar lo que aún no es un acto clínico.
- Queda bloqueado: insertar en `notas_clinicas_versiones` algo que no sea una firma;
  guardar borradores en una tabla de solo adición; y dejar el borrador fuera del candado o
  del RLS.

---

## ADR-037 · La unidad de `accesos_historia` es la apertura de una historia, no la fila leída

**22-08-2026** · **Estado**: aceptada

**Contexto**: el maestro es tajante — «**cada lectura** de una historia clínica queda
registrada, no solo cada escritura. Es la única forma de responder a *¿quién ha visto mi
historial?*». Pero no dice qué es una lectura, y las dos lecturas literales son inservibles:
registrar cada fila leída convierte **cada render en una escritura** —contra el renderizado
en servidor, que es la decisión 3— y produce un registro que ningún humano puede leer, es
decir, que no responde a la pregunta que lo justifica.

**Decisión**: la unidad es **un usuario abriendo la historia de un paciente**.

- Se registra al **abrir contenido clínico** de un paciente: quién, qué paciente, cuándo,
  desde dónde y **qué pestaña** (ADR-026 §pestañas).
- **Las aperturas repetidas dentro de la ventana del desbloqueo del PIN son un solo
  acceso**, con contador de vistas. La ventana de 15 minutos del ADR-026 es la unidad
  natural de «una consulta», y así navegar entre las cinco pestañas de un paciente no genera
  cinco filas ni cincuenta.
- **Las listas no son accesos.** Una lista de pacientes con nombre, profesional y estado
  documental es ficha básica, no historia — invariante 3. El derecho de acceso pregunta
  «¿quién ha visto mi historial?», no «¿quién ha visto mi nombre en una lista». Registrarlo
  todo enterraría lo que importa.
- **La escritura no ocurre en el render.** El registro lo hace la Server Action de apertura,
  la misma que comprueba el desbloqueo. El componente de servidor que pinta sigue siendo
  lectura pura. Sin esta regla, cada recarga de página escribiría en la base.
- **Las búsquedas van a `auditoria`**, no aquí: toda búsqueda que devuelve pacientes es un
  acceso a datos personales (choque 8 de `interfaz.md`), pero no es abrir una historia.
- Exportaciones, informes y **acceso de emergencia** son tipos propios dentro de
  `accesos_historia`, el último destacado como ya manda la decisión 5.

**Consecuencias**:

- Se gana: un registro que un humano puede leer y que responde de verdad a un paciente que
  pregunta. Y el renderizado en servidor sigue sin efectos secundarios.
- Se pierde: no se puede reconstruir «qué nota concreta miró durante cuánto tiempo». Es
  deliberado: eso no es lo que el art. 18 pregunta, y perseguirlo daría un registro
  ilegible y una aplicación lenta.
- Queda bloqueado: registrar accesos desde un componente de servidor; una fila por fila
  leída; y contar la lista de pacientes como acceso a historia.

---

## ADR-038 · El correo saliente es de la clínica o lo envía una persona; nunca contratamos un proveedor

**22-08-2026** · **Estado**: aceptada

**Contexto**: el maestro contempla el correo como canal alternativo de recordatorio —
«enlace `wa.me` con envío manual desde una cola diaria, **más correo**», con «consentimiento
separado y revocable para el canal, distinto del asistencial, con alternativa real: correo,
o ningún recordatorio». Y ya hay correo hoy: el alta por invitación con enlace de un solo
uso, que envía Supabase Auth.

La pregunta no es «¿Resend o SES?». Es la misma que resolvió el ADR-023 con WhatsApp:
contratar un proveedor de correo **añade un encargado del tratamiento nuestro**, con su art.
28, su transferencia internacional y su secreto que rotar — para mandar «te esperamos mañana
a las 10».

**Decisión**: tres caminos, y ninguno contrata a nadie en nuestro nombre.

1. **Correo de cuenta** (invitación, recuperación, cambio de correo): sale por **Supabase
   Auth**, que ya es encargado del tratamiento por la base de datos. No añade a nadie. En
   desarrollo, Mailpit.
2. **Correo al paciente en v1**: **lo envía una persona**, exactamente como `wa.me`. La
   aplicación redacta y abre el cliente de correo con el mensaje preparado. Mismo patrón,
   misma cola del día, mismo consentimiento de canal.
3. **Si un cliente quiere envío automático**: se configura **su propio SMTP** en su
   instancia. El proveedor es suyo, el encargo es suyo, las credenciales van al **Vault de
   Supabase** —no a variables de entorno de Vercel, por lo mismo que el ADR-023— y con
   **clave distinta** de las del PIN y del DNI.

Las **notificaciones internas** (`notificaciones`, con acuse de lectura) viven **en la
aplicación**, no en el correo. Una incidencia de un paciente dirigida a un profesional es
dato clínico: no sale a un buzón.

**Consecuencias**:

- Se gana: la cadena de encargados no crece por iniciativa nuestra, aquí tampoco. Y el
  correo del paciente sale de una dirección que él reconoce, la de su clínica.
- Se pierde: sin estado de entrega ni de apertura, igual que con `wa.me`, y una persona
  tiene que pulsar. El envío automático no es característica de catálogo: se habilita caso a
  caso con papeleo del cliente.
- Queda bloqueado: contratar Resend, SES, Postmark o cualquier proveedor de correo en
  nombre nuestro; y mandar contenido clínico por correo.

---

## ADR-039 · El segundo factor es TOTP, para los tres roles

**22-08-2026** · **Estado**: aceptada

**Contexto**: `decisions.md` cerró «MFA obligatorio para administrador y profesional» sin
decir de qué tipo, y T-006 lo va a implementar. Sin fijarlo, la vía cómoda es el SMS.

**Decisión**: **TOTP con aplicación de autenticación**. Nada de SMS: añade un proveedor y un
coste por mensaje —lo mismo que el ADR-038 acaba de rechazar para el correo— y encima es el
factor más débil, por intercambio de SIM. Un segundo factor que se puede robar llamando a
una operadora no es un segundo factor.

- **Códigos de recuperación** de un solo uso, generados al activar y mostrados una vez.
- Alta en el primer acceso tras la invitación, en este orden: **contraseña → TOTP → PIN**
  (ADR-026). Tres cosas distintas: quién eres, que sigues siendo tú al entrar, y que sigues
  delante del teclado al abrir una historia.
- **Reponer el TOTP sí lo puede hacer el administrador**, auditado y con aviso al titular —
  al contrario que el PIN, que solo lo cambia su dueño. El motivo es práctico: perder el
  móvil es común y deja a la persona fuera; perder el PIN no, porque se recupera
  reautenticándose. Reponer el TOTP no da acceso a nada clínico: la matriz de roles no se
  mueve.
- **Se extiende al técnico administrativo**, que la decisión original no cubría. Maneja
  agenda, contacto y cobros: datos personales de pacientes. Aquello era un mínimo, no un
  techo.

**Consecuencias**:

- Se gana: un segundo factor real, sin proveedor, sin coste por uso y sin número de
  teléfono que custodiar.
- Se pierde: quien no tiene móvil con aplicación de autenticación necesita ayuda para
  entrar, y el alta de usuario tiene un paso más.
- Queda bloqueado: SMS o correo como segundo factor; y que el administrador reponga un PIN.

---

## ADR-040 · Todo a mano: sin librería de componentes, con la accesibilidad a nuestro cargo

**22-08-2026** · **Estado**: aceptada

**Contexto**: **contradicción sin registrar entre el maestro y el ADR-025.** El maestro fija
en su tabla de stack «Tailwind CSS + **shadcn/ui sobre Radix** — accesibilidad de teclado y
foco resueltas de origen». `state.md` dice, de pasada, «Sin shadcn ni Base UI: el prototipo
no los usaba». Nadie escribió por qué, ni qué se perdía. Y lo que se perdía era justamente el
mecanismo con el que se iba a cumplir el compromiso de accesibilidad del ADR-041.

Escribir a mano una tarjeta o una píldora no cuesta accesibilidad: son un `div` con texto.
Escribir a mano un diálogo, un menú, unas pestañas o un desplegable **sí**: trampa de foco,
`tabindex` móvil, `aria-expanded`, cierre con Escape y clic fuera, anuncio al lector de
pantalla. Ahí es donde se pierde, y en silencio.

**Decisión**: **todo a mano, sin librería de componentes.** Ni shadcn/ui ni Radix ni Base UI.

Decidido por el propietario el 22-08-2026, **contra la recomendación de este ADR y contra lo
que dice el maestro**. Queda escrito así, con su fecha, para que no se relea dentro de seis
meses como un descuido: fue una elección, y las consecuencias de abajo se aceptaron con ella.

Se gana control total del marcado, cero dependencias de interfaz y un solo sistema de tokens
—el del ADR-025— sin nada que reconciliar. Lo que se compra a cambio deja de ser opcional:

- **`components/ui/` es el sitio, y se escribe una vez.** Diálogo, menú, pestañas,
  desplegable, emergente y casilla se construyen **como primitivas compartidas**, no dentro
  de la pantalla que las necesitó primero. Repetir el patrón por pantalla multiplica por
  siete el trabajo y garantiza que seis salgan mal.
- **Cada primitiva con comportamiento nace con su lista de comprobación cumplida**: trampa
  de foco y devolución del foco al cerrar, `tabindex` móvil donde toque, `aria-expanded` /
  `aria-controls` / `role` correctos, cierre con Escape y con clic fuera, y anuncio al lector
  de pantalla. Esa lista vive en `interfaz.md` y **es un criterio de aceptación**, no una
  buena intención.
- **El ADR-041 sigue en vigor y ahora es lo que sostiene esto.** El verificador del pipeline
  pasa a ser la única red: sin librería debajo, un fallo de teclado no lo caza nadie más.
  Si alguna vez se relaja el 041, esta decisión hay que reabrirla con él.
- **El calendario ya era a mano** por la decisión 20, así que aquí no cambia nada: teclado y
  ARIA explícitos, con prueba, igual que una política de RLS.
- Lo que es pintura —tarjeta, métrica, píldora, fila con avatar, progreso, franja,
  encabezado, estado vacío— seguía y sigue a mano. Ahí nunca hubo discusión: son un `div` con
  texto.

**Consecuencias**:

- Se gana: ninguna dependencia de interfaz, un solo sistema de color, y libertad total en el
  marcado — que con el ADR-044 «todo en todos los anchos» deja de ser un lujo y pasa a ser
  útil.
- Se pierde: lo difícil de la accesibilidad hay que escribirlo. T-007 crece con las
  primitivas compartidas, y cada una necesita prueba de teclado propia. Es la parte que la
  librería regalaba.
- Queda bloqueado: instalar shadcn/ui, Radix o Base UI; y escribir un diálogo, un menú, unas
  pestañas o un desplegable **dentro de una pantalla** en vez de en `components/ui/`.

---

## ADR-041 · WCAG 2.2 AA es objetivo verificado en el pipeline, no una declaración

**22-08-2026** · **Estado**: aceptada

**Contexto**: el maestro lo dice y **ningún destilado lo recogía**, así que para un agente
que solo lee los destilados —que es lo que ordena `CLAUDE.md`— no existía: «WCAG 2.2 AA como
objetivo de calidad verificado en el pipeline. Sin declaración de accesibilidad ni auditoría
formal, pero el producto no queda inaccesible por omisión». La auditoría formal y la
declaración publicada quedan donde la decisión 12 dejó el sector público: aparcadas.

**Decisión**: se asume el compromiso y se hace comprobable.

- **Verificación automática en el pipeline** (T-009), no una promesa. Lo que se comprueba:
  contraste de los tokens sobre cada superficie, foco visible siempre, navegación completa
  por teclado, etiquetas de formulario reales asociadas a su control, y respeto a
  `prefers-reduced-motion`.
- **La personalización de color valida el contraste antes de guardar** —está en el maestro y
  tampoco estaba en `interfaz.md`—: si la combinación incumple AA sobre alguna superficie, se
  avisa y se propone el tono más cercano que sí cumple. *Un administrador con buen gusto y
  mala vista no debe poder dejar la aplicación ilegible para su equipo.*
- El **calendario a medida y el editor de notas** son los dos sitios donde esto se gana o se
  pierde de verdad, y los dos llevan prueba de teclado propia.
- Ya decidido y se mantiene: `userScalable: false` del prototipo **descartado**, y Ajustes
  ofrece tamaño de texto.
- La herramienta concreta la elige T-009; lo que fija este ADR es que **existe y corre en
  cada build**.

**Consecuencias**:

- Se gana: el compromiso deja de vivir en un documento que nadie abre y pasa a fallar el
  build cuando se incumple.
- Se pierde: builds que fallan por contraste, y algún tono del prototipo puede no sobrevivir
  a la verificación.
- Queda bloqueado: dar por accesible algo sin comprobarlo; publicar declaración de
  accesibilidad o afirmar conformidad formal (decisión 12).

---

## ADR-042 · Tema claro en v1, pero sin cerrarle la puerta al oscuro

**22-08-2026** · **Estado**: aceptada

**Contexto**: `interfaz.md` lo dejó explícitamente aplazado: «Tema claro únicamente. El
prototipo declara `color-scheme: light` y no hay paleta oscura. Si entra, entra como decisión
propia». Esta es esa decisión.

**Decisión**: **no hay tema oscuro en v1**, y la puerta se deja abierta con una sola regla.

- Motivo de no hacerlo: una consulta se trabaja de día y con luz, y un tema oscuro **duplica
  el trabajo de contraste** del ADR-041 en cada pantalla. Es coste cierto por beneficio
  estético.
- Motivo de no cerrarlo: los tokens ya están en oklch y en `:root`, así que añadirlo sería
  añadir un bloque de tokens, no auditar la aplicación entera.
- **La regla que lo mantiene barato**: ningún componente escribe un color literal. Siempre
  token. Sin excepciones, ni «solo este borde».
- **No se pinta un conmutador de tema.** Un control sin acción real detrás está prohibido por
  el ADR-025.

**Consecuencias**:

- Se gana: la mitad del trabajo de contraste y ninguna pantalla que revisar dos veces.
- Se pierde: quien lo espere no lo tendrá, y habrá que decirlo en la venta.
- Queda bloqueado: colores literales en componentes; y dibujar un conmutador de tema.

---

## ADR-043 · Cache Components activado, y nada de un paciente se cachea jamás

**22-08-2026** · **Estado**: aceptada

**Contexto**: `next.config.ts` está vacío y el modelo de render nunca se decidió. En Next 16
esto no es cuestión de estilo: decide qué HTML se genera antes de que exista una petición, y
en una aplicación clínica eso es una pregunta de protección de datos, no de rendimiento.

Verificado en la documentación del paquete instalado
(`node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` y
`.../directives/use-cache-private.md`), porque `AGENTS.md` lo exige y porque aquí la memoria
del modelo está desactualizada:

- La bandera es **`cacheComponents: true`**, en la raíz de `next.config.ts`. No bajo
  `experimental`.
- El trabajo asíncrono sin cachear **debe envolverse en `<Suspense>`**, o bloquea el
  prerenderizado; el aviso `blocking-prerender-dynamic` lo señala en desarrollo.
- El sustituto de `<Suspense>` viaja en el armazón estático y el contenido llega en flujo al
  atender la petición.
- `crypto`, `Date.now()` y los valores aleatorios disparan avisos `blocking-prerender-*`.

**Decisión**: se activa `cacheComponents: true` en T-007, con tres reglas.

**1 · Nada específico de un paciente se cachea. Nunca.** Ni con `use cache`, ni con
`use cache: remote`, ni con **`use cache: private`** — y esta última merece explicación,
porque la documentación la ofrece precisamente para «requisitos de cumplimiento que impiden
almacenar datos en el servidor». Para nosotros es **peor, no mejor**: guarda en la memoria del
navegador, es decir, deja contenido clínico al alcance después de que el candado del ADR-026
se haya cerrado. La característica pensada para cumplimiento no sirve a *este* cumplimiento.

**2 · `use cache` solo para catálogos**: CIE-10-ES, DSM-5-TR, tipos de terapia, festivos.
Datos iguales para todo el mundo que cambian poco. Nada que dependa del usuario, del rol ni
del paciente.

**3 · Un `<Suspense>` y un esqueleto por bloque de datos, no uno por página.** Una ficha de
paciente hace varias consultas —cabecera, episodios, notas, facturación— y bloquear la
pantalla entera a la más lenta la hace sentir rota. Error boundary también por bloque: que
falle la facturación no puede tumbar la historia. El estado vacío es parte del componente, no
un caso aparte.

El armazón, los encabezados de módulo y los estados vacíos son el armazón estático. Todo lo
demás llega en flujo.

Consecuencia sobre los ADR anteriores, verificada y no supuesta: **la cadena de huellas
(ADR-035) y el formateo de horas (ADR-034) no pueden vivir en el render**, porque `crypto` y
`Date.now()` bloquean el prerenderizado. Viven donde ya se decidió que vivieran: en Server
Actions y en la base de datos.

**Consecuencias**:

- Se gana: la frontera entre lo prerenderizable y lo que no lo es deja de ser implícita y la
  vigila el compilador. En una aplicación clínica esa frontera es la que importa.
- Se pierde: activar la bandera saca a la luz cada punto que hoy bloquea el prerenderizado
  sin avisar, así que T-007 arrastra trabajo de saneamiento.
- Queda bloqueado: `use cache` en cualquier dato de paciente, usuario o rol;
  `use cache: private` en datos clínicos; y un único `<Suspense>` envolviendo la página.

---

## ADR-044 · Todo funciona en todos los anchos, desde 360 px

**22-08-2026** · **Estado**: aceptada

**Contexto**: el armazón ya trae cajón para móvil, pero nadie decidió si la aplicación se usa
en tablet **durante la sesión**. No es una cuestión de rejilla: si la nota clínica se escribe
en tablet, el editor y el calendario semanal son otros productos.

**Decisión**: **todo funciona en todos los anchos, desde 360 px.** No hay mínimo por pantalla
ni vista degradada: el editor de notas y el calendario semanal se usan en el móvil.

Decidido por el propietario el 22-08-2026, contra la propuesta original de este ADR. Se
escribe con su fecha porque encarece dos de las piezas más caras del producto y conviene que
se lea como elección, no como falta de criterio.

- **Ninguna pantalla avisa de que «se ve mejor en ordenador».** Si aparece ese aviso, la
  pantalla está sin terminar.
- **El editor de notas necesita diseño táctil propio**: barra de herramientas alcanzable con
  el pulgar, sin dependencia de atajos de teclado, y el teclado virtual no puede tapar el
  cursor. Es un producto distinto del de escritorio, no el mismo estrechado.
- **El calendario semanal en 360 px no es una semana estrechada.** Siete columnas en un móvil
  no se leen: la vista se reorganiza —día con desplazamiento lateral, o lista por franjas—
  conservando la misma información y las mismas acciones. Qué forma concreta toma se decide
  en su ticket, mirándolo en un teléfono real, no aquí.
- **Objetivos táctiles de 44 px** en todo lo que se pulse, que además es lo que el ADR-041
  necesita para el criterio de tamaño de destino de WCAG 2.2.
- **El candado del ADR-026 rige igual en móvil**, y ahí importa más: un teléfono desbloqueado
  sobre la mesa es exactamente el escenario que el PIN existe para cubrir.
- Con el ADR-040 —todo a mano— esto compone: las primitivas de `components/ui/` nacen
  responsivas y táctiles **la primera vez**. Escribirlas para escritorio y adaptarlas después
  costaría el doble.

**Consecuencias**:

- Se gana: no hay usuario de segunda ni conversación sobre qué se puede hacer desde dónde. En
  una consulta que se mueve entre despacho, sala y casa, eso vale.
- Se pierde: el editor y el calendario **se diseñan dos veces**, y son justo las dos piezas
  más caras. La fase 1 se alarga por ahí, no por otro sitio.
- Queda bloqueado: bloquear o degradar una pantalla por ancho; avisar de que hace falta un
  ordenador; y dar por terminada una pantalla sin haberla probado a 360 px.

---

## ADR-045 · Los estados de la cita son cinco, y «en curso» lo dice el reloj

**26-08-2026** · **Estado**: aceptada

**Contexto**: el recorrido de nota clínica en presencial arranca cuando una cita empieza, y la
agenda tiene que distinguir de un vistazo lo que está pasando ahora de lo que está por pasar.
La tentación es guardar «en curso» como un estado más de la fila, junto a programada o
cancelada. Hay que decidirlo antes de escribir la tabla `citas`: cambiar un enum con filas
dentro es una migración.

**Decisión**: `citas.estado` es un enum de **cinco valores** —`programada`, `confirmada`,
`realizada`, `cancelada`, `no_asistida`— y **«en curso» no es uno de ellos**.

- «En curso» se **calcula**: el instante actual cae entre `inicio` y `fin`, y el estado no es
  `cancelada` ni `no_asistida`. Se resuelve en servidor, en la zona del centro, y baja como
  dato hecho igual que el saludo del armazón. Nunca con `new Date()` en cliente.
- Los cinco que sí se guardan son **hechos que alguien afirma**: se programó, el paciente
  confirmó, vino, se anuló, no vino. Cada uno tiene un actor y una fecha, y por eso vive en
  una fila auditada.
- `realizada` es la que abre los dos deberes del ciclo —la nota y el cobro— y la que dispara
  la alerta de documentación. Se marca a mano o al pasar el fin de la cita, según configure el
  centro; nunca se deduce del reloj a espaldas de nadie.

**Por qué no persistirlo**: exigiría una tarea que reescribiera filas cada minuto sobre una
tabla auditada —un `UPDATE` por cita y por transición, ruido puro en `auditoria`— y obligaría
a decidir qué pasa cuando el proceso no corre. Una cita que amanece «en curso» porque el
servidor se cayó a las nueve de la noche es un dato falso en el sitio donde menos se puede
permitir. El reloj ya sabe la respuesta; no hace falta guardarla.

**Consecuencias**:

- Se gana: cero mantenimiento, cero deriva entre lo guardado y lo cierto, y el estado se puede
  recalcular hacia atrás sobre cualquier fecha sin haber previsto nada.
- Se pierde: no se puede indexar «en curso» ni consultarlo desde SQL puro sin repetir la
  expresión. Se resuelve con una función `esta_en_curso(cita)` en la migración, para que la
  regla viva escrita una sola vez.
- Queda bloqueado: añadir `en_curso` al enum; cualquier tarea programada que actualice estados
  de cita por el mero paso del tiempo; y leer el reloj en cliente para decidir el color de una
  cita.

---

## ADR-046 · La nota sabe si se escribió durante la sesión, y eso va dentro de la huella

**26-08-2026** · **Estado**: aceptada

**Contexto**: una nota clínica escrita mientras el paciente está delante y una escrita de
memoria el viernes por la tarde valen lo mismo ante la ley y no valen lo mismo ante un
juzgado. El propietario pidió que quede registrado que la nota se hace **durante el curso de
la sesión**. La pregunta real no es si guardarlo, sino **dónde**: la cabecera mutable de
`notas_clinicas` o el sobre sellado del ADR-035.

**Decisión**: va **dentro del sobre canónico**, que crece con cuatro campos:

| Campo | Qué es |
|---|---|
| `cita_id` | La cita que documenta esta nota, o nulo si no cuelga de ninguna |
| `abierta_en` | Cuándo se abrió el editor por primera vez para esta versión |
| `firmada_en` | Cuándo se firmó |
| `redactada_en_sesion` | Verdadero si `abierta_en` y `firmada_en` caen dentro de la ventana de la cita más el margen del centro |

- El margen es configurable por centro y **se guarda con la nota**, no se consulta al
  verificar: la regla que aplicó ese día tiene que seguir siendo legible dentro de diez años
  aunque el centro la haya cambiado tres veces.
- `redactada_en_sesion` se **calcula en el servidor al firmar** y se sella. No es un campo que
  el usuario marque: una casilla de «lo escribí en sesión» es exactamente lo que este sistema
  existe para no tener que creerse.
- Sube `esquema_version` del sobre. `algoritmo_version` **no cambia**: sigue siendo JCS + NFC
  + SHA-256.
- Este ADR **se cierra antes de T-005**, para que el canonicalizador nazca con el sobre
  completo.

**Por qué no en la cabecera mutable**: un dato que puede cambiar después no demuestra nada. Si
`redactada_en_sesion` vive en `notas_clinicas`, cualquiera con `UPDATE` sobre esa tabla —que
son todos los que pueden escribir un borrador— convierte un «lo escribí el viernes» en un «lo
escribí en sesión» sin dejar rastro en la cadena. Dentro del sobre, ese cambio rompe la huella
y la verificación nocturna lo canta con nombre y fecha.

**Consecuencias**:

- Se gana: un hecho oponible en lugar de una anotación de cortesía, y por el mismo precio la
  nota queda atada a su cita dentro del sello.
- Se pierde: añadirlo más tarde habría obligado a convivir con dos formatos de sobre para
  siempre. Se paga ahora un campo y un cálculo; entonces se habría pagado una era nueva de
  algoritmo.
- Queda bloqueado: exponer `redactada_en_sesion` como casilla del formulario; derivarlo en la
  verificación en lugar de releerlo del sobre; y guardar el margen del centro solo por
  referencia.

---

## ADR-047 · El aviso de sesión no interrumpe, y el estado late en lugar de parpadear

**26-08-2026** · **Estado**: aceptada

**Contexto**: el propietario pidió dos cosas para la agenda: que al llegar la hora de la cita
salte un aviso emergente que lleve a la sesión, y que el estado se vea como un icono redondo
«parpadeante e iluminado». Las dos chocan con algo ya cerrado —el sistema de diseño dice
«ninguna animación decorativa», el ADR-041 fija WCAG 2.2 AA verificado en el pipeline— y las
dos son buenas ideas mal vestidas. Se resuelven aquí, una vez, para las dos pantallas.

**Decisión**:

**a · El aviso no roba el foco.** Al empezar la cita aparece una franja no modal —paciente,
hora, botón «Notas»— más un ancla persistente en la cabecera mientras la sesión dure. La
franja se descarta y no vuelve; el ancla se queda.

Un diálogo modal centrado se descarta a propósito: la hora de una cita es exactamente el
momento en que el profesional puede estar escribiendo en la historia de otro paciente o
recogiendo una firma con el paciente delante. Una ventana que aparece encima y captura el
teclado hace pulsar a ciegas, y en esta aplicación pulsar a ciegas puede firmar algo.

**b · El estado late, no parpadea.** El indicador de «en curso» es un punto con pulso de ciclo
largo —≈2 s, opacidad y halo, sin encendido y apagado— sujeto a tres reglas:

- **Un solo elemento animado en pantalla a la vez.** Solo la cita en curso late, y solo puede
  haber una por profesional. Una agenda con seis puntos parpadeando no señala nada.
- **`prefers-reduced-motion` lo detiene**, y lo que queda es un punto relleno con halo. La
  información no vive en el movimiento.
- **El color nunca va solo**: forma y etiqueta de texto siempre, para daltonismo, brillo bajo y
  papel. Verde con punto y «En curso», no verde a secas.

Esto no es una excepción al ADR-041: es su lectura estricta. Un parpadeo de encendido y apagado
obligaría a un control para pararlo (SC 2.2.2) y haría fallar el verificador de T-009. Un pulso
lento que se detiene solo con la preferencia del sistema pasa, y de lejos se ve igual de vivo.

**Consecuencias**:

- Se gana: el aviso es imposible de perder sin ser imposible de ignorar, y la agenda se lee a un
  metro de distancia sin romper el listón de accesibilidad.
- Se pierde: el aviso se puede descartar sin actuar. Lo cubre el escalado de la alerta de
  documentación, que es el mecanismo que sí insiste.
- Queda bloqueado: cualquier diálogo modal disparado por el reloj; parpadeo de encendido y
  apagado en cualquier pantalla; más de un elemento animado a la vez; y un estado representado
  solo por color.

---

## ADR-048 · Los consentimientos no viven bajo el candado

**26-08-2026** · **Estado**: aceptada

**Contexto**: `docs/interfaz.md` coloca «Documentos» —consentimientos firmados, protección de
datos, adjuntos— como quinta sub-pestaña dentro de Historia clínica, y por tanto detrás del PIN
del ADR-026. Pero las políticas de T-002 dejaron `consentimientos` y `consentimiento_firmantes`
**fuera** de `historia_desbloqueada()`, a propósito. Una de las dos cosas está mal, y hay que
decidir cuál antes de dibujar la ficha del paciente.

**Decisión**: manda la arquitectura. **«Documentos y consentimientos» es una pestaña de la
ficha**, al nivel de Resumen y Facturación, y **no pide PIN**.

- La pregunta que resuelve esa pestaña —«¿tenemos su consentimiento firmado?»— es de recepción,
  se hace veinte veces al día y no es contenido clínico: es un documento administrativo con una
  versión de texto y una fecha. Meterla detrás del PIN convierte el candado en un peaje, y un
  candado que estorba se acaba dejando abierto todo el día.
- Historia clínica se queda con **cuatro** sub-pestañas bajo llave: `historial_clinico`,
  `notas_clinicas`, `evaluaciones`, `informes`. Son las que tocan contenido.
- El enum `pestana_historia` de T-001 **no se toca**. Su valor `documentos` queda reservado para
  los adjuntos clínicos que sí viven dentro, y una migración de enum se ahorra.
- Esto no relaja el invariante 3: quién ve qué lo sigue decidiendo RLS. El técnico
  administrativo ve que existe un consentimiento y su estado; no ve lo que hay dentro de un
  informe ni de una nota, porque esas tablas nunca están en esta pestaña.

**Consecuencias**:

- Se gana: la interfaz y las políticas dicen lo mismo, que era la condición para que el candado
  se entienda. Y recepción trabaja sin PIN, que es lo que hace que el PIN se respete donde
  importa.
- Se pierde: la ficha tiene cinco pestañas en lugar de cuatro. Cabe.
- Queda bloqueado: enseñar consentimientos también dentro de Historia clínica —dos puertas a los
  mismos datos son dos sitios donde poner el candado, y es el choque 11 otra vez—; y crear una
  sub-pestaña «Observaciones y otros», que el destilado ya rechaza por ser un cajón de sastre.

---

## ADR-049 · Psicogestión no es producto sanitario, y esta es la línea que no se cruza

**26-08-2026** · **Estado**: aceptada

**Contexto**: el documento maestro reconcilia **cuatro** cuerpos normativos —protección de
datos, historia clínica, facturación electrónica y fiscalidad— y da por cerrada la
cuestión legal. La revisión del FOCAD 286 del Consejo General de la Psicología («Salud
Mental Digital», Halty) enseña que faltan tres reglamentos europeos que ninguno de los
cuatro cubre: el **MDR (UE) 2017/745** de productos sanitarios, el **AI Act (UE)
2024/1689** y el **Espacio Europeo de Datos de Salud, Reglamento (UE) 2025/327**.

Ninguno de los tres obliga hoy a cambiar una línea. Dos de ellos obligan a **no** cambiar
ciertas líneas, y el tercero obliga a mirar de reojo. Por eso se escribe: la clasificación
de un producto como sanitario **la hace el fabricante y responde de ella**, y una
clasificación que no está escrita en ningún sitio es una clasificación que nadie ha hecho.

**Decisión**:

**a · Psicogestión no es producto sanitario, y consta por escrito por qué.** Es software de
gestión de consulta: agenda, historia clínica, evaluaciones almacenadas, informes
redactados por una persona y facturación. **No diagnostica, no monitoriza, no calcula nada
clínico y no recomienda ningún tratamiento.** Queda fuera del art. 2.1 del MDR, sin
marcado CE y sin registro en AEMPS. La clasificación se revisa en cada ADR que añada
función clínica.

**b · La línea que no se cruza.** Tres funciones convertirían el producto en «software como
producto sanitario» (SaMD). **Si alguna entra en un ticket, el ticket se para y se abre un
ADR antes de escribir una línea de código**:

1. **Corregir una prueba**: derivar puntuaciones, baremos o interpretación de lo que se
   introduce en `evaluaciones`. Hoy `puntuaciones` es un `jsonb` que alguien teclea, e
   `interpretacion` es texto que alguien escribe. Que el sistema los **calcule** es otra
   cosa. ⚠ `docs/interfaz.md` describe la sub-pestaña Evaluaciones como «pruebas,
   **corrección** y adjuntos», y la fase 2 de `PLAN.md` incluye validación y análisis de
   archivos: **la frontera está dibujada dentro del plan, no fuera de él**.
2. **Calcular o proponer un nivel de riesgo.** `valoraciones_riesgo.nivel` lo fija el
   profesional; `indicador` es un `GENERATED` trivial sobre ese nivel y no deriva nada. El
   día que el nivel salga de las puntuaciones, sale también del ámbito de este ADR.
3. **Proponer, priorizar o triar** un tratamiento, una derivación o un orden de atención.

**c · Sin inteligencia artificial en v1, y la puerta se cierra a propósito.** La sugerencia
de hora del alta de cita es **determinista y explicable** —la moda del intervalo de las
seis últimas citas, cruzada con día y franja habituales— y se queda así. Se decidió por
criterio de producto, y de paso deja el AI Act fuera entero. Si algún día entra IA:

- **Nunca sale contenido clínico de la instancia.** Choca de frente con la decisión 1
  (instancia dedicada) y con el ADR-038 (nada clínico por canales de terceros). Un modelo
  alojado fuera es un encargado del tratamiento más, y hoy no hay ninguno.
- Transparencia al paciente, supervisión humana real y trazabilidad del uso, que son las
  obligaciones del **desplegador** aunque el sistema no sea de alto riesgo.
- Y **ADR previo**, siempre.

**d · El EEDS se vigila desde ahora; se implementa cuando toque.** Psicogestión **es** lo
que el Reglamento (UE) 2025/327 llama un sistema de historia clínica electrónica, así que
le tocarán interoperabilidad, formato europeo de intercambio y declaración de conformidad.
La aplicación es escalonada y la parte de sistemas de HCE llega después de la aplicación
general; **el calendario exacto se confirma contra el texto del reglamento antes de
planificar nada**, no contra un curso de formación que lo cita de pasada.

Lo único que se hace ya, porque hoy es gratis y después es una migración:

- **Toda exportación de datos clínicos sale por una capa propia con su formato versionado**
  —`exportaciones` ya guarda alcance, filtros, algoritmo y huella—, **nunca** por un
  `select` incrustado en la pantalla que la pidió. El día que haya que emitir en un formato
  ajeno, se añade un formato, no se reescriben veinte pantallas.
- **Todo código clínico se guarda con su sistema y su versión.** `diagnosticos` ya lleva
  `cie10es_codigo` y `dsm5tr_codigo` separados. Un código sin sistema no se puede mapear a
  nada, y mapear es exactamente lo que el EEDS va a pedir.

**Consecuencias**:

- Se gana: una clasificación defendible por escrito, con su fecha y su motivo, que es lo
  que el MDR pide al fabricante; y dos hábitos baratos que dejan el EEDS alcanzable.
- Se pierde: la corrección automática de pruebas —que es una función que se vendería
  sola— deja de ser una tarea de fase 2 y pasa a ser una decisión con su propio ADR y su
  propio coste regulatorio. Es el precio correcto: no se puede corregir un WAIS de tapadillo.
- Queda bloqueado: implementar cualquiera de las tres funciones de **b** sin ADR previo;
  meter IA sobre contenido clínico; anunciar el producto con lenguaje diagnóstico,
  terapéutico o de monitorización en cualquier material comercial —**la finalidad prevista
  la fija lo que el fabricante afirma**, no lo que el código hace—; y planificar trabajo de
  EEDS sobre fechas leídas de segunda mano.

---

## ADR-050 · Cuatro módulos, no siete: Inicio y Clínica no son pantallas, son bloques

**26-08-2026** · **Estado**: aceptada

**Contexto**: el armazón nace con siete módulos —Inicio, Pacientes, Agenda, Clínica,
Facturación, Usuarios, Ajustes—, heredados del prototipo. Al dibujar el recorrido de nota
en presencial se ve que dos de ellos no tienen contenido propio: **Inicio** es el
calendario del día más unas métricas, es decir, la Agenda descrita otra vez; y **Clínica**
es una bandeja que se alimenta de `alertas_documentacion` y que el maestro **ya coloca**
en el panel lateral de Inicio. Dos pantallas que iban a ser atajos tristes la una de la
otra.

**Decisión**: **cuatro módulos**.

| Módulo | Ruta | Qué absorbe |
|---|---|---|
| **Agenda** | `/agenda` | Calendario en tres vistas · panel derecho con citas próximas, pendientes y **documentación pendiente** · cuadro inferior con adherencia, abandono, ingresos y **trazabilidad documental** |
| **Pacientes** | `/pacientes` | Lista, previsualización y ficha con sus cinco pestañas (ADR-048) |
| **Facturación** | `/facturacion` | Resumen, emisión, libro de gastos |
| **Ajustes** | `/ajustes` | Preferencias del usuario · **Mis firmas** · plantillas · **Centros y usuarios** |

- **`/` redirige a `/agenda`**, no a `/pacientes`. Es la pantalla que se mira cuarenta
  veces al día.
- **El módulo se sigue llamando Agenda, no Calendario.** El calendario es la pieza; la
  agenda es el dominio, y es la palabra que usan `architecture.md` §Roles («Agenda: todas ·
  la suya · todas sin tipo de terapia»), las tablas (`series_cita`) y `modulos.ts`.
  Renombrar el módulo desincronizaría la matriz de la navegación por un sinónimo.
- **Ajustes deja de ser un módulo de administrador.** Lo son sus secciones de empresa,
  centros y usuarios; las preferencias del espacio de trabajo y **Mis firmas** son de cada
  uno. Las secciones que el rol no puede usar **no se muestran**, no se muestran en gris.
- **El choque 6 sobrevive intacto**: Agenda no es una pantalla, son tres. El técnico
  administrativo ve todas las citas de su centro **sin tipo de terapia** (choque 4) y **no
  ve** adherencia, abandono ni trazabilidad, que son métricas clínicas.
- **El choque 11 se refuerza, no se relaja.** Al fusionar, la bandeja de documentación vive
  en la misma pantalla que mira el técnico: por eso sigue saliendo de
  `alertas_documentacion` y **jamás enseña contenido clínico**. La historia sigue teniendo
  una sola puerta, dentro del paciente.

**Consecuencias**:

- Se gana: dos pantallas menos que construir y mantener, una barra lateral que cabe en un
  móvil sin cajón infinito, y ninguna duplicación entre Inicio y Agenda.
- Se pierde: la bandeja de Clínica deja de tener pantalla propia, así que la lista larga
  ordenada por antigüedad vive en un panel y no en una tabla a pantalla completa. Si algún
  día la consulta tiene ocho profesionales, habrá que reabrirlo.
- Queda bloqueado: reintroducir Inicio o Clínica como módulo; llamar «Calendario» al
  módulo; y enseñar contenido clínico en Agenda, ni en la cita ni en la bandeja.

---

## ADR-051 · Un profesional puede pasar consulta en varios centros; uno es el principal

**26-08-2026** · **Estado**: aceptada

**Contexto**: `perfiles.centro_id` es una columna singular, y sobre ella se apoyan el
`check perfiles_tecnico_exige_centro`, la función `centro_actual()` y la RLS que acota al
técnico administrativo (ADR-033). El esquema de interfaz del 26-08 propone un asignador de
profesionales a centros con tarjetas arrastrables, y ahí aparece la pregunta que el modelo
no había contestado: **si el dibujo permite soltar a la misma persona en dos contenedores,
o el dibujo miente o el modelo está incompleto.**

Contestada por el propietario: **lo más frecuente es un solo centro, pero un profesional
puede ir a varios.** Y eso es cierto en una consulta real, así que se modela ahora: hacerlo
después es migrar datos de permisos, que es la peor clase de migración.

**Decisión**: la pertenencia a centro pasa a ser una **relación con vigencia**, y uno de
los centros es el **principal**.

- **`perfiles_centros`**: `perfil_id`, `centro_id`, `principal bool`, `desde date`,
  `hasta date`. Índice único parcial: **un solo principal vigente por perfil**, y una sola
  fila vigente por par perfil-centro.
- **`perfiles.centro_id` no se borra: pasa a ser el espejo del principal**, mantenido por
  disparador desde `perfiles_centros`. La migración es hacia delante y no destructiva; el
  `check` del técnico y todo lo que ya lee esa columna siguen funcionando el primer día.
- **`centros_actuales()` → `setof uuid`**, `stable security definer set search_path = ''`.
  Es la que usan las políticas: `centro_id in (select public.centros_actuales())`.
  **`centro_actual()` se conserva** devolviendo el principal, para lo que necesita
  exactamente uno.
- **El técnico administrativo sigue exigiendo centro**, ahora al menos una fila vigente en
  `perfiles_centros`. Sin centro no hay recorte, y sin recorte ve la organización entera.
- **El alta de paciente no adivina.** `fn_rellenar_centro_paciente` usa el **principal**; si
  el profesional trabaja en varios, **el centro del paciente se elige en el formulario**.
  No es cosmética: por el ADR-033 el centro decide el plazo de retención que se aplicará a
  esa historia durante veinticinco años.
- **El centro NO decide qué pacientes lee un profesional. Nunca lo ha decidido.** El
  profesional lee **los suyos** —los que tiene asignados y los que dio de alta él—, y eso
  lo resuelve `es_profesional_asignado()`, que mira `pacientes.profesional_id` y **no mira
  el centro para nada**. `centros_actuales()` **acota al técnico administrativo y a nadie
  más**; para el profesional devuelve vacío y ninguna política clínica lo consulta.
  Ampliarle el alcance a un profesional no es cosa de centros: es que **el administrador le
  asigne el paciente** —o lo dé de alta en el episodio (ADR-030)—, que es el único
  mecanismo que existe y el que debe seguir siendo.
- **Vigencia, no bandera** (mismo patrón que el ADR-028): cerrar una pertenencia con
  `hasta` **no le quita ni un paciente al profesional**. Lo que cambia es dónde aparece en
  la agenda del centro, qué disponibilidad y qué salas le corresponden, y qué centro se
  propone por defecto al dar de alta un paciente. Lo que sí le retira el acceso a sus
  pacientes es la **baja del perfil** (ADR-032) o que el administrador **desasigne**.
  Para el **técnico administrativo** es distinto y por eso lleva la fricción: cerrar su
  pertenencia a un centro **sí** le cambia los pacientes que puede leer, porque su recorte
  es el centro.
- **Lo asigna el administrador**, nunca el profesional sobre sí mismo — como la titularidad
  del ADR-032. Y **cada cambio pasa por confirmación explícita que dice lo que ocurre** y
  queda en `auditoria`: reasignar a un técnico le cambia los pacientes que puede leer, y
  eso no es un gesto de arrastre.

**Sobre el asignador de tarjetas**: el arrastre queda como **acelerador de escritorio, no
como el mecanismo**. Por debajo hay una lista con selector, por tres motivos que no son
opinión: el criterio **2.5.7 de WCAG 2.2 AA** exige una alternativa de puntero único que no
sea arrastrar y con el ADR-040 no hay librería que lo regale; a **360 px** el arrastre entre
contenedores no existe y el ADR-044 no admite vista degradada; y soltar una tarjeta es
**mover permisos**, que por el sistema de diseño no ocurre sin fricción.

**Consecuencias**:

- Se gana: el modelo deja de mentir sobre una situación corriente, y la interfaz puede
  dibujar lo que de verdad pasa. El coste se paga con T-002 sin revisar y sin datos reales
  dentro, que es el momento más barato que va a haber.
- Se pierde: **T-002 crece**. `centro_actual()` deja de bastar en las políticas del técnico
  —`pacientes`, `alertas_documentacion`, la vista `pacientes_indicador_riesgo` y el
  disparador `rellenar_centro_paciente`—, y todas ellas se reescriben con
  `centros_actuales()` **antes** de la revisión con Opus. Revisar un juego de políticas que
  vamos a cambiar es trabajo tirado.
- Queda bloqueado: que un profesional se asigne centros a sí mismo; borrar una pertenencia
  en lugar de cerrarla con `hasta`; que el alta de paciente elija centro por su cuenta
  cuando hay varios; y un asignador que solo funcione arrastrando.

---

## ADR-053 · Psicogestión no expide facturas: las expide el proveedor del cliente, y nosotros solo dejamos el borrador

**28-08-2026** · **Estado**: aceptada · **Revierte el ADR-052**, que nunca llegó a
transcribirse a este fichero y del que solo vivían las citas en los tickets T-021 a T-025.

**Contexto**: el ADR-052 aceptaba que Psicogestión fuera el **componente principal de
facturación (CPF)** de un SIF, con el componente de facturación (CF) delegado en una API tipo
Verifacti. Eso dejaba encima del propietario —empresario individual, art. 1911 CC— la
**declaración responsable (DR)** y el **art. 201.bis LGT: 150.000 € por ejercicio con ventas y
por tipo de sistema**. Se aceptó como riesgo acotado porque se creía que no había alternativa
sin matar el producto.

La había. Verificado el 28-08-2026 contra las *«Aclaraciones a dudas de los desarrolladores»*
de la AEAT (v1.3, 04-12-2025), leídas enteras en las aclaraciones 4, 5, 6, 8, 9, 10 y 11, y
contra las FAQ de la Sede. Tres citas cambian el diseño:

- **Aclaración 4** — «Resumidamente, un SIF expide **(o gestiona/dirige/controla la expedición
  de)** facturas con su QR tributario […] genera (o gestiona/dirige/controla la generación) y
  remite o conserva (o gestiona/dirige/controla la remisión o conservación) sus
  correspondientes registros de facturación.» **No hace falta expedir para ser SIF: basta con
  dirigir o controlar la expedición.**
- **Aclaración 10** — «es preciso diferenciar un SIF a los efectos de la norma, de lo que sería
  **el sistema de gestión y proceso general de las facturas** de la empresa». Y: «la
  responsabilidad del fabricante de un SIF alcanza a los RFs de las facturas emitidas por el
  SIF que haya certificado, **pero no alcanza en modo alguno** a los RFs correspondientes a
  facturas emitidas con otro SIF».
- **Aclaración 5** — «Por excepción, no será preciso certificar aquellos componentes que
  presten funcionalidades que sean irrelevantes […] esto es, las que **no afecten** a la
  generación del RF, a su encadenamiento, a la impresión de facturas, a la generación del QR,
  al envío a sede electrónica, **al enlace indefectible entre componentes**, a la conservación
  inalterada ni al registro de eventos.»

Y el punto de apoyo material: en Holded, la frontera entre las dos posturas es **un booleano**.
`approveDoc: false` crea un borrador **sin numeración** —Holded la asigna al aprobar— sin RF,
sin QR y sin remisión. `approveDoc: true`, o llamar al endpoint de aprobación, es dirigir la
expedición.

**Decisión**: Psicogestión es **sistema de gestión clínica**, no sistema informático de
facturación. La facturación se delega íntegra en el proveedor que ya use el cliente, con su
propia cuenta y su propia DR.

a) **No se expide.** No hay serie, ni numeración, ni registro de facturación, ni huella de
   factura, ni QR, ni remisión a la AEAT, ni firma, ni registro de eventos SIF. Nada de eso se
   escribe en la instancia, ni delegado en un CF. **No se firma DR** porque no hay nada que
   certificar.

b) **`approveDoc` siempre `false`, sin excepción, sin ajuste y sin bandera.** Y Psicogestión
   **no llama nunca** al endpoint de aprobación. Es el invariante del que cuelga todo el ADR y
   se prueba en negativo: no puede existir ruta de código que apruebe.

c) **No se conserva la factura.** Ni el PDF, ni el QR, ni copia del registro. Conservar es una
   de las ocho funcionalidades de la aclaración 5. Se guardan identificador, número, importe,
   estado y un enlace.

d) **Espejo de solo lectura.** Lo que vuelve del proveedor —número, fecha, total, estado,
   cobrado— se guarda para que la ficha del paciente sepa lo que se debe, en tabla que la
   aplicación **no puede editar**: entra por el sincronizador y por nadie más. Un espejo que se
   puede tocar deja de ser un espejo y empieza a ser una segunda contabilidad.

e) **Capa fina de proveedor, un solo adaptador.** Interfaz `ProveedorFacturacion` con
   Holded como única implementación. No se acopla el dominio a Holded: media consulta ya usa
   Quipu o lo que le imponga su gestoría, y reescribir después es peor que abstraer ahora.

f) **La clave API la pone el cliente y es suya.** Se genera en su cuenta, se guarda en el
   **Vault de Supabase** —jamás en una columna en claro ni en el navegador— y solo la lee el
   servidor. Sin clave configurada no hay facturación: modo degradado, no error.

g) **Reparto del dominio Económico.** Se queda dentro lo que está pegado al paciente y a la
   cita: `tarifas_paciente`, `bonos`, `cobros`, pendiente derivado. Se va fuera lo puramente
   fiscal: expedición, **libro de gastos**, resumen trimestral y modelos. Consecuencia directa:
   **T-022 y T-024 se retiran**, T-021 pierde la mitad y T-025 cambia de naturaleza.

h) **El art. 29.2.j LGT nos alcanza igual, y esto no es opcional.** Aclaración 11: la
   obligación «despliega efectos directos desde su entrada en vigor en octubre de 2021 respecto
   de **cualquier otro sistema informático**», y «cuando los albaranes, proformas, prefacturas
   o facturas sin validez fiscal se expidan, **sus registros deberán conservarse de forma
   inalterable**». Los borradores que mandamos al proveedor —y los que nunca lleguen a
   factura— se conservan encadenados y de solo adición. **La cadena de huellas y el principio 6
   no se van con la facturación: se quedan, con otro motivo.**

i) **El concepto que sale hacia el proveedor no es clínico nunca.** «Sesión de psicología»,
   «Informe». Ni diagnóstico, ni tipo de terapia, ni nada de lo que el técnico administrativo
   no puede ver. El proveedor es un tercero: lo que le mandamos sale de la instancia.

j) **El régimen de IVA lo marca el usuario, no se infiere.** Exento del art. 20.Uno.3.º LIVA
   para terapia y evaluación; 21 % para el informe pericial o para aseguradora. Aunque no
   expidamos, ese dato lo construimos nosotros, así que se pide explícitamente y se explica.
   Sigue en pie la línea del ADR-049: llevamos registro, no liquidamos impuestos.

k) **Dos preguntas quedan abiertas y bloquean la implementación del adaptador**, no el
   esquema: **(1)** la FAQ general de la Sede dice que el sistema de pre-facturación «debe
   estar vinculado indefectiblemente al sistema de emisión de facturas **formando una
   unidad**», y no hay aclaración de la AEAT que resuelva expresamente el caso «software
   externo que crea borradores en un SIF de terceros vía API». Las aclaraciones 5 y 10 apuntan
   a que no nos arrastra, pero es lectura, no texto: va a consulta vinculante o a informe de
   asesor fiscal. **(2)** de Holded, por escrito: en qué instante remite el RF, qué devuelve la
   API al aprobar, y si su DR contempla la creación de documentos por API desde software de
   terceros.

**Consecuencias**:

- Se gana: **desaparece la declaración responsable y con ella el art. 201.bis por SIF**, que
  era la mayor exposición personal del proyecto. Desaparecen el motor Verifactu, el
  encadenamiento de facturas, el QR, la remisión, la matriz de conformidad y el ligado de
  versiones CPF↔CF. La app se concentra en lo que nadie más le va a hacer al psicólogo: la
  agenda, la ficha y la historia clínica.
- Se pierde: **cada cliente necesita cuenta de pago en el proveedor** —la API de Holded no
  está en su plan gratuito—, lo que encarece la adopción y añade una dependencia externa que
  no controlamos. El usuario salta de aplicación para emitir. Y el resumen trimestral, que era
  petición literal de las entrevistas de UX, sale del producto.
- Riesgo que **no** desaparece: el art. 29.2.j LGT sobre nuestros propios registros, y la
  duda (k.1) hasta que la resuelva una persona. Esto no es exposición cero; es exposición de
  otra clase y de otro orden de magnitud.
- Queda bloqueado: expedir desde Psicogestión bajo cualquier forma; aprobar documentos en el
  proveedor; conservar la factura; un ajuste que permita elegir entre motor propio y
  proveedor; escribir en el espejo desde la aplicación; y arrancar el adaptador antes de tener
  contestadas las dos preguntas de (k).

---

## ADR-054 · Lenguaje claro en todo texto dirigido al paciente

**01-09-2026** · **Estado**: aceptada

**Contexto**: desde el 28-06-2025 está en vigor la **Ley 11/2023** (transposición de la
Directiva (UE) 2019/882, *European Accessibility Act*), que alcanza a servicios electrónicos
de relación con el consumidor. El ADR-041 ya cierra la accesibilidad **perceptible y
operable** (contraste, teclado, 44 px); no cierra la **comprensible** — el tercer principio
de WCAG, que el propio 2.2 AA exige en parte (SC 3.1.5) y que aquí importa más que en la
mayoría de software: la población de pacientes de psicología concentra desproporcionadamente
ansiedad, TDAH y discapacidad cognitiva, y un consentimiento o un aviso en jerga legal o
clínica es una barrera real para quien ya está en la consulta por eso.

**Decisión**: todo texto de interfaz **dirigido al paciente** —notificaciones, avisos,
justificantes internos, y cuando exista, recordatorios— se redacta en **lenguaje claro**:
frases cortas, verbo en activo, sin jerga legal ni clínica, un único mensaje por frase.

**Esto no toca la decisión 10.** El texto **legal** del consentimiento —el que se firma y se
versiona con su huella exacta— lo redacta quien corresponda y se conserva **verbatim**: el
lenguaje claro no lo reescribe. Se aplica al **entorno** de ese texto: el título de la
pantalla, el botón, la frase que explica qué se está firmando y por qué, y cualquier resumen
que se muestre antes o junto al texto legal. La misma frontera vale para las notificaciones
del ADR-038: el cuerpo es claro, y sigue **sin contenido clínico**, que es una regla distinta
y ya cerrada.

**Consecuencias**:

- Se gana: cumplimiento de la Ley 11/2023 en la parte que el ADR-041 no cubría, y un
  argumento de venta que ningún competidor español usa hoy.
- Se pierde: una revisión editorial más en cada ticket que redacte texto de paciente — barata,
  pero real, y no se salta.
- Queda bloqueado: ningún ticket que muestre texto al paciente cierra sin que ese texto pase
  por esta regla. Se recoge en **T-013** (la pestaña de consentimientos y su explicación) y
  **T-015** (cuerpo de las notificaciones); el ticket de recordatorios `wa.me`, que todavía no
  existe, la hereda cuando se escriba.

---

## Plantilla para decisiones nuevas

```markdown
## ADR-XXX · Título
**Fecha** · **Estado**: propuesta | aceptada | revertida
**Contexto**: qué problema obliga a decidir.
**Decisión**: qué se hace.
**Consecuencias**: qué se gana, qué se pierde, qué queda bloqueado.
```
