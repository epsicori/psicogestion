-- T-003 · Batería de identificación (ADR-029). El índice único rechaza el alta doble; el
-- técnico administrativo no lee la tabla en absoluto.

\echo ''
\echo '=== 08-identificacion ==='

-- El técnico ya se probó sin acceso en 02-matriz-roles.sql; aquí el índice único.
select pg_temp.assert_lanza(
  format(
    'insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values (%L, %L, %L, %L, %L, %L)',
    :P2, 'dni', sha256('dni-p1-otra-vez'::bytea), substr(sha256('nonce-otra'::bytea),1,12), substr(sha256('etiqueta-otra'::bytea),1,16), sha256('indice-p1'::bytea)
  ),
  'Un segundo alta con el MISMO índice cifrado (mismo DNI) debe rechazarse: es el alta doble que el ADR-029 existe para impedir'
);

-- Gemela positiva: un índice DISTINTO sí se admite.
insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values
  (:P2, 'dni', sha256('dni-p2'::bytea), substr(sha256('nonce-p2'::bytea),1,12), substr(sha256('etiqueta-p2'::bytea),1,16), sha256('indice-p2-distinto'::bytea));

select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :P2)) = 1,
  'Un índice distinto sí entra: el rechazo de arriba era por el índice repetido, no por la tabla en general');

\echo '08-identificacion: completa.'
