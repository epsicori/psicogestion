-- T-038 · CA4 (ronda 2) · Dos generaciones/regeneraciones CONCURRENTES del mismo titular.
--
-- No cabe en el banco de RLS (una transacción no se solapa consigo misma): necesita DOS
-- CONEXIONES y datos CONFIRMADOS. Lo orquesta scripts/t038-concurrencia.mjs, que llama a
-- este fichero una vez por fase (`-v fase_fijar=1`, `-v fase_copia=1`, …) y lanza entre
-- fase y fase los procesos psql solapados.
--
-- CONFIRMA filas y SUS FILAS QUEDAN (auditoria es de solo adición): crea cuatro perfiles
-- propios de esta prueba con UUID fijos. NO ES IDEMPOTENTE: repetirla sin
-- `npx supabase db reset` falla al repetir los UUID, y es la señal correcta.
--
-- Perfiles:
--   A · regeneración de producción (con candado de consejo y candado de fila del consumo).
--   B · regeneración con una copia SIN el candado de consejo (medición, R2-3): el candado de
--       fila del consumo de la autorización serializa por sí solo.
--   C · activación de producción (generar_codigos_recuperacion) sobre un perfil sin lote.
--   D · activación con una copia SIN candado (contraensayo en rojo): tiene que dejar ≠ 10.
--
-- A y B parten con un lote previo de diez; C y D, sin lote.
--
-- Las copias (A-H7) se crean con revoke a public y anon y una comprobación que PARA si
-- anon pudiera ejecutarlas: una copia sin candado de un definer no puede quedar abierta.
--
-- `psql` no interpola `:VAR` dentro de un bloque `$$`, así que los UUID de los `do $$`
-- van escritos a mano y coinciden con los \set de abajo.

\set ON_ERROR_STOP 1
\set PA '\'c0380001-0000-4000-8000-00000000000a\''
\set PB '\'c0380001-0000-4000-8000-00000000000b\''
\set PC '\'c0380001-0000-4000-8000-00000000000c\''
\set PD '\'c0380001-0000-4000-8000-00000000000d\''

-- ---------------------------------------------------------------------------------------
\if :{?fase_fijar}
\echo '--- fijación confirmada: cuatro perfiles con contraseña, factor reciente y (A, B) un lote ---'
select centro_id as t38_centro from public.perfiles
 where id = '11111111-1111-4111-8111-111111111111' \gset

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, encrypted_password,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email, now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       ('{"rol":"profesional_sanitario","nombre_completo":"' || v.nombre || '","centro_id":"' || :'t38_centro' || '"}')::jsonb,
       extensions.crypt('clave-t038', extensions.gen_salt('bf', 4)), '', '', '', ''
from (values (:PA::uuid, 't038a@concurrencia.test', 'Concurrencia A'),
             (:PB::uuid, 't038b@concurrencia.test', 'Concurrencia B'),
             (:PC::uuid, 't038c@concurrencia.test', 'Concurrencia C'),
             (:PD::uuid, 't038d@concurrencia.test', 'Concurrencia D')) as v(id, email, nombre);

-- last_challenged_at lleva un índice único GLOBAL: un desfase distinto por perfil.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret, last_challenged_at)
values (gen_random_uuid(), :PA, 't038-a', 'totp', 'verified', now(), now(), 'SECRETODEPRUEBA', now() - interval '31 seconds'),
       (gen_random_uuid(), :PB, 't038-b', 'totp', 'verified', now(), now(), 'SECRETODEPRUEBA', now() - interval '32 seconds'),
       (gen_random_uuid(), :PC, 't038-c', 'totp', 'verified', now(), now(), 'SECRETODEPRUEBA', now() - interval '33 seconds'),
       (gen_random_uuid(), :PD, 't038-d', 'totp', 'verified', now(), now(), 'SECRETODEPRUEBA', now() - interval '34 seconds');

insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
select p, extensions.crypt('lote-previo-' || n, extensions.gen_salt('bf', 4))
from (values (:PA::uuid), (:PB::uuid)) as t(p), generate_series(1, 10) n;

select
  (select count(*) from public.codigos_recuperacion_totp where perfil_id in (:PA, :PB) and usado_en is null) as lotes,
  (select count(*) from public.codigos_recuperacion_totp where perfil_id in (:PC, :PD)) as lote_cd \gset t38f_
select (:t38f_lotes = 20 and :t38f_lote_cd = 0) as fijacion_ok \gset
\if :fijacion_ok
\echo 'OK: A y B parten con diez vigentes, C y D sin lote'
\else
do $$ begin raise exception 'FALLO: la fijación no quedó como se esperaba'; end $$;
\endif
\endif

-- ---------------------------------------------------------------------------------------
-- Estado de la autorización de un perfil: `AUTORIZADAS|<perfil>|<n>`.
\if :{?fase_autorizadas}
select 'AUTORIZADAS|' || :'perfil' || '|' ||
       coalesce((select regeneraciones_autorizadas::text from public.intentos_regenerar_codigos where perfil_id = :'perfil'), 'sin-fila') as linea;
\endif

-- ---------------------------------------------------------------------------------------
\if :{?fase_copia}
\echo '--- contraensayo: copias SIN pg_advisory_xact_lock de la regeneración y de la activación ---'
drop function if exists public.t038_regenerar_sin_candado();
drop function if exists public.t038_activar_sin_candado();

select replace(
         regexp_replace(
           pg_get_functiondef('public.regenerar_codigos_recuperacion()'::regprocedure),
           'perform pg_advisory_xact_lock\([^;]*;', '', 'g'),
         'regenerar_codigos_recuperacion', 't038_regenerar_sin_candado') as t38_def_r \gset
select (:'t38_def_r' !~* 'advisory' and :'t38_def_r' ~* 't038_regenerar_sin_candado') as copia_r_ok \gset
\if :copia_r_ok
:t38_def_r;
\echo 'OK: public.t038_regenerar_sin_candado existe y no contiene pg_advisory_xact_lock'
\else
do $$ begin raise exception 'FALLO: la copia sin candado de la regeneración no se pudo fabricar (¿cambió la forma del cuerpo?)'; end $$;
\endif

select replace(
         regexp_replace(
           pg_get_functiondef('public.generar_codigos_recuperacion()'::regprocedure),
           'perform pg_advisory_xact_lock\([^;]*;', '', 'g'),
         'generar_codigos_recuperacion', 't038_activar_sin_candado') as t38_def_a \gset
select (:'t38_def_a' !~* 'advisory' and :'t38_def_a' ~* 't038_activar_sin_candado') as copia_a_ok \gset
\if :copia_a_ok
:t38_def_a;
\echo 'OK: public.t038_activar_sin_candado existe y no contiene pg_advisory_xact_lock'
\else
do $$ begin raise exception 'FALLO: la copia sin candado de la activación no se pudo fabricar (¿cambió la forma del cuerpo?)'; end $$;
\endif

-- A-H7: una copia de un definer no puede quedar ejecutable por anon ni por public.
revoke execute on function public.t038_regenerar_sin_candado() from public, anon;
revoke execute on function public.t038_activar_sin_candado() from public, anon;
grant execute on function public.t038_regenerar_sin_candado() to authenticated;
grant execute on function public.t038_activar_sin_candado() to authenticated;

select (has_function_privilege('anon', 'public.t038_regenerar_sin_candado()', 'execute')
     or has_function_privilege('anon', 'public.t038_activar_sin_candado()', 'execute')) as copia_anon \gset
\if :copia_anon
do $$ begin raise exception 'FALLO: la copia es ejecutable por anon'; end $$;
\else
\echo 'OK: ninguna copia es ejecutable por anon'
\endif
\endif

-- ---------------------------------------------------------------------------------------
-- Cuenta de lo que dejaron las conexiones sobre un perfil. Se imprime una línea
-- `CUENTA|<perfil>|<vigentes>|<avisos codigos_regenerados>|<total>` que recoge el corredor.
\if :{?fase_cuenta}
select 'CUENTA|' || :'perfil' || '|' ||
       (select count(*) from public.codigos_recuperacion_totp where perfil_id = :'perfil' and usado_en is null) || '|' ||
       (select count(*) from public.notificaciones where perfil_id = :'perfil' and tipo = 'codigos_regenerados') || '|' ||
       (select count(*) from public.codigos_recuperacion_totp where perfil_id = :'perfil') as linea;
\endif

-- ---------------------------------------------------------------------------------------
\if :{?fase_limpieza}
\echo '--- limpieza: las copias sin candado se borran siempre ---'
drop function if exists public.t038_regenerar_sin_candado();
drop function if exists public.t038_activar_sin_candado();
\endif
