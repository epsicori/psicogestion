---
id: T-048
titulo: Agenda — documentación pendiente agrupada por paciente, con bandeja completa paginada
modelo: sonnet
riesgo: medio           # sin migración (decisión P2 = B): roles, foco y a11y; ninguna lectura nueva en la base
fase: 1
prioridad: media
depende_de: [T-014, T-015]
estado: pendiente       # decisiones del propietario cerradas el 06-10-2026; listo para diseño
delegable: no           # ver §Delegable
territorio:             # provisional; lo cierra tickets/T-048/diseno.md §6
  - lib/citas/agenda.ts                          # la lectura acotada; `leerAlertasNotaPendiente` se sustituye (solo la usa documentacion.tsx)
  - lib/citas/agenda.test.ts
  - app/(app)/agenda/documentacion.tsx           # el bloque del panel
  - app/(app)/agenda/documentacion.test.tsx
  - app/(app)/agenda/resolver-alerta.tsx         # el foco tras resolver
  - app/(app)/agenda/resolver-alerta.test.tsx
  - app/(app)/agenda/acciones-alertas.ts         # solo si la revalidación no alcanza a la página nueva (ver Notas)
  - app/(app)/agenda/acciones-alertas.test.ts
  - app/(app)/agenda/marco.tsx                   # solo para que el encabezado del bloque pueda recibir el foco; sin cambiar su forma
  - app/(app)/agenda/pendientes*.ts              # piezas nuevas compartidas por panel y página (agrupar, ordenar, textos)
  - app/(app)/agenda/pendientes*.tsx
  - app/(app)/agenda/pendientes*.test.ts
  - app/(app)/agenda/pendientes*.test.tsx
  - app/(app)/agenda/documentacion/**            # la página nueva /agenda/documentacion
  - lib/i18n/es.ts                               # solo bajo `agenda.documentacion.*`
  - accesibilidad/documentacion-pendiente.spec.ts
  - docs/interfaz.md                             # solo §«Agenda · Tu día, de un vistazo», punto 3
  - docs/bitacora/T-048.md
  - docs/state.md                                # cierra el hallazgo «T-014: bandeja sin límite»
---

# Contexto

El bloque **Documentación pendiente** del panel derecho de la Agenda (T-014, con el nivel de
T-015) pinta **una fila por alerta** (`app/(app)/agenda/documentacion.tsx:70-102`): un paciente
con seis pendientes repite su nombre seis veces, y lo urgente se pierde entre lo que no lo es.
Además la lectura **no tiene límite** (`lib/citas/agenda.ts:218-268`, hallazgo «T-014: bandeja
sin límite» de `docs/state.md`), y en realidad sí lo tiene, pero escondido:
`supabase/config.toml:18` fija `max_rows = 1000`, así que a partir de la alerta mil la bandeja
**se recorta en silencio**.

Este ticket agrupa la bandeja **por paciente**, deja en el panel **los 6 pacientes más
urgentes** y abre una **página con la bandeja completa**, paginada y filtrable, en
`/agenda/documentacion`. La forma está cerrada con el propietario (06-10-2026, §Decisiones del
propietario); aquí se traduce a criterios verificables.

Módulo: **Agenda**, `docs/interfaz.md` §«Agenda · Tu día, de un vistazo», punto 3. Choques:
**2** (la bandeja no es global: el administrador solo ve lo suyo), **4** (el técnico no ve el
tipo de terapia; aquí no sale para nadie) y **11** (la bandeja nunca enseña contenido clínico:
estado de firma, antigüedad y paciente, nada más). ADR **047** (solo la cita en curso late: aquí
no se anima nada), **041** (WCAG 2.2 AA), **043** (nada de `use cache`), **044** (360 px),
**050** (Agenda absorbe Clínica).

**Quién ve qué no cambia.** El criterio de cada rol sigue siendo `criterioDocumentacion`
(`app/(app)/agenda/bloques.ts:108-115`), y este ticket **no lo modifica**:

| Rol | Qué alertas | De quién |
|---|---|---|
| Administrador | todos los tipos | **solo las suyas** (`soloPropias`, choque 2), aunque la RLS le deje ver la organización |
| Profesional sanitario | todos los tipos | lo que su RLS deja ver (suyas o de pacientes asignados) |
| Técnico administrativo | solo `consentimiento_pendiente` (lista blanca, 01-10-2026) | las de sus centros, por RLS |
| Rol sin leer | solo `consentimiento_pendiente` | solo las suyas |

**Vocabulario**: «pendientes», nunca «notificaciones» ni «avisos» (eso es la campana de T-015).

## Decisiones del propietario (06-10-2026)

Cerradas; no se reabren en el diseño.

- **D1 · Sin animación** (respeta el ADR-047; no hace falta ADR nuevo). El nivel 3 se distingue
  por **forma, icono y texto** («Muy atrasada»). La urgencia **nunca depende solo del color**.
- **D2 · Lectura sin migración** (opción B): una lectura ligera con **tope de 1000** y
  **recuento exacto**, agrupada en el servidor; si hay más de 1000 abiertas, **se dice en
  pantalla**. El criterio 10 se cumple como «lectura acotada y declarada».
- **D3 · Sin filtro de profesional.** Los filtros son **tipo** y **nivel**. Que el
  administrador vea los pendientes de otros queda fuera (ticket propio si algún día se quiere).
- **D4 · «Escalados»** son los pendientes de **nivel 2 y 3**.
- **D5 · Huecos cerrados en el contrato y aceptados**: el foco tras resolver va al enlace del
  nombre; desempate por `paciente_id`; `?pagina` fuera de rango redirige a la última; un filtro
  con una sola opción posible no se pinta; `?paciente=<uuid>` enseña solo ese paciente con
  todos sus pendientes.

## Definiciones (las usan las tareas y los criterios)

- **Nivel** de una alerta: el que da la base (`alertas_documentacion_nivel.nivel`,
  `20261006120000_avisos_y_escalado.sql:340-345`). **Solo existe para `nota_sin_firmar`
  abierta**; los demás tipos (`consentimiento_pendiente`, `informe_pendiente`,
  `borrador_abandonado`, `evaluacion_sin_corregir`) llegan con **nivel nulo**. En TypeScript
  **no se recalcula** ningún nivel.
- **Cómo ordenan los tipos sin nivel**: el nulo cuenta **por debajo de 1** (por debajo de
  cualquier nota con nivel), y entre ellos **por antigüedad** (`fecha_referencia` más antigua
  primero). No llevan píldora de nivel ni cuentan como escalados.
- **Escalado** (D4): pendiente de nivel 2 o 3, los dos que llevan píldora («Atrasada», «Muy
  atrasada»).
- **Orden de pacientes**: (1) nivel máximo del paciente, de mayor a menor (nulo = por debajo de
  1); (2) su pendiente más antiguo por `fecha_referencia`, de más antiguo a más reciente, con
  los nulos al final; (3) `paciente_id` ascendente, para que la paginación sea estable.
- **Orden dentro de un paciente**: nivel desc (nulo al final), `fecha_referencia` asc (nulos al
  final), `creada_en` asc, `id` asc.
- **Lo que cuenta la insignia**: los pendientes del paciente **que pasan los filtros vigentes**
  y el recorte del rol. Nunca más.

## Tareas

- [ ] **Agrupar y ordenar, puro.** Un módulo sin E/S (`app/(app)/agenda/pendientes.ts` o el
      nombre que fije el diseño) que recibe alertas ya leídas y devuelve pacientes con
      recuento, escalados, nivel máximo, pendiente más antiguo y sus pendientes ordenados,
      según §Definiciones. También el texto accesible del paciente (criterio 6) y el destino
      de «Ver todos». Sin `Date` en lo que cruza al cliente (ADR-034).
- [ ] **Fila de paciente** compartida por panel y página: nombre y apellidos como **enlace a
      `/pacientes/<uuid>`** (el nombre ilegible usa la etiqueta genérica actual,
      `t('agenda.cita.paciente')`, `documentacion.tsx:87`) e insignia «N pendientes».
      - **Con 1 pendiente**: en línea, sin desplegable: tipo, «pendiente desde…»
        (`diasPendiente`, sin tocar `bloques.ts`), píldora de nivel si la hay y «Marcar como
        resuelta» si `puedeResolverAlerta` lo permite.
      - **Con 2 o más**: un **botón** con `aria-expanded` y `aria-controls` despliega la lista
        de sus pendientes, cada uno con la misma información que la fila de uno. Patrón
        *disclosure*, no acordeón: **varios abiertos a la vez**, y el estado abierto de cada
        paciente sobrevive a la revalidación que sigue a resolver.
      - **Más de 10** pendientes en el desplegable: se ven los 10 primeros y un enlace
        «Ver todos (N)» a `/agenda/documentacion?paciente=<uuid>`.
- [ ] **Insignia y urgencia** (D1). La insignia de un paciente con algún pendiente de nivel 3
      se distingue **por forma, icono y texto** («Muy atrasada» en la fila o en su resumen), no
      solo por color, y sobrevive a la escala de grises; las demás, discretas. **Ningún
      elemento del bloque ni de la página lleva animación** (ADR-047: solo la cita en curso
      late).
- [ ] **Panel** (`documentacion.tsx`): como mucho **6 pacientes**, en el orden de
      §Definiciones. Si hay más pacientes, al pie un enlace **«Ver los N pendientes»** a
      `/agenda/documentacion`, con N = total de pendientes visibles para ese usuario. Sin
      pendientes, estado vacío con el título **«Al día»** (icono `documento`). Error de lectura:
      `AvisoDeError` dentro del marco, como hoy. Se mantiene: sin filtro de centro (lo que falta
      por firmar se firma aunque se mire otro centro, `documentacion.tsx:35`).
- [ ] **Página `/agenda/documentacion`**: encabezado de página, la misma fila de paciente,
      **20 pacientes por página**.
      - Estado en la URL: `?pagina`, `?tipo`, `?nivel`, `?paciente`. Lo que no valida (Zod) se
        ignora como si no estuviera. Cambiar un filtro vuelve a la página 1.
      - **Filtros** (D3): **tipo** (entre los que el rol puede ver) y **nivel** (1, 2, 3).
        **No hay filtro de profesional.** Un filtro con una sola opción posible **no se pinta**
        (nada de controles sin dato: al técnico, que solo ve un tipo y sin nivel, no le sale
        ninguno).
      - Un `?tipo` fuera de la lista blanca del rol **no abre nada**: el recorte del rol se
        aplica siempre, y el filtro solo puede estrecharlo.
      - `?paciente=<uuid>`: la página enseña solo ese paciente, con su desplegable abierto y
        **todos** sus pendientes, y un enlace para quitar el filtro.
      - **Paginación accesible**: `<nav>` con nombre, enlaces reales (funcionan sin JS),
        `aria-current="page"` en la actual, «Anterior»/«Siguiente» y «Página X de Y». `?pagina`
        no numérica, cero o negativa → 1; mayor que la última → **redirección** a la última
        válida conservando los filtros.
      - Vacío: el mismo «Al día» (sin filtros) o «Ningún pendiente con estos filtros» (con
        ellos). Error de lectura: `AvisoDeError`. Un `<Suspense>` con esqueleto (ADR-043); nada
        de `use cache`.
- [ ] **Lectura acotada y declarada** en `lib/citas/agenda.ts` (D2, sin migración):
      - Una lectura ligera de las alertas abiertas visibles, solo con
        `id, paciente_id, tipo, fecha_referencia, creada_en, nivel`, con el recorte del rol y
        los filtros, en el orden de §Definiciones, con **tope explícito** (`range(0, 999)`) y
        `count: 'exact'`.
      - **El recorte nunca es silencioso**: si el recuento supera lo leído, el panel y la página
        lo dicen en texto («Se muestran los 1000 más urgentes de N»).
      - Los **nombres** se leen solo de los pacientes que se pintan (≤ 6 en el panel, ≤ 20 en la
        página), por `pacientes` y su RLS, como hoy.
- [ ] **Resolver desde el desplegable o la fila** (`resolver-alerta.tsx`): al acertar, el
      recuento de la insignia baja con la revalidación, y el foco va:
      - si al paciente **le quedan pendientes**, a su enlace de nombre (existe tanto en la fila
        de uno como en la agrupada), y la región de estado anuncia «Marcada como resuelta» y el
        nuevo resumen del paciente;
      - si era **el último del paciente**, la fila desaparece y el foco va al enlace de nombre
        del **paciente siguiente** (o del anterior si era el último de la lista);
      - si **no queda ninguno**, al **encabezado del bloque** (panel) o de la página.
      La región `role="status"` sigue montada siempre (T-015 R4) y el botón sigue con
      `aria-disabled` mientras envía, no `disabled`.
- [ ] **Textos** en `lib/i18n/es.ts` bajo `agenda.documentacion.*`: insignia en singular y
      plural, resumen accesible, «Ver los N pendientes», «Ver todos (N)», paginación, filtros,
      vacío con filtros, aviso de recorte, título de la página. «Al día» sustituye al título
      vacío actual.
- [ ] **`docs/interfaz.md`** §Agenda, punto 3: la agrupación, el tope de 6 y la página, en dos
      o tres líneas.

## Criterios de aceptación (verificables)

**Lógica pura** (`npm test`, prueba junto al módulo de agrupar):

- [ ] **1 · Una vez por paciente.** Con 7 alertas de 3 pacientes, salen 3 grupos cuyos
      recuentos suman 7; ningún `pacienteId` se repite.
- [ ] **4 · Orden.** Un paciente con un nivel 3 reciente va antes que uno con solo nivel 1
      antiguo; un paciente con solo pendientes sin nivel (p. ej. un consentimiento de hace 30
      días) va **después** de uno con una nota de nivel 1 de hoy; a igual nivel máximo, el de
      pendiente más antiguo va antes; entre pacientes sin nivel, manda la antigüedad; con
      fechas nulas, al final; a igualdad total, por `paciente_id`. Dentro del grupo, el orden de
      §Definiciones. Cada caso con su gemelo que lo invierte.
- [ ] **6 · Texto accesible.** «Ana López, 6 pendientes, 2 escalados» (escalados = nivel 2 y
      3); con un escalado, «1 escalado»; sin escalados, «Ana López, 3 pendientes» (sin
      «0 escalados»); un pendiente de nivel 1 o sin nivel no suma escalados; con nombre
      ilegible, la etiqueta genérica en su lugar.
- [ ] **Más de 10.** Un grupo de 40 devuelve 10 visibles, recuento 40 y el destino
      `/agenda/documentacion?paciente=<uuid>`.

**Componentes** (`npm test`, Testing Library):

- [ ] **2** — un paciente con 1 pendiente no pinta ningún botón con `aria-expanded`, y sí su
      tipo, «pendiente desde…», la píldora y «Marcar como resuelta» cuando corresponde.
- [ ] **3** — con 2 o más, el botón tiene `aria-expanded="false"` y `aria-controls` apuntando a
      la lista; **Intro** y **Espacio** (`userEvent.keyboard`) lo abren y lo cierran; abrir un
      segundo paciente **no cierra** el primero.
- [ ] **5 · Urgencia sin color y sin movimiento** (D1) — la insignia de un paciente con nivel 3
      se distingue de la de nivel 2 **en el DOM** (texto «Muy atrasada» e icono o atributo de
      forma, no solo una clase de color); y
      `rg -n "latido|animate-" "app/(app)/agenda/pendientes*" "app/(app)/agenda/documentacion*"`
      no devuelve nada.
- [ ] **7** — el panel con 9 pacientes pinta 6 y el enlace «Ver los N pendientes» con N = total
      de alertas, hacia `/agenda/documentacion`; con 6 o menos, sin enlace; con 0, «Al día».
- [ ] **9** — tras resolver: (a) si al paciente le quedan pendientes, el foco está en su enlace
      de nombre; (b) si era el último, en el enlace del paciente siguiente; (c) si no queda
      ninguno, en el encabezado del bloque. Cada caso **falla** si se vuelve al foco actual
      (el grupo entero, `resolver-alerta.tsx:49-51`). La región de estado sigue montada en las
      tres ramas.
- [ ] **11 · Quién ve qué.** Con el rol técnico, toda lectura (filas y recuento) lleva
      `tipo in ('consentimiento_pendiente')`, también con `?tipo=nota_sin_firmar` en la URL
      (que no pide nada o pide la intersección vacía, nunca el tipo pedido); con el
      administrador, toda lectura lleva `profesional_id = <uid de la sesión>`; con rol sin leer,
      las dos cosas. Un `?profesional=` en la URL se ignora para todos los roles. Las columnas
      pedidas a `alertas_documentacion_nivel` son **exactamente** las de la tarea de lectura, y
      a `pacientes`, `id, nombre, apellidos`. Las pruebas de `documentacion.test.tsx:26-60`
      siguen en verde y se extienden a la página.
- [ ] **Errores** — un fallo de lectura en el panel o en la página pinta `AvisoDeError` dentro
      del marco o de la página, no una lista vacía ni «Al día».

**Página** (`npm test`):

- [ ] **8** — con 45 pacientes: la página 1 trae 20, la 3 trae 5, «Página 3 de 3», el enlace de
      la actual lleva `aria-current="page"`, y los enlaces conservan `tipo`/`nivel`/`paciente`.
      `?pagina=99` redirige a `?pagina=3` con los mismos filtros; `?pagina=abc`, `0` y `-2` dan
      la 1. Cambiar un filtro produce un enlace o envío **sin** `pagina`.
- [ ] **8b** — el técnico no ve ningún control de filtro; el profesional y el administrador ven
      tipo y nivel; **nadie** ve un filtro de profesional.

**Lectura** (`npm test`, `lib/citas/agenda.test.ts` con la sesión falsa que ya usa):

- [ ] **10 · Acotada y declarada** (D2) — la consulta lleva el tope explícito y
      `count: 'exact'`; la de `pacientes` recibe **solo** los ids que se pintan (6 en el panel,
      20 en la página), no todos los leídos; con un recuento mayor que lo leído, el resultado
      lo marca y la pantalla pinta el aviso de recorte. **Falla** si se quita el tope, si se
      quita el aviso o si se piden nombres de todos los pacientes leídos.

**Accesibilidad y build**:

- [ ] **12** — `npx playwright test accesibilidad/documentacion-pendiente.spec.ts` en verde, con
      los datos que el propio spec prepara (`ejecutarSql`, como `avisos.spec.ts`): a 360 px,
      `/agenda` y `/agenda/documentacion` sin desplazamiento horizontal; el enlace de nombre,
      el botón de desplegar, «Marcar como resuelta», «Ver todos», «Ver los N pendientes» y los
      enlaces de paginación miden ≥ 44 × 44 px; recorrido solo con teclado: Tab al botón,
      Espacio despliega, Tab al resolver, Intro resuelve y el foco cae donde dice el criterio 9.
- [ ] **Nada se rompe alrededor** — `npm test` completo, `npm run lint && npm run build`
      limpios; `rg -n "use cache" "app/(app)/agenda/documentacion*" "app/(app)/agenda/pendientes*" lib/citas/agenda.ts`
      no devuelve nada.

**Manuales**:

- [ ] **Manual** — con lector de pantalla (NVDA o Narrador), el botón de un paciente dice
      «Ana López, 6 pendientes, 2 escalados, contraído» y al pulsarlo «expandido».
- [ ] **Manual** — en escala de grises (imprimir a PDF), el paciente con nivel 3 se distingue
      del de nivel 2 sin color, por forma, icono y texto.
- [ ] **Manual** — como técnico, la bandeja solo enseña consentimientos de sus centros y su
      recuento solo cuenta esos; como administrador, solo lo suyo; ninguna fila enseña nada
      clínico (ni tipo de terapia, ni texto de nota).
- [ ] **Manual** — resolver en otra pestaña y volver: al recargar, recuento y filas cuadran
      (no hay tiempo real); resolver la misma alerta en la pestaña vieja da «No se ha podido
      marcar como resuelta» y no rompe nada.
- [ ] **Manual** — `/agenda` al lado de `/prototipo`: mismo vocabulario visual, sin controles
      de adorno; 360 px en un teléfono real.

## Guion de comprobación manual

1. `npx supabase db reset && npm run seed && npm run dev`; preparar con SQL un profesional con
   9 pacientes con alertas abiertas, uno con 12, alguno con nivel 3 y alguno con solo
   consentimientos (o ejecutar la preparación del spec).
2. `/agenda` como ese profesional: 6 pacientes, el más urgente arriba, los de solo
   consentimientos por debajo de las notas, «Ver los N pendientes».
3. Desplegar dos pacientes; resolver el penúltimo de uno (el foco va a su nombre) y el último
   de otro (el foco va al siguiente).
4. «Ver todos (12)» → página filtrada por ese paciente; quitar el filtro; ir a la página 2;
   escribir `?pagina=99` a mano.
5. Repetir 2 a 4 a 360 px, solo con teclado, y como técnico y como administrador.

## Delegable

Nada. La única pieza sin comportamiento sería la insignia, y su forma, su icono y su texto son
justo la urgencia que D1 exige leer sin color; además su nombre accesible va en el botón de
desplegar. Son veinte líneas: encargarlas fuera cuesta más que escribirlas. Todo lo demás
lleva foco, ARIA, roles o lectura: la fábrica.

## Preguntas abiertas al propietario

Ninguna. P1–P4 quedaron respondidas el 06-10-2026 (§Decisiones del propietario).

## Lo que no entra

- Estado visto o no visto por paciente (v2: exige migración).
- Tiempo real: lo resuelto en otra pestaña cuadra al recargar o al volver.
- Cualquier animación de la insignia o de la fila (D1, ADR-047).
- Agregar o paginar en la base (función de lectura nueva, migración): descartado en D2; queda
  abierto si un día se mide que hace falta.
- Filtro de profesional y que el administrador vea pendientes de otros (D3): ticket propio si
  algún día se quiere.
- Cambiar el cálculo del nivel, los umbrales o `criterioDocumentacion`.
- La campana y el recuento de la cabecera (T-015). **No cuentan lo mismo**: la cabecera cuenta
  solo *mis* notas sin firmar (`recuento_notas_pendientes()`); la bandeja, todo lo que el rol
  ve. No se promete que coincidan.
- Filtrar la bandeja por centro.
- Cambiar la siembra: el spec prepara sus propios datos.
- Cualquier fichero del territorio de T-047 (ver Notas).

## Notas para el agente

- **Choque con T-047** (vista anual, contrato en curso): T-047 declara `bloques.ts`,
  `bloques.test.ts`, `parametros.ts`, `page.tsx`, `page.test.tsx`, `esqueletos.tsx`,
  `calendario.tsx` y `vista.ts` en `app/(app)/agenda/`. **Este ticket no toca ninguno**:
  `criterioDocumentacion`, `diasPendiente` y `puedeResolverAlerta` se importan tal cual; los
  parámetros de la página nueva van en su propio fichero dentro de `documentacion/`; el
  esqueleto de la página, dentro de `documentacion/` o reutilizando `EsqueletoLista` sin
  editarlo. El único fichero compartido es `lib/i18n/es.ts`: T-048 escribe solo bajo
  `agenda.documentacion.*` y T-047 bajo `agenda.barra.*`. El conflicto, si sale, es de texto
  y lo resuelve quien integre el segundo.
- **`max_rows = 1000`** (`supabase/config.toml:18`): toda lectura de este ticket declara su
  tope; ninguna depende de que PostgREST recorte.
- **El nivel solo existe para `nota_sin_firmar`** (`20261006120000_avisos_y_escalado.sql:343-344`).
  Un filtro `?nivel=2` deja, de hecho, solo notas sin firmar; al técnico no se le ofrece. Para
  ordenar en PostgREST: nivel desc con nulos al final (`nullsFirst: false`).
- **`.in('tipo', [])`**: si la intersección del filtro con la lista blanca del rol queda
  vacía, no se consulta; se devuelve vacío. No se le pasa a PostgREST una lista vacía.
- **Hallazgo T-040 R2A-H1**: `offset` + `count=exact` más allá del final da 416 en PostgREST
  local. La lectura empieza siempre en 0; la paginación es de pacientes, en el servidor.
- **Revalidación**: `resolverAlerta` ya hace `revalidatePath('/', 'layout')`
  (`acciones-alertas.ts:45`), que debería alcanzar a `/agenda/documentacion`. Se comprueba
  (criterio 9 en la página); solo si no alcanza se toca la acción.
- **Ruta nueva y `@modal`**: `app/(app)/@modal/[...catchAll]/page.tsx` devuelve `null`;
  navegar de `/agenda` a `/agenda/documentacion` no abre ningún diálogo. Se comprueba en el
  spec.
- **Next 16**: `searchParams` llega como promesa; `redirect` fuera de `try`; lee
  `node_modules/next/dist/docs/` antes de escribir la página. Cache Components activo: cada
  bloque asíncrono, detrás de su `<Suspense>`.
- Píldoras: tres tonos (`success`, `info`, `warning`), no más. El malva es selección, no
  urgencia. El rojo es error, no «pendiente».
- El foco tras resolver vive hoy en `ProveedorResolucion` (`resolver-alerta.tsx:43-64`), que
  enfoca el grupo entero. Las tres lecciones de su cabecera (R3, R4, `aria-disabled`) siguen
  valiendo.
