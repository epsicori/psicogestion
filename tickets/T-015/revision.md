**Sin ningún hallazgo ALTA en la ronda 2** (combinado A+B: 0 ALTA, 0 MEDIA, 9 BAJA).

# Revisión T-015 · ronda 1

## Revisor B · interfaz y accesibilidad

Ronda 1 · commit `1faf4c4` (diff `main...1faf4c4`, base `431ee1b`). Revisor B: 0 ALTA, 4 MEDIA, 4 BAJA. Mediciones en una copia (`git archive` + junction), sin tocar la base.

### MEDIA

**B-H1 · `components/armazon/armazon.tsx:207` (y `lib/citas/avisos.ts:29`).** Las sesiones de la franja y del ancla son una foto del layout. Ese layout no se repinta al navegar en el cliente (`03-layouts-and-pages.md:43`: «layouts … do not rerender»). Además, las acciones de agenda (`acciones.ts:95,159,170`) revalidan solo `/agenda`. El riesgo 1 del diseño dice que «lo único que se queda atrás son los números», y es falso: el reloj del cliente solo recorre la lista que bajó en el último pintado completo.
- *Escenario 1:* la profesional carga la app a las 08:00 y trabaja navegando entre Agenda y Pacientes. A las 09:00 la secretaria le da una cita a las 10:00, o ella misma reprograma una a las 10:00. A las 10:00 no aparecen ni franja ni ancla.
- *Escenario 2:* carga a las 07:30 y no hace ninguna recarga completa. Con el horizonte de 12 h, la sesión de las 20:00 nunca avisa.

El aviso principal del ticket falla en silencio, sin error.

**B-H2 · `components/armazon/aviso-sesion.tsx:115`, `components/armazon/campana.tsx:77` y `:86`.** Las tres transiciones asíncronas esperan una Server Action sin `try/catch`. Si la acción rechaza, el error sube a la frontera más cercana, y `app/` no tiene ningún `error.tsx` ni `global-error.tsx`.
- *Escenario:* la wifi cae y la profesional pulsa «Descartar aviso» o «Marcar como leída». La Server Action rechaza (`TypeError: Failed to fetch`) y toda la aplicación se sustituye por la pantalla de error de Next, con la nota que estuviera escribiendo debajo.
- *Medido:* con un mock que rechaza y una frontera de prueba, en los dos casos `frontera=true` y `contenido=false`.

Lo agrava que estos controles estén en el armazón: están en todas las páginas.

**B-H3 · `components/armazon/campana.tsx:53-58` (y `:119-123`).** El botón «Marcar como leída» que tiene el foco se desmonta al marcar, porque solo se pinta si `!leida`. El foco cae al `body` con el panel aún abierto. «Marcar todas» se desmonta igual (`sinLeer > 0`).
- *Escenario:* con teclado, abrir la campana, tabular hasta la primera notificación y pulsar Intro. `document.activeElement` pasa a ser `BODY` con el diálogo abierto (medido en jsdom). El lector no anuncia nada, y el siguiente Tab sale del principio del documento, no del panel.

Es el patrón «foco a la que se oculta» que la campana tenía que evitar (diseño §5, «foco»).

**B-H4 · `app/(app)/agenda/resolver-alerta.tsx:28`.** `disabled={pendiente}` se pone sobre el botón que tiene el foco.
- *Escenario 1, medido en Chromium con `page.setContent`:* al deshabilitarse el botón enfocado, el foco pasa a `BODY` y se queda allí al rehabilitarse; el siguiente Tab sale del principio del documento.
- *Escenario 2, éxito:* con teclado, Intro en «Marcar como resuelta: …». El foco cae al `body` y la fila desaparece tras `revalidatePath`, sin anuncio de éxito. El usuario no sabe si se resolvió.
- *Escenario 3, fallo:* el texto de error se anuncia, pero el foco ya no está en el panel.
- *Escenario 4, segundo fallo idéntico:* el `role="status"` mantiene el mismo texto y no vuelve a anunciar nada.

### BAJA

**B-H5 · `components/armazon/campana.tsx:79` y `:88`.** La reversión ante `ok:false` no tiene prueba y es muda.
- *Mutante:* quitar las dos reversiones. Sigue verde, 41/41 en `components/armazon`, porque `campana.test.tsx` solo simula `{ ok: true }`.
- *Escenario:* la acción devuelve `ok:false`. La notificación vuelve a «no leída» sin ningún mensaje. Medido: 0 `status` y 0 `alert` en el panel. Quien la marcó cree que el clic no respondió.

**B-H6 · `accesibilidad/avisos.spec.ts:53`.** La spec nunca pinta la franja con contenido. Comprueba la región vacía, aunque el diseño (§1.9 y C9, `diseno.md:634,677`) pide revisar «con la franja a 360 px». La ausencia de axe está declarada; esta no.
- *Escenario:* una franja con nombre largo, botón «Notas» y «Descartar aviso» que desborde a 360 px, o con un ascendente `sticky`. La spec sigue verde, porque mide `scrollWidth` y `position` sobre un `div` vacío.

**B-H7 · `tickets/T-015-avisos-sesion-y-escalado.md:9` (contexto, no está en el diff).** `territorio.mjs` no ve el territorio de T-015. La línea `territorio:   # del diseño §6 …` lleva un comentario, y la expresión `^territorio:[ \t]*\r?\n` no lo admite, así que responde «sin territorio declarado, nada que comprobar» y sale con 0.
- *Escenario:* la rama toca `components/armazon/aviso-notas.test.tsx` y `lib/citas/agenda.test.ts`, que no están en la lista, y el gate da verde. Cualquier otro fichero ajeno pasaría igual.
- Los dos ficheros están justificados: la prueba del componente nuevo y el renombrado tabla → vista forzado por `agenda.ts`. Pero no constan en `state.md`.
- Tocar `docs/state.md` sí es correcto: está en el territorio y lo exige la regla 4.

**B-H8 · `docs/state.md:6` y `:67`.** La reescritura de `state.md` se quedó a medias.
- La línea 6 sigue diciendo «T-015 a medias».
- El hallazgo de la línea 67 («la ficha lee todas las alertas sin mirar el rol (lo cierra T-015)») sigue abierto aunque el diseño lo cierra con la RLS.
- Faltan las notas que el diseño manda dejar ahí:
  - que firmar (T-012) haga `revalidatePath('/', 'layout')`, del riesgo 1;
  - las alertas que no se abren si la cita se marca `realizada` antes de su `fin`, del riesgo 3;
  - el fallo intermitente de `16-series.sql`, que solo está en la bitácora.
- *Escenario:* el siguiente orquestador lee las 80 líneas y no reanuda nada por la línea 6, o reabre lo de la línea 67. Las tres notas se pierden.

### Descartado tras medir

- **Foco inicial de la campana en «Marcar todas».** Medido: al abrir, el foco va al propio `dialog`, no al botón.
- **Reloj que no se reinicia cuando llega un `ahoraServidor` nuevo** (`useInstante` no reinicia `instante`). Medido: con un layout revalidado justo antes del borde, la franja tarda hasta 60 s. La ventana real es la latencia del primer pintado: se descarta por improbable.
- **`halo-estado`** es estático y no anima.
- **Los dos relojes** (ancla y franja) se desfasan como mucho en milisegundos.

## Revisor A · base y servidor

Ronda 1 · commit `1faf4c4` (diff `main...1faf4c4`). Revisor A: 0 ALTA, 3 MEDIA, 3 BAJA. Las comprobaciones contra la base se hicieron dentro de transacciones con `rollback`. Los mutantes se midieron con un guion aparte (`scratchpad/t015-a/mutar.mjs`), que inyecta la función mutada antes de `22-avisos.sql` y corre el banco sin `16-series.sql`, cuya intermitencia ya anota B-H8. El banco base pasa así: «22-avisos: completa».

### MEDIA

**A-H1 · `supabase/migrations/20261006120000_avisos_y_escalado.sql:154-162`.** `fn_proteger_alerta_documentacion` congela nueve columnas, pero no `id`. La concesión de UPDATE de `authenticated` sobre `alertas_documentacion` cubre la tabla entera, `id` incluido, así que el titular puede cambiar la clave primaria de su alerta abierta. Con eso rompe la idempotencia del escalado, que depende de `notificaciones_origen_unico (perfil_id, tipo, origen_tabla, origen_id)` con `origen_id = a.id`.
- *Escenario, medido en la base:* como PRO1, `update alertas_documentacion set id = 'eeeeeeee-…-0001' where id = 'b48d671f-…'` da UPDATE 1. Después, `escalar_notas_pendientes()` devuelve 1, y el administrador recibe una segunda notificación idéntica («Ana Márquez tiene sin firmar la nota de la sesión del 29/09.») con un `origen_id` que ya no apunta a la alerta de la primera.
- Se puede repetir sin límite: cada cambio de id, otro aviso al administrador cada 15 minutos.
- También se pierde la trazabilidad: la notificación anterior apunta a un id que ya no existe.
- La notificación sí congela su `id` (l.31), y la alerta no. E3 no tiene ninguna negativa sobre `id`.

**A-H2 · `supabase/migrations/20261006120000_avisos_y_escalado.sql:167-171` y `:414-418`.** Una cita `realizada` que después se corrige a `no_asistida` (o a `cancelada`) deja abierta su alerta `nota_sin_firmar`, y esa alerta ya no tiene salida.
- La guarda nueva prohíbe cerrarla a mano a todos: profesional y administrador (E2/E8).
- `fn_resolver_alerta_nota_sin_firmar` solo la cierra si se firma una nota de esa cita.
- `escalar_notas_pendientes()` no mira el estado de la cita.
- La corrección está permitida: `fn_proteger_cita_pasada` deja cambiar el estado de una cita pasada, y `esquemaEditarSerie`/`esquemaDesplazarCita` (`lib/citas/esquemas.ts:120,181`) aceptan `no_asistida`.
- *Escenario, medido en la base:* como PRO1, `update citas set estado = 'no_asistida'` sobre la cita realizada de la alerta `b48d671f` funciona. El cierre manual de la alerta lanza 42501 «Una nota pendiente solo se cierra firmando la nota.». Desde ahí:
  - la cabecera cuenta para siempre una nota pendiente de una sesión que no ocurrió;
  - a las 72 h el administrador recibe «X tiene sin firmar la nota de la sesión del …», que es falso y señala al profesional;
  - la única salida es firmar una nota clínica de una sesión que no tuvo lugar, que es justo el registro que no debe existir.
- Antes de T-015 no se escalaba ni se prohibía el cierre manual. El diseño no menciona este caso.

**A-H3 · `scripts/rls/22-avisos.sql:345-353` (E1) frente a la política de `:332` de la migración.** La lectura del técnico es una lista blanca (`tipo = 'consentimiento_pendiente'`), pero E1 solo comprueba que no ve `nota_sin_firmar`. El enum tiene cinco valores (`nota_sin_firmar`, `borrador_abandonado`, `consentimiento_pendiente`, `informe_pendiente`, `evaluacion_sin_corregir`).
- *Mutante medido:* cambiar la política a lista negra (`tipo <> 'nota_sin_firmar'`) da «22-avisos: completa».
- *Escenario:* con esa regresión, el técnico vería en la ficha (`cargarAlertasDeDocumentacion`) los `borrador_abandonado`, `informe_pendiente` y `evaluacion_sin_corregir` del paciente, y el banco seguiría en verde. Es la frontera «quién ve qué» que fijó la decisión del 01-10, y E1 la vigila con un solo valor.

### BAJA

**A-H4 · `scripts/rls/22-avisos.sql:371-382` (E3).** De las nueve columnas congeladas, E3 prueba tres (`referencia_en`, `profesional_id`, `tipo`).
- *Mutante medido:* quitar del disparador `paciente_id`, `centro_id`, `origen_tabla`, `origen_id`, `fecha_referencia` y `creada_en` da «22-avisos: completa».
- *Escenario:* con esa regresión, PRO1 puede reasignar su alerta a otro `paciente_id`, o cambiar `origen_id`, lo que reabre el doble aviso de A-H1 por otra columna, y el banco no lo ve.

**A-H5 · `scripts/rls/22-avisos.sql:168-171` y `:212-227`.** El rol y el estado del administrador designado se prueban con un solo eje cada uno.
- *Mutante M2 medido:* quitar `and p.estado = 'activo'` del validador (migración l.357) da «completa». La única negativa designa a un profesional, que falla por rol, no por estado.
- *Mutante M3 medido:* quitar `p.rol = 'administrador'` del CTE `designado` (l.394) da «completa». (iii) cubre la baja, no el cambio de rol.
- *Escenario:* el designado pasa de administrador a profesional sanitario. El validador no salta, porque solo se dispara con `update of administrador_avisos_id`. Con la regresión M3, los avisos de nivel 3, que llevan nombres de profesionales, le llegarían solo a él, y ningún administrador se enteraría. El banco seguiría verde.

**A-H6 · `supabase/migrations/20261006120000_avisos_y_escalado.sql:417`.** El filtro `a.tipo = 'nota_sin_firmar'` del escalado no tiene prueba.
- *Mutante M1 medido:* quitarlo da «completa». Las tres `consentimiento_pendiente` del banco nacen en `now()` y nunca llegan al nivel 3.
- *Escenario:* con esa regresión, un consentimiento pendiente de hace 4 días generaría «X tiene sin firmar la nota de la sesión del …» al administrador, porque `nivel_nota_pendiente` calcula el nivel de cualquier fila con `referencia_en`, y el banco no lo vería.

### Revisado sin hallazgo

- `lib/supabase/tipos-bd.ts` coincide byte a byte con `supabase gen types --local` (fin de línea normalizado).
- `authenticated` no tiene INSERT sobre `alertas_documentacion`. La vista solo tiene SELECT y está revocada a `service_role`. `escalar_notas_pendientes` está revocada a `authenticated`.
- `zona_horaria_centro` nunca devuelve null (coalesce a `'Europe/Madrid'`): el detalle no sale «del .».
- `agenda_citas_rango` filtra por solape (`inicio < hasta and fin > desde`), así que `leerSesionesPropias` recibe la sesión en curso que empezó antes de `ahora`.
- `fn_proteger_notificacion` congela `id`, título y detalle, y `leida_en` lo fija la base.
- `marcarNotificacionLeida` filtra `.is('leida_en', null)`, así que doble pulsación no da error.

## Ronda 2 · revisor B · interfaz, foco, errores, refresco y accesibilidad (HEAD 16466e3)

**Sin ALTA ni MEDIA de B en esta ronda**: 0 ALTA, 0 MEDIA, 6 BAJA.

### Cierre de B-H1..B-H8 medido con mutantes (copia por git archive de 16466e3, nunca en el worktree)

Línea base de la copia: 11 ficheros, 146/146 en verde. Mutantes de R8, uno a uno, con los fuentes CRLF respetados:

| Hallazgo | Mutante | Resultado |
|---|---|---|
| B-H1 | sin el mínimo de 30 s | MUERE (2: cambio de ruta a los 10 s; vaivenes de la pestaña) |
| B-H1 | `setInterval` de red cada 5 min | MUERE («pasan dos horas sin tocar nada: cero peticiones») |
| B-H1 | aceptar sin `content-type` | MUERE (HTML con 200; 200 sin content-type) |
| B-H1 | `redirect: 'follow'` | MUERE |
| B-H1 | sin `opaqueredirect` ni la comprobación de 200 | MUERE (401, 503, opaqueredirect) |
| B-H1 | refrescar al montar | MUERE (3) |
| B-H1 | sin `enCurso` | MUERE |
| B-H1 | `fresco ?? inicial` (siempre fresco) | MUERE («una foto anterior se ignora») |
| B-H1 | sin `abort` al desmontar | MUERE |
| B-H1 | `combinarAvisos` con `>=` | MUERE |
| B-H1 | sin resincronizar `useInstante` | MUERE (3, incluida «sin avanzar los temporizadores») |
| B-H2/B-H5 | campana: sin `try` en `llamar` / sin reversión de una / sin reversión de todas / sin `key` / sin `unstable_rethrow` / status dentro del panel | MUEREN los seis |
| B-H2/B-H5 | franja: descartar sin `try` / sin `unstable_rethrow` | MUEREN los dos |
| B-H2/B-H5 | resolver: sin `try` / sin `key={estado.intento}` / sin `unstable_rethrow` | MUEREN los tres |
| B-H3 | campana sin el efecto de foco | MUERE (5) |
| B-H3 | campana sin la guarda «foco ya dentro» (:112) | **SOBREVIVE** 26/26 → B2-H1 |
| B-H3 | campana sin `irA(destino)` tras el fallo (:157) | **SOBREVIVE** 26/26 → B2-H1 |
| B-H4 | `disabled` en lugar de `aria-disabled` | MUERE (3) |
| B-H4 | sin `preventDefault` | MUERE |
| B-H4 | sin `alResolver` / sin el foco al grupo | MUEREN los dos |
| B-H4 | proveedor solo en la rama de la lista | MUERE (documentacion.test) |
| B-H6 | `whitespace-nowrap` en el párrafo de la franja | MUERE en Playwright: «el texto desborda su párrafo», 11 > 0. La base da 4/4 en verde (`next build --webpack` en la copia, PUERTO=3331, `--workers=1`) |
| B-H7 | — | ya en el contrato de main |
| B-H8 | (lectura) | **a medias** → B2-H6 |

B-H1, B-H2, B-H4, B-H5 y B-H6 quedan cerrados. B-H3 está cerrado en lo que pedía R8 (nunca `body`), con la guarda nueva sin probar (B2-H1). B-H8, a medias.

Descartado tras mirarlo: el foco del grupo en `ProveedorResolucion` (`resolver-alerta.tsx:49-51`) no tiene guarda de vigencia, así que un éxito tardío robaría el foco. Pero hoy `puedeResolverAlerta` no ofrece el botón para ningún tipo que se genere (solo `nota_sin_firmar`): es inalcanzable y no cuenta. También descartado: `unstable_rethrow` en los tres `catch` es correcto, porque el reductor de Server Actions rechaza la promesa con el redirect y además navega.

### B2-H1 · BAJA · `components/armazon/campana.tsx:112`

La guarda «el foco ya está dentro del panel» (:112) y el reenfoque tras revertir (:157) sobreviven a sus mutantes: campana.test.tsx sigue 26/26 en verde sin ellas, y la prueba «si falla y revierte, el foco no se mueve del destino ya elegido» pasa igual con y sin `irA(destino)`.

**Escenario**: Mutante sin la guarda de :112 (medido: 26/26 verde). Con la red lenta, marcar A deja el foco en el botón de B. La persona tabula al de C o a «Marcar todas», y A falla: `irA(B)` con un `n` nuevo vuelve a ejecutar el efecto y el foco salta a B. Es el robo de foco que el comentario de :105-106 promete evitar, y la batería no lo ve. Falta una prueba con la acción pendiente, el foco movido a C y luego el fallo, que compruebe que el foco sigue en C. Si el reenfoque de :157 no tiene ningún caso en el que el foco se pierda (la lista va con key y conserva el nodo de B), se quita o se anota como defensa sin prueba.

### B2-H2 · BAJA · `components/armazon/avisos-vivos.tsx:105`

`RefrescoPorNavegacion` solo mira `usePathname()`. La agenda, la pantalla principal del profesional, navega por días, semanas, centro y profesional cambiando solo la query (`calendario.tsx:180-209` `<Link href="/agenda?…">`, `:228,240` `router.replace`), así que ahí «navegar» no refresca los avisos. `docs/interfaz.md:61` dice «se refrescan al navegar» sin la salvedad.

**Escenario**: A las 09:52 la secretaria crea a Ana una cita de 10:00 a 10:50. Ana ya estaba en /agenda desde las 09:30, con la foto de las 09:30. A las 10:01 pasa a mañana y vuelve a hoy: dos navegaciones /agenda?fecha=…, el pathname sigue siendo «/agenda», no hay `fetch`. El calendario (la página) sí pinta la cita nueva, pero la cabecera no tiene ni franja ni ancla. Es justo el retraso de R2.3 que el diseño da por cubierto con «vuelve a navegar». Arreglo barato: usar también `useSearchParams` (bajo el mismo Suspense), o escribir la salvedad en interfaz.md y en state.md.

### B2-H3 · BAJA · `components/armazon/armazon.tsx:222`

`cargarAvisos` convierte cada lectura fallida en «no hay nada» (`sesiones ?? []`, recuento 0, `[]`) y la sella con un `ahoraServidor` nuevo. Como `combinarAvisos` da por buena la foto estrictamente más nueva, ese vacío fabricado gana a una foto buena del refresco.

**Escenario**: 10:05: Ana está en sesión y la franja y el ancla salen de una foto buena de `GET /api/avisos`. 10:06: marca una notificación como leída. La acción hace `revalidatePath("/", "layout")`, el layout vuelve a ejecutar `cargarAvisos` y `leerSesionesPropias` da null por un fallo pasajero. El layout entrega `{ahoraServidor: 10:06, sesiones: []}`, `useDatos` → `combinarAvisos(inicial 10:06, fresco 10:05)` elige el vacío y la franja, el ancla y el recuento desaparecen. Hasta la siguiente navegación con pathname distinto pasados 30 s, o una vuelta a la pestaña. El comentario de :220-221 dice que el refresco «conserva lo que tenía», pero el refresco pierde contra el layout. Arreglo: que un null del layout no lleve un instante que gane (por ejemplo, `ahoraServidor` de época cuando falta alguna lectura), con una prueba de `useDatos` o de `combinarAvisos` que lo fije.

### B2-H4 · BAJA · `accesibilidad/avisos.spec.ts:61`

El spec nuevo escribe en la base con `localizarContenedor()`, que devuelve el primer `supabase_db_*` de `docker ps`. El diseño (R0.16) citaba el helper bueno, `contenedorDelProyecto()`, que ya usa `codigos-recuperacion.spec.ts:139` justo por esto (T-037).

**Escenario**: Hoy hay dos stacks en marcha: `supabase_db_Psicogestion` y `supabase_db_cinfa-e2e`. `docker ps` lista primero el más reciente. Basta con volver a levantar cinfa-e2e (o cualquier otro proyecto Supabase) para que el `beforeAll` haga el `do $$ … insert into public.citas` y el `afterAll` el `update … set estado = 'cancelada'` en la base de OTRO proyecto. Si esa base no tiene a Ana, el spec da rojo con «No existe Ana: falta la siembra», que despista. Si tiene el mismo esquema, escribe allí y la prueba de la franja mide la cita que no toca.

### B2-H5 · BAJA · `accesibilidad/avisos.spec.ts:82`

El `beforeAll` no maneja la violación de exclusión `23P01` (`citas_sin_solape_profesional`: programada, confirmada y realizada), aunque R5/B-H6 lo pedía: «escoge otro hueco o usa la que choca». La reutilización exige además `fin > now() + 5 min` y solo mira programada y confirmada.

**Escenario**: Una ejecución se interrumpe (Ctrl+C, o el worker muere antes del `afterAll`) y deja programada la cita de la prueba, de t−1 a t+10. Se vuelve a ejecutar a t+6: la cita no cumple `fin > now()+5min` (t+10 < t+11), así que no se reutiliza. El insert de t+5 a t+16 se solapa con ella → `23P01` → `beforeAll` en rojo hasta t+10. Lo mismo un día laborable si Ana tiene una cita real que empieza en los próximos 10 minutos, o una `realizada` que todavía abarca ahora.

### B2-H6 · BAJA · `docs/state.md:49`

B-H8 está cerrado a medias. Entre las notas de T-015 (:49-51) falta «el retraso de R2.3», que R5/B-H8(c) pedía de forma expresa: las acciones de agenda (`app/(app)/agenda/acciones.ts`) revalidan solo `/agenda`, y una cita creada después de la última navegación no se ve. Además, :6 y :16 citan `d0c1a77` como entrega, y la rama termina en `16466e3`.

**Escenario**: Tras integrar, el siguiente ticket que toque la agenda lee state.md y no sabe que marcar `realizada` desde la agenda deja la cabecera vieja (el recuento de notas no sube) hasta navegar. Es un comportamiento que el diseño decidió anotar y no arreglar; sin la nota, se reabrirá como si fuera un bug nuevo, o se dará por hecho que T-015 lo cubre. Ojo también en el merge: main todavía tiene en :49 el hallazgo «ficha lee alertas sin rol» que la rama cierra, y el conflicto se resuelve a favor de la rama.

## Ronda 2 · revisor A · base, RLS, migración, lectores y GET /api/avisos (HEAD 16466e3)

**Sin ALTA ni MEDIA de A en esta ronda**: 0 ALTA, 0 MEDIA, 3 BAJA.

### Cómo se midió

Banco RLS completo sin `16-series.sql` (ajeno, falla igual en main), concatenado en una sola transacción con `rollback`, y el mutante inyectado justo antes de `22-avisos.sql`. Todo contra `supabase_db_Psicogestion` por nombre, porque hay dos stacks en marcha. La función mutada sale de la migración de la rama sin los `\r`. La base termina con «22-avisos: completa.» y estado 0. Además: `npm run lint:migraciones` da 24 limpias; `supabase gen types --local` coincide byte a byte con `lib/supabase/tipos-bd.ts`; la ronda edita la migración en su sitio, sin migración nueva, y el `drop`/`add` del check de `estado` van en el mismo `alter`.

### Cierre de A-H1..A-H6 y C5 medido con mutantes

| Hallazgo | Mutante | Resultado |
|---|---|---|
| A-H1 / A-H4 | quitar cada una de las 11 columnas congeladas de la guarda | MUEREN los 11, cada uno en su aserción de 22.E3. `anulada_en` muere por el código exacto: sin la columna lanza 23514 (`alertas_documentacion_anulada_check`) en vez de 42501 |
| A-H2 | sin el disparador `anular_alerta_nota_sin_firmar` | MUERE en 22.E9 |
| A-H2 | sin la rama `anulada` de la guarda | MUERE en 22.E10, por 23514 en vez de 42501 |
| A-H2 | `fn_anular_…` en invoker | MUERE en 22.E5 |
| A-H2 | `fn_anular_…` sin `estado = 'abierta'` | MUERE, pero por el `alertas_documentacion_check` en el update de la cita de 22.E12 (:727), no por una aserción → A2-H3 |
| A-H2 | `when` reducido a `new.estado = 'no_asistida'` | **SOBREVIVE** (medido dos veces) → A2-H1 |
| A-H3 | lectura del técnico por lista negra (`tipo <> 'nota_sin_firmar'`) | MUERE en 22.E1 (borrador_abandonado) |
| A-H5 | validador sin `p.estado = 'activo'` / designado sin `p.rol = 'administrador'` | MUEREN en 22.C5 (iv) y (v) |
| A-H6 | escalado sin `a.tipo = 'nota_sin_firmar'` | MUERE (consentimiento de 4 días) |
| C5 | origen `('alertas_documentacion', a.id)` | MUERE en 22.C5 |
| C5 / R0.4 | origen literal `'citas'` en vez de `a.origen_tabla` | **SOBREVIVE** (medido dos veces) → A2-H2 |

Dos mutantes son equivalentes y los descarto:
- `fn_anular_…` sin `tipo = 'nota_sin_firmar'`: hoy solo `nota_sin_firmar` tiene origen `citas`.
- «Una cerrada no se reabre» con `old.estado = 'resuelta'` en vez de `<> 'abierta'`: una `anulada` es siempre `nota_sin_firmar`, y la rama de ese tipo la para antes.

A-H1, A-H3, A-H4, A-H5, A-H6 y C5 quedan cerrados. A-H2 queda cerrado en el código. Lo sondeé en una transacción con `rollback`, con el seed:
- el técnico cancela por `agenda_actualizar_cita` (definer) → la alerta queda `anulada`, con `actor_id` = TEC en `auditoria`;
- PRO1 corrige en directo a `confirmada` → la alerta queda `anulada`.

Pero el banco solo fija la salida a `no_asistida` (A2-H1).

### Lista R9 · Base y Route Handler, punto por punto

- **¿`authenticated` llega a `anulada` por otra puerta?** No.
  - Directa: 22.E10.
  - La política de update pasa por la guarda invoker, y su primera rama es `anulada`.
  - Solo hay dos funciones definer que escriben la tabla: el disparador de anular y `fn_resolver_alerta_nota_sin_firmar`. Esta filtra `estado = 'abierta'` y solo pone `resuelta`.
  - Si firmar y anular van a la vez, se serializan: las dos llevan `where estado = 'abierta'` en READ COMMITTED, así que la segunda vuelve a evaluar y toca 0 filas.
- **¿Algún lector deja de filtrar `estado = 'abierta'`?** No. Lo cumplen `datos.ts:328`, `lib/citas/agenda.ts:225`, `agenda_citas_rango`, `acciones-alertas.ts`, la vista de nivel, el recuento y el escalado.
- **¿Lee `notas_clinicas`?** No.
- **¿El `when` abarca toda salida de `realizada`?** Sí, en el código: `new.estado is distinct from 'realizada'`, y `fn_proteger_cita_pasada` no deja otra salida que el estado. En las pruebas, no: A2-H1.
- **¿`a.origen_tabla, a.origen_id`?** Sí, en el código (:471-472). En las pruebas, no: A2-H2.
- **Regla 6:** nada se borra. `alertas_documentacion` no es una de las cuatro tablas, y la anulación es un `UPDATE` auditado que conserva la fila.
- **Route Handler:**
  - `connection()` va lo primero, sin `use cache`;
  - devuelve 401 `{}` sin usuario y 503 si un lector da null o lanza;
  - lleva `Cache-Control: private, no-store` en las tres salidas y no tiene CORS;
  - no escribe nada;
  - expone lo mismo que `cargarAvisos` del layout;
  - el matcher de `proxy.ts` cubre `/api`, así que también pasa la puerta de primera vez.
- **`lib/citas/avisos.ts`, `lib/agenda/avisos.ts` y sus pruebas:** correctos.
  - Cada lector da null ante su error, y la lista vacía no es null.
  - `combinarAvisos` es estrictamente posterior y un NaN no gana.

Una nota fuera de la rama: en una de las pasadas, el banco cayó en `deadlock detected` antes del módulo 22, en el `alter table notas_clinicas_versiones disable trigger sellar_version_nota`. El log de postgres lo da contra **autovacuum**, no contra el cron de T-015. Es el deadlock intermitente que state.md atribuye a 16-series, pero aquí no estaba 16. Sirve de contexto para A2-H3.

### A2-H1 · BAJA · `scripts/rls/22-avisos.sql:649`

22.E9 y 22.E11 solo corrigen la cita a `no_asistida`. 22.E12 corrige a `cancelada`, pero sobre una alerta ya `resuelta`, que el disparador no toca de todos modos, así que no es gemela. El mutante que reduce el `when` (migración :258) a `new.estado = 'no_asistida'` deja el banco en verde.

Dos fuentes piden más:
- R9 pregunta expresamente si el `when` abarca **toda** salida de `realizada`.
- La tabla del diseño (:1031) enumera cuatro destinos: `no_asistida`, `cancelada`, `programada` y `confirmada`.

**Escenario**: un retoque futuro del disparador lo reduce a `no_asistida`, que es el caso «no vino» con el que se pensó. La secretaria cancela una cita de ayer marcada `realizada` por error, por `agenda_actualizar_cita`. La alerta sigue `abierta`, sin salida, porque solo se cierra firmando y no hay sesión que firmar. Cuenta en la cabecera, sale en la bandeja y, a las 72 h, escala en falso al administrador: es A-H2 otra vez, con el banco en verde.

Falta una gemela de E9 con la alerta abierta y otro destino. Lo mejor sería `cancelada` por `agenda_actualizar_cita` como TEC, que además prueba la puerta definer, y otra a `confirmada`.

### A2-H2 · BAJA · `supabase/migrations/20261006120000_avisos_y_escalado.sql:471`

R9 pide comprobar que el escalado usa `a.origen_tabla, a.origen_id` «y no un literal `'citas'`» (R0.4). El mutante del literal sobrevive porque todas las aserciones de 22.C5 y 22.E11 escalan alertas con origen `citas`, y ahí `a.origen_tabla` y `'citas'` valen lo mismo.

**Escenario**: alguien simplifica a `'citas'`, porque «la nota pendiente siempre es de una cita». La alerta del seed `a0080007-…-03`, con origen `notas_clinicas` (la que R0.4 cita), y cualquier `nota_sin_firmar` futura sin cita escalan con `origen_tabla = 'citas'` y `origen_id` = el id de una nota. La traza de la notificación apunta a una cita que no existe, y la idempotencia por `(perfil, tipo, origen)` queda sobre un origen falso. El banco sigue verde.

Falta una aserción en C5 con una alerta de nivel 3 y origen distinto de `citas`, que compruebe que la notificación lleva ese origen.

### A2-H3 · BAJA · `scripts/rls/22-avisos.sql:758`

La nota de mutantes del banco dice que «sin estado = abierta» en la anulación «lo mata un deadlock del banco (la resolución se bloquea a sí misma)». Lo medí y no hay ningún deadlock. Lo mata `alertas_documentacion_check` (23514) en el `update public.citas set estado = 'cancelada'` de 22.E12 (:727). La anulación pisa la `resuelta` y deja `resuelta_en` no nulo con `estado = 'anulada'`.

Hay además otro desajuste: `scripts/rls/README.md:48` sigue describiendo el 22 con «E1-E7» y «Nueve mutantes anotados». No menciona `anulada` ni E9-E12.

**Escenario**: el banco sí tiene un deadlock intermitente (contra autovacuum, véase arriba). Quien vuelva a medir este mutante con la nota en la mano y vea «deadlock detected» lo dará por muerto, aunque el banco haya caído antes de llegar al 22. Me pasó en esta ronda: un mutante equivalente salió «muerto» por deadlock en la primera pasada y vivo en la segunda.

La nota debe decir quién lo mata de verdad (el check, en E12:727). Y una muerte por deadlock no cuenta como muerte de mutante.
