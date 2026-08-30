-- =========================================================================
-- T-006 (corte DB) · Invitación, baja, reposición de TOTP y códigos de recuperación
-- =========================================================================
--
-- Esta es la MITAD DE BASE DE DATOS de T-006. La pantalla (invitación, primer acceso,
-- PIN bloqueado, ajustes de reposición y baja, canje de código) es T-006b, que va al
-- carril de MiniMax con su propio corte en minimax/cortes/T-006.md.
--
-- Lo que YA EXISTE y esta migración NO reescribe: fijar_pin_historia(), bloquear_historia(),
-- prolongar_desbloqueo(), desbloqueo_vigente(), historia_desbloqueada() (T-002,
-- 20260822160000) y desbloquear_historia() en su versión de T-004 (20260829150000). Este
-- ticket las LLAMA. La única excepción es desbloquear_historia(), que se vuelve a crear
-- MÁS ABAJO con una única línea nueva —el aviso al titular al bloquear por intentos
-- (decisión de dominio 1, ADR-026)— y el resto de su cuerpo intacto.
--
-- Tres decisiones de dominio cerradas por el propietario y no reabiertas aquí:
--   1. Notificación in-app al titular (ADR-026 al bloquear PIN, ADR-039 al reponer TOTP).
--      Tabla nueva `notificaciones`, mecanismo propio, nunca correo.
--   2. Canjear un código de recuperación de TOTP BORRA el factor y obliga a reenrolar.
--      No concede acceso por sí solo: desde SQL no se puede emitir aal2.
--   3. La autobaja de administrador está permitida sin restricción especial: la base ya
--      impide quedarse sin ningún administrador activo
--      (fn_impedir_baja_ultimo_administrador(), T-001).
--
-- Referencias: architecture.md §Roles, §Candado. ADR-026, ADR-032, ADR-033, ADR-038,
-- ADR-039. Constitución, regla 6 (nada clínico ni económico se borra; esto no es ni lo
-- uno ni lo otro, así que `dar_de_baja_perfil` SÍ puede borrar de `pines_historia`).


-- =========================================================================
-- 1 · notificaciones — aviso in-app al titular (decisión de dominio 1)
-- =========================================================================
--
-- Mecanismo de entrega propio, nunca correo (ADR-038 solo cubre el correo de cuenta de
-- Supabase Auth). Esquema mínimo: quién, qué tipo, qué dice, cuándo se creó, cuándo se
-- leyó. NADIE tiene INSERT directo —igual que auditoria—: solo las funciones definer de
-- más abajo escriben aquí, ejecutándose como su propietario (postgres), que está exento
-- de RLS mientras la tabla no lleve FORCE.
create table public.notificaciones (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references public.perfiles (id) on delete cascade,
  tipo       text not null check (length(trim(tipo)) > 0),
  detalle    text not null check (length(trim(detalle)) > 0),
  creado_en  timestamptz not null default now(),
  leida_en   timestamptz
);

create index notificaciones_perfil_no_leidas_idx
  on public.notificaciones (perfil_id, creado_en desc)
  where leida_en is null;

comment on table public.notificaciones is
  'Aviso in-app al titular (decisión de dominio 1 de T-006; ADR-026, ADR-039). NADIE '
  'tiene insert directo: solo lo insertan las funciones security definer de esta '
  'migración, mismo patrón que auditoria. El titular puede marcar como leída SU '
  'PROPIA fila, y solo esa columna — fn_proteger_notificacion() lo hace cumplir.';

comment on column public.notificaciones.tipo is
  'Discriminador libre para la interfaz (p. ej. "pin_bloqueado", "totp_repuesto"). '
  'No es un enum a propósito: quien añade un aviso nuevo no necesita otra migración.';

-- El titular no puede reescribir el contenido de su propio aviso: solo marcarlo como
-- leído. Sin este disparador, la política de UPDATE de más abajo (que solo mira
-- perfil_id en el USING/WITH CHECK) dejaría tocar tipo, detalle o creado_en.
create or replace function public.fn_proteger_notificacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.perfil_id is distinct from old.perfil_id
     or new.tipo is distinct from old.tipo
     or new.detalle is distinct from old.detalle
     or new.creado_en is distinct from old.creado_en then
    raise exception
      'Una notificación solo se puede actualizar en su columna leida_en.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.fn_proteger_notificacion() is
  'El titular marca sus notificaciones como leídas; ninguna otra columna es editable '
  '(decisión de dominio 1 de T-006).';

create trigger proteger_notificacion
  before update on public.notificaciones
  for each row
  execute function public.fn_proteger_notificacion();

alter table public.notificaciones enable row level security;

create policy notificaciones_lectura_propia on public.notificaciones
  for select to authenticated
  using (perfil_id = (select auth.uid()));

create policy notificaciones_marcar_leida_propia on public.notificaciones
  for update to authenticated
  using      (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));

-- Select y update para authenticated; INSERT y DELETE nunca — eso es lo que hace que
-- "nadie tiene insert directo" sea cierto también a nivel de grant y no solo de política.
revoke all on table public.notificaciones from public, anon, service_role;
grant select, update on table public.notificaciones to authenticated;


-- =========================================================================
-- 2 · codigos_recuperacion_totp — mismo régimen que pines_historia
-- =========================================================================
--
-- RLS activo, CERO políticas, CERO grants a authenticated: con RLS activo y sin un solo
-- privilegio concedido, la tabla deniega dos veces. Solo la leen y la escriben las
-- funciones security definer de más abajo, que corren como postgres.
create table public.codigos_recuperacion_totp (
  id                uuid primary key default gen_random_uuid(),
  perfil_id         uuid not null references public.perfiles (id) on delete cascade,
  -- bcrypt vía extensions.crypt(), igual que el PIN: el bloqueo por intentos sostiene
  -- la seguridad de un código corto, no la función de derivación.
  codigo_hash       text not null,
  creado_en         timestamptz not null default now(),
  usado_en          timestamptz,
  intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta   timestamptz
);

-- Solo hace falta indexar el lote vigente: es lo único que consulta canjear_codigo_recuperacion().
create index codigos_recuperacion_totp_vigentes_idx
  on public.codigos_recuperacion_totp (perfil_id)
  where usado_en is null;

comment on table public.codigos_recuperacion_totp is
  'Códigos de recuperación de un solo uso del segundo factor (ADR-039). Régimen '
  'idéntico a pines_historia: RLS activo, CERO políticas, CERO grants a authenticated. '
  'Canjear un código BORRA el factor TOTP (decisión de dominio 2): no se puede desde '
  'SQL, ver el comentario de canjear_codigo_recuperacion().';

comment on column public.codigos_recuperacion_totp.intentos_fallidos is
  'Contador COMPARTIDO por todo el lote vigente de diez códigos: lo lleva la fila más '
  'reciente sin usar (el "centinela"), para no escribir las diez filas en cada intento '
  'fallido. Ver canjear_codigo_recuperacion().';

alter table public.codigos_recuperacion_totp enable row level security;
-- CERO políticas, a propósito. Ver comentario de la tabla.

revoke all on table public.codigos_recuperacion_totp from public, anon, authenticated, service_role;


-- =========================================================================
-- 3 · El regalo de privilegios de Supabase, cortado en las dos tablas nuevas
-- =========================================================================
--
-- Hallazgo de T-004 (docs/state.md): Supabase concede TRUNCATE, TRIGGER y REFERENCES
-- sobre las tablas nuevas sin pedirlo. El `alter default privileges` de T-004 cubre lo
-- que se cree DESPUÉS de aquella migración —esta incluida—, pero se revoca también aquí
-- de forma explícita: así se ve sin tener que ir a comprobar una migración anterior.
revoke truncate, trigger, references
  on table public.notificaciones, public.codigos_recuperacion_totp
  from anon, authenticated, service_role;


-- =========================================================================
-- 4 · fn_auditar() sobre codigos_recuperacion_totp — no hereda el disparador solo
-- =========================================================================
--
-- El bucle `do $$` de T-004 (20260829150000) recorre `pg_class` UNA VEZ, en el momento en
-- que esa migración corrió: una tabla que nace después —esta— no hereda el disparador
-- de auditoría automáticamente. Se cuelga a mano, recortando `codigo_hash` igual que se
-- recorta `pines_historia.hash`.
create trigger auditar_codigos_recuperacion_totp
  after insert or update or delete on public.codigos_recuperacion_totp
  for each row execute function public.fn_auditar('id', 'codigo_hash');


-- =========================================================================
-- 5 · auditoria_operacion_check se ensancha — hacia delante, sin tocar una fila
-- =========================================================================
alter table public.auditoria drop constraint if exists auditoria_operacion_check;
alter table public.auditoria add constraint auditoria_operacion_check
  check (operacion in (
    'INSERT', 'UPDATE', 'DELETE',
    'SESION', 'BUSQUEDA', 'PIN_FALLIDO', 'PIN_BLOQUEADO', 'TITULARIDAD',
    'CUENTA_INVITADA',  -- alta por invitación (T-006)
    'CUENTA_BAJA',      -- baja de un perfil (ADR-032)
    'TOTP_REPUESTO'     -- reposición de TOTP, por administrador o por código de recuperación (ADR-039)
  ));


-- =========================================================================
-- 6 · estado_de_cuenta() — lo que el primer acceso necesita saber de sí mismo
-- =========================================================================
create or replace function public.estado_de_cuenta()
returns table (
  rol                   public.rol_usuario,
  estado                public.estado_perfil,
  requiere_pin          boolean,
  tiene_pin             boolean,
  desbloqueo_caduca_en  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.rol,
    p.estado,
    (p.rol <> 'tecnico_administrativo'::public.rol_usuario) as requiere_pin,
    exists (
      select 1 from public.pines_historia ph where ph.perfil_id = p.id
    ) as tiene_pin,
    (
      select max(d.caduca_en)
      from public.desbloqueos_historia d
      where d.perfil_id = p.id
        and d.revocado_en is null
        and d.caduca_en > now()
    ) as desbloqueo_caduca_en
  from public.perfiles p
  where p.id = (select auth.uid());
$$;

comment on function public.estado_de_cuenta() is
  'Estado de la cuenta del usuario actual para decidir el paso pendiente del primer '
  'acceso (contraseña → TOTP → PIN) y para la pantalla de PIN. El técnico '
  'administrativo no requiere PIN (ADR-026).';


-- =========================================================================
-- 7 · Invitación — preparar_invitacion() y registrar_invitacion()
-- =========================================================================
--
-- El alta de auth.users/perfiles la hace fn_crear_perfil_de_usuario() (T-002/enmienda
-- de T-002), disparada bajo supabase_auth_admin con actor_id nulo cuando la aplicación
-- llama a auth.admin.inviteUserByEmail(). Estas dos funciones son las que dejan
-- constancia, en la sesión REAL del administrador, de que hubo una invitación: la
-- primera valida ANTES de gastar el envío de correo; la segunda audita DESPUÉS de que
-- el alta ya haya ocurrido.
create or replace function public.preparar_invitacion(p_rol public.rol_usuario, p_centro_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select public.rol_actual()) <> 'administrador'::public.rol_usuario then
    raise exception 'Solo un administrador puede invitar cuentas nuevas.' using errcode = '42501';
  end if;

  if p_rol = 'tecnico_administrativo'::public.rol_usuario then
    if p_centro_id is null then
      raise exception 'El técnico administrativo exige un centro (ADR-033).' using errcode = '23514';
    end if;
    if not exists (select 1 from public.centros c where c.id = p_centro_id) then
      raise exception 'El centro % no existe.', p_centro_id using errcode = '23503';
    end if;
  end if;
end;
$$;

comment on function public.preparar_invitacion(public.rol_usuario, uuid) is
  'Validación previa a auth.admin.inviteUserByEmail(): solo administrador, y técnico '
  'administrativo exige centro existente (ADR-033). No escribe nada.';

create or replace function public.registrar_invitacion(p_perfil_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor  uuid := (select auth.uid());
  v_rol    public.rol_usuario;
  v_centro uuid;
begin
  if (select public.rol_actual()) <> 'administrador'::public.rol_usuario then
    raise exception 'Solo un administrador puede dejar constancia de una invitación.' using errcode = '42501';
  end if;

  select p.rol, p.centro_id into v_rol, v_centro
  from public.perfiles p
  where p.id = p_perfil_id;

  if not found then
    raise exception 'El perfil % no existe.', p_perfil_id using errcode = '23503';
  end if;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  values (v_actor, 'perfiles', 'CUENTA_INVITADA', p_perfil_id::text,
          jsonb_build_object('rol', v_rol, 'centro_id', v_centro));
end;
$$;

comment on function public.registrar_invitacion(uuid) is
  'Deja constancia de quién invitó, con la sesión real del administrador. El alta de '
  'auth.users/perfiles ya ocurrió, disparada por fn_crear_perfil_de_usuario() con '
  'actor_id nulo: esta función es la que da nombre a ese actor en auditoria.';


-- =========================================================================
-- 8 · Baja de un perfil — dar_de_baja_perfil() (ADR-032, decisión de dominio 3)
-- =========================================================================
--
-- La autobaja de administrador NO se restringe aquí a propósito (decisión de dominio 3):
-- la base ya impide quedarse sin ningún administrador activo
-- (fn_impedir_baja_ultimo_administrador(), constraint trigger AFTER UPDATE OR DELETE en
-- perfiles). Si el llamante es el último administrador activo, el UPDATE de más abajo
-- falla desde DENTRO de ese disparador y esta función no necesita repetir la comprobación.
--
-- Orden dentro de la función: primero el estado (si ya estaba de baja, no se repite ni
-- el registro ni la fecha), después desbloqueos y PIN —idempotentes por construcción:
-- revocar 0 filas o borrar 0 filas no es un error—, y la auditoría solo si hubo un
-- cambio de estado real.
create or replace function public.dar_de_baja_perfil(p_perfil_id uuid, p_motivo text default null)
returns table (desbloqueos_revocados integer, pin_borrado boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor       uuid := (select auth.uid());
  v_ya_de_baja  boolean;
  v_desbloqueos integer;
  v_pin_borrado boolean := false;
begin
  if (select public.rol_actual()) <> 'administrador'::public.rol_usuario then
    raise exception 'Solo un administrador puede dar de baja un perfil.' using errcode = '42501';
  end if;

  select (p.estado = 'baja'::public.estado_perfil) into v_ya_de_baja
  from public.perfiles p
  where p.id = p_perfil_id;

  if not found then
    raise exception 'El perfil % no existe.', p_perfil_id using errcode = '23503';
  end if;

  if not v_ya_de_baja then
    -- Si p_perfil_id es el último administrador activo, fn_impedir_baja_ultimo_administrador()
    -- lanza aquí mismo (constraint trigger AFTER UPDATE) y deshace la función entera:
    -- decisión de dominio 3, sin comprobación propia.
    update public.perfiles
       set estado         = 'baja'::public.estado_perfil,
           estado_desde   = now(),
           motivo_estado  = p_motivo
     where id = p_perfil_id;
  end if;

  -- Revoca los desbloqueos vigentes. Idempotente: 0 filas si ya no había ninguno.
  with revocados as (
    update public.desbloqueos_historia
       set revocado_en = now()
     where perfil_id = p_perfil_id
       and revocado_en is null
       and caduca_en > now()
    returning 1
  )
  select count(*) into v_desbloqueos from revocados;

  -- Inutiliza el PIN borrando la fila. pines_historia no es de solo adición (es estado
  -- operativo mutable, como desbloqueos_historia): borrarla es legítimo, y es justo lo
  -- que "reponer un PIN, jamás" exige — quien vuelva de una baja fija uno nuevo, no
  -- recupera el viejo. Idempotente: 0 filas si ya no había PIN.
  if exists (select 1 from public.pines_historia where perfil_id = p_perfil_id) then
    delete from public.pines_historia where perfil_id = p_perfil_id;
    v_pin_borrado := true;
  end if;

  if not v_ya_de_baja then
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
    values (v_actor, 'perfiles', 'CUENTA_BAJA', p_perfil_id::text,
            jsonb_build_object('motivo', p_motivo,
                               'desbloqueos_revocados', v_desbloqueos,
                               'pin_borrado', v_pin_borrado));
  end if;

  return query select v_desbloqueos, v_pin_borrado;
end;
$$;

comment on function public.dar_de_baja_perfil(uuid, text) is
  'Baja de un perfil (ADR-032). Revoca desbloqueos vigentes y borra el PIN; el borrado '
  'de las sesiones y del factor TOTP los hace lib/cuentas/baja.ts con la Admin API '
  'DESPUÉS de que esta función tenga éxito — nunca antes: si Auth fallara primero, '
  'quedaría sesión viva con perfil todavía activo. Idempotente. La autobaja del último '
  'administrador activo la rechaza fn_impedir_baja_ultimo_administrador(), no esta '
  'función (decisión de dominio 3: sin restricción especial aquí).';


-- =========================================================================
-- 9 · Reposición de TOTP por el administrador — registrar_reposicion_totp()
-- =========================================================================
--
-- El borrado real del factor lo hace la Admin API desde lib/cuentas/totp.ts (SQL no
-- puede tocar auth.mfa_factors). Esta función es la constancia y el aviso.
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
  if (select public.rol_actual()) <> 'administrador'::public.rol_usuario then
    raise exception 'Solo un administrador puede reponer el TOTP de otro perfil.' using errcode = '42501';
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
  'lib/cuentas/totp.ts, nunca esta función.';


-- =========================================================================
-- 10 · Códigos de recuperación de TOTP (decisión de dominio 2)
-- =========================================================================

-- Diez códigos EN CLARO, una sola vez: la aplicación los muestra y los descarta, no
-- vuelven a estar disponibles. Caduca el lote anterior sin usar del propio llamante.
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

  -- El lote anterior sin usar queda caducado: solo la última tanda es válida.
  update public.codigos_recuperacion_totp
     set usado_en = now()
   where perfil_id = v_uid
     and usado_en is null;

  for i in 1 .. 10 loop
    -- 5 bytes aleatorios de pgcrypto (no random() a secas) en hexadecimal mayúsculas:
    -- diez caracteres, suficiente entropía para un código que se enseña una vez.
    v_codigo := upper(encode(extensions.gen_random_bytes(5), 'hex'));

    insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
    values (v_uid, extensions.crypt(v_codigo, extensions.gen_salt('bf', 12)));

    return next v_codigo;
  end loop;

  return;
end;
$$;

comment on function public.generar_codigos_recuperacion() is
  'Diez códigos de recuperación de TOTP en claro, mostrados una sola vez (ADR-039). '
  'Caduca el lote sin usar del propio llamante antes de generar el nuevo.';

-- No lanza excepción al fallar: un `raise` desharía el contador de intentos, igual que
-- en desbloquear_historia() (mismo motivo, mismo patrón). Cinco fallos bloquean quince
-- minutos; el bloqueo se mira ANTES de comprobar el código, así que el sexto intento
-- con el código correcto también falla mientras el bloqueo esté vigente.
create or replace function public.canjear_codigo_recuperacion(p_codigo text)
returns table (canjeado boolean, motivo text, bloqueado_hasta timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_centinela public.codigos_recuperacion_totp%rowtype;
  v_acertada  uuid;
  v_intentos  smallint;
  v_bloqueo   timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- El lote entero comparte el contador de intentos: lo lleva la fila más reciente sin
  -- usar (el "centinela"). Bloquea la fila para serializar intentos concurrentes, igual
  -- que desbloquear_historia() bloquea la fila del PIN.
  select * into v_centinela
  from public.codigos_recuperacion_totp
  where perfil_id = v_uid and usado_en is null
  order by creado_en desc
  limit 1
  for update;

  if not found then
    return query select false, 'sin_codigos'::text, null::timestamptz;
    return;
  end if;

  if v_centinela.bloqueado_hasta is not null and v_centinela.bloqueado_hasta > now() then
    return query select false, 'bloqueado'::text, v_centinela.bloqueado_hasta;
    return;
  end if;

  -- p_codigo viaja siempre como parámetro ligado; extensions.crypt porque search_path = ''.
  select c.id into v_acertada
  from public.codigos_recuperacion_totp c
  where c.perfil_id = v_uid
    and c.usado_en is null
    and extensions.crypt(p_codigo, c.codigo_hash) = c.codigo_hash
  limit 1;

  if v_acertada is null then
    v_intentos := v_centinela.intentos_fallidos + 1;
    v_bloqueo  := case when v_intentos >= 5 then now() + interval '15 minutes' end;

    update public.codigos_recuperacion_totp
       set intentos_fallidos = v_intentos,
           bloqueado_hasta   = v_bloqueo
     where id = v_centinela.id;

    return query select false,
                        case when v_bloqueo is not null then 'bloqueado' else 'codigo_invalido' end::text,
                        v_bloqueo;
    return;
  end if;

  -- Acierto: SQL no puede borrar auth.mfa_factors directamente (privilegio de la Admin
  -- API, no de la base). motivo = 'ok' es la señal que lib/cuentas/totp.ts usa para
  -- llamar auth.admin.mfa.deleteFactor() desde el lado de servidor DESPUÉS de esta
  -- función: el borrado real del factor ocurre ahí, no aquí. Lo que sí hace esta
  -- función es consumir el código, resetear el contador del lote y dejar constancia
  -- doble —auditoría y notificación— de que el titular deberá reenrolar TOTP.
  update public.codigos_recuperacion_totp
     set usado_en = now()
   where id = v_acertada;

  update public.codigos_recuperacion_totp
     set intentos_fallidos = 0, bloqueado_hasta = null
   where perfil_id = v_uid and usado_en is null;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  values (v_uid, 'perfiles', 'TOTP_REPUESTO', v_uid::text, jsonb_build_object('via', 'codigo_recuperacion'));

  insert into public.notificaciones (perfil_id, tipo, detalle)
  values (v_uid, 'totp_repuesto',
          'Has canjeado un código de recuperación: tu verificación en dos pasos ha '
          'quedado invalidada y tendrás que volver a configurarla.');

  return query select true, 'ok'::text, null::timestamptz;
end;
$$;

comment on function public.canjear_codigo_recuperacion(text) is
  'Canjea un código de recuperación de TOTP (decisión de dominio 2). NO concede acceso '
  'por sí solo: desde SQL no se puede emitir aal2, y un "ok" no es una sesión. Si '
  'motivo=''ok'', lib/cuentas/totp.ts debe borrar el factor TOTP del usuario vía Admin '
  'API para forzar el re-enrolamiento — esta función deja la constancia, no el borrado. '
  'No lanza excepción al fallar: un raise desharía el contador de intentos.';


-- =========================================================================
-- 11 · desbloquear_historia() — se re-crea para añadir el aviso al titular
-- =========================================================================
--
-- Cuerpo IDÉNTICO al de T-004 (20260829150000), con UNA línea nueva: el INSERT en
-- notificaciones dentro de la rama de bloqueo por intentos (decisión de dominio 1,
-- ADR-026 "aviso al titular"). Nada más cambia: la razón de no lanzar excepción al
-- fallar, la serialización con `for update`, y el resto de la lógica son los de T-004.
create or replace function public.desbloquear_historia(p_pin text)
returns table(desbloqueado boolean, motivo text, caduca_en timestamptz, bloqueado_hasta timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_pin      public.pines_historia%rowtype;
  v_intentos smallint;
  v_bloqueo  timestamptz;
  v_minutos  smallint;
  v_caduca   timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- 1 · Serializa los intentos concurrentes: sin esto, cinco conexiones a la vez
  --     gastarían un solo intento entre todas.
  select * into v_pin
  from public.pines_historia
  where perfil_id = v_uid
  for update;

  if not found then
    return query select false, 'sin_pin'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 2 · Bloqueado: se responde SIN comprobar el PIN. Esto es exactamente lo que hace
  --     fallar el sexto intento aunque el PIN sea el correcto.
  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return query select false, 'bloqueado'::text, null::timestamptz, v_pin.bloqueado_hasta;
    return;
  end if;

  -- 3 · Comparación. p_pin es parámetro ligado; extensions.crypt porque search_path = ''.
  if extensions.crypt(p_pin, v_pin.hash) <> v_pin.hash then
    -- 4 · Fallo: incrementa, y al quinto bloquea quince minutos.
    v_intentos := v_pin.intentos_fallidos + 1;
    v_bloqueo  := case when v_intentos >= 5 then now() + interval '15 minutes' end;

    update public.pines_historia
       set intentos_fallidos = v_intentos,
           bloqueado_hasta   = v_bloqueo,
           actualizado_en    = now()
     where perfil_id = v_uid;

    -- Todo intento fallido deja constancia (ADR-026). Cinco entradas seguidas del mismo
    -- actor son la señal que la pantalla de auditoría tiene que poder enseñar; si solo
    -- se registrara el bloqueo, cuatro intentos a ciegas serían invisibles.
    insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
    values (v_uid, 'pines_historia', 'PIN_FALLIDO', v_uid::text,
            jsonb_build_object('intentos_fallidos', v_intentos));

    if v_bloqueo is not null then
      insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
      values (v_uid, 'pines_historia', 'PIN_BLOQUEADO', v_uid::text,
              jsonb_build_object('intentos_fallidos', v_intentos,
                                 'bloqueado_hasta',   v_bloqueo));

      -- NUEVO en T-006: aviso al titular (decisión de dominio 1). El titular es el
      -- propio v_uid — quien bloquea su PIN es siempre su dueño, fijar_pin_historia()
      -- no admite perfil ajeno — así que no hace falta resolver a quién avisar.
      insert into public.notificaciones (perfil_id, tipo, detalle)
      values (v_uid, 'pin_bloqueado',
              'Tu PIN de historia clínica se ha bloqueado quince minutos por '
              'demasiados intentos fallidos.');
    end if;

    return query select false,
                        case when v_bloqueo is not null then 'bloqueado' else 'pin_incorrecto' end::text,
                        null::timestamptz,
                        v_bloqueo;
    return;
  end if;

  -- 5 · Acierto: resetea el contador, revoca los desbloqueos vigentes y abre uno nuevo.
  update public.pines_historia
     set intentos_fallidos = 0,
         bloqueado_hasta   = null,
         actualizado_en    = now()
   where perfil_id = v_uid;

  select coalesce(o.minutos_desbloqueo_historia, 15) into v_minutos
  from public.organizacion o
  limit 1;

  v_caduca := now() + make_interval(mins => coalesce(v_minutos, 15)::integer);

  -- Las columnas van cualificadas con alias: `caduca_en` y `bloqueado_hasta` son también
  -- parámetros de salida de esta función, y sin el alias Postgres no sabe cuál es cuál
  -- («column reference "caduca_en" is ambiguous»).
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


-- =========================================================================
-- 12 · Grants de las funciones nuevas
-- =========================================================================
revoke execute on function public.estado_de_cuenta()                              from public;
revoke execute on function public.preparar_invitacion(public.rol_usuario, uuid)   from public;
revoke execute on function public.registrar_invitacion(uuid)                      from public;
revoke execute on function public.dar_de_baja_perfil(uuid, text)                  from public;
revoke execute on function public.registrar_reposicion_totp(uuid)                 from public;
revoke execute on function public.generar_codigos_recuperacion()                  from public;
revoke execute on function public.canjear_codigo_recuperacion(text)               from public;

grant execute on function public.estado_de_cuenta()                              to authenticated;
grant execute on function public.preparar_invitacion(public.rol_usuario, uuid)   to authenticated;
grant execute on function public.registrar_invitacion(uuid)                      to authenticated;
grant execute on function public.dar_de_baja_perfil(uuid, text)                  to authenticated;
grant execute on function public.registrar_reposicion_totp(uuid)                 to authenticated;
grant execute on function public.generar_codigos_recuperacion()                  to authenticated;
grant execute on function public.canjear_codigo_recuperacion(text)               to authenticated;
