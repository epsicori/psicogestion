# Estado

> Memoria viva del proyecto. **Léelo antes de tocar código; actualízalo al terminar.**
> Es el bus entre agentes: lo que aprendas aquí se escribe, no se re-explica.

**Actualizado**: 22-08-2026

## Ticket en curso

**T-001 · Esquema base** — implementado el 22-08-2026 y **corregido tras la primera
revisión**, que devolvió cuatro hallazgos altos y tres medios, todos reproducidos contra
la base y todos arreglados en la misma migración:

| # | Qué estaba mal | Cómo se cierra |
|---|---|---|
| Alto 1 | Carrera de fusión: dos fusiones concurrentes creaban una cadena de dos saltos | `for no key update` al recorrer la cadena |
| Alto 2 | El mínimo legal de retención no tenía suelo: bajar las dos columnas a 1 año pasaba | `check (anios_minimo_legal >= 5)`, constante legal |
| Alto 3 | La fila de retención de la organización se podía **mover** con un `update` | El disparador cubre `delete or update of centro_id` |
| Alto 4 | Una versión sellada se podía reatribuir a otro paciente sin romper la huella | `fn_congelar_cabecera_sellada()` |
| Medio 5 | El índice de la ventana de acceso no deduplicaba con `pestana` nula | `nulls not distinct` |
| Medio 6 | Un consentimiento otorgado podía no guardar el texto firmado | `consentimientos_otorgado_exige_texto` |
| Medio 7 | `es_zona_iana()` sin `execute` para `authenticated` | Concedido |

La **segunda revisión no encontró ningún hallazgo alto** y devolvió tres medios, también
cerrados:

| # | Qué estaba mal | Cómo se cierra |
|---|---|---|
| Medio 1 | La congelación de la cabecera sellada cubría `paciente_id` y `fecha_sesion` y dejaba fuera `autor_id` —que decide **quién puede leer** la nota— y `episodio_id` | Las cuatro columnas en el `update of` y en el `when` |
| Medio 2 | La prueba de la carrera de fusión hacía `rollback`, así que su aserción global **daba cero también con la migración vieja** | `commit`, y se asevera que `A` acaba apuntando a `D` |
| Medio 3 | `accesos_historia_vistas` no ejercía la capa 2: faltaba la novena pieza de «tres capas × tres tablas» | Bloques de `update` y `delete` con el privilegio recuperado, más control de que el disparador cuelga de esa tabla |

Los quince criterios automáticos siguen pasando, y el guion lleva ahora **una prueba nueva
por arreglo con su control positivo**. Sigue **sin ejecutar en navegador** el punto 3 del
guion manual (paseo vertical de T-000 sobre el esquema nuevo): comprobado a nivel de base,
no de pantalla.

> **El patrón de error de este ticket, que conviene no repetir en T-002 y T-003.** Tres
> pruebas distintas estuvieron en verde **por el motivo equivocado**: el `DELETE` del
> criterio 8, que fallaba en la clave ajena y no en el candado; dos bloques «como
> `authenticated`» que devolvían `UPDATE 0` porque con RLS activo y sin política ese rol ni
> ve la fila; y la aserción de la carrera de fusión, que no discriminaba entre la migración
> nueva y la vieja. **Toda prueba negativa necesita su gemela positiva sobre la misma fila**,
> y hay que preguntarse siempre si la prueba seguiría verde con el arreglo quitado.

**T-000 cerrado el 22-08-2026**: los ocho criterios pasan, incluido el recorrido manual en
navegador.

Lo que ha entrado con T-001:
`supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql`
(22 tablas, 1 vista, 12 enums, 13 funciones, 17 disparadores, 7 índices de clave ajena),
`scripts/t001-esquema.sql` y `lib/supabase/tipos-bd.ts` regenerado. **Ni una política
RLS**: eso es T-002, y hasta entonces las tablas nuevas deniegan todo, que es el estado
correcto.

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

### Postgres — trampas pagadas en T-001 (léelas antes de tocar RLS o cerrojos)

- **`postgres` NO es superusuario en Supabase local** (`pg_user.usesuper = f`). Por eso el
  `revoke` de la capa 1 del cerrojo de solo adición le muerde de verdad… y por eso muerde
  también donde no se esperaba (los dos puntos siguientes).
- **Una tabla de solo adición no puede ser el destino de una clave ajena.** Insertar en la
  hija dispara una comprobación referencial que corre como propietario y necesita
  `SELECT … FOR KEY SHARE` sobre el padre, lo que exige `UPDATE` o `DELETE` sobre él.
  Revocados esos dos, **nadie puede insertar en la hija**. Por eso
  `accesos_historia_vistas.acceso_id` no lleva clave ajena, igual que
  `auditoria.actor_id` en T-000. Si en fase 1 aparece otra hija de una tabla sellada,
  misma regla: referencia sin clave ajena.
  **Consecuencia que hay que tapar en T-002**: sin clave ajena, la base ya no garantiza
  que `acceso_id` apunte a un acceso existente, y un huérfano aquí **no se puede borrar**
  (la tabla es de solo adición). Así que la política de `insert` de
  `accesos_historia_vistas` **debe llevar un `with check` que exija que el acceso exista
  y sea visible para quien escribe**. Es lo único que queda sujetando esa integridad.
- **`DELETE` sobre `perfiles` y sobre `pacientes` es imposible para cualquier rol,
  SIEMPRE**, no solo cuando la fila tiene datos clínicos. La comprobación referencial de
  `notas_clinicas_versiones` y `accesos_historia` pide el bloqueo **aunque no haya ni una
  fila que comprobar**, y el privilegio para tomarlo no existe. Reproducido con la base
  entera vacía —`versiones = 0`, `accesos = 0`— sobre un paciente recién insertado:
  `ERROR: permission denied for table accesos_historia`. Es coherente con «la baja no
  borra», pero **el `on delete cascade` desde `auth.users` ya no funciona nunca**: borrar
  un usuario de Auth fallará con `42501`. A tener en cuenta en **T-006** (alta y baja de
  usuarios: la baja es `estado = 'baja'`, jamás un `delete`) y en **T-008** (siembra: usar
  `db reset`, nunca borrar usuarios).
- **Dos fusiones concurrentes se cruzaban y creaban una cadena de dos saltos.** El
  recorrido de `fn_normalizar_fusion_paciente()` leía el destino sin bloquearlo, así que
  T1 (`A→B`) y T2 (`B→D`) se cruzaban y dejaban `A→B, B→D` — justo el «un solo salto» del
  que cuelga la RLS de T-002. Se arregla con `for no key update` en el recorrido, y es
  `for no key update` y no `for update` para no chocar con las comprobaciones de clave
  ajena, que toman `for key share`. Probado con dos conexiones y `lock_timeout`.
- **Un `grant select (columnas)` no sirve para acotar por rol en Supabase.** Los tres
  roles del dominio comparten el MISMO rol de base de datos, `authenticated` —el rol vive
  en `perfiles.rol`, no en el rol de Postgres—, así que un grant por columnas o se lo da a
  los tres o a ninguno. **T-002: el indicador binario de `valoraciones_riesgo` necesita
  una VISTA aparte** que exponga solo `(paciente_id, indicador, valorado_en)` con su
  propia RLS. El comentario de la migración que decía lo contrario ya está corregido.
- **El privilegio `EXECUTE` de una función de disparador se comprueba al CREAR el
  disparador, no al dispararlo.** Por eso las `fn_*` no llevan `grant`. La excepción es la
  función que otra función de disparador *security invoker* llama en tiempo de ejecución:
  `fn_validar_zona_horaria()` llama a `es_zona_iana()`, que se comprueba en cada disparo y
  con el rol que escribe. **Ya está concedido** (`grant execute on function
  public.es_zona_iana(text) to authenticated`), así que T-002 no tiene que acordarse: si
  no estuviera, cada alta de centro moriría con `permission denied for function`.
- **Validar una zona horaria con «existe en `pg_timezone_names`» no basta**: el catálogo
  contiene `CET`, `UTC` y `Etc/GMT+2`, prohibidos por el ADR-034. La regla real, ya
  implementada en `es_zona_iana()`: existe **y** contiene `/` **y** no empieza por
  `posix/` **ni** por `Etc/`. Y va en disparador, no en `check`: una `check` no admite
  subconsulta y envolverla en una función `immutable` rompería una restauración.
- **Los privilegios por defecto de secuencias** seguían concediendo `UPDATE` a `anon`,
  `authenticated` y `service_role` pese al `alter default privileges … on tables` de
  T-000. `UPDATE` sobre una secuencia habilita `setval()`, con el que se provoca una
  colisión de clave primaria en una tabla de solo adición. T-001 lo cierra con
  `alter default privileges … on sequences` **y** un `revoke all on all sequences` para
  las que ya existían.
- **Una guarda de dominio tiene que ser una restricción de tabla, no una comparación
  entre dos columnas que el usuario puede editar.** El suelo de retención comparaba
  `anios_historia_clinica >= anios_minimo_legal` con las DOS columnas editables y
  `grant update` a `authenticated`: bajar ambas a 1 año pasaba. El suelo real es
  `check (anios_minimo_legal >= 5)`, una constante legal (art. 17.1). Una CCAA puede
  exigir más y la columna se puede SUBIR; bajar del suelo ya no se puede desde ninguna
  pantalla.
- **Un veto de borrado no es un veto de movimiento.** La fila de retención de la
  organización estaba protegida contra `delete` pero no contra
  `update ... set centro_id = <centro>`, que la sacaba de la herencia sin borrar nada y
  hacía que todos los centros cayeran **en silencio** a los 25/5 constantes del
  `coalesce`. El disparador cubre ahora `before delete or update of centro_id`.
- **Una cabecera mutable junto a una tabla sellada necesita saber qué se congela.**
  `notas_clinicas.paciente_id` y `.fecha_sesion` eran editables después de firmar, y como
  el sobre canónico del ADR-035 no incluye ni el paciente ni la nota, una versión sellada
  se podía reatribuir a otro paciente **sin romper la cadena de huellas**: el verificador
  de T-005 lo habría dado por bueno. Las congela `fn_congelar_cabecera_sellada()` en
  cuanto existe la versión 1. La cabecera sigue siendo mutable **para el borrador**.
- **En un índice único, dos nulos NO chocan salvo con `nulls not distinct`.** La ventana
  de acceso `(desbloqueo_id, paciente_id, pestana)` con `pestana` nulable dejaba entrar
  dos filas por dos `insert ... on conflict do nothing`, y rompía «una apertura, N vistas»
  justo en `exportacion`, `informe` y `emergencia`, que son los accesos sin pestaña.

### Fusionar pacientes ahora puede dar interbloqueo — el importador debe reintentar

Modo de fallo **nuevo**, introducido al cerrar la carrera de fusión de T-001. El
disparador `fn_normalizar_fusion_paciente()` toma `for no key update` sobre la fila
destino, y el propio `UPDATE` toma el mismo bloqueo sobre la fila que se fusiona. Dos
fusiones cruzadas simultáneas —`A→B` y `B→A`— los piden en orden opuesto:

```
ERROR: deadlock detected
CONTEXT: while locking tuple (0,42) in relation "pacientes"
```

**Es el precio correcto**: aborta en vez de corromper. Pero antes no existía, y el error
que ve quien lo provoca es `40P01`, **no** el mensaje del ADR-031. Dos consecuencias que
hay que recoger cuando llegue su ticket:

- **El importador de fase 1 fusiona en lote y tiene que reintentar** ante `40P01`. Sin
  reintento, una importación grande fallará a medias sin motivo aparente.
- Mientras una fusión está abierta, cualquier `UPDATE` de la ficha superviviente —editar
  el nombre, asignar centro— **espera al commit**. Las fusiones son transacciones cortas,
  así que la contención es menor; queda escrito para que no sorprenda.

*Por qué `for no key update` y no `for update`*: `for update` conflictúa con el
`for key share` que toman las comprobaciones de clave ajena, así que cada fusión abierta
habría bloqueado el alta de notas, episodios y accesos de ese paciente. `for no key
update` conflictúa exactamente con lo que hay que serializar y con nada más.

### El suelo de retención es el estatal, no el autonómico

`politicas_retencion` lleva `check (anios_minimo_legal >= 5)`, que es el mínimo del
art. 17.1. **Una CCAA con quince años —Cataluña— sigue pudiendo configurarse a cinco**:
la base no lo impide porque el suelo autonómico es **dato, no esquema**.
`centros.provincia` existe precisamente para resolverlo. Va al ticket de ajustes, no a
una migración.

### Índices de claves ajenas: lo hecho y lo pendiente

T-001 crea los **siete** que muerden ya, por ser los que T-002 va a poner en el `using` de
una política —una política sin índice detrás es un recorrido secuencial **por fila**— más
el de la fusión: `episodios_asistenciales.profesional_id`,
`episodio_participantes.paciente_id`, `notas_clinicas.autor_id`, `notas_clinicas.episodio_id`,
`pacientes.fusionado_en` (parcial, y es el que evita que `fn_repuntar_fusionados()` recorra
la tabla entera en cada fusión), `pacientes.centro_id` y `perfiles.centro_id`.

**Las ~23 claves ajenas restantes siguen sin índice, a propósito**: son columnas de autoría
y trazabilidad (`creado_por`, `valorado_por`, `diagnosticado_por`, `subido_por`,
`actualizado_por`, `traspasado_a`, `fusionado_por`…) por las que todavía no filtra ninguna
consulta, y un índice que nadie usa solo encarece cada escritura. Se añaden cuando exista
la consulta que los justifique — y la que primero aparecerá es la de «qué firmó este
profesional» cuando entren las firmas de fase 1.

### `pacientes.centro_id` nace nulo: T-002 necesita relleno

La columna se añadió nulable (regla de forma: nada `not null` sin `default`, para no romper
el alta de T-000) y `crearPaciente` no la escribe, así que **hoy todos los pacientes tienen
`centro_id` nulo** (verificado: `pacientes_totales = 2, con_centro = 0`). Criterio de
relleno acordado para T-002, en este orden:

1. Si el `profesional_id` del paciente tiene `centro_id`, ese.
2. Si no, el único centro activo, cuando solo haya uno.
3. Si hay varios y no se puede decidir, **se deja nulo y se resuelve como «toda la
   organización»** en la política. Nunca se inventa un centro: un `centro_id` equivocado
   acota mal al técnico administrativo, que es exactamente el rol que ese campo gobierna.

El relleno va en la migración de T-002, no en la aplicación, y después la columna se puede
volver obligatoria para las altas nuevas si el ticket lo pide.

### Fuera del alcance de T-001, para cuando llegue su fase

- **Catálogo precargado de CIE-10-ES**: `diagnosticos` tiene las columnas, pero el
  catálogo no entra en fase 0. Es del ticket de historia clínica de fase 1.
- **Bucket de Storage y sus políticas**: `evaluacion_archivos.ruta` e `informes`,
  `consentimientos`, `representantes_paciente` guardan rutas, pero **T-001 no crea ningún
  bucket ni ninguna política de Storage**. Queda para el ticket de documentos.
- **`dni_indice` único frente al importador**: dos fichas del mismo paciente no pueden
  tener ambas identificación con el mismo documento (consecuencia aceptada del ADR-029).
  El importador de v1 se topará con ello el primer día; la salida es fusionar (ADR-031).
- **Punto abierto (d) del diseño de T-001**: `consentimiento_firmantes` y
  `accesos_historia_vistas` están aprobadas y **hay que subirlas a `docs/architecture.md`
  §Dominios de datos** al cerrar el ticket.
