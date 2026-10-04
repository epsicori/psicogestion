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
-- técnico de SU centro sí ve la fila desde T-032/ADR-060 (el candado ya no es la RLS de
-- la tabla, es que no hay clave para descifrar sin pasar por leer_identificacion(), que
-- deja rastro). La aserción de este bloque cambia de signo respecto a la de T-002.
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
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_identificacion where paciente_id = %L', :P1)) = 1,
  'TEC1 (centro A) SÍ ve la fila de identificación de P1 (centro A) — ADR-060: la RLS ya no es el candado, lo es no tener la clave');
-- La negativa sobre P2 (otro centro) vive en 08-identificacion.sql: aquí P2 aún no tiene
-- fila y el 0 sería por no haber nada que ver (B3 de la revisión).
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- pacientes_salud_basica: alergias/medicación, sin cifrar, fuera del candado (ADR-061),
-- de solo adición y solo del profesional asignado, administrador incluido (ADR-063).
-- El técnico, en ningún centro (T-032 §1.4).
-- 01-fijacion.sql es territorio ajeno a T-032 (diseño §6): la fila de P1 se da de alta
-- aquí mismo, dentro de este bloque, como PRO1 (su profesional asignado, con permiso de
-- alta según pacientes_salud_basica_alta), para que el resto del bloque tenga algo que
-- distinguir de «cero por falta de fila».
call pg_temp.como(:PRO1);
insert into public.pacientes_salud_basica (paciente_id, alergias, medicacion_actual, registrado_por) values
  (:P1, 'Penicilina', 'Sertralina 50mg/día', :PRO1);

-- M1 de la revisión: registrado_por y registrado_en los fija fn_salud_basica_autoria(),
-- no el llamante. PRO1 registra un cambio de medicación intentando firmarlo como ADM y
-- fecharlo en 2020.
insert into public.pacientes_salud_basica (paciente_id, alergias, medicacion_actual, registrado_por, registrado_en) values
  (:P1, 'Penicilina', 'Sertralina 100mg/día', :ADM, '2020-01-01');
select pg_temp.assert(
  (select registrado_por = :PRO1::uuid and registrado_en > now() - interval '1 minute'
     from public.pacientes_salud_basica
    where paciente_id = :P1 and medicacion_actual = 'Sertralina 100mg/día'),
  'El cambio de PRO1 entra, pero firmado por PRO1 y fechado ahora: la autoría y la hora las pone el servidor, no el llamante'
);

-- ADR-063: el cambio es una fila nueva y la anterior sigue ahí. La gemela del «2»: la
-- versión de 50 mg existe todavía, con su texto intacto.
select pg_temp.assert(
  pg_temp.contar(format('select * from public.pacientes_salud_basica where paciente_id = %L', :P1)) = 2
  and exists (select 1 from public.pacientes_salud_basica
               where paciente_id = :P1 and medicacion_actual = 'Sertralina 50mg/día'),
  'Cambiar la medicación de P1 añade una fila: la de 50 mg sigue ahí, con su texto'
);
-- Y sobrescribir no se puede ni siendo el profesional asignado. 42501 del revoke (capa 1);
-- la capa 2 con el privilegio recuperado la recorre 10-solo-adicion.sql.
select pg_temp.assert_lanza_codigo(
  format('update public.pacientes_salud_basica set alergias = %L where paciente_id = %L', 'AINE', :P1),
  '42501',
  'PRO1 no puede sobrescribir la alergia de P1: la tabla es de solo adición (ADR-063)'
);
call pg_temp.reset_sesion();
-- 10-solo-adicion y cobertura_solo_adicion() solo recorren lo que está en el catálogo: sin
-- esta fila, quitar un disparador de la tabla no pondría nada en rojo.
select pg_temp.assert(
  exists (select 1 from public.tablas_solo_adicion where tabla = 'pacientes_salud_basica'),
  'pacientes_salud_basica está en tablas_solo_adicion: 10-solo-adicion la recorre (ADR-063)'
);

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_salud_basica where paciente_id = %L', :P1)) = 2,
  'PRO1 (asignado a P1) debe ver la salud básica de P1');
call pg_temp.reset_sesion();

-- ADM, sobre un paciente que no tiene asignado: cero (criterio 7, ADR-063). La gemela es
-- ADM sobre uno suyo, dado de alta por el camino real (alta_paciente, que asigna a quien
-- llama) y con alergias: esa sí la ve.
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_salud_basica where paciente_id = %L', :P1)) = 0,
  'ADM NO debe ver la salud básica de P1: no es su profesional asignado (ADR-063)');
select public.alta_paciente('Gema', 'Deadm', date '1980-05-05',
                            p_alergias => 'Látex') as padm \gset
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_salud_basica where paciente_id = %L', :'padm')) = 1,
  'ADM SÍ ve la salud básica de su propio paciente (gemela del cero sobre P1)');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes_salud_basica where paciente_id = %L', :P1)) = 0,
  'TEC1 NO debe ver salud básica de P1, aunque sea de su centro: no hay política de lectura para el técnico');
call pg_temp.reset_sesion();

call pg_temp.como(:TEC2);
select pg_temp.assert(pg_temp.contar('select * from public.pacientes_salud_basica') = 0,
  'TEC2 NO debe ver ninguna fila de salud básica: sin política de lectura para el técnico, sea cual sea el centro');
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

-- `como_con_2fa` y no `como`: desde el arreglo del hallazgo ALTA 2 de T-006a,
-- fijar_pin_historia() exige un segundo factor verificado hace menos de cinco minutos.
-- El desfase es distinto del de los demás por el único global sobre last_challenged_at.
call pg_temp.dar_segundo_factor(:ADM, interval '3 seconds');
call pg_temp.como_con_2fa(:ADM);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('999999')) is not true,
  'ADM sin PIN fijado: desbloquear_historia() no puede dar true (control antes de fijarlo)');
select public.fijar_pin_historia('999999');
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('999999')),
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
-- CUENTAS RELATIVAS A LA FIJACIÓN, no globales (T-008 cobra el hallazgo que T-003 dejó
-- anotado para él). Estas dos aserciones contaban `= 2` centros y `= 4` alertas sobre toda
-- la tabla, y eso valía mientras la fijación era la ÚNICA fuente de datos. Desde T-008,
-- `supabase/seed.sql` corre en cada `db reset` y siembra su propio centro: la cuenta global
-- pasó a 3 y el banco murió con «ASERCIÓN FALLIDA: El directorio de centros lo lee
-- cualquier rol autenticado» — verde o rojo por una razón que no era la que se estaba
-- probando.
--
-- Lo que este módulo quiere demostrar es que el rol LEE el directorio, no cuántas filas
-- tiene el directorio. Se acota a los centros de la fijación, que es lo único que este
-- banco controla, y así deja de depender de lo que siembre otro.
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.centros where id in (%L, %L)', :CA, :CB)) = 2,
  'El directorio de centros lo lee cualquier rol autenticado (los dos de la fijación)');
select pg_temp.assert(pg_temp.contar('select * from public.organizacion') = 1,
  'La organización la lee cualquier rol autenticado');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- alertas_documentacion: fuera del candado. Admin todo; profesional lo suyo (autor o
-- asignado); técnico su centro.
-- ---------------------------------------------------------------------------------------
-- Relativa a la fijación por el mismo motivo que los centros de arriba: `npm run seed`
-- (T-008) siembra alertas propias, y una cuenta global volvería a medir la siembra en vez
-- de la política.
call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.alertas_documentacion where centro_id in (%L, %L)', :CA, :CB)) = 4,
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
