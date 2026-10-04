-- T-042 · El PIN de la historia y el canje de códigos de recuperación, en dos pasos.
--
-- Defecto que cierra (hallazgo «PIN y canje», ALTA, y el PIN nulo, CRÍTICO):
--   · `desbloquear_historia(p_pin)` y `canjear_codigo_recuperacion(p_codigo)` cotejaban el
--     secreto, contaban el fallo y devolvían el resultado en la MISMA transacción. Con
--     PostgREST el cliente puede pedir el resultado como objeto singular con un filtro sobre
--     la salida: si falla recibe un 406 y la transacción se deshace, y con ella el intento
--     fallido. El límite de cinco intentos (ADR-026, ADR-039) no existía.
--   · `desbloquear_historia(NULL)` devolvía `ok`: `crypt(NULL, hash) <> hash` vale NULL, un
--     `if` con NULL no entra en la rama del fallo y la función seguía hasta la del acierto.
--
-- Patrón de T-038 ronda 2 (DR1, DR2, DR3): el paso uno coteja y confirma SIEMPRE y no
-- devuelve nada; el paso dos, en otra transacción, lee lo confirmado y no recibe el secreto.
-- Reglas de `.claude/rules/supabase.md`: cada tabla del cuerpo lleva alias, `extensions.crypt`,
-- ningún bloque de excepciones.

-- =========================================================================
-- a) Columnas de autorización
-- =========================================================================

alter table public.pines_historia
  add column desbloqueos_autorizados smallint not null default 0
    check (desbloqueos_autorizados between 0 and 2),
  add column autorizado_hasta timestamptz;

comment on column public.pines_historia.desbloqueos_autorizados is
  'Autorización del paso uno (T-042). Solo la escribe comprobar_pin_historia() y la consume '
  'desbloquear_historia(). Tope 2: un doble envío del formulario abre dos veces.';
comment on column public.pines_historia.autorizado_hasta is
  'Autorización del paso uno (T-042). Solo la escribe comprobar_pin_historia() y la consume '
  'desbloquear_historia(). Caduca a los 60 segundos.';

alter table public.codigos_recuperacion_totp
  add column canje_autorizado_id uuid,
  add column canje_autorizado_hasta timestamptz,
  add constraint codigos_recuperacion_totp_canje_autorizado_par
    check ((canje_autorizado_id is null) = (canje_autorizado_hasta is null));

comment on column public.codigos_recuperacion_totp.canje_autorizado_id is
  'Autorización del paso uno (T-042). Solo la escribe comprobar_codigo_recuperacion() y la '
  'consume canjear_codigo_recuperacion(). Vive en la fila centinela del lote y apunta al '
  'código que casó.';
comment on column public.codigos_recuperacion_totp.canje_autorizado_hasta is
  'Autorización del paso uno (T-042). Solo la escribe comprobar_codigo_recuperacion() y la '
  'consume canjear_codigo_recuperacion(). Caduca a los 60 segundos.';

-- =========================================================================
-- b) Las firmas viejas desaparecen
-- =========================================================================

-- destructivo: la puerta de un paso es el oráculo de T-042; sus llamantes pasan a dos pasos en este ticket
drop function public.desbloquear_historia(text);
drop function public.canjear_codigo_recuperacion(text);

-- =========================================================================
-- c) comprobar_pin_historia(p_pin) — paso uno del PIN
-- =========================================================================

create function public.comprobar_pin_historia(p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_hash     text;
  v_hasta    timestamptz;
  v_ok       boolean;
  v_intentos smallint;
  v_bloqueo  timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Guarda de solo lectura: en una transacción de solo lectura el contador no se puede
  -- escribir, y un fallo distinto según el secreto sería un oráculo. El mensaje es el mismo
  -- para el secreto bueno y para el malo, y va antes del candado y de la comparación.
  if current_setting('transaction_read_only') = 'on' then
    raise exception 'La comprobación del PIN exige una transacción de escritura.'
      using errcode = '25006';
  end if;

  -- Serializa los intentos concurrentes sobre la fila del PIN.
  select ph.hash, ph.bloqueado_hasta into v_hash, v_hasta
  from public.pines_historia ph
  where ph.perfil_id = v_uid
  for update;

  if not found then
    return;
  end if;

  -- Bloqueado: no se compara ni se escribe (ADR-026: el bloqueo se mira antes de comparar).
  if v_hasta > now() then
    return;
  end if;

  -- Un PIN nulo o vacío es un fallo: sin coalesce, NULL saldría de la comparación.
  v_ok := coalesce(extensions.crypt(p_pin, v_hash) = v_hash, false);

  -- Una sola escritura en la tabla del contador, sin condicionales alrededor: el acierto y
  -- el fallo ejecutan la misma sentencia. El tope de 100 evita el desbordamiento de smallint
  -- solo en la rama del fallo, porque un error ahí sería otro oráculo.
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

  -- Tres sentencias incondicionales: en las dos ramas se ejecutan, y su predicado decide
  -- si insertan una fila o ninguna. Todo intento fallido deja constancia (ADR-026).
  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  select v_uid, 'pines_historia', 'PIN_FALLIDO', v_uid::text,
         jsonb_build_object('intentos_fallidos', v_intentos)
  where not v_ok;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  select v_uid, 'pines_historia', 'PIN_BLOQUEADO', v_uid::text,
         jsonb_build_object('intentos_fallidos', v_intentos, 'bloqueado_hasta', v_bloqueo)
  where v_bloqueo is not null;

  -- Aviso al titular (decisión de dominio 1): quien bloquea su PIN es siempre su dueño.
  insert into public.notificaciones (perfil_id, tipo, detalle)
  select v_uid, 'pin_bloqueado',
         'Tu PIN de historia clínica se ha bloqueado quince minutos por demasiados intentos fallidos.'
  where v_bloqueo is not null;
end;
$$;

comment on function public.comprobar_pin_historia(text) is
  'Paso uno de dos (T-042). Coteja el PIN y deja confirmado el resultado: un intento '
  'fallido o una autorización de 60 s (tope 2). No devuelve nada, tampoco distinto en el '
  'acierto: el resultado solo se ve en desbloquear_historia(), en otra transacción. Un PIN '
  'nulo o vacío es un fallo.';

-- =========================================================================
-- d) desbloquear_historia() — paso dos del PIN, sin argumentos
-- =========================================================================

create function public.desbloquear_historia()
returns table (desbloqueado boolean, motivo text, caduca_en timestamptz, bloqueado_hasta timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_hasta   timestamptz;
  v_minutos smallint;
  v_caduca  timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  select ph.bloqueado_hasta into v_hasta
  from public.pines_historia ph
  where ph.perfil_id = v_uid
  for update;

  if not found then
    return query select false, 'sin_pin'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if v_hasta > now() then
    return query select false, 'bloqueado'::text, null::timestamptz, v_hasta;
    return;
  end if;

  -- Consumo de la autorización: sin PIN no hay intento, así que no toca el contador. Va
  -- por `update … where … > now()` y `found`, que un NULL no puede engañar.
  update public.pines_historia ph
     set desbloqueos_autorizados = ph.desbloqueos_autorizados - 1,
         actualizado_en = now()
   where ph.perfil_id = v_uid
     and ph.desbloqueos_autorizados > 0
     and ph.autorizado_hasta > now();

  if not found then
    return query select false, 'pin_incorrecto'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select coalesce(o.minutos_desbloqueo_historia, 15) into v_minutos
  from public.organizacion o
  limit 1;

  v_caduca := now() + make_interval(mins => coalesce(v_minutos, 15)::integer);

  -- Las columnas van cualificadas con alias: `caduca_en` y `bloqueado_hasta` son también
  -- parámetros de salida de esta función.
  update public.desbloqueos_historia d
     set revocado_en = now()
   where d.perfil_id = v_uid
     and d.revocado_en is null
     and d.caduca_en > now();

  insert into public.desbloqueos_historia (perfil_id, caduca_en)
  values (v_uid, v_caduca);

  return query select true, 'ok'::text, v_caduca, null::timestamptz;
end;
$$;

comment on function public.desbloquear_historia() is
  'Paso dos de dos (T-042). No recibe el PIN: abre la ventana solo si '
  'comprobar_pin_historia() dejó una autorización vigente, y la gasta.';

-- =========================================================================
-- e) comprobar_codigo_recuperacion(p_codigo) — paso uno del canje
-- =========================================================================

create function public.comprobar_codigo_recuperacion(p_codigo text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_centinela uuid;
  v_hasta     timestamptz;
  v_acertada  uuid;
  v_ok        boolean;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Perfil activo, no segundo factor: es la vía para quien NO tiene su segundo factor a mano.
  if (select public.rol_actual()) is null then
    raise exception 'El perfil no está activo.' using errcode = '42501';
  end if;

  if current_setting('transaction_read_only') = 'on' then
    raise exception 'La comprobación del código exige una transacción de escritura.'
      using errcode = '25006';
  end if;

  -- Misma clave que la activación y la regeneración de códigos (T-038): un lote nuevo
  -- entre los dos pasos queda bien ordenado respecto a este.
  perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));

  -- La centinela es la fila vigente más reciente y lleva el contador de todo el lote.
  select c.id, c.bloqueado_hasta into v_centinela, v_hasta
  from public.codigos_recuperacion_totp c
  where c.perfil_id = v_uid and c.usado_en is null
  order by c.creado_en desc, c.id desc
  limit 1
  for update;

  if not found then
    return;
  end if;

  if v_hasta > now() then
    return;
  end if;

  select c.id into v_acertada
  from public.codigos_recuperacion_totp c
  where c.perfil_id = v_uid
    and c.usado_en is null
    and extensions.crypt(p_codigo, c.codigo_hash) = c.codigo_hash
  limit 1;

  v_ok := v_acertada is not null;

  -- Una sola escritura, en la centinela, igual en el acierto y en el fallo.
  update public.codigos_recuperacion_totp c set
    intentos_fallidos = case when v_ok then 0 else least(c.intentos_fallidos + 1, 100) end,
    bloqueado_hasta   = case when v_ok then null
                             when c.intentos_fallidos + 1 >= 5 then now() + interval '15 minutes'
                             else null end,
    canje_autorizado_id    = case when v_ok then v_acertada end,
    canje_autorizado_hasta = case when v_ok then now() + interval '60 seconds' end
  where c.id = v_centinela;
end;
$$;

comment on function public.comprobar_codigo_recuperacion(text) is
  'Paso uno de dos (T-042). Coteja el código de recuperación y deja confirmado el '
  'resultado: un intento fallido en el lote, o la autorización de ese código durante 60 s. '
  'No devuelve nada, tampoco distinto en el acierto. Un código nulo o vacío es un fallo.';

-- =========================================================================
-- f) canjear_codigo_recuperacion() — paso dos del canje: es el canje
-- =========================================================================

create function public.canjear_codigo_recuperacion()
returns table (canjeado boolean, motivo text, bloqueado_hasta timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_centinela  uuid;
  v_hasta      timestamptz;
  v_autorizado uuid;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if (select public.rol_actual()) is null then
    raise exception 'El perfil no está activo.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));

  select c.id, c.bloqueado_hasta, c.canje_autorizado_id into v_centinela, v_hasta, v_autorizado
  from public.codigos_recuperacion_totp c
  where c.perfil_id = v_uid and c.usado_en is null
  order by c.creado_en desc, c.id desc
  limit 1
  for update;

  if not found then
    return query select false, 'sin_codigos'::text, null::timestamptz;
    return;
  end if;

  if v_hasta > now() then
    return query select false, 'bloqueado'::text, v_hasta;
    return;
  end if;

  -- Consumo de la autorización (tope 1: apunta a un solo código).
  update public.codigos_recuperacion_totp c
     set canje_autorizado_id = null,
         canje_autorizado_hasta = null
   where c.id = v_centinela
     and c.canje_autorizado_hasta > now();

  if not found then
    return query select false, 'codigo_invalido'::text, null::timestamptz;
    return;
  end if;

  -- El código autorizado tiene que seguir vigente: un lote nuevo o una reposición entre los
  -- dos pasos lo caduca.
  update public.codigos_recuperacion_totp c
     set usado_en = now()
   where c.id = v_autorizado
     and c.perfil_id = v_uid
     and c.usado_en is null;

  if not found then
    return query select false, 'codigo_invalido'::text, null::timestamptz;
    return;
  end if;

  -- Acierto: SQL no puede borrar auth.mfa_factors (privilegio de la Admin API). motivo = 'ok'
  -- es la señal para que lib/cuentas/totp.ts llame a deleteFactor DESPUÉS de esta función.
  -- Lo que sí hace aquí es reiniciar el contador del lote y dejar constancia doble.
  update public.codigos_recuperacion_totp c
     set intentos_fallidos = 0, bloqueado_hasta = null
   where c.perfil_id = v_uid and c.usado_en is null;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  values (v_uid, 'perfiles', 'TOTP_REPUESTO', v_uid::text, jsonb_build_object('via', 'codigo_recuperacion'));

  insert into public.notificaciones (perfil_id, tipo, detalle)
  values (v_uid, 'totp_repuesto',
          'Has canjeado un código de recuperación: tu verificación en dos pasos ha '
          'quedado invalidada y tendrás que volver a configurarla.');

  return query select true, 'ok'::text, null::timestamptz;
end;
$$;

comment on function public.canjear_codigo_recuperacion() is
  'Canjea un código de recuperación de TOTP (decisión de dominio 2). NO concede acceso '
  'por sí solo: desde SQL no se puede emitir aal2, y un "ok" no es una sesión. Si '
  'motivo=''ok'', lib/cuentas/totp.ts debe borrar el factor TOTP del usuario vía Admin '
  'API para forzar el re-enrolamiento — esta función deja la constancia, no el borrado. '
  'Paso dos de dos (T-042): no recibe el código; consume la autorización que dejó '
  'comprobar_codigo_recuperacion().';

-- =========================================================================
-- g) Permisos
-- =========================================================================

revoke execute on function public.comprobar_pin_historia(text) from public, anon;
grant  execute on function public.comprobar_pin_historia(text) to authenticated;
revoke execute on function public.desbloquear_historia() from public, anon;
grant  execute on function public.desbloquear_historia() to authenticated;
revoke execute on function public.comprobar_codigo_recuperacion(text) from public, anon;
grant  execute on function public.comprobar_codigo_recuperacion(text) to authenticated;
revoke execute on function public.canjear_codigo_recuperacion() from public, anon;
grant  execute on function public.canjear_codigo_recuperacion() to authenticated;

-- =========================================================================
-- h) Bloquear y fijar el PIN anulan la autorización pendiente del paso dos (R2.2 · A1-H2)
-- =========================================================================
-- Cuerpos idénticos a 20260822160000:441-468 (bloquear_historia) y 20260830090000:859-891
-- (fijar_pin_historia), con solo lo añadido. create or replace conserva grants y propietario.

create or replace function public.bloquear_historia()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  with revocados as (
    update public.desbloqueos_historia
       set revocado_en = now()
     where perfil_id = v_uid
       and revocado_en is null
       and caduca_en > now()
    returning 1
  )
  select count(*) into v_n from revocados;

  -- T-042: la autorización pendiente del paso dos también muere. El predicado evita una fila
  -- de auditoría vacía cuando no hay autorización que anular.
  update public.pines_historia ph
     set desbloqueos_autorizados = 0,
         autorizado_hasta = null,
         actualizado_en = now()
   where ph.perfil_id = v_uid
     and (ph.desbloqueos_autorizados > 0 or ph.autorizado_hasta is not null);

  return v_n;
end;
$$;

comment on function public.bloquear_historia() is
  'Cierra el candado de la historia para el usuario actual (ADR-026). Desde T-042, anula '
  'también la autorización pendiente del paso dos.';

create or replace function public.fijar_pin_historia(p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if not (select public.segundo_factor_verificado_recientemente()) then
    raise exception
      'Se exige el segundo factor (TOTP) verificado hace menos de cinco minutos para fijar el PIN.'
      using errcode = '42501';
  end if;

  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'El PIN debe ser exactamente seis dígitos.' using errcode = '22023';
  end if;

  insert into public.pines_historia (perfil_id, hash)
  values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)))
  on conflict (perfil_id) do update
    set hash                    = excluded.hash,
        intentos_fallidos       = 0,
        bloqueado_hasta         = null,
        desbloqueos_autorizados = 0,
        autorizado_hasta        = null,
        actualizado_en          = now();
end;
$$;

comment on function public.fijar_pin_historia(text) is
  'Fija el PIN de historia del usuario actual. Sin parámetro de perfil: nadie establece '
  'el PIN de otro (ADR-026). Exige segundo_factor_verificado_recientemente() (ALTA 2 de '
  'la revisión del 30-08-2026): sin eso, el bloqueo de cinco intentos era reseteable sin '
  'límite por el propio llamante. Desde T-042, anula también la autorización pendiente '
  'del paso dos.';
