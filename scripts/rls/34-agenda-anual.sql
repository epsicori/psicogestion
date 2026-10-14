-- T-047 · La vista anual de la agenda: agenda_densidad_anual() y agenda_profesionales_anuales()
-- (tickets/T-047/diseno.md §1.2). Recuentos por día local de la cita (sin canceladas) y la lista
-- de quién tiene citas en el año, con las MISMAS dos ramas por rol que agenda_citas_rango().
--
-- Las dos lecturas se comparan contra un ORÁCULO: agenda_citas_rango() mes a mes, con el rol de la
-- sesión. Si la rama de rol de una de las dos funciones se rompe, el oráculo —que lee con la
-- función ya probada del banco 18— deja de coincidir para ese usuario.
--
-- ANCLA: año Y + 9 entero (lunes a sábado, 08:00–18:30, de PRO34A y PRO34B) y los bordes del año,
-- que son de PRO34N. Ningún otro módulo del banco usa Y + 9 (README, punto 10.2). Ningún literal de
-- fecha: todo sale de `t34.anio`.
--
-- Perfiles PROPIOS (PRO34A/CA, PRO34B/CB, PRO34C/CA, PRO34N/CA): los recuentos exactos de E se
-- miden sobre PRO34N, que no tiene ninguna cita sintética. TEC1 (centro A) solo aparece como
-- profesional en una cita, C34TEC.
--
-- Los mutantes M1-M12 se miden a mano y están en tickets/T-047/mutantes.json.

\echo ''
\echo '=== 34-agenda-anual ==='

\set PRO34A  '\'a3400001-0000-4000-8000-00000000000a\''
\set PRO34B  '\'a3400001-0000-4000-8000-00000000000b\''
\set PRO34C  '\'a3400001-0000-4000-8000-00000000000c\''
\set PRO34N  '\'a3400001-0000-4000-8000-00000000000d\''
\set P34A    '\'a3400002-0000-4000-8000-00000000000a\''
\set P34B    '\'a3400002-0000-4000-8000-00000000000b\''
\set P34C    '\'a3400002-0000-4000-8000-00000000000c\''
\set P34N    '\'a3400002-0000-4000-8000-00000000000d\''
\set TT34    '\'a3400003-0000-4000-8000-000000000001\''
\set C34INI     '\'a3400004-0000-4000-8000-000000000001\''
\set C34PREV    '\'a3400004-0000-4000-8000-000000000002\''
\set C34FIN     '\'a3400004-0000-4000-8000-000000000003\''
\set C34MAD     '\'a3400004-0000-4000-8000-000000000004\''
\set C34NOCHE   '\'a3400004-0000-4000-8000-000000000005\''
\set C34SINC    '\'a3400004-0000-4000-8000-000000000006\''
\set C34CANAR   '\'a3400004-0000-4000-8000-000000000007\''
\set C34NCAN    '\'a3400004-0000-4000-8000-000000000008\''
\set C34TEC     '\'a3400004-0000-4000-8000-000000000009\''
\set C34SOLOCAN '\'a3400004-0000-4000-8000-00000000000a\''

select (extract(year from now())::int + 9) as anio_34 \gset
select set_config('t34.anio', :'anio_34', false);

-- ---------------------------------------------------------------------------
-- Ayudantes de pg_temp (los crea postgres; son invoker: corren con el rol de la sesión)
-- ---------------------------------------------------------------------------

-- Un instante del año ancla, en hora local de la zona: mes, día, hora, zona y años de desfase.
create function pg_temp.i34(m int, d int, h time default time '00:00',
                            z text default 'Europe/Madrid', delta int default 0)
returns timestamptz
language sql stable
as $$
  select ((make_date(current_setting('t34.anio')::int + delta, m, d) + h) at time zone z);
$$;

create function pg_temp.d34(m int, d int) returns date
language sql stable
as $$
  select make_date(current_setting('t34.anio')::int, m, d);
$$;

-- El año natural entero en una zona.
create function pg_temp.anual34(z text, p_centro uuid, p_prof uuid)
returns table (dia date, recuento integer)
language sql stable
as $$
  select r.dia, r.recuento
    from public.agenda_densidad_anual(
           pg_temp.i34(1, 1, time '00:00', z), pg_temp.i34(1, 1, time '00:00', z, 1),
           z, p_centro, p_prof) r;
$$;

-- El recuento de UN día local, o null si la función no devuelve fila para él.
create function pg_temp.dia34(z text, p_centro uuid, p_prof uuid, m int, d int)
returns integer
language sql stable
as $$
  select (select a.recuento from pg_temp.anual34(z, p_centro, p_prof) a where a.dia = pg_temp.d34(m, d));
$$;

create function pg_temp.total34(z text, p_centro uuid, p_prof uuid)
returns bigint
language sql stable
as $$
  select coalesce(sum(a.recuento), 0) from pg_temp.anual34(z, p_centro, p_prof) a;
$$;

-- El ORÁCULO: las citas que agenda_citas_rango() devuelve mes a mes dentro de [desde, hasta),
-- con el rol de la sesión. Cada llamada admite 62 días como mucho, y una cita que cruza de un mes
-- a otro solo cuenta en el mes de su inicio.
create function pg_temp.filas_oraculo_34(p_desde timestamptz, p_hasta timestamptz, p_zona text)
returns table (profesional_id uuid, profesional_nombre text, centro_id uuid,
               estado public.estado_cita, inicio timestamptz)
language sql stable
as $$
  with meses as (
    select (m.l at time zone p_zona) as m_ini,
           least(((m.l + interval '1 month') at time zone p_zona), p_hasta) as m_fin
      from generate_series(
             date_trunc('month', p_desde at time zone p_zona),
             (p_hasta at time zone p_zona) - interval '1 microsecond',
             interval '1 month') m(l)
  )
  select r.profesional_id, r.profesional_nombre, r.centro_id, r.estado, r.inicio
    from meses ms
   cross join lateral public.agenda_citas_rango(greatest(ms.m_ini, p_desde), ms.m_fin) r
   where r.inicio >= greatest(ms.m_ini, p_desde) and r.inicio < ms.m_fin;
$$;

-- Los días en que la densidad y el oráculo no coinciden (full outer join por día).
create function pg_temp.discrepancias_34(p_desde timestamptz, p_hasta timestamptz, p_zona text,
                                         p_centro uuid, p_prof uuid)
returns integer
language sql stable
as $$
  with oraculo as (
    select (o.inicio at time zone p_zona)::date as dia, count(*)::integer as recuento
      from pg_temp.filas_oraculo_34(p_desde, p_hasta, p_zona) o
     where o.estado <> 'cancelada'::public.estado_cita
       and (p_centro is null or o.centro_id = p_centro)
       and (p_prof is null or o.profesional_id = p_prof)
     group by 1
  ), densidad as (
    select r.dia, r.recuento
      from public.agenda_densidad_anual(p_desde, p_hasta, p_zona, p_centro, p_prof) r
  )
  select count(*)::integer
    from densidad d full outer join oraculo o on o.dia = d.dia
   where d.recuento is distinct from o.recuento;
$$;

-- La lista de profesionales según el oráculo: las mismas filas mensuales, CON las canceladas.
create function pg_temp.lista_oraculo_34(p_desde timestamptz, p_hasta timestamptz, p_zona text,
                                         p_centro uuid)
returns table (profesional_id uuid, profesional_nombre text)
language sql stable
as $$
  select distinct o.profesional_id, o.profesional_nombre
    from pg_temp.filas_oraculo_34(p_desde, p_hasta, p_zona) o
   where p_centro is null or o.centro_id = p_centro;
$$;

-- Diferencia simétrica entre la lista de la función y la del oráculo, año de Madrid entero.
create function pg_temp.dif_lista_34(p_centro uuid)
returns bigint
language sql stable
as $$
  select (select count(*) from (
            select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', p_centro)
            except
            select * from pg_temp.lista_oraculo_34(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', p_centro)) a)
       + (select count(*) from (
            select * from pg_temp.lista_oraculo_34(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', p_centro)
            except
            select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', p_centro)) b);
$$;

-- Marzo en Madrid: discrepancia y suma de la densidad, con los filtros que se pasen.
create function pg_temp.mar_disc_34(p_centro uuid, p_prof uuid)
returns integer
language sql stable
as $$
  select pg_temp.discrepancias_34(pg_temp.i34(3, 1), pg_temp.i34(4, 1), 'Europe/Madrid', p_centro, p_prof);
$$;

create function pg_temp.mar_suma_34(p_centro uuid, p_prof uuid)
returns bigint
language sql stable
as $$
  select coalesce(sum(r.recuento), 0)
    from public.agenda_densidad_anual(pg_temp.i34(3, 1), pg_temp.i34(4, 1), 'Europe/Madrid', p_centro, p_prof) r;
$$;

-- ---------------------------------------------------------------------------
-- Fijación (como postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', :PRO34A, 'authenticated', 'authenticated', 'pro34a@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional 34 A","centro_id":"' || :CA || '"}')::jsonb,
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO34B, 'authenticated', 'authenticated', 'pro34b@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional 34 B","centro_id":"' || :CB || '"}')::jsonb,
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO34C, 'authenticated', 'authenticated', 'pro34c@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional 34 C","centro_id":"' || :CA || '"}')::jsonb,
   '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :PRO34N, 'authenticated', 'authenticated', 'pro34n@rls.test', now(), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   ('{"rol":"profesional_sanitario","nombre_completo":"Profesional 34 N","centro_id":"' || :CA || '"}')::jsonb,
   '', '', '', '');

-- Sin descanso: las citas de 30 minutos van contiguas y la exclusión las admite.
update public.perfiles set descanso_activo = false where id in (:PRO34A, :PRO34B, :PRO34C, :PRO34N);

insert into public.pacientes (id, nombre, apellidos, profesional_id, centro_id) values
  (:P34A, 'Ana',   'Treinta y cuatro A', :PRO34A, :CA),
  (:P34B, 'Berta', 'Treinta y cuatro B', :PRO34B, :CB),
  (:P34C, 'Clara', 'Treinta y cuatro C', :PRO34C, :CA),
  (:P34N, 'Nora',  'Treinta y cuatro N', :PRO34N, :CA);

insert into public.tipos_terapia (id, nombre, duracion_minutos, regimen)
values (:TT34, 'Terapia T-047', 30, 'exento_sanitario');

-- El año sintético (CA4): lunes a sábado, de 13 a 21 huecos de 30 minutos desde las 08:00 de
-- Madrid, para PRO34A (centro A) y PRO34B (centro B). Estado según (día del año + s) % 10:
-- 0 cancelada, 1 y 2 confirmada, el resto programada.
insert into public.citas
  (paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, estado)
select p.pac, p.pro, p.cen, :TT34,
       ((dias.dia + time '08:00') + h.n * interval '30 minutes') at time zone 'Europe/Madrid',
       ((dias.dia + time '08:30') + h.n * interval '30 minutes') at time zone 'Europe/Madrid',
       'Europe/Madrid',
       (case (extract(doy from dias.dia)::int + p.s) % 10
          when 0 then 'cancelada'
          when 1 then 'confirmada'
          when 2 then 'confirmada'
          else 'programada'
        end)::public.estado_cita
  from (select (make_date(:anio_34, 1, 1) + g) as dia
          from generate_series(0, (make_date(:anio_34 + 1, 1, 1) - make_date(:anio_34, 1, 1)) - 1) g
         where extract(isodow from make_date(:anio_34, 1, 1) + g) <> 7) dias
 cross join (values (:PRO34A::uuid, :P34A::uuid, :CA::uuid, 0),
                    (:PRO34B::uuid, :P34B::uuid, :CB::uuid, 3)) p(pro, pac, cen, s)
 cross join lateral generate_series(0, 12 + extract(doy from dias.dia)::int % 9) h(n);

-- Las citas con nombre. PRO34N no tiene ninguna sintética: sus recuentos son exactos y pequeños.
-- C34PREV es `no_asistida` y no `programada` a propósito: acaba a las 00:20, solapa a C34INI y la
-- exclusión de solape miraría las dos (solo mira programada, confirmada y realizada). Para la
-- densidad cuenta igual: cuenta todo salvo las canceladas.
insert into public.citas
  (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, inicio, fin, zona_horaria, estado)
values
  (:C34INI,  :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(1, 1, time '00:00'), pg_temp.i34(1, 1, time '00:30'),
   'Europe/Madrid', 'programada'),
  (:C34PREV, :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(12, 31, time '23:30', 'Europe/Madrid', -1),
   pg_temp.i34(1, 1, time '00:20'), 'Europe/Madrid', 'no_asistida'),
  (:C34FIN,  :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1),
   pg_temp.i34(1, 1, time '00:30', 'Europe/Madrid', 1), 'Europe/Madrid', 'programada'),
  (:C34MAD,  :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(3, 10, time '00:30'), pg_temp.i34(3, 10, time '01:00'),
   'Europe/Madrid', 'programada'),
  (:C34NOCHE, :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(3, 11, time '23:30'), pg_temp.i34(3, 12, time '00:20'),
   'Europe/Madrid', 'confirmada'),
  (:C34SINC, :P34N, :PRO34N, null, :TT34, pg_temp.i34(3, 13, time '19:00'), pg_temp.i34(3, 13, time '19:30'),
   'Europe/Madrid', 'programada'),
  (:C34CANAR, :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(3, 16, time '23:30', 'Atlantic/Canary'),
   pg_temp.i34(3, 17, time '00:00', 'Atlantic/Canary'), 'Europe/Madrid', 'programada'),
  (:C34NCAN, :P34N, :PRO34N, :CA, :TT34, pg_temp.i34(3, 20, time '19:00'), pg_temp.i34(3, 20, time '19:30'),
   'Europe/Madrid', 'cancelada'),
  -- Copia propia de C18TEC: el TÉCNICO como profesional de una cita. La política de citas le deja
  -- leerla por la rama `citas`; sin el filtro de rol la contaría dos veces.
  (:C34TEC,  :P34A, :TEC1, :CA, :TT34, pg_temp.i34(3, 14, time '19:00'), pg_temp.i34(3, 14, time '19:30'),
   'Europe/Madrid', 'programada'),
  (:C34SOLOCAN, :P34C, :PRO34C, :CA, :TT34, pg_temp.i34(3, 18, time '19:00'), pg_temp.i34(3, 18, time '19:30'),
   'Europe/Madrid', 'cancelada');

-- =========================================================================
-- A · Forma y permisos
-- =========================================================================

select pg_temp.assert(
  pg_get_function_result('public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)'::regprocedure)
    = 'TABLE(dia date, recuento integer)',
  'A1: la densidad devuelve exactamente TABLE(dia date, recuento integer)');

select pg_temp.assert(
  pg_get_function_result('public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)'::regprocedure)
    !~* 'paciente|tipo|nota|nombre|apellido|sala|serie|episodio|modalidad|estado',
  'A2: la salida de la densidad no tiene ninguna columna de la cita (ni paciente, tipo, nota, estado…)');

select pg_temp.assert(
  (select count(*) from pg_proc p
    where p.oid in ('public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)'::regprocedure,
                    'public.agenda_profesionales_anuales(timestamptz,timestamptz,text,uuid)'::regprocedure)
      and p.prosecdef = false and p.provolatile = 's') = 2,
  'A3: las dos funciones son security invoker y stable');

select pg_temp.assert(
  (select count(*) from pg_proc p
    where p.oid in ('public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)'::regprocedure,
                    'public.agenda_profesionales_anuales(timestamptz,timestamptz,text,uuid)'::regprocedure)
      and 'search_path=""' = any (p.proconfig)) = 2,
  'A4: las dos llevan search_path vacío');

select pg_temp.assert(
  not has_function_privilege('anon', 'public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.agenda_densidad_anual(timestamptz,timestamptz,text,uuid,uuid)', 'execute'),
  'A5: la densidad: execute para authenticated, ni anon ni service_role');
select pg_temp.assert(
  not has_function_privilege('anon', 'public.agenda_profesionales_anuales(timestamptz,timestamptz,text,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.agenda_profesionales_anuales(timestamptz,timestamptz,text,uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.agenda_profesionales_anuales(timestamptz,timestamptz,text,uuid)', 'execute'),
  'A5: la lista: execute para authenticated, ni anon ni service_role');

set local role anon;
select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Europe/Madrid'')',
  '42501', 'A6: anon no puede llamar a la densidad');
select pg_temp.assert_lanza_codigo(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Europe/Madrid'')',
  '42501', 'A6: anon no puede llamar a la lista');
reset role;

select pg_temp.assert(
  pg_get_function_result('public.agenda_profesionales_anuales(timestamptz,timestamptz,text,uuid)'::regprocedure)
    = 'TABLE(profesional_id uuid, profesional_nombre text)',
  'A7: la lista devuelve exactamente TABLE(profesional_id uuid, profesional_nombre text)');

-- =========================================================================
-- B · Guardas: 22023 con su fragmento
-- =========================================================================

call pg_temp.como(:ADM);

-- (desde, hasta, zona) escritos como texto SQL para que el helper los ejecute.
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(null, pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Europe/Madrid'')',
  '22023', 'faltan los extremos', 'B1: densidad con desde nulo');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), null, ''Europe/Madrid'')',
  '22023', 'faltan los extremos', 'B1: densidad con hasta nulo');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), pg_temp.i34(1, 1), ''Europe/Madrid'')',
  '22023', 'al revés o sin duración', 'B2: densidad con el rango invertido');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1), ''Europe/Madrid'')',
  '22023', 'al revés o sin duración', 'B2: densidad con desde = hasta');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), null)',
  '22023', 'zona horaria no admitida', 'B3: densidad con la zona nula');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Etc/UTC'')',
  '22023', 'zona horaria no admitida', 'B3: densidad con Etc/UTC');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''posix/Europe/Madrid'')',
  '22023', 'zona horaria no admitida', 'B3: densidad con posix/Europe/Madrid');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1) + interval ''1 microsecond'', ''Europe/Madrid'')',
  '22023', 'más de un año natural', 'B4: densidad con un año y un microsegundo');
select pg_temp.assert_no_lanza(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Europe/Madrid'')',
  'B5 GEMELA: el año exacto en Madrid pasa');
select pg_temp.assert_no_lanza(
  'select * from public.agenda_densidad_anual(pg_temp.i34(1, 1, time ''00:00'', ''Atlantic/Canary''), pg_temp.i34(1, 1, time ''00:00'', ''Atlantic/Canary'', 1), ''Atlantic/Canary'')',
  'B5 GEMELA: el año exacto en Atlantic/Canary pasa');

select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(null, pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Europe/Madrid'')',
  '22023', 'faltan los extremos', 'B1: lista con desde nulo');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), null, ''Europe/Madrid'')',
  '22023', 'faltan los extremos', 'B1: lista con hasta nulo');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), pg_temp.i34(1, 1), ''Europe/Madrid'')',
  '22023', 'al revés o sin duración', 'B2: lista con el rango invertido');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1), ''Europe/Madrid'')',
  '22023', 'al revés o sin duración', 'B2: lista con desde = hasta');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), null)',
  '22023', 'zona horaria no admitida', 'B3: lista con la zona nula');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Etc/UTC'')',
  '22023', 'zona horaria no admitida', 'B3: lista con Etc/UTC');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''posix/Europe/Madrid'')',
  '22023', 'zona horaria no admitida', 'B3: lista con posix/Europe/Madrid');
select pg_temp.assert_lanza_codigo_msg(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1) + interval ''1 microsecond'', ''Europe/Madrid'')',
  '22023', 'más de un año natural', 'B4: lista con un año y un microsegundo');
select pg_temp.assert_no_lanza(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time ''00:00'', ''Europe/Madrid'', 1), ''Europe/Madrid'')',
  'B5 GEMELA: la lista con el año exacto en Madrid pasa');
select pg_temp.assert_no_lanza(
  'select * from public.agenda_profesionales_anuales(pg_temp.i34(1, 1, time ''00:00'', ''Atlantic/Canary''), pg_temp.i34(1, 1, time ''00:00'', ''Atlantic/Canary'', 1), ''Atlantic/Canary'')',
  'B5 GEMELA: la lista con el año exacto en Atlantic/Canary pasa');

call pg_temp.reset_sesion();

-- =========================================================================
-- C · Oráculo por rol y por filtro (marzo de Y + 9)
-- =========================================================================

-- ADM
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.mar_disc_34(null, null) = 0, 'C1 ADM · sin filtro: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(:CA, null) = 0, 'C2 ADM · CA: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(null, :PRO34A) = 0, 'C3 ADM · PRO34A: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(:CA, :PRO34A) = 0, 'C4 ADM · CA + PRO34A: densidad = oráculo');
select pg_temp.assert(
  pg_temp.mar_suma_34(null, null) > 0 and pg_temp.mar_suma_34(:CA, null) > 0
  and pg_temp.mar_suma_34(null, :PRO34A) > 0 and pg_temp.mar_suma_34(:CA, :PRO34A) > 0,
  'C: ADM · no vacío: las cuatro combinaciones tienen citas en marzo (un oráculo vacío contra una densidad vacía no prueba nada)');
select pg_temp.assert(pg_temp.mar_suma_34(:CB, :PRO34A) = 0 and pg_temp.mar_suma_34(:CA, :PRO34A) > 0,
  'C: ADM · CB + PRO34A suma 0 (PRO34A no es de CB); la gemela CA + PRO34A suma más de 0');
select pg_temp.assert(pg_temp.mar_disc_34(:CB, :PRO34A) = 0, 'C: ADM · CB + PRO34A: densidad = oráculo (los dos vacíos)');

-- PRO34A
call pg_temp.como(:PRO34A);
select pg_temp.assert(pg_temp.mar_disc_34(null, null) = 0, 'C5 PRO34A · sin filtro: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(:CA, null) = 0, 'C6 PRO34A · CA: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(null, :PRO34A) = 0, 'C7 PRO34A · PRO34A: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(:CA, :PRO34A) = 0, 'C8 PRO34A · CA + PRO34A: densidad = oráculo');
select pg_temp.assert(
  pg_temp.mar_suma_34(null, null) > 0 and pg_temp.mar_suma_34(:CA, null) > 0
  and pg_temp.mar_suma_34(null, :PRO34A) > 0 and pg_temp.mar_suma_34(:CA, :PRO34A) > 0,
  'C: PRO34A · no vacío: las cuatro combinaciones tienen citas en marzo');

-- TEC1
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.mar_disc_34(null, null) = 0, 'C9 TEC1 · sin filtro: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(:CA, null) = 0, 'C10 TEC1 · CA: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(null, :PRO34A) = 0, 'C11 TEC1 · PRO34A: densidad = oráculo');
select pg_temp.assert(pg_temp.mar_disc_34(:CA, :PRO34A) = 0, 'C12 TEC1 · CA + PRO34A: densidad = oráculo');
select pg_temp.assert(
  pg_temp.mar_suma_34(null, null) > 0 and pg_temp.mar_suma_34(:CA, null) > 0
  and pg_temp.mar_suma_34(null, :PRO34A) > 0 and pg_temp.mar_suma_34(:CA, :PRO34A) > 0,
  'C: TEC1 · no vacío: las cuatro combinaciones tienen citas en marzo');

call pg_temp.reset_sesion();

-- =========================================================================
-- D · Lo que elige el llamante no abre nada que su rol no vea
-- =========================================================================

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.total34('Europe/Madrid', :CB, null) = 0
  and not exists (select 1 from pg_temp.anual34('Europe/Madrid', :CB, null)),
  'D1: el técnico de CA con p_centro_id = CB no recibe ninguna fila en todo el año');
select pg_temp.assert(pg_temp.total34('Europe/Madrid', :CA, null) > 0,
  'D1 GEMELA: el mismo técnico con p_centro_id = CA recibe citas');
-- D3
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :TEC1, 3, 14) = 1,
  'D3: el técnico con p_profesional_id = TEC1 recibe el 14-03 con EXACTAMENTE 1 (la cita se cuenta una vez, no dos)');
select pg_temp.assert(
  (select count(*) from pg_temp.anual34('Europe/Madrid', null, :TEC1)) = 1
  and pg_temp.total34('Europe/Madrid', null, :TEC1) = 1,
  'D3: y no hay ningún otro día con citas de TEC1');

call pg_temp.como(:PRO34A);
select pg_temp.assert(not exists (select 1 from pg_temp.anual34('Europe/Madrid', null, :PRO34B)),
  'D2: PRO34A con p_profesional_id = PRO34B no recibe ninguna fila (la RLS manda sobre el filtro)');
select pg_temp.assert(pg_temp.total34('Europe/Madrid', null, :PRO34A) > 0
  and pg_temp.discrepancias_34(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', null, :PRO34A) = 0,
  'D2 GEMELA: PRO34A con p_profesional_id = PRO34A recibe citas y coincide con el oráculo del año');
select pg_temp.assert(not exists (select 1 from pg_temp.anual34('Europe/Madrid', null, :TEC1)),
  'D4: PRO34A con p_profesional_id = TEC1 no recibe nada (no comparte la cita del técnico)');

call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :TEC1, 3, 14) = 1,
  'D5: el administrador con p_profesional_id = TEC1 recibe el 14-03 con 1');

call pg_temp.reset_sesion();

-- =========================================================================
-- E · Día local y bordes (ADM, p_profesional_id = PRO34N salvo que se diga)
-- =========================================================================

call pg_temp.como(:ADM);

select pg_temp.assert(pg_temp.total34('Europe/Madrid', null, :PRO34N) = 5,
  'E1: el año de PRO34N vale 5 (INI, MAD, NOCHE, SINC y CANAR; ni PREV, ni FIN, ni la cancelada)');
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :PRO34N, 1, 1) = 1,
  'E2: el 1-1 vale 1 (C34INI: el borde cerrado inferior)');
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 10) = 1
  and pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 9) is null,
  'E3: la cita de las 00:30 de Madrid cuenta el 10-03 (día local), no el 9 (UTC)');
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 11) = 1
  and pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 12) is null,
  'E4: la cita que cruza la medianoche cuenta una vez, el día de su inicio');
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 17) = 1
  and pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 16) is null,
  'E5: en Madrid, la cita de las 23:30 de Canarias cuenta el 17-03');
select pg_temp.assert(pg_temp.dia34('Atlantic/Canary', null, :PRO34N, 3, 16) = 1
  and pg_temp.dia34('Atlantic/Canary', null, :PRO34N, 3, 17) is null,
  'E5 GEMELA: con p_zona = Atlantic/Canary la misma cita cuenta el 16-03');
select pg_temp.assert(pg_temp.total34('Europe/Madrid', :CA, :PRO34N) = 4,
  'E6: con p_centro_id = CA el total vale 4 (sale la cita sin centro)');
call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.total34('Europe/Madrid', null, :PRO34N) = 4,
  'E7: el técnico ve 4 de PRO34N (nunca la cita sin centro)');
call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.dia34('Europe/Madrid', null, :PRO34N, 3, 20) is null,
  'E8: el 20-03 no tiene fila (la única cita de ese día está cancelada)');
select pg_temp.assert(
  exists (select 1 from public.agenda_citas_rango(pg_temp.i34(3, 1), pg_temp.i34(4, 1)) r
           where r.id = :C34NCAN and r.estado = 'cancelada'),
  'E8 GEMELA: agenda_citas_rango de marzo SÍ devuelve la cancelada (el mes cuenta canceladas, la densidad no)');

call pg_temp.reset_sesion();

-- =========================================================================
-- F · La lista de profesionales
-- =========================================================================

call pg_temp.como(:ADM);
select pg_temp.assert(pg_temp.dif_lista_34(null) = 0, 'F1 ADM · sin centro: la lista = el oráculo');
select pg_temp.assert(pg_temp.dif_lista_34(:CA) = 0, 'F1 ADM · CA: la lista = el oráculo');
select pg_temp.assert(
  exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
           where l.profesional_id = :PRO34C),
  'F2: la lista de ADM incluye a PRO34C, que solo tiene una cita cancelada');
select pg_temp.assert(
  exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
           where l.profesional_id = :PRO34B),
  'F2 GEMELA: y la de ADM sin centro incluye a PRO34B (de CB)');
select pg_temp.assert(
  not exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', :CA) l
               where l.profesional_id = :PRO34B),
  'F2: con p_centro_id = CA la lista de ADM no incluye a PRO34B');

call pg_temp.como(:PRO34A);
select pg_temp.assert(pg_temp.dif_lista_34(null) = 0, 'F1 PRO34A · sin centro: la lista = el oráculo');
select pg_temp.assert(pg_temp.dif_lista_34(:CA) = 0, 'F1 PRO34A · CA: la lista = el oráculo');
select pg_temp.assert(
  (select count(*) from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid')) = 1
  and exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
               where l.profesional_id = :PRO34A),
  'F4: PRO34A recibe solo a PRO34A');

call pg_temp.como(:TEC1);
select pg_temp.assert(pg_temp.dif_lista_34(null) = 0, 'F1 TEC1 · sin centro: la lista = el oráculo');
select pg_temp.assert(pg_temp.dif_lista_34(:CA) = 0, 'F1 TEC1 · CA: la lista = el oráculo');
select pg_temp.assert(
  not exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
               where l.profesional_id = :PRO34B),
  'F3: la lista de TEC1 no incluye a PRO34B (centro B)');
select pg_temp.assert(
  (select count(*) from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
    where l.profesional_id = :TEC1) = 1,
  'F3 GEMELA: y sí incluye a TEC1, UNA sola vez (aparece como profesional de C34TEC)');
select pg_temp.assert(
  not exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
               where l.profesional_nombre is null)
  and exists (select 1 from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l
               where l.profesional_id = :PRO34A),
  'F3: todos los nombres que recibe el técnico son no nulos (y la lista no está vacía)');

call pg_temp.como(:ADM);
select pg_temp.assert(
  (select count(*) from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid'))
  = (select count(distinct l.profesional_id) from public.agenda_profesionales_anuales(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid') l),
  'F5: ni un profesional repetido en la lista de ADM');

call pg_temp.reset_sesion();

-- =========================================================================
-- G · Volumen y coste (el año sintético)
-- =========================================================================

select pg_temp.assert(
  (select count(*) from public.citas where profesional_id in (:PRO34A, :PRO34B)) >= 10000,
  'G1: la fijación tiene al menos 10 000 citas sintéticas');

call pg_temp.como(:ADM);

select pg_temp.assert(
  pg_temp.discrepancias_34(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', null, null) = 0
  and pg_temp.total34('Europe/Madrid', null, null) > 10000 * 0.8,
  'G2: ADM · el año entero sin filtros: densidad = oráculo, y el total es del orden de las citas fijadas');

select pg_temp.assert((select count(*) from pg_temp.anual34('Europe/Madrid', null, null)) <= 366,
  'G3: la densidad del año devuelve 366 filas como mucho (una por día)');

do $$
declare
  t0 timestamptz;
  t1 timestamptz;
  n  bigint;
begin
  t0 := clock_timestamp();
  select count(*) into n
    from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', null, null);
  t1 := clock_timestamp();
  raise notice 'G4: agenda_densidad_anual del año sintético: % filas en % ms', n, round(extract(epoch from (t1 - t0)) * 1000);
  if t1 - t0 >= interval '1 second' then
    raise exception 'G4 FALLO: la densidad anual tardó % (límite: 1 s)', t1 - t0;
  end if;
end;
$$;

-- G5 · evidencia (sin aserción): el plan de la llamada y el de la consulta del cuerpo.
\echo 'G5 · EXPLAIN de la llamada (ADM, año sintético)'
explain (analyze, buffers)
select * from public.agenda_densidad_anual(pg_temp.i34(1, 1), pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1), 'Europe/Madrid', null, null);

\echo 'G5 · EXPLAIN de la consulta del cuerpo escrita con los valores (ADM)'
explain (analyze, buffers)
with visibles as (
  select c.inicio, c.estado, c.centro_id, c.profesional_id
    from public.citas c
   where c.inicio >= pg_temp.i34(1, 1) and c.inicio < pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1)
     and (select public.rol_actual()) in ('administrador'::public.rol_usuario, 'profesional_sanitario'::public.rol_usuario)
  union all
  select a.inicio, a.estado, a.centro_id, a.profesional_id
    from public.citas_agenda a
   where a.inicio >= pg_temp.i34(1, 1) and a.inicio < pg_temp.i34(1, 1, time '00:00', 'Europe/Madrid', 1)
)
select (v.inicio at time zone 'Europe/Madrid')::date, count(*)::integer
  from visibles v
 where v.estado <> 'cancelada'::public.estado_cita
 group by 1
 order by 1;

call pg_temp.reset_sesion();
