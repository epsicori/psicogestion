-- T-040 (corte B) · La capa de exportación clínica en la base: `exportar_nota`,
-- `registrar_fichero_exportado`, `notas_para_copia` y las dos tablas de solo adición
-- (`exportaciones`, `exportaciones_ficheros`). Diseño: `tickets/T-040/diseno.md` §1.1, §3 y B0.
--
-- Reglas de este banco (B0.2, H24, H25):
-- - Todo el banco de RLS es UNA transacción y los bancos que van detrás ven lo que este deje.
--   Por eso la fijación es propia (prefijo `40400000-`, actores, centro, pacientes, episodios
--   y notas nuevos), todos los recuentos son DIFERENCIAS antes/después filtradas por esos ids
--   (nunca totales de tabla), y al final se cierra el candado de cada actor y se resetea la
--   sesión.
-- - El candado se abre SOLO con `pg_temp.desbloquear_historia(pin)` (00), nunca a mano.
-- - Toda negativa comprueba el código Y un fragmento del mensaje, y tiene su gemela positiva.
-- - El 25006 se prueba con `savepoint` + `set local transaction_read_only = on` +
--   `rollback to savepoint`, como `24-pin-y-canje-dos-pasos.sql` CA7.
--
-- Actores: ADM (administrador, no asignado a P), TIT (titular de P), AUT (autora de N1, no
-- asignada a P), COP (titular de P2, lee la v2 de N1 por el episodio conjunto), SIN (sin
-- asignación) y TEC (técnico). N1 tiene v1 individual y v2 conjunta con marcas; N0 no tiene
-- versiones; N3 es de TIT (titular = autor: un solo aviso); N4 es de AUT sobre PA, cuyo
-- profesional asignado es ADM.

\echo ''
\echo '=== 27-exportaciones ==='

\set E_ADM '\'40400000-0000-4000-8000-000000000001\''
\set E_TIT '\'40400000-0000-4000-8000-000000000002\''
\set E_AUT '\'40400000-0000-4000-8000-000000000003\''
\set E_COP '\'40400000-0000-4000-8000-000000000004\''
\set E_SIN '\'40400000-0000-4000-8000-000000000005\''
\set E_TEC '\'40400000-0000-4000-8000-000000000006\''
\set E_C   '\'40400000-0000-4000-8000-0000000000c1\''
\set E_P   '\'40400000-0000-4000-8000-0000000000d1\''
\set E_P2  '\'40400000-0000-4000-8000-0000000000d2\''
\set E_PA  '\'40400000-0000-4000-8000-0000000000d3\''
\set E_E   '\'40400000-0000-4000-8000-0000000000e1\''
\set E_E3  '\'40400000-0000-4000-8000-0000000000e3\''
\set E_E4  '\'40400000-0000-4000-8000-0000000000e4\''
\set E_N0  '\'40400000-0000-4000-8000-0000000000f0\''
\set E_N1  '\'40400000-0000-4000-8000-0000000000f1\''
\set E_N3  '\'40400000-0000-4000-8000-0000000000f3\''
\set E_N4  '\'40400000-0000-4000-8000-0000000000f4\''
-- Un uuid que no es de nada (CB4).
\set E_RND '\'40400000-0000-4000-8000-0000000000ff\''
\set E_HEX '\'4040404040404040404040404040404040404040404040404040404040404040\''

-- =========================================================================================
-- Fijación
-- =========================================================================================

insert into public.centros (id, nombre) values (:E_C, 'Centro Cuarenta');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :E_ADM, 'authenticated', 'authenticated', 'adm40@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"administrador","nombre_completo":"Admin Cuarenta"}'::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :E_TIT, 'authenticated', 'authenticated', 'tit40@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Titular Cuarenta","centro_id":"' || :E_C || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :E_AUT, 'authenticated', 'authenticated', 'aut40@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Autora Cuarenta","centro_id":"' || :E_C || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :E_COP, 'authenticated', 'authenticated', 'cop40@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Copro Cuarenta","centro_id":"' || :E_C || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :E_SIN, 'authenticated', 'authenticated', 'sin40@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Sin Cuarenta","centro_id":"' || :E_C || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :E_TEC, 'authenticated', 'authenticated', 'tec40@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"tecnico_administrativo","nombre_completo":"Tecnico Cuarenta","centro_id":"' || :E_C || '"}')::jsonb, '', '', '', '');

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:E_P,  'Nombre40Secreto', 'Apellido40Secreto', :E_TIT, :E_C),
  (:E_P2, 'Pareja40', 'Participante40', :E_COP, :E_C),
  (:E_PA, 'Paciente40', 'DeAdmin40', :E_ADM, :E_C);

-- E: episodio de pareja de AUT sobre P, con P2 de participante (los participantes, ANTES de
-- las notas: la puerta de participantes se congela con notas). E3: individual de TIT sobre P.
-- E4: individual de AUT sobre PA.
insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id, modalidad_relacional, motivo_consulta) values
  (:E_E,  :E_P,  :E_AUT, :E_C, 'pareja', 'Pareja (banco 27)'),
  (:E_E3, :E_P,  :E_TIT, :E_C, 'individual', 'Individual de TIT (banco 27)'),
  (:E_E4, :E_PA, :E_AUT, :E_C, 'individual', 'Individual de PA (banco 27)');
insert into public.episodio_participantes (episodio_id, paciente_id, papel) values
  (:E_E, :E_P,  'miembro'),
  (:E_E, :E_P2, 'pareja');

insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  (:E_N1, :E_P,  :E_E,  :E_AUT),
  (:E_N0, :E_P,  :E_E,  :E_AUT),
  (:E_N3, :E_P,  :E_E3, :E_TIT),
  (:E_N4, :E_PA, :E_E4, :E_AUT);

-- Versiones como `postgres` (exento del paso 0 del disparador), una sentencia por fila y con
-- `creada_en` distintos: el orden de la cadena del paciente queda fijado, no solo observado.
select pg_temp.assert_no_lanza(format($f$
  insert into public.notas_clinicas_versiones
    (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en, anotaciones_reservadas) values
    (%L, '{"texto":"MARCA-CUERPO-1"}', %L, 'individual', %L, timestamptz '2029-03-01 10:00:00+00', 'MARCA-RESERVADA-1')$f$,
  :E_N1,
  pg_temp.sobre_prueba(:E_N1, :E_AUT, timestamptz '2029-03-01 10:00:00+00', '{"texto":"MARCA-CUERPO-1"}'::jsonb,
                       p_anotaciones_reservadas => 'MARCA-RESERVADA-1'),
  :E_AUT), '27.0a N1 v1 (individual, con reservadas) se sella');
select pg_temp.assert_no_lanza(format($f$
  insert into public.notas_clinicas_versiones
    (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en, anotaciones_reservadas, motivo_cambio) values
    (%L, '{"texto":"MARCA-CUERPO-2"}', %L, 'conjunta', %L, timestamptz '2029-03-01 11:00:00+00', 'MARCA-RESERVADA-2', 'MARCA-MOTIVO-2')$f$,
  :E_N1,
  pg_temp.sobre_prueba(:E_N1, :E_AUT, timestamptz '2029-03-01 11:00:00+00', '{"texto":"MARCA-CUERPO-2"}'::jsonb,
                       p_anotaciones_reservadas => 'MARCA-RESERVADA-2', p_motivo_cambio => 'MARCA-MOTIVO-2',
                       p_alcance => 'conjunta'),
  :E_AUT), '27.0b N1 v2 (conjunta, con reservadas y motivo) se sella');
select pg_temp.assert_no_lanza(format($f$
  insert into public.notas_clinicas_versiones
    (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
    (%L, '{"texto":"N3-CUERPO"}', %L, 'individual', %L, timestamptz '2029-03-01 12:00:00+00')$f$,
  :E_N3,
  pg_temp.sobre_prueba(:E_N3, :E_TIT, timestamptz '2029-03-01 12:00:00+00', '{"texto":"N3-CUERPO"}'::jsonb),
  :E_TIT), '27.0c N3 v1 se sella');
select pg_temp.assert_no_lanza(format($f$
  insert into public.notas_clinicas_versiones
    (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
    (%L, '{"texto":"N4-CUERPO"}', %L, 'individual', %L, timestamptz '2029-03-01 13:00:00+00')$f$,
  :E_N4,
  pg_temp.sobre_prueba(:E_N4, :E_AUT, timestamptz '2029-03-01 13:00:00+00', '{"texto":"N4-CUERPO"}'::jsonb),
  :E_AUT), '27.0d N4 v1 se sella');

-- PIN propio de cada actor (desfases de segundo factor que no usa ningún otro banco: el
-- índice único global de `auth.mfa_factors.last_challenged_at`).
call pg_temp.dar_segundo_factor(:E_ADM, interval '271 seconds');
call pg_temp.dar_segundo_factor(:E_TIT, interval '272 seconds');
call pg_temp.dar_segundo_factor(:E_AUT, interval '273 seconds');
call pg_temp.dar_segundo_factor(:E_COP, interval '274 seconds');
call pg_temp.dar_segundo_factor(:E_SIN, interval '275 seconds');
call pg_temp.como_con_2fa(:E_ADM); select public.fijar_pin_historia('404001'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:E_TIT); select public.fijar_pin_historia('404002'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:E_AUT); select public.fijar_pin_historia('404003'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:E_COP); select public.fijar_pin_historia('404004'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:E_SIN); select public.fijar_pin_historia('404005'); call pg_temp.reset_sesion();

call pg_temp.como(:E_ADM);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('404001')), '27.0e ADM abre el candado');
call pg_temp.reset_sesion();
call pg_temp.como(:E_TIT);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('404002')), '27.0e TIT abre el candado');
call pg_temp.reset_sesion();
call pg_temp.como(:E_AUT);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('404003')), '27.0e AUT abre el candado');
call pg_temp.reset_sesion();
call pg_temp.como(:E_COP);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('404004')), '27.0e COP abre el candado');
call pg_temp.reset_sesion();
call pg_temp.como(:E_SIN);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('404005')), '27.0e SIN abre el candado');
call pg_temp.reset_sesion();

-- =========================================================================================
-- Ayudantes propios (los recuentos se llaman como `postgres`, tras reset_sesion)
-- =========================================================================================

create temp table t40_r (etiqueta text primary key, r jsonb not null);

create or replace function pg_temp.t40_n_exp() returns bigint language sql as $$
  select count(*) from public.exportaciones e
   where e.paciente_id in ('40400000-0000-4000-8000-0000000000d1', '40400000-0000-4000-8000-0000000000d2',
                           '40400000-0000-4000-8000-0000000000d3');
$$;
create or replace function pg_temp.t40_n_acc() returns bigint language sql as $$
  select count(*) from public.accesos_historia a
   where a.tipo = 'exportacion'
     and a.paciente_id in ('40400000-0000-4000-8000-0000000000d1', '40400000-0000-4000-8000-0000000000d2',
                           '40400000-0000-4000-8000-0000000000d3');
$$;
create or replace function pg_temp.t40_n_avi() returns bigint language sql as $$
  select count(*) from public.notificaciones n
   where n.tipo = 'exportacion_por_administracion'
     and n.perfil_id::text like '40400000-%';
$$;
create or replace function pg_temp.t40_n_fic() returns bigint language sql as $$
  select count(*) from public.exportaciones_ficheros f
   where exists (select 1 from public.exportaciones e
                  where e.id = f.exportacion_id
                    and e.paciente_id in ('40400000-0000-4000-8000-0000000000d1', '40400000-0000-4000-8000-0000000000d2',
                                          '40400000-0000-4000-8000-0000000000d3'));
$$;
create or replace function pg_temp.t40_conteo() returns text language sql as $$
  select pg_temp.t40_n_exp() || '/' || pg_temp.t40_n_acc() || '/' || pg_temp.t40_n_avi() || '/' || pg_temp.t40_n_fic();
$$;

create or replace function pg_temp.t40_r(p_etiqueta text) returns jsonb language sql as $$
  select t.r from pg_temp.t40_r t where t.etiqueta = p_etiqueta;
$$;

-- Llama a exportar_nota como p_uid; la llamada TIENE que funcionar. Guarda la respuesta y
-- comprueba el rastro: +1 exportación, +1 acceso y +p_avisos avisos, ni uno más.
create or replace function pg_temp.t40_ok(
  p_uid uuid, p_etiqueta text, p_pac uuid, p_nota uuid, p_motivo text, p_ref text, p_avisos int)
returns jsonb language plpgsql as $$
declare
  v_e bigint := pg_temp.t40_n_exp();
  v_a bigint := pg_temp.t40_n_acc();
  v_n bigint := pg_temp.t40_n_avi();
  v_r jsonb;
begin
  call pg_temp.como(p_uid);
  begin
    execute format('select public.exportar_nota(%L::uuid, %L::uuid, %L::public.motivo_exportacion, %L, %L::inet, %L)',
                   p_pac, p_nota, p_motivo, p_ref, '127.0.0.1', 'banco-27')
      into v_r;
  exception when others then
    raise exception 'FALLO: % debía exportar (lanzó % · %)', p_etiqueta, sqlstate, sqlerrm;
  end;
  call pg_temp.reset_sesion();
  insert into pg_temp.t40_r (etiqueta, r) values (p_etiqueta, v_r);
  perform pg_temp.assert(pg_temp.t40_n_exp() = v_e + 1, p_etiqueta || ' · +1 fila en exportaciones');
  perform pg_temp.assert(pg_temp.t40_n_acc() = v_a + 1, p_etiqueta || ' · +1 fila exportacion en accesos_historia');
  perform pg_temp.assert(pg_temp.t40_n_avi() = v_n + p_avisos,
    format('%s · +%s avisos (hay +%s)', p_etiqueta, p_avisos, pg_temp.t40_n_avi() - v_n));
  return v_r;
end $$;

-- Llama como p_uid y exige el código y el fragmento; el rastro no se mueve (Δ = 0 en las
-- cuatro cuentas).
create or replace function pg_temp.t40_falla(p_uid uuid, p_consulta text, p_codigo text, p_fragmento text, p_mensaje text)
returns void language plpgsql as $$
declare
  v_antes text := pg_temp.t40_conteo();
begin
  call pg_temp.como(p_uid);
  perform pg_temp.assert_lanza_codigo_msg(p_consulta, p_codigo, p_fragmento, p_mensaje);
  call pg_temp.reset_sesion();
  perform pg_temp.assert(pg_temp.t40_conteo() = v_antes, p_mensaje || ' · Δ = 0 (antes ' || v_antes || ', después ' || pg_temp.t40_conteo() || ')');
end $$;

-- El error tal cual (código y texto) de una llamada como p_uid, o 'OK'. Para comparar dos
-- llamadas (CB4) y buscar la referencia en el texto (CB5).
create or replace function pg_temp.t40_err(p_uid uuid, p_consulta text) returns text language plpgsql as $$
declare
  v text;
begin
  call pg_temp.como(p_uid);
  begin
    execute p_consulta;
    v := 'OK';
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  call pg_temp.reset_sesion();
  return v;
end $$;

-- =========================================================================================
-- §C · C1 y C2: quién exporta (la base, no la acción)
-- =========================================================================================

-- C1 · La autora (no asignada) exporta: copia profesional, sin avisos.
select pg_temp.t40_ok(:E_AUT, 'aut', :E_P, :E_N1, null, null, 0) is not null;
-- C1 · El titular (asignado, no autor) exporta.
select pg_temp.t40_ok(:E_TIT, 'tit', :E_P, :E_N1, null, null, 0) is not null;

-- C1 · SIN (profesional sin asignación), con el candado abierto: 42501 «Sin acceso».
call pg_temp.como(:E_SIN);
select pg_temp.assert(public.historia_desbloqueada(), '27.C3 gemela · SIN tiene el candado abierto (el 42501 no es del candado)');
call pg_temp.reset_sesion();
select pg_temp.t40_falla(:E_SIN, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1),
  '42501', 'Sin acceso a esa nota', '27.C3 SIN no exporta N1');

-- C1 · TEC: 42501 «No puede exportar».
select pg_temp.t40_falla(:E_TEC, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1),
  '42501', 'No puede exportar notas clínicas', '27.C4 TEC no exporta');

-- C1 · COP lee la v2 por el episodio conjunto (gemela) y aun así no exporta.
call pg_temp.como(:E_COP);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.notas_clinicas_versiones where nota_id = %L', :E_N1)) = 1,
  '27.C5 gemela · COP lee bajo RLS la v2 conjunta de N1 (y solo esa)');
call pg_temp.reset_sesion();
select pg_temp.t40_falla(:E_COP, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1),
  '42501', 'Sin acceso a esa nota', '27.C5 COP, lector por episodio conjunto, no exporta');

-- C2 · ADM sin motivo: «Falta el motivo»; con motivo, sí (gemela).
select pg_temp.t40_falla(:E_ADM, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1),
  '42501', 'Falta el motivo de la copia', '27.C6 ADM sin motivo no exporta');
select pg_temp.t40_ok(:E_ADM, 'adm-paciente', :E_P, :E_N1, 'peticion_paciente', '  REF-T040-SECRETA  ', 2) is not null;
select pg_temp.t40_ok(:E_ADM, 'adm-judicial', :E_P, :E_N1, 'requerimiento_judicial_o_inspeccion', 'Oficio 40/2026', 2) is not null;
select pg_temp.t40_ok(:E_ADM, 'adm-traspaso', :E_P, :E_N1, 'traspaso_caso', 'Traspaso 40', 2) is not null;

-- D8 · Un profesional con motivo: «Solo la administración», aunque sea la autora.
select pg_temp.t40_falla(:E_AUT,
  format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N1, 'traspaso_caso', 'Traspaso 40'),
  '42501', 'Solo la administración pide copias con motivo', '27.C7 AUT con motivo no exporta');

-- D13 · Con el candado cerrado, la autora no exporta (y con él abierto sí: 27.C1).
savepoint t40_candado;
call pg_temp.como(:E_AUT); select public.bloquear_historia(); call pg_temp.reset_sesion();
select pg_temp.t40_falla(:E_AUT, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1),
  '42501', 'La historia no está desbloqueada', '27.C8 AUT con el candado cerrado no exporta');
rollback to savepoint t40_candado;

-- =========================================================================================
-- §D · C2: la proyección del paciente no contiene las reservadas ni la conjunta entera
-- =========================================================================================

select pg_temp.assert(pg_temp.t40_r('adm-paciente')->>'proyeccion' = 'paciente'
  and pg_temp.t40_r('adm-paciente')->>'motivo' = 'peticion_paciente',
  '27.D1 petición del paciente → proyección del paciente');
select pg_temp.assert(position('MARCA-RESERVADA' in pg_temp.t40_r('adm-paciente')::text) = 0,
  '27.D2 la copia del paciente no contiene ninguna reservada');
select pg_temp.assert(position('contenido_canonico' in pg_temp.t40_r('adm-paciente')::text) = 0,
  '27.D3 la copia del paciente no lleva el canónico');
select pg_temp.assert(position('MARCA-CUERPO-2' in pg_temp.t40_r('adm-paciente')::text) = 0
  and position('MARCA-MOTIVO-2' in pg_temp.t40_r('adm-paciente')::text) = 0,
  '27.D4 la v2 conjunta va recortada: ni su cuerpo ni su motivo');
select pg_temp.assert(position('MARCA-CUERPO-1' in pg_temp.t40_r('adm-paciente')::text) > 0,
  '27.D5 gemela · la v1 individual sí lleva su cuerpo');
select pg_temp.assert(
  (pg_temp.t40_r('adm-paciente')->'versiones'->0) ? 'motivo_cambio'
  and (pg_temp.t40_r('adm-paciente')->'versiones'->0) ? 'cuerpo'
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->0) ? 'anotaciones_reservadas'
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->0) ? 'contenido_canonico'
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->0) ? 'participantes',
  '27.D6 paciente · individual: motivo_cambio y cuerpo presentes; reservadas, canónico y participantes ausentes');
select pg_temp.assert(
  jsonb_typeof(pg_temp.t40_r('adm-paciente')->'versiones'->1->'participantes') = 'array'
  and jsonb_array_length(pg_temp.t40_r('adm-paciente')->'versiones'->1->'participantes') = 2
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->1) ? 'cuerpo'
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->1) ? 'motivo_cambio'
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->1) ? 'anotaciones_reservadas'
  and not (pg_temp.t40_r('adm-paciente')->'versiones'->1) ? 'contenido_canonico',
  '27.D7 paciente · conjunta: solo participantes (los dos), sin cuerpo, motivo, reservadas ni canónico');
select pg_temp.assert(
  (select jsonb_agg(x order by x->>'nombre') from jsonb_array_elements(pg_temp.t40_r('adm-paciente')->'versiones'->1->'participantes') x)
  = '[{"nombre":"Nombre40Secreto","apellidos":"Apellido40Secreto","papel":"miembro"},{"nombre":"Pareja40","apellidos":"Participante40","papel":"pareja"}]'::jsonb,
  '27.D8 participantes con nombre, apellidos y papel');

-- La copia completa (judicial y traspaso, y la del profesional) sí lleva las dos reservadas.
select pg_temp.assert(pg_temp.t40_r('adm-judicial')->>'proyeccion' = 'profesional'
  and position('MARCA-RESERVADA-1' in pg_temp.t40_r('adm-judicial')::text) > 0
  and position('MARCA-RESERVADA-2' in pg_temp.t40_r('adm-judicial')::text) > 0,
  '27.D9 requerimiento judicial: proyección profesional, con las dos reservadas');
select pg_temp.assert(pg_temp.t40_r('adm-traspaso')->>'proyeccion' = 'profesional'
  and position('MARCA-RESERVADA-2' in pg_temp.t40_r('adm-traspaso')::text) > 0,
  '27.D10 traspaso del caso: proyección profesional, con reservadas');
select pg_temp.assert(
  pg_temp.t40_r('aut')->>'proyeccion' = 'profesional'
  and pg_temp.t40_r('aut')->'motivo' = 'null'::jsonb
  and pg_temp.t40_r('aut')->'referencia' = 'null'::jsonb
  and (select bool_and(v ? 'motivo_cambio' and v ? 'cuerpo' and v ? 'anotaciones_reservadas'
                       and v ? 'contenido_canonico' and not v ? 'participantes')
         from jsonb_array_elements(pg_temp.t40_r('aut')->'versiones') v)
  and pg_temp.t40_r('aut')->'versiones'->0->'motivo_cambio' = 'null'::jsonb
  and pg_temp.t40_r('aut')->'versiones'->1->>'motivo_cambio' = 'MARCA-MOTIVO-2'
  and pg_temp.t40_r('aut')->'versiones'->0->>'anotaciones_reservadas' = 'MARCA-RESERVADA-1',
  '27.D11 profesional: las cuatro claves de la rama en cada versión (null donde toca), sin participantes');

-- La forma de la respuesta que exige formato.ts (B0.3.4, R6, R7).
select pg_temp.assert(
  pg_temp.t40_r('aut')->>'generada_en' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$'
  and pg_temp.t40_r('aut')->'versiones'->0->>'creada_en' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)$',
  '27.D12 generada_en y creada_en en ISO con desfase (to_jsonb, nunca ::text)');
select pg_temp.assert(
  pg_temp.t40_r('aut')->'nota' = jsonb_build_object('id', :E_N1::uuid, 'fecha_sesion', to_char(current_date, 'YYYY-MM-DD'), 'modalidad', 'pareja')
  and pg_temp.t40_r('aut')->'paciente' = jsonb_build_object('id', :E_P::uuid, 'nombre', 'Nombre40Secreto', 'apellidos', 'Apellido40Secreto')
  and pg_temp.t40_r('aut')->'exportada_por' = '{"nombre_completo":"Autora Cuarenta","rol":"profesional_sanitario"}'::jsonb
  and pg_temp.t40_r('adm-paciente')->'exportada_por' = '{"nombre_completo":"Admin Cuarenta","rol":"administrador"}'::jsonb
  and pg_temp.t40_r('aut')->>'zona' = (select o.zona_horaria from public.organizacion o)
  and pg_temp.t40_r('aut')->'cifrado' = '{"formato_version":1,"algoritmo":"argon2id-aes-256-gcm","kdf":{"m":65536,"t":3,"p":1,"longitud":32}}'::jsonb,
  '27.D13 nota, paciente, exportada_por, zona (sin cita: la de la organización) y cifrado');
select pg_temp.assert(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.t40_r('aut')->'versiones'->0->'sello') k)
    = array['abierta_en', 'cita_id', 'esquema_version', 'fecha_sesion', 'firmada_en', 'margen_sesion_minutos', 'redactada_en_sesion']
  and (pg_temp.t40_r('aut')->'versiones'->0->'sello'->>'esquema_version')::int = 4
  and pg_temp.t40_r('adm-paciente')->'versiones'->1->'sello' = pg_temp.t40_r('aut')->'versiones'->1->'sello',
  '27.D14 el sello: las siete claves del sobre, y el mismo en las dos proyecciones');
select pg_temp.assert(
  pg_temp.t40_r('aut')->'versiones'->0->>'autor_nombre' = 'Autora Cuarenta'
  and pg_temp.t40_r('aut')->'versiones'->1->>'alcance' = 'conjunta',
  '27.D15 autor_nombre y alcance de cada versión');

-- =========================================================================================
-- §E · C3 y CB8: cada exportación deja su rastro, y lo registrado es lo entregado
-- =========================================================================================

select pg_temp.assert(
  (select count(*) from public.exportaciones e
     join public.accesos_historia a on a.id = e.acceso_id
    where e.id = (pg_temp.t40_r('aut')->>'exportacion_id')::uuid
      and e.perfil_id = :E_AUT and e.paciente_id = :E_P and e.nota_id = :E_N1
      and e.proyeccion = 'profesional' and e.motivo is null and e.referencia is null
      and a.perfil_id = :E_AUT and a.paciente_id = :E_P and a.tipo = 'exportacion'
      and a.pestana = 'notas_clinicas' and a.desbloqueo_id is null and a.justificacion is null
      and a.ip = '127.0.0.1'::inet and a.agente = 'banco-27') = 1,
  '27.E1 la copia del profesional: su exportación y su acceso, unidos por acceso_id, sin justificación');
select pg_temp.assert(
  (select count(*) from public.exportaciones e
     join public.accesos_historia a on a.id = e.acceso_id
    where e.id = (pg_temp.t40_r('adm-paciente')->>'exportacion_id')::uuid
      and e.perfil_id = :E_ADM and e.proyeccion = 'paciente' and e.motivo = 'peticion_paciente'
      and e.referencia = 'REF-T040-SECRETA'
      and a.tipo = 'exportacion' and a.desbloqueo_id is null
      and a.justificacion = 'Petición del paciente: REF-T040-SECRETA') = 1,
  '27.E2 la copia del administrador: referencia recortada y «Petición del paciente: REF» en la justificación');
select pg_temp.assert(
  pg_temp.t40_r('adm-paciente')->>'referencia' = 'REF-T040-SECRETA',
  '27.E3 la respuesta lleva la referencia recortada, la misma que la tabla');
select pg_temp.assert(
  (select bool_and(e.versiones = (select array_agg((v->>'numero_version')::int order by i)
                                    from jsonb_array_elements(t.r->'versiones') with ordinality x(v, i)))
     from pg_temp.t40_r t join public.exportaciones e on e.id = (t.r->>'exportacion_id')::uuid),
  '27.E4 (CB8) exportaciones.versiones = los numero_version de la respuesta, en orden, en todas las copias');
select pg_temp.assert(
  (select bool_and(e.formato_version = 1 and e.algoritmo = 'argon2id-aes-256-gcm'
                   and e.parametros_kdf = '{"m":65536,"t":3,"p":1,"longitud":32}'::jsonb
                   and e.creada_en = (t.r->>'generada_en')::timestamptz)
     from pg_temp.t40_r t join public.exportaciones e on e.id = (t.r->>'exportacion_id')::uuid),
  '27.E5 (§A) formato_version, algoritmo y parametros_kdf: los literales de constantes.ts; generada_en = creada_en');
select pg_temp.assert(
  (select count(*) from public.auditoria au
    where au.tabla = 'exportaciones'
      and au.registro_id = pg_temp.t40_r('adm-paciente')->>'exportacion_id') = 1,
  '27.E6 la fila de exportaciones entra en la auditoría (D6)');

-- =========================================================================================
-- §F · C6: el aviso al titular (y a la autora), sin paciente ni referencia
-- =========================================================================================

select pg_temp.assert(
  (select array_agg(n.perfil_id::text order by n.perfil_id::text) from public.notificaciones n
    where n.origen_tabla = 'exportaciones'
      and n.origen_id = (pg_temp.t40_r('adm-paciente')->>'exportacion_id')::uuid)
  = array[:E_TIT, :E_AUT]::text[],
  '27.F1 la copia del administrador avisa al titular y a la autora, y a nadie más (ADM no)');
select pg_temp.assert(
  (select bool_and(n.tipo = 'exportacion_por_administracion'
                   and n.titulo = 'Copia de una nota por la administración'
                   and n.detalle = format('%s ha pedido una copia de una nota de la sesión del %s. Motivo: %s.',
                                          'Admin Cuarenta', to_char(current_date, 'DD/MM/YYYY'), 'Petición del paciente')
                   and position('Nombre40Secreto' in n.detalle) = 0
                   and position('Apellido40Secreto' in n.detalle) = 0
                   and position('REF' in n.detalle) = 0)
     from public.notificaciones n
    where n.origen_tabla = 'exportaciones'
      and n.origen_id = (pg_temp.t40_r('adm-paciente')->>'exportacion_id')::uuid),
  '27.F2 tipo, título y detalle exactos: ni el paciente ni la referencia');
select pg_temp.assert(
  (select count(*) from public.notificaciones n
    where n.origen_tabla = 'exportaciones'
      and n.origen_id in ((pg_temp.t40_r('aut')->>'exportacion_id')::uuid, (pg_temp.t40_r('tit')->>'exportacion_id')::uuid)) = 0,
  '27.F3 la copia del profesional no avisa a nadie');

-- Titular = autor (N3): un solo aviso, sin duplicado.
select pg_temp.t40_ok(:E_ADM, 'adm-n3', :E_P, :E_N3, 'traspaso_caso', 'Traspaso N3', 1) is not null;
select pg_temp.assert(
  (select array_agg(n.perfil_id::text) from public.notificaciones n
    where n.origen_tabla = 'exportaciones'
      and n.origen_id = (pg_temp.t40_r('adm-n3')->>'exportacion_id')::uuid) = array[:E_TIT]::text[],
  '27.F4 titular y autor son la misma persona: un solo aviso');

-- La autora de baja no recibe aviso; el titular sí.
savepoint t40_baja;
update public.perfiles set estado = 'baja', estado_desde = now() where id = :E_AUT;
select pg_temp.t40_ok(:E_ADM, 'adm-baja', :E_P, :E_N1, 'peticion_paciente', 'Con la autora de baja', 1) is not null;
select pg_temp.assert(
  (select array_agg(n.perfil_id::text) from public.notificaciones n
    where n.origen_tabla = 'exportaciones'
      and n.origen_id = (pg_temp.t40_r('adm-baja')->>'exportacion_id')::uuid) = array[:E_TIT]::text[],
  '27.F5 con la autora de baja, solo el titular recibe el aviso');
rollback to savepoint t40_baja;

-- =========================================================================================
-- §G · C4: todas las versiones, en orden, con la huella de la tabla
-- =========================================================================================

select pg_temp.assert(
  (select bool_and(
     (select array_agg((v->>'numero_version')::int order by i) from jsonb_array_elements(t.r->'versiones') with ordinality x(v, i))
     = (select array_agg(nv.numero_version order by nv.numero_version) from public.notas_clinicas_versiones nv where nv.nota_id = :E_N1))
     from pg_temp.t40_r t where t.etiqueta in ('aut', 'tit', 'adm-paciente', 'adm-judicial', 'adm-traspaso')),
  '27.G1 todas las versiones de N1, en orden estrictamente creciente, en las dos proyecciones');
select pg_temp.assert(
  not exists (
    select 1
      from pg_temp.t40_r t
      cross join lateral jsonb_array_elements(t.r->'versiones') v
      join public.notas_clinicas_versiones nv
        on nv.nota_id = (t.r->'nota'->>'id')::uuid and nv.numero_version = (v->>'numero_version')::int
     where v->>'huella' <> encode(nv.huella, 'hex')
        or v->>'huella_anterior' <> encode(nv.huella_anterior, 'hex'))
  and (select bool_and(v->>'huella' ~ '^[0-9a-f]{64}$' and v->>'huella_anterior' ~ '^[0-9a-f]{64}$')
         from pg_temp.t40_r t cross join lateral jsonb_array_elements(t.r->'versiones') v),
  '27.G2 huella y huella_anterior de cada versión = las de notas_clinicas_versiones, en hex de 64 minúsculas');

-- =========================================================================================
-- §H · registrar_fichero_exportado
-- =========================================================================================

select pg_temp.t40_conteo() as t40_antes_h, pg_temp.t40_r('aut')->>'exportacion_id' as t40_x_aut \gset
call pg_temp.como(:E_AUT);
select pg_temp.assert_no_lanza(
  format('select public.registrar_fichero_exportado(%L, %L)', :'t40_x_aut', :E_HEX),
  '27.H1 la autora registra el fichero de su copia, en plazo');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select encode(f.huella_fichero, 'hex') from public.exportaciones_ficheros f
    where f.exportacion_id = (pg_temp.t40_r('aut')->>'exportacion_id')::uuid) = :E_HEX,
  '27.H2 la huella queda tal cual (decode hex)');
select pg_temp.assert(pg_temp.t40_n_fic() = split_part(:'t40_antes_h', '/', 4)::bigint + 1, '27.H3 +1 fichero');

select pg_temp.t40_falla(:E_AUT,
  format('select public.registrar_fichero_exportado(%L, %L)', pg_temp.t40_r('aut')->>'exportacion_id', :E_HEX),
  '23505', 'Esa copia ya tiene fichero registrado', '27.H4 la segunda vez: 23505 con el texto propio');
select pg_temp.t40_falla(:E_TIT,
  format('select public.registrar_fichero_exportado(%L, %L)', pg_temp.t40_r('aut')->>'exportacion_id', :E_HEX),
  '42501', 'Esa exportación no es tuya o ha caducado', '27.H5 otro usuario no registra la copia ajena');
select pg_temp.t40_falla(:E_TIT,
  format('select public.registrar_fichero_exportado(%L, %L)', pg_temp.t40_r('tit')->>'exportacion_id', repeat('AB', 32)),
  '22023', 'La huella del fichero no es válida', '27.H6 huella en mayúsculas: 22023');
select pg_temp.t40_falla(:E_TIT,
  format('select public.registrar_fichero_exportado(%L, %L)', pg_temp.t40_r('tit')->>'exportacion_id', 'abc'),
  '22023', 'La huella del fichero no es válida', '27.H7 huella corta: 22023');
select pg_temp.t40_falla(:E_TIT,
  format('select public.registrar_fichero_exportado(%L, %L)', :E_RND, :E_HEX),
  '42501', 'Esa exportación no es tuya o ha caducado', '27.H8 una exportación que no existe: el mismo 42501');

-- Caducada: una fila de hace 16 minutos, insertada como postgres (que conserva insert).
insert into public.exportaciones (id, perfil_id, paciente_id, nota_id, versiones, proyeccion, formato_version,
                                  algoritmo, parametros_kdf, acceso_id, creada_en)
values ('40400000-0000-4000-8000-0000000000a1', :E_TIT, :E_P, :E_N1, array[1, 2], 'profesional', 1,
        'argon2id-aes-256-gcm', '{"m":65536,"t":3,"p":1,"longitud":32}', -40400001, now() - interval '16 minutes');
select pg_temp.t40_falla(:E_TIT,
  format('select public.registrar_fichero_exportado(%L, %L)', '40400000-0000-4000-8000-0000000000a1', :E_HEX),
  '42501', 'Esa exportación no es tuya o ha caducado', '27.H9 la exportación de hace 16 minutos ha caducado');

-- Un perfil de baja no registra (y activo, sí: H1).
savepoint t40_baja_registro;
update public.perfiles set estado = 'baja', estado_desde = now() where id = :E_TIT;
select pg_temp.t40_falla(:E_TIT,
  format('select public.registrar_fichero_exportado(%L, %L)', pg_temp.t40_r('tit')->>'exportacion_id', :E_HEX),
  '42501', 'No puede exportar notas clínicas', '27.H10 un perfil de baja no registra');
rollback to savepoint t40_baja_registro;

-- =========================================================================================
-- §B · C3: update, delete y truncate fallan como postgres en las dos tablas
-- =========================================================================================

select pg_temp.assert_lanza_codigo($q$update public.exportaciones set referencia = 'x'$q$, '42501',
  '27.B1 update de exportaciones como postgres');
select pg_temp.assert_lanza_codigo($q$delete from public.exportaciones$q$, '42501',
  '27.B2 delete de exportaciones como postgres');
select pg_temp.assert_lanza_codigo($q$truncate public.exportaciones$q$, '42501',
  '27.B3 truncate de exportaciones como postgres');
select pg_temp.assert_lanza_codigo($q$update public.exportaciones_ficheros set huella_fichero = huella_fichero$q$, '42501',
  '27.B4 update de exportaciones_ficheros como postgres');
select pg_temp.assert_lanza_codigo($q$delete from public.exportaciones_ficheros$q$, '42501',
  '27.B5 delete de exportaciones_ficheros como postgres');
select pg_temp.assert_lanza_codigo($q$truncate public.exportaciones_ficheros$q$, '42501',
  '27.B6 truncate de exportaciones_ficheros como postgres');
-- Con el privilegio recuperado, el disparador sigue parando (capa 2), sobre filas del banco.
savepoint t40_capa2;
grant update, delete on table public.exportaciones, public.exportaciones_ficheros to postgres;
select pg_temp.assert_lanza_codigo_msg(
  format('update public.exportaciones set referencia = referencia where id = %L', pg_temp.t40_r('aut')->>'exportacion_id'),
  '42501', 'es de solo adición', '27.B7 con el privilegio recuperado, el disparador para el update');
select pg_temp.assert_lanza_codigo_msg(
  format('delete from public.exportaciones_ficheros where exportacion_id = %L', pg_temp.t40_r('aut')->>'exportacion_id'),
  '42501', 'es de solo adición', '27.B8 con el privilegio recuperado, el disparador para el delete');
rollback to savepoint t40_capa2;
select pg_temp.assert(
  (select count(*) from public.tablas_solo_adicion t where t.tabla in ('exportaciones', 'exportaciones_ficheros')) = 2
  and (select count(*) from public.cobertura_solo_adicion()) = 0,
  '27.B9 las dos tablas están en tablas_solo_adicion y la cobertura de las tres capas da cero');

-- =========================================================================================
-- §A · Las columnas y los checks (C5: no hay sitio para la contraseña ni el fichero)
-- =========================================================================================

select pg_temp.assert(
  (select string_agg(c.column_name, ',' order by c.ordinal_position) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'exportaciones')
  = 'id,perfil_id,paciente_id,nota_id,versiones,proyeccion,motivo,referencia,formato_version,algoritmo,parametros_kdf,acceso_id,creada_en',
  '27.A1 exportaciones: exactamente las columnas de §1.1');
select pg_temp.assert(
  (select string_agg(c.column_name, ',' order by c.ordinal_position) from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'exportaciones_ficheros')
  = 'exportacion_id,huella_fichero,registrado_en',
  '27.A2 exportaciones_ficheros: exactamente las columnas de §1.1');
select pg_temp.assert(
  enum_range(null::public.motivo_exportacion)::text = '{peticion_paciente,requerimiento_judicial_o_inspeccion,traspaso_caso}'
  and enum_range(null::public.proyeccion_exportacion)::text = '{profesional,paciente}',
  '27.A3 los enums, con los valores y el orden de constantes.ts');
select pg_temp.assert(
  public.etiqueta_motivo_exportacion('peticion_paciente') = 'Petición del paciente'
  and public.etiqueta_motivo_exportacion('requerimiento_judicial_o_inspeccion') = 'Requerimiento judicial o inspección'
  and public.etiqueta_motivo_exportacion('traspaso_caso') = 'Traspaso del caso',
  '27.A4 las tres etiquetas del motivo');
select pg_temp.assert_lanza_codigo_msg(
  $q$insert into public.exportaciones (perfil_id, paciente_id, nota_id, versiones, proyeccion, motivo, referencia,
       formato_version, algoritmo, parametros_kdf, acceso_id)
     values ('40400000-0000-4000-8000-000000000001', '40400000-0000-4000-8000-0000000000d1', '40400000-0000-4000-8000-0000000000f1',
       array[1], 'paciente', 'traspaso_caso', 'abc', 1, 'argon2id-aes-256-gcm', '{}', -40400002)$q$,
  '23514', 'exportaciones', '27.A5 proyección del paciente con otro motivo: 23514');
select pg_temp.assert_lanza_codigo_msg(
  $q$insert into public.exportaciones (perfil_id, paciente_id, nota_id, versiones, proyeccion, motivo, referencia,
       formato_version, algoritmo, parametros_kdf, acceso_id)
     values ('40400000-0000-4000-8000-000000000001', '40400000-0000-4000-8000-0000000000d1', '40400000-0000-4000-8000-0000000000f1',
       array[]::int[], 'profesional', null, null, 1, 'argon2id-aes-256-gcm', '{}', -40400003)$q$,
  '23514', 'exportaciones', '27.A6 sin versiones: 23514');
select pg_temp.assert_lanza_codigo_msg(
  $q$insert into public.exportaciones_ficheros (exportacion_id, huella_fichero)
     values ('40400000-0000-4000-8000-0000000000a1', '\x0102')$q$,
  '23514', 'exportaciones_ficheros', '27.A7 una huella que no mide 32 bytes: 23514');

-- =========================================================================================
-- §I · Permisos
-- =========================================================================================

select pg_temp.assert(
  not has_table_privilege('authenticated', 'public.exportaciones', 'select')
  and not has_table_privilege('authenticated', 'public.exportaciones', 'insert')
  and not has_table_privilege('authenticated', 'public.exportaciones_ficheros', 'select')
  and not has_table_privilege('authenticated', 'public.exportaciones_ficheros', 'insert')
  and not has_table_privilege('anon', 'public.exportaciones', 'select')
  and not has_table_privilege('service_role', 'public.exportaciones', 'select')
  and not has_table_privilege('service_role', 'public.exportaciones_ficheros', 'insert'),
  '27.I1 nadie de la API lee ni inserta en las dos tablas');
select pg_temp.assert(
  not has_function_privilege('anon', 'public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)', 'execute')
  and not has_function_privilege('anon', 'public.registrar_fichero_exportado(uuid,text)', 'execute')
  and not has_function_privilege('anon', 'public.notas_para_copia(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.etiqueta_motivo_exportacion(public.motivo_exportacion)', 'execute')
  and has_function_privilege('authenticated', 'public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)', 'execute')
  and has_function_privilege('authenticated', 'public.registrar_fichero_exportado(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'public.notas_para_copia(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.etiqueta_motivo_exportacion(public.motivo_exportacion)', 'execute'),
  '27.I2 anon no ejecuta ninguna; authenticated las tres públicas y no la etiqueta');
-- La tabla vacía para authenticated: ni con sesión de la autora ve sus propias filas.
call pg_temp.como(:E_AUT);
select pg_temp.assert_lanza_codigo('select * from public.exportaciones', '42501', '27.I3 authenticated no lee exportaciones');
call pg_temp.reset_sesion();

-- =========================================================================================
-- §J · notas_para_copia (P2-a)
-- =========================================================================================

call pg_temp.como(:E_ADM);
select pg_temp.assert(
  (select array_agg(n.nota_id::text || '|' || n.fecha_sesion || '|' || n.autor_nombre || '|' || n.versiones order by n.nota_id)
     from public.notas_para_copia(:E_P) n)
  = array[:E_N1 || '|' || current_date || '|Autora Cuarenta|2', :E_N3 || '|' || current_date || '|Titular Cuarenta|1'],
  '27.J1 ADM no asignado ve N1 (2 versiones) y N3 (1); N0, sin versiones, no');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_para_copia(%L)', :E_PA)) = 0,
  '27.J2 ADM asignado a PA ve cero (ya lee sus notas por RLS)');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :E_N4)) = 1,
  '27.J2 gemela · ADM asignado lee N4 por RLS');
call pg_temp.reset_sesion();
call pg_temp.como(:E_SIN);
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_para_copia(%L)', :E_P)) = 0, '27.J3 SIN ve cero');
call pg_temp.reset_sesion();
call pg_temp.como(:E_TEC);
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_para_copia(%L)', :E_P)) = 0, '27.J4 TEC ve cero');
call pg_temp.reset_sesion();
call pg_temp.como(:E_AUT);
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_para_copia(%L)', :E_P)) = 0, '27.J5 la autora (no administradora) ve cero');
call pg_temp.reset_sesion();
savepoint t40_j_candado;
call pg_temp.como(:E_ADM); select public.bloquear_historia();
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_para_copia(%L)', :E_P)) = 0, '27.J6 ADM con el candado cerrado ve cero');
call pg_temp.reset_sesion();
rollback to savepoint t40_j_candado;
select pg_temp.assert(
  pg_get_function_result('public.notas_para_copia(uuid)'::regprocedure)
    = 'TABLE(nota_id uuid, fecha_sesion date, autor_nombre text, versiones integer)',
  '27.J7 notas_para_copia devuelve exactamente cuatro columnas');

-- =========================================================================================
-- §K · CB2-CB6
-- =========================================================================================

-- CB2 · La guarda de solo lectura, antes del rol.
select pg_temp.t40_conteo() as t40_antes_k, pg_temp.t40_r('tit')->>'exportacion_id' as t40_x_tit \gset
call pg_temp.como(:E_AUT);
savepoint t40_solo_lectura;
set local transaction_read_only = on;
select pg_temp.assert_lanza_codigo_msg(format('select public.exportar_nota(%L, %L)', :E_P, :E_N1), '25006',
  'La exportación exige una transacción de escritura', '27.K1 (CB2) AUT, candado abierto, solo lectura: 25006 propio');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.registrar_fichero_exportado(%L, %L)', :'t40_x_tit', :E_HEX), '25006',
  'El registro de la copia exige una transacción de escritura', '27.K2 (CB2) registrar en solo lectura: 25006 propio');
rollback to savepoint t40_solo_lectura;
call pg_temp.reset_sesion();
call pg_temp.como(:E_TEC);
savepoint t40_solo_lectura_tec;
set local transaction_read_only = on;
select pg_temp.assert_lanza_codigo_msg(format('select public.exportar_nota(%L, %L)', :E_P, :E_N1), '25006',
  'La exportación exige una transacción de escritura', '27.K3 (CB2) TEC en solo lectura: el MISMO 25006, no 42501');
select pg_temp.assert_lanza_codigo_msg(
  format('select public.registrar_fichero_exportado(%L, %L)', :'t40_x_tit', :E_HEX), '25006',
  'El registro de la copia exige una transacción de escritura', '27.K4 (CB2) TEC registrar en solo lectura: 25006');
rollback to savepoint t40_solo_lectura_tec;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t40_conteo() = :'t40_antes_k', '27.K5 (CB2) tras el rollback, Δ = 0');

-- CB3 · Los parámetros nulos (gemelas positivas: 27.C1 y 27.H1).
select pg_temp.t40_falla(:E_AUT, format('select public.exportar_nota(null, %L)', :E_N1),
  '22023', 'Faltan el paciente o la nota', '27.K6 (CB3) paciente nulo');
select pg_temp.t40_falla(:E_AUT, format('select public.exportar_nota(%L, null)', :E_P),
  '22023', 'Faltan el paciente o la nota', '27.K7 (CB3) nota nula');
select pg_temp.t40_falla(:E_TIT, format('select public.registrar_fichero_exportado(null, %L)', :E_HEX),
  '22023', 'La huella del fichero no es válida', '27.K8 (CB3) exportación nula');
select pg_temp.t40_falla(:E_TIT, format('select public.registrar_fichero_exportado(%L, null)', pg_temp.t40_r('tit')->>'exportacion_id'),
  '22023', 'La huella del fichero no es válida', '27.K9 (CB3) huella nula');
-- La gemela de K8/K9: TIT registra la suya.
call pg_temp.como(:E_TIT);
select pg_temp.assert_no_lanza(
  format('select public.registrar_fichero_exportado(%L, %L)', :'t40_x_tit', :E_HEX),
  '27.K10 (CB3) gemela · TIT registra su copia con id y huella válidos');
call pg_temp.reset_sesion();

-- CB4 · Sin oráculo de existencia: N1 (existe, es de P) y un uuid que no es nada, el mismo error.
select pg_temp.assert(
  pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L, null, %L)', :E_P, :E_N1, 'Una referencia'))
  = pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L, null, %L)', :E_P, :E_RND, 'Una referencia'))
  and pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L, null, %L)', :E_P, :E_N1, 'Una referencia'))
      like '22023 %van juntos%',
  '27.K11 (CB4) SIN con referencia y sin motivo: 22023 «van juntos», exista o no la nota');
select pg_temp.assert(
  pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1))
  = pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L)', :E_P, :E_RND))
  and pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1)) = '42501 Sin acceso a esa nota.',
  '27.K12 (CB4) SIN sin motivo: 42501 «Sin acceso», exista o no la nota');
select pg_temp.assert(
  pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N1, 'traspaso_caso', 'Una referencia'))
  = pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_RND, 'traspaso_caso', 'Una referencia'))
  and pg_temp.t40_err(:E_SIN, format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N1, 'traspaso_caso', 'Una referencia'))
      = '42501 Solo la administración pide copias con motivo.',
  '27.K13 (CB4) SIN con motivo: 42501 «Solo la administración», exista o no la nota');
select pg_temp.assert(
  pg_temp.t40_err(:E_ADM, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1))
  = pg_temp.t40_err(:E_ADM, format('select public.exportar_nota(%L, %L)', :E_P, :E_RND))
  and pg_temp.t40_err(:E_ADM, format('select public.exportar_nota(%L, %L)', :E_P, :E_N1)) = '42501 Falta el motivo de la copia.',
  '27.K14 (CB4) ADM sin motivo: «Falta el motivo», exista o no la nota');
select pg_temp.assert(
  pg_temp.t40_err(:E_AUT, format('select public.exportar_nota(%L, %L)', :E_P2, :E_N1))
  = pg_temp.t40_err(:E_AUT, format('select public.exportar_nota(%L, %L)', :E_P, :E_RND))
  and pg_temp.t40_err(:E_AUT, format('select public.exportar_nota(%L, %L)', :E_P2, :E_N1)) = '42501 Sin acceso a esa nota.',
  '27.K15 (CB4) la autora con N1 y el paciente de otra nota: «Sin acceso», igual que con un uuid que no es nada');
select pg_temp.assert(
  pg_temp.t40_err(:E_ADM, format('select public.exportar_nota(%L, %L, %L, %L)', :E_P2, :E_N1, 'traspaso_caso', 'Una referencia'))
  = '42501 Sin acceso a esa nota.',
  '27.K16 ADM con motivo y la nota de otro paciente: «Sin acceso»');

-- CB5 · La referencia no sale de su sitio: ningún fallo posterior al paso 3 la lleva.
select pg_temp.t40_conteo() as t40_antes_cb5 \gset
select pg_temp.assert(
  position('REF-T040-SECRETA' in pg_temp.t40_err(:E_SIN,
    format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N1, 'peticion_paciente', 'REF-T040-SECRETA'))) = 0
  and pg_temp.t40_err(:E_SIN,
    format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N1, 'peticion_paciente', 'REF-T040-SECRETA')) like '42501 %',
  '27.K17 (CB5) paso 4 (rol): la referencia no está en el error');
savepoint t40_cb5;
call pg_temp.como(:E_ADM); select public.bloquear_historia(); call pg_temp.reset_sesion();
select pg_temp.assert(
  pg_temp.t40_err(:E_ADM,
    format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N1, 'peticion_paciente', 'REF-T040-SECRETA'))
  = '42501 La historia no está desbloqueada.',
  '27.K18 (CB5) paso 7 (candado): el error no lleva la referencia');
rollback to savepoint t40_cb5;
select pg_temp.assert(
  pg_temp.t40_err(:E_ADM,
    format('select public.exportar_nota(%L, %L, %L, %L)', :E_P, :E_N0, 'peticion_paciente', 'REF-T040-SECRETA'))
  = '22023 La nota no tiene versiones firmadas.',
  '27.K19 (CB5) paso 8 (sin versiones): el error no lleva la referencia');
select pg_temp.assert(pg_temp.t40_conteo() = :'t40_antes_cb5', '27.K20 (CB5) los tres fallos dejan Δ = 0');
select pg_temp.assert(
  (select bool_and(position('REF-T040-SECRETA' in n.detalle) = 0) from public.notificaciones n
    where n.origen_tabla = 'exportaciones' and n.perfil_id::text like '40400000-%')
  and exists (select 1 from public.exportaciones e where e.referencia = 'REF-T040-SECRETA' and e.paciente_id = :E_P)
  and exists (select 1 from public.accesos_historia a where a.justificacion like '%REF-T040-SECRETA' and a.paciente_id = :E_P),
  '27.K21 (CB5) la referencia está en exportaciones y en la justificación, y en ningún aviso');

-- CB6 · La forma de las funciones, leída del catálogo.
select p.prosrc as t40_src_exportar from pg_proc p
 where p.oid = 'public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)'::regprocedure \gset
select pg_temp.assert(
  pg_get_function_result('public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)'::regprocedure) = 'jsonb'
  and not (select p.proretset from pg_proc p
            where p.oid = 'public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)'::regprocedure),
  '27.K22 (CB6) exportar_nota devuelve jsonb escalar (R1)');
select pg_temp.assert(
  not exists (
    select 1 from pg_proc p
     where p.oid in ('public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)'::regprocedure,
                     'public.registrar_fichero_exportado(uuid,text)'::regprocedure,
                     'public.notas_para_copia(uuid)'::regprocedure)
       and p.prosrc ~* 'exception\s+when'),
  '27.K23 (CB6) ninguna de las tres funciones captura excepciones (R2)');
select pg_temp.assert(
  not exists (
    select 1 from pg_proc p
     cross join lateral regexp_split_to_table(p.prosrc, E'\n') l
     where p.oid in ('public.exportar_nota(uuid,uuid,public.motivo_exportacion,text,inet,text)'::regprocedure,
                     'public.registrar_fichero_exportado(uuid,text)'::regprocedure,
                     'public.notas_para_copia(uuid)'::regprocedure)
       and l ~* '\mraise\M' and position('%' in l) > 0),
  '27.K24 (CB6) ningún raise lleva % (R3)');
select pg_temp.assert(
  (length(:'t40_src_exportar') - length(replace(:'t40_src_exportar', 'notas_clinicas_versiones', '')))
    / length('notas_clinicas_versiones') = 1,
  '27.K25 (CB6) exportar_nota lee notas_clinicas_versiones UNA sola vez (H27)');

-- =========================================================================================
-- Cierre (H25): candados cerrados, sesión limpia, nada en pg_temp que estorbe a los de detrás
-- =========================================================================================

call pg_temp.como(:E_ADM); select public.bloquear_historia(); call pg_temp.reset_sesion();
call pg_temp.como(:E_TIT); select public.bloquear_historia(); call pg_temp.reset_sesion();
call pg_temp.como(:E_AUT); select public.bloquear_historia(); call pg_temp.reset_sesion();
call pg_temp.como(:E_COP); select public.bloquear_historia(); call pg_temp.reset_sesion();
call pg_temp.como(:E_SIN); select public.bloquear_historia(); call pg_temp.reset_sesion();
drop table pg_temp.t40_r;

\echo '27-exportaciones: completo.'
