-- T-014 · La lectura de la agenda por rango, y la regla de «en curso» escrita una sola vez.
--
-- Hacia delante y sin destruir nada: una función nueva (cita_en_curso), esta_en_curso()
-- reescrita con la misma firma para delegar en ella, y la lectura agenda_citas_rango().
--
-- Por qué hace falta la lectura por rango (H2 del diseño): el técnico administrativo no
-- tiene política de SELECT sobre `citas` (choque 4, invariante 3), así que
-- esta_en_curso(id) le devolvía SIEMPRE falso, y preguntar cita a cita es N+1.

-- =========================================================================
-- (a) La regla de «en curso» del ADR-045, en un solo sitio
-- =========================================================================

create function public.cita_en_curso(
  p_inicio timestamptz,
  p_fin    timestamptz,
  p_estado public.estado_cita
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select now() >= p_inicio
     and now() <  p_fin
     and p_estado not in ('cancelada'::public.estado_cita, 'no_asistida'::public.estado_cita);
$$;

comment on function public.cita_en_curso(timestamptz, timestamptz, public.estado_cita) is
  '«En curso» del ADR-045: now() dentro de [inicio, fin) —intervalo SEMIABIERTO: con '
  'now() = inicio sí, con now() = fin no— y el estado no es cancelada ni no_asistida. '
  'Es la ÚNICA copia de la regla en la base: esta_en_curso() y agenda_citas_rango() '
  'delegan aquí. No es un estado guardado y no debe persistirse (T-014).';

revoke all on function public.cita_en_curso(timestamptz, timestamptz, public.estado_cita) from public, anon;
grant execute on function public.cita_en_curso(timestamptz, timestamptz, public.estado_cita) to authenticated;


-- =========================================================================
-- (b) esta_en_curso(uuid): misma firma, mismo retorno, sigue invoker; ahora delega
-- =========================================================================

create or replace function public.esta_en_curso(p_cita_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select public.cita_en_curso(c.inicio, c.fin, c.estado)
       from public.citas c
      where c.id = p_cita_id),
    false
  );
$$;

comment on function public.esta_en_curso(uuid) is
  '«En curso» del ADR-045 para una cita por su id. Delega en cita_en_curso(), que es la '
  'única copia de la regla. NO es un estado guardado y no debe persistirse. '
  'Es security INVOKER a propósito: preguntar por una cita que no se puede ver '
  'devuelve falso, no la respuesta. Por eso al técnico, que no lee citas, le da '
  'siempre falso: la agenda se lee con agenda_citas_rango(), que trae en_curso '
  'calculado por las dos puertas (T-014).';


-- =========================================================================
-- (c) agenda_citas_rango(desde, hasta)
-- =========================================================================

create function public.agenda_citas_rango(p_desde timestamptz, p_hasta timestamptz)
returns table (
  id                  uuid,
  paciente_id         uuid,
  profesional_id      uuid,
  centro_id           uuid,
  serie_id            uuid,
  inicio              timestamptz,
  fin                 timestamptz,
  zona_horaria        text,
  estado              public.estado_cita,
  sala                text,
  desviada            boolean,
  motivo_desviacion   public.motivo_desviacion_cita,
  tipo_terapia_nombre text,
  nota_operativa      text,
  paciente_nombre     text,
  paciente_apellidos  text,
  profesional_nombre  text,
  centro_nombre       text,
  en_curso            boolean,
  reprogramable       boolean,
  nota_pendiente      boolean
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
           false as rama_tecnico
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
           true
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
         end
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
  'también (choque 4, invariante 3). en_curso sale de cita_en_curso() (ADR-045). T-014.';

revoke all on function public.agenda_citas_rango(timestamptz, timestamptz) from public, anon, service_role;
grant execute on function public.agenda_citas_rango(timestamptz, timestamptz) to authenticated;
