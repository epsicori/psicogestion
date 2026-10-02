-- =============================================================================
-- T-028a · La base del alta de cita
--
-- Lo que la base de datos impone ANTES de que exista la pantalla de alta (T-028b):
--   · las tres puertas del técnico administrativo que seguían abiertas por la tabla
--     (H16: insert de citas, H23: update de citas, H24: lectura de series), que ADR-074
--     reserva a las funciones de alta;
--   · el plan de una serie (festivo, ausencia, ocupada con el descanso, alternativa) calculado
--     UNA vez, en un sitio, para que lo que se previsualiza sea lo que luego se crea;
--   · `agenda_crear_serie` ampliada (excluir fechas, sala, nota operativa, primera sesión
--     estricta) y `agenda_crear_cita`, la cita suelta, ambas con el tipo y la duración del
--     catálogo (ADR-074, el tipo manda sobre la duración);
--   · `agenda_bloques_profesional`, los huecos libres de un profesional, con el descanso.
--
-- Decisiones del propietario (02-10-2026), que mandan sobre el contrato donde chocan:
--   A · la rama del profesional de las políticas exige además el rol `profesional_sanitario`
--       (cierra el residuo de un técnico que figure como `profesional_id` de una cita);
--   B · la primera sesión estricta en festivo o ausencia se rechaza (22023);
--   C · el tipo nulo se admite en una serie NO estricta, y si viene se valida siempre;
--   D · las funciones de alta rechazan (22023) un profesional que no sea profesional
--       sanitario o administrador ACTIVO. Sin restricción de tabla: no se toca ninguna fila.
--
-- Todo hacia delante. `drop policy` y `drop function` no son destructivos de datos; las
-- políticas se recrean con el mismo nombre (la lista de cobertura de 11 no cambia).
-- =============================================================================


-- =========================================================================
-- 1 · Las puertas del técnico (H16, H23, H24)
--
-- Sin la rama del técnico, y con `rol_actual() = 'profesional_sanitario'` en la del profesional.
-- Un UPDATE sin WHERE y con SET constante no aplica la política de SELECT: la rama del técnico
-- dejaba a un técnico reescribir la nota operativa y el tipo de TODAS las citas de su centro.
-- Los `grant` de tabla no se tocan: el administrador y el profesional los necesitan.
-- =========================================================================

drop policy citas_alta on public.citas;

create policy citas_alta on public.citas
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or (
        (select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and profesional_id = (select auth.uid())
        and public.es_profesional_asignado(paciente_id)
      )
    )
  );

comment on policy citas_alta on public.citas is
  'T-028a (H16): el técnico administrativo ya no inserta por la tabla, porque fijaría el tipo '
  'de terapia (ADR-074): cita por agenda_crear_cita() y agenda_crear_serie(). La rama del '
  'profesional exige el rol, y es_profesional_asignado(paciente_id) (T-029, ADR-055).';

drop policy citas_modificacion on public.citas;

create policy citas_modificacion on public.citas
  for update to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or (
        (select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and profesional_id = (select auth.uid())
      )
    )
  )
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or (
        (select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and profesional_id = (select auth.uid())
      )
    )
  );

comment on policy citas_modificacion on public.citas is
  'T-028a (H23): sin rama del técnico. Un UPDATE sin WHERE y con SET constante no aplica la '
  'política de SELECT, y la rama del técnico dejaba reescribir la nota y el tipo de todas las '
  'citas de su centro. El técnico modifica por agenda_actualizar_cita() (definer). La rama del '
  'profesional exige el rol: un técnico que figure como profesional_id de una cita no la '
  'modifica por ahí.';

drop policy series_cita_lectura on public.series_cita;

create policy series_cita_lectura on public.series_cita
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or (
        (select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and profesional_id = (select auth.uid())
      )
    )
  );

comment on policy series_cita_lectura on public.series_cita is
  'T-028a (H24): el técnico no lee series_cita, que lleva tipo_terapia_id (ADR-074). Agenda por '
  'las funciones (definer), que devuelven fechas e ids y nunca el tipo.';


-- =========================================================================
-- 2 · Ayudantes internos
--
-- `security invoker` y sin `grant`, como plan_edicion_serie: los llaman funciones definer
-- y corren con los privilegios de su dueño.
-- =========================================================================

-- El descanso del profesional: la MISMA expresión que fn_calcular_rango_bloqueante().
create function public.alta_descanso(p_profesional_id uuid)
returns interval
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select case when p.descanso_activo then make_interval(mins => p.descanso_minutos)
                 else interval '0 minutes' end
       from public.perfiles p
      where p.id = p_profesional_id),
    interval '0 minutes'
  );
$$;

comment on function public.alta_descanso(uuid) is
  'El descanso del profesional (perfiles.descanso_*), con la expresión de '
  'fn_calcular_rango_bloqueante(). Interna, sin grant.';

revoke execute on function public.alta_descanso(uuid) from public, anon, authenticated;

-- El predicado de festivo o ausencia que ya usaba agenda_crear_serie, con orden: el festivo
-- gana y es determinista (antes era `limit 1` sin `order by`).
create function public.alta_bloqueo_disponibilidad(
  p_profesional_id uuid,
  p_centro_id      uuid,
  p_fecha          date,
  p_inicio         timestamptz,
  p_fin            timestamptz
)
returns public.tipo_disponibilidad
language sql
stable
set search_path = ''
as $$
  select d.tipo
    from public.disponibilidad d
   where d.perfil_id = p_profesional_id
     and d.tipo in ('festivo', 'ausencia')
     and (d.centro_id is null or d.centro_id = p_centro_id)
     and d.desde <= p_fecha
     and (d.hasta is null or d.hasta >= p_fecha)
     and (
       d.hora_inicio is null
       or tstzrange(p_inicio, p_fin, '[)') && tstzrange(
            (p_fecha + d.hora_inicio) at time zone d.zona_horaria,
            (p_fecha + d.hora_fin)    at time zone d.zona_horaria,
            '[)'
          )
     )
   order by (d.tipo = 'festivo') desc, d.id
   limit 1;
$$;

comment on function public.alta_bloqueo_disponibilidad(uuid, uuid, date, timestamptz, timestamptz) is
  'Festivo o ausencia del profesional que cubre el tramo (día entero, o solape con su tramo '
  'horario). Si hay varios, gana el festivo. Interna, sin grant.';

revoke execute on function public.alta_bloqueo_disponibilidad(uuid, uuid, date, timestamptz, timestamptz)
  from public, anon, authenticated;

-- «Ocupado» es EXACTAMENTE la restricción citas_sin_solape_profesional: el rango bloqueante
-- de las citas bloqueantes contra [inicio, fin + descanso de la cita nueva). No hay otro
-- predicado de «ocupado» en el alta.
create function public.alta_hueco_ocupado(
  p_profesional_id uuid,
  p_inicio         timestamptz,
  p_fin            timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.citas c
     where c.profesional_id = p_profesional_id
       and c.estado in ('programada', 'confirmada', 'realizada')
       and c.rango_bloqueante && tstzrange(p_inicio, p_fin + public.alta_descanso(p_profesional_id), '[)')
  );
$$;

comment on function public.alta_hueco_ocupado(uuid, timestamptz, timestamptz) is
  'Lo mismo que rechazaría citas_sin_solape_profesional al insertar una cita en ese tramo. '
  'Interna, sin grant.';

revoke execute on function public.alta_hueco_ocupado(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Decisión D del propietario: quién puede figurar como profesional de una cita.
create function public.alta_exigir_profesional(p_profesional_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.perfiles p
     where p.id = p_profesional_id
       and p.rol in ('profesional_sanitario'::public.rol_usuario, 'administrador'::public.rol_usuario)
       and p.estado = 'activo'::public.estado_perfil
  ) then
    raise exception 'El profesional indicado no es un profesional sanitario ni un administrador activo.'
      using errcode = '22023';
  end if;
end;
$$;

comment on function public.alta_exigir_profesional(uuid) is
  'Decisión D (02-10-2026): una cita solo puede tener como profesional a un profesional '
  'sanitario o un administrador, en estado activo. Es la única comprobación de ese hecho '
  'en las funciones de alta, la previsualización y los bloques. Interna, sin grant.';

revoke execute on function public.alta_exigir_profesional(uuid) from public, anon, authenticated;

-- Tipo y duración (ADR-074): el tipo manda. Devuelve la duración efectiva.
-- Volátil a propósito: `for share` no se admite en una función no volátil. Bloquea la fila del
-- tipo para que no se dé de baja entre la comprobación y el insert.
create function public.alta_resolver_tipo(
  p_tipo_terapia_id  uuid,
  p_duracion_minutos smallint
)
returns smallint
language plpgsql
set search_path = ''
as $$
declare
  v_activo   boolean;
  v_duracion smallint;
begin
  if p_tipo_terapia_id is null then
    raise exception 'Falta el tipo de terapia de la cita (ADR-074).' using errcode = '22023';
  end if;

  select t.activo, t.duracion_minutos
    into v_activo, v_duracion
    from public.tipos_terapia t
   where t.id = p_tipo_terapia_id
     for share;

  if not found then
    raise exception 'Ese tipo de terapia no existe en el catálogo.' using errcode = '22023';
  end if;
  if not v_activo then
    raise exception 'Ese tipo de terapia está dado de baja en el catálogo.' using errcode = '22023';
  end if;
  if p_duracion_minutos is not null and p_duracion_minutos <> v_duracion then
    raise exception 'La duración no es la del tipo de terapia: manda el tipo (ADR-074).' using errcode = '22023';
  end if;

  return v_duracion;
end;
$$;

comment on function public.alta_resolver_tipo(uuid, smallint) is
  'Valida el tipo de terapia (existe, activo) y que la duración, si viene, sea la suya; '
  'devuelve la duración del tipo (ADR-074). Interna, sin grant.';

revoke execute on function public.alta_resolver_tipo(uuid, smallint) from public, anon, authenticated;


-- =========================================================================
-- 3 · plan_alta_serie(): una sola vez, en un sitio
--
-- Lo que enseña la previsualización y lo que crea agenda_crear_serie es ESTE plan.
-- Una fecha por elemento, en el orden de p_fechas.
-- =========================================================================

create function public.plan_alta_serie(
  p_profesional_id   uuid,
  p_centro_id        uuid,
  p_zona_horaria     text,
  p_fechas           date[],
  p_hora_local       time,
  p_duracion_minutos smallint
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_plan     jsonb := '[]'::jsonb;
  v_dur      interval := make_interval(mins => p_duracion_minutos);
  v_fecha    date;
  v_inicio   timestamptz;
  v_fin      timestamptz;
  v_clasif   text;
  v_bloqueo  text;
  v_alt      jsonb;
  v_d        integer;
  v_fecha2   date;
  v_inicio2  timestamptz;
  v_fin2     timestamptz;
  v_clasif2  text;
begin
  foreach v_fecha in array p_fechas loop
    select r.instante, r.clasificacion into v_inicio, v_clasif
      from public.resolver_hora_local(p_zona_horaria, v_fecha + p_hora_local) r;
    v_fin := v_inicio + v_dur;

    v_bloqueo := (public.alta_bloqueo_disponibilidad(p_profesional_id, p_centro_id, v_fecha, v_inicio, v_fin))::text;
    if v_bloqueo is null and public.alta_hueco_ocupado(p_profesional_id, v_inicio, v_fin) then
      v_bloqueo := 'ocupada';
    end if;

    v_alt := 'null'::jsonb;
    if v_bloqueo is not null then
      -- La alternativa: el primer día de los siete siguientes, a la misma hora local, sin
      -- festivo ni ausencia, no ocupado (con el descanso de la cita nueva) y que no sea otra
      -- sesión de esta misma serie (D10). agenda_crear_serie pasa también las fechas excluidas,
      -- así que tampoco es una de ellas (R1-H1).
      for v_d in 1 .. 7 loop
        v_fecha2 := v_fecha + v_d;
        continue when v_fecha2 = any (p_fechas);

        select r.instante, r.clasificacion into v_inicio2, v_clasif2
          from public.resolver_hora_local(p_zona_horaria, v_fecha2 + p_hora_local) r;
        v_fin2 := v_inicio2 + v_dur;

        if public.alta_bloqueo_disponibilidad(p_profesional_id, p_centro_id, v_fecha2, v_inicio2, v_fin2) is null
           and not public.alta_hueco_ocupado(p_profesional_id, v_inicio2, v_fin2) then
          v_alt := jsonb_build_object('fecha', v_fecha2, 'inicio', v_inicio2, 'fin', v_fin2);
          exit;
        end if;
      end loop;
    end if;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'fecha', v_fecha,
      'hora_local', p_hora_local,
      'inicio', v_inicio,
      'fin', v_fin,
      'clasificacion', v_clasif,
      'bloqueo', v_bloqueo,
      'alternativa', v_alt
    ));
  end loop;

  return v_plan;
end;
$$;

comment on function public.plan_alta_serie(uuid, uuid, text, date[], time, smallint) is
  'El plan de un alta: por fecha, el instante resuelto, la clasificación horaria, el bloqueo '
  '(festivo, ausencia u ocupada, con el descanso) y la alternativa de hasta siete días. Lo '
  'comparten agenda_previsualizar_alta() y agenda_crear_serie(). Interna, sin grant.';

revoke execute on function public.plan_alta_serie(uuid, uuid, text, date[], time, smallint)
  from public, anon, authenticated;


-- =========================================================================
-- 4 · agenda_previsualizar_alta(): enseña el plan sin escribir
-- =========================================================================

create function public.agenda_previsualizar_alta(
  p_paciente_id      uuid,
  p_profesional_id   uuid,
  p_centro_id        uuid,
  p_periodicidad     public.periodicidad_serie,
  p_dia_semana       smallint,
  p_hora_local       time,
  p_duracion_minutos smallint,
  p_desde            date,
  p_sesiones_totales smallint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol    public.rol_usuario := (select public.rol_actual());
  v_zona   text;
  v_fechas date[];
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;
  if not (
    v_rol = 'administrador'::public.rol_usuario
    or p_profesional_id = (select auth.uid())
    or (v_rol = 'tecnico_administrativo'::public.rol_usuario
        and p_centro_id in (select public.centros_actuales()))
  ) then
    raise exception 'No autorizado para previsualizar esta serie.' using errcode = '42501';
  end if;
  if v_rol = 'profesional_sanitario'::public.rol_usuario
     and p_profesional_id = (select auth.uid())
     and not public.es_profesional_asignado(p_paciente_id) then
    raise exception 'Ese paciente no es tuyo: citar no crea el vínculo (ADR-055).' using errcode = '42501';
  end if;

  perform public.alta_exigir_profesional(p_profesional_id);

  if p_periodicidad is null and (p_dia_semana is not null or p_sesiones_totales is not null) then
    raise exception 'agenda_previsualizar_alta: una cita suelta no lleva día de la semana ni número de sesiones.'
      using errcode = '22023';
  end if;
  if p_periodicidad is not null and p_sesiones_totales is null then
    raise exception 'agenda_previsualizar_alta: una serie necesita el número de sesiones.'
      using errcode = '22023';
  end if;
  if p_desde is null or p_hora_local is null or p_duracion_minutos is null
     or p_duracion_minutos not between 5 and 480 then
    raise exception 'agenda_previsualizar_alta: faltan la fecha, la hora o la duración (5 a 480 minutos).'
      using errcode = '22023';
  end if;
  if p_desde < current_date then
    raise exception 'agenda_previsualizar_alta: la fecha de inicio es anterior a hoy.' using errcode = '22023';
  end if;

  v_zona := public.zona_horaria_centro(p_centro_id);
  if v_zona is null then
    raise exception 'agenda_previsualizar_alta: no se pudo resolver una zona horaria' using errcode = '22023';
  end if;

  if p_periodicidad is null then
    v_fechas := array[p_desde];
  else
    v_fechas := array(
      select o from public.ocurrencias_serie(p_periodicidad, p_dia_semana, p_desde, p_sesiones_totales, null) o
    );
  end if;
  -- RD2-H2 · La misma entrada que agenda_crear_serie rechaza no se enseña como un plan vacío.
  if coalesce(array_length(v_fechas, 1), 0) = 0 then
    raise exception 'La serie no tiene ninguna sesión entre su inicio y su final.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'zona_horaria', v_zona,
    'sesiones', public.plan_alta_serie(p_profesional_id, p_centro_id, v_zona, v_fechas, p_hora_local, p_duracion_minutos)
  );
end;
$$;

comment on function public.agenda_previsualizar_alta(
  uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint
) is
  'Enseña el plan de un alta (fechas, hora local, bloqueos, alternativas) SIN escribir nada: '
  'es el mismo plan que usa agenda_crear_serie(). No lleva tipo ni ids, y no identifica la '
  'cita que bloquea. Misma autorización y misma comprobación del profesional que el alta.';

revoke execute on function public.agenda_previsualizar_alta(
  uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint
) from public, anon;
grant execute on function public.agenda_previsualizar_alta(
  uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint
) to authenticated;


-- =========================================================================
-- 5 · agenda_crear_serie() ampliada
--
-- Se borra la firma de 11 argumentos y se crea la de 15: nunca conviven dos sobrecargas
-- (una llamada con nombres sería ambigua). Los cuatro nuevos van al final, con valor por
-- defecto; la forma del retorno no cambia.
-- =========================================================================

drop function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint, date
);

create function public.agenda_crear_serie(
  p_paciente_id       uuid,
  p_profesional_id    uuid,
  p_centro_id         uuid,
  p_tipo_terapia_id   uuid,
  p_periodicidad      public.periodicidad_serie,
  p_dia_semana        smallint,
  p_hora_local        time,
  p_duracion_minutos  smallint,
  p_desde             date,
  p_sesiones_totales  smallint default null,
  p_fin_el            date default null,
  p_excluir           date[] default null,
  p_sala              text default null,
  p_nota_operativa    text default null,
  p_estricta_primera  boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol          public.rol_usuario := (select public.rol_actual());
  v_zona         text;
  v_duracion     smallint;
  v_todas        date[];
  v_fechas       date[];
  v_plan         jsonb;
  v_sesion       jsonb;
  v_alt          jsonb;
  v_i            integer;
  v_serie_id     uuid;
  v_cita_id      uuid;
  v_propuesta_id uuid;
  v_inicio       timestamptz;
  v_clasif       text;
  v_citas        jsonb := '[]'::jsonb;
  v_propuestas   jsonb := '[]'::jsonb;
begin
  -- A1 · A3 · la autorización, con los mensajes de siempre.
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
    raise exception 'No autorizado para crear esta serie.' using errcode = '42501';
  end if;
  if v_rol = 'profesional_sanitario'::public.rol_usuario
     and p_profesional_id = (select auth.uid())
     and not public.es_profesional_asignado(p_paciente_id) then
    raise exception 'Ese paciente no es tuyo: citar no crea el vínculo (ADR-055).' using errcode = '42501';
  end if;
  -- A4 · la nota operativa no es del técnico (choque 4). La señal es «viene», no «tiene texto».
  if v_rol = 'tecnico_administrativo'::public.rol_usuario and p_nota_operativa is not null then
    raise exception 'El técnico administrativo no escribe la nota operativa (choque 4).' using errcode = '42501';
  end if;

  perform public.alta_exigir_profesional(p_profesional_id);

  if p_desde is null or p_desde < current_date then
    raise exception 'agenda_crear_serie: la fecha de inicio no puede ser pasada' using errcode = '22023';
  end if;

  -- Tipo y duración (ADR-074). Una serie NO estricta sin tipo se admite como hasta ahora
  -- (decisión C); si el tipo viene, se valida siempre.
  if p_estricta_primera or p_tipo_terapia_id is not null then
    v_duracion := public.alta_resolver_tipo(p_tipo_terapia_id, p_duracion_minutos);
  else
    v_duracion := p_duracion_minutos;
  end if;
  if v_duracion is null then
    raise exception 'Falta la duración de la cita.' using errcode = '22023';
  end if;

  v_zona := public.zona_horaria_centro(p_centro_id);
  if v_zona is null then
    -- No debería ocurrir nunca: zona_horaria_centro() cae hasta 'Europe/Madrid'.
    -- Riesgo 6 del diseño: nunca UTC silencioso.
    raise exception 'agenda_crear_serie: no se pudo resolver una zona horaria' using errcode = '22023';
  end if;

  -- Las excluidas CONSUMEN su ordinal: se quitan después de generar todas.
  v_todas := array(
    select o from public.ocurrencias_serie(p_periodicidad, p_dia_semana, p_desde, p_sesiones_totales, p_fin_el) o
  );
  if p_excluir is not null and exists (
    select 1 from unnest(p_excluir) e(f) where e.f is null or e.f <> all (v_todas)
  ) then
    raise exception 'Esa fecha excluida no es de la serie.' using errcode = '22023';
  end if;
  v_fechas := array(
    select o.f from unnest(v_todas) with ordinality o(f, n)
     where p_excluir is null or o.f <> all (p_excluir)
     order by o.n
  );
  -- R1-H7 · Sin ninguna ocurrencia (cero sesiones, o un final anterior a la primera fecha) no
  -- se ha excluido nada: el mensaje dice la causa verdadera.
  if coalesce(array_length(v_todas, 1), 0) = 0 then
    raise exception 'La serie no tiene ninguna sesión entre su inicio y su final.' using errcode = '22023';
  end if;
  if coalesce(array_length(v_fechas, 1), 0) = 0 then
    raise exception 'Excluir todas las fechas deja la serie sin sesiones.' using errcode = '22023';
  end if;

  -- R1-H1 · El plan se calcula sobre TODAS las fechas, excluidas incluidas, para que D10 (la
  -- alternativa no es ninguna fecha de la serie) tampoco proponga una fecha excluida. Después
  -- se quitan las excluidas, en su orden: lo que se materializa es el plan de v_fechas.
  v_plan := (
    select coalesce(jsonb_agg(s.e order by s.n), '[]'::jsonb)
      from jsonb_array_elements(
             public.plan_alta_serie(p_profesional_id, p_centro_id, v_zona, v_todas, p_hora_local, v_duracion)
           ) with ordinality s(e, n)
     where (s.e ->> 'fecha')::date = any (v_fechas)
  );

  -- Estricta: la primera sesión no se convierte en propuesta, se rechaza y no queda nada.
  if p_estricta_primera then
    if (v_plan -> 0 ->> 'bloqueo') in ('festivo', 'ausencia') then
      raise exception 'La primera sesión cae en festivo o ausencia.' using errcode = '22023';
    elsif (v_plan -> 0 ->> 'bloqueo') = 'ocupada' then
      raise exception 'La primera sesión choca con otra cita del profesional.' using errcode = '23P01';
    end if;
  end if;

  insert into public.series_cita
    (paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
     dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales,
     fin_el, creada_por)
  values
    (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, p_periodicidad,
     p_dia_semana, p_hora_local, v_zona, v_duracion, p_sesiones_totales,
     p_fin_el, (select auth.uid()))
  returning id into v_serie_id;

  for v_i in 0 .. jsonb_array_length(v_plan) - 1 loop
    v_sesion := v_plan -> v_i;
    v_inicio := (v_sesion ->> 'inicio')::timestamptz;
    v_clasif := v_sesion ->> 'clasificacion';

    if v_sesion ->> 'bloqueo' is not null then
      -- Festivo, ausencia u ocupada: propuesta con la alternativa del plan (nunca se salta en
      -- silencio ni se coloca encima). Sin alternativa, sin hora: la decide una persona.
      v_alt := v_sesion -> 'alternativa';
      insert into public.propuestas_cita
        (serie_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista,
         hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
      values
        (v_serie_id, p_paciente_id, p_profesional_id, p_centro_id,
         (v_sesion ->> 'bloqueo')::public.motivo_propuesta_cita,
         coalesce((v_alt ->> 'fecha')::date, (v_sesion ->> 'fecha')::date),
         p_hora_local,
         (v_alt ->> 'inicio')::timestamptz, (v_alt ->> 'fin')::timestamptz,
         v_zona, (select auth.uid()))
      returning id into v_propuesta_id;

      v_propuestas := v_propuestas || jsonb_build_object(
        'propuesta_id', v_propuesta_id,
        'fecha', (v_sesion ->> 'fecha')::date,
        'motivo', v_sesion ->> 'bloqueo'
      );
    elsif v_i = 0 and p_estricta_primera then
      -- La primera sesión estricta va SIN bloque de excepción: un 23P01 por concurrencia
      -- entre el plan y el insert se propaga y deshace todo.
      insert into public.citas
        (paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id,
         inicio, fin, zona_horaria, sala, nota_operativa, desviada, motivo_desviacion, creada_por)
      values
        (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, v_serie_id,
         v_inicio, v_inicio + make_interval(mins => v_duracion), v_zona, p_sala, p_nota_operativa,
         (v_clasif <> 'normal'),
         case when v_clasif <> 'normal' then 'anomalia_horaria'::public.motivo_desviacion_cita else null end,
         (select auth.uid()))
      returning id into v_cita_id;

      v_citas := v_citas || jsonb_build_object('cita_id', v_cita_id, 'fecha', (v_sesion ->> 'fecha')::date);
    else
      -- Capturado SESIÓN A SESIÓN: solo ocurre por concurrencia entre el plan y el insert.
      begin
        insert into public.citas
          (paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id,
           inicio, fin, zona_horaria, sala, nota_operativa, desviada, motivo_desviacion, creada_por)
        values
          (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, v_serie_id,
           v_inicio, v_inicio + make_interval(mins => v_duracion), v_zona, p_sala, p_nota_operativa,
           (v_clasif <> 'normal'),
           case when v_clasif <> 'normal' then 'anomalia_horaria'::public.motivo_desviacion_cita else null end,
           (select auth.uid()))
        returning id into v_cita_id;

        v_citas := v_citas || jsonb_build_object('cita_id', v_cita_id, 'fecha', (v_sesion ->> 'fecha')::date);
      exception when exclusion_violation then
        insert into public.propuestas_cita
          (serie_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista,
           hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
        values
          (v_serie_id, p_paciente_id, p_profesional_id, p_centro_id, 'ocupada',
           (v_sesion ->> 'fecha')::date, p_hora_local, null, null, v_zona, (select auth.uid()))
        returning id into v_propuesta_id;

        v_propuestas := v_propuestas || jsonb_build_object(
          'propuesta_id', v_propuesta_id, 'fecha', (v_sesion ->> 'fecha')::date, 'motivo', 'ocupada'
        );
      end;
    end if;
  end loop;

  return jsonb_build_object(
    'serie_id', v_serie_id,
    'zona_horaria', v_zona,
    'citas', v_citas,
    'propuestas', v_propuestas
  );
end;
$$;

comment on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date,
  smallint, date, date[], text, text, boolean
) is
  'Materializa una serie: series_cita (la intención) y, por cada sesión del plan '
  '(plan_alta_serie), la cita (el hecho) o, si cae en festivo, ausencia u ocupada, una '
  'propuesta con la alternativa. Todo en UNA transacción. T-028a: p_excluir (las excluidas '
  'consumen su ordinal), sala, nota operativa (no del técnico, choque 4) y '
  'p_estricta_primera (la primera sesión no se vuelve propuesta: se rechaza y no queda nada). '
  'Con tipo, la duración es la del tipo (ADR-074). Rechaza un profesional que no sea '
  'sanitario o administrador activo.';

revoke execute on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date,
  smallint, date, date[], text, text, boolean
) from public, anon;
grant execute on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date,
  smallint, date, date[], text, text, boolean
) to authenticated;


-- =========================================================================
-- 6 · agenda_crear_cita(): la cita suelta
-- =========================================================================

create function public.agenda_crear_cita(
  p_paciente_id      uuid,
  p_profesional_id   uuid,
  p_centro_id        uuid,
  p_tipo_terapia_id  uuid,
  p_fecha            date,
  p_hora_local       time,
  p_duracion_minutos smallint default null,
  p_sala             text default null,
  p_nota_operativa   text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol      public.rol_usuario := (select public.rol_actual());
  v_zona     text;
  v_duracion smallint;
  v_inicio   timestamptz;
  v_clasif   text;
  v_cita_id  uuid;
begin
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
    raise exception 'No autorizado para dar esta cita.' using errcode = '42501';
  end if;
  if v_rol = 'profesional_sanitario'::public.rol_usuario
     and p_profesional_id = (select auth.uid())
     and not public.es_profesional_asignado(p_paciente_id) then
    raise exception 'Ese paciente no es tuyo: citar no crea el vínculo (ADR-055).' using errcode = '42501';
  end if;
  if v_rol = 'tecnico_administrativo'::public.rol_usuario and p_nota_operativa is not null then
    raise exception 'El técnico administrativo no escribe la nota operativa (choque 4).' using errcode = '42501';
  end if;

  perform public.alta_exigir_profesional(p_profesional_id);

  if p_fecha is null or p_hora_local is null then
    raise exception 'Faltan la fecha o la hora de la cita.' using errcode = '22023';
  end if;

  v_duracion := public.alta_resolver_tipo(p_tipo_terapia_id, p_duracion_minutos);

  v_zona := public.zona_horaria_centro(p_centro_id);
  if v_zona is null then
    raise exception 'agenda_crear_cita: no se pudo resolver una zona horaria' using errcode = '22023';
  end if;

  if p_fecha < (now() at time zone v_zona)::date then
    raise exception 'agenda_crear_cita: la fecha es anterior a hoy.' using errcode = '22023';
  end if;

  select r.instante, r.clasificacion into v_inicio, v_clasif
    from public.resolver_hora_local(v_zona, p_fecha + p_hora_local) r;
  if v_inicio <= now() then
    raise exception 'agenda_crear_cita: el inicio es anterior a ahora.' using errcode = '22023';
  end if;

  if public.alta_bloqueo_disponibilidad(
       p_profesional_id, p_centro_id, p_fecha, v_inicio, v_inicio + make_interval(mins => v_duracion)
     ) is not null then
    raise exception 'Ese día el profesional tiene festivo o ausencia.' using errcode = '22023';
  end if;

  -- Sin bloque de excepción: un 23P01 (otra cita del profesional) se propaga tal cual.
  insert into public.citas
    (paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id,
     inicio, fin, zona_horaria, sala, nota_operativa, desviada, motivo_desviacion, creada_por)
  values
    (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, null,
     v_inicio, v_inicio + make_interval(mins => v_duracion), v_zona, p_sala, p_nota_operativa,
     (v_clasif <> 'normal'),
     case when v_clasif <> 'normal' then 'anomalia_horaria'::public.motivo_desviacion_cita else null end,
     (select auth.uid()))
  returning id into v_cita_id;

  return v_cita_id;
end;
$$;

comment on function public.agenda_crear_cita(
  uuid, uuid, uuid, uuid, date, time, smallint, text, text
) is
  'La cita suelta, por el camino del técnico administrativo (ADR-074): el tipo es obligatorio '
  'y manda sobre la duración, y devuelve solo el id (no el tipo). Rechaza el pasado, un día '
  'con festivo o ausencia y un profesional que no sea sanitario o administrador activo. No '
  'exige franja: la franja ordena la sugerencia, no prohíbe. Una cita encima de otra da 23P01.';

revoke execute on function public.agenda_crear_cita(
  uuid, uuid, uuid, uuid, date, time, smallint, text, text
) from public, anon;
grant execute on function public.agenda_crear_cita(
  uuid, uuid, uuid, uuid, date, time, smallint, text, text
) to authenticated;


-- =========================================================================
-- 7 · agenda_bloques_profesional(): los huecos de un profesional
--
-- Nada de la salida identifica la cita que bloquea. Toda tabla lleva alias: un parámetro
-- `out` con el nombre de una columna es ambiguo en ejecución.
-- =========================================================================

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
  estado     text
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
  'Rechaza a quien no ve esa agenda y un profesional que no sea sanitario o administrador activo.';

revoke execute on function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint)
  from public, anon;
grant execute on function public.agenda_bloques_profesional(uuid, uuid, date, date, smallint)
  to authenticated;
