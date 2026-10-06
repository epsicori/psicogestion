-- =========================================================================
-- T-021 · Ronda 3 del esquema económico
--
-- Tres piezas, todas hacia delante y sin tocar la migración 20261011120000:
--   1. B-H1: el bono de una cita realizada o terminada se puede poner una vez
--      (de nulo a un bono); cambiarlo o quitarlo sigue cerrado.
--   2. A-H2: el profesional lee los borradores de factura mientras tiene asignado
--      al paciente, no mientras fue su autor.
--   3. Cotas del sellado (A-H1, B-H2, B-H3) en un disparador hermano del que sella:
--      concepto visible, techo del tipo de IVA y banda de la cuota.
--
-- No se redefine fn_sellar_version_borrador(): solo se reemite su comentario.
-- =========================================================================


-- =========================================================================
-- 1 · B-H1 · el bono de la cita terminada se pone una vez
-- =========================================================================
create or replace function public.fn_bono_de_la_cita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paciente_bono uuid;
begin
  -- Ronda 3 (B-H1): de nulo a un bono se admite una vez; cambiarlo o quitarlo, no
  -- (mismo patrón que episodio_id en fn_proteger_cita_pasada, T-039). Se mira old.
  if tg_op = 'UPDATE'
     and old.bono_id is not null
     and old.bono_id is distinct from new.bono_id
     and (old.estado = 'realizada'::public.estado_cita or old.fin <= now()) then
    raise exception 'La cita realizada o pasada ya no se cambia de bono: el consumo de un bono pagado no se reescribe (T-021)'
      using errcode = '42501';
  end if;
  if new.bono_id is not null then
    select b.paciente_id into v_paciente_bono from public.bonos b where b.id = new.bono_id;
    -- Un bono que no existe lo rechaza la clave ajena (23503).
    if found and v_paciente_bono is distinct from new.paciente_id then
      raise exception 'La cita no puede descontar de ese bono: el bono es de otro paciente (T-021, D8)'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_bono_de_la_cita() from public;

comment on function public.fn_bono_de_la_cita() is
  'Disparador before insert or update of bono_id, paciente_id sobre citas: el bono de una cita '
  'es del mismo paciente que la cita, o 23514 (T-021, D8); y 42501 si la cita (old) está '
  'realizada o ya terminó, ya tenía bono y el bono cambia o se quita (rondas 2 y 3). De nulo a '
  'un bono se admite una vez. security definer para ver el bono aunque la RLS de bonos no lo '
  'enseñe a quien edita la cita.';

comment on column public.citas.bono_id is
  'Bono del que descuenta esta cita cuando se realiza (T-021, D8). Debe ser del mismo paciente. '
  'En la cita realizada o terminada, un bono nulo se puede poner una vez; el que ya tiene no se '
  'cambia ni se quita, porque reescribiría el consumo de un bono pagado (rondas 2 y 3).';


-- =========================================================================
-- 2 · A-H2 · el profesional lee mientras tiene asignado al paciente
-- =========================================================================
alter policy borradores_factura_lectura on public.borradores_factura
  using (
    (select public.rol_actual()) = 'administrador'::public.rol_usuario
    or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
        and public.es_profesional_asignado(paciente_id))
  );


-- =========================================================================
-- 3 · Cotas del sellado, en un disparador hermano
-- =========================================================================
create function public.fn_cotas_version_borrador()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Un carácter que se ve: ni blanco Unicode, ni de control, ni de anchura cero, ni selector.
  -- Escapes \u del motor de expresiones regulares en una cadena normal: ningún carácter crudo.
  v_visible constant text := '[^[:space:]\u0001-\u0020\u007F-\u00A0\u00AD\u034F\u061C\u115F\u1160\u1680\u17B4\u17B5\u180B-\u180F\u2000-\u200F\u2028-\u202F\u205F-\u206F\u2800\u3000\u3164\uFE00-\uFE0F\uFEFF\uFFA0\U000E0000-\U000E007F\U000E0100-\U000E01EF]';
  v_linea         jsonb;
  v_tipo          numeric;
  v_cantidad      numeric;
  v_cuota_exacta  numeric := 0;  -- céntimos, sin redondear
  v_unidades      numeric := 0;  -- unidades en régimen general
begin
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
      v_cantidad := (v_linea ->> 'cantidad')::numeric;
      v_cuota_exacta := v_cuota_exacta
        + v_cantidad * (v_linea ->> 'precio_unitario_centimos')::numeric * v_tipo / (10000 + v_tipo);
      v_unidades := v_unidades + v_cantidad;
    end if;
  end loop;

  if v_unidades > 0 and abs(new.cuota_iva * 100 - v_cuota_exacta) > v_unidades then
    raise exception 'La cuota de IVA está fuera de la banda que admiten las líneas en régimen general con su tipo (T-021, D4)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.fn_cotas_version_borrador() is
  'Disparador before insert sobre borradores_factura_versiones, hermano de '
  'fn_sellar_version_borrador (T-021, ronda 3). Corre después de él por orden de nombre, así que '
  'cada línea ya llega validada. Tres cotas, todas 23514: concepto con al menos un carácter '
  'visible; tipo de IVA como mucho 10000 centésimas; y la cuota sellada a como mucho tantos '
  'céntimos de la cuota exacta de las líneas en régimen general como unidades generales hay. '
  'security invoker: no lee ninguna tabla.';

revoke execute on function public.fn_cotas_version_borrador() from public;

create trigger sellar_version_borrador_cotas
  before insert on public.borradores_factura_versiones
  for each row execute function public.fn_cotas_version_borrador();

comment on trigger sellar_version_borrador_cotas on public.borradores_factura_versiones is
  'Cotas del sellado (T-021, ronda 3). El nombre empieza por el del disparador que sella para que '
  'corra después por orden alfabético: los permisos y el cotejo van antes que estas cotas.';

comment on function public.fn_sellar_version_borrador() is
  'Disparador before insert sobre borradores_factura_versiones (T-021, D5). Paso 0: permisos '
  '(42501 único). Paso 1: el llamante no manda huella, huella_anterior, numero_version, '
  'paciente_id ni profesional_id. Paso 1.bis: algoritmo_version = 1. Pasos 2-5: cabecera con '
  'for no key update, cerrojo consultivo por borrador, numero_version = máximo + 1, génesis de 32 '
  'bytes cero. Paso 6: sobre de quince claves cotejado con la fila y la cabecera, líneas de seis '
  'claves, suma de líneas = total, todo exento implica cuota 0, citas del mismo paciente (23514). '
  'Paso 7: huella = SHA-256(sobre || huella_anterior). Las cotas de la ronda 3 (concepto visible, '
  'tipo <= 10000, banda de la cuota) las pone fn_cotas_version_borrador(), en el disparador '
  'sellar_version_borrador_cotas, que corre después de este por orden de nombre.';
