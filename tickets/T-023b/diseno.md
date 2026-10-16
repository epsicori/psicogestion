# T-023b · Diseño — facturas del espejo en Facturación, cobro contra factura y asignación de cobros anteriores

Riesgo alto. Implementa Opus; verifican el verificador y **dos revisores**. `delegable: no`.
Migración: **`20261016120000_cobros_facturas.sql`**. Banco: **`scripts/rls/33-cobros-facturas.sql`**.

Guías de Next.js 16 que el implementador lee **antes** de tocar la pantalla (constitución, regla 1):
`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` (Server Functions,
`revalidatePath`, aviso de que son para mutaciones y se despachan de una en una),
`node_modules/next/dist/docs/01-app/03-api-reference/02-components/form.md` (`next/form` para el
filtro GET) y `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
(`searchParams` es una promesa).

---

## 0 · Hechos verificados contra el código

| # | Hecho | Dónde |
|---|---|---|
| H1 | `cobros(id uuid pk, paciente_id not null, importe numeric(12,2) not null check <> 0, fecha, forma_pago, referencia, registrado_por, registrado_en default now())`; enum `forma_pago` = efectivo, transferencia, tarjeta, bizum, otro. | `supabase/migrations/20261011120000_economico_esquema.sql:170-180` |
| H2 | `cobros` es de solo adición (tres capas con `fn_impedir_modificacion()`), audita con `fn_auditar('id')`, y está en `tablas_solo_adicion`. **No puede ser destino de una FK** (regla de `.claude/rules/supabase.md`). | `20261011120000_economico_esquema.sql:1005-1011, 1055-1085` |
| H3 | `cobros_lectura` y `cobros_alta` tienen tres ramas: administrador; profesional + `es_profesional_asignado(paciente_id)`; técnico + paciente con `centro_id in centros_actuales()`. Grants: `select` e `insert (columnas)` solo a `authenticated`; `revoke update, delete, truncate … from postgres`. | `20261011120000_economico_esquema.sql:1156-1182, 1234-1256` |
| H4 | `cobros.motivo` + `cobros_devolucion_motivo_ck` (negativo exige motivo); disparador invoker `validar_cobro` (fecha futura, 23514, solo `authenticated`/`anon`); vista `pendiente_paciente` definer con barrera, que suma lo de los absorbidos en el superviviente y **no mira ningún enlace con facturas**. | `supabase/migrations/20261013120000_cobros_y_pendiente.sql:21-157` |
| H5 | `facturas_espejo(id, borrador_id not null FK, paciente_id not null FK, proveedor, proveedor_documento_id, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor, copiado_en)`, `unique (borrador_id)`, `unique (proveedor, proveedor_documento_id)`; solo adición, en el catálogo; **sin disparador de validación en el insert** (lo valida `registrar_factura_espejo`). Su política `facturas_espejo_lectura` pasa por `borradores_factura`, que el técnico no ve. | `supabase/migrations/20261014120000_proveedor_facturacion.sql:54-130, 197-200, 644-705` |
| H6 | `facturas_espejo_cabecera` (definer, barrera) expone **diez columnas**: id, paciente_id, proveedor, numero, fecha_expedicion, base, cuota_iva, total, url_proveedor, copiado_en. Ramas: admin; profesional + `es_profesional_asignado(e.paciente_id)`; técnico + paciente de sus centros. Solo `select` a `authenticated`. | `20261014120000_proveedor_facturacion.sql:210-233` |
| H7 | El contrato dice «profesional sobre sus borradores». La migración (que manda) usa **asignado**, y su comentario dice que es la rama de `borradores_factura_lectura`. Las gemelas de CA5 del profesional usan PRO1 asignado a P1. | `20261014120000_proveedor_facturacion.sql:208-209, 226-227` |
| H8 | `cobros.factura_espejo_id uuid` (nula, sin FK, solo al insertar: `grant insert (factura_espejo_id)`), validada por `fn_validar_cobro_factura_espejo()` definer: nulo → nada; para `authenticated`/`anon`, réplica de `cobros_alta` → 42501 `No puedes registrar este cobro (T-026a)`; luego 23503 `la factura del cobro no existe`; luego 23514 `la factura del cobro es de otro paciente` (igualdad estricta). Disparador `validar_cobro_factura_espejo` before insert. Es la **única** definición (no hay redefiniciones posteriores). | `20261014120000_proveedor_facturacion.sql:1013-1062` |
| H9 | Ningún fichero de `app/` lee hoy `cobros.factura_espejo_id` ni `cobros_facturas`. El panel de la ficha (T-026a) lee `facturas_espejo_cabecera` y `facturas_espejo`. | `grep -rn "factura_espejo_id\|cobros_facturas" app lib` (solo `tipos-bd.ts` y el panel con `facturas_espejo*`) |
| H10 | `cobertura_solo_adicion()` mide, para cada tabla del catálogo: existe; nadie (postgres incluido) tiene UPDATE/DELETE; disparador BEFORE UPDATE OR DELETE por fila; disparador BEFORE TRUNCATE por sentencia. | `supabase/migrations/20260829150000_auditoria_y_solo_adicion.sql` (`cobertura_solo_adicion`) |
| H11 | `10-solo-adicion.sql` recorre **todo** `tablas_solo_adicion` y, con UPDATE/DELETE devueltos a postgres, exige que el **disparador de fila** bloquee. **Sobre una tabla vacía un disparador de fila no salta** y la aserción fallaría: `cobros_facturas` necesita una fila **antes** del módulo 10, es decir, en `01-fijacion.sql`. | `scripts/rls/10-solo-adicion.sql:8-60` |
| H12 | `11-cobertura.sql` exige que toda política de `pg_policies` esté en `v_declaradas` y viceversa. | `scripts/rls/11-cobertura.sql:15-110` |
| H13 | Fijación: ADM `b0030001-…-001`, PRO1 `…002`, PRO2 `…003`, TEC1 `…004` (CA), TEC2 `…005` (CB); P1 `d0030001-…-001` (PRO1, CA), P2 `…002` (PRO2, CB); COB1 `a0210002-…-001` (P1, 60.00, efectivo, por ADM); el espejo se crea **por las funciones** como `service_role`: DOC-A → `F-2026-0001`, `current_date`, 60,00 € (P1); DOC-B → `F-2026-0002`, 70,00 € (P2); anotación `rectificado` en DOC-A. `31-proveedor` hace `\gset` de `ESPA`/`ESPB` (l.75-76). | `scripts/rls/01-fijacion.sql:31, 245, 258-304`; `scripts/rls/31-proveedor-facturacion.sql:75-76` |
| H14 | Las inserciones de `31` con `factura_espejo_id` son todas de **+10,00 €** (l.604-626): el límite de devoluciones de §1.4 no las toca. | `scripts/rls/31-proveedor-facturacion.sql:600-626` |
| H15 | Ayudantes del banco: `assert`, `assert_lanza`, `assert_lanza_codigo`, `assert_lanza_codigo_msg(consulta, codigo, fragmento, mensaje)`, `assert_no_lanza`, `contar`, `como(uid)`, `reset_sesion()`. El banco corre en **una** transacción con rollback, por orden alfabético. No hacen falta ayudantes nuevos. | `scripts/rls/00-ayudantes.sql:11-185`; `scripts/rls/README.md` |
| H16 | La concurrencia real se prueba fuera del banco, con dos conexiones `psql` y datos confirmados: `scripts/t038-concurrencia.mjs` (+ `.sql`), salida en `tickets/T-038/ca4-concurrencia.json`. | `scripts/t038-concurrencia.mjs:1-60`, `scripts/test-huellas.mjs` |
| H17 | Linter: `TABLAS_SOLO_ADICION` (15 tablas) y su prueba de lista exacta; ignora cuerpos de función y comentarios; regla 3 exige `enable row level security` en el mismo fichero. | `scripts/lint-migraciones.ts:26-42, 200-290`; `scripts/lint-migraciones.test.ts:28-36, 212-232` |
| H18 | `/facturacion` (T-023): `page.tsx` no es `async`; bloques con `Suspense`; `datos.ts` con `cache()` por petición (`cargarContexto`: rol de la base, `?profesional` **solo** si admin, `?pagina`); `registrarCobro(datos: unknown)` con clave `id` (idempotencia por `cobros_pkey`), paciente bajo RLS, rechazo de fusionado, «hoy» del centro, `crearEsquemaCobro(hoy)`, mapeo de 23514 por fragmento, `revalidatePath('/facturacion')`. `huellaDeCobro` decide la clave de envío en `registrar-cobro.tsx` (`Map` en `useRef`). `hrefDePagina` solo conserva `profesional`; `SelectorProfesional` hace `router.replace('/facturacion?profesional=…')`. | `app/(app)/facturacion/{page.tsx,datos.ts,acciones.ts,esquemas.ts,registrar-cobro.tsx,formulario-cobro.tsx,bloques.tsx:104-170,selector-profesional.tsx:34}` |
| H19 | Hay precedente de Server Action **de lectura** que llama un diálogo cliente: `buscarPacientes(entrada: unknown)`. | `app/(app)/agenda/nueva/acciones.ts:223` |
| H20 | Primitivas disponibles: `Dialogo({abierto, alCerrar, titulo, focoInicial, ancho})`, `Seleccion` (`<select>` nativo compatible con `register()`), `Field`. **No hay grupo de radio**: el selector de cobro es un `Seleccion`. | `components/ui/dialogo.tsx:23`, `components/ui/seleccion.tsx:21` |
| H21 | El nombre del programa sale de `FICHAS[proveedor].nombre` (`lib/facturacion/registro.ts:10`); el panel de T-026a lo usa así y ninguna clave de `es.ts` contiene «Holded». | `app/(app)/pacientes/[id]/panel-facturacion.tsx:143-160` |
| H22 | `accesibilidad/facturacion.spec.ts` es serie, a 360 px, entra como admin, y localiza con `getByRole('button', { name: 'Registrar cobro' })` y `getByRole('dialog', { name: 'Registrar cobro' })` **sin `exact`**: Playwright compara por subcadena, así que **un botón por fila llamado «Registrar cobro de la factura …» rompe los pasos 1-5** por modo estricto. Las specs que escriben en la base usan `ejecutarSql` de `scripts/psql.mjs` y `contenedorDelProyecto()` (`accesibilidad/avisos.spec.ts:4, 62`). | `accesibilidad/facturacion.spec.ts:33-41, 87-126` |
| H23 | Siembra: `supabase/seed.sql` (admin, Ana, Bruno, Lucía `d0080001-…-001` de Ana); `supabase/seed-completo.sql` (`npm run seed`) añade `tecnico@psicogestion.test` (centro Madrid `c0080001-…-00a`). Contraseña `psico1234`. | `supabase/seed.sql:57-63, 107-173`; `supabase/seed-completo.sql:84, 134-166` |
| H24 | No hay índice sobre `cobros(paciente_id)` (solo `citas` tiene índices de paciente). `pendiente_paciente` suma cobros por paciente. | `grep "index.*on public.cobros" supabase/migrations` → nada |
| H25 | `supabase/config.toml:18` `max_rows = 1000`. | `supabase/config.toml` |
| H27 | **T-046 (diseño aprobado, sin fusionar)**: su migración `20261015120000` añade `crear_borrador`, `anadir_version_borrador` y el disparador `validar_citas_version_borrador`. Esta migración no toca borradores ni esas funciones. **Sin verificar**: si ese disparador muerde los `insert` directos de borrador que hacen, como `postgres`, `ca10-rendimiento.sql`, `preparar-espejo.sql`, `t023b-concurrencia.sql` y el `beforeAll` del spec. Si T-046 se fusiona antes, el implementador lee su migración y crea el borrador con las columnas y la versión que exija. | `tickets/T-046/diseno.md` (no leído) |
| H26 | Solapes vivos: **T-027** (rama `worktree-agent-ac904d9b6b2080a73`, sin fusionar) toca `app/(app)/facturacion/page.tsx`, `page.test.tsx`, `paginacion-pendientes.tsx` (añade la prop opcional `nombre`), `lib/i18n/es.ts` y crea `app/(app)/facturacion/bonos/**`. **T-046** reserva `20261015120000`, y toca `lib/i18n/es.ts` y el panel de la ficha. | `git log --all -- "app/(app)/facturacion"`; `tickets/T-046-editor-del-borrador.md:11-19` |

---

## 1 · Piezas y contratos

### 1.1 Migración `supabase/migrations/20261016120000_cobros_facturas.sql`

Secciones en este orden. Cabecera de comentario: qué hace, ADR 053 (g) y 077, y «ningún UPDATE ni
DELETE; una política de alta y una de lectura nuevas».

**(a) Índices** (para CA10):
```sql
create index cobros_paciente_idx       on public.cobros (paciente_id);
create index cobros_factura_espejo_idx on public.cobros (factura_espejo_id) where factura_espejo_id is not null;
```

**(b) Tabla de solo adición.**
```sql
create table public.cobros_facturas (
  id                uuid        primary key default gen_random_uuid(),
  cobro_id          uuid        not null,  -- sin FK: cobros es de solo adición (FOR KEY SHARE pide UPDATE)
  factura_espejo_id uuid        not null,  -- sin FK: facturas_espejo es de solo adición
  creada_por        uuid        not null default auth.uid() references public.perfiles(id),
  creada_en         timestamptz not null default now(),
  constraint cobros_facturas_cobro_unico unique (cobro_id)
);
create index cobros_facturas_factura_idx on public.cobros_facturas (factura_espejo_id);
alter table public.cobros_facturas enable row level security;
```
`comment on table` dice: una fila = «este cobro anterior es de esta factura»; nunca se borra ni se
cambia (desasignar no existe); el cobro y la factura se validan en `validar_cobro_factura`.

**(c) Permisos (capa 1).**
```sql
revoke all on table public.cobros_facturas from public, anon, authenticated, service_role;
revoke update, delete, truncate on table public.cobros_facturas from postgres;
grant select on table public.cobros_facturas to authenticated;
grant insert (cobro_id, factura_espejo_id) on table public.cobros_facturas to authenticated;
```
Nada a `anon` ni a `service_role`. Nadie tiene INSERT sobre `id`, `creada_por` ni `creada_en`.

**(d) Capas 2 y 3, auditoría y catálogo.**
```sql
create trigger impedir_modificacion_cobros_facturas
  before update or delete on public.cobros_facturas
  for each row execute function public.fn_impedir_modificacion();
create trigger impedir_truncado_cobros_facturas
  before truncate on public.cobros_facturas
  for each statement execute function public.fn_impedir_modificacion();
create trigger auditar_cobros_facturas
  after insert on public.cobros_facturas
  for each row execute function public.fn_auditar('id');
insert into public.tablas_solo_adicion (tabla, motivo) values
  ('cobros_facturas', 'Qué factura del programa paga un cobro anterior (T-023b). Una asignación no se deshace.');
```

**(e) La lectura única: vista `public.cobros_por_factura`** (la decisión del contrato, §2 D1).
```sql
create view public.cobros_por_factura
  with (security_invoker = true)
as
select c.factura_espejo_id, c.id as cobro_id, c.paciente_id, c.importe, c.fecha, c.forma_pago,
       c.referencia, c.motivo, 'al_registrar'::text as via, c.registrado_en as enlazado_en
  from public.cobros c
 where c.factura_espejo_id is not null
union all
select a.factura_espejo_id, c.id, c.paciente_id, c.importe, c.fecha, c.forma_pago,
       c.referencia, c.motivo, 'asignado'::text, a.creada_en
  from public.cobros_facturas a
  join public.cobros c on c.id = a.cobro_id;

revoke all on table public.cobros_por_factura from public, anon, authenticated, service_role;
grant select on table public.cobros_por_factura to authenticated;
```
Invoker: hereda `cobros_lectura` (y `cobros_facturas_lectura`); no abre ninguna puerta lateral. Dentro
de los disparadores definer (dueño `postgres`, sin `force row level security`) la misma vista lee todo.
`comment on view`: «La ÚNICA forma de saber qué cobros son de una factura. Nadie reconstruye esta
unión: ni la aplicación, ni otra función, ni otra vista (T-023b CA8).»

**(f) Comprobación compartida de devoluciones** (§2 D4).
```sql
create function public.fn_comprobar_devolucion_en_factura(p_factura_espejo_id uuid, p_importe numeric)
returns void language plpgsql volatile security invoker set search_path = ''
as $$
declare v_suma numeric;
begin
  if p_importe >= 0 then return; end if;            -- un cobro positivo no puede romper la cota
  perform pg_advisory_xact_lock(hashtextextended('cobros_por_factura:' || p_factura_espejo_id::text, 0));
  -- Sentencia nueva => instantánea nueva en READ COMMITTED: ya ve lo que confirmó quien tenía el candado.
  select coalesce(sum(v.importe), 0) into v_suma
    from public.cobros_por_factura v where v.factura_espejo_id = p_factura_espejo_id;
  if v_suma + p_importe < 0 then
    raise exception 'la devolución supera lo cobrado en la factura' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.fn_comprobar_devolucion_en_factura(uuid, numeric) from public, anon, authenticated, service_role;
```
Solo la llaman las dos funciones de disparador (definer, dueño `postgres`, que conserva EXECUTE).

**(g) Disparador de validación de `cobros_facturas`.**
`public.fn_validar_cobro_factura()` — `returns trigger`, `plpgsql`, **`security definer`**,
`set search_path = ''`; `revoke all … from public, anon, authenticated, service_role`; disparador
`validar_cobro_factura` **before insert for each row**. Orden exacto (cada paso con su mensaje; los
fragmentos son únicos y ninguno es prefijo de otro ni de los de T-026a):

| Paso | Condición | Resultado |
|---|---|---|
| 0 | `new.cobro_id is null or new.factura_espejo_id is null` | `return new` sin mirar nada: falla después el NOT NULL (23502), que Postgres comprueba **tras** los BEFORE ROW (CA7). |
| 1 | `current_setting('role', true) in ('authenticated','anon')`: fija `new.creada_por := (select auth.uid())` y `new.creada_en := now()`; lee el cobro (`paciente_id, importe, factura_espejo_id`). Si **no existe** o el llamante **no pasa la réplica de `cobros_alta`** sobre `v_cobro.paciente_id` (las tres ramas de H8 copiadas **literalmente** de `fn_validar_cobro_factura_espejo`, sustituyendo `new.paciente_id` por `v_cobro.paciente_id` y sin la condición de `registrado_por`) | 42501 `No puedes asignar este cobro (T-023b)` — **el mismo texto** para cobro inexistente y cobro ajeno: sin oráculo. |
| 1b | Otros roles (`postgres`): si el cobro no existe | 23503 `el cobro asignado no existe` |
| 2 | `select f.paciente_id from public.facturas_espejo f where f.id = new.factura_espejo_id`; no existe | 23503 `la factura asignada no existe` |
| 3 | `v_factura_paciente is distinct from v_cobro.paciente_id` | 23514 `la factura asignada es de otro paciente` |
| 4 | `v_cobro.factura_espejo_id is not null or exists (select 1 from public.cobros_por_factura v where v.cobro_id = new.cobro_id)` | 23514 `el cobro ya está enlazado a una factura` |
| 5 | `perform public.fn_comprobar_devolucion_en_factura(new.factura_espejo_id, v_cobro.importe)` | 23514 `la devolución supera lo cobrado en la factura` |
| — | | `return new` |

Respaldo de concurrencia del paso 4: `cobros_facturas_cobro_unico` (dos transacciones que pasan el
paso 4 a la vez: la segunda espera y recibe **23505** de la restricción).

**(h) Políticas.**
```sql
create policy cobros_facturas_lectura on public.cobros_facturas
  for select to authenticated
  using (exists (select 1 from public.cobros c where c.id = cobros_facturas.cobro_id));
create policy cobros_facturas_alta on public.cobros_facturas
  for insert to authenticated
  with check (
    creada_por = (select auth.uid())
    and exists (select 1 from public.cobros c
                 where c.id = cobros_facturas.cobro_id
                   and ( (select public.rol_actual()) = 'administrador'::public.rol_usuario
                      or ((select public.rol_actual()) = 'profesional_sanitario'::public.rol_usuario
                          and public.es_profesional_asignado(c.paciente_id))
                      or ((select public.rol_actual()) = 'tecnico_administrativo'::public.rol_usuario
                          and c.paciente_id in (select p.id from public.pacientes p
                                                 where p.centro_id in (select public.centros_actuales()))))));
```
El `exists` sobre `cobros` corre bajo `cobros_lectura`; no hay recursión (cobros no consulta
`cobros_facturas`). La política es la segunda pared: el disparador ya lanzó 42501 antes.

**(i) T-026a con la cota de devoluciones.** `create or replace function public.fn_validar_cobro_factura_espejo()`
con el cuerpo de `20261014120000_proveedor_facturacion.sql:1021-1050` **copiado sin un carácter
distinto** (mismos mensajes, mismo orden 42501 → 23503 → 23514) y **una sola línea nueva** justo antes
del `return new` final:
```sql
  perform public.fn_comprobar_devolucion_en_factura(new.factura_espejo_id, new.importe);
```
El `revoke all …` se repite tras el `create or replace`. El disparador no se toca.

**(j) Funciones de lectura** (invoker, `stable`, `set search_path = ''`, toda tabla con alias;
`revoke all … from public, anon, service_role`; `grant execute … to authenticated`).

```sql
create function public.listado_facturas_espejo(
  p_desde date,
  p_hasta date,
  p_forma_pago public.forma_pago default null,
  p_profesional_id uuid default null,
  p_limite integer default 20,
  p_desplazamiento integer default 0)
returns table (
  id uuid, paciente_id uuid, paciente_nombre text, paciente_apellidos text, paciente_fusionado boolean,
  proveedor public.proveedor_facturacion, numero text, fecha_expedicion date, total_centimos bigint,
  url_proveedor text, cobros jsonb, cobros_sin_factura integer, total_filas bigint)
```
Cuerpo en dos pasos (`with pagina as materialized (…)`): el primero filtra y pagina —
`from public.facturas_espejo_cabecera f left join public.pacientes p on p.id = f.paciente_id`,
`where f.fecha_expedicion between p_desde and p_hasta`, `and (p_forma_pago is null or exists (select 1
from public.cobros_por_factura v where v.factura_espejo_id = f.id and v.forma_pago = p_forma_pago))`,
`and (p_profesional_id is null or p.profesional_id = p_profesional_id)`, `count(*) over ()` como
`total_filas`, `order by f.fecha_expedicion desc, f.numero desc, f.id`,
`limit least(greatest(coalesce(p_limite, 20), 1), 100) offset greatest(coalesce(p_desplazamiento, 0), 0)`—;
el segundo calcula, **solo para las filas de la página**:
- `cobros`: `coalesce((select jsonb_agg(jsonb_build_object('cobro_id', v.cobro_id, 'importe_centimos', (v.importe * 100)::bigint, 'fecha', v.fecha, 'forma_pago', v.forma_pago, 'referencia', v.referencia, 'motivo', v.motivo) order by v.fecha, v.enlazado_en, v.cobro_id) from public.cobros_por_factura v where v.factura_espejo_id = pg.id), '[]'::jsonb)`;
- `cobros_sin_factura`: `(select count(*)::integer from public.cobros c where c.paciente_id = pg.paciente_id and not exists (select 1 from public.cobros_por_factura v2 where v2.cobro_id = c.id))`;
- `total_centimos`: `(f.total * 100)::bigint`.

Sin parámetro de estado, sin `base`, `cuota_iva`, `borrador_id`, `copiado_en`, líneas ni destinatario.

```sql
create function public.cobros_asignables(p_factura_espejo_id uuid)
returns table (cobro_id uuid, importe_centimos bigint, fecha date, forma_pago public.forma_pago,
               referencia text, motivo text)
-- cobros c del paciente de la factura, leído de facturas_espejo_cabecera (si no la ve, ninguno),
-- and not exists (select 1 from public.cobros_por_factura v where v.cobro_id = c.id),
-- order by c.fecha desc, c.registrado_en desc, c.id  limit 201
```
201 para que la acción sepa si hay más de 200 (§1.3).

### 1.2 Banco

- **`scripts/rls/01-fijacion.sql`** — al final, tras el espejo de T-026a:
  ```
  select format('%L', e.id) as "ESPA" from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-A' \gset
  select format('%L', e.id) as "ESPB" from public.facturas_espejo e where e.proveedor_documento_id = 'DOC-B' \gset
  call pg_temp.como(:ADM);
  insert into public.cobros_facturas (cobro_id, factura_espejo_id) values (:COB1, :ESPA);
  call pg_temp.reset_sesion();
  ```
  con un comentario que dice **por qué** (H11: sin fila, `10-solo-adicion` no puede probar la capa 2).
  `31` vuelve a hacer el mismo `\gset` con el mismo valor: inocuo.
- **`scripts/rls/11-cobertura.sql`** — `'cobros_facturas_alta', 'cobros_facturas_lectura'` con un
  comentario `-- T-023b · … Lo ejerce 33-cobros-facturas.`
- **`scripts/rls/33-cobros-facturas.sql`** — bloques A-L de §3 (todas las negativas con
  `assert_lanza_codigo_msg` y su gemela). Ids nuevos con prefijo `a023b001-0000-4000-8000-0000000000NN`.
  Fechas de cobro `current_date - 1` con comentario `-- fecha-relativa` (README punto 10). Termina con
  `call pg_temp.reset_sesion();`.
- **`scripts/rls/README.md`** — fila de la tabla de módulos para `33-cobros-facturas.sql` y una línea en
  el punto 7: «`01` deja COB1 asignado a DOC-A (T-023b) para que `10` tenga fila en `cobros_facturas`».
- **`scripts/t023b-concurrencia.mjs`** + **`scripts/t023b-concurrencia.sql`** — calcados de `t038`
  (dos `psql` que se solapan con `pg_sleep(2)` antes del `commit`), sobre la siembra mínima (admin
  `b0080001-…-001`, Lucía `d0080001-…-001`). Preparación como `postgres`, confirmada: un borrador y una
  factura espejo de Lucía insertados a mano (es la entrada del programa, no lo que se prueba), un
  cobro +60 enlazado al registrar, un cobro +25 sin factura y dos devoluciones −40 sin factura. Carreras,
  ambas como `authenticated` admin (`set role` + `request.jwt.claims`):
  1. dos asignaciones del cobro +25 a la factura → exactamente una confirma; la otra **23505
     `cobros_facturas_cobro_unico`**; `count(*) from cobros_facturas where cobro_id = +25` = 1.
  2. las dos devoluciones −40 a la factura (suma enlazada 60) → una confirma; la otra **23514 `la
     devolución supera lo cobrado`**; suma final = 20 ≥ 0.
  Salida `tickets/T-023b/ca4-concurrencia.json`. Confirma filas y **no es idempotente** (exige
  `db reset`), como `t038`. No se añade a `package.json`: se invoca `npx tsx scripts/t023b-concurrencia.mjs`.

### 1.3 Pantalla (`app/(app)/facturacion/*`)

| Fichero | Cambio |
|---|---|
| `esquemas.ts` | `crearEsquemaCobro(hoy)` gana `facturaEspejoId: z.uuid({ error: t('cobros.facturas.facturaNoValida') }).optional()`. `huellaDeCobro` añade `datos.facturaEspejoId ?? null` **al final** del arreglo. Nuevo `esquemaAsignacion = z.object({ cobroId: z.uuid({ error: t('cobros.facturas.eligeCobro') }), facturaEspejoId: z.uuid() })` y su tipo `DatosAsignacion`. |
| `acciones.ts` | `registrarCobro`: inserta `factura_espejo_id: facturaEspejoId ?? null`; mapea 23514 con `la devolución supera lo cobrado` → `{ errores: { importe: [t('cobros.facturas.devolucionSuperaLoCobrado')] } }`; el resto (42501 de T-026a, 23503, 23514 de otro paciente) cae en `fallo()`. Nuevas: `asignarCobroAFactura(datos: unknown): Promise<EstadoFormulario>` y `cargarCobrosAsignables(entrada: unknown): Promise<{ ok: true; cobros: CobroAsignable[]; hayMas: boolean } \| { ok: false }>`. |
| `filtros-facturas.ts` (nuevo, puro) | `leerFiltrosFacturas(parametros: Record<string, string \| string[] \| undefined>, hoy: string): { desde: string; hasta: string; formaPago: FormaDePago \| null; pagina: number; avisos: ('desde' \| 'hasta' \| 'forma' \| 'rango')[] }` y `hrefFacturacion(base: ParametrosFacturacion, cambios: Partial<ParametrosFacturacion>): string`. Por defecto `desde` = día 1 del mes de hace dos meses (anclado a las 12:00, `.claude/rules/fechas.md`), `hasta` = `hoy`. Un valor que no es fecha de calendario, una forma fuera de `FORMAS_DE_PAGO` o `desde > hasta` **no se aplica en silencio**: vuelve al valor por defecto y deja su clave en `avisos` (lección H6 de T-027). Solo lee `desde`, `hasta`, `forma`, `paginaFacturas` (y conserva `profesional`, `pagina`). |
| `datos.ts` | `export const TAMANO_PAGINA_FACTURAS = 20`. `cargarFacturas = cache(async (filtros, profesional: string \| null) => ResultadoFacturas)` llama a `rpc('listado_facturas_espejo', { p_desde, p_hasta, p_forma_pago?, p_profesional_id? (solo si viene, y solo lo pasa el admin vía `cargarContexto`), p_limite: 20, p_desplazamiento })`. Mapea con `aFacturaListada` a un tipo **cerrado** `FacturaListada = { id, pacienteId, nombre, apellidos, fusionado, programa: string, numero, fecha, totalCentimos, url, cobros: CobroDeFactura[], cobrosSinFactura, }` + `total`; `cobros` se valida con un esquema Zod (forma rara → `{ ok: false }`). `programa` = `FICHAS[proveedor]?.nombre ?? t('facturacion.panel.programaGenerico')`. |
| `bloque-facturas.tsx` (nuevo, servidor) | `BloqueFacturas({ searchParams })`: contexto + filtros + `cargarFacturas`; filtro con `next/form` (`action="/facturacion"`, GET): `Desde` y `Hasta` (`type="date"`), `Seleccion` «Forma de pago de sus cobros» con «Todas» + las cinco, `profesional` oculto si lo hay, botón «Filtrar»; avisos de filtro no aplicado; lista de `FilaFactura`; `PaginacionPendientes` con `nombre={t('cobros.facturas.paginacion')}`; `EstadoVacio` y `AvisoDeError` de `bloques.tsx`. |
| `fila-factura.tsx` (nuevo, servidor) | Número, fecha, total, «Emitida en {programa} · nº {numero}», enlace «Ver en {programa}» (`target="_blank" rel="noopener noreferrer"`, `url_proveedor` es https por check de T-026a), nombre del paciente, y la lista de cobros de la app (fecha · importe · forma · referencia; si es negativo, «Devolución: {motivo}»). Sin anotaciones del programa, sin «pagada», sin estado. Monta `AccionesDeFactura` si `!fusionado`. |
| `acciones-factura.tsx` (nuevo, cliente) | Agrupa `RegistrarCobro` (modo factura) y, si `cobrosSinFactura > 0`, `AsignarCobro`. |
| `registrar-cobro.tsx` / `formulario-cobro.tsx` | Prop opcional `factura?: { id: string; numero: string; pacienteId: string; paciente: string }`. Con ella: el disparador se rotula «Registrar cobro» y su **nombre accesible** es `Registrar cobro de la factura {numero}`; el diálogo se titula `Registrar cobro · factura {numero}`; el paciente es texto fijo (sin `Seleccion`), y `pacienteId` y `facturaEspejoId` van en `defaultValues`. Mismo esquema, misma acción. Sin la prop, todo igual que hoy. |
| `asignar-cobro.tsx` (nuevo, cliente) | Botón «Asignar un cobro» (nombre accesible `Asignar un cobro a la factura {numero}`) → `Dialogo` `Asignar un cobro · factura {numero}`; al abrir llama a `cargarCobrosAsignables({ facturaEspejoId })`; `Seleccion` «Cobro» con `fecha · importe · forma · referencia`; si `hayMas`, la nota «Se muestran los 200 más recientes»; envío → `asignarCobroAFactura`; resultado en `role="status"`; error → foco al `Seleccion`; Escape y cierre devuelven el foco al botón (`Dialogo` ya lo hace). Vacío: `cobros.facturas.sinCobrosAsignables`. |
| `paginacion-pendientes.tsx` | Prop opcional `nombre?: string` con valor por defecto `t('cobros.paginacion.nombre')`, **idéntica línea a línea** a la de T-027 (H26), para que el segundo en fusionarse no tenga conflicto que pensar. |
| `bloques.tsx` | `hrefDePagina` pasa a construirse con `hrefFacturacion` y conserva los filtros de facturas. |
| `page.tsx` | Tras la rejilla de dos columnas, `MarcoFacturacion id="facturacion-facturas" titulo={t('cobros.facturas.titulo')}` a ancho completo con `Suspense` + `EsqueletoLista` y `BloqueFacturas`. |

`asignarCobroAFactura`: (1) `exigirSesion`; (2) `esquemaAsignacion.safeParse` → errores de campo;
(3) `supabase.from('cobros_facturas').insert({ cobro_id, factura_espejo_id })` **sin** `.select()` y
**sin** `creada_por`; (4) si 23505 con `cobros_facturas_cobro_unico` o 23514 con `ya está enlazado`:
relee `from('cobros_por_factura').select('factura_espejo_id').eq('cobro_id', cobroId).maybeSingle()`; si
es esta factura → éxito `cobros.facturas.cobroYaEstaba` (reintento idempotente); si es otra →
`cobros.facturas.cobroYaEnlazado`; error de relectura → `cobros.resultadoDesconocido`; (5) 23514
`supera lo cobrado` → `cobros.facturas.devolucionSuperaLoCobrado`; (6) cualquier otro → mensaje
genérico `cobros.facturas.noSePudoAsignar` y `console.error` **solo con el código**; (7)
`revalidatePath('/facturacion')`.

### 1.4 Claves nuevas de `lib/i18n/es.ts`

Todas bajo **`cobros.facturas.*`**, al final del bloque `cobros` (no en `facturacion.*`, que tocan
T-027 y T-046): `titulo` «Facturas del programa», `emitidaEn` «Emitida en {programa} · nº {numero}»,
`verEnPrograma` «Ver en {programa}», `desde`, `hasta`, `formaPago` «Forma de pago de sus cobros»,
`todas`, `filtrar`, `filtroNoAplicado.{desde,hasta,forma,rango}`, `vacio`, `error`, `paginacion`
«Páginas de facturas», `rango`, `sinCobros` «Sin cobros en la app», `devolucion` «Devolución: {motivo}»,
`registrarDeFactura` «Registrar cobro de la factura {numero}», `tituloRegistrar`, `factura` «Factura nº
{numero}», `asignar` «Asignar un cobro», `asignarDeFactura`, `tituloAsignar`, `cobro` «Cobro»,
`eligeCobro`, `facturaNoValida`, `sinCobrosAsignables`, `hayMas`, `cobroAsignado`, `cobroYaEstaba`,
`cobroYaEnlazado` «Ese cobro ya está en una factura», `devolucionSuperaLoCobrado` «La devolución es
mayor que lo cobrado en esta factura», `noSePudoAsignar`, `pacienteSinNombre`. Ninguna contiene
emitir, facturar, expedir, aprobar, «crear factura» ni Verifactu (CA14).

### 1.5 Otros

- `scripts/lint-migraciones.ts`: `'cobros_facturas'` al final de `TABLAS_SOLO_ADICION`.
- `scripts/lint-migraciones.test.ts`: `'cobros_facturas'` en el `it.each` de «marca un delete» (con
  `(T-023b)` en el título) y al final de la lista exacta.
- `lib/supabase/tipos-bd.ts`: **solo** `npx supabase db reset && npm run tipos`.
- `accesibilidad/facturacion.spec.ts`: §3 CA15/CA16.
- `tickets/T-023b/ca10-rendimiento.sql`: §3 CA10.
- `tickets/T-023b/preparar-espejo.sql`: para el guion manual (dos facturas de Lucía y una de un
  paciente del centro del técnico, insertadas como `postgres` con sufijo por `\set`).

---

## 2 · Decisiones y alternativas descartadas

| # | Decisión | Descartado, y por qué |
|---|---|---|
| D1 | **Una vista invoker `cobros_por_factura`** es la única fuente; la aplicación, las dos funciones de lectura y los dos disparadores leen de ella. | (a) Copiar `cobros.factura_espejo_id` a `cobros_facturas` con un disparador *after insert*: dos escrituras por cobro, y el validador de `cobros_facturas` tendría que exonerar su propia copia. (b) RPC que escriba siempre en `cobros_facturas` y revocar la columna: deja muerta una columna de T-026a y obliga a reescribir su banco 31. (c) Función definer en vez de vista invoker: abre una puerta lateral que habría que proteger repitiendo la RLS a mano. |
| D2 | **Cobro contra factura = el mismo `registrarCobro`** con `factura_espejo_id` (una inserción atómica que ya valida T-026a). **Asignar = `cobros_facturas`**. | Registrar y luego asignar: dos viajes, y un fallo entre medias deja un cobro suelto. |
| D3 | **`unique (cobro_id)`** como garantía de «un cobro, una factura» para la vía de asignación; el paso 4 del disparador da el 23514 legible en el caso secuencial. La vía `factura_espejo_id` no necesita candado: el cobro no existe hasta que se confirma y `cobros` no se modifica. | Candado de consejo por cobro: más código para lo que una restricción hace sola. |
| D4 | **Una devolución se puede asignar**, con la cota «la suma de los cobros enlazados a esa factura, incluida esta, no queda por debajo de 0», en **las dos vías** (por eso se redefine la función de T-026a, sin cambiar sus mensajes). Serializada por factura con `pg_advisory_xact_lock`, solo para importes negativos. Pregunta P1. | Prohibir devoluciones: la de una sesión facturada quedaría suelta y la factura enseñaría un cobro que ya no existe. Sin cota: una factura con neto negativo. Cota superior para los positivos: el pendiente es por paciente y el espejo no tiene estado de pago (ADR-077). |
| D5 | **`creada_por`/`creada_en` no los elige nadie**: sin grant de columna, con valor por defecto, forzados por el disparador para `authenticated` y exigidos por la política. | Grant de tabla entera + comprobación: deja elegir columnas (regla de `supabase.md`, T-005). |
| D6 | **42501 idéntico** para cobro inexistente y cobro ajeno, antes de mirar la factura. | Mensajes distintos: oráculo de existencia de cobros. |
| D7 | **Paso 0 deja pasar los nulos** para que muerda el NOT NULL (CA7). | Comprobar nulos en el disparador: CA7 pide expresamente lo contrario. |
| D8 | **El listado es una función invoker paginada** (20 por página, tope 100) que devuelve los cobros en `jsonb` y el recuento total. | Leer la vista desde `datos.ts` con `.in()` de cientos de UUID: URL larga, `max_rows` y una segunda reconstrucción de la unión en TS (CA8). |
| D9 | **El filtro de forma de pago** = «facturas con al menos un cobro de esa forma». No hay parámetro de estado ni en SQL ni en la URL. | «Todos sus cobros de esa forma»: con un cobro mixto la factura desaparecería de las dos búsquedas. |
| D10 | **El selector de profesional del administrador filtra también el listado** (choque 13: una pantalla, un selector). Cambiar de profesional reinicia los filtros de facturas, como hoy reinicia la página. | Ignorarlo en el listado: dos bloques de la misma pantalla con alcances distintos. |
| D11 | **Los cobros asignables se cargan al abrir el diálogo** con una Server Action de lectura (precedente H19), un solo viaje. | Precargarlos por fila: N × M filas en la carga de la página. Diálogo guiado por URL: el foco al cerrar tras una navegación es justo lo que falló en T-007. |
| D12 | **«Asignar» solo aparece si `cobros_sin_factura > 0`**, y ninguna acción en facturas de un paciente absorbido (`paciente_fusionado`). | Botones que llevan a un diálogo vacío o a un rechazo seguro (regla de `interfaz.md`: nada de controles sin acción real detrás). |
| D13 | **Claves en `cobros.facturas.*`.** | `facturacion.*`: es donde escriben T-027 y T-046 a la vez. |
| D14 | **Los botones de fila tienen un nombre accesible propio** («… de la factura {numero}») y el spec existente pasa a `exact: true`. | Mismo nombre que el de la cabecera: modo estricto de Playwright y lectores de pantalla con N botones iguales. |

---

## 3 · Cómo se cierra cada criterio de aceptación

Bloques del banco 33 (cada negativa con `assert_lanza_codigo_msg` y el fragmento exacto, y su gemela):

| Bloque | Contenido |
|---|---|
| A · Forma | Columnas y `not null` de `cobros_facturas`; `cobros_facturas_cobro_unico` existe; `has_column_privilege('authenticated', …, 'insert')` verdadero para `cobro_id` y `factura_espejo_id` y **falso** para `id`, `creada_por`, `creada_en`; sin UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER para `authenticated`, `anon`, `service_role`; `service_role` y `anon` sin SELECT ni INSERT; `cobros_por_factura` con `security_invoker=true` en `reloptions`; `has_function_privilege` de las dos funciones de lectura: `authenticated` sí, `anon` y `service_role` no; `fn_comprobar_devolucion_en_factura`: nadie salvo `postgres`; `pg_get_function_arguments('listado_facturas_espejo')` no contiene `estado`; `pg_get_function_result` no contiene `borrador_id`, `tipo_terapia_id`, `cita_id`, `destinatario`, `linea`, `base`, `cuota`. |
| B · Solo adición | Como ADM (`authenticated`) y como `service_role`: `update … set factura_espejo_id = factura_espejo_id`, `delete`, `truncate` → 42501. Como `postgres` con UPDATE/DELETE devueltos (y revocados al final): el disparador bloquea. `cobertura_solo_adicion()` = 0 filas. `count(*)` igual antes y después. |
| C · Mismo paciente | ADM asigna un cobro nuevo de P2 a ESPA → 23514 `la factura asignada es de otro paciente`, 0 filas. Gemela: cobro nuevo de P1 a ESPA, entra. |
| D · Ya enlazado | (1) Cobro de P1 registrado por ADM **con** `factura_espejo_id = ESPA` (vía T-026a) y luego asignado → 23514 `el cobro ya está enlazado`. (2) COB1 (asignado en la fijación) asignado otra vez → 23514 `el cobro ya está enlazado` (no 23505: el disparador va antes). Gemela: un cobro suelto de P1 entra. |
| E · Permisos | PRO2 con cobro de P1 y factura inexistente → 42501 (no 23503); PRO2 con cobro de P1 y ESPB → 42501 (no 23514); TEC2 con cobro de P1 → 42501; ADM con cobro inexistente → 42501. **Los cuatro `sqlerrm` son iguales** (un `do` que los captura y compara). `anon` y `service_role` → 42501 por privilegio. Como `postgres`: factura inexistente → 23503 `la factura asignada no existe`; cobro inexistente → 23503 `el cobro asignado no existe`. Gemelas: ADM, PRO1 (P1) y TEC1 (P1, centro A) asignan cada uno un cobro suelto de P1 a ESPA. |
| F · Columnas | Como ADM: insert con `creada_por = PRO2` → 42501 y 0 filas con ese `creada_por`; con `id` explícito → 42501; con `creada_en` explícito → 42501. Gemela: sin ellas → `creada_por = ADM` y `creada_en = now()`. |
| G · Nulos | Como ADM: `cobro_id` nulo → **23502** con `cobro_id` en el mensaje; `factura_espejo_id` nulo → **23502** con `factura_espejo_id`. Gemela: los dos con valor, entra. |
| H · Lectura única | Sobre ESPA, el cobro de D(1) (`al_registrar`) y uno de las gemelas (`asignado`) salen **una vez cada uno** en `cobros_por_factura` (`count(*) = count(distinct cobro_id)` y las dos `via`); los mismos dos en el `jsonb` de `listado_facturas_espejo` para ADM, PRO1 y TEC1; PRO2 y TEC2 no ven ninguno; `anon` no puede leer la vista. |
| I · Pendiente | Como ADM, `pendiente_centimos`, `cobrado_centimos` y `devengado_centimos` de P1 leídos antes y después de asignar dos cobros sueltos de P1 a ESPA: iguales. |
| J · Devoluciones | Con lo enlazado a ESPA conocido (`select sum` como postgres): una devolución de P1 que deja la suma en ≥ 0 entra por asignación; otra que la deja < 0 → 23514 `la devolución supera lo cobrado`; lo mismo por registro con `factura_espejo_id` (negativa y gemela). La suma final nunca < 0. |
| K · Listado y filtros | TEC1 ve ESPA y no ESPB; TEC2 al revés; PRO1 ESPA; PRO2 ESPB; ADM las dos. `p_desde = p_hasta = current_date` incluye ESPA; `p_desde = current_date + 1` la excluye. `p_forma_pago = 'efectivo'` incluye ESPA (COB1); `'bizum'` la excluye hasta que se le asigna un cobro bizum, y entonces la incluye. ESPB sin cobros no sale con ninguna forma. `p_profesional_id = PRO2` como ADM: solo ESPB. `p_limite = 1000` devuelve ≤ 100 y `total_filas` es el total filtrado. |
| L · Asignables y auditoría | `cobros_asignables(ESPA)` como ADM: cobros sueltos de P1, ninguno enlazado; como PRO2 y TEC2: 0 filas. Cada inserción deja una fila en `auditoria` con `tabla = 'cobros_facturas'`. |

**Mutantes** (se miden a mano, se guardan en `tickets/T-023b/mutantes.json`; cada uno debe poner el
banco en rojo **en el bloque indicado** y el original volver a verde):

| # | Mutación | Cae en |
|---|---|---|
| M1 | Quitar el paso 1 (permisos) | E (23503/23514 donde se espera 42501) |
| M2 | Pasos 2-3 antes del 1 | E |
| M3 | Quitar el paso 4 | D (23505 en vez de 23514; D(1) entra) |
| M4 | Quitar el paso 0 | G (42501 en vez de 23502) |
| M5 | Quitar la llamada a `fn_comprobar_devolucion_en_factura` en cualquiera de las dos funciones | J |
| M6 | `security_invoker = false` en la vista | H (PRO2 ve los cobros de ESPA) |
| M7 | `grant insert` de tabla entera | A y F |
| M8 | Quitar `cobros_facturas_cobro_unico` | `t023b-concurrencia` carrera 1 (dos filas) |
| M9 | Quitar `pg_advisory_xact_lock` | `t023b-concurrencia` carrera 2 (suma −20) |

| CA | Cómo se demuestra |
|---|---|
| **CA1** | `npx supabase db reset` sin errores; `select max(version) from supabase_migrations.schema_migrations` → `20261016120000` **en la rama, justo antes de verificar**; `npm run lint:migraciones` → 0 hallazgos; `npx vitest run scripts/lint-migraciones.test.ts` verde con el caso `cobros_facturas`. |
| **CA2** | Bloque B + `10-solo-adicion` (que ahora recorre `cobros_facturas` con la fila de la fijación) + `select count(*) from public.cobertura_solo_adicion()` = 0. |
| **CA3** | Bloque C. |
| **CA4** | Bloque D (secuencial) + `npx tsx scripts/t023b-concurrencia.mjs` tras `db reset` → `tickets/T-023b/ca4-concurrencia.json` con una confirmada y un 23505 en la carrera 1. M8 en `mutantes.json`. |
| **CA5** | Bloque E (incluida la igualdad de los cuatro mensajes) + M1, M2. |
| **CA6** | Bloques A y F + `acciones.test.ts`: el objeto de `insert` de `asignarCobroAFactura` es exactamente `{ cobro_id, factura_espejo_id }`. |
| **CA7** | Bloque G + M4. |
| **CA8** | Bloque H. Grep en la evidencia: `grep -rnE "cobros_facturas\|factura_espejo_id" "app/" --include=*.ts --include=*.tsx \| grep -v "\.test\."` → solo (1) la clave `factura_espejo_id` del `insert` de `registrarCobro`, (2) `.from('cobros_facturas').insert({ cobro_id, factura_espejo_id })` en `asignarCobroAFactura` y (3) la relectura `from('cobros_por_factura').select('factura_espejo_id')`; y `grep -rnE "from\('cobros'\)[^;]*factura_espejo_id" "app/"` → vacío. |
| **CA9** | Bloque I. |
| **CA10** | `tickets/T-023b/ca10-rendimiento.sql`, ejecutado como `postgres` dentro de `begin … rollback` (`docker exec -i <supabase_db_*> psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < tickets/T-023b/ca10-rendimiento.sql > tickets/T-023b/ca10-explain.txt`). Genera con `insert … select generate_series`: 200 pacientes en CA y CB, **5 000 citas realizadas** (los disparadores de `citas` no muerden a `postgres`, H7 de `tickets/T-047/diseno.md`), **300 facturas espejo** (con su borrador), 2 000 cobros, 300 enlazados al registrar y 300 asignados. Como ADM y como TEC1: `explain (analyze, buffers)` de `select * from pendiente_paciente`, de `listado_facturas_espejo(hoy − 90, hoy)` página 1, con `p_forma_pago = 'efectivo'`, y de `cobros_asignables`. **Umbrales** (medidos con `clock_timestamp()` en un `do` que lanza si se pasan): `pendiente_paciente` completo ≤ **500 ms**; una página del listado ≤ **150 ms**; `cobros_asignables` ≤ **50 ms**. Si alguno se pasa, se dice en la bitácora, se añade el índice que el plan pida y se mide otra vez (antes y después en la evidencia). |
| **CA11** | Bloque K (técnico por centros; firma de la función sin columnas prohibidas) + `datos.test.ts` (`Object.keys` de `aFacturaListada` es la lista cerrada) + spec paso 10: como `tecnico@psicogestion.test`, con `page.on('response')` sobre el documento de `/facturacion`, los fetch RSC y el POST de la acción al abrir «Asignar», ningún cuerpo contiene `tipo_terapia_id`, `cita_id`, `borrador_id`, `destinatario` ni `"lineas"`. |
| **CA12** | `fila-factura.test.tsx`: ningún `textbox`/`spinbutton`/`combobox` dentro de la fila salvo los de los diálogos; ningún texto `/pagad\|estado\|rectific\|anulad/i` en el bloque; total y número son texto. |
| **CA13** | Bloque K (semántica de fechas y forma) + `filtros-facturas.test.ts` (por defecto, valores inválidos con aviso, `?estado=pagada` no cambia nada) + `bloque-facturas.test.tsx` (el formulario tiene exactamente tres controles con nombre: Desde, Hasta, Forma de pago de sus cobros) + `datos.test.ts` (los parámetros de la RPC). |
| **CA14** | `git diff main...HEAD -U0 -- "app/(app)/facturacion" lib/i18n/es.ts \| grep '^+' \| grep -v '^+++' \| grep -niE "\b(emitir\|facturar\|expedir\|aprobar\|crear factura\|verifactu)\b"` → vacío (y el grep literal del contrato sobre los ficheros nuevos). `fila-factura.test.tsx`: «Emitida en Holded · nº F-2026-0001». |
| **CA15** | Guion manual con `tickets/T-023b/preparar-espejo.sql`, como `tecnico@` y como `admin@`, a 360 px; notas y capturas en la bitácora. Lo automatizable del 360 px va en el spec (pasos 6-9). |
| **CA16** | `npm test`, `npm run test:a11y`, `npm run test:rls`, `npm run lint`, `npx next build --webpack` (junction, state.md), `node ~/.claude/pipeline/territorio.mjs T-023b` en el worktree. |

**Spec `accesibilidad/facturacion.spec.ts`** (sigue en serie y como admin salvo el paso 10):
- Pasos 1-5 existentes: todos los `getByRole` de «Registrar cobro» con `exact: true`.
- `beforeAll`: con `ejecutarSql(contenedorDelProyecto(), guion)` (patrón de `avisos.spec.ts`), como
  `postgres`, un borrador y una factura espejo de **Sofía Nieto** (`seed-completo.sql:256`, de Ana, centro Madrid explícito, el del técnico), localizada por `nombre = 'Sofía' and apellidos = 'Nieto'`, con
  `proveedor_documento_id = 'E2E-T023b-<Date.now()>'` y `numero = 'E2E-<Date.now()>'`. Se queda (solo
  adición), como el cobro de 0,01 € del paso 4; el comentario de cabecera lo dice.
- 6 · A 360 px el bloque «Facturas del programa» no desborda; la fila de la factura E2E dice «Emitida en
  … · nº E2E-…»; el enlace «Ver en …» tiene `rel` con `noopener`; los botones de la fila miden ≥ 44 px.
- 7 · «Registrar cobro de la factura E2E-…»: el diálogo cabe, no hay combobox «Paciente», se registra
  0,01 € en efectivo y el cobro aparece bajo la fila.
- 8 · «Asignar un cobro a la factura E2E-…»: se asigna el cobro suelto que `beforeAll` inserta como `postgres` (Sofía, 0,01 €, efectivo, `current_date`, `registrado_por` = admin del seed, `referencia = 'E2E-T023b-<ts>'`), elegido por esa referencia; se asigna; aparece bajo la fila; al reabrir ya no se ofrece; Escape
  devuelve el foco al botón.
- 9 · `?forma=bizum` oculta la fila; `?forma=efectivo` la muestra; `?forma=xyz` muestra el aviso y no
  filtra.
- 10 · Técnico: ve la fila; CA11 sobre las respuestas.

---

## 4 · Riesgos, por probabilidad

1. **Alta — el spec existente se rompe** por los nombres accesibles de la fila (H22). Mitigación: `exact: true` y nombres propios (D14).
2. **Alta — conflictos con T-027 y T-046**: `page.tsx`, `page.test.tsx`, `paginacion-pendientes.tsx`, `lib/i18n/es.ts` y el sello de la migración. Mitigación: claves en `cobros.facturas.*`, la prop `nombre` idéntica a la de T-027, y si T-023b se fusiona antes que T-046, intercambio de sellos **antes** de implementar; `max(version)` en la rama antes de verificar.
3. **Media — `10-solo-adicion` en rojo** si la fijación no deja una fila en `cobros_facturas` (H11).
4. **Media — T-046 cambia cómo nace un borrador** (H27, sin verificar): los scripts que insertan borradores a mano pueden romperse tras su fusión. Mitigación: leer su migración antes de escribir los scripts.
4b. **Media — la fila de la fijación (COB1 → ESPA) mueve recuentos** de módulos posteriores (auditoría, listados). Mitigación: banco entero en la rama frente a `main`, módulo por módulo.
5. **Media — redefinir la función de T-026a cambia su comportamiento.** Mitigación: copia literal + una línea; `31` debe quedar verde sin tocarlo; el revisor hace `diff` del cuerpo.
6. **Media — CA10 se pasa en Docker sobre Windows.** Mitigación: índices de (a); medir y decir.
7. **Baja — el candado no sirve fuera de READ COMMITTED.** PostgREST usa READ COMMITTED; en REPEATABLE READ la segunda devolución chocaría por serialización, no se colaría. Comentario en la función.
8. **Baja — falso rojo en CA11** si el armazón de la app manda alguna de esas cadenas por otra razón. Si pasa, es un hallazgo de verdad: se anota y se acota la aserción a las respuestas de la página, sin quitarla.
9. **Baja — `count(*) over ()` con subconsultas por fila** si se escribe en un solo paso: por eso el CTE materializado (las subconsultas solo para la página).
10. **Baja — fusiones**: un cobro del superviviente no se asigna a una factura del absorbido (igualdad estricta, como T-026a). Pregunta P2.

---

## 5 · Qué revisar

**Lo que elige el llamante, y su efecto**
- [ ] `authenticated` solo puede mandar `cobro_id` y `factura_espejo_id` a `cobros_facturas`. Mandar `id`, `creada_por` o `creada_en` da 42501 sin fila (bloque F). El disparador además **pisa** `creada_por` y `creada_en`.
- [ ] `registrarCobro` acepta `facturaEspejoId` del cliente: la base decide (paciente igual, factura visible por la réplica de `cobros_alta`, cota de devoluciones). La acción no confía en el `pacienteId` de la fila más que antes.
- [ ] `listado_facturas_espejo`: `p_profesional_id` solo **estrecha** dentro de lo que ya deja ver la cabecera; `datos.ts` solo lo pasa si el rol es administrador. `p_limite` está topado a 100 en SQL. `p_desde`/`p_hasta` nulos → ninguna fila, no todo.
- [ ] `cobros_asignables(p_factura_espejo_id)`: con una factura que no se ve, la subconsulta de la cabecera da nulo y no sale nada (bloque L).

**Qué prueba debe fallar y por qué motivo exacto**
- [ ] Cada negativa usa `assert_lanza_codigo_msg` con el **fragmento** del paso que dice probar; ningún fragmento es prefijo de otro ni de los de T-026a (`la factura asignada …` frente a `la factura del cobro …`).
- [ ] Bloque E: el 42501 sale **antes** de que exista ninguna lectura de la factura (orden del cuerpo) y los cuatro mensajes son **idénticos**.
- [ ] Bloque G: el 23502 viene del NOT NULL; con M4 sale 42501 y el banco cae.
- [ ] D(2): COB1 reasignado da 23514 del disparador, no 23505 de la restricción.
- [ ] Los nueve mutantes están medidos en `mutantes.json` con el bloque que cae.

**Invariantes por otras puertas**
- [ ] **Null**: paso 0 + NOT NULL. **Duplicados**: `cobros_facturas_cobro_unico` + paso 4 por la vista (cubre la vía `factura_espejo_id`). **Concurrencia**: carrera 1 (restricción) y carrera 2 (candado) en `ca4-concurrencia.json`.
- [ ] **Permisos de tabla entera**: `\dp public.cobros_facturas` y `\dp public.cobros_por_factura` en la evidencia; ni TRUNCATE, ni TRIGGER, ni REFERENCES a nadie; `service_role` sin nada.
- [ ] **TRUNCATE**: capa 3 presente y `cobertura_solo_adicion()` = 0.
- [ ] **Puerta lateral**: la vista es **invoker** (`reloptions`), las funciones de lectura son **invoker**, la única definer nueva es el disparador (y la redefinida de T-026a). `fn_comprobar_devolucion_en_factura` no la ejecuta nadie más que `postgres`.
- [ ] **La función de T-026a**: `diff` de su cuerpo con `20261014120000_proveedor_facturacion.sql:1021-1050` = solo la línea del `perform`. El banco 31 sigue verde sin tocarlo.
- [ ] **Una sola fuente**: el grep de CA8, y que ni `listado_facturas_espejo`, ni `cobros_asignables`, ni los disparadores lean `cobros.factura_espejo_id` o `cobros_facturas` para responder «qué cobros son de esta factura» sin pasar por `cobros_por_factura` (la excepción legítima: el paso 4 mira `v_cobro.factura_espejo_id` del propio cobro).
- [ ] **El pendiente no cambia**: `pendiente_paciente` no se toca en la migración (grep) y el bloque I.

**Pantalla**
- [ ] Ningún `"use client"` lee datos; los cobros asignables viajan por la acción con la lista cerrada de campos.
- [ ] El filtro inválido no se aplica en silencio (avisos); no existe `?estado` en ningún sitio.
- [ ] La fila no enseña nada del programa salvo número, fecha, total y enlace; ni anotaciones, ni «pagada».
- [ ] `huellaDeCobro` incluye la factura: dos envíos iguales a facturas distintas no comparten clave.
- [ ] Nombres accesibles de los botones de fila únicos; foco al cerrar los dos diálogos; 44 px.

---

## 6 · Territorio

Escrito **sin comentarios en la línea** (state.md: `territorio.mjs` no los entiende):

```
territorio:
  - supabase/migrations/20261016120000_cobros_facturas.sql
  - scripts/rls/01-fijacion.sql
  - scripts/rls/11-cobertura.sql
  - scripts/rls/33-cobros-facturas.sql
  - scripts/rls/README.md
  - scripts/lint-migraciones.ts
  - scripts/lint-migraciones.test.ts
  - scripts/t023b-concurrencia.mjs
  - scripts/t023b-concurrencia.sql
  - lib/supabase/tipos-bd.ts
  - app/(app)/facturacion/*
  - lib/i18n/es.ts
  - accesibilidad/facturacion.spec.ts
  - tickets/T-023b/**
  - docs/bitacora/T-023b*.md
  - docs/state.md
```

Cambios frente al provisional: **fuera** `scripts/rls/00-ayudantes.sql` (no hace falta ningún ayudante);
**dentro** los dos ficheros de la carrera; `app/(app)/facturacion/**` pasa a **`app/(app)/facturacion/*`**
para no pisar `app/(app)/facturacion/bonos/**`, que es de T-027.

Solapes que el orquestador debe secuenciar: T-027 (`page.tsx`, `page.test.tsx`,
`paginacion-pendientes.tsx`, `es.ts`) y T-046 (`es.ts`, sello de migración). `lib/facturacion/registro.ts`
se **importa** (`FICHAS`), no se escribe.

---

## 7 · Delegable

nada — el contrato dice `delegable: no` (dinero, RLS y una tabla de solo adición).

---

## Preguntas al propietario

No bloquean: el diseño sigue con la recomendación y cambiarla es local.

- **P1 · Devoluciones contra una factura.** ¿Se puede asignar una devolución a una factura, y hasta
  cuánto? *Recomendación (la diseñada)*: sí, mientras lo cobrado neto de esa factura no quede por debajo
  de cero. Alternativas: prohibirlo (la devolución queda suelta) o sin límite.
- **P2 · Facturas de un paciente absorbido por una fusión.** Se listan, pero sin «Registrar cobro» ni
  «Asignar» (igualdad estricta de paciente, como T-026a). *Recomendación*: así; si un día hace falta
  cobrar contra la factura del absorbido desde el superviviente, se relaja en las dos funciones a la vez
  y en un ticket propio.
- **P3 · Rango por defecto del listado.** *Recomendación*: el mes en curso y los dos anteriores, con
  fecha de expedición; cambiable con «Desde» y «Hasta».

---

## Lo que no entra, y por qué

- **Desasignar o corregir una asignación**: lo excluye el contrato; sería una anotación de solo adición con su propio ticket.
- **El pendiente que cuenta lo facturado** (opción (i)): descartado por P1 de T-023.
- **Estado de pago, «pagada», anotaciones del programa (rectificada, anulada) en la fila**: ADR-077 y CA12; las anotaciones son de la ficha (T-026a/T-046).
- **Facturas de bono**: T-027; no llegan al espejo.
- **La pestaña Facturación de la ficha**: T-026a/T-046. Si T-046 necesita los cobros de una factura, los lee de `cobros_por_factura` (anotar en su diseño).
- **«Últimos cobros» con su factura**: el contrato no lo pide.
- **Base imponible e IVA en la fila**: el contrato pide total; la cabecera los tiene si un día se piden.
- **`npm run test:rls` del hallazgo de T-023 (`cobros_alta` admite paciente fusionado)**: fuera de alcance; sigue en `state.md`.
- **Atajo `package.json` para la carrera**: no se añade dependencia ni script; se invoca con `npx tsx`.

## Respuestas del propietario (16-10-2026)

- **P1**: sí, una devolución se puede asignar a una factura mientras lo cobrado en ella no baje de 0 (la recomendación).
- **P2**: las facturas de un paciente absorbido se listan sin acciones, con igualdad estricta de paciente (la recomendación).
- **P3**: el listado muestra por defecto el mes en curso y los dos anteriores (la recomendación).
- **Diseño aprobado**. La implementación arranca cuando T-046 libere la base local compartida.
- **H27 (para el implementador)**: el disparador `validar_citas_version_borrador` de T-046 solo actúa para `authenticated` y `anon` (`tickets/T-046/diseno.md`). Los scripts que insertan borradores como `postgres` no lo disparan, pero hay que comprobarlo con T-046 ya fusionado.
