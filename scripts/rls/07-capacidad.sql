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

-- ---------------------------------------------------------------------------------------
-- T-032 (ADR-028, §1.9 del diseño): el «contacto de emergencia» (alcance solo_contacto)
-- ni consiente ni firma. La fila se da de alta AQUÍ, dentro de este mismo fichero — no en
-- 01-fijacion.sql, que es territorio ajeno a este ticket (diseño §6) — como PRO1, el
-- profesional asignado al menor.
-- ---------------------------------------------------------------------------------------
call pg_temp.como(:PRO1);
insert into public.representantes_paciente (id, paciente_id, nombre, apellidos, tipo, alcance, vigente_desde) values
  ('a0030002-0000-4000-8000-000000000002', :PMENOR, 'Tío', 'Contacto', 'guardador_de_hecho', 'solo_contacto', current_date - interval '15 years' - interval '1 month');
call pg_temp.reset_sesion();

-- capacidad_consentimiento() solo filtra por alcance = 'patria_potestad' (verificado en la
-- migración base): con el contacto de emergencia YA EN LA TABLA, sigue resolviendo al
-- representante de patria potestad y no lo confunde con el contacto. Sin esta fila de
-- solo_contacto presente, la aserción de arriba no distinguiría «lo excluye la condición»
-- de «no había nada más que devolver» (pruebas.md).
select pg_temp.assert(
  (select quien from public.capacidad_consentimiento(:PMENOR, current_date)) = 'representante'
  and (select representante_id from public.capacidad_consentimiento(:PMENOR, current_date)) = :REPMENOR::uuid,
  'Con un contacto de emergencia (solo_contacto) TAMBIÉN en la tabla, capacidad_consentimiento() sigue resolviendo al representante de patria potestad, no al contacto'
);

-- El contacto de emergencia no puede ser firmante: 23514 (coherencia, no permiso — el
-- disparador fn_firmante_no_es_solo_contacto lo dice explícito). Consentimiento PROPIO de
-- este bloque (no el de 01-fijacion.sql, que 12-resto-de-tablas.sql cuenta con `= 1` fila
-- de firmantes: insertar ahí rompería esa cuenta por un motivo ajeno a lo que prueba).
call pg_temp.como(:PRO1);
insert into public.consentimientos (id, paciente_id, tipo, texto_firmado, texto_version, otorgado_en, creado_por)
values ('a0030001-0000-4000-8000-000000000099', :PMENOR, 'asistencial', 'Texto firmado T-032', 'v1', now(), :PRO1);

select pg_temp.assert_lanza_codigo(
  format(
    'insert into public.consentimiento_firmantes (consentimiento_id, nombre_completo, representante_id) values (%L, %L, %L)',
    'a0030001-0000-4000-8000-000000000099', 'Tío Contacto', 'a0030002-0000-4000-8000-000000000002'
  ),
  '23514',
  'Un representante de alcance solo_contacto NO puede firmar el consentimiento del menor: fn_firmante_no_es_solo_contacto'
);
-- Gemela positiva: el representante de patria potestad SÍ firma el mismo consentimiento —
-- el rechazo de arriba es por el alcance, no por la tabla en general.
insert into public.consentimiento_firmantes (consentimiento_id, nombre_completo, representante_id)
values ('a0030001-0000-4000-8000-000000000099', 'Dora Representante', :REPMENOR);
select pg_temp.assert(
  pg_temp.contar(format(
    'select * from public.consentimiento_firmantes where consentimiento_id = %L',
    'a0030001-0000-4000-8000-000000000099'
  )) = 1,
  'GEMELA: el representante de patria potestad SÍ puede firmar el mismo consentimiento — el rechazo de arriba es por el alcance, no por la tabla en general'
);
call pg_temp.reset_sesion();

-- M4 de la revisión: la gemela del disparador anterior sobre representantes_paciente. Sin
-- ella, bastaba con bajar a solo_contacto a quien ya firmó. REPMENOR acaba de firmar el
-- consentimiento de arriba: pasarlo a solo_contacto debe rechazarse con 23514. PRO1 es el
-- profesional asignado al menor y SÍ puede actualizar la fila (representantes_paciente_
-- modificacion): el rechazo no puede ser un UPDATE 0 de la RLS (pruebas.md).
call pg_temp.como(:PRO1);
select pg_temp.assert_lanza_codigo(
  format(
    'update public.representantes_paciente set alcance = %L where id = %L',
    'solo_contacto', :REPMENOR
  ),
  '23514',
  'Un representante que YA firma un consentimiento no puede pasar a solo_contacto: fn_solo_contacto_sin_firmas'
);
-- Gemela positiva, mismo perfil y misma sentencia salvo el representante: uno de custodia
-- SIN ninguna firma sí puede pasar a solo_contacto. Si el disparador rechazara cualquier
-- cambio a solo_contacto, esta caería.
insert into public.representantes_paciente (id, paciente_id, nombre, apellidos, tipo, alcance, vigente_desde) values
  ('a0030002-0000-4000-8000-000000000003', :PMENOR, 'Abuela', 'Sin Firmas', 'guardador_de_hecho', 'custodia', current_date - interval '1 year');
update public.representantes_paciente set alcance = 'solo_contacto'
  where id = 'a0030002-0000-4000-8000-000000000003';
select pg_temp.assert(
  (select alcance from public.representantes_paciente where id = 'a0030002-0000-4000-8000-000000000003')
    = 'solo_contacto'::public.alcance_representacion,
  'GEMELA: un representante sin firmas SÍ puede pasar a solo_contacto — el rechazo de arriba es por la firma, no por el cambio de alcance'
);
-- Y el representante que firma sigue siendo de patria potestad (el rechazo no dejó nada a medias).
select pg_temp.assert(
  (select alcance from public.representantes_paciente where id = :REPMENOR)
    = 'patria_potestad'::public.alcance_representacion,
  'REPMENOR sigue con alcance patria_potestad tras el rechazo'
);
call pg_temp.reset_sesion();

\echo '07-capacidad: completa.'
