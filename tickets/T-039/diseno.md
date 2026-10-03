# T-039 · Diseño — La cita apunta a su episodio y lleva si es presencial u online

> Arquitecto, 02-10-2026. Contrato: `tickets/T-039-cita-en-episodio-y-asistencia.md` (Q1-A, Q2-A y Q3-A
> decididas). ADR: 075, 074, 071, 030, 026, 055, 069, 073, 034.
>
> **Precondición:** T-028a **no** está integrado al escribir esto. Lo que aquí se dice de
> `agenda_crear_cita` y `agenda_crear_serie` sale de `tickets/T-028a/diseno.md` §5-§6, no del código.
> Antes de escribir una línea, el implementador repite §0 contra `main` con T-028a (y T-015)
> integrados, con `grep -ln <función> supabase/migrations/*.sql | tail -1`. Si algo de §0 no se
> cumple, se para y lo devuelve: no se adapta el diseño en silencio.
>
> T-035 (`20261004120000_centro_congelado_y_coprofesional.sql`) **ya está en `main`**.

## 0 · Hechos verificados contra el código

| | Hecho | Dónde |
|---|---|---|
| H1 | `citas` tiene 19 columnas: id, paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id, inicio, fin, zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion, rango_bloqueante, marcada_realizada_en, marcada_realizada_por, creada_en y creada_por. No hay ninguna columna añadida después en otra migración. `series_cita` no tiene episodio ni modalidad. | `20260906120000_agenda_esquema.sql:130-205`; grep `alter table public.citas` |
| H2 | Los privilegios de tabla son explícitos, sin los «default privileges» de Supabase: `revoke all` sobre citas, series y citas_agenda, y después `grant select, insert, update on citas to authenticated`. `service_role` no tiene nada sobre `citas`. | `20260906120000…:845-856`; `20260815192424…:245` |
| H3 | `series_cita` ya no tiene ni `insert` ni `update` para `authenticated`, y el banco 16 lo asevera con `has_table_privilege`. Sobre `citas`, ningún banco asevera privilegios de tabla. | `20260925120000…:1144`; `16-series.sql:1720-1722` |
| H4 | La aplicación no escribe en `citas` ni en `series_cita`; solo hace `select`. | `app/(app)/pacientes/[id]/datos.ts:139`, `lib/citas/agenda.ts:153`, `lib/notas/servidor.ts:248,445,730` |
| H5 | Disparadores BEFORE de `citas` (se ejecutan por orden alfabético): `calcular_rango_bloqueante`, `exigir_vinculo_agenda` (insert), `marcar_cita_desviada` (update of inicio, fin, zona_horaria), `proteger_cita_pasada` (update or delete) y `validar_zona_horaria_citas`. Los AFTER son `auditar_citas fn_auditar('id','nota_operativa')` y `alertar_nota_sin_firmar` (update of estado). | `20260906120000…`, `20260910120000…`, `20260929…` |
| H6 | `fn_proteger_cita_pasada()`: con `old.fin > now()` deja pasar. En un DELETE da 42501 `'Una cita pasada no se puede eliminar (constitución, regla 6): %'`. Un UPDATE de inicio, fin, zona_horaria, serie_id, paciente_id, profesional_id, centro_id, tipo_terapia_id, desviada o motivo_desviacion da 42501 `'Una cita pasada no se puede reprogramar ni reatribuir (constitución, regla 6): %'`. | `20260910120000…:334-388` |
| H7 | `citas_agenda`, con `security_invoker = false` y `security_barrier = true`, enumera id, paciente_id, profesional_id, centro_id, serie_id, inicio, fin, zona_horaria, estado, sala, desviada y motivo_desviacion, y filtra por técnico y por `centros_actuales()`. | `20260906120000…:515-541` |
| H8 | `agenda_citas_rango(…)` es plpgsql, stable e invoker, y devuelve una `returns table` de 21 columnas que termina en `en_curso, reprogramable, nota_pendiente`. El CTE `visibles` tiene dos ramas en `union all`: `citas c` para el administrador o el profesional, y `citas_agenda a` con nulos literales para el técnico. Lleva comentario, `revoke all … from public, anon, service_role` y `grant execute … to authenticated`. | `20260926120000_agenda_citas_rango.sql:72-180` |
| H9 | `agenda_actualizar_cita(uuid, estado_cita, text, timestamptz, timestamptz)` es definer y da 42501 `'La cita no existe o no es tuya.'`. `agenda_editar_serie` en modo «esta» delega en ella. | `20260906120000…:574-637`; `20260925120000…:556` |
| H10 | `agenda_editar_serie` **no parte la serie**: «esta y las siguientes» hace `update public.series_cita` sobre la misma fila. Los únicos `insert into series_cita` están en el alta. | `20260925120000…:574`; `20260910120000…:635, 935` |
| H11 | `agenda_confirmar_propuesta` y las materializaciones insertan la cita con `serie_id` puesto y copian `tipo_terapia_id` de la serie. | `20260925120000…:858-880`; `20260910120000…:733, 1150` |
| H12 | `episodio_para_nota(p_paciente_id, p_episodio_id default null, p_cita_id default null, p_centro_id default null) returns uuid` es invoker. Sus pasos: 1 sesión, 2 rol (el técnico, fuera), 3 paciente, 4 PIN, 5 «No atiendes a este paciente.», 6 elección explícita (42501 `'El episodio elegido no vale para esta nota.'` o 22023 `'El episodio elegido está cerrado.'`), 7 candado y recuento (EP001), 8 abrir. Tiene `revoke` de public y anon y `grant` a authenticated. | `20260929120000_nota_siempre_en_episodio.sql:260-385` |
| H13 | Disparadores BEFORE de `notas_clinicas`: `congelar_cabecera_sellada` (update of paciente_id, fecha_sesion, autor_id, episodio_id, cita_id, coprofesional_id), `exigir_episodio_coherente_en_nota` (insert or update of paciente_id, episodio_id, autor_id, coprofesional_id; **no** `cita_id`) y `tocar_borrador`. | `20260929120000…:150-192`; `20260822094547…:1399` |
| H14 | Hay un índice único `notas_clinicas (cita_id, autor_id) where cita_id is not null`. Así, cada cita tiene como mucho **una** nota de cada autor. | `20261002120000_nota_clinica_borrador_firma.sql:82-84` |
| H15 | La firma de la v1 exige que la cita sea del paciente y del autor de la nota (6.21, `'no pertenece a esta nota'`). | `20261003120000…:462-468` |
| H16 | T-035 re-emite `fn_congelar_episodio_con_notas` (disparador `congelar_episodio_con_notas`, before update of paciente_id, profesional_id, centro_id) y `fn_exigir_episodio_coherente_en_nota`. Su paso 2 devuelve `new` si `auth.uid()` no es nulo y el autor es otro. Sus mensajes 23514 empiezan por «La nota va en un episodio de su autor», «La nota y su episodio no son del mismo paciente ni de un participante» y «Una nota nueva no cuelga de un episodio cerrado». | `20261004120000_centro_congelado_y_coprofesional.sql` |
| H17 | `fn_congelar_participante_con_notas`: before update of episodio_id, paciente_id or delete sobre `episodio_participantes`. | `20260929120000…` |
| H18 | `lib/citas/errores.ts`: un 42501 cuyo mensaje contiene «pasada» se trata como `cita_pasada`; los demás 42501, como `no_autorizado`. `FRAGMENTOS_DE_RECHAZO` contiene: `ya ha empezado o ha pasado`, `cancelada o cerrada`, `se movió a mano`, `no coinciden`, `nuevo horario de esta cita ya ha pasado`, `quedado en el pasado`, `sin evento`, `otra regla`, `otra zona`, `La cita cambió` y `no tiene horario`. | `lib/citas/errores.ts` |
| H19 | T-028a (diseño): `agenda_crear_serie` pasa de 11 argumentos a 15 con drop y create, terminados en `p_estricta_primera boolean default false`, y devuelve jsonb. Inserta las citas **ella misma** con `serie_id`. `agenda_crear_cita(p_paciente_id, p_profesional_id, p_centro_id, p_tipo_terapia_id, p_fecha date, p_hora_local time, p_duracion_minutos smallint default null, p_sala text default null, p_nota_operativa text default null) returns uuid`. A1 da 42501 `'No hay sesión activa con perfil.'`. A2 da `'No autorizado para dar esta cita.'` en la cita y `'No autorizado para crear esta serie.'` en la serie. A4 es la nota del técnico. La migración es la `20261005120000`, con el banco 21. En la siembra hay tipos `e0280001-…-0001` (50 min) y `-0002` «Sesión de pareja» (90 min), y franjas de lunes a viernes. | `tickets/T-028a/diseno.md` §1.2, §5, §6, D2, D13 |
| H20 | T-015 tiene la migración `20261006120000_avisos_y_escalado.sql` y el banco 22. No toca `citas_agenda`, `agenda_citas_rango` ni `fn_proteger_cita_pasada`. Su banco pasa citas pasadas a `realizada`, y `estado` no está congelado. | `tickets/T-015/diseno.md:590` |
| H21 | Bancos que tocan esto: | |
| | · 14 (T-036): las notas N36 de PRO1 en EPI067A (P067) con citas K36 y K36B, ambas de P067 y PRO1. Mueve `cita_id` a K36B y a KX36 (otro paciente) apagando solo `congelar_cabecera_sellada`. KY36 es de PRO2. | `14-cadena-huellas.sql:1820-2030, 2081, 2276, 2641` |
| | · 20: N5 de PRO1 en E20 con C5 (P20 y PRO1). En U3, PRO2 con su EP2 escribe nota en C5 y **debe entrar**. N2 y N3 cuelgan de citas de otro paciente y de otro profesional. | `20-nota-borrador.sql` |
| | · 19: no hay ninguna nota con `cita_id`. CITA y CITA2 solo se pasan a `episodio_para_nota`. Los episodios y participantes que muta son suyos y no tienen citas. | `19-nota-en-episodio.sql:321-942` |
| | · 16 y 17: llaman a `crear_serie` con P1/PRO1 (EPI es su único episodio abierto con P1), P2/PRO2 (EPI2) y P2/PRO1 (P2 es participante activo de EPI). Ningún banco posterior muta EPI ni EPI2. | `01-fijacion.sql:101-106`; grep `:EPI` en 15-20 |
| | · 15:384 asevera que `citas_agenda` no tiene tipo ni nota (sigue en verde). Ninguna aserción de 15, 16 ni 18 enumera columnas de forma que esta migración la rompa. | |
| H22 | En la siembra (`supabase/seed-completo.sql`, un bloque DO como `postgres` sin JWT) no hay citas. Sí hay `k_ana`, `k_tec`, `k_p_carmen`, `k_p_sofia`, `k_p_hugo`, `k_epi_pareja` (de Ana, con Sofía de titular y Sofía y Hugo como participantes «miembro» desde hace 60 días) y `k_epi_carmen`. `seed.mjs` es idempotente y no abre transacción. | `seed-completo.sql:80-341` |
| H23 | El linter de migraciones solo exige anuncio para `drop table`, `drop column`, `drop type`, `alter column … type` y `set not null` sin valor por defecto. `drop function` no lo necesita. | `scripts/lint-migraciones.ts:216-257` |

## 1 · Piezas y contratos

### 1.1 Sello y banco

- Migración: **`supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql`**. Va después de
  T-035 (`20261004…`), T-028a (`20261005…`) y T-015 (`20261006…`).
- Banco: **`scripts/rls/23-cita-en-episodio.sql`**. El 21 es de T-028a y el 22 de T-015. Si al
  empezar T-015 no se ha integrado, el banco toma el siguiente número libre y la migración sigue con
  `20261007120000`.

### 1.2 Orden dentro de la migración

Cada paso es una sección comentada:

1. Tipo y columnas (§1.3).
2. Privilegios por columna sobre `citas` (§1.4).
3. Predicados internos: `cita_episodio_coherente` y `cita_episodio_unico` (§1.5).
4. La función de relleno (§1.10) y su **llamada** (`select public.rellenar_episodio_de_citas();`).
5. Disparadores de coherencia y herencia en `citas` y `series_cita` (§1.6).
6. Congelados en episodios y participantes (§1.7).
7. `fn_proteger_cita_pasada` re-emitida (§1.8).
8. El disparador de la nota y la cita, y `episodio_para_nota` re-emitida (§1.9).
9. Las funciones de alta con drop y create (§1.11).
10. `agenda_cambiar_asistencia` y `agenda_cambiar_episodio_cita` (§1.12 y §1.13).
11. Lectura: `citas_agenda` y `agenda_citas_rango` (§1.14).

El relleno va en el paso 4, antes del 5 al 8: así no lo estorba ningún disparador nuevo. Tampoco
le estorba `proteger_cita_pasada` vigente, porque `episodio_id` no está en su lista.

### 1.3 Tipo y columnas

```sql
create type public.modalidad_asistencia as enum ('presencial', 'online');

alter table public.citas
  add column modalidad_asistencia public.modalidad_asistencia not null default 'presencial',
  add column episodio_id uuid references public.episodios_asistenciales (id);
alter table public.series_cita
  add column modalidad_asistencia public.modalidad_asistencia not null default 'presencial',
  add column episodio_id uuid references public.episodios_asistenciales (id);

create index citas_episodio_idx       on public.citas (episodio_id)       where episodio_id is not null;
create index series_cita_episodio_idx on public.series_cita (episodio_id) where episodio_id is not null;
```

Cada columna nueva lleva un `comment on column` con tres ideas:

- es logística, no clínica;
- el técnico la ve, o no la ve en el caso de `episodio_id`;
- solo se escribe por funciones (ADR-075).

### 1.4 Quién escribe: privilegios por columna (tarea 3)

```sql
revoke insert, update on table public.citas from authenticated;
grant insert (id, paciente_id, profesional_id, centro_id, tipo_terapia_id, serie_id, inicio, fin,
              zona_horaria, estado, sala, nota_operativa, desviada, motivo_desviacion,
              rango_bloqueante, marcada_realizada_en, marcada_realizada_por, creada_en, creada_por)
  on public.citas to authenticated;
grant update ( …la misma lista de 19… ) on public.citas to authenticated;
```

- Las listas son las 19 columnas de H1. El implementador las vuelve a sacar de
  `information_schema.columns` justo antes de escribir (si T-028a o T-015 añadieran alguna, entra
  aquí). Ninguna de las dos columnas nuevas está en la lista.
- El orden importa: un `revoke` de tabla revoca también los privilegios por columna. Primero el
  `revoke` y después los `grant`.
- `series_cita` no cambia: ya no tiene `insert` ni `update` (H3).
- Las funciones definer (dueño `postgres`) siguen escribiendo todo, y la RLS no cambia.
- Comentario en la migración: «una columna nueva de `citas` nace cerrada a `authenticated`. Si
  debe escribirse a mano, se añade a estos `grant`».

### 1.5 Predicados internos (sin `grant`, como `plan_edicion_serie`)

```sql
public.cita_episodio_coherente(p_episodio_id uuid, p_paciente_id uuid, p_profesional_id uuid,
                               p_fecha date) returns boolean      -- stable, definer, search_path ''
public.cita_episodio_unico(p_profesional_id uuid, p_paciente_id uuid, p_fecha date)
  returns uuid                                                     -- volatile (for share), definer
```

Ambas llevan `revoke execute … from public, anon, authenticated`.

**`cita_episodio_coherente`** es verdadera solo si se cumplen las tres cosas:

- `e.profesional_id = p_profesional_id`;
- `e.cerrado_en is null or e.cerrado_en >= p_fecha`;
- `e.paciente_id = p_paciente_id`, o existe una fila de `episodio_participantes` de ese episodio y
  ese paciente con `alta_en <= p_fecha and (baja_en is null or baja_en >= p_fecha)`.

**No mira `abierto_en`.** La primera cita de un paciente nuevo se da antes de que exista su
episodio (contrato, Q1), y la tarea 6 no lo pide.

**`cita_episodio_unico`** toma los episodios `e` que cumplen todo esto:

- `e.profesional_id = p_profesional_id` y `e.cerrado_en is null`;
- y además, o `e.paciente_id = p_paciente_id`, o existe un participante con
  `paciente_id = p_paciente_id`, `baja_en is null` y `alta_en <= p_fecha`.

Esos episodios se bloquean con `for share of e` dentro de una subconsulta y se cuentan los ids
distintos. Si hay exactamente 1, lo devuelve; si no, devuelve `null`. **Nunca lanza** y **nunca
abre** un episodio.

### 1.6 Coherencia y herencia: disparadores propios (tareas 4.4 y 6)

**`fn_velar_episodio_de_cita()`** es definer, con `search_path = ''`. Su disparador:

```sql
create trigger velar_episodio_de_cita
  before insert or update of episodio_id, paciente_id, profesional_id on public.citas
  for each row execute function public.fn_velar_episodio_de_cita();
```

Por el nombre se ejecuta el último de los BEFORE (H5), después de `proteger_cita_pasada`. Así, en
una cita pasada sale antes el 42501 que el 23514. El cuerpo:

1. **Herencia (solo INSERT con `new.serie_id` no nulo).**
   - Lee la serie con `for share`.
   - Siempre: `new.modalidad_asistencia := s.modalidad_asistencia`.
   - Si `new.episodio_id is null and s.episodio_id is not null`, y
     `cita_episodio_coherente(s.episodio_id, new.paciente_id, new.profesional_id, fecha_local)`,
     entonces `new.episodio_id := s.episodio_id`. Si no es coherente, se queda nulo **sin error**.
     Así, confirmar una propuesta o materializar una sesión nunca da 23514, tampoco cuando la
     confirma el técnico.
   - `fecha_local = (new.inicio at time zone new.zona_horaria)::date`.
2. Si `new.episodio_id is null`, devuelve `new`.
3. En un UPDATE, si `episodio_id`, `paciente_id` y `profesional_id` no cambian (`is not distinct
   from`), devuelve `new`.
4. Lee el episodio con `select … for share`. Si no existe, devuelve `new` y la clave ajena dará
   23503.
5. Lee con `for share` las filas de `episodio_participantes` de `(episodio, new.paciente_id)`.
   Puede haber varias (bajas y altas).
6. Comprueba, en este orden y cada una con su mensaje 23514:

| # | Comprobación | Mensaje (el fragmento propio va en *cursiva*) |
|---|---|---|
| V1 | `e.profesional_id <> new.profesional_id` | `'La cita y su episodio *no son del mismo profesional* (ADR-075).'` |
| V2 | el paciente no es titular y no hay ninguna fila de participante | `'El paciente de la cita *no es titular ni participante del episodio* (ADR-075).'` |
| V3 | no es titular y ninguna fila cubre `fecha_local` (`alta_en <= f and (baja_en is null or baja_en >= f)`) | `'El paciente de la cita *no estaba de alta en el episodio* el día de la cita (ADR-075).'` |
| V4 | `e.cerrado_en < fecha_local` | `'El episodio de la cita *se cerró antes del día de la cita* (ADR-075).'` |

El disparador **no se ejecuta con `inicio`**. Reprogramar una cita (el técnico puede hacerlo) no
vuelve a comprobar la coherencia, para que reprogramar no sirva de oráculo de las fechas del
episodio. El residuo, una cita movida fuera de la ventana del episodio, va con el ticket que cierre
episodios (T-034 SQL-H2); ver «Lo que no entra».

**`fn_velar_episodio_de_serie()`** es definer. Su disparador es `velar_episodio_de_serie`, before
insert or update of episodio_id, paciente_id, profesional_id, sobre `series_cita`. Sin fecha:

| # | Comprobación | Mensaje |
|---|---|---|
| S1 | otro profesional | `'La serie y su episodio *no son del mismo profesional de la serie* (ADR-075).'` |
| S2 | ni titular ni participante con `baja_en is null` | `'El paciente de la serie *no es titular ni participante activo* del episodio (ADR-075).'` |
| S3 | `e.cerrado_en is not null` | `'La serie *apunta a un episodio cerrado* (ADR-075).'` |

Ningún mensaje es prefijo de otro ni contiene un fragmento de H18. El banco asevera cada uno por
su fragmento en cursiva. V1 y S1 se distinguen por su arranque («La cita y» y «La serie y»), y el
fragmento de S1 lleva «de la serie» para que ninguno sea subcadena del otro.

### 1.7 Las otras puertas (tarea 7, sin re-emitir lo de T-034 ni lo de T-035)

- **`fn_congelar_episodio_por_citas()`**, definer. Su disparador `congelar_episodio_por_citas` es
  before update of paciente_id, profesional_id sobre `episodios_asistenciales`, con
  `when (new.paciente_id is distinct from old.paciente_id or new.profesional_id is distinct from old.profesional_id)`.
  - Si existe alguna cita **o serie** con `episodio_id = old.id`, da 42501:
    `'El episodio % *tiene citas: su paciente y su profesional no cambian* (ADR-075, T-039).'`.
  - Por el nombre va después de `congelar_episodio_con_notas`. Con notas y citas a la vez sale el
    mensaje de T-034/T-035 y las aserciones del 19 no cambian.
- **`fn_congelar_participante_por_citas()`**, definer. Su disparador
  `congelar_participante_por_citas` es before update of episodio_id, paciente_id or delete sobre
  `episodio_participantes`.
  - Si existe alguna cita o serie con `episodio_id = old.episodio_id and paciente_id = old.paciente_id`,
    da 42501: `'El participante *tiene citas en este episodio: no se mueve ni se borra* (ADR-075).'`.
  - En un UPDATE sin cambio real de esas dos columnas, devuelve `new`. En un DELETE devuelve `old`.
- **Concurrencia.** El UPDATE o DELETE ya tiene el candado de fila cuando corre el BEFORE. El alta
  de la cita lee el episodio y el participante con `for share` (§1.6), y los dos chocan. Quien
  llega segundo ve lo que confirmó el primero: es el mismo patrón que T-034.

### 1.8 La cita pasada (tarea 10)

`create or replace function public.fn_proteger_cita_pasada()` se escribe con **el cuerpo de H6
idéntico** y, después de la comprobación de UPDATE que ya existe, añade:

```sql
if old.episodio_id is not null and new.episodio_id is distinct from old.episodio_id then
  raise exception 'Una cita pasada *no cambia de episodio una vez asignado* (ADR-075): %', old.id
    using errcode = '42501';
end if;
if new.modalidad_asistencia is distinct from old.modalidad_asistencia then
  raise exception 'Una cita pasada *no cambia de presencial a online* ni al revés (ADR-075): %', old.id
    using errcode = '42501';
end if;
```

- Los dos mensajes contienen «pasada», así que `mapearErrorCitas` los trata como `cita_pasada`. Es
  lo correcto.
- De nulo a valor pasa.
- Se repiten `comment on function` (con la lista ampliada) y `revoke execute … from public`.
- El disparador no se toca: `create or replace` mantiene el enlace.

### 1.9 La nota y la cita (tarea 8)

**`fn_exigir_nota_en_episodio_de_su_cita()`**, definer. Su disparador:

```sql
create trigger exigir_nota_en_episodio_de_su_cita
  before insert or update of cita_id, episodio_id, paciente_id, autor_id on public.notas_clinicas
  for each row execute function public.fn_exigir_nota_en_episodio_de_su_cita();
```

Por el nombre va después de `congelar_cabecera_sellada` y de `exigir_episodio_coherente_en_nota`,
y antes de `tocar_borrador`. El cuerpo:

1. `new.cita_id is null` → `return new`.
2. En un UPDATE sin cambio en `cita_id`, `episodio_id`, `paciente_id` ni `autor_id` → `return new`.
3. `auth.uid() is not null and new.autor_id is distinct from auth.uid()` → `return new`. Calca el
   paso 2 de T-035: eso lo rechaza la RLS, y aquí no se da información.
4. Lee la cita con `select … for no key update`. Si no existe, `return new` y lo decide la clave
   ajena.
5. **Alcance (P1).** Si `c.paciente_id <> new.paciente_id or c.profesional_id <> new.autor_id`, la
   cita no es «de esta nota». Es el mismo predicado que 6.21 (H15). Entonces `return new`.
6. Si `c.episodio_id is not null and c.episodio_id <> new.episodio_id`, da 23514:
   `'La nota de una cita *va en el episodio de la cita* (ADR-075).'`.
7. Si `c.episodio_id is null` y
   `cita_episodio_coherente(new.episodio_id, c.paciente_id, c.profesional_id, fecha_local_de_c)`,
   hace `update public.citas set episodio_id = new.episodio_id where id = c.id`. Ese update pasa
   por §1.6 y §1.8: de nulo a valor también en una cita pasada.
   - Si no es coherente, se queda nula **sin error (P2)**.
8. `return new`.

Que el paso 6 no rompa los bancos se apoya en H14: cada cita tiene como mucho una nota de cada
autor, y en el alcance el autor es el profesional de la cita.

**`episodio_para_nota()`** se re-emite con `create or replace` y la misma firma. El cuerpo es
**idéntico** al de H12, más un **paso 5b** entre el 5 y el 6:

```text
5b. si p_cita_id no es nulo:
      select c.episodio_id into v_epi_cita from public.citas c
       where c.id = p_cita_id and c.paciente_id = p_paciente_id and c.profesional_id = v_uid;
      si v_epi_cita no es nulo:
        - p_episodio_id no nulo y distinto de v_epi_cita
            → 42501 'El episodio elegido no vale para esta nota.'   (el MISMO texto del paso 6)
        - p_episodio_id nulo y el episodio v_epi_cita con cerrado_en no nulo
            → 22023 'El episodio *de la cita está cerrado*.'
        - p_episodio_id nulo → return v_epi_cita        (sin candado ni recuento: no hay EP001)
        - p_episodio_id = v_epi_cita → sigue al paso 6, que lo valida como hoy
```

- Va antes del paso 6 a propósito: si fuera después, un `p_episodio_id = F` válido saldría por
  el paso 6 sin llegar a compararse con el de la cita.
- La función es invoker, así que la lectura de `citas` pasa por la RLS del profesional. Es
  correcto, porque se filtra `profesional_id = v_uid`.
- El rol, el PIN y la autoría quedan antes (pasos 1 a 5): el orden de permisos antes que cotejo no
  cambia.
- Se repiten `comment`, `revoke … from public, anon` y `grant … to authenticated`.

### 1.10 Relleno (tarea 11, Q1-A)

`public.rellenar_episodio_de_citas() returns jsonb`: volatile, definer, `search_path = ''`, con
`revoke execute … from public, anon, authenticated`.

1. **Citas con `episodio_id` nulo y al menos una nota** (`exists notas_clinicas n where n.cita_id = c.id`):
   - se toman los `episodio_id` distintos de **todas** sus notas, de cualquier autor;
   - si hay exactamente 1 y `cita_episodio_coherente(…, fecha_local)`, se escribe ese;
   - en otro caso, la cita se queda nula. Cuenta como `por_nota` o como `nulas`.
2. **Citas con `episodio_id` nulo sin notas:**
   - se buscan los candidatos con `cita_episodio_coherente(e.id, c.paciente_id, c.profesional_id, fecha_local)`
     sobre los episodios de `c.profesional_id`. Esto **sí** acepta episodios cerrados en la fecha o
     después, como pide Q1-A.2;
   - con exactamente 1 candidato se escribe ese, y cuenta como `por_candidato`;
   - si no, se queda nula y cuenta como `nulas`.
3. **Series con `episodio_id` nulo:** `cita_episodio_unico(s.profesional_id, s.paciente_id, current_date)`.
   El resultado va a un cuarto recuento, `series`.
4. Solo se escribe `update … set episodio_id = …`, y nunca otra columna. No hay ningún `delete`.
5. `raise notice 'relleno T-039: % por nota, % por candidato único, % nulas; % series', …`.
6. Devuelve `jsonb_build_object('por_nota', …, 'por_candidato', …, 'nulas', …, 'series', …)`.
7. Las filas de `auditoria` de cada `update` (con actor nulo) son las esperadas (tarea 11).

Es idempotente porque solo mira filas con `episodio_id` nulo. En la segunda llamada, por_nota,
por_candidato y series son 0.

### 1.11 Las funciones de alta (tarea 4)

Llevan **drop y create**, y se repiten `comment on function`, `revoke … from public, anon` y
`grant … to authenticated` con la firma nueva. Las dos firmas ganan, **al final**:

```sql
p_modalidad_asistencia public.modalidad_asistencia default 'presencial',
p_episodio_id          uuid                        default null
```

- `agenda_crear_cita(…9 de H19…, p_modalidad_asistencia, p_episodio_id) returns uuid`
- `agenda_crear_serie(…15 de H19…, p_modalidad_asistencia, p_episodio_id) returns jsonb`

Ambas devuelven lo mismo que hoy. Las comprobaciones nuevas van **después de A1-A4** de T-028a y
**antes** de la fecha, el tipo y el plan:

| # | Comprobación | Código y mensaje |
|---|---|---|
| M0 | `p_modalidad_asistencia is null` (un nulo explícito) | 22023 `'La modalidad de asistencia *no puede ser nula*.'` |
| E1 | `v_rol = 'tecnico_administrativo' and p_episodio_id is not null` | 42501 `'El técnico administrativo *no elige episodio para una cita* (ADR-071).'` |
| E2 | `p_episodio_id is not null` y no existe un `e` con `e.id = p_episodio_id`, `e.profesional_id = auth.uid()`, `e.profesional_id = p_profesional_id` y (`e.paciente_id = p_paciente_id` o participante con `baja_en is null`) | 42501 `'El episodio indicado *no vale para esta cita*.'`. Es el mismo texto para inexistente, ajeno, de otro paciente o si llama el administrador. |
| E3 | E2 pasa y `e.cerrado_en is not null` | 22023 `'El episodio indicado *está cerrado*.'` |

- **Sin PIN** (ADR-026).
- E2 lee el episodio con `for share`. E3 va detrás de E2 para que «cerrado» solo se lo diga al dueño.
- **Resolución:** `v_episodio := coalesce(p_episodio_id, cita_episodio_unico(p_profesional_id, p_paciente_id, <fecha>))`.
  La fecha es `p_fecha` en la cita y `p_desde` en la serie.
- `crear_cita` inserta la cita con `episodio_id = v_episodio` y
  `modalidad_asistencia = p_modalidad_asistencia`.
- `crear_serie` lo pone en el `insert into series_cita`. Sus `insert into citas` no lo repiten:
  lo hereda §1.6, que además vuelve a comprobarlo por fecha. Así hay una sola fuente.
- **Herencia sin re-emitir nada más.** `agenda_confirmar_propuesta`, las materializaciones y
  `agenda_editar_serie` no se tocan: §1.6 hereda en cualquier `insert` con `serie_id` (H11). La
  serie de «esta y las siguientes» es la misma fila (H10) y conserva sus dos valores.
- `agenda_previsualizar_alta` no se toca (tarea 4.6).

### 1.12 Cambiar la asistencia (tarea 5): función propia

`public.agenda_cambiar_asistencia(p_cita_id uuid, p_modalidad_asistencia public.modalidad_asistencia) returns uuid`,
volatile y definer, con `revoke … from public, anon` y `grant … to authenticated`.

| # | Comprobación | Código y mensaje |
|---|---|---|
| 1 | `rol_actual()` nulo | 42501 `'No hay sesión activa con perfil.'` (el texto existente de A1) |
| 2 | `p_modalidad_asistencia is null` | 22023 `'La modalidad de asistencia no puede ser nula.'` (el mismo que M0: es la misma comprobación) |
| 3 | `select … from citas where id = p_cita_id and (admin or (profesional_sanitario and profesional_id = uid) or (tecnico and centro_id in (select centros_actuales()))) for no key update` sin fila | 42501 `'No puedes *cambiar la asistencia de esa cita*, o no existe.'` |
| 4 | `old = nuevo` | `return p_cita_id` sin `update`, y sin fila de auditoría |
| 5 | `update public.citas set modalidad_asistencia = … where id = p_cita_id` | la cita pasada la rechaza §1.8 (42501 «…pasada…») |

Devuelve `p_cita_id`. No toca la serie.

### 1.13 Corregir el episodio de una cita (tarea 9)

`public.agenda_cambiar_episodio_cita(p_cita_id uuid, p_episodio_id uuid) returns uuid`, volatile y
definer, con `revoke … from public, anon` y `grant … to authenticated`.

| # | Comprobación | Código y mensaje |
|---|---|---|
| 1 | rol nulo | 42501 `'No hay sesión activa con perfil.'` |
| 2 | `v_rol <> 'profesional_sanitario'` | 42501 `'Solo el profesional de la cita *corrige su episodio* (ADR-075).'` |
| 3 | `not public.historia_desbloqueada()` | 42501 `'La historia está bloqueada: *desbloquéala con el PIN para cambiar el episodio* de la cita.'` |
| 4 | `p_episodio_id is null` | 22023 `'*Falta el episodio*.'` |
| 5 | `select … from citas where id = p_cita_id and profesional_id = auth.uid() for update` sin fila | 42501 `'*No hay una cita tuya* con ese id a la que cambiar el episodio.'` |
| 6 | no existe un episodio con `id = p_episodio_id and profesional_id = auth.uid()` | 42501 `'*Solo puedes poner a la cita un episodio tuyo*.'` |
| 7 | `exists (select 1 from notas_clinicas where cita_id = p_cita_id)`, de cualquier autor | 42501 `'La cita *ya tiene nota: su episodio no cambia* (ADR-075).'` |
| 8 | `update citas set episodio_id = p_episodio_id` | Coherencia: 23514 de §1.6. Cita pasada con episodio: 42501 de §1.8. |

- Se usa `for update` y no `for no key update` porque la clave ajena `notas_clinicas.cita_id` toma
  `for key share`. Solo `for update` choca con ella. Así, una nota que se inserta a la vez espera y
  luego ve el episodio nuevo, o esta función espera y ve la nota en el paso 7.
- El paso 3 es el texto del PIN con un fragmento propio. Hay que comprobar con grep que no es
  prefijo del de `episodio_para_nota` y que no contiene «pasada».

### 1.14 Lectura (tarea 12)

- **`citas_agenda`**: `create or replace view public.citas_agenda with (security_invoker = false, security_barrier = true) as`
  con las 12 columnas de H7 **en el mismo orden** más `c.modalidad_asistencia` al final, y el
  mismo `where`. **El `with (…)` se repite**: `create or replace view` sustituye las opciones de la
  vista. Se repiten el comentario (más la columna) y `grant select … to authenticated`.
- **`agenda_citas_rango`**: `drop function` y `create function` con el cuerpo de H8 **idéntico**,
  salvo la columna 22 `modalidad_asistencia public.modalidad_asistencia`:
  - en `returns table`, al final;
  - en la rama `citas c`, `c.modalidad_asistencia`;
  - en la rama `citas_agenda a`, `a.modalidad_asistencia`;
  - en el `select` final, `v.modalidad_asistencia`.
  - Se repiten el comentario, `revoke all … from public, anon, service_role` y `grant execute … to authenticated`.
- Ni `episodio_id` ni nada del episodio entra en ninguna de las dos.

### 1.15 Siembra (tarea 13)

En el bloque DO de `seed-completo.sql`, al final:

1. `v_martes := current_date + (8 - extract(isodow from current_date)::int) + 1`. Es el martes de
   la semana siguiente, siempre en el futuro. `v_miercoles := v_martes + 1`.
2. `perform set_config('request.jwt.claims', json_build_object('sub', k_ana, 'role', 'authenticated')::text, true);`.
   Si `rol_actual()` o A1-A3 piden `aal2`, se añade `'aal','aal2'` (lo comprueba el implementador
   con el banco 21).
3. Si no hay ya una cita futura de Sofía en `k_epi_pareja`, se llama a
   `agenda_crear_cita(k_p_sofia, k_ana, <centro Madrid>, 'e0280001-…-0002', v_martes, '10:00', p_episodio_id => k_epi_pareja)`.
4. Con los claims de `k_tec`, si no hay ya una cita `online` futura de Carmen, se llama a
   `agenda_crear_cita(k_p_carmen, k_ana, <Madrid>, 'e0280001-…-0001', v_miercoles, '10:00', p_modalidad_asistencia => 'online')`.
   - Si `k_tec` no está en el centro de Carmen, llama Ana y se anota en la bitácora.
   - La resolución automática le pondrá `k_epi_carmen`.
5. `perform set_config('request.jwt.claims', '', true);`.

Se usan las funciones de alta, como pide la tarea 13, y no un `insert` directo.

### 1.16 Documentación

- `docs/architecture.md`, §Roles, fila «Agenda», columna del técnico: «… con presencial/online; sin
  episodio (ADR-075)».
- `docs/architecture.md`, §Personas alrededor del paciente: el párrafo «La cita y su episodio
  (ADR-075, T-039)». Resume §1.4 a §1.13 en prosa e incluye:
  - el residuo H25;
  - el de reprogramar o cerrar un episodio fuera de su ventana;
  - que P1 limita la regla nota-cita a la nota «de la cita».
- `docs/interfaz.md` §14, la línea «Modalidad»: presencial/online existe en la cita desde T-039 y
  se pinta en el ticket de interfaz siguiente. La modalidad relacional no se pinta en la agenda,
  porque está bajo el candado.
- `scripts/rls/README.md`: la fila del banco 23.

### 1.17 Tipos

`npx supabase db reset && npm run tipos` regenera `lib/supabase/tipos-bd.ts`. Se espera:

- el enum `modalidad_asistencia`;
- dos columnas más en `citas` y en `series_cita`;
- dos argumentos opcionales en cada alta;
- una columna más en `agenda_citas_rango`;
- dos funciones nuevas.

`lib/citas/agenda.ts` y `lib/citas/series.ts` solo se tocan si `npx tsc --noEmit` o `npm run build`
fallan por esto.

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartada, y por qué |
|---|---|---|
| D1 | Cerrar `episodio_id` y `modalidad_asistencia` con **privilegios por columna** (`revoke` de tabla y `grant` de las 19). | Un disparador con `current_user` o con un GUC: el llamante lo pone con `set_config`, y el contrato lo prohíbe. Cerrarlo solo al técnico: deja el oráculo del administrador (tarea 3). Aquí el privilegio por columna sirve porque el cierre es igual para los tres roles. |
| D2 | Funciones de alta con **drop y create** y dos parámetros con valor por defecto al final. | La sobrecarga: con los mismos nombres y valores por defecto, PostgREST no sabe cuál llamar. `create or replace` con otra lista **crea** una sobrecarga (T-028a D2). |
| D3 | El cambio de asistencia va en una **función propia**. | Un parámetro nuevo en `agenda_actualizar_cita`: obliga a drop y create, cambia la llamada posicional de `agenda_editar_serie` (H9) y mezcla reprogramar con un dato logístico de otra autorización (el técnico por centro). |
| D4 | **La herencia de la serie va en un disparador** `before insert` de `citas`. | Repetirla en cada función: hay tres materializaciones y `confirmar_propuesta` (H11), y la siguiente que se escriba la olvidaría (es C6 otra vez). |
| D5 | La herencia **no lanza**. Una cita de serie con el episodio incoherente para su fecha nace nula. | Lanzar 23514: el técnico confirmaría una propuesta y vería un error que habla del episodio, que es un oráculo de la modalidad relacional. |
| D6 | La coherencia de la cita **no se ejecuta con `inicio`**. | Ejecutarla: la reprogramación del técnico sería un oráculo de las fechas de alta y baja del episodio. El residuo va al ticket que cierre episodios. |
| D7 | Un solo predicado, `cita_episodio_coherente`, para el disparador, el relleno y la completación. | Tres copias que se desvían con el primer cambio (el patrón de T-028a D6). |
| D8 | La regla nota-cita se aplica **solo si la cita es de la nota** (mismo paciente y autor = profesional de la cita, el predicado de 6.21). Es **P1**. | La letra («cualquier nota con `cita_id`»): rompe 20.U3 (la nota propia del coprofesional en la cita del titular, que T-034 D2 exige) y el 14 (KX36). Ninguno de los dos bancos está en el territorio. |
| D9 | La completación de la cita desde la nota **no lanza** si es incoherente (**P2**). | Lanzar: impediría escribir una nota clínica por un dato logístico. |
| D10 | El paso 5b de `episodio_para_nota` va **antes** del 6. | Después del 6: un `p_episodio_id = F` válido saldría por el 6 sin compararse con el de la cita (criterio 21.3). |
| D11 | El relleno de citas con notas mira las notas **de cualquier autor**. | Solo las «de la cita»: por H14 serían como mucho una, y Q1-A.1 («si todas están en el mismo») perdería sentido. Aquí, ante la duda, nulo es lo prudente. |
| D12 | Los congelados también cuentan **series**. | Solo citas: la serie seguiría heredando un episodio cuyo paciente cambió. |
| D13 | Cambiar el episodio de la cita usa `for update`. | `for no key update`: no choca con el `for key share` de la clave ajena de la nota, y se colaría una nota a la vez. |
| D14 | `crear_serie` resuelve con `p_desde`, y las citas lo validan por su fecha. | Resolver sesión a sesión: una serie con citas en dos episodios contradice que la serie tenga uno. |
| D15 | La enmienda del criterio 9.4 (abajo) es de redacción, no del propietario. | — |

**Enmienda de redacción del criterio 9, cuarta viñeta (para el orquestador).** `agenda_editar_serie`
no parte la serie (H10): no hay «serie nueva». El criterio se cierra así:

- tras «esta y las siguientes», la **misma** serie conserva `modalidad_asistencia` y `episodio_id`;
- las citas que nacen después de esa edición (propuesta confirmada o materialización) los llevan.

Si alguna vez se parte la serie, D4 la cubre sin cambiar nada: un `insert` en `series_cita` desde
una función copiaría los dos valores, y eso se diseñaría en ese ticket.

### Preguntas para el propietario (con recomendación; el diseño sigue la recomendación)

- **P1 · ¿A qué notas se aplica «la nota de una cita va en el episodio de la cita»?**
  Recomendación: **solo a la nota del profesional de la cita sobre el paciente de la cita**. Es la
  misma regla que ya usa la firma (6.21). La nota propia de un coterapeuta sobre esa sesión cuelga
  de **su** episodio, como exige T-034, y no se le impone el del titular. Si se aplica a todas, la
  nota del coterapeuta queda imposible y dos bancos ajenos a este ticket dejan de pasar.
- **P2 · Si la nota completa una cita sin episodio y el de la nota no encaja con la fecha de la
  cita (por ejemplo, el participante entró en el episodio después de esa cita), ¿se rechaza la
  nota o la cita se queda sin episodio?** Recomendación: **la cita se queda sin episodio y la nota
  entra**. Un dato logístico no debe impedir documentar una sesión.
- **P3 · ¿Puede el profesional quitar el episodio a una cita (dejarla sin episodio)?**
  Recomendación: **no**. La función solo cambia de un episodio a otro (un nulo da `'Falta el
  episodio.'`). Ninguna pantalla lo necesita y abriría una tercera vía de escritura.

## 3 · Cómo se cierra cada criterio de aceptación

Banco = `scripts/rls/23-cita-en-episodio.sql`. «Como X» = `call pg_temp.como(:X)`.

**Fijación del banco** (como `postgres`, **después de la sección A**):

- Pacientes P39 (titular), Q39 (participante) y R39 (ajeno), en el centro CA, de PRO1.
- Episodios:
  - E39, individual de PRO1 con P39, abierto;
  - EP39, de pareja de PRO1 con titular P39 y participantes P39 y Q39, alta hace 30 días;
  - F39, de PRO2 con P39;
  - EC39, de PRO1 con R39, cerrado en `current_date + 5`;
  - más los que pida cada caso.
- Citas por `agenda_crear_cita` en el año + 2 (como T-028a D13), y las «antiguas» del relleno por
  `insert` directo como `postgres`.
- Para el PIN: `pg_temp.como_con_2fa(:PRO1)` y `desbloquear_historia('111111')`
  (`19-nota-en-episodio.sql:112-116`).

| # | Cómo se demuestra |
|---|---|
| 1 | La salida de `npx supabase db reset`, `npm run seed`, `npm run test:rls`, `npm run lint:migraciones`, `npm test`, `npm run build`, `npm run verificar:huellas` («cadena íntegra») y `node ~/.claude/pipeline/territorio.mjs T-039`, todas con exit 0 y pegadas en `evidencia.json`. |
| 2 | Se aparta la migración (`git stash` del `.sql`), se hace `db reset` y se corre `npm run test:rls` con el banco 23 escrito. Los bancos 01-22 no dependen de nada de T-039, así que **la primera aserción que falla es la 23.A1**: `select pg_temp.assert(exists (select 1 from information_schema.columns where table_schema='public' and table_name='citas' and column_name='modalidad_asistencia'), '23.A1 …')`. **Nada del banco antes de A1 puede nombrar el enum ni las columnas.** La salida se pega en la evidencia. |
| 3 | Sección A: `information_schema.columns` (`is_nullable`, `column_default like '''presencial''%'`), `information_schema.referential_constraints` y `key_column_usage` para las dos claves ajenas, `enum_range(null::public.modalidad_asistencia)::text = '{presencial,online}'`, el recuento de columnas `like '%relacional%' or like '%participante%'` en `citas`, `series_cita` y `citas_agenda` (= 0), y `position('relacional' in pg_get_function_result('public.agenda_citas_rango(…)'::regprocedure)) = 0`, y lo mismo con `participante`. |
| 4 | Sección R, como `postgres`. Las citas antiguas se insertan directamente. Las notas de (a) y (b) se insertan con `alter table public.notas_clinicas disable trigger exigir_nota_en_episodio_de_su_cita` y se vuelve a encender justo después: son datos de antes de T-039 y es la única forma de que existan. (a) una nota de PRO1 en E39 sobre la cita Ra. (b) la cita Rb con una nota de PRO1 en E39 y otra de PRO2 en F39. (c) PRO1 y R2, con un solo episodio. (d) PRO1 y un paciente con dos abiertos. (e) un participante con `baja_en = current_date` y la cita en `current_date + 3`. (f) una cita con `episodio_id` ya puesto (por `crear_cita` explícito). Primero `create temp table antes as select id, to_jsonb(c) - 'episodio_id' j from citas c`, se guarda el recuento y se llama. Las aserciones: (a) a (f), `j` igual en todas las filas, el mismo recuento, y en la segunda llamada `(r->>'por_nota')::int + (r->>'por_candidato')::int + (r->>'series')::int = 0`. |
| 5 | Como ADM, PRO1 y TEC1: `assert_lanza_codigo_msg('select public.rellenar_episodio_de_citas()', '42501', 'permission denied')`. |
| 6 | Sección C, como `postgres`, con `insert` y `update` directos sobre `citas`: V1 (F39 en la cita de PRO1), V2 (EP39 con R39), V3 (Q39 con `baja_en` anterior a la fecha) y V4 (EC39 con la cita en `+6`). Cada una con `assert_lanza_codigo_msg(…, '23514', <fragmento>)`. Las gemelas entran: el titular, Q39 activo y EC39 con la cita en `+5`. En `series_cita`: S1 y S2 con sus gemelas. |
| 7 | Sección K, como `postgres`: un `update` de `profesional_id` y otro de `paciente_id` sobre un episodio con citas y sin notas dan 42501 «tiene citas: su paciente y su profesional no cambian». Un `delete` y un `update paciente_id` sobre el participante Q39 con citas dan 42501 «tiene citas en este episodio». Las gemelas son un episodio y un participante sin citas. Además, el 19 y las secciones de T-035 pasan sin tocarse: con `git diff --stat scripts/rls/19-nota-en-episodio.sql` vacío y `test:rls` en verde. |
| 8 | Sección W. Se toma `create temp table w0 as select id, episodio_id from citas` (y lo mismo con series). Como ADM, PRO1 y TEC1: `update citas set episodio_id = :EP39 where id = :CW`, `update citas set episodio_id = :EP39` (sin WHERE), `insert into citas (…, episodio_id)`, y lo mismo sobre `series_cita`. Todos dan 42501 `permission denied`. Como `postgres`, la diferencia con `w0` es 0 filas. También `has_column_privilege('authenticated','public.citas','episodio_id','UPDATE')` y `INSERT` son falsos (y para `modalidad_asistencia`), y `has_column_privilege(…,'sala','UPDATE')` es verdadero. La gemela es §1.13 en el criterio 17. |
| 9 | Sección M. Como TEC1, `crear_cita(…, p_modalidad_asistencia => 'online')`: se mira como `postgres` y es `online`. Sin el parámetro, `presencial`. `crear_serie(…, 'online')` con PRO1 y Q39 (su único abierto con PRO1 es EP39, así que la serie lo resuelve) deja la serie y todas sus citas en `online`, con el `episodio_id` de la serie. Una propuesta de esa serie (forzada por un festivo o por una cita ocupada, como en el 16), confirmada con `agenda_confirmar_propuesta`, nace `online` y con el episodio de la serie. `agenda_editar_serie(…, 'esta_y_siguientes', …)` deja **la misma** serie con los dos valores, y las citas posteriores también (enmienda de §2). |
| 10 | Sección N, como PRO1 **y** como TEC1, mirado como `postgres`. Titular con un solo abierto: ese episodio. Q39 (participante activo del único abierto de PRO1 con él): EP39. Dos abiertos: nulo. Ninguno: nulo, y `count(*) from episodios_asistenciales` igual antes y después. Con el abierto de PRO2 para el mismo paciente y ninguno de PRO1: nulo. |
| 11 | Sección X. PRO1 dueño, sin desbloquear el PIN, con `p_episodio_id => :EP39`: entra con EP39. TEC1 con `gen_random_uuid()`: 42501 «no elige episodio para una cita». ADM con EP39, PRO2 con EP39 (cita de PRO2), PRO1 con `gen_random_uuid()` y PRO1 con E39 para R39: los cuatro dan 42501 con **el mismo** «no vale para esta cita». Se asevera además que los cuatro `sqlerrm` son iguales (se capturan en un `do` con `get stacked diagnostics`). PRO1 con EC39 cerrado: 22023 «está cerrado». |
| 12 | Sección T, como TEC1: `select position(:'EP39' in coalesce(r::text,'')) = 0` sobre el resultado de `crear_cita` (Q39 resuelto a EP39), de `crear_serie`, de `agenda_previsualizar_alta` y de `agenda_cambiar_asistencia`. Lo mismo como PRO1 con `p_episodio_id => :EP39`. |
| 13 | Sección L, como TEC1: `information_schema.columns` de `citas_agenda` tiene `modalidad_asistencia` y no tiene `episodio_id`. `select modalidad_asistencia from citas_agenda where id = :C_ONLINE` da `online`. El 15:384 sigue en verde. |
| 14 | `agenda_citas_rango(<rango>)` como ADM, PRO1 y TEC1 sobre la cita online: `modalidad_asistencia = 'online'` en los tres. `position('episodio_id' in pg_get_function_result(…)) = 0`. El 18 sigue en verde. |
| 15 | Como TEC1: `count(*)` de `episodios_asistenciales` y de `episodio_participantes` es 0, con EP39 y una cita que apunta a él ya existentes. |
| 16 | Sección S. TEC1 (centro A) cambia a `online` una cita futura de CA. TEC2 (centro B) da 42501 «cambiar la asistencia de esa cita». PRO1 (su cita) y ADM pueden. PRO2 da 42501 con el mismo fragmento. Sobre una cita pasada (fin en el pasado, insertada como `postgres`), con el valor contrario, da 42501 «no cambia de presencial a online». |
| 17 | Sección E. PRO1 con PIN (`como_con_2fa` y `desbloquear_historia`) cambia E39 a EP39 en una cita sin notas de P39: entra. Sin PIN: 42501 «desbloquéala con el PIN para cambiar el episodio». Con una nota en la cita: 42501 «ya tiene nota: su episodio no cambia». TEC1: 42501 «corrige su episodio». ADM: lo mismo. PRO1 con un episodio suyo de otro paciente (E de R39): 23514 «no es titular ni participante del episodio». |
| 18 | Sección P, como `postgres`, sobre una cita con `fin <= now()` insertada directamente: de nulo a E39 entra; de E39 a EP39 da 42501 «no cambia de episodio una vez asignado»; a nulo, lo mismo; `modalidad_asistencia` da 42501 «no cambia de presencial a online». La gemela futura: los cuatro pasan. |
| 19 | Sección Y, como PRO1 con PIN: una cita de P39 en E39 (por `crear_cita` explícito) y una nota (`insert` como la haría la aplicación por `episodio_para_nota`) con esa cita y `episodio_id = EP39`: 23514 «va en el episodio de la cita». La gemela, en E39, entra. |
| 20 | Una cita de P39 sin episodio (dos abiertos, así que la resolución la deja nula) y una nota de PRO1 en E39 con esa cita: se mira como `postgres` y `citas.episodio_id = notas_clinicas.episodio_id`. |
| 21 | PRO1 con PIN y dos abiertos con P39 (E39 y EP39). `episodio_para_nota(:P39, p_cita_id => <cita en E39>)` = E39. `episodio_para_nota(:P39)` da `EP001`. `episodio_para_nota(:P39, :EP39, :<cita en E39>)` da 42501 «El episodio elegido no vale para esta nota.». |
| 22 | Sección J. Ana-like = PRO1 y Hugo-like = Q39 (con el profesional asignado PRO2 y el desbloqueo de PRO2, como en 03-candado:53-60). La cita de P39 en EP39, la nota de PRO1 con esa cita, `episodio_id = EP39` y `paciente_id = P39`. La v1 se sella con `pg_temp.sobre_prueba(…, p_cita_id => …, p_alcance => 'conjunta')` como en `01-fijacion.sql:131-134` y entra (6.21 intacto). Como PRO2 con PIN, la nota se ve (`count = 1`). Fuera del banco: `npm run verificar:huellas` y `grep -c "fn_sellar_version_nota\|verificar_cadena_huellas" supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql` → `0`. |
| 23 | Tras `db reset && seed`, en `psql` como `postgres`: `select count(*) from citas where modalidad_asistencia='online'` (≥ 1); `select count(*) from citas where episodio_id = 'e0080001-0000-4000-8000-000000000001'` (≥ 1); y la **consulta de incoherencia**, que no usa la función, para que no se valide a sí misma. Debe dar 0. |

La consulta de incoherencia del criterio 23 (debe dar 0):

```sql
select count(*) from public.citas c
  join public.episodios_asistenciales e on e.id = c.episodio_id
 where not (
   c.profesional_id = e.profesional_id
   and (e.cerrado_en is null or e.cerrado_en >= (c.inicio at time zone c.zona_horaria)::date)
   and (c.paciente_id = e.paciente_id
        or exists (select 1 from public.episodio_participantes ep
                    where ep.episodio_id = e.id and ep.paciente_id = c.paciente_id
                      and ep.alta_en <= (c.inicio at time zone c.zona_horaria)::date
                      and (ep.baja_en is null
                           or ep.baja_en >= (c.inicio at time zone c.zona_horaria)::date))));
```

Su análoga para series (también se pega): `profesional distinto`, o `cerrado_en is not null`, o
(ni titular ni participante con `baja_en is null`).

| # | Cómo se demuestra |
|---|---|
| 24 | `grep -n "ADR-075" docs/architecture.md` encuentra la fila «Agenda» y el párrafo nuevo. `grep -n "T-039" docs/interfaz.md` encuentra la línea de §14. |

## 4 · Riesgos, por probabilidad

1. **Alta · La lista del `grant` por columna.** Si falta una columna que algún banco escribe a mano
   como `authenticated` (15 y 17 prueban las políticas `citas_alta` y `citas_modificacion`), sale
   un `permission denied` donde antes salía un error de RLS. *Mitigación*: la lista sale de
   `information_schema` al implementar, y se hace `grep -n "insert into public.citas\b" scripts/rls/*.sql`
   buscando un `insert … values` **sin** lista de columnas (necesitaría privilegio sobre las 21).
2. **Alta · T-028a cambia algo de H19 al integrarse** (la firma, que inserte las citas ella misma,
   o los mensajes A1-A4). *Mitigación*: es la precondición del encabezado.
3. **Media · La resolución automática asigna EPI y EPI2 a las series y citas de los bancos 16, 17,
   21 y 22.** Hoy ningún banco posterior muta esos episodios (H21). Pero un banco que, después del
   16, cambie el paciente o el profesional de EPI, o borre a P2 de EPI, daría el 42501 de §1.7.
   *Mitigación*: `grep -n ":EPI\b\|:EPI2\b" scripts/rls/2[12]*.sql` al empezar.
4. **Media · La completación toca citas de los bancos 14 y 20.** Las notas «de la cita»
   (N36→K36/K36B, N5→C5) completan su `episodio_id` y escriben una fila de `auditoria` de `citas`
   más. Ninguna aserción de 14-20 cuenta filas de auditoría de citas (solo 15:256, antes de que
   haya notas), pero el implementador lo comprueba con grep.
5. **Media · El orden de los disparadores por nombre.** Si alguien renombra uno, el 42501 de la
   cita pasada pasaría a salir después del 23514. *Mitigación*: el banco asevera la cita pasada con
   un episodio incoherente y espera 42501 (criterio 18).
6. **Media · La vista pierde `security_barrier`** si se omite el `with (…)`. *Mitigación*: una
   aserción sobre `pg_class.reloptions` de `citas_agenda`, que debe contener
   `security_barrier=true` y `security_invoker=false`.
7. **Baja · Drop y create de `agenda_citas_rango`**: se pierde el `grant` o el `revoke` de
   `service_role`. *Mitigación*: `has_function_privilege` para `authenticated` (sí) y para `anon`
   (no) en la sección L.
8. **Baja · La siembra con JWT dentro del DO** puede chocar con el 2FA (aal2) o con el vínculo de
   agenda del técnico. *Mitigación*: §1.15.2 y §1.15.4.
9. **Baja · H25.** Con esta migración, las filas de auditoría de `citas` que lee el técnico llevan
   `episodio_id`. Es conocido y está documentado. No se cierra aquí.

## 5 · Qué revisar

- **Lo que puede elegir el llamante y qué efecto tiene:**
  - `p_episodio_id`: el técnico, siempre 42501, antes de cualquier lectura del episodio. Los demás:
    un solo mensaje para inexistente, ajeno, de otro paciente o si llama el administrador; cerrado
    solo se le dice al dueño;
  - `p_modalidad_asistencia`: un nulo explícito da 22023 y nunca llega a `not null` (23502);
  - `p_profesional_id` sí entra en E2: el episodio tiene que ser de **los dos**, de `auth.uid()` y
    de `p_profesional_id`.
- **Oráculos:**
  - ¿Alguna ruta del técnico puede dar un 23514 de §1.6? No debe: la resolución es coherente por
    construcción y la herencia no lanza (D5). Hay que buscar un `raise` alcanzable con
    `new.serie_id` no nulo;
  - ¿Alguna función devuelve el episodio? (criterio 12);
  - ¿`citas_agenda` o `agenda_citas_rango` lo exponen?
- **Otras puertas para `episodio_id`:**
  - `update` directo por los tres roles, con y sin WHERE;
  - `insert … select`;
  - `insert` en `series_cita`;
  - `service_role` no tiene privilegios (H2);
  - `TRUNCATE` sigue revocado (H2).
  - ¿La lista del `grant` es exactamente la de las 19 columnas y no lleva las dos nuevas?
- **Nulos:** `episodio_id` nulo pasa todos los disparadores; `cita_id` nulo en la nota no hace
  nada. Hay que mirar si `cita_episodio_coherente` con un episodio inexistente devuelve `false` y
  no `null`: `if not coherente` con un nulo **no** lanza. Hay que usar `is not true`.
- **Concurrencia:**
  - `for share` en el episodio y en las filas del participante (§1.6);
  - el BEFORE de §1.7 corre con la fila ya bloqueada;
  - `for update` en §1.13 (D13);
  - `for no key update` en §1.9.
  - **Tiene que fallar**: una prueba de dos sesiones no cabe en el banco. El revisor comprueba por
    lectura que hay los cuatro candados.
- **Pruebas negativas y su motivo exacto:**
  - 23.A1 sin la migración (criterio 2);
  - el 22023 de M0 y no el 23502;
  - el 42501 de `permission denied` del criterio 8, **no** un error de RLS;
  - en 11, los cuatro `sqlerrm` iguales;
  - 18 con «una vez asignado» y no con «reprogramar ni reatribuir».
- **Re-emisiones idénticas:** `diff` entre el cuerpo anterior y el nuevo de
  `fn_proteger_cita_pasada`, de `episodio_para_nota` y de `agenda_citas_rango`. Solo deben cambiar
  las líneas que este diseño nombra.
- **Lo que no se re-emite:** `grep -c` de `fn_congelar_episodio_con_notas`,
  `fn_exigir_episodio_coherente_en_nota`, `fn_sellar_version_nota`, `verificar_cadena_huellas`,
  `agenda_confirmar_propuesta` y `agenda_editar_serie` en la migración debe dar 0.
- **Mensajes:** ninguno nuevo contiene un fragmento de H18; ninguno es prefijo de otro (comparar
  con `'La cita no existe o no es tuya.'` de H9); solo los dos de §1.8 contienen «pasada».
- **Relleno:** que solo toque filas con `episodio_id` nulo, que se llame antes de los disparadores,
  y que sus recuentos sumen el total de nulas de antes.

## 6 · Territorio

Es el del contrato, concretado:

- `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql`
- `supabase/seed-completo.sql`
- `scripts/rls/23-cita-en-episodio.sql`
- `scripts/rls/README.md`
- `lib/supabase/tipos-bd.ts`
- `lib/citas/agenda.ts`, `lib/citas/series.ts`: solo si la compilación lo exige.
- `docs/architecture.md`; `docs/interfaz.md` (solo §14).
- `docs/bitacora/T-039.md`, `docs/state.md` (memoria, constitución 4) y `tickets/T-039/**`
  (evidencia y revisión).

Según este diseño, **no se tocan** 11, 15, 16, 18 ni 19: no hay políticas nuevas y ninguna aserción
enumera columnas. Si al implementar alguna falla, se para y se devuelve. 14 y 20 **no** están en el
territorio, y por eso P1 importa.

## 7 · Delegable

Nada. Todo es SQL con comportamiento (privilegios, disparadores, autorización) o pruebas de esas
puertas. Lo único sin comportamiento son la fila del README y los dos párrafos de documentación, y
no compensan un encargo aparte.

## Lo que no entra, y por qué

- **Telepsicología** (Q3-A): consentimiento, plataforma, enlace y ENS van en un ADR y un ticket
  propios.
- **Pintar la modalidad**: es interfaz (ADR-075.3).
- **El pagador de la cita** (C12): carril económico.
- **Que el otro participante vea la cita conjunta**: es el precio de Q2-A.
- **H25**: el ticket de auditoría alineada con la matriz.
- **Reprogramar una cita fuera de la ventana de su episodio, cerrar un episodio con citas futuras,
  o dar de baja (`baja_en`) a un participante con citas posteriores.** Ninguno vuelve a comprobar la
  coherencia (D6). Va en el ticket que cierre episodios (T-034 SQL-H2).
- **Cambiar el episodio o la asistencia de toda una serie**: aquí se cambia cita a cita. Las citas
  que nazcan después heredan de la serie.
- **Validar que el tipo de terapia y la modalidad relacional cuadran**: lo corrige el profesional
  con §1.13.
- **Que `episodio_para_nota` abra un episodio y lo ponga en la cita**: lo hace la nota al
  insertarse (§1.9). No hace falta una segunda escritura.
- **Mapear en `lib/citas/errores.ts` o en `lib/notas` los mensajes nuevos** (22023 de alta y
  23514): caen en el genérico. Los pinta el ticket de interfaz siguiente.
- **Comprobar el estado (cancelada) en el cambio de asistencia**: no lo pide el contrato, y
  `agenda_actualizar_cita` tampoco lo hace (hallazgo de T-014).

## Decisiones del propietario (02-10-2026)

| Pregunta | Respuesta |
|---|---|
| P1 | **Solo la nota del profesional de la cita sobre el paciente de la cita** (la regla de la firma, 6.21). La nota propia del coterapeuta cuelga de su episodio. |
| P2 | **La nota entra y la cita se queda sin episodio** cuando el episodio de la nota no encaja con la fecha de la cita. |
| P3 | **No**: el profesional solo cambia la cita de un episodio a otro; un nulo da `'Falta el episodio.'`. |

Las tres coinciden con la recomendación: el diseño queda como está. La enmienda de redacción del
criterio 9 (`agenda_editar_serie` no parte la serie) la acepta la fábrica.

## Adenda ronda 2 (03-10-2026)

Responde a `tickets/T-039/revision.md` (commit `80a99b6`): dos ALTA (A-H1, A-H2), tres MEDIA
(B-H1, B-H2, B-H3) y una BAJA (B-H4). Esta adenda solo añade. Donde contradice algo de arriba
lo dice, y manda la adenda.

### R2.0 · Hechos verificados para esta ronda

Ruta base: el worktree `.claude/worktrees/agent-a2658d2ddedfd067c`.

| # | Hecho | Dónde |
|---|---|---|
| R1 | La migración revoca `insert, update` sobre la tabla y concede por columna 19 columnas a `authenticated`. Entre ellas están `paciente_id`, `profesional_id` y `serie_id`, en el `insert` y en el `update`. | `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql:60-69` |
| R2 | `fn_velar_episodio_de_cita`, paso 1: con `INSERT` y `serie_id`, lee la serie `for share`, copia la modalidad y copia el episodio si `cita_episodio_coherente(...)`. **No compara** el paciente ni el profesional de la cita con los de la serie. El paso 2 sale con un episodio nulo y el paso 3 sale si no cambian ni `episodio_id`, ni `paciente_id`, ni `profesional_id`. El disparador es `before insert or update of episodio_id, paciente_id, profesional_id`. | misma migración, `:266-371` |
| R3 | `fn_proteger_cita_pasada` ya congela `serie_id`, `paciente_id` y `profesional_id` en una cita pasada. Corre antes que `velar_episodio_de_cita` (orden alfabético). A-H1 y A-H2 solo se juegan en citas futuras. | misma migración, `:517-580` (líneas 25-27 del cuerpo) |
| R4 | Ninguna función de ninguna migración hace `update public.citas set paciente_id`, `profesional_id` ni `serie_id`. Ninguna fusión de duplicados repunta citas (ADR-031). | `grep -A3 "update public.citas" supabase/migrations/*.sql` |
| R5 | Las tres puertas legítimas de una cita con `serie_id` usan los valores de la serie. `agenda_crear_serie` y la materialización insertan con `p_paciente_id` y `p_profesional_id`, los mismos con los que crean la serie. `agenda_confirmar_propuesta` usa los de la propuesta. `propuestas_cita` solo tiene `select` para `authenticated`, y sus propuestas las crean las funciones a partir de la serie. | `20260910120000_series_materializacion_desviaciones.sql:733-742, 1150-1160, 1277-1278`; `20260925120000_editar_serie_desde_la_cita.sql:863` |
| R6 | Ningún banco ni la aplicación escriben `citas.serie_id` como `authenticated`. Los `insert` con `serie_id` de los bancos 16 (`:357`, `:1266`, `:1619`) y 17 (`:183-197`) van como `postgres`, con el paciente y el profesional de su serie. `app/` y `lib/` no escriben `citas`. | `scripts/rls/16-series.sql`, `scripts/rls/17-vinculo-agenda.sql`, `grep` en `app lib` |
| R7 | En el banco 23, `23.C6` comprueba el `UPDATE` de `paciente_id` solo como `postgres` y espera el fragmento de V2. `23.A6` no dice nada de `serie_id`. `23.X5` usa el fragmento `'está cerrado'`, que también casa con `'El episodio de la cita está cerrado.'` del paso 5b. | `scripts/rls/23-cita-en-episodio.sql:82, 366-367, 644` |
| R8 | `episodios_modificacion` deja al profesional del episodio poner `cerrado_en = null` con la historia desbloqueada. Ningún disparador vuelve a comprobar las citas al cerrar ni al reabrir (D6). | `20260822160000_rls_funciones_y_politicas.sql:1037-1047` |
| R9 | La siembra inserta a mano las dos citas de T-039, con uuids fijos y con `episodio_id` y `modalidad_asistencia` puestos. No cambia los claims del JWT en ningún sitio. `rol_actual()` no mira `aal`, así que `agenda_crear_cita` no pide 2FA. La bitácora no justifica el `insert` directo. | `supabase/seed-completo.sql:553-578`; `20260822160000_rls_funciones_y_politicas.sql` (`rol_actual`); `docs/bitacora/T-039.md:17` |
| R10 | `architecture.md:425` dice «El técnico no elige ni ve el episodio», y no cita H25. `interfaz.md:425-426` dice `tipo · modalidad · profesional`. | worktree, `docs/` |

### R2.1 · A-H1 · Una cita con episodio no cambia de paciente ni de profesional

**Veredicto**: la propuesta del orquestador vale, con un ajuste: el 23514 constante cubre también
`profesional_id`. Hoy V1 ya lo rechaza siempre: el profesional del episodio es el antiguo y §1.7 lo
congela. Pero eso depende de que V1 se evalúe antes que V2 a V4, y un reordenamiento futuro
reabriría el oráculo. El contrato (tarea 6) nombra los dos campos.

**Migración**. En `fn_velar_episodio_de_cita` entra un paso **0** nuevo, antes del paso 1 y del
paso 2, porque el paso 2 sale con un episodio nulo y `postgres` podría vaciar el episodio y
cambiar el paciente en la misma sentencia:

```sql
-- 0 · Una cita con episodio no cambia de paciente ni de profesional. Constante: no mira
--     participación ni fechas, así que no responde a quien prueba pacientes (A-H1).
if tg_op = 'UPDATE' and old.episodio_id is not null
   and (new.paciente_id is distinct from old.paciente_id
        or new.profesional_id is distinct from old.profesional_id) then
  raise exception 'Una cita con episodio no cambia de paciente ni de profesional (ADR-075).'
    using errcode = '23514';
end if;
```

- El mensaje es literal: sin uuid, sin fecha y sin nombre.
- Su fragmento `no cambia de paciente ni de profesional` no es prefijo de ningún otro mensaje.
  Tampoco lo contiene ninguno de los fragmentos `no cambia de episodio una vez asignado`,
  `no cambia de presencial a online`, `su paciente y su profesional no cambian`, `pasada` ni de los
  de H18.
- Vale para cualquier llamante, `postgres` incluido.
- La cabecera del disparador no cambia: ya incluye `paciente_id` y `profesional_id`.

**El grant de `paciente_id` se queda.**
- Ninguna ruta de la aplicación lo usa (R6), pero retirarlo no cierra nada que el paso 0 no cierre:
  el paso 0 también cubre las funciones definer y las futuras.
- Retirarlo cambiaría a 42501 el error de toda reasignación de una cita sin episodio, que hoy es
  legítima para el administrador. Eso es una decisión de producto, no de este hallazgo.
- Queda anotado en R2.9.

**Banco 23**. Sección nueva **D · El paciente y el profesional de una cita con episodio no se
cambian (A-H1)**, justo después de W, porque W11 ya usa `c_w` y W15 hace una foto de la tabla.
Datos, como `postgres`:
- `c_cu`, que ya existe: cita futura de P39 en EP39.
- `c_eb`: cita futura de W39 en EB39, en el día 3, fuera de la baja de V39, con
  `sql_ins39(:W39, :PRO1, 3, '13:00', :EB39)`.

| Id | Quién | Qué | Espera |
|---|---|---|---|
| 23.D1 | ADM (`como`, sin PIN) | `update citas set paciente_id = Q39 where id = c_cu` (Q39 es participante activo, el caso que antes *entraba*) | 23514, `no cambia de paciente ni de profesional` |
| 23.D2 | ADM | lo mismo con R39 (ajeno) y con H39 (de PRO2, ajeno) | el mismo 23514 |
| 23.D3 | ADM | `paciente_id = V39 where id = c_eb` (participante de baja: antes «no estaba de alta») | el mismo 23514 |
| 23.D4 | ADM | `sqlerrm39(...)` de D1, D2 (las dos) y D3 | **las cuatro cadenas son iguales**. Es la aserción que cierra el oráculo: la igualdad de códigos sola no basta. |
| 23.D5 | PRO1 (`como`, **sin** `desbloquear_historia`) | D1, D2 y D3 sobre sus propias citas | el mismo 23514; los `sqlerrm39` son iguales entre sí y a los de D4 |
| 23.D6 | PRO1 | `update citas set profesional_id = PRO2 where id = c_cu` | el mismo 23514, con la misma cadena |
| 23.D7 | `postgres` | D1 y D6 | el mismo 23514. Ni el dueño se lo salta. |
| 23.D8 | todos | después de D1 a D7, `c_cu` y `c_eb` conservan `paciente_id`, `profesional_id` y `episodio_id` | 0 filas cambiadas |
| 23.D1b gemela | ADM | `update citas set paciente_id = Q39 where id = c_w` (sin episodio) | entra |
| 23.D2b gemela | PRO1 | `update citas set sala = 'Sala D' where id = c_cu` (con episodio, columna abierta) | entra |

**Reescritura de 23.C6**. El `UPDATE` de `paciente_id` sobre `c_cu` da ahora el fragmento del paso
0, y C6 pasa a esperarlo. La cobertura de V2 por `UPDATE` se queda en **23.C6b**:
- como `postgres`, se crea una cita de R39 sin episodio (`sql_ins39(:R39, :PRO1, 8, '05:00', null)`);
- después, `update citas set episodio_id = EP39` sobre ella;
- espera `no es titular ni participante del episodio`.

C5 no cambia: cambia `episodio_id` y no `paciente_id`, así que el paso 0 no interviene.

**Documentación**. En el párrafo de `architecture.md` (ver R2.3) entra la frase: «Una cita con
episodio no cambia de paciente ni de profesional (23514, constante); para moverla se cancela y se
da otra».

### R2.2 · A-H2 · La herencia de la serie: el `grant` y la comprobación

**Veredicto**: la propuesta del orquestador **no basta**. Si solo se comprueba que paciente y
profesional coinciden con los de la serie, queda abierto el oráculo de `baja_en` y `cerrado_en` día
a día, el de la propia revisión:
- el administrador o PRO1 insertan a mano una cita de V39 con el `serie_id` de la serie **de V39**,
  en EB39;
- el paciente y el profesional coinciden con los de la serie;
- la cita de hoy hereda el episodio y la de mañana no;
- al releer `episodio_id`, el administrador lo ve como un uuid opaco y PRO1 como suyo.

Hacen falta dos cambios.

**Migración, parte 1: `serie_id` sale del `grant insert` y del `grant update` de `citas`**, en
`:60-69`. Quedan 18 columnas en cada lista.
- ADR-069 ya dice que las series y lo que nace de ellas solo se crean por la función que las valida.
- Nadie escribe `serie_id` como `authenticated` (R6).
- Con esto, el `insert` directo con `serie_id` da 42501 `permission denied` antes de los
  disparadores, para cualquier serie, sea propia o ajena. No queda respuesta que leer.
- El `update` de `serie_id` en una cita futura también se cierra. Hoy un administrador podría colgar
  de una serie una cita suelta, y cualquier edición posterior de la serie la arrastraría.

**Migración, parte 2: comprobación en el paso 1**, para `postgres` y las funciones definer.
- Al leer la serie, se leen también `s.paciente_id` y `s.profesional_id`.
- Si la serie existe y `new.paciente_id is distinct from s.paciente_id or new.profesional_id is
  distinct from s.profesional_id`, se lanza:
  ```sql
  raise exception 'Una cita de una serie es del paciente y del profesional de la serie (ADR-069).'
    using errcode = '23514';
  ```
- Va **antes** de `cita_episodio_coherente`, así que no depende de la participación.
- Fragmento: `es del paciente y del profesional de la serie`. No casa con
  `no son del mismo profesional de la serie` (C7), ni al revés.
- **Esto enmienda D5** («la herencia no lanza»). Ninguna puerta legítima puede disparar este error
  (R5): solo salta con una fila fabricada fuera de las funciones.

**¿Se cierra la fuga de `baja_en` día a día?** Por la puerta del `insert` directo, sí, del todo:
- `authenticated` ya no puede nombrar una serie (parte 1);
- `postgres` no es un atacante.

Queda un **residuo, que el contrato manda**: la resolución automática de `agenda_crear_cita`
(tarea 4.3, «sea quien sea el llamante») junto con la lectura opaca de `citas.episodio_id` por el
administrador (tarea 12).
- Un administrador que da una cita a Hugo con PRO1 en la fecha F ve si nace con un episodio, y con
  cuál, el mismo uuid que en las citas de Sofía.
- La diferencia con A-H2 es el coste: no es un `insert` silencioso. Deja una cita real, auditada,
  que no se borra (como mucho se cancela) y que la agenda de PRO1 enseña.
- No es una contradicción del contrato con sí mismo. La tarea 3 cierra la escritura directa; la
  4.3 y la 12 piden esto a sabiendas.
- Para el técnico, el mismo efecto pasa por H25: lee el `episodio_id` de las citas que da en su
  auditoría (R2.3).
- Se documenta en `architecture.md` y va como **pregunta P4** al propietario (R2.10).

**Banco 23**. Sección nueva **H · Una cita de serie es de su serie (A-H2)**, después de M, que ya
tiene `id_ser_m` (serie de P39 con PRO1).

Datos, como `postgres`:
- `id_ser_v`: una serie de V39 con PRO1 sobre EB39. La crea `sql_serie39(:V39, :PRO1, :EB39)`,
  que pasa S2 porque `baja_en` es hoy y S2 mira «activo» al crear; si S2 la rechaza, se usa una
  serie de W39 sobre EB39 y los casos de V39 se hacen con W39 de paciente ajeno a la serie.
- `id_ser_q`: una serie de Q39 sobre EP39, la de 23.C8b.

| Id | Quién | Qué | Espera |
|---|---|---|---|
| 23.H1 | — | `has_column_privilege('authenticated','public.citas','serie_id','INSERT')` y `'UPDATE'` | los dos falsos. La gemela: `sala` sigue siendo `true` en los dos. Se añade también a 23.A6. |
| 23.H2 | ADM (`como`, sin PIN) | `insert into citas (paciente_id, profesional_id, centro_id, inicio, fin, zona_horaria, serie_id)`: Q39 sobre `id_ser_m` (serie ajena); V39 sobre `id_ser_v` hoy; V39 sobre `id_ser_v` mañana | las tres dan 42501 `permission denied` y sus `sqlerrm39` son **iguales** |
| 23.H3 | PRO1 (`como`, sin PIN) | lo mismo que H2 | lo mismo |
| 23.H4 | ADM y PRO1 | `update citas set serie_id = id_ser_m where id = c_w` | 42501 `permission denied` |
| 23.H5 | `postgres` | `insert` con `serie_id = id_ser_m` y paciente Q39, R39 o H39 (profesional PRO1); y con paciente P39 y profesional PRO2 | 23514, `es del paciente y del profesional de la serie`; los cuatro `sqlerrm39` son iguales |
| 23.H6 | `postgres` | después de H2 a H5, `count(*)` de citas con `serie_id in (id_ser_m, id_ser_v)` | igual que antes de H2 |
| 23.H1b gemela | `postgres` | `insert` de P39 y PRO1 sobre `id_ser_m`, en un día futuro dentro de EP39 | entra, con `episodio_id = EP39` y la modalidad de la serie (la herencia sigue viva) |
| 23.H2b gemela | PRO1 | `agenda_confirmar_propuesta(id_prop_m)` (ya lo hace M3/M4) | sigue entrando: la puerta legítima no tropieza con el 23514 |

El banco 16 no cambia, aunque sus `insert` con `serie_id` van como `postgres`: todos usan el
paciente y el profesional de su serie (R6). Si alguno falla con el fragmento nuevo, el error está
en la fijación, no en el producto: se corrige la fijación y se anota.

**Documentación**. En el párrafo de `architecture.md`:
- «`serie_id` tampoco se escribe a mano (ADR-069); una cita de una serie es del paciente y del
  profesional de la serie (23514)».
- El residuo de la resolución automática, con el texto de R2.3.

### R2.3 · B-H1 · El técnico lee `episodio_id` en su auditoría

**Veredicto**: es una fuga, y es **H25**, la que el contrato aplaza al ticket de auditoría alineada
con la matriz.
- `agenda_cambiar_asistencia` **no abre una clase de puerta nueva**.
  `agenda_actualizar_cita(id, null, null, null, null)` ya permite al técnico escribir un
  `UPDATE` sin cambios sobre cualquier cita de sus centros. `fn_auditar` copia la fila entera
  menos `nota_operativa`, y `auditoria_lectura_propia` le deja leerla. Así lee `tipo_terapia_id`
  y, desde T-039, `episodio_id`.
- La severidad **sigue en MEDIA**, porque lo que falla es la documentación:
  `architecture.md:425` afirma lo contrario.
- **Pero H25 deja de ser cosmética.** Con T-039, el técnico puede deducir parejas (el mismo uuid
  en las citas de Sofía y de Hugo). Recomiendo que el orquestador anote en `docs/state.md` que
  H25 **bloquea la puesta en producción**.

**Migración**: ningún cambio. Descartado:
- **No registrar `episodio_id` en la auditoría de `citas`** (añadirlo a los cortes de
  `fn_auditar`). Rompe la trazabilidad de quién cambió el episodio de una cita
  (`agenda_cambiar_episodio_cita`, §1.13) para el administrador y para el profesional, y deja
  abierto `tipo_terapia_id`.
- **Filtrar la lectura del técnico.** Es reescribir `auditoria_lectura_propia`, que es exactamente
  el alcance de H25 y fuera del territorio de T-039 (es otra tabla y otra política). Hacerlo aquí a
  medias, solo para `citas.episodio_id`, crearía dos reglas para la misma tabla.

**Banco 23**: ninguna aserción nueva que pruebe la fuga. Una aserción que la diera por buena la
consagraría. Hay que comprobar que **ninguna aserción existente afirme** que la auditoría del
técnico no lleva `episodio_id`: si la hay, se borra y se anota.

**Documentación**. El párrafo «La cita y su episodio» de `architecture.md` se corrige así:
- Fuera: «El técnico no elige ni ve el episodio (no está en `citas_agenda` ni en
  `agenda_citas_rango`) pero sí ve y cambia la modalidad».
- Dentro: «El técnico no elige el episodio y no lo recibe por ninguna ruta de agenda
  (`citas_agenda`, `agenda_citas_rango`, las funciones de alta); sí ve y cambia la modalidad.
  **Residuo H25**: sus filas de `auditoria` copian la cita entera menos `nota_operativa`, así
  que cada cambio que hace (`agenda_actualizar_cita`, incluso sin cambios, o un ida y vuelta de
  `agenda_cambiar_asistencia`) le deja leer `tipo_terapia_id` y `episodio_id`. Con el mismo
  `episodio_id` en las citas de dos pacientes deduce que van juntos. Lo cierra el ticket de
  auditoría alineada con la matriz, antes de producción».
- En el mismo párrafo entran también, como pedía §1.16 y no se escribió:
  - «Residuo de fechas: reprogramar una cita fuera de la ventana de su episodio, cerrar un
    episodio con citas posteriores o dar de baja a un participante con citas posteriores no se
    vuelve a comprobar (D6); lo cierra T-034 SQL-H2».
  - «La regla nota-cita solo cubre la nota del profesional de la cita sobre el paciente de la
    cita (P1); la nota propia del coterapeuta cuelga de su episodio».
  - El residuo de la resolución automática (R2.2): «La resolución automática responde también al
    administrador: si una cita nueva nace con episodio, y con cuál, dice algo de la
    participación. Cuesta una cita real y auditada (P4)».

**Texto propuesto para `docs/state.md`** (lo escribe el orquestador, no esta adenda). La línea de
H25 pasa a: «**H25**: el técnico lee en su auditoría `tipo_terapia_id` y, desde T-039,
`episodio_id` de las citas de sus centros (`agenda_actualizar_cita` sin cambios; ida y vuelta de
`agenda_cambiar_asistencia`). Deduce parejas. Bloquea producción».

### R2.4 · B-H2 · La cita futura en un episodio que se cierra

**Veredicto**: se sigue el aplazamiento del contrato. «Lo que no entra» dice: «Cerrar un episodio
con citas futuras, y reabrirlo (T-034 SQL-H2). Va en el ticket que cierre episodios». Tiene
dueño, así que no hace falta preguntar al propietario. Las tres salidas que propone el orquestador
caen fuera de T-039:

| Opción | Por qué no aquí |
|---|---|
| Prohibir cerrar un episodio con citas no canceladas posteriores al cierre | Es una regla nueva sobre `episodios_asistenciales.cerrado_en`, el campo que gobierna T-034 SQL-H2. Si entra aquí, SQL-H2 hereda una regla que no diseñó. **Es la que recomiendo a SQL-H2.** |
| Desasignar las citas futuras al cerrar | Choca con P3 («el profesional no pone una cita sin episodio») y con §1.9: el sistema haría lo que al profesional se le prohíbe, y la nota de esa cita perdería su ancla. |
| Dejar que `episodio_para_nota` acepte un episodio cerrado para la nota de su cita | Contradice el paso 5b recién diseñado (22023 a propósito) y la regla de T-034 de que no se escribe en un episodio cerrado. |

Lo que sí entra aquí es **lo que avisa** de que la única salida actual (reabrir) es justo lo que
SQL-H2 piensa prohibir.

**Migración**: ningún cambio.

**Banco 23**. Sección nueva **Z · Cable trampa de B-H2 (T-034 SQL-H2)**, al final, después de J.

Datos, como `postgres`:
- un paciente nuevo `T39` (`d0390001-…-0009`) de PRO1 en CA;
- un episodio `ET39` (`e0390001-…-0009`) suyo, abierto hace 60 días;
- una cita **pasada** `c_z` con `sql_ins39(:T39, :PRO1, -2, '10:00', :ET39)`. V4 la deja pasar
  porque el episodio está abierto;
- después, `update episodios_asistenciales set cerrado_en = current_date - 5 where id = ET39`.
  D6 no vuelve a comprobar, y esto reproduce el escenario de la revisión.

| Id | Quién | Qué | Espera |
|---|---|---|---|
| 23.Z1 | PRO1 con PIN | `episodio_para_nota(:T39, null, c_z)` | 22023, fragmento `de la cita está cerrado` |
| 23.Z2 | PRO1 con PIN | `update episodios_asistenciales set cerrado_en = null where id = ET39` | entra (R8) |
| 23.Z3 | PRO1 con PIN | `episodio_para_nota(:T39, null, c_z)` | devuelve ET39 |

El mensaje de Z2 y Z3 lo dice tal cual: «B-H2 / T-034 SQL-H2: reabrir es hoy la única salida de
la nota de una cita cuyo episodio se cerró después de darla; antes de prohibir reabrir, dar otra
salida o prohibir el cierre con citas posteriores». Así, el ticket que prohíba reabrir rompe este
banco y no puede dejar la nota sin salida sin darse cuenta.

**Ajuste de fragmento** (regla «Mensajes de error con fragmento único»): `23.X5` pasa de
`'está cerrado'` a `'indicado está cerrado'`. Si no, casa también con el 22023 del paso 5b (R7).

**Documentación**. En `architecture.md`, en el residuo de fechas de R2.3, se añade: «Si se cierra
un episodio con una cita posterior, la nota de esa cita solo entra reabriéndolo».

**Texto propuesto para `docs/state.md`** (lo escribe el orquestador). La línea de SQL-H2 pasa a:
«**T-034 SQL-H2**: reabrir esquiva D6, reloj; y reabrir es hoy la única salida de la nota de una
cita cuyo episodio se cerró (T-039 B-H2, banco 23.Z). Recomendación: no cerrar con citas no
canceladas posteriores al cierre».

### R2.5 · B-H3 · La siembra pasa por las funciones de alta

**Migración**: ninguna. **Siembra** (`supabase/seed-completo.sql`): se sustituye el bloque 8.ter
(`:553-578`) por el procedimiento de §1.15, que sigue vigente, con estas precisiones:

1. No hace falta `aal2`, porque `rol_actual()` no lo mira (R9). Los claims son
   `json_build_object('sub', <id>, 'role', 'authenticated')::text`, con `set_config(..., true)`,
   locales a la transacción del bloque DO.
2. **Ana** llama a `agenda_crear_cita(k_p_sofia, k_ana, k_c_madrid,
   'e0280001-0000-4000-8000-000000000002', v_martes, time '16:00', p_episodio_id =>
   k_epi_pareja)`.
   - Se conserva la hora de la siembra actual. La duración la toma la función del tipo (90).
   - Guarda: `if not exists (select 1 from public.citas where paciente_id = k_p_sofia and
     episodio_id = k_epi_pareja and inicio > now())`.
3. **El técnico** (`k_tec`) llama a `agenda_crear_cita(k_p_carmen, k_ana, k_c_madrid,
   'e0280001-0000-4000-8000-000000000001', v_martes, time '10:00', p_modalidad_asistencia =>
   'online')`, sin `p_episodio_id`.
   - Guarda: `if not exists (select 1 from public.citas where paciente_id = k_p_carmen and
     modalidad_asistencia = 'online' and inicio > now())`.
   - Si la función lo rechaza por centro (`centros_actuales()`), llama Ana y se anota en la
     bitácora. Lo que no se hace es volver al `insert`.
4. Al final se vacían los claims (`set_config('request.jwt.claims', '', true)`).
5. Desaparecen los uuids fijos `e0390001-…-0001/-0002` de la siembra. La idempotencia la dan las
   guardas.

**Evidencia** (amplía el criterio 23). Tras `db reset && seed` se ejecuta, como `postgres`:

```sql
select c.creada_por = '<k_tec>' and c.episodio_id = '<k_epi_carmen>'
  from citas c where c.paciente_id = '<k_p_carmen>' and c.modalidad_asistencia = 'online' and c.inicio > now();
```

Tiene que dar `true`: demuestra que la resolución automática corrió con el técnico de llamante.
Para Sofía, `creada_por = k_ana` y `episodio_id = k_epi_pareja`. Un segundo `npm run seed` no
añade filas: el conteo de las dos consultas se mantiene.

### R2.6 · B-H4 · El orden de la línea

`docs/interfaz.md:425-426` pasa a decir: «la línea es `tipo · profesional · modalidad`». El resto de
la frase no cambia. Manda C14 del contrato, que coincide con el prototipo. Sin cambios de código
ni de banco.

### R2.7 · Territorio

**No hay que ampliarlo.** Todo cae dentro de lo que el contrato ya declara:
- la migración `supabase/migrations/20261007120000_cita_en_episodio_y_asistencia.sql`;
- `supabase/seed-completo.sql`;
- `scripts/rls/23-cita-en-episodio.sql`;
- `docs/architecture.md`;
- `docs/interfaz.md` §14.

El banco 16 no se toca, salvo que H5 o H1b destapen una fijación incoherente; está en el
territorio condicional.

`docs/state.md` no se toca desde el ticket: los dos textos propuestos (R2.3 y R2.4) los escribe el
orquestador al cerrar.

### R2.8 · Qué revisar en la ronda 3

1. **Igualdad de cadenas, no solo de códigos**. En D4, D5 y H2 a H5, el banco compara
   `sqlerrm39(...)` entre los casos «participante», «ajeno» y «de baja». Si solo compara SQLSTATE,
   el hallazgo no está cerrado.
2. **El paso 0 va antes del paso 2.** Un `UPDATE` de `postgres` que vacía `episodio_id` y cambia
   `paciente_id` en la misma sentencia tiene que dar el 23514 del paso 0. Si el paso 0 quedó
   después del paso 2, pasa.
3. **El paso 0 no mira nada más.** Nada de `cita_episodio_coherente`, de participantes ni de
   fechas antes del `raise`. La condición son solo `old.episodio_id`, `paciente_id` y
   `profesional_id`.
4. **`serie_id` falta en las dos listas del grant** (`insert` y `update`), y las otras 18
   columnas siguen. 23.A6 lo comprueba con `has_column_privilege`.
5. **La comprobación de la serie va antes de `cita_episodio_coherente`**, y lanza con la serie
   encontrada. Que la herencia «no lanza» (D5) solo sigue valiendo para filas coherentes.
6. **Ninguna puerta legítima tropieza.** Los bancos 16, 17 y 21 enteros en verde y M3/M4 sin
   tocar.
7. **23.C6 reescrita, no borrada**, y 23.C6b cubre V2 por `UPDATE` de `episodio_id`.
8. **La siembra no tiene ningún `insert into public.citas` de T-039.** `grep -n "e0390001"
   supabase/seed-completo.sql` da 0 líneas, y la consulta de R2.5 da `true`.
9. **El párrafo de `architecture.md` ya no dice «no ve el episodio»** y nombra H25, el residuo de
   fechas con la salida de reabrir, P1 y el residuo de la resolución (P4).
10. **23.Z existe y su mensaje cita B-H2 y SQL-H2**, y 23.X5 usa `indicado está cerrado`.
11. **Ninguna aserción consagra la fuga de H25** (que el técnico lea `episodio_id` en su
    auditoría).

### R2.9 · Lo que no entra en esta ronda, y por qué

- **Retirar `paciente_id` y `profesional_id` del `grant update`.** El paso 0 cierra A-H1 para
  cualquier llamante. Quitar la reasignación de citas sin episodio al administrador es una
  decisión de producto ajena al hallazgo.
- **Corregir H25** (la política de `auditoria` o los cortes de `fn_auditar`). Es el ticket de
  auditoría alineada con la matriz, con otra tabla y otra política.
- **Prohibir cerrar con citas posteriores, o prohibir reabrir.** Es T-034 SQL-H2. Aquí solo va el
  cable trampa 23.Z.
- **Cerrar el residuo de la resolución automática para el administrador.** Depende de P4. Si el
  propietario elige B, es una línea en `agenda_crear_cita` y una aserción, dentro del territorio
  actual.

### R2.10 · Pregunta al propietario

**P4 · ¿La resolución automática del episodio también cuando cita el administrador?**

Contexto:
- Hoy, al dar una cita sin elegir episodio, el programa le pone el único episodio abierto del
  profesional con ese paciente, lo pida quien lo pida (así lo dice el ticket).
- El administrador ve ese episodio como un código opaco.
- Si da una cita a Hugo con Ana y nace con el mismo código que las de Sofía, deduce que Hugo y
  Sofía van juntos a terapia.
- Para saberlo tiene que crear una cita real, que queda auditada, que no se puede borrar y que Ana
  ve en su agenda.

- **A (recomendada)**: se acepta así y se deja escrito en la arquitectura como residuo conocido.
  Probarlo cuesta una cita visible y registrada, y el administrador ya es de confianza.
- **B**: cuando cita el administrador, la cita nace sin episodio, y la asigna después el
  profesional.
  - Cierra la pista.
  - A cambio, las citas que da el administrador en nombre del profesional llegan sin episodio, y
    el profesional tiene que corregirlas una a una.

## Decisiones tras la adenda ronda 2 (03-10-2026)

- **P4 · el propietario elige A.** La resolución automática del episodio vale también cuando cita el
  administrador. Queda escrito en `docs/architecture.md` como riesgo conocido: una cita real, auditada
  y que el profesional ve en su agenda.
- **Criterio 2, del orquestador.** El verificador midió que, sin la migración, el primer fallo es
  `21-alta-de-cita.sql` aserción A (`type "public.modalidad_asistencia" does not exist`) y no 23.A1.
  El banco 21 no debe fijar la firma que cambia T-039: su aserción A localiza `agenda_crear_serie` y
  `agenda_crear_cita` por nombre en `pg_proc`, sin firma literal, y comprueba el privilegio sobre ese
  oid. Así, sin la migración, el primer fallo vuelve a ser 23.A1.
- **Sección R del banco 23, del orquestador.** No reactiva sin condición `exigir_nota_en_episodio_de_su_cita`.
  Guarda el estado previo (`pg_trigger.tgenabled`) y restaura ese, para que un mutante `disable` no
  se deshaga antes de 23.Y1.
