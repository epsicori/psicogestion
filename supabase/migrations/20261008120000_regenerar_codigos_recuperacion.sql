-- T-038 · Regenerar mis códigos de recuperación, con la contraseña cotejada en la base.
--
-- Qué añade (todo hacia delante; no se toca ninguna fila):
--   1 · public.intentos_regenerar_codigos — por perfil, el contador de intentos fallidos
--       de la regeneración y la autorización vigente (un contador de 0 a 2 con caducidad de
--       60 s). Sin grants ni políticas: solo lo tocan las funciones definer de abajo. Lleva
--       el disparador de auditoría genérico.
--   2 · public.evaluar_registro_postgres(jsonb) y public.registro_postgres_seguro() —
--       cierto si ningún ajuste de registro de Postgres escribiría los parámetros de la
--       llamada (la contraseña viaja como parámetro de una RPC). La acción de servidor lo
--       pregunta ANTES de mandar la contraseña. Ver la nota de la sección.
--   3 · public.comprobar_contrasena_para_regenerar(text) y
--       public.regenerar_codigos_recuperacion() — la regeneración en DOS pasos (DR1):
--         · el paso uno coteja la contraseña del llamante contra auth.users DENTRO de la
--           base y deja confirmado su resultado, que no devuelve (una autorización de
--           60 s si acierta, un intento fallido si no), con una única escritura igual para
--           el acierto y el fallo;
--         · el paso dos, sin parámetros, solo gasta una autorización ya confirmada y, si la
--           hay, caduca el lote y genera diez códigos nuevos.
--       Así el cliente no puede ver el resultado de la comparación dentro de la
--       transacción que la hace: ni con un GET, ni con un objeto singular y un filtro, ni
--       con ninguna cabecera de PostgREST. Ninguna recibe un perfil.
--   4 · public.generar_codigos_recuperacion() — se vuelve a emitir con las mismas tres
--       guardas y los mismos textos, más (a) el candado de consejo que serializa con la
--       regeneración, (b) la regla Q3(B): se rechaza si ya hay un código vigente creado
--       en o después de la última reposición del TOTP, y (c) el aviso al titular
--       (P-3: toda generación avisa).
--   5 · public.registrar_reposicion_totp(uuid) — se vuelve a emitir: rechaza la reposición
--       propia (A-H3) y la guarda de rol falla cerrado con un rol nulo.
--
-- LO QUE NO HAY EN NINGUNA DE LAS TRES FUNCIONES DE CÓDIGOS, a propósito (lo comprueba el
-- banco con pg_get_functiondef): ningún bloque de captura de excepciones. Abriría una
-- subtransacción y se podría tragar el fallo del aviso.

-- =========================================================================
-- 1 · Contador de intentos y autorización de la regeneración
-- =========================================================================
create table public.intentos_regenerar_codigos (
  perfil_id                  uuid primary key references public.perfiles (id),
  intentos_fallidos          smallint not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta            timestamptz,
  regeneraciones_autorizadas smallint not null default 0
    check (regeneraciones_autorizadas between 0 and 2),
  autorizado_hasta           timestamptz,
  actualizado_en             timestamptz not null default now()
);

comment on table public.intentos_regenerar_codigos is
  'Intentos fallidos de contraseña y autorización vigente al regenerar códigos de '
  'recuperación (T-038). Una fila por perfil. Solo la escriben las funciones definer '
  'comprobar_contrasena_para_regenerar() y regenerar_codigos_recuperacion(); ningún rol '
  'de la API tiene grants ni políticas. Auditada con fn_auditar (sin verbo nuevo).';

alter table public.intentos_regenerar_codigos enable row level security;

revoke all on table public.intentos_regenerar_codigos from public, anon, authenticated, service_role;

create trigger auditar_intentos_regenerar_codigos
  after insert or update or delete on public.intentos_regenerar_codigos
  for each row execute function public.fn_auditar('perfil_id');

-- =========================================================================
-- 2 · Registro de Postgres: evaluador puro y su envoltorio
-- =========================================================================
--
-- El evaluador es una función PURA del mapa nombre → setting (el texto de
-- pg_settings.setting, en sus unidades: ms para los umbrales y el statement_timeout). Así
-- el banco prueba cada regla con un mapa, también las de ajustes que `postgres` no puede
-- fijar con SET.
--
-- No es «falla cerrado» sin más: cada regla dice qué hace con lo que falta o no se lee.
--   N0 · falta una clave del núcleo (o el mapa es nulo): inseguro.
--   N1 · hay una extensión cargada (en las listas de precarga, o con alguna de sus claves)
--        y falta alguna de sus claves: inseguro.
--   C1-C8 · cada condición se evalúa con coalesce(<condición>, true): un valor nulo o
--        ilegible es inseguro. Un valor que no se puede convertir lanza al hacer el cast;
--        en la acción, un error de la RPC ya cuenta como inseguro.
--
-- Un umbral de duración solo es seguro si está apagado (-1) o si el statement_timeout en
-- vigor corta ANTES: una sentencia cancelada no llega al registro de duración ni a
-- ExecutorEnd. El statement_timeout se lee en la misma llamada, no se supone (DR7).
--
-- log_statement en mod o ddl y log_min_error_statement son seguros: PostgREST manda los
-- argumentos como parámetro ligado ($1), y esas reglas no escriben los valores.
-- pg_stat_statements guarda el texto normalizado, sin valores: no cuenta.
create or replace function public.evaluar_registro_postgres(p_ajustes jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cargadas text[];
  v_ae       boolean;
  v_pa       boolean;
  v_st       bigint;
  v_lpml     bigint;
begin
  -- N0
  if not coalesce(p_ajustes ?& array[
       'log_statement', 'log_parameter_max_length', 'log_parameter_max_length_on_error',
       'log_min_duration_statement', 'log_min_duration_sample', 'log_statement_sample_rate',
       'log_transaction_sample_rate', 'debug_print_parse', 'debug_print_rewritten',
       'debug_print_plan', 'statement_timeout', 'shared_preload_libraries',
       'session_preload_libraries', 'local_preload_libraries'
     ], false) then
    return false;
  end if;

  if p_ajustes->>'shared_preload_libraries' is null
     or p_ajustes->>'session_preload_libraries' is null
     or p_ajustes->>'local_preload_libraries' is null then
    return false;
  end if;

  -- N1 · las bibliotecas cargadas: comillas, espacios, ruta y mayúsculas fuera.
  select coalesce(array_agg(lower(regexp_replace(btrim(btrim(x), '"'), '^.*/', ''))), '{}')
    into v_cargadas
    from unnest(string_to_array(
           (p_ajustes->>'shared_preload_libraries') || ',' ||
           (p_ajustes->>'session_preload_libraries') || ',' ||
           (p_ajustes->>'local_preload_libraries'), ',')) as x;

  v_ae := 'auto_explain' = any (v_cargadas) or p_ajustes ? 'auto_explain.log_min_duration';
  v_pa := 'pgaudit' = any (v_cargadas) or p_ajustes ? 'pgaudit.log';

  if v_ae and not coalesce(p_ajustes ?& array[
       'auto_explain.log_min_duration', 'auto_explain.log_parameter_max_length'], false) then
    return false;
  end if;
  if v_pa and not coalesce(p_ajustes ?& array[
       'pgaudit.log', 'pgaudit.log_parameter', 'pgaudit.role'], false) then
    return false;
  end if;

  v_st   := (p_ajustes->>'statement_timeout')::bigint;
  v_lpml := (p_ajustes->>'log_parameter_max_length')::bigint;

  -- alcanzable(u) := u >= 0 and not (st > 0 and st <= u)

  -- C1 · todas las sentencias, con sus parámetros
  if coalesce((p_ajustes->>'log_statement') = 'all', true) then
    return false;
  end if;

  -- C2 · los parámetros de la sentencia que falla
  if coalesce((p_ajustes->>'log_parameter_max_length_on_error')::bigint <> 0, true) then
    return false;
  end if;

  -- C3 · sentencias lentas
  if coalesce(((p_ajustes->>'log_min_duration_statement')::bigint >= 0
               and not (v_st > 0 and v_st <= (p_ajustes->>'log_min_duration_statement')::bigint))
              and v_lpml <> 0, true) then
    return false;
  end if;

  -- C4 · muestreo de sentencias lentas
  if coalesce(((p_ajustes->>'log_min_duration_sample')::bigint >= 0
               and not (v_st > 0 and v_st <= (p_ajustes->>'log_min_duration_sample')::bigint))
              and (p_ajustes->>'log_statement_sample_rate')::numeric > 0
              and v_lpml <> 0, true) then
    return false;
  end if;

  -- C5 · muestreo de transacciones (escribe todas las sentencias de la muestra)
  if coalesce((p_ajustes->>'log_transaction_sample_rate')::numeric > 0 and v_lpml <> 0, true) then
    return false;
  end if;

  -- C6 · un plan a medida lleva los parámetros como constantes
  if coalesce((p_ajustes->>'debug_print_parse') = 'on'
              or (p_ajustes->>'debug_print_rewritten') = 'on'
              or (p_ajustes->>'debug_print_plan') = 'on', true) then
    return false;
  end if;

  -- C7 · auto_explain
  if v_ae and coalesce(((p_ajustes->>'auto_explain.log_min_duration')::bigint >= 0
                        and not (v_st > 0 and v_st <= (p_ajustes->>'auto_explain.log_min_duration')::bigint))
                       and (p_ajustes->>'auto_explain.log_parameter_max_length')::bigint <> 0, true) then
    return false;
  end if;

  -- C8 · pgaudit con parámetros y algo que auditar
  if v_pa and coalesce((p_ajustes->>'pgaudit.log_parameter') = 'on'
                       and ((p_ajustes->>'pgaudit.log') <> 'none'
                            or (p_ajustes->>'pgaudit.role') <> ''), true) then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.evaluar_registro_postgres(jsonb) is
  'Cierto si los ajustes de registro del mapa nombre -> setting no escribirían los '
  'parámetros de una RPC (T-038). Pura: solo la llama su dueño (el banco) y el envoltorio '
  'registro_postgres_seguro(). Un valor que falta, es nulo o no se lee cuenta como '
  'inseguro. Un umbral de duración es seguro solo si está apagado o si el statement_timeout '
  'en vigor corta antes. log_statement en mod o ddl y log_min_error_statement son seguros '
  'porque PostgREST manda los argumentos como parámetro ligado.';

revoke execute on function public.evaluar_registro_postgres(jsonb) from public, anon, authenticated, service_role;

create or replace function public.registro_postgres_seguro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.evaluar_registro_postgres(
    (select jsonb_object_agg(s.name, s.setting)
       from pg_catalog.pg_settings s
      where s.name = any (array[
        'log_statement', 'log_parameter_max_length', 'log_parameter_max_length_on_error',
        'log_min_duration_statement', 'log_min_duration_sample', 'log_statement_sample_rate',
        'log_transaction_sample_rate', 'debug_print_parse', 'debug_print_rewritten',
        'debug_print_plan', 'statement_timeout', 'shared_preload_libraries',
        'session_preload_libraries', 'local_preload_libraries',
        'auto_explain.log_min_duration', 'auto_explain.log_parameter_max_length',
        'pgaudit.log', 'pgaudit.log_parameter', 'pgaudit.role'
      ])));
$$;

comment on function public.registro_postgres_seguro() is
  'Cierto si ningún ajuste de registro de Postgres escribiría los parámetros de una RPC '
  '(T-038, Q1). La acción de servidor que manda la contraseña la llama antes y, si es '
  'falsa o falla, no la manda. Lee el statement_timeout de la propia transacción del '
  'llamante. Solo lectura; un ajuste ilegible es inseguro.';

revoke execute on function public.registro_postgres_seguro() from public, anon;
grant  execute on function public.registro_postgres_seguro() to authenticated;

-- =========================================================================
-- 3a · Paso uno: comprobar_contrasena_para_regenerar(p_contrasena)
-- =========================================================================
--
-- Orden del cuerpo (importa, lo fija el diseño):
--   guardas de sesión → solo lectura → candado → bloqueo → cotejo → UNA escritura.
--
-- La contraseña se coteja con crypt() contra el hash de auth.users, y solo si el hash es
-- bcrypt de GoTrue; una cuenta sin contraseña, con hash vacío o de otro algoritmo cuenta
-- como contraseña incorrecta, sin excepción.
create or replace function public.comprobar_contrasena_para_regenerar(p_contrasena text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_hasta   timestamptz;
  v_hash    text;
  v_ok      boolean;
  v_bloqueo timestamptz;
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

  if current_setting('transaction_read_only') = 'on' then
    raise exception 'La comprobación de la contraseña exige una transacción de escritura.'
      using errcode = '25006';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));

  select it.bloqueado_hasta
    into v_hasta
    from public.intentos_regenerar_codigos it
   where it.perfil_id = v_uid;

  -- El bloqueo se mira ANTES de comparar: con la contraseña buena tampoco hace nada.
  if v_hasta is not null and v_hasta > now() then
    return;
  end if;

  select u.encrypted_password into v_hash
    from auth.users u
   where u.id = v_uid;

  v_ok := coalesce(p_contrasena, '') <> ''
      and v_hash is not null
      and v_hash ~ '^\$2[ay]\$[0-9]{2}\$.{53}$'
      and extensions.crypt(p_contrasena, v_hash) = v_hash;
  v_ok := coalesce(v_ok, false);

  -- Una sola sentencia de escritura, la misma para el acierto y el fallo: la diferencia
  -- está en los valores, no en el camino. El limite de cien evita que ninguna rama
  -- desborde el smallint.
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

  if v_bloqueo is not null then
    insert into public.notificaciones (perfil_id, tipo, detalle)
    values (v_uid, 'regeneracion_codigos_bloqueada',
            'La regeneración de tus códigos de recuperación se ha bloqueado quince minutos '
            'por demasiados intentos con una contraseña errónea. Si no has sido tú, avisa '
            'al administrador.');
  end if;
end;
$$;

comment on function public.comprobar_contrasena_para_regenerar(text) is
  'Paso uno de dos (T-038, ronda 2). Coteja la contraseña y deja confirmado el resultado: '
  'un intento fallido o una autorización de 60 s. No devuelve nada, ni distinto en el '
  'acierto: el resultado solo se ve en una transacción posterior.';

revoke execute on function public.comprobar_contrasena_para_regenerar(text) from public, anon;
grant  execute on function public.comprobar_contrasena_para_regenerar(text) to authenticated;

-- =========================================================================
-- 3b · Paso dos: regenerar_codigos_recuperacion()
-- =========================================================================
--
-- Orden del cuerpo: guardas → candado → bloqueo → consumo de UNA autorización → caducar el
-- lote → generar → avisar. El consumo va ANTES de caducar el lote: el candado de fila de
-- la autorización es lo que serializa dos regeneraciones del mismo perfil.
create or replace function public.regenerar_codigos_recuperacion()
returns table (motivo text, bloqueado_hasta timestamptz, codigos text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_hasta   timestamptz;
  v_codigos text[] := '{}';
  v_codigo  text;
  i         integer;
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

  -- Serializa con la activación y con otra regeneración del MISMO perfil.
  perform pg_advisory_xact_lock(hashtextextended('codigos_recuperacion:' || v_uid::text, 0));

  select it.bloqueado_hasta
    into v_hasta
    from public.intentos_regenerar_codigos it
   where it.perfil_id = v_uid;

  if v_hasta is not null and v_hasta > now() then
    return query select 'bloqueado'::text, v_hasta, null::text[];
    return;
  end if;

  -- Gasta una autorización ya confirmada por el paso uno. Sin ella no hay contraseña
  -- comprobada, y este paso no toca el contador de intentos.
  update public.intentos_regenerar_codigos it
     set regeneraciones_autorizadas = it.regeneraciones_autorizadas - 1,
         actualizado_en = now()
   where it.perfil_id = v_uid
     and it.regeneraciones_autorizadas > 0
     and it.autorizado_hasta > now();

  if not found then
    return query select 'contrasena_incorrecta'::text, null::timestamptz, null::text[];
    return;
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

comment on function public.regenerar_codigos_recuperacion() is
  'Paso dos de dos (T-038, ronda 2). Regenera los códigos de recuperación del propio '
  'llamante si el paso uno dejó una autorización vigente (60 s, hasta dos): caduca el '
  'lote, genera diez y avisa al titular. Sin autorización devuelve contrasena_incorrecta; '
  'con el bloqueo vigente, bloqueado. No recibe ningún perfil ni la contraseña y no lanza '
  'por el motivo.';

revoke execute on function public.regenerar_codigos_recuperacion() from public, anon;
grant  execute on function public.regenerar_codigos_recuperacion() to authenticated;

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

-- =========================================================================
-- 5 · registrar_reposicion_totp() — rechaza la reposición propia (A-H3)
-- =========================================================================
--
-- El cuerpo de 20260830090000 con dos cambios: la guarda de rol compara con
-- `is distinct from` (un rol nulo ya no se la salta: `<>` con nulo daba nulo y pasaba) y
-- un administrador no repone su PROPIO TOTP. Sin lo segundo, quien robase una sesión aal2
-- se fabricaría la excepción de la regla Q3(B) de la activación.
create or replace function public.registrar_reposicion_totp(p_perfil_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario then
    raise exception 'Solo un administrador puede reponer el TOTP de otro perfil.' using errcode = '42501';
  end if;

  if p_perfil_id = v_actor then
    raise exception 'Un administrador no puede reponer su propio TOTP: lo repone otro administrador o el titular con un código de recuperación.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.perfiles p where p.id = p_perfil_id) then
    raise exception 'El perfil % no existe.', p_perfil_id using errcode = '23503';
  end if;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  values (v_actor, 'perfiles', 'TOTP_REPUESTO', p_perfil_id::text,
          jsonb_build_object('repuesto_por', v_actor, 'via', 'administrador'));

  insert into public.notificaciones (perfil_id, tipo, detalle)
  values (p_perfil_id, 'totp_repuesto',
          'Un administrador ha repuesto tu verificación en dos pasos. Tendrás que '
          'volver a configurarla la próxima vez que entres.');
end;
$$;

comment on function public.registrar_reposicion_totp(uuid) is
  'Audita y avisa al titular de una reposición de TOTP hecha por un administrador '
  '(ADR-039, decisión de dominio 1). El borrado del factor lo hace la Admin API en '
  'lib/cuentas/totp.ts, nunca esta función. Rechaza la reposición propia (T-038, A-H3).';

revoke execute on function public.registrar_reposicion_totp(uuid) from public, anon;
grant  execute on function public.registrar_reposicion_totp(uuid) to authenticated;
