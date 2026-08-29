-- T-003 · Batería del vínculo de fusión (ADR-031). PFUS (de PRO1) ya está fusionado en P2
-- (de PRO2) desde la fijación. `fn_normalizar_fusion_paciente()` garantiza un solo salto
-- SIEMPRE, incluso si se encadenara una fusión sobre otra: aquí se comprueba el efecto
-- visible por RLS, no la función en sí —eso es de T-001—.

\echo ''
\echo '=== 05-vinculo ==='

-- El profesional del ABSORBIDO (PRO1) SIGUE viendo su fila, marcada como fusionada.
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :PFUS)) = 1,
  'PRO1 (profesional del absorbido PFUS) sigue viendo la fila fusionada — nada se repunta');
call pg_temp.reset_sesion();

-- El profesional del SUPERVIVIENTE (PRO2) alcanza el absorbido: el salto AÑADE un camino.
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar(format('select * from public.pacientes where id = %L', :PFUS)) = 1,
  'PRO2 (profesional del superviviente P2) TAMBIÉN alcanza PFUS — el salto añade, no sustituye');
call pg_temp.reset_sesion();

-- Encadenar una segunda fusión (PFUS2 -> PFUS, que ya apunta a P2) debe normalizarse a un
-- SOLO salto: PFUS2 queda apuntando a P2 directamente, nunca a PFUS.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id, fusionado_en, fusionado_el) values
  ('d0030001-0000-4000-8000-000000000006', 'Gema', 'Encadenada', :PRO1, :CA, :PFUS, now());

select pg_temp.assert(
  (select fusionado_en from public.pacientes where id = 'd0030001-0000-4000-8000-000000000006') = :P2,
  'La fusión encadenada se normaliza a UN SOLO SALTO: apunta a P2, nunca a PFUS'
);

-- Y por tanto es visible en un único salto también por RLS para PRO2.
call pg_temp.como(:PRO2);
select pg_temp.assert(pg_temp.contar('select * from public.pacientes where id = ''d0030001-0000-4000-8000-000000000006''') = 1,
  'PRO2 alcanza la fusión encadenada en un solo salto, vía RLS');
call pg_temp.reset_sesion();

-- Un ciclo (P2 -> P2, indirectamente vía PFUS) debe rechazarse, no colgarse en un bucle.
select pg_temp.assert_lanza(
  format('update public.pacientes set fusionado_en = %L, fusionado_el = now() where id = %L', :PFUS, :P2),
  'Fusionar P2 en su propio absorbido (PFUS, que apunta a P2) debe detectarse como ciclo y lanzar'
);

\echo '05-vinculo: completa.'
