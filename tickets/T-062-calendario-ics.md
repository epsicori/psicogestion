---
id: T-062
titulo: Calendario del profesional en su móvil. Suscripción .ics de solo lectura con un código propio, revocable, sin datos del paciente
modelo: opus
riesgo: alto            # ruta pública con código, función security definer para anon (T-062a); T-062b es interfaz, riesgo medio
fase: 2
prioridad: alta         # etapa 2 de docs/plan-puesta-en-marcha.md (calendario: 09-11 a 29-11)
depende_de: [T-058]     # solo por el orden de migraciones: la de T-058 es 20261021120000
estado: pendiente
delegable: parcial      # solo en T-062b: textos de i18n (diseño §7)
partido_en: [T-062a, T-062b]   # propuesta del arquitecto; ver «Partición»
territorio:
  # T-062a
  - supabase/migrations/20261022120000_calendario_ics.sql
  - scripts/rls/40-calendario-ics.sql
  - scripts/rls/README.md                       # fila del módulo 40 y su ancla Y+18
  - lib/supabase/tipos-bd.ts                    # se regenera (tabla y cuatro funciones nuevas)
  - lib/supabase/anonimo.ts                     # cliente con la clave anónima, sin sesión, solo servidor
  - lib/agenda/ics.ts                           # serializador puro RFC 5545
  - lib/agenda/ics.test.ts
  - lib/citas/calendario-ics.ts                 # lector de calendario_ics, con Zod estricto
  - lib/citas/calendario-ics.test.ts
  - app/api/calendario/[archivo]/route.ts
  - app/api/calendario/[archivo]/route.test.ts
  - proxy.ts                                    # /api/calendario entra en RUTAS_PUBLICAS
  - next.config.ts                              # el registro de peticiones de desarrollo ignora /api/calendario/
  - lib/i18n/es.ts                              # claves calendario.ics.* (T-062a) y cuenta.calendario.* (T-062b)
  - tickets/T-062/mutantes.json
  - tickets/T-062/mutantes/
  # T-062b
  - lib/cuentas/calendario.ts                   # crear, revocar y leer la suscripción propia
  - lib/cuentas/calendario.test.ts
  - app/(app)/cuenta/page.tsx
  - app/(app)/cuenta/calendario.tsx             # sección «Calendario en el móvil» (cliente)
  - app/(app)/cuenta/calendario.test.tsx
  - app/(app)/cuenta/acciones.ts
  - app/(app)/cuenta/acciones-calendario.test.ts
  - app/(app)/cuenta/ids.ts                     # ids de encabezados y regiones de la sección nueva
  # los dos
  - docs/architecture.md                        # fila «Calendario del móvil» de la matriz y la ruta pública
  - docs/interfaz.md                            # Mi cuenta › Calendario en el móvil (T-062b)
  - docs/bitacora/T-062a.md
  - docs/bitacora/T-062b.md
  - docs/state.md
---

# Contexto

En la entrevista del 16-10-2026 (`docs/plan-puesta-en-marcha.md`, fila T-062) el propietario pidió que cada profesional vea **sus citas en el calendario del móvil** (Google, Apple, Outlook) sin abrir la app. El alcance quedó cerrado así:

- Cada evento dice solo **«Cita · centro · modalidad»** y lleva un enlace al día de la agenda, que pide sesión para abrirse.
- **Nunca** van en el evento el nombre ni las iniciales del paciente, el tipo de terapia, el número de asistentes, notas, motivo, teléfono ni el id de la cita.
- El enlace es un **código aleatorio largo**. La base guarda solo su huella.
- En **«Mi cuenta»** se crea el enlace, se copia, se ve el último acceso y se revoca. La **baja** del profesional lo revoca sola.
- Solo el propio profesional. Ventana de **−30 a +90 días**. Las citas anuladas desaparecen.
- El código **no queda en los registros del servidor**, hay **límite de peticiones**, y el alta y la revocación quedan en la **auditoría**.
- El envío inmediato por la API de Google queda para «Después».

Un calendario de suscripción lo descarga un servidor de Google o de Apple cada pocas horas, **sin sesión**. Por eso la ruta es pública y el código de la URL es la única credencial. Hoy no hay ninguna ruta pública que lea datos: la única es `/api/facturacion/drenar`, con un secreto de servidor. Este ticket abre la primera, y por eso es de riesgo alto.

**Residuo aceptado en el plan.** Si el enlace se filtra, se ve el horario del profesional (centro, modalidad, horas), que es dato suyo, hasta que lo revoque. Ningún dato del paciente viaja.

# Partición (propuesta del arquitecto)

| Parte | Qué | Riesgo | Depende de |
|---|---|---|---|
| **T-062a** | Migración (tabla, cuatro funciones, disparador de baja), banco 40, mutantes, cliente anónimo, serializador .ics, lector, ruta pública, proxy | alto | T-058 (orden de migraciones) |
| **T-062b** | Sección «Calendario en el móvil» de Mi cuenta: crear, copiar, último acceso, revocar | medio | T-062a |

Si se aprueba, cada parte es un ticket: el orquestador copia este contrato a `T-062a-…md` y `T-062b-…md`, cada uno con sus tareas, criterios y territorio, sin tocar el diseño. Las dos tocan `lib/i18n/es.ts` con claves de prefijo distinto y van en serie.

# Tareas

## T-062a
- [ ] Migración `20261022120000_calendario_ics.sql` (diseño §1.A.1):
  - tabla `suscripciones_calendario` con RLS activa, **sin políticas** y sin privilegios para ningún rol de la API; una sola activa por perfil;
  - `calendario_crear_suscripcion()`, `calendario_revocar_suscripcion()` y `calendario_mi_suscripcion()` para `authenticated`;
  - `calendario_ics(p_codigo)` **solo para `anon`**, que nunca lanza con un código inválido, aplica el límite y devuelve solo las claves del diseño;
  - `calendario_eventos_ventana(...)` interna, sin permisos;
  - disparador que revoca la suscripción cuando el perfil pasa a `baja`;
  - auditoría `INSERT`/`UPDATE` con `tabla = 'suscripciones_calendario'`, sin la huella ni la sal.
- [ ] Banco `scripts/rls/40-calendario-ics.sql`, su fila en el README con el ancla **Y+18**, y `tickets/T-062/mutantes.json` con sus SQL.
- [ ] `lib/supabase/anonimo.ts`, `lib/agenda/ics.ts` (puro), `lib/citas/calendario-ics.ts` y la ruta `app/api/calendario/[archivo]/route.ts`, con sus pruebas.
- [ ] `proxy.ts`: `/api/calendario` pública. `next.config.ts`: el registro de peticiones de desarrollo la ignora.
- [ ] `npm run tipos`. Fila en la matriz de `docs/architecture.md`. Bitácora y `state.md`.

## T-062b
- [ ] `lib/cuentas/calendario.ts` y tres acciones en `app/(app)/cuenta/acciones.ts` (crear, revocar, y la lectura en el Server Component).
- [ ] Sección «Calendario en el móvil» en `/cuenta` (diseño §1.B): sin enlace, enlace recién creado (se muestra una sola vez, con «Copiar»), enlace activo con «Activo desde» y «Último acceso», «Revocar» y «Crear otro» con confirmación. El técnico no la ve.
- [ ] `docs/interfaz.md`, bitácora y `state.md`.

# Criterios de aceptación (verificables)

## T-062a
- [ ] **Automático.** `npm run test:rls` sale con exit 0 sobre `npx supabase db reset`, con `max(version)` = `20261022120000`, y el banco 40 está dentro. Lo pega el verificador.
- [ ] **Automático, banco sobre la base sembrada.** `npm run seed` y después `npm run test:rls`: exit 0.
- [ ] **Automático, mutantes.** `tickets/T-062/mutantes.json` lleva al menos los diecinueve del diseño §1.A.5, todos muertos, medidos en `begin … rollback` y con la aserción en la que cae cada uno.
- [ ] **Automático, el banco 40 demuestra:**
  - el código sale una vez, tiene 43 caracteres y **no aparece** en ninguna columna de `suscripciones_calendario` ni de `auditoria`;
  - `anon` y `authenticated` no leen ni escriben la tabla (42501), y `authenticated` no ejecuta `calendario_ics` (42501);
  - el técnico no crea enlace (42501), y nadie revoca ni lee el de otro;
  - un código inválido, revocado, de un perfil suspendido o de baja devuelve `no_encontrado`, sin lanzar;
  - la baja (por `dar_de_baja_perfil` y por un `update` directo) revoca con motivo `baja` y deja su fila de auditoría;
  - cada evento tiene **exactamente** las claves `uid, inicio, fin, fecha_local, centro, modalidad`, y en el resultado no aparecen el id de la cita, el nombre del paciente, el tipo de terapia, la sala ni la nota operativa;
  - la ventana: en los bordes −30 días (dentro) y +90 días (fuera), y las canceladas fuera;
  - la petición 61 de la misma hora devuelve `limite`, y la ventana se reinicia al cumplirse la hora.
- [ ] **Automático.** `npx vitest run lib/agenda/ics.test.ts lib/citas/calendario-ics.test.ts "app/api/calendario/[archivo]/route.test.ts"` en verde, con estos casos:
  - el serializador: CRLF, plegado a 75 octetos sin partir un carácter UTF-8, escape de `\ ; ,` y saltos de línea, `DTSTART`/`DTEND` en UTC, y ningún `LOCATION`, `ATTENDEE`, `ORGANIZER` ni `CATEGORIES`;
  - el lector rechaza una respuesta con una clave de más;
  - la ruta: 404 sin llamar a la base con un nombre mal formado, 404 con `no_encontrado`, 429 con `Retry-After` con `limite`, 200 `text/calendar` con `Cache-Control: private, no-store`, y **ningún `console.*` recibe el código** en ningún camino, el de error incluido.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit` y `npx next build --webpack`. `npm run verificar:huellas` dice «cadena íntegra».
- [ ] **QA visible (verificador).** Con un código creado por SQL como Ana (receta en la bitácora):
  - `curl -i http://localhost:3000/api/calendario/<codigo>.ics` da 200 y un VCALENDAR cuyos eventos dicen «Cita · Centro … · Presencial|Online», sin ningún nombre de paciente de la siembra (`grep` de los apellidos sembrados: cero líneas);
  - el enlace `URL:` de un evento, abierto en el navegador visible **sin sesión**, lleva a `/login`; con sesión de Ana, a la semana de ese día en la agenda;
  - un código con una letra cambiada da 404, y la salida de `npm run dev` no contiene el código (lo pega el verificador);
  - capturas en `.claude/qa/visitas/T-062a/`.

## T-062b
- [ ] **Automático.** Pruebas de componente y de acción en verde:
  - «Crear enlace» muestra la URL en una región con nombre que recibe el foco, y «Copiar» anuncia el resultado en una región `role="status"`;
  - «Revocar» y «Crear otro» piden confirmación en un diálogo; Escape lo cierra y el foco vuelve al botón;
  - tras recargar, la URL no vuelve a aparecer: solo «Activo desde» y «Último acceso»;
  - la acción no acepta un `perfil_id` ni ningún otro campo del cliente;
  - para el técnico, la sección no se pinta.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run test:rls` (no cambia nada en la base).
- [ ] **QA visible (verificador, navegador a la vista).** Capturas a 1280 y 360 px en `.claude/qa/visitas/T-062b/`, con `qa.mjs visita /cuenta`.
  - **Como Ana:** crea el enlace, lo copia, abre la URL copiada y recibe el .ics; recarga y ve «Último acceso» con la hora de esa descarga; revoca, y la misma URL da 404.
  - **Como Ana, «Crear otro»:** la URL anterior da 404 y la nueva, 200.
  - **Como técnico:** `/cuenta` no enseña la sección.
  - Sin errores de consola, sin desplazamiento horizontal a 360 px (la URL larga se parte o se desplaza dentro de su campo) y con el foco visible en cada paso.

# Notas para el agente

- **El código es la credencial.** Nunca se escribe en un `console.*`, en un mensaje de error, en la auditoría ni en una columna. La ruta no registra `request.url` ni el error capturado: `console.error('[calendario] ics', 'fallo')`, como `app/api/facturacion/drenar/route.ts`.
- **Sin la clave de servicio.** La ruta usa la clave anónima (`lib/supabase/anonimo.ts`) y la única puerta es `calendario_ics`, con `grant` solo a `anon`. Ver la decisión D2 del diseño.
- **El id de la cita no sale.** El `UID` del evento es un HMAC del id con una sal propia de cada suscripción, que nunca sale de la base.
- **Next.js 16:** lee `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` y `.../03-file-conventions/route.md` antes de escribir la ruta. `await connection()` primero; `RouteContext<'/api/calendario/[archivo]'>`.
- **Revoca los privilegios por defecto** de Supabase en la tabla y en cada función nueva, e inspecciona con `\dp` y `\df+` (`.claude/rules/supabase.md`).
- La migración **no toca** `auditoria_operacion_check` ni `dar_de_baja_perfil`: T-058 puede estar redefiniendo el primero en paralelo.

# Preguntas abiertas al propietario (con recomendación)

1. **¿El director sanitario también puede tener su enlace?** El plan dice «solo el propio profesional, sin enlace para administrador ni técnico». Pero desde ADR-065 el director sanitario tiene el rol `administrador` y pasa consulta con citas propias: con la regla literal, quien dirige y atiende pacientes se queda sin calendario. *Recomendación: pueden crear enlace los dos roles que pueden tener citas (profesional sanitario y administrador), cada uno solo con sus propias citas. El técnico, nunca. Nadie crea, ve ni revoca el enlace de otro: el administrador no tiene ningún poder sobre el enlace ajeno.* Un director solo administrativo no tiene citas y su enlace saldría vacío. Si la respuesta es «no», el diseño cambia una línea (la guarda de rol de `calendario_crear_suscripcion`) y dos aserciones del banco.
2. **El código pasa por el registro de peticiones de Vercel.** Vercel guarda la ruta completa de cada petición (1 h en Hobby, 24 h en Pro, 30 días con Observability Plus) y no tiene forma documentada de redactarla. *Recomendación: aceptarlo.* Vercel ya es encargado del tratamiento. La app no escribe el código en ningún registro propio, ni en desarrollo. La base guarda solo la huella, y el código viaja a Supabase en el cuerpo de un POST. Queda como nota para T-054: no activar Observability Plus ni drenajes de registros sin redactar `/api/calendario/`. Si no se acepta, no hay salida dentro de este ticket: haría falta servir la ruta desde fuera de Vercel o detrás de un proxy propio que no registre rutas.
3. **¿Crear el enlace pide el código de la aplicación (TOTP), o manda un aviso de seguridad?** *Recomendación: ninguna de las dos en este ticket.* El alta queda en la auditoría y en Mi cuenta se ve si hay enlace y cuándo se usó por última vez. El enlace no da acceso a nada clínico.
4. **¿Un límite de peticiones por IP para los códigos inválidos?** *Recomendación: no.* Adivinar un código de 256 bits es inviable. El límite que se pide es por enlace, 60 peticiones por hora, y está en la base. Si aun así se quiere, es una regla del cortafuegos de Vercel y se anota en T-054.
5. **¿Qué citas salen?** *Recomendación: todas las del profesional salvo las anuladas (`cancelada`), también las realizadas y las de «no asistió», con el mismo texto.* El enlace del evento abre la semana de ese día con «todos los centros», para no mandar el id de un centro a Google.

# Lo que no entra, y por qué

- **El envío inmediato por la API de Google**: queda para «Después» en el plan. Con suscripción, Google refresca cuando quiere (horas).
- **La sala, la dirección (`LOCATION`) y los coterapeutas o participantes**: no están en el alcance cerrado del plan, y cada uno es un dato más fuera de la app.
- **Ausencias, festivos y franjas en el feed**: el plan habla de citas.
- **Un enlace `webcal://`**: la URL `https://` sirve en Google y en Apple. Un segundo formato es un segundo sitio donde el código se copia.
- **Auditar cada descarga**: con 60 por hora llenaría la auditoría. `ultimo_acceso_en` es el rastro visible que pide el plan.
- **Varios enlaces activos por persona** (uno por dispositivo): una sola suscripción activa basta para el caso y hace la revocación inequívoca.
