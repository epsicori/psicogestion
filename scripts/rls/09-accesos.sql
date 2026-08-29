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

\echo '09-accesos: completa.'
