**Sin hallazgos ALTA.** Revisión de seguridad, ronda 1, de T-047 sobre `47abe5f` (base `main`).

Resumen: el modelo de quién ve qué de las dos funciones es correcto y el banco 34 tumba los mutantes
de seguridad que importan. Hay una MEDIA: `tipos-bd.ts` está editado a mano y no coincide con lo que
genera el generador, así que CI lo rechaza. Hay tres BAJA: tres aserciones del banco salen verdes
por un motivo que no es el suyo.

## Qué se comprobó (sin hallazgo)

- **Migración `20261017120000`**: las dos funciones son `plpgsql stable security invoker` con
  `search_path = ''`, y todo nombre de objeto va cualificado (`public.*`; lo demás es `pg_catalog`).
  `revoke all … from public, anon, service_role` y `grant execute … to authenticated` van con la firma
  completa en las dos. La rama `citas` lleva el filtro explícito `rol_actual() in (administrador,
  profesional_sanitario)`, y la rama `citas_agenda` solo da filas al técnico de sus centros. Esa vista
  es definer y tiene su propio `where`. Contrastado con `citas_lectura` (`20260906120000:691`, la
  única política de SELECT sobre `citas`) y con `citas_agenda` (`20261007120000:1434`).
- **Quién ve qué**:
  - El administrador ve todas.
  - El profesional ve `profesional_id = auth.uid()`. Si pasa `p_profesional_id` de otro, recibe cero,
    igual que con un uuid inexistente.
  - El técnico ve solo `centro_id ∈ centros_actuales()`. Un `p_centro_id` ajeno le da cero, igual
    que un centro inexistente.
  - Sin rol (baja o suspendido), ninguna de las dos ramas da filas.

  Ningún error depende de los datos: las cuatro guardas miran solo los parámetros. No hay oráculo de
  existencia.
- **Fuga por agregados**: la densidad cuenta un subconjunto de lo que el mes ya enseña al mismo
  usuario (mismas ramas y canceladas fuera). La lista de profesionales sale de las mismas filas
  visibles, y los nombres de `directorio_perfiles` son los mismos que da `agenda_citas_rango`. El
  técnico no obtiene ningún dato que no vea ya en el mes.
- **`p_zona` elegida por el llamante**: solo mueve el borde de día de las citas que ya ve.
  `es_zona_iana` va antes que la cota del año, y la cota no deja pasar `infinity` ni `-infinity`.
- **Lo que llega al cliente**: `VistaAnio` lleva cadenas, números y booleanos (recuentos, nombres
  accesibles, tramos y la lista de profesionales). No lleva ninguna columna de cita, paciente, tipo ni
  estado. `centro` llega a la RPC ya resuelto por `resolverCentro`, y `profesional` llega validado
  como uuid. No hay `use cache` ni clave de servicio.
- **Mutantes medidos** en `begin … rollback` sobre `supabase_db_Psicogestion` (00 + 01 + banco 34
  con el año sintético reducido a marzo; bloques A–F reejecutados con cada mutante en un
  `savepoint`):

  | Mutante | Resultado | Aserciones que lo tumban |
  |---|---|---|
  | M1 · densidad sin el filtro de rol | MUERE | C9, C10, D3 |
  | M5 · densidad sin el filtro de centro | MUERE | C2, D1, E6 |
  | M6 · `or centro_id is null` en la densidad | MUERE | C2, E6 |
  | M7 · densidad sin el filtro de profesional | MUERE | C3, D2, E1… |
  | M9 · densidad `security definer` | MUERE | A3, C5, D2 |
  | M9L · lista `security definer` | MUERE | A3, F1, F4 |
  | Lista sin el filtro de centro | MUERE | F1, F2 |
  | M12 · `grant execute` a `public` o a `anon` | MUERE, pero solo por A5 | — |
  | Lista sin el filtro de rol | **SOBREVIVE** | ver H3 |
  | Lista con `or centro_id is null` | **SOBREVIVE** | ver H4 |

## MEDIA

### H1 · `lib/supabase/tipos-bd.ts:4053`: los tipos están editados a mano y no coinciden con los generados (contrato)
La bitácora dice «`tipos-bd.ts` editado a mano (las dos RPC): regenerar cuando la base esté libre».
`.claude/rules/supabase.md` lo prohíbe: «se genera, nunca se edita, y CI lo compara».

- **Escenario**: se ejecuta `npx supabase gen types typescript --local` con la base en
  `20261017120000` y se compara con el fichero comiteado. La única diferencia es el orden:
  - el generador pone `agenda_densidad_anual` antes de `agenda_descartar_propuesta`;
  - el fichero comiteado la pone después.
- **Efecto**: el paso «Los tipos generados no se editan a mano» del workflow
  (`git diff --exit-code -- lib/supabase/tipos-bd.ts`) falla y el PR queda rojo.
- **Arreglo**: `npx supabase db reset && npm run tipos` y comitear el resultado.

## BAJA

### H2 · `scripts/rls/34-agenda-anual.sql:305-310`: A6 («anon recibe 42501») sale verde aunque `anon` tenga `execute` (prueba)
A6 usa `assert_lanza_codigo` sin fragmento de mensaje.

- **Escenario**: en una transacción, `grant execute on function public.agenda_densidad_anual(…) to public`
  (o `… agenda_profesionales_anuales(…) to anon`), y después `set local role anon` y la llamada.
- **Efecto**: lanza `42501 permission denied for function es_zona_iana`, que es la función interna y
  no la puerta. A6 sigue verde, y el mutante M12 solo lo tumba A5, que mira el catálogo.
- **Riesgo**: si mañana `es_zona_iana` gana un `grant … to anon`, A6 seguiría sin vigilar la puerta.
- **Arreglo**: `assert_lanza_codigo_msg(…, '42501', 'function agenda_densidad_anual', …)`, y lo mismo
  con la lista.

### H3 · `supabase/migrations/20261017120000_agenda_densidad_anual.sql:125`, prueba en `scripts/rls/34-agenda-anual.sql:537-540`: el filtro de rol de la lista no lo tumba ninguna aserción (prueba)
F3 GEMELA dice que TEC1 sale «UNA sola vez», pero eso lo garantiza el `select distinct`, no el filtro
de rol. F1 compara con `except`, que también deduplica.

- **Escenario**: se quita `and (select rol_actual()) in (administrador, profesional_sanitario)` de la
  rama `citas` de `agenda_profesionales_anuales`.
- **Efecto**: el banco 34 entero sigue verde (mutante medido).
- **Fuga posible**: con el mutante, un técnico que figure como `profesional_id` de una cita de un
  centro que no es suyo, o de una cita sin centro, aparece en su propia lista de profesionales.
  Solo se filtra su propio id, pero es justo la puerta que el diseño dice blindar (H3 del diseño).
- **Arreglo**: una cita de TEC1 en CB o sin centro, y que TEC1 no salga en su lista.

### H4 · `scripts/rls/34-agenda-anual.sql:507` y `:516-519`: el filtro de centro de la lista admite `or centro_id is null` sin que nada caiga (prueba)
- **Escenario**: el filtro de la lista se cambia a
  `p_centro_id is null or v.centro_id = p_centro_id or v.centro_id is null`.
- **Efecto**: F1 y F2 siguen verdes (mutante medido). La única cita sin centro, C34SINC, es de
  PRO34N, que ya figura en CA por sus otras citas.
- **Consecuencia en producción**: con el mutante, el administrador que filtra por un centro vería en
  el selector a un profesional cuyas únicas citas del año no tienen centro. Ese profesional no tiene
  ninguna cita en el centro elegido.
- **Arreglo**: un profesional con una sola cita y sin centro, que no debe salir con `p_centro_id = CA`.
- **Nota aparte**: el README del banco (fila 34) remite a `tickets/T-047/mutantes.json`, y ese
  fichero no existe en `47abe5f`. Ni este mutante ni el de H3 están declarados como supervivientes.
