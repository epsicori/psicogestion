-- T-043 · El hueco raro: agenda_bloques_profesional dice, por cada tramo libre, cuántos minutos
-- quedarían hasta la cita siguiente cuando no cabe otra sesión (tickets/T-043/diseno.md §1.1).
-- La salida cambia de forma y CREATE OR REPLACE no puede: se recrea (sin dependientes en SQL).
-- El cuerpo es el de 20261005120000 con tres añadidos: dos variables, el bloque del hueco y
-- la frase del comentario. La puerta de permisos y los grants se repiten tal cual.

drop function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint);

create function public.agenda_bloques_profesional(
  p_profesional_id   uuid,
  p_centro_id        uuid,
  p_desde            date,
  p_hasta            date,
  p_duracion_minutos smallint
)
returns table (
  fecha      date,
  hora_local time,
  inicio     timestamptz,
  fin        timestamptz,
  estado     text,
  hueco_raro_minutos integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol      public.rol_usuario := (select public.rol_actual());
  v_zona     text;
  v_dur      interval;
  v_desc     interval;
  v_dia      date;
  v_franja   record;
  v_f_ini    timestamptz;
  v_f_fin    timestamptz;
  v_cursor   timestamptz;
  v_limite   timestamptz;
  v_limite2  timestamptz;
  v_ahora    timestamptz := now();
  v_tras     timestamptz;
  v_sig      timestamptz;
begin
  -- Los permisos, ANTES que cualquier cotejo de parámetros.
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;
  if not (
    v_rol = 'administrador'::public.rol_usuario
    or p_profesional_id = (select auth.uid())
    or (
      v_rol = 'tecnico_administrativo'::public.rol_usuario
      and p_centro_id in (select public.centros_actuales())
    )
  ) then
    raise exception 'No autorizado para ver esta agenda.' using errcode = '42501';
  end if;

  if p_profesional_id is null or p_centro_id is null or p_desde is null or p_hasta is null
     or p_duracion_minutos is null then
    raise exception 'agenda_bloques_profesional: faltan parámetros.' using errcode = '22023';
  end if;
  if p_hasta < p_desde then
    raise exception 'agenda_bloques_profesional: hasta es anterior a desde.' using errcode = '22023';
  end if;
  if p_hasta - p_desde + 1 > 62 then
    raise exception 'agenda_bloques_profesional: como mucho 62 días.' using errcode = '22023';
  end if;
  if p_duracion_minutos not between 5 and 480 then
    raise exception 'agenda_bloques_profesional: duración entre 5 y 480 minutos.' using errcode = '22023';
  end if;

  perform public.alta_exigir_profesional(p_profesional_id);

  v_zona := public.zona_horaria_centro(p_centro_id);
  v_dur  := make_interval(mins => p_duracion_minutos);
  v_desc := public.alta_descanso(p_profesional_id);

  for v_dia in select p_desde + g.n from generate_series(0, p_hasta - p_desde) g(n) loop
    -- Un festivo o una ausencia de día entero salta el día.
    if exists (
      select 1 from public.disponibilidad d
       where d.perfil_id = p_profesional_id
         and d.tipo in ('festivo', 'ausencia')
         and d.hora_inicio is null
         and (d.centro_id is null or d.centro_id = p_centro_id)
         and d.desde <= v_dia
         and (d.hasta is null or d.hasta >= v_dia)
    ) then
      continue;
    end if;

    for v_franja in
      select d.hora_inicio, d.hora_fin, d.zona_horaria
        from public.disponibilidad d
       where d.perfil_id = p_profesional_id
         and d.tipo = 'franja'
         and d.dia_semana = extract(isodow from v_dia)::integer
         and (d.centro_id is null or d.centro_id = p_centro_id)
         and d.desde <= v_dia
         and (d.hasta is null or d.hasta >= v_dia)
       order by d.hora_inicio
    loop
      select r.instante into v_f_ini
        from public.resolver_hora_local(v_franja.zona_horaria, v_dia + v_franja.hora_inicio) r;
      select r.instante into v_f_fin
        from public.resolver_hora_local(v_franja.zona_horaria, v_dia + v_franja.hora_fin) r;
      v_cursor := v_f_ini;

      while v_cursor + v_dur <= v_f_fin loop
        -- Bloqueos: citas del profesional en CUALQUIER centro (con el descanso), y ausencias
        -- o festivos parciales que tocan el tramo. El salto va al final del bloqueo.
        select max(upper(c.rango_bloqueante)) into v_limite
          from public.citas c
         where c.profesional_id = p_profesional_id
           and c.estado in ('programada', 'confirmada', 'realizada')
           and c.rango_bloqueante && tstzrange(v_cursor, v_cursor + v_dur + v_desc, '[)');

        select max(upper(tstzrange(
                 (v_dia + d.hora_inicio) at time zone d.zona_horaria,
                 (v_dia + d.hora_fin)    at time zone d.zona_horaria,
                 '[)'))) into v_limite2
          from public.disponibilidad d
         where d.perfil_id = p_profesional_id
           and d.tipo in ('festivo', 'ausencia')
           and d.hora_inicio is not null
           and (d.centro_id is null or d.centro_id = p_centro_id)
           and d.desde <= v_dia
           and (d.hasta is null or d.hasta >= v_dia)
           and tstzrange(v_cursor, v_cursor + v_dur, '[)') && tstzrange(
                 (v_dia + d.hora_inicio) at time zone d.zona_horaria,
                 (v_dia + d.hora_fin)    at time zone d.zona_horaria,
                 '[)');

        v_limite := greatest(v_limite, v_limite2);

        if v_cursor > v_ahora then
          fecha      := v_dia;
          hora_local := (v_cursor at time zone v_zona)::time;
          inicio     := v_cursor;
          fin        := v_cursor + v_dur;
          estado     := case when v_limite is not null then 'ocupado' else 'libre' end;

          -- T-043 · hueco raro: tras esta cita (con descanso), la cita siguiente de la franja
          -- empieza antes de que quepa otra sesión. Solo en tramos libres.
          hueco_raro_minutos := null;
          if v_limite is null then
            v_tras := v_cursor + v_dur + v_desc;
            select min(c.inicio) into v_sig
              from public.citas c
             where c.profesional_id = p_profesional_id
               and c.estado in ('programada', 'confirmada', 'realizada')
               and c.inicio >= v_tras
               and c.inicio <  v_f_fin;
            if v_sig is not null
               and v_sig > v_tras
               and v_sig < v_tras + v_dur + v_desc
               and not exists (
                 select 1 from public.disponibilidad d
                  where d.perfil_id = p_profesional_id
                    and d.tipo in ('festivo', 'ausencia')
                    and d.hora_inicio is not null
                    and (d.centro_id is null or d.centro_id = p_centro_id)
                    and d.desde <= v_dia
                    and (d.hasta is null or d.hasta >= v_dia)
                    and tstzrange(v_cursor + v_dur, v_sig, '[)') && tstzrange(
                          (v_dia + d.hora_inicio) at time zone d.zona_horaria,
                          (v_dia + d.hora_fin)    at time zone d.zona_horaria,
                          '[)')
               )
            then
              hueco_raro_minutos := ceil(extract(epoch from (v_sig - (v_cursor + v_dur))) / 60)::integer;
            end if;
          end if;

          return next;
        end if;

        if v_limite is not null then
          v_cursor := v_limite;
        else
          v_cursor := v_cursor + v_dur + v_desc;
        end if;
      end loop;
    end loop;
  end loop;

  return;
end;
$$;

comment on function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint) is
  'Los tramos de un profesional entre dos fechas (como mucho 62 días): cada franja se recorre '
  'de la hora de inicio a la de fin; un tramo libre salta duración + descanso, y uno ocupado '
  'salta al final del bloqueo (no al paso normal). Cuenta las citas del profesional en cualquier '
  'centro y no identifica la que bloquea. Solo tramos futuros, ordenados por fecha e inicio. '
  'Rechaza a quien no ve esa agenda y un profesional que no sea sanitario o administrador activo. '
  'hueco_raro_minutos: en un tramo libre, los minutos entre su fin y la cita siguiente de la misma '
  'franja cuando quedan más que el descanso y no cabe otra sesión con el suyo; null en otro caso, '
  'y siempre en un ocupado. No identifica la cita.';

revoke execute on function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint)
  from public, anon;
grant execute on function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint)
  to authenticated;
