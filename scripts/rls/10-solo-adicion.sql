-- T-003 · Batería de solo adición (invariante 2, T-004). `update`, `delete` y `truncate`
-- fallan en las cuatro tablas, incluido como `postgres` — con el privilegio recuperado a
-- propósito, para comprobar la CAPA 2 (disparador), no solo la capa 1 (revoke).

\echo ''
\echo '=== 10-solo-adicion ==='

do $$
declare
  r record;
  v_columna text;
begin
  for r in select tabla from public.tablas_solo_adicion loop
    -- `id` es GENERATED ALWAYS AS IDENTITY en tres de las cuatro tablas: un `update ...
    -- set id = id` fallaría por eso ANTES de llegar al disparador, y assert_lanza no
    -- distinguiría esa causa de la que se quiere probar. Se elige una columna cualquiera
    -- que NO sea de identidad para que el fallo venga del disparador, no de otra cosa.
    select column_name into v_columna
    from information_schema.columns
    where table_schema = 'public' and table_name = r.tabla and is_identity = 'NO'
    limit 1;

    -- UPDATE sin privilegio: lanza, pero esto NO aísla la capa 1 de la capa 2 —con el
    -- disparador de fila también activo, no se puede saber cuál de las dos lo bloqueó—.
    -- La capa 1 en sí misma se verifica de forma aislada más abajo, por catálogo
    -- (`cobertura_solo_adicion()`, que mira `information_schema.table_privileges`
    -- directamente y no depende de que el disparador exista).
    perform pg_temp.assert_lanza(
      format('update public.%I set %I = %I', r.tabla, v_columna, v_columna),
      format('UPDATE en %s debe fallar (capa 1 y/o capa 2, sin distinguir todavía cuál)', r.tabla)
    );

    -- Con el privilegio RECUPERADO, la capa 2 (disparador) sigue bloqueando.
    execute format('grant update, delete on table public.%I to postgres', r.tabla);
    perform pg_temp.assert_lanza(
      format('update public.%I set %I = %I', r.tabla, v_columna, v_columna),
      format('Con privilegio recuperado, UPDATE en %s sigue bloqueado por el disparador (capa 2)', r.tabla)
    );
    perform pg_temp.assert_lanza(
      format('delete from public.%I', r.tabla),
      format('Con privilegio recuperado, DELETE en %s sigue bloqueado por el disparador (capa 2)', r.tabla)
    );

    -- TRUNCATE: la capa 3, la que casi nadie escribe.
    perform pg_temp.assert_lanza(
      format('truncate table public.%I', r.tabla),
      format('TRUNCATE en %s debe fallar por el disparador de sentencia (capa 3)', r.tabla)
    );

    -- Se devuelve la capa 1 a como estaba: el privilegio se concedió solo para poder
    -- probar la capa 2 con la capa 1 fuera de juego. Sin este revoke, el comprobador de
    -- cobertura de después vería —con razón— la capa 1 rota, porque lo estaría de verdad.
    execute format('revoke update, delete on table public.%I from postgres', r.tabla);

    raise notice '10-solo-adicion: % — tres capas verificadas y la capa 1 restaurada', r.tabla;
  end loop;
end $$;

-- El comprobador de cobertura de T-004, en cero — repetido aquí porque es justo lo que
-- este ticket exige demostrar, no solo dar por bueno.
select pg_temp.assert(
  (select count(*) from public.cobertura_solo_adicion()) = 0,
  'El comprobador de cobertura de solo adición debe devolver CERO filas'
);

\echo '10-solo-adicion: completa.'
