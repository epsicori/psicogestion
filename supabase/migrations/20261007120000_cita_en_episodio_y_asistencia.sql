-- T-039 · La cita apunta a su episodio y lleva si es presencial u online (ADR-075).
--
-- Hacia delante y sin destruir nada: un tipo y dos columnas en `citas` y en `series_cita`, privilegios
-- por columna, dos predicados internos, un relleno de lo que ya existe, los disparadores de
-- coherencia y herencia, las dos funciones de alta con dos parámetros más, dos funciones nuevas
-- (cambiar la asistencia, corregir el episodio) y la lectura de la agenda con la modalidad.
--
-- Lo que se cierra aquí:
--   · `modalidad_asistencia` es logística (presencial u online): la ve el técnico y la cambia
--     la función, no una escritura a mano.
--   · `episodio_id` es clínico: el técnico no lo ve ni lo elige, y nadie lo escribe a mano. Solo
--     lo escriben las funciones de este fichero y los disparadores.
--   · La modalidad relacional (individual, pareja…) y los participantes siguen bajo el candado:
--     ni la cita, ni la serie, ni la vista del técnico, ni la lectura de la agenda los enseñan.
--
-- Orden: tipo y columnas; privilegios; predicados; relleno (y su llamada); disparadores de
-- coherencia y herencia; congelados de episodio y participante; la cita pasada; la nota y la cita;
-- las altas; cambiar asistencia y episodio; la lectura.

-- =========================================================================
-- 1 · Tipo y columnas
-- =========================================================================

create type public.modalidad_asistencia as enum ('presencial', 'online');

alter table public.citas
  add column modalidad_asistencia public.modalidad_asistencia not null default 'presencial',
  add column episodio_id uuid references public.episodios_asistenciales (id);

alter table public.series_cita
  add column modalidad_asistencia public.modalidad_asistencia not null default 'presencial',
  add column episodio_id uuid references public.episodios_asistenciales (id);

create index citas_episodio_idx       on public.citas (episodio_id)       where episodio_id is not null;
create index series_cita_episodio_idx on public.series_cita (episodio_id) where episodio_id is not null;

comment on column public.citas.modalidad_asistencia is
  'Presencial u online: logística, no clínica (ADR-075). La ve el técnico administrativo (la agenda '
  'la pinta) y se cambia con agenda_cambiar_asistencia(); no se escribe a mano (privilegio por columna).';
comment on column public.citas.episodio_id is
  'El episodio asistencial al que pertenece la cita (ADR-075). Es clínico: el técnico administrativo '
  'no lo ve (no está en citas_agenda ni en agenda_citas_rango). Solo se escribe por las funciones de '
  'alta, por agenda_cambiar_episodio_cita(), por la nota que documenta la cita y por el relleno.';
comment on column public.series_cita.modalidad_asistencia is
  'Presencial u online de la serie: la heredan las citas que nacen de ella (ADR-075).';
comment on column public.series_cita.episodio_id is
  'El episodio de la serie, si lo hubo al crearla (ADR-075). Las citas que nacen de la serie lo '
  'heredan si encaja con su fecha. Clínico: el técnico no lo ve.';


-- =========================================================================
-- 2 · Quién escribe: privilegios por columna sobre `citas`
--
-- Una columna nueva de `citas` nace cerrada a `authenticated`: si debe escribirse a mano, se añade a
-- estos `grant`. Un `revoke` de tabla revoca también los privilegios por columna, así que primero el
-- `revoke` y después los `grant`. `serie_id` tampoco se escribe a mano (ADR-069, A-H2): las series y lo que
-- nace de ellas solo se crean por las funciones que las validan; sin el privilegio, un insert directo con
-- `serie_id` da 42501 antes de los disparadores y no hay respuesta que leer. `series_cita` no cambia: ya no tiene insert ni update para
-- `authenticated`. Las funciones definer (dueño `postgres`) siguen escribiendo todo.
-- =========================================================================

revoke insert, update on table public.citas from authenticated;

grant insert (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin,
              zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion,
              rango_bloqueante, marcada_realizada_en, marcada_realizada_por, creada_en, creada_por)
  on public.citas to authenticated;
grant update (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin,
              zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion,
              rango_bloqueante, marcada_realizada_en, marcada_realizada_por, creada_en, creada_por)
  on public.citas to authenticated;


-- =========================================================================
-- 3 · Predicados internos (sin grant)
-- =========================================================================

create function public.cita_episodio_coherente(
  p_episodio_id    uuid,
  p_paciente_id    uuid,
  p_profesional_id uuid,
  p_fecha          date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.episodios_asistenciales e
     where e.id = p_episodio_id
       and e.profesional_id = p_profesional_id
       and (e.cerrado_en is null or e.cerrado_en >= p_fecha)
       and (
         e.paciente_id = p_paciente_id
         or exists (
           select 1 from public.episodio_participantes ep
            where ep.episodio_id = e.id
              and ep.paciente_id = p_paciente_id
              and ep.alta_en <= p_fecha
              and (ep.baja_en is null or ep.baja_en >= p_fecha)
         )
       )
  );
$$;

comment on function public.cita_episodio_coherente(uuid, uuid, uuid, date) is
  'T-039, ADR-075. Verdadera si el episodio es del profesional, no estaba cerrado antes de la fecha y '
  'el paciente es su titular o participante cubierto por la fecha. No mira abierto_en: la primera cita '
  'de un paciente nuevo se da antes de que exista su episodio. Interna: la usan los disparadores, el '
  'relleno y la nota.';

revoke execute on function public.cita_episodio_coherente(uuid, uuid, uuid, date)
  from public, anon, authenticated;


create function public.cita_episodio_unico(
  p_profesional_id uuid,
  p_paciente_id    uuid,
  p_fecha          date
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select array_agg(x.id)
    into v_ids
    from (
      select e.id
        from public.episodios_asistenciales e
       where e.profesional_id = p_profesional_id
         and e.cerrado_en is null
         and (
           e.paciente_id = p_paciente_id
           or exists (
             select 1 from public.episodio_participantes ep
              where ep.episodio_id = e.id
                and ep.paciente_id = p_paciente_id
                and ep.baja_en is null
                and ep.alta_en <= p_fecha
           )
         )
         for share of e
    ) x;
  if cardinality(v_ids) = 1 then
    return v_ids[1];
  end if;
  return null;
end;
$$;

comment on function public.cita_episodio_unico(uuid, uuid, date) is
  'T-039, ADR-075. El único episodio abierto del profesional con el paciente (titular o participante '
  'activo desde la fecha), o nulo si hay cero o varios. Nunca lanza y nunca abre un episodio. Bloquea '
  'con for share los episodios que lee. Interna.';

revoke execute on function public.cita_episodio_unico(uuid, uuid, date)
  from public, anon, authenticated;


-- =========================================================================
-- 4 · Relleno de lo que ya existe (Q1-A) y su llamada
--
-- Va antes de crear los disparadores nuevos, para que no lo estorbe ninguno. Solo escribe
-- `episodio_id`, nunca otra columna, y no borra nada. Idempotente: solo mira filas con `episodio_id`
-- nulo. Las filas de auditoría de cada update salen con actor nulo, y es lo esperado.
-- =========================================================================

create function public.rellenar_episodio_de_citas()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r           record;
  v_ids       uuid[];
  v_epi       uuid;
  v_por_nota  integer := 0;
  v_por_cand  integer := 0;
  v_nulas     integer := 0;
  v_series    integer := 0;
begin
  for r in
    select c.id, c.paciente_id, c.profesional_id,
           (c.inicio at time zone c.zona_horaria)::date as fecha_local,
           exists (select 1 from public.notas_clinicas n where n.cita_id = c.id) as con_nota
      from public.citas c
     where c.episodio_id is null
     order by c.inicio, c.id
  loop
    if r.con_nota then
      -- Todas las notas de la cita, de cualquier autor: ante la duda, nulo.
      select array_agg(distinct n.episodio_id)
        into v_ids
        from public.notas_clinicas n
       where n.cita_id = r.id;
      if cardinality(v_ids) = 1
         and public.cita_episodio_coherente(v_ids[1], r.paciente_id, r.profesional_id, r.fecha_local) then
        update public.citas set episodio_id = v_ids[1] where id = r.id;
        v_por_nota := v_por_nota + 1;
      else
        v_nulas := v_nulas + 1;
      end if;
    else
      select array_agg(e.id)
        into v_ids
        from public.episodios_asistenciales e
       where e.profesional_id = r.profesional_id
         and public.cita_episodio_coherente(e.id, r.paciente_id, r.profesional_id, r.fecha_local);
      if cardinality(v_ids) = 1 then
        update public.citas set episodio_id = v_ids[1] where id = r.id;
        v_por_cand := v_por_cand + 1;
      else
        v_nulas := v_nulas + 1;
      end if;
    end if;
  end loop;

  for r in
    select s.id, s.paciente_id, s.profesional_id
      from public.series_cita s
     where s.episodio_id is null
     order by s.creada_en, s.id
  loop
    v_epi := public.cita_episodio_unico(r.profesional_id, r.paciente_id, current_date);
    if v_epi is not null then
      update public.series_cita set episodio_id = v_epi where id = r.id;
      v_series := v_series + 1;
    end if;
  end loop;

  raise notice 'relleno T-039: % por nota, % por candidato único, % nulas; % series',
    v_por_nota, v_por_cand, v_nulas, v_series;

  return jsonb_build_object(
    'por_nota', v_por_nota,
    'por_candidato', v_por_cand,
    'nulas', v_nulas,
    'series', v_series
  );
end;
$$;

comment on function public.rellenar_episodio_de_citas() is
  'T-039, ADR-075, Q1-A. Pone episodio_id a las citas que no lo tienen: el de sus notas si todas están '
  'en el mismo y encaja con la fecha; si no hay notas, el único episodio coherente del profesional '
  'con el paciente en la fecha de la cita (acepta cerrados en esa fecha o después). A las series, el '
  'único abierto de hoy. Solo escribe episodio_id. Idempotente. Devuelve los recuentos. Interna.';

revoke execute on function public.rellenar_episodio_de_citas() from public, anon, authenticated;

select public.rellenar_episodio_de_citas();


-- =========================================================================
-- 5 · Coherencia y herencia
-- =========================================================================

create function public.fn_velar_episodio_de_cita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha     date := (new.inicio at time zone new.zona_horaria)::date;
  v_s_mod     public.modalidad_asistencia;
  v_s_epi     uuid;
  v_s_pac     uuid;
  v_s_pro     uuid;
  v_hay_serie boolean;
  v_e_pro     uuid;
  v_e_pac     uuid;
  v_e_cerrado date;
begin
  -- 0 · Una cita con episodio no cambia de paciente ni de profesional. Constante: no mira participación
  --     ni fechas, así que no responde a quien prueba pacientes (A-H1). Va antes de la salida sin episodio
  --     (paso 2): vaciar episodio_id y cambiar paciente_id en una sentencia tampoco pasa. Vale para todos.
  if tg_op = 'UPDATE' and old.episodio_id is not null
     and (new.paciente_id is distinct from old.paciente_id
          or new.profesional_id is distinct from old.profesional_id) then
    raise exception 'Una cita con episodio no cambia de paciente ni de profesional (ADR-075).'
      using errcode = '23514';
  end if;

  -- 1 · Herencia de la serie (solo al insertar una cita de serie). La herencia del episodio no lanza:
  --     confirmar una propuesta o materializar una sesión nunca da error por el episodio. Lo que sí
  --     lanza, antes de mirar la participación, es una fila que no es del paciente y del profesional de
  --     la serie (A-H2): ninguna puerta legítima la fabrica, y así no depende de baja_en ni de cerrado_en.
  if tg_op = 'INSERT' and new.serie_id is not null then
    select s.modalidad_asistencia, s.episodio_id, s.paciente_id, s.profesional_id
      into v_s_mod, v_s_epi, v_s_pac, v_s_pro
      from public.series_cita s
     where s.id = new.serie_id
       for share;
    v_hay_serie := found;
    if v_hay_serie then
      if new.paciente_id is distinct from v_s_pac or new.profesional_id is distinct from v_s_pro then
        raise exception 'Una cita de una serie es del paciente y del profesional de la serie (ADR-069).'
          using errcode = '23514';
      end if;
      new.modalidad_asistencia := v_s_mod;
      if new.episodio_id is null and v_s_epi is not null
         and public.cita_episodio_coherente(v_s_epi, new.paciente_id, new.profesional_id, v_fecha) then
        new.episodio_id := v_s_epi;
      end if;
    end if;
  end if;

  -- 2 · Sin episodio, nada que comprobar.
  if new.episodio_id is null then
    return new;
  end if;

  -- 3 · Un UPDATE que no toca ni el episodio ni el paciente ni el profesional no vuelve a comprobar.
  --     Reprogramar (inicio) tampoco: no debe servir de oráculo de las fechas del episodio.
  if tg_op = 'UPDATE'
     and new.episodio_id   is not distinct from old.episodio_id
     and new.paciente_id   is not distinct from old.paciente_id
     and new.profesional_id is not distinct from old.profesional_id then
    return new;
  end if;

  -- 4 · El episodio, bloqueado. Si no existe, la clave ajena dará 23503.
  select e.profesional_id, e.paciente_id, e.cerrado_en
    into v_e_pro, v_e_pac, v_e_cerrado
    from public.episodios_asistenciales e
   where e.id = new.episodio_id
     for share;
  if not found then
    return new;
  end if;

  -- 5 · V1 · el mismo profesional.
  if v_e_pro is distinct from new.profesional_id then
    raise exception 'La cita y su episodio no son del mismo profesional (ADR-075).'
      using errcode = '23514';
  end if;

  -- V2 y V3 · titular, o participante cubierto por la fecha.
  if v_e_pac is distinct from new.paciente_id then
    perform 1
       from public.episodio_participantes ep
      where ep.episodio_id = new.episodio_id and ep.paciente_id = new.paciente_id
        for share of ep;
    if not found then
      raise exception 'El paciente de la cita no es titular ni participante del episodio (ADR-075).'
        using errcode = '23514';
    end if;
    perform 1
       from public.episodio_participantes ep
      where ep.episodio_id = new.episodio_id and ep.paciente_id = new.paciente_id
        and ep.alta_en <= v_fecha
        and (ep.baja_en is null or ep.baja_en >= v_fecha);
    if not found then
      raise exception 'El paciente de la cita no estaba de alta en el episodio el día de la cita (ADR-075).'
        using errcode = '23514';
    end if;
  end if;

  -- V4 · el episodio no estaba cerrado antes del día de la cita.
  if v_e_cerrado is not null and v_e_cerrado < v_fecha then
    raise exception 'El episodio de la cita se cerró antes del día de la cita (ADR-075).'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.fn_velar_episodio_de_cita() is
  'T-039, ADR-075. Antes de insertar o de cambiar episodio_id, paciente_id o profesional_id en una '
  'cita: (0) una cita con episodio no cambia de paciente ni de profesional (23514 constante); (1) una '
  'cita de serie es del paciente y del profesional de la serie (23514) y hereda su modalidad y, si '
  'encaja con su fecha, su episodio (la herencia no lanza); (2) un episodio puesto debe ser del mismo profesional, con el paciente como '
  'titular o participante cubierto por la fecha, y no estar cerrado antes del día de la cita (23514). '
  'No se ejecuta con inicio. Por el nombre va el último de los BEFORE de citas.';

revoke execute on function public.fn_velar_episodio_de_cita() from public;

create trigger velar_episodio_de_cita
  before insert or update of episodio_id, paciente_id, profesional_id on public.citas
  for each row execute function public.fn_velar_episodio_de_cita();


create function public.fn_velar_episodio_de_serie()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e_pro     uuid;
  v_e_pac     uuid;
  v_e_cerrado date;
begin
  if new.episodio_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.episodio_id   is not distinct from old.episodio_id
     and new.paciente_id   is not distinct from old.paciente_id
     and new.profesional_id is not distinct from old.profesional_id then
    return new;
  end if;

  select e.profesional_id, e.paciente_id, e.cerrado_en
    into v_e_pro, v_e_pac, v_e_cerrado
    from public.episodios_asistenciales e
   where e.id = new.episodio_id
     for share;
  if not found then
    return new;
  end if;

  if v_e_pro is distinct from new.profesional_id then
    raise exception 'La serie y su episodio no son del mismo profesional de la serie (ADR-075).'
      using errcode = '23514';
  end if;
  if v_e_pac is distinct from new.paciente_id
     and not exists (
       select 1 from public.episodio_participantes ep
        where ep.episodio_id = new.episodio_id and ep.paciente_id = new.paciente_id
          and ep.baja_en is null
     ) then
    raise exception 'El paciente de la serie no es titular ni participante activo del episodio (ADR-075).'
      using errcode = '23514';
  end if;
  if v_e_cerrado is not null then
    raise exception 'La serie apunta a un episodio cerrado (ADR-075).'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.fn_velar_episodio_de_serie() is
  'T-039, ADR-075. Una serie solo apunta a un episodio abierto del mismo profesional, del que el '
  'paciente es titular o participante activo (23514). Sin fecha: las citas de la serie lo vuelven a '
  'comprobar por la suya.';

revoke execute on function public.fn_velar_episodio_de_serie() from public;

create trigger velar_episodio_de_serie
  before insert or update of episodio_id, paciente_id, profesional_id on public.series_cita
  for each row execute function public.fn_velar_episodio_de_serie();


-- =========================================================================
-- 6 · Las otras puertas: un episodio o un participante con citas no se mueven
-- =========================================================================

create function public.fn_congelar_episodio_por_citas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.citas c where c.episodio_id = old.id)
     or exists (select 1 from public.series_cita s where s.episodio_id = old.id) then
    raise exception
      'El episodio % tiene citas: su paciente y su profesional no cambian (ADR-075, T-039)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.fn_congelar_episodio_por_citas() is
  'T-039, ADR-075. Un episodio al que apuntan citas o series no cambia de paciente ni de profesional '
  '(42501). Por el nombre va después del congelado por notas: con notas y citas sale el de las notas.';

revoke execute on function public.fn_congelar_episodio_por_citas() from public;

create trigger congelar_episodio_por_citas
  before update of paciente_id, profesional_id on public.episodios_asistenciales
  for each row
  when (new.paciente_id is distinct from old.paciente_id
        or new.profesional_id is distinct from old.profesional_id)
  execute function public.fn_congelar_episodio_por_citas();


create function public.fn_congelar_participante_por_citas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.episodio_id is not distinct from old.episodio_id
     and new.paciente_id is not distinct from old.paciente_id then
    return new;
  end if;
  if exists (
       select 1 from public.citas c
        where c.episodio_id = old.episodio_id and c.paciente_id = old.paciente_id)
     or exists (
       select 1 from public.series_cita s
        where s.episodio_id = old.episodio_id and s.paciente_id = old.paciente_id) then
    raise exception
      'El participante tiene citas en este episodio: no se mueve ni se borra (ADR-075)'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function public.fn_congelar_participante_por_citas() is
  'T-039, ADR-075. Un participante con citas o series en el episodio no se mueve ni se borra (42501). '
  'Un update que no cambia episodio ni paciente pasa.';

revoke execute on function public.fn_congelar_participante_por_citas() from public;

create trigger congelar_participante_por_citas
  before update of episodio_id, paciente_id or delete on public.episodio_participantes
  for each row execute function public.fn_congelar_participante_por_citas();


-- =========================================================================
-- 7 · La cita pasada es historia: cuerpo idéntico y dos comprobaciones nuevas
-- =========================================================================

create or replace function public.fn_proteger_cita_pasada()
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

  -- T-039 · De nulo a un episodio se admite (el relleno y la nota que documenta la cita); cambiarlo
  -- o quitarlo, no. La modalidad de una sesión que ya ocurrió tampoco se reescribe.
  if old.episodio_id is not null and new.episodio_id is distinct from old.episodio_id then
    raise exception
      'Una cita pasada no cambia de episodio una vez asignado (ADR-075): %', old.id
      using errcode = '42501';
  end if;
  if new.modalidad_asistencia is distinct from old.modalidad_asistencia then
    raise exception
      'Una cita pasada no cambia de presencial a online ni al revés (ADR-075): %', old.id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_proteger_cita_pasada() is
  'Con old.fin <= now(): DELETE falla siempre; UPDATE falla si cambia '
  'inicio/fin/zona_horaria/serie_id/paciente_id/profesional_id/centro_id/'
  'tipo_terapia_id/desviada/motivo_desviacion, si cambia o quita un episodio_id ya asignado o si '
  'cambia modalidad_asistencia (T-039; de nulo a un episodio pasa). Sigue permitido cambiar estado '
  '(marcar realizada una sesión de ayer), sala, nota_operativa y '
  'marcada_realizada_en/_por. Hace cumplir «las citas pasadas no se tocan '
  'jamás» con un disparador, no solo con la interfaz.';

revoke execute on function public.fn_proteger_cita_pasada() from public;


-- =========================================================================
-- 8 · La nota va en el episodio de su cita
-- =========================================================================

create function public.fn_exigir_nota_en_episodio_de_su_cita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if new.cita_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.cita_id     is not distinct from old.cita_id
     and new.episodio_id is not distinct from old.episodio_id
     and new.paciente_id is not distinct from old.paciente_id
     and new.autor_id    is not distinct from old.autor_id then
    return new;
  end if;
  -- Lo de otro lo rechaza la RLS; aquí no se da información.
  if (select auth.uid()) is not null and new.autor_id is distinct from (select auth.uid()) then
    return new;
  end if;

  select ci.id, ci.paciente_id, ci.profesional_id, ci.episodio_id,
         (ci.inicio at time zone ci.zona_horaria)::date as fecha_local
    into c
    from public.citas ci
   where ci.id = new.cita_id
     for no key update;
  if not found then
    return new;
  end if;

  -- Alcance: solo la nota del profesional de la cita sobre el paciente de la cita (el mismo
  -- predicado que la firma de la v1). La nota propia de un coterapeuta cuelga de su episodio.
  if c.paciente_id is distinct from new.paciente_id or c.profesional_id is distinct from new.autor_id then
    return new;
  end if;

  if c.episodio_id is not null and c.episodio_id <> new.episodio_id then
    raise exception 'La nota de una cita va en el episodio de la cita (ADR-075).'
      using errcode = '23514';
  end if;

  -- La cita sin episodio lo toma de la nota si encaja con su fecha; si no encaja, se queda nula y la
  -- nota entra igual (un dato logístico no impide documentar una sesión).
  if c.episodio_id is null and new.episodio_id is not null
     and public.cita_episodio_coherente(new.episodio_id, c.paciente_id, c.profesional_id, c.fecha_local) then
    update public.citas set episodio_id = new.episodio_id where id = c.id;
  end if;

  return new;
end;
$$;

comment on function public.fn_exigir_nota_en_episodio_de_su_cita() is
  'T-039, ADR-075. La nota del profesional de la cita sobre el paciente de la cita va en el episodio '
  'de la cita (23514). Si la cita no tenía episodio y el de la nota encaja con su fecha, la cita lo '
  'toma; si no encaja, queda nula y la nota entra. No toca la nota de un coterapeuta.';

revoke execute on function public.fn_exigir_nota_en_episodio_de_su_cita() from public;

create trigger exigir_nota_en_episodio_de_su_cita
  before insert or update of cita_id, episodio_id, paciente_id, autor_id on public.notas_clinicas
  for each row execute function public.fn_exigir_nota_en_episodio_de_su_cita();


create or replace function public.episodio_para_nota(
  p_paciente_id uuid,
  p_episodio_id uuid default null,
  p_cita_id     uuid default null,
  p_centro_id   uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_uid       uuid;
  v_rol       public.rol_usuario;
  v_n         bigint;
  v_id        uuid;
  v_cerrado   date;
  v_centro    uuid;
  v_epi_cita  uuid;
  v_cita_cerr date;
begin
  -- 1
  v_uid := (select auth.uid());
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- 2 · El rol va ANTES del candado.
  v_rol := (select public.rol_actual());
  if v_rol is null then
    raise exception 'Perfil no activo.' using errcode = '42501';
  end if;
  if v_rol = 'tecnico_administrativo'::public.rol_usuario then
    raise exception 'El técnico administrativo no abre ni elige episodios clínicos (ADR-071).'
      using errcode = '42501';
  end if;

  -- 3
  if p_paciente_id is null then
    raise exception 'Falta el paciente.' using errcode = '22023';
  end if;

  -- 4
  if not (select public.historia_desbloqueada()) then
    raise exception 'La historia está bloqueada: desbloquéala con el PIN.' using errcode = '42501';
  end if;

  -- 5
  if not public.es_profesional_asignado(p_paciente_id) then
    raise exception 'No atiendes a este paciente.' using errcode = '42501';
  end if;

  -- 5b · T-039 · La nota de una cita va en el episodio de la cita. Antes del 6 a propósito: si fuera
  --      después, un episodio explícito válido saldría por el 6 sin compararse con el de la cita.
  if p_cita_id is not null then
    select c.episodio_id into v_epi_cita
      from public.citas c
     where c.id = p_cita_id
       and c.paciente_id = p_paciente_id
       and c.profesional_id = v_uid;
    if v_epi_cita is not null then
      if p_episodio_id is not null and p_episodio_id <> v_epi_cita then
        raise exception 'El episodio elegido no vale para esta nota.' using errcode = '42501';
      end if;
      if p_episodio_id is null then
        select e.cerrado_en into v_cita_cerr
          from public.episodios_asistenciales e
         where e.id = v_epi_cita;
        if v_cita_cerr is not null then
          raise exception 'El episodio de la cita está cerrado.' using errcode = '22023';
        end if;
        return v_epi_cita;
      end if;
      -- p_episodio_id = v_epi_cita: sigue al 6, que lo valida como siempre.
    end if;
  end if;

  -- 6 · Elección explícita: solo un episodio propio, del paciente o con él como participante.
  --     Inexistente, invisible, de otro paciente y de otro profesional dan el mismo error.
  if p_episodio_id is not null then
    select e.id, e.cerrado_en into v_id, v_cerrado
      from public.episodios_asistenciales e
     where e.id = p_episodio_id
       and e.profesional_id = v_uid
       and (e.paciente_id = p_paciente_id
            or exists (select 1 from public.episodio_participantes ep
                        where ep.episodio_id = e.id and ep.paciente_id = p_paciente_id));
    if not found then
      raise exception 'El episodio elegido no vale para esta nota.' using errcode = '42501';
    end if;
    if v_cerrado is not null then
      raise exception 'El episodio elegido está cerrado.' using errcode = '22023';
    end if;
    return p_episodio_id;
  end if;

  -- 7 · Sin elección. Candado por (profesional, paciente) ANTES del recuento, y el recuento
  --     en una sentencia posterior (instantánea nueva en READ COMMITTED).
  perform pg_advisory_xact_lock(
    hashtextextended('episodio_para_nota:' || v_uid::text || ':' || p_paciente_id::text, 0));

  select count(*), (array_agg(e.id))[1] into v_n, v_id
    from public.episodios_asistenciales e
   where e.profesional_id = v_uid
     and e.cerrado_en is null
     and (e.paciente_id = p_paciente_id
          or exists (select 1 from public.episodio_participantes ep
                      where ep.episodio_id = e.id and ep.paciente_id = p_paciente_id
                        and ep.baja_en is null));
  if v_n = 1 then
    return v_id;
  end if;
  if v_n > 1 then
    raise exception 'Hay % episodios abiertos con este paciente: elige episodio (ADR-071).', v_n
      using errcode = 'EP001';
  end if;

  -- 8 · Abrir un episodio individual (única rama que usa cita y centro).
  if p_cita_id is not null then
    select c.centro_id into v_centro
      from public.citas c
     where c.id = p_cita_id
       and c.paciente_id = p_paciente_id
       and c.profesional_id = v_uid;
    if not found then
      raise exception 'La cita no es de este paciente con este profesional.' using errcode = '42501';
    end if;
  end if;
  if v_centro is null then
    v_centro := p_centro_id;
    if p_centro_id is not null
       and p_centro_id not in (select public.centros_actuales()) then
      raise exception 'El centro no es uno de los tuyos.' using errcode = '42501';
    end if;
  end if;
  if v_centro is null then
    raise exception 'Falta el centro del episodio.' using errcode = '22023';
  end if;

  -- Sin fila en episodio_participantes (un invoker no puede insertarla y el individual no la
  -- necesita). La auditoría la deja auditar_episodios_asistenciales.
  insert into public.episodios_asistenciales
    (paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en)
  values
    (p_paciente_id, v_uid, v_centro, 'individual',
     (now() at time zone public.zona_horaria_centro(v_centro))::date)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.episodio_para_nota(uuid, uuid, uuid, uuid) is
  'T-034, ADR-071; T-039, ADR-075. Devuelve el episodio de la nota: si la cita (suya y de ese paciente) '
  'ya tiene episodio, ese (un episodio explícito distinto da 42501; sin explícito y cerrado, 22023); '
  'con p_episodio_id lo valida (propio, del paciente o con él como participante, abierto); sin él, el '
  'único episodio abierto del llamante con el paciente; si no hay ninguno, abre uno individual (centro '
  'de la cita o p_centro_id validado con centros_actuales()); si hay varios, EP001 «elige episodio». '
  'Errores: 42501 (sin sesión, rol, candado, paciente, episodio o cita ajenos, centro ajeno), 22023 '
  '(falta paciente o centro, episodio cerrado). SECURITY INVOKER a propósito: las políticas de '
  'episodios muerden. La apertura la audita auditar_episodios_asistenciales.';

revoke execute on function public.episodio_para_nota(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.episodio_para_nota(uuid, uuid, uuid, uuid) to authenticated;


-- =========================================================================
-- 9 · Las altas, con la modalidad y el episodio (drop + create: nunca dos sobrecargas)
-- =========================================================================

drop function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date,
  smallint, date, date[], text, text, boolean
);

create function public.agenda_crear_serie(
  p_paciente_id          uuid,
  p_profesional_id       uuid,
  p_centro_id            uuid,
  p_tipo_terapia_id      uuid,
  p_periodicidad         public.periodicidad_serie,
  p_dia_semana           smallint,
  p_hora_local           time,
  p_duracion_minutos     smallint,
  p_desde                date,
  p_sesiones_totales     smallint default null,
  p_fin_el               date default null,
  p_excluir              date[] default null,
  p_sala                 text default null,
  p_nota_operativa       text default null,
  p_estricta_primera     boolean default false,
  p_modalidad_asistencia public.modalidad_asistencia default 'presencial',
  p_episodio_id          uuid default null
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
  v_episodio     uuid;
  v_e_cerrado    date;
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

  -- M0 · un nulo explícito no llega a la restricción not null.
  if p_modalidad_asistencia is null then
    raise exception 'La modalidad de asistencia no puede ser nula.' using errcode = '22023';
  end if;
  -- E1 · el técnico no elige episodio (ADR-071): el episodio es clínico.
  if p_episodio_id is not null and v_rol = 'tecnico_administrativo'::public.rol_usuario then
    raise exception 'El técnico administrativo no elige episodio para una cita (ADR-071).' using errcode = '42501';
  end if;
  -- E2 · un episodio elegido es del llamante, que es el profesional de la serie, y el paciente es
  --      titular o participante activo. Inexistente, ajeno, de otro paciente o del administrador:
  --      el mismo texto, para que no sirva de oráculo.
  if p_episodio_id is not null then
    select e.cerrado_en into v_e_cerrado
      from public.episodios_asistenciales e
     where e.id = p_episodio_id
       and e.profesional_id = (select auth.uid())
       and e.profesional_id = p_profesional_id
       and (e.paciente_id = p_paciente_id
            or exists (select 1 from public.episodio_participantes ep
                        where ep.episodio_id = e.id and ep.paciente_id = p_paciente_id
                          and ep.baja_en is null))
       for share of e;
    if not found then
      raise exception 'El episodio indicado no vale para esta cita.' using errcode = '42501';
    end if;
    -- E3 · solo al dueño se le dice que está cerrado.
    if v_e_cerrado is not null then
      raise exception 'El episodio indicado está cerrado.' using errcode = '22023';
    end if;
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

  -- Resolución del episodio: el elegido, o el único abierto del profesional con el paciente.
  v_episodio := coalesce(
    p_episodio_id,
    public.cita_episodio_unico(p_profesional_id, p_paciente_id, p_desde)
  );

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
     fin_el, creada_por, modalidad_asistencia, episodio_id)
  values
    (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, p_periodicidad,
     p_dia_semana, p_hora_local, v_zona, v_duracion, p_sesiones_totales,
     p_fin_el, (select auth.uid()), p_modalidad_asistencia, v_episodio)
  returning id into v_serie_id;

  -- Las citas heredan modalidad y episodio de la serie por el disparador velar_episodio_de_cita:
  -- una sola fuente, también para las propuestas confirmadas y las materializaciones.
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
  smallint, date, date[], text, text, boolean, public.modalidad_asistencia, uuid
) is
  'Materializa una serie: series_cita (la intención) y, por cada sesión del plan '
  '(plan_alta_serie), la cita (el hecho) o, si cae en festivo, ausencia u ocupada, una '
  'propuesta con la alternativa. Todo en UNA transacción. T-028a: p_excluir (las excluidas '
  'consumen su ordinal), sala, nota operativa (no del técnico, choque 4) y '
  'p_estricta_primera (la primera sesión no se vuelve propuesta: se rechaza y no queda nada). '
  'Con tipo, la duración es la del tipo (ADR-074). Rechaza un profesional que no sea '
  'sanitario o administrador activo. T-039 (ADR-075): p_modalidad_asistencia (presencial por '
  'defecto) y p_episodio_id (solo lo elige el profesional dueño, sin PIN; el técnico no); sin él, el '
  'único episodio abierto del profesional con el paciente, o ninguno. Las citas heredan los dos.';

revoke execute on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date,
  smallint, date, date[], text, text, boolean, public.modalidad_asistencia, uuid
) from public, anon;
grant execute on function public.agenda_crear_serie(
  uuid, uuid, uuid, uuid, public.periodicidad_serie, smallint, time, smallint, date,
  smallint, date, date[], text, text, boolean, public.modalidad_asistencia, uuid
) to authenticated;


drop function public.agenda_crear_cita(uuid, uuid, uuid, uuid, date, time, smallint, text, text);

create function public.agenda_crear_cita(
  p_paciente_id          uuid,
  p_profesional_id       uuid,
  p_centro_id            uuid,
  p_tipo_terapia_id      uuid,
  p_fecha                date,
  p_hora_local           time,
  p_duracion_minutos     smallint default null,
  p_sala                 text default null,
  p_nota_operativa       text default null,
  p_modalidad_asistencia public.modalidad_asistencia default 'presencial',
  p_episodio_id          uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario := (select public.rol_actual());
  v_zona      text;
  v_duracion  smallint;
  v_inicio    timestamptz;
  v_clasif    text;
  v_cita_id   uuid;
  v_episodio  uuid;
  v_e_cerrado date;
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

  -- M0 · un nulo explícito no llega a la restricción not null.
  if p_modalidad_asistencia is null then
    raise exception 'La modalidad de asistencia no puede ser nula.' using errcode = '22023';
  end if;
  -- E1 · el técnico no elige episodio (ADR-071): el episodio es clínico.
  if p_episodio_id is not null and v_rol = 'tecnico_administrativo'::public.rol_usuario then
    raise exception 'El técnico administrativo no elige episodio para una cita (ADR-071).' using errcode = '42501';
  end if;
  -- E2 · un episodio elegido es del llamante, que es el profesional de la cita, y el paciente es
  --      titular o participante activo. Inexistente, ajeno, de otro paciente o del administrador:
  --      el mismo texto, para que no sirva de oráculo.
  if p_episodio_id is not null then
    select e.cerrado_en into v_e_cerrado
      from public.episodios_asistenciales e
     where e.id = p_episodio_id
       and e.profesional_id = (select auth.uid())
       and e.profesional_id = p_profesional_id
       and (e.paciente_id = p_paciente_id
            or exists (select 1 from public.episodio_participantes ep
                        where ep.episodio_id = e.id and ep.paciente_id = p_paciente_id
                          and ep.baja_en is null))
       for share of e;
    if not found then
      raise exception 'El episodio indicado no vale para esta cita.' using errcode = '42501';
    end if;
    -- E3 · solo al dueño se le dice que está cerrado.
    if v_e_cerrado is not null then
      raise exception 'El episodio indicado está cerrado.' using errcode = '22023';
    end if;
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

  -- Resolución del episodio: el elegido, o el único abierto del profesional con el paciente.
  v_episodio := coalesce(
    p_episodio_id,
    public.cita_episodio_unico(p_profesional_id, p_paciente_id, p_fecha)
  );

  -- Sin bloque de excepción: un 23P01 (otra cita del profesional) se propaga tal cual.
  insert into public.citas
    (paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id,
     inicio, fin, zona_horaria, sala, nota_operativa, desviada, motivo_desviacion, creada_por,
     modalidad_asistencia, episodio_id)
  values
    (p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, null,
     v_inicio, v_inicio + make_interval(mins => v_duracion), v_zona, p_sala, p_nota_operativa,
     (v_clasif <> 'normal'),
     case when v_clasif <> 'normal' then 'anomalia_horaria'::public.motivo_desviacion_cita else null end,
     (select auth.uid()),
     p_modalidad_asistencia, v_episodio)
  returning id into v_cita_id;

  return v_cita_id;
end;
$$;

comment on function public.agenda_crear_cita(
  uuid, uuid, uuid, uuid, date, time, smallint, text, text, public.modalidad_asistencia, uuid
) is
  'La cita suelta, por el camino del técnico administrativo (ADR-074): el tipo es obligatorio '
  'y manda sobre la duración, y devuelve solo el id (ni el tipo ni el episodio). Rechaza el pasado, un '
  'día con festivo o ausencia y un profesional que no sea sanitario o administrador activo. No '
  'exige franja: la franja ordena la sugerencia, no prohíbe. Una cita encima de otra da 23P01. '
  'T-039 (ADR-075): p_modalidad_asistencia (presencial por defecto; la da también el técnico) y '
  'p_episodio_id (solo lo elige el profesional dueño, sin PIN; el técnico no); sin él, el único '
  'episodio abierto del profesional con el paciente, o ninguno. Nunca abre un episodio.';

revoke execute on function public.agenda_crear_cita(
  uuid, uuid, uuid, uuid, date, time, smallint, text, text, public.modalidad_asistencia, uuid
) from public, anon;
grant execute on function public.agenda_crear_cita(
  uuid, uuid, uuid, uuid, date, time, smallint, text, text, public.modalidad_asistencia, uuid
) to authenticated;


-- =========================================================================
-- 10 · Cambiar la asistencia y corregir el episodio de una cita
-- =========================================================================

create function public.agenda_cambiar_asistencia(
  p_cita_id              uuid,
  p_modalidad_asistencia public.modalidad_asistencia
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol    public.rol_usuario := (select public.rol_actual());
  v_uid    uuid := (select auth.uid());
  v_actual public.modalidad_asistencia;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;
  if p_modalidad_asistencia is null then
    raise exception 'La modalidad de asistencia no puede ser nula.' using errcode = '22023';
  end if;

  select c.modalidad_asistencia
    into v_actual
    from public.citas c
   where c.id = p_cita_id
     and (
       v_rol = 'administrador'::public.rol_usuario
       or (v_rol = 'profesional_sanitario'::public.rol_usuario and c.profesional_id = v_uid)
       or (v_rol = 'tecnico_administrativo'::public.rol_usuario
           and c.centro_id in (select public.centros_actuales()))
     )
     for no key update of c;
  if not found then
    raise exception 'No puedes cambiar la asistencia de esa cita, o no existe.' using errcode = '42501';
  end if;

  -- Sin cambio no se escribe ni se audita.
  if v_actual = p_modalidad_asistencia then
    return p_cita_id;
  end if;

  -- Una cita pasada la rechaza fn_proteger_cita_pasada (42501).
  update public.citas set modalidad_asistencia = p_modalidad_asistencia where id = p_cita_id;
  return p_cita_id;
end;
$$;

comment on function public.agenda_cambiar_asistencia(uuid, public.modalidad_asistencia) is
  'T-039, ADR-075. Cambia una cita entre presencial y online. La puede cambiar el administrador, el '
  'profesional de la cita y el técnico administrativo de su centro: es logística. Una cita pasada no '
  'cambia (42501). Si no hay cambio no escribe. Devuelve el id de la cita; no toca la serie.';

revoke execute on function public.agenda_cambiar_asistencia(uuid, public.modalidad_asistencia)
  from public, anon;
grant execute on function public.agenda_cambiar_asistencia(uuid, public.modalidad_asistencia)
  to authenticated;


create function public.agenda_cambiar_episodio_cita(
  p_cita_id     uuid,
  p_episodio_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario := (select public.rol_actual());
  v_uid uuid := (select auth.uid());
  v_cita uuid;
  v_epi  uuid;
begin
  if v_rol is null then
    raise exception 'No hay sesión activa con perfil.' using errcode = '42501';
  end if;
  if v_rol <> 'profesional_sanitario'::public.rol_usuario then
    raise exception 'Solo el profesional de la cita corrige su episodio (ADR-075).' using errcode = '42501';
  end if;
  if not (select public.historia_desbloqueada()) then
    raise exception 'La historia está bloqueada: desbloquéala con el PIN para cambiar el episodio de la cita.'
      using errcode = '42501';
  end if;
  if p_episodio_id is null then
    raise exception 'Falta el episodio.' using errcode = '22023';
  end if;

  -- for update (no for no key update): la clave ajena de la nota toma for key share, y solo este
  -- bloqueo choca con ella. Una nota que se inserta a la vez espera, o aquí se ve su fila.
  select c.id into v_cita
    from public.citas c
   where c.id = p_cita_id and c.profesional_id = v_uid
     for update of c;
  if not found then
    raise exception 'No hay una cita tuya con ese id a la que cambiar el episodio.' using errcode = '42501';
  end if;

  select e.id into v_epi
    from public.episodios_asistenciales e
   where e.id = p_episodio_id and e.profesional_id = v_uid
     for share of e;
  if not found then
    raise exception 'Solo puedes poner a la cita un episodio tuyo.' using errcode = '42501';
  end if;

  if exists (select 1 from public.notas_clinicas n where n.cita_id = p_cita_id) then
    raise exception 'La cita ya tiene nota: su episodio no cambia (ADR-075).' using errcode = '42501';
  end if;

  -- La coherencia (23514) la pone velar_episodio_de_cita; una cita pasada con episodio, la
  -- protección de la cita pasada (42501).
  update public.citas set episodio_id = p_episodio_id where id = p_cita_id;
  return p_cita_id;
end;
$$;

comment on function public.agenda_cambiar_episodio_cita(uuid, uuid) is
  'T-039, ADR-075. Corrige el episodio de una cita: solo su profesional, con la historia desbloqueada '
  '(PIN), a un episodio suyo, y solo si la cita no tiene ninguna nota. Un nulo no quita el episodio '
  '(22023). El episodio tiene que encajar con el paciente y con la fecha (23514). Devuelve el id.';

revoke execute on function public.agenda_cambiar_episodio_cita(uuid, uuid) from public, anon;
grant execute on function public.agenda_cambiar_episodio_cita(uuid, uuid) to authenticated;


-- =========================================================================
-- 11 · Lectura: la modalidad llega a la agenda; el episodio, no
-- =========================================================================

-- El with(...) se repite: `create or replace view` sustituye las opciones de la vista, y sin
-- security_barrier ni security_invoker = false la vista dejaría de ser la puerta del técnico.
create or replace view public.citas_agenda
with (security_invoker = false, security_barrier = true)
as
  select
    c.id,
    c.paciente_id,
    c.profesional_id,
    c.centro_id,
    c.serie_id,
    c.inicio,
    c.fin,
    c.zona_horaria,
    c.estado,
    c.sala,
    c.desviada,
    c.motivo_desviacion,
    c.modalidad_asistencia
  from public.citas c
  where (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
    and c.centro_id in (select public.centros_actuales());

comment on view public.citas_agenda is
  'Agenda del técnico administrativo: sus centros, SIN tipo_terapia_id, nota_operativa ni episodio_id '
  '(choque 4, ADR-075). Las columnas no están tachadas ni en gris: no están. Sí lleva '
  'modalidad_asistencia (presencial u online: logística). '
  'El técnico no tiene política de SELECT sobre citas, así que esta vista es su '
  'única puerta y el invariante 3 se cumple por construcción.';

grant select on public.citas_agenda to authenticated;


drop function public.agenda_citas_rango(timestamptz, timestamptz);

create function public.agenda_citas_rango(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id                   uuid,
  paciente_id          uuid,
  profesional_id       uuid,
  centro_id            uuid,
  serie_id             uuid,
  inicio               timestamptz,
  fin                  timestamptz,
  zona_horaria         text,
  estado               public.estado_cita,
  sala                 text,
  desviada             boolean,
  motivo_desviacion    public.motivo_desviacion_cita,
  tipo_terapia_nombre  text,
  nota_operativa       text,
  paciente_nombre      text,
  paciente_apellidos   text,
  profesional_nombre   text,
  centro_nombre        text,
  en_curso             boolean,
  reprogramable        boolean,
  nota_pendiente       boolean,
  modalidad_asistencia public.modalidad_asistencia
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null then
    raise exception 'agenda_citas_rango: el rango necesita sus dos extremos'
      using errcode = '22023';
  end if;
  if p_hasta <= p_desde then
    raise exception 'agenda_citas_rango: el rango está invertido o vacío'
      using errcode = '22023';
  end if;
  if p_hasta - p_desde > interval '62 days' then
    raise exception 'agenda_citas_rango: el rango no puede pasar de 62 días'
      using errcode = '22023';
  end if;

  -- Toda tabla lleva alias: las columnas de salida se llaman como las de citas y un
  -- nombre sin cualificar sería ambiguo en ejecución.
  return query
  with visibles as (
    -- Administrador y profesional, y SOLO ellos. El filtro de rol es explícito porque la
    -- política de citas deja leer la fila cuyo profesional_id = auth.uid() sin mirar el
    -- rol: un técnico que figure como profesional de una cita la recibiría aquí con tipo
    -- y nota, y otra vez por su vista (revisión SQL H1). Trae el tipo y la nota.
    select c.id, c.paciente_id, c.profesional_id, c.centro_id, c.serie_id,
           c.inicio, c.fin, c.zona_horaria, c.estado, c.sala, c.desviada,
           c.motivo_desviacion, c.tipo_terapia_id, c.nota_operativa,
           false as rama_tecnico, c.modalidad_asistencia
      from public.citas c
     where c.inicio < p_hasta and c.fin > p_desde
       and (select public.rol_actual()) in ('administrador'::public.rol_usuario,
                                           'profesional_sanitario'::public.rol_usuario)
    union all
    -- Técnico: su vista, cuyo where exige su rol, así que a los demás les da cero.
    -- El tipo y la nota son NULL LITERALES: no hay camino de vuelta a citas.
    select a.id, a.paciente_id, a.profesional_id, a.centro_id, a.serie_id,
           a.inicio, a.fin, a.zona_horaria, a.estado, a.sala, a.desviada,
           a.motivo_desviacion, null::uuid, null::text,
           true, a.modalidad_asistencia
      from public.citas_agenda a
     where a.inicio < p_hasta and a.fin > p_desde
  )
  select v.id, v.paciente_id, v.profesional_id, v.centro_id, v.serie_id,
         v.inicio, v.fin, v.zona_horaria, v.estado, v.sala, v.desviada,
         v.motivo_desviacion,
         tt.nombre::text,
         v.nota_operativa,
         pa.nombre::text,
         pa.apellidos::text,
         dp.nombre_completo::text,
         ce.nombre::text,
         public.cita_en_curso(v.inicio, v.fin, v.estado),
         (v.inicio > now() and v.estado in ('programada'::public.estado_cita, 'confirmada'::public.estado_cita)),
         case when v.rama_tecnico then null::boolean
              else exists (
                select 1 from public.alertas_documentacion al
                 where al.origen_tabla = 'citas'
                   and al.origen_id = v.id
                   and al.tipo = 'nota_sin_firmar'
                   and al.estado = 'abierta')
         end,
         v.modalidad_asistencia
    from visibles v
    left join public.tipos_terapia       tt on tt.id = v.tipo_terapia_id
    left join public.pacientes           pa on pa.id = v.paciente_id
    left join public.directorio_perfiles dp on dp.id = v.profesional_id
    left join public.centros             ce on ce.id = v.centro_id
   order by v.inicio, v.id;
end;
$$;

comment on function public.agenda_citas_rango(timestamptz, timestamptz) is
  'La agenda de un rango [desde, hasta) —como mucho 62 días; si no, 22023—, por '
  'SOLAPE: entra toda cita con inicio < hasta y fin > desde. Dos ramas en union all, '
  'DISJUNTAS POR ROL: citas (solo administrador y profesional, filtrado con rol_actual() '
  'porque la política deja ver al técnico la cita de la que figure como profesional) '
  'y citas_agenda (solo el técnico; su where exige el rol). Es security INVOKER a '
  'propósito: en definer el técnico leería la organización entera. En la rama del '
  'técnico el tipo de terapia y la nota operativa son NULL literales, y nota_pendiente '
  'también (choque 4, invariante 3). en_curso sale de cita_en_curso() (ADR-045). T-014. '
  'T-039: modalidad_asistencia (presencial u online) para los tres roles; el episodio, para ninguno.';

revoke all on function public.agenda_citas_rango(timestamptz, timestamptz) from public, anon, service_role;
grant execute on function public.agenda_citas_rango(timestamptz, timestamptz) to authenticated;
