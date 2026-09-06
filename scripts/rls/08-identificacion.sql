-- T-003 · Batería de identificación (ADR-029). El índice único rechaza el alta doble; el
-- técnico administrativo no lee la tabla en absoluto.

\echo ''
\echo '=== 08-identificacion ==='

-- El técnico ya se probó sin acceso en 02-matriz-roles.sql; aquí el índice único, EN
-- SESIÓN de PRO2 (profesional asignado a P2) — no como postgres, para ejercer de verdad
-- pacientes_identificacion_alta y no solo el índice.
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza(
  format(
    'insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values (%L, %L, %L, %L, %L, %L)',
    :P2, 'dni', sha256('dni-p1-otra-vez'::bytea), substr(sha256('nonce-otra'::bytea),1,12), substr(sha256('etiqueta-otra'::bytea),1,16), sha256('indice-p1'::bytea)
  ),
  'Un segundo alta con el MISMO índice cifrado (mismo DNI) debe rechazarse: es el alta doble que el ADR-029 existe para impedir'
);

-- Gemela positiva: un índice DISTINTO sí se admite, y con PRO2 (asignado) en sesión real.
insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values
  (:P2, 'dni', sha256('dni-p2'::bytea), substr(sha256('nonce-p2'::bytea),1,12), substr(sha256('etiqueta-p2'::bytea),1,16), sha256('indice-p2-distinto'::bytea));

select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :P2)) = 1,
  'Un índice distinto sí entra, dado de alta por PRO2 en sesión real: el rechazo de arriba era por el índice repetido, no por la tabla en general');
call pg_temp.reset_sesion();

-- Gemela positiva/negativa de la política de alta sobre la MISMA fila (PMENOR): PRO1 (su
-- profesional asignado) SÍ puede darla de alta; PRO2 (no asignado) NO puede, con la misma
-- sentencia salvo el rol y el índice.
call pg_temp.como(:PRO1);
insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values
  (:PMENOR, 'dni', sha256('dni-menor'::bytea), substr(sha256('nonce-menor'::bytea),1,12), substr(sha256('etiqueta-menor'::bytea),1,16), sha256('indice-menor-otro'::bytea));
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :PMENOR)) = 1,
  'PRO1 (profesional asignado al menor) SÍ puede dar de alta su identificación');
call pg_temp.reset_sesion();

-- PBAJA no tiene fila propia en pacientes_identificacion (a diferencia de P1/P2/PMENOR),
-- así que un rechazo aquí es inequívocamente de la política, no del índice ni de la
-- clave primaria. Su profesional es PRO1 desde la reasignación de 04-baja.sql: PRO2 no
-- tiene ningún vínculo con PBAJA.
call pg_temp.como(:PRO2);
select pg_temp.assert_lanza(
  format(
    'insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values (%L, %L, %L, %L, %L, %L)',
    :PBAJA, 'dni', sha256('dni-pbaja'::bytea), substr(sha256('nonce-pbaja'::bytea),1,12), substr(sha256('etiqueta-pbaja'::bytea),1,16), sha256('indice-pbaja'::bytea)
  ),
  'PRO2 (sin vínculo con PBAJA) NO puede dar de alta su identificación: pacientes_identificacion_alta lo rechaza'
);
call pg_temp.reset_sesion();

\echo '08-identificacion: completa.'
