# T-033 · Diseño — el segundo factor se pasa solo en local, nunca en producción

Arquitecto, 01-10-2026. Contrato: `tickets/T-033-segundo-factor-desactivable-en-local.md`.
ADR citados por el contrato: ADR-039 (TOTP para los tres roles) y ADR-026 (PIN). Este diseño
no toca ninguno de los dos, no toca `supabase/` y no cambia el camino de producción.

**Resumen en una frase**: en local, la Server Action de inicio de sesión calcula ella misma el
código TOTP del factor **sembrado** y llama a `mfa.challengeAndVerify()`; la sesión llega a
`aal2` de verdad, la base no se entera de nada distinto y la guardia (`proxy.ts`,
`primer-acceso.ts`) no se modifica.

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | La guardia llama a `primerAccesoPendiente(supabase)` para toda ruta con sesión que no sea pública ni de acceso; si devuelve algo, redirige a `/primera-vez`. | `proxy.ts:101-116` |
| H2 | `primerAccesoPendiente()` devuelve `'totp'` si `getAuthenticatorAssuranceLevel().currentLevel !== 'aal2'`, sin preguntar a la base; si no, `'pin'` cuando `requiere_pin && !tiene_pin`. | `lib/cuentas/primer-acceso.ts:33-54` |
| H3 | La función de la base **no se llama `fijar_pin()`**: es `public.fijar_pin_historia(p_pin text)`, y la comprobación está en `:873`. `generar_codigos_recuperacion()` se define en `:548` y comprueba en `:569`. Ninguna de las tres funciones (más `segundo_factor_verificado_recientemente`) tiene redefinición posterior: `grep -ln` solo las encuentra en `20260822160000_…` (la versión de T-002, sustituida) y en `20260830090000_…`. | `supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql:548,569,859,873` |
| H4 | `segundo_factor_verificado_recientemente(p_minutos = 5)` exige `auth.jwt() ->> 'aal' = 'aal2'` **y** un factor `verified` del propio usuario con `last_challenged_at > now() - 5 min`. GoTrue actualiza `last_challenged_at` en cada `challenge()`/`verify()`. | misma migración, `:280-296` (comentario `:240-279`) |
| H5 | Desde SQL no se emite `aal2`: lo dice el comentario de cabecera. | misma migración, `:19-20` |
| H6 | La siembra completa inserta cinco factores TOTP `verified` con id fijo `a0080004-0000-4000-8000-00000000000{1..5}` y secretos `SEMILLATOTPDEMO{ANA,BRU,TEC,BAJ,ADM}` (ana, bruno, tecnico, baja, admin). **Solo `seed-completo.sql`** los siembra: `seed.sql` (lo que aplica `db reset`) no tiene factores. Es decir, el modo exige `npm run seed`. | `supabase/seed-completo.sql:174-187`; `grep SEMILLATOTPDEMO` solo encuentra ese fichero en el árbol principal |
| H7 | Los secretos son base32 válido (A-Z); 18 caracteres → 11 bytes con relleno a 24. | lectura del literal |
| H8 | Los cuatro perfiles con PIN sembrado son admin, ana, bruno y baja; el técnico no tiene PIN y `requiere_pin` es falso para su rol. `pines_historia` la puede borrar su dueño (`postgres`): lo hace `dar_de_baja_perfil()`. | `seed-completo.sql:193-198`; migración `:210`, `:454` |
| H9 | El inicio de sesión es una Server Action (`iniciarSesion`) con `crearClienteServidor()` y `signInWithPassword`; al acabar hace `redirect('/pacientes')`. `/agenda` **aún no existe** (`app/page.tsx` redirige a una ruta que construye T-014). | `app/login/acciones.ts:18-42`; `app/page.tsx:1-17` |
| H10 | `crearClienteServidor()` escribe cookies con `cookies().set` dentro de `try` (funciona en Server Action). | `lib/supabase/servidor.ts:13-32` |
| H11 | `@supabase/ssr` 0.12.4: el almacén de servidor lee primero de `setItems` (lo que se escribió en esta misma petición) y vuelca cookies con `setAll` en los eventos `SIGNED_IN` y **`MFA_CHALLENGE_VERIFIED`**. Por tanto, en la misma Server Action, tras `signInWithPassword`, `mfa.challengeAndVerify()` usa la sesión recién creada y la sesión `aal2` resultante viaja en las cookies de la respuesta. | `node_modules/@supabase/ssr/dist/main/cookies.js:343-385`; `createServerClient.js:48-61` |
| H12 | `@supabase/auth-js` 2.112.3 tiene `mfa.challengeAndVerify` y `mfa.listFactors()` devuelve en `data.totp` solo los factores `verified`, con su `id`. | `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:215,4967,4983-5006` |
| H13 | `/primera-vez`, al superar el TOTP, **regenera los códigos de recuperación en cada entrada** (no solo al activar). Comportamiento de producción ya existente; ver «Hallazgo» al final. | `app/primera-vez/segundo-factor.tsx:106` |
| H14 | `NEXT_PUBLIC_SUPABASE_URL` se lee en `lib/supabase/config.ts` con acceso literal y se inlinea en build; es la misma constante `urlSupabase` que usan proxy, servidor y navegador. | `lib/supabase/config.ts:15-18` |
| H15 | Playwright arranca **`next start`** (`NODE_ENV=production`) contra Supabase local; el CI levanta Supabase con `npx supabase start` (127.0.0.1). T-014 necesita el modo **con `NODE_ENV=production`**. | `playwright.config.ts:56-74`; `.github/workflows/ci.yml` |
| H16 | Topología: producción es Supabase en la nube + Vercel, una instancia por clínica, región París. Nunca un Supabase en bucle local. | `docs/architecture.md:10-17` |
| H17 | La prueba `lib/i18n/sin-literales.test.ts` falla si aparece texto visible literal en cualquier `.tsx` de `app/` o `components/`: el texto del aviso tiene que ir a `lib/i18n/es.ts`. | `lib/i18n/sin-literales.test.ts:13-30` |
| H18 | Vitest sustituye `server-only` por un módulo vacío. | `vitest.config.ts:10-17` |
| H19 | `proxy.test.ts` finge `@/lib/supabase/config` con URL `http://127.0.0.1:54321` y finge `primer-acceso`. No está en el territorio del ticket. | `proxy.test.ts:13-27` |

**Next 16, leído en `node_modules/next/dist/docs/` y en el código de `next/dist`:**

| # | Hecho | Dónde |
|---|---|---|
| N1 | Las variables sin `NEXT_PUBLIC_` solo existen en servidor; las `NEXT_PUBLIC_` se inlinean en build. Para leer una variable **en tiempo de petición** en un Server Component hay que llamar antes a `await connection()`; si no, con prerenderizado se evalúa en build. | `01-app/02-guides/environment-variables.md:154-238`; `03-api-reference/04-functions/connection.md` |
| N2 | `proxy.ts` corre en Node.js por defecto en Next 16 y no admite `runtime`. | `03-api-reference/03-file-conventions/proxy.md:223,774` |
| N3 | `instrumentation.ts` en la raíz exporta `register()`, que se llama **una vez al arrancar la instancia** y debe completar antes de servir. | `03-api-reference/03-file-conventions/instrumentation.md:16-18`; `02-guides/instrumentation.md:19,52-90` |
| N4 | Si `register()` lanza, el error se propaga: `registerInstrumentation` lo relanza (`server/lib/router-utils/instrumentation-globals.external.js:61-68`) → `NextNodeServer.prepareImpl` (`server/next-server.js:572-578`) → `server.prepare()` en `render-server.js:132` → `router-server.initialize` (`:623`) → `start-server.js:439-443`: **`console.error(err); process.exit(1)`**. No se llama en `next build` (`NEXT_PHASE === 'phase-production-build'`, `:54`). | rutas citadas, en `node_modules/next/dist/` |
| N5 | La capa `instrument` está en el grupo `serverOnly`, donde `server-only` se resuelve a un módulo vacío (webpack). En Turbopack no lo he podido leer (binario); ver Riesgo R3. | `build/create-compiler-aliases.js:218-229`; `build/webpack-config.js:1131-1150`; `lib/constants.js:380-401` |

---

## 1 · Piezas y contratos

### 1.1 `lib/cuentas/modo-desarrollo.ts` (nuevo)

Primera línea `import 'server-only';`. **Sin `'use server'`** (ver §5, punto 1). Exporta:

```ts
/** Nombre de la variable. Sin NEXT_PUBLIC_: jamás se inlinea al navegador. */
// la lectura es SIEMPRE literal: process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL

export const VALOR_ACTIVO = 'activo';
export const HOSTS_LOCALES: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost']);

export class ErrorModoLocal extends Error { name = 'ErrorModoLocal'; }

/** Pura. Decide con lo que recibe; no lee process.env. */
export function decidirModoSegundoFactor(
  variable: string | undefined,
  urlSupabase: string,
): boolean;

/** Lee process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL (literal) y `urlSupabase` de
 *  '@/lib/supabase/config', y delega en decidirModoSegundoFactor. */
export function segundoFactorAutomaticoActivo(): boolean;

/** Pura. RFC 6238: HMAC-SHA1 (node:crypto createHmac), periodo 30 s, 6 dígitos,
 *  contador de 8 bytes big-endian, truncado dinámico RFC 4226. Base32 RFC 4648
 *  (alfabeto A-Z2-7; se quitan '=' y espacios; mayúsculas; carácter inválido →
 *  lanza; los bits sobrantes del final se descartan, igual que Go). */
export function codigoTotp(secretoBase32: string, instanteMs: number): string;

/** Los cinco factores de supabase/seed-completo.sql:174-187, id → secreto.
 *  Exportado SOLO para la prueba de deriva contra la siembra. */
export const FACTORES_SEMBRADOS: ReadonlyMap<string, string>;

export type ResultadoPaseAutomatico =
  | 'inactivo'            // el modo no está activo: no se ha llamado a nada de MFA
  | 'sin_factor_sembrado' // ningún factor verificado del usuario está en FACTORES_SEMBRADOS
  | 'superado'            // challengeAndVerify sin error
  | 'fallo';              // listFactors o challengeAndVerify devolvieron error

export async function superarSegundoFactorSembrado(
  supabase: SupabaseClient<Database>,
): Promise<ResultadoPaseAutomatico>;
```

Semántica exacta de `decidirModoSegundoFactor(variable, url)` — **el orden es contrato**:

1. `variable === undefined || variable === ''` → `false`. **Sin parsear la URL.** (Con la
   variable ausente, que es producción, el código nuevo no hace nada más que esta comparación.)
2. `variable !== 'activo'` (cualquier otro valor: `'1'`, `'true'`, `' activo'`, `'ACTIVO'`) →
   `throw new ErrorModoLocal(...)` con el mensaje «SEGUNDO_FACTOR_AUTOMATICO_LOCAL tiene un valor
   no reconocido; los únicos valores son `activo` o no definirla».
3. `new URL(url)`; si lanza → `ErrorModoLocal` («…la URL de Supabase no se puede leer…»).
4. `protocol !== 'http:'` **o** `!HOSTS_LOCALES.has(hostname)` → `ErrorModoLocal` con
   «SEGUNDO_FACTOR_AUTOMATICO_LOCAL está definida y Supabase no es local (host «X»). Este modo
   solo existe en desarrollo local: quita la variable de este entorno.» Comparación por
   **igualdad exacta** de `URL.hostname`; nada de `includes`, `startsWith` ni expresiones
   regulares sobre la cadena.
5. En otro caso → `true`.

`NODE_ENV` **no participa** (D2). El puerto tampoco.

`superarSegundoFactorSembrado(supabase)`:

1. `if (!segundoFactorAutomaticoActivo()) return 'inactivo';` — se recomprueba dentro, aunque
   el llamante ya lo haya hecho: ninguna puerta futura puede llamarla sin el modo.
2. `const { data, error } = await supabase.auth.mfa.listFactors();` error → `console.warn`
   sin datos sensibles, `return 'fallo'`.
3. `const factor = data.totp.find((f) => FACTORES_SEMBRADOS.has(f.id));` sin factor →
   `return 'sin_factor_sembrado'` (**no** se llama a `challengeAndVerify`).
4. `code = codigoTotp(FACTORES_SEMBRADOS.get(factor.id)!, Date.now())`;
   `await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })`. Error →
   `console.warn('[modo local] el TOTP sembrado no se aceptó; ¿reloj de Docker desfasado?', error.code)`,
   `return 'fallo'`. Bien → `'superado'`.
5. Nunca registra ni devuelve el secreto ni el código. Nunca lanza por un fallo de Auth (sí
   propaga `ErrorModoLocal` del paso 1).

### 1.2 `lib/cuentas/modo-desarrollo.test.ts` (nuevo, se escribe primero)

Ver §3 y §5 para lo que cada prueba demuestra. Bloques:

- **Matriz del criterio 4** (8 casos, sobre `segundoFactorAutomaticoActivo()`, el camino real
  de lectura): `vi.stubEnv` de `SEGUNDO_FACTOR_AUTOMATICO_LOCAL` (ausente | `activo`),
  `NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321` | `https://abcdefgh.supabase.co`) y
  `NODE_ENV` (`development` | `production`), con `NEXT_PUBLIC_SUPABASE_ANON_KEY` fijo;
  `vi.resetModules()` y `await import('./modo-desarrollo')` en cada caso para que
  `lib/supabase/config.ts` se reevalúe. `it.each` con la tabla esperada:
  ausente×*×* → `false`; activo×local×* → `true`; activo×remota×* → lanza `ErrorModoLocal`
  con `/no es local/`. `vi.unstubAllEnvs()` en `afterEach`.
- **URL adversarias** sobre `decidirModoSegundoFactor('activo', url)`, todas lanzan:
  `http://localhost.evil.com`, `http://127.0.0.1.nip.io:54321`, `http://127.0.0.1@evil.com`,
  `http://evil.com/?h=127.0.0.1`, `https://127.0.0.1:54321`, `http://127.0.0.2:54321`,
  `no-es-una-url`. Y aceptan: `http://127.0.0.1:54321`, `http://localhost:54321`.
- **Valor de la variable**: `'1'`, `'true'`, `' activo'`, `'ACTIVO'` con URL local → lanzan;
  `''` → `false`.
- **Ausente no parsea**: `decidirModoSegundoFactor(undefined, 'no-es-una-url')` → `false` sin
  lanzar (prueba que producción no ganó una vía de error nueva).
- **TOTP**: vectores RFC 6238 SHA-1 con el secreto `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`
  («12345678901234567890»), 6 dígitos: `59 s → '287082'`, `1111111109 s → '081804'`,
  `1234567890 s → '005924'`, `2000000000 s → '279037'`. Ceros a la izquierda conservados.
  Carácter fuera del alfabeto (`'SEMILLA1'`) → lanza.
- **Deriva contra la siembra**: lee `supabase/seed-completo.sql` con `fs` y comprueba que
  cada par `(id, secreto)` de `FACTORES_SEMBRADOS` aparece en el `insert into auth.mfa_factors`
  y que hay exactamente cinco.
- **`superarSegundoFactorSembrado`** con un `supabase` fingido (`listFactors`,
  `challengeAndVerify` como `vi.fn`):
  - modo inactivo → `'inactivo'` y **ninguna** de las dos funciones llamada;
  - modo activo, factor sembrado de Ana → `'superado'`, `challengeAndVerify` llamado una vez
    con `factorId` de Ana y `code` igual a `codigoTotp('SEMILLATOTPDEMOANA', ahora)` con
    `vi.useFakeTimers().setSystemTime(...)`;
  - **GEMELA** · modo activo, factor verificado con id aleatorio (cuenta real) →
    `'sin_factor_sembrado'` y `challengeAndVerify` **no** llamado;
  - `challengeAndVerify` devuelve error → `'fallo'`, no lanza;
  - modo mal configurado (URL remota) → lanza `ErrorModoLocal` antes de `listFactors`.

### 1.3 `app/login/acciones.ts` (modificar)

```ts
export async function iniciarSesion(datos: unknown): Promise<EstadoFormulario> {
  const modoLocal = segundoFactorAutomaticoActivo();   // NUEVO, lo primero: si está mal
                                                        // configurado, lanza antes de crear sesión
  const resultado = esquemaInicioSesion.safeParse(datos);
  ... (sin cambios hasta el if (error) ...)
  if (modoLocal) {                                      // NUEVO
    await superarSegundoFactorSembrado(supabase);       // el resultado no cambia el destino:
  }                                                     // si no se superó, la guardia manda a /primera-vez
  redirect('/pacientes');                               // sin cambios, fuera de todo try
}
```

No devuelve nada nuevo al cliente. No genera códigos de recuperación (D1).

### 1.4 `app/login/acciones.test.ts` (nuevo)

Finge `@/lib/supabase/servidor` (cliente con `auth.signInWithPassword`), `next/navigation`
(`redirect` que lanza un marcador) y `@/lib/cuentas/modo-desarrollo`
(`segundoFactorAutomaticoActivo`, `superarSegundoFactorSembrado`). Casos:

1. Modo `false`, credenciales buenas → `superarSegundoFactorSembrado` **no** llamado;
   `redirect('/pacientes')`.
2. Modo `true`, credenciales buenas → llamado **después** de `signInWithPassword`
   (`invocationCallOrder`), y `redirect('/pacientes')`.
3. Modo `true`, credenciales malas → no llamado; devuelve el mensaje genérico.
4. `segundoFactorAutomaticoActivo` lanza → la acción lanza y `signInWithPassword` **no** se
   ha llamado.

### 1.5 `instrumentation.ts` (nuevo, raíz) — **requiere ampliar territorio (P1)**

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { segundoFactorAutomaticoActivo } = await import('./lib/cuentas/modo-desarrollo');
  if (segundoFactorAutomaticoActivo()) {     // lanza si está mal configurado → process.exit(1) (N4)
    console.warn('[modo local] El segundo factor se supera solo con las cuentas sembradas. ' +
      'Nunca en un entorno real.');
  }
}
```

Importación dinámica dentro de `register`, como recomienda la guía (N3).

### 1.6 Aviso visible — **requiere ampliar territorio (P1)**

- `app/aviso-modo-local.tsx` (nuevo, Server Component, sin `"use client"`):
  `export async function AvisoModoLocal()` → `await connection();` (de `next/server`) →
  `if (!segundoFactorAutomaticoActivo()) return null;` → un bloque a todo el ancho,
  `bg-destructive text-destructive-foreground`, texto `t('modoLocal.aviso')`, sin botón de
  cerrar (nada de controles sin acción real), sin `role="alert"` (se anunciaría en cada
  página). Un `<p>` dentro de un `<div>`.
- `app/layout.tsx`: dentro de `<body>`, **antes** de `{children}`:
  `<Suspense fallback={null}><AvisoModoLocal /></Suspense>`. El `Suspense` es obligatorio con
  `cacheComponents: true` (regla de `.claude/rules/nextjs.md`): el resto del documento sigue
  prerenderizándose; solo el aviso es un hueco dinámico.
- `lib/i18n/es.ts`: clave nueva `modoLocal.aviso` = «Desarrollo local: el segundo factor se
  supera solo con las cuentas sembradas. Esto no es un entorno real.»
- `app/aviso-modo-local.test.tsx` (nuevo): finge `next/server` (`connection` resuelta) y
  `modo-desarrollo`; `false` → `null`; `true` → el texto del catálogo; lanza → la promesa
  rechaza con `ErrorModoLocal`.

### 1.7 `.env.example` (modificar)

Al final, comentada (apagada por defecto):

```
# SOLO DESARROLLO LOCAL — en un despliegue NO se define. Con valor `activo`, al iniciar
# sesión con una cuenta de `npm run seed` el TOTP se supera solo (T-033). Si está puesta
# y NEXT_PUBLIC_SUPABASE_URL no es http://127.0.0.1 o http://localhost, el servidor no
# arranca. Cualquier otro valor que no sea `activo` también lo detiene.
# SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo
```

### 1.8 `docs/architecture.md` (modificar)

Una frase tras «…un PIN, jamás.» (`:238-239`): el modo local existe, se evalúa en servidor
(`lib/cuentas/modo-desarrollo.ts`, variable sin `NEXT_PUBLIC_`), solo supera factores cuyo
secreto está en `seed-completo.sql`, y exige Supabase en `127.0.0.1`/`localhost`, cosa que
ninguna instancia de producción (Supabase en la nube, §Topología) puede cumplir; mal puesto,
el servidor no arranca.

### Lo que NO se modifica, y el revisor lo comprueba

`proxy.ts`, `lib/cuentas/primer-acceso.ts`, `lib/cuentas/primer-acceso.test.ts`,
`app/primera-vez/**`, `supabase/**`, `next.config.ts`, `package.json`. Están en el territorio
(los tres primeros grupos) porque el contrato contemplaba la opción (a); con (b) sobran.

---

## 2 · Decisiones y alternativas descartadas

### D1 · Mecanismo: **(b)**, pasar el segundo factor de verdad, en la Server Action de inicio de sesión, y solo para factores sembrados

**Argumento.** (a) obliga a elegir entre romper el criterio 3 o tocar la base: con la guardia
saltada la sesión sigue en `aal1`, `fijar_pin_historia()` lanza `42501` (H3, H4) y sin PIN no
se abre ninguna historia. Y cualquier relajación en SQL viaja a producción con las
migraciones. (b) produce una sesión `aal2` **real** emitida por GoTrue, con
`last_challenged_at` recién puesto, así que la base acepta el PIN y los códigos exactamente
igual que en producción, sin una línea de SQL. Y la guardia no se toca: el camino de
producción es byte a byte el mismo.

**Dónde**: en `iniciarSesion` (servidor) y no en la pantalla del reto. Así el secreto y el
código nunca salen del servidor (H11 garantiza que la sesión `aal2` viaja en las cookies de
esa misma respuesta), el usuario no ve `/primera-vez` y llega a `/pacientes` en una sola
navegación.

**Solo factores sembrados** (el punto que el contrato dejaba abierto): el modo supera
únicamente un factor cuyo id está en `FACTORES_SEMBRADOS`. **Un usuario invitado en local**
enrola y teclea su código como en producción, y en las entradas siguientes también: su secreto
no lo conoce el servidor, y el modo no lo aprende.

Este recorte es la segunda barrera que hace el fallo **imposible** y no solo improbable. Aunque
el modo llegara a activarse en un despliegue real (D2 lo impide), no podría superar el segundo
factor de **ninguna cuenta real**, porque su secreto no está en el repositorio. Lo más que
haría es superar un factor sembrado, que en producción no existe, porque `seed-completo.sql`
no se aplica allí. Y si se aplicara, sus secretos ya serían públicos en el repositorio de
todos modos.

**Códigos de recuperación**: el pase automático no los genera. En producción se generan en
`/primera-vez` tras verificar (H13), y el modo no pasa por ahí. El modo no promete
recuperación: es para entrar.

Descartadas:
- **(a) saltarse la guardia**: rompe el criterio 3 sin tocar SQL (H4). Contraria a la regla
  del contrato.
- **Calcular el código en el navegador** (en `segundo-factor.tsx`): obliga a mandar el secreto
  al cliente y deja el nombre del modo cerca del bundle estático (criterio 5).
- **Pase automático también para invitados**, con el secreto que devuelve `enroll()`: amplía
  el modo a cuentas que no son de la siembra. Con el modo activo por error, deja cuentas nuevas
  con un factor que nadie ha escaneado.
- **Borrar y reenrolar el factor en cada entrada** (Admin API): muta `auth.mfa_factors`,
  rompe la entrada normal cuando se apaga el modo y vale para cualquier cuenta.
- **Leer el secreto de `auth.mfa_factors`**: la Admin API no lo devuelve y `auth` no está
  expuesto por PostgREST. Haría falta conexión directa a Postgres, una dependencia nueva fuera
  del contrato.

### D2 · Qué cuenta como «local»: variable **`SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo`** y `urlSupabase` con `protocol === 'http:'` y `hostname ∈ {127.0.0.1, localhost}`; `NODE_ENV` no participa

**Argumento.**
- **Las dos condiciones a la vez**: la variable expresa la intención y la URL expresa el hecho.
  La URL que se comprueba es la constante `urlSupabase` (H14), la misma con la que hablan todos
  los clientes. No hay una «URL de comprobación» distinta de la URL de verdad que pueda
  desincronizarse.
- **`NODE_ENV` fuera**: el contrato ya dice que no basta. Además, si contara, mataría el uso
  que motiva el ticket: Playwright y el CI de T-014 corren `next start` (`production`) contra
  Supabase en 127.0.0.1 (H15). La prueba de la matriz demuestra que no cambia nada.
- **Falla cerrado, en tres capas**:
  1. **Al arrancar**: `instrumentation.ts` evalúa el modo en `register()`, y si lanza, el
     proceso sale con código 1 (N4). En Vercel, cada arranque en frío falla.
  2. **En cada uso**: la función lanza `ErrorModoLocal` cada vez que se evalúa con la variable
     puesta y la URL remota. Se evalúa en cada inicio de sesión (antes de
     `signInWithPassword`) y en cada render de cualquier página (aviso del layout raíz). Si la
     capa 1 faltara, el servicio da 500 en todo.
  3. **Estructural** (D1): aunque las dos capas cayeran, el modo solo conoce factores de la
     siembra.
- **Valor exacto `activo`**: cualquier otro valor no vacío detiene el proceso. Un `true` o
  un `1` no se interpreta: se rechaza.
- **Sin el puerto, con `http:`**: el CLI de Supabase sirve en `http`, y el puerto es
  configurable (`config.toml`), así que exigirlo no añade seguridad. El hecho decisivo es que un
  Supabase en bucle local no puede servir a un despliegue en Vercel (H16).
- **Dónde se evalúa**: en `lib/cuentas/modo-desarrollo.ts` (`server-only`), con lectura
  literal de `process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL`, en tiempo de petición. Nunca
  `NEXT_PUBLIC_*` (N1): una variable pública se congelaría en el bundle del navegador.

Descartadas:
- `NODE_ENV !== 'production'`: rompe el CI de T-014 y no protege `next start` local.
- Variable sola: es justo lo que se pone mal en un despliegue.
- Reconocer la clave anónima de demostración del CLI (`iss: supabase-demo`): ata el diseño a
  un detalle del CLI que cambia entre versiones (claves `sb_publishable_…`).
- Fallar en `next.config.ts` (falla también el build): fuera de territorio, y la capa 3 ya hace
  que no aporte seguridad nueva. Ver «Lo que no entra».
- Comprobar en `proxy.ts`: la capa 2 ya cubre cada página. Además, tocar `proxy.ts` obligaría
  a tocar `proxy.test.ts`, que está fuera de territorio (H19), y rompería la propiedad «la
  guardia no cambia».

### D3 · Visibilidad: franja permanente en el layout raíz, evaluada por petición, y aviso en la terminal al arrancar

**Argumento.** Para que se vea en **todas** las pantallas (login, `/primera-vez`, el espacio de
trabajo), el único sitio es `app/layout.tsx`. Se lee con `connection()` porque con Cache
Components el layout se prerenderiza: sin esa llamada, la franja se decidiría en `next build`.
Un build hecho sin la variable y arrancado con ella mostraría el modo activo **sin aviso**
(N1). El `Suspense` deja el resto del documento estático. Usa el color `destructive`, que ya
tiene su par de contraste comprobado. Y el `console.warn` de `register()` lo deja escrito en
la terminal del que arranca.

Descartadas:
- Aviso solo en `/login` y `/primera-vez` (lo único dentro del territorio actual): no es
  «permanente», porque desaparece en cuanto se entra.
- Cabecera HTTP desde `proxy.ts`: no se ve.

---

## 3 · Cómo se cierra cada criterio de aceptación

| # | Criterio | Comprobación que lo demuestra |
|---|---|---|
| 1 | Apagado por defecto | `npm test -- lib/cuentas/modo-desarrollo app/login/acciones`: los cuatro casos «ausente» de la matriz dan `false`; `superarSegundoFactorSembrado` con el modo inactivo devuelve `'inactivo'` sin llamar a MFA; el caso 1 de la acción no lo invoca. A mano: `.env.local` sin la variable, `npm run dev`, entrar con `ana@psicogestion.test`/`psico1234` → `/primera-vez` pide el código. Captura. |
| 2 | Encendido en local, `aal2` | A mano: `npx supabase db reset && npm run seed`, `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` en `.env.local`, `npm run dev`. Entrar con ana → aterriza en `/pacientes` sin pasar por `/primera-vez` (`/agenda` no existe aún, H9). Para el nivel: un guion **de evidencia, fuera del repositorio** (en el scratchpad) que, con `tsx` y `@supabase/supabase-js` contra `http://127.0.0.1:54321`, hace `signInWithPassword(ana)` y `superarSegundoFactorSembrado(cliente)`, e imprime `getAuthenticatorAssuranceLevel()` → `currentLevel: 'aal2'`. Se pega la salida en `evidencia.json`. Para importar el módulo fuera de Next, el guion pone `NODE_OPTIONS=--conditions=react-server` o un alias equivalente, porque `server-only` lanza fuera de esa condición. |
| 3 | El PIN sigue funcionando | El mismo guion, tras el pase: `rpc('fijar_pin_historia', { p_pin: '123456' })` (el PIN sembrado de Ana, así que no cambia nada) → sin error. Es la llamada exacta que hace `fijarPinHistoria()`, y el criterio queda cerrado con lo que llamaría la Server Action (regla de `.claude/rules/supabase.md`, T-013a). En pantalla: `docker exec … psql -U postgres -c "delete from public.pines_historia where perfil_id = '22222222-2222-4222-8222-222222222222'"` (Bruno, solo en local), entrar con bruno → `/primera-vez` pide el PIN → fijarlo → «PIN fijado» y paso a `/pacientes`. Captura. |
| 4 | Falla cerrado | Matriz de 8 casos (variable × URL × `NODE_ENV`) más las URL adversarias y los valores raros en `modo-desarrollo.test.ts`. A mano, para la capa 1: `npm run build` y luego `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` con `npm start` sobre un build hecho con `NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co` → el proceso termina con código ≠ 0 y el mensaje propio en la salida (`echo $?`). Se pega la salida. |
| 5 | Nada en el navegador | `npm run build` con la variable puesta y URL local, luego `grep -rl "SEGUNDO_FACTOR_AUTOMATICO_LOCAL\|SEMILLATOTPDEMO\|modo-desarrollo" .next/static` → sin resultados (exit 1). Se pega el comando y su código de salida. |
| 6 | La base no cambia | `git diff --stat main -- supabase/` → vacío. |
| 7 | Visible | Captura de `/login` y de `/pacientes` con la franja, con el modo activo. Captura de `/login` sin la franja, con el modo apagado. |
| 8 | Suites y territorio | `npm test`, `npm run lint`, `npm run build` limpios; `npm run test:rls` exit 0 (no cambia nada en la base, pero se corre); `node ~/.claude/pipeline/territorio.mjs T-033` en verde **con el territorio ampliado** (P1). |

**Prueba que falla primero**: `lib/cuentas/modo-desarrollo.test.ts` se escribe entera antes
del módulo. Tiene que fallar por **«no se puede resolver `./modo-desarrollo`»**, no por
aserción. Después, `app/login/acciones.test.ts`, cuyo caso 2 falla porque
`superarSegundoFactorSembrado` no se llama (`expected to be called`).

---

## 4 · Riesgos, por probabilidad

1. **(Alta) R1 · Reloj de Docker desfasado en Windows/WSL2** tras suspender el equipo. GoTrue
   tolera ±1 periodo (30 s); con más desfase, el código no vale y `challengeAndVerify` falla.
   Efecto: se cae al flujo normal (`/primera-vez`) con el aviso en consola. Falla cerrado, no
   abierto. Arreglo de entorno: `wsl --shutdown` o reiniciar Docker. Se anota en la bitácora.
2. **(Media) R2 · Límites de Auth en lotes de Playwright** (T-014): `sign_in_sign_ups = 30` y
   `token_verifications = 30` cada 5 min por IP (`supabase/config.toml`). Muchas entradas
   seguidas en CI pueden chocar. No es de este ticket (no se toca `config.toml`). Lo hereda
   T-014, que debería reutilizar `storageState`. Además, si GoTrue rechaza reutilizar el mismo
   código dentro de los 30 s, dos entradas del mismo usuario en paralelo caerían al flujo
   normal. Mismo remedio.
3. **(Media) R3 · `server-only` dentro de `instrumentation.ts` con Turbopack.** En webpack la
   capa `instrument` resuelve `server-only` a vacío (N5); en Turbopack no lo he podido leer. Si
   `npm run build` o `npm start` fallan por eso, la salida es **fija y no la decide el
   implementador**: se retira `instrumentation.ts`, el criterio 4 se cierra por su segunda vía
   (la función lanza con mensaje propio, capas 2 y 3) y se anota en `state.md`. No se quita
   `server-only` del módulo.
4. **(Baja) R4 · La franja convierte cada página en una con hueco dinámico.** Con el
   `Suspense` el resto se sigue prerenderizando. Si `npm run build` avisa
   `blocking-prerender-*`, el `Suspense` está mal colocado.
5. **(Baja) R5 · La ventana de 5 minutos del PIN**: si el usuario tarda más de 5 minutos en la
   pantalla del PIN tras el pase, `fijar_pin_historia()` devuelve `42501`. Es idéntico en
   producción tras teclear el TOTP: no lo introduce este ticket. En local basta con salir y
   volver a entrar.
6. **(Baja) R6 · Deriva de la siembra**: si cambian ids o secretos en `seed-completo.sql`,
   el modo cae al flujo normal. La prueba de deriva lo detecta en `npm test`.

---

## 5 · Qué revisar

Para los dos revisores y para la autoevaluación del implementador. Cada punto dice qué buscar
y qué tiene que pasar.

**Puertas por las que el modo podría saltarse la barrera**

1. **`'use server'` en `lib/cuentas/modo-desarrollo.ts`**: no puede estar. Con esa directiva,
   `superarSegundoFactorSembrado` y `codigoTotp` serían endpoints públicos llamables desde el
   navegador. `grep -n "use server" lib/cuentas/modo-desarrollo.ts` → nada. Tampoco puede
   reexportarse desde ningún fichero `'use server'` (`app/login/acciones.ts` lo **importa**,
   no lo reexporta: comprobar que no hay `export { … } from '@/lib/cuentas/modo-desarrollo'`).
2. **Igualdad exacta del host**: `HOSTS_LOCALES.has(new URL(url).hostname)` y
   `protocol === 'http:'`. Cualquier `includes`, `startsWith`, `endsWith` o expresión regular
   sobre la URL es un rechazo. Las pruebas adversarias de §1.2 (`localhost.evil.com`,
   `127.0.0.1.nip.io`, `127.0.0.1@evil.com`, `?h=127.0.0.1`) tienen que **fallar** si se cambia
   `.has(hostname)` por `url.includes('127.0.0.1')`. El revisor lo comprueba mutando a mano.
3. **Orden en `decidirModoSegundoFactor`**: ausente o vacía → `false` **antes** de parsear la
   URL. La prueba «ausente no parsea» (`undefined, 'no-es-una-url'` → `false`) falla si se
   parsea primero. Es lo que garantiza que producción, sin la variable, no gana ningún camino
   de error nuevo.
4. **Valor exacto**: `'activo'` y nada más. `'true'`, `'1'`, `' activo'` y `'ACTIVO'` lanzan.
   Un `.trim()`, `.toLowerCase()` o `Boolean(variable)` es un rechazo.
5. **`NODE_ENV` no aparece** en el módulo (`grep NODE_ENV lib/cuentas/modo-desarrollo.ts` →
   nada). La matriz de 8 casos se ejecuta sobre `segundoFactorAutomaticoActivo()` con
   `vi.resetModules()` y la importación dinámica. Si se ejecuta sobre la función pura, la
   dimensión `NODE_ENV` es vacía y no prueba nada.
6. **Solo factores sembrados**: el `find` es por `FACTORES_SEMBRADOS.has(f.id)`. La prueba
   GEMELA (factor verificado con id aleatorio → `'sin_factor_sembrado'` y `challengeAndVerify`
   **no** llamado) falla si se cambia por «el primer factor verificado». Es la capa 3 de D2: si
   esta prueba no existe o pasa por otro motivo, el diseño pierde su garantía principal.
7. **Recomprobación interna**: `superarSegundoFactorSembrado` empieza por
   `segundoFactorAutomaticoActivo()`. La prueba «modo inactivo → `'inactivo'` y ninguna llamada
   a MFA» falla si se quita.
8. **Orden en `iniciarSesion`**: el modo se evalúa **antes** de `signInWithPassword` (caso 4 de
   `acciones.test.ts`: lanza y `signInWithPassword` no se llama). Si se evalúa después, una
   configuración mal puesta crearía la sesión `aal1` antes de fallar.

**Secretos y navegador**

9. Ni el secreto ni el código se devuelven, se registran ni se pasan como prop. Buscar
   `console.` en el módulo: solo `error.code` y textos fijos.
10. `import 'server-only'` es la **primera** línea del módulo. Ningún fichero con
    `"use client"` importa `modo-desarrollo` (`grep -rl modo-desarrollo app components` → solo
    `app/login/acciones.ts`, `app/aviso-modo-local.tsx` y sus pruebas).
11. Criterio 5 ejecutado sobre un build **con la variable puesta**. Un build sin ella no prueba
    nada.
12. La lectura es literal: `process.env.SEGUNDO_FACTOR_AUTOMATICO_LOCAL`, nunca
    `process.env[nombre]` ni con prefijo `NEXT_PUBLIC_`.

**Lo que no debe cambiar**

13. `git diff main -- proxy.ts lib/cuentas/primer-acceso.ts lib/cuentas/primer-acceso.test.ts app/primera-vez supabase next.config.ts package.json package-lock.json`
    → vacío. Si `proxy.ts` o `primer-acceso.ts` cambian, la propiedad «el camino de producción
    es el mismo» ya no se sostiene y hay que justificarlo.
14. `redirect('/pacientes')` sigue fuera de cualquier `try`; el pase no envuelve el
    `redirect`.
15. El pase **no** genera códigos de recuperación ni llama a `enroll()` ni a la Admin API
    (`crearClienteAdministracion` no aparece en el módulo).

**Visibilidad y Next 16**

16. `AvisoModoLocal` llama a `await connection()` **antes** de leer el modo, y está dentro de
    `<Suspense>` en `app/layout.tsx`. Prueba manual: build **sin** la variable, `npm start`
    **con** ella → la franja aparece. Si no aparece, se está leyendo en build.
17. `instrumentation.ts`: importación dinámica dentro de `register()`, solo con
    `NEXT_RUNTIME === 'nodejs'`, y sin `try/catch` alrededor de la evaluación. Un `catch` que
    trague el error anula la capa 1.
18. El texto del aviso está en `lib/i18n/es.ts`; `sin-literales.test.ts` sigue en verde sin
    añadir excepciones.

**Concurrencia, null y duplicados**

19. `data.totp` vacío o `null` → `'sin_factor_sembrado'`, sin excepción (`?.` / `?? []`).
20. Dos entradas simultáneas del mismo usuario sembrado: la segunda puede fallar al verificar
    (R2). Tiene que devolver `'fallo'` y caer al flujo normal, nunca lanzar ni dejar la sesión
    a medias.

---

## 6 · Territorio

El contrato declara su territorio. Este diseño **usa** de él: `lib/cuentas/modo-desarrollo.ts`,
`lib/cuentas/modo-desarrollo.test.ts`, `app/login/**` (`acciones.ts`, `acciones.test.ts`),
`.env.example` y `docs/architecture.md`. **No usa** `proxy.ts`,
`lib/cuentas/primer-acceso*.ts` ni `app/primera-vez/**`.

**P1 · Pregunta al propietario (ampliación de territorio, necesaria para D2-capa 1 y D3):**

```
  - instrumentation.ts                 # nuevo: el servidor no arranca si está mal puesto
  - app/layout.tsx                     # la franja en todas las pantallas
  - app/aviso-modo-local.tsx           # nuevo: el componente de la franja
  - app/aviso-modo-local.test.tsx      # nuevo
  - lib/i18n/es.ts                     # una clave: modoLocal.aviso
```

Si se deniega:
- Sin `instrumentation.ts`, el criterio 4 se cierra por su segunda vía (la función lanza con
  mensaje propio). Se pierde «no arranca» y queda «da 500 en cada página», porque la franja se
  evalúa en cada render.
- Sin `app/layout.tsx` ni `lib/i18n/es.ts`, el criterio 7 **no se puede cumplir**: un aviso
  solo en `/login` y `/primera-vez` no es permanente, y el texto no puede ser literal (H17). En
  ese caso es un BLOQUEO del criterio 7.

---

## 7 · Delegable

Nada con sentido. Lo único sin comportamiento es la frase de `docs/architecture.md`, el
bloque de `.env.example` y la clave del catálogo: tres líneas cada uno, más caras de encargar
que de escribir. `codigoTotp` es una función pura con vectores RFC, pero vive en el mismo
módulo que la puerta y es la pieza que un error convierte en silencio («el código no vale»
parece un fallo de reloj). La escribe la fábrica.

---

## Lo que no entra, y por qué

- **Pase automático para invitados en local** (D1): ampliaría el modo a cuentas que no son de
  la siembra.
- **Tocar `/primera-vez`** (por ejemplo, autopase en la pantalla del reto para sesiones que ya
  estaban en `aal1` antes de encender el modo): basta con salir y volver a entrar.
- **Fallar en `next build`** (`next.config.ts`): fuera de territorio. La capa 3 ya hace que
  activar el modo en producción no supere ninguna cuenta real.
- **Ajustar límites de Auth en `config.toml`** para el CI de T-014 (R2): fuera de alcance por
  contrato.
- **Guion de integración comiteado** para el criterio 2: `scripts/` no está en territorio. El
  guion de evidencia vive en el scratchpad y su salida va a `evidencia.json`. Si se quiere en
  el repositorio, es un ticket de T-014.

## Hallazgo para `docs/state.md` (no se arregla aquí)

**H13 · `/primera-vez` regenera los códigos de recuperación en cada entrada con TOTP**, no
solo al activar (`app/primera-vez/segundo-factor.tsx:106`, llamado en cada `verify` correcto).
Cada inicio de sesión invalida el lote anterior (`generar_codigos_recuperacion()` caduca el
lote sin usar, migración `:574-578`) y enseña diez códigos nuevos. El ADR-039 dice «generados
al activar y mostrados una vez». Severidad media, es comportamiento de producción y necesita
su propio ticket.
