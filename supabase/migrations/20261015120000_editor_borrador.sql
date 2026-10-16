-- T-046 · El editor del borrador de factura.
--
-- No añade tablas ni columnas. Añade los dos caminos por los que la aplicación escribe un borrador y el
-- disparador que decide qué citas pueden ir en sus líneas:
--   1 · anadir_version_borrador: una versión nueva (corrección o descarte) de un borrador existente
--   2 · crear_borrador: la cabecera y la versión 1 en una sola transacción (CA7)
--   3 · validar_citas_version_borrador: realizada, del profesional del borrador, sin bono y en un solo
--       borrador vivo (P-D1a, P-D1b, D4)
--   4 · permisos
--   5 · comentarios
--
-- Las dos RPC son `security invoker`: corren bajo la RLS de la tabla y los disparadores del sellado
-- (T-021), de las cotas y de la congelación (T-026a). No reimplementan ninguna comprobación; el sobre
-- canónico lo construye TypeScript (`lib/economico/sobre-borrador.ts`) y la base lo coteja y lo sella.
-- Diseño: tickets/T-046/diseno.md §1.1.


-- =========================================================================
-- 1 · anadir_version_borrador
-- =========================================================================
create function public.anadir_version_borrador(
  p_borrador_id          uuid,
  p_descartado           boolean,
  p_centro_id            uuid,
  p_destinatario_nombre  text,
  p_nif_cifrado          text,
  p_nif_nonce            text,
  p_nif_etiqueta         text,
  p_lineas               jsonb,
  p_base_centimos        bigint,
  p_cuota_centimos       bigint,
  p_total_centimos       bigint,
  p_creada_en            timestamptz,
  p_contenido_canonico   text
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_numero integer;
begin
  -- Los tres del NIF van a la vez. La restricción de tabla diría lo mismo; este mensaje tiene un
  -- fragmento propio para que la prueba sepa por dónde falla.
  if not ((p_nif_cifrado is null and p_nif_nonce is null and p_nif_etiqueta is null)
          or (p_nif_cifrado is not null and p_nif_nonce is not null and p_nif_etiqueta is not null)) then
    raise exception 'El NIF del destinatario va completo o no va (T-046)' using errcode = '22023';
  end if;

  insert into public.borradores_factura_versiones (
    borrador_id, algoritmo_version, contenido_canonico, centro_id, destinatario_nombre,
    destinatario_nif_cifrado, destinatario_nif_nonce, destinatario_nif_etiqueta,
    destinatario_nif_clave_version, lineas, base, cuota_iva, total, descartado, creada_por, creada_en)
  values (
    p_borrador_id, 1, p_contenido_canonico, p_centro_id, p_destinatario_nombre,
    decode(p_nif_cifrado, 'base64'), decode(p_nif_nonce, 'base64'), decode(p_nif_etiqueta, 'base64'),
    case when p_nif_cifrado is null then null else 1 end,
    p_lineas,
    p_base_centimos::numeric / 100, p_cuota_centimos::numeric / 100, p_total_centimos::numeric / 100,
    p_descartado, (select auth.uid()), p_creada_en)
  returning numero_version into v_numero;

  return v_numero;
end;
$$;


-- =========================================================================
-- 2 · crear_borrador
-- =========================================================================
-- Una RPC de PostgREST es una transacción: si la versión 1 falla, la cabecera tampoco queda.
create function public.crear_borrador(
  p_borrador_id          uuid,
  p_paciente_id          uuid,
  p_profesional_id       uuid,
  p_centro_id            uuid,
  p_destinatario_nombre  text,
  p_nif_cifrado          text,
  p_nif_nonce            text,
  p_nif_etiqueta         text,
  p_lineas               jsonb,
  p_base_centimos        bigint,
  p_cuota_centimos       bigint,
  p_total_centimos       bigint,
  p_creada_en            timestamptz,
  p_contenido_canonico   text
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
  values (p_borrador_id, p_paciente_id, p_profesional_id, (select auth.uid()));

  return public.anadir_version_borrador(
    p_borrador_id, false, p_centro_id, p_destinatario_nombre, p_nif_cifrado, p_nif_nonce, p_nif_etiqueta,
    p_lineas, p_base_centimos, p_cuota_centimos, p_total_centimos, p_creada_en, p_contenido_canonico);
end;
$$;


-- =========================================================================
-- 3 · Las citas de las líneas
-- =========================================================================
-- Corre DESPUÉS de los tres `sellar_*` por el orden alfabético del nombre: los permisos (42501), el
-- cotejo del sobre, la cita que no existe o es de otro paciente y la congelación salen antes que
-- cualquier lectura de `citas` (permisos antes que cotejo, ADR-071.5). Solo muerde a `authenticated` y
-- `anon`, como el paso 6.5 del sellado: la migración y el banco insertan como `postgres` (26.J34).
create function public.fn_validar_citas_version_borrador()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profesional_id uuid;
  v_previas        uuid[] := '{}';
  v_nuevas         uuid[];
  v_cita_id        uuid;
  v_cita           record;
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Descartar nunca se atasca, y una versión descartada no retiene ninguna cita.
  if new.descartado then
    return new;
  end if;

  select b.profesional_id into v_profesional_id
    from public.borradores_factura b where b.id = new.borrador_id;

  -- Las citas que ya llevaba la versión anterior, si no estaba descartada: no se vuelven a comprobar
  -- (una corrección no se atasca por una cita que pasó a un bono después).
  select coalesce(array_agg((l ->> 'cita_id')::uuid), '{}') into v_previas
    from public.borradores_factura_versiones v
         cross join lateral jsonb_array_elements(v.lineas) l
   where v.borrador_id = new.borrador_id
     and v.numero_version = new.numero_version - 1
     and not v.descartado
     and l ->> 'cita_id' is not null;

  select coalesce(array_agg((l ->> 'cita_id')::uuid), '{}') into v_nuevas
    from jsonb_array_elements(new.lineas) l
   where l ->> 'cita_id' is not null;

  if cardinality(v_nuevas) <> (select count(distinct c) from unnest(v_nuevas) c) then
    raise exception 'La misma cita aparece dos veces en el borrador (T-046)' using errcode = '23514';
  end if;

  -- En orden de uuid: dos guardados que se disputan las mismas citas toman los candados en el mismo
  -- orden y el segundo ve la versión del primero ya confirmada.
  for v_cita_id in
    select c from unnest(v_nuevas) c where not (c = any (v_previas)) order by c
  loop
    perform pg_advisory_xact_lock(hashtextextended('borrador_cita:' || v_cita_id::text, 0));

    select c.estado, c.profesional_id, c.bono_id into v_cita
      from public.citas c where c.id = v_cita_id;

    if v_cita.estado is distinct from 'realizada'::public.estado_cita then
      raise exception 'La cita de la línea no está realizada (T-046, P-D1a)' using errcode = '23514';
    end if;
    if v_cita.profesional_id is distinct from v_profesional_id then
      raise exception 'La cita de la línea no es del profesional del borrador (T-046, P-D1b)' using errcode = '23514';
    end if;
    if v_cita.bono_id is not null then
      raise exception 'La cita de la línea va en un bono (T-046, D4)' using errcode = '23514';
    end if;

    -- Otro borrador cuya última versión lleva la cita y no está descartada.
    if exists (
      select 1
        from public.borradores_factura_versiones v
       where v.borrador_id <> new.borrador_id
         and not v.descartado
         and v.numero_version = (select max(u.numero_version) from public.borradores_factura_versiones u
                                  where u.borrador_id = v.borrador_id)
         and exists (select 1 from jsonb_array_elements(v.lineas) l
                      where (l ->> 'cita_id')::uuid = v_cita_id)) then
      raise exception 'La cita ya está en otro borrador sin descartar (T-046)' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

create trigger validar_citas_version_borrador
  before insert on public.borradores_factura_versiones
  for each row execute function public.fn_validar_citas_version_borrador();


-- =========================================================================
-- 4 · Permisos
-- =========================================================================
revoke all on function public.fn_validar_citas_version_borrador() from public, anon, authenticated, service_role;

revoke all on function public.anadir_version_borrador(uuid, boolean, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.anadir_version_borrador(uuid, boolean, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)
  to authenticated;

revoke all on function public.crear_borrador(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function public.crear_borrador(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text)
  to authenticated;


-- =========================================================================
-- 5 · Comentarios
-- =========================================================================
comment on function public.anadir_version_borrador(uuid, boolean, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text) is
  'Añade una versión (corrección o descarte) a un borrador. Invoker: la RLS y los disparadores del sellado, las cotas, la congelación y las citas deciden. El NIF va en base64, los tres a la vez. Devuelve el numero_version que asignó la base.';
comment on function public.crear_borrador(uuid, uuid, uuid, uuid, text, text, text, text, jsonb, bigint, bigint, bigint, timestamptz, text) is
  'Crea la cabecera y la versión 1 en una sola transacción: si la versión falla, la cabecera no queda (T-046, CA7).';
comment on function public.fn_validar_citas_version_borrador() is
  'Disparador before insert de las versiones, después de los sellar_*: una cita nueva en las líneas está realizada, es del profesional del borrador, no va en un bono y no está en otro borrador vivo. Las arrastradas de la versión anterior no se recomprueban. Solo authenticated y anon.';
comment on trigger validar_citas_version_borrador on public.borradores_factura_versiones is
  'Su nombre empieza por v para correr después de sellar_version_borrador, sus cotas y la congelación: permisos antes que cotejo.';
