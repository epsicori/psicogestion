---
id: T-047
titulo: Agenda — vista anual como mapa de densidad
modelo: opus
riesgo: alto            # lectura nueva en la base sobre `citas` y `citas_agenda`, con las dos ramas por rol (CLAUDE.md §Enrutado: RLS)
fase: 1
prioridad: media
depende_de: [T-014, T-039]   # T-014: el calendario, la barra y los filtros; T-039: la última forma de `agenda_citas_rango` y `citas_agenda`
estado: pendiente
delegable: volumen      # SOLO dos piezas de pintura: la leyenda de densidad y el esqueleto del año (§Delegable); todo lo demás, la fábrica
territorio:             # provisional; lo cierra tickets/T-047/diseno.md §6
  - supabase/migrations/20261017120000_agenda_densidad_anual.sql   # cola de un solo dueño: después de la reserva de T-023b (20261016120000)
  - scripts/rls/34-agenda-anual.sql                                # 29–33 ya están reservados (T-043, T-023, T-026a, T-046, T-023b)
  - scripts/rls/README.md                                          # solo la fila del banco 34
  - lib/supabase/tipos-bd.ts                                       # solo regenerado con `npm run tipos`
  - lib/citas/densidad.ts                                          # la lectura, `server-only`, por la sesión del usuario
  - lib/citas/densidad.test.ts
  - lib/agenda/anio.ts                                             # puro: los doce meses, los tramos de densidad y el destino del teclado
  - lib/agenda/anio.test.ts
  - app/(app)/agenda/parametros.ts
  - app/(app)/agenda/parametros.test.ts
  - app/(app)/agenda/bloques.ts
  - app/(app)/agenda/bloques.test.ts
  - app/(app)/agenda/vista.ts                                      # solo si el diseño lo necesita para que `'anio'` no caiga en la rama del mes
  - app/(app)/agenda/vista.test.ts
  - app/(app)/agenda/page.tsx
  - app/(app)/agenda/page.test.tsx
  - app/(app)/agenda/calendario.tsx                                # el selector de vista pasa de dos a tres
  - app/(app)/agenda/calendario.test.tsx
  - app/(app)/agenda/*anio*.tsx                                    # piezas nuevas de la vista anual (nombres exactos: diseño §1)
  - app/(app)/agenda/*anio*.test.tsx
  - app/(app)/agenda/leyenda-densidad.tsx
  - app/(app)/agenda/leyenda-densidad.test.tsx
  - app/(app)/agenda/esqueletos.tsx
  - app/(app)/agenda/esqueletos.test.tsx
  - lib/i18n/es.ts
  - app/globals.css                                                # solo si el diseño añade tonos de densidad
  - lib/contraste/tokens.ts                                        # ídem: todo tono nuevo entra en el verificador de contraste
  - accesibilidad/agenda-anual.spec.ts
  - docs/interfaz.md                                               # solo §«Agenda · Tu día, de un vistazo»: la forma elegida para el año
---

# Contexto

`docs/interfaz.md` §«Agenda · Tu día, de un vistazo» pide **tres vistas** del calendario
—semanal, mensual y **«anual como mapa de densidad»**— y que cambiar de vista **conserve la
fecha enfocada**. T-014 entregó la semana y el mes; la anual no existe. El prototipo **no la
dibuja** (`app/prototipo/page.tsx` no tiene vista anual): la forma se decide aquí y se anota
en `docs/interfaz.md`.

Un mapa de densidad son **recuentos por día**. No enseña pacientes, ni tipos, ni horas: dice
cuánto se llenó cada día del año y deja saltar a ese día.

Módulo del prototipo: **Agenda**. Choques que toca: **4** (el técnico no ve el tipo de
terapia: aquí no sale para nadie), **6** (las métricas dependen del rol: un desglose por
estado sería adherencia anual, que el técnico no ve) y **14** (la agenda no enseña nada sin
dato detrás). ADR **034** (formateo en servidor, nada de `Date` al cliente), **040** (a mano),
**041** (WCAG 2.2 AA), **043** (nada de `use cache`), **044** (360 px), **050** (Agenda
absorbe Inicio y Clínica: el panel derecho y el cuadro no cambian con la vista).

**Quién ve qué** (`docs/architecture.md` §Roles, fila Agenda): administrador, todas;
profesional, la suya; técnico, todas las de sus centros sin tipo ni episodio. El mapa cuenta
**exactamente las citas que la vista mensual le enseña a ese usuario con esos filtros**, ni
una más: es la misma agenda, agregada.

## Por qué hace falta migración

Lo comprobado leyendo el código, y que impide reutilizar la lectura del mes:

1. `agenda_citas_rango()` rechaza con `22023` todo rango de más de **62 días**
   (`supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:1506-1509`). Un año
   son seis llamadas como mínimo.
2. Esa función devuelve la fila entera —nombre y apellidos del paciente, tipo de terapia,
   nota operativa, `nota_pendiente` con una subconsulta por fila—: traer diez mil filas
   clínicas al servidor para contarlas es leer de más.
3. `supabase/config.toml:18` fija `max_rows = 1000`. Un recuento hecho sobre filas que
   PostgREST pueda recortar en silencio es un recuento falso que nadie ve. (Si `max_rows`
   alcanza o no a las RPC que devuelven conjuntos en la versión local se comprueba en el
   diseño; el contrato exige que ninguna lectura de este ticket dependa de ello.)
4. `agenda_bloques_profesional` (`20261005120000_base_del_alta_de_cita.sql:850`) no sirve: da
   huecos libres de un profesional, no recuentos de la agenda.

Por eso: **una función de lectura nueva, agregada en la base**, en
`20261017120000_agenda_densidad_anual.sql` (la siguiente libre tras la reserva de T-023b,
`20261016120000`). Solo crea; no modifica ni borra nada existente.

## Tareas

- [ ] **Lectura agregada en la base.** Función nueva, **`security invoker`** —por la misma
      razón que `agenda_citas_rango`: en definer el técnico leería la organización entera—,
      con **las mismas dos ramas disjuntas por rol**: `public.citas` solo para
      `administrador` y `profesional_sanitario` (filtro explícito con `rol_actual()`, revisión
      SQL H1 de T-014), y `public.citas_agenda` para el técnico. Mismo predicado de
      pertenencia al rango que el mes: la cita cuenta en el **día local de su `inicio`** en la
      zona de la vista (la que `cargarContexto` resuelve), una sola vez aunque cruce la
      medianoche.
      - Devuelve **recuentos**, nunca columnas de la cita: ni paciente, ni tipo, ni nota, ni
        nombres. La forma exacta de la salida la fija el diseño §1, con una condición: **por
        construcción no puede pasar de `max_rows`** (por ejemplo, una fila por día con los
        filtros como parámetros: ≤ 366), o la lectura pagina y lo prueba.
      - Filtros de **centro** y **profesional** como parámetros, con la misma semántica que
        hoy aplica la página en TypeScript (`page.tsx:41`, `vista.ts:195-198`): el centro
        deja fuera las citas sin `centro_id`; sin filtro, entran todas las visibles.
      - Rango acotado a un año natural en la zona: lo que pase de esa cota, rango invertido o
        extremos nulos, `22023`, como `agenda_citas_rango`.
      - `revoke all … from public, anon, service_role; grant execute … to authenticated`.
      - El coste se mide (criterio 4). Si el plan pide un índice, el índice va en la misma
        migración, solo añadiendo.
- [ ] **Qué se cuenta** *(D1, cerrada por el propietario el 06-10-2026)*: **todas las citas salvo las
      canceladas**, en un solo número por día y **sin desglose por estado**. Una cancelada no
      ocupa la agenda; un desglose realizada/no asistió sería adherencia anual, y eso es el
      cuadro inferior que el técnico no ve (choque 6). Las propuestas «Por confirmar» no son
      citas y no cuentan. **El mes sí cuenta las canceladas** en su celda
      (`rejilla-mes.tsx:73` y `110`): el recuento del año y el del mes de un mismo día
      difieren exactamente en ellas, y la leyenda del año lo dice («sin canceladas»).
- [ ] **`?vista=anio`** en `parametros.ts`: tercer valor válido; cualquier otro sigue
      cayendo en `semana`. El tipo que hoy es `'semana' | 'mes'` deja de poder caer por
      descarte en la rama del mes: `rangoDeVista` (`bloques.ts:40-47`) y `construirVista`
      (`vista.ts:209-214`, `279`, `347-350`) hacen hoy «si no es semana, es mes».
- [ ] **El año** *(D2, cerrada el 06-10-2026)*: **doce meses en mini-rejilla**, cada
      uno de siete columnas con lunes primero, con el nombre del mes y **su total** de citas;
      **cuatro meses por fila en escritorio**, menos al estrechar, **uno por fila a 360 px**.
      Los días de otros meses no se pintan en cada mini-rejilla (celda vacía, sin foco):
      cada día del año aparece una sola vez. Año **natural** (D5, cerrada el 06-10-2026): título
      «2026», anterior/siguiente mueven **un año entero**, «Hoy» lleva al año en curso.
- [ ] **Escala de densidad** *(D3, cerrada el 06-10-2026)*: **relativa**, cinco escalones —0 y cuatro
      tramos— **calculados sobre el año visible con sus filtros**, y la leyenda dice **los
      números de cada tramo** («1–3», «4–7»…), no «poco/mucho». Función pura en
      `lib/agenda/anio.ts`, con pruebas de bordes (año vacío, todos los días iguales, un
      solo día con citas).
- [ ] **La densidad no depende solo del color** (WCAG 1.4.1): cada escalón lleva **tono y
      forma** (marcas o relleno proporcional, a decidir en el diseño), sobrevive a la escala
      de grises y al modo de colores forzados, y el número exacto está en el nombre
      accesible de cada día. Tonos nuevos, si los hay, entran en `lib/contraste/tokens.ts`
      con contraste ≥ 3:1 contra la superficie (WCAG 1.4.11).
- [ ] **Pulsar un día** *(D4, cerrada el 06-10-2026)*: lleva a **la semana de ese día**; el día es un **enlace** a
      `/agenda?vista=semana&fecha=<día>` conservando `centro` y `profesional`. No abre panel
      ni trae filas del día.
- [ ] **Conservar la fecha enfocada en los dos sentidos.** De semana o mes a «Año», la fecha
      viaja en la URL y el foco rodante del año arranca en ese día. En el año, **el día con
      el foco rodante es la fecha enfocada**: los botones «Semana» y «Mes» la llevan.
- [ ] **Teclado y ARIA propia** (patrón «grid», como el mes): **un solo día del año** en el
      orden de tabulación (`tabindex` 0/-1 rodante); ←/→ día anterior/siguiente cruzando
      semana y mes; ↑/↓ ±7 días; Inicio/Fin, principio y fin de la semana; RePág/AvPág, mes
      anterior/siguiente; en el 1 de enero y el 31 de diciembre las flechas hacia fuera no
      hacen nada. Intro sigue el enlace. El destino de cada tecla es una función pura de
      `lib/agenda/anio.ts` con prueba; la primitiva compartida
      `components/ui/rejilla-foco.ts` **no se toca** (la usan semana y mes). Hoy lleva
      `aria-current="date"`. Nombre accesible de cada día: fecha larga y recuento
      («martes, 3 de marzo de 2026, 7 citas»); cada mes, rotulado con su nombre y su total.
- [ ] **Filtros, barra y leyenda**: los mismos selectores de centro y profesional, con las
      mismas reglas de cuándo se muestran (`calendario.tsx:174-175`). La lista de
      profesionales del año sale de lo que el usuario puede ver en ese año, no del
      directorio entero. En la vista anual **no** sale la leyenda de estados (no hay
      estados que leer): sale la leyenda de densidad.
- [ ] **Servidor y datos**: un bloque con su `<Suspense>` y su esqueleto (ADR-043), una sola
      llamada a la base por render, error con `AvisoDeError` como el calendario, estado vacío
      («Sin citas en 2026»). Lo que cruza al cliente son cadenas, números y booleanos
      (ADR-034). **Nada de `use cache`**: son los recuentos de lo que ve quien mira. El panel
      derecho y el cuadro inferior no cambian con la vista.
- [ ] **A 360 px** (ADR-044): sin desplazamiento horizontal, todo día pulsable a **44 px**
      al tacto (el mes ya resolvió el ancho con la sangría de la tarjeta; aquí igual o
      mejor), y las mismas acciones que en escritorio. La forma se anota en
      `docs/interfaz.md` §Agenda con su motivo.
- [ ] **Banco de RLS 34** en `scripts/rls/34-agenda-anual.sql`, con su fila en el README.

## Criterios de aceptación (verificables)

**Base de datos** (todos en `npm run test:rls`, banco 34, dentro de `begin … rollback`):

- [ ] **1 · Oráculo por rol.** Para administrador, un profesional y un técnico, y para cada
      combinación de filtro (sin filtro, un centro, un profesional, los dos), el recuento de
      cada día de un mes de prueba es **igual** al número de filas de `agenda_citas_rango()`
      de ese mes que empiezan ese día local, **sin las canceladas** (D1),
      aplicando los mismos filtros. Una sola discrepancia, FALLA.
- [ ] **2 · Lo que el llamante elige no abre nada.** Un técnico que pasa como filtro el
      `centro_id` de un centro ajeno obtiene **cero** en todos los días; un profesional que
      pasa el `profesional_id` de otro obtiene lo mismo que le daría el oráculo (cero si no
      comparte cita). Un técnico que figura como `profesional_id` de una cita (la C18TEC del
      banco 18) la cuenta **una vez**, no dos.
- [ ] **3 · Forma y permisos.** `pg_get_function_result` de la función nueva no contiene
      ninguna columna de paciente, tipo, nota ni nombre (lista exacta: diseño §1);
      `prosecdef = false`; `anon` recibe `42501`; un rango de más de un año, invertido o con
      un extremo nulo recibe `22023`.
- [ ] **4 · Coste y tope de filas.** Con un año sintético de **≥ 10 000 citas** en la
      transacción del banco: el resultado coincide con el oráculo (ninguna fila perdida por
      `max_rows`), y `EXPLAIN (ANALYZE)` de la llamada del administrador sin filtros queda
      **por debajo de 1 s** en local. El plan y el tiempo se copian a la evidencia.
- [ ] **5 · Nada se rompe alrededor.** `npm run test:rls` no empeora respecto a `main`
      (`docs/state.md` anota que 16-series y 23-cita-en-episodio ya fallan allí: se
      comparan, no se arreglan aquí).

**Aplicación** (`npm test`):

- [ ] **6** — `leerParametros` acepta `vista=anio`; `vista=año`, `vista=ANIO`, repetido o
      vacío caen en `semana`.
- [ ] **7** — `rangoDeVista('anio', …)` da del 1 de enero a las 00:00 al 1 de enero
      siguiente a las 00:00 en la zona (prueba con `Europe/Madrid` y `Atlantic/Canary`, y un
      año bisiesto); ni `rangoDeVista` ni `construirVista` tratan `'anio'` como mes.
- [ ] **8** — `lib/agenda/anio.ts`: los doce meses dan 365/366 días, cada uno una vez; los
      tramos tienen los bordes de la tarea «Escala»; cada tecla del teclado da el destino
      descrito, incluidos los cruces de mes y los topes de año.
- [ ] **9** — la vista anual que baja al cliente pasa por `JSON.parse(JSON.stringify(…))`
      sin cambiar (ninguna `Date`).
- [ ] **10** — en `calendario.test.tsx` (o la prueba de la isla anual): el selector tiene
      tres opciones con `aria-current` en la activa; «Año» lleva la `fecha` enfocada; en el
      año, mover el foco con las flechas y pulsar «Mes» lleva `vista=mes&fecha=<día con
      foco>`; el enlace de un día conserva `centro` y `profesional`.
- [ ] **11** — el nombre accesible de un día con 7 citas es «<fecha larga>, 7 citas», el de
      un día vacío dice «sin citas», y hoy lleva `aria-current="date"`.
- [ ] **12** — `rg -n "use cache" "app/(app)/agenda" lib/citas/densidad.ts` no devuelve
      nada.

**Accesibilidad y build**:

- [ ] **13** — `npx playwright test accesibilidad/agenda-anual.spec.ts` en verde: recorrido
      solo con teclado (Tab entra en un único día, flechas, RePág/AvPág, Intro lleva a la
      semana de ese día), y a 360 px el documento no tiene desplazamiento horizontal y
      todo día mide ≥ 44 × 44 px con puntero táctil emulado.
- [ ] **14** — `npm run lint && npm run build` limpios.

**Manuales**:

- [ ] **Manual** — en escala de grises (imprimir a PDF en grises) y con colores forzados de
      Windows activados, los cinco escalones se distinguen sin la leyenda de color.
- [ ] **Manual** — con lector de pantalla (NVDA o Narrador), recorrer marzo dice fecha y
      recuento de cada día y el total del mes.
- [ ] **Manual** — como `tecnico_administrativo`, el año enseña solo citas de sus centros y
      ningún desglose por estado; como `profesional_sanitario`, solo las suyas y sin
      selector de profesional. El recuento de un día coincide con lo que enseña el mes ese
      día **menos sus canceladas** (D1).
- [ ] **Manual** — a 360 px en un teléfono real: los doce meses en columna, legibles y
      pulsables, sin «se ve mejor en ordenador».
- [ ] **Manual** — `/agenda?vista=anio` al lado de `/prototipo`: mismo vocabulario visual,
      sin controles de adorno.

## Guion de comprobación manual

1. `npx supabase db reset && npm run seed && npm run dev`; entrar como administrador.
2. En `/agenda` (semana), ir a un día de marzo y pulsar «Año»: el foco rodante está en ese
   día. Flechas hasta otro día, pulsar «Mes»: se abre el mes de ese día.
3. Volver al año, Intro sobre un día con citas: se abre su semana con los mismos filtros.
4. Filtrar por un centro y por un profesional: los totales de mes cambian y la leyenda
   rehace sus tramos.
5. Estrechar a 360 px y repetir el paso 3 con el dedo (o emulación táctil).
6. Repetir 2 como técnico y como profesional.

## Delegable

- **`volumen`**: `leyenda-densidad.tsx` (recibe los tramos ya calculados y pinta tono, forma
  y rango numérico de cada escalón) y el esqueleto del año en `esqueletos.tsx`. Pintura sin
  foco ni estado.
- **Todo lo demás, la fábrica**: la migración y el banco (RLS), la lectura, el cálculo de
  tramos, la rejilla anual (foco rodante, teclado, ARIA) y el selector de vista.

## Decisiones del propietario (06-10-2026)

Cerradas; las cinco fueron las recomendadas. Preguntas abiertas: **ninguna**.

- **D1 · Qué cuenta.** Todas las citas salvo las canceladas, un solo número por día, sin
  desglose por estado. El mes sí cuenta las canceladas: año y mes difieren en ellas.
- **D2 · Forma.** Doce mini-meses, cuatro por fila en escritorio y uno por fila a 360 px,
  con el total de cada mes junto a su nombre. Descartada la tira de 53 semanas, que a
  360 px obliga a desplazar en horizontal.
- **D3 · Escala.** Relativa: cinco escalones calculados sobre el año visible con sus
  filtros; la leyenda dice los números de cada tramo. Descartados los umbrales fijos, que
  en un centro grande lo pintan todo en el escalón alto.
- **D4 · Destino del día.** La semana de ese día, conservando centro y profesional.
- **D5 · Ventana.** Año natural (título «2026»); las flechas mueven un año entero.
  Descartados «los últimos doce meses».

## Lo que no entra

- Desglose por estado, por tipo o por modalidad; métricas de adherencia (cuadro inferior,
  choque 6).
- Panel del día desde el año (exigiría traer las filas del día; el día lleva a la semana).
- Exportar o imprimir el año.
- Cambiar la semana, el mes o la primitiva `components/ui/rejilla-foco.ts`.

## Notas para el agente

- Lee **`node_modules/next/dist/docs/`** antes de tocar `page.tsx`: Cache Components está
  activo (ADR-043) y `searchParams` llega como promesa.
- **`supabase/` tiene un solo dueño**: la migración no se integra antes que las reservadas
  anteriores (20261011120000–20261016120000) sin que el orquestador decida renumerar.
  Comprueba `max(version)` de la base local antes de verificar (una base reseteada desde
  `main` pierde la migración de la rama).
- El mes cuenta en su celda **todas** las citas, canceladas incluidas
  (`rejilla-mes.tsx:73` y `110`, `cuentaDeCitas(delDia.length)`). D1 las excluye del año: el
  oráculo y el criterio manual las descuentan, y la diferencia se dice en la leyenda.
- La zona es `contexto.zona` (`datos.ts:100`), la misma que usa el mes para colocar cada
  cita (`vista.ts:323`). Un parámetro de zona que elige el llamante solo desplaza los
  bordes de día de sus propias citas visibles; una zona inválida es un error, no un cero.
- `@date-fns/tz` (`TZDate`, `tz`), no `date-fns-tz`. Fechas de calendario con
  `lib/fechas/calendario.ts` (`sumarDias`, `sumarMeses`, `diaDeLaSemana`).
- Textos en `lib/i18n/es.ts` (`agenda.barra.anio`, `anioAnterior`, `anioSiguiente`… según el
  diseño). El malva es selección, no densidad.
