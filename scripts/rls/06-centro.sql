-- T-003 · Batería del centro (ADR-033) y su enmienda del ADR-051 (multi-centro).
-- El técnico acotado; el profesional NO (probado ya en la enmienda de T-002, se repite
-- aquí con la fijación propia del banco); la herencia de retención resuelve, nunca nulo.

\echo ''
\echo '=== 06-centro ==='

-- --- El técnico está acotado a sus centros vigentes; el profesional, no --------------
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P2)) = 0,
  'TEC1 (solo centro A) no ve al paciente P2, que es de centro B');
call pg_temp.reset_sesion();

-- Se le añade a TEC1 el centro B (ADR-051): pasa a ver también los de B.
insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:TEC1, :CB, false);

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P2)) = 1,
  'Con la pertenencia a centro B añadida, TEC1 YA VE a P2 (centro B) EN LA MISMA SESIÓN');
call pg_temp.reset_sesion();

-- Cerrar la pertenencia de TEC1 a B lo saca de nuevo, en la misma sesión.
update public.perfiles_centros set hasta = current_date where perfil_id = :TEC1 and centro_id = :CB;

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P2)) = 0,
  'Cerrada la pertenencia a B, TEC1 deja de ver a P2 EN LA MISMA SESIÓN');
call pg_temp.reset_sesion();

-- --- Al PROFESIONAL, los centros NO le cambian ni una fila (demostrado ya en la enmienda
-- de T-002; aquí se repite con datos propios del banco, sin depender de aquel guion) -----
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P1)) = 1,
  'PRO1 ve a P1 con su único centro (principal CA)');
call pg_temp.reset_sesion();

insert into public.perfiles_centros (perfil_id, centro_id, principal) values (:PRO1, :CB, false);

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :P1)) = 1,
  'Añadido un segundo centro a PRO1, sigue viendo EXACTAMENTE lo mismo: el corte por centro es solo del técnico');
call pg_temp.reset_sesion();

-- --- Retención: herencia resuelve, nunca da nulo ---------------------------------------
select pg_temp.assert(
  (select anios_historia_clinica from public.retencion_efectiva(:CA)) is not null,
  'retencion_efectiva() para un centro SIN política propia nunca da nulo: hereda de organización o del predeterminado'
);
select pg_temp.assert(
  (select origen from public.retencion_efectiva(:CA)) in ('organizacion', 'predeterminado'),
  'Sin política propia de centro, el origen declarado es organización o predeterminado, nunca "centro"'
);

-- Con una política propia del centro A, el origen pasa a ser "centro" y el valor es el
-- suyo. Este insert es COMO POSTGRES a propósito: aquí se prueba retencion_efectiva()
-- —que es security definer y no pasa por RLS—, no la política de alta. Esa cobertura,
-- en sesión real de administrador, está en 12-resto-de-tablas.sql.
insert into public.politicas_retencion (centro_id, anios_historia_clinica, anios_minimo_legal, actualizado_por) values
  (:CA, 30, 5, :ADM);

select pg_temp.assert(
  (select anios_historia_clinica from public.retencion_efectiva(:CA)) = 30,
  'Con política propia del centro A, retencion_efectiva() devuelve SU valor (30), no el heredado'
);
select pg_temp.assert(
  (select origen from public.retencion_efectiva(:CA)) = 'centro',
  'El origen declarado ahora es "centro"'
);
select pg_temp.assert(
  (select anios_historia_clinica from public.retencion_efectiva(:CB)) is not null
  and (select origen from public.retencion_efectiva(:CB)) <> 'centro',
  'El centro B, SIN política propia, sigue resolviendo por herencia — la política de A no se le contagia'
);

\echo '06-centro: completa.'
