# T-042 · Diseño: el PIN y el canje en dos pasos

Contrato: `tickets/T-042-pin-y-canje-en-dos-pasos.md`. Se reutiliza el patrón de T-038 ronda 2: DR1
(dos pasos), DR2 (autorización con caducidad y tope) y DR3 (una sola escritura y guarda de solo
lectura antes de `crypt`), en `tickets/T-038/diseno.md` líneas 1098-1367. El propietario los aprobó
el 03-10-2026 (R2.10).

## 0 · Hechos verificados contra el código

### Las funciones de hoy

`desbloquear_historia(p_pin text)` tiene tres definiciones: `20260822160000:328`,
`20260829150000:173` y **la vigente**, `20260830090000_cuentas_invitacion_baja_totp.sql:727-832`.
Ninguna migración posterior la redefine (grep sobre `supabase/migrations/`; `20260915120000` solo la
nombra en un comentario).

- **Firma y atributos:**
  - devuelve `table(desbloqueado, motivo, caduca_en, bloqueado_hasta)`;
  - es `security definer`, con `search_path = ''`, y volátil por defecto.
- **Guarda:** solo `auth.uid()` nulo, que da 42501. No mira `rol_actual()` ni `aal`.
- **Orden del cuerpo:**
  1. `select … for update` sobre `pines_historia`;
  2. sin fila, devuelve `sin_pin`;
  3. con `bloqueado_hasta > now()`, devuelve `bloqueado` sin comparar;
  4. compara: `if extensions.crypt(p_pin, v_pin.hash) <> v_pin.hash then` (rama del fallo);
  5. el fallo suma 1, bloquea 15 min al llegar a 5, inserta `PIN_FALLIDO`, y con el bloqueo además
     `PIN_BLOQUEADO` y el aviso `pin_bloqueado`;
  6. el acierto pone el contador a 0, lee `minutos_desbloqueo_historia` (15 por defecto, check
     1..60), revoca los desbloqueos vigentes e inserta uno nuevo.
- **Rebloqueo.** Al caducar un bloqueo, el contador se queda en 5, así que el siguiente fallo vuelve a
  bloquear (`5+1 >= 5`). Es el comportamiento de hoy, y se conserva.

`canjear_codigo_recuperacion(p_codigo text)` está en `20260830090000:606-716`.

- **Firma y atributos:** devuelve `table(canjeado, motivo, bloqueado_hasta)`; es `volatile`,
  `security definer`, con `search_path = ''`.
- **Guardas:** `auth.uid()` nulo y `rol_actual()` nulo, las dos con 42501. **No** exige segundo
  factor, a propósito (comentario en `:624-628`).
- **Orden del cuerpo:**
  1. la centinela es la fila vigente más reciente (`order by creado_en desc, id desc limit 1 for
     update`); lleva el contador de todo el lote;
  2. sin centinela, devuelve `sin_codigos`; bloqueada, devuelve `bloqueado`;
  3. busca entre los vigentes con `extensions.crypt(p_codigo, c.codigo_hash) = c.codigo_hash` en un
     `where`;
  4. el fallo suma 1 en la centinela y bloquea 15 min al llegar a 5;
  5. el acierto pone `usado_en`, reinicia los vigentes y escribe `TOTP_REPUESTO`
     (`{'via':'codigo_recuperacion'}`) y el aviso `totp_repuesto`.

### El agujero del PIN nulo

**Medido el 03-10-2026** en `supabase_db_Psicogestion`, dentro de `begin … rollback`, con
`set local role authenticated` y el `sub` del usuario sembrado `11111111-1111-4111-8111-111111111111`:

| Llamada | Resultado |
|---|---|
| `select * from public.desbloquear_historia(null)` | `desbloqueado = t`, `motivo = ok`, con `caduca_en` |
| `select public.historia_desbloqueada()` | `t` |
| `select * from public.canjear_codigo_recuperacion(null)` | `sin_codigos` (ese usuario no tiene lote) |

`crypt` es estricta: `crypt(NULL, hash)` vale NULL, `NULL <> hash` vale NULL, y el `if` no entra en
la rama del fallo, así que la función acaba en la del acierto.

- El canje no tiene el defecto, porque su comparación va en un `where`.
- `grep "crypt(" supabase/migrations/*.sql` solo da la comparación `<>` en las tres definiciones de
  `desbloquear_historia` y el `where` del canje.

### Tablas

- **`pines_historia`** (`20260822094547:278-287`):
  - columnas: `perfil_id` (pk, fk a perfiles, cascade), `hash`,
    `intentos_fallidos smallint not null default 0 check (>= 0)`, `bloqueado_hasta`, `creado_en`,
    `actualizado_en`;
  - disparadores (leídos de `pg_trigger`): `pin_no_para_tecnico`, before insert or update, y
    `auditar_pines_historia`, after insert, update o delete, con `fn_auditar('perfil_id','hash')`.
- **`codigos_recuperacion_totp`** (`20260830090000:117-127`):
  - columnas: `id`, `perfil_id`, `codigo_hash`, `creado_en`, `usado_en`,
    `intentos_fallidos smallint check (>= 0)`, `bloqueado_hasta`;
  - disparador `auditar_codigos_recuperacion_totp`, con `fn_auditar('id','codigo_hash')`
    (`:172-174`).
- Los dos disparadores de auditoría se disparan en **cada** `update`, sea acierto o fallo.
- Ninguna de las dos tablas tiene grants salvo para `postgres` (`revoke all`, `20260830090000:160`).
- El lote se caduca con `usado_en = now()`:
  - en `registrar_reposicion_totp` (`:465`) y `generar_codigos_recuperacion` (`:577`);
  - en la regeneración de T-038 (rama `worktree-agent-ac39d19a23cb82596`,
    `20261008120000_regenerar_codigos_recuperacion.sql:406,496`).
- La regeneración y la activación de T-038 toman
  `pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || uid, 0))` (`:279,379,475`).
- `auditoria_operacion_check` ya admite `PIN_FALLIDO`, `PIN_BLOQUEADO` y `TOTP_REPUESTO`
  (`20260916120000:382-393`): no hace falta ningún verbo nuevo.

### PostgREST y la base

- PostgREST es la versión 16.1 (`/bin/postgrest --version` en el contenedor `rest`).
- `PGRST_DB_TX_END` no está fijado, así que vale `commit` y `Prefer: tx=rollback` se ignora.
- **El oráculo, simulado en SQL** (03-10-2026, `begin … rollback`):
  - `select count(*) from desbloquear_historia('000000') t where t.desbloqueado is true` da 0;
  - dentro de la transacción, `intentos_fallidos` sube a 1 y aparece una fila `PIN_FALLIDO`;
  - tras el `rollback`, `intentos_fallidos = 0`.
  - Es lo que hace PostgREST cuando responde 406 al objeto singular.
- Lo medido por HTTP en T-038 con el patrón DR1: una función `void` da 204 y cuerpo vacío con el
  secreto bueno y con el malo en S1, S2 y S3; S4 da el mismo 400 `PGRST128`, y el GET el mismo 405
  con 25006 (`tickets/T-038/oraculo-postgrest.json` en la rama de T-038).
- **Las funciones de hoy no se han medido por HTTP**, porque la base es compartida. Lo hace el
  verificador con `t042-oraculo.mjs` y con el mutante M-H1.
- La base cambia mientras se trabaja: el 03-10 tenía `max(version) = 20261008120000` (T-038
  aplicada) y el 04-10, `20261007120000` (el implementador de T-038 la reinició).

### Quién llama

**El PIN.**

- `lib/cuentas/candado.ts:58-75` (`desbloquearHistoria`) y `scripts/t012-nota.ts:147`, a través de
  `lib`.
- `app/(app)/candado/acciones.ts:19-44` (`abrirHistoria(datos: unknown)`):
  - valida con `esquemaPin` (`/^\d{6}$/`, `lib/cuentas/esquemas.ts:31`);
  - da un solo mensaje para `pin_incorrecto`, `sin_pin` y `error`.
- Desde la acción: `app/(app)/candado/formulario-candado.tsx` y
  `app/(app)/pacientes/[id]/formulario-pin-historia.tsx`.
- Imitan la acción: `formulario-candado.test.tsx`, `panel-historia.test.tsx` y
  `editor-de-nota.test.tsx`.
- De extremo a extremo: `accesibilidad/nota-clinica.spec.ts:27,98`.

**El canje.**

- `lib/cuentas/totp.ts:72-94` (`canjearCodigoRecuperacion`): con `ok` llama a `borrarFactoresTotp`
  (Admin API).
- `app/recuperar/acciones.ts` (`canjearCodigo(codigo: string)`): da un solo mensaje para
  `codigo_invalido`, `sin_codigos` y `error`.
- `app/recuperar/formulario-recuperar.tsx`, que redirige a `/primera-vez` con `ok`.
- **Ningún spec de Playwright canjea un código.**

**Los bancos.**

- 46 llamadas a `public.desbloquear_historia('…')`, todas con la forma
  `(select <col> from public.desbloquear_historia('<pin>'))`, en 02, 03, 04, 09, 12, 13, 14, 19, 20
  y 23.
- El canje: `13-cuentas.sql:282-348` en `main`, y además `:1169,1173` en la rama de T-038, todas con
  la forma `from public.canjear_codigo_recuperacion(…) \gset`.
- `scripts/test-rls.mjs` concatena `scripts/rls/*.sql` en orden alfabético, en una sola transacción.
- `00-ayudantes.sql` define en `pg_temp` `assert`, `assert_lanza`, `assert_lanza_codigo_msg`,
  `contar`, `como`, `como_con_2fa` y `dar_segundo_factor`.

**Lo demás.**

- `npm run lint:migraciones` (`scripts/lint-migraciones.ts:217-224`) marca `drop table`,
  `drop column`, `drop type` y `alter column … type`, pero no `drop function`. Hay precedentes:
  `20261007120000:1141,1465`.
- Las pantallas (`docs/interfaz.md`, «Pantalla de bloqueo» y «Lo que el prototipo no cubre») no dicen
  nada que dependa del número de llamadas. Las Server Actions no tienen que cambiar.

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql`

Va detrás de `20261008120000` (T-038). Ninguna rama usa `20261009*`.

Se aplican las reglas de `.claude/rules/supabase.md`:

- cada tabla del cuerpo lleva alias, porque las funciones `returns table` tienen parámetros de salida
  con el mismo nombre;
- `extensions.crypt`;
- ningún `exception when`.

**a) Columnas nuevas.**

```
alter table public.pines_historia
  add column desbloqueos_autorizados smallint not null default 0
    check (desbloqueos_autorizados between 0 and 2),
  add column autorizado_hasta timestamptz;

alter table public.codigos_recuperacion_totp
  add column canje_autorizado_id uuid,
  add column canje_autorizado_hasta timestamptz,
  add constraint codigos_recuperacion_totp_canje_autorizado_par
    check ((canje_autorizado_id is null) = (canje_autorizado_hasta is null));
```

- Sin clave ajena en `canje_autorizado_id`: el paso dos vuelve a buscar el código con
  `perfil_id = uid` y `usado_en is null`.
- Los grants no se tocan: las columnas heredan el `revoke all` de la tabla.
- Comentario en cada columna: «Autorización del paso uno (T-042). Solo la escriben
  `comprobar_*` y la consume el paso dos.»

**b) Las firmas viejas desaparecen.**

```
-- destructivo: la puerta de un paso es el oráculo de T-042; sus llamantes pasan a dos pasos en este ticket
drop function public.desbloquear_historia(text);
drop function public.canjear_codigo_recuperacion(text);
```

**c) `public.comprobar_pin_historia(p_pin text) returns void`.**

Es `language plpgsql volatile security definer set search_path = ''`. Las sentencias van en este
orden exacto:

1. `if v_uid is null then raise exception 'No hay sesión.' using errcode = '42501'; end if;`
2. `if current_setting('transaction_read_only') = 'on' then raise exception 'La comprobación del PIN
   exige una transacción de escritura.' using errcode = '25006'; end if;`
3. `select ph.hash, ph.bloqueado_hasta into v_hash, v_hasta from public.pines_historia ph where
   ph.perfil_id = v_uid for update;`
   - `if not found then return; end if;`
   - `if v_hasta > now() then return; end if;`
   - Ninguna de las dos escribe.
4. `v_ok := coalesce(extensions.crypt(p_pin, v_hash) = v_hash, false);`
   - **Con esto se cierra el PIN nulo**: NULL y `''` cuentan como fallo.
5. **Una sola escritura en `pines_historia`**, sin `if` alrededor:

   ```
   update public.pines_historia ph set
     intentos_fallidos = case when v_ok then 0 else least(ph.intentos_fallidos + 1, 100) end,
     bloqueado_hasta   = case when v_ok then null
                              when ph.intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
                              else null end,
     desbloqueos_autorizados = case when v_ok
                                    then least(case when ph.autorizado_hasta > now()
                                                    then ph.desbloqueos_autorizados else 0 end + 1, 2)
                                    else 0 end,
     autorizado_hasta  = case when v_ok then now() + interval '60 seconds' else null end,
     actualizado_en    = now()
   where ph.perfil_id = v_uid
   returning ph.intentos_fallidos, ph.bloqueado_hasta into v_intentos, v_bloqueo;
   ```

6. Tres sentencias **incondicionales**, que se ejecutan en las dos ramas y cuyo predicado decide si
   insertan una fila o ninguna:

   ```
   insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
   select v_uid, 'pines_historia', 'PIN_FALLIDO', v_uid::text,
          jsonb_build_object('intentos_fallidos', v_intentos)
   where not v_ok;

   insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
   select v_uid, 'pines_historia', 'PIN_BLOQUEADO', v_uid::text,
          jsonb_build_object('intentos_fallidos', v_intentos, 'bloqueado_hasta', v_bloqueo)
   where v_bloqueo is not null;

   insert into public.notificaciones (perfil_id, tipo, detalle)
   select v_uid, 'pin_bloqueado',
          'Tu PIN de historia clínica se ha bloqueado quince minutos por demasiados intentos fallidos.'
   where v_bloqueo is not null;
   ```

   Los textos y las claves del jsonb son los de `20260830090000:779-795`, sin cambios.
7. Fin, sin `return`.

Comentario: «Paso uno de dos (T-042). Coteja el PIN y deja confirmado el resultado: un intento
fallido o una autorización de 60 s (tope 2). No devuelve nada, tampoco distinto en el acierto: el
resultado solo se ve en `desbloquear_historia()`, en otra transacción. Un PIN nulo o vacío es un
fallo.»

**d) `public.desbloquear_historia()`, sin argumentos.**

Devuelve `table (desbloqueado boolean, motivo text, caduca_en timestamptz, bloqueado_hasta
timestamptz)`, la misma forma de hoy, y es `volatile security definer set search_path = ''`.

1. La guarda de sesión del punto (c)1.
2. `select ph.bloqueado_hasta into v_hasta from public.pines_historia ph where ph.perfil_id = v_uid
   for update;`
   - `if not found then return query select false, 'sin_pin'::text, null::timestamptz,
     null::timestamptz; return; end if;`
3. `if v_hasta > now() then return query select false, 'bloqueado'::text, null::timestamptz, v_hasta;
   return; end if;`
4. **Consumo:**
   - `update public.pines_historia ph set desbloqueos_autorizados = ph.desbloqueos_autorizados - 1,
     actualizado_en = now() where ph.perfil_id = v_uid and ph.desbloqueos_autorizados > 0 and
     ph.autorizado_hasta > now();`
   - `if not found then return query select false, 'pin_incorrecto'::text, null::timestamptz,
     null::timestamptz; return; end if;`
   - No toca `intentos_fallidos`: sin PIN no hay intento.
5. El cuerpo de `20260830090000:812-830` **sin cambios**: los minutos de `organizacion`, la revocación
   de los vigentes, el `insert` en `desbloqueos_historia` y `return query select true, 'ok'…`.

Comentario: «Paso dos de dos (T-042). No recibe el PIN: abre la ventana solo si
`comprobar_pin_historia` dejó una autorización vigente, y la gasta.»

**e) `public.comprobar_codigo_recuperacion(p_codigo text) returns void`.**

1. Las dos guardas de hoy, con los mismos textos y el 42501: `'No hay sesión.'` y `'El perfil no está
   activo.'`. **No** se exige segundo factor.
2. La guarda de solo lectura, con el texto «La comprobación del código exige una transacción de
   escritura.» (25006).
3. `perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));`
4. `select c.id, c.bloqueado_hasta into v_centinela, v_hasta from public.codigos_recuperacion_totp c
   where c.perfil_id = v_uid and c.usado_en is null order by c.creado_en desc, c.id desc limit 1 for
   update;`
   - `if not found then return; end if;`
   - `if v_hasta > now() then return; end if;`
5. `select c.id into v_acertada from public.codigos_recuperacion_totp c where c.perfil_id = v_uid and
   c.usado_en is null and extensions.crypt(p_codigo, c.codigo_hash) = c.codigo_hash limit 1;`
   - Después, `v_ok := v_acertada is not null;`
6. **Una sola escritura**, en la centinela:

   ```
   update public.codigos_recuperacion_totp c set
     intentos_fallidos = case when v_ok then 0 else least(c.intentos_fallidos + 1, 100) end,
     bloqueado_hasta   = case when v_ok then null
                              when c.intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
                              else null end,
     canje_autorizado_id    = case when v_ok then v_acertada end,
     canje_autorizado_hasta = case when v_ok then now() + interval '60 seconds' end
   where c.id = v_centinela;
   ```

7. Fin. El canje de hoy no avisa del bloqueo, y este paso tampoco.

**f) `public.canjear_codigo_recuperacion()`, sin argumentos.**

Devuelve `table (canjeado boolean, motivo text, bloqueado_hasta timestamptz)`, la misma forma de hoy.
**Es el canje.**

1. Las dos guardas del punto (e)1.
2. El mismo candado de consejo.
3. `select c.id, c.bloqueado_hasta, c.canje_autorizado_id into v_centinela, v_hasta, v_autorizado
   from … (la misma consulta de la centinela) for update;`
   - Sin fila: `sin_codigos`.
   - Con `v_hasta > now()`: `bloqueado`, con la hora.
4. **Consumo de la autorización:**
   - `update public.codigos_recuperacion_totp c set canje_autorizado_id = null,
     canje_autorizado_hasta = null where c.id = v_centinela and c.canje_autorizado_hasta > now();`
   - `if not found then return query select false, 'codigo_invalido'::text, null::timestamptz;
     return; end if;`
5. **El código autorizado tiene que seguir vigente:**
   - `update public.codigos_recuperacion_totp c set usado_en = now() where c.id = v_autorizado and
     c.perfil_id = v_uid and c.usado_en is null;`
   - `if not found then return query select false, 'codigo_invalido'::text, null::timestamptz;
     return; end if;`
6. El resto del acierto de hoy (`20260830090000:695-707`) sin cambios: reinicia los vigentes, escribe
   `TOTP_REPUESTO` con `via = codigo_recuperacion` y el aviso `totp_repuesto`, y devuelve
   `true, 'ok'`.

**g) Grants y comentarios de las cuatro.**

- `revoke execute on function … from public, anon; grant execute on function … to authenticated;`
- El comentario de `canjear_codigo_recuperacion()` mantiene el párrafo de hoy (con `ok`, `lib` borra
  el factor) y añade: «Paso dos de dos (T-042): no recibe el código.»

### 1.2 Tipos

`npm run tipos` tras el `db reset`, coordinado con el orquestador porque la base es compartida.

- El diff de `lib/supabase/tipos-bd.ts` toca solo `desbloquear_historia`, `canjear_codigo_recuperacion`
  y las dos `comprobar_*`.
- Las columnas nuevas no salen, porque las tablas no se exponen: si aparecen, hay que mirar por qué.

### 1.3 Bancos (`scripts/rls/`)

**a) Ayudantes en `00-ayudantes.sql`**, al final del fichero, con un comentario que diga «los dos
pasos de T-042, con la forma de la función vieja, para que las aserciones de T-003 a T-038 sigan
leyéndose igual»:

```
create or replace function pg_temp.desbloquear_historia(p_pin text)
returns table (desbloqueado boolean, motivo text, caduca_en timestamptz, bloqueado_hasta timestamptz)
language plpgsql as $$
begin
  perform public.comprobar_pin_historia(p_pin);
  return query select d.desbloqueado, d.motivo, d.caduca_en, d.bloqueado_hasta
                 from public.desbloquear_historia() d;
end $$;

create or replace function pg_temp.canjear_codigo_recuperacion(p_codigo text)
returns table (canjeado boolean, motivo text, bloqueado_hasta timestamptz)
language plpgsql as $$
begin
  perform public.comprobar_codigo_recuperacion(p_codigo);
  return query select c.canjeado, c.motivo, c.bloqueado_hasta
                 from public.canjear_codigo_recuperacion() c;
end $$;
```

Son `security invoker`, así que corren con el rol y el JWT de la sesión que fijó `como()`.

**b) El cambio mecánico, en los bancos 01 a 23:**

- `public.desbloquear_historia('` pasa a `pg_temp.desbloquear_historia('`;
- `public.canjear_codigo_recuperacion(` pasa a `pg_temp.canjear_codigo_recuperacion(`.

Comprobación: `grep -n "public\.desbloquear_historia(\|public\.canjear_codigo_recuperacion("
scripts/rls/0*.sql scripts/rls/1*.sql scripts/rls/2[0-3]*.sql` no da nada.

**No se cambia ninguna aserción.** Que las de `03-candado.sql` (cinco fallos, sexto con el PIN
correcto, quince minutos, cinco `PIN_FALLIDO` y un `PIN_BLOQUEADO`, nada del PIN en el jsonb) y las de
`13-cuentas.sql` (el canje) sigan en verde es la regresión del ADR-026 y del ADR-039.

**c) Banco nuevo `24-pin-y-canje-dos-pasos.sql`.**

Llama a las funciones `public.*` directamente, nunca a los ayudantes. Sus casos son los de §3: CA1,
CA2 a CA8 y el CA13 del banco.

- Usa los perfiles de `01-fijacion.sql`: PRO1 con el PIN `111111` y un profesional con lote propio
  generado con `como_con_2fa` y su `dar_segundo_factor`, con un desfase que no choque con los de 13.
- **Deja contadores, autorizaciones y desbloqueos como los encontró**, igual que hace `03-candado.sql`
  al final.
- El banco es una sola transacción y `now()` no avanza, así que la caducidad se fuerza a mano como
  `postgres`: `autorizado_hasta = now() - interval '1 second'`.

### 1.4 `lib/cuentas/`

**`candado.ts` · `desbloquearHistoria(sesion, pin)`.** La firma y `ResultadoDesbloqueo` no cambian.

1. `const { error: errorComprobacion } = await sesion.supabase.rpc('comprobar_pin_historia', { p_pin:
   pin });`
   - Si hay error: `console.error('desbloquearHistoria: comprobar_pin_historia()',
     errorComprobacion.code)` y `return { desbloqueado: false, motivo: 'error', caducaEn: null,
     bloqueadoHasta: null }`.
2. `const { data, error } = await sesion.supabase.rpc('desbloquear_historia');` y debajo la traducción
   de hoy.
   - El `console.error` pasa a registrar `error?.code`, no el objeto entero.

El comentario JSDoc dice «dos llamadas; el PIN solo en la primera».

**`totp.ts` · `canjearCodigoRecuperacion(sesion, codigo)`.** El mismo patrón:

1. `rpc('comprobar_codigo_recuperacion', { p_codigo: codigo })`. Si hay error, `motivo: 'error'` y no
   hay segunda llamada.
2. `rpc('canjear_codigo_recuperacion')`, sin argumentos.

`borrarFactoresTotp` sigue llamándose solo con `fila.motivo === 'ok'`. `ResultadoCanjeCodigo` no
cambia.

Ninguna de las dos lleva `{ get: true }`.

**Pruebas.**

- **`candado.test.ts`, nueva**, con el patrón `sesionFingida` de `totp.test.ts` de T-038:
  1. dos llamadas exactas, en orden: `['comprobar_pin_historia', { p_pin: PIN }]` y
     `['desbloquear_historia']`, esta con un solo elemento;
  2. si el paso uno falla, el resultado es `motivo: 'error'`, hay una sola llamada y el PIN no aparece
     en `console.error`;
  3. si el paso dos falla, `motivo: 'error'`;
  4. con `ok` se traducen `caducaEn` y `bloqueadoHasta`;
  5. con `pin_incorrecto` y con `bloqueado`, el motivo pasa tal cual.
- **`totp.test.ts`, casos nuevos:**
  1. dos llamadas exactas, en orden;
  2. con error en el paso uno no hay segunda llamada ni Admin API, y el código no aparece en
     `console.error`;
  3. con `ok`, se llama a `listFactors` y a `deleteFactor`, usando el `vi.mock` de
     `../supabase/administracion` que ya existe;
  4. con `codigo_invalido`, `bloqueado` y `sin_codigos` no se llama a la Admin API.

### 1.5 `scripts/t042-oraculo.mjs`

Es el oráculo más la concurrencia, con el esqueleto de `scripts/t038-oraculo.mjs`: `psql`, `entorno`,
token HS256 con plan B, `llamar`, `exigir` y `Parada`. Escribe `tickets/T-042/oraculo-postgrest.json`.

**Confirma filas**, con un UUID por pasada; es repetible sin `db reset`.

**Fijación, como `postgres`:**

- un usuario `profesional_sanitario` con el `centro_id` del perfil `1111…`, como en T-038;
- `insert into public.pines_historia (perfil_id, hash) values (UID, extensions.crypt('135790',
  extensions.gen_salt('bf', 4)))`;
- dos códigos, `ORACULO-UNO` y `ORACULO-DOS`, con `bf 4`.
- Esto es fijación y no el estado que se prueba: contadores y autorizaciones los construyen solo las
  funciones bajo prueba (regla de T-013a).

**Tokens:** `aal2` para el PIN y **`aal1` para el canje**, que es el atacante realista del canje:
alguien con la contraseña y sin el segundo factor.

**Entre bloques**, `psql` devuelve a 0 los contadores y las autorizaciones del usuario de la fijación,
para no llegar al bloqueo. `cuidarse()` para si alguno llega a 4.

**Formas**, para cada comprobación (`comprobar_pin_historia`, `comprobar_codigo_recuperacion`), con el
secreto malo y después el bueno:

- S1, POST;
- S2, `Accept: application/vnd.pgrst.object+json`;
- S3, `Prefer: tx=rollback`;
- S4, `Prefer: handling=strict, max-affected=0`;
- S5, GET `?p_pin=…` o `?p_codigo=…`.

**Aserciones:**

- **O1.** En cada forma y en cada función, `(estado, cuerpo)` del malo es igual al del bueno.
- **O2.** En S1 y S3, el malo confirma +1, leído con `psql` en `pines_historia.intentos_fallidos` o
  en la centinela, y el bueno deja la autorización.
- **O3.** S5 da el mismo 4xx y no cambia ningún contador.
- **O4.** Las firmas viejas ya no existen:
  - `POST /rpc/desbloquear_historia` con `{"p_pin":"x"}`
  - y `POST /rpc/canjear_codigo_recuperacion` con `{"p_codigo":"x"}`
  - dan 404 o `PGRST202`.
- **O5.** De extremo a extremo:
  - bueno y después `POST /rpc/desbloquear_historia` con `{}` da `ok` con `caduca_en`;
  - malo y después el paso dos da `pin_incorrecto`;
  - lo mismo para el canje: `ok` y el código usado, o `codigo_invalido`.
- **O6. El ataque de R2.9 ya no deshace nada.**
  - Tras un malo en S1, el paso dos con `Accept: …object+json` y `?desbloqueado=is.true` da 406.
  - `intentos_fallidos` sigue con el +1 del paso uno.
  - Igual para el canje, con `?canjeado=is.true`.
- **O7. El PIN nulo.** `POST /rpc/comprobar_pin_historia` con `{"p_pin": null}` y después el paso
  dos:
  - da `pin_incorrecto`;
  - suma +1;
  - `desbloqueos_historia` no gana ninguna fila vigente para el usuario.

**Concurrencia:**

- **C1.** Tres `comprobar_pin_historia` con el malo, a la vez (`Promise.all`), suben el contador
  exactamente +3.
- **C2.** Dos `comprobar_pin_historia` con el bueno y luego dos pasos dos a la vez:
  - los dos dan `ok`;
  - quedan 0 autorizaciones;
  - queda exactamente un desbloqueo vigente (`revocado_en is null and caduca_en > now()`).
- **C3.** Un `comprobar_codigo_recuperacion` con el bueno y luego dos `canjear_codigo_recuperacion` a
  la vez:
  - exactamente un `ok` y un `codigo_invalido`;
  - un código con `usado_en`;
  - una fila `TOTP_REPUESTO` para el usuario.

### 1.6 `accesibilidad/recuperar.spec.ts`

Es el canje real, a través de la Server Action.

**Fijación** como en `codigos-recuperacion.spec.ts` (`crearUsuario` con `auth.identities`):

- un factor TOTP `verified`, insertado por `psql` como en el oráculo;
- dos códigos con `bf 4`.

**Caso A, código bueno:**

1. `/login` con la contraseña, que deja la sesión en `aal1`;
2. `goto('/recuperar')`;
3. `getByLabel('Código de recuperación')` y «Usar el código».
4. Se exige:
   - la URL `/primera-vez`;
   - `select count(*) from auth.mfa_factors where user_id = …` da 0;
   - el código tiene `usado_en`;
   - hay una fila `TOTP_REPUESTO`.

**Caso B, código malo:**

- se ve el `role="status"` con «Ese código no es válido.»;
- la centinela tiene `intentos_fallidos = 1` (prueba que el paso uno confirma por la vía real).

Se ejecuta con `--workers=1` (hallazgo de `state.md` sobre los 6 workers).

## 2 · Decisiones y alternativas descartadas

**D1 · Dos pasos para los dos (DR1 de T-038).** El paso uno coteja y confirma siempre, y no devuelve
nada. El paso dos lee lo confirmado. Se descarta lo mismo que en T-038 R2.2:

- `dblink`;
- no exponer la RPC;
- solo `volatile` más la guarda de solo lectura;
- fiarse de `db-tx-end`.

**D2 · La autorización del PIN es un contador de 60 s con tope 2, en columnas de `pines_historia`.**
Es la respuesta P2 de T-038, aplicada igual (pregunta P1).

- La fila existe siempre que existe un PIN, así que no hace falta `insert … on conflict` ni una tabla
  nueva con su RLS, su `revoke` y su disparador.
- El tope 2 hace que un doble envío del formulario abra dos veces en vez de dar un «PIN incorrecto»
  falso.
- *Descartada una tabla aparte* (como `intentos_regenerar_codigos`): duplica una fila que ya existe.

**D3 · En el paso uno del PIN, después de `crypt` no hay ningún `if`.** La auditoría y el aviso son
`insert … select … where <predicado>`.

- La regla se comprueba con un patrón en el banco (CA8), sin leer el cuerpo para razonar ramas.
- *Descartado `if not v_ok then insert …`*, como hizo T-038 en su paso 7: hoy sería correcto, pero
  deja una rama en la que alguien añadirá mañana un `raise` o un `return`.

**D4 · El PIN nulo es un fallo (`coalesce(… = …, false)`), no un error.**

- Cuenta como un intento más y bloquea igual.
- *Descartado lanzar 22004 con NULL*: no revelaría el PIN, pero sería una segunda forma de respuesta
  que el banco tendría que cubrir aparte.

**D5 · La autorización del canje vive en la centinela y apunta a un código (`canje_autorizado_id`),
con tope 1.** El contador sigue siendo por lote (pregunta P2).

- *Descartado un contador sin código*: el paso dos tendría que volver a recibir el código y
  compararlo, que es el oráculo otra vez, o canjear «uno cualquiera».
- *Descartada una tabla por perfil* (`intentos_canje_codigos`):
  - cambia la semántica, porque el bloqueo dejaría de reiniciarse con un lote nuevo;
  - añade tabla, RLS, `revoke` y auditoría;
  - el reinicio por lote no se puede explotar: generar o regenerar exige contraseña y segundo factor
    reciente, justo lo que no tiene quien prueba códigos.

**D6 · El paso dos del canje es el canje.** Es la pregunta del encargo.

- No compara nada: lee la autorización ya confirmada y vuelve a comprobar que el código autorizado
  siga vigente.
- Si el cliente lo deshace con el 406, lo único que recupera es una autorización atada a un código,
  que caduca en 60 s y no cuenta intentos.
- Lo que el paso dos **no puede** hacer nunca es recibir el código: con eso volvería el oráculo.
- Llamado a mano por PostgREST, canjea pero no borra el factor (eso lo hace la Admin API en `lib`).
  Es igual que hoy.

**D7 · Se borran las firmas viejas.**

- *Descartado dejar `desbloquear_historia(text)` como envoltorio de los dos pasos* «por
  compatibilidad»: sería la puerta de un paso otra vez, porque compararía y devolvería en la misma
  transacción.

**D8 · Los bancos se adaptan con ayudantes `pg_temp` del mismo nombre y un cambio mecánico de las
llamadas.**

- Las 46 llamadas y las aserciones de T-003 a T-038 quedan intactas y sirven de regresión.
- *Descartado reescribir cada llamada en dos sentencias*: unas 50 ediciones a mano, cada una con su
  oportunidad de error.

**D9 · Los dos pasos viven en `lib/cuentas/`. Las Server Actions y las pantallas no se tocan.**

- Su contrato (entrada, salida y mensajes) no cambia.
- Lo que el ADR-026 pide de la pantalla (no contar intentos y un mismo mensaje para `sin_pin`,
  `pin_incorrecto` y `error`) ya está en `abrirHistoria`.

**D10 · El PIN se serializa con el candado de fila (`for update`), sin candado de consejo.**

- T-038 lo necesitaba porque su fila podía no existir.
- Aquí, sin fila no hay nada que contar.
- El canje sí toma el candado de consejo: comparte clave con la activación y la regeneración, y eso
  define bien qué pasa si se genera un lote entre los dos pasos.

**D11 · No se pone `registro_postgres_seguro()` delante del PIN.**

- El ADR-026 ya lo cubre: el PIN es un parámetro ligado y en producción no se registran sentencias.
- Además, bloquearía el candado cuando el registro no sea seguro, y eso es una decisión de producto.

## 3 · Cómo se cierra cada criterio de aceptación

**Comandos:**

- `npm run test:rls`
- `npm test`
- `npm run lint`
- `npm run lint:migraciones`
- `npm run build`
- `npx tsx scripts/t042-oraculo.mjs`
- `npx playwright test accesibilidad/nota-clinica.spec.ts accesibilidad/recuperar.spec.ts --workers=1`
  (con `SEGUNDO_FACTOR_AUTOMATICO_LOCAL=activo` para `nota-clinica`, según `state.md`)

El `db reset`, el oráculo y el spec **confirman filas**: se coordinan con el orquestador.

Cada mutante se aplica, se ejecuta la prueba indicada, se ve rojo con el motivo dicho y se revierte. Se
registra en `tickets/T-042/mutantes.json`.

- Los mutantes de SQL se aplican editando la migración y con `db reset`.
- Los de HTTP (M-H*) se aplican con `create or replace` por `psql` sobre la base levantada, y al
  terminar se hace `db reset`.

| CA | Comprobación | Mutante, y qué falla y por qué |
|---|---|---|
| 1 | En el banco 24: `to_regprocedure(… (text))` es nulo en las dos; `pronargs` es 0 en los pasos dos y 1 en las comprobaciones; `prorettype = 'void'::regtype`; `prosecdef`; `proconfig` contiene `search_path=""`; `provolatile = 'v'`; `has_function_privilege('authenticated', …, 'execute')` sí y `anon` no | **M1**: se deja también `desbloquear_historia(text)`. Falla `to_regprocedure … is null` |
| 2 | En el banco 24, como PRO1: `comprobar_pin_historia(null)`, después el paso dos da `pin_incorrecto`, `intentos_fallidos` +1, +1 `PIN_FALLIDO` y `historia_desbloqueada()` es falsa. Lo mismo con `''`. Cinco nulos dan `bloqueado`. Por HTTP, O7 | **M2**: `v_ok := extensions.crypt(p_pin, v_hash) = v_hash` sin `coalesce`. El `update` con `case when NULL` va a la rama del fallo, pero `where not v_ok` no inserta: falta el `PIN_FALLIDO` y la aserción de la auditoría falla. **M-H3**: la función vieja de un paso, recreada. O4 y O7 fallan (`ok`) |
| 3 | En el banco 24, según R2-1 de T-038, puntos 1 a 7, adaptado: (1) bueno y malo dan una fila nula de tipo `void`; (2) el malo da +1, autorizaciones 0 y `pin_incorrecto`, sin fila nueva en `desbloqueos_historia`; (3) el bueno da intentos 0, autorizaciones 1, `autorizado_hasta > now()`, el paso dos `ok` y abre, y el segundo paso dos `pin_incorrecto`; (4) tres buenos dan 2; (5) bueno y malo dan 0 y `pin_incorrecto`; (6) con la caducidad forzada, `pin_incorrecto`; (7) sin paso uno, `pin_incorrecto` | **M3**: el paso dos no resta. (3) da `ok` dos veces. **M4**: sin `autorizado_hasta > now()`. (6) da `ok`. **M5**: el fallo no pone las autorizaciones a 0. (5) da `ok`. **M6**: la comprobación `returns boolean`. Fallan CA1 (void) y (1) |
| 4 | En el banco 03, sin cambios, a través del ayudante. En el banco 24: el bueno durante el bloqueo deja la fila igual (intentos 5, autorizaciones 0), un solo aviso `pin_bloqueado` tras cinco fallos y ninguna clave `hash` ni el PIN en el jsonb | **M7**: el `PIN_BLOQUEADO` con `where not v_ok` en vez de `v_bloqueo is not null`. 03 da 5 en vez de 1. **M8**: se quita `if v_hasta > now() then return`. El bueno durante el bloqueo autoriza |
| 5 | En el banco 24, con un lote recién generado: bueno y malo dan lo mismo; el malo da +1 en la centinela, `canje_autorizado_id` nulo y `codigo_invalido`; el bueno deja `canje_autorizado_id` igual al id de ese código, el paso dos `ok`, `usado_en`, `TOTP_REPUESTO` y el aviso, y el segundo paso dos `codigo_invalido`; bueno y luego malo dan `codigo_invalido` y el código sin usar; bueno, después `generar_codigos_recuperacion()` (con 2FA) y después el paso dos dan `codigo_invalido`; la caducidad forzada y la falta de paso uno dan `codigo_invalido` | **M9**: el fallo no limpia `canje_autorizado_*`. «Bueno y luego malo» da `ok`. **M10**: el paso dos no exige `usado_en is null` en el código autorizado. «Lote nuevo entre pasos» da `ok`. **M11**: se consume sin `> now()`. La caducidad da `ok` |
| 6 | El banco 13 sin cambios, a través del ayudante. En el banco 24: cinco fallos y el bueno durante el bloqueo sin efecto; `como()` **sin** 2FA basta para las dos funciones; sin sesión o con el perfil en baja, `assert_lanza_codigo_msg` con 42501 en las dos | **M12**: se añade `segundo_factor_verificado_recientemente()` al paso uno del canje. La aserción «sin 2FA basta» falla con 42501 |
| 7 | En el banco 24: `savepoint`, `set local transaction_read_only = on`, y las dos comprobaciones con el bueno y con el malo lanzan 25006 con el texto propio de cada una (`assert_lanza_codigo_msg`); después `rollback to savepoint` y los contadores no cambian | **M13**: se quita la guarda de solo lectura del PIN. El texto pasa a ser el de Postgres («cannot execute SELECT FOR UPDATE in a read-only transaction») y la aserción del fragmento falla |
| 8 | En el banco 24, sobre `pg_get_functiondef` de las dos comprobaciones: `strpos('transaction_read_only')` menor que la posición del `for update` o de `pg_advisory_xact_lock`, y esta menor que `strpos('extensions.crypt(')`; el texto desde `extensions.crypt(` no casa con `'\m(if|return|raise)\M'`; una sola aparición de `update public.pines_historia` o de `update public.codigos_recuperacion_totp` en la comprobación; `p_pin` o `p_codigo` no aparecen cerca de `raise`, `format`, `jsonb_build_object` ni `execute`; ninguna lleva `exception when` | **M14**: el `PIN_FALLIDO` dentro de `if not v_ok then … end if`. El patrón `\mif\M` casa. **M15**: se reordena y la guarda de solo lectura va después de `crypt`. Falla la aserción de orden |
| 9 | `t042-oraculo.mjs` sale con 0; el JSON lleva O1 a O7 | **M-H1**: se recrea la función vieja `desbloquear_historia(text)` junto a las nuevas. O4 falla. **M-H2**: `comprobar_pin_historia` devuelve `boolean` (`v_ok`). O1 en S1 da `true` frente a `false` |
| 10 | C1 a C3 en el mismo guion | **M-H4**: se quita el `for update` del paso uno del PIN. C1 da menos de +3 (puede necesitar varias pasadas; si no sale en 5, se anota como no observado y M3 cubre el consumo) |
| 11 | `candado.test.ts` | **M16**: `desbloquearHistoria` llama al paso dos aunque el paso uno falle. Falla «una sola llamada». **M17**: el paso uno con `{ get: true }`. Falla la igualdad exacta de `rpc.mock.calls[0]` |
| 12 | Los casos nuevos de `totp.test.ts` | **M18**: el paso dos recibe `{ p_codigo }`. Falla `rpc.mock.calls[1]` de un solo elemento. **M19**: se llama a `borrarFactoresTotp` también con `codigo_invalido`. Falla «sin Admin API» |
| 13 | `git diff main --stat -- app/ components/` vacío; `nota-clinica.spec.ts` en verde | Sin mutante propio: es el control de que el contrato de la acción no cambió |
| 14 | `recuperar.spec.ts` en verde, casos A y B | **M20**: `canjearCodigoRecuperacion` se salta el paso uno. El caso A da «Ese código no es válido.» y el B ve `intentos_fallidos = 0` |
| 15 | Salidas de los comandos en `evidencia.json`; diff de `tipos-bd.ts` limitado a las cuatro funciones | — |

## 4 · Riesgos, por probabilidad

1. **Media-alta.** La base es compartida con el implementador de T-038 y con sus `db reset`.
   - Ya ha pasado: entre el 03 y el 04-10 la base volvió de `20261008120000` a `20261007120000`.
   - Este ticket no puede empezar hasta que T-038 esté en `main`.
   - El `db reset`, `npm run tipos`, el oráculo y los specs, en una ventana pedida al orquestador.
2. **Media.** El cambio mecánico deja alguna llamada a la puerta de un paso, por ejemplo en un
   comentario con otra forma o en el 13 de T-038 con `\gset`.
   - La migración borra la firma vieja, así que la llamada que quede rompe el banco con 42883: falla
     ruidoso.
   - Además está el `grep` de §1.3 b.
3. **Media.** `recuperar.spec.ts` es frágil por el login y la guardia del Proxy en `aal1`.
   - Se ejecuta con `--workers=1`.
   - Si el Proxy no deja llegar a `/recuperar` con un factor `verified` y `aal1`, eso es un hallazgo
     del producto: se para y se pregunta.
4. **Baja.** Un doble envío en `/recuperar`:
   - el segundo envío canjea un código ya usado, cuenta un fallo y enseña «no válido», mientras el
     primero ya redirigió;
   - el botón se desactiva con `useTransition`, así que no hay pérdida.
5. **Baja.** `fijar_pin_historia` no limpia la autorización pendiente.
   - Durante 60 s tras cambiar el PIN, una autorización conseguida con el PIN viejo, por el mismo
     titular, todavía abre.
   - Se acepta: hace falta haber acertado el PIN viejo hace menos de un minuto.
6. **Baja.** Los tiempos de respuesta:
   - el camino sin fila o bloqueado no ejecuta bcrypt, pero lo que revela (el bloqueo) ya lo dice el
     paso dos;
   - entre acierto y fallo solo cambia insertar una fila o ninguna, que es despreciable frente a
     bcrypt.
7. **Baja.** El PIN nulo queda expuesto hasta que esto entre, si hay alguna instancia con datos
   reales. Es la pregunta P3.

## 5 · Qué revisar

**El secreto y sus formas.**

- Qué puede elegir el llamante en cada función, y qué efecto tiene:
  - en las comprobaciones, solo `p_pin` o `p_codigo`: NULL, `''`, 1 MB de texto (bcrypt usa 72
    bytes) o un valor correcto;
  - en los pasos dos, nada.
- Comprobar que **ningún** valor hace que la respuesta del paso uno difiera entre secreto bueno y
  malo, ni que deje de confirmarse el fallo.
- **Ningún `if` con una comparación que pueda valer NULL decide un acierto.** Es la lección de este
  ticket.
  - Hay que revisar cada `if` de las cuatro funciones: `v_hasta > now()` solo puede *saltarse* una
    rama de rechazo temprano y nunca conceder.
  - El consumo va por `update … where … > now()` más `found`, que no se puede engañar con NULL.
- El paso dos **no recibe** ningún parámetro: `pronargs = 0`. Si alguien añade uno «por
  comodidad», vuelve el oráculo.

**La estructura del paso uno.**

- Hay una sola escritura en la tabla del contador.
- Después de `crypt` no hay ningún `if`, `return` ni `raise`.
- La guarda de solo lectura va antes del candado y de `crypt`.
- El `least(…, 100)` evita el desbordamiento de `smallint` en la rama del fallo, porque un error solo
  en esa rama es otro oráculo.
- El `check (between 0 and 2)` no puede saltar en la rama del acierto, porque está el `least(…, 2)`.

**Lo que se podría saltar por otra puerta.**

- *Firma vieja*: el CA1 y O4.
- *Llamar al paso dos sin paso uno*: `pin_incorrecto` o `codigo_invalido`.
- *Concurrencia*:
  - el `for update` del PIN y el candado de consejo más el `for update` del canje;
  - C1 a C3.
- *Lote nuevo entre pasos*: M10.
- *Reposición por el administrador entre pasos*: caduca el lote, así que también da
  `codigo_invalido` por el `usado_en is null`.
- *Tablas*: siguen sin ningún grant; las columnas nuevas no abren nada.
  - Comprobar con `\dp public.pines_historia` y `\dp public.codigos_recuperacion_totp`.
  - Sin `TRUNCATE` ni `UPDATE` para `authenticated`.
- *El técnico*: no tiene fila de PIN.
  - Con eso, el paso uno no hace nada y el paso dos da `sin_pin`.
  - `pin_no_para_tecnico` sigue impidiendo que exista esa fila.

**Lo que no debe cambiar.**

- Las aserciones de `03-candado.sql` y de `13-cuentas.sql`: ni una tocada, solo el prefijo de la
  llamada.
- `git diff` de esos ficheros = solo `public.` cambiado por `pg_temp.`.
- Los textos de la auditoría y del aviso.
- El reinicio de los vigentes en el canje.
- `app/**` y `components/**`, sin diff.

**En `lib/`.**

- El secreto solo va en la primera llamada.
- Los `console.error` registran `.code`, no el objeto ni los argumentos.
- No hay `{ get: true }`.
- La Admin API solo se llama con `ok`.

**Las pruebas que tienen que fallar y por qué.**

- Las de M2 y M-H3: el PIN nulo abre.
- Las de M10: el lote nuevo entre pasos se canjea.
- Si alguna sale verde con el mutante aplicado, la prueba no prueba.

## 6 · Territorio

Es el del contrato:

- `supabase/migrations/*_pin_y_canje_en_dos_pasos.sql`
- `scripts/rls/**`
- `scripts/t042-*`
- `lib/cuentas/candado.ts` y `lib/cuentas/candado.test.ts`
- `lib/cuentas/totp.ts` y `lib/cuentas/totp.test.ts`
- `lib/supabase/tipos-bd.ts`, solo regenerado
- `accesibilidad/recuperar.spec.ts`
- `docs/bitacora/T-042.md`
- `docs/state.md`

Queda fuera, a propósito, `app/**` y `components/**`: las acciones no cambian (D9). Tocarlas es un
síntoma de que algo del diseño falla, y hay que parar.

## 7 · Delegable

Nada. El cambio mecánico de §1.3 b es una línea de `sed`, y no merece encargo. Todo lo demás es
contador, candado, secreto o la Admin API. `delegable: no`.

## 8 · Preguntas para el propietario

**P1 · ¿La autorización del PIN dura 60 s, con un tope de 2, como la de la regeneración?**

- 60 s sobran para las dos llamadas seguidas de `lib`.
- El tope 2 evita un «PIN incorrecto» falso en un doble envío.
- Con tope 1, el segundo envío de un doble clic diría «PIN incorrecto» aunque la historia ya esté
  abierta.

**Recomendación: 60 s y 2.** Para el canje, el tope es 1 por naturaleza: la autorización apunta a un
código concreto, que es de un solo uso.

**P2 · ¿El contador de intentos del canje sigue siendo por lote (en la fila centinela, como hoy)?**

- Un lote nuevo reinicia el contador, pero generarlo exige contraseña **y** segundo factor reciente:
  justo lo que no tiene quien prueba códigos.
- Pasarlo a una tabla por perfil añade una tabla con su RLS, su `revoke` y su auditoría, y cambia la
  semántica sin cerrar nada.

**Recomendación: por lote, como hoy.**

**P3 · El PIN nulo abre la historia sin PIN, medido.**

- Basta un `POST /rpc/desbloquear_historia` con `{"p_pin": null}` y la sesión del navegador.
- Es el atacante del ADR-026: alguien ante una sesión abierta.
- Hay dos caminos:
  - (a) arreglarlo con T-042, que es el siguiente de la cola de `supabase/` cuando cierre T-038;
  - (b) un arreglo inmediato de una línea (`coalesce`) en una migración propia, que recrea
    `desbloquear_historia(text)` con el cuerpo de hoy, antes de que cierre T-038.

**Recomendación: (a) si no hay ninguna instancia con datos reales**, y `state.md` dice que no existe
manual de despliegue. **(b), hoy mismo, si la hay.** En los dos casos, la línea del hallazgo «PIN y
canje» de `state.md` debe decir ya «y el PIN nulo abre».

## Lo que no entra, y por qué

- **Validar con Zod en el servidor la entrada de `canjearCodigo(codigo: string)`**
  (`app/recuperar/acciones.ts`), que incumple la convención «mismo esquema en cliente y servidor».
  - No es parte del hallazgo, y la base ya trata cualquier texto como un intento.
  - Se anota en `state.md` como hallazgo de riesgo bajo.
- **`scripts/t002-rls.sql` y `scripts/t004-auditoria.sql`**: llaman a la firma vieja.
  - Son guiones históricos que no ejecuta ningún `npm run`.
  - Quedan rotos, y se dice en su bitácora y en `state.md`, no aquí.
- **Que `fijar_pin_historia` limpie la autorización pendiente**: riesgo 5. Habría que recrear otra
  función entera por una ventana de 60 s del propio titular.
- **Avisar al titular cuando se bloquea el canje**: hoy no avisa. Cambiarlo es producto, no este
  defecto.
- **`registro_postgres_seguro()` delante del PIN**: D11.
- **Exigir `aal2` o `rol_actual()` en las funciones del PIN**: no lo pide ningún hallazgo, y el PIN
  sin fila ya se resuelve como `sin_pin`.
- **Bajar el coste de bcrypt o limitar la CPU del canje** (hasta diez `crypt` por intento): ya era
  así. El límite de intentos, que ahora sí se cuenta, es la defensa.
- **Una regla nueva en `.claude/rules/supabase.md`** («NULL en un `if` concede») y **un ADR del patrón
  de dos pasos**: le tocan al usuario y al arquitecto. Lo propongo en el informe.

## 9 · Respuestas del propietario (04-10-2026)

- **P1 → 60 s y 2 usos.**
- **P2 → por lote, en la fila centinela, como hoy.**
- **P3 → (a).** No hay ninguna instancia con datos reales: el PIN nulo se arregla dentro de T-042,
  el siguiente de la cola de `supabase/` cuando T-038 esté en `main`.
