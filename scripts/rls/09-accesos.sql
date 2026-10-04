-- T-003 · Batería de accesos (ADR-037). Listar pacientes NO genera acceso; abrir contenido
-- SÍ; dos aperturas dentro de la ventana son UN acceso con dos vistas —el contador es
-- `count(*)` sobre `accesos_historia_vistas`, no una columna: comprobado en el catálogo
-- antes de escribir la prueba, la tabla no tiene columna `contador`—.

\echo ''
\echo '=== 09-accesos ==='

call pg_temp.como(:PRO1);

-- --- Listar NO genera acceso ------------------------------------------------------------
-- Postgres no tiene disparadores de SELECT: no hay mecanismo que pudiera generar un
-- acceso al listar. La aserción deja esto como comprobación explícita, no como supuesto.
select pg_temp.assert(pg_temp.contar('select * from public.pacientes') > 0,
  'listar pacientes es una lectura real...');
select pg_temp.assert(
  (select count(*) from public.accesos_historia where perfil_id = :PRO1) = 0,
  '...y no ha creado NINGUNA fila en accesos_historia: las listas no son accesos'
);

-- --- Abrir contenido SÍ genera acceso -----------------------------------------------------
insert into public.accesos_historia (perfil_id, paciente_id, tipo, pestana) values
  (:PRO1, :P1, 'apertura', 'notas_clinicas')
returning id;

select pg_temp.assert(
  (select count(*) from public.accesos_historia where perfil_id = :PRO1 and paciente_id = :P1) = 1,
  'Abrir contenido SÍ deja una fila en accesos_historia'
);

-- --- Dos aperturas dentro de la ventana: UN acceso, dos vistas --------------------------
with acceso as (
  select id from public.accesos_historia where perfil_id = :PRO1 and paciente_id = :P1
)
insert into public.accesos_historia_vistas (acceso_id)
select id from acceso
union all
select id from acceso;

select pg_temp.assert(
  (select count(*) from public.accesos_historia where perfil_id = :PRO1 and paciente_id = :P1) = 1,
  'Sigue siendo UN SOLO acceso, no dos'
);
select pg_temp.assert(
  (select count(*) from public.accesos_historia_vistas v
     join public.accesos_historia a on a.id = v.acceso_id
   where a.perfil_id = :PRO1 and a.paciente_id = :P1) = 2,
  'Y el contador de vistas —count(*) sobre accesos_historia_vistas— es 2'
);

call pg_temp.reset_sesion();

-- --- T-013a · el registro de acceso lo hace la BASE, no la pantalla -----------------------
-- Todo lo de arriba escribe las filas A MANO y con `desbloqueo_id` nulo: prueba que las
-- tablas aguantan el modelo, no que exista un camino para llegar a ellas. Y no existia:
-- el indice `accesos_historia_ventana_idx` solo aplica `where desbloqueo_id is not null`,
-- y ninguna funcion expuesta devolvia ese id. Estas aserciones ejercitan el camino real.

call pg_temp.como(:PRO1);
select public.bloquear_historia();  -- estado conocido: 03-candado pudo dejar ventana abierta

-- GEMELA NEGATIVA, primero: sin desbloqueo no hay apertura. Es la mitad que hace que el
-- candado signifique algo — si esto pasara, las positivas de abajo no probarian nada.
select pg_temp.assert_lanza_codigo(
  format($c$select * from public.registrar_acceso_historia(%L, 'notas_clinicas')$c$, :P1),
  '42501', 'T-013a: sin desbloqueo vigente, registrar un acceso levanta 42501');
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.accesos_historia where perfil_id = %L and desbloqueo_id is not null$c$, :PRO1)) = 0,
  'T-013a: y no ha escrito nada — el rechazo es antes del insert, no despues');

-- --- Una apertura, N vistas, por el camino de verdad ------------------------------------
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'T-013a: PRO1 abre la ventana para registrar accesos');

select pg_temp.assert(a.apertura and a.vistas = 1,
  'T-013a: la primera llamada es una APERTURA, con una vista')
  from public.registrar_acceso_historia(:P1, 'notas_clinicas') a;

select pg_temp.assert(not a.apertura and a.vistas = 2,
  'T-013a: la segunda, dentro de la misma ventana, NO es otra apertura: es la vista 2')
  from public.registrar_acceso_historia(:P1, 'notas_clinicas') a;

select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.accesos_historia
       where perfil_id = %L and paciente_id = %L and desbloqueo_id is not null
         and pestana = 'notas_clinicas'$c$, :PRO1, :P1)) = 1,
  'T-013a: UNA sola fila en accesos_historia tras las dos llamadas');

-- El contador se LEE, no se almacena: `accesos_historia_resumen` es 1 + count(vistas).
select pg_temp.assert(
  (select r.vistas from public.accesos_historia_resumen r
    where r.perfil_id = :PRO1 and r.paciente_id = :P1 and r.pestana = 'notas_clinicas'
      and r.desbloqueo_id is not null) = 2,
  'T-013a: y accesos_historia_resumen.vistas da 2, calculado y no almacenado');

-- --- La ventana agrupa por PESTANA, no por paciente --------------------------------------
select pg_temp.assert(a.apertura and a.vistas = 1,
  'T-013a: otra pestana dentro del MISMO desbloqueo es otro acceso, no una vista')
  from public.registrar_acceso_historia(:P1, 'evaluaciones') a;

select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.accesos_historia where perfil_id = %L and desbloqueo_id is not null$c$, :PRO1)) = 2,
  'T-013a: dos accesos, uno por pestana');

-- --- El desbloqueo abre MI historia, no cualquier historia --------------------------------
-- P2 es de PRO2. PRO1 tiene desbloqueo propio y vigente en este mismo punto: si el unico
-- guardian fuera el candado, esto pasaria.
select pg_temp.assert_lanza_codigo(
  format($c$select * from public.registrar_acceso_historia(%L, 'notas_clinicas')$c$, :P2),
  '42501', 'T-013a: con desbloqueo propio vigente, PRO1 NO registra acceso a un paciente ajeno');

call pg_temp.reset_sesion();

-- Y al reves, para que no dependa de quien sea el paciente: PRO2 tampoco llega a P1.
call pg_temp.como(:PRO2);
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('222222')),
  'T-013a: PRO2 tiene su propia ventana abierta...');
select pg_temp.assert_lanza_codigo(
  format($c$select * from public.registrar_acceso_historia(%L, 'notas_clinicas')$c$, :P1),
  '42501', 'T-013a: ...y aun asi no registra acceso a P1, que no es suyo');
call pg_temp.reset_sesion();

-- El tecnico administrativo no tiene historia que abrir. Falla por el ROL, antes de mirar
-- el desbloqueo: por eso no hace falta darle un PIN que la base le prohibe tener.
call pg_temp.como(:TEC1);
select pg_temp.assert_lanza_codigo(
  format($c$select * from public.registrar_acceso_historia(%L, 'notas_clinicas')$c$, :P1),
  '42501', 'T-013a: el tecnico administrativo no registra accesos a historia');
call pg_temp.reset_sesion();

-- --- Ventana nueva, acceso nuevo -----------------------------------------------------------
-- Si esto fallara, el registro diria que una consulta de hoy y otra de la semana que viene
-- fueron la misma, y el paciente que pregunta «quien ha visto mi historial» leeria una sola.
call pg_temp.como(:PRO1);
select public.bloquear_historia();
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'T-013a: PRO1 cierra y vuelve a abrir — otra ventana');
select pg_temp.assert(a.apertura and a.vistas = 1,
  'T-013a: en la ventana nueva vuelve a ser una APERTURA, no la vista del acceso anterior')
  from public.registrar_acceso_historia(:P1, 'notas_clinicas') a;
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.accesos_historia where perfil_id = %L and desbloqueo_id is not null$c$, :PRO1)) = 3,
  'T-013a: tres accesos en total — dos ventanas, tres aperturas');
call pg_temp.reset_sesion();

-- La ventana se cierra por DOS clausulas distintas —`revocado_en is null` y `caduca_en >
-- now()`— y lo de arriba solo ejercita la primera. La segunda es la que cierra sola una
-- historia olvidada en una mesa compartida, asi que se prueba aparte. Se manipula la
-- caducidad en vez de esperar quince minutos; el check exige mover tambien la concesion.
update public.desbloqueos_historia
   set concedido_en = now() - interval '1 hour',
       caduca_en    = now() - interval '1 minute'
 where perfil_id = :PRO1 and revocado_en is null;

call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format($c$select * from public.registrar_acceso_historia(%L, 'notas_clinicas')$c$, :P1),
  '42501', 'T-013a: con la ventana CADUCADA —no revocada— tampoco se registra nada');
select pg_temp.assert((select desbloqueado from pg_temp.desbloquear_historia('111111')),
  'T-013a: y al volver a teclear el PIN se abre una ventana nueva');
select pg_temp.assert(a.apertura,
  'T-013a: que da un acceso NUEVO, no una vista del de la ventana caducada')
  from public.registrar_acceso_historia(:P1, 'notas_clinicas') a;
select pg_temp.assert(pg_temp.contar(format(
  $c$select * from public.accesos_historia where perfil_id = %L and desbloqueo_id is not null$c$, :PRO1)) = 4,
  'T-013a: cuatro accesos — tres ventanas y una pestana repetida');
call pg_temp.reset_sesion();

\echo '09-accesos: completa.'
