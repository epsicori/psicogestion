# Estado

> Memoria viva del proyecto. **Léelo antes de tocar código; actualízalo al terminar.**
> Es el bus entre agentes: lo que aprendas aquí se escribe, no se re-explica.

**Actualizado**: 21-08-2026

## Ticket en curso

**T-001 · Esquema base** — en curso. **T-000 cerrado el 22-08-2026**: los ocho criterios
pasan, incluido el recorrido manual en navegador. El gate de dependencias de T-001 está
abierto.

## Dónde estamos

Fase 0. Primer stack completo armado:

- Migración base: `20260815192424_base_perfiles_pacientes_auditoria.sql` con enum `rol_usuario`, tablas `perfiles`, `pacientes`, `auditoria`, funciones `rol_actual()` e `fn_auditar()`, RLS activo y grants.
- Siembra: dos usuarios `profesional_sanitario` (Ana, Bruno) con un paciente cada uno en `supabase/seed.sql`.
- Cliente Supabase: `lib/supabase/` (config, navegador, servidor, sesión, tipos generados con `npm run tipos`).
- Flujo autenticación: `/login` (correo + contraseña, Server Action) → `/pacientes` (lista de RLS + alta con `crearPaciente`).
- Cierre de sesión en `/pacientes`.
- Validación con Zod en servidor, esquemas compartidos.

**Criterios automáticos pasados** (verificados con `scripts/t000-rls.sql`):
1. `npx supabase db reset` verde sin errores.
2. `npm run lint` y `npm run build` limpios.
3. RLS en `pacientes`: profesional A ve solo sus filas.
4. Inserción con `profesional_id` ajeno es rechazada por RLS (42501).
5. Auditoría: 1 fila por insert con `actor_id` correcto.
6. `UPDATE` y `DELETE` en `auditoria` denegados incluso como `postgres`.
7. `/pacientes` sin sesión redirige a `/login` (307).

**Criterio manual pendiente** (criterio 8): Guion completo en navegador (login A → ver paciente → crear paciente → verificar lista → logout → login B → verificar aislamiento).

## Últimos cambios

- **Fase 0 redactada entera, 22-08-2026.** Los nueve tickets T-001 a T-009 existen ya en
  `tickets/`, escritos contra los destilados y contra la tabla de reparto de ADR de
  `PLAN.md`. Dos fronteras que quedaron fijadas al redactarlos y conviene no volver a
  discutir: **T-001 levanta Organización, Paciente identificativo y Paciente clínico, y
  deja fuera Agenda, Económico, Firmas y Mensajería** —con dos excepciones justificadas,
  `alertas_documentacion` y `zona_horaria` en organización y centro—; y **T-003 tiene
  fijación de datos propia**, independiente del seed de T-008, para que una prueba de RLS
  no dependa de una siembra que alguien retoque.
- **Revisión del propietario, 22-08-2026.** Tres devoluciones del formulario de decisiones:
  - **ADR-032 enmendado**: no todos los pacientes son de la organización. El profesional
    suele ser **autónomo colaborador**, y sus pacientes propios se los lleva.
    `pacientes.titularidad` (`organizacion` por defecto, o `profesional`), la fija el
    administrador. Decide **solo qué pasa en la baja**, no quién factura: el NIF sigue siendo
    uno por instancia, y quien emita con el suyo es otro cliente — misma frontera dura que
    los centros. Al traspasar: exportación cifrada para el profesional, **el original se
    conserva** bajo el reloj de retención, y el saliente pierde el acceso igual.
  - **ADR-040 cambiado**: **todo a mano, sin librería de componentes**. Ni shadcn, ni Radix,
    ni Base UI. Contra la recomendación y contra el maestro, y escrito así con su fecha.
    Consecuencia obligatoria: las primitivas con comportamiento se escriben **una vez** en
    `components/ui/` con lista de comprobación como criterio de aceptación, y el verificador
    del ADR-041 pasa a ser la única red.
  - **ADR-044 cambiado**: **todo funciona desde 360 px**, sin vista degradada ni avisos de
    «mejor en ordenador». El editor de notas y el calendario semanal se diseñan dos veces.
- **ADR-035 a ADR-044 · Las diez que faltaban antes de construir** (22-08-2026). Cinco de
  núcleo y cinco de interfaz, todas bloqueando fase 0. Las tres que más pesan:
  **canonicalización de la huella** (el maestro fija TipTap y JSON, pero «canonicalización»
  aparecía cero veces — sin fijarla, un `npm update` cambia una huella y el verificador
  nocturno no puede distinguirlo de una manipulación); **dónde vive el borrador**, que no
  puede ser una tabla de solo adición; y la **contradicción shadcn/Radix**, que estaba
  escrita en el maestro y desmentida de pasada en este fichero sin que nadie la registrara.
- **Contradicción resuelta**: el maestro fija «Tailwind + shadcn/ui sobre Radix» y este
  fichero decía «Sin shadcn ni Base UI». Lo cierra el **ADR-040**: **Radix directo** para lo
  que tiene comportamiento, vestido con los tokens del ADR-025; shadcn descartado porque su
  juego de tokens pelearía con el destilado del prototipo; a mano lo que es pintura.
- **WCAG 2.2 AA subido al destilado** (ADR-041). Estaba en el maestro como objetivo
  verificado en el pipeline y en ningún destilado, junto con el validador de contraste de la
  personalización de color. Ahora en `interfaz.md` §Accesibilidad.
- **`cacheComponents` se activará en T-007** (ADR-043). Hoy `next.config.ts` está vacío. Ver
  Next.js 16 reminders: la bandera va en la raíz, no bajo `experimental`.
- **ADR-034 · Zona horaria.** Cae del invariante 4 y no era decisión nueva, sino ese
  invariante aplicado al reloj: la serie guarda **hora local + zona IANA**, la cita guarda
  **instante**. La zona vive en el centro heredando de la organización (patrón del
  ADR-033); las anomalías de marzo y octubre se materializan de forma determinista y
  **marcadas como desviación**; nada se recalcula solo. Verificado en el paquete instalado:
  date-fns 4 lleva zonas en **`@date-fns/tz`**, no en `date-fns-tz` — ver Aprendizajes.
- **ADR-027 a ADR-033 · Siete decisiones de fase 0, cerradas de una vez.** Salieron de
  barrer el maestro buscando lo que no menciona. Las tres primeras eran las caras:
  **anotaciones subjetivas** del art. 18.3 («subjetiv» no aparecía ni una vez en el
  maestro, y sin campo propio desde la primera migración el derecho de acceso del paciente
  no se puede atender), **menores y representantes legales** (cero menciones de tutor o
  patria potestad) y el **modo de cifrado del DNI**, que el maestro daba por hecho sin
  decir cómo se busca luego. Después: **pareja y familia**, **fusión de duplicados**
  —prometida en el importador y sin mecánica—, **baja del profesional** y **centros**.
  Reparto por ticket en la tabla de `PLAN.md`.
- **`centros` sale de Hallazgos anotados**: estaba abierto desde el 20-08 y lo cierra el
  ADR-033. La retención cuelga del centro; el centro acota solo al técnico administrativo.
- **Copias de seguridad subidas al destilado** (`architecture.md` §Copias de seguridad).
  Estaban resueltas en el maestro —PITR 7 días, volcado diario cifrado 90 días, volcado
  mensual con huella 7 años, y prueba de restauración trimestral con acta— y no estaban en
  ningún destilado, así que para un agente que solo lee los destilados no existían.
- **ADR-026 · Candado de la historia clínica**: PIN personal de seis dígitos, desbloqueo
  de sesión con ventana de 15 min, hecho cumplir **en RLS** vía `historia_desbloqueada()`.
  Reparte trabajo en T-001 (tablas), T-002 (política), T-003 (prueba negativa) y T-006
  (alta del PIN). Verificado sobre la base local: `pgcrypto` ya instalado
  (`extensions.crypt`), `pgsodium` disponible **sin instalar** y en retirada por Supabase
  — el hash va con bcrypt, y lo que sostiene la seguridad es el bloqueo por intentos, no
  la función de derivación. Ver también `architecture.md` §Candado.
- **`docs/interfaz.md`**: la pestaña «Historia clínica» de la ficha pasa a tener cinco
  sub-pestañas (Historial clínico · Notas clínicas · Evaluaciones · Informes · Documentos)
  y aparece el **choque 11**: la historia tenía dos puertas en el prototipo (ficha y
  módulo `Clínica`) y ahora tiene una sola. Consecuencia de modelo: la bandeja y las
  métricas de Inicio se alimentan de `alertas_documentacion`, no de `notas_clinicas` ni

- Sistema de diseño adoptado desde la maqueta de v0: tokens, fuentes, armazón y las dos
  pantallas reales (`/login`, `/pacientes`) revestidas. Ver sección «Sistema de diseño»
  y ADR-025. `lint` y `build` verdes; la verificación manual del criterio 8 de T-000
  sigue pendiente y ahora se hará sobre la interfaz nueva.
- **`docs/interfaz.md`**: el prototipo destilado a especificación —los siete módulos, el
  vocabulario de componentes y diez choques con la matriz de roles, resueltos. Referenciado
  desde `CLAUDE.md`, `architecture.md` §Roles y la plantilla de tickets, que ahora exige
  dos criterios de aceptación nuevos en todo ticket de pantalla.
- T-000 implementado: migraciones, RLS, auditoría, componentes servidor, Server Actions, siembra.
- Patrón de autorización dentro de cada acción (no herencia del Proxy).
- Uso de `useActionState` + Zod en servidor; deuda `react-hook-form` → T-007.

## Sistema de diseño

**La interfaz se especifica en `docs/interfaz.md`** — módulos, vocabulario de componentes
y, lo importante, los diez sitios donde el prototipo choca con la matriz de roles, ya
resueltos. La relación entre prototipo y proyecto es el **ADR-025**. Aquí solo va dónde
vive cada cosa en el código:

| Qué | Dónde |
|---|---|
| Tokens de color y radios | `app/globals.css` |
| Fuentes (Geist + DM Serif Display) | `app/layout.tsx` |
| Armazón: barra lateral y cabecera | `components/armazon/` |
| Lista de módulos y su `disponible` | `components/armazon/modulos.ts` |
| Primitivas de formulario | `components/ui/button.tsx`, `components/ui/field.tsx` |
| Prototipo congelado | `app/prototipo/page.tsx` → `/prototipo` |

Sin shadcn ni Base UI: el prototipo no los usaba. Dependencias nuevas: `lucide-react`,
`clsx`, `tailwind-merge`.

`/prototipo` está **exento de ESLint** y es **ruta pública en `proxy.ts`**, para poder
mirarlo sin sesión ni base de datos. **Antes de producción: protegerlo o borrarlo.**

Las rutas con sesión viven en el grupo `app/(app)/`, que **no añade segmento a la URL**:
`/pacientes` sigue siendo `/pacientes`. `cerrarSesion` pasó de
`app/pacientes/acciones.ts` a `app/(app)/acciones.ts` y ahora vive en la barra lateral.

## Repositorio

`https://github.com/epsicori/psicogestion` — privado, rama `main` sincronizada.

## Bloqueos

Ninguno. Verificación manual pendiente.

## Siguiente paso

Verificación manual del criterio 8 en navegador → cierre de T-000 → `/fabrica T-001`
(esquema base: organización, centros, perfiles, paciente e historia). Detrás,
T-002 → T-003; T-004 se puede paralelizar con T-002, y T-006, T-007 y T-008 entre sí una
vez cerrado T-002.

## Hallazgos anotados

Detectados fuera del alcance de su ticket (constitución, regla 2). Se anotan aquí y se
recogen cuando llegue la fase que los toca.

### Umbral de volumen de `wa.me` — muerde a partir de ~7 profesionales

La decisión 11 fija `wa.me` como canal y sitúa el umbral de migración en **~40 envíos al
día**. Contra el segmento declarado (consultas de 3 a 20 profesionales), con dos
recordatorios por cita (24 h y 1 h):

| Tamaño | Citas/día | Envíos/día |
|---|---|---|
| Consulta propia | ~6 | ~12 |
| 3 profesionales | ~18 | ~36 |
| 7 profesionales | ~42 | ~84 |
| 20 profesionales | ~120 | ~240 |

En v1 no se cruza —el primer usuario es la consulta propia, decisión 22— pero **la mitad
superior del segmento sí lo cruza**. No es motivo para adoptar la API de WhatsApp: primero
se agota la ergonomía, que baja los envíos reales antes que el coste por envío.

**Mitigaciones, en este orden, cuando entre la mensajería:**

1. **Un solo recordatorio por cita**, el del día anterior. El de 1 h se activa por
   paciente, nunca por defecto: duplica el trabajo de recepción y aporta poco.
2. **No enviar a citas ya confirmadas.** El de 1 h, si existe, solo sobre las que siguen
   sin respuesta.
3. **Agrupar por paciente**: dos citas el mismo día son un mensaje, no dos.
4. **Cola del día con avance automático** (maestro: «una única pantalla con la cola del
   día convierte la tarea en tres minutos de recepción»): al volver de WhatsApp la
   pantalla ya está en el siguiente. Un clic por mensaje, no una navegación por mensaje.

Con las cuatro, 240 envíos brutos caen al orden de 60-80 clics. Si aun así un cliente real
lo cruza, la salida es el **ADR-023**, no contratar a Meta.

### `centros`: cerrado en el ADR-033 — resuelto, no pendiente

Estuvo aquí como hallazgo abierto desde el 20-08-2026. **Se cerró el 21-08-2026 en el
ADR-033** y ya no se decide en T-001: se implementa. En resumen, para no tener que abrir el
ADR cada vez:

- `politicas_retencion` **cuelga del centro**, con la organización como valor por defecto
  heredable. Motivo: los mínimos legales varían por CCAA (cinco años de norma general, hasta
  quince en Cataluña), así que dos centros pueden tener dos mínimos.
- El centro **acota al técnico administrativo y a nadie más**. El profesional sigue a sus
  pacientes entre centros; el administrador ve todos.
- Disponibilidad y festivos por centro; series de facturación por centro opcionales bajo el
  mismo NIF.
- **Frontera dura**: un «centro» con NIF propio no es un centro, es otra instancia y otro
  cliente. Dos NIF en una instancia rompen las decisiones 1 y 2 a la vez.
- **Coste**: 0 €/mes de infraestructura y 1-2 h de configuración. No se cobra cuota por
  centro — duplicaría el cobro del crecimiento que ya captura el tramo por usuario.

## Aprendizajes

### Invariante de solo adición — tres capas obligatorias

1. **TRUNCATE es agujero de RLS**: no lo interceptan políticas ni `FOR EACH ROW` triggers. Afecta a `auditoria`, `notas_clinicas_versiones`, `facturas`, `accesos_historia`. Cada tabla de solo adición necesita `BEFORE TRUNCATE ... FOR EACH STATEMENT trigger` + `revoke all on table` + `before update/delete trigger`.
2. **Supabase regala privilegios sin pedir**: `alter default privileges in schema public revoke all on tables from anon, authenticated, service_role` neutraliza TRUNCATE, TRIGGER y REFERENCES que los roles nacen con. Regla: toda tabla nueva se inspecciona con `\dp` en Studio, no se asumen permisos.

### Siembra de auth.users

- Campos `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new` deben ser `''` (no NULL). NULL causa 500 en login (`Database error querying schema` desde GoTrue).
- Causa no es `auth.identities` (si esa fila existe y está bien, el problema es solo en `auth.users`).
- Única prueba válida: `curl` real al endpoint de token, no `db reset` o `lint`/`build`.

### Fechas y horas

- **date-fns 4 lleva zonas horarias en `@date-fns/tz`** (`TZDate`, `tz`). **No es
  `date-fns-tz`**: ese es el paquete de terceros para date-fns 2 y 3, y es lo que el modelo
  trae aprendido. Verificado en `node_modules/date-fns/docs/timeZones.md` del paquete
  instalado (4.4.0). Ninguno de los dos está instalado todavía; entra con el calendario.
- Las horas se formatean **en servidor**, en la zona del centro, y bajan como cadena
  (ADR-034). Es la misma regla que ya obligaba a calcular el saludo y la fecha del armazón
  en servidor: `new Date()` en cliente rompe la hidratación.

### Patrones de proyecto

- `(select auth.uid())` entre paréntesis → InitPlan evaluado 1 vez por sentencia, no por fila.
- `getUser()` para autorizar, nunca `getSession()` (la sesión no se valida contra servidor).
- `exigirSesion()` dentro de cada Server Action, el Proxy es guardia optimista.
- `profesional_id` de la sesión, jamás del formulario.
- `redirect` fuera de `try`; `revalidatePath` actualiza lista sin reload cliente.

### Deuda consciente

- T-000 usa `useActionState` + `required` nativo; `react-hook-form` entra en T-007 con sistema de diseño.
- Entorno: puerto 3000 ocupado, Next arranca en 3002.
- `db reset` y `npm run tipos` van siempre juntos.

### Next.js 16 reminders

- **Cache Components**: la bandera es `cacheComponents: true` en la **raíz** de
  `next.config.ts`, no bajo `experimental`. Verificado en
  `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`. Aún sin activar;
  entra en T-007 (ADR-043).
- **El trabajo asíncrono sin cachear debe ir en `<Suspense>`** o bloquea el prerenderizado
  (`blocking-prerender-dynamic` en el overlay de desarrollo). El sustituto viaja en el
  armazón estático y el contenido llega en flujo.
- **`crypto`, `Date.now()` y los aleatorios disparan `blocking-prerender-*`.** Por eso la
  cadena de huellas (ADR-035) y el formateo de horas (ADR-034) viven en Server Actions y en
  la base, nunca en el render.
- **`use cache: private`** existe y guarda en memoria del navegador. La documentación la
  ofrece para requisitos de cumplimiento; **aquí está prohibida para datos clínicos**
  (ADR-043): dejaría contenido al alcance después de cerrarse el candado del ADR-026.
- Middleware es `proxy.ts` (no `middleware.ts`).
- `cookies()` es async.
- `revalidateTag` exige segundo argumento; `revalidatePath` más seguro.
- `next lint` desapareció; `npm run lint` independiente de `npm run build`.
