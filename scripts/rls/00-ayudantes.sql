-- T-003 · Ayudantes del banco de pruebas de RLS.
--
-- La diferencia con los guiones anteriores (t000/t001/t002/t004): aquí una aserción rota
-- LANZA una excepción, y con `-v ON_ERROR_STOP=1` eso hace que psql salga con código
-- distinto de cero. Nadie tiene que leer la salida para saber si el banco pasó.

create or replace function pg_temp.assert(condicion boolean, mensaje text)
returns void
language plpgsql
as $$
begin
  if condicion is distinct from true then
    raise exception 'ASERCIÓN FALLIDA: %', mensaje;
  end if;
end;
$$;

-- Para las negativas que hoy se comprueban dejando que psql muestre un error: ejecuta
-- `consulta` y falla si NO lanza. El motivo de que sea texto y no un bloque directo es que
-- así una sola llamada sirve para SELECT, INSERT, UPDATE o DELETE sin repetir el molde de
-- captura de excepción en cada sitio.
create or replace function pg_temp.assert_lanza(consulta text, mensaje text)
returns void
language plpgsql
as $$
begin
  begin
    execute consulta;
  exception when others then
    return; -- lanzó: correcto, se acabó
  end;
  raise exception 'ASERCIÓN FALLIDA (debía lanzar y no lanzó): %', mensaje;
end;
$$;

-- Cuenta filas de una consulta arbitraria bajo la sesión (rol + jwt) ya establecida. Sirve
-- para no repetir `select count(*) from ...` con su `perform`/`into` en cada bloque.
create or replace function pg_temp.contar(consulta text)
returns bigint
language plpgsql
as $$
declare
  v_n bigint;
begin
  execute 'select count(*) from (' || consulta || ') t' into v_n;
  return v_n;
end;
$$;

-- Cambia de sesión: rol Postgres `authenticated` y el `sub` del JWT. Envuelve el patrón que
-- ya usan t000/t001/t002/t004, para no repetir las dos líneas `set local` en cada bloque.
create or replace procedure pg_temp.como(p_uid uuid)
language plpgsql
as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims = %L', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text);
end;
$$;

create or replace procedure pg_temp.reset_sesion()
language plpgsql
as $$
begin
  reset role;
  reset request.jwt.claims;
end;
$$;

\echo '00-ayudantes: assert, assert_lanza, contar y como() definidos.'
