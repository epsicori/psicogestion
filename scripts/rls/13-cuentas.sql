-- T-006 (corte DB) · Invitación, baja, reposición de TOTP y códigos de recuperación.
-- Usa ADM, PRO1, PRO2, TEC1, CA de 01-fijación. Crea sus propios perfiles y pacientes
-- para no acoplarse a PROBAJA, que 04-baja.sql ya dejó en estado 'baja'.

\echo ''
\echo '=== 13-cuentas ==='

\set PROT6  '\'b0060001-0000-4000-8000-000000000001\''
\set PT6PAC '\'d0060001-0000-4000-8000-000000000001\''

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :PROT6, 'authenticated', 'authenticated', 'prot6@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional T006","centro_id":"' || :CA || '"}')::jsonb, '', '', '', '');

select pg_temp.assert(
  (select count(*) from public.perfiles where id = :PROT6) = 1,
  'crear_perfil_de_usuario da de alta el perfil de PROT6'
);

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:PT6PAC, 'Gema', 'DeT006', :PROT6, :CA);

-- es_profesional_asignado() lee (select auth.uid()): hace falta la sesión de PROT6, no
-- la de postgres (que no tiene JWT y por tanto auth.uid() nulo).
call pg_temp.como(:PROT6);
select pg_temp.assert(
  public.es_profesional_asignado(:PT6PAC),
  'ANTES de la baja: PROT6 está asignado a su paciente'
);
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- preparar_invitacion(): un técnico administrativo SIN centro se rechaza EN LA BASE, no
-- solo en el formulario. Gemelas positivas: técnico CON centro, y profesional sin centro.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:ADM);

select pg_temp.assert_lanza_codigo(
  format('select public.preparar_invitacion(%L, null)', 'tecnico_administrativo'),
  '23514',
  'preparar_invitacion() rechaza un técnico administrativo sin centro'
);

select pg_temp.assert_lanza_codigo(
  format('select public.preparar_invitacion(%L, %L)', 'tecnico_administrativo', gen_random_uuid()),
  '23503',
  'preparar_invitacion() rechaza un centro que no existe'
);

select public.preparar_invitacion('tecnico_administrativo'::public.rol_usuario, :CA);
select pg_temp.assert(true, 'preparar_invitacion() ACEPTA un técnico administrativo con centro existente');

select public.preparar_invitacion('profesional_sanitario'::public.rol_usuario, null);
select pg_temp.assert(true, 'preparar_invitacion() ACEPTA un profesional_sanitario sin centro');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.preparar_invitacion(%L, null)', 'profesional_sanitario'),
  '42501',
  'preparar_invitacion() rechaza a quien no es administrador'
);
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- registrar_invitacion(): deja constancia con la sesión real del administrador.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.registrar_invitacion(%L)', :PROT6),
  '42501',
  'registrar_invitacion() rechaza a quien no es administrador'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select public.registrar_invitacion(:PROT6);
call pg_temp.reset_sesion();

select pg_temp.assert(
  exists (select 1 from public.auditoria where operacion = 'CUENTA_INVITADA' and registro_id = :PROT6::text),
  'registrar_invitacion() deja una fila CUENTA_INVITADA en auditoria'
);

-- ---------------------------------------------------------------------------------------
-- dar_de_baja_perfil(): rechazada si no eres administrador, y rechazada sobre el ÚLTIMO
-- administrador activo por la restricción YA EXISTENTE (fn_impedir_baja_ultimo_administrador,
-- T-001) — este ticket no repite esa comprobación (decisión de dominio 3).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo(
  format('select public.dar_de_baja_perfil(%L, %L)', :PROT6, 'prueba'),
  '42501',
  'dar_de_baja_perfil() rechaza a quien no es administrador'
);
call pg_temp.reset_sesion();

-- «El ÚLTIMO administrador activo» es una condición GLOBAL, y esta prueba la daba por
-- hecha porque la fijación era la única fuente de datos. Al integrar T-008, la siembra
-- mínima aporta su propio administrador (`admin@psicogestion.test`) y ADM dejó de ser el
-- último: `dar_de_baja_perfil()` tenía razón al NO lanzar, y la prueba se puso roja con
-- «debía lanzar 23514 y no lanzó nada» — verde o roja por el número de administradores
-- que hubiera sembrados, no por la política.
--
-- Se ESTABLECE la condición en vez de suponerla: cualquier otro administrador activo se
-- pone de baja primero, y entonces ADM sí es el último de verdad. Todo esto vive dentro
-- del `begin … rollback` del banco, así que no toca la base sembrada.
update public.perfiles
   set estado = 'baja', motivo_estado = 'Fijar la condición de «último administrador» del banco'
 where rol = 'administrador' and estado = 'activo' and id <> :ADM;

select pg_temp.assert(
  (select count(*) from public.perfiles where rol = 'administrador' and estado = 'activo') = 1,
  'CONDICIÓN FIJADA: ADM es ahora el único administrador activo, sea cual sea la siembra'
);

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  format('select public.dar_de_baja_perfil(%L, %L)', :ADM, 'autobaja de prueba'),
  '23514',
  'dar_de_baja_perfil() sobre el ÚLTIMO administrador activo (ADM) es rechazada por la base'
);
call pg_temp.reset_sesion();

-- Fija PIN y abre desbloqueo de PROT6 ANTES de la baja, para comprobar el cierre después.
call pg_temp.dar_segundo_factor(:PROT6, interval '5 seconds');
call pg_temp.como_con_2fa(:PROT6);
select public.fijar_pin_historia('555555');
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('555555')),
  'PROT6 desbloquea su historia con su PIN, antes de la baja');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.pines_historia where perfil_id = :PROT6) = 1,
  'ANTES de la baja: PROT6 tiene fila en pines_historia'
);
select pg_temp.assert(
  exists (select 1 from public.desbloqueos_historia
          where perfil_id = :PROT6 and revocado_en is null and caduca_en > now()),
  'ANTES de la baja: PROT6 tiene un desbloqueo vigente'
);

-- PROT6 no es administrador: la baja debe tener éxito.
call pg_temp.como(:ADM);
select desbloqueos_revocados, pin_borrado from public.dar_de_baja_perfil(:PROT6, 'Cese voluntario')
\gset t6_
call pg_temp.reset_sesion();

select pg_temp.assert(:t6_desbloqueos_revocados = 1,
  'dar_de_baja_perfil() revoca el único desbloqueo vigente de PROT6');
select pg_temp.assert((:'t6_pin_borrado')::boolean,
  'dar_de_baja_perfil() borra el PIN de PROT6');

select pg_temp.assert(
  (select count(*) from public.pines_historia where perfil_id = :PROT6) = 0,
  'DESPUÉS de la baja: no queda fila de PROT6 en pines_historia'
);
select pg_temp.assert(
  not exists (select 1 from public.desbloqueos_historia
              where perfil_id = :PROT6 and revocado_en is null and caduca_en > now()),
  'DESPUÉS de la baja: PROT6 no tiene ningún desbloqueo vigente'
);
call pg_temp.como(:PROT6);
select pg_temp.assert(
  not public.es_profesional_asignado(:PT6PAC),
  'DESPUÉS de la baja: es_profesional_asignado() da FALSO para el paciente de PROT6 (gemelo de T-003)'
);
call pg_temp.reset_sesion();

-- Idempotente: repetir la baja no falla y no duplica la auditoría CUENTA_BAJA.
call pg_temp.como(:ADM);
select desbloqueos_revocados, pin_borrado from public.dar_de_baja_perfil(:PROT6, 'segunda llamada')
\gset t6b_
call pg_temp.reset_sesion();

select pg_temp.assert(:t6b_desbloqueos_revocados = 0,
  'dar_de_baja_perfil() repetida: cero desbloqueos que revocar');
select pg_temp.assert(not (:'t6b_pin_borrado')::boolean,
  'dar_de_baja_perfil() repetida: no hay PIN que borrar');
select pg_temp.assert(
  (select count(*) from public.auditoria where operacion = 'CUENTA_BAJA' and registro_id = :PROT6::text) = 1,
  'dar_de_baja_perfil() repetida NO duplica la auditoría CUENTA_BAJA'
);

-- ---------------------------------------------------------------------------------------
-- Ninguna función permite fijar el PIN de un perfil ajeno: fijar_pin_historia() no
-- acepta parámetro de perfil y solo toca la fila de quien la invoca.
-- ---------------------------------------------------------------------------------------
call pg_temp.como_con_2fa(:PRO1);
select public.fijar_pin_historia('111111');
call pg_temp.reset_sesion();

call pg_temp.como_con_2fa(:PRO2);
select public.fijar_pin_historia('999999');
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select extensions.crypt('111111', hash) = hash from public.pines_historia where perfil_id = :PRO1),
  'El PIN de PRO1 sigue siendo el suyo tras fijar el de PRO2: ninguna función fija el PIN de un perfil ajeno'
);

-- ---------------------------------------------------------------------------------------
-- registrar_reposicion_totp(): solo administrador, auditado y con aviso al titular.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza_codigo(
  format('select public.registrar_reposicion_totp(%L)', :PRO1),
  '42501',
  'registrar_reposicion_totp() rechaza a quien no es administrador'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select public.registrar_reposicion_totp(:PRO1);
call pg_temp.reset_sesion();

select pg_temp.assert(
  exists (select 1 from public.auditoria where operacion = 'TOTP_REPUESTO' and registro_id = :PRO1::text
          and estado_posterior ->> 'via' = 'administrador'),
  'registrar_reposicion_totp() deja constancia en auditoria'
);

-- ---------------------------------------------------------------------------------------
-- notificaciones: el titular lee solo las suyas; nadie tiene insert directo; solo puede
-- marcar SU PROPIA fila como leída, y solo la columna leida_en.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notificaciones where perfil_id = %L and tipo = %L',
                         :PRO1, 'totp_repuesto')) = 1,
  'PRO1 lee su propio aviso de reposición de TOTP'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notificaciones where perfil_id = %L', :PRO1)) = 0,
  'PRO2 NO lee las notificaciones de PRO1: notificaciones_lectura_propia'
);
select pg_temp.assert_lanza_codigo(
  format('insert into public.notificaciones (perfil_id, tipo, detalle) values (%L, %L, %L)',
         :PRO2, 'prueba', 'intento de auto-notificarse'),
  '42501',
  'PRO2 NO puede insertar directamente en notificaciones (ni siquiera la suya propia)'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert_lanza_codigo(
  format('insert into public.notificaciones (perfil_id, tipo, detalle) values (%L, %L, %L)',
         :PRO1, 'prueba', 'intento de administrador'),
  '42501',
  'Ni siquiera ADM puede insertar directamente en notificaciones: solo las funciones definer'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
update public.notificaciones set leida_en = now() where perfil_id = :PRO1 and tipo = 'totp_repuesto';
select pg_temp.assert(
  (select leida_en is not null from public.notificaciones where perfil_id = :PRO1 and tipo = 'totp_repuesto'),
  'PRO1 SÍ marca su propia notificación como leída'
);
select pg_temp.assert_lanza_codigo(
  format('update public.notificaciones set detalle = %L where perfil_id = %L and tipo = %L',
         'hackeado', :PRO1, 'totp_repuesto'),
  '42501',
  'PRO1 NO puede cambiar el contenido de su propia notificación, solo leida_en'
);
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- Códigos de recuperación de TOTP: generación, cinco fallos bloquean, el sexto intento
-- CON el código correcto también falla, y el canje válido borra el lote y avisa.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:TEC1);
select motivo from public.canjear_codigo_recuperacion('ZZZZZZZZZZ') \gset t6sc_
select pg_temp.assert(:'t6sc_motivo' = 'sin_codigos',
  'canjear_codigo_recuperacion() sin lote generado: motivo = sin_codigos');
call pg_temp.reset_sesion();

call pg_temp.como_con_2fa(:PRO2);
create temp table t6_codigos_pro2 as
  select codigo from public.generar_codigos_recuperacion() as codigo;

select pg_temp.assert((select count(*) from t6_codigos_pro2) = 10,
  'generar_codigos_recuperacion() devuelve diez códigos');
select pg_temp.assert((select count(distinct codigo) from t6_codigos_pro2) = 10,
  'los diez códigos del lote son distintos entre sí');

select motivo from public.canjear_codigo_recuperacion('CODIGOINVENTADO') \gset t6f1_
select pg_temp.assert(:'t6f1_motivo' = 'codigo_invalido', 'intento 1/5 con código inventado: codigo_invalido');
select motivo from public.canjear_codigo_recuperacion('CODIGOINVENTADO') \gset t6f2_
select pg_temp.assert(:'t6f2_motivo' = 'codigo_invalido', 'intento 2/5: codigo_invalido');
select motivo from public.canjear_codigo_recuperacion('CODIGOINVENTADO') \gset t6f3_
select pg_temp.assert(:'t6f3_motivo' = 'codigo_invalido', 'intento 3/5: codigo_invalido');
select motivo from public.canjear_codigo_recuperacion('CODIGOINVENTADO') \gset t6f4_
select pg_temp.assert(:'t6f4_motivo' = 'codigo_invalido', 'intento 4/5: codigo_invalido');
select motivo from public.canjear_codigo_recuperacion('CODIGOINVENTADO') \gset t6f5_
select pg_temp.assert(:'t6f5_motivo' = 'bloqueado', 'intento 5/5: el quinto fallo bloquea (motivo = bloqueado)');

select codigo from t6_codigos_pro2 limit 1 \gset t6_
select motivo from public.canjear_codigo_recuperacion(:'t6_codigo') \gset t6f6_
select pg_temp.assert(:'t6f6_motivo' = 'bloqueado',
  'el SEXTO intento, con el código CORRECTO, también falla mientras el bloqueo esté vigente');

call pg_temp.reset_sesion();

-- Lote limpio de PRO1 (el único que no ha entrado en el bloqueo) para probar el canje
-- que sí tiene éxito.
call pg_temp.como_con_2fa(:PRO1);
create temp table t6_codigos_pro1 as
  select codigo from public.generar_codigos_recuperacion() as codigo;

select codigo from t6_codigos_pro1 limit 1 \gset t6b1_
select canjeado, motivo from public.canjear_codigo_recuperacion(:'t6b1_codigo') \gset t6r_
select pg_temp.assert((:'t6r_canjeado')::boolean, 'canjear_codigo_recuperacion() con código correcto: canjeado = true');
select pg_temp.assert(:'t6r_motivo' = 'ok', 'canjear_codigo_recuperacion() con código correcto: motivo = ok');

select motivo from public.canjear_codigo_recuperacion(:'t6b1_codigo') \gset t6r2_
select pg_temp.assert(:'t6r2_motivo' = 'codigo_invalido',
  'el mismo código canjeado NO se puede volver a canjear');
call pg_temp.reset_sesion();

select pg_temp.assert(
  exists (select 1 from public.notificaciones
          where perfil_id = :PRO1 and tipo = 'totp_repuesto'
            and detalle like '%código de recuperación%'),
  'el canje válido deja su propio aviso al titular (distinto del de la reposición por administrador)'
);
select pg_temp.assert(
  exists (select 1 from public.auditoria
          where operacion = 'TOTP_REPUESTO' and registro_id = :PRO1::text
            and estado_posterior ->> 'via' = 'codigo_recuperacion'),
  'el canje válido deja su propia auditoría TOTP_REPUESTO (via = codigo_recuperacion)'
);

-- ---------------------------------------------------------------------------------------
-- Los dos hallazgos ALTA de la revisión del 30-08-2026, con prueba propia.
--
-- Hasta aquí, el arreglo de los dos ALTA no tenía NI UNA prueba: este fichero no nombraba
-- `segundo_factor_verificado_recientemente()` ni una vez, y las llamadas de arriba pasaron
-- a `como_con_2fa` sin que nada demostrara que la guarda existe. Un arreglo de seguridad
-- sin negativa es el patrón que ya costó dos revisiones en T-001: las llamadas de arriba
-- seguirían verdes con la guarda quitada.
--
-- Las tres negativas van con su gemela positiva SOBRE EL MISMO PERFIL, y la tercera es la
-- que de verdad discrimina: mismo perfil, misma sesión aal2, solo cambia si el reto TOTP
-- es reciente. Sin ella, una guarda que mirase únicamente el claim `aal` del JWT —que el
-- cliente no elige, pero que no dice NADA sobre cuándo se tecleó el último código— pondría
-- verde las dos primeras.
-- ---------------------------------------------------------------------------------------

-- ALTA 1 · con solo contraseña (aal1) no se generan códigos de recuperación. Era la fuga:
-- generarlos, canjear uno y tumbar el TOTP real por la Admin API, saltándose el segundo
-- factor entero por PostgREST directo.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  'select * from public.generar_codigos_recuperacion()',
  '42501',
  'ALTA 1 — generar_codigos_recuperacion() con sesión aal1 (solo contraseña) lanza 42501'
);
call pg_temp.reset_sesion();

-- ALTA 2 · con solo contraseña no se re-fija el PIN. Era la fuga: fallar el PIN cinco
-- veces, quedar bloqueado, y fijar uno nuevo y conocido sin volver a demostrar nada —el
-- `on conflict do update` ponía intentos_fallidos a cero—, dejando decorativo el bloqueo
-- de quince minutos que es la única defensa de un PIN de seis dígitos.
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  $$select public.fijar_pin_historia('424242')$$,
  '42501',
  'ALTA 2 — fijar_pin_historia() con sesión aal1 (solo contraseña) lanza 42501'
);
call pg_temp.reset_sesion();

-- GEMELA POSITIVA de las dos anteriores, sobre EL MISMO PERFIL: con el segundo factor
-- reciente, las dos entran. Sin esto, una guarda que rechazara SIEMPRE pondría verde las
-- dos negativas de arriba.
call pg_temp.como_con_2fa(:PRO1);
select public.fijar_pin_historia('424242');
call pg_temp.reset_sesion();

-- La comprobación va FUERA de la sesión, como postgres: `pines_historia` no es legible
-- por `authenticated` ni siquiera para su propio dueño (el hash del PIN no se lee, se
-- compara dentro de una función `definer`). Dentro de la sesión esto daba
-- «permission denied for table pines_historia», que es el comportamiento correcto.
select pg_temp.assert(
  (select extensions.crypt('424242', hash) = hash from public.pines_historia where perfil_id = :PRO1),
  'GEMELA POSITIVA: con el segundo factor reciente, PRO1 SÍ re-fija su PIN'
);

-- El claim `aal2` por sí solo NO basta: el reto TOTP tiene que ser reciente. TEC1 recibe
-- un factor verificado pero retado hace diez minutos, fuera de la ventana de cinco.
call pg_temp.dar_segundo_factor(:TEC1, interval '10 minutes');
call pg_temp.como_con_2fa(:TEC1);
select pg_temp.assert_lanza_codigo(
  'select * from public.generar_codigos_recuperacion()',
  '42501',
  'Con aal2 pero el reto TOTP de hace diez minutos, generar_codigos_recuperacion() lanza 42501: la ventana se comprueba de verdad'
);
call pg_temp.reset_sesion();

-- GEMELA POSITIVA: el MISMO perfil, la MISMA sesión aal2, y lo único que cambia es que el
-- reto vuelve a estar dentro de la ventana.
update auth.mfa_factors set last_challenged_at = now() - interval '6 seconds'
 where user_id = :TEC1;

call pg_temp.como_con_2fa(:TEC1);
create temp table t7_codigos_tec1 as
  select codigo from public.generar_codigos_recuperacion() as codigo;
select pg_temp.assert(
  (select count(*) from t7_codigos_tec1) = 10,
  'GEMELA POSITIVA: con el reto TOTP dentro de la ventana, el MISMO perfil SÍ genera sus diez códigos'
);
call pg_temp.reset_sesion();

-- =======================================================================================
-- T-038 · Regenerar mis códigos de recuperación, con la contraseña cotejada EN LA BASE
-- (P-4), aviso al titular en toda generación (P-3) y la activación que ya no sirve de
-- atajo (Q3 B).
--
-- Cada negativa lleva su gemela positiva sobre el mismo perfil. Las contraseñas de la
-- fijación se ponen aquí, como postgres, con pgcrypto: son cadenas únicas
-- («clave-banco-…») para que la comprobación final «la contraseña no está escrita en
-- ningún sitio» discrimine de verdad.
-- =======================================================================================
\echo '--- T-038 · regenerar_codigos_recuperacion ---'

update auth.users set encrypted_password = extensions.crypt('clave-banco-adm',  extensions.gen_salt('bf', 4)) where id = :ADM;
update auth.users set encrypted_password = extensions.crypt('clave-banco-pro1', extensions.gen_salt('bf', 4)) where id = :PRO1;
update auth.users set encrypted_password = extensions.crypt('clave-banco-pro2', extensions.gen_salt('bf', 4)) where id = :PRO2;
update auth.users set encrypted_password = extensions.crypt('clave-banco-tec1', extensions.gen_salt('bf', 4)) where id = :TEC1;

-- Ayudantes: se llaman como postgres (las tablas de códigos y de intentos no son
-- legibles por authenticated).
create or replace function pg_temp.t38_lote(p uuid) returns text language sql stable as $$
  select coalesce(string_agg(c.id::text, ',' order by c.id), '')
  from public.codigos_recuperacion_totp c where c.perfil_id = p and c.usado_en is null
$$;
create or replace function pg_temp.t38_avisos(p_tipo text, p uuid) returns bigint language sql stable as $$
  select count(*) from public.notificaciones n where n.tipo = p_tipo and n.perfil_id = p
$$;
create or replace function pg_temp.t38_avisos_otros(p_tipo text, p uuid) returns bigint language sql stable as $$
  select count(*) from public.notificaciones n where n.tipo = p_tipo and n.perfil_id <> p
$$;
create or replace function pg_temp.t38_intentos(p uuid) returns smallint language sql stable as $$
  select coalesce((select i.intentos_fallidos from public.intentos_regenerar_codigos i where i.perfil_id = p), 0::smallint)
$$;

-- ---------------------------------------------------------------------------------------
-- CA6 · estructura: sin parámetro de perfil, sin bloque exception, sin grants de tabla.
-- ---------------------------------------------------------------------------------------
select pg_temp.assert(
  (select pronargs from pg_proc where oid = 'public.regenerar_codigos_recuperacion(text)'::regprocedure) = 1
  and (select pronargs from pg_proc where oid = 'public.generar_codigos_recuperacion()'::regprocedure) = 0,
  'CA6 · regenerar recibe un solo parámetro text (la contraseña) y generar ninguno: ninguna recibe un perfil'
);
select pg_temp.assert(
  pg_get_functiondef('public.regenerar_codigos_recuperacion(text)'::regprocedure) !~* '\mexception\s+when\M'
  and pg_get_functiondef('public.generar_codigos_recuperacion()'::regprocedure) !~* '\mexception\s+when\M',
  'CA6 · ni regenerar ni generar tienen un bloque exception que pueda tragarse el fallo del aviso'
);
select pg_temp.assert(
  pg_get_functiondef('public.regenerar_codigos_recuperacion(text)'::regprocedure) !~* '(raise|format|jsonb_build_object|execute)[^;]*p_contrasena',
  'CA6 · p_contrasena no aparece en un raise, format, jsonb_build_object ni execute del cuerpo'
);
select pg_temp.assert(
  not has_function_privilege('anon', 'public.regenerar_codigos_recuperacion(text)', 'execute')
  and has_function_privilege('authenticated', 'public.regenerar_codigos_recuperacion(text)', 'execute')
  and not has_function_privilege('anon', 'public.registro_postgres_seguro()', 'execute')
  and has_function_privilege('authenticated', 'public.registro_postgres_seguro()', 'execute'),
  'CA6 · regenerar y registro_postgres_seguro: execute para authenticated y no para anon'
);
select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.intentos_regenerar_codigos', 'select')
  and not has_table_privilege('authenticated', 'public.intentos_regenerar_codigos', 'insert')
  and not has_table_privilege('authenticated', 'public.intentos_regenerar_codigos', 'update')
  and not has_table_privilege('authenticated', 'public.intentos_regenerar_codigos', 'delete')
  and not has_table_privilege('authenticated', 'public.intentos_regenerar_codigos', 'truncate')
  and not has_table_privilege('service_role', 'public.intentos_regenerar_codigos', 'select')
  and not has_table_privilege('anon', 'public.intentos_regenerar_codigos', 'select')
  and not has_table_privilege('authenticated', 'auth.users', 'select'),
  'CA6 · intentos_regenerar_codigos sin ningún grant para anon, authenticated ni service_role; authenticated sigue sin leer auth.users'
);
select pg_temp.assert(
  (select relrowsecurity from pg_class where oid = 'public.intentos_regenerar_codigos'::regclass)
  and not exists (select 1 from pg_policies where tablename = 'intentos_regenerar_codigos'),
  'CA6 · intentos_regenerar_codigos: RLS activada y ninguna política'
);

-- ---------------------------------------------------------------------------------------
-- Q1 · registro_postgres_seguro(): cierto con los ajustes de la base local; falso en
-- cuanto un ajuste USERSET haría que Postgres escribiese los parámetros.
-- ---------------------------------------------------------------------------------------
call pg_temp.como_con_2fa(:PRO1);
select pg_temp.assert(public.registro_postgres_seguro(),
  'Q1 · registro_postgres_seguro() es cierto con los ajustes de registro de la base local');
set local log_parameter_max_length_on_error = 100;
select pg_temp.assert(not public.registro_postgres_seguro(),
  'Q1 · con log_parameter_max_length_on_error > 0 (los parámetros irían al registro en un error) devuelve falso');
reset log_parameter_max_length_on_error;
select pg_temp.assert(public.registro_postgres_seguro(),
  'Q1 · gemela: restaurado el ajuste, vuelve a ser cierto');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- CA1 · activación (P-3): ADM no tiene lote; activar deja diez vigentes y UN aviso.
-- ---------------------------------------------------------------------------------------
update auth.mfa_factors set last_challenged_at = now() - interval '21 seconds' where user_id = :ADM;
select pg_temp.t38_lote(:ADM) as lote,
       pg_temp.t38_avisos('codigos_regenerados', :ADM) as av,
       pg_temp.t38_avisos_otros('codigos_regenerados', :ADM) as otros \gset t38adm_
select pg_temp.assert(:'t38adm_lote' = '', 'CA1 · ADM parte sin lote vigente');

call pg_temp.como_con_2fa(:ADM);
create temp table t38_adm_act as select codigo from public.generar_codigos_recuperacion() as codigo;
call pg_temp.reset_sesion();
select count(*) as n from t38_adm_act \gset t38adm_act_

select pg_temp.assert(:t38adm_act_n = 10, 'CA1 · la activación (generar_codigos_recuperacion) devuelve diez códigos');
select pg_temp.assert(
  (select count(*) from public.codigos_recuperacion_totp where perfil_id = :ADM and usado_en is null) = 10,
  'CA1 · tras activar, ADM tiene exactamente diez vigentes');
select pg_temp.assert(
  pg_temp.t38_avisos('codigos_regenerados', :ADM) = :t38adm_av + 1
  and pg_temp.t38_avisos_otros('codigos_regenerados', :ADM) = :t38adm_otros,
  'CA1 · P-3: la activación deja UN aviso codigos_regenerados al titular y ninguno a otro perfil');
select pg_temp.assert(
  exists (select 1 from public.notificaciones where perfil_id = :ADM and tipo = 'codigos_regenerados'
          and detalle like '%los anteriores ya no valen%' and detalle like '%avisa al administrador%'),
  'CA1 · el aviso dice que los anteriores ya no valen y a quién avisar');

-- ---------------------------------------------------------------------------------------
-- CA2 quater · la activación NO es atajo una vez hay lote (Q3 B). PRO2 ya tiene lote
-- vigente (13, generar) y ninguna reposición posterior a él.
-- ---------------------------------------------------------------------------------------
select pg_temp.t38_lote(:PRO2) as lote \gset t38p2_
select pg_temp.assert(:'t38p2_lote' <> '', 'CA2 quater · PRO2 parte con lote vigente');
update auth.mfa_factors set last_challenged_at = now() - interval '24 seconds' where user_id = :PRO2;

call pg_temp.como_con_2fa(:PRO2);
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.generar_codigos_recuperacion()',
  '42501', 'se regeneran desde Mi cuenta',
  'CA2 quater · con lote vigente y sin reposición, la activación lanza 42501 (no es un atajo para regenerar sin contraseña)');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t38_lote(:PRO2) = :'t38p2_lote',
  'CA2 quater · el lote de PRO2 no cambió');

-- Empate: una reposición con el mismo instante que el lote no basta (falla cerrado, >=).
insert into public.auditoria (actor_id, tabla, operacion, registro_id, estado_posterior, ocurrido_en)
values (:ADM, 'perfiles', 'TOTP_REPUESTO', :PRO2::text, jsonb_build_object('via', 'administrador'), now());
update public.codigos_recuperacion_totp set creado_en = now()
 where perfil_id = :PRO2 and usado_en is null;
call pg_temp.como_con_2fa(:PRO2);
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.generar_codigos_recuperacion()',
  '42501', 'se regeneran desde Mi cuenta',
  'CA2 quater · empate (lote y reposición en el mismo instante): falla cerrado');
call pg_temp.reset_sesion();

-- Gemela positiva: el lote es ANTERIOR a la reposición, así que la activación sí genera.
update public.codigos_recuperacion_totp set creado_en = now() - interval '1 hour'
 where perfil_id = :PRO2 and usado_en is null;
call pg_temp.como_con_2fa(:PRO2);
create temp table t38_pro2_act as select codigo from public.generar_codigos_recuperacion() as codigo;
call pg_temp.reset_sesion();
select count(*) as n from t38_pro2_act \gset t38p2act_
select pg_temp.assert(:t38p2act_n = 10 and
  (select count(*) from public.codigos_recuperacion_totp where perfil_id = :PRO2 and usado_en is null) = 10,
  'CA2 quater · GEMELA: con el lote anterior a la reposición, la activación genera diez vigentes y caduca el viejo');

-- ---------------------------------------------------------------------------------------
-- PRO1: negativas (aal1, reto antiguo, contraseña errónea) y regeneración (CA1, CA2).
-- PRO1 llega con nueve vigentes: uno se canjeó arriba.
-- ---------------------------------------------------------------------------------------
update auth.mfa_factors set last_challenged_at = now() - interval '22 seconds' where user_id = :PRO1;

select pg_temp.t38_lote(:PRO1) as lote,
       pg_temp.t38_avisos('codigos_regenerados', :PRO1) as av,
       pg_temp.t38_avisos_otros('codigos_regenerados', :PRO1) as otros,
       pg_temp.t38_lote(:ADM) as lote_adm,
       pg_temp.t38_lote(:TEC1) as lote_tec \gset t38a_
select pg_temp.assert(array_length(string_to_array(:'t38a_lote', ','), 1) = 9,
  'CA1 · PRO1 parte con nueve vigentes (el décimo se canjeó)');

-- CA2 · aal1
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  $$select * from public.regenerar_codigos_recuperacion('clave-banco-pro1')$$,
  '42501', 'para regenerar los códigos de recuperación',
  'CA2 · con aal1 (solo contraseña), regenerar lanza 42501 aunque la contraseña sea la buena');
call pg_temp.reset_sesion();
select pg_temp.assert(
  pg_temp.t38_lote(:PRO1) = :'t38a_lote'
  and pg_temp.t38_avisos('codigos_regenerados', :PRO1) = :t38a_av
  and pg_temp.t38_intentos(:PRO1) = 0,
  'CA2 · con aal1: ni lote nuevo, ni aviso, ni intento gastado');

-- CA2 · aal2 con el reto de hace diecisiete minutos (una guarda que solo mirase aal pasaría)
update auth.mfa_factors set last_challenged_at = now() - interval '17 minutes' where user_id = :PRO1;
call pg_temp.como_con_2fa(:PRO1);
select pg_temp.assert_lanza_codigo_msg(
  $$select * from public.regenerar_codigos_recuperacion('clave-banco-pro1')$$,
  '42501', 'para regenerar los códigos de recuperación',
  'CA2 · con aal2 y el reto TOTP de hace diecisiete minutos, regenerar lanza 42501: la ventana se comprueba de verdad');
call pg_temp.reset_sesion();
select pg_temp.assert(
  pg_temp.t38_lote(:PRO1) = :'t38a_lote'
  and pg_temp.t38_avisos('codigos_regenerados', :PRO1) = :t38a_av
  and pg_temp.t38_intentos(:PRO1) = 0,
  'CA2 · con el reto antiguo: ni lote nuevo, ni aviso, ni intento gastado');
update auth.mfa_factors set last_challenged_at = now() - interval '22 seconds' where user_id = :PRO1;

-- CA2 · contraseña errónea con aal2 reciente: no lanza, devuelve motivo, deja un intento
call pg_temp.como_con_2fa(:PRO1);
create temp table t38_pro1_mal as
  select * from public.regenerar_codigos_recuperacion('clave-banco-equivocada');
call pg_temp.reset_sesion();
select motivo, (codigos is null)::text as sin_codigos from t38_pro1_mal \gset t38mal_
select pg_temp.assert(:'t38mal_motivo' = 'contrasena_incorrecta' and :'t38mal_sin_codigos' = 'true',
  'CA2 · contraseña errónea: motivo = contrasena_incorrecta y ningún código (y no lanza)');
select pg_temp.assert(
  pg_temp.t38_lote(:PRO1) = :'t38a_lote'
  and pg_temp.t38_avisos('codigos_regenerados', :PRO1) = :t38a_av,
  'CA2 · contraseña errónea: el lote sigue siendo el mismo y no hay aviso');
select pg_temp.assert(pg_temp.t38_intentos(:PRO1) = 1,
  'CA2 · contraseña errónea: queda UN intento fallido (si la función lanzara, el contador se desharía y esto sería 0)');
select pg_temp.assert(
  exists (select 1 from public.auditoria where tabla = 'intentos_regenerar_codigos'
          and registro_id = :PRO1::text and actor_id = :PRO1),
  'CA2 · el fallo de contraseña queda en auditoria (fn_auditar sobre intentos_regenerar_codigos, sin verbo nuevo)');

-- CA3 · los códigos que se probarán después, leídos ahora como postgres.
select codigo as viejo from t6_codigos_pro1 offset 1 limit 1 \gset t38v_

-- CA1 · regeneración buena
call pg_temp.como_con_2fa(:PRO1);
create temp table t38_pro1_ok as
  select * from public.regenerar_codigos_recuperacion('clave-banco-pro1');
call pg_temp.reset_sesion();
select motivo, cardinality(codigos) as n,
       (select count(distinct c) from unnest(codigos) c) as distintos,
       codigos[1] as primero from t38_pro1_ok \gset t38ok_
select pg_temp.assert(:'t38ok_motivo' = 'ok' and :t38ok_n = 10 and :t38ok_distintos = 10,
  'CA1 · regenerar con la contraseña buena: motivo ok y diez códigos distintos');
select pg_temp.assert(
  not exists (select 1 from public.codigos_recuperacion_totp c
              where c.perfil_id = :PRO1 and c.usado_en is null
                and c.id::text = any (string_to_array(:'t38a_lote', ','))),
  'CA1 · del lote anterior no queda ningún código vigente');
select pg_temp.assert(
  (select count(*) from public.codigos_recuperacion_totp where perfil_id = :PRO1 and usado_en is null) = 10,
  'CA1 · hay exactamente diez vigentes (los nuevos)');
select pg_temp.assert(
  (select count(*) from public.codigos_recuperacion_totp c
    where c.perfil_id = :PRO1 and c.usado_en is null
      and extensions.crypt(:'t38ok_primero', c.codigo_hash) = c.codigo_hash) = 1,
  'CA1 · los códigos devueltos son los que hay hasheados en la tabla');
select pg_temp.assert(
  pg_temp.t38_avisos('codigos_regenerados', :PRO1) = :t38a_av + 1
  and pg_temp.t38_avisos_otros('codigos_regenerados', :PRO1) = :t38a_otros,
  'CA1 · una fila nueva en notificaciones del titular y ninguna de otro perfil');
select pg_temp.assert(pg_temp.t38_intentos(:PRO1) = 0,
  'CA2 · el acierto pone el contador de intentos a cero');
select pg_temp.assert(
  pg_temp.t38_lote(:ADM) = :'t38a_lote_adm' and pg_temp.t38_lote(:TEC1) = :'t38a_lote_tec',
  'CA13 · PRO1 regenera SOLO su lote: los vigentes de ADM y TEC1 no se mueven');

-- CA5 · segunda regeneración: diez UPDATE (el lote que acaba de nacer) y diez INSERT.
select pg_temp.t38_lote(:PRO1) as lote_previo \gset t38b_
call pg_temp.como_con_2fa(:PRO1);
create temp table t38_pro1_ok2 as
  select * from public.regenerar_codigos_recuperacion('clave-banco-pro1');
call pg_temp.reset_sesion();
select motivo, codigos[1] as primero from t38_pro1_ok2 \gset t38ok2_
select pg_temp.assert(:'t38ok2_motivo' = 'ok', 'CA5 · segunda regeneración de PRO1: ok');
select pg_temp.assert(
  (select count(*) from public.auditoria a
    where a.tabla = 'codigos_recuperacion_totp' and a.operacion = 'UPDATE' and a.actor_id = :PRO1
      and a.registro_id = any (string_to_array(:'t38b_lote_previo', ','))) = 10,
  'CA5 · diez filas UPDATE en auditoria (los diez códigos caducados) con actor_id = el titular');
select pg_temp.assert(
  (select count(*) from public.auditoria a
    where a.tabla = 'codigos_recuperacion_totp' and a.operacion = 'INSERT' and a.actor_id = :PRO1
      and a.registro_id = any (string_to_array(pg_temp.t38_lote(:PRO1), ','))) = 10,
  'CA5 · diez filas INSERT en auditoria (los diez códigos nuevos) con actor_id = el titular');
select pg_temp.assert(
  not exists (select 1 from public.auditoria a
              where a.tabla = 'codigos_recuperacion_totp'
                and (coalesce(a.estado_anterior, '{}'::jsonb) ? 'codigo_hash'
                     or coalesce(a.estado_posterior, '{}'::jsonb) ? 'codigo_hash')),
  'CA5 · ninguna fila de auditoria de códigos lleva codigo_hash');

-- ---------------------------------------------------------------------------------------
-- CA2 ter · cuentas sin contraseña o con un hash que no es bcrypt: motivo, sin excepción.
-- Se usa PRO2 (activo, con factor): su lote no se toca.
-- ---------------------------------------------------------------------------------------
select pg_temp.t38_lote(:PRO2) as lote \gset t38t6_
update auth.mfa_factors set last_challenged_at = now() - interval '23 seconds' where user_id = :PRO2;
update auth.users set encrypted_password = '' where id = :PRO2;
call pg_temp.como_con_2fa(:PRO2);
create temp table t38_p2_a as select * from public.regenerar_codigos_recuperacion('lo-que-sea');
call pg_temp.reset_sesion();
select motivo from t38_p2_a \gset t38t6a_
select pg_temp.assert(:'t38t6a_motivo' = 'contrasena_incorrecta', 'CA2 ter · contraseña vacía en auth.users: contrasena_incorrecta, sin excepción');

update auth.users set encrypted_password = null where id = :PRO2;
call pg_temp.como_con_2fa(:PRO2);
create temp table t38_p2_b as select * from public.regenerar_codigos_recuperacion('lo-que-sea');
call pg_temp.reset_sesion();
select motivo from t38_p2_b \gset t38t6b_
select pg_temp.assert(:'t38t6b_motivo' = 'contrasena_incorrecta', 'CA2 ter · contraseña nula en auth.users: contrasena_incorrecta, sin excepción');

update auth.users set encrypted_password = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$RdescudvJCsgt3ub+b+dWRWJTmaaJObG' where id = :PRO2;
call pg_temp.como_con_2fa(:PRO2);
create temp table t38_p2_c as select * from public.regenerar_codigos_recuperacion('lo-que-sea');
call pg_temp.reset_sesion();
select motivo from t38_p2_c \gset t38t6c_
select pg_temp.assert(:'t38t6c_motivo' = 'contrasena_incorrecta', 'CA2 ter · hash argon2 (no bcrypt): contrasena_incorrecta, sin excepción');
select pg_temp.assert(pg_temp.t38_intentos(:PRO2) = 3 and pg_temp.t38_lote(:PRO2) = :'t38t6_lote',
  'CA2 ter · los tres fallos suman intento y no tocan el lote');

-- ---------------------------------------------------------------------------------------
-- CA2 bis · límite de intentos y CA13 (TEC1, que no tiene PIN, regenera sin que se le pida).
-- ---------------------------------------------------------------------------------------
select pg_temp.t38_lote(:TEC1) as lote,
       pg_temp.t38_avisos('regeneracion_codigos_bloqueada', :TEC1) as bloq,
       pg_temp.t38_lote(:ADM) as lote_adm,
       pg_temp.t38_lote(:PRO1) as lote_pro1 \gset t38c_
select pg_temp.assert(:'t38c_lote' <> '', 'CA2 bis · TEC1 parte con lote vigente');

call pg_temp.como_con_2fa(:TEC1);
create temp table t38_tec as select 1 as n, r.* from public.regenerar_codigos_recuperacion('clave-banco-equivocada') r;
insert into t38_tec select 2, r.* from public.regenerar_codigos_recuperacion('clave-banco-equivocada') r;
insert into t38_tec select 3, r.* from public.regenerar_codigos_recuperacion('clave-banco-equivocada') r;
insert into t38_tec select 4, r.* from public.regenerar_codigos_recuperacion('clave-banco-equivocada') r;
insert into t38_tec select 5, r.* from public.regenerar_codigos_recuperacion('clave-banco-equivocada') r;
-- el sexto, CON la contraseña correcta, también falla mientras dure el bloqueo
insert into t38_tec select 6, r.* from public.regenerar_codigos_recuperacion('clave-banco-tec1') r;
call pg_temp.reset_sesion();
select string_agg(motivo, ',' order by n) as motivos,
       (select bloqueado_hasta from t38_tec where n = 5) as hasta5,
       (select (codigos is null)::text from t38_tec where n = 6) as sin6 from t38_tec \gset t38tec_
select pg_temp.assert(:'t38tec_motivos' = 'contrasena_incorrecta,contrasena_incorrecta,contrasena_incorrecta,contrasena_incorrecta,bloqueado,bloqueado',
  'CA2 bis · cuatro errores, el quinto bloquea y el sexto, con la contraseña BUENA, también devuelve bloqueado');
select pg_temp.assert(
  :'t38tec_hasta5'::timestamptz between now() + interval '14 minutes' and now() + interval '16 minutes' and :'t38tec_sin6' = 'true',
  'CA2 bis · el bloqueo dura unos quince minutos y el sexto intento no devuelve códigos');
select pg_temp.assert(
  pg_temp.t38_lote(:TEC1) = :'t38c_lote'
  and pg_temp.t38_avisos('regeneracion_codigos_bloqueada', :TEC1) = :t38c_bloq + 1,
  'CA2 bis · el lote no cambia y el bloqueo deja UN aviso regeneracion_codigos_bloqueada');
select pg_temp.assert(
  exists (select 1 from public.notificaciones where perfil_id = :TEC1 and tipo = 'regeneracion_codigos_bloqueada'
          and detalle like '%avisa al administrador%'),
  'CA2 bis · el aviso de bloqueo dice a quién avisar');

-- Caducado el bloqueo, un fallo vuelve a bloquear (patrón del PIN); solo un acierto limpia.
update public.intentos_regenerar_codigos set bloqueado_hasta = now() - interval '1 second' where perfil_id = :TEC1;
call pg_temp.como_con_2fa(:TEC1);
create temp table t38_tec_7 as select * from public.regenerar_codigos_recuperacion('clave-banco-equivocada');
call pg_temp.reset_sesion();
select motivo from t38_tec_7 \gset t38t7_
select pg_temp.assert(:'t38t7_motivo' = 'bloqueado',
  'CA2 bis · pasado el bloqueo, UN fallo más vuelve a bloquear (el contador no se reinicia)');

update public.intentos_regenerar_codigos set bloqueado_hasta = now() - interval '1 second' where perfil_id = :TEC1;
call pg_temp.como_con_2fa(:TEC1);
create temp table t38_tec_8 as select * from public.regenerar_codigos_recuperacion('clave-banco-tec1');
call pg_temp.reset_sesion();
select motivo, cardinality(codigos) as n from t38_tec_8 \gset t38t8_
select pg_temp.assert(:'t38t8_motivo' = 'ok' and :t38t8_n = 10,
  'CA2 bis / CA13 · pasado el bloqueo, la contraseña buena regenera (TEC1, sin PIN, sin que se le pida nada más)');
select pg_temp.assert(
  pg_temp.t38_intentos(:TEC1) = 0
  and (select bloqueado_hasta is null from public.intentos_regenerar_codigos where perfil_id = :TEC1),
  'CA2 bis · el acierto limpia el contador y el bloqueo');
select pg_temp.assert(
  pg_temp.t38_lote(:ADM) = :'t38c_lote_adm' and pg_temp.t38_lote(:PRO1) = :'t38c_lote_pro1'
  and pg_temp.t38_lote(:TEC1) <> :'t38c_lote'
  and (select count(*) from public.codigos_recuperacion_totp where perfil_id = :TEC1 and usado_en is null) = 10,
  'CA13 · TEC1 cambia SOLO su lote: los de ADM y PRO1 siguen iguales');

-- CA13 · ADM regenera con su contraseña y solo cambia su lote
select pg_temp.t38_lote(:ADM) as lote, pg_temp.t38_lote(:PRO1) as lote_pro1, pg_temp.t38_lote(:TEC1) as lote_tec,
       pg_temp.t38_avisos('codigos_regenerados', :ADM) as av \gset t38d_
call pg_temp.como_con_2fa(:ADM);
create temp table t38_adm_reg as select * from public.regenerar_codigos_recuperacion('clave-banco-adm');
call pg_temp.reset_sesion();
select motivo, cardinality(codigos) as n from t38_adm_reg \gset t38dr_
select pg_temp.assert(:'t38dr_motivo' = 'ok' and :t38dr_n = 10
  and pg_temp.t38_lote(:ADM) <> :'t38d_lote'
  and pg_temp.t38_lote(:PRO1) = :'t38d_lote_pro1' and pg_temp.t38_lote(:TEC1) = :'t38d_lote_tec'
  and pg_temp.t38_avisos('codigos_regenerados', :ADM) = :t38d_av + 1,
  'CA13 · ADM regenera con su contraseña: cambia su lote, avisa a ADM y no toca los de PRO1 ni TEC1');

-- ---------------------------------------------------------------------------------------
-- CA6 · la contraseña no está escrita en ningún sitio (auditoria, notificaciones).
-- ---------------------------------------------------------------------------------------
select pg_temp.assert(
  not exists (select 1 from public.auditoria
              where coalesce(estado_anterior::text, '') || coalesce(estado_posterior::text, '') like '%clave-banco-%'
                 or coalesce(estado_anterior::text, '') || coalesce(estado_posterior::text, '') like '%lo-que-sea%'),
  'CA6 · ninguna fila de auditoria contiene una contraseña (buena o errónea)');
select pg_temp.assert(
  not exists (select 1 from public.notificaciones
              where detalle like '%clave-banco-%' or detalle like '%lo-que-sea%'),
  'CA6 · ninguna notificación contiene una contraseña');

-- ---------------------------------------------------------------------------------------
-- CA3 · después de regenerar, un código del lote ANTERIOR se rechaza y uno del nuevo vale.
-- Va al final del bloque de PRO1: el canje correcto deja constancia de TOTP repuesto.
-- ---------------------------------------------------------------------------------------
call pg_temp.como_con_2fa(:PRO1);
select motivo as motivo_viejo, canjeado::text as canjeado_viejo
  from public.canjear_codigo_recuperacion(:'t38v_viejo') \gset t38cv_
select pg_temp.assert(:'t38cv_canjeado_viejo' = 'false' and :'t38cv_motivo_viejo' = 'codigo_invalido',
  'CA3 · un código del lote anterior a la regeneración da canjeado = false, motivo = codigo_invalido');
select motivo as motivo_nuevo, canjeado::text as canjeado_nuevo
  from public.canjear_codigo_recuperacion(:'t38ok2_primero') \gset t38cn_
select pg_temp.assert(:'t38cn_canjeado_nuevo' = 'true' and :'t38cn_motivo_nuevo' = 'ok',
  'CA3 · gemela: un código del lote nuevo da canjeado = true, motivo = ok');
call pg_temp.reset_sesion();

\echo '13-cuentas: completa.'
