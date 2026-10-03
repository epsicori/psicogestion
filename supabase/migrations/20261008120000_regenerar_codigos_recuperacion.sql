-- T-038 · Regenerar mis códigos de recuperación, con la contraseña cotejada en la base.
--
-- Qué añade (todo hacia delante; no se toca ninguna fila):
--   1 · public.intentos_regenerar_codigos — el contador de intentos fallidos de la
--       regeneración, por perfil. Sin grants ni políticas: solo lo tocan las funciones
--       definer de abajo. Lleva el disparador de auditoría genérico.
--   2 · public.registro_postgres_seguro() — de solo lectura: cierto si ningún ajuste de
--       registro de Postgres escribiría los parámetros de la llamada (la contraseña
--       viaja como parámetro de una RPC). La acción de servidor la llama ANTES de mandar
--       la contraseña (Q1 b del diseño).
--   3 · public.regenerar_codigos_recuperacion(p_contrasena) — coteja la contraseña del
--       llamante contra auth.users DENTRO de la base y, si coincide, caduca el lote y
--       genera diez códigos nuevos. Ninguna otra identidad se puede nombrar: no recibe
--       un perfil. NO lanza al fallar la contraseña (un raise desharía el contador).
--   4 · public.generar_codigos_recuperacion() — se vuelve a emitir con las mismas tres
--       guardas y los mismos textos, más (a) el candado de consejo que serializa con la
--       regeneración, (b) la regla Q3(B): se rechaza si ya hay un código vigente creado
--       en o después de la última reposición del TOTP, y (c) el aviso al titular
--       (P-3: toda generación avisa).
--
-- LO QUE NO HAY EN NINGUNA DE LAS DOS FUNCIONES, a propósito (lo comprueba el banco con
-- pg_get_functiondef): ningún bloque `exception`. Un `exception when others` abriría un
-- subtransacción y se podría tragar el fallo del aviso; y en la comparación de la
-- contraseña, un raise desharía el contador de intentos.

-- =========================================================================
-- 1 · Contador de intentos de la regeneración
-- =========================================================================
create table public.intentos_regenerar_codigos (
  perfil_id         uuid primary key references public.perfiles (id),
  intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta   timestamptz,
  actualizado_en    timestamptz not null default now()
);

comment on table public.intentos_regenerar_codigos is
  'Intentos fallidos de contraseña al regenerar códigos de recuperación (T-038). Una fila '
  'por perfil. Solo la escriben regenerar_codigos_recuperacion() y su definer; ningún rol '
  'de la API tiene grants ni políticas. Auditada con fn_auditar (sin verbo nuevo).';

alter table public.intentos_regenerar_codigos enable row level security;

revoke all on table public.intentos_regenerar_codigos from public, anon, authenticated, service_role;

create trigger auditar_intentos_regenerar_codigos
  after insert or update or delete on public.intentos_regenerar_codigos
  for each row execute function public.fn_auditar('perfil_id');

-- =========================================================================
-- 2 · registro_postgres_seguro()
-- =========================================================================
--
-- Falla cerrado: si un ajuste no se puede leer, el resultado es falso.
--   · log_statement = 'all' escribe cada sentencia, con sus parámetros.
--   · log_parameter_max_length_on_error > 0 escribe los parámetros de la sentencia que
--     falla (-1 = todos).
--   · log_min_duration_statement >= 0 escribe la sentencia con sus parámetros cuando
--     tarda; el cotejo bcrypt de diez códigos a coste 12 tarda segundos. Es seguro solo
--     si no se registran parámetros (log_parameter_max_length = 0).
--   · lo mismo para el muestreo (log_min_duration_sample con tasa > 0).
--   · auto_explain con umbral por debajo del coste de la llamada y parámetros del plan.
--   · pgaudit con log_parameter encendido y algo que auditar.
-- pg_stat_statements guarda el texto normalizado, sin valores: no cuenta.
create or replace function public.registro_postgres_seguro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'log_statement'), 'none') <> 'all'
    and coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'log_parameter_max_length_on_error')::bigint, 1) = 0
    and (
      coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'log_min_duration_statement')::bigint, 0) = -1
      or (select s.setting from pg_catalog.pg_settings s where s.name = 'log_parameter_max_length')::bigint = 0
    )
    and (
      coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'log_min_duration_sample')::bigint, 0) = -1
      or coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'log_statement_sample_rate')::numeric, 1) = 0
      or (select s.setting from pg_catalog.pg_settings s where s.name = 'log_parameter_max_length')::bigint = 0
    )
    and not (
      coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'auto_explain.log_min_duration')::bigint, -1)
        between 0 and 9999
      and coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'auto_explain.log_parameter_max_length')::bigint, -1) <> 0
    )
    and not (
      coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'pgaudit.log_parameter'), 'off') = 'on'
      and coalesce((select s.setting from pg_catalog.pg_settings s where s.name = 'pgaudit.log'), 'none') <> 'none'
    ),
    false
  );
$$;

comment on function public.registro_postgres_seguro() is
  'Cierto si ningún ajuste de registro de Postgres escribiría los parámetros de una RPC '
  '(T-038, Q1). La acción de servidor que manda la contraseña la llama antes y, si es '
  'falsa, no la manda. Solo lectura; falla cerrado.';

revoke execute on function public.registro_postgres_seguro() from public, anon;
grant  execute on function public.registro_postgres_seguro() to authenticated;

-- =========================================================================
-- 3 · regenerar_codigos_recuperacion(p_contrasena)
-- =========================================================================
--
-- Orden del cuerpo (importa, lo fija el diseño):
--   sesión → perfil activo → segundo factor reciente → candado → bloqueo → cotejo →
--   (fallo: contador y aviso | acierto: contador a cero, caducar, generar, avisar).
--
-- La contraseña se coteja con crypt() contra el hash de auth.users, y solo si el hash es
-- bcrypt de GoTrue; una cuenta sin contraseña, con hash vacío o de otro algoritmo cuenta
-- como contraseña incorrecta, sin excepción.
create or replace function public.regenerar_codigos_recuperacion(p_contrasena text)
returns table (motivo text, bloqueado_hasta timestamptz, codigos text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_intentos  smallint;
  v_hasta     timestamptz;
  v_hash      text;
  v_ok        boolean;
  v_bloqueo   timestamptz;
  v_codigos   text[] := '{}';
  v_codigo    text;
  i           integer;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if (select public.rol_actual()) is null then
    raise exception 'El perfil no está activo.' using errcode = '42501';
  end if;

  if not (select public.segundo_factor_verificado_recientemente()) then
    raise exception
      'Se exige el segundo factor (TOTP) verificado hace menos de cinco minutos para regenerar los códigos de recuperación.'
      using errcode = '42501';
  end if;

  -- Serializa con la activación y con otra regeneración del MISMO perfil: sin esto, dos
  -- llamadas concurrentes caducarían el mismo lote y dejarían veinte vigentes.
  perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));

  select it.intentos_fallidos, it.bloqueado_hasta
    into v_intentos, v_hasta
    from public.intentos_regenerar_codigos it
   where it.perfil_id = v_uid;

  -- El bloqueo se mira ANTES de comparar: con la contraseña buena también falla.
  if v_hasta is not null and v_hasta > now() then
    return query select 'bloqueado'::text, v_hasta, null::text[];
    return;
  end if;

  select u.encrypted_password into v_hash
    from auth.users u
   where u.id = v_uid;

  v_ok := coalesce(p_contrasena, '') <> ''
      and v_hash is not null
      and v_hash ~ '^\$2[ay]\$[0-9]{2}\$.{53}$'
      and extensions.crypt(p_contrasena, v_hash) = v_hash;

  if not coalesce(v_ok, false) then
    v_intentos := coalesce(v_intentos, 0) + 1;
    v_bloqueo  := case when v_intentos >= 5 then now() + interval '15 minutes' end;

    insert into public.intentos_regenerar_codigos (perfil_id, intentos_fallidos, bloqueado_hasta, actualizado_en)
    values (v_uid, v_intentos, v_bloqueo, now())
    on conflict (perfil_id) do update
      set intentos_fallidos = excluded.intentos_fallidos,
          bloqueado_hasta   = excluded.bloqueado_hasta,
          actualizado_en    = excluded.actualizado_en;

    if v_bloqueo is not null then
      insert into public.notificaciones (perfil_id, tipo, detalle)
      values (v_uid, 'regeneracion_codigos_bloqueada',
              'La regeneración de tus códigos de recuperación se ha bloqueado quince minutos '
              'por demasiados intentos con una contraseña errónea. Si no has sido tú, avisa '
              'al administrador.');
    end if;

    return query select case when v_bloqueo is not null then 'bloqueado' else 'contrasena_incorrecta' end::text,
                        v_bloqueo,
                        null::text[];
    return;
  end if;

  -- Acierto: el contador se limpia solo si estaba sucio (no se escribe una fila de más).
  if coalesce(v_intentos, 0) > 0 or v_hasta is not null then
    update public.intentos_regenerar_codigos
       set intentos_fallidos = 0, bloqueado_hasta = null, actualizado_en = now()
     where perfil_id = v_uid;
  end if;

  update public.codigos_recuperacion_totp
     set usado_en = now()
   where perfil_id = v_uid
     and usado_en is null;

  for i in 1 .. 10 loop
    v_codigo := upper(encode(extensions.gen_random_bytes(5), 'hex'));

    insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
    values (v_uid, extensions.crypt(v_codigo, extensions.gen_salt('bf', 12)));

    v_codigos := v_codigos || v_codigo;
  end loop;

  insert into public.notificaciones (perfil_id, tipo, detalle)
  values (v_uid, 'codigos_regenerados',
          'Se han generado códigos de recuperación nuevos; los anteriores ya no valen. '
          'Si no has sido tú, avisa al administrador.');

  return query select 'ok'::text, null::timestamptz, v_codigos;
end;
$$;

comment on function public.regenerar_codigos_recuperacion(text) is
  'Regenera los códigos de recuperación del propio llamante cotejando su contraseña en la '
  'base (T-038). No recibe ningún perfil. Contraseña errónea o bloqueo: devuelve motivo, '
  'no lanza (un raise desharía el contador de intentos). Cinco fallos bloquean quince '
  'minutos. Acierto: caduca el lote, genera diez y avisa al titular.';

revoke execute on function public.regenerar_codigos_recuperacion(text) from public, anon;
grant  execute on function public.regenerar_codigos_recuperacion(text) to authenticated;

-- =========================================================================
-- 4 · generar_codigos_recuperacion() — la ACTIVACIÓN, ya sin ser atajo
-- =========================================================================
--
-- Mismas tres guardas y mismos textos que la versión de 20260830090000. Se añaden el
-- candado de consejo (el mismo que la regeneración), la regla Q3(B) y el aviso (P-3).
--
-- Q3(B): quien ya tiene un código vigente creado en o después de su última reposición
-- de TOTP no «activa»: regenera, y eso exige contraseña, desde Mi cuenta. El `>=` falla
-- cerrado en el empate. Sin ninguna reposición, el máximo es -infinity y cualquier lote
-- vigente bloquea la activación.
create or replace function public.generar_codigos_recuperacion()
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_codigo text;
  i        integer;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if (select public.rol_actual()) is null then
    raise exception 'El perfil no está activo.' using errcode = '42501';
  end if;

  if not (select public.segundo_factor_verificado_recientemente()) then
    raise exception
      'Se exige el segundo factor (TOTP) verificado hace menos de cinco minutos para generar códigos de recuperación.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));

  if exists (
    select 1
      from public.codigos_recuperacion_totp c
     where c.perfil_id = v_uid
       and c.usado_en is null
       and c.creado_en >= coalesce(
             (select max(a.ocurrido_en)
                from public.auditoria a
               where a.operacion = 'TOTP_REPUESTO'
                 and a.registro_id = v_uid::text),
             '-infinity'::timestamptz)
  ) then
    raise exception
      'Ya tienes códigos de recuperación vigentes: se regeneran desde Mi cuenta, con tu contraseña.'
      using errcode = '42501';
  end if;

  -- El lote anterior sin usar queda caducado: solo la última tanda es válida.
  update public.codigos_recuperacion_totp
     set usado_en = now()
   where perfil_id = v_uid
     and usado_en is null;

  for i in 1 .. 10 loop
    v_codigo := upper(encode(extensions.gen_random_bytes(5), 'hex'));

    insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
    values (v_uid, extensions.crypt(v_codigo, extensions.gen_salt('bf', 12)));

    return next v_codigo;
  end loop;

  insert into public.notificaciones (perfil_id, tipo, detalle)
  values (v_uid, 'codigos_regenerados',
          'Se han generado códigos de recuperación nuevos; los anteriores ya no valen. '
          'Si no has sido tú, avisa al administrador.');

  return;
end;
$$;

comment on function public.generar_codigos_recuperacion() is
  'Activación: diez códigos de recuperación de TOTP en claro, mostrados una sola vez '
  '(ADR-039). Exige perfil activo y segundo_factor_verificado_recientemente(). Desde T-038 '
  'se rechaza si ya hay un código vigente creado en o después de la última reposición del '
  'TOTP (la regeneración exige contraseña y vive en regenerar_codigos_recuperacion()), y '
  'toda generación deja un aviso al titular.';
