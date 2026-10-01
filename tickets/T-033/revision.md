**Sin hallazgos ALTA** (revisores A y B). Gate de la etapa: no bloquea.
Totales conjuntos: **0 ALTA · 1 MEDIA · 3 BAJA** (B: H1 MEDIA, H2 BAJA · A: H3 BAJA, H4 BAJA).

# T-033 · Revisión

Diff: `git diff main...T-033-segundo-factor-local` (5 commits, 11 ficheros, todos dentro del
`territorio:`; `node ~/.claude/pipeline/territorio.mjs T-033` en verde).

## Revisor B: corrección, Next.js 16, calidad de las pruebas, TOTP y alcance

Totales B: **0 ALTA · 1 MEDIA · 1 BAJA**.

### MEDIA

**H1 · `lib/cuentas/modo-desarrollo.test.ts:132` (y `:230`): ninguna prueba ejercita la
decodificación base32 con relleno, que es justo la de los cinco secretos sembrados.**
Los vectores RFC 6238 usan un secreto de 32 caracteres (20 bytes exactos: no hay relleno ni
bits sobrantes). Los secretos de la siembra tienen 18 caracteres: son 11 bytes y descartan 2
bits. La prueba «superado» calcula el código esperado con el propio `codigoTotp` (`:230`),
así que es tautológica respecto del decodificador. *Escenario:* hago una mutación en
`decodificarBase32`: antes del `return` añado
`if (bits > 0) bytes.push((acumulado << (8 - bits)) & 0xff);`, es decir, un byte de más con los
bits sobrantes. Las 43 pruebas siguen en verde. Con eso, cada código de las cuentas sembradas
deja de ser el que acepta GoTrue. El modo cae siempre a `'fallo'`, con el aviso engañoso
«¿reloj de Docker desfasado?». Es el fallo silencioso que el diseño §7 señalaba para esta pieza.
Arreglo propuesto: añadir un vector fijo calculado con una implementación independiente.
Python `base64.b32decode` con relleno equivale a lo que hace Go/`pquerna/otp`.
`SEMILLATOTPDEMOANA` da `t=0 → '837195'`, `t=1759310142 s → '076328'` y
`t=2000000000 s → '986607'`. `SEMILLATOTPDEMOADM` da `t=0 → '445934'`. Estos valores coinciden
hoy con la salida de `codigoTotp` (comprobado). El código actual es correcto: el hallazgo está
en la prueba.

### BAJA

**H2 · `app/login/acciones.test.ts:58`: ningún caso fija que el resultado del pase «no cambia
el destino» (diseño §1.3).** Todos los casos con el modo encendido simulan `'superado'`.
*Escenario:* cambio `iniciarSesion` para que devuelva
`{ ...ESTADO_INICIAL, mensaje }` cuando el pase no da `'superado'`. Las cuatro pruebas siguen en
verde (mutación hecha). Con un reloj de Docker desfasado (R1), el usuario se queda en `/login`
con un error en vez de caer a `/primera-vez`. Pasa lo mismo si el pase recibe un cliente
distinto del que inició sesión: no se comprueba el argumento de `superarSegundoFactorSembrado`.
Arreglo: un caso con `'fallo'` que espere `redirect('/pacientes')` y
`toHaveBeenCalledWith(<cliente de signIn>)`.

### Comprobado sin hallazgo

**«Qué revisar» del diseño, punto por punto:**
- **1.** No hay directiva `'use server'` en `modo-desarrollo.ts`. Sí aparece en el comentario
  de `:23`, así que el `grep` literal del diseño da una coincidencia, pero no es directiva.
  `acciones.ts` importa el módulo y no lo reexporta.
- **2–8.** Probados con mutación en un worktree desechable, sin tocar la base. Cada mutación
  pone en rojo al menos una prueba:
  - `includes` en lugar de `.has(hostname)`;
  - sin la comprobación `http:`;
  - parsear la URL antes de mirar la variable;
  - `.trim().toLowerCase()`;
  - «el primer factor» en lugar del filtro por sembrados (la GEMELA discrimina);
  - quitar la recomprobación interna;
  - evaluar el modo después de `signInWithPassword`;
  - leer el modo antes de `connection()`;
  - `NODE_ENV=production` apaga el modo (la matriz sobre la función que lee el entorno lo caza);
  - `Math.round` en el contador y la máscara `0x7f` (los vectores RFC lo cazan);
  - quitar el `?? []`.
- **9, 10 y 12.** `server-only` va en la primera línea. Los `console.warn` solo llevan
  `error.code` y texto fijo. La lectura es literal y sin `NEXT_PUBLIC_`. Los únicos que importan
  el módulo son `acciones.ts`, `aviso-modo-local.tsx`, `instrumentation.ts` y sus pruebas.
- **13.** `git diff --stat main...HEAD` sobre `proxy.ts`, `primer-acceso*`, `app/primera-vez`,
  `supabase`, `next.config.ts`, `package*.json` sale vacío.
- **14 y 15.** `redirect` queda fuera de todo `try`. No hay `enroll`, ni Admin API, ni códigos
  de recuperación.
- **16 y 17.** `connection()` va antes de leer el modo, dentro de `<Suspense>`.
  `instrumentation.ts` usa importación dinámica, la guarda `NEXT_RUNTIME === 'nodejs'` y no tiene
  `try/catch`. He comprobado en `next/dist` que un `register()` que lanza llega a
  `process.exit(1)` en `next start` (`instrumentation-globals.external.js:61-68`,
  `start-server.js:439-443`).
- **18.** El texto está en `es.ts`. `destructive`/`destructive-foreground` existen en
  `globals.css` y ya están en la tabla de contraste.
- **19 y 20.** Una lista nula da `'sin_factor_sembrado'`. Un error de `challengeAndVerify` da
  `'fallo'` sin lanzar.

**TOTP frente a los vectores RFC 6238:**
- Los cuatro vectores de 6 dígitos (truncados de los de 8 del RFC) son correctos.
- Truncado dinámico, máscara `0x7f`, contador BE de 8 bytes y `padStart`: correctos.
- Sobre los secretos sembrados, la salida coincide con una implementación independiente en
  Python que decodifica con relleno, igual que Go.

**`@supabase/ssr` 0.12.4:** `MFA_CHALLENGE_VERIFIED` está en la lista de eventos que vuelcan
cookies (`createServerClient.js:48-61`). `listFactors` filtra por `status === 'verified'`
(`GoTrueClient.js:4983-5006`).

**Fuera del diff (nota para el orquestador, no es hallazgo):** el diseño §2 D2 dice que la
capa 2 «da 500 en todo». No es exacto en la parte del layout. La franja es un hueco dentro de
`<Suspense>` en un layout con prerenderizado parcial, y la cabecera 200 y el resto de la página
ya se han enviado cuando lanza. Para el inicio de sesión sí es exacto: lanza antes de
`signInWithPassword`. No abre ninguna puerta, pero cuenta si se aplica la salida de R3 (retirar
`instrumentation.ts`): en ese caso, el criterio 4 se apoya en la acción, no en las páginas.

## Revisor A: seguridad (que el pase no se active fuera de local, y que la sesión `aal2` sea real)

Totales A: **0 ALTA · 0 MEDIA · 2 BAJA**. No he usado la base local. He leído el diff, el
código de `node_modules` que toca el camino y el build `.next/` que ya había en el worktree
(BUILD_ID de las 17:00, posterior al último commit de las 16:58).

### BAJA

**H3 · `lib/cuentas/modo-desarrollo.test.ts:74-88`: las URL adversarias no cazan la mutación
`endsWith` sobre `hostname`.** El código actual es correcto (`modo-desarrollo.ts:65`, igualdad
exacta con `HOSTS_LOCALES.has`). Pero si se cambia esa línea por
`hostname.endsWith('localhost') || hostname.endsWith('127.0.0.1')`, que el diseño §5.2 declara
rechazo, las siete adversarias siguen rechazadas: `localhost.evil.com`, `127.0.0.1.nip.io` y
`evil.com` no acaban así, `https:` cae por el protocolo, `127.0.0.2` no coincide y
`no-es-una-url` no se parsea. Lo he comprobado leyendo cada `hostname`, sin ejecutar la mutación.
*Escenario:* en un refactor alguien escribe `endsWith`, las pruebas siguen verdes y se acepta
`NEXT_PUBLIC_SUPABASE_URL=http://supabase-localhost:54321`, un nombre de una sola etiqueta que
resuelve a una máquina de la red y no al bucle local. La capa 2 queda abierta. La capa 3 (solo
factores sembrados) sigue en pie. Arreglo: añadir `http://evil-localhost:54321` y
`http://x.localhost:54321` a la lista de rechazos.

**H4 · `instrumentation.ts:13`: la capa 1 («el servidor no arranca») no tiene ninguna prueba
automática.** Ninguna prueba importa `register()`. *Escenario:* alguien envuelve
`segundoFactorAutomaticoActivo()` en `try/catch` para que `next dev` no se caiga por un
`.env.local` mal puesto. `npm test`, `lint` y `build` siguen verdes. Un despliegue mal
configurado arranca y sirve páginas. Como dice la nota de B, la franja va dentro de
`<Suspense>` y no da 500, así que la única señal sería un fallo al iniciar sesión. Sigue
fallando cerrado (la acción lanza antes de `signInWithPassword` y la capa 3 se mantiene), pero
el criterio 4 se apoyaría solo en la prueba manual de la evidencia. Arreglo: una prueba de
`instrumentation.ts` con `NEXT_RUNTIME=nodejs`, la variable a `activo` y una URL remota, que
espere que `register()` rechace con `ErrorModoLocal`.

### Comprobado sin hallazgo (seguridad)

- **La URL que se comprueba es la URL con la que se habla.** `proxy.ts`, `servidor.ts`,
  `navegador.ts` y `administracion.ts` usan todos la misma constante `urlSupabase` de
  `lib/supabase/config.ts`. No hay una segunda variable de URL solo de servidor. En el build,
  `NEXT_PUBLIC_SUPABASE_URL` queda **inlineada también en el bundle de servidor**
  (`.next/server/chunks/[root-of-the-server]__0wk373d._.js`:
  `o("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54321")`). Así que la comprobación y la
  conexión usan siempre el mismo valor, el del build. Cambiar la URL en tiempo de ejecución no
  puede separarlas. En cambio, `process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL` queda como lectura
  en tiempo de ejecución, sin inlinear. Para la prueba manual del criterio 4, el build tiene que
  hacerse con la URL remota, como ya dice el diseño.
- **Normalización del host.** Las formas IPv4 equivalentes que normaliza WHATWG `URL`
  (`http://127.1`, `http://0x7f000001`) salen como `127.0.0.1`, que sí es el bucle local.
  `[::1]`, `localhost.` y `*.localhost` se rechazan, así que fallan cerrado.
- **Nada del módulo es un endpoint.** En `.next/server/server-reference-manifest.json`, los
  `exportedName` son solo las acciones existentes más `iniciarSesion`. No aparece ningún
  `superarSegundoFactorSembrado`, `codigoTotp` ni `segundoFactorAutomaticoActivo`. `grep` de
  `SEGUNDO_FACTOR_AUTOMATICO_LOCAL|SEMILLATOTPDEMO` en `.next/static` da exit 1.
- **`server-only` en `instrumentation` con Turbopack (R3 del diseño):** se resuelve vacío. El
  chunk compilado no contiene «cannot be imported from a Client Component». La guarda
  `NEXT_RUNTIME !== 'nodejs'` se pliega en el bundle de Node, y `register()` evalúa siempre el
  modo (`.next/server/chunks/_1pt663g._.js`).
- **Factores y cuentas no sembradas.** El cliente no elige el `factorId`: sale de
  `listFactors()`, que llama a `getUser()` contra GoTrue (`GoTrueClient.js:4983-5006`), con la
  sesión recién creada en esa misma petición. Además GoTrue comprueba que el factor sea del
  usuario y valida el código contra el secreto **guardado**. Por eso la capa 3 no depende solo
  del `Map`. Contra una base real, o una copia de producción restaurada en local, ningún
  factor tiene esos ids ni esos secretos. El peor caso es `'sin_factor_sembrado'`.
- **`aal2` real sin tocar guardia ni base.** `_verify` guarda la sesión y **espera** a
  `_notifyAllSubscribers('MFA_CHALLENGE_VERIFIED')` antes de volver
  (`GoTrueClient.js:4874-4900`, `4308-4333`). `createServerClient` vuelca cookies con
  `setAll` en ese evento (`createServerClient.js:48-61`). Y `crearClienteServidor` escribe con
  `cookies().set`, que funciona en una Server Action. Así, la sesión `aal2` emitida por GoTrue
  sale en la respuesta del `redirect`. `primer-acceso.ts` y `proxy.ts` no cambian (diff vacío).
  `segundo_factor_verificado_recientemente()` recibe `aal2` y un `last_challenged_at` recién
  puesto por el `challenge`.
- **Orden y fallo cerrado en `iniciarSesion`.** El modo se evalúa antes de `safeParse` y de
  `signInWithPassword`. Con credenciales malas no hay pase. Si el pase da `'fallo'` o
  `'sin_factor_sembrado'`, la sesión se queda en `aal1` y la guardia manda a `/primera-vez`.
- **Cliente frente a servidor.** `aviso-modo-local.tsx` no lleva `"use client"` y solo lo
  importa `app/layout.tsx`, que es Server Component. El aviso solo pinta texto del catálogo,
  sin pasar ningún dato del modo como prop.
