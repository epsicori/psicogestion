**Sin ningún hallazgo ALTA** (combinado A+B: 0 ALTA, 7 MEDIA, 7 BAJA).

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
