-- =========================================================================
-- T-013a · Registrar un acceso a la historia, desde la base
-- =========================================================================
--
-- El ADR-037 decide que las aperturas repetidas dentro de la ventana del desbloqueo son UN
-- acceso con contador de vistas, y el índice `accesos_historia_ventana_idx` ya lo tiene
-- escrito como un hecho de la base. Pero ese índice solo existe `where desbloqueo_id is
-- not null`, y hasta hoy NINGUNA función expuesta devolvía el id del desbloqueo vigente:
-- `desbloqueo_vigente()` da el reloj, `desbloquear_historia()` da el veredicto, y el
-- `select` sobre `desbloqueos_historia` está revocado a propósito desde
-- 20260822160000 —quien lee esa tabla está a un paso de fabricarse un desbloqueo sin
-- teclear el PIN—.
--
-- Registrar con `desbloqueo_id` nulo habría compilado, pasado la política y DESACTIVADO EN
-- SILENCIO el índice: cada apertura sería un acceso nuevo y el registro que el art. 18
-- obliga a enseñar quedaría ilegible. La salida es que el id no salga nunca de aquí.


-- Registra una APERTURA de contenido clínico y devuelve el contador de la ventana.
--
-- security definer porque necesita leer `desbloqueos_historia`, que `authenticated` no ve.
-- Eso significa que se salta la RLS —estas tablas no llevan `force row level security`—,
-- así que la función REHACE la autorización en vez de heredarla: sin los dos `raise` de
-- abajo esto sería un agujero con forma de ayuda.
create or replace function public.registrar_acceso_historia(
  p_paciente_id uuid,
  p_pestana     public.pestana_historia,
  p_agente      text default null,
  p_ip          inet default null
)
returns table (acceso_id bigint, vistas bigint, apertura boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_desbloqueo uuid;
  v_id         bigint;
  v_vistas     bigint;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Lo mismo que exige la política accesos_historia_alta, dicho otra vez porque aquí la
  -- política no corre. Se comprueba ANTES de mirar el desbloqueo: un desbloqueo propio y
  -- vigente abre MI historia, no cualquier historia.
  if not (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(p_paciente_id)
  ) then
    raise exception 'Sin acceso a la historia de ese paciente.' using errcode = '42501';
  end if;

  select d.id into v_desbloqueo
  from public.desbloqueos_historia d
  where d.perfil_id = v_uid
    and d.revocado_en is null
    and d.caduca_en > now()
  order by d.caduca_en desc
  limit 1;

  -- La política permite `desbloqueo_id is null` porque hay accesos que no salen del
  -- candado: exportación, informe y emergencia. Esta función es SOLO para 'apertura', y
  -- una apertura sin desbloqueo no existe. Si se dejara pasar, el candado sería decorativo
  -- por la puerta de atrás.
  if v_desbloqueo is null then
    raise exception 'La historia no está desbloqueada.' using errcode = '42501';
  end if;

  -- El `where` del `on conflict` NO es adorno: el índice es PARCIAL y sin repetir su
  -- predicado Postgres no lo infiere y la sentencia falla en ejecución.
  insert into public.accesos_historia
    (perfil_id, paciente_id, tipo, pestana, desbloqueo_id, ip, agente)
  values
    (v_uid, p_paciente_id, 'apertura'::public.tipo_acceso_historia, p_pestana,
     v_desbloqueo, p_ip, p_agente)
  on conflict (desbloqueo_id, paciente_id, pestana) where desbloqueo_id is not null
    do nothing
  returning id into v_id;

  if v_id is not null then
    return query select v_id, 1::bigint, true;
    return;
  end if;

  -- No insertó: ya había una apertura en esta ventana. `is not distinct from` y no `=`,
  -- porque `pestana` es nulable y el índice lleva `nulls not distinct`: con `=` no se
  -- encontraría justo la fila que el `on conflict` acaba de rechazar.
  select a.id into v_id
  from public.accesos_historia a
  where a.desbloqueo_id = v_desbloqueo
    and a.paciente_id = p_paciente_id
    and a.pestana is not distinct from p_pestana;

  -- Solo alcanzable si otra transacción insertó esa apertura y aún no ha confirmado:
  -- `on conflict do nothing` no espera a la otra, así que ni inserta ni la ve. Insertar
  -- una vista con `acceso_id` nulo violaría el not null con un mensaje que no explica
  -- nada; esto se reintenta y ya está.
  if v_id is null then
    raise exception 'Otro registro de acceso está en curso; reinténtalo.'
      using errcode = '40001';
  end if;

  insert into public.accesos_historia_vistas (acceso_id) values (v_id);

  select 1 + count(*) into v_vistas
  from public.accesos_historia_vistas v
  where v.acceso_id = v_id;

  return query select v_id, v_vistas, false;
end;
$$;

comment on function public.registrar_acceso_historia(uuid, public.pestana_historia, text, inet) is
  'ADR-037. Una apertura, N vistas, con el id del desbloqueo resuelto DENTRO: la aplicación '
  'nunca lo ve, porque `select` sobre desbloqueos_historia sigue revocado. Solo tipo '
  '«apertura»; exportación, informe y emergencia tienen otro camino y otras exigencias.';

revoke execute on function
  public.registrar_acceso_historia(uuid, public.pestana_historia, text, inet) from public;
grant execute on function
  public.registrar_acceso_historia(uuid, public.pestana_historia, text, inet) to authenticated;
