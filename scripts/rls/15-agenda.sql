-- T-010 · Dominio Agenda: esquema, restricción de exclusión, auditoría y políticas.
--
-- Va en scripts/rls/ y no en un `scripts/t010-agenda.sql` suelto, aunque el ticket lo
-- nombrara así: el ticket se redactó ANTES de que T-003 creara el banco, y su README dice
-- que un módulo nuevo se añade AL FINAL con el siguiente número. Un guion suelto no lo
-- corre nadie en CI.
--
-- Se añade después de 14-cadena-huellas, que manipula filas con los cerrojos levantados.
-- Este módulo no levanta ninguno: crea sus propias citas y las deja dentro del
-- `begin … rollback` del banco.

\echo ''
\echo '=== 15-agenda ==='

\set TT1   '\'a0100001-0000-4000-8000-000000000001\''
\set CITA1 '\'a0100002-0000-4000-8000-000000000001\''
\set CITA2 '\'a0100002-0000-4000-8000-000000000002\''
\set CITA3 '\'a0100002-0000-4000-8000-000000000003\''
\set CITAX '\'a0100002-0000-4000-8000-00000000000f\''
\set SERIE1 '\'a0100003-0000-4000-8000-000000000001\''

-- =========================================================================
-- A · El enum: cinco valores, ninguno «en_curso» (ADR-045)
-- =========================================================================

select pg_temp.assert(
  (select count(*) from unnest(enum_range(null::public.estado_cita))) = 5,
  'estado_cita tiene EXACTAMENTE cinco valores (ADR-045)'
);

select pg_temp.assert(
  not exists (select 1 from unnest(enum_range(null::public.estado_cita)) v where v::text = 'en_curso'),
  'NINGÚN valor de estado_cita se llama en_curso: se calcula con el reloj, no se guarda'
);

-- El orden es el contrato con T-020, que lo congeló en lib/agenda/estados-cita.ts.
select pg_temp.assert(
  (select array_agg(v::text order by ord)
     from unnest(enum_range(null::public.estado_cita)) with ordinality as u(v, ord))
  = array['programada', 'confirmada', 'realizada', 'cancelada', 'no_asistida'],
  'El ORDEN de estado_cita es el que T-020 congeló en el otro carril: es un contrato, no una preferencia'
);

-- =========================================================================
-- B · La convención de día de la semana, escrita donde se lee
-- =========================================================================

select pg_temp.assert(
  col_description('public.series_cita'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.series_cita'::regclass and attname = 'dia_semana')
  ) ilike '%isodow%',
  'series_cita.dia_semana documenta ISODOW: sin esto, extract(dow) mete un fallo que aparece un domingo'
);

-- =========================================================================
-- C · La zona horaria de la serie se valida de verdad (ADR-034)
-- =========================================================================

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen)
values (:TT1, 'Terapia individual T-010', 50, 'exento_sanitario');

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.series_cita
           (paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
            dia_semana, hora_local, zona_horaria, sesiones_totales)
         values (%L, %L, %L, %L, 'semanal', 2, time '12:00', 'CEST', 8)$sql$,
    :P1, :PRO1, :CA, :TT1),
  '22023',
  'Una serie con zona_horaria = CEST es rechazada (el catálogo la conoce, el ADR-034 no)'
);

select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.series_cita
           (paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
            dia_semana, hora_local, zona_horaria, sesiones_totales)
         values (%L, %L, %L, %L, 'semanal', 2, time '12:00', '+02', 8)$sql$,
    :P1, :PRO1, :CA, :TT1),
  '22023',
  'Una serie con zona_horaria = +02 es rechazada: un desplazamiento no es una zona'
);

-- GEMELA POSITIVA: la misma fila con una zona IANA de verdad entra.
insert into public.series_cita
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, periodicidad,
   dia_semana, hora_local, zona_horaria, sesiones_totales)
values (:SERIE1, :P1, :PRO1, :CA, :TT1, 'semanal', 2, time '12:00', 'Europe/Madrid', 8);

select pg_temp.assert(
  pg_temp.contar(format('select * from public.series_cita where id = %L', :SERIE1)) = 1,
  'GEMELA POSITIVA: la misma serie con Europe/Madrid SÍ entra'
);

-- =========================================================================
-- D · El rango bloqueante y la restricción de exclusión
-- =========================================================================

-- PRO1 con descanso activo de 10 minutos (es el valor por defecto; se fija explícito
-- para que la prueba no dependa de un default que alguien podría cambiar).
update public.perfiles set descanso_activo = true, descanso_minutos = 10 where id = :PRO1;

insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:CITA1, :P1, :PRO1, :CA, :TT1,
        timestamptz '2026-10-06 10:00:00+02', timestamptz '2026-10-06 10:50:00+02', 'Europe/Madrid');

select pg_temp.assert(
  (select rango_bloqueante = tstzrange(timestamptz '2026-10-06 10:00:00+02',
                                       timestamptz '2026-10-06 11:00:00+02', '[)')
     from public.citas where id = :CITA1),
  'El rango bloqueante es [inicio, fin + descanso): 10:00-10:50 bloquea hasta las 11:00'
);

-- El llamante no lo manda a mano.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.citas
           (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, rango_bloqueante)
         values (%L, %L, %L, timestamptz '2026-10-07 10:00:00+02', timestamptz '2026-10-07 10:50:00+02',
                 'Europe/Madrid', tstzrange(timestamptz '2026-10-07 10:00:00+02', timestamptz '2026-10-07 10:50:00+02'))$sql$,
    :P1, :PRO1, :CA),
  '42501',
  'Mandar rango_bloqueante a mano lanza 42501: lo calcula el disparador'
);

-- Solape directo.
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.citas
           (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
         values (%L, %L, %L, timestamptz '2026-10-06 10:30:00+02', timestamptz '2026-10-06 11:20:00+02', 'Europe/Madrid')$sql$,
    :P1, :PRO1, :CA),
  '23P01',
  'Dos citas solapadas del mismo profesional, ambas programadas, chocan con la restricción de exclusión'
);

-- El descanso muerde: 10:55 cae dentro de [10:00, 11:00).
select pg_temp.assert_lanza_codigo(
  format($sql$insert into public.citas
           (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
         values (%L, %L, %L, timestamptz '2026-10-06 10:55:00+02', timestamptz '2026-10-06 11:45:00+02', 'Europe/Madrid')$sql$,
    :P1, :PRO1, :CA),
  '23P01',
  'Con 10 minutos de descanso, una cita a las 10:55 choca: el descanso es parte del rango, no un consejo'
);

-- Y el error NOMBRA la restricción, que es de lo que depende T-028 para responder
-- «ese hueco acaba de ocuparse» con sugerencias nuevas en vez de un error muerto.
do $$
begin
  begin
    insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
    values ('d0030001-0000-4000-8000-000000000001', 'b0030001-0000-4000-8000-000000000002',
            'c0030001-0000-4000-8000-00000000000a',
            timestamptz '2026-10-06 10:55:00+02', timestamptz '2026-10-06 11:45:00+02', 'Europe/Madrid');
    raise exception 'FALLO: debía chocar y no chocó';
  exception when exclusion_violation then
    if sqlerrm not like '%citas_sin_solape_profesional%' then
      raise exception 'FALLO: el error no nombra citas_sin_solape_profesional, y T-028 lo captura por nombre: %', sqlerrm;
    end if;
    raise notice 'OK: el error de solape NOMBRA citas_sin_solape_profesional (T-028 lo captura por nombre)';
  end;
end;
$$;

-- GEMELA POSITIVA: justo al otro lado del descanso, entra.
insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:CITA2, :P1, :PRO1, :CA, :TT1,
        timestamptz '2026-10-06 11:00:00+02', timestamptz '2026-10-06 11:50:00+02', 'Europe/Madrid');

select pg_temp.assert(
  pg_temp.contar(format('select * from public.citas where id = %L', :CITA2)) = 1,
  'GEMELA POSITIVA: 11:00-11:50 SÍ entra — el descanso se aplica solo por detrás, no por los dos lados'
);

-- Cancelar libera el hueco: es lo que hace la cláusula `where` de la restricción.
update public.citas set estado = 'cancelada' where id = :CITA2;

insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:CITA3, :P2, :PRO1, :CA, :TT1,
        timestamptz '2026-10-06 11:10:00+02', timestamptz '2026-10-06 12:00:00+02', 'Europe/Madrid');

select pg_temp.assert(
  pg_temp.contar(format('select * from public.citas where id = %L', :CITA3)) = 1,
  'Con la anterior CANCELADA, el hueco se reutiliza: sin el `where` de la restricción sería imposible reprogramar'
);

-- =========================================================================
-- E · Cambiar el ajuste NO mueve lo ya acordado
-- =========================================================================

create temp table t15_rangos as
  select id, rango_bloqueante from public.citas order by id;

update public.perfiles set descanso_minutos = 20 where id = :PRO1;

select pg_temp.assert(
  not exists (
    select 1 from public.citas c join t15_rangos r on r.id = c.id
    where c.rango_bloqueante is distinct from r.rango_bloqueante
  ),
  'Cambiar perfiles.descanso_minutos NO modifica NI UNA fila de citas: el rango queda congelado'
);

-- GEMELA POSITIVA del congelado: una cita NUEVA sí usa el ajuste nuevo. Sin esto, la
-- aserción anterior seguiría verde con un disparador que no calculara nada.
insert into public.citas
  (paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:P1, :PRO1, :CA, :TT1,
        timestamptz '2026-10-08 09:00:00+02', timestamptz '2026-10-08 09:50:00+02', 'Europe/Madrid');

select pg_temp.assert(
  (select rango_bloqueante = tstzrange(timestamptz '2026-10-08 09:00:00+02',
                                       timestamptz '2026-10-08 10:10:00+02', '[)')
     from public.citas
    where inicio = timestamptz '2026-10-08 09:00:00+02'),
  'GEMELA POSITIVA: una cita NUEVA sí toma los 20 minutos — el disparador calcula, no está muerto'
);

update public.perfiles set descanso_minutos = 10 where id = :PRO1;
drop table t15_rangos;

-- =========================================================================
-- F · esta_en_curso() (ADR-045)
-- =========================================================================

insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
values (:CITAX, :P2, :PRO2, :CB, :TT1, now() - interval '10 minutes', now() + interval '40 minutes', 'Europe/Madrid');

select pg_temp.assert(
  (select public.esta_en_curso(:CITAX)),
  'esta_en_curso() es cierto para una cita que abarca ahora mismo'
);

update public.citas set estado = 'cancelada' where id = :CITAX;

select pg_temp.assert(
  not (select public.esta_en_curso(:CITAX)),
  'La MISMA cita cancelada NO está en curso: el estado manda sobre el reloj'
);

update public.citas set estado = 'programada' where id = :CITAX;

-- =========================================================================
-- G · Auditoría
-- =========================================================================

update public.citas set sala = 'Sala 2' where id = :CITA1;

select pg_temp.assert(
  exists (
    select 1 from public.auditoria
    where tabla = 'citas' and operacion = 'UPDATE' and registro_id = (:CITA1)::text
      and estado_anterior is not null and estado_posterior is not null
  ),
  'Un update sobre una cita deja fila en auditoria con estado_anterior y estado_posterior'
);

-- El recorte: nota_operativa es texto libre que el choque 3 dice que se usará mal, y la
-- auditoría la lee el propio actor FUERA del candado.
update public.citas set nota_operativa = 'MATERIAL: proyector. NO DEBE APARECER EN AUDITORIA' where id = :CITA1;

select pg_temp.assert(
  not exists (
    select 1 from public.auditoria
    where tabla = 'citas' and registro_id = (:CITA1)::text
      and (estado_posterior::text like '%NO DEBE APARECER%' or estado_anterior::text like '%NO DEBE APARECER%')
  ),
  'citas.nota_operativa va RECORTADA de la auditoría: ni en estado_anterior ni en estado_posterior'
);

-- GEMELA POSITIVA del recorte: lo que NO se recorta sí está. Sin ella, la anterior
-- seguiría verde aunque la auditoría no guardara absolutamente nada.
select pg_temp.assert(
  exists (
    select 1 from public.auditoria
    where tabla = 'citas' and registro_id = (:CITA1)::text
      and estado_posterior ->> 'sala' = 'Sala 2'
  ),
  'GEMELA POSITIVA: `sala` SÍ aparece en la auditoría — se recorta lo peligroso, no todo'
);

-- =========================================================================
-- H · La alerta de nota sin firmar
-- =========================================================================

do $$
declare
  v_cita uuid;
  v_antes bigint;
  v_despues bigint;
begin
  select count(*) into v_antes from public.alertas_documentacion where origen_tabla = 'citas';

  insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
  values ('d0030001-0000-4000-8000-000000000001', 'b0030001-0000-4000-8000-000000000002',
          'c0030001-0000-4000-8000-00000000000a',
          now() - interval '2 days', now() - interval '2 days' + interval '50 minutes', 'Europe/Madrid')
  returning id into v_cita;

  update public.citas set estado = 'realizada' where id = v_cita;

  select count(*) into v_despues from public.alertas_documentacion
   where origen_tabla = 'citas' and origen_id = v_cita and tipo = 'nota_sin_firmar';

  if v_despues <> 1 then
    raise exception 'FALLO: una cita de anteayer marcada realizada debía abrir UNA alerta nota_sin_firmar, y abrió %', v_despues;
  end if;
  raise notice 'OK: una cita pasada marcada realizada sin nota firmada abre su alerta nota_sin_firmar';
end;
$$;

-- Y la alerta no lleva ni una palabra de texto libre: solo identificadores y fechas.
select pg_temp.assert(
  not exists (
    select 1 from public.alertas_documentacion a
    where a.origen_tabla = 'citas'
      and to_jsonb(a)::text like '%NO DEBE APARECER%'
  ),
  'La alerta no arrastra contenido: vive fuera del candado porque alimenta contadores'
);

-- GEMELA POSITIVA: una cita marcada realizada que TODAVÍA NO ha terminado no abre alerta.
-- Sin esta, un disparador que abriera alerta siempre pasaría la anterior.
do $$
declare
  v_cita uuid;
  v_n bigint;
begin
  insert into public.citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria)
  values ('d0030001-0000-4000-8000-000000000002', 'b0030001-0000-4000-8000-000000000003',
          'c0030001-0000-4000-8000-00000000000b',
          now() + interval '1 hour', now() + interval '2 hours', 'Europe/Madrid')
  returning id into v_cita;

  update public.citas set estado = 'realizada' where id = v_cita;

  select count(*) into v_n from public.alertas_documentacion
   where origen_tabla = 'citas' and origen_id = v_cita;

  if v_n <> 0 then
    raise exception 'FALLO: una cita que aún no ha terminado NO debe abrir deuda documental, y abrió %', v_n;
  end if;
  raise notice 'OK: GEMELA POSITIVA — marcar realizada una cita futura no abre alerta: adelantarse no es deuda';
end;
$$;

-- =========================================================================
-- I · Quién ve qué
-- =========================================================================

call pg_temp.como(:ADM);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.citas where profesional_id in (%L, %L)', :PRO1, :PRO2)) > 0,
  'El administrador ve las citas de la organización'
);
call pg_temp.reset_sesion();

call pg_temp.como(:PRO2);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.citas where profesional_id = %L', :PRO1)) = 0,
  'Un profesional NO ve las citas de otro profesional'
);
select pg_temp.assert(
  pg_temp.contar(format('select * from public.citas where profesional_id = %L', :PRO2)) > 0,
  'GEMELA POSITIVA: sí ve las suyas — el cero de arriba es de la política, no de que no haya filas'
);
call pg_temp.reset_sesion();

-- El técnico: CERO por select directo sobre citas (choque 4 + invariante 3).
call pg_temp.como(:TEC1);
select pg_temp.assert(
  pg_temp.contar('select tipo_terapia_id from public.citas') = 0,
  'El técnico administrativo NO tiene política de select sobre citas: cero filas, no columnas tachadas'
);

select pg_temp.assert(
  pg_temp.contar('select * from public.citas_agenda') > 0,
  'GEMELA POSITIVA: el técnico SÍ ve su agenda por la vista — el cero de arriba no es «no hay citas»'
);

select pg_temp.assert(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'citas_agenda'
      and column_name in ('tipo_terapia_id', 'nota_operativa')
  ),
  'La vista citas_agenda NO TIENE las columnas tipo_terapia_id ni nota_operativa: no están, no están en gris'
);

select pg_temp.assert(
  pg_temp.contar(format('select * from public.citas_agenda where centro_id = %L', :CB)) = 0,
  'El técnico de centro A no ve por la vista las citas de centro B'
);
call pg_temp.reset_sesion();

\echo '15-agenda: completa.'
