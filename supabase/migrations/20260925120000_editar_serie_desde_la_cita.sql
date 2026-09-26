-- T-011b · Editar una serie desde la cita elegida (ADR-068, ADR-069).
--
-- Arregla dos hallazgos de T-011a sobre "esta y las siguientes":
--   H8 - fn_evento_regla_serie() metía TODAS las futuras no desviadas de la serie
--        en el evento, aunque el profesional eligiera "desde esta cita en
--        adelante". Se añade un ancla (GUC app.agenda_regla_ancla, transaccional)
--        que acota citas_afectadas_por_regla() a partir de la cita elegida.
--   H9 - las propuestas conservaban la FECHA de la cita (solo cambiaban la hora)
--        y usaban la DURACIÓN de la cita, no la de la regla nueva. Se centraliza
--        el cálculo en calcular_propuesta_de_evento(), que sí mueve el día
--        (fecha_en_regla_nueva(), conservando semana/mes relativos) y usa la
--        duración de la regla.
--
-- ADR-068: las propuestas obsoletas se RECHAZAN al confirmar (22023 + mensaje
-- legible), nunca se descartan solas; UPDATE directo sobre series_cita se
-- revoca (solo agenda_editar_serie cambia la regla); previsualización antes de
-- confirmar vía agenda_previsualizar_edicion_serie(), de solo lectura.
-- ADR-069: el ordinal de una regla mensual se fija en la PRIMERA ocurrencia
-- (enesimo_dia_del_mes()), no se recalcula mes a mes; INSERT directo sobre
-- series_cita también se revoca (solo agenda_crear_serie() crea series).
--
-- Nada se recalcula solo (ADR-034): toda anomalía horaria (hueco/solape) se
-- marca desviada con motivo anomalia_horaria, igual que en T-011a.


-- =========================================================================
-- 1 · enesimo_dia_del_mes() — calendario puro, comparte fórmula con
--     ocurrencias_serie() y fecha_en_regla_nueva()
-- =========================================================================

create function public.enesimo_dia_del_mes(
  p_mes        date,
  p_dia_semana smallint,
  p_ordinal    smallint
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mes  date;
  v_cand date;
begin
  if p_dia_semana is null or p_dia_semana < 1 or p_dia_semana > 7 then
    raise exception 'enesimo_dia_del_mes: dia_semana fuera de rango (1-7, ISODOW)' using errcode = '22023';
  end if;
  if p_ordinal is null or p_ordinal < 1 or p_ordinal > 5 then
    raise exception 'enesimo_dia_del_mes: ordinal fuera de rango (1-5)' using errcode = '22023';
  end if;

  v_mes := date_trunc('month', p_mes)::date;
  v_cand := v_mes
    + ((p_dia_semana - extract(isodow from v_mes)::int + 7) % 7)
    + (p_ordinal - 1) * 7;
  if extract(month from v_cand) <> extract(month from v_mes) then
    v_cand := v_cand - 7;
  end if;
  return v_cand;
end;
$$;

comment on function public.enesimo_dia_del_mes(date, smallint, smallint) is
  'ADR-069: el ordinal-ésimo día de la semana p_dia_semana (ISODOW) del mes de '
  'p_mes, recortado al último de ese día si el mes no llega al ordinal pedido. '
  'Única fórmula: la comparten ocurrencias_serie() y fecha_en_regla_nueva(), '
  'para que "el 2º martes" signifique lo mismo en los dos sitios.';

revoke execute on function public.enesimo_dia_del_mes(date, smallint, smallint) from public, anon;
grant  execute on function public.enesimo_dia_del_mes(date, smallint, smallint) to authenticated;


-- =========================================================================
-- 2 · fecha_en_regla_nueva() — mueve una fecha de calendario a la regla
--     nueva, conservando la semana relativa (semanal/quincenal) o el mes y
--     ordinal relativos (mensual) respecto del ancla, si la hay.
-- =========================================================================

create function public.fecha_en_regla_nueva(
  p_periodicidad  public.periodicidad_serie,
  p_fecha_cita    date,
  p_dia_semana    smallint,
  p_fecha_origen  date default null,
  p_fecha_destino date default null,
  p_ordinal       smallint default null
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lunes_cita    date;
  v_lunes_origen  date;
  v_lunes_destino date;
  v_mes_base      date;
  v_delta_meses   int;
  v_ordinal       smallint;
begin
  if p_dia_semana is null or p_dia_semana < 1 or p_dia_semana > 7 then
    raise exception 'fecha_en_regla_nueva: dia_semana fuera de rango (1-7, ISODOW)' using errcode = '22023';
  end if;
  if (p_fecha_origen is null) <> (p_fecha_destino is null) then
    raise exception 'fecha_en_regla_nueva: fecha_origen y fecha_destino van juntas o ninguna' using errcode = '22023';
  end if;
  if p_ordinal is not null and (p_ordinal < 1 or p_ordinal > 5) then
    raise exception 'fecha_en_regla_nueva: ordinal fuera de rango (1-5)' using errcode = '22023';
  end if;

  if p_periodicidad in ('semanal', 'quincenal') then
    v_lunes_cita := p_fecha_cita - (extract(isodow from p_fecha_cita)::int - 1);
    if p_fecha_origen is not null and p_fecha_destino is not null then
      v_lunes_origen  := p_fecha_origen  - (extract(isodow from p_fecha_origen)::int - 1);
      v_lunes_destino := p_fecha_destino - (extract(isodow from p_fecha_destino)::int - 1);
      return v_lunes_cita + (v_lunes_destino - v_lunes_origen) + (p_dia_semana - 1);
    end if;
    return v_lunes_cita + (p_dia_semana - 1);
  end if;

  -- mensual: conserva el mes relativo al ancla. El ordinal es p_ordinal si
  -- viene (el de la regla, ADR-069.1: plan_edicion_serie lo fija), y si no,
  -- el de la fecha de destino del ancla o el de la propia cita.
  if p_fecha_origen is not null and p_fecha_destino is not null then
    v_delta_meses :=
      (extract(year from p_fecha_destino)::int * 12 + extract(month from p_fecha_destino)::int)
      - (extract(year from p_fecha_origen)::int * 12 + extract(month from p_fecha_origen)::int);
    v_mes_base := (date_trunc('month', p_fecha_cita)::date + make_interval(months => v_delta_meses))::date;
    v_ordinal := coalesce(p_ordinal, ((extract(day from p_fecha_destino)::int - 1) / 7) + 1);
  else
    v_mes_base := date_trunc('month', p_fecha_cita)::date;
    v_ordinal := coalesce(p_ordinal, ((extract(day from p_fecha_cita)::int - 1) / 7) + 1);
  end if;

  return public.enesimo_dia_del_mes(v_mes_base, p_dia_semana, v_ordinal);
end;
$$;

comment on function public.fecha_en_regla_nueva(public.periodicidad_serie, date, smallint, date, date, smallint) is
  'H9: la fecha que le toca a p_fecha_cita bajo la regla nueva (p_dia_semana). '
  'Sin ancla (p_fecha_origen/p_fecha_destino nulos): mismo día de la semana '
  '(semanal/quincenal) u ordinal (mensual) que ya tenía. Con ancla: conserva '
  'la semana/mes relativos al desplazamiento del ancla — así "el resto de la '
  'serie" se mueve con ella, no se queda en su día de siempre. En mensual, '
  'p_ordinal (1-5) fija el ordinal de la regla (ADR-069.1, SQL-H2): sin él, '
  'una ancla recortada (el 4.º jueves de un mes sin 5.º) bajaría toda la '
  'serie del 5.º al 4.º.';

revoke execute on function public.fecha_en_regla_nueva(public.periodicidad_serie, date, smallint, date, date, smallint) from public, anon;
grant  execute on function public.fecha_en_regla_nueva(public.periodicidad_serie, date, smallint, date, date, smallint) to authenticated;


-- =========================================================================
-- 3 · calcular_propuesta_de_evento() — el único sitio que calcula una
--     propuesta (H9): agenda_propuestas_de_evento(), agenda_confirmar_propuesta()
--     (frescura) y agenda_previsualizar_edicion_serie() llaman aquí, no
--     recalculan cada uno por su cuenta.
-- =========================================================================

create function public.calcular_propuesta_de_evento(
  p_tipo  text,
  p_carga jsonb,
  p_cita  public.citas
)
returns table(fecha date, hora time, zona text, inicio timestamptz, fin timestamptz, clasificacion text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zona          text;
  v_periodicidad  public.periodicidad_serie;
  v_fecha         date;
  v_hora          time;
  v_instante      timestamptz;
  v_clasificacion text;
  v_fin           timestamptz;
begin
  if p_tipo = 'agenda.zona_centro_cambiada' then
    v_zona  := p_carga ->> 'zona_horaria_nueva';
    v_fecha := (p_cita.inicio at time zone p_cita.zona_horaria)::date;
    v_hora  := (p_cita.inicio at time zone p_cita.zona_horaria)::time;

    select r.instante, r.clasificacion into v_instante, v_clasificacion
      from public.resolver_hora_local(v_zona, v_fecha + v_hora) r;

    v_fin := v_instante + (p_cita.fin - p_cita.inicio);

  elsif p_tipo = 'agenda.regla_serie_cambiada' then
    v_zona := p_carga ->> 'zona_horaria';

    -- Un evento anterior a esta migración no lleva periodicidad en la carga:
    -- se recupera de la serie, que no cambia de periodicidad nunca.
    v_periodicidad := (p_carga ->> 'periodicidad')::public.periodicidad_serie;
    if v_periodicidad is null then
      select s.periodicidad into v_periodicidad
        from public.series_cita s where s.id = p_cita.serie_id;
    end if;

    v_fecha := public.fecha_en_regla_nueva(
      v_periodicidad,
      (p_cita.inicio at time zone p_cita.zona_horaria)::date,
      (p_carga ->> 'dia_semana')::smallint,
      (p_carga ->> 'fecha_origen')::date,
      (p_carga ->> 'fecha_destino')::date,
      -- Nulo en semanal/quincenal y en los eventos anteriores a SQL-H2.
      (p_carga ->> 'ordinal')::smallint
    );
    v_hora := (p_carga ->> 'hora_local')::time;

    select r.instante, r.clasificacion into v_instante, v_clasificacion
      from public.resolver_hora_local(v_zona, v_fecha + v_hora) r;

    v_fin := v_instante + make_interval(mins => (p_carga ->> 'duracion_minutos')::int);
  else
    raise exception 'calcular_propuesta_de_evento: tipo de evento no soportado: %', p_tipo using errcode = '22023';
  end if;

  return query select v_fecha, v_hora, v_zona, v_instante, v_fin, v_clasificacion;
end;
$$;

comment on function public.calcular_propuesta_de_evento(text, jsonb, public.citas) is
  'H9: para agenda.regla_serie_cambiada, mueve el DÍA (fecha_en_regla_nueva) y '
  'usa la DURACIÓN de la regla nueva (make_interval), no la de la cita — antes '
  'la propuesta conservaba la fecha de la cita y su propia duración. Sin '
  'grant a nadie: solo la llaman funciones definer que ya autorizaron.';

revoke execute on function public.calcular_propuesta_de_evento(text, jsonb, public.citas) from public, anon, authenticated;


-- =========================================================================
-- 4 · citas_afectadas_por_regla() — H8: acota a partir de la cita elegida
-- =========================================================================

create function public.citas_afectadas_por_regla(
  p_serie_id      uuid,
  p_desde_cita_id uuid default null
)
returns table(cita_id uuid)
language sql
stable
set search_path = ''
as $$
  select c.id
    from public.citas c
   where c.serie_id = p_serie_id
     and c.inicio > now()
     and c.estado in ('programada', 'confirmada')
     and c.desviada = false
     and (p_desde_cita_id is null
          or c.inicio >= (select a.inicio from public.citas a where a.id = p_desde_cita_id))
   order by c.inicio, c.id
$$;

comment on function public.citas_afectadas_por_regla(uuid, uuid) is
  'H8: futuras, no desviadas, programada/confirmada de la serie; con '
  'p_desde_cita_id, solo desde esa cita (inclusive) en adelante — «esta y las '
  'siguientes» ya no es «todas las futuras». Sin grant a nadie.';

revoke execute on function public.citas_afectadas_por_regla(uuid, uuid) from public, anon, authenticated;


-- =========================================================================
-- 5 · plan_edicion_serie() — valida el ancla y arma el plan de edición.
--     No autoriza (el llamante ya lo hizo) ni bloquea filas (recibe filas ya
--     leídas): calendario y las guardas del §1 del diseño. Única lectura de
--     tabla: las citas de la serie, para el ordinal mensual (SQL-H2).
-- =========================================================================

create function public.plan_edicion_serie(
  p_cita              public.citas,
  p_serie             public.series_cita,
  p_fecha             date,
  p_dia_semana        smallint,
  p_hora_local        time,
  p_duracion_minutos  smallint,
  p_zona_horaria      text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_dia_semana    smallint;
  v_hora_local    time;
  v_duracion      smallint;
  v_zona          text;
  v_fecha_origen  date;
  v_fecha_destino date;
  v_instante      timestamptz;
  v_cambia        boolean;
  v_ordinal       smallint;
  v_ordinal_otra  smallint;
begin
  -- El orden importa: un UPDATE de postgres que pone la cita "en curso"
  -- TAMBIÉN la desvía (fn_marcar_cita_desviada); si esta guarda no fuera la
  -- primera, el 22023 saldría por el motivo equivocado.
  if p_cita.inicio <= now() then
    raise exception 'La cita elegida ya ha empezado o ha pasado.' using errcode = '22023';
  end if;

  if p_cita.estado not in ('programada', 'confirmada') then
    raise exception 'La cita elegida está cancelada o cerrada.' using errcode = '22023';
  end if;

  if p_cita.desviada then
    raise exception 'La cita elegida se movió a mano: ya no la gobierna la serie.' using errcode = '22023';
  end if;

  -- §1.4.3: el día nuevo sale de p_dia_semana, o si no del día de p_fecha, o
  -- si no de la serie. Solo si vienen los DOS y no coinciden es un error.
  if p_fecha is not null and p_dia_semana is not null
     and extract(isodow from p_fecha)::smallint <> p_dia_semana then
    raise exception 'La fecha y el día de la semana no coinciden.' using errcode = '22023';
  end if;

  -- SQL-H4: la misma cota que series_cita_duracion_ck, aquí y no en el UPDATE,
  -- para que la previsualización no anuncie una edición que la base rechaza.
  if p_duracion_minutos is not null and (p_duracion_minutos < 5 or p_duracion_minutos > 480) then
    raise exception 'La duración de la sesión debe estar entre 5 y 480 minutos.' using errcode = '22023';
  end if;

  v_dia_semana := coalesce(p_dia_semana, extract(isodow from p_fecha)::smallint, p_serie.dia_semana);
  v_hora_local := coalesce(p_hora_local, p_serie.hora_local);
  v_duracion   := coalesce(p_duracion_minutos, p_serie.duracion_minutos);
  v_zona       := coalesce(p_zona_horaria, p_serie.zona_horaria);

  v_fecha_origen := (p_cita.inicio at time zone p_cita.zona_horaria)::date;

  if p_serie.periodicidad <> 'mensual' then
    -- §1.4.4: sin p_fecha, la ancla va al día nuevo de SU semana.
    v_fecha_destino := coalesce(
      p_fecha,
      public.fecha_en_regla_nueva(p_serie.periodicidad, v_fecha_origen, v_dia_semana)
    );
  elsif p_fecha is not null and p_fecha <> v_fecha_origen then
    -- ADR-068.3: la cita se mueve de fecha; el ordinal sale del destino.
    v_ordinal       := ((extract(day from p_fecha)::int - 1) / 7) + 1;
    v_fecha_destino := p_fecha;
  else
    -- SQL-H2 (decisión del propietario, 25-09-2026) y ADR-069.1: si la cita
    -- no cambia de fecha, el ordinal es el de la serie, no el de la ancla.
    -- Solo es ambiguo cuando la ancla es la 4.ª y la última de su mes: puede
    -- ser un 4.º de verdad o un 5.º recortado. Lo decide la cita no recortada
    -- (5.ª, o no la última de su mes) más cercana de la misma serie.
    v_ordinal := ((extract(day from v_fecha_origen)::int - 1) / 7) + 1;
    if v_ordinal = 4
       and extract(month from v_fecha_origen + 7) <> extract(month from v_fecha_origen)
    then
      select ((extract(day from d.fecha)::int - 1) / 7) + 1
        into v_ordinal_otra
        from (select (c.inicio at time zone c.zona_horaria)::date as fecha, c.inicio
                from public.citas c
               where c.serie_id = p_serie.id
                 and c.id <> p_cita.id
                 and c.desviada = false) d
       where extract(day from d.fecha) > 28
          or extract(month from d.fecha + 7) = extract(month from d.fecha)
       order by abs(extract(epoch from d.inicio - p_cita.inicio)), d.inicio desc
       limit 1;
      if v_ordinal_otra = 5 then
        v_ordinal := 5;
      end if;
    end if;
    v_fecha_destino := public.enesimo_dia_del_mes(
      date_trunc('month', v_fecha_origen)::date, v_dia_semana, v_ordinal);
  end if;

  select r.instante into v_instante
    from public.resolver_hora_local(v_zona, v_fecha_destino + v_hora_local) r;

  if v_instante <= now() then
    raise exception 'El nuevo horario de esta cita ya ha pasado.' using errcode = '22023';
  end if;

  v_cambia :=
    v_dia_semana is distinct from p_serie.dia_semana
    or v_hora_local is distinct from p_serie.hora_local
    or v_duracion is distinct from p_serie.duracion_minutos
    or v_zona is distinct from p_serie.zona_horaria
    or v_fecha_origen <> v_fecha_destino;

  return jsonb_build_object(
    'serie_id', p_serie.id,
    'periodicidad', p_serie.periodicidad,
    'dia_semana', v_dia_semana,
    'hora_local', v_hora_local,
    'duracion_minutos', v_duracion,
    'zona_horaria', v_zona,
    'desde_cita_id', p_cita.id,
    'fecha_origen', v_fecha_origen,
    'fecha_destino', v_fecha_destino,
    'ordinal', v_ordinal,
    'cambia', v_cambia
  );
end;
$$;

comment on function public.plan_edicion_serie(public.citas, public.series_cita, date, smallint, time, smallint, text) is
  'Guardas de la ancla (pasada/en curso, cancelada/cerrada, desviada), '
  'coincidencia fecha/día de la semana, duración 5-480 (SQL-H4) y horario '
  'nuevo no pasado, y el plan (regla + fecha_origen/fecha_destino + ordinal '
  '+ cambia) que agenda_editar_serie() aplica y '
  'agenda_previsualizar_edicion_serie() enseña sin aplicar. En mensual, sin '
  'mover la fecha, el ordinal es el de la serie (SQL-H2, ADR-069.1): para '
  'desambiguar una ancla recortada lee otras citas de la serie, sin '
  'bloquearlas. Sin grant a nadie: no autoriza por sí sola.';

revoke execute on function public.plan_edicion_serie(public.citas, public.series_cita, date, smallint, time, smallint, text) from public, anon, authenticated;


-- =========================================================================
-- 6 · fn_evento_regla_serie() — lee el ancla (GUC transaccional) y acota
--     citas_afectadas_por_regla() a partir de ella.
-- =========================================================================

create or replace function public.fn_evento_regla_serie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancla         jsonb;
  v_desde_cita_id uuid;
  v_fecha_origen  date;
  v_fecha_destino date;
  v_citas         jsonb;
  v_evento_id     uuid;
begin
  v_ancla := nullif(current_setting('app.agenda_regla_ancla', true), '')::jsonb;
  if v_ancla is not null and (v_ancla ->> 'serie_id')::uuid is distinct from new.id then
    v_ancla := null;
  end if;

  if new.dia_semana       is not distinct from old.dia_semana
     and new.hora_local       is not distinct from old.hora_local
     and new.duracion_minutos is not distinct from old.duracion_minutos
     and new.zona_horaria     is not distinct from old.zona_horaria
     and (v_ancla ->> 'fecha_origen') is not distinct from (v_ancla ->> 'fecha_destino')
  then
    return new;
  end if;

  v_desde_cita_id := (v_ancla ->> 'desde_cita_id')::uuid;
  v_fecha_origen  := (v_ancla ->> 'fecha_origen')::date;
  v_fecha_destino := (v_ancla ->> 'fecha_destino')::date;

  select coalesce(jsonb_agg(a.cita_id order by a.n), '[]'::jsonb)
    into v_citas
    from public.citas_afectadas_por_regla(new.id, v_desde_cita_id) with ordinality as a(cita_id, n);

  insert into public.eventos_salientes (tipo, carga, creado_por)
  values (
    'agenda.regla_serie_cambiada',
    jsonb_build_object(
      'serie_id', new.id,
      'periodicidad', new.periodicidad,
      'dia_semana', new.dia_semana,
      'hora_local', new.hora_local,
      'duracion_minutos', new.duracion_minutos,
      'zona_horaria', new.zona_horaria,
      'desde_cita_id', v_desde_cita_id,
      'fecha_origen', v_fecha_origen,
      'fecha_destino', v_fecha_destino,
      'ordinal', v_ancla -> 'ordinal',
      'citas_afectadas', v_citas
    ),
    auth.uid()
  )
  returning id into v_evento_id;

  perform set_config('app.agenda_evento_regla', v_evento_id::text, true);

  return new;
end;
$$;

comment on function public.fn_evento_regla_serie() is
  'H8: con ancla (app.agenda_regla_ancla, puesta por agenda_editar_serie antes '
  'del UPDATE y limpiada justo después), citas_afectadas_por_regla() acota '
  'desde la cita elegida; sin ancla (p. ej. un UPDATE directo de postgres, '
  'dueño de la tabla y no sujeto al revoke de authenticated), se comporta '
  'como antes: todas las futuras no desviadas. La carga añade periodicidad, '
  'desde_cita_id, fecha_origen y fecha_destino para que '
  'calcular_propuesta_de_evento() pueda mover el día (H9).';

revoke execute on function public.fn_evento_regla_serie() from public;


-- =========================================================================
-- 7 · agenda_editar_serie() — 11 parámetros (+p_fecha). DROP+CREATE porque
--     cambia la firma (Kimi: lint-migraciones no marca `drop function`).
-- =========================================================================

drop function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text);

create function public.agenda_editar_serie(
  p_cita_id          uuid,
  p_alcance          public.alcance_cambio_serie,
  p_estado           public.estado_cita default null,
  p_sala             text default null,
  p_inicio           timestamptz default null,
  p_fin              timestamptz default null,
  p_dia_semana       smallint default null,
  p_hora_local       time default null,
  p_duracion_minutos smallint default null,
  p_zona_horaria     text default null,
  p_fecha            date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := (select public.rol_actual());
  v_cita      public.citas;
  v_serie     public.series_cita;
  v_plan      jsonb;
  v_evento_id uuid;
  v_resultado jsonb;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then
    raise exception 'La cita no existe o no es tuya.' using errcode = '42501';
  end if;

  -- SQL-H3: la autorización va ANTES de cualquier otra guarda, también en
  -- la rama "esta" — si no, el 22023 de p_fecha distinguiría una cita ajena
  -- (existe) de un id inexistente (42501). Es el mismo predicado que aplica
  -- agenda_actualizar_cita(), así que "esta" no cambia de comportamiento.
  if not (
    v_rol = 'administrador'::public.rol_usuario
    or v_cita.profesional_id = (select auth.uid())
    or (
      v_rol = 'tecnico_administrativo'::public.rol_usuario
      and v_cita.centro_id in (select public.centros_actuales())
    )
  ) then
    raise exception 'La cita no existe o no es tuya.' using errcode = '42501';
  end if;

  if p_alcance = 'esta' then
    if p_fecha is not null then
      raise exception 'Con "esta" no se cambia la fecha de la serie: usa esta_y_siguientes.' using errcode = '22023';
    end if;
    perform public.agenda_actualizar_cita(p_cita_id, p_estado, p_sala, p_inicio, p_fin);
    return jsonb_build_object('alcance', 'esta', 'cita_id', p_cita_id);
  end if;

  if v_cita.serie_id is null then
    raise exception 'La cita no pertenece a una serie: «esta y las siguientes» no aplica.' using errcode = '22023';
  end if;

  select * into v_serie from public.series_cita where id = v_cita.serie_id for no key update;

  v_plan := public.plan_edicion_serie(v_cita, v_serie, p_fecha, p_dia_semana, p_hora_local, p_duracion_minutos, p_zona_horaria);

  perform set_config('app.agenda_evento_regla', '', true);
  perform set_config('app.agenda_regla_ancla', '', true);
  if (v_plan ->> 'cambia')::boolean then
    perform set_config('app.agenda_regla_ancla', v_plan::text, true);
  end if;

  update public.series_cita
     set dia_semana       = (v_plan ->> 'dia_semana')::smallint,
         hora_local       = (v_plan ->> 'hora_local')::time,
         duracion_minutos = (v_plan ->> 'duracion_minutos')::smallint,
         zona_horaria     = v_plan ->> 'zona_horaria'
   where id = v_serie.id;

  perform set_config('app.agenda_regla_ancla', '', true);

  v_evento_id := nullif(current_setting('app.agenda_evento_regla', true), '')::uuid;

  if v_evento_id is null then
    return jsonb_build_object('alcance', 'esta_y_siguientes', 'serie_id', v_serie.id, 'propuestas', '[]'::jsonb);
  end if;

  v_resultado := public.agenda_propuestas_de_evento(v_evento_id);
  return jsonb_build_object('alcance', 'esta_y_siguientes', 'serie_id', v_serie.id) || v_resultado;
end;
$$;

comment on function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text, date
) is
  'Autoriza primero (42501, SQL-H3). esta: rechaza p_fecha (22023) y delega '
  'en agenda_actualizar_cita() (T-010). '
  'esta_y_siguientes: plan_edicion_serie() valida el ancla y arma el plan; si '
  'cambia, se publica como ancla transaccional (app.agenda_regla_ancla) '
  'ANTES del UPDATE sobre series_cita y se limpia justo después, para que '
  'fn_evento_regla_serie() (H8) acote citas_afectadas_por_regla() desde esta '
  'cita en adelante, no desde todas las futuras.';

revoke execute on function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text, date
) from public, anon;
grant  execute on function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text, date
) to authenticated;


-- =========================================================================
-- 8 · agenda_propuestas_de_evento() — usa calcular_propuesta_de_evento() (H9)
-- =========================================================================

create or replace function public.agenda_propuestas_de_evento(p_evento_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol           public.rol_usuario := (select public.rol_actual());
  v_evento        public.eventos_salientes;
  v_motivo        public.motivo_propuesta_cita;
  v_cita_id       uuid;
  v_cita          public.citas;
  v_fecha         date;
  v_hora_local    time;
  v_zona_nueva    text;
  v_instante      timestamptz;
  v_fin           timestamptz;
  v_clasificacion text;
  v_propuesta_id  uuid;
  v_creadas       uuid[] := array[]::uuid[];
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;

  select * into v_evento from public.eventos_salientes where id = p_evento_id;
  if not found then
    raise exception 'agenda_propuestas_de_evento: el evento no existe: %', p_evento_id using errcode = '22023';
  end if;

  if v_evento.tipo = 'agenda.regla_serie_cambiada' then
    v_motivo := 'regla_cambiada';
  elsif v_evento.tipo = 'agenda.zona_centro_cambiada' then
    v_motivo := 'zona_cambiada';
  else
    raise exception 'agenda_propuestas_de_evento: tipo de evento no soportado: %', v_evento.tipo using errcode = '22023';
  end if;

  for v_cita_id in
    select elem::uuid from jsonb_array_elements_text(v_evento.carga -> 'citas_afectadas') as elem
  loop
    if exists (select 1 from public.propuestas_cita p where p.evento_id = p_evento_id and p.cita_id = v_cita_id) then
      continue;
    end if;

    select * into v_cita from public.citas where id = v_cita_id;
    if not found then
      continue;
    end if;

    -- Entre que se disparó el trigger y que se llama aquí puede haber pasado
    -- el tiempo suficiente para que la cita ya haya empezado, o que ya no
    -- esté programada/confirmada: se salta sin abortar el lote.
    if v_cita.inicio <= now() or v_cita.estado not in ('programada', 'confirmada') then
      continue;
    end if;

    if not (
      v_rol = 'administrador'::public.rol_usuario
      or v_cita.profesional_id = (select auth.uid())
      or (
        v_rol = 'tecnico_administrativo'::public.rol_usuario
        and v_cita.centro_id in (select public.centros_actuales())
      )
    ) then
      continue;
    end if;

    select cp.fecha, cp.hora, cp.zona, cp.inicio, cp.fin, cp.clasificacion
      into v_fecha, v_hora_local, v_zona_nueva, v_instante, v_fin, v_clasificacion
      from public.calcular_propuesta_de_evento(v_evento.tipo, v_evento.carga, v_cita) cp;

    -- Un cambio de zona drástico puede empujar el instante recalculado al
    -- pasado (p. ej. Madrid → Tokio): la propuesta queda sin horario, igual
    -- que "no tiene horario" para confirmar.
    if v_instante <= now() then
      v_instante := null;
      v_fin := null;
    end if;

    insert into public.propuestas_cita
      (evento_id, cita_id, serie_id, paciente_id, profesional_id, centro_id, motivo,
       fecha_prevista, hora_local_prevista, inicio_propuesto, fin_propuesto,
       zona_horaria, creada_por)
    values
      (p_evento_id, v_cita_id, v_cita.serie_id, v_cita.paciente_id, v_cita.profesional_id, v_cita.centro_id, v_motivo,
       v_fecha, v_hora_local, v_instante, v_fin, v_zona_nueva, (select auth.uid()))
    returning id into v_propuesta_id;

    v_creadas := v_creadas || v_propuesta_id;
  end loop;

  update public.eventos_salientes
     set estado = 'entregado', actualizado_en = now()
   where id = p_evento_id;

  return jsonb_build_object('evento_id', p_evento_id, 'propuestas', to_jsonb(v_creadas));
end;
$$;

comment on function public.agenda_propuestas_de_evento(uuid) is
  'H9: el cálculo de fecha/hora/duración vive en calcular_propuesta_de_evento(), '
  'no aquí — antes conservaba la fecha de la cita y su propia duración. '
  'Idempotente por evento_id+cita_id. Marca el evento entregado.';

revoke execute on function public.agenda_propuestas_de_evento(uuid) from public;
grant  execute on function public.agenda_propuestas_de_evento(uuid) to authenticated;


-- =========================================================================
-- 9 · agenda_confirmar_propuesta() — bloqueo, guardas de frescura/estado y
--     marca de anomalía horaria al confirmar (ADR-068).
-- =========================================================================

create or replace function public.agenda_confirmar_propuesta(p_propuesta_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol             public.rol_usuario := (select public.rol_actual());
  v_propuesta       public.propuestas_cita;
  v_cita            public.citas;
  v_evento          public.eventos_salientes;
  v_serie           public.series_cita;
  v_zona_centro     text;
  v_fresca          record;
  v_cita_id         uuid;
  v_tipo_terapia_id uuid;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;

  select * into v_propuesta from public.propuestas_cita where id = p_propuesta_id for no key update;
  if not found then
    raise exception 'La propuesta no existe.' using errcode = '22023';
  end if;

  if not (
    v_rol = 'administrador'::public.rol_usuario
    or v_propuesta.profesional_id = (select auth.uid())
    or (
      v_rol = 'tecnico_administrativo'::public.rol_usuario
      and v_propuesta.centro_id in (select public.centros_actuales())
    )
  ) then
    raise exception 'La propuesta no existe.' using errcode = '42501';
  end if;

  if v_propuesta.estado <> 'pendiente' then
    raise exception 'La propuesta ya está resuelta.' using errcode = '22023';
  end if;

  if v_propuesta.inicio_propuesto is null or v_propuesta.fin_propuesto is null then
    raise exception 'Esta propuesta no tiene horario: no se puede confirmar sin una hora concreta.' using errcode = '22023';
  end if;

  if v_propuesta.inicio_propuesto <= now() then
    raise exception 'El horario propuesto ha quedado en el pasado: hay que replantearlo.' using errcode = '22023';
  end if;

  if v_propuesta.cita_id is not null then
    select * into v_cita from public.citas where id = v_propuesta.cita_id for no key update;

    if v_cita.inicio <= now() then
      raise exception 'La cita ya ha empezado o ha pasado.' using errcode = '22023';
    end if;

    if v_cita.estado not in ('programada', 'confirmada') then
      raise exception 'La cita está cancelada o cerrada.' using errcode = '22023';
    end if;

    if v_propuesta.evento_id is null then
      raise exception 'La propuesta no tiene evento asociado: sin evento que reconciliar.' using errcode = '22023';
    end if;

    select * into v_evento from public.eventos_salientes where id = v_propuesta.evento_id;

    if v_propuesta.motivo = 'regla_cambiada' then
      if v_cita.desviada then
        raise exception 'La cita se movió a mano: ya no la gobierna esta regla.' using errcode = '22023';
      end if;

      -- SQL-H1: for share espera a un agenda_editar_serie() en vuelo (que
      -- tiene la serie en for no key update) y, en READ COMMITTED, relee la
      -- versión confirmada: sin candado, la comparación con la carga podría
      -- ver la regla vieja y confirmar una propuesta que la edición anula.
      select * into v_serie from public.series_cita where id = v_cita.serie_id for share;
      if v_serie.dia_semana       is distinct from (v_evento.carga ->> 'dia_semana')::smallint
         or v_serie.hora_local       is distinct from (v_evento.carga ->> 'hora_local')::time
         or v_serie.duracion_minutos is distinct from (v_evento.carga ->> 'duracion_minutos')::smallint
         or v_serie.zona_horaria     is distinct from v_evento.carga ->> 'zona_horaria'
      then
        raise exception 'La serie ya tiene otra regla: esta propuesta quedó obsoleta.' using errcode = '22023';
      end if;
    elsif v_propuesta.motivo = 'zona_cambiada' then
      -- SQL-H1: lo mismo frente a un UPDATE de la zona del centro en vuelo.
      select c.zona_horaria into v_zona_centro from public.centros c where c.id = v_cita.centro_id for share;
      if v_zona_centro is distinct from v_evento.carga ->> 'zona_horaria_nueva' then
        raise exception 'El centro ya tiene otra zona horaria: esta propuesta quedó obsoleta.' using errcode = '22023';
      end if;
    end if;

    -- Frescura: recalcula contra el estado ACTUAL de la cita (§1.6 del
    -- diseño) — si algo cambió desde que se creó la propuesta, no se confía
    -- en el valor guardado.
    select cp.* into v_fresca
      from public.calcular_propuesta_de_evento(v_evento.tipo, v_evento.carga, v_cita) cp;

    if v_fresca.inicio is distinct from v_propuesta.inicio_propuesto
       or v_fresca.fin is distinct from v_propuesta.fin_propuesto
       or v_fresca.zona is distinct from v_propuesta.zona_horaria
    then
      raise exception 'La cita cambió desde que se hizo esta propuesta: hay que replantearla.' using errcode = '22023';
    end if;

    perform set_config('app.agenda_origen', 'serie', true);
    if v_fresca.clasificacion <> 'normal' and v_cita.serie_id is not null and not v_cita.desviada then
      update public.citas
         set inicio             = v_propuesta.inicio_propuesto,
             fin                = v_propuesta.fin_propuesto,
             zona_horaria       = v_propuesta.zona_horaria,
             desviada           = true,
             motivo_desviacion  = 'anomalia_horaria'
       where id = v_propuesta.cita_id;
    else
      update public.citas
         set inicio       = v_propuesta.inicio_propuesto,
             fin          = v_propuesta.fin_propuesto,
             zona_horaria = v_propuesta.zona_horaria
       where id = v_propuesta.cita_id;
    end if;
    perform set_config('app.agenda_origen', '', true);
    v_cita_id := v_propuesta.cita_id;
  else
    select s.tipo_terapia_id into v_tipo_terapia_id
      from public.series_cita s
     where s.id = v_propuesta.serie_id;

    insert into public.citas
      (paciente_id, profesional_id, centro_id, serie_id, tipo_terapia_id, inicio, fin, zona_horaria,
       desviada, motivo_desviacion, creada_por)
    values
      (v_propuesta.paciente_id, v_propuesta.profesional_id, v_propuesta.centro_id, v_propuesta.serie_id,
       v_tipo_terapia_id,
       v_propuesta.inicio_propuesto, v_propuesta.fin_propuesto, v_propuesta.zona_horaria,
       true,
       case v_propuesta.motivo
         when 'festivo' then 'festivo'::public.motivo_desviacion_cita
         when 'ausencia' then 'ausencia'::public.motivo_desviacion_cita
         else 'reprogramada'::public.motivo_desviacion_cita
       end,
       (select auth.uid()))
    returning id into v_cita_id;
  end if;

  update public.propuestas_cita
     set estado = 'confirmada', resuelta_en = now(), resuelta_por = (select auth.uid()), cita_resultante_id = v_cita_id
   where id = p_propuesta_id;

  return v_cita_id;
end;
$$;

comment on function public.agenda_confirmar_propuesta(uuid) is
  'ADR-068: bloquea propuesta y cita (for no key update) y lee la serie o '
  'el centro en for share (SQL-H1), rechaza (22023) '
  'horario pasado, cita ya empezada/cancelada/cerrada, ancla desviada, regla '
  'o zona ya distinta de la que originó la propuesta, y frescura (recalcula '
  'con calcular_propuesta_de_evento y compara). Si la clasificación no es '
  '''normal'' (hueco/solape), la cita queda desviada con motivo '
  'anomalia_horaria al confirmar. El choque 23P01 se propaga tal cual.';

revoke execute on function public.agenda_confirmar_propuesta(uuid) from public;
grant  execute on function public.agenda_confirmar_propuesta(uuid) to authenticated;


-- =========================================================================
-- 10 · agenda_previsualizar_edicion_serie() — de solo lectura: enseña el
--      plan y las propuestas ANTES de confirmar nada (ADR-068).
-- =========================================================================

create function public.agenda_previsualizar_edicion_serie(
  p_cita_id          uuid,
  p_fecha            date default null,
  p_dia_semana       smallint default null,
  p_hora_local       time default null,
  p_duracion_minutos smallint default null,
  p_zona_horaria     text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := (select public.rol_actual());
  v_cita      public.citas;
  v_serie     public.series_cita;
  v_plan      jsonb;
  v_citas     jsonb := '[]'::jsonb;
  v_c         public.citas;
  v_prop      record;
  v_ordinal   smallint;
  v_ultimo    boolean;
  v_recorte   boolean := false;
  v_recortada boolean;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;

  select * into v_cita from public.citas where id = p_cita_id;
  if not found then
    raise exception 'La cita no existe o no es tuya.' using errcode = '42501';
  end if;

  if not (
    v_rol = 'administrador'::public.rol_usuario
    or v_cita.profesional_id = (select auth.uid())
    or (
      v_rol = 'tecnico_administrativo'::public.rol_usuario
      and v_cita.centro_id in (select public.centros_actuales())
    )
  ) then
    raise exception 'La cita no existe o no es tuya.' using errcode = '42501';
  end if;

  if v_cita.serie_id is null then
    raise exception 'La cita no pertenece a una serie: «esta y las siguientes» no aplica.' using errcode = '22023';
  end if;

  select * into v_serie from public.series_cita where id = v_cita.serie_id;

  v_plan := public.plan_edicion_serie(v_cita, v_serie, p_fecha, p_dia_semana, p_hora_local, p_duracion_minutos, p_zona_horaria);

  if v_serie.periodicidad = 'mensual' then
    -- El ordinal de la regla es el del plan (SQL-H2), no el de fecha_destino:
    -- una ancla recortada de una serie del 5.º cae en el 4.º y sigue siendo 5.
    v_ordinal := (v_plan ->> 'ordinal')::smallint;
    v_ultimo  := (v_ordinal = 5);
  else
    v_ultimo  := false;
  end if;

  if (v_plan ->> 'cambia')::boolean then
    for v_c in
      select c.* from public.citas_afectadas_por_regla(v_serie.id, v_cita.id) with ordinality as a(cita_id, n)
        join public.citas c on c.id = a.cita_id
       order by a.n
    loop
      -- Mismo salto que agenda_propuestas_de_evento (§1.5): lo que la edición
      -- no propondría, la previsualización no lo enseña.
      if not (
        v_rol = 'administrador'::public.rol_usuario
        or v_c.profesional_id = (select auth.uid())
        or (
          v_rol = 'tecnico_administrativo'::public.rol_usuario
          and v_c.centro_id in (select public.centros_actuales())
        )
      ) then
        continue;
      end if;

      select cp.* into v_prop
        from public.calcular_propuesta_de_evento('agenda.regla_serie_cambiada', v_plan, v_c) cp;

      v_recortada := false;
      if v_serie.periodicidad = 'mensual' then
        v_recortada := ((extract(day from v_prop.fecha)::int - 1) / 7) + 1 <> v_ordinal;
        if v_recortada then
          v_recorte := true;
        end if;
      end if;

      v_citas := v_citas || jsonb_build_array(jsonb_build_object(
        'cita_id', v_c.id,
        'fecha_actual', (v_c.inicio at time zone v_c.zona_horaria)::date,
        'fecha_nueva', v_prop.fecha,
        'hora_local', v_prop.hora,
        'inicio', case when v_prop.inicio > now() then v_prop.inicio else null end,
        'fin', case when v_prop.inicio > now() then v_prop.fin else null end,
        'clasificacion', v_prop.clasificacion,
        'recortada', v_recortada
      ));
    end loop;
  end if;

  return jsonb_build_object(
    'serie_id', v_serie.id,
    'desde_cita_id', v_cita.id,
    'fecha_origen', v_plan ->> 'fecha_origen',
    'fecha_destino', v_plan ->> 'fecha_destino',
    'cambia', (v_plan ->> 'cambia')::boolean,
    'regla_anterior', jsonb_build_object(
      'periodicidad', v_serie.periodicidad,
      'dia_semana', v_serie.dia_semana,
      'hora_local', v_serie.hora_local,
      'duracion_minutos', v_serie.duracion_minutos,
      'zona_horaria', v_serie.zona_horaria
    ),
    'regla', jsonb_build_object(
      'periodicidad', v_serie.periodicidad,
      'dia_semana', (v_plan ->> 'dia_semana')::smallint,
      'hora_local', v_plan ->> 'hora_local',
      'duracion_minutos', (v_plan ->> 'duracion_minutos')::smallint,
      'zona_horaria', v_plan ->> 'zona_horaria',
      'ordinal', v_ordinal,
      'ultimo', v_ultimo,
      'recorte', v_recorte
    ),
    'citas', v_citas
  );
end;
$$;

comment on function public.agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text) is
  'ADR-068: SIN escritura (ni INSERT, ni UPDATE, ni set_config, ni bloqueo de '
  'filas) — mismas guardas de autorización y de plan_edicion_serie() que '
  'agenda_editar_serie(), para que lo que enseña sea EXACTAMENTE lo que '
  'produciría confirmar. Para una regla mensual, ordinal/ultimo/recorte '
  'informan si el 5º ordinal se recorta al último del mes en algún mes.';

revoke execute on function public.agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text) from public, anon;
grant  execute on function public.agenda_previsualizar_edicion_serie(uuid, date, smallint, time, smallint, text) to authenticated;


-- =========================================================================
-- 11 · ocurrencias_serie() — ADR-069: el ordinal mensual se fija en la
--      primera ocurrencia, no se recalcula mes a mes.
-- =========================================================================

create or replace function public.ocurrencias_serie(
  p_periodicidad public.periodicidad_serie,
  p_dia_semana   smallint,
  p_desde        date,
  p_sesiones     smallint,
  p_fin_el       date
)
returns setof date
language plpgsql
stable
set search_path = ''
as $$
declare
  v_fecha     date;
  v_contador  smallint := 0;
  v_max       constant smallint := 200;
  v_ordinal   smallint;
  v_mes0      date;
begin
  if p_dia_semana is null or p_dia_semana < 1 or p_dia_semana > 7 then
    raise exception 'ocurrencias_serie: dia_semana fuera de rango (1-7, ISODOW)' using errcode = '22023';
  end if;
  if p_desde is null then
    raise exception 'ocurrencias_serie: falta la fecha de inicio' using errcode = '22023';
  end if;
  if p_sesiones is null and p_fin_el is null then
    raise exception 'ocurrencias_serie: se necesita sesiones_totales o fin_el' using errcode = '22023';
  end if;

  -- Primera fecha >= p_desde con extract(isodow) = p_dia_semana. NUNCA dow.
  v_fecha := p_desde + (((p_dia_semana - extract(isodow from p_desde)::int) + 7) % 7);

  if p_periodicidad = 'mensual' then
    -- ADR-069: el ordinal se fija AQUÍ, en la primera ocurrencia, y no se
    -- vuelve a tocar — antes se recalculaba de la fecha anterior en cada
    -- vuelta, y una racha de meses de 4 semanas iba desplazando el ordinal
    -- real sin que nadie lo pidiera.
    v_ordinal := ((extract(day from v_fecha)::int - 1) / 7) + 1;
    v_mes0    := date_trunc('month', v_fecha)::date;
  end if;

  loop
    if p_sesiones is not null and v_contador >= p_sesiones then
      exit;
    end if;
    if p_fin_el is not null and v_fecha > p_fin_el then
      exit;
    end if;

    v_contador := v_contador + 1;
    if v_contador > v_max then
      raise exception 'ocurrencias_serie: la serie supera el tope de % ocurrencias', v_max using errcode = '22023';
    end if;

    return next v_fecha;

    if p_periodicidad = 'semanal' then
      v_fecha := v_fecha + 7;
    elsif p_periodicidad = 'quincenal' then
      v_fecha := v_fecha + 14;
    else
      v_fecha := public.enesimo_dia_del_mes(
        (v_mes0 + make_interval(months => v_contador))::date, p_dia_semana, v_ordinal);
    end if;
  end loop;

  return;
end;
$$;

comment on function public.ocurrencias_serie(public.periodicidad_serie, smallint, date, smallint, date) is
  'Calendario puro. Tope duro de 200 ocurrencias (22023 al superarlo). '
  'ADR-069: mensual usa SIEMPRE el ordinal de la primera ocurrencia '
  '(enesimo_dia_del_mes), nunca lo recalcula mes a mes. Las series creadas '
  'antes de este arreglo NO se corrigen aquí (ver detección en el informe del '
  'ticket); se corrigen editándolas por el camino normal si hiciera falta.';

revoke execute on function public.ocurrencias_serie(public.periodicidad_serie, smallint, date, smallint, date) from public;
grant  execute on function public.ocurrencias_serie(public.periodicidad_serie, smallint, date, smallint, date) to authenticated;


-- =========================================================================
-- 12 · Tabla: ADR-069 revoca INSERT sobre series_cita (solo
--      agenda_crear_serie crea series); ADR-068 ya había revocado UPDATE en
--      el diseño de este mismo ticket, se hace aquí junto al resto.
-- =========================================================================

revoke insert, update on table public.series_cita from authenticated;

comment on policy series_cita_modificacion on public.series_cita is
  'Dormida desde T-011b (ADR-068): authenticated no tiene UPDATE sobre la tabla y la regla solo '
  'cambia por agenda_editar_serie (security definer). Se conserva porque 11-cobertura la declara '
  'y para que un grant futuro no abra la tabla sin filtro.';

comment on policy series_cita_alta on public.series_cita is
  'Dormida desde T-011b (ADR-069): authenticated no tiene INSERT sobre la tabla y las series solo '
  'nacen por agenda_crear_serie. El vínculo (T-029) lo sigue exigiendo el disparador '
  'exigir_vinculo_agenda dentro de la función. Se conserva porque 11-cobertura la declara y para '
  'que un grant futuro no abra la tabla sin filtro.';
