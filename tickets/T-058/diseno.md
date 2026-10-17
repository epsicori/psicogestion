# T-058 · Diseño · Recordatorios por wa.me

Arquitecto · 17-10-2026 · base main `475e3f5`. Contrato: `tickets/T-058-recordatorios-wame.md`.
Propuesta de partición: **T-058a** (esquema, ruta pública y token; riesgo alto) y **T-058b** (lista, panel y antelación; riesgo medio). §1.A es de T-058a y §1.B de T-058b.

Decisión del propietario del 17-10 (recogida en el contrato): el recordatorio se ofrece a **todos** los pacientes con teléfono. No hay tabla de permiso del canal ni aviso de él: el dato no existe en la app (`grep -rni whatsapp supabase/migrations` solo encuentra dos comentarios).

## 0 · Hechos verificados contra el código

| Hecho | Dónde |
|---|---|
| `pacientes.telefono` existe, en E.164 con `check '^\+[1-9][0-9]{6,14}$'`, «porque wa.me no admite espacios (ADR-023)» | `supabase/migrations/20260916120000_alta_de_paciente_completa.sql:27-36` |
| `pacientes` se concede entera en `select` a authenticated. El técnico lee las fichas con `centro_id in centros_actuales()` (centro **del paciente**, que puede no ser el de la cita); el profesional, las suyas con `es_profesional_asignado` | migraciones de RLS de T-002 y `20260916120000` |
| La siembra no tiene ningún teléfono de paciente (`grep -c "+34" supabase/seed-completo.sql` = 0). Pacientes de Ana en Madrid: Carmen, Sofía, Hugo, Mateo (menor) | `supabase/seed-completo.sql:251-259` |
| La siembra crea citas futuras por la puerta real (`agenda_crear_cita` con los claims de quien la daría): Sofía y Carmen el martes próximo, a las 16:00 y 10:00 | `supabase/seed-completo.sql:567-591` |
| `citas`: `inicio`, `fin`, `zona_horaria` (la del centro, ADR-034), `estado estado_cita` (`programada, confirmada, realizada, cancelada, no_asistida`), `centro_id`, `modalidad_asistencia` (`presencial`/`online`) | `20260906120000_agenda_esquema.sql`, `20261007120000_cita_en_episodio_y_asistencia.sql:24-37` |
| **La base no impone las transiciones de estado**: `agenda_actualizar_cita` hace `coalesce` del estado que le pasen. Las transiciones viven solo en `lib/agenda/estados-cita.ts` | `20260906120000:574-637` |
| Puerta de `agenda_actualizar_cita`: `rol_actual()` nulo → 42501 «No hay sesión activa con perfil.»; si no `administrador`, ni `profesional_id = auth.uid()`, ni `tecnico_administrativo` con `centro_id in centros_actuales()` → 42501 «La cita no existe o no es tuya.» | `20260906120000:588-608` |
| `citas_lectura`: administrador o `profesional_id = auth.uid()`. El técnico lee por la vista `citas_agenda` (`security_invoker = false`, `security_barrier`, solo su rol y sus centros, sin tipo ni nota ni episodio), concedida a authenticated | `20261007120000:1434-1462` |
| `agenda_citas_rango(p_desde, p_hasta)`: `security invoker`, dos ramas disjuntas por rol, solape `inicio < hasta and fin > desde`, máximo 62 días (22023), y columna `reprogramable = inicio > now() and estado in (programada, confirmada)` | `20261007120000:1490-1580` |
| Disparadores de `citas` que miran el estado: alerta al pasar a realizada, avisos al salir de realizada (`old.estado = 'realizada'`), económico y bono solo con `old.estado = 'realizada' or old.fin <= now()`. Ninguno se activa al pasar de `programada` a `confirmada` o `cancelada` antes del inicio | `20261006120000:256-258`, `20261011120000:254-262` |
| `auditar_citas` es `fn_auditar('id', 'nota_operativa')`: el segundo argumento quita columnas del estado auditado; `actor_id = auth.uid()`, que es nulo bajo `service_role` | `20260829150000:45` y siguientes |
| `preferencias_usuario` (perfil_id pk, idioma, densidad_listas, fechas) tiene `grant select, insert, update` **de tabla entera** y RLS de solo la propia fila | `20260822094547:258-265,1542`; `20260822160000:807-819` |
| pgcrypto está en el esquema `extensions` (`digest`, `hmac`, `gen_random_bytes`) | `20260815192424_base_perfiles_pacientes_auditoria.sql:10` |
| `proxy.ts`: `RUTAS_PUBLICAS = ['/login', '/prototipo', '/api/facturacion/drenar']`, comparación `=== ruta \|\| startsWith(ruta + '/')`; una ruta pública salta también la guardia de primer acceso. `getUser()` corre siempre | `proxy.ts:10,59-61,103` |
| Precedente de servidor sin sesión: `/api/facturacion/drenar` usa `crearClienteAdministracion()` (server-only, `SUPABASE_SERVICE_ROLE_KEY`) y llama funciones que solo ejecuta `service_role`; registra solo códigos fijos | `app/api/facturacion/drenar/route.ts`, `lib/facturacion/cola.ts:42`, `lib/supabase/administracion.ts` |
| `ipDeLaPeticion(headers)`: primer valor de `x-forwarded-for`, solo si tiene forma de IP | `app/(app)/pacientes/[id]/peticion.ts:9-15` |
| Metadatos raíz: `title: 'Psicogestión · Tu práctica, en calma'`, `description: 'Gestión clínica y facturación para consultas de psicología'`. En Next 16 se fusionan **por arriba**: un `description` que el hijo no pisa se hereda. `Metadata` admite `referrer` y `robots` | `app/layout.tsx`; `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` |
| Server Actions: son POST públicos; Next compara `Origin` con `Host` (CSRF); se tratan como entrada no fiable | `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` (Security) |
| `formatearHora(instante, zona)` y `formatearFechaLarga(instante, zona)` («domingo, 29 de marzo de 2026») | `lib/fechas/formato.ts:8,18` |
| `exigirSesion()` devuelve `{ supabase, usuario }`; el rol se lee con `supabase.rpc('rol_actual')` | `lib/supabase/sesion.ts:21`; `lib/economico/borrador.ts:68` |
| El panel de la cita monta bloques que se piden al abrirlo (`<BonoDeCita citaId>`); `CitaVista.reprogramable` ya existe | `app/(app)/agenda/panel-cita.tsx:57-134` |
| `/cuenta` es igual para los tres roles, con sus bloques en `<Suspense>` | `app/(app)/cuenta/page.tsx` |
| Ayudantes del banco: `assert`, `assert_lanza_codigo`, `assert_lanza_codigo_msg(consulta, codigo, fragmento, mensaje)`, `assert_no_lanza`, `contar`, `como`, `reset_sesion`. Fijación `:ADM, :PRO1, :TEC1, :TEC2, :CA, :CB` | `scripts/rls/00-ayudantes.sql`, `scripts/rls/01-fijacion.sql:4-12` |
| Años ocupados en el banco: +1, 3, 4, 6–13 en `main`; +14 (T-053, banco 36), +15 (T-055, 37) y +16 (T-056, 38) en diseños aprobados. **+17 está libre** | `scripts/rls/README.md:133-156`; `tickets/T-053/diseno.md:173`; `tickets/T-056/diseno.md:77` |
| La última migración en `main` es `20261017120000_agenda_densidad_anual.sql`; T-053, T-055 y T-056 reservan `20261018…`, `20261019…`, `20261020120000` | `ls supabase/migrations` |
| No existe ninguna tabla de mensajería (`envios_mensaje`, `enlaces_respuesta`…): solo están nombradas en `docs/architecture.md` (dominio Mensajería) | `grep` sobre `supabase/migrations` |

## 1 · Piezas y contratos

### 1.A · T-058a

#### 1.A.1 · Migración `supabase/migrations/20261021120000_recordatorios_wame.sql`

Si el número está ocupado al implementar, el siguiente libre posterior a `20261020120000`, anotado en la bitácora. Cabecera: la decisión del propietario del 17-10, D1–D7 en una línea cada una. Contenido, en este orden:

1. **Antelación.**
   ```sql
   alter table public.preferencias_usuario
     add column antelacion_recordatorio_horas smallint not null default 48
     constraint preferencias_antelacion_valida check (antelacion_recordatorio_horas in (24, 48, 72));
   ```
   La tabla ya se concede entera y su RLS es la fila propia: cada uno cambia solo la suya. Lectora para las filas de otros:
   ```sql
   create function public.antelacion_recordatorio(p_perfil_id uuid) returns smallint
   language sql stable security definer set search_path = ''
   as $$ select coalesce((select pu.antelacion_recordatorio_horas
                            from public.preferencias_usuario pu
                           where pu.perfil_id = p_perfil_id), 48::smallint) $$;
   ```
   `revoke … from public`, `grant execute … to authenticated`. Revela solo 24, 48 o 72 de cualquier perfil (declarado en el `comment`).

2. **`envios_mensaje`** (una fila por mensaje preparado):
   ```sql
   create table public.envios_mensaje (
     id             uuid primary key default gen_random_uuid(),
     cita_id        uuid not null references public.citas (id),
     canal          text not null default 'whatsapp' check (canal = 'whatsapp'),
     inicio_cita    timestamptz not null,          -- el inicio de la cita al preparar
     preparado_por  uuid not null references public.perfiles (id),
     preparado_en   timestamptz not null default now(),
     anulado_en     timestamptz,
     anulado_motivo text check (anulado_motivo in ('deshecho', 'sustituido')),
     respuesta      text check (respuesta in ('confirmada', 'anulada')),
     respondida_en  timestamptz,
     constraint envios_anulado_coherente   check ((anulado_en is null) = (anulado_motivo is null)),
     constraint envios_respuesta_coherente check ((respuesta is null) = (respondida_en is null)),
     constraint envios_anulado_o_respondido check (anulado_en is null or respuesta is null)
   );
   create unique index envios_mensaje_abierto_por_cita on public.envios_mensaje (cita_id)
     where anulado_en is null and respuesta is null;
   create index envios_mensaje_cita on public.envios_mensaje (cita_id, preparado_en desc);
   ```
   RLS activada. Una política, `envios_mensaje_lectura`, `for select to authenticated`:
   ```sql
   using (exists (select 1 from public.citas c where c.id = envios_mensaje.cita_id)
          or exists (select 1 from public.citas_agenda a where a.id = envios_mensaje.cita_id))
   ```
   Es la visibilidad de la agenda: cada `exists` corre bajo la RLS de su tabla o vista. `revoke all on table … from anon, authenticated, service_role; grant select … to authenticated`. Sin `insert`, `update` ni `delete`: solo escriben las funciones de §1.A.1.5–1.A.1.8. Auditoría `fn_auditar('id')`.

3. **`enlaces_respuesta`** (dos por envío):
   ```sql
   create table public.enlaces_respuesta (
     id           uuid primary key default gen_random_uuid(),
     envio_id     uuid not null references public.envios_mensaje (id),
     cita_id      uuid not null references public.citas (id),
     accion       text not null check (accion in ('confirmar', 'anular')),
     token_huella bytea not null check (octet_length(token_huella) = 32),
     caduca_en    timestamptz not null,
     creado_en    timestamptz not null default now(),
     usado_en     timestamptz,
     revocado_en  timestamptz,
     constraint enlaces_usado_o_revocado check (usado_en is null or revocado_en is null),
     constraint enlaces_huella_unica unique (token_huella),
     constraint enlaces_una_accion_por_envio unique (envio_id, accion)
   );
   create index enlaces_respuesta_cita on public.enlaces_respuesta (cita_id) where usado_en is null and revocado_en is null;
   ```
   RLS activada **sin ninguna política**. `revoke all … from anon, authenticated, service_role`. Auditoría `fn_auditar('id', 'token_huella')`: la huella no llega a `auditoria`.

4. **Límite de peticiones.**
   ```sql
   create table public.secreto_limites_enlace (
     unico boolean primary key default true check (unico),
     sal   bytea not null check (octet_length(sal) = 32));
   insert into public.secreto_limites_enlace (sal) values (extensions.gen_random_bytes(32));
   create table public.limites_enlace_publico (
     clave   bytea not null,          -- hmac-sha256(ip, sal): la IP no se guarda
     ventana timestamptz not null,    -- tramos de 10 minutos
     cuenta  integer not null check (cuenta > 0),
     primary key (clave, ventana));
   create index limites_enlace_publico_ventana on public.limites_enlace_publico (ventana);
   ```
   Las dos con RLS activada sin políticas, `revoke all … from anon, authenticated, service_role`, sin auditoría (contadores, no datos). Función interna:
   ```sql
   create function public.enlace_contar_peticion(p_ip text) returns boolean
   language plpgsql volatile security definer set search_path = ''
   ```
   - `v_ventana := to_timestamp(floor(extract(epoch from now()) / 600) * 600)`;
   - `v_clave := extensions.hmac(convert_to(coalesce(left(p_ip, 64), 'sin-ip'), 'UTF8'), (select s.sal from public.secreto_limites_enlace s), 'sha256')`;
   - `delete from public.limites_enlace_publico l where l.ventana < now() - interval '1 hour'`;
   - `insert … values (v_clave, v_ventana, 1) on conflict (clave, ventana) do update set cuenta = public.limites_enlace_publico.cuenta + 1 returning cuenta into v_cuenta`;
   - `return v_cuenta <= case when p_ip is null then 300 else 30 end`.

   `revoke execute … from public, anon, authenticated, service_role`: solo la llaman las dos funciones de abajo, como su dueño.

5. **`enlace_consultar(p_huella text, p_ip text)`** → `table (resultado text, accion text, inicio timestamptz, zona_horaria text, centro_nombre text, centro_localidad text, online boolean, centro_telefono text)`. `plpgsql volatile security definer set search_path = ''`. **Nunca lanza por el enlace**; devuelve una fila con `resultado`, y el resto nulo salvo donde se dice:
   1. `if not public.enlace_contar_peticion(p_ip)` → `'demasiadas'`.
   2. `p_huella is null or p_huella !~ '^[0-9a-f]{64}$'` → `'no_valido'`.
   3. Enlace por `token_huella = decode(p_huella, 'hex')`, con su envío. No existe o `revocado_en is not null` → `'no_valido'`.
   4. `usado_en is not null` → `'usado'` (con `accion`).
   5. `now() >= caduca_en` → `'caducado'`.
   6. Cita con su centro: `estado not in ('programada','confirmada')` o `c.inicio <> m.inicio_cita` → `'cita_cambiada'`.
   7. Si no, `'valido'` con `accion`, `inicio`, `zona_horaria` (de la cita), `centro_nombre`, `centro_localidad`, `online = (modalidad_asistencia = 'online')` y `centro_telefono`.

   No escribe nada más que el contador: consultar no consume.

6. **`enlace_responder(p_huella text, p_ip text)`** → `table (resultado text, accion text, centro_telefono text)`. Mismo encabezado. Pasos 1–2 iguales. Después:
   1. `select … from public.enlaces_respuesta e where e.token_huella = decode(p_huella,'hex') for update` (el candado ordena el doble clic: el segundo espera y ve `usado_en`). Mismas salidas 3–5.
   2. `select … from public.citas c where c.id = e.cita_id for update`, y el envío. Misma salida 6.
   3. `update public.enlaces_respuesta set usado_en = now() where id = e.id`.
   4. `confirmar`: `update public.citas set estado = 'confirmada' where id = … and estado = 'programada'` (si ya estaba confirmada, nada); envío `respuesta = 'confirmada', respondida_en = now()`. **No** revoca el hermano: quien confirmó puede luego no poder ir.
   5. `anular`: `update public.citas set estado = 'cancelada' where id = …`; envío `respuesta = 'anulada', respondida_en = now()`; `update public.enlaces_respuesta set revocado_en = now() where envio_id = e.envio_id and id <> e.id and usado_en is null and revocado_en is null`.
   6. Devuelve `('respondido', accion, centro_telefono)`.

   Las dos: `revoke execute … from public, anon, authenticated; grant execute … to service_role`.

7. **`recordatorio_preparar(p_cita_id uuid, p_huella_confirmar text, p_huella_anular text)`** → `table (envio_id uuid, inicio timestamptz, zona_horaria text, centro_nombre text, centro_localidad text, online boolean)`. `security definer`, authenticated. En este orden (permisos antes que datos, `.claude/rules/supabase.md`):
   1. La puerta de `agenda_actualizar_cita` copiada literal (§0), con la cita leída `for update`: mismos dos mensajes 42501.
   2. `estado not in ('programada','confirmada')` → 22023 «No se puede recordar: la cita no está programada ni confirmada».
   3. `inicio <= now()` → 22023 «No se puede recordar: la cita ya ha empezado».
   4. `pacientes.telefono is null` → 22023 «No se puede recordar: el paciente no tiene teléfono».
   5. Alguna huella que no case `^[0-9a-f]{64}$`, o las dos iguales → 22023 «Huellas del recordatorio no válidas».
   6. Existe un envío de la cita con `respuesta is not null and inicio_cita = c.inicio` → 22023 «El paciente ya respondió a este recordatorio».
   7. Envíos abiertos de la cita → `anulado_en = now(), anulado_motivo = 'sustituido'`. **Todos** los enlaces de la cita sin usar ni revocar → `revocado_en = now()` (también los de un envío ya respondido: si la cita volviera a su hora de antes, el hermano viejo no revive).
   8. Inserta el envío (`preparado_por = auth.uid()`, `inicio_cita = c.inicio`) y los dos enlaces (`caduca_en = c.inicio`, `token_huella = decode(…,'hex')`).
   9. Devuelve los datos del mensaje. **No devuelve el teléfono**: la app lo lee bajo la RLS de `pacientes` (D8).

   Los mensajes 22023 empiezan distinto entre sí y de los de otras funciones (regla de fragmento único).

8. **`recordatorio_deshacer(p_envio_id uuid)`** → `void`, `security definer`, authenticated. Envío `for update`; no existe → 42501 «El recordatorio no existe o no es tuyo.»; la puerta de §1.A.1.7 paso 1 sobre su cita, con ese mismo mensaje. `anulado_en is not null`, `respuesta is not null` o algún enlace con `usado_en` → 22023 «El recordatorio ya no se puede deshacer». Si no: `anulado_en = now(), anulado_motivo = 'deshecho'` y revoca sus enlaces sin usar.

9. **`recordatorios_lista(p_cita_id uuid default null)`** → `table (cita_id uuid, inicio timestamptz, fin timestamptz, zona_horaria text, estado public.estado_cita, centro_id uuid, centro_nombre text, profesional_id uuid, profesional_nombre text, paciente_id uuid, paciente_nombre text, paciente_apellidos text, modalidad_asistencia public.modalidad_asistencia, telefono text, antelacion_horas smallint, toca_hoy boolean, envio_id uuid, envio_preparado_en timestamptz, envio_vigente boolean, envio_respuesta text, envio_respondida_en timestamptz)`. `plpgsql stable security invoker set search_path = ''`. Toda tabla con alias (regla de `out` ambiguo).
   - Ventana: sin `p_cita_id`, `[now(), now() + interval '96 hours')` (72 h de antelación máxima más lo que queda de hoy). Con `p_cita_id`: `v_inicio := coalesce((select c.inicio from public.citas c where c.id = p_cita_id), (select a.inicio from public.citas_agenda a where a.id = p_cita_id))`; nulo → cero filas; si no, `[v_inicio, v_inicio + interval '1 minute')` y `r.id = p_cita_id`.
   - Base: `public.agenda_citas_rango(desde, hasta) r` (la visibilidad de cada rol sale de ahí, sin reimplementarla), con `r.inicio > now()`.
   - `telefono`: `(select p.telefono from public.pacientes p where p.id = r.paciente_id)`, **bajo la RLS de quien llama**.
   - Envío: `left join lateral (select … from public.envios_mensaje m where m.cita_id = r.id and m.anulado_en is null order by m.preparado_en desc limit 1)`; `envio_vigente = (m.inicio_cita = r.inicio)`.
   - `antelacion_horas = public.antelacion_recordatorio(r.profesional_id)`.
   - `toca_hoy = ((r.inicio - make_interval(hours => antelacion_horas)) at time zone r.zona_horaria)::date <= (now() at time zone r.zona_horaria)::date`. Compara **fechas locales**, sin construir la medianoche (`.claude/rules/fechas.md`).
   - Filas: `r.estado in ('programada','confirmada')`, más las canceladas cuyo envío vigente tiene `respuesta = 'anulada'` (para «Respondidos»).
   - Orden `r.inicio, r.id`. `revoke … from public; grant execute … to authenticated`.

10. `comment on` de cada tabla, columna nueva y función, con la decisión que la explica.

#### 1.A.2 · Funciones puras

`lib/agenda/recordatorio-mensaje.ts` (sin reloj, sin red, sin `process.env`):
```ts
export type LugarRecordatorio = { tipo: 'centro'; nombre: string } | { tipo: 'online' } | { tipo: 'ninguno' };
export interface DatosRecordatorio {
  fechaLarga: string;      // «miércoles, 22 de octubre de 2026», ya formateada en la zona de la cita
  hora: string;            // «17:00»
  lugar: LugarRecordatorio;
  enlaceConfirmar: string;
  enlaceAnular: string;
}
export function lugarNeutro(online: boolean, nombre: string | null, localidad: string | null): LugarRecordatorio;
export function textoRecordatorio(d: DatosRecordatorio): string;
export function urlWhatsApp(telefonoE164: string, texto: string): string;
```
- `lugarNeutro`: `online` → `{tipo:'online'}`; si `nombre` no contiene `/psic/i`, el nombre; si no, la `localidad` con la misma comprobación; si no, `{tipo:'ninguno'}`.
- `textoRecordatorio`, literal (ADR-054, lenguaje llano; cada enlace solo en su línea para que ningún signo se pegue a la URL):
  ```
  Hola. Te recordamos tu cita del {fechaLarga} a las {hora} en {nombre}.   ← centro
  Hola. Te recordamos tu cita por videollamada del {fechaLarga} a las {hora}.   ← online
  Hola. Te recordamos tu cita del {fechaLarga} a las {hora}.   ← ninguno

  Si vienes, pulsa aquí:
  {enlaceConfirmar}

  Si no puedes venir, pulsa aquí y la anulamos:
  {enlaceAnular}
  ```
  Si el texto resultante contiene `/psico/i`, lanza `Error('texto_revelador')`.
- `urlWhatsApp`: si `telefonoE164` no casa `^\+[1-9][0-9]{6,14}$`, lanza; si no, `` `https://wa.me/${telefonoE164.slice(1)}?text=${encodeURIComponent(texto)}` `` (los `#` de los enlaces salen como `%23`; sin eso wa.me cortaría el texto en el primer `#`).

`lib/agenda/recordatorios.ts`:
```ts
export interface FilaRecordatorio { /* las columnas de recordatorios_lista en camelCase; fechas como string ISO */ }
export type SeccionRecordatorio = 'por_recordar' | 'aun_no' | 'preparado' | 'respondido' | 'sin_telefono';
export function seccionRecordatorio(f: FilaRecordatorio): SeccionRecordatorio;
export function agruparRecordatorios(filas: FilaRecordatorio[]): Record<Exclude<SeccionRecordatorio, 'aun_no'>, FilaRecordatorio[]>;
```
Orden de decisión: `envioVigente && envioRespuesta` → `respondido`; `envioId && envioVigente` → `preparado`; `!tocaHoy` → `aun_no`; `telefono === null` → `sin_telefono`; si no, `por_recordar`. Sin reloj: `toca_hoy` lo calcula la base.

#### 1.A.3 · Servidor: `lib/citas/recordatorios.ts` (`import 'server-only'`)

```ts
export function nuevoToken(): string;                         // randomBytes(32).toString('hex'): 64 hexadecimales
export function huellaDeToken(token: string): string;         // sha256 de los bytes UTF-8 del token, en hex
export function enlacePublico(origen: string, token: string): string;   // `${origen}/r#${token}`
export function origenPublico(): string | null;               // ORIGEN_PUBLICO validado (https, o http con localhost/127.0.0.1), sin barra final
export const esquemaFilaRecordatorio: z.ZodType<FilaRecordatorio>;
export async function leerRecordatorios(supabase: SupabaseClient<Database>, citaId?: string): Promise<FilaRecordatorio[]>;
export type ResultadoPreparar =
  | { ok: true; envioId: string; texto: string; url: string }
  | { ok: false; error: 'sin_origen' | 'no_es_tuya' | 'sin_telefono' | 'no_se_puede' | 'ya_respondio' | 'fallo' };
export async function prepararRecordatorio(supabase, citaId: string): Promise<ResultadoPreparar>;
export async function deshacerRecordatorio(supabase, envioId: string): Promise<{ ok: true } | { ok: false; error: 'no_es_tuyo' | 'no_se_puede' | 'fallo' }>;
```
`prepararRecordatorio`, en orden: `origenPublico()` nulo → `sin_origen`; `leerRecordatorios(supabase, citaId)` vacío → `no_es_tuya`; `telefono` nulo → `sin_telefono`; dos `nuevoToken()`; `rpc('recordatorio_preparar', { p_cita_id, p_huella_confirmar: huellaDeToken(a), p_huella_anular: huellaDeToken(b) })`; errores por código y fragmento (42501 → `no_es_tuya`; «ya respondió» → `ya_respondio`; otro 22023 → `no_se_puede`; resto → `fallo` con `console.error('recordatorio: fallo_preparar')`); hora con `formatearHora` y fecha con `formatearFechaLarga` en `zona_horaria`, tal cual (con el año: no se añade otro formateador); `lugarNeutro`; `textoRecordatorio`; `urlWhatsApp(telefono, texto)`. Los tokens solo existen en esta respuesta a quien prepara: no se guardan ni se registran.

#### 1.A.4 · Vector congelado de la huella

El mismo en `lib/citas/recordatorios.test.ts` y en el banco 39 (sección L):

| Token (64 caracteres) | `huellaDeToken` |
|---|---|
| `'a'.repeat(64)` | `ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb` |
| `'b'.repeat(64)` | `a0fab1377f49a759b57f63318262ebe89fabfc990e8e93ceac2984561482b9d4` |

En SQL: `encode(extensions.digest(convert_to(repeat('a', 64), 'UTF8'), 'sha256'), 'hex')`.

#### 1.A.5 · Banco `scripts/rls/39-recordatorios.sql` y mutantes

Fijación propia (cabecera del módulo, como el 34): `PRO39A` en CA y `PRO39B` en CB, creados con su `auth.users`, `perfiles` y `perfiles_centros`; uuids con prefijo `05800039-…`. Pacientes `P39A` (CA, de PRO39A, `+34600390001`), `P39B` (CB, de PRO39B, `+34600390002`), `P39SIN` (CA, sin teléfono) y `P39X` (centro CB, de PRO39A, con teléfono: su cita es en CA). `PRO39B` con `antelacion_recordatorio_horas = 24`. Citas insertadas a mano (son el escenario, no el producto); **los envíos solo por `recordatorio_preparar`** y las respuestas solo por `enlace_*` como `service_role` (`set local role service_role`).

Instantes (banda corta, regla 1; profesionales propios, así que no chocan con el 15, 18 ni 23): `D` = `(now() at time zone zona)::date` de cada centro.
- `C39A1`: P39A/PRO39A/CA mañana a las 10:00 local. `C39A2`: P39A, `D+2` a las 11:00. `C39B2`: P39B/PRO39B/CB, `D+2` a las 11:00. `C39SIN`: P39SIN mañana a las 12:00. `C39X`: P39X en CA mañana a las 13:00. `C39PAS`: P39A, `now() - interval '1 hour'` a `now() + interval '10 minutes'`. `C39CAN`: P39A, mañana a las 16:00, `cancelada`.
- `C39LEJOS`: P39A, primer lunes de junio de **Y+17** a las 10:00 (`anio_39`, `lunes_39`, plantilla del README).

Secciones (cada negativa con su gemela):
- **A · Forma.** Las seis funciones: `security definer`/`invoker` como en §1.A.1, `search_path` vacío; `has_function_privilege` de `anon`, `authenticated` y `service_role` sobre cada una (enlace_* solo service_role; enlace_contar_peticion ninguno; el resto authenticated). `has_table_privilege` de los tres roles sobre las cuatro tablas nuevas con `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`: solo `SELECT` de authenticated en `envios_mensaje`. RLS activada en las cuatro.
- **B · Preparar.** ADM, PRO39A y TEC1 preparan C39A1 (cada uno en su `savepoint`); `PRO1` (ajeno) y `TEC2` (otro centro) → 42501 «no es tuya»; C39PAS → «ya ha empezado»; C39CAN → «no está programada»; C39SIN → «no tiene teléfono»; huellas iguales, de 63 caracteres y con mayúsculas → «no válidas». Tras preparar: `caduca_en = citas.inicio` en los dos enlaces, `preparado_por = :PRO39A`, `inicio_cita = citas.inicio`.
- **C · Preparar de nuevo.** El envío anterior queda `sustituido`, sus enlaces revocados; `enlace_consultar` con la huella vieja → `no_valido`, con la nueva → `valido`.
- **D · Consultar no consume.** Dos `enlace_consultar` seguidos: `valido` las dos, `usado_en` nulo; los datos devueltos son los de la cita.
- **E · Responder.** Confirmar C39A1 → `programada → confirmada`, envío `confirmada`; la segunda vez → `usado` y la cita igual; el hermano `anular` sigue `valido` y anula → `cancelada`. Sobre C39A2: anular primero → el hermano queda revocado (`revocado_en` no nulo) y consultar el hermano → `no_valido`. Una cita ya `confirmada` por el personal: confirmar da `respondido` y no cambia el estado.
- **F · Caducidad.** Como `postgres`, `update enlaces_respuesta set caduca_en = now() - interval '1 second'` sobre un enlace (manipulación declarada, el reloj no se puede adelantar) → `caducado`; la gemela sin tocar → `valido`.
- **G · Cita cambiada.** Mover C39A2 con `agenda_actualizar_cita` como PRO39A → `cita_cambiada` y la cita no se toca; anularla el personal → `cita_cambiada`.
- **H · Límite.** IP `198.51.100.39`: 30 llamadas devuelven otra cosa que `demasiadas`, la 31 da `demasiadas` (también con `enlace_responder`); la IP `198.51.100.40` sigue pasando; IP nula: el cubo de 300. `now()` es constante en la transacción: todas caen en la misma ventana.
- **I · Deshacer.** Sin usar → `deshecho` y enlaces revocados; tras usar un enlace → «ya no se puede deshacer»; TEC2 → 42501.
- **J · Lista.** Oráculo por rol (ADM, PRO39A, PRO39B, TEC1, TEC2): el conjunto de `cita_id` de `recordatorios_lista()` es el de `agenda_citas_rango(now(), now() + interval '96 hours')` con `inicio > now()` y estado programada o confirmada, más las canceladas por enlace. `toca_hoy`: C39A2 (48 h) sí, C39B2 (24 h) no. TEC1 recibe C39X con `telefono` **nulo** (el paciente es de CB); ADM lo recibe con teléfono. `recordatorios_lista(:C39LEJOS)` da una fila con `toca_hoy` falso; con TEC2, cero filas.
- **K · Auditoría.** Ninguna fila de `auditoria` con `tabla = 'enlaces_respuesta'` tiene la clave `token_huella` en `estado_anterior` ni en `estado_posterior`; la confirmación de E dejó una fila de `citas` con `actor_id` nulo.
- **L · Vector.** Las dos huellas de §1.A.4 en SQL; preparar con la de `'a'×64` y consultar con ella → `valido`.
- **M · Antelación.** Sin fila, `antelacion_recordatorio` da 48; con 24, 24; `36` → 23514.

Mutantes en `tickets/T-058/mutantes/Mxx.sql` (cada uno un `create or replace function`, una política o un `grant`), aplicados como en T-055:
`( echo "begin;"; cat tickets/T-058/mutantes/Mxx.sql; cat scripts/rls/00-ayudantes.sql scripts/rls/01-fijacion.sql scripts/rls/39-recordatorios.sql; echo "rollback;" ) | docker exec -i supabase_db_Psicogestion psql -U postgres -v ON_ERROR_STOP=1`

| Id | Cambio | Cae en |
|---|---|---|
| M01 | consultar sin la caducidad | F |
| M02 | responder sin `usado_en is null` | E (segunda vez) |
| M03 | responder sin `revocado_en` | C |
| M04 | responder sin comparar `inicio_cita` | G (mover) |
| M05 | responder sin mirar el estado | G (anulada por el personal) |
| M06 | anular sin revocar el hermano | E (C39A2) |
| M07 | límite con `<` en vez de `<=` | H (la 30 cae) |
| M08 | responder sin límite | H (responder) |
| M09 | preparar sin la rama de centro del técnico (`or rol = técnico`) | B (TEC2) |
| M10 | preparar sin `inicio <= now()` | B (C39PAS) |
| M11 | preparar sin revocar los anteriores | C |
| M12 | `grant execute on enlace_responder to anon` | A |
| M13 | política de envíos sin la rama `citas_agenda` | J/I (TEC1 no ve su envío) |
| M14 | política de envíos `using (true)` | J (TEC2 ve envíos de CA) |
| M15 | `caduca_en = inicio + interval '1 hour'` | B |
| M16 | auditoría de enlaces sin quitar `token_huella` | K |
| M17 | deshacer sin mirar los enlaces usados | I |
| M18 | `toca_hoy` con 48 fijo | J (C39B2) |

`tickets/T-058/mutantes.json`: `{ ticket, metodo, mutantes: [{ id, cambio, cae }] }`.

README: fila del módulo 39 en la tabla de módulos; en la de franjas, `39 (T-058) | PRO39A/CA, PRO39B/CB propios; TEC1/CA, TEC2/CB | now() − 1 h .. D+2 (banda corta) · primer lunes de junio de Y+17`; y `39:NN → +17` en la lista de la regla 2. `11-cobertura.sql`: `envios_mensaje_lectura`.

#### 1.A.6 · Siembra (`supabase/seed-completo.sql`, bloque «8.x · T-058»)

- `update public.pacientes set telefono = '+34600000101' where id = k_p_carmen and telefono is null`; Sofía `'+34600000102'`. Comentario: números inventados; nadie envía nada desde la QA.
- Con los claims de Ana y `agenda_crear_cita` (puerta real, como 8.ter), guardado por `not exists` de esa cita: Carmen `current_date + 1` a las 17:00; Hugo (sin teléfono) `current_date + 1` a las 18:00; Sofía `current_date + 2` a las 17:00, todas en Madrid. Cada llamada en su `begin … exception when sqlstate '22023' or sqlstate '23P01' then raise notice …`: si cae en un festivo o choca, la siembra sigue y lo dice. Claims limpiados al acabar.
- Ninguna antelación sembrada: Ana usa las 48 por defecto.

#### 1.A.7 · Ruta pública `app/r/`

- `page.tsx` (Server Component, sin datos en el render, prerenderizable):
  ```ts
  export const metadata: Metadata = {
    title: 'Tu cita',
    description: 'Confirmar o anular una cita.',
    openGraph: { title: 'Tu cita', description: 'Confirmar o anular una cita.' },
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
  ```
  Pinta un `<main>` estrecho con `<Respuesta />`. Ni el nombre de la app, ni logotipo, ni «psico» en ningún texto.
- `respuesta.tsx` (`'use client'`):
  - Al montar, **una sola vez** (un `useRef` que guarda el token: en desarrollo el efecto corre dos veces y la segunda ya no ve el fragmento): `token = location.hash.slice(1)`; `history.replaceState(null, '', location.pathname)`; después `consultarEnlace(token)`.
  - Estados: `cargando`, `valido` (fecha, hora, lugar y **un** botón: «Confirmo» o «No puedo ir» según `accion`), `usado`, `caducado`, `no_valido`, `cita_cambiada`, `demasiadas`, `error`, `confirmada`, `anulada` (con «Si quieres otra cita, llama al {telefono}» si hay teléfono del centro).
  - Pulsar llama a `responderEnlace(token)`; mientras, el botón queda `aria-disabled`. El resultado se pinta con un encabezado `tabIndex={-1}` que recibe el foco.
- `acciones.ts` (`'use server'`):
  ```ts
  export async function consultarEnlace(token: unknown): Promise<VistaEnlace>;
  export async function responderEnlace(token: unknown): Promise<VistaRespuesta>;
  ```
  Zod `z.string().regex(/^[0-9a-f]{64}$/)`: si no casa, `{ resultado: 'no_valido' }` **sin** ir a la base. `ip = ipDeLaPeticion(await headers())`. `crearClienteAdministracion().rpc('enlace_consultar' | 'enlace_responder', { p_huella: huellaDeToken(token), p_ip: ip })`. Fecha y hora formateadas aquí en la zona de la cita; `lugarNeutro` para el lugar. Devuelve solo cadenas para pintar, nunca `inicio` crudo. Cualquier error → `console.error('recordatorio: fallo_consulta' | 'recordatorio: fallo_respuesta')` y `{ resultado: 'error' }`. Nunca el token, la huella ni la IP en un log.
- `proxy.ts`: `const RUTAS_PUBLICAS = ['/login', '/prototipo', '/api/facturacion/drenar', '/r'];` y una línea en su comentario.
- `.env.example`: `ORIGEN_PUBLICO=` con su comentario (dirección pública de la app, sin barra final; en local `http://localhost:3000`; T-054 la fija en el despliegue). En `.env.local` del verificador: `http://localhost:3000`.

#### 1.A.8 · Documentación

`docs/architecture.md`, matriz de roles: fila «Recordatorios» (administrador: todos; profesional: los de sus citas; técnico: los de las citas de sus centros, con el teléfono solo de los pacientes de sus centros) y fila «Ruta pública `/r`» (sin sesión; solo con el token; ve fecha, hora y lugar; confirma o anula esa cita). En el dominio Mensajería, que `canales_paciente`, `plantillas_mensaje` y `respuestas_mensaje` no se crean (decisión del 17-10 y D9).

### 1.B · T-058b

- `app/(app)/agenda/acciones-recordatorio.ts` (`'use server'`): `prepararRecordatorioAccion(citaId)`, `deshacerRecordatorioAccion(envioId)`, `leerRecordatorioDeCita(citaId)`. Cada una: `exigirSesion()`, Zod `uuid`, y llama a `lib/citas/recordatorios.ts`. `deshacer` hace `revalidatePath('/agenda/recordatorios')`; `preparar` **no** revalida (la vista previa con los tokens vive en el estado del cliente y una recarga la perdería).
- `app/(app)/agenda/recordatorio-de-cita.tsx` (`'use client'`), dos exportaciones:
  - `AccionesRecordatorio({ citaId, envioId, seccion })`: «Preparar mensaje» → región «Vista previa» (`role="region"`, encabezado con `tabIndex={-1}` que recibe el foco) con el texto en un `<pre className="whitespace-pre-wrap">`, `<a href={url} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>` y «Deshacer». En `preparado` sin vista previa (se recargó): «Preparar de nuevo» y «Deshacer». Tras deshacer, el foco vuelve a «Preparar mensaje». Errores con su texto (`sin_origen`: «Falta la dirección pública de la app»).
  - `RecordatorioDeCita({ citaId })`: pide `leerRecordatorioDeCita` al montar (como `BonoDeCita`) y pinta el estado y `AccionesRecordatorio`. En el panel, `aun_no` cuenta como `por_recordar`: el botón vale para cualquier cita futura.
- `panel-cita.tsx`: `{cita.reprogramable && <RecordatorioDeCita key={cita.id} citaId={cita.id} />}` debajo del bono.
- `app/(app)/agenda/recordatorios/page.tsx`: encabezado estático y un `<Suspense>` con el bloque que hace `exigirSesion`, `leerRecordatorios(supabase)` y `agruparRecordatorios`. Cuatro secciones con `h2` y contador: «Por recordar», «Preparados», «Respondidos» (Confirmada / Anulada por el paciente, con la hora de respuesta), «Sin teléfono». Cada fila: hora, fecha corta, paciente, profesional, centro; ordenadas por inicio. Vacío: «No hay recordatorios para hoy».
- `app/(app)/agenda/recordatorios/fila-recordatorio.tsx`: pieza de pintura (props de texto y un `children` para las acciones).
- `app/(app)/agenda/page.tsx`: enlace «Recordatorios» junto a «Nueva cita» (`:171`), para los tres roles.
- `/cuenta`: sección «Recordatorios» (`h2`) solo si `rol_actual()` es administrador o profesional sanitario, con un `<select>` 24/48/72 y «Guardar». `app/(app)/cuenta/esquemas.ts` (nuevo): `esquemaAntelacion = z.object({ horas: z.coerce.number().pipe(z.union([z.literal(24), z.literal(48), z.literal(72)])) })`, el mismo en el formulario y en `guardarAntelacion` (en `app/(app)/cuenta/acciones.ts`), que vuelve a comprobar el rol en servidor y hace `upsert` de `{ perfil_id: usuario.id, antelacion_recordatorio_horas }` con `onConflict: 'perfil_id'`.
- `lib/i18n/es.ts`: claves `recordatorios.*` y `cuenta.recordatorios.*`.
- `docs/interfaz.md`: sección «Recordatorios» (lista, bloque del panel, `/r`, `/cuenta`) y la línea 540 sale de lo no dibujado.

## 2 · Decisiones y alternativas descartadas

- **D1 · Token aleatorio de 256 bits en hexadecimal, solo su huella SHA-256 en la base.** Un HMAC firmado sin tabla no permitiría el «un solo uso» ni la revocación sin guardar estado igualmente. Hexadecimal y no base64url: ningún `-` o `_` final que un autoenlazador deje fuera.
- **D2 · El token va en el fragmento (`/r#…`).** El fragmento no llega al servidor, ni a los registros de Vercel o de Supabase, ni al `Referer`. Descartado `/r/<token>` y `?t=`: quedarían en todos los registros de acceso.
- **D3 · GET no consume; responde un POST (Server Action).** Los previsualizadores de enlaces abren la URL; un GET que confirmara anularía citas solo por pegar el enlace.
- **D4 · Sin nombre de profesional ni de paciente en el mensaje ni en `/r`.** Un nombre de profesional se busca y revela la especialidad en una pantalla bloqueada; el paciente ya sabe con quién va. Lugar: el centro si su nombre no dice «psic», si no la localidad. Pregunta 2.
- **D5 · Sin permiso de canal.** Decisión del propietario del 17-10; el dato no existe.
- **D6 · Las respuestas públicas pasan por funciones que solo ejecuta `service_role`**, llamadas con `crearClienteAdministracion()` en servidor. Descartado conceder a `anon`: cualquiera con la clave anónima (que va al navegador) podría llamar directamente a PostgREST saltándose la acción y su validación.
- **D7 · `enlace_*` devuelven un resultado en vez de lanzar.** Un `raise` desharía también el incremento del contador y el límite no limitaría nada.
- **D8 · El teléfono se lee bajo la RLS de `pacientes`, nunca desde una función definer.** Así el técnico no gana acceso a teléfonos de pacientes de otros centros por tener la cita en el suyo.
- **D9 · Dos tablas, no cinco.** `plantillas_mensaje` (un texto fijo basta), `respuestas_mensaje` (la respuesta cabe en el envío) y `canales_paciente` (D5) no se crean.
- **D10 · Antelación cerrada a 24, 48 o 72 h, en `preferencias_usuario`.** Descartada una tabla aparte: es una preferencia de cada perfil y la tabla ya tiene la RLS de fila propia.
- **D11 · `toca_hoy` en la base, con fechas locales de la zona de la cita.** Calcularlo en TypeScript exigiría `new Date()` en el render (prohibido con Cache Components) y otro reloj distinto del de la base.
- **D12 · Límite de peticiones en Postgres, con la IP en HMAC con sal y purga a la hora.** No hay Redis ni otro servicio; la entropía del token ya hace inútil la fuerza bruta y el límite solo frena el abuso. La IP no se guarda.
- **D13 · Confirmar no revoca «No puedo ir»; anular sí revoca «Confirmo».** Quien confirma puede luego no poder ir; quien anula ya no tiene cita.

## 3 · Cómo se cierra cada criterio de aceptación

| Criterio | Comprobación |
|---|---|
| a · `test:rls` con `max(version) = 20261021120000` | `npx supabase db reset` → `docker exec supabase_db_Psicogestion psql -U postgres -tAc "select max(version) from supabase_migrations.schema_migrations"` → `npm run test:rls` (timeout 600 s) |
| a · banco sobre la siembra | `npm run seed && npm run test:rls` |
| a · mutantes | los 18 de §1.A.5 con el comando de arriba, cada uno con exit ≠ 0 y la aserción que cae; `tickets/T-058/mutantes.json` |
| a · lo que demuestra el banco 39 | secciones A–M de §1.A.5, en el orden del contrato |
| a · vitest | `npx vitest run lib/agenda/recordatorio-mensaje.test.ts lib/agenda/recordatorios.test.ts lib/citas/recordatorios.test.ts app/r` |
| a · suite, lint, tipos, build, huellas | `npm test`, `npm run lint`, `npm run lint:migraciones`, `npx tsc --noEmit`, `npx next build --webpack`, `npm run verificar:huellas` |
| a · QA visible | el bloque psql de abajo; `qa.mjs visita /r` sin sesión con `/r#aaa…a`, `/r#bbb…b`, `/r#ccc…c`; `curl -s http://localhost:3000/r \| grep -ci psico` = 0 |
| b · pruebas de componente y acción | `npx vitest run "app/(app)/agenda/recordatorio-de-cita.test.tsx" "app/(app)/agenda/acciones-recordatorio.test.ts" "app/(app)/cuenta" "app/(app)/agenda/recordatorios"` |
| b · suite y base sin cambios | `npm test`, `npm run lint`, `npx tsc --noEmit`, `npx next build --webpack`, `npm run test:rls` |
| b · QA visible | `qa.mjs visita /agenda /agenda/recordatorios /cuenta` como Ana y como técnico; el `href` de «Abrir WhatsApp» se lee, no se pulsa; el enlace `/r#…` del texto se abre en un contexto sin sesión |

Bloque psql para la QA de T-058a (tras `db reset` y `npm run seed`; la cita de Carmen de mañana):
```sql
select set_config('request.jwt.claims',
  json_build_object('sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, false);  -- k_ana de la siembra
set role authenticated;
select * from public.recordatorio_preparar(
  (select c.id from public.citas c join public.pacientes p on p.id = c.paciente_id
    where p.nombre = 'Carmen' and c.inicio::date = current_date + 1 and c.estado = 'programada'
    order by c.inicio limit 1),
  'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
  'a0fab1377f49a759b57f63318262ebe89fabfc990e8e93ceac2984561482b9d4');
```
Después, `/r#` + `'a'×64` confirma y `/r#` + `'b'×64` anula.

## 4 · Riesgos, por probabilidad

1. **Un disparador de `citas` no soporta `auth.uid()` nulo** al responder como `service_role`. Probable que no, por §0, pero la sección E del banco lo demuestra; si falla, se arregla en la función (nunca relajando el disparador) y se anota.
2. **La vista previa de WhatsApp.** El primer enlace del mensaje genera una vista previa con los metadatos de `/r`: si alguno hereda la descripción raíz, aparece «psicología» en el chat. Lo cubre el `curl | grep` y la prueba de metadatos.
3. **`StrictMode` monta dos veces** la página pública: sin el `useRef`, la segunda vez ve el fragmento vacío y pinta «no válido». Prueba de componente.
4. **El bloqueo de ventanas emergentes**: abrir wa.me con `window.open` después de un `await` lo bloquean los navegadores. Por eso es un `<a>` que se pulsa después de preparar.
5. **IP detrás de proxies**: en local `x-forwarded-for` puede faltar (cubo común de 300) y en Vercel lo escribe la plataforma. Comprobarlo en T-054; si un CGNAT agrupa a muchos pacientes, 30 cada 10 minutos sigue sobrando.
6. **`ORIGEN_PUBLICO` sin definir** en el despliegue: preparar falla con `sin_origen` y un texto claro, no compone enlaces rotos.
7. **Banco lento**: 31+ llamadas al límite y oráculos por cinco roles. Debe quedar en segundos; el 34 ya usa el margen de 600 s.
8. **Orden de ramas**: si T-055a o T-056a no están en `main`, un `db reset` desde otra rama pierde migraciones. `max(version)` antes de verificar.

## 5 · Qué revisar

- **Entradas que elige el llamante y su efecto:**
  - `enlace_*`: `p_huella` (cualquier texto: el formato se valida en SQL además de en Zod) y `p_ip` (la pone el servidor; truncada a 64; solo elige cubo del límite). Nada más: ni cita, ni acción, ni estado. La acción sale del enlace, no de la petición.
  - `recordatorio_preparar`: `p_cita_id` (pasa por la puerta de `agenda_actualizar_cita`, copiada literal) y las dos huellas (formato y distintas). `preparado_por`, `inicio_cita` y `caduca_en` los fija la función, nunca el llamante.
  - `recordatorios_lista`: solo `p_cita_id`; la ventana es fija. Una cita invisible da cero filas, no un error que confirme que existe.
  - `/cuenta`: solo `horas`, con Zod y con el `check` de la tabla; `perfil_id` sale de la sesión.
- **Pruebas que deben fallar, y por qué motivo exacto:** el técnico de otro centro cae en 42501 «no es tuya» (no en «no tiene teléfono»: la puerta va antes); C39PAS cae en «ya ha empezado» y no en la puerta; la petición 31 da `demasiadas` y la 30 no; el enlace caducado da `caducado` y no `cita_cambiada` (la cita sigue igual); el envío del técnico se ve por la rama `citas_agenda` y no porque la política sea `true` (M13 y M14 juntos).
- **Puertas laterales del invariante «un solo uso»:**
  - doble clic simultáneo: el `for update` del enlace; la segunda llamada ve `usado_en`;
  - reprogramar y volver a la hora de antes: preparar revoca **todos** los enlaces sin usar de la cita, no solo los del envío abierto;
  - `null`: `token_huella not null`, `p_huella` nulo da `no_valido`, `inicio_cita <> inicio` con dos no nulos;
  - permisos de tabla entera: ninguna tabla nueva se concede salvo `select` de `envios_mensaje`; `TRUNCATE`, `TRIGGER` y `REFERENCES` revocados y comprobados en A;
  - `anon` y la clave anónima: no ejecutan `enlace_*` (A, M12).
- **El token nunca en un registro:** buscar en el diff `console.` dentro de `app/r/` y `lib/citas/recordatorios.ts`; ninguno interpola variables. La acción recibe el token en el cuerpo, no en la URL. `auditoria` sin `token_huella` (K, M16).
- **`/r` neutra:** metadatos sobrescritos (`title`, `description`, `openGraph`), `robots` sin indexar, `referrer: 'no-referrer'`, ningún enlace saliente, ningún texto con «psico» (`curl | grep`), y el fragmento borrado de la barra **antes** de la primera llamada.
- **`proxy.ts`:** solo se añade `'/r'`; `/recuperar` no pasa a ser pública (la comparación no es un `startsWith('/r')` suelto).
- **Mensaje:** `encodeURIComponent` sobre el texto entero (los `#` como `%23`), teléfono sin el `+`, sin nombres, y el lugar neutro.
- **Estados de la cita:** las dos funciones comprueban `programada|confirmada` e `inicio > now()` porque la base no impone transiciones; «Confirmo» no pasa nunca una `cancelada` a `confirmada`.

## 6 · Territorio

El del contrato, sin cambios.

## 7 · Delegable

- **T-058a: nada.** Todo es token, RLS, ruta pública o la prueba que decide un criterio.
- **T-058b:**
  - nivel `rapido` · `lib/i18n/es.ts` (claves `recordatorios.*` y `cuenta.recordatorios.*` con los textos literales de §1.B) · contexto: §1.B de este diseño y `lib/i18n/es.ts` · comprobación: `npx tsc --noEmit`.
  - nivel `rapido` · `app/(app)/agenda/recordatorios/fila-recordatorio.tsx` (pintura: props de texto y `children`, sin estado ni foco) · contexto: `components/ui/`, `docs/interfaz.md` (anchos y vocabulario) · comprobación: `npm run lint` y `npx tsc --noEmit`.

## Lo que no entra, y por qué

- **Permiso del canal y aviso de «NO» a WhatsApp**: decisión del propietario del 17-10; el dato no existe. Cuando un ticket digitalice el consentimiento con esa casilla, podrá añadir un aviso no bloqueante en la fila.
- **Envío automático, estado de entrega y lectura de respuestas de WhatsApp**: wa.me no es una API (ADR-023).
- **Plantillas editables y `respuestas_mensaje`**: D9.
- **Filtros por profesional o centro en la lista**: el documento maestro los dibuja, pero el contrato no los pide y la lista diaria de una consulta pequeña cabe en una pantalla. Si crece, ticket aparte.
- **Reprogramar o «solicitar cambio» desde el enlace**: el plan dice confirmar o anular.
- **Plazo de anulación tardía y su cobro**: pregunta 1; el enlace vale hasta el inicio.
- **El teléfono del tutor de un menor**: pregunta 5; va el de la ficha.
- **Purga de envíos y enlaces antiguos**: son pocos por día; la retención la decidirá el ticket de retención.
- **Dominio y favicon neutros**: T-054.

## Gate del propietario (17-10-2026)
- Diseño y partición en T-058a y T-058b: **aprobados, implementa**.
- P1: «No puedo ir» anula la cita hasta su hora de inicio: **sí**.
- P2: fecha, hora y lugar, sin nombre del profesional ni del paciente: **sí**. Algún nombre de centro delata la consulta, así que **el mensaje nunca lleva `centros.nombre`: lleva `centros.localidad`** (columna existente); si está vacía, solo fecha y hora. La videollamada sigue diciendo «por videollamada».
- P3: 24, 48 o 72 h, con 48 por defecto: **sí**.
- P4: lo prepara cualquiera que vea la cita, técnico incluido: **sí**.
- P5: los menores usan el teléfono de su ficha: **sí**.
- P6: dominio y nombre de perfil neutros quedan para T-054.
