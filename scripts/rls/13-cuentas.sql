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

\echo '13-cuentas: completa.'
