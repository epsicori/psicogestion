-- T-047 · La vista anual de la agenda como mapa de densidad: dos lecturas nuevas, agregadas en
-- la base. Solo crea; no modifica ni borra nada existente.
--
--   · agenda_densidad_anual()       recuentos por día local, sin las canceladas (D1).
--   · agenda_profesionales_anuales()  quién tiene citas visibles en el año, para el selector.
--
-- Las dos son `security invoker` por la misma razón que agenda_citas_rango(): en definer el
-- técnico leería la organización entera. Mismas dos ramas disjuntas por rol: `citas` solo para
-- administrador y profesional (filtro explícito con rol_actual(): la política deja pasar
-- profesional_id = auth.uid() sin mirar el rol) y `citas_agenda` para el técnico.

-- ---------------------------------------------------------------------------
-- Recuentos por día
-- ---------------------------------------------------------------------------

create function public.agenda_densidad_anual(
  p_desde          timestamptz,
  p_hasta          timestamptz,
  p_zona           text,
  p_centro_id      uuid default null,
  p_profesional_id uuid default null
)
returns table (dia date, recuento integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'agenda_densidad_anual: faltan los extremos del rango'
      using errcode = '22023';
  end if;
  if p_hasta <= p_desde then
    raise exception 'agenda_densidad_anual: rango al revés o sin duración'
      using errcode = '22023';
  end if;
  -- La zona se valida antes que la cota del año, que la usa: con la zona nula la comparación
  -- daría nulo y dejaría pasar.
  if not public.es_zona_iana(p_zona) then
    raise exception 'agenda_densidad_anual: zona horaria no admitida'
      using errcode = '22023';
  end if;
  if p_hasta > ((p_desde at time zone p_zona) + interval '1 year') at time zone p_zona then
    raise exception 'agenda_densidad_anual: más de un año natural'
      using errcode = '22023';
  end if;

  -- Toda tabla lleva alias, y se agrupa y ordena por posición: `dia` y `recuento` son
  -- parámetros de salida y un nombre sin cualificar sería ambiguo en ejecución.
  return query
  with visibles as (
    select c.inicio, c.estado, c.centro_id, c.profesional_id
      from public.citas c
     where c.inicio >= p_desde and c.inicio < p_hasta
       and (select public.rol_actual()) in ('administrador'::public.rol_usuario,
                                           'profesional_sanitario'::public.rol_usuario)
    union all
    select a.inicio, a.estado, a.centro_id, a.profesional_id
      from public.citas_agenda a
     where a.inicio >= p_desde and a.inicio < p_hasta
  )
  select (v.inicio at time zone p_zona)::date, count(*)::integer
    from visibles v
   where v.estado <> 'cancelada'::public.estado_cita
     and (p_centro_id is null or v.centro_id = p_centro_id)
     and (p_profesional_id is null or v.profesional_id = p_profesional_id)
   group by 1
   order by 1;
end;
$$;

comment on function public.agenda_densidad_anual(timestamptz, timestamptz, text, uuid, uuid) is
  'Recuentos de citas por día local de su inicio en [desde, hasta) —como mucho un año natural en '
  'la zona; si no, 22023—, todas salvo las canceladas (D1), con filtros opcionales de centro y '
  'profesional. Dos ramas en union all DISJUNTAS POR ROL (citas solo administrador y profesional, '
  'con rol_actual(); citas_agenda solo el técnico). Security INVOKER: en definer el técnico leería '
  'la organización entera. Devuelve como mucho 366 filas y ninguna columna de la cita. T-047.';

revoke all on function public.agenda_densidad_anual(timestamptz, timestamptz, text, uuid, uuid)
  from public, anon, service_role;
grant execute on function public.agenda_densidad_anual(timestamptz, timestamptz, text, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Profesionales con citas visibles en el año (P1-a)
-- ---------------------------------------------------------------------------

create function public.agenda_profesionales_anuales(
  p_desde     timestamptz,
  p_hasta     timestamptz,
  p_zona      text,
  p_centro_id uuid default null
)
returns table (profesional_id uuid, profesional_nombre text)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'agenda_profesionales_anuales: faltan los extremos del rango'
      using errcode = '22023';
  end if;
  if p_hasta <= p_desde then
    raise exception 'agenda_profesionales_anuales: rango al revés o sin duración'
      using errcode = '22023';
  end if;
  if not public.es_zona_iana(p_zona) then
    raise exception 'agenda_profesionales_anuales: zona horaria no admitida'
      using errcode = '22023';
  end if;
  if p_hasta > ((p_desde at time zone p_zona) + interval '1 year') at time zone p_zona then
    raise exception 'agenda_profesionales_anuales: más de un año natural'
      using errcode = '22023';
  end if;

  -- Sin filtro de estado: como el mes, cuya lista sale de todas las filas visibles.
  return query
  with visibles as (
    select c.centro_id, c.profesional_id
      from public.citas c
     where c.inicio >= p_desde and c.inicio < p_hasta
       and (select public.rol_actual()) in ('administrador'::public.rol_usuario,
                                           'profesional_sanitario'::public.rol_usuario)
    union all
    select a.centro_id, a.profesional_id
      from public.citas_agenda a
     where a.inicio >= p_desde and a.inicio < p_hasta
  )
  select distinct v.profesional_id, dp.nombre_completo::text
    from visibles v
    left join public.directorio_perfiles dp on dp.id = v.profesional_id
   where p_centro_id is null or v.centro_id = p_centro_id
   order by 2, 1;
end;
$$;

comment on function public.agenda_profesionales_anuales(timestamptz, timestamptz, text, uuid) is
  'Los profesionales (id y nombre) con alguna cita visible en [desde, hasta) —como mucho un año '
  'natural en la zona—, canceladas incluidas, como la lista del mes. Mismas dos ramas disjuntas '
  'por rol y mismas guardas que agenda_densidad_anual(). Security INVOKER. T-047.';

revoke all on function public.agenda_profesionales_anuales(timestamptz, timestamptz, text, uuid)
  from public, anon, service_role;
grant execute on function public.agenda_profesionales_anuales(timestamptz, timestamptz, text, uuid)
  to authenticated;
