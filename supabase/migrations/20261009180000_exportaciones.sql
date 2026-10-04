-- T-040 (corte B) · La capa de exportación clínica en la base.
--
-- Diseño: tickets/T-040/diseno.md §1.1 y §1.2, con B0 (04-10-2026) por encima donde lo
-- contradice. Contrato de la respuesta: lib/exportaciones/formato.ts (corte A, integrado).
--
-- Qué hay aquí:
-- - dos tablas de SOLO ADICIÓN: `exportaciones` (una fila por copia pedida, escrita en el
--   mismo acto que la lectura) y `exportaciones_ficheros` (la huella del fichero que sí se
--   entregó). Ninguna tiene sitio para la contraseña, la clave, la sal, el nonce ni ningún
--   contenido (C5). Nadie de la API las lee ni escribe: solo las funciones de abajo.
-- - `exportar_nota`: autoriza, registra el acceso y la exportación, avisa al titular cuando
--   exporta la administración y devuelve la carga, todo en la misma transacción. Un error
--   en cualquier paso lo deshace todo: no hay contenido sin rastro.
-- - `registrar_fichero_exportado`: la huella del .html cifrado que salió.
-- - `notas_para_copia`: las notas de un paciente que la administración puede pedir con
--   motivo y no lee por RLS (P2-a). No escribe nada.
--
-- Reglas estructurales (B0.3.1, R1-R8), que el banco 27 §K comprueba por catálogo:
-- - `exportar_nota` devuelve jsonb escalar; nunca filas (R1).
-- - Todo fallo lanza; ninguna de las tres funciones captura excepciones (R2).
-- - Ningún raise lleva un parámetro ni un dato: cada mensaje es un literal propio (R3).
-- - El contenido se lee UNA vez (paso 8), y lo registrado sale de esa lectura (H27).

-- =========================================================================================
-- Tipos
-- =========================================================================================

create type public.motivo_exportacion as enum
  ('peticion_paciente', 'requerimiento_judicial_o_inspeccion', 'traspaso_caso');

create type public.proyeccion_exportacion as enum ('profesional', 'paciente');

-- =========================================================================================
-- Tabla `exportaciones` (solo adición)
-- =========================================================================================

create table public.exportaciones (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid not null references public.perfiles (id),
  paciente_id     uuid not null references public.pacientes (id),
  -- `notas_clinicas` no es de solo adición: la FK vale.
  nota_id         uuid not null references public.notas_clinicas (id),
  versiones       integer[] not null,
  proyeccion      public.proyeccion_exportacion not null,
  motivo          public.motivo_exportacion,
  referencia      text,
  formato_version smallint not null,
  algoritmo       text not null,
  parametros_kdf  jsonb not null,
  -- Sin FK: `accesos_historia` es de solo adición y no puede ser destino de una clave ajena
  -- (.claude/rules/supabase.md). La escribe `exportar_nota` en el mismo acto.
  acceso_id       bigint not null,
  creada_en       timestamptz not null default now(),
  constraint exportaciones_versiones_no_vacias check (cardinality(versiones) > 0),
  constraint exportaciones_motivo_con_referencia check ((motivo is null) = (referencia is null)),
  constraint exportaciones_referencia_longitud
    check (referencia is null or char_length(btrim(referencia)) between 3 and 200),
  constraint exportaciones_proyeccion_del_paciente
    check ((proyeccion = 'paciente') = coalesce(motivo = 'peticion_paciente', false)),
  constraint exportaciones_formato_version check (formato_version >= 1),
  constraint exportaciones_algoritmo check (algoritmo in ('argon2id-aes-256-gcm')),
  constraint exportaciones_parametros_kdf check (jsonb_typeof(parametros_kdf) = 'object'),
  constraint exportaciones_acceso_unico unique (acceso_id)
);

comment on table public.exportaciones is
  'Una fila por copia de una nota clínica pedida (T-040, ADR-049, ADR-076). Solo adición. '
  'Nunca la contraseña, la clave ni el contenido: solo quién, cuándo, qué versiones, con qué '
  'proyección y motivo, y con qué formato y algoritmo. La escribe exportar_nota().';

create index exportaciones_paciente_idx on public.exportaciones (paciente_id, creada_en desc);
create index exportaciones_perfil_idx on public.exportaciones (perfil_id, creada_en desc);

-- =========================================================================================
-- Tabla `exportaciones_ficheros` (solo adición)
-- =========================================================================================

create table public.exportaciones_ficheros (
  -- Sin FK: el padre es de solo adición. Lo comprueba registrar_fichero_exportado().
  exportacion_id uuid primary key,
  huella_fichero bytea not null,
  registrado_en  timestamptz not null default now(),
  constraint exportaciones_ficheros_huella_sha256 check (octet_length(huella_fichero) = 32)
);

comment on table public.exportaciones_ficheros is
  'La huella SHA-256 del fichero cifrado que sí se entregó, una por exportación (T-040). '
  'Solo adición. El fichero no se guarda en ningún sitio.';

-- =========================================================================================
-- Solo adición y auditoría, las dos tablas (T-004: tres capas o no hay invariante)
-- =========================================================================================

alter table public.exportaciones enable row level security;
alter table public.exportaciones_ficheros enable row level security;
-- Sin políticas, a propósito: nadie de `authenticated` lee ni escribe; solo las funciones
-- security definer de abajo (precedente: `eventos_salientes`, 11-cobertura.sql).

-- Capa 1: ni la API ni `postgres` actualizan o borran.
revoke all on table public.exportaciones from public, anon, authenticated, service_role;
revoke update, delete on table public.exportaciones from postgres;
revoke all on table public.exportaciones_ficheros from public, anon, authenticated, service_role;
revoke update, delete on table public.exportaciones_ficheros from postgres;

-- Capa 2: el disparador por fila, y además uno por sentencia para `update` y `delete`. El de
-- sentencia es un añadido de este ticket: un `update` o `delete` sobre la tabla VACÍA no
-- dispara el de fila y terminaría sin error; `10-solo-adicion.sql` recorre todas las tablas
-- del catálogo con el privilegio recuperado, y corre antes de que el banco 27 meta filas.
create trigger impedir_modificacion_exportaciones
  before update or delete on public.exportaciones
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_modificacion_sentencia_exportaciones
  before update or delete on public.exportaciones
  for each statement execute function public.fn_impedir_modificacion();
create trigger impedir_modificacion_exportaciones_ficheros
  before update or delete on public.exportaciones_ficheros
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_modificacion_sentencia_exportaciones_ficheros
  before update or delete on public.exportaciones_ficheros
  for each statement execute function public.fn_impedir_modificacion();

-- Capa 3: TRUNCATE no lo para ni la RLS ni un disparador de fila.
create trigger impedir_truncado_exportaciones
  before truncate on public.exportaciones
  for each statement execute function public.fn_impedir_modificacion();
create trigger impedir_truncado_exportaciones_ficheros
  before truncate on public.exportaciones_ficheros
  for each statement execute function public.fn_impedir_modificacion();

insert into public.tablas_solo_adicion (tabla, motivo) values
  ('exportaciones',
   'Quién pidió qué copia de una nota clínica, cuándo y por qué: el rastro de la salida de la historia (T-040, ADR-049).'),
  ('exportaciones_ficheros',
   'La huella del fichero que se entregó: lo entregado no se reescribe (T-040).');

-- Auditoría (D6). Sin columnas que recortar: no llevan contenido. La referencia del
-- administrador llega a `auditoria` a propósito (P-B1 = a): es la justificación de la copia.
create trigger auditar_exportaciones
  after insert on public.exportaciones
  for each row execute function public.fn_auditar('id');
create trigger auditar_exportaciones_ficheros
  after insert on public.exportaciones_ficheros
  for each row execute function public.fn_auditar('exportacion_id');

-- =========================================================================================
-- `etiqueta_motivo_exportacion`: el texto del motivo, para la justificación y el aviso
-- =========================================================================================

create function public.etiqueta_motivo_exportacion(m public.motivo_exportacion)
returns text
language sql
immutable
set search_path = ''
as $$
  select case m
           when 'peticion_paciente' then 'Petición del paciente'
           when 'requerimiento_judicial_o_inspeccion' then 'Requerimiento judicial o inspección'
           when 'traspaso_caso' then 'Traspaso del caso'
         end;
$$;

comment on function public.etiqueta_motivo_exportacion(public.motivo_exportacion) is
  'El motivo de una copia pedida por la administración, en castellano (T-040). Interna: solo '
  'la llaman exportar_nota() para la justificación del acceso y el detalle del aviso.';

-- Interna (R8): ni la API la llama.
revoke execute on function public.etiqueta_motivo_exportacion(public.motivo_exportacion)
  from public, anon, authenticated;

-- =========================================================================================
-- `exportar_nota` (B0.3.1)
-- =========================================================================================

create function public.exportar_nota(
  p_paciente_id uuid,
  p_nota_id     uuid,
  p_motivo      public.motivo_exportacion default null,
  p_referencia  text default null,
  p_ip          inet default null,
  p_agente      text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_rol         text;
  v_existe      boolean;
  v_ok          boolean;
  v_autor       uuid;
  v_episodio    uuid;
  v_cita        uuid;
  v_fecha       date;
  v_proyeccion  public.proyeccion_exportacion;
  v_referencia  text;
  v_carga       jsonb;
  v_versiones   integer[];
  v_acceso      bigint;
  v_exportacion uuid;
begin
  -- Paso 0 · Sesión.
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Paso 1 · Solo lectura, antes de leer nada: una lectura sin escrituras sería contenido
  -- sin rastro (B0.3, lección 1; una GET de PostgREST corre así).
  if current_setting('transaction_read_only') = 'on' then
    raise exception 'La exportación exige una transacción de escritura.' using errcode = '25006';
  end if;

  -- Paso 2 · Rol. `rol_actual()` es NULL con el perfil no activo.
  v_rol := public.rol_actual()::text;
  if v_rol is null or v_rol not in ('administrador', 'profesional_sanitario') then
    raise exception 'No puede exportar notas clínicas.' using errcode = '42501';
  end if;

  -- Paso 3 · Parámetros, sin tocar ninguna tabla (CB3, CB4).
  if p_paciente_id is null or p_nota_id is null then
    raise exception 'Faltan el paciente o la nota.' using errcode = '22023';
  end if;
  if (p_motivo is null) <> (p_referencia is null) then
    raise exception 'El motivo y la referencia van juntos.' using errcode = '22023';
  end if;
  if p_referencia is not null and char_length(btrim(p_referencia)) not between 3 and 200 then
    raise exception 'La referencia tiene que medir entre 3 y 200 caracteres.' using errcode = '22023';
  end if;

  -- Paso 4 · El motivo es de la administración (D8), sin tocar ninguna tabla.
  if p_motivo is not null and v_rol <> 'administrador' then
    raise exception 'Solo la administración pide copias con motivo.' using errcode = '42501';
  end if;

  -- Paso 5 · La nota. El paciente se coteja en el `where`, como igualdad.
  select n.autor_id, n.episodio_id, n.cita_id, n.fecha_sesion
    into v_autor, v_episodio, v_cita, v_fecha
    from public.notas_clinicas n
   where n.id = p_nota_id
     and n.paciente_id = p_paciente_id;
  v_existe := found;

  -- Paso 6 · Autorización. El episodio conjunto no cuenta: quien lee una conjunta por el
  -- episodio no se lleva la nota (ADR-030).
  if p_motivo is null then
    v_ok := v_existe and coalesce(v_autor = v_uid or public.es_profesional_asignado(p_paciente_id), false);
    if not v_ok then
      if v_rol = 'administrador' then
        raise exception 'Falta el motivo de la copia.' using errcode = '42501';
      end if;
      raise exception 'Sin acceso a esa nota.' using errcode = '42501';
    end if;
    v_proyeccion := 'profesional';
  else
    if not v_existe then
      raise exception 'Sin acceso a esa nota.' using errcode = '42501';
    end if;
    v_proyeccion := case when p_motivo = 'peticion_paciente' then 'paciente' else 'profesional' end;
  end if;

  -- Paso 7 · El candado, después de la autorización (D13).
  if not coalesce(public.historia_desbloqueada(), false) then
    raise exception 'La historia no está desbloqueada.' using errcode = '42501';
  end if;

  -- Paso 8 · Una sola lectura del contenido (H27): todo lo que se entrega y todo lo que se
  -- registra sale de esta sentencia. Cada rama de la proyección con su propio
  -- jsonb_build_object: la del paciente no nombra lo que no entrega (ADR-027).
  v_referencia := btrim(p_referencia);
  select jsonb_build_object(
           'proyeccion', v_proyeccion,
           'motivo', p_motivo,
           'referencia', v_referencia,
           'generada_en', to_jsonb(now()),
           'zona', coalesce(c.zona_horaria,
                            (select o.zona_horaria from public.organizacion o limit 1),
                            'Europe/Madrid'),
           'cifrado', jsonb_build_object(
             'formato_version', 1,
             'algoritmo', 'argon2id-aes-256-gcm',
             'kdf', jsonb_build_object('m', 65536, 't', 3, 'p', 1, 'longitud', 32)),
           'paciente', jsonb_build_object('id', p.id, 'nombre', p.nombre, 'apellidos', p.apellidos),
           'nota', jsonb_build_object(
             'id', p_nota_id,
             'fecha_sesion', to_jsonb(v_fecha),
             'modalidad', e.modalidad_relacional),
           'exportada_por', jsonb_build_object('nombre_completo', yo.nombre_completo, 'rol', v_rol),
           'versiones', coalesce((
             select jsonb_agg(
                      case
                        when v_proyeccion = 'profesional' then jsonb_build_object(
                          'numero_version', v.numero_version,
                          'alcance', v.alcance,
                          'autor_nombre', a.nombre_completo,
                          'creada_en', to_jsonb(v.creada_en),
                          'huella', encode(v.huella, 'hex'),
                          'huella_anterior', encode(v.huella_anterior, 'hex'),
                          'sello', sb.sello,
                          'motivo_cambio', v.motivo_cambio,
                          'cuerpo', v.cuerpo,
                          'anotaciones_reservadas', v.anotaciones_reservadas,
                          'contenido_canonico', v.contenido_canonico)
                        when v.alcance = 'individual' then jsonb_build_object(
                          'numero_version', v.numero_version,
                          'alcance', v.alcance,
                          'autor_nombre', a.nombre_completo,
                          'creada_en', to_jsonb(v.creada_en),
                          'huella', encode(v.huella, 'hex'),
                          'huella_anterior', encode(v.huella_anterior, 'hex'),
                          'sello', sb.sello,
                          'motivo_cambio', v.motivo_cambio,
                          'cuerpo', v.cuerpo)
                        else jsonb_build_object(
                          'numero_version', v.numero_version,
                          'alcance', v.alcance,
                          'autor_nombre', a.nombre_completo,
                          'creada_en', to_jsonb(v.creada_en),
                          'huella', encode(v.huella, 'hex'),
                          'huella_anterior', encode(v.huella_anterior, 'hex'),
                          'sello', sb.sello,
                          'participantes', coalesce((
                            select jsonb_agg(
                                     jsonb_build_object('nombre', pp.nombre, 'apellidos', pp.apellidos, 'papel', ep.papel)
                                     order by pp.apellidos, pp.nombre, pp.id)
                              from public.episodio_participantes ep
                              join public.pacientes pp on pp.id = ep.paciente_id
                             where ep.episodio_id = v_episodio
                               and ep.alta_en <= v_fecha
                               and (ep.baja_en is null or ep.baja_en >= v_fecha)), '[]'::jsonb))
                      end
                      order by v.numero_version)
               from public.notas_clinicas_versiones v
               join public.perfiles a on a.id = v.autor_id
               cross join lateral (
                 select case when pg_input_is_valid(v.contenido_canonico, 'jsonb') then v.contenido_canonico::jsonb end as s
               ) so
               cross join lateral (
                 select case when so.s is null then null else jsonb_build_object(
                          'esquema_version', so.s -> 'esquema_version',
                          'cita_id', so.s -> 'cita_id',
                          'abierta_en', so.s -> 'abierta_en',
                          'firmada_en', so.s -> 'firmada_en',
                          'redactada_en_sesion', so.s -> 'redactada_en_sesion',
                          'margen_sesion_minutos', so.s -> 'margen_sesion_minutos',
                          'fecha_sesion', so.s -> 'fecha_sesion') end as sello
               ) sb
              where v.nota_id = p_nota_id), '[]'::jsonb)
         )
    into v_carga
    from public.pacientes p
    join public.episodios_asistenciales e on e.id = v_episodio
    join public.perfiles yo on yo.id = v_uid
    left join public.citas c on c.id = v_cita
   where p.id = p_paciente_id;

  if coalesce(jsonb_array_length(v_carga -> 'versiones'), 0) = 0 then
    raise exception 'La nota no tiene versiones firmadas.' using errcode = '22023';
  end if;

  -- Lo registrado es lo entregado: los números salen de la carga, no de otra lectura.
  select array_agg((x.v ->> 'numero_version')::integer order by x.i)
    into v_versiones
    from jsonb_array_elements(v_carga -> 'versiones') with ordinality as x(v, i);

  -- Paso 9 · El acceso. Sin desbloqueo_id: la exportación es un acceso propio, no una vista
  -- de la apertura (D7).
  insert into public.accesos_historia
    (perfil_id, paciente_id, tipo, pestana, desbloqueo_id, ip, agente, justificacion)
  values
    (v_uid, p_paciente_id, 'exportacion', 'notas_clinicas', null, p_ip, p_agente,
     case when p_motivo is null then null
          else public.etiqueta_motivo_exportacion(p_motivo) || ': ' || v_referencia end)
  returning id into v_acceso;

  -- Paso 10 · La exportación. Los literales son los de lib/exportaciones/constantes.ts.
  insert into public.exportaciones
    (perfil_id, paciente_id, nota_id, versiones, proyeccion, motivo, referencia,
     formato_version, algoritmo, parametros_kdf, acceso_id)
  values
    (v_uid, p_paciente_id, p_nota_id, v_versiones, v_proyeccion, p_motivo, v_referencia,
     1, 'argon2id-aes-256-gcm', '{"m":65536,"t":3,"p":1,"longitud":32}'::jsonb, v_acceso)
  returning id into v_exportacion;

  -- Paso 11 · El aviso, solo cuando pide la administración: al titular (y al del
  -- superviviente si está fusionado) y a la autora, sin quien pide y sin perfiles no activos.
  -- El detalle no lleva ni el paciente ni la referencia: se copia a `auditoria`.
  if p_motivo is not null then
    insert into public.notificaciones (perfil_id, tipo, titulo, detalle, origen_tabla, origen_id)
    select d.perfil_id,
           'exportacion_por_administracion',
           'Copia de una nota por la administración',
           format('%s ha pedido una copia de una nota de la sesión del %s. Motivo: %s.',
                  v_carga -> 'exportada_por' ->> 'nombre_completo',
                  to_char(v_fecha, 'DD/MM/YYYY'),
                  public.etiqueta_motivo_exportacion(p_motivo)),
           'exportaciones',
           v_exportacion
      from (
        select distinct r.perfil_id
          from (
            select pa.profesional_id from public.pacientes pa where pa.id = p_paciente_id
            union all
            select su.profesional_id
              from public.pacientes pa
              join public.pacientes su on su.id = pa.fusionado_en
             where pa.id = p_paciente_id
            union all
            select v_autor
          ) r (perfil_id)
          join public.perfiles f on f.id = r.perfil_id
         where f.estado = 'activo'
           and r.perfil_id <> v_uid
      ) d;
  end if;

  -- Paso 12 · Todo lo escrito está escrito; ahora sí, el contenido.
  return v_carga || jsonb_build_object('exportacion_id', v_exportacion);
end;
$$;

comment on function public.exportar_nota(uuid, uuid, public.motivo_exportacion, text, inet, text) is
  'La copia de una nota clínica con todas sus versiones (T-040). Autoriza (autor o asignado; '
  'la administración, solo con motivo), registra el acceso y la exportación, avisa al titular '
  'cuando pide la administración y devuelve la carga de lib/exportaciones/formato.ts, todo en '
  'una transacción. En solo lectura no lee nada (25006).';

revoke execute on function public.exportar_nota(uuid, uuid, public.motivo_exportacion, text, inet, text)
  from public, anon;
grant execute on function public.exportar_nota(uuid, uuid, public.motivo_exportacion, text, inet, text)
  to authenticated;

-- =========================================================================================
-- `registrar_fichero_exportado` (B0.3.2)
-- =========================================================================================

create function public.registrar_fichero_exportado(p_exportacion_id uuid, p_huella_hex text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if current_setting('transaction_read_only') = 'on' then
    raise exception 'El registro de la copia exige una transacción de escritura.' using errcode = '25006';
  end if;

  -- Un perfil de baja no registra.
  if public.rol_actual() is null then
    raise exception 'No puede exportar notas clínicas.' using errcode = '42501';
  end if;

  -- El `is null` va escrito: `NULL !~ …` es NULL y el `if` no entraría.
  if p_exportacion_id is null or p_huella_hex is null or p_huella_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'La huella del fichero no es válida.' using errcode = '22023';
  end if;

  if not exists (
    select 1
      from public.exportaciones e
     where e.id = p_exportacion_id
       and e.perfil_id = v_uid
       and e.creada_en > now() - interval '15 minutes'
  ) then
    raise exception 'Esa exportación no es tuya o ha caducado.' using errcode = '42501';
  end if;

  -- Sin comprobación previa: con dos llamadas a la vez, `on conflict do nothing` espera a la
  -- primera y la segunda recibe siempre el mensaje propio, no el de la clave primaria.
  insert into public.exportaciones_ficheros (exportacion_id, huella_fichero)
  values (p_exportacion_id, decode(p_huella_hex, 'hex'))
  on conflict (exportacion_id) do nothing;
  if not found then
    raise exception 'Esa copia ya tiene fichero registrado.' using errcode = '23505';
  end if;
end;
$$;

comment on function public.registrar_fichero_exportado(uuid, text) is
  'Registra la huella SHA-256 del fichero cifrado que se entregó (T-040). Solo quien pidió la '
  'copia, en los 15 minutos siguientes, y una sola vez.';

revoke execute on function public.registrar_fichero_exportado(uuid, text) from public, anon;
grant execute on function public.registrar_fichero_exportado(uuid, text) to authenticated;

-- =========================================================================================
-- `notas_para_copia` (B0.3.3, P2-a)
-- =========================================================================================

-- El predicado de lectura conjunta es el de la política `notas_clinicas_lectura`
-- (20260822160000, su única definición), copiado tal cual.
create function public.notas_para_copia(p_paciente_id uuid)
returns table (nota_id uuid, fecha_sesion date, autor_nombre text, versiones integer)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.fecha_sesion, a.nombre_completo, c.total::integer
    from public.notas_clinicas n
    join public.perfiles a on a.id = n.autor_id
    cross join lateral (
      select count(*) as total
        from public.notas_clinicas_versiones nv
       where nv.nota_id = n.id
    ) c
   where n.paciente_id = p_paciente_id
     and c.total > 0
     and public.rol_actual() = 'administrador'
     and public.historia_desbloqueada()
     and not public.es_profesional_asignado(p_paciente_id)
     and n.autor_id <> (select auth.uid())
     and not (n.episodio_id is not null
              and public.es_profesional_del_episodio(n.episodio_id)
              and public.nota_tiene_version_conjunta(n.id))
   order by n.fecha_sesion desc, n.id;
$$;

comment on function public.notas_para_copia(uuid) is
  'Las notas de un paciente que la administración puede pedir con motivo y no lee por RLS '
  '(T-040, P2-a): con alguna versión firmada, sin ser su autora ni su profesional asignada. '
  'Para cualquier otro llamante, cero filas. No registra acceso: listar no es acceder.';

revoke execute on function public.notas_para_copia(uuid) from public, anon;
grant execute on function public.notas_para_copia(uuid) to authenticated;
