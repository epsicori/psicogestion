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
