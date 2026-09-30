**Sin hallazgos ALTA.** Revisor 2 de 2 (SQL, RLS, consultas a Supabase, banco 18, zonas y fechas). 0 ALTA · 2 MEDIA · 7 BAJA.

# T-014 · Revisión SQL y quién ve qué

Alcance: `git diff main...T-014-calendario`, contrato `tickets/T-014-calendario-semanal.md` y
`tickets/T-014/diseno.md` §5 y §8.9. No he usado la base de datos: todo sale de leer el código.

## Lista «Qué revisar» del diseño, punto por punto

| Punto | Resultado |
|---|---|
| La rama del técnico lleva `null::uuid`/`null::text` literales, sin `join` a `citas` | OK (`20260926120000_agenda_citas_rango.sql:128-135`) |
| La función es `security invoker` con `search_path = ''` | OK (l.98-99) |
| `revoke` de public/anon/service_role, `grant` solo a authenticated, ningún `grant … on table` | OK (l.174-175) |
| Guarda del rango: nulos, invertido, más de 62 días → 22023 | OK (l.102-113). Cada guarda es discriminante en R8: quitarla deja de lanzar |
| `cita_en_curso` semiabierta y sin cancelada/no_asistida; `esta_en_curso` delega | OK en el SQL; la prueba tiene un hueco (H8) |
| `nota_pendiente` NULL en la rama del técnico; `tipo='nota_sin_firmar'` en el `exists` | OK (l.148-155) |
| Ninguna escritura directa a `citas` desde TS; solo las RPC `agenda_*` | OK (grep sin `from('citas').update/insert/delete`) |
| El cuadro inferior sale antes de consultar si el rol no está en la lista blanca | OK (`cuadro.tsx`, `puedeVerCuadro`) |
| `?fecha` imposible (2026-02-30), `?vista`/`?centro`/`?profesional` malformados | OK (`esFechaDeCalendario` con ida y vuelta por `Date.UTC`; `parametros.ts`) |
| Zona nula del centro → hereda la de la organización; `zona_horaria_centro` nunca da null | OK (`datos.ts`, `zonaDeCentro` rechaza vacío) |
| El comentario dice «ramas disjuntas por rol» | **Falso en un caso** (H1) |

## MEDIA

### H1 · Las dos ramas del `union all` no son disjuntas: el técnico dueño de una cita la recibe dos veces, una con tipo y nota
`supabase/migrations/20260926120000_agenda_citas_rango.sql:118-136` (comentario en l.168)

`citas_lectura` deja pasar `profesional_id = auth.uid()` **sin mirar el rol**, y nada en la base
exige que `citas.profesional_id` sea un `profesional_sanitario`: `citas_alta` deja al técnico y al
administrador poner cualquier `profesional_id`, y `fn_exigir_vinculo_agenda` solo actúa sobre el
rol profesional. Tampoco se impide que un perfil pase de profesional a técnico conservando sus citas.

- **Escenario:** el técnico TEC (centro A) aparece como `profesional_id` de una cita del centro A.
  Basta un alta por error desde recepción, o un profesional reconvertido en técnico. TEC abre la
  agenda y `agenda_citas_rango` devuelve **dos filas con el mismo `id`**:
  - la de la rama `citas`, con `tipo_terapia_nombre`, `nota_operativa` y `nota_pendiente`;
  - la de la rama `citas_agenda`, con esos tres campos a NULL.
- **Efecto:**
  - la cita sale duplicada en la rejilla, con claves de React repetidas;
  - la RPC entrega al técnico el tipo de terapia y la nota, en contra del choque 4, que la propia
    función dice garantizar.

  La lectura directa de esa fila por `citas` ya existía antes de T-014. El duplicado y la garantía
  falsa del comentario son nuevos.
- **Por qué no lo ve la batería:** R1-R3 usan un técnico sin citas propias, y R5 solo prueba al
  administrador.
- **Arreglo posible** (no aplicado): acotar la rama `citas` a
  `(select public.rol_actual()) in ('administrador','profesional_sanitario')`, o excluir a
  `tecnico_administrativo`. Añadir al banco un caso con una cita cuyo `profesional_id` sea TEC1 y
  exigir exactamente una fila, con tipo NULL.

### H2 · «Documentación pendiente» del administrador es la de toda la organización, que es justo lo que resuelve en contra el choque 2
`lib/citas/agenda.ts:208-213` · `app/(app)/agenda/documentacion.tsx:26`

`leerAlertasNotaPendiente` lee todas las alertas abiertas que deja la RLS. La rama
`administrador` de `alertas_documentacion_lectura` le da **todas las de la organización**.
`docs/interfaz.md` §Choque 2 dice que la bandeja no puede ser global, que el administrador solo ve
las notas suyas, y que «el contador cuenta lo mismo que la bandeja, no el total de la organización».

- **Escenario:** en una consulta con cuatro profesionales, la administradora abre `/agenda`. El
  panel lista por nombre de paciente las notas sin firmar de los otros tres, con su antigüedad.
  Es la lista que el choque 2 señala como «el prototipo enseña de más».
- **Matiz:** no hay contenido clínico, y la administradora ya ve toda la agenda. Pero el choque
  está cerrado y el contrato no lo reabre. La política es anterior a T-014; esta es la primera
  pantalla que la materializa.
- **Decide el propietario:**
  - o se filtra en la lectura (`profesional_id = uid` o asignado, también para el administrador);
  - o se enmienda el choque 2 con un ADR.

  Si no se resuelve en este ticket, se anota en `docs/state.md` §Hallazgos.

## BAJA

### H3 · La bandeja lee todas las alertas abiertas sin límite y pasa todos los ids a `.in('id', …)` en la URL
`lib/citas/agenda.ts:208-226` (el mismo patrón en `app/(app)/agenda/por-confirmar.tsx`)

- **Escenario:** alertas que se acumulan sin resolver durante meses. Para el administrador, H2 lo
  agrava: son las de toda la organización. Con varios cientos de pacientes distintos, la query
  string de `pacientes?id=in.(…)` supera el límite de URL del proxy de PostgREST.
- **Efecto:**
  - `pacientes.error`, y el bloque entero cae en «no se pudo leer»;
  - aunque no llegue a fallar, el panel lateral pinta cientos de filas sin paginar.

### H4 · `prepararMovimiento` no exige lo que la interfaz llama `reprogramable` (estado programada/confirmada e `inicio > ahora`)
`lib/citas/reprogramar.ts:56-85` (y `agenda_actualizar_cita`, `supabase/migrations/20260906120000_agenda_esquema.sql:576-616`, tampoco mira el estado)

- **Escenario:** una llamada directa a la Server Action de reprogramar con una cita `cancelada` de
  mañana, o con una en curso (`inicio < ahora < fin`). Pasa, porque solo se rechaza `fin <= ahora`.
- **Efecto:**
  - la cancelada cambia de fecha y sigue cancelada;
  - la sesión en curso salta a otra hora a mitad de consulta.

  La interfaz no lo ofrece. La barrera real está en la RPC, que el mismo usuario puede llamar sin
  pasar por la acción: por eso es BAJA.

### H5 · Con el filtro «todos» en una organización con dos zonas, el arrastre de las citas del centro de otra zona falla siempre con «recarga la agenda»
`lib/citas/reprogramar.ts:71` · `app/(app)/agenda/datos.ts` (zona de la vista = la de la organización cuando `centro` es `todos`)

- **Escenario:** la organización está en Europe/Madrid y el centro B en Atlantic/Canary. Con
  `?centro=todos` se arrastra una cita de B.
- **Efecto:** `zonaDeCentro(B)` ≠ `datos.zona`, y sale `MENSAJE_OTRA_ZONA_VISTA` («La vista estaba
  en otra zona horaria; recarga la agenda»). Recargar no lo arregla nunca: hay que filtrar por el
  centro B, y el mensaje no lo dice.

### H6 · Las pruebas de solape solo pasan por la rama `citas`: la rama del técnico podría romper el solape y seguir verde
`scripts/rls/18-agenda-rango.sql:189-204`

- **Escenario:** cambiar en la rama `citas_agenda` (`20260926120000_agenda_citas_rango.sql:135`)
  `a.fin > p_desde` por `a.inicio >= p_desde`.
- **Efecto:** R1-R3, que corren como TEC1, usan un rango que contiene el inicio de todas las citas
  del fixture, y las tres pruebas de borde corren como PRO18. La batería sigue verde, y el técnico
  deja de ver la cita que empezó antes del rango y sigue en curso.

### H7 · `reprogramable` no tiene negativa de estado: quitar `estado in ('programada','confirmada')` deja la batería verde
`scripts/rls/18-agenda-rango.sql:181-187`

- **Escenario:** borrar la segunda mitad de la expresión en `20260926120000_agenda_citas_rango.sql:147`.
- **Efecto:** la única prueba compara C18FUT (programada, mañana → true) con C18INI (empieza ahora
  → false por el `>`). No hay ninguna cita futura cancelada ni realizada que exija `false`, así que
  una cancelada de mañana saldría arrastrable y nada se pondría rojo.

### H8 · R6 no cubre `no_asistida`: quitarla de `cita_en_curso` deja la batería verde
`scripts/rls/18-agenda-rango.sql:163-179`

- **Escenario:** dejar en `cita_en_curso` solo `p_estado <> 'cancelada'`.
- **Efecto:** R6 prueba la cancelada que abarca `now()`, pero ninguna `no_asistida`. Una ausencia
  marcada antes de acabar la franja latiría como «en curso» sin que falle nada.

### H9 · La gemela de R8 (62 días exactos) depende de que la sesión del banco esté en UTC
`scripts/rls/18-agenda-rango.sql:263-266`

- **Escenario:** ejecutar el banco con `PGTZ=Europe/Madrid`, hoy 30-09-2026. `now() + interval '62 days'`
  suma días de pared y cruza el cambio de hora del 25-10-2026, así que `p_hasta - p_desde` vale
  `62 days 01:00`.
- **Efecto:** supera la guarda de l.110 y lanza 22023, y la gemela «se acepta» sale roja sin que
  el código haya cambiado. En Supabase local la sesión es UTC, por eso hoy está verde.
- **Arreglo posible:** `interval '62 days'` → `interval '1488 hours'`, o fijar
  `set local timezone = 'UTC'` en el banco.

## Descartados (con motivo)

- **Que `leerAlertasNotaPendiente` no filtre `tipo='nota_sin_firmar'`.** Es deliberado: el
  diseño §1.3 pide solo `estado='abierta'`, y `lib/i18n/es.ts` etiqueta los cinco valores del enum.
- **Firma de la vista previa sin `ultimo`/`recorte`/`clasificacion`/`fin`.** Son derivables de lo
  que sí firma: regla y `citas[citaId, fechaNueva, inicio]`.
- **`rangoDelMes` a las 00:00:00.000 exactas del día 1 da `desde = hasta` → 22023.** La ventana es
  de un milisegundo, y el efecto es una tarjeta de error que se va al recargar.
- **Año 9999 en `?fecha`.** La vista mensual llega al año 10000 y `toISOString` da `+010000-…`: sale
  una tarjeta de error y no hay fuga ni escritura.
