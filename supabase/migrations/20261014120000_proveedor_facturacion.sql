-- T-026a · Programa de facturación sin red.
--
-- ADR-053: la app prepara borradores y NUNCA aprueba, expide ni cobra; la factura la expide el programa
-- externo. ADR-077: la app copia de lo que el programa expide solo la lista cerrada del punto 7 (número,
-- fecha de expedición, base, cuota, total, enlace y la fecha de copia), sin estado, sin cobros, sin PDF,
-- sin QR, sin registro de facturación y sin huella. ADR-078: vocabulario («preparar», «programa de
-- facturación», nunca «aprobar» ni «emitir»). ADR-024: la cola es el outbox `eventos_salientes`.
-- Nada de lo que copia este fichero sale de la lista del ADR-077 punto 7.
--
-- Orden de las secciones:
--   1 · tipos                              7 · funciones de service_role (el consumidor)
--   2 · tablas de solo adición             8 · encolar_envio_borrador (la acción del profesional)
--   3 · disparador del envío               9 · congelación del borrador enviado
--   4 · lectura (RLS) y vista del técnico  10 · cobros.factura_espejo_id
--   5 · ajuste del proveedor y Vault       11 · borradores_factura_estado
--   6 · cron del drenado                   12 · comentarios
--
-- Diseño: tickets/T-026a/diseno.md (delta) sobre tickets/T-026/diseno.md. Donde chocan, gana el delta:
-- la rama del profesional de la vista es `es_profesional_asignado(e.paciente_id)` y encolar copia el alta
-- de versiones (administrador, o profesional que es autor Y está asignado).


-- =========================================================================
-- 1 · Tipos
-- =========================================================================
create type public.proveedor_facturacion as enum ('holded');

create type public.anotacion_documento_proveedor as enum ('borrado_sin_aprobar', 'rectificado', 'anulado');


-- =========================================================================
-- 2 · Tablas de solo adición (tres capas cada una: revoke, update/delete y truncate)
-- =========================================================================

-- 2.1 · El vínculo borrador → documento del programa (ADR-077 punto 4). Sin FK a la versión: las
-- versiones son de solo adición y no pueden ser destino de una clave ajena (supabase.md).
create table public.borradores_factura_envios (
  id                     uuid primary key default gen_random_uuid(),
  borrador_id            uuid not null references public.borradores_factura(id),
  version_id             uuid not null,
  numero_version         integer not null check (numero_version > 0),
  paciente_id            uuid not null references public.pacientes(id),
  proveedor              public.proveedor_facturacion not null,
  proveedor_documento_id text not null check (length(proveedor_documento_id) between 1 and 200),
  proyeccion_version     smallint not null check (proyeccion_version > 0),
  fecha_documento        date not null,
  evento_id              uuid not null,
  enviado_en             timestamptz not null default now(),
  unique (borrador_id),
  unique (proveedor, proveedor_documento_id)
);

-- 2.2 · El espejo mínimo de la factura que expidió el programa (ADR-077 puntos 1 y 7).
create table public.facturas_espejo (
  id                     uuid primary key default gen_random_uuid(),
  borrador_id            uuid not null references public.borradores_factura(id),
  paciente_id            uuid not null references public.pacientes(id),
  proveedor              public.proveedor_facturacion not null,
  proveedor_documento_id text not null,
  numero                 text not null check (length(trim(numero)) between 1 and 60),
  fecha_expedicion       date not null,
  base                   numeric(12,2) not null,
  cuota_iva              numeric(12,2) not null check (cuota_iva >= 0),
  total                  numeric(12,2) not null,
  url_proveedor          text not null check (url_proveedor ~ '^https://' and length(url_proveedor) <= 2000),
  copiado_en             timestamptz not null default now(),
  check (base + cuota_iva = total),
  unique (proveedor, proveedor_documento_id),
  unique (borrador_id)
);

-- 2.3 · Lo que el programa dice de un documento después: se borró sin aprobar, se rectificó, se anuló.
-- Sin texto libre (ADR-077 punto 2).
create table public.facturas_anotaciones (
  id                     uuid primary key default gen_random_uuid(),
  borrador_id            uuid not null references public.borradores_factura(id),
  proveedor              public.proveedor_facturacion not null,
  proveedor_documento_id text not null,
  tipo                   public.anotacion_documento_proveedor not null,
  observada_en           timestamptz not null default now(),
  unique (proveedor, proveedor_documento_id, tipo)
);

alter table public.borradores_factura_envios enable row level security;
alter table public.facturas_espejo           enable row level security;
alter table public.facturas_anotaciones      enable row level security;

-- Capa 1: ni update, ni delete, ni truncate para nadie, postgres incluido. Insert: nadie salvo por las
-- funciones definer (ningún grant de insert a authenticated ni a service_role).
revoke all on table public.borradores_factura_envios from public, anon, authenticated, service_role;
revoke all on table public.facturas_espejo           from public, anon, authenticated, service_role;
revoke all on table public.facturas_anotaciones      from public, anon, authenticated, service_role;

revoke update, delete, truncate on table public.borradores_factura_envios from postgres;
revoke update, delete, truncate on table public.facturas_espejo           from postgres;
revoke update, delete, truncate on table public.facturas_anotaciones      from postgres;

grant select on table public.borradores_factura_envios to authenticated;
grant select on table public.facturas_espejo           to authenticated;
grant select on table public.facturas_anotaciones      to authenticated;

-- Capas 2 y 3.
create trigger impedir_modificacion_borradores_factura_envios
  before update or delete on public.borradores_factura_envios
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_truncado_borradores_factura_envios
  before truncate on public.borradores_factura_envios
  for each statement execute function public.fn_impedir_modificacion();

create trigger impedir_modificacion_facturas_espejo
  before update or delete on public.facturas_espejo
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_truncado_facturas_espejo
  before truncate on public.facturas_espejo
  for each statement execute function public.fn_impedir_modificacion();

create trigger impedir_modificacion_facturas_anotaciones
  before update or delete on public.facturas_anotaciones
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_truncado_facturas_anotaciones
  before truncate on public.facturas_anotaciones
  for each statement execute function public.fn_impedir_modificacion();

-- Auditoría: solo insert, porque update y delete son imposibles.
create trigger auditar_borradores_factura_envios
  after insert on public.borradores_factura_envios
  for each row execute function public.fn_auditar('id');
create trigger auditar_facturas_espejo
  after insert on public.facturas_espejo
  for each row execute function public.fn_auditar('id');
create trigger auditar_facturas_anotaciones
  after insert on public.facturas_anotaciones
  for each row execute function public.fn_auditar('id');

insert into public.tablas_solo_adicion (tabla, motivo) values
  ('borradores_factura_envios',
   'El vínculo entre un borrador y el documento del programa de facturación no se reescribe (ADR-077 punto 4, ADR-053 h).'),
  ('facturas_espejo',
   'Lo que el programa expidió se copia una vez y no se actualiza nunca: una diferencia se avisa, no se pisa (ADR-077).'),
  ('facturas_anotaciones',
   'Lo que el programa dijo de un documento después (borrado sin aprobar, rectificado, anulado) se acumula (ADR-077 punto 2).');


-- =========================================================================
-- 3 · Disparador del envío: la versión, el borrador y el paciente tienen que cuadrar
-- =========================================================================
-- Definer: lee versiones y cabeceras con independencia de quien inserte. En este orden: 23503 si la
-- versión no existe, 23514 si no es la del borrador, 23514 si el paciente no es el de la cabecera.
create function public.fn_validar_envio_borrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borrador uuid;
  v_numero   integer;
  v_paciente uuid;
begin
  select v.borrador_id, v.numero_version into v_borrador, v_numero
    from public.borradores_factura_versiones v
   where v.id = new.version_id;
  if not found then
    raise exception 'la versión del envío no existe' using errcode = '23503';
  end if;
  if v_borrador <> new.borrador_id or v_numero <> new.numero_version then
    raise exception 'la versión no es la del borrador del envío' using errcode = '23514';
  end if;

  select b.paciente_id into v_paciente
    from public.borradores_factura b
   where b.id = new.borrador_id;
  if v_paciente is distinct from new.paciente_id then
    raise exception 'el paciente del envío no es el del borrador' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_validar_envio_borrador() from public, anon, authenticated, service_role;

create trigger validar_envio_borrador
  before insert on public.borradores_factura_envios
  for each row execute function public.fn_validar_envio_borrador();


-- =========================================================================
-- 4 · Lectura (RLS) y la vista del técnico
-- =========================================================================
-- Las tres políticas heredan la regla vigente de `borradores_factura_lectura` sin copiarla: quien ve la
-- cabecera ve sus envíos, su espejo y sus anotaciones. El técnico no ve la cabecera, así que no ve nada.
create policy borradores_factura_envios_lectura on public.borradores_factura_envios
  for select to authenticated
  using (exists (select 1 from public.borradores_factura b
                  where b.id = borradores_factura_envios.borrador_id));

create policy facturas_espejo_lectura on public.facturas_espejo
  for select to authenticated
  using (exists (select 1 from public.borradores_factura b
                  where b.id = facturas_espejo.borrador_id));

create policy facturas_anotaciones_lectura on public.facturas_anotaciones
  for select to authenticated
  using (exists (select 1 from public.borradores_factura b
                  where b.id = facturas_anotaciones.borrador_id));

-- La vista del técnico: la cabecera de la factura (lo que necesita para cobrar), sin el borrador, sin
-- líneas y sin destinatario. Definer con barrera: el `where` del nivel exterior es lo que protege.
-- La rama del profesional es la de `borradores_factura_lectura` (asignado), con `e.` delante.
create view public.facturas_espejo_cabecera
  with (security_invoker = false, security_barrier = true)
as
select
  e.id,
  e.paciente_id,
  e.proveedor,
  e.numero,
  e.fecha_expedicion,
  e.base,
  e.cuota_iva,
  e.total,
  e.url_proveedor,
  e.copiado_en
from public.facturas_espejo e
where (select public.rol_actual()) = 'administrador'::public.rol_usuario
   or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
       and public.es_profesional_asignado(e.paciente_id))
   or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
       and e.paciente_id in (select p.id from public.pacientes p
                              where p.centro_id in (select public.centros_actuales())));

revoke all on table public.facturas_espejo_cabecera from public, anon, authenticated, service_role;
grant select on table public.facturas_espejo_cabecera to authenticated;


-- =========================================================================
-- 5 · El ajuste del proveedor y la clave en el Vault (ADR-053 f)
-- =========================================================================
create table public.facturacion_ajuste (
  unico              boolean primary key default true check (unico),
  proveedor          public.proveedor_facturacion,
  secreto_id         uuid,
  sincronizado_hasta timestamptz,
  actualizado_por    uuid references public.perfiles(id),
  actualizado_en     timestamptz not null default now(),
  check ((proveedor is null) = (secreto_id is null))
);

alter table public.facturacion_ajuste enable row level security;
revoke all on table public.facturacion_ajuste from public, anon, authenticated, service_role;

-- `sincronizado_hasta` queda fuera de la auditoría: se mueve cada cinco minutos.
create trigger auditar_facturacion_ajuste
  after insert or update of proveedor, secreto_id or delete on public.facturacion_ajuste
  for each row execute function public.fn_auditar('unico');

-- 5.1 · guardar la clave: solo el administrador activo. La validación del formato va ANTES que el
-- Vault y `p_clave` no aparece en ningún raise, format ni notice.
create function public.guardar_clave_proveedor_facturacion(p_proveedor public.proveedor_facturacion, p_clave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secreto uuid;
begin
  if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario then
    raise exception 'Solo el administrador gestiona el programa de facturación.' using errcode = '42501';
  end if;
  if p_proveedor is null then
    raise exception 'Falta el programa de facturación.' using errcode = '22023';
  end if;
  if p_clave is null or length(p_clave) not between 16 and 256 or p_clave !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'La clave no tiene un formato válido.' using errcode = '22023';
  end if;

  select s.id into v_secreto from vault.secrets s where s.name = 'proveedor_facturacion_clave';
  if v_secreto is null then
    v_secreto := vault.create_secret(p_clave, 'proveedor_facturacion_clave',
                                     'Clave del programa de facturación (T-026a)');
  else
    perform vault.update_secret(v_secreto, p_clave);
  end if;

  insert into public.facturacion_ajuste (unico, proveedor, secreto_id, actualizado_por, actualizado_en)
  values (true, p_proveedor, v_secreto, (select auth.uid()), now())
  on conflict (unico) do update
    set proveedor       = excluded.proveedor,
        secreto_id      = excluded.secreto_id,
        actualizado_por = excluded.actualizado_por,
        actualizado_en  = excluded.actualizado_en;
end;
$$;

-- 5.2 · quitar el proveedor: borra la clave del Vault y vacía el ajuste. La cola pendiente se queda.
create function public.quitar_proveedor_facturacion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario then
    raise exception 'Solo el administrador gestiona el programa de facturación.' using errcode = '42501';
  end if;

  delete from vault.secrets s where s.name = 'proveedor_facturacion_clave';

  update public.facturacion_ajuste a
     set proveedor = null,
         secreto_id = null,
         actualizado_por = (select auth.uid()),
         actualizado_en = now()
   where a.unico;
end;
$$;

-- 5.3 · qué programa hay conectado (sin nada más). Lo ejecuta también la ruta del drenado.
create function public.proveedor_facturacion_activo()
returns public.proveedor_facturacion
language sql
stable
security definer
set search_path = ''
as $$
  select a.proveedor from public.facturacion_ajuste a where a.unico;
$$;

-- 5.4 · el estado de la clave para el administrador: solo los cuatro últimos caracteres.
create function public.estado_clave_proveedor_facturacion()
returns table (proveedor public.proveedor_facturacion, ultimos4 text, actualizado_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario then
    raise exception 'Solo el administrador gestiona el programa de facturación.' using errcode = '42501';
  end if;

  return query
    select a.proveedor,
           ('••••' || right(d.decrypted_secret, 4))::text,
           a.actualizado_en
      from public.facturacion_ajuste a
      join vault.decrypted_secrets d on d.id = a.secreto_id
     where a.unico and a.proveedor is not null;
end;
$$;

-- 5.5 · la clave, para el consumidor (service_role). Nulo si no hay ninguna.
create function public.clave_proveedor_facturacion()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret
    from vault.decrypted_secrets d
   where d.name = 'proveedor_facturacion_clave';
$$;

revoke all on function public.guardar_clave_proveedor_facturacion(public.proveedor_facturacion, text) from public, anon, authenticated, service_role;
revoke all on function public.quitar_proveedor_facturacion()          from public, anon, authenticated, service_role;
revoke all on function public.proveedor_facturacion_activo()          from public, anon, authenticated, service_role;
revoke all on function public.estado_clave_proveedor_facturacion()    from public, anon, authenticated, service_role;
revoke all on function public.clave_proveedor_facturacion()           from public, anon, authenticated, service_role;

grant execute on function public.guardar_clave_proveedor_facturacion(public.proveedor_facturacion, text) to authenticated;
grant execute on function public.quitar_proveedor_facturacion()       to authenticated;
grant execute on function public.proveedor_facturacion_activo()       to authenticated, service_role;
grant execute on function public.estado_clave_proveedor_facturacion() to authenticated;
grant execute on function public.clave_proveedor_facturacion()        to service_role;


-- =========================================================================
-- 6 · El drenado periódico (pg_cron + pg_net)
-- =========================================================================
-- Lo llama el cron como postgres. Lee del Vault la URL y el secreto del drenado, que da de alta quien
-- despliega (`facturacion_drenar_url`, `facturacion_drenar_secreto`); en local no existen y no hace
-- nada. No lleva la clave del proveedor: el secreto de la cabecera es el de la ruta, no el del programa.
create function public.disparar_drenado_facturacion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_secreto text;
begin
  if (select a.proveedor from public.facturacion_ajuste a where a.unico) is null then
    return;
  end if;

  select d.decrypted_secret into v_url
    from vault.decrypted_secrets d where d.name = 'facturacion_drenar_url';
  select d.decrypted_secret into v_secreto
    from vault.decrypted_secrets d where d.name = 'facturacion_drenar_secreto';
  if v_url is null or v_secreto is null then
    return;
  end if;

  perform net.http_post(
    v_url,
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('Authorization', 'Bearer ' || v_secreto, 'Content-Type', 'application/json'),
    10000);
end;
$$;

revoke all on function public.disparar_drenado_facturacion() from public, anon, authenticated, service_role;

select cron.schedule(
  'drenar-facturacion',
  '*/5 * * * *',
  $$select public.disparar_drenado_facturacion()$$
);


-- =========================================================================
-- 7 · Funciones de service_role: el consumidor de la cola y el sincronizador
-- =========================================================================

-- 7.1 · Reclamar envíos. Concede cinco minutos a cada evento (un consumidor que muera a mitad libera el
-- evento a los cinco minutos) y devuelve la ÚLTIMA versión; si esa versión está descartada, el evento
-- pasa a fallido con el código `descartado` y no se devuelve. Las líneas salen SIN concepto ni cita_id.
create function public.reclamar_envios_facturacion(p_limite integer default 10)
returns table (
  evento_id uuid, borrador_id uuid, version_id uuid, numero_version integer,
  destinatario_nombre text,
  destinatario_nif_cifrado bytea, destinatario_nif_nonce bytea,
  destinatario_nif_etiqueta bytea, destinatario_nif_clave_version smallint,
  lineas jsonb, fecha_documento date, ya_enviado_documento_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r         record;
  v         record;
  v_centro  uuid;
begin
  for r in
    select e.id as eid, (e.carga ->> 'borrador_id')::uuid as bid
      from public.eventos_salientes e
     where e.tipo = 'facturacion.enviar_borrador'
       and e.estado = 'pendiente'
       and e.proximo_intento <= now()
     order by e.proximo_intento
     limit greatest(coalesce(p_limite, 10), 0)
       for update skip locked
  loop
    select x.id, x.numero_version, x.descartado, x.destinatario_nombre,
           x.destinatario_nif_cifrado, x.destinatario_nif_nonce, x.destinatario_nif_etiqueta,
           x.destinatario_nif_clave_version, x.lineas, x.centro_id, x.paciente_id
      into v
      from public.borradores_factura_versiones x
     where x.borrador_id = r.bid
     order by x.numero_version desc
     limit 1;

    if not found or v.descartado then
      perform public.registrar_fallo_envio_facturacion(r.eid, 'descartado', true);
      continue;
    end if;

    update public.eventos_salientes e
       set proximo_intento = now() + interval '5 minutes',
           intentos        = e.intentos + 1,
           actualizado_en  = now()
     where e.id = r.eid;

    select p.centro_id into v_centro from public.pacientes p where p.id = v.paciente_id;

    evento_id := r.eid;
    borrador_id := r.bid;
    version_id := v.id;
    numero_version := v.numero_version;
    destinatario_nombre := v.destinatario_nombre;
    destinatario_nif_cifrado := v.destinatario_nif_cifrado;
    destinatario_nif_nonce := v.destinatario_nif_nonce;
    destinatario_nif_etiqueta := v.destinatario_nif_etiqueta;
    destinatario_nif_clave_version := v.destinatario_nif_clave_version;

    select coalesce(jsonb_agg(jsonb_build_object(
                      'cantidad', l.elem -> 'cantidad',
                      'precio_unitario_centimos', l.elem -> 'precio_unitario_centimos',
                      'regimen_iva', l.elem -> 'regimen_iva',
                      'tipo_iva_centesimas', l.elem -> 'tipo_iva_centesimas') order by l.ord), '[]'::jsonb)
      into lineas
      from jsonb_array_elements(v.lineas) with ordinality as l(elem, ord);

    fecha_documento := (now() at time zone public.zona_horaria_centro(coalesce(v.centro_id, v_centro)))::date;

    select s.proveedor_documento_id into ya_enviado_documento_id
      from public.borradores_factura_envios s
     where s.borrador_id = r.bid;

    return next;
    ya_enviado_documento_id := null;
  end loop;
end;
$$;

-- 7.2 · Registrar el envío: el vínculo borrador → documento y el evento a entregado, en la misma
-- transacción. Idempotente por el mismo documento; con otro, 23505.
create function public.registrar_envio_borrador(
  p_evento_id uuid,
  p_proveedor public.proveedor_facturacion,
  p_documento_id text,
  p_proyeccion_version smallint,
  p_version_id uuid,
  p_fecha_documento date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borrador uuid;
  v_paciente uuid;
  v_numero   integer;
  v_id       uuid;
  v_previo   record;
begin
  select (e.carga ->> 'borrador_id')::uuid into v_borrador
    from public.eventos_salientes e
   where e.id = p_evento_id and e.tipo = 'facturacion.enviar_borrador'
     for update;
  if v_borrador is null then
    raise exception 'El evento no es un envío de borrador' using errcode = '22023';
  end if;

  select b.paciente_id into v_paciente from public.borradores_factura b where b.id = v_borrador;
  select v.numero_version into v_numero from public.borradores_factura_versiones v where v.id = p_version_id;

  insert into public.borradores_factura_envios
    (borrador_id, version_id, numero_version, paciente_id, proveedor, proveedor_documento_id,
     proyeccion_version, fecha_documento, evento_id)
  values
    (v_borrador, p_version_id, coalesce(v_numero, 1), v_paciente, p_proveedor, p_documento_id,
     p_proyeccion_version, p_fecha_documento, p_evento_id)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select s.id, s.proveedor, s.proveedor_documento_id into v_previo
      from public.borradores_factura_envios s
     where s.borrador_id = v_borrador;
    if not found then
      raise exception 'Ese documento del programa ya pertenece a otro borrador' using errcode = '23505';
    end if;
    if v_previo.proveedor <> p_proveedor or v_previo.proveedor_documento_id <> p_documento_id then
      raise exception 'El borrador ya tiene un envío con otro documento del programa' using errcode = '23505';
    end if;
    v_id := v_previo.id;
  end if;

  update public.eventos_salientes e
     set estado = 'entregado', ultimo_error = null, proximo_intento = null, actualizado_en = now()
   where e.id = p_evento_id;
  return v_id;
end;
$$;

-- 7.3 · Registrar un fallo. En `ultimo_error` solo va un código de la lista cerrada, nunca texto libre
-- (podría arrastrar una clave). Permanente, o al octavo intento: fallido y un aviso a cada administrador.
-- Transitorio: retroceso exponencial de un minuto, con techo de seis horas.
create function public.registrar_fallo_envio_facturacion(p_evento_id uuid, p_codigo text, p_permanente boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento public.eventos_salientes%rowtype;
  v_detalle text;
begin
  if p_codigo is null or p_codigo not in
     ('red', 'limite', 'no_autorizado', 'sin_plan', 'rechazado', 'ambiguo', 'no_disponible', 'descartado') then
    raise exception 'Código de fallo desconocido' using errcode = '22023';
  end if;

  select e.* into v_evento
    from public.eventos_salientes e
   where e.id = p_evento_id and e.tipo = 'facturacion.enviar_borrador'
     for update;
  if not found then
    raise exception 'El evento no es un envío de borrador' using errcode = '22023';
  end if;
  if v_evento.estado = 'entregado' then
    return;
  end if;

  if coalesce(p_permanente, false) or v_evento.intentos >= 8 then
    update public.eventos_salientes e
       set estado = 'fallido', ultimo_error = p_codigo, proximo_intento = null, actualizado_en = now()
     where e.id = p_evento_id;

    v_detalle := case p_codigo
      when 'ambiguo' then
        'No se sabe si el borrador llegó al programa de facturación. Compruébalo allí antes de volver a prepararlo.'
      when 'descartado' then
        'El borrador se descartó antes de prepararse.'
      else
        'No se pudo preparar el borrador en el programa de facturación.'
    end;

    insert into public.notificaciones (perfil_id, tipo, titulo, detalle, origen_tabla, origen_id)
    select p.id, 'facturacion_envio_fallido', 'Borrador sin preparar en el programa', v_detalle,
           'borradores_factura', (v_evento.carga ->> 'borrador_id')::uuid
      from public.perfiles p
     where p.rol = 'administrador'::public.rol_usuario and p.estado = 'activo'::public.estado_perfil
    on conflict (perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null do nothing;
  else
    update public.eventos_salientes e
       set estado = 'pendiente',
           ultimo_error = p_codigo,
           proximo_intento = now() + least(interval '1 minute' * power(2, e.intentos), interval '6 hours'),
           actualizado_en = now()
     where e.id = p_evento_id;
  end if;
end;
$$;

-- 7.4 · Copiar el espejo. El borrador y el paciente se DERIVAN del envío: el llamante no los elige.
-- Nunca hay UPDATE: los mismos datos devuelven el id; datos distintos, 23505.
create function public.registrar_factura_espejo(
  p_proveedor public.proveedor_facturacion,
  p_proveedor_documento_id text,
  p_numero text,
  p_fecha_expedicion date,
  p_base_centimos bigint,
  p_cuota_iva_centimos bigint,
  p_total_centimos bigint,
  p_url_proveedor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_envio    record;
  v_base     numeric(12,2) := round(p_base_centimos::numeric / 100, 2);
  v_cuota    numeric(12,2) := round(p_cuota_iva_centimos::numeric / 100, 2);
  v_total    numeric(12,2) := round(p_total_centimos::numeric / 100, 2);
  v_id       uuid;
  v_previo   record;
begin
  select s.borrador_id, s.paciente_id into v_envio
    from public.borradores_factura_envios s
   where s.proveedor = p_proveedor and s.proveedor_documento_id = p_proveedor_documento_id;
  if not found then
    raise exception 'Sin envío: no hay envío para ese documento' using errcode = '23503';
  end if;

  if exists (select 1 from public.facturas_anotaciones a
              where a.proveedor = p_proveedor and a.proveedor_documento_id = p_proveedor_documento_id
                and a.tipo = 'borrado_sin_aprobar') then
    raise exception 'El documento se borró sin aprobar en el programa: no se copia su factura'
      using errcode = '23514';
  end if;

  insert into public.facturas_espejo
    (borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion,
     base, cuota_iva, total, url_proveedor)
  values
    (v_envio.borrador_id, v_envio.paciente_id, p_proveedor, p_proveedor_documento_id, p_numero,
     p_fecha_expedicion, v_base, v_cuota, v_total, p_url_proveedor)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select f.id, f.numero, f.fecha_expedicion, f.base, f.cuota_iva, f.total, f.url_proveedor into v_previo
      from public.facturas_espejo f
     where f.proveedor = p_proveedor and f.proveedor_documento_id = p_proveedor_documento_id;
    if not found
       or v_previo.numero is distinct from p_numero
       or v_previo.fecha_expedicion is distinct from p_fecha_expedicion
       or v_previo.base is distinct from v_base
       or v_previo.cuota_iva is distinct from v_cuota
       or v_previo.total is distinct from v_total
       or v_previo.url_proveedor is distinct from p_url_proveedor then
      raise exception 'El documento ya tiene una factura copiada con otros datos: no se actualiza'
        using errcode = '23505';
    end if;
    v_id := v_previo.id;
  end if;
  return v_id;
end;
$$;

-- 7.5 · Anotar lo que el programa dice de un documento. Coherente con el espejo e idempotente.
create function public.registrar_anotacion_documento(
  p_proveedor public.proveedor_facturacion,
  p_proveedor_documento_id text,
  p_tipo public.anotacion_documento_proveedor)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_borrador uuid;
  v_espejo   boolean;
  v_id       uuid;
begin
  select s.borrador_id into v_borrador
    from public.borradores_factura_envios s
   where s.proveedor = p_proveedor and s.proveedor_documento_id = p_proveedor_documento_id;
  if not found then
    raise exception 'Sin envío: no hay envío para ese documento' using errcode = '23503';
  end if;

  v_espejo := exists (select 1 from public.facturas_espejo f
                       where f.proveedor = p_proveedor and f.proveedor_documento_id = p_proveedor_documento_id);
  if p_tipo = 'borrado_sin_aprobar' and v_espejo then
    raise exception 'Un documento con factura copiada no puede haberse borrado sin aprobar'
      using errcode = '23514';
  end if;
  if p_tipo in ('rectificado', 'anulado') and not v_espejo then
    raise exception 'Un documento sin factura copiada no puede estar % en el programa', p_tipo
      using errcode = '23514';
  end if;

  insert into public.facturas_anotaciones (borrador_id, proveedor, proveedor_documento_id, tipo)
  values (v_borrador, p_proveedor, p_proveedor_documento_id, p_tipo)
  on conflict (proveedor, proveedor_documento_id, tipo) do nothing
  returning id into v_id;

  if v_id is null then
    select a.id into v_id from public.facturas_anotaciones a
     where a.proveedor = p_proveedor and a.proveedor_documento_id = p_proveedor_documento_id and a.tipo = p_tipo;
  end if;
  return v_id;
end;
$$;

-- 7.6 · Qué documentos conviene preguntar al programa. Sin lista: los envíos sin espejo y sin borrado
-- sin aprobar, los más antiguos primero. Con lista: solo los de la lista que tengan envío.
create function public.documentos_para_sincronizar(
  p_proveedor public.proveedor_facturacion,
  p_ids text[] default null,
  p_limite integer default 50)
returns table (proveedor_documento_id text, tiene_espejo boolean, anotaciones public.anotacion_documento_proveedor[])
language sql
stable
security definer
set search_path = ''
as $$
  select s.proveedor_documento_id,
         exists (select 1 from public.facturas_espejo f
                  where f.proveedor = s.proveedor and f.proveedor_documento_id = s.proveedor_documento_id),
         coalesce((select array_agg(a.tipo order by a.tipo)
                     from public.facturas_anotaciones a
                    where a.proveedor = s.proveedor and a.proveedor_documento_id = s.proveedor_documento_id),
                  '{}'::public.anotacion_documento_proveedor[])
    from public.borradores_factura_envios s
   where s.proveedor = p_proveedor
     and (case
            when p_ids is not null then s.proveedor_documento_id = any (p_ids)
            else not exists (select 1 from public.facturas_espejo f
                              where f.proveedor = s.proveedor and f.proveedor_documento_id = s.proveedor_documento_id)
                 and not exists (select 1 from public.facturas_anotaciones a
                                  where a.proveedor = s.proveedor
                                    and a.proveedor_documento_id = s.proveedor_documento_id
                                    and a.tipo = 'borrado_sin_aprobar')
          end)
   order by s.enviado_en
   limit greatest(coalesce(p_limite, 50), 0);
$$;

-- 7.7 · Avisar de una discrepancia: escala el hallazgo a los administradores, deduplicado, sin tocar el
-- espejo. El texto es fijo y no nombra al paciente (ADR-078).
create function public.notificar_discrepancia_facturacion(
  p_proveedor public.proveedor_facturacion,
  p_proveedor_documento_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_espejo uuid;
begin
  select f.id into v_espejo from public.facturas_espejo f
   where f.proveedor = p_proveedor and f.proveedor_documento_id = p_proveedor_documento_id;
  if v_espejo is null then
    raise exception 'No hay factura copiada para ese documento' using errcode = '23503';
  end if;

  insert into public.notificaciones (perfil_id, tipo, titulo, detalle, origen_tabla, origen_id)
  select p.id, 'facturacion_discrepancia', 'Factura distinta en el programa',
         'Los datos de una factura del programa de facturación ya no coinciden con los copiados. Revísala en el programa.',
         'facturas_espejo', v_espejo
    from public.perfiles p
   where p.rol = 'administrador'::public.rol_usuario and p.estado = 'activo'::public.estado_perfil
  on conflict (perfil_id, tipo, origen_tabla, origen_id) where origen_id is not null do nothing;
end;
$$;

-- 7.8 · El cursor del sincronizador: solo avanza, y devuelve el valor resultante. Con nulo no lo mueve,
-- así que sirve también para leerlo (el ajuste no es legible por service_role).
create function public.avanzar_cursor_sincronizacion(p_hasta timestamptz default null)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  insert into public.facturacion_ajuste as a (unico, sincronizado_hasta)
  values (true, p_hasta)
  on conflict (unico) do update
    set sincronizado_hasta = greatest(a.sincronizado_hasta, excluded.sincronizado_hasta)
  returning a.sincronizado_hasta;
$$;

revoke all on function public.reclamar_envios_facturacion(integer)        from public, anon, authenticated, service_role;
revoke all on function public.registrar_envio_borrador(uuid, public.proveedor_facturacion, text, smallint, uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.registrar_fallo_envio_facturacion(uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.registrar_factura_espejo(public.proveedor_facturacion, text, text, date, bigint, bigint, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.registrar_anotacion_documento(public.proveedor_facturacion, text, public.anotacion_documento_proveedor)
  from public, anon, authenticated, service_role;
revoke all on function public.documentos_para_sincronizar(public.proveedor_facturacion, text[], integer)
  from public, anon, authenticated, service_role;
revoke all on function public.notificar_discrepancia_facturacion(public.proveedor_facturacion, text)
  from public, anon, authenticated, service_role;
revoke all on function public.avanzar_cursor_sincronizacion(timestamptz)  from public, anon, authenticated, service_role;

grant execute on function public.reclamar_envios_facturacion(integer)    to service_role;
grant execute on function public.registrar_envio_borrador(uuid, public.proveedor_facturacion, text, smallint, uuid, date)
  to service_role;
grant execute on function public.registrar_fallo_envio_facturacion(uuid, text, boolean) to service_role;
grant execute on function public.registrar_factura_espejo(public.proveedor_facturacion, text, text, date, bigint, bigint, bigint, text)
  to service_role;
grant execute on function public.registrar_anotacion_documento(public.proveedor_facturacion, text, public.anotacion_documento_proveedor)
  to service_role;
grant execute on function public.documentos_para_sincronizar(public.proveedor_facturacion, text[], integer)
  to service_role;
grant execute on function public.notificar_discrepancia_facturacion(public.proveedor_facturacion, text)
  to service_role;
grant execute on function public.avanzar_cursor_sincronizacion(timestamptz) to service_role;


-- =========================================================================
-- 8 · encolar_envio_borrador: la acción «Preparar en el programa»
-- =========================================================================
-- Definer para authenticated. PRIMERO los permisos, que copian `borradores_factura_versiones_alta`:
-- el administrador, o el profesional que es autor Y está asignado. Si el borrador no existe (o no es
-- tuyo) sale el MISMO 42501: no hay oráculo de existencia, tampoco para el administrador.
create function public.encolar_envio_borrador(p_borrador_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid;
  v_paciente_id    uuid;
  v_existe         boolean := false;
  v_proveedor      public.proveedor_facturacion;
  v_ultima         record;
  v_evento_id      uuid;
  v_estado         public.estado_evento_saliente;
  v_clave          text := 'facturacion.enviar_borrador:' || p_borrador_id;
begin
  select b.profesional_id, b.paciente_id into v_profesional_id, v_paciente_id
    from public.borradores_factura b
   where b.id = p_borrador_id;
  v_existe := found;

  if not coalesce(
       v_existe
       and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
            or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
                and v_profesional_id = (select auth.uid())
                and public.es_profesional_asignado(v_paciente_id))), false) then
    raise exception 'No puedes preparar este borrador en el programa (T-026a)' using errcode = '42501';
  end if;

  -- Candado de la cabecera: serializa con el sellado de versiones y con otro encolar.
  perform 1 from public.borradores_factura b where b.id = p_borrador_id for update;

  select a.proveedor into v_proveedor from public.facturacion_ajuste a where a.unico;
  if v_proveedor is null then
    raise exception 'No se puede preparar: no hay programa de facturación conectado.' using errcode = '23514';
  end if;

  select v.numero_version, v.descartado into v_ultima
    from public.borradores_factura_versiones v
   where v.borrador_id = p_borrador_id
   order by v.numero_version desc
   limit 1;
  if not found or v_ultima.descartado then
    raise exception 'El borrador no tiene una versión que se pueda preparar.' using errcode = '23514';
  end if;

  -- Si ya hay envío, no hay nada más que hacer.
  select s.evento_id into v_evento_id
    from public.borradores_factura_envios s where s.borrador_id = p_borrador_id;
  if found then
    return v_evento_id;
  end if;

  insert into public.eventos_salientes (tipo, carga, clave_idempotencia, creado_por, proximo_intento)
  values ('facturacion.enviar_borrador', jsonb_build_object('borrador_id', p_borrador_id),
          v_clave, (select auth.uid()), now())
  on conflict (clave_idempotencia) do nothing;

  select e.id, e.estado into v_evento_id, v_estado
    from public.eventos_salientes e where e.clave_idempotencia = v_clave;

  -- El reenvío manual de un fallido: de nuevo pendiente, sin intentos ni error.
  if v_estado = 'fallido' then
    update public.eventos_salientes e
       set estado = 'pendiente', intentos = 0, proximo_intento = now(),
           ultimo_error = null, actualizado_en = now()
     where e.id = v_evento_id;
  end if;
  return v_evento_id;
end;
$$;

revoke all on function public.encolar_envio_borrador(uuid) from public, anon, authenticated, service_role;
grant execute on function public.encolar_envio_borrador(uuid) to authenticated;


-- =========================================================================
-- 9 · Congelación del borrador enviado
-- =========================================================================
-- Sin esto, una versión creada después de enviar haría que el envío apuntara a una versión que ya no es
-- la vigente. Actúa para TODO rol (también postgres y service_role). Va después del sellado (permisos) y
-- de las cotas por el orden alfabético de los nombres. Un evento fallido deja pasar: se corrige y se
-- vuelve a preparar.
create function public.fn_sellar_version_borrador_tras_envio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.borradores_factura b where b.id = new.borrador_id for key share;

  if exists (select 1 from public.borradores_factura_envios s where s.borrador_id = new.borrador_id)
     or exists (select 1 from public.eventos_salientes e
                 where e.clave_idempotencia = 'facturacion.enviar_borrador:' || new.borrador_id
                   and e.estado = 'pendiente') then
    raise exception 'el borrador ya se preparó en el programa: no admite versiones nuevas'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_sellar_version_borrador_tras_envio() from public, anon, authenticated, service_role;

create trigger sellar_version_borrador_tras_envio
  before insert on public.borradores_factura_versiones
  for each row execute function public.fn_sellar_version_borrador_tras_envio();


-- =========================================================================
-- 10 · cobros.factura_espejo_id
-- =========================================================================
alter table public.cobros add column factura_espejo_id uuid;

grant insert (factura_espejo_id) on table public.cobros to authenticated;

-- Definer: lee el espejo, que el invoker no puede leer. Solo actúa con factura. El paso 1 copia la política
-- `cobros_alta` vigente (registrado_por incluido) para authenticated y anon, ANTES de cotejar nada:
-- sin eso, el 23503 y el 23514 serían un oráculo de qué facturas existen. Después, el espejo existe y es
-- del mismo paciente.
create function public.fn_validar_cobro_factura_espejo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente uuid;
begin
  if new.factura_espejo_id is null then
    return new;
  end if;

  if current_setting('role', true) in ('authenticated', 'anon') then
    if not coalesce(
         new.registrado_por = (select auth.uid())
         and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
              or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
                  and public.es_profesional_asignado(new.paciente_id))
              or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
                  and new.paciente_id in (select p.id from public.pacientes p
                                           where p.centro_id in (select public.centros_actuales())))), false) then
      raise exception 'No puedes registrar este cobro (T-026a)' using errcode = '42501';
    end if;
  end if;

  select f.paciente_id into v_paciente from public.facturas_espejo f where f.id = new.factura_espejo_id;
  if not found then
    raise exception 'la factura del cobro no existe' using errcode = '23503';
  end if;
  if v_paciente <> new.paciente_id then
    raise exception 'la factura del cobro es de otro paciente' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_validar_cobro_factura_espejo() from public, anon, authenticated, service_role;

create trigger validar_cobro_factura_espejo
  before insert on public.cobros
  for each row execute function public.fn_validar_cobro_factura_espejo();


-- =========================================================================
-- 11 · borradores_factura_estado: el CASE ampliado
-- =========================================================================
-- Definer y stable: el invoker no puede leer el outbox. Lee la cola SOLO si el llamante pasa la política de
-- lectura de la cabecera (tercera copia de la regla de H2): si no, nulo.
create function public.estado_cola_borrador(p_borrador_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select e.estado::text
    from public.borradores_factura b
    join public.eventos_salientes e on e.clave_idempotencia = 'facturacion.enviar_borrador:' || b.id
   where b.id = p_borrador_id
     and e.estado in ('pendiente'::public.estado_evento_saliente, 'fallido'::public.estado_evento_saliente)
     and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
          or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
              and public.es_profesional_asignado(b.paciente_id)));
$$;

revoke all on function public.estado_cola_borrador(uuid) from public, anon, authenticated, service_role;
grant execute on function public.estado_cola_borrador(uuid) to authenticated;

create or replace view public.borradores_factura_estado
  with (security_invoker = true)
as
select
  b.id as borrador_id,
  u.numero_version as ultima_version,
  case
    when exists (select 1 from public.facturas_espejo e where e.borrador_id = b.id) then 'facturado'
    when exists (select 1 from public.borradores_factura_envios s where s.borrador_id = b.id) then 'enviado'
    when public.estado_cola_borrador(b.id) = 'pendiente' then 'en_cola'
    when public.estado_cola_borrador(b.id) = 'fallido' then 'fallido'
    when u.descartado then 'descartado'
    else 'sin_enviar'
  end as estado
from public.borradores_factura b
left join lateral (
  select v.numero_version, v.descartado
    from public.borradores_factura_versiones v
   where v.borrador_id = b.id
   order by v.numero_version desc
   limit 1
) u on true;


-- =========================================================================
-- 12 · Comentarios
-- =========================================================================
comment on type public.proveedor_facturacion is
  'Programas de facturación externos que la app sabe usar. Hoy uno (T-026a). Un valor nuevo exige un adaptador.';
comment on type public.anotacion_documento_proveedor is
  'Lo único que el programa puede decir de un documento después de copiarlo: se borró sin aprobar, se rectificó, se anuló (ADR-077 punto 2).';

comment on table public.borradores_factura_envios is
  'Qué versión de qué borrador salió al programa y con qué documento (ADR-077 punto 4). Solo adición. Una fila por borrador: el borrador enviado se congela.';
comment on table public.facturas_espejo is
  'Copia mínima de la factura que expidió el programa (ADR-077 punto 7: número, fecha, base, cuota, total, enlace y fecha de copia). No se actualiza nunca: una diferencia se avisa, no se pisa. Sin estado, cobros, PDF, QR, registro de facturación ni huella.';
comment on table public.facturas_anotaciones is
  'Lo que el programa dijo de un documento después de copiarlo (ADR-077 punto 2). Vocabulario cerrado, sin texto libre. Solo adición.';
comment on table public.facturacion_ajuste is
  'Una fila: qué programa hay conectado, el id de su clave en el Vault (nunca la clave) y el cursor del sincronizador. Sin políticas: authenticated no la lee.';
comment on view public.facturas_espejo_cabecera is
  'La cabecera del espejo para quien cobra: administrador, profesional asignado y técnico de los centros del paciente. Sin borrador, líneas ni destinatario.';

comment on function public.fn_validar_envio_borrador() is
  'Disparador before insert de borradores_factura_envios: la versión existe (23503), es la del borrador (23514) y el paciente es el de la cabecera (23514).';
comment on function public.guardar_clave_proveedor_facturacion(public.proveedor_facturacion, text) is
  'Solo el administrador. Valida el formato ANTES del Vault; p_clave no aparece en ningún raise ni format. Guarda en el Vault y upsert del ajuste.';
comment on function public.quitar_proveedor_facturacion() is
  'Solo el administrador. Borra la clave del Vault y vacía el ajuste. La cola pendiente se queda: sin proveedor, el consumidor no hace nada.';
comment on function public.proveedor_facturacion_activo() is
  'El programa conectado, o nulo. No revela nada más. Lo ejecuta también la ruta del drenado.';
comment on function public.estado_clave_proveedor_facturacion() is
  'Solo el administrador. Devuelve proveedor, cuatro últimos caracteres de la clave (con puntos) y la fecha. Nunca más.';
comment on function public.clave_proveedor_facturacion() is
  'La clave del Vault para el consumidor (service_role). Nulo si no hay ninguna.';
comment on function public.disparar_drenado_facturacion() is
  'La llama el cron cada cinco minutos: si hay programa y los secretos del drenado están en el Vault, pide a la ruta que drene la cola.';
comment on function public.reclamar_envios_facturacion(integer) is
  'Reclama eventos de envío con concesión de cinco minutos y devuelve la última versión (líneas sin concepto ni cita). Si esa versión está descartada, el evento pasa a fallido con el código descartado.';
comment on function public.registrar_envio_borrador(uuid, public.proveedor_facturacion, text, smallint, uuid, date) is
  'Registra el vínculo borrador-documento y entrega el evento en la misma transacción. Idempotente por el mismo documento; con otro, 23505.';
comment on function public.registrar_fallo_envio_facturacion(uuid, text, boolean) is
  'Anota un fallo con un código de la lista cerrada. Permanente u octavo intento: fallido y aviso a cada administrador activo. Transitorio: retroceso exponencial con techo de seis horas.';
comment on function public.registrar_factura_espejo(public.proveedor_facturacion, text, text, date, bigint, bigint, bigint, text) is
  'Copia el espejo derivando borrador y paciente del envío. Nunca hay UPDATE: mismos datos, mismo id; otros datos, 23505.';
comment on function public.registrar_anotacion_documento(public.proveedor_facturacion, text, public.anotacion_documento_proveedor) is
  'Anota lo que el programa dice de un documento, coherente con el espejo e idempotente por documento y tipo.';
comment on function public.documentos_para_sincronizar(public.proveedor_facturacion, text[], integer) is
  'Documentos que conviene preguntar al programa: sin lista, los envíos sin espejo ni borrado sin aprobar; con lista, los de la lista que tengan envío.';
comment on function public.notificar_discrepancia_facturacion(public.proveedor_facturacion, text) is
  'Avisa a cada administrador activo, una vez, de que una factura del programa ya no coincide con la copiada. No toca el espejo.';
comment on function public.avanzar_cursor_sincronizacion(timestamptz) is
  'El cursor del sincronizador solo avanza (greatest) y devuelve su valor; con nulo no lo mueve y sirve para leerlo.';
comment on function public.encolar_envio_borrador(uuid) is
  'Prepara un borrador en el programa: encola el evento. Permisos primero (administrador, o profesional autor y asignado) con el mismo 42501 para ajeno e inexistente. Idempotente; re-encolar un fallido lo deja pendiente.';
comment on function public.fn_sellar_version_borrador_tras_envio() is
  'Disparador before insert de las versiones: un borrador ya preparado en el programa (envío, o evento pendiente) no admite versiones nuevas, para ningún rol.';
comment on function public.fn_validar_cobro_factura_espejo() is
  'Disparador before insert de cobros con factura: copia cobros_alta (42501), y luego el espejo existe (23503) y es del mismo paciente (23514).';
comment on function public.estado_cola_borrador(uuid) is
  'El estado del evento de un borrador (pendiente o fallido), solo para quien lee la cabecera; si no, nulo. Lo usa borradores_factura_estado.';
comment on column public.cobros.factura_espejo_id is
  'La factura del programa que este cobro paga, si se indicó. Sin FK: el espejo es de solo adición; lo valida validar_cobro_factura_espejo.';
