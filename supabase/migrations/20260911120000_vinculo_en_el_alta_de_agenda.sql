-- =============================================================================
-- T-029 · El vínculo con el paciente, exigido también al crear agenda.
--
-- Sale del hallazgo 7 de la revisión con Opus de T-011a (11-09-2026): las políticas de
-- alta de `citas` y `series_cita` miran el rol, el profesional y el centro, y NUNCA si
-- el paciente es del profesional. Un `profesional_sanitario` podía crear una cita —o una
-- serie entera— sobre el paciente de otro. No filtraba nombres (la vista del técnico solo
-- expone identificadores y `pacientes` sigue cerrada por RLS), pero escribía agenda sobre
-- el paciente de otro, firmada con su nombre en la auditoría.
--
-- ADR-055 fija la respuesta de dominio: el TÉCNICO ADMINISTRATIVO sí puede citar a
-- cualquier paciente de su centro —es su trabajo y no ve la historia—; el PROFESIONAL
-- solo a los suyos, y citar NO crea el vínculo.
--
-- DOS CAPAS, y la segunda es la que cierra el agujero de verdad:
--
--   1. Las políticas `citas_alta` y `series_cita_alta` ganan la exigencia en su rama de
--      profesional. Es el contrato declarativo, el que se lee en `pg_policies`.
--   2. Un disparador `before insert` en las dos tablas. Las funciones de dominio
--      `agenda_*` son `security definer`: **RLS no las cubre**, y por ahí entró el
--      hallazgo. Cambiar solo la política dejaría la puerta de la función abierta, y cada
--      función nueva tendría que acordarse de repetir el predicado. El disparador no se
--      olvida.
--
-- El disparador solo muerde a quien la decisión acota: si `rol_actual()` no es
-- `profesional_sanitario` —administrador, técnico administrativo, o `postgres` en una
-- siembra, donde es nulo— no comprueba nada y deja pasar.
-- =============================================================================


-- =========================================================================
-- 1 · Las políticas de alta
-- =========================================================================

drop policy citas_alta on public.citas;

create policy citas_alta on public.citas
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or (
        profesional_id = (select auth.uid())
        and public.es_profesional_asignado(paciente_id)
      )
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );

drop policy series_cita_alta on public.series_cita;

create policy series_cita_alta on public.series_cita
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or (
        profesional_id = (select auth.uid())
        and public.es_profesional_asignado(paciente_id)
      )
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );


-- =========================================================================
-- 2 · El disparador, que es el que cubre las funciones `definer`
-- =========================================================================

create function public.fn_exigir_vinculo_agenda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol public.rol_usuario := (select public.rol_actual());
begin
  -- Solo el profesional sanitario está acotado (ADR-055). El administrador puede agendar
  -- para cualquiera; el técnico administrativo, en sus centros —lo comprueba la política,
  -- que aquí no se repite—; y `postgres` (siembra, banco, migraciones) tiene `rol_actual()`
  -- nulo y no pasa por aquí.
  if v_rol is distinct from 'profesional_sanitario'::public.rol_usuario then
    return new;
  end if;

  -- Y solo cuando agenda PARA SÍ MISMO: si la fila es de otro profesional, quien decide
  -- es la política (y la rechazará), no esta comprobación.
  if new.profesional_id is distinct from (select auth.uid()) then
    return new;
  end if;

  if not public.es_profesional_asignado(new.paciente_id) then
    raise exception
      'Ese paciente no es tuyo: citar no crea el vínculo (ADR-055). Paciente: %', new.paciente_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_exigir_vinculo_agenda() is
  'T-029 · Un profesional sanitario solo agenda para pacientes que tiene asignados. '
  'Existe además de la política porque las funciones de dominio agenda_* son '
  'security definer y RLS no las cubre: por ahí entró el hallazgo 7 de la revisión de '
  'T-011a. No muerde a administrador ni a técnico administrativo, ni a postgres '
  '(rol_actual() nulo en siembras y migraciones).';

revoke execute on function public.fn_exigir_vinculo_agenda() from public;

create trigger exigir_vinculo_agenda
  before insert on public.citas
  for each row execute function public.fn_exigir_vinculo_agenda();

create trigger exigir_vinculo_agenda
  before insert on public.series_cita
  for each row execute function public.fn_exigir_vinculo_agenda();


-- =========================================================================
-- 3 · Comentarios de las políticas reescritas
-- =========================================================================

comment on policy citas_alta on public.citas is
  'T-029: la rama del profesional exige es_profesional_asignado(paciente_id). El técnico '
  'administrativo sigue pudiendo citar a cualquier paciente de sus centros (ADR-055): es '
  'su trabajo y no ve la historia.';

comment on policy series_cita_alta on public.series_cita is
  'T-029: misma exigencia que citas_alta. Una serie son ocho citas de golpe; si la cita '
  'suelta pide vínculo, la serie con más razón.';
