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
- **Navegación**: los siete módulos de abajo. Un módulo cuyo ticket aún no está integrado
  se pinta apagado, marcado «pronto» y sin enlace (`disponible: false` en
  `components/armazon/modulos.ts`). **Al integrar el ticket de un módulo se pone su
  `disponible` a `true`** — es la única edición que ese ticket hace en el armazón.
- **Usuario**: iniciales, nombre y rol reales de `perfiles`, y cerrar sesión.
- **Saludo y fecha**: se calculan en servidor (`components/armazon/armazon.tsx`) y bajan
  como texto ya hecho. Nunca `new Date()` en cliente: hidratación.

**Todavía no está**: el selector de centro (ver choque 1), la búsqueda global, la campana
de notificaciones, el menú de «más opciones» y la banda de aviso superior.

## Los siete módulos

| Módulo | Ruta | Estado |
|---|---|---|
| Inicio | `/inicio` | Pendiente |
| Pacientes | `/pacientes` | Lista y alta, sin ficha |
| Agenda | `/agenda` | Pendiente |
| Clínica | `/clinica` | Pendiente |
| Facturación | `/facturacion` | Pendiente |
| Usuarios | `/usuarios` | Pendiente |
| Ajustes | `/ajustes` | Pendiente |

Cada módulo abre con el mismo encabezado: versalitas en color principal, título en serif
grande, subtítulo en gris y una acción primaria a la derecha.

### Inicio · «Tu día, de un vistazo»

Cuatro métricas (citas hoy, pacientes activos, ingresos del mes, horas de consulta), la
agenda del día filtrable por centro y por profesional, la lista de profesionales con su
color, los pacientes recientes y dos indicadores de salud de la organización. Acción
primaria: **Nueva cita**.

### Pacientes

Tres piezas: **buscador y lista** (nombre, profesional, última actividad, píldora de
estado), **panel de previsualización** —marcado explícitamente «Solo datos
demográficos»— y **ficha completa** abajo con cuatro pestañas:

- **Resumen**: última sesión, próxima cita, recuento de actividad.
- **Ficha del paciente**: contacto y gestión asistencial (centro, profesional, modalidad).
- **Historia clínica**: documentos, informes y notas, cada uno con su estado de firma.
  Es la única puerta a la historia (choque 11) y se abre con PIN (ADR-026). Dentro,
  **cinco sub-pestañas**, que son el invariante 3 hecho navegación:

  | Sub-pestaña | De dónde sale |
  |---|---|
  | Historial clínico | `episodios_asistenciales`, `diagnosticos`, `valoraciones_riesgo` — el eje temporal: motivo, episodios abiertos y cerrados, CIE-10-ES + DSM-5-TR, riesgo |
  | Notas clínicas | `notas_clinicas`, `notas_clinicas_versiones` — con versiones y cadena de huellas visibles |
  | Evaluaciones | `evaluaciones`, `evaluacion_archivos` — pruebas, corrección y adjuntos |
  | Informes | `informes` + su firma en dos capas (decisión 9). Tienen versión, destinatario y, si son periciales, IVA al 21 % |
  | Documentos | `consentimientos_firmados`, `documentos_firmados`, adjuntos y notas históricas importadas (decisión 15, que **nunca** entran como notas firmadas) |

  Informes y Documentos van **separados y no «Otros»**: el art. 15 de la Ley 41/2002
  pone el consentimiento informado y el informe de alta en el contenido mínimo de la
  historia, y un cajón de sastre acaba recibiendo lo que nadie sabe dónde poner.
- **Facturación**: facturado, pendiente y forma de pago.

### Agenda

Calendario semanal con tira de días, filtros de centro y profesional, y lista de citas
(hora en monoespaciada, franja de color del profesional, tipo · profesional · modalidad,
centro y sala). A la derecha, las citas del día, el **resumen de la cita seleccionada**
(horario y duración, tipo, profesional, centro/sala, nota) y la leyenda de colores.

### Clínica

**Bandeja de documentación** ordenada por antigüedad, con estado por documento (borrador,
pendiente de firma, revisión requerida), y un panel de trazabilidad con tres porcentajes:
notas firmadas, evaluaciones archivadas, informes revisados. El prototipo lo remata con la
frase correcta: *las notas firmadas quedan bloqueadas y cualquier modificación posterior
genera una nueva versión auditable* — es el invariante 1.

### Facturación

Tres métricas (facturado, pendiente de cobro, previsión trimestral), **facturas recientes**
con estado —incluido **«En cola AEAT»**, que es exactamente el outbox del ADR-024— y una
tarjeta oscura de cumplimiento fiscal con los modelos del trimestre.

### Usuarios

Miembros de la organización con rol, centro, último acceso y estado; y controles de
acceso: MFA, permisos revisados, sesiones activas.

### Ajustes

Empresa y centros (con la retención clínica dentro), preferencias del espacio de trabajo
(modelos de informe, tamaño de texto, colores de agenda, exportaciones cifradas) y un
bloque de privacidad y auditoría con contadores de eventos, exportaciones y sesiones.

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

Once choques leídos uno a uno contra `architecture.md`. **Ya están resueltos: no se
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
- **Series de citas**: el prototipo pinta citas sueltas y no dice nada de la regla de
  repetición ni de la desviación de una cita concreta (invariante 4).
- **Mensajería y recordatorios** por `wa.me`, con su cola del día (ADR-023, ADR-024).
- **Bonos, gastos, tarifas por paciente** y el libro de facturas completo.
- **Auditoría y accesos a historia** como pantalla consultable, no como contador.
- **Exportaciones**, importador y purga por retención.
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
