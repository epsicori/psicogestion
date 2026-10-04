# T-038 · Diseño: regenerar mis códigos de recuperación

> Arquitecto, 02-10-2026. Contrato: `tickets/T-038-regenerar-mis-codigos.md`, con P-1…P-4 decididos el
> 02-10-2026. Donde el contrato y P-4 chocan, manda P-4 (lo dice el propio contrato, línea 255).
> El diseño se escribió **sin tocar la base local** (ocupada). Lo que solo se puede comprobar con la base
> está en «Por confirmar al implementar», con el fichero y la consulta exactos.

## Orden de lectura para el implementador

1. Este diseño entero y el contrato hasta `## Lo que no entra`.
2. `.claude/rules/supabase.md`, `.claude/rules/pruebas.md` y `.claude/rules/autenticacion.md`. Se
   cargan solas, pero léelas antes de la primera línea.
3. `supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql`, por este orden:
   - `segundo_factor_verificado_recientemente`, `:262-306`;
   - `generar_codigos_recuperacion`, `:548-594`;
   - `canjear_codigo_recuperacion`, `:606-716`;
   - `desbloquear_historia`, `:727-832`: el patrón de bloqueo que se copia;
   - `notificaciones`, `:39-107`.
4. `supabase/migrations/20260829150000_auditoria_y_solo_adicion.sql`: `fn_auditar` y el `alter default
   privileges`.
5. `scripts/rls/00-ayudantes.sql` y `scripts/rls/13-cuentas.sql:276-421`.
6. `scripts/test-huellas.mjs` y `scripts/t005-concurrencia.sql`: el patrón de dos conexiones del CA4.
7. `lib/cuentas/totp.ts`, `lib/cuentas/esquemas.ts`, `lib/cuentas/modo-desarrollo.ts:115-135` (el
   `challengeAndVerify` en servidor) y `lib/cuentas/contenedor-proyecto.ts`.
8. `app/(app)/ajustes/acciones.ts` y `app/(app)/ajustes/reponer-totp/formulario-reponer-totp.tsx`: el
   molde de acción y formulario.
9. `app/primera-vez/segundo-factor.tsx` y su `.test.tsx`; `components/armazon/armazon.tsx:135-158`,
   `navegacion.tsx` y `cajon.tsx`.
10. `accesibilidad/codigos-recuperacion.spec.ts`: el molde del CA8.
11. `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/logging.md` (ver Q2).

---

## 0 · Hechos verificados contra el código

### Funciones y tablas vigentes

`supabase/migrations/20260830090000_cuentas_invitacion_baja_totp.sql` es la última migración que define
cada una de estas funciones. Comprobado con `grep -ln` sobre `supabase/migrations/*.sql`; ninguna
posterior las redefine.

- **`generar_codigos_recuperacion()`** (`:548-594`):
  - devuelve `setof text`, es definer y tiene `search_path=''`;
  - exige sesión, `rol_actual()` y `segundo_factor_verificado_recientemente()`, y si no, lanza 42501;
  - caduca el lote vigente (`usado_en = now()`) e inserta diez códigos de 5 bytes al azar en hex
    mayúscula, con hash `crypt(…, gen_salt('bf',12))`;
  - **no toma ningún candado y no escribe ningún aviso.**
- **`canjear_codigo_recuperacion`** (`:606-716`): si el canje sale bien, escribe en `auditoria` la fila
  `TOTP_REPUESTO` con `registro_id = v_uid::text` y `via='codigo_recuperacion'`, y un aviso
  `totp_repuesto`.
- **`registrar_reposicion_totp`** (`:498-525`): escribe en `auditoria`
  `('perfiles','TOTP_REPUESTO',p_perfil_id::text, …, via:'administrador')` y un aviso `totp_repuesto`.
- **`desbloquear_historia`** (`:727-832`; su última redefinición está en
  `20260915120000_registrar_acceso_historia.sql`): es el patrón de bloqueo del PIN.
  - Un fallo incrementa el contador; con `intentos >= 5`, `bloqueado_hasta = now()+15 min`.
  - Mientras dura el bloqueo, responde sin comparar.
  - Al caducar el bloqueo el contador **no** se reinicia: cada fallo posterior vuelve a bloquear, es
    decir, un intento cada quince minutos.
  - Solo un acierto pone el contador a cero.
  - El bloqueo deja el aviso `pin_bloqueado`.
- **`notificaciones`** (`:39-107`):
  - `tipo` es texto libre, sin `check`;
  - `authenticated` solo tiene `select` y `update`, con la política de lectura propia;
  - `fn_proteger_notificacion` solo deja cambiar `leida_en`.
- **`codigos_recuperacion_totp`**:
  - el disparador `auditar_codigos_recuperacion_totp` llama a `fn_auditar('id','codigo_hash')`, que
    quita `codigo_hash` de los estados;
  - no hay `select` para nadie.

### Auditoría, extensiones y configuración

- `20260829150000_auditoria_y_solo_adicion.sql`:
  - `fn_auditar(clave, columnas_a_quitar…)`;
  - `alter default privileges in schema public revoke all on tables from anon, authenticated,
    service_role`.
- `auditoria`:
  - no tiene política de `insert` (`20260815192424`);
  - `ocurrido_en` tiene `default now()` (`:53`);
  - la lista blanca de `registrar_evento_auditable` (`20260916120000_alta_de_paciente_completa.sql`) no
    incluye `TOTP_REPUESTO`, así que **nadie puede fabricar esa fila desde una sesión**;
  - la última definición de `auditoria_operacion_check` está en `20260916120000…:382`. No se toca.
- `pgcrypto` está en el esquema `extensions` (`20260815192424…:10`).
- Hoy **ninguna** función lee `auth.users`. `postgres` sí escribe en ella: `supabase/seed.sql:102` y la
  spec de T-037 insertan con `extensions.crypt(…, gen_salt('bf'))`. Todos los hashes de la siembra y de
  las specs son de pgcrypto, no de GoTrue.
- `supabase/config.toml`:
  - no fija ningún `log_*` de Postgres, así que rigen los valores por defecto de la imagen;
  - `[auth.rate_limit] sign_in_sign_ups = 30` (por IP, cada 5 min);
  - `minimum_password_length = 6`;
  - `secure_password_change = false`.

### Next.js

- **Next 16 registra los argumentos de las Server Actions en el terminal en desarrollo, por defecto.**
  - `node_modules/next/dist/server/config-shared.js:137`: `serverFunctions: true`.
  - `server/app-render/action-handler.js:822`: solo con `NODE_ENV === 'development'`.
  - `server/dev/server-action-logger.js` serializa los argumentos con `safe-stable-stringify`
    (profundidad 2, anchura 3). Un `{contrasena, codigo}` saldría **en claro** en la consola de
    `npm run dev`.
  - Se desactiva con `logging.serverFunctions: false` en `next.config.ts`, que **no está en el
    territorio** (ver Q2).
  - En producción no se registra.

### Banco 13

`scripts/rls/13-cuentas.sql`:

- Las aserciones sobre `notificaciones` (`:233`, `:241`, `:262-270`, `:329`) filtran por `tipo` o
  comprueban la ausencia para otro perfil. **Ninguna cuenta el total del titular**, así que un aviso más
  por generación no rompe ninguna. La de `:241` («PRO2 no lee las de PRO1») sigue valiendo.
- Las tres generaciones del banco (`:287` PRO2, `:316` PRO1, `:414` TEC1) son la **primera** de cada
  perfil dentro de la transacción. La siembra no crea lotes: ningún `codigos_recuperacion` en
  `supabase/seed.sql` ni en `scripts/*.mjs`, y `:280` confirma `sin_codigos` para TEC1.
- La de PRO1 va después de `registrar_reposicion_totp(:PRO1)` (`:218`), pero sin lote previo.
- **La regla de activación de §1.3 no rompe ninguna de las tres.**

### Aplicación

- `lib/cuentas/modo-desarrollo.ts:115-135`: `listFactors` y luego `challengeAndVerify({factorId, code})`
  sobre el cliente de cookies, en servidor. Es el molde para el TOTP de la acción.
- `lib/cuentas/totp.ts`:
  - `generarCodigosRecuperacion(sesion)` devuelve `{ok, codigos}` o `{ok:false, mensaje}`;
  - el molde registra el objeto de error, nunca la entrada.
- `app/primera-vez/segundo-factor.tsx`:
  - la vista de fallo es un `div` con `tabIndex=-1`, un `p role=status` y «Aceptar» (`router.refresh()`);
  - la vista de códigos no gestiona el foco.
- `app/primera-vez/segundo-factor.test.tsx:128`: la prueba R2-H2 avanza `advanceTimersByTimeAsync(30_000)`.
- `components/armazon/armazon.tsx:135-158`:
  - el bloque `Identidad` es de servidor y lleva iniciales, nombre, rol y el formulario de salida;
  - `modulos.ts` da `/ajustes` solo al administrador y no se toca.
- `proxy.ts`: `/cuenta` no es pública ni de acceso, así que la guardia de `(app)` la cubre.
- `lib/cuentas/contenedor-proyecto.ts`: `contenedorDelProyecto()` devuelve `supabase_db_<project_id>`.

---

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/<ts>_regenerar_codigos_recuperacion.sql`

`<ts>` es posterior a la última integrada cuando se tome el turno de `supabase/`. Hoy es
`20261003120000`, y antes de T-038 van en cola T-035, T-028a y cita↔episodio.

Hace cuatro cosas, en este orden: una tabla, dos funciones y los permisos.

**(a) Tabla `public.intentos_regenerar_codigos`**: el contador de fallos de contraseña, uno por titular.

```
perfil_id         uuid primary key references public.perfiles(id)   -- sin on delete: perfiles no se borra
intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0)
bloqueado_hasta   timestamptz
actualizado_en    timestamptz not null default now()
```

- `enable row level security`, **sin políticas**.
- `revoke all on table … from public, anon, authenticated, service_role`. Se inspecciona con `\dp`: el
  `alter default privileges` ya lo hace, pero el `revoke` explícito documenta.
- `create trigger auditar_intentos_regenerar_codigos after insert or update or delete … execute function
  public.fn_auditar('perfil_id')`.
  - Cada fallo deja así una fila `INSERT` o `UPDATE` en `auditoria` con `intentos_fallidos`. Es el
    equivalente de `PIN_FALLIDO` **sin verbo nuevo**.
  - Comprobar la firma exacta del disparador y de `fn_auditar` en `20260829150000`.
- Es mutable, como `pines_historia`. **No** entra en `tablas_solo_adicion`.
- `comment on table`: qué es y por qué no tiene grants.

**(b) Función nueva `public.regenerar_codigos_recuperacion(p_contrasena text)`**

```
returns table(motivo text, bloqueado_hasta timestamptz, codigos text[])
language plpgsql  volatile  security definer  set search_path = ''
```

Hace `revoke execute … from public, anon` y `grant execute … to authenticated`. Orden del cuerpo, que no
es negociable:

1. Si `auth.uid()` es nulo, `42501 'No hay sesión.'`.
2. Si `public.rol_actual()` es nulo, 42501, con el mismo texto que la función actual.
3. Si `not public.segundo_factor_verificado_recientemente()`, `42501`. El mensaje lleva un fragmento
   único, `… para regenerar los códigos de recuperación`.
   - Las tres guardas van **antes** del candado y del contador: quien no tiene `aal2` reciente no gasta
     intentos ni bloquea al titular.
4. `perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));`
   - Es la misma clave que (c), así que activar y regenerar se serializan entre sí.
   - La función es `volatile`, así que cada sentencia posterior toma una instantánea nueva y ve lo que la
     otra transacción confirmó antes de soltar el candado.
5. `select … into v_contador from public.intentos_regenerar_codigos i where i.perfil_id = v_uid`.
   - Puede no haber fila.
   - Alias obligatorio: `bloqueado_hasta` es también una columna OUT.
   - El candado del paso 4 basta para serializar: nadie más escribe esa tabla.
6. Si `v_contador.bloqueado_hasta > now()`, devuelve `('bloqueado', v_contador.bloqueado_hasta, null)`
   **sin comparar**. El sexto intento, aunque traiga la contraseña buena, falla.
7. Cotejo:
   - `select u.encrypted_password into v_hash from auth.users u where u.id = v_uid`;
   - `v_ok := coalesce(p_contrasena, '') <> '' and v_hash ~ '^\$2a\$[0-9]{2}\$.{53}$' and
     extensions.crypt(p_contrasena, v_hash) = v_hash`.
   - Un hash nulo, vacío o de otro formato (argon2 o scrypt de usuarios importados) da `v_ok = false`
     **sin lanzar**.
8. Si `not v_ok`:
   - `insert … (perfil_id, intentos_fallidos, bloqueado_hasta) values (v_uid, 1, null) on conflict
     (perfil_id) do update set intentos_fallidos = i.intentos_fallidos + 1, bloqueado_hasta = case when
     i.intentos_fallidos + 1 >= 5 then now() + interval '15 minutes' end, actualizado_en = now()
     returning …`. Es el patrón del PIN, que con el contador en 5 o más vuelve a bloquear en cada fallo.
   - Si queda bloqueado, `insert into public.notificaciones (perfil_id, tipo, detalle) values (v_uid,
     'regeneracion_codigos_bloqueada', 'La regeneración de tus códigos de recuperación se ha bloqueado
     quince minutos por demasiados intentos con una contraseña errónea. Si no has sido tú, avisa al
     administrador.')`.
   - Devuelve `('bloqueado', hasta, null)` o `('contrasena_incorrecta', null, null)`.
   - **No lanza**: si lanzara, el incremento se desharía y el límite no existiría.
9. Si `v_ok`:
   - si hay fila con `intentos_fallidos > 0 or bloqueado_hasta is not null`, se pone a `0` y `null`. Un
     `update` solo si está sucio, para no auditar ruido;
   - caduca el lote vigente (`update … c set usado_en = now() where c.perfil_id = v_uid and c.usado_en is
     null`), como hoy;
   - inserta diez códigos con la misma generación de hoy, copiada de `:548-594`, y los acumula en
     `v_codigos text[]`;
   - inserta el aviso `codigos_regenerados` con el texto de §1.4, **fuera de cualquier bloque `exception`**;
   - devuelve `('ok', null, v_codigos)`.

**Prohibido en el cuerpo:**

- `p_contrasena` en un `raise`, en un `insert`, en `jsonb_build_object`, en `format()` o en un `notice`;
- cualquier bloque `exception when`;
- `execute` dinámico;
- `language sql`, porque con un error el `CONTEXT` podría citar la sentencia.

**(c) Reemisión de `public.generar_codigos_recuperacion()`**: la de la activación. Misma firma
(`returns setof text`, sin parámetros), `volatile`, definer, `search_path=''` y los mismos grants.

1. Las tres guardas de hoy, tal cual, en el mismo orden y con los mismos textos. Así no cambian las
   aserciones `:362` ni `:401`.
2. El mismo `pg_advisory_xact_lock` del paso (b)4.
3. **Regla de activación (Q3, recomendada B).** Lanza `42501` con el texto «Ya tienes códigos de
   recuperación vigentes: se regeneran desde Mi cuenta, con tu contraseña.» si existe un código vigente
   del titular creado en o después de la última reposición, es decir:
   ```
   exists (select 1 from public.codigos_recuperacion_totp c
           where c.perfil_id = v_uid and c.usado_en is null
             and c.creado_en >= coalesce((select max(a.ocurrido_en) from public.auditoria a
                                          where a.operacion = 'TOTP_REPUESTO'
                                            and a.registro_id = v_uid::text), '-infinity'::timestamptz))
   ```
   - Se compara con `>=`: un empate falla cerrado.
   - No se filtra por `tabla`: las dos vías que escriben `TOTP_REPUESTO` (reposición y canje) usan
     `registro_id = uid`. Confirmar en `:498-525` y `:606-716` que `tabla` no hace falta.
   - **Comprobar el nombre real de la columna de usado/vigente** en la definición de
     `codigos_recuperacion_totp`, y usar el mismo predicado de «vigente» que la función actual.
4. Caduca, inserta los diez y los devuelve con `return next`, como hoy.
5. Inserta el aviso `codigos_regenerados`, el mismo de (b), fuera de cualquier bloque `exception` (P-3).

`canjear_codigo_recuperacion` y `registrar_reposicion_totp` **no se tocan**.

**(d) Comentarios** de las dos funciones: qué hace cada una, por qué la de activación no sirve de atajo y
por qué el fallo de contraseña no lanza.

### 1.2 Tipos

`npm run tipos` tras el `db reset` del turno. `lib/supabase/tipos-bd.ts` no se edita a mano.

### 1.3 Servidor

**`lib/cuentas/esquemas.ts`**: un esquema nuevo, con mensajes literales como el resto del fichero.

```ts
export const esquemaRegenerarCodigos = z.object({
  contrasena: z.string().min(1, '…').max(256, '…'),   // SIN trim: la contraseña es exacta
  codigo: z.string().regex(/^\d{6}$/, '…'),
});
export type DatosRegenerarCodigos = z.infer<typeof esquemaRegenerarCodigos>;
```

**`lib/cuentas/totp.ts`**: una función nueva.

```ts
export type ResultadoRegenerar =
  | { ok: true; codigos: string[] }
  | { ok: false; motivo: 'contrasena_incorrecta' }
  | { ok: false; motivo: 'bloqueado'; bloqueadoHasta: string }
  | { ok: false; motivo: 'error'; mensaje: string };
export async function regenerarCodigosRecuperacion(sesion: Sesion, contrasena: string): Promise<ResultadoRegenerar>
```

- Llama a `sesion.supabase.rpc('regenerar_codigos_recuperacion', { p_contrasena: contrasena })`. Es
  POST: **nunca** `{ get: true }`.
- Asigna `motivo` al resultado. Cualquier forma inesperada, o diez códigos que no sean diez, dan
  `error`.
- Si hay error, `console.error('[regenerarCodigosRecuperacion]', error)` y nada más. **Nunca** se
  registran `contrasena`, los argumentos ni `codigos`.

**`app/(app)/cuenta/acciones.ts`** (`'use server'`):

```ts
export type EstadoRegenerar = EstadoFormulario /* de lib/formularios.ts */ & { codigos?: string[]; bloqueadoHasta?: string };
export async function regenerarCodigos(datos: unknown): Promise<EstadoRegenerar>
```

1. `const sesion = await exigirSesion()`.
2. `esquemaRegenerarCodigos.safeParse(datos)`. Si falla, devuelve los errores de campo **sin** el valor.
3. `sesion.supabase.auth.mfa.listFactors()` y el primer factor TOTP `verified`, con la misma regla que
   `/primera-vez` y `modo-desarrollo.ts:115-135`. Si no hay ninguno, error general y **sin RPC**.
4. `sesion.supabase.auth.mfa.challengeAndVerify({ factorId, code: datos.codigo })` sobre el **cliente de
   cookies**.
   - Si da error, devuelve el error en el campo `codigo` y **no llama al RPC**.
   - Esto renueva `last_challenged_at` y deja la sesión en `aal2`. Es la **misma** sesión: no se crea
     ninguna auxiliar.
5. `regenerarCodigosRecuperacion(sesion, datos.contrasena)`: **una** llamada.
6. Asignación del resultado:
   - `ok` devuelve `{ codigos }`;
   - `contrasena_incorrecta` da un error en el campo `contrasena`;
   - `bloqueado` da un mensaje general con la hora en la zona de la organización;
   - `error` da el mensaje general.

**Prohibido** en la acción y en `lib/cuentas/**` para este recorrido:

- `signInWithPassword`, `reauthenticate`, `updateUser`, `signOut` y `superarSegundoFactorSembrado`;
- devolver o registrar `contrasena`;
- `revalidatePath`, porque la página la refresca el cliente tras «Ya los he guardado».

### 1.4 Textos de los avisos (viven en la base, no en `es.ts`)

- `codigos_regenerados`: «Se han generado códigos de recuperación nuevos; los anteriores ya no valen. Si
  no has sido tú, avisa al administrador.» Es el texto de P-3, cierto al activar y al regenerar.
- `regeneracion_codigos_bloqueada`: ver (b)8.

### 1.5 Pantallas

**`app/(app)/cuenta/page.tsx`** (servidor):

- `<Suspense>` y un cargador que llama a `exigirSesion`, como las demás páginas de `(app)` con
  `cacheComponents`;
- `h1` «Mi cuenta» y una sección «Seguridad» (`h2`) con dos piezas:
  - `<FormularioRegenerar />` (cliente);
  - `<ListaAvisos />` (servidor).
- No muestra correo, rol de otro ni nada que no tenga una acción o un dato detrás.

**`app/(app)/cuenta/formulario-regenerar.tsx`** (`'use client'`):

- `react-hook-form` con `zodResolver(esquemaRegenerarCodigos)`, que es **el mismo** esquema de la acción.
- Campos:
  - «Contraseña»: `type=password`, `autoComplete="current-password"`;
  - «Código de la aplicación»: `inputMode="numeric"`, `autoComplete="one-time-code"`.
- Texto previo: «Los códigos que tienes ahora dejarán de valer.»
- Tras cada envío, `reset({ contrasena: '', codigo: '' })` **siempre**, también si hay error. La
  contraseña no se queda en el estado del formulario.
- Errores de campo:
  - con `aplicarErroresDelServidor`, el foco al primer campo con error;
  - el campo lleva `aria-invalid` y su `aria-describedby` apunta al texto del error.
- **Vista de códigos** (sustituye al formulario):
  - `<section ref tabIndex={-1} aria-labelledby={idTitulo} aria-describedby={idAviso}>`, que tiene rol
    `region` y nombre;
  - `useEffect` lleva el foco a la sección al aparecer;
  - la descripción contiene «solo se enseñan esta vez» y «los anteriores ya no valen»;
  - la lista de diez códigos;
  - el botón «Ya los he guardado»: `setCodigos(null)`, `router.refresh()` y luego el foco al encabezado
    de la lista de avisos (`id` conocido, `tabIndex=-1`). **Sin temporizadores.**
- **Vista de fallo** (`bloqueado` o `error`): una `section` sustitutiva con el mismo molde, rol, nombre y
  descripción con el mensaje, y el botón «Volver» al formulario.

**`app/(app)/cuenta/lista-avisos.tsx`** (servidor):

- Lee `notificaciones` con `select('id, tipo, detalle, creado_en, leida_en')`:
  - `.in('tipo', ['codigos_regenerados','regeneracion_codigos_bloqueada','totp_repuesto','pin_bloqueado'])`;
  - `.order('creado_en', { ascending: false }).limit(50)`.
- La RLS ya acota al titular. **Incluye los leídos.**
- Formato de fecha:
  - zona de `organizacion.zona_horaria`, y `'Europe/Madrid'` si es nula;
  - `formatearFechaCorta` y `formatearHora` de `lib/fechas`.
- Sin avisos, el texto «No hay avisos de seguridad.»
- No marca como leído (T-015).

**`components/armazon/enlace-cuenta.tsx`** (`'use client'`):

- un `Link href="/cuenta"` que envuelve las iniciales, el nombre y el rol del bloque `Identidad`;
- `onClick={cerrarCajon}` (`useCerrarCajon`) y `aria-current="page"` en `/cuenta`, con `usePathname`;
- su nombre accesible empieza por «Mi cuenta» (texto solo para lectores) y contiene el texto visible;
- objetivo de al menos 44 px.

`armazon.tsx` lo usa dentro de `Identidad`. El formulario de salida queda fuera del enlace.

**`app/primera-vez/segundo-factor.tsx`**: R2-H3, R3-H1 y R3-H2.

- **Vista de fallo**:
  - `<section ref tabIndex={-1} aria-labelledby aria-describedby>`;
  - descripción: «No se han podido generar tus códigos de recuperación. No se volverán a ofrecer al
    entrar: puedes generarlos en Mi cuenta › Seguridad, con tu contraseña.»;
  - **«Reintentar»** llama otra vez a `generarCodigos()`; si va bien, se pasa a la vista de códigos;
  - **«Aceptar»**, que se mantiene: `router.refresh()`.
- **Vista de códigos** de la activación: el mismo molde de `section` con foco al aparecer.
- Sin `setTimeout` ni `setInterval` en ninguna de las dos.

Si la activación falla por la regla de §1.1(c), la acción lo trata como cualquier fallo. Aquí no debería
pasar: `/primera-vez` solo genera al activar.

**`lib/i18n/es.ts`**:

- claves nuevas bajo `cuenta.*`: título, sección, campos, ayudas, errores, vistas, la lista de avisos y
  `armazon.miCuenta`;
- cambios bajo `primeraVez.codigos.*`: fallo, reintentar y aceptar.
- Nada literal en los `.tsx`: lo vigila `sin-literales.test.ts`.

**`docs/interfaz.md`**:

- en §Donde el prototipo choca, la entrada Ajustes frente a «Mi cuenta» (P-1): el bloque «Usuario» de
  §Ajustes vive en `/cuenta` para los tres roles;
- la pantalla `/cuenta` en la lista de pantallas.

### 1.6 Pruebas y guiones nuevos

| Fichero | Qué |
|---|---|
| `scripts/rls/13-cuentas.sql` | Bloque nuevo al final, antes del `\echo`. Ver §3. |
| `scripts/t038-concurrencia.mjs` + `scripts/t038-concurrencia.sql` | CA4: dos conexiones, contraensayo rojo. |
| `lib/cuentas/esquemas.test.ts` | Casos del esquema nuevo. |
| `lib/cuentas/totp.test.ts` | Asignación de los motivos; que no registra la contraseña. |
| `app/(app)/cuenta/acciones.test.ts` | CA7 y sus mutantes. |
| `app/(app)/cuenta/formulario-regenerar.test.tsx` | CA10 (vistas de regenerar), borrado de campos, sin temporizadores. |
| `app/(app)/cuenta/lista-avisos.test.tsx` | Leídos incluidos, orden y filtro de tipos. |
| `components/armazon/enlace-cuenta.test.tsx` | Nombre accesible, `aria-current` y cierre del cajón. |
| `app/primera-vez/segundo-factor.test.tsx` | CA9, CA10 (activación) y CA11. |
| `accesibilidad/regenerar-codigos.spec.ts` | CA8 y CA13 de pantalla. |

---

## 2 · Decisiones y alternativas descartadas

- **D1 · La contraseña se coteja en Postgres con `extensions.crypt` dentro de una función definer.**
  - Así `authenticated` no gana ningún privilegio sobre `auth.users`: el dueño de la función lee el hash.
  - *Descartado*: `signInWithPassword` sobre un cliente auxiliar, porque crea una sesión en
    `auth.sessions` que hay que cerrar, deja eventos de entrada en GoTrue y no cierra la puerta de
    PostgREST (P-4).
  - *Descartado*: mandar desde Node un bcrypt calculado de la contraseña. P-4 dice «la contraseña como
    parámetro», exige una dependencia nueva y el valor seguiría siendo equivalente a una credencial
    para la RPC.
- **D2 · Dos funciones.**
  - La de activación (`generar_codigos_recuperacion()`, misma firma) y la de regeneración (nueva, con
    `p_contrasena`).
  - *Descartado*: un parámetro opcional en la misma función, porque una sobrecarga o un `default null`
    mezcla los dos caminos y hace que la guarda dependa de un `if`.
- **D3 · La activación deja de ser atajo con la regla «hay lote vigente posterior a la última
  `TOTP_REPUESTO`»** (opción B, Q3).
  - Nadie puede fabricar `TOTP_REPUESTO` desde una sesión.
  - *Descartado A*: caducar el lote entero al reponer y al canjear. Redefine dos funciones, y si el
    borrado del factor por la Admin API falla tras el canje, el usuario queda sin lote ni factor.
  - *Descartado*: la regla por `auth.mfa_factors.created_at`, porque una sesión `aal2` puede borrar y
    reinscribir factores y reiniciar la regla.
- **D4 · El fallo de contraseña devuelve un motivo, no lanza.**
  - Si lanzara, el contador se desharía con la transacción y el límite no existiría.
  - Las guardas de sesión **sí** lanzan 42501, como hoy, y van antes del contador.
- **D5 · Límite copiado del PIN.**
  - Cinco fallos dan quince minutos de bloqueo, y luego un intento cada quince minutos hasta el acierto.
  - Se avisa al bloquear.
  - Tabla propia sin grants y auditada por `fn_auditar`, **sin verbo nuevo**.
  - *Descartado*: reutilizar `pines_historia`. Es otro secreto, y el técnico no tiene PIN.
- **D6 · Candado consultivo por titular**, con la misma clave en las dos funciones. Es barato, se toma
  dentro de la transacción y lo exige el CA4 si la hipótesis se confirma.
  - *Descartado*: `select … for update` sobre el lote, porque no bloquea si no hay filas vigentes.
  - *Descartado*: `serializable`, porque PostgREST no lo fija y obligaría a reintentar.
- **D7 · El TOTP se verifica en la Server Action antes de la RPC**, con `challengeAndVerify` sobre el
  cliente de cookies: un TOTP erróneo no llama a la RPC (CA7, viñeta 2).
  - La contraseña errónea **sí** llama a la RPC una vez. Es la lectura del CA7 viñeta 1 bajo P-4: «manda
    P-4».
  - La prueba equivalente es que la RPC no devuelve códigos, no hay lote ni aviso y la pantalla da el
    error del campo.
- **D8 · Aviso en toda generación (P-3)**, en la misma transacción y sin bloque `exception`. Si el aviso
  falla, no hay lote.
- **D9 · «Mi cuenta» en `/cuenta` y enlace desde el bloque de usuario (P-1).** `modulos.ts` no cambia.
- **D10 · La lista de avisos lee `notificaciones` con el cliente de cookies y la RLS de lectura propia.**
  No hace falta función nueva.

---

## 3 · Cómo se cierra cada criterio de aceptación

**Convenciones del banco:**

- toda negativa usa `assert_lanza_codigo_msg` con el fragmento único y lleva su **gemela positiva**
  sobre el mismo perfil;
- las contraseñas de la fijación se ponen dentro de la transacción del banco, como `postgres`:
  `update auth.users set encrypted_password = extensions.crypt('clave-banco-pro1', extensions.gen_salt('bf', 4)) where id = :PRO1`;
- los conteos «antes y después» se leen como `postgres` en `\gset`.

**CA1** (banco 13, regeneración y activación)

- PRO1 con `como_con_2fa`. Se cuentan como `postgres`, antes y después:
  - vigentes del titular, con sus ids;
  - `notificaciones` de PRO1 con `tipo='codigos_regenerados'`;
  - `notificaciones` de los demás perfiles.
- `select * from public.regenerar_codigos_recuperacion('clave-banco-pro1')` exige:
  - `motivo='ok'` y `cardinality(codigos)=10`, con diez distintos;
  - cero vigentes del lote anterior (los ids de antes);
  - exactamente diez vigentes en total;
  - avisos del titular +1 y de los demás +0.
- Para la activación, el mismo CA1 sobre `generar_codigos_recuperacion()` de un perfil **sin lote**
  (TEC1 en `:414` ya lo es): +1 aviso.
- **Mutante**: quitar el `insert` del aviso pone rojo el «+1».

**CA2**

- Contra las dos funciones:
  - `aal1` (`como`);
  - `aal2` con el reto de hace diez minutos (`dar_segundo_factor(:X, '10 minutes')`).
- Cada caso exige `42501` con fragmento, y después, como `postgres`, lote y avisos sin cambios.
- Gemela: el mismo perfil con `last_challenged_at = now() - '6 seconds'` regenera.
- **Discrimina** el caso del reto antiguo: con una guarda que solo mirase `aal`, pasaría.
- Contraseña errónea con `aal2` reciente:
  - `motivo='contrasena_incorrecta'`, `codigos is null`;
  - lote sin cambios y ningún aviso;
  - `intentos_fallidos = 1`.
  - Es la mitad de base de la viñeta 1 del CA7.

**CA2 bis: límite de intentos**

- Cinco errores seguidos dan `contrasena_incorrecta` ×4 y luego `bloqueado` con `bloqueado_hasta`
  aproximadamente igual a `now()+15 min`, y un aviso `regeneracion_codigos_bloqueada`.
- El sexto, **con la contraseña correcta**, da `bloqueado` y el lote sin cambios.
- Como `postgres`, `bloqueado_hasta = now() - '1 second'`. Un fallo vuelve a bloquear (patrón del PIN);
  luego otra vez al pasado y la correcta da `ok` y el contador a 0.
- Dentro de la transacción del banco `now()` es constante, por eso el tiempo se mueve a mano.
- **Mutante**: si el fallo lanzara, el contador se quedaría en 0 y la aserción de `intentos_fallidos = 1`
  muere.

**CA2 ter: cuentas sin contraseña** (`encrypted_password = ''`, y luego `null` si la columna lo admite)

- La contraseña da `contrasena_incorrecta`, no da excepción y suma intento.
- Un hash con prefijo `$argon2` hace lo mismo.

**CA2 quater: la activación no es atajo**

- Sobre PRO2, que ya tiene lote en `:287`, `generar_codigos_recuperacion()` lanza `42501` con el
  fragmento «se regeneran desde Mi cuenta», y el lote no cambia.
- Gemela del mismo perfil:
  - como `postgres`, retrasar `creado_en` del lote vigente a `now() - '1 hour'`;
  - insertar como `postgres` una fila `auditoria` `TOTP_REPUESTO` con `registro_id = :PRO2` y
    `ocurrido_en = now() - '1 minute'`, o llamar a `registrar_reposicion_totp(:PRO2)` como ADM y retrasar
    el lote;
  - entonces la activación sí genera.
- Discrimina con el empate: lote con `creado_en = now()` y reposición con `now()` (misma transacción) da
  42501. Comprueba el `>=`.

**CA3**

- Tras regenerar, `canjear_codigo_recuperacion(<código del lote anterior>)` da `codigo_invalido` y uno
  del nuevo da `ok`.
- Se usa un perfil sin bloqueo de canje: **no PRO2**, que en `:304` queda bloqueado. Sirve PRO1 tras su
  regeneración, con contraseña fijada.
- Cuidado: el canje correcto borra factores. Hacer el CA3 **al final** del bloque de ese perfil.

**CA4**: `scripts/t038-concurrencia.mjs` y `.sql`, con el patrón de `test-huellas.mjs` y
`t005-concurrencia.sql`.

- Contenedor con `contenedorDelProyecto()`. **No** `localizarContenedor()` (R2-H4).
- Fijación confirmada:
  - un perfil propio de la prueba, con UUID nuevo y la contraseña fijada con `gen_salt('bf',4)`;
  - un factor con `last_challenged_at` reciente;
  - un primer lote. Confirma filas: **no es idempotente**, y se dice en la cabecera.
- Dos procesos `psql` en segundo plano (`\! PGAPPNAME=t038-a psql … &`), cada uno con:
  `begin; set local role authenticated; set local request.jwt.claims = '{… "aal":"aal2"}';`
  `select … from regenerar_codigos_recuperacion('…'); select pg_sleep(2); commit;`.
  - El `pg_sleep` **después** de la llamada y **antes** del `commit` fuerza que las dos se solapen.
  - El que espera se sondea con `pg_stat_activity.wait_event_type = 'Lock'`.
- Aserciones:
  - **exactamente diez vigentes** y **dos** `codigos_regenerados` nuevos;
  - y la variante de activación: dos `generar_codigos_recuperacion()` sobre un perfil sin lote dan diez
    vigentes, un aviso y un `42501` en uno de los dos.
- **Contraensayo**:
  - el guion crea, en una transacción aparte, `pg_temp` o una función temporal `public.t038_sin_candado`;
  - es una copia del cuerpo **sin** el `pg_advisory_xact_lock` y se borra en `finally`;
  - ejecuta lo mismo y **exige ver ≠ 10**, que la hipótesis predice como 20.
  - Si sale 10 también sin candado, se registra como medición que refuta la hipótesis y el candado se
    queda por la serialización con la activación.
- La salida de las dos pasadas va a `tickets/T-038/evidencia.json`.

**CA5**

- Tras una regeneración en el banco, como `postgres`:
  - en `auditoria`, 10 filas `UPDATE` cuyo `registro_id` está entre los ids del lote anterior y 10
    `INSERT` cuyo `registro_id` está entre los nuevos;
  - todas sobre `tabla='codigos_recuperacion_totp'` y con `actor_id = :PRO1`;
  - ninguna con `estado_anterior ? 'codigo_hash'` ni `estado_posterior ? 'codigo_hash'`.

**CA6** (banco y revisión)

- `pg_get_functiondef('public.regenerar_codigos_recuperacion(text)'::regprocedure)` y el de
  `generar_codigos_recuperacion()` **no** contienen `exception` (`!~* '\mexception\M'`).
- `pronargs` vale 0 y 1. El tipo del único argumento es `text`, que no es un perfil: se comprueba que
  ningún argumento es `uuid` ni se llama `p_perfil%`.
- **Contraseña en ningún sitio** (banco):
  - tras todos los casos, como `postgres`, `not exists (select 1 from auditoria where
    coalesce(estado_anterior::text,'') || coalesce(estado_posterior::text,'') like '%clave-banco-%')`;
  - lo mismo sobre `notificaciones.detalle`.
- **Privilegios**:
  - `has_function_privilege('anon', 'public.regenerar_codigos_recuperacion(text)', 'execute') = false`;
  - `has_table_privilege('authenticated', 'public.intentos_regenerar_codigos', 'select') = false`;
  - lo mismo para `insert`, `update`, `delete` y `truncate`;
  - `has_table_privilege('authenticated','auth.users','select') = false`.

**CA7** (`app/(app)/cuenta/acciones.test.ts`, con `exigirSesion` y el cliente simulados)

- **TOTP erróneo**: `challengeAndVerify` da error, la respuesta lleva el error en `codigo` y `rpc` tiene
  **0** llamadas.
- **Contraseña errónea**: `challengeAndVerify` va bien, la RPC devuelve `contrasena_incorrecta`, la
  respuesta lleva el error en `contrasena` y **no** trae `codigos`.
  - Es la lectura bajo P-4: la RPC se llama una vez y la base no deja nada (CA2).
  - Se pide al revisor que lo vea como la viñeta 1 reinterpretada.
- **Las dos bien**: `rpc` se llama **exactamente una vez**, con `('regenerar_codigos_recuperacion',
  { p_contrasena })` y sin opciones `get`. La respuesta trae los diez `codigos`.
- **Sesión `aal2`**:
  - en ningún caso se llama a `auth.signInWithPassword`, `reauthenticate`, `updateUser` ni `signOut`. Se
    simulan con espías que fallan si se invocan;
  - `challengeAndVerify` se llama sobre el **mismo** cliente que `rpc`;
  - la prueba en navegador está en el CA8.
- **Mismo esquema**: la acción importa `esquemaRegenerarCodigos` de `lib/cuentas/esquemas` y el
  formulario también. La prueba pasa `unknown` mal formado (`null`, `{contrasena: 1}`) y espera errores
  sin llamar a `listFactors`.
- **Contraseña nunca devuelta ni registrada**:
  - espía en `console.error` y `console.log`;
  - `JSON.stringify(resultado)` y todas las llamadas a consola **no contienen** la cadena de la
    contraseña de prueba, en todos los casos, el de error incluido.
- **Mutantes** que deben morir:
  - llamar a la RPC antes de `challengeAndVerify`;
  - devolver `codigos` con `motivo !== 'ok'`;
  - añadir `signInWithPassword`;
  - `console.error(datos)`.

**CA8** (`accesibilidad/regenerar-codigos.spec.ts`)

- Usuario propio con el molde de `crearUsuario`. Después, **la contraseña se fija por la Admin API de
  GoTrue**:
  - `PUT {URL}/auth/v1/admin/users/{id}` con `password` y la clave de servicio de `npx supabase status
    -o env`, para que el hash lo genere GoTrue y no pgcrypto;
  - si no es viable, ver «Por confirmar» n.º 2.
- Entra y activa con `codigoTotp`. El primer lote se lee con `leerLote`.
- Abre «Mi cuenta» **desde el enlace del bloque de usuario**.
- Teclea la contraseña y un TOTP de la **siguiente** ventana de 30 s.
- Comprueba:
  - diez códigos visibles;
  - `leerLote`: ids distintos y diez vigentes;
  - `consultar`: existe `codigos_regenerados` del usuario;
  - tras «Ya los he guardado», el aviso se ve en la lista;
  - el historial de URLs (`page.on('framenavigated')`) **no** contiene `/primera-vez`.
- **Sesión**: `select count(*), max(aal::text) from auth.sessions where user_id = …` antes y después de
  regenerar: misma cuenta y `aal2`.
- **Registros**, con un `t0` tomado antes de regenerar:
  - `docker logs --since t0` de `supabase_db_*`, `supabase_rest_*` y `supabase_kong_*` del proyecto **no
    contiene** la contraseña;
  - `select count(*) from extensions.pg_stat_statements where query like '%<contraseña>%'` da 0, si la
    extensión está; si no, se anota.
- **Contraseña errónea** antes de la correcta: se ve el error en el campo, el foco está en el campo y el
  lote no cambia.

**CA9** (`segundo-factor.test.tsx`)

- `generarCodigos` simulado que falla y luego va bien.
- La vista de fallo contiene «no se volverán a ofrecer» y «Mi cuenta».
- «Reintentar» llama a `generarCodigos` **dos** veces en total y enseña diez códigos.
- «Aceptar» sigue y llama a `router.refresh`.

**CA10**: cuatro vistas.

- Las vistas:
  - fallo al activar;
  - códigos al activar;
  - códigos regenerados;
  - fallo al regenerar (`bloqueado` y `error`).
- Para cada una:
  - `document.activeElement` es la `section`;
  - `getByRole('region', { name })` es ese mismo elemento;
  - `toHaveAccessibleName(...)`;
  - `toHaveAccessibleDescription(expect.stringContaining(<aviso>))`.
- **Mutante**: quitar `aria-labelledby` o el `useEffect` del foco la pone roja.

**CA11**

- En la prueba R2-H2, al aparecer la vista, `expect(vi.getTimerCount()).toBe(0)`. Se quita el
  `advanceTimersByTimeAsync(30_000)` como prueba de espera, o se mantiene **además**.
- La misma aserción en la vista de códigos regenerados.
- El revisor anota el mutante `setTimeout(() => router.refresh(), 60000)`, que muere por el contador.

**CA12**

- `grep -rn superarSegundoFactorSembrado --include=*.ts --include=*.tsx . | grep -v node_modules` debe
  dar la misma lista que en `main` antes del ticket. Se pega la diferencia vacía.

**CA13**

- Banco: ADM, PRO1 y TEC1 regeneran con su contraseña, y cada uno solo cambia **su** lote:
  - los vigentes de los otros dos no se mueven, comparados por ids antes y después;
  - el aviso va solo a cada titular.
- El técnico **no** tiene PIN y no se le pide: la acción no llama a nada de `pines_historia`.
  - Prueba unitaria: el formulario solo tiene dos campos.
  - Spec: el recorrido con un usuario `tecnico_administrativo`, o la variante de rol en `crearUsuario`.
- El enlace del armazón está para los tres roles: prueba de `enlace-cuenta` y de `armazon` con los tres
  roles.

**CA14 (manual)**: en `/cuenta` no hay selector de perfil; `git diff main -- 'app/(app)/ajustes/reponer-totp'`
vacío.

**CA15**:

- `npm test`, `npm run lint`, `npm run build`, `npm run lint:migraciones`, `npx supabase db reset` +
  `npm run seed` + `npm run test:rls`, `npm run test:a11y` (`--workers=1`), `npm run tipos` sin
  diferencias y `node ~/.claude/pipeline/territorio.mjs T-038`.
- Con `codigos-recuperacion.spec.ts` (T-037) **en verde**: la regla de activación no debe romperlo.

**CA16 (manual)**: `/cuenta` a 360 px al lado de `/prototipo`.

---

## 4 · Riesgos, por probabilidad

1. **Alta: registros del servidor de desarrollo.**
   - Next 16 imprime los argumentos de las Server Actions en `npm run dev` por defecto (§0), así que la
     contraseña sale en claro en la consola local.
   - Solo se arregla en `next.config.ts`, fuera del territorio (**Q2**).
2. **Alta: PRO2 en el banco.**
   - Queda con el canje bloqueado (`:304`) y con lote. Usarlo para el CA3 da `bloqueado`, no
     `codigo_invalido`.
   - Usar PRO1 o un perfil fijado aparte.
3. **Media: el canje del CA3 borra factores.**
   - Toda aserción posterior sobre ese perfil con `como_con_2fa` falla porque
     `segundo_factor_verificado_recientemente` no encuentra factor.
   - Hacer el canje al final, o volver a dar el factor.
4. **Media: hash de GoTrue.**
   - GoTrue genera `$2a$10$` (bcrypt de Go) y pgcrypto lo acepta, pero **sin comprobar en esta base**:
     todos los hashes de siembra y specs son de pgcrypto.
   - Si GoTrue usara `$2b$` o argon2, la regex daría `contrasena_incorrecta` a todos.
   - El CA8 lo cubre con la Admin API, y «Por confirmar» n.º 2.
5. **Media: privilegio de `postgres` sobre `auth.users`.**
   - Si el dueño de las funciones no tiene `select`, la RPC falla con 42501 en ejecución.
   - «Por confirmar» n.º 1, antes de escribir la migración.
6. **Media: registros de Postgres en producción.**
   - Con `log_statement='all'`, `log_min_duration_statement >= 0` y `log_parameter_max_length <> 0`,
     `auto_explain` o `pgaudit.log_parameter`, los parámetros ligados de PostgREST se escriben en el
     registro.
   - Esos parámetros son `SUSET`: `authenticated` no los cambia, pero el código no los puede garantizar
     (**Q1**).
7. **Baja: TOTP reutilizado.**
   - El CA8 debe teclear un código de la ventana siguiente a la de la entrada; si no,
     `challengeAndVerify` puede fallar o dar un falso verde.
8. **Baja: escaneo de `auditoria`.**
   - La regla de activación busca `TOTP_REPUESTO` por `registro_id` sin índice específico.
   - Solo ocurre al activar, y el volumen por clínica es pequeño. Si el plan sale caro en la medición,
     se anota y no se añade índice en este ticket.
9. **Baja: bloqueo por un ladrón.**
   - Quien tiene la sesión `aal2` reciente puede gastar los cinco intentos y bloquear al titular quince
     minutos.
   - Es el precio aceptado del patrón del PIN; el titular recibe el aviso.

### Ventanas que quedan abiertas (dichas, no cerradas)

- **Cuenta sin lote.** El ladrón con `aal2` reciente puede crear el primer lote por la activación sin
  contraseña. Encaja con «una vez hay lote» (P-4) y deja el aviso `codigos_regenerados` (P-3).
- **Lote de antes de una reposición o un canje.** El mismo caso cuando todos los códigos vigentes son
  anteriores a la última `TOTP_REPUESTO`. También avisa.

---

## 5 · Qué revisar

### La contraseña

- [ ] `p_contrasena` aparece **solo** en el `coalesce(...) <> ''` y en `extensions.crypt(p_contrasena,
      v_hash)`:
  - ningún `raise`, `format`, `insert`, `jsonb_build_object` ni `notice`;
  - ningún `execute`.
  - Comprobar con `grep -n p_contrasena` sobre la migración.
- [ ] Ningún bloque `exception` en las dos funciones (CA6), y el banco lo comprueba con
      `pg_get_functiondef`.
- [ ] La llamada a la RPC es POST: nada de `{ get: true }`. La acción no registra `datos`, `contrasena`
      ni `codigos`, y la prueba con espías en consola existe y **falla** con el mutante
      `console.error(datos)`.
- [ ] El formulario borra la contraseña tras **cada** envío, error incluido. Ningún estado de React
      guarda la contraseña después del envío, y el resultado de la acción no la contiene.

### Orden de guardas y límite

- [ ] Orden: sesión, rol, segundo factor reciente (lanzan 42501), candado, bloqueo, cotejo.
  - Las guardas lanzan **antes** del contador.
  - El fallo de contraseña **no** lanza: si lanzara, el contador se desharía. La prueba de
    `intentos_fallidos = 1` muere con ese mutante.
- [ ] El sexto intento con la contraseña correcta da `bloqueado`. Pasado el bloqueo, un fallo vuelve a
      bloquear: el patrón del PIN, no un reinicio a cero.

### Las dos funciones

- [ ] Las dos toman el **mismo** `pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:'||uid,0))`
      y son `volatile`.
- [ ] La regla de activación usa `>=` y la gemela con el empate existe. Para que la gemela sea positiva
      hay que retrasar el lote: verde en las dos.
- [ ] Ninguna de las dos funciones recibe perfil.
- [ ] El `insert` del aviso va en el cuerpo principal, no en un sub-bloque.
- [ ] `intentos_regenerar_codigos`:
  - `\dp` sin grants para `anon`, `authenticated` ni `service_role`;
  - RLS activada y sin políticas;
  - disparador de auditoría.
  - `TRUNCATE` no aplica: no es de solo adición; borrar el contador como `postgres` es tarea de
    administrador, no una puerta de sesión.
- [ ] `canjear_codigo_recuperacion`, `registrar_reposicion_totp` y `auditoria_operacion_check` **sin
      cambios** en el diff.

### Pruebas y criterios

- [ ] CA4: el contraensayo sale **rojo** en la salida guardada, o se registra la medición que refuta la
      hipótesis. Usa `contenedorDelProyecto()`.
- [ ] CA7 viñeta 1 bajo P-4: la RPC **se llama** una vez con la contraseña errónea, y lo que se exige es
      que no haya códigos en la respuesta y nada en la base. El revisor lo acepta como «manda P-4».
- [ ] La acción usa `challengeAndVerify` sobre el **cliente de cookies** y no crea cliente auxiliar.
- [ ] CA8 mide `auth.sessions` (misma cuenta, `aal2`) y los `docker logs`. La contraseña de la spec es
      una cadena única que no aparezca en ningún otro sitio, para que el `grep` sea discriminante.
- [ ] CA10 y CA11: las cuatro vistas, con foco, rol, nombre y descripción, y `getTimerCount() === 0`.

### Pantalla y armazón

- [ ] El enlace a «Mi cuenta» está para los tres roles, cierra el cajón y su nombre contiene el texto
      visible (WCAG 2.5.3). `modulos.ts` no cambia.
- [ ] La lista incluye los leídos, filtra los cuatro tipos y no ofrece «marcar leído».

---

## 6 · Territorio

El del contrato, sin ampliar:

```
supabase/migrations/*_regenerar_codigos_recuperacion.sql
scripts/rls/13-cuentas.sql
scripts/t038-*                      # t038-concurrencia.mjs y t038-concurrencia.sql
lib/supabase/tipos-bd.ts            # solo con npm run tipos
lib/cuentas/**
lib/i18n/es.ts
app/primera-vez/**
app/(app)/cuenta/**
components/armazon/**
accesibilidad/**
docs/interfaz.md
```

Más los ficheros de memoria del cierre (`docs/bitacora/T-038.md`, `docs/state.md`) y `tickets/T-038/**`
para la evidencia, como en todo ticket.

**Fuera**, salvo que el propietario diga sí en Q2: `next.config.ts`.

---

## 7 · Delegable

`delegable: volumen`, sin comportamiento:

- las claves de `lib/i18n/es.ts` (textos de §1.5), una vez fijados los nombres de clave;
- el pintado de `lista-avisos.tsx` (lista de lectura, sin estado ni foco) y su prueba de pintado;
- la entrada de `docs/interfaz.md`.

**No delegable**: la migración, el banco, el CA4, la acción, `totp.ts`, el formulario y las vistas (foco y
ARIA), el enlace del armazón (foco, `aria-current` y cajón), la vista de fallo de `/primera-vez` y la spec.

---

## Por confirmar al implementar (con la base, en el turno de `supabase/`)

1. **El dueño de las funciones lee `auth.users`.** `select has_table_privilege('postgres', 'auth.users',
   'select')` y `select pg_get_userbyid(proowner) from pg_proc where proname='generar_codigos_recuperacion'`.
   Si da `false`, **parar y volver al arquitecto**: no se da ningún grant a `authenticated`.
2. **Formato del hash de GoTrue y compatibilidad con pgcrypto.**
   - Crear un usuario por la Admin API o en la pantalla de invitación.
   - `select left(encrypted_password, 7) from auth.users where …`, y luego `select
     extensions.crypt('<clave>', encrypted_password) = encrypted_password` como `postgres`.
   - Se espera `$2a$10$` y `true`. Si sale otro prefijo, ajustar la regex del paso (b)7 a lo medido y
     anotarlo.
3. **La columna `aal` de `auth.sessions`** (`\d auth.sessions`), para el CA8. Si no existe, la
   comprobación de `aal2` del CA8 se hace leyendo el claim del JWT de la cookie tras regenerar.
4. **`challengeAndVerify` en servidor** no crea fila nueva en `auth.sessions` y sí actualiza
   `last_challenged_at`. Se mide en el CA8: conteo de sesiones antes y después, y
   `auth.mfa_factors.last_challenged_at` posterior a `t0`.
5. **El predicado exacto de «vigente»** y los nombres de columna de `codigos_recuperacion_totp`:
   `\d public.codigos_recuperacion_totp` y `:548-594`.
6. **Valores locales de registro**:
   - `show log_statement; show log_min_duration_statement; show log_parameter_max_length;
     show log_parameter_max_length_on_error; show shared_preload_libraries;`
   - se pegan en la evidencia;
   - el banco añade una aserción sobre ellos solo si el propietario elige Q1 (a) o (b).
7. **Firma de `fn_auditar`** como función de disparador con argumentos (`20260829150000`), para el
   disparador de la tabla nueva.

---

## Preguntas para el propietario

**Q1 · Registros de Postgres en producción: lo que el código no puede garantizar.**

Lo que el código sí garantiza:

- ningún `RAISE`, error, auditoría ni aviso lleva la contraseña;
- PostgREST la manda como parámetro ligado (POST);
- `pg_stat_statements` normaliza los valores.

Lo que **no** puede garantizar es la configuración de Postgres. Con `log_statement='all'`, el registro de
duración con `log_parameter_max_length` distinto de 0, `log_parameter_max_length_on_error` distinto de 0,
`auto_explain` o `pgaudit.log_parameter`, los parámetros ligados (la contraseña incluida) se escriben en el
registro **antes** de que la función se ejecute. Son parámetros `SUSET` y ninguna sesión los cambia, pero
quien administre la instancia sí.

Opciones:

- (a) Una nota en el manual de despliegue (los valores obligatorios), una aserción local en el banco
  sobre `current_setting` y la comprobación de `docker logs` del CA8.
- (b) **Recomendado.** (a) más una RPC previa `registro_postgres_seguro()`, definer y de solo lectura,
  que la acción llama **antes** de enviar la contraseña.
  - Si algún valor es inseguro, devuelve `false` y la acción no envía la contraseña. Falla cerrado, con
    el mensaje «La regeneración no está disponible; avisa al administrador».
  - Añade una función, unas diez líneas y sus pruebas, sin ampliar el territorio.
- (c) Aceptar el riesgo y documentarlo.

**Q2 · Consola de `npm run dev`.**

Next 16 imprime los argumentos de las Server Actions en desarrollo (§0), así que la contraseña sale en la
consola local.

- (a) **Recomendado.** Ampliar el territorio a `next.config.ts` para fijar `logging: { serverFunctions:
  false }`. Es una línea. Se pierde el registro de llamadas en desarrollo, que hoy nadie usa para
  depurar.
- (b) Aceptarlo: solo pasa en desarrollo, con contraseñas de prueba.
- (c) Pasar la entrada como `FormData`, que el formateador serializa como `{}`. Funciona por un detalle
  de `safe-stable-stringify`, rompe la convención `datos: unknown` + objeto Zod y se rompería en
  silencio con una versión nueva. No recomendado.

**Q3 · Cómo deja la activación de ser atajo.**

- (B) **Recomendado.** La activación falla si hay un código vigente creado en o después de la última
  `TOTP_REPUESTO` del titular.
  - No toca ninguna otra función.
  - Deja abiertas las dos ventanas de §4: sin lote, y lote anterior a una reposición. Las dos avisan.
- (A) Además, `registrar_reposicion_totp` y `canjear_codigo_recuperacion` caducan el lote vigente entero.
  - La regla pasa a ser simplemente «hay lote vigente», sin ventana tras la reposición.
  - Coste: redefinir dos funciones más y sus aserciones. Si tras el canje falla el borrado del factor por
    la Admin API, el usuario queda sin códigos y con un factor que no tiene, y solo lo saca el
    administrador.
  - Si se elige A, entran las dos redefiniciones en la misma migración y dos aserciones del banco (canje
    y reposición caducan).

---

## Lo que no entra, y por qué

- Campana, «marcar como leído» y contador de no leídos: es T-015.
- Cambiar la contraseña, el PIN o el TOTP propio desde «Mi cuenta»: son recorridos distintos.
- «Te quedan N códigos» o la fecha del lote: exige una lectura nueva sobre una tabla sin `select`, y
  ningún criterio lo pide.
- Un verbo de auditoría nuevo (`REGENERAR_CODIGOS` o `CONTRASENA_FALLIDA`): el contrato lo prohíbe. Los
  fallos quedan como filas de `intentos_regenerar_codigos` y el lote como filas de
  `codigos_recuperacion_totp`.
- Un índice sobre `auditoria` para la regla de activación: no hay medición que lo pida (riesgo 8).
- Un bloqueo escalonado más allá del patrón del PIN (un intento cada quince minutos tras el quinto): ya
  es más estricto que el límite de entrada de GoTrue (30 cada 5 min por IP).
- R2-H4 en `seed.mjs` y `test-huellas.mjs`: fuera del territorio y sigue en `state.md`. El guion nuevo
  ya usa `contenedorDelProyecto()`.
- `beforeunload` en la vista de códigos: lo descartó el propietario en T-037.

## Decisiones del propietario (02-10-2026)

Las tres van con la recomendación y mandan sobre lo de arriba donde choquen.

- **Q1 → (b).** Antes de mandar la contraseña, la acción llama a `registro_postgres_seguro()`.
  - Si algún ajuste de registro escribiría los parámetros, la acción no la manda y avisa al usuario con un texto propio, sin decir qué ajuste es.
  - Además: la nota en el manual de despliegue y las comprobaciones del banco y de los `docker logs`.
- **Q2 → (a).** `next.config.ts` entra en el territorio, solo para `logging: { serverFunctions: false }`. El contrato ya está ampliado.
- **Q3 → (B).** La activación se rechaza si existe un código vigente creado en o después de la última reposición del TOTP. No se redefine ninguna otra función.
  - El hueco que queda (el primer lote con la sesión robada y un TOTP reciente) se da por aceptado: el titular recibe el aviso.

---

# Adenda ronda 2 (03-10-2026)

Responde a la revisión de la ronda 1 (`tickets/T-038/revision.md`: 1 ALTA, 8 MEDIA, 9 BAJA) sobre la
rama `worktree-agent-a4f5dba88baa1b115` (HEAD 3fc4a2b). Lo de arriba sigue en vigor salvo donde esta
adenda lo sustituye, y lo dice: §1.1 (la función de un paso), §1.3 (la llamada única), D2, D4 y D6, y
el cierre de CA2, CA4 y CA6 en el banco.

**Antes de implementar hay que confirmar P1** (§R2.9). Cambia la forma de la función que pide P-4, y
eso lo decide el propietario.

## R2.0 · Hechos verificados (ronda 2)

### PostgREST, contra el código y la configuración reales

- Versión: `docker exec supabase_rest_Psicogestion /bin/postgrest --version` → **PostgREST 16.1**.
  Fuente leída en el tag `v16.1`, bajo `src/library/PostgREST/` (`ApiRequest/Preferences.hs`,
  `Plan.hs`, `Query.hs`/`MainTx.hs`, `Config.hs`).
- **`Prefer: tx=rollback` hoy no funciona.**
  - `preferTransaction` solo se acepta con `db-tx-end` en `commit-allow-override` o en
    `rollback-allow-override`.
  - El contenedor no lleva `PGRST_DB_TX_END`, así que vale el valor por defecto, `commit`.
  - `supabase/config.toml [api]` no tiene ajuste de transacción.
  - Conclusión: un cambio de configuración lo abriría. El arreglo no puede depender de él.
- **Un GET a `/rpc/...` corre en una transacción de solo lectura** (`SQL.Read`).
  - Con la función de un paso de la ronda 1 da un oráculo por el mensaje de error:
    - contraseña mala → falla el `INSERT` del contador;
    - contraseña buena con el contador limpio → no escribe y devuelve `ok`… hasta el `UPDATE` del lote;
    - los textos de error son distintos.
  - Deducido del código; no medido por HTTP en esta ronda.
- **El oráculo principal es el del objeto singular** (A-H1).
  - Para una llamada RPC, `Accept: application/vnd.pgrst.object+json` más un filtro sobre la salida
    (`?motivo=eq.ok`) hace que una respuesta con 0 filas dé **406 y rollback**, y una con 1 fila dé 200
    y commit.
  - Con contraseña mala: 406, el contador no se guarda y se puede repetir sin límite.
  - `Prefer: handling=strict, max-affected=…` hace lo mismo.
  - No hay `Prefer: timeout` en 16.1: la lista de preferencias es `resolution`, `representation`,
    `count`, `tx`, `missing`, `handling`, `timezone` y `max-affected`.
- **Principio que sale de todo lo anterior:** en una sola transacción cuyo resultado ve el llamante no
  se puede comparar un secreto y llevar la cuenta de los fallos. Cualquier forma de la respuesta que
  dependa del acierto le deja al cliente deshacer el intento.

### Base local (solo lectura, en `begin … rollback`, sin `db reset`)

- La base del verificador tiene aplicada hasta `20261007120000`: la migración de T-038 no está aplicada
  ahora mismo.
- `dblink`: disponible pero no instalado. `pg_background`: no disponible.
- `pgaudit` está en `shared_preload_libraries` pero no como extensión creada.
- Bibliotecas precargadas:
  - `shared_preload_libraries` = `pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron,
    pg_net, pgsodium, auto_explain, pg_tle, plan_filter, supabase_vault`.
  - `session_preload_libraries` = `supautils`.
  - `local_preload_libraries` está vacío.
- `postgres` no es superusuario y es miembro de `pg_read_all_settings`.
- Ajustes de registro de la imagen:

  | Ajuste | Valor |
  |---|---|
  | `log_statement` | `ddl` |
  | `log_parameter_max_length` | `-1` |
  | `log_parameter_max_length_on_error` | `0` |
  | `log_min_duration_statement` | `-1` |
  | `log_min_duration_sample` | `-1` |
  | `log_statement_sample_rate` | `1` |
  | `log_transaction_sample_rate` | `0` |
  | `debug_print_parse`, `debug_print_rewritten`, `debug_print_plan` | `off` |
  | `auto_explain.log_min_duration` | `10000` (ms) |
  | `auto_explain.log_parameter_max_length` | `-1` |
  | `auto_explain.log_nested_statements` | `off` |
  | `pgaudit.log` | `none` |
  | `pgaudit.log_parameter` | `off` |
  | `pgaudit.role` | `''` |

- `statement_timeout`:
  - en la sesión `psql -U postgres` vale **`0`**;
  - en `pg_db_role_setting`: `authenticated` → `statement_timeout=8s`; `anon` → `3s`;
    `authenticator` → `statement_timeout=8s`, `lock_timeout=8s` y
    `session_preload_libraries=supautils, safeupdate`.
- **Qué puede fijar `postgres` con `set local`** (medido; lo permite `supautils`):

  | `postgres` sí puede fijar | `postgres` no puede fijar (`permission denied`) |
  |---|---|
  | `log_statement` | `log_transaction_sample_rate` |
  | `log_min_duration_statement` | `log_min_duration_sample` |
  | `log_parameter_max_length` | `log_statement_sample_rate` |
  | `log_parameter_max_length_on_error` | `pgaudit.log_parameter` |
  | `debug_print_plan` | |
  | `auto_explain.log_min_duration` | |
  | `auto_explain.log_parameter_max_length` | |
  | `pgaudit.log` | |
  | `pgaudit.role` | |

  `alter database postgres set auto_explain.…` se rechaza; `alter role authenticated set auto_explain.…`
  se acepta (medido en `rollback`).
- `set local transaction_read_only = on` dentro de un `savepoint` se deshace con
  `rollback to savepoint`: después, `transaction_read_only` vuelve a `off` y se puede escribir (medido).
  El banco puede probar la guarda de solo lectura sin romper su transacción única.
- PostgREST lleva un JWKS con una clave `oct` (HS256, la heredada) y una `EC` (ES256): un token HS256
  firmado con el secreto local vale para un guion.

### Código

- `registrar_reposicion_totp(p_perfil_id)` (`20260830090000_cuentas_invitacion_baja_totp.sql:498`):
  - es su única definición;
  - la guarda es `if (select public.rol_actual()) <> 'administrador'`, y con `rol_actual()` nulo la
    comparación da `null` y **la guarda no salta**;
  - no rechaza `p_perfil_id = auth.uid()`;
  - la pantalla `app/(app)/ajustes/reponer-totp/page.tsx:38` ya excluye al propio perfil;
  - `lib/cuentas/totp.ts:30-43` solo borra factores si la RPC no da error.
- `desbloquear_historia(p_pin)` (última definición: `20260830090000:727`, sin `volatile` explícito, o
  sea volátil):
  - devuelve `pin_incorrecto` sin lanzar y su contador solo persiste si el llamante confirma: es **el
    mismo patrón que A-H1**;
  - la llama `lib/cuentas/candado.ts:61`.
- `canjear_codigo_recuperacion(p_codigo)` (`20260830090000:606`) tiene el mismo patrón, con
  `motivo = 'codigo_invalido'`.
- `components/armazon/armazon-cliente.tsx`:
  - en `:91` el `CajonContext.Provider` envuelve solo `{navegacion}`;
  - en `:95` `{identidad}` queda fuera;
  - el velo y la «X» comparten el nombre `t('armazon.cerrarMenu')`.
- `app/(app)/cuenta/formulario-regenerar.tsx:53-78`:
  - un `try/finally` sin `catch`;
  - el `reset` está en `:57`, después del `await`;
  - «Volver» (`:104`) solo cambia la vista.
- `lista-avisos.tsx:38-52`: si hay `error` se registra y se pinta `cuenta.avisos.vacio`. En `:63` el
  leído y el no leído solo se distinguen por el grosor de letra.
- `acciones.ts:40`: el `error` de `listFactors` se descarta.
- `segundo-factor.tsx:177`: el `role="status"` muestra `{falloCodigos}` sin más; con el mismo texto dos
  veces, no cambia.

## R2.1 · Piezas y contratos (cambios sobre §1)

### R2.1.1 Migración `20261008120000_regenerar_codigos_recuperacion.sql` (se edita en su sitio)

No está en `main`, así que se corrige el mismo fichero y no se añade otro. La firma
`regenerar_codigos_recuperacion(text)` **desaparece del fichero**: no se crea y se borra, simplemente
no se crea.

**a) Tabla `intentos_regenerar_codigos`: dos columnas más en el `create table`.**

```
regeneraciones_autorizadas smallint not null default 0
  check (regeneraciones_autorizadas between 0 and 2),
autorizado_hasta timestamptz
```

Se mantienen RLS sin políticas, `revoke all` y el disparador `fn_auditar('perfil_id')`.

**b) Nueva `public.comprobar_contrasena_para_regenerar(p_contrasena text) returns void`.**

Es `language plpgsql volatile security definer set search_path = ''`. Las sentencias van en este
orden exacto:

1. Las tres guardas de hoy, con los mismos textos y el 42501: sesión, `rol_actual()` nulo, y
   `segundo_factor_verificado_recientemente()`. El fragmento «para regenerar los códigos de
   recuperación» se queda.
2. `if current_setting('transaction_read_only') = 'on' then raise exception 'La comprobación de la
   contraseña exige una transacción de escritura.' using errcode = '25006'; end if;`
   - Va **antes** del candado y de `crypt`: con un GET nunca se llega a comparar.
3. `perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));`
4. `select it.bloqueado_hasta into v_hasta … where perfil_id = v_uid;`
   - Si `v_hasta > now()`, `return;` sin comparar ni escribir.
5. Se lee `v_hash` y se calcula `v_ok` con **la misma expresión** de la ronda 1: no vacío, regex
   bcrypt y `crypt`. Luego `v_ok := coalesce(v_ok, false)`.
6. **Una sola sentencia de escritura**, igual para el acierto y para el fallo. Nada de `if v_ok`
   alrededor:

   ```
   insert into public.intentos_regenerar_codigos as it
     (perfil_id, intentos_fallidos, bloqueado_hasta, regeneraciones_autorizadas, autorizado_hasta, actualizado_en)
   values (v_uid,
           case when v_ok then 0 else 1 end,
           null,
           case when v_ok then 1 else 0 end,
           case when v_ok then now() + interval '60 seconds' end,
           now())
   on conflict (perfil_id) do update set
     intentos_fallidos = case when v_ok then 0 else least(it.intentos_fallidos + 1, 100) end,
     bloqueado_hasta   = case when v_ok then null
                              when it.intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
                              else null end,
     regeneraciones_autorizadas = case when v_ok
                                       then least(case when it.autorizado_hasta > now()
                                                       then it.regeneraciones_autorizadas else 0 end + 1, 2)
                                       else 0 end,
     autorizado_hasta  = case when v_ok then now() + interval '60 seconds' else null end,
     actualizado_en    = now()
   returning it.bloqueado_hasta into v_bloqueo;
   ```

   - El `least(…, 100)` hace que ninguna rama pueda desbordar el `smallint`. Un error solo en la rama
     del fallo volvería a ser un oráculo.
7. `if v_bloqueo is not null then insert into public.notificaciones … 'regeneracion_codigos_bloqueada' …`
   con el texto de la ronda 1.
   - Esta es la única diferencia entre ramas, y solo pasa en el fallo que bloquea.
   - Ese fallo se confirma igual que los demás. Y lo que revela, «estás bloqueado», ya lo dice el paso
     dos.
8. Fin, sin `return query`.

Grants y comentario:

- `revoke execute … from public, anon; grant execute … to authenticated;`
- Comentario: «Paso uno de dos (T-038, ronda 2). Coteja la contraseña y deja confirmado el resultado:
  un intento fallido o una autorización de 60 s. No devuelve nada, ni distinto en el acierto: el
  resultado solo se ve en una transacción posterior.»

**c) `public.regenerar_codigos_recuperacion()`, sin parámetros.**

Devuelve `table (motivo text, bloqueado_hasta timestamptz, codigos text[])` y es `volatile security
definer set search_path = ''`. El orden:

1. Las mismas tres guardas (42501).
2. El mismo candado de consejo.
3. Lectura de `bloqueado_hasta`. Si `> now()`: `return query select 'bloqueado', v_hasta, null`.
4. **Consumo de una autorización:**

   ```
   update public.intentos_regenerar_codigos it
      set regeneraciones_autorizadas = it.regeneraciones_autorizadas - 1, actualizado_en = now()
    where it.perfil_id = v_uid and it.regeneraciones_autorizadas > 0 and it.autorizado_hasta > now();
   ```

   - `if not found then return query select 'contrasena_incorrecta'::text, null::timestamptz,
     null::text[]; return; end if;`
   - Este paso **no** toca `intentos_fallidos`: sin contraseña no hay intento.
5. Caducar el lote, generar diez, avisar con `codigos_regenerados` y devolver `'ok'`: el cuerpo de la
   ronda 1 sin cambios.
   - **El consumo va antes de caducar el lote.** Lo mide la pasada B de R2-3.

Grants: los mismos que en (b).

**d) `generar_codigos_recuperacion()` (la activación) no cambia.**

**e) `registrar_reposicion_totp(p_perfil_id uuid)` se redefine aquí (A-H3).**

Es el cuerpo de `20260830090000:498-525` copiado entero, con dos cambios:

- La guarda pasa a `if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario
  then raise … '42501'` (mismo texto). Con un rol nulo ya salta.
- Justo después: `if p_perfil_id = (select auth.uid()) then raise exception 'Un administrador no puede
  reponer su propio TOTP: lo repone otro administrador o el titular con un código de recuperación.'
  using errcode = '42501'; end if;`

Se copian también el mismo comentario, más la frase «Rechaza la reposición propia (T-038, A-H3)», y los
grants existentes (se comprueban con `\df+` antes de copiar).

**f) `registro_postgres_seguro()` se parte en dos (A-H2, A-H4, A-H5, A-H6).**

**`public.evaluar_registro_postgres(p_ajustes jsonb) returns boolean`**

- `language plpgsql immutable set search_path = ''`, no definer.
- `revoke execute … from public, anon, authenticated, service_role`: solo la llama su dueño, que es el
  banco como `postgres`.
- Es una función pura del mapa `nombre → setting` (el texto de `pg_settings.setting`, en sus unidades:
  ms para los umbrales y el `statement_timeout`).
- Devuelve **falso** (inseguro) si se cumple cualquiera de estas reglas, en este orden:

  | Regla | Inseguro cuando… |
  |---|---|
  | **N0** · faltan claves del núcleo | falta cualquiera de `log_statement`, `log_parameter_max_length`, `log_parameter_max_length_on_error`, `log_min_duration_statement`, `log_min_duration_sample`, `log_statement_sample_rate`, `log_transaction_sample_rate`, `debug_print_parse`, `debug_print_rewritten`, `debug_print_plan`, `statement_timeout`, `shared_preload_libraries`, `session_preload_libraries`, `local_preload_libraries` (`not p_ajustes ?& array[…]`) |
  | **N1** · faltan claves de una extensión cargada | se calcula `cargadas` = las tres listas `*_preload_libraries` partidas por comas, con `trim`, sin comillas, sin ruta (`regexp_replace(x, '^.*/', '')`) y en minúsculas. `ae := 'auto_explain' = any(cargadas) or p_ajustes ? 'auto_explain.log_min_duration'`; `pa := 'pgaudit' = any(cargadas) or p_ajustes ? 'pgaudit.log'`. Inseguro si `ae` y falta alguna de `auto_explain.log_min_duration` o `auto_explain.log_parameter_max_length`, o si `pa` y falta alguna de `pgaudit.log`, `pgaudit.log_parameter` o `pgaudit.role` |
  | **C1** | `log_statement = 'all'` |
  | **C2** | `log_parameter_max_length_on_error <> 0` |
  | **C3** | `alcanzable(log_min_duration_statement)` y `log_parameter_max_length <> 0` |
  | **C4** | `alcanzable(log_min_duration_sample)` y `log_statement_sample_rate > 0` y `log_parameter_max_length <> 0` |
  | **C5** | `log_transaction_sample_rate > 0` y `log_parameter_max_length <> 0` (A-H2) |
  | **C6** | `debug_print_parse` o `debug_print_rewritten` o `debug_print_plan` = `on`. Un plan a medida lleva los parámetros como constantes |
  | **C7** | `ae` y `alcanzable(auto_explain.log_min_duration)` y `auto_explain.log_parameter_max_length <> 0` (A-H6) |
  | **C8** | `pa` y `pgaudit.log_parameter = 'on'` y (`pgaudit.log <> 'none'` o `pgaudit.role <> ''`) |

  - `alcanzable(u) := u >= 0 and not (st > 0 and st <= u)`, con `st` = `statement_timeout`.
  - Dicho en palabras: un umbral de duración solo es seguro si está apagado (`-1`) o si **el
    `statement_timeout` en vigor corta antes**. Una sentencia cancelada no llega a `ExecutorEnd` ni al
    registro de duración.
  - Cada condición se evalúa con `coalesce(<condición>, true)`: un valor nulo o ilegible es
    **inseguro** (A-H5).
  - Un valor que no se puede convertir lanza al hacer el cast. En la acción, un error de la RPC ya es
    «inseguro».
  - Comentario de la función: `log_statement` en `mod`/`ddl` y `log_min_error_statement` son seguros
    porque PostgREST manda los argumentos como parámetro ligado (`$1`). Lo que escribe los valores son
    las reglas de arriba.

**`public.registro_postgres_seguro()`**

- Misma firma y mismos grants que en la ronda 1 (`authenticated` sí, `anon` no).
- `language sql stable security definer set search_path = ''`.
- Cuerpo:

  ```
  select public.evaluar_registro_postgres(
    (select jsonb_object_agg(s.name, s.setting) from pg_catalog.pg_settings s
      where s.name = any (array[ <las 14 del núcleo>, 'auto_explain.log_min_duration',
             'auto_explain.log_parameter_max_length', 'pgaudit.log', 'pgaudit.log_parameter',
             'pgaudit.role' ])));
  ```

- Lee el `statement_timeout` **de la propia transacción del llamante**. Por PostgREST es el de
  `authenticated`/`authenticator` (8 s). El paso uno corre con el mismo rol, así que con el mismo valor.
- La cabecera del fichero deja de decir «falla cerrado» sin más y dice lo que hace N0/N1/`coalesce`.

### R2.1.2 `lib/cuentas/totp.ts` · `regenerarCodigosRecuperacion(sesion, contrasena)`

1. `const { error: errorComprobacion } = await sesion.supabase.rpc('comprobar_contrasena_para_regenerar',
   { p_contrasena: contrasena });`
   - Si hay error: `console.error('[regenerarCodigosRecuperacion] comprobar', errorComprobacion.code)`
     y devuelve `{ ok: false, motivo: 'error', mensaje: MENSAJE_ERROR_REGENERAR }`.
2. `const { data, error } = await sesion.supabase.rpc('regenerar_codigos_recuperacion');` y debajo la
   traducción de hoy, sin cambios.

Ninguna de las dos lleva `{ get: true }`. El comentario de la función dice «dos llamadas, la primera
con la contraseña». `ResultadoRegenerar` no cambia.

### R2.1.3 Tipos

`npm run tipos` tras aplicar la migración. La vía la fija §1.2; es el único cambio en
`lib/supabase/tipos-bd.ts`.

### R2.1.4 Textos nuevos en `lib/i18n/es.ts`

- `cuenta.avisos.errorLectura`: «No se han podido cargar los avisos. Recarga la página para
  intentarlo de nuevo.»
- `cuenta.avisos.sinLeer`: «Sin leer».

### R2.1.5 `docs/interfaz.md` (líneas 200-202)

Se añade una frase: «Los no leídos llevan la marca visible "Sin leer"; un fallo al leerlos se dice como
fallo, nunca como lista vacía.»

## R2.2 · Decisiones y alternativas descartadas (ronda 2)

**DR1 · Dos pasos.** El paso uno compara y confirma siempre, con una respuesta igual para el acierto y
el fallo. El paso dos regenera leyendo solo lo confirmado. Sustituye a D4 en la firma, y D2 pasa a tres
funciones.

- El cliente no puede ver el resultado de la comparación dentro de la transacción que la hace.
  Ninguna combinación de `Accept`, filtro, `Prefer`, GET o `max-affected` distingue nada: la respuesta
  es la misma.
- Cuando lo ve, en el paso dos, el intento ya está confirmado.
- *Descartado `dblink`/transacción autónoma*: no está instalado y pide credenciales guardadas en la
  base.
- *Descartado no exponer la RPC* (llamarla con `service_role`): obligaría a pasar el perfil como
  parámetro (rompe CA6) y a reimplementar las guardas de sesión fuera de Postgres.
- *Descartado «solo `volatile` + comprobar `transaction_read_only`»*: cierra el GET, pero no el objeto
  singular con filtro, que va por POST en una transacción de escritura.
- *Descartado confiar en `db-tx-end=commit`*: hoy `tx=rollback` se ignora, pero es configuración y no
  cierra el 406.
- *Descartado que el paso dos vuelva a pedir la contraseña*:
  - Si la coteja y devuelve códigos, vuelve a ser comparar y revelar en la misma transacción.
  - Quien tuviese una autorización pendiente podría probar contraseñas sin límite durante 60 s.

**DR2 · La autorización es un contador con caducidad (60 s, máximo 2), no un booleano.**

- Un doble envío legítimo da dos regeneraciones correctas y no un «contraseña incorrecta» falso.
- CA4 se cumple al pie de la letra: dos regeneraciones concurrentes, diez vigentes, dos avisos.
- Un fallo pone la autorización a 0: tras una contraseña mala no queda nada pendiente.

**DR3 · El paso uno escribe en una sola sentencia con `case` sobre `v_ok`, y la guarda de solo lectura
va antes de `crypt`.**

- Con dos ramas (`if v_ok then update … else insert …`) volvería el oráculo del mensaje de error con
  GET.
- La guarda explícita hace además que el GET no gaste bcrypt.

**DR4 · Se queda el candado de consejo en los tres sitios.**

- En la regeneración ya no es lo único que serializa: también lo hace el candado de fila del consumo.
- Sigue haciendo falta entre activación y regeneración, que no comparten fila.

**DR5 · A-H3: se rechaza la reposición propia en `registrar_reposicion_totp`, en vez de filtrar
`actor_id <> registro_id` en la regla Q3(B).**

- Cierra la puerta en su origen, y no deja filas `TOTP_REPUESTO` que mañana otra regla tome por
  legítimas.
- No contradice el ADR-039: la reposición existe para quien se queda fuera, y quien se queda fuera no
  tiene sesión `aal2` para reponerse.
- La guarda nula (`is distinct from`) se corrige porque es la misma línea, y la regla Q3(B) depende de
  ella.

**DR6 · Evaluador puro más envoltorio.**

- El banco corre como `postgres`, que no puede fijar `log_transaction_sample_rate`,
  `log_min_duration_sample`, `log_statement_sample_rate` ni `pgaudit.log_parameter` (medido).
- Sin el evaluador, C4, C5 y C8 no tendrían negativa. El revisor midió como `supabase_admin`, que el
  banco no usa.
- Las condiciones que `postgres` sí puede fijar se prueban además en vivo, a través del envoltorio.

**DR7 · El umbral de duración se compara con el `statement_timeout` leído en la misma función, no se
supone.**

- La regla literal de A-H6 («cualquier valor ≥ 0 es inseguro») declara inseguro el valor de fábrica de
  la imagen (`auto_explain.log_min_duration = 10000` con `log_parameter_max_length = -1`).
- Con ella la regeneración no funcionaría nunca, ni en local ni, previsiblemente, en la instancia
  dedicada.
- Lo que A-H6 señala de verdad es que la ronda 1 suponía los 8 s sin mirarlos. Ahora se miran:
  - si alguien sube el `statement_timeout` por encima del umbral, o lo quita (`0`), la función dice
    «inseguro» y no se manda la contraseña.
- Es la pregunta P4 al propietario, por si quiere la regla literal.

**DR8 · A-H7: las copias del contraensayo se crean con `revoke … from public, anon` en la misma fase, y
la fase borra antes cualquier copia de una pasada interrumpida.**

## R2.3 · Criterios de la ronda 2 para el verificador (con sus mutantes)

**Todos los CA1–CA16 de la ronda 1 se vuelven a ejecutar.** Se reescriben al protocolo de dos pasos
como dice R2.5.

Comandos:

- `npm run test:rls`
- `npm test`
- `npm run lint`
- `npm run build`
- `npx playwright test accesibilidad/regenerar-codigos.spec.ts`
- los dos guiones de abajo, después de `npx supabase db reset`. **Coordinar con el verificador: la base
  la está usando.**

Cada mutante se aplica, se ejecuta la prueba indicada, se ve **rojo con el motivo dicho** y se revierte.

### R2-1 · Dos pasos en el banco (A-H1)

Lo comprueba `scripts/rls/13-cuentas.sql`.

**Estructura:**

- `to_regprocedure('public.regenerar_codigos_recuperacion(text)') is null`.
- `regenerar_codigos_recuperacion()` tiene 0 argumentos y `comprobar_contrasena_para_regenerar(text)`
  tiene 1.
- Las dos son `prosecdef`, con `proconfig` que contiene `search_path=""` y `provolatile = 'v'`.
- Ninguna tiene `exception when`.
- `p_contrasena` no aparece en `raise|format|jsonb_build_object|execute`.
- `prorettype = 'void'::regtype` en la comprobación.
- En la definición de la comprobación, `strpos(def, 'transaction_read_only')` y
  `strpos(def, 'pg_advisory_xact_lock')` van antes de `strpos(def, 'extensions.crypt(')`.
- Una sola aparición de `intentos_regenerar_codigos` como destino de escritura, y ningún
  `update public.intentos_regenerar_codigos`.
- `execute`: `authenticated` sí y `anon` no, en las dos.

**Comportamiento** (como PRO1 con 2FA reciente, dentro del banco):

1. La comprobación con la contraseña **mala** y con la **buena** devuelve lo mismo: una fila con
   `null`, y `pg_typeof` es `void`.
2. Mala: `intentos_fallidos` +1, `regeneraciones_autorizadas = 0`. El paso dos devuelve
   `contrasena_incorrecta`: ni lote nuevo ni aviso.
3. Buena: `intentos_fallidos = 0`, `regeneraciones_autorizadas = 1`, `autorizado_hasta > now()`. El
   paso dos devuelve `ok` con diez. **Un segundo paso dos** devuelve `contrasena_incorrecta`.
4. Buena tres veces: `regeneraciones_autorizadas = 2` (el tope).
5. Buena y luego mala: `regeneraciones_autorizadas = 0` y el paso dos da `contrasena_incorrecta`.
6. Buena; como `postgres`, `autorizado_hasta = now() - interval '1 second'`; el paso dos da
   `contrasena_incorrecta`. El banco es una sola transacción y `now()` no avanza, así que la caducidad
   se fuerza a mano.
7. Paso dos sin paso uno (solo cookies): `contrasena_incorrecta`, ni lote ni aviso. Es P-4.
8. Solo lectura: `savepoint s; set local transaction_read_only = on;` La comprobación con la buena y
   con la mala lanza **25006 con el mismo texto** «exige una transacción de escritura»
   (`assert_lanza_codigo_msg`). Después, `rollback to savepoint s;` y los contadores no cambian.
9. Cinco malas: bloqueo y un único aviso `regeneracion_codigos_bloqueada`. Una buena durante el
   bloqueo no cambia la fila (`regeneraciones_autorizadas` sigue a 0). El paso dos da `bloqueado` con
   la hora.
10. Las guardas: con aal1 y con el reto de hace diecisiete minutos, **las dos** funciones lanzan 42501
    con el fragmento de hoy.

**Mutantes:**

| Mutante | Cambio | Qué falla y por qué |
|---|---|---|
| M-A1a | el paso dos no resta | el punto 3 da `ok` en el segundo paso dos |
| M-A1b | sin `autorizado_hasta > now()` | el punto 6 da `ok` |
| M-A1c | la comprobación `returns boolean` y devuelve `v_ok` | la aserción `prorettype = void` falla, y el punto 1 da valores distintos |
| M-A1d | se quita la guarda de solo lectura | el punto 8 falla por el texto: el error pasa a ser el de Postgres, «cannot execute INSERT…» |
| M-A1e | en el acierto con el contador limpio se hace `return` sin escribir (el «solo si estaba sucio» de la ronda 1) | la aserción de una sola escritura falla, y el punto 3 da `regeneraciones_autorizadas = 0` |
| M-A1f | se deja también la firma `(text)` | falla `to_regprocedure(...) is null` |
| M-A1g | el fallo no pone a 0 la autorización | el punto 5 da `ok` |

### R2-2 · Oráculo por HTTP contra PostgREST (A-H1, de extremo a extremo)

Guion nuevo: `npx tsx scripts/t038-oraculo.mjs`. Escribe `tickets/T-038/oraculo-postgrest.json`.

**Fijación.** Confirma filas, con un UUID y un correo aleatorios por pasada, así que es repetible sin
`db reset`. Como en `t038-concurrencia.sql`, con psql como `postgres`:

- un usuario con la contraseña `clave-oraculo` (bf 4);
- un factor `verified` con `last_challenged_at = clock_timestamp()` (el índice es único y global).

**Token.** HS256 sin dependencias (`node:crypto`), con `JWT_SECRET` de `npx supabase status -o env`.

- Si no viene, se toma la clave `oct` de `PGRST_JWT_SECRET` del contenedor rest; el campo `k` va en
  base64url.
- Claims: `sub`, `role: 'authenticated'`, `aud: 'authenticated'`, `aal: 'aal2'`, `session_id`
  aleatorio, `iat` y `exp = iat + 600`.
- Cabeceras: `apikey: ANON_KEY` y `Authorization: Bearer …`.
- Las peticiones van a `${API_URL}/rest/v1/rpc/...`.

**Formas.** Por cada forma S se manda la comprobación con la contraseña mala y luego con la buena:

- S1 · POST normal.
- S2 · POST con `Accept: application/vnd.pgrst.object+json`.
- S3 · POST con `Prefer: tx=rollback`.
- S4 · POST con `Prefer: handling=strict, max-affected=0`.
- S5 · GET `?p_contrasena=…`.

**Aserciones:**

- **O1:** para cada forma, `(status, cuerpo)` de la mala **≡** `(status, cuerpo)` de la buena.
- **O2:** en S1, tras la mala, `intentos_fallidos` sube en 1 (leído por psql). En S3 también: prueba que
  `tx=rollback` se ignora; si un día no, el informe lo dice.
- **O3:** S5 da el mismo 4xx para las dos y ningún contador cambia.
- **O4:** `POST /rpc/regenerar_codigos_recuperacion` con `{"p_contrasena": "x"}` da 404 o `PGRST202`:
  la puerta de un paso ya no existe.
- **O5:** `POST /rpc/registro_postgres_seguro` da `true`. Es la integración real con el
  `statement_timeout` de PostgREST.
- **O6:**
  1. una comprobación buena en S1;
  2. después, `POST /rpc/regenerar_codigos_recuperacion` da `ok` con 10;
  3. una comprobación mala;
  4. después, el paso dos da `contrasena_incorrecta`.

Al final se suman las malas confirmadas, para no llegar a cinco: en S1, S3 y S4 cuentan como fallo si
confirman. Si la cuenta llega a cinco, el guion para y lo dice.

**Mutantes:**

| Mutante | Qué falla |
|---|---|
| M-A1c | O1 en S1 (`true` frente a `false`) |
| M-A1e | O1 en S5: la buena, con el contador limpio, no escribe y da 200; la mala da 4xx |
| Restaurar la función de un paso de la ronda 1 | O4, y O1 en S2 (200 frente a 406) |

### R2-3 · CA4 vuelto a medir (`npx tsx scripts/t038-concurrencia.mjs`, tras `db reset`)

**Pasada A, producción.**

1. Dos comprobaciones buenas confirmadas en serie para el perfil A, y se comprueba
   `regeneraciones_autorizadas = 2`.
2. Carrera de dos `regenerar_codigos_recuperacion()`.
3. Resultado esperado:
   - `espero` es cierto;
   - las dos devuelven `ok|10`;
   - **10 vigentes y 2 avisos**.

**Pasada B, medición.**

1. Copia `t038_regenerar_sin_candado()` de la nueva `regenerar_codigos_recuperacion()` sin
   `pg_advisory_xact_lock`.
2. Dos comprobaciones buenas para B y la carrera.
3. Se exige: **10 vigentes, 2 avisos y las dos `ok|10`.**
4. Se registra en el JSON como medición: «sin candado de consejo, el candado de fila del consumo
   serializa la regeneración».
   - Ya no se exige `≠ 10`: el contrato admite «una medición que refute la hipótesis».

**Pasada D, contraensayo en rojo.**

1. Copia `t038_activar_sin_candado()` de `generar_codigos_recuperacion()` sin el candado.
2. Carrera de dos activaciones sobre un perfil D nuevo sin lote: UUID fijo `…00000000000d`, en `fijar`.
3. Se exige: **vigentes ≠ 10** (predicción, 20) y dos avisos. En D no se exige `espero`.

**Pasada C:** como en la ronda 1.

**Mutantes:**

| Mutante | Qué falla |
|---|---|
| Se quita el candado de `generar_codigos_recuperacion()` | C, que deja de dar un 42501 y diez |
| El paso dos caduca el lote **antes** de consumir la autorización | B da 20 |
| Las copias siguen el patrón de la ronda 1 | la copia de D no sale: la fase lo comprueba y para |

### R2-4 · Reposición propia (A-H3), en el banco

- ADM con 2FA llama a `registrar_reposicion_totp(:ADM)`:
  - lanza 42501 con el fragmento «no puede reponer su propio TOTP»;
  - después no hay ninguna fila `TOTP_REPUESTO` nueva con `registro_id = :ADM` ni ningún aviso
    `totp_repuesto` nuevo para ADM.
- Gemela: ADM sobre PRO1 sigue funcionando (es la aserción existente de `:216`).
- Con `pg_temp.como('<uuid sin perfil>')`, la llamada sobre PRO1 lanza 42501.
- Y, como encadenado de Q3(B): tras el intento de reposición propia rechazado, la activación de ADM con
  lote vigente sigue lanzando 42501.

**Mutantes:**

| Mutante | Qué falla |
|---|---|
| Se quita la línea de la reposición propia | la primera aserción |
| Se vuelve a `<>` en la guarda de rol | la del uuid sin perfil |

### R2-5 · Registro de Postgres (A-H2, A-H4, A-H5, A-H6), en el banco

**Mapa base literal `t38_base`.** Son los valores de R2.0, con `statement_timeout = '8000'` y las tres
listas de precarga de la imagen. Debe cumplirse `evaluar_registro_postgres(t38_base)`.

Una negativa y una gemela por regla, todas como `postgres`. `||` sobrescribe y `-` quita una clave:

| Regla | Negativa (→ falso) | Gemela (→ cierto) |
|---|---|---|
| C1 | `{"log_statement":"all"}` | `{"log_statement":"mod"}` |
| C2 | `{"log_parameter_max_length_on_error":"64"}` | `"0"` |
| C3 | `{"log_min_duration_statement":"0"}`; `{"log_min_duration_statement":"7999"}` | `{"log_min_duration_statement":"0","log_parameter_max_length":"0"}`; `{"log_min_duration_statement":"8000"}` |
| C4 | `{"log_min_duration_sample":"0","log_statement_sample_rate":"0.1"}` | la misma con `log_statement_sample_rate` en `"0"` |
| C5 | `{"log_transaction_sample_rate":"0.01"}` | la misma con `"log_parameter_max_length":"0"` |
| C6 | tres negativas, una por cada `debug_print_*` en `on` | la base |
| C7 | `{"auto_explain.log_min_duration":"7999"}`; `{"statement_timeout":"0"}`; `{"statement_timeout":"20000"}` | la base (10000 frente a 8000); `{"auto_explain.log_min_duration":"0","auto_explain.log_parameter_max_length":"0"}`; `{"auto_explain.log_min_duration":"-1","statement_timeout":"0"}` |
| C8 | `{"pgaudit.log_parameter":"on","pgaudit.log":"function"}`; `{"pgaudit.log_parameter":"on","pgaudit.role":"auditor"}` | `{"pgaudit.log_parameter":"on"}`; `{"pgaudit.log":"all"}` |
| N0 | `t38_base - 'log_statement'`; `t38_base - 'statement_timeout'`; `t38_base \|\| '{"log_statement":null}'` | — |
| N1 | `t38_base - 'auto_explain.log_min_duration'`; `t38_base - 'pgaudit.log_parameter'` | quitar las dos claves de `auto_explain` **y** quitar `auto_explain` de `shared_preload_libraries` |

**En vivo, a través del envoltorio**, como PRO1 con 2FA:

- Antes de empezar, como `postgres`, se fija `statement_timeout` en la transacción con el valor de
  `pg_db_role_setting` de `authenticated`. Así se imita a PostgREST:

  ```
  select set_config('statement_timeout', split_part(c, '=', 2), true)
    from pg_db_role_setting s, unnest(s.setconfig) c
   where s.setrole = 'authenticated'::regrole and c like 'statement_timeout=%';
  ```

  Más una aserción de que existe ese ajuste.
- Al acabar el bloque se vuelve a `set local statement_timeout = 0`.

| Paso | Ajuste | Resultado |
|---|---|---|
| L0 | ninguno | cierto |
| L1 | `set local log_statement = 'all'` | falso |
| L2 | `log_parameter_max_length_on_error`, la aserción que ya existe | falso |
| L3 | `log_min_duration_statement = 0` | falso |
| L3, gemela | lo mismo más `log_parameter_max_length = 0` | cierto |
| L6 | `debug_print_plan = on` | falso |
| L7 | `auto_explain.log_min_duration = 0` | falso |
| L7, gemela | lo mismo más `auto_explain.log_parameter_max_length = 0` | cierto |
| L7b | `statement_timeout = 0` | falso (A-H6 en vivo) |

Se restaura cada ajuste después de su paso.

**Mutantes:**

- Borrar cualquiera de C1 a C8 hace fallar su negativa.
- Cambiar un `coalesce(…, true)` por `false` hace fallar la negativa del valor nulo.
- Quitar N0 o N1 hace fallar sus negativas.
- Volver a la ventana de la ronda 1 (`between 0 and 9999`) hace fallar las negativas de C7 con
  `statement_timeout` 0 y 20000, y L7b.

### R2-6 · Copias del contraensayo (A-H7)

En `scripts/t038-concurrencia.sql`, fase `copia`:

1. `drop function if exists` de las dos copias.
2. Creación.
3. `revoke execute … from public, anon; grant execute … to authenticated;`.
4. Una comprobación psql que **para** si `has_function_privilege('anon', <copia>, 'execute')`.

La limpieza sigue en `finally`.

Mutante: se quita el `revoke`. La fase para con «la copia es ejecutable por anon».

### R2-7 · Interfaz (B-H1 a B-H11)

Una prueba por hallazgo, cada una con su mutante: la tabla de R2.4. Todas en `npm test`, salvo la
parte de Playwright de B-H6.

## R2.4 · B-H1 a B-H11: arreglo en una línea, prueba y mutante

| # | Arreglo | Prueba que lo demuestra | Mutante que la pone en rojo |
|---|---|---|---|
| B-H1 | En `armazon-cliente.tsx`, el `<CajonContext.Provider value={cerrarCajon}>` pasa a envolver **el `<aside>` entero** (`:57-96`), y se quita el de `:91`. | `components/armazon/armazon-cliente.test.tsx`, nueva: monta el `ArmazonCliente` **real** con `identidad={<EnlaceCuenta nombre="Ana" rolVisible="Rol" />}`, las demás ranuras a `null` y `usePathname` simulado. Pulsa «Abrir menú» y espera **dos** botones `cerrarMenu` (velo y X). Pulsa el enlace «Mi cuenta…» y espera **uno** (el velo se fue). La prueba de `enlace-cuenta.test.tsx:41` se queda, pero no es la evidencia. | Provider otra vez solo en `navegacion`: quedan dos botones. |
| B-H2 | `formulario-regenerar.tsx`: `try { … } catch { reset({ contrasena: '', codigo: '' }); setVista({ tipo: 'fallo', mensaje: t('cuenta.errores.generico') }); } finally { setEnviando(false); }`. El `reset` del camino normal se queda donde está, porque en `finally` borraría los errores de `setError`. | Acción simulada con `mockRejectedValue`: aparece la región de fallo con el texto genérico y el foco dentro, el campo contraseña `toHaveValue('')`, y no hay rechazo sin tratar (Vitest falla la pasada si lo hay). | Sin `catch`: rechazo sin tratar, la contraseña se queda y no hay región. |
| B-H3 | `lista-avisos.tsx`: si `error`, `<p className="text-destructive text-sm">{t('cuenta.avisos.errorLectura')}</p>` y no la lista ni `vacio`. | Cliente simulado con `{ data: null, error: { code: 'X' } }`: aparece `errorLectura` y no aparece `vacio`. | `!avisos \|\| …` como hoy: sale «No hay avisos». |
| B-H4 | En `segundo-factor.test.tsx`, CA11 cuenta temporizadores **en la vista de fallo** (con `vi.useFakeTimers({ shouldAdvanceTime: true })`), antes del reintento y tras un reintento fallido, no solo tras el éxito. | `expect(vi.getTimerCount()).toBe(0)` en los dos puntos. | M2b: `useEffect` con `setTimeout(60000)` en la vista de fallo: cuenta 1. |
| B-H5 | Ningún cambio de código: las pruebas fijan la zona. | `acciones.test.ts`: organización con `Atlantic/Canary` y `bloqueadoHasta = '2026-10-03T10:00:00Z'`; el mensaje contiene «11:00» y no «12:00». `lista-avisos.test.tsx`: lo mismo con `creado_en`. | `zona = ZONA_POR_DEFECTO` forzado: sale 12:00. |
| B-H6 | Se sustituyen las aserciones de `innerHTML`/`content()` (`formulario-regenerar.test.tsx:140,153`, `regenerar-codigos.spec.ts:255`) por el valor. | Vitest: tras el éxito, «Ya los he guardado» y el campo contraseña `toHaveValue('')`; lo mismo tras error de campo y tras «Volver». Playwright: `await expect(page.getByLabel(<contraseña>)).toHaveValue('')` en los mismos tres puntos. | M1, sin `reset` en el éxito: el campo vuelve con la contraseña. |
| B-H7 | Ningún cambio de código. | `acciones.test.ts:181` y su gemela del error de la RPC: `expect(r.mensaje).toBe(t('cuenta.errores.registroInseguro'))`, y `regenerarCodigosRecuperacion` simulado `not.toHaveBeenCalled()`. | La acción devuelve `generico`: falla el `toBe`. |
| B-H8 | `acciones.ts:40`: `const { data: factores, error: errorFactores } = …; if (errorFactores) { console.error('[regenerarCodigos] listFactors', errorFactores.code); return { ...ESTADO_INICIAL, mensaje: t('cuenta.errores.generico') }; }`. | `listFactors` con error: `mensaje` es `generico`, no `sinFactor`, y `challengeAndVerify` no se llama. | Error descartado: sale `sinFactor`. |
| B-H9 | «Volver» hace `setVista({ tipo: 'formulario' }); setCampoConFoco({ campo: 'contrasena' });`: el efecto de `:49` ya lleva el foco. | Tras la vista de fallo, pulsar «Volver» deja `document.activeElement` en el campo contraseña. | Sin `setCampoConFoco`: el foco queda en `body`. |
| B-H10 | `segundo-factor.tsx:177`: el `role="status"` sigue montado y su texto es `{trabajando ? '' : falloCodigos}`. Al reintentar se vacía y al volver a fallar se rellena: hay cambio y se anuncia. | Reintento con `generarCodigos` diferido que falla con **el mismo** texto, `'No se pudieron generar los códigos de recuperación.'` (`totp.ts:53`): mientras está pendiente el `status` está vacío, y al resolver vuelve a tener el texto. Se quita `'OTRO-FALLO'`. | `{falloCodigos}` a secas: mientras está pendiente el `status` no está vacío. |
| B-H11 | `lista-avisos.tsx:63`: si `!aviso.leida_en`, una marca visible `<span className="text-xs font-medium">{t('cuenta.avisos.sinLeer')}</span>` junto a la etiqueta. Se queda también el grosor. | Con un leído y un no leído: «Sin leer» aparece una vez, dentro del `<li>` del no leído. | Sin la marca: no aparece. |

**Desvíos aceptados en la ronda 1, al cerrar:** la nota de despliegue de Q1 pasa de
`docs/bitacora/T-038.md` a `docs/state.md` §Hallazgos.

## R2.5 · Banco 13: cómo se reescribe lo de la ronda 1

- Cada `public.regenerar_codigos_recuperacion('X')` pasa a ser **dos sentencias** dentro del mismo
  bloque `como_con_2fa`:
  1. `select public.comprobar_contrasena_para_regenerar('X');`
  2. `… from public.regenerar_codigos_recuperacion()`
- Las guardas de CA2 (aal1 y reto antiguo) se comprueban **en las dos** funciones.
- CA2 bis (límite):
  - los cinco fallos son cinco comprobaciones malas;
  - el «bloqueado» lo devuelve el paso dos;
  - «intentos» se lee con `pg_temp.t38_intentos`;
  - se añade `pg_temp.t38_autorizadas(p uuid)` con la misma forma.
- CA2 ter (cuentas sin contraseña): la comprobación no autoriza; el paso dos da
  `contrasena_incorrecta`.
- CA6: las aserciones de estructura de R2-1 sustituyen a las de `:458-476`.
- El bloque Q1 (`:496-507`) se sustituye por R2-5.
- R2-4 va junto a la sección de `registrar_reposicion_totp` (`:207`).

## R2.6 · Riesgos de la ronda 2, por probabilidad

1. **Alta.** El implementador escribe la comprobación con dos ramas de escritura, «más legible». Lo
   cogen R2-1 (una sola escritura y M-A1e) y O1 en S5.
2. **Alta.** `db reset` y `npm run tipos` con el verificador usando la base. Se ordena desde fuera: el
   implementador no resetea hasta que el orquestador lo diga.
3. **Media.** `supabase status -o env` no trae `JWT_SECRET` con esta versión del CLI. El guion tiene la
   alternativa de la clave `oct` del contenedor (R2-2). Si las dos fallan, R2-2 pasa a manual con el
   token de una sesión real del navegador, y se anota.
4. **Media.** La autorización sobrante: una comprobación buena cuyo paso dos no llega deja hasta 60 s
   en los que quien tenga **solo** la sesión (aal2 reciente incluido) puede regenerar una vez.
   - Para eso hace falta la cookie robada justo en ese minuto.
   - El titular recibe el aviso `codigos_regenerados`.
   - Se dice, no se cierra (P2).
5. **Baja.** La diferencia de tiempo del aviso de bloqueo en el quinto fallo. No revela nada que el
   paso dos no diga ya, y el fallo se confirma.
6. **Baja.** Un `statement_timeout` distinto entre la llamada a `registro_postgres_seguro` y la
   comprobación. Las dos van por PostgREST con el mismo rol: harían falta dos configuraciones de rol
   distintas entre dos peticiones seguidas.

## R2.7 · Qué revisar (ronda 2)

- **Uniformidad del paso uno.**
  - Entre `crypt` y el final solo hay **una** sentencia de escritura con `case`, más el aviso
    condicionado a `v_bloqueo`.
  - No hay `return` dentro de ningún `if v_ok`.
  - No hay `raise` después de `crypt`.
  - El `least(…, 100)` está.
- **La guarda de solo lectura** va antes del candado y de `crypt`, y su texto es el que pide el banco.
- **El paso dos** no lee `auth.users` ni recibe nada. Consume con `> 0 and autorizado_hasta > now()`,
  **antes** de caducar el lote.
- **Ningún sitio vuelve a crear `regenerar_codigos_recuperacion(text)`**, ni en `tipos-bd.ts` ni en el
  TS (`rg "p_contrasena" lib app` solo da la comprobación).
- **`registrar_reposicion_totp`** es una copia fiel del cuerpo anterior más dos líneas. Compara con
  `diff` contra `20260830090000:498-525`.
- **`evaluar_registro_postgres`**:
  - no la ejecuta nadie más que su dueño;
  - cada condición lleva su `coalesce(…, true)`;
  - las listas de precarga se normalizan (ruta, comillas, espacios, mayúsculas);
  - `alcanzable` usa `st > 0 and st <= u`, y no `<`.
- **Las negativas del banco fallan por el motivo dicho**, no por un error de cast. Cada mapa de negativa
  es un `jsonb` válido.
- **Puertas laterales:**
  - `TRUNCATE` y `DELETE` sobre `intentos_regenerar_codigos`: sin grants, como en la ronda 1.
  - Un `null` en `p_contrasena`: `v_ok` falso, y cuenta como fallo.
  - Dos comprobaciones concurrentes: el candado y el `on conflict` las serializan.
  - Las dos copias del contraensayo, sin `execute` para `anon`.
- **Interfaz:** que la prueba de B-H1 monte `ArmazonCliente` de verdad, y que B-H6 mire `value` y no
  HTML.

## R2.8 · Territorio y delegable

**El territorio no cambia.** Todo lo de esta adenda cae dentro de lo que declara el contrato:

- la migración `*_regenerar_codigos_recuperacion.sql`, también para redefinir
  `registrar_reposicion_totp`;
- `scripts/rls/13-cuentas.sql`;
- `scripts/t038-*`, que incluye `t038-oraculo.mjs`;
- `lib/cuentas/**`;
- `lib/supabase/tipos-bd.ts`, solo por `npm run tipos`;
- `lib/i18n/es.ts`;
- `app/(app)/cuenta/**` y `app/primera-vez/**`;
- `components/armazon/**`, que incluye el test nuevo;
- `accesibilidad/**`;
- `docs/interfaz.md`.

Los JSON de evidencia van a `tickets/T-038/` como en la ronda 1. La memoria de cierre
(`docs/bitacora/T-038.md` y `docs/state.md`) es la de siempre.

**No se toca** `app/(app)/ajustes/**`: la pantalla de reposición ya excluye al propio perfil.

**Delegable: nada.** Lo de esta ronda es base, contraseña, foco o ARIA. La marca «Sin leer» es pintura,
pero son tres líneas y no merecen encargo.

## R2.9 · Preguntas para el propietario

**P1 · ¿Se da por cumplido P-4 con el protocolo de dos pasos?**

P-4 dice «la función que regenera exige la contraseña como parámetro y la coteja en Postgres». Con DR1:

- la contraseña la coteja en Postgres `comprobar_contrasena_para_regenerar`;
- la que regenera **no** la recibe: solo gasta una autorización que la otra deja confirmada.

La lectura literal, una sola función que coteja y devuelve los códigos, es justo la que deja el límite
de intentos sin efecto (A-H1). No hay forma de cumplirla al pie de la letra sin el oráculo.

- La puerta de PostgREST con solo las cookies sigue cerrada, porque sin autorización el paso dos no da
  nada.
- Sigue habiendo límite de intentos, y ahora se cuenta siempre.

**Recomendación: sí.** Sin esta confirmación no se implementa.

**P2 · Caducidad y tope de la autorización: 60 s y 2.**

60 s sobra para las dos llamadas seguidas de la acción y acota la ventana del riesgo 4. El tope 2 cubre
el doble envío y el CA4.

- Alternativa más estricta: atar la autorización al `session_id` del JWT. No protege contra la cookie
  robada, que es la misma sesión, así que no compensa.

**Recomendación: 60 s y 2.**

**P3 · El PIN (`desbloquear_historia`), en un ticket aparte, de riesgo alto, justo detrás de T-038 en la
cola de `supabase/`** (antes de T-040 B).

Es el mismo defecto que A-H1, pero sobre el tercer factor que protege la historia clínica. Con una
sesión aal2 robada, un PIN de seis dígitos cae por fuerza bruta.

No entra en T-038 por tres razones:

- su función vive en otras migraciones;
- su pantalla está fuera del alcance del contrato;
- meterlo duplicaría el tamaño de la ronda.

`canjear_codigo_recuperacion` va en el mismo ticket: el patrón es el mismo, aunque el impacto es menor
(40 bits).

**Recomendación: ticket aparte e inmediato**, con la nota de abajo para `docs/state.md` §Hallazgos.

> **Hallazgo ALTA (T-038 ronda 1, revisor A, fuera del diff) · `desbloquear_historia(p_pin)` y
> `canjear_codigo_recuperacion(p_codigo)` (`20260830090000:727` y `:606`).**
> - Las dos devuelven el fallo como motivo sin lanzar, y su contador solo persiste si la transacción
>   del llamante confirma.
> - Por PostgREST 16.1, el objeto singular con un filtro sobre la salida da 406 y deshace el intento
>   fallido: `Accept: application/vnd.pgrst.object+json` más `?desbloqueado=is.true`, o
>   `?canjeado=is.true`.
> - El límite de cinco fallos no existe. Un PIN de seis dígitos cae por fuerza bruta con una sesión aal2
>   robada.
> - Arreglo: el protocolo de dos pasos de T-038, ronda 2 (DR1 en `tickets/T-038/diseno.md`). Una
>   comprobación que confirma siempre con respuesta uniforme, y luego el paso que lee lo confirmado.
> - Ticket propio de riesgo alto. Territorio:
>   - `supabase/migrations/*_pin_y_canje_en_dos_pasos.sql`;
>   - `scripts/rls/**`;
>   - `lib/cuentas/candado.ts`, `lib/cuentas/totp.ts` (canje) y sus pruebas;
>   - las pantallas que los llaman.
> - Deducido del código de PostgREST, no medido por HTTP. Su oráculo se mide con un guion como
>   `t038-oraculo.mjs`.

**P4 · El umbral de `auto_explain` (DR7).**

- La regla literal de A-H6 deja la regeneración siempre en «inseguro» con los valores de fábrica de la
  imagen (umbral 10 s y parámetros sin límite).
- La regla de esta adenda la permite solo mientras el `statement_timeout` en vigor corte antes del
  umbral, y lo comprueba en cada llamada.
- La tercera vía sería que la migración fijase `alter role authenticated set
  auto_explain.log_parameter_max_length = 0`. `postgres` puede, medido en `rollback`. Pero:
  - no está medido que PostgREST lo aplique en cada transacción;
  - toca la configuración de registro de todo el rol.

**Recomendación: la regla de la adenda.**

## Lo que no entra, y por qué (ronda 2)

- **Arreglar `desbloquear_historia` y `canjear_codigo_recuperacion`:** P3, ticket aparte.
- **Exigir `aal2` en `registrar_reposicion_totp`:** ningún hallazgo lo pide. La acción de ajustes ya
  corre con sesión `aal2`. Se anota en `docs/state.md` si el revisor lo ve necesario.
- **Atar la autorización a la sesión:** P2. No protege contra la cookie robada.
- **Cambiar la configuración de registro de la instancia o de los roles:** es de despliegue, P4. La
  nota de Q1 sigue yendo a `state.md`.
- **`dblink` o transacciones autónomas:** DR1.
- **Bajar el coste del bcrypt de los códigos o tocar la activación:** ningún hallazgo lo pide.
- **Cambiar `app/(app)/ajustes/**`:** ya excluye al propio perfil.

## R2.10 · Respuestas del propietario (03-10-2026)

- **P1 → sí.** P-4 se da por cumplido con el protocolo de dos pasos (DR1).
- **P2 → 60 s y 2 usos.**
- **P3 → ticket aparte, de riesgo alto, inmediatamente después de T-038** en la cola de `supabase/`
  (antes de T-040 B). Lleva `desbloquear_historia` y `canjear_codigo_recuperacion`.
- **P4 → la regla de la adenda (DR7):** el umbral se compara con el `statement_timeout` en vigor en
  cada llamada.

## R4 · Ronda 4: solo B3-H1 (04-10-2026)

El propietario decide arreglar B3-H1 antes de integrar, y nada más (A3-H1 y A3-H2 quedan anotados en
`state.md`; A3-H2 lo cierra el documentalista en la bitácora). Base: la rama de la ronda 3,
`worktree-agent-a3f1df59a02f0397d` (b05d3e3).

**Cambio.** `lib/i18n/es.ts:287` (`cuenta.errores.resultadoDesconocido`) pide el reintento **sin
condición**. Texto:

> No hemos recibido respuesta y no sabemos si se han regenerado. Si se regeneraron, la lista que
> tienes en papel ya no vale y la nueva no se te ha enseñado. Vuelve a regenerarlos en cualquier
> caso: así tendrás una lista nueva que sí vale.

El aviso «Códigos de recuperación nuevos» deja de usarse como criterio: aparece para todo el que
activó desde T-038 (`20261008120000:530`), así que no discrimina.

**Prueba.** En `app/(app)/cuenta/formulario-regenerar.test.tsx`, el caso «B-H2 / B2-H4» comprueba la
instrucción, no las palabras:

- la descripción de la región contiene «Vuelve a regenerarlos en cualquier caso»;
- no contiene «si no aparece» ni ninguna otra condición sobre el aviso;
- sigue diciendo que la lista en papel puede haber dejado de valer (`/en papel[^.]*ya no val/`);
- se quita la aserción de «lista de avisos».

**Mutante.** Restaurar el texto de la ronda 3 deja la prueba en rojo.

**Criterio para el verificador (CA-R4).** La prueba pasa con el texto nuevo y falla con el mutante;
`npm test`, `npm run lint` y `npm run build` en verde en la rama. Nada fuera de `lib/i18n/es.ts` y
de ese fichero de prueba.
