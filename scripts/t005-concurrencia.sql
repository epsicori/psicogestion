-- T-005 · La única prueba que no cabe en el banco de RLS: necesita DOS CONEXIONES
-- y por tanto datos CONFIRMADOS (una transacción no puede simular concurrencia consigo
-- misma). Se ejecuta con `npm run test:huellas` (scripts/test-huellas.mjs), que localiza
-- el contenedor y manda este fichero por stdin a psql, tal y como scripts/t001-esquema.sql
-- ya probó la carrera de fusión con el mismo patrón (`\! psql ... lock_timeout`).
--
-- Requisito: `npx supabase db reset` ya ejecutado (supabase/seed.sql aporta el
-- profesional 11111111-1111-4111-8111-111111111111 y su paciente «Lucía»).
--
-- Este guion CONFIRMA y sus filas QUEDAN (notas_clinicas_versiones es de solo adición,
-- invariante 2): usa un paciente y unas notas propias e identificables, y no hace
-- rollback. Volver a ejecutarlo sobre la misma base fallaría al repetir los mismos UUID
-- — es la señal de que hay que resetear la base antes de repetir la prueba.
--
-- Correcciones tras la revisión con Opus del 30-08-2026 (hallazgo MEDIA):
--   1. Las cuatro comprobaciones eran `select case when … then 'OK' else 'FALLO' end`,
--      SIN `raise`, así que `ON_ERROR_STOP` no mordía y el guion salía con código 0
--      aunque las cuatro imprimieran FALLO. Ahora cada una es un `do $$ … raise exception
--      … $$` de verdad.
--   2. El resultado de la segunda conexión se captura en `public.t005_resultado`
--      (éxito/SQLSTATE), como pedía el §11.3 del diseño aprobado, en vez de asumirse por
--      lo que NO pasó.
--   3. `psql` NO interpola variables `:VAR` dentro de un bloque `$$ … $$` (verificado:
--      `do $$ begin raise notice ':X'; end $$;` imprime literalmente «:X», no el valor) —
--      es la MISMA razón por la que `\!` tampoco lo hacía (ya corregido antes). Por eso
--      los `do $$ … $$` de abajo llevan los UUID escritos a mano, no `:NOTA1`/`:NOTA2`; las
--      sentencias sueltas de fuera de un bloque SÍ interpolan con normalidad y siguen
--      usando las variables.

\set ON_ERROR_STOP 1
\set ANA '\'11111111-1111-4111-8111-111111111111\''

\echo ''
\echo '=== T-005 · Concurrencia real de la cadena de huellas (dos conexiones) ==='

-- `order by id`: sin él, «el primer paciente de Ana» no es determinista si algún día hay
-- más de uno (hallazgo BAJA de la revisión con Opus).
select id as pconc_id from public.pacientes where profesional_id = :ANA order by id limit 1 \gset

\set NOTA1 '\'e0050002-0000-4000-8000-000000000001\''
\set NOTA2 '\'e0050002-0000-4000-8000-000000000002\''

-- T-034 (ADR-071): toda nota cuelga de un episodio del autor.
\set EPICONC '\'e0050003-0000-4000-8000-000000000001\''
insert into public.episodios_asistenciales (id, paciente_id, profesional_id) values
  (:EPICONC, :'pconc_id', :ANA);

insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  (:NOTA1, :'pconc_id', :EPICONC, :ANA),
  (:NOTA2, :'pconc_id', :EPICONC, :ANA);

-- Tabla NO temporal (a diferencia de las de pg_temp del banco de RLS): la necesitan DOS
-- conexiones distintas, que no comparten `pg_temp`. Guarda éxito/SQLSTATE de la segunda
-- conexión, tal como pedía el §11.3 del diseño — antes no se guardaba en ningún sitio, y
-- la prueba solo miraba lo que NO había pasado, no lo que de verdad pasó.
drop table if exists public.t005_resultado;
create table public.t005_resultado (
  etiqueta      text primary key,
  exito         boolean not null,
  sqlstate_code text,
  mensaje       text
);

-- Función NO temporal (a diferencia de pg_temp.sobre_prueba del banco de RLS): la
-- necesitan DOS conexiones distintas, que no comparten pg_temp. Se borra al final.
-- T-012a: p_alcance nuevo, con default 'individual' porque es el valor por defecto de
-- la columna homónima (ADR-057) y todas las filas de esta prueba son individuales.
-- T-012c: p_nota_id nuevo y primero (la cabecera del sobre se lee de notas_clinicas).
create or replace function public.t005_sobre_prueba(
  p_nota_id   uuid,
  p_autor_id  uuid,
  p_creada_en timestamptz,
  p_cuerpo    jsonb,
  p_alcance   text default 'individual'
) returns text
language sql
stable
as $$
  select
    '{' ||
    '"abierta_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"alcance":' || coalesce(to_json(p_alcance)::text, 'null') || ',' ||
    '"anotaciones_reservadas":null,' ||
    '"autor_id":"' || lower(p_autor_id::text) || '",' ||
    '"cita_id":null,' ||
    '"coprofesional_id":' || coalesce(to_json((select n.coprofesional_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"creada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"cuerpo":' || p_cuerpo::text || ',' ||
    '"episodio_id":' || coalesce(to_json((select n.episodio_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"esquema_version":4,' ||
    '"fecha_sesion":' || coalesce(to_json((select to_char(n.fecha_sesion, 'YYYY-MM-DD') from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"firmada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"margen_sesion_minutos":null,' ||
    '"motivo_cambio":null,' ||
    '"nota_id":"' || lower(p_nota_id::text) || '",' ||
    '"paciente_id":' || coalesce(to_json((select n.paciente_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"redactada_en_sesion":false' ||
    '}';
$$;

\echo '--- T1 abre transacción y firma NOTA1: toma el cerrojo consultivo del paciente ---'
begin;
insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NOTA1, '{"t":"conc-a"}',
   public.t005_sobre_prueba(:NOTA1, :ANA, timestamptz '2026-01-01 00:00:00+00', '{"t":"conc-a"}'::jsonb),
   :ANA, timestamptz '2026-01-01 00:00:00+00');

-- `\!` NO interpola variables de psql: la segunda conexión lleva los UUID literales, no
-- `:NOTA2`/`:ANA`. El `do $$ … $$` de dentro atrapa el resultado (éxito o SQLSTATE) y lo
-- deja en `t005_resultado`, visible para la primera conexión en cuanto esta segunda
-- conexión termine (son transacciones separadas). Los `$` del `do $do$ … $do$` van escapados
-- (`\$do\$`) porque esta línea pasa por el shell ANTES de llegar al psql interno: sin
-- escapar, `/bin/sh` intentaría expandir `$do` como variable de entorno (vacía) y rompería
-- la etiqueta de la comilla de dólar.
\echo '--- T2 (segunda conexión), con T1 todavía sin commit: debe morir con 55P03 lock_not_available ---'
\! psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set lock_timeout='2s'; do \$do\$ begin begin insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values ('e0050002-0000-4000-8000-000000000002', '{\"t\":\"conc-b\"}', public.t005_sobre_prueba('e0050002-0000-4000-8000-000000000002'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, timestamptz '2026-01-01 00:00:01+00', '{\"t\":\"conc-b\"}'::jsonb), '11111111-1111-4111-8111-111111111111', timestamptz '2026-01-01 00:00:01+00'); insert into public.t005_resultado values ('t2_insert', true, null, 'insertó sin esperar (inesperado si T1 seguia sin commit)'); exception when others then insert into public.t005_resultado values ('t2_insert', false, sqlstate, sqlerrm); end; end \$do\$;"

commit;

\echo '--- Aserción 1: T2 murió de verdad con 55P03, no con cualquier otro error ni con éxito ---'
do $$
declare
  v_fila public.t005_resultado%rowtype;
begin
  select * into v_fila from public.t005_resultado where etiqueta = 't2_insert';
  if not found then
    raise exception 'FALLO: la segunda conexión no dejó ningún resultado en t005_resultado — ¿falló el propio `\!`?';
  end if;
  if v_fila.exito or v_fila.sqlstate_code is distinct from '55P03' then
    raise exception 'FALLO: T2 debía fallar con 55P03 (lock_not_available) y no otra cosa. exito=%, sqlstate=%, mensaje=%',
      v_fila.exito, v_fila.sqlstate_code, v_fila.mensaje;
  end if;
  raise notice 'OK: T2 murió con 55P03 lock_not_available mientras T1 no había hecho commit (mensaje: %)', v_fila.mensaje;
end;
$$;

\echo '--- Aserción 2: NOTA2 sigue sin versión (T2 murió de verdad, no coló nada) ---'
-- UUID de NOTA2 escrito a mano dentro del bloque: :NOTA2 no se interpola aquí dentro (ver
-- nota de cabecera). El valor coincide con \set NOTA2 de arriba.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.notas_clinicas_versiones
   where nota_id = 'e0050002-0000-4000-8000-000000000002';
  if v_n <> 0 then
    raise exception 'FALLO: NOTA2 tiene % versión(es) que no debía tener todavía', v_n;
  end if;
  raise notice 'OK: NOTA2 sigue sin versión tras el intento bloqueado';
end;
$$;

\echo '--- T1 comprometida: ahora sí entra la segunda firma, ya sin contención ---'
insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NOTA2, '{"t":"conc-b"}',
   public.t005_sobre_prueba(:NOTA2, :ANA, timestamptz '2026-01-01 00:00:02+00', '{"t":"conc-b"}'::jsonb),
   :ANA, timestamptz '2026-01-01 00:00:02+00');

\echo '--- Aserción 3: dos versiones, posiciones 1 y 2, huella_anterior DISTINTAS ---'
do $$
declare
  v_pos1 integer;
  v_pos2 integer;
  v_distintas integer;
begin
  select count(*) filter (where posicion_cadena = 1), count(*) filter (where posicion_cadena = 2),
         count(distinct huella_anterior)
    into v_pos1, v_pos2, v_distintas
    from public.notas_clinicas_versiones
   where nota_id in ('e0050002-0000-4000-8000-000000000001', 'e0050002-0000-4000-8000-000000000002');
  if v_pos1 <> 1 or v_pos2 <> 1 or v_distintas <> 2 then
    raise exception
      'FALLO: la cadena concurrente no quedó como se esperaba (posición 1: %, posición 2: %, huella_anterior distintas: %)',
      v_pos1, v_pos2, v_distintas;
  end if;
  raise notice 'OK: dos firmas concurrentes NO comparten huella_anterior (posiciones 1 y 2, cerrojo real)';
end;
$$;

\echo '--- Aserción 4: la cadena queda sana ---'
do $$
declare
  v_paciente_id uuid;
  v_n integer;
begin
  select id into v_paciente_id from public.pacientes
   where profesional_id = '11111111-1111-4111-8111-111111111111'::uuid
   order by id limit 1;
  select count(*) into v_n from public.verificar_cadena_huellas(v_paciente_id);
  if v_n <> 0 then
    raise exception 'FALLO: verificar_cadena_huellas() encontró % anomalía(s)', v_n;
  end if;
  raise notice 'OK: verificar_cadena_huellas() sobre la cadena concurrente da cero roturas';
end;
$$;


-- =========================================================================
-- T-036 · La modificación concurrente y el guardado mientras se firma
-- =========================================================================
-- Diseño: tickets/T-036/diseno.md §1.4 y E.4. Confirma filas, como el resto del guion.
--   · 1.4 (§1.4): dos firmas de la v2 de una misma nota a la vez. La segunda espera el
--     cerrojo de la cabecera, relee la fila confirmada (borrador ya vacío) y muere en 6.17.
--   · E.4.2: lo que hace guardarBorrador entre la lectura de firmarNota y su insert: T1 guarda
--     el borrador Y y no confirma; T2 firma el sobre de X. Al confirmar T1, T2 relee el
--     borrador vigente y 6.24 la rechaza (R2-H1).
--   · E.4.3: el control mutante. Con 6.24 apagada dentro de la transacción de T2, la misma
--     carrera la deja ganar: sin eso la carrera de arriba no probaría el cotejo.
--
-- T2 vive en una FUNCIÓN (public.t036_firmar_en_segundo_plano), no en el `-c "..."`: sin `$`
-- ni JSON que pase por /bin/sh. Es plpgsql INVOKER (`set role` está prohibido en un definer).

\set NOTA36  '\'e0360006-0000-4000-8000-000000000001\''
\set NOTA36R '\'e0360006-0000-4000-8000-000000000002\''
\set ANAJWT '\'{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}\''

-- Residuos de una ejecución anterior que murió a mitad (con ON_ERROR_STOP=1 psql sale en el primer
-- error y el `drop` del final no llega a correr): se borran al empezar. Antes del resto, porque
-- cambiar la firma de una función dejaría la vieja en `public`.
drop function if exists public.t036_firmar_en_segundo_plano(text, text, boolean);
drop function if exists public.t036_esperar_bloqueo(text, text);
drop function if exists public.t036_esperar_bloqueo(text);
drop function if exists public.t036_esperar_resultado(text);
drop function if exists public.t036_sobre_prueba(uuid, uuid, timestamptz, jsonb, timestamptz, text);
drop table if exists public.t036_sobres;
drop table if exists public.t036_original;

-- La gemela de t005_sobre_prueba con abierta_en y motivo_cambio (la de T-005 no se toca: la
-- usan las firmas de T-005). Se borra al final.
create or replace function public.t036_sobre_prueba(
  p_nota_id   uuid,
  p_autor_id  uuid,
  p_creada_en timestamptz,
  p_cuerpo    jsonb,
  p_abierta_en timestamptz default null,
  p_motivo_cambio text default null
) returns text
language sql
stable
as $$
  select
    '{' ||
    '"abierta_en":' || to_json(to_char(coalesce(p_abierta_en, p_creada_en) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"alcance":"individual",' ||
    '"anotaciones_reservadas":null,' ||
    '"autor_id":"' || lower(p_autor_id::text) || '",' ||
    '"cita_id":null,' ||
    '"coprofesional_id":' || coalesce(to_json((select n.coprofesional_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"creada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"cuerpo":' || p_cuerpo::text || ',' ||
    '"episodio_id":' || coalesce(to_json((select n.episodio_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"esquema_version":4,' ||
    '"fecha_sesion":' || coalesce(to_json((select to_char(n.fecha_sesion, 'YYYY-MM-DD') from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"firmada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"margen_sesion_minutos":null,' ||
    '"motivo_cambio":' || coalesce(to_json(p_motivo_cambio)::text, 'null') || ',' ||
    '"nota_id":"' || lower(p_nota_id::text) || '",' ||
    '"paciente_id":' || coalesce(to_json((select n.paciente_id::text from public.notas_clinicas n where n.id = p_nota_id))::text, 'null') || ',' ||
    '"redactada_en_sesion":false' ||
    '}';
$$;
-- Ninguna de las funciones t036_* es para anon ni authenticated: si el guion muriera a mitad y
-- quedaran en public, PostgREST no las expondría.
revoke execute on function public.t036_sobre_prueba(uuid, uuid, timestamptz, jsonb, timestamptz, text)
  from public, anon, authenticated;

-- Los sobres que «leyó firmarNota», preparados como postgres: el JSON se lee de aquí dentro de
-- la función de T2, así que no pasa por el shell.
drop table if exists public.t036_sobres;
create table public.t036_sobres (
  clave     text primary key,
  contenido text not null,
  creada_en timestamptz not null
);

-- T2: firma como Ana (authenticated) el sobre `p_clave_sobre`, en una transacción propia, y deja
-- el resultado en t005_resultado. Con p_mutar apaga 6.24 DENTRO del sub-bloque, firma, y deshace
-- las dos cosas con una excepción: el mutante nunca se confirma.
create or replace function public.t036_firmar_en_segundo_plano(
  p_etiqueta text, p_clave_sobre text, p_mutar boolean)
returns void
language plpgsql
as $f$
declare
  c_ana   constant uuid := '11111111-1111-4111-8111-111111111111';
  c_frag  constant text := 'if not (v_mismo_texto and v_mismas_reservadas) then';
  v_contenido text;
  v_creada    timestamptz;
  v_def       text;
  v_exito     boolean := false;
  v_sqlstate  text;
  v_mensaje   text;
begin
  perform set_config('lock_timeout', '30s', true);
  select s.contenido, s.creada_en into strict v_contenido, v_creada
    from public.t036_sobres s where s.clave = p_clave_sobre;
  begin
    if p_mutar then
      v_def := pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure);
      if (length(v_def) - length(replace(v_def, c_frag, ''))) <> length(c_frag) then
        raise exception 't036: el fragmento a mutar no aparece exactamente una vez';
      end if;
      execute replace(v_def, c_frag, 'if false then');
    end if;
    perform set_config('request.jwt.claims',
      '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}', true);
    execute 'set local role authenticated';
    insert into public.notas_clinicas_versiones
      (nota_id, cuerpo, motivo_cambio, contenido_canonico, autor_id, creada_en)
    values ((v_contenido::jsonb ->> 'nota_id')::uuid,
            (v_contenido::jsonb -> 'cuerpo')::text,
            v_contenido::jsonb ->> 'motivo_cambio',
            v_contenido, c_ana, v_creada);
    v_exito := true;
    if p_mutar then
      raise exception using errcode = 'P0001', message = 't036: deshacer el mutante';
    end if;
  exception when others then
    if not v_exito then
      v_sqlstate := sqlstate;
      v_mensaje  := sqlerrm;
    end if;
  end;
  execute 'reset role';
  insert into public.t005_resultado (etiqueta, exito, sqlstate_code, mensaje)
  values (p_etiqueta, v_exito, v_sqlstate, v_mensaje);
end;
$f$;
revoke execute on function public.t036_firmar_en_segundo_plano(text, text, boolean)
  from public, anon, authenticated;

-- El sondeo de T1: hasta 10 s esperando que la conexión `p_etiqueta` esté bloqueada en un cerrojo.
-- Cada vuelta limpia la instantánea de pg_stat_activity (T1 sigue en su transacción y, si no, ve
-- siempre la misma foto).
create or replace function public.t036_esperar_bloqueo(
  p_etiqueta text, p_quien text default 'el cerrojo de la cabecera')
returns void
language plpgsql
as $$
declare
  v_vista text;
begin
  for i in 1..100 loop
    perform pg_stat_clear_snapshot();
    if exists (select 1 from pg_stat_activity a
                where a.application_name = p_etiqueta and a.wait_event_type = 'Lock') then
      raise notice 'OK: la conexión % está esperando un cerrojo', p_etiqueta;
      return;
    end if;
    perform pg_sleep(0.1);
  end loop;
  select string_agg(coalesce(a.state, '?') || '/' || coalesce(a.wait_event_type, '-') || ':' || coalesce(a.wait_event, '-'), ', ')
    into v_vista from pg_stat_activity a where a.application_name = p_etiqueta;
  raise exception 'FALLO: la firma % no llegó a esperar %: sin espera no hay carrera (vista: %)',
    p_etiqueta, p_quien, coalesce(v_vista, 'no hay ninguna conexión con esa etiqueta');
end;
$$;
revoke execute on function public.t036_esperar_bloqueo(text, text) from public, anon, authenticated;

-- La espera del resultado de T2: hasta 30 s.
create or replace function public.t036_esperar_resultado(p_etiqueta text)
returns void
language plpgsql
as $$
begin
  for i in 1..300 loop
    if exists (select 1 from public.t005_resultado r where r.etiqueta = p_etiqueta) then
      return;
    end if;
    perform pg_sleep(0.1);
  end loop;
  raise exception 'FALLO: la firma % no dejó ningún resultado en t005_resultado (¿falló la propia conexión secundaria?)', p_etiqueta;
end;
$$;
revoke execute on function public.t036_esperar_resultado(text) from public, anon, authenticated;

-- =========================================================================
-- §1.4 · Dos firmas de la v2 a la vez: la segunda muere en 6.17
-- =========================================================================
\echo ''
\echo '=== T-036 · §1.4 · la doble firma concurrente de una modificación ==='

-- Montaje como postgres: NOTA36 de Ana, sin cita, v1 firmada como postgres (exenta, P1) y un
-- desbloqueo vigente de la historia de Ana.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, fecha_sesion) values
  (:NOTA36, :'pconc_id', :EPICONC, :ANA, date '2026-10-02');
insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NOTA36, '{"t":"v1"}',
   public.t005_sobre_prueba(:NOTA36, :ANA, timestamptz '2026-01-01 00:00:03+00', '{"t":"v1"}'::jsonb),
   :ANA, timestamptz '2026-01-01 00:00:03+00');
insert into public.desbloqueos_historia (perfil_id, caduca_en) values (:ANA, now() + interval '1 hour');

-- Reabrir como Ana: lo que hace empezarModificacion.
begin;
set local role authenticated;
set local request.jwt.claims = :ANAJWT;
update public.notas_clinicas
   set borrador_contenido = '{"texto":"v2","reservadas":""}', borrador_autor_id = :ANA
 where id = :NOTA36;
commit;

select borrador_abierta_en as ab_36 from public.notas_clinicas where id = :NOTA36 \gset

-- Los dos sobres de la v2, con el mismo cuerpo, motivo y abierta_en y su propio reloj.
insert into public.t036_sobres (clave, contenido, creada_en)
select 't1', public.t036_sobre_prueba(:NOTA36, :ANA, c, '{"texto":"v2"}'::jsonb, :'ab_36'::timestamptz, 'concurrente'), c
  from (select date_trunc('milliseconds', clock_timestamp()) as c) x;
insert into public.t036_sobres (clave, contenido, creada_en)
select 't2', public.t036_sobre_prueba(:NOTA36, :ANA, c, '{"texto":"v2"}'::jsonb, :'ab_36'::timestamptz, 'concurrente'), c
  from (select date_trunc('milliseconds', clock_timestamp()) as c) x;
select contenido as s_t1, creada_en as c_t1 from public.t036_sobres where clave = 't1' \gset

\echo '--- T1 firma la v2 como Ana y NO confirma: toma el cerrojo de la cabecera ---'
begin;
set local role authenticated;
set local request.jwt.claims = :ANAJWT;
insert into public.notas_clinicas_versiones (nota_id, cuerpo, motivo_cambio, contenido_canonico, autor_id, creada_en) values
  (:NOTA36, '{"texto":"v2"}', 'concurrente', :'s_t1', :ANA, :'c_t1');
reset role;

\echo '--- T2 (segunda conexión) firma la misma v2 mientras T1 no confirma: debe esperar y morir en 6.17 ---'
\! PGAPPNAME=t036_t2 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select public.t036_firmar_en_segundo_plano('t036_t2','t2',false)" >/dev/null 2>&1 &

select public.t036_esperar_bloqueo('t036_t2', 'el insert de la v2 de T1, una firma que no ha confirmado');
commit;
select public.t036_esperar_resultado('t036_t2');

\echo '--- Aserción 5 (T-036): T2 esperó, releyó el borrador vacío y murió en 23514 «No hay borrador vivo» ---'
do $$
declare
  v_fila public.t005_resultado%rowtype;
  v_n integer;
  v_filas integer;
begin
  select * into v_fila from public.t005_resultado where etiqueta = 't036_t2';
  if v_fila.exito or v_fila.sqlstate_code is distinct from '23514'
     or v_fila.mensaje not like '%No hay borrador vivo que firmar%' then
    raise exception 'FALLO: T2 debía morir con 23514 «No hay borrador vivo que firmar». exito=%, sqlstate=%, mensaje=%',
      v_fila.exito, v_fila.sqlstate_code, v_fila.mensaje;
  end if;
  select count(*) into v_n from public.notas_clinicas_versiones
   where nota_id = 'e0360006-0000-4000-8000-000000000001';
  if v_n <> 2 then
    raise exception 'FALLO: NOTA36 debía tener 2 versiones (la v1 de postgres y la v2 de T1) y tiene %', v_n;
  end if;
  select count(*) into v_filas from public.verificar_cadena_huellas(
    (select id from public.pacientes where profesional_id = '11111111-1111-4111-8111-111111111111'::uuid order by id limit 1));
  if v_filas <> 0 then
    raise exception 'FALLO: verificar_cadena_huellas() encontró % anomalía(s) tras la doble firma', v_filas;
  end if;
  raise notice 'OK: la segunda firma concurrente esperó el cerrojo y murió en 6.17; NOTA36 tiene 2 versiones y la cadena está sana (mensaje: %)', v_fila.mensaje;
end;
$$;

-- =========================================================================
-- E.4.2 · Guardar mientras se firma: la firma de X no sella el borrador Y (R2-H1)
-- =========================================================================
\echo ''
\echo '=== T-036 · E.4.2 · guardar mientras se firma ==='

insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id, fecha_sesion, borrador_contenido, borrador_autor_id) values
  (:NOTA36R, :'pconc_id', :EPICONC, :ANA, date '2026-10-02', '{"texto":"X","reservadas":""}', :ANA);
select borrador_abierta_en as ab_r from public.notas_clinicas where id = :NOTA36R \gset
select set_config('t036.ab_r', :'ab_r', false);

do $$
begin
  if not exists (select 1 from public.desbloqueos_historia d
                  where d.perfil_id = '11111111-1111-4111-8111-111111111111'::uuid
                    and d.revocado_en is null and d.caduca_en > now() + interval '5 minutes') then
    raise exception 'FALLO: el desbloqueo de Ana de §1.4 ya no está vigente: la carrera de E.4.2 no podría firmar';
  end if;
end;
$$;

-- El sobre que leyó firmarNota: cuerpo X, la apertura de la base, v1 sin motivo.
insert into public.t036_sobres (clave, contenido, creada_en)
select 'r1', public.t036_sobre_prueba(:NOTA36R, :ANA, c, '{"texto":"X"}'::jsonb, :'ab_r'::timestamptz, null), c
  from (select date_trunc('milliseconds', clock_timestamp()) as c) x;
select borrador_actualizado_en as testigo_r from public.notas_clinicas where id = :NOTA36R \gset

\echo '--- T1 guarda el borrador Y con el testigo leído y NO confirma ---'
begin;
set local role authenticated;
set local request.jwt.claims = :ANAJWT;
update public.notas_clinicas
   set borrador_contenido = '{"texto":"Y","reservadas":""}', borrador_autor_id = :ANA
 where id = :NOTA36R and paciente_id = :'pconc_id' and borrador_actualizado_en = :'testigo_r';
do $$
begin
  if not exists (select 1 from public.notas_clinicas
                  where id = 'e0360006-0000-4000-8000-000000000002'
                    and borrador_contenido ->> 'texto' = 'Y') then
    raise exception 'FALLO: T1 no guardó el borrador Y (el update de guardarBorrador no tocó la fila)';
  end if;
end;
$$;
reset role;

\echo '--- T2 firma el sobre de X en segundo plano: espera el cerrojo del guardado ---'
\! PGAPPNAME=t036_r psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select public.t036_firmar_en_segundo_plano('t036_r','r1',false)" >/dev/null 2>&1 &

select public.t036_esperar_bloqueo('t036_r', 'el guardado del borrador Y de T1, que no ha confirmado');
commit;
select public.t036_esperar_resultado('t036_r');

do $$
declare
  v_fila public.t005_resultado%rowtype;
  v_n integer;
  v_borr jsonb;
  v_ab timestamptz;
  v_filas integer;
begin
  select * into v_fila from public.t005_resultado where etiqueta = 't036_r';
  if v_fila.exito or v_fila.sqlstate_code is distinct from '23514'
     or v_fila.mensaje not like '%no es el borrador vigente%' then
    raise exception 'FALLO: la firma selló un borrador que otra sesión había cambiado (R2-H1): exito=%, sqlstate=%, mensaje=%',
      v_fila.exito, v_fila.sqlstate_code, v_fila.mensaje;
  end if;
  select count(*) into v_n from public.notas_clinicas_versiones
   where nota_id = 'e0360006-0000-4000-8000-000000000002';
  if v_n <> 0 then
    raise exception 'FALLO: NOTA36R tiene % versión(es) y no debía tener ninguna', v_n;
  end if;
  select n.borrador_contenido, n.borrador_abierta_en into v_borr, v_ab
    from public.notas_clinicas n where n.id = 'e0360006-0000-4000-8000-000000000002';
  if v_borr is null or v_borr ->> 'texto' is distinct from 'Y' then
    raise exception 'FALLO: el borrador de NOTA36R debía seguir vivo con texto Y y es %', v_borr;
  end if;
  if v_ab is distinct from current_setting('t036.ab_r')::timestamptz then
    raise exception 'FALLO: borrador_abierta_en cambió (%, era %): la causa del rechazo no puede ser 6.18', v_ab, current_setting('t036.ab_r');
  end if;
  select count(*) into v_filas from public.verificar_cadena_huellas(
    (select id from public.pacientes where profesional_id = '11111111-1111-4111-8111-111111111111'::uuid order by id limit 1));
  if v_filas <> 0 then
    raise exception 'FALLO: verificar_cadena_huellas() encontró % anomalía(s)', v_filas;
  end if;
  raise notice 'OK: la firma de X sobre el borrador Y murió en 23514 «no es el borrador vigente»; el guardado de T1 se conservó y la cadena sigue sana (mensaje: %)', v_fila.mensaje;
end;
$$;

-- =========================================================================
-- E.4.3 · Control mutante: sin 6.24 la misma carrera deja ganar a la firma
-- =========================================================================
\echo ''
\echo '=== T-036 · E.4.3 · control mutante de la carrera ==='

drop table if exists public.t036_original;
create table public.t036_original (definicion text not null);
do $$
declare
  v_def text := pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure);
  c_frag constant text := 'if not (v_mismo_texto and v_mismas_reservadas) then';
begin
  if (length(v_def) - length(replace(v_def, c_frag, ''))) <> length(c_frag) then
    raise exception 'FALLO: el fragmento de 6.24 a mutar no aparece exactamente una vez en fn_sellar_version_nota()';
  end if;
  insert into public.t036_original (definicion) values (v_def);
end;
$$;

-- r2: el sobre de lo vigente (Y); T1 guardará Z; con 6.24 apagada la firma de Y entra.
insert into public.t036_sobres (clave, contenido, creada_en)
select 'r2', public.t036_sobre_prueba(:NOTA36R, :ANA, c, '{"texto":"Y"}'::jsonb, :'ab_r'::timestamptz, null), c
  from (select date_trunc('milliseconds', clock_timestamp()) as c) x;
select borrador_actualizado_en as testigo_m from public.notas_clinicas where id = :NOTA36R \gset

begin;
set local role authenticated;
set local request.jwt.claims = :ANAJWT;
update public.notas_clinicas
   set borrador_contenido = '{"texto":"Z","reservadas":""}', borrador_autor_id = :ANA
 where id = :NOTA36R and paciente_id = :'pconc_id' and borrador_actualizado_en = :'testigo_m';
do $$
begin
  if not exists (select 1 from public.notas_clinicas
                  where id = 'e0360006-0000-4000-8000-000000000002'
                    and borrador_contenido ->> 'texto' = 'Z') then
    raise exception 'FALLO: T1 no guardó el borrador Z';
  end if;
end;
$$;
reset role;

\! PGAPPNAME=t036_m psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "select public.t036_firmar_en_segundo_plano('t036_m','r2',true)" >/dev/null 2>&1 &

select public.t036_esperar_bloqueo('t036_m', 'el guardado del borrador Z de T1, que no ha confirmado');
commit;
select public.t036_esperar_resultado('t036_m');

do $$
declare
  v_fila public.t005_resultado%rowtype;
  v_n integer;
  v_borr jsonb;
begin
  select * into v_fila from public.t005_resultado where etiqueta = 't036_m';
  if not v_fila.exito then
    raise exception 'FALLO: sin el cotejo 6.24 la firma tenía que ganar la carrera; si no la gana, la carrera de E.4.2 no prueba el cotejo: exito=%, sqlstate=%, mensaje=%',
      v_fila.exito, v_fila.sqlstate_code, v_fila.mensaje;
  end if;
  select count(*) into v_n from public.notas_clinicas_versiones
   where nota_id = 'e0360006-0000-4000-8000-000000000002';
  select n.borrador_contenido into v_borr from public.notas_clinicas n
   where n.id = 'e0360006-0000-4000-8000-000000000002';
  if v_n <> 0 or v_borr ->> 'texto' is distinct from 'Z' then
    raise exception 'FALLO: el sub-bloque debía deshacer la firma del mutante: versiones=%, borrador=%', v_n, v_borr;
  end if;
  if pg_get_functiondef('public.fn_sellar_version_nota()'::regprocedure)
       is distinct from (select definicion from public.t036_original) then
    raise exception 'FALLO: el mutante quedó confirmado; npx supabase db reset antes de nada';
  end if;
  raise notice 'OK: con 6.24 apagada la firma de Y sobre el borrador Z ganó la carrera (la prueba de E.4.2 sí prueba el cotejo); el mutante se deshizo con la firma';
end;
$$;

drop function public.t036_firmar_en_segundo_plano(text, text, boolean);
drop function public.t036_esperar_bloqueo(text, text);
drop function public.t036_esperar_resultado(text);
drop function public.t036_sobre_prueba(uuid, uuid, timestamptz, jsonb, timestamptz, text);
drop table public.t036_sobres;
drop table public.t036_original;


drop function public.t005_sobre_prueba(uuid, uuid, timestamptz, jsonb, text);
drop table public.t005_resultado;

\echo '=== T-005 · Concurrencia: completa ==='
