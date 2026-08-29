-- T-003 · Batería del candado (ADR-026). Nueve tablas, no ocho: `architecture.md`
-- §Candado enumera episodios_asistenciales, diagnosticos, valoraciones_riesgo,
-- notas_clinicas, notas_clinicas_versiones, evaluaciones, evaluacion_archivos e informes.
-- El catálogo dice que `episodio_participantes` TAMBIÉN pasa por
-- `historia_desbloqueada()`. Se anota como hallazgo de documentación, no de RLS.
--
-- Sin desbloqueo, cero, ya probado en 02-matriz-roles.sql. Aquí: con desbloqueo abre;
-- tras `bloquear_historia`, cierra; tras caducar la ventana, cierra también.

\echo ''
\echo '=== 03-candado ==='

-- --- Con desbloqueo: PRO1 ve su contenido bajo candado ---------------------------------
call pg_temp.como(:PRO1);
select public.desbloquear_historia('111111');

select pg_temp.assert(pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :EPI)) = 1,
  'PRO1 con desbloqueo SÍ ve el episodio');
select pg_temp.assert(pg_temp.contar(format('select * from public.diagnosticos where paciente_id = %L', :P1)) = 1,
  'PRO1 con desbloqueo SÍ ve el diagnóstico');
select pg_temp.assert(pg_temp.contar(format('select * from public.valoraciones_riesgo where paciente_id = %L', :P1)) = 1,
  'PRO1 con desbloqueo SÍ ve la valoración completa');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NCONJ)) = 1,
  'PRO1 (autor) con desbloqueo SÍ ve la nota conjunta');

-- Tras `bloquear_historia`, cierra en la MISMA sesión.
select public.bloquear_historia();
select pg_temp.assert(pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :EPI)) = 0,
  'Tras bloquear_historia(), el episodio deja de verse EN LA MISMA SESIÓN');
call pg_temp.reset_sesion();

-- --- Ventana caducada: se manipula la caducidad, no se espera 15 minutos -----------------
call pg_temp.como(:PRO1);
select public.desbloquear_historia('111111');
call pg_temp.reset_sesion();

-- `desbloqueos_historia_check` exige `caduca_en > concedido_en`, así que no se puede
-- fechar la caducidad en el pasado sin mover también la concesión. Se retrasan las dos,
-- manteniendo el intervalo, hasta dejar `caduca_en` detrás de `now()`.
update public.desbloqueos_historia
   set concedido_en = now() - interval '1 hour',
       caduca_en    = now() - interval '1 minute'
 where perfil_id = :PRO1 and revocado_en is null;

call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :EPI)) = 0,
  'Con la ventana caducada, cero, sin esperar los 15 minutos de verdad');
call pg_temp.reset_sesion();

-- --- ADR-030: la nota conjunta se lee desde LOS DOS lados, con desbloqueo -----------------
call pg_temp.como(:PRO2);
select public.desbloquear_historia('222222');
select pg_temp.assert(pg_temp.contar(format('select * from public.episodio_participantes where episodio_id = %L and paciente_id = %L', :EPI, :P2)) = 1,
  'PRO2 (no es el profesional del episodio) SÍ lee la participación de SU paciente P2, con desbloqueo (ADR-030)');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NCONJ)) = 1,
  'PRO2 SÍ lee la nota CONJUNTA (alcance conjunta) aunque el autor sea PRO1');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NIND)) = 0,
  'PRO2 NO lee la nota INDIVIDUAL del mismo episodio — es el control negativo del criterio 9 de T-002');
call pg_temp.reset_sesion();

-- --- alertas_documentacion: fuera del candado, siempre visible sin desbloqueo -----------
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.alertas_documentacion where profesional_id = %L', :PRO1)) > 0,
  'alertas_documentacion NO está bajo candado: se lee sin desbloquear');
call pg_temp.reset_sesion();

\echo '03-candado: completa.'
