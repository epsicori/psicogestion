-- T-042 · El PIN de la historia y el canje de códigos de recuperación, en dos pasos.
--
-- Este banco llama a las funciones `public.*` DIRECTAMENTE, nunca a los ayudantes
-- `pg_temp.desbloquear_historia(text)` / `pg_temp.canjear_codigo_recuperacion(text)` de 00:
-- esos son la forma vieja de las dos llamadas, para que las aserciones de T-003 a T-038
-- sigan leyéndose igual. Aquí lo que se prueba es cada paso por separado.
--
-- Todo el banco es UNA transacción y `now()` no avanza: la caducidad de una autorización
-- se fuerza a mano como `postgres` (`autorizado_hasta = now() - 1 s`), no se espera.
-- El estado que se prueba (contadores, autorizaciones, desbloqueos) lo construyen solo las
-- funciones bajo prueba; el banco solo fija el PIN (en 01) y los códigos de cada lote.

\echo ''
\echo '=== 24-pin-y-canje-dos-pasos ==='

-- --- Ayudantes propios (se llaman como `postgres`, tras reset_sesion) -------------------

create or replace function pg_temp.t42_pin_reset(p_uid uuid) returns void language plpgsql as $$
begin
  update public.pines_historia
     set intentos_fallidos = 0, bloqueado_hasta = null,
         desbloqueos_autorizados = 0, autorizado_hasta = null
   where perfil_id = p_uid;
  update public.desbloqueos_historia set revocado_en = now()
   where perfil_id = p_uid and revocado_en is null;
end $$;

-- «intentos/autorizaciones/bloqueado»
create or replace function pg_temp.t42_pin(p_uid uuid) returns text language sql as $$
  select ph.intentos_fallidos || '/' || ph.desbloqueos_autorizados || '/' || (ph.bloqueado_hasta is not null)
    from public.pines_historia ph where ph.perfil_id = p_uid;
$$;

-- Lote nuevo con códigos conocidos: caduca el vigente y deja tres (fijación; el reloj de la
-- transacción es constante y la regla Q3(B) de generar_codigos_recuperacion() rechazaría
-- generar con un lote vigente «creado a la vez» que el último TOTP_REPUESTO).
create or replace function pg_temp.t42_lote(p_uid uuid, p_etiqueta text) returns void language plpgsql as $$
begin
  update public.codigos_recuperacion_totp set usado_en = now()
   where perfil_id = p_uid and usado_en is null;
  insert into public.codigos_recuperacion_totp (perfil_id, codigo_hash)
  select p_uid, extensions.crypt(p_etiqueta || s, extensions.gen_salt('bf', 4))
    from unnest(array['A', 'B', 'C']) s;
end $$;

-- «intentos/autorizado/bloqueado» de la centinela del lote vigente.
create or replace function pg_temp.t42_cent(p_uid uuid) returns text language sql as $$
  select c.intentos_fallidos || '/' || (c.canje_autorizado_id is not null) || '/' || (c.bloqueado_hasta is not null)
    from public.codigos_recuperacion_totp c
   where c.perfil_id = p_uid and c.usado_en is null
   order by c.creado_en desc, c.id desc limit 1;
$$;

create or replace function pg_temp.t42_cent_id(p_uid uuid) returns uuid language sql as $$
  select c.id from public.codigos_recuperacion_totp c
   where c.perfil_id = p_uid and c.usado_en is null
   order by c.creado_en desc, c.id desc limit 1;
$$;

-- id del código con ese texto en claro (cada lote usa una etiqueta distinta).
create or replace function pg_temp.t42_cod(p_uid uuid, p_codigo text) returns uuid language sql as $$
  select c.id from public.codigos_recuperacion_totp c
   where c.perfil_id = p_uid and c.codigo_hash like '$2_$04$%' and c.codigo_hash = extensions.crypt(p_codigo, c.codigo_hash);
$$;

create or replace function pg_temp.t42_usado(p_uid uuid, p_codigo text) returns boolean language sql as $$
  select c.usado_en is not null from public.codigos_recuperacion_totp c
   where c.perfil_id = p_uid and c.codigo_hash like '$2_$04$%' and c.codigo_hash = extensions.crypt(p_codigo, c.codigo_hash);
$$;

create or replace function pg_temp.t42_n_aud(p_uid uuid, p_op text) returns bigint language sql as $$
  select count(*) from public.auditoria a where a.actor_id = p_uid and a.operacion = p_op;
$$;

create or replace function pg_temp.t42_n_aviso(p_uid uuid, p_tipo text) returns bigint language sql as $$
  select count(*) from public.notificaciones n where n.perfil_id = p_uid and n.tipo = p_tipo;
$$;

-- Los pasos dos, leídos como un valor suelto (corren con el rol y el JWT de la sesión).
create or replace function pg_temp.t42_p2_pin() returns text language sql as $$
  select d.motivo from public.desbloquear_historia() d;
$$;
create or replace function pg_temp.t42_p2_canje() returns text language sql as $$
  select c.motivo from public.canjear_codigo_recuperacion() c;
$$;

-- =========================================================================================
-- CA1 · Firmas
-- =========================================================================================
select pg_temp.assert(
  to_regprocedure('public.desbloquear_historia(text)') is null
  and to_regprocedure('public.canjear_codigo_recuperacion(text)') is null,
  'T-042 CA1 · las firmas de un paso desbloquear_historia(text) y canjear_codigo_recuperacion(text) ya no existen');

select pg_temp.assert(
  (select count(*) from pg_proc p
    where p.oid in ('public.comprobar_pin_historia(text)'::regprocedure,
                    'public.desbloquear_historia()'::regprocedure,
                    'public.comprobar_codigo_recuperacion(text)'::regprocedure,
                    'public.canjear_codigo_recuperacion()'::regprocedure)
      and p.prosecdef and p.provolatile = 'v'
      and p.proconfig @> array['search_path=""']) = 4,
  'T-042 CA1 · las cuatro funciones nuevas son security definer, volatile y con search_path vacío');

select pg_temp.assert(
  (select p.pronargs from pg_proc p where p.oid = 'public.comprobar_pin_historia(text)'::regprocedure) = 1
  and (select p.pronargs from pg_proc p where p.oid = 'public.comprobar_codigo_recuperacion(text)'::regprocedure) = 1
  and (select p.pronargs from pg_proc p where p.oid = 'public.desbloquear_historia()'::regprocedure) = 0
  and (select p.pronargs from pg_proc p where p.oid = 'public.canjear_codigo_recuperacion()'::regprocedure) = 0,
  'T-042 CA1 · las comprobaciones reciben un secreto; los pasos dos no reciben NADA (si recibieran el secreto, volvería el oráculo)');

select pg_temp.assert(
  (select p.prorettype from pg_proc p where p.oid = 'public.comprobar_pin_historia(text)'::regprocedure) = 'void'::regtype
  and (select p.prorettype from pg_proc p where p.oid = 'public.comprobar_codigo_recuperacion(text)'::regprocedure) = 'void'::regtype,
  'T-042 CA1 · las dos comprobaciones devuelven void');

select pg_temp.assert(
  has_function_privilege('authenticated', 'public.comprobar_pin_historia(text)', 'execute')
  and has_function_privilege('authenticated', 'public.desbloquear_historia()', 'execute')
  and has_function_privilege('authenticated', 'public.comprobar_codigo_recuperacion(text)', 'execute')
  and has_function_privilege('authenticated', 'public.canjear_codigo_recuperacion()', 'execute')
  and not has_function_privilege('anon', 'public.comprobar_pin_historia(text)', 'execute')
  and not has_function_privilege('anon', 'public.desbloquear_historia()', 'execute')
  and not has_function_privilege('anon', 'public.comprobar_codigo_recuperacion(text)', 'execute')
  and not has_function_privilege('anon', 'public.canjear_codigo_recuperacion()', 'execute'),
  'T-042 CA1 · authenticated ejecuta las cuatro; anon ninguna');

-- =========================================================================================
-- CA2 · El PIN nulo y el vacío son un intento fallido (antes, el nulo abría la historia)
-- =========================================================================================
call pg_temp.reset_sesion();
select pg_temp.t42_pin_reset(:PRO1);
select pg_temp.t42_n_aud(:PRO1, 'PIN_FALLIDO') as t42_f0 \gset

call pg_temp.como(:PRO1);
select public.comprobar_pin_historia(null);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto',
  'T-042 CA2 · comprobar_pin_historia(NULL) y después el paso dos: pin_incorrecto (antes daba ok y abría la historia sin PIN)');
select pg_temp.assert(not public.historia_desbloqueada(),
  'T-042 CA2 · tras el PIN nulo, historia_desbloqueada() sigue falsa');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '1/0/false',
  'T-042 CA2 · el PIN nulo suma un intento y deja la autorización a 0');
select pg_temp.assert(pg_temp.t42_n_aud(:PRO1, 'PIN_FALLIDO') = :t42_f0 + 1,
  'T-042 CA2 · el PIN nulo deja una fila PIN_FALLIDO');

call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('');
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto',
  'T-042 CA2 · el PIN vacío: pin_incorrecto');
select pg_temp.assert(not public.historia_desbloqueada(), 'T-042 CA2 · tras el PIN vacío, la historia sigue cerrada');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '2/0/false' and pg_temp.t42_n_aud(:PRO1, 'PIN_FALLIDO') = :t42_f0 + 2,
  'T-042 CA2 · el PIN vacío suma otro intento y otra fila PIN_FALLIDO');

call pg_temp.como(:PRO1);
select public.comprobar_pin_historia(null);
select public.comprobar_pin_historia(null);
select public.comprobar_pin_historia(null);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'bloqueado',
  'T-042 CA2 · cinco intentos nulos o vacíos bloquean: el paso dos dice bloqueado');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '5/0/true', 'T-042 CA2 · cinco fallos nulos/vacíos: contador 5 y bloqueado_hasta puesto');

-- =========================================================================================
-- CA3 · PIN en dos pasos
-- =========================================================================================
select pg_temp.t42_pin_reset(:PRO1);

-- (1) la comprobación da lo mismo con el PIN bueno y con el malo
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('999999')::text as t42_r_malo,
       pg_typeof(public.comprobar_pin_historia('999999'))::text as t42_t_malo \gset
select public.comprobar_pin_historia('111111')::text as t42_r_bueno,
       pg_typeof(public.comprobar_pin_historia('111111'))::text as t42_t_bueno \gset
select pg_temp.assert(:'t42_r_malo' = :'t42_r_bueno' and :'t42_t_malo' = :'t42_t_bueno' and :'t42_t_bueno' = 'void',
  'T-042 CA3.1 · comprobar_pin_historia da lo mismo con el PIN bueno y con el malo: void, sin fila distinta');
call pg_temp.reset_sesion();
select pg_temp.t42_pin_reset(:PRO1);

-- (2) el malo: +1, autorización a 0, paso dos pin_incorrecto, sin desbloqueo nuevo
select count(*) as t42_d0 from public.desbloqueos_historia where perfil_id = :PRO1 \gset
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('999999');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '1/0/false', 'T-042 CA3.2 · el PIN malo suma un intento y deja la autorización a 0');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA3.2 · tras el malo, el paso dos da pin_incorrecto');
call pg_temp.reset_sesion();
select pg_temp.assert((select count(*) from public.desbloqueos_historia where perfil_id = :PRO1) = :t42_d0,
  'T-042 CA3.2 · el PIN malo no abre ninguna ventana (ninguna fila nueva en desbloqueos_historia)');
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '1/0/false', 'T-042 CA3.2 · el paso dos no cuenta intentos: sin PIN no hay intento');

-- (3) el bueno: autoriza 60 s, el paso dos abre una vez; el segundo paso dos, pin_incorrecto
select pg_temp.t42_pin_reset(:PRO1);
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('111111');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '0/1/false'
  and (select ph.autorizado_hasta > now() and ph.autorizado_hasta <= now() + interval '60 seconds'
         from public.pines_historia ph where ph.perfil_id = :PRO1),
  'T-042 CA3.3 · el PIN bueno deja intentos 0, una autorización y autorizado_hasta a 60 s');
call pg_temp.como(:PRO1);
select d.desbloqueado, d.motivo, d.caduca_en is not null as con_caducidad from public.desbloquear_historia() d \gset t42_ok_
select pg_temp.assert(:'t42_ok_desbloqueado' = 't' and :'t42_ok_motivo' = 'ok' and :'t42_ok_con_caducidad' = 't',
  'T-042 CA3.3 · el paso dos tras el bueno da ok con caduca_en');
select pg_temp.assert(public.historia_desbloqueada(), 'T-042 CA3.3 · y la ventana queda abierta');
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA3.3 · un segundo paso dos da pin_incorrecto: la autorización se gastó');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '0/0/false', 'T-042 CA3.3 · tras gastarla quedan 0 autorizaciones');

-- (4) tres buenos seguidos: tope 2
select pg_temp.t42_pin_reset(:PRO1);
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('111111');
select public.comprobar_pin_historia('111111');
select public.comprobar_pin_historia('111111');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '0/2/false', 'T-042 CA3.4 · tres PIN buenos seguidos dejan 2 autorizaciones (tope)');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'ok' and pg_temp.t42_p2_pin() = 'ok' and pg_temp.t42_p2_pin() = 'pin_incorrecto',
  'T-042 CA3.4 · con 2 autorizaciones, el doble envío abre dos veces y el tercer paso dos da pin_incorrecto');
call pg_temp.reset_sesion();

-- (5) un bueno y luego un malo: 0
select pg_temp.t42_pin_reset(:PRO1);
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('111111');
select public.comprobar_pin_historia('999999');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '1/0/false', 'T-042 CA3.5 · un bueno y luego un malo dejan 0 autorizaciones (y un intento)');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA3.5 · y el paso dos da pin_incorrecto');
call pg_temp.reset_sesion();

-- (6) autorización caducada
select pg_temp.t42_pin_reset(:PRO1);
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('111111');
call pg_temp.reset_sesion();
update public.pines_historia set autorizado_hasta = now() - interval '1 second' where perfil_id = :PRO1;
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA3.6 · con la autorización caducada, el paso dos da pin_incorrecto');
call pg_temp.reset_sesion();

-- (7) sin paso uno
select pg_temp.t42_pin_reset(:PRO1);
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA3.7 · sin paso uno, el paso dos da pin_incorrecto');
select pg_temp.assert(not public.historia_desbloqueada(), 'T-042 CA3.7 · y la historia sigue cerrada');
call pg_temp.reset_sesion();

-- =========================================================================================
-- CA4 · El bloqueo del ADR-026 sigue igual
-- =========================================================================================
select pg_temp.t42_pin_reset(:PRO1);
select pg_temp.t42_n_aud(:PRO1, 'PIN_FALLIDO') as t42_pf0, pg_temp.t42_n_aud(:PRO1, 'PIN_BLOQUEADO') as t42_pb0,
       pg_temp.t42_n_aviso(:PRO1, 'pin_bloqueado') as t42_av0 \gset
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('000001');
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA4 · intento 1/5: pin_incorrecto');
select public.comprobar_pin_historia('000002');
select public.comprobar_pin_historia('000003');
select public.comprobar_pin_historia('000004');
select pg_temp.assert(pg_temp.t42_p2_pin() = 'pin_incorrecto', 'T-042 CA4 · intento 4/5: pin_incorrecto, todavía no bloquea');
select public.comprobar_pin_historia('000005');
select d.motivo, d.bloqueado_hasta between now() + interval '14 minutes' and now() + interval '15 minutes' as quince
  from public.desbloquear_historia() d \gset t42_b_
select pg_temp.assert(:'t42_b_motivo' = 'bloqueado' and :'t42_b_quince' = 't',
  'T-042 CA4 · el quinto fallo bloquea, quince minutos');
call pg_temp.reset_sesion();
select pg_temp.assert(
  pg_temp.t42_n_aud(:PRO1, 'PIN_FALLIDO') = :t42_pf0 + 5
  and pg_temp.t42_n_aud(:PRO1, 'PIN_BLOQUEADO') = :t42_pb0 + 1
  and pg_temp.t42_n_aviso(:PRO1, 'pin_bloqueado') = :t42_av0 + 1,
  'T-042 CA4 · exactamente cinco PIN_FALLIDO, un PIN_BLOQUEADO y un aviso pin_bloqueado');
select pg_temp.assert(
  (select count(*) from public.auditoria a
    where a.actor_id = :PRO1 and a.operacion = 'PIN_BLOQUEADO'
      and a.estado_posterior->>'bloqueado_hasta' is not null) = :t42_pb0 + 1,
  'T-042 CA4 · la entrada del bloqueo dice hasta cuándo');

-- el PIN correcto durante el bloqueo no autoriza ni toca la fila
call pg_temp.como(:PRO1);
select public.comprobar_pin_historia('111111');
select pg_temp.assert(pg_temp.t42_p2_pin() = 'bloqueado', 'T-042 CA4 · el PIN correcto durante el bloqueo: el paso dos sigue diciendo bloqueado');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '5/0/true',
  'T-042 CA4 · el PIN correcto durante el bloqueo no autoriza ni toca la fila (5/0/bloqueado)');
select pg_temp.assert(pg_temp.t42_n_aud(:PRO1, 'PIN_FALLIDO') = :t42_pf0 + 5,
  'T-042 CA4 · y no deja ningún PIN_FALLIDO más');

-- ni el PIN ni el hash en la auditoría
select pg_temp.assert(
  (select count(*) from public.auditoria a
    where a.actor_id = :PRO1 and a.operacion in ('PIN_FALLIDO', 'PIN_BLOQUEADO')
      and (a.estado_posterior ? 'hash' or a.estado_posterior::text like '%111111%' or a.estado_posterior::text like '%999999%')) = 0,
  'T-042 CA4 · ninguna entrada de auditoría lleva el PIN ni el hash');
select pg_temp.t42_pin_reset(:PRO1);

-- =========================================================================================
-- CA5 · Canje en dos pasos
-- =========================================================================================
-- (1) la comprobación da lo mismo con un código bueno y con uno malo
select pg_temp.t42_lote(:PRO1, 'T42X');
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('NOEXISTE')::text as t42_c_malo,
       pg_typeof(public.comprobar_codigo_recuperacion('NOEXISTE'))::text as t42_ct_malo \gset
select public.comprobar_codigo_recuperacion('T42XA')::text as t42_c_bueno,
       pg_typeof(public.comprobar_codigo_recuperacion('T42XA'))::text as t42_ct_bueno \gset
select pg_temp.assert(:'t42_c_malo' = :'t42_c_bueno' and :'t42_ct_malo' = :'t42_ct_bueno' and :'t42_ct_bueno' = 'void',
  'T-042 CA5.1 · comprobar_codigo_recuperacion da lo mismo con un código bueno y con uno malo: void');
call pg_temp.reset_sesion();

-- (2) el malo: +1 en el lote, autorización limpia, codigo_invalido
select pg_temp.t42_lote(:PRO1, 'T42M');
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('NOEXISTE');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_cent(:PRO1) = '1/false/false',
  'T-042 CA5.2 · el código malo suma un intento al lote y no deja autorización');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA5.2 · tras el malo, el paso dos da codigo_invalido');
call pg_temp.reset_sesion();

-- (3) el bueno autoriza ESE código; el paso dos canjea, marca usado, audita y avisa
select pg_temp.t42_lote(:PRO1, 'T42B');
select pg_temp.t42_n_aud(:PRO1, 'TOTP_REPUESTO') as t42_tr0, pg_temp.t42_n_aviso(:PRO1, 'totp_repuesto') as t42_ta0 \gset
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('T42BB');
call pg_temp.reset_sesion();
select pg_temp.assert(
  (select c.canje_autorizado_id from public.codigos_recuperacion_totp c where c.id = pg_temp.t42_cent_id(:PRO1)) = pg_temp.t42_cod(:PRO1, 'T42BB')
  and (select c.canje_autorizado_hasta > now() and c.canje_autorizado_hasta <= now() + interval '60 seconds'
         from public.codigos_recuperacion_totp c where c.id = pg_temp.t42_cent_id(:PRO1)),
  'T-042 CA5.3 · el código bueno autoriza ESE código durante 60 s (canje_autorizado_id = su id)');
call pg_temp.como(:PRO1);
select c.canjeado, c.motivo from public.canjear_codigo_recuperacion() c \gset t42_cj_
select pg_temp.assert(:'t42_cj_canjeado' = 't' and :'t42_cj_motivo' = 'ok', 'T-042 CA5.3 · el paso dos canjea: ok');
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA5.3 · un segundo paso dos da codigo_invalido');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_usado(:PRO1, 'T42BB'), 'T-042 CA5.3 · el código canjeado queda con usado_en');
select pg_temp.assert(not pg_temp.t42_usado(:PRO1, 'T42BC'), 'T-042 CA5.3 · y los demás del lote siguen sin usar');
select pg_temp.assert(pg_temp.t42_n_aud(:PRO1, 'TOTP_REPUESTO') = :t42_tr0 + 1
  and (select a.estado_posterior->>'via' from public.auditoria a
        where a.actor_id = :PRO1 and a.operacion = 'TOTP_REPUESTO' order by a.ocurrido_en desc, a.id desc limit 1) = 'codigo_recuperacion'
  and pg_temp.t42_n_aviso(:PRO1, 'totp_repuesto') = :t42_ta0 + 1,
  'T-042 CA5.3 · TOTP_REPUESTO con via = codigo_recuperacion y el aviso totp_repuesto, una sola vez');

-- (4) un bueno y luego un malo: codigo_invalido y el código sigue sin usar
select pg_temp.t42_lote(:PRO1, 'T42C');
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('T42CA');
select public.comprobar_codigo_recuperacion('NOEXISTE');
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA5.4 · un bueno y luego un malo: codigo_invalido');
call pg_temp.reset_sesion();
select pg_temp.assert(not pg_temp.t42_usado(:PRO1, 'T42CA'), 'T-042 CA5.4 · y el código sigue sin usar');

-- (5) lote nuevo entre los dos pasos
select pg_temp.t42_lote(:PRO1, 'T42D');
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('T42DA');
call pg_temp.reset_sesion();
select pg_temp.t42_lote(:PRO1, 'T42E');   -- el administrador o el titular generan otro lote entre los dos pasos
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA5.5 · un lote nuevo entre los dos pasos: codigo_invalido');
call pg_temp.reset_sesion();
-- (5b) el código autorizado ya no está vigente aunque la autorización de la centinela siga viva
-- (estado forjado como postgres: la centinela lleva la autorización de OTRO código del lote, ya usado)
select pg_temp.t42_lote(:PRO1, 'T42G');
select pg_temp.t42_cent_id(:PRO1) as t42_g_cent, (select o.id from public.codigos_recuperacion_totp o where o.perfil_id = :PRO1 and o.usado_en is null and o.id <> pg_temp.t42_cent_id(:PRO1) limit 1) as t42_g_a \gset
select pg_temp.assert(:'t42_g_cent' <> :'t42_g_a', 'T-042 CA5.5b · (fijación) el código A no es la centinela');
update public.codigos_recuperacion_totp c
   set canje_autorizado_id = :'t42_g_a', canje_autorizado_hasta = now() + interval '60 seconds'
 where c.id = :'t42_g_cent';
update public.codigos_recuperacion_totp c set usado_en = now() where c.id = :'t42_g_a';
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido',
  'T-042 CA5.5b · si el código autorizado ya no está vigente, el paso dos da codigo_invalido aunque la autorización siga viva');
call pg_temp.reset_sesion();

-- (6) autorización caducada y sin paso uno
select pg_temp.t42_lote(:PRO1, 'T42H');
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('T42HA');
call pg_temp.reset_sesion();
update public.codigos_recuperacion_totp c
   set canje_autorizado_hasta = now() - interval '1 second'
 where c.id = pg_temp.t42_cent_id(:PRO1);
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA5.6 · con la autorización caducada, el paso dos da codigo_invalido');
call pg_temp.reset_sesion();
select pg_temp.assert(not pg_temp.t42_usado(:PRO1, 'T42HA'), 'T-042 CA5.6 · y el código sigue sin usar');
select pg_temp.t42_lote(:PRO1, 'T42I');
call pg_temp.como(:PRO1);
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA5.6 · sin paso uno, el paso dos da codigo_invalido');
call pg_temp.reset_sesion();

-- =========================================================================================
-- CA6 · Lo que el canje ya hacía sigue igual
-- =========================================================================================
select pg_temp.t42_lote(:PRO1, 'T42J');
call pg_temp.como(:PRO1);     -- sesión SIN segundo factor (aal1): basta
select public.comprobar_codigo_recuperacion('NOEXISTE');
select public.comprobar_codigo_recuperacion('NOEXISTE');
select public.comprobar_codigo_recuperacion('NOEXISTE');
select public.comprobar_codigo_recuperacion('NOEXISTE');
select pg_temp.assert(pg_temp.t42_p2_canje() = 'codigo_invalido', 'T-042 CA6 · cuatro fallos: todavía codigo_invalido');
select public.comprobar_codigo_recuperacion('NOEXISTE');
select pg_temp.assert(pg_temp.t42_p2_canje() = 'bloqueado', 'T-042 CA6 · el quinto fallo bloquea el lote');
select public.comprobar_codigo_recuperacion('T42JA');
select pg_temp.assert(pg_temp.t42_p2_canje() = 'bloqueado', 'T-042 CA6 · el código bueno durante el bloqueo no autoriza: bloqueado');
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_cent(:PRO1) = '5/false/true' and not pg_temp.t42_usado(:PRO1, 'T42JA'),
  'T-042 CA6 · y no toca la fila (5 intentos, sin autorización, código sin usar)');

-- sin lote: sin_codigos
update public.codigos_recuperacion_totp set usado_en = now() where perfil_id = :PRO1 and usado_en is null;
call pg_temp.como(:PRO1);
select public.comprobar_codigo_recuperacion('T42JA');
select pg_temp.assert(pg_temp.t42_p2_canje() = 'sin_codigos', 'T-042 CA6 · sin lote vigente, el paso dos da sin_codigos');
call pg_temp.reset_sesion();

-- sin sesión y con el perfil inactivo: 42501
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select pg_temp.assert_lanza_codigo($q$select public.comprobar_pin_historia('111111')$q$, '42501',
  'T-042 CA6 · sin sesión, comprobar_pin_historia lanza 42501');
select pg_temp.assert_lanza_codigo($q$select * from public.desbloquear_historia()$q$, '42501',
  'T-042 CA6 · sin sesión, desbloquear_historia() lanza 42501');
select pg_temp.assert_lanza_codigo($q$select public.comprobar_codigo_recuperacion('X')$q$, '42501',
  'T-042 CA6 · sin sesión, comprobar_codigo_recuperacion lanza 42501');
select pg_temp.assert_lanza_codigo($q$select * from public.canjear_codigo_recuperacion()$q$, '42501',
  'T-042 CA6 · sin sesión, canjear_codigo_recuperacion() lanza 42501');
call pg_temp.reset_sesion();
call pg_temp.como(:PROBAJA);
select pg_temp.assert_lanza_codigo_msg($q$select public.comprobar_codigo_recuperacion('X')$q$, '42501', 'no está activo',
  'T-042 CA6 · con el perfil inactivo, comprobar_codigo_recuperacion lanza 42501');
select pg_temp.assert_lanza_codigo_msg($q$select * from public.canjear_codigo_recuperacion()$q$, '42501', 'no está activo',
  'T-042 CA6 · con el perfil inactivo, canjear_codigo_recuperacion() lanza 42501');
call pg_temp.reset_sesion();

-- =========================================================================================
-- CA7 · Solo lectura: el mismo error con el secreto bueno y con el malo, y ningún contador cambia
-- =========================================================================================
select pg_temp.t42_pin_reset(:PRO1);
select pg_temp.t42_lote(:PRO1, 'T42K');
call pg_temp.como(:PRO1);
savepoint t42_solo_lectura;
set local transaction_read_only = on;
select pg_temp.assert_lanza_codigo_msg($q$select public.comprobar_pin_historia('111111')$q$, '25006',
  'La comprobación del PIN exige una transacción de escritura', 'T-042 CA7 · PIN bueno en solo lectura: 25006 con el texto propio');
select pg_temp.assert_lanza_codigo_msg($q$select public.comprobar_pin_historia('999999')$q$, '25006',
  'La comprobación del PIN exige una transacción de escritura', 'T-042 CA7 · PIN malo en solo lectura: el mismo 25006 y el mismo texto');
select pg_temp.assert_lanza_codigo_msg($q$select public.comprobar_codigo_recuperacion('T42KA')$q$, '25006',
  'La comprobación del código exige una transacción de escritura', 'T-042 CA7 · código bueno en solo lectura: 25006 con el texto propio');
select pg_temp.assert_lanza_codigo_msg($q$select public.comprobar_codigo_recuperacion('NOEXISTE')$q$, '25006',
  'La comprobación del código exige una transacción de escritura', 'T-042 CA7 · código malo en solo lectura: el mismo 25006 y el mismo texto');
rollback to savepoint t42_solo_lectura;
call pg_temp.reset_sesion();
select pg_temp.assert(pg_temp.t42_pin(:PRO1) = '0/0/false' and pg_temp.t42_cent(:PRO1) = '0/false/false',
  'T-042 CA7 · ningún contador cambió');

-- =========================================================================================
-- CA8 · Estructura de las dos comprobaciones (DR3 de T-038)
-- =========================================================================================
create temp table t42_def as
select 'pin' as k, pg_get_functiondef('public.comprobar_pin_historia(text)'::regprocedure) as d
union all
select 'cod', pg_get_functiondef('public.comprobar_codigo_recuperacion(text)'::regprocedure);

select pg_temp.assert(
  (select strpos(d, 'transaction_read_only') > 0
      and strpos(d, 'transaction_read_only') < strpos(d, 'for update')
      and strpos(d, 'for update') < strpos(d, 'extensions.crypt(') from t42_def where k = 'pin')
  and (select strpos(d, 'transaction_read_only') > 0
      and strpos(d, 'transaction_read_only') < strpos(d, 'pg_advisory_xact_lock')
      and strpos(d, 'pg_advisory_xact_lock') < strpos(d, 'extensions.crypt(') from t42_def where k = 'cod'),
  'T-042 CA8 · la guarda de solo lectura y el candado van antes de extensions.crypt(');

select pg_temp.assert(
  (select count(*) from t42_def
    where substr(d, strpos(d, 'extensions.crypt(')) ~* '\m(if|return|raise)\M') = 0,
  'T-042 CA8 · después de extensions.crypt( no hay ningún if, return ni raise');

select pg_temp.assert(
  (select (length(d) - length(replace(d, 'update public.pines_historia', ''))) / length('update public.pines_historia') = 1
      and (length(d) - length(replace(d, 'insert into public.pines_historia', ''))) = 0 from t42_def where k = 'pin')
  and (select (length(d) - length(replace(d, 'update public.codigos_recuperacion_totp', ''))) / length('update public.codigos_recuperacion_totp') = 1
      from t42_def where k = 'cod'),
  'T-042 CA8 · una sola sentencia escribe en la tabla del contador');

select pg_temp.assert(
  (select count(*) from t42_def
    where d ~* '(raise|format|jsonb_build_object|execute)[^;]*\m(p_pin|p_codigo)\M'
       or d ~* '\m(p_pin|p_codigo)\M[^;]*(raise|format|jsonb_build_object|execute)') = 0,
  'T-042 CA8 · el parámetro secreto no aparece en raise, format, jsonb_build_object ni execute');

select pg_temp.assert(
  (select count(*) from t42_def where d ~* '\mexception\s+when\M') = 0
  and pg_get_functiondef('public.desbloquear_historia()'::regprocedure) !~* '\mexception\s+when\M'
  and pg_get_functiondef('public.canjear_codigo_recuperacion()'::regprocedure) !~* '\mexception\s+when\M',
  'T-042 CA8 · ninguna de las cuatro lleva exception when');

drop table t42_def;

-- Deja el PIN y el lote como los encontró 03/13: sin contadores ni autorizaciones.
select pg_temp.t42_pin_reset(:PRO1);

\echo '24-pin-y-canje-dos-pasos: completo.'
