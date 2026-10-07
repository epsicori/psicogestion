-- =========================================================================
-- T-023 · Cobros, cobros parciales y pendiente de cobro
--
-- El pendiente es lo devengado menos lo cobrado (P1 = (ii)): citas realizadas sin bono a la
-- tarifa vigente su día local, más los bonos, menos la suma de `cobros`. Nada se copia del
-- programa de facturación (ADR-077; ADR-053 g: cobros y pendiente son de la app). Una devolución
-- es un cobro negativo con su motivo, y la base lo exige (P5 = (a)). La vista
-- `pendiente_paciente` es definer con barrera: es la puerta lateral de este ticket, y su where
-- repite cobros_lectura de T-021 (20261011120000_economico_esquema.sql, 10.4).
--
-- Contenido: (a) cobros.motivo y su check; (b) disparador validar_cobro (fecha futura);
-- (c) la vista pendiente_paciente, consolidada en el superviviente de una fusión; (d) dos
-- funciones de lectura (resumen_pendiente, profesionales_del_pendiente). Ninguna política nueva,
-- ningún UPDATE ni DELETE.
-- =========================================================================


-- =========================================================================
-- (a) · cobros.motivo (P5)
-- =========================================================================
alter table public.cobros add column motivo text;

alter table public.cobros
  add constraint cobros_devolucion_motivo_ck
  check (importe > 0 or (motivo is not null and length(trim(motivo)) > 0));

comment on column public.cobros.motivo is
  'Por qué se devuelve. Obligatorio si importe < 0 (cobros_devolucion_motivo_ck). '
  'Económico, nunca clínico: lo lee el técnico administrativo (T-023).';

grant insert (motivo) on table public.cobros to authenticated;


-- =========================================================================
-- (b) · Una fecha futura no entra por ninguna puerta
-- =========================================================================
create function public.fn_validar_cobro()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_centro uuid;
  v_hoy    date;
begin
  -- postgres y service_role (fijación, importador) quedan exentos, como en fn_alta_tarifa.
  if current_setting('role', true) in ('authenticated', 'anon') then
    -- Invoker: si quien llama no ve al paciente, v_centro es nulo y vale la zona de la
    -- organización. El 23514 depende solo de la fecha; después, la RLS rechaza con 42501.
    select p.centro_id into v_centro from public.pacientes p where p.id = new.paciente_id;
    v_hoy := (now() at time zone public.zona_horaria_centro(v_centro))::date;
    if new.fecha > v_hoy then
      raise exception 'La fecha de un cobro no puede ser posterior a hoy (fecha del centro) (T-023)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_validar_cobro() from public;

comment on function public.fn_validar_cobro() is
  'Disparador before insert sobre cobros (T-023): la fecha no puede ser posterior a hoy en la zona '
  'del centro del paciente (23514) para authenticated y anon. Invoker, como fn_alta_tarifa.';

create trigger validar_cobro
  before insert on public.cobros
  for each row execute function public.fn_validar_cobro();


-- =========================================================================
-- (c) · pendiente_paciente: definer con barrera (la puerta lateral), consolidada en el superviviente
-- =========================================================================
-- Una fila por paciente SUPERVIVIENTE (fusionado_en is null): suma lo suyo y lo de sus absorbidos
-- (fusionado_en = p.id; un salto basta, ADR-031 y fn_normalizar_fusion_paciente). Sin CTE y con el
-- where en el nivel exterior: es lo que security_barrier protege frente a los predicados del
-- llamante. La tarifa se resuelve contra tarifas_paciente del paciente de la cita (c.paciente_id),
-- no contra la vista invoker tarifas_paciente_vigencias: order by vigente_desde desc, orden desc
-- limit 1 es [vigente_desde, siguiente), incluido el intervalo vacío de una sustitución el mismo
-- día. El where es cobros_lectura con paciente_id -> p.id (el del superviviente); el alias interior
-- es p2 (y no p, como en la política) solo para no tapar el p exterior.
create view public.pendiente_paciente
  with (security_invoker = false, security_barrier = true)
as
select
  p.id                                                      as paciente_id,
  p.profesional_id,
  ((s.importe + b.importe) * 100)::bigint                   as devengado_centimos,
  (k.importe * 100)::bigint                                 as cobrado_centimos,
  (greatest(s.importe + b.importe - k.importe, 0) * 100)::bigint as pendiente_centimos,
  (greatest(k.importe - s.importe - b.importe, 0) * 100)::bigint as excedente_centimos,
  (case
     when s.importe + b.importe > k.importe then 'pendiente'
     when s.importe + b.importe = k.importe then 'cobrado'
     else 'cobrado_de_mas'
   end)::text                                               as estado,
  s.sin_tarifa                                              as citas_sin_tarifa
from public.pacientes p
cross join lateral (
  select coalesce(sum(x.precio), 0)::numeric                as importe,
         count(*)::integer                                  as sesiones,
         (count(*) filter (where x.precio is null))::integer as sin_tarifa
  from (
    select coalesce(
             (select t.importe
                from public.tarifas_paciente t
               where t.paciente_id     = c.paciente_id
                 and t.tipo_terapia_id = c.tipo_terapia_id
                 and t.vigente_desde  <= (c.inicio at time zone c.zona_horaria)::date
               order by t.vigente_desde desc, t.orden desc
               limit 1),
             tt.tarifa_base) as precio
      from public.citas c
      left join public.tipos_terapia tt on tt.id = c.tipo_terapia_id
     where c.paciente_id in (select p.id
                             union all
                             select m.id from public.pacientes m where m.fusionado_en = p.id)
       and c.estado = 'realizada'::public.estado_cita
       and c.bono_id is null
  ) x
) s
cross join lateral (
  select coalesce(sum(bo.importe), 0)::numeric as importe, count(*)::integer as bonos
    from public.bonos bo
   where bo.paciente_id in (select p.id
                            union all
                            select m.id from public.pacientes m where m.fusionado_en = p.id)
) b
cross join lateral (
  select coalesce(sum(co.importe), 0)::numeric as importe, count(*)::integer as cobros
    from public.cobros co
   where co.paciente_id in (select p.id
                            union all
                            select m.id from public.pacientes m where m.fusionado_en = p.id)
) k
where p.fusionado_en is null
  and (s.sesiones > 0 or b.bonos > 0 or k.cobros > 0)
  and (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and public.es_profesional_asignado(p.id))
    or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and p.id in (
          select p2.id from public.pacientes p2
           where p2.centro_id in (select public.centros_actuales())
        ))
  );

comment on view public.pendiente_paciente is
  'Pendiente por paciente superviviente: lo devengado (citas realizadas sin bono a la tarifa '
  'vigente su día local, más los bonos) menos lo cobrado. Suma lo suyo y lo de sus absorbidos '
  '(fusionado_en = p.id, un salto, ADR-031); el absorbido no tiene fila. La tarifa de cada cita se '
  'resuelve contra el paciente de la cita. profesional_id y el recorte por rol son los del '
  'superviviente. Definer con barrera: el técnico no lee citas ni tarifas. El where repite '
  'cobros_lectura; si cambia una, cambia la otra (T-023).';
comment on column public.pendiente_paciente.citas_sin_tarifa is
  'Sesiones realizadas que cuentan 0 por no tener precio. Se enseña, no se entierra (P3).';

revoke all on table public.pendiente_paciente from public, anon, authenticated, service_role;
grant select on table public.pendiente_paciente to authenticated;


-- =========================================================================
-- (d) · Dos funciones de lectura (ronda 2: A-H1, A-H3)
-- =========================================================================
-- Invoker a propósito: leen la vista (definer, que recorta por rol_actual()) y directorio_perfiles
-- (definer). No necesitan privilegio propio y no abren nada que la vista no abra.
create function public.resumen_pendiente(p_profesional_id uuid default null)
returns table (pendiente_total_centimos bigint,
               pacientes_con_pendiente  integer,
               pacientes_cobrado_de_mas integer,
               filas                    integer)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(sum(v.pendiente_centimos), 0)::bigint,
         (count(*) filter (where v.estado = 'pendiente'))::integer,
         (count(*) filter (where v.estado = 'cobrado_de_mas'))::integer,
         count(*)::integer
    from public.pendiente_paciente v
   where p_profesional_id is null or v.profesional_id = p_profesional_id;
$$;

revoke all on function public.resumen_pendiente(uuid) from public, anon;
grant execute on function public.resumen_pendiente(uuid) to authenticated;

comment on function public.resumen_pendiente(uuid) is
  'Cifras exactas del pendiente que ve quien llama, que max_rows no recorta. p_profesional_id solo '
  'estrecha: se parte de lo que la vista ya deja ver (T-023).';

create function public.profesionales_del_pendiente()
returns table (id uuid, nombre_completo text)
language sql stable security invoker set search_path = ''
as $$
  select d.id, d.nombre_completo
    from public.directorio_perfiles d
   where d.id in (select v.profesional_id from public.pendiente_paciente v)
   order by d.nombre_completo, d.id;
$$;

revoke all on function public.profesionales_del_pendiente() from public, anon;
grant execute on function public.profesionales_del_pendiente() to authenticated;

comment on function public.profesionales_del_pendiente() is
  'Un profesional por cada fila visible del pendiente. El nombre sale de directorio_perfiles porque '
  'perfiles solo enseña la fila propia; su tamaño lo acota el número de perfiles, no el de '
  'pacientes (T-023).';
