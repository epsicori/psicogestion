-- =============================================================================
-- T-010 · Dominio Agenda: esquema, auditoría y políticas
--
-- Referencias: docs/architecture.md §Invariante 4 (la serie es la intención, la
-- cita es el hecho), §Invariante 3, §Roles. ADR-034 (hora local en la serie,
-- instante en la cita), ADR-045 (cinco estados, «en curso» calculado), ADR-033,
-- ADR-051. Choques 3 y 4 de docs/interfaz.md. El «Diseño aprobado · 06-09-2026»
-- del propio ticket, cuyas secciones se citan como §N.
--
-- NO dibuja ninguna pantalla y NO materializa ninguna serie: eso es T-011.
-- =============================================================================


-- =========================================================================
-- 1 · btree_gist, en el esquema `extensions` (§0)
--
-- Hace falta para la restricción de exclusión: `tstzrange` ya trae opclase gist
-- en pg_catalog, pero `uuid` con `=` no, y sin ella no se puede combinar «mismo
-- profesional» con «rangos que se solapan» en una sola restricción.
--
-- Va en `extensions` como el resto (pgcrypto, uuid-ossp, pg_net) y la opclase se
-- invoca CUALIFICADA más abajo: con `search_path = ''` no hay visibilidad que
-- valga, y el fallo aparecería al crear la restricción, no al usarla.
-- =========================================================================

create extension if not exists btree_gist with schema extensions;


-- =========================================================================
-- 2 · Enums
--
-- `estado_cita` va en ESTE ORDEN y no en otro: T-020 (otro carril) ya congeló
-- `ESTADOS_CITA` en `lib/agenda/estados-cita.ts` con el comentario «ese orden es
-- el contrato con T-010». Cambiarlo aquí rompe algo que se cerró antes.
--
-- CINCO valores, ni uno más (ADR-045): `en_curso` NO EXISTE como estado guardado.
-- Se calcula con el reloj, y persistirlo desincronizaría la fila con la hora.
-- =========================================================================

create type public.estado_cita as enum (
  'programada',
  'confirmada',
  'realizada',
  'cancelada',
  'no_asistida'
);

create type public.periodicidad_serie as enum ('semanal', 'quincenal', 'mensual');

create type public.motivo_desviacion_cita as enum (
  'reprogramada',
  'anomalia_horaria',
  'festivo',
  'ausencia'
);

create type public.tipo_disponibilidad as enum ('franja', 'ausencia', 'festivo');

-- Dos valores, y el tipo impositivo NO va dentro del nombre: lo sanitario está
-- exento (art. 20.1.3.º LIVA) y lo pericial no. El 21 % lo cambia una ley y un
-- enum no se migra por eso; el porcentaje es dato de facturación (T-021).
create type public.regimen_iva as enum ('exento_sanitario', 'general');


-- =========================================================================
-- 3 · El descanso entre sesiones vive en `perfiles`
-- =========================================================================

alter table public.perfiles
  add column descanso_activo  boolean  not null default true,
  add column descanso_minutos smallint not null default 10;

alter table public.perfiles
  add constraint perfiles_descanso_minutos_ck check (descanso_minutos between 5 and 20);

comment on column public.perfiles.descanso_activo is
  'NO ES DESCANSO: es el tiempo de escribir la nota clínica. T-012 la hace '
  'obligatoria y su ausencia dispara alertas_documentacion (T-015). Encadenar seis '
  'sesiones sin hueco es exactamente cómo se acumula la deuda documental que el '
  'producto persigue, y por eso viene ACTIVO por defecto en vez de apagado.';

comment on column public.perfiles.descanso_minutos is
  'Minutos que se reservan DETRÁS de cada cita de este profesional, dentro de '
  'citas.rango_bloqueante. Entre 5 y 20. Cambiarlo NO mueve ninguna cita ya '
  'creada: el rango queda congelado (ver fn_calcular_rango_bloqueante).';


-- =========================================================================
-- 4 · tipos_terapia
--
-- El color es del TIPO. La franja de color que identifica al profesional en el
-- calendario sale de `perfiles`, no de aquí: son dos ejes distintos y mezclarlos
-- deja la agenda sin poder distinguir «qué es» de «de quién es».
-- =========================================================================

create table public.tipos_terapia (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  duracion_minutos  smallint not null default 50,
  tarifa_base       numeric(10, 2),
  regimen           public.regimen_iva not null default 'exento_sanitario',
  color             text,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  creado_por        uuid references public.perfiles (id),
  constraint tipos_terapia_nombre_ck    check (length(trim(nombre)) > 0),
  constraint tipos_terapia_duracion_ck  check (duracion_minutos between 5 and 480),
  constraint tipos_terapia_tarifa_ck    check (tarifa_base is null or tarifa_base >= 0)
);

create unique index tipos_terapia_nombre_idx on public.tipos_terapia (lower(trim(nombre)));

comment on column public.tipos_terapia.color is
  'Color del TIPO de terapia. El color que identifica al PROFESIONAL en el '
  'calendario sale de perfiles: son dos ejes distintos y mezclarlos deja la agenda '
  'sin poder distinguir qué es una cita de de quién es.';

comment on column public.tipos_terapia.regimen is
  'Régimen de IVA. Lo sanitario está exento (art. 20.1.3.º LIVA); lo pericial no. '
  'El tipo impositivo concreto es dato de facturación (T-021), no de esquema.';


-- =========================================================================
-- 5 · series_cita — LA INTENCIÓN (ADR-034)
--
-- Hora LOCAL y zona, nunca timestamptz: una serie creada en enero se correría una
-- hora en julio. El instante lo fija la cita al materializarse (T-011).
-- =========================================================================

create table public.series_cita (
  id               uuid primary key default gen_random_uuid(),
  paciente_id      uuid not null references public.pacientes (id),
  profesional_id   uuid not null references public.perfiles (id),
  centro_id        uuid references public.centros (id),
  tipo_terapia_id  uuid references public.tipos_terapia (id),
  periodicidad     public.periodicidad_serie not null,
  dia_semana       smallint not null,
  hora_local       time not null,
  zona_horaria     text not null,
  duracion_minutos smallint not null default 50,
  sesiones_totales smallint,
  fin_el           date,
  creada_en        timestamptz not null default now(),
  creada_por       uuid references public.perfiles (id),
  cancelada_en     timestamptz,
  motivo_cancelacion text,
  constraint series_cita_dia_semana_ck check (dia_semana between 1 and 7),
  constraint series_cita_duracion_ck   check (duracion_minutos between 5 and 480),
  constraint series_cita_sesiones_ck   check (sesiones_totales is null or sesiones_totales > 0),
  -- Una serie termina por número de sesiones o por fecha, no por las dos ni por
  -- ninguna: una serie sin final es una que nadie cierra nunca.
  constraint series_cita_final_ck check (
    (sesiones_totales is not null and fin_el is null)
    or (sesiones_totales is null and fin_el is not null)
  )
);

comment on column public.series_cita.dia_semana is
  'Día de la semana en convención ISODOW: 1 = lunes … 7 = domingo. NO es dow. '
  'Postgres tiene las dos y extract(dow) empieza en DOMINGO; equivocarla es un '
  'fallo que aparece un domingo, seis meses después, en una sola cita.';

comment on column public.series_cita.hora_local is
  'Hora LOCAL de la serie, con su zona_horaria al lado (ADR-034). Jamás un '
  'timestamptz: una serie acordada en enero a las 12:00 se correría a las 11:00 en '
  'julio. El instante lo fija la cita al materializarse.';

create index series_cita_paciente_idx     on public.series_cita (paciente_id);
create index series_cita_profesional_idx  on public.series_cita (profesional_id);

create trigger validar_zona_horaria_series_cita
  before insert or update of zona_horaria on public.series_cita
  for each row execute function public.fn_validar_zona_horaria('zona_horaria');


-- =========================================================================
-- 6 · citas — EL HECHO
-- =========================================================================

create table public.citas (
  id                    uuid primary key default gen_random_uuid(),
  paciente_id           uuid not null references public.pacientes (id),
  profesional_id        uuid not null references public.perfiles (id),
  centro_id             uuid references public.centros (id),
  tipo_terapia_id       uuid references public.tipos_terapia (id),
  serie_id              uuid references public.series_cita (id),
  inicio                timestamptz not null,
  fin                   timestamptz not null,
  zona_horaria          text not null,
  estado                public.estado_cita not null default 'programada',
  sala                  text,
  nota_operativa        text,
  desviada              boolean not null default false,
  motivo_desviacion     public.motivo_desviacion_cita,
  rango_bloqueante      tstzrange not null,
  marcada_realizada_en  timestamptz,
  marcada_realizada_por uuid references public.perfiles (id),
  creada_en             timestamptz not null default now(),
  creada_por            uuid references public.perfiles (id),
  constraint citas_fin_ck check (fin > inicio),
  -- Desviada sin motivo no dice nada, y un motivo sin desviación es ruido.
  constraint citas_desviacion_ck check (desviada = (motivo_desviacion is not null))
);

comment on column public.citas.nota_operativa is
  'LOGÍSTICA Y SOLO LOGÍSTICA: sala, material, aviso de acceso. JAMÁS contenido '
  'clínico (choque 3 de interfaz.md). Lo clínico se lee del episodio, con su '
  'política y su registro en accesos_historia. Va RECORTADA de la auditoría '
  'precisamente porque es texto libre y el choque existe porque en el prototipo se '
  'usa para lo que aquí se prohíbe.';

comment on column public.citas.zona_horaria is
  'Instantánea de la zona del centro AL MATERIALIZAR: qué zona regía cuando se '
  'acordó la cita, que no es necesariamente la que rige hoy.';

comment on column public.citas.rango_bloqueante is
  '[inicio, fin + descanso) del profesional. Lo calcula fn_calcular_rango_bloqueante() '
  'y NO lo fija nunca el llamante. El descanso se aplica SOLO POR DETRÁS: con 50 de '
  'sesión y 10 de descanso, 10:00-10:50 y 11:00-11:50 son válidas; por los dos lados '
  'exigiría veinte minutos entre sesiones, y la simetría sale gratis porque toda cita '
  'lleva el suyo.';

-- Las dos consultas del calendario. No son opcionales: las citas se leen
-- muchísimo y se escriben poco.
create index citas_profesional_inicio_idx on public.citas (profesional_id, inicio);
create index citas_centro_inicio_idx      on public.citas (centro_id, inicio);
create index citas_paciente_idx           on public.citas (paciente_id);
create index citas_serie_idx              on public.citas (serie_id) where serie_id is not null;

create trigger validar_zona_horaria_citas
  before insert or update of zona_horaria on public.citas
  for each row execute function public.fn_validar_zona_horaria('zona_horaria');


-- =========================================================================
-- 7 · El rango bloqueante, y por qué queda congelado (§3)
-- =========================================================================

create function public.fn_calcular_rango_bloqueante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_descanso interval := interval '0 minutes';
begin
  -- 1 · El llamante no trae el rango a mano. Si lo mandara y se ignorara en
  -- silencio, creería estar reservando algo que no reserva.
  if tg_op = 'INSERT' and new.rango_bloqueante is not null then
    raise exception
      'citas.rango_bloqueante lo calcula fn_calcular_rango_bloqueante(), no el llamante (T-010)'
      using errcode = '42501';
  end if;

  -- 2 · El descanso del profesional, en el momento de acordar la cita.
  -- `security definer` porque el técnico administrativo agenda citas de
  -- profesionales cuyo perfil no puede leer entero; lo único que cruza la frontera
  -- es un booleano y un entero de ajuste.
  select case when p.descanso_activo then make_interval(mins => p.descanso_minutos)
              else interval '0 minutes' end
    into v_descanso
    from public.perfiles p
   where p.id = new.profesional_id;

  new.rango_bloqueante := tstzrange(new.inicio, new.fin + coalesce(v_descanso, interval '0 minutes'), '[)');
  return new;
end;
$$;

comment on function public.fn_calcular_rango_bloqueante() is
  'Calcula citas.rango_bloqueante = [inicio, fin + descanso). Se dispara SOLO al '
  'insertar y al cambiar profesional_id, inicio o fin — es decir, cuando la cita se '
  'mueve, que es un acuerdo nuevo. Cambiar perfiles.descanso_minutos NO recalcula '
  'ninguna cita existente: mover lo ya acordado con un paciente porque el '
  'profesional tocó un ajuste es justo lo que no debe pasar. '
  'AGUJERO CONOCIDO Y ACEPTADO: activar el descanso hoy no protege el hueco anterior '
  'a una cita ya reservada sin él. Es el precio de no tocar lo acordado y se nota el '
  'primer día. NO se arregla recalculando en cascada.';

revoke execute on function public.fn_calcular_rango_bloqueante() from public;

create trigger calcular_rango_bloqueante
  before insert or update of profesional_id, inicio, fin on public.citas
  for each row execute function public.fn_calcular_rango_bloqueante();

-- La restricción va DESPUÉS del disparador: al revés, cualquier fila entraría sin
-- rango y la restricción no tendría sobre qué operar.
--
-- El nombre es explícito y estable porque LA APLICACIÓN LO CAPTURA POR NOMBRE
-- (T-028) para responder «ese hueco acaba de ocuparse» con sugerencias nuevas, en
-- vez de con un error muerto. Renombrarlo rompe esa pantalla en silencio.
--
-- El `where` es lo que permite reprogramar sobre un hueco liberado: cancelar suelta
-- el hueco sin borrar nada. Sin él, una cita cancelada seguiría bloqueando su sitio
-- para siempre.
--
-- La opclase de uuid va CUALIFICADA: btree_gist vive en `extensions` y sin
-- cualificar la búsqueda de opclase por defecto depende del search_path.
alter table public.citas
  add constraint citas_sin_solape_profesional
  exclude using gist (
    profesional_id extensions.gist_uuid_ops with =,
    rango_bloqueante with &&
  ) where (estado in ('programada', 'confirmada', 'realizada'));


-- =========================================================================
-- 8 · esta_en_curso() — la regla del ADR-045, escrita UNA vez
-- =========================================================================

create function public.esta_en_curso(p_cita_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.citas c
    where c.id = p_cita_id
      and now() >= c.inicio
      and now() <  c.fin
      and c.estado not in ('cancelada', 'no_asistida')
  );
$$;

comment on function public.esta_en_curso(uuid) is
  '«En curso» del ADR-045, en un solo sitio: now() dentro de [inicio, fin) y el '
  'estado no es cancelada ni no_asistida. NO es un estado guardado y no debe '
  'persistirse: el valor correcto cambia solo con el reloj, y una columna se '
  'desincronizaría. '
  'Es security INVOKER a propósito: preguntar por una cita que no se puede ver '
  'devuelve falso, no la respuesta. El intervalo es semiabierto, igual que '
  'lib/agenda/estados-cita.ts en el otro carril.';

grant execute on function public.esta_en_curso(uuid) to authenticated;


-- =========================================================================
-- 9 · disponibilidad
-- =========================================================================

create table public.disponibilidad (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null references public.perfiles (id),
  centro_id      uuid references public.centros (id),
  tipo           public.tipo_disponibilidad not null,
  dia_semana     smallint,
  hora_inicio    time,
  hora_fin       time,
  desde          date,
  hasta          date,
  zona_horaria   text not null,
  motivo         text,
  creado_en      timestamptz not null default now(),
  creado_por     uuid references public.perfiles (id),
  constraint disponibilidad_dia_ck    check (dia_semana is null or dia_semana between 1 and 7),
  constraint disponibilidad_horas_ck  check (hora_fin is null or hora_inicio is null or hora_fin > hora_inicio),
  constraint disponibilidad_fechas_ck check (hasta is null or desde is null or hasta >= desde),
  -- Una franja es semanal y necesita día y horas; una ausencia o un festivo son un
  -- tramo de fechas. Mezclarlos deja filas que no significan nada.
  constraint disponibilidad_forma_ck check (
    (tipo = 'franja'  and dia_semana is not null and hora_inicio is not null and hora_fin is not null)
    or (tipo in ('ausencia', 'festivo') and desde is not null)
  )
);

comment on column public.disponibilidad.dia_semana is
  'ISODOW: 1 = lunes … 7 = domingo, igual que series_cita.dia_semana. NO es dow.';

create index disponibilidad_perfil_idx on public.disponibilidad (perfil_id);
create index disponibilidad_centro_idx on public.disponibilidad (centro_id);

create trigger validar_zona_horaria_disponibilidad
  before insert or update of zona_horaria on public.disponibilidad
  for each row execute function public.fn_validar_zona_horaria('zona_horaria');


-- =========================================================================
-- 10 · El vínculo nota ↔ cita, que no existía (§5, ampliación del diseño)
--
-- HALLAZGO DE LA IMPLEMENTACIÓN, no del diseño: el disparador de alerta tiene que
-- comprobar «cita realizada SIN versión firmada», y hasta aquí NO HABÍA NINGUNA
-- FORMA de saber qué nota corresponde a qué cita — `notas_clinicas` no tenía
-- `cita_id`. Sin este vínculo la condición del ticket no se puede escribir.
--
-- El vínculo no es invención de este ticket: el ADR-046 ya sella `cita_id` DENTRO
-- del sobre canónico de la versión firmada. Lo que faltaba era la columna en la
-- cabecera. Nace nulable, la rellena T-012 al firmar, y se añade a la lista que
-- fn_congelar_cabecera_sellada() congela tras la primera firma — porque el sobre
-- la sella, y reatribuir una nota firmada a otra cita cambiaría lo certificado sin
-- romper la cadena.
-- =========================================================================

alter table public.notas_clinicas
  add column cita_id uuid references public.citas (id);

create index notas_clinicas_cita_idx on public.notas_clinicas (cita_id) where cita_id is not null;

comment on column public.notas_clinicas.cita_id is
  'Cita de la que sale esta nota. Nulable: una nota puede no venir de una cita. La '
  'rellena T-012 al firmar y el ADR-046 la SELLA dentro del sobre canónico, así que '
  'queda congelada tras la primera versión (fn_congelar_cabecera_sellada).';

create or replace function public.fn_congelar_cabecera_sellada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.notas_clinicas_versiones v where v.nota_id = old.id) then
    raise exception
      'La cabecera de una nota ya firmada no se puede reatribuir (paciente, fecha de '
      'sesión, autor, episodio o cita): el sobre canónico sella esos campos (ADR-035/046)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists congelar_cabecera_sellada on public.notas_clinicas;

create trigger congelar_cabecera_sellada
  before update of paciente_id, fecha_sesion, autor_id, episodio_id, cita_id
  on public.notas_clinicas
  for each row
  when (
    new.paciente_id  is distinct from old.paciente_id
    or new.fecha_sesion is distinct from old.fecha_sesion
    or new.autor_id  is distinct from old.autor_id
    or new.episodio_id is distinct from old.episodio_id
    or new.cita_id   is distinct from old.cita_id
  )
  execute function public.fn_congelar_cabecera_sellada();


-- =========================================================================
-- 11 · La alerta de nota sin firmar (§5)
--
-- `origen_tabla` tiene un `check` que NO admitía 'citas' (verificado con
-- pg_get_constraintdef). Se amplía cayendo y recreando en la misma transacción:
-- no hay ventana en la que la tabla quede sin restricción.
-- =========================================================================

alter table public.alertas_documentacion
  drop constraint alertas_documentacion_origen_tabla_check;

alter table public.alertas_documentacion
  add constraint alertas_documentacion_origen_tabla_check
  check (origen_tabla in ('notas_clinicas', 'consentimientos', 'informes', 'evaluaciones', 'citas'));

create function public.fn_alertar_nota_sin_firmar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Solo al PASAR a realizada, y solo si la sesión ya terminó: marcar realizada una
  -- cita que aún no ha acabado no es deuda documental, es adelantarse.
  if new.estado <> 'realizada' or old.estado = 'realizada' or new.fin > now() then
    return null;
  end if;

  if exists (
    select 1
    from public.notas_clinicas n
    join public.notas_clinicas_versiones v on v.nota_id = n.id
    where n.cita_id = new.id
  ) then
    return null;
  end if;

  -- NI UNA PALABRA CLÍNICA: identificadores y fechas. Esta tabla vive FUERA del
  -- candado del ADR-026 porque alimenta contadores y bandejas, así que lo que entre
  -- aquí lo lee quien no puede abrir la historia.
  insert into public.alertas_documentacion
    (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, fecha_referencia)
  values
    (new.paciente_id, new.profesional_id, new.centro_id, 'nota_sin_firmar', 'citas', new.id,
     (new.fin at time zone 'UTC')::date)
  on conflict do nothing;

  return null;
end;
$$;

comment on function public.fn_alertar_nota_sin_firmar() is
  'Abre una alerta nota_sin_firmar cuando una cita pasa a realizada, su fin ya quedó '
  'atrás y no hay ninguna versión firmada colgando de ella. La fila NO lleva '
  'contenido clínico: alertas_documentacion vive fuera del candado del ADR-026 '
  'porque alimenta contadores, así que la lee quien no puede abrir la historia.';

revoke execute on function public.fn_alertar_nota_sin_firmar() from public;

create trigger alertar_nota_sin_firmar
  after update of estado on public.citas
  for each row execute function public.fn_alertar_nota_sin_firmar();


-- =========================================================================
-- 12 · La vista del técnico administrativo (§4, choque 4, invariante 3)
--
-- El técnico NO tiene política de SELECT sobre `citas`, y eso es el diseño y no un
-- olvido: el invariante 3 dice que la fila se OMITE, no que se filtre en la
-- consulta de la aplicación. Una política que le diera la fila entera confiando en
-- que la pantalla no pinte dos columnas es exactamente lo que ese invariante
-- prohíbe.
--
-- security_invoker = false + security_barrier = true, calcada de
-- pacientes_indicador_riesgo (T-002).
-- =========================================================================

create view public.citas_agenda
with (security_invoker = false, security_barrier = true)
as
  select
    c.id,
    c.paciente_id,
    c.profesional_id,
    c.centro_id,
    c.serie_id,
    c.inicio,
    c.fin,
    c.zona_horaria,
    c.estado,
    c.sala,
    c.desviada,
    c.motivo_desviacion
  from public.citas c
  where (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
    and c.centro_id in (select public.centros_actuales());

comment on view public.citas_agenda is
  'Agenda del técnico administrativo: sus centros, SIN tipo_terapia_id ni '
  'nota_operativa (choque 4). Las columnas no están tachadas ni en gris: no están. '
  'El técnico no tiene política de SELECT sobre citas, así que esta vista es su '
  'única puerta y el invariante 3 se cumple por construcción.';

grant select on public.citas_agenda to authenticated;


-- =========================================================================
-- 13 · Auditoría (§6)
--
-- Patrón exacto de T-004: fn_auditar('<clave>', '<columnas recortadas>…').
-- `citas.nota_operativa` va recortada: es texto libre que el choque 3 dice que la
-- gente usará para contenido clínico, y la auditoría la lee el propio actor fuera
-- del candado.
-- =========================================================================

create trigger auditar_tipos_terapia
  after insert or update or delete on public.tipos_terapia
  for each row execute function public.fn_auditar('id');

create trigger auditar_series_cita
  after insert or update or delete on public.series_cita
  for each row execute function public.fn_auditar('id');

create trigger auditar_citas
  after insert or update or delete on public.citas
  for each row execute function public.fn_auditar('id', 'nota_operativa');

create trigger auditar_disponibilidad
  after insert or update or delete on public.disponibilidad
  for each row execute function public.fn_auditar('id');


-- =========================================================================
-- 14 · RLS
-- =========================================================================

alter table public.tipos_terapia   enable row level security;
alter table public.series_cita     enable row level security;
alter table public.citas           enable row level security;
alter table public.disponibilidad  enable row level security;

-- tipos_terapia: directorio. Lo leen los tres roles; lo escribe el administrador.
create policy tipos_terapia_lectura on public.tipos_terapia
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy tipos_terapia_alta on public.tipos_terapia
  for insert to authenticated
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

create policy tipos_terapia_modificacion on public.tipos_terapia
  for update to authenticated
  using ((select public.rol_actual()) = 'administrador'::public.rol_usuario)
  with check ((select public.rol_actual()) = 'administrador'::public.rol_usuario);

-- citas: administrador todas; profesional las suyas; el técnico NADA por select
-- directo (lee por citas_agenda) pero SÍ agenda, acotado por sus centros.
create policy citas_lectura on public.citas
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
    )
  );

create policy citas_alta on public.citas
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );

create policy citas_modificacion on public.citas
  for update to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  )
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );

-- series_cita: misma forma que citas.
create policy series_cita_lectura on public.series_cita
  for select to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );

create policy series_cita_alta on public.series_cita
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or (
        (select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
        and centro_id in (select public.centros_actuales())
      )
    )
  );

create policy series_cita_modificacion on public.series_cita
  for update to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
    )
  )
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
    )
  );

-- disponibilidad: lectura para los tres; cada profesional escribe la SUYA y el
-- administrador la de cualquiera.
create policy disponibilidad_lectura on public.disponibilidad
  for select to authenticated
  using ((select public.rol_actual()) is not null);

create policy disponibilidad_alta on public.disponibilidad
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or perfil_id = (select auth.uid())
    )
  );

create policy disponibilidad_modificacion on public.disponibilidad
  for update to authenticated
  using (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or perfil_id = (select auth.uid())
    )
  )
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or perfil_id = (select auth.uid())
    )
  );

-- alertas_documentacion: la política de INSERT que T-002 dejó sin escribir.
-- El disparador de arriba es `security definer` y no la necesita; esto habilita a
-- la aplicación a abrir alertas propias sin poder inventárselas para otro.
create policy alertas_documentacion_alta on public.alertas_documentacion
  for insert to authenticated
  with check (
    (select public.rol_actual()) is not null
    and (
      (select public.rol_actual()) = 'administrador'::public.rol_usuario
      or profesional_id = (select auth.uid())
      or public.es_profesional_asignado(paciente_id)
    )
  );


-- =========================================================================
-- 15 · Privilegios (§7.10)
--
-- Mismo riesgo que en T-001: desde T-000 hay `alter default privileges … revoke
-- all on tables`, así que una tabla nueva nace SIN NINGÚN privilegio y todo
-- devuelve `permission denied` aunque la política sea perfecta. Ante ese síntoma:
-- mirar \dp, no las políticas.
--
-- Primero se revoca a lo bruto y después se concede solo lo pactado. CERO delete.
-- CERO grant a anon y a service_role.
-- =========================================================================

revoke all on table
  public.tipos_terapia,
  public.series_cita,
  public.citas,
  public.disponibilidad,
  public.citas_agenda
from public, anon, authenticated, service_role;

grant select, insert, update on table public.tipos_terapia  to authenticated;
grant select, insert, update on table public.series_cita    to authenticated;
grant select, insert, update on table public.citas          to authenticated;
grant select, insert, update on table public.disponibilidad to authenticated;
grant select                 on table public.citas_agenda   to authenticated;
