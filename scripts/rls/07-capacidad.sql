-- T-003 · Batería de capacidad (ADR-028). `capacidad_consentimiento(paciente, fecha)`
-- evaluada en TRES FECHAS sobre la MISMA fila — 11, 15 y 16 años—, sin ninguna bandera
-- almacenada: la capacidad se calcula, no se guarda.

\echo ''
\echo '=== 07-capacidad ==='

-- PMENOR nació hace 15 años (fijación). Se evalúa a los 11, a los 15 y a los 16.
select pg_temp.assert(
  (select quien from public.capacidad_consentimiento(:PMENOR, (current_date - interval '15 years' + interval '11 years')::date)) = 'representante',
  'A los 11 años, consiente el representante (menor de 12, sin audiencia)'
);
select pg_temp.assert(
  (select requiere_audiencia_menor from public.capacidad_consentimiento(:PMENOR, (current_date - interval '15 years' + interval '11 years')::date)) = false,
  'A los 11 años, NO se exige oír al menor (art. 9.3: de 12 a 15)'
);

select pg_temp.assert(
  (select quien from public.capacidad_consentimiento(:PMENOR, current_date)) = 'representante',
  'A los 15 años (hoy), consiente el representante'
);
select pg_temp.assert(
  (select requiere_audiencia_menor from public.capacidad_consentimiento(:PMENOR, current_date)) = true,
  'A los 15 años, SÍ se exige oír al menor (art. 9.3: de 12 a 15)'
);

select pg_temp.assert(
  (select quien from public.capacidad_consentimiento(:PMENOR, (current_date + interval '1 year')::date)) = 'paciente',
  'A los 16 años, consiente el propio paciente (art. 9.4)'
);

-- Ninguna fila de `pacientes` ni `consentimientos` guarda esta capacidad: se recalcula
-- cada vez. Lo que sí es dato es la fecha de nacimiento, y de ahí sale todo.
select pg_temp.assert(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name in ('pacientes', 'consentimientos')
      and column_name ilike '%capacidad%'
  ),
  'Ninguna columna almacena la capacidad: es siempre calculada'
);

\echo '07-capacidad: completa.'
