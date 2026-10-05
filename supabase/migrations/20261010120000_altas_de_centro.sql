-- T-041 · Altas de centro para quien atiende.
--
-- Diseño: tickets/T-041/diseno.md §1 P1 y §2 (D1-D7). ADR-051 (un alta se da y se cierra,
-- nunca se reescribe), ADR-072/073 (un alta deja figurar como coprofesional, no abre nada).
--
-- Por qué hace falta migración (D1), cuatro motivos y cualquiera bastaría:
-- (a) el criterio 3 pide que retirar dé error DESDE LA BASE a quien no es administrador; un
--     `update` bajo RLS de un no administrador afecta 0 filas en silencio;
-- (b) la política de update de `perfiles_centros` deja al administrador reabrir o reescribir
--     una fila cerrada por PostgREST, y eso borra el rastro de ADR-051;
-- (c) con una RPC, la aplicación y el banco ejecutan la MISMA llamada SQL;
-- (d) la lista cerrada de roles (la de la regla 7b) no cabe en un `with check` sin duplicar 7b.
--
-- Qué hay aquí, y nada más:
-- - `dar_alta_centro(perfil, centro)`: alta vigente desde hoy; idempotente; principal solo si
--   la persona no tiene principal vigente (el llamante no lo elige).
-- - `retirar_alta_centro(perfil, centro)`: cierra con `hasta = current_date`; no promociona
--   otro principal (D5).
-- - disparador `perfiles_centros_solo_cierre`: una pertenencia cerrada no se toca; de una
--   vigente solo cambian `hasta` y `principal`. Para todos los roles, también postgres.
--
-- No cambia: las tres políticas de `perfiles_centros`, sus permisos, el espejo,
-- `fn_crear_perfil_de_usuario`, `fn_exigir_episodio_coherente_en_nota` ni `centros_actuales()`.

-- =========================================================================================
-- dar_alta_centro
-- =========================================================================================

create function public.dar_alta_centro(p_perfil_id uuid, p_centro_id uuid)
returns uuid
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_rol       public.rol_usuario;
  v_estado    public.estado_perfil;
  v_activo    boolean;
  v_id        uuid;
  v_principal boolean;
begin
  -- 1. Quién llama. `is distinct from`, no `<>`: un perfil no activo con JWT vivo tiene
  --    rol_actual() nulo, y `null <> 'administrador'` no es verdadero.
  if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario then
    raise exception 'Solo el administrador da altas de centro.' using errcode = '42501';
  end if;

  -- 2. El perfil destino, bloqueado ANTES de mirar nada: dos altas simultáneas al mismo
  --    perfil se serializan y ninguna ve «sin principal» a la vez que la otra (D7).
  select f.rol, f.estado into v_rol, v_estado
    from public.perfiles f
   where f.id = p_perfil_id
     for update;
  if not found then
    raise exception 'El perfil no existe.' using errcode = '23503';
  end if;

  -- 3. Lista cerrada, la misma que 7b (D3): un rol nuevo no entra sin editarla.
  if v_rol not in ('profesional_sanitario'::public.rol_usuario, 'administrador'::public.rol_usuario) then
    raise exception 'Las altas de centro de quien atiende son para profesional sanitario o administrador.'
      using errcode = '22023';
  end if;

  -- 4. Solo perfiles activos.
  if v_estado <> 'activo'::public.estado_perfil then
    raise exception 'El perfil no está activo.' using errcode = '23514';
  end if;

  -- 5. El centro existe y está abierto. Un centro nulo no existe.
  select c.activo into v_activo
    from public.centros c
   where c.id = p_centro_id;
  if not found then
    raise exception 'El centro no existe.' using errcode = '23503';
  end if;
  if not v_activo then
    raise exception 'El centro está cerrado.' using errcode = '23514';
  end if;

  -- 6. Idempotente: si ya hay alta vigente para el par, se devuelve sin escribir (D6).
  select pc.id into v_id
    from public.perfiles_centros pc
   where pc.perfil_id = p_perfil_id
     and pc.centro_id = p_centro_id
     and pc.hasta is null;
  if found then
    return v_id;
  end if;

  -- 7. Principal solo si no tiene ninguno vigente (P2a). Nunca lo elige el llamante.
  v_principal := not exists (
    select 1
      from public.perfiles_centros pc
     where pc.perfil_id = p_perfil_id
       and pc.principal
       and pc.hasta is null);

  -- 8. El alta. La auditoría la pone `auditar_perfiles_centros`; `perfiles.centro_id`, el espejo.
  insert into public.perfiles_centros (perfil_id, centro_id, principal, desde)
  values (p_perfil_id, p_centro_id, v_principal, current_date)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.dar_alta_centro(uuid, uuid) is
  'T-041 · Da a un profesional sanitario o administrador activo un alta vigente desde hoy en un '
  'centro activo. Solo el administrador (42501). Idempotente: con alta vigente devuelve su id. '
  'Es principal solo si la persona no tiene principal vigente; el llamante no lo elige (D5).';

revoke execute on function public.dar_alta_centro(uuid, uuid) from public, anon;
grant execute on function public.dar_alta_centro(uuid, uuid) to authenticated;

-- =========================================================================================
-- retirar_alta_centro
-- =========================================================================================

create function public.retirar_alta_centro(p_perfil_id uuid, p_centro_id uuid)
returns void
language plpgsql
security definer
volatile
set search_path = ''
as $$
declare
  v_rol    public.rol_usuario;
  v_estado public.estado_perfil;
begin
  if (select public.rol_actual()) is distinct from 'administrador'::public.rol_usuario then
    raise exception 'Solo el administrador retira altas de centro.' using errcode = '42501';
  end if;

  select f.rol, f.estado into v_rol, v_estado
    from public.perfiles f
   where f.id = p_perfil_id
     for update;
  if not found then
    raise exception 'El perfil no existe.' using errcode = '23503';
  end if;

  -- El técnico queda fuera (P1 del propietario): cerrarle un centro le cambia los pacientes
  -- que lee, y eso necesita su propia fricción.
  if v_rol not in ('profesional_sanitario'::public.rol_usuario, 'administrador'::public.rol_usuario) then
    raise exception 'Esta pantalla no cambia los centros de un técnico administrativo.'
      using errcode = '22023';
  end if;

  -- Se cierra, no se borra. No se promociona otro principal (D5, P2b).
  update public.perfiles_centros pc
     set hasta = current_date
   where pc.perfil_id = p_perfil_id
     and pc.centro_id = p_centro_id
     and pc.hasta is null;
  if not found then
    raise exception 'No tenía alta vigente en ese centro.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.retirar_alta_centro(uuid, uuid) is
  'T-041 · Cierra (hasta = hoy) el alta vigente de un profesional sanitario o administrador en '
  'un centro. Solo el administrador (42501). Sin alta vigente, P0002 (no es idempotente: '
  'otra persona se adelantó). Retirar el principal no promociona otro (D5).';

revoke execute on function public.retirar_alta_centro(uuid, uuid) from public, anon;
grant execute on function public.retirar_alta_centro(uuid, uuid) to authenticated;

-- =========================================================================================
-- Disparador «solo cierre»
-- =========================================================================================

create function public.fn_perfiles_centros_solo_cierre()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.hasta is not null then
    raise exception 'Una pertenencia cerrada no se modifica: se da un alta nueva (ADR-051).'
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.perfil_id is distinct from old.perfil_id
     or new.centro_id is distinct from old.centro_id
     or new.desde is distinct from old.desde
     or new.creado_en is distinct from old.creado_en then
    raise exception 'De una pertenencia vigente solo cambian el cierre y la marca de principal.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.fn_perfiles_centros_solo_cierre() is
  'T-041 · Una pertenencia cerrada no se reabre ni se reescribe; de una vigente solo cambian '
  'hasta (las comprobaciones de la tabla validan el valor) y principal (ADR-051).';

revoke execute on function public.fn_perfiles_centros_solo_cierre() from public, anon, authenticated;

create trigger perfiles_centros_solo_cierre
  before update on public.perfiles_centros
  for each row execute function public.fn_perfiles_centros_solo_cierre();

comment on trigger perfiles_centros_solo_cierre on public.perfiles_centros is
  'T-041 · La política de update deja al administrador escribir cualquier columna por '
  'PostgREST; este disparador impide reabrir una fila cerrada o cambiarle el perfil, el '
  'centro o las fechas, que reescribiría el rastro de altas (ADR-051). Vale para todos los '
  'roles, también postgres.';
