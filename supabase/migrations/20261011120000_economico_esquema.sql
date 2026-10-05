-- T-021 · Dominio económico: esquema.
-- Diseño: tickets/T-021/diseno.md (manda la «Adenda P3 aplicada», luego la adenda del 03-10).
--
-- ADR-053: la aplicación NO expide facturas. Por eso esta migración no crea `facturas`,
-- `factura_lineas`, `series_facturacion`, `gastos` ni `registro_eventos_sif`: eso es del
-- programa externo que expide. Aquí solo hay lo que la app prepara (el borrador) y lo que la consulta registra (tarifas, cobros, bonos).
-- facturas_espejo, el registro de envíos y las anotaciones del programa los crea T-026 (ADR-077)
--
-- Contenido, en el orden de A.2/PA.2:
--   1. comment on type regimen_iva
--   2. enum forma_pago
--   3. privilegios por defecto
--   4. tablas: tarifas_paciente, borradores_factura, borradores_factura_versiones, cobros, bonos
--   5. citas.bono_id y fn_bono_de_la_cita() (D8)
--   6. funciones: fn_sellar_version_borrador(), verificar_cadena_borrador(), fn_cerrar_tarifa()
--   7. vistas: borradores_factura_estado (invoker) y bonos_consumo (definer con barrera)
--   8. disparadores: tres capas en las versiones y en cobros, sellado, auditoría en las cinco
--   9. tablas_solo_adicion: dos filas
--  10. RLS y políticas
--  11. grants


-- =========================================================================
-- 1 · El régimen de IVA se reutiliza (D1): el nombre lo fijaron T-010 y T-031
-- =========================================================================
comment on type public.regimen_iva is
  'Régimen de IVA de una tarifa o de una línea de borrador. exento_sanitario: asistencia '
  'sanitaria exenta por el art. 20.Uno.3.º LIVA. general: tipo general (hoy el 21 %), para lo '
  'pericial o lo que paga una aseguradora sin finalidad asistencial. El porcentaje concreto no '
  'vive en el tipo: cada línea del borrador lo sella en tipo_iva_centesimas (T-021, D4).';


-- =========================================================================
-- 2 · Forma de pago de un cobro
-- =========================================================================
create type public.forma_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'bizum', 'otro');

comment on type public.forma_pago is
  'Cómo se cobró: efectivo, transferencia, tarjeta, bizum u otro (T-021).';


-- =========================================================================
-- 3 · Supabase concede TRUNCATE, TRIGGER y REFERENCES a las tablas nuevas sin pedirlo
-- =========================================================================
alter default privileges in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public revoke all on sequences from anon, authenticated, service_role;


-- =========================================================================
-- 4 · Tablas
-- =========================================================================

-- 4.1 · tarifas_paciente -------------------------------------------------
create table public.tarifas_paciente (
  id               uuid primary key default gen_random_uuid(),
  paciente_id      uuid not null references public.pacientes (id),
  tipo_terapia_id  uuid not null references public.tipos_terapia (id),
  importe          numeric(12, 2) not null,
  regimen_iva      public.regimen_iva not null,
  vigente_desde    date not null,
  vigente_hasta    date,
  creada_por       uuid not null references public.perfiles (id),
  creada_en        timestamptz not null default now(),
  constraint tarifas_paciente_importe_ck check (importe > 0),
  constraint tarifas_paciente_vigencia_ck check (vigente_hasta is null or vigente_hasta > vigente_desde),
  constraint tarifas_paciente_sin_solape
    exclude using gist (
      paciente_id extensions.gist_uuid_ops with =,
      tipo_terapia_id extensions.gist_uuid_ops with =,
      daterange(vigente_desde, vigente_hasta, '[)') with &&
    )
);

alter table public.tarifas_paciente enable row level security;

comment on table public.tarifas_paciente is
  'Precio pactado con un paciente para un tipo de terapia, con vigencia [desde, hasta). Dos '
  'tarifas vigentes del mismo paciente y tipo no se solapan (exclusión). Cambiar el precio es '
  'cerrar la vigente (vigente_hasta, una sola vez: fn_cerrar_tarifa) y dar de alta otra (T-021).';
comment on column public.tarifas_paciente.importe is
  'Precio por sesión CON IVA, en euros: el precio que se teclea es el final (lib/dinero/iva.ts).';
comment on column public.tarifas_paciente.regimen_iva is
  'Sin valor por defecto: lo marca el usuario al dar de alta la tarifa (ADR-053 j).';

-- 4.2 · borradores_factura (cabecera) ------------------------------------
create table public.borradores_factura (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references public.pacientes (id),
  profesional_id  uuid not null references public.perfiles (id),
  creado_por      uuid not null references public.perfiles (id),
  creado_en       timestamptz not null default now()
);

alter table public.borradores_factura enable row level security;

comment on table public.borradores_factura is
  'Cabecera de un borrador de factura: de qué paciente y de qué profesional. No tiene columnas '
  'modificables (nadie tiene update): todo lo que cambia es una versión nueva en '
  'borradores_factura_versiones. La app prepara el borrador; expide el programa externo (ADR-053).';

-- 4.3 · borradores_factura_versiones (solo adición, cadena de huellas) ---
create table public.borradores_factura_versiones (
  id                              uuid primary key default gen_random_uuid(),
  borrador_id                     uuid not null references public.borradores_factura (id),
  numero_version                  integer not null,
  huella                          bytea not null unique,
  huella_anterior                 bytea not null,
  algoritmo_version               smallint not null,
  contenido_canonico              text not null,
  paciente_id                     uuid not null references public.pacientes (id),
  profesional_id                  uuid not null references public.perfiles (id),
  centro_id                       uuid references public.centros (id),
  destinatario_nombre             text not null,
  destinatario_nif_cifrado        bytea,
  destinatario_nif_nonce          bytea,
  destinatario_nif_etiqueta       bytea,
  destinatario_nif_clave_version  smallint,
  lineas                          jsonb not null,
  base                            numeric(12, 2) not null,
  cuota_iva                       numeric(12, 2) not null,
  total                           numeric(12, 2) not null,
  descartado                      boolean not null default false,
  creada_por                      uuid not null references public.perfiles (id),
  creada_en                       timestamptz not null default now(),
  constraint borradores_factura_versiones_numero_uq unique (borrador_id, numero_version),
  constraint borradores_factura_versiones_nif_ck check (
    num_nonnulls(destinatario_nif_cifrado, destinatario_nif_nonce,
                 destinatario_nif_etiqueta, destinatario_nif_clave_version) in (0, 4)),
  constraint borradores_factura_versiones_nonce_ck check (
    destinatario_nif_nonce is null or octet_length(destinatario_nif_nonce) = 12),
  constraint borradores_factura_versiones_etiqueta_ck check (
    destinatario_nif_etiqueta is null or octet_length(destinatario_nif_etiqueta) = 16),
  constraint borradores_factura_versiones_clave_ck check (
    destinatario_nif_clave_version is null or destinatario_nif_clave_version = 1),
  constraint borradores_factura_versiones_lineas_ck check (
    jsonb_typeof(lineas) = 'array' and jsonb_array_length(lineas) >= 1),
  constraint borradores_factura_versiones_importes_ck check (base + cuota_iva = total)
);

alter table public.borradores_factura_versiones enable row level security;

comment on table public.borradores_factura_versiones is
  'Cada versión de un borrador de factura, de solo adición y encadenada por huella SHA-256 a la '
  'anterior DEL MISMO borrador (cadena hermana de la de la nota, D5). Lo que el llamante no '
  'elige —huella, huella_anterior, numero_version, paciente_id, profesional_id— lo fija '
  'fn_sellar_version_borrador(); se verifica con verificar_cadena_borrador(). Se conserva por '
  'el art. 29.2.j LGT (ADR-053 h).';
comment on column public.borradores_factura_versiones.contenido_canonico is
  'El sobre sellado: quince claves exactas, con los importes en céntimos enteros. La huella se '
  'calcula sobre estos bytes; se recorta de auditoria porque lleva el NIF cifrado dentro (D2).';
comment on column public.borradores_factura_versiones.lineas is
  'Lista de líneas, cada una con exactamente concepto, cantidad (entero >= 1), '
  'precio_unitario_centimos, regimen_iva, tipo_iva_centesimas y cita_id (uuid o null). '
  'concepto: texto de factura, nunca clínico (ADR-053 i). precio_unitario_centimos: precio por '
  'unidad CON IVA, en céntimos. tipo_iva_centesimas: el porcentaje sellado en la línea '
  '(2100 = 21 %, 0 si exento), porque el tipo cambia por ley y el borrador no (D4).';
comment on column public.borradores_factura_versiones.total is
  'Total CON IVA, en euros (base + cuota_iva). En el sobre va en céntimos (total_centimos).';
comment on column public.borradores_factura_versiones.destinatario_nif_cifrado is
  'NIF del destinatario cifrado con AES-GCM (lib/cifrado). Las cuatro columnas del NIF van '
  'todas o ninguna: un particular no siempre da NIF (D3).';
comment on column public.borradores_factura_versiones.descartado is
  'La versión que descarta el borrador: si es la última, borradores_factura_estado dice descartado (P2).';

-- 4.4 · cobros (solo adición) --------------------------------------------
create table public.cobros (
  id              uuid primary key default gen_random_uuid(),
  paciente_id     uuid not null references public.pacientes (id),
  importe         numeric(12, 2) not null,
  fecha           date not null,
  forma_pago      public.forma_pago not null,
  referencia      text,
  registrado_por  uuid not null references public.perfiles (id),
  registrado_en   timestamptz not null default now(),
  constraint cobros_importe_ck check (importe <> 0)
);

alter table public.cobros enable row level security;

comment on table public.cobros is
  'Dinero recibido de un paciente, de solo adición (ADR-053 g). Cobrar antes de facturar es el '
  'caso normal. Un error se corrige con un cobro de signo contrario, nunca con un UPDATE. El '
  'enlace a la factura lo añade T-026 (ADR-077).';
comment on column public.cobros.importe is
  'Importe cobrado CON IVA, en euros. Negativo es una devolución; cero no es un cobro.';

-- 4.5 · bonos ------------------------------------------------------------
create table public.bonos (
  id                uuid primary key default gen_random_uuid(),
  paciente_id       uuid not null references public.pacientes (id),
  sesiones_totales  integer not null,
  importe           numeric(12, 2) not null,
  caducidad         date,
  creado_por        uuid not null references public.perfiles (id),
  creado_en         timestamptz not null default now(),
  constraint bonos_sesiones_ck check (sesiones_totales > 0),
  constraint bonos_importe_ck check (importe > 0)
);

alter table public.bonos enable row level security;

comment on table public.bonos is
  'Bono de N sesiones de un paciente. Las sesiones consumidas NO se almacenan: las cuenta '
  'bonos_consumo a partir de las citas realizadas con ese bono (T-021, §5). Solo la caducidad '
  'es modificable.';
comment on column public.bonos.importe is
  'Precio del bono CON IVA, en euros.';


-- =========================================================================
-- 5 · citas.bono_id (D8)
-- =========================================================================
alter table public.citas add column bono_id uuid references public.bonos (id);

comment on column public.citas.bono_id is
  'Bono del que descuenta esta cita cuando se realiza (T-021, D8). Debe ser del mismo paciente '
  '(fn_bono_de_la_cita). Cambiarlo en una cita pasada es corregir un cobro, y queda en auditoria.';

-- T-039: una columna nueva de citas nace cerrada a authenticated; esta se escribe a mano.
grant update (bono_id) on public.citas to authenticated;

create function public.fn_bono_de_la_cita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente_bono uuid;
begin
  if new.bono_id is not null then
    select b.paciente_id into v_paciente_bono from public.bonos b where b.id = new.bono_id;
    -- Un bono que no existe lo rechaza la clave ajena (23503).
    if found and v_paciente_bono is distinct from new.paciente_id then
      raise exception 'La cita no puede descontar de ese bono: el bono es de otro paciente (T-021, D8)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.fn_bono_de_la_cita() is
  'Disparador before insert or update of bono_id, paciente_id sobre citas: el bono de una cita '
  'es del mismo paciente que la cita, o 23514 (T-021, D8). security definer para ver el bono '
  'aunque la RLS de bonos no lo enseñe a quien edita la cita.';

revoke execute on function public.fn_bono_de_la_cita() from public;

create trigger bono_de_la_cita
  before insert or update of bono_id, paciente_id on public.citas
  for each row execute function public.fn_bono_de_la_cita();


-- =========================================================================
-- 6 · Funciones
-- =========================================================================

-- 6.1 · fn_sellar_version_borrador(): la hermana de fn_sellar_version_nota() (D5) ------
create function public.fn_sellar_version_borrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente_id     uuid;
  v_profesional_id  uuid;
  v_huella_prev     bytea;
  v_num             integer;
  v_contenido       jsonb;
  v_sobre           json;
  v_claves          text[];
  v_esperadas       constant text[] := array[
    'base_centimos', 'borrador_id', 'centro_id', 'creada_en', 'creada_por',
    'cuota_iva_centimos', 'descartado', 'destinatario_nif', 'destinatario_nombre',
    'esquema_version', 'lineas', 'numero_version', 'paciente_id', 'profesional_id',
    'total_centimos'
  ];
  v_claves_linea    constant text[] := array[
    'cantidad', 'cita_id', 'concepto', 'precio_unitario_centimos', 'regimen_iva',
    'tipo_iva_centesimas'
  ];
  v_nif_esperado    jsonb;
  v_linea           json;
  v_claves_l        text[];
  v_cantidad        numeric;
  v_precio          numeric;
  v_tipo_iva        numeric;
  v_cita_id         uuid;
  v_cita_paciente   uuid;
  v_suma            numeric := 0;
  v_todo_exento     boolean := true;
begin
  -- 0 · Permisos antes que cotejo (ADR-071.5, .claude/rules/supabase.md). Misma condición que
  -- la política borradores_factura_versiones_alta. Todo lo que sigue lee la cabecera saltándose
  -- la RLS y lanza errores que dependen de ella; sin este paso, el orden de los errores diría a
  -- quien no puede escribir si el borrador existe y de quién es. Un único 42501, sea cual sea el
  -- sobre. postgres y service_role no pasan por la RLS y tampoco por aquí.
  if current_setting('role', true) in ('authenticated', 'anon') then
    if not coalesce(
         (select public.rol_actual()) = 'administrador'::public.rol_usuario
         or exists (select 1 from public.borradores_factura b
                     where b.id = new.borrador_id
                       and b.profesional_id = (select auth.uid())
                       and public.es_profesional_asignado(b.paciente_id)),
         false) then
      raise exception 'No puedes añadir una versión a este borrador: la añade el administrador o su profesional, asignado al paciente (T-021)'
        using errcode = '42501';
    end if;
  end if;

  -- 1 · La cadena no se escribe por aplicación: quien crea haberla escrito tiene que enterarse.
  if new.huella is not null or new.huella_anterior is not null
     or new.numero_version is not null or new.paciente_id is not null
     or new.profesional_id is not null then
    raise exception
      'huella, huella_anterior, numero_version, paciente_id y profesional_id los calcula '
      'fn_sellar_version_borrador(): no se pueden mandar en el INSERT (T-021)'
      using errcode = '42501';
  end if;

  -- 1.bis · La era del algoritmo la abre una migración, no un INSERT.
  if new.algoritmo_version is distinct from 1 then
    raise exception
      'algoritmo_version del borrador la fija la era vigente de su cadena (hoy 1) y la abre una '
      'migración, no un INSERT (T-021)'
      using errcode = '42501';
  end if;

  -- 2 · La cabecera dice paciente y profesional. `for no key update`: dos versiones
  -- concurrentes del mismo borrador se ordenan aquí.
  select b.paciente_id, b.profesional_id
    into strict v_paciente_id, v_profesional_id
    from public.borradores_factura b
   where b.id = new.borrador_id
     for no key update;

  -- 3 · Serialización por borrador, antes de leer el eslabón anterior.
  perform pg_advisory_xact_lock(hashtextextended('cadena_borrador:' || new.borrador_id::text, 0));

  -- 4 · El último eslabón de ESTE borrador.
  select v.huella, v.numero_version
    into v_huella_prev, v_num
    from public.borradores_factura_versiones v
   where v.borrador_id = new.borrador_id
   order by v.numero_version desc
   limit 1;

  -- 5 · Encadenado: 32 bytes cero en el primer eslabón.
  new.paciente_id     := v_paciente_id;
  new.profesional_id  := v_profesional_id;
  new.huella_anterior := coalesce(v_huella_prev, decode(repeat('00', 32), 'hex'));
  new.numero_version  := coalesce(v_num, 0) + 1;

  -- 6 · Coherencia sobre–fila (23514), para todos los roles. Como en la nota, se comparan
  -- VALORES, no la forma byte a byte del texto: el verificador lee los bytes guardados.
  v_contenido := new.contenido_canonico::jsonb;

  -- 6.1 · Objeto con EXACTAMENTE las quince claves, sin repetidas: `json_object_keys`
  -- sobre json, nunca `jsonb_object_keys` (jsonb deduplica al parsear).
  if v_contenido is null or jsonb_typeof(v_contenido) <> 'object' then
    raise exception 'El sobre del borrador (contenido_canonico) debe ser un objeto JSON, no un %',
      coalesce(jsonb_typeof(v_contenido), 'nulo')
      using errcode = '23514';
  end if;
  v_sobre := new.contenido_canonico::json;
  select array_agg(k order by k) into v_claves from json_object_keys(v_sobre) as k;
  if v_claves is distinct from v_esperadas then
    raise exception 'El sobre del borrador debe tener exactamente las quince claves %, ni una más ni una menos, ni repetidas (T-021)',
      v_esperadas
      using errcode = '23514';
  end if;

  -- 6.2 · Cada clave contra su columna o contra la cabecera, con `is distinct from` sobre el
  -- valor JSONB completo (tipo incluido). Un fragmento de mensaje propio por clave.
  if (v_contenido -> 'esquema_version') is distinct from '1'::jsonb then
    raise exception 'El esquema_version del sobre del borrador no es 1 (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'borrador_id') is distinct from to_jsonb(new.borrador_id::text) then
    raise exception 'El borrador_id del sobre no es el de la fila (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'numero_version') is distinct from to_jsonb(new.numero_version) then
    raise exception 'El numero_version del sobre no es el que asigna la base (máximo + 1) (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'paciente_id') is distinct from to_jsonb(v_paciente_id::text) then
    raise exception 'El paciente_id del sobre no es el de la cabecera del borrador (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'profesional_id') is distinct from to_jsonb(v_profesional_id::text) then
    raise exception 'El profesional_id del sobre no es el de la cabecera del borrador (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'centro_id') is distinct from coalesce(to_jsonb(new.centro_id::text), 'null'::jsonb) then
    raise exception 'El centro_id del sobre no coincide con la columna (null si la columna es nula) (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'destinatario_nombre') is distinct from to_jsonb(new.destinatario_nombre) then
    raise exception 'El destinatario_nombre del sobre no coincide con la columna (T-021)'
      using errcode = '23514';
  end if;
  if num_nonnulls(new.destinatario_nif_cifrado, new.destinatario_nif_nonce,
                  new.destinatario_nif_etiqueta, new.destinatario_nif_clave_version) = 0 then
    v_nif_esperado := 'null'::jsonb;
  else
    v_nif_esperado := jsonb_build_object(
      'cifrado',       translate(encode(new.destinatario_nif_cifrado, 'base64'), E'\n', ''),
      'clave_version', new.destinatario_nif_clave_version,
      'etiqueta',      translate(encode(new.destinatario_nif_etiqueta, 'base64'), E'\n', ''),
      'nonce',         translate(encode(new.destinatario_nif_nonce, 'base64'), E'\n', ''));
  end if;
  if (v_contenido -> 'destinatario_nif') is distinct from v_nif_esperado then
    raise exception 'El destinatario_nif del sobre no coincide con las cuatro columnas del NIF (objeto en base64, o null) (T-021, D3)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'lineas') is distinct from new.lineas then
    raise exception 'Las lineas del sobre no son jsonb-equivalentes a la columna lineas (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'base_centimos') is distinct from to_jsonb((new.base * 100)::bigint) then
    raise exception 'El base_centimos del sobre no es la columna base en céntimos (T-021, D4)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'cuota_iva_centimos') is distinct from to_jsonb((new.cuota_iva * 100)::bigint) then
    raise exception 'El cuota_iva_centimos del sobre no es la columna cuota_iva en céntimos (T-021, D4)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'total_centimos') is distinct from to_jsonb((new.total * 100)::bigint) then
    raise exception 'El total_centimos del sobre no es la columna total en céntimos (T-021, D4)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'descartado') is distinct from to_jsonb(new.descartado) then
    raise exception 'El descartado del sobre no coincide con la columna (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'creada_por') is distinct from to_jsonb(new.creada_por::text) then
    raise exception 'El creada_por del sobre no coincide con la columna (T-021)'
      using errcode = '23514';
  end if;
  if (v_contenido -> 'creada_en') is distinct from
     to_jsonb(to_char(new.creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) then
    raise exception 'El creada_en del sobre no es la columna creada_en en ISO UTC con milisegundos (T-021)'
      using errcode = '23514';
  end if;

  -- 6.3 · Cada línea, leída del sobre como json (las claves repetidas no se pierden).
  if json_typeof(v_sobre -> 'lineas') is distinct from 'array' then
    raise exception 'Las líneas del borrador deben ser una lista (T-021)'
      using errcode = '23514';
  end if;
  for v_linea in select e from json_array_elements(v_sobre -> 'lineas') as e loop
    v_claves_l := null;
    if json_typeof(v_linea) = 'object' then
      select array_agg(k order by k) into v_claves_l from json_object_keys(v_linea) as k;
    end if;
    if v_claves_l is distinct from v_claves_linea then
      raise exception 'Cada línea del borrador debe tener exactamente las claves %, ni una más ni una menos, ni repetidas (T-021)',
        v_claves_linea
        using errcode = '23514';
    end if;

    if json_typeof(v_linea -> 'concepto') is distinct from 'string'
       or length(trim(v_linea ->> 'concepto')) = 0 then
      raise exception 'El concepto de una línea debe ser un texto no vacío (T-021)'
        using errcode = '23514';
    end if;

    if json_typeof(v_linea -> 'cantidad') is distinct from 'number' then
      raise exception 'La cantidad de una línea debe ser un entero mayor o igual que 1 (T-021)'
        using errcode = '23514';
    end if;
    v_cantidad := (v_linea ->> 'cantidad')::numeric;
    if v_cantidad <> trunc(v_cantidad) or v_cantidad < 1 then
      raise exception 'La cantidad de una línea debe ser un entero mayor o igual que 1 (T-021)'
        using errcode = '23514';
    end if;

    if json_typeof(v_linea -> 'precio_unitario_centimos') is distinct from 'number' then
      raise exception 'El precio_unitario_centimos de una línea debe ser un entero de céntimos (T-021)'
        using errcode = '23514';
    end if;
    v_precio := (v_linea ->> 'precio_unitario_centimos')::numeric;
    if v_precio <> trunc(v_precio) then
      raise exception 'El precio_unitario_centimos de una línea debe ser un entero de céntimos (T-021)'
        using errcode = '23514';
    end if;

    if json_typeof(v_linea -> 'regimen_iva') is distinct from 'string'
       or not ((v_linea ->> 'regimen_iva') = any (enum_range(null::public.regimen_iva)::text[])) then
      raise exception 'El regimen_iva de una línea debe ser un valor de regimen_iva (T-021)'
        using errcode = '23514';
    end if;

    if json_typeof(v_linea -> 'tipo_iva_centesimas') is distinct from 'number' then
      raise exception 'El tipo_iva_centesimas de una línea debe ser un entero mayor o igual que 0 (T-021, D4)'
        using errcode = '23514';
    end if;
    v_tipo_iva := (v_linea ->> 'tipo_iva_centesimas')::numeric;
    if v_tipo_iva <> trunc(v_tipo_iva) or v_tipo_iva < 0 then
      raise exception 'El tipo_iva_centesimas de una línea debe ser un entero mayor o igual que 0 (T-021, D4)'
        using errcode = '23514';
    end if;

    if json_typeof(v_linea -> 'cita_id') = 'null' then
      v_cita_id := null;
    elsif json_typeof(v_linea -> 'cita_id') = 'string'
          and pg_input_is_valid(v_linea ->> 'cita_id', 'uuid') then
      v_cita_id := (v_linea ->> 'cita_id')::uuid;
    else
      raise exception 'El cita_id de una línea debe ser un uuid o null (T-021)'
        using errcode = '23514';
    end if;
    if v_cita_id is not null then
      v_cita_paciente := null;
      select c.paciente_id into v_cita_paciente from public.citas c where c.id = v_cita_id;
      if v_cita_paciente is distinct from v_paciente_id then
        raise exception 'La cita de una línea no existe o es de otro paciente (T-021)'
          using errcode = '23514';
      end if;
    end if;

    v_suma := v_suma + v_cantidad * v_precio;
    if (v_linea ->> 'regimen_iva') <> 'exento_sanitario' then
      v_todo_exento := false;
    end if;
  end loop;

  -- 6.4 · Los importes cuadran con las líneas (precios CON IVA).
  if v_suma <> new.total * 100 then
    raise exception 'La suma de cantidad por precio_unitario_centimos de las líneas no es el total (T-021, D4)'
      using errcode = '23514';
  end if;
  if v_todo_exento and new.cuota_iva <> 0 then
    raise exception 'Si todas las líneas son exento_sanitario, la cuota de IVA es 0 (art. 20.Uno.3.º LIVA) (T-021)'
      using errcode = '23514';
  end if;

  -- 6.5 · Solo para authenticated y anon: la autoría es de quien inserta y la fecha, del reloj
  -- de la base (postgres puede fechar una fijación en el pasado).
  if current_setting('role', true) in ('authenticated', 'anon') then
    if new.creada_por is distinct from (select auth.uid()) then
      raise exception 'El creada_por de la versión debe ser quien la inserta (T-021)'
        using errcode = '23514';
    end if;
    if new.creada_en not between now() - interval '1 minute' and now() + interval '1 minute' then
      raise exception 'El creada_en de la versión se aparta más de un minuto del reloj de la base (T-021)'
        using errcode = '23514';
    end if;
  end if;

  -- 7 · Una sola implementación del SHA-256: pgcrypto.
  new.huella := extensions.digest(
    convert_to(new.contenido_canonico, 'UTF8') || new.huella_anterior,
    'sha256'
  );

  return new;
end;
$$;

comment on function public.fn_sellar_version_borrador() is
  'Disparador before insert sobre borradores_factura_versiones (T-021, D5). Paso 0: permisos '
  '(42501 único). Paso 1: el llamante no manda huella, huella_anterior, numero_version, '
  'paciente_id ni profesional_id. Paso 1.bis: algoritmo_version = 1. Pasos 2-5: cabecera con '
  'for no key update, cerrojo consultivo por borrador, numero_version = máximo + 1, génesis de 32 '
  'bytes cero. Paso 6: sobre de quince claves cotejado con la fila y la cabecera, líneas de seis '
  'claves, suma de líneas = total, todo exento implica cuota 0, citas del mismo paciente (23514). '
  'Paso 7: huella = SHA-256(sobre || huella_anterior).';

revoke execute on function public.fn_sellar_version_borrador() from public;

-- 6.2 · verificar_cadena_borrador(): la hermana de verificar_cadena_huellas() ----------
create function public.verificar_cadena_borrador(p_borrador_id uuid default null)
returns table (borrador_id uuid, numero_version integer, version_id uuid, creada_en timestamptz, motivo text)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select
      v.borrador_id,
      v.numero_version,
      v.id as version_id,
      v.creada_en,
      v.huella,
      v.huella_anterior,
      v.contenido_canonico,
      v.algoritmo_version,
      lag(v.huella) over (partition by v.borrador_id order by v.numero_version)         as huella_prev_real,
      lag(v.numero_version) over (partition by v.borrador_id order by v.numero_version) as numero_prev,
      v.paciente_id,
      v.profesional_id,
      v.centro_id,
      v.destinatario_nombre,
      case when num_nonnulls(v.destinatario_nif_cifrado, v.destinatario_nif_nonce,
                             v.destinatario_nif_etiqueta, v.destinatario_nif_clave_version) = 0
           then 'null'::jsonb
           else jsonb_build_object(
                  'cifrado',       translate(encode(v.destinatario_nif_cifrado, 'base64'), E'\n', ''),
                  'clave_version', v.destinatario_nif_clave_version,
                  'etiqueta',      translate(encode(v.destinatario_nif_etiqueta, 'base64'), E'\n', ''),
                  'nonce',         translate(encode(v.destinatario_nif_nonce, 'base64'), E'\n', ''))
      end                                                                                as nif_esperado,
      v.lineas,
      v.base,
      v.cuota_iva,
      v.total,
      v.descartado,
      v.creada_por,
      case when pg_input_is_valid(v.contenido_canonico, 'jsonb')
           then v.contenido_canonico::jsonb end                                          as sobre,
      to_jsonb(to_char(v.creada_en at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))                                 as creada_en_iso,
      b.paciente_id    as cab_paciente_id,
      b.profesional_id as cab_profesional_id
    from public.borradores_factura_versiones v
    left join public.borradores_factura b on b.id = v.borrador_id
    where p_borrador_id is null or v.borrador_id = p_borrador_id
  )
  -- era_desconocida: no se verifica, se declara (la impide elegir el paso 1.bis del sellado).
  select c.borrador_id, c.numero_version, c.version_id, c.creada_en, 'era_desconocida'::text as motivo
    from c
   where c.algoritmo_version <> 1

  union all

  select c.borrador_id, c.numero_version, c.version_id, c.creada_en, 'huella_no_coincide'::text
    from c
   where c.algoritmo_version = 1
     and extensions.digest(convert_to(c.contenido_canonico, 'UTF8') || c.huella_anterior, 'sha256')
         <> c.huella

  union all

  select c.borrador_id, c.numero_version, c.version_id, c.creada_en, 'genesis_incorrecto'::text
    from c
   where c.algoritmo_version = 1
     and c.numero_prev is null
     and c.numero_version = 1
     and c.huella_anterior <> decode(repeat('00', 32), 'hex')

  union all

  select c.borrador_id, c.numero_version, c.version_id, c.creada_en, 'hueco_de_posicion'::text
    from c
   where c.algoritmo_version = 1
     and (
       (c.numero_prev is null and c.numero_version <> 1)
       or (c.numero_prev is not null and c.numero_version <> c.numero_prev + 1)
     )

  union all

  select c.borrador_id, c.numero_version, c.version_id, c.creada_en, 'eslabon_desencadenado'::text
    from c
   where c.algoritmo_version = 1
     and c.numero_prev is not null
     and c.numero_version = c.numero_prev + 1
     and c.huella_anterior <> c.huella_prev_real

  union all

  -- sobre_no_coincide_con_fila: cada clave sellada contra su columna y contra la cabecera,
  -- con la misma semántica que el paso 6 del sellado. Sin cabecera, los cab_* son null y la
  -- versión se señala.
  select c.borrador_id, c.numero_version, c.version_id, c.creada_en, 'sobre_no_coincide_con_fila'::text
    from c
   where c.algoritmo_version = 1
     and (
          c.sobre is null
       or jsonb_typeof(c.sobre) <> 'object'
       or (c.sobre -> 'esquema_version')     is distinct from '1'::jsonb
       or (c.sobre -> 'borrador_id')         is distinct from to_jsonb(c.borrador_id::text)
       or (c.sobre -> 'numero_version')      is distinct from to_jsonb(c.numero_version)
       or (c.sobre -> 'paciente_id')         is distinct from to_jsonb(c.paciente_id::text)
       or (c.sobre -> 'paciente_id')         is distinct from to_jsonb(c.cab_paciente_id::text)
       or (c.sobre -> 'profesional_id')      is distinct from to_jsonb(c.profesional_id::text)
       or (c.sobre -> 'profesional_id')      is distinct from to_jsonb(c.cab_profesional_id::text)
       or (c.sobre -> 'centro_id')           is distinct from coalesce(to_jsonb(c.centro_id::text), 'null'::jsonb)
       or (c.sobre -> 'destinatario_nombre') is distinct from to_jsonb(c.destinatario_nombre)
       or (c.sobre -> 'destinatario_nif')    is distinct from c.nif_esperado
       or (c.sobre -> 'lineas')              is distinct from c.lineas
       or (c.sobre -> 'base_centimos')       is distinct from to_jsonb((c.base * 100)::bigint)
       or (c.sobre -> 'cuota_iva_centimos')  is distinct from to_jsonb((c.cuota_iva * 100)::bigint)
       or (c.sobre -> 'total_centimos')      is distinct from to_jsonb((c.total * 100)::bigint)
       or (c.sobre -> 'descartado')          is distinct from to_jsonb(c.descartado)
       or (c.sobre -> 'creada_por')          is distinct from to_jsonb(c.creada_por::text)
       or (c.sobre -> 'creada_en')           is distinct from c.creada_en_iso
     )

  order by 1, 2, 5;
$$;

comment on function public.verificar_cadena_borrador(uuid) is
  'Verifica la cadena de huellas de las versiones de un borrador (o de todos, sin argumento). '
  'Devuelve una fila por anomalía: era_desconocida, huella_no_coincide, genesis_incorrecto, '
  'hueco_de_posicion, eslabon_desencadenado o sobre_no_coincide_con_fila; cero filas es una '
  'cadena sana. Lee los bytes guardados, nunca los reserializa (ADR-035). No la ejecuta '
  'authenticated (T-021, D14).';

revoke all on function public.verificar_cadena_borrador(uuid) from public, anon, authenticated;

-- 6.3 · fn_cerrar_tarifa() -------------------------------------------------
create function public.fn_cerrar_tarifa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.vigente_hasta is not null then
    raise exception 'Esta tarifa ya cerrada no se vuelve a cerrar ni se reabre: se da de alta una tarifa nueva (T-021)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.fn_cerrar_tarifa() is
  'Disparador before update sobre tarifas_paciente: vigente_hasta (la única columna con update) '
  'se fija una sola vez; una tarifa ya cerrada da 42501 (T-021).';

revoke execute on function public.fn_cerrar_tarifa() from public;


-- =========================================================================
-- 7 · Vistas
-- =========================================================================

-- 7.1 · borradores_factura_estado: invoker, ve lo que la RLS de cabecera y versiones deja ver.
-- `estado` es text y las columnas van en este orden para que T-026 la amplíe con
-- `create or replace view` (PA.2).
create view public.borradores_factura_estado
  with (security_invoker = true)
as
select b.id                                                   as borrador_id,
       u.numero_version                                       as ultima_version,
       (case when u.descartado then 'descartado' else 'sin_enviar' end)::text as estado
  from public.borradores_factura b
  left join lateral (
    select v.numero_version, v.descartado
      from public.borradores_factura_versiones v
     where v.borrador_id = b.id
     order by v.numero_version desc
     limit 1
  ) u on true;

comment on view public.borradores_factura_estado is
  'Estado de cada borrador según su última versión: descartado si esa versión lo descarta; si '
  'no, sin_enviar. enviado y facturado los añade T-026 (ADR-077). security_invoker: cada rol ve '
  'los borradores que le deja ver la RLS.';

-- 7.2 · bonos_consumo: definer con barrera, porque el técnico no lee citas. El `where` repite
-- EXACTAMENTE la política bonos_lectura: es la puerta lateral de este ticket (A.4.2).
create view public.bonos_consumo
  with (security_invoker = false, security_barrier = true)
as
select b.id               as bono_id,
       b.paciente_id,
       b.sesiones_totales,
       (select count(*)::integer
          from public.citas c
         where c.bono_id = b.id
           and c.estado = 'realizada'::public.estado_cita) as sesiones_consumidas
  from public.bonos b
 where (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(b.paciente_id)
    or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and b.paciente_id in (
          select p.id from public.pacientes p
           where p.centro_id in (select public.centros_actuales())
        ));

comment on view public.bonos_consumo is
  'Sesiones consumidas de cada bono = citas realizadas con ese bono; se deriva, no se almacena '
  '(T-021, §5). Definer con security_barrier porque el técnico no lee citas; el where repite la '
  'política bonos_lectura. No expone citas ni líneas: solo bono_id, paciente_id, '
  'sesiones_totales y sesiones_consumidas.';


-- =========================================================================
-- 8 · Disparadores
-- =========================================================================

-- 8.1 · Sellado de la versión.
create trigger sellar_version_borrador
  before insert on public.borradores_factura_versiones
  for each row execute function public.fn_sellar_version_borrador();

-- 8.2 · Capas 2 y 3 de solo adición (T-004), con la función genérica.
create trigger impedir_modificacion_borradores_factura_versiones
  before update or delete on public.borradores_factura_versiones
  for each row execute function public.fn_impedir_modificacion();

create trigger impedir_truncado_borradores_factura_versiones
  before truncate on public.borradores_factura_versiones
  for each statement execute function public.fn_impedir_modificacion();

create trigger impedir_modificacion_cobros
  before update or delete on public.cobros
  for each row execute function public.fn_impedir_modificacion();

create trigger impedir_truncado_cobros
  before truncate on public.cobros
  for each statement execute function public.fn_impedir_modificacion();

-- 8.3 · Cierre de tarifa.
create trigger cerrar_tarifa
  before update on public.tarifas_paciente
  for each row execute function public.fn_cerrar_tarifa();

-- 8.4 · Auditoría en las cinco tablas (D2). En las versiones se recorta el NIF cifrado, su
-- nonce, su etiqueta y el sobre (que los lleva dentro); la versión de clave se queda.
create trigger auditar_tarifas_paciente
  after insert or update or delete on public.tarifas_paciente
  for each row execute function public.fn_auditar('id');

create trigger auditar_borradores_factura
  after insert or update or delete on public.borradores_factura
  for each row execute function public.fn_auditar('id');

create trigger auditar_borradores_factura_versiones
  after insert or update or delete on public.borradores_factura_versiones
  for each row execute function public.fn_auditar('id', 'destinatario_nif_cifrado',
    'destinatario_nif_nonce', 'destinatario_nif_etiqueta', 'contenido_canonico');

create trigger auditar_cobros
  after insert or update or delete on public.cobros
  for each row execute function public.fn_auditar('id');

create trigger auditar_bonos
  after insert or update or delete on public.bonos
  for each row execute function public.fn_auditar('id');


-- =========================================================================
-- 9 · Catálogo de solo adición: lo recorren cobertura_solo_adicion() y 10-solo-adicion
-- =========================================================================
insert into public.tablas_solo_adicion (tabla, motivo) values
  ('borradores_factura_versiones',
   'Cada versión del borrador de factura se conserva y encadena por huella (art. 29.2.j LGT, ADR-053 h).'),
  ('cobros',
   'Lo cobrado no se reescribe: un error se corrige con otro cobro de signo contrario (ADR-053 g).');


-- =========================================================================
-- 10 · RLS y políticas. El rol se compara en positivo: rol_actual() nulo no entra en ninguna rama.
-- =========================================================================

-- 10.1 · tarifas_paciente: administrador o profesional asignado. El técnico, nada.
create policy tarifas_paciente_lectura on public.tarifas_paciente
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

create policy tarifas_paciente_alta on public.tarifas_paciente
  for insert to authenticated
  with check (
    creada_por = (select auth.uid())
    and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
         or public.es_profesional_asignado(paciente_id))
  );

create policy tarifas_paciente_cierre on public.tarifas_paciente
  for update to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  )
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
  );

-- 10.2 · borradores_factura: administrador, o el profesional del borrador.
create policy borradores_factura_lectura on public.borradores_factura
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and profesional_id = (select auth.uid()))
  );

create policy borradores_factura_alta on public.borradores_factura
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and profesional_id = (select auth.uid())
        and public.es_profesional_asignado(paciente_id))
  );

-- 10.3 · borradores_factura_versiones: se leen si la cabecera es legible (el exists corre bajo
-- la RLS de la cabecera); el alta es la condición del paso 0 del sellado.
create policy borradores_factura_versiones_lectura on public.borradores_factura_versiones
  for select to authenticated
  using (
    exists (select 1 from public.borradores_factura b where b.id = borrador_id)
  );

create policy borradores_factura_versiones_alta on public.borradores_factura_versiones
  for insert to authenticated
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or exists (select 1 from public.borradores_factura b
                where b.id = borrador_id
                  and b.profesional_id = (select auth.uid())
                  and public.es_profesional_asignado(b.paciente_id))
  );

-- 10.4 · cobros: administrador, profesional asignado o técnico de su centro.
create policy cobros_lectura on public.cobros
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
    or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and paciente_id in (
          select p.id from public.pacientes p
           where p.centro_id in (select public.centros_actuales())
        ))
  );

create policy cobros_alta on public.cobros
  for insert to authenticated
  with check (
    registrado_por = (select auth.uid())
    and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
         or public.es_profesional_asignado(paciente_id)
         or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
             and paciente_id in (
               select p.id from public.pacientes p
                where p.centro_id in (select public.centros_actuales())
             )))
  );

-- 10.5 · bonos: las tres ramas de cobros.
create policy bonos_lectura on public.bonos
  for select to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
    or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and paciente_id in (
          select p.id from public.pacientes p
           where p.centro_id in (select public.centros_actuales())
        ))
  );

create policy bonos_alta on public.bonos
  for insert to authenticated
  with check (
    creado_por = (select auth.uid())
    and ((select public.rol_actual()) = 'administrador'::public.rol_usuario
         or public.es_profesional_asignado(paciente_id)
         or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
             and paciente_id in (
               select p.id from public.pacientes p
                where p.centro_id in (select public.centros_actuales())
             )))
  );

create policy bonos_modificacion on public.bonos
  for update to authenticated
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
    or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and paciente_id in (
          select p.id from public.pacientes p
           where p.centro_id in (select public.centros_actuales())
        ))
  )
  with check (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or public.es_profesional_asignado(paciente_id)
    or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and paciente_id in (
          select p.id from public.pacientes p
           where p.centro_id in (select public.centros_actuales())
        ))
  );


-- =========================================================================
-- 11 · Grants, después de quitarlo todo
-- =========================================================================
revoke all on table public.tarifas_paciente             from public, anon, authenticated, service_role;
revoke all on table public.borradores_factura           from public, anon, authenticated, service_role;
revoke all on table public.borradores_factura_versiones from public, anon, authenticated, service_role;
revoke all on table public.cobros                       from public, anon, authenticated, service_role;
revoke all on table public.bonos                        from public, anon, authenticated, service_role;
revoke all on table public.borradores_factura_estado    from public, anon, authenticated, service_role;
revoke all on table public.bonos_consumo                from public, anon, authenticated, service_role;

-- Capa 1 de solo adición: ni update, ni delete, ni truncate para nadie, postgres incluido.
revoke update, delete, truncate on table public.borradores_factura_versiones from postgres;
revoke update, delete, truncate on table public.cobros                       from postgres;

grant select, insert on table public.tarifas_paciente to authenticated;
grant update (vigente_hasta) on public.tarifas_paciente to authenticated;
grant select, insert on table public.borradores_factura to authenticated;
grant select, insert on table public.borradores_factura_versiones to authenticated;
grant select, insert on table public.cobros to authenticated;
grant select, insert on table public.bonos to authenticated;
grant update (caducidad) on public.bonos to authenticated;
grant select on table public.borradores_factura_estado to authenticated;
grant select on table public.bonos_consumo to authenticated;
