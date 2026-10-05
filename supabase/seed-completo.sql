-- =============================================================================
-- T-008 · Siembra COMPLETA. Se ejecuta con `npm run seed`, NUNCA sola: exige que
-- `supabase/seed.sql` haya corrido antes (lo hace cada `npx supabase db reset`),
-- porque cuelga de la organización, del Centro Madrid y de Ana y Bruno.
--
-- NADA DE ESTO LLEGA A PRODUCCIÓN. Contraseñas de desarrollo en claro, correos
-- @psicogestion.test, PIN de seis dígitos conocido y sal de bcrypt fija.
--
-- QUÉ SIEMBRA, y por qué cada cosa: los casos raros. Los normales ya salen de la
-- siembra mínima; lo que rompe las pantallas y nadie recuerda crear a mano es lo
-- de aquí — el centro en otra zona horaria, el menor con dos representantes, la
-- pareja con nota conjunta, el duplicado vinculado, el profesional de baja con
-- notas suyas firmadas, y una nota corregida con DOS versiones encadenadas.
--
-- IDEMPOTENTE: `on conflict do nothing` donde hay identificador fijo, y una
-- guarda `if not exists` alrededor de lo que no lo tiene (las versiones de nota,
-- cuyo `id` lo pone la base). Correrlo dos veces seguidas no duplica ninguna fila:
-- es criterio de aceptación, no una aspiración.
--
-- DETERMINISTA: ni `random()`, ni `gen_random_uuid()`, ni `now()` suelto. Todo
-- identificador es literal y todo instante cuelga de `k_fecha_base`.
--
-- LAS VERSIONES DE NOTA PASAN POR EL DISPARADOR DE VERDAD. `fn_sellar_version_nota()`
-- (T-005) sella y encadena; esta siembra NO calcula ninguna huella ni manda
-- `huella`, `huella_anterior`, `paciente_id`, `posicion_cadena` ni `numero_version`
-- —la guarda 1 del disparador lanza 42501 si llegan—. Lo único que hay que dar es
-- un sobre canónico coherente con la fila, y de eso se encarga `pg_temp.sobre()`.
-- Consecuencia buscada: `npm run verificar:huellas` recorre lo sembrado y tiene
-- que decir «cadena íntegra».
-- =============================================================================

-- Construye el sobre canónico (ADR-035 + ADR-046 + ADR-057 + ADR-067/071/072, era 4) de una versión sembrada, con
-- las diecisiete claves exactas en el orden alfabético que exige la comprobación 6.1 del
-- disparador. `p_cuerpo` se pasa YA como texto canónico (una sola clave, ASCII en
-- las claves) en vez de como jsonb, a diferencia del ayudante del banco de pruebas:
-- `jsonb::text` mete un espacio tras los dos puntos y produciría un sobre que el
-- disparador acepta pero que NO es JCS byte a byte. Aquí no cuesta nada hacerlo
-- bien, y así lo sembrado es canónico de verdad.
-- T-012a: p_alcance nuevo, debe coincidir con la columna `alcance` de la fila o la
-- comprobación 6.10 rechaza el INSERT con 23514.
-- T-012c: p_nota_id nuevo y primero; la cabecera (paciente, episodio, fecha, coprofesional) se
-- lee de `notas_clinicas`, que se siembra ANTES que sus versiones, por eso es `stable`.
create or replace function pg_temp.sobre(
  p_nota_id        uuid,
  p_autor_id       uuid,
  p_creada_en      timestamptz,
  p_cuerpo         text,
  p_anotaciones    text default null,
  p_motivo_cambio  text default null,
  p_alcance        text default 'individual'
) returns text
language sql
stable
as $$
  select
    '{' ||
    '"abierta_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"alcance":' || coalesce(to_json(p_alcance)::text, 'null') || ',' ||
    '"anotaciones_reservadas":' || coalesce(to_json(p_anotaciones)::text, 'null') || ',' ||
    '"autor_id":' || to_json(lower(p_autor_id::text))::text || ',' ||
    '"cita_id":null,' ||
    '"coprofesional_id":' || coalesce(to_json((select n.coprofesional_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"creada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"cuerpo":' || p_cuerpo || ',' ||
    '"episodio_id":' || coalesce(to_json((select n.episodio_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"esquema_version":4,' ||
    '"fecha_sesion":' || coalesce(to_json((select to_char(n.fecha_sesion, 'YYYY-MM-DD') from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"firmada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"margen_sesion_minutos":null,' ||
    '"motivo_cambio":' || coalesce(to_json(p_motivo_cambio)::text, 'null') || ',' ||
    '"nota_id":' || to_json(lower(p_nota_id::text))::text || ',' ||
    '"paciente_id":' || coalesce(to_json((select n.paciente_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"redactada_en_sesion":false' ||
    '}';
$$;


do $seed$
declare
  k_fecha_base constant timestamptz := '2026-09-01 09:00:00+02';
  k_sal        constant text        := '$2a$06$psicogestionsemilla123';

  -- De la siembra mínima (supabase/seed.sql). No se crean aquí: se usan.
  k_c_madrid constant uuid := 'c0080001-0000-4000-8000-00000000000a';
  k_adm      constant uuid := 'b0080001-0000-4000-8000-000000000001';
  k_ana      constant uuid := '11111111-1111-4111-8111-111111111111';
  k_bruno    constant uuid := '22222222-2222-4222-8222-222222222222';

  k_c_canarias constant uuid := 'c0080001-0000-4000-8000-00000000000b';

  k_tec  constant uuid := 'b0080001-0000-4000-8000-000000000004';
  k_baja constant uuid := 'b0080001-0000-4000-8000-000000000006';

  k_p_carmen  constant uuid := 'd0080001-0000-4000-8000-000000000003';
  k_p_ivan    constant uuid := 'd0080001-0000-4000-8000-000000000004';
  k_p_menor   constant uuid := 'd0080001-0000-4000-8000-000000000005';
  k_p_sofia   constant uuid := 'd0080001-0000-4000-8000-000000000006';
  k_p_hugo    constant uuid := 'd0080001-0000-4000-8000-000000000007';
  k_p_dup     constant uuid := 'd0080001-0000-4000-8000-000000000008';

  k_rep_madre constant uuid := 'a0080002-0000-4000-8000-000000000001';
  k_rep_padre constant uuid := 'a0080002-0000-4000-8000-000000000002';
  k_cons      constant uuid := 'a0080003-0000-4000-8000-000000000001';

  k_epi_pareja constant uuid := 'e0080001-0000-4000-8000-000000000001';
  k_epi_carmen constant uuid := 'e0080001-0000-4000-8000-000000000002';
  k_epi_ivan   constant uuid := 'e0080001-0000-4000-8000-000000000003';

  k_n_borrador constant uuid := 'f0080001-0000-4000-8000-000000000001';
  k_n_firmada  constant uuid := 'f0080001-0000-4000-8000-000000000002';
  k_n_corregida constant uuid := 'f0080001-0000-4000-8000-000000000003';
  k_n_conjunta constant uuid := 'f0080001-0000-4000-8000-000000000004';
  k_n_de_baja  constant uuid := 'f0080001-0000-4000-8000-000000000005';
  v_martes     date;
begin

  -- -----------------------------------------------------------------------
  -- 1 · El segundo centro, en OTRA zona horaria
  --
  -- Atlantic/Canary no es un capricho: es una hora menos que Europe/Madrid todo
  -- el año, así que cualquier pantalla que calcule «hoy» o «esta semana» con la
  -- zona equivocada se ve mal desde el primer día en vez de en el primer cliente
  -- canario. Y `centros.provincia` es lo que decidirá el suelo de retención
  -- autonómico cuando llegue su ticket.
  -- -----------------------------------------------------------------------
  insert into public.centros (id, nombre, localidad, provincia, codigo_postal, zona_horaria, creado_en)
  values (k_c_canarias, 'Centro Las Palmas', 'Las Palmas de Gran Canaria', 'Las Palmas',
          '35002', 'Atlantic/Canary', k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 2 · Los dos usuarios que faltaban para tener los tres roles
  --
  -- El técnico administrativo lleva `centro_id` OBLIGATORIO (ADR-033): su alcance
  -- se acota por centro y sin él no vería nada. Va en Madrid, para que su vista
  -- no coincida con la del profesional de Canarias y el aislamiento por centro se
  -- pueda ver a simple vista.
  --
  -- El profesional de baja nace ACTIVO y se da de baja al final, después de haber
  -- firmado: es el caso que demuestra que la autoría sobrevive al acceso.
  -- -----------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', k_tec, 'authenticated', 'authenticated',
     'tecnico@psicogestion.test', extensions.crypt('psico1234', k_sal),
     k_fecha_base, k_fecha_base, k_fecha_base,
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('rol', 'tecnico_administrativo', 'nombre_completo', 'Teresa Técnica',
                        'centro_id', k_c_madrid),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', k_baja, 'authenticated', 'authenticated',
     'baja@psicogestion.test', extensions.crypt('psico1234', k_sal),
     k_fecha_base, k_fecha_base, k_fecha_base,
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('rol', 'profesional_sanitario', 'nombre_completo', 'Bárbara Baja',
                        'centro_id', k_c_canarias),
     '', '', '', '')
  on conflict (id) do nothing;

  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    ('a0080001-0000-4000-8000-000000000004', k_tec, 'email', k_tec::text,
     jsonb_build_object('sub', k_tec::text, 'email', 'tecnico@psicogestion.test'), k_fecha_base, k_fecha_base),
    ('a0080001-0000-4000-8000-000000000006', k_baja, 'email', k_baja::text,
     jsonb_build_object('sub', k_baja::text, 'email', 'baja@psicogestion.test'), k_fecha_base, k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 3 · Segundo factor y PIN de historia
  --
  -- TOTP para los tres roles (ADR-039). TRAMPA PAGADA: `auth.mfa_factors` lleva un
  -- índice ÚNICO GLOBAL sobre `last_challenged_at` (comprobado con
  -- `\d auth.mfa_factors`), así que dar el factor a cinco usuarios con el mismo
  -- instante choca con 23505. De ahí el desfase distinto por usuario.
  --
  -- El PIN del candado (ADR-026) es de los PROFESIONALES y del administrador: el
  -- técnico administrativo no tiene historia que abrir y por tanto no tiene PIN.
  -- La sal es fija para que dos siembras desde cero den el mismo hash.
  -- -----------------------------------------------------------------------
  insert into auth.mfa_factors
    (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, last_challenged_at)
  values
    ('a0080004-0000-4000-8000-000000000001', k_ana,   'totp-ana',   'totp', 'verified',
     k_fecha_base, k_fecha_base, 'SEMILLATOTPDEMOANA', k_fecha_base - interval '1 second'),
    ('a0080004-0000-4000-8000-000000000002', k_bruno, 'totp-bruno', 'totp', 'verified',
     k_fecha_base, k_fecha_base, 'SEMILLATOTPDEMOBRU', k_fecha_base - interval '2 seconds'),
    ('a0080004-0000-4000-8000-000000000003', k_tec,   'totp-tec',   'totp', 'verified',
     k_fecha_base, k_fecha_base, 'SEMILLATOTPDEMOTEC', k_fecha_base - interval '3 seconds'),
    ('a0080004-0000-4000-8000-000000000004', k_baja,  'totp-baja',  'totp', 'verified',
     k_fecha_base, k_fecha_base, 'SEMILLATOTPDEMOBAJ', k_fecha_base - interval '4 seconds'),
    ('a0080004-0000-4000-8000-000000000005', k_adm,   'totp-adm',   'totp', 'verified',
     k_fecha_base, k_fecha_base, 'SEMILLATOTPDEMOADM', k_fecha_base - interval '5 seconds')
  on conflict (id) do nothing;

  -- El administrador SÍ lleva PIN: el candado del ADR-026 no tiene guarda de rol y sin
  -- PIN no podría abrir ninguna historia, que es justo lo que el guion manual de este
  -- ticket le pide hacer. El técnico administrativo NO lo lleva y no es un olvido: no
  -- tiene historia que abrir.
  insert into public.pines_historia (perfil_id, hash, creado_en, actualizado_en) values
    (k_adm,   extensions.crypt('456789', k_sal), k_fecha_base, k_fecha_base),
    (k_ana,   extensions.crypt('123456', k_sal), k_fecha_base, k_fecha_base),
    (k_bruno, extensions.crypt('234567', k_sal), k_fecha_base, k_fecha_base),
    (k_baja,  extensions.crypt('345678', k_sal), k_fecha_base, k_fecha_base)
  on conflict (perfil_id) do nothing;

  -- -----------------------------------------------------------------------
  -- 3.bis · Ana pasa consulta en LOS DOS centros (ADR-051)
  --
  -- Sin esto, el selector de centro del armazón (T-007·D) no se puede ver nunca:
  -- el disparador de la enmienda del ADR-051 crea UNA pertenencia por perfil
  -- —espejo de `perfiles.centro_id`—, así que todos los sembrados tenían un solo
  -- centro y el selector, que con menos de dos no se pinta, nunca aparecía. Un
  -- control sin datos con los que existir es código sin camino de prueba.
  --
  -- `principal = false`: el principal sigue siendo Madrid, y eso importa más de lo
  -- que parece — `fn_rellenar_centro_paciente` usa el PRINCIPAL, y el centro del
  -- paciente decide su retención durante veinticinco años. Una segunda pertenencia
  -- no cambia de quién es la retención de nadie.
  --
  -- Y no cambia tampoco qué pacientes ve Ana: un profesional lee los suyos vía
  -- `es_profesional_asignado()`, que no consulta el centro. El acotado por centro
  -- es del técnico administrativo. Esto ya se redactó mal una vez.
  insert into public.perfiles_centros (id, perfil_id, centro_id, principal, desde, creado_en)
  values ('a0080008-0000-4000-8000-000000000001', k_ana, k_c_canarias, false,
          k_fecha_base::date, k_fecha_base)
  on conflict (id) do nothing;

  -- El administrador atiende en Madrid (T-041). Tres cosas:
  --  · Es PRINCIPAL porque no tenía ninguno, y no tiene pacientes: no cambia el
  --    centro de nadie, solo el espejo `perfiles.centro_id` del propio administrador.
  --  · Con esta alta, el selector de coprofesional de Ana lo ofrece en los episodios
  --    de Madrid (7c), y hay con qué ver la regla funcionando.
  --  · En una instalación real esta alta no se siembra: se da desde /ajustes/centros.
  insert into public.perfiles_centros (id, perfil_id, centro_id, principal, desde, creado_en)
  values ('a0080008-0000-4000-8000-000000000002', k_adm, k_c_madrid, true,
          k_fecha_base::date, k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 4 · Pacientes: las dos titularidades, los dos centros
  --
  -- `titularidad` decide de quién es la historia cuando el profesional se va
  -- (ADR-032), y hay uno de cada para que esa diferencia se pueda ver. El centro
  -- lo rellena `fn_rellenar_centro_paciente` desde el centro PRINCIPAL del
  -- profesional; se pasa explícito igualmente donde importa, para que la siembra
  -- diga lo que quiere y no dependa de un disparador para ser legible.
  -- -----------------------------------------------------------------------
  insert into public.pacientes
    (id, nombre, apellidos, profesional_id, titularidad, centro_id, fecha_nacimiento, creado_en) values
    (k_p_carmen, 'Carmen', 'Ruiz',    k_ana,  'organizacion', k_c_madrid,   '1988-03-14', k_fecha_base),
    (k_p_ivan,   'Iván',   'Santana', k_baja, 'profesional',  k_c_canarias, '1975-11-02', k_fecha_base),
    (k_p_menor,  'Mateo',  'Ortega',  k_ana,  'organizacion', k_c_madrid,   '2011-04-12', k_fecha_base),
    (k_p_sofia,  'Sofía',  'Nieto',   k_ana,  'organizacion', k_c_madrid,   '1990-07-21', k_fecha_base),
    (k_p_hugo,   'Hugo',   'Vidal',   k_ana,  'organizacion', k_c_madrid,   '1989-01-30', k_fecha_base)
  on conflict (id) do nothing;

  -- El duplicado vinculado (ADR-031). `fusionado_en` apunta a la ficha
  -- superviviente y el disparador `fn_normalizar_fusion_paciente()` garantiza que
  -- la cadena sea de UN SOLO SALTO. No se borra nada: fusionar es apuntar, nunca
  -- eliminar, y las huellas de sus notas no se recalculan jamás.
  insert into public.pacientes
    (id, nombre, apellidos, profesional_id, titularidad, centro_id, fecha_nacimiento, creado_en,
     fusionado_en, fusionado_el, fusionado_por, motivo_fusion) values
    (k_p_dup, 'Carmen', 'Ruíz', k_ana, 'organizacion', k_c_madrid, '1988-03-14', k_fecha_base,
     k_p_carmen, k_fecha_base, k_ana, 'Alta duplicada al importar: mismo documento, apellido con tilde')
  on conflict (id) do nothing;

  -- Identificación cifrada (ADR-029) de una sola ficha. Solo una ficha la lleva:
  -- `dni_indice` es único y el duplicado de arriba no puede compartirlo (consecuencia
  -- aceptada del ADR-029, y el primer tropiezo del importador cuando llegue).
  --
  -- Desde T-032 la ficha DESCIFRA esta fila, así que es un cifrado de verdad y no bytes de
  -- relleno (B6/H5 de la revisión: con sha256 de relleno la ficha de Carmen pintaba
  -- «no se puede mostrar» y un console.error en cada render, un fallo que no existía).
  -- Precalculado fuera de la base con node:crypto y las claves DE JUGUETE del Vault que
  -- este mismo fichero siembra más abajo (identificacion_cifrado_v1 e
  -- identificacion_indice_v1, versión 1):
  --   · texto claro: '87654321X' (DNI inventado con letra de control válida, ya normalizado
  --     como lo deja normalizarNif());
  --   · nonce FIJO = los 12 primeros bytes de sha256('demo-nonce-carmen'). Un nonce fijo es
  --     inadmisible con una clave real; aquí la clave es pública y el fichero es de demo;
  --   · dni_cifrado y dni_etiqueta = AES-256-GCM(clave de cifrado, nonce, texto);
  --   · dni_indice = HMAC-SHA-256(clave de índice, texto).
  -- Si se cambian las claves de juguete, esta fila vuelve a ser ilegible: hay que
  -- recalcularla con ellas.
  insert into public.pacientes_identificacion
    (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice,
     dni_clave_version, dni_indice_clave_version, creado_en, actualizado_en)
  values
    (k_p_carmen, 'dni',
     '\xfe6ad32e939a2713a7'::bytea,
     '\xb035654231be48faa5f78727'::bytea,
     '\xff87b95266af16fd94e6773e574708cc'::bytea,
     '\x1f3994dd9ddfb652ada76c51bf489d91bba869c46079730fde1d54b336528e3e'::bytea,
     1, 1, k_fecha_base, k_fecha_base)
  on conflict (paciente_id) do nothing;

  -- -----------------------------------------------------------------------
  -- 5 · El menor: dos representantes y un consentimiento con DOS firmas
  --
  -- Es el caso del ADR-028, y el que rompe las pantallas que dan por hecho un
  -- firmante. Los dos con patria potestad: el consentimiento asistencial de un
  -- menor lo firman ambos progenitores, y `menor_oido_en` deja constancia de que
  -- se le oyó, que es requisito propio y no un adorno.
  -- -----------------------------------------------------------------------
  insert into public.representantes_paciente
    (id, paciente_id, nombre, apellidos, tipo, alcance, vigente_desde, telefono, correo, creado_por, creado_en)
  values
    (k_rep_madre, k_p_menor, 'Elena', 'Ortega', 'progenitor', 'patria_potestad', '2011-04-12',
     '600100200', 'elena.ortega@psicogestion.test', k_ana, k_fecha_base),
    (k_rep_padre, k_p_menor, 'Javier', 'Sanz',  'progenitor', 'patria_potestad', '2011-04-12',
     '600300400', 'javier.sanz@psicogestion.test', k_ana, k_fecha_base)
  on conflict (id) do nothing;

  insert into public.consentimientos
    (id, paciente_id, tipo, texto_firmado, texto_version, otorgado_en, menor_oido_en, creado_por, creado_en)
  values
    (k_cons, k_p_menor, 'asistencial',
     'Consentimiento informado para la intervención psicológica del menor.', 'v1',
     k_fecha_base, (k_fecha_base - interval '1 day')::date, k_ana, k_fecha_base)
  on conflict (id) do nothing;

  insert into public.consentimiento_firmantes
    (id, consentimiento_id, nombre_completo, representante_id, firmado_en, creado_en)
  values
    ('a0080005-0000-4000-8000-000000000001', k_cons, 'Elena Ortega',  k_rep_madre, k_fecha_base, k_fecha_base),
    ('a0080005-0000-4000-8000-000000000002', k_cons, 'Javier Sanz',   k_rep_padre, k_fecha_base, k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 6 · Episodio de pareja (ADR-030)
  --
  -- Dos pacientes dentro del mismo episodio. Es lo que hace que una nota pueda ser
  -- `conjunta`, y `alcance = 'conjunta'` es la rama de participación de
  -- `notas_clinicas_versiones_lectura`: sin este episodio no hay forma de ejercer
  -- esa rama con datos de verdad.
  -- -----------------------------------------------------------------------
  insert into public.episodios_asistenciales
    (id, paciente_id, profesional_id, centro_id, modalidad_relacional, motivo_consulta, abierto_en, creado_en)
  values
    (k_epi_pareja, k_p_sofia, k_ana, k_c_madrid, 'pareja',
     'Terapia de pareja: comunicación y gestión de conflictos', (k_fecha_base - interval '60 days')::date, k_fecha_base)
  on conflict (id) do nothing;

  insert into public.episodio_participantes (id, episodio_id, paciente_id, papel, alta_en) values
    ('a0080006-0000-4000-8000-000000000001', k_epi_pareja, k_p_sofia, 'miembro',
     (k_fecha_base - interval '60 days')::date),
    ('a0080006-0000-4000-8000-000000000002', k_epi_pareja, k_p_hugo,  'miembro',
     (k_fecha_base - interval '60 days')::date)
  on conflict (id) do nothing;

  -- T-034 (ADR-071): toda nota cuelga de un episodio, y del de su autor. Los dos
  -- pacientes con notas individuales tienen el suyo, abierto antes de todas sus notas.
  insert into public.episodios_asistenciales
    (id, paciente_id, profesional_id, centro_id, modalidad_relacional, motivo_consulta, abierto_en, creado_en)
  values
    (k_epi_carmen, k_p_carmen, k_ana,  k_c_madrid,   'individual', null,
     (k_fecha_base - interval '30 days')::date, k_fecha_base),
    (k_epi_ivan,   k_p_ivan,   k_baja, k_c_canarias, 'individual', null,
     (k_fecha_base - interval '45 days')::date, k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 7 · Notas, en sus tres estados
  --
  -- La de borrador se queda SIN versión a propósito: `fn_vaciar_borrador_al_firmar()`
  -- (T-005) vacía el borrador en cuanto entra la primera versión, así que una nota
  -- no puede estar firmada y con borrador a la vez. Son estados excluyentes y la
  -- siembra tiene que enseñar los dos.
  -- -----------------------------------------------------------------------
  insert into public.notas_clinicas
    (id, paciente_id, episodio_id, autor_id, fecha_sesion, borrador_contenido,
     borrador_actualizado_en, borrador_autor_id, creada_en) values
    (k_n_borrador, k_p_carmen, k_epi_carmen, k_ana, (k_fecha_base - interval '2 days')::date,
     '{"texto":"Sesión 4. Pendiente de repasar el registro de la semana."}'::jsonb,
     k_fecha_base - interval '2 days', k_ana, k_fecha_base - interval '2 days')
  on conflict (id) do nothing;

  insert into public.notas_clinicas
    (id, paciente_id, episodio_id, autor_id, fecha_sesion, creada_en) values
    (k_n_firmada,   k_p_carmen, k_epi_carmen, k_ana,  (k_fecha_base - interval '9 days')::date,  k_fecha_base - interval '9 days'),
    (k_n_corregida, k_p_carmen, k_epi_carmen, k_ana,  (k_fecha_base - interval '16 days')::date, k_fecha_base - interval '16 days'),
    (k_n_conjunta,  k_p_sofia,  k_epi_pareja, k_ana,  (k_fecha_base - interval '5 days')::date,  k_fecha_base - interval '5 days'),
    (k_n_de_baja,   k_p_ivan,   k_epi_ivan,   k_baja, (k_fecha_base - interval '30 days')::date, k_fecha_base - interval '30 days')
  on conflict (id) do nothing;

  -- Las versiones no tienen identificador fijo (lo pone la base), así que la
  -- idempotencia se consigue con una guarda, no con `on conflict`. Sin ella, un
  -- segundo `npm run seed` alargaría las cadenas — y duplicar filas es justo lo
  -- que el criterio de aceptación prohíbe.
  if not exists (select 1 from public.notas_clinicas_versiones where nota_id = k_n_firmada) then

    insert into public.notas_clinicas_versiones
      (nota_id, cuerpo, anotaciones_reservadas, contenido_canonico, motivo_cambio, alcance,
       esquema_version, autor_id, creada_en)
    values (
      k_n_firmada,
      '{"texto":"Sesión 3. Trabajo con registro de pensamientos automáticos."}'::jsonb,
      'Impresión clínica preliminar, no compartida con el paciente.',
      pg_temp.sobre(k_n_firmada, k_ana, k_fecha_base - interval '9 days',
        '{"texto":"Sesión 3. Trabajo con registro de pensamientos automáticos."}',
        'Impresión clínica preliminar, no compartida con el paciente.'),
      null, 'individual', 4, k_ana, k_fecha_base - interval '9 days');

    -- La nota corregida: DOS versiones encadenadas. La segunda lleva
    -- `motivo_cambio`, que es lo que hace visible la corrección — corregir no es
    -- editar: se añade una versión nueva y la anterior sigue ahí, encadenada por
    -- su huella.
    insert into public.notas_clinicas_versiones
      (nota_id, cuerpo, anotaciones_reservadas, contenido_canonico, motivo_cambio, alcance,
       esquema_version, autor_id, creada_en)
    values (
      k_n_corregida,
      '{"texto":"Sesión 2. Se acuerda pauta de exposición gradual."}'::jsonb,
      null,
      pg_temp.sobre(k_n_corregida, k_ana, k_fecha_base - interval '16 days',
        '{"texto":"Sesión 2. Se acuerda pauta de exposición gradual."}'),
      null, 'individual', 4, k_ana, k_fecha_base - interval '16 days');

    insert into public.notas_clinicas_versiones
      (nota_id, cuerpo, anotaciones_reservadas, contenido_canonico, motivo_cambio, alcance,
       esquema_version, autor_id, creada_en)
    values (
      k_n_corregida,
      '{"texto":"Sesión 2. Se acuerda pauta de exposición gradual, empezando por la situación 3 de la jerarquía."}'::jsonb,
      null,
      pg_temp.sobre(k_n_corregida, k_ana, k_fecha_base - interval '15 days',
        '{"texto":"Sesión 2. Se acuerda pauta de exposición gradual, empezando por la situación 3 de la jerarquía."}',
        null,
        'Se concreta la situación de inicio, que quedó sin anotar en la sesión.'),
      'Se concreta la situación de inicio, que quedó sin anotar en la sesión.',
      'individual', 4, k_ana, k_fecha_base - interval '15 days');

    -- Nota conjunta del episodio de pareja: `alcance = 'conjunta'` solo es legal
    -- si la nota tiene episodio (ADR-030, comprobado por disparador).
    insert into public.notas_clinicas_versiones
      (nota_id, cuerpo, anotaciones_reservadas, contenido_canonico, motivo_cambio, alcance,
       esquema_version, autor_id, creada_en)
    values (
      k_n_conjunta,
      '{"texto":"Sesión de pareja. Se trabaja el turno de palabra en las discusiones."}'::jsonb,
      null,
      pg_temp.sobre(k_n_conjunta, k_ana, k_fecha_base - interval '5 days',
        '{"texto":"Sesión de pareja. Se trabaja el turno de palabra en las discusiones."}',
        null, null, 'conjunta'),
      null, 'conjunta', 4, k_ana, k_fecha_base - interval '5 days');

    -- La nota de la profesional que después se da de baja. Firmada por ella y
    -- suya para siempre: la baja quita el acceso, no la autoría.
    insert into public.notas_clinicas_versiones
      (nota_id, cuerpo, anotaciones_reservadas, contenido_canonico, motivo_cambio, alcance,
       esquema_version, autor_id, creada_en)
    values (
      k_n_de_baja,
      '{"texto":"Sesión de seguimiento. Continúa la mejoría del sueño."}'::jsonb,
      null,
      pg_temp.sobre(k_n_de_baja, k_baja, k_fecha_base - interval '30 days',
        '{"texto":"Sesión de seguimiento. Continúa la mejoría del sueño."}'),
      null, 'individual', 4, k_baja, k_fecha_base - interval '30 days');

  end if;

  -- -----------------------------------------------------------------------
  -- 8 · Alertas de documentación con antigüedades ESCALONADAS
  --
  -- De aquí salen la bandeja y las métricas, y lo que hay que poder ver es el
  -- escalón: dos días, diez días y treinta y cinco días no se pintan igual. Va una
  -- resuelta también, o la pantalla de «no queda nada» no se puede probar.
  --
  -- `origen_tabla` NO es texto libre: tiene un `check` que solo admite
  -- `notas_clinicas`, `consentimientos`, `informes` y `evaluaciones` (comprobado con
  -- `pg_get_constraintdef`; sembrar `'pacientes'` muere con 23514). Y `origen_id`
  -- apunta a una fila que EXISTE de verdad en esa tabla: una alerta que señala a un
  -- identificador inventado no se puede abrir desde la bandeja, que es justo para lo
  -- que la siembra existe.
  -- -----------------------------------------------------------------------
  insert into public.alertas_documentacion
    (id, paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id,
     fecha_referencia, estado, resuelta_en, creada_en) values
    ('a0080007-0000-4000-8000-000000000001', k_p_carmen, k_ana, k_c_madrid,
     'borrador_abandonado', 'notas_clinicas', k_n_borrador,
     (k_fecha_base - interval '2 days')::date, 'abierta', null, k_fecha_base - interval '2 days'),
    ('a0080007-0000-4000-8000-000000000002', k_p_menor, k_ana, k_c_madrid,
     'consentimiento_pendiente', 'consentimientos', k_cons,
     (k_fecha_base - interval '10 days')::date, 'abierta', null, k_fecha_base - interval '10 days'),
    ('a0080007-0000-4000-8000-000000000003', k_p_ivan, k_baja, k_c_canarias,
     'nota_sin_firmar', 'notas_clinicas', k_n_de_baja,
     (k_fecha_base - interval '35 days')::date, 'abierta', null, k_fecha_base - interval '35 days'),
    ('a0080007-0000-4000-8000-000000000004', k_p_carmen, k_ana, k_c_madrid,
     'borrador_abandonado', 'notas_clinicas', k_n_firmada,
     (k_fecha_base - interval '20 days')::date, 'resuelta', k_fecha_base - interval '18 days',
     k_fecha_base - interval '20 days')
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 8.bis · T-028a · Lo que el alta de cita necesita para verse
  --
  -- Tipos de terapia, franjas, un festivo futuro y una paciente con citas pasadas
  -- (la de los martes). EXCEPCIÓN a «todo instante cuelga de k_fecha_base»: aquí las
  -- fechas son RELATIVAS a current_date, a propósito. Un festivo con fecha absoluta
  -- caduca (debe ser futuro) y las seis citas deben ser pasadas siempre: una siembra
  -- con fechas fijas dejaría de enseñar lo que enseña. Sigue siendo determinista dentro
  -- de un mismo día, y idempotente: uuids fijos y `on conflict (id) do nothing`.
  --
  -- k_diego (paciente de Bruno) se queda SIN citas a propósito: es el paciente sin
  -- historial de horas, y no necesita ninguna fila.
  -- -----------------------------------------------------------------------
  insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen, activo) values
    ('e0280001-0000-4000-8000-000000000001', 'Sesión individual',            50, 'exento_sanitario', true),
    ('e0280001-0000-4000-8000-000000000002', 'Sesión de pareja',             90, 'exento_sanitario', true),
    ('e0280001-0000-4000-8000-000000000003', 'Sesión breve de seguimiento',  30, 'exento_sanitario', true),
    ('e0280001-0000-4000-8000-000000000004', 'Sesión de grupo',              90, 'exento_sanitario', false)
  on conflict (id) do nothing;

  -- Franjas de lunes a viernes, de 09:00 a 14:00 y de 16:00 a 20:00, para Ana y Bruno
  -- (los dos en Madrid). Bárbara (k_baja) no recibe ninguna.
  insert into public.disponibilidad
    (id, perfil_id, centro_id, tipo, dia_semana, hora_inicio, hora_fin, desde, hasta, zona_horaria)
  select format('e0280002-0000-4000-8000-%s', lpad((row_number() over (order by p.ord, d.dia, t.ord))::text, 12, '0'))::uuid,
         p.id, k_c_madrid, 'franja', d.dia, t.ini, t.fin, current_date - 7, null, 'Europe/Madrid'
    from (values (1, k_ana), (2, k_bruno)) as p(ord, id)
   cross join generate_series(1, 5) as d(dia)
   cross join (values (1, time '09:00', time '14:00'), (2, time '16:00', time '20:00')) as t(ord, ini, fin)
  on conflict (id) do nothing;

  -- El festivo cae en el primer MARTES entre hoy + 14 y hoy + 20 (R2-H3): un día con franjas
  -- de Ana sea cual sea el día de la semana en que se siembra, y dentro de los 56 días que
  -- enseña el alta. Con `current_date + 14` a secas, sembrar en fin de semana lo dejaba en
  -- un día sin franjas, donde no se ve.
  insert into public.disponibilidad
    (id, perfil_id, centro_id, tipo, desde, hasta, zona_horaria, motivo)
  select 'e0280003-0000-4000-8000-000000000001', k_ana, k_c_madrid, 'festivo',
         f.dia, f.dia, 'Europe/Madrid', 'Festivo local'
    from (select current_date + 14
                 + ((2 - extract(isodow from current_date + 14)::int + 7) % 7) as dia) f
  on conflict (id) do nothing;

  -- Lucía (de Ana): seis martes pasados de 12:00 a 12:50, el último estrictamente
  -- anterior a hoy. Realizadas: el historial real de a qué hora viene. Entran como
  -- PROGRAMADAS y pasan a realizadas con un update (R2-H2), como lo haría la aplicación:
  -- así el disparador alertar_nota_sin_firmar abre las seis alertas «nota sin firmar» y
  -- marcada_realizada_en/_por quedan rellenos. El update solo toca las que siguen
  -- programadas, así que resembrar no lo repite.
  insert into public.citas
    (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria,
     estado, creada_por)
  select format('e0280004-0000-4000-8000-%s', lpad((k + 1)::text, 12, '0'))::uuid,
         'd0080001-0000-4000-8000-000000000001', k_ana, k_c_madrid,
         'e0280001-0000-4000-8000-000000000001',
         ((m.martes - 7 * k) + time '12:00') at time zone 'Europe/Madrid',
         ((m.martes - 7 * k) + time '12:50') at time zone 'Europe/Madrid',
         'Europe/Madrid', 'programada', k_ana
    from (select current_date - (((extract(isodow from current_date)::int - 2 + 6) % 7) + 1) as martes) m
   cross join generate_series(0, 5) as k
  on conflict (id) do nothing;

  update public.citas c
     set estado = 'realizada', marcada_realizada_en = c.fin, marcada_realizada_por = k_ana
   where c.id in (select format('e0280004-0000-4000-8000-%s', lpad(k::text, 12, '0'))::uuid
                    from generate_series(1, 6) as k)
     and c.estado = 'programada';

  -- -----------------------------------------------------------------------
  -- 8.ter · T-039 · La cita en su episodio y la modalidad de asistencia (ADR-075)
  --
  -- Dos citas del próximo martes de Ana, por la PUERTA REAL (agenda_crear_cita), con la sesión
  -- de quien la daría: la de Sofía, de pareja, en el episodio de pareja (la da Ana) y la de
  -- Carmen, ONLINE (la da el técnico, que no elige episodio). Una siembra que inserta a mano
  -- prueba el esquema, no el producto (B-H3). Idempotente por guardas, no por uuid: la función
  -- genera el id. La sesión se simula con los claims, que se limpian al acabar.
  -- -----------------------------------------------------------------------
  v_martes := current_date + (8 - extract(isodow from current_date)::int) + 1;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_ana, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.citas c
                  where c.paciente_id = k_p_sofia and c.episodio_id = k_epi_pareja and c.inicio > now()) then
    perform public.agenda_crear_cita(k_p_sofia, k_ana, k_c_madrid,
      'e0280001-0000-4000-8000-000000000002', v_martes, time '16:00',
      p_episodio_id => k_epi_pareja);
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', k_tec, 'role', 'authenticated')::text, true);
  if not exists (select 1 from public.citas c
                  where c.paciente_id = k_p_carmen and c.modalidad_asistencia = 'online' and c.inicio > now()) then
    perform public.agenda_crear_cita(k_p_carmen, k_ana, k_c_madrid,
      'e0280001-0000-4000-8000-000000000001', v_martes, time '10:00',
      p_modalidad_asistencia => 'online');
  end if;
  perform set_config('request.jwt.claims', '', true);

  -- -----------------------------------------------------------------------
  -- 9 · Y AHORA la baja, no antes
  --
  -- El orden importa y es la razón de que esto esté al final: la profesional tenía
  -- que firmar primero. Con la baja puesta, `rol_actual()` devuelve nulo para ella
  -- y deja de ver absolutamente todo (ADR-032) — pero su nota sigue ahí, firmada,
  -- con su nombre dentro del sobre sellado. Es el caso que demuestra que la
  -- autoría sobrevive al acceso, y no se puede sembrar en otro orden.
  -- -----------------------------------------------------------------------
  update public.perfiles
     set estado        = 'baja',
         estado_desde  = k_fecha_base,
         motivo_estado = 'Fin de la colaboración (siembra de demostración)'
   where id = k_baja
     and estado <> 'baja';

  raise notice 'seed-completo: sembrado.';
end;
$seed$;

-- -----------------------------------------------------------------------
-- 10 · Vault · claves de cifrado de identificación (T-032, ADR-029)
--
-- MISMOS VALORES LITERALES que supabase/seed.sql: si los dos guiones sembraran
-- valores distintos, lo cifrado por uno no lo descifraría el otro. Idempotente
-- (`where not exists`): este fichero corre sobre una base que ya pasó por
-- `db reset`, que ya sembró estos dos secretos con seed.sql.
-- -----------------------------------------------------------------------
select vault.create_secret('CKKnf5zj9mjBlvO1nUbdgoerSA6Es4+iCLqNxV65MQc=', 'identificacion_cifrado_v1',
  'T-032 · AES-256-GCM de pacientes_identificacion (ADR-029). CLAVE DE JUGUETE.')
where not exists (select 1 from vault.secrets where name = 'identificacion_cifrado_v1');

select vault.create_secret('2gysmbQSmS2xXSPmn6eqBXSlW2nV7kDghHmIK29N8H0=', 'identificacion_indice_v1',
  'T-032 · HMAC-SHA-256 del índice ciego (ADR-029). OTRA clave, a propósito. DE JUGUETE.')
where not exists (select 1 from vault.secrets where name = 'identificacion_indice_v1');
