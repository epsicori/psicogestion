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

---

## R2 · Ronda 2 (04-10-2026)

Ronda corta que el propietario aprobó el 04-10-2026 sobre la revisión combinada de la ronda 1
(`tickets/T-042/revision.md`: 0 ALTA, 2 MEDIA, 6 BAJA).

- Las secciones 0-9 de arriba no se tocan. Donde esta R2 las contradice, **manda esta R2**
  (la lista está en R2.8).
- Base de trabajo: rama `worktree-agent-a9f0330c3f05f9a94`, HEAD 8693cf1.
- **B1-H2 queda fuera**: lo resuelve el usuario al integrar.
- **Esta ronda no toca `docs/state.md`.**

### R2.0 · Hechos verificados para esta ronda

- **`comprobar_pin_historia`** (migración `20261009120000`, sección c):
  - `select … for update` en las líneas 87-90.
  - `if v_hasta > now() then return` en la línea 97.
  - Una sola `update … set intentos_fallidos = … ph.intentos_fallidos + 1 …` en 107-119. Relee
    la fila (EvalPlanQual).
  - Tres `insert … where` en 123-137: `PIN_FALLIDO` si `not v_ok`; `PIN_BLOQUEADO` y el aviso
    `pin_bloqueado` si `v_bloqueo is not null`.
  - **Sin el `for update`**: tres PIN malos a la vez desde `intentos = 4` leen todos `v_hasta`
    nulo y comparan. La `update` los encadena a 5, 6 y 7: tres `PIN_FALLIDO`, tres
    `PIN_BLOQUEADO` y tres avisos.
  - **Con el `for update`**: 5, y +1 de cada. Las dos peticiones que esperan ven el bloqueo y
    salen en la línea 97.
  - C1 («tres malos suman tres») da lo mismo en las dos versiones. Por eso sobrevivió M-H4.
- **`comprobar_codigo_recuperacion`** (sección e):
  - `pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0))` en
    la línea 256.
  - Centinela con `for update` en 259-264.
  - `if v_hasta > now() then return`.
  - `update` de la centinela con `c.intentos_fallidos + 1` (relee la fila) en 284-291.
  - Misma forma que el PIN, pero con **dos** serializadores.
- **Timeouts.** `authenticated` y `authenticator` tienen `statement_timeout = 8s` y
  `lock_timeout = 8s` (medido en la ronda 1). PostgREST no fija `PGRST_DB_POOL`, así que el
  pool es de 10.
- **`bloquear_historia()`.** Única definición en
  `20260822160000_rls_funciones_y_politicas.sql:441-468`, con el comentario en la línea 470.
  Revoca los `desbloqueos_historia` vigentes y devuelve cuántos.
- **`fijar_pin_historia(text)`.** Vigente en
  `20260830090000_cuentas_invitacion_baja_totp.sql:859-891`, con el comentario en la 893.
  - Su `on conflict do update` pone `hash`, `intentos_fallidos = 0`, `bloqueado_hasta = null`
    y `actualizado_en`.
  - **No** toca `desbloqueos_autorizados` ni `autorizado_hasta`.
  - Ni esta función ni `bloquear_historia()` están en una migración de T-042.
- **Quién escribe `codigos_recuperacion_totp.usado_en`:**
  - `dar_de_baja_perfil` (`20260830090000:464`): todo el lote.
  - `generar_codigos_recuperacion` y `regenerar_codigos_recuperacion` (`20261008120000`): todo
    el lote.
  - `canjear_codigo_recuperacion()` (T-042): un código, en la misma transacción en la que
    consume la autorización.
  - `registrar_reposicion_totp` (última versión en `20261008120000:553`) **no** caduca códigos.
  - No existe ninguna función para desactivar el 2FA.
- **`fn_auditar` en `UPDATE`.** Escribe `estado_anterior = to_jsonb(old)` y
  `estado_posterior = to_jsonb(new)`, sin las columnas que el disparador pasa como argumentos 2
  en adelante.
  - `auditar_pines_historia` = `fn_auditar('perfil_id', 'hash')` (bucle de
    `20260829150000:357-359`). Ahí `registro_id` es `perfil_id`.
  - `auditar_codigos_recuperacion_totp` = `fn_auditar('id', 'codigo_hash')`
    (`20260830090000:172-174`). Ahí `registro_id` es `id`.
  - En las dos, `actor_id = auth.uid()` y `ocurrido_en` lleva `default now()`.
- **El `console.error` del paso dos.** `lib/cuentas/candado.ts:79` y el paso dos de
  `canjearCodigoRecuperacion` en `lib/cuentas/totp.ts` (~144) pasan el objeto `error` entero.
  El paso uno de `candado.ts` (68-74) ya registra solo `.code`.
- **`lib/cuentas/totp.test.ts`.** `adminFingida()` devuelve `listFactors` con `factors: []` y un
  `deleteFactor: vi.fn()` que no expone. En las pruebas, `borrarFactoresTotp` (`totp.ts:6-21`)
  nunca llega a `deleteFactor`, y no hay ningún caso `sin_codigos`.
- **Banco.**
  - Todo `npm run test:rls` corre en **una** transacción.
  - `auth.mfa_factors` tiene un único global sobre `last_challenged_at`. El banco ya usa estos
    desfases: 1-6 s, 21-25 s, 10 min y 17 min. **43 s está libre.**
  - PRO1 tiene el PIN `111111` (`01-fijacion.sql:211`) y un factor verificado desde la fijación.
- **La migración `20261009120000`** no está en `main` (que llega a `20261008120000`), pero sí
  está aplicada en la base local compartida.

### R2.1 · A1-H1 (MEDIA) · la serialización del paso uno, probada con solape real

**Dónde.** En el oráculo HTTP `scripts/t042-oraculo.mjs` (territorio `scripts/t042-*`).
- No en el banco 24: corre en una sola transacción y una sola sesión, así que no puede tener
  dos peticiones en vuelo.
- Tampoco en un banco nuevo con dos conexiones psql. El oráculo ya tiene el UID propio, la
  fijación, `llamar()` y los contadores, y la CA10 es una propiedad de la frontera HTTP.

**Qué se añade.** Dos casos nuevos después de C3: **C4 (PIN)** y **C5 (canje)**. C1 se conserva
tal cual: es la letra de la CA10 («tres comprobaciones malas a la vez suman tres») y sigue
siendo cierta.

**Pieza común.** Una función `conBloqueador(sqlRetener, patronFuncion, lanzar)` (nombre
orientativo) en el mismo fichero:

1. **Bloqueador.** Se lanza con `spawn` **asíncrono** (no `spawnSync`, que bloquearía el bucle de
   eventos con peticiones en vuelo):
   `docker exec -i -e PGAPPNAME=t042-bloqueador <contenedor> psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1`.
   Con la stdin abierta, se escribe `begin;` + `sqlRetener` + un salto de línea, y la stdin
   **no** se cierra. psql ejecuta cada sentencia completa según llega, y la transacción queda
   abierta.
2. **Esperar a que retenga.** Un psql asíncrono sondea cada 50 ms, durante 3 s como máximo,
   hasta que esta consulta dé 1:
   `select count(*) from pg_stat_activity where application_name = 't042-bloqueador' and state = 'idle in transaction'`.
   No se lee el búfer de stdout del bloqueador.
3. **Ráfaga.** Se lanzan las 3 llamadas sin `await`. El `Promise.all` se espera más tarde.
4. **Esperar al solape.** Se sondea cada 50 ms, durante 4 s como máximo (por debajo de los 8 s
   de `lock_timeout` y `statement_timeout`), hasta que esta consulta dé **3**:
   `select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%<patronFuncion>%' and pid <> pg_backend_pid()`.
   - Con el código bueno, las tres esperan en el serializador.
   - Con el mutante, esperan en la `update` de la fila que el bloqueador retiene con
     `for update`.
   - La precondición se cumple en las dos versiones, así que la prueba compara lo mismo.
5. **Soltar.** Se escribe `commit;`, se cierra la stdin y se esperan el `exit` del proceso y las
   tres respuestas.
6. **No concluyente = rojo.** Si en el paso 2 o en el 4 no se llega al número esperado:
   - se escribe `rollback;` y se esperan las respuestas;
   - se lanza `Parada('C4 no concluyente: N/3 en espera')`, y el caso queda en **FALLA**;
   - nunca da verde sin haber visto las tres peticiones en espera;
   - el `finally` mata el proceso si sigue vivo.

**C4 · PIN.**
- **Preparación.**
  - `reiniciar()` y luego **4 `comprobarPin(PIN_MALO)` secuenciales**. Los cuatro intentos los
    hace la función bajo prueba, no un `update` por psql (regla de T-013a).
  - C4 no llama a `cuidarse()`, que pararía al llegar a 4.
  - Se leen las líneas base: `estadoPin()`, `nAud('PIN_FALLIDO')`, `nAud('PIN_BLOQUEADO')` y los
    avisos (`select count(*) from public.notificaciones where perfil_id = UID and tipo = 'pin_bloqueado'`).
  - Antes de seguir se exige `intentos = 4`.
- **`sqlRetener`:** `select 1 from public.pines_historia where perfil_id = '<UID>' for update;`
- **`patronFuncion`:** `comprobar_pin_historia`.
- **Ráfaga:** 3 `comprobarPin(PIN_MALO)`.
- **Lo que se exige:**
  - las tres peticiones responden 204;
  - `intentos_fallidos = 5` y `bloqueado_hasta` no nulo;
  - `PIN_FALLIDO` = base + 1, `PIN_BLOQUEADO` = base + 1 y avisos = base + 1.
- **Cierre:** `reiniciar()`, que quita el bloqueo y deja la fila limpia para C5 y para otras
  ejecuciones.

**C5 · canje.**
- **Preparación:** `reiniciar()` y **4 `comprobarCod(COD_MALO)` secuenciales**. Se exige que la
  centinela tenga `intentos = 4` (`estadoCanje()`).
- **`sqlRetener`:** dos sentencias, en este orden.
  - `select pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || '<UID>', 0));`
  - `select 1 from public.codigos_recuperacion_totp where id = '<CENT>' for update;`
  - Tiene que retener las dos para que la precondición del paso 4 valga contra cualquiera de los
    mutantes.
- **`patronFuncion`:** `comprobar_codigo_recuperacion`.
- **Ráfaga:** 3 `comprobarCod(COD_MALO)`.
- **Lo que se exige:** las tres peticiones responden 204; la centinela tiene
  `intentos_fallidos = 5` y `bloqueado_hasta` no nulo. El canje no audita los fallos (sección e),
  así que no se cuentan filas de auditoría.
- **Cierre:** `reiniciar()`.

**Mutantes** (se registran en `tickets/T-042/mutantes.json`):
- **M-H4** (ya existe): quitar el `for update` de la línea 90. Pasa de «rojo: false» a
  **«rojo: true» por C4**: da `intentos = 7`, y +3 en cada contador.
- **M-H5** (nuevo): quitar **a la vez** el `perform pg_advisory_xact_lock(…)` de la línea 256 y
  el `for update` de la 264. Rojo por C5: `intentos = 7`.
- **Equivalentes.** Quitar solo uno de los dos serializadores del canje es un mutante
  equivalente por construcción, porque el otro sigue serializando.
  - Se registran como `equivalente: true`, con esa razón: M-H5a (sin el candado) y M-H5b (sin el
    `for update`).
  - Se ejecutan igual, y C5 debe salir verde con los dos. Así queda documentado que el canje
    tiene dos defensas.

**Salida.** `oraculo-postgrest.json` gana `C4` y `C5` con
`{ en_espera: 3, base, final, veredicto }`, para que la evidencia muestre que hubo solape.

### R2.2 · A1-H2 (BAJA) · bloquear y fijar el PIN anulan la autorización pendiente

**Dónde.** En una sección nueva, **«h)»**, al final de
`supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql`, después de los grants (g).
- Es la migración de T-042, no está en `main` y el propietario permite editarla («en la
  migración de T-042 o en una nueva del mismo ticket»).
- **No se editan** ni `20260822160000` ni `20260830090000`.
- Las dos funciones se redefinen con `create or replace function`, que conserva los grants y el
  propietario. Al final de h) no hacen falta grants nuevos, pero sí repetir los dos
  `comment on function`.

**`bloquear_historia()`.** El cuerpo exacto de `20260822160000:441-468`, con esta sentencia
añadida **antes** del `return v_n`:
```
update public.pines_historia ph
   set desbloqueos_autorizados = 0,
       autorizado_hasta = null,
       actualizado_en = now()
 where ph.perfil_id = v_uid
   and (ph.desbloqueos_autorizados > 0 or ph.autorizado_hasta is not null);
```
- **El predicado no es decorativo.** Sin él, cada «bloquear» de un perfil sin autorización
  escribiría una fila `UPDATE` de auditoría vacía y movería `actualizado_en`. Eso podría romper
  las cuentas exactas de los bancos 03 y 09, que llaman a `bloquear_historia()`.
- El valor de retorno no cambia: sigue siendo el número de ventanas revocadas.
- Comentario: el actual, más «Desde T-042, anula también la autorización pendiente del paso
  dos.».

**`fijar_pin_historia(p_pin text)`.** El cuerpo exacto de `20260830090000:859-891`, con dos
columnas más en el `on conflict (perfil_id) do update set`:
`desbloqueos_autorizados = 0, autorizado_hasta = null`.
- En la rama del `insert`, los valores por defecto de las columnas (sección a) ya dan 0 y nulo.
- Comentario: el de `20260830090000:893`, más la misma frase de T-042.

**Canje: sin cambios. Decidido, con su porqué.** La autorización del canje vive en la
centinela (`canje_autorizado_id`, `canje_autorizado_hasta`), y consumirla exige que la centinela
siga vigente (`usado_en is null`).
- Generar, regenerar y dar de baja caducan **todo** el lote, centinela incluida, así que la
  autorización ya muere con ellos. Limpiarla además sería código muerto.
- No hay ninguna función para desactivar el 2FA.
- La reposición del administrador no caduca los códigos, y esos códigos siguen siendo válidos
  para su titular. Una autorización sobrante de 60 s solo puede canjear un código del propio
  titular, que además ya acertó.
- Por eso, para A1-H2 no hay en el canje ni cambio, ni prueba, ni mutante.

**Prueba.** Un bloque nuevo en el banco 24, «T-042 CA-R2.2», antes del `t42_pin_reset` final.

1. **Gemela positiva.** `select pg_temp.t42_pin_reset(:PRO1);`. Como PRO1, en la misma sesión que
   usa la CA1: `comprobar_pin_historia('111111')` dos veces y `t42_p2_pin() = 'ok'` una vez.
   Se comprueba `t42_pin(:PRO1) = '0/1/false'`: queda exactamente una autorización viva.
2. **Bloquear.** `select public.bloquear_historia();`. Se exige:
   - `historia_desbloqueada()` falso;
   - `t42_pin(:PRO1) = '0/0/false'`;
   - `t42_p2_pin() = 'pin_incorrecto'`, con `historia_desbloqueada()` todavía falso.
3. **Preparar la fijación.** `reset_sesion()` y, como postgres:
   `update auth.mfa_factors set last_challenged_at = now() - interval '43 seconds' where id = (select id from auth.mfa_factors where user_id = :PRO1 and status = 'verified' order by created_at limit 1);`
   - Se actualiza un solo factor en lugar de llamar a `dar_segundo_factor`, porque ese
     procedimiento choca con el nombre único del factor de PRO1. Ningún otro módulo usa 43 s.
   - Después, como PRO1 con `como_con_2fa`: `comprobar_pin_historia('111111')` dos veces, y se
     comprueba `t42_pin(:PRO1) = '0/2/false'`.
   - Por último, `fijar_pin_historia('111111')`. Es el mismo PIN, así que no hay nada que
     restaurar.
4. **Comprobar la fijación.** Se exige `t42_pin(:PRO1) = '0/0/false'` y
   `t42_p2_pin() = 'pin_incorrecto'`, con `historia_desbloqueada()` falso. Después,
   `reset_sesion()` y `t42_pin_reset(:PRO1)`.

**Mutantes.**
- **M21:** quitar la `update` añadida a `bloquear_historia()`. Sale rojo en el paso 2: la fila
  se queda en `0/1/false` y el paso dos da `ok`.
- **M22:** quitar las dos columnas añadidas al `on conflict` de `fijar_pin_historia`. Sale rojo
  en el paso 4: la fila se queda en `0/2/false`.

**Aplicación.**
- Editar una migración que ya está aplicada en la base local obliga a un
  `npx supabase db reset`. Como la base es compartida, el momento lo coordina el orquestador.
- Mientras tanto, el implementador puede aplicar la sección h) sobre la base local con
  `docker exec -i … psql -f -`: `create or replace` es idempotente.
- La evidencia final se toma **después** del `db reset`, para demostrar que el orden funciona
  desde cero.

### R2.3 · A1-H3 (BAJA) · la CA4 mira también las filas `UPDATE` de `fn_auditar`

**Dónde.** `scripts/rls/24-pin-y-canje-dos-pasos.sql`. La aserción «ninguna entrada de auditoría
lleva el PIN ni el hash» (~294-298) se sustituye por las aserciones de abajo. La de
`PIN_FALLIDO` y `PIN_BLOQUEADO` se queda como está.

1. **No vacía.** Primero se exige que haya filas que mirar. Esta consulta debe dar más de 0:
   `select count(*) from public.auditoria a where a.tabla = 'pines_historia' and a.registro_id = :'PRO1' and a.operacion = 'UPDATE' and a.ocurrido_en = now()`.
   Si diera 0, la aserción siguiente saldría verde sin probar nada.
2. **Sin hash.** Sobre esas mismas filas (`operacion in ('INSERT', 'UPDATE')`), ninguna fila
   puede cumplir alguna de estas condiciones:
   - `coalesce(a.estado_anterior, '{}') ? 'hash'`
   - `coalesce(a.estado_posterior, '{}') ? 'hash'`
   - `coalesce(a.estado_anterior::text, '') ~ '\$2[abxy]?\$'`
   - `coalesce(a.estado_posterior::text, '') ~ '\$2[abxy]?\$'`
3. **Lo mismo para el canje.** Va en el bloque de la CA de canje que ya crea el lote con
   `t42_lote`:
   - `tabla = 'codigos_recuperacion_totp'`;
   - solo las filas del lote de PRO1:
     `registro_id in (select id::text from public.codigos_recuperacion_totp where perfil_id = :PRO1)`;
   - la clave buscada es `codigo_hash`;
   - también con la aserción de «no vacía» delante.

**Mutantes.**
- **M23:** `drop trigger auditar_pines_historia on public.pines_historia;` y volver a crearlo con
  `fn_auditar('perfil_id')`, sin `'hash'`. Sale rojo en el punto 2.
- **M23b:** lo mismo con `auditar_codigos_recuperacion_totp` y `fn_auditar('id')`. Sale rojo en
  el punto 3.
- Los dos se aplican como postgres dentro de una ejecución del banco y se revierten. Si algo
  queda a medias, el `db reset` devuelve el original.

### R2.4 · A1-H4 (BAJA) · M10 sin estado forjado

**Hecho.** M10 relaja una guarda que solo actúa en un estado: «la autorización apunta a un
código ya usado». Por la API ese estado **no se puede alcanzar**:
- la autorización solo la consume `canjear_codigo_recuperacion()`, en la misma transacción en la
  que marca el código;
- todos los demás escritores de `usado_en` caducan el lote entero, centinela incluida, y la
  centinela vieja deja de ser «la vigente más reciente».

Por tanto, no hay ninguna prueba que distinga M10 sin forjar el estado.
- La CA5.5 (lote nuevo entre los dos pasos) no mata M10. El rechazo lo produce la guarda del
  consumo, porque la centinela nueva nace con `canje_autorizado_id` nulo; no lo produce el
  `usado_en is null` del código.

**Cambio, si el propietario acepta P-R2-1.** Solo en `scripts/rls/24-pin-y-canje-dos-pasos.sql`.
- **CA5.5b:** se queda como la prueba oficial de M10, con este comentario encima: «Estado
  inalcanzable por la API (A1-H4, R2.4): se forja como postgres para probar la defensa en
  profundidad del `usado_en is null`. No borrar.».
- **CA5.5:** el mensaje de la aserción pasa a decir su motivo real: «la centinela del lote nuevo
  no lleva autorización: la guarda del consumo rechaza». Antes del paso dos se añade una
  aserción que lo demuestra:
  `select canje_autorizado_id is null from codigos_recuperacion_totp where id = pg_temp.t42_cent_id(:PRO1)`.
- **Mutante:** M10 sigue registrado como muerto por la CA5.5b, con `forjado: true` en
  `mutantes.json`.

**P-R2-1 (para el propietario).** ¿Aceptas que M10 se dé por probado con la CA5.5b, que forja
el estado como postgres porque por la API no se puede alcanzar? ¿O prefieres quitar del canje la
guarda `usado_en is null` por inalcanzable?
- **Recomendación: aceptar la CA5.5b forjada y conservar la guarda.**
  - Cuesta una línea.
  - Cubre el día en que un escritor futuro de `usado_en` marque un solo código sin caducar el
    lote.
  - Quitarla dejaría la integridad del canje colgando de un invariante que la base no hace
    cumplir.
- La alternativa (quitarla) haría desaparecer M10, pero cambia código de producción por motivos
  de prueba.
- **Si no hay respuesta antes de implementar,** el implementador aplica la recomendación. Solo
  toca comentarios y la aserción de la CA5.5, sin efecto en producción.

### R2.5 · B1-H5 (BAJA) · el paso dos registra solo `.code`

**Qué se cambia.**
- En `lib/cuentas/candado.ts:79`:
  `console.error('desbloquearHistoria: fallo al llamar desbloquear_historia()', error?.code ?? 'sin fila')`.
- En `lib/cuentas/totp.ts`, el `console.error` del paso dos de `canjearCodigoRecuperacion` (~144):
  la misma forma, `error?.code ?? 'sin fila'`.
- El texto fijo del mensaje no cambia.
- El paso dos puede caer por «sin fila», con `error` nulo, si `data` llega vacío. En ese caso el
  segundo argumento es la cadena `'sin fila'`.
- Las dos ediciones están dentro del territorio: `candado.ts` entero, y de `totp.ts` solo
  `canjearCodigoRecuperacion`.

**Pruebas.**
- En `lib/cuentas/candado.test.ts`, caso «paso dos falla» (58-64). El error fingido pasa a ser:
  `{ code: 'PGRST301', message: 'DETALLE-NO-DEBE-SALIR', details: 'DETALLE-NO-DEBE-SALIR', hint: 'DETALLE-NO-DEBE-SALIR' }`.
- La consola se espía con `vi.spyOn(console, 'error').mockImplementation(() => {})`. Se exige
  que `JSON.stringify(espia.mock.calls)`:
  - **no contenga** `'DETALLE-NO-DEBE-SALIR'`;
  - **sí contenga** `'PGRST301'`.
- Lo mismo en `lib/cuentas/totp.test.ts`, en el caso «paso dos falla» del `describe` del canje.
  - El caso ya existe, así que se ajusta.
  - El territorio dice «solo casos nuevos del canje». Se lee como «solo el `describe` del
    canje», que es donde vive este caso, y esa lectura se anota en la bitácora.

**Mutantes.**
- **M24:** volver a pasar `error` entero en `candado.ts`. Sale rojo por el «no contiene».
- **M24b:** lo mismo en `totp.ts`.

### R2.6 · B1-H6 (BAJA) · `deleteFactor` se ejecuta en las pruebas, y `sin_codigos` no borra

**Dónde.** Solo en `lib/cuentas/totp.test.ts`, dentro del `describe` del canje (desde la
línea 139).

**Qué se cambia.** `adminFingida()`, o una variante local del `describe`:
- `listFactors` pasa a ser
  `vi.fn().resolves({ data: { factors: [{ id: 'f-1' }] }, error: null })`. La forma exacta se
  copia del uso real en `totp.ts:6-21`, que es el que manda.
- `deleteFactor` se expone para poder hacer aserciones sobre él (por ejemplo,
  `vi.fn().resolves({ data: null, error: null })`).

**Pruebas.**
- **Caso `ok` (ya existe), ampliado:** `deleteFactor` se llama **una vez**, con
  `{ id: 'f-1', userId: 'u-1' }` (el `userId` que ya usa el caso).
- **Caso nuevo, `sin_codigos`:** el paso uno responde bien y el paso dos devuelve
  `[{ motivo: 'sin_codigos' }]`. Se exige:
  - que la función devuelva lo mismo que ya devuelve para ese motivo;
  - que **no se llame ni a `listFactors` ni a `deleteFactor`**.
- **Casos `codigo_invalido` y `bloqueado` (ya existen):** ganan la misma aserción negativa,
  `deleteFactor` no llamado.

**Mutantes.**
- **M25:** en `totp.ts`, cambiar la guarda `fila.motivo === 'ok'` por
  `fila.motivo !== 'codigo_invalido' && fila.motivo !== 'bloqueado'`. Sale rojo en el caso
  `sin_codigos`, porque se llama a `listFactors` y a `deleteFactor`.
- **M25b:** quitar la llamada a `deleteFactor` dentro de `borrarFactoresTotp`. Sale rojo en el
  caso `ok`.

### R2.7 · B1-H4 (BAJA) · columnas nuevas en `tipos-bd.ts`: solo se anota

**Hecho.** `supabase gen types` introspecciona todas las tablas de `public` sin mirar los
grants.
- Por eso las columnas `desbloqueos_autorizados`, `autorizado_hasta`, `canje_autorizado_id` y
  `canje_autorizado_hasta` salen en `lib/supabase/tipos-bd.ts`, aunque `authenticated` no pueda
  leerlas.
- Es la salida legítima del generador, no un fallo. La frase de §1.2 que decía lo contrario era
  falsa.

**Dónde se anota y dónde no.**
- (a) Aquí, en R2.8, como corrección de §1.2 y del texto de la CA15.
- (b) En `docs/bitacora/T-042.md`, en la entrada de la ronda 2.
- (c) En la evidencia de la CA15 de la ronda 2, citando esta R2.7. Que esas columnas no se puedan
  leer lo prueban la CA7 y la CA8 del banco (los grants), no los tipos.
- No va en `docs/state.md`, que esta ronda tiene excluido.
- No hay cambio de código, ni prueba, ni mutante.

### R2.8 · Correcciones a las secciones anteriores (mandan sobre ellas)

- **§1.2:** donde dice que las columnas nuevas no aparecen en los tipos, léase R2.7.
- **§3, fila CA10:** M-H4 ya no queda «no observado».
  - Lo mata C4 (R2.1).
  - M-H5 lo mata C5.
  - M-H5a y M-H5b son equivalentes por construcción.
- **§4, riesgo 5, y «Lo que no entra»:** la línea que aceptaba que `fijar_pin_historia` (y
  `bloquear_historia`) dejaran viva la autorización queda **superada** por R2.2.
- **§5:**
  - La CA5.5 no prueba el `usado_en is null` (R2.4).
  - La frase «la reposición caduca el lote» es inexacta: `registrar_reposicion_totp` no caduca
    códigos (R2.0). La conclusión de seguridad no cambia, por el razonamiento de R2.2.

### R2.9 · Territorio de esta ronda

| Fichero | ¿Dentro del `territorio:`? |
|---|---|
| `supabase/migrations/20261009120000_pin_y_canje_en_dos_pasos.sql` (sección h) | Sí |
| `scripts/rls/24-pin-y-canje-dos-pasos.sql` | Sí (`scripts/rls/**`) |
| `scripts/t042-oraculo.mjs` | Sí (`scripts/t042-*`) |
| `lib/cuentas/candado.ts` y `candado.test.ts` | Sí |
| `lib/cuentas/totp.ts` (solo `canjearCodigoRecuperacion`) | Sí |
| `lib/cuentas/totp.test.ts` (solo el `describe` del canje) | Sí, con la lectura de R2.5 |
| `docs/bitacora/T-042.md` | Sí |
| `tickets/T-042/mutantes.json`, `evidencia*` y `oraculo-postgrest.json` | **No: no casan con el glob.** Son artefactos de evidencia que la ronda 1 ya escribió y que exige el gate. Se señala para que el usuario lo sepa; no se amplía el contrato. |
| `docs/state.md` | Está en el glob, pero el propietario lo **excluyó** de esta ronda |
| `lib/supabase/tipos-bd.ts` | No se toca: la sección h) no cambia el esquema |

Nada de R2 exige salir del territorio. `bloquear_historia` y `fijar_pin_historia` se redefinen
dentro de la migración de T-042.

### R2.10 · Cómo se cierra la ronda

| Punto | Comprobación | Mutante que debe salir en rojo |
|---|---|---|
| A1-H1 | `node scripts/t042-oraculo.mjs` después del `db reset`: C1-C5 PASA, y C4 y C5 con `en_espera: 3` | M-H4 (C4) y M-H5 (C5). M-H5a y M-H5b son equivalentes |
| A1-H2 | `npm run test:rls`: CA-R2.2 PASA | M21 y M22 |
| A1-H3 | `npm run test:rls`: CA4 PASA, con las dos aserciones de «no vacía» | M23 y M23b |
| A1-H4 | `npm run test:rls`: CA5.5 y CA5.5b PASA, con el comentario y la aserción nueva | M10 (CA5.5b, estado forjado) |
| B1-H5 | `npm test` | M24 y M24b |
| B1-H6 | `npm test` | M25 y M25b |
| B1-H4 | La entrada en la bitácora y la cita en la evidencia de la CA15 | — |
| Todo | `npm run lint`, `npm run lint:migraciones`, `npm run build`, y el banco completo sobre la base vacía y sobre la sembrada | — |

Para cada mutante:
- se aplica;
- se comprueba que sale en rojo **por el motivo indicado** (no por un error de sintaxis ni por
  un 23505 ajeno);
- se revierte;
- se registra en `mutantes.json`, con el comando y la línea de salida.

### R2.11 · Riesgos de la ronda, por probabilidad

1. **Base local compartida y `db reset` (alta).** Editar la migración aplicada obliga a un
   reset, que borra el estado de quien esté usando la base y obliga a volver a correr el seed.
   - Mitigación: el orquestador coordina el momento; mientras tanto, h) se aplica con psql.
2. **Sondeo frágil en C4 y C5 (media).** Si PostgREST tarda en abrir la conexión o el contenedor
   va lento, puede que no se vean las 3 esperas en 4 s.
   - El resultado es «no concluyente», en rojo; nunca un falso verde. Se puede repetir.
   - El umbral de 4 s está por debajo de los 8 s de los timeouts. Si se queda corto de forma
     reproducible, se sube a 6 s, y nunca por encima de 7 s.
3. **Choque con el único de `last_challenged_at` o con el nombre del factor (media).** Por eso se
   actualiza un solo factor, con 43 s (R2.2, paso 3).
   - Si otro ticket usa ese desfase, la prueba muere con 23505: un fallo ruidoso, no silencioso.
4. **Cuentas exactas en los bancos 03 y 09 (baja).** El predicado de la `update` de
   `bloquear_historia` evita filas de auditoría nuevas cuando no hay autorización.
   - Si aun así algo se rompe, es que el banco ya tenía una autorización viva. Hay que comprobarlo
     antes de tocar la prueba ajena.
5. **psql por stdin en Windows (baja).** `docker exec -i` con la stdin en pipe ejecuta línea a
   línea.
   - Si el bloqueador no aparece como `idle in transaction` en 3 s, el caso sale «no
     concluyente», no verde.

### R2.12 · Qué revisar en esta ronda

- **Que C4 y C5 vieron el solape.**
  - El JSON muestra `en_espera: 3` y el mutante da 7. Un C4 verde sin `en_espera` registrado no
    vale.
  - Los 4 intentos previos los hace `comprobarPin`, no psql.
- **Que el bloqueador del canje retiene las dos cosas**: el candado de consejo y la centinela. Si
  solo retuviera una, la precondición podría fallar con uno de los mutantes y la prueba no
  compararía lo mismo.
- **Sección h).** Los cuerpos copiados son idénticos a los originales, salvo lo añadido:
  - `fijar_pin_historia` se compara contra `20260830090000:859-891`: la guarda del segundo
    factor, el formato, `bf 12` y `set search_path = ''`;
  - `bloquear_historia` se compara contra `20260822160000:441-468`, con el retorno sin cambios;
  - h) va al final de la migración, después de los grants.
- **Que la `update` de `bloquear_historia` lleva su predicado**, y que el cambio de
  `fijar_pin_historia` está en el `on conflict`. Sin el predicado salen filas de auditoría de
  ruido.
- **Que la CA-R2.2 tiene su gemela positiva** (`0/1/false` y `0/2/false` antes) y comprueba el
  paso dos real, no solo la fila.
- **CA4 de auditoría.** Va primero la aserción de «no vacía». Se miran `estado_anterior` y
  `estado_posterior`, y todo se repite para `codigo_hash`.
- **B1-H5.** El texto centinela está en `message`, `details` y `hint` a la vez. La aserción es
  «no contiene», no un `toHaveBeenCalledWith`, que pasaría con argumentos de más.
- **B1-H6.** El caso `sin_codigos` comprueba que **no** se llame a `listFactors`, no solo a
  `deleteFactor`.
- **Que no se ha tocado:** `docs/state.md`, B1-H2 ni las secciones 0-9 de este diseño.

### R2 · Lo que no entra, y por qué

- **Limpiar la autorización del canje** en generar, regenerar, la baja o la reposición. Ya la
  matan el caducado del lote o el invariante de titularidad (R2.2). Sería código sin un estado
  alcanzable que probar.
- **Una prueba de concurrencia en el banco SQL.** Una sola transacción y una sola sesión no
  pueden solaparse.
- **Auditar los fallos del canje.** No lo pide ningún hallazgo ni el contrato.
- **B1-H2**, que lo resuelve el usuario, y **`docs/state.md`**, excluido de esta ronda.

**Respuesta del propietario a P-R2-1 (04-10-2026)**: conservar la guarda `usado_en is null` y dar M10 por probado con la CA5.5b (estado forjado), como recomienda el diseño.
