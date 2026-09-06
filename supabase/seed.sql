-- =============================================================================
-- T-008 · Siembra MÍNIMA. Ejecutada automáticamente por `npx supabase db reset`
-- (supabase/config.toml, [db.seed] sql_paths = ["./seed.sql"]).
--
-- NADA DE ESTO LLEGA A PRODUCCIÓN. Contraseñas de desarrollo en claro, correos
-- @psicogestion.test y una sal de bcrypt fija.
--
-- EL REPARTO, que es la decisión que este ticket tenía que tomar y dejar escrita
-- («una sola verdad por dato»):
--
--   supabase/seed.sql          ← ESTE FICHERO. Lo mínimo para que la aplicación
--                                arranque y para que el banco de pruebas de T-005
--                                encuentre lo que da por hecho: la organización,
--                                UN centro, un administrador y los dos
--                                profesionales históricos (Ana y Bruno) con un
--                                paciente cada uno.
--   supabase/seed-completo.sql ← `npm run seed`. TODO lo demás: el segundo centro
--                                en Atlantic/Canary, el técnico, el profesional de
--                                baja, los casos raros, las notas encadenadas y
--                                las alertas.
--
-- POR QUÉ ASÍ, y no todo aquí: este fichero corre en CADA `db reset`, incluido el
-- que precede a `npm run test:rls`. Todo lo que se añada aquí lo ve el banco de
-- pruebas, y el banco cuenta filas. Lo pesado vive detrás de `npm run seed`, que
-- es opt-in, para que la superficie que el banco tiene que tolerar sea pequeña y
-- esté enumerada.
--
-- POR QUÉ ANA Y BRUNO SIGUEN AQUÍ Y NO SE PUEDEN MOVER: el vector de regresión
-- congelado de T-005 (lib/huella/vectores-congelados.json) trae el autor fijo
-- 11111111-1111-4111-8111-111111111111 DENTRO del sobre firmado, y
-- scripts/rls/13-cadena-huellas.sql lo inserta tal cual por el disparador real.
-- Si Ana deja de existir en la siembra mínima, esa prueba deja de poder correr —y
-- el sobre no se puede recalcular: es lo que el ADR-035 prohíbe.
--
-- POR QUÉ UN BLOQUE `do $$` Y NO `\set`: el seed lo ejecuta el CLI de Supabase por
-- su propio canal, no por psql, y **los metacomandos de psql no existen ahí**
-- (`\set` muere con «syntax error at or near "\"», SQLSTATE 42601 — comprobado).
-- Las constantes van declaradas en el bloque, que es la única forma de tener una
-- sola verdad por identificador sin repetir literales por todo el fichero.
--
-- DETERMINISMO (criterio de aceptación): ni `random()`, ni `gen_random_uuid()`, ni
-- `now()` suelto. Todo identificador es literal y todo instante cuelga de
-- `k_fecha_base`. La sal de bcrypt también es fija, o el hash cambiaría en cada
-- ejecución y dos siembras desde cero no darían el mismo resultado.
--
-- Esquema verificado contra la base local antes de escribir (nunca de memoria):
--   docker exec supabase_db_Psicogestion psql -U postgres -d postgres \
--     -c "\d auth.users" -c "\d auth.identities"
-- =============================================================================

do $seed$
declare
  k_fecha_base constant timestamptz := '2026-09-01 09:00:00+02';
  k_sal        constant text        := '$2a$06$psicogestionsemilla123';

  k_org      constant uuid := '90080001-0000-4000-8000-000000000001';
  k_c_madrid constant uuid := 'c0080001-0000-4000-8000-00000000000a';

  k_adm   constant uuid := 'b0080001-0000-4000-8000-000000000001';
  k_ana   constant uuid := '11111111-1111-4111-8111-111111111111';
  k_bruno constant uuid := '22222222-2222-4222-8222-222222222222';

  k_lucia constant uuid := 'd0080001-0000-4000-8000-000000000001';
  k_diego constant uuid := 'd0080001-0000-4000-8000-000000000002';
begin

  -- -----------------------------------------------------------------------
  -- 1 · Organización (fila única) y el centro principal
  --
  -- `on conflict (fila_unica) do nothing`, y no sobre `id`: la restricción que
  -- hace única a esta tabla es `organizacion_fila_unica_key`. Es la que chocaría
  -- si alguien la sembrara dos veces, y también la que hace falta para que la
  -- fijación del banco de RLS —que inserta la suya— pueda convivir con una base
  -- ya sembrada.
  -- -----------------------------------------------------------------------
  insert into public.organizacion (id, razon_social, nif, zona_horaria, creado_en, actualizado_en)
  values (k_org, 'Psicogestión Demo SL', 'B00080001', 'Europe/Madrid', k_fecha_base, k_fecha_base)
  on conflict (fila_unica) do nothing;

  insert into public.centros (id, nombre, localidad, provincia, codigo_postal, zona_horaria, creado_en)
  values (k_c_madrid, 'Centro Madrid', 'Madrid', 'Madrid', '28013', 'Europe/Madrid', k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 2 · auth.users
  --
  -- `confirmation_token`, `recovery_token`, `email_change_token_new` y
  -- `email_change` son `character varying` SIN default (a diferencia de
  -- `phone_change_token`, `email_change_token_current` o `reauthentication_token`,
  -- que sí traen `''::character varying`). Sin valor explícito quedan NULL, y
  -- GoTrue v2 los escanea como string de Go al buscar el usuario: «converting NULL
  -- to string is unsupported» y el login responde 500. La cadena vacía NO choca
  -- con los índices únicos parciales de esas columnas: su condición es
  -- `!~ '^[0-9 ]*$'` y la cadena vacía SÍ casa con ese patrón, así que queda
  -- fuera del índice y varios usuarios pueden compartirla.
  --
  -- El perfil de `public.perfiles` lo crea el disparador `crear_perfil_de_usuario`
  -- a partir de `raw_user_meta_data ->> 'rol'`, y es FALLO CERRADO: sin un rol
  -- válido ahí, este mismo `insert` falla.
  -- -----------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values
    ('00000000-0000-0000-0000-000000000000', k_adm, 'authenticated', 'authenticated',
     'admin@psicogestion.test', extensions.crypt('psico1234', k_sal),
     k_fecha_base, k_fecha_base, k_fecha_base,
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"rol":"administrador","nombre_completo":"Álvaro Administrador"}'::jsonb,
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', k_ana, 'authenticated', 'authenticated',
     'ana@psicogestion.test', extensions.crypt('psico1234', k_sal),
     k_fecha_base, k_fecha_base, k_fecha_base,
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('rol', 'profesional_sanitario', 'nombre_completo', 'Ana Márquez',
                        'centro_id', k_c_madrid),
     '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', k_bruno, 'authenticated', 'authenticated',
     'bruno@psicogestion.test', extensions.crypt('psico1234', k_sal),
     k_fecha_base, k_fecha_base, k_fecha_base,
     '{"provider":"email","providers":["email"]}'::jsonb,
     jsonb_build_object('rol', 'profesional_sanitario', 'nombre_completo', 'Bruno Ferrer',
                        'centro_id', k_c_madrid),
     '', '', '', '')
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 3 · auth.identities — sin esta fila el login por contraseña falla
  --
  -- `id` literal y no `gen_random_uuid()`: el criterio de determinismo pide los
  -- MISMOS UUID en dos ejecuciones desde cero, y esta tabla no estaba exenta.
  -- -----------------------------------------------------------------------
  insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
  values
    ('a0080001-0000-4000-8000-000000000001', k_adm, 'email', k_adm::text,
     jsonb_build_object('sub', k_adm::text, 'email', 'admin@psicogestion.test'), k_fecha_base, k_fecha_base),
    ('a0080001-0000-4000-8000-000000000002', k_ana, 'email', k_ana::text,
     jsonb_build_object('sub', k_ana::text, 'email', 'ana@psicogestion.test'), k_fecha_base, k_fecha_base),
    ('a0080001-0000-4000-8000-000000000003', k_bruno, 'email', k_bruno::text,
     jsonb_build_object('sub', k_bruno::text, 'email', 'bruno@psicogestion.test'), k_fecha_base, k_fecha_base)
  on conflict (id) do nothing;

  -- -----------------------------------------------------------------------
  -- 4 · public.perfiles
  --
  -- El disparador de arriba YA los ha creado. Este `insert` se conserva como
  -- declaración explícita de lo que la siembra espera encontrar —y como red si el
  -- disparador desapareciera—, por eso lleva `on conflict do update`. El
  -- administrador NO lleva centro: solo el técnico administrativo lo tiene
  -- obligatorio (ADR-033).
  -- -----------------------------------------------------------------------
  insert into public.perfiles (id, nombre_completo, rol, centro_id, creado_en, estado_desde) values
    (k_adm,   'Álvaro Administrador', 'administrador',         null,       k_fecha_base, k_fecha_base),
    (k_ana,   'Ana Márquez',          'profesional_sanitario', k_c_madrid, k_fecha_base, k_fecha_base),
    (k_bruno, 'Bruno Ferrer',         'profesional_sanitario', k_c_madrid, k_fecha_base, k_fecha_base)
  on conflict (id) do update
    set nombre_completo = excluded.nombre_completo,
        rol             = excluded.rol;

  -- -----------------------------------------------------------------------
  -- 5 · public.pacientes
  --
  -- Un paciente por profesional, lo justo para el paseo vertical de T-000, con
  -- identificador FIJO y no `gen_random_uuid()`: los criterios de T-008 comparan
  -- los UUID entre dos ejecuciones desde cero.
  --
  -- Dispara `fn_auditar()` con `auth.uid()` nulo (no hay JWT en la siembra): las
  -- filas de auditoría salen con `actor_id` nulo. Es correcto y está previsto: la
  -- columna es anulable a propósito.
  -- -----------------------------------------------------------------------
  insert into public.pacientes (id, nombre, apellidos, profesional_id, creado_en) values
    (k_lucia, 'Lucía', 'Márquez', k_ana,   k_fecha_base),
    (k_diego, 'Diego', 'Ferrer',  k_bruno, k_fecha_base)
  on conflict (id) do nothing;

end;
$seed$;
