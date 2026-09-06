-- T-003 · Batería de la baja (ADR-032). PROBAJA es de PBAJA. Se pone en baja y se
-- comprueba el cierre entero: pacientes, notas, y el gemelo de la revisión con Opus del
-- 29-08 (auditoría y accesos). La autoría sigue registrada aunque el acceso se corte.

\echo ''
\echo '=== 04-baja ==='

-- La nota y el acceso se insertan DENTRO DE LA SESIÓN DE PROBAJA, no como postgres: es a
-- fn_auditar() a quien le corresponde fijar actor_id, y para eso hace falta auth.uid() no
-- nulo (`set local request.jwt.claims`), así que su auditoría existe de verdad, no
-- adivinada.
call pg_temp.como(:PROBAJA);
select public.fijar_pin_historia('333333');
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('333333')),
  'El PIN de PROBAJA debe desbloquear la historia mientras sigue activo');

insert into public.notas_clinicas (id, paciente_id, autor_id) values
  ('f0030001-0000-4000-8000-000000000004', :PBAJA, :PROBAJA);
-- T-005: numero_version/huella/huella_anterior ya no se pueden mandar a mano; los calcula
-- fn_sellar_version_nota(). Se inserta bajo la sesión de PROBAJA (arriba) para que la
-- política notas_clinicas_versiones_alta se ejerza de verdad.
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  ('f0030001-0000-4000-8000-000000000004', '{"t":"baja"}',
   pg_temp.sobre_prueba(:PROBAJA, timestamptz '2026-08-29 09:22:00+00', '{"t":"baja"}'::jsonb),
   :PROBAJA, timestamptz '2026-08-29 09:22:00+00');
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana) values
  (:PROBAJA, :PBAJA, 'apertura', 'notas_clinicas');

-- Gemela positiva: ACTIVO, ve lo suyo.
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :PBAJA)) = 1,
  'ACTIVO: PROBAJA ve su paciente PBAJA');
select pg_temp.assert(pg_temp.contar('select * from public.auditoria') > 0,
  'ACTIVO: PROBAJA ve su propia auditoría');
select pg_temp.assert(pg_temp.contar('select * from public.accesos_historia') > 0,
  'ACTIVO: PROBAJA ve su propio registro de accesos');
call pg_temp.reset_sesion();

-- Se le da de baja.
update public.perfiles set estado = 'baja', estado_desde = now() where id = :PROBAJA;

call pg_temp.como(:PROBAJA);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :PBAJA)) = 0,
  'DE BAJA: PROBAJA no lee ni su propio paciente');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where paciente_id = %L', :PBAJA)) = 0,
  'DE BAJA: PROBAJA no lee ni sus propias notas, ni con PIN vigente');
select pg_temp.assert(pg_temp.contar('select * from public.auditoria') = 0,
  'DE BAJA: PROBAJA no lee su auditoría — cierre de la revisión del 29-08');
select pg_temp.assert(pg_temp.contar('select * from public.accesos_historia') = 0,
  'DE BAJA: PROBAJA no lee su registro de accesos — cierre de la revisión del 29-08');
call pg_temp.reset_sesion();

-- Su autoría SIGUE registrada en la versión (columna, no política), pero **nadie la lee
-- «porque es administrador»**: el secreto profesional es del profesional, no del cargo
-- (architecture.md §Roles). El único camino sin acceso de emergencia —fuera de este
-- ticket— es que el administrador REASIGNE el paciente; entonces el nuevo profesional
-- asignado, con desbloqueo, ve la versión y en ella el autor_id de quien ya no puede
-- entrar.
call pg_temp.como(:ADM);
update public.pacientes set profesional_id = :PRO1 where id = :PBAJA;
call pg_temp.reset_sesion();

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 debe desbloquear la historia');
select pg_temp.assert(pg_temp.contar(format(
    'select * from public.notas_clinicas_versiones where nota_id = %L and autor_id = %L',
    'f0030001-0000-4000-8000-000000000004', :PROBAJA)) = 1,
  'Reasignado el paciente, PRO1 lee la versión y en ella la autoría de PROBAJA, que sigue registrada');
call pg_temp.reset_sesion();

\echo '04-baja: completa.'
