-- T-023b · Facturas del espejo en Facturación: asignar un cobro anterior a una factura.
--
-- ADR-053 (g): lo cobrado es lo que registra la app; ADR-077: el espejo no tiene estado de pago.
-- Esta migración añade UNA tabla de solo adición (`cobros_facturas`: «este cobro anterior es de esta
-- factura»), la lectura única de «qué cobros son de una factura» (`cobros_por_factura`), la cota de las
-- devoluciones, dos funciones de lectura para la pantalla y una política de alta y una de lectura nuevas.
-- Ningún UPDATE ni DELETE sobre nada existente. El pendiente (`pendiente_paciente`) NO se toca: enlazar un
-- cobro a una factura no lo mueve (el cobro ya contaba). Diseño: `tickets/T-023b/diseno.md`.


-- =========================================================================
-- (a) Índices (CA10)
-- =========================================================================
create index cobros_paciente_idx       on public.cobros (paciente_id);
create index cobros_factura_espejo_idx on public.cobros (factura_espejo_id) where factura_espejo_id is not null;


-- =========================================================================
-- (b) La tabla de asignación
-- =========================================================================
create table public.cobros_facturas (
  id                uuid        primary key default gen_random_uuid(),
  cobro_id          uuid        not null,  -- sin FK: cobros es de solo adición (FOR KEY SHARE pide UPDATE)
  factura_espejo_id uuid        not null,  -- sin FK: facturas_espejo es de solo adición
  creada_por        uuid        not null default auth.uid() references public.perfiles(id),
  creada_en         timestamptz not null default now(),
  constraint cobros_facturas_cobro_unico unique (cobro_id)
);
create index cobros_facturas_factura_idx on public.cobros_facturas (factura_espejo_id);
alter table public.cobros_facturas enable row level security;

comment on table public.cobros_facturas is
  'Una fila = «este cobro anterior es de esta factura del programa» (T-023b). Nunca se borra ni se cambia: '
  'desasignar no existe. El cobro y la factura se validan en fn_validar_cobro_factura(). Un cobro, una factura '
  '(unique cobro_id); el cobro enlazado al registrarse (cobros.factura_espejo_id) también cuenta.';


-- =========================================================================
-- (c) Permisos (capa 1): authenticated lee y solo inserta las dos columnas que decide el llamante
-- =========================================================================
revoke all on table public.cobros_facturas from public, anon, authenticated, service_role;
revoke update, delete, truncate on table public.cobros_facturas from postgres;
grant select on table public.cobros_facturas to authenticated;
grant insert (cobro_id, factura_espejo_id) on table public.cobros_facturas to authenticated;


-- =========================================================================
-- (d) Capas 2 y 3, auditoría y catálogo
-- =========================================================================
create trigger impedir_modificacion_cobros_facturas
  before update or delete on public.cobros_facturas
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_truncado_cobros_facturas
  before truncate on public.cobros_facturas
  for each statement execute function public.fn_impedir_modificacion();
create trigger auditar_cobros_facturas
  after insert on public.cobros_facturas
  for each row execute function public.fn_auditar('id');

insert into public.tablas_solo_adicion (tabla, motivo) values
  ('cobros_facturas', 'Qué factura del programa paga un cobro anterior (T-023b). Una asignación no se deshace.');


-- =========================================================================
-- (e) La lectura única: qué cobros son de una factura
-- =========================================================================
create view public.cobros_por_factura
  with (security_invoker = true)
as
select c.factura_espejo_id, c.id as cobro_id, c.paciente_id, c.importe, c.fecha, c.forma_pago,
       c.referencia, c.motivo, 'al_registrar'::text as via, c.registrado_en as enlazado_en
  from public.cobros c
 where c.factura_espejo_id is not null
union all
select a.factura_espejo_id, c.id, c.paciente_id, c.importe, c.fecha, c.forma_pago,
       c.referencia, c.motivo, 'asignado'::text, a.creada_en
  from public.cobros_facturas a
  join public.cobros c on c.id = a.cobro_id;

revoke all on table public.cobros_por_factura from public, anon, authenticated, service_role;
grant select on table public.cobros_por_factura to authenticated;

comment on view public.cobros_por_factura is
  'La ÚNICA forma de saber qué cobros son de una factura. Nadie reconstruye esta unión: ni la aplicación, ni '
  'otra función, ni otra vista (T-023b CA8). Invoker: hereda cobros_lectura y cobros_facturas_lectura.';


-- =========================================================================
-- (f) Cota de las devoluciones: lo cobrado neto de una factura no baja de 0
-- =========================================================================
-- Invoker; solo la llaman los dos disparadores (definer, dueño postgres). Serializa por factura con un candado
-- de consejo de transacción, solo para importes negativos. La sentencia siguiente al candado lleva instantánea
-- nueva en READ COMMITTED (el de PostgREST): ve lo que confirmó quien lo tenía. En REPEATABLE READ la segunda
-- devolución chocaría por serialización, no se colaría.
create function public.fn_comprobar_devolucion_en_factura(p_factura_espejo_id uuid, p_importe numeric)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_suma numeric;
begin
  if p_importe >= 0 then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cobros_por_factura:' || p_factura_espejo_id::text, 0));
  select coalesce(sum(v.importe), 0) into v_suma
    from public.cobros_por_factura v
   where v.factura_espejo_id = p_factura_espejo_id;
  if v_suma + p_importe < 0 then
    raise exception 'la devolución supera lo cobrado en la factura' using errcode = '23514';
  end if;
end;
$$;

revoke all on function public.fn_comprobar_devolucion_en_factura(uuid, numeric) from public, anon, authenticated, service_role;


-- =========================================================================
-- (g) Disparador de validación de cobros_facturas
-- =========================================================================
-- Definer: lee el espejo, que el invoker no puede leer. Orden: nulos (los frena el NOT NULL) → permisos
-- (réplica de `cobros_alta`, mismo texto para cobro inexistente y cobro ajeno: sin oráculo) → factura →
-- mismo paciente → un cobro, una factura → cota de devoluciones.
create function public.fn_validar_cobro_factura()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro   record;
  v_existe  boolean;
  v_factura_paciente uuid;
begin
  if new.cobro_id is null or new.factura_espejo_id is null then
    return new;
  end if;

  select c.paciente_id, c.importe, c.factura_espejo_id into v_cobro
    from public.cobros c where c.id = new.cobro_id;
  v_existe := found;

  if current_setting('role', true) in ('authenticated', 'anon') then
    new.creada_por := (select auth.uid());
    new.creada_en := now();
    if not v_existe
       or not coalesce(
         (select public.rol_actual()) = 'administrador'::public.rol_usuario
         or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
             and public.es_profesional_asignado(v_cobro.paciente_id))
         or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
             and v_cobro.paciente_id in (select p.id from public.pacientes p
                                          where p.centro_id in (select public.centros_actuales()))), false) then
      raise exception 'No puedes asignar este cobro (T-023b)' using errcode = '42501';
    end if;
  elsif not v_existe then
    raise exception 'el cobro asignado no existe' using errcode = '23503';
  end if;

  select f.paciente_id into v_factura_paciente from public.facturas_espejo f where f.id = new.factura_espejo_id;
  if not found then
    raise exception 'la factura asignada no existe' using errcode = '23503';
  end if;
  if v_factura_paciente is distinct from v_cobro.paciente_id then
    raise exception 'la factura asignada es de otro paciente' using errcode = '23514';
  end if;

  if v_cobro.factura_espejo_id is not null
     or exists (select 1 from public.cobros_por_factura v where v.cobro_id = new.cobro_id) then
    raise exception 'el cobro ya está enlazado a una factura' using errcode = '23514';
  end if;

  perform public.fn_comprobar_devolucion_en_factura(new.factura_espejo_id, v_cobro.importe);
  return new;
end;
$$;

revoke all on function public.fn_validar_cobro_factura() from public, anon, authenticated, service_role;

create trigger validar_cobro_factura
  before insert on public.cobros_facturas
  for each row execute function public.fn_validar_cobro_factura();


-- =========================================================================
-- (h) Políticas
-- =========================================================================
-- El `exists` sobre cobros corre bajo cobros_lectura; no hay recursión (cobros no consulta cobros_facturas).
-- La política es la segunda pared: el disparador ya lanzó 42501 antes.
create policy cobros_facturas_lectura on public.cobros_facturas
  for select to authenticated
  using (exists (select 1 from public.cobros c where c.id = cobros_facturas.cobro_id));

create policy cobros_facturas_alta on public.cobros_facturas
  for insert to authenticated
  with check (
    creada_por = (select auth.uid())
    -- Un cobro_id nulo pasa esta política para que lo pare el NOT NULL (23502, CA7): Postgres evalúa el
    -- WITH CHECK antes que las restricciones de columna y daría 42501. No entra ninguna fila.
    and (cobro_id is null
         or exists (select 1 from public.cobros c
                     where c.id = cobros_facturas.cobro_id
                       and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
                            or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
                                and public.es_profesional_asignado(c.paciente_id))
                            or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
                                and c.paciente_id in (select p.id from public.pacientes p
                                                       where p.centro_id in (select public.centros_actuales()))))))
  );


-- =========================================================================
-- (i) T-026a con la cota de devoluciones
-- =========================================================================
-- El cuerpo de 20261014120000_proveedor_facturacion.sql (sección 10) COPIADO sin un carácter distinto, y una
-- sola línea nueva justo antes del `return new` final: la cota de las devoluciones, igual en las dos vías.
create or replace function public.fn_validar_cobro_factura_espejo()
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
  perform public.fn_comprobar_devolucion_en_factura(new.factura_espejo_id, new.importe);
  return new;
end;
$$;

revoke all on function public.fn_validar_cobro_factura_espejo() from public, anon, authenticated, service_role;


-- =========================================================================
-- (j) Funciones de lectura (invoker): el listado y los cobros asignables
-- =========================================================================
create function public.listado_facturas_espejo(
  p_desde date,
  p_hasta date,
  p_forma_pago public.forma_pago default null,
  p_profesional_id uuid default null,
  p_limite integer default 20,
  p_desplazamiento integer default 0)
returns table (
  id uuid,
  paciente_id uuid,
  paciente_nombre text,
  paciente_apellidos text,
  paciente_fusionado boolean,
  proveedor public.proveedor_facturacion,
  numero text,
  fecha_expedicion date,
  total_centimos bigint,
  url_proveedor text,
  cobros jsonb,
  cobros_sin_factura integer,
  total_filas bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with pagina as materialized (
    select f.id, f.paciente_id, f.proveedor, f.numero, f.fecha_expedicion, f.total, f.url_proveedor,
           p.nombre as paciente_nombre, p.apellidos as paciente_apellidos,
           (p.fusionado_en is not null) as paciente_fusionado,
           count(*) over () as total_filas
      from public.facturas_espejo_cabecera f
      left join public.pacientes p on p.id = f.paciente_id
     where f.fecha_expedicion between p_desde and p_hasta
       and (p_forma_pago is null
            or exists (select 1 from public.cobros_por_factura v
                        where v.factura_espejo_id = f.id and v.forma_pago = p_forma_pago))
       and (p_profesional_id is null or p.profesional_id = p_profesional_id)
     order by f.fecha_expedicion desc, f.numero desc, f.id
     limit least(greatest(coalesce(p_limite, 20), 1), 100)
    offset greatest(coalesce(p_desplazamiento, 0), 0)
  )
  select pg.id, pg.paciente_id, pg.paciente_nombre, pg.paciente_apellidos, pg.paciente_fusionado,
         pg.proveedor, pg.numero, pg.fecha_expedicion, (pg.total * 100)::bigint, pg.url_proveedor,
         coalesce((select jsonb_agg(jsonb_build_object(
                            'cobro_id', v.cobro_id,
                            'importe_centimos', (v.importe * 100)::bigint,
                            'fecha', v.fecha,
                            'forma_pago', v.forma_pago,
                            'referencia', v.referencia,
                            'motivo', v.motivo)
                          order by v.fecha, v.enlazado_en, v.cobro_id)
                     from public.cobros_por_factura v
                    where v.factura_espejo_id = pg.id), '[]'::jsonb),
         (select count(*)::integer
            from public.cobros c
           where c.paciente_id = pg.paciente_id
             and not exists (select 1 from public.cobros_por_factura v2 where v2.cobro_id = c.id)),
         pg.total_filas
    from pagina pg
   order by pg.fecha_expedicion desc, pg.numero desc, pg.id;
$$;

revoke all on function public.listado_facturas_espejo(date, date, public.forma_pago, uuid, integer, integer)
  from public, anon, service_role;
grant execute on function public.listado_facturas_espejo(date, date, public.forma_pago, uuid, integer, integer)
  to authenticated;

comment on function public.listado_facturas_espejo(date, date, public.forma_pago, uuid, integer, integer) is
  'Facturas del espejo visibles para quien pide (cabecera con barrera), por fecha de expedición, con los cobros de '
  'cada una leídos de cobros_por_factura. Sin parámetro de estado: el pendiente es por paciente (T-023b). '
  'Una página de hasta 100 filas; total_filas es el total filtrado.';

create function public.cobros_asignables(p_factura_espejo_id uuid)
returns table (
  cobro_id uuid,
  importe_centimos bigint,
  fecha date,
  forma_pago public.forma_pago,
  referencia text,
  motivo text)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, (c.importe * 100)::bigint, c.fecha, c.forma_pago, c.referencia, c.motivo
    from public.cobros c
   where c.paciente_id = (select f.paciente_id from public.facturas_espejo_cabecera f
                           where f.id = p_factura_espejo_id)
     and not exists (select 1 from public.cobros_por_factura v where v.cobro_id = c.id)
   order by c.fecha desc, c.registrado_en desc, c.id
   limit 201;
$$;

revoke all on function public.cobros_asignables(uuid) from public, anon, service_role;
grant execute on function public.cobros_asignables(uuid) to authenticated;

comment on function public.cobros_asignables(uuid) is
  'Cobros del paciente de la factura que no están en ninguna factura (hasta 201: la acción sabe si hay más de 200). '
  'Si quien pide no ve la factura, no devuelve nada (T-023b).';
