**Sin ALTA en la parte del revisor B** (ronda 2: 0 ALTA, 1 MEDIA, 4 BAJA).

# T-038 · Revisión, ronda 2 · Revisor B (interfaz, accesibilidad e integración TS de los dos pasos)

Diff revisado: `git diff main...worktree-agent-ac39d19a23cb82596` (HEAD `e25fae0`), ficheros de `app/(app)/cuenta/**`, `app/primera-vez/**`, `components/armazon/**`, `lib/cuentas/totp.ts`, `lib/cuentas/esquemas.ts`, `lib/i18n/es.ts`, `lib/supabase/tipos-bd.ts`, `next.config.ts`, `accesibilidad/**` y `docs/interfaz.md`. Las mutaciones y las sondas se ejecutaron en una copia exportada con `git archive e25fae0` fuera del worktree, que no se tocó. No se ejecutó `db reset`.

## B-H1 a B-H11 de la ronda 1

| # | Estado | Cómo se ha comprobado |
|---|---|---|
| B-H1 | **Cerrado** | El Provider envuelve el `<aside>` entero. `armazon-cliente.test.tsx` monta el `ArmazonCliente` real y cuenta los botones «Cerrar menú»: 1, luego 2 y luego 1. El mutante «Provider solo en `navegacion`» sale rojo (`mutantes-ui.json`). Ningún otro consumidor de `CajonContext` cambia de comportamiento: solo están `navegacion.tsx` y `enlace-cuenta.tsx`. |
| B-H2 | **Cerrado** | `catch` con `reset` y vista de fallo. Medido: sin el `reset` del `catch` (y con el resto igual) cae «B-H2 · si la acción se rechaza…», porque RHF repuebla el campo al volver. La prueba discrimina. El texto que se pinta tiene un matiz: **B2-H4**. |
| B-H3 | **Cerrado** | Error → `errorLectura`, sin `vacio` ni lista. Mutante rojo. |
| B-H4 | **Cerrado** | Medido: M2b (`useEffect` con `setTimeout(60000)` en la vista de fallo) tumba «B-H4 · en la vista de fallo…» (1 rojo de 11). |
| B-H5 | **Cerrado** | Medido: `zona = ZONA_POR_DEFECTO` en lista-avisos da 1 rojo de 9, y `ZONA_POR_DEFECTO,` en acciones.ts da 1 rojo de 19 (Canarias, 11:00). |
| B-H6 | **Cerrado** | Vitest mira `toHaveValue('')`. Medido: M1 (sin el `reset` de `:57`) da 5 rojos de 11. Playwright lo mira en S3 y S6. «Volver» no se ejercita en Playwright, pero Vitest lo cubre. |
| B-H7 | **Cerrado** | `toBe(registroInseguro)` en las tres variantes (falso, error y `null`), y ninguna llamada a ninguno de los dos pasos. |
| B-H8 | **Cerrado** | `listFactors` con error da `generico`, sin `challengeAndVerify` ni RPC. Mutante rojo. |
| B-H9 | **Cerrado** | «Volver» lleva el foco al campo contraseña. Mutante rojo en las dos variantes de fallo. Que el efecto vuelva a correr cuando cambia `enviando` con un `campoConFoco` antiguo no roba el foco: el input ya está desmontado y `focus()` sobre un nodo desconectado no hace nada. |
| B-H10 | **Cerrado en el anuncio** | El `status` se vacía y se rellena, y el mutante sale rojo. Pero el foco se pierde en cada reintento fallido: **B2-H2**. |
| B-H11 | **Cerrado en lo visible** | La marca «Sin leer» está dentro del `<li>` del no leído. Para el lector de pantalla se pega a la etiqueta: **B2-H3**. |

## R2.7 «Qué revisar» (parte de interfaz e integración TS)

- **La firma `(text)` no reaparece.**
  - `tipos-bd.ts` tiene `comprobar_contrasena_para_regenerar: { Args: { p_contrasena: string } }` y `regenerar_codigos_recuperacion: { Args: never }`.
  - `p_contrasena` solo aparece en `lib/cuentas/totp.ts:80`, en sus pruebas y en `scripts/t038-oraculo.mjs`. Este último la usa precisamente para comprobar que la firma vieja da 404/PGRST202.
  - Ninguna de las dos llamadas lleva `{ get: true }`.
- **Integración de los dos pasos en `totp.ts`.**
  - Si el paso uno da error, la función devuelve `error`, registra solo `.code` y no llama al paso dos (probado).
  - La traducción del paso dos no cambia.
  - Contrastado con el SQL:
    - con bloqueo, el paso uno vuelve sin escribir y el paso dos devuelve `bloqueado` con su hora;
    - sin autorización, el paso dos devuelve `contrasena_incorrecta`;
    - el quinto fallo devuelve `bloqueado`, no `contrasena_incorrecta`.
  - Las tres respuestas llegan bien a la acción.
- **Orden de la acción.** `listFactors` → `challengeAndVerify` → `registro_postgres_seguro` → comprobar → regenerar, probado en `acciones.test.ts:132`. `logging.serverFunctions: false` sigue en su sitio.
- **La prueba de B-H1 monta `ArmazonCliente` de verdad, y B-H6 mira `value` y no el HTML**: sí, en las dos.

## MEDIA

- **B2-H1** · `app/primera-vez/segundo-factor.tsx:102`
  - **Problema:** «Reintentar» (nuevo en T-038) hace `iniciarTransicion(async () => await generarCodigos())` sin `try/catch`. En `app/` no hay `error.tsx` ni `global-error.tsx`.
  - **Escenario:** en la vista «no se han podido generar tus códigos», la red cae y la persona pulsa «Reintentar». `generarCodigos` rechaza, el error sube a la frontera más cercana y la página entera se sustituye por la pantalla de error de Next. Se pierden con ella el texto que dice que los códigos ya no se ofrecerán al entrar y dónde generarlos.
  - **Medido** con una frontera de clase en Vitest y `mockRejectedValueOnce(new Error('red caida'))`: el documento solo contiene «FRONTERA Error: red caida».
  - Es el mismo patrón que B-H2 resolvió en el formulario de Mi cuenta.
  - `verificar` (`:117`) tiene el mismo patrón desde T-037: queda fuera del diff y es para `docs/state.md`.

## BAJA

- **B2-H2** · `app/primera-vez/segundo-factor.tsx:183`
  - **Problema:** `disabled={trabajando}` sobre el «Reintentar» que tiene el foco manda el foco a `BODY`. Si el reintento vuelve a fallar con el mismo texto, nada lo devuelve. Ese caso es todo fallo de la RPC, porque `lib/cuentas/totp.ts:53` devuelve siempre la misma constante.
  - **Escenario:** con teclado, «Reintentar» → fallo. El `status` se anuncia, pero el foco queda en `body` y hay que volver a recorrer la página para reintentar.
  - **Medido:**
    - en Chromium, con `page.setContent`, un botón enfocado y `disabled = true`, el foco pasa a `BODY` y no vuelve al habilitarlo;
    - en Vitest, tras el reintento fallido con el mismo texto, `focus()` de la región se llama 0 veces: `setFalloCodigos` con el mismo string no cambia el estado y el efecto `[falloCodigos]` no corre.
  - **Por qué la prueba no lo ve:** la de B-H10 corre en jsdom, que no quita el foco al deshabilitar, así que allí `activeElement` sigue siendo «Reintentar».
- **B2-H3** · `app/(app)/cuenta/lista-avisos.tsx:253`
  - **Problema:** la marca «Sin leer» es un `<span>` pegado a la etiqueta sin espacio: el `ml-2` solo separa en pantalla.
  - **Escenario:** el lector de pantalla oye «Regeneración de códigos bloqueadaSin leer», una sola palabra al final.
  - **Medido** en Chromium: `ariaSnapshot()` da `paragraph: Regeneración de códigos bloqueadaSin leer`, y `innerText` lo mismo.
  - **Por qué la prueba no lo ve:** busca el `<span>` con `getByText` y no puede notarlo.
- **B2-H4** · `app/(app)/cuenta/formulario-regenerar.tsx:77`
  - **Problema:** el `catch` afirma «No se han regenerado los códigos», pero un rechazo de la acción no dice si el paso dos se confirmó.
  - **Escenario:**
    1. La conexión se corta después de que `regenerar_codigos_recuperacion()` confirme. El lote viejo ya está caducado y el nuevo no se ha enseñado.
    2. La persona lee «No se han regenerado» y se queda con su lista en papel, que ya no vale.
    3. «Volver» no refresca, así que el aviso `codigos_regenerados` que lo delataría no aparece en la lista hasta que se recargue.
  - El texto lo fijó el diseño (R2.4, B-H2), pero el resultado es desconocido y la vista lo da por sabido.
- **B2-H5** · `app/primera-vez/segundo-factor.tsx:101`
  - **Problema:** «Reintentar» llama a `generar_codigos_recuperacion()`, que exige el segundo factor verificado hace menos de cinco minutos (`20261008120000:469`). La vista de fallo no tiene temporizadores, a propósito, y espera a la persona.
  - **Escenario:** la persona vuelve a los seis minutos y pulsa «Reintentar». Da 42501 y la misma constante «No se pudieron generar los códigos de recuperación.» una y otra vez. El botón ya no puede funcionar y nada lo dice. La descripción remite a Mi cuenta, que sí funciona: es una vía muerta con salida, no un bloqueo.

## Fuera del diff (para `docs/state.md`, no cuenta en el gate)

- `verificar` en `app/primera-vez/segundo-factor.tsx:117` (T-037): la misma transición asíncrona sin `try/catch` que B2-H1, con `generarCodigos()` y `mfa.verify` dentro.
