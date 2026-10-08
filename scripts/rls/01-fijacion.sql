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
\set EPI2 '\'e0030001-0000-4000-8000-000000000002\''

\set NCONJ '\'f0030001-0000-4000-8000-000000000001\''
\set NIND  '\'f0030001-0000-4000-8000-000000000002\''
\set NCORR '\'f0030001-0000-4000-8000-000000000003\''

\set REPMENOR '\'a0030002-0000-4000-8000-000000000001\''

-- T-021: un borrador de factura de P1 (con su versión 1) y un cobro de P1.
\set BORR1 '\'a0210001-0000-4000-8000-000000000001\''
\set COB1  '\'a0210002-0000-4000-8000-000000000001\''
-- T-021 ronda 2: una tarifa y una caducidad de bono (tablas de solo adición) y su bono.
\set TIPO21 '\'a0210003-0000-4000-8000-000000000001\''
\set TAR21  '\'a0210004-0000-4000-8000-000000000001\''
\set BONO21 '\'a0210005-0000-4000-8000-000000000001\''
\set CAD21  '\'a0210006-0000-4000-8000-000000000001\''
-- T-026a: dos borradores más (BORRA de PRO1 sobre P1, BORRB de PRO2 sobre P2) que llegan hasta el
-- espejo; los ids de sus versiones se leen con \gset al sellarlas.
\set BORRA '\'a0260001-0000-4000-8000-000000000001\''
\set BORRB '\'a0260001-0000-4000-8000-000000000002\''

\echo '=== 01-fijación ==='

-- `on conflict (fila_unica) do nothing` desde T-008: `organizacion` es una tabla de FILA
-- ÚNICA y la siembra mínima (`supabase/seed.sql`, que corre en cada `db reset`) ya crea la
-- suya. Sin esto, el banco muere aquí con
-- `duplicate key value violates unique constraint "organizacion_fila_unica_key"`.
--
-- El banco sigue sin DEPENDER de la siembra: si la organización ya está, se queda la
-- sembrada y da igual cuál sea, porque ninguna aserción mira su razón social ni su NIF —
-- solo que exista exactamente una, que es lo que la tabla garantiza por construcción.
insert into public.organizacion (razon_social, nif) values ('Banco RLS SL', 'B00300001')
on conflict (fila_unica) do nothing;

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
insert into public.representantes_paciente (id, paciente_id, nombre, apellidos, tipo, alcance, vigente_desde) values
  (:REPMENOR, :PMENOR, 'Dora', 'Representante', 'progenitor', 'patria_potestad', current_date - interval '15 years' - interval '1 month');

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
-- T-005: notas_clinicas_versiones ya no acepta numero_version/huella/huella_anterior a
-- mano — los calcula fn_sellar_version_nota() — así que se inserta solo lo que la versión
-- de verdad decide, con un sobre canónico construido por pg_temp.sobre_prueba() (00). Las
-- dos notas son del mismo paciente (P1), así que quedan en la MISMA cadena: NCONJ ocupa la
-- posición 1 y NIND la 2. `creada_en` varía entre filas a propósito (§8 del diseño
-- aprobado de T-005): dos sobres idénticos byte a byte chocarían en el índice único global
-- sobre `huella` (T-001) aunque fueran de pacientes distintos.
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values
  (:NCONJ, :P1, :EPI, :PRO1),
  (:NIND,  :P1, :EPI, :PRO1);
-- Sentencias SEPARADAS, no un solo INSERT con varias filas: el orden de fila importa
-- (posición 1 antes que 2 en la MISMA cadena) y una sentencia por fila es la única forma
-- de que ese orden esté garantizado, no solo observado.
-- T-012a: el sobre lleva `alcance` (comprobación 6.10) y debe coincidir con la columna
-- homónima, o fn_sellar_version_nota() rechaza el INSERT con 23514 — y con él, TODA la
-- siembra del banco que depende de este fichero.
-- T-012c: la primera firma del banco va envuelta en assert_no_lanza para que, si el sobre
-- no es el de la era vigente, el banco se pare AQUÍ con un rótulo que lo diga (criterio 2)
-- y no con un error suelto. Las variables de psql van como argumentos de format().
select pg_temp.assert_no_lanza(format($f$
  insert into public.notas_clinicas_versiones
    (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
    (%L, '{"t":"conjunta"}', %L, 'conjunta', %L, timestamptz '2026-08-29 09:20:00+00')$f$,
  :NCONJ,
  pg_temp.sobre_prueba(:NCONJ, :PRO1, timestamptz '2026-08-29 09:20:00+00', '{"t":"conjunta"}'::jsonb,
                        p_alcance => 'conjunta'),
  :PRO1),
  'T-012c · NCONJ (primera firma de la fijación) se sella con un sobre de la era 4');
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, alcance, autor_id, creada_en) values
  (:NIND, '{"t":"individual"}',
   pg_temp.sobre_prueba(:NIND, :PRO1, timestamptz '2026-08-29 09:20:01+00', '{"t":"individual"}'::jsonb,
                         p_alcance => 'individual'),
   'individual', :PRO1, timestamptz '2026-08-29 09:20:01+00');

-- Nota con dos versiones encadenadas (corrección) — para la batería de identificación NO,
-- pero sirve de fijación positiva de "notas con historial" si algún ticket futuro la usa.
-- Paciente P2: cadena propia, independiente de la de P1 de arriba.
-- T-034 (ADR-071): toda nota cuelga de un episodio, y del de su autor (D2). EPI es de PRO1, así
-- que la nota de PRO2 sobre P2 lleva un episodio individual propio.
insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id) values
  (:EPI2, :P2, :PRO2, :CB);
insert into public.notas_clinicas (id, paciente_id, episodio_id, autor_id) values (:NCORR, :P2, :EPI2, :PRO2);
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, motivo_cambio, autor_id, creada_en) values
  (:NCORR, '{"t":"v1"}',
   pg_temp.sobre_prueba(:NCORR, :PRO2, timestamptz '2026-08-29 09:21:00+00', '{"t":"v1"}'::jsonb),
   null, :PRO2, timestamptz '2026-08-29 09:21:00+00');
insert into public.notas_clinicas_versiones
  (nota_id, cuerpo, contenido_canonico, motivo_cambio, autor_id, creada_en) values
  (:NCORR, '{"t":"v2"}',
   pg_temp.sobre_prueba(:NCORR, :PRO2, timestamptz '2026-08-29 09:21:01+00', '{"t":"v2"}'::jsonb, null, 'Corrección de fecha'),
   'Corrección de fecha', :PRO2, timestamptz '2026-08-29 09:21:01+00');

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
--
-- Desde el arreglo del hallazgo ALTA 2 de la revisión de T-006a (30-08-2026),
-- `fijar_pin_historia()` exige `segundo_factor_verificado_recientemente()`: no basta con
-- tener sesión. Así que la fijación tiene que dar a los dos profesionales un factor TOTP
-- verificado y entrar con `aal2`, igual que hará la pantalla del primer acceso justo
-- después de enrolar TOTP.
--
-- Los dos desfases distintos NO son decorativos: `auth.mfa_factors` lleva un único global
-- sobre `last_challenged_at` y `now()` no avanza dentro de la transacción — con el mismo
-- valor, el segundo insert muere con 23505. Los dos siguen muy dentro de la ventana de
-- cinco minutos.
call pg_temp.dar_segundo_factor(:PRO1, interval '1 second');
call pg_temp.dar_segundo_factor(:PRO2, interval '2 seconds');

call pg_temp.como_con_2fa(:PRO1); select public.fijar_pin_historia('111111'); call pg_temp.reset_sesion();
call pg_temp.como_con_2fa(:PRO2); select public.fijar_pin_historia('222222'); call pg_temp.reset_sesion();

-- T-021 · Una fila en cada tabla económica de solo adición, ANTES del módulo 10: sobre una
-- tabla vacía el disparador de fila no salta y `10-solo-adicion` fallaría con «debía lanzar
-- y no lanzó» (A.1-D11, PA.3). Un borrador de PRO1 sobre P1 (su paciente asignado, centro
-- A), con una versión sellada por fn_sellar_version_borrador() —insertada como `postgres`,
-- con el sobre de pg_temp.sobre_borrador()— y un cobro de P1 sin factura.
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values
  (:BORR1, :P1, :PRO1, :PRO1);
select pg_temp.assert_no_lanza(format($f$
  insert into public.borradores_factura_versiones
    (borrador_id, centro_id, destinatario_nombre, lineas, base, cuota_iva, total, creada_por, creada_en,
     algoritmo_version, contenido_canonico) values
    (%L, %L, 'Ana Uno', %L, 60.00, 0.00, 60.00, %L, timestamptz '2026-10-01 10:00:00+00', 1, %L)$f$,
  :BORR1, :CA, jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)), :PRO1,
  pg_temp.sobre_borrador(:BORR1, :PRO1, timestamptz '2026-10-01 10:00:00+00',
                         jsonb_build_array(pg_temp.linea_borrador('Sesión de psicoterapia', 1, 6000)),
                         60.00, 0.00, 60.00, 'Ana Uno', :CA)),
  'T-021 · la versión 1 del borrador de la fijación se sella (sobre de quince claves)');
insert into public.cobros (id, paciente_id, importe, fecha, forma_pago, registrado_por) values
  (:COB1, :P1, 60.00, date '2026-10-01', 'efectivo', :ADM);

-- T-021 ronda 2 · una fila en tarifas_paciente y otra en bonos_caducidades, que entran en
-- tablas_solo_adicion: sin ellas 10-solo-adicion falla con "debía lanzar y no lanzó".
insert into public.tipos_terapia (id, nombre) values (:TIPO21, 'Terapia de la fijación T-021');
insert into public.tarifas_paciente (id, paciente_id, tipo_terapia_id, importe, regimen_iva, vigente_desde, creada_por)
  values (:TAR21, :P1, :TIPO21, 60.00, 'exento_sanitario', date '2026-01-01', :ADM);
insert into public.bonos (id, paciente_id, sesiones_totales, importe, caducidad, creado_por)
  values (:BONO21, :P1, 5, 275.00, null, :ADM);
insert into public.bonos_caducidades (id, bono_id, caducidad, registrada_por)
  -- fecha-fija: caducidad de bono, ninguna guarda la compara con el reloj
  values (:CAD21, :BONO21, date '2031-12-31', :ADM);

-- T-026a · Una fila en cada tabla del programa de facturación (envíos, espejo, anotaciones) y el
-- ajuste del proveedor, ANTES del módulo 10, y todo POR LAS FUNCIONES (una prueba que construye a
-- mano prueba el esquema, no el comportamiento). Borradores nuevos, no BORR1: el banco 26 añade
-- versiones a BORR1 y la congelación posterior al envío lo rompería. `creada_en` distinto del de
-- BORR1 (índice global de huellas, README punto 9).
insert into public.borradores_factura (id, paciente_id, profesional_id, creado_por) values
  (:BORRA, :P1, :PRO1, :PRO1),
  (:BORRB, :P2, :PRO2, :PRO2);
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRA, :PRO1, 60.00, timestamptz '2026-10-01 10:00:01+00', 'Ana Uno', :CA),
  'T-026a · la versión 1 de BORRA (PRO1, P1) se sella');
select pg_temp.assert_no_lanza(
  pg_temp.sql_version_simple(:BORRB, :PRO2, 70.00, timestamptz '2026-10-01 10:00:02+00', 'Beto Dos', :CB),
  'T-026a · la versión 1 de BORRB (PRO2, P2) se sella');
select format('%L', v.id) as "VERA" from public.borradores_factura_versiones v
 where v.borrador_id = :BORRA and v.numero_version = 1 \gset
select format('%L', v.id) as "VERB" from public.borradores_factura_versiones v
 where v.borrador_id = :BORRB and v.numero_version = 1 \gset

-- El ajuste: el administrador conecta el programa con una clave ficticia.
call pg_temp.como(:ADM);
select public.guardar_clave_proveedor_facturacion('holded', 'claveFijacionT026a0001');
call pg_temp.reset_sesion();

-- El administrador prepara los dos borradores (la política de alta de versiones: admin, o autor asignado).
call pg_temp.como(:ADM);
select public.encolar_envio_borrador(:BORRA);
select public.encolar_envio_borrador(:BORRB);
call pg_temp.reset_sesion();

select format('%L', e.id) as "EVA" from public.eventos_salientes e
 where e.clave_idempotencia = 'facturacion.enviar_borrador:' || :BORRA \gset
select format('%L', e.id) as "EVB" from public.eventos_salientes e
 where e.clave_idempotencia = 'facturacion.enviar_borrador:' || :BORRB \gset

-- El consumidor (service_role): reclama los dos, registra el envío y copia el espejo y una anotación.
set local role service_role;
select count(*) as "RECLAMADOS_FIJ" from public.reclamar_envios_facturacion(10) \gset
select public.registrar_envio_borrador(:EVA, 'holded', 'DOC-A', 1::smallint, :VERA, current_date);
select public.registrar_envio_borrador(:EVB, 'holded', 'DOC-B', 1::smallint, :VERB, current_date);
select public.registrar_factura_espejo('holded', 'DOC-A', 'F-2026-0001', current_date, 6000, 0, 6000, 'https://programa.example/doc/A');
select public.registrar_factura_espejo('holded', 'DOC-B', 'F-2026-0002', current_date, 7000, 0, 7000, 'https://programa.example/doc/B');
select public.registrar_anotacion_documento('holded', 'DOC-A', 'rectificado');
reset role;
select pg_temp.assert(:RECLAMADOS_FIJ = 2, 'T-026a · la fijación reclamó los dos envíos');

\echo '01-fijación: completa.'
