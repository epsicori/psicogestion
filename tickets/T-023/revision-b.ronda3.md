Sin hallazgos ALTA. 0 ALTA, 2 MEDIA, 3 BAJA.

# T-023 · Ronda 3 · Revisor B (cliente, accesibilidad y spec)

Diff revisado: `git diff worktree-agent-a65aa0bb5f872243e..worktree-agent-a875b9deffe28f1da -- . ':!tickets'` (cinco commits, de b86848e a e7c356f). Lo he medido con `git show` sobre la rama. No he ejecutado el spec.

## La lista de «qué revisar» (R3.6, revisor B)

- **Ningún camino del `catch` navega.** Se cumple. `formulario-cobro.tsx:104-108` solo llama a `setMensaje`, `useRouter` ya no se importa y `grep refresh` sale vacío. Queda un hueco: tras el `catch` la lista y la métrica no se actualizan hasta que un reintento salga bien (por el `revalidatePath` de la acción) o hasta la siguiente navegación. Eso alimenta H1.
- **El `id` se renueva tras un éxito y con datos distintos, y en ningún otro caso.** Dentro del formulario montado se cumple (`:88-90`, `:96`):
  - El orden de las claves no importa. `datos` es la salida de Zod, que sigue el orden del `shape` y no el de la entrada, y `JSON.stringify` omite los `undefined` de los opcionales vacíos.
  - Los valores equivalentes cambian la huella. `importe` sale recortado pero sin normalizar, así que `0,01`, `0.01` y `0,010` dan tres `id`. Solo pasa si el usuario vuelve a escribir el importe, cosa que el mensaje le pide no hacer. Pero eso es justo lo que pasa en H1.
  - Hay un caso fuera de la regla: el `id` también muere cuando se desmonta el formulario, y el diálogo lo desmonta al cerrarse. Ver H1.
- **El paso 4 cuenta `+ 1` y no se conforma con «visible».** Sí cuenta (`toHaveCount(antes + 1)` sobre filas filtradas, `spec:182`). La revalidación entrega la lista de golpe, sin pasar por un `+ 1` intermedio, así que M20 (`+ 2`) cae. Pero el paso depende de lo que haya en la base. Ver H2 y H3.
- **El foco tras paginar, en los dos sentidos.** Se cumple: «Siguientes» y «Anteriores», con reconciliación y con remontaje (`paginacion-pendientes.test.tsx`). El residuo está en H4.

## Lo que preguntaba el orquestador, fuera de la lista

- **Regiones `aria-live` siempre montadas.** Se cumple. `registrar-cobro.tsx:41` y `formulario-cobro.tsx:201` ya no llevan `empty:hidden`. La del formulario nace vacía con el diálogo. Un segundo «No sabemos…» idéntico se vuelve a anunciar: el `setMensaje('')` del manejador se confirma antes de que el `await` de red falle. No encuentro escenario de fallo.
- **La marca de módulo y las fugas.**
  - Entre pestañas no se filtra: cada pestaña es otro realm.
  - En el servidor el módulo se evalúa en SSR y comparte la variable entre peticiones. Solo la enciende `onClick`, que no corre en el servidor, así que no hay fuga entre usuarios.
  - Entre pruebas tampoco: `vi.resetModules()` en `beforeEach`.
  - Sí se queda encendida dentro de la misma pestaña cuando el clic no navega en ella. Ver H4.
- **El aviso de profesionales.** Cierra el «Todos» falso de B-H5, pero deja el filtro invisible. Ver H5.
- **«Más de 18 cobros acumulados falla a propósito».** Si la base no tuviera más cobros que los del propio spec, el tope sería exacto: es el mayor `antes` con el que un `+ 2` aún cabe en las 20 filas. Como fallo explícito y con instrucción, sería aceptable. No lo es tal como está, por dos motivos (H2):
  - Con 0 filas, el estado justo después del `db reset && npm run seed` que pide su propio mensaje, el paso falla antes de empezar.
  - El tope cuenta las filas de Lucía, no las de la lista. Lo que hace falta es que no se caiga ninguna fila por abajo.

## MEDIA

### H1 · `app/(app)/facturacion/formulario-cobro.tsx:52`: la clave de envío muere al cerrar el diálogo, y el aviso manda pulsar un botón que se llama igual que el que abre un formulario en blanco

`claveRef` vive en `FormularioCobro`, y `Dialogo` hace `return null` cuando está cerrado (`components/ui/dialogo.tsx`, `if (!abierto) return null`). Tras el `catch`, `enviando` vale `false` y el diálogo se cierra con Escape, con la «X» o con un `mousedown` fuera del panel (`useCierreExterior`). Al cerrarse se pierden la clave y lo escrito.

El aviso (`lib/i18n/es.ts:1383`) dice «Vuelve a pulsar «Registrar cobro» sin cambiar nada: si ya estaba registrado, no se duplica». Pero «Registrar cobro» es también el disparador de la página (`registrar-cobro.tsx:38`). Además, sin `refresh`, «Últimos cobros» y la métrica siguen sin el cobro que sí entró.

**Escenario:**
1. En el móvil se corta la red al registrar 60,00 € a un paciente. El primer POST insertó.
2. Sale «No sabemos…». El usuario toca fuera del panel, o pulsa Escape para mirar la lista.
3. La lista no enseña el cobro.
4. Pulsa el «Registrar cobro» de la página, que es lo que el aviso nombra, y le sale un formulario vacío.
5. Vuelve a escribir 60,00 €. La clave es otra, así que entra una segunda fila.

El cobro queda duplicado y no se puede borrar (regla 6): solo se compensa con una devolución con motivo. Es el escenario de B-H1 de la ronda 2 por otra puerta.

**Qué haría falta, con prueba de cada parte:**
- **Que la clave sobreviva al cierre.** Subirla a `RegistrarCobro`, junto con lo escrito o con una huella normalizada (importe en céntimos, `aCentimos`), para que reescribir el mismo cobro reutilice el `id`. O bien que el diálogo no se cierre sin confirmar mientras el resultado sea desconocido.
- **Que el aviso no nombre un botón ambiguo.** Por ejemplo: «sin cerrar esta ventana».
- **Pruebas:**
  - en `registrar-cobro.test.tsx`, un rechazo, cerrar, abrir, mismo envío y el mismo `id`;
  - un paso del spec que cierre el diálogo entre el corte y el reintento.

### H2 · `accesibilidad/facturacion.spec.ts:135`: el paso 4 solo pasa con cobros de ejecuciones anteriores, y su tope de 18 no garantiza que se vea el `+ 1`

La siembra no inserta cobros: `supabase/seed.sql` y `seed-completo.sql` no los tienen, y los bancos de `scripts/rls/` corren en `begin … rollback`. Esto falla de dos maneras.

**Primer escenario (base recién sembrada):**
1. Se ejecuta `npx supabase db reset && npm run seed` y después el spec. Es lo que pide la cabecera (`:7`) y lo que pide el mensaje del tope (`:137`).
2. «Últimos cobros» pinta `EstadoVacio` («Todavía no hay cobros»), que no tiene ningún `<li>`.
3. `await expect(recientes.getByRole('listitem').first()).toBeVisible()` (`:135`) agota el tiempo, y el paso 4 sale rojo sin haber registrado nada.

El verde de la verificación se apoya en filas de 0,01 € de rondas anteriores en la base compartida. La bitácora recoge la trampa de Suspense, pero no esta.

**Segundo escenario (el tope cuenta lo que no es):** `:136-138` limita las filas de Lucía y no las de la lista (`order fecha desc, registrado_en desc, limit 20`, `datos.ts`). Supongamos que una ejecución del spec el 01-10 dejó una fila L1 y que después se registraron 19 cobros de otros pacientes con fecha 02-10 a 06-10, por ejemplo con pruebas manuales en la base compartida. L1 queda en la posición 20 y `antes = 1`:
- Con el código bueno entra una fila arriba y L1 sale por abajo. El recuento da 1 = `antes`, rojo «el reintento duplicó el cobro».
- Con M20 entran dos filas y salen L1 y otra. El recuento da 2 = `antes + 1`: **verde con el mutante**.

**Qué haría falta:**
- Esperar a la lista o a su estado vacío. Por ejemplo `recientes.getByRole('listitem').or(recientes.getByText('Todavía no hay cobros')).first()`.
- Poner el tope sobre `recientes.getByRole('listitem').count() ≤ 18`, todas las filas. Así ningún `+ 1` ni `+ 2` empuja una fila fuera.

## BAJA

### H3 · `accesibilidad/facturacion.spec.ts:154`: no se comprueba que el primer POST insertó

`await route.fetch()` descarta la respuesta. Si ese POST no inserta, el cliente ve igualmente «No sabemos…» (la respuesta se aborta), el reintento inserta la única fila y el paso queda verde con `antes + 1`. En esa pasada la deduplicación no se ha probado, y M20 sobrevive.

**Escenario:** con `npm run dev`, el primer POST a la acción recién editada devuelve un 500 mientras Turbopack recompila. El paso 4 sale verde sin haber pasado por el 23505.

**Arreglo:** `const r = await route.fetch(); expect(r.status()).toBe(200)`, y que el cuerpo contenga «Cobro registrado».

### H4 · `app/(app)/facturacion/paginacion-pendientes.tsx:38`: la marca se enciende con cualquier clic, también con los que no navegan en esta pestaña, y se queda encendida

El `onClick` del usuario corre siempre antes que la lógica de `Link` (`node_modules/next/dist/client/app-dir/link.js:328`). Con Ctrl, Cmd o Mayúsculas, `linkClicked` deja que el navegador abra otra pestaña (`isModifiedEvent`, `:45-56`), y en la pestaña actual `pagina` no cambia. Lo mismo pasa si la navegación se sustituye por otra antes de llegar. La marca sigue en `true` hasta el siguiente cambio de `pagina` o el siguiente montaje, aunque no venga de un clic.

**Escenario:**
1. El administrador, en la página 2, abre «Siguientes» en otra pestaña con Ctrl+clic.
2. En la pestaña original cambia el selector de profesional. `router.replace` sin `pagina`, con `scroll: false` (`selector-profesional.tsx`).
3. Si el filtro sigue teniendo más de 50 filas, `pagina` pasa de 2 a 1 y el foco salta del selector al rango, al pie de la lista. La página se desplaza aunque `scroll: false` pretendía evitarlo.
4. Con 50 filas o menos, el salto llega al volver a `/facturacion` desde otro módulo: montar «sin clic» mueve el foco, que es lo que la prueba `:82` dice que no pasa.

**Arreglo:**
- Ignorar los clics modificados (`e.metaKey || e.ctrlKey || e.shiftKey || e.altKey`).
- Guardar la página de destino en vez de un booleano y enfocar solo si `pagina` coincide con ella.
- Probarlo con un `fireEvent.click(..., { ctrlKey: true })` seguido de un `rerender` con otra página: el foco no se mueve.

### H5 · `app/(app)/facturacion/page.tsx:36`: si falla la lista de profesionales con un filtro puesto, la página enseña cifras filtradas sin decir que lo están ni ofrecer quitar el filtro

`AvisoDeError` sustituye al selector, y con él desaparece el único sitio donde se ve el profesional elegido. La métrica, «Por paciente» y «Últimos cobros» siguen filtrados por `profesionalFiltrado` (`bloques.tsx`, `datos.ts`).

**Escenario:** con `/facturacion?profesional=<Ana>` (un marcador, o un enlace compartido) y `profesionales_del_pendiente` caída, el administrador ve «No se ha podido cargar la lista de profesionales» y, debajo, el pendiente de Ana como si fuera el de la clínica, sin ningún control para volver a «todos».

**Arreglo:** cuando `profesionalFiltrado !== null`, usar la `accion` que `AvisoDeError` ya admite para poner un enlace «Ver todos los profesionales» a `/facturacion`. En `page.test.tsx`, el caso `{ ok: false }` con elegido.

## Hallazgos B de la ronda 2

| Id | Estado | Nota |
|---|---|---|
| B-H1 (MEDIA) | **Cerrado** | El `catch` ya no refresca ni navega. Lo prueban `formulario-cobro.test.tsx` y el paso 4.3. Por otra puerta queda un residuo: H1 de esta ronda |
| B-H2 (MEDIA) | **Cerrado** | Selector a 360 px (paso 1), diálogo medido después de los errores y con Motivo (pasos 2 y 3), botón de envío dentro, `+ 1` en vez de «visible», línea del importe en «Por paciente» (4.5). El paso 4 depende de la base: H2 y H3 de esta ronda |
| B-H3 (MEDIA) | **Cerrado** | Hay pruebas de foco para Fecha y para Motivo. Con el mutante de foco fijo en Paciente caen las dos |
| B-H4 (BAJA) | **Cerrado** | Sin `max`. `bloques.test.tsx` usa 999999 y comprueba «Del 101 al 120 de 120» |
| B-H5 (BAJA) | **Cerrado** | `{ ok: false }` y aviso, sin «Todos» falso. Residuo: H5 de esta ronda |
| B-H6 (BAJA) | **Cerrado** en el clic normal | El foco va al rango en los dos sentidos, también al remontar. Residuo: H4 de esta ronda |
| B-H7 (BAJA) | **Cerrado** | El aviso ya no remite a «Últimos cobros». Su texto nuevo promete algo que H1 rompe |
| B-H8 (BAJA) | **Cerrado** | Sin `empty:hidden` en las dos regiones. Las dos pruebas comprueban que la región existe vacía desde el montaje |
