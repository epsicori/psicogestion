-- T-034 · Toda nota clínica cuelga de un episodio asistencial (ADR-071, ADR-072).
--
-- Antes: notas_clinicas.episodio_id era nulable. El sobre de la era 4 (T-012c) sella el
-- episodio y no debe sellar un null; la retención arranca al cerrar el episodio y una nota
-- sin episodio no tiene reloj.
--
-- Orden de bloques (obligatorio; ver tickets/T-034/diseno.md):
--   0 guarda · 1 columna obligatoria · 1b coprofesional · 2 coherencia nota-episodio ·
--   2b congelación de la cabecera · 3 las otras dos puertas · 4 episodio_para_nota() ·
--   5 permisos · 6 comentarios.

-- =========================================================================
-- 0 · Guarda: los datos los decide una persona, nunca un update silencioso.
-- =========================================================================
do $$
declare
  v_n bigint;
begin
  select count(*) into v_n from public.notas_clinicas where episodio_id is null;
  if v_n > 0 then
    raise exception
      'T-034: hay % notas clínicas sin episodio. Una persona decide a qué episodio va cada una (ADR-071); esta migración no las rellena.',
      v_n
      using errcode = '55000';
  end if;
end $$;

-- =========================================================================
-- 1 · La columna obligatoria.
-- =========================================================================
-- destructivo: episodio_id pasa a obligatorio (ADR-071); la guarda de arriba aborta si hay filas nulas, sin rellenar nada.
alter table public.notas_clinicas alter column episodio_id set not null;

-- =========================================================================
-- 1b · D5 · El coprofesional (ADR-072): quién más estuvo en la sesión. Opcional, uno.
--      No da acceso a nada: ninguna política lo lee.
-- =========================================================================
alter table public.notas_clinicas
  add column coprofesional_id uuid
    constraint notas_clinicas_coprofesional_id_fkey references public.perfiles (id),
  add constraint notas_clinicas_coprofesional_no_es_autor
    check (coprofesional_id is distinct from autor_id);

create index notas_clinicas_coprofesional_idx
  on public.notas_clinicas (coprofesional_id);

-- =========================================================================
-- 2 · D4/D2/D5/D6 · Coherencia de la nota con su episodio (disparador en la nota).
-- =========================================================================
create function public.fn_exigir_episodio_coherente_en_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e            record;
  v_nuevo      boolean;
  v_rol        public.rol_usuario;
begin
  -- 1 · Deja hablar al NOT NULL (23502).
  if new.episodio_id is null then
    return new;
  end if;

  -- 2 · Sin oráculo: una sesión que escribe como otro autor la rechaza la RLS después.
  --     Sin sesión (migración, siembra, postgres) se comprueba todo.
  if (select auth.uid()) is not null and new.autor_id is distinct from (select auth.uid()) then
    return new;
  end if;

  -- 3 · El episodio. Si no existe, habla la clave ajena (23503).
  --     `for share`: el `for key share` de la FK no choca con el `for no key update` de un
  --     update de paciente_id, profesional_id o cerrado_en. Con él, esa puerta concurrente
  --     espera a que la nota confirme y su `exists` la ve; si llegó antes, aquí se lee ya
  --     la fila nueva (READ COMMITTED vuelve a evaluarla).
  select ea.paciente_id, ea.profesional_id, ea.centro_id, ea.cerrado_en
    into e
    from public.episodios_asistenciales ea
   where ea.id = new.episodio_id
     for share;
  if not found then
    return new;
  end if;

  -- 4 · D2 en la base: la nota va en un episodio de su autor.
  if new.autor_id is distinct from e.profesional_id then
    raise exception
      'La nota va en un episodio de su autor: un episodio de otro profesional no se reutiliza (ADR-071, T-034)'
      using errcode = '23514';
  end if;

  -- 5 · Mismo paciente, o un participante del episodio (ADR-030; activo o dado de baja).
  --     La fila del participante, en `for share`: un update o delete concurrente de esa
  --     fila espera a la nota (y su puerta la ve), o, si llegó antes, aquí ya no se encuentra.
  if new.paciente_id is distinct from e.paciente_id then
    perform 1
       from public.episodio_participantes ep
      where ep.episodio_id = new.episodio_id and ep.paciente_id = new.paciente_id
        for share;
    if not found then
      raise exception
        'La nota y su episodio no son del mismo paciente ni de un participante (ADR-071, ADR-030)'
        using errcode = '23514';
    end if;
  end if;

  -- 6 · D6: una nota nueva (o movida) no cuelga de un episodio cerrado.
  v_nuevo := (TG_OP = 'INSERT');
  if not v_nuevo then
    v_nuevo := new.episodio_id is distinct from old.episodio_id;
  end if;
  if e.cerrado_en is not null and v_nuevo then
    raise exception 'Una nota nueva no cuelga de un episodio cerrado (ADR-072)'
      using errcode = '23514';
  end if;

  -- 7 · D5: el coprofesional, solo si es nuevo o cambia el episodio. El check de tabla
  --     habla cuando coincide con el autor.
  if new.coprofesional_id is not null
     and new.coprofesional_id is distinct from new.autor_id then
    v_nuevo := (TG_OP = 'INSERT');
    if not v_nuevo then
      v_nuevo := new.coprofesional_id is distinct from old.coprofesional_id
                 or new.episodio_id is distinct from old.episodio_id;
    end if;
    if v_nuevo then
      select f.rol into v_rol from public.perfiles f where f.id = new.coprofesional_id;
      -- 7a · Sin perfil: habla la clave ajena (23503).
      if found then
        -- 7b
        if v_rol is distinct from 'profesional_sanitario'::public.rol_usuario then
          raise exception 'El coprofesional tiene que ser un profesional sanitario (ADR-072)'
            using errcode = '23514';
        end if;
        -- 7c
        if e.centro_id is null or not exists (
             select 1 from public.perfiles_centros pc
              where pc.perfil_id = new.coprofesional_id
                and pc.centro_id = e.centro_id
                and pc.hasta is null
           ) then
          raise exception 'El coprofesional no tiene alta en el centro del episodio (ADR-072)'
            using errcode = '23514';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- El nombre empieza por «e»: dispara después de congelar_cabecera_sellada («c») y antes de
-- tocar_borrador («t»). Así reatribuir una nota firmada sigue dando 42501 y no un 23514.
create trigger exigir_episodio_coherente_en_nota
  before insert or update of paciente_id, episodio_id, autor_id, coprofesional_id
  on public.notas_clinicas
  for each row
  execute function public.fn_exigir_episodio_coherente_en_nota();

-- =========================================================================
-- 2b · La cabecera firmada congela también el coprofesional (ADR-072).
--      Re-emisión (lint regla 6: la de la agenda no se edita). Mismo nombre de disparador.
-- =========================================================================
create or replace function public.fn_congelar_cabecera_sellada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notas_clinicas_versiones v where v.nota_id = old.id) then
    raise exception
      'La cabecera de una nota ya firmada no se puede reatribuir (paciente, fecha de '
      'sesión, autor, episodio, cita o coprofesional): se congela con la primera versión (ADR-035/046/072)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists congelar_cabecera_sellada on public.notas_clinicas;

create trigger congelar_cabecera_sellada
  before update of paciente_id, fecha_sesion, autor_id, episodio_id, cita_id, coprofesional_id
  on public.notas_clinicas
  for each row
  when (
    new.paciente_id  is distinct from old.paciente_id
    or new.fecha_sesion is distinct from old.fecha_sesion
    or new.autor_id  is distinct from old.autor_id
    or new.episodio_id is distinct from old.episodio_id
    or new.cita_id   is distinct from old.cita_id
    or new.coprofesional_id is distinct from old.coprofesional_id
  )
  execute function public.fn_congelar_cabecera_sellada();

-- =========================================================================
-- 3 · D4 · Las otras dos puertas: el episodio y el participante con notas.
-- =========================================================================
create function public.fn_congelar_episodio_con_notas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notas_clinicas n where n.episodio_id = old.id) then
    raise exception
      'El episodio % tiene notas: su paciente y su profesional no cambian (ADR-071, T-034)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger congelar_episodio_con_notas
  before update of paciente_id, profesional_id on public.episodios_asistenciales
  for each row
  when (new.paciente_id is distinct from old.paciente_id
        or new.profesional_id is distinct from old.profesional_id)
  execute function public.fn_congelar_episodio_con_notas();

create function public.fn_congelar_participante_con_notas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE'
     and new.episodio_id = old.episodio_id and new.paciente_id = old.paciente_id then
    return new;
  end if;
  if exists (
    select 1 from public.notas_clinicas n
     where n.episodio_id = old.episodio_id and n.paciente_id = old.paciente_id
  ) then
    raise exception
      'El participante tiene notas en este episodio: no se mueve ni se borra (ADR-071, ADR-030)'
      using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger congelar_participante_con_notas
  before update of episodio_id, paciente_id or delete on public.episodio_participantes
  for each row
  execute function public.fn_congelar_participante_con_notas();

-- =========================================================================
-- 4 · D1 · La regla «abrir o elegir». SECURITY INVOKER a propósito: las políticas de
--     episodios (alta, lectura) muerden de verdad. Precedente: alta_paciente().
-- =========================================================================
create function public.episodio_para_nota(
  p_paciente_id uuid,
  p_episodio_id uuid default null,
  p_cita_id     uuid default null,
  p_centro_id   uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid;
  v_rol     public.rol_usuario;
  v_n       bigint;
  v_id      uuid;
  v_cerrado date;
  v_centro  uuid;
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

-- =========================================================================
-- 5 · Permisos
-- =========================================================================
revoke execute on function public.episodio_para_nota(uuid, uuid, uuid, uuid) from public, anon;
grant  execute on function public.episodio_para_nota(uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.fn_exigir_episodio_coherente_en_nota() from public, anon, authenticated;
revoke execute on function public.fn_congelar_episodio_con_notas()        from public, anon, authenticated;
revoke execute on function public.fn_congelar_participante_con_notas()    from public, anon, authenticated;
revoke execute on function public.fn_congelar_cabecera_sellada()          from public, anon, authenticated;

-- =========================================================================
-- 6 · Comentarios
-- =========================================================================
comment on column public.notas_clinicas.episodio_id is
  'Obligatorio desde T-034 (ADR-071): toda nota cuelga de un episodio del AUTOR, del mismo '
  'paciente o de un participante (ADR-030). Lo impone exigir_episodio_coherente_en_nota; la '
  'aplicación lo obtiene con episodio_para_nota(). Una nota nueva no cuelga de un episodio '
  'cerrado (ADR-072).';

comment on column public.notas_clinicas.coprofesional_id is
  'Quién más estuvo en la sesión (coterapia, ADR-072). Opcional, uno por nota. No da acceso a '
  'nada: ninguna política lo lee. Profesional sanitario distinto del autor, con alta vigente en '
  'el centro del episodio (exigir_episodio_coherente_en_nota y el check '
  'notas_clinicas_coprofesional_no_es_autor). Se congela con la primera versión '
  '(fn_congelar_cabecera_sellada) y entra en el sobre de la era 4 (T-012c).';

comment on function public.episodio_para_nota(uuid, uuid, uuid, uuid) is
  'T-034, ADR-071. Devuelve el episodio de la nota: con p_episodio_id lo valida (propio, del '
  'paciente o con él como participante, abierto); sin él, el único episodio abierto del '
  'llamante con el paciente; si no hay ninguno, abre uno individual (centro de la cita o '
  'p_centro_id validado con centros_actuales()); si hay varios, EP001 «elige episodio». '
  'Errores: 42501 (sin sesión, rol, candado, paciente, episodio o cita ajenos, centro ajeno), '
  '22023 (falta paciente o centro, episodio cerrado). SECURITY INVOKER a propósito: las '
  'políticas de episodios muerden. La apertura la audita auditar_episodios_asistenciales.';

comment on function public.fn_exigir_episodio_coherente_en_nota() is
  'T-034. Coherencia de la nota con su episodio, en la base: episodio de su autor (D2), del '
  'mismo paciente o de un participante (D4), no cerrado si la nota es nueva o se mueve '
  '(ADR-072 D6), y coprofesional profesional sanitario con alta vigente en el centro del '
  'episodio (D5). Deja hablar al NOT NULL, a la clave ajena y al check de tabla. Lee el '
  'episodio y la fila del participante en for share, para que las dos puertas concurrentes '
  '(congelar_episodio_con_notas, congelar_participante_con_notas) no se crucen con la nota.';

comment on function public.fn_congelar_episodio_con_notas() is
  'T-034. Un episodio con notas no cambia de paciente ni de profesional (42501).';

comment on function public.fn_congelar_participante_con_notas() is
  'T-034. Un participante con notas en el episodio no se mueve ni se borra (42501).';

comment on function public.fn_congelar_cabecera_sellada() is
  'Con la primera versión se congela la cabecera de la nota: paciente, fecha de sesión, autor, '
  'episodio, cita y coprofesional (ADR-035/046/072). 42501.';

comment on column public.notas_clinicas_versiones.paciente_id is
  'Denormalizado desde notas_clinicas.paciente_id (T-005), sin clave ajena a propósito: '
  'la referencial ya la da notas_clinicas y está congelada tras la primera firma '
  '(fn_congelar_cabecera_sellada). Una FK aquí añadiría un for key share por firma, justo '
  'al lado de los cerrojos de la fusión de pacientes (ADR-031). Ámbito de la cadena de '
  'huellas: el paciente, no la nota (longitud 1 no demuestra nada) ni el episodio '
  '(un paciente cruza varios episodios y la cadena es su historia entera).';
