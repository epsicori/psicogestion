-- T-012b · El verificador coteja el sobre sellado con las columnas de la fila.
--
-- `fn_sellar_version_nota()` (T-005/T-012a) compara sobre y fila SOLO
-- `before insert` (comprobaciones 6.2-6.7 y 6.10). Con los cerrojos
-- levantados (`grant update … to postgres` + `disable trigger
-- impedir_modificacion_notas_clinicas_versiones`), un `update … set alcance
-- = 'conjunta'` sobre una versión sellada `individual` no toca el sobre
-- (`contenido_canonico`): la huella sigue cuadrando con esos bytes y
-- `verificar_cadena_huellas()` seguía dando la cadena por sana. Es el
-- hallazgo M1 de `tickets/T-012a/revision.md`, dejado abierto en la bitácora
-- de T-012a («antes de que T-012 firme la primera versión»), y el ADR-057
-- §Consecuencias promete lo contrario: «un alcance alterado por debajo […]
-- el verificador lo señala».
--
-- El propietario decidió el 24-09-2026 que el verificador lo detecte, con un
-- motivo nuevo, `sobre_no_coincide_con_fila`. El mismo agujero existe para
-- las otras seis columnas que el firmante copia del sobre
-- (`lib/huella/firmar.ts:51-61`): `cuerpo`, `anotaciones_reservadas`,
-- `autor_id`, `motivo_cambio`, `esquema_version` y `creada_en`. Esta
-- migración coteja las siete, con la MISMA semántica que las comprobaciones
-- 6.2-6.7 y 6.10 de `fn_sellar_version_nota()` (`20260915130000_alcance_en_
-- el_sobre.sql:180-286`): la huella se sigue calculando SOLO sobre los bytes
-- guardados (ADR-035), aquí se comparan valores, nada se reserializa.
--
-- Sin guarda de era: no cambia datos ni la forma del sobre, y tiene que
-- aplicarse igual sobre una base con filas ya firmadas.
--
-- `create or replace`, NUNCA `drop function`: la misma firma, los mismos
-- nombres y tipos de columna de retorno, en el mismo orden, evita que
-- Supabase conceda EXECUTE por defecto a anon/authenticated/service_role
-- (D3 del diseño de T-012b).

create or replace function public.verificar_cadena_huellas(p_paciente_id uuid default null)
returns table (
  paciente_id     uuid,
  posicion_cadena integer,
  version_id      uuid,
  nota_id         uuid,
  creada_en       timestamptz,
  motivo          text
)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select
      v.paciente_id,
      v.posicion_cadena,
      v.id as version_id,
      v.nota_id,
      v.creada_en,
      v.huella,
      v.huella_anterior,
      v.contenido_canonico,
      v.algoritmo_version,
      lag(v.huella) over (partition by v.paciente_id order by v.posicion_cadena) as huella_prev_real,
      lag(v.posicion_cadena) over (partition by v.paciente_id order by v.posicion_cadena) as posicion_prev,
      v.cuerpo,
      v.anotaciones_reservadas,
      v.autor_id,
      v.esquema_version,
      v.motivo_cambio,
      v.alcance,
      case when pg_input_is_valid(v.contenido_canonico, 'jsonb')
           then v.contenido_canonico::jsonb end                                   as sobre,
      case when pg_input_is_valid(v.cuerpo, 'jsonb')
           then v.cuerpo::jsonb end                                               as cuerpo_jsonb,
      to_jsonb(to_char(v.creada_en at time zone 'UTC',
                       'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))                          as creada_en_iso
    from public.notas_clinicas_versiones v
    where p_paciente_id is null or v.paciente_id = p_paciente_id
  )
  -- era_desconocida: no se verifica, se declara — verificar una era ajena
  -- con el algoritmo de esta sería inventar. Es un punto ciego por diseño, y
  -- por eso la guarda 1.bis de fn_sellar_version_nota() impide que lo elija
  -- quien firma: a la era 2 solo se llega por una migración que suba esa
  -- constante (hallazgo MEDIA de la tercera revisión con Opus del 06-09-2026).
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'era_desconocida'::text as motivo
    from c
   where c.algoritmo_version <> 1

  union all

  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'huella_no_coincide'::text
    from c
   where c.algoritmo_version = 1
     and extensions.digest(convert_to(c.contenido_canonico, 'UTF8') || c.huella_anterior, 'sha256')
         <> c.huella

  union all

  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'genesis_incorrecto'::text
    from c
   where c.algoritmo_version = 1
     and c.posicion_prev is null
     and c.posicion_cadena = 1
     and c.huella_anterior <> decode(repeat('00', 32), 'hex')

  union all

  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'hueco_de_posicion'::text
    from c
   where c.algoritmo_version = 1
     and (
       (c.posicion_prev is null and c.posicion_cadena <> 1)
       or (c.posicion_prev is not null and c.posicion_cadena <> c.posicion_prev + 1)
     )

  union all

  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'eslabon_desencadenado'::text
    from c
   where c.algoritmo_version = 1
     and c.posicion_prev is not null
     and c.posicion_cadena = c.posicion_prev + 1
     and c.huella_anterior <> c.huella_prev_real

  union all

  -- sobre_no_coincide_con_fila (T-012b, ADR-057): cada columna que el
  -- firmante copia del sobre (lib/huella/firmar.ts) se coteja con su clave
  -- SELLADA, con la MISMA semántica que la comprobación del disparador que
  -- la validó al insertar. La huella sigue calculándose solo sobre los
  -- bytes guardados (ADR-035): aquí se comparan valores, no se reserializa
  -- nada.
  select c.paciente_id, c.posicion_cadena, c.version_id, c.nota_id, c.creada_en,
         'sobre_no_coincide_con_fila'::text
    from c
   where c.algoritmo_version = 1
     and (
          c.sobre is null                                                    -- no es JSON: no se puede cotejar
       or jsonb_typeof(c.sobre) <> 'object'
       or (c.sobre -> 'alcance')                is distinct from to_jsonb(c.alcance::text)                         -- 6.10
       or (c.sobre -> 'autor_id')               is distinct from to_jsonb(c.autor_id::text)                        -- 6.2
       or (c.sobre -> 'cuerpo')                 is distinct from c.cuerpo_jsonb                                    -- 6.3
       or (c.sobre -> 'anotaciones_reservadas') is distinct from coalesce(to_jsonb(c.anotaciones_reservadas), 'null'::jsonb) -- 6.4
       or (c.sobre -> 'esquema_version')        is distinct from to_jsonb(c.esquema_version)                       -- 6.5
       or (c.sobre -> 'motivo_cambio')          is distinct from coalesce(to_jsonb(c.motivo_cambio), 'null'::jsonb)          -- 6.6
       or (c.sobre -> 'creada_en')              is distinct from c.creada_en_iso                                   -- 6.7
       or (c.sobre -> 'firmada_en')             is distinct from c.creada_en_iso                                   -- 6.7
     )

  order by 1, 2, 6;
$$;

comment on function public.verificar_cadena_huellas(uuid) is
  'Verificador de la cadena de huellas (T-005). Recorre notas_clinicas_versiones LEYENDO '
  'LOS BYTES GUARDADOS de contenido_canonico y huella_anterior — NUNCA reserializa el '
  'objeto (ADR-035): no hay ningún canonicalizador en la base, así que la tentación '
  'desaparece por construcción. p_paciente_id null recorre todas las cadenas. Cero filas '
  'es la cadena sana; una fila por anomalía, con el motivo cerrado: huella_no_coincide, '
  'eslabon_desencadenado, genesis_incorrecto, hueco_de_posicion, era_desconocida, '
  'sobre_no_coincide_con_fila. Además coteja las siete columnas que el sobre repite '
  '(alcance, autor_id, cuerpo, anotaciones_reservadas, esquema_version, motivo_cambio, '
  'creada_en) con su clave sellada, con la semántica de las comprobaciones 6.2-6.7 y 6.10 '
  'de fn_sellar_version_nota(); cotejar valores no es reserializar (ADR-035). Una fila '
  'por versión divergente, no por columna.';

-- No se concede a `authenticated`: recorrer todas las cadenas revela cuántas
-- versiones tiene cada paciente, saltándose la RLS. Es una herramienta de
-- operación y la ejecuta `postgres`. `create or replace` conserva los
-- permisos de la definición original, así que este `revoke` es redundante —
-- se deja escrito junto a la función para que la invariante quede explícita
-- aquí también (T-012b).
revoke all on function public.verificar_cadena_huellas(uuid) from public, anon, authenticated, service_role;
