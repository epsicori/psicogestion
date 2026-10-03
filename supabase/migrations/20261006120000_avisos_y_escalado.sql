-- T-015 · Avisos de sesión, notificaciones y escalado de la nota pendiente.
-- Diseño: tickets/T-015/diseno.md §1.1 (bloques A-I). El bloque J no lleva SQL: resolver
-- una alerta usa la política de modificación vigente más la guarda de B.4.
--
-- Lo que esta migración NO toca: notas_clinicas*, fn_alertar_nota_sin_firmar,
-- fn_resolver_alerta_nota_sin_firmar, agenda_citas_rango, citas_agenda.


-- =========================================================================
-- A · notificaciones: título, origen e idempotencia; leída es para siempre
-- =========================================================================
alter table public.notificaciones
  add column titulo text check (titulo is null or length(trim(titulo)) > 0),
  add column origen_tabla text check (origen_tabla is null or length(trim(origen_tabla)) > 0),
  add column origen_id uuid,
  add constraint notificaciones_origen_completo
    check ((origen_tabla is null) = (origen_id is null));

-- Una notificación por destinatario, tipo y origen: es lo que hace idempotente el escalado.
create unique index notificaciones_origen_unico
  on public.notificaciones (perfil_id, tipo, origen_tabla, origen_id)
  where origen_id is not null;

create or replace function public.fn_proteger_notificacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.perfil_id is distinct from old.perfil_id
     or new.tipo is distinct from old.tipo
     or new.titulo is distinct from old.titulo
     or new.detalle is distinct from old.detalle
     or new.creado_en is distinct from old.creado_en
     or new.origen_tabla is distinct from old.origen_tabla
     or new.origen_id is distinct from old.origen_id then
    raise exception
      'Una notificación solo se puede actualizar en su columna leida_en.'
      using errcode = '42501';
  end if;

  -- Leída es para siempre: ni vuelve a null ni cambia de fecha.
  if old.leida_en is not null and new.leida_en is distinct from old.leida_en then
    raise exception 'Una notificación leída no vuelve a no leída.'
      using errcode = '42501';
  end if;

  -- El reloj lo pone la base, no el cliente.
  if old.leida_en is null and new.leida_en is not null then
    new.leida_en := now();
  end if;

  return new;
end;
$$;

comment on function public.fn_proteger_notificacion() is
  'El titular marca sus notificaciones como leídas y nada más: el resto de columnas, id '
  'incluido, está congelado (T-006, T-015). leida_en pasa de null a now() una sola vez.';

-- Corte por baja (ADR-032): quien ya no tiene rol no lee ni marca, ni siquiera lo suyo.
-- Mismo nombre que antes, para que 11-cobertura.sql no cambie.
drop policy notificaciones_lectura_propia on public.notificaciones;
create policy notificaciones_lectura_propia on public.notificaciones
  for select to authenticated
  using ((select public.rol_actual()) is not null and perfil_id = (select auth.uid()));

drop policy notificaciones_marcar_leida_propia on public.notificaciones;
create policy notificaciones_marcar_leida_propia on public.notificaciones
  for update to authenticated
  using      ((select public.rol_actual()) is not null and perfil_id = (select auth.uid()))
  with check ((select public.rol_actual()) is not null and perfil_id = (select auth.uid()));

-- notificaciones nació después del bucle de T-004 y no heredó el disparador de auditoría.
create trigger auditar_notificaciones
  after insert or update or delete on public.notificaciones
  for each row execute function public.fn_auditar('id');

comment on column public.notificaciones.titulo is
  'Lo escribe quien genera la notificación. Si es nulo, la interfaz usa la etiqueta del tipo.';
comment on column public.notificaciones.detalle is
  'Es el `cuerpo` del contrato de T-015. Sin contenido clínico (ADR-038).';
comment on column public.notificaciones.origen_tabla is
  'Tabla del registro que generó el aviso. Va con origen_id o no va.';
comment on column public.notificaciones.origen_id is
  'Registro que generó el aviso. Junto con perfil_id, tipo y origen_tabla, hace '
  'idempotente al generador (notificaciones_origen_unico).';


-- =========================================================================
-- B · alertas_documentacion: el instante de referencia y la guarda de update
-- =========================================================================
alter table public.alertas_documentacion
  add column referencia_en timestamptz not null default now();

-- Relleno ANTES de crear los disparadores.
update public.alertas_documentacion a
   set referencia_en = c.fin
  from public.citas c
 where a.origen_tabla = 'citas' and c.id = a.origen_id;

update public.alertas_documentacion a
   set referencia_en = a.creada_en
 where a.origen_tabla <> 'citas'
    or not exists (select 1 from public.citas c where c.id = a.origen_id);

-- Tercer estado: `anulada`. Lo pone solo la base (fn_anular_alerta_nota_sin_firmar) cuando la
-- cita sale de `realizada`: la nota no se firmó, así que no es «resuelta». Columna nula sin
-- valor por defecto y dominio ampliado: nada destructivo. `alertas_documentacion_check`
-- (la de `resuelta`) no se toca: una anulada tiene resuelta_en nulo y la cumple.
alter table public.alertas_documentacion
  add column anulada_en timestamptz,
  drop constraint alertas_documentacion_estado_check,
  add constraint alertas_documentacion_estado_check
    check (estado in ('abierta', 'resuelta', 'anulada')),
  add constraint alertas_documentacion_anulada_check
    check ((estado = 'anulada') = (anulada_en is not null));

comment on column public.alertas_documentacion.anulada_en is
  'Instante en que la cita dejó de ser realizada y la alerta perdió su motivo. Lo fija solo '
  'fn_anular_alerta_nota_sin_firmar(); es histórico, no una resolución (T-015).';

comment on column public.alertas_documentacion.referencia_en is
  'Instante desde el que corre el nivel de la alerta: el fin de la cita si el origen es una '
  'cita, si no el momento de abrirla. Lo fija fn_fijar_referencia_alerta(); el cliente no '
  'lo elige ni lo mueve (T-015).';

create function public.fn_fijar_referencia_alerta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ignora siempre lo que mande el cliente.
  new.referencia_en := null;
  if new.origen_tabla = 'citas' then
    new.referencia_en := (select c.fin from public.citas c where c.id = new.origen_id);
  end if;
  new.referencia_en := coalesce(new.referencia_en, now());
  return new;
end;
$$;

comment on function public.fn_fijar_referencia_alerta() is
  'Fija referencia_en al insertar una alerta: citas.fin si el origen es una cita, now() en '
  'otro caso. Lo que mande el cliente se descarta (T-015).';

revoke execute on function public.fn_fijar_referencia_alerta() from public, anon, authenticated;

create trigger fijar_referencia_alerta
  before insert on public.alertas_documentacion
  for each row execute function public.fn_fijar_referencia_alerta();

-- INVOKER a propósito: así current_user es el de quien escribe. Las funciones definer
-- (la firma de T-012, el escalado de T-015) corren como su propietario y no la activan.
create function public.fn_proteger_alerta_documentacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.paciente_id is distinct from old.paciente_id
     or new.profesional_id is distinct from old.profesional_id
     or new.centro_id is distinct from old.centro_id
     or new.tipo is distinct from old.tipo
     or new.origen_tabla is distinct from old.origen_tabla
     or new.origen_id is distinct from old.origen_id
     or new.fecha_referencia is distinct from old.fecha_referencia
     or new.referencia_en is distinct from old.referencia_en
     or new.creada_en is distinct from old.creada_en
     or new.anulada_en is distinct from old.anulada_en then
    raise exception 'Una alerta no cambia de identidad ni de instante.'
      using errcode = '42501';
  end if;

  -- `anulada` solo la pone la base cuando la cita deja de ser realizada (definer, sin pasar
  -- por aquí). Ningún cliente llega a ella.
  if new.estado = 'anulada' and old.estado is distinct from 'anulada' then
    raise exception 'Solo la corrección de la cita anula una alerta.'
      using errcode = '42501';
  end if;

  if old.tipo = 'nota_sin_firmar'
     and (new.estado is distinct from old.estado or new.resuelta_en is distinct from old.resuelta_en) then
    raise exception 'Una nota pendiente solo se cierra firmando la nota.'
      using errcode = '42501';
  end if;

  if old.estado <> 'abierta'
     and (new.estado is distinct from old.estado or new.resuelta_en is distinct from old.resuelta_en) then
    raise exception 'Una alerta cerrada no se reabre.'
      using errcode = '42501';
  end if;

  if old.estado = 'abierta' and new.estado = 'resuelta' then
    new.resuelta_en := now();
  elsif old.estado = 'abierta' and new.estado = 'abierta' and new.resuelta_en is not null then
    raise exception 'Una alerta abierta no lleva fecha de resolución.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_proteger_alerta_documentacion() is
  'Guarda de update para authenticated (T-015, decisión P1): congela la identidad (id '
  'incluido) y el instante (referencia_en, anulada_en), impide cerrar a mano una '
  'nota_sin_firmar, impide anular (solo la corrección de la cita), impide reabrir una '
  'cerrada y fija resuelta_en = now(). Es invoker para que current_user distinga al cliente '
  'de las funciones definer.';

revoke execute on function public.fn_proteger_alerta_documentacion() from public, anon;

create trigger proteger_alerta_documentacion
  before update on public.alertas_documentacion
  for each row execute function public.fn_proteger_alerta_documentacion();

-- Anular la alerta cuando la cita deja de ser realizada. DEFINER: el técnico cambia el
-- estado a través de agenda_actualizar_cita (definer) y el titular lo hace en directo; en los
-- dos casos la guarda invoker de arriba ve current_user <> 'authenticated' y deja pasar.
-- No lee notas_clinicas. La auditoría la escribe auditar_alertas_documentacion en la misma
-- transacción, con actor_id = auth.uid(): quien corrigió la cita.
create function public.fn_anular_alerta_nota_sin_firmar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alertas_documentacion
     set estado = 'anulada', anulada_en = now()
   where origen_tabla = 'citas' and origen_id = new.id
     and tipo = 'nota_sin_firmar' and estado = 'abierta';
  return null;
end;
$$;

comment on function public.fn_anular_alerta_nota_sin_firmar() is
  'Si una cita deja de ser realizada, su alerta nota_sin_firmar abierta pasa a anulada: la '
  'sesión no ocurrió, no hay nota que firmar. Una resuelta no se toca. Nada se borra '
  '(constitución, regla 6) y no se marca como resuelta, que sería falso (T-015).';

revoke execute on function public.fn_anular_alerta_nota_sin_firmar() from public, anon, authenticated;

create trigger anular_alerta_nota_sin_firmar
  after update of estado on public.citas
  for each row
  when (old.estado = 'realizada' and new.estado is distinct from 'realizada')
  execute function public.fn_anular_alerta_nota_sin_firmar();


-- =========================================================================
-- C · Umbrales por centro, con herencia de la organización
-- =========================================================================
alter table public.organizacion
  add column escalado_nivel2_horas smallint not null default 24,
  add column escalado_nivel3_horas smallint not null default 72,
  add constraint organizacion_umbrales_escalado
    check (escalado_nivel2_horas > 0 and escalado_nivel3_horas > escalado_nivel2_horas);

alter table public.centros
  add column escalado_nivel2_horas smallint check (escalado_nivel2_horas is null or escalado_nivel2_horas > 0),
  add column escalado_nivel3_horas smallint check (escalado_nivel3_horas is null or escalado_nivel3_horas > 0);

comment on column public.organizacion.escalado_nivel2_horas is
  'Horas desde el fin de la sesión a partir de las que una nota sin firmar pasa a nivel 2 (T-015).';
comment on column public.organizacion.escalado_nivel3_horas is
  'Horas desde el fin de la sesión a partir de las que una nota sin firmar pasa a nivel 3 y '
  'se avisa al administrador (T-015).';
comment on column public.centros.escalado_nivel2_horas is
  'Nulo: hereda de la organización. Ver umbrales_escalado().';
comment on column public.centros.escalado_nivel3_horas is
  'Nulo: hereda de la organización. Ver umbrales_escalado().';

create function public.umbrales_escalado(p_centro uuid)
returns table (nivel2_horas integer, nivel3_horas integer)
language sql
stable
security definer
set search_path = ''
as $$
  select u.n2, greatest(u.n3, u.n2 + 1)
    from (
      select
        coalesce(
          (select c.escalado_nivel2_horas from public.centros c where c.id = p_centro),
          (select o.escalado_nivel2_horas from public.organizacion o limit 1),
          24)::integer as n2,
        coalesce(
          (select c.escalado_nivel3_horas from public.centros c where c.id = p_centro),
          (select o.escalado_nivel3_horas from public.organizacion o limit 1),
          72)::integer as n3
    ) u;
$$;

comment on function public.umbrales_escalado(uuid) is
  'Umbrales efectivos del centro: centro, si no organización, si no 24/72. El nivel 3 nunca '
  'queda por debajo de nivel 2 + 1. Siempre una fila, nunca nulos (T-015).';

revoke all on function public.umbrales_escalado(uuid) from public, anon;
grant execute on function public.umbrales_escalado(uuid) to authenticated;


-- =========================================================================
-- D · Nivel de la nota pendiente: se calcula aquí y en ningún otro sitio
-- =========================================================================
create function public.nivel_nota_pendiente(p_referencia timestamptz, p_centro uuid)
returns smallint
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when p_referencia is null then null
           when now() - p_referencia < make_interval(hours => u.nivel2_horas) then 1
           when now() - p_referencia < make_interval(hours => u.nivel3_horas) then 2
           else 3
         end::smallint
    from public.umbrales_escalado(p_centro) u;
$$;

comment on function public.nivel_nota_pendiente(timestamptz, uuid) is
  '1, 2 o 3 según las horas transcurridas desde p_referencia y los umbrales del centro; '
  'nulo si la referencia es nula (T-015).';

revoke all on function public.nivel_nota_pendiente(timestamptz, uuid) from public, anon;
grant execute on function public.nivel_nota_pendiente(timestamptz, uuid) to authenticated;

create view public.alertas_documentacion_nivel with (security_invoker = true) as
  select a.id, a.paciente_id, a.profesional_id, a.centro_id, a.tipo, a.origen_tabla, a.origen_id,
         a.fecha_referencia, a.referencia_en, a.estado, a.creada_en,
         case when a.tipo = 'nota_sin_firmar' and a.estado = 'abierta'
              then public.nivel_nota_pendiente(a.referencia_en, a.centro_id) end as nivel
    from public.alertas_documentacion a;

comment on view public.alertas_documentacion_nivel is
  'Solo lectura. El nivel se calcula aquí y en ningún otro sitio.';

revoke all on table public.alertas_documentacion_nivel from public, anon, service_role;
grant select on table public.alertas_documentacion_nivel to authenticated;


-- =========================================================================
-- E · Recuento de la cabecera: MIS notas, aunque la RLS me deje ver otras
-- =========================================================================
create function public.recuento_notas_pendientes()
returns table (nivel1 integer, nivel2 integer, nivel3 integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select (count(*) filter (where v.nivel = 1))::integer,
         (count(*) filter (where v.nivel = 2))::integer,
         (count(*) filter (where v.nivel = 3))::integer
    from public.alertas_documentacion_nivel v
   where v.estado = 'abierta'
     and v.tipo = 'nota_sin_firmar'
     and v.profesional_id = (select auth.uid());
$$;

comment on function public.recuento_notas_pendientes() is
  'Notas sin firmar del usuario por nivel. El filtro profesional_id = uid es el contrato: la '
  'RLS deja ver al asignado y al administrador alertas que no son suyas (T-015).';

revoke all on function public.recuento_notas_pendientes() from public, anon;
grant execute on function public.recuento_notas_pendientes() to authenticated;


-- =========================================================================
-- F · Lectura de alertas_documentacion: el técnico solo ve consentimiento_pendiente
-- =========================================================================
drop policy alertas_documentacion_lectura on public.alertas_documentacion;
create policy alertas_documentacion_lectura on public.alertas_documentacion
  for select to authenticated
  using ((select public.rol_actual()) is not null and (
    (select public.rol_actual()) = 'administrador'
    or ((select public.rol_actual()) <> 'tecnico_administrativo'
        and (profesional_id = (select auth.uid()) or public.es_profesional_asignado(paciente_id)))
    or ((select public.rol_actual()) = 'tecnico_administrativo'
        and tipo = 'consentimiento_pendiente'
        and centro_id in (select public.centros_actuales()))));


-- =========================================================================
-- I · Administrador designado (antes de G, que lo lee)
-- =========================================================================
alter table public.organizacion
  add column administrador_avisos_id uuid references public.perfiles (id) on delete set null;

comment on column public.organizacion.administrador_avisos_id is
  'Destinatario del nivel 3 de la nota pendiente (T-015). Nula, o persona que ya no es '
  'administrador activo: se avisa a todos los administradores activos.';

create function public.fn_validar_administrador_avisos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.administrador_avisos_id is not null and not exists (
    select 1 from public.perfiles p
     where p.id = new.administrador_avisos_id
       and p.rol = 'administrador'
       and p.estado = 'activo'
  ) then
    raise exception 'El administrador de avisos debe ser un administrador activo.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.fn_validar_administrador_avisos() is
  'Solo un administrador activo puede quedar designado como destinatario de avisos. Si '
  'después pasa a baja, la columna no se toca: el escalado avisa a todos (T-015).';

revoke execute on function public.fn_validar_administrador_avisos() from public, anon, authenticated;

create trigger validar_administrador_avisos
  before insert or update of administrador_avisos_id on public.organizacion
  for each row execute function public.fn_validar_administrador_avisos();


-- =========================================================================
-- G · Escalado al nivel 3
-- =========================================================================
create function public.escalar_notas_pendientes()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_insertadas integer;
begin
  with designado as (
    select p.id
      from public.organizacion o
      join public.perfiles p on p.id = o.administrador_avisos_id
     where p.rol = 'administrador' and p.estado = 'activo'
  ),
  destinatarios as (
    select d.id from designado d
    union all
    select p.id
      from public.perfiles p
     where p.rol = 'administrador' and p.estado = 'activo'
       and not exists (select 1 from designado)
  )
  insert into public.notificaciones (perfil_id, tipo, titulo, detalle, origen_tabla, origen_id)
  select ds.id,
         'nota_pendiente_escalada',
         'Nota sin firmar',
         format('%s tiene sin firmar la nota de la sesión del %s.',
                pr.nombre_completo,
                to_char(a.referencia_en at time zone public.zona_horaria_centro(a.centro_id), 'DD/MM')),
         a.origen_tabla,
         a.origen_id
    from public.alertas_documentacion a
    join public.perfiles pr on pr.id = a.profesional_id
    cross join destinatarios ds
   where a.estado = 'abierta'
     and a.tipo = 'nota_sin_firmar'
     and public.nivel_nota_pendiente(a.referencia_en, a.centro_id) = 3
  on conflict (perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null do nothing;

  get diagnostics v_insertadas = row_count;
  return v_insertadas;
end;
$$;

comment on function public.escalar_notas_pendientes() is
  'Avisa al administrador designado (o a todos los activos) de cada nota sin firmar en nivel '
  '3. El cuerpo no lleva paciente (decisión 5, ADR-038). El origen de la notificación es lo '
  'que falta (la cita, a.origen_tabla/a.origen_id), no la fila de la alerta: la idempotencia '
  'por notificaciones_origen_unico es por cita y destinatario, así que una alerta anulada y '
  'reabierta no avisa dos veces por la misma sesión. El escalado vive solo aquí, no en el '
  'outbox (T-015).';

revoke execute on function public.escalar_notas_pendientes() from public, anon, authenticated, service_role;


-- =========================================================================
-- H · Programación: cada 15 minutos
-- =========================================================================
create extension if not exists pg_cron;

select cron.schedule(
  'escalar-notas-pendientes',
  '*/15 * * * *',
  $$select public.escalar_notas_pendientes()$$
);
