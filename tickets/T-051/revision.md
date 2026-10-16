**Sin hallazgos ALTA.** Gate de revisión: pasa. 0 ALTA · 1 MEDIA · 2 BAJA.

# T-051 · Revisión (ronda 1, revisor único)

- Rama `T-051-siembra-bonos`, diff `a9b5903..52f1ce1` (código y docs); HEAD revisado `954d8dd` (solo añade la evidencia).
- Contrato: `tickets/T-051-siembra-de-bonos.md`. Riesgo bajo, sin `diseno.md`.

## Qué comprobé y queda bien

- **Sitio de la sección**: la 8.quater va detrás de la 8.ter, con los claims ya limpios, y antes de la 9 (la baja). El `update` de las citas va después del de 8.bis que las pasa a `realizada`.
- **«Las dos más antiguas»**: 8.bis da a la cita `e0280004-…(k+1)` el martes `martes - 7k`, así que `…006` (k=5) y `…005` (k=4) son de verdad las dos más antiguas. En la base compartida: `…006` el 08-09 y `…005` el 15-09, las dos realizadas con el bono 1; las otras cuatro, sin bono.
- **Disparadores**: `fn_bono_de_la_cita` (ronda 3) deja pasar de nulo a un bono, y el bono es de la misma paciente (no salta el 23514). `fn_proteger_cita_pasada` (20261007120000) no protege `bono_id`. `bonos` cumple `sesiones_totales > 0` e `importe > 0`.
- **Idempotencia**: volví a correr `seed-completo.sql` entero dentro de `begin … rollback` sobre la base compartida. Antes y después: 4 bonos, 2 citas con bono y 107 filas en `auditoria`, así que el segundo pase no audita nada. El `on conflict (id) do nothing` no dispara `impedir_modificacion_bonos`.
- **Fechas**: `creado_en = k_fecha_base` en los cuatro. Carmen tiene la fecha fija 2026-10-01 y la única relativa de la sección es la de Sofía (`current_date + 20`), como pide el contrato.
- **`bonos_consumo`** como administrador (`begin … rollback`): 2/2 sin caducidad; 5/0 con 2026-10-01; 10/0 sin caducidad; 8/0 con 2026-11-05.
- **Pendiente**: `pendiente_por_paciente` (20261013120000:100-140) suma `bonos.importe` por superviviente y excluye las citas con `bono_id`. Carmen es la superviviente de su duplicado. La siembra no trae `borradores_factura`, `tarifas_paciente` ni `cobros`. Ninguna prueba fija un importe sembrado: `facturacion.spec.ts:54-66` crea sus propias filas y `:278` solo mide el ancho; `borrador.bd.test.ts` siembra sus propios bonos y citas.
- **Fuera de territorio**: `git diff --stat a9b5903..52f1ce1 -- supabase/migrations scripts/rls` sale vacío.
- **`docs/state.md`**: 71 líneas (≤ 80). La propuesta del hallazgo «QA visible» está sustituida.
- **Bitácora** `docs/bitacora/T-051.md`: está y es breve.

## MEDIA

### M1 · `docs/state.md:5`, `:11`, `:20` · contrato
`state.md` sigue diciendo que T-047 está pendiente de merge y no menciona T-051 en «Dónde estamos» ni en «Siguiente paso». La rama sale de `a9b5903`, que es justo el merge de T-047.
- **Escenario**: la próxima sesión hace lo que manda la constitución §4 y lee las primeras 80 líneas de `state.md`. Encuentra como paso 1 «Merge de T-047 (`T-047-agenda-anual`, migración 20261017120000) en `main`», que ya está en `main`, y en ningún sitio que T-051 está cerrado en su rama a la espera de merge. La línea 43 sí da los bonos por sembrados en `seed-completo.sql`, cosa que en `main` no es verdad hasta ese merge.
- **Por qué no es ALTA**: las tres líneas obsoletas vienen de `main` (el merge `a9b5903` no las tocó), no las introduce este diff. Aun así, el ticket tocaba `state.md`, y §4 pide dejarlo reescrito y al día al acabar.
- **Arreglo**: reescribir la cabecera, «Dónde estamos» (T-047 en `main`, T-051 cerrado en su rama) y «Siguiente paso» (merge de T-051, sin el de T-047).

## BAJA

### B1 · `supabase/seed-completo.sql:607-609` · local
El comentario de Sofía dice dos cosas que el propio fichero desmiente:
- que `current_date + 20` es «la única fecha relativa al día de la siembra», cuando 8.bis (`:523`, `:537`, `:556`) y 8.ter (`:575`) también usan `current_date`;
- que es «la misma excepción que 8 y 8.bis», cuando la sección 8 (alertas, `:467-496`) cuelga entera de `k_fecha_base`.

**Escenario**: alguien busca en la sección 8 la excepción que se cita y no la encuentra. O se fía de «única» y, al revisar si la siembra depende del día, deja fuera 8.bis y 8.ter.

**Arreglo**: «la única fecha relativa de esta sección; la misma excepción que 8.bis y 8.ter». El texto viene del contrato, que dice «la 8 y la 8.bis».

### B2 · `supabase/seed-completo.sql:625` (comentario en `:607-609`) · local
La caducidad de Sofía se fija en la primera siembra y no se refresca: con `on conflict (id) do nothing`, un segundo `npm run seed` no la mueve. El comentario promete que así «el aviso no deja de salir al mes», pero eso solo vale si se hace `db reset`.

**Escenario**: en la base compartida, sembrada el 16-10, la caducidad es 2026-11-05. El 06-11, sin `db reset`, porque la base es compartida y no se resetea, la QA visible de T-027 o T-051 ve a Sofía **Caducado** en vez de vigente con aviso. Volver a ejecutar `npm run seed` no lo corrige. Lo mismo pasa ya con el festivo de 8.bis, así que es una propiedad aceptada de la siembra relativa.

**Arreglo**: dejarlo escrito en el comentario («vale 20 días desde la última `db reset`; resembrar no la mueve») o en la regla de QA visible. No pide código.
