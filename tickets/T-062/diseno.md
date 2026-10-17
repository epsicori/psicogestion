# T-062 · Diseño · Calendario del profesional en su móvil (suscripción .ics)

Arquitecto · 17-10-2026 · base main `475e3f5`. Contrato: `tickets/T-062-calendario-ics.md`.
Propuesta de partición: **T-062a** (base, ruta pública, riesgo alto) y **T-062b** (Mi cuenta, riesgo medio). Este diseño sirve a los dos; §1.A es de T-062a y §1.B de T-062b.

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| El alcance está cerrado en la fila T-062 del plan, etapa 2: contenido «Cita · centro · modalidad» más el enlace al día; código largo del que se guarda solo la huella; Mi cuenta para crear, copiar, ver el último acceso y revocar; revocación en la baja; −30 a +90 días; sin anuladas; sin el código en los registros; límite de peticiones; auditoría de alta y revocación; «solo el propio profesional, sin enlace para administrador ni técnico» | `docs/plan-puesta-en-marcha.md:51` |
| Ningún ADR trata de calendario, ICS ni rutas con código. Aplican ADR-032 (la baja quita el acceso), ADR-034 (el hecho es un instante), ADR-043 (nada de un paciente se cachea) y ADR-065 (el director sanitario es `administrador` y tiene citas propias) | `docs/decisions.md` |
| `citas` tiene `id, paciente_id, profesional_id, centro_id` (nulable), `tipo_terapia_id, serie_id, inicio, fin` (timestamptz), `zona_horaria` (NOT NULL), `estado, sala, nota_operativa, modalidad_asistencia` (enum `presencial`/`online`, NOT NULL) | `lib/supabase/tipos-bd.ts:688-764` |
| `estado_cita` tiene cinco valores: programada, confirmada, realizada, cancelada, no_asistida. La anulada es `cancelada` | ADR-045; migración de agenda de T-010 |
| Índice `citas_profesional_inicio_idx (profesional_id, inicio)` | migración de agenda de T-010 |
| `centros.nombre` es NOT NULL | `lib/supabase/tipos-bd.ts:639-654` |
| `auditoria(id, ocurrido_en, actor_id` nulable sin FK`, tabla, operacion, registro_id text, estado_anterior, estado_posterior)`. La última versión de `auditoria_operacion_check` admite `INSERT` y `UPDATE` entre otros | `20260815192424_base_perfiles_pacientes_auditoria.sql:51-63`; `20260916120000_alta_de_paciente_completa.sql:382-395` |
| La política `auditoria_lectura_propia` deja a cada uno leer las filas con `actor_id = auth.uid()`: lo que se audite lo ve quien lo hizo | `20260815192424:195-199` |
| `dar_de_baja_perfil` (sin redefiniciones posteriores) exige `rol_actual() = 'administrador'`, hace `update perfiles set estado = 'baja'` y audita insertando directamente en `auditoria` | `20260830090000_cuentas_invitacion_baja_totp.sql:402-470` |
| Sobre `perfiles` hay un constraint trigger `impedir_baja_ultimo_administrador` (AFTER UPDATE OR DELETE). No hay ningún disparador AFTER UPDATE OF estado | `20260822094547_esquema_base_organizacion_paciente_historia.sql:1376-1381` |
| Precedente de código generado en la base: `regenerar_codigos_recuperacion` con `extensions.gen_random_bytes`, guarda solo la huella y devuelve el código una vez | `20261008120000_regenerar_codigos_recuperacion.sql:380-470` |
| `registro_postgres_seguro()` evalúa si Postgres registraría los parámetros de una RPC. La usa la acción de T-038 antes de mandar la contraseña | `20261008120000:225-254`; `app/(app)/cuenta/acciones.ts:60-69` |
| `proxy.ts`: `RUTAS_PUBLICAS = ['/login', '/prototipo', '/api/facturacion/drenar']`. El matcher solo excluye estáticos e imágenes: una ruta `.ics` pasa por el proxy y, sin sesión, se redirige a `/login` | `proxy.ts:10,59-82,123-125` |
| Patrón de ruta de la casa: `await connection()`, `Cache-Control: private, no-store` y `catch` con un mensaje fijo que no registra el error | `app/api/facturacion/drenar/route.ts`; `app/api/avisos/route.ts` |
| Pruebas de ruta: `vi.mock('server-only')`, `vi.mock('next/server', () => ({ connection: async () => {} }))` y peticiones `new Request(...)` | `app/api/facturacion/drenar/route.test.ts:1-30` |
| Next.js 16: un GET es dinámico si lee la petición o llama a `connection()`. `RouteContext<'/ruta/[x]'>` es global y `ctx.params` es una promesa | `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`; `.../03-file-conventions/route.md:82-121` |
| `next dev` registra cada petición entrante con su ruta. `logging.incomingRequests.ignore` acepta expresiones regulares y solo afecta a desarrollo. `next.config.ts` ya apaga `serverFunctions` por T-038 | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md`; `next.config.ts` |
| `hrefAgenda({vista, fecha, centro, profesional})` devuelve `/agenda?vista=…&fecha=AAAA-MM-DD&centro=…`. `centro` acepta un uuid o `'todos'`. No hay vista de día | `app/(app)/agenda/parametros.ts:5,48-60` |
| `lib/supabase/config.ts` exporta `urlSupabase` y `claveAnonSupabase`. `administracion.ts` es la clave de servicio, solo para la Admin API | `lib/supabase/config.ts`; `lib/supabase/` |
| `t(clave)` y `tCon(clave, {hueco})` con huecos `{nombre}`. Una clave que no existe no compila | `lib/i18n/index.ts:20-50` |
| `/cuenta`: Server Component con `exigirSesion()`, `FormularioRegenerar` y `ListaAvisos`. Las horas se formatean en servidor con `formatearFechaCorta` y `formatearHora` en la zona de `organizacion`. Los ids de los encabezados están en `ids.ts` | `app/(app)/cuenta/page.tsx`; `lista-avisos.tsx:1-74`; `ids.ts` |
| `Sesion = { supabase, usuario }` y `ResultadoCuentas<T>`, que nunca lanza | `lib/cuentas/tipos.ts` |
| Primitivas de interfaz disponibles: `dialogo.tsx`, `button.tsx`, `field.tsx`, `foco.ts` | `components/ui/` |
| El linter de migraciones exige que una tabla se cree con `enable row level security` en el mismo fichero, y `set search_path` en toda función `security definer` | `scripts/lint-migraciones.ts:270-318` |
| Anclas anuales del banco en uso: +1, 3, 4, 6–13; T-053 toma +14, T-055 +15 y T-056 +16; T-058 se presume en +17. **El módulo 40 toma Y+18** | `scripts/rls/README.md:126-160`; contratos de T-055 y T-056 |
| Ayudantes del banco: `assert`, `assert_lanza_codigo`, `assert_lanza_codigo_msg`, `assert_no_lanza`, `contar`, `como`, `reset_sesion`. Fijación: `:ADM`, `:PRO1`, `:TEC1`, `:CA`, `:CB`. Perfiles propios se crean en `auth.users` con metadata (módulo 34) | `scripts/rls/00-ayudantes.sql`; `01-fijacion.sql:4-12`; `34-agenda-anual.sql:183-215` |

**Registros de Vercel** (búsqueda web, 17-10-2026): el registro de peticiones guarda la ruta completa con sus parámetros, sin opción documentada para redactarla. Retención: 1 h en Hobby, 24 h en Pro y 30 días con Observability Plus. Es la pregunta 2 del contrato.

## 1 · Piezas y contratos

### 1.A · T-062a

#### 1.A.1 · Migración `supabase/migrations/20261022120000_calendario_ics.sql`

Antes de escribirla: `ls supabase/migrations | tail -3` debe acabar en `20261021120000` (T-058). Si T-058 no está en main, se para y se avisa: no se reordena.

**Tabla**

```sql
create table public.suscripciones_calendario (
  id                     uuid primary key default gen_random_uuid(),
  perfil_id              uuid not null references public.perfiles(id),
  codigo_huella          bytea not null unique check (octet_length(codigo_huella) = 32),
  sal_uid                bytea not null check (octet_length(sal_uid) = 32),
  creada_en              timestamptz not null default now(),
  revocada_en            timestamptz,
  motivo_revocacion      text check (motivo_revocacion in ('titular', 'sustituida', 'baja')),
  ultimo_acceso_en       timestamptz,
  ventana_desde          timestamptz,
  peticiones_en_ventana  integer not null default 0 check (peticiones_en_ventana >= 0),
  constraint suscripciones_calendario_revocacion_coherente
    check ((revocada_en is null) = (motivo_revocacion is null))
);
create unique index suscripciones_calendario_una_activa
  on public.suscripciones_calendario (perfil_id) where revocada_en is null;
alter table public.suscripciones_calendario enable row level security;
-- Sin políticas, a propósito: solo se toca por las funciones de abajo.
revoke all on table public.suscripciones_calendario from public, anon, authenticated, service_role;
```

Además, lo que exige `.claude/rules/supabase.md`: revocar los privilegios por defecto que Supabase da a las tablas y funciones nuevas, y comprobar con `\dp public.suscripciones_calendario` que no queda ninguna concesión salvo la del dueño.

**Disparadores de la tabla** (funciones `security definer`, `set search_path = ''`, sin `execute` para nadie):
- `fn_suscripciones_calendario_guarda` BEFORE UPDATE. Lanza 42501 «suscripción de calendario: columna inmutable» si cambian `perfil_id`, `codigo_huella`, `sal_uid` o `creada_en`. Lanza 42501 «suscripción revocada no se reabre» si `old.revocada_en` no es nulo y cambia `revocada_en` o `motivo_revocacion`.
- `fn_suscripciones_calendario_sin_borrado` BEFORE DELETE (por fila) y BEFORE TRUNCATE (por sentencia). Lanza 42501 «las suscripciones de calendario no se borran: se revocan».

**Auditoría.** Se inserta directamente en `public.auditoria` (precedente: `dar_de_baja_perfil`), con `tabla = 'suscripciones_calendario'` y `registro_id = id::text`. **No se toca `auditoria_operacion_check`.** Hay dos formas:
- alta: `operacion = 'INSERT'`, `estado_posterior = {perfil_id, creada_en}`;
- revocación: `operacion = 'UPDATE'`, `estado_anterior = {revocada_en: null}`, `estado_posterior = {perfil_id, revocada_en, motivo_revocacion}`.

Nunca entran `codigo_huella`, `sal_uid`, el contador ni `ultimo_acceso_en`. El `actor_id` es `auth.uid()`: en la baja es el administrador que la da, y nulo si la hace `postgres`.

**Funciones.** Todas `set search_path = ''`, con `comment on function`, `revoke execute … from public, anon, authenticated, service_role` y después solo el `grant` indicado. Los fragmentos de error son únicos en el repositorio: se comprueba con `rg`.

1. `public.calendario_crear_suscripcion() returns text` · volatile · security definer · **grant a authenticated**.
   1. `v_uid := auth.uid()`. Si es nulo: 42501 «No hay sesión.».
   2. `(select public.rol_actual())` no está en (`profesional_sanitario`, `administrador`): 42501 «calendario: tu rol no tiene calendario». `rol_actual()` es nulo si el perfil no está activo, así que la misma guarda cubre la suspensión y la baja.
   3. `perform pg_advisory_xact_lock(hashtextextended('suscripciones_calendario:' || v_uid::text, 0))`.
   4. `update … set revocada_en = now(), motivo_revocacion = 'sustituida' where perfil_id = v_uid and revocada_en is null returning id`. Si había una, se audita la revocación.
   5. `v_codigo := rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=')`, que da 43 caracteres base64url.
   6. `insert (perfil_id, codigo_huella, sal_uid) values (v_uid, extensions.digest(convert_to(v_codigo, 'UTF8'), 'sha256'), extensions.gen_random_bytes(32)) returning id, creada_en`. Se audita el alta.
   7. `return v_codigo`. Es la única vez que el código existe fuera del cliente.

2. `public.calendario_revocar_suscripcion() returns boolean` · volatile · security definer · **grant a authenticated**.
   - Sesión nula: 42501 «No hay sesión.». `rol_actual()` nulo: 42501 (mismo fragmento que en 1.2).
   - `update … set revocada_en = now(), motivo_revocacion = 'titular' where perfil_id = v_uid and revocada_en is null returning id`. Si hay fila, se audita y devuelve `true`; si no, devuelve `false` **sin auditar**. Es idempotente.
   - No tiene parámetros: no hay forma de nombrar la suscripción de otro.

3. `public.calendario_mi_suscripcion() returns jsonb` · stable · security definer · **grant a authenticated**.
   - Sesión nula: 42501 «No hay sesión.».
   - Rol fuera de los dos: `{"disponible": false}`. No lanza, para que la página no necesite saber el rol.
   - Si no: `{"disponible": true, "activa": bool, "creada_en": ts|null, "ultimo_acceso_en": ts|null}` de la fila activa. Exactamente esas claves.

4. `public.calendario_ics(p_codigo text) returns jsonb` · volatile · security definer · **grant solo a anon**.
   1. Si `p_codigo is null or p_codigo !~ '^[A-Za-z0-9_-]{43}$'`: `return '{"estado":"no_encontrado"}'`. **Nunca lanza** con una entrada mala.
   2. `v_huella := extensions.digest(convert_to(p_codigo, 'UTF8'), 'sha256')`.
   3. Un solo UPDATE atómico. Es el límite y el último acceso a la vez:
      ```sql
      update public.suscripciones_calendario s
         set ventana_desde = case when s.ventana_desde is null or s.ventana_desde <= now() - interval '1 hour'
                                  then now() else s.ventana_desde end,
             peticiones_en_ventana = case when s.ventana_desde is null or s.ventana_desde <= now() - interval '1 hour'
                                          then 1 else s.peticiones_en_ventana + 1 end,
             ultimo_acceso_en = now()
       where s.codigo_huella = v_huella
         and s.revocada_en is null
         and exists (select 1 from public.perfiles p
                      where p.id = s.perfil_id
                        and p.estado = 'activo'
                        and p.rol in ('profesional_sanitario', 'administrador'))
      returning s.perfil_id, s.sal_uid, s.peticiones_en_ventana into v_perfil, v_sal, v_peticiones;
      ```
   4. Si no hay fila: `{"estado":"no_encontrado"}`. Si `v_peticiones > 60`: `{"estado":"limite"}`.
   5. Si no: `jsonb_build_object('estado', 'ok', 'eventos', public.calendario_eventos_ventana(v_perfil, v_sal, now()))`.

   Esta función repite a mano lo que la política exigiría (regla de `supabase.md`). El perfil sale de la huella y nunca del llamante. Además exige perfil activo y uno de los dos roles.

5. `public.calendario_eventos_ventana(p_perfil_id uuid, p_sal bytea, p_ahora timestamptz) returns jsonb` · stable · **security invoker** · **sin `execute` para nadie**. Desde `calendario_ics` corre con el dueño. Si alguien le diera permiso por error, `anon` no lee `citas` y devolvería `[]`.
   ```sql
   select coalesce(jsonb_agg(jsonb_build_object(
            'uid',         encode(extensions.hmac(convert_to(c.id::text, 'UTF8'), p_sal, 'sha256'), 'hex'),
            'inicio',      to_char(c.inicio at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'fin',         to_char(c.fin    at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'fecha_local', to_char((c.inicio at time zone c.zona_horaria)::date, 'YYYY-MM-DD'),
            'centro',      ce.nombre,
            'modalidad',   c.modalidad_asistencia::text
          ) order by c.inicio, c.id), '[]'::jsonb)
     from public.citas c
     left join public.centros ce on ce.id = c.centro_id
    where c.profesional_id = p_perfil_id
      and c.estado <> 'cancelada'
      and c.inicio >= p_ahora - interval '30 days'
      and c.inicio <  p_ahora + interval '90 days';
   ```
   La firma de `extensions.hmac(bytea, bytea, text)` se comprueba con `\df extensions.hmac` antes de escribirla.

6. **Baja.** `public.fn_revocar_calendario_en_baja()` es una función de disparador, `security definer`, `set search_path = ''` y sin `execute`. Disparador:
   ```sql
   create trigger revocar_calendario_en_baja
     after update of estado on public.perfiles
     for each row
     when (new.estado = 'baja' and old.estado is distinct from 'baja')
     execute function public.fn_revocar_calendario_en_baja();
   ```
   Revoca la activa de `new.id` con motivo `baja` y la audita con `actor_id = auth.uid()`. Cubre `dar_de_baja_perfil` y cualquier otro camino. **No se toca `dar_de_baja_perfil`.**

   La suspensión no revoca: `calendario_ics` exige `estado = 'activo'` y el enlace vuelve a funcionar al reactivar el perfil. Así lo dice la decisión D6.

#### 1.A.2 · Banco `scripts/rls/40-calendario-ics.sql`

- **Ancla: Y+18.** Comprobado libre: +14, +15 y +16 están cogidos y +17 se presume de T-058.
  ```sql
  select (extract(year from now())::int + 18) as anio_40 \gset
  select (make_date(:anio_40, 6, 1) + ((8 - extract(isodow from make_date(:anio_40, 6, 1))::int) % 7))::text as lunes_40 \gset
  ```
  Fila del README: `| 40 (T-062) | PRO40A/CA, PRO40B/CA, PRO40C/CA propios; ADM y TEC1 de la fijación | primer lunes de junio de Y+18 −30 días .. +90 días · now() + 2..4 días (feed real) |`. La lista de la regla 2 se amplía con `40:NN → +18`, con la línea real.
- **Perfiles propios** (`auth.users` con metadata, como el módulo 34): PRO40A, PRO40B y PRO40C (`profesional_sanitario`, centro CA), sus pacientes P40A y P40B, y el tipo `TT40` «Terapia T-062». Con `descanso_activo = false` si las citas van contiguas.
- **Citas de PRO40A:**
  - para el feed real (banda corta):
    - `C40_HOY` a `now() + interval '2 days'`, con `sala = 'Sala cuarenta'`, `nota_operativa = 'Nota cuarenta reservada'` y centro CA;
    - `C40_ONLINE` a `now() + interval '3 days'`, sin centro y online;
    - `C40_ANULADA` a `now() + interval '4 days'`, `cancelada`;
  - para la ventana: cinco citas alrededor de `T0 = (:'lunes_40'::date + time '10:00') at time zone 'Europe/Madrid'`:
    - `T0 − 30 días` exacto: entra;
    - `T0 − 30 días − 1 minuto`: no entra;
    - `T0 + 90 días − 1 minuto`: entra;
    - `T0 + 90 días`: no entra;
    - `T0 + 1 día` `no_asistida`: entra.
  - **PRO40B** tiene una cita a `now() + interval '2 days'`, que no debe salir en el feed de PRO40A.
- Ayudante local `pg_temp.como_anonimo()`: `set local role anon` y `set local request.jwt.claims = '{"role":"anon"}'`.

Bloques, en este orden. Cada negativa lleva su gemela positiva:

1. **Catálogo.** Se comprueba:
   - `relrowsecurity` activo y `pg_policies` vacío para la tabla;
   - `has_table_privilege` falso para `anon`, `authenticated` y `service_role` con `select, insert, update, delete, truncate`;
   - `has_function_privilege`: `anon` solo `calendario_ics`; `authenticated` solo crear, revocar y mi; nadie `calendario_eventos_ventana` ni las funciones de disparador;
   - las cinco funciones son `prosecdef` y `proconfig` contiene `search_path=""` (la ventana es invoker).
2. **La tabla, cerrada:**
   - como PRO40A, `select`, `update` y `delete` sobre la tabla: 42501;
   - como `anon`, `select`: 42501;
   - como `authenticated`, `select public.calendario_ics('x')`: 42501.
3. **Alta.** Como PRO40A, `select public.calendario_crear_suscripcion() as cod40 \gset`. Se comprueba:
   - `length = 43` y el formato;
   - `codigo_huella = digest(:'cod40')`;
   - el código no aparece en `to_jsonb(s)::text` de ninguna fila de la tabla ni en ninguna fila de `auditoria`;
   - hay una fila de auditoría `INSERT` con `actor_id = PRO40A` y las claves de `estado_posterior` exactamente `{creada_en, perfil_id}`.
4. **Quién puede crear:**
   - TEC1: 42501 «calendario: tu rol no tiene calendario»;
   - ADM: crea (gemela, pregunta 1);
   - `authenticated` sin `sub`: 42501 «No hay sesión.»;
   - `anon`: 42501, porque no tiene permiso.
5. **Una activa por perfil:**
   - como `postgres`, insertar a mano una segunda activa de PRO40A: 23505;
   - «Crear otro» como PRO40A: la anterior queda revocada con `sustituida` y su fila `UPDATE` de auditoría, y `:'cod40'` pasa a dar `no_encontrado`;
   - el código nuevo (`cod40b`) da `ok`.
6. **Feed y contenido**, como `anon` con `cod40b`:
   - `estado = 'ok'` y las claves de nivel superior son exactamente `{estado, eventos}`;
   - cada evento tiene exactamente `{centro, fecha_local, fin, inicio, modalidad, uid}`;
   - están `C40_HOY` y `C40_ONLINE` (`centro` nulo, `modalidad = 'online'`), y no están `C40_ANULADA` ni la cita de PRO40B (se buscan por `inicio`);
   - el texto del resultado no contiene, con `strpos = 0`: ningún `id` de cita, el nombre ni los apellidos de P40A, «Terapia T-062», «Sala cuarenta» ni «Nota cuarenta reservada»;
   - `uid` tiene 64 caracteres hex y no es `c.id::text` ni `encode(digest(c.id::text, 'sha256'), 'hex')`;
   - es estable entre dos llamadas y distinto del que daba `cod40` para la misma cita (se guarda antes de sustituir).
7. **Ventana**, como `postgres`, con `calendario_eventos_ventana(PRO40A, sal, T0)`: los cuatro bordes y la `no_asistida`, contando por `inicio`.
8. **Entradas malas, sin lanzar** (`assert_no_lanza` y `estado = 'no_encontrado'`): `null`, `''`, 42 caracteres, 44 caracteres, un carácter fuera del alfabeto, y un código válido de forma pero inexistente.
9. **Límite:**
   - con `cod40b` recién usado, como `postgres` se fija `peticiones_en_ventana = 0` y `ventana_desde = now()`;
   - como `anon`, 60 llamadas dan `ok` (en un `do`) y la 61 da `limite`;
   - como `postgres` se pone `ventana_desde = now() - interval '59 minutes'`: la siguiente sigue en `limite` (gemela);
   - con `now() - interval '61 minutes'`, la siguiente da `ok` y deja `peticiones_en_ventana = 1`.
10. **Último acceso.** Como `postgres` se pone `ultimo_acceso_en = null`, una llamada `anon` lo deja en `now()`, y `calendario_mi_suscripcion()` como PRO40A lo devuelve. Como PRO40B, `activa = false`. Como TEC1, `{"disponible": false}`.
11. **Revocación:**
    - como PRO40B, `calendario_revocar_suscripcion()` da `false` y la de PRO40A sigue activa;
    - como PRO40A da `true`, y la segunda vez `false`; la cuenta de filas `UPDATE … titular` de auditoría sube en 1, no en 2;
    - `cod40b` da `no_encontrado`.
12. **Inmutable y sin borrado** (como `postgres`):
    - reabrir una revocada: 42501 «suscripción revocada no se reabre»;
    - cambiar `codigo_huella`: 42501 «columna inmutable»;
    - `delete` y `truncate`: 42501 «no se borran: se revocan».
13. **Suspensión y baja:**
    - PRO40B crea; como `postgres`, `update perfiles set estado = 'suspendido'`: el feed da `no_encontrado` y la fila sigue con `revocada_en` nulo. Se vuelve a `activo` y el feed da `ok`;
    - después, como ADM, `dar_de_baja_perfil(PRO40B)`: revocada con `baja` y fila `UPDATE` de auditoría con `actor_id = ADM`;
    - PRO40C crea; como `postgres`, `update perfiles set estado = 'baja'`: revocada con `baja`.

#### 1.A.3 · Node

**`lib/supabase/anonimo.ts`** (`import 'server-only'`):
```ts
export function crearClienteAnonimo(): SupabaseClient<Database>
// createClient<Database>(urlSupabase, claveAnonSupabase,
//   { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
```

**`lib/agenda/ics.ts`** es puro: sin reloj, sin red, sin i18n.
```ts
export type EventoIcs = {
  uid: string;      // 64 hex
  inicio: string;   // AAAA-MM-DDTHH:MM:SSZ
  fin: string;
  resumen: string;  // ya compuesto
  enlace: string;   // URL absoluta
};
export function escaparTexto(valor: string): string        // \ → \\, ; → \;, , → \,, \r?\n → \n
export function plegarLinea(linea: string): string         // ≤ 75 octetos por línea física, CRLF + espacio, sin partir un punto de código
export function serializarCalendario(e: {
  nombre: string; dtstamp: string; eventos: readonly EventoIcs[];
}): string
```
- La salida, con CRLF en cada línea (también la última):
  ```
  BEGIN:VCALENDAR
  VERSION:2.0
  PRODID:-//Psicogestion//Calendario//ES
  CALSCALE:GREGORIAN
  METHOD:PUBLISH
  X-WR-CALNAME:<nombre>
  REFRESH-INTERVAL;VALUE=DURATION:PT1H
  X-PUBLISHED-TTL:PT1H
  ```
  y por evento:
  ```
  BEGIN:VEVENT
  UID:<uid>@psicogestion
  DTSTAMP
  DTSTART
  DTEND
  SUMMARY:<escapado>
  URL:<enlace>
  DESCRIPTION:<enlace escapado>
  TRANSP:OPAQUE
  END:VEVENT
  ```
  y al final `END:VCALENDAR`.
- Las fechas pasan de `AAAA-MM-DDTHH:MM:SSZ` a `AAAAMMDDTHHMMSSZ`. Una entrada que no case con la expresión lanza `Error('fecha ICS mal formada')`; la ruta lo captura.
- **Nunca** emite `LOCATION`, `ATTENDEE`, `ORGANIZER`, `CATEGORIES` ni `GEO`.

**`lib/citas/calendario-ics.ts`** (`import 'server-only'`):
```ts
export const esquemaEventoDeCalendario = z.object({
  uid: z.string().regex(/^[0-9a-f]{64}$/),
  inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
  fecha_local: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  centro: z.string().nullable(),
  modalidad: z.enum(['presencial', 'online']),
}).strict();
export const esquemaRespuestaCalendario = z.discriminatedUnion('estado', [
  z.object({ estado: z.literal('no_encontrado') }).strict(),
  z.object({ estado: z.literal('limite') }).strict(),
  z.object({ estado: z.literal('ok'), eventos: z.array(esquemaEventoDeCalendario) }).strict(),
]);
export type EventoDeCalendario = z.infer<typeof esquemaEventoDeCalendario>;
export type ResultadoCalendario =
  | { estado: 'no_encontrado' } | { estado: 'limite' }
  | { estado: 'ok'; eventos: EventoDeCalendario[] } | { estado: 'fallo' };

/** Nunca lanza ni registra. Un error de la RPC o una forma inesperada es 'fallo'. */
export async function leerCalendario(cliente: SupabaseClient<Database>, codigo: string): Promise<ResultadoCalendario>
// cliente.rpc('calendario_ics', { p_codigo: codigo }): POST, el código va en el cuerpo

/** «Cita · {centro} · {modalidad}», o «Cita · {modalidad}» sin centro, y el enlace del día. */
export function aEventosIcs(eventos: readonly EventoDeCalendario[], enlaceDelDia: (fechaLocal: string) => string): EventoIcs[]
```

**Claves de i18n** (`lib/i18n/es.ts`, bloque `calendario.ics`):
- `nombre: 'Psicogestión · mis citas'`;
- `resumen: 'Cita · {centro} · {modalidad}'`;
- `resumenSinCentro: 'Cita · {modalidad}'`;
- `modalidad: { presencial: 'Presencial', online: 'Online' }`.

**`app/api/calendario/[archivo]/route.ts`**
```ts
import { connection } from 'next/server';
const CABECERAS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' } as const;
const NOMBRE = /^([A-Za-z0-9_-]{43})\.ics$/;
export async function GET(request: Request, ctx: RouteContext<'/api/calendario/[archivo]'>): Promise<Response>
```
1. `await connection()`. `const { archivo } = await ctx.params`.
2. Si `archivo` no casa con `NOMBRE`, devuelve 404 con `CABECERAS` y cuerpo vacío. **No llama a la base.**
3. Todo lo demás va dentro de un `try` y llama a `leerCalendario(crearClienteAnonimo(), codigo)`. Según el resultado:
   - `no_encontrado`: 404;
   - `limite`: 429 con `Retry-After: 3600`;
   - `fallo`: 503 con `console.error('[calendario] ics', 'fallo')`;
   - `ok`: `origen = new URL(request.url).origin`;
     `enlaceDelDia = f => new URL(hrefAgenda({ vista: 'semana', fecha: f, centro: 'todos', profesional: null }), origen).toString()`;
     `serializarCalendario({ nombre: t('calendario.ics.nombre'), dtstamp: new Date().toISOString(), eventos: aEventosIcs(r.eventos, enlaceDelDia) })`.
     Responde 200 con `Content-Type: text/calendar; charset=utf-8` y `Content-Disposition: inline; filename="psicogestion.ics"`.
4. `catch` (sin variable): `console.error('[calendario] ics', 'fallo')` y 503. Nunca se registran `request.url`, `archivo`, el código ni el error.
5. `hrefAgenda` se importa de `@/app/(app)/agenda/parametros`: es la única fuente de la forma de la URL de la agenda.
6. Solo se exporta `GET`. Lo que Next haga con `HEAD` se mira con `curl -I` y se anota en la bitácora. No es criterio.

**`proxy.ts`**: `RUTAS_PUBLICAS` añade `'/api/calendario'`, con un comentario que diga que la credencial es el código y que la ruta no lee cookies.

**`next.config.ts`**: `logging: { serverFunctions: false, incomingRequests: { ignore: [/^\/api\/calendario\//] } }`, con un comentario que cite T-062 y la guía `logging.md`.

#### 1.A.4 · Pruebas unitarias de T-062a
- `lib/agenda/ics.test.ts`:
  - CRLF en todas las líneas;
  - una línea de 200 octetos con «ó» y «·» se pliega a ≤ 75 octetos sin partir un carácter, y desplegada recupera el original;
  - el escape de `\ ; ,` y del salto de línea en SUMMARY;
  - las fechas en `Z`;
  - una fecha mala lanza;
  - la salida no contiene `LOCATION`, `ATTENDEE`, `ORGANIZER`, `CATEGORIES` ni `GEO`;
  - un calendario sin eventos es válido (VCALENDAR sin VEVENT).
- `lib/citas/calendario-ics.test.ts`, con un cliente falso:
  - las tres formas válidas se aceptan;
  - `ok` con un evento con la clave `sala` da `fallo`;
  - un `estado` desconocido da `fallo`;
  - un error de la RPC da `fallo`;
  - la RPC recibe `{ p_codigo }` y nada más;
  - `aEventosIcs` con y sin centro.
- `app/api/calendario/[archivo]/route.test.ts`:
  - `leerCalendario` y `crearClienteAnonimo` van simulados, y `console.error`, `console.log` y `console.warn` espiados;
  - `abc.ics`, un código de 43 caracteres sin `.ics` y uno de 44 con `.ics`: 404 y `leerCalendario` no se llama;
  - `no_encontrado` da 404, `limite` 429 con `Retry-After`, y `ok` 200 con `text/calendar`;
  - las tres cabeceras de `CABECERAS` en **todas** las respuestas;
  - `leerCalendario` lanza → 503;
  - `fallo` → 503;
  - en ningún caso ningún espía de `console.*` recibe un argumento que contenga el código. Es la prueba del criterio «el código no queda en los registros».

#### 1.A.5 · Mutantes (`tickets/T-062/mutantes.json` y `tickets/T-062/mutantes/Mnn.sql`)

Forma `{ "ticket": "T-062", "metodo": "...", "mutantes": [{ "id", "cambio", "cae" }] }`. Cada uno se mide con:
```
( echo "begin;"; cat tickets/T-062/mutantes/Mnn.sql; cat scripts/rls/00-ayudantes.sql scripts/rls/01-fijacion.sql scripts/rls/40-calendario-ics.sql; echo "rollback;" ) | docker exec -i supabase_db_Psicogestion psql -U postgres -v ON_ERROR_STOP=1
```

| Id | Cambio | Debe caer en |
|---|---|---|
| M01 | `grant execute on function calendario_ics(text) to authenticated` | bloque 1 (catálogo) y bloque 2 |
| M02 | `grant select on suscripciones_calendario to authenticated` | bloque 1 y bloque 2 |
| M03 | la ventana sin `c.estado <> 'cancelada'` | bloque 6 (`C40_ANULADA` presente) |
| M04 | `c.inicio >= p_ahora - 30 días` → `>` | bloque 7, borde −30 exacto |
| M05 | sin el límite inferior de la ventana | bloque 7, −30 días −1 minuto |
| M06 | `c.inicio < p_ahora + 90 días` → `<=` | bloque 7, borde +90 exacto |
| M07 | `calendario_ics` sin `p.estado = 'activo'` | bloque 13, suspendido da `ok` |
| M08 | `calendario_ics` sin `s.revocada_en is null` | bloques 5 y 11, código revocado da `ok` |
| M09 | `uid` = `c.id::text` | bloque 6 (`strpos` del id y forma del uid) |
| M10 | `uid` = `encode(digest(c.id::text,'sha256'),'hex')`, sin sal | bloque 6 (distinto entre suscripciones, distinto del hash sin sal) |
| M11 | el evento lleva `'sala', c.sala` | bloque 6 (claves exactas y `strpos`) |
| M12 | `drop trigger revocar_calendario_en_baja` | bloque 13 (baja por `update` y por `dar_de_baja_perfil`) |
| M13 | el límite `> 60` → `> 100000` | bloque 9, la 61 da `ok` |
| M14 | el reinicio con `<= now() - interval '2 hours'` | bloque 9, a los 61 minutos sigue `limite` |
| M15 | crear sin la guarda de rol | bloque 4, el técnico crea |
| M16 | `drop index suscripciones_calendario_una_activa` | bloque 5 (no hay 23505) |
| M17 | la auditoría del alta lleva `codigo_huella` | bloque 3 (claves exactas de `estado_posterior`) |
| M18 | revocar audita aunque no haya fila activa | bloque 11 (la cuenta sube 2) |
| M19 | `drop trigger` de la guarda de UPDATE | bloque 12 (reabrir pasa) |

### 1.B · T-062b

**`lib/cuentas/calendario.ts`** (sin `next/*`; recibe la `Sesion` de `lib/cuentas/tipos.ts`):
```ts
export type EstadoCalendario =
  | { disponible: false }
  | { disponible: true; activa: boolean; creadaEn: string | null; ultimoAccesoEn: string | null };
export async function leerMiCalendario(sesion: Sesion): Promise<ResultadoCuentas<{ estado: EstadoCalendario }>>
export async function crearEnlaceCalendario(sesion: Sesion): Promise<ResultadoCuentas<{ codigo: string }>>
export async function revocarEnlaceCalendario(sesion: Sesion): Promise<ResultadoCuentas<{ revocada: boolean }>>
```
La salida de `calendario_mi_suscripcion` se valida con Zod `.strict()`; si no casa, `ok: false`. El código devuelto se valida con `/^[A-Za-z0-9_-]{43}$/`. Ninguna de las tres registra el código.

**`app/(app)/cuenta/acciones.ts`**, dos acciones nuevas:
```ts
export type EstadoEnlaceCalendario = EstadoFormulario & { codigo?: string };
export async function crearEnlaceCalendarioAccion(datos: unknown): Promise<EstadoEnlaceCalendario>
export async function revocarEnlaceCalendarioAccion(datos: unknown): Promise<EstadoFormulario>
```
- Las dos llaman a `exigirSesion()` primero y validan `datos` con `z.object({}).strict()`: cualquier campo, `perfil_id` incluido, se rechaza.
- Ninguna revalida: refresca el cliente, como en T-038.

**`app/(app)/cuenta/page.tsx`**: una sección nueva entre Seguridad y Avisos, en su propio `<Suspense>`. La pinta un Server Component que:
- llama a `leerMiCalendario`;
- con `disponible: false` no pinta nada;
- formatea `creadaEn` y `ultimoAccesoEn` con `formatearFechaCorta` y `formatearHora` en la zona de `organizacion`, como `lista-avisos.tsx`;
- pasa cadenas ya formateadas a `calendario.tsx`.

**`app/(app)/cuenta/calendario.tsx`** (`'use client'`). Recibe `{ activa: boolean; activaDesde: string | null; ultimoAcceso: string | null }`.

Las tres fases:
- **Sin enlace:**
  - el texto «Tus citas en el calendario del móvil. Solo se ve "Cita", el centro y si es presencial u online; nunca el paciente.»;
  - el botón «Crear enlace».
- **Recién creado:** una región `role="region"` con `aria-labelledby` y su encabezado (id en `ids.ts`) recibe el foco. Contiene:
  - la URL completa en un `<input readOnly>` con etiqueta, compuesta en el manejador del clic como `` `${location.origin}/api/calendario/${codigo}.ics` `` (nunca en el render);
  - «Copiar», con `navigator.clipboard.writeText` y el resultado («Copiado» o «No se ha podido copiar: selecciónalo a mano») en `role="status"`;
  - el aviso «Este enlace solo se muestra ahora. Quien lo tenga ve tus horarios.»;
  - «Ya lo he copiado», que llama a `router.refresh()` y lleva el foco al encabezado de la sección.
- **Activo:**
  - «Activo desde {fecha} · Último acceso {fecha} {hora}», o «Sin accesos todavía»;
  - «Crear otro» y «Revocar», cada uno con un diálogo de confirmación (`components/ui/dialogo.tsx`): «El enlace anterior dejará de funcionar en todos los calendarios donde lo hayas añadido.»;
  - al confirmar «Revocar»: acción, `router.refresh()` y el foco al encabezado;
  - al confirmar «Crear otro»: la misma fase «recién creado».

El código vive solo en el estado del componente y desaparece al recargar. La URL larga va en un campo con `w-full min-w-0`, sin desplazamiento horizontal a 360 px.

**Claves de i18n**: bloque `cuenta.calendario` (`titulo`, `explicacion`, `crear`, `crearOtro`, `revocar`, `copiar`, `copiado`, `copiaFallida`, `soloAhora`, `yaCopiado`, `activoDesde`, `ultimoAcceso`, `sinAccesos`, `confirmarSustituir`, `confirmarRevocar`, `etiquetaUrl`, `errores.generico`).

**`docs/interfaz.md`**: en «Mi cuenta» se añade el punto «Calendario en el móvil» con las tres fases, quién la ve (profesional y administrador; el técnico no) y que el enlace solo se muestra una vez.

## 2 · Decisiones y alternativas descartadas

- **D1 · Código base64url de 32 bytes, generado en la base, del que se guarda solo el SHA-256 sin sal.** Con 256 bits de entropía, un SHA-256 sin sal no se invierte, y deja buscar por índice único. Se descartan:
  - bcrypt o argon2: obligarían a recorrer las filas en cada petición;
  - generar el código en Node: haría falta la clave de servicio para guardar la huella;
  - un uuid: tiene menos entropía y su forma lo delata.
- **D2 · `calendario_ics` security definer con `grant` solo a `anon`, y la ruta con la clave anónima.** El orquestador pidió evitar la clave de servicio, y así es posible: la única puerta es una función que exige el código, el perfil activo y el rol. Se descarta la clave de servicio porque abre toda la base a un fallo de la ruta. Que la RPC sea invocable directamente en Supabase con la clave anónima es equivalente a la ruta: exige el mismo código y cuenta en el mismo límite.
- **D3 · El UID es un HMAC del id con una sal propia de la suscripción.** No necesita ningún secreto de servidor que gestionar ni rotar, la sal no sale de la base, y dos suscripciones no se pueden correlacionar. Se descartan:
  - el id de la cita: lo prohíbe el plan;
  - el SHA-256 del id sin sal: quien conozca un id lo confirma;
  - un secreto en una variable de entorno: es una pieza más que desplegar.
- **D4 · El límite es una ventana fija de 60 peticiones por hora, en la misma fila y en un solo UPDATE.** Es atómico sin tabla aparte, y 60 por hora sobra para cualquier cliente de calendario (Apple, como mucho cada 5 minutos). Se descartan la ventana deslizante (una tabla de eventos que crece) y el límite en Node (Vercel no comparte memoria entre instancias).
- **D5 · Auditoría con `INSERT` y `UPDATE` sobre `tabla = 'suscripciones_calendario'`, sin verbos nuevos.** No toca `auditoria_operacion_check`, que T-058 puede estar redefiniendo en paralelo, y cuenta lo que pasó.
- **D6 · La baja revoca con un disparador sobre `perfiles`, no editando `dar_de_baja_perfil`.** Cubre cualquier camino hacia `baja` y no copia una función ajena. La suspensión **no** revoca: el feed exige `activo` y vuelve con el perfil. Se descarta revocar también en la suspensión, que obligaría al profesional a volver a añadir el enlace en cada dispositivo tras una suspensión temporal.
- **D7 · Una sola suscripción activa por perfil.** Revocar y «crear otro» son inequívocos. Se descarta un enlace por dispositivo: no está en el plan, multiplica la superficie y complica la pantalla.
- **D8 · Al feed llega la `fecha_local` de la cita y el enlace abre la semana con `centro=todos`.** No hay vista de día y no se manda el uuid de un centro a Google. Se descarta `centro=<uuid>`.
- **D9 · La ventana de citas es una función interna `security invoker` sin permisos, con `p_ahora` como parámetro.** El banco prueba los bordes con un ancla anual sin romper la regla de banda corta, y un `grant` por error no abre nada.
- **D10 · La URL la compone el cliente con `location.origin` dentro del manejador.** No hay variable de entorno con el dominio y no hace falta inventarla. Se descarta componerla en el servidor con `headers()`: es un dato más que viaja en la respuesta de la acción, sin ganar nada.
- **D11 · `next.config.ts` ignora `/api/calendario/` en el registro de peticiones de desarrollo.** El criterio «el código no queda en los registros» incluye los nuestros. En producción, `next start` no registra peticiones, y lo de Vercel es la pregunta 2.
- **D12 · Se lee con `POST` (`rpc` por defecto).** Con POST el código va en el cuerpo, no en la URL de Supabase. Un `GET` a la RPC correría en una transacción de solo lectura y fallaría en el UPDATE, sin filtrar nada.

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Comprobación |
|---|---|
| T-062a · banco sobre `db reset` | `npx supabase db reset && npm run tipos && npm run test:rls`. El verificador pega el exit 0, `select max(version) from supabase_migrations.schema_migrations` = `20261022120000` y la línea `=== 40-calendario-ics ===` |
| T-062a · banco sobre la siembra | `npm run seed && npm run test:rls`, exit 0 |
| T-062a · mutantes | Los diecinueve de §1.A.5, cada uno con el comando de §1.A.5: sale distinto de 0 y en `cae` se pega la línea `ERROR`/`FALLO` que lo mata. Exit 0 sin mutante (control) |
| T-062a · el código fuera de las columnas y la auditoría | Bloque 3 del banco |
| T-062a · contenido mínimo | Bloque 6 del banco y `lib/agenda/ics.test.ts` |
| T-062a · ventana y anuladas | Bloques 6 y 7 |
| T-062a · límite | Bloque 9 y la prueba de 429 de la ruta |
| T-062a · baja | Bloque 13 |
| T-062a · el código no queda en los registros | La prueba de los espías de `console.*` en `route.test.ts`; `rg -n "console\.(log|error|warn|info)" app/api/calendario lib/citas/calendario-ics.ts lib/agenda/ics.ts` solo da la línea del mensaje fijo; la salida de `npm run dev` durante la QA no contiene el código (`grep -c <codigo>` = 0 sobre el fichero de salida); y la decisión D12 |
| T-062a · unitarias | `npx vitest run lib/agenda/ics.test.ts lib/citas/calendario-ics.test.ts "app/api/calendario/[archivo]/route.test.ts"` |
| T-062a · el resto | `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run verificar:huellas` |
| T-062a · QA | El código se crea por SQL como Ana: `begin; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub', '<uuid de Ana>', 'role', 'authenticated')::text, true); select public.calendario_crear_suscripcion(); commit;` vía `docker exec … psql`. Después: `curl -i …/<codigo>.ics`; `grep -c` de los apellidos sembrados sobre el cuerpo, que debe dar 0; y el `URL:` de un evento abierto con `qa.mjs` sin sesión (→ `/login`) y con sesión (→ la semana) |
| T-062b · componente y acciones | `npx vitest run "app/(app)/cuenta" lib/cuentas/calendario.test.ts` |
| T-062b · el resto | `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx next build --webpack` y `npm run test:rls` |
| T-062b · QA | `qa.mjs visita /cuenta` a 1280 y 360 px como Ana y como técnico, con los pasos del contrato. Las capturas, en `.claude/qa/visitas/T-062b/` |

## 4 · Riesgos, por probabilidad

1. **Una prueba de contenido que pasa por el motivo equivocado** (alta). Si las citas del bloque 6 no caen en la ventana real, el feed sale vacío y todos los `strpos = 0` pasan. Mitigación: el bloque 6 primero afirma que `C40_HOY` y `C40_ONLINE` **están**, y M11 tiene que caer.
2. **Los privilegios por defecto de Supabase** (alta). Dan `execute` a `anon` y a `authenticated` en cada función nueva y todo en cada tabla nueva. Si falta un `revoke`, `calendario_eventos_ventana` queda invocable o la tabla legible. Mitigación: el bloque 1 lo comprueba rol por rol, y M01 y M02.
3. **`hrefAgenda` importado desde `app/(app)`** (media). Si `parametros.ts` llega a importar algo de cliente o de sesión, el build de la ruta arrastra ese código. Mitigación: hoy solo importa `zod` y `lib/fechas/calendario`. El revisor lo mira, y si cambia, se copia la forma en un ticket aparte.
4. **El segmento `[archivo]` con punto** (media). `abc.ics` debería llegar entero como parámetro; si no, se ve en la QA con `curl`. Alternativa sin cambiar el diseño: el segmento `[codigo]` con la URL `…/<codigo>` sin extensión. Google y Apple no exigen la extensión, pero Outlook la prefiere. Se anota en la bitácora si hace falta.
5. **T-058 no está en main al empezar** (media). La migración no se aplica en orden. Mitigación: la comprobación de §1.A.1 lo detecta y el implementador se para.
6. **El límite y los refrescos agresivos** (baja). Un cliente que reintenta en bucle tras un 429 se queda en 429 hasta la hora siguiente: es lo que se quiere.
7. **La baja de un administrador** (baja). `impedir_baja_ultimo_administrador` puede deshacer la sentencia; el disparador nuevo va en la misma transacción y se deshace con ella.

## 5 · Qué revisar

**Lo que puede elegir el llamante, y su efecto:**
- `calendario_ics(p_codigo)`. Lo único que entra desde Internet. Sale de él una huella y nada más: ni el perfil, ni la ventana, ni el límite. Hay que mirar que el `where` del UPDATE lleve la huella, `revocada_en is null`, perfil `activo` y los dos roles.
- `crear`, `revocar` y `mi` no tienen parámetros: el perfil es `auth.uid()`. Las acciones validan `z.object({}).strict()`, y ningún `perfil_id` del cliente llega a la base.
- El nombre del fichero en la ruta: solo la expresión de 43 caracteres más `.ics` llega a la base.

**Pruebas que deben fallar, y por qué motivo exacto:**
- `authenticated` ejecutando `calendario_ics`: 42501 de **permiso**, no de la función. Se ve con M01.
- Técnico creando: 42501 con el fragmento «calendario: tu rol no tiene calendario», no «No hay sesión.».
- Segunda activa a mano: 23505 del índice `suscripciones_calendario_una_activa`, no de `codigo_huella` (la segunda fila lleva otra huella).
- Reabrir una revocada: 42501 «suscripción revocada no se reabre», no el check de coherencia (23514). La prueba pone a la vez `revocada_en = null` y `motivo = null`, para que el check no salte antes.
- Una entrada mala devuelve `no_encontrado` **sin lanzar**. Si lanzara, el mensaje de PostgREST podría llevar el parámetro.

**Invariantes que se podrían saltar por otra puerta:**
- **null:**
  - `p_codigo` nulo: la primera guarda;
  - `centro_id` nulo: `left join` y `centro: null`, que el serializador convierte en «Cita · {modalidad}»;
  - `auth.uid()` nulo en el disparador de baja hecha por `postgres`: `actor_id` nulo está admitido.
- **Duplicados:** el índice parcial más el advisory lock. Dos «Crear» simultáneos acaban en una activa y una `sustituida`, o en un 23505 para el segundo, nunca en dos activas.
- **Concurrencia en el límite:** el UPDATE bloquea la fila. Dos peticiones simultáneas cuentan dos.
- **Permisos de tabla entera:** ni `service_role` tiene privilegios. Se comprueba con `\dp`.
- **TRUNCATE y DELETE:** la guarda de §1.A.1. No hay `grant` que los permita, y aun como `postgres` lanzan.
- **Fugas laterales del contenido:**
  - la auditoría no lleva huella ni sal (M17);
  - `ultimo_acceso_en` lo ve solo el titular;
  - `X-Robots-Tag` y `Referrer-Policy` en todas las respuestas;
  - `DESCRIPTION` y `URL` llevan solo la ruta de la agenda, sin `profesional=` ni `centro=<uuid>`.
- **Registros:**
  - ningún `console.*` con `request.url`, `archivo`, `codigo` ni el error, en la ruta, el lector, `lib/cuentas/calendario.ts` ni las acciones;
  - `next.config.ts` con el `ignore`;
  - la acción de crear devuelve el código, pero `serverFunctions: false` ya impide que `next dev` registre las llamadas.
- **Interfaz:**
  - la URL no se compone en el render (`location` solo en el manejador);
  - el código no se guarda en `localStorage` ni en la URL de la página;
  - recargar lo hace desaparecer.

## 6 · Territorio

El que declara el contrato, por parte. Fuera de él, nada: tampoco `lib/cuentas/baja.ts` ni migraciones anteriores.

## 7 · Delegable

- **T-062a: nada.** Esquema, RLS, banco, mutantes, la ruta pública y el serializador (su prueba decide un criterio de contenido).
- **T-062b:** las claves de i18n del bloque `cuenta.calendario` (§1.B), con los textos literales que fije el implementador al encargarlo.
  - Nivel: `rapido`.
  - Salida: `lib/i18n/es.ts`.
  - Contexto: la lista de claves y textos de §1.B, y el bloque `cuenta` existente de `lib/i18n/es.ts`.
  - Comprobación: `npx tsc --noEmit`.

## Lo que no entra, y por qué

- El envío inmediato por la API de Google: está en «Después» del plan.
- La sala, `LOCATION` y los coterapeutas o participantes: fuera del alcance cerrado. Cada uno es un dato más que sale.
- Ausencias, festivos y franjas en el feed: el plan habla de citas.
- `webcal://`: la URL `https://` basta y no duplica dónde se copia el código.
- Auditar cada descarga: `ultimo_acceso_en` es el rastro que pide el plan.
- Un límite por IP o un cortafuegos: pregunta 4 del contrato, configuración de T-054.
- Exigir TOTP o mandar un aviso de seguridad al crear: pregunta 3 del contrato.
- Varios enlaces por persona (D7). Revocar al suspender (D6).

## Resumen (para el gate)

1. Se construye una suscripción .ics de solo lectura por persona: tabla `suscripciones_calendario` sin políticas, cuatro funciones, un disparador de baja, una ruta pública `/api/calendario/<codigo>.ics` y una sección en Mi cuenta.
2. Partición: **T-062a** (base, banco 40 con ancla **Y+18**, 19 mutantes, ruta, proxy; riesgo alto) y **T-062b** (Mi cuenta; riesgo medio). Depende de T-058 solo por la migración `20261022120000`.
3. Decisión 1: el código tiene 256 bits y lo genera la base, que guarda solo su SHA-256. Se ve una vez.
4. Decisión 2: sin clave de servicio. La ruta usa la clave anónima y la única puerta es `calendario_ics`, con `grant` solo a `anon`, que nunca lanza con una entrada mala.
5. Decisión 3: el UID es un HMAC del id con una sal propia de la suscripción. Cada evento lleva exactamente seis claves, sin nada del paciente.
6. El límite (60 por hora) y el último acceso van en un solo UPDATE atómico. La baja revoca por disparador; la suspensión solo apaga el feed.
7. La auditoría usa INSERT y UPDATE sin tocar `auditoria_operacion_check`, para no chocar con T-058.
8. Revisar con más cuidado: los `revoke` de los privilegios por defecto (tabla y cinco funciones) y que el bloque 6 del banco afirme primero que las citas **están** antes de los `strpos = 0`.
9. También: que ningún `console.*` reciba el código, y que `next.config.ts` ignore la ruta en desarrollo.
10. Pendiente del propietario: P1 (el director sanitario con enlace) y P2 (el código en el registro de Vercel, que se recomienda aceptar).

## Gate del propietario (17-10-2026)
- Diseño y partición en T-062a y T-062b: **aprobados, implementa**.
- P1: tienen enlace el profesional sanitario y el administrador, cada uno solo con sus citas; el técnico nunca; nadie toca el enlace de otro: **sí**.
- P2: se acepta que el código pase por el registro de peticiones de Vercel: **sí**. Nota para T-054: no activar Observability Plus ni drenajes de registros sin redactar `/api/calendario/`.
- P3: sin TOTP ni aviso de seguridad al crear el enlace: **sí**.
- P4: sin límite por IP: **sí**.
- P5: salen todas las citas salvo las anuladas, con el mismo texto: **sí**.
