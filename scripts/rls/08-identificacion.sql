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

-- ---------------------------------------------------------------------------------------
-- T-032 (ADR-060/061): el técnico NO escribe identificación, aunque SÍ la lea desde este
-- ticket. Sobre P1, que TEC1 SÍ lee (02-matriz-roles.sql): un UPDATE 0 o un INSERT que
-- fallara por otra vía no probarían nada (pruebas.md).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format(
    'insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values (%L, %L, %L, %L, %L, %L)',
    :PMENOR, 'dni', sha256('dni-tec1-insert'::bytea), substr(sha256('nonce-tec1-insert'::bytea),1,12), substr(sha256('etiqueta-tec1-insert'::bytea),1,16), sha256('indice-tec1-insert'::bytea)
  ),
  '42501',
  'TEC1 (lee P1/su centro) NO puede dar de alta una identificación: pacientes_identificacion_alta lo rechaza'
);
-- La política de UPDATE oculta la fila en la cláusula USING: un UPDATE de TEC1 sobre P1
-- afecta CERO filas y no lanza nada por sí solo (pruebas.md: «UPDATE 0 no prueba nada»).
-- La prueba real es que el valor NO cambió, leído después con una sesión que SÍ ve P1.
update public.pacientes_identificacion set dni_cifrado = sha256('otro-tec1'::bytea) where paciente_id = :P1;
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert(
  (select dni_cifrado from public.pacientes_identificacion where paciente_id = :P1) = sha256('dni-p1'::bytea),
  'TEC1 NO puede modificar la identificación de P1: el UPDATE afectó cero filas (RLS) y el dni_cifrado sigue siendo el original — comprobado con una sesión que sí ve la fila, no con un UPDATE 0 a ciegas'
);
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- clave_de_cifrado(): la clave no llega al navegador. authenticated -> 42501; postgres
-- (hereda service_role en local) -> la lee. Sin la gemela positiva, un revoke de más
-- pasaría por bueno (pruebas.md).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  'select public.clave_de_cifrado(''identificacion_cifrado_v1'')',
  '42501',
  'authenticated NO puede leer la clave de cifrado del Vault'
);
call pg_temp.reset_sesion();

select pg_temp.assert(
  length(public.clave_de_cifrado('identificacion_cifrado_v1')) = 44,
  'postgres (service_role) SÍ lee la clave de cifrado: 44 caracteres en base64 (32 bytes)'
);

-- ---------------------------------------------------------------------------------------
-- Fila solo-domicilio: entra sin documento. Y una fila vacía (ni documento ni domicilio)
-- se rechaza con 23514, no con 42501: es una cuestión de coherencia, no de permiso.
-- ---------------------------------------------------------------------------------------
-- PBAJA y PFUS son de PRO1 (el segundo, desde la reasignación de 04-baja.sql y la
-- fijación de PFUS respectivamente): la misma sesión sirve para las tres inserciones de
-- este bloque, incluida la fila vacía de PFUS más abajo.
call pg_temp.como(:PRO1);
insert into public.pacientes_identificacion (paciente_id, domicilio_cifrado, domicilio_nonce, domicilio_etiqueta, domicilio_clave_version) values
  (:PBAJA, sha256('domicilio-solo-pbaja'::bytea), substr(sha256('nonce-domicilio-pbaja'::bytea),1,12), substr(sha256('etiqueta-domicilio-pbaja'::bytea),1,16), 1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L and dni_cifrado is null', :PBAJA)) = 1,
  'Una fila SOLO con domicilio (sin documento) entra: pacientes_identificacion_documento_todo_o_nada no exige el documento en sí');

select pg_temp.assert_lanza_codigo(
  format(
    'insert into public.pacientes_identificacion (paciente_id) values (%L)',
    :PFUS
  ),
  '23514',
  'Una fila SIN documento y SIN domicilio se rechaza: pacientes_identificacion_fila_no_vacia'
);
call pg_temp.reset_sesion();

-- Índice único: dos filas de SOLO DOMICILIO conviven (los nulos de dni_indice no chocan),
-- gemela de la doble alta ya probada arriba con documento. PFUS no tiene fila propia
-- todavía (paciente_id es PRIMARY KEY: una sola fila por paciente), así que sirve de
-- segundo sujeto sin chocar con el de PBAJA de arriba.
call pg_temp.como(:PRO1);
insert into public.pacientes_identificacion (paciente_id, domicilio_cifrado, domicilio_nonce, domicilio_etiqueta, domicilio_clave_version) values
  (:PFUS, sha256('domicilio-solo-pfus'::bytea), substr(sha256('nonce-domicilio-pfus'::bytea),1,12), substr(sha256('etiqueta-domicilio-pfus'::bytea),1,16), 1);
call pg_temp.reset_sesion();
select pg_temp.assert(
  pg_temp.contar('select * from public.pacientes_identificacion where dni_indice is null and domicilio_cifrado is not null') = 2,
  'Dos filas de solo-domicilio conviven: el índice único sobre dni_indice no choca entre nulos (nulls distinct por defecto)'
);

-- ---------------------------------------------------------------------------------------
-- alta_paciente(): fecha de nacimiento nula -> 23514 (criterio 11, tercera capa).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('select public.alta_paciente(%L, %L, null)', 'Sin', 'Fecha'),
  '23514',
  'alta_paciente() con fecha_nacimiento nula se rechaza: la obligación también vive en la base'
);
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- El rastro del descifrado (ADR-060). leer_identificacion() deja rastro en `auditoria`
-- con operacion = 'LECTURA_IDENTIFICACION'; una segunda llamada seguida no añade otra
-- (ventana de quince minutos, pruebas.md); otro centro no da ni fila ni rastro.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.leer_identificacion(%L)', :P1)) = 1,
  'TEC1: leer_identificacion(P1) devuelve una fila');
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.auditoria where operacion = ''LECTURA_IDENTIFICACION'' and actor_id = %L and registro_id = %L',
    :TEC1, :P1::text
  )) = 1,
  'TEC1: la primera lectura de P1 añade UNA fila de rastro con su actor_id y el paciente'
);
select * from public.leer_identificacion(:P1);
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.auditoria where operacion = ''LECTURA_IDENTIFICACION'' and actor_id = %L and registro_id = %L',
    :TEC1, :P1::text
  )) = 1,
  'TEC1: una segunda lectura seguida de P1 NO añade otra fila (ventana de quince minutos)'
);
select pg_temp.assert(pg_temp.contar(format('select * from public.leer_identificacion(%L)', :P2)) = 0,
  'TEC1 (centro A): leer_identificacion(P2) —otro centro— no devuelve fila');
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.auditoria where operacion = ''LECTURA_IDENTIFICACION'' and actor_id = %L and registro_id = %L',
    :TEC1, :P2::text
  )) = 0,
  'TEC1: sin fila de P2, tampoco hay rastro de P2: el registro no exime a nadie, pero tampoco inventa lecturas que no hubo');
call pg_temp.reset_sesion();

-- Gemelas: ADM y PRO1 también dejan rastro al leer — el registro no exime a nadie.
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select * from public.leer_identificacion(%L)', :P1)) = 1,
  'ADM: leer_identificacion(P1) devuelve una fila');
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.auditoria where operacion = ''LECTURA_IDENTIFICACION'' and actor_id = %L and registro_id = %L',
    :ADM, :P1::text
  )) = 1,
  'ADM: su propia lectura de P1 también deja rastro');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.leer_identificacion(%L)', :P1)) = 1,
  'PRO1 (asignado): leer_identificacion(P1) devuelve una fila');
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.auditoria where operacion = ''LECTURA_IDENTIFICACION'' and actor_id = %L and registro_id = %L',
    :PRO1, :P1::text
  )) = 1,
  'PRO1: su propia lectura de P1 también deja rastro');
call pg_temp.reset_sesion();

-- Guarda: registrar_evento_auditable('BUSQUEDA', …) sigue funcionando tras la redefinición
-- de §7.1(b) — el riesgo que el diseño nombra explícitamente (§4, riesgo 11).
call pg_temp.como(:PRO1);
select public.registrar_evento_auditable('BUSQUEDA', 'pacientes', :P1::text, null);
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.auditoria where operacion = ''BUSQUEDA'' and actor_id = %L and registro_id = %L',
    :PRO1, :P1::text
  )) = 1,
  'GUARDA: registrar_evento_auditable(''BUSQUEDA'', …) sigue funcionando después de redefinirse en T-032'
);
call pg_temp.reset_sesion();

\echo '08-identificacion: completa.'
