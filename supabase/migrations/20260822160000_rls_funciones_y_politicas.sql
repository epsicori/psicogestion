-- T-002 · RLS: funciones auxiliares, candado de la historia y políticas de los tres roles.
--
-- Reglas de escritura de este fichero (no son estilo, son corrección):
--
--   1. `(select auth.uid())` y las funciones SIN argumento van entre paréntesis
--      —`(select public.rol_actual())`— para que el planificador las evalúe como
--      InitPlan: una vez por sentencia y no una vez por fila.
--   2. Las funciones CON argumento de columna van SIN envoltorio
--      —`public.es_profesional_asignado(paciente_id)`—: dependen de la fila, así que
--      envolverlas no las cachea y solo añade un SubPlan.
--   3. Todo enum va casteado: `= 'administrador'::public.rol_usuario`.
--   4. Todas las políticas `to authenticated`. Ninguna a `public`, `anon` ni `service_role`.
--   5. Toda función auxiliar: `security definer`, `set search_path = ''`, nombres
--      cualificados, `revoke execute from public` y `grant execute to authenticated`.
--
-- Abreviaturas usadas en los comentarios (en el SQL van expandidas):
--   U = (select auth.uid())            ROL = (select public.rol_actual())
--   ADMIN / PRO / TECNICO = ROL = <enum>        ACTIVO = ROL is not null
--   CANDADO = (select public.historia_desbloqueada())
--   ASIG(x) = public.es_profesional_asignado(x)
--   EPI(x)  = public.es_profesional_del_episodio(x)
--
-- No se toca ninguna migración anterior: lo que T-000 dejó mal se corrige aquí con
-- `drop policy` y `create or replace function`.


-- =========================================================================
-- 1 · rol_actual() — se enmienda, no se reescribe
-- =========================================================================

-- Único cambio respecto a T-000: `and estado = 'activo'`.
-- ADR-032, «el acceso se corta entero». Es el único punto donde se puede hacer cumplir
-- para administrador y técnico administrativo (es_profesional_asignado() solo cubre al
-- profesional). A partir de aquí `rol_actual() is not null` significa «tengo perfil y
-- estoy activo», y todas las políticas heredan el corte sin escribir una línea más.
-- Efecto aceptado a sabiendas: un perfil suspendido o de baja deja de ver absolutamente
-- todo, incluida la pantalla de T-000.
create or replace function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select rol
  from public.perfiles
  where id = (select auth.uid())
    and estado = 'activo'::public.estado_perfil;
$$;

comment on function public.rol_actual() is
  'Rol del usuario autenticado, solo si su perfil está activo (ADR-032). Ninguna política sobre perfiles puede invocarla: recursión.';


-- =========================================================================
-- 2 · Funciones auxiliares de política
-- =========================================================================

-- Centro del perfil activo. Definer para no depender de la política de `perfiles`.
-- Nulo para administrador y profesional, y es correcto: solo la usa la política del
-- técnico, que por el check `perfiles_tecnico_exige_centro` siempre tiene centro.
create or replace function public.centro_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select centro_id
  from public.perfiles
  where id = (select auth.uid())
    and estado = 'activo'::public.estado_perfil;
$$;

comment on function public.centro_actual() is
  'Centro del perfil activo (ADR-033). Acota al técnico administrativo y a nadie más.';


-- ¿Atiende el usuario actual a ese paciente?
--
-- Definer es OBLIGATORIO: como invoker consultaría `public.pacientes` bajo RLS, y la
-- política de `pacientes` la invoca a ella — recursión infinita.
--
-- Resuelve el vínculo de fusión en UN SOLO SALTO (ADR-031). El salto AÑADE un camino,
-- no lo sustituye: el profesional del superviviente alcanza el registro absorbido, y el
-- profesional del absorbido no pierde lo que ya atendía («nada se repunta», ADR-031).
-- Un solo salto basta porque fn_normalizar_fusion_paciente() de T-001 garantiza que
-- `fusionado_en` nunca apunta a un registro ya fusionado.
--
-- Exige `estado = 'activo'` (ADR-032) y es ROL-AGNÓSTICA a propósito: si un
-- administrador figura como `profesional_id`, ese paciente es suyo. Gracias a eso
-- ninguna política clínica necesita invocar rol_actual().
create or replace function public.es_profesional_asignado(p_paciente_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pacientes p
    left join public.pacientes s on s.id = p.fusionado_en
    where p.id = p_paciente_id
      and (select auth.uid()) in (p.profesional_id, s.profesional_id)
  )
  and exists (
    select 1
    from public.perfiles f
    where f.id = (select auth.uid())
      and f.estado = 'activo'::public.estado_perfil
  );
$$;

comment on function public.es_profesional_asignado(uuid) is
  'Cierto si el usuario activo atiende al paciente, resolviendo la fusión en un salto (ADR-031, ADR-032).';


-- ¿Participa el usuario actual en ese episodio, por atender a alguno de sus miembros?
--
-- ADR-030, «por participación y no por copia». INCLUYE a los participantes dados de baja
-- del episodio: quien participó cuando se escribió la nota conjunta sigue siendo parte de
-- ese acto asistencial, y una baja posterior no puede volver ilegible una nota firmada.
-- Lo que sí exige es que el LECTOR siga activo (ADR-032).
create or replace function public.es_profesional_del_episodio(p_episodio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.episodio_participantes ep
    join public.pacientes p on p.id = ep.paciente_id
    where ep.episodio_id = p_episodio_id
      and p.profesional_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.perfiles f
    where f.id = (select auth.uid())
      and f.estado = 'activo'::public.estado_perfil
  );
$$;

comment on function public.es_profesional_del_episodio(uuid) is
  'Cierto si el usuario activo atiende a algún participante del episodio, incluidos los dados de baja del episodio (ADR-030).';


-- ¿Tiene la nota alguna versión sellada de alcance conjunto?
--
-- DESVIACIÓN REGISTRADA DEL DISEÑO, con motivo. El diseño escribía esta rama como un
-- `exists` directo sobre `notas_clinicas_versiones` dentro de la política de
-- `notas_clinicas`. Es imposible: la política de `notas_clinicas_versiones` consulta a su
-- vez `notas_clinicas`, y Postgres aborta con
--   ERROR: infinite recursion detected in policy for relation "notas_clinicas"
-- (reproducido antes de escribir esta migración). La salida es la que el propio diseño
-- prescribe para el mismo problema en es_profesional_asignado(): una función definer.
-- La semántica no cambia.
create or replace function public.nota_tiene_version_conjunta(p_nota_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.notas_clinicas_versiones v
    where v.nota_id = p_nota_id
      and v.alcance = 'conjunta'::public.alcance_nota
  );
$$;

comment on function public.nota_tiene_version_conjunta(uuid) is
  'Cierto si la nota tiene versión sellada de alcance conjunto. Definer para romper la recursión entre las políticas de notas_clinicas y notas_clinicas_versiones.';


-- ¿Tiene el usuario actual un desbloqueo de historia vigente? (ADR-026)
-- Definer porque más abajo se le retira a `authenticated` el select sobre la tabla.
-- NO invoca extensions.crypt: solo lee. La regla «extensions.crypt, no crypt» del
-- ADR-026 aplica a las funciones de PIN, y allí se cumple.
--
-- EXIGE ADEMÁS QUE EL PERFIL ESTÉ ACTIVO, y no es un adorno: es lo único que hace pasar
-- el criterio 8 del ticket («un profesional de baja obtiene cero filas de sus propias
-- notas»). Las políticas clínicas no invocan rol_actual() a propósito —así el
-- administrador no tiene rama propia—, y sus ramas `autor_id = U` no miran el estado de
-- nadie. Sin esta línea, un profesional dado de baja con la ventana abierta seguiría
-- leyendo sus notas. El candado es el ÚNICO punto por el que pasan las ocho tablas de
-- contenido clínico, así que aquí se corta una vez y vale para todas.
-- Coincide con el ADR-032, que en la baja «inutiliza el PIN».
create or replace function public.historia_desbloqueada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.desbloqueos_historia d
    join public.perfiles f on f.id = d.perfil_id
    where d.perfil_id = (select auth.uid())
      and d.revocado_en is null
      and d.caduca_en > now()
      and f.estado = 'activo'::public.estado_perfil
  );
$$;

comment on function public.historia_desbloqueada() is
  'Candado del ADR-026. Ninguna política sobre pines_historia ni desbloqueos_historia puede invocarla: esas tablas no llevan políticas.';


-- Cuándo caduca el desbloqueo vigente. Sustituye al `grant select` que se retira más
-- abajo: la interfaz necesita el reloj, no la tabla. Nulo si no hay ninguno vigente.
create or replace function public.desbloqueo_vigente()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(d.caduca_en)
  from public.desbloqueos_historia d
  where d.perfil_id = (select auth.uid())
    and d.revocado_en is null
    and d.caduca_en > now();
$$;

comment on function public.desbloqueo_vigente() is
  'Instante de caducidad del desbloqueo vigente del usuario, o nulo. Reemplaza al select sobre desbloqueos_historia.';


-- ¿Es ese desbloqueo mío y sigue vigente? La usa el `with check` de `accesos_historia`,
-- para que nadie ate su registro de acceso al desbloqueo de otro.
create or replace function public.desbloqueo_propio_vigente(p_desbloqueo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.desbloqueos_historia d
    where d.id = p_desbloqueo_id
      and d.perfil_id = (select auth.uid())
      and d.revocado_en is null
      and d.caduca_en > now()
  );
$$;

comment on function public.desbloqueo_propio_vigente(uuid) is
  'Cierto si el desbloqueo pertenece al usuario actual y sigue vigente.';


revoke execute on function public.centro_actual()                       from public;
revoke execute on function public.es_profesional_asignado(uuid)         from public;
revoke execute on function public.es_profesional_del_episodio(uuid)     from public;
revoke execute on function public.nota_tiene_version_conjunta(uuid)     from public;
revoke execute on function public.historia_desbloqueada()               from public;
revoke execute on function public.desbloqueo_vigente()                  from public;
revoke execute on function public.desbloqueo_propio_vigente(uuid)       from public;

grant execute on function public.centro_actual()                        to authenticated;
grant execute on function public.es_profesional_asignado(uuid)          to authenticated;
grant execute on function public.es_profesional_del_episodio(uuid)      to authenticated;
grant execute on function public.nota_tiene_version_conjunta(uuid)      to authenticated;
grant execute on function public.historia_desbloqueada()                to authenticated;
grant execute on function public.desbloqueo_vigente()                   to authenticated;
grant execute on function public.desbloqueo_propio_vigente(uuid)        to authenticated;


-- =========================================================================
-- 3 · Funciones del candado (ADR-026)
-- =========================================================================
--
-- Ninguna se invoca desde una política. Las llama la aplicación (T-006), y siempre desde
-- Server Actions, jamás desde el renderizado.

-- Fija o cambia el PIN propio. SIN parámetro de perfil ajeno: así es como se garantiza
-- que un administrador no pueda establecer el PIN de otro (ADR-026). El disparador
-- fn_pin_no_para_tecnico() de T-001 rechaza al técnico administrativo.
create or replace function public.fijar_pin_historia(p_pin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Error de forma: no hay estado que preservar, así que aquí sí se lanza excepción.
  if p_pin !~ '^[0-9]{6}$' then
    raise exception 'El PIN debe ser exactamente seis dígitos.' using errcode = '22023';
  end if;

  insert into public.pines_historia (perfil_id, hash)
  values (v_uid, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)))
  on conflict (perfil_id) do update
    set hash             = excluded.hash,
        intentos_fallidos = 0,
        bloqueado_hasta   = null,
        actualizado_en    = now();
end;
$$;

comment on function public.fijar_pin_historia(text) is
  'Fija el PIN de historia del usuario actual. Sin parámetro de perfil: nadie establece el PIN de otro (ADR-026).';


-- Verifica el PIN y abre la ventana de desbloqueo.
--
-- POR QUÉ DEVUELVE UNA FILA Y NO LANZA EXCEPCIÓN AL FALLAR — es la pieza crítica:
-- un `raise` aborta la transacción y DESHACE el incremento del contador y la entrada de
-- auditoría. El bloqueo por intentos, que es lo único que hace seguro un PIN de seis
-- dígitos (ADR-026), dejaría de existir. Solo se lanza excepción cuando no hay sesión,
-- donde no hay estado que preservar.
--
-- El PIN viaja SIEMPRE como parámetro ligado. En esta función no hay un solo `execute`,
-- y eso es parte del diseño, no una casualidad.
create or replace function public.desbloquear_historia(p_pin text)
returns table (
  desbloqueado    boolean,
  motivo          text,
  caduca_en       timestamptz,
  bloqueado_hasta timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_pin      public.pines_historia%rowtype;
  v_intentos smallint;
  v_bloqueo  timestamptz;
  v_minutos  smallint;
  v_caduca   timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- 1 · Serializa los intentos concurrentes: sin esto, cinco conexiones a la vez
  --     gastarían un solo intento entre todas.
  select * into v_pin
  from public.pines_historia
  where perfil_id = v_uid
  for update;

  if not found then
    return query select false, 'sin_pin'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 2 · Bloqueado: se responde SIN comprobar el PIN. Esto es exactamente lo que hace
  --     fallar el sexto intento aunque el PIN sea el correcto.
  if v_pin.bloqueado_hasta is not null and v_pin.bloqueado_hasta > now() then
    return query select false, 'bloqueado'::text, null::timestamptz, v_pin.bloqueado_hasta;
    return;
  end if;

  -- 3 · Comparación. p_pin es parámetro ligado; extensions.crypt porque search_path = ''.
  if extensions.crypt(p_pin, v_pin.hash) <> v_pin.hash then
    -- 4 · Fallo: incrementa, y al quinto bloquea quince minutos y deja constancia.
    v_intentos := v_pin.intentos_fallidos + 1;
    v_bloqueo  := case when v_intentos >= 5 then now() + interval '15 minutes' end;

    update public.pines_historia
       set intentos_fallidos = v_intentos,
           bloqueado_hasta   = v_bloqueo,
           actualizado_en    = now()
     where perfil_id = v_uid;

    if v_bloqueo is not null then
      -- auditoria.operacion admite solo INSERT/UPDATE/DELETE y registro_id es text
      -- NOT NULL. Nunca el hash ni el PIN en el jsonb.
      insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
      values (
        v_uid,
        'pines_historia',
        'UPDATE',
        v_uid::text,
        jsonb_build_object(
          'evento',            'pin_bloqueado_por_intentos',
          'intentos_fallidos', v_intentos,
          'bloqueado_hasta',   v_bloqueo
        )
      );
    end if;

    return query select false,
                        case when v_bloqueo is not null then 'bloqueado' else 'pin_incorrecto' end::text,
                        null::timestamptz,
                        v_bloqueo;
    return;
  end if;

  -- 5 · Acierto: resetea el contador, revoca los desbloqueos vigentes y abre uno nuevo.
  update public.pines_historia
     set intentos_fallidos = 0,
         bloqueado_hasta   = null,
         actualizado_en    = now()
   where perfil_id = v_uid;

  select coalesce(o.minutos_desbloqueo_historia, 15) into v_minutos
  from public.organizacion o
  limit 1;

  v_caduca := now() + make_interval(mins => coalesce(v_minutos, 15)::integer);

  -- Las columnas van cualificadas con alias: `caduca_en` y `bloqueado_hasta` son también
  -- parámetros de salida de esta función, y sin el alias Postgres no sabe cuál es cuál
  -- («column reference "caduca_en" is ambiguous»).
  update public.desbloqueos_historia d
     set revocado_en = now()
   where d.perfil_id = v_uid
     and d.revocado_en is null
     and d.caduca_en > now();

  insert into public.desbloqueos_historia (perfil_id, caduca_en)
  values (v_uid, v_caduca);

  return query select true, 'ok'::text, v_caduca, null::timestamptz;
end;
$$;

comment on function public.desbloquear_historia(text) is
  'Verifica el PIN y abre la ventana del ADR-026. Devuelve una fila y NO lanza excepción al fallar: un raise desharía el contador de intentos y la auditoría, y sin ellos el PIN de seis dígitos no es seguro.';


-- El botón «bloquear»: revoca los desbloqueos vigentes y devuelve cuántos ha cerrado.
create or replace function public.bloquear_historia()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  with revocados as (
    update public.desbloqueos_historia
       set revocado_en = now()
     where perfil_id = v_uid
       and revocado_en is null
       and caduca_en > now()
    returning 1
  )
  select count(*) into v_n from revocados;

  return v_n;
end;
$$;

comment on function public.bloquear_historia() is
  'Cierra el candado de la historia para el usuario actual (ADR-026).';


-- Prolonga la ventana. SOLO prolonga uno YA vigente: jamás resucita uno caducado, o la
-- ventana sería infinita y el candado, decorativo. Se llama desde Server Actions, JAMÁS
-- desde el renderizado (ADR-026): prolongar en el render deja el candado abierto
-- mientras haya una pestaña pintando.
create or replace function public.prolongar_desbloqueo()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_minutos smallint;
  v_caduca  timestamptz;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  select coalesce(o.minutos_desbloqueo_historia, 15) into v_minutos
  from public.organizacion o
  limit 1;

  update public.desbloqueos_historia
     set caduca_en = now() + make_interval(mins => coalesce(v_minutos, 15)::integer)
   where perfil_id = v_uid
     and revocado_en is null
     and caduca_en > now()
  returning caduca_en into v_caduca;

  return v_caduca;
end;
$$;

comment on function public.prolongar_desbloqueo() is
  'Prolonga un desbloqueo YA vigente. Nunca resucita uno caducado. Se invoca desde Server Actions, nunca desde el renderizado (ADR-026).';


revoke execute on function public.fijar_pin_historia(text)   from public;
revoke execute on function public.desbloquear_historia(text) from public;
revoke execute on function public.bloquear_historia()        from public;
revoke execute on function public.prolongar_desbloqueo()     from public;

grant execute on function public.fijar_pin_historia(text)    to authenticated;
grant execute on function public.desbloquear_historia(text)  to authenticated;
grant execute on function public.bloquear_historia()         to authenticated;
grant execute on function public.prolongar_desbloqueo()      to authenticated;


-- =========================================================================
-- 4 · Alta automática de perfil — la deuda que dejó T-000
-- =========================================================================
--
-- «Un usuario creado a mano en Studio no tendrá perfil», y sin perfil rol_actual() es
-- nulo y no ve nada.
--
-- FALLO CERRADO: si `raw_user_meta_data ->> 'rol'` falta o no pertenece al enum, el alta
-- del usuario FALLA. Con enable_signup = true, un rol por defecto convertiría cualquier
-- registro público en un profesional sanitario con acceso clínico. Un usuario que no se
-- puede crear es infinitamente mejor que un usuario que nace con acceso.
--
-- Definer porque el disparador corre como `supabase_auth_admin`, que no tiene privilegios
-- sobre public.perfiles.
create or replace function public.fn_crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_texto text := new.raw_user_meta_data ->> 'rol';
  v_rol       public.rol_usuario;
  v_centro    uuid := nullif(new.raw_user_meta_data ->> 'centro_id', '')::uuid;
  v_nombre    text := nullif(trim(new.raw_user_meta_data ->> 'nombre_completo'), '');
begin
  if v_rol_texto is null or trim(v_rol_texto) = '' then
    raise exception
      'Alta rechazada: falta "rol" en raw_user_meta_data del usuario %.', new.email
      using errcode = '22023';
  end if;

  begin
    v_rol := v_rol_texto::public.rol_usuario;
  exception when invalid_text_representation then
    raise exception
      'Alta rechazada: rol "%" desconocido para el usuario %.', v_rol_texto, new.email
      using errcode = '22023';
  end;

  insert into public.perfiles (id, nombre_completo, rol, centro_id)
  values (new.id, coalesce(v_nombre, new.email, 'Sin nombre'), v_rol, v_centro)
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.fn_crear_perfil_de_usuario() is
  'Crea el perfil al dar de alta un auth.users. Sin rol válido en los metadatos, el alta falla: fallo cerrado.';

drop trigger if exists crear_perfil_de_usuario on auth.users;
create trigger crear_perfil_de_usuario
  after insert on auth.users
  for each row execute function public.fn_crear_perfil_de_usuario();


-- =========================================================================
-- 5 · Relleno por defecto de pacientes.centro_id
-- =========================================================================

-- Nunca inventa un centro: un centro_id equivocado acota mal al técnico administrativo,
-- que es exactamente el rol que esta columna gobierna.
create or replace function public.fn_rellenar_centro_paciente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if new.centro_id is not null then
    return new;
  end if;

  -- 1 · El centro del profesional asignado.
  select f.centro_id into new.centro_id
  from public.perfiles f
  where f.id = new.profesional_id;

  if new.centro_id is not null then
    return new;
  end if;

  -- 2 · Si solo hay un centro activo, ese. (No hay agregado min() para uuid, así que se
  --     cuenta primero y se lee después.)
  select count(*) into v_n from public.centros c where c.activo;

  if v_n = 1 then
    select c.id into new.centro_id from public.centros c where c.activo;
  end if;

  -- 3 · Si hay varios y no se puede decidir, queda nulo. Y nulo es FALLO CERRADO:
  --     la política del técnico es una igualdad simple, y con nulo da null, o sea,
  --     no visible. Un paciente sin centro es invisible para recepción hasta que el
  --     administrador se lo asigne — visible y arreglable.
  return new;
end;
$$;

comment on function public.fn_rellenar_centro_paciente() is
  'Rellena pacientes.centro_id por defecto: centro del profesional, o el único centro activo. Nunca inventa uno.';

drop trigger if exists rellenar_centro_paciente on public.pacientes;
create trigger rellenar_centro_paciente
  before insert on public.pacientes
  for each row execute function public.fn_rellenar_centro_paciente();


-- Relleno de las filas que ya existen, con el mismo criterio.
-- VA AQUÍ Y NO MÁS ABAJO por dos motivos: para que ninguna comprobación manual vea el
-- estado intermedio, y porque el disparador de columnas reservadas de la sección
-- siguiente rechazaría este mismo `update` (corre sin sesión, así que rol_actual() es
-- nulo y no es administrador).
update public.pacientes p
   set centro_id = f.centro_id
  from public.perfiles f
 where f.id = p.profesional_id
   and p.centro_id is null
   and f.centro_id is not null;

update public.pacientes p
   set centro_id = (select c.id from public.centros c where c.activo)
 where p.centro_id is null
   and (select count(*) from public.centros c where c.activo) = 1;


-- =========================================================================
-- 6 · Columnas reservadas de pacientes — RLS no ve el OLD
-- =========================================================================
--
-- Un `with check` no puede decir «no cambies esta columna»: solo ve la fila nueva. Sin
-- este disparador, la política de update del profesional le permitiría REASIGNARSE
-- pacientes ajenos (`profesional_id`) o marcarse pacientes como suyos (`titularidad`),
-- las dos cosas prohibidas por la enmienda del ADR-032.
--
-- Es disparador y no política PORQUE la comparación exige `old`. Deja al profesional
-- editar nombre, apellidos y fecha de nacimiento.
create or replace function public.fn_proteger_columnas_reservadas_paciente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select public.rol_actual()) = 'administrador'::public.rol_usuario then
    return new;
  end if;

  if new.profesional_id  is distinct from old.profesional_id
  or new.titularidad     is distinct from old.titularidad
  or new.centro_id       is distinct from old.centro_id
  or new.fusionado_en    is distinct from old.fusionado_en
  or new.fusionado_el    is distinct from old.fusionado_el
  or new.fusionado_por   is distinct from old.fusionado_por
  or new.motivo_fusion   is distinct from old.motivo_fusion
  or new.traspasado_en   is distinct from old.traspasado_en
  or new.traspasado_a    is distinct from old.traspasado_a
  or new.motivo_traspaso is distinct from old.motivo_traspaso
  then
    raise exception
      'Solo el administrador puede cambiar asignación, titularidad, centro, fusión o traspaso de un paciente.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.fn_proteger_columnas_reservadas_paciente() is
  'Impide que quien no es administrador reasigne, retitule, recentre, fusione o traspase un paciente (ADR-032). Disparador y no política porque la comparación exige old.';

drop trigger if exists proteger_columnas_reservadas_paciente on public.pacientes;
create trigger proteger_columnas_reservadas_paciente
  before update of profesional_id, titularidad, centro_id,
                   fusionado_en, fusionado_el, fusionado_por, motivo_fusion,
                   traspasado_en, traspasado_a, motivo_traspaso
  on public.pacientes
  for each row execute function public.fn_proteger_columnas_reservadas_paciente();


-- =========================================================================
-- 7 · Índices que las políticas de abajo ponen en un `using`
-- =========================================================================
--
-- Una política sin índice detrás es un recorrido secuencial POR FILA.
-- No se añaden informes(autor_id) ni notas_clinicas_versiones(autor_id): allí la columna
-- va dentro de un `or`, donde el índice no es utilizable.

-- El único que había sobre episodio_id es el único PARCIAL `where baja_en is null`, y
-- es_profesional_del_episodio() mira también a los participantes dados de baja.
create index if not exists episodio_participantes_episodio_idx
  on public.episodio_participantes (episodio_id);

create index if not exists diagnosticos_paciente_idx
  on public.diagnosticos (paciente_id);

create index if not exists evaluacion_archivos_evaluacion_idx
  on public.evaluacion_archivos (evaluacion_id);

create index if not exists alertas_documentacion_centro_idx
  on public.alertas_documentacion (centro_id);


-- =========================================================================
-- 8 · Privilegios — antes de las políticas
-- =========================================================================

-- Sin esto, «el administrador tiene control total sobre pacientes» es mentira: la
-- política de update existiría y el `grant` la haría inalcanzable. Síntoma a recordar:
-- un `permission denied` que parece de políticas y es de grants — se mira con \dp.
grant update on table public.pacientes to authenticated;

-- ADR-026: el estado del candado se consulta por función, no leyendo la tabla.
-- La clave ajena accesos_historia.desbloqueo_id sigue funcionando porque la comprobación
-- referencial corre como propietario, y `postgres` conserva update y delete sobre
-- desbloqueos_historia (no es tabla de solo adición).
revoke select on table public.desbloqueos_historia from authenticated;

-- pines_historia sigue sin un solo privilegio para authenticated: RLS activo y cero
-- grants deniegan dos veces.


-- =========================================================================
-- 9 · Las dos políticas de T-000 sobre pacientes se retiran
-- =========================================================================
--
-- ESTO NO ES LIMPIEZA COSMÉTICA, ES CORRECCIÓN. Las políticas permisivas se suman con
-- OR: dejar la de T-000 —que no mira `perfiles.estado` ni resuelve la fusión— haría que
-- un profesional de baja siguiera viendo a sus pacientes CON LAS POLÍTICAS NUEVAS
-- PERFECTAMENTE ESCRITAS.
--
-- Se conservan `perfiles_lectura_propia` y `auditoria_lectura_propia`.

drop policy if exists pacientes_lectura_profesional_propio on public.pacientes;
drop policy if exists pacientes_alta_profesional_propio    on public.pacientes;


-- =========================================================================
-- 10 · Políticas · Organización
-- =========================================================================

-- organizacion: `authenticated` tiene select y update, no insert. La fila única la crea
-- la instalación, no una pantalla.
create policy organizacion_lectura on public.organizacion
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy organizacion_modificacion_administrador on public.organizacion
  for update to authenticated
  using      ((select public.rol_actual()) = 'administrador'::public.rol_usuario)
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);


create policy centros_lectura on public.centros
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy centros_alta_administrador on public.centros
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

create policy centros_modificacion_administrador on public.centros
  for update to authenticated
  using      ((select public.rol_actual()) = 'administrador'::public.rol_usuario)
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);


create policy politicas_retencion_lectura on public.politicas_retencion
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy politicas_retencion_alta_administrador on public.politicas_retencion
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

create policy politicas_retencion_modificacion_administrador on public.politicas_retencion
  for update to authenticated
  using      ((select public.rol_actual()) = 'administrador'::public.rol_usuario)
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);


create policy preferencias_usuario_lectura_propia on public.preferencias_usuario
  for select to authenticated
  using (perfil_id = (select auth.uid()));

create policy preferencias_usuario_alta_propia on public.preferencias_usuario
  for insert to authenticated
  with check (perfil_id = (select auth.uid()));

create policy preferencias_usuario_modificacion_propia on public.preferencias_usuario
  for update to authenticated
  using      (perfil_id = (select auth.uid()))
  with check (perfil_id = (select auth.uid()));


-- perfiles: NINGUNA política nueva. Conserva la de T-000, `perfiles_lectura_propia`, y
-- cero políticas de escritura: alta, cambio de rol y baja pasan por funciones definer de
-- T-006. El directorio de compañeros sale de la vista `directorio_perfiles` del final de
-- este fichero, porque una política sobre `perfiles` no puede invocar rol_actual() sin
-- recursión — regla permanente.

-- pines_historia y desbloqueos_historia: CERO políticas, a propósito. Con RLS activo y
-- sin grants deniegan dos veces, y ninguna de sus (inexistentes) políticas puede invocar
-- historia_desbloqueada(): sin recursión por construcción.


-- =========================================================================
-- 11 · Políticas · Paciente identificativo
-- =========================================================================

create policy pacientes_lectura_administrador on public.pacientes
  for select to authenticated
  using ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

create policy pacientes_lectura_profesional_asignado on public.pacientes
  for select to authenticated
  using (public.es_profesional_asignado(id));

create policy pacientes_lectura_tecnico_de_su_centro on public.pacientes
  for select to authenticated
  using (
    (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
    and centro_id = (select public.centro_actual())
  );

create policy pacientes_alta_administrador on public.pacientes
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

create policy pacientes_alta_profesional on public.pacientes
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
    and profesional_id = (select auth.uid())
    and titularidad    = 'organizacion'::public.titularidad_paciente
    and fusionado_en   is null
    and traspasado_en  is null
  );

create policy pacientes_modificacion_administrador on public.pacientes
  for update to authenticated
  using      ((select public.rol_actual()) = 'administrador'::public.rol_usuario)
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

create policy pacientes_modificacion_profesional_asignado on public.pacientes
  for update to authenticated
  using (
    public.es_profesional_asignado(id)
    and fusionado_en  is null
    and traspasado_en is null
  )
  with check (public.es_profesional_asignado(id));


-- Técnico administrativo: NI UNA política sobre pacientes_identificacion. Cero filas por
-- construcción, no por filtro (matriz de roles: «DNI y domicilio · Sin acceso»).
create policy pacientes_identificacion_lectura on public.pacientes_identificacion
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy pacientes_identificacion_alta on public.pacientes_identificacion
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy pacientes_identificacion_modificacion on public.pacientes_identificacion
  for update to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );


-- representantes_paciente y consentimientos NO llevan candado: el ADR-026 enumera las
-- ocho tablas de contenido clínico que cubre, y estas no están.
create policy representantes_paciente_lectura on public.representantes_paciente
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy representantes_paciente_alta on public.representantes_paciente
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy representantes_paciente_modificacion on public.representantes_paciente
  for update to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );


create policy consentimientos_lectura on public.consentimientos
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy consentimientos_alta on public.consentimientos
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy consentimientos_modificacion on public.consentimientos
  for update to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );


create policy consentimiento_firmantes_lectura on public.consentimiento_firmantes
  for select to authenticated
  using (exists (
    select 1 from public.consentimientos c
    where c.id = consentimiento_id
      and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
           or public.es_profesional_asignado(c.paciente_id))
  ));

create policy consentimiento_firmantes_alta on public.consentimiento_firmantes
  for insert to authenticated
  with check (exists (
    select 1 from public.consentimientos c
    where c.id = consentimiento_id
      and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
           or public.es_profesional_asignado(c.paciente_id))
  ));

create policy consentimiento_firmantes_modificacion on public.consentimiento_firmantes
  for update to authenticated
  using (exists (
    select 1 from public.consentimientos c
    where c.id = consentimiento_id
      and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
           or public.es_profesional_asignado(c.paciente_id))
  ))
  with check (exists (
    select 1 from public.consentimientos c
    where c.id = consentimiento_id
      and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
           or public.es_profesional_asignado(c.paciente_id))
  ));


-- =========================================================================
-- 12 · Políticas · Paciente clínico — TODAS con candado
-- =========================================================================
--
-- Cuatro decisiones que hay que entender ANTES de tocar una sola de estas líneas:
--
-- 1. NINGUNA política clínica menciona rol_actual(). El administrador entra por
--    `autor_id = U` o por es_profesional_asignado(), igual que un profesional. Así «el
--    administrador no ve notas ajenas» (matriz de roles, «el secreto profesional es del
--    profesional, no del cargo») no depende de que nadie escriba una rama para él:
--    NO HAY RAMA PARA ÉL.
-- 2. La participación en episodio llega a `episodios_asistenciales` y a `notas_clinicas`,
--    y NO a `diagnosticos` ni a `valoraciones_riesgo`. Un diagnóstico y una valoración
--    son DE UNA PERSONA —por eso T-001 les puso paciente_id—; dejar que el profesional
--    del otro miembro de la pareja los leyera filtraría el dato clínico individual de un
--    tercero por la puerta del episodio.
-- 3. La rama de participación exige `alcance = 'conjunta'`, que solo existe en la versión
--    SELLADA. Consecuencia deliberada: una nota individual dentro de un episodio conjunto
--    no se comparte, y un borrador conjunto tampoco se ve desde fuera hasta que se firma
--    (ADR-036).
-- 4. valoraciones_riesgo no lleva política de update: T-001 no concedió ese privilegio.

create policy episodios_lectura on public.episodios_asistenciales
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and (
      public.es_profesional_asignado(paciente_id)
      or profesional_id = (select auth.uid())
      or public.es_profesional_del_episodio(id)
    )
  );

create policy episodios_alta on public.episodios_asistenciales
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and profesional_id = (select auth.uid())
    and public.es_profesional_asignado(paciente_id)
  );

create policy episodios_modificacion on public.episodios_asistenciales
  for update to authenticated
  using (
    (select public.historia_desbloqueada())
    and (public.es_profesional_asignado(paciente_id) or profesional_id = (select auth.uid()))
  )
  with check (
    (select public.historia_desbloqueada())
    and (public.es_profesional_asignado(paciente_id) or profesional_id = (select auth.uid()))
  );


create policy episodio_participantes_lectura on public.episodio_participantes
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_del_episodio(episodio_id)
  );

create policy episodio_participantes_alta on public.episodio_participantes
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_del_episodio(episodio_id)
  );

create policy episodio_participantes_modificacion on public.episodio_participantes
  for update to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_del_episodio(episodio_id)
  )
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_del_episodio(episodio_id)
  );


create policy diagnosticos_lectura on public.diagnosticos
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );

create policy diagnosticos_alta on public.diagnosticos
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );

create policy diagnosticos_modificacion on public.diagnosticos
  for update to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );


create policy valoraciones_riesgo_lectura on public.valoraciones_riesgo
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );

create policy valoraciones_riesgo_alta on public.valoraciones_riesgo
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
    and valorado_por = (select auth.uid())
  );


create policy notas_clinicas_lectura on public.notas_clinicas
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and (
      autor_id = (select auth.uid())
      or public.es_profesional_asignado(paciente_id)
      or (
        episodio_id is not null
        and public.es_profesional_del_episodio(episodio_id)
        and public.nota_tiene_version_conjunta(id)
      )
    )
  );

create policy notas_clinicas_alta on public.notas_clinicas
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
    and public.es_profesional_asignado(paciente_id)
  );

create policy notas_clinicas_modificacion on public.notas_clinicas
  for update to authenticated
  using (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
  )
  with check (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
  );


create policy notas_clinicas_versiones_lectura on public.notas_clinicas_versiones
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and exists (
      select 1 from public.notas_clinicas n
      where n.id = nota_id
        and (
          n.autor_id = (select auth.uid())
          or public.es_profesional_asignado(n.paciente_id)
          or (alcance = 'conjunta'::public.alcance_nota
              and n.episodio_id is not null
              and public.es_profesional_del_episodio(n.episodio_id))
        )
    )
  );

create policy notas_clinicas_versiones_alta on public.notas_clinicas_versiones
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
    and exists (
      select 1 from public.notas_clinicas n
      where n.id = nota_id
        and n.autor_id = (select auth.uid())
    )
  );


create policy evaluaciones_lectura on public.evaluaciones
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );

create policy evaluaciones_alta on public.evaluaciones
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );

create policy evaluaciones_modificacion on public.evaluaciones
  for update to authenticated
  using (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.historia_desbloqueada())
    and public.es_profesional_asignado(paciente_id)
  );


create policy evaluacion_archivos_lectura on public.evaluacion_archivos
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and exists (
      select 1 from public.evaluaciones e
      where e.id = evaluacion_id
        and public.es_profesional_asignado(e.paciente_id)
    )
  );

create policy evaluacion_archivos_alta on public.evaluacion_archivos
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and exists (
      select 1 from public.evaluaciones e
      where e.id = evaluacion_id
        and public.es_profesional_asignado(e.paciente_id)
    )
  );


create policy informes_lectura on public.informes
  for select to authenticated
  using (
    (select public.historia_desbloqueada())
    and (autor_id = (select auth.uid()) or public.es_profesional_asignado(paciente_id))
  );

create policy informes_alta on public.informes
  for insert to authenticated
  with check (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
    and public.es_profesional_asignado(paciente_id)
  );

create policy informes_modificacion on public.informes
  for update to authenticated
  using (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
  )
  with check (
    (select public.historia_desbloqueada())
    and autor_id = (select auth.uid())
  );


-- =========================================================================
-- 13 · Políticas · Cumplimiento
-- =========================================================================

create policy accesos_historia_lectura on public.accesos_historia
  for select to authenticated
  using (
    perfil_id = (select auth.uid())
    or (select public.rol_actual()) = 'administrador'::public.rol_usuario
  );

create policy accesos_historia_alta on public.accesos_historia
  for insert to authenticated
  with check (
    perfil_id = (select auth.uid())
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or public.es_profesional_asignado(paciente_id)
    )
    and (desbloqueo_id is null or public.desbloqueo_propio_vigente(desbloqueo_id))
  );


-- accesos_historia_vistas.acceso_id NO lleva clave ajena, y no puede llevarla: la tabla
-- padre es de solo adición y la comprobación referencial exigiría update o delete sobre
-- ella (trampa pagada en T-001). Así que ESTA POLÍTICA es lo único que sujeta esa
-- integridad, y un huérfano aquí no se podría borrar.
--
-- El `exists` recorre accesos_historia BAJO SU PROPIA RLS —no es una función definer, a
-- propósito—, así que exige que el acceso exista y sea visible para quien escribe. Y el
-- `a.perfil_id = U` lo exige además explícitamente, sin dejarlo depender de que la
-- política del padre no cambie mañana.
create policy accesos_historia_vistas_lectura on public.accesos_historia_vistas
  for select to authenticated
  using (exists (
    select 1 from public.accesos_historia a where a.id = acceso_id
  ));

create policy accesos_historia_vistas_alta on public.accesos_historia_vistas
  for insert to authenticated
  with check (exists (
    select 1 from public.accesos_historia a
    where a.id = acceso_id
      and a.perfil_id = (select auth.uid())
  ));


-- alertas_documentacion es la ÚNICA tabla de este bloque SIN candado: son recuentos y
-- estados, no contenido (ADR-026; un candado que tapa los contadores se queda abierto
-- todo el día). De aquí se alimentan la bandeja de Clínica y las métricas de Inicio.
--
-- El `rol_actual() is not null` que abre las dos políticas NO es redundante: esta tabla
-- está fuera del candado, así que no hereda de él el corte por baja, y su rama
-- `profesional_id = U` no mira el estado de nadie. Sin ese primer término, un profesional
-- dado de baja seguiría viendo su bandeja (ADR-032, «el acceso se corta entero»).
create policy alertas_documentacion_lectura on public.alertas_documentacion
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or public.es_profesional_asignado(paciente_id)
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id = (select public.centro_actual())
      )
    )
  );

create policy alertas_documentacion_modificacion on public.alertas_documentacion
  for update to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or public.es_profesional_asignado(paciente_id)
    )
  )
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or public.es_profesional_asignado(paciente_id)
    )
  );


-- =========================================================================
-- 14 · Vistas derivadas — lo que un `grant select (columnas)` no puede hacer
-- =========================================================================
--
-- Los tres roles del dominio comparten el MISMO rol de Postgres, `authenticated`: el rol
-- vive en perfiles.rol. Así que un grant por columnas o se lo da a los tres o a ninguno.
--
-- Las dos vistas van `security_invoker = false` (corren como el propietario, así que
-- saltan la RLS de la tabla base y aplican la suya) Y `security_barrier = true`: sin la
-- barrera el planificador puede empujar una función barata del usuario por debajo del
-- filtro y filtrar filas por el mensaje de error.

-- El indicador binario de riesgo para el técnico administrativo (matriz de roles: «Nivel
-- de riesgo · Solo indicador binario»; invariante 3).
--
-- `nivel`, `descripcion` y `plan_seguridad` NO APARECEN EN EL TEXTO DE ESTA VISTA. No es
-- que se filtren: es que no están.
--
-- SOLO SIRVE AL TÉCNICO, deliberadamente: profesional y administrador leen la tabla con
-- su política y su candado, y así el ADR-026 sigue cubriéndola sin excepciones. Una vista
-- que sirviera a los tres sería un segundo camino al riesgo por fuera del candado.
create or replace view public.pacientes_indicador_riesgo
  with (security_invoker = false, security_barrier = true)
  as
select v.paciente_id,
       v.indicador,
       v.valorado_en
from public.valoraciones_riesgo v
join public.pacientes p on p.id = v.paciente_id
where (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
  and p.centro_id = (select public.centro_actual());

comment on view public.pacientes_indicador_riesgo is
  'Indicador binario de riesgo para el técnico administrativo de ese centro. Sin nivel, sin descripción y sin plan de seguridad: no están en el texto de la vista.';

revoke all on table public.pacientes_indicador_riesgo from public, anon, service_role;
grant select on table public.pacientes_indicador_riesgo to authenticated;


-- Directorio de compañeros. Existe porque la regla permanente prohíbe que una política
-- sobre `perfiles` invoque rol_actual(), y a la vez `motivo_estado` —la causa de la baja
-- de un compañero— no puede salir en un directorio.
create or replace view public.directorio_perfiles
  with (security_invoker = false, security_barrier = true)
  as
select f.id,
       f.nombre_completo,
       f.rol,
       f.estado,
       f.centro_id
from public.perfiles f
where (select public.rol_actual()) is not null;

comment on view public.directorio_perfiles is
  'Directorio de compañeros para todo perfil activo. Sin motivo_estado: la causa de la baja de un compañero no es dato de directorio.';

revoke all on table public.directorio_perfiles from public, anon, service_role;
grant select on table public.directorio_perfiles to authenticated;


-- =========================================================================
-- 15 · Comentarios de política donde la expresión no se lee como frase
-- =========================================================================

comment on policy pacientes_lectura_profesional_asignado on public.pacientes is
  'Sus pacientes, resolviendo la fusión en un salto. Sin rama de rol: si un administrador figura como profesional_id, ese paciente es suyo.';

comment on policy pacientes_modificacion_profesional_asignado on public.pacientes is
  'fusionado_en is null es el «solo lectura» del registro absorbido (ADR-031); traspasado_en is null, el «cerrado a nueva actividad» (ADR-032). El administrador sí puede tocarlos: revocar una vinculación es acto suyo.';

comment on policy notas_clinicas_lectura on public.notas_clinicas is
  'Autor, profesional asignado, o profesional de cualquier participante del episodio cuando la nota tiene versión sellada de alcance conjunto (ADR-030). El borrador conjunto no se ve desde fuera hasta que se firma (ADR-036).';

comment on policy notas_clinicas_versiones_lectura on public.notas_clinicas_versiones is
  'La versión se ve si su nota se ve; la rama conjunta mira el alcance de ESTA versión, no el de la nota.';

comment on policy accesos_historia_vistas_alta on public.accesos_historia_vistas is
  'Único sujetador de la integridad de acceso_id: la tabla padre es de solo adición y no admite clave ajena. El exists corre bajo la RLS de accesos_historia, a propósito.';

comment on policy alertas_documentacion_lectura on public.alertas_documentacion is
  'Fuera del candado del ADR-026: recuentos y estados, no contenido.';

comment on policy accesos_historia_alta on public.accesos_historia is
  'Cada quien registra sus propios accesos, y solo puede atarlos a un desbloqueo propio y vigente.';
