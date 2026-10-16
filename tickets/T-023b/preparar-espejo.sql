-- T-023b · CA15 · Prepara tres facturas del espejo para el guion manual de 360 px (sin tocar la interfaz de alta).
--
--   docker exec -i supabase_db_Psicogestion psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v sufijo=A1 -f - \
--     < tickets/T-023b/preparar-espejo.sql
--
-- Sobre la base sembrada (`npm run seed`). `sufijo` evita chocar si se repite. Dos facturas de Lucía Márquez
-- (de Ana, centro Madrid) y una de Sofía Nieto (de Ana, también del centro Madrid, el del técnico), más
-- un cobro suelto de 25,00 € para Lucía, que es lo que ofrece «Asignar un cobro». Todo queda (solo adición).

\set ON_ERROR_STOP 1
\if :{?sufijo}
\else
\set sufijo 'X'
\endif
\set ADM '\'b0080001-0000-4000-8000-000000000001\''

begin;

with p as (
  select pa.id, pa.profesional_id, row_number() over (order by pa.apellidos) as n
    from public.pacientes pa
   where (pa.nombre = 'Lucía' and pa.apellidos = 'Márquez')
      or (pa.nombre = 'Sofía' and pa.apellidos = 'Nieto')
),
f as (
  select p.id as paciente_id, p.profesional_id, g as k
    from p, generate_series(1, 2) as g
   where (p.n = 1) or g = 1
),
b as (
  insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
  select gen_random_uuid(), f.paciente_id, f.profesional_id, :ADM::uuid from f
  returning id, paciente_id
),
numerado as (
  select b.id as borrador_id, b.paciente_id, row_number() over () as n from b
)
insert into public.facturas_espejo
  (id, borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion,
   base, cuota_iva, total, url_proveedor)
select gen_random_uuid(), n.borrador_id, n.paciente_id, 'holded',
       'MANUAL-' || :'sufijo' || '-' || n.n, 'M-' || :'sufijo' || '-' || n.n,
       current_date, 60.00, 0.00, 60.00, 'https://programa.example/doc/manual-' || :'sufijo' || '-' || n.n
  from numerado n;

insert into public.cobros (paciente_id, importe, fecha, forma_pago, registrado_por, referencia)
select pa.id, 25.00, current_date, 'efectivo', :ADM::uuid, 'MANUAL-' || :'sufijo'
  from public.pacientes pa where pa.nombre = 'Lucía' and pa.apellidos = 'Márquez';

select numero, total, paciente_id from public.facturas_espejo where proveedor_documento_id like 'MANUAL-' || :'sufijo' || '-%' order by numero;

commit;
