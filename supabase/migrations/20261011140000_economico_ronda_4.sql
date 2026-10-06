-- =========================================================================
-- T-021 · Ronda 4 del esquema económico
--
-- Una sola pieza, hacia delante y sin tocar las migraciones 20261011120000 ni
-- 20261011130000: se redefine fn_cotas_version_borrador().
--   1. A-H1 = B-H1, B-H2: la tolerancia de la banda de la cuota pasa a ser un
--      céntimo por línea general que mueva al menos un céntimo de cuota,
--      T = suma de least(1, |Q_i|), y la banda corre si hay alguna línea general.
--   2. A-H2 / B-H3: la clase de lo invisible es una lista fija de 34 tramos de
--      puntos de código, escritos como enteros hexadecimales y montados con chr().
--
-- El disparador sellar_version_borrador_cotas no cambia: sigue llamando a esta
-- función. Los mensajes de error y su código son los de la ronda 3.
-- =========================================================================

create or replace function public.fn_cotas_version_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Puntos de código que no se ven (T-021, ronda 4). Tramos generados con Node 24.14.1
  -- (Unicode 17.0): Default_Ignorable_Code_Point, Cf, White_Space y Cc, más las marcas
  -- combinantes genéricas (0300-036F, 1AB0-1AFF, 1DC0-1DFF, 20D0-20FF, FE20-FE2F) y U+2800.
  -- Enteros hexadecimales y chr(): el fichero no lleva ninguna barra invertida.
  -- tramos:inicio
  v_tramos constant integer[] := array[
    [0x0001, 0x0020],
    [0x007F, 0x00A0],
    [0x00AD, 0x00AD],
    [0x0300, 0x036F],
    [0x0600, 0x0605],
    [0x061C, 0x061C],
    [0x06DD, 0x06DD],
    [0x070F, 0x070F],
    [0x0890, 0x0891],
    [0x08E2, 0x08E2],
    [0x115F, 0x1160],
    [0x1680, 0x1680],
    [0x17B4, 0x17B5],
    [0x180B, 0x180F],
    [0x1AB0, 0x1AFF],
    [0x1DC0, 0x1DFF],
    [0x2000, 0x200F],
    [0x2028, 0x202F],
    [0x205F, 0x206F],
    [0x20D0, 0x20FF],
    [0x2800, 0x2800],
    [0x3000, 0x3000],
    [0x3164, 0x3164],
    [0xFE00, 0xFE0F],
    [0xFE20, 0xFE2F],
    [0xFEFF, 0xFEFF],
    [0xFFA0, 0xFFA0],
    [0xFFF0, 0xFFFB],
    [0x110BD, 0x110BD],
    [0x110CD, 0x110CD],
    [0x13430, 0x1343F],
    [0x1BCA0, 0x1BCA3],
    [0x1D173, 0x1D17A],
    [0xE0000, 0xE0FFF]
  ];
  -- tramos:fin
  v_visible      text := '[^';
  v_linea        jsonb;
  v_tipo         numeric;
  v_q            numeric;            -- cuota exacta de una línea general, en céntimos
  v_cuota_exacta numeric := 0;       -- Q: suma de v_q
  v_holgura      numeric := 0;       -- T: suma de least(1, |v_q|)
  v_hay_general  boolean := false;
begin
  for i in 1 .. array_length(v_tramos, 1) loop
    if v_tramos[i][1] = v_tramos[i][2] then
      v_visible := v_visible || chr(v_tramos[i][1]);
    else
      v_visible := v_visible || chr(v_tramos[i][1]) || '-' || chr(v_tramos[i][2]);
    end if;
  end loop;
  v_visible := v_visible || ']';

  for v_linea in select e from jsonb_array_elements(new.lineas) as e loop
    if (v_linea ->> 'concepto') !~ v_visible then
      raise exception 'Un concepto invisible no vale: la línea solo lleva blancos o caracteres de anchura cero (T-021)'
        using errcode = '23514';
    end if;
    v_tipo := (v_linea ->> 'tipo_iva_centesimas')::numeric;
    if v_tipo > 10000 then
      raise exception 'El tipo de IVA de una línea es como mucho 10000 centésimas, el cien por cien (T-021, D4)'
        using errcode = '23514';
    end if;
    if (v_linea ->> 'regimen_iva') = 'general' then
      v_q := (v_linea ->> 'cantidad')::numeric
           * (v_linea ->> 'precio_unitario_centimos')::numeric * v_tipo / (10000 + v_tipo);
      v_cuota_exacta := v_cuota_exacta + v_q;
      v_holgura      := v_holgura + least(1, abs(v_q));
      v_hay_general  := true;
    end if;
  end loop;

  if v_hay_general and abs(new.cuota_iva * 100 - v_cuota_exacta) > v_holgura then
    raise exception 'La cuota de IVA está fuera de la banda que admiten las líneas en régimen general con su tipo (T-021, D4)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_cotas_version_borrador() from public;

comment on function public.fn_cotas_version_borrador() is
  'Disparador before insert sobre borradores_factura_versiones, hermano de '
  'fn_sellar_version_borrador (T-021, rondas 3 y 4). Corre después de él por orden de nombre, así '
  'que cada línea ya llega validada. Tres cotas, todas 23514: concepto con al menos un punto de '
  'código fuera de la lista fija de invisibles (generada de Unicode 17.0: '
  'Default_Ignorable_Code_Point, Cf, White_Space, Cc, marcas combinantes genéricas y U+2800); '
  'tipo de IVA como mucho 10000 centésimas; y, si hay alguna línea en régimen general, la cuota '
  'sellada a como mucho T céntimos de la cuota exacta Q de esas líneas, con T igual a la suma por '
  'línea general de least(1, |cuota exacta de la línea|). '
  'security invoker: no lee ninguna tabla. Redefine la de 20261011130000.';
