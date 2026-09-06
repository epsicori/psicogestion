-- T-003 · Cobertura real de las tablas que 02-10 no ejercían bajo ningún rol (hallazgo de
-- la revisión con Opus del 29-08: 11-cobertura.sql las daba por "cubiertas" solo porque su
-- nombre estaba en el array, sin que ninguna aserción las hubiera tocado). Este módulo
-- cierra: evaluaciones, evaluacion_archivos, informes, consentimiento_firmantes,
-- preferencias_usuario, perfiles, perfiles_centros y politicas_retencion — todas bajo
-- `pg_temp.como(...)`, nunca como postgres.

\echo ''
\echo '=== 12-resto-de-tablas ==='

\set EVAL   '\'ea030001-0000-4000-8000-000000000001\''
\set EVARCH '\'eb030001-0000-4000-8000-000000000001\''
\set INF    '\'ec030001-0000-4000-8000-000000000001\''

-- ---------------------------------------------------------------------------------------
-- evaluaciones, evaluacion_archivos, informes: BAJO EL CANDADO
-- (historia_desbloqueada() AND es_profesional_asignado()), igual que diagnosticos. El
-- INSERT en sesión real ejerce la política `_alta`, no solo `_lectura`.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 debe desbloquear la historia');

insert into public.evaluaciones (id, paciente_id, episodio_id, instrumento, aplicado_por) values
  (:EVAL, :P1, :EPI, 'BDI-II', :PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.evaluaciones where id = %L', :EVAL)) = 1,
  'PRO1 (asignado, con desbloqueo) da de alta Y lee su propia evaluación: evaluaciones_alta y _lectura');

insert into public.evaluacion_archivos (id, evaluacion_id, ruta, nombre_original, mime, tamano_bytes, subido_por) values
  (:EVARCH, :EVAL, 'evaluaciones/g0030001/protocolo.pdf', 'protocolo.pdf', 'application/pdf', 1024, :PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.evaluacion_archivos where id = %L', :EVARCH)) = 1,
  'PRO1 da de alta Y lee el archivo de su propia evaluación: evaluacion_archivos_alta y _lectura');

insert into public.informes (id, paciente_id, episodio_id, tipo, autor_id) values
  (:INF, :P1, :EPI, 'seguimiento', :PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.informes where id = %L', :INF)) = 1,
  'PRO1 (autor y asignado, con desbloqueo) da de alta Y lee su propio informe: informes_alta y _lectura');

-- evaluaciones_modificacion / informes_modificacion: la gemela positiva, en la misma
-- sesión que las dio de alta.
update public.evaluaciones set interpretacion = 'Actualizada por PRO1' where id = :EVAL;
select pg_temp.assert(
  (select interpretacion from public.evaluaciones where id = :EVAL) = 'Actualizada por PRO1',
  'PRO1 (asignado, con desbloqueo) SÍ modifica su propia evaluación: evaluaciones_modificacion');
update public.informes set destinatario = 'Actualizado por PRO1' where id = :INF;
select pg_temp.assert(
  (select destinatario from public.informes where id = :INF) = 'Actualizado por PRO1',
  'PRO1 (autor, con desbloqueo) SÍ modifica su propio informe: informes_modificacion');
call pg_temp.reset_sesion();

-- Gemela negativa, las tres: PRO2 no es autor ni asignado de P1 — sin desbloqueo siquiera
-- hace falta, el corte por asignación ya las saca (y PRO2 no tiene PIN fijado sobre P1).
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.evaluaciones where id = %L', :EVAL)) = 0,
  'PRO2 (no asignado a P1) NO lee la evaluación de PRO1');
select pg_temp.assert(pg_temp.contar(format('select * from public.evaluacion_archivos where id = %L', :EVARCH)) = 0,
  'PRO2 NO lee el archivo de evaluación de PRO1');
select pg_temp.assert(pg_temp.contar(format('select * from public.informes where id = %L', :INF)) = 0,
  'PRO2 NO lee el informe de PRO1');
-- UPDATE bajo RLS pura no lanza, solo no afecta filas — y PRO2 tampoco puede LEER estas
-- filas para comprobarlo desde su propia sesión. Se intenta aquí y se comprueba después
-- de `reset_sesion()`, sin rol (como postgres, que sí ve el valor real).
update public.evaluaciones set interpretacion = 'Hackeada por PRO2' where id = :EVAL;
update public.informes set destinatario = 'Hackeado por PRO2' where id = :INF;
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select interpretacion from public.evaluaciones where id = :EVAL) = 'Actualizada por PRO1',
  'PRO2 NO modificó la evaluación de PRO1: el UPDATE bajo RLS no afectó ninguna fila (comprobado sin RLS)');
select pg_temp.assert(
  (select destinatario from public.informes where id = :INF) = 'Actualizado por PRO1',
  'PRO2 NO modificó el informe de PRO1: el UPDATE bajo RLS no afectó ninguna fila (comprobado sin RLS)');

-- Aísla las DOS ramas del OR de informes_lectura (autor_id = uid() OR
-- es_profesional_asignado(paciente_id)): hasta aquí PRO1 era autor Y asignado a la vez,
-- así que ninguna aserción anterior distinguía cuál de las dos ramas concedía el acceso
-- (hallazgo de la reverificación con Opus del 29-08). Reasignar P1 a PRO2 las separa
-- sobre la MISMA fila de informe.
call pg_temp.como(:ADM);
update public.pacientes set profesional_id = :PRO2 where id = :P1;
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.informes where id = %L', :INF)) = 1,
  'PRO1 (autor, YA NO asignado tras la reasignación) SIGUE leyendo su informe: aísla la rama "autor_id"');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')),
  'El PIN de PRO2 debe desbloquear la historia');
select pg_temp.assert(pg_temp.contar(format('select * from public.informes where id = %L', :INF)) = 1,
  'PRO2 (asignado tras la reasignación, NO autor) TAMBIÉN lee el informe: aísla la rama "es_profesional_asignado"');
call pg_temp.reset_sesion();

-- Se revierte la reasignación: nada debe depender de que P1 siga siendo de PRO2 más
-- allá de esta prueba puntual.
call pg_temp.como(:ADM);
update public.pacientes set profesional_id = :PRO1 where id = :P1;
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- consentimiento_firmantes: administrador O profesional asignado al paciente del
-- consentimiento. El consentimiento fijado en 01-fijacion.sql es el de PMENOR, de PRO1.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
insert into public.consentimiento_firmantes (consentimiento_id, nombre_completo, representante_id)
values ('a0030001-0000-4000-8000-000000000001', 'Dora Representante', :REPMENOR);
select pg_temp.assert(pg_temp.contar(
    'select * from public.consentimiento_firmantes where consentimiento_id = ''a0030001-0000-4000-8000-000000000001''') = 1,
  'PRO1 (profesional asignado al paciente del consentimiento) da de alta Y lee el firmante');
-- consentimiento_firmantes_modificacion: gemela positiva del profesional asignado.
update public.consentimiento_firmantes set firmado_en = now()
 where consentimiento_id = 'a0030001-0000-4000-8000-000000000001' and nombre_completo = 'Dora Representante';
select pg_temp.assert(
  (select firmado_en is not null from public.consentimiento_firmantes
    where consentimiento_id = 'a0030001-0000-4000-8000-000000000001' and nombre_completo = 'Dora Representante'),
  'PRO1 (asignado) SÍ modifica el firmante: consentimiento_firmantes_modificacion');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(
    'select * from public.consentimiento_firmantes where consentimiento_id = ''a0030001-0000-4000-8000-000000000001''') = 0,
  'PRO2 (no asignado al menor) NO lee su firmante');
-- Mismo motivo que en evaluaciones/informes: el UPDATE bajo RLS no lanza y PRO2 tampoco
-- puede leer la fila para comprobarlo desde su sesión.
update public.consentimiento_firmantes set nombre_completo = 'Hackeada por PRO2'
 where consentimiento_id = 'a0030001-0000-4000-8000-000000000001';
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select count(*) from public.consentimiento_firmantes
    where consentimiento_id = 'a0030001-0000-4000-8000-000000000001' and nombre_completo = 'Dora Representante') = 1,
  'PRO2 NO modificó el firmante: el UPDATE bajo RLS no afectó ninguna fila (comprobado sin RLS)');

-- Aísla la rama de ADMINISTRADOR del OR (admin OR es_profesional_asignado): hasta aquí
-- solo se había probado la rama de asignación. ADM no es el profesional de PMENOR.
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(
    'select * from public.consentimiento_firmantes where consentimiento_id = ''a0030001-0000-4000-8000-000000000001''') = 1,
  'ADM (rama administrador, NO asignado al menor) SÍ lee el firmante: aísla la rama "administrador" del OR');
insert into public.consentimiento_firmantes (id, consentimiento_id, nombre_completo, paciente_id) values
  ('c0030004-0000-4000-8000-000000000001', 'a0030001-0000-4000-8000-000000000001', 'Firmante añadido por ADM', :PMENOR);
select pg_temp.assert(pg_temp.contar('select * from public.consentimiento_firmantes where id = ''c0030004-0000-4000-8000-000000000001''') = 1,
  'ADM también da de alta un firmante por la rama administrador: consentimiento_firmantes_alta');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- preferencias_usuario: solo la fila propia, alta y lectura, dentro de la sesión (no como
-- postgres): así se ejerce el WITH CHECK perfil_id = auth.uid(), no solo el USING.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
insert into public.preferencias_usuario (perfil_id) values (:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.preferencias_usuario where perfil_id = %L', :PRO1)) = 1,
  'PRO1 da de alta Y lee su propia preferencia');
-- preferencias_usuario_modificacion_propia: gemela positiva.
update public.preferencias_usuario set densidad_listas = 'compacta' where perfil_id = :PRO1;
select pg_temp.assert(
  (select densidad_listas from public.preferencias_usuario where perfil_id = :PRO1) = 'compacta',
  'PRO1 SÍ modifica su propia preferencia: preferencias_usuario_modificacion_propia');
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.preferencias_usuario where perfil_id = %L', :PRO1)) = 0,
  'PRO2 NO lee la preferencia de PRO1');
-- El perfil_id es la CLAVE PRIMARIA: usar el de PRO1 (que ya tiene fila) probaría el
-- 23505 de la clave duplicada, no el 42501 del WITH CHECK — un hallazgo real de la
-- reverificación con Opus del 29-08. Se usa TEC2 (sin fila propia todavía) y se exige el
-- código exacto del rechazo por política.
select pg_temp.assert_lanza_codigo(
  format('insert into public.preferencias_usuario (perfil_id) values (%L)', :TEC2),
  '42501',
  'PRO2 NO puede dar de alta una preferencia CON EL perfil_id de OTRO (TEC2, sin fila previa): el WITH CHECK debe rechazarlo, no una clave duplicada'
);
-- Mismo motivo que en evaluaciones/informes/firmantes: PRO2 no puede leer la fila de
-- PRO1 para comprobar el UPDATE desde su propia sesión.
update public.preferencias_usuario set densidad_listas = 'comoda' where perfil_id = :PRO1;
call pg_temp.reset_sesion();

select pg_temp.assert(
  (select densidad_listas from public.preferencias_usuario where perfil_id = :PRO1) = 'compacta',
  'PRO2 NO modificó la preferencia de PRO1: el UPDATE bajo RLS no afectó ninguna fila (comprobado sin RLS)');

-- ---------------------------------------------------------------------------------------
-- perfiles: cada uno lee SOLO su propia fila (perfiles_lectura_propia), sin excepción de
-- rol — ni el administrador tiene una fila ajena.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.perfiles where id = %L', :PRO1)) = 1,
  'PRO1 lee su propia fila de perfiles');
select pg_temp.assert(pg_temp.contar(format('select * from public.perfiles where id = %L', :PRO2)) = 0,
  'PRO1 NO lee la fila de perfiles de PRO2');
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.contar(format('select * from public.perfiles where id = %L', :PRO1)) = 0,
  'ADM tampoco lee la fila de perfiles de PRO1: perfiles_lectura_propia no tiene rama de administrador');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- perfiles_centros: alta y cierre son SOLO del administrador; la lectura es de cualquier
-- autenticado (política deliberadamente abierta, `rol_actual() is not null`).
-- ---------------------------------------------------------------------------------------
-- Código exacto (42501), no "lanzó algo": (perfil_id, centro_id) no tiene índice único
-- por sí solo (solo la vigente, `where hasta is null`), pero un ticket futuro podría
-- añadir una restricción que confundiría un `assert_lanza` a secas con un 23505, igual
-- que pasó con preferencias_usuario más arriba (hallazgo de la reverificación del 29-08).
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('insert into public.perfiles_centros (perfil_id, centro_id, principal) values (%L, %L, false)', :TEC2, :CA),
  '42501',
  'PRO1 (no administrador) NO puede dar de alta una pertenencia a centro ajena'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
insert into public.perfiles_centros (id, perfil_id, centro_id, principal) values
  ('c0030002-0000-4000-8000-000000000001', :TEC2, :CA, false);
select pg_temp.assert(pg_temp.contar('select * from public.perfiles_centros where id = ''c0030002-0000-4000-8000-000000000001''') = 1,
  'ADM da de alta la pertenencia de TEC2 a centro A: perfiles_centros_alta_administrador');
update public.perfiles_centros set hasta = current_date where id = 'c0030002-0000-4000-8000-000000000001';
select pg_temp.assert(
  (select hasta from public.perfiles_centros where id = 'c0030002-0000-4000-8000-000000000001') = current_date,
  'ADM cierra la pertenencia: perfiles_centros_cierre_administrador');
call pg_temp.reset_sesion();

-- `update ... using (rol_actual() = 'administrador')` bajo RLS no LANZA cuando la fila no
-- pasa el filtro: simplemente no afecta ninguna fila. `assert_lanza` no sirve aquí — hace
-- falta comprobar que el valor sigue como estaba.
call pg_temp.como(:PRO1);
update public.perfiles_centros set principal = true where id = 'c0030002-0000-4000-8000-000000000001';
select pg_temp.assert(
  (select principal from public.perfiles_centros where id = 'c0030002-0000-4000-8000-000000000001') = false,
  'PRO1 (no administrador) NO puede modificar la pertenencia ajena: el UPDATE bajo RLS no afectó ninguna fila'
);
select pg_temp.assert(pg_temp.contar('select * from public.perfiles_centros where id = ''c0030002-0000-4000-8000-000000000001''') = 1,
  'La lectura de perfiles_centros SÍ es abierta a cualquier autenticado: PRO1 ve la fila aunque no pueda tocarla');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- politicas_retencion: alta y modificación SOLO del administrador, EN SESIÓN REAL (la de
-- 06-centro.sql corría como postgres y no ejercía RLS en absoluto — mismo hallazgo).
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format('insert into public.politicas_retencion (centro_id, actualizado_por) values (%L, %L)', :CB, :PRO1),
  '42501',
  'PRO1 (no administrador) NO puede dar de alta una política de retención'
);
call pg_temp.reset_sesion();

call pg_temp.como(:ADM);
insert into public.politicas_retencion (id, centro_id, anios_historia_clinica, anios_minimo_legal, actualizado_por) values
  ('c0030003-0000-4000-8000-000000000001', :CB, 20, 5, :ADM);
select pg_temp.assert(pg_temp.contar('select * from public.politicas_retencion where centro_id = ' || quote_literal(:CB)) = 1,
  'ADM da de alta la política de centro B EN SESIÓN: politicas_retencion_alta_administrador');
update public.politicas_retencion set anios_historia_clinica = 22 where id = 'c0030003-0000-4000-8000-000000000001';
select pg_temp.assert(
  (select anios_historia_clinica from public.politicas_retencion where id = 'c0030003-0000-4000-8000-000000000001') = 22,
  'ADM modifica la política de centro B: politicas_retencion_modificacion_administrador');
call pg_temp.reset_sesion();

-- Mismo motivo que arriba: el UPDATE bajo RLS no lanza, no afecta filas.
call pg_temp.como(:PRO1);
update public.politicas_retencion set anios_historia_clinica = 99 where id = 'c0030003-0000-4000-8000-000000000001';
select pg_temp.assert(
  (select anios_historia_clinica from public.politicas_retencion where id = 'c0030003-0000-4000-8000-000000000001') = 22,
  'PRO1 (no administrador) NO puede modificar la política de retención: el UPDATE bajo RLS no afectó ninguna fila'
);
select pg_temp.assert(pg_temp.contar('select * from public.politicas_retencion') > 0,
  'La lectura de politicas_retencion SÍ es abierta a cualquier autenticado');
call pg_temp.reset_sesion();

-- ---------------------------------------------------------------------------------------
-- tablas_solo_adicion: catálogo de solo lectura, abierto a cualquier autenticado.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar('select * from public.tablas_solo_adicion') = 4,
  'TEC1 lee el catálogo de las cuatro tablas de solo adición: tablas_solo_adicion_lectura');
call pg_temp.reset_sesion();

\echo '12-resto-de-tablas: completa.'
