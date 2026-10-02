-- T-035 · ADR-073 (puntos 1 y 2): el centro del episodio se congela con notas (SQL-H3) y el
-- director sanitario puede ser coprofesional (SQL-H4), siempre que esté activo.
--
-- Hacia delante y no destructiva: re-emite dos funciones de 20260929120000 (que no se edita)
-- con `create or replace` (conservan security definer, search_path = '' y sus disparadores) y
-- re-crea el disparador de congelación del episodio. Ninguna política cambia.

-- =========================================================================
-- 1 · La puerta del centro, en el mismo disparador de congelación del episodio.
-- =========================================================================
create or replace function public.fn_congelar_episodio_con_notas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notas_clinicas n where n.episodio_id = old.id) then
    raise exception
      'El episodio % tiene notas: su paciente, su profesional y su centro no cambian (ADR-071, ADR-073)', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists congelar_episodio_con_notas on public.episodios_asistenciales;
create trigger congelar_episodio_con_notas
  before update of paciente_id, profesional_id, centro_id on public.episodios_asistenciales
  for each row
  when (new.paciente_id is distinct from old.paciente_id
        or new.profesional_id is distinct from old.profesional_id
        or new.centro_id is distinct from old.centro_id)
  execute function public.fn_congelar_episodio_con_notas();

-- =========================================================================
-- 2 · La regla del coprofesional: el cuerpo de T-034 salvo 7b (lista cerrada de roles) y
--     7b' (activo). El disparador exigir_episodio_coherente_en_nota no se toca.
-- =========================================================================
create or replace function public.fn_exigir_episodio_coherente_en_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e            record;
  v_nuevo      boolean;
  v_rol        public.rol_usuario;
  v_estado     public.estado_perfil;
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
      select f.rol, f.estado into v_rol, v_estado from public.perfiles f where f.id = new.coprofesional_id;
      -- 7a · Sin perfil: habla la clave ajena (23503).
      if found then
        -- 7b · ADR-073.2: coprofesional es quien puede ser autor de notas. Lista CERRADA
        --      de roles admitidos, nunca «todo salvo el técnico»: un rol nuevo (el director
        --      administrativo del ADR-065) queda fuera hasta que su ticket lo decida aquí.
        --      Si ADR-065 se guarda como marca en el perfil y no como valor del enum, su
        --      ticket añade la condición en este paso.
        if v_rol not in ('profesional_sanitario'::public.rol_usuario,
                         'administrador'::public.rol_usuario) then
          raise exception 'El coprofesional tiene que ser un profesional sanitario o un administrador (director sanitario): quien puede ser autor de notas (ADR-072, ADR-073)'
            using errcode = '23514';
        end if;
        -- 7b' · ADR-073.2: quien puede ser autor está activo (un perfil de baja no escribe notas).
        if v_estado is distinct from 'activo'::public.estado_perfil then
          raise exception 'El coprofesional está de baja: no puede ser autor de notas (ADR-073)'
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

-- =========================================================================
-- 3 · Permisos
-- =========================================================================
revoke execute on function public.fn_exigir_episodio_coherente_en_nota() from public, anon, authenticated;
revoke execute on function public.fn_congelar_episodio_con_notas()        from public, anon, authenticated;

-- =========================================================================
-- 4 · Comentarios
-- =========================================================================
comment on column public.notas_clinicas.coprofesional_id is
  'Quién más estuvo en la sesión (coterapia, ADR-072). Opcional, uno por nota. No da acceso a '
  'nada: ninguna política lo lee. Quien puede ser autor de notas (profesional sanitario o '
  'administrador, director sanitario; ADR-073), activo, distinto del autor, con alta vigente en '
  'el centro del episodio (exigir_episodio_coherente_en_nota y el check '
  'notas_clinicas_coprofesional_no_es_autor). Se congela con la primera versión '
  '(fn_congelar_cabecera_sellada) y entra en el sobre de la era 4 (T-012c).';

comment on function public.fn_exigir_episodio_coherente_en_nota() is
  'T-034, T-035. Coherencia de la nota con su episodio, en la base: episodio de su autor (D2), '
  'del mismo paciente o de un participante (D4), no cerrado si la nota es nueva o se mueve '
  '(ADR-072 D6), y coprofesional que puede ser autor de notas: profesional sanitario o '
  'administrador, lista cerrada, y activo (ADR-073), con alta vigente en el centro del '
  'episodio (D5). Deja hablar al NOT NULL, a la clave ajena y al check de tabla. Lee el '
  'episodio y la fila del participante en for share, para que las dos puertas concurrentes '
  '(congelar_episodio_con_notas, congelar_participante_con_notas) no se crucen con la nota.';

comment on function public.fn_congelar_episodio_con_notas() is
  'T-034, T-035. Un episodio con notas no cambia de paciente, de profesional ni de centro (42501, ADR-071, ADR-073).';
