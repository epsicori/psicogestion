# T-034 · Diseño — Toda nota clínica cuelga de un episodio asistencial

Arquitecto · 29-09-2026 · Contrato: `tickets/T-034-toda-nota-en-un-episodio.md` · ADR-071 (puntos
1-3), ADR-030, ADR-031. D2 y D3 las cerró el propietario: aquí solo se concretan. D1 y D4 quedan
cerradas en este documento.

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | `notas_clinicas.episodio_id uuid references episodios_asistenciales(id)`, nulable, sin `comment on column`. | `supabase/migrations/20260822094547_esquema_base_organizacion_paciente_historia.sql:621` |
| H2 | `episodios_asistenciales`: `paciente_id` (titular), `profesional_id` **not null**, `centro_id` **nulable**, `modalidad_relacional` por defecto `'individual'`, `abierto_en date default current_date`, `cerrado_en` nulable (abierto = `cerrado_en is null`). | `…094547…sql:517-529` |
| H3 | `episodio_participantes(episodio_id, paciente_id, papel, alta_en, baja_en)`; índice único parcial `(episodio_id, paciente_id) where baja_en is null`. Sin `grant delete` para `authenticated`. | `…094547…sql:541-553`, `:1558` |
| H4 | **`es_profesional_del_episodio(e)` NO mira `episodios_asistenciales.profesional_id`**: es cierta si el llamante es `pacientes.profesional_id` de algún participante (incluidos los dados de baja) y está activo. Un episodio **sin filas de participantes** la da falsa incluso para su dueño. | `supabase/migrations/20260822160000_rls_funciones_y_politicas.sql:125-145` |
| H5 | `episodios_alta` exige candado + `profesional_id = auth.uid()` + `es_profesional_asignado(paciente_id)`. `episodios_modificacion` deja cambiar **cualquier columna**, incluidas `paciente_id` y `profesional_id`, a quien atiende al paciente o es el dueño. | `…160000…sql:1018-1047` |
| H6 | `episodio_participantes_alta` exige `es_profesional_del_episodio(episodio_id)`: la **primera** fila de participante de un episodio nuevo no la puede insertar un llamante *invoker* (huevo y gallina). `…_modificacion` deja cambiar `paciente_id` y `episodio_id`. | `…160000…sql:1056-1072` |
| H7 | `notas_clinicas_alta`: candado + `autor_id = auth.uid()` + `es_profesional_asignado(paciente_id)`. `…_modificacion`: candado + `autor_id = auth.uid()` (deja cambiar `episodio_id` y `paciente_id` antes de la primera firma). `grant insert, update` a `authenticated`. | `…160000…sql:1132-1149`, `…094547…sql:1564` |
| H8 | **Nada impone hoy que la nota y su episodio sean del mismo paciente**, ni que el episodio sea del autor. Solo existe `fn_exigir_episodio_en_nota_conjunta()` (versión `conjunta` ⇒ cabecera con episodio). | `…094547…sql:1302-1318`, `:1426-1430` |
| H9 | `congelar_cabecera_sellada` (before update of `paciente_id, fecha_sesion, autor_id, episodio_id, cita_id`) lanza 42501 si ya hay versión. Tras T-034 sigue igual. | `supabase/migrations/20260906120000_agenda_esquema.sql:405-434` |
| H10 | Disparadores de `notas_clinicas` existentes: `congelar_cabecera_sellada`, `tocar_borrador`, `auditar_notas_clinicas` (after). Los `before` de la misma tabla disparan **por orden alfabético de nombre**. | `…094547…sql:1399-1424`, `20260829150000_auditoria_y_solo_adicion.sql:285-367` |
| H11 | **La apertura de un episodio ya queda auditada**: el bucle de T-004 colgó `auditar_episodios_asistenciales` (`after insert or update or delete`, `fn_auditar('id','motivo_consulta')`) con `actor_id = auth.uid()`. | `20260829150000_auditoria_y_solo_adicion.sql:285-367` (recorte en `:311`) |
| H12 | **D3 · El centro activo NO se puede leer en SQL.** Vive en la cookie `centro_activo` (httpOnly), la escribe `elegirCentro()` tras validar pertenencia, y el armazón cae a `centros[0]` si la cookie no vale. `centro_actual()` devuelve el centro **principal** vigente (`perfiles_centros.principal`), no el elegido en la sesión. | `components/armazon/centro.ts:10`, `app/(app)/acciones.ts:33` (`elegirCentro`), `components/armazon/armazon.tsx:117-128`, `20260829120000_perfiles_centros_multicentro.sql:254-268` |
| H13 | `centros_actuales()` devuelve los centros vigentes (`hasta is null`) del perfil activo **sin filtro de rol** (el profesional también los tiene). `architecture.md:250-253` dice «vacío para administrador y profesional»: el texto está desfasado respecto al código (se anota, no se arregla aquí). Una sola definición. | `supabase/migrations/20260829120000_perfiles_centros_multicentro.sql:208-221` |
| H14 | `citas.centro_id` es nulable; `citas_lectura` deja leer al administrador todas y al profesional las suyas. | `20260906120000_agenda_esquema.sql:184`, `:691-699` |
| H15 | El sobre de la era 3 **no contiene `episodio_id`**: poner episodio a las notas de la siembra y del banco no cambia ninguna huella ni ningún vector congelado. | `scripts/rls/00-ayudantes.sql:180-209` |
| H16 | Comentario hoy falso tras T-034: «ni el episodio (episodio_id es nulable)». Es la única definición de ese comentario. | `supabase/migrations/20260829210000_cadena_de_huellas.sql:80-86` |
| H17 | `lint:migraciones` regla 2: `alter column … set not null` sin `default` exige que la **línea no vacía anterior** empiece por `-- destructivo:`. | `scripts/lint-migraciones.ts:179`, `:236-259` |
| H18 | Convención de permisos de función: `revoke … from public, anon` + `grant … to authenticated`; funciones de disparador `revoke … from public` (o `public, anon, authenticated`). Precedente de función *invoker* para que las políticas muerdan: `alta_paciente()`. | `20260916120000_alta_de_paciente_completa.sql:269`, `:336-343`; `20260925120000_editar_serie_desde_la_cita.sql:69-260` |
| H19 | CI corre `seed` → `test:rls` → `verificar:huellas` → `test:huellas`; el banco corre **sobre base sembrada**. `scripts/t001-esquema.sql` y `scripts/t002-rls.sql` no los corre nadie. | `.github/workflows/ci.yml:103-115` |
| H20 | Perfiles del banco: el disparador de alta crea `perfiles_centros` principal con el centro de los metadatos (PRO1→CA, PRO2→CB, PROBAJA→CA). PIN de PRO1 = `111111`, PRO2 = `222222` (`01-fijacion.sql:200-201`); `03-candado` devuelve el contador de PRO1 al acabar. | `…multicentro.sql:186-196`, `scripts/rls/01-fijacion.sql:200-201`, `scripts/rls/03-candado.sql:127-129` |
| H21 | No hay código TypeScript que inserte en `notas_clinicas` (solo `tipos-bd.ts`): volver `episodio_id` obligatorio en `Insert` no rompe el build. | `grep notas_clinicas app lib components` |

### 0.1 · Notas que hoy se crean sin episodio (lista cerrada)

| Fichero:línea | Nota(s) | Paciente / autor | Episodio que recibe (§1.6) |
|---|---|---|---|
| `scripts/rls/01-fijacion.sql:140` | `NCORR` | P2 / PRO2 | **nuevo** `EPI2` (P2, PRO2, CB, individual). No vale `EPI`: es de PRO1 (D2). |
| `scripts/rls/04-baja.sql:20-21` | `f0030001-…-000000000004` | PBAJA / PROBAJA | **nuevo** `EPIBAJA` (PBAJA, PROBAJA, CA), insertado en el propio 04. |
| `scripts/rls/14-cadena-huellas.sql:59-73` | `NCADX, NCADA, NCADB, NCADC` | PCAD / PRO1 | **nuevo** `EPICAD` |
| `…14…:59-73` | `NDEMO` | PDEMO / PRO1 | **nuevo** `EPIDEMO` |
| `…14…:59-73` | `NVEC` | PVEC / ANA | **nuevo** `EPIVEC` |
| `…14…:59-73` | `NCOT` | PCOT / PRO1 | **nuevo** `EPICOT` |
| `scripts/t005-concurrencia.sql:43-45` | `NOTA1, NOTA2` | `pconc_id` / ANA | **nuevo** `EPICONC` |
| `supabase/seed-completo.sql:341-347` | `k_n_borrador` | Carmen / Ana | **nuevo** `k_epi_carmen` |
| `supabase/seed-completo.sql:349-355` | `k_n_firmada`, `k_n_corregida` | Carmen / Ana | `k_epi_carmen` |
| `…seed-completo.sql:354` | `k_n_de_baja` | Iván / `k_baja` | **nuevo** `k_epi_ivan` |

Ya tienen episodio y siguen igual: `01-fijacion.sql:115-117` (`NCONJ`, `NIND` en `EPI`, autor PRO1 = dueño), `seed-completo.sql:353` (`k_n_conjunta` en `k_epi_pareja`, autor Ana = dueña).

**Ningún escenario del banco depende de una nota sin episodio**: todos crean la nota como soporte
de otra cosa (cadena, baja, cotejo). No hay nada que escalar por esa vía.

Fuera de territorio y de CI (H19), y **se rompen** con la columna obligatoria:
`scripts/t001-esquema.sql:433, 466, 481, 866, 880, 902, 920, 941, 982` y
`scripts/t002-rls.sql:117`. Se anotan en `docs/state.md` §Hallazgos al cerrar (ver «Lo que no entra»).

---

## 1 · Piezas y contratos

### 1.1 · Migración `supabase/migrations/20260929120000_nota_siempre_en_episodio.sql`

Sello mayor que el último (`20260925120000`). Si al integrar ya existe otro con sello mayor, se
renombra hacia delante; nunca se edita una migración ya aplicada. Orden **obligatorio** de
bloques:

**Bloque 0 · Guarda (primera sentencia del fichero, antes de cualquier otra).**

```sql
do $$
declare v_n bigint;
begin
  select count(*) into v_n from public.notas_clinicas where episodio_id is null;
  if v_n > 0 then
    raise exception
      'T-034: hay % notas clínicas sin episodio. Una persona decide a qué episodio va cada una (ADR-071); esta migración no las rellena.',
      v_n
      using errcode = '55000';
  end if;
end $$;
```

Errcode `55000` (object_not_in_prerequisite_state), fragmento contractual: **`notas clínicas sin episodio`**.

**Bloque 1 · La columna obligatoria.**

```sql
-- destructivo: episodio_id pasa a obligatorio (ADR-071); la guarda de arriba aborta si hay filas nulas, sin rellenar nada.
alter table public.notas_clinicas alter column episodio_id set not null;
```

La línea `-- destructivo:` va **inmediatamente** encima, sin línea en blanco (H17).

**Bloque 2 · D4 · Coherencia nota–episodio (disparador en `notas_clinicas`).**

```sql
create function public.fn_exigir_episodio_coherente_en_nota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$ … $$;
```

Cuerpo, en este orden exacto:

1. `if new.episodio_id is null then return new; end if;` — deja hablar al `NOT NULL` (23502). Si el
   disparador lanzara aquí, el criterio 2 recibiría otro código.
2. `if (select auth.uid()) is not null and new.autor_id is distinct from (select auth.uid()) then return new; end if;`
   — una sesión de cliente que escribe como otro autor la rechaza la RLS (42501) **después**; el
   disparador no le da un oráculo sobre episodios ajenos (los `before` corren antes que el
   `with check`). Sin sesión (migración, siembra, `postgres`) se comprueba todo.
3. Leer `e.paciente_id, e.profesional_id` de `episodios_asistenciales where id = new.episodio_id`.
   Si no existe → `return new` (la clave ajena da 23503 después).
4. **D2 en la base**: `if new.autor_id is distinct from e.profesional_id` → `raise exception 'La nota va en un episodio de su autor: un episodio de otro profesional no se reutiliza (ADR-071, T-034)' using errcode = '23514'`. Fragmento: **`episodio de otro profesional`**.
5. **Mismo paciente**: si `new.paciente_id <> e.paciente_id` **y** no existe fila en
   `episodio_participantes` con `(episodio_id, paciente_id) = (new.episodio_id, new.paciente_id)`
   (cualquiera, activa o dada de baja) → `raise exception 'La nota y su episodio no son del mismo paciente ni de un participante (ADR-071, ADR-030)' using errcode = '23514'`. Fragmento: **`no son del mismo paciente`**.
6. `return new`.

```sql
create trigger exigir_episodio_coherente_en_nota
  before insert or update of paciente_id, episodio_id, autor_id on public.notas_clinicas
  for each row
  execute function public.fn_exigir_episodio_coherente_en_nota();
```

El nombre empieza por `e`: dispara **después** de `congelar_cabecera_sellada` (`c`) y antes de
`tocar_borrador` (`t`). Así, reatribuir una nota firmada sigue dando 42501 de H9 y no un 23514 nuevo.

**Bloque 3 · D4 · Las otras dos puertas (episodio y participante).**

```sql
create function public.fn_congelar_episodio_con_notas()  -- security definer, search_path = ''
-- si exists (select 1 from public.notas_clinicas n where n.episodio_id = old.id)
--   raise exception 'El episodio % tiene notas: su paciente y su profesional no cambian (ADR-071, T-034)' using errcode = '42501';
-- return new;

create trigger congelar_episodio_con_notas
  before update of paciente_id, profesional_id on public.episodios_asistenciales
  for each row
  when (new.paciente_id is distinct from old.paciente_id
        or new.profesional_id is distinct from old.profesional_id)
  execute function public.fn_congelar_episodio_con_notas();

create function public.fn_congelar_participante_con_notas()  -- security definer, search_path = ''
-- if TG_OP = 'UPDATE' and new.episodio_id = old.episodio_id and new.paciente_id = old.paciente_id then return new;
-- si exists (select 1 from public.notas_clinicas n
--            where n.episodio_id = old.episodio_id and n.paciente_id = old.paciente_id)
--   raise exception 'El participante tiene notas en este episodio: no se mueve ni se borra (ADR-071, ADR-030)' using errcode = '42501';
-- if TG_OP = 'DELETE' then return old; end if; return new;

create trigger congelar_participante_con_notas
  before update of episodio_id, paciente_id or delete on public.episodio_participantes
  for each row
  execute function public.fn_congelar_participante_con_notas();
```

Fragmentos: **`tiene notas: su paciente y su profesional no cambian`** y **`El participante tiene notas`**.
Sin `when` en el de participantes: un disparador de `update or delete` no puede nombrar `new` en el `when`.

**Bloque 4 · D1 · La función.**

```sql
create function public.episodio_para_nota(
  p_paciente_id uuid,
  p_episodio_id uuid default null,
  p_cita_id     uuid default null,
  p_centro_id   uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$ … $$;
```

Cuerpo, en este orden exacto (cada guarda antes de la siguiente; ninguna revela datos que el
llamante no pueda leer ya):

1. `v_uid := (select auth.uid())`; nulo → `42501` «No hay sesión.»
2. `v_rol := (select public.rol_actual())`; nulo → `42501` «Perfil no activo.»;
   `= 'tecnico_administrativo'` → `42501` **«El técnico administrativo no abre ni elige episodios clínicos (ADR-071).»** (rol **antes** del candado, regla de `.claude/rules/supabase.md`).
3. `p_paciente_id is null` → `22023` «Falta el paciente.»
4. `not (select public.historia_desbloqueada())` → `42501` «La historia está bloqueada: desbloquéala con el PIN.»
5. `not public.es_profesional_asignado(p_paciente_id)` → `42501` «No atiendes a este paciente.»
6. **Con elección explícita** (`p_episodio_id is not null`):
   - `select … from public.episodios_asistenciales e where e.id = p_episodio_id and e.profesional_id = v_uid and (e.paciente_id = p_paciente_id or exists (select 1 from public.episodio_participantes ep where ep.episodio_id = e.id and ep.paciente_id = p_paciente_id))`.
   - Sin fila → `42501` **«El episodio elegido no vale para esta nota.»** — el mismo mensaje para
     inexistente, invisible, de otro paciente y de otro profesional (no distingue: no filtra).
   - Con fila y `cerrado_en is not null` → `22023` **«El episodio elegido está cerrado.»**
   - `return p_episodio_id`. **No** lee ni valida `p_cita_id` ni `p_centro_id`.
7. **Sin elección**: `perform pg_advisory_xact_lock(hashtextextended('episodio_para_nota:' || v_uid::text || ':' || p_paciente_id::text, 0));`
   y después, en una sentencia nueva (instantánea nueva en READ COMMITTED):
   `select count(*), (array_agg(e.id))[1] into v_n, v_id from public.episodios_asistenciales e where e.profesional_id = v_uid and e.cerrado_en is null and (e.paciente_id = p_paciente_id or exists (select 1 from public.episodio_participantes ep where ep.episodio_id = e.id and ep.paciente_id = p_paciente_id and ep.baja_en is null))`.
   (No hay `min(uuid)`: contar y leer, `.claude/rules/supabase.md`.)
   - `v_n = 1` → `return v_id`.
   - `v_n > 1` → `raise exception 'Hay % episodios abiertos con este paciente: elige episodio (ADR-071).', v_n using errcode = 'EP001';` — errcode **`EP001`**, fragmento **`elige episodio`**.
   - `v_n = 0` → paso 8.
8. **Abrir** (única rama que usa cita y centro):
   - Si `p_cita_id is not null`: `select c.centro_id into v_centro from public.citas c where c.id = p_cita_id and c.paciente_id = p_paciente_id and c.profesional_id = v_uid`; sin fila → `42501` **«La cita no es de este paciente con este profesional.»**
   - Si `v_centro is null`: `v_centro := p_centro_id`; si `p_centro_id is not null and p_centro_id not in (select public.centros_actuales())` → `42501` **«El centro no es uno de los tuyos.»**
   - Si `v_centro is null` → `22023` **«Falta el centro del episodio.»**
   - `insert into public.episodios_asistenciales (paciente_id, profesional_id, centro_id, modalidad_relacional, abierto_en) values (p_paciente_id, v_uid, v_centro, 'individual', (now() at time zone public.zona_horaria_centro(v_centro))::date) returning id into v_id;`
   - `return v_id`.
   - **Sin fila en `episodio_participantes`** (H6: un *invoker* no puede insertarla, y el individual no la necesita).
   - **Auditoría**: ninguna escritura propia. La deja `auditar_episodios_asistenciales` (H11): una fila `tabla = 'episodios_asistenciales', operacion = 'INSERT', registro_id = <id>, actor_id = <llamante>`.

**Bloque 5 · Permisos.**

```sql
revoke execute on function public.episodio_para_nota(uuid, uuid, uuid, uuid) from public, anon;
grant  execute on function public.episodio_para_nota(uuid, uuid, uuid, uuid) to authenticated;
revoke execute on function public.fn_exigir_episodio_coherente_en_nota() from public, anon, authenticated;
revoke execute on function public.fn_congelar_episodio_con_notas()        from public, anon, authenticated;
revoke execute on function public.fn_congelar_participante_con_notas()    from public, anon, authenticated;
```

**Bloque 6 · `comment on`.**

- `comment on column public.notas_clinicas.episodio_id` — obligatorio desde T-034 (ADR-071): toda
  nota cuelga de un episodio del **autor**, del mismo paciente o de un participante (ADR-030), y
  lo impone `exigir_episodio_coherente_en_nota`; la aplicación lo obtiene con `episodio_para_nota()`.
- `comment on function public.episodio_para_nota(uuid, uuid, uuid, uuid)` — la regla «abrir o
  elegir», los códigos (`EP001` varios; `42501`; `22023`), invoker a propósito, auditoría vía
  `auditar_episodios_asistenciales`.
- `comment on function` de las tres funciones de disparador.
- `comment on column public.notas_clinicas_versiones.paciente_id` — **se reemite** con el mismo
  texto de H16 salvo el cierre: «…ni el episodio (un paciente cruza varios episodios y la cadena es
  su historia entera).» en lugar de «(episodio_id es nulable)».

No se tocan políticas ni `fn_exigir_episodio_en_nota_conjunta()` (queda redundante, no dañina).

### 1.2 · `lib/supabase/tipos-bd.ts`

Regenerado con `npx supabase db reset && npm run tipos`; **nunca a mano**. Cambios esperados:
`notas_clinicas.Row.episodio_id: string`, `Insert.episodio_id: string` (obligatorio),
`Update.episodio_id?: string`, y `Functions.episodio_para_nota` con
`Args: { p_paciente_id: string; p_episodio_id?: string; p_cita_id?: string; p_centro_id?: string }`,
`Returns: string`.

### 1.3 · `supabase/seed-completo.sql`

- Constantes nuevas: `k_epi_carmen constant uuid := 'e0080001-0000-4000-8000-000000000002'`,
  `k_epi_ivan constant uuid := 'e0080001-0000-4000-8000-000000000003'`.
- En la sección 6 (tras `k_epi_pareja`), dos `insert into public.episodios_asistenciales … on conflict (id) do nothing`:
  - `(k_epi_carmen, k_p_carmen, k_ana, k_c_madrid, 'individual', null, (k_fecha_base - interval '30 days')::date, k_fecha_base)`
  - `(k_epi_ivan, k_p_ivan, k_baja, k_c_canarias, 'individual', null, (k_fecha_base - interval '45 days')::date, k_fecha_base)`
  - `abierto_en` anterior a todas las `fecha_sesion` de sus notas (-16 y -30 días).
- En la sección 7: `null` → `k_epi_carmen` en `k_n_borrador`, `k_n_firmada`, `k_n_corregida`; `null` → `k_epi_ivan` en `k_n_de_baja`.
- Sin participantes para estos dos (individuales). Idempotente por `on conflict (id)`.

### 1.4 · Banco: `01-fijacion.sql`, `04-baja.sql`, `14-cadena-huellas.sql`

- **01**: `\set EPI2 '\'e0030001-0000-4000-8000-000000000002\''` junto a `EPI`; antes de la línea
  140, `insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id) values (:EPI2, :P2, :PRO2, :CB);`
  y la nota pasa a `(id, paciente_id, episodio_id, autor_id) values (:NCORR, :P2, :EPI2, :PRO2)`.
- **04**: justo después de `\echo '=== 04-baja ==='` y **antes** de `dar_segundo_factor` (como
  `postgres`): `insert into public.episodios_asistenciales (id, paciente_id, profesional_id, centro_id) values ('e0030001-0000-4000-8000-000000000003', :PBAJA, :PROBAJA, :CA);`
  y la nota lleva ese `episodio_id`. No se toca ninguna aserción.
- **14**: cuatro `\set` (`EPICAD e0050001-…-000000000001`, `EPIDEMO …-000000000009`,
  `EPIVEC …-000000000008`, `EPICOT e012b001-0000-4000-8000-000000000001`), un `insert` de los
  cuatro episodios (autor de la nota = `profesional_id`: PRO1, PRO1, ANA, PRO1; `centro_id` CA)
  **entre** el `insert` de pacientes y el de notas, y las siete notas con su `episodio_id`.
- **00-ayudantes.sql**: sin cambios (los ayudantes `assert_lanza_codigo_msg` ya bastan). Está en
  el territorio por si el implementador necesita un ayudante; si lo añade, lo justifica en la bitácora.

### 1.5 · `scripts/t005-concurrencia.sql`

`\set EPICONC '\'e0050003-0000-4000-8000-000000000001\''`; tras el `\gset` de `pconc_id`:
`insert into public.episodios_asistenciales (id, paciente_id, profesional_id) values (:EPICONC, :'pconc_id', :ANA);`
y las dos notas con `episodio_id = :EPICONC`. (Confirma filas, igual que hoy: no idempotente.)

### 1.6 · Módulo nuevo `scripts/rls/19-nota-en-episodio.sql`

Corre el último (hereda estado de 01-17). Crea **sus propios** pacientes y episodios para no
depender de lo que otros módulos dejaron. Prefijos de UUID por tipo, patrón del README:

| Var | UUID | Qué |
|---|---|---|
| `CC` | `c0340001-0000-4000-8000-00000000000c` | centro nuevo; PRO1 lo recibe en `perfiles_centros` (no principal) |
| `CD` | `c0340001-0000-4000-8000-00000000000d` | centro nuevo **sin** pertenencia de nadie |
| `PA` `PB` `PS` `PJ1` `PJ2` `PJ4` `PJ5` `PD` | `d0340001-…-000000000001…008` | pacientes de PRO1, centro CA |
| `PC` | `d0340001-…-000000000009` | paciente de PRO2, centro CB |
| `EA0` | `e0340001-…-000000000001` | PA, PRO1, **cerrado** (`abierto_en` −40 d, `cerrado_en` −10 d) |
| `EB1` `EB2` | `…002`, `…003` | PB, PRO1, abiertos los dos |
| `ES` | `…004` | PS, **PRO2** (episodio de un compañero sobre un paciente de PRO1), abierto |
| `EJ` | `…005` | PRO1, titular PJ1, `pareja`; participantes PJ1, PJ2 activos y PJ5 con `baja_en` = hoy−1 (`alta_en` hoy−30) |
| `EJX` | `…006` | **PRO2**, titular PC, `pareja`; participantes PC y **PJ4** (paciente de PRO1) |
| `EC` | `…007` | PC, PRO2, abierto |
| `CITA` | `a0340001-…-000000000001` | cita de PD con PRO1 en **CA**, fuera de cualquier otro rango (p. ej. `2030-01-07 10:00+01`) |

Todo lo anterior como `postgres`, antes del primer `como`. `CC` y `CD` se insertan con las mismas
columnas que `01-fijacion.sql` usa para `CA` (incluida la zona horaria, que 19.2 necesita); la
pertenencia de PRO1 a `CC` es una fila de `perfiles_centros` con `principal = false` y `hasta is null`. Luego, en bloques
`como(…)`/`reset_sesion()`, estas aserciones (cada negativa con código exacto y, si hay varias
comprobaciones con el mismo código, **fragmento** con `assert_lanza_codigo_msg`):

| # | Quién | Llamada / sentencia | Espera | Criterio |
|---|---|---|---|---|
| 19.1 | postgres | `insert into notas_clinicas (paciente_id, autor_id) values (PA, PRO1)` | `23502` | 2 (neg.) |
| 19.2 | PRO1 | `episodio_para_nota(PA, null, null, CC)` → `vA` | `vA <> EA0`; como postgres: una sola fila nueva de PA con `cerrado_en is null`, `profesional_id = PRO1`, `modalidad_relacional = 'individual'`, `centro_id = CC`, `abierto_en = (now() at time zone zona_horaria_centro(CC))::date`; `auditoria` con `tabla='episodios_asistenciales', operacion='INSERT', registro_id=vA::text, actor_id=PRO1` = 1 | 4 (y EA0 cerrado no cuenta) |
| 19.3 | PRO1 | insertar nota `(PA, vA, PRO1)` | pasa | 2 (gemela) |
| 19.4 | PRO1 | `episodio_para_nota(PA, null, null, CC)` otra vez | devuelve `vA`; episodios de PA siguen siendo 2 (EA0 + vA); filas de auditoría de `vA` siguen en 1 | 5 |
| 19.5 | PRO1 | `episodio_para_nota(PB)` | `EP001` + «elige episodio» | 6 (neg.) |
| 19.6 | PRO1 | `episodio_para_nota(PB, EB2)` | devuelve `EB2`; episodios de PB siguen en 2 | 6 (pos.) |
| 19.7 | PRO1 | `episodio_para_nota(PB, vA)` (episodio propio de **otro paciente**) | `42501` + «no vale para esta nota» | 7 (neg.) — gemela 19.6 |
| 19.8 | PRO1 | `episodio_para_nota(PS, ES)` (episodio de **PRO2** sobre paciente de PRO1) | `42501` + «no vale para esta nota» | 7 (neg.) |
| 19.9 | PRO1 | `episodio_para_nota(PS)` | devuelve id **≠ ES**, nuevo, `profesional_id = PRO1` | 7 (gemela) + D2 |
| 19.10 | PRO1 | `episodio_para_nota(PJ4)` (PRO1 es `es_profesional_del_episodio(EJX)`, pero EJX es de PRO2) | devuelve id **≠ EJX**, nuevo, de PRO1 | **D2, discriminante** |
| 19.11 | PRO1 | `episodio_para_nota(PJ4, EJX)` | `42501` + «no vale para esta nota» | 7 |
| 19.12 | PRO1 | `episodio_para_nota(PJ2)` | devuelve `EJ` (participante activo, conjunta) | D4/ADR-030 (pos.) |
| 19.13 | PRO1 | `episodio_para_nota(PJ5)` (participante dado de baja) | devuelve id **≠ EJ**, nuevo | lookup solo activos |
| 19.14 | PRO1 | `episodio_para_nota(PJ5, EJ)` | devuelve `EJ` (elección explícita, estructural) | 7 (pos.) |
| 19.15 | PRO1 | `episodio_para_nota(PA, EA0)` | `22023` + «está cerrado» | cerrado |
| 19.16 | PRO1 | `episodio_para_nota(PC)` | `42501` + «No atiendes a este paciente» | 7 (neg.) |
| 19.17 | PRO2 | `episodio_para_nota(PC)` (desbloqueo `222222`) | devuelve `EC` | gemela 19.16 |
| 19.18 | TEC1 | `episodio_para_nota(PA, null, null, CA)` | `42501` + «técnico administrativo» (y **no** «bloqueada») | 8 (neg.) — gemela 19.2 |
| 19.19 | PRO1 | `episodio_para_nota(PD, null, CITA, CC)` | nuevo episodio con `centro_id = CA` (la cita manda sobre el parámetro) | D3 |
| 19.20 | PRO1 | paciente nuevo sin episodio `PE` (`d0340001-…-00000000000a`), `episodio_para_nota(PE, null, null, CD)` | `42501` + «no es uno de los tuyos» | D3 (neg.) — gemela 19.2 con CC |
| 19.21 | PRO1 | `episodio_para_nota(PE, null, null, null)` | `22023` + «Falta el centro» | D3 |
| 19.22 | PRO1 | `episodio_para_nota(PE, null, CITA, CC)` (cita de PD) | `42501` + «La cita no es de este paciente» | D3 |
| 19.23 | PRO1 | insertar nota `(PA, EB1, PRO1)` | `23514` + «no son del mismo paciente» | D4 (neg.) — gemela 19.3 |
| 19.24 | PRO1 | insertar nota `(PJ2, EJ, PRO1)` / `(PA, EJ, PRO1)` | pasa / `23514` + «no son del mismo paciente» | D4 conjunta |
| 19.25 | PRO1 | insertar nota `(PS, ES, PRO1)` | `23514` + «episodio de otro profesional» | D4/D2 en la base — gemela: `(PS, <id de 19.9>, PRO1)` pasa |
| 19.26 | postgres | insertar nota `(PA, EB1, PRO1)` | `23514` + «no son del mismo paciente» (lo impone la base, no la RLS) | D4 |
| 19.27 | PRO1 | nota sin firmar de PB en `EB1`: `update … set episodio_id = EB2` / `set episodio_id = vA` / `set paciente_id = PA` | pasa / `23514` / `23514` | D4 por `update` |
| 19.28 | PRO1 | `update episodios_asistenciales set paciente_id = PB where id = vA` | `42501` + «tiene notas» — gemela: `set motivo_consulta = 'x' where id = vA` pasa, y `set paciente_id = PB` sobre un episodio **sin notas** de PRO1 (el de 19.13) pasa | D4 puerta episodio |
| 19.29 | PRO1 | `update episodio_participantes set paciente_id = PA where episodio_id = EJ and paciente_id = PJ2` (PJ2 tiene nota por 19.24) | `42501` + «El participante tiene notas» — gemela: `set baja_en = current_date` en la misma fila pasa | D4 puerta participante |
| 19.30 | postgres | `delete from episodio_participantes where episodio_id = EJ and paciente_id = PJ2` | `42501` + «El participante tiene notas» | D4 puerta participante |
| 19.31 | postgres | `has_function_privilege('anon', 'public.episodio_para_nota(uuid,uuid,uuid,uuid)', 'execute')` falso; `'authenticated'` cierto; ninguna de las tres `fn_*` ejecutable por `authenticated` | aserción | permisos |

Cada fallo esperado dentro de `savepoint`/`rollback to savepoint` si hace falta seguir en la
transacción (`assert_lanza_*` ya lo encapsula). Antes de 19.29 comprobar que PRO1 ve la fila del
participante (política `episodio_participantes_modificacion`): si no la ve, el `update` daría 0
filas y no probaría nada (`.claude/rules/pruebas.md`, «`UPDATE 0` no prueba nada»); la aserción
se hace sobre el **código**, así que un 0 filas sin error la hace fallar.

Fila del README: `| 19-nota-en-episodio.sql | T-034 — ADR-071: nota sin episodio 23502; episodio_para_nota() abre individual a nombre del llamante (auditado), reutiliza el único abierto, EP001 con varios, elección explícita validada (otro paciente, otro profesional, cerrado); D2: un episodio de otro profesional no se reutiliza aunque es_profesional_del_episodio() sea cierta; D3: centro de la cita o parámetro validado con centros_actuales(); D4: coherencia paciente-episodio y autor-episodio en la base, y las puertas de episodio y participante congeladas con notas |`

### 1.7 · `docs/architecture.md`

En «Personas alrededor del paciente», justo después de la viñeta **Participantes de un episodio**
(`:350-353`), una viñeta nueva **Toda nota en un episodio (ADR-071)**: columna obligatoria; la nota
va en un episodio **de su autor**, del mismo paciente o de un participante; `episodio_para_nota()`
abre individual (sin preguntar) si no hay ninguno abierto propio, reutiliza el único, y exige
elegir (`EP001`) si hay varios; el centro sale de la cita o del centro activo que manda la
aplicación (la cookie no es legible en SQL); un episodio con notas no cambia de paciente ni de
profesional, y un participante con notas no se mueve ni se borra. Y en la lista de funciones
(`:250-265`), una línea para `episodio_para_nota()`. **No** se corrige aquí el texto de
`centros_actuales()` (H13): va a Hallazgos.

---

## 2 · Decisiones y alternativas descartadas

**D1 · Función, no disparador.**
- *Elegida*: `episodio_para_nota()` devuelve el `uuid`; T-012 inserta la nota con él. El editor
  necesita saber **antes** de escribir si tiene que preguntar; con una función lo sabe llamándola.
- *Descartada · disparador `before insert`*: el caso «varios» sería un fallo del `insert` del
  borrador, el editor tendría que reintentar con elección, y abrir episodios quedaría escondido
  detrás de un `insert` de nota (una escritura no pedida en otra tabla).
- *Descartada · función que además crea la nota*: la nota la crea T-012 con su borrador y su cita;
  meterlo aquí invade su contrato. Coste aceptado: si la inserción de la nota falla, queda un
  episodio abierto vacío, que la siguiente llamada **reutiliza** (no se acumulan).
- *`security invoker`*: las políticas `episodios_alta`/`episodios_lectura` muerden de verdad
  (precedente `alta_paciente()`); con *definer* habría que copiar a mano candado, asignación y
  dueño, y cualquier cambio futuro de política se desincronizaría. Las guardas explícitas 1-5 están
  solo para dar mensajes claros y para el orden rol → candado.
- *Errcode `EP001`* (clase propia): `21000`/`P0003` también los lanza un error de programación
  (`select into strict`, subconsulta con varias filas) y la pantalla diría «elige episodio» ante un
  bug; `PTxxx` lo reinterpreta PostgREST como código HTTP. Fragmento estable: «elige episodio».
- *Auditoría*: la da `auditar_episodios_asistenciales` (H11). Un evento propio exigiría ensanchar
  el `check` de `auditoria.operacion` sin nada que ganar: el `INSERT` ya dice quién, cuándo y qué.
- *Candado de concurrencia*: `pg_advisory_xact_lock` por (profesional, paciente), mismo patrón que
  la cadena de huellas; sin él, dos pestañas abren dos episodios y la siguiente nota exige elegir.
  Se descarta un índice único parcial: el ADR-071 admite varios abiertos a propósito.
- *`abierto_en` en la zona del centro*: el `default current_date` (H2) es la fecha de la zona de la
  sesión de Postgres (UTC en Supabase); entre las 00:00 y las 02:00 de Madrid abriría el episodio
  «ayer», y el criterio 4 dice «abierto hoy». Se fija explícito con `zona_horaria_centro()`
  (`…094547…sql:1009`). Descartado dejar el `default`: la prueba 19.2 sería inestable según la hora
  a la que corra CI.

**D2 · «Participa» = `episodios_asistenciales.profesional_id = auth.uid()`, y nada más.**
- *Descartada · `es_profesional_del_episodio()` tal cual*: (a) es cierta para el profesional
  asignado de **cualquier** participante, así que reutilizaría el episodio de pareja de un compañero
  o el del suplente (viola «un episodio abierto de otro profesional no se reutiliza»); (b) es falsa
  para un individual sin filas de participante (H4), así que abriría uno nuevo en cada nota.
- *Descartada · la unión de ambas*: hereda (a).
- La misma regla vale para la **elección explícita** (criterio 7) y la **impone la base** en la nota
  (`autor_id = e.profesional_id`), no solo la función: `authenticated` tiene `grant insert` directo
  sobre `notas_clinicas` y la regla del propietario («nunca escribe en el episodio del compañero»)
  no puede depender de que la aplicación llame a la función.
- La búsqueda automática cuenta solo participantes **activos** (`baja_en is null`): no se cuelga en
  silencio una nota nueva de alguien que ya dejó la terapia conjunta. La elección explícita y el
  disparador aceptan cualquier fila de participante (la sesión del lunes se puede documentar el
  miércoles aunque la baja fuera el martes).

**D3 · Centro por parámetro, validado.** La cookie `centro_activo` no llega a SQL (H12). Orden:
centro de la cita (si hay cita y tiene centro) → `p_centro_id` validado con `centros_actuales()`
(H13, fuente de verdad en base, la misma que acota la RLS) → error `22023`. Cita y centro solo se
leen en la rama de abrir: en reutilización y elección no tienen efecto. Descartado caer a
`centro_principal()`: el propietario dijo «centro activo de la sesión», no «principal».

**D4 · En la base, con tres disparadores.** Descartado un `check`/FK compuesta: la coherencia
depende de otra tabla (participantes) y del dueño del episodio. Descartado exigir fechas de
participación contra `fecha_sesion`: añade una regla que el propietario no pidió y rompe importes
retroactivos. El episodio con notas no cambia de paciente ni de profesional y el participante con
notas no se mueve ni se borra: sin eso, D4 se esquiva por `episodios_modificacion`/
`episodio_participantes_modificacion` (H5, H6).

**Individual sin fila de participante.** Descartado insertar al titular como participante: un
*invoker* no puede (H6), y ADR-030 modela participantes para lo conjunto.

---

## 3 · Cómo se cierra cada criterio de aceptación

| # | Cómo | Evidencia |
|---|---|---|
| 1 | `npx supabase db reset` + `npm run seed`. | Salida de ambos sin `ERROR`. |
| 2 | 19.1 (23502) con gemela 19.3. | Línea `OK (lanzó 23502 …)` en `npm run test:rls`. |
| 3 | Reaplicar la migración con una nota nula, a mano (el banco no puede leer el fichero de migración desde el contenedor):<br>`CONT=$(docker ps --format '{{.Names}}' \| grep '^supabase_db_'); { echo 'begin;'; echo 'alter table public.notas_clinicas alter column episodio_id drop not null;'; echo 'insert into public.notas_clinicas (paciente_id, autor_id) select id, profesional_id from public.pacientes order by id limit 1;'; cat supabase/migrations/20260929120000_nota_siempre_en_episodio.sql; echo 'rollback;'; } \| docker exec -i "$CONT" psql -U postgres -v ON_ERROR_STOP=1; echo "salida=$?"` | Salida con `ERROR: T-034: hay 1 notas clínicas sin episodio…`, `salida=3`; y a continuación `select is_nullable from information_schema.columns where table_name='notas_clinicas' and column_name='episodio_id'` = `NO` (nada quedó tocado). |
| 4 | 19.2 (individual, a su nombre, hoy en la zona del centro, una fila de auditoría). | `npm run test:rls`. |
| 5 | 19.4. | `npm run test:rls`. |
| 6 | 19.5 (`EP001` + «elige episodio») y 19.6. | `npm run test:rls`. |
| 7 | 19.7, 19.8, 19.11, 19.16 con gemelas 19.6, 19.9, 19.12, 19.14, 19.17; en la base 19.23-19.26. | `npm run test:rls`. |
| 8 | 19.18 (fragmento «técnico», no «bloqueada»), gemela 19.2. | `npm run test:rls`. |
| 9 | `npm run test:rls` en verde con el módulo 19 (sobre base **sembrada**, como en CI); `npm run verificar:huellas`. | Última línea del banco y `cadena íntegra: cero anomalías.` |
| 10 | `npm run tipos` (diff de `tipos-bd.ts` con `episodio_id: string` en `Row`/`Insert` y la función nueva); `npm run lint`, `npm run lint:migraciones`, `npm run build`, `node ~/.claude/pipeline/territorio.mjs T-034`. | Salidas en verde. Además `npm run test:huellas` (CI lo corre y `t005` cambia). |

Demostración de guarda (para la evidencia, no se commitea): con
`alter table public.notas_clinicas disable trigger exigir_episodio_coherente_en_nota` dentro de la
transacción del banco, 19.23-19.26 deben pasar a **fallar** («debía lanzar 23514 y no lanzó nada»);
y cambiando en la función `e.profesional_id = v_uid` por `public.es_profesional_del_episodio(e.id)`,
19.10 debe fallar. Se pega la salida de ambas en la bitácora.

---

## 4 · Riesgos, por probabilidad

1. **Alta · Algún módulo del banco cuenta episodios o notas y cambia su cuenta** con `EPI2` en 01.
   Verificado por `grep`: las cuentas de episodios son `02:219` (ADM, sin relación) y por `id`. Si
   aun así cae uno, se mueve la fixture de `EPI2` al propio 01 antes de la línea 140 (ya está ahí);
   no se tocan aserciones de otros módulos sin escalar.
2. **Media · El disparador D4 dispara antes que `congelar_cabecera_sellada`** si se le cambia el
   nombre: una reatribución de nota firmada pasaría de 42501 a 23514. El nombre `exigir_…` está
   elegido por orden alfabético; el revisor lo comprueba (§5).
3. **Media · `EP001` y los mensajes son contrato con T-012**: si cambian, la pantalla de elección
   deja de saltar. Por eso van en `comment on function` y en `architecture.md`.
4. **Media · Episodio huérfano** si T-012 llama a la función y luego no inserta la nota. Se reutiliza
   en la siguiente llamada; no se acumula. Aceptado.
5. **Baja · La cita de 19.19 choca con alguna guarda de `citas`** (solape, citas pasadas, vínculo
   de T-029): usar fecha futura lejana, paciente de PRO1 y los mismos campos que `15-agenda.sql`
   usa para crear una cita suelta.
6. **Baja · `t001-esquema.sql`/`t002-rls.sql` rotos** (no los corre CI, fuera de territorio).
   Se anotan en Hallazgos.
7. **Baja · Carrera real** entre dos pestañas: cubierta por el candado consultivo, sin prueba de
   dos conexiones en este ticket (ver «Lo que no entra»).

---

## 5 · Qué revisar

Para los dos revisores y para la autoevaluación del implementador:

**Entradas que elige el llamante y su efecto**
- [ ] `p_paciente_id`: solo si `es_profesional_asignado()` (19.16). Nulo → 22023.
- [ ] `p_episodio_id`: acepta **solo** episodios con `profesional_id = auth.uid()`, abiertos, del
  paciente o con fila de participante. Inexistente, invisible, de otro paciente y de otro
  profesional dan **el mismo** 42501 y el mismo mensaje (sin oráculo). Cerrado da 22023 solo
  **después** de comprobar que es suyo.
- [ ] `p_cita_id`: solo se lee al abrir; se exige `paciente_id` y `profesional_id = auth.uid()`
  (un administrador lee todas las citas: sin ese filtro, elegiría el centro con la cita de otro).
- [ ] `p_centro_id`: solo al abrir y solo si la cita no da centro; `in (select centros_actuales())`.
  Con cita con centro, el parámetro **no** tiene efecto (19.19).
- [ ] El llamante **no** puede elegir `profesional_id`, `modalidad_relacional` ni `abierto_en` del
  episodio: los fija la función.

**Pruebas que deben fallar y por qué motivo exacto**
- [ ] 19.1 falla con **23502**, no con 23514: el disparador devuelve `new` si `episodio_id` es nulo.
- [ ] 19.5 falla con `EP001` y «elige episodio»; si la función eligiera el más reciente, 19.5 no lanza.
- [ ] 19.10 es **la** prueba de D2: con `es_profesional_del_episodio()` o la unión, devuelve `EJX`.
- [ ] 19.2 comprueba que `EA0` (cerrado) no cuenta: sin `cerrado_en is null`, 19.2 reutiliza EA0.
- [ ] 19.18 exige el fragmento «técnico»: si el candado se mirase antes que el rol, saldría «bloqueada».
- [ ] 19.23-19.26 dejan de lanzar con el disparador desactivado (demostración en la bitácora).
- [ ] 19.28/19.29 se hacen sobre filas que PRO1 **sí** puede actualizar (gemelas que pasan).

**Invariantes que se podrían saltar por otra puerta**
- [ ] **Nulo**: `set not null` + guarda primera sentencia; el disparador no enmascara el 23502.
- [ ] **Inserción directa** (sin la función): D2 y D4 los impone `exigir_episodio_coherente_en_nota`
  en `insert` **y** `update of paciente_id, episodio_id, autor_id` (19.25-19.27).
- [ ] **Por el episodio**: `update episodios_asistenciales set paciente_id|profesional_id` con notas → 42501 (19.28).
- [ ] **Por el participante**: `update … set paciente_id|episodio_id` y `delete` con notas → 42501 (19.29-19.30). `delete` no está concedido a `authenticated`, pero `postgres`/`service_role` sí pueden.
- [ ] **Orden de disparadores** en `notas_clinicas`: `congelar_cabecera_sellada` < `exigir_episodio_coherente_en_nota` < `tocar_borrador` (comprobar con `select tgname from pg_trigger where tgrelid = 'public.notas_clinicas'::regclass order by tgname`).
- [ ] **Oráculo**: el disparador sale con `return new` si hay sesión y `autor_id ≠ auth.uid()` (lo rechaza la RLS), y comprueba **autor antes que paciente**.
- [ ] **Concurrencia**: `pg_advisory_xact_lock` **antes** del recuento, y el recuento en una
  sentencia posterior (no en la misma que toma el candado).
- [ ] **Permisos**: `episodio_para_nota` sin `execute` para `anon` ni `public`; las tres `fn_*` sin
  `execute` para nadie del cliente (19.31). `security invoker` en la función; `definer` +
  `search_path = ''` en las tres de disparador (lint regla 4).
- [ ] **TRUNCATE**: no aplica (no hay tabla nueva; `truncate` ya revocado a los tres roles del cliente en T-004).
- [ ] **Sin rellenos**: la migración no contiene ningún `update public.notas_clinicas`.
- [ ] `-- destructivo:` en la línea inmediatamente anterior al `set not null` (lint regla 2).
- [ ] `comment on column public.notas_clinicas_versiones.paciente_id` reemitido sin «episodio_id es nulable».
- [ ] Ninguna migración anterior editada (lint regla 6); `tipos-bd.ts` regenerado, no editado.
- [ ] Siembra idempotente: `npm run seed` dos veces seguidas sin error ni filas nuevas de episodio.

---

## 6 · Territorio

El del contrato basta; no se amplía. Uso real: `supabase/migrations/20260929120000_nota_siempre_en_episodio.sql`,
`lib/supabase/tipos-bd.ts`, `supabase/seed-completo.sql`, `scripts/rls/01-fijacion.sql`,
`scripts/rls/04-baja.sql`, `scripts/rls/14-cadena-huellas.sql`, `scripts/rls/19-nota-en-episodio.sql`,
`scripts/rls/README.md`, `scripts/t005-concurrencia.sql`, `docs/architecture.md`.
`scripts/rls/00-ayudantes.sql` queda previsto pero sin cambios esperados. Además, al cerrar, la
bitácora `docs/bitacora/T-034.md` y `docs/state.md` (memoria, constitución regla 4) y
`tickets/T-034/*` (evidencia y revisiones).

## 7 · Delegable

Nada con comportamiento. Lo único sin comportamiento es la fila del README y el texto de
`architecture.md`, y los dos dependen de decisiones de este diseño: no compensa delegarlos. Las
fijaciones de 01/04/14/t005/seed parecen mecánicas pero ahora las gobierna un disparador
(autor = dueño del episodio): van con la migración, en el mismo carril.

---

## Preguntas al propietario

Ninguna bloquea. Ningún punto del ticket choca con un ADR. Una pregunta queda abierta y el diseño
no la decide:

- **P1 · ¿Se prohíbe en la base colgar una nota nueva de un episodio cerrado?** La función ya lo
  rechaza en la elección explícita (22023) y nunca elige uno cerrado; el disparador **no** lo
  impide en una inserción directa. Prohibirlo en la base cierra la puerta, pero impide documentar
  tarde la última sesión de un episodio ya cerrado, y eso toca el reloj de retención (ADR-033). Si
  el propietario dice que sí, es una comprobación más en el disparador (paso 3.5) y una prueba 19.x.

## Lo que no entra, y por qué

- **Selector de episodio en el editor** y la llamada desde la Server Action: T-012.
- **Cerrar episodios y reloj de retención**: fuera de alcance del contrato.
- **Prueba de dos conexiones** de la carrera de apertura: ningún criterio la pide; el candado
  consultivo se revisa leyendo (§5). Candidata a `t005` en un ticket propio.
- **Suplencia como permiso** (que un suplente pueda insertar notas de un paciente que no tiene
  asignado): hoy `notas_clinicas_alta` lo impide; D2 solo fija dónde va su nota cuando exista.
- **Fusión (ADR-031)**: la búsqueda no sigue el vínculo de fusión; «nada se repunta», y la nota
  nueva va al paciente exacto que se pasa.
- **Retirar `fn_exigir_episodio_en_nota_conjunta()` y el `episodio_id is not null` de las
  políticas**: redundantes, no dañinos; quitarlos es un cambio sin criterio que lo pida.
- **Reparar `scripts/t001-esquema.sql` y `scripts/t002-rls.sql`** y corregir el texto de
  `centros_actuales()` en `architecture.md:250-253`: fuera de territorio. Van a `docs/state.md`
  §Hallazgos.
- **Coherencia `nota.cita_id` ↔ paciente/episodio**: no la pide el contrato.
