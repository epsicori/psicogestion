-- T-023b · CA4 · Dos escrituras CONCURRENTES sobre cobros de una misma factura del espejo.
--
-- No cabe en el banco de RLS (una transacción no se solapa consigo misma): necesita DOS CONEXIONES y datos
-- CONFIRMADOS. Lo orquesta scripts/t023b-concurrencia.mjs, que llama a este fichero una vez por fase
-- (`-v fase_fijar=1`, `-v fase_cuenta=1`) y lanza entre fase y fase los procesos psql solapados.
--
-- CONFIRMA filas y SUS FILAS QUEDAN (cobros, cobros_facturas y facturas_espejo son de solo adición). NO ES
-- IDEMPOTENTE: repetirla sin `npx supabase db reset` choca con los UUID fijos, y es la señal correcta.
--
-- Parte de la siembra mínima (`npm run seed`): administrador b0080001-…-001 y la paciente Lucía
-- d0080001-…-001. La preparación es como `postgres`: el borrador y la factura del espejo son la entrada del
-- programa, no lo que se prueba. (H27: el disparador de borradores de T-046 solo actúa para
-- authenticated/anon; un insert de `postgres` no lo ejerce.)
--
-- Datos de la fase `fijar`:
--   FACTURA     · espejo de Lucía, 60,00
--   COB_LIGADO  · +60,00 enlazado al registrarse (cobros.factura_espejo_id)
--   COB_SUELTO  · +25,00 sin factura  (carrera 1: dos asignaciones del mismo cobro)
--   DEV_1, DEV_2· −40,00 sin factura  (carrera 2: dos devoluciones sobre una factura con 60 cobrados)

\set ON_ERROR_STOP 1
\set ADM '\'b0080001-0000-4000-8000-000000000001\''
\set LUCIA '\'d0080001-0000-4000-8000-000000000001\''
\set BORR '\'c023b001-0000-4000-8000-000000000001\''
\set FACTURA '\'c023b001-0000-4000-8000-000000000002\''
\set COB_LIGADO '\'c023b001-0000-4000-8000-000000000003\''
\set COB_SUELTO '\'c023b001-0000-4000-8000-000000000004\''
\set DEV_1 '\'c023b001-0000-4000-8000-000000000005\''
\set DEV_2 '\'c023b001-0000-4000-8000-000000000006\''

\if :{?fase_fijar}
\echo '--- fijación confirmada: factura del espejo de Lucía, un cobro enlazado, uno suelto y dos devoluciones ---'
select count(*) = 1 as hay_lucia from public.pacientes where id = :LUCIA \gset
\if :hay_lucia
\else
do $$ begin raise exception 'FALLO: falta la paciente Lucía de la siembra (¿falta npm run seed?)'; end $$;
\endif

insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por)
select :BORR, p.id, p.profesional_id, :ADM from public.pacientes p where p.id = :LUCIA;
insert into public.facturas_espejo
  (id, borrador_id, paciente_id, proveedor, proveedor_documento_id, numero, fecha_expedicion,
   base, cuota_iva, total, url_proveedor)
values (:FACTURA, :BORR, :LUCIA, 'holded', 'DOC-T023B-CONC', 'F-T023B-0001', current_date,
        60.00, 0.00, 60.00, 'https://programa.example/doc/t023b');

insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por, motivo, factura_espejo_id) values
  (:COB_LIGADO, :LUCIA,  60.00, current_date - 1, 'efectivo', :ADM, null, :FACTURA),
  (:COB_SUELTO, :LUCIA,  25.00, current_date - 1, 'efectivo', :ADM, null, null),
  (:DEV_1,      :LUCIA, -40.00, current_date - 1, 'efectivo', :ADM, 'devolución de la prueba 1', null),
  (:DEV_2,      :LUCIA, -40.00, current_date - 1, 'efectivo', :ADM, 'devolución de la prueba 2', null);

select (select count(*) from public.cobros_por_factura where factura_espejo_id = :FACTURA) = 1 as fijacion_ok \gset
\if :fijacion_ok
\echo 'OK: la factura parte con un solo cobro (el +60 enlazado al registrar)'
\else
do $$ begin raise exception 'FALLO: la fijación no quedó como se esperaba'; end $$;
\endif
\endif

-- Estado tras las carreras: `CUENTA|<asignaciones del suelto>|<asignaciones de devoluciones>|<suma de la factura>`.
\if :{?fase_cuenta}
select 'CUENTA|'
    || (select count(*) from public.cobros_facturas where cobro_id = :COB_SUELTO) || '|'
    || (select count(*) from public.cobros_facturas where cobro_id in (:DEV_1, :DEV_2)) || '|'
    || (select coalesce(sum(importe), 0) from public.cobros_por_factura where factura_espejo_id = :FACTURA) as linea;
\endif
