Sin hallazgos ALTA. Ronda 2 sobre 0b698a824d319f1f686b6e61ee0af6f6b7c37eee: 0 ALTA, 0 MEDIA, 5 BAJA abiertas (H3 reabierta, H7 a H10 nuevas). H1, H2, H4, H5 y H6 cerrados.

# T-027 · Revisión, ronda 2 (revisor único, riesgo medio)

Delta revisado: `git diff ca6c196..0b698a8` (571c033, fbdc073, d8ba8c2, 139a94a, f745a7b, 0b698a8). Ninguno toca `supabase/**`.
La ronda 1 queda en `tickets/T-027/rondas/r1.json`.

## Qué medí

Todo en una copia (`git archive` de 0b698a8 con junction a `node_modules`, borrada al acabar; `node_modules` de main conserva sus 384 entradas).

- Vitest completo: 228 ficheros, 3092 pruebas en verde. ESLint limpio sobre agenda, `facturacion/bonos`, `panel-bonos` y `lib/i18n`. El único error de `tsc` es `LayoutProps` de `app/layout.tsx` (tipos generados por Next que la copia no tiene; no es del diff).
- Mutantes (una línea cada uno, en la copia, con `sed`):

| Mutante | Resultado |
|---|---|
| H2: sin `leerGuardada` / sin `guardar` / sin `olvidar` | falla `registrar-bono.test` (1, 1 y 2 pruebas) |
| H1: sin `if (pendiente) return` / `disabled` con `pendiente` | falla «mientras guarda…» |
| H1: sin `setMensaje(texto)` | fallan 5 pruebas |
| H1: `definitivo` sin la rama «ya pasada» | falla la prueba del vínculo definitivo |
| H5: «quedan» con `lectura.saldo` (el código de la ronda 1) | falla la prueba de las 4 vinculadas |
| H4: sin la forma singular | falla «caducado con una sola sesión» |
| H6: sin guarda en `profesional` / en `paciente` | fallan 2 / 1 pruebas |

## Los seis de la ronda 1

- **H1 cerrado.** `alGuardar` relee `leerBonoDeCita`; el vínculo de una cita pasada pasa a solo lectura con el mensaje intacto, y `definitivo` avisa antes de Guardar solo en cita realizada o ya pasada sin bono. Las pruebas fallan sin el arreglo. Quedan dos huecos de prueba y un efecto lateral de foco: H3 y H7.
- **H2 cerrado.** La clave de envío vive también en `sessionStorage` (por huella), se olvida en el éxito, y sin almacén cae a la memoria. El texto ya no promete «sin salir de la página» y dice «mientras no cierres esta pestaña». Las pruebas matan los tres mutantes del núcleo. Quedan un hueco de prueba (H9) y un efecto de la persistencia (H10).
- **H3 reabierto a medias.** Se quitó `pendiente` del `disabled`, pero el botón sigue deshabilitado al éxito y, en el caso que H1 acaba de hacer común, el selector se desmonta: ver H3 abajo.
- **H4 cerrado.** `caducadoQueHacer.una` / `.varias`, con prueba del singular que falla sin el ternario.
- **H5 cerrado en lo que pedía** (las 4 vinculadas), pero el arreglo deja un caso a medias y su término `propia` sin prueba: H8.
- **H6 cerrado.** Un `?profesional` o `?paciente` fuera de las opciones no se aplica, tampoco con el directorio caído. Las pruebas fallan sin cada guarda. Los dos mutantes de `hrefDePagina` con `contexto` sobreviven, pero son equivalentes: la página limpia el filtro otra vez al pintar.

## BAJA

### H3 (reabierto) · `app/(app)/agenda/bono-de-cita.tsx:147` — tras el éxito el botón se deshabilita y, en cita pasada, el selector entero se desmonta: el foco cae a `body` y el aviso nace en una región nueva

La ronda 1 decía «`disabled={pendiente || valor === guardado}` tira el foco, y lo deja deshabilitado tras el éxito». El arreglo quitó `pendiente`, pero `disabled={valor === guardado}` sigue: `setGuardado(valor)` se ejecuta antes de la relectura, así que el botón enfocado se deshabilita nada más confirmarse el vínculo. Peor, el caso que H1 acaba de hacer habitual (cita ya pasada sin bono) pasa de `Selector` a la rama de solo lectura, que pinta otro `<p role="status">`.

Medido con una sonda en jsdom (borrada): en el caso definitivo `document.activeElement` es `BODY`, la región de estado es otro nodo (`mismaRegion=false`) y nace ya con el texto «Cita vinculada al bono». En el caso futuro el botón sigue siendo el mismo y queda `disabled`.

Escenario: un usuario de teclado vincula una cita de ayer a «Bono de 5 · quedan 4» y pulsa Guardar → el foco sale del panel (el siguiente Tab arranca desde el principio) y un lector de pantalla puede no leer «Cita vinculada al bono», porque la región se crea con el texto puesto. La acción es irreversible. Las pruebas del ticket solo miden el foco mientras guarda, no tras el éxito.

### H7 · `app/(app)/agenda/bono-de-cita.tsx:40` — las dos guardas de la relectura y la limpieza del mensaje sobreviven a su mutante

Tres mutantes verdes en `bono-de-cita.test.tsx` (14 pruebas): `if (!('error' in nueva)) setLectura(nueva)` (sin `nueva.visible`), `if (nueva.visible) setLectura(nueva)` (sin la guarda del error) y `alCambiar={() => undefined}`. La prueba de la relectura solo cubre el rechazo de la promesa, no una relectura que vuelva `{visible:false}` o `{visible:true, error}`.

Escenario: tras guardar «Cita sin bono», `leerBonoDeCita` devuelve `{visible:false}` (ya no queda ninguna opción). Si alguien quita `nueva.visible`, el control entero desaparece y se lleva el aviso «Cita sin bono» con él. Con la guarda del error quitada, un fallo de lectura de la relectura sustituye el selector por «No se ha podido cargar el bono de esta cita» justo después de un éxito. Sin `alCambiar`, el «Cita vinculada al bono» sigue pintado mientras el usuario ya eligió otro bono sin guardar. Ninguna de las tres cosas las ve el banco.

### H8 · `app/(app)/agenda/acciones-bono.ts:156` — en solo lectura el «quedan» de una cita pasada sin realizar no se descuenta a sí misma, y su término `propia` no tiene prueba

`textoDe(vinculado, false, cita)` (línea 182) pasa `actual = false`, así que `propia` vale 0. Pero una cita `programada` o `confirmada` ya pasada con bono no cuenta en `sesiones_consumidas` (solo cuentan las realizadas) ni en `comprometidas` (la consulta usa `.neq('id', cita.id)`). El mismo bono visto desde una cita futura sí se descuenta (`propia = 1`). Además, el mutante `const propia = 0` sobrevive a las 26 pruebas de `acciones-bono.test.ts`: ninguna fija el descuento de la propia cita.

Escenario: una cita de ayer en `programada` (aún sin marcar realizada) se vincula a un bono de 5 sin consumo → tras el éxito la relectura pinta «Bono de 5 · quedan 5», igual que antes de vincular; otra cita futura del mismo bono dice «quedan 4 (vinculado)». El usuario puede entender que el vínculo no ha contado.

### H9 · `app/(app)/facturacion/bonos/registrar-bono.tsx:40` — nadie prueba que `olvidar` aguante un `removeItem` que lanza

La prueba de «sin sessionStorage utilizable» hace lanzar `getItem` y `setItem`, pero no `removeItem`. Quitar el `try/catch` de `olvidar` deja las 9 pruebas del fichero en verde (medido).

Escenario: en un navegador con el almacén bloqueado, `alRegistrar` ejecuta `claves.current.delete(huella)` y luego `olvidar`, que lanza; la excepción cae en el `catch` de `formulario-bono.tsx` y pinta «No sabemos si el bono se ha registrado» tras un éxito, con el diálogo abierto. El reenvío genera una clave nueva (la antigua ya se borró del `Map`) y entra un segundo bono, que no se puede retirar (solo adición).

### H10 · `app/(app)/facturacion/bonos/registrar-bono.tsx:24` — la clave de envío en `sessionStorage` sobrevive al cierre de sesión: otro usuario en la misma pestaña queda atascado con el mismo bono

La clave (`bono-envio:` + huella con el uuid del paciente, las sesiones, el importe en céntimos y la caducidad) se guarda en claro en `sessionStorage` y nada la borra al cerrar sesión. Si la clave sigue ahí, otro usuario de esa pestaña que registre un bono con los mismos datos la reutiliza.

Escenario: el usuario A registra el bono 5 sesiones / 150 € del paciente P, la red corta la respuesta tras el insert, A cierra sesión sin reintentar. El usuario B entra en esa pestaña y registra el mismo bono de P: reutiliza la `id` de A; `leerBonoPropio` (con `creado_por = B`) no encuentra nada, el insert da 23505 (o 42501 por la RLS), la relectura tampoco ve la fila, y `registrarBono` devuelve el mensaje genérico «No se ha podido registrar el bono». La clave sigue ahí, así que cada reintento falla igual hasta que B cambie un dato o cierre la pestaña. El mensaje no da salida. Además, el uuid del paciente y el importe quedan legibles en el almacén del navegador tras cerrar sesión. Se arregla con la clave ligada al usuario (su id en el prefijo) o borrándola al cerrar sesión.

## Fuera de hallazgo

- `app/(app)/facturacion/bonos/registrar-bono.tsx:47`: el comentario de la cabecera abre «Registrar bono' con una comilla que no cierra (¿una `«»` mal escrita?). Cosmético.
- La bitácora `docs/bitacora/T-027.md` no recoge los cambios de la ronda 2 (sessionStorage, `definitivo`, `comprometidas` en el texto). Es del cierre del orquestador; el diseño manda anotar en `docs/state.md` «cita realizada con bono agotado no se cobra» y «no hay control de marcar realizada» (sigue pendiente desde la ronda 1).
- `tickets/T-027/evidencia.json` y `evidencia.sha` aparecen modificados en el worktree: son del verificador, no los he tocado.
