-- T-023b · CA10 · Rendimiento de lo que lee la pantalla de Facturación con volumen real.
--
-- Ejecutar sobre la base sembrada (`npx supabase db reset && npm run seed`), como postgres, DENTRO de una
-- transacción que se deshace (nada de esto queda):
--
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
--     < tickets/T-023b/ca10-rendimiento.sql > tickets/T-023b/ca10-explain.txt
--
-- Volumen: 200 pacientes (CA y CB), 5 000 citas realizadas, 300 facturas del espejo (cada una con su
-- borrador), 2 000 cobros, 300 enlazados al registrarse y 300 asignados después.
-- Umbrales (medidos con clock_timestamp() y que hacen fallar el guion si se pasan), para ADM y TEC1:
--   pendiente_paciente completo  <= 500 ms
--   una página del listado       <= 150 ms (también con p_forma_pago = 'efectivo')
--   cobros_asignables            <=  50 ms

\set ON_ERROR_STOP 1
\set ADM '\'b0080001-0000-4000-8000-000000000001\''
\set TEC1 '\'b0080001-0000-4000-8000-000000000004\''
\set CA '\'c0080001-0000-4000-8000-00000000000a\''
\set CB '\'c0080001-0000-4000-8000-00000000000b\''
\set ANA '\'11111111-1111-4111-8111-111111111111\''
\set BRUNO '\'22222222-2222-4222-8222-222222222222\''
\set TIPO '\'e0280001-0000-4000-8000-000000000001\''

begin;

\echo '--- datos: pacientes, citas realizadas, facturas del espejo, cobros, enlazados y asignados ---'

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id)
select ('a0ca1000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'CA10 Paciente ' || n, 'Volumen ' || n,
       case when n % 2 = 0 then :ANA::uuid else :BRUNO::uuid end,
       case when n % 2 = 0 then :CA::uuid else :CB::uuid end
  from generate_series(1, 200) as n;

-- Los pacientes pares son de Ana y del centro A (el del técnico TEC1); los impares, de Bruno y del B.
insert into public.citas (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria)
select ('a0ca2000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       p.id, p.profesional_id, p.centro_id, :TIPO::uuid,
       timestamptz '2026-01-05 08:00+01' + (n * interval '1 hour'),
       timestamptz '2026-01-05 08:00+01' + (n * interval '1 hour') + interval '50 minutes',
       'Europe/Madrid'
  from generate_series(1, 5000) as n
  join public.pacientes p on p.id = ('a0ca1000-0000-4000-8000-' || lpad((((n - 1) % 200) + 1)::text, 12, '0'))::uuid;

update public.citas set estado = 'realizada'
 where id::text like 'a0ca2000-%';

insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
select ('a0ca3000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       p.id, p.profesional_id, :ADM::uuid
  from generate_series(1, 300) as n
  join public.pacientes p on p.id = ('a0ca1000-0000-4000-8000-' || lpad((((n - 1) % 200) + 1)::text, 12, '0'))::uuid;

insert into public.facturas_espejo
  (id, borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion,
   base, cuota_iva, total, url_proveedor)
select ('a0ca4000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0ca3000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0ca1000-0000-4000-8000-' || lpad((((n - 1) % 200) + 1)::text, 12, '0'))::uuid,
       'holded', 'CA10-' || n, 'CA10-' || lpad(n::text, 4, '0'),
       current_date - (n % 80), 60.00, 0.00, 60.00, 'https://programa.example/doc/ca10-' || n
  from generate_series(1, 300) as n;

-- Cobros 1-600: el paciente de la factura k = ((n-1) % 300) + 1, para que n y n+300 compartan paciente.
-- Cobros 1-300 llevan factura_espejo_id (enlazados al registrarse); 301-600 se asignan después.
insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por, factura_espejo_id)
select ('a0ca5000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('a0ca1000-0000-4000-8000-' ||
          lpad((case when n <= 600 then (((n - 1) % 300) % 200) + 1 else ((n - 1) % 200) + 1 end)::text, 12, '0'))::uuid,
       10 + (n % 50),
       current_date - (n % 60),
       (array['efectivo','transferencia','tarjeta','bizum','otro'])[(n % 5) + 1]::public.forma_pago,
       :ADM::uuid,
       case when n <= 300 then ('a0ca4000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid end
  from generate_series(1, 2000) as n;

insert into public.cobros_facturas (cobro_id, factura_espejo_id, creada_por)
select ('a0ca5000-0000-4000-8000-' || lpad((n + 300)::text, 12, '0'))::uuid,
       ('a0ca4000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       :ADM::uuid
  from generate_series(1, 300) as n;

analyze public.cobros;
analyze public.cobros_facturas;
analyze public.citas;
analyze public.facturas_espejo;

select (select count(*) from public.pacientes where nombre like 'CA10 %') as pacientes,
       (select count(*) from public.citas where id::text like 'a0ca2000-%' and estado = 'realizada') as citas_realizadas,
       (select count(*) from public.facturas_espejo where proveedor_documento_id like 'CA10-%') as facturas,
       (select count(*) from public.cobros where id::text like 'a0ca5000-%') as cobros,
       (select count(*) from public.cobros_por_factura) as cobros_en_facturas;

-- Una factura con muchos cobros sueltos de su paciente para cobros_asignables.
select id::text as "FACT" from public.facturas_espejo where proveedor_documento_id = 'CA10-2' \gset

create function pg_temp.medir(p_rol text) returns void language plpgsql as $$
declare
  t0 timestamptz;
  v_ms numeric;
  v_fact uuid := (select e.id from public.facturas_espejo e where e.proveedor_documento_id = 'CA10-2');
begin
  t0 := clock_timestamp();
  perform count(*) from public.pendiente_paciente;
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice '% · pendiente_paciente completo: % ms (umbral 500)', p_rol, round(v_ms, 1);
  if v_ms > 500 then raise exception 'CA10: pendiente_paciente % ms > 500 (%)', round(v_ms, 1), p_rol; end if;

  t0 := clock_timestamp();
  perform count(*) from public.listado_facturas_espejo(current_date - 90, current_date);
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice '% · listado página 1: % ms (umbral 150)', p_rol, round(v_ms, 1);
  if v_ms > 150 then raise exception 'CA10: listado % ms > 150 (%)', round(v_ms, 1), p_rol; end if;

  t0 := clock_timestamp();
  perform count(*) from public.listado_facturas_espejo(current_date - 90, current_date, 'efectivo');
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice '% · listado con forma efectivo: % ms (umbral 150)', p_rol, round(v_ms, 1);
  if v_ms > 150 then raise exception 'CA10: listado efectivo % ms > 150 (%)', round(v_ms, 1), p_rol; end if;

  t0 := clock_timestamp();
  perform count(*) from public.cobros_asignables(v_fact);
  v_ms := extract(epoch from clock_timestamp() - t0) * 1000;
  raise notice '% · cobros_asignables: % ms (umbral 50)', p_rol, round(v_ms, 1);
  if v_ms > 50 then raise exception 'CA10: cobros_asignables % ms > 50 (%)', round(v_ms, 1), p_rol; end if;
end;
$$;

-- ---------------------------------------------------------------------------
\echo '=== ADMINISTRADOR ==='
select set_config('request.jwt.claims', json_build_object('sub', :ADM::text, 'role', 'authenticated')::text, true);
set local role authenticated;

explain (analyze, buffers) select * from public.pendiente_paciente;
explain (analyze, buffers) select * from public.listado_facturas_espejo(current_date - 90, current_date);
explain (analyze, buffers) select * from public.listado_facturas_espejo(current_date - 90, current_date, 'efectivo');
explain (analyze, buffers) select * from public.cobros_asignables(:'FACT'::uuid);
select pg_temp.medir('ADM');

reset role;
-- ---------------------------------------------------------------------------
\echo '=== TECNICO (TEC1, centro A) ==='
select set_config('request.jwt.claims', json_build_object('sub', :TEC1::text, 'role', 'authenticated')::text, true);
set local role authenticated;

explain (analyze, buffers) select * from public.pendiente_paciente;
explain (analyze, buffers) select * from public.listado_facturas_espejo(current_date - 90, current_date);
explain (analyze, buffers) select * from public.listado_facturas_espejo(current_date - 90, current_date, 'efectivo');
explain (analyze, buffers) select * from public.cobros_asignables(:'FACT'::uuid);
select pg_temp.medir('TEC1');

reset role;
rollback;
