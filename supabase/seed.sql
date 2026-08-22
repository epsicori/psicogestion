-- Ejecutado automáticamente por `npx supabase db reset` (supabase/config.toml,
-- [db.seed] sql_paths = ["./seed.sql"]). No crear npm run seed aquí: eso es T-008.
--
-- Dos usuarios de prueba, ambos profesional_sanitario, con un paciente cada uno.
-- Orden obligatorio: auth.users → auth.identities → public.perfiles → public.pacientes.
-- Esquema verificado con:
--   docker exec supabase_db_Psicogestion psql -U postgres -d postgres \
--     -c "\d auth.users" -c "\d auth.identities"

-- =========================================================================
-- auth.users
-- =========================================================================

-- confirmation_token, recovery_token, email_change_token_new y email_change son
-- character varying SIN default (a diferencia de phone_change_token,
-- email_change_token_current o reauthentication_token, que sí traen
-- ''::character varying). Sin valor explícito quedan NULL, y GoTrue v2 los escanea
-- como string de Go al buscar el usuario: "converting NULL to string is unsupported"
-- y el login responde 500. Comprobado contra las 27 columnas de auth.users vía
-- information_schema.columns: son las únicas NOT NULL-en-la-práctica (varchar sin
-- default) que la aplicación deja sin rellenar; el resto o admite NULL sin que
-- GoTrue lo escanee como string, o ya trae default propio.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'ana@psicogestion.test',
    extensions.crypt('psico1234', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'bruno@psicogestion.test',
    extensions.crypt('psico1234', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '',
    '',
    '',
    ''
  );

-- =========================================================================
-- auth.identities — sin esta fila el login por contraseña falla (error clásico)
-- =========================================================================

insert into auth.identities (
  id,
  user_id,
  provider,
  provider_id,
  identity_data,
  created_at,
  updated_at
) values
  (
    gen_random_uuid(),
    '11111111-1111-4111-8111-111111111111',
    'email',
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_object(
      'sub', '11111111-1111-4111-8111-111111111111',
      'email', 'ana@psicogestion.test'
    ),
    now(),
    now()
  ),
  (
    gen_random_uuid(),
    '22222222-2222-4222-8222-222222222222',
    'email',
    '22222222-2222-4222-8222-222222222222',
    jsonb_build_object(
      'sub', '22222222-2222-4222-8222-222222222222',
      'email', 'bruno@psicogestion.test'
    ),
    now(),
    now()
  );

-- =========================================================================
-- public.perfiles
-- =========================================================================

insert into public.perfiles (id, nombre_completo, rol) values
  ('11111111-1111-4111-8111-111111111111', 'Ana', 'profesional_sanitario'),
  ('22222222-2222-4222-8222-222222222222', 'Bruno', 'profesional_sanitario');

-- =========================================================================
-- public.pacientes
-- =========================================================================

-- Dispara fn_auditar() con auth.uid() nulo (no hay JWT en la siembra): dos registros
-- de auditoría con actor_id = null. Correcto; el criterio 5 se mide con sesión real.
insert into public.pacientes (nombre, apellidos, profesional_id) values
  ('Lucía', 'Márquez', '11111111-1111-4111-8111-111111111111'),
  ('Diego', 'Ferrer', '22222222-2222-4222-8222-222222222222');
