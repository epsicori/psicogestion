---
id: T-058
titulo: Recordatorios por wa.me. Lista diaria de citas por recordar y botón en la cita; dos enlaces de un solo uso, «Confirmo» y «No puedo ir», a una ruta pública sin sesión
modelo: opus
riesgo: alto            # ruta pública sin sesión, tokens, RLS y escritura de citas por service_role (T-058a); T-058b es interfaz, riesgo medio
fase: 2
prioridad: alta         # etapa 2 de docs/plan-puesta-en-marcha.md: pieza del primer día
depende_de: [T-053]     # solo por el orden de migraciones (T-053 = 20261018120000). De T-055 y T-056 no usa nada: su migración va detrás de 20261020120000 solo por número
estado: pendiente
delegable: parcial      # solo en T-058b: textos de i18n y la tabla de pintura de la lista (diseño §7)
partido_en: [T-058a, T-058b]   # propuesta del arquitecto; ver «Partición»
territorio:
  # T-058a
  - supabase/migrations/20261021120000_recordatorios_wame.sql
  - supabase/seed-completo.sql                  # teléfonos inventados y tres citas cercanas
  - scripts/rls/39-recordatorios.sql
  - scripts/rls/11-cobertura.sql                # la política nueva de envios_mensaje
  - scripts/rls/README.md                       # fila del módulo 39 y su ancla Y+17
  - lib/supabase/tipos-bd.ts                    # se regenera
  - lib/agenda/recordatorio-mensaje.ts          # pura: texto y URL de wa.me
  - lib/agenda/recordatorio-mensaje.test.ts
  - lib/agenda/recordatorios.ts                 # pura: fila → sección de la lista
  - lib/agenda/recordatorios.test.ts
  - lib/citas/recordatorios.ts                  # servidor: token, huella, RPC, composición
  - lib/citas/recordatorios.test.ts
  - app/r/                                      # la ruta pública: page, layout, cliente y acciones
  - proxy.ts                                    # '/r' en RUTAS_PUBLICAS
  - .env.example                                # ORIGEN_PUBLICO
  - tickets/T-058/mutantes.json
  - tickets/T-058/mutantes/
  # T-058b
  - app/(app)/agenda/recordatorios/             # la lista diaria
  - app/(app)/agenda/recordatorio-de-cita.tsx   # el bloque del panel de la cita
  - app/(app)/agenda/recordatorio-de-cita.test.tsx
  - app/(app)/agenda/acciones-recordatorio.ts
  - app/(app)/agenda/acciones-recordatorio.test.ts
  - app/(app)/agenda/panel-cita.tsx             # monta el bloque
  - app/(app)/agenda/page.tsx                   # el enlace «Recordatorios» junto a «Nueva cita»
  - app/(app)/cuenta/                           # la antelación de cada profesional
  - lib/i18n/es.ts
  # los dos
  - docs/architecture.md                        # filas «Recordatorios» y «Ruta pública /r» de la matriz
  - docs/interfaz.md
  - docs/bitacora/T-058a.md
  - docs/bitacora/T-058b.md
  - docs/state.md
---

# Contexto

En la entrevista del 16-10-2026 (`docs/plan-puesta-en-marcha.md`) el propietario contó que hoy los recordatorios se mandan a mano por WhatsApp, y decidió:

- La app tendrá una **lista diaria** de las citas por recordar y **un botón en cada cita**.
- Por defecto, **48 h antes**. La antelación la elige **cada profesional**.
- Cada mensaje lleva **dos enlaces de un solo uso**: «Confirmo» y «No puedo ir».

**Decisión del propietario (17-10-2026).** El recordatorio se ofrece a **todos** los pacientes con teléfono. No se exige la autorización de WhatsApp del consentimiento. Ese dato no existe hoy en la app (ninguna tabla ni columna lo guarda), así que no se modela ni se avisa de él.

Lo que ya está cerrado y este ticket no reabre:

- **wa.me no es una API** (decisión fundacional 11, ADR-023). La app redacta el texto y la URL `https://wa.me/<teléfono>?text=…`. Una persona pulsa y envía desde su WhatsApp. La app nunca habla con Meta y no hay encargado del tratamiento nuevo.
- **No hay estado de entrega.** La app sabe que alguien preparó el mensaje, no que llegó (`docs/architecture.md` §4).
- **Los botones se emulan con enlaces firmados de un solo uso** a una ruta pública sin sesión. Confirman o anulan la cita, caducan al empezar la cita y quedan auditados.
- **El mensaje no lleva datos clínicos**: ni tipo de terapia, ni motivo, ni la palabra «psicología» (documento maestro, recordatorios). Lleva fecha, hora y lugar. El diseño decide no poner el nombre del profesional ni el del paciente (D4); la pregunta 2 lo somete al propietario.
- El teléfono de la ficha ya se guarda en E.164 «porque wa.me no admite espacios» (`20260916120000_alta_de_paciente_completa.sql:33`).

Nada de esto existe hoy: ninguna migración crea tablas de mensajería, `proxy.ts` no tiene más ruta pública que `/login`, `/prototipo` y `/api/facturacion/drenar`, y `docs/interfaz.md:540` lista la mensajería entre lo no dibujado.

# Partición (propuesta del arquitecto)

| Parte | Qué | Riesgo | Depende de |
|---|---|---|---|
| **T-058a** | Migración, RLS, funciones, banco 39, mutantes, las dos funciones puras, el módulo de servidor que fabrica el token, la ruta pública `/r` y `proxy.ts`, siembra | alto | T-053 (orden de migraciones) |
| **T-058b** | La lista diaria `/agenda/recordatorios`, el bloque en el panel de la cita, el enlace desde la agenda y la antelación en `/cuenta` | medio | T-058a |

Si se aprueba, cada parte es un ticket: el orquestador copia este contrato a `T-058a-…md` y `T-058b-…md`, cada uno con sus tareas, criterios y territorio, sin tocar el diseño. T-058a puede ir en paralelo con T-055b y T-056b: no comparten ficheros. Si T-055a o T-056a no han entrado en `main` cuando T-058a empiece, su migración sigue llevando `20261021120000` y el verificador comprueba `max(version)` con las tres ramas ya fusionadas o sin ellas, según el orden real (ver Notas).

# Tareas

## T-058a
- [ ] Migración `20261021120000_recordatorios_wame.sql` (diseño §1.A.1):
  - `preferencias_usuario.antelacion_recordatorio_horas` (24, 48 o 72; 48 por defecto) y la lectora `antelacion_recordatorio(perfil)`;
  - tablas `envios_mensaje` y `enlaces_respuesta`, más el límite de peticiones (`limites_enlace_publico` y su sal);
  - RLS: los envíos se leen con la misma visibilidad que la agenda; los enlaces y el límite no los lee nadie fuera de las funciones;
  - funciones `recordatorios_lista`, `recordatorio_preparar` y `recordatorio_deshacer` (sesión) y `enlace_consultar` y `enlace_responder` (solo `service_role`);
  - auditoría de las tablas nuevas, sin la huella del token.
- [ ] Funciones puras `lib/agenda/recordatorio-mensaje.ts` y `lib/agenda/recordatorios.ts`, con sus pruebas.
- [ ] Módulo de servidor `lib/citas/recordatorios.ts`: crea los dos tokens, manda solo sus huellas a la base y compone texto y URL.
- [ ] Ruta pública `app/r/`: lee el token del fragmento `#`, lo borra de la barra, enseña la cita y un único botón; responder consume el enlace. `'/r'` en `RUTAS_PUBLICAS`. Metadatos neutros.
- [ ] Banco `scripts/rls/39-recordatorios.sql`, su fila en el README, la política en `11-cobertura.sql` y `tickets/T-058/mutantes.json`.
- [ ] Siembra: teléfonos inventados en Carmen y Sofía, y tres citas de Ana por la puerta real: Carmen mañana a las 17:00 y Hugo (sin teléfono) mañana a las 18:00, y Sofía pasado mañana a las 17:00.
- [ ] `npm run tipos`. `ORIGEN_PUBLICO` en `.env.example`. Filas de la matriz en `docs/architecture.md`. Bitácora y `state.md`.

## T-058b
- [ ] `/agenda/recordatorios`: cuatro secciones (Por recordar, Preparados, Respondidos, Sin teléfono). Cada fila: «Preparar mensaje» → vista previa del texto → «Abrir WhatsApp» (enlace `wa.me` en pestaña nueva) y «Deshacer».
- [ ] Bloque «Recordatorio» en el panel de la cita (`panel-cita.tsx`), con los mismos pasos, para cualquier cita futura programada o confirmada.
- [ ] Enlace «Recordatorios» en la cabecera de `/agenda`, para los tres roles.
- [ ] `/cuenta`: «Recordatorios» con la antelación (24, 48 o 72 h), solo para administrador y profesional sanitario.
- [ ] `docs/interfaz.md`, bitácora y `state.md`.

# Criterios de aceptación (verificables)

## T-058a
- [ ] **Automático.** `npm run test:rls` sale con exit 0 sobre `npx supabase db reset`, con `max(version)` = `20261021120000`, y el banco 39 está dentro. Lo pega el verificador.
- [ ] **Automático, banco sobre la base sembrada.** `npm run seed` y después `npm run test:rls`: exit 0.
- [ ] **Automático, mutantes.** `tickets/T-058/mutantes.json` lleva al menos los dieciocho del diseño §1.A.5, todos muertos, medidos en `begin … rollback` y con la aserción en la que cae cada uno.
- [ ] **Automático, el banco 39 demuestra** (cada punto con su gemela positiva):
  - un enlace sirve **una vez**: la segunda respuesta da `usado` y la cita no cambia otra vez;
  - un enlace **caduca** al inicio de la cita (`caduca_en = citas.inicio`), y uno caducado da `caducado`;
  - preparar de nuevo **revoca** los enlaces anteriores sin usar (`no_valido`);
  - una cita **movida o anulada** después de preparar da `cita_cambiada` y no se toca;
  - «Confirmo» pasa `programada → confirmada`; «No puedo ir» pasa a `cancelada` y revoca su hermano;
  - el **límite de peticiones** corta en la petición 31 de la misma IP en la misma ventana, con 30 pasando;
  - `anon` y `authenticated` no ejecutan `enlace_consultar` ni `enlace_responder` ni leen `enlaces_respuesta`, `limites_enlace_publico` ni la sal (42501), y ningún rol del dominio tiene `TRUNCATE`, `TRIGGER` ni `REFERENCES` sobre las tablas nuevas;
  - la **base nunca recibe el token**: solo su huella SHA-256, comprobada con el vector congelado del diseño §1.A.4, igual en SQL y en TypeScript;
  - **ninguna fila de `auditoria`** de las tablas nuevas lleva `token_huella`;
  - preparar: el técnico de otro centro y el profesional ajeno reciben 42501; una cita pasada, empezada, cancelada o sin teléfono, 22023;
  - `recordatorios_lista` devuelve a cada rol exactamente las citas que le devuelve `agenda_citas_rango` en la misma ventana, y `toca_hoy` respeta la antelación de cada profesional.
- [ ] **Automático.** En verde `npx vitest run lib/agenda/recordatorio-mensaje.test.ts lib/agenda/recordatorios.test.ts lib/citas/recordatorios.test.ts app/r`, con estos casos:
  - el texto no contiene «psico» (sin distinguir mayúsculas) en ninguna variante, ni nombre de paciente ni de profesional (la función no los recibe);
  - los `#` y los saltos de línea del texto salen codificados en la URL de wa.me, y decodificarla devuelve el texto exacto;
  - `+34600000001` da `https://wa.me/34600000001?text=…`; un teléfono que no es E.164 lanza;
  - el RPC recibe dos huellas de 64 hexadecimales distintas y **nunca** el token;
  - la página pública borra el fragmento de la barra antes de llamar a la acción, al montarse no responde nada (solo consulta), y ninguna llamada a `console.*` del servidor lleva el token.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit` y `npx next build --webpack`. `npm run verificar:huellas` dice «cadena íntegra».
- [ ] **QA visible (verificador, navegador a la vista).** Capturas a 1280 y 360 px en `.claude/qa/visitas/T-058a/`, con `qa.mjs visita /r`.
  - El verificador prepara un envío con el bloque psql del diseño §3 (tokens `aaa…a` y `bbb…b` sobre la cita sembrada de Carmen de mañana).
  - **Sin sesión**, `/r#aaa…a`: enseña fecha, hora y centro, un único botón «Confirmo»; la barra queda en `/r` sin fragmento; tras pulsar, «Cita confirmada» con el foco en el encabezado; recargar `/r#aaa…a` dice que el enlace ya se usó.
  - `/r#bbb…b` después de confirmar sigue sirviendo y anula; `/r#ccc…c` (inexistente) dice que el enlace no sirve.
  - El título de la pestaña es neutro y el HTML servido de `/r` no contiene «psico» (`curl -s http://localhost:3000/r | grep -ci psico` da 0).
  - Sin errores de consola y con el foco visible.

## T-058b
- [ ] **Automático.** Pruebas de componente y de acción en verde:
  - «Preparar mensaje» enseña la vista previa con el foco en ella, y «Abrir WhatsApp» es un `<a target="_blank" rel="noopener noreferrer">` cuyo `href` es el de la función pura;
  - «Deshacer» devuelve la fila a «Por recordar»;
  - una fila sin teléfono no tiene botón de preparar;
  - la acción de la antelación rechaza un valor que no sea 24, 48 o 72 con el mismo esquema Zod del formulario, y el técnico no ve la sección.
- [ ] **Automático.** En verde: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run test:rls` (no cambia nada en la base).
- [ ] **QA visible (verificador, navegador a la vista).** Capturas a 1280 y 360 px en `.claude/qa/visitas/T-058b/`, con `qa.mjs visita /agenda /agenda/recordatorios /cuenta`.
  - **Como Ana:** la cita de Carmen de mañana está en «Por recordar» y la de Hugo en «Sin teléfono»; «Preparar mensaje» enseña el texto y el enlace «Abrir WhatsApp» apunta a `wa.me/34…` (se comprueba el `href`, no se envía nada); la fila pasa a «Preparados»; abriendo `/r#…` del texto en una ventana sin sesión y pulsando «Confirmo», al recargar la lista la fila está en «Respondidos» y la cita sale confirmada en la agenda.
  - **Como Ana**, en `/cuenta` cambia la antelación a 24 h y la cita de Sofía de pasado mañana deja de estar en «Por recordar».
  - **Como técnico de Madrid:** ve la lista de su centro y prepara un mensaje; `/cuenta` no tiene la sección de recordatorios.
  - Desde el panel de una cita de la semana que viene, el bloque «Recordatorio» prepara el mensaje igual.
  - Sin errores de consola, sin desplazamiento horizontal a 360 px y con el foco visible en cada paso.

# Notas para el agente

- **El token nunca toca la base ni un log.** Viaja en el fragmento (`/r#<token>`), que el navegador no manda al servidor ni en `Referer`. La acción lo recibe en el cuerpo del POST, calcula la huella y solo pasa la huella. Todo `console.*` lleva códigos fijos (`recordatorio: fallo_consulta`), nunca el token, la huella ni la IP. Diseño D2.
- **Abrir la página no consume nada.** Los previsualizadores de enlaces (WhatsApp genera la vista previa) hacen GET sin fragmento y ven una página neutra. Solo el botón (POST) responde.
- **`enlace_consultar` y `enlace_responder` devuelven un resultado, no lanzan.** Si lanzaran, el contador del límite se desharía con la transacción. Diseño D7.
- **Metadatos de `/r`**: el `description` de `app/layout.tsx` dice «consultas de psicología» y los metadatos se fusionan por arriba. `/r` sobrescribe `title`, `description` y `openGraph`, y añade `robots` sin indexar y `referrer: 'no-referrer'`. Diseño §1.A.7.
- **La base no impone las transiciones de estado** de la cita: solo `lib/agenda/estados-cita.ts`. Las funciones nuevas las comprueban a mano (`programada|confirmada` y `inicio > now()`).
- **`proxy.ts`**: `'/r'` va en `RUTAS_PUBLICAS`, que también salta la guardia de primer acceso. La comparación `=== ruta || startsWith(ruta + '/')` no deja colar `/recuperar`.
- **Orden de migraciones.** Antes de verificar, `select max(version) from supabase_migrations.schema_migrations`: un `db reset` desde una rama sin T-055a/T-056a pierde sus migraciones. T-058a no lee nada de ellas.
- Lee `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (sección Security) y `…/03-api-reference/04-functions/generate-metadata.md` (fusión y `referrer`) antes de escribir `app/r/`.

# Preguntas abiertas al propietario (con recomendación)

1. **¿«No puedo ir» anula la cita hasta el último momento?** *Recomendación: sí, hasta la hora de inicio, que es cuando caduca el enlace. Libera el hueco al momento y la lista lo enseña en «Respondidos».* Si quieres un plazo (por ejemplo, que a menos de 24 h el enlace ya no anule y diga «llámanos»), es un cambio pequeño en la función; el cobro por anulación tardía no entra en este ticket.
2. **¿Qué datos lleva el mensaje?** *Recomendación: fecha, hora y el nombre del centro (o «por videollamada» si es online). Ni tu nombre ni el del paciente.* El nombre de un profesional se busca en internet y dice a qué se dedica: en la pantalla bloqueada de un móvil ajeno, eso ya revela que la persona va a terapia. El paciente sabe con quién tiene la cita. **Confírmanos que los nombres de tus centros no llevan «psicología»**: si lo llevan, usamos la localidad.
3. **¿Qué antelaciones puede elegir cada profesional?** *Recomendación: 24, 48 o 72 h, con 48 por defecto.* Una lista cerrada es más fácil de usar y de probar que un número libre.
4. **¿Quién prepara los recordatorios?** *Recomendación: quien ve la cita en la agenda, técnico incluido, porque es tarea de recepción.* El técnico solo ve el teléfono de los pacientes de sus centros; si una cita suya es de un paciente de otro centro, sale en «Sin teléfono».
5. **¿A qué teléfono va el recordatorio de un menor?** *Recomendación: al de su ficha, como el de cualquiera. Si la ficha del menor no tiene teléfono, sale en «Sin teléfono» y se llama al tutor.* Elegir el teléfono del tutor automáticamente es otro ticket.
6. **Dominio y perfil de WhatsApp (no es una pregunta, es un recordatorio).** La dirección de los enlaces aparece en el mensaje: el dominio que elijas en T-054 no debería contener «psico». Y el nombre público del perfil de WhatsApp desde el que se envía, mejor neutro (lo recomienda el documento maestro). Lo segundo lo cambias tú en el móvil.

# Lo que no entra, y por qué

- **Autorización de WhatsApp del consentimiento**: decisión del propietario del 17-10; el dato no existe en la app. Si un ticket futuro digitaliza el consentimiento con esa casilla, podrá añadir un aviso informativo (no bloqueante) en la fila.
- **Envío automático, estado de entrega, respuestas de texto**: wa.me no es una API (ADR-023).
- **Plantillas editables** (`plantillas_mensaje`) y la tabla `respuestas_mensaje` del documento maestro: un único texto fijo cubre la decisión; la respuesta vive en el propio envío.
- **Reprogramar desde el enlace** o «solicitar cambio»: el plan dice confirmar o anular.
- **Avisos al profesional cuando un paciente anula**: la lista y la agenda ya lo enseñan.
- **Otros canales** (SMS, correo) y recordatorios de algo que no sea una cita.
