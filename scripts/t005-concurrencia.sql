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

insert into public.notas_clinicas (id, paciente_id, autor_id) values
  (:NOTA1, :'pconc_id', :ANA),
  (:NOTA2, :'pconc_id', :ANA);

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
create or replace function public.t005_sobre_prueba(
  p_autor_id  uuid,
  p_creada_en timestamptz,
  p_cuerpo    jsonb
) returns text
language sql
as $$
  select
    '{' ||
    '"abierta_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"anotaciones_reservadas":null,' ||
    '"autor_id":"' || lower(p_autor_id::text) || '",' ||
    '"cita_id":null,' ||
    '"creada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"cuerpo":' || p_cuerpo::text || ',' ||
    '"esquema_version":2,' ||
    '"firmada_en":' || to_json(to_char(p_creada_en at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))::text || ',' ||
    '"margen_sesion_minutos":null,' ||
    '"motivo_cambio":null,' ||
    '"redactada_en_sesion":false' ||
    '}';
$$;

\echo '--- T1 abre transacción y firma NOTA1: toma el cerrojo consultivo del paciente ---'
begin;
insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values
  (:NOTA1, '{"t":"conc-a"}',
   public.t005_sobre_prueba(:ANA, timestamptz '2026-01-01 00:00:00+00', '{"t":"conc-a"}'::jsonb),
   :ANA, timestamptz '2026-01-01 00:00:00+00');

-- `\!` NO interpola variables de psql: la segunda conexión lleva los UUID literales, no
-- `:NOTA2`/`:ANA`. El `do $$ … $$` de dentro atrapa el resultado (éxito o SQLSTATE) y lo
-- deja en `t005_resultado`, visible para la primera conexión en cuanto esta segunda
-- conexión termine (son transacciones separadas). Los `$` del `do $do$ … $do$` van escapados
-- (`\$do\$`) porque esta línea pasa por el shell ANTES de llegar al psql interno: sin
-- escapar, `/bin/sh` intentaría expandir `$do` como variable de entorno (vacía) y rompería
-- la etiqueta de la comilla de dólar.
\echo '--- T2 (segunda conexión), con T1 todavía sin commit: debe morir con 55P03 lock_not_available ---'
\! psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "set lock_timeout='2s'; do \$do\$ begin begin insert into public.notas_clinicas_versiones (nota_id, cuerpo, contenido_canonico, autor_id, creada_en) values ('e0050002-0000-4000-8000-000000000002', '{\"t\":\"conc-b\"}', public.t005_sobre_prueba('11111111-1111-4111-8111-111111111111'::uuid, timestamptz '2026-01-01 00:00:01+00', '{\"t\":\"conc-b\"}'::jsonb), '11111111-1111-4111-8111-111111111111', timestamptz '2026-01-01 00:00:01+00'); insert into public.t005_resultado values ('t2_insert', true, null, 'insertó sin esperar (inesperado si T1 seguia sin commit)'); exception when others then insert into public.t005_resultado values ('t2_insert', false, sqlstate, sqlerrm); end; end \$do\$;"

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
   public.t005_sobre_prueba(:ANA, timestamptz '2026-01-01 00:00:02+00', '{"t":"conc-b"}'::jsonb),
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

drop function public.t005_sobre_prueba(uuid, timestamptz, jsonb);
drop table public.t005_resultado;

\echo '=== T-005 · Concurrencia: completa ==='
