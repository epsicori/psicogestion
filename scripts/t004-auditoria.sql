-- T-004 · Auditoría por triggers y solo adición en tres capas. Criterios 2 a 8.
-- (El 1 son `db reset`, `lint` y `build`.)
-- Ejecutar con:
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -f - < scripts/t004-auditoria.sql
--
-- FIJACIÓN PROPIA: no depende de supabase/seed.sql ni del de T-008. Todo dentro de UNA
-- transacción que acaba en `rollback`. Las sentencias que DEBEN fallar van en `savepoint`.
--
-- REGLA DEL PROYECTO (docs/state.md, tras T-001): toda prueba negativa lleva su GEMELA
-- POSITIVA SOBRE LA MISMA FILA. Ante cada aserción: ¿seguiría verde si quito el arreglo?
--
-- QUÉ CUBRE Y QUÉ NO: las capas 2 y 3 de notas_clinicas_versiones, accesos_historia y
-- accesos_historia_vistas ya las demuestra `scripts/t001-esquema.sql` con filas reales, y
-- no se repiten aquí. Lo de aquí es la CUARTA tabla —`auditoria`, que T-001 no cubría con
-- filas—, el barrido tabla por tabla de las tres capas, y todo lo que T-004 añade.

\set ON_ERROR_STOP off

\set PRO '\'a0000004-0000-4000-8000-000000000002\''
\set CEN '\'c0000004-0000-4000-8000-00000000000a\''

begin;

-- =========================================================================
-- FIJACIÓN
-- =========================================================================

\echo ''
\echo '=== Fijación ==='

insert into public.organizacion (razon_social, nif) values ('Consulta T004 SL', 'B00000004');
insert into public.centros (id, nombre) values (:CEN, 'Centro Cuatro');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :PRO, 'authenticated', 'authenticated', 'pro@t004.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Pro Cuatro","centro_id":"' || :CEN || '"}')::jsonb,
   '', '', '', '');


-- =========================================================================
-- CRITERIO 2 · una fila de auditoría por operación, con sus estados
-- =========================================================================

\echo ''
\echo '=== 2 · insert, update y delete dejan UNA fila cada uno, con actor y estados ==='

set local request.jwt.claims = '{"sub":"a0000004-0000-4000-8000-000000000002","role":"authenticated"}';

insert into public.centros (id, nombre) values ('c0000004-0000-4000-8000-00000000000b', 'Efimero');
update public.centros set nombre = 'Efimero II' where id = 'c0000004-0000-4000-8000-00000000000b';
delete from public.centros where id = 'c0000004-0000-4000-8000-00000000000b';

reset request.jwt.claims;

\echo '--- Una fila por operación, ni más ni menos ---'
select operacion, count(*) as filas
from public.auditoria
where tabla = 'centros' and registro_id = 'c0000004-0000-4000-8000-00000000000b'
group by operacion order by 1;

\echo '--- Actor, registro_id y estados: el INSERT trae posterior y no anterior; el DELETE al revés ---'
select operacion,
       (actor_id = :PRO)                as actor_correcto,
       (registro_id is not null)        as con_registro_id,
       (estado_anterior  is not null)   as trae_anterior,
       (estado_posterior is not null)   as trae_posterior
from public.auditoria
where tabla = 'centros' and registro_id = 'c0000004-0000-4000-8000-00000000000b'
order by id;

\echo '--- El UPDATE guarda el nombre viejo y el nuevo, no solo el nuevo ---'
select (estado_anterior  ->> 'nombre' = 'Efimero')     as anterior_ok,
       (estado_posterior ->> 'nombre' = 'Efimero II')  as posterior_ok
from public.auditoria
where tabla = 'centros' and registro_id = 'c0000004-0000-4000-8000-00000000000b' and operacion = 'UPDATE';


-- =========================================================================
-- CRITERIO 2 bis · las tres tablas sin columna `id` también se auditan
-- =========================================================================
-- Es lo que rompía la versión vieja de fn_auditar(): registro_id es NOT NULL, así que
-- `to_jsonb(new) ->> 'id'` daba nulo y la escritura en la tabla auditada REVENTABA.

\echo ''
\echo '=== 2 bis · preferencias_usuario (clave perfil_id) se audita con su clave ==='

insert into public.preferencias_usuario (perfil_id) values (:PRO);

select (count(*) = 1) as auditada,
       (max(registro_id) = :PRO::text) as registro_id_es_la_clave_real
from public.auditoria where tabla = 'preferencias_usuario';

\echo '--- Gemela positiva: sin el arreglo esto no llegaría aquí, reventaría el insert de arriba ---'
select (count(*) = 1) as la_fila_existe_de_verdad from public.preferencias_usuario where perfil_id = :PRO;


-- =========================================================================
-- CRITERIO 8 · auditoria no la escribe un cliente; el disparador sí
-- =========================================================================

\echo ''
\echo '=== 8 · authenticated no puede fabricar un registro de auditoría ==='

\echo '--- Negativa: insert a mano como authenticated ---'
savepoint sp_insert_auditoria;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000004-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.auditoria (actor_id, tabla, operacion, registro_id)
values (:PRO, 'pacientes', 'DELETE', 'inventado');
reset role;
reset request.jwt.claims;
rollback to savepoint sp_insert_auditoria;

\echo '--- Gemela positiva: el mismo rol, por el disparador, SÍ deja registro ---'
savepoint sp_definer_escribe;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000004-0000-4000-8000-000000000002","role":"authenticated"}';
insert into public.pacientes (id, nombre, apellidos, profesional_id)
values ('d0000004-0000-4000-8000-000000000001', 'Auditada', 'Porel Disparador', :PRO);
reset role;
reset request.jwt.claims;
select (count(*) = 1) as el_disparador_si_escribe
from public.auditoria where tabla = 'pacientes' and registro_id = 'd0000004-0000-4000-8000-000000000001';
rollback to savepoint sp_definer_escribe;


-- =========================================================================
-- CRITERIO 7 · fallo y bloqueo de PIN dejan su entrada
-- =========================================================================

\echo ''
\echo '=== 7 · Cinco intentos fallidos: cinco PIN_FALLIDO y un PIN_BLOQUEADO ==='

set local request.jwt.claims = '{"sub":"a0000004-0000-4000-8000-000000000002","role":"authenticated"}';
select public.fijar_pin_historia('123456');

select public.desbloquear_historia('000000');
select public.desbloquear_historia('000000');
select public.desbloquear_historia('000000');
select public.desbloquear_historia('000000');
select * from public.desbloquear_historia('000000');
reset request.jwt.claims;

select
  (count(*) filter (where operacion = 'PIN_FALLIDO')   = 5) as cinco_fallidos,
  (count(*) filter (where operacion = 'PIN_BLOQUEADO') = 1) as un_bloqueo
from public.auditoria where tabla = 'pines_historia';


-- =========================================================================
-- CRITERIO 7 ter · auditoria registra qué pasó, nunca qué decía
-- =========================================================================
-- Es lo que este ticket estuvo a punto de romper: colgar la auditoría de TODAS las tablas
-- sin recortar nada mete el hash del PIN, el criptograma del DNI y el cuerpo de la nota
-- en una tabla que NO está bajo el candado del ADR-026.

\echo ''
\echo '=== 7 ter · El recorte: ni credencial, ni criptograma, ni contenido bajo candado ==='

\echo '--- Gemela positiva primero: fijar el PIN SÍ dejó su fila de auditoría ---'
select (count(*) > 0) as pines_historia_se_audita
from public.auditoria where tabla = 'pines_historia' and operacion in ('INSERT','UPDATE');

\echo '--- Y esa fila NO trae el hash: el recorte es lo que lo quita, no la suerte ---'
select (count(*) = 0) as sin_hash_en_la_auditoria
from public.auditoria
where tabla = 'pines_historia'
  and (estado_posterior ? 'hash' or estado_anterior ? 'hash');

\echo '--- Ni el PIN en claro ni un hash bcrypt en NINGUNA fila de auditoria ---'
select (count(*) = 0) as ningun_secreto_en_toda_la_tabla
from public.auditoria
where coalesce(estado_posterior::text, '') || coalesce(estado_anterior::text, '') like '%$2%'
   or coalesce(estado_posterior::text, '') || coalesce(estado_anterior::text, '') like '%123456%';

\echo '--- El recorte va escrito en el disparador, así que se ve sin leer el código ---'
select c.relname as tabla,
       (pg_get_triggerdef(t.oid) like '%''hash''%'
        or pg_get_triggerdef(t.oid) like '%cifrado%'
        or pg_get_triggerdef(t.oid) like '%''cuerpo''%') as declara_su_recorte
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgname like 'auditar_%'
  and c.relname in ('pines_historia', 'pacientes_identificacion', 'notas_clinicas_versiones')
order by 1;

\echo '--- Negativa: un recorte mal escrito debe hacer fallar la migración, no pasar callando ---'
savepoint sp_recorte_malo;
create trigger auditar_prueba_recorte after insert on public.centros
  for each row execute function public.fn_auditar('id', 'columna_que_no_existe');
insert into public.centros (id, nombre) values ('c0000004-0000-4000-8000-00000000000f', 'Recorte');
\echo '    (el disparador se deja crear; lo que la migración comprueba es que la columna exista)'
select (estado_posterior ? 'nombre') as el_recorte_inexistente_no_borra_nada
from public.auditoria where registro_id = 'c0000004-0000-4000-8000-00000000000f' limit 1;
rollback to savepoint sp_recorte_malo;


-- =========================================================================
-- CRITERIO 7 bis · el hecho auditable que no viene de un disparador
-- =========================================================================

\echo ''
\echo '=== 7 bis · registrar_evento_auditable: fuerza el actor y rechaza cambios de fila ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000004-0000-4000-8000-000000000002","role":"authenticated"}';

\echo '--- Positiva: una sesión y una búsqueda quedan registradas ---'
select public.registrar_evento_auditable('SESION', 'perfiles', :PRO::text, null);
select public.registrar_evento_auditable('BUSQUEDA', 'pacientes', '3 resultados', '{"termino":"lu"}'::jsonb);

\echo '--- Negativa: un cliente NO puede fabricar un cambio de fila ---'
savepoint sp_forjar;
select public.registrar_evento_auditable('DELETE', 'pacientes', 'inventado', null);
rollback to savepoint sp_forjar;

reset role;
reset request.jwt.claims;

select (count(*) filter (where operacion = 'SESION')   = 1) as sesion_registrada,
       (count(*) filter (where operacion = 'BUSQUEDA') = 1) as busqueda_registrada,
       (count(*) filter (where operacion = 'DELETE' and registro_id = 'inventado') = 0) as nada_forjado
from public.auditoria;


-- =========================================================================
-- CRITERIO 3 · las tres capas, TABLA POR TABLA
-- =========================================================================

\echo ''
\echo '=== 3 · Barrido de las tres capas sobre cada tabla del catálogo ==='
\echo '    capa 1 = ni UPDATE ni DELETE concedidos a nadie, postgres incluido'
\echo '    capa 2 = disparador BEFORE UPDATE OR DELETE por fila'
\echo '    capa 3 = disparador BEFORE TRUNCATE por sentencia'

select t.tabla,
       not exists (select 1 from information_schema.table_privileges p
                    where p.table_schema='public' and p.table_name=t.tabla
                      and p.privilege_type in ('UPDATE','DELETE'))                 as capa1_revoke,
       exists (select 1 from pg_trigger g where g.tgrelid = to_regclass('public.'||t.tabla)
                 and not g.tgisinternal and (g.tgtype & 1)=1 and (g.tgtype & 2)=2
                 and (g.tgtype & 8)=8 and (g.tgtype & 16)=16)                      as capa2_fila,
       exists (select 1 from pg_trigger g where g.tgrelid = to_regclass('public.'||t.tabla)
                 and not g.tgisinternal and (g.tgtype & 1)=0 and (g.tgtype & 2)=2
                 and (g.tgtype & 32)=32)                                           as capa3_sentencia
from public.tablas_solo_adicion t order by 1;

\echo ''
\echo '--- La CUARTA tabla, `auditoria`, con filas de verdad (T-001 cubrió las otras tres) ---'

\echo '--- 3a · UPDATE sobre auditoria: denegado por privilegio (capa 1) ---'
savepoint sp_upd_aud;
update public.auditoria set registro_id = 'x' where tabla = 'centros';
rollback to savepoint sp_upd_aud;

\echo '--- 3b · Con el privilegio RECUPERADO, el disparador sigue bloqueando (42501, capa 2) ---'
savepoint sp_upd_aud_forzado;
grant update, delete on table public.auditoria to postgres;
update public.auditoria set registro_id = 'x' where tabla = 'centros';
rollback to savepoint sp_upd_aud_forzado;

\echo '--- 3c · DELETE con el privilegio recuperado: también bloqueado (42501, capa 2) ---'
savepoint sp_del_aud_forzado;
grant update, delete on table public.auditoria to postgres;
delete from public.auditoria where tabla = 'centros';
rollback to savepoint sp_del_aud_forzado;

\echo '--- 3d · TRUNCATE de auditoria como postgres: bloqueado por el de sentencia (42501, capa 3) ---'
\echo '    Es la capa que casi nadie escribe: TRUNCATE no dispara los de fila y RLS no lo ve.'
savepoint sp_trunc_aud;
truncate table public.auditoria;
rollback to savepoint sp_trunc_aud;

\echo '--- Gemela positiva: la tabla SIGUE teniendo sus filas después de los cuatro intentos ---'
select (count(*) > 0) as auditoria_intacta from public.auditoria where tabla = 'centros';


-- =========================================================================
-- CRITERIO 6 · TRUNCATE no está concedido a los roles del cliente
-- =========================================================================

\echo ''
\echo '=== 6 · Ninguna tabla concede TRUNCATE a anon, authenticated ni service_role ==='

select (count(*) = 0) as sin_truncate_para_el_cliente
from information_schema.table_privileges
where table_schema = 'public' and privilege_type = 'TRUNCATE'
  and grantee in ('anon', 'authenticated', 'service_role');

\echo '--- Y tampoco se lo regala a una tabla NUEVA (alter default privileges) ---'
savepoint sp_tabla_nueva;
create table public.prueba_privilegio_por_defecto (id uuid primary key default gen_random_uuid());
select (count(*) = 0) as tabla_nueva_sin_regalo
from information_schema.table_privileges
where table_schema = 'public' and table_name = 'prueba_privilegio_por_defecto'
  and grantee in ('anon', 'authenticated', 'service_role');
rollback to savepoint sp_tabla_nueva;


-- =========================================================================
-- CRITERIOS 4 y 5 · el comprobador de cobertura
-- =========================================================================

\echo ''
\echo '=== 4 · Con todo en su sitio, el comprobador devuelve CERO filas ==='

select (count(*) = 0) as cobertura_completa from public.cobertura_solo_adicion();

\echo ''
\echo '=== 5 · Una tabla de solo adición SIN sus tres capas hace fallar el comprobador ==='

savepoint sp_tabla_desprotegida;
create table public.prueba_sin_capas (id uuid primary key default gen_random_uuid());
insert into public.tablas_solo_adicion (tabla, motivo)
values ('prueba_sin_capas', 'Tabla de prueba: existe para que el comprobador la eche en falta.');

\echo '--- El comprobador la señala, y dice QUÉ capa le falta ---'
select * from public.cobertura_solo_adicion();

select (count(*) = 1) as el_comprobador_falla from public.cobertura_solo_adicion();
rollback to savepoint sp_tabla_desprotegida;

\echo '--- Y al revertir, vuelve a cero: la prueba movía algo de verdad ---'
select (count(*) = 0) as vuelve_a_cero from public.cobertura_solo_adicion();

\echo ''
\echo '=== 5 bis · Una tabla del catálogo que NO EXISTE también se señala ==='
savepoint sp_tabla_fantasma;
insert into public.tablas_solo_adicion (tabla, motivo)
values ('facturas', 'Aún no existe (ADR-053). Si alguien la añade al catálogo antes de crearla, se ve.');
select (count(*) filter (where tabla = 'facturas' and not existe) = 1) as fantasma_detectada
from public.cobertura_solo_adicion();
rollback to savepoint sp_tabla_fantasma;


-- =========================================================================
-- El volumen del candado, que es una decisión y no un descuido
-- =========================================================================

\echo ''
\echo '=== Extra · prolongar el desbloqueo NO se audita; revocarlo SÍ ==='

savepoint sp_volumen;
insert into public.desbloqueos_historia (id, perfil_id, caduca_en)
values ('b0000004-0000-4000-8000-000000000001', :PRO, now() + interval '15 minutes');

update public.desbloqueos_historia set caduca_en = now() + interval '30 minutes'
where id = 'b0000004-0000-4000-8000-000000000001';

\echo '--- Tras el INSERT y una prolongación: una sola fila de auditoría, la del alta ---'
select (count(*) = 1) as solo_el_alta,
       (max(operacion) = 'INSERT') as y_es_el_insert
from public.auditoria where tabla = 'desbloqueos_historia'
  and registro_id = 'b0000004-0000-4000-8000-000000000001';

update public.desbloqueos_historia set revocado_en = now()
where id = 'b0000004-0000-4000-8000-000000000001';

\echo '--- La REVOCACIÓN sí deja su UPDATE: es un hecho de seguridad, y ocurre una vez ---'
select (count(*) filter (where operacion = 'UPDATE') = 1) as revocacion_auditada
from public.auditoria where tabla = 'desbloqueos_historia'
  and registro_id = 'b0000004-0000-4000-8000-000000000001';
rollback to savepoint sp_volumen;


rollback;

\echo ''
\echo '=== Fin. Los errores de la salida son las aserciones negativas buscadas. ==='
