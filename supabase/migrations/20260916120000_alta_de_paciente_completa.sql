-- =========================================================================
-- T-032 · El alta de paciente completa — fecha, sexo, teléfono, DNI y
-- domicilio cifrados, alergias y medicación
-- =========================================================================
--
-- Diseño: tickets/T-032/diseno.md §1.2. Tres ADR nuevos: ADR-060 (el técnico
-- administrativo lee DNI y domicilio de sus centros, con rastro en
-- `auditoria`), ADR-061 (`pacientes_salud_basica`, en claro, sin el
-- técnico), ADR-062 (un solo campo de sexo, administrativo).
--
-- Última redefinición de `registrar_evento_auditable()` antes de esta
-- migración: 20260829150000_auditoria_y_solo_adicion.sql:125-163 (T-004).
-- Aquí se vuelve a redefinir completa (supabase.md: «para saber qué hace hoy
-- una función hay que buscar la última redefinición»).
--
-- Orden: los tipos antes que las columnas, las tablas antes que sus
-- políticas, las funciones antes que sus disparadores.


-- =========================================================================
-- §1 · Teléfono y sexo en `pacientes`
-- =========================================================================
create type public.sexo_administrativo as enum ('hombre', 'mujer', 'otro');

alter table public.pacientes
  add column telefono text,
  add column sexo public.sexo_administrativo,
  add constraint pacientes_telefono_e164
    check (telefono is null or telefono ~ '^\+[1-9][0-9]{6,14}$');

comment on column public.pacientes.telefono is
  'Normalizado a E.164 (+CCNNNNNNNNN) porque wa.me no admite espacios (ADR-023). '
  'La forma es genérica y no española a propósito: lib/identidad valida el país. '
  'Se pinta con formatearTelefono(). Sin índice y sin unicidad: dos hermanos pueden '
  'compartir teléfono, y un índice invitaría a buscar pacientes por teléfono sin '
  'ninguna política pensada para eso.';

comment on column public.pacientes.sexo is
  'Dato administrativo del RD 1093/2010 (ADR-062). NO es identidad de género: no '
  'cuelga de él ninguna lógica clínica. Opcional.';


-- =========================================================================
-- §2 · La fecha de nacimiento, dicha
-- =========================================================================
comment on column public.pacientes.fecha_nacimiento is
  'Obligatoria en el alta desde T-032 (Ley 41/2002 · RD 1093/2010) y sostiene '
  'capacidad_consentimiento() (ADR-028). NULABLE EN LA TABLA a propósito: hay filas '
  'anteriores a T-032 sin ella y la rama «desconocida» debe seguir existiendo. Ponerla '
  'not null es otra migración, el día que no queden nulos.';

-- Sin check de cordura: current_date no es inmutable y Postgres no la admite en un
-- check. El «no futura» vive en Zod y en alta_paciente().


-- =========================================================================
-- §3 · `pacientes_identificacion` admite domicilio sin documento
-- =========================================================================
alter table public.pacientes_identificacion
  alter column tipo_documento drop not null,
  alter column dni_cifrado    drop not null,
  alter column dni_nonce      drop not null,
  alter column dni_etiqueta   drop not null,
  alter column dni_indice     drop not null;

alter table public.pacientes_identificacion
  add constraint pacientes_identificacion_documento_todo_o_nada
    check (num_nonnulls(tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice)
           in (0, 5)),
  add constraint pacientes_identificacion_fila_no_vacia
    check (num_nonnulls(dni_cifrado, domicilio_cifrado) >= 1),
  add constraint pacientes_identificacion_domicilio_acotado
    check (domicilio_cifrado is null or octet_length(domicilio_cifrado) <= 2048),
  -- Solo existe la clave v1 (la rotación queda fuera de T-032). Si algo escribiera otra
  -- versión, lib/cifrado la descifraría con la v1 y el fallo parecería una manipulación:
  -- la base lo impide aquí, y el módulo, por su parte, lanza si lee otra (M2 de la revisión).
  -- Rotar es otro ticket, que relajará estos checks en la misma migración que añada la v2.
  add constraint pacientes_identificacion_clave_version_1
    check (dni_clave_version = 1
           and dni_indice_clave_version = 1
           and (domicilio_clave_version is null or domicilio_clave_version = 1));

comment on table public.pacientes_identificacion is
  'DNI y domicilio cifrados (ADR-029). Desde T-032 una fila puede tener solo domicilio '
  '(sin documento): pacientes_identificacion_documento_todo_o_nada exige que las cinco '
  'columnas del documento vengan juntas o ninguna, pero no exige el documento en sí. '
  'dni_clave_version y dni_indice_clave_version se quedan NOT NULL DEFAULT 1 y fuera del '
  'grupo todo-o-nada a propósito: si entraran, su propio default llenaría la fila de '
  'domicilio-solo y la haría violar el todo-o-nada. Queda un 1 sin significado en las '
  'filas sin documento: ruido inocuo. El índice único sobre dni_indice no choca entre '
  'nulos (nulls distinct por defecto): N filas de solo domicilio conviven.';


-- =========================================================================
-- §4 · `pacientes_salud_basica` (ADR-061)
-- =========================================================================
create table public.pacientes_salud_basica (
  paciente_id uuid primary key references public.pacientes (id),
  alergias text
    check (alergias is null or (length(trim(alergias)) > 0 and length(alergias) <= 2000)),
  medicacion_actual text
    check (medicacion_actual is null
           or (length(trim(medicacion_actual)) > 0 and length(medicacion_actual) <= 2000)),
  constraint pacientes_salud_basica_fila_no_vacia
    check (num_nonnulls(alergias, medicacion_actual) >= 1),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid not null references public.perfiles (id)
);

comment on table public.pacientes_salud_basica is
  'Alergias y medicación actual, texto libre, SIN CIFRAR y fuera del candado del ADR-026 '
  '(ADR-061): es dato que puede hacer falta deprisa, y cifrar una frase clínica mientras '
  'la nota clínica sigue en claro sería una falsa sensación de protección. Sin fila '
  'vacía: si nadie ha preguntado, no hay fila (distinto de «sin alergias conocidas», que '
  'no se modela aquí). Mutable, sin historial: versionar es otro ADR. CERO políticas '
  'para el técnico administrativo, condición de la aprobación del propietario '
  '(16-09-2026), no una preferencia del diseño.';

alter table public.pacientes_salud_basica enable row level security;

revoke all on table public.pacientes_salud_basica from public, anon, authenticated, service_role;
grant select, insert, update on table public.pacientes_salud_basica to authenticated;

create policy pacientes_salud_basica_lectura on public.pacientes_salud_basica
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy pacientes_salud_basica_alta on public.pacientes_salud_basica
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy pacientes_salud_basica_modificacion on public.pacientes_salud_basica
  for update to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

-- La autoría la fija la base, no quien escribe (M1 de la revisión): `actualizado_por` y
-- `actualizado_en` se sobrescriben con la sesión y el reloj del servidor en cada
-- escritura, y `paciente_id` no cambia nunca (mover unas alergias a otro paciente es
-- escribirle a ese otro un dato clínico ajeno). Sin sesión de usuario —`postgres` o
-- `service_role` sembrando— se respeta el `actualizado_por` recibido, que la columna
-- sigue exigiendo NOT NULL y con FK a perfiles.
create function public.fn_salud_basica_autoria()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if tg_op = 'UPDATE' and new.paciente_id is distinct from old.paciente_id then
    raise exception
      'pacientes_salud_basica.paciente_id no se puede cambiar: la fila es de su paciente.'
      using errcode = '42501';
  end if;
  new.actualizado_en := now();
  if v_usuario is not null then
    new.actualizado_por := v_usuario;
  end if;
  return new;
end;
$$;

comment on function public.fn_salud_basica_autoria() is
  'Fija actualizado_por = auth.uid() y actualizado_en = now() en cada escritura de '
  'pacientes_salud_basica, y rechaza con 42501 un cambio de paciente_id (T-032, M1).';

revoke execute on function public.fn_salud_basica_autoria() from public;

create trigger salud_basica_autoria
  before insert or update on public.pacientes_salud_basica
  for each row execute function public.fn_salud_basica_autoria();

-- Auditoría explícita: el bucle de instalación masiva de 2026-08-29 no vuelve a correr
-- para tablas nuevas. Se recortan las dos columnas de contenido: se audita QUE alguien
-- tocó la alergia y CUÁNDO, no QUÉ dice (mismo criterio que notas_clinicas.borrador_contenido).
create trigger auditar_pacientes_salud_basica
  after insert or update or delete on public.pacientes_salud_basica
  for each row execute function public.fn_auditar('paciente_id', 'alergias', 'medicacion_actual');


-- =========================================================================
-- §5 · La puerta al Vault
-- =========================================================================
create function public.clave_de_cifrado(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text;
begin
  -- Lista blanca de DOS nombres. Sin ella, esta función es «dame cualquier secreto».
  if p_nombre not in ('identificacion_cifrado_v1', 'identificacion_indice_v1') then
    raise exception 'Secreto no permitido: %', p_nombre using errcode = '42501';
  end if;

  select s.decrypted_secret into v_clave
  from vault.decrypted_secrets s
  where s.name = p_nombre;

  if v_clave is null then
    raise exception 'Falta el secreto % en el Vault. Créalo con vault.create_secret(...).',
      p_nombre using errcode = 'P0002';
  end if;

  return v_clave;
end;
$$;

comment on function public.clave_de_cifrado(text) is
  'Devuelve una clave del Vault en base64 (32 bytes, 44 caracteres) por su nombre, con '
  'lista blanca literal de dos nombres (T-032, ADR-029). El decodificado ocurre en Node, '
  'nunca en SQL. Solo service_role la ejecuta: si authenticated pudiera, la clave '
  'viajaría al navegador con la sesión de cualquier usuario.';

revoke execute on function public.clave_de_cifrado(text) from public, anon, authenticated;
grant  execute on function public.clave_de_cifrado(text) to service_role;


-- =========================================================================
-- §6 · El alta en una sola transacción
-- =========================================================================
create function public.alta_paciente(
  p_nombre                text,
  p_apellidos             text,
  p_fecha_nacimiento      date,
  p_sexo                  public.sexo_administrativo default null,
  p_telefono              text default null,
  p_tipo_documento        text default null,
  p_dni_cifrado           text default null,   -- base64
  p_dni_nonce             text default null,   -- base64
  p_dni_etiqueta          text default null,   -- base64
  p_dni_indice            text default null,   -- base64
  p_domicilio_cifrado     text default null,   -- base64
  p_domicilio_nonce       text default null,   -- base64
  p_domicilio_etiqueta    text default null,   -- base64
  p_clave_version         smallint default 1,
  p_indice_clave_version  smallint default 1,
  p_alergias              text default null,
  p_medicacion_actual     text default null
)
returns uuid
language plpgsql
security invoker          -- NO definer: las políticas de las tres tablas deben morder
set search_path = ''
as $$
declare
  -- Generado ANTES del insert y pasado explícito (en vez de `returning id into v_id`)
  -- a propósito: `pacientes_lectura_profesional_asignado` (T-002) llama a
  -- `es_profesional_asignado()`, STABLE y security definer, que vuelve a consultar
  -- `pacientes` por dentro. Una función STABLE fija su instantánea al EMPEZAR la
  -- sentencia — no al insertar la fila —, así que dentro de un único `insert ...
  -- returning` esa fila propia, recién insertada, todavía no es visible para ella: la
  -- comprobación de RLS que exige poder verla de vuelta falla con 42501 aunque el
  -- `with check` del insert sea cierto (comprobado en vivo, T-032, contra la base
  -- local: sin `returning`, el mismo insert pasa). Un `insert ... values (...)` liso,
  -- sin `returning`, no dispara esa comprobación.
  v_id uuid := gen_random_uuid();
begin
  if p_fecha_nacimiento is null then
    raise exception 'La fecha de nacimiento es obligatoria en el alta (T-032).'
      using errcode = '23514';
  end if;
  if p_fecha_nacimiento > current_date or p_fecha_nacimiento < date '1900-01-01' then
    raise exception 'Fecha de nacimiento fuera de rango.' using errcode = '23514';
  end if;

  insert into public.pacientes (id, nombre, apellidos, fecha_nacimiento, sexo, telefono, profesional_id)
  values (v_id, p_nombre, p_apellidos, p_fecha_nacimiento, p_sexo, p_telefono, (select auth.uid()));

  if p_dni_cifrado is not null or p_domicilio_cifrado is not null then
    insert into public.pacientes_identificacion (
      paciente_id, tipo_documento,
      dni_cifrado, dni_nonce, dni_etiqueta, dni_indice,
      dni_clave_version, dni_indice_clave_version,
      domicilio_cifrado, domicilio_nonce, domicilio_etiqueta, domicilio_clave_version)
    values (
      v_id, p_tipo_documento,
      decode(p_dni_cifrado, 'base64'), decode(p_dni_nonce, 'base64'),
      decode(p_dni_etiqueta, 'base64'), decode(p_dni_indice, 'base64'),
      p_clave_version, p_indice_clave_version,
      decode(p_domicilio_cifrado, 'base64'), decode(p_domicilio_nonce, 'base64'),
      decode(p_domicilio_etiqueta, 'base64'),
      case when p_domicilio_cifrado is null then null else p_clave_version end);
  end if;

  if p_alergias is not null or p_medicacion_actual is not null then
    insert into public.pacientes_salud_basica
      (paciente_id, alergias, medicacion_actual, actualizado_por)
    values (v_id, p_alergias, p_medicacion_actual, (select auth.uid()));
  end if;

  return v_id;
end;
$$;

comment on function public.alta_paciente(
  text, text, date, public.sexo_administrativo, text, text, text, text, text, text,
  text, text, text, smallint, smallint, text, text
) is
  'Alta de paciente en una sola transacción (T-032): pacientes + pacientes_identificacion '
  '(si hay documento o domicilio) + pacientes_salud_basica (si hay alergias o medicación). '
  'profesional_id sale de auth.uid() dentro de la función, no de un parámetro: no existe '
  'forma de pedir el alta a nombre de otro. security invoker a propósito: las políticas '
  'pacientes_alta_profesional/administrador y pacientes_identificacion_alta siguen '
  'mordiendo, la segunda es cierta dentro de la transacción porque pacientes ya está '
  'insertada. DELETE sobre pacientes es imposible para todos los roles (supabase.md, '
  'T-001): sin esta función, un fallo entre el insert de pacientes y el de identificación '
  'dejaría un paciente fantasma permanente.';

revoke execute on function public.alta_paciente(
  text, text, date, public.sexo_administrativo, text, text, text, text, text, text,
  text, text, text, smallint, smallint, text, text
) from public;
grant execute on function public.alta_paciente(
  text, text, date, public.sexo_administrativo, text, text, text, text, text, text,
  text, text, text, smallint, smallint, text, text
) to authenticated;


-- =========================================================================
-- §7 · El técnico entra a leer (ADR-060)
-- =========================================================================
create policy pacientes_identificacion_lectura_tecnico on public.pacientes_identificacion
  for select to authenticated
  using (
    (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
    and paciente_id in (
      select p.id from public.pacientes p
      where p.centro_id in (select public.centros_actuales())
    )
  );

comment on policy pacientes_identificacion_lectura_tecnico on public.pacientes_identificacion is
  'ADR-060 (T-032): el técnico administrativo lee DNI y domicilio de los pacientes de '
  'sus centros actuales. Solo select: ni insert ni update, el técnico no escribe '
  'identificación. El camino de lectura de la aplicación es leer_identificacion(), que '
  'deja rastro en auditoria; esta política es la que decide si hay algo que leer.';

comment on policy pacientes_identificacion_lectura on public.pacientes_identificacion is
  'Administrador: todas las filas. Profesional asignado: las de sus pacientes. Desde '
  'T-032 el técnico administrativo también lee, por pacientes_identificacion_lectura_tecnico '
  '(ADR-060): la frase «ni una política para el técnico» ya no es cierta.';


-- =========================================================================
-- §7.1 · El rastro del descifrado (ADR-060, corrección del propietario del 16-09-2026)
-- =========================================================================

-- (a) El verbo. Se ensancha el check hacia delante, sin tocar una sola fila, como hizo
-- T-004 al añadir SESION, BUSQUEDA, PIN_*, TITULARIDAD y T-006 al añadir CUENTA_INVITADA,
-- CUENTA_BAJA, TOTP_REPUESTO (20260830090000). La lista completa se copia entera: un
-- `alter table ... add constraint` con `check` reemplaza el check anterior de golpe, no lo
-- amplía — omitir un verbo aquí lo habría dejado rechazando filas que el producto ya
-- escribe hoy (regla de supabase.md: «para saber qué hace hoy una función, la migración
-- que la crea no basta»).
alter table public.auditoria drop constraint if exists auditoria_operacion_check;
alter table public.auditoria add constraint auditoria_operacion_check
  check (operacion in (
    'INSERT', 'UPDATE', 'DELETE',
    'SESION',          -- inicio de sesión (T-006)
    'BUSQUEDA',        -- búsqueda que devuelve pacientes (interfaz.md, choque 8)
    'PIN_FALLIDO',     -- intento de PIN incorrecto (ADR-026)
    'PIN_BLOQUEADO',   -- bloqueo por intentos (ADR-026)
    'TITULARIDAD',     -- cambio de titularidad o de asignación (ADR-032)
    'CUENTA_INVITADA', -- alta por invitación (T-006)
    'CUENTA_BAJA',     -- baja de un perfil (ADR-032)
    'TOTP_REPUESTO',   -- reposición de TOTP (ADR-039)
    'LECTURA_IDENTIFICACION'   -- T-032 · lectura de DNI/domicilio (ADR-060)
  ));

-- (b) El escritor. Cuerpo idéntico al de T-004 (20260829150000:125-163) con una única
-- línea distinta: el verbo nuevo en la lista blanca.
create or replace function public.registrar_evento_auditable(
  p_operacion   text,
  p_tabla       text,
  p_registro_id text,
  p_detalle     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  if p_operacion not in ('SESION', 'BUSQUEDA', 'TITULARIDAD', 'LECTURA_IDENTIFICACION') then
    raise exception
      'Operación % no es un hecho auditable de aplicación. Los cambios de fila los escribe el disparador.',
      p_operacion using errcode = '22023';
  end if;

  if p_registro_id is null or trim(p_registro_id) = '' then
    raise exception 'Un hecho auditable sin sujeto no se registra.' using errcode = '22023';
  end if;

  insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior)
  values (v_uid, p_tabla, p_operacion, p_registro_id, p_detalle);
end;
$$;

comment on function public.registrar_evento_auditable(text, text, text, jsonb) is
  'Registra un hecho auditable que no es un cambio de fila: sesión, búsqueda, titularidad y '
  'lectura de identificación (T-032, ADR-060). Fuerza actor_id = auth.uid() y rechaza '
  'INSERT/UPDATE/DELETE.';

revoke execute on function public.registrar_evento_auditable(text, text, text, jsonb) from public;
grant  execute on function public.registrar_evento_auditable(text, text, text, jsonb) to authenticated;

-- (c) El único camino de lectura de la aplicación.
create function public.leer_identificacion(p_paciente_id uuid)
returns table (
  tipo_documento          text,
  dni_cifrado             bytea,
  dni_nonce               bytea,
  dni_etiqueta            bytea,
  dni_clave_version       smallint,
  domicilio_cifrado       bytea,
  domicilio_nonce         bytea,
  domicilio_etiqueta      bytea,
  domicilio_clave_version smallint
)
language plpgsql
volatile                  -- NO stable: escribe. Y PostgREST manda las volátiles por POST.
security invoker          -- deciden las políticas; aquí no se repite ninguna autorización
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_fila public.pacientes_identificacion%rowtype;
begin
  if v_uid is null then
    raise exception 'No hay sesión.' using errcode = '42501';
  end if;

  -- Bajo la RLS del llamante. El alias `i` es obligatorio: los parámetros OUT se llaman
  -- igual que las columnas y sin alias la referencia es ambigua EN EJECUCIÓN
  -- (regla de supabase.md).
  select i.* into v_fila
  from public.pacientes_identificacion i
  where i.paciente_id = p_paciente_id;

  -- Sin fila legible no ha habido lectura de nada: ni se devuelve ni se registra. Esto va
  -- ANTES del rastro a propósito; al revés, un barrido de uuids llenaría la auditoría de
  -- accesos que nunca ocurrieron.
  if not found then
    return;
  end if;

  -- Una fila por actor, paciente y ventana de quince minutos (ADR-037: N aperturas dentro
  -- de la ventana son UN acceso). Esta consulta corre bajo auditoria_lectura_propia, que
  -- solo deja ver las filas del propio actor: si la política ocultara algo el fallo sería
  -- UNA FILA DE MÁS, nunca una de menos.
  if not exists (
    select 1
    from public.auditoria a
    where a.actor_id    = v_uid
      and a.operacion   = 'LECTURA_IDENTIFICACION'
      and a.registro_id = p_paciente_id::text
      and a.ocurrido_en > now() - interval '15 minutes'
  ) then
    perform public.registrar_evento_auditable(
      'LECTURA_IDENTIFICACION',
      'pacientes_identificacion',
      p_paciente_id::text,
      jsonb_build_object(
        'rol',       (select public.rol_actual())::text,
        'documento', v_fila.dni_cifrado is not null,
        'domicilio', v_fila.domicilio_cifrado is not null));
  end if;

  return query select
    v_fila.tipo_documento,    v_fila.dni_cifrado,        v_fila.dni_nonce,
    v_fila.dni_etiqueta,      v_fila.dni_clave_version,  v_fila.domicilio_cifrado,
    v_fila.domicilio_nonce,   v_fila.domicilio_etiqueta, v_fila.domicilio_clave_version;
end;
$$;

comment on function public.leer_identificacion(uuid) is
  'Único camino de lectura de DNI/domicilio de la aplicación (T-032, ADR-060). Escribe el '
  'rastro en auditoria (verbo LECTURA_IDENTIFICACION) en la misma transacción, antes de '
  'devolver el criptograma: si el insert falla, no sale nada. security invoker: quién '
  'puede leer lo deciden las políticas de pacientes_identificacion, no esta función. '
  'dni_indice nunca se devuelve. Sin fila legible, cero filas y cero rastro.';

revoke execute on function public.leer_identificacion(uuid) from public, anon;
grant  execute on function public.leer_identificacion(uuid) to authenticated;


-- =========================================================================
-- §8 · El contacto de emergencia no firma
-- =========================================================================
create function public.fn_firmante_no_es_solo_contacto()
returns trigger
language plpgsql
security definer          -- a propósito: consulta representantes_paciente, que el
                           -- firmante puede no poder leer todavía en esta transacción
set search_path = ''
as $$
begin
  if new.representante_id is not null and exists (
    select 1 from public.representantes_paciente r
    where r.id = new.representante_id
      and r.alcance = 'solo_contacto'::public.alcance_representacion
  ) then
    raise exception
      'Un representante con alcance solo_contacto no puede firmar un consentimiento (ADR-028).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.fn_firmante_no_es_solo_contacto() is
  'Impide que un representante de alcance solo_contacto firme un consentimiento '
  '(ADR-028, T-032). Rechaza con 23514 (coherencia), no 42501 (permiso): no es una '
  'cuestión de a quién se le deja, sino de qué significa la fila.';

revoke execute on function public.fn_firmante_no_es_solo_contacto() from public;

create trigger firmante_no_es_solo_contacto
  before insert or update on public.consentimiento_firmantes
  for each row execute function public.fn_firmante_no_es_solo_contacto();

-- La gemela del disparador de arriba (M4 de la revisión): sin ella, bastaba con dar de alta
-- al representante como `custodia`, recoger su firma y bajarlo después a `solo_contacto`
-- para tener un contacto de emergencia firmando. Si el representante ya firma algún
-- consentimiento, no puede pasar a `solo_contacto`: primero se le retira la firma.
create function public.fn_solo_contacto_sin_firmas()
returns trigger
language plpgsql
security definer          -- a propósito: quien edita al representante puede no leer
                           -- todas las filas de consentimiento_firmantes que lo citan
set search_path = ''
as $$
begin
  if new.alcance = 'solo_contacto'::public.alcance_representacion
     and old.alcance is distinct from new.alcance
     and exists (
       select 1 from public.consentimiento_firmantes f
       where f.representante_id = new.id
     ) then
    raise exception
      'Un representante que ya firma un consentimiento no puede pasar a solo_contacto (ADR-028).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.fn_solo_contacto_sin_firmas() is
  'Impide pasar a alcance solo_contacto a un representante que ya figura como firmante '
  'de algún consentimiento (ADR-028, T-032, M4). 23514, como su gemela sobre '
  'consentimiento_firmantes.';

revoke execute on function public.fn_solo_contacto_sin_firmas() from public;

create trigger solo_contacto_sin_firmas
  before update of alcance on public.representantes_paciente
  for each row execute function public.fn_solo_contacto_sin_firmas();
