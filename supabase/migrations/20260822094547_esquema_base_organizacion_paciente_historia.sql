-- T-001 · Esquema base — organización, centros, perfiles, paciente e historia
--
-- Migración HACIA DELANTE. No se edita la de T-000: lo que falta se añade con
-- `alter table`, y nada es destructivo en un solo paso.
--
-- Orden del fichero (§2 del diseño aprobado):
--   enums → organización → retención → alter perfiles → preferencias → candado →
--   alter pacientes → identificación y personas → clínico → notas →
--   evaluaciones/informes → cumplimiento → referencias cruzadas → funciones →
--   triggers → RLS → grants.
--
-- Cuatro reglas de forma que gobiernan todo el fichero:
--   1. Nada `not null` sin `default` al alterar `perfiles` y `pacientes`: el paseo
--      vertical de T-000 inserta columnas explícitas y debe seguir funcionando.
--   2. Ninguna política RLS. Solo `enable row level security`. Una tabla con RLS y
--      sin política deniega todo: es el estado correcto hasta T-002.
--   3. `perfiles` NUNCA lleva `force row level security` (ver su comment de T-000).
--   4. Ningún trigger de auditoría (T-004) y ningún cálculo de huella (T-005): aquí
--      solo existen las columnas donde eso vivirá.
--
-- Esta migración NO crea ninguna extensión: `pgcrypto` ya está instalada desde T-000
-- y `pgsodium` no se instala (ADR-026, ADR-029). Lo que se cifra se cifra en la
-- aplicación con `node:crypto` y claves del Vault.


-- =========================================================================
-- 1 · Enums
--
-- Un enum es lo más caro de migrar después, así que se definen completos aunque
-- fase 0 no use todos los valores. Dos que NO existen a propósito:
--   · `estado_episodio`: se deriva de `cerrado_en is null`.
--   · `estado_nota`: se deriva del borrador y del recuento de versiones (§9).
-- Una segunda verdad se desincroniza en silencio.
-- =========================================================================

create type public.estado_perfil as enum ('activo', 'suspendido', 'baja');

create type public.titularidad_paciente as enum ('organizacion', 'profesional');

create type public.tipo_representante as enum (
  'progenitor',
  'tutor',
  'acogedor',
  'guardador_de_hecho',
  'representante_judicial'
);

create type public.alcance_representacion as enum (
  'patria_potestad',
  'custodia',
  'solo_contacto'
);

create type public.tipo_consentimiento as enum (
  'asistencial',
  'terapia_pareja_familiar',
  'tratamiento_datos',
  'cesion_informacion',
  'grabacion',
  'otro'
);

create type public.modalidad_relacional as enum ('individual', 'pareja', 'familiar', 'grupo');

-- Punto abierto (a), aprobado el 22-08-2026: tres niveles. Añadir valores a un enum
-- después es barato; quitarlos no.
create type public.nivel_riesgo as enum ('bajo', 'moderado', 'alto');

create type public.alcance_nota as enum ('individual', 'conjunta');

create type public.tipo_informe as enum (
  'alta',
  'seguimiento',
  'derivacion',
  'pericial',
  'aseguradora',
  'otro'
);

create type public.tipo_acceso_historia as enum (
  'apertura',
  'exportacion',
  'informe',
  'emergencia'
);

create type public.pestana_historia as enum (
  'historial_clinico',
  'notas_clinicas',
  'evaluaciones',
  'informes',
  'documentos'
);

create type public.tipo_alerta_documentacion as enum (
  'nota_sin_firmar',
  'borrador_abandonado',
  'consentimiento_pendiente',
  'informe_pendiente',
  'evaluacion_sin_corregir'
);


-- =========================================================================
-- 2 · Organización y centros
-- =========================================================================

create table public.organizacion (
  id uuid primary key default gen_random_uuid(),
  -- El candado de fila única: `check` que obliga a `true` + `unique` que impide la
  -- segunda fila. Es lo que hace fallar el segundo insert (criterio 3).
  fila_unica boolean not null default true unique check (fila_unica),
  razon_social text not null check (length(trim(razon_social)) > 0),
  nif text not null check (nif ~ '^[A-Z0-9]{9}$'),
  -- Validada por disparador contra pg_timezone_names, no por `check`: ver §14.
  zona_horaria text not null default 'Europe/Madrid',
  -- Ventana del desbloqueo del candado (ADR-026). Punto abierto (b), aprobado:
  -- vive aquí y la ajusta el administrador. Descartado ponerlo en
  -- preferencias_usuario: que cada usuario alargue su propio candado lo vacía.
  minutos_desbloqueo_historia smallint not null default 15
    check (minutos_desbloqueo_historia between 1 and 60),
  direccion text,
  telefono text,
  correo text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.organizacion is
  'Una sola fila por instancia (decisión 1), garantizado por fila_unica. Es la '
  'frontera dura del ADR-033 y de la enmienda del ADR-032: UN SOLO NIF POR '
  'INSTANCIA. Quien emita facturas con otro NIF no es otro centro ni otro '
  'profesional de esta organización: es otro cliente y otra instancia.';

comment on column public.organizacion.zona_horaria is
  'Zona IANA de región (ADR-034). La valida un disparador, no un check.';

comment on column public.organizacion.minutos_desbloqueo_historia is
  'Duración de la ventana de desbloqueo de la historia clínica (ADR-026).';

create table public.centros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  direccion text,
  localidad text,
  -- Determina el mínimo legal de conservación de la CCAA (ADR-033).
  provincia text,
  codigo_postal text,
  telefono text,
  -- NULO SIGNIFICA HEREDAR, nunca «sin zona». Ver zona_horaria_centro().
  zona_horaria text,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.centros is
  'Sedes de la organización (ADR-033). NO tiene columna nif a propósito: un centro '
  'con NIF propio no es un centro, es otra organización y por tanto otra instancia.';

comment on column public.centros.zona_horaria is
  'Nulo = hereda la de la organización. NUNCA significa «sin zona»: resolver '
  'siempre con zona_horaria_centro(), que jamás devuelve nulo (ADR-034).';

comment on column public.centros.provincia is
  'De ella sale el mínimo legal de conservación de la CCAA (ADR-033).';


-- =========================================================================
-- 3 · Políticas de retención (ADR-033)
-- =========================================================================

create table public.politicas_retencion (
  id uuid primary key default gen_random_uuid(),
  -- Nulo = la fila de la organización, que es el valor heredable por defecto.
  centro_id uuid references public.centros (id),
  anios_historia_clinica smallint not null default 25,
  anios_minimo_legal smallint not null default 5,
  -- Es el criterio 6, y es una `check` pura: no hace falta disparador.
  constraint politicas_retencion_no_baja_del_minimo
    check (anios_historia_clinica >= anios_minimo_legal),
  -- SUELO DURO, y esta es la que de verdad bloquea. `architecture.md` §Retención
  -- exige «mínimos legales bloqueados por debajo», y la comparación de arriba, ella
  -- sola, no bloquea nada: las DOS columnas son editables y `politicas_retencion`
  -- tiene `grant update` a authenticated, así que bajar las dos a 1 año la
  -- satisfaría sin despeinarse. El suelo tiene que ser una CONSTANTE LEGAL, no otra
  -- columna configurable. 5 años es el art. 17.1 de la Ley 41/2002; una CCAA puede
  -- exigir más —por eso la columna existe y se puede SUBIR— pero nunca menos, y eso
  -- ya no se teclea desde ninguna pantalla.
  constraint politicas_retencion_suelo_legal
    check (anios_minimo_legal >= 5),
  actualizado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index politicas_retencion_centro_unico_idx
  on public.politicas_retencion (centro_id)
  where centro_id is not null;

-- La fila de la organización es única por construcción: el índice sobre la
-- expresión constante `(centro_id is null)` solo admite una fila entre las que
-- cumplen el `where`.
create unique index politicas_retencion_organizacion_unica_idx
  on public.politicas_retencion ((centro_id is null))
  where centro_id is null;

comment on table public.politicas_retencion is
  'Retención por centro (ADR-033): dos centros pueden tener dos mínimos legales '
  'distintos según su CCAA. La fila con centro_id nulo es la de la organización y '
  'es el valor heredable: existe desde esta migración y no se puede borrar, que es '
  'lo que permite a retencion_efectiva() no devolver nunca nulo. '
  'NO HAY COLUMNA DE CONSERVACIÓN INDEFINIDA: los consentimientos y los informes de '
  'alta se conservan indefinidamente POR NORMA, no por configuración.';

comment on column public.politicas_retencion.anios_minimo_legal is
  'Suelo legal (art. 17.1 Ley 41/2002, y el de la CCAA si es mayor). '
  'anios_historia_clinica nunca puede bajar de aquí.';

-- Fila semilla: es lo que hace que la herencia tenga siempre a dónde caer.
insert into public.politicas_retencion (centro_id) values (null);


-- =========================================================================
-- 4 · `perfiles` ampliada (ADR-032, ADR-033)
--
-- Todas las columnas nuevas son nulables o llevan default: el alta de T-000 no se
-- toca y sigue funcionando (criterio manual 3).
-- =========================================================================

alter table public.perfiles
  add column estado public.estado_perfil not null default 'activo',
  add column estado_desde timestamptz not null default now(),
  add column motivo_estado text,
  add column centro_id uuid references public.centros (id);

-- Es el criterio 7, y es una `check` DE LA BASE, no de la aplicación.
alter table public.perfiles
  add constraint perfiles_tecnico_exige_centro
  check (rol <> 'tecnico_administrativo' or centro_id is not null);

comment on column public.perfiles.estado is
  'ADR-032. La baja no borra: el profesional que se va deja de acceder, pero su '
  'firma y su rastro siguen siendo suyos.';

comment on column public.perfiles.centro_id is
  'Obligatorio SOLO para tecnico_administrativo (ADR-033): su alcance está acotado '
  'al centro. Un profesional sanitario puede pasar consulta en varios.';

comment on constraint perfiles_tecnico_exige_centro on public.perfiles is
  'Criterio 7 de T-001: un técnico administrativo sin centro no es un usuario '
  'válido, y eso lo impide la base, no la pantalla.';


-- =========================================================================
-- 5 · Preferencias de usuario
-- =========================================================================

create table public.preferencias_usuario (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  idioma text not null default 'es' check (idioma = 'es'),
  densidad_listas text not null default 'comoda'
    check (densidad_listas in ('comoda', 'compacta')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.preferencias_usuario is
  'Una fila por perfil. Quien la crea es T-006. NO lleva tema (ADR-042), ni '
  'zona_horaria (ADR-034: siempre la del centro, nunca la del usuario), ni la '
  'ventana del PIN (vive en organizacion: si cada usuario pudiera alargar su propio '
  'candado, el control estaría vacío).';


-- =========================================================================
-- 6 · El candado de la historia clínica (ADR-026)
-- =========================================================================

create table public.pines_historia (
  perfil_id uuid primary key references public.perfiles (id) on delete cascade,
  -- bcrypt vía extensions.crypt(). Lo que sostiene la seguridad de un PIN de seis
  -- dígitos no es la función de derivación, es el bloqueo por intentos de abajo.
  hash text not null,
  intentos_fallidos smallint not null default 0 check (intentos_fallidos >= 0),
  bloqueado_hasta timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.pines_historia is
  'PIN personal del candado (ADR-026). CERO GRANT PARA TODOS LOS ROLES, ni siquiera '
  'select para authenticated: es el criterio 13. El hash no se lee nunca desde el '
  'cliente; comprobarlo es cosa de funciones security definer de T-006.';

create table public.desbloqueos_historia (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  concedido_en timestamptz not null default now(),
  caduca_en timestamptz not null,
  revocado_en timestamptz,
  check (caduca_en > concedido_en)
);

create index desbloqueos_historia_vigentes_idx
  on public.desbloqueos_historia (perfil_id, caduca_en desc)
  where revocado_en is null;

comment on table public.desbloqueos_historia is
  'ESTADO OPERATIVO MUTABLE, a propósito: no lleva ningún cerrojo de solo adición, '
  'porque revocar un desbloqueo es un UPDATE legítimo (criterio 11). '
  'Grant: SOLO select a authenticated. Si authenticated pudiera insertar aquí, un '
  'cliente fabricaría un desbloqueo por PostgREST SIN TECLEAR EL PIN y el candado '
  'entero sería decorativo. Conceder, prolongar y revocar pasan por funciones '
  'security definer que verifican el PIN, y esas son T-006.';


-- =========================================================================
-- 7 · Paciente identificativo
-- =========================================================================

alter table public.pacientes
  add column titularidad public.titularidad_paciente not null default 'organizacion',
  add column centro_id uuid references public.centros (id),
  -- La necesita capacidad_consentimiento(): sin ella no se puede calcular la edad,
  -- y calcularla es justamente lo que evita la bandera es_menor (ADR-028).
  add column fecha_nacimiento date,
  -- Fusión de duplicados (ADR-031).
  add column fusionado_en uuid references public.pacientes (id),
  add column fusionado_el timestamptz,
  add column fusionado_por uuid references public.perfiles (id),
  add column motivo_fusion text,
  -- Traspaso al profesional que se va (enmienda del ADR-032).
  add column traspasado_en timestamptz,
  add column traspasado_a uuid references public.perfiles (id),
  add column motivo_traspaso text;

alter table public.pacientes
  add constraint pacientes_fusion_no_a_si_mismo
    check (fusionado_en is distinct from id),
  add constraint pacientes_fusion_todo_o_nada
    check (num_nonnulls(fusionado_en, fusionado_el) in (0, 2)),
  add constraint pacientes_traspaso_todo_o_nada
    check (num_nonnulls(traspasado_en, traspasado_a) in (0, 2)),
  -- Solo se traspasa lo que es del profesional (enmienda del ADR-032).
  add constraint pacientes_traspaso_exige_titularidad_profesional
    check (traspasado_en is null or titularidad = 'profesional');

comment on column public.pacientes.titularidad is
  'ADR-032 enmendado: el profesional suele ser autónomo colaborador y sus pacientes '
  'propios se los lleva. Decide SOLO qué pasa en la baja, no quién factura: el NIF '
  'sigue siendo uno por instancia.';

comment on column public.pacientes.fusionado_en is
  'ADR-031. INVARIANTE: apunta siempre a una fila con fusionado_en nulo, es decir, '
  'al superviviente final. Lo garantizan dos disparadores: uno normaliza el destino '
  'al insertar/actualizar y otro reapunta a las filas que apuntaban al absorbido. '
  'Sin el segundo la cadena entra por la puerta de atrás y el «un solo salto» de la '
  'RLS de T-002 deja de ser cierto. Nada de contenido clínico se repunta jamás: '
  'solo el vínculo.';

comment on column public.pacientes.traspasado_en is
  '«Cerrado a nueva actividad» NO es una columna: es traspasado_en is not null. '
  'Igual que «solo lectura» del absorbido es fusionado_en is not null. Quien lo '
  'hace cumplir es la RLS de T-002; aquí solo existe el dato. El original se '
  'conserva bajo el reloj de retención aunque se exporte al profesional saliente.';

create table public.pacientes_identificacion (
  -- Sin `on delete cascade`: aquí no se borra nada.
  paciente_id uuid primary key references public.pacientes (id),
  tipo_documento text not null check (tipo_documento in ('dni', 'nie', 'pasaporte')),
  dni_cifrado bytea not null,
  dni_nonce bytea not null check (octet_length(dni_nonce) = 12),
  dni_etiqueta bytea not null check (octet_length(dni_etiqueta) = 16),
  dni_clave_version smallint not null default 1,
  dni_indice bytea not null check (octet_length(dni_indice) = 32),
  dni_indice_clave_version smallint not null default 1,
  domicilio_cifrado bytea,
  domicilio_nonce bytea check (domicilio_nonce is null or octet_length(domicilio_nonce) = 12),
  domicilio_etiqueta bytea check (domicilio_etiqueta is null or octet_length(domicilio_etiqueta) = 16),
  domicilio_clave_version smallint,
  check (
    num_nonnulls(domicilio_cifrado, domicilio_nonce, domicilio_etiqueta, domicilio_clave_version)
      in (0, 4)
  ),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index pacientes_identificacion_dni_indice_unico_idx
  on public.pacientes_identificacion (dni_indice);

comment on table public.pacientes_identificacion is
  'Invariante 3 + ADR-029: identificación fuerte separada de la ficha. NINGUNA '
  'COLUMNA EN CLARO. El cifrado (AES-256-GCM con nonce aleatorio) y el índice '
  '(HMAC-SHA-256 con OTRA clave) ocurren EN LA APLICACIÓN con node:crypto y claves '
  'del Vault; la migración solo crea el sitio. '
  'La normalización previa al HMAC —mayúsculas, sin espacios ni guiones, letra de '
  'control validada— es de la aplicación, y SIN ELLA EL ÍNDICE ÚNICO NO PROTEGE DE '
  'NADA. '
  'Consecuencia aceptada del ADR-029, que el importador se encontrará el primer '
  'día: dos fichas del mismo paciente no pueden tener ambas identificación con el '
  'mismo documento. El duplicado se fusiona (ADR-031), no se duplica.';

comment on column public.pacientes_identificacion.dni_clave_version is
  'La rotación de claves del ADR-029 necesita saber con qué clave se cifró cada '
  'fila. La del índice es distinta y se versiona aparte.';

create table public.representantes_paciente (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  nombre text not null check (length(trim(nombre)) > 0),
  apellidos text not null check (length(trim(apellidos)) > 0),
  -- Mismo patrón de cifrado que pacientes_identificacion, y por la misma razón.
  documento_cifrado bytea,
  documento_nonce bytea check (documento_nonce is null or octet_length(documento_nonce) = 12),
  documento_etiqueta bytea check (documento_etiqueta is null or octet_length(documento_etiqueta) = 16),
  documento_clave_version smallint,
  check (
    num_nonnulls(documento_cifrado, documento_nonce, documento_etiqueta, documento_clave_version)
      in (0, 4)
  ),
  tipo public.tipo_representante not null,
  alcance public.alcance_representacion not null,
  -- Punto abierto (c), aprobado: desde obligatorio, hasta nulable.
  vigente_desde date not null,
  vigente_hasta date,
  check (vigente_hasta is null or vigente_hasta >= vigente_desde),
  documento_acreditativo_ruta text,
  telefono text,
  correo text,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now()
);

create index representantes_paciente_paciente_idx
  on public.representantes_paciente (paciente_id);

comment on table public.representantes_paciente is
  'ADR-028. PROHIBIDA cualquier bandera es_menor: quién consiente se CALCULA con '
  'capacidad_consentimiento(paciente, fecha). Una bandera estaría mal el día del '
  'decimosexto cumpleaños y nadie se enteraría.';

comment on column public.representantes_paciente.vigente_hasta is
  'Nulable a propósito (punto abierto (c), aprobado). El ADR-028 dice que la '
  'representación «caduca sola» al alcanzar la edad: eso se calcula, no se teclea. '
  'Un vigente_hasta obligatorio sería la bandera es_menor disfrazada de fecha, y '
  'rompería el criterio 10, que exige que LA MISMA FILA sirva a los 15 y a los 16.';

create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  -- La FK a episodios_asistenciales se añade en el bloque de referencias cruzadas:
  -- la tabla todavía no existe a esta altura del fichero.
  episodio_id uuid,
  tipo public.tipo_consentimiento not null,
  -- Decisión 10: se guarda el texto EXACTO que se firmó, no un puntero a la
  -- plantilla vigente, que cambia.
  texto_firmado text,
  texto_version text,
  otorgado_en timestamptz,
  revocado_en timestamptz,
  -- Art. 9.3: el menor de 12 a 15 años debe ser oído. Es una FECHA y no un
  -- booleano: la presencia de la fecha ES la casilla marcada, y además un
  -- `menor_oido boolean` haría fallar la comprobación del criterio 10.
  menor_oido_en date,
  documento_ruta text,
  creado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  check (revocado_en is null or otorgado_en is not null),
  -- Decisión 10, y ESTA NO TIENE BACKFILL POSIBLE: si un consentimiento se otorga
  -- sin guardar el texto exacto que se firmó y su versión, el texto se pierde para
  -- siempre — no hay de dónde recuperarlo después, porque la plantilla vigente ya
  -- habrá cambiado. Por eso es una restricción de la base desde la primera
  -- migración y no una validación de formulario.
  constraint consentimientos_otorgado_exige_texto
    check (
      otorgado_en is null
      or (texto_firmado is not null and texto_version is not null)
    )
);

create index consentimientos_paciente_idx on public.consentimientos (paciente_id);

comment on column public.consentimientos.menor_oido_en is
  'Art. 9.3: fecha en que se oyó al menor. Fecha y no booleano — ver comentario de '
  'representantes_paciente y criterio 10 de T-001.';

create table public.consentimiento_firmantes (
  id uuid primary key default gen_random_uuid(),
  consentimiento_id uuid not null references public.consentimientos (id),
  nombre_completo text not null check (length(trim(nombre_completo)) > 0),
  representante_id uuid references public.representantes_paciente (id),
  paciente_id uuid references public.pacientes (id),
  check (num_nonnulls(representante_id, paciente_id) = 1),
  -- Nulo = pendiente de firma.
  firmado_en timestamptz,
  -- La resolución judicial o la guarda exclusiva que excusa la segunda firma SE
  -- ADJUNTA, no se declara.
  documento_justificativo_ruta text,
  creado_en timestamptz not null default now()
);

create index consentimiento_firmantes_consentimiento_idx
  on public.consentimiento_firmantes (consentimiento_id);

comment on table public.consentimiento_firmantes is
  'Los «N firmantes» del ticket. Tabla hija y no un jsonb en consentimientos: un '
  'array no admite clave ajena, ni índice, ni comprobar que el firmante existe. Es '
  'la única forma de que «N firmantes» sea un hecho de la base y no una intención. '
  'Aprobada en el punto abierto (d) del diseño de T-001: se sube a '
  'architecture.md §Dominios de datos al cerrar el ticket.';


-- =========================================================================
-- 8 · Paciente clínico
-- =========================================================================

create table public.episodios_asistenciales (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  profesional_id uuid not null references public.perfiles (id),
  centro_id uuid references public.centros (id),
  modalidad_relacional public.modalidad_relacional not null default 'individual',
  motivo_consulta text,
  abierto_en date not null default current_date,
  cerrado_en date,
  motivo_cierre text,
  creado_en timestamptz not null default now(),
  check (cerrado_en is null or cerrado_en >= abierto_en)
);

create index episodios_asistenciales_paciente_idx
  on public.episodios_asistenciales (paciente_id);

comment on table public.episodios_asistenciales is
  'No hay columna de estado: abierto/cerrado se deriva de cerrado_en is null.';

comment on column public.episodios_asistenciales.cerrado_en is
  'ARRANCA EL RELOJ DE RETENCIÓN (ADR-033). Se computa en la zona del centro '
  '(ADR-034 §7), que se resuelve con zona_horaria_centro().';

create table public.episodio_participantes (
  id uuid primary key default gen_random_uuid(),
  episodio_id uuid not null references public.episodios_asistenciales (id),
  paciente_id uuid not null references public.pacientes (id),
  papel text not null check (length(trim(papel)) > 0),
  alta_en date not null default current_date,
  baja_en date,
  check (baja_en is null or baja_en >= alta_en)
);

create unique index episodio_participantes_activo_unico_idx
  on public.episodio_participantes (episodio_id, paciente_id)
  where baja_en is null;

comment on column public.episodio_participantes.papel is
  'Texto libre validado y NO un enum a propósito: los papeles de una familia no '
  'forman lista cerrada, y un enum sería una migración por cada caso nuevo sin '
  'gobernar ninguna política.';

create table public.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  episodio_id uuid not null references public.episodios_asistenciales (id),
  -- En un episodio conjunto el diagnóstico es de UNA persona. Sin esta columna no
  -- se puede ni escribir bien ni proteger (ADR-030).
  paciente_id uuid not null references public.pacientes (id),
  cie10es_codigo text not null check (length(trim(cie10es_codigo)) > 0),
  cie10es_descripcion text,
  -- Decisión 7: columna paralela, no sustitutiva.
  dsm5tr_codigo text,
  dsm5tr_descripcion text,
  principal boolean not null default false,
  diagnosticado_en date not null default current_date,
  diagnosticado_por uuid references public.perfiles (id),
  retirado_en date
);

create index diagnosticos_episodio_idx on public.diagnosticos (episodio_id);

comment on table public.diagnosticos is
  'Decisión 7: CIE-10-ES es el código oficial y DSM-5-TR va en columnas paralelas. '
  'El catálogo precargado de CIE-10-ES NO entra en T-001: es del ticket de historia '
  'clínica de fase 1 (anotado en docs/state.md).';

create table public.valoraciones_riesgo (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  episodio_id uuid references public.episodios_asistenciales (id),
  nivel public.nivel_riesgo not null,
  -- Decisión 6: «columna derivada, nunca el dato». El indicador binario es lo único
  -- que puede salir del candado; descripcion y plan_seguridad, jamás.
  --
  -- OJO T-002, y esto es una corrección de lo que decía este comentario antes: NO se
  -- puede acotar con `grant select (columnas)`. En Supabase los tres roles del
  -- dominio comparten el MISMO rol de base de datos, `authenticated` —el rol se
  -- distingue en `perfiles.rol`, no en el rol de Postgres—, así que un grant por
  -- columnas o se lo da a los tres o no se lo da a ninguno. El técnico necesitará
  -- una VISTA aparte que exponga solo (paciente_id, indicador, valorado_en), con su
  -- propia RLS. Anotado en docs/state.md.
  indicador boolean generated always as (nivel <> 'bajo') stored,
  descripcion text,
  plan_seguridad text,
  valorado_en timestamptz not null default now(),
  valorado_por uuid references public.perfiles (id)
);

create index valoraciones_riesgo_paciente_idx
  on public.valoraciones_riesgo (paciente_id, valorado_en desc);

comment on table public.valoraciones_riesgo is
  'Sin grant de update: corregir una valoración es AÑADIR OTRA, no reescribir la '
  'anterior. El indicador binario es lo único que sale del candado (decisión 6).';


-- =========================================================================
-- 9 · Notas clínicas (ADR-027, ADR-035, ADR-036)
-- =========================================================================

create table public.notas_clinicas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  episodio_id uuid references public.episodios_asistenciales (id),
  autor_id uuid not null references public.perfiles (id),
  fecha_sesion date not null default current_date,
  -- El borrador vive en la CABECERA MUTABLE, nunca en la tabla de solo adición
  -- (ADR-036): un borrador se reescribe cada pocos segundos.
  borrador_contenido jsonb,
  borrador_actualizado_en timestamptz,
  borrador_autor_id uuid references public.perfiles (id),
  check (num_nonnulls(borrador_contenido, borrador_actualizado_en, borrador_autor_id) in (0, 3)),
  creada_en timestamptz not null default now()
);

create index notas_clinicas_paciente_idx on public.notas_clinicas (paciente_id, fecha_sesion desc);

comment on table public.notas_clinicas is
  'CABECERA MUTABLE a propósito, sin ningún cerrojo de solo adición: es el criterio '
  '11. El contenido sellado vive en notas_clinicas_versiones. '
  'NO LLEVA COLUMNA estado: pendiente/borrador/firmada/modificada se derivan del '
  'borrador y del recuento de versiones. Una columna de estado sería una segunda '
  'verdad que se desincroniza en silencio, y la bandeja no la necesita porque lee '
  'alertas_documentacion (choque 11 de interfaz.md).';

comment on column public.notas_clinicas.borrador_actualizado_en is
  'Testigo del bloqueo optimista del ADR-036: lo fija un disparador, no el cliente. '
  '`update ... where borrador_actualizado_en = <esperado>` devolviendo 0 filas ES '
  'el conflicto de edición concurrente.';

create table public.notas_clinicas_versiones (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas_clinicas (id),
  numero_version integer not null check (numero_version >= 1),
  -- text y NO jsonb, y esto no es negociable: jsonb reordena claves, normaliza
  -- números y descarta el espaciado, o sea destruye exactamente los bytes que el
  -- ADR-035 manda sellar. El verificador de T-005 no podría distinguir eso de una
  -- manipulación. La columna ES el JSON canónico en UTF-8; el check con ::jsonb
  -- valida que sea JSON sin guardarlo como tal.
  cuerpo text not null check (jsonb_typeof(cuerpo::jsonb) = 'object'),
  -- ADR-027, art. 18.3: las anotaciones subjetivas del profesional viven separadas
  -- porque el derecho de acceso del paciente no las alcanza. Nulable: el valor por
  -- defecto correcto es «no hay».
  anotaciones_reservadas text,
  -- El sobre JCS/NFC completo sobre el que se calcula la huella (ADR-035).
  contenido_canonico text not null,
  huella bytea not null check (octet_length(huella) = 32),
  -- 32 ceros en el primer eslabón de la cadena.
  huella_anterior bytea not null check (octet_length(huella_anterior) = 32),
  algoritmo_version smallint not null default 1,
  esquema_version smallint not null default 1,
  motivo_cambio text,
  check (numero_version = 1 or (motivo_cambio is not null and length(trim(motivo_cambio)) > 0)),
  -- ADR-030. Vive SOLO aquí y no en la cabecera: duplicarlo daría dos verdades.
  alcance public.alcance_nota not null default 'individual',
  autor_id uuid not null references public.perfiles (id),
  creada_en timestamptz not null default now()
);

create unique index notas_clinicas_versiones_nota_numero_idx
  on public.notas_clinicas_versiones (nota_id, numero_version);

create unique index notas_clinicas_versiones_huella_idx
  on public.notas_clinicas_versiones (huella);

comment on table public.notas_clinicas_versiones is
  'SOLO ADICIÓN (invariante 2), con tres capas: revoke de update/delete a todos '
  'incluido postgres, disparador before update or delete, y disparador before '
  'truncate. La tercera es la que más se olvida porque TRUNCATE no dispara triggers '
  'por fila. '
  'AQUÍ NO SE CALCULA NINGUNA HUELLA: ni disparador que encadene ni default. La '
  'cadena es T-005; esta migración solo crea el sitio donde vivirá.';


-- =========================================================================
-- 10 · Evaluaciones e informes
--
-- NO se crea ningún bucket de Storage ni políticas de Storage: no está en el
-- ticket. `ruta` es la referencia y basta (anotado en docs/state.md).
-- Las firmas en dos capas (decisión 9) y la huella del informe son de fase 1.
-- =========================================================================

create table public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  episodio_id uuid references public.episodios_asistenciales (id),
  instrumento text not null check (length(trim(instrumento)) > 0),
  aplicado_en date not null default current_date,
  aplicado_por uuid references public.perfiles (id),
  puntuaciones jsonb,
  interpretacion text,
  creada_en timestamptz not null default now()
);

create index evaluaciones_paciente_idx on public.evaluaciones (paciente_id, aplicado_en desc);

create table public.evaluacion_archivos (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references public.evaluaciones (id),
  ruta text not null unique,
  nombre_original text not null,
  mime text not null,
  tamano_bytes bigint not null check (tamano_bytes >= 0),
  subido_por uuid references public.perfiles (id),
  subido_en timestamptz not null default now()
);

comment on column public.evaluacion_archivos.ruta is
  'Referencia al objeto en Storage. T-001 no crea el bucket ni sus políticas: no '
  'está en el ticket.';

create table public.informes (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  episodio_id uuid references public.episodios_asistenciales (id),
  tipo public.tipo_informe not null,
  destinatario text,
  version integer not null default 1 check (version >= 1),
  contenido text,
  emitido_en timestamptz,
  entregado_en timestamptz,
  autor_id uuid not null references public.perfiles (id),
  documento_ruta text,
  creado_en timestamptz not null default now()
);

create index informes_paciente_idx on public.informes (paciente_id, creado_en desc);

comment on column public.informes.tipo is
  'De aquí se deriva el IVA: el informe pericial tributa al 21 % y la asistencia '
  'sanitaria está exenta. Ver architecture.md §Fiscalidad.';


-- =========================================================================
-- 11 · Registro de accesos (ADR-037)
--
-- El ticket pide dos cosas que no caben juntas en una tabla: «contador de vistas» y
-- «update sobre accesos_historia falla». Un contador que se incrementa ES un
-- UPDATE, y el invariante 2 lo prohíbe con tres cerrojos, postgres incluido.
--
-- Resolución sin tocar ninguna decisión cerrada: la apertura y las repeticiones son
-- DOS FILAS DISTINTAS, las dos de solo adición, y el contador es una vista.
--
-- Descartado: permitir el UPDATE del contador exceptuando columnas en el
-- disparador. Rompe el criterio explícito y, peor, convierte «solo adición» en
-- «solo adición con matices», que es como se pierde un invariante.
-- =========================================================================

create table public.accesos_historia (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfiles (id),
  paciente_id uuid not null references public.pacientes (id),
  tipo public.tipo_acceso_historia not null,
  pestana public.pestana_historia,
  desbloqueo_id uuid references public.desbloqueos_historia (id),
  iniciado_en timestamptz not null default now(),
  ip inet,
  agente text,
  justificacion text,
  -- Decisión 5: el acceso de emergencia exige justificación escrita.
  check (
    tipo <> 'emergencia'
    or (justificacion is not null and length(trim(justificacion)) > 0)
  )
);

create index accesos_historia_paciente_idx
  on public.accesos_historia (paciente_id, iniciado_en desc);

create index accesos_historia_perfil_idx
  on public.accesos_historia (perfil_id, iniciado_en desc);

-- Convierte «las aperturas repetidas dentro de la misma ventana de desbloqueo son
-- un solo acceso» en un hecho de la base: la Server Action hace
-- `insert ... on conflict do nothing` y, si no insertó, registra una vista.
--
-- `nulls not distinct` es imprescindible y no un adorno: `pestana` es nulable y en
-- el índice por defecto dos nulos NO chocan, así que dos `insert ... on conflict do
-- nothing` con `pestana` nula insertaban DOS filas y el «una apertura, N vistas»
-- se rompía justo donde más duele — `exportacion`, `informe` y `emergencia`, que
-- son precisamente los accesos que no llevan pestaña.
create unique index accesos_historia_ventana_idx
  on public.accesos_historia (desbloqueo_id, paciente_id, pestana)
  nulls not distinct
  where desbloqueo_id is not null;

comment on table public.accesos_historia is
  'ADR-037. Una fila por APERTURA. Solo adición con las tres capas. El «contador de '
  'vistas» del ticket no es una columna mutable aquí: son filas en '
  'accesos_historia_vistas, y el contador se lee en accesos_historia_resumen.';

create table public.accesos_historia_vistas (
  id bigint generated always as identity primary key,
  -- SIN clave ajena a accesos_historia, y no es un descuido. Verificado sobre esta
  -- base: la comprobación de integridad referencial se ejecuta como el propietario
  -- de la tabla hija (postgres, que aquí NO es superusuario) y necesita bloquear la
  -- fila padre con FOR KEY SHARE, lo que exige UPDATE o DELETE sobre el padre. La
  -- capa 1 del cerrojo de solo adición se los revoca a postgres, así que con clave
  -- ajena NINGÚN rol —tampoco postgres— podría insertar jamás una vista:
  --   ERROR: permission denied for table accesos_historia
  --   CONTEXT: SELECT 1 FROM ONLY "public"."accesos_historia" x ... FOR KEY SHARE
  -- Entre perder el cerrojo del invariante 2 y perder la clave ajena, se pierde la
  -- clave ajena. Es exactamente el precedente de T-000 con auditoria.actor_id, y
  -- por la misma razón: una tabla de solo adición referencia, no encadena.
  acceso_id bigint not null,
  ocurrido_en timestamptz not null default now()
);

create index accesos_historia_vistas_acceso_idx
  on public.accesos_historia_vistas (acceso_id);

comment on table public.accesos_historia_vistas is
  'Una fila por repetición dentro de la ventana. También de solo adición, con las '
  'mismas tres capas. Aprobada en el punto abierto (d) del diseño de T-001: se '
  'sube a architecture.md §Dominios de datos al cerrar el ticket.';

create view public.accesos_historia_resumen
with (security_invoker = true) as
  select
    a.id,
    a.perfil_id,
    a.paciente_id,
    a.tipo,
    a.pestana,
    a.desbloqueo_id,
    a.iniciado_en,
    a.ip,
    a.agente,
    a.justificacion,
    1 + count(v.id) as vistas,
    max(v.ocurrido_en) as ultima_vista_en
  from public.accesos_historia a
  left join public.accesos_historia_vistas v on v.acceso_id = a.id
  group by a.id;

comment on view public.accesos_historia_resumen is
  'El «contador de vistas» del ticket, CALCULADO y no almacenado. '
  'security_invoker = true es OBLIGATORIO: sin él la vista leería con los '
  'privilegios de su propietario y saltaría la RLS que T-002 pondrá debajo.';


-- =========================================================================
-- 12 · Alertas de documentación (choque 11 de interfaz.md + ADR-036)
-- =========================================================================

create table public.alertas_documentacion (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes (id),
  profesional_id uuid references public.perfiles (id),
  centro_id uuid references public.centros (id),
  tipo public.tipo_alerta_documentacion not null,
  origen_tabla text not null
    check (origen_tabla in ('notas_clinicas', 'consentimientos', 'informes', 'evaluaciones')),
  -- Sin clave ajena a propósito: apunta a cuatro tablas distintas.
  origen_id uuid not null,
  fecha_referencia date,
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta')),
  resuelta_en timestamptz,
  check ((estado = 'resuelta') = (resuelta_en is not null)),
  creada_en timestamptz not null default now()
);

create unique index alertas_documentacion_origen_abierta_idx
  on public.alertas_documentacion (origen_tabla, origen_id, tipo)
  where estado = 'abierta';

create index alertas_documentacion_profesional_idx
  on public.alertas_documentacion (profesional_id, estado);

comment on table public.alertas_documentacion is
  'Mutable, y JAMÁS CONTIENE CONTENIDO CLÍNICO: es exactamente lo que permite que '
  'la bandeja y las métricas de Inicio vivan FUERA del candado (choque 11). '
  'PROHIBIDO añadir aquí motivo de consulta, diagnóstico, nivel de riesgo o texto '
  'de nota. Si una alerta necesitara eso, la alerta está mal planteada. Quién la '
  'rellena es de fase 1.';


-- =========================================================================
-- 13 · Referencias cruzadas
--
-- consentimientos.episodio_id no se puede declarar en línea: cuando se crea la
-- tabla, episodios_asistenciales todavía no existe.
-- =========================================================================

alter table public.consentimientos
  add constraint consentimientos_episodio_fk
  foreign key (episodio_id) references public.episodios_asistenciales (id);

-- =========================================================================
-- 13 bis · Índices de las claves ajenas que se van a usar de verdad
--
-- Postgres NO indexa el lado hijo de una clave ajena. Aquí van solo las que
-- muerden ya: las que T-002 va a poner en el `using` de una política —una política
-- sin índice detrás es un recorrido secuencial POR FILA— y la de `fusionado_en`,
-- que recorre `fn_repuntar_fusionados()` en cada fusión.
--
-- El resto de claves ajenas del esquema se queda sin índice a propósito: son
-- columnas de autoría y de trazabilidad por las que nadie filtra todavía, y un
-- índice que nadie usa solo encarece cada escritura. Se añadirán cuando exista la
-- consulta que los justifique. Anotado en docs/state.md.
-- =========================================================================

create index episodios_asistenciales_profesional_idx
  on public.episodios_asistenciales (profesional_id);

create index episodio_participantes_paciente_idx
  on public.episodio_participantes (paciente_id);

create index notas_clinicas_autor_idx
  on public.notas_clinicas (autor_id);

create index notas_clinicas_episodio_idx
  on public.notas_clinicas (episodio_id);

-- Parcial: solo las fichas fusionadas, que son una minoría diminuta. Es el índice
-- que evita que fn_repuntar_fusionados() recorra la tabla entera en cada fusión.
create index pacientes_fusionado_en_idx
  on public.pacientes (fusionado_en)
  where fusionado_en is not null;

create index pacientes_centro_id_idx
  on public.pacientes (centro_id);

create index perfiles_centro_id_idx
  on public.perfiles (centro_id);


-- =========================================================================
-- 14 · Funciones
--
-- Todas con `set search_path = ''` y nombres cualificados. Todas con
-- `revoke execute from public`; solo CUATRO reciben `grant execute to authenticated`:
-- las tres que la aplicación va a llamar, más es_zona_iana(), que la invoca en tiempo
-- de ejecución un disparador *security invoker* (ver §14).
-- =========================================================================

-- Por qué función y no `check` en la columna: pg_timezone_names es un catálogo
-- volátil, y una `check` no admite subconsulta. Envolverla en una función
-- `immutable` para colarla en la `check` sería mentirle al planificador y a
-- pg_dump, y un cambio de tzdata rompería una restauración meses después. Por eso
-- la validación va en un DISPARADOR.
--
-- Y por qué no basta con «existe en pg_timezone_names»: verificado sobre esta base,
-- el catálogo contiene 'CET', 'UTC', 'Etc/GMT+2' y cientos de duplicados
-- 'posix/...'. El ADR-034 prohíbe abreviaturas y desplazamientos fijos, así que la
-- regla es: existe Y contiene '/' Y no empieza por 'posix/' Y no empieza por 'Etc/'.
create function public.es_zona_iana(p_zona text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_zona is not null
     and p_zona like '%/%'
     and p_zona not like 'posix/%'
     and p_zona not like 'Etc/%'
     and exists (
       select 1 from pg_catalog.pg_timezone_names t where t.name = p_zona
     );
$$;

comment on function public.es_zona_iana(text) is
  'ADR-034: identificador IANA de REGIÓN. Rechaza CET, CEST, +02:00 y Etc/GMT+2.';

-- Genérica: lee el nombre de la columna que llega en TG_ARGV[0]. Se cuelga de
-- organizacion y de centros, y se reutiliza tal cual en series_cita y citas en
-- fase 1 sin reescribirla.
create function public.fn_validar_zona_horaria()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zona text;
begin
  v_zona := to_jsonb(new) ->> TG_ARGV[0];
  -- Nulo es legítimo: en centros significa «hereda» (ver zona_horaria_centro()).
  if v_zona is null then
    return new;
  end if;
  if not public.es_zona_iana(v_zona) then
    raise exception
      'Zona horaria no válida: %. Se exige un identificador IANA de región, por ejemplo Europe/Madrid (ADR-034)',
      v_zona
      using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Nunca devuelve nulo: centro → organización → 'Europe/Madrid'.
create function public.zona_horaria_centro(p_centro_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select c.zona_horaria from public.centros c where c.id = p_centro_id),
    (select o.zona_horaria from public.organizacion o limit 1),
    'Europe/Madrid'
  );
$$;

comment on function public.zona_horaria_centro(uuid) is
  'ADR-034. Resuelve la herencia centro → organización → Europe/Madrid. JAMÁS '
  'devuelve nulo, ni con un centro inexistente ni con la organización sin crear.';

-- Siempre exactamente una fila y nunca nulos (criterio 5).
create function public.retencion_efectiva(p_centro_id uuid)
returns table (
  anios_historia_clinica smallint,
  anios_minimo_legal smallint,
  origen text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(c.anios_historia_clinica, o.anios_historia_clinica, 25::smallint),
    coalesce(c.anios_minimo_legal, o.anios_minimo_legal, 5::smallint),
    case
      when c.anios_historia_clinica is not null then 'centro'
      when o.anios_historia_clinica is not null then 'organizacion'
      else 'predeterminado'
    end
  from (select 1) as base
  left join public.politicas_retencion c
    on c.centro_id = p_centro_id
  left join public.politicas_retencion o
    on o.centro_id is null;
$$;

comment on function public.retencion_efectiva(uuid) is
  'ADR-033. Devuelve SIEMPRE exactamente una fila y NUNCA nulos, incluso con un '
  'centro inexistente o con null: cae a la fila de la organización, que existe '
  'desde esta migración y no se puede borrar, y en último extremo a los '
  'predeterminados. Criterio 5 de T-001.';

-- ADR-028: quién consiente se CALCULA. Es security INVOKER a propósito, al revés
-- que rol_actual(): aquí no hay ninguna recursión que romper, y como definer
-- saltaría la RLS de pacientes y de representantes_paciente y convertiría una
-- función de cálculo en una puerta trasera de lectura.
create function public.capacidad_consentimiento(p_paciente_id uuid, p_fecha date default current_date)
returns table (
  quien text,
  representante_id uuid,
  edad integer,
  requiere_audiencia_menor boolean
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_nacimiento date;
  v_edad integer;
begin
  select p.fecha_nacimiento into v_nacimiento
  from public.pacientes p
  where p.id = p_paciente_id;

  if v_nacimiento is null then
    return query select 'desconocida'::text, null::uuid, null::integer, null::boolean;
    return;
  end if;

  v_edad := extract(year from age(p_fecha, v_nacimiento))::integer;

  -- Art. 9.4: a partir de los 16 consiente el propio paciente.
  if v_edad >= 16 then
    return query select 'paciente'::text, null::uuid, v_edad, false;
    return;
  end if;

  -- Por debajo de 16 consiente el representante con patria potestad vigente a esa
  -- fecha; y de 12 a 15 hay que oír al menor (art. 9.3).
  return query
    select 'representante'::text, r.id, v_edad, (v_edad >= 12)
    from public.representantes_paciente r
    where r.paciente_id = p_paciente_id
      and r.alcance = 'patria_potestad'
      and r.vigente_desde <= p_fecha
      and (r.vigente_hasta is null or r.vigente_hasta >= p_fecha);
end;
$$;

comment on function public.capacidad_consentimiento(uuid, date) is
  'ADR-028. LA MISMA FILA de representante sirve a los 15 (quien = representante) y '
  'a los 16 (quien = paciente): la edad se calcula, no se marca. Por eso no existe '
  'ninguna columna booleana de minoría de edad en el esquema (criterio 10).';

-- ADR-032: la instancia no se puede quedar sin ningún administrador activo.
create function public.fn_impedir_baja_ultimo_administrador()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.perfiles
    where rol = 'administrador' and estado = 'activo'
  ) then
    raise exception 'La instancia no puede quedarse sin ningún administrador activo (ADR-032)'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

-- ADR-026: el técnico administrativo no entra en la historia clínica, así que no
-- tiene PIN. Regla de la base, no de la pantalla.
create function public.fn_pin_no_para_tecnico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select p.rol from public.perfiles p where p.id = new.perfil_id)
     = 'tecnico_administrativo' then
    raise exception 'El técnico administrativo no accede a la historia clínica y no tiene PIN (ADR-026)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ADR-031, pieza 1 de 2: normaliza el destino al superviviente FINAL.
create function public.fn_normalizar_fusion_paciente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_destino uuid := new.fusionado_en;
  v_siguiente uuid;
  v_saltos integer := 0;
begin
  if v_destino is null then
    return new;
  end if;

  loop
    if v_destino = new.id then
      raise exception 'Ciclo de fusión detectado sobre el paciente % (ADR-031)', new.id
        using errcode = '23514';
    end if;

    -- `for no key update` NO es decorativo: sin bloquear la fila destino, dos
    -- fusiones concurrentes se cruzan y fabrican una cadena de dos saltos que el
    -- tope de 50 no caza, porque cada transaccion ve un recorrido consistente y
    -- corto. Reproducido: T1 hace A->B mientras T2 hace B->D y queda A->B, B->D.
    -- Con el bloqueo, la segunda espera a la primera y recorre la cadena ya
    -- actualizada. Es `for no key update` y no `for update` para no pelearse con
    -- las comprobaciones de clave ajena, que toman `for key share`.
    select p.fusionado_en into v_siguiente
    from public.pacientes p
    where p.id = v_destino
    for no key update;

    if not found then
      raise exception 'El paciente superviviente % no existe', v_destino
        using errcode = '23503';
    end if;

    exit when v_siguiente is null;

    v_destino := v_siguiente;
    v_saltos := v_saltos + 1;
    if v_saltos > 50 then
      raise exception 'Cadena de fusión demasiado larga desde el paciente % (ADR-031)', new.id
        using errcode = '23514';
    end if;
  end loop;

  new.fusionado_en := v_destino;
  return new;
end;
$$;

-- ADR-031, pieza 2 de 2: reapunta las filas que apuntaban al recién absorbido.
-- SIN ESTA PIEZA LA CADENA ENTRA POR LA PUERTA DE ATRÁS: A→B ya normalizado, y
-- luego B→D dejaría A apuntando a una fila que a su vez está fusionada.
create function public.fn_repuntar_fusionados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pacientes
     set fusionado_en = new.fusionado_en
   where fusionado_en = new.id
     and id <> new.fusionado_en;
  return null;
end;
$$;

-- ADR-033: la fila de la organización es el suelo de la herencia. Ni se borra ni se
-- mueve. El veto de borrado solo no bastaba: un `update ... set centro_id = <centro>`
-- la sacaba de la herencia sin borrar nada, y a partir de ahí retencion_efectiva()
-- dejaba de encontrar fila de organización y TODOS los centros caían en silencio a
-- los 25/5 constantes del `coalesce`. Silencio es la palabra clave: nada fallaba.
create function public.fn_proteger_politica_organizacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'La política de retención de la organización no se puede borrar (ADR-033)'
      using errcode = '42501';
  end if;

  -- UPDATE: la fila de la organización puede cambiar sus años, pero no dejar de ser
  -- la fila de la organización.
  if new.centro_id is not null then
    raise exception 'La política de retención de la organización no se puede reasignar a un centro (ADR-033)'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ADR-036: convierte borrador_actualizado_en en un testigo monótono y fiable, sin
-- confiar en el cliente. Es lo que hace que el bloqueo optimista funcione.
create function public.fn_tocar_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.borrador_contenido is null then
    -- Descartar el borrador limpia las tres columnas a la vez (check todo-o-nada).
    new.borrador_actualizado_en := null;
    new.borrador_autor_id := null;
  elsif TG_OP = 'INSERT'
     or new.borrador_contenido is distinct from old.borrador_contenido then
    new.borrador_actualizado_en := now();
  end if;
  return new;
end;
$$;


-- ADR-035: congela la identidad de la nota en cuanto existe la primera versión
-- sellada. Sin esto, `notas_clinicas` es mutable de par en par y `paciente_id` o
-- `fecha_sesion` se pueden reescribir DESPUÉS de firmar; como el sobre canónico no
-- incluye ni el paciente ni la nota, el contenido firmado quedaría atribuido a otro
-- paciente SIN ROMPER LA CADENA DE HUELLAS, que es el peor fallo posible aquí: el
-- verificador de T-005 lo daría por bueno.
--
-- La cabecera es mutable PARA EL BORRADOR, no para la identidad de lo ya sellado.
-- Antes de la versión 1 se puede corregir cualquiera de las dos: una nota en
-- borrador todavía no afirma nada.
create function public.fn_congelar_cabecera_sellada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notas_clinicas_versiones v where v.nota_id = new.id
  ) then
    raise exception
      'La nota % ya tiene versiones selladas: paciente_id, fecha_sesion, autor_id y episodio_id no se pueden cambiar (ADR-035)',
      new.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- ADR-030: `alcance` vive solo en la versión, así que la coherencia con la cabecera
-- la impone un disparador. Una nota conjunta exige episodio.
create function public.fn_exigir_episodio_en_nota_conjunta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.notas_clinicas n
    where n.id = new.nota_id and n.episodio_id is not null
  ) then
    raise exception 'Una versión de nota con alcance conjunta exige que su nota tenga episodio (ADR-030)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.es_zona_iana(text) from public;
revoke execute on function public.fn_validar_zona_horaria() from public;
revoke execute on function public.zona_horaria_centro(uuid) from public;
revoke execute on function public.retencion_efectiva(uuid) from public;
revoke execute on function public.capacidad_consentimiento(uuid, date) from public;
revoke execute on function public.fn_impedir_baja_ultimo_administrador() from public;
revoke execute on function public.fn_pin_no_para_tecnico() from public;
revoke execute on function public.fn_normalizar_fusion_paciente() from public;
revoke execute on function public.fn_repuntar_fusionados() from public;
revoke execute on function public.fn_proteger_politica_organizacion() from public;
revoke execute on function public.fn_tocar_borrador() from public;
revoke execute on function public.fn_congelar_cabecera_sellada() from public;
revoke execute on function public.fn_exigir_episodio_en_nota_conjunta() from public;

-- Las tres que la aplicación llama directamente, más es_zona_iana() por la razón de
-- abajo: cuatro grants en total. Ninguna otra: el resto son funciones de disparador.
-- es_zona_iana() SÍ necesita grant, y esta línea no es opcional: la llama
-- fn_validar_zona_horaria(), que es *security invoker*, EN TIEMPO DE EJECUCIÓN. El
-- EXECUTE de una función de disparador se comprueba al CREAR el disparador —por eso
-- las demás fn_* no necesitan nada—, pero la función que esa llama por dentro se
-- comprueba en cada disparo y con el rol que escribe. Sin esta línea, en cuanto
-- T-002 abra la escritura de `centros` a authenticated, cada alta de centro moriría
-- con `permission denied for function es_zona_iana`.
grant execute on function public.es_zona_iana(text) to authenticated;
grant execute on function public.zona_horaria_centro(uuid) to authenticated;
grant execute on function public.retencion_efectiva(uuid) to authenticated;
grant execute on function public.capacidad_consentimiento(uuid, date) to authenticated;


-- =========================================================================
-- 15 · Disparadores
-- =========================================================================

create trigger validar_zona_horaria_organizacion
  before insert or update of zona_horaria on public.organizacion
  for each row
  execute function public.fn_validar_zona_horaria('zona_horaria');

create trigger validar_zona_horaria_centro
  before insert or update of zona_horaria on public.centros
  for each row
  execute function public.fn_validar_zona_horaria('zona_horaria');

create trigger proteger_politica_organizacion
  before delete or update of centro_id on public.politicas_retencion
  for each row
  when (old.centro_id is null)
  execute function public.fn_proteger_politica_organizacion();

-- Tres razones para esta forma exacta, y las tres importan:
--   · AFTER y no BEFORE: una sentencia que degrada a un administrador y promueve a
--     otro debe pasar; con BEFORE el resultado dependería del orden de las filas.
--   · CONSTRAINT TRIGGER + DEFERRABLE: permite validar al final de la transacción
--     un relevo hecho en dos sentencias.
--   · El WHEN cubre a la vez el cambio de estado, el cambio de rol y el DELETE, y
--     no cuesta nada en el resto de escrituras sobre perfiles.
create constraint trigger impedir_baja_ultimo_administrador
  after update or delete on public.perfiles
  deferrable initially immediate
  for each row
  when (old.rol = 'administrador' and old.estado = 'activo')
  execute function public.fn_impedir_baja_ultimo_administrador();

create trigger pin_no_para_tecnico
  before insert or update on public.pines_historia
  for each row
  execute function public.fn_pin_no_para_tecnico();

create trigger normalizar_fusion_paciente
  before insert or update of fusionado_en on public.pacientes
  for each row
  execute function public.fn_normalizar_fusion_paciente();

create trigger repuntar_fusionados
  after update of fusionado_en on public.pacientes
  for each row
  when (new.fusionado_en is not null and new.fusionado_en is distinct from old.fusionado_en)
  execute function public.fn_repuntar_fusionados();

create trigger tocar_borrador
  before insert or update on public.notas_clinicas
  for each row
  execute function public.fn_tocar_borrador();

-- El `when` deja pasar el `update` que menciona las columnas sin cambiarlas: lo que
-- se prohíbe es CAMBIAR la identidad de una nota ya sellada, no tocar la fila.
-- Son CUATRO columnas, no dos, y las dos que se añadieron después son las que peor
-- fallan si faltan:
--   · autor_id decide QUIÉN PUEDE LEER la nota (§Roles: «autor o asignado»). El sobre
--     canónico sella el autor de la VERSIÓN, no el de la cabecera, así que cambiarlo
--     aquí reasigna la visibilidad de una nota ya firmada sin romper la cadena y sin
--     que el verificador de T-005 vea nada.
--   · episodio_id a nulo deja una versión `alcance = 'conjunta'` sin episodio, que es
--     exactamente el estado que fn_exigir_episodio_en_nota_conjunta() impide crear al
--     insertar. Sin esta columna aquí, la guarda se esquiva por la puerta de al lado.
create trigger congelar_cabecera_sellada
  before update of paciente_id, fecha_sesion, autor_id, episodio_id on public.notas_clinicas
  for each row
  when (
    new.paciente_id is distinct from old.paciente_id
    or new.fecha_sesion is distinct from old.fecha_sesion
    or new.autor_id is distinct from old.autor_id
    or new.episodio_id is distinct from old.episodio_id
  )
  execute function public.fn_congelar_cabecera_sellada();

create trigger exigir_episodio_en_nota_conjunta
  before insert on public.notas_clinicas_versiones
  for each row
  when (new.alcance = 'conjunta')
  execute function public.fn_exigir_episodio_en_nota_conjunta();

-- Cerrojo de solo adición, capas 2 y 3 (la 1 es el REVOKE del bloque de grants).
-- Se reutiliza public.fn_impedir_modificacion() de T-000 sin tocarla: es genérica
-- vía TG_TABLE_NAME y no referencia NEW/OLD, así que vale igual para el trigger por
-- fila y para el de sentencia.
create trigger impedir_modificacion_notas_clinicas_versiones
  before update or delete on public.notas_clinicas_versiones
  for each row
  execute function public.fn_impedir_modificacion();

create trigger impedir_truncado_notas_clinicas_versiones
  before truncate on public.notas_clinicas_versiones
  for each statement
  execute function public.fn_impedir_modificacion();

create trigger impedir_modificacion_accesos_historia
  before update or delete on public.accesos_historia
  for each row
  execute function public.fn_impedir_modificacion();

create trigger impedir_truncado_accesos_historia
  before truncate on public.accesos_historia
  for each statement
  execute function public.fn_impedir_modificacion();

create trigger impedir_modificacion_accesos_historia_vistas
  before update or delete on public.accesos_historia_vistas
  for each row
  execute function public.fn_impedir_modificacion();

create trigger impedir_truncado_accesos_historia_vistas
  before truncate on public.accesos_historia_vistas
  for each statement
  execute function public.fn_impedir_modificacion();


-- =========================================================================
-- 16 · RLS
--
-- Activo en TODAS las tablas nuevas y SIN UNA SOLA POLÍTICA. Una tabla con RLS y
-- sin política deniega todo: es el estado correcto hasta T-002. Es el criterio 14.
-- =========================================================================

alter table public.organizacion               enable row level security;
alter table public.centros                    enable row level security;
alter table public.politicas_retencion        enable row level security;
alter table public.preferencias_usuario       enable row level security;
alter table public.pines_historia             enable row level security;
alter table public.desbloqueos_historia       enable row level security;
alter table public.pacientes_identificacion   enable row level security;
alter table public.representantes_paciente    enable row level security;
alter table public.consentimientos            enable row level security;
alter table public.consentimiento_firmantes   enable row level security;
alter table public.episodios_asistenciales    enable row level security;
alter table public.episodio_participantes     enable row level security;
alter table public.diagnosticos               enable row level security;
alter table public.valoraciones_riesgo        enable row level security;
alter table public.notas_clinicas             enable row level security;
alter table public.notas_clinicas_versiones   enable row level security;
alter table public.evaluaciones               enable row level security;
alter table public.evaluacion_archivos        enable row level security;
alter table public.informes                   enable row level security;
alter table public.accesos_historia           enable row level security;
alter table public.accesos_historia_vistas    enable row level security;
alter table public.alertas_documentacion      enable row level security;


-- =========================================================================
-- 17 · Grants
--
-- Riesgo número uno del ticket, igual que en T-000 y ahora con veintidós tablas:
-- desde T-000 hay `alter default privileges ... revoke all on tables`, así que una
-- tabla nueva nace SIN NINGÚN PRIVILEGIO para anon/authenticated/service_role. Sin
-- grant explícito todo devuelve `permission denied` aunque la política sea
-- perfecta, y el error engaña. Ante ese síntoma: mirar \dp, no las políticas.
--
-- Primero se revoca a lo bruto y después se concede solo lo pactado: así «ni un
-- grant a anon» es un hecho verificable y no una suposición sobre el catálogo.
-- CERO delete en toda la migración. CERO grant a anon y a service_role.
-- =========================================================================

revoke all on table
  public.organizacion,
  public.centros,
  public.politicas_retencion,
  public.preferencias_usuario,
  public.pines_historia,
  public.desbloqueos_historia,
  public.pacientes_identificacion,
  public.representantes_paciente,
  public.consentimientos,
  public.consentimiento_firmantes,
  public.episodios_asistenciales,
  public.episodio_participantes,
  public.diagnosticos,
  public.valoraciones_riesgo,
  public.notas_clinicas,
  public.notas_clinicas_versiones,
  public.evaluaciones,
  public.evaluacion_archivos,
  public.informes,
  public.accesos_historia,
  public.accesos_historia_vistas,
  public.alertas_documentacion,
  public.accesos_historia_resumen
  from public, anon, authenticated, service_role;

-- Organización y ajustes: el administrador consulta y ajusta; quién puede, T-002.
grant select, update on table public.organizacion to authenticated;
grant select, insert, update on table public.centros to authenticated;
grant select, insert, update on table public.politicas_retencion to authenticated;
grant select, insert, update on table public.preferencias_usuario to authenticated;

-- pines_historia: NADA para nadie. Es el criterio 13.

-- desbloqueos_historia: solo lectura. Insertar, prolongar y revocar pasan por
-- funciones security definer que comprueban el PIN (T-006).
grant select on table public.desbloqueos_historia to authenticated;

-- Paciente identificativo y personas alrededor.
grant select, insert, update on table public.pacientes_identificacion to authenticated;
grant select, insert, update on table public.representantes_paciente to authenticated;
grant select, insert, update on table public.consentimientos to authenticated;
grant select, insert, update on table public.consentimiento_firmantes to authenticated;

-- Paciente clínico.
grant select, insert, update on table public.episodios_asistenciales to authenticated;
grant select, insert, update on table public.episodio_participantes to authenticated;
grant select, insert, update on table public.diagnosticos to authenticated;
-- Sin update: corregir una valoración de riesgo es añadir otra.
grant select, insert on table public.valoraciones_riesgo to authenticated;

-- Notas: la cabecera es mutable; las versiones son de solo adición.
grant select, insert, update on table public.notas_clinicas to authenticated;
grant select, insert on table public.notas_clinicas_versiones to authenticated;

-- Evaluaciones e informes.
grant select, insert, update on table public.evaluaciones to authenticated;
grant select, insert on table public.evaluacion_archivos to authenticated;
grant select, insert, update on table public.informes to authenticated;

-- Registro de accesos: solo adición, y su vista de solo lectura.
grant select, insert on table public.accesos_historia to authenticated;
grant select, insert on table public.accesos_historia_vistas to authenticated;
grant select on table public.accesos_historia_resumen to authenticated;

-- Alertas: se leen y se marcan como resueltas. Nunca se borran.
grant select, update on table public.alertas_documentacion to authenticated;

-- Capa 1 del cerrojo de solo adición: revoca update y delete a TODOS, postgres
-- incluido. Las capas 2 y 3 son los disparadores de §15, que son lo único que de
-- verdad frena al propietario (conserva privilegios implícitos, TRUNCATE incluido).
revoke update, delete on table
  public.notas_clinicas_versiones,
  public.accesos_historia,
  public.accesos_historia_vistas
  from public, anon, authenticated, service_role, postgres;

-- Saneamiento de privilegios por defecto.
--
-- La primera línea repite la de T-000: es barata y deja el hecho escrito donde se
-- lee.
alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;

-- La segunda es NUEVA, y la justifica un hallazgo de pg_default_acl: para
-- SECUENCIAS la plantilla de Supabase seguía concediendo UPDATE a anon,
-- authenticated y service_role. UPDATE sobre una secuencia habilita nextval() y
-- setval(), y auditoria, accesos_historia y accesos_historia_vistas usan identity:
-- con setval() se puede provocar una colisión de clave primaria en una tabla de
-- solo adición.
alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;

-- Lo anterior solo vale para las secuencias FUTURAS. Las que ya existen (la de
-- auditoria, de T-000) hay que sanearlas a mano, y aquí es donde se hace.
revoke all on all sequences in schema public from anon, authenticated, service_role;
