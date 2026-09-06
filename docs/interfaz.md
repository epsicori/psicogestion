# Interfaz

Destilado del **prototipo visual**: `diseño/psicogestion.zip`, congelado en
`app/prototipo/page.tsx` y navegable en `/prototipo`. **Consulta este fichero para
decidir; abre el prototipo para mirar.** Si necesitas un detalle que no está aquí, míralo
en `/prototipo` y añade el resumen a este fichero — igual que `architecture.md` hace con
el documento maestro.

Reparto de autoridad, porque es la fuente de la mitad de los errores posibles:

| Fichero | Manda sobre |
|---|---|
| `architecture.md` | El modelo, los invariantes y **quién ve qué** |
| `interfaz.md` (este) | La forma: qué pantallas hay, qué muestra cada una, con qué vocabulario |
| `decisions.md` | Lo cerrado. ADR-025 fija la relación con el prototipo |

**Cuando chocan, gana la arquitectura.** Los choques ya detectados están listados abajo,
resueltos. No se resuelven otra vez en cada ticket.

## Qué es el prototipo y qué no

Un único Client Component de 49 KB con datos inventados, salido de v0. Es un **acuerdo
visual**, no una especificación funcional ni de permisos. Tres reglas (ADR-025):

1. **Se mira, no se copia.** Cada módulo se reescribe como componente de servidor contra
   datos reales. El prototipo no se edita para «arreglarlo»: es la referencia contra la
   que se compara.
2. **Nada se pinta sin un dato o una acción real detrás.** Si el prototipo enseña un
   control que todavía no tiene tabla ni Server Action, no se dibuja.
3. **El prototipo no sabe de roles.** Está dibujado desde un único punto de vista. Toda
   pantalla real se filtra por la matriz de `architecture.md` §Roles antes de renderizar.

## Armazón

Implementado en `components/armazon/`. Es lo único del prototipo que ya está en
producción, y define el marco de todas las pantallas con sesión (grupo `app/(app)/`).

| Zona | Medida | Contenido |
|---|---|---|
| Barra lateral | `w-72`, fija en escritorio, cajón en móvil | Marca · selector de centro · navegación · usuario |
| Cabecera | `h-20`, `bg-card/90` con desenfoque | Menú móvil · fecha larga · saludo por franja horaria |
| Contenido | `max-w-[1480px]`, `px-5 md:px-8` | Avisos y cuerpo del módulo |

- **Marca**: cuadrado con el icono `Activity`, «Psicogestión» en serif y «Tu práctica, en
  calma» en versalitas espaciadas. Se repite tal cual en `/login`.
- **Navegación**: los cuatro módulos de abajo (ADR-050). Un módulo cuyo ticket aún no está integrado
  se pinta apagado, marcado «pronto» y sin enlace (`disponible: false` en
  `components/armazon/modulos.ts`). **Al integrar el ticket de un módulo se pone su
  `disponible` a `true`** — es la única edición que ese ticket hace en el armazón.
- **Usuario**: iniciales, nombre y rol reales de `perfiles`, y cerrar sesión.
- **Saludo y fecha**: se calculan en servidor (`components/armazon/armazon.tsx`) y bajan
  como texto ya hecho. Nunca `new Date()` en cliente: hidratación.

**Todavía no está**: el selector de centro (ver choque 1), la búsqueda global, la campana
de notificaciones, el menú de «más opciones» y la banda de aviso superior.

## Los cuatro módulos

**Eran siete y son cuatro (ADR-050).** `Inicio` y `Clínica` no tenían contenido propio:
Inicio era la agenda del día descrita otra vez, y la bandeja de Clínica ya vivía en el
panel lateral de Inicio. Los dos se convierten en bloques dentro de Agenda. `Usuarios` baja
a una sección de Ajustes, donde su permiso ya coincidía.

| Módulo | Ruta | Estado |
|---|---|---|
| Agenda | `/agenda` | Pendiente — **es la pantalla de inicio**, `/` redirige aquí |
| Pacientes | `/pacientes` | Lista y alta, sin ficha |
| Facturación | `/facturacion` | Pendiente |
| Ajustes | `/ajustes` | Pendiente |

Cada módulo abre con el mismo encabezado: versalitas en color principal, título en serif
grande, subtítulo en gris y una acción primaria a la derecha.

**El módulo se llama Agenda, no Calendario.** El calendario es la pieza; la agenda es el
dominio, y es la palabra de `architecture.md` §Roles, de `series_cita` y de `modulos.ts`.

### Agenda · «Tu día, de un vistazo»

Es la pantalla de entrada y absorbe lo que eran Inicio y Clínica (ADR-050). Tres zonas:

**Calendario**, en tres vistas —semanal por defecto con tira de días y rejilla horaria,
mensual con recuento y puntos por estado, anual como mapa de densidad—. Filtros de centro y
profesional. Hora en monoespaciada, franja de color del profesional, `tipo · profesional ·
modalidad`, centro y sala. Cambiar de vista **conserva la fecha enfocada**. Acción
primaria: **Nueva cita**.

**Panel derecho**, tres bloques en este orden de prioridad:

1. **Citas próximas** — las siguientes del día y del siguiente.
2. **Pendientes** — citas sin preparación o sin cobro registrado.
3. **Documentación pendiente** — la antigua bandeja de Clínica: citas pasadas sin nota
   firmada, de más antigua a más reciente, **con el nivel de escalado visible**. Sale de
   `alertas_documentacion` y **nunca enseña contenido clínico** (choque 11). De aquí se
   salta a la ficha del paciente; la historia sigue teniendo una sola puerta.

**Cuadro inferior**, y aquí es donde el rol manda (choque 6): adherencia desglosada en tres
métricas —asistencia, ausencia sin aviso y **abandono**, que es la clínicamente
relevante—, ingresos del mes, y la **trazabilidad documental** en tres porcentajes: notas
firmadas, evaluaciones archivadas, informes revisados. **El técnico administrativo no ve
este cuadro**, y en el calendario tampoco ve el tipo de terapia (choque 4).

Al seleccionar una cita, panel con horario y duración, tipo, profesional, centro/sala,
**nota operativa** (logística, choque 3), estado y **botón «Notas»**.

### Pacientes

Tres piezas: **buscador y lista** (nombre, profesional, última actividad, píldora de
estado), **panel de previsualización** —marcado explícitamente «Solo datos
demográficos»— y **ficha completa** abajo con cinco pestañas:

- **Resumen**: última sesión, próxima cita, recuento de actividad.
- **Ficha del paciente**: contacto y gestión asistencial (centro, profesional, modalidad).
- **Historia clínica**: es la única puerta al contenido clínico (choque 11) y se abre con
  PIN (ADR-026). Dentro, **cuatro sub-pestañas**, que son el invariante 3 hecho
  navegación:

  | Sub-pestaña | De dónde sale |
  |---|---|
  | Historial clínico | `episodios_asistenciales`, `diagnosticos`, `valoraciones_riesgo` — el eje temporal: motivo, episodios abiertos y cerrados, CIE-10-ES + DSM-5-TR, riesgo |
  | Notas clínicas | `notas_clinicas`, `notas_clinicas_versiones` — con versiones y cadena de huellas visibles |
  | Evaluaciones | `evaluaciones`, `evaluacion_archivos` — pruebas, corrección y adjuntos |
  | Informes | `informes` + su firma en dos capas (decisión 9). Tienen versión, destinatario y, si son periciales, IVA al 21 % |

  Son las cuatro que tocan **contenido**, que es lo que el candado tapa.
- **Documentos y consentimientos**: consentimientos firmados con la versión exacta del
  texto, protección de datos, documentos sellados, adjuntos administrativos y las notas
  históricas importadas (decisión 15, que **nunca** entran como notas firmadas). **Fuera
  del candado** (ADR-048, choque 12): «¿tenemos su consentimiento?» es una pregunta de
  recepción y no puede costar un PIN.

  Informes y Documentos van **separados y no «Otros»**: el art. 15 de la Ley 41/2002 pone
  el consentimiento informado y el informe de alta en el contenido mínimo de la historia,
  y un cajón de sastre acaba recibiendo lo que nadie sabe dónde poner.
- **Facturación**: facturado, pendiente y forma de pago.

### Facturación

Tres métricas (facturado, pendiente de cobro, previsión trimestral), **facturas recientes**
con estado —incluido **«En cola AEAT»**, que es exactamente el outbox del ADR-024—, el
**libro de gastos** y una tarjeta oscura de cumplimiento fiscal con los modelos del
trimestre.

**Una sola pantalla, con selector solo para el administrador** (choque 13): no existe una
sección «por centro» y otra «por profesional». El administrador filtra; el profesional ve
lo suyo **sin selector visible**, porque una entrada que no puede usar le revela que existe
y a quién pertenece. **Nueva factura** es acción primaria de la cabecera, no una sección.

### Ajustes

Cuatro bloques, y **cada uno se muestra solo si el rol lo puede usar**. Ajustes no es un
módulo de administrador: sus secciones de empresa lo son.

- **Usuario** — preferencias del espacio de trabajo (modelos de informe, tamaño de texto,
  colores de agenda, exportaciones cifradas) y **Mis firmas**, con el lienzo de captura y
  la biblioteca de rúbricas. Para los tres roles.
- **Plantillas** — modelos de informe (asistencial, clínico, pericial…) y de facturación.
  Fase 2.
- **Centros y usuarios** — datos del centro con la **retención clínica** dentro (ADR-033),
  miembros con rol, centro, último acceso y estado, y controles de acceso (MFA, permisos
  revisados, sesiones activas). Era el módulo `Usuarios`. Solo administrador.
- **Privacidad y auditoría** — contadores de eventos, exportaciones y sesiones.

**Asignar un profesional a un centro** vive aquí, y es una **lista con columna Centro y
selector**, no dos contenedores con tarjetas (ADR-051): un profesional puede pertenecer a
varios centros con vigencia, el arrastre es un acelerador opcional de escritorio —WCAG 2.2
SC 2.5.7 exige alternativa sin arrastre, y a 360 px arrastrar entre contenedores no
existe—, y **cambiar el centro de un técnico administrativo le cambia los pacientes que
puede leer**, así que pasa por confirmación explícita y queda en auditoría. Al profesional
**no** le cambia ninguno: sus pacientes son los suyos, no los de su centro.

## De dónde sale cada pieza

**Todo a mano, sin librería de componentes** (ADR-040): ni shadcn/ui, ni Radix, ni Base UI.
Se gana control del marcado y un solo sistema de tokens. Lo que se compra a cambio **no es
opcional**, y es esto:

**Las piezas con comportamiento se escriben una vez, en `components/ui/`.** Diálogo, menú,
pestañas, desplegable, emergente y casilla son primitivas compartidas, **nunca** escritas
dentro de la pantalla que las necesitó primero. Repetir el patrón por pantalla lo multiplica
por siete y garantiza que seis salgan mal.

**Lista de comprobación de toda primitiva con comportamiento.** Es criterio de aceptación de
su ticket, no una buena intención:

- Trampa de foco mientras está abierta, y **devolución del foco** al elemento que la abrió.
- `tabindex` móvil donde el patrón lo pida (menús, pestañas).
- `role`, `aria-expanded` y `aria-controls` correctos.
- Cierre con **Escape** y con clic fuera.
- Anuncio al lector de pantalla de lo que aparece o cambia.
- **Objetivo táctil de 44 px** y funcionamiento a 360 px (ADR-044).

Sin librería debajo, **el verificador del ADR-041 es la única red**: un fallo de teclado no
lo caza nadie más.

La pintura —tarjeta, métrica, píldora, fila con avatar, progreso, franja, encabezado, estado
vacío— sigue en el vocabulario de abajo. Ahí nunca hubo discusión: son un `div` con texto.

El **calendario** ya era a mano por la decisión 20, con prueba de teclado y ARIA propia.

## Accesibilidad

**WCAG 2.2 AA, verificado en el pipeline** (ADR-041), no una declaración publicada — lo
formal quedó aparcado con el sector público (decisión 12). Se comprueba en cada build:
contraste de los tokens sobre cada superficie, foco visible siempre, teclado completo,
etiquetas de formulario reales y `prefers-reduced-motion`.

**La personalización de color valida el contraste antes de guardar**: si la combinación
incumple AA, se avisa y se propone el tono más cercano que sí cumple. *Un administrador con
buen gusto y mala vista no debe poder dejar la aplicación ilegible para su equipo.*

## Anchos: todo funciona desde 360 px

ADR-044. **No hay mínimo por pantalla ni vista degradada.** Si una pantalla avisa de que «se
ve mejor en ordenador», está sin terminar.

- **El editor de notas necesita diseño táctil propio**: herramientas al alcance del pulgar,
  sin depender de atajos, y el teclado virtual no puede tapar el cursor. Es otro producto, no
  el de escritorio estrechado.
- **El calendario semanal a 360 px no es una semana estrechada.** Siete columnas no se leen
  en un móvil: se reorganiza —día con desplazamiento lateral, o lista por franjas—
  conservando información y acciones. La forma concreta se decide en su ticket, mirándolo en
  un teléfono real.
- **44 px de objetivo táctil** en todo lo que se pulse, que es además lo que pide el criterio
  de tamaño de destino de WCAG 2.2 (ADR-041).
- Las primitivas de `components/ui/` nacen **responsivas y táctiles la primera vez**:
  escribirlas para escritorio y adaptarlas después cuesta el doble.
- El candado del ADR-026 rige igual en móvil, y ahí importa más — un teléfono desbloqueado
  sobre la mesa es el escenario que el PIN existe para cubrir.

## Vocabulario de componentes

Lo que se repite. Antes de inventar un componente, comprueba que no sea uno de estos.

| Pieza | Forma |
|---|---|
| Tarjeta | `rounded-xl border border-border bg-card shadow-sm` |
| Métrica | Etiqueta arriba, icono en cuadrado de color, cifra grande en **serif**, matiz debajo |
| Fila con avatar | Círculo de iniciales en serif · nombre y subtítulo truncados · píldora o acción a la derecha |
| Píldora de estado | `success` (apagada), `info` (verde suave), `warning` (ámbar). Tres, no más |
| Barra de progreso | Etiqueta, valor a la derecha, barra fina |
| Franja de color | Barra vertical de 1×10 que identifica al profesional en la agenda |
| Encabezado de módulo | Versalitas + título serif + subtítulo + acción primaria |
| Panel lateral | Resumen contextual sobre `bg-secondary`, con pico apuntando al elemento |
| Pestañas | Subrayado en color principal, solo dentro de una ficha |
| Estado vacío | Icono en círculo, frase en serif, explicación corta |

Reglas tipográficas y de color:

- **Serif solo en titulares y cifras.** Nunca en cuerpo de texto ni en formularios.
- **Monoespaciada solo para horas** en listas de agenda.
- **El ámbar reclama atención, el rojo es error.** No se usa ámbar para errores de
  formulario ni rojo para «pendiente».
- **El malva es selección**, no un estado. Lo seleccionado va en `bg-secondary`.
- **Tema claro únicamente, y así se queda en v1** (ADR-042). No se pinta conmutador de
  tema. La puerta se deja abierta con una regla sin excepciones: **ningún componente escribe
  un color literal**, siempre token. Con eso, añadir el oscuro algún día es añadir un bloque
  de tokens, no auditar la aplicación.
- El prototipo trae `userScalable: false` en su viewport. **Se descartó**: impedir el
  zoom es una barrera de accesibilidad, y Ajustes ofrece tamaño de texto precisamente
  porque el usuario manda sobre eso.

## Donde el prototipo choca con la arquitectura

Trece choques leídos uno a uno contra `architecture.md`. **Ya están resueltos: no se
vuelven a discutir en el ticket, se implementan así.**

### 1 · El selector de la barra lateral es de centro, no de organización

El prototipo lo titula «Organización» y despliega dos centros más «Gestionar
organización». Pero la topología es **instancia dedicada**: `organizacion` tiene
exactamente una fila y no hay nada entre lo que cambiar. **Se implementa como selector de
centro**, y el nombre de la organización pasa a ser rótulo fijo. Las dos decisiones
pendientes sobre `centros` (de qué cuelga la retención, y si el centro es dimensión de
RLS) están en `state.md` §Hallazgos anotados y se cierran en T-001, antes de dibujar esto.

### 2 · La bandeja de Clínica no puede ser global

El prototipo la enseña desde un usuario marcado «Administradora» y lista notas e informes
de pacientes de **otros** profesionales. La matriz de roles dice lo contrario: notas
clínicas, para el administrador, «solo las suyas (+ emergencia)». **El secreto profesional
es del profesional, no del cargo.** La bandeja se alimenta por RLS y muestra lo que el
usuario puede ver, sin excepción. El contador «3» de la barra lateral cuenta lo mismo que
la bandeja, no el total de la organización.

### 3 · La «nota operativa» de la cita es contenido clínico

En el resumen de sesión el prototipo escribe *«Revisar evolución del plan de intervención
y ejercicios de regulación emocional»*. Eso es historia clínica dentro de una pantalla de
agenda, que el técnico administrativo puede abrir. Por el invariante 3, **lo que un rol no
puede ver no está en la tabla que sí puede leer**: el campo de la cita es logística (sala,
material, aviso de acceso), y lo clínico se lee del episodio, con su propia política y su
registro en `accesos_historia`.

### 4 · El tipo de terapia no lo ve el técnico administrativo

La lista de citas imprime siempre `tipo · profesional · modalidad`. La matriz reserva al
técnico «agenda, sin tipo de terapia». La fila de agenda **omite el tipo** cuando el rol
es `tecnico_administrativo`; no lo tacha ni lo enseña en gris.

### 5 · El panel de previsualización enseña más de lo que parece

Está bien planteado —dice «Solo datos demográficos» y separa lo clínico— pero teléfono,
email y ciudad son datos de contacto, y el DNI y el domicilio viven en
`pacientes_identificacion`, donde el técnico administrativo **no entra**. El panel se
construye campo a campo desde lo que el rol puede leer, y desaparece entero si no queda
ninguno.

### 6 · Las métricas de Inicio dependen del rol

«Ingresos del mes» no se enseña a un profesional como cifra de la organización: la matriz
le da «lo suyo». Al técnico administrativo, cobros sin dato clínico. **Inicio no es una
pantalla, son tres**, con el mismo armazón y distinto contenido.

### 7 · Las píldoras de paciente son estado documental, no riesgo

«Al día», «Nuevo», «Revisar» describen la documentación, no al paciente. Es importante
porque el **nivel de riesgo** es otro campo, con otra política —el técnico solo ve
indicador binario— y no se representa con este vocabulario. No se mezclan en la misma
píldora.

### 8 · Abrir un paciente va por UUID

El prototipo navega por nombre porque no tiene base de datos. La regla es dura: **jamás un
nombre de paciente en la URL**. La ficha es `/pacientes/<uuid>`. Lo mismo vale para la
búsqueda global: el término no viaja en la barra de direcciones, y toda búsqueda que
devuelva pacientes es un acceso a datos personales — se resuelve en servidor y se filtra
por RLS.

### 9 · El Modelo 303 solo existe si hay actividad no exenta

La tarjeta fiscal enseña Modelo 130 y Modelo 303 juntos y fijos. Pero la terapia y la
evaluación diagnóstica están **exentas** de IVA (art. 20.Uno.3.º LIVA) y solo el informe
pericial o para aseguradora lleva 21 %. Una consulta sin actividad pericial no presenta
303. La tarjeta muestra los modelos que correspondan a lo facturado, no una lista fija.

### 10 · La retención no son cinco años

Ajustes dibuja «Retención clínica · 5 años». La arquitectura fija **25 años configurables,
con mínimos legales bloqueados por debajo**, el reloj arrancando al cerrar el episodio, y
conservación indefinida para consentimientos e informes de alta. Además los mínimos varían
por comunidad autónoma, lo que puede colgar la política del centro y no de la organización
(`state.md` §Hallazgos anotados). El prototipo se ignora aquí: manda `architecture.md` §Retención.

### 11 · La historia clínica tiene dos puertas, y solo puede tener una

El prototipo pone la historia como pestaña de la ficha del paciente **y** dibuja un módulo
`Clínica` con bandeja de documentación. Son los mismos datos por dos sitios, y dos puertas
significan dos lugares donde poner el candado del ADR-026 — que es exactamente como se
olvida uno.

**La historia vive dentro del paciente**: no hay historia sin paciente, ni clínica ni
jurídicamente, y la ruta es `/pacientes/<uuid>` (choque 8). El módulo `Clínica` sigue
siendo la **cola de trabajo entre pacientes**, y de ahí se salta a la ficha; nunca enseña
contenido clínico en la propia bandeja.

Consecuencia directa sobre el modelo: la bandeja y las métricas de Inicio se alimentan de
**`alertas_documentacion`** —estado de firma, antigüedad, paciente— y no de
`notas_clinicas` ni de `informes`. No es una optimización: el candado tapa **contenido, no
recuentos**, y si tapase los contadores la pantalla de inicio quedaría inservible y el
usuario dejaría el candado abierto todo el día.

**Pantalla de bloqueo**: cuando no hay desbloqueo vigente, la sub-pestaña se sustituye por
la petición de PIN, con el vocabulario de estado vacío (icono en círculo, frase en serif,
explicación corta) y un botón de **bloquear** siempre visible mientras está abierta. Nunca
se renderiza el contenido y se tapa con una capa encima: si no hay desbloqueo, el
componente de servidor no llega a leer la fila.

**Incoherencia interna, de propina**: el prototipo llama a Ana Silva «Administradora» en
la barra lateral y «Psicóloga sanitaria» en la lista de profesionales. Los roles reales son
los tres del enum `rol_usuario`, y el rótulo sale de `perfiles.rol`.

### 12 · Los consentimientos no están dentro de la historia clínica

Este destilado los ponía como quinta sub-pestaña de Historia clínica, detrás del PIN. Las
políticas de T-002 los dejan **fuera** de `historia_desbloqueada()`, y manda la
arquitectura: **«Documentos y consentimientos» es una pestaña de la ficha**, al nivel de
Resumen y Facturación, y no pide PIN (ADR-048).

El motivo es operativo y por eso importa: «¿tenemos su consentimiento firmado?» es una
pregunta de recepción que se hace veinte veces al día sobre un documento administrativo con
su versión de texto y su fecha. Un candado que hay que abrir para eso deja de ser un
candado y pasa a ser un peaje, y un peaje se rodea dejándolo abierto todo el día.

Historia clínica se queda con **cuatro** sub-pestañas —historial, notas, evaluaciones,
informes—, que son las que tocan contenido. El enum `pestana_historia` de T-001 no se
toca: su valor `documentos` queda para los adjuntos clínicos que sí viven dentro.


### 13 · Facturación no se divide en «por centro» y «por profesional»

El esquema de interfaz del 26-08 proponía dos secciones con esos nombres. La matriz dice
otra cosa: el administrador ve el total del centro **y** puede filtrar por profesional; el
profesional **solo ve lo suyo, sin selector visible**.

Dos entradas fijas rompen la regla del armazón —«las entradas para las que el rol no tiene
permiso no se muestran, no se muestran deshabilitadas»—: una sección llamada «Facturación
por centro» le dice a un profesional que esa vista existe y a quién pertenece. Es **una
pantalla con un selector que solo aparece para el administrador**.

«Nueva factura» es la acción primaria de la cabecera, no una sección; y el **libro de
gastos** sí es sección propia, porque `gastos` tiene deducibilidad y justificante y no es
una vista de las facturas.


## Lo que el prototipo no cubre

No está dibujado, y hace falta. Ningún ticket puede darse por especificado con «mira el
prototipo» si toca algo de esta lista:

- **Candado de la historia clínica** (ADR-026): alta del PIN en el primer acceso, pantalla
  de bloqueo, botón de bloquear, aviso de ventana a punto de caducar y pantalla de PIN
  bloqueado por intentos. Nada de esto está dibujado.
- **Acceso de emergencia**: justificación escrita, caducidad, aviso al titular y traza
  destacada. Es la pieza que hace legítima toda la matriz de roles. Exige **además** PIN
  vigente: el PIN no sustituye a la justificación.
- **Consentimientos y firma** (paciente y profesional), y el circuito de documentos
  firmados.
- **Verifactu de verdad**: huella encadenada, anulación y reemisión, registro de eventos.
  El prototipo solo enseña la píldora «En cola AEAT».
- **El alta de cita**: el prototipo enseña la agenda llena, pero no el formulario que la
  llena. Ni las sugerencias de hora (ADR-049c), ni la elección de periodicidad, ni la
  previsualización de la serie, ni qué pasa cuando el hueco se ocupa mientras rellenas.
  Se dibuja en **T-028**, con dos entradas —Agenda y la pestaña Resumen de la ficha— y una
  sola pantalla.
- **Series de citas**: el prototipo pinta citas sueltas y no dice nada de la regla de
  repetición ni de la desviación de una cita concreta (invariante 4).
- **Mensajería y recordatorios** por `wa.me`, con su cola del día (ADR-023, ADR-024).
- **Bonos, gastos, tarifas por paciente** y el libro de facturas completo.
- **Auditoría y accesos a historia** como pantalla consultable, no como contador.
- **Exportaciones**, importador y purga por retención.
- **El recorrido de nota en presencial**: aviso no modal de «sesión en curso», ancla en
  cabecera, indicador latente del estado en curso y botón «Notas» desde la ficha de la
  cita (ADR-045, ADR-047). El prototipo dibuja la agenda sin estado y sin ese recorrido.
- **Campana de notificaciones y escalado de la nota pendiente** en tres tiempos —0 h, 24 h
  y 72 h al administrador— sobre `alertas_documentacion` y la tabla `notificaciones`, que
  todavía no existe.
- **Estados de error y de carga**: el prototipo solo dibuja el caso feliz y con datos. Cada
  pantalla real necesita además su vacío, su error y su cargando.

## Reglas al implementar una pantalla

1. Lee la fila de la matriz de `architecture.md` §Roles **antes** de mirar el prototipo.
2. Componente de servidor por defecto. Cliente solo donde haya estado o eventos.
3. Ningún control sin dato ni acción real detrás. Si falta, no se dibuja.
4. Reutiliza el vocabulario de arriba antes de inventar una pieza nueva. Si la pieza tiene
   comportamiento, va en `components/ui/` con su lista de comprobación cumplida — **nunca
   dentro de la pantalla** (§De dónde sale cada pieza).
5. **Un `<Suspense>` con esqueleto por bloque de datos, no uno por página** (ADR-043), y
   error boundary también por bloque — que falle la facturación no puede tumbar la historia.
   El estado vacío es parte del componente, no un caso aparte. **Nada de un paciente entra
   en `use cache`**, ni siquiera `use cache: private`.
6. **Pruébala a 360 px antes de darla por terminada** (ADR-044). No hay vista degradada ni
   aviso de «mejor en ordenador»: si aparece, la pantalla está sin terminar.
7. Al terminar, pon `disponible: true` en `components/armazon/modulos.ts`.
8. Si encuentras un choque nuevo con la arquitectura, **añádelo a la lista de arriba** en
   el mismo ticket. Anotarlo en `state.md` y seguir vale para los hallazgos de otras fases;
   un choque de interfaz se resuelve donde se resuelven los demás.
