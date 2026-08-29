-- T-003 · Matriz tabla × rol. Un bloque explícito por tabla, no un bucle genérico: así el
-- documento «cómo se añade una prueba» es literalmente «copia el bloque de al lado».
--
-- Convención: cada bloque hace ADM, PRO1 (o PRO2 cuando corresponde) y TEC1, con su
-- gemela positiva y negativa sobre la MISMA fila cuando aplica.

\echo ''
\echo '=== 02-matriz-roles ==='

-- ---------------------------------------------------------------------------------------
-- pacientes: administrador todos; profesional los suyos; técnico solo su centro.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar('select * from public.pacientes where fusionado_en is null') >= 4,
  'ADM debe ver los pacientes activos (no fusionados)');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P1)) = 1,
  'PRO1 debe ver su paciente P1');
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P2)) = 0,
  'PRO1 NO debe ver el paciente P2 de PRO2');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P1)) = 1,
  'TEC1 (centro A) debe ver P1 (centro A)');
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P2)) = 0,
  'TEC1 (centro A) NO debe ver P2 (centro B)');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC2);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P2)) = 1,
  'TEC2 (centro B) debe ver P2 (centro B)');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- pacientes_identificacion: DNI cifrado. Total para admin y el profesional dueño; el
-- técnico SIN ACCESO (matriz de architecture.md §Roles).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :P1)) = 1,
  'ADM debe ver la identificación de P1');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :P1)) = 1,
  'PRO1 (dueño de P1) debe ver su identificación');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :P1)) = 0,
  'TEC1 NO debe ver identificación: sin acceso, aunque P1 sea de su centro');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- diagnosticos: BAJO EL CANDADO (historia_desbloqueada() AND es_profesional_asignado()).
-- La política NO tiene rama de administrador: sin desbloqueo, cero para TODOS, ADM
-- incluido — «ser administrador no da acceso a notas ajenas», architecture.md §RLS. La
-- batería con desbloqueo abierto va en 03-candado.sql; aquí solo el corte SIN desbloqueo.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.diagnosticos where paciente_id = %L', :P1)) = 0,
  'PRO1 sin desbloqueo NO ve el diagnóstico de su propio paciente: está bajo candado');
call pg_temp.reset_sesion();

-- Sin desbloqueo, esto NO distingue «no hay rama de administrador» de «el candado está
-- cerrado» — la versión que sí distingue, con ADM desbloqueado, está más abajo, junto a
-- la de notas_clinicas.
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar('select * from public.diagnosticos') = 0,
  'ADM SIN desbloqueo: cero (ambiguo todavía — ver la aserción con desbloqueo, más abajo)');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar('select * from public.diagnosticos') = 0,
  'TEC1 NO debe ver ningún diagnóstico: sin acceso, sea cual sea el centro');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- valoraciones_riesgo: BAJO EL CANDADO para admin/profesional (contenido completo); el
-- técnico SOLO EL INDICADOR BINARIO, y por la VISTA —que no pasa por el candado, porque
-- «nivel», «descripcion» y «plan_seguridad» no están en su texto—. La positiva con
-- desbloqueo abierto va en 03-candado.sql.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.valoraciones_riesgo where paciente_id = %L', :P1)) = 0,
  'PRO1 sin desbloqueo NO ve la valoración de riesgo completa: está bajo candado');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar('select * from public.valoraciones_riesgo') = 0,
  'TEC1 NO debe leer la tabla de valoraciones directamente');
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_indicador_riesgo where paciente_id = %L', :P1)) = 1,
  'TEC1 SÍ debe ver el indicador binario por la vista, para su centro');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC2);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_indicador_riesgo where paciente_id = %L', :P1)) = 0,
  'TEC2 (centro B) NO debe ver el indicador de P1, que es de centro A');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- notas_clinicas y notas_clinicas_versiones: bajo el candado (batería completa en
-- 03-candado.sql). Aquí solo el corte por autoría/asignación, SIN desbloqueo abierto —
-- así que todo debe dar cero salvo lo que la política resuelva antes del candado.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NCONJ)) = 0,
  'PRO2 no es autor ni asignado de NCONJ: cero, incluso antes de mirar el candado');
call pg_temp.reset_sesion();

-- El administrador NO tiene rama propia en notas_clinicas_lectura: «ser administrador no
-- da acceso a notas ajenas» (architecture.md §RLS, en negrita). PRIMERO, sin desbloqueo:
-- cero, pero esto NO distingue «no hay rama de administrador» de «el candado está
-- cerrado» — cualquiera de las dos causas daría el mismo cero. `fijar_pin_historia` NO
-- tiene guarda de rol (verificado en la migración: solo exige `auth.uid()` no nulo), así
-- que ADM SÍ puede fijar su propio PIN y desbloquear su propia historia. Se hace, y se
-- repite el conteo CON el candado abierto: si sigue en cero, la causa real es
-- `es_profesional_asignado()`, no el candado — que es la aserción que de verdad haría
-- falta cuando algún ticket futuro le dé a ADM un paciente propio.
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar('select * from public.notas_clinicas') = 0,
  'ADM SIN desbloqueo: cero (podría ser por el candado o por falta de rama — ambiguo todavía)');
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('999999')) is not true,
  'ADM sin PIN fijado: desbloquear_historia() no puede dar true (control antes de fijarlo)');
select public.fijar_pin_historia('999999');
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('999999')),
  'ADM SÍ puede fijar y usar su propio PIN: fijar_pin_historia no tiene guarda de rol');
select pg_temp.assert(pg_temp.contar('select * from public.notas_clinicas') = 0,
  'ADM CON el candado abierto SIGUE en cero: la causa es notas_clinicas_lectura sin rama de administrador, no el candado');
select pg_temp.assert(pg_temp.contar('select * from public.notas_clinicas_versiones') = 0,
  'ADM con desbloqueo tampoco lee ninguna versión de nota clínica');
select pg_temp.assert(pg_temp.contar('select * from public.episodios_asistenciales') = 0,
  'ADM con desbloqueo tampoco lee ningún episodio asistencial');
select pg_temp.assert(pg_temp.contar('select * from public.valoraciones_riesgo') = 0,
  'ADM con desbloqueo tampoco lee ninguna valoración de riesgo completa (sí el indicador binario, por la vista, que no es de este bloque)');
select pg_temp.assert(pg_temp.contar('select * from public.diagnosticos') = 0,
  'ADM con desbloqueo tampoco lee ningún diagnóstico — confirma, con el candado abierto, la ambigüedad que quedó pendiente más arriba');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- episodios_asistenciales, episodio_participantes: BAJO EL CANDADO. Las positivas con
-- desbloqueo abierto —incluida la nota conjunta del ADR-030, PRO2 leyendo la
-- participación de SU paciente en el episodio de PRO1— van en 03-candado.sql.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :EPI)) = 0,
  'PRO1 sin desbloqueo NO ve el episodio, aunque sea su profesional: está bajo candado');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EPI, :P2)) = 0,
  'PRO2 sin desbloqueo NO lee la participación, ni siquiera de su propio paciente P2');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- representantes_paciente: quien puede leer al paciente, lee a su representante.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.representantes_paciente where paciente_id = %L', :PMENOR)) = 1,
  'PRO1 (profesional del menor) lee a su representante');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.representantes_paciente where paciente_id = %L', :PMENOR)) = 0,
  'PRO2 (no es su profesional) NO lee al representante del menor');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- consentimientos: dentro de la ficha del paciente (ADR-048, fuera del candado clínico).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.consentimientos where paciente_id = %L', :PMENOR)) = 1,
  'PRO1 ve el consentimiento del menor que atiende');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.consentimientos where paciente_id = %L', :PMENOR)) = 0,
  'PRO2 NO ve el consentimiento de un paciente que no es suyo');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- centros, organizacion, politicas_retencion: directorio, los tres roles leen.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar('select * from public.centros') = 2,
  'El directorio de centros lo lee cualquier rol autenticado');
select pg_temp.assert(pg_temp.contar('select * from public.organizacion') = 1,
  'La organización la lee cualquier rol autenticado');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- alertas_documentacion: fuera del candado. Admin todo; profesional lo suyo (autor o
-- asignado); técnico su centro.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar('select * from public.alertas_documentacion') = 4,
  'ADM ve las cuatro alertas fijadas');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.alertas_documentacion where profesional_id = %L', :PRO2)) = 0,
  'PRO1 NO ve las alertas de PRO2');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar('select * from public.alertas_documentacion where centro_id = ' || quote_literal(:CB)) = 0,
  'TEC1 (centro A) no ve alertas de centro B');
call pg_temp.reset_sesion();

\echo '02-matriz-roles: completa.'
