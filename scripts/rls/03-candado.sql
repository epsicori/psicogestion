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
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')), 'El PIN de PRO1 debe desbloquear la historia (primer intento)');

select pg_temp.assert(pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :EPI)) = 1,
  'PRO1 con desbloqueo SÍ ve el episodio');
select pg_temp.assert(pg_temp.contar(format('select * from public.diagnosticos where paciente_id = %L', :P1)) = 1,
  'PRO1 con desbloqueo SÍ ve el diagnóstico');
select pg_temp.assert(pg_temp.contar(format('select * from public.valoraciones_riesgo where paciente_id = %L', :P1)) = 1,
  'PRO1 con desbloqueo SÍ ve la valoración completa');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NCONJ)) = 1,
  'PRO1 (autor) con desbloqueo SÍ ve la nota conjunta');
select pg_temp.assert(pg_temp.contar(format('select * from public.notas_clinicas where id = %L', :NIND)) = 1,
  'PRO1 (autor y profesional del episodio) con desbloqueo SÍ ve la nota INDIVIDUAL — la gemela positiva de PRO2 no la lee, más abajo');

-- Tras `bloquear_historia`, cierra en la MISMA sesión.
select public.bloquear_historia();
select pg_temp.assert(pg_temp.contar(format('select * from public.episodios_asistenciales where id = %L', :EPI)) = 0,
  'Tras bloquear_historia(), el episodio deja de verse EN LA MISMA SESIÓN');
call pg_temp.reset_sesion();

-- --- Ventana caducada: se manipula la caducidad, no se espera 15 minutos -----------------
call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'El PIN de PRO1 debe desbloquear de nuevo, tras el bloqueo de más arriba');
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
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('222222')),
  'El PIN de PRO2 debe desbloquear la historia');
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

-- --- T-006 criterio 4 · cinco PIN erróneos bloquean quince minutos ----------------------
-- Esto no se probaba, y es lo ÚNICO que hace seguro un PIN de seis dígitos: sin bloqueo,
-- un millón de combinaciones se agotan por fuerza bruta. La función existe desde T-002
-- (20260822160000, paso 4); lo que faltaba era la prueba.
--
-- Se gasta el PIN de PRO1 a propósito y se le devuelve el contador al final, porque los
-- módulos siguientes (13-cuentas, 14-cadena-huellas) vuelven a desbloquear con él.
call pg_temp.como(:PRO1);

select pg_temp.assert((select motivo from public.desbloquear_historia('000001')) = 'pin_incorrecto',
  'T-006: intento 1/5 con PIN erróneo: pin_incorrecto, todavía no bloquea');
select pg_temp.assert((select motivo from public.desbloquear_historia('000002')) = 'pin_incorrecto',
  'T-006: intento 2/5: pin_incorrecto');
select pg_temp.assert((select motivo from public.desbloquear_historia('000003')) = 'pin_incorrecto',
  'T-006: intento 3/5: pin_incorrecto');
select pg_temp.assert((select motivo from public.desbloquear_historia('000004')) = 'pin_incorrecto',
  'T-006: intento 4/5: pin_incorrecto');
select pg_temp.assert((select motivo from public.desbloquear_historia('000005')) = 'bloqueado',
  'T-006: el QUINTO fallo bloquea (motivo = bloqueado)');

-- El sexto, con el PIN BUENO, también falla: el bloqueo se responde antes de comparar.
select pg_temp.assert(not (select desbloqueado from public.desbloquear_historia('111111')),
  'T-006: el SEXTO intento, con el PIN CORRECTO, tampoco abre mientras el bloqueo esté vigente');

-- Quince minutos, no otra cosa, y sin esperarlos de verdad.
select pg_temp.assert(
  (select bloqueado_hasta from public.desbloquear_historia('111111')) between now() + interval '14 minutes' and now() + interval '15 minutes',
  'T-006: el bloqueo dura quince minutos');
call pg_temp.reset_sesion();

-- Deja constancia en auditoría con su propio verbo. La forma la fija
-- 20260829150000_auditoria_y_solo_adicion.sql (líneas 171-172): cada fallo se registra
-- como PIN_FALLIDO y el bloqueo deja de disfrazarse de UPDATE para decirse PIN_BLOQUEADO.
-- **Nunca el hash ni el PIN en el jsonb.**
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.auditoria where actor_id = %L and tabla = 'pines_historia'
       and operacion = 'PIN_FALLIDO'$c$, :PRO1)) = 5,
  'T-006: los cinco fallos dejan cinco entradas PIN_FALLIDO en auditoria');
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.auditoria where actor_id = %L and tabla = 'pines_historia'
       and operacion = 'PIN_BLOQUEADO'$c$, :PRO1)) = 1,
  'T-006: el bloqueo deja UNA entrada PIN_BLOQUEADO, no cinco');
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.auditoria where actor_id = %L and tabla = 'pines_historia'
       and operacion = 'PIN_BLOQUEADO' and estado_posterior->>'bloqueado_hasta' is not null$c$, :PRO1)) = 1,
  'T-006: la entrada del bloqueo dice hasta cuándo dura');

-- Gemela negativa: ni el PIN ni su hash entran en el jsonb. Se comprueba el PIN real
-- ('111111') y la clave `hash`, no los PIN inventados de los cinco intentos: una cadena
-- de ceros casa por accidente con los UUID de prueba (`...000000000002`) y daría un rojo
-- que no es un fallo de seguridad.
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.auditoria where actor_id = %L and tabla = 'pines_historia'
       and (estado_posterior::text like '%%111111%%' or estado_posterior ? 'hash')$c$, :PRO1)) = 0,
  'T-006: ninguna entrada de auditoría contiene el PIN ni su hash');

-- Devolver el contador: el bloqueo es de esta prueba, no del banco.
update public.pines_historia
   set intentos_fallidos = 0, bloqueado_hasta = null
 where perfil_id = :PRO1;

call pg_temp.como(:PRO1);
select pg_temp.assert((select desbloqueado from public.desbloquear_historia('111111')),
  'T-006: levantado el bloqueo, el PIN de PRO1 vuelve a abrir — el estado queda como estaba');
select public.bloquear_historia();
call pg_temp.reset_sesion();

\echo '03-candado: completa.'
