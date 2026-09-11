-- =============================================================================
-- T-011a · Series de citas: materialización y desviaciones
--
-- Referencias: docs/architecture.md §Invariante 4. ADR-034 (hora local + zona en
-- la serie, instante + zona en la cita; anomalías de marzo y octubre; nada se
-- recalcula solo), ADR-024 (outbox en Postgres), ADR-045 (estados). El «Diseño
-- aprobado · 10-09-2026» del propio ticket, cuyas secciones se citan como §N.
--
-- T-010 dejó las tablas (series_cita, citas, disponibilidad, tipos_terapia,
-- citas_sin_solape_profesional, citas_agenda, agenda_actualizar_cita()). Esta
-- migración NO crea ninguna tabla de agenda: añade materialización,
-- desviaciones, dos tablas de estado operativo (eventos_salientes,
-- propuestas_cita) y cuatro disparadores.
--
-- Orden de la migración (§9 del diseño): enums → eventos_salientes →
-- propuestas_cita + índices + disparadores + RLS → resolver_hora_local() /
-- ocurrencias_serie() → fn_proteger_cita_pasada() + fn_marcar_cita_desviada() →
-- fn_evento_zona_centro() + fn_evento_regla_serie() → las seis funciones de
-- dominio → grant/revoke → comentarios.
-- =============================================================================


-- =========================================================================
-- 1 · Enums
-- =========================================================================

-- Exactamente dos valores, y la firma de las funciones que lo reciben NO le da
-- valor por defecto: la pregunta «¿solo esta, o esta y las siguientes?» es
-- obligatoria por firma. «Todas» no existe ni como tercer valor.
create type public.alcance_cambio_serie as enum ('esta', 'esta_y_siguientes');

create type public.estado_evento_saliente as enum ('pendiente', 'entregado', 'fallido');

create type public.motivo_propuesta_cita as enum (
  'festivo', 'ausencia', 'ocupada', 'zona_cambiada', 'regla_cambiada'
);

create type public.estado_propuesta_cita as enum ('pendiente', 'confirmada', 'descartada');


-- =========================================================================
-- 2 · eventos_salientes — el outbox del ADR-024, sin consumidor
--
-- Forma completa y SIN consumidor ni cron: eso es T-015/T-026. `tipo` es texto
-- y no enum a propósito: el conjunto de tipos de evento no está cerrado.
-- =========================================================================

create table public.eventos_salientes (
  id                 uuid primary key default gen_random_uuid(),
  tipo               text not null,
  carga              jsonb not null,
  estado             public.estado_evento_saliente not null default 'pendiente',
  intentos           smallint not null default 0,
  ultimo_error       text,
  proximo_intento    timestamptz,
  clave_idempotencia text unique,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  creado_por         uuid references public.perfiles (id),
  constraint eventos_salientes_tipo_ck check (tipo ~ '^[a-z0-9_]+\.[a-z0-9_]+$')
);

comment on table public.eventos_salientes is
  'Outbox del ADR-024, forma completa. Escriben SOLO los disparadores '
  'security definer de esta migración (evento_zona_centro, evento_regla_serie). '
  'Sin consumidor ni cron: eso es T-015/T-026. RLS activada y CERO políticas.';

comment on column public.eventos_salientes.tipo is
  'Forma "tipo.subtipo" (p. ej. agenda.zona_centro_cambiada). Texto y no enum: '
  'el conjunto de tipos de evento no está cerrado.';

create index eventos_salientes_pendientes_idx
  on public.eventos_salientes (proximo_intento) where estado = 'pendiente';

alter table public.eventos_salientes enable row level security;
-- CERO políticas: nadie lee ni escribe esta tabla por sesión de usuario. Solo
-- los disparadores security definer, que corren como el dueño de la tabla y
-- por tanto no están sujetos a RLS.


-- =========================================================================
-- 3 · propuestas_cita — lo que se propone y no ha decidido nadie
-- =========================================================================

create table public.propuestas_cita (
  id                  uuid primary key default gen_random_uuid(),
  serie_id            uuid references public.series_cita (id),
  cita_id             uuid references public.citas (id),
  evento_id           uuid references public.eventos_salientes (id),
  paciente_id         uuid not null references public.pacientes (id),
  profesional_id      uuid not null references public.perfiles (id),
  centro_id           uuid references public.centros (id),
  motivo              public.motivo_propuesta_cita not null,
  fecha_prevista      date not null,
  hora_local_prevista time not null,
  inicio_propuesto    timestamptz,
  fin_propuesto       timestamptz,
  zona_horaria        text not null,
  estado              public.estado_propuesta_cita not null default 'pendiente',
  resuelta_en         timestamptz,
  resuelta_por        uuid references public.perfiles (id),
  cita_resultante_id  uuid references public.citas (id),
  creada_en           timestamptz not null default now(),
  creada_por          uuid references public.perfiles (id),
  -- Siempre cuelga de algo: de una serie que se materializa o de un evento que
  -- reordena lo ya materializado.
  constraint propuestas_cita_cuelga_ck check (serie_id is not null or evento_id is not null),
  -- resuelta ⇔ tiene fecha y autor de resolución.
  constraint propuestas_cita_resuelta_ck check (
    (estado = 'pendiente' and resuelta_en is null and resuelta_por is null)
    or (estado <> 'pendiente' and resuelta_en is not null and resuelta_por is not null)
  ),
  -- confirmada ⇔ tiene cita resultante.
  constraint propuestas_cita_confirmada_ck check (
    (estado = 'confirmada' and cita_resultante_id is not null)
    or (estado <> 'confirmada' and cita_resultante_id is null)
  )
);

comment on table public.propuestas_cita is
  'Lo que se propone y no ha decidido nadie: un festivo/ausencia que impidió '
  'materializar una sesión, un choque de horario, o una cita futura afectada '
  'por un cambio de zona o de regla de serie. Solo escriben las funciones '
  'agenda_*: ninguna política de insert/update, solo una de select.';

comment on column public.propuestas_cita.inicio_propuesto is
  'Nulo cuando no se encontró un desplazamiento que no choque (§7): la '
  'propuesta queda sin hora y la decide una persona.';

create index propuestas_cita_serie_idx
  on public.propuestas_cita (serie_id) where serie_id is not null;
create index propuestas_cita_evento_idx
  on public.propuestas_cita (evento_id) where evento_id is not null;
create index propuestas_cita_pendientes_idx
  on public.propuestas_cita (centro_id, fecha_prevista) where estado = 'pendiente';

create trigger validar_zona_horaria_propuestas_cita
  before insert or update of zona_horaria on public.propuestas_cita
  for each row execute function public.fn_validar_zona_horaria('zona_horaria');

create trigger auditar_propuestas_cita
  after insert or update or delete on public.propuestas_cita
  for each row execute function public.fn_auditar('id');

alter table public.propuestas_cita enable row level security;

-- Misma forma que citas_lectura + la rama del técnico (citas_alta/modificacion).
create policy propuestas_cita_lectura on public.propuestas_cita
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );

-- Ninguna política de insert/update: solo escriben las funciones agenda_*
-- (security definer), que comprueban la autorización por dentro.


-- =========================================================================
-- 4 · resolver_hora_local() — la primitiva que decide (§3)
-- =========================================================================

create function public.resolver_hora_local(p_zona text, p_local timestamp)
returns table (instante timestamptz, clasificacion text)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ref        timestamptz;
  v_desfase_1  interval;
  v_desfase_2  interval;
  v_desfases   interval[];
  v_desfase    interval;
  v_candidato  timestamptz;
  v_candidatos timestamptz[] := array[]::timestamptz[];
  v_lo         timestamptz;
  v_hi         timestamptz;
  v_mid        timestamptz;
  v_i          integer;
begin
  if p_zona is null or p_local is null then
    raise exception 'resolver_hora_local: zona y hora local son obligatorias' using errcode = '22023';
  end if;
  if not public.es_zona_iana(p_zona) then
    raise exception 'resolver_hora_local: zona horaria no válida: %', p_zona using errcode = '22023';
  end if;

  -- 1 · la hora de pared leída como si fuera UTC.
  v_ref := p_local at time zone 'UTC';

  -- 2 · desfase en un instante t: (t at time zone p_zona) - (t at time zone 'UTC').
  -- Se toman los de v_ref - 1 día y v_ref + 1 día.
  v_desfase_1 := ((v_ref - interval '1 day') at time zone p_zona)
               - ((v_ref - interval '1 day') at time zone 'UTC');
  v_desfase_2 := ((v_ref + interval '1 day') at time zone p_zona)
               - ((v_ref + interval '1 day') at time zone 'UTC');

  v_desfases := array[v_desfase_1];
  if v_desfase_2 <> v_desfase_1 then
    v_desfases := v_desfases || v_desfase_2;
  end if;

  -- 3 · candidatos: v_ref - desfase para cada desfase distinto, conservando
  -- los que cumplen (candidato at time zone p_zona) = p_local.
  foreach v_desfase in array v_desfases loop
    v_candidato := v_ref - v_desfase;
    if (v_candidato at time zone p_zona) = p_local then
      v_candidatos := v_candidatos || v_candidato;
    end if;
  end loop;

  -- 4 · uno → normal. dos → ambigua (la primera de las dos). cero → inexistente.
  if array_length(v_candidatos, 1) = 1 then
    return query select v_candidatos[1], 'normal'::text;
    return;
  elsif array_length(v_candidatos, 1) = 2 then
    return query select least(v_candidatos[1], v_candidatos[2]), 'ambigua'::text;
    return;
  end if;

  -- 5 · inexistente: instante = min{ t : (t at time zone p_zona) >= p_local },
  -- por bisección de resolución de un segundo, acotada a 20 iteraciones.
  v_lo := v_ref - interval '1 day';
  v_hi := v_ref + interval '1 day';
  for v_i in 1 .. 20 loop
    exit when (v_hi - v_lo) <= interval '1 second';
    v_mid := v_lo + (v_hi - v_lo) / 2;
    if (v_mid at time zone p_zona) >= p_local then
      v_hi := v_mid;
    else
      v_lo := v_mid;
    end if;
  end loop;

  return query select v_hi, 'inexistente'::text;
end;
$$;

comment on function public.resolver_hora_local(text, timestamp) is
  'ADR-034 §3 del diseño de T-011. Clasifica una hora local en una zona IANA: '
  '"normal" (una vez), "ambigua" (el solape de octubre; se elige la primera '
  'de las dos, con least()) o "inexistente" (el hueco de marzo; se elige el '
  'instante del salto, el más cercano hacia delante, por bisección acotada a '
  '20 iteraciones). STABLE y no IMMUTABLE: la tzdata cambia.';

create function public.ocurrencias_serie(
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
  v_fecha      date;
  v_contador   smallint := 0;
  v_max        constant smallint := 200;
  v_ordinal    smallint;
  v_mes_base   date;
  v_candidata  date;
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
      -- mensual: el mismo ordinal del día de la semana del mes siguiente,
      -- recortando al último de ese día si el mes no lo tiene (§12.2 del diseño).
      v_ordinal  := ((extract(day from v_fecha)::int - 1) / 7) + 1;
      v_mes_base := (date_trunc('month', v_fecha + interval '1 month'))::date;
      v_candidata := v_mes_base
        + (((p_dia_semana - extract(isodow from v_mes_base)::int) + 7) % 7)
        + (v_ordinal - 1) * 7;
      if extract(month from v_candidata) <> extract(month from v_mes_base) then
        v_candidata := v_candidata - 7;
      end if;
      v_fecha := v_candidata;
    end if;
  end loop;

  return;
end;
$$;

comment on function public.ocurrencias_serie(public.periodicidad_serie, smallint, date, smallint, date) is
  'Calendario puro (§3 del diseño de T-011): fechas de una serie, sin resolver '
  'hora ni zona. Tope duro de 200 ocurrencias (22023 al superarlo). mensual: '
  'ordinal del día de la semana del mes, decisión de dominio del §12.2, no '
  'reabierta por este ticket.';


-- =========================================================================
-- 5 · fn_proteger_cita_pasada() + fn_marcar_cita_desviada()
-- =========================================================================

create function public.fn_proteger_cita_pasada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.fin > now() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- La sesión ya terminó: es historia (notas clínicas y cobros cuelgan de ella).
  if tg_op = 'DELETE' then
    raise exception
      'Una cita pasada no se puede eliminar (constitución, regla 6): %', old.id
      using errcode = '42501';
  end if;

  if new.inicio            is distinct from old.inicio
     or new.fin             is distinct from old.fin
     or new.zona_horaria    is distinct from old.zona_horaria
     or new.serie_id        is distinct from old.serie_id
     or new.paciente_id     is distinct from old.paciente_id
     or new.profesional_id  is distinct from old.profesional_id
     or new.centro_id       is distinct from old.centro_id
     or new.tipo_terapia_id is distinct from old.tipo_terapia_id
     or new.desviada        is distinct from old.desviada
     or new.motivo_desviacion is distinct from old.motivo_desviacion
  then
    raise exception
      'Una cita pasada no se puede reprogramar ni reatribuir (constitución, regla 6): %', old.id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_proteger_cita_pasada() is
  'Con old.fin <= now(): DELETE falla siempre; UPDATE falla si cambia '
  'inicio/fin/zona_horaria/serie_id/paciente_id/profesional_id/centro_id/'
  'tipo_terapia_id/desviada/motivo_desviacion. Sigue permitido cambiar estado '
  '(marcar realizada una sesión de ayer), sala, nota_operativa y '
  'marcada_realizada_en/_por. Hace cumplir «las citas pasadas no se tocan '
  'jamás» con un disparador, no solo con la interfaz.';

revoke execute on function public.fn_proteger_cita_pasada() from public;

create trigger proteger_cita_pasada
  before update or delete on public.citas
  for each row execute function public.fn_proteger_cita_pasada();

create function public.fn_marcar_cita_desviada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.serie_id is not null
     and (
       new.inicio is distinct from old.inicio
       or new.fin is distinct from old.fin
       or new.zona_horaria is distinct from old.zona_horaria
     )
     and coalesce(current_setting('app.agenda_origen', true), '') <> 'serie'
  then
    new.desviada := true;
    if new.motivo_desviacion is null then
      new.motivo_desviacion := 'reprogramada';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.fn_marcar_cita_desviada() is
  'Si serie_id no es nulo y el instante cambia de verdad: desviada := true, '
  'salvo que la transacción venga de la maquinaria de la serie, marcada con '
  'set_config(''app.agenda_origen'', ''serie'', true) (local a la transacción, '
  'la ponen las funciones agenda_confirmar_propuesta al mover una cita ya '
  'existente). Así, mover una cita porque la serie lo dice y un humano lo '
  'confirmó NO la marca desviada; moverla a mano (agenda_actualizar_cita, '
  'sin la marca) sí.';

revoke execute on function public.fn_marcar_cita_desviada() from public;

create trigger marcar_cita_desviada
  before update of inicio, fin, zona_horaria on public.citas
  for each row execute function public.fn_marcar_cita_desviada();


-- =========================================================================
-- 6 · fn_evento_zona_centro() + fn_evento_regla_serie()
-- =========================================================================

create function public.fn_evento_zona_centro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_citas jsonb;
begin
  if new.zona_horaria is not distinct from old.zona_horaria then
    return new;
  end if;

  select coalesce(jsonb_agg(c.id), '[]'::jsonb)
    into v_citas
    from public.citas c
   where c.centro_id = new.id
     and c.inicio > now()
     and c.estado in ('programada', 'confirmada');

  insert into public.eventos_salientes (tipo, carga, creado_por)
  values (
    'agenda.zona_centro_cambiada',
    jsonb_build_object(
      'centro_id', new.id,
      'zona_horaria_anterior', old.zona_horaria,
      'zona_horaria_nueva', new.zona_horaria,
      'citas_afectadas', v_citas
    ),
    auth.uid()
  );

  return new;
end;
$$;

comment on function public.fn_evento_zona_centro() is
  'Cambiar centros.zona_horaria NO mueve ninguna cita: genera UNA fila de '
  'outbox con las citas futuras (programada/confirmada) de ese centro en la '
  'carga. wa.me no devuelve estado de entrega: el sistema no sabe qué citas '
  'conoce ya el paciente, así que mover por su cuenta es mandarlo a una '
  'consulta vacía. Se confirma cita a cita (agenda_propuestas_de_evento + '
  'agenda_confirmar_propuesta).';

revoke execute on function public.fn_evento_zona_centro() from public;

create trigger evento_zona_centro
  after update of zona_horaria on public.centros
  for each row execute function public.fn_evento_zona_centro();

create function public.fn_evento_regla_serie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_citas jsonb;
  v_evento_id uuid;
begin
  if new.dia_semana       is not distinct from old.dia_semana
     and new.hora_local       is not distinct from old.hora_local
     and new.duracion_minutos is not distinct from old.duracion_minutos
     and new.zona_horaria     is not distinct from old.zona_horaria
  then
    return new;
  end if;

  select coalesce(jsonb_agg(c.id), '[]'::jsonb)
    into v_citas
    from public.citas c
   where c.serie_id = new.id
     and c.inicio > now()
     and c.estado in ('programada', 'confirmada')
     and c.desviada = false;

  insert into public.eventos_salientes (tipo, carga, creado_por)
  values (
    'agenda.regla_serie_cambiada',
    jsonb_build_object(
      'serie_id', new.id,
      'dia_semana', new.dia_semana,
      'hora_local', new.hora_local,
      'duracion_minutos', new.duracion_minutos,
      'zona_horaria', new.zona_horaria,
      'citas_afectadas', v_citas
    ),
    auth.uid()
  )
  returning id into v_evento_id;

  -- HALLAZGO MEDIA DE LA REVISIÓN CON OPUS (11-09-2026): agenda_editar_serie()
  -- buscaba su evento con «el más reciente de esta serie». creado_en es now(),
  -- que NO avanza dentro de una transacción: dos ediciones seguidas en la misma
  -- transacción empatan y el desempate cogía la vieja. Aquí se publica la
  -- IDENTIDAD del evento recién creado, local a la transacción, y la función la
  -- lee. Con dos ediciones concurrentes pasaba lo mismo por otro camino: las
  -- dos resolvían contra la misma fila.
  perform set_config('app.agenda_evento_regla', v_evento_id::text, true);

  return new;
end;
$$;

comment on function public.fn_evento_regla_serie() is
  'Ídem fn_evento_zona_centro() para la regla de una serie: cambiar '
  'dia_semana/hora_local/duracion_minutos/zona_horaria de series_cita NO '
  'mueve ninguna cita. Solo las futuras NO DESVIADAS entran en la carga: una '
  'cita ya tocada a mano no la gobierna más la serie.';

revoke execute on function public.fn_evento_regla_serie() from public;

create trigger evento_regla_serie
  after update of dia_semana, hora_local, duracion_minutos, zona_horaria on public.series_cita
  for each row execute function public.fn_evento_regla_serie();


-- =========================================================================
-- 7 · Las seis funciones de dominio (§6 del diseño)
--
-- Todas security definer, search_path = '', mismo predicado de autorización
-- que las políticas de T-010: administrador siempre; el profesional dueño;
-- el técnico administrativo acotado a sus centros (centros_actuales()).
-- =========================================================================

-- ---------------------------------------------------------------------------
-- 7.1 · agenda_crear_serie()
-- ---------------------------------------------------------------------------

create function public.agenda_crear_serie(
  p_paciente_id      uuid,
  p_profesional_id   uuid,
  p_centro_id        uuid,
  p_tipo_terapia_id  uuid,
  p_periodicidad     public.periodicidad_serie,
  p_dia_semana       smallint,
  p_hora_local       time,
  p_duracion_minutos smallint,
  p_desde            date,
  p_sesiones_totales smallint default null,
  p_fin_el           date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol             public.rol_usuario := (select public.rol_actual());
  v_zona            text;
  v_serie_id        uuid;
  v_fecha           date;
  v_instante        timestamptz;
  v_fin             timestamptz;
  v_clasificacion   text;
  v_citas           jsonb := '[]'::jsonb;
  v_propuestas      jsonb := '[]'::jsonb;
  v_cita_id         uuid;
  v_propuesta_id    uuid;
  v_motivo_bloqueo  public.tipo_disponibilidad;
  v_motivo_propuesta public.motivo_propuesta_cita;
  -- Búsqueda del desplazamiento propuesto (§7): hasta 7 días naturales
  -- siguientes, misma hora local, que no choque con otro festivo/ausencia ni
  -- con una cita ya reservada del profesional.
  v_d               smallint;
  v_fecha_prueba    date;
  v_instante_prueba timestamptz;
  v_fin_prueba      timestamptz;
  v_clasif_prueba   text;
  v_fecha_desplazada date;
  v_instante_desplazado timestamptz;
  v_fin_desplazado  timestamptz;
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
    raise exception 'No autorizado para crear esta serie.' using errcode = '42501';
  end if;

  if p_desde is null or p_desde < current_date then
    raise exception 'agenda_crear_serie: la fecha de inicio no puede ser pasada' using errcode = '22023';
  end if;

  v_zona := public.zona_horaria_centro(p_centro_id);
  if v_zona is null then
    -- No debería ocurrir nunca: zona_horaria_centro() cae hasta 'Europe/Madrid'.
    -- Riesgo 6 del diseño: nunca UTC silencioso.
    raise exception 'agenda_crear_serie: no se pudo resolver una zona horaria' using errcode = '22023';
  end if;

  insert into public.series_cita
    (paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
     dia_semana, hora_local, zona_horaria, duracion_minutos, sesiones_totales,
     fin_el, creada_por)
  values
    (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, p_periodicidad,
     p_dia_semana, p_hora_local, v_zona, p_duracion_minutos, p_sesiones_totales,
     p_fin_el, (select auth.uid()))
  returning id into v_serie_id;

  for v_fecha in
    select * from public.ocurrencias_serie(p_periodicidad, p_dia_semana, p_desde, p_sesiones_totales, p_fin_el)
  loop
    select r.instante, r.clasificacion into v_instante, v_clasificacion
      from public.resolver_hora_local(v_zona, v_fecha + p_hora_local) r;
    v_fin := v_instante + make_interval(mins => p_duracion_minutos);

    -- ¿Festivo o ausencia de disponibilidad? Se propone el desplazamiento y se
    -- deja decidir: nunca se salta en silencio ni se coloca encima.
    select d.tipo into v_motivo_bloqueo
      from public.disponibilidad d
     where d.perfil_id = p_profesional_id
       and d.tipo in ('festivo', 'ausencia')
       and (d.centro_id is null or d.centro_id = p_centro_id)
       and d.desde <= v_fecha
       and (d.hasta is null or d.hasta >= v_fecha)
       and (
         d.hora_inicio is null
         or tstzrange(v_instante, v_fin, '[)') && tstzrange(
              (v_fecha + d.hora_inicio) at time zone d.zona_horaria,
              (v_fecha + d.hora_fin)    at time zone d.zona_horaria,
              '[)'
            )
       )
     limit 1;

    if v_motivo_bloqueo is not null then
      v_motivo_propuesta := v_motivo_bloqueo::text::public.motivo_propuesta_cita;

      -- Desplazamiento propuesto: el primer día natural siguiente (hasta 7) a
      -- la misma hora local que no choque. Si ninguno vale, propuesta sin
      -- hora, la decide una persona.
      v_fecha_desplazada := null;
      v_instante_desplazado := null;
      v_fin_desplazado := null;
      for v_d in 1 .. 7 loop
        v_fecha_prueba := v_fecha + v_d;
        select r.instante, r.clasificacion into v_instante_prueba, v_clasif_prueba
          from public.resolver_hora_local(v_zona, v_fecha_prueba + p_hora_local) r;
        v_fin_prueba := v_instante_prueba + make_interval(mins => p_duracion_minutos);

        if not exists (
          select 1 from public.disponibilidad d2
           where d2.perfil_id = p_profesional_id
             and d2.tipo in ('festivo', 'ausencia')
             and (d2.centro_id is null or d2.centro_id = p_centro_id)
             and d2.desde <= v_fecha_prueba
             and (d2.hasta is null or d2.hasta >= v_fecha_prueba)
             and (
               d2.hora_inicio is null
               or tstzrange(v_instante_prueba, v_fin_prueba, '[)') && tstzrange(
                    (v_fecha_prueba + d2.hora_inicio) at time zone d2.zona_horaria,
                    (v_fecha_prueba + d2.hora_fin)    at time zone d2.zona_horaria,
                    '[)'
                  )
             )
        ) and not exists (
          select 1 from public.citas c
           where c.profesional_id = p_profesional_id
             and c.estado in ('programada', 'confirmada', 'realizada')
             and c.rango_bloqueante && tstzrange(v_instante_prueba, v_fin_prueba, '[)')
        ) then
          v_fecha_desplazada := v_fecha_prueba;
          v_instante_desplazado := v_instante_prueba;
          v_fin_desplazado := v_fin_prueba;
          exit;
        end if;
      end loop;

      insert into public.propuestas_cita
        (serie_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista,
         hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
      values
        (v_serie_id, p_paciente_id, p_profesional_id, p_centro_id, v_motivo_propuesta,
         coalesce(v_fecha_desplazada, v_fecha), p_hora_local,
         v_instante_desplazado, v_fin_desplazado, v_zona, (select auth.uid()))
      returning id into v_propuesta_id;

      v_propuestas := v_propuestas || jsonb_build_object(
        'propuesta_id', v_propuesta_id, 'fecha', v_fecha, 'motivo', v_motivo_propuesta
      );
      continue;
    end if;

    -- Inserta la cita; si choca con citas_sin_solape_profesional, propuesta
    -- con motivo 'ocupada'. Capturado SESIÓN A SESIÓN: una excepción no debe
    -- dejar media serie creada sin forma de saberlo.
    begin
      insert into public.citas
        (paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id,
         inicio, fin, zona_horaria, desviada, motivo_desviacion, creada_por)
      values
        (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, v_serie_id,
         v_instante, v_fin, v_zona,
         (v_clasificacion <> 'normal'),
         case when v_clasificacion <> 'normal' then 'anomalia_horaria'::public.motivo_desviacion_cita else null end,
         (select auth.uid()))
      returning id into v_cita_id;

      v_citas := v_citas || jsonb_build_object('cita_id', v_cita_id, 'fecha', v_fecha);
    exception when exclusion_violation then
      insert into public.propuestas_cita
        (serie_id, paciente_id, profesional_id, centro_id, motivo, fecha_prevista,
         hora_local_prevista, inicio_propuesto, fin_propuesto, zona_horaria, creada_por)
      values
        (v_serie_id, p_paciente_id, p_profesional_id, p_centro_id, 'ocupada',
         v_fecha, p_hora_local, v_instante, v_fin, v_zona, (select auth.uid()))
      returning id into v_propuesta_id;

      v_propuestas := v_propuestas || jsonb_build_object(
        'propuesta_id', v_propuesta_id, 'fecha', v_fecha, 'motivo', 'ocupada'
      );
    end;
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
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint, date
) is
  'Materializa una serie: inserta series_cita (la intención) y, por cada fecha '
  'de ocurrencias_serie(), resuelve la hora con resolver_hora_local() e '
  'inserta la cita (el hecho) o, si cae en festivo/ausencia o choca con otra '
  'cita del profesional, crea una propuestas_cita en su lugar. Una sesión '
  'convertida en propuesta consume su hueco: 8 sesiones con un festivo dentro '
  'son 7 citas y 1 propuesta. Todo en UNA transacción: PostgREST no da '
  'atomicidad entre llamadas, así que materializar desde TypeScript dejaría '
  'media serie creada sin forma de saberlo (§2 del diseño).';

-- ---------------------------------------------------------------------------
-- 7.2 · agenda_cancelar_cita()
-- ---------------------------------------------------------------------------

create function public.agenda_cancelar_cita(
  p_cita_id uuid,
  p_alcance public.alcance_cambio_serie,
  p_motivo  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol        public.rol_usuario := (select public.rol_actual());
  v_cita       public.citas;
  v_canceladas uuid[] := array[]::uuid[];
  v_saltadas   uuid[] := array[]::uuid[];
  v_fila       record;
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

  update public.citas set estado = 'cancelada' where id = p_cita_id;
  v_canceladas := v_canceladas || p_cita_id;

  if p_alcance = 'esta_y_siguientes' and v_cita.serie_id is not null then
    -- Las citas PASADAS ni se miran: el filtro c.fin > now() las excluye del
    -- todo. Las desviadas se saltan y se devuelven nombradas: cancelar la
    -- serie entera afecta solo a las futuras NO desviadas.
    for v_fila in
      select c.id, c.desviada
        from public.citas c
       where c.serie_id = v_cita.serie_id
         and c.inicio > v_cita.inicio
         and c.fin > now()
         and c.estado in ('programada', 'confirmada')
    loop
      if v_fila.desviada then
        v_saltadas := v_saltadas || v_fila.id;
      else
        update public.citas set estado = 'cancelada' where id = v_fila.id;
        v_canceladas := v_canceladas || v_fila.id;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'canceladas', to_jsonb(v_canceladas),
    'saltadas_desviadas', to_jsonb(v_saltadas),
    'motivo', p_motivo
  );
end;
$$;

comment on function public.agenda_cancelar_cita(uuid, public.alcance_cambio_serie, text) is
  'p_alcance es obligatorio por firma (sin default): "¿solo esta, o esta y las '
  'siguientes?". NUNCA "todas". esta_y_siguientes solo cancela futuras de la '
  'misma serie, salta las desviadas (devueltas en saltadas_desviadas) y nunca '
  'toca una cita pasada — el filtro c.fin > now() es la aplicación de la '
  'regla, y fn_proteger_cita_pasada() la hace cumplir aunque alguien la '
  'saltara.';

-- ---------------------------------------------------------------------------
-- 7.3 · agenda_editar_serie()
-- ---------------------------------------------------------------------------

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
  p_zona_horaria     text default null
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
  v_serie_id  uuid;
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

  if p_alcance = 'esta' then
    -- No hay un segundo camino de escritura de citas: se llama a la función
    -- de T-010, que ya comprueba autorización por dentro. Como NO se pone la
    -- marca de origen 'serie', si la cita pertenece a una serie queda
    -- desviada por fn_marcar_cita_desviada() — es exactamente «tocada a
    -- mano».
    perform public.agenda_actualizar_cita(p_cita_id, p_estado, p_sala, p_inicio, p_fin);
    return jsonb_build_object('alcance', 'esta', 'cita_id', p_cita_id);
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

  v_serie_id := v_cita.serie_id;

  -- Se limpia ANTES de tocar la regla: lo que quede después es exactamente el
  -- evento que produjo ESTA llamada, o nada si la regla no cambió de verdad.
  perform set_config('app.agenda_evento_regla', '', true);

  -- esta_y_siguientes NO mueve nada: actualiza la regla (dispara
  -- evento_regla_serie) y deja que agenda_propuestas_de_evento() proponga,
  -- cita a cita.
  update public.series_cita
     set dia_semana       = coalesce(p_dia_semana, dia_semana),
         hora_local       = coalesce(p_hora_local, hora_local),
         duracion_minutos = coalesce(p_duracion_minutos, duracion_minutos),
         zona_horaria     = coalesce(p_zona_horaria, zona_horaria)
   where id = v_serie_id;

  v_evento_id := nullif(current_setting('app.agenda_evento_regla', true), '')::uuid;

  if v_evento_id is null then
    -- La regla no cambió de verdad (todos los parámetros coincidían con los
    -- ya vigentes): no hay evento que resolver.
    return jsonb_build_object('alcance', 'esta_y_siguientes', 'serie_id', v_serie_id, 'propuestas', '[]'::jsonb);
  end if;

  v_resultado := public.agenda_propuestas_de_evento(v_evento_id);
  return jsonb_build_object('alcance', 'esta_y_siguientes', 'serie_id', v_serie_id) || v_resultado;
end;
$$;

comment on function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text
) is
  'esta: delega en agenda_actualizar_cita() (T-010) — no hay un segundo '
  'camino de escritura de citas. esta_y_siguientes: NO mueve ninguna cita '
  'directamente, actualiza la regla de series_cita (dispara evento_regla_serie) '
  'y llama a agenda_propuestas_de_evento() para proponer, cita a cita.';

-- ---------------------------------------------------------------------------
-- 7.4 · agenda_propuestas_de_evento()
-- ---------------------------------------------------------------------------

create function public.agenda_propuestas_de_evento(p_evento_id uuid)
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
  v_zona_nueva    text;
  v_local         timestamp;
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
    -- Idempotente: si ya hay una propuesta de este evento para esta cita, no duplica.
    if exists (select 1 from public.propuestas_cita p where p.evento_id = p_evento_id and p.cita_id = v_cita_id) then
      continue;
    end if;

    select * into v_cita from public.citas where id = v_cita_id;
    if not found then
      continue;
    end if;

    -- El llamante puede no estar autorizado sobre TODAS las citas de un
    -- evento amplio (p. ej. zona_centro_cambiada afecta a varios
    -- profesionales): se omite la que no le toca, no se aborta el lote.
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

    if v_evento.tipo = 'agenda.zona_centro_cambiada' then
      v_zona_nueva := v_evento.carga ->> 'zona_horaria_nueva';
      -- Misma hora de pared, resuelta en la zona nueva del centro.
      v_local := (v_cita.inicio at time zone v_cita.zona_horaria);
    else
      -- regla_serie_cambiada: hora local y zona nuevas de la serie, misma
      -- fecha de calendario que ya tenía la cita.
      v_zona_nueva := v_evento.carga ->> 'zona_horaria';
      v_local := ((v_cita.inicio at time zone v_cita.zona_horaria)::date) + (v_evento.carga ->> 'hora_local')::time;
    end if;

    select r.instante, r.clasificacion into v_instante, v_clasificacion
      from public.resolver_hora_local(v_zona_nueva, v_local) r;
    v_fin := v_instante + (v_cita.fin - v_cita.inicio);

    insert into public.propuestas_cita
      (evento_id, cita_id, paciente_id, profesional_id, centro_id, motivo,
       fecha_prevista, hora_local_prevista, inicio_propuesto, fin_propuesto,
       zona_horaria, creada_por)
    values
      (p_evento_id, v_cita_id, v_cita.paciente_id, v_cita.profesional_id, v_cita.centro_id, v_motivo,
       v_local::date, v_local::time, v_instante, v_fin, v_zona_nueva, (select auth.uid()))
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
  'Único sitio donde se crean propuestas a partir de un evento de outbox, '
  'para regla_serie_cambiada y zona_centro_cambiada. Idempotente por '
  '"where not exists" (evento_id + cita_id): llamarla dos veces sobre el '
  'mismo evento no duplica. Marca el evento entregado.';

-- ---------------------------------------------------------------------------
-- 7.5 · agenda_confirmar_propuesta()
-- ---------------------------------------------------------------------------

create function public.agenda_confirmar_propuesta(p_propuesta_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := (select public.rol_actual());
  v_propuesta public.propuestas_cita;
  v_cita_id   uuid;
  v_tipo_terapia_id uuid;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;

  select * into v_propuesta from public.propuestas_cita where id = p_propuesta_id;
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

  if v_propuesta.cita_id is not null then
    -- Mueve la cita existente CON la marca de origen puesta: no queda
    -- desviada (el 23P01, si lo hay, se propaga tal cual).
    perform set_config('app.agenda_origen', 'serie', true);
    update public.citas
       set inicio       = v_propuesta.inicio_propuesto,
           fin          = v_propuesta.fin_propuesto,
           zona_horaria = v_propuesta.zona_horaria
     where id = v_propuesta.cita_id;
    perform set_config('app.agenda_origen', '', true);
    v_cita_id := v_propuesta.cita_id;
  else
    -- Crea la cita desde la propuesta: SÍ queda desviada, con el motivo
    -- mapeado (el 23P01, si lo hay, se propaga tal cual).
    --
    -- HALLAZGO MEDIA DE LA REVISIÓN CON OPUS (11-09-2026): esta rama creaba la
    -- cita SIN tipo_terapia_id, porque propuestas_cita no lo lleva. La sesión
    -- desplazada por un festivo perdía su tipo de terapia y, con él,
    -- tarifa_base y régimen de IVA (tipos_terapia, T-010) — y una vez pasada,
    -- fn_proteger_cita_pasada() prohíbe cambiar tipo_terapia_id, así que la
    -- pérdida era definitiva. Se recupera de la serie, que es de donde nació
    -- la propuesta. Si la propuesta no cuelga de una serie queda null, como
    -- antes: no hay de dónde sacarlo y no se inventa.
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
  'Solo sobre pendiente. Con cita_id: mueve esa cita con la marca de origen '
  'puesta (app.agenda_origen=''serie''), así que NO queda desviada. Sin '
  'cita_id: crea la cita desde la propuesta, SÍ queda desviada, con el '
  'motivo mapeado (festivo/ausencia se conservan; ocupada/zona_cambiada/'
  'regla_cambiada mapean a reprogramada, que es lo que son). El choque '
  '23P01 se propaga tal cual: security definer no esquiva la restricción de '
  'exclusión, la atraviesa.';

-- ---------------------------------------------------------------------------
-- 7.6 · agenda_descartar_propuesta()
-- ---------------------------------------------------------------------------

create function public.agenda_descartar_propuesta(p_propuesta_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := (select public.rol_actual());
  v_propuesta public.propuestas_cita;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;

  select * into v_propuesta from public.propuestas_cita where id = p_propuesta_id;
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

  update public.propuestas_cita
     set estado = 'descartada', resuelta_en = now(), resuelta_por = (select auth.uid())
   where id = p_propuesta_id;
end;
$$;

comment on function public.agenda_descartar_propuesta(uuid) is
  'Solo sobre pendiente. Descarta sin crear ni mover ninguna cita: la sesión '
  'queda sin materializar, decisión humana explícita.';


-- =========================================================================
-- 8 · grant / revoke
-- =========================================================================

revoke execute on function public.resolver_hora_local(text, timestamp) from public;
grant  execute on function public.resolver_hora_local(text, timestamp) to authenticated;

revoke execute on function public.ocurrencias_serie(public.periodicidad_serie, smallint, date, smallint, date) from public;
grant  execute on function public.ocurrencias_serie(public.periodicidad_serie, smallint, date, smallint, date) to authenticated;

revoke execute on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint, date
) from public;
grant  execute on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date, smallint, date
) to authenticated;

revoke execute on function public.agenda_cancelar_cita(uuid, public.alcance_cambio_serie, text) from public;
grant  execute on function public.agenda_cancelar_cita(uuid, public.alcance_cambio_serie, text) to authenticated;

revoke execute on function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text
) from public;
grant  execute on function public.agenda_editar_serie(
  uuid, public.alcance_cambio_serie, public.estado_cita, text, timestamptz, timestamptz,
  smallint, time, smallint, text
) to authenticated;

revoke execute on function public.agenda_propuestas_de_evento(uuid) from public;
grant  execute on function public.agenda_propuestas_de_evento(uuid) to authenticated;

revoke execute on function public.agenda_confirmar_propuesta(uuid) from public;
grant  execute on function public.agenda_confirmar_propuesta(uuid) to authenticated;

revoke execute on function public.agenda_descartar_propuesta(uuid) from public;
grant  execute on function public.agenda_descartar_propuesta(uuid) to authenticated;

-- Las tablas: mismo patrón que T-010 §15. eventos_salientes se revoca a todo
-- el mundo y NO recibe ningún grant (§4 del diseño: "cero grant"); las
-- funciones security definer, dueñas de la tabla, no lo necesitan.
revoke all on table public.eventos_salientes from public, anon, authenticated, service_role;

revoke all on table public.propuestas_cita from public, anon, authenticated, service_role;
grant select on table public.propuestas_cita to authenticated;
