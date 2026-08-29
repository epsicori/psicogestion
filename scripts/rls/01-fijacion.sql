-- T-003 · Fijación de datos del banco. Independiente del seed de T-008 (que aún no existe)
-- y del de T-000/seed.sql: este banco fija todo lo que necesita, no depende de nada externo.

\set ADM     '\'b0030001-0000-4000-8000-000000000001\''
\set PRO1    '\'b0030001-0000-4000-8000-000000000002\''
\set PRO2    '\'b0030001-0000-4000-8000-000000000003\''
\set TEC1    '\'b0030001-0000-4000-8000-000000000004\''
\set TEC2    '\'b0030001-0000-4000-8000-000000000005\''
\set PROBAJA '\'b0030001-0000-4000-8000-000000000006\''

\set CA '\'c0030001-0000-4000-8000-00000000000a\''
\set CB '\'c0030001-0000-4000-8000-00000000000b\''

\set P1     '\'d0030001-0000-4000-8000-000000000001\''
\set P2     '\'d0030001-0000-4000-8000-000000000002\''
\set PMENOR '\'d0030001-0000-4000-8000-000000000003\''
\set PFUS   '\'d0030001-0000-4000-8000-000000000004\''
\set PBAJA  '\'d0030001-0000-4000-8000-000000000005\''

\set EPI '\'e0030001-0000-4000-8000-000000000001\''

\set NCONJ '\'f0030001-0000-4000-8000-000000000001\''
\set NIND  '\'f0030001-0000-4000-8000-000000000002\''
\set NCORR '\'f0030001-0000-4000-8000-000000000003\''

\echo '=== 01-fijación ==='

insert into public.organizacion (razon_social, nif) values ('Banco RLS SL', 'B00300001');

insert into public.centros (id, nombre) values
  (:CA, 'Centro A'),
  (:CB, 'Centro B');

-- Los perfiles los crea el disparador `crear_perfil_de_usuario`. PROBAJA nace CON centro
-- (para que el check del técnico no interfiera si algún día cambia de rol) pero se usa
-- solo como profesional.
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :ADM, 'authenticated', 'authenticated', 'adm@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"rol":"administrador","nombre_completo":"Admin RLS"}'::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO1, 'authenticated', 'authenticated', 'pro1@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional Uno","centro_id":"' || :CA || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO2, 'authenticated', 'authenticated', 'pro2@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional Dos","centro_id":"' || :CB || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :TEC1, 'authenticated', 'authenticated', 'tec1@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"tecnico_administrativo","nombre_completo":"Técnico Uno","centro_id":"' || :CA || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :TEC2, 'authenticated', 'authenticated', 'tec2@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"tecnico_administrativo","nombre_completo":"Técnico Dos","centro_id":"' || :CB || '"}')::jsonb, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PROBAJA, 'authenticated', 'authenticated', 'probaja@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional De Baja","centro_id":"' || :CA || '"}')::jsonb, '', '', '', '');

select pg_temp.assert(
  (select count(*) from public.perfiles where id in (:ADM,:PRO1,:PRO2,:TEC1,:TEC2,:PROBAJA)) = 6,
  'El disparador crear_perfil_de_usuario debía crear seis perfiles'
);

-- P1: organización, centro A, de PRO1. P2: profesional, centro B, de PRO2.
insert into public.pacientes (id, nombre, apellidos, profesional_id, titularidad, centro_id) values
  (:P1, 'Ana', 'Uno',   :PRO1, 'organizacion', :CA),
  (:P2, 'Beto', 'Dos',  :PRO2, 'profesional',  :CB);

-- Menor de 15 años (ADR-028): representante con alcance total.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id, fecha_nacimiento) values
  (:PMENOR, 'Cris', 'Menor', :PRO1, :CA, (current_date - interval '15 years')::date);

-- Vigente DESDE EL NACIMIENTO del menor: la batería de capacidad (07) evalúa
-- capacidad_consentimiento() a los 11, 15 y 16 años, y las tres fechas caen en el pasado
-- respecto a hoy — el representante tiene que estar vigente en las tres.
insert into public.representantes_paciente (paciente_id, nombre, apellidos, tipo, alcance, vigente_desde) values
  (:PMENOR, 'Dora', 'Representante', 'progenitor', 'patria_potestad', current_date - interval '15 years' - interval '1 month');

-- PFUS: paciente de PRO1 fusionado en P2 (cuyo profesional es PRO2). Se fija en el propio
-- insert porque el disparador de columnas reservadas prohíbe el cambio a quien no es admin.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id, fusionado_en, fusionado_el) values
  (:PFUS, 'Elia', 'Fusionada', :PRO1, :CA, :P2, now());

-- PBAJA: paciente de un profesional que se pondrá en baja MÁS ABAJO.
insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:PBAJA, 'Fran', 'DeBaja', :PROBAJA, :CA);

-- Episodio conjunto de PRO1 sobre P1 y P2 (ADR-030).
insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id, modalidad_relacional, motivo_consulta) values
  (:EPI, :P1, :PRO1, :CA, 'pareja', 'Terapia de pareja');
insert into public.episodio_participantes (episodio_id, paciente_id, papel) values
  (:EPI, :P1, 'miembro'),
  (:EPI, :P2, 'miembro');

-- Dos notas en el mismo episodio: conjunta e individual (control del criterio 9 de T-002).
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  (:NCONJ, :P1, :EPI, :PRO1),
  (:NIND,  :P1, :EPI, :PRO1);
insert into public.notas_clinicas_versiones
  (nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, alcance, autor_id) values
  (:NCONJ, 1, '{"t":"conjunta"}',   '{"t":"conjunta"}',   sha256('nconj'::bytea), sha256(''::bytea), 'conjunta',   :PRO1),
  (:NIND,  1, '{"t":"individual"}', '{"t":"individual"}', sha256('nind'::bytea),  sha256(''::bytea), 'individual', :PRO1);

-- Nota con dos versiones encadenadas (corrección) — para la batería de identificación NO,
-- pero sirve de fijación positiva de "notas con historial" si algún ticket futuro la usa.
insert into public.notas_clinicas (id, paciente_id, autor_id) values (:NCORR, :P2, :PRO2);
insert into public.notas_clinicas_versiones
  (nota_id, numero_version, cuerpo, contenido_canonico, huella, huella_anterior, motivo_cambio, autor_id) values
  (:NCORR, 1, '{"t":"v1"}', '{"t":"v1"}', sha256('ncorr1'::bytea), sha256(''::bytea), null, :PRO2),
  (:NCORR, 2, '{"t":"v2"}', '{"t":"v2"}', sha256('ncorr2'::bytea), sha256('ncorr1'::bytea), 'Corrección de fecha', :PRO2);

-- Un borrador sin firmar, sobre P2.
update public.notas_clinicas set borrador_contenido = '{"t":"Apunte sin firmar"}', borrador_autor_id = :PRO2, borrador_actualizado_en = now()
where id = :NCORR;

-- alertas_documentacion: solo tiene DOS estados reales (abierta/resuelta; comprobado en el
-- catálogo, no supuesto). Se fija una abierta reciente, una abierta añeja, una resuelta y
-- una del profesional que se pondrá en baja — las cuatro filas que la batería de baja y la
-- de accesos necesitan.
insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id) values
  (:P1, :PRO1, :CA, 'nota_sin_firmar', 'notas_clinicas', :NIND),
  (:P2, :PRO2, :CB, 'nota_sin_firmar', 'notas_clinicas', :NCORR),
  (:PBAJA, :PROBAJA, :CA, 'nota_sin_firmar', 'notas_clinicas', :NCONJ);

insert into public.alertas_documentacion (paciente_id, profesional_id, centro_id, tipo, origen_tabla, origen_id, estado, resuelta_en) values
  (:P1, :PRO1, :CA, 'borrador_abandonado', 'notas_clinicas', :NCONJ, 'resuelta', now());

-- Diagnóstico y valoración de riesgo, para que los ceros del técnico no sean ceros por
-- falta de filas. `indicador` es columna GENERADA a partir de `nivel`, no se inserta.
insert into public.diagnosticos (episodio_id, paciente_id, cie10es_codigo, principal, diagnosticado_por) values
  (:EPI, :P1, 'F41.1', true, :PRO1);
insert into public.valoraciones_riesgo (paciente_id, nivel, descripcion, plan_seguridad, valorado_por) values
  (:P1, 'alto', 'Riesgo elevado, seguimiento semanal', 'Contacto semanal, teléfono de crisis facilitado', :PRO1);

-- Identificación cifrada (ADR-029), para la batería de identificación. Nonce 12 bytes,
-- etiqueta 16 y el índice 32 son medidas exactas de AEAD (check constraints); sha256() da
-- 32 siempre, así que se recorta con substr donde el tamaño es menor.
insert into public.pacientes_identificacion (paciente_id, tipo_documento, dni_cifrado, dni_nonce, dni_etiqueta, dni_indice) values
  (:P1, 'dni', sha256('dni-p1'::bytea), substr(sha256('nonce-p1'::bytea),1,12), substr(sha256('etiqueta-p1'::bytea),1,16), sha256('indice-p1'::bytea));

-- Consentimiento con firmante, del menor (para no dejar la tabla vacía).
insert into public.consentimientos (id, paciente_id, tipo, texto_firmado, texto_version, otorgado_en, creado_por)
values ('a0030001-0000-4000-8000-000000000001', :PMENOR, 'asistencial', 'Texto firmado', 'v1', now(), :PRO1);

-- PIN de historia (ADR-026): PRO1 y PRO2 sí; el técnico NO puede tenerlo.
call pg_temp.como(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como(:PRO2); select public.fijar_pin_historia('222222'); call pg_temp.reset_sesion();

\echo '01-fijación: completa.'
