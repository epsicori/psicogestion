## Diseño aprobado

### 0 · Hechos verificados (no re-verificar, sí respetar)

**Next.js 16 — leído en `node_modules/next/dist/docs/`:**

| Qué dice | Consecuencia |
|---|---|
| El middleware se llama ahora **Proxy**: fichero `proxy.ts` en la raíz, export nombrado `proxy`. `middleware.ts` está deprecado | El fichero es `proxy.ts`, **no** `middleware.ts` |
| El runtime de `proxy` es `nodejs` y **no es configurable** | Prohibido `export const runtime = 'edge'` |
| Las Server Functions llegan como POST a su ruta; un matcher que excluya un path también salta el Proxy | El Proxy es guardia **optimista**: cada Server Action revalida sesión por su cuenta |
| `cookies()` es **async**; el acceso síncrono está eliminado. `.set()` solo vale en Server Function o Route Handler | `const almacen = await cookies()`; el `setAll` del cliente de servidor va en `try/catch` |
| Firma real: `NextResponse.next({ request: { headers } })` | No `NextResponse.next({ request: peticion })` |
| `revalidatePath` hace que la respuesta de la acción lleve el RSC Payload re-renderizado | La lista se actualiza en el mismo viaje, sin `router.refresh()` |
| `revalidateTag` **exige** segundo argumento en 16 | Usar `revalidatePath` |
| `next lint` eliminado; `next build` **ya no ejecuta lint** | `npm run lint` y `npm run build` son dos comprobaciones independientes |
| `redirect` lanza `NEXT_REDIRECT` | Siempre **fuera** del `try` |

**Supabase local — leído en `supabase/config.toml` y en los `.d.ts` de `@supabase/ssr`:**

- **`auto_expose_new_tables` está sin definir → las tablas nuevas NO se exponen.** Sin
  `GRANT` explícitos todo falla con `permission denied` aunque las políticas sean
  perfectas. **Este es el riesgo número uno del ticket.**
- `enable_confirmations = false` → los usuarios sembrados entran sin confirmar correo.
- `[db.seed] sql_paths = ["./seed.sql"]` → `supabase/seed.sql` se ejecuta solo en cada
  `db reset`. Es el sitio correcto para sembrar.
- `CookieMethodsServer` es `{ getAll, setAll }`; `setAll` recibe **dos** parámetros:
  `(cookiesAEscribir, cabeceras)`. Las cabeceras son anti-caché y hay que aplicarlas a la
  respuesta en el Proxy. `get/set/remove` están deprecados.
- Credenciales reales de esta máquina (`npx supabase status`), **no teclear de memoria**:
  - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH`
  - Contenedor de base de datos: **`supabase_db_Psicogestion`** (verificado con `docker ps`)
  - Studio: `http://127.0.0.1:54323`

### 1 · Migración

`npx supabase migration new base_perfiles_pacientes_auditoria`. Orden dentro del fichero:
extensión → enum → tablas → funciones → RLS y políticas → grants → triggers.

**Extensión y enum**: `pgcrypto` en `extensions` (lo necesita el seed para `crypt`);
`create type public.rol_usuario as enum ('administrador','profesional_sanitario','tecnico_administrativo')`
— los tres, aunque T-000 use uno: el enum es lo más caro de migrar después.

**`public.perfiles`**: `id uuid pk references auth.users(id) on delete cascade`,
`nombre_completo text not null`, `rol public.rol_usuario not null`,
`creado_en timestamptz not null default now()`.

**`public.pacientes`**: `id uuid pk default gen_random_uuid()`,
`nombre text not null check (length(trim(nombre)) > 0)`, `apellidos` igual,
`profesional_id uuid not null references public.perfiles(id)`,
`creado_en timestamptz not null default now()`.
Más `create index pacientes_profesional_id_idx on public.pacientes (profesional_id)`.

**`public.auditoria`** — genérica desde el minuto uno: `id bigint generated always as identity pk`,
`ocurrido_en timestamptz not null default now()`, `actor_id uuid` **nullable y sin FK**
(la siembra escribe sin JWT, y un registro de auditoría sobrevive al borrado del usuario),
`tabla text not null`, `operacion text not null check (operacion in ('INSERT','UPDATE','DELETE'))`,
`registro_id text not null` (text, no uuid, para que el mismo trigger valga en T-004),
`estado_anterior jsonb`, `estado_posterior jsonb`.
Índice `(actor_id, ocurrido_en desc)`.

**`rol_actual()`** — `language sql`, `stable`, `security definer`, `set search_path = ''`,
devuelve el rol de `public.perfiles` where `id = (select auth.uid())`.
`revoke execute from public; grant execute to authenticated`.

*Solución a la recursión, en tres capas obligatorias:*
1. **`security definer`** → se ejecuta como `postgres`, propietario de `perfiles`, que
   está **exento de RLS** mientras la tabla no esté en `FORCE`. Regla permanente:
   **`perfiles` nunca lleva `force row level security`** (comentario en la migración).
2. **`search_path = ''`** → evita secuestro de resolución de nombres; obliga a cualificar
   todo (`public.perfiles`, `auth.uid()`).
3. **Ninguna política sobre `perfiles` invoca `rol_actual()`** — solo `auth.uid()`. Hace
   la recursión imposible por construcción.

*Descartado*: guardar el rol en el JWT. Quedaría cacheado hasta la renovación y revocar
un rol no tendría efecto inmediato — inaceptable con datos clínicos.

**`fn_auditar()`** — `plpgsql`, `security definer`, `search_path = ''`. Usa `TG_OP`,
`TG_TABLE_NAME`, `to_jsonb(old/new)` y `->> 'id'`. Trigger `after insert or update or delete`.
Como es `security definer` con propietario exento de RLS, **`auditoria` no necesita
política de `insert` para `authenticated`** — y así un cliente no puede fabricar registros.
Convención de nombre: `auditar_<tabla>`.

**Solo adición (invariante 2) — doble cerrojo:**
- `fn_impedir_modificacion()`: trigger `before update or delete` que hace `raise exception`
  con `errcode = '42501'`. Genérica vía `TG_TABLE_NAME`, para reutilizarla en T-004.
- `revoke update, delete on table public.auditoria from public, anon, authenticated, service_role, postgres`.

Cada cerrojo tapa un agujero del otro: el `revoke` da el `permission denied` que pide el
criterio 6 pero no frena a un superusuario; el trigger sí, y lanza el mismo SQLSTATE.

**RLS**: `enable row level security` en las tres tablas.

| Tabla | Política | Op | Expresión |
|---|---|---|---|
| `perfiles` | `perfiles_lectura_propia` | select | `using ( id = (select auth.uid()) )` — **sin `rol_actual()`** |
| `pacientes` | `pacientes_lectura_profesional_propio` | select | `using ( (select public.rol_actual()) = 'profesional_sanitario' and profesional_id = (select auth.uid()) )` |
| `pacientes` | `pacientes_alta_profesional_propio` | insert | `with check (` misma expresión `)` |
| `auditoria` | `auditoria_lectura_propia` | select | `using ( actor_id = (select auth.uid()) )` |

Todas `to authenticated`. Sin políticas de update/delete: lo no concedido está denegado.
**`(select auth.uid())` entre paréntesis** convierte la llamada en InitPlan evaluado una
vez por sentencia en lugar de una por fila — patrón que se copia veinte veces.

Consecuencia asumida: en T-000 un `administrador` no ve ningún paciente. Es fallo cerrado;
T-001 añade su rama.

**GRANTS — el paso que si falta rompe todo en silencio:**
```
grant usage on schema public to authenticated;
grant select         on table public.perfiles  to authenticated;
grant select, insert on table public.pacientes to authenticated;
grant select         on table public.auditoria to authenticated;
```
Ni un `grant` a `anon`. Comentario en la migración explicando el porqué.

### 2 · Siembra

`supabase/seed.sql` — lo ejecuta `db reset` automáticamente. **No crear `npm run seed`**
(eso es T-008). UUID fijos y legibles:

| | UUID | Correo | Contraseña | Paciente |
|---|---|---|---|---|
| A | `11111111-1111-4111-8111-111111111111` | `ana@psicogestion.test` | `psico1234` | Lucía Márquez |
| B | `22222222-2222-4222-8222-222222222222` | `bruno@psicogestion.test` | `psico1234` | Diego Ferrer |

Orden: `auth.users` → `auth.identities` → `public.perfiles` → `public.pacientes`.
Ambos con rol `profesional_sanitario`.

`auth.users` necesita: `instance_id` (`'00000000-...'`), `id`, `aud` y `role`
(`'authenticated'`), `email`, `encrypted_password = extensions.crypt('psico1234', extensions.gen_salt('bf'))`,
`email_confirmed_at = now()`, `created_at`, `updated_at`,
`raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb`, `raw_user_meta_data = '{}'::jsonb`.

`auth.identities` necesita: `id`, `user_id`, `provider='email'`, `provider_id=<user_id>::text`,
`identity_data = jsonb_build_object('sub', <user_id>::text, 'email', <correo>)`, fechas.
**Sin la fila en `auth.identities` el login por contraseña falla** — es el error clásico.

> **Verificación previa obligatoria**: el esquema de GoTrue cambia entre versiones, no se
> inventa. Antes de escribir el seed, ejecutar
> `docker exec supabase_db_Psicogestion psql -U postgres -d postgres -c "\d auth.users" -c "\d auth.identities"`
> y ajustar las columnas a lo que devuelva.

Las filas de `pacientes` del seed disparan el trigger con `auth.uid()` nulo → dos
registros con `actor_id = null`. Es correcto; el criterio 5 se mide con sesión.

*Descartado*: sembrar con script `tsx` y clave de servicio. Rompería la propiedad de que
`db reset` deja la base lista de una vez, que es justo lo que mide el criterio 1.

### 3 · Ficheros

| Ruta | Responsabilidad |
|---|---|
| `.env.local` | Crear con las dos variables de arriba (ya ignorado por git) |
| `.env.example` | Mismos nombres, valores vacíos |
| `lib/supabase/config.ts` | Lee y valida las dos variables; error legible si faltan |
| `lib/supabase/tipos-bd.ts` | **Generado**, no escrito a mano |
| `lib/supabase/navegador.ts` | `crearClienteNavegador()` con `createBrowserClient` |
| `lib/supabase/servidor.ts` | `crearClienteServidor()` con `createServerClient` + `next/headers` |
| `lib/supabase/sesion.ts` | `obtenerUsuario()` y `exigirSesion()` |
| `lib/formularios.ts` | Tipo `EstadoFormulario` y `ESTADO_INICIAL` |
| `proxy.ts` | Refresca sesión y guardia optimista de rutas |
| `app/layout.tsx` | Modificar: `lang="es"` y metadatos |
| `app/page.tsx` | Reemplazar plantilla por `redirect('/pacientes')` |
| `app/login/esquemas.ts` · `acciones.ts` · `formulario-login.tsx` · `page.tsx` | Login |
| `app/pacientes/esquemas.ts` · `acciones.ts` · `formulario-nuevo-paciente.tsx` · `page.tsx` | Lista y alta |
| `scripts/t000-rls.sql` | Guion de verificación de criterios 3–6 |
| `package.json` | Añadir `"tipos": "supabase gen types typescript --local > lib/supabase/tipos-bd.ts"` |

**`getUser()`, nunca `getSession()`**, para decidir autorización en servidor: `getSession()`
no valida el token contra el servidor de Auth. Regla para los veinte tickets siguientes.

**Zod 4, no Zod 3**: mensajes con `{ error: '...' }` (no `invalid_type_error`), aplanado con
`z.flattenError(resultado.error)` (no `.flatten()`), `z.email()` de nivel superior (no
`z.string().email()`). **La guía `02-guides/forms.md` de Next muestra sintaxis de Zod 3:
no copiarla literalmente.**

**Cuerpo de `crearPaciente`** — el patrón que copian los veinte tickets siguientes, en
este orden exacto:
1. `const { supabase, usuario } = await exigirSesion()` — la autorización se comprueba
   **dentro** de la acción, no se hereda del Proxy.
2. `safeParse` del esquema; si falla, devolver `errores` aplanados.
3. `insert({ ...datos, profesional_id: usuario.id })` — **`profesional_id` sale de la
   sesión, jamás del formulario**, aunque RLS lo rechazaría igual.
4. Si el error es `42501`, mensaje genérico, no el texto de Postgres.
5. `revalidatePath('/pacientes')` y devolver. Sin `redirect`.

`iniciarSesion`: Zod → `signInWithPassword` → error genérico «Credenciales no válidas»
(no revelar si el correo existe) → `redirect('/pacientes')` fuera del `try`.

**`proxy.ts`**, en este orden: crear `respuesta` → `createServerClient` cuyo
`setAll(cookies, cabeceras)` escribe en `peticion.cookies`, **recrea** `respuesta` y
escribe en `respuesta.cookies` aplicando las cabeceras anti-caché → `await getUser()`
(**esta llamada es la que refresca el token**) → guardia optimista → `return respuesta`.
**Entre `getUser()` y el `return` no puede haber ningún `NextResponse.next()` nuevo** o se
pierden las cookies renovadas: es el fallo más frecuente de este patrón.
Matcher que excluya `_next/static`, `_next/image`, `favicon.ico` e imágenes.

**Interfaz**: `<form>`, `<label>`, `<input>`, `<ul>` y cuatro clases de Tailwind.
`aria-live="polite"` en el mensaje de error.
**En T-000 no se usa `react-hook-form`**: `useActionState` + `required` nativo en cliente
y Zod en servidor. Los esquemas ya viven en módulo compartido y RHF entrará en T-007 con
el sistema de diseño. Deuda consciente, anotada en `docs/state.md`.

### 4 · Verificación de cada criterio

Preparación: `npx supabase db reset` y `npm run tipos`.

| # | Comprobación exacta |
|---|---|
| 1 | `npx supabase db reset` termina con `Finished supabase db reset.` y sin `ERROR:` |
| 2 | `npm run lint` sin salida **y** `npm run build` sin errores — son dos, `build` ya no lintea |
| 3 | En `scripts/t000-rls.sql`: `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"1111...","role":"authenticated"}'; select count(*), min(nombre) from public.pacientes; rollback;` → 1 fila, la de A. Repetir con B |
| 4 | Con claims de A: `insert ... profesional_id = <uuid de B>` → `ERROR: new row violates row-level security policy` (42501). **Comprobar además que el insert legítimo sí pasa**: una política que lo rechaza todo también «aprobaría» este criterio |
| 5 | Tras el insert legítimo: `select count(*), actor_id, tabla, operacion from public.auditoria where registro_id = <id>` → 1 fila, `actor_id` = uuid de A, `INSERT` |
| 6 | Como `postgres`: `update public.auditoria set tabla='x'` → `permission denied for table auditoria`. Luego `grant update,delete ... to postgres` y repetir → `ERROR: La tabla auditoria es de solo adición` (42501). `rollback` |
| 7 | Con `npm run dev`: `curl -sS -o /dev/null -D - http://localhost:3000/pacientes` → `307` y `location: /login` |
| 8 | Guion manual con `ana@` y `bruno@`, contraseña `psico1234` |

Ejecutar el guion SQL con
`docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t000-rls.sql`.

### 5 · Riesgos, por orden de probabilidad

1. **Los GRANT.** Si faltan, todo falla con `permission denied` y el instinto será tocar
   las políticas RLS, que estarán bien. Ante ese error, mirar primero los grants.
2. **`FORCE ROW LEVEL SECURITY` sobre `perfiles`** reintroduce la recursión. Nadie lo añade.
3. **Esquema de `auth.identities`.** Inspeccionar con `\d` antes de escribir el seed.
   Síntoma si falla: `db reset` verde pero «Invalid login credentials» al entrar.
4. **Cookies perdidas en el Proxy.** Síntoma: la sesión se cae sola a los ~55 minutos.
5. **`site_url` es `127.0.0.1:3000` y el guion usa `localhost:3000`.** Son dominios de
   cookie distintos: **usar una sola de las dos formas** durante toda la prueba, o
   parecerá que el login no persiste.
6. **`tipos-bd.ts` es generado.** `db reset` y `npm run tipos` van siempre juntos.
7. Un usuario creado a mano en Studio no tendrá perfil → no verá nada. Fallo cerrado,
   correcto pero desconcertante. El disparador que crea el perfil es de T-002.
